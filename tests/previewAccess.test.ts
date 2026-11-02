import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

// The real code is never in the repository. These tests use a code of their own, checked against its own hash.
const TEST_CODE = 'hifz-unit-test-code'
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } }
const load = async (flag: string) => {
  vi.resetModules(); vi.stubEnv('VITE_PHRASE_AUDIO', flag)
  const m = await import('@/lib/audio/previewAccess')
  m.setExpectedHashForTests(createHash('sha256').update(TEST_CODE).digest('hex'))
  return m
}
const PREVIEW = 'phrase-audio-hifz.someone.workers.dev'

describe('phrase audio on an open preview link', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', mem()) })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('an ordinary build never allows it, anywhere', async () => {
    const m = await load('')
    expect(await m.phraseAudioAllowed('localhost')).toBe(false)
    expect(await m.phraseAudioAllowed(PREVIEW)).toBe(false)
  })
  it('a build with phrase audio allows it on this computer, and refuses it on a preview address until the private code is entered', async () => {
    const m = await load('1')
    expect(await m.phraseAudioAllowed('localhost')).toBe(true)
    expect(await m.phraseAudioAllowed(PREVIEW)).toBe(false)
    expect(await m.unlockPhraseAudio('wrong-code')).toBe(false)
    expect(await m.phraseAudioAllowed(PREVIEW)).toBe(false)
  })
  it('the code unlocks only this device, survives a reload, ignores case and spaces, and can be turned off', async () => {
    const m = await load('1')
    expect(await m.unlockPhraseAudio(`  ${TEST_CODE.toUpperCase()}  `)).toBe(true)
    expect(await m.phraseAudioAllowed(PREVIEW)).toBe(true)
    m.resetPhraseAudioCacheForTests()
    expect(await m.phraseAudioAllowed(PREVIEW)).toBe(true)          // read back from the device's storage
    m.lockPhraseAudio()
    expect(await m.phraseAudioAllowed(PREVIEW)).toBe(false)
  })
  it('a stored value that is not the code does not unlock', async () => {
    const m = await load('1')
    localStorage.setItem('hifz.testCode', 'hifz-000000-000000')
    expect(await m.phraseAudioAllowed(PREVIEW)).toBe(false)
  })
  it('the app holds only a hash, never the code', async () => {
    const m = await load('1')
    expect(m.TEST_CODE_SHA256).toMatch(/^[0-9a-f]{64}$/)
    expect(m.TEST_CODE_SHA256).not.toContain('hifz-')
  })
})

describe('typing the code on a phone', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('accepts it however a phone keyboard or a paste may have altered it: case, spaces, non-breaking spaces, and dash look-alikes', async () => {
    const m = await load('1')
    for (const typed of ['hifz-unit-test-code', 'HIFZ-UNIT-TEST-CODE', '  hifz-unit-test-code\n', 'hifz\u2013unit\u2013test\u2013code', 'hifz\u2011unit\u2014test-code', 'hifz-unit-test-code\u00a0', 'hifz unit test code'.replace(/ /g, '-')]) {
      m.lockPhraseAudio()
      expect(await m.unlockPhraseAudio(typed), JSON.stringify(typed)).toBe(true)
    }
    for (const typed of ['', 'hifz', 'hifz-unit-test-cod', 'hifz-unit-test-code-', 'hifz-unit-test-codee']) { m.lockPhraseAudio(); expect(await m.unlockPhraseAudio(typed), JSON.stringify(typed)).toBe(false) }
  })
  it('a build can carry its own hash (a build variable), which replaces the built-in one', async () => {
    vi.resetModules(); vi.stubEnv('VITE_PHRASE_AUDIO', '1'); vi.stubEnv('VITE_TEST_CODE_SHA256', createHash('sha256').update('another-code').digest('hex').toUpperCase())
    const m = await import('@/lib/audio/previewAccess')
    expect(await m.codeMatches('another-code')).toBe(true)
    expect(await m.codeMatches(TEST_CODE)).toBe(false)
  })
  it('the rotation script prints a code once whose SHA-256 is the one it prints (so what is shown is what is checked), and writes nothing without --write', () => {
    const out = execFileSync('node', ['scripts/new-test-code.mjs'], { encoding: 'utf8' })
    const code = /test code \(shown once\): (\S+)/.exec(out)![1]!, hash = /sha256: ([0-9a-f]{64})/.exec(out)![1]!
    expect(code).toMatch(/^hifz-[0-9a-f]{6}-[0-9a-f]{6}$/)
    expect(createHash('sha256').update(code).digest('hex')).toBe(hash)
  })
})

describe('which addresses may reach the real database', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('only the live app, a custom domain and this computer; every other *.workers.dev address is a preview', async () => {
    vi.resetModules(); vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co'); vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'k')
    const r = await import('@/lib/store/remote')
    expect(r.isPreviewHost('hifz.nawwaf-n-abdalla.workers.dev')).toBe(false)
    expect(r.isPreviewHost('phrase-audio-hifz.nawwaf-n-abdalla.workers.dev')).toBe(true)
    expect(r.isPreviewHost('hifz-test.nawwaf-n-abdalla.workers.dev')).toBe(true)
    expect(r.isPreviewHost('hifz.example.com')).toBe(false)
    expect(r.isPreviewHost('localhost')).toBe(false)
  })
})
