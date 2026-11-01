// Proves, on the user's own device, what each reciter's audio really does. A directory listing is not playback:
// only a file that actually loads counts. Nothing is assumed, and a failed check never plays a different reciter.
import { candidateUrls, offlineUrl, reciterById } from './sources'
import { validateAudio } from './offline'
import { ayahBytes } from './phraseSource'
import { SLICE_TOLERANCE_MS, cutPoints, sameRecording, toMono } from './phraseAudio'
import { ayahTiming, proposeRange, recordingsFor, reciterPauses } from './timings'
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
  /** Could a copy be saved to this device? A real download of one file (not stored), checked the way saving checks it. */
  save: { state: 'ok' | 'fail' | 'none'; detail: string }
  /** Phrase-only playback: are there verified word timings for this recording, and do they fit the real audio on this device? */
  phrase: { state: 'ok' | 'fail' | 'none'; detail: string }
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

export async function checkReciter(id: string, deps: { probe: Probe; fullSurah?: (id: string, surah: number) => Promise<SurahAudio>; online?: boolean; fetchFn?: typeof fetch; skipPhrase?: boolean } = { probe: browserProbe }): Promise<ReciterCheck> {
  const r = reciterById(id)
  const online = deps.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine)
  const out: ReciterCheck = { id, name: r.name, verse: { state: 'none', detail: 'No verse-by-verse source is known.' }, full: { state: 'none', detail: 'No full-surah source is configured.' }, save: { state: 'none', detail: 'Saving isn’t available for this reciter.' }, phrase: { state: 'none', detail: 'No phrase timings for this reciter yet.' } }

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

  // Saving: only for reciters whose source allows it, and only a real download of one file, validated exactly as a save would be.
  const saveUrl = offlineUrl(id, PROBE_AYAHS[0]![0], PROBE_AYAHS[0]![1])
  if (saveUrl) {
    try {
      const res = await (deps.fetchFn ?? fetch)(saveUrl, { mode: 'cors', credentials: 'omit' })
      const blob = await res.blob()
      const bad = validateAudio(res, blob)
      out.save = bad ? { state: 'fail', detail: `The file couldn’t be saved (${bad}).` } : { state: 'ok', detail: 'Can be saved to this device.' }
    } catch {
      out.save = { state: 'fail', detail: online ? 'The host didn’t allow saving from this app.' : 'No connection.' }
    }
  }
  if (!deps.skipPhrase) out.phrase = await checkPhraseAudio(id)
  return out
}

/**
 * Real-audio check of phrase playback for one reciter: for a few aligned ayahs, fetch the actual recording on this device, decode it, confirm
 * its length matches the timing, and test every boundary that phrase playback would use. Reports how many boundaries have a genuine pause.
 */
export async function checkPhraseAudio(id: string, sample = 4): Promise<{ state: 'ok' | 'fail' | 'none'; detail: string }> {
  try {
    const recs = await recordingsFor(id)
    if (!recs.length) return { state: 'none', detail: 'No verified phrase timings for this reciter yet.' }
    const AC = typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : null
    if (!AC) return { state: 'fail', detail: 'This browser cannot decode audio for phrase playback.' }
    const notes: string[] = []
    for (const rec of recs) {
      const recording = rec.provenance.recording
      const keys = Object.keys(rec.ayahs).sort((a, b) => (a.startsWith('20:') ? 0 : 1) - (b.startsWith('20:') ? 0 : 1)).slice(0, sample)
      let boundaries = 0, clean = 0, wrong = 0, unreadable = 0
      for (const k of keys) {
        const [s, a] = k.split(':').map(Number) as [number, number]
        const t = await ayahTiming(id, recording, s, a)
        if (!t) continue
        for (const p of reciterPauses(t).filter((x) => x.ms >= 150).slice(0, 3)) {
          const prop = proposeRange(t, 0, p.afterWord)
          if (!prop) continue
          boundaries++
          try {
            const got = await ayahBytes(id, rec, s, a, t, prop)
            const buf = await new AC(1, 1, 44100).decodeAudioData(got.data.slice(0))
            const ok = got.expectMs === undefined ? sameRecording(t, buf.duration) : Math.abs(buf.duration * 1000 - got.expectMs) <= SLICE_TOLERANCE_MS
            if (!ok) { wrong++; continue }
            const o = got.originMs
            const local = { startMs: prop.startMs - o, endMs: prop.endMs - o, startGap: prop.startGap && ([prop.startGap[0] - o, prop.startGap[1] - o] as [number, number]), endGap: prop.endGap && ([prop.endGap[0] - o, prop.endGap[1] - o] as [number, number]) }
            if (cutPoints({ sampleRate: buf.sampleRate, samples: toMono(buf) }, local, buf.duration)) clean++
          } catch { unreadable++ }
        }
      }
      const label = (rec.provenance.granularity ?? 'ayah') === 'surah' ? 'whole-surah recording' : 'per-ayah recording'
      if (boundaries && unreadable === boundaries) notes.push(`${label}: the host would not let the app read it (phrase audio falls back to the whole ayah)`)
      else if (wrong) notes.push(`${label}: ${wrong} of ${boundaries} samples differ from their timings, so phrase audio is switched off for them`)
      else notes.push(`${label}: ${clean} of ${boundaries} sampled pauses are genuine and clean to cut at`)
    }
    const ok = notes.every((n) => /genuine and clean/.test(n)) && !notes.some((n) => /: 0 of/.test(n))
    return { state: ok ? 'ok' : 'fail', detail: notes.join('. ') + '.' }
  } catch { /* fall through */ }
  return { state: 'none', detail: 'No verified phrase timings for this reciter yet.' }
}

export async function checkMyReciters(deps?: Parameters<typeof checkReciter>[1]): Promise<ReciterCheck[]> {
  const res: ReciterCheck[] = []
  for (const id of ['turki', 'dossary', 'maher']) res.push(await checkReciter(id, deps))
  return res
}
