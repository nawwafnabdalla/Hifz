// Idempotent two-way sync between IndexedDB and the server.
//
//  * Push: rows with synced=0. Event tables use INSERT .. ON CONFLICT DO NOTHING keyed by the
//    client-generated UUID, so a retry after a lost response can never duplicate an event.
//  * Pull: rows with seq greater than a per-table cursor (minus a small overlap, which is safe
//    because applying a row is idempotent).
//  * A row the server permanently rejects is quarantined, not retried forever, and reported.
//  * The device is bound to one account; syncing a different account's session is refused.
import { z } from 'zod'
import type { HifzDB, Stored, TableKey } from './db'
import { TABLE_KEYS } from './db'
import {
  declarationSchema, experimentSchema, flowEventSchema, markerSchema, reviewEventSchema, sessionSchema, targetSchema, settingsSchema,
} from './schemas'
import type { Settings } from '@/lib/engine/types'

export class RemoteError extends Error {
  constructor(message: string, public permanent: boolean, public code?: string) {
    super(message)
    this.name = 'RemoteError'
  }
}
export class OwnerMismatchError extends Error {
  constructor() {
    super('This device holds data that belongs to a different account.')
    this.name = 'OwnerMismatchError'
  }
}

export interface Remote {
  userId(): string
  upsert(table: string, rows: Record<string, unknown>[], opts: { onConflict: string; ignoreDuplicates: boolean }): Promise<void>
  pull(table: string, afterSeq: number, limit: number): Promise<Record<string, unknown>[]>
}

const iso = (ms: number) => new Date(ms).toISOString()
const ms = (s: unknown) => Date.parse(String(s))
const orNull = <T,>(v: T | undefined | null) => (v === undefined ? null : v)
const orUndef = <T,>(v: T | null | undefined) => (v === null ? undefined : v)

interface Spec {
  key: TableKey
  remote: string
  immutable: boolean
  conflict: string
  toRow(x: any): Record<string, unknown>
  fromRow(r: any): unknown | null
}

const parse = <T,>(schema: z.ZodType<T>, v: unknown): T | null => {
  const r = schema.safeParse(v)
  return r.success ? r.data : null
}

export const SPECS: Spec[] = [
  {
    key: 'reviews', remote: 'review_events', immutable: true, conflict: 'id',
    toRow: (e) => ({
      id: e.id, kind: e.kind, surah: e.range.surah, ayah_start: e.range.start, ayah_end: e.range.end, grade: e.grade, context: e.context,
      cue_level: e.cueLevel, stumbles: e.stumbles, shaky_junctions: e.shakyJunctions, completed_to: orNull(e.completedTo),
      duration_ms: e.durationMs, occurred_at: iso(e.occurredAt), session_id: orNull(e.sessionId), strategy: orNull(e.strategy),
      experiment_id: orNull(e.experimentId), listened_first: orNull(e.listenedFirst),
    }),
    fromRow: (r) => parse(reviewEventSchema, {
      id: r.id, kind: r.kind, range: { surah: r.surah, start: r.ayah_start, end: r.ayah_end }, grade: r.grade, context: r.context,
      cueLevel: r.cue_level, stumbles: r.stumbles, shakyJunctions: r.shaky_junctions, completedTo: orUndef(r.completed_to),
      durationMs: r.duration_ms, occurredAt: ms(r.occurred_at), sessionId: orUndef(r.session_id), strategy: orUndef(r.strategy),
      experimentId: orUndef(r.experiment_id), listenedFirst: orUndef(r.listened_first),
    }),
  },
  {
    key: 'flows', remote: 'flow_events', immutable: true, conflict: 'id',
    toRow: (e) => ({
      id: e.id, surah: e.surah, ayah: e.ayah, from_phrase: e.fromPhrase, to_phrase: e.toPhrase, phrase_count: e.phraseCount,
      rating: e.rating, reps: e.reps, duration_ms: e.durationMs, occurred_at: iso(e.occurredAt), session_id: orNull(e.sessionId),
      strategy: orNull(e.strategy), experiment_id: orNull(e.experimentId), listened_first: orNull(e.listenedFirst),
    }),
    fromRow: (r) => parse(flowEventSchema, {
      id: r.id, surah: r.surah, ayah: r.ayah, fromPhrase: r.from_phrase, toPhrase: r.to_phrase, phraseCount: r.phrase_count,
      rating: r.rating, reps: r.reps, durationMs: r.duration_ms, occurredAt: ms(r.occurred_at), sessionId: orUndef(r.session_id),
      strategy: orUndef(r.strategy), experimentId: orUndef(r.experiment_id), listenedFirst: orUndef(r.listened_first),
    }),
  },
  {
    key: 'declarations', remote: 'declarations', immutable: true, conflict: 'id',
    toRow: (e) => ({ id: e.id, surah: e.range.surah, ayah_start: e.range.start, ayah_end: e.range.end, level: e.level, note: orNull(e.note), occurred_at: iso(e.occurredAt) }),
    fromRow: (r) => parse(declarationSchema, { id: r.id, range: { surah: r.surah, start: r.ayah_start, end: r.ayah_end }, level: r.level, note: orUndef(r.note), occurredAt: ms(r.occurred_at) }),
  },
  {
    key: 'sessions', remote: 'study_sessions', immutable: false, conflict: 'id',
    toRow: (e) => ({
      id: e.id, started_at: iso(e.startedAt), ended_at: e.endedAt === null ? null : iso(e.endedAt), planned_minutes: Math.round(e.plannedMinutes),
      plan_snapshot: orNull(e.planSnapshot), summary: orNull(e.summary), updated_at: iso(e.updatedAt),
    }),
    fromRow: (r) => parse(sessionSchema, {
      id: r.id, startedAt: ms(r.started_at), endedAt: r.ended_at === null ? null : ms(r.ended_at), plannedMinutes: r.planned_minutes ?? 1,
      planSnapshot: orUndef(r.plan_snapshot), summary: orUndef(r.summary), updatedAt: ms(r.updated_at),
    }),
  },
  {
    key: 'targets', remote: 'learning_targets', immutable: false, conflict: 'id',
    toRow: (e) => ({ id: e.id, surah: e.range.surah, ayah_start: e.range.start, ayah_end: e.range.end, status: e.status, label: orNull(e.label), updated_at: iso(e.updatedAt), created_at: iso(e.createdAt) }),
    fromRow: (r) => parse(targetSchema, { id: r.id, range: { surah: r.surah, start: r.ayah_start, end: r.ayah_end }, status: r.status, label: orUndef(r.label), updatedAt: ms(r.updated_at), createdAt: ms(r.created_at) }),
  },
  {
    key: 'markers', remote: 'phrase_markers', immutable: false, conflict: 'user_id,surah,ayah',
    toRow: (e) => ({ surah: e.surah, ayah: e.ayah, boundaries: e.boundaries, updated_at: iso(e.updatedAt) }),
    fromRow: (r) => parse(markerSchema, { id: `${r.surah}:${r.ayah}`, surah: r.surah, ayah: r.ayah, boundaries: r.boundaries, source: 'user', updatedAt: ms(r.updated_at) }),
  },
  {
    key: 'experiments', remote: 'experiments', immutable: false, conflict: 'id',
    toRow: (e) => ({ id: e.id, name: e.name, started_at: iso(e.startedAt), ends_at: iso(e.endsAt), assignments: e.assignments, updated_at: iso(e.updatedAt) }),
    fromRow: (r) => parse(experimentSchema, { id: r.id, name: r.name, startedAt: ms(r.started_at), endsAt: ms(r.ends_at), assignments: r.assignments, updatedAt: ms(r.updated_at) }),
  },
]

const CHUNK = 200
const PULL_LIMIT = 500
const OVERLAP = 25

type Quarantine = Record<string, string>

export interface SyncResult {
  pushed: number
  pulled: number
  quarantined: number
}

async function getKV<T>(db: HifzDB, key: string, fallback: T): Promise<T> {
  const r = await db.kv.get(key)
  return r ? (r.value as T) : fallback
}

export async function bindOwner(db: HifzDB, userId: string): Promise<void> {
  const owner = await getKV<string | null>(db, 'owner', null)
  if (owner && owner !== userId) throw new OwnerMismatchError()
  if (!owner) await db.kv.put({ key: 'owner', value: userId })
}

export async function pendingCount(db: HifzDB): Promise<number> {
  let n = 0
  for (const s of SPECS) n += await (db[s.key] as any).where('synced').equals(0).count()
  const settings = await getKV<{ synced: 0 | 1 } | null>(db, 'settings', null)
  if (settings && settings.synced === 0) n++
  const q = await getKV<Quarantine>(db, 'quarantine', {})
  return Math.max(0, n - Object.keys(q).length)
}

async function pushTable(db: HifzDB, remote: Remote, spec: Spec, quarantine: Quarantine): Promise<number> {
  const table = db[spec.key] as any
  const rows: Stored<{ id: string; updatedAt?: number }>[] = await table.where('synced').equals(0).toArray()
  const todo = rows.filter((r) => !quarantine[`${spec.key}:${r.id}`])
  let pushed = 0
  const markDone = async (batch: typeof rows) => {
    await db.transaction('rw', table, async () => {
      for (const r of batch) {
        const cur = await table.get(r.id)
        // If a mutable row changed while we were uploading, leave it dirty.
        if (cur && (spec.immutable || cur.updatedAt === r.updatedAt)) await table.update(r.id, { synced: 1 })
      }
    })
  }
  for (let i = 0; i < todo.length; i += CHUNK) {
    const batch = todo.slice(i, i + CHUNK)
    const payload = batch.map((r) => spec.toRow(r))
    try {
      await remote.upsert(spec.remote, payload, { onConflict: spec.conflict, ignoreDuplicates: spec.immutable })
      await markDone(batch)
      pushed += batch.length
    } catch (e) {
      if (!(e instanceof RemoteError) || !e.permanent) throw e
      // A permanent rejection: isolate the offending row(s) instead of blocking all sync.
      for (const r of batch) {
        try {
          await remote.upsert(spec.remote, [spec.toRow(r)], { onConflict: spec.conflict, ignoreDuplicates: spec.immutable })
          await markDone([r])
          pushed++
        } catch (e2) {
          if (!(e2 instanceof RemoteError) || !e2.permanent) throw e2
          quarantine[`${spec.key}:${r.id}`] = e2.message
        }
      }
    }
  }
  return pushed
}

async function pullTable(db: HifzDB, remote: Remote, spec: Spec): Promise<number> {
  const table = db[spec.key] as any
  const cursorKey = `cursor:${spec.remote}`
  let cursor = await getKV<number>(db, cursorKey, 0)
  let pulled = 0
  for (;;) {
    const rows = await remote.pull(spec.remote, Math.max(0, cursor - OVERLAP), PULL_LIMIT)
    if (!rows.length) break
    let maxSeq = cursor
    const apply: any[] = []
    for (const r of rows) {
      maxSeq = Math.max(maxSeq, Number(r.seq))
      const v = spec.fromRow(r) as (Record<string, unknown> & { id: string; updatedAt?: number }) | null
      if (!v) continue
      if (!spec.immutable) {
        const local = await table.get(v.id)
        if (local && local.synced === 0 && (local.updatedAt ?? 0) >= (v.updatedAt ?? 0)) continue
      }
      apply.push({ ...v, synced: 1 })
    }
    if (apply.length) await table.bulkPut(apply)
    pulled += apply.length
    const advanced = maxSeq > cursor
    cursor = maxSeq
    await db.kv.put({ key: cursorKey, value: cursor })
    if (rows.length < PULL_LIMIT || !advanced) break
  }
  return pulled
}

async function syncSettings(db: HifzDB, remote: Remote): Promise<number> {
  let changed = 0
  const local = await getKV<{ value: Settings; synced: 0 | 1 } | null>(db, 'settings', null)
  if (local && local.synced === 0) {
    await remote.upsert('profiles', [{ settings: local.value, updated_at: iso(local.value.updatedAt || Date.now()) }], { onConflict: 'user_id', ignoreDuplicates: false })
    const cur = await getKV<{ value: Settings; synced: 0 | 1 } | null>(db, 'settings', null)
    if (cur && cur.value.updatedAt === local.value.updatedAt) await db.kv.put({ key: 'settings', value: { ...cur, synced: 1 } })
    changed++
  }
  const rows = await remote.pull('profiles', 0, 1)
  const row = rows[0]
  if (row) {
    const parsed = settingsSchema.safeParse({ ...(row.settings as object), updatedAt: ms(row.updated_at) })
    const now = await getKV<{ value: Settings; synced: 0 | 1 } | null>(db, 'settings', null)
    if (parsed.success && (!now || (now.synced === 1 && parsed.data.updatedAt > now.value.updatedAt))) {
      await db.kv.put({ key: 'settings', value: { value: { ...(now?.value ?? {}), ...parsed.data } as Settings, synced: 1 } })
      changed++
    }
  }
  return changed
}

export async function syncOnce(db: HifzDB, remote: Remote): Promise<SyncResult> {
  await bindOwner(db, remote.userId())
  const quarantine = await getKV<Quarantine>(db, 'quarantine', {})
  let pushed = 0
  let pulled = 0
  try {
    for (const spec of SPECS) pushed += await pushTable(db, remote, spec, quarantine)
    pushed += await syncSettings(db, remote)
  } finally {
    await db.kv.put({ key: 'quarantine', value: quarantine })
  }
  for (const spec of SPECS) pulled += await pullTable(db, remote, spec)
  await db.kv.put({ key: 'lastSyncAt', value: Date.now() })
  return { pushed, pulled, quarantined: Object.keys(quarantine).length }
}

export const ALL_TABLES = TABLE_KEYS
