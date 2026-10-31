import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Icon } from './Icon'
import { Toast } from './ui'
import { useApp } from '@/app/store'

const TABS = [
  { to: '/', label: 'Today', icon: 'today', end: true },
  { to: '/quran', label: 'Qur’an', icon: 'quran' },
  { to: '/progress', label: 'Progress', icon: 'chart' },
  { to: '/settings', label: 'Settings', icon: 'sliders' },
]
const FOCUS = ['/learn', '/review', '/session']

export function Layout() {
  const { pathname } = useLocation()
  const focus = FOCUS.some((p) => pathname.startsWith(p))
  const toast = useApp((s) => s.toast)
  const sync = useApp((s) => s.sync)
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[720px]">
      <main className={focus ? 'pb-10' : 'pb-[calc(110px+env(safe-area-inset-bottom))]'}>
        <Outlet />
      </main>
      <Toast message={toast} />
      {!focus && (
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/85 backdrop-blur-xl" aria-label="Primary">
          <ul className="mx-auto flex max-w-[720px] justify-around px-2 pt-1.5" style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}>
            {TABS.map((t) => (
              <li key={t.to} className="flex-1">
                <NavLink to={t.to} end={t.end} className={({ isActive }) => `relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-2xl text-[0.7rem] font-semibold tracking-wide transition-colors ${isActive ? 'text-accent' : 'text-muted hover:text-ink-2'}`}>
                  {({ isActive }) => (
                    <>
                      <span className={`grid h-7 w-12 place-items-center rounded-full transition-all ${isActive ? 'bg-accent-soft' : ''}`}><Icon name={t.icon} size={21} /></span>
                      {t.label}
                      {t.to === '/settings' && sync.pending > 0 && <span className="absolute right-[calc(50%-22px)] top-1 h-2 w-2 rounded-full bg-amber" aria-label="Unsynced changes" />}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
