#!/usr/bin/env node
// Turn a published word-timing dataset into src/data/timings/<reciter>.json, checked against the canonical text and the real audio files.
//
//   node scripts/import-timings.mjs --reciter dossary --recording everyayah:Yasser_Ad-Dussary_128kbps \
//        --format align --input yasser.json --audio-dir ./audio --source "quran-align v1.2" \
//        --licence CC-BY-4.0 --url https://github.com/cpfair/quran-align [--surahs 20] [--method "..."]
//
// Formats:
//   align  Quran Align (cpfair/quran-align, CC BY 4.0): [{surah, ayah, segments: [[w0, w1_exclusive, start_ms, end_ms], ...]}]
//   qul    Quran.com / QUL segments: {"20:5": {"segments": [[word_1based, start_ms, end_ms], ...]}} or an array of {verse_key, segments}.
//          (Written from the documented shape; NOT yet checked against a real QUL file. Run it and read the report before trusting it.)
//
// --audio-dir must hold the SAME recordings the timings describe, named <SSS><AAA>.mp3 (EveryAyah style). Each file's real length is
// measured with ffprobe and stored; the app refuses to use a timing on a file of a different length.
//
// Nothing is written for an ayah unless: its word count matches the canonical text, spans are ordered, times are inside the file,
// and at least 85% of its words are covered. Everything skipped is listed with its reason. Provenance is stored with the data.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const need = (n) => { const v = arg(n); if (!v) { console.error(`missing --${n}`); process.exit(2) } return v }

const reciter = need('reciter'), recording = need('recording'), format = need('format'), input = need('input'), audioDir = need('audio-dir')
const source = need('source'), licence = need('licence'), url = need('url')
const method = arg('method', format === 'align' ? 'forced alignment (Quran Align: PocketSphinx + MFCC refinement)' : 'published segments')
const only = arg('surahs') ? new Set(arg('surahs').split(',').map(Number)) : null
const out = arg('out', join(root, 'src/data/timings', `${reciter}.json`))

const q = JSON.parse(readFileSync(join(root, 'src/data/generated/quran.json'), 'utf8'))
const wordCount = (s, a) => q.text[s - 1][a - 1].split(' ').filter(Boolean).length
const pad = (n) => String(n).padStart(3, '0')

function rows() {
  const raw = JSON.parse(readFileSync(input, 'utf8'))
  if (format === 'align') return raw.map((r) => ({ surah: r.surah, ayah: r.ayah, segs: (Array.isArray(r.segments) ? r.segments : []).map(([w0, w1, t0, t1]) => [w0, w1, t0, t1]) }))
  if (format === 'qul') {
    const list = Array.isArray(raw) ? raw.map((r) => [r.verse_key, r]) : Object.entries(raw)
    return list.map(([key, r]) => { const [s, a] = String(key).split(':').map(Number); return { surah: s, ayah: a, segs: (r.segments ?? []).map(([w, t0, t1]) => [w - 1, w, t0, t1]) } })
  }
  console.error(`unknown --format ${format}`); process.exit(2)
}
function duration(file) {
  const o = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' })
  return Math.round(parseFloat(o) * 1000)
}
function check(segs, words, d) {
  if (!segs.length) return 'no segments'
  let prevEnd = -1, prevW1 = 0, covered = 0
  for (const [w0, w1, t0, t1] of segs) {
    if (!(t1 > t0) || t0 < 0 || !(w1 > w0)) return 'bad span'
    if (w0 < prevW1) return 'out of order'
    if (t0 < prevEnd - 20) return 'overlap'
    if (w1 > words) return 'word index beyond the canonical text'
    if (t1 > d + 60) return 'runs past the end of the audio file'
    covered += w1 - w0; prevEnd = t1; prevW1 = w1
  }
  return covered / words < 0.85 ? 'too few words timed' : null
}

const ayahs = {}, skipped = {}
const skip = (why, k) => { (skipped[why] ??= []).push(k) }
for (const r of rows()) {
  const key = `${r.surah}:${r.ayah}`
  if (only && !only.has(r.surah)) continue
  if (!q.text[r.surah - 1]?.[r.ayah - 1]) { skip('not a valid ayah', key); continue }
  const file = join(audioDir, `${pad(r.surah)}${pad(r.ayah)}.mp3`)
  if (!existsSync(file)) { skip('audio file missing', key); continue }
  const words = wordCount(r.surah, r.ayah)
  const d = duration(file)
  const why = check(r.segs, words, d)
  if (why) { skip(why, key); continue }
  ayahs[key] = { d, s: r.segs }
}

mkdirSync(dirname(out), { recursive: true })
const data = { schema: 1, reciter, provenance: { source, licence, url, recording, method, retrieved: new Date().toISOString().slice(0, 10) }, ayahs }
writeFileSync(out, JSON.stringify(data))
console.log(`wrote ${out}: ${Object.keys(ayahs).length} ayahs`)
for (const [why, keys] of Object.entries(skipped)) console.log(`  skipped ${keys.length} (${why}): ${keys.slice(0, 8).join(', ')}${keys.length > 8 ? ', …' : ''}`)
