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
  style: 'Murattal' | 'Mujawwad' | 'Teaching'
  endpoints: Endpoint[]
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

export const RECITERS: Reciter[] = [
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

export const reciterById = (id: string): Reciter => RECITERS.find((r) => r.id === id) ?? RECITERS[0]!

/** All candidate URLs for one ayah, in the order they should be tried. */
export function candidateUrls(reciterId: string, surah: number, ayah: number): { url: string; source: string }[] {
  return reciterById(reciterId).endpoints.map((e) => ({ url: SOURCES[e.source].urlFor(e.ref, surah, ayah), source: SOURCES[e.source].label }))
}
