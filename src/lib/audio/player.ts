// Per-ayah audio player: queue, per-ayah and whole-passage repetition, playback rate, candidate fallback
// within the SAME reciter, explicit errors, and an optional "echo" pattern (listen, then a silence for you
// to recite, then continue). The audio element is injected so the state machine is testable without a browser.
//
// Never substitutes a different reciter: it only walks the selected reciter's own candidates. If none
// load, it reports `unavailable` and lets the UI decide what to offer, visibly.
//
// Echo silences are real audio (a generated silent clip), not timers. Media playback keeps running when
// an iPhone locks, but JS timers are frozen; driving the gap from the clip's `ended` event is designed to
// survive that. (Designed for it; not verified on a locked iPhone from the build environment.)
import { candidateUrls, hasAyahCandidates, reciterById } from './sources'
import { recordConfirmed, recordUnavailable } from './status'
import type { LocalAudio } from './offline'
import type { AyahRef } from '@/lib/engine/types'

export interface AudioLike extends EventTarget {
  src: string
  playbackRate: number
  preservesPitch?: boolean
  preload?: string
  currentTime: number
  duration?: number
  play(): Promise<void>
  pause(): void
  load?(): void
  removeAttribute?(name: string): void
}

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'
export interface PlayerState {
  status: PlayerStatus
  current: AyahRef | null
  index: number
  ayahRepeat: number
  passageRepeat: number
  error: string | null
  /** True when the selected reciter has no usable verse-by-verse audio for this ayah. */
  unavailable: boolean
  /** Which host is serving the current ayah. */
  via: string | null
  /** True while the current ayah is playing from the copy saved on this device. */
  saved: boolean
  rate: number
  reciterId: string
  /** Number of ayah playbacks that ran to the end since the queue was loaded. */
  plays: number
  /** 'recite' while the silence is running (or waiting for a tap) in echo mode. */
  phase: 'listen' | 'recite'
  /** Echo with an open-ended pause: waiting for the user to tap Continue. */
  waiting: boolean
  /** Length of the current silence in seconds (0 when waiting for a tap). */
  silenceSeconds: number
}
export interface QueueOptions {
  reciterId: string
  repeatEach: number
  /** Number of passes over the queue; 'infinite' loops until stopped. */
  repeatPassage: number | 'infinite'
  rate: number
  gapMs?: number
  /** Echo: leave a silence after each playback. Multiple of that clip's own length; 0 = wait for a tap; undefined = off. */
  echoPause?: 0 | 1 | 1.5 | 2
}

const LOAD_TIMEOUT_MS = 12_000
const MIN_SILENCE = 1.5
const MAX_SILENCE = 60

const silentCache = new Map<number, string>()
/** A silent mono 8-bit 8 kHz WAV of the given whole seconds, as an object URL. */
export function silentClipUrl(seconds: number): string {
  const s = Math.max(1, Math.min(MAX_SILENCE, Math.round(seconds)))
  const hit = silentCache.get(s)
  if (hit) return hit
  const rate = 8000
  const n = rate * s
  const buf = new Uint8Array(44 + n)
  const dv = new DataView(buf.buffer)
  const ascii = (o: number, str: string) => { for (let i = 0; i < str.length; i++) buf[o + i] = str.charCodeAt(i) }
  ascii(0, 'RIFF'); dv.setUint32(4, 36 + n, true); ascii(8, 'WAVE'); ascii(12, 'fmt ')
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true); dv.setUint32(28, rate, true)
  dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); ascii(36, 'data'); dv.setUint32(40, n, true)
  buf.fill(128, 44)
  const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
  silentCache.set(s, url)
  return url
}

/** Seconds of silence for an echo pause, from the real length of the clip that just played. */
export function silenceFor(clipSeconds: number | undefined, factor: number): number | null {
  if (!clipSeconds || !Number.isFinite(clipSeconds) || clipSeconds <= 0) return null
  return Math.max(MIN_SILENCE, Math.min(MAX_SILENCE, clipSeconds * factor))
}

export class AyahPlayer {
  private audio: AudioLike
  private queue: AyahRef[] = []
  private opts: QueueOptions = { reciterId: 'alafasy', repeatEach: 1, repeatPassage: 1, rate: 1 }
  private urlIdx = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private gapTimer: ReturnType<typeof setTimeout> | null = null
  private listeners = new Set<(s: PlayerState) => void>()
  private token = 0
  private silent = false
  private localTried = false
  private playingLocal = false
  private objectUrl: string | null = null
  state: PlayerState = {
    status: 'idle', current: null, index: 0, ayahRepeat: 0, passageRepeat: 0, error: null, unavailable: false, via: null, saved: false, rate: 1,
    reciterId: 'alafasy', plays: 0, phase: 'listen', waiting: false, silenceSeconds: 0,
  }

  constructor(audio: AudioLike, private local?: LocalAudio) {
    this.audio = audio
    audio.preload = 'auto'
    audio.addEventListener('ended', () => this.onEnded())
    audio.addEventListener('error', () => this.onError('The audio file could not be loaded.'))
    audio.addEventListener('canplay', () => this.onCanPlay())
    audio.addEventListener('playing', () => {
      this.clearTimer()
      this.set({ status: 'playing', error: null, unavailable: false })
      if (!this.silent && !this.playingLocal && this.state.current && this.state.via) recordConfirmed(this.opts.reciterId, this.state.via)
    })
    audio.addEventListener('waiting', () => { if (this.state.status === 'playing') this.set({ status: 'loading' }) })
  }

  subscribe(fn: (s: PlayerState) => void): () => void {
    this.listeners.add(fn)
    fn(this.state)
    return () => this.listeners.delete(fn)
  }
  private set(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l(this.state)
  }
  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null }

  /** Start playing a queue of ayahs. Must be called from a user gesture on iOS. */
  load(queue: AyahRef[], opts: Partial<QueueOptions> = {}): void {
    this.stop()
    this.queue = queue
    this.opts = { ...this.opts, ...opts }
    this.set({ reciterId: this.opts.reciterId, rate: this.opts.rate, index: 0, ayahRepeat: 0, passageRepeat: 0, error: null, unavailable: false, plays: 0, phase: 'listen', waiting: false, silenceSeconds: 0 })
    if (queue.length) this.startAyah(0)
  }

  private startAyah(index: number) {
    const ref = this.queue[index]
    if (!ref) return this.finish()
    this.token++
    this.urlIdx = 0
    this.localTried = false
    this.silent = false
    this.set({ current: ref, index, status: 'loading', error: null, unavailable: false, phase: 'listen', waiting: false })
    this.tryUrl()
  }

  private tryUrl() {
    const ref = this.state.current
    if (!ref) return
    const reciter = reciterById(this.opts.reciterId)
    // A copy saved on this device always comes first, so practice works offline and costs no data.
    if (!this.localTried && this.local?.has(this.opts.reciterId, ref.surah, ref.ayah)) { this.localTried = true; void this.tryLocal(ref); return }
    this.playingLocal = false
    if (!hasAyahCandidates(this.opts.reciterId)) {
      this.set({ status: 'error', unavailable: true, via: null, error: `${reciter.name} has no verse-by-verse recording available here.` })
      return
    }
    const cands = candidateUrls(this.opts.reciterId, ref.surah, ref.ayah)
    const cand = cands[this.urlIdx]
    if (!cand && typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.set({ status: 'error', unavailable: false, via: null, saved: false, error: `You’re offline, and ${reciter.name} isn’t saved on this device for ayah ${ref.ayah}.` })
      return
    }
    if (!cand) {
      recordUnavailable(this.opts.reciterId)
      this.set({ status: 'error', unavailable: true, via: null, error: `Couldn’t load ${reciter.name} for ${ref.surah}:${ref.ayah}. Check your connection, or choose another reciter.` })
      return
    }
    this.clearTimer()
    this.silent = false
    this.audio.src = cand.url
    this.audio.playbackRate = this.opts.rate
    if ('preservesPitch' in this.audio) this.audio.preservesPitch = true
    this.set({ via: cand.source, saved: false })
    const myToken = this.token
    const myIdx = this.urlIdx
    this.timer = setTimeout(() => {
      if (myToken === this.token && myIdx === this.urlIdx && this.state.status === 'loading') this.onError('Timed out waiting for audio.')
    }, LOAD_TIMEOUT_MS)
    this.audio.play().catch((e: unknown) => {
      // Autoplay policy rejections are not file errors; surface them as a gentle prompt.
      if (e instanceof Error && e.name === 'NotAllowedError') { this.set({ status: 'paused', error: 'Tap play to start audio.' }); return }
      if (myToken === this.token && myIdx === this.urlIdx) this.onError(e instanceof Error ? e.message : 'Playback failed.')
    })
  }

  private async tryLocal(ref: AyahRef) {
    const myToken = this.token
    const blob = await this.local!.blob(this.opts.reciterId, ref.surah, ref.ayah)
    if (myToken !== this.token) return
    if (!blob) { this.tryUrl(); return }                 // evicted or unreadable: quietly use the network instead
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
    this.objectUrl = URL.createObjectURL(blob)
    this.clearTimer()
    this.silent = false
    this.playingLocal = true
    this.audio.src = this.objectUrl
    this.audio.playbackRate = this.opts.rate
    if ('preservesPitch' in this.audio) this.audio.preservesPitch = true
    this.set({ via: 'Saved on this device', saved: true })
    this.timer = setTimeout(() => { if (myToken === this.token && this.state.status === 'loading') this.onError('Timed out reading saved audio.') }, LOAD_TIMEOUT_MS)
    this.audio.play().catch((e: unknown) => {
      if (e instanceof Error && e.name === 'NotAllowedError') { this.set({ status: 'paused', error: 'Tap play to start audio.' }); return }
      if (myToken === this.token) this.onError('Saved audio could not be played.')
    })
  }

  private onCanPlay() {
    if (this.state.status === 'loading' && !this.silent) this.audio.playbackRate = this.opts.rate
  }

  private onError(msg: string) {
    if (this.silent) { this.endSilence(); return }         // a failed silent clip must never stall practice
    if (this.state.status === 'idle' || this.state.status === 'paused') return
    this.clearTimer()
    void msg
    if (this.playingLocal) {                               // the saved copy is bad: forget it and use the network
      this.playingLocal = false
      const r = this.state.current
      if (r) this.local?.forget(this.opts.reciterId, r.surah, r.ayah)
      this.urlIdx = 0
      this.set({ saved: false })
      this.tryUrl()
      return
    }
    this.urlIdx++
    this.tryUrl()
  }

  private onEnded() {
    if (this.silent) { this.endSilence(); return }
    this.set({ plays: this.state.plays + 1 })
    const echo = this.opts.echoPause
    if (echo === undefined) return this.afterListen()
    if (echo === 0) { this.set({ phase: 'recite', waiting: true, silenceSeconds: 0, status: 'paused' }); return }
    const secs = silenceFor(this.audio.duration, echo)
    if (secs === null) { this.set({ phase: 'recite', waiting: true, silenceSeconds: 0, status: 'paused' }); return }   // length unknown: wait for a tap rather than guess
    this.startSilence(secs)
  }

  private startSilence(seconds: number) {
    this.silent = true
    this.token++
    this.set({ phase: 'recite', waiting: false, silenceSeconds: Math.round(seconds), status: 'playing' })
    this.audio.src = silentClipUrl(seconds)
    this.audio.playbackRate = 1
    void this.audio.play().catch(() => this.endSilence())
  }

  private endSilence() {
    this.silent = false
    this.set({ phase: 'listen', silenceSeconds: 0 })
    this.afterListen()
  }

  /** Echo with an open-ended pause: the user has finished reciting. */
  continue() {
    if (!this.state.waiting) return
    this.set({ phase: 'listen', waiting: false, status: 'loading' })
    this.afterListen()
  }

  private afterListen() {
    const { ayahRepeat, index } = this.state
    if (ayahRepeat + 1 < this.opts.repeatEach) {
      this.set({ ayahRepeat: ayahRepeat + 1 })
      this.gap(() => this.replay())
      return
    }
    if (index + 1 < this.queue.length) {
      this.set({ ayahRepeat: 0 })
      this.gap(() => this.startAyah(index + 1))
      return
    }
    const passes = this.state.passageRepeat + 1
    if (this.opts.repeatPassage === 'infinite' || passes < this.opts.repeatPassage) {
      this.set({ passageRepeat: passes, ayahRepeat: 0 })
      this.gap(() => this.startAyah(0))
      return
    }
    this.finish()
  }

  /** Play the current ayah again from its own file (the element may currently hold the silent clip). */
  private replay() {
    this.token++
    this.urlIdx = 0
    this.localTried = false
    this.set({ status: 'loading' })
    this.tryUrl()
  }

  private gap(fn: () => void) {
    if (this.gapTimer) clearTimeout(this.gapTimer)
    const ms = this.opts.gapMs ?? 0
    if (ms <= 0) return fn()
    this.gapTimer = setTimeout(fn, ms)
  }

  private finish() {
    this.clearTimer()
    this.silent = false
    this.set({ status: 'idle', current: null, ayahRepeat: 0, phase: 'listen', waiting: false, silenceSeconds: 0 })
  }

  play() { if (this.state.current) { this.set({ status: 'loading' }); void this.audio.play() } }
  pause() { this.audio.pause(); this.set({ status: 'paused' }) }
  toggle() { this.state.status === 'playing' || this.state.status === 'loading' ? this.pause() : this.play() }
  stop() {
    this.token++
    this.silent = false
    this.clearTimer()
    if (this.gapTimer) clearTimeout(this.gapTimer)
    this.audio.pause()
    this.set({ status: 'idle', current: null, index: 0, ayahRepeat: 0, passageRepeat: 0, error: null, unavailable: false, via: null, saved: false, phase: 'listen', waiting: false, silenceSeconds: 0 })
  }
  next() { if (this.state.index + 1 < this.queue.length) this.startAyah(this.state.index + 1) }
  prev() { this.startAyah(Math.max(0, this.state.index - 1)) }
  retry() { if (this.state.current) { this.urlIdx = 0; this.localTried = false; this.set({ status: 'loading', error: null, unavailable: false }); this.tryUrl() } }
  setRate(rate: number) { this.opts.rate = rate; if (!this.silent) this.audio.playbackRate = rate; this.set({ rate }) }
  setEcho(pause: QueueOptions['echoPause']) { this.opts.echoPause = pause }
  setRepeat(n: number) { this.opts.repeatEach = n }
  setReciter(id: string) {
    this.opts.reciterId = id
    this.set({ reciterId: id })
    if (this.state.current && this.state.status !== 'idle') { this.urlIdx = 0; this.localTried = false; this.set({ status: 'loading', unavailable: false }); this.tryUrl() }
  }
  get reciterName() { return reciterById(this.opts.reciterId).name }
}
