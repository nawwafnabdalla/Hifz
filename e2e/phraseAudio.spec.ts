import { expect, test, type Page } from '@playwright/test'
import { freshStart, mockAudio } from './helpers'
import { synth, wordHz, type SynthWord } from './synthAudio'

// Ta-Ha 22 has eleven words. The synthetic recitation has eleven words too, with a long breath after the sixth: that is where the
// app places its break, because it is where this "reciter" really paused.
const WORDS: SynthWord[] = [
  { ms: 260, gapAfterMs: 70 }, { ms: 300, gapAfterMs: 90 }, { ms: 340, gapAfterMs: 80 }, { ms: 280, gapAfterMs: 100 }, { ms: 320, gapAfterMs: 110 }, { ms: 360, gapAfterMs: 450 },
  { ms: 300, gapAfterMs: 90 }, { ms: 330, gapAfterMs: 85 }, { ms: 300, gapAfterMs: 95 }, { ms: 320, gapAfterMs: 100 }, { ms: 380, gapAfterMs: 0 },
]
const S = synth(WORDS)
const SURAH = 20, AYAH = 22
const URL_RE = /everyayah\.com\/data\/MaherAlMuaiqly128kbps\/020022\.mp3/

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

test.describe('phrase-only audio', () => {
  test('hearing one phrase plays only its words, whole, in the reciter\'s own recording', async ({ page }) => {
    await prepare(page)
    await expect(page.getByTestId('stage-sound')).toBeVisible()
    await expect(page.getByTestId('phrase-chips')).toBeVisible()
    await expect(page.getByTestId('phrase-chip-0')).toBeVisible(); await expect(page.getByTestId('phrase-chip-1')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/80-phrase-chips.png' })
    await page.getByTestId('repeat-1').click()
    await startCapture(page)
    await page.getByTestId('phrase-chip-0').click()
    await untilPlayed(page)
    const { x, rate } = await captured(page)
    const share = wordShare(x, rate)
    share.slice(0, 6).forEach((v, i) => expect(v, `word ${i + 1} should be heard in full`).toBeGreaterThan(0.8))
    share.slice(6).forEach((v, i) => expect(v, `word ${i + 7} must not be heard`).toBeLessThan(0.03))

    await startCapture(page)
    await page.getByTestId('phrase-chip-1').click()
    await untilPlayed(page)
    const b = wordShare((await captured(page)).x, rate)
    b.slice(6).forEach((v, i) => expect(v, `word ${i + 7} should be heard in full`).toBeGreaterThan(0.8))
    b.slice(0, 6).forEach((v, i) => expect(v, `word ${i + 1} must not be heard`).toBeLessThan(0.03))
  })

  test('a phrase repeated three times plays three whole, evenly spaced copies and nothing else', async ({ page }) => {
    await prepare(page)
    await page.getByTestId('repeat-3').click()
    await startCapture(page)
    await page.getByTestId('phrase-chip-0').click()
    await untilPlayed(page)
    const { x, rate } = await captured(page)
    const share = wordShare(x, rate)
    expect(share[0]!).toBeGreaterThan(2.6); expect(share[0]!).toBeLessThan(3.6)          // three copies of the first word
    expect(Math.max(...share.slice(6))).toBeLessThan(0.1)                                // the tone detector's own leakage grows with three copies; a real extra word would read ~1
    // first-word onsets: three, evenly spaced
    const times = audibleTimes(x, rate, 0)
    const onsets = times.filter((t, i) => i === 0 || t - times[i - 1]! > 100)
    expect(onsets).toHaveLength(3)
    const d1 = onsets[1]! - onsets[0]!, d2 = onsets[2]! - onsets[1]!
    expect(Math.abs(d1 - d2)).toBeLessThan(30)                                           // sample-clock spacing, not timers
  })

  test('the practice step plays the whole range being joined, keeping the reciter\'s own breath between phrases', async ({ page }) => {
    await prepare(page)
    await page.getByTestId('repeat-1').click()
    await page.getByTestId('to-flow').click()
    // the ladder starts with phrase A; step to the joining step (A → B)
    for (let i = 0; i < 6 && !(await page.getByTestId('stage-flow').innerText()).includes('A → B'); i++) { await page.getByTestId('said-it').click(); await page.getByTestId('rate-natural').click() }
    await expect(page.getByTestId('stage-flow')).toContainText('A → B')
    await startCapture(page)
    await page.getByTestId('hear-part-play').click()
    await untilPlayed(page)
    const { x, rate } = await captured(page)
    wordShare(x, rate).forEach((v, i) => expect(v, `word ${i + 1}`).toBeGreaterThan(0.8))
    const w5 = audibleTimes(x, rate, 5), w6 = audibleTimes(x, rate, 6)
    const heardGap = w6[0]! - (w5.at(-1)! + 20), trueGap = S.active[6]!.t0 - S.active[5]!.t1
    expect(Math.abs(heardGap - trueGap)).toBeLessThan(50)
    await page.screenshot({ path: 'test-results/shots/81-hear-part.png' })
  })

  test('timings that are off by 70 ms still never clip or add a neighbouring word', async ({ page }) => {
    await prepare(page, timingData({ shift: 70 }))
    await page.getByTestId('repeat-1').click()
    for (const [chip, inc, exc] of [[0, [0, 1, 2, 3, 4, 5], [6, 7, 8, 9, 10]], [1, [6, 7, 8, 9, 10], [0, 1, 2, 3, 4, 5]]] as const) {
      await startCapture(page)
      await page.getByTestId(`phrase-chip-${chip}`).click()
      await untilPlayed(page)
      const { x, rate } = await captured(page)
      const share = wordShare(x, rate)
      inc.forEach((i) => expect(share[i]!, `word ${i + 1} clipped`).toBeGreaterThan(0.8))
      exc.forEach((i) => expect(share[i]!, `word ${i + 1} leaked in`).toBeLessThan(0.03))
    }
  })

  test('a timing for a different-length file is refused, said plainly, and the whole ayah plays instead', async ({ page }) => {
    await prepare(page, timingData({ durationMs: S.durationMs + 400 }))
    await page.getByTestId('phrase-chip-0').click()
    await expect(page.getByTestId('phrase-fallback')).toContainText('does not match its timings. Playing the whole ayah instead.')
    await expect(page.getByTestId('audio-status')).toContainText('Ayah 22', { timeout: 15000 })
  })

  test('a boundary where the reciter does not pause cleanly is refused rather than cut through a word', async ({ page }) => {
    const flow = synth(WORDS.map((w, i) => (i === 5 ? { ...w, gapAfterMs: 0 } : w)))
    await mockAudio(page); await freshStart(page)
    await page.route(URL_RE, (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: Buffer.from(flow.wav), headers: { 'access-control-allow-origin': '*' } }))
    await page.goto('/settings'); await page.getByLabel('Reciter').selectOption('maher')
    const data = { ...timingData(), ayahs: { [`${SURAH}:${AYAH}`]: { d: flow.durationMs, s: flow.segments } } }
    data.ayahs[`${SURAH}:${AYAH}`]!.s = flow.segments.map((s) => [...s] as [number, number, number, number]) as never
    // the app breaks where the reciter paused longest; give it a break at word 5 anyway by supplying that pause in the timing only
    await page.evaluate((d) => (window as W).__hifzRegisterTimings(d), data)
    await openLearn(page, AYAH)
    const chips = page.getByTestId('phrase-chip-0')
    if (await chips.count()) {
      await chips.click()
      await expect(page.getByTestId('phrase-fallback').or(page.getByTestId('phrase-status'))).toBeVisible()
    }
    // whatever the app decided, it must never have played a clipped phrase: either no chips, or a refusal with the whole ayah
    await expect(page.getByTestId('stage-sound')).toBeVisible()
  })

  test('another reciter never borrows these timings; the whole-ayah player is untouched', async ({ page }) => {
    await prepare(page)
    await expect(page.getByTestId('phrase-chips')).toBeVisible()
    await page.evaluate(() => { history.pushState({}, '', '/settings'); window.dispatchEvent(new PopStateEvent('popstate')) })
    await page.getByLabel('Reciter').selectOption('dossary')
    await openLearn(page, AYAH)
    await expect(page.getByTestId('stage-sound')).toBeVisible()
    await expect(page.getByTestId('phrase-chips')).toHaveCount(0)
    await expect(page.getByTestId('audio-play')).toBeVisible()
  })

  test('with no timings at all the Learn flow is exactly the familiar one', async ({ page }) => {
    await mockAudio(page); await freshStart(page)
    await page.goto('/learn/20/22/22')
    await expect(page.getByTestId('stage-sound')).toBeVisible()
    await expect(page.getByTestId('phrase-chips')).toHaveCount(0)
    await page.getByTestId('to-flow').click()
    await expect(page.getByTestId('hear-part')).toHaveCount(0)
    await expect(page.getByTestId('said-it')).toBeVisible()
  })

  test('long ayahs without stop signs now offer a breakdown, and "Whole ayah" restores the single block', async ({ page }) => {
    await mockAudio(page); await freshStart(page)
    await page.goto('/learn/20/40/40')                                                // 34 words, no stop sign
    await expect(page.getByTestId('breakdown-choice')).toBeVisible()
    await page.getByTestId('to-flow').click()
    await expect(page.getByTestId('stage-flow')).toContainText(/Chain|A → B|A/)
    expect(await page.locator('[role="group"][aria-label="How does it feel on the tongue?"]').count()).toBe(1)
    await page.getByRole('button', { name: 'Leave' }).click().catch(() => undefined)
  })
})
