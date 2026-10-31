import { describe, expect, it } from 'vitest'
import { compareListening, coverage, learningByLength, learningSamples, learningSecPerWord, retentionByInterval, weakSpots, weeklyTime, wilson } from '@/lib/engine/analytics'
import { deriveState } from '@/lib/engine/derive'
import { assignArm, armOfAyah, newExperiment, readout, withAssignment } from '@/lib/engine/experiment'
import { DAY, type FlowEvent, type Range } from '@/lib/engine/types'
import { daysAgo, fakeCorpus, NOW, review } from './helpers'

const corpus = fakeCorpus({ 1: 7, 2: 286, 112: 4 }, 10)
const flow = (s: number, a: number, ms: number, at: number, extra: Partial<FlowEvent> = {}): FlowEvent => ({
  id: `f${s}-${a}-${at}`, surah: s, ayah: a, fromPhrase: 0, toPhrase: 0, phraseCount: 1, rating: 'improving', reps: 3, durationMs: ms, occurredAt: at, ...extra,
})

describe('wilson interval', () => {
  it('is wide for small n and narrows with more data', () => {
    const small = wilson(3, 4)!, big = wilson(75, 100)!
    expect(small[1] - small[0]).toBeGreaterThan(big[1] - big[0])
    expect(wilson(0, 0)).toBeNull()
    for (const [lo, hi] of [small, big]) { expect(lo).toBeGreaterThanOrEqual(0); expect(hi).toBeLessThanOrEqual(1) }
  })
})

describe('retention by interval', () => {
  it('buckets outcomes by the gap since the previous evidence', () => {
    const rs = [
      review([2, 1, 1], 'independent', daysAgo(40)),
      review([2, 1, 1], 'independent', daysAgo(39)),   // 1 day gap, success
      review([2, 1, 1], 'failed', daysAgo(30)),        // 9 days gap, failure
      review([2, 1, 1], 'independent', daysAgo(29)),
    ]
    const b = retentionByInterval(rs)
    const oneToTwo = b.find((x) => x.label === '1–2 days')!
    const wk = b.find((x) => x.label === '1–2 weeks')!
    expect(oneToTwo.n).toBe(2); expect(oneToTwo.recalled).toBe(2)
    expect(wk.n).toBe(1); expect(wk.recalled).toBe(0)
    expect(b.find((x) => x.label === 'over 3 months')!.rate).toBeNull()
  })
  it('does not count diluted passage evidence as solid', () => {
    const big = (d: number) => review([2, 1, 30], 'independent', daysAgo(d))
    const b = retentionByInterval([big(10), big(5)])
    expect(b.reduce((n, x) => n + x.n, 0)).toBe(0)    // weight < 0.5 for a 30-ayah passage
  })
})

describe('learning effort', () => {
  it('measures active time to the first independent recall', () => {
    const s = learningSamples([review([112, 1, 1], 'independent', daysAgo(5), { context: 'new', durationMs: 4000 })], [flow(112, 1, 26000, daysAgo(5) - 1)], corpus)
    expect(s).toHaveLength(1)
    expect(s[0]!.activeMs).toBe(30000)
    expect(s[0]!.words).toBe(10)
  })
  it('ignores time after the first accurate recall', () => {
    const rs = [review([112, 1, 1], 'independent', daysAgo(5), { context: 'new', durationMs: 1000 }), review([112, 1, 1], 'independent', daysAgo(3), { context: 'new', durationMs: 99999 })]
    expect(learningSamples(rs, [], corpus)[0]!.activeMs).toBe(1000)
  })
  it('only offers a personal pace after enough samples', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ surah: 112, ayah: i + 1, words: 10, activeMs: 80000 }))
    expect(learningSecPerWord(mk(4))).toBeNull()
    expect(learningSecPerWord(mk(5))).toBe(8)
  })
  it('groups by ayah length and refuses a listening comparison without enough data', () => {
    const l = learningByLength([{ surah: 1, ayah: 1, words: 5, activeMs: 10000 }, { surah: 2, ayah: 255, words: 50, activeMs: 200000 }])
    expect(l[0]!.n).toBe(1); expect(l[2]!.n).toBe(1); expect(l[1]!.n).toBe(0); expect(l[1]!.medianSecPerWord).toBeNull()
    expect(compareListening([]).verdict).toMatch(/Not enough data/)
  })
})

describe('coverage, weak spots, time', () => {
  it('counts coverage without conflating claims and demonstrated recall', () => {
    const d = deriveState({ reviews: [review([1, 1, 3], 'independent', daysAgo(2))], flows: [], declarations: [{ id: 'x', range: { surah: 112, start: 1, end: 4 }, level: 'known', occurredAt: daysAgo(9) }] })
    const c = coverage(d, corpus, NOW)
    expect(c.declared).toBe(4)
    expect(c.demonstrated).toBe(3)
    expect(c.byStage.claimed).toBe(4)
    expect(c.verifiedLast7).toBe(3)
  })
  it('ranks weak spots by lapses and prompts', () => {
    const d = deriveState({ reviews: [review([2, 5, 5], 'independent', daysAgo(20)), review([2, 5, 5], 'failed', daysAgo(10)), review([2, 6, 6], 'prompted', daysAgo(3))], flows: [], declarations: [] })
    expect(weakSpots(d, NOW)[0]).toMatchObject({ surah: 2, ayah: 5, lapses: 1 })
  })
  it('sums practice time per week', () => {
    const w = weeklyTime([review([1, 1, 1], 'independent', NOW - DAY, { durationMs: 600000 })], [flow(1, 1, 300000, NOW)], NOW, 4)
    expect(w).toHaveLength(4)
    expect(w.reduce((n, x) => n + x.minutes, 0)).toBeCloseTo(15, 5)
  })
})

describe('14-day experiment', () => {
  const r = (a: number, b: number): Range => ({ surah: 2, start: a, end: b })
  it('keeps total words balanced between arms and is stable per passage', () => {
    let x = newExperiment('11111111-1111-4111-8111-111111111111', NOW)
    for (let i = 0; i < 20; i++) { const rg = r(i * 3 + 1, i * 3 + 3); x = withAssignment(x, rg, assignArm(x, rg, corpus), NOW) }
    const count = { A: 0, B: 0 }
    for (const v of Object.values(x.assignments)) count[v]++
    expect(Math.abs(count.A - count.B)).toBeLessThanOrEqual(1)
    expect(assignArm(x, r(1, 3), corpus)).toBe(x.assignments['2:1-3'])
    expect(armOfAyah(x, 2, 2)).toBe(x.assignments['2:1-3'])
    expect(armOfAyah(x, 3, 1)).toBeUndefined()
  })
  it('says there is no data, then insufficient data, and never declares a winner early', () => {
    let x = newExperiment('11111111-1111-4111-8111-111111111111', NOW)
    expect(readout(x, [], [], corpus).verdict).toBe('no-data')
    x = withAssignment(x, r(1, 2), 'A', NOW); x = withAssignment(x, r(3, 4), 'B', NOW)
    const ro = readout(x, [], [], corpus)
    expect(ro.verdict).toBe('insufficient')
    expect(ro.headline).toMatch(/Not enough data/)
    expect(ro.caveats.length).toBeGreaterThan(3)
  })
  it('reports delayed recall per arm with intervals once data exists', () => {
    let x = newExperiment('11111111-1111-4111-8111-111111111111', daysAgo(14))
    const rs = [] as ReturnType<typeof review>[]
    for (let i = 0; i < 10; i++) {
      const a = i + 1, arm = i % 2 === 0 ? 'A' : 'B'
      x = withAssignment(x, r(a, a), arm, daysAgo(14))
      rs.push(review([2, a, a], 'independent', daysAgo(10), { context: 'new', durationMs: arm === 'A' ? 60000 : 30000, strategy: arm }))
      rs.push(review([2, a, a], arm === 'A' ? 'failed' : 'independent', daysAgo(8), { strategy: arm }))
    }
    const ro = readout(x, rs, [], corpus)
    const [A, B] = ro.arms
    expect(A.delayedTested).toBe(5); expect(B.delayedTested).toBe(5)
    expect(A.delayedIndependent).toBe(0); expect(B.delayedIndependent).toBe(5)
    expect(B.medianSecPerWord).toBeLessThan(A.medianSecPerWord!)
    expect(A.delayedCi).toBeTruthy()
  })
})
