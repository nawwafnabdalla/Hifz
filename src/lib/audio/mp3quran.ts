// MP3Quran full-surah recordings, discovered at RUNTIME from its public catalogue on the user's device.
//
// Why runtime: the build environment cannot reach mp3quran.net, so no reciter id, server path or surah
// list is hardcoded from memory. The response is validated; anything unexpected means "unavailable",
// never a guess. This module provides FULL-SURAH audio only. MP3Quran verse timings are deliberately not
// used: they could not be inspected or verified, and ayah boundaries are never estimated.
import { z } from 'zod'
import { reciterById } from './sources'

const CATALOGUE_URL = 'https://mp3quran.net/api/v3/reciters?language=ar'
const CACHE_KEY = 'hifz.mp3quran.v1'
const MAX_AGE = 7 * 24 * 3600 * 1000

const moshafSchema = z.object({ id: z.number(), name: z.string(), server: z.string().url(), surah_list: z.string() })
const catalogueSchema = z.object({ reciters: z.array(z.object({ id: z.number(), name: z.string(), moshaf: z.array(moshafSchema) })) })
export type Catalogue = z.infer<typeof catalogueSchema>['reciters']

const norm = (s: string) => s.normalize('NFKC').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase()

export function pickMoshaf(moshafs: z.infer<typeof moshafSchema>[], surah: number): z.infer<typeof moshafSchema> | null {
  const has = (m: z.infer<typeof moshafSchema>) => m.surah_list.split(',').map((x) => x.trim()).includes(String(surah))
  const withSurah = moshafs.filter(has)
  if (!withSurah.length) return null
  // Prefer Hafs ʿan ʿĀṣim, the riwaya of the text in this app.
  return withSurah.find((m) => /حفص|hafs/i.test(m.name)) ?? withSurah[0]!
}

export function surahFileUrl(server: string, surah: number): string {
  return `${server.replace(/\/+$/, '')}/${String(surah).padStart(3, '0')}.mp3`
}

export function findReciter(cat: Catalogue, names: string[]): Catalogue[number] | null {
  const wanted = names.map(norm)
  return cat.find((r) => wanted.some((w) => norm(r.name).includes(w) || w.includes(norm(r.name)))) ?? null
}

export function parseCatalogue(json: unknown): Catalogue | null {
  const r = catalogueSchema.safeParse(json)
  return r.success ? r.data.reciters : null
}

export async function loadCatalogue(fetcher: typeof fetch = fetch, now = Date.now()): Promise<Catalogue | null> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) { const c = JSON.parse(raw) as { at: number; data: unknown }; const p = now - c.at < MAX_AGE ? parseCatalogue(c.data) : null; if (p) return p }
  } catch { /* ignore */ }
  try {
    const res = await fetcher(CATALOGUE_URL)
    if (!res.ok) return null
    const json = await res.json()
    const cat = parseCatalogue(json)
    if (!cat) return null
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: now, data: { reciters: cat } })) } catch { /* quota */ }
    return cat
  } catch { return null }
}

export type SurahAudio = { ok: true; url: string; label: string } | { ok: false; reason: string }

/** The full-surah recording for a reciter, if MP3Quran lists it. Never substitutes another reciter. */
export async function fullSurahAudio(reciterId: string, surah: number, fetcher: typeof fetch = fetch): Promise<SurahAudio> {
  const r = reciterById(reciterId)
  if (!r.mp3quran?.length) return { ok: false, reason: `No full-surah source is configured for ${r.name}.` }
  const cat = await loadCatalogue(fetcher)
  if (!cat) return { ok: false, reason: 'Could not reach the MP3Quran catalogue from this device.' }
  const found = findReciter(cat, r.mp3quran)
  if (!found) return { ok: false, reason: `${r.name} was not found in the MP3Quran catalogue.` }
  const m = pickMoshaf(found.moshaf, surah)
  if (!m) return { ok: false, reason: `MP3Quran does not list surah ${surah} for ${r.name}.` }
  return { ok: true, url: surahFileUrl(m.server, surah), label: `${r.name}, full surah (MP3Quran)` }
}
