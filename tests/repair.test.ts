import { describe, expect, it } from 'vitest'
import { buildRepairLadder, slipRung, troubledRungs } from '@/lib/engine/repair'
import { buildPhrases } from '@/lib/engine/phrases'
import { deriveState, junctionNeedsRepair } from '@/lib/engine/derive'
import { buildPlan } from '@/lib/engine/planner'
import type { FlowEvent } from '@/lib/engine/types'
import { daysAgo, fakeCorpus, NOW, review } from './helpers'

let n = 0
const flow = (from: number, to: number, rating: FlowEvent['rating'], at: number, count = 4, ayah = 1): FlowEvent => ({
  id: `f${++n}`, surah: 20, ayah, fromPhrase: from, toPhrase: to, phraseCount: count, rating, reps: 3, durationMs: 4000, occurredAt: at,
})
const phrases = (k: number) => buildPhrases(Array.from({ length: k * 3 }, (_, i) => `w${i}`), Array.from({ length: k - 1 }, (_, i) => i * 3 + 2))

describe('phrase-pair trouble', () => {
  it('finds the one pair that keeps going wrong and leaves comfortable pairs alone', () => {
    const fs = [flow(0, 1, 'natural', 1), flow(1, 2, 'tangled', 2), flow(1, 2, 'tangled', 3), flow(2, 3, 'natural', 4)]
    const t = troubledRungs(fs, 20, 1, 4)
    expect(t.map((x) => [x.from, x.to])).toEqual([[1, 2]])
    expect(t[0]!.score).toBe(2)
  })
  it('needs as many natural repetitions as there were tangled marks before it is cleared', () => {
    const base = [flow(1, 2, 'tangled', 1), flow(1, 2, 'tangled', 2)]
    expect(troubledRungs([...base, flow(1, 2, 'natural', 3)], 20, 1, 4)).toHaveLength(1)
    expect(troubledRungs([...base, flow(1, 2, 'natural', 3), flow(1, 2, 'natural', 4)], 20, 1, 4)).toHaveLength(0)
  })
  it('"improving" neither adds nor clears trouble', () => {
    expect(troubledRungs([flow(1, 2, 'tangled', 1), flow(1, 2, 'improving', 2)], 20, 1, 4)).toHaveLength(1)
  })
  it('ignores events recorded under a different phrase layout, and other ayahs', () => {
    expect(troubledRungs([flow(1, 2, 'tangled', 1, 6)], 20, 1, 4)).toHaveLength(0)
    expect(troubledRungs([flow(1, 2, 'tangled', 1, 4, 2)], 20, 1, 4)).toHaveLength(0)
  })
  it('does not treat a tangled whole-ayah chain as a junction problem', () => {
    expect(troubledRungs([flow(0, 3, 'tangled', 1)], 20, 1, 4)).toHaveLength(0)
  })
  it('a single-phrase ayah can still be tangled as a whole', () => {
    expect(troubledRungs([flow(0, 0, 'tangled', 1, 1)], 20, 1, 1)).toHaveLength(1)
  })
})

describe('slip to rung', () => {
  const p = phrases(4)
  it('maps a slipped word to the pair that joins into its phrase', () => {
    expect(slipRung(7, p)).toEqual({ from: 1, to: 2 })   // word 7 is in phrase C (index 2)? words 6-8 -> phrase 2 -> pair 1-2
    expect(slipRung(11, p)).toEqual({ from: 2, to: 3 })
  })
  it('the first phrase practises with its neighbour; a one-phrase ayah practises as a whole', () => {
    expect(slipRung(1, p)).toEqual({ from: 0, to: 1 })
    expect(slipRung(2, phrases(1))).toEqual({ from: 0, to: 0 })
  })
})

describe('repair ladder', () => {
  it('practises only the troubled pairs, then the whole ayah once', () => {
    const l = buildRepairLadder(phrases(4), [{ from: 1, to: 2 }])
    expect(l.map((r) => r.label)).toEqual(['Repair: B → C', 'Whole ayah, joined'])
    expect(l[l.length - 1]!.kind).toBe('full')
  })
  it('never repeats a rung and ignores out-of-range indices', () => {
    const l = buildRepairLadder(phrases(3), [{ from: 0, to: 1 }, { from: 0, to: 1 }, { from: 5, to: 6 }])
    expect(l).toHaveLength(2)
  })
})

describe('ayah-to-ayah junction repair in the plan', () => {
  const corpus = fakeCorpus({ 20: 135 }, 10)
  const planFor = (reviews: ReturnType<typeof review>[]) => buildPlan({
    now: NOW, derived: deriveState({ reviews, flows: [], declarations: [] }), corpus, targets: [], minutes: 20, planNew: false, newPerDayCap: 10,
    learnedToday: 0, learningSecPerWord: null, lastSessionAt: daysAgo(1),
  })
  const drill = (grade: 'independent' | 'failed', at: number) => review([20, 12, 13], grade, at, { kind: 'junction' })

  it('proposes a short drill for a transition that keeps failing', () => {
    const p = planFor([drill('failed', daysAgo(2)), drill('failed', daysAgo(1))])
    const it = p.items.find((i) => i.drill === 'junction')!
    expect(it).toBeTruthy()
    expect(it.range).toEqual({ surah: 20, start: 12, end: 13 })
    expect(it.estMinutes).toBeLessThan(1)
    expect(it.reasons.join(' ')).toMatch(/transition from ayah 12 into 13 wobbled/)
  })
  it('stops proposing it after enough smooth practice, and not for one clean drill', () => {
    expect(planFor([drill('independent', daysAgo(1))]).items.some((i) => i.drill === 'junction')).toBe(false)
    expect(planFor([drill('failed', daysAgo(3)), drill('independent', daysAgo(2)), drill('independent', daysAgo(1))]).items.some((i) => i.drill === 'junction')).toBe(false)
  })
  it('junctionNeedsRepair requires net trouble', () => {
    expect(junctionNeedsRepair({ surah: 20, from: 1, ok: 0, shaky: 1, lastAt: 1, lastOk: false })).toBe(true)
    expect(junctionNeedsRepair({ surah: 20, from: 1, ok: 3, shaky: 1, lastAt: 1, lastOk: true })).toBe(false)
  })
  it('does not add a separate drill when a chosen passage already contains the transition', () => {
    const rs = [review([20, 10, 15], 'independent', daysAgo(9)), drill('failed', daysAgo(2)), drill('failed', daysAgo(1))]
    const p = planFor(rs)
    const covering = p.items.find((i) => !i.drill && i.range.start <= 12 && i.range.end >= 13)
    if (covering) expect(p.items.some((i) => i.drill === 'junction')).toBe(false)
  })
})

describe('habit-time due window', () => {
  const corpus = fakeCorpus({ 20: 135 }, 10)
  const plan = (hoursAgo: number) => buildPlan({
    now: NOW, derived: deriveState({ reviews: [review([20, 1, 1], 'independent', NOW - hoursAgo * 3600e3)], flows: [], declarations: [] }), corpus,
    targets: [], minutes: 20, planNew: false, newPerDayCap: 10, learnedToday: 0, learningSecPerWord: null, lastSessionAt: NOW - hoursAgo * 3600e3,
  })
  it('includes an ayah learned 23 hours ago, so a same-time-tomorrow session does not skip a day', () => {
    const p = plan(23)
    expect(p.items).toHaveLength(1)
    expect(p.items[0]!.reasons.join(' ')).toMatch(/Due around this time today/)
  })
  it('still leaves alone an ayah learned only 12 hours ago', () => {
    expect(plan(12).items).toHaveLength(0)
  })
})
