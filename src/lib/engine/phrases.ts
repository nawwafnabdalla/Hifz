// Phrase segmentation for the Flow ladder.
//
// Stop signs in the Uthmani text are *recitation guidance*, not equally good
// places to pause, and several mean "do not stop". We therefore:
//   * use only signs that permit or prefer stopping as default suggestions;
//   * offer weaker signs (continue-preferred, paired) only on explicit request;
//   * never use the "do not stop" sign (ۙ);
//   * never invent boundaries where the text has none (the user can add their own);
//   * never treat a suggestion as a ruling. Phrases are for practice, not for waqf.

export type MarkStrength = 'required' | 'preferred' | 'permitted' | 'pause' | 'weak' | 'avoid'
export const STOP_MARKS: Record<string, { name: string; strength: MarkStrength }> = {
  'ۘ': { name: 'stop required', strength: 'required' },
  'ۗ': { name: 'stopping preferred', strength: 'preferred' },
  'ۚ': { name: 'stopping permitted', strength: 'permitted' },
  'ۜ': { name: 'brief pause', strength: 'pause' },
  'ۖ': { name: 'continuing preferred', strength: 'weak' },
  'ۛ': { name: 'paired stop (one of two)', strength: 'weak' },
  'ۙ': { name: 'do not stop', strength: 'avoid' },
}

export function wordsOf(text: string): string[] {
  return text.split(' ').filter(Boolean)
}

function markOfWord(word: string): { char: string; strength: MarkStrength } | null {
  let found: { char: string; strength: MarkStrength } | null = null
  for (const ch of word) {
    const m = STOP_MARKS[ch]
    if (m) found = { char: ch, strength: m.strength }
  }
  return found
}

export interface SuggestOptions {
  includeWeak?: boolean
  minWords?: number
}
export interface Suggestion {
  boundaries: number[]
  /** Why each boundary was suggested, keyed by boundary index. */
  reasons: Record<number, string>
}

export function suggestBoundaries(words: string[], opts: SuggestOptions = {}): Suggestion {
  const minWords = opts.minWords ?? 2
  const raw: number[] = []
  const reasons: Record<number, string> = {}
  for (let i = 0; i < words.length - 1; i++) {
    const m = markOfWord(words[i]!)
    if (!m || m.strength === 'avoid') continue
    if (m.strength === 'weak' && !opts.includeWeak) continue
    raw.push(i)
    reasons[i] = STOP_MARKS[m.char]!.name
  }
  // Drop boundaries that would leave a phrase shorter than minWords.
  const boundaries: number[] = []
  let prev = -1
  for (const b of raw) {
    if (b - prev >= minWords && words.length - 1 - b >= minWords) {
      boundaries.push(b)
      prev = b
    } else {
      delete reasons[b]
    }
  }
  return { boundaries, reasons }
}

export interface Phrase {
  index: number
  from: number
  to: number
  words: string[]
  text: string
}

export function buildPhrases(words: string[], boundaries: number[]): Phrase[] {
  const cuts = [...new Set(boundaries)].filter((b) => b >= 0 && b < words.length - 1).sort((a, b) => a - b)
  const out: Phrase[] = []
  let from = 0
  for (const c of [...cuts, words.length - 1]) {
    out.push({ index: out.length, from, to: c, words: words.slice(from, c + 1), text: words.slice(from, c + 1).join(' ') })
    from = c + 1
  }
  return out
}

export interface Rung {
  from: number
  to: number
  kind: 'solo' | 'pair' | 'chain' | 'full'
  label: string
}

/**
 * Overlapping chaining. For phrases A B C D: A→B, B→C, C→D, then A→B→C→D.
 * Longer ayahs (5+ phrases) also grow a chain from the start, so memory of the
 * opening is rebuilt as the ayah lengthens. A phrase of 7+ words gets its own
 * solo warm-up first.
 */
export function buildLadder(phrases: Phrase[]): Rung[] {
  const k = phrases.length
  const name = (a: number, b: number) =>
    a === b ? letter(a) : Array.from({ length: b - a + 1 }, (_, i) => letter(a + i)).join(' → ')
  if (k <= 1) return [{ from: 0, to: 0, kind: 'full', label: 'Whole ayah' }]
  const rungs: Rung[] = []
  phrases.forEach((p, i) => {
    if (p.words.length >= 7) rungs.push({ from: i, to: i, kind: 'solo', label: name(i, i) })
  })
  for (let i = 0; i + 1 < k; i++) {
    const full = k === 2
    rungs.push({ from: i, to: i + 1, kind: full ? 'full' : 'pair', label: name(i, i + 1) })
  }
  if (k >= 3) {
    const start = k >= 5 ? 3 : k
    for (let m = start; m <= k; m++) {
      rungs.push({ from: 0, to: m - 1, kind: m === k ? 'full' : 'chain', label: name(0, m - 1) })
    }
  }
  return rungs
}

const letter = (i: number) => String.fromCharCode(65 + (i % 26))
