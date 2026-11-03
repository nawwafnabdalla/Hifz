// Generates the agreement statistics and the sheet of uncertain boundaries for a qualified reader (MEANING_REVIEW=1).
//   data/validation/meaning-agreement.json   how the translation and the Arabic evidence agree across the Qur'an
//   data/review/meaning-boundaries-for-review.csv   boundaries where they disagree or where the only support is weak
import { describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { candidatesFor, clauseOpeners, meaningBreakdown, meaningFor, openerKind } from '@/lib/engine/breakdown'
import { suggestBoundaries, buildPhrases } from '@/lib/engine/phrases'
import { corpus, wordsOfAyah } from '@/lib/quran/data'

describe.skipIf(!process.env.MEANING_REVIEW)('meaning agreement and review sheet', () => {
  it('writes them', () => {
    let strongEnglish = 0, strongWithArabic = 0, strongArabicOnlyLow = 0, chosen = 0, chosenWithEnglish = 0, chosenArabicOnly = 0, chosenEnglishOnlyRescued = 0
    const rows: { key: string; gap: number; kind: string; before: string; after: string; E: number; p: number; basis: string; priority: number }[] = []
    for (let s = 1; s <= 114; s++) for (let a = 1; a <= corpus.ayahCount(s); a++) {
      const w = wordsOfAyah(s, a); if (w.length <= 12) continue
      const m = meaningFor(s, a, w.length) ?? {}, cand = Object.fromEntries(candidatesFor(s, a, w.length).map((c) => [c.after, c.p]))
      const rule = Object.fromEntries(clauseOpeners(w).map((c) => [c.after, c.p])), stop = new Set(suggestBoundaries(w).boundaries)
      const bd = meaningBreakdown(s, a, w), ch = new Set(bd.boundaries)
      const arabic = (g: number) => (stop.has(g) ? 0.85 : Math.max(cand[g] ?? 0, rule[g] ?? 0))
      for (const [gs, E] of Object.entries(m)) {
        const g = +gs
        if (E >= 2) { strongEnglish++; if (arabic(g) >= 0.15) strongWithArabic++; else if (!ch.has(g)) strongArabicOnlyLow++ }
        if (E >= 2.5 && !ch.has(g) && arabic(g) < 0.15) rows.push({ key: `${s}:${a}`, gap: g, kind: 'translation suggests a break; the Arabic gives no support, so none was made', before: w[g]!, after: w[g + 1]!, E, p: arabic(g), basis: '-', priority: E })
      }
      for (const g of bd.boundaries) {
        chosen++
        const E = m[g] ?? 0, basis = bd.basis[g] ?? ''
        if (E >= 1.5) chosenWithEnglish++; else chosenArabicOnly++
        if (E >= 1.5 && arabic(g) < 0.15) chosenEnglishOnlyRescued++
        const weakArabic = arabic(g) < 0.12 && E < 1.5
        if (weakArabic || (E === 0 && !stop.has(g) && (cand[g] ?? 0) < 0.15 && !(rule[g] ?? 0))) rows.push({ key: `${s}:${a}`, gap: g, kind: 'break made on weak evidence only', before: w[g]!, after: w[g + 1]!, E, p: arabic(g), basis, priority: 1 - arabic(g) })
        if (openerKind(w[g + 1]!) === null && E >= 1.5 && !stop.has(g) && (cand[g] ?? 0) < 0.15) rows.push({ key: `${s}:${a}`, gap: g, kind: 'break supported by the translation more than by the Arabic', before: w[g]!, after: w[g + 1]!, E, p: arabic(g), basis, priority: 0.5 + E / 10 })
      }
      void buildPhrases
    }
    const agree = { strongEnglishBoundaries: strongEnglish, ofWhichArabicAlsoSupports: strongWithArabic, ofWhichNoArabicSupportAndNoBreakMade: strongArabicOnlyLow, breaksChosen: chosen, chosenWithTranslationSupport: chosenWithEnglish, chosenOnArabicAlone: chosenArabicOnly, chosenWithWeakArabicRescuedByTranslation: chosenEnglishOnlyRescued }
    writeFileSync('data/validation/meaning-agreement.json', JSON.stringify(agree, null, 1))
    rows.sort((x, y) => y.priority - x.priority)
    const esc = (t: string) => `"${t.replace(/"/g, '""')}"`
    writeFileSync('data/review/meaning-boundaries-for-review.csv', ['ayah,break_after_word,why_listed,arabic_before,arabic_after,translation_strength,arabic_support,basis', ...rows.slice(0, 600).map((r) => [r.key, r.gap, esc(r.kind), esc(r.before), esc(r.after), r.E, r.p.toFixed(2), esc(r.basis)].join(','))].join('\n') + '\n')
    console.log(JSON.stringify(agree), 'rows', rows.length)
    expect(rows.length).toBeGreaterThan(0)
  })
})
