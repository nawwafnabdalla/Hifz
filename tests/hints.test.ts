import { describe, expect, it } from 'vitest'
import { hintWordFor, isWordShown, visibleAt } from '@/lib/engine/hints'
import { buildPhrases, suggestBoundaries } from '@/lib/engine/phrases'
import { wordsOfAyah } from '@/lib/quran/data'

const letters = (w: string) => w.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '').replace(/[أإآٱ]/g, 'ا')     // the letters of a word, without vowel and stop signs

// The bug: the first-word hint revealed "word 0 of the ayah" for every part, so a part that does not start the ayah showed nothing at all.
const shownIn = (from: number, to: number, o: Parameters<typeof isWordShown>[1]) => Array.from({ length: to - from + 1 }, (_, k) => from + k).filter((i) => isWordShown(i, o))

describe('first-word hint', () => {
  it('reveals the first word of the part being recalled, whichever part it is', () => {
    expect(shownIn(0, 5, { cue: 3, base: 0 })).toEqual([0])                  // Part A
    expect(shownIn(6, 8, { cue: 3, base: 6 })).toEqual([6])                  // Part B starts at word 6: its own first word, not word 0 (which was never shown, so B showed nothing)
    expect(shownIn(9, 12, { cue: 3, base: 9 })).toEqual([9])
  })
  it('a pointed hint reveals exactly one word of a longer recitation (the opening of the part being added)', () => {
    expect(shownIn(0, 8, { revealWords: [6] })).toEqual([6])
    expect(hintWordFor(0, 8, 6)).toBe(6)
    expect(hintWordFor(0, 5)).toBe(0)                                         // a range that starts the ayah: the ayah's first word
    expect(hintWordFor(6, 8)).toBe(6)                                         // an isolated part: its own first word
    expect(hintWordFor(0, 8, 99)).toBe(8)                                     // never outside the range, whatever a stale caller passes
    expect(hintWordFor(3, 8, 1)).toBe(3)
  })
  it('the cue patterns are counted from the start of the range, and the old behaviour for a whole ayah is unchanged', () => {
    expect([0, 1, 2, 3, 4, 5, 6].filter((i) => isWordShown(i, { cue: 2, base: 0 }))).toEqual([0, 3, 6])
    expect([6, 7, 8, 9, 10, 11].filter((i) => isWordShown(i, { cue: 2, base: 6 }))).toEqual([6, 9])
    expect(visibleAt(4, 0)).toBe(false); expect(visibleAt(0, 5)).toBe(true)
    expect(isWordShown(2, { revealCount: 3 })).toBe(true); expect(isWordShown(3, { revealCount: 3 })).toBe(false)
  })
  it('Ta-Ha 20:10 with the learner\'s own breaks (after words 2, 5, 8 and 12): every part has its own first word, none blank, and they are not all word 0', () => {
    const w = wordsOfAyah(20, 10)
    expect(suggestBoundaries(w).boundaries).toEqual([])                          // no printed stop sign: the app alone would keep it whole
    const own = buildPhrases(w, [2, 5, 8, 12])
    const hints = own.map((p) => hintWordFor(p.from, p.to))
    expect(hints).toEqual([0, 3, 6, 9, 13])
    hints.forEach((h, i) => { expect(shownIn(own[i]!.from, own[i]!.to, { cue: 3, base: own[i]!.from })).toEqual([h]); expect(w[h]).toBe(own[i]!.words[0]) })
    expect(letters(w[own[1]!.from]!)).toBe('فقال'); expect(letters(w[own[2]!.from]!)).toBe('اني'); expect(letters(w[own[3]!.from]!)).toBe('لعلي')
    expect(hints[1]).toBeGreaterThan(0)                                          // a part whose first word is not the first word of the ayah
  })
  it('a hint recomputed after the boundaries change points at the new first word, never a stale or blank one', () => {
    const w = wordsOfAyah(20, 10)
    const before = buildPhrases(w, [5, 8, 12]), after = buildPhrases(w, [2, 5, 8, 12])
    expect(hintWordFor(before[1]!.from, before[1]!.to)).toBe(6)
    expect(hintWordFor(after[1]!.from, after[1]!.to)).toBe(3)
    for (const ph of [before, after]) for (const p of ph) expect(shownIn(p.from, p.to, { revealWords: [hintWordFor(p.from, p.to)] }).length).toBe(1)
  })
})
