import type { Declaration, Grade, PracticeContext, ReviewEvent, Range, Stumble } from '@/lib/engine/types'
import { DAY } from '@/lib/engine/types'

let n = 0
export const NOW = Date.UTC(2026, 0, 15, 12, 0, 0)
export const daysAgo = (d: number) => NOW - d * DAY

export function review(range: Range | [number, number, number], grade: Grade, at: number, extra: Partial<ReviewEvent> = {}): ReviewEvent {
  const r = Array.isArray(range) ? { surah: range[0], start: range[1], end: range[2] } : range
  return {
    id: `r${++n}`, kind: 'recall', range: r, grade, context: 'free' as PracticeContext, cueLevel: 4,
    stumbles: [] as Stumble[], shakyJunctions: [], durationMs: 20000, occurredAt: at, ...extra,
  }
}
export function claim(range: [number, number, number], at: number, level: 'known' | 'retract' = 'known'): Declaration {
  return { id: `d${++n}`, range: { surah: range[0], start: range[1], end: range[2] }, level, occurredAt: at }
}
export const fakeCorpus = (counts: Record<number, number> = {}, words = 12) => ({
  ayahCount: (s: number) => counts[s] ?? 30,
  wordCount: () => words,
})
