import { describe, expect, it, vi } from 'vitest'
import { MemoryStore, OfflineAudio, formatBytes, neededBy, planRemoval, validateAudio, type Want } from '@/lib/audio/offline'
import { AyahPlayer, type AudioLike } from '@/lib/audio/player'
import { canSaveOffline, offlineEndpoint, offlineUrl, saveableReciters, SOURCE_RIGHTS } from '@/lib/audio/sources'
import { globalAyahNumber } from '@/lib/quran/data'
import { readFileSync } from 'node:fs'

const audioBytes = (n = 4000) => new Uint8Array(n).fill(7)
const mp3 = (n = 4000, extra: Record<string, string> = {}) => new Response(audioBytes(n), { status: 200, headers: { 'content-type': 'audio/mpeg', ...extra } })
const ledger = () => { let k: string[] = []; return { read: () => k, write: (x: string[]) => { k = x } } }
const make = (fetchFn: typeof fetch, over: Partial<ConstructorParameters<typeof OfflineAudio>[1]> = {}) => {
  const store = new MemoryStore()
  const o = new OfflineAudio(store, { fetchFn, ledger: ledger(), online: () => true, freeBytes: async () => null, retryDelayMs: 0, ...over })
  return { store, o }
}
const urls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => String(c[0]))
const taha = (end: number) => ({ surah: 20, start: 1, end })

describe('what may be saved', () => {
  it('only saves from a source whose terms allow it', () => {
    expect(SOURCE_RIGHTS.islamicnetwork.saveOffline).toBe(true)
    expect(SOURCE_RIGHTS.everyayah.saveOffline).toBe(false)
    expect(canSaveOffline('maher')).toBe(true)
    expect(offlineEndpoint('maher')!.source).toBe('islamicnetwork')
    expect(offlineUrl('maher', 20, 1)).toMatch(/^https:\/\/cdn\.islamic\.network\//)
  })
  it('does not allow saving for reciters that only have an unlicensed source, or none', () => {
    expect(canSaveOffline('dossary')).toBe(false)
    expect(offlineUrl('dossary', 20, 1)).toBeNull()
    expect(canSaveOffline('turki')).toBe(false)
    for (const r of saveableReciters()) expect(offlineUrl(r.id, 1, 1)).not.toContain('everyayah.com')
  })
  it('refuses to fetch anything for a reciter that may not be saved', async () => {
    const f = vi.fn(async () => mp3())
    const { o } = make(f as never)
    const res = await o.save('dossary', taha(3))
    expect(res.stopped).toBe('not-permitted')
    expect(f).not.toHaveBeenCalled()
    expect(o.count()).toBe(0)
  })
})

describe('saving a goal’s audio', () => {
  it('saves every ayah, reports measured size, and is complete only when all are present', async () => {
    const f = vi.fn(async () => mp3(5000))
    const { o } = make(f as never)
    const res = await o.save('maher', taha(5))
    expect(res).toMatchObject({ stopped: 'done', saved: 5, failed: [] })
    const c = o.coverage('maher', taha(5))
    expect(c).toMatchObject({ total: 5, have: 5, complete: true, bytes: 25000 })
    expect(o.totalBytes()).toBe(25000)
    expect(urls(f).every((u) => u.startsWith('https://cdn.islamic.network/'))).toBe(true)
  })
  it('a second save of the same range downloads nothing', async () => {
    const f = vi.fn(async () => mp3())
    const { o } = make(f as never)
    await o.save('maher', taha(4))
    f.mockClear()
    const res = await o.save('maher', taha(4))
    expect(res.saved).toBe(0)
    expect(f).not.toHaveBeenCalled()
  })
  it('expanding a goal from 1–4 to 1–7 fetches only the three new ayahs', async () => {
    const f = vi.fn(async () => mp3())
    const { o } = make(f as never)
    await o.save('maher', taha(4))
    f.mockClear()
    const before = o.coverage('maher', taha(7))
    expect(before).toMatchObject({ have: 4, missing: [5, 6, 7], complete: false })
    await o.save('maher', taha(7))
    expect(f).toHaveBeenCalledTimes(3)
    expect(o.coverage('maher', taha(7)).complete).toBe(true)
  })
  it('overlapping ranges share recordings: nothing is stored or fetched twice', async () => {
    const f = vi.fn(async () => mp3())
    const { o, store } = make(f as never)
    await o.save('maher', { surah: 20, start: 1, end: 6 })
    f.mockClear()
    await o.save('maher', { surah: 20, start: 4, end: 9 })
    expect(f).toHaveBeenCalledTimes(3)
    expect(store.files.size).toBe(9)
  })
  it('a different reciter is saved separately and the first reciter’s audio stays', async () => {
    const f = vi.fn(async () => mp3())
    const { o } = make(f as never)
    await o.save('maher', taha(3))
    await o.save('alafasy', taha(3))
    expect(o.coverage('maher', taha(3)).complete).toBe(true)
    expect(o.coverage('alafasy', taha(3)).complete).toBe(true)
    expect(o.count()).toBe(6)
  })
  it('estimates before saving, then uses the measured size per word', async () => {
    const f = vi.fn(async () => mp3(20000))
    const { o } = make(f as never)
    const guess = o.estimateBytes('maher', 20, [1, 2, 3])
    expect(guess).toBeGreaterThan(0)
    await o.save('maher', { surah: 20, start: 1, end: 30 })
    const measured = o.estimateBytes('maher', 20, [31, 32, 33])
    expect(measured).not.toBe(o.estimateBytes('alafasy', 20, [31, 32, 33]))
  })
})

describe('interruptions and bad files', () => {
  it('cancelling leaves only whole recordings, and saving again resumes with the missing ones', async () => {
    const ctl = new AbortController()
    let n = 0
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => {
      if (++n === 3) ctl.abort()
      if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
      return mp3()
    })
    const { o, store } = make(f as never, { concurrency: 1 })
    const res = await o.save('maher', taha(8), { signal: ctl.signal })
    expect(res.stopped).toBe('cancelled')
    const have = o.coverage('maher', taha(8)).have
    expect(have).toBeGreaterThan(0)
    expect(have).toBeLessThan(8)
    expect([...store.files.values()].every((b) => b.size >= 1024)).toBe(true)     // nothing half-written
    const f2 = vi.fn(async () => mp3())
    const again = make(f2 as never)
    for (const [k, v] of store.files) again.store.files.set(k, v)
    await again.o.refresh()
    await again.o.save('maher', taha(8))
    expect(f2).toHaveBeenCalledTimes(8 - have)
    expect(again.o.coverage('maher', taha(8)).complete).toBe(true)
  })
  it('does not call a partly saved passage complete when some ayahs are unavailable', async () => {
    const missing = new Set([globalAyahNumber(20, 2), globalAyahNumber(20, 4)])
    const f = vi.fn(async (u: unknown) => (missing.has(Number(/\/(\d+)\.mp3$/.exec(String(u))![1])) ? new Response('gone', { status: 404 }) : mp3()))
    const { o } = make(f as never)
    const res = await o.save('maher', taha(5))
    expect(res.saved).toBe(3)
    expect(res.failed.map((x) => x.ayah).sort()).toEqual([2, 4])
    expect(o.coverage('maher', taha(5))).toMatchObject({ have: 3, complete: false, missing: [2, 4] })
  })
  it('rejects web pages, tiny files and truncated downloads instead of storing them', async () => {
    const html = vi.fn(async () => new Response('<html>nope</html>'.repeat(200), { status: 200, headers: { 'content-type': 'text/html' } }))
    expect((await make(html as never).o.save('maher', taha(1))).failed[0]?.reason).toBe('not an audio file')
    const tiny = vi.fn(async () => mp3(100))
    expect((await make(tiny as never).o.save('maher', taha(1))).failed[0]?.reason).toBe('file too small')
    const cut = vi.fn(async () => mp3(4000, { 'content-length': '9000' }))
    const t = make(cut as never)
    expect((await t.o.save('maher', taha(1))).failed[0]?.reason).toBe('download was cut short')
    expect(t.store.files.size).toBe(0)
    expect(validateAudio({ ok: true, status: 200, headers: new Headers({ 'content-type': 'audio/mpeg' }) }, new Blob([audioBytes()]))).toBeNull()
  })
  it('stops cleanly, keeping what is saved, when storage runs out', async () => {
    const f = vi.fn(async () => mp3())
    const { o, store } = make(f as never, { concurrency: 1 })
    const put = store.put.bind(store)
    let n = 0
    store.put = async (k, b) => { if (++n === 3) throw new DOMException('full', 'QuotaExceededError'); return put(k, b) }
    const res = await o.save('maher', taha(6))
    expect(res.stopped).toBe('space')
    expect(o.coverage('maher', taha(6)).have).toBe(2)
  })
  it('does not start when offline, when the phone lacks space, or when it would pass the size limit', async () => {
    const f = vi.fn(async () => mp3())
    expect((await make(f as never, { online: () => false }).o.save('maher', taha(3))).stopped).toBe('offline')
    expect((await make(f as never, { freeBytes: async () => 100 }).o.save('maher', taha(3))).stopped).toBe('space')
    expect((await make(f as never, { maxBytes: 10 }).o.save('maher', taha(3))).stopped).toBe('too-large')
    expect(f).not.toHaveBeenCalled()
  })
  it('a dropped connection part-way stops quietly as offline', async () => {
    let online = true
    const f = vi.fn(async () => { online = false; throw new TypeError('network') })
    const { o } = make(f as never, { online: () => online })
    expect((await o.save('maher', taha(5))).stopped).toBe('offline')
  })
})

describe('eviction and removal', () => {
  it('notices recordings the phone removed and no longer calls the goal complete', async () => {
    const f = vi.fn(async () => mp3())
    const { o, store } = make(f as never)
    await o.save('maher', taha(5))
    await o.refresh()
    expect(o.coverage('maher', taha(5)).complete).toBe(true)
    expect(o.evictedCount()).toBe(0)
    store.evict({ reciter: 'maher', surah: 20, ayah: 2 }); store.evict({ reciter: 'maher', surah: 20, ayah: 3 })
    await o.refresh()
    expect(o.coverage('maher', taha(5))).toMatchObject({ have: 3, missing: [2, 3], complete: false })
    expect(o.evictedCount()).toBe(2)
    o.acknowledgeEvicted()
    expect(o.evictedCount()).toBe(0)
    f.mockClear()
    await o.save('maher', taha(5))
    expect(f).toHaveBeenCalledTimes(2)                               // recovers by fetching just the two that were lost
  })
  it('a recording that vanished between refreshes is forgotten instead of being claimed', async () => {
    const f = vi.fn(async () => mp3())
    const { o, store } = make(f as never)
    await o.save('maher', taha(2))
    store.evict({ reciter: 'maher', surah: 20, ayah: 1 })
    expect(o.has('maher', 20, 1)).toBe(true)
    expect(await o.blob('maher', 20, 1)).toBeNull()
    expect(o.has('maher', 20, 1)).toBe(false)
  })
  it('removing one reciter’s audio leaves the others', async () => {
    const f = vi.fn(async () => mp3())
    const { o } = make(f as never)
    await o.save('maher', taha(3)); await o.save('alafasy', taha(3))
    await o.remove(o.keysIn('maher', 20, 1, 3))
    expect(o.coverage('maher', taha(3)).have).toBe(0)
    expect(o.coverage('alafasy', taha(3)).complete).toBe(true)
    await o.removeAll()
    expect(o.count()).toBe(0)
    expect(o.totalBytes()).toBe(0)
  })
  it('groups recordings into runs the way the manager lists them', async () => {
    const f = vi.fn(async () => mp3(3000))
    const { o } = make(f as never)
    await o.save('maher', { surah: 20, start: 1, end: 3 })
    await o.save('maher', { surah: 20, start: 6, end: 7 })
    await o.save('alafasy', { surah: 2, start: 255, end: 255 })
    expect(o.runs()).toEqual([
      { reciter: 'alafasy', surah: 2, start: 255, end: 255, count: 1, bytes: 3000 },
      { reciter: 'maher', surah: 20, start: 1, end: 3, count: 3, bytes: 9000 },
      { reciter: 'maher', surah: 20, start: 6, end: 7, count: 2, bytes: 6000 },
    ])
  })
})

describe('goals that share recordings', () => {
  const g1: Want = { id: 'g1', label: 'Ta-Ha 1–36', range: { surah: 20, start: 1, end: 36 } }
  const g2: Want = { id: 'g2', label: 'Ta-Ha 30–50', range: { surah: 20, start: 30, end: 50 } }
  it('keeps recordings another goal still needs, and says which goal', () => {
    const keys = Array.from({ length: 36 }, (_, i) => ({ reciter: 'maher', surah: 20, ayah: i + 1 }))
    const plan = planRemoval(keys, [g1, g2], 'maher', 'g1')
    expect(plan.keep.map((k) => k.key.ayah)).toEqual([30, 31, 32, 33, 34, 35, 36])
    expect(plan.keep[0]!.by[0]!.label).toBe('Ta-Ha 30–50')
    expect(plan.remove).toHaveLength(29)
  })
  it('a recording nobody needs (another reciter, or no goal) is simply removable', () => {
    expect(neededBy({ reciter: 'alafasy', surah: 20, ayah: 5 }, [g1], 'maher')).toEqual([])
    expect(planRemoval([{ reciter: 'alafasy', surah: 20, ayah: 5 }], [g1, g2], 'maher').remove).toHaveLength(1)
  })
})

describe('offline playback in the player', () => {
  class FakeAudio extends EventTarget implements AudioLike {
    src = ''; playbackRate = 1; currentTime = 0; duration = 3; played: string[] = []; badBlob = false
    async play() { this.played.push(this.src); queueMicrotask(() => this.dispatchEvent(new Event(this.badBlob && this.src.startsWith('blob:') ? 'error' : 'playing'))) }
    pause() {}
  }
  const flush = () => new Promise((r) => setTimeout(r, 5))
  it('plays the saved copy first, never touching the network, and says so', async () => {
    const f = vi.fn(async () => mp3())
    const { o } = make(f as never)
    await o.save('maher', taha(2))
    const audio = new FakeAudio(); const p = new AyahPlayer(audio, o)
    p.load([{ surah: 20, ayah: 1 }], { reciterId: 'maher' })
    await flush()
    expect(audio.played[0]).toMatch(/^blob:/)
    expect(p.state).toMatchObject({ status: 'playing', saved: true, via: 'Saved on this device' })
  })
  it('falls back to streaming when the saved copy is missing or unreadable, and forgets the bad copy', async () => {
    const f = vi.fn(async () => mp3())
    const { o } = make(f as never)
    await o.save('maher', taha(2))
    const audio = new FakeAudio(); audio.badBlob = true
    const p = new AyahPlayer(audio, o)
    p.load([{ surah: 20, ayah: 2 }], { reciterId: 'maher' })
    await flush()
    expect(audio.played.some((u) => u.startsWith('blob:'))).toBe(true)
    expect(audio.played.at(-1)).toMatch(/^https:\/\/.*\.mp3$/)       // streamed from the reciter's own endpoint
    expect(o.has('maher', 20, 2)).toBe(false)
    expect(p.state.saved).toBe(false)
    // an ayah that was never saved streams normally
    const a2 = new FakeAudio(); const p2 = new AyahPlayer(a2, o)
    p2.load([{ surah: 20, ayah: 30 }], { reciterId: 'maher' })
    await flush()
    expect(a2.played[0]).toMatch(/^https:\/\/.*\.mp3$/)
  })
  it('says plainly when offline and the ayah is not saved', async () => {
    const { o } = make(vi.fn() as never)
    const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true })
    try {
      const audio = new FakeAudio(); audio.badBlob = true
      const p = new AyahPlayer(audio, o)
      audio.play = async function (this: FakeAudio) { this.played.push(this.src); queueMicrotask(() => this.dispatchEvent(new Event('error'))) }
      p.load([{ surah: 20, ayah: 9 }], { reciterId: 'maher' })
      await flush(); await flush()
      expect(p.state.status).toBe('error')
      expect(p.state.error).toMatch(/offline.*isn’t saved/)
    } finally { if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete (globalThis as { navigator?: unknown }).navigator }
  })
})

describe('separation from memorisation history', () => {
  it('the offline module cannot reach the learning database', () => {
    const src = readFileSync('src/lib/audio/offline.ts', 'utf8')
    expect(src).not.toMatch(/store\/db|store\/repo|dexie|useApp|saveTarget|recordReview/i)
  })
  it('formats sizes in ordinary units', () => {
    expect(formatBytes(900)).toBe('900 B')
    expect(formatBytes(150 * 1024)).toBe('150 KB')
    expect(formatBytes(7.2 * 1024 * 1024)).toBe('7.2 MB')
    expect(formatBytes(120 * 1024 * 1024)).toBe('120 MB')
  })
})

describe('saving that resumes by itself', () => {
  const intents = () => { let x: import('@/lib/audio/offline').Intent[] = []; return { read: () => x, write: (v: import('@/lib/audio/offline').Intent[]) => { x = v } } }
  const build = (f: ReturnType<typeof vi.fn>, io = intents(), online: () => boolean = () => true) => {
    const store = new MemoryStore()
    return { io, store, o: new OfflineAudio(store, { fetchFn: f as never, ledger: ledger(), intents: io, online, freeBytes: async () => null, retryDelayMs: 0, concurrency: 1 }) }
  }
  it('reports measured progress while saving, then forgets the request once complete', async () => {
    const f = vi.fn(async () => mp3(3000))
    const { o, io } = build(f)
    const seen: { done: number; total: number; bytes: number }[] = []
    o.subscribe(() => { if (o.job) seen.push({ done: o.job.done, total: o.job.total, bytes: o.job.bytes }) })
    const res = await o.start('maher', taha(3))
    expect(res.saved).toBe(3)
    expect(seen.at(-1)).toEqual({ done: 3, total: 3, bytes: 9000 })        // bytes are what was actually stored
    expect(o.job).toBeNull()
    expect(io.read()).toEqual([])
    expect(o.lastResult?.result.saved).toBe(3)
  })
  it('an interrupted save is remembered and finishes the missing ayahs when the app returns', async () => {
    let n = 0
    const f = vi.fn(async () => { if (++n > 2) throw new TypeError('network dropped'); return mp3() })
    const { o, io } = build(f)
    await o.start('maher', taha(5))
    expect(o.coverage('maher', taha(5)).have).toBe(2)
    expect(io.read()).toHaveLength(1)                                      // still wanted
    f.mockImplementation(async () => mp3())
    f.mockClear()
    await o.resumePending()
    expect(f).toHaveBeenCalledTimes(3)                                    // only the three that were missing
    expect(o.coverage('maher', taha(5)).complete).toBe(true)
    expect(io.read()).toEqual([])
  })
  it('does nothing while offline, and resumes when back online', async () => {
    let online = false
    const f = vi.fn(async () => mp3())
    const io = intents()
    io.write([{ reciter: 'maher', surah: 20, start: 1, end: 3, tries: 0 }])
    const { o } = build(f, io, () => online)
    await o.resumePending()
    expect(f).not.toHaveBeenCalled()
    online = true
    await o.resumePending()
    expect(o.coverage('maher', taha(3)).complete).toBe(true)
  })
  it('Stop keeps what is saved and does not resume', async () => {
    let started: () => void = () => undefined
    const gate = new Promise<void>((r) => { started = r })
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => { started(); await new Promise((r) => setTimeout(r, 5)); if (init?.signal?.aborted) throw new DOMException('x', 'AbortError'); return mp3() })
    const { o, io } = build(f)
    const p = o.start('maher', taha(6))
    await gate
    o.cancel()
    const res = await p
    expect(res.stopped).toBe('cancelled')
    expect(io.read()).toEqual([])
    f.mockClear()
    await o.resumePending()
    expect(f).not.toHaveBeenCalled()
  })
  it('gives up on files the host says do not exist instead of retrying forever, and after repeated failures', async () => {
    const gone = vi.fn(async () => new Response('no', { status: 404 }))
    const a = build(gone)
    await a.o.start('maher', taha(2))
    expect(a.io.read()).toEqual([])
    const flaky = vi.fn(async () => { throw new TypeError('network') })
    const b = build(flaky)
    for (let i = 0; i < 3; i++) await b.o.start('maher', taha(2)).catch(() => undefined)
    expect(b.io.read()).toEqual([])
  })
  it('removing audio also cancels the wish to save it', async () => {
    let n = 0
    const f = vi.fn(async () => { if (++n > 1) throw new TypeError('network'); return mp3() })
    const { o, io } = build(f)
    await o.start('maher', taha(3))
    expect(io.read()).toHaveLength(1)
    await o.remove(o.keysIn('maher', 20, 1, 3))
    expect(io.read()).toEqual([])
  })
  it('two requests run one after the other and never fetch the same file twice', async () => {
    const f = vi.fn(async (_u: unknown) => mp3())
    const { o } = build(f)
    await Promise.all([o.start('maher', { surah: 20, start: 1, end: 4 }), o.start('maher', { surah: 20, start: 3, end: 6 })])
    expect(f).toHaveBeenCalledTimes(6)
    expect(new Set(f.mock.calls.map((c) => String(c[0]))).size).toBe(6)
  })
})
