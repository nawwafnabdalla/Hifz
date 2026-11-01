// Gets the audio for one phrase range from exactly the recording a timing file describes.
//  * Per-ayah recordings (EveryAyah, Islamic Network): the ayah's own file, from a saved copy if it came from that same recording.
//  * Whole-surah recordings (Quranic Universal Audio's timings are aligned to these): ONLY a window of bytes around the phrase is
//    fetched (an HTTP Range request) and decoded, never the whole surah, so a long surah costs a few hundred kilobytes, not tens of megabytes.
// If the host will not serve the file or the window, phrase audio is simply unavailable for it and the whole-ayah player carries on.
// The app never plays a different recording with another recording's timings.
import { endpointByRecording, offlineEndpoint, recordingId, urlForEndpoint } from './sources'
import { offlineAudio } from './offline'
import type { AyahTiming, RangeProposal, RecordingTimings } from './timings'

/** Audio either side of the phrase, so the decoder has settled before the phrase and a boundary can be snapped to a real pause. */
export const WINDOW_PAD_MS = 1500
/** If a host ignores Range and starts sending the whole file, give up rather than download a surah. */
const MAX_UNRANGED_BYTES = 6 * 1024 * 1024

export interface Bytes {
  data: ArrayBuffer
  /** Where the first sample of `data` sits on the timing's own clock (ms from the start of the ayah). 0 for a per-ayah file. */
  originMs: number
  /** Expected length of `data` once decoded, when known (for window slices). */
  expectMs?: number
}

const pad3 = (n: number) => String(n).padStart(3, '0')

export async function ayahBytes(reciter: string, rec: RecordingTimings, surah: number, ayah: number, timing: AyahTiming, prop: RangeProposal): Promise<Bytes> {
  if ((rec.provenance.granularity ?? 'ayah') === 'surah') return surahWindow(rec, surah, timing, prop)
  const recording = rec.provenance.recording
  const e = endpointByRecording(reciter, recording)
  if (!e) throw new Error('no such recording')
  const saved = offlineEndpoint(reciter)
  if (saved && recordingId(saved) === recording) {
    const blob = await offlineAudio.blob(reciter, surah, ayah)
    if (blob) return { data: await blob.arrayBuffer(), originMs: 0 }
  }
  const res = await fetch(urlForEndpoint(e, surah, ayah), { mode: 'cors', credentials: 'omit' })
  if (!res.ok) throw new Error(`server said ${res.status}`)
  return { data: await res.arrayBuffer(), originMs: 0 }
}

/** The byte window of a constant-bitrate MP3 that covers [fromMs, toMs] of the file. */
export function byteWindow(file: { kbps: number; dataOffset: number; bytes: number }, fromMs: number, toMs: number) {
  const bps = file.kbps * 125                                    // bytes per second
  const start = Math.max(file.dataOffset, file.dataOffset + Math.floor((Math.max(0, fromMs) / 1000) * bps))
  const end = Math.min(file.bytes - 1, file.dataOffset + Math.ceil((toMs / 1000) * bps))
  return { start, end, startMs: ((start - file.dataOffset) / bps) * 1000, expectMs: ((end - start + 1) / bps) * 1000 }
}

async function surahWindow(rec: RecordingTimings, surah: number, timing: AyahTiming, prop: RangeProposal): Promise<Bytes> {
  const audio = rec.provenance.audio, file = audio?.files[String(surah)]
  if (!audio || !file) throw new Error('no audio description for this surah')
  const origin = timing.originMs ?? 0
  const w = byteWindow(file, origin + prop.startMs - WINDOW_PAD_MS, Math.min(file.durationMs, origin + prop.endMs + WINDOW_PAD_MS))
  const ctl = new AbortController()
  const url = audio.urls?.[String(surah)] ?? audio.urlTemplate?.replace('{SSS}', pad3(surah))
  if (!url) throw new Error('no audio address for this surah')
  const res = await fetch(url, { mode: 'cors', credentials: 'omit', headers: { Range: `bytes=${w.start}-${w.end}` }, signal: ctl.signal })
  if (res.status === 200) {                                                  // the host ignored Range
    const len = Number(res.headers.get('content-length') ?? Infinity)
    if (len > MAX_UNRANGED_BYTES) { ctl.abort(); throw new Error('host does not support range requests') }
  } else if (res.status !== 206) throw new Error(`server said ${res.status}`)
  else {
    // The file's total size must be exactly the recording the timings describe, or this is a different edition of it.
    const total = Number(/\/(\d+)\s*$/.exec(res.headers.get('content-range') ?? '')?.[1])
    if (total !== file.bytes) throw new Error(`a different edition of this recording (${total} bytes, expected ${file.bytes})`)
  }
  return { data: await res.arrayBuffer(), originMs: w.startMs - origin, expectMs: w.expectMs }
}
