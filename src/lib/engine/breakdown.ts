// Automatic practice phrases.
//
// The learner never chooses where to split. For each ayah the app decides, from several kinds of evidence, whether to break it at all and where:
//   1. Recitation guidance printed in the text: stop signs that permit or prefer a pause (phrases.ts).
//   2. Grammar: a model learned from every printed stop sign in the Qur'an (morphology: particles, case, construct phrases, verbs) gives each
//      word boundary a probability of being a natural clause boundary. It never breaks after a relative pronoun, a vocative or a negation,
//      nor between a noun and its adjective, and it was judged on surahs it never saw (data/crosscheck/phrase-model-report.json).
//   3. The reciter's own pauses, when verified word timings exist for the recording: they strengthen a grammatical candidate or veto one
//      the reciter ran straight through. A pause on its own is never enough to create a break.
// Short ayahs stay whole. A longer stretch is only broken where the evidence is good; if it is not, the stretch is left whole rather than guessed at.
// These are PRACTICE phrases for memorising. They are never presented as places to stop when reciting.
import cand from '@/data/generated/phrase-candidates.json'
import { suggestBoundaries } from './phrases'

/** Ayahs up to this many words are learned whole. */
export const WHOLE_LIMIT = 12
export const MIN_PIECE = 3
/** A piece longer than this is increasingly costly; a stretch up to about this long is left whole unless a good break exists. */
export const COMFORT = 14
/** Inside a long ayah (over 16 words) pieces are held to a tighter length, so a 28-word ayah is not offered as two 14-word blocks. */
export const COMFORT_LONG = 10
/** Probability above which a grammatical boundary is worth a break on its own. */
export const BREAK_P = 0.15
const LAMBDA = 0.3
const logit = (p: number) => Math.log(p / (1 - p))

export interface Pause { afterWord: number; ms: number }
export interface Candidate { after: number; p: number }
export type Basis = 'stop sign' | 'grammar' | 'grammar and the reciter’s pause'
export interface Breakdown { boundaries: number[]; basis: Record<number, Basis>; confidence: Record<number, number> }

type File = { ayahs: Record<string, { n: number; c: [number, number][] }> }
const FILE = cand as unknown as File
/** Grammar candidates for an ayah, or none if the data does not describe this exact text (word counts must match). */
export function candidatesFor(surah: number, ayah: number, wordCount: number): Candidate[] {
  const e = FILE.ayahs[`${surah}:${ayah}`]
  return e && e.n === wordCount ? e.c.map(([after, p]) => ({ after, p: p / 1000 })) : []
}

/** Long pieces cost more the longer they are; pieces of one or two words are almost never worth a break. */
const penalty = (len: number, comfort: number) => LAMBDA * Math.max(0, len - comfort) ** 2 + (len < 3 ? 40 : len < 4 ? 5 : 0)

/** Pure selection: which of the candidate boundaries to use. */
export function planBreaks(wordCount: number, stop: number[], candidates: Candidate[], pauses: Pause[] = [], avoid: number[] = []): Breakdown {
  const out: Breakdown = { boundaries: [], basis: {}, confidence: {} }
  if (wordCount <= WHOLE_LIMIT) return out
  const timed = pauses.length > 0
  const pauseAfter = new Map(pauses.map((p) => [p.afterWord, p.ms]))
  const gain = new Map<number, { g: number; p: number; stop: boolean; paused: boolean }>()
  const stopSet = new Set(stop)
  const ps = new Map(candidates.map((c) => [c.after, c.p]))
  const avoidSet = new Set(avoid)
  for (const b of new Set([...ps.keys(), ...stop])) {
    if (b < 0 || b >= wordCount - 1 || avoidSet.has(b)) continue
    const stopped = stopSet.has(b)
    const p = Math.min(0.97, Math.max(ps.get(b) ?? 0.02, stopped ? 0.85 : 0))
    let s = logit(p)
    const ms = pauseAfter.get(b)
    let paused = false
    if (timed) { if ((ms ?? 0) >= 150) { s += 1.2; paused = true } else if ((ms ?? 0) >= 100) { s += 0.5; paused = true } else if ((ms ?? 0) < 40) s -= 2.0 }
    gain.set(b, { g: s - logit(BREAK_P), p, stop: stopped, paused })
  }
  const NEG = -1e9
  const comfort = wordCount > 16 ? COMFORT_LONG : COMFORT
  const dp = new Array<number>(wordCount).fill(NEG), from = new Array<number>(wordCount).fill(-2)
  for (let j = 0; j < wordCount; j++) {
    const last = j === wordCount - 1
    const here = last ? 0 : gain.get(j)?.g
    if (here === undefined) continue
    for (let i = -1; i < j; i++) {
      const prev = i === -1 ? 0 : dp[i]!
      if (prev <= NEG / 2) continue
      const v = prev - penalty(j - i, comfort) + here
      if (v > dp[j]!) { dp[j] = v; from[j] = i }
    }
  }
  let j = wordCount - 1
  const picks: number[] = []
  while (j >= 0 && from[j]! !== -2) { const i = from[j]!; if (i >= 0) picks.push(i); j = i }
  picks.reverse()
  for (const b of picks) {
    const g = gain.get(b)!
    out.boundaries.push(b)
    out.basis[b] = g.stop ? 'stop sign' : g.paused ? 'grammar and the reciter’s pause' : 'grammar'
    out.confidence[b] = +g.p.toFixed(2)
  }
  return out
}

/**
 * THE default phrase breaks of an ayah when the learner has not set their own (which is almost always).
 * Every place that needs an ayah's phrases (learning, the slip repair after Recall) must use this one function, so a slip
 * marked in one place always refers to the same phrases in another.
 */
export function defaultBreakdown(surah: number, ayah: number, words: string[], pauses: Pause[] = []): Breakdown {
  // The "do not stop" sign (ۙ) marks a place a reciter should not pause; it is never a practice break either.
  const avoid = words.flatMap((w, i) => (w.includes('ۙ') ? [i] : []))
  return planBreaks(words.length, suggestBoundaries(words).boundaries, candidatesFor(surah, ayah, words.length), pauses, avoid)
}
export const defaultBoundaries = (surah: number, ayah: number, words: string[], pauses: Pause[] = []): number[] => defaultBreakdown(surah, ayah, words, pauses).boundaries

// Letters only: no vowels, signs, tatweel or stop marks, with alef variants unified.
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ࣓-ࣿ]/g
export const baseLetters = (w: string) => w.replace(MARKS, '').replace(/[أإآٱ]/g, 'ا')
