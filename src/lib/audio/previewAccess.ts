// Who may use phrase audio in a build that has it.
//
// Phrase audio streams recordings whose rights are not yet cleared (docs/PHRASE_AUDIO_RIGHTS.md). A Cloudflare preview address can be
// opened by anyone who has the link, so a build that has phrase audio refuses to use it anywhere except on this computer (localhost, for
// development and the browser tests) until the owner has typed the private test code once on that device. Without the code the app
// behaves like an ordinary build: no phrase timings are loaded, no phrase controls appear, no recording is fetched from the third-party host.
// Only a hash of the code is in the app, so reading the app does not reveal it. This is a guard against casual or accidental use of
// an open preview link. It is not a substitute for Cloudflare Access, which the docs also recommend.
export const PHRASE_AUDIO_BUILD = import.meta.env.VITE_PHRASE_AUDIO === '1'
/** SHA-256 of the private test code (the code itself is given only to the owner). */
export const TEST_CODE_SHA256 = '36647f572eed520dc53d6595fc8c4dc0d20cb0ff5eeffd313a157bf5fc8469fc'
const KEY = 'hifz.testCode'

export const isLocalHost = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
export async function sha256Hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
}
const normalise = (s: string) => s.trim().toLowerCase()
let expected = TEST_CODE_SHA256
export async function codeMatches(code: string): Promise<boolean> { return (await sha256Hex(normalise(code))) === expected }
/** Tests only: check against a hash of their own, so the real code never needs to appear in the repository. */
export function setExpectedHashForTests(h: string) { expected = h }

function storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null { try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null } }
let cached: boolean | null = null
/** May this device use phrase audio? false in every ordinary build. */
export async function phraseAudioAllowed(host: string = typeof location === 'undefined' ? '' : location.hostname): Promise<boolean> {
  if (!PHRASE_AUDIO_BUILD) return false
  if (isLocalHost(host)) return true
  if (cached !== null) return cached
  const saved = storage()?.getItem(KEY) ?? ''
  cached = saved ? await codeMatches(saved) : false
  return cached
}
/** Check a typed code and, if right, remember it on this device. */
export async function unlockPhraseAudio(code: string): Promise<boolean> {
  if (!(await codeMatches(code))) return false
  storage()?.setItem(KEY, normalise(code)); cached = true
  return true
}
export function lockPhraseAudio() { storage()?.removeItem(KEY); cached = false }
export function resetPhraseAudioCacheForTests() { cached = null }
