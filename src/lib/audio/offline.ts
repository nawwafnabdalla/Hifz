// Offline recitations: replaceable media kept on the device, completely separate from memorisation history.
//
// Design:
//  * ONE shared store of recordings keyed by (reciter, surah, ayah). Goals and passages do not own files; they only
//    *need* ranges. Overlapping goals therefore share recordings, nothing is downloaded twice, and "is this goal
//    ready?" is always answered by looking at what is really present.
//  * The truth is the store itself. Coverage, size and status are derived from it every time, so a recording the
//    phone has evicted simply stops counting. A small ledger remembers what we saved, only so we can say honestly
//    "your phone cleared N recordings" instead of silently looking empty.
//  * A recording is written only after it has been read in full, validated and read back; an interrupted download
//    leaves nothing half-written, and "resume" is just "save again" (only the missing ayahs are fetched).
//  * Sizes shown for saved audio are measured (bytes of the stored file). The size shown BEFORE saving is an estimate
//    and is labelled "about".
//  * Only sources whose terms allow keeping a copy are ever fetched for saving (see SOURCE_RIGHTS in sources.ts).
//  * Nothing here touches the learning database.
import { offlineEndpoint, offlineUrl, reciterById } from './sources'
import { wordsOfAyah } from '@/lib/quran/data'
import type { Range } from '@/lib/engine/types'

export interface RecKey { reciter: string; surah: number; ayah: number }
export interface Stored extends RecKey { bytes: number }
export const keyOf = (k: RecKey) => `${k.reciter}:${k.surah}:${k.ayah}`
const parseKey = (s: string): RecKey | null => {
  const [reciter, a, b] = s.split(':'); const surah = Number(a), ayah = Number(b)
  return reciter && Number.isInteger(surah) && Number.isInteger(ayah) ? { reciter, surah, ayah } : null
}

/** Where recordings physically live. The browser implementation uses the Cache API; tests use memory. */
export interface AudioStore {
  list(): Promise<Stored[]>
  get(k: RecKey): Promise<Blob | null>
  put(k: RecKey, blob: Blob): Promise<void>
  remove(k: RecKey): Promise<void>
}

export class MemoryStore implements AudioStore {
  readonly files = new Map<string, Blob>()
  /** Test hook: simulate the operating system evicting storage. */
  evict(k: RecKey) { this.files.delete(keyOf(k)) }
  async list() { return [...this.files].flatMap(([k, b]) => { const r = parseKey(k); return r ? [{ ...r, bytes: b.size }] : [] }) }
  async get(k: RecKey) { return this.files.get(keyOf(k)) ?? null }
  async put(k: RecKey, blob: Blob) { this.files.set(keyOf(k), blob) }
  async remove(k: RecKey) { this.files.delete(keyOf(k)) }
}

const CACHE_NAME = 'hifz-audio-v1'
const PREFIX = '/offline-audio/'
export class CacheAudioStore implements AudioStore {
  private urlOf = (k: RecKey) => new URL(`${PREFIX}${k.reciter}/${k.surah}/${k.ayah}`, self.location.origin).href
  private cache = () => caches.open(CACHE_NAME)
  async list(): Promise<Stored[]> {
    const c = await this.cache()
    const out: Stored[] = []
    for (const req of await c.keys()) {
      const parts = new URL(req.url).pathname.slice(PREFIX.length).split('/')
      const k = parseKey(parts.join(':'))
      const res = k ? await c.match(req) : undefined
      const bytes = Number(res?.headers.get('x-hifz-bytes'))
      if (k && Number.isFinite(bytes) && bytes > 0) out.push({ ...k, bytes })
    }
    return out
  }
  async get(k: RecKey) { const r = await (await this.cache()).match(this.urlOf(k)); return r ? r.blob() : null }
  async put(k: RecKey, blob: Blob) {
    await (await this.cache()).put(this.urlOf(k), new Response(blob, { headers: { 'content-type': blob.type || 'audio/mpeg', 'x-hifz-bytes': String(blob.size) } }))
  }
  async remove(k: RecKey) { await (await this.cache()).delete(this.urlOf(k)) }
}

// ---------- sizes ----------
const BYTES_PER_SECOND = 16_000          // 128 kbps
const DEFAULT_SECONDS_PER_WORD = 0.8     // a steady murattal pace; replaced by measured values once some audio is saved
export const MAX_TOTAL_BYTES = 600 * 1024 * 1024
export const LARGE_NOTICE_BYTES = 300 * 1024 * 1024
const MIN_FILE_BYTES = 1024

export const formatBytes = (b: number): string => {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`
  const mb = b / (1024 * 1024)
  return mb < 10 ? `${mb.toFixed(1)} MB` : mb < 1000 ? `${Math.round(mb)} MB` : `${(mb / 1024).toFixed(1)} GB`
}

export interface Want { id: string; label: string; range: Range }
export interface Coverage { total: number; have: number; missing: number[]; bytes: number; complete: boolean }
export interface Run { reciter: string; surah: number; start: number; end: number; count: number; bytes: number }
export type SaveStop = 'done' | 'cancelled' | 'space' | 'offline' | 'too-large' | 'not-permitted'
export interface SaveResult { stopped: SaveStop; saved: number; failed: { ayah: number; reason: string }[]; bytes: number }

export interface LedgerIO { read(): string[]; write(keys: string[]): void }
/** A save the person asked for. It is kept until it completes, fails for good, or they stop it, so an interrupted save can resume by itself. */
export interface Intent { reciter: string; surah: number; start: number; end: number; tries: number }
export interface IntentIO { read(): Intent[]; write(x: Intent[]): void }
const lsIntents = (): IntentIO => ({
  read: () => { try { return JSON.parse(localStorage.getItem('hifz.audioIntent.v1') ?? '[]') as Intent[] } catch { return [] } },
  write: (x) => { try { localStorage.setItem('hifz.audioIntent.v1', JSON.stringify(x)) } catch { /* private mode */ } },
})
/** What is being saved right now. Counts and bytes are measured, never estimated. */
export interface SaveJob { reciter: string; range: Range; done: number; total: number; bytes: number }
const MAX_TRIES = 3
const lsLedger = (): LedgerIO => ({
  read: () => { try { return JSON.parse(localStorage.getItem('hifz.audioLedger.v1') ?? '[]') as string[] } catch { return [] } },
  write: (k) => { try { localStorage.setItem('hifz.audioLedger.v1', JSON.stringify(k)) } catch { /* private mode */ } },
})

export interface LocalAudio {
  has(reciter: string, surah: number, ayah: number): boolean
  blob(reciter: string, surah: number, ayah: number): Promise<Blob | null>
  forget(reciter: string, surah: number, ayah: number): void
  /** What to tell the listener about where this ayah's audio came from. Defaults to a copy saved on this device. */
  source?(reciter: string, surah: number, ayah: number): { via: string; saved: boolean }
}

export interface OfflineOptions {
  fetchFn?: typeof fetch
  ledger?: LedgerIO
  intents?: IntentIO
  online?: () => boolean
  freeBytes?: () => Promise<number | null>
  maxBytes?: number
  concurrency?: number
  retryDelayMs?: number
}

/** Valid only when the whole file arrived, is audio, is plausibly a recording and matches its declared length. */
export function validateAudio(res: { ok: boolean; status: number; headers: Headers }, blob: Blob): string | null {
  if (!res.ok) return `server said ${res.status}`
  const type = (res.headers.get('content-type') ?? blob.type ?? '').toLowerCase()
  if (type && !type.startsWith('audio/') && !type.includes('octet-stream') && !type.includes('mpeg')) return 'not an audio file'
  if (blob.size < MIN_FILE_BYTES) return 'file too small'
  const len = Number(res.headers.get('content-length'))
  if (Number.isFinite(len) && len > 0 && len !== blob.size && !res.headers.get('content-encoding')) return 'download was cut short'
  return null
}

export class OfflineAudio implements LocalAudio {
  readonly supported: boolean
  private inv = new Map<string, number>()
  private ledgerKeys: Set<string>
  private listeners = new Set<() => void>()
  private version = 0
  private readonly o: Required<Omit<OfflineOptions, 'ledger' | 'fetchFn' | 'intents'>> & { ledger: LedgerIO; intents: IntentIO; fetchFn?: typeof fetch }
  loaded = false
  /** The save in progress, if any (one at a time). */
  job: SaveJob | null = null
  /** How the last save ended, so a card that was closed and reopened can still say so. */
  lastResult: { reciter: string; range: Range; result: SaveResult } | null = null
  private ctl: AbortController | null = null
  private chain: Promise<unknown> = Promise.resolve()

  constructor(private store: AudioStore | null, opts: OfflineOptions = {}) {
    this.supported = store !== null
    this.o = {
      fetchFn: opts.fetchFn,
      ledger: opts.ledger ?? lsLedger(),
      intents: opts.intents ?? lsIntents(),
      online: opts.online ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)),
      freeBytes: opts.freeBytes ?? (async () => {
        try { const e = await navigator.storage?.estimate?.(); return e?.quota != null && e.usage != null ? e.quota - e.usage : null } catch { return null }
      }),
      maxBytes: opts.maxBytes ?? MAX_TOTAL_BYTES,
      concurrency: opts.concurrency ?? 3,
      retryDelayMs: opts.retryDelayMs ?? 500,
    }
    this.ledgerKeys = new Set(this.o.ledger.read())
  }

  // ----- subscription -----
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  getVersion = () => this.version
  private bump() { this.version++; for (const l of this.listeners) l() }

  /** Re-read the store. Called at start, when the app comes back to the foreground and after every change. */
  async refresh(): Promise<void> {
    if (!this.store) return
    try {
      const rows = await this.store.list()
      this.inv = new Map(rows.map((r) => [keyOf(r), r.bytes]))
    } catch { this.inv = new Map() }
    this.loaded = true
    this.bump()
  }

  // ----- reading state -----
  has(reciter: string, surah: number, ayah: number) { return this.inv.has(keyOf({ reciter, surah, ayah })) }
  totalBytes() { let n = 0; for (const b of this.inv.values()) n += b; return n }
  count() { return this.inv.size }

  coverage(reciter: string, r: Range): Coverage {
    const missing: number[] = []
    let bytes = 0
    for (let a = r.start; a <= r.end; a++) {
      const b = this.inv.get(keyOf({ reciter, surah: r.surah, ayah: a }))
      if (b === undefined) missing.push(a); else bytes += b
    }
    const total = r.end - r.start + 1
    return { total, have: total - missing.length, missing, bytes, complete: missing.length === 0 }
  }

  /** Saved recordings grouped into runs of consecutive ayahs per reciter and surah. */
  runs(): Run[] {
    const byGroup = new Map<string, { k: RecKey; bytes: number }[]>()
    for (const [s, bytes] of this.inv) {
      const k = parseKey(s); if (!k) continue
      const g = `${k.reciter}:${k.surah}`
      ;(byGroup.get(g) ?? byGroup.set(g, []).get(g)!).push({ k, bytes })
    }
    const out: Run[] = []
    for (const items of byGroup.values()) {
      items.sort((a, b) => a.k.ayah - b.k.ayah)
      let cur: Run | null = null
      for (const { k, bytes } of items) {
        if (cur && k.ayah === cur.end + 1) { cur.end = k.ayah; cur.count++; cur.bytes += bytes }
        else { if (cur) out.push(cur); cur = { reciter: k.reciter, surah: k.surah, start: k.ayah, end: k.ayah, count: 1, bytes } }
      }
      if (cur) out.push(cur)
    }
    return out.sort((a, b) => a.surah - b.surah || a.reciter.localeCompare(b.reciter) || a.start - b.start)
  }

  keysIn(reciter: string, surah: number, start: number, end: number): RecKey[] {
    const out: RecKey[] = []
    for (let a = start; a <= end; a++) if (this.inv.has(keyOf({ reciter, surah, ayah: a }))) out.push({ reciter, surah, ayah: a })
    return out
  }
  allKeys(): RecKey[] { return [...this.inv.keys()].flatMap((s) => { const k = parseKey(s); return k ? [k] : [] }) }

  /** Recordings we saved earlier that are no longer in the store: the phone cleared them. */
  evictedCount(): number { if (!this.loaded) return 0; let n = 0; for (const k of this.ledgerKeys) if (!this.inv.has(k)) n++; return n }
  acknowledgeEvicted() { this.ledgerKeys = new Set([...this.ledgerKeys].filter((k) => this.inv.has(k))); this.o.ledger.write([...this.ledgerKeys]); this.bump() }

  /** Rough size before saving: measured bytes per word once this reciter has saved audio, otherwise a steady-pace guess. */
  estimateBytes(reciter: string, surah: number, ayahs: number[]): number {
    let bytes = 0, words = 0
    for (const [s, b] of this.inv) { const k = parseKey(s); if (k && k.reciter === reciter) { bytes += b; words += wordsOfAyah(k.surah, k.ayah).length } }
    const perWord = words >= 40 ? bytes / words : DEFAULT_SECONDS_PER_WORD * BYTES_PER_SECOND
    return Math.round(ayahs.reduce((n, a) => n + wordsOfAyah(surah, a).length, 0) * perWord)
  }

  // ----- playback support -----
  async blob(reciter: string, surah: number, ayah: number): Promise<Blob | null> {
    if (!this.store || !this.has(reciter, surah, ayah)) return null
    try {
      const b = await this.store.get({ reciter, surah, ayah })
      if (b && b.size >= MIN_FILE_BYTES) return b
    } catch { /* fall through: treat as gone */ }
    this.forget(reciter, surah, ayah)
    return null
  }
  forget(reciter: string, surah: number, ayah: number) {
    if (this.inv.delete(keyOf({ reciter, surah, ayah }))) this.bump()
  }

  // ----- saving -----
  async save(reciter: string, range: Range, hooks: { onProgress?: (done: number, total: number, bytes: number) => void; signal?: AbortSignal } = {}): Promise<SaveResult> {
    const result: SaveResult = { stopped: 'done', saved: 0, failed: [], bytes: 0 }
    if (!this.store || !offlineEndpoint(reciter)) return { ...result, stopped: 'not-permitted' }
    const { missing } = this.coverage(reciter, range)
    if (missing.length === 0) return result
    if (!this.o.online()) return { ...result, stopped: 'offline' }
    const need = this.estimateBytes(reciter, range.surah, missing)
    if (this.totalBytes() + need > this.o.maxBytes) return { ...result, stopped: 'too-large' }
    const free = await this.o.freeBytes()
    if (free !== null && need * 1.25 > free) return { ...result, stopped: 'space' }
    try { await navigator.storage?.persist?.() } catch { /* best effort only; never relied on */ }

    const fetchFn = this.o.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
    const queue = [...missing]
    let done = 0
    let savedBytes = 0
    let halt: SaveStop | null = null
    const worker = async () => {
      while (!halt && !hooks.signal?.aborted) {
        const ayah = queue.shift()
        if (ayah === undefined) return
        const failure = await this.saveOne(fetchFn, reciter, range.surah, ayah, hooks.signal)
        if (failure === 'cancelled') { halt = 'cancelled'; return }
        if (failure === 'space') { halt = 'space'; return }
        if (failure === 'offline') { halt = 'offline'; return }
        if (failure) result.failed.push({ ayah, reason: failure }); else { result.saved++; savedBytes += this.inv.get(keyOf({ reciter, surah: range.surah, ayah })) ?? 0 }
        hooks.onProgress?.(++done, missing.length, savedBytes)
      }
    }
    await Promise.all(Array.from({ length: Math.min(this.o.concurrency, missing.length) }, worker))
    if (hooks.signal?.aborted && !halt) halt = 'cancelled'
    if (halt) result.stopped = halt
    result.bytes = this.coverage(reciter, range).bytes
    this.o.ledger.write([...this.ledgerKeys])
    this.bump()
    return result
  }

  /** null = saved; otherwise the reason. Writes only after the whole file is read, validated and read back. */
  private async saveOne(fetchFn: typeof fetch, reciter: string, surah: number, ayah: number, signal?: AbortSignal): Promise<string | null> {
    const url = offlineUrl(reciter, surah, ayah)
    if (!url) return 'not permitted'
    let lastReason = 'could not be fetched'
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) return 'cancelled'
      try {
        const res = await fetchFn(url, { signal, mode: 'cors', credentials: 'omit' })
        const blob = await res.blob()
        const bad = validateAudio(res, blob)
        if (bad) { lastReason = bad; if (res.status >= 400 && res.status < 500) return lastReason; continue }
        const k = { reciter, surah, ayah }
        await this.store!.put(k, blob)
        const back = await this.store!.get(k)
        if (!back || back.size !== blob.size) { await this.store!.remove(k).catch(() => undefined); lastReason = 'could not be stored'; continue }
        this.inv.set(keyOf(k), blob.size)
        this.ledgerKeys.add(keyOf(k))
        return null
      } catch (e) {
        const name = e instanceof Error ? e.name : ''
        if (name === 'AbortError') return 'cancelled'
        if (name === 'QuotaExceededError') return 'space'
        if (!this.o.online()) return 'offline'
        lastReason = 'could not be reached'
      }
      if (attempt === 0 && this.o.retryDelayMs > 0) await new Promise((r) => setTimeout(r, this.o.retryDelayMs))
    }
    return lastReason
  }

  // ----- managed saves: one at a time, resumable, visible to every screen -----
  private intentList(): Intent[] { return this.o.intents.read() }
  private sameIntent = (a: Intent, reciter: string, r: Range) => a.reciter === reciter && a.surah === r.surah && a.start === r.start && a.end === r.end
  private dropIntent(reciter: string, r: Range) { this.o.intents.write(this.intentList().filter((i) => !this.sameIntent(i, reciter, r))) }
  hasIntent(reciter: string, r: Range) { return this.intentList().some((i) => this.sameIntent(i, reciter, r)) }

  /** The person asked to save this range. Runs in the background; resumes by itself if the app is interrupted. */
  start(reciter: string, range: Range): Promise<SaveResult> {
    if (!this.hasIntent(reciter, range)) this.o.intents.write([...this.intentList(), { reciter, ...{ surah: range.surah, start: range.start, end: range.end }, tries: 0 }])
    return this.run(reciter, range)
  }
  /** Stop what is being saved and do not resume it. Recordings already saved are kept. */
  cancel() {
    if (this.job) this.dropIntent(this.job.reciter, this.job.range)
    this.ctl?.abort()
  }
  private run(reciter: string, range: Range): Promise<SaveResult> {
    const go = async (): Promise<SaveResult> => {
      const ctl = new AbortController()
      this.ctl = ctl
      this.job = { reciter, range, done: 0, total: this.coverage(reciter, range).missing.length, bytes: 0 }
      this.lastResult = null
      this.bump()
      let result: SaveResult = { stopped: 'done', saved: 0, failed: [], bytes: 0 }
      try {
        result = await this.save(reciter, range, { signal: ctl.signal, onProgress: (done, total, bytes) => { this.job = { reciter, range, done, total, bytes }; this.bump() } })
        this.settle(reciter, range, result)
      } finally {
        this.job = null; this.ctl = null
        this.lastResult = { reciter, range, result }
        this.bump()
      }
      return result
    }
    const p = this.chain.then(go, go)
    this.chain = p.catch(() => undefined)
    return p
  }
  /** Keep the request only while retrying could help. */
  private settle(reciter: string, range: Range, r: SaveResult) {
    if (this.coverage(reciter, range).complete) return this.dropIntent(reciter, range)
    const cur = this.intentList().find((i) => this.sameIntent(i, reciter, range))
    if (!cur) return
    const permanent = r.failed.length > 0 && r.failed.every((f) => f.reason.startsWith('server said 4') || f.reason === 'not an audio file' || f.reason === 'file too small')
    const interrupted = r.stopped === 'offline' || (r.stopped === 'done' && r.failed.length > 0 && !permanent) || (r.stopped === 'cancelled' && this.hasIntent(reciter, range))
    const tries = r.saved > 0 ? 0 : cur.tries + 1
    if (!interrupted || tries >= MAX_TRIES) return this.dropIntent(reciter, range)
    this.o.intents.write(this.intentList().map((i) => (this.sameIntent(i, reciter, range) ? { ...i, tries } : i)))
  }
  /** Finish saves that were started earlier and interrupted (app closed, connection lost). Safe to call often. */
  async resumePending(): Promise<void> {
    if (!this.store || this.job || !this.o.online()) return
    for (const i of this.intentList()) {
      const range = { surah: i.surah, start: i.start, end: i.end }
      if (this.coverage(i.reciter, range).complete) { this.dropIntent(i.reciter, range); continue }
      await this.run(i.reciter, range)
      if (!this.o.online()) return
    }
  }

  // ----- removing (media only; never touches memorisation history) -----
  async remove(keys: RecKey[]): Promise<void> {
    if (!this.store) return
    for (const k of keys) {
      try { await this.store.remove(k) } catch { /* already gone */ }
      this.inv.delete(keyOf(k))
      this.ledgerKeys.delete(keyOf(k))
    }
    this.o.ledger.write([...this.ledgerKeys])
    // Anything we were still trying to save in these places is no longer wanted.
    const gone = new Set(keys.map((k) => `${k.reciter}:${k.surah}`))
    this.o.intents.write(this.intentList().filter((i) => !gone.has(`${i.reciter}:${i.surah}`)))
    this.bump()
  }
  async removeAll(): Promise<void> { await this.remove(this.allKeys()) }
}

// ---------- goals ----------
/** Which recordings a set of goals/passages still needs: those inside any want's range, for the reciter in use. */
export function neededBy(key: RecKey, wants: Want[], reciter: string): Want[] {
  if (key.reciter !== reciter) return []
  return wants.filter((w) => w.range.surah === key.surah && key.ayah >= w.range.start && key.ayah <= w.range.end)
}

/** Splits recordings into those that can go and those another goal still needs (so we can say so before deleting anything). */
export function planRemoval(keys: RecKey[], wants: Want[], reciter: string, exceptWantId?: string): { remove: RecKey[]; keep: { key: RecKey; by: Want[] }[] } {
  const others = wants.filter((w) => w.id !== exceptWantId)
  const remove: RecKey[] = [], keep: { key: RecKey; by: Want[] }[] = []
  for (const key of keys) {
    const by = neededBy(key, others, reciter)
    if (by.length) keep.push({ key, by }); else remove.push(key)
  }
  return { remove, keep }
}

export const rangeLabel = (start: number, end: number) => (start === end ? `${start}` : `${start}–${end}`)
export const reciterName = (id: string) => reciterById(id).name

function makeStore(): AudioStore | null {
  try { return typeof caches !== 'undefined' && typeof self !== 'undefined' && 'location' in self ? new CacheAudioStore() : null } catch { return null }
}
/** The app-wide instance. */
export const offlineAudio = new OfflineAudio(makeStore())
