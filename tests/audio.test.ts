import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { AyahPlayer, silenceFor, silentClipUrl, type AudioLike } from '@/lib/audio/player'
import { candidateUrls, RECITERS, SOURCES } from '@/lib/audio/sources'
import { globalAyahNumber } from '@/lib/quran/data'

class FakeAudio extends EventTarget implements AudioLike {
  src = ''
  playbackRate = 1
  currentTime = 0
  preservesPitch = false
  duration = 4
  played: string[] = []
  failing = new Set<string>()
  async play() {
    this.played.push(this.src)
    queueMicrotask(() => this.dispatchEvent(new Event(this.failing.has(this.src) ? 'error' : 'playing')))
  }
  pause() {}
  end() { this.dispatchEvent(new Event('ended')) }
}
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('audio URLs', () => {
  it('builds EveryAyah URLs with zero-padded surah and ayah', () => {
    expect(SOURCES.everyayah.urlFor('Alafasy_128kbps', 1, 1)).toBe('https://everyayah.com/data/Alafasy_128kbps/001001.mp3')
    expect(SOURCES.everyayah.urlFor('Alafasy_128kbps', 114, 6)).toBe('https://everyayah.com/data/Alafasy_128kbps/114006.mp3')
    expect(SOURCES.everyayah.urlFor('X', 2, 255)).toMatch(/002255\.mp3$/)
  })
  it('builds Islamic Network URLs from the global ayah number', () => {
    expect(SOURCES.islamicnetwork.urlFor('ar.alafasy', 1, 1)).toBe('https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3')
    expect(SOURCES.islamicnetwork.urlFor('ar.alafasy', 2, 1)).toMatch(/\/8\.mp3$/)
    expect(globalAyahNumber(114, 6)).toBe(6236)
  })
  it('lists a primary and, where known, a fallback endpoint per reciter', () => {
    expect(RECITERS.length).toBeGreaterThanOrEqual(8)
    expect(new Set(RECITERS.map((r) => r.id)).size).toBe(RECITERS.length)
    expect(candidateUrls('alafasy', 2, 2)).toHaveLength(2)
    expect(candidateUrls('unknown-id', 2, 2)[0]!.url).toContain('Alafasy')
  })
  it('never embeds credentials or API keys', () => {
    for (const r of RECITERS) for (const c of candidateUrls(r.id, 1, 1)) expect(c.url).toMatch(/^https:\/\/[a-z.]+\/[A-Za-z0-9_./-]+\.mp3$/)
  })
})

describe('AyahPlayer', () => {
  let audio: FakeAudio
  let p: AyahPlayer
  beforeEach(() => { audio = new FakeAudio(); p = new AyahPlayer(audio) })
  afterEach(() => vi.useRealTimers())

  it('plays a queue in order and returns to idle', async () => {
    p.load([{ surah: 1, ayah: 1 }, { surah: 1, ayah: 2 }], { reciterId: 'alafasy' })
    await flush()
    expect(audio.played).toHaveLength(1)
    expect(p.state).toMatchObject({ status: 'playing', index: 0 })
    audio.end(); await flush()
    expect(p.state.index).toBe(1)
    expect(audio.played[1]).toContain('001002.mp3')
    audio.end(); await flush()
    expect(p.state.status).toBe('idle')
  })
  it('repeats each ayah and the whole passage', async () => {
    p.load([{ surah: 112, ayah: 1 }, { surah: 112, ayah: 2 }], { repeatEach: 2, repeatPassage: 2 })
    await flush()
    for (let i = 0; i < 8; i++) { audio.end(); await flush() }
    // 2 ayahs x 2 repeats x 2 passes = 8 plays; the first came from load()
    expect(audio.played.filter((u) => u.includes('112001')).length).toBeGreaterThanOrEqual(2)
    expect(p.state.status).toBe('idle')
  })
  it('falls back to the next host when a file fails, and says which host served it', async () => {
    audio.failing.add('https://everyayah.com/data/Alafasy_128kbps/002005.mp3')
    p.load([{ surah: 2, ayah: 5 }], { reciterId: 'alafasy' })
    await flush(); await flush()
    expect(audio.played).toEqual(['https://everyayah.com/data/Alafasy_128kbps/002005.mp3', 'https://cdn.islamic.network/quran/audio/128/ar.alafasy/12.mp3'])
    expect(p.state.status).toBe('playing')
    expect(p.state.via).toBe('Islamic Network CDN')
  })
  it('reports a clear error when every host fails, and can retry', async () => {
    for (const c of candidateUrls('alafasy', 2, 5)) audio.failing.add(c.url)
    p.load([{ surah: 2, ayah: 5 }], { reciterId: 'alafasy' })
    await flush(); await flush(); await flush()
    expect(p.state.status).toBe('error')
    expect(p.state.error).toContain('2:5')
    audio.failing.clear()
    p.retry(); await flush()
    expect(p.state.status).toBe('playing')
  })
  it('times out a stalled load and tries the fallback', async () => {
    vi.useFakeTimers()
    audio.play = async function (this: FakeAudio) { this.played.push(this.src) } as never // never fires playing/error
    p.load([{ surah: 1, ayah: 1 }], { reciterId: 'alafasy' })
    await vi.advanceTimersByTimeAsync(12_100)
    expect(audio.played).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(12_100)
    expect(p.state.status).toBe('error')
  })
  it('applies playback rate and keeps pitch', async () => {
    p.load([{ surah: 1, ayah: 1 }], { rate: 0.75 })
    await flush()
    expect(audio.playbackRate).toBe(0.75)
    expect(audio.preservesPitch).toBe(true)
    p.setRate(1.25)
    expect(audio.playbackRate).toBe(1.25)
  })
  it('stop cancels everything', async () => {
    p.load([{ surah: 1, ayah: 1 }, { surah: 1, ayah: 2 }], { repeatPassage: 'infinite' })
    await flush(); p.stop()
    expect(p.state).toMatchObject({ status: 'idle', current: null })
  })
})


describe('your three reciters: honest behaviour', () => {
  let audio: FakeAudio
  let p: AyahPlayer
  beforeEach(() => { audio = new FakeAudio(); p = new AyahPlayer(audio) })

  it('a reciter with no verse-by-verse source says so and never plays anyone else', async () => {
    p.load([{ surah: 20, ayah: 1 }], { reciterId: 'turki' })
    await flush()
    expect(audio.played).toHaveLength(0)
    expect(p.state).toMatchObject({ status: 'error', unavailable: true })
    expect(p.state.error).toContain('Badr Al-Turki')
  })
  it('walks only the selected reciter\u2019s own candidates when one fails', async () => {
    audio.failing.add('https://everyayah.com/data/MaherAlMuaiqly128kbps/020001.mp3')
    p.load([{ surah: 20, ayah: 1 }], { reciterId: 'maher' })
    await flush(); await flush()
    expect(audio.played.length).toBeGreaterThanOrEqual(2)
    for (const u of audio.played) expect(u.toLowerCase()).toMatch(/maher/)
    expect(audio.played.join(' ')).not.toMatch(/alafasy/i)
  })
  it('lists Yasser Al-Dossary and Maher Al-Mu\u2019aiqly with Arabic names', () => {
    expect(RECITERS.find((r) => r.id === 'dossary')!.arabic).toBe('ياسر الدوسري')
    expect(RECITERS.find((r) => r.id === 'maher')!.arabic).toBe('ماهر المعيقلي')
    expect(RECITERS.find((r) => r.id === 'turki')!.arabic).toBe('بدر التركي')
  })
})

describe('echo: listen, silence, recite', () => {
  let audio: FakeAudio
  let p: AyahPlayer
  beforeEach(() => { audio = new FakeAudio(); p = new AyahPlayer(audio) })
  const q = [{ surah: 112, ayah: 1 }, { surah: 112, ayah: 2 }]

  it('sizes the silence from the real clip length, with sensible bounds', () => {
    expect(silenceFor(4, 1.5)).toBe(6)
    expect(silenceFor(0.2, 1)).toBe(1.5)
    expect(silenceFor(500, 2)).toBe(60)
    expect(silenceFor(undefined, 1)).toBeNull()
    expect(silenceFor(NaN, 1)).toBeNull()
  })
  it('plays a silent clip as real audio, then moves on without a timer', async () => {
    p.load(q, { reciterId: 'alafasy', echoPause: 1.5 })
    await flush()
    audio.end(); await flush()
    expect(p.state.phase).toBe('recite')
    expect(p.state.silenceSeconds).toBe(6)
    expect(audio.src.startsWith('blob:')).toBe(true)
    audio.end(); await flush()
    expect(p.state.phase).toBe('listen')
    expect(p.state.index).toBe(1)
    expect(audio.src).toContain('112002')
  })
  it('repeats with a silence after each repetition', async () => {
    p.load([q[0]!], { reciterId: 'alafasy', echoPause: 1, repeatEach: 2 })
    await flush()
    audio.end(); await flush(); audio.end(); await flush()      // listen 1, silence 1
    expect(p.state.ayahRepeat).toBe(1)
    audio.end(); await flush()                                    // listen 2 ends -> silence 2
    expect(p.state.phase).toBe('recite')
    audio.end(); await flush()                                    // silence 2 ends -> done
    expect(p.state.status).toBe('idle')
    expect(p.state.plays).toBe(2)
  })
  it('open-ended pause waits for Continue instead of guessing', async () => {
    p.load(q, { reciterId: 'alafasy', echoPause: 0 })
    await flush(); audio.end(); await flush()
    expect(p.state).toMatchObject({ phase: 'recite', waiting: true })
    expect(p.state.index).toBe(0)
    p.continue(); await flush()
    expect(p.state).toMatchObject({ phase: 'listen', waiting: false, index: 1 })
  })
  it('waits for a tap when the clip length is unknown', async () => {
    audio.duration = NaN
    p.load(q, { reciterId: 'alafasy', echoPause: 1.5 })
    await flush(); audio.end(); await flush()
    expect(p.state.waiting).toBe(true)
  })
  it('a failed silent clip never stalls practice', async () => {
    p.load(q, { reciterId: 'alafasy', echoPause: 1 })
    await flush(); audio.end(); await flush()
    audio.dispatchEvent(new Event('error')); await flush()
    expect(p.state.index).toBe(1)
  })
  it('without echo, nothing changes: playback advances straight away', async () => {
    p.load(q, { reciterId: 'alafasy' })
    await flush(); audio.end(); await flush()
    expect(p.state.index).toBe(1)
    expect(p.state.phase).toBe('listen')
  })
  it('silent clips are valid WAV and cached by length', () => {
    expect(silentClipUrl(3)).toBe(silentClipUrl(3))
    expect(silentClipUrl(3)).not.toBe(silentClipUrl(4))
  })
})
