import { describe, expect, it } from 'vitest'
import { applyClaim, applyEvidence, applyRetract, dueInDays, newMemory, PARAMS, retrievability } from '@/lib/engine/memory'
import type { AyahEvidence } from '@/lib/engine/attribution'
import { DAY } from '@/lib/engine/types'

const ev = (outcome: AyahEvidence['outcome'], at: number, weight = 1, scope: AyahEvidence['scope'] = 'single'): AyahEvidence => ({
  surah: 1, ayah: 1, at, outcome, weight, scope, passageLength: scope === 'single' ? 1 : 5, eventId: 'x',
})
const T0 = Date.UTC(2026, 0, 1)

describe('forgetting curve', () => {
  it('is exactly 90% at one stability interval', () => {
    const m = { stability: 10, lastEvidenceAt: T0 }
    expect(retrievability(m, T0 + 10 * DAY)).toBeCloseTo(0.9, 6)
  })
  it('decreases monotonically and never exceeds 1', () => {
    const m = { stability: 5, lastEvidenceAt: T0 }
    let prev = 1.0001
    for (let d = 0; d < 400; d += 3) {
      const r = retrievability(m, T0 + d * DAY)
      expect(r).toBeLessThanOrEqual(prev)
      expect(r).toBeGreaterThan(0)
      prev = r
    }
  })
  it('dueInDays inverts the curve', () => {
    for (const S of [0.5, 1, 7, 60, 300]) {
      const t = dueInDays(S)
      expect(retrievability({ stability: S, lastEvidenceAt: T0 }, T0 + t * DAY)).toBeCloseTo(0.9, 6)
      expect(t).toBeCloseTo(S, 6) // by construction R(S)=0.9
    }
  })
  it('reports zero for never-seen material', () => {
    expect(retrievability({ stability: 0, lastEvidenceAt: 0 }, T0)).toBe(0)
  })
})

describe('applying evidence', () => {
  it('first independent recall sets a one-day stability', () => {
    const m = applyEvidence(newMemory(1, 1), ev('independent', T0))
    expect(m.stability).toBe(1)
    expect(m.firstDemonstratedAt).toBe(T0)
    expect(m.singleIndependents).toBe(1)
  })
  it('grows stability on on-time success, and more when the review was later', () => {
    const base = applyEvidence(newMemory(1, 1), ev('independent', T0))
    const onTime = applyEvidence(base, ev('independent', T0 + 1 * DAY))
    const late = applyEvidence(base, ev('independent', T0 + 6 * DAY))
    const early = applyEvidence(base, ev('independent', T0 + 0.1 * DAY))
    expect(onTime.stability).toBeGreaterThan(base.stability)
    expect(late.stability).toBeGreaterThan(onTime.stability)
    expect(early.stability).toBeLessThan(onTime.stability)
  })
  it('hesitant success grows less than independent', () => {
    const base = applyEvidence(newMemory(1, 1), ev('independent', T0))
    const a = applyEvidence(base, ev('independent', T0 + DAY))
    const b = applyEvidence(base, ev('hesitant', T0 + DAY))
    expect(b.stability).toBeGreaterThan(base.stability)
    expect(b.stability).toBeLessThan(a.stability)
  })
  it('prompting shrinks stability slightly; failure shrinks it sharply and counts a lapse', () => {
    let m = newMemory(1, 1)
    for (let i = 0; i < 6; i++) m = applyEvidence(m, ev('independent', T0 + i * 5 * DAY))
    const S = m.stability
    const at = T0 + 40 * DAY
    const p = applyEvidence(m, ev('prompted', at))
    const f = applyEvidence(m, ev('failed', at))
    expect(p.stability).toBeLessThan(S)
    expect(f.stability).toBeLessThan(p.stability)
    expect(f.stability).toBeLessThanOrEqual(PARAMS.failedCeiling)
    expect(f.lapses).toBe(1)
    expect(p.lapses).toBe(0)
  })
  it('low-weight evidence moves the estimate proportionally less', () => {
    const base = applyEvidence(newMemory(1, 1), ev('independent', T0))
    const full = applyEvidence(base, ev('independent', T0 + DAY, 1))
    const half = applyEvidence(base, ev('independent', T0 + DAY, 0.5, 'passage'))
    expect(half.stability - base.stability).toBeCloseTo((full.stability - base.stability) / 2, 6)
  })
  it('never makes a passage-only success count as individually verified', () => {
    const m = applyEvidence(newMemory(1, 1), ev('independent', T0, 0.7, 'passage'))
    expect(m.singleIndependents).toBe(0)
    expect(m.passageSuccesses).toBeGreaterThan(0)
  })
  it('ignores untested evidence and zero weight', () => {
    const m = newMemory(1, 1)
    expect(applyEvidence(m, ev('untested', T0))).toBe(m)
    expect(applyEvidence(m, ev('independent', T0, 0))).toBe(m)
  })
  it('keeps stability within bounds', () => {
    let m = newMemory(1, 1)
    for (let i = 0; i < 80; i++) m = applyEvidence(m, ev('independent', T0 + i * 500 * DAY))
    expect(m.stability).toBeLessThanOrEqual(PARAMS.maxStability)
    for (let i = 0; i < 20; i++) m = applyEvidence(m, ev('failed', T0 + (100 + i) * 500 * DAY))
    expect(m.stability).toBeGreaterThanOrEqual(PARAMS.minStability)
  })
})

describe('claims', () => {
  it('seeds a cautious prior without marking the material as demonstrated', () => {
    const m = applyClaim(newMemory(1, 1), T0)
    expect(m.claimed).toBe(true)
    expect(m.stability).toBe(PARAMS.claimedPriorStability)
    expect(m.firstDemonstratedAt).toBeNull()
  })
  it('retracting an unverified claim returns to a blank slate; retracting a verified one keeps its history', () => {
    expect(applyRetract(applyClaim(newMemory(1, 1), T0)).stability).toBe(0)
    const verified = applyEvidence(applyClaim(newMemory(1, 1), T0), ev('independent', T0 + DAY))
    const r = applyRetract(verified)
    expect(r.claimed).toBe(false)
    expect(r.firstDemonstratedAt).not.toBeNull()
    expect(r.stability).toBeGreaterThan(0)
  })
})
