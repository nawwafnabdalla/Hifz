// Offline evaluation of the translation-aware breakdown against the reference set (data/validation/meaning-reference.json).
// Writes data/validation/meaning-report.json when MEANING_REPORT=1. The reference set was written by the assistant (not a qualified reader) and is small:
// the scores say whether a method follows the meaning on these examples, nothing more.
import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { defaultBreakdown, meaningBreakdown, clauseOpeners, MEANING_COMFORT, MEANING_THREE_WORD_COST } from '@/lib/engine/breakdown'
import { suggestBoundaries, buildPhrases } from '@/lib/engine/phrases'
import { wordsOfAyah, corpus } from '@/lib/quran/data'

type Ref = Record<string, { major: number[]; acceptable: number[] }>
const tuned = JSON.parse(readFileSync('data/validation/meaning-reference.json', 'utf8')).ayahs as Ref
const heldOut = JSON.parse(readFileSync('data/validation/meaning-heldout.json', 'utf8')).ayahs as Ref
type Method = (s: number, a: number, w: string[]) => number[]
const methods: Record<string, Method> = {
  'printed stop signs only': (_s, _a, w) => suggestBoundaries(w).boundaries,
  'Arabic grammar + stop signs (the current splitter)': (s, a, w) => defaultBreakdown(s, a, w).boundaries,
  'same, but smaller pieces (no translation)': (s, a, w) => defaultBreakdown(s, a, w, [], { comfort: MEANING_COMFORT, comfortLong: MEANING_COMFORT }).boundaries,
  'smaller pieces + Arabic clause-opener rules (no translation)': (s, a, w) => defaultBreakdown(s, a, w, [], { comfort: MEANING_COMFORT, comfortLong: MEANING_COMFORT, rules: clauseOpeners(w) }).boundaries,
  'smaller pieces + clause openers + 3-word clauses allowed (no translation)': (s, a, w) => defaultBreakdown(s, a, w, [], { comfort: MEANING_COMFORT, comfortLong: MEANING_COMFORT, rules: clauseOpeners(w), threeWordCost: MEANING_THREE_WORD_COST }).boundaries,
  'Arabic + clause openers + translation clauses (new)': (s, a, w) => meaningBreakdown(s, a, w).boundaries,
}
function score(m: Method, ref: Ref) {
  let tp = 0, fp = 0, fn = 0, pieces = 0, longPieces = 0, words = 0
  const per: Record<string, { got: number[]; missed: number[]; extra: number[] }> = {}
  for (const [k, g] of Object.entries(ref)) {
    const [s, a] = k.split(':').map(Number) as [number, number]
    const w = wordsOfAyah(s, a), got = m(s, a, w), M = new Set(g.major), A = new Set(g.acceptable)
    const hit = got.filter((b) => M.has(b)), extra = got.filter((b) => !M.has(b) && !A.has(b)), missed = g.major.filter((b) => !got.includes(b))
    tp += hit.length; fp += extra.length; fn += missed.length
    for (const p of buildPhrases(w, got)) { pieces++; words += p.words.length; if (p.words.length > 12) longPieces++ }
    per[k] = { got, missed, extra }
  }
  const P = tp / Math.max(1, tp + fp), R = tp / Math.max(1, tp + fn)
  return { precision: +P.toFixed(2), recall: +R.toFixed(2), f1: +((2 * P * R) / Math.max(1e-9, P + R)).toFixed(2), tp, fp, fn, meanPieceWords: +(words / pieces).toFixed(1), piecesOver12Words: longPieces, per }
}
// Coverage across the whole Qur'an: how pieces are sized for the ayahs the app splits.
function coverage(m: Method) {
  const sizes: number[] = []; let ayahs = 0, split = 0, parts3 = 0
  for (let s = 1; s <= 114; s++) for (let a = 1; a <= corpus.ayahCount(s); a++) {
    const w = wordsOfAyah(s, a); if (w.length <= 12) continue; ayahs++
    const ph = buildPhrases(w, m(s, a, w)); if (ph.length > 1) split++; if (ph.length >= 3) parts3++; sizes.push(...ph.map((p) => p.words.length))
  }
  sizes.sort((x, y) => x - y)
  return { ayahsOver12Words: ayahs, split, threeOrMoreParts: parts3, medianPiece: sizes[sizes.length >> 1], p90Piece: sizes[Math.floor(sizes.length * 0.9)], piecesOver14Words: sizes.filter((x) => x > 14).length, piecesUnder3Words: sizes.filter((x) => x < 3).length }
}
// Agreement with where the reciter really pauses: for every ayah verified for a recording, the share of each method's breaks that fall on a measured pause.
function pauseAgreement(m: Method, file: string) {
  const t = JSON.parse(readFileSync(file, 'utf8')) as { ayahs: Record<string, { pa?: number[] }>; verified?: Record<string, number[]> }
  let breaks = 0, at100 = 0, at40 = 0
  for (const [s, list] of Object.entries(t.verified ?? {})) for (const a of list) {
    const w = wordsOfAyah(+s, a); if (w.length <= 12) continue
    const pa = t.ayahs[`${s}:${a}`]?.pa; if (!pa) continue
    for (const b of m(+s, a, w)) { breaks++; if ((pa[b] ?? 0) >= 100) at100++; if ((pa[b] ?? 0) >= 40) at40++ }
  }
  return { breaks, onPause100ms: +(at100 / breaks).toFixed(3), onPause40ms: +(at40 / breaks).toFixed(3) }
}
describe('translation-aware breakdown, against the reference set', () => {
  const results = Object.fromEntries(Object.entries(methods).map(([n, m]) => [n, score(m, tuned)]))
  const heldResults = Object.fromEntries(Object.entries(methods).map(([n, m]) => [n, score(m, heldOut)]))
  it('reports', () => {
    const count = (r: Ref) => ({ ayahs: Object.keys(r).length, majorBoundaries: Object.values(r).reduce((n, g) => n + g.major.length, 0) })
    const rep = { reference: count(tuned), heldOutReference: count(heldOut), byMethod: results, heldOutByMethod: heldResults,
      pauseAgreement: Object.fromEntries(['src/data/timings/dossary--qua_yasser_al_dosari_tarteel.json', 'src/data/timings/maher--qua_maher_al_muaiqly_tarteel.json'].map((f) => [f.split('/').pop()!.split('--')[0], Object.fromEntries(Object.entries(methods).map(([n, m]) => [n, pauseAgreement(m, f)]))])), coverage: Object.fromEntries(Object.entries(methods).map(([n, m]) => [n, coverage(m)])) }
    if (process.env.MEANING_REPORT) writeFileSync('data/validation/meaning-report.json', JSON.stringify(rep, null, 1))
    console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([n, r]) => [n, { P: r.precision, R: r.recall, F1: r.f1, meanPiece: r.meanPieceWords, over12: r.piecesOver12Words }])), null, 1))
    expect(Object.keys(results).length).toBe(6)
    // Regression floors (measured 0.88 tuned / 0.79 held-out; the current splitter measured 0.69 / 0.55). Small sets: these guard against breaking the method, they do not prove it.
    const NEW = 'Arabic + clause openers + translation clauses (new)', OLD = 'Arabic grammar + stop signs (the current splitter)'
    expect(results[NEW]!.f1).toBeGreaterThanOrEqual(0.8); expect(heldResults[NEW]!.f1).toBeGreaterThanOrEqual(0.7)
    expect(results[NEW]!.f1).toBeGreaterThan(results[OLD]!.f1 + 0.1); expect(heldResults[NEW]!.f1).toBeGreaterThan(heldResults[OLD]!.f1 + 0.1)
    expect(results[NEW]!.precision).toBeGreaterThanOrEqual(0.85); expect(heldResults[NEW]!.precision).toBeGreaterThanOrEqual(0.8)
    // The translation adds to the Arabic-only rules (recall), on both sets.
    const ARABIC = 'smaller pieces + clause openers + 3-word clauses allowed (no translation)'
    expect(results[NEW]!.recall).toBeGreaterThan(results[ARABIC]!.recall); expect(heldResults[NEW]!.recall).toBeGreaterThan(heldResults[ARABIC]!.recall)
  })
})
