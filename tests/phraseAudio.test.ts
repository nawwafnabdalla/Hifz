import { describe, expect, it } from 'vitest'
import { AYAH_WORDS, synth, toneEnergy, wordHz, type SynthWord } from '../e2e/synthAudio'
import { cutPoints, quietRunNear, frameRms, speechLevel, sameRecording } from '@/lib/audio/phraseAudio'
import { proposeRange, validateAyahTiming, reciterPauses, expand, registerTimings, clearTimings, ayahTiming, type AyahTiming, type RecordingTimings } from '@/lib/audio/timings'

const timingOf = (s: ReturnType<typeof synth>, surah = 20, ayah = 5, shift: (i: number) => number = () => 0): AyahTiming => ({
  surah, ayah, durationMs: s.durationMs, segments: s.segments.map(([w0, w1, t0, t1], i) => ({ w0, w1, t0: t0 + shift(i), t1: t1 + shift(i) })),
})
const pcm = (s: ReturnType<typeof synth>) => ({ sampleRate: s.sampleRate, samples: s.samples })

/** The cut must contain every word of [from, to] completely and none of its neighbours, at the sample level. */
function assertNoClipNoSpill(s: ReturnType<typeof synth>, from: number, to: number, startSec: number, endSec: number) {
  const a = startSec * 1000, b = endSec * 1000
  for (let i = from; i <= to; i++) { expect(a, `word ${i} onset clipped`).toBeLessThanOrEqual(s.active[i]!.t0); expect(b, `word ${i} ending clipped`).toBeGreaterThanOrEqual(s.active[i]!.t1) }
  if (from > 0) expect(a, `previous word ${from - 1} spills in`).toBeGreaterThanOrEqual(s.active[from - 1]!.t1)
  if (to < s.active.length - 1) expect(b, `next word ${to + 1} spills in`).toBeLessThanOrEqual(s.active[to + 1]!.t0)
}

describe('cutting a phrase out of a recording', () => {
  const s = synth(AYAH_WORDS)
  const t = timingOf(s)

  it('with exact timings, every phrase cut keeps all its words and none of the neighbours', () => {
    for (const [from, to] of [[0, 2], [3, 5], [6, 8], [0, 5], [3, 8], [0, 8], [0, 0], [4, 4]]) {
      const prop = proposeRange(t, from, to)!
      const cut = cutPoints(pcm(s), prop, s.durationMs / 1000)
      if (!cut) continue                                   // refusing is allowed; clipping is not
      assertNoClipNoSpill(s, from, to, cut.startSec, cut.endSec)
    }
  })
  it('breath-sized pauses between phrases are always cuttable', () => {
    for (const [from, to] of [[0, 2], [3, 5], [6, 8], [0, 5], [3, 8]]) expect(cutPoints(pcm(s), proposeRange(t, from, to)!, s.durationMs / 1000), `${from}-${to}`).not.toBeNull()
  })
  it('the cut audio really contains the intended words and not the others (by pitch)', () => {
    const cut = cutPoints(pcm(s), proposeRange(t, 3, 5)!, s.durationMs / 1000)!
    const a = Math.round(cut.startSec * s.sampleRate), b = Math.round(cut.endSec * s.sampleRate)
    const e = (i: number) => toneEnergy(s.samples, s.sampleRate, wordHz(i), a, b) * (b - a)
    const own = [3, 4, 5].map(e), other = [0, 1, 2, 6, 7, 8].map(e)
    expect(Math.min(...own)).toBeGreaterThan(Math.max(...other) * 20)
  })
  it('joining phrases (A→B) is one continuous range that keeps the pause between them', () => {
    const cut = cutPoints(pcm(s), proposeRange(t, 0, 5)!, s.durationMs / 1000)!
    assertNoClipNoSpill(s, 0, 5, cut.startSec, cut.endSec)
    expect((cut.endSec - cut.startSec) * 1000).toBeGreaterThan(s.active[5]!.t1 - s.active[0]!.t0)
  })
  it('timings that drift by up to ±80 ms still never clip or spill: the cut either lands in a real pause or is refused', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1
    let used = 0, refused = 0
    for (let trial = 0; trial < 300; trial++) {
      const drift = Array.from({ length: s.segments.length }, () => rnd() * 80)
      const td = timingOf(s, 20, 5, (i) => drift[i]!)
      const from = Math.floor(rnd() * 4 + 4) % 9, to = Math.min(8, from + Math.floor(Math.abs(rnd()) * 5))
      const prop = proposeRange(td, from, to)
      if (!prop) { refused++; continue }
      const cut = cutPoints(pcm(s), prop, s.durationMs / 1000)
      if (!cut) { refused++; continue }
      used++
      assertNoClipNoSpill(s, from, to, cut.startSec, cut.endSec)
    }
    expect(used).toBeGreaterThan(100)
  })
  it('words that run together (no real pause) are refused rather than cut through', () => {
    const run: SynthWord[] = [{ ms: 300, gapAfterMs: 0 }, { ms: 300, gapAfterMs: 0 }, { ms: 300, gapAfterMs: 0 }, { ms: 300, gapAfterMs: 0 }]
    const r = synth(run)
    expect(cutPoints(pcm(r), proposeRange(timingOf(r), 1, 2)!, r.durationMs / 1000)).toBeNull()
  })
  it('a boundary where a long pause sits far from the proposed position is not "found" by luck', () => {
    // timing says the cut is at word 5 but is 300 ms off; no pause lies within the search window except the wrong one: refuse
    const bad = timingOf(s, 20, 5, (i) => (i >= 3 ? 300 : 0))
    const prop = proposeRange(bad, 3, 5)
    const cut = prop ? cutPoints(pcm(s), prop, s.durationMs / 1000) : null
    if (cut) assertNoClipNoSpill(s, 3, 5, cut.startSec, cut.endSec)
  })
  it('tells a real pause from a dip inside or between flowing words', () => {
    const fr = frameRms(pcm(s)), ref = speechLevel(fr)
    const breath = (s.active[2]!.t1 + s.active[3]!.t0) / 2000
    const q = quietRunNear(fr, breath - 0.1, breath + 0.1, ref, breath)!
    expect(q.dip).toBeLessThan(0.1)
    expect(q.ms).toBeGreaterThan(200)
    const insideWord = (s.active[1]!.t0 + s.active[1]!.t1) / 2000
    expect(quietRunNear(fr, insideWord - 0.05, insideWord + 0.05, ref, insideWord)).toBeNull()
  })
})

describe('timings are checked and scoped to one recording', () => {
  const s = synth(AYAH_WORDS)
  const t = timingOf(s)
  it('accepts a clean alignment and rejects structural problems', () => {
    expect(validateAyahTiming(t, 9)).toBeNull()
    expect(validateAyahTiming({ ...t, segments: [] }, 9)).toBe('empty')
    expect(validateAyahTiming({ ...t, segments: [t.segments[1]!, t.segments[0]!, ...t.segments.slice(2)] }, 9)).toBe('out-of-order')
    expect(validateAyahTiming({ ...t, segments: [{ w0: 0, w1: 12, t0: 0, t1: 100 }] }, 9)).toBe('word-out-of-range')
    expect(validateAyahTiming({ ...t, segments: t.segments.slice(0, 3) }, 9)).toBe('sparse')
    expect(validateAyahTiming({ ...t, segments: [{ w0: 0, w1: 1, t0: 500, t1: 100 }, ...t.segments.slice(1)] }, 9)).toBe('bad-span')
    expect(validateAyahTiming({ ...t, segments: [...t.segments.slice(0, 8), { ...t.segments[8]!, t1: t.durationMs + 500 }] }, 9)).toBe('past-end')
  })
  it('will not isolate a word that shares a timing segment with others, or has none', () => {
    const grouped: AyahTiming = { ...t, segments: [{ w0: 0, w1: 2, t0: t.segments[0]!.t0, t1: t.segments[1]!.t1 }, ...t.segments.slice(2)] }
    expect(proposeRange(grouped, 1, 3)).toBeNull()
    expect(proposeRange(grouped, 0, 3)).not.toBeNull()
    expect(proposeRange({ ...t, segments: t.segments.filter((x) => x.w0 !== 4) }, 4, 5)).toBeNull()
  })
  it('lists the reciter’s own pauses, longest first (used to suggest where to break a long ayah)', () => {
    const p = reciterPauses(t)
    expect(p[0]!.afterWord).toBe(5)               // the 420 ms breath
    expect(p[1]!.afterWord).toBe(2)               // the 380 ms breath
  })
  it('a decoded file of a different length is a different recording and is refused', () => {
    expect(sameRecording(t, t.durationMs / 1000)).toBe(true)
    expect(sameRecording(t, t.durationMs / 1000 + 0.2)).toBe(false)
  })
  it('timings apply only to the recording they describe, never another reciter or another encoding of the same one', async () => {
    clearTimings()
    const data: RecordingTimings = { schema: 1, reciter: 'dossary', provenance: { source: 'test', licence: 'CC-BY-4.0', url: 'x', recording: 'everyayah:Yasser_Ad-Dussary_128kbps', method: 'test', retrieved: '2026-11-01' }, ayahs: { '20:12': { d: t.durationMs, s: t.segments.map((x) => [x.w0, x.w1, x.t0, x.t1] as [number, number, number, number]) } } }
    registerTimings(data)
    expect(await ayahTiming('dossary', 'everyayah:Yasser_Ad-Dussary_128kbps', 20, 12)).not.toBeNull()   // Ta-Ha 12 has nine words, as the fixture does
    expect(await ayahTiming('dossary', 'islamicnetwork:ar.yasser', 20, 12)).toBeNull()                 // another encoding
    expect(await ayahTiming('maher', 'everyayah:Yasser_Ad-Dussary_128kbps', 20, 12)).toBeNull()        // another reciter
    expect(await ayahTiming('dossary', 'everyayah:Yasser_Ad-Dussary_128kbps', 20, 6)).toBeNull()       // an ayah that was not aligned
    clearTimings()
  })
  it('expand() reads the compact file format', () => {
    expect(expand({ d: 1000, s: [[0, 2, 10, 500]] }, 1, 1).segments[0]).toEqual({ w0: 0, w1: 2, t0: 10, t1: 500 })
  })
})
