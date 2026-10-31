import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import opentype from 'opentype.js'
import { SURAHS, textOf } from '@/lib/quran/data'
import { drawnWord, officialWords, toOfficialMarks } from '@/lib/quran/script'
import { shortHash, skeleton } from '../scripts/lib/arabic.mjs'

const root = join(__dirname, '..')
const FONT = join(root, 'src/assets/fonts/UthmanicHafs-v-3.0.ttf')
const RELEASE_SHA256 = '5c47602425fb4190327ab9e1a2e8ed2f53dceaf595d8ccc29ac32b8b209ad398'
const official = JSON.parse(readFileSync(join(root, 'data/crosscheck/qpc-v3-ayah-hashes.json'), 'utf8')) as { hashes: string[] }
const font = (() => { const b = readFileSync(FONT); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer) })()

const refs: [number, number][] = []
for (const s of SURAHS) for (let a = 1; a <= s.count; a++) refs.push([s.n, a])

describe('the Complex’s font is shipped exactly as released', () => {
  it('is byte-identical to the release (its licence forbids modification, subsetting or conversion)', () => {
    expect(createHash('sha256').update(readFileSync(FONT)).digest('hex')).toBe(RELEASE_SHA256)
  })
  it('still carries its own end-user licence and copyright in the font file', () => {
    const names = font.names as unknown as Record<string, Record<string, string>>
    const all = JSON.stringify(names)
    expect(all).toMatch(/King Fahd Glorious Quran Printing Complex/)
    expect(all).toMatch(/Permission is hereby granted, Free of Cost/)
    expect(readFileSync(join(root, 'data/fonts/KFGQPC-EULA.txt'), 'utf8')).toMatch(/cannot be Sold, Modified, Altered/)
  })
  it('is a TrueType file, not a re-encoded copy', () => { expect(readFileSync(FONT).subarray(0, 4).toString('hex')).toBe('00010000') })
})

describe('the official-script display layer', () => {
  it('draws every character it uses with a glyph in the font (no empty boxes)', () => {
    const used = new Set<number>()
    for (const [s, a] of refs) for (const w of officialWords(s, a) ?? []) for (const ch of w) used.add(ch.codePointAt(0)!)
    const missing = [...used].filter((c) => font.charToGlyphIndex(String.fromCodePoint(c)) === 0)
    expect(missing.map((c) => 'U+' + c.toString(16).toUpperCase())).toEqual([])
    expect(used.has(0x08f0) && used.has(0x08f1) && used.has(0x08f2)).toBe(true)   // the official open-tanween signs
  })
  it('has the font’s native end-of-ayah sign and digits', () => {
    for (const cp of [0x06dd, ...Array.from({ length: 10 }, (_, i) => 0x0660 + i)]) expect(font.charToGlyphIndex(String.fromCodePoint(cp))).toBeGreaterThan(0)
  })
  it('is word-for-word aligned with the canonical text: same number of words, same letters in each', () => {
    let aligned = 0
    for (const [s, a] of refs) {
      const o = officialWords(s, a)
      if (!o) continue
      const c = textOf(s, a).split(' ')
      expect(o.length, `${s}:${a} word count`).toBe(c.length)
      for (let i = 0; i < c.length; i++) if (skeleton(o[i]!) !== skeleton(c[i]!)) throw new Error(`${s}:${a} word ${i + 1}: letters differ`)
      aligned++
    }
    expect(aligned).toBe(6235)
  })
  it('falls back to the canonical text for exactly one ayah (15:7), where the official spelling joins two words', () => {
    const none = refs.filter(([s, a]) => officialWords(s, a) === null).map(([s, a]) => `${s}:${a}`)
    expect(none).toEqual(['15:7'])
  })
  it('is exactly the official KFGQPC v3.0 text: every ayah hashes to the recorded hash', () => {
    refs.forEach(([s, a], i) => {
      const o = officialWords(s, a)
      if (o && shortHash(o.join(' ')) !== official.hashes[i]) throw new Error(`${s}:${a} differs from the official text`)
    })
  })
  it('does not change the canonical text it sits beside', () => {
    const h = createHash('sha256').update(JSON.stringify(JSON.parse(readFileSync(join(root, 'src/data/generated/quran.json'), 'utf8')).text)).digest('hex')
    expect(h.slice(0, 16)).toBe('885a599bccca729a')       // the hash recorded when the text was verified
  })
})

describe('how the script is chosen per word', () => {
  it('simple script draws the canonical word untouched', () => {
    const c = textOf(2, 255).split(' ')
    expect(drawnWord(2, 255, 3, c[3]!, false)).toBe(c[3])
  })
  it('Madinah script draws the official word for that position', () => {
    const c = textOf(2, 255).split(' ')
    expect(drawnWord(2, 255, 3, c[3]!, true)).toBe(officialWords(2, 255)![3])
  })
  it('with no aligned official text (15:7), only the documented open-tanween code points are mapped', () => {
    expect(toOfficialMarks('ٖٗٞx')).toBe('ࣰࣱࣲx')
    const w = textOf(15, 7).split(' ')[1]!
    expect(skeleton(drawnWord(15, 7, 1, w, true))).toBe(skeleton(w))
  })
})

describe('what the official text says about our canonical text', () => {
  const fold = (t: string) => {
    const out: string[] = []; let run: string[] = []
    for (const c of t.normalize('NFC')) {
      if (/\p{Mn}|\p{Me}/u.test(c) || (c >= 'ۖ' && c <= 'ۭ') || (c >= 'ࣰ' && c <= 'ࣲ')) run.push(c)
      else { out.push(run.sort().join('')); run = []; out.push(c) }
    }
    out.push(run.sort().join(''))
    return out.join('')
  }
  const mapped = (t: string) => toOfficialMarks(t)
  it('agrees ayah for ayah, apart from kashida seats and three ayahs flagged for review', () => {
    let identical = 0, seatOnly = 0
    const differ: string[] = []
    for (const [s, a] of refs) {
      const o = officialWords(s, a)
      const c = textOf(s, a)
      if (!o) { differ.push(`${s}:${a}`); continue }
      const O = o.join(' ')
      if (fold(mapped(c)) === fold(O)) identical++
      else if (fold(mapped(c).replace(/ـ/g, '')) === fold(O.replace(/ـ/g, ''))) seatOnly++
      else differ.push(`${s}:${a}`)
    }
    expect(identical).toBe(5296)
    expect(seatOnly).toBe(937)
    expect(differ.sort()).toEqual(['15:7', '2:72', '52:37'])
  })
})
