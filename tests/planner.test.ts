import { describe, expect, it } from 'vitest'
import { deriveState } from '@/lib/engine/derive'
import { buildPlan, type PlannerInput } from '@/lib/engine/planner'
import { DAY, type Declaration, type LearningTarget, type ReviewEvent } from '@/lib/engine/types'
import { claim, daysAgo, fakeCorpus, NOW, review } from './helpers'

const corpus = fakeCorpus({ 1: 7, 2: 286, 3: 200, 78: 40, 112: 4 })
const target = (s: number, a: number, b: number, label?: string): LearningTarget => ({
  id: `t${s}${a}`, range: { surah: s, start: a, end: b }, status: 'active', createdAt: 1, updatedAt: 1, label,
})

function plan(reviews: ReviewEvent[], opts: Partial<PlannerInput> & { declarations?: Declaration[] } = {}) {
  const { declarations = [], ...rest } = opts
  const derived = deriveState({ reviews, flows: [], declarations })
  const last = reviews.length ? Math.max(...reviews.map((r) => r.occurredAt)) : null
  return buildPlan({
    now: NOW, derived, corpus, targets: [], minutes: 20, planNew: true, newPerDayCap: 10, learnedToday: 0,
    learningSecPerWord: null, lastSessionAt: last, ...rest,
  })
}
/** n consecutive ayahs reviewed once, `days` ago. */
const seed = (s: number, a: number, b: number, days: number) =>
  Array.from({ length: b - a + 1 }, (_, i) => review([s, a + i, a + i], 'independent', daysAgo(days)))

describe('planner: basics', () => {
  it('starts gently when there is no history', () => {
    const p = plan([])
    expect(p.mode).toBe('empty')
    expect(p.items).toHaveLength(0)
  })
  it('plans new memorisation from an active goal and says why', () => {
    const p = plan([], { targets: [target(112, 1, 4, 'Al-Ikhlas')] })
    const n = p.items.find((i) => i.kind === 'new')!
    expect(n).toBeTruthy()
    expect(n.range).toEqual({ surah: 112, start: 1, end: 1 + n.ayahs - 1 })
    expect(n.reasons.join(' ')).toContain('Al-Ikhlas')
  })
  it('continues a goal from where recall was last accurate', () => {
    const p = plan([review([112, 1, 1], 'independent', daysAgo(0.1)), review([112, 2, 2], 'independent', daysAgo(0.1))], { targets: [target(112, 1, 4)] })
    expect(p.items.find((i) => i.kind === 'new')!.range.start).toBe(3)
  })
  it('respects the daily cap on new ayahs', () => {
    expect(plan([], { targets: [target(2, 1, 200)], learnedToday: 10 }).items.some((i) => i.kind === 'new')).toBe(false)
    const p = plan([], { targets: [target(2, 1, 200)], newPerDayCap: 3, minutes: 60 })
    expect(p.items.find((i) => i.kind === 'new')!.ayahs).toBeLessThanOrEqual(3)
  })
  it('is deterministic', () => {
    const rs = seed(2, 1, 30, 6)
    expect(plan(rs, { targets: [target(3, 1, 20)] })).toEqual(plan(rs, { targets: [target(3, 1, 20)] }))
  })
})

describe('planner: scheduling and explanation', () => {
  it('schedules overdue material with plain-language reasons', () => {
    const p = plan(seed(2, 1, 8, 5))
    expect(p.items.length).toBeGreaterThan(0)
    const it = p.items[0]!
    expect(it.reasons.join(' ')).toMatch(/Last recalled successfully 5 days ago/)
    expect(it.reasons.join(' ')).toMatch(/Estimated recall/)
  })
  it('does not schedule material that is not yet due', () => {
    const rs = [...seed(2, 1, 4, 3)]
    // Raise stability: several well-spaced successes.
    for (const d of [2, 1]) rs.push(...seed(2, 1, 4, d))
    const p = plan([review([2, 20, 20], 'independent', daysAgo(0.2))])
    expect(p.items).toHaveLength(0)
  })
  it('puts failed/prompted material in repair and explains it', () => {
    const rs = [review([2, 5, 5], 'independent', daysAgo(8)), review([2, 5, 5], 'prompted', daysAgo(2))]
    const p = plan(rs)
    const rep = p.items.find((i) => i.kind === 'repair')!
    expect(rep.reasons.join(' ')).toMatch(/Needed prompting/)
  })
  it('explains the flow-versus-recall difference', () => {
    const derived = deriveState({
      reviews: [review([2, 5, 5], 'independent', daysAgo(30))],
      flows: [{ id: 'f', surah: 2, ayah: 5, fromPhrase: 0, toPhrase: 0, phraseCount: 1, rating: 'natural', reps: 5, durationMs: 1, occurredAt: daysAgo(31) }],
      declarations: [],
    })
    const p = buildPlan({ now: NOW, derived, corpus, targets: [], minutes: 20, planNew: true, newPerDayCap: 10, learnedToday: 0, learningSecPerWord: null, lastSessionAt: daysAgo(30) })
    expect(p.items[0]!.reasons.join(' ')).toMatch(/Flow feels natural, but estimated recall has weakened/)
  })
  it('points out a wobbly transition', () => {
    const p = plan([review([2, 1, 4], 'hesitant', daysAgo(5), { shakyJunctions: [2] })])
    expect(p.items.map((i) => i.reasons.join(' ')).join(' ')).toMatch(/transition from ayah 2 into 3 wobbled/)
  })
  it('states plainly that the model is a default, not personalised', () => {
    expect(plan(seed(2, 1, 3, 5)).modelNote).toMatch(/not yet personalised/)
  })
  it('keeps the whole plan within the time budget (allowing for one long first item)', () => {
    for (const minutes of [10, 20, 45]) {
      const p = plan([...seed(2, 1, 60, 6), ...seed(3, 1, 60, 20)], { minutes, targets: [target(78, 1, 40)] })
      const first = p.items[0]!.estMinutes
      expect(p.plannedMinutes).toBeLessThanOrEqual(Math.max(minutes * 1.02, first))
    }
  })
})

describe('planner: workload and recovery', () => {
  it('reduces new memorisation when review load is high, and says so', () => {
    const light = plan(seed(2, 1, 6, 6), { targets: [target(78, 1, 40)], minutes: 20 })
    // Studied yesterday (so not a "return after a gap"), but with a heavy backlog.
    const heavy = plan([...seed(2, 1, 80, 6), ...seed(3, 1, 80, 9)], { targets: [target(78, 1, 40)], minutes: 20, lastSessionAt: daysAgo(1) })
    const newMin = (p: ReturnType<typeof plan>) => p.items.filter((i) => i.kind === 'new').reduce((n, i) => n + i.estMinutes, 0)
    expect(newMin(heavy)).toBeLessThan(newMin(light))
    expect(heavy.notes.join(' ')).toMatch(/Review workload is high/)
  })
  it('after a long gap with a big backlog, enters recovery rather than showing everything', () => {
    const rs = [...seed(2, 1, 200, 22), ...seed(3, 1, 100, 22)]
    const p = plan(rs, { minutes: 20, targets: [target(78, 1, 40)], lastSessionAt: daysAgo(20) })
    expect(p.mode).toBe('recovery')
    expect(p.backlog.ayahs).toBe(300)
    expect(p.plannedMinutes).toBeLessThanOrEqual(20.5)
    expect(p.items.some((i) => i.kind === 'new')).toBe(false)
    expect(p.items.reduce((n, i) => n + i.ayahs, 0)).toBeLessThan(300)
    expect(p.deferred.ayahs).toBeGreaterThan(0)
    expect(p.notes.join(' ')).toMatch(/Nothing has been reset/)
    expect(p.headline).toBe('A gentle return')
  })
  it('recovery prioritises the highest-risk material', () => {
    const old = seed(2, 1, 12, 40)     // most overdue
    const recent = seed(3, 1, 12, 8)
    const p = plan([...old, ...recent, ...seed(2, 100, 200, 40), ...seed(3, 100, 190, 30)], { minutes: 10, lastSessionAt: daysAgo(10) })
    expect(p.mode).toBe('recovery')
    const surahs = p.items.map((i) => i.range.surah)
    expect(surahs).toContain(2)
  })
  it('does not alter history in recovery (state is derived, never reset)', () => {
    const rs = [...seed(2, 1, 100, 30)]
    const before = deriveState({ reviews: rs, flows: [], declarations: [] })
    plan(rs, { lastSessionAt: daysAgo(30) })
    const after = deriveState({ reviews: rs, flows: [], declarations: [] })
    expect(after.memory).toEqual(before.memory)
  })
})

describe('planner: declared-known material', () => {
  it('asks to verify claimed material, but only with spare time', () => {
    const decl = [claim([1, 1, 7], daysAgo(20)), claim([112, 1, 4], daysAgo(20))]
    const p = plan([], { declarations: decl, minutes: 20 })
    const v = p.items.filter((i) => i.kind === 'verify')
    expect(v.length).toBeGreaterThan(0)
    expect(v[0]!.reasons.join(' ')).toMatch(/marked this as known/)
  })
  it('puts due reviews ahead of verification when time is short', () => {
    const decl = [claim([1, 1, 7], daysAgo(20))]
    const p = plan([...seed(2, 1, 60, 8)], { declarations: decl, minutes: 5 })
    expect(p.items.some((i) => i.kind === 'verify')).toBe(false)
    expect(p.items.length).toBeGreaterThan(0)
  })
  it('treats retracted claims as unknown', () => {
    const decl = [claim([1, 1, 7], daysAgo(20)), claim([1, 1, 7], daysAgo(10), 'retract')]
    expect(plan([], { declarations: decl }).items).toHaveLength(0)
  })
})

describe('planner: ordering', () => {
  it('orders recent revision, repair, new, then older maintenance', () => {
    const rs = [
      ...seed(2, 1, 5, 3),                                                       // sabqi
      review([3, 1, 1], 'independent', daysAgo(40)), review([3, 1, 1], 'failed', daysAgo(1)), // repair
      ...seed(78, 1, 10, 40).map((r) => ({ ...r, range: { ...r.range } })),       // older
    ]
    const p = plan(rs, { targets: [target(112, 1, 4)], minutes: 45 })
    const order = p.items.map((i) => i.kind)
    expect(order.indexOf('new')).toBeGreaterThan(-1)
    const rank = { sabqi: 0, repair: 1, new: 2, manzil: 3, verify: 4 } as const
    const ranks = order.map((k) => rank[k])
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
  })
  it('reports what falls due soon', () => {
    const p = plan([review([2, 1, 1], 'independent', daysAgo(0.5))])
    expect(p.upcoming.next24h).toBe(1)
  })
})
void DAY
