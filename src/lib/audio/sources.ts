// Swappable audio sources. Audio is LINKED from third-party hosts, never hosted or
// redistributed by this app, and no private API credentials are involved.
// Licensing: EveryAyah and Islamic Network state no explicit licence for programmatic use.
// Keep that visible to the user (Settings → About) and prefer a licensed source if you
// obtain credentials (see docs/AUDIO.md). Adding one means implementing AudioSource only.
import { globalAyahNumber } from '@/lib/quran/data'

export interface Endpoint {
  source: 'everyayah' | 'islamicnetwork'
  ref: string
}
export interface Reciter {
  id: string
  name: string
  /** Arabic name, used to find the reciter in third-party catalogues and shown in the picker. */
  arabic?: string
  style: 'Murattal' | 'Mujawwad' | 'Teaching'
  /**
   * Verse-by-verse candidates, tried in order. A candidate is only a *candidate*: whether it really
   * serves a file is learned on the user's device (see status.ts) and shown honestly in the picker.
   * An empty list means no verse-by-verse source is known for this reciter.
   */
  endpoints: Endpoint[]
  /** Names to look for in the MP3Quran catalogue, for full-surah recordings (see mp3quran.ts). */
  mp3quran?: string[]
  /** Short note shown in the picker. */
  note?: string
}
export interface AudioSource {
  id: Endpoint['source']
  label: string
  urlFor(ref: string, surah: number, ayah: number): string
}

const pad3 = (n: number) => String(n).padStart(3, '0')

export const SOURCES: Record<Endpoint['source'], AudioSource> = {
  everyayah: {
    id: 'everyayah',
    label: 'EveryAyah',
    urlFor: (folder, s, a) => `https://everyayah.com/data/${folder}/${pad3(s)}${pad3(a)}.mp3`,
  },
  islamicnetwork: {
    id: 'islamicnetwork',
    label: 'Islamic Network CDN',
    urlFor: (edition, s, a) => `https://cdn.islamic.network/quran/audio/128/${edition}/${globalAyahNumber(s, a)}.mp3`,
  },
}

/**
 * May a copy be kept on the listener's own device? Streaming a public file is not the same as having permission to save it, so this is
 * decided per source, from the source's own published terms, and defaults to NO. Changing a value here is a licensing decision.
 *  - Islamic Network (alquran.cloud): an open audio CDN whose terms ask clients to cache files; no restriction on keeping a copy was found.
 *    (Read only through search summaries; the terms page itself could not be opened from the build environment.)
 *  - EveryAyah: publishes no licence and says the recordings belong to the reciters, so saving stays OFF until the operator or the
 *    reciters give permission.
 */
export const SOURCE_RIGHTS: Record<Endpoint['source'], { saveOffline: boolean; basis: string; terms: string }> = {
  islamicnetwork: { saveOffline: true, basis: 'An open audio CDN that asks apps to cache its files; no restriction on keeping a copy was found.', terms: 'https://alquran.cloud/terms-and-conditions' },
  everyayah: { saveOffline: false, basis: 'No licence is published; the recordings belong to their reciters.', terms: 'https://everyayah.com' },
}

/** The first endpoint of this reciter whose source allows saving a copy, or null when saving is not permitted. */
export function offlineEndpoint(reciterId: string): Endpoint | null {
  return reciterById(reciterId).endpoints.find((e) => SOURCE_RIGHTS[e.source].saveOffline) ?? null
}
export const canSaveOffline = (reciterId: string) => offlineEndpoint(reciterId) !== null
/** The reciters whose recordings may be saved, your three first. */
export const saveableReciters = (): Reciter[] => RECITERS.filter((r) => canSaveOffline(r.id))
export function offlineUrl(reciterId: string, surah: number, ayah: number): string | null {
  const e = offlineEndpoint(reciterId)
  return e ? SOURCES[e.source].urlFor(e.ref, surah, ayah) : null
}

export const RECITERS: Reciter[] = [
  // The reciters the owner asked for by name. Verse-by-verse candidates are tried in order. The two EveryAyah folders are the exact
  // directories the owner found (https://everyayah.com/data/MaherAlMuaiqly128kbps/ and .../Yasser_Ad-Dussary_128kbps/); EveryAyah's
  // file convention is <folder>/<SSS><AAA>.mp3. Neither the folders nor any file could be fetched from the build environment, so the
  // app proves them on the device (see check.ts) and shows what it observed; a directory listing is never treated as playback.
  { id: 'turki', name: 'Badr Al-Turki', arabic: 'بدر التركي', style: 'Murattal', endpoints: [], mp3quran: ['بدر التركي', 'Badr Al-Turki', 'Badr Alturki', 'Badr Al Turki'], note: 'Full-surah recordings via MP3Quran. No verse-by-verse source known.' },
  { id: 'dossary', name: 'Yasser Al-Dossary', arabic: 'ياسر الدوسري', style: 'Murattal', endpoints: [{ source: 'everyayah', ref: 'Yasser_Ad-Dussary_128kbps' }], mp3quran: ['ياسر الدوسري', 'Yasser Al-Dosari', 'Yasser Ad-Dussary', 'Yasser Al-Dossary'] },
  { id: 'maher', name: 'Maher Al-Mu’aiqly', arabic: 'ماهر المعيقلي', style: 'Murattal', endpoints: [{ source: 'everyayah', ref: 'MaherAlMuaiqly128kbps' }, { source: 'islamicnetwork', ref: 'ar.mahermuaiqly' }], mp3quran: ['ماهر المعيقلي', 'Maher Al-Muaiqly', 'Maher Almuaiqly', 'Maher Al Muaiqly'] },
  { id: 'alafasy', name: 'Mishary Alafasy', style: 'Murattal', endpoints: [{ source: 'everyayah', ref: 'Alafasy_128kbps' }, { source: 'islamicnetwork', ref: 'ar.alafasy' }], note: 'Clear, moderate pace. A good default.' },
  { id: 'husary', name: 'Mahmoud Khalil Al-Husary', style: 'Murattal', endpoints: [{ source: 'everyayah', ref: 'Husary_128kbps' }, { source: 'islamicnetwork', ref: 'ar.husary' }], note: 'Slow and precise.' },
  { id: 'husary-muallim', name: 'Al-Husary (teaching)', style: 'Teaching', endpoints: [{ source: 'everyayah', ref: 'Husary_Muallim_128kbps' }], note: 'Slow recitation with pauses, designed for learners.' },
  { id: 'minshawi', name: 'Mohamed Siddiq Al-Minshawi', style: 'Murattal', endpoints: [{ source: 'everyayah', ref: 'Minshawy_Murattal_128kbps' }, { source: 'islamicnetwork', ref: 'ar.minshawi' }] },
  { id: 'abdulbasit', name: 'Abdul Basit Abdus Samad', style: 'Murattal', endpoints: [{ source: 'everyayah', ref: 'Abdul_Basit_Murattal_192kbps' }, { source: 'islamicnetwork', ref: 'ar.abdulbasitmurattal' }] },
  { id: 'sudais', name: 'Abdurrahman As-Sudais', style: 'Murattal', endpoints: [{ source: 'everyayah', ref: 'Abdurrahmaan_As-Sudais_192kbps' }, { source: 'islamicnetwork', ref: 'ar.abdurrahmaansudais' }] },
  { id: 'shuraym', name: 'Saud Ash-Shuraym', style: 'Murattal', endpoints: [{ source: 'everyayah', ref: 'Saood_ash-Shuraym_128kbps' }, { source: 'islamicnetwork', ref: 'ar.saoodshuraym' }] },
  { id: 'shaatree', name: 'Abu Bakr Ash-Shaatree', style: 'Murattal', endpoints: [{ source: 'everyayah', ref: 'Abu_Bakr_Ash-Shaatree_128kbps' }, { source: 'islamicnetwork', ref: 'ar.shaatree' }] },
  { id: 'hudhaify', name: 'Ali Al-Hudhaify', style: 'Murattal', endpoints: [{ source: 'everyayah', ref: 'Hudhaify_128kbps' }, { source: 'islamicnetwork', ref: 'ar.hudhaify' }] },
  { id: 'ayyoub', name: 'Muhammad Ayyoub', style: 'Murattal', endpoints: [{ source: 'everyayah', ref: 'Muhammad_Ayyoub_128kbps' }, { source: 'islamicnetwork', ref: 'ar.muhammadayyoub' }] },
  { id: 'rifai', name: 'Hani Ar-Rifai', style: 'Murattal', endpoints: [{ source: 'everyayah', ref: 'Hani_Rifai_192kbps' }, { source: 'islamicnetwork', ref: 'ar.hanirifai' }] },
]

/** Unknown ids fall back to Alafasy (a reciter with verse-by-verse sources), never to whichever happens to be listed first. */
export const reciterById = (id: string): Reciter => RECITERS.find((r) => r.id === id) ?? RECITERS.find((r) => r.id === 'alafasy')!

/** All candidate URLs for one ayah, in the order they should be tried. */
export function candidateUrls(reciterId: string, surah: number, ayah: number): { url: string; source: string }[] {
  return reciterById(reciterId).endpoints.map((e) => ({ url: SOURCES[e.source].urlFor(e.ref, surah, ayah), source: SOURCES[e.source].label }))
}

/** Identity of one specific recording (source and folder). Word timings belong to exactly one of these, never to a reciter in general. */
export const recordingId = (e: Endpoint) => `${e.source}:${e.ref}`
export const endpointByRecording = (reciterId: string, recording: string): Endpoint | null => reciterById(reciterId).endpoints.find((e) => recordingId(e) === recording) ?? null
export const urlForEndpoint = (e: Endpoint, surah: number, ayah: number) => SOURCES[e.source].urlFor(e.ref, surah, ayah)

/** True when at least one verse-by-verse candidate exists for this reciter. */
export const hasAyahCandidates = (reciterId: string) => reciterById(reciterId).endpoints.length > 0

/** Existing behaviour: an unknown id used to fall back to the first reciter. Callers that must not do that use this. */
export const isKnownReciter = (id: string) => RECITERS.some((r) => r.id === id)
