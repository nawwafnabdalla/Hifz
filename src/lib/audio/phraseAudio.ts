// Phrase-only playback: cut an ayah's recording at the moments it is actually quiet, and play exactly that range.
//
// Design decisions (and why):
//  * Web Audio buffers, not <audio> seeking. An <audio> element reports time in ~250 ms steps and stops "about" where asked, which
//    clips or spills words. A decoded buffer lets us schedule start, stop and every repeat on the audio clock, sample-accurately
//    and gaplessly, and lets us look at the actual samples before cutting.
//  * Word timings only PROPOSE the cut. The audio disposes: each boundary is snapped to the quietest frame near the proposal,
//    and a boundary with no real dip (the words run together, or the timing is off) is refused, so that part falls back to whole-ayah
//    playback instead of cutting a word in half.
//  * One decoded ayah is a few MB; a few are kept for fast repeats.
import { proposeRange, DURATION_TOLERANCE_MS, type AyahTiming, type RangeProposal } from './timings'
import type { Bytes } from './phraseSource'

export interface Pcm { sampleRate: number; samples: Float32Array }

const HOP_MS = 5
const WIN_MS = 10
/** How far from the proposed boundary to look for the quiet moment (published alignments drift by roughly this much). */
const SNAP_MS = 110
const FADE_SEC = 0.006
/** A window cut out of a whole-surah file may decode up to this much shorter or longer than its bytes imply (first-frame priming, frame rounding). */
export const SLICE_TOLERANCE_MS = 120

export interface Frames { rms: Float32Array; hopSec: number }
export function frameRms(p: Pcm): Frames {
  const hop = Math.max(1, Math.round((p.sampleRate * HOP_MS) / 1000)), win = Math.max(hop, Math.round((p.sampleRate * WIN_MS) / 1000))
  const n = Math.max(0, Math.floor((p.samples.length - win) / hop) + 1)
  const rms = new Float32Array(n)
  for (let f = 0; f < n; f++) {
    let s = 0
    const o = f * hop
    for (let i = 0; i < win; i++) { const v = p.samples[o + i]!; s += v * v }
    rms[f] = Math.sqrt(s / win)
  }
  return { rms, hopSec: hop / p.sampleRate }
}

/** Typical level of the recitation itself (not the silences), used to judge how deep a pause really is. */
export function speechLevel(fr: Frames): number {
  let max = 0
  for (const v of fr.rms) if (v > max) max = v
  const active = Array.from(fr.rms).filter((v) => v > max * 0.2).sort((a, b) => a - b)
  return active.length ? active[Math.floor(active.length * 0.6)]! : max
}

const frameAt = (fr: Frames, sec: number) => Math.min(fr.rms.length - 1, Math.max(0, Math.round(sec / fr.hopSec)))

/** Level below which audio counts as a pause (a quarter of the speech level). */
const QUIET_FRAC = 0.25
/** A pause must last at least this long. A dip inside a word (a closure, a transition) is much shorter and is never a place to cut. */
export const MIN_QUIET_MS = 30

/**
 * The genuine pause nearest `aroundSec` within [loSec, hiSec]: a run of at least MIN_QUIET_MS below a quarter of the speech level.
 * Returns the middle of that run and how deep it is (0 = silence … 1 = as loud as speech). null when no real pause lies in the window.
 */
export function quietRunNear(fr: Frames, loSec: number, hiSec: number, ref: number, aroundSec: number): { sec: number; dip: number; ms: number } | null {
  if (!fr.rms.length || !(ref > 0)) return null
  const a = frameAt(fr, loSec), b = frameAt(fr, hiSec)
  if (b < a) return null
  const limit = ref * QUIET_FRAC
  let best: { sec: number; dip: number; ms: number; d: number } | null = null
  let f = a
  while (f <= b) {
    if (fr.rms[f]! > limit) { f++; continue }
    let g = f, min = fr.rms[f]!
    while (g + 1 <= b && fr.rms[g + 1]! <= limit) { g++; if (fr.rms[g]! < min) min = fr.rms[g]! }
    const ms = (g - f + 1) * fr.hopSec * 1000 + WIN_MS
    if (ms >= MIN_QUIET_MS) {
      const sec = ((f + g) / 2) * fr.hopSec + WIN_MS / 2000
      const d = Math.abs(sec - aroundSec)
      if (!best || d < best.d) best = { sec, dip: min / ref, ms, d }
    }
    f = g + 1
  }
  return best ? { sec: best.sec, dip: best.dip, ms: best.ms } : null
}

export interface Cut { startSec: number; endSec: number; /** Depth of the shallowest pause used (0 deep … 1 none). 0 when the range touches the file edges only. */ dip: number }

/**
 * The cut points for a proposed range, or null if the recording has no genuine pause at a boundary that needs one.
 * Boundaries against the start/end of the file just avoid clipping the first onset and the last decay.
 */
export function cutPoints(p: Pcm, prop: RangeProposal, durationSec = p.samples.length / p.sampleRate): Cut | null {
  const fr = frameRms(p)
  const ref = speechLevel(fr)
  if (!(ref > 0)) return null
  const snap = SNAP_MS / 1000
  let dip = 0
  let startSec: number, endSec: number

  if (prop.startGap) {
    const mid = (prop.startGap[0] + prop.startGap[1]) / 2000
    const q = quietRunNear(fr, prop.startGap[0] / 1000 - snap, prop.startGap[1] / 1000 + snap, ref, mid)
    if (!q) return null
    startSec = q.sec; dip = Math.max(dip, q.dip)
  } else {
    const q = quietRunNear(fr, Math.max(0, prop.startMs / 1000 - snap), prop.startMs / 1000 + 0.02, ref, prop.startMs / 1000)
    startSec = q ? q.sec : Math.max(0, prop.startMs / 1000 - 0.05)
  }
  if (prop.endGap) {
    const mid = (prop.endGap[0] + prop.endGap[1]) / 2000
    const q = quietRunNear(fr, prop.endGap[0] / 1000 - snap, prop.endGap[1] / 1000 + snap, ref, mid)
    if (!q) return null
    endSec = q.sec; dip = Math.max(dip, q.dip)
  } else {
    // End of the ayah: keep the whole decay of the last word.
    let last = frameAt(fr, Math.min(durationSec, prop.endMs / 1000 + snap))
    while (last > 0 && fr.rms[last]! < ref * 0.12) last--
    endSec = Math.min(durationSec, last * fr.hopSec + WIN_MS / 1000 + 0.06)
  }
  if (!(endSec - startSec > 0.15)) return null
  return { startSec, endSec, dip }
}

/** Mono mix of an AudioBuffer-like object. */
export function toMono(b: { numberOfChannels: number; length: number; getChannelData(c: number): Float32Array }): Float32Array {
  if (b.numberOfChannels === 1) return b.getChannelData(0)
  const out = new Float32Array(b.length)
  for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < b.length; i++) out[i]! += d[i]! / b.numberOfChannels }
  return out
}

/** The decoded file must be the recording the timings describe: same length, within a few milliseconds. */
export const sameRecording = (timing: AyahTiming, decodedSec: number) => Math.abs(timing.durationMs - decodedSec * 1000) <= DURATION_TOLERANCE_MS

export interface RangeRequest {
  /** Identity used for caching decoded audio: reciter + recording + ayah. */
  key: string
  timing: AyahTiming
  fromWord: number
  toWord: number
  repeat: number
  /** Silence between repeats, given the length of the phrase in seconds (0 for none, or a multiple of it for "your turn"). */
  gapSec: (phraseSec: number) => number
  /** The audio for this range: the whole ayah file, or (whole-surah recordings) just a window around the phrase. */
  bytes: (prop: RangeProposal) => Promise<Bytes>
}
export type PhraseStatus = 'idle' | 'loading' | 'playing' | 'unavailable'
export interface PhraseState { status: PhraseStatus; repeat: number; total: number; phrase: 'listen' | 'recite'; reason?: string; phraseSec?: number }
export type UnavailableReason = 'no-audio' | 'wrong-recording' | 'no-range' | 'no-pause'

interface Decoded { buffer: AudioBuffer; pcm: Pcm; /** where this buffer starts on the timing's clock, ms */ originMs: number }

export class PhrasePlayer {
  private ctx: AudioContext | null = null
  private cache = new Map<string, Decoded>()
  private nodes: { src: AudioBufferSourceNode; gain: GainNode }[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private token = 0
  private listeners = new Set<(s: PhraseState) => void>()
  state: PhraseState = { status: 'idle', repeat: 0, total: 0, phrase: 'listen' }
  /** Test hook: every audible output passes through this node when set. */
  tap: AudioNode | null = null

  subscribe(fn: (s: PhraseState) => void) { this.listeners.add(fn); fn(this.state); return () => { this.listeners.delete(fn) } }
  private set(p: Partial<PhraseState>) { this.state = { ...this.state, ...p }; for (const l of this.listeners) l(this.state) }
  get context() { return this.ctx }

  /** Must run inside the tap that starts playback (iOS only starts audio from a user gesture). */
  ensureContext(): AudioContext { return this.unlock() }
  private unlock(): AudioContext {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new AC()
      try { (navigator as unknown as { audioSession?: { type: string } }).audioSession && ((navigator as unknown as { audioSession: { type: string } }).audioSession.type = 'playback') } catch { /* Safari 16.4+ only */ }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  private async decoded(req: RangeRequest, ctx: AudioContext, prop: RangeProposal): Promise<Decoded | null> {
    const hit = this.cache.get(req.key)
    if (hit) { this.cache.delete(req.key); this.cache.set(req.key, hit); return hit }
    const got = await req.bytes(prop)
    const buffer = await ctx.decodeAudioData(got.data.slice(0))
    // It must be the recording the timings describe: a whole per-ayah file of the same length, or a window of the length its bytes imply.
    const ok = got.expectMs === undefined ? sameRecording(req.timing, buffer.duration) : Math.abs(buffer.duration * 1000 - got.expectMs) <= SLICE_TOLERANCE_MS
    if (!ok) return null
    const d = { buffer, pcm: { sampleRate: buffer.sampleRate, samples: toMono(buffer) }, originMs: got.originMs }
    this.cache.set(req.key, d)
    while (this.cache.size > 5) this.cache.delete(this.cache.keys().next().value!)
    return d
  }

  /** Decide the exact cut for a range without playing it (also used to test accuracy). */
  async plan(req: RangeRequest, ctx: BaseAudioContext = this.unlock()): Promise<{ cut: Cut; decoded: Decoded } | { reason: UnavailableReason }> {
    const prop = proposeRange(req.timing, req.fromWord, req.toWord)
    if (!prop) return { reason: 'no-range' }
    let d: Decoded | null
    try { d = await this.decoded(req, ctx as AudioContext, prop) } catch { return { reason: 'no-audio' } }
    if (!d) return { reason: 'wrong-recording' }
    // The proposal is on the ayah's clock; the decoded buffer may start part-way in (a window of a whole-surah file).
    const o = d.originMs, local: RangeProposal = { startMs: prop.startMs - o, endMs: prop.endMs - o, startGap: prop.startGap && [prop.startGap[0] - o, prop.startGap[1] - o], endGap: prop.endGap && [prop.endGap[0] - o, prop.endGap[1] - o] }
    if (local.startMs < 0 || local.endMs > d.buffer.duration * 1000 + 50) return { reason: 'no-audio' }
    const cut = cutPoints(d.pcm, local, d.buffer.duration)
    if (!cut) return { reason: 'no-pause' }
    return { cut, decoded: d }
  }

  async play(req: RangeRequest): Promise<UnavailableReason | null> {
    const ctx = this.unlock()                       // synchronous: still inside the tap
    this.stop()
    const my = ++this.token
    this.set({ status: 'loading', repeat: 0, total: req.repeat, phrase: 'listen', reason: undefined })
    const plan = await this.plan(req, ctx)
    if (my !== this.token) return null
    if ('reason' in plan) { this.set({ status: 'unavailable', reason: plan.reason }); return plan.reason }
    const { cut, decoded } = plan
    const len = cut.endSec - cut.startSec
    const gap = Math.max(0, req.gapSec(len))
    const t0 = ctx.currentTime + 0.06
    this.set({ status: 'playing', phraseSec: len })
    for (let r = 0; r < req.repeat; r++) {
      const at = t0 + r * (len + gap)
      const src = ctx.createBufferSource(); src.buffer = decoded.buffer
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + FADE_SEC)
      g.gain.setValueAtTime(1, at + len - FADE_SEC); g.gain.linearRampToValueAtTime(0, at + len)
      src.connect(g); g.connect(ctx.destination); if (this.tap) g.connect(this.tap)
      src.start(at, cut.startSec, len)               // the audio clock stops it: no timers, no overshoot
      this.nodes.push({ src, gain: g })
    }
    // UI state follows the audio clock loosely; accuracy never depends on it.
    const tick = () => {
      if (my !== this.token) return
      const elapsed = ctx.currentTime - t0
      const per = len + gap
      const r = Math.min(req.repeat - 1, Math.max(0, Math.floor(elapsed / per)))
      const inPhrase = elapsed - r * per < len
      if (elapsed >= (req.repeat - 1) * per + len) { this.set({ status: 'idle', repeat: req.repeat, phrase: 'listen' }); this.nodes = []; return }
      this.set({ repeat: r + 1, phrase: inPhrase ? 'listen' : 'recite' })
      this.timer = setTimeout(tick, 80)
    }
    tick()
    return null
  }

  stop() {
    this.token++
    if (this.timer) clearTimeout(this.timer)
    for (const n of this.nodes) { try { n.src.stop() } catch { /* already ended */ } try { n.src.disconnect(); n.gain.disconnect() } catch { /* ignore */ } }
    this.nodes = []
    if (this.state.status !== 'idle') this.set({ status: 'idle', phrase: 'listen' })
  }
}

export const phrasePlayer = new PhrasePlayer()
// Test builds only: lets browser tests listen to what is really played.
if (import.meta.env.VITE_E2E === '1' && typeof window !== 'undefined') (window as unknown as { __hifzPhrasePlayer?: PhrasePlayer }).__hifzPhrasePlayer = phrasePlayer
