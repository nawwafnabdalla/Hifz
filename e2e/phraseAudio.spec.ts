import { expect, test, type Page } from '@playwright/test'
import { freshStart, mockAudio } from './helpers'
import { makeSurahMp3, synth, wordHz, type SurahMp3, type SynthWord } from './synthAudio'

// Ta-Ha 94 has eighteen words. The app chooses its phrases itself (grammar + printed signs + this "reciter's" pauses); the tests ask the app
// which phrases it chose and then check, word by word, that the audio of each phrase contains exactly those words.
const N = 18
const gaps = (i: number) => (i === 6 ? 450 : 70 + ((i * 17) % 50))
const WORDS: SynthWord[] = Array.from({ length: N }, (_, i) => ({ ms: 260 + ((i * 37) % 100), gapAfterMs: i === N - 1 ? 0 : gaps(i) }))
const S = synth(WORDS)
const SURAH = 20, AYAH = 94
const URL_RE = /everyayah\.com\/data\/MaherAlMuaiqly128kbps\/020094\.mp3/

type W = typeof window & { __hifzRegisterTimings: (d: unknown) => void; __hifzPhrasePlayer: { ensureContext(): AudioContext; tap: AudioNode | null; state: { status: string } }; __cap: Float32Array[]; __capRate: number }

const timingData = (over: { durationMs?: number; shift?: number; drop?: number[] } = {}) => ({
  schema: 1, reciter: 'maher',
  provenance: { source: 'test fixture', licence: 'n/a (synthetic)', url: 'about:blank', recording: 'everyayah:MaherAlMuaiqly128kbps', method: 'synthetic', retrieved: '2026-11-01' },
  ayahs: { [`${SURAH}:${AYAH}`]: { d: over.durationMs ?? S.durationMs, s: S.segments.filter((_, i) => !over.drop?.includes(i)).map(([a, b, t0, t1]) => [a, b, t0 + (over.shift ?? 0), t1 + (over.shift ?? 0)]) } },
})

async function prepare(page: Page, data: unknown = timingData(), reciter = 'maher') {
  await mockAudio(page)
  await freshStart(page)
  await page.route(URL_RE, (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: Buffer.from(S.wav), headers: { 'access-control-allow-origin': '*' } }))
  await page.goto('/settings')
  await page.getByLabel('Reciter').selectOption(reciter)
  await page.evaluate((d) => (window as W).__hifzRegisterTimings(d), data)
  await openLearn(page, AYAH)
}
const openLearn = (page: Page, a: number) => page.evaluate((a) => { history.pushState({}, '', `/learn/20/${a}/${a}`); window.dispatchEvent(new PopStateEvent('popstate')) }, a)

async function startCapture(page: Page) {
  await page.evaluate(() => {
    const w = window as W, p = w.__hifzPhrasePlayer, ctx = p.ensureContext()
    const old = (w as unknown as { __sp?: ScriptProcessorNode }).__sp
    if (old) { old.onaudioprocess = null; old.disconnect() }              // a previous capture must not keep feeding the new one
    const g = ctx.createGain(), sp = ctx.createScriptProcessor(2048, 1, 1)
    ;(w as unknown as { __sp: ScriptProcessorNode }).__sp = sp
    w.__cap = []; w.__capRate = ctx.sampleRate
    sp.onaudioprocess = (e) => { w.__cap.push(new Float32Array(e.inputBuffer.getChannelData(0))) }
    g.connect(sp); sp.connect(ctx.destination); p.tap = g
  })
}
async function untilPlayed(page: Page) {
  await page.waitForFunction(() => (window as W).__hifzPhrasePlayer.state.status === 'playing', null, { timeout: 15000 })
  await page.waitForFunction(() => (window as W).__hifzPhrasePlayer.state.status === 'idle', null, { timeout: 30000 })
  await page.waitForTimeout(250)                                             // let the last audio block reach the tap
}
async function captured(page: Page) {
  const { cap, rate } = await page.evaluate(() => { const w = window as W; const n = w.__cap.reduce((a, c) => a + c.length, 0); const out = new Float32Array(n); let o = 0; for (const c of w.__cap) { out.set(c, o); o += c.length } return { cap: Array.from(out), rate: w.__capRate } })
  return { x: Float32Array.from(cap), rate }
}
/** Hann-windowed Goertzel: average amplitude of `hz` in n samples starting at a. Sharp enough to tell pitches 97 Hz apart cleanly. */
function pitch(x: Float32Array, rate: number, hz: number, a: number, n: number) {
  const w = (2 * Math.PI * hz) / rate, c = 2 * Math.cos(w)
  let s1 = 0, s2 = 0
  for (let i = 0; i < n; i++) { const v = (x[a + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))); const s = v + c * s1 - s2; s2 = s1; s1 = s }
  return (2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2))) / n / 0.5
}
/** Amount of a pitch present in samples [a, b): windows of 100 ms at 50% overlap, magnitudes summed (so repeated copies ADD) and scaled to seconds. */
function amount(x: Float32Array, rate: number, hz: number, a: number, b: number) {
  const n = Math.round(rate * 0.1), hop = Math.round(n / 2); let s = 0
  for (let i = a; i + n <= b; i += hop) s += pitch(x, rate, hz, i, n) * (hop / rate)
  return s
}
/** How much of each word's own pitch is audible in the capture, relative to the whole word in the original (1 = all of it). */
function wordShare(x: Float32Array, rate: number) {
  return WORDS.map((_, i) => {
    const pad = Math.round(S.sampleRate * 0.05)
    const a = Math.max(0, Math.round((S.active[i]!.t0 / 1000) * S.sampleRate) - pad), b = Math.round((S.active[i]!.t1 / 1000) * S.sampleRate) + pad
    return amount(x, rate, wordHz(i), 0, x.length) / amount(S.samples, S.sampleRate, wordHz(i), a, b)
  })
}
/** Times (ms) at which a word's pitch is audible, in 60 ms windows every 20 ms. */
function audibleTimes(x: Float32Array, rate: number, word: number) {
  const n = Math.round(rate * 0.06), hop = Math.round(rate * 0.02), out: number[] = []
  const peak = pitch(S.samples, S.sampleRate, wordHz(word), Math.round((S.active[word]!.t0 / 1000) * S.sampleRate + S.sampleRate * 0.1), Math.round(S.sampleRate * 0.06))
  for (let a = 0; a + n < x.length; a += hop) if (pitch(x, rate, wordHz(word), a, n) > peak * 0.3) out.push((a / rate) * 1000)
  return out
}

/** The phrases the app chose for this ayah, from the app itself. */
const PAUSES = S.segments.slice(0, -1).map((s, i) => ({ afterWord: i, ms: Math.max(0, S.segments[i + 1]![2] - s[3]) }))
const phrasesOf = (page: Page): Promise<[number, number][]> => page.evaluate(([s, a, p]) => (window as unknown as { __hifzPhrases: (s: number, a: number, p: unknown) => [number, number][] }).__hifzPhrases(s as number, a as number, p), [SURAH, AYAH, PAUSES] as const)
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
/** Play one phrase chip and return how much of each word was heard. */
async function hear(page: Page, chip: number) {
  await startCapture(page)
  await page.getByTestId(`phrase-chip-${chip}`).click()
  await untilPlayed(page)
  const { x, rate } = await captured(page)
  return { share: wordShare(x, rate), x, rate }
}
/** Exactly these words, whole, and none of the others. */
function expectOnly(share: number[], words: number[], label: string, leak = 0.08) {
  const set = new Set(words)
  share.forEach((v, i) => { if (set.has(i)) expect(v, `${label}: word ${i + 1} clipped or missing`).toBeGreaterThan(0.8); else expect(v, `${label}: word ${i + 1} leaked in`).toBeLessThan(leak) })
}

test.describe('phrase-only audio', () => {
  test('the app prepares the phrases itself, and each phrase plays only its own words, whole', async ({ page }) => {
    await prepare(page)
    const phrases = await phrasesOf(page)
    expect(phrases.length).toBeGreaterThanOrEqual(2)                                 // a long ayah is broken into ready-made phrases
    expect(phrases[0]![0]).toBe(0); expect(phrases.at(-1)![1]).toBe(N - 1)
    await expect(page.getByTestId('stage-sound')).toBeVisible()
    await expect(page.getByTestId('phrase-chips')).toBeVisible()
    await expect(page.locator('[data-testid^="phrase-chip-"]')).toHaveCount(phrases.length)
    await page.screenshot({ path: 'test-results/shots/80-phrase-chips.png' })
    await page.getByTestId('repeat-1').click()
    for (let c = 0; c < phrases.length; c++) expectOnly((await hear(page, c)).share, range(phrases[c]![0], phrases[c]![1]), `phrase ${c + 1}`)
  })

  test('a phrase repeated three times plays three whole, evenly spaced copies and nothing else', async ({ page }) => {
    await prepare(page)
    const [first] = await phrasesOf(page)
    await page.getByTestId('repeat-3').click()
    const { share, x, rate } = await hear(page, 0)
    expect(share[0]!).toBeGreaterThan(2.6); expect(share[0]!).toBeLessThan(3.6)       // three copies of the first word
    expect(Math.max(...share.slice(first![1] + 1))).toBeLessThan(0.1)                  // (the tone detector's own leakage grows with three copies; a real extra word would read ~1)
    const times = audibleTimes(x, rate, 0)
    const onsets = times.filter((t, i) => i === 0 || t - times[i - 1]! > 100)
    expect(onsets).toHaveLength(3)
    expect(Math.abs((onsets[1]! - onsets[0]!) - (onsets[2]! - onsets[1]!))).toBeLessThan(30)   // sample-clock spacing, not timers
  })

  test('the practice step plays the whole range being joined (A → B), keeping the reciter\'s own breath between them', async ({ page }) => {
    await prepare(page)
    const phrases = await phrasesOf(page)
    await page.getByTestId('repeat-1').click()
    await page.getByTestId('to-flow').click()
    const seen: string[] = []
    for (let i = 0; i < 12; i++) {
      const txt = await page.getByTestId('stage-flow').innerText({ timeout: 3000 }).catch(() => '<left the flow step>')
      seen.push(txt.split('\n').filter(Boolean).slice(0, 3).join(' | '))
      if (/\bA → B\b/.test(txt) && !/A → B → C/.test(txt.split('\n').slice(0, 4).join(' ')) || txt.startsWith('<')) break
      await page.getByTestId('said-it').click(); await page.getByTestId('rate-natural').click(); await page.waitForTimeout(250)
    }
    expect(seen.join('  >>  ')).toContain('A → B')
    await startCapture(page)
    await page.getByTestId('hear-part-play').click()
    await untilPlayed(page)
    const { x, rate } = await captured(page)
    const [a, b] = [phrases[0]!, phrases[1]!]
    expectOnly(wordShare(x, rate), range(a[0], b[1]), 'A → B', 0.1)
    const wa = audibleTimes(x, rate, a[1]), wb = audibleTimes(x, rate, b[0])
    expect(Math.abs((wb[0]! - (wa.at(-1)! + 20)) - (S.active[b[0]]!.t0 - S.active[a[1]]!.t1))).toBeLessThan(60)
    await page.screenshot({ path: 'test-results/shots/81-hear-part.png' })
  })

  test('timings that are off by 70 ms still never clip or add a neighbouring word', async ({ page }) => {
    await prepare(page, timingData({ shift: 70 }))
    const phrases = await phrasesOf(page)
    await page.getByTestId('repeat-1').click()
    for (let c = 0; c < phrases.length; c++) expectOnly((await hear(page, c)).share, range(phrases[c]![0], phrases[c]![1]), `phrase ${c + 1}`)
  })

  test('a timing for a different-length file is refused, said plainly, and the whole ayah plays instead', async ({ page }) => {
    await prepare(page, timingData({ durationMs: S.durationMs + 400 }))
    await page.getByTestId('phrase-chip-0').click()
    await expect(page.getByTestId('phrase-fallback')).toContainText('does not match its timings. Playing the whole ayah instead.')
    await expect(page.getByTestId('audio-status')).toContainText('Ayah 94', { timeout: 15000 })
  })

  test('a boundary where the reciter does not pause cleanly is refused rather than cut through a word', async ({ page }) => {
    const run = synth(WORDS.map((w) => ({ ...w, gapAfterMs: 0 })))                    // every word runs straight into the next
    await mockAudio(page); await freshStart(page)
    await page.route(URL_RE, (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: Buffer.from(run.wav), headers: { 'access-control-allow-origin': '*' } }))
    await page.goto('/settings'); await page.getByLabel('Reciter').selectOption('maher')
    await page.evaluate((d) => (window as W).__hifzRegisterTimings(d), { ...timingData(), ayahs: { [`${SURAH}:${AYAH}`]: { d: run.durationMs, s: run.segments } } })
    await openLearn(page, AYAH)
    const chip = page.getByTestId('phrase-chip-0')
    if (await chip.count()) {
      await chip.click()
      await expect(page.getByTestId('phrase-fallback')).toContainText(/Playing the whole ayah instead/)
    }
    await expect(page.getByTestId('stage-sound')).toBeVisible()
  })

  test('another reciter never borrows these timings; the whole-ayah player is untouched', async ({ page }) => {
    await prepare(page)
    await expect(page.getByTestId('phrase-chips')).toBeVisible()
    await page.evaluate(() => { history.pushState({}, '', '/settings'); window.dispatchEvent(new PopStateEvent('popstate')) })
    await page.getByLabel('Reciter').selectOption('husary')
    await openLearn(page, AYAH)
    await expect(page.getByTestId('stage-sound')).toBeVisible()
    await expect(page.getByTestId('phrase-chips')).toHaveCount(0)
    await expect(page.getByTestId('audio-play')).toBeVisible()
  })

  test('with no timings at all the Learn flow is exactly the familiar one', async ({ page }) => {
    await mockAudio(page); await freshStart(page)
    await page.goto('/learn/20/94/94')
    await expect(page.getByTestId('stage-sound')).toBeVisible()
    await expect(page.getByTestId('phrase-chips')).toHaveCount(0)
    await page.getByTestId('to-flow').click()
    await expect(page.getByTestId('hear-part')).toHaveCount(0)
    await expect(page.getByTestId('said-it')).toBeVisible()
  })

  test('the learner never chooses where to split: long ayahs are prepared automatically, with one quiet way to learn them whole', async ({ page }) => {
    await mockAudio(page); await freshStart(page)
    await page.goto('/learn/20/40/40')                                                // 34 words: prepared automatically into phrases
    await expect(page.getByTestId('stage-sound')).toBeVisible()
    await expect(page.getByTestId('breakdown-choice')).toHaveCount(0)
    await expect(page.getByTestId('edit-phrases')).toBeHidden()
    await page.getByTestId('to-flow').click()
    await expect(page.getByTestId('stage-flow')).not.toContainText('Whole ayah')
    await page.getByTestId('advanced-toggle').click()
    await expect(page.getByTestId('edit-phrases')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/82-auto-phrases.png' })
  })

  test('"Learn this ayah whole" is one tap, makes the ayah a single piece, and can be undone', async ({ page }) => {
    await mockAudio(page); await freshStart(page)
    await page.goto('/learn/20/40/40')
    await page.getByTestId('learn-whole').click()
    await page.getByTestId('to-flow').click()
    await expect(page.getByTestId('stage-flow')).toContainText('Whole ayah')
    await page.getByRole('button', { name: 'Leave' }).click()
    await page.goto('/learn/20/40/40')
    await expect(page.getByTestId('stage-flow')).toContainText('Whole ayah')
    await page.getByTestId('learn-phrases').click()
    // Ta-Ha 40 is a long ayah (34 words), so "in phrases" means learning it part by part, from the first part.
    await expect(page.getByTestId('part-dots')).toBeVisible()
    await expect(page.getByTestId('stage-flow')).toHaveCount(0)
  })

  test('short ayahs are never broken and show no breakdown controls at all', async ({ page }) => {
    await mockAudio(page); await freshStart(page)
    await page.goto('/learn/20/2/2')
    await expect(page.getByTestId('learn-whole')).toHaveCount(0)
    await expect(page.getByTestId('learn-phrases')).toHaveCount(0)
    await page.getByTestId('to-flow').click()
    await expect(page.getByTestId('stage-flow')).toContainText('Whole ayah')
  })
})

// ---------- phrase audio from a WHOLE-SURAH recording (the shape Quranic Universal Audio's timings are aligned to) ----------
test.describe('phrase audio from a whole-surah MP3 (byte-window decoding)', () => {
  let surah: SurahMp3
  test.beforeAll(async () => { surah = await makeSurahMp3(WORDS) })

  const surahTiming = (over: { shift?: number; bytes?: number; origin?: number } = {}) => ({
    schema: 1, reciter: 'maher',
    provenance: {
      source: 'test fixture', licence: 'n/a (synthetic)', url: 'about:blank', recording: 'mp3quran:test-surah', method: 'synthetic', retrieved: '2026-11-01', granularity: 'surah', riwayah: 'hafs',
      audio: { urlTemplate: 'https://mp3test.example/surah/{SSS}.mp3', files: { '20': { ...surah.file, bytes: over.bytes ?? surah.file.bytes } } },
    },
    ayahs: { [`${SURAH}:${AYAH}`]: { d: S.durationMs, o: surah.originMs + (over.origin ?? 0), s: S.segments.map(([a, b, t0, t1]) => [a, b, t0 + (over.shift ?? 0), t1 + (over.shift ?? 0)]) } },
  })

  async function prepareSurah(page: Page, data: unknown, requests: { range: string | undefined; size: number }[]) {
    await mockAudio(page); await freshStart(page)
    await page.route(/mp3test\.example/, async (r) => {
      const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'range', 'access-control-expose-headers': 'Content-Range, Accept-Ranges, Content-Length', 'accept-ranges': 'bytes' }
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h })
      const range = r.request().headers()['range'], m = /bytes=(\d+)-(\d+)/.exec(range ?? '')
      if (!m) { requests.push({ range, size: surah.mp3.length }); return r.fulfill({ status: 200, contentType: 'audio/mpeg', body: surah.mp3, headers: h }) }
      const a = Number(m[1]), b = Math.min(Number(m[2]), surah.mp3.length - 1)
      requests.push({ range, size: b - a + 1 })
      return r.fulfill({ status: 206, contentType: 'audio/mpeg', body: surah.mp3.subarray(a, b + 1), headers: { ...h, 'content-range': `bytes ${a}-${b}/${surah.mp3.length}` } })
    })
    await page.goto('/settings')
    await page.getByLabel('Reciter').selectOption('maher')
    await page.evaluate((d) => (window as W).__hifzRegisterTimings(d), data)
    await openLearn(page, AYAH)
  }

  test('each phrase plays only its own words, taken from a window of the surah file, never the whole file', async ({ page }) => {
    const requests: { range: string | undefined; size: number }[] = []
    await prepareSurah(page, surahTiming(), requests)
    const phrases = await phrasesOf(page)
    await expect(page.getByTestId('phrase-chips')).toBeVisible()
    await page.getByTestId('repeat-1').click()
    for (let c = 0; c < phrases.length; c++) expectOnly((await hear(page, c)).share, range(phrases[c]![0], phrases[c]![1]), `phrase ${c + 1}`)
    expect(requests.length).toBeGreaterThanOrEqual(phrases.length)
    for (const r of requests) { expect(r.range, 'a window was requested').toMatch(/^bytes=\d+-\d+$/); expect(r.size, 'a window, not the file').toBeLessThan(surah.mp3.length * 0.5) }
    await page.screenshot({ path: 'test-results/shots/83-surah-window.png' })
  })

  test('timings 70 ms out still never clip or leak, from a real MP3 window', async ({ page }) => {
    await prepareSurah(page, surahTiming({ shift: 70 }), [])
    const phrases = await phrasesOf(page)
    await page.getByTestId('repeat-1').click()
    for (let c = 0; c < phrases.length; c++) expectOnly((await hear(page, c)).share, range(phrases[c]![0], phrases[c]![1]), `phrase ${c + 1}`)
  })

  test('a different edition of the recording (its size is not the one the timings describe) is refused, said plainly, and the whole ayah plays', async ({ page }) => {
    await prepareSurah(page, surahTiming({ bytes: surah.mp3.length + 4096 }), [])
    await page.getByTestId('phrase-chip-0').click()
    await expect(page.getByTestId('phrase-fallback')).toContainText('could not be read here')
    await expect(page.getByTestId('audio-status')).toContainText('Ayah 94', { timeout: 15000 })
  })

  test('the whole-ayah play button uses the SAME recording as the phrases (a window of the surah file), never another recording of the reciter', async ({ page }) => {
    const requests: { range: string | undefined; size: number }[] = []
    const everyayah: string[] = []
    page.on('request', (r) => { if (/everyayah\.com|cdn\.islamic\.network/.test(r.url())) everyayah.push(r.url()) })
    await prepareSurah(page, surahTiming(), requests)
    await expect(page.getByTestId('phrase-chips')).toBeVisible()
    const before = requests.length
    await page.getByTestId('audio-play').click()
    await expect.poll(() => requests.length, { timeout: 20000 }).toBeGreaterThan(before)       // a Range window of the surah file was fetched
    await expect(page.getByTestId('audio-status')).toContainText('Ayah 94', { timeout: 20000 })
    await expect(page.getByTestId('audio-status')).toContainText('same recording as the phrases')
    expect(everyayah, 'no other recording of this reciter was requested').toEqual([])
    for (const r of requests) expect(r.range).toMatch(/^bytes=\d+-\d+$/)
  })

  test('an ayah that cannot be taken whole from that recording shows no phrase audio and plays the ordinary source', async ({ page }) => {
    const requests: { range: string | undefined; size: number }[] = []
    const data = surahTiming() as { ayahs: Record<string, { x?: number[]; xs?: number[][] }> }
    data.ayahs['20:94']!.x = [9]; data.ayahs['20:94']!.xs = [[3000, 4000]]                       // an abandoned take inside the ayah
    await prepareSurah(page, data, requests)
    await expect(page.getByTestId('stage-sound')).toBeVisible()
    await expect(page.getByTestId('phrase-chips')).toHaveCount(0)
  })

  // A documented LIMIT, not a safeguard: the audio can prove a cut does not slice through a word, but it cannot know WHICH words it
  // contains. Timings that are consistently offset from the real file (right size, wrong ayah origin) cut at genuine pauses and play
  // whole, wrong words. The guard against that is import-time validation of each recording against its timings, and the size /
  // duration edition checks above. This test pins the behaviour so nobody mistakes the runtime check for an identity check.
  test('LIMIT: a consistently mis-offset timing still cuts cleanly (no clipped words) but cannot be detected as wrong at play time', async ({ page }) => {
    await prepareSurah(page, surahTiming({ origin: 900 }), [])
    const { share } = await hear(page, 0)
    const heard = share.map((v, i) => [v, i] as const).filter(([v]) => v > 0.3)
    expect(heard.length).toBeGreaterThan(0)
    for (const [v] of heard) expect(v, 'a word was cut through').toBeGreaterThan(0.8)
    const first = new Set(range(0, 1))
    expect(heard.some(([, i]) => !first.has(i)), 'these are the wrong words, and nothing at runtime says so').toBe(true)
  })
})
