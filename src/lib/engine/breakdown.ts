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
import review from '@/data/phrase-review.json'
import meaningFile from '@/data/generated/meaning-evidence.json'
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

/**
 * Translation evidence. The English translation's clause structure (commas, semicolons, quotation marks, clause-opening words) is mapped onto the
 * Arabic word gaps by a word alignment learned offline (see docs/MEANING_BREAKDOWN.md). It is ONE more source of evidence: it can strengthen a break the
 * Arabic already supports, and it can rescue a weak grammatical candidate, but it never creates a break where there is no Arabic support, and it can
 * never override the avoid rules or the reviewed list. Translations paraphrase, reorder and expand, so a gap with no clear English counterpart gets no evidence.
 */
export type Meaning = Record<number, number>            // gap (break after word i) -> strength 0..3
type MeaningFile = { ayahs: Record<string, { n: number; t: number; e: Record<string, [number, number]> }> }
const MEANING = meaningFile as unknown as MeaningFile
export function meaningFor(surah: number, ayah: number, wordCount: number, translationLength?: number): Meaning | null {
  const e = MEANING.ayahs[`${surah}:${ayah}`]
  if (!e || e.n !== wordCount || (translationLength !== undefined && e.t !== translationLength)) return null
  return Object.fromEntries(Object.entries(e.e).map(([g, v]) => [+g, v[0] / 10]))
}
/** Where the English clause that starts after Arabic gap `gap` begins in the translation text (for showing the meaning of a phrase). */
export const meaningTextLength = (surah: number, ayah: number): number | null => MEANING.ayahs[`${surah}:${ayah}`]?.t ?? null
export function meaningCut(surah: number, ayah: number, gap: number): number | null { const v = MEANING.ayahs[`${surah}:${ayah}`]?.e[String(gap)]; return v ? v[1] : null }
/** Weight of translation evidence in the logit, per strength point (strength 3 ≈ +2.4: about as much as a reciter's clear pause). */
export const MEANING_WEIGHT = 0.8
/** A candidate needs at least this grammatical probability (or a stop sign) before translation evidence can matter: English alone never makes a break. */
export const MEANING_SUPPORT_FLOOR = 0.05
export interface Tuning { meaning?: Meaning | null; comfort?: number; comfortLong?: number; rules?: Candidate[]; /** cost of a three-word piece (default 5); the meaning-aware mode accepts a three-word clause such as "When he saw a fire" */ threeWordCost?: number }

/**
 * Arabic clause openers: a deterministic, reviewable rule list (no data, no model). A word that opens a new clause is a natural place to start
 * a new practice phrase when what precedes is a complete thought. These only RAISE a gap's candidate probability; the avoid rules, the stop-sign
 * rules, the length costs and (when present) the translation all still apply. Leading و / ف ("and", "so") are looked through.
 *   inna and its sisters (إِنَّ إِنِّي إِنَّا إِنَّهُ …: "indeed …"), لَعَلَّ ("perhaps …"), ثُمَّ ("then …"), أَوْ ("or …"),
 *   قَالَ and its forms ("he said …"), and the conditional/temporal openers إِذۡ إِذَا لَمَّا كُلَّمَا أَمَّا لَوۡ.
 */
export const OPENER_P: Record<string, number> = { inna: 0.35, laalla: 0.35, thumma: 0.3, aw: 0.25, qaala: 0.3, cond: 0.25 }
const QAALA = new Set(['قال', 'قالوا', 'قالت', 'قلنا', 'قلت', 'يقول', 'فيقولون'])
const COND = new Set(['اذ', 'اذا', 'لما', 'كلما', 'اما', 'لو', 'ولو', 'ولما', 'واذ', 'واذا', 'فاما', 'واما', 'فلما', 'فاذا'])
export function openerKind(raw: string): keyof typeof OPENER_P | null {
  const n = baseLetters(raw)
  const core = /^[وف]/.test(n) && n.length > 3 ? n.slice(1) : n                           // look through a leading wa / fa
  if (['ثم'].includes(n) || ['ثم'].includes(core)) return 'thumma'
  if (n === 'او' || core === 'او') return 'aw'
  if (QAALA.has(n) || QAALA.has(core)) return 'qaala'
  if (COND.has(n) || COND.has(core)) return 'cond'
  if (/^لعل/.test(core)) return 'laalla'
  // inna and sisters: hamza BELOW the alef (إ), a doubled nun (shadda), e.g. إِنَّ إِنِّي إِنَّا إِنَّهُ إِنَّكَ; not the subordinating أَنْ and not the conditional إِنْ
  const stripped = raw.replace(/^۞/, '').replace(/^[وف][ً-ٰٟۖ-ۭ]*(?=إ)/, '')     // look through a leading wa/fa and its vowel sign
  if (stripped.startsWith('إ') && /[نن]ّ|ّ/.test(stripped) && ['ان', 'اني', 'انا', 'انه', 'انك', 'انهم', 'انها', 'انكم', 'اننا', 'انني', 'انهما'].includes(core)) return 'inna'
  return null
}
/** Where the mushaf prints a weaker sign (ۖ continuing preferred, ۛ paired). Such a sign says 'do not stop here by preference', which is NOT where to stop reciting, but it does mark the end of a clause, so its position is evidence of a unit boundary for practice. */
export const WEAK_SIGN_P = 0.22
export function weakSignPositions(words: string[]): Candidate[] {
  const strong = new Set(suggestBoundaries(words).boundaries)
  return suggestBoundaries(words, { includeWeak: true }).boundaries.filter((b) => !strong.has(b)).map((after) => ({ after, p: WEAK_SIGN_P }))
}
export function clauseOpeners(words: string[]): Candidate[] {
  const out: Candidate[] = [...weakSignPositions(words)]
  for (let i = 0; i + 1 < words.length; i++) { const k = openerKind(words[i + 1]!); if (k) out.push({ after: i, p: OPENER_P[k]! }) }
  return out
}

export interface Pause { afterWord: number; ms: number }
export interface Candidate { after: number; p: number }
export type Basis = 'stop sign' | 'reviewed' | 'grammar' | 'grammar and the reciter’s pause' | 'grammar and the translation' | 'stop sign and the translation'
export interface Breakdown { boundaries: number[]; basis: Record<number, Basis>; confidence: Record<number, number> }

type File = { ayahs: Record<string, { n: number; c: [number, number][] }> }
const FILE = cand as unknown as File
/** Grammar candidates for an ayah, or none if the data does not describe this exact text (word counts must match). */
export function candidatesFor(surah: number, ayah: number, wordCount: number): Candidate[] {
  const e = FILE.ayahs[`${surah}:${ayah}`]
  return e && e.n === wordCount ? e.c.map(([after, p]) => ({ after, p: p / 1000 })) : []
}

/** Long pieces cost more the longer they are; pieces of one or two words are almost never worth a break. */
/** A grammatical candidate below this probability is never used on grammar alone (the model is a statistical proxy, not an authority). */
export const GRAMMAR_FLOOR = 0.12
/** Lower floor when the reciter's own pause confirms it. */
export const GRAMMAR_FLOOR_PAUSED = 0.06
/** Inside a long ayah (over 16 words) holding a piece whole is itself a failure for memorising, so weaker (still non-trivial) evidence is accepted. */
export const GRAMMAR_FLOOR_LONG = 0.05
type Review = { rejected?: number[]; approved?: number[] }
const reviewOf = (surah: number, ayah: number): Review => (review.ayahs as Record<string, Review>)[`${surah}:${ayah}`] ?? {}

const penalty = (len: number, comfort: number, three = 5) => LAMBDA * Math.max(0, len - comfort) ** 2 + (len < 3 ? 40 : len < 4 ? three : 0)

/** Pure selection: which of the candidate boundaries to use. */
export function planBreaks(wordCount: number, stop: number[], candidates: Candidate[], pauses: Pause[] = [], avoid: number[] = [], rev: Review = {}, tune: Tuning = {}): Breakdown {
  const out: Breakdown = { boundaries: [], basis: {}, confidence: {} }
  if (wordCount <= WHOLE_LIMIT) return out
  const timed = pauses.length > 0
  const pauseAfter = new Map(pauses.map((p) => [p.afterWord, p.ms]))
  const gain = new Map<number, { g: number; p: number; stop: boolean; paused: boolean; reviewed: boolean; meant: boolean }>()
  // The translation's evidence is only accurate to about a word, so it is attached to the best-supported Arabic gap within one word of where the
  // alignment put it: it can then strengthen a real Arabic boundary but not drag a break onto a neighbouring gap the Arabic does not support.
  const mean: Meaning = {}
  const support0 = new Map<number, number>()
  const supportOf = (b: number) => (stopSet0.has(b) ? 0.85 : Math.max(ps0.get(b) ?? 0, 0))
  const stopSet0 = new Set(stop)
  const ps0 = new Map(candidates.map((c) => [c.after, c.p]))
  for (const r of tune.rules ?? []) ps0.set(r.after, Math.max(ps0.get(r.after) ?? 0, r.p))
  void support0
  for (const [gs, e] of Object.entries(tune.meaning ?? {})) {
    const g = +gs
    let to = g
    for (const t of [g - 1, g + 1]) if (t >= 0 && t < wordCount - 1 && !avoid.includes(t) && supportOf(t) > 1.5 * Math.max(supportOf(to), 0.02) && supportOf(t) >= 0.15) to = t
    mean[to] = Math.max(mean[to] ?? 0, to === g ? e : e * 0.9)
  }
  const stopSet = new Set(stop)
  const ps = new Map(candidates.map((c) => [c.after, c.p]))
  for (const r of tune.rules ?? []) ps.set(r.after, Math.max(ps.get(r.after) ?? 0, r.p))
  const avoidSet = new Set([...avoid, ...(rev.rejected ?? [])])
  const approved = new Set(rev.approved ?? [])
  for (const b of new Set([...ps.keys(), ...stop, ...Object.keys(mean).map(Number)])) {
    if (b < 0 || b >= wordCount - 1 || avoidSet.has(b)) continue
    const stopped = stopSet.has(b)
    const p = Math.min(0.97, Math.max(ps.get(b) ?? 0.02, stopped ? 0.85 : 0, approved.has(b) ? 0.85 : 0))
    let s = logit(p)
    const ms = pauseAfter.get(b)
    let paused = false
    if (timed) { if ((ms ?? 0) >= 150) { s += 1.2; paused = true } else if ((ms ?? 0) >= 100) { s += 0.5; paused = true } else if ((ms ?? 0) < 40) s -= 2.0 }
    const m = mean[b] ?? 0
    const meant = m >= 1.5
    if (m > 0) s += MEANING_WEIGHT * m
    const supported = stopped || approved.has(b) || (ps.get(b) ?? 0) >= MEANING_SUPPORT_FLOOR
    if (!supported) continue                                                                                     // no Arabic support: neither the translation nor a pause may create a break
    const floor = meant ? GRAMMAR_FLOOR_PAUSED : paused ? GRAMMAR_FLOOR_PAUSED : wordCount > 16 ? GRAMMAR_FLOOR_LONG : GRAMMAR_FLOOR
    if (!stopped && !approved.has(b) && p < floor) continue       // too weak to use on grammar alone
    gain.set(b, { g: s - logit(BREAK_P), p, stop: stopped, paused, reviewed: approved.has(b), meant })
  }
  const NEG = -1e9
  const comfort = wordCount > 16 ? (tune.comfortLong ?? COMFORT_LONG) : (tune.comfort ?? COMFORT)
  const dp = new Array<number>(wordCount).fill(NEG), from = new Array<number>(wordCount).fill(-2)
  for (let j = 0; j < wordCount; j++) {
    const last = j === wordCount - 1
    const here = last ? 0 : gain.get(j)?.g
    if (here === undefined) continue
    for (let i = -1; i < j; i++) {
      const prev = i === -1 ? 0 : dp[i]!
      if (prev <= NEG / 2) continue
      const v = prev - penalty(j - i, comfort, tune.threeWordCost) + here
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
    out.basis[b] = g.stop ? (g.meant ? 'stop sign and the translation' : 'stop sign') : g.reviewed ? 'reviewed' : g.paused ? 'grammar and the reciter’s pause' : g.meant ? 'grammar and the translation' : 'grammar'
    out.confidence[b] = +g.p.toFixed(2)
  }
  return out
}

/**
 * THE default phrase breaks of an ayah when the learner has not set their own (which is almost always).
 * Every place that needs an ayah's phrases (learning, the slip repair after Recall) must use this one function, so a slip
 * marked in one place always refers to the same phrases in another.
 */
export function defaultBreakdown(surah: number, ayah: number, words: string[], pauses: Pause[] = [], tune: Tuning = {}): Breakdown {
  const stop = suggestBoundaries(words).boundaries, stopSet = new Set(stop)
  // Never a practice break: the "do not stop" sign (ۙ), and a position just before a word that completes what precedes it
  // (subordinating أَن or كَيۡ, the exception إِلَّا) unless the mushaf itself marks a pause there.
  const avoid = words.flatMap((w, i) => (w.includes('ۙ') || (!stopSet.has(i) && i + 1 < words.length && attachesBackward(words[i + 1]!)) ? [i] : []))
  return planBreaks(words.length, stop, candidatesFor(surah, ayah, words.length), pauses, avoid, reviewOf(surah, ayah), tune)
}
export const defaultBoundaries = (surah: number, ayah: number, words: string[], pauses: Pause[] = [], tune: Tuning = {}): number[] => defaultBreakdown(surah, ayah, words, pauses, tune).boundaries
/** The translation-aware practice breaks: the same Arabic evidence plus the translation's clause structure, and smaller pieces (they are memorised one at a time). */
export const MEANING_COMFORT = 8
export const MEANING_THREE_WORD_COST = 1.2
export const meaningBreakdown = (surah: number, ayah: number, words: string[], pauses: Pause[] = []): Breakdown =>
  defaultBreakdown(surah, ayah, words, pauses, { meaning: meaningFor(surah, ayah, words.length), comfort: MEANING_COMFORT, comfortLong: MEANING_COMFORT, rules: clauseOpeners(words), threeWordCost: MEANING_THREE_WORD_COST })

/** A word that attaches to what comes BEFORE it, judged from spelling alone: subordinating أَن (hamza above, no shadda), كَيۡ, and إِلَّا. */
export function attachesBackward(raw: string): boolean {
  const n = baseLetters(raw)
  return (n === 'ان' && raw.startsWith('أ') && !raw.includes('ّ')) || n === 'كي' || (n === 'الا' && raw.includes('ّ'))
}

// Letters only: no vowels, signs, tatweel or stop marks, with alef variants unified.
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ࣓-ࣿ]/g
export const baseLetters = (w: string) => w.replace(MARKS, '').replace(/[أإآٱ]/g, 'ا')
