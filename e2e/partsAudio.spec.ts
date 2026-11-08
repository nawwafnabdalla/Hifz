// Part-by-part learning with phrase audio (test build only): Ta-Ha 40 (34 words, five parts) with a synthetic "recitation" in which every word
// has its own pitch, so the test can say exactly which words came out of the speakers. Proves the player and the part flow together;
// says nothing about real recitations (see realAudio.spec.ts) and nothing about an iPhone.
import { expect, test, type Page } from '@playwright/test'
import { freshStart, mockAudio } from './helpers'
import { synth, wordHz, type SynthWord } from './synthAudio'

const N = 34, SURAH = 20, AYAH = 40
const WORDS: SynthWord[] = Array.from({ length: N }, (_, i) => ({ ms: 260 + ((i * 37) % 100), gapAfterMs: i === N - 1 ? 0 : 320 }))
const S = synth(WORDS)
const URL_RE = /everyayah\.com\/data\/MaherAlMuaiqly128kbps\/020040\.mp3/
type W = typeof window & { __hifzRegisterTimings: (d: unknown) => void; __hifzPhrases: (s: number, a: number, p: unknown) => [number, number][]; __hifzPhrasePlayer: { ensureContext(): AudioContext; tap: AudioNode | null; state: { status: string } }; __cap: Float32Array[]; __capRate: number }
const timingData = () => ({
  schema: 1, reciter: 'maher',
  provenance: { source: 'test fixture', licence: 'n/a (synthetic)', url: 'about:blank', recording: 'everyayah:MaherAlMuaiqly128kbps', method: 'synthetic', retrieved: '2026-11-01' },
  ayahs: { [`${SURAH}:${AYAH}`]: { d: S.durationMs, s: S.segments } },
})
const PAUSES = S.segments.slice(0, -1).map((s, i) => ({ afterWord: i, ms: Math.max(0, S.segments[i + 1]![2] - s[3]) }))

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
  await page.waitForFunction(() => (window as W).__hifzPhrasePlayer.state.status === 'playing', null, { timeout: 15000 })
  await page.waitForFunction(() => (window as W).__hifzPhrasePlayer.state.status === 'idle', null, { timeout: 30000 })
  await page.waitForTimeout(250)
}
async function captured(page: Page) {
  const { cap, rate } = await page.evaluate(() => { const w = window as W; const n = w.__cap.reduce((a, c) => a + c.length, 0); const out = new Float32Array(n); let o = 0; for (const c of w.__cap) { out.set(c, o); o += c.length } return { cap: Array.from(out), rate: w.__capRate } })
  return { x: Float32Array.from(cap), rate }
}
function pitch(x: Float32Array, rate: number, hz: number, a: number, n: number) {
  const w = (2 * Math.PI * hz) / rate, c = 2 * Math.cos(w)
  let s1 = 0, s2 = 0
  for (let i = 0; i < n; i++) { const v = (x[a + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))); const s = v + c * s1 - s2; s2 = s1; s1 = s }
  return (2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2))) / n / 0.5
}
function amount(x: Float32Array, rate: number, hz: number, a: number, b: number) {
  const n = Math.round(rate * 0.1), hop = Math.round(n / 2); let s = 0
  for (let i = a; i + n <= b; i += hop) s += pitch(x, rate, hz, i, n) * (hop / rate)
  return s
}
function wordShare(x: Float32Array, rate: number) {
  return WORDS.map((_, i) => {
    const pad = Math.round(S.sampleRate * 0.05)
    const a = Math.max(0, Math.round((S.active[i]!.t0 / 1000) * S.sampleRate) - pad), b = Math.round((S.active[i]!.t1 / 1000) * S.sampleRate) + pad
    return amount(x, rate, wordHz(i), 0, x.length) / amount(S.samples, S.sampleRate, wordHz(i), a, b)
  })
}
function expectOnly(share: number[], from: number, to: number, label: string) {
  share.forEach((v, i) => { if (i >= from && i <= to) expect(v, `${label}: word ${i + 1} clipped or missing`).toBeGreaterThan(0.8); else expect(v, `${label}: word ${i + 1} leaked in`).toBeLessThan(0.08) })
}
async function hearPart(page: Page) {
  await startCapture(page)
  await page.getByTestId('hear-part-play').click()
  await untilPlayed(page)
  const { x, rate } = await captured(page)
  return wordShare(x, rate)
}

test.describe('part-by-part learning with phrase audio', () => {
  test.beforeEach(async ({ page }) => {
    await mockAudio(page); await freshStart(page)
    await page.route(URL_RE, (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: Buffer.from(S.wav), headers: { 'access-control-allow-origin': '*' } }))
    await page.goto('/settings')
    await page.getByLabel('Reciter').selectOption('maher')
    await page.evaluate((d) => (window as W).__hifzRegisterTimings(d), timingData())
    await page.evaluate(([a]) => { history.pushState({}, '', `/learn/20/${a}/${a}`); window.dispatchEvent(new PopStateEvent('popstate')) }, [AYAH])
  })

  test('Hear only part A; learn it; hear only part B; hear A → B joined', async ({ page }) => {
    const phrases = await page.evaluate(([s, a, p]) => (window as W).__hifzPhrases(s as number, a as number, p), [SURAH, AYAH, PAUSES] as const)
    expect(phrases.length).toBeGreaterThanOrEqual(3)
    await expect(page.getByTestId('part-caption')).toContainText('Part A')
    await expect(page.getByTestId('no-phrase-audio')).toHaveCount(0)            // part audio IS available here
    await page.getByTestId('repeat-1').click()
    expectOnly(await hearPart(page), phrases[0]![0], phrases[0]![1], 'part A')
    // learn A
    await page.getByTestId('practise-next').click()
    await page.getByTestId('span-reveal').click(); await page.getByTestId('span-grade-independent').click()
    await expect(page.getByTestId('stage-partdone')).toBeVisible()
    await page.getByTestId('next-part').click()
    await expect(page.getByTestId('part-caption')).toContainText('Part B')
    expectOnly(await hearPart(page), phrases[1]![0], phrases[1]![1], 'part B')
    // B alone first, then the join A → B, which plays both parts and nothing else
    await page.getByTestId('practise-next').click()
    await expect(page.getByTestId('stage-practise')).toContainText('A → B')
    const joined = await hearPart(page)
    expectOnly(joined, phrases[0]![0], phrases[1]![1], 'A → B')
  })

  test('the reciter chosen is the one heard: parts never borrow another reciter\'s timings (falls back to the whole ayah, said plainly)', async ({ page }) => {
    await page.goto('/settings')
    await page.getByLabel('Reciter').selectOption('alafasy')
    await page.evaluate(([a]) => { history.pushState({}, '', `/learn/20/${a}/${a}`); window.dispatchEvent(new PopStateEvent('popstate')) }, [AYAH])
    await expect(page.getByTestId('part-dots')).toBeVisible()
    await page.getByTestId('part-info-toggle').click()                                  // the explanation is one tap away
    await expect(page.getByTestId('no-phrase-audio')).toContainText('whole ayah plays')
    await expect(page.getByTestId('hear-part')).toHaveCount(0)
  })
})
