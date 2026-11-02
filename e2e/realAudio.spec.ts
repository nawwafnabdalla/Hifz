// Plays REAL recordings from their real host through the real app, captures what comes out of the speakers and saves it for transcription.
//   REAL_TIMINGS=<imported json> REAL_RECITER=dossary REAL_OUT=<dir> REAL_AYAH=94 npx playwright test e2e/realAudio.spec.ts --project=mobile
// Not part of the normal suite (skipped without REAL_TIMINGS). The audio request is NOT intercepted: this exercises the host's CORS, Range
// handling and the browser's MP3 decoding for real. The sandbox's HTTPS proxy is used for the browser's traffic.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { freshStart, mockAudio } from './helpers'

const T = process.env.REAL_TIMINGS, RECITER = process.env.REAL_RECITER ?? 'dossary', OUT = process.env.REAL_OUT ?? '/tmp/real-browser', AYAH = Number(process.env.REAL_AYAH ?? 94), SURAH = 20
const proxy = process.env.HTTPS_PROXY
test.skip(!T, 'needs REAL_TIMINGS')
test.use({ ignoreHTTPSErrors: true, launchOptions: { executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'], ...(proxy ? { proxy: { server: proxy, bypass: 'localhost,127.0.0.1' } } : {}) } })
test.setTimeout(240_000)

type W = typeof window & { __hifzRegisterTimings: (d: unknown) => void; __hifzPhrases: (s: number, a: number, p: unknown) => [number, number][]; __hifzPhrasePlayer: { ensureContext(): AudioContext; tap: AudioNode | null; state: { status: string; phraseSec?: number } }; __cap: Float32Array[]; __capRate: number }

const wav = (x: Float32Array, rate: number) => {
  const b = Buffer.alloc(44 + x.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40)
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i]! * 32767))), 44 + i * 2)
  return b
}
async function startCapture(page: Page) {
  await page.evaluate(() => {
    const w = window as W, p = w.__hifzPhrasePlayer, ctx = p.ensureContext()
    const old = (w as unknown as { __sp?: ScriptProcessorNode }).__sp
    if (old) { old.onaudioprocess = null; old.disconnect() }
    const g = ctx.createGain(), sp = ctx.createScriptProcessor(2048, 1, 1)
    ;(w as unknown as { __sp: ScriptProcessorNode }).__sp = sp
    w.__cap = []; w.__capRate = ctx.sampleRate
    sp.onaudioprocess = (e) => { w.__cap.push(new Float32Array(e.inputBuffer.getChannelData(0))) }
    g.connect(sp); sp.connect(ctx.destination); p.tap = g
  })
}
async function untilPlayed(page: Page) {
  const t0 = Date.now()
  await page.waitForFunction(() => ['playing', 'unavailable'].includes((window as W).__hifzPhrasePlayer.state.status), null, { timeout: 60000 })
  const ttfs = Date.now() - t0
  if (await page.evaluate(() => (window as W).__hifzPhrasePlayer.state.status === 'unavailable')) return -1          // refused: the app says so and plays the whole ayah instead
  await page.waitForFunction(() => (window as W).__hifzPhrasePlayer.state.status === 'idle', null, { timeout: 120000 })
  await page.waitForTimeout(300)
  return ttfs
}
async function captured(page: Page) {
  const r = await page.evaluate(() => { const w = window as W; const n = w.__cap.reduce((a, c) => a + c.length, 0); const out = new Float32Array(n); let o = 0; for (const c of w.__cap) { out.set(c, o); o += c.length } return { cap: Array.from(out), rate: w.__capRate } })
  return { x: Float32Array.from(r.cap), rate: r.rate }
}

test('real recording: every phrase of the ayah, repeated, and joined', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  const data = JSON.parse(readFileSync(T!, 'utf8'))
  data.reciter = RECITER
  const raw = data.ayahs[`${SURAH}:${AYAH}`]
  const pauses = raw.s.slice(0, -1).map((s: number[], i: number) => ({ afterWord: s[1] - 1, ms: Math.max(0, raw.s[i + 1][2] - s[3]) }))
  const net: { url: string; status: number; range: string | undefined; contentRange: string | null; acao: string | null; bytes: number }[] = []
  const fails: string[] = []
  page.on('response', async (r) => { if (/audio-cdn\.tarteel\.ai/.test(r.url())) { const h = await r.allHeaders().catch(() => ({} as Record<string, string>)); net.push({ url: r.url(), status: r.status(), range: r.request().headers()['range'], contentRange: h['content-range'] ?? null, acao: h['access-control-allow-origin'] ?? null, bytes: Number(h['content-length'] ?? 0) }) } })
  page.on('requestfailed', (r) => { if (/audio-cdn/.test(r.url())) fails.push(`${r.url()} ${r.failure()?.errorText}`) })
  await mockAudio(page); await page.route(/audio-cdn\.tarteel\.ai/, (r) => r.continue()); await freshStart(page)       // this spec is the one that reaches the real host
  await page.goto('/settings'); await page.getByLabel('Reciter').selectOption(RECITER)
  if (!process.env.REAL_BUILTIN) await page.evaluate((d) => (window as W).__hifzRegisterTimings(d), data)           // REAL_BUILTIN=1: use the timing file shipped in src/data/timings
  await page.evaluate((a) => { history.pushState({}, '', `/learn/20/${a}/${a}`); window.dispatchEvent(new PopStateEvent('popstate')) }, AYAH)
  const phrases = await page.evaluate(([a, p]) => (window as W).__hifzPhrases(20, a as number, p), [AYAH, pauses] as const)
  const meta: Record<string, unknown> = { reciter: RECITER, surah: SURAH, ayah: AYAH, phrases, chips: [] as unknown[] }
  await page.getByTestId('repeat-1').click()
  const heap = async () => page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0)
  const heap0 = await heap()
  if (phrases.length > 1) { await expect(page.getByTestId('phrase-chips')).toBeVisible(); await page.screenshot({ path: join(OUT, 'learn.png') }) }
  for (let c = 0; c < phrases.length; c++) {
    await startCapture(page)
    await page.getByTestId(phrases.length > 1 ? `phrase-chip-${c}` : 'audio-play').click()
    const ttfs = await untilPlayed(page)
    if (ttfs < 0) { ;(meta.chips as unknown[]).push({ chip: c, words: phrases[c], refused: true, message: (await page.getByTestId('phrase-fallback').innerText().catch(() => '')) }); continue }
    const { x, rate } = await captured(page)
    const file = `chip${c}.wav`; writeFileSync(join(OUT, file), wav(x, rate))
    ;(meta.chips as unknown[]).push({ chip: c, words: phrases[c], file, seconds: +(x.length / rate).toFixed(2), ttfsMs: ttfs, heapMB: +((await heap()) / 1e6).toFixed(1) })
  }
  // Repetition: the first phrase three times.
  if (phrases.length > 1) {
    await page.getByTestId('repeat-3').click()
    await startCapture(page); await page.getByTestId('phrase-chip-0').click(); await untilPlayed(page)
    const { x, rate } = await captured(page); writeFileSync(join(OUT, 'repeat3.wav'), wav(x, rate)); meta.repeat3 = { file: 'repeat3.wav', words: phrases[0], seconds: +(x.length / rate).toFixed(2) }
    await page.getByTestId('repeat-1').click()
  }
  // Joining: through the Flow step, to the first "A → B" part.
  if (phrases.length > 1) {
    await page.getByTestId('to-flow').click()
    for (let i = 0; i < 12; i++) {
      const txt = await page.getByTestId('stage-flow').innerText({ timeout: 3000 }).catch(() => '')
      if (/\bA → B\b/.test(txt) && !/A → B → C/.test(txt.split('\n').slice(0, 4).join(' '))) break
      await page.getByTestId('said-it').click(); await page.getByTestId('rate-natural').click(); await page.waitForTimeout(250)
    }
    await startCapture(page); await page.getByTestId('hear-part-play').click(); await untilPlayed(page)
    const { x, rate } = await captured(page); writeFileSync(join(OUT, 'join01.wav'), wav(x, rate)); meta.join = { file: 'join01.wav', words: [phrases[0]![0], phrases[1]![1]], seconds: +(x.length / rate).toFixed(2) }
  }
  meta.network = { requests: net.length, statuses: [...new Set(net.map((n) => n.status))], allCors: net.every((n) => n.acao === '*'), bytesTotal: net.reduce((a, n) => a + n.bytes, 0), ranges: net.map((n) => n.range), contentRanges: [...new Set(net.map((n) => n.contentRange?.replace(/^bytes \d+-\d+/, 'bytes a-b')))], failed: fails }
  meta.heapDeltaMB = +(((await heap()) - heap0) / 1e6).toFixed(1)
  writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta, null, 1))
  expect(fails, 'audio requests must not fail').toEqual([])
  expect(net.length).toBeGreaterThan(0)
  expect(net.every((n) => n.status === 206)).toBe(true)
})

test('real recording: the whole ayah is cut from the SAME recording as its phrases', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await mockAudio(page); await page.route(/audio-cdn\.tarteel\.ai/, (r) => r.continue()); await freshStart(page)       // this spec is the one that reaches the real host
  await page.goto('/settings'); await page.getByLabel('Reciter').selectOption(RECITER)
  const out: Record<string, unknown> = {}
  for (const a of (process.env.REAL_WHOLE ?? String(AYAH)).split(',').map(Number)) {
    const b64 = await page.evaluate(([r, s, a]) => (window as unknown as { __hifzWholeAyah: (r: string, s: number, a: number) => Promise<string | null> }).__hifzWholeAyah(r as string, s as number, a as number), [RECITER, SURAH, a] as const)
    out[String(a)] = b64 ? { file: `whole-${a}.wav`, bytes: Buffer.from(b64, 'base64').length } : null
    if (b64) writeFileSync(join(OUT, `whole-${a}.wav`), Buffer.from(b64, 'base64'))
  }
  writeFileSync(join(OUT, 'whole.json'), JSON.stringify(out, null, 1))
})
