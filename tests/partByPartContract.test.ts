// The contract of part-by-part learning: the capability the owner relies on every day. If a future change removes it, narrows it or breaks its
// Arabic or its meanings, one of these fails. (Added after a release shipped without the meaning-aware splitter and the capability was lost.)
import { describe, expect, it } from 'vitest'
import { meaningBreakdown } from '@/lib/engine/breakdown'
import { phraseMeanings } from '@/lib/engine/meaning'
import { partsAvailability } from '@/lib/engine/parts'
import { buildPhrases } from '@/lib/engine/phrases'
import { corpus, loadTranslation, textOf, wordsOfAyah } from '@/lib/quran/data'

const spansOf = (s: number, a: number) => { const w = wordsOfAyah(s, a); return buildPhrases(w, meaningBreakdown(s, a, w).boundaries) }

describe('part-by-part learning is available', () => {
  it('Ta-Ha 20:10 (18 words, no printed stop sign) is offered part by part, in the five units the owner specified, each with its meaning', async () => {
    const tr = await loadTranslation(), ph = spansOf(20, 10)
    expect(partsAvailability(ph)).toBe('offered')
    expect(ph.map((p) => [p.from, p.to])).toEqual([[0, 2], [3, 5], [6, 8], [9, 12], [13, 17]])
    expect(phraseMeanings(20, 10, tr[19]![9]!, ph)).toEqual(['When he saw a fire', 'and said to his family, "Stay here', 'indeed, I have perceived a fire', 'perhaps I can bring you a torch', 'or find at the fire some guidance'])
  })
  it('Ayat al-Kursi is learned part by part by default, in at least seven parts', () => {
    const ph = spansOf(2, 255)
    expect(partsAvailability(ph)).toBe('default'); expect(ph.length).toBeGreaterThanOrEqual(7)
  })
  it('short ayahs stay whole and are learned normally', () => {
    for (const [s, a] of [[112, 1], [112, 2], [1, 2], [36, 78]] as const) { expect(spansOf(s, a)).toHaveLength(1); expect(partsAvailability(spansOf(s, a))).toBe('none') }
  })
  it('across the Qur\'an the capability is broad: it is not confined to the few ayahs with several printed stop signs, and 16–20-word ayahs are not left unsplit', () => {
    let over12 = 0, available = 0, mid = 0, midSplit = 0, anyPart = 0
    for (let s = 1; s <= 114; s++) for (let a = 1; a <= corpus.ayahCount(s); a++) {
      const w = wordsOfAyah(s, a); if (w.length <= 12) continue
      over12++; const ph = spansOf(s, a)
      if (partsAvailability(ph.map((p) => ({ from: p.from, to: p.to }))) !== 'none') available++
      if (ph.length > 1) anyPart++
      if (w.length >= 16 && w.length <= 20) { mid++; if (ph.length >= 2) midSplit++ }
    }
    expect(over12).toBeGreaterThan(2400)
    expect(available).toBeGreaterThanOrEqual(1800)            // measured 1,905+; the stop-sign-only layout offered only about 490
    expect(anyPart / over12).toBeGreaterThan(0.95)
    expect(midSplit / mid).toBeGreaterThan(0.9)
  })
})

describe('the parts are scaffolding built from the canonical text, never new text', () => {
  it('for every ayah the parts, joined, are exactly the ayah (same words, same order, nothing added, dropped or altered), with sane offsets', () => {
    for (let s = 1; s <= 114; s++) for (let a = 1; a <= corpus.ayahCount(s); a++) {
      const w = wordsOfAyah(s, a), b = meaningBreakdown(s, a, w).boundaries, ph = buildPhrases(w, b)
      expect(ph.map((p) => p.text).join(' ')).toBe(w.join(' '))
      expect(w.join(' ')).toBe(textOf(s, a))
      expect(b).toEqual([...b].sort((x, y) => x - y))
      for (const i of b) { expect(i).toBeGreaterThanOrEqual(0); expect(i).toBeLessThan(w.length - 1) }
      ph.forEach((p, i) => { expect(p.from).toBe(i === 0 ? 0 : ph[i - 1]!.to + 1); expect(p.words.length).toBeGreaterThan(0) })
    }
  })
  it('each break states where it comes from (printed sign, reviewed list, or automatic); a reviewed break is on the reviewed list', () => {
    let reviewed = 0
    for (const [s, a] of [[20, 10], [2, 255], [2, 26], [20, 71]] as const) {
      const w = wordsOfAyah(s, a), bd = meaningBreakdown(s, a, w)
      for (const i of bd.boundaries) { expect(typeof bd.basis[i]).toBe('string'); if (bd.basis[i] === 'reviewed') reviewed++ }
    }
    expect(reviewed).toBe(4)                                                                      // Ta-Ha 20:10 only, so far
  })
})
