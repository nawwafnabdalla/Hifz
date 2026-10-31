import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import opentype from 'opentype.js'
import { ALT_FONT_CHARS, wordFontClass } from '@/components/Arabic'
import { SURAHS, textOf } from '@/lib/quran/data'

const root = join(__dirname, '..')
const load = (pkg: string, file: string) => {
  const b = readFileSync(join(root, 'node_modules/@fontsource', pkg, 'files', file))
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
}
const quranFont = load('amiri-quran', 'amiri-quran-arabic-400-normal.woff')
const altFont = load('amiri', 'amiri-arabic-400-normal.woff')
const has = (f: opentype.Font, cp: number) => f.charToGlyphIndex(String.fromCodePoint(cp)) > 0

const used = new Map<number, number>()
for (const s of SURAHS) for (let a = 1; a <= s.count; a++) for (const ch of textOf(s.n, a)) used.set(ch.codePointAt(0)!, (used.get(ch.codePointAt(0)!) ?? 0) + 1)

describe('every character of the Qur’an text has a glyph in the fonts we ship', () => {
  it('uses the expected set of code points', () => {
    expect(used.size).toBeGreaterThan(60)
    expect(used.has(0x20)).toBe(true)
  })
  it('is fully covered by Amiri Quran plus Amiri (nothing renders as an empty box)', () => {
    const missing = [...used.keys()].filter((c) => c !== 0x20 && !has(quranFont, c) && !has(altFont, c))
    expect(missing.map((c) => 'U+' + c.toString(16).toUpperCase())).toEqual([])
  })
  it('routes every character Amiri Quran lacks to the fallback font, at word level', () => {
    const lacking = [...used.keys()].filter((c) => c !== 0x20 && !has(quranFont, c))
    for (const c of lacking) expect(ALT_FONT_CHARS.test(String.fromCodePoint(c))).toBe(true)
    expect(lacking).toContain(0x065e)     // documents the known gap: 1,807 uses
  })
  it('tags only the words that need it', () => {
    expect(wordFontClass('نَوْمٞ')).toBe(' alt')
    expect(wordFontClass('نَوْم')).toBe('')
  })
})
