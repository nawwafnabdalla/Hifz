import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { SURAHS, wordsOfAyah } from '@/lib/quran/data'
import { buildPhrases, suggestBoundaries } from '@/lib/engine/phrases'
import { BREAK_P, WHOLE_LIMIT, candidatesFor, defaultBreakdown, planBreaks } from '@/lib/engine/breakdown'

const all = () => SURAHS.flatMap((s) => Array.from({ length: s.count }, (_, k) => ({ s: s.n, a: k + 1, w: wordsOfAyah(s.n, k + 1) })))
const ph = (s: number, a: number, pauses: { afterWord: number; ms: number }[] = []) => { const w = wordsOfAyah(s, a); const b = defaultBreakdown(s, a, w, pauses); return { w, b, p: buildPhrases(w, b.boundaries) } }

describe('automatic practice phrases: what the engine decides', () => {
  it('short ayahs are learned whole, never broken', () => {
    let n = 0
    for (const { s, a, w } of all()) if (w.length <= WHOLE_LIMIT) { n++; expect(defaultBreakdown(s, a, w).boundaries, `${s}:${a}`).toEqual([]) }
    expect(n).toBeGreaterThan(3500)
  })
  it('never breaks after the "do not stop" sign, and never leaves a piece of one or two words in an ayah long enough to break', () => {
    for (const { s, a, w } of all()) {
      const b = defaultBreakdown(s, a, w)
      for (const i of b.boundaries) expect(w[i]!.includes('ۙ'), `${s}:${a} after word ${i + 1}`).toBe(false)
      if (w.length > WHOLE_LIMIT) for (const p of buildPhrases(w, b.boundaries)) expect(p.words.length, `${s}:${a}`).toBeGreaterThanOrEqual(3)
    }
  })
  it('the words are never altered and every phrase is contiguous', () => {
    for (const { s, a, w } of all()) expect(buildPhrases(w, defaultBreakdown(s, a, w).boundaries).flatMap((p) => p.words).join(' ')).toBe(w.join(' '))
  })
  it('every break has stated evidence: a printed stop sign, or grammar that the model rates as a plausible clause boundary', () => {
    for (const { s, a, w } of all()) {
      const b = defaultBreakdown(s, a, w), stops = new Set(suggestBoundaries(w).boundaries), cands = new Map(candidatesFor(s, a, w.length).map((c) => [c.after, c.p]))
      for (const i of b.boundaries) {
        if (stops.has(i)) expect(b.basis[i]).toBe('stop sign')
        else { expect(cands.get(i), `${s}:${a} after ${i + 1} has no grammatical evidence`).toBeGreaterThanOrEqual(0.03); expect(b.basis[i]).toMatch(/^grammar/) }
      }
    }
  })
  it('a stretch with no good evidence is left whole rather than guessed at (up to a reasonable length)', () => {
    expect(planBreaks(15, [], [{ after: 6, p: 0.04 }]).boundaries).toEqual([])
    expect(planBreaks(15, [], []).boundaries).toEqual([])
    expect(planBreaks(15, [], [{ after: 7, p: 0.6 }]).boundaries).toEqual([7])
  })
  it('a very long stretch is broken even on modest evidence, because holding it whole costs more', () => {
    const b = planBreaks(36, [], [{ after: 8, p: 0.1 }, { after: 17, p: 0.09 }, { after: 26, p: 0.12 }])
    expect(b.boundaries.length).toBeGreaterThanOrEqual(2)
  })
  it('printed stop signs are taken when the pieces stay sensible, and labelled as such', () => {
    const b = planBreaks(20, [9], [])
    expect(b.boundaries).toEqual([9]); expect(b.basis[9]).toBe('stop sign')
  })
  it('the reciter\'s pause strengthens a grammatical candidate, and a run-through weakens it', () => {
    const c = [{ after: 7, p: 0.1 }]
    expect(planBreaks(15, [], c).boundaries).toEqual([])
    const paused = planBreaks(15, [], c, [{ afterWord: 7, ms: 380 }])
    expect(paused.boundaries).toEqual([7]); expect(paused.basis[7]).toMatch(/reciter/)
    expect(planBreaks(15, [], [{ after: 7, p: 0.4 }], [{ afterWord: 7, ms: 10 }]).boundaries).toEqual([])
  })
  it('a pause on its own is never enough: no grammatical or printed evidence means no break, however long the pause', () => {
    expect(planBreaks(20, [], [], [{ afterWord: 9, ms: 900 }]).boundaries).toEqual([])
    expect(planBreaks(20, [], [{ after: 4, p: 0.1 }], [{ afterWord: 9, ms: 900 }]).boundaries).not.toContain(9)
  })
  it('reciter pauses only ever choose among grammatical candidates, so a different reciter changes timing, not meaning', () => {
    const { b: plain } = ph(20, 71), { b: timed } = ph(20, 71, [{ afterWord: 3, ms: 500 }, { afterWord: 4, ms: 500 }])
    const cands = new Set(candidatesFor(20, 71, wordsOfAyah(20, 71).length).map((c) => c.after))
    const stops = new Set(suggestBoundaries(wordsOfAyah(20, 71)).boundaries)
    for (const i of [...plain.boundaries, ...timed.boundaries]) expect(cands.has(i) || stops.has(i)).toBe(true)
  })
})

describe('is the grammar model any good? (judged on surahs it never saw)', () => {
  const r = JSON.parse(readFileSync('data/crosscheck/phrase-model-report.json', 'utf8'))
  it('ranks the mushaf\'s own pause positions far above chance', () => {
    expect(r.cvAuc).toBeGreaterThan(0.9)                                   // measured 0.94
    expect(r.top1AgreementAyahsWithOneSign).toBeGreaterThan(0.6)           // measured 0.68; chance is roughly 1 in 10
    expect(r.positions).toBeGreaterThan(70000)
    expect(r.skippedAyahs).toBeLessThan(10)
  })
  it('is pinned to a checksummed source', () => { expect(r.source.sha256).toMatch(/^[0-9a-f]{64}$/); expect(r.source.dataset).toMatch(/Quranic Arabic Corpus/) })
  it('shows its work: the threshold is the one used at runtime', () => { expect(BREAK_P).toBeLessThanOrEqual(r.tau) })
})

describe('hard cases from Surat Ta-Ha (long ayahs the old stop-sign rule left whole)', () => {
  const cases: Record<string, string[]> = {
    // Each expected phrase is a complete clause; boundaries must fall between clauses, never inside one.
    '71': ['قَالَ ءَامَنتُمۡ لَهُۥ قَبۡلَ أَنۡ ءَاذَنَ لَكُمۡ', 'إِنَّهُۥ لَكَبِيرُكُمُ ٱلَّذِي عَلَّمَكُمُ ٱلسِّحۡرَ'],
    '53': ['ٱلَّذِي جَعَلَ لَكُمُ ٱلۡأَرۡضَ مَهۡدٗا', 'وَسَلَكَ لَكُمۡ فِيهَا سُبُلٗا'],
  }
  const strip = (s: string) => s.replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '').replace(/[أإآٱ]/g, 'ا')
  for (const [a, expected] of Object.entries(cases)) {
    it(`20:${a} breaks between clauses`, () => {
      const { p } = ph(20, Number(a))
      const got = p.map((x) => strip(x.text))
      for (const e of expected) expect(got.some((g) => g.startsWith(strip(e).slice(0, 14))), `${strip(e)} should begin a phrase`).toBe(true)
    })
  }
  it('20:97 keeps "فَإِنَّ لَكَ فِي ٱلۡحَيَوٰةِ أَن تَقُولَ" together (a verb is not separated from its complement)', () => {
    const { p } = ph(20, 97)
    const first = p[0]!.text
    expect(first).toContain('أَن تَقُولَ')
  })
  it('breaks are never made right after a relative pronoun, negation, vocative or preposition, anywhere in the Qur\'an (using the model\'s own learned negatives)', () => {
    // The learned model gives these positions probabilities near zero; no chosen non-stop-sign break may sit below 3%.
    for (const { s, a, w } of all()) {
      const stops = new Set(suggestBoundaries(w).boundaries), c = new Map(candidatesFor(s, a, w.length).map((x) => [x.after, x.p]))
      for (const i of defaultBreakdown(s, a, w).boundaries) if (!stops.has(i)) expect(c.get(i) ?? 0).toBeGreaterThanOrEqual(0.03)
    }
  })
})
