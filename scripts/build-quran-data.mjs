#!/usr/bin/env node
// Builds the app's bundled Qur'an data from the pinned, vendored primary source.
//
//   data/sources/quran-json-3.1.2/quran.json     primary Arabic (Uthmani, QuranEnc)
//   data/sources/quran-json-3.1.2/quran_en.json  English (Saheeh International, via Tanzil)
//   data/errata.json                             whitespace-only corrections, see PROVENANCE.md
//
// Output is deterministic (no timestamps). Run: npm run data:build
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as hafs from 'quran-meta/hafs'
import { HAFS_AYAH_COUNTS, sha256File, shortHash, skeleton } from './lib/arabic.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'data/sources/quran-json-3.1.2')
const outDir = join(root, 'src/data/generated')
const PINNED = {
  'quran.json': 'd8a8adff387f60ce3ff7dbe3238dd9b27120bfe29d8fcb07ad2e89cad37cefd4',
  'quran_en.json': 'bae3acab517304dc2684d65949a00f31000a92818041cefabc234663da99d7a3',
}

const raw = {}
for (const [name, want] of Object.entries(PINNED)) {
  const buf = readFileSync(join(srcDir, name))
  const got = sha256File(buf)
  if (got !== want) throw new Error(`${name}: sha256 ${got} does not match the pinned ${want}. Refusing to build.`)
  raw[name] = JSON.parse(buf.toString('utf8'))
}
const ar = raw['quran.json']
const en = raw['quran_en.json']

// ── Structural integrity ────────────────────────────────────────────────────
if (ar.length !== 114 || en.length !== 114) throw new Error('Expected 114 surahs')
ar.forEach((s, i) => {
  if (s.id !== i + 1) throw new Error(`Surah order broken at ${i + 1}`)
  if (s.verses.length !== HAFS_AYAH_COUNTS[i]) throw new Error(`Surah ${s.id}: ${s.verses.length} ayahs, canonical ${HAFS_AYAH_COUNTS[i]}`)
  if (s.total_verses !== s.verses.length) throw new Error(`Surah ${s.id}: total_verses mismatch`)
  s.verses.forEach((v, j) => {
    if (v.id !== j + 1) throw new Error(`Ayah order broken at ${s.id}:${j + 1}`)
    if (!v.text || v.text !== v.text.trim()) throw new Error(`Empty or untrimmed text at ${s.id}:${v.id}`)
    if (en[i].verses[j].id !== v.id || en[i].verses[j].text !== v.text)
      throw new Error(`Translation file disagrees with primary Arabic at ${s.id}:${v.id}`)
  })
})

// ── Errata: whitespace-only, justified, and verified ───────────────────────
const { errata } = JSON.parse(readFileSync(join(root, 'data/errata.json'), 'utf8'))
const text = ar.map((s) => s.verses.map((v) => v.text))
for (const e of errata) {
  const cur = text[e.surah - 1][e.ayah - 1]
  if (cur !== e.before) throw new Error(`Errata ${e.surah}:${e.ayah}: source text changed; re-review`)
  if (e.after.replace(/\s/g, '') !== e.before.replace(/\s/g, '')) throw new Error(`Errata ${e.surah}:${e.ayah}: touches more than whitespace`)
  text[e.surah - 1][e.ayah - 1] = e.after
}

// ── Cross-check against two independent sources (hashes only) ──────────────
const x = JSON.parse(readFileSync(join(root, 'data/crosscheck/skeleton-hashes.json'), 'utf8'))
let i = 0
const mismatches = { letters: [], spacing: [] }
text.forEach((verses, si) =>
  verses.forEach((t, vi) => {
    const k = `${si + 1}:${vi + 1}`
    const letters = shortHash(skeleton(t))
    if (letters !== x.tanzil[i] || letters !== x.qul[i]) mismatches.letters.push(k)
    const spaced = shortHash(skeleton(t, { keepSpaces: true }))
    if (spaced !== x.tanzilSpaced[i] || spaced !== x.qulSpaced[i]) mismatches.spacing.push(k)
    i++
  }),
)
if (mismatches.letters.length) throw new Error('Letter-level disagreement with an independent source: ' + mismatches.letters.join(', '))
if (mismatches.spacing.length) throw new Error('Word-spacing disagreement with independent sources: ' + mismatches.spacing.join(', '))

// ── Navigation metadata from quran-meta (Hafs / Madinah), cross-checked ────
const starts = (fn, n) => {
  const out = []
  let last = 0
  text.forEach((verses, si) => verses.forEach((_, vi) => {
    const p = fn(si + 1, vi + 1)
    if (p !== last) { out.push([si + 1, vi + 1]); last = p }
  }))
  if (out.length !== n) throw new Error(`Expected ${n} starts, found ${out.length}`)
  return out
}
const juzStarts = starts(hafs.findJuz, 30)
const pageStarts = starts(hafs.findPage, 604)
if (pageStarts[0].join() !== '1,1' || pageStarts[1].join() !== '2,1') throw new Error('Page table sanity check failed')

const surahs = ar.map((s, k) => ({ n: s.id, ar: s.name, tr: s.transliteration, en: en[k].translation, type: s.type, count: s.verses.length }))
const arabicOut = { schema: 1, surahs, text, juzStarts, pageStarts }
const enOut = { schema: 1, edition: 'Saheeh International', text: en.map((s) => s.verses.map((v) => v.translation)) }
enOut.text.forEach((s, k) => { if (s.length !== text[k].length || s.some((t) => !t)) throw new Error(`Translation gap in surah ${k + 1}`) })

const arabicJson = JSON.stringify(arabicOut)
const report = {
  schema: 1,
  surahs: 114,
  ayahs: text.reduce((n, s) => n + s.length, 0),
  words: text.reduce((n, s) => n + s.reduce((m, t) => m + t.split(' ').length, 0), 0),
  primary: { npm: 'quran-json@3.1.2', upstream: 'The Noble Qur’an Encyclopedia (QuranEnc) Uthmani text', files: PINNED },
  crosscheck: { sources: x.sources, letterLevelAgreement: '6236/6236 with both', wordSpacingAgreement: '6236/6236 with both (after errata)' },
  errata: errata.map((e) => ({ surah: e.surah, ayah: e.ayah, ops: e.ops })),
  generatedTextSha256: sha256File(Buffer.from(JSON.stringify(text))),
  generatedFileSha256: sha256File(Buffer.from(arabicJson)),
}

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'quran.json'), arabicJson + '\n')
writeFileSync(join(outDir, 'translation-en.json'), JSON.stringify(enOut) + '\n')
writeFileSync(join(outDir, 'integrity.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`OK  ${report.ayahs} ayahs, ${report.words} words, ${errata.length} whitespace errata, text sha256 ${report.generatedTextSha256.slice(0, 16)}…`)
