// One record of what the learner knows. Exercises produce evidence; the evidence updates shared state; every screen asks the same state what is needed.
import { describe, expect, it } from 'vitest'
import { deriveState } from '@/lib/engine/derive'
import { junctionDue, neededRange, partCreditFromReviews, partsFor, reviewObligation } from '@/lib/engine/evidence'
import { buildPlan, type PlannerInput } from '@/lib/engine/planner'
import { partProgress } from '@/lib/engine/parts'
import { dueAt } from '@/lib/engine/memory'
import { ayahKey, DAY, type FlowEvent, type LearningTarget, type ReviewEvent } from '@/lib/engine/types'
import { NOW, daysAgo, review } from './helpers'

// Ta-Ha 20:5 is a 40-word ayah (for the part tests); every other ayah has 12 words.
const corpus = { ayahCount: (x: number) => ({ 2: 286, 20: 135, 112: 4 } as Record<number, number>)[x] ?? 30, wordCount: (x: number, a: number) => (x === 20 && a === 5 ? 40 : 12) }
const target = (id: string, s: number, a: number, b: number): LearningTarget => ({ id, range: { surah: s, start: a, end: b }, status: 'active', createdAt: Number(id.replace(/\D/g, '')) || 1, updatedAt: 1 })
const flow = (s: number, a: number, rating: FlowEvent['rating'], at: number): FlowEvent => ({ id: `f${s}${a}${at}`, surah: s, ayah: a, fromPhrase: 0, toPhrase: 0, phraseCount: 1, rating, reps: 5, durationMs: 60000, occurredAt: at })
const derive = (reviews: ReviewEvent[], flows: FlowEvent[] = []) => deriveState({ reviews, flows, declarations: [] }, { corpus })
function planAt(d: ReturnType<typeof derive>, targets: LearningTarget[], now = NOW, over: Partial<PlannerInput> = {}) {
  return buildPlan({ now, derived: d, corpus, targets, minutes: 20, planNew: true, newPerDayCap: 10, learnedToday: 0, learningSecPerWord: null, lastSessionAt: now - DAY, ...over })
}
const inNo = () => false

describe('one record, however the evidence was produced', () => {
  it('the same recall produces the same ayah state whichever screen recorded it', () => {
    const mk = (context: ReviewEvent['context']) => derive([{ ...review([20, 7, 9], 'independent', daysAgo(2)), context, sessionId: context }])
    const base = mk('free').memory.get(ayahKey(20, 8))!
    for (const c of ['new', 'sabqi', 'manzil', 'repair', 'verify'] as const) expect(mk(c).memory.get(ayahKey(20, 8))).toEqual(base)
  })
  it('evidence from a revision block updates the ayah everywhere: it is a different range of the same ayah, not a different record', () => {
    const d = derive([review([20, 8, 8], 'independent', daysAgo(1)), review([20, 7, 9], 'independent', daysAgo(0.5))])
    const m = d.memory.get(ayahKey(20, 8))!
    expect(m.reviews).toBe(2)
    expect(m.singleIndependents).toBe(1)           // the single recall still counts as a single-ayah check
    expect(m.passageSuccesses).toBeGreaterThan(0)  // and the passage recall was added to the SAME record
  })
})

describe('no duplicate obligations', () => {
  it('overlapping goals never ask for the same ayah twice: every ayah is in at most one planned item', () => {
    const rs = [...Array.from({ length: 12 }, (_, i) => review([20, 1 + i, 1 + i], 'independent', daysAgo(6)))]
    const d = derive(rs)
    const p = planAt(d, [target('t1', 20, 1, 30), target('t2', 20, 8, 40), target('t3', 20, 10, 20)])
    const seen = new Map<number, string>()
    for (const it of p.items.filter((i) => !i.drill)) for (let a = it.range.start; a <= it.range.end; a++) {
      expect(seen.has(a), `ayah ${a} is in both ${seen.get(a)} and ${it.id}`).toBe(false)
      seen.set(a, it.id)
    }
  })
  it('a goal does not keep its own progress: its progress is read from the ayahs, so two goals over the same ayahs agree', () => {
    const d = derive([review([20, 1, 3, ] as never, 'independent', daysAgo(1))])
    const have = (a: number, b: number) => [...Array(b - a + 1)].filter((_, i) => d.memory.get(ayahKey(20, a + i))?.firstDemonstratedAt).length
    expect(have(1, 3)).toBe(3); expect(have(2, 5)).toBe(2)
  })
  it('one successful verified recall does not create an immediate duplicate recall obligation anywhere', () => {
    // Taha 7–9 was due; the learner recalled it (text hidden) in one session.
    const before = derive([review([20, 7, 9], 'independent', daysAgo(8))])
    expect(planAt(before, []).items.some((i) => i.range.surah === 20)).toBe(true)
    const after = derive([review([20, 7, 9], 'independent', daysAgo(8)), review([20, 7, 9], 'independent', NOW - 60_000)])
    const p = planAt(after, [target('t1', 20, 1, 20)])
    expect(p.items.filter((i) => i.kind !== 'new' && i.range.surah === 20 && i.range.end >= 7 && i.range.start <= 9)).toHaveLength(0)
    for (let a = 7; a <= 9; a++) expect(reviewObligation(after.memory.get(ayahKey(20, a))!, after.flow.get(ayahKey(20, a)), NOW, true)).toBeNull()
  })
  it('a plan made earlier is reconciled with later evidence: covered ayahs are dropped, the ends trimmed, nothing needed gives null', () => {
    const old = [7, 8, 9, 10].map((a) => review([20, a, a], 'independent', daysAgo(9)))
    const planned = planAt(derive(old), [])
    const item = planned.items.find((i) => i.range.surah === 20)!
    expect(item.range).toEqual({ surah: 20, start: 7, end: 10 })
    // Meanwhile (another screen, another goal) ayahs 7 and 10 were recalled.
    const later = derive([...old, review([20, 7, 7], 'independent', NOW - 1000), review([20, 10, 10], 'independent', NOW - 1000)])
    const n = neededRange(item.range, later, NOW, inNo)
    expect(n.range).toEqual({ surah: 20, start: 8, end: 9 })
    expect(n.covered).toEqual([7, 10])
    const all = derive([...old, review([20, 7, 10], 'independent', NOW - 1000)])
    expect(neededRange(item.range, all, NOW, inNo).range).toBeNull()
  })
  it('an ayah that is still due stays needed (nothing is dropped that has not been shown)', () => {
    const d = derive([7, 8, 9].map((a) => review([20, a, a], 'independent', daysAgo(9))))
    expect(neededRange({ surah: 20, start: 7, end: 9 }, d, NOW, inNo).range).toEqual({ surah: 20, start: 7, end: 9 })
  })
  it('spaced revision still returns at its interval: covered now, due later', () => {
    const d = derive([review([20, 5, 5], 'independent', NOW - 3600_000)])
    const m = d.memory.get(ayahKey(20, 5))!
    expect(reviewObligation(m, undefined, NOW, false)).toBeNull()
    const later = dueAt(m) + 1000
    expect(reviewObligation(m, undefined, later, false)).not.toBeNull()
    expect(planAt(d, [], later, { lastSessionAt: later - DAY }).items.some((i) => i.range.start <= 5 && i.range.end >= 5)).toBe(true)
  })
})

describe('practice is not memory: reading with the text visible cannot satisfy a recall', () => {
  it('flow practice (any rating, any number) never demonstrates an ayah, and the ayah still needs a recall', () => {
    const flows = [flow(112, 1, 'natural', daysAgo(1)), flow(112, 1, 'natural', daysAgo(0.5)), flow(112, 1, 'natural', NOW - 1000)]
    const d = derive([], flows)
    expect(d.memory.get(ayahKey(112, 1))?.firstDemonstratedAt ?? null).toBeNull()
    const p = planAt(d, [target('t1', 112, 1, 4)])
    expect(p.items.find((i) => i.kind === 'new')!.range.start).toBe(1)                // still to be learned: practice did not tick it off
    expect(planAt(d, []).items.some((i) => i.range.surah === 112)).toBe(false)         // outside a goal, practice alone creates no revision obligation and no memory
    expect(d.memory.size).toBe(0)
  })
  it('a "recall" with the whole text visible (cue 0) carries no evidence at all', () => {
    const d = derive([review([112, 1, 4], 'independent', NOW - 1000, { cueLevel: 0 })])
    expect(d.memory.size).toBe(0)
  })
  it('a hinted recall is never counted as independent', () => {
    const d = derive([review([112, 2, 2], 'hesitant', NOW - 1000, { cueLevel: 2 })])
    const m = d.memory.get(ayahKey(112, 2))!
    expect(m.independents).toBe(0); expect(m.singleIndependents).toBe(0)
  })
  it('practice never raises confidence in an ayah that has a history: only recalls move its schedule', () => {
    const base = derive([review([112, 3, 3], 'independent', daysAgo(10))])
    const withPractice = derive([review([112, 3, 3], 'independent', daysAgo(10))], [flow(112, 3, 'natural', daysAgo(1)), flow(112, 3, 'natural', NOW - 1000)])
    expect(withPractice.memory.get(ayahKey(112, 3))).toEqual(base.memory.get(ayahKey(112, 3)))
  })
})

describe('transitions and larger passages credit only what they show', () => {
  it('a transition recited from memory credits that transition, and neither whole ayah', () => {
    const j = (grade: 'independent' | 'failed', at: number): ReviewEvent => ({ ...review([20, 7, 8], grade, at), kind: 'junction', stumbles: [] })
    const d = derive([j('independent', NOW - 1000)])
    expect(d.junctions.get(ayahKey(20, 7))!.ok).toBeGreaterThan(0)
    expect(d.memory.size).toBe(0)
  })
  it('the transition record is the same wherever it was practised (a passage recall and a drill land in one record)', () => {
    const passage = review([20, 7, 9], 'independent', daysAgo(1))
    const drill: ReviewEvent = { ...review([20, 8, 9], 'independent', daysAgo(0.5)), kind: 'junction' }
    const d = derive([passage, drill])
    const t = d.junctions.get(ayahKey(20, 8))!
    expect(t.ok).toBeGreaterThan(passage ? 0.8 : 0)      // both contributed to the SAME transition record
    expect(d.junctions.get(ayahKey(20, 7))!.ok).toBeGreaterThan(0)
  })
  it('a wobbly transition is not drilled again right after it was recited cleanly, but still comes back if it wobbles again', () => {
    const wobble = (at: number) => review([20, 7, 9], 'independent', at, { shakyJunctions: [7] })
    const rs = [wobble(daysAgo(5)), wobble(daysAgo(4)), wobble(daysAgo(3))]
    const wobbling = derive(rs).junctions.get(ayahKey(20, 7))!
    expect(junctionDue(wobbling, NOW)).toBe(true)
    const drill: ReviewEvent = { ...review([20, 7, 8], 'independent', NOW - 3600_000), kind: 'junction' }
    const cleaned = derive([...rs, drill]).junctions.get(ayahKey(20, 7))!
    expect(junctionDue(cleaned, NOW)).toBe(false)               // not again today
    expect(junctionDue({ ...cleaned, lastAt: NOW - 20 * 3600_000 }, NOW)).toBe(cleaned.shaky - 0.5 * cleaned.ok > 0.5)   // later, if it still has not recovered
  })
})

describe('what a whole-ayah attempt demonstrates about its parts (and no more)', () => {
  const SPANS = [0, 10, 20, 30].map((f) => ({ from: f, to: f + 9 }))
  const prog = (d: ReturnType<typeof derive>) => partProgress(SPANS, partsFor(d, 20, 5), NOW)
  it('an accurate recall with the text hidden secures every part', () => {
    const d = derive([review([20, 5, 5], 'independent', NOW - 1000)])
    expect(prog(d).allSecured).toBe(true)
  })
  it('a recall that went wrong at a word the learner marked secures the parts before it, and not the one containing it', () => {
    const d = derive([review([20, 5, 5], 'prompted', NOW - 1000, { wordIssues: [{ ayah: 5, word: 23, kind: 'forgot' }], stumbles: [{ ayah: 5, kind: 'prompted' }] })])
    const p = prog(d)
    expect(p.phrases.map((x) => x.secured)).toEqual([true, true, false, false])
    expect(p.weak).toEqual([2])
  })
  it('a pronunciation concern does not mark a part as forgotten', () => {
    const d = derive([review([20, 5, 5], 'independent', NOW - 1000, { wordIssues: [{ ayah: 5, word: 23, kind: 'pronunciation' }] })])
    expect(prog(d).allSecured).toBe(true)
  })
  it('a failure with no marked word, a hinted recall and practice demonstrate nothing about any part', () => {
    expect(prog(derive([review([20, 5, 5], 'failed', NOW - 1000)])).started).toBe(false)
    expect(prog(derive([review([20, 5, 5], 'hesitant', NOW - 1000, { cueLevel: 2 })])).started).toBe(false)
    expect(prog(derive([], [flow(20, 5, 'natural', NOW - 1000)])).started).toBe(false)
  })
  it('a passage recall credits each ayah in it; the credit is never stored and never feeds the ayah memory', () => {
    const rs = [review([20, 4, 6], 'independent', NOW - 1000)]
    const withCorpus = derive(rs), without = deriveState({ reviews: rs, flows: [], declarations: [] })
    expect([...partCreditFromReviews(rs, corpus).keys()].sort()).toEqual(['20:4', '20:5', '20:6'])
    expect(without.partCredit.size).toBe(0)
    expect([...withCorpus.memory.entries()]).toEqual([...without.memory.entries()])
  })
})

describe('existing history is not inflated', () => {
  it('deriving with or without part credit gives identical ayah, transition and flow state for any history', () => {
    const rs = [review([20, 1, 9], 'independent', daysAgo(30)), review([20, 5, 5], 'prompted', daysAgo(10), { wordIssues: [{ ayah: 5, word: 3, kind: 'wrong' }] }), review([112, 1, 4], 'hesitant', daysAgo(3), { cueLevel: 3 })]
    const a = derive(rs, [flow(20, 5, 'tangled', daysAgo(10))]), b = deriveState({ reviews: rs, flows: [flow(20, 5, 'tangled', daysAgo(10))], declarations: [] })
    expect([...a.memory.entries()]).toEqual([...b.memory.entries()])
    expect([...a.junctions.entries()]).toEqual([...b.junctions.entries()])
    expect([...a.flow.entries()]).toEqual([...b.flow.entries()])
  })
})
