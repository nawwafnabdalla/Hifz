#!/usr/bin/env node
// Turn a whole-recording harness report (tests/realAudio.gen.test.ts) into a compact, versioned verification record.
//   node scripts/summarize-verification.mjs --report <report.json> --slug maher_al_muaiqly_tarteel --out data/validation/<slug>.json [--asr <asr.json>]
// Per surah: ayahs imported, phrases cut / refused / not isolatable, and the ayahs whose cuts carry an acoustic warning (energy outside the timed words
// that looks like a neighbouring word). Per ayah, a status the app can use: 'ok' (every phrase cut cleanly), 'partial' (some refused),
// 'whole-only-elsewhere' (the whole ayah cannot be isolated: abandoned take), 'review' (acoustic warning).
// An acoustic warning is: padding > 250 ms on a side AND speech-level energy (>= 0.6 of the clip's loud level) in that padding.
// This is NOT proof of correct recitation or of correct words: it flags likely leaks. Transcription (--asr) is a sampled cross-check only.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const rep = JSON.parse(readFileSync(arg('report'), 'utf8')), slug = arg('slug'), out = arg('out')
const WARN_RATIO = 0.6, WARN_MS = 250
const ayahs = {}, surahs = {}
for (const r of rep.rows) {
  if (r.r === 'file-size-mismatch') { (surahs[r.s] ??= {}).identityMismatch = true; continue }
  const k = `${r.s}:${r.a}`, a = (ayahs[k] ??= { cut: 0, refused: 0, noRange: 0, warn: 0 })
  if (r.r === 'cut') { a.cut++; if ((r.tail > WARN_MS && r.tr >= WARN_RATIO) || (r.lead > WARN_MS && r.lr >= WARN_RATIO)) a.warn++ }
  else if (r.r === 'no-pause') a.refused++
  else a.noRange++
}
const status = (a) => (a.warn ? 'review' : a.noRange ? 'whole-isolation-refused' : a.refused ? 'partial' : 'ok')
const tallyBy = {}
for (const [k, a] of Object.entries(ayahs)) { const s = +k.split(':')[0]; const t = (surahs[s] ??= {}); const st = status(a); t[st] = (t[st] ?? 0) + 1; tallyBy[st] = (tallyBy[st] ?? 0) + 1; a.status = st }
const okAyahs = {}
for (const [k, a] of Object.entries(ayahs)) if (a.status === 'ok') { const [s, n] = k.split(':').map(Number); (okAyahs[s] ??= []).push(n) }
const flagged = Object.entries(ayahs).filter(([, a]) => a.status === 'review').map(([k]) => k)
const asr = arg('asr') ? JSON.parse(readFileSync(arg('asr'), 'utf8')) : null
const asrSummary = asr && { clips: asr.length, exactBest: asr.filter((x) => x.best === 'exact').length, clearDefects: asr.filter((x) => Math.max(...Object.values(x.scores)) - x.scores.exact >= 0.08).length, meanSimilarity: +(asr.reduce((s, x) => s + x.scores.exact, 0) / asr.length).toFixed(3) }
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify({ schema: 1, slug, generated: new Date().toISOString().slice(0, 10), method: 'engine over the real recording, acoustic checks; transcription on a sample', tally: rep.tally, ayahStatus: tallyBy, warnThresholds: { ratio: WARN_RATIO, ms: WARN_MS }, reviewAyahs: flagged, okAyahs, surahs, ...(asrSummary ? { transcriptionSample: asrSummary } : {}) }, null, 1))
console.log(slug, JSON.stringify(tallyBy), `review ayahs: ${flagged.length}`, asrSummary ? JSON.stringify(asrSummary) : '')
