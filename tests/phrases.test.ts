import { describe, expect, it } from 'vitest'
import { buildLadder, buildPhrases, STOP_MARKS, suggestBoundaries, wordsOf } from '@/lib/engine/phrases'
import { SURAHS, textOf } from '@/lib/quran/data'

const w = (n: number, marks: Record<number, string> = {}) => Array.from({ length: n }, (_, i) => `w${i}${marks[i] ?? ''}`)

describe('phrase boundaries', () => {
  it('uses stop-permitting signs by default and never the "do not stop" sign', () => {
    const words = w(12, { 3: 'ۗ', 7: 'ۙ', 9: 'ۚ' })
    const s = suggestBoundaries(words)
    expect(s.boundaries).toEqual([3, 9])
    expect(s.boundaries).not.toContain(7)
  })
  it('treats "continuing preferred" and paired marks as weak: only on request', () => {
    const words = w(10, { 4: 'ۖ' })
    expect(suggestBoundaries(words).boundaries).toEqual([])
    expect(suggestBoundaries(words, { includeWeak: true }).boundaries).toEqual([4])
  })
  it('keeps phrases at least two words long', () => {
    const words = w(8, { 0: 'ۗ', 1: 'ۗ', 5: 'ۗ' })
    const { boundaries } = suggestBoundaries(words)
    const ph = buildPhrases(words, boundaries)
    for (const p of ph) expect(p.words.length).toBeGreaterThanOrEqual(2)
  })
  it('does not invent boundaries where the text has no marks', () => {
    expect(suggestBoundaries(w(40)).boundaries).toEqual([])
  })
  it('rebuilds the exact original words for every ayah in the Qur’an', () => {
    for (const s of SURAHS) for (let a = 1; a <= s.count; a++) {
      const words = wordsOf(textOf(s.n, a))
      const { boundaries } = suggestBoundaries(words)
      const phrases = buildPhrases(words, boundaries)
      expect(phrases.flatMap((p) => p.words)).toEqual(words)
      expect(phrases.map((p) => p.text).join(' ')).toBe(textOf(s.n, a))
    }
  })
  it('documents every sign it knows', () => {
    expect(Object.keys(STOP_MARKS)).toHaveLength(7)
  })
})

describe('overlapping chain ladder', () => {
  const ph = (k: number) => buildPhrases(w(k * 3), Array.from({ length: k - 1 }, (_, i) => i * 3 + 2))
  it('follows A→B, B→C, C→D, then A→B→C→D for four phrases', () => {
    const l = buildLadder(ph(4))
    expect(l.map((r) => r.label)).toEqual(['A → B', 'B → C', 'C → D', 'A → B → C → D'])
    expect(l[l.length - 1]!.kind).toBe('full')
  })
  it('has a single full rung for one or two phrases', () => {
    expect(buildLadder(ph(1))).toHaveLength(1)
    expect(buildLadder(ph(2)).map((r) => r.kind)).toEqual(['full'])
  })
  it('grows a chain from the start for long ayahs', () => {
    const l = buildLadder(ph(6))
    expect(l.filter((r) => r.kind === 'pair')).toHaveLength(5)
    expect(l.map((r) => r.label).slice(-4)).toEqual(['A → B → C', 'A → B → C → D', 'A → B → C → D → E', 'A → B → C → D → E → F'])
  })
  it('gives long phrases a solo warm-up first', () => {
    const words = w(20)
    const phrases = buildPhrases(words, [9])   // two 10-word phrases
    const l = buildLadder(phrases)
    expect(l[0]!.kind).toBe('solo')
  })
  it('every rung covers valid phrase indices', () => {
    for (let k = 1; k <= 14; k++) for (const r of buildLadder(ph(k))) { expect(r.from).toBeGreaterThanOrEqual(0); expect(r.to).toBeLessThan(k); expect(r.from).toBeLessThanOrEqual(r.to) }
  })
})
