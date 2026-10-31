// Bundled, verified Qur'an text (see data/PROVENANCE.md). Read-only.
import raw from '@/data/generated/quran.json'
import integrity from '@/data/generated/integrity.json'
import type { Corpus } from '@/lib/engine/types'

export interface SurahInfo {
  n: number
  ar: string
  tr: string
  en: string
  type: string
  count: number
}

export const SURAHS = raw.surahs as SurahInfo[]
export const INTEGRITY = integrity
export const TOTAL_AYAHS = 6236

const TEXT = raw.text as string[][]
const wordCache = new Map<number, string[]>()

export function surahInfo(n: number): SurahInfo {
  return SURAHS[n - 1]!
}
export const ayahCount = (s: number) => SURAHS[s - 1]!.count
export const textOf = (s: number, a: number): string => TEXT[s - 1]![a - 1]!
export function wordsOfAyah(s: number, a: number): string[] {
  const key = s * 1000 + a
  let w = wordCache.get(key)
  if (!w) {
    w = textOf(s, a).split(' ').filter(Boolean)
    wordCache.set(key, w)
  }
  return w
}
export const isValidRef = (s: number, a: number) => Number.isInteger(s) && Number.isInteger(a) && s >= 1 && s <= 114 && a >= 1 && a <= ayahCount(s)

/** The Bismillah is ayah 1:1. It is shown as a header for surahs 2-114 except 9; it is not an ayah of those surahs. */
export const bismillahText = () => textOf(1, 1)
export const hasBismillahHeader = (s: number) => s !== 1 && s !== 9

export const corpus: Corpus = {
  ayahCount,
  wordCount: (s, a) => wordsOfAyah(s, a).length,
}

/** 1..6236, used by audio sources that number ayahs globally. */
const OFFSETS: number[] = (() => {
  const o: number[] = [0]
  for (const s of SURAHS) o.push(o[o.length - 1]! + s.count)
  return o
})()
export const globalAyahNumber = (s: number, a: number) => OFFSETS[s - 1]! + a

const startsToLookup = (starts: number[][]) => (s: number, a: number): number => {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    const [ss, aa] = starts[mid]!
    if (ss! < s || (ss === s && aa! <= a)) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}
export const juzOf = startsToLookup(raw.juzStarts)
export const pageOf = startsToLookup(raw.pageStarts)

let translationPromise: Promise<string[][]> | null = null
/** English translation (Saheeh International). Loaded lazily; cached by the service worker for offline use. */
export function loadTranslation(): Promise<string[][]> {
  translationPromise ??= import('@/data/generated/translation-en.json').then((m) => (m.default as { text: string[][] }).text)
  return translationPromise
}

export function surahLabel(n: number): string {
  return `${n}. ${surahInfo(n).tr}`
}

/** Eastern Arabic-Indic digits, for ayah medallions. */
export function arabicIndic(n: number): string {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]!)
}
