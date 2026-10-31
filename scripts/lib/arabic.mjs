// Shared Arabic helpers for the Qur'an data pipeline and its tests.
// NOTHING in here is used to rewrite Qur'anic text. These functions only
// derive comparison keys, so independent sources can be checked for agreement.
import { createHash } from 'node:crypto'

const LETTER_MAP = {
  'ٱ': 'ا', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا',
  'ى': 'ي', 'ی': 'ي', 'ک': 'ك',
  'ؤ': 'و', 'ئ': 'ي', 'ء': '',
  'ۀ': 'ة', 'ہ': 'ه', 'ۃ': 'ة',
}

/**
 * Consonantal comparison key. Strips every combining mark, Qur'anic annotation
 * sign (U+06D6..U+06ED), tatweel and format character, folds hamza/alef/ya
 * carriers, and (when keepSpaces is false) removes whitespace so that
 * word-spacing conventions do not mask letter-level agreement.
 */
export function skeleton(text, { keepSpaces = false } = {}) {
  const out = []
  for (const c of text.normalize('NFD')) {
    const cp = c.codePointAt(0)
    if (/\p{Mn}|\p{Me}|\p{Cf}/u.test(c)) continue
    if (c === 'ـ' || (cp >= 0x06d6 && cp <= 0x06ed) || cp === 0x06dd || cp === 0x06de) continue
    out.push(Object.hasOwn(LETTER_MAP, c) ? LETTER_MAP[c] : c)
  }
  const s = out.join('')
  return keepSpaces ? s.replace(/\s+/g, ' ').trim() : s.replace(/\s+/g, '')
}

export const WAQF_RE = /[ۖ-ۜ]/gu

export function shortHash(s, len = 10) {
  return createHash('sha256').update(s, 'utf8').digest('hex').slice(0, len)
}

export function sha256File(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

/** Canonical Hafs ayah counts, written out independently of any dataset. */
export const HAFS_AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
]
