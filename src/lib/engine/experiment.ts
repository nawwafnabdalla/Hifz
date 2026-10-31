// A 14-day personal comparison of two memorisation methods.
//   A: your usual repeated recitation.
//   B: audio first, overlapping phrase practice (the Flow ladder), then retrieval.
// New passages are assigned an arm so total words stay balanced. The readout reports
// what was measured (time to first accurate recall; recall at a later review) with
// sample sizes and uncertainty, and says what a small, unblinded n=1 test cannot show.
import { ayahKey, DAY, type Corpus, type Experiment, type Range, type ReviewEvent, type Strategy, rangeKey } from './types'
import { learningSamples, median, wilson, type LearningSample } from './analytics'
import type { FlowEvent } from './types'

export const EXPERIMENT_DAYS = 14

export function newExperiment(id: string, now: number): Experiment {
  return { id, name: '14-day method comparison', startedAt: now, endsAt: now + EXPERIMENT_DAYS * DAY, assignments: {}, updatedAt: now }
}
export const isActive = (x: Experiment | undefined, now: number) => !!x && now >= x.startedAt && now < x.endsAt

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/** Balanced assignment: the arm with fewer words so far gets the next passage; ties are broken by a hash of the passage. */
export function assignArm(x: Experiment, range: Range, corpus: Corpus): Strategy {
  const existing = x.assignments[rangeKey(range)]
  if (existing) return existing
  const words = { A: 0, B: 0 }
  for (const [k, arm] of Object.entries(x.assignments)) {
    const m = /^(\d+):(\d+)-(\d+)$/.exec(k)
    if (!m) continue
    for (let a = +m[2]!; a <= +m[3]!; a++) words[arm] += corpus.wordCount(+m[1]!, a)
  }
  if (words.A !== words.B) return words.A < words.B ? 'A' : 'B'
  return hash(rangeKey(range)) % 2 === 0 ? 'A' : 'B'
}

export function withAssignment(x: Experiment, range: Range, arm: Strategy, now: number): Experiment {
  return { ...x, assignments: { ...x.assignments, [rangeKey(range)]: arm }, updatedAt: now }
}

export function armOfAyah(x: Experiment | undefined, surah: number, ayah: number): Strategy | undefined {
  if (!x) return undefined
  for (const [k, arm] of Object.entries(x.assignments)) {
    const m = /^(\d+):(\d+)-(\d+)$/.exec(k)
    if (m && +m[1]! === surah && ayah >= +m[2]! && ayah <= +m[3]!) return arm
  }
  return undefined
}

export interface ArmReadout {
  arm: Strategy
  label: string
  ayahs: number
  words: number
  learned: number
  medianSecPerWord: number | null
  delayedTested: number
  delayedIndependent: number
  delayedRecalled: number
  delayedIndependentRate: number | null
  delayedCi: [number, number] | null
}
export interface Readout {
  arms: [ArmReadout, ArmReadout]
  minPerArm: number
  verdict: 'no-data' | 'insufficient' | 'inconclusive' | 'suggestive'
  headline: string
  caveats: string[]
}
export const MIN_AYAHS_PER_ARM = 8
const DELAY_MIN_DAYS = 0.8   // the first review at least ~a day after first accurate recall

export function readout(x: Experiment, reviews: ReviewEvent[], flows: FlowEvent[], corpus: Corpus): Readout {
  const samples = learningSamples(reviews, flows, corpus)
  const sampleOf = new Map<string, LearningSample>(samples.map((s) => [ayahKey(s.surah, s.ayah), s]))
  const firstOk = new Map<string, number>()
  for (const r of [...reviews].sort((a, b) => a.occurredAt - b.occurredAt)) {
    if (r.kind !== 'recall' || r.grade !== 'independent' || r.cueLevel < 3) continue
    for (let a = r.range.start; a <= r.range.end; a++) if (!firstOk.has(ayahKey(r.range.surah, a))) firstOk.set(ayahKey(r.range.surah, a), r.occurredAt)
  }
  const delayed = new Map<string, ReviewEvent>()
  for (const r of [...reviews].sort((a, b) => a.occurredAt - b.occurredAt)) {
    if (r.kind !== 'recall' || r.cueLevel < 3) continue
    for (let a = r.range.start; a <= r.range.end; a++) {
      const k = ayahKey(r.range.surah, a)
      const t0 = firstOk.get(k)
      if (t0 === undefined || delayed.has(k) || (r.occurredAt - t0) / DAY < DELAY_MIN_DAYS) continue
      // Single-ayah or a short passage only: long passages dilute per-ayah evidence.
      if (r.range.end - r.range.start + 1 <= 3) delayed.set(k, r)
    }
  }
  const arm = (a: Strategy, label: string): ArmReadout => {
    const keys: string[] = []
    let words = 0
    for (const [k, v] of Object.entries(x.assignments)) {
      if (v !== a) continue
      const m = /^(\d+):(\d+)-(\d+)$/.exec(k)!
      for (let i = +m[2]!; i <= +m[3]!; i++) { keys.push(ayahKey(+m[1]!, i)); words += corpus.wordCount(+m[1]!, i) }
    }
    const learnedS = keys.map((k) => sampleOf.get(k)).filter((s): s is LearningSample => !!s && s.words > 0)
    const tested = keys.filter((k) => delayed.has(k))
    const ind = tested.filter((k) => delayed.get(k)!.grade === 'independent').length
    const rec = tested.filter((k) => ['independent', 'hesitant'].includes(delayed.get(k)!.grade)).length
    return {
      arm: a, label, ayahs: keys.length, words, learned: learnedS.length,
      medianSecPerWord: median(learnedS.map((s) => s.activeMs / 1000 / s.words)),
      delayedTested: tested.length, delayedIndependent: ind, delayedRecalled: rec,
      delayedIndependentRate: tested.length ? ind / tested.length : null, delayedCi: wilson(ind, tested.length),
    }
  }
  const A = arm('A', 'A: repeated recitation')
  const B = arm('B', 'B: audio first + phrase ladder + retrieval')
  const caveats = [
    'This is one person over two weeks, not blinded: you know which method you are using.',
    'Passages differ in difficulty even when word counts are balanced.',
    'Ayahs from one passage are not independent observations, so the intervals are optimistic.',
    'Delayed recall counts the first review at least a day after first accurate recall, on passages of up to three ayahs.',
    'Time per word counts active practice time you recorded, not time away from the app.',
  ]
  const minLearned = Math.min(A.learned, B.learned)
  const minTested = Math.min(A.delayedTested, B.delayedTested)
  if (A.ayahs + B.ayahs === 0) return { arms: [A, B], minPerArm: MIN_AYAHS_PER_ARM, verdict: 'no-data', headline: 'No passages assigned yet. New memorisation will be assigned to a method automatically.', caveats }
  if (minLearned < MIN_AYAHS_PER_ARM && minTested < MIN_AYAHS_PER_ARM) {
    return { arms: [A, B], minPerArm: MIN_AYAHS_PER_ARM, verdict: 'insufficient', headline: `Not enough data yet. At least ${MIN_AYAHS_PER_ARM} ayahs per method are needed before any comparison means anything.`, caveats }
  }
  const nonOverlap = A.delayedCi && B.delayedCi && (A.delayedCi[1] < B.delayedCi[0] || B.delayedCi[1] < A.delayedCi[0])
  const paceGap = A.medianSecPerWord !== null && B.medianSecPerWord !== null && Math.abs(A.medianSecPerWord - B.medianSecPerWord) / Math.max(A.medianSecPerWord, B.medianSecPerWord) > 0.3
  if (nonOverlap || (paceGap && minLearned >= MIN_AYAHS_PER_ARM)) {
    return { arms: [A, B], minPerArm: MIN_AYAHS_PER_ARM, verdict: 'suggestive', headline: 'There is a visible difference between the two methods. Treat it as suggestive, not proven; try it again on new passages.', caveats }
  }
  return { arms: [A, B], minPerArm: MIN_AYAHS_PER_ARM, verdict: 'inconclusive', headline: 'No clear difference so far. With this little data, that is the expected result either way.', caveats }
}
