import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { deriveState, ayahStatus } from '@/lib/engine/derive'
import { buildPlan, type PlannerInput } from '@/lib/engine/planner'
import { isGood, isPartsLayout, outcomeFor, partProgress, stepRungs, REFRESH_AFTER_MS, PARTS_MIN_PHRASES } from '@/lib/engine/parts'
import { summariseSession } from '@/lib/sessionSummary'
import { HifzDB } from '@/lib/store/db'
import { exportBackup, importBackup, loadAll, recordFlow, recordPart, recordReview } from '@/lib/store/repo'
import { pendingCount } from '@/lib/store/sync'
import { buildPhrases } from '@/lib/engine/phrases'
import { defaultBoundaries } from '@/lib/engine/breakdown'
import { ayahKey, DAY, type Grade, type LearningTarget, type PartEvent } from '@/lib/engine/types'
import { wordsOfAyah } from '@/lib/quran/data'
import { fakeCorpus, NOW, review } from './helpers'

// An ayah of 40 words in four parts of 10 words: A = 0-9, B = 10-19, C = 20-29, D = 30-39.
const SPANS = [0, 10, 20, 30].map((f) => ({ from: f, to: f + 9 }))
let n = 0
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const part = (from: number, to: number, grade: Grade, at: number, extra: Partial<PartEvent> = {}): PartEvent => ({
  id: uid(), surah: 2, ayah: 282, fromWord: from, toWord: to, wordCount: 40, grade, cueLevel: 4, durationMs: 20000, occurredAt: at, ...extra,
})
const A = (g: Grade, at: number, x: Partial<PartEvent> = {}) => part(0, 9, g, at, x)
const B = (g: Grade, at: number, x: Partial<PartEvent> = {}) => part(10, 19, g, at, x)
const C = (g: Grade, at: number, x: Partial<PartEvent> = {}) => part(20, 29, g, at, x)
const AB = (g: Grade, at: number, x: Partial<PartEvent> = {}) => part(0, 19, g, at, x)
const ABC = (g: Grade, at: number, x: Partial<PartEvent> = {}) => part(0, 29, g, at, x)
const H = 3600 * 1000

describe('part progress: what a learner has actually shown, part by part', () => {
  it('a long ayah with nothing recorded starts at the first part', () => {
    const p = partProgress(SPANS, [], NOW)
    expect(p).toMatchObject({ reach: 0, next: 0, started: false, allSecured: false, refreshDue: false })
  })

  it('A: learning the first part and stopping is real progress, and it is remembered', () => {
    const p = partProgress(SPANS, [A('independent', NOW - H)], NOW)
    expect(p.reach).toBe(1)
    expect(p.next).toBe(1)
    expect(p.started).toBe(true)
    expect(p.refreshDue).toBe(false)     // an hour later: same sitting
  })

  it('B: the next day, the part learned is checked before the next one is added', () => {
    const p = partProgress(SPANS, [A('independent', NOW - DAY)], NOW)
    expect(p.refreshDue).toBe(true)
    expect(p.next).toBe(1)
    expect(partProgress(SPANS, [A('independent', NOW - REFRESH_AFTER_MS + 1000)], NOW).refreshDue).toBe(false)
  })

  it('C: A on Monday, B on Tuesday, C on Wednesday — three parts in, but the ayah is not memorised until it is recited whole', () => {
    const mon = NOW - 2 * DAY, tue = NOW - DAY, wed = NOW - H
    const events = [A('independent', mon), A('hesitant', tue), B('independent', tue + H), AB('independent', tue + 2 * H), C('independent', wed), ABC('independent', wed + H)]
    const p = partProgress(SPANS, events, NOW)
    expect(p.reach).toBe(3)
    expect(p.next).toBe(3)
    expect(p.allSecured).toBe(false)
    expect(p.phrases[0]!.heldOverBreak).toBe(true)         // A held across a break
    expect(p.phrases[2]!.heldOverBreak).toBe(false)        // C only once
    expect(p.phrases[1]!.joinedAt).not.toBeNull()          // B was recalled joined to A
    // The memory model does not hear about any of it.
    const d = deriveState({ reviews: [], flows: [], parts: events, declarations: [] })
    expect(d.memory.size).toBe(0)
    expect(d.recallEventCount).toBe(0)
    expect(ayahStatus(d.memory.get(ayahKey(2, 282)), d.flow.get(ayahKey(2, 282)), NOW).demonstrated).toBe(false)
    expect(d.parts.get(ayahKey(2, 282))).toHaveLength(events.length)
  })

  it('F: only a recall of the whole ayah (a review event) makes it demonstrated', () => {
    const events = [A('independent', NOW - 3 * H), B('independent', NOW - 2 * H), C('independent', NOW - H), part(30, 39, 'independent', NOW - 1)]
    const d1 = deriveState({ reviews: [], flows: [], parts: events, declarations: [] })
    expect(ayahStatus(d1.memory.get(ayahKey(2, 282)), undefined, NOW).demonstrated).toBe(false)
    const whole = review([2, 282, 282], 'independent', NOW)
    const d2 = deriveState({ reviews: [whole], flows: [], parts: events, declarations: [] })
    expect(ayahStatus(d2.memory.get(ayahKey(2, 282)), undefined, NOW).demonstrated).toBe(true)
  })

  it('D: a weak part is found and singled out without relearning the others', () => {
    const t = NOW - 2 * H
    const events = [A('independent', t), B('independent', t + 1), AB('independent', t + 2), C('independent', t + 3), ABC('prompted', t + 4, { slipWord: 24 })]
    const p = partProgress(SPANS, events, NOW)
    expect(p.weak).toEqual([2])
    expect(p.reach).toBe(2)               // A and B still secured: the words before the slip were recited
    expect(p.next).toBe(2)
    expect(p.phrases[0]!.secured && p.phrases[1]!.secured).toBe(true)
  })

  it('E: A and B known separately, but the join fails at the start of B: B (the join) is what is practised, not A', () => {
    const t = NOW - 2 * H
    const events = [A('independent', t), B('independent', t + 1), AB('prompted', t + 2, { slipWord: 10 })]
    const p = partProgress(SPANS, events, NOW)
    expect(p.reach).toBe(1)
    expect(p.next).toBe(1)
    expect(p.weak).toEqual([1])
    expect(p.phrases[0]!.secured).toBe(true)
  })

  it('a failed recall with no slip marked cannot say where, so every part it covered is open again', () => {
    const t = NOW - 2 * H
    const p = partProgress(SPANS, [A('independent', t), B('independent', t + 1), AB('failed', t + 2)], NOW)
    expect(p.reach).toBe(0)
    expect(p.weak).toEqual([0, 1])
  })

  it('a later accurate recall repairs a part; it does not need relearning from scratch', () => {
    const t = NOW - 2 * H
    const bad = [A('independent', t), B('independent', t + 1), AB('prompted', t + 2, { slipWord: 10 })]
    const fixed = [...bad, B('independent', t + 3), AB('hesitant', t + 4)]
    const p = partProgress(SPANS, fixed, NOW)
    expect(p.reach).toBe(2)
    expect(p.weak).toEqual([])
  })

  it('hints: the first word is allowed as a hint, more is not evidence of recall', () => {
    expect(isGood({ grade: 'independent', cueLevel: 4 })).toBe(true)
    expect(isGood({ grade: 'hesitant', cueLevel: 3 })).toBe(true)
    expect(isGood({ grade: 'independent', cueLevel: 2 })).toBe(false)
    expect(isGood({ grade: 'prompted', cueLevel: 4 })).toBe(false)
    expect(outcomeFor(A('failed', NOW, { cueLevel: 1 }), SPANS[0]!)).toBeUndefined()      // recalled with most of the text shown: neither credit nor blame
    expect(outcomeFor(A('independent', NOW, { cueLevel: 1 }), SPANS[0]!)).toBeUndefined()
  })

  it('words are the unit: a different phrase layout later never turns old recalls into false progress', () => {
    const events = [AB('independent', NOW - H)]
    const oldLayout = partProgress(SPANS, events, NOW)
    expect(oldLayout.reach).toBe(2)
    const newLayout = [{ from: 0, to: 24 }, { from: 25, to: 29 }, { from: 30, to: 39 }]     // a first phrase that reaches beyond where the recall ended
    const p = partProgress(newLayout, events, NOW)
    expect(p.phrases[0]!.secured).toBe(false)
    expect(p.reach).toBe(0)
  })

  it('every part secured means the whole ayah is what is left', () => {
    const t = NOW - H
    const p = partProgress(SPANS, [A('independent', t), B('independent', t + 1), C('independent', t + 2), part(30, 39, 'independent', t + 3)], NOW)
    expect(p.allSecured).toBe(true)
    expect(p.next).toBeNull()
  })

  it('the steps of one part: the new part alone, its join with the one before, and the chain from the start', () => {
    expect(stepRungs(0).map((r) => r.label)).toEqual(['A'])
    expect(stepRungs(1).map((r) => r.label)).toEqual(['B', 'A → B'])
    expect(stepRungs(3).map((r) => r.label)).toEqual(['D', 'C → D', 'A → B → C → D'])
  })
})

describe('which ayahs are learned part by part', () => {
  const layoutOf = (s: number, a: number) => { const w = wordsOfAyah(s, a); return buildPhrases(w, defaultBoundaries(s, a, w)).map((p) => ({ from: p.from, to: p.to })) }
  it('a short ayah is never split, and a two-phrase ayah keeps the ordinary ladder', () => {
    expect(layoutOf(112, 1).length).toBe(1)
    expect(PARTS_MIN_PHRASES).toBe(3)
  })
  it('a 17-word ayah split in three, or a long ayah split in two, keeps the ordinary ladder', () => {
    expect(isPartsLayout(layoutOf(2, 110))).toBe(false)                              // 17 words: one sitting
    expect(isPartsLayout([{ from: 0, to: 11 }, { from: 12, to: 23 }])).toBe(false)   // two phrases
    expect(isPartsLayout([{ from: 0, to: 6 }, { from: 7, to: 13 }, { from: 14, to: 20 }])).toBe(true)
  })
  it('Ayat al-Kursi and the longest ayah of al-Baqarah are split into several parts, all words covered exactly once', () => {
    for (const [s, a] of [[2, 255], [2, 282]] as const) {
      const sp = layoutOf(s, a)
      expect(sp.length).toBeGreaterThanOrEqual(3)
      expect(sp[0]!.from).toBe(0)
      expect(sp[sp.length - 1]!.to).toBe(wordsOfAyah(s, a).length - 1)
      for (let i = 1; i < sp.length; i++) expect(sp[i]!.from).toBe(sp[i - 1]!.to + 1)
    }
  })
})

describe('the daily planner brings a half-learned ayah back', () => {
  const corpus = fakeCorpus({ 2: 286 }, 12)
  const tgt: LearningTarget = { id: 't', range: { surah: 2, start: 282, end: 282 }, status: 'active', createdAt: 1, updatedAt: 1, label: 'Al-Baqarah 282' }
  const layout = (s: number, a: number) => (s === 2 && a === 282 ? SPANS : null)
  const input = (parts: PartEvent[], over: Partial<PlannerInput> = {}): PlannerInput => ({
    now: NOW, derived: deriveState({ reviews: [], flows: [], parts, declarations: [] }), corpus, targets: [tgt], minutes: 20, planNew: true, newPerDayCap: 10,
    learnedToday: 0, learningSecPerWord: null, lastSessionAt: parts.length ? NOW - DAY : null, partsLayout: layout, ...over,
  })

  it('B: the next day it is "continue", with a check of what was learned first', () => {
    const p = buildPlan(input([A('independent', NOW - DAY)]))
    const it = p.items.find((i) => i.kind === 'new')!
    expect(it.range).toEqual({ surah: 2, start: 282, end: 282 })
    expect(it.partial).toEqual({ next: 1, of: 4, refresh: true, started: true })
    expect(it.reasons.join(' ')).toMatch(/1 of 4 parts learned/)
    expect(it.reasons.join(' ')).toMatch(/quick check/)
  })

  it('E: a five-minute session is still useful — the item is only the next part, not the whole ayah', () => {
    const five = buildPlan(input([], { minutes: 5 }))
    const it = five.items.find((i) => i.kind === 'new')!
    expect(it).toBeTruthy()
    expect(it.partial).toMatchObject({ next: 0, of: 4 })
    const whole = buildPlan(input([], { minutes: 5, partsLayout: undefined })).items.find((i) => i.kind === 'new')
    expect(it.estMinutes).toBeLessThan(whole!.estMinutes)
  })

  it('a weak part is named and practised first', () => {
    const t = NOW - 2 * H
    const p = buildPlan(input([A('independent', t), B('independent', t + 1), AB('independent', t + 2), C('independent', t + 3), ABC('prompted', t + 4, { slipWord: 24 })]))
    const it = p.items.find((i) => i.kind === 'new')!
    expect(it.partial?.next).toBe(2)
    expect(it.reasons.join(' ')).toMatch(/Part C went wrong/)
  })

  it('every part learned: what is left is reciting the whole ayah, so the estimate is small', () => {
    const t = NOW - 2 * H
    const all = [A('independent', t), B('independent', t + 1), C('independent', t + 2), part(30, 39, 'independent', t + 3)]
    const it = buildPlan(input(all)).items.find((i) => i.kind === 'new')!
    expect(it.reasons.join(' ')).toMatch(/join them/)
    expect(it.estMinutes).toBeLessThan(buildPlan(input([])).items.find((i) => i.kind === 'new')!.estMinutes)
  })

  it('an ayah started outside any goal still comes back', () => {
    const p = buildPlan(input([A('independent', NOW - DAY)], { targets: [] }))
    expect(p.items.find((i) => i.kind === 'new')?.range).toEqual({ surah: 2, start: 282, end: 282 })
  })

  it('G/J: without a parts layout (short ayahs, existing users) the plan is exactly what it was', () => {
    const base = input([], { targets: [{ ...tgt, range: { surah: 2, start: 1, end: 3 } }] })
    const a = buildPlan(base)
    const b = buildPlan({ ...base, partsLayout: () => null })
    expect(b.items.map((i) => [i.id, i.estMinutes])).toEqual(a.items.map((i) => [i.id, i.estMinutes]))
    expect(a.items.find((i) => i.kind === 'new')!.partial).toBeUndefined()
  })

  it('once the whole ayah has been recalled, it is an ordinary reviewed ayah and no longer "new"', () => {
    const t = NOW - 2 * H
    const all = [A('independent', t), B('independent', t + 1), C('independent', t + 2), part(30, 39, 'independent', t + 3)]
    const derived = deriveState({ reviews: [review([2, 282, 282], 'independent', NOW - H)], flows: [], parts: all, declarations: [] })
    const p = buildPlan({ ...input(all), derived })
    expect(p.items.find((i) => i.kind === 'new')).toBeUndefined()
  })
})

describe('the session summary treats part progress as progress', () => {
  it('a session that learned part of a long ayah says so and is not "skipped"', () => {
    const derived = deriveState({ reviews: [], flows: [], parts: [], declarations: [] })
    const sessionId = '11111111-1111-4111-8111-111111111111'
    const q = { id: 'new:2:282-282', kind: 'new' as const, range: { surah: 2, start: 282, end: 282 }, ayahs: 1, words: 40, estMinutes: 3, priority: 1, reasons: [], title: 'x' }
    const parts = [A('independent', NOW - 1000, { sessionId })]
    const s = summariseSession({ sessionId, queue: [q], completed: ['new:2:282-282'], skipped: [], startedAt: NOW - 600000, reviews: [], flows: [], parts, derived, now: NOW })
    expect(s.items[0]!.result).toBe('practised')
    expect(s.items[0]!.note).toMatch(/continues from there/)
    // leaving early (skipping) after learning a part is still reported as progress
    const s2 = summariseSession({ sessionId, queue: [q], completed: [], skipped: ['new:2:282-282'], startedAt: NOW - 600000, reviews: [], flows: [], parts, derived, now: NOW })
    expect(s2.items[0]!.result).toBe('practised')
  })
})

describe('storage: additive, backward compatible', () => {
  const fresh = () => new HifzDB(`parts-${Date.now()}-${Math.random()}`)
  it('I: part events survive a close and reopen; they are not synced (no server table yet) so they never block sync', async () => {
    const name = `parts-reopen-${Date.now()}`
    const db = new HifzDB(name)
    await recordPart(db, A('independent', NOW))
    db.close()
    const again = new HifzDB(name)
    expect((await loadAll(again)).parts).toHaveLength(1)
    expect(await pendingCount(again)).toBe(0)
  })
  it('J: a database created by the previous version (no parts table) opens, upgrades and keeps its events', async () => {
    const name = `parts-upgrade-${Date.now()}`
    const old = new Dexie(name)
    old.version(1).stores({ reviews: 'id, occurredAt, synced', flows: 'id, occurredAt, synced', declarations: 'id, occurredAt, synced', sessions: 'id, startedAt, synced', targets: 'id, synced', markers: 'id, synced', experiments: 'id, synced', kv: 'key' })
    await old.table('reviews').add({ ...review([112, 1, 1], 'independent', NOW), id: uid(), synced: 1 })
    old.close()
    const db = new HifzDB(name)
    const snap = await loadAll(db)
    expect(snap.reviews).toHaveLength(1)
    expect(snap.parts).toEqual([])
    await recordPart(db, A('independent', NOW))
    expect((await loadAll(db)).parts).toHaveLength(1)
  })
  it('backups round-trip parts; a backup made before parts existed still imports', async () => {
    const a = fresh(), b = fresh()
    await recordReview(a, { ...review([112, 1, 1], 'independent', NOW), id: uid() })
    await recordFlow(a, { id: uid(), surah: 2, ayah: 282, fromPhrase: 0, toPhrase: 0, phraseCount: 4, rating: 'natural', reps: 3, durationMs: 1000, occurredAt: NOW })
    await recordPart(a, A('independent', NOW))
    const backup = await exportBackup(a)
    expect(backup.parts).toHaveLength(1)
    const sum = await importBackup(b, backup)
    expect(sum.added).toBeGreaterThanOrEqual(3)
    expect((await loadAll(b)).parts).toHaveLength(1)
    expect((await importBackup(b, backup)).added).toBe(0)       // idempotent
    const legacy = { ...backup } as Partial<typeof backup>
    delete legacy.parts
    const c = fresh()
    await expect(importBackup(c, legacy)).resolves.toBeTruthy()
    expect((await loadAll(c)).reviews).toHaveLength(1)
  })
  it('refuses a malformed part event (slip outside its span, span beyond the ayah)', async () => {
    const db = fresh()
    await expect(recordPart(db, A('failed', NOW, { slipWord: 15 }))).rejects.toThrow()
    await expect(recordPart(db, part(30, 45, 'independent', NOW))).rejects.toThrow()
  })
})
