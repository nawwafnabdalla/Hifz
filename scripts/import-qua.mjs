#!/usr/bin/env node
// Import word timings that are aligned to WHOLE-SURAH recordings (Quranic Universal Audio, QUL, or anything shaped like them)
// into src/data/timings/<reciter>--<recording>.json, checked against the canonical text and the real audio files.
//
//   1. Look first:     node scripts/import-qua.mjs --inspect --timings word_timestamps.json.gz
//   2. Import:         node scripts/import-qua.mjs --reciter maher --recording qua:<recitation-id> \
//                        --timings word_timestamps.json.gz --audio-dir ./maher-surahs --url-template 'https://…/{SSS}.mp3' \
//                        --source "Quranic Universal Audio v4.0.0" --licence "CC BY 4.0 (timings); recordings: see audio rights" \
//                        --url https://github.com/QUD-Technologies/quranic-universal-audio --riwayah hafs [--times absolute|relative]
//
// STATUS: the real QUA files were not reachable from the environment this was written in, so the input shape is NOT verified against
// a real release. The reader below accepts the shapes such datasets use (see `ayahsOf`) and --inspect prints exactly what it found,
// so the first run on a real file should be --inspect, then a small --surahs 20 import, then reading the report. Nothing is written for
// an ayah unless every check below passes; everything skipped is listed with its reason. Never edit the output by hand.
//
// What each check protects:
//  - word count must equal the canonical text (a different text edition/riwayah is refused, not "approximately" used),
//  - spans ordered, inside the file, ≥85% of the words timed,
//  - the audio file must be constant-bitrate MP3 (phrase windows are cut by byte position), and its size, bitrate, data offset and length
//    are stored so the app can refuse a different edition of the "same" recording,
//  - --riwayah other than hafs is refused (the app's text is Hafs 'an 'Asim and qira'at are never mixed).
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectMp3 } from './lib/mp3.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const has = (n) => process.argv.includes(`--${n}`)
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const need = (n) => { const v = arg(n); if (!v) { console.error(`missing --${n}`); process.exit(2) } return v }
const pad3 = (n) => String(n).padStart(3, '0')

function load(path) {
  let b = readFileSync(path)
  if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b)
  return JSON.parse(b.toString('utf8'))
}

/** First finite number among the named keys of an object. */
const pick = (o, keys) => { for (const k of keys) if (typeof o?.[k] === 'number' && Number.isFinite(o[k])) return o[k]; return undefined }

/** One word entry -> {word: 0-based index (or undefined: take list order), t0, t1} in milliseconds. Tuple [w, t0, t1] or object. */
function wordOf(e, i, unit) {
  const k = unit === 's' ? 1000 : 1
  if (Array.isArray(e)) { const [a, b, c] = e; return e.length >= 3 ? { word: a - 1, t0: b * k, t1: c * k } : { word: i, t0: a * k, t1: b * k } }
  const t0 = pick(e, ['start_ms', 'start', 'from', 't0', 'begin']), t1 = pick(e, ['end_ms', 'end', 'to', 't1'])
  if (t0 === undefined || t1 === undefined) return null
  const one = pick(e, ['word', 'position', 'word_number', 'wordNumber']), zero = pick(e, ['index', 'word_index'])
  return { word: one !== undefined ? one - 1 : zero !== undefined ? zero : i, t0: t0 * k, t1: t1 * k }
}

/**
 * Normalise the input to [{surah, ayah, words:[{word,t0,t1}]}]. Accepted:
 *   { "20:5": [ …words ] } | { "20": { "5": [ …words ] } } | [ {verse_key|surah+ayah, words|segments|timestamps: [ …words ]} ]
 * where a word is [w1, start, end] | {word|position, start|start_ms, end|end_ms}. Unit: --unit ms (default) | s.
 */
function ayahsOf(raw, unit) {
  const out = []
  const take = (surah, ayah, list) => { if (Array.isArray(list)) out.push({ surah, ayah, words: list.map((e, i) => wordOf(e, i, unit)).filter(Boolean) }) }
  const listOf = (r) => r?.words ?? r?.segments ?? r?.timestamps ?? r?.word_timestamps ?? (Array.isArray(r) ? r : undefined)
  if (Array.isArray(raw)) {
    for (const r of raw) {
      const key = r.verse_key ?? r.key ?? (r.surah !== undefined && r.ayah !== undefined ? `${r.surah}:${r.ayah}` : null)
      if (key) { const [s, a] = String(key).split(':').map(Number); take(s, a, listOf(r)) }
    }
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (/^\d+:\d+$/.test(k)) { const [s, a] = k.split(':').map(Number); take(s, a, listOf(v)) }
      else if (/^\d+$/.test(k) && v && typeof v === 'object' && !Array.isArray(v)) for (const [a, r] of Object.entries(v)) if (/^\d+$/.test(a)) take(+k, +a, listOf(r))
    }
  }
  return out
}

function describe(raw) {
  const kind = Array.isArray(raw) ? `array of ${raw.length}` : `object with ${Object.keys(raw).length} keys`
  const sample = Array.isArray(raw) ? raw[0] : raw[Object.keys(raw)[0]]
  console.log(`top level: ${kind}`)
  console.log(`first entry: ${JSON.stringify(sample)?.slice(0, 400)}`)
}

const timingsPath = need('timings')
const unit = arg('unit', 'ms')
const raw = load(timingsPath)
if (has('inspect')) {
  describe(raw)
  const found = ayahsOf(raw, unit)
  const surahs = new Set(found.map((a) => a.surah))
  console.log(`understood: ${found.length} ayahs in ${surahs.size} surahs; first: ${JSON.stringify(found[0])?.slice(0, 300)}`)
  if (!found.length) console.log('NOTHING understood. The shape differs from the ones this reader knows; adjust ayahsOf() once, with the real file open.')
  process.exit(found.length ? 0 : 1)
}

const reciter = need('reciter'), recording = need('recording'), audioDir = need('audio-dir'), urlTemplate = need('url-template')
const source = need('source'), licence = need('licence'), url = need('url')
const riwayah = arg('riwayah', 'unknown')
if (riwayah !== 'hafs') { console.error(`refused: riwayah is "${riwayah}". Only Hafs 'an 'Asim matches the app's text; pass --riwayah hafs once the recitation's riwayah is confirmed from its catalogue entry.`); process.exit(3) }
if (!urlTemplate.includes('{SSS}')) { console.error('--url-template must contain {SSS} (the three-digit surah number)'); process.exit(2) }
const times = arg('times', 'absolute')                       // absolute: times are positions in the surah file; relative: from each ayah's own start (then there is no origin to recover)
if (times !== 'absolute') { console.error('only --times absolute is supported: ayah windows are recovered from positions in the surah file'); process.exit(2) }
const only = arg('surahs') ? new Set(arg('surahs').split(',').map(Number)) : null
const out = arg('out', join(root, 'src/data/timings', `${reciter}--${recording.replace(/[^a-z0-9._-]+/gi, '_')}.json`))

const q = JSON.parse(readFileSync(join(root, 'src/data/generated/quran.json'), 'utf8'))
const wordCount = (s, a) => q.text[s - 1][a - 1].split(' ').filter(Boolean).length

function seconds(file) {
  return Math.round(parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' })) * 1000)
}
function wordsToSegments(words, count) {
  if (!words.length) return { why: 'no words' }
  const segs = []
  let prevEnd = -1, prevW = -1
  for (const w of words) {
    if (!Number.isInteger(w.word) || w.word < 0 || w.word >= count) return { why: 'word index beyond the canonical text' }
    if (w.word <= prevW) return { why: 'out of order' }
    if (!(w.t1 > w.t0) || w.t0 < 0) return { why: 'bad span' }
    if (w.t0 < prevEnd - 20) return { why: 'overlap' }
    segs.push([w.word, w.word + 1, Math.round(w.t0), Math.round(w.t1)]); prevEnd = w.t1; prevW = w.word
  }
  return words.length / count < 0.85 ? { why: 'too few words timed' } : { segs }
}

const bySurah = new Map()
for (const a of ayahsOf(raw, unit)) { if (!only || only.has(a.surah)) (bySurah.get(a.surah) ?? bySurah.set(a.surah, []).get(a.surah)).push(a) }

const ayahs = {}, files = {}, skipped = {}
const skip = (why, k) => { (skipped[why] ??= []).push(k) }
for (const [surah, list] of [...bySurah].sort((x, y) => x[0] - y[0])) {
  const path = join(audioDir, `${pad3(surah)}.mp3`)
  if (!existsSync(path)) { list.forEach((a) => skip('surah audio file missing', `${surah}:${a.ayah}`)); continue }
  const buf = readFileSync(path)
  let m
  try { m = inspectMp3(buf) } catch { list.forEach((a) => skip('not an MP3', `${surah}:${a.ayah}`)); continue }
  if (!m.constantBitrate) { list.forEach((a) => skip('variable-bitrate MP3 (cannot be cut by byte position)', `${surah}:${a.ayah}`)); continue }
  const total = seconds(path)
  files[String(surah)] = { bytes: statSync(path).size, kbps: m.kbps, dataOffset: m.dataOffset, durationMs: total }

  const parsed = list.sort((x, y) => x.ayah - y.ayah).map((a) => {
    if (!q.text[surah - 1]?.[a.ayah - 1]) return { a, why: 'not a valid ayah' }
    const r = wordsToSegments(a.words, wordCount(surah, a.ayah))
    return r.why ? { a, why: r.why } : { a, segs: r.segs }
  })
  for (const p of parsed) if (p.why) skip(p.why, `${surah}:${p.a.ayah}`)
  const good = parsed.filter((p) => p.segs)
  // An ayah's window: from the middle of the silence before its first word to the middle of the silence after its last (ends of the file otherwise).
  for (let i = 0; i < good.length; i++) {
    const { a, segs } = good[i]
    const first = segs[0][2], last = segs.at(-1)[3]
    const prev = good[i - 1], next = good[i + 1]
    const consecutive = (p) => p && Math.abs(p.a.ayah - a.ayah) === 1
    const origin = consecutive(prev) ? Math.round((prev.segs.at(-1)[3] + first) / 2) : Math.max(0, first - 200)
    const end = consecutive(next) ? Math.round((last + next.segs[0][2]) / 2) : Math.min(total, last + 200)
    if (last > total + 60) { skip('runs past the end of the audio file', `${surah}:${a.ayah}`); continue }
    if (end <= origin) { skip('empty window', `${surah}:${a.ayah}`); continue }
    ayahs[`${surah}:${a.ayah}`] = { d: end - origin, o: origin, s: segs.map(([w0, w1, t0, t1]) => [w0, w1, t0 - origin, t1 - origin]) }
  }
}

mkdirSync(dirname(out), { recursive: true })
const data = {
  schema: 1, reciter,
  provenance: { source, licence, url, recording, method: 'published word timestamps for a whole-surah recording', retrieved: new Date().toISOString().slice(0, 10), granularity: 'surah', riwayah, audio: { urlTemplate, files } },
  ayahs,
}
writeFileSync(out, JSON.stringify(data))
console.log(`wrote ${out}: ${Object.keys(ayahs).length} ayahs in ${Object.keys(files).length} surahs`)
for (const [why, keys] of Object.entries(skipped)) console.log(`  skipped ${keys.length} (${why}): ${keys.slice(0, 8).join(', ')}${keys.length > 8 ? ', …' : ''}`)
