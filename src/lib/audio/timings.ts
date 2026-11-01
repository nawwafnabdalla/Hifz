// Word-level timings for a specific RECORDING, and how they become the audio range of a phrase.
//
// A timing file describes exactly one recording (a source + folder, e.g. everyayah:Yasser_Ad-Dussary_128kbps). It must never be
// applied to another recording or reciter: encoder delays alone shift positions by tens of milliseconds, and a different reciter
// speaks at different times altogether. So everything here is keyed by the recording, and a mismatch means "no phrase audio",
// never "close enough".
//
// Timings only PROPOSE where a phrase starts and ends. The decoded audio has the final say (see cutPoints in phraseAudio.ts):
// the proposal is snapped to the quietest moment around it, and rejected when the recording has no real dip there.
import { wordsOfAyah } from '@/lib/quran/data'

/** Quran Align / QUL shape: words [w0, w1) are spoken between t0 and t1 milliseconds. w1 is exclusive. */
export interface WordSegment { w0: number; w1: number; t0: number; t1: number }
export interface AyahTiming {
  surah: number
  ayah: number
  /** Length of the aligned audio file. A decoded file whose length differs is a different recording and is refused. */
  durationMs: number
  segments: WordSegment[]
}
export interface TimingProvenance {
  /** Where the timings come from (dataset name and version). */
  source: string
  licence: string
  url: string
  /** What was aligned, e.g. "everyayah:Yasser_Ad-Dussary_128kbps". Must equal the recording being played. */
  recording: string
  method: string
  retrieved: string
}
export interface RecordingTimings { schema: 1; reciter: string; provenance: TimingProvenance; ayahs: Record<string, { d: number; s: [number, number, number, number][] }> }

/** Largest disagreement tolerated between the aligned file's length and the decoded file's length. */
export const DURATION_TOLERANCE_MS = 60
const MAX_GAP_PAD_MS = 150
const TAIL_MS = 160

export type TimingProblem = 'empty' | 'out-of-order' | 'overlap' | 'bad-span' | 'word-out-of-range' | 'past-end' | 'sparse'

/** Structural checks against the canonical text. Returns null when the timing is usable. */
export function validateAyahTiming(t: AyahTiming, wordCount = wordsOfAyah(t.surah, t.ayah).length): TimingProblem | null {
  if (!t.segments.length || !(t.durationMs > 0)) return 'empty'
  let prevEnd = -1, prevW1 = 0, covered = 0
  for (const s of t.segments) {
    if (!(s.t1 > s.t0) || s.t0 < 0 || !(s.w1 > s.w0)) return 'bad-span'
    if (s.w0 < prevW1) return 'out-of-order'
    if (s.t0 < prevEnd - 20) return 'overlap'                    // tiny overlaps happen at word joins; more than that is wrong
    if (s.w1 > wordCount) return 'word-out-of-range'
    if (s.t1 > t.durationMs + DURATION_TOLERANCE_MS) return 'past-end'
    covered += s.w1 - s.w0
    prevEnd = s.t1; prevW1 = s.w1
  }
  return covered / wordCount < 0.85 ? 'sparse' : null
}

export function expand(raw: RecordingTimings['ayahs'][string], surah: number, ayah: number): AyahTiming {
  return { surah, ayah, durationMs: raw.d, segments: raw.s.map(([w0, w1, t0, t1]) => ({ w0, w1, t0, t1 })) }
}

const segmentOf = (t: AyahTiming, word: number) => t.segments.findIndex((s) => word >= s.w0 && word < s.w1)

export interface RangeProposal {
  /** Proposed cut positions in the aligned file, milliseconds. */
  startMs: number
  endMs: number
  /** Where the neighbouring words sit, so the audio can be searched for a real dip between them. */
  startGap: [number, number] | null
  endGap: [number, number] | null
}

/**
 * The audio range for words [from, to] of an ayah, or null when the timings cannot isolate them (a segment that groups several
 * words would have to be cut in the middle, or a boundary word has no timing). Never guesses.
 */
export function proposeRange(t: AyahTiming, from: number, to: number): RangeProposal | null {
  const a = segmentOf(t, from), b = segmentOf(t, to)
  if (a < 0 || b < 0 || a > b) return null
  const sa = t.segments[a]!, sb = t.segments[b]!
  if (sa.w0 !== from || sb.w1 - 1 !== to) return null          // would cut inside a grouped segment
  const prev = t.segments[a - 1], next = t.segments[b + 1]
  // A neighbour with no gap (or a slightly overlapping one) is still a boundary that needs a real pause; only the file's edges do not.
  const startGap: [number, number] | null = prev ? [Math.min(prev.t1, sa.t0), Math.max(prev.t1, sa.t0)] : null
  const endGap: [number, number] | null = next ? [Math.min(sb.t1, next.t0), Math.max(sb.t1, next.t0)] : null
  const startMs = prev ? Math.max((prev.t1 + sa.t0) / 2, sa.t0 - MAX_GAP_PAD_MS) : Math.max(0, sa.t0 - MAX_GAP_PAD_MS)
  const endMs = next ? Math.min((sb.t1 + next.t0) / 2, sb.t1 + TAIL_MS) : Math.min(t.durationMs, sb.t1 + TAIL_MS)
  if (!(endMs > startMs)) return null
  return { startMs, endMs, startGap, endGap }
}

/** The pauses the reciter actually made inside an ayah: gaps between consecutive words, longest first. Used to suggest practice breaks. */
export function reciterPauses(t: AyahTiming): { afterWord: number; ms: number }[] {
  const out: { afterWord: number; ms: number }[] = []
  for (let i = 0; i + 1 < t.segments.length; i++) {
    const s = t.segments[i]!, n = t.segments[i + 1]!
    if (n.w0 === s.w1) out.push({ afterWord: s.w1 - 1, ms: Math.max(0, n.t0 - s.t1) })
  }
  return out.sort((x, y) => y.ms - x.ms)
}

// ---------- registry ----------
// Timing files live in src/data/timings/<reciterId>.json (produced by scripts/import-timings.mjs, with provenance).
// They are loaded lazily and only for the recording they describe. None are bundled until real, validated data exists.
type Loader = () => Promise<{ default: RecordingTimings }>
const files = import.meta.glob('/src/data/timings/*.json') as Record<string, Loader>
const loaded = new Map<string, RecordingTimings | null>()
const injected = new Map<string, RecordingTimings>()

/** Test and tooling hook: register timings without a file. */
export function registerTimings(data: RecordingTimings) { injected.set(data.reciter, data); loaded.set(data.reciter, data) }
export function clearTimings() { injected.clear(); loaded.clear() }
// Test builds only (VITE_E2E=1, set by the browser-test server, never by a real build): let tests supply timings.
if (import.meta.env.VITE_E2E === '1' && typeof window !== 'undefined') (window as unknown as { __hifzRegisterTimings?: typeof registerTimings }).__hifzRegisterTimings = registerTimings

export async function timingsFor(reciter: string): Promise<RecordingTimings | null> {
  if (loaded.has(reciter)) return loaded.get(reciter)!
  const path = Object.keys(files).find((p) => p.endsWith(`/${reciter}.json`))
  let data: RecordingTimings | null = null
  if (path) { try { data = (await files[path]!()).default } catch { data = null } }
  loaded.set(reciter, data)
  return data
}

/** The timing of one ayah, only if it describes the recording that will actually be played. */
export async function ayahTiming(reciter: string, recording: string, surah: number, ayah: number): Promise<AyahTiming | null> {
  const f = await timingsFor(reciter)
  if (!f || f.provenance.recording !== recording) return null
  const raw = f.ayahs[`${surah}:${ayah}`]
  if (!raw) return null
  const t = expand(raw, surah, ayah)
  return validateAyahTiming(t) === null ? t : null
}
/** Is any timing available for this reciter's recording at all? (Cheap check for showing controls.) */
export async function hasTimings(reciter: string, recording: string): Promise<boolean> {
  const f = await timingsFor(reciter)
  return !!f && f.provenance.recording === recording
}
