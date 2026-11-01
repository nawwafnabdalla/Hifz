// Synthetic "recitation" for testing phrase playback. Every word is a burst with its OWN pitch and a smooth envelope, separated by
// silences of chosen length, so a test can tell exactly which words were audible and when. It is test material only: it proves the
// player and the cutting logic; it says nothing about real recitations, which still need to be checked on real recordings.
export interface SynthWord { ms: number; gapAfterMs: number }
export interface Synth {
  sampleRate: number
  samples: Float32Array
  durationMs: number
  /** Where each word is truly audible (envelope above 5%), in ms. */
  active: { t0: number; t1: number; hz: number }[]
  /** An alignment as a dataset would publish it, [w0, w1, t0, t1] with w1 exclusive. */
  segments: [number, number, number, number][]
  wav: Uint8Array
}

export const wordHz = (i: number) => 330 + i * 97

export function synth(words: SynthWord[], o: { sampleRate?: number; leadMs?: number; tailMs?: number; noise?: number } = {}): Synth {
  const sr = o.sampleRate ?? 22050, lead = o.leadMs ?? 140, tail = o.tailMs ?? 260, noise = o.noise ?? 0.0012
  const total = words.reduce((n, w) => n + w.ms + w.gapAfterMs, 0) + lead + tail
  const n = Math.round((total / 1000) * sr)
  const x = new Float32Array(n)
  let seed = 12345
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5)
  for (let i = 0; i < n; i++) x[i] = rnd() * 2 * noise
  const active: Synth['active'] = [], segments: Synth['segments'] = []
  let t = lead
  const ATT = 22, REL = 45                                       // ms
  words.forEach((w, i) => {
    const hz = wordHz(i)
    const s0 = Math.round((t / 1000) * sr), len = Math.round((w.ms / 1000) * sr)
    for (let k = 0; k < len; k++) {
      const ms = (k / sr) * 1000
      const env = Math.min(1, ms / ATT) * Math.min(1, (w.ms - ms) / REL)
      const e = Math.max(0, env)
      const ph = (2 * Math.PI * hz * k) / sr
      x[s0 + k]! += 0.45 * e * (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph)) / 1.75
    }
    // Active interval: where the envelope is above 5% of its peak.
    active.push({ t0: t + 0.05 * ATT, t1: t + w.ms - 0.05 * REL, hz })
    segments.push([i, i + 1, Math.round(t), Math.round(t + w.ms)])
    t += w.ms + w.gapAfterMs
  })
  const durationMs = (n / sr) * 1000
  return { sampleRate: sr, samples: x, durationMs, active, segments, wav: toWav(x, sr) }
}

export function toWav(x: Float32Array, sr: number): Uint8Array {
  const buf = new Uint8Array(44 + x.length * 2)
  const dv = new DataView(buf.buffer)
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i) }
  w(0, 'RIFF'); dv.setUint32(4, 36 + x.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ')
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true)
  w(36, 'data'); dv.setUint32(40, x.length * 2, true)
  for (let i = 0; i < x.length; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i]!)) * 32767, true)
  return buf
}

/** Energy of `hz` in samples [a, b) (Goertzel). */
export function toneEnergy(x: Float32Array, sr: number, hz: number, a: number, b: number): number {
  const w = (2 * Math.PI * hz) / sr, c = 2 * Math.cos(w)
  let s1 = 0, s2 = 0
  for (let i = Math.max(0, a); i < Math.min(x.length, b); i++) { const s = x[i]! + c * s1 - s2; s2 = s1; s1 = s }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / Math.max(1, b - a)
}

/** A realistic mix of pauses: some long (breaths at stops), some short (words flowing together). */
export const AYAH_WORDS: SynthWord[] = [
  { ms: 260, gapAfterMs: 70 }, { ms: 300, gapAfterMs: 90 }, { ms: 340, gapAfterMs: 380 },   // phrase A, then a breath
  { ms: 280, gapAfterMs: 80 }, { ms: 320, gapAfterMs: 100 }, { ms: 360, gapAfterMs: 420 },  // phrase B, then a breath
  { ms: 300, gapAfterMs: 90 }, { ms: 330, gapAfterMs: 85 }, { ms: 380, gapAfterMs: 0 },     // phrase C
]

// ---------- a synthetic WHOLE-SURAH recording as a real constant-bitrate MP3 ----------
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface SurahMp3 {
  mp3: Buffer
  file: { bytes: number; kbps: number; dataOffset: number; durationMs: number }
  /** Where the timed ayah begins inside the file, ms, and the ayah's own synthetic recitation. */
  originMs: number
  ayah: Synth
}
/** [other ayahs] + the ayah under test, separated by pauses, encoded as CBR MP3 the way a real surah file is (ID3 tag + Xing/Info frame by default). */
export async function makeSurahMp3(ayah: SynthWord[], o: { id3?: boolean; kbps?: number; leadMs?: number } = {}): Promise<SurahMp3> {
  const sr = 44100, kbps = o.kbps ?? 128, lead = o.leadMs ?? 7300
  const before = synth([{ ms: 300, gapAfterMs: 90 }, { ms: 340, gapAfterMs: 90 }, { ms: 320, gapAfterMs: 0 }].map((w) => ({ ...w })), { sampleRate: sr, leadMs: 200, tailMs: 600 })
  const target = synth(ayah, { sampleRate: sr })
  const after = synth([{ ms: 300, gapAfterMs: 90 }, { ms: 360, gapAfterMs: 0 }], { sampleRate: sr, leadMs: 400, tailMs: 900 })
  const n = (ms: number) => Math.round((ms / 1000) * sr)
  const total = n(lead) + before.samples.length + target.samples.length + after.samples.length
  const pcm = new Float32Array(total)
  let seed = 99; for (let i = 0; i < total; i++) pcm[i] = (((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5) * 0.0024
  let at = n(lead)
  pcm.set(before.samples, at); at += before.samples.length
  const originSamples = at
  pcm.set(target.samples, at); at += target.samples.length
  pcm.set(after.samples, at)
  const dir = mkdtempSync(join(tmpdir(), 'surah-'))
  writeFileSync(join(dir, 'in.wav'), toWav(pcm, sr))
  const args = ['-v', 'error', '-y', '-i', join(dir, 'in.wav'), '-codec:a', 'libmp3lame', '-b:a', `${kbps}k`, '-ac', '1', '-ar', String(sr)]
  if (o.id3 === false) args.push('-write_xing', '0', '-id3v2_version', '0')
  execFileSync('ffmpeg', [...args, join(dir, 'out.mp3')])
  const mp3 = readFileSync(join(dir, 'out.mp3'))
  const probe = (a: string[]) => execFileSync('ffprobe', ['-v', 'error', ...a, join(dir, 'out.mp3')], { encoding: 'utf8' }).trim()
  // @ts-expect-error plain ES module shared with the import script
  const { inspectMp3 } = await import('../scripts/lib/mp3.mjs')
  const dataOffset = (inspectMp3(mp3) as { dataOffset: number }).dataOffset
  const durationMs = Math.round(parseFloat(probe(['-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1'])) * 1000)
  return { mp3, file: { bytes: mp3.length, kbps, dataOffset, durationMs }, originMs: Math.round((originSamples / sr) * 1000), ayah: target }
}
