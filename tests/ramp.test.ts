import { describe, expect, it } from 'vitest'
import { SURAHS, wordsOfAyah } from '@/lib/quran/data'
import { buildPhrases, suggestBoundaries } from '@/lib/engine/phrases'
import { buildRamp, flowFor, hasFading, rampFromRepair, wordState } from '@/lib/engine/ramp'
import { troubledRungs } from '@/lib/engine/repair'
import type { FlowEvent } from '@/lib/engine/types'

const phrasesOf = (s: number, a: number) => { const w = wordsOfAyah(s, a); return { w, ph: buildPhrases(w, suggestBoundaries(w).boundaries) } }
const SZ = 6
const mk = (n: number) => { const words = Array.from({ length: n * SZ }, (_, i) => `w${i}`); return buildPhrases(words, Array.from({ length: n - 1 }, (_, i) => i * SZ + SZ - 1)) }
const st = (rung: ReturnType<typeof buildRamp>[number], ph: ReturnType<typeof mk>, n: number, peeked = false) => Array.from({ length: n }, (_, i) => wordState(rung, ph, i, peeked))
const rep = (x: string, n: number) => Array<string>(n).fill(x)

describe('the support ramp', () => {
  it('a very short ayah is said once with the text, then goes to recall', () => {
    const { w, ph } = phrasesOf(112, 1)
    expect(w.length).toBeLessThan(5)
    const r = buildRamp(ph, w.length)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ newFrom: 0 })
    expect(hasFading(r[0]!, ph)).toBe(false)
  })
  it('a longer single-phrase ayah is said with the text, then from its first word', () => {
    const { w } = phrasesOf(2, 255)
    const single = buildPhrases(w, [])
    const r = buildRamp(single, w.length)
    expect(r.map((x) => !!x.allFaded)).toEqual([false, true])
  })
  it('pieces are added cumulatively, earlier ones thin to their first word, and the ayah ends from first words only', () => {
    const ph = mk(3)
    const r = buildRamp(ph, 3 * SZ)
    expect(r.map((x) => `${x.from}-${x.to}:${x.newFrom}${x.allFaded ? 'f' : ''}`)).toEqual(['0-0:0', '0-1:1', '0-2:2', '0-2:3f'])
    // step A→B: A is first word only, B is complete, C is dimmed
    expect(st(r[1]!, ph, 3 * SZ)).toEqual(['show', ...rep('mask', SZ - 1), ...rep('show', SZ), ...rep('dim', SZ)])
    // final: first word of each piece only
    expect(st(r[3]!, ph, 3 * SZ)).toEqual([0, 1, 2].flatMap(() => ['show', ...rep('mask', SZ - 1)]))
  })
  it('short opening pieces are taken together so the first step is worth saying', () => {
    const ph = buildPhrases(Array.from({ length: 12 }, (_, i) => `w${i}`), [1, 3, 7])           // pieces of 2, 2, 4, 4 words
    const r = buildRamp(ph, 12)
    expect(r[0]).toMatchObject({ from: 0, to: 2, newFrom: 0 })
  })
  it('"Show me" reveals everything in play and never changes the text', () => {
    const ph = mk(3)
    const r = buildRamp(ph, 3 * SZ)
    expect(st(r[3]!, ph, 3 * SZ, true).every((s) => s === 'show')).toBe(true)
  })
  it('long ayahs are joined back every third piece and never need more than ~k+k/3+1 steps', () => {
    for (const k of [5, 6, 8, 11]) {
      const r = buildRamp(mk(k), k * SZ)
      expect(r.length).toBeLessThanOrEqual(k + Math.ceil(k / 3) + 2)
      expect(r.at(-1)!.allFaded).toBe(true)
      expect(r.filter((x) => x.allFaded && x.to < k - 1).length).toBeGreaterThan(0)
    }
  })
  it('needs far fewer taps than the old flow for every ayah (one tap per step, against a counter and a rating per rung)', async () => {
    const { buildLadder } = await import('@/lib/engine/phrases')
    const { writeFileSync } = await import('node:fs')
    let newSum = 0, oldRealistic = 0, oldMinimal = 0, worseThanRealistic = 0, total = 0
    const hist: Record<number, number> = {}
    for (const s of SURAHS) for (let a = 1; a <= s.count; a++) {
      const w = wordsOfAyah(s.n, a); const ph = buildPhrases(w, suggestBoundaries(w).boundaries)
      const steps = buildRamp(ph, w.length).length, old = buildLadder(ph).length
      total++; newSum += steps; oldRealistic += old * 4; oldMinimal += old
      hist[steps] = (hist[steps] ?? 0) + 1
      if (steps > old * 4) worseThanRealistic++
    }
    expect(total).toBe(6236)
    expect(worseThanRealistic).toBe(0)
    expect(newSum).toBeLessThan(oldRealistic * 0.6)
    try { writeFileSync('/tmp/claude-0/ramp-stats.json', JSON.stringify({ avgNewSteps: newSum / total, avgOldRealisticTaps: oldRealistic / total, avgOldMinimalTaps: oldMinimal / total, hist })) } catch { /* optional */ }
  })
  it('words outside the practice span are dimmed, or omitted for very long ayahs', () => {
    const ph = mk(4)
    const r = buildRamp(ph, 4 * SZ)
    expect(wordState(r[0]!, ph, 4 * SZ - 1, false)).toBe('dim')
    expect(wordState(r[0]!, ph, 4 * SZ - 1, false, true)).toBe('none')
  })
  it('repair practises each troubled joint in full and then from first words, then the whole ayah', () => {
    const ph = mk(3)
    const r = rampFromRepair(ph, [{ from: 1, to: 2 }])
    expect(r.map((x) => `${x.from}-${x.to}${x.allFaded ? 'f' : ''}`)).toEqual(['1-2', '1-2f', '0-2f'])
  })
})

describe('what the ramp records', () => {
  const flow = (f: Partial<FlowEvent>): FlowEvent => ({ id: Math.random().toString(), surah: 20, ayah: 5, fromPhrase: 0, toPhrase: 1, phraseCount: 3, rating: 'natural', reps: 1, durationMs: 1, occurredAt: Date.now(), ...f } as FlowEvent)
  it('a peek is a tangle on the joint the new piece attaches to; a clean pass clears it', () => {
    const ph = mk(3)
    const r = buildRamp(ph, 3 * SZ)
    expect(flowFor(r[2]!, true)).toEqual({ fromPhrase: 1, toPhrase: 2, rating: 'tangled' })
    expect(flowFor(r[2]!, false)).toEqual({ fromPhrase: 1, toPhrase: 2, rating: 'natural' })
    const peek = { ...flowFor(r[2]!, true) }
    const events = [flow({ ...peek, phraseCount: 3 }), flow({ ...peek, phraseCount: 3 })]
    expect(troubledRungs(events, 20, 5, 3)).toMatchObject([{ from: 1, to: 2, score: 2 }])
    expect(troubledRungs([...events, flow({ ...flowFor(r[2]!, false), phraseCount: 3 }), flow({ ...flowFor(r[2]!, false), phraseCount: 3 })], 20, 5, 3)).toEqual([])
  })
  it('the first and the whole-ayah steps record against the phrase or the whole ayah', () => {
    const ph = mk(3)
    const r = buildRamp(ph, 3 * SZ)
    expect(flowFor(r[0]!, false)).toMatchObject({ fromPhrase: 0, toPhrase: 0 })
    expect(flowFor(r[3]!, true)).toMatchObject({ fromPhrase: 0, toPhrase: 1 })
  })
})
