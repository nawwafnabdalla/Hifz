import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HAFS_AYAH_COUNTS, sha256File, shortHash, skeleton } from '../scripts/lib/arabic.mjs'
import { SURAHS, TOTAL_AYAHS, textOf, globalAyahNumber, pageOf, juzOf, INTEGRITY, loadTranslation } from '@/lib/quran/data'

const root = join(__dirname, '..')
const xc = JSON.parse(readFileSync(join(root, 'data/crosscheck/skeleton-hashes.json'), 'utf8')) as Record<string, string[]>
const errata = JSON.parse(readFileSync(join(root, 'data/errata.json'), 'utf8')).errata as { surah: number; ayah: number; before: string; after: string }[]
const primary = JSON.parse(readFileSync(join(root, 'data/sources/quran-json-3.1.2/quran.json'), 'utf8')) as { id: number; verses: { id: number; text: string }[] }[]

describe('Qur’an text integrity', () => {
  it('has 114 surahs and 6,236 ayahs with the canonical Hafs counts', () => {
    expect(SURAHS).toHaveLength(114)
    expect(SURAHS.map((s) => s.count)).toEqual(HAFS_AYAH_COUNTS)
    expect(HAFS_AYAH_COUNTS.reduce((a, b) => a + b, 0)).toBe(6236)
    expect(TOTAL_AYAHS).toBe(6236)
    let n = 0
    for (const s of SURAHS) for (let a = 1; a <= s.count; a++) { expect(textOf(s.n, a)).toBeTruthy(); n++ }
    expect(n).toBe(6236)
  })

  it('vendored primary source matches its pinned checksum', () => {
    const buf = readFileSync(join(root, 'data/sources/quran-json-3.1.2/quran.json'))
    expect(sha256File(buf)).toBe('d8a8adff387f60ce3ff7dbe3238dd9b27120bfe29d8fcb07ad2e89cad37cefd4')
  })

  it('agrees letter-for-letter with two independent sources (Tanzil, QUL) for all 6,236 ayahs', () => {
    let i = 0
    for (const s of SURAHS) for (let a = 1; a <= s.count; a++, i++) {
      const h = shortHash(skeleton(textOf(s.n, a)))
      if (h !== xc.tanzil![i] || h !== xc.qul![i]) throw new Error(`Letter-level disagreement at ${s.n}:${a}`)
    }
    expect(i).toBe(6236)
  })

  it('agrees on word spacing with both independent sources', () => {
    let i = 0
    for (const s of SURAHS) for (let a = 1; a <= s.count; a++, i++) {
      const h = shortHash(skeleton(textOf(s.n, a), { keepSpaces: true }))
      if (h !== xc.tanzilSpaced![i] || h !== xc.qulSpaced![i]) throw new Error(`Spacing disagreement at ${s.n}:${a}`)
    }
  })

  it('differs from the vendored source only by the documented whitespace errata', () => {
    const changed: string[] = []
    primary.forEach((s) => s.verses.forEach((v) => {
      const now = textOf(s.id, v.id)
      if (now !== v.text) {
        changed.push(`${s.id}:${v.id}`)
        // Non-whitespace characters must be identical, in order.
        expect(now.replace(/\s/g, '')).toBe(v.text.replace(/\s/g, ''))
      }
    }))
    expect(changed.sort()).toEqual(errata.map((e) => `${e.surah}:${e.ayah}`).sort())
    for (const e of errata) {
      expect(textOf(e.surah, e.ayah)).toBe(e.after)
      expect(e.before.replace(/\s/g, '')).toBe(e.after.replace(/\s/g, ''))
    }
  })

  it('contains only Arabic-block characters and plain spaces; no stray whitespace', () => {
    const allowed = /^[؀-ۿ ]+$/u
    for (const s of SURAHS) for (let a = 1; a <= s.count; a++) {
      const t = textOf(s.n, a)
      if (!allowed.test(t)) throw new Error(`Unexpected character in ${s.n}:${a}`)
      if (/ {2}|^ | $/.test(t)) throw new Error(`Bad spacing in ${s.n}:${a}`)
    }
  })

  it('has the Bismillah as 1:1 and no embedded Bismillah at the start of other surahs', () => {
    const bis = textOf(1, 1)
    for (const s of SURAHS) if (s.n !== 1) expect(textOf(s.n, 1).startsWith(bis.slice(0, 20))).toBe(false)
  })

  it('has well-formed spot checks (surah names, key ayahs)', () => {
    expect(SURAHS[0]!.tr).toBe('Al-Fatihah')
    expect(SURAHS[1]!.count).toBe(286)
    // Compared via the consonantal skeleton so no Qur'anic text is hand-typed in this file.
    expect(skeleton(textOf(112, 1), { keepSpaces: true })).toBe('قل هو الله احد')
    expect(skeleton(textOf(2, 255), { keepSpaces: true }).startsWith('الله لا اله الا هو الحي القيوم')).toBe(true)
    expect(skeleton(textOf(114, 6), { keepSpaces: true })).toBe('من الجنة والناس')
  })

  it('reports the integrity summary the app displays', () => {
    expect(INTEGRITY.ayahs).toBe(6236)
    expect(INTEGRITY.errata).toHaveLength(6)
    const gen = JSON.parse(readFileSync(join(root, 'src/data/generated/quran.json'), 'utf8'))
    expect(sha256File(Buffer.from(JSON.stringify(gen.text)))).toBe(INTEGRITY.generatedTextSha256)
  })

  it('numbers ayahs globally and maps pages and juz', () => {
    expect(globalAyahNumber(1, 1)).toBe(1)
    expect(globalAyahNumber(2, 1)).toBe(8)
    expect(globalAyahNumber(114, 6)).toBe(6236)
    expect(pageOf(1, 1)).toBe(1)
    expect(pageOf(114, 6)).toBe(604)
    expect(juzOf(2, 142)).toBe(2)
    expect(juzOf(78, 1)).toBe(30)
  })

  it('has juz boundaries identical to Tanzil\u2019s own metadata', () => {
    const tz = JSON.parse(readFileSync(join(root, 'data/crosscheck/juz-starts-tanzil.json'), 'utf8')).juzStarts as number[][]
    const gen = JSON.parse(readFileSync(join(root, 'src/data/generated/quran.json'), 'utf8')).juzStarts as number[][]
    expect(gen).toEqual(tz)
  })

  it('has a complete English translation aligned ayah-for-ayah', async () => {
    const t = await loadTranslation()
    expect(t).toHaveLength(114)
    t.forEach((s, i) => { expect(s).toHaveLength(HAFS_AYAH_COUNTS[i]!); s.forEach((x) => expect(x.length).toBeGreaterThan(2)) })
    expect(t[0]![0]).toContain('Entirely Merciful')
  })
})
