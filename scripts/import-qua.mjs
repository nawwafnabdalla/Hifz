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
// Directly from a Quranic Universal Audio release (the real shape: <slug>.zip + manifest.json + catalog.json in one folder):
//
//   node scripts/import-qua.mjs --release-dir ./v4.0.0 --slug yasser_al_dosari_tarteel --reciter dossary [--surahs 20] [--probe | --audio-dir ./surahs]
//
//   --probe reads the first 64 KB of each surah file from the audio host (HTTP Range) to learn its exact byte size, bitrate and where the audio
//   starts; --audio-dir does the same from local copies (named SSS.mp3). Either way the facts are stored so the app can refuse a different edition.
//   The release folder's zip is checked against manifest.json's sha256 first; riwayah must be hafs_an_asim; YouTube/Drive sources are refused.
//
// STATUS: the generic reader below was written before the real files were seen; the --release-dir reader matches the real v4.0.0 files.
// The older note follows. The real QUA files were not reachable from the environment this was written in, so the input shape is NOT verified against
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
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, statSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectMp3 } from './lib/mp3.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const has = (n) => process.argv.includes(`--${n}`)
const haveFfprobe = () => { try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); return true } catch { return false } }
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

const releaseDir = arg('release-dir')
const unit = arg('unit', 'ms')
const raw = releaseDir ? null : load(need('timings'))
if (has('inspect') && !releaseDir) {
  describe(raw)
  const found = ayahsOf(raw, unit)
  const surahs = new Set(found.map((a) => a.surah))
  console.log(`understood: ${found.length} ayahs in ${surahs.size} surahs; first: ${JSON.stringify(found[0])?.slice(0, 300)}`)
  if (!found.length) console.log('NOTHING understood. The shape differs from the ones this reader knows; adjust ayahsOf() once, with the real file open.')
  process.exit(found.length ? 0 : 1)
}

const reciter = need('reciter')
let recording = arg('recording'), audioDir = arg('audio-dir'), urlTemplate = arg('url-template')
let source = arg('source'), licence = arg('licence'), url = arg('url')
let riwayah = arg('riwayah', 'unknown')
let release = null                                           // set in --release-dir mode
if (releaseDir) {
  const slug = need('slug')
  const manifest = JSON.parse(readFileSync(join(releaseDir, 'manifest.json'), 'utf8'))
  const cat = JSON.parse(readFileSync(join(releaseDir, 'catalog.json'), 'utf8')).recitations.find((r) => r.slug === slug)
  const mrec = manifest.recitations?.[slug]
  if (!cat || !mrec) { console.error(`refused: ${slug} is not in this release`); process.exit(3) }
  const zip = join(releaseDir, mrec.zip)
  const sha = createHash('sha256').update(readFileSync(zip)).digest('hex')
  if (sha !== mrec.sha256) { console.error(`refused: ${mrec.zip} does not match the release manifest's sha256 (${sha} vs ${mrec.sha256}). Re-download it.`); process.exit(3) }
  if (cat.riwayah !== 'hafs_an_asim') { console.error(`refused: ${slug} is ${cat.riwayah}; the app's text is Hafs 'an 'Asim and qira'at are never mixed`); process.exit(3) }
  const urls = cat.audio?.chapter_urls ?? {}
  if (Object.values(urls).some((u) => /youtube\.com|youtu\.be|drive\.google/.test(u))) { console.error(`refused: ${slug} is aligned to a YouTube/Drive source, which an app cannot stream and play.`); process.exit(3) }
  release = { slug, manifest, cat, mrec, urls, offsets: cat.audio?.chapter_offsets_ms ?? {} }
  recording = `qua:${slug}`
  source = `Quranic Universal Audio ${manifest.release_version} (${slug}, ${mrec.ts_version})`
  licence = `${manifest.license} for the timings. The recording belongs to its reciter and host (${[...new Set(Object.values(urls).map((u) => new URL(u).host))].join(', ')}); it is streamed from there, never copied.`
  url = `https://github.com/QUD-Technologies/quranic-universal-audio/releases/tag/${manifest.release_version}`
  riwayah = 'hafs'
} else { recording = need('recording'); audioDir = need('audio-dir'); urlTemplate = need('url-template'); source = need('source'); licence = need('licence'); url = need('url') }
if (riwayah !== 'hafs') { console.error(`refused: riwayah is "${riwayah}". Only Hafs 'an 'Asim matches the app's text; pass --riwayah hafs once the recitation's riwayah is confirmed from its catalogue entry.`); process.exit(3) }
if (!release && !urlTemplate.includes('{SSS}')) { console.error('--url-template must contain {SSS} (the three-digit surah number)'); process.exit(2) }
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

/** The reciter's last continuous take: when words repeat (a passage recited twice) the earlier, abandoned attempt is dropped from the chain. */
function lastTake(words) {
  const out = []; let seams = []
  for (const w of words) { const before = out.length; while (out.length && out.at(-1).word >= w.word) out.pop(); if (out.length < before) { while (seams.length && seams.at(-1) > out.length) seams.pop(); seams.push(out.length) } out.push(w) }
  return { words: out, seams }
}
/** Release mode: the canonical rows of word_timestamps.json.gz, in the generic {surah, ayah, words} shape (times shifted by the chapter's offset in its source file). */
function releaseAyahs() {
  const zip = join(releaseDir, release.mrec.zip)
  const rows = JSON.parse(gunzipSync(execFileSync('unzip', ['-p', zip, 'word_timestamps.json.gz'], { maxBuffer: 1 << 28 }))).rows
  return rows.filter((r) => r[3] === true).map((r) => {
    const [surah, ayah] = r[0].split(':').map(Number), off = release.offsets[String(surah)] ?? 0
    return { surah, ayah, ...lastTake(r[5].map(([w, s, e]) => ({ word: w - 1, t0: s + off, t1: e + off }))) }
  })
}
/** Facts about one surah file, from a local copy (--audio-dir) or from the first 64 KB at the host (--probe, HTTP Range). { why } when it cannot be used. */
async function fileFacts(surah) {
  let head, bytes, durationMs
  if (audioDir) {
    const path = join(audioDir, `${pad3(surah)}.mp3`)
    if (!existsSync(path)) return { why: 'surah audio file missing' }
    head = readFileSync(path); bytes = statSync(path).size
  } else {
    const u = release?.urls[String(surah)]
    if (!u) return { why: 'the release lists no audio for this surah' }
    // curl, not fetch: it honours the environment's HTTPS proxy settings, which Node's fetch does not.
    const tmp = mkdtempSync(join(tmpdir(), 'probe-')), hdr = join(tmp, 'h'), body = join(tmp, 'b')
    const r = spawnSync('curl', ['-sSL', '-m', '90', '-r', '0-65535', '-D', hdr, '-o', body, '-w', '%{http_code}', u], { encoding: 'utf8' })
    const code = Number(r.stdout.trim())
    if (r.status !== 0 || !code) return { why: `audio host unreachable (${new URL(u).host}: ${(r.stderr || 'no response').trim().split('\n').pop().slice(0, 90)})` }
    if (code !== 206) return { why: `audio host answered ${code} to a Range request (needs 206)` }
    const heads = readFileSync(hdr, 'latin1').split(/\r?\n\r?\n/).filter(Boolean).at(-1)
    bytes = Number(/content-range:\s*bytes\s+\d+-\d+\/(\d+)/i.exec(heads)?.[1])
    if (!(bytes > 0)) return { why: 'audio host sent no usable Content-Range' }
    head = readFileSync(body)
  }
  let m
  try { m = inspectMp3(head) } catch { return { why: 'not an MP3' } }
  if (!m.constantBitrate) return { why: 'variable-bitrate MP3 (cannot be cut by byte position)' }
  const nominal = release?.cat.audio?.bitrate_kbps_nominal
  if (nominal && nominal !== m.kbps) return { why: `bitrate ${m.kbps} kbps differs from the catalogue's ${nominal} kbps: not the recording that was aligned` }
  durationMs = audioDir && existsSync(join(audioDir, `${pad3(surah)}.mp3`)) && haveFfprobe() ? seconds(join(audioDir, `${pad3(surah)}.mp3`)) : Math.round(((bytes - m.dataOffset) * 8) / m.kbps)
  return { facts: { bytes, kbps: m.kbps, dataOffset: m.dataOffset, durationMs } }
}

const bySurah = new Map()
for (const a of release ? releaseAyahs() : ayahsOf(raw, unit)) { if (!only || only.has(a.surah)) (bySurah.get(a.surah) ?? bySurah.set(a.surah, []).get(a.surah)).push(a) }

const ayahs = {}, files = {}, skipped = {}
const skip = (why, k) => { (skipped[why] ??= []).push(k) }
for (const [surah, list] of [...bySurah].sort((x, y) => x[0] - y[0])) {
  const f = await fileFacts(surah)
  if (f.why) { list.forEach((a) => skip(f.why, `${surah}:${a.ayah}`)); continue }
  const total = f.facts.durationMs
  files[String(surah)] = f.facts

  const parsed = list.sort((x, y) => x.ayah - y.ayah).map((a) => {
    if (!q.text[surah - 1]?.[a.ayah - 1]) return { a, why: 'not a valid ayah' }
    const r = wordsToSegments(a.words, wordCount(surah, a.ayah))
    return r.why ? { a, why: r.why } : { a, segs: r.segs, seams: (a.seams ?? []).filter((x) => x > 0 && x < r.segs.length) }
  })
  for (const p of parsed) if (p.why) skip(p.why, `${surah}:${p.a.ayah}`)
  const good = parsed.filter((p) => p.segs)
  // An ayah's window: from the middle of the silence before its first word to the middle of the silence after its last (ends of the file otherwise).
  for (let i = 0; i < good.length; i++) {
    const { a, segs, seams } = good[i]
    const first = segs[0][2], last = segs.at(-1)[3]
    const prev = good[i - 1], next = good[i + 1]
    const consecutive = (p) => p && Math.abs(p.a.ayah - a.ayah) === 1
    const origin = consecutive(prev) ? Math.round((prev.segs.at(-1)[3] + first) / 2) : Math.max(0, first - 200)
    const end = consecutive(next) ? Math.round((last + next.segs[0][2]) / 2) : Math.min(total, last + 200)
    if (last > total + 60) { skip('runs past the end of the audio file', `${surah}:${a.ayah}`); continue }
    if (end <= origin) { skip('empty window', `${surah}:${a.ayah}`); continue }
    ayahs[`${surah}:${a.ayah}`] = { d: end - origin, o: origin, s: segs.map(([w0, w1, t0, t1]) => [w0, w1, t0 - origin, t1 - origin]), ...(seams.length ? { x: seams } : {}) }
  }
}

mkdirSync(dirname(out), { recursive: true })
const data = {
  schema: 1, reciter,
  provenance: { source, licence, url, recording, method: 'published word timestamps for a whole-surah recording', retrieved: new Date().toISOString().slice(0, 10), granularity: 'surah', riwayah, audio: release ? { urls: Object.fromEntries(Object.keys(files).map((s) => [s, release.urls[s]])), files } : { urlTemplate, files } },
  ayahs,
}
writeFileSync(out, JSON.stringify(data))
console.log(`wrote ${out}: ${Object.keys(ayahs).length} ayahs in ${Object.keys(files).length} surahs`)
for (const [why, keys] of Object.entries(skipped)) console.log(`  skipped ${keys.length} (${why}): ${keys.slice(0, 8).join(', ')}${keys.length > 8 ? ', …' : ''}`)
