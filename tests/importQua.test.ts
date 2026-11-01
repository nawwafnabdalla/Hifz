import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AYAH_WORDS, makeSurahMp3 } from '../e2e/synthAudio'

// Ta-Ha 22 has 11 words in the canonical text; the fixture's ayah is placed inside a surah-length CBR MP3 with ayahs before and after it.
const eleven = AYAH_WORDS.concat([{ ms: 300, gapAfterMs: 80 }, { ms: 300, gapAfterMs: 0 }])
const node = (args: string[]) => spawnSync('node', ['scripts/import-qua.mjs', ...args], { encoding: 'utf8' })

describe('whole-surah timing import (Quranic Universal Audio shape)', async () => {
  const s = await makeSurahMp3(eleven)
  const dir = mkdtempSync(join(tmpdir(), 'qua-'))
  writeFileSync(join(dir, '020.mp3'), s.mp3)
  // Absolute word times in the surah file: ayah-relative synthetic times + where the ayah starts in the file.
  const words = s.ayah.segments.map(([w0, , t0, t1]) => [w0 + 1, t0 + s.originMs, t1 + s.originMs])
  const write = (v: unknown, gz = false) => { const f = join(dir, `t-${Math.random().toString(36).slice(2)}.json${gz ? '.gz' : ''}`); const j = JSON.stringify(v); writeFileSync(f, gz ? gzipSync(j) : j); return f }
  const base = ['--reciter', 'testr', '--recording', 'qua:test', '--audio-dir', dir, '--url-template', 'https://x.test/{SSS}.mp3', '--source', 'fixture', '--licence', 'n/a', '--url', 'about:blank', '--riwayah', 'hafs']

  it('--inspect says what it understood from a gzipped file', () => {
    const r = node(['--inspect', '--timings', write({ '20:22': words }, true)])
    expect(r.status).toBe(0); expect(r.stdout).toContain('understood: 1 ayahs')
  })
  it('reports when it understands nothing instead of guessing', () => {
    const r = node(['--inspect', '--timings', write({ hello: 1 })])
    expect(r.status).toBe(1); expect(r.stdout).toContain('NOTHING understood')
  })
  it('imports an ayah as a window of the surah file, with the file facts stored', () => {
    const out = join(dir, 'ok.json')
    const r = node([...base, '--timings', write({ '20:22': words }), '--out', out])
    expect(r.status, r.stderr).toBe(0)
    const d = JSON.parse(readFileSync(out, 'utf8'))
    expect(d.provenance).toMatchObject({ granularity: 'surah', riwayah: 'hafs', recording: 'qua:test' })
    expect(d.provenance.audio.files['20']).toMatchObject({ bytes: s.mp3.length, kbps: 128 })
    const a = d.ayahs['20:22']
    expect(a.s).toHaveLength(11)
    expect(a.s[0][2]).toBeGreaterThanOrEqual(0)                                 // times are relative to the ayah window
    expect(a.o + a.s[0][2]).toBeCloseTo(words[0]![1]!, -1)                      // and the window origin recovers the file position
    expect(a.o + a.d).toBeGreaterThan(a.o + a.s.at(-1)[3])
  })
  it('accepts the object word shape too, with 1-based positions', () => {
    const out = join(dir, 'obj.json')
    const r = node([...base, '--timings', write([{ verse_key: '20:22', words: words.map(([w, a, b]) => ({ position: w, start: a, end: b })) }]), '--out', out])
    expect(r.status, r.stderr).toBe(0); expect(Object.keys(JSON.parse(readFileSync(out, 'utf8')).ayahs)).toEqual(['20:22'])
  })
  it('skips, and says why: wrong word count, order, too few words, missing audio', () => {
    const run = (v: unknown, extra: string[] = []) => node([...base, '--timings', write(v), '--out', join(dir, `s-${Math.random()}.json`), ...extra]).stdout
    expect(run({ '20:22': [[1, 100, 300], [14, 400, 600]] })).toMatch(/beyond the canonical text|too few/)
    expect(run({ '20:22': [[2, 400, 600], [1, 100, 300]] })).toMatch(/out of order/)
    expect(run({ '20:22': words.slice(0, 3) })).toMatch(/too few words timed/)
    expect(run({ '21:1': words })).toMatch(/surah audio file missing/)
  })
  it('refuses a recitation whose riwayah is not Hafs, or is not stated', () => {
    const noR = base.slice(0, -2)
    const a = node([...noR, '--timings', write({ '20:22': words }), '--out', join(dir, 'x.json')])
    expect(a.status).toBe(3); expect(a.stderr).toContain('riwayah')
    const b = node([...base.slice(0, -1), 'warsh', '--timings', write({ '20:22': words }), '--out', join(dir, 'y.json')])
    expect(b.status).toBe(3)
  })
  it('refuses a variable-bitrate file, which cannot be cut by byte position', () => {
    const d2 = mkdtempSync(join(tmpdir(), 'qua-vbr-'))
    const w = join(d2, 'in.wav')
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=20', '-codec:a', 'libmp3lame', '-q:a', '4', join(d2, '020.mp3')])
    void w
    const out = join(d2, 'o.json')
    const r = node([...base.map((x) => (x === dir ? d2 : x)), '--timings', write({ '20:22': words }), '--out', out])
    expect(r.stdout).toMatch(/variable-bitrate|runs past the end|surah audio file missing/)
  })
})
