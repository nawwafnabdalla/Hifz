import { describe, expect, it } from 'vitest'
import { LEAD_FULL_MAX, LEAD_TAIL, leadInFor } from '@/lib/engine/leadin'
import { corpus, wordsOfAyah } from '@/lib/quran/data'

const wc = (s: number, a: number) => wordsOfAyah(s, a).length
describe('the run-up into a revised passage', () => {
  it('Ta-Ha 7–9: the run-up is ayah 6, shown whole', () => {
    const l = leadInFor(20, 7, wc)
    expect(l).toMatchObject({ kind: 'ayah', surah: 20, ayah: 6, from: 0, truncated: false })
    expect((l as { to: number }).to).toBe(wc(20, 6) - 1)
  })
  it('a very long preceding ayah shows only its last words (2:282 before 2:283)', () => {
    const l = leadInFor(2, 283, wc) as { kind: 'ayah'; from: number; to: number; truncated: boolean }
    expect(wc(2, 282)).toBeGreaterThan(LEAD_FULL_MAX)
    expect(l.truncated).toBe(true); expect(l.to).toBe(wc(2, 282) - 1); expect(l.to - l.from + 1).toBe(LEAD_TAIL)
  })
  it('a preceding ayah just under the limit is shown whole; just over is shortened', () => {
    const fake = (n: number) => () => n
    expect(leadInFor(5, 3, fake(LEAD_FULL_MAX))).toMatchObject({ truncated: false, from: 0 })
    expect(leadInFor(5, 3, fake(LEAD_FULL_MAX + 1))).toMatchObject({ truncated: true })
  })
  it('at the start of a surah the cue is the surah itself, with the Basmala for every surah except al-Fatiha (where it is ayah 1) and al-Tawbah', () => {
    expect(leadInFor(20, 1, wc)).toEqual({ kind: 'surah-start', surah: 20, basmala: true })
    expect(leadInFor(1, 1, wc)).toEqual({ kind: 'surah-start', surah: 1, basmala: false })
    expect(leadInFor(9, 1, wc)).toEqual({ kind: 'surah-start', surah: 9, basmala: false })
  })
  it('an unavailable preceding ayah falls back to the surah cue', () => {
    expect(leadInFor(20, 7, () => 0)).toMatchObject({ kind: 'surah-start' })
  })
  it('every ayah of the Qur\'an has a sensible run-up that points inside the same surah', () => {
    for (let s = 1; s <= 114; s++) for (let a = 1; a <= corpus.ayahCount(s); a++) {
      const l = leadInFor(s, a, wc)
      if (a === 1) expect(l.kind).toBe('surah-start')
      else { expect(l.kind).toBe('ayah'); const x = l as { ayah: number; from: number; to: number }; expect(x.ayah).toBe(a - 1); expect(x.from).toBeGreaterThanOrEqual(0); expect(x.to).toBe(wc(s, a - 1) - 1); expect(x.to - x.from + 1).toBeLessThanOrEqual(LEAD_FULL_MAX) }
    }
  })
})
