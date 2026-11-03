import '@fontsource-variable/inter'
import '@fontsource-variable/fraunces'
import '@fontsource/amiri-quran/400.css'
// Amiri Quran has no glyph for U+065E (1,807 uses in the text); words containing it are set in Amiri, same family. See tests/fonts.test.ts.
import '@fontsource/amiri/arabic-400.css'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'

// Browser tests only (VITE_E2E=1, set by the test server and never by a real build): ask the app which practice phrases it prepared for an ayah.
if (import.meta.env.VITE_E2E === '1') {
  void Promise.all([import('./lib/engine/breakdown'), import('./lib/engine/phrases'), import('./lib/quran/data')]).then(([b, ph, d]) => {
    ;(window as unknown as { __hifzPhrases?: unknown }).__hifzPhrases = (s: number, a: number, pauses: { afterWord: number; ms: number }[]) => { const w = d.wordsOfAyah(s, a); return ph.buildPhrases(w, b.meaningBreakdown(s, a, w, pauses).boundaries).map((p) => [p.from, p.to]) }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
