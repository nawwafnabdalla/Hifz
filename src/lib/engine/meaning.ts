// The meaning of each practice phrase, taken VERBATIM from the translation the learner already reads, cut where the English clause that matches
// the phrase begins and ends (the cut points come from the offline word alignment: see docs/MEANING_BREAKDOWN.md).
// A phrase gets a meaning only if both of its cuts are known, consistent and the English is a plausible length for the Arabic; otherwise it gets
// none (never a guess): the whole-ayah translation remains. On the assistant's audit of 14 ayahs about 9 in 10 of the meanings shown were right.
import { meaningCut, meaningTextLength } from './breakdown'

export interface Span { from: number; to: number }
/** English words per Arabic word is about 1.7 in these translations; a snippet far outside this range was cut in the wrong place. */
export const MEANING_RATIO = [1.0, 2.8] as const
const wordsIn = (s: string) => (s.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []).length
/** Clean the ends of a verbatim cut: stray commas, dashes, a dangling opening quote. The words themselves are never changed. */
export function tidy(t: string): string {
  let x = t.trim()
  for (let i = 0; i < 3; i++) x = x.replace(/^[\s,;:\-–—]+|[\s,;:\-–—]+$/g, '').replace(/(^|[\s,])["“‘']$/, '').replace(/^[”’"']\s+/, '')
  return x.trim()
}
export function phraseMeanings(surah: number, ayah: number, translation: string, phrases: Span[]): (string | null)[] {
  const len = meaningTextLength(surah, ayah)
  if (len === null || len !== translation.length || phrases.length === 0) return phrases.map(() => null)
  const starts = phrases.map((_, i) => (i === 0 ? 0 : meaningCut(surah, ayah, phrases[i - 1]!.to)))
  const ends = phrases.map((_, i) => (i === phrases.length - 1 ? translation.length : meaningCut(surah, ayah, phrases[i]!.to)))
  return phrases.map((p, i) => {
    const a = starts[i], b = ends[i]
    if (a == null || b == null || b - a < 3) return null
    if (i > 0 && a < (ends[i - 1] ?? 0)) return null                                   // inconsistent order: do not show
    const t = tidy(translation.slice(a, b))
    const ratio = wordsIn(t) / (p.to - p.from + 1)
    return t.length >= 3 && ratio >= MEANING_RATIO[0] && ratio <= MEANING_RATIO[1] ? t : null
  })
}
