// What the app has actually observed on this device about each reciter's verse-by-verse audio.
// Nothing here is assumed: a reciter is "confirmed" only after a real file played, and "unavailable"
// only after every candidate failed. The record is kept per device (localStorage) with a timestamp.
export type AyahAudioState = 'unknown' | 'confirmed' | 'unavailable'
export interface ReciterStatus {
  state: AyahAudioState
  /** Host label that served the last successful file. */
  via?: string
  at?: number
}

const KEY = 'hifz.audioStatus.v1'
const listeners = new Set<() => void>()
let cache: Record<string, ReciterStatus> | null = null

function load(): Record<string, ReciterStatus> {
  if (cache) return cache
  try { cache = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, ReciterStatus> } catch { cache = {} }
  return cache
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cache ?? {})) } catch { /* private mode */ }
  for (const l of listeners) l()
}

export const reciterStatus = (id: string): ReciterStatus => load()[id] ?? { state: 'unknown' }
export function recordConfirmed(id: string, via: string, now = Date.now()) {
  load()[id] = { state: 'confirmed', via, at: now }
  save()
}
export function recordUnavailable(id: string, now = Date.now()) {
  // A single failed attempt must not overwrite a confirmed record (it may be a dropped connection).
  const cur = load()[id]
  if (cur?.state === 'confirmed' && now - (cur.at ?? 0) < 7 * 24 * 3600 * 1000) return
  load()[id] = { state: 'unavailable', at: now }
  save()
}
export function subscribeStatus(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn) }
export function resetStatusCache() { cache = null }
