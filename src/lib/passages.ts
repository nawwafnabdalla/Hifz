// Saved recitation passages (for example, a stretch you want ready to recite in salah).
//
// Suggestions are limited to YOUR OWN connected, recently verified stretches: the longest unbroken runs of
// consecutive ayahs that you have recalled and that are still estimated to be well retained. The app never
// picks where a passage "should" start or stop; the edges are simply where your verified memorisation ends.
import { ayahStatus, type Derived } from '@/lib/engine/derive'
import { ayahKey, type Corpus, type Range, type SavedPassage } from '@/lib/engine/types'

export interface Stretch { range: Range; ayahs: number; words: number; minR: number }

export function connectedStretches(derived: Derived, corpus: Corpus, now: number, opts: { minAyahs?: number; minR?: number; limit?: number } = {}): Stretch[] {
  const minAyahs = opts.minAyahs ?? 3
  const minR = opts.minR ?? 0.7
  const out: Stretch[] = []
  for (let s = 1; s <= 114; s++) {
    let start = 0, words = 0, lowest = 1
    const flush = (end: number) => {
      if (start && end - start + 1 >= minAyahs) out.push({ range: { surah: s, start, end }, ayahs: end - start + 1, words, minR: lowest })
      start = 0; words = 0; lowest = 1
    }
    const n = corpus.ayahCount(s)
    for (let a = 1; a <= n; a++) {
      const st = ayahStatus(derived.memory.get(ayahKey(s, a)), derived.flow.get(ayahKey(s, a)), now)
      const ok = st.demonstrated && (st.stage === 'reviewing' || st.stage === 'strong') && st.retrievability >= minR
      if (ok) { if (!start) start = a; words += corpus.wordCount(s, a); lowest = Math.min(lowest, st.retrievability) }
      else flush(a - 1)
    }
    flush(n)
  }
  return out.sort((a, b) => b.words - a.words).slice(0, opts.limit ?? 3)
}

/** A rough reading time at a steady pace (about 100 words a minute). A guide only. */
export const roughMinutes = (words: number) => Math.max(1, Math.round(words / 100))

export interface PassageStatus { verified: boolean; allDemonstrated: boolean; minR: number; oldestSuccessAt: number | null; ayahs: number }
export function passageStatus(range: Range, derived: Derived, now: number): PassageStatus {
  let allDemonstrated = true, verified = true, minR = 1, oldest: number | null = null
  for (let a = range.start; a <= range.end; a++) {
    const m = derived.memory.get(ayahKey(range.surah, a))
    const st = ayahStatus(m, derived.flow.get(ayahKey(range.surah, a)), now)
    if (!st.demonstrated) { allDemonstrated = false; verified = false }
    if (st.stage === 'needs_repair' || st.stage === 'learning') verified = false
    minR = Math.min(minR, st.demonstrated ? st.retrievability : 0)
    if (m?.lastSuccessAt) oldest = oldest === null ? m.lastSuccessAt : Math.min(oldest, m.lastSuccessAt)
    else oldest = null
  }
  return { verified: verified && minR >= 0.7, allDemonstrated, minR, oldestSuccessAt: oldest, ayahs: range.end - range.start + 1 }
}

export const sameRange = (a: Range, b: Range) => a.surah === b.surah && a.start === b.start && a.end === b.end
export const isDuplicate = (list: SavedPassage[], r: Range) => list.some((p) => sameRange(p.range, r))
