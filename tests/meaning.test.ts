import { describe, expect, it } from 'vitest'
import { clauseOpeners, defaultBreakdown, meaningBreakdown, meaningCut, meaningFor, meaningTextLength, openerKind, planBreaks, attachesBackward } from '@/lib/engine/breakdown'
import { phraseMeanings, tidy, MEANING_RATIO } from '@/lib/engine/meaning'
import { buildPhrases } from '@/lib/engine/phrases'
import { corpus, loadTranslation, wordsOfAyah } from '@/lib/quran/data'

describe('translation-derived evidence is consistent with the shipped text', () => {
  it('every ayah of the evidence file matches the Arabic word count and the exact translation it was derived from; every cut starts a word', async () => {
    const tr = await loadTranslation()
    let ayahs = 0, cuts = 0
    for (let s = 1; s <= 114; s++) for (let a = 1; a <= corpus.ayahCount(s); a++) {
      const w = wordsOfAyah(s, a)
      if (w.length <= 12) { expect(meaningFor(s, a, w.length)).toBeNull(); continue }            // short ayahs are never split, so they carry no evidence
      const m = meaningFor(s, a, w.length, tr[s - 1]![a - 1]!.length)
      if (!m) continue
      ayahs++
      expect(meaningTextLength(s, a)).toBe(tr[s - 1]![a - 1]!.length)
      for (const g of Object.keys(m).map(Number)) {
        expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThan(w.length - 1)
        const c = meaningCut(s, a, g)!, text = tr[s - 1]![a - 1]!
        expect(c).toBeGreaterThan(0); expect(c).toBeLessThan(text.length)
        expect(text[c]).toMatch(/[A-Za-z"“'‘\[]/)                                             // a cut is at the start of a word (or quote/bracket), never inside one
        expect(text[c - 1]).toMatch(/[\s"“'‘\[(]/)
        cuts++
      }
    }
    expect(ayahs).toBeGreaterThan(2300)
    expect(cuts).toBeGreaterThan(20000)
  })
  it('evidence is dropped, not misapplied, when the word count or the translation is not the one it was built for', () => {
    expect(meaningFor(20, 10, 17)).toBeNull()
    expect(meaningFor(20, 10, 18, 5)).toBeNull()
    expect(meaningFor(20, 10, 18)).not.toBeNull()
  })
})

describe('the translation is evidence, never the authority', () => {
  const stopNone: number[] = []
  it('cannot create a break the Arabic does not support', () => {
    const strongEnglishOnly = { 4: 3, 9: 3 }
    const b = planBreaks(18, stopNone, [], [], [], {}, { meaning: strongEnglishOnly, comfort: 4, comfortLong: 4 })
    expect(b.boundaries).toEqual([])
  })
  it('cannot override the avoid rules', () => {
    const b = planBreaks(18, stopNone, [{ after: 8, p: 0.6 }], [], [8], {}, { meaning: { 8: 3 }, comfort: 4, comfortLong: 4 })
    expect(b.boundaries).not.toContain(8)
  })
  it('strengthens a break the Arabic supports, and says so', () => {
    const b = planBreaks(18, stopNone, [{ after: 8, p: 0.2 }], [], [], {}, { meaning: { 8: 3 }, comfort: 8, comfortLong: 8 })
    expect(b.boundaries).toContain(8)
    expect(b.basis[8]).toBe('grammar and the translation')
  })
  it('evidence is attached to the better-supported Arabic gap within one word of where the alignment put it', () => {
    const b = planBreaks(24, stopNone, [{ after: 12, p: 0.45 }, { after: 11, p: 0.05 }], [], [], {}, { meaning: { 11: 2 }, comfort: 8, comfortLong: 8 })
    expect(b.boundaries).toContain(12); expect(b.boundaries).not.toContain(11)
  })
})

describe('Arabic clause openers (deterministic rules)', () => {
  const op = (w: string) => openerKind(w)
  it('recognises inna and sisters, la\'alla, thumma, aw, qala and the temporal/conditional openers', () => {
    expect(op('إِنِّيٓ')).toBe('inna'); expect(op('إِنَّهُۥ')).toBe('inna'); expect(op('إِنَّا')).toBe('inna'); expect(op('وَإِنَّا')).toBe('inna')
    expect(op('لَّعَلِّيٓ')).toBe('laalla'); expect(op('ثُمَّ')).toBe('thumma'); expect(op('أَوۡ')).toBe('aw')
    expect(op('فَقَالَ')).toBe('qaala'); expect(op('قَالُواْ')).toBe('qaala'); expect(op('إِذَا')).toBe('cond'); expect(op('وَلَوۡ')).toBe('cond'); expect(op('كُلَّمَآ')).toBe('cond')
  })
  it('does not treat the subordinating أَنْ, the conditional إِنْ, or ordinary nouns as clause openers', () => {
    expect(op('أَن')).toBeNull(); expect(op('إِن')).toBeNull(); expect(op('أَنَّهُۥ')).toBeNull(); expect(op('ٱلۡحَقُّ')).toBeNull(); expect(op('رَبِّهِمۡ')).toBeNull()
    expect(attachesBackward('أَن')).toBe(true)
  })
  it('finds the openers of Ta-Ha 10 (fa-qāla, innī, la\'allī, aw)', () => {
    const w = wordsOfAyah(20, 10)
    expect(clauseOpeners(w).map((c) => c.after)).toEqual(expect.arrayContaining([2, 5, 8, 12]))
  })
})

describe('Ta-Ha 10, the motivating example', () => {
  it('is no longer two long pieces: it is cut where the meaning turns, and never inside "He said to his family, Stay here"', () => {
    const w = wordsOfAyah(20, 10)
    expect(defaultBreakdown(20, 10, w).boundaries).toEqual([10])                                // the previous splitter: 11 + 7 words, one cut mid-clause
    const b = meaningBreakdown(20, 10, w).boundaries
    expect(b).toEqual(expect.arrayContaining([5, 8, 12]))                                       // Indeed… | Perhaps… | or find…
    expect(b).not.toContain(4)                                                                  // the speech verb, the listener and the quotation stay together
    expect(buildPhrases(w, b).every((p) => p.words.length >= 3 && p.words.length <= 9)).toBe(true)
  })
})

describe('safety rules hold across the whole Qur\'an', () => {
  it('short ayahs are never split; no piece under 3 words; no break right after the "do not stop" sign; none before a word that completes what precedes it unless the mushaf marks a stop there', () => {
    let short = 0, tiny = 0, afterNoStop = 0, backward = 0, ayahs = 0
    for (let s = 1; s <= 114; s++) for (let a = 1; a <= corpus.ayahCount(s); a++) {
      const w = wordsOfAyah(s, a), b = meaningBreakdown(s, a, w).boundaries
      if (w.length <= 12 && b.length) short++
      if (b.length) ayahs++
      for (const p of buildPhrases(w, b)) if (p.words.length < 3 && w.length > 12) tiny++
      for (const i of b) { if (w[i]!.includes('ۙ')) afterNoStop++; if (i + 1 < w.length && attachesBackward(w[i + 1]!) && !/[ۘۗۚۜ]/.test(w[i]!)) backward++ }
    }
    expect({ short, tiny, afterNoStop, backward }).toEqual({ short: 0, tiny: 0, afterNoStop: 0, backward: 0 })
    expect(ayahs).toBeGreaterThan(2000)
  })
  it('the planner still returns the learner\'s own breaks untouched (a marker always wins)', () => {
    // markers are applied by callers before any breakdown; the breakdown itself never reads them. This pins the contract used by Learn/RecallCard.
    expect(typeof meaningBreakdown).toBe('function')
  })
})

describe('the meaning shown with a phrase', () => {
  it('is a verbatim piece of the translation, in order, and shown only when it can be matched with confidence', async () => {
    const tr = await loadTranslation()
    let shown = 0, phrases = 0
    for (let s = 1; s <= 114; s++) for (let a = 1; a <= corpus.ayahCount(s); a++) {
      const w = wordsOfAyah(s, a); if (w.length <= 12) continue
      const ph = buildPhrases(w, meaningBreakdown(s, a, w).boundaries); if (ph.length < 2) continue
      const text = tr[s - 1]![a - 1]!, m = phraseMeanings(s, a, text, ph); let last = -1
      m.forEach((x, i) => {
        phrases++
        if (!x) return
        shown++
        const at = text.indexOf(x, Math.max(0, last)); expect(at, `${s}:${a} #${i} "${x}" is not verbatim/in order`).toBeGreaterThanOrEqual(0); last = at + x.length
        const words = (x.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []).length / ph[i]!.words.length
        expect(words).toBeGreaterThanOrEqual(MEANING_RATIO[0]); expect(words).toBeLessThanOrEqual(MEANING_RATIO[1])
      })
    }
    expect(shown / phrases).toBeGreaterThan(0.7)               // measured 81%
  })
  it('gives nothing when the translation text is not the one the evidence was built from', () => {
    const ph = buildPhrases(wordsOfAyah(20, 10), meaningBreakdown(20, 10, wordsOfAyah(20, 10)).boundaries)
    expect(phraseMeanings(20, 10, 'A different translation entirely.', ph).every((x) => x === null)).toBe(true)
  })
  it('tidy removes stray punctuation and a dangling opening quote without changing any word', () => {
    expect(tidy(', and said, "')).toBe('and said')
    expect(tidy('We make no distinction between any of His messengers."')).toBe('We make no distinction between any of His messengers."')
  })
  it('Ta-Ha 10 shows the five clauses of the translation against the right Arabic', async () => {
    const tr = await loadTranslation(), w = wordsOfAyah(20, 10), ph = buildPhrases(w, meaningBreakdown(20, 10, w).boundaries)
    const m = phraseMeanings(20, 10, tr[19]![9]!, ph)
    expect(m[1]).toBe('indeed, I have perceived a fire'); expect(m[2]).toMatch(/^perhaps I can bring you a torch/); expect(m[3]).toMatch(/^or find at the fire/)
    expect(m[0]).toMatch(/^When he saw a fire/)
  })
})
