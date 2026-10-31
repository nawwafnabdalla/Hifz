import '@fontsource-variable/inter'
import '@fontsource-variable/fraunces'
import '@fontsource/amiri-quran/400.css'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
