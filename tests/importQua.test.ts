import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
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

describe('Quranic Universal Audio release folder (real v4.0.0 layout)', async () => {
  const s = await makeSurahMp3(eleven)
  const audio = mkdtempSync(join(tmpdir(), 'qua-aud-'))
  writeFileSync(join(audio, '020.mp3'), s.mp3)
  const abs = s.ayah.segments.map(([w0, , t0, t1]) => [w0 + 1, t0 + s.originMs, t1 + s.originMs])
  const release = (opts: { rows: unknown[]; riwayah?: string; url?: string; badSha?: boolean }) => {
    const d = mkdtempSync(join(tmpdir(), 'qua-r-')), z = join(d, 'zip')
    execFileSync('mkdir', [z])
    writeFileSync(join(z, 'word_timestamps.json.gz'), gzipSync(JSON.stringify({ _meta: {}, rows: opts.rows })))
    execFileSync('zip', ['-q', '-j', join(d, 'rec_a.zip'), join(z, 'word_timestamps.json.gz')])
    const sha = createHash('sha256').update(readFileSync(join(d, 'rec_a.zip'))).digest('hex')
    writeFileSync(join(d, 'manifest.json'), JSON.stringify({ release_version: 'v9.9.9', license: 'CC-BY-4.0', recitations: { rec_a: { zip: 'rec_a.zip', sha256: opts.badSha ? 'x' : sha, ts_version: 'ts-test' } } }))
    writeFileSync(join(d, 'catalog.json'), JSON.stringify({ recitations: [{ slug: 'rec_a', riwayah: opts.riwayah ?? 'hafs_an_asim', audio: { bitrate_kbps_nominal: 128, chapter_urls: { '20': opts.url ?? 'https://x.test/020.mp3' } } }] }))
    return d
  }
  const run = (d: string, extra: string[] = []) => { const out = join(d, 'out.json'); const r = spawnSync('node', ['scripts/import-qua.mjs', '--release-dir', d, '--slug', 'rec_a', '--reciter', 'testr', '--audio-dir', audio, '--out', out, ...extra], { encoding: 'utf8' }); return { r, out } }

  it('imports the canonical rows, names the recording by its slug, and keeps the host\'s own URL per surah', () => {
    const d = release({ rows: [['20:22', abs[0]![1], abs.at(-1)![2], true, 50, abs], ['20:22', 1, 2, false, 0, []]] })
    const { r, out } = run(d)
    expect(r.status, r.stderr).toBe(0)
    const j = JSON.parse(readFileSync(out, 'utf8'))
    expect(j.provenance).toMatchObject({ recording: 'qua:rec_a', riwayah: 'hafs', granularity: 'surah' })
    expect(j.provenance.source).toContain('v9.9.9'); expect(j.provenance.licence).toContain('x.test')
    expect(j.provenance.audio.urls['20']).toBe('https://x.test/020.mp3')
    expect(j.ayahs['20:22'].s).toHaveLength(11)
  })
  it('keeps only the reciter\'s last continuous take when a passage is recited twice, and refuses phrases that span the seam', () => {
    const redo = [...abs.slice(0, 6), ...abs.slice(3).map(([w, a, b]) => [w, a! + 1800, b! + 1800])]       // words 1-6, then 4-11 again 1.8 s later
    const d = release({ rows: [['20:22', abs[0]![1], redo.at(-1)![2], true, 50, redo]] })
    const { r, out } = run(d)
    expect(r.status, r.stderr).toBe(0)
    const segs = JSON.parse(readFileSync(out, 'utf8')).ayahs['20:22'].s as number[][]
    expect(segs.map((x) => x[0])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])              // one pass through the words, no repeats
    expect(JSON.parse(readFileSync(out, 'utf8')).ayahs['20:22'].x).toEqual([3])                 // the seam is recorded: no phrase may span words 3|4
    const xs = JSON.parse(readFileSync(out, 'utf8')).ayahs['20:22'].xs as number[][]
    expect(xs).toHaveLength(1); expect(xs[0]![0]).toBeLessThan(xs[0]![1]!)                  // when the abandoned attempt starts and ends is recorded too
    expect(segs[3]![2] - segs[2]![3]).toBeGreaterThan(1500)                                  // the seam is visible in the data: the abandoned take sits in it
  })
  it('refuses a zip whose checksum is not the release manifest\'s, a non-Hafs recitation, and a YouTube-aligned one', () => {
    expect(run(release({ rows: [], badSha: true })).r.status).toBe(3)
    expect(run(release({ rows: [], riwayah: 'warsh_an_nafi' })).r.status).toBe(3)
    const y = run(release({ rows: [], url: 'https://www.youtube.com/watch?v=abc' }))
    expect(y.r.status).toBe(3); expect(y.r.stderr).toContain('YouTube')
  })
})
