// Whole-Qur'an mode: REAL_MP3_DIR=<folder of SSS.mp3> [REAL_SURAHS=1,2,20|all] [REAL_CLIP_EVERY=25] instead of REAL_MP3/REAL_SURAH. Per-phrase acoustic metrics go to report.json
// (padding kept around the timed words, energy outside the timed words, refusals); only every Nth cut is written as a clip (for transcription).
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

const T = process.env.REAL_TIMINGS, M = process.env.REAL_MP3 ?? process.env.REAL_MP3_DIR, OUT = process.env.REAL_OUT, SURAH_ENV = process.env.REAL_SURAH ?? '20', MP3_DIR = process.env.REAL_MP3_DIR
const CLIP_EVERY = Number(process.env.REAL_CLIP_EVERY ?? 1), FAST = process.env.REAL_FAST === '1'   // FAST: decode one window per ayah instead of one per phrase (same audio, far fewer decoder runs)
const wav = (x: Float32Array, rate: number) => {
  const b = Buffer.alloc(44 + x.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40)
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i]! * 32767))), 44 + i * 2)
  return b
}
describe.skipIf(!T || !M || !OUT)('real recording', () => {
  it('runs the engine over every ayah', () => {
    const rec = JSON.parse(readFileSync(T!, 'utf8')) as RecordingTimings
    mkdirSync(join(OUT!, 'clips'), { recursive: true })
    const decode = (bytes: Buffer) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 'f32le', '-ac', '1', '-ar', '44100', 'pipe:1'], { input: bytes, maxBuffer: 1 << 28 }); const b = r.stdout; return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)) }
    const surahs = MP3_DIR ? (SURAH_ENV === 'all' ? Object.keys(rec.provenance.audio!.files).map(Number) : SURAH_ENV.split(',').map(Number)) : [Number(SURAH_ENV)]
    const rows: unknown[] = []; const bySurah: Record<number, { ayahs: number; phrases: number; cut: number; refused: number; noRange: number }> = {}
    const tally = { ayahs: 0, whole: 0, phrased: 0, phrases: 0, cut: 0, refused: 0, noRange: 0, invalid: 0 }
    let nCut = 0
    const frameDb = (x: Float32Array, rate: number, fromSec: number, toSec: number) => {
      const n = Math.round(rate * 0.03), out: number[] = []
      for (let i = Math.max(0, Math.round(fromSec * rate)); i + n <= Math.min(x.length, Math.round(toSec * rate)); i += n) { let s = 0; for (let j = 0; j < n; j++) s += x[i + j]! * x[i + j]!; out.push(Math.sqrt(s / n)) }
      return out
    }
    for (const SURAH of surahs) {
      const file = rec.provenance.audio!.files[String(SURAH)]!
      const mp3 = readFileSync(MP3_DIR ? join(MP3_DIR, `${String(SURAH).padStart(3, '0')}.mp3`) : M!)
      if (mp3.length !== file.bytes) { rows.push({ s: SURAH, r: 'file-size-mismatch', have: mp3.length, want: file.bytes }); continue }       // identity check: this is not the recording the timings describe
      const S = (bySurah[SURAH] = { ayahs: 0, phrases: 0, cut: 0, refused: 0, noRange: 0 })
      for (let a = 1; a <= ayahCount(SURAH); a++) {
        const raw = rec.ayahs[`${SURAH}:${a}`]; if (!raw) continue
        const t = expand(raw, SURAH, a)
        if (validateAyahTiming(t)) { tally.invalid++; continue }
        tally.ayahs++; S.ayahs++
        const w = wordsOfAyah(SURAH, a), ph = buildPhrases(w, defaultBoundaries(SURAH, a, w, reciterPauses(t)))
        if (ph.length === 1) tally.whole++; else tally.phrased++
        let shared: { win: ReturnType<typeof byteWindow>; pcm: Float32Array } | null = null
        if (FAST) {
          const props = ph.map((p) => proposeRange(t, p.from, p.to)).filter((x): x is RangeProposal => !!x)
          if (props.length) { const o = t.originMs ?? 0, win = byteWindow(file, o + Math.min(...props.map((x) => x.startMs)) - WINDOW_PAD_MS, Math.min(file.durationMs, o + Math.max(...props.map((x) => x.endMs)) + WINDOW_PAD_MS)); shared = { win, pcm: decode(mp3.subarray(win.start, win.end + 1)) } }
        }
        for (let i = 0; i < ph.length; i++) {
          tally.phrases++; S.phrases++
          const p = ph[i]!, prop = proposeRange(t, p.from, p.to)
          if (!prop) { tally.noRange++; S.noRange++; rows.push({ s: SURAH, a, i, from: p.from, to: p.to, r: 'no-range' }); continue }
          const o = t.originMs ?? 0
          const win = shared?.win ?? byteWindow(file, o + prop.startMs - WINDOW_PAD_MS, Math.min(file.durationMs, o + prop.endMs + WINDOW_PAD_MS))
          const pcm = shared?.pcm ?? decode(mp3.subarray(win.start, win.end + 1)), rate = 44100
          const off = win.startMs - o
          const local: RangeProposal = { startMs: prop.startMs - off, endMs: prop.endMs - off, startGap: prop.startGap && [prop.startGap[0] - off, prop.startGap[1] - off], endGap: prop.endGap && [prop.endGap[0] - off, prop.endGap[1] - off], ...(prop.startLimitMs !== undefined ? { startLimitMs: prop.startLimitMs - off } : {}), ...(prop.endLimitMs !== undefined ? { endLimitMs: prop.endLimitMs - off } : {}) }
          const cut = cutPoints({ sampleRate: rate, samples: pcm }, local, pcm.length / rate)
          if (!cut) { tally.refused++; S.refused++; rows.push({ s: SURAH, a, i, from: p.from, to: p.to, r: 'no-pause' }); continue }
          tally.cut++; S.cut++; nCut++
          const firstT0 = o + t.segments.find((x) => x.w0 === p.from)!.t0, lastT1 = o + t.segments.find((x) => x.w1 - 1 === p.to)!.t1
          const cutStartAbs = win.startMs + cut.startSec * 1000, cutEndAbs = win.startMs + cut.endSec * 1000
          const fr = frameDb(pcm, rate, cut.startSec, cut.endSec), lvl = [...fr].sort((x, y) => x - y)[Math.floor(fr.length * 0.9)] || 1
          const tailFr = frameDb(pcm, rate, (lastT1 - win.startMs) / 1000 + 0.03, cut.endSec), leadFr = frameDb(pcm, rate, cut.startSec, (firstT0 - win.startMs) / 1000 - 0.03)
          rows.push({ s: SURAH, a, i, from: p.from, to: p.to, r: 'cut', len: +(cut.endSec - cut.startSec).toFixed(2), dip: +cut.dip.toFixed(2), tail: Math.round(cutEndAbs - lastT1), lead: Math.round(firstT0 - cutStartAbs), tr: +(Math.max(0, ...tailFr) / lvl).toFixed(2), lr: +(Math.max(0, ...leadFr) / lvl).toFixed(2) })
          if (nCut % CLIP_EVERY === 0) writeFileSync(join(OUT!, 'clips', `${SURAH}-${a}-${i}.wav`), wav(pcm.subarray(Math.floor(cut.startSec * rate), Math.ceil(cut.endSec * rate)), rate))
        }
      }
    }
    writeFileSync(join(OUT!, 'report.json'), JSON.stringify({ tally, bySurah, rows }))
    console.log('REAL', JSON.stringify(tally))
  }, 14_400_000)
})
