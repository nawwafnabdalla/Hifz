// Offline harness that runs the app's REAL engine (phrases, ranges, cut points) over a REAL recording. Not part of the normal suite:
//   REAL_TIMINGS=<imported json> REAL_MP3=<surah mp3> REAL_SURAH=20 REAL_OUT=<dir> npx vitest run tests/realAudio.gen.test.ts
// For every ayah of the surah it asks the engine for the default phrases, decodes exactly the byte window the app would fetch, finds the cut,
// and writes the cut audio (WAV) so it can be transcribed or listened to. A summary of refusals and cut statistics goes to <dir>/report.json.
import { describe, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { wordsOfAyah, ayahCount } from '@/lib/quran/data'
import { buildPhrases } from '@/lib/engine/phrases'
import { defaultBoundaries } from '@/lib/engine/breakdown'
import { expand, proposeRange, validateAyahTiming, reciterPauses, type RecordingTimings, type RangeProposal } from '@/lib/audio/timings'
import { cutPoints } from '@/lib/audio/phraseAudio'
import { byteWindow, WINDOW_PAD_MS } from '@/lib/audio/phraseSource'

const T = process.env.REAL_TIMINGS, M = process.env.REAL_MP3, OUT = process.env.REAL_OUT, SURAH = Number(process.env.REAL_SURAH ?? 20)
const wav = (x: Float32Array, rate: number) => {
  const b = Buffer.alloc(44 + x.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40)
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i]! * 32767))), 44 + i * 2)
  return b
}
describe.skipIf(!T || !M || !OUT)('real recording', () => {
  it('runs the engine over every ayah', () => {
    const rec = JSON.parse(readFileSync(T!, 'utf8')) as RecordingTimings
    const mp3 = readFileSync(M!), file = rec.provenance.audio!.files[String(SURAH)]!
    mkdirSync(join(OUT!, 'clips'), { recursive: true })
    const decode = (bytes: Buffer) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 'f32le', '-ac', '1', 'pipe:1'], { input: bytes, maxBuffer: 1 << 28 }); const b = r.stdout; return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)) }
    const rows: unknown[] = []; const tally = { ayahs: 0, whole: 0, phrased: 0, phrases: 0, cut: 0, refused: 0, noRange: 0, invalid: 0 }
    for (let a = 1; a <= ayahCount(SURAH); a++) {
      const raw = rec.ayahs[`${SURAH}:${a}`]; if (!raw) continue
      const t = expand(raw, SURAH, a)
      if (validateAyahTiming(t)) { tally.invalid++; continue }
      tally.ayahs++
      const w = wordsOfAyah(SURAH, a), ph = buildPhrases(w, defaultBoundaries(SURAH, a, w, reciterPauses(t)))
      if (ph.length === 1) tally.whole++; else tally.phrased++
      for (let i = 0; i < ph.length; i++) {
        tally.phrases++
        const p = ph[i]!, prop = proposeRange(t, p.from, p.to)
        if (!prop) { tally.noRange++; rows.push({ a, i, from: p.from, to: p.to, result: 'no-range' }); continue }
        const o = t.originMs ?? 0, win = byteWindow(file, o + prop.startMs - WINDOW_PAD_MS, Math.min(file.durationMs, o + prop.endMs + WINDOW_PAD_MS))
        const pcm = decode(mp3.subarray(win.start, win.end + 1)), rate = 44100
        const sh = (x: number) => x - win.startMs + o - o            // window clock: ayah-relative time minus the window start expressed on the ayah clock
        const off = win.startMs - o
        const local: RangeProposal = { startMs: prop.startMs - off, endMs: prop.endMs - off, startGap: prop.startGap && [prop.startGap[0] - off, prop.startGap[1] - off], endGap: prop.endGap && [prop.endGap[0] - off, prop.endGap[1] - off], ...(prop.startLimitMs !== undefined ? { startLimitMs: prop.startLimitMs - off } : {}), ...(prop.endLimitMs !== undefined ? { endLimitMs: prop.endLimitMs - off } : {}) }
        void sh
        const cut = cutPoints({ sampleRate: rate, samples: pcm }, local, pcm.length / rate)
        if (!cut) { tally.refused++; rows.push({ a, i, from: p.from, to: p.to, result: 'no-pause' }); continue }
        tally.cut++
        writeFileSync(join(OUT!, 'clips', `${SURAH}-${a}-${i}.wav`), wav(pcm.subarray(Math.floor(cut.startSec * rate), Math.ceil(cut.endSec * rate)), rate))
        rows.push({ a, i, from: p.from, to: p.to, words: p.words.join(' '), result: 'cut', startSec: +cut.startSec.toFixed(3), endSec: +cut.endSec.toFixed(3), dip: +cut.dip.toFixed(2), proposedMs: [Math.round(prop.startMs), Math.round(prop.endMs)], absStartMs: Math.round(o + prop.startMs), absEndMs: Math.round(o + prop.endMs), cutAbsStartMs: Math.round(win.startMs + cut.startSec * 1000), cutAbsEndMs: Math.round(win.startMs + cut.endSec * 1000), firstWordStartMs: Math.round(o + t.segments.find((s) => s.w0 === p.from)!.t0), lastWordEndMs: Math.round(o + t.segments.find((s) => s.w1 - 1 === p.to)!.t1), nextWordStartMs: (() => { const s = t.segments.find((x) => x.w0 === p.to + 1); return s ? Math.round(o + s.t0) : null })(), prevWordEndMs: (() => { const s = t.segments.find((x) => x.w1 - 1 === p.from - 1); return s ? Math.round(o + s.t1) : null })() })
      }
    }
    writeFileSync(join(OUT!, 'report.json'), JSON.stringify({ tally, rows }, null, 1))
    console.log('REAL', JSON.stringify(tally))
  }, 1_800_000)
})
