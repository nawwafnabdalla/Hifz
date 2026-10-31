import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { STAGE_LABEL, type Stage } from '@/lib/engine/derive'

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  // Rendered into <body>: a sheet is position:fixed, and inside any animated or transformed ancestor a fixed
  // element is positioned relative to that ancestor instead of the screen (which put it off the top of the viewport).
  return createPortal(
    <>
      <div className="sheet-back" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        {title && <h2 className="font-display mb-3 text-xl">{title}</h2>}
        {children}
      </div>
    </>,
    document.body,
  )
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div role="status" className="pop fixed left-1/2 z-[80] -translate-x-1/2 rounded-2xl bg-ink px-4 py-2.5 text-sm font-medium text-bg shadow-lg" style={{ bottom: 'calc(92px + env(safe-area-inset-bottom))' }}>
      {message}
    </div>
  )
}

export function Header({ title, subtitle, back, right, eyebrow }: { title: ReactNode; subtitle?: ReactNode; back?: () => void; right?: ReactNode; eyebrow?: string }) {
  return (
    <header className="safe-top px-5 pt-5 pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {back && (
            <button onClick={back} className="btn btn-ghost btn-sm -ml-3 mb-1" aria-label="Back"><Icon name="left" size={18} /> Back</button>
          )}
          {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
          <h1 className="font-display text-[1.9rem] leading-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-[0.95rem] text-ink-2">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  )
}

export const STAGE_STYLE: Record<Stage, { bg: string; ring?: string; label: string }> = {
  not_started: { bg: 'color-mix(in oklab, var(--line) 70%, transparent)', label: STAGE_LABEL.not_started },
  learning: { bg: 'var(--amber)', label: STAGE_LABEL.learning },
  claimed: { bg: 'transparent', ring: 'var(--accent)', label: STAGE_LABEL.claimed },
  reviewing: { bg: 'var(--accent)', label: STAGE_LABEL.reviewing },
  needs_repair: { bg: 'var(--clay)', label: STAGE_LABEL.needs_repair },
  strong: { bg: 'var(--accent-strong)', label: STAGE_LABEL.strong },
}

/** Colour for one ayah cell. Opacity of reviewing/strong tracks estimated retrievability. */
export function cellStyle(stage: Stage, r: number): React.CSSProperties {
  const s = STAGE_STYLE[stage]
  if (stage === 'claimed') return { background: 'transparent', boxShadow: `inset 0 0 0 1.5px ${s.ring}`, opacity: 0.75 }
  if (stage === 'reviewing' || stage === 'strong') return { background: s.bg, opacity: 0.3 + 0.7 * Math.max(0, Math.min(1, r)) }
  return { background: s.bg }
}

export function Legend({ stages = ['not_started', 'learning', 'claimed', 'reviewing', 'strong', 'needs_repair'] as Stage[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
      {stages.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-[4px]" style={cellStyle(s, 1)} />
          {s === 'claimed' ? 'Marked known (unchecked)' : STAGE_STYLE[s].label}
        </li>
      ))}
    </ul>
  )
}

export function Ring({ value, size = 64, stroke = 6, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} style={{ transition: 'stroke-dasharray 500ms ease' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card-flat p-4">
      <div className="eyebrow">{label}</div>
      <div className="font-display tabular mt-1 text-[1.9rem] leading-none">{value}</div>
      {hint && <div className="mt-1.5 text-xs text-muted">{hint}</div>}
    </div>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card-flat mx-5 p-6 text-center">
      <h3 className="font-display text-xl">{title}</h3>
      {children && <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export const minutesLabel = (m: number) => (m < 1 ? '<1 min' : `${Math.round(m)} min`)
