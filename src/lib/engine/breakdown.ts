// Practice breaks for long ayahs.
//
// Stop signs (phrases.ts) are the first and best source, but 71% of ayahs have none and many long ayahs (Ta-Ha 40 has 34 words, 97 has 28,
// 71 and 86 have 26) would otherwise be one unbroken block. This adds PRACTICE breaks inside any stretch that is too long to learn
// in one piece. They are for memorising, not rulings on where to stop when reciting, and are never presented as authoritative.
//
// Where a break goes, in order of trust:
//   1. a pause the reciter actually made (from measured word timings), if a timing is available;
//   2. otherwise the start of a new clause, judged only from spelling (a conjunction or a clause-opening particle), and never between a
//      short particle or preposition and what follows it.
// Pieces aim for about TARGET words, never fewer than MIN.
import { suggestBoundaries } from './phrases'

export const MAX_PIECE = 10
export const TARGET_PIECE = 7
export const MIN_PIECE = 3
const REAL_PAUSE_MS = 150

// Letters only: no vowels, signs, tatweel or stop marks, with alef variants unified.
const BASE = /[ؐ-ًؚ-ٰٟۖ-ۭـ࣓-ࣿ]/g
export const baseLetters = (w: string) => w.replace(BASE, '').replace(/[أإآٱ]/g, 'ا')

/** Clause-opening words: a new thought starts here, so a practice break just before them is natural. */
const OPENERS = new Set(['ثم', 'اذ', 'اذا', 'قال', 'قالوا', 'قالت', 'قل', 'لكن', 'حتي', 'بل', 'ام', 'او', 'ان', 'انا', 'انه', 'ولقد', 'ولكن', 'فلما', 'وما', 'ولا', 'ومن', 'كذلك', 'الم', 'هل', 'يا', 'يايها', 'فاذا', 'ولو', 'لو', 'كلا', 'والذين', 'الذين', 'ومن'])
/** Short words that belong with what follows: a break straight after them would separate a preposition or particle from its object. */
const BINDERS = new Set(['في', 'من', 'عن', 'علي', 'الي', 'ب', 'ل', 'لا', 'ما', 'لم', 'لن', 'ان', 'ا', 'ك', 'و', 'ف', 'ثم', 'بل', 'يا', 'ها', 'مع', 'حتي', 'ان', 'اي', 'لدي', 'عند', 'بعد', 'قبل', 'كل', 'بين', 'دون', 'غير', 'الا', 'قد', 'لقد', 'ولا', 'فلا', 'وما', 'فما'])

function score(words: string[], i: number): number {
  // Break after word i: the next piece starts with words[i + 1].
  const next = baseLetters(words[i + 1]!), cur = baseLetters(words[i]!)
  let s = 0
  if (OPENERS.has(next)) s += 3
  else if (next.length > 2 && (next.startsWith('و') || next.startsWith('ف'))) s += 2          // a conjunction attached to the next word
  if (BINDERS.has(cur) || cur.length <= 2) s -= 5
  if (cur.length <= 3 && /^[بلكوف]/.test(cur)) s -= 2
  return s
}

export interface Pause { afterWord: number; ms: number }
export interface Breakdown { boundaries: number[]; reasons: Record<number, string> }

/**
 * Split any stretch longer than MAX_PIECE into pieces of about TARGET_PIECE words. `fixed` are boundaries that already exist (stop signs).
 */
export function suggestBreakdown(words: string[], fixed: number[], pauses: Pause[] = []): Breakdown {
  const boundaries = new Set(fixed)
  const reasons: Record<number, string> = {}
  const pauseAfter = new Map(pauses.map((p) => [p.afterWord, p.ms]))
  const cuts = [-1, ...[...boundaries].sort((a, b) => a - b), words.length - 1]
  for (let c = 0; c + 1 < cuts.length; c++) {
    const lo = cuts[c]! + 1, hi = cuts[c + 1]!
    const len = hi - lo + 1
    if (len <= MAX_PIECE) continue
    const k = Math.ceil(len / TARGET_PIECE)
    const placed: number[] = []
    for (let n = 1; n < k; n++) {
      const ideal = lo + Math.round((len * n) / k) - 1
      let best = -1, bestScore = -Infinity, bestPause = 0
      const from = Math.max(lo + MIN_PIECE - 1, (placed.at(-1) ?? lo - 1) + MIN_PIECE, ideal - 3)
      for (let i = from; i <= Math.min(hi - MIN_PIECE, ideal + 3); i++) {
        const ms = pauseAfter.get(i) ?? 0
        // A measured pause outweighs spelling clues; among equals, nearer to the ideal size wins.
        const sc = (ms >= REAL_PAUSE_MS ? 100 + ms / 10 : 0) + score(words, i) - Math.abs(i - ideal) * 0.6
        if (sc > bestScore) { bestScore = sc; best = i; bestPause = ms }
      }
      if (best >= 0) {
        placed.push(best)
        boundaries.add(best)
        reasons[best] = bestPause >= REAL_PAUSE_MS ? `the reciter pauses here (about ${Math.round(bestPause / 10) * 10} ms)` : 'a practice break so the phrase is a manageable length'
      }
    }
  }
  return { boundaries: [...boundaries].sort((a, b) => a - b), reasons }
}

/**
 * THE default phrase breaks of an ayah when the learner has not set their own: stop signs plus practice breaks in long stretches.
 * Every place that needs an ayah's phrases (learning, the slip repair after recall, the planner's repair ladder) must use this one
 * function, so a slip recorded in one place always refers to the same phrases in another.
 */
export const defaultBoundaries = (words: string[], pauses: Pause[] = []): number[] => suggestBreakdown(words, suggestBoundaries(words).boundaries, pauses).boundaries
