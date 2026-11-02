import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

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
