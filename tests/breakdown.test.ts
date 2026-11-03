import reviewList from '@/data/phrase-review.json'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { SURAHS, wordsOfAyah } from '@/lib/quran/data'
import { buildPhrases, suggestBoundaries } from '@/lib/engine/phrases'
import { BREAK_P, WHOLE_LIMIT, attachesBackward, candidatesFor, defaultBreakdown, planBreaks } from '@/lib/engine/breakdown'

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
        else if (b.basis[i] === 'reviewed') expect((reviewList.ayahs as Record<string, { approved?: number[] }>)[`${s}:${a}`]?.approved ?? [], `${s}:${a} after ${i + 1} is marked reviewed but is not on the reviewed list`).toContain(i)
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
    const b = planBreaks(36, [], [{ after: 8, p: 0.15 }, { after: 17, p: 0.14 }, { after: 26, p: 0.13 }])
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
    expect(r.cvAuc).toBeGreaterThan(0.87)                                  // measured 0.89 (corpus-free model)
    expect(r.top1AgreementAyahsWithOneSign).toBeGreaterThan(0.4)           // measured 0.48; chance is roughly 1 in 10
    expect(r.positions).toBeGreaterThan(70000)
    expect(r.skippedAyahs).toBe(0)
  })
  it('uses no third-party linguistic data, so shipping its scores carries no licence obligation', () => { expect(r.mode).toBe('orth'); expect(r.source.dataset).toMatch(/canonical text only/) })
  it('shows its work: the threshold is the one used at runtime', () => { expect(BREAK_P).toBeLessThanOrEqual(r.tau) })
})

describe('hard cases from Surat Ta-Ha (long ayahs the old stop-sign rule left whole)', () => {
  it('every phrase is a contiguous run of at least three words and the ayah is reassembled exactly', () => {
    for (const a of [40, 47, 53, 71, 86, 94, 97, 130]) { const { w, p } = ph(20, a); expect(p.flatMap((x) => x.words).join(' ')).toBe(w.join(' ')); for (const x of p) expect(x.words.length, `20:${a}`).toBeGreaterThanOrEqual(3) }
  })
  it('long ayahs are broken into pieces of a learnable length, and never into pieces that are far too long', () => {
    for (const a of [40, 71, 86, 97]) { const { p } = ph(20, a); expect(p.length, `20:${a}`).toBeGreaterThan(1); expect(Math.max(...p.map((x) => x.words.length)), `20:${a}`).toBeLessThanOrEqual(16) }
  })
})

describe('rules that need no statistics', () => {
  it('never breaks right before a word that completes what precedes it (subordinating أَن, كَيۡ, إِلَّا) unless the mushaf marks a pause there', () => {
    let seen = 0
    for (const { s, a, w } of all()) {
      const stops = new Set(suggestBoundaries(w).boundaries)
      for (const i of defaultBreakdown(s, a, w).boundaries) if (!stops.has(i)) { seen++; expect(attachesBackward(w[i + 1]!), `${s}:${a} before word ${i + 2}`).toBe(false) }
    }
    expect(seen).toBeGreaterThan(1000)
  })
  it('recognises the subordinator from spelling, not from a word list of everything with those letters', () => {
    expect(attachesBackward('أَن')).toBe(true); expect(attachesBackward('أَنَّ')).toBe(false); expect(attachesBackward('إِنَّ')).toBe(false); expect(attachesBackward('إِن')).toBe(false)
    expect(attachesBackward('كَيۡ')).toBe(true)
  })
  it('Ta-Ha 94 and 97 never start a phrase with the complement أَن', () => {
    for (const a of [94, 97]) { const { p } = ph(20, a); for (const x of p.slice(1)) expect(attachesBackward(x.words[0]!), `20:${a} phrase starts with ${x.words[0]}`).toBe(false) }
  })
  it('a reviewed rejection is honoured: the engine never uses a break a reviewer struck out', () => {
    const w = wordsOfAyah(20, 86), b = defaultBreakdown(20, 86, w)
    expect(b.boundaries).not.toContain(12)
  })
  it('a reviewed approval can lift a break the model alone would not use', () => {
    expect(planBreaks(20, [], [{ after: 9, p: 0.04 }], [], [], { approved: [9] }).basis[9]).toBe('reviewed')
    expect(planBreaks(20, [], [{ after: 9, p: 0.5 }], [], [], { rejected: [9] }).boundaries).toEqual([])
  })
  it('a grammar break below the floor is not used on grammar alone, but a confirming reciter pause can lift it (never a pause alone)', () => {
    expect(planBreaks(15, [], [{ after: 7, p: 0.09 }]).boundaries).toEqual([])
    expect(planBreaks(15, [], [{ after: 7, p: 0.09 }], [{ afterWord: 7, ms: 400 }]).boundaries).toEqual([7])
    expect(planBreaks(15, [], [{ after: 7, p: 0.04 }], [{ afterWord: 7, ms: 900 }]).boundaries).toEqual([])
  })
})
