import { describe, expect, it } from 'vitest'
import { attribute, passageWeight } from '@/lib/engine/attribution'
import { review, NOW } from './helpers'

describe('passage weight', () => {
  it('is 1 for one ayah, shrinks with length, and has a floor', () => {
    expect(passageWeight(1)).toBe(1)
    expect(passageWeight(2)).toBeLessThan(1)
    expect(passageWeight(5)).toBeLessThan(passageWeight(2))
    expect(passageWeight(500)).toBe(0.35)
  })
})

describe('conservative attribution', () => {
  it('credits a flawless single ayah fully, as a single-scope proof', () => {
    const a = attribute(review([2, 5, 5], 'independent', NOW))
    expect(a.ayahs).toHaveLength(1)
    expect(a.ayahs[0]).toMatchObject({ outcome: 'independent', weight: 1, scope: 'single' })
  })
  it('never gives every ayah in a successful passage full confidence', () => {
    const a = attribute(review([2, 1, 10], 'independent', NOW))
    expect(a.ayahs).toHaveLength(10)
    for (const e of a.ayahs) {
      expect(e.scope).toBe('passage')
      expect(e.weight).toBeLessThan(0.55)
      expect(e.weight).toBeGreaterThanOrEqual(0.35)
    }
  })
  it('applies negative flags at full strength and positives at the diluted weight', () => {
    const a = attribute(review([2, 1, 5], 'hesitant', NOW, { stumbles: [{ ayah: 3, kind: 'blank' }] }))
    const by = Object.fromEntries(a.ayahs.map((e) => [e.ayah, e]))
    expect(by[3]).toMatchObject({ outcome: 'failed', weight: 1 })
    expect(by[1]!.weight).toBeLessThan(1)
    expect(by[1]!.outcome).toBe('hesitant')
  })
  it('treats ayahs after the stopping point as untested', () => {
    const a = attribute(review([2, 1, 6], 'failed', NOW, { completedTo: 3, stumbles: [{ ayah: 3, kind: 'blank' }] }))
    expect(a.ayahs.map((e) => e.ayah)).toEqual([1, 2, 3])
    expect(a.ayahs.find((e) => e.ayah === 3)!.outcome).toBe('failed')
    expect(a.ayahs.find((e) => e.ayah === 1)!.outcome).toBe('hesitant') // got through, but weak proof
  })
  it('spreads an unlocated multi-ayah failure at half weight rather than blaming one ayah', () => {
    const a = attribute(review([2, 1, 4], 'failed', NOW))
    expect(a.ayahs).toHaveLength(4)
    for (const e of a.ayahs) { expect(e.outcome).toBe('failed'); expect(e.weight).toBe(0.5) }
  })
  it('scales evidence by how much of the text was visible', () => {
    expect(attribute(review([1, 1, 1], 'independent', NOW, { cueLevel: 0 })).ayahs).toHaveLength(0)
    expect(attribute(review([1, 1, 1], 'independent', NOW, { cueLevel: 2 })).ayahs[0]!.weight).toBe(0.6)
    expect(attribute(review([1, 1, 1], 'independent', NOW, { cueLevel: 4 })).ayahs[0]!.weight).toBe(1)
  })
  it('records continuity separately from ayah verification', () => {
    const ok = attribute(review([2, 1, 4], 'independent', NOW))
    expect(ok.junctions.map((j) => [j.from, j.ok])).toEqual([[1, true], [2, true], [3, true]])
    const shaky = attribute(review([2, 1, 4], 'hesitant', NOW, { shakyJunctions: [2] }))
    expect(shaky.junctions.find((j) => j.from === 2)!.ok).toBe(false)
    expect(shaky.junctions.find((j) => j.from === 1)!.ok).toBe(true)
    const entry = attribute(review([2, 1, 4], 'hesitant', NOW, { stumbles: [{ ayah: 3, kind: 'prompted' }] }))
    expect(entry.junctions.find((j) => j.from === 2)!.ok).toBe(false)
  })
  it('junction drills give continuity evidence only', () => {
    const a = attribute(review([2, 4, 5], 'independent', NOW, { kind: 'junction' }))
    expect(a.ayahs).toHaveLength(0)
    expect(a.junctions).toEqual([expect.objectContaining({ from: 4, ok: true })])
  })
})
