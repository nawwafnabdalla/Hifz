import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AYAH_WORDS, synth } from '../e2e/synthAudio'
import { toWav } from '../e2e/synthAudio'

const eleven = AYAH_WORDS.concat([{ ms: 300, gapAfterMs: 80 }, { ms: 300, gapAfterMs: 0 }])        // eleven words: Ta-Ha 22
const run = (args: string[]) => execFileSync('node', ['scripts/import-timings.mjs', ...args], { encoding: 'utf8' })

describe('timing import', () => {
  const dir = mkdtempSync(join(tmpdir(), 'timings-'))
  const s = synth(eleven)
  writeFileSync(join(dir, '020022.mp3'), toWav(s.samples, s.sampleRate))        // ffprobe reads the real length from the content
  const base = ['--reciter', 'testr', '--recording', 'everyayah:Test_128kbps', '--format', 'align', '--audio-dir', dir, '--source', 'fixture', '--licence', 'n/a', '--url', 'about:blank']
  const file = (rows: unknown) => { const f = join(dir, `in-${Math.random().toString(36).slice(2)}.json`); writeFileSync(f, JSON.stringify(rows)); return f }

  it('keeps an ayah only if it fits the canonical text and the real audio, and stores provenance and the real file length', () => {
    const out = join(dir, 'ok.json')
    const log = run([...base, '--input', file([{ surah: 20, ayah: 22, segments: s.segments }]), '--out', out])
    const d = JSON.parse(readFileSync(out, 'utf8'))
    expect(log).toContain('1 ayahs')
    expect(d.provenance).toMatchObject({ recording: 'everyayah:Test_128kbps', source: 'fixture' })
    expect(d.ayahs['20:22'].d).toBeGreaterThan(s.durationMs - 5); expect(d.ayahs['20:22'].d).toBeLessThan(s.durationMs + 5)
    expect(d.ayahs['20:22'].s).toHaveLength(eleven.length)
  })
  it('skips, and says why, when words, order, times or audio do not fit', () => {
    const bad = (segments: unknown, ayah = 22) => { const out = join(dir, `bad-${Math.random()}.json`); const log = run([...base, '--input', file([{ surah: 20, ayah, segments }]), '--out', out]); return { log, n: Object.keys(JSON.parse(readFileSync(out, 'utf8')).ayahs).length } }
    expect(bad([[0, 14, 100, 2000]]).log).toMatch(/beyond the canonical text/)
    expect(bad([[1, 2, 500, 700], [0, 1, 100, 300]]).log).toMatch(/out of order/)
    expect(bad(s.segments.slice(0, 3)).log).toMatch(/too few words timed/)
    expect(bad([[0, 11, 100, 99999]]).log).toMatch(/past the end/)
    expect(bad(s.segments, 23).log).toMatch(/audio file missing/)
    expect(bad(s.segments, 23).n).toBe(0)
  })
})
