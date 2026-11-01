import { describe, expect, it } from 'vitest'
import { SURAHS, wordsOfAyah, ayahCount } from '@/lib/quran/data'
import { buildPhrases, suggestBoundaries } from '@/lib/engine/phrases'
import { suggestBreakdown, baseLetters, MAX_PIECE, MIN_PIECE } from '@/lib/engine/breakdown'

const plan = (s: number, a: number, pauses: { afterWord: number; ms: number }[] = []) => {
  const w = wordsOfAyah(s, a)
  const stop = suggestBoundaries(w)
  const b = suggestBreakdown(w, stop.boundaries, pauses)
  return { w, stop, b, ph: buildPhrases(w, b.boundaries) }
}

describe('practice breaks for long ayahs', () => {
  it('leaves short ayahs and stop-sign phrases exactly as they were', () => {
    for (const [s, a] of [[20, 2], [20, 1], [112, 1], [2, 255]] as const) {
      const { stop, b, w } = plan(s, a)
      if (w.length <= MAX_PIECE) expect(b.boundaries).toEqual(stop.boundaries)
      for (const x of stop.boundaries) expect(b.boundaries).toContain(x)             // stop-sign breaks are never removed
    }
  })
  it('breaks the long Ta-Ha ayahs that have no stop signs into manageable pieces', () => {
    for (const a of [40, 71, 86, 97, 47, 53, 72, 130, 77, 94]) {
      const { ph, w } = plan(20, a)
      expect(ph.length, `20:${a} (${w.length} words)`).toBeGreaterThan(1)
      for (const p of ph) { expect(p.words.length).toBeLessThanOrEqual(MAX_PIECE + 2); expect(p.words.length).toBeGreaterThanOrEqual(MIN_PIECE) }
    }
  })
  it('across the whole Qur\'an no piece is absurdly long or short, and the words are never changed', () => {
    let tooLong = 0, tooShort = 0, total = 0
    for (const s of SURAHS) for (let a = 1; a <= s.count; a++) {
      const { w, b, ph, stop } = plan(s.n, a)
      expect(ph.flatMap((p) => p.words).join(' ')).toBe(w.join(' '))
      total++
      for (const p of ph) {
        if (p.words.length > MAX_PIECE + 2 && !(stop.boundaries.length < b.boundaries.length === false && p.words.length > MAX_PIECE)) tooLong++
        const fromStopSign = !b.reasons[p.to] || p.to === w.length - 1
        if (p.words.length < MIN_PIECE && !fromStopSign) tooShort++
      }
    }
    expect(total).toBe(6236)
    expect(tooShort).toBe(0)
    expect(tooLong).toBeLessThan(40)                    // only stop-sign-made pieces that were already long
  })
  it('prefers a break where the reciter really paused, and says so', () => {
    const w = wordsOfAyah(20, 71)
    const stop = suggestBoundaries(w)
    const without = suggestBreakdown(w, stop.boundaries)
    const target = without.boundaries[0]! + 2
    const withPause = suggestBreakdown(w, stop.boundaries, [{ afterWord: target, ms: 420 }])
    expect(withPause.boundaries).toContain(target)
    expect(withPause.reasons[target]).toMatch(/reciter pauses/)
  })
  it('ignores pauses too short to be a pause', () => {
    const w = wordsOfAyah(20, 71), stop = suggestBoundaries(w)
    const base = suggestBreakdown(w, stop.boundaries)
    expect(suggestBreakdown(w, stop.boundaries, [{ afterWord: base.boundaries[0]! + 2, ms: 60 }]).boundaries).toEqual(base.boundaries)
  })
  it('does not split a short particle or preposition from what follows it', () => {
    for (let a = 1; a <= ayahCount(20); a++) {
      const { w, b } = plan(20, a)
      for (const i of b.boundaries) if (b.reasons[i]?.startsWith('a practice break')) expect(baseLetters(w[i]!).length, `20:${a} after word ${i + 1}`).toBeGreaterThan(2)
    }
  })
  it('strips vowels and signs to compare letters only', () => {
    expect(baseLetters('ثُمَّ')).toBe('ثم')
    expect(baseLetters('إِذْ')).toBe('اذ')
  })
  it('with a reciter\'s timing, never invents a break where the reciter did not pause (up to a generous length)', () => {
    const w = wordsOfAyah(20, 63), stop = suggestBoundaries(w)               // 13 words
    const timed = suggestBreakdown(w, stop.boundaries, [{ afterWord: 3, ms: 20 }, { afterWord: 7, ms: 30 }])
    expect(timed.boundaries).toEqual(stop.boundaries)                         // no pauses: left as the stop signs give it
  })
  it('without any timing, does not put a break before أَن (it completes the verb before it)', () => {
    for (const a of [97, 86]) {
      const { w, b } = plan(20, a)
      for (const i of b.boundaries) if (b.reasons[i]?.startsWith('a practice break')) expect(baseLetters(w[i + 1]!), `20:${a}`).not.toBe('ان')
    }
  })
})
