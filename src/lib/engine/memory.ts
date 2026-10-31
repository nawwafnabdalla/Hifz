// Interpretable memory model.
//
// Each ayah carries a *stability* S (days until estimated recall falls to 90%) and
// a forgetting curve with the same shape FSRS uses: R(t) = (1 + F t/S)^C with
// F = 19/81, C = -0.5, so R(S) = 0.9. This is NOT FSRS: the update rules are
// hand-set defaults, and nothing here is fitted to the user. The UI must keep
// saying so until a fitted model replaces it. Every parameter lives in PARAMS.
import { DAY, type Grade } from './types'
import type { AyahEvidence } from './attribution'

export const PARAMS = {
  F: 19 / 81,
  C: -0.5,
  targetRetrievability: 0.9,
  initialStability: { independent: 1.0, hesitant: 0.6, prompted: 0.35, failed: 0.25 } as Record<Grade, number>,
  /** Prior stability for material the user declares known but has not demonstrated. */
  claimedPriorStability: 21,
  growthBase: 1.2,
  growthExponent: -0.2,
  hesitantGrowth: 0.5,
  promptedDecay: 0.8,
  failedDecay: 0.3,
  failedCeiling: 3,
  minStability: 0.25,
  maxStability: 365,
  /** Minimum attribution weight for an evidence record to count as a "solid" success. */
  solidWeight: 0.5,
} as const

export interface AyahMemory {
  surah: number
  ayah: number
  stability: number
  /** Time of the last evidence (or the declaration) used for the elapsed-time term. */
  lastEvidenceAt: number
  lastSuccessAt: number | null
  firstDemonstratedAt: number | null
  lastOutcome: Grade | null
  lastOutcomeWeight: number
  lastScope: 'single' | 'passage' | null
  claimed: boolean
  claimedAt: number | null
  /** Evidence counts. Weighted so a long-passage success counts for less. */
  successes: number
  independents: number
  /** Independent hidden recalls of this ayah on its own (or in a 1-2 ayah unit): "verified individually". */
  singleIndependents: number
  passageSuccesses: number
  lapses: number
  lastLapseAt: number | null
  prompts: number
  reviews: number
}

export function newMemory(surah: number, ayah: number): AyahMemory {
  return {
    surah, ayah, stability: 0, lastEvidenceAt: 0, lastSuccessAt: null, firstDemonstratedAt: null,
    lastOutcome: null, lastOutcomeWeight: 0, lastScope: null,
    claimed: false, claimedAt: null,
    successes: 0, independents: 0, singleIndependents: 0, passageSuccesses: 0,
    lapses: 0, lastLapseAt: null, prompts: 0, reviews: 0,
  }
}

/** Estimated probability of successful recall `now`, from the model alone. */
export function retrievability(m: Pick<AyahMemory, 'stability' | 'lastEvidenceAt'>, now: number): number {
  if (m.stability <= 0 || !m.lastEvidenceAt) return 0
  const t = Math.max(0, (now - m.lastEvidenceAt) / DAY)
  return Math.pow(1 + PARAMS.F * (t / m.stability), PARAMS.C)
}

/** Days from `lastEvidenceAt` until retrievability falls to `target`. */
export function dueInDays(stability: number, target = PARAMS.targetRetrievability): number {
  // Invert R(t) = (1 + F t/S)^C  =>  t = S/F * (target^(1/C) - 1)
  return (stability / PARAMS.F) * (Math.pow(target, 1 / PARAMS.C) - 1)
}

export function dueAt(m: AyahMemory, target = PARAMS.targetRetrievability): number {
  return m.lastEvidenceAt + dueInDays(m.stability, target) * DAY
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** Apply one piece of attributed evidence. Pure: returns a new object. */
export function applyEvidence(prev: AyahMemory, ev: AyahEvidence): AyahMemory {
  if (ev.outcome === 'untested' || ev.weight <= 0) return prev
  const m: AyahMemory = { ...prev }
  const w = clamp(ev.weight, 0, 1)
  const hadStability = m.stability > 0
  const R = hadStability ? retrievability(m, ev.at) : 1
  const S = hadStability ? m.stability : 0
  m.reviews += 1

  const success = ev.outcome === 'independent' || ev.outcome === 'hesitant'
  let next: number
  if (success) {
    if (!hadStability) {
      next = PARAMS.initialStability[ev.outcome]
    } else {
      const base = 1 + PARAMS.growthBase * Math.pow(S, PARAMS.growthExponent)
      const timing = clamp(0.35 + 0.65 * ((1 - R) / 0.1), 0.35, 1.5)
      const g = ev.outcome === 'independent' ? 1 : PARAMS.hesitantGrowth
      next = S * (1 + (base - 1) * timing * g)
    }
    m.successes += w
    if (ev.outcome === 'independent') m.independents += w
    if (ev.scope === 'single' && ev.outcome === 'independent' && w >= PARAMS.solidWeight) m.singleIndependents += 1
    if (ev.scope === 'passage') m.passageSuccesses += w
    if (w >= PARAMS.solidWeight) m.lastSuccessAt = ev.at
    if (m.firstDemonstratedAt === null) m.firstDemonstratedAt = ev.at
  } else if (ev.outcome === 'prompted') {
    next = hadStability ? S * PARAMS.promptedDecay : PARAMS.initialStability.prompted
    m.prompts += 1
  } else {
    next = hadStability ? Math.min(S * PARAMS.failedDecay, PARAMS.failedCeiling) : PARAMS.initialStability.failed
    if (w >= 0.75) {
      m.lapses += 1
      m.lastLapseAt = ev.at
    }
  }
  next = clamp(next, PARAMS.minStability, PARAMS.maxStability)
  // Attribution weight blends the update: uncertain evidence moves the estimate less.
  m.stability = hadStability ? S + w * (next - S) : next
  m.stability = clamp(m.stability, PARAMS.minStability, PARAMS.maxStability)
  m.lastEvidenceAt = ev.at
  m.lastOutcome = ev.outcome
  m.lastOutcomeWeight = w
  m.lastScope = ev.scope === 'junction' ? m.lastScope : ev.scope
  return m
}

/** A declaration seeds the model with a cautious prior and flags the material as unverified. */
export function applyClaim(prev: AyahMemory, at: number): AyahMemory {
  const m = { ...prev, claimed: true, claimedAt: at }
  if (m.stability <= 0) {
    m.stability = PARAMS.claimedPriorStability
    m.lastEvidenceAt = at
  }
  return m
}

export function applyRetract(prev: AyahMemory): AyahMemory {
  const m = { ...prev, claimed: false, claimedAt: null }
  if (m.firstDemonstratedAt === null) {
    m.stability = 0
    m.lastEvidenceAt = 0
  }
  return m
}
