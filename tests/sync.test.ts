import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { HifzDB } from '@/lib/store/db'
import { exportBackup, importBackup, loadAll, recordDeclaration, recordFlow, recordReview, saveSettings, saveTarget, saveMarker } from '@/lib/store/repo'
import { OwnerMismatchError, pendingCount, syncOnce } from '@/lib/store/sync'
import { DEFAULT_SETTINGS, type ReviewEvent } from '@/lib/engine/types'
import { FakeServer } from './fakeRemote'
import { NOW, review } from './helpers'

let n = 0
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const ev = (over: Partial<ReviewEvent> = {}): ReviewEvent => ({ ...review([1, 1, 1], 'independent', NOW), id: uid(), ...over })
let dbs = 0
const freshDb = () => new HifzDB(`test-${Date.now()}-${++dbs}`)
const USER = 'user-aaaa'

describe('sync: idempotent, no duplicates', () => {
  let server: FakeServer
  let db: HifzDB
  beforeEach(() => { server = new FakeServer(); db = freshDb() })

  it('pushes new events once and marks them synced', async () => {
    for (let i = 0; i < 5; i++) await recordReview(db, ev())
    expect(await pendingCount(db)).toBe(5)
    const r = await syncOnce(db, server.remoteFor(USER))
    expect(r.pushed).toBe(5)
    expect(server.all('review_events')).toHaveLength(5)
    expect(await pendingCount(db)).toBe(0)
    await syncOnce(db, server.remoteFor(USER))
    expect(server.all('review_events')).toHaveLength(5)
  })

  it('does not duplicate when the server saved the rows but the response was lost', async () => {
    const e = ev()
    await recordReview(db, e)
    server.dropAck = true
    await expect(syncOnce(db, server.remoteFor(USER))).rejects.toThrow()
    expect(server.all('review_events')).toHaveLength(1)
    expect(await pendingCount(db)).toBe(1) // client doesn't know it succeeded
    await syncOnce(db, server.remoteFor(USER))
    await syncOnce(db, server.remoteFor(USER))
    expect(server.all('review_events')).toHaveLength(1)
    expect(await pendingCount(db)).toBe(0)
  })

  it('keeps working offline and uploads everything on reconnection', async () => {
    server.offline = true
    for (let i = 0; i < 12; i++) await recordReview(db, ev())
    await recordDeclaration(db, { id: uid(), range: { surah: 1, start: 1, end: 7 }, level: 'known', occurredAt: NOW })
    await expect(syncOnce(db, server.remoteFor(USER))).rejects.toThrow()
    expect(await pendingCount(db)).toBe(13)
    expect((await loadAll(db)).reviews).toHaveLength(12) // local state intact while offline
    server.offline = false
    await syncOnce(db, server.remoteFor(USER))
    expect(server.all('review_events')).toHaveLength(12)
    expect(server.all('declarations')).toHaveLength(1)
    expect(await pendingCount(db)).toBe(0)
  })

  it('converges two devices with every event present exactly once', async () => {
    const dbB = freshDb()
    const a = [ev(), ev(), ev()]
    const b = [ev(), ev()]
    for (const e of a) await recordReview(db, e)
    for (const e of b) await recordReview(dbB, e)
    await recordFlow(db, { id: uid(), surah: 1, ayah: 1, fromPhrase: 0, toPhrase: 0, phraseCount: 1, rating: 'natural', reps: 3, durationMs: 1000, occurredAt: NOW })
    for (let i = 0; i < 2; i++) { await syncOnce(db, server.remoteFor(USER)); await syncOnce(dbB, server.remoteFor(USER)) }
    const sa = await loadAll(db)
    const sb = await loadAll(dbB)
    expect(sa.reviews.map((e) => e.id).sort()).toEqual([...a, ...b].map((e) => e.id).sort())
    expect(sb.reviews.map((e) => e.id).sort()).toEqual(sa.reviews.map((e) => e.id).sort())
    expect(sb.flows).toHaveLength(1)
    expect(server.all('review_events')).toHaveLength(5)
  })

  it('never lets a re-pushed event change what the server already holds (append-only)', async () => {
    const e = ev({ grade: 'independent' })
    await recordReview(db, e)
    await syncOnce(db, server.remoteFor(USER))
    await db.reviews.update(e.id, { grade: 'failed', synced: 0 })     // simulate local tampering
    await syncOnce(db, server.remoteFor(USER))
    expect(server.all('review_events')[0]!.grade).toBe('independent')
  })

  it('quarantines a permanently rejected row without blocking the rest', async () => {
    await recordReview(db, ev())
    await recordReview(db, ev())
    await db.reviews.add({ ...ev({ range: { surah: 200, start: 1, end: 1 } }), synced: 0 } as never)
    const r = await syncOnce(db, server.remoteFor(USER))
    expect(r.pushed).toBe(2)
    expect(r.quarantined).toBe(1)
    expect(server.all('review_events')).toHaveLength(2)
    expect(await pendingCount(db)).toBe(0)
  })

  it('refuses to sync a different account into a device bound to another', async () => {
    await recordReview(db, ev())
    await syncOnce(db, server.remoteFor('user-one'))
    await expect(syncOnce(db, server.remoteFor('user-two'))).rejects.toBeInstanceOf(OwnerMismatchError)
    expect(server.all('review_events').every((r) => r.user_id === 'user-one')).toBe(true)
  })

  it('syncs mutable records last-writer-wins and keeps newer unsynced local edits', async () => {
    const t = { id: uid(), range: { surah: 112, start: 1, end: 4 }, status: 'active' as const, createdAt: NOW, updatedAt: NOW, label: 'first' }
    await saveTarget(db, t)
    await syncOnce(db, server.remoteFor(USER))
    const dbB = freshDb()
    await syncOnce(dbB, server.remoteFor(USER))
    expect((await loadAll(dbB)).targets[0]!.label).toBe('first')
    await saveTarget(dbB, { ...t, label: 'from B', updatedAt: NOW + 1000 })
    await saveTarget(db, { ...t, label: 'stale A', updatedAt: NOW + 500 })
    await syncOnce(dbB, server.remoteFor(USER))
    await syncOnce(db, server.remoteFor(USER))        // A's older write is rejected; A then pulls B's newer one
    await syncOnce(dbB, server.remoteFor(USER))
    expect(server.all('learning_targets')).toHaveLength(1)
    expect(server.all('learning_targets')[0]!.label).toBe('from B')
    expect((await loadAll(db)).targets[0]!.label).toBe('from B')
  })

  it('syncs phrase markers by verse and settings through the profile row', async () => {
    await saveMarker(db, { id: '2:255', surah: 2, ayah: 255, boundaries: [3, 7], source: 'user', updatedAt: NOW })
    await saveSettings(db, { ...DEFAULT_SETTINGS, minutes: 35, updatedAt: NOW })
    await syncOnce(db, server.remoteFor(USER))
    const dbB = freshDb()
    await syncOnce(dbB, server.remoteFor(USER))
    const s = await loadAll(dbB)
    expect(s.markers[0]).toMatchObject({ surah: 2, ayah: 255, boundaries: [3, 7] })
    expect(s.settings.minutes).toBe(35)
  })
})

describe('local store', () => {
  it('rejects overwriting an event with the same id', async () => {
    const db = freshDb()
    const e = ev()
    await recordReview(db, e)
    await expect(recordReview(db, { ...e, grade: 'failed' })).rejects.toThrow()
    expect((await loadAll(db)).reviews[0]!.grade).toBe('independent')
  })
  it('rejects invalid events before they reach the log', async () => {
    const db = freshDb()
    await expect(recordReview(db, ev({ range: { surah: 0, start: 1, end: 1 } }))).rejects.toThrow()
    await expect(recordReview(db, { ...ev(), cueLevel: 9 as never })).rejects.toThrow()
  })
  it('exports and restores without loss or duplication', async () => {
    const a = freshDb()
    for (let i = 0; i < 4; i++) await recordReview(a, ev())
    await recordDeclaration(a, { id: uid(), range: { surah: 112, start: 1, end: 4 }, level: 'known', occurredAt: NOW })
    const backup = JSON.parse(JSON.stringify(await exportBackup(a)))
    const b = freshDb()
    expect(await importBackup(b, backup)).toEqual({ added: 5, skipped: 0 })
    expect(await importBackup(b, backup)).toEqual({ added: 0, skipped: 5 })
    expect((await loadAll(b)).reviews).toHaveLength(4)
    await expect(importBackup(b, { app: 'other' })).rejects.toThrow()
  })
})
