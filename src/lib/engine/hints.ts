// Which words of an ayah are visible while recalling, and the first-word hint.
//
// The hint pipeline: current part -> its word range [from, to] (absolute word indices in the ayah, from the practice phrases) -> the word to reveal ->
// the display. A hint is NEVER stored: it is computed from the range being recalled at the time, so a change of phrase boundaries can never leave
// a stale or blank hint behind. (An earlier version revealed "word 0" of the AYAH for every part, so any part after the first showed nothing.)

/** Cue levels: 4 = nothing visible, 3 = the first word only, 2 = every third word, 1 = two of every three, 0 = everything. */
export type Cue = 0 | 1 | 2 | 3 | 4

/** Visibility of word `rel` of a recalled range at a cue level, counted from the START OF THAT RANGE (not of the ayah). */
export function visibleAt(cue: Cue, rel: number): boolean {
  if (cue === 0) return true
  if (cue === 1) return rel % 3 !== 2
  if (cue === 2) return rel % 3 === 0
  if (cue === 3) return rel === 0
  return false
}

export interface ShownOpts {
  cue?: Cue
  /** First word of the range being recalled (0 for a whole ayah). The cue pattern is counted from here. */
  base?: number
  /** Exactly the first N words of the ayah are visible (progressive hints); overrides the cue. */
  revealCount?: number
  /** Exactly these absolute word indices are visible (a hint that points at one word); overrides the cue. */
  revealWords?: number[]
}
export function isWordShown(i: number, o: ShownOpts): boolean {
  if (o.revealCount !== undefined) return i < o.revealCount
  if (o.revealWords) return o.revealWords.includes(i)
  return visibleAt(o.cue ?? 0, i - (o.base ?? 0))
}

/**
 * The word a first-word hint reveals when reciting words [from, to]: the first word of the part being added. When a part is added to what
 * is already known (A + B), the slip is at the opening of B, so that is the word offered; for a range that starts the ayah it is the ayah's first word.
 */
export function hintWordFor(from: number, to: number, newPartFrom?: number): number {
  const w = newPartFrom ?? from
  return Math.min(Math.max(w, from), to)
}
