// Passage-level evidence -> per-ayah evidence, deliberately conservative.
//
// A successful recitation of ten ayahs is NOT ten independent proofs. Rules:
//  * Weight shrinks with passage length (1 ayah = 1.0 ... floor 0.35).
//  * Flagged ayahs receive the outcome the user flagged, undiluted when negative.
//  * Ayahs after `completedTo` were not attempted: no evidence either way.
//  * A multi-ayah failure with no marked location penalises every ayah at half weight.
//  * Only a recitation of exactly one ayah can make an ayah "verified individually".
import type { Grade, ReviewEvent, StumbleKind } from './types'

export type Outcome = Grade | 'untested'
export interface AyahEvidence {
  surah: number
  ayah: number
  at: number
  outcome: Outcome
  weight: number
  scope: 'single' | 'passage' | 'junction'
  passageLength: number
  eventId: string
}
export interface JunctionEvidence {
  surah: number
  /** The transition from ayah `from` into ayah `from + 1`. */
  from: number
  at: number
  ok: boolean
  weight: number
  eventId: string
}
export interface Attribution {
  ayahs: AyahEvidence[]
  junctions: JunctionEvidence[]
}

export const CUE_WEIGHT = { 0: 0, 1: 0.35, 2: 0.6, 3: 0.85, 4: 1 } as const

export function passageWeight(n: number): number {
  if (n <= 1) return 1
  return Math.max(0.35, 1 / (1 + 0.12 * (n - 1)))
}

const KIND_OUTCOME: Record<StumbleKind, Grade> = {
  hesitated: 'hesitant',
  prompted: 'prompted',
  wrong: 'failed',
  blank: 'failed',
}
const SEVERITY: Record<StumbleKind, number> = { hesitated: 1, prompted: 2, wrong: 3, blank: 4 }

export function attribute(e: ReviewEvent): Attribution {
  const cue = CUE_WEIGHT[e.cueLevel]
  const out: Attribution = { ayahs: [], junctions: [] }
  if (cue <= 0) return out
  const { surah, start, end } = e.range
  const n = end - start + 1
  const reach = Math.min(e.completedTo ?? end, end)
  const base = { surah, at: e.occurredAt, eventId: e.id }

  if (e.kind === 'junction') {
    // A transition drill: only continuity evidence, no verification of the ayahs themselves.
    const ok = e.grade === 'independent' || e.grade === 'hesitant'
    out.junctions.push({ ...base, from: start, ok, weight: e.grade === 'hesitant' ? 0.6 : 1 })
    return out
  }

  const flagged = new Map<number, StumbleKind>()
  for (const s of e.stumbles) {
    if (s.ayah < start || s.ayah > end) continue
    const prev = flagged.get(s.ayah)
    if (!prev || SEVERITY[s.kind] > SEVERITY[prev]) flagged.set(s.ayah, s.kind)
  }
  const w = passageWeight(n) * cue
  const scope = n === 1 ? 'single' : 'passage'
  const overallSuccess = e.grade === 'independent' || e.grade === 'hesitant'

  for (let a = start; a <= end; a++) {
    if (a > reach) continue
    const kind = flagged.get(a)
    let outcome: Outcome
    let weight: number
    if (kind) {
      outcome = KIND_OUTCOME[kind]
      weight = outcome === 'hesitant' ? w : cue
    } else if (n === 1) {
      outcome = e.grade
      weight = cue
    } else if (overallSuccess) {
      outcome = e.grade
      weight = w
    } else if (flagged.size > 0) {
      // The passage went badly somewhere else; this ayah went through, but that is weak proof.
      outcome = 'hesitant'
      weight = w * (e.grade === 'prompted' ? 0.75 : 0.5)
    } else {
      // Failed or needed prompts, but the user did not say where: spread the penalty cautiously.
      outcome = e.grade
      weight = 0.5 * cue
    }
    out.ayahs.push({ ...base, ayah: a, outcome, weight, scope, passageLength: n })
  }

  for (let a = start; a < reach; a++) {
    const next = flagged.get(a + 1)
    const entryFailed = next === 'prompted' || next === 'blank' || next === 'wrong'
    const shaky = e.shakyJunctions.includes(a) || entryFailed
    out.junctions.push({ ...base, from: a, ok: !shaky, weight: shaky ? cue : w })
  }
  return out
}
