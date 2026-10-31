import { describe, expect, it } from 'vitest'
import { connectedStretches, isDuplicate, passageStatus, roughMinutes } from '@/lib/passages'
import { deriveState } from '@/lib/engine/derive'
import { daysAgo, fakeCorpus, NOW, review } from './helpers'

const corpus = fakeCorpus({ 20: 135, 112: 4, 1: 7 }, 10)
const derived = (rs: ReturnType<typeof review>[], decl: Parameters<typeof deriveState>[0]['declarations'] = []) => deriveState({ reviews: rs, flows: [], declarations: decl })
const singles = (s: number, a: number, b: number, d = 1) => Array.from({ length: b - a + 1 }, (_, i) => review([s, a + i, a + i], 'independent', daysAgo(d)))

describe('connected stretches', () => {
  it('returns the maximal unbroken run of recently recalled ayahs, ending where memorisation ends', () => {
    const d = derived([...singles(20, 1, 9), ...singles(20, 11, 14)])    // ayah 10 missing
    const s = connectedStretches(d, corpus, NOW)
    expect(s[0]!.range).toEqual({ surah: 20, start: 1, end: 9 })
    expect(s.map((x) => x.range.end)).toContain(14)
  })
  it('never counts material that was only marked known, or is fading, or needs repair', () => {
    const claimed = derived([], [{ id: 'd1', range: { surah: 20, start: 1, end: 20 }, level: 'known', occurredAt: daysAgo(3) }])
    expect(connectedStretches(claimed, corpus, NOW)).toHaveLength(0)
    const fading = derived(singles(20, 1, 6, 200))
    expect(connectedStretches(fading, corpus, NOW)).toHaveLength(0)
    const failing = derived([...singles(20, 1, 6, 5), review([20, 3, 3], 'failed', daysAgo(1))])
    expect(connectedStretches(failing, corpus, NOW).every((x) => !(x.range.start <= 3 && x.range.end >= 3))).toBe(true)
  })
  it('does not join across surahs and respects a minimum length', () => {
    const d = derived([...singles(1, 1, 7), ...singles(112, 1, 2)])
    const s = connectedStretches(d, corpus, NOW)
    expect(s.map((x) => x.range.surah)).toEqual([1])
    expect(s[0]!.range).toEqual({ surah: 1, start: 1, end: 7 })
  })
})

describe('passage status', () => {
  it('reports verified only when every ayah was recalled and is well retained', () => {
    expect(passageStatus({ surah: 20, start: 1, end: 5 }, derived(singles(20, 1, 5)), NOW).verified).toBe(true)
    expect(passageStatus({ surah: 20, start: 1, end: 5 }, derived(singles(20, 1, 4)), NOW)).toMatchObject({ verified: false, allDemonstrated: false })
    expect(passageStatus({ surah: 20, start: 1, end: 5 }, derived(singles(20, 1, 5, 300)), NOW).verified).toBe(false)
  })
})

describe('helpers', () => {
  it('rough reading time is a guide with a floor of one minute', () => {
    expect(roughMinutes(40)).toBe(1)
    expect(roughMinutes(450)).toBe(5)
  })
  it('detects a duplicate saved range', () => {
    expect(isDuplicate([{ id: 'x', name: 'n', range: { surah: 1, start: 1, end: 7 }, createdAt: 1 }], { surah: 1, start: 1, end: 7 })).toBe(true)
  })
})
