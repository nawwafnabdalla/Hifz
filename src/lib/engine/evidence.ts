// One record of what the learner knows, and one definition of what still needs doing.
//
// Every screen (a goal, a revision block, a session, a learning flow, a transition drill) produces EVIDENCE: events in the immutable log. That evidence is
// derived, once, into shared state (derive.ts): one memory record per ayah, one record per transition between ayahs, one record of which parts of an ayah
// have been recalled. Nothing here is a separate "stage" or "goal" checklist. This file holds the questions every screen asks of that shared state:
//   * does this ayah need anything today, and what? (reviewObligation)   * is this planned item still needed now? (neededRange, junctionDue)
//   * which parts of an ayah does a whole-ayah attempt demonstrate? (partCreditFromReviews)
//
// What counts as what (unchanged, and tested):
//   practice (reading aloud with the text visible, listening, Flow rungs)  ->  never memory evidence, only practice.
//   a recall with the text hidden, then checked                            ->  memory evidence for the ayahs recalled, to the extent demonstrated.
//   a hinted recall                                                        ->  weaker evidence, never "on my own".
//   a transition recited from memory                                       ->  evidence for that transition only, never for either whole ayah.
//   a flagged word (forgot / wrong / pronunciation)                        ->  recorded as what it is.
import { ayahKey, DAY, type PartEvent, type Range } from './types'
import { partCreditFromReviews } from './partcredit'
import { ayahStatus, junctionNeedsRepair, type Derived, type FlowState, type JunctionState } from './derive'
import { PARAMS, dueAt, type AyahMemory } from './memory'
import type { PlanKind } from './planner'

export { partCreditFromReviews }
const HOUR = 3600 * 1000

/**
 * How far ahead of its due moment an item may be pulled into today's plan. A new ayah is first due
 * 24 hours after it was learned; if you study at the same time every day it would otherwise miss
 * today's session by minutes and wait another day. Short intervals get a short window; never more than 12 hours.
 */
export function dueHorizonMs(stability: number): number {
  return Math.min(12 * HOUR, 0.25 * stability * DAY)
}

export interface Obligation { kind: PlanKind; R: number; risk: number }

/**
 * What an ayah needs now, judged only from its shared record. null = nothing: it is not started, or it is on schedule, or (when it is inside an
 * active goal and still being learned) it is the learning flow's to teach rather than revision's to test.
 */
export function reviewObligation(m: AyahMemory, flow: FlowState | undefined, now: number, inTarget: boolean): Obligation | null {
  const st = ayahStatus(m, flow, now)
  if (st.stage === 'not_started') return null
  const R = st.retrievability
  let kind: PlanKind | null = null
  let risk = 1 - R
  if (st.stage === 'claimed') {
    kind = 'verify'
    risk = Math.min(0.5, (now - (m.claimedAt ?? now)) / DAY / 120)
  } else if (st.stage === 'learning') {
    if (!inTarget) kind = 'sabqi'
  } else if (st.stage === 'needs_repair') {
    kind = 'repair'
  } else if (R <= PARAMS.targetRetrievability || dueAt(m) <= now + dueHorizonMs(m.stability)) {
    const recent = m.firstDemonstratedAt !== null && now - m.firstDemonstratedAt < 14 * DAY
    kind = recent || m.stability < 8 ? 'sabqi' : 'manzil'
  }
  return kind ? { kind, R, risk } : null
}

/** True while the ayah is still to be learned (never recalled), as opposed to revised. */
export function isOpen(m: AyahMemory | undefined, flow: FlowState | undefined, now: number): boolean {
  const st = ayahStatus(m, flow, now).stage
  return st === 'not_started' || st === 'learning'
}

export interface Needed {
  /** The part of the range that still needs doing (leading and trailing ayahs that are already covered are dropped), or null when nothing does. */
  range: Range | null
  needed: number[]
  covered: number[]
}
/**
 * Which ayahs of a planned review item still need a recall NOW. A plan is a snapshot: evidence recorded since (in another session, goal or screen)
 * may already cover some of it, and the learner must not be asked to prove the same ayah again for a separate checklist.
 */
export function neededRange(range: Range, d: Derived, now: number, inTarget: (surah: number, ayah: number) => boolean): Needed {
  const needed: number[] = [], covered: number[] = []
  for (let a = range.start; a <= range.end; a++) {
    const m = d.memory.get(ayahKey(range.surah, a))
    const ob = m ? reviewObligation(m, d.flow.get(ayahKey(range.surah, a)), now, inTarget(range.surah, a)) : null
    // An ayah with no record at all is not something revision can have asked for; keep it rather than silently dropping work.
    if (!m || ob) needed.push(a); else covered.push(a)
  }
  if (!needed.length) return { range: null, needed, covered }
  return { range: { surah: range.surah, start: needed[0]!, end: needed[needed.length - 1]! }, needed, covered }
}

/** A transition drill is due while the transition has gone worse than well and has not just been recited cleanly. */
export function junctionDue(j: JunctionState, now: number): boolean {
  if (!junctionNeedsRepair(j)) return false
  return !(j.lastOk === true && now - j.lastAt < 12 * HOUR)
}
export function junctionNeeded(range: Range, d: Derived, now: number): boolean {
  const j = d.junctions.get(ayahKey(range.surah, range.start))
  return !!j && junctionDue(j, now)
}

/** The part evidence for one ayah: what was recited in the part-by-part flow, together with what whole-ayah attempts demonstrated, in order. */
export function partsFor(d: Pick<Derived, 'parts' | 'partCredit'>, surah: number, ayah: number): PartEvent[] {
  const k = ayahKey(surah, ayah)
  const a = d.parts.get(k) ?? [], b = d.partCredit?.get(k) ?? []
  return b.length ? [...a, ...b].sort((x, y) => x.occurredAt - y.occurredAt || (x.id < y.id ? -1 : 1)) : a
}
