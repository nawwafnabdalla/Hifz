// Whole-ayah audio from the SAME recording that the phrase timings describe.
//
// A reciter can have several recordings (EveryAyah, Islamic Network, a whole-surah recording that phrase timings were aligned to). Hearing the
// whole ayah from one and its phrases from another would be two different recitations under one name. So when a reciter has verified timings for an
// ayah, the whole ayah is cut from that same recording (exactly as a phrase is: byte window, decode, cut at real pauses) and handed to the ordinary
// player as an audio file, so speed, repeats, pauses and looping all keep working unchanged. Where that is not possible the ordinary source plays, and
// the player says which source it is (never silently).
import type { LocalAudio } from './offline'
import { offlineAudio } from './offline'
import { phrasePlayer, type Pcm } from './phraseAudio'
import { ayahBytes } from './phraseSource'
import { primeTimings, timingNow, wholeAyahPlayable } from './timings'
import { wordsOfAyah } from '@/lib/quran/data'

const FADE_SEC = 0.006
/** A host that does not answer must not hold the play button hostage: after this long the ordinary source is used (and named). */
const FETCH_TIMEOUT_MS = 8000
const withTimeout = <T>(p: Promise<T>, ms: number) => new Promise<T>((res, rej) => { const id = setTimeout(() => rej(new Error('timed out')), ms); p.then((v) => { clearTimeout(id); res(v) }, (e) => { clearTimeout(id); rej(e) }) })

/** 16-bit mono WAV of samples [startSec, endSec) with short fades so the edges never click. */
export function encodeWav(p: Pcm, startSec: number, endSec: number): Blob {
  const a = Math.max(0, Math.floor(startSec * p.sampleRate)), b = Math.min(p.samples.length, Math.ceil(endSec * p.sampleRate)), n = Math.max(0, b - a)
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf)
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, p.sampleRate, true); v.setUint32(28, p.sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true)
  const fade = Math.round(FADE_SEC * p.sampleRate)
  for (let i = 0; i < n; i++) {
    const g = Math.min(1, i / fade, (n - 1 - i) / fade)
    v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(p.samples[a + i]! * g * 32767))), true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

const hostOf = (url: string | undefined) => { try { return new URL(url ?? '').host } catch { return 'the recording’s host' } }

class RecordingAudio implements LocalAudio {
  private cache = new Map<string, Blob>()
  private used = new Map<string, { via: string; saved: boolean }>()
  private key = (r: string, s: number, a: number) => `${r}|${s}:${a}`

  /** Warm the (small, local) timing data so `has` can answer synchronously when the play button is tapped. */
  prime(reciter: string) { void primeTimings(reciter) }

  private verified(reciter: string, surah: number, ayah: number) {
    const f = timingNow(reciter, surah, ayah)
    return f && wholeAyahPlayable(f.timing) ? f : null
  }
  has(reciter: string, surah: number, ayah: number) { return !!this.verified(reciter, surah, ayah) || offlineAudio.has(reciter, surah, ayah) }

  async blob(reciter: string, surah: number, ayah: number): Promise<Blob | null> {
    const k = this.key(reciter, surah, ayah), f = this.verified(reciter, surah, ayah)
    if (f) {
      const hit = this.cache.get(k)
      const done = (blob: Blob) => { this.used.set(k, { via: `${hostOf(f.rec.provenance.audio?.urls?.[String(surah)] ?? f.rec.provenance.audio?.urlTemplate)} (same recording as the phrases)`, saved: false }); return blob }
      if (hit) return done(hit)
      try {
        const n = wordsOfAyah(surah, ayah).length
        const ctx = new OfflineAudioContext(1, 1, 44100)
        const plan = await withTimeout(phrasePlayer.plan({
          key: `${reciter}|${f.rec.provenance.recording}|${surah}:${ayah}|whole`, timing: f.timing, fromWord: 0, toWord: n - 1, repeat: 1, gapSec: () => 0,
          bytes: (prop) => ayahBytes(reciter, f.rec, surah, ayah, f.timing, prop),
        }, ctx), FETCH_TIMEOUT_MS)
        if (!('reason' in plan)) {
          const blob = encodeWav(plan.decoded.pcm, plan.cut.startSec, plan.cut.endSec)
          this.cache.set(k, blob); while (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value!)
          return done(blob)
        }
      } catch { /* fall through to the ordinary sources */ }
    }
    const saved = await offlineAudio.blob(reciter, surah, ayah)
    if (saved) this.used.set(k, { via: 'Saved on this device', saved: true })
    return saved
  }
  forget(reciter: string, surah: number, ayah: number) { this.cache.delete(this.key(reciter, surah, ayah)); offlineAudio.forget(reciter, surah, ayah) }
  source(reciter: string, surah: number, ayah: number) { return this.used.get(this.key(reciter, surah, ayah)) ?? { via: 'Saved on this device', saved: true } }
}
export const recordingAudio = new RecordingAudio()
