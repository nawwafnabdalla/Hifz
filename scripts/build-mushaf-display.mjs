#!/usr/bin/env node
// Builds the Madinah Mushaf DISPLAY layer: the official King Fahd Complex (KFGQPC) Hafs v3.0 text, word for word,
// aligned to our canonical words, for rendering with the Complex's own font.
//
// The canonical text (src/data/generated/quran.json) is never changed by this script or by the display layer.
// All learning logic (word indices, phrases, hints, hashes) stays on the canonical text; only the glyph string drawn on
// screen comes from here, and only for ayahs where it is PROVEN to be the same letters in the same words.
//
// Source (pinned, integrity-checked): npm @quran.ws/text@0.1.0 (CC BY 4.0), data/hafs.json: the Complex's v3.0 release text
// with waqf/sajdah/hizb signs by position. The JSON is parsed as DATA; no third-party code is executed.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { skeleton, shortHash, sha256File } from './lib/arabic.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PIN = { spec: '@quran.ws/text@0.1.0', integrity: 'sha512-CWr2Kp4h1CknaTgSE/OUZ0E0v22AlKPMey7CZPOo4/Juh2cYGj/P2cTX1VJgPGodCnrNP8ucWopwEiCWENR8aA==', member: 'package/data/hafs.json', font: 'package/data/UthmanicHafs-v-3.0.ttf' }
const FONT_SHA = '5c47602425fb4190327ab9e1a2e8ed2f53dceaf595d8ccc29ac32b8b209ad398'

const dir = mkdtempSync(join(tmpdir(), 'hifz-qpc-'))
const out = execFileSync('npm', ['pack', PIN.spec, '--pack-destination', dir, '--silent'], { cwd: dir, encoding: 'utf8' }).trim()
const tgz = join(dir, out.split('\n').pop())
const got = 'sha512-' + createHash('sha512').update(readFileSync(tgz)).digest('base64')
if (got !== PIN.integrity) throw new Error(`Integrity mismatch for ${PIN.spec}: ${got}`)
execFileSync('tar', ['xzf', tgz, '-C', dir, PIN.member, PIN.font])
const d = JSON.parse(readFileSync(join(dir, PIN.member), 'utf8'))
const fontBytes = readFileSync(join(dir, PIN.font))
if (sha256File(fontBytes) !== FONT_SHA) throw new Error('Font checksum does not match the release record')
if (sha256File(readFileSync(join(root, 'src/assets/fonts/UthmanicHafs-v-3.0.ttf'))) !== FONT_SHA) throw new Error('Shipped font file differs from the release')

// Official words with their signs, per ayah.
const words = d.words, starts = [...d.ayah_starts, words.length], types = d.mark_types
const after = new Map(), before = new Map()
for (const [w, t] of d.marks) { const m = types[t]; const tgt = m.side === 'after' ? after : before; tgt.set(w, (tgt.get(w) ?? '') + m.sign) }
const official = []
for (let i = 0; i < 6236; i++) { const ws = []; for (let w = starts[i]; w < starts[i + 1]; w++) ws.push((before.get(w) ?? '') + words[w] + (after.get(w) ?? '')); official.push(ws) }

const canon = JSON.parse(readFileSync(join(root, 'src/data/generated/quran.json'), 'utf8')).text
const display = [], hashes = [], fallbackAyahs = [], notes = { aligned: 0, fallback: 0 }
let i = 0
for (let s = 0; s < 114; s++) {
  const row = []
  for (let a = 0; a < canon[s].length; a++, i++) {
    const cw = canon[s][a].split(' ')
    const ow = official[i]
    hashes.push(shortHash(ow.join(' ')))
    const same = cw.length === ow.length && cw.every((w, k) => skeleton(w) === skeleton(ow[k]))
    if (same) { row.push(ow); notes.aligned++ } else { row.push(null); notes.fallback++; fallbackAyahs.push(`${s + 1}:${a + 1}`) }
  }
  display.push(row)
}
writeFileSync(join(root, 'src/data/generated/mushaf-display.json'), JSON.stringify({
  schema: 1,
  font: { family: 'KFGQPC HAFS Uthmanic Script', file: 'UthmanicHafs-v-3.0.ttf', sha256: FONT_SHA, publisher: 'King Fahd Glorious Quran Printing Complex' },
  source: { npm: PIN.spec, licence: 'CC BY 4.0 (dataset)', text: 'KFGQPC Uthmanic Hafs v3.0 release text', releaseDocxSha256: d.provenance.text.sha256 },
  text: display,
}) + '\n')
writeFileSync(join(root, 'data/crosscheck/qpc-v3-ayah-hashes.json'), JSON.stringify({
  note: 'sha256 (first 10 hex) of each ayah of the official KFGQPC Hafs v3.0 text (words with their signs, single spaces), from @quran.ws/text. The shipped display text must hash to these.',
  source: PIN.spec, tarballIntegrity: got, hashes,
}) + '\n')
console.log(`aligned ${notes.aligned}, display falls back to canonical for ${notes.fallback}: ${fallbackAyahs.join(', ')}`)
