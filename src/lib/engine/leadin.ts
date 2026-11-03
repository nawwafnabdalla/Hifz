// The run-up into a passage that is revised from memory.
//
// Being asked to recite ayahs 7-9 of a surah with nothing in front of you is "starting cold": it tests whether you can begin at an arbitrary number,
// not whether you can continue reciting. So the ayah just BEFORE the passage is shown, readable, as a lead-in. It is context only: it is never hidden,
// never graded, never recorded, and the learner is not required to have memorised it. A very long preceding ayah shows only its last words.
// At the start of a surah there is no preceding ayah, so the cue is the surah itself (and the Basmala, which every surah except al-Tawbah begins with).
export type LeadIn =
  | { kind: 'ayah'; surah: number; ayah: number; from: number; to: number; truncated: boolean }
  | { kind: 'surah-start'; surah: number; basmala: boolean }

/** A preceding ayah of up to this many words is shown whole; a longer one shows only its last LEAD_TAIL words. */
export const LEAD_FULL_MAX = 18
export const LEAD_TAIL = 14

export function leadInFor(surah: number, start: number, wordCountOf: (surah: number, ayah: number) => number): LeadIn {
  if (start <= 1) return { kind: 'surah-start', surah, basmala: surah !== 1 && surah !== 9 }
  const ayah = start - 1, n = wordCountOf(surah, ayah)
  if (n <= 0) return { kind: 'surah-start', surah, basmala: surah !== 1 && surah !== 9 }       // the preceding ayah is not available: fall back to the surah cue
  return n <= LEAD_FULL_MAX ? { kind: 'ayah', surah, ayah, from: 0, to: n - 1, truncated: false } : { kind: 'ayah', surah, ayah, from: n - LEAD_TAIL, to: n - 1, truncated: true }
}
