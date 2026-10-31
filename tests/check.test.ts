import { describe, expect, it } from 'vitest'
import { checkMyReciters, checkReciter, PROBE_AYAHS } from '@/lib/audio/check'
import { candidateUrls, SOURCES } from '@/lib/audio/sources'
import { reciterStatus, resetStatusCache } from '@/lib/audio/status'
import { surahFileUrl } from '@/lib/audio/mp3quran'

const allow = (...needles: string[]) => async (u: string) => needles.some((n) => u.includes(n))
const none = async () => false

describe('the exact EveryAyah folders the owner found', () => {
  it('builds <folder>/<SSS><AAA>.mp3 URLs for Ta-Ha in those directories', () => {
    expect(SOURCES.everyayah.urlFor('MaherAlMuaiqly128kbps', 20, 1)).toBe('https://everyayah.com/data/MaherAlMuaiqly128kbps/020001.mp3')
    expect(SOURCES.everyayah.urlFor('Yasser_Ad-Dussary_128kbps', 20, 135)).toBe('https://everyayah.com/data/Yasser_Ad-Dussary_128kbps/020135.mp3')
    expect(candidateUrls('maher', 20, 77)[0]!.url).toBe('https://everyayah.com/data/MaherAlMuaiqly128kbps/020077.mp3')
    expect(candidateUrls('dossary', 20, 77)[0]!.url).toBe('https://everyayah.com/data/Yasser_Ad-Dussary_128kbps/020077.mp3')
  })
  it('Badr Al-Turki has no verse-by-verse candidate, by design', () => {
    expect(candidateUrls('turki', 20, 1)).toEqual([])
  })
  it('builds MP3Quran full-surah file names with three-digit surah numbers', () => {
    expect(surahFileUrl('https://server8.example.net/x/', 20)).toBe('https://server8.example.net/x/020.mp3')
  })
})

describe('on-device verification', () => {
  it('confirms a reciter only when ALL of first, middle and last Ta-Ha files load', async () => {
    resetStatusCache()
    const ok = await checkReciter('maher', { probe: allow('MaherAlMuaiqly128kbps'), online: true })
    expect(ok.verse).toMatchObject({ state: 'ok', via: 'EveryAyah' })
    expect(ok.verse.detail).toContain('20:135')
  })
  it('a directory that only partly works is reported as failing, with the count', async () => {
    resetStatusCache()
    const partial = await checkReciter('dossary', { probe: async (u) => u.includes('020001') || u.includes('020077'), online: true })
    expect(partial.verse.state).toBe('fail')
    expect(partial.verse.detail).toMatch(/2 of 3/)
  })
  it('falls through to the same reciter’s next host, never to another reciter', async () => {
    resetStatusCache()
    const tried: string[] = []
    const r = await checkReciter('maher', { probe: async (u) => { tried.push(u); return u.includes('cdn.islamic.network') }, online: true })
    expect(r.verse).toMatchObject({ state: 'ok', via: 'Islamic Network CDN' })
    for (const u of tried) expect(u).toMatch(/Maher|mahermuaiqly/i)
  })
  it('Badr Al-Turki: no verse source is claimed; a full-surah source is reported honestly', async () => {
    const found = await checkReciter('turki', { probe: allow('mp3'), fullSurah: async () => ({ ok: true, url: 'https://s.example/020.mp3', label: 'x' }), online: true })
    expect(found.verse.state).toBe('none')
    expect(found.full.state).toBe('ok')
    const missing = await checkReciter('turki', { probe: none, fullSurah: async () => ({ ok: false, reason: 'Could not reach the MP3Quran catalogue from this device.' }), online: true })
    expect(missing.full).toMatchObject({ state: 'fail', detail: expect.stringContaining('MP3Quran') })
    const listedButBroken = await checkReciter('turki', { probe: none, fullSurah: async () => ({ ok: true, url: 'https://s.example/020.mp3', label: 'x' }), online: true })
    expect(listedButBroken.full.state).toBe('fail')
  })
  it('checks the three reciters by name, in order', async () => {
    const all = await checkMyReciters({ probe: none, fullSurah: async () => ({ ok: false, reason: 'n/a' }), online: false })
    expect(all.map((r) => r.id)).toEqual(['turki', 'dossary', 'maher'])
    expect(all.map((r) => r.name)).toEqual(['Badr Al-Turki', 'Yasser Al-Dossary', 'Maher Al-Mu’aiqly'])
  })
  it('records what was observed, and an offline failure never marks a reciter unavailable', async () => {
    resetStatusCache()
    await checkReciter('dossary', { probe: none, online: false })
    expect(reciterStatus('dossary').state).toBe('unknown')
    await checkReciter('dossary', { probe: none, online: true })
    expect(reciterStatus('dossary').state).toBe('unavailable')
    await checkReciter('dossary', { probe: allow('Yasser_Ad-Dussary_128kbps'), online: true })
    expect(reciterStatus('dossary')).toMatchObject({ state: 'confirmed', via: 'EveryAyah' })
  })
  it('uses the intended probe ayahs', () => { expect(PROBE_AYAHS).toEqual([[20, 1], [20, 77], [20, 135]]) })
})
