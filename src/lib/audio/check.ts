// Proves, on the user's own device, what each reciter's audio really does. A directory listing is not playback:
// only a file that actually loads counts. Nothing is assumed, and a failed check never plays a different reciter.
import { candidateUrls, reciterById } from './sources'
import { fullSurahAudio, type SurahAudio } from './mp3quran'
import { recordConfirmed, recordUnavailable } from './status'

/** Ta-Ha: the first ayah, a middle one, and the last, to prove the file naming holds across the whole surah. */
export const PROBE_AYAHS: [number, number][] = [[20, 1], [20, 77], [20, 135]]

export type Probe = (url: string) => Promise<boolean>

export interface ReciterCheck {
  id: string
  name: string
  verse: { state: 'ok' | 'fail' | 'none'; via?: string; detail: string }
  full: { state: 'ok' | 'fail' | 'none'; detail: string }
}

/** Real-browser probe: does the URL load as audio (metadata only; the whole file is not downloaded). */
export const browserProbe: Probe = (url) =>
  new Promise((resolve) => {
    const a = new Audio()
    const done = (ok: boolean) => { clearTimeout(t); a.removeAttribute('src'); a.load(); resolve(ok) }
    const t = setTimeout(() => done(false), 9000)
    a.preload = 'metadata'
    a.addEventListener('loadedmetadata', () => done(Number.isFinite(a.duration) && a.duration > 0))
    a.addEventListener('error', () => done(false))
    a.src = url
    a.load()
  })

export async function checkReciter(id: string, deps: { probe: Probe; fullSurah?: (id: string, surah: number) => Promise<SurahAudio>; online?: boolean } = { probe: browserProbe }): Promise<ReciterCheck> {
  const r = reciterById(id)
  const online = deps.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine)
  const out: ReciterCheck = { id, name: r.name, verse: { state: 'none', detail: 'No verse-by-verse source is known.' }, full: { state: 'none', detail: 'No full-surah source is configured.' } }

  // Verse by verse: the first host whose files ALL load for the three test ayahs.
  const hosts = candidateUrls(id, PROBE_AYAHS[0]![0], PROBE_AYAHS[0]![1]).map((c) => c.source)
  if (hosts.length) {
    out.verse = { state: 'fail', detail: `Not found on ${hosts.join(' or ')}.` }
    for (let h = 0; h < hosts.length; h++) {
      const urls = PROBE_AYAHS.map(([s, a]) => candidateUrls(id, s, a)[h]!.url)
      const results: boolean[] = []
      for (const u of urls) results.push(await deps.probe(u))
      if (results.every(Boolean)) { out.verse = { state: 'ok', via: hosts[h], detail: `Played ${PROBE_AYAHS.map(([s, a]) => `${s}:${a}`).join(', ')} via ${hosts[h]}.` }; break }
      out.verse.detail = `${hosts[h]}: ${results.filter(Boolean).length} of ${results.length} test files loaded.`
    }
    if (out.verse.state === 'ok') recordConfirmed(id, out.verse.via!)
    else if (online) recordUnavailable(id)
  }

  // Full surah (MP3Quran), looked up by name at runtime.
  if (r.mp3quran?.length) {
    const lookup = deps.fullSurah ?? ((rid: string, s: number) => fullSurahAudio(rid, s))
    const f = await lookup(id, 20)
    if (!f.ok) out.full = { state: 'fail', detail: f.reason }
    else out.full = (await deps.probe(f.url)) ? { state: 'ok', detail: 'Full-surah recording loads (Ta-Ha).' } : { state: 'fail', detail: 'Listed by MP3Quran, but the file did not load here.' }
  }
  return out
}

export async function checkMyReciters(deps?: Parameters<typeof checkReciter>[1]): Promise<ReciterCheck[]> {
  const res: ReciterCheck[] = []
  for (const id of ['turki', 'dossary', 'maher']) res.push(await checkReciter(id, deps))
  return res
}
