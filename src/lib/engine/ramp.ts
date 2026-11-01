// The support ramp: how an ayah is practised, from "text in front of you" to "from the first words only".
//
// Replaces the repetition counter and the per-rung rating. Each step is one spoken pass. Earlier pieces thin out to
// their first word as new pieces are added, and the whole ayah ends on first words only, so the next thing the learner
// meets (Recall) is a small step rather than a cliff. A miss is one gesture: "Show me" reveals the text; that is
// recorded as a tangle on the joint the new piece attaches to, which is exactly what targeted repair reads.
//
// Nothing here touches the retention estimate: flow events never do. Retention evidence still comes only from Recall.
import type { Phrase, Rung } from './phrases'

export interface RampRung extends Rung {
  /** Pieces before this index show only their first word. Pieces from here to `to` are shown in full. */
  newFrom: number
  /** Every piece in play shows only its first word. */
  allFaded?: boolean
}

const letter = (i: number) => String.fromCharCode(65 + (i % 26))
const name = (a: number, b: number) => (a === b ? letter(a) : Array.from({ length: b - a + 1 }, (_, i) => letter(a + i)).join(' → '))

/** Ayahs this short are said whole once, with the text, then go straight to recall. */
export const SHORT_AYAH_WORDS = 5
/** The first step covers at least this many words. */
const START_WORDS = 6

export function buildRamp(phrases: Phrase[], wordCount: number): RampRung[] {
  const k = phrases.length
  const last = Math.max(0, k - 1)
  const whole = (allFaded: boolean): RampRung => ({ from: 0, to: last, newFrom: allFaded ? last + 1 : 0, allFaded, kind: 'full', label: k <= 1 ? (allFaded ? 'From the first word' : 'Say it') : allFaded ? 'The whole ayah, from the first words' : 'The whole ayah' })
  if (k <= 1) return wordCount < SHORT_AYAH_WORDS ? [whole(false)] : [whole(false), whole(true)]
  const rungs: RampRung[] = []
  // Begin with enough text to be worth saying: short opening pieces are taken together.
  let s = 0, n = phrases[0]!.words.length
  while (s < last && n < START_WORDS) { s++; n += phrases[s]!.words.length }
  if (k <= 4) {
    rungs.push({ from: 0, to: s, newFrom: 0, kind: s === 0 ? 'solo' : 'chain', label: name(0, s) })
    for (let m = s + 1; m < k; m++) rungs.push({ from: 0, to: m, newFrom: m, kind: m === last ? 'full' : 'chain', label: name(0, m) })
  } else {
    // Long ayahs: pieces are added a pair at a time, and joined back every three pieces so no stretch grows too long to hold.
    rungs.push({ from: 0, to: s, newFrom: 0, kind: s === 0 ? 'solo' : 'chain', label: name(0, s) })
    for (let i = s + 1; i < k; i++) {
      rungs.push({ from: i - 1, to: i, newFrom: i, kind: 'pair', label: name(i - 1, i) })
      if ((i - s) % 3 === 2 && i < last) rungs.push({ from: 0, to: i, newFrom: i + 1, allFaded: true, kind: 'chain', label: `${name(0, i)}, from the first words` })
    }
  }
  rungs.push(whole(true))
  return rungs
}

/** Repair for joints that keep going wrong: each troubled joint seen in full, then from first words, then the whole ayah once more. */
export function rampFromRepair(phrases: Phrase[], troubled: { from: number; to: number }[]): RampRung[] {
  const last = phrases.length - 1
  const out: RampRung[] = []
  const seen = new Set<string>()
  for (const t of troubled) {
    const key = `${t.from}-${t.to}`
    if (seen.has(key) || t.to > last) continue
    seen.add(key)
    out.push({ from: t.from, to: t.to, newFrom: t.from, kind: t.from === t.to ? 'solo' : 'pair', label: `Repair: ${name(t.from, t.to)}` })
    out.push({ from: t.from, to: t.to, newFrom: t.to + 1, allFaded: true, kind: t.from === t.to ? 'solo' : 'pair', label: `Repair: ${name(t.from, t.to)}, from the first words` })
  }
  out.push({ from: 0, to: last, newFrom: last + 1, allFaded: true, kind: 'full', label: last === 0 ? 'From the first word' : 'The whole ayah, joined' })
  return out
}

export type WordState = 'show' | 'mask' | 'dim' | 'none'

/** How each word of the ayah is drawn on this step. `peeked` reveals everything in play ("Show me"). */
export function wordState(rung: RampRung, phrases: Phrase[], i: number, peeked: boolean, focusOnly = false): WordState {
  const p = phrases.find((x) => i >= x.from && i <= x.to)
  if (!p) return 'show'
  if (p.index < rung.from || p.index > rung.to) return focusOnly ? 'none' : 'dim'
  if (peeked) return 'show'
  const faded = rung.allFaded || p.index < rung.newFrom
  return faded && i !== p.from ? 'mask' : 'show'
}

/** True when this step hides anything, so "Show me" has something to show. */
export const hasFading = (rung: RampRung, phrases: Phrase[]) => phrases.some((p) => p.index >= rung.from && p.index <= rung.to && (rung.allFaded || p.index < rung.newFrom) && p.to > p.from)

/** The flow event for this step. A peek marks the joint the new piece attaches to; a clean pass clears it. */
export function flowFor(rung: RampRung, peeked: boolean): { fromPhrase: number; toPhrase: number; rating: 'tangled' | 'natural' } {
  const joint = rung.allFaded ? { from: rung.from, to: rung.to } : rung.newFrom > rung.from ? { from: rung.newFrom - 1, to: rung.newFrom } : { from: rung.from, to: rung.from }
  return { fromPhrase: joint.from, toPhrase: Math.min(joint.to, joint.from + 1) === joint.to ? joint.to : joint.from + 1, rating: peeked ? 'tangled' : 'natural' }
}
