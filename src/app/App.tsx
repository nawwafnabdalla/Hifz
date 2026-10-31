import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { Layout } from '@/components/Layout'
import { useApp } from './store'
import { offlineAudio } from '@/lib/audio/offline'
import { Khatam } from '@/components/Icon'
import { TodayPage } from '@/pages/Today'
import { QuranPage } from '@/pages/Quran'
import { SurahPage } from '@/pages/Surah'

const LearnPage = lazy(() => import('@/pages/Learn').then((m) => ({ default: m.LearnPage })))
const ReviewPage = lazy(() => import('@/pages/Review').then((m) => ({ default: m.ReviewPage })))
const SessionPage = lazy(() => import('@/pages/Session').then((m) => ({ default: m.SessionPage })))
const ProgressPage = lazy(() => import('@/pages/Progress').then((m) => ({ default: m.ProgressPage })))
const SettingsPage = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.SettingsPage })))

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center text-brass" role="status" aria-label="Loading">
      <Khatam size={44} className="animate-pulse" />
    </div>
  )
}

export function App() {
  const ready = useApp((s) => s.ready)
  const init = useApp((s) => s.init)
  useEffect(() => { void init() }, [init])
  useEffect(() => {   // what is really saved on this device, re-read whenever the app returns to the foreground
    const wake = () => { void offlineAudio.refresh().then(() => offlineAudio.resumePending()) }   // an interrupted save simply continues
    wake()
    const v = () => { if (document.visibilityState === 'visible') wake() }
    document.addEventListener('visibilitychange', v)
    window.addEventListener('online', wake)
    return () => { document.removeEventListener('visibilitychange', v); window.removeEventListener('online', wake) }
  }, [])
  useEffect(() => { try { registerSW({ immediate: true }) } catch { /* dev / unsupported */ } }, [])
  if (!ready) return <Splash />
  return (
    <BrowserRouter>
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<TodayPage />} />
            <Route path="quran" element={<QuranPage />} />
            <Route path="quran/:surah" element={<SurahPage />} />
            <Route path="learn/:surah/:start/:end" element={<LearnPage />} />
            <Route path="review/:surah/:start/:end" element={<ReviewPage />} />
            <Route path="session" element={<SessionPage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<TodayPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
