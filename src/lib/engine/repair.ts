// Targeted repair of the exact place a recitation goes wrong.
//
// Everything here is derived from events the app already records:
//  * flow events on a phrase or phrase pair (rating "tangled" / "improving" / "natural"), and
//  * word-level slips the user marks after a recall (stored as a "tangled" flow event on the
//    phrase pair around that word, with zero repetitions and zero duration).
// It reports where practice has repeatedly gone badly and clears it only after natural practice.
// It describes the user's own recorded difficulty; it does not assess pronunciation.
import type { FlowEvent } from './types'
import type { Phrase, Rung } from './phrases'

export interface TroubledRung {
  from: number
  to: number
  /** Tangled marks minus natural marks, never below zero. */
  score: number
  tangled: number
  lastAt: number
}

const letter = (i: number) => String.fromCharCode(65 + (i % 26))

export function troubledRungs(flows: FlowEvent[], surah: number, ayah: number, phraseCount: number): TroubledRung[] {
  const mine = flows
    .filter((f) => f.surah === surah && f.ayah === ayah && f.phraseCount === phraseCount && f.toPhrase - f.fromPhrase <= 1)
    .filter((f) => phraseCount === 1 || !(f.fromPhrase === 0 && f.toPhrase === phraseCount - 1 && phraseCount > 2))
    .sort((a, b) => a.occurredAt - b.occurredAt)
  const by = new Map<string, TroubledRung>()
  for (const f of mine) {
    const k = `${f.fromPhrase}-${f.toPhrase}`
    const cur = by.get(k) ?? { from: f.fromPhrase, to: f.toPhrase, score: 0, tangled: 0, lastAt: 0 }
    if (f.rating === 'tangled') { cur.score += 1; cur.tangled += 1 }
    else if (f.rating === 'natural') cur.score = Math.max(0, cur.score - 1)
    cur.lastAt = f.occurredAt
    by.set(k, cur)
  }
  return [...by.values()].filter((r) => r.score >= 1).sort((a, b) => b.score - a.score || a.from - b.from)
}

/** The rung to practise for a slip on word `wordIndex`: the pair of phrases joining into it, or its own phrase if it is the first. */
export function slipRung(wordIndex: number, phrases: Phrase[]): { from: number; to: number } {
  const p = phrases.find((x) => wordIndex >= x.from && wordIndex <= x.to) ?? phrases[0]!
  if (phrases.length === 1) return { from: 0, to: 0 }
  if (p.index > 0) return { from: p.index - 1, to: p.index }
  return { from: 0, to: 1 }
}

const name = (a: number, b: number) => (a === b ? letter(a) : `${letter(a)} → ${letter(b)}`)

/** A short ladder: the troubled spots first, then the whole ayah once to join it back together. */
export function buildRepairLadder(phrases: Phrase[], troubled: { from: number; to: number }[]): Rung[] {
  const last = phrases.length - 1
  const full: Rung = { from: 0, to: last, kind: 'full', label: phrases.length === 1 ? 'Whole ayah' : 'Whole ayah, joined' }
  if (phrases.length === 1) return [full]
  const seen = new Set<string>()
  const rungs: Rung[] = []
  for (const t of troubled) {
    const k = `${t.from}-${t.to}`
    if (seen.has(k) || t.to > last) continue
    seen.add(k)
    rungs.push({ from: t.from, to: t.to, kind: t.from === t.to ? 'solo' : 'pair', label: `Repair: ${name(t.from, t.to)}` })
  }
  return [...rungs, full]
}
