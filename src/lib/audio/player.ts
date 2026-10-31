// Per-ayah audio player: queue, per-ayah and whole-passage repetition, playback rate,
// endpoint fallback and explicit errors. The audio element is injected so the state
// machine is testable without a browser.
import { candidateUrls, reciterById } from './sources'
import type { AyahRef } from '@/lib/engine/types'

export interface AudioLike extends EventTarget {
  src: string
  playbackRate: number
  preservesPitch?: boolean
  preload?: string
  currentTime: number
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
  /** Which host is serving the current ayah. */
  via: string | null
  rate: number
  reciterId: string
}
export interface QueueOptions {
  reciterId: string
  repeatEach: number
  /** Number of passes over the queue; 'infinite' loops until stopped. */
  repeatPassage: number | 'infinite'
  rate: number
  gapMs?: number
}

const LOAD_TIMEOUT_MS = 12_000

export class AyahPlayer {
  private audio: AudioLike
  private queue: AyahRef[] = []
  private opts: QueueOptions = { reciterId: 'alafasy', repeatEach: 1, repeatPassage: 1, rate: 1 }
  private urlIdx = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private gapTimer: ReturnType<typeof setTimeout> | null = null
  private listeners = new Set<(s: PlayerState) => void>()
  private token = 0
  state: PlayerState = { status: 'idle', current: null, index: 0, ayahRepeat: 0, passageRepeat: 0, error: null, via: null, rate: 1, reciterId: 'alafasy' }

  constructor(audio: AudioLike) {
    this.audio = audio
    audio.preload = 'auto'
    audio.addEventListener('ended', () => this.onEnded())
    audio.addEventListener('error', () => this.onError('The audio file could not be loaded.'))
    audio.addEventListener('canplay', () => this.onCanPlay())
    audio.addEventListener('playing', () => { this.clearTimer(); this.set({ status: 'playing', error: null }) })
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
    this.set({ reciterId: this.opts.reciterId, rate: this.opts.rate, index: 0, ayahRepeat: 0, passageRepeat: 0, error: null })
    if (queue.length) this.startAyah(0)
  }

  private startAyah(index: number) {
    const ref = this.queue[index]
    if (!ref) return this.finish()
    this.token++
    this.urlIdx = 0
    this.set({ current: ref, index, status: 'loading', error: null })
    this.tryUrl()
  }

  private tryUrl() {
    const ref = this.state.current
    if (!ref) return
    const cands = candidateUrls(this.opts.reciterId, ref.surah, ref.ayah)
    const cand = cands[this.urlIdx]
    if (!cand) {
      this.set({ status: 'error', error: `Couldn’t load audio for ${ref.surah}:${ref.ayah}. Check your connection or choose another reciter.`, via: null })
      return
    }
    this.clearTimer()
    this.audio.src = cand.url
    this.audio.playbackRate = this.opts.rate
    if ('preservesPitch' in this.audio) this.audio.preservesPitch = true
    this.set({ via: cand.source })
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

  private onCanPlay() {
    if (this.state.status === 'loading') this.audio.playbackRate = this.opts.rate
  }

  private onError(msg: string) {
    if (this.state.status === 'idle' || this.state.status === 'paused') return
    this.clearTimer()
    this.urlIdx++
    void msg
    this.tryUrl()
  }

  private onEnded() {
    const { ayahRepeat, index } = this.state
    if (ayahRepeat + 1 < this.opts.repeatEach) {
      this.set({ ayahRepeat: ayahRepeat + 1 })
      this.gap(() => { this.audio.currentTime = 0; this.token++; this.set({ status: 'loading' }); void this.audio.play() })
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

  private gap(fn: () => void) {
    if (this.gapTimer) clearTimeout(this.gapTimer)
    const ms = this.opts.gapMs ?? 0
    if (ms <= 0) return fn()
    this.gapTimer = setTimeout(fn, ms)
  }

  private finish() {
    this.clearTimer()
    this.set({ status: 'idle', current: null, ayahRepeat: 0 })
  }

  play() { if (this.state.current) { this.set({ status: 'loading' }); void this.audio.play() } }
  pause() { this.audio.pause(); this.set({ status: 'paused' }) }
  toggle() { this.state.status === 'playing' || this.state.status === 'loading' ? this.pause() : this.play() }
  stop() {
    this.token++
    this.clearTimer()
    if (this.gapTimer) clearTimeout(this.gapTimer)
    this.audio.pause()
    this.set({ status: 'idle', current: null, index: 0, ayahRepeat: 0, passageRepeat: 0, error: null, via: null })
  }
  next() { if (this.state.index + 1 < this.queue.length) this.startAyah(this.state.index + 1) }
  prev() { this.startAyah(Math.max(0, this.state.index - 1)) }
  retry() { if (this.state.current) { this.urlIdx = 0; this.set({ status: 'loading', error: null }); this.tryUrl() } }
  setRate(rate: number) { this.opts.rate = rate; this.audio.playbackRate = rate; this.set({ rate }) }
  setReciter(id: string) {
    this.opts.reciterId = id
    this.set({ reciterId: id })
    if (this.state.current && this.state.status !== 'idle') { this.urlIdx = 0; this.set({ status: 'loading' }); this.tryUrl() }
  }
  get reciterName() { return reciterById(this.opts.reciterId).name }
}
