#!/usr/bin/env node
// Re-derives data/crosscheck/skeleton-hashes.json from two INDEPENDENT upstream
// copies of the Arabic text, fetched from npm at pinned versions and verified
// against the registry's sha512 integrity before use. Their text is never
// stored in this repo; only short hashes of the consonantal skeleton are.
//
//   Tanzil v1.1 (Uthmani minimal)  via @muslims-community/quran@1.1.0
//   QUL / Tarteel (Uthmani)        via quran-validator@1.3.0
//
// Needs network access to registry.npmjs.org. Normal CI/tests do NOT run this;
// they check the bundled text against the stored hashes.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { skeleton, shortHash, WAQF_RE } from './lib/arabic.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PINS = {
  tanzil: {
    spec: '@muslims-community/quran@1.1.0',
    integrity: 'sha512-ayWXhB0WAPv2KXZH5MM0ACPMLvRBU69Rn7PaIxmcMbtEJiRfdiUWaqpUtSLiV7FsSMcw0exTUQF4ERQr4AoKkw==',
    file: 'package/dist/quran.json',
  },
  qul: {
    spec: 'quran-validator@1.3.0',
    integrity: 'sha512-NT9YkM6N0Ozh104mx6vwsmVw4pGxbWRB3dsf9A4Do63ftLfIu+pgkPl5aagbXkHi4B3T8ZkCjW6p95x4C9dm5w==',
    file: 'package/data/quran-verses.json',
  },
}

function fetchPinned(pin) {
  const dir = mkdtempSync(join(tmpdir(), 'hifz-xcheck-'))
  const out = execFileSync('npm', ['pack', pin.spec, '--pack-destination', dir, '--silent'], { cwd: dir, encoding: 'utf8' }).trim()
  const tgz = join(dir, out.split('\n').pop())
  const got = 'sha512-' + createHash('sha512').update(readFileSync(tgz)).digest('base64')
  if (got !== pin.integrity) throw new Error(`Integrity mismatch for ${pin.spec}: ${got}`)
  execFileSync('tar', ['xzf', tgz, '-C', dir, pin.file])
  return JSON.parse(readFileSync(join(dir, pin.file), 'utf8'))
}

const tz = fetchPinned(PINS.tanzil)
const qul = fetchPinned(PINS.qul)
const tanzil = new Map(tz.surahs.flatMap((s) => s.ayat.map((a) => [`${s.id}:${a.id}`, a.text])))
const qulMap = new Map(qul.map((v) => [`${v.surah}:${v.ayah}`, v.text]))
if (tanzil.size !== 6236 || qulMap.size !== 6236) throw new Error('Cross-check source is not 6,236 verses')

const primary = JSON.parse(readFileSync(join(root, 'data/sources/quran-json-3.1.2/quran.json'), 'utf8'))
const keys = primary.flatMap((s) => s.verses.map((v) => `${s.id}:${v.id}`))

const rows = { keys: keys.length, tanzil: [], qul: [], tanzilSpaced: [], qulSpaced: [], waqf: {} }
const waqfDiff = []
for (const k of keys) {
  if (!tanzil.has(k) || !qulMap.has(k)) throw new Error(`Missing ${k} in a cross-check source`)
  rows.tanzil.push(shortHash(skeleton(tanzil.get(k))))
  rows.qul.push(shortHash(skeleton(qulMap.get(k))))
  rows.tanzilSpaced.push(shortHash(skeleton(tanzil.get(k), { keepSpaces: true })))
  rows.qulSpaced.push(shortHash(skeleton(qulMap.get(k), { keepSpaces: true })))
}
const out = {
  schema: 1,
  note: 'Hashes (sha256, first 10 hex) of the consonantal skeleton of each verse in two independent sources. See data/PROVENANCE.md.',
  sources: Object.fromEntries(Object.entries(PINS).map(([k, v]) => [k, { npm: v.spec, integrity: v.integrity }])),
  order: 'verse order surah 1..114, ayah 1..n (6,236 entries)',
  tanzil: rows.tanzil,
  qul: rows.qul,
  tanzilSpaced: rows.tanzilSpaced,
  qulSpaced: rows.qulSpaced,
}
writeFileSync(join(root, 'data/crosscheck/skeleton-hashes.json'), JSON.stringify(out) + '\n')
console.log('wrote data/crosscheck/skeleton-hashes.json for', keys.length, 'verses')

// Informational: how often do the two sources place stop marks identically to the primary?
let same = 0
for (const k of keys) {
  const p = primary[+k.split(':')[0] - 1].verses[+k.split(':')[1] - 1].text
  const a = (p.match(WAQF_RE) || []).join('')
  const b = (qulMap.get(k).match(WAQF_RE) || []).join('')
  if (a === b) same++
  else waqfDiff.push(k)
}
console.log(`stop-mark sequences identical to QUL in ${same}/${keys.length} verses`)
