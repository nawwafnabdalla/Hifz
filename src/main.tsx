import '@fontsource-variable/inter'
import '@fontsource-variable/fraunces'
import '@fontsource/amiri-quran/400.css'
// Amiri Quran has no glyph for U+065E (1,807 uses in the text); words containing it are set in Amiri, same family. See tests/fonts.test.ts.
import '@fontsource/amiri/arabic-400.css'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
