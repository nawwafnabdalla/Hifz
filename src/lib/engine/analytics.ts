// Analytics computed from the event log. Every figure carries its sample size, and
// anything the data cannot support is reported as "not enough evidence" rather than guessed.
import { attribute } from './attribution'
import { ayahStatus, summariseSurah, type Derived, type Stage } from './derive'
import { ayahKey, DAY, type Corpus, type FlowEvent, type ReviewEvent } from './types'

export function wilson(successes: number, n: number, z = 1.96): [number, number] | null {
  if (n <= 0) return null
  const p = successes / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)]
}
export const median = (xs: number[]): number | null => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

// ── Retention by interval ────────────────────────────────────────────────────
export interface RetentionBucket {
  label: string
  n: number
  recalled: number
  independent: number
  rate: number | null
  ci: [number, number] | null
}
const BUCKETS: [string, number, number][] = [
  ['under 1 day', 0, 1], ['1–2 days', 1, 3], ['3–6 days', 3, 7], ['1–2 weeks', 7, 14], ['2–4 weeks', 14, 30], ['1–3 months', 30, 90], ['over 3 months', 90, Infinity],
]
/**
 * Recall outcomes grouped by the gap since the previous evidence for the same ayah.
 * Counts ayah-level attempts with solid weight; ayahs in one passage are not independent
 * observations, so intervals are indicative only.
 */
export function retentionByInterval(reviews: ReviewEvent[]): RetentionBucket[] {
  const last = new Map<string, number>()
  const acc = BUCKETS.map(() => ({ n: 0, recalled: 0, independent: 0 }))
  const sorted = [...reviews].sort((a, b) => a.occurredAt - b.occurredAt)
  for (const e of sorted) {
    for (const ev of attribute(e).ayahs) {
      if (ev.outcome === 'untested') continue
      const k = ayahKey(ev.surah, ev.ayah)
      const prev = last.get(k)
      if (prev !== undefined && ev.weight >= 0.5) {
        const days = (ev.at - prev) / DAY
        const i = BUCKETS.findIndex(([, lo, hi]) => days >= lo && days < hi)
        if (i >= 0) {
          acc[i]!.n++
          if (ev.outcome === 'independent' || ev.outcome === 'hesitant') acc[i]!.recalled++
          if (ev.outcome === 'independent') acc[i]!.independent++
        }
      }
      last.set(k, ev.at)
    }
  }
  return BUCKETS.map(([label], i) => {
    const a = acc[i]!
    return { label, ...a, rate: a.n ? a.recalled / a.n : null, ci: wilson(a.recalled, a.n) }
  })
}

// ── Learning effort ──────────────────────────────────────────────────────────
export interface LearningSample {
  surah: number
  ayah: number
  words: number
  activeMs: number
  strategy?: 'A' | 'B'
  listenedFirst?: boolean
}

/**
 * Active time spent on each ayah before its first independent recall from memory.
 * Event durations are split evenly across the ayahs they cover. Only ayahs with a
 * recorded learning episode that reached an independent recall are included.
 */
export function learningSamples(reviews: ReviewEvent[], flows: FlowEvent[], corpus: Corpus): LearningSample[] {
  type Item = { at: number; ms: number; covers: [number, number, number]; strategy?: 'A' | 'B'; listened?: boolean; success: boolean; hidden: boolean }
  const items: Item[] = []
  for (const f of flows) items.push({ at: f.occurredAt, ms: f.durationMs, covers: [f.surah, f.ayah, f.ayah], strategy: f.strategy, listened: f.listenedFirst, success: false, hidden: false })
  for (const r of reviews) {
    if (r.kind !== 'recall' || r.context !== 'new') continue
    items.push({ at: r.occurredAt, ms: r.durationMs, covers: [r.range.surah, r.range.start, r.range.end], strategy: r.strategy, listened: r.listenedFirst, success: r.grade === 'independent' && r.cueLevel >= 3, hidden: true })
  }
  items.sort((a, b) => a.at - b.at)
  const progress = new Map<string, { ms: number; strategy?: 'A' | 'B'; listened?: boolean; done: boolean }>()
  const out: LearningSample[] = []
  for (const it of items) {
    const [s, a, b] = it.covers
    const share = it.ms / (b - a + 1)
    for (let x = a; x <= b; x++) {
      const k = ayahKey(s, x)
      const p = progress.get(k) ?? { ms: 0, done: false }
      if (p.done) continue
      p.ms += share
      p.strategy ??= it.strategy
      p.listened ??= it.listened
      if (it.success) {
        p.done = true
        out.push({ surah: s, ayah: x, words: corpus.wordCount(s, x), activeMs: p.ms, strategy: p.strategy, listenedFirst: p.listened })
      }
      progress.set(k, p)
    }
  }
  return out
}

export const MIN_SAMPLES_FOR_PACE = 5
export function learningSecPerWord(samples: LearningSample[]): number | null {
  if (samples.length < MIN_SAMPLES_FOR_PACE) return null
  return median(samples.filter((s) => s.words > 0).map((s) => s.activeMs / 1000 / s.words))
}

export interface LengthBucket { label: string; n: number; medianSecPerWord: number | null; medianSeconds: number | null }
export function learningByLength(samples: LearningSample[]): LengthBucket[] {
  const defs: [string, (w: number) => boolean][] = [['Short (up to 10 words)', (w) => w <= 10], ['Medium (11–25)', (w) => w > 10 && w <= 25], ['Long (over 25)', (w) => w > 25]]
  return defs.map(([label, f]) => {
    const xs = samples.filter((s) => f(s.words))
    return { label, n: xs.length, medianSecPerWord: median(xs.map((s) => s.activeMs / 1000 / s.words)), medianSeconds: median(xs.map((s) => s.activeMs / 1000)) }
  })
}

export interface ObservationalComparison {
  question: string
  a: { label: string; n: number; medianSecPerWord: number | null }
  b: { label: string; n: number; medianSecPerWord: number | null }
  verdict: string
}
export const MIN_PER_GROUP = 8
export function compareListening(samples: LearningSample[]): ObservationalComparison {
  const withL = samples.filter((s) => s.listenedFirst === true && s.words > 0)
  const without = samples.filter((s) => s.listenedFirst === false && s.words > 0)
  const m = (xs: LearningSample[]) => median(xs.map((s) => s.activeMs / 1000 / s.words))
  const enough = withL.length >= MIN_PER_GROUP && without.length >= MIN_PER_GROUP
  return {
    question: 'Does listening first change how long learning takes?',
    a: { label: 'Listened first', n: withL.length, medianSecPerWord: m(withL) },
    b: { label: 'Did not listen first', n: without.length, medianSecPerWord: m(without) },
    verdict: enough
      ? 'This compares ayahs you chose to listen to first against ones you did not. Easier or shorter ayahs may differ in both, so treat any gap as a hint, not a result.'
      : `Not enough data yet: at least ${MIN_PER_GROUP} ayahs are needed in each group.`,
  }
}

// ── Coverage, debt, weak spots, time ─────────────────────────────────────────
export interface Coverage {
  byStage: Record<Stage, number>
  declared: number
  demonstrated: number
  verifiedLast7: number
  verifiedLast30: number
  surahsComplete: number
  dueNow: number
}
export function coverage(d: Derived, corpus: Corpus, now: number): Coverage {
  const byStage: Record<Stage, number> = { not_started: 0, learning: 0, claimed: 0, reviewing: 0, needs_repair: 0, strong: 0 }
  let declared = 0, demonstrated = 0, v7 = 0, v30 = 0, complete = 0, due = 0
  for (let s = 1; s <= 114; s++) {
    const sum = summariseSurah(s, corpus, d, now)
    for (const k of Object.keys(byStage) as Stage[]) byStage[k] += sum.counts[k]
    due += sum.dueNow
    const known = sum.counts.claimed + sum.counts.reviewing + sum.counts.needs_repair + sum.counts.strong
    if (known === sum.total) complete++
  }
  for (const m of d.memory.values()) {
    if (m.claimed) declared++
    if (m.firstDemonstratedAt !== null) demonstrated++
    if (m.lastSuccessAt && now - m.lastSuccessAt < 7 * DAY) v7++
    if (m.lastSuccessAt && now - m.lastSuccessAt < 30 * DAY) v30++
  }
  return { byStage, declared, demonstrated, verifiedLast7: v7, verifiedLast30: v30, surahsComplete: complete, dueNow: due }
}

export interface WeakSpot { surah: number; ayah: number; lapses: number; prompts: number; lastOutcome: string | null; stage: Stage }
export function weakSpots(d: Derived, now: number, limit = 8): WeakSpot[] {
  return [...d.memory.values()]
    .filter((m) => m.lapses + m.prompts > 0)
    .map((m) => ({ surah: m.surah, ayah: m.ayah, lapses: m.lapses, prompts: m.prompts, lastOutcome: m.lastOutcome, stage: ayahStatus(m, d.flow.get(ayahKey(m.surah, m.ayah)), now).stage, score: m.lapses * 2 + m.prompts }))
    .sort((a, b) => b.score - a.score || a.surah - b.surah || a.ayah - b.ayah)
    .slice(0, limit)
    .map(({ score, ...rest }) => { void score; return rest })
}

export interface WeeklyTime { weekStart: number; minutes: number; days: number }
/** Active practice time per calendar week (Monday start, UTC), most recent `weeks` weeks. */
export function weeklyTime(reviews: ReviewEvent[], flows: FlowEvent[], now: number, weeks = 8): WeeklyTime[] {
  const monday = (t: number) => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) }
  const start = monday(now) - (weeks - 1) * 7 * DAY
  const buckets = Array.from({ length: weeks }, (_, i) => ({ weekStart: start + i * 7 * DAY, ms: 0, days: new Set<number>() }))
  for (const e of [...reviews, ...flows]) {
    if (e.occurredAt < start) continue
    const i = Math.floor((monday(e.occurredAt) - start) / (7 * DAY))
    const b = buckets[i]
    if (!b) continue
    b.ms += e.durationMs
    b.days.add(Math.floor(e.occurredAt / DAY))
  }
  return buckets.map((b) => ({ weekStart: b.weekStart, minutes: b.ms / 60000, days: b.days.size }))
}
