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
  /** Where this ayah begins inside its audio file. 0 for per-ayah recordings; the ayah's start in a whole-surah recording. */
  originMs?: number
  /** Length of the aligned audio file. A decoded file whose length differs is a different recording and is refused. */
  durationMs: number
  segments: WordSegment[]
  /** Segment indexes i where the recitation is not continuous between segment i-1 and i (an abandoned take was dropped between them). No phrase may span one. */
  seams?: number[]
}
export interface TimingProvenance {
  /** Where the timings come from (dataset name and version). */
  source: string
  licence: string
  url: string
  /** What was aligned, e.g. "everyayah:Yasser_Ad-Dussary_128kbps" or "mp3quran:maher". Must equal the recording being played. */
  recording: string
  method: string
  retrieved: string
  /** 'ayah' (default): one audio file per ayah. 'surah': one file per surah; ayah times below are relative to the ayah's own start. */
  granularity?: 'ayah' | 'surah'
  /** Riwayah of the recitation and of the text the timings were aligned to. Only Hafs 'an 'Asim matches the app's text. */
  riwayah?: string
  /** For 'surah' recordings: where the audio comes from and how to cut a window out of it by bytes. */
  audio?: { /** `{SSS}` template, or an explicit URL per surah (catalogues list one per chapter) */ urlTemplate?: string; urls?: Record<string, string>; files: Record<string, { bytes: number; kbps: number; dataOffset: number; durationMs: number }> }
}
export interface RecordingTimings { schema: 1; reciter: string; provenance: TimingProvenance; ayahs: Record<string, { d: number; s: [number, number, number, number][]; /** seams: see AyahTiming */ x?: number[]; /** start of the ayah in its file (surah recordings) */ o?: number }> }

/** Largest disagreement tolerated between the aligned file's length and the decoded file's length. */
export const DURATION_TOLERANCE_MS = 60
const MAX_GAP_PAD_MS = 150
const TAIL_MS = 160
/** A gap wider than this is a breath or waqf: the cut is made within NEAR_WORD_MS of the word that borders it, not in the middle of the silence. */
const WIDE_GAP_MS = 500
const NEAR_WORD_MS = 400
/** Safety net only: real pauses between words (breath, waqf) reach ~2 s; anything much longer inside one phrase is not a pause. Known seams are recorded explicitly (AyahTiming.seams). */
export const MAX_INNER_GAP_MS = 4000

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
  return { surah, ayah, durationMs: raw.d, originMs: raw.o ?? 0, segments: raw.s.map(([w0, w1, t0, t1]) => ({ w0, w1, t0, t1 })), ...(raw.x?.length ? { seams: raw.x } : {}) }
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
  for (let i = a + 1; i <= b; i++) if (t.segments[i]!.t0 - t.segments[i - 1]!.t1 > MAX_INNER_GAP_MS || t.seams?.includes(i)) return null
  const prev = t.segments[a - 1], next = t.segments[b + 1]
  // A neighbour with no gap (or a slightly overlapping one) is still a boundary that needs a real pause; only the file's edges do not.
  // Two cases make the neighbour's own edge the wrong place to look:
  //  - a SEAM (an abandoned take was dropped between the two segments): the neighbour's silence is not next to this phrase, and the abandoned
  //    attempt may start right after the phrase's last word with no pause at all (real recordings show this). The cut is therefore only allowed
  //    at a genuine pause within NEAR_WORD_MS of the phrase's own word; if there is none the phrase is refused rather than cut through speech;
  //  - a WIDE gap (a long breath / waqf): the middle of the gap is a second or more of silence, so the cut is made close to the phrase's own word.
  const seamBefore = !!t.seams?.includes(a), seamAfter = !!t.seams?.includes(b + 1)
  const near = (lo: number, hi: number): [number, number] => [Math.min(lo, hi), Math.max(lo, hi)]
  const narrow = (g: [number, number], edge: 'start' | 'end'): [number, number] => (g[1] - g[0] > WIDE_GAP_MS ? (edge === 'end' ? [g[0], g[0] + NEAR_WORD_MS] : [g[1] - NEAR_WORD_MS, g[1]]) : g)
  const startGap: [number, number] | null = seamBefore ? [sa.t0 - NEAR_WORD_MS, sa.t0] : prev ? narrow(near(prev.t1, sa.t0), 'start') : null
  const endGap: [number, number] | null = seamAfter ? [sb.t1, sb.t1 + NEAR_WORD_MS] : next ? narrow(near(sb.t1, next.t0), 'end') : null
  const startMs = prev && !seamBefore ? Math.max((prev.t1 + sa.t0) / 2, sa.t0 - MAX_GAP_PAD_MS) : Math.max(0, sa.t0 - MAX_GAP_PAD_MS)
  const endMs = next && !seamAfter ? Math.min((sb.t1 + next.t0) / 2, sb.t1 + TAIL_MS) : Math.min(t.durationMs, sb.t1 + TAIL_MS)
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
// Timing files live in src/data/timings/<reciterId>--<recording>.json (produced by scripts/import-timings.mjs, with provenance).
// One reciter may have several recordings; each file describes exactly one and is never applied to another. Lazy-loaded.
type Loader = () => Promise<{ default: RecordingTimings }>
const files = import.meta.glob('/src/data/timings/*.json') as Record<string, Loader>
const loaded = new Map<string, RecordingTimings[]>()
const injected = new Map<string, RecordingTimings[]>()

/** Test and tooling hook: register timings without a file. A second registration of the same recording replaces the first. */
export function registerTimings(data: RecordingTimings) {
  const list = (injected.get(data.reciter) ?? []).filter((x) => x.provenance.recording !== data.provenance.recording)
  injected.set(data.reciter, [...list, data]); loaded.delete(data.reciter)
}
export function clearTimings() { injected.clear(); loaded.clear() }
// Test builds only (VITE_E2E=1, set by the browser-test server, never by a real build): let tests supply timings.
if (import.meta.env.VITE_E2E === '1' && typeof window !== 'undefined') (window as unknown as { __hifzRegisterTimings?: typeof registerTimings }).__hifzRegisterTimings = registerTimings

/** Every recording that has word timings for this reciter (and, by construction, the app's own riwayah). */
export async function recordingsFor(reciter: string): Promise<RecordingTimings[]> {
  const hit = loaded.get(reciter)
  if (hit) return hit
  const out: RecordingTimings[] = [...(injected.get(reciter) ?? [])]
  for (const path of Object.keys(files)) {
    const name = path.split('/').pop()!.replace(/\.json$/, '')
    if (name !== reciter && !name.startsWith(`${reciter}--`)) continue
    try { const d = (await files[path]!()).default; if (d.reciter === reciter && (d.provenance.riwayah ?? 'hafs') === 'hafs') out.push(d) } catch { /* unreadable file: ignored */ }
  }
  loaded.set(reciter, out)
  return out
}
/** Back-compat: the first recording's timings. */
export async function timingsFor(reciter: string): Promise<RecordingTimings | null> { return (await recordingsFor(reciter))[0] ?? null }

/** The timing of one ayah, only if it describes the recording that will actually be played. */
export async function ayahTiming(reciter: string, recording: string, surah: number, ayah: number): Promise<AyahTiming | null> {
  const f = (await recordingsFor(reciter)).find((x) => x.provenance.recording === recording)
  const raw = f?.ayahs[`${surah}:${ayah}`]
  if (!f || !raw) return null
  const t = expand(raw, surah, ayah)
  return validateAyahTiming(t) === null ? t : null
}
/** Is any timing available for this reciter's recording at all? (Cheap check for showing controls.) */
export async function hasTimings(reciter: string, recording: string): Promise<boolean> {
  return (await recordingsFor(reciter)).some((x) => x.provenance.recording === recording)
}
/**
 * Which recording to use for an ayah: the reciter's per-ayah recordings first (cheapest to fetch), then whole-surah ones.
 * Returns the timing together with the file that describes it, so audio is always taken from exactly that recording.
 */
export async function findTiming(reciter: string, surah: number, ayah: number): Promise<{ timing: AyahTiming; rec: RecordingTimings } | null> {
  const recs = (await recordingsFor(reciter)).slice().sort((a, b) => ((a.provenance.granularity ?? 'ayah') === 'ayah' ? 0 : 1) - ((b.provenance.granularity ?? 'ayah') === 'ayah' ? 0 : 1))
  for (const rec of recs) { const timing = await ayahTiming(reciter, rec.provenance.recording, surah, ayah); if (timing) return { timing, rec } }
  return null
}
