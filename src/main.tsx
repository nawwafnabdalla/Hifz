import '@fontsource-variable/inter'
import '@fontsource-variable/fraunces'
import '@fontsource/amiri-quran/400.css'
// Amiri Quran has no glyph for U+065E (1,807 uses in the text); words containing it are set in Amiri, same family. See tests/fonts.test.ts.
import '@fontsource/amiri/arabic-400.css'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'

// Browser-test builds only (VITE_E2E=1; a normal build removes this): expose the hooks tests use to supply timings and listen to playback.
if (import.meta.env.VITE_PHRASE_AUDIO === '1') document.title = 'Hifz OS (test)'
if (import.meta.env.VITE_E2E === '1') {
  void import('./lib/audio/timings'); void import('./lib/audio/phraseAudio')
  // The phrases the app itself chooses for an ayah, so tests check audio against the real engine rather than a copy of its rules.
  void import('./lib/audio/recordingAudio').then((m) => {
    ;(window as unknown as { __hifzWholeAyah?: unknown }).__hifzWholeAyah = async (r: string, s: number, a: number) => {
      await (await import('./lib/audio/timings')).primeTimings(r)
      const b = await m.recordingAudio.blob(r, s, a); if (!b) return null
      const buf = new Uint8Array(await b.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(bin)
    }
  })
  void Promise.all([import('./lib/engine/breakdown'), import('./lib/engine/phrases'), import('./lib/quran/data')]).then(([b, ph, d]) => {
    ;(window as unknown as { __hifzPhrases?: unknown }).__hifzPhrases = (s: number, a: number, pauses: { afterWord: number; ms: number }[]) => { const w = d.wordsOfAyah(s, a); return ph.buildPhrases(w, b.defaultBoundaries(s, a, w, pauses)).map((p) => [p.from, p.to]) }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
