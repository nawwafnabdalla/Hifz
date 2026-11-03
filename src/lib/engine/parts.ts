// Part-by-part memorisation of a long ayah.
//
// A long ayah is learned in the phrases the app already prepares (breakdown.ts): A, then B, then A→B, … and finally the whole ayah.
// What is remembered between sessions is NOT a saved screen position. It is derived from recorded recalls (PartEvent), so closing
// the app, a crash, or a week away can never lose or invent progress, and a new layout of phrases can never corrupt old records.
//
// Evidence stays honest:
//   * a PartEvent is a recall of a span of words. It says where the learner is in the ayah. It never makes the ayah "memorised";
//     only a ReviewEvent over the whole ayah (the existing recall) does, and `deriveState` ignores parts entirely for memory.
//   * "secured" means: the most recent recall covering the phrase was accurate (independent or hesitant) with at most the first word shown.
//   * a slip the learner marks says where it went wrong: words before it were recited, words after it were not reached.
import type { PartEvent } from './types'

/** Only ayahs the app splits into at least this many practice phrases, and that are longer than PARTS_MIN_WORDS, are learned part by part.
 *  A shorter or two-phrase ayah is a manageable single sitting: it keeps the ordinary Sound → Flow ladder → Recall. */
export const PARTS_MIN_PHRASES = 3
export const PARTS_MIN_WORDS = 20
/** After this long, the parts already learned are checked before a new part is added. */
export const REFRESH_AFTER_MS = 6 * 3600 * 1000

export interface Span { from: number; to: number }
/** When the LEARNER has set the breaks themselves they have asked for the ayah to be split, so it need only be longer than an ayah the app always keeps whole (12 words). */
export const PARTS_MIN_WORDS_OWN_BREAKS = 12
export const isPartsLayout = (phrases: Span[], ownBreaks = false) =>
  phrases.length >= PARTS_MIN_PHRASES && phrases[phrases.length - 1]!.to + 1 > (ownBreaks ? PARTS_MIN_WORDS_OWN_BREAKS : PARTS_MIN_WORDS)

/** An accurate recall that did not lean on more than the first word. */
export const isGood = (e: Pick<PartEvent, 'grade' | 'cueLevel'>) => (e.grade === 'independent' || e.grade === 'hesitant') && e.cueLevel >= 3

export interface PhraseState {
  index: number
  /** The latest recall covering this phrase was accurate. */
  secured: boolean
  /** Some recall has covered this phrase at all. */
  attempted: boolean
  /** The latest recall covering this phrase went wrong at or in it. */
  weak: boolean
  /** Recalled accurately again at least REFRESH_AFTER_MS after the first accurate recall: it held across a break. */
  heldOverBreak: boolean
  /** Latest accurate recall that included this phrase together with at least one other (a join), or null. */
  joinedAt: number | null
  lastAt: number | null
}

export interface PartProgress {
  phraseCount: number
  phrases: PhraseState[]
  /** Leading phrases that are secured, one after another. */
  reach: number
  /** The phrase to work on next: the first one not secured. null when every phrase is secured. */
  next: number | null
  /** True once every phrase is secured: what remains is reciting the whole ayah. */
  allSecured: boolean
  started: boolean
  lastAt: number | null
  /** Parts are secured, but it has been a while: check them before adding another. */
  refreshDue: boolean
  /** Phrases whose latest recall went wrong. */
  weak: number[]
}

/** What one event says about each phrase it covers: true = accurate, false = went wrong, undefined = not tested. */
export function outcomeFor(e: PartEvent, p: Span): boolean | undefined {
  if (e.fromWord > p.from || e.toWord < p.to) return undefined             // the event does not cover the whole phrase
  if (isGood(e)) return true
  if (e.cueLevel < 3) return undefined                                      // recalled with a lot of the text shown: no evidence either way
  if (e.slipWord === undefined) return false                                // went wrong somewhere unknown inside the span
  if (p.to < e.slipWord) return true                                        // recited correctly up to the slip
  if (p.from > e.slipWord) return undefined                                 // never reached
  return false
}

export function partProgress(phrases: Span[], events: PartEvent[], now: number): PartProgress {
  const evs = [...events].sort((a, b) => a.occurredAt - b.occurredAt)
  const states: PhraseState[] = phrases.map((p, index) => {
    let secured = false, attempted = false, weak = false, lastAt: number | null = null, joinedAt: number | null = null
    let firstGood: number | null = null, held = false
    for (const e of evs) {
      const o = outcomeFor(e, p)
      if (o === undefined) continue
      attempted = true
      lastAt = e.occurredAt
      secured = o
      weak = !o
      if (o) {
        if (firstGood === null) firstGood = e.occurredAt
        else if (e.occurredAt - firstGood >= REFRESH_AFTER_MS) held = true
        const spans = phrases.filter((q) => e.fromWord <= q.from && e.toWord >= q.to).length
        if (spans >= 2) joinedAt = e.occurredAt
      }
    }
    return { index, secured, attempted, weak, heldOverBreak: held, joinedAt, lastAt }
  })
  let reach = 0
  while (reach < states.length && states[reach]!.secured) reach++
  const lastAt = evs.length ? evs[evs.length - 1]!.occurredAt : null
  return {
    phraseCount: phrases.length, phrases: states, reach, next: reach < states.length ? reach : null, allSecured: reach === states.length,
    started: evs.length > 0, lastAt, refreshDue: reach > 0 && lastAt !== null && now - lastAt >= REFRESH_AFTER_MS,
    weak: states.filter((s) => s.weak).map((s) => s.index),
  }
}

/** The ladder for one step: the new phrase alone, the join with the one before it, and (from the third phrase on) the chain from the start. */
export interface StepRung { from: number; to: number; kind: 'solo' | 'pair' | 'chain'; label: string }
const letter = (i: number) => String.fromCharCode(65 + (i % 26))
const name = (a: number, b: number) => (a === b ? letter(a) : Array.from({ length: b - a + 1 }, (_, i) => letter(a + i)).join(' → '))
export function stepRungs(j: number): StepRung[] {
  const out: StepRung[] = [{ from: j, to: j, kind: 'solo', label: name(j, j) }]
  if (j >= 1) out.push({ from: j - 1, to: j, kind: 'pair', label: name(j - 1, j) })
  if (j >= 2) out.push({ from: 0, to: j, kind: 'chain', label: name(0, j) })
  return out
}

/** Words still to learn from phrase `next` on, for time estimates. */
export function wordsToGo(phrases: Span[], p: PartProgress): number {
  if (p.next === null) return 0
  let n = 0
  for (let i = p.next; i < phrases.length; i++) n += phrases[i]!.to - phrases[i]!.from + 1
  return n
}
