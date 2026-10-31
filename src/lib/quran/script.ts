// Which script is drawn on screen. This layer only chooses the GLYPH STRING for a word; every piece of learning logic
// (word indices, phrases, hints, masks, hashes) keeps using the canonical text in data.ts.
//
// 'madinah': the official King Fahd Glorious Quran Printing Complex Hafs v3.0 text, word for word, drawn in the Complex's own
//            font, byte-identical to the release (see data/fonts/ and tests/mushaf.test.ts).
// 'simple' : the canonical text in Amiri Quran (+ Amiri for the one mark it lacks).
// 'madinah' is used only while its font has actually loaded; otherwise the simple script is drawn, never a font with gaps.
import { useSyncExternalStore } from 'react'
import display from '@/data/generated/mushaf-display.json'

export const MADINAH_FAMILY = 'KFGQPC HAFS Uthmanic Script'
const TEXT = display.text as (string[] | null)[][]

/** Official words per ayah, aligned 1:1 with the canonical words, or null where alignment could not be proven. */
export const officialWords = (surah: number, ayah: number): string[] | null => TEXT[surah - 1]?.[ayah - 1] ?? null

/**
 * The same open-tanween signs the official text writes as U+08F0..U+08F2 are stored in our canonical text as other Arabic marks
 * (U+0657, U+065E, U+0656). Used ONLY where an ayah has no aligned official text. Derived from, and tested against, the official text.
 */
const OPEN_TANWEEN: Record<number, number> = { 0x0657: 0x08f0, 0x065e: 0x08f1, 0x0656: 0x08f2 }
export const toOfficialMarks = (w: string) => Array.from(w, (c) => String.fromCodePoint(OPEN_TANWEEN[c.codePointAt(0)!] ?? c.codePointAt(0)!)).join('')

let wanted = true
let fontReady = false
const listeners = new Set<() => void>()
const apply = () => {
  if (typeof document !== 'undefined') document.documentElement.dataset.script = isMushaf() ? 'madinah' : 'simple'
  for (const l of listeners) l()
}

export const isMushaf = () => wanted && fontReady
export function setScriptSetting(s: 'madinah' | 'simple') { if (wanted !== (s === 'madinah')) { wanted = s === 'madinah'; apply() } else apply() }

/** Loads the font once; the official script is used only after it has really loaded and can draw the open-tanween signs. */
export function initScriptFont(): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve(false)
  return document.fonts.load(`1em "${MADINAH_FAMILY}"`, '۝ࣰࣱࣲ')
    .then((faces) => { fontReady = faces.length > 0 && document.fonts.check(`1em "${MADINAH_FAMILY}"`, 'ࣰ'); apply(); return fontReady })
    .catch(() => { fontReady = false; apply(); return false })
}

export function useMushaf(): boolean {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, isMushaf, () => false)
}

/** The string to draw for canonical word `i` of an ayah. */
export function drawnWord(surah: number, ayah: number, i: number, canonical: string, mushaf: boolean): string {
  if (!mushaf) return canonical
  const o = officialWords(surah, ayah)
  return o ? o[i] ?? canonical : toOfficialMarks(canonical)
}
