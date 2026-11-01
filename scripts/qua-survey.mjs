#!/usr/bin/env node
// Survey a Quranic Universal Audio release (manifest.json + catalog.json + <slug>.zip files in one folder) against the app's canonical text.
//   node scripts/qua-survey.mjs --release-dir ./v4.0.0 [--out data/crosscheck/qua-v4.0.0-survey.json]
// For every recitation: integrity (zip sha256 vs the manifest), riwayah, audio source host / bitrate mode, coverage, and how many ayahs the app could
// actually use for phrase audio: word count equal to the app's canonical text, canonical take continuous (no repeated words), ≥85% words timed.
// Nothing is downloaded here; it reads files you already have. Audio is checked separately by scripts/import-qua.mjs --probe.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { gunzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const dir = arg('release-dir'); if (!dir) { console.error('missing --release-dir'); process.exit(2) }
const out = arg('out', join(root, 'data/crosscheck/qua-survey.json'))
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
const catalog = JSON.parse(readFileSync(join(dir, 'catalog.json'), 'utf8'))
const quran = JSON.parse(readFileSync(join(root, 'src/data/generated/quran.json'), 'utf8'))
const wc = (s, a) => quran.text[s - 1][a - 1].split(' ').filter(Boolean).length
const bySlug = new Map(catalog.recitations.map((r) => [r.slug, r]))
const unzip = (zip, name) => execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 28 })

/** The reciter's last continuous take (same rule as scripts/import-qua.mjs): an abandoned earlier attempt at a repeated passage is dropped. */
function lastTake(words) {
  const out = []
  for (const w of words) { while (out.length && out.at(-1)[0] >= w[0]) out.pop(); out.push(w) }
  return out
}
/** Why a canonical row cannot be used for phrase audio, or null. `repeated` rows are usable (reduced to the last take) but counted separately. */
export function usable(ref, words) {
  const [s, a] = ref.split(':').map(Number), n = wc(s, a)
  if (!words.length) return 'no words'
  if (words.at(-1)[0] > n || Math.max(...words.map((w) => w[0])) > n) return 'more words than the canonical text'
  return lastTake(words).length / n < 0.85 ? 'too few words timed in the last continuous take' : null
}

const report = []
for (const [slug, rec] of Object.entries(manifest.recitations)) {
  const zip = join(dir, rec.zip), cat = bySlug.get(slug)
  const sha = createHash('sha256').update(readFileSync(zip)).digest('hex')
  const row = { slug, name: cat?.name_en, reciterId: cat?.reciter_id, channel: cat?.channel, style: cat?.style, riwayah: cat?.riwayah, context: cat?.recording_context ?? null, year: cat?.recording_year ?? null, zipSha256Ok: sha === rec.sha256, coverageAyahs: rec.coverage_ayahs }
  const a = cat?.audio ?? {}
  const urls = Object.values(a.chapter_urls ?? {})
  row.audio = { hosts: [...new Set(urls.map((u) => new URL(u).host))], chapters: urls.length, kbps: a.bitrate_kbps_nominal ?? null, mode: a.bitrate_mode ?? null, sampleRate: a.sample_rate_hz ?? null, withOffsets: Object.keys(a.chapter_offsets_ms ?? {}).length, streamable: urls.length > 0 && urls.every((u) => !/youtube\.com|youtu\.be|drive\.google/.test(u)) }
  try {
    const rows = JSON.parse(gunzipSync(unzip(zip, 'word_timestamps.json.gz'))).rows
    const canon = rows.filter((r) => r[3] === true)
    const skipped = {}; let ok = 0, repeated = 0, taha94 = null
    for (const r of canon) { const why = usable(r[0], r[5]); if (why) skipped[why] = (skipped[why] ?? 0) + 1; else { ok++; if (r[5].some((w, i) => i && w[0] <= r[5][i - 1][0])) repeated++ } if (r[0] === '20:94') taha94 = why ?? (r[5].some((w, i) => i && w[0] <= r[5][i - 1][0]) ? 'usable (last take of a repeated passage)' : 'usable') }
    // Reciter pauses inside usable ayahs (ms between consecutive words), a quick measure of how clean phrase cuts will be.
    const gaps = []
    for (const r of canon) if (!usable(r[0], r[5])) { const w = lastTake(r[5]); for (let i = 0; i + 1 < w.length; i++) gaps.push(w[i + 1][1] - w[i][2]) }
    gaps.sort((x, y) => x - y)
    row.words = { canonicalRows: canon.length, usableAyahs: ok, ofWhichRepeatedPassage: repeated, skipped, taha94, medianGapMs: gaps[gaps.length >> 1] ?? null, p90GapMs: gaps[Math.floor(gaps.length * 0.9)] ?? null }
  } catch (e) { row.words = { error: String(e).slice(0, 120) } }
  report.push(row)
}
writeFileSync(out, JSON.stringify({ release: manifest.release_version, created: manifest.created_at, license: manifest.license, recitations: report }, null, 1))
const tot = report.length
console.log(`${tot} recitations; zip checksums ok: ${report.filter((r) => r.zipSha256Ok).length}; hafs: ${report.filter((r) => r.riwayah === 'hafs_an_asim').length}; streamable sources: ${report.filter((r) => r.audio.streamable).length}`)
