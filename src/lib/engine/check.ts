// Checking a recitation against the text, ayah by ayah.
//
// Reciting fluently is not proof of reciting correctly: a missed letter, a changed vowel or a habitual tajweed slip can hide inside a recitation that
// "felt right", even when the text is then read. So the learner compares what they said with the actual Arabic and flags what they find. What the app
// records is only what the learner reports; it never grades pronunciation or tajweed and never certifies a recitation as correct.
//
//   recall (the attempt, made with the text hidden)  ->  feedback (the text is revealed and compared)
//
// Revealing an ayah AFTER reciting it is feedback, not a hint. Words shown BEFORE the attempt is complete (the first-word hint) make it assisted recall.
// An ayah read before it was recited carries no recall evidence at all. An ayah never compared with the text carries none either.
import type { IssueKind, ReviewEvent, Stumble, StumbleKind, WordIssue } from './types'

export const ISSUE_LABEL: Record<IssueKind, string> = {
  slip: 'Marked',
  forgot: 'Forgot it',
  wrong: 'Wrong word or vowel',
  pronunciation: 'Pronunciation / tajweed',
}
/** Kinds the learner can choose between (a bare tap marks the word as a slip; choosing refines it). */
export const ISSUE_CHOICES: IssueKind[] = ['forgot', 'wrong', 'pronunciation']

/**
 * What a flagged word says about MEMORY.
 *  - forgot: the text was needed for that word -> "needed a prompt".      - wrong: said something else -> a failed recall of that ayah.
 *  - pronunciation / tajweed: the words were remembered; this is about HOW they were said, so it is not a memory failure (it still gets focused practice).
 *  - an unclassified slip in one ayah leaves the choice to the grade the learner gives; in a passage it localises the problem to its ayah ("needed a prompt").
 */
export function stumbleFor(kind: IssueKind, single: boolean): StumbleKind | null {
  if (kind === 'forgot') return 'prompted'
  if (kind === 'wrong') return 'wrong'
  if (kind === 'slip') return single ? null : 'prompted'
  return null
}
/** True when the flagged words say the ayah was not recited accurately from memory (so "on my own" / "hesitated but accurate" would contradict them). */
export const contradictsAccurate = (issues: WordIssue[]) => issues.some((i) => i.kind === 'forgot' || i.kind === 'wrong')

const SEVERITY: Record<StumbleKind, number> = { hesitated: 1, prompted: 2, wrong: 3, blank: 4 }
/** The ayah chips and the word flags, merged: per ayah the most serious wins. */
export function mergeStumbles(chips: Map<number, StumbleKind>, issues: WordIssue[], single: boolean): Stumble[] {
  const m = new Map(chips)
  for (const i of issues) {
    const k = stumbleFor(i.kind, single)
    if (!k) continue
    const cur = m.get(i.ayah)
    if (!cur || SEVERITY[k] > SEVERITY[cur]) m.set(i.ayah, k)
  }
  return [...m].map(([ayah, kind]) => ({ ayah, kind }))
}

export interface CheckedAttempt {
  range: { surah: number; start: number; end: number }
  /** Set only when an ayah inside the range was left unchecked. */
  checked?: number[]
  completedTo?: number
}
/**
 * The record of an attempt in which only some ayahs were compared with the text.
 *  - Unchecked ayahs at the start or end are simply not part of the recorded range.
 *  - An unchecked gap in the middle is listed exactly (`checked`), and `completedTo` stops before it, so a device or version that does not know `checked`
 *    credits less, never more.
 * Returns null when nothing was checked.
 */
export function checkedAttempt(range: { surah: number; start: number; end: number }, evidence: number[], stopAt?: number | null): CheckedAttempt | null {
  const inRange = [...new Set(evidence)].filter((a) => a >= range.start && a <= (stopAt ?? range.end)).sort((a, b) => a - b)
  if (!inRange.length) return null
  const first = inRange[0]!, last = inRange[inRange.length - 1]!
  const trimmed = { surah: range.surah, start: first, end: last }
  const gap = inRange.length !== last - first + 1
  if (!gap) return { range: trimmed, completedTo: undefined }
  let firstGap = first
  while (inRange.includes(firstGap)) firstGap++
  return { range: trimmed, checked: inRange, completedTo: firstGap - 1 }
}

/** Does this event record that some ayahs of its range were not checked? (for explanations) */
export const hasUncheckedGap = (e: Pick<ReviewEvent, 'checked'>) => Boolean(e.checked)
