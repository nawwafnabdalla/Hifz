import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useApp } from '@/app/store'
import { LearnFlow } from './Learn'
import { RecallCard } from '@/components/RecallCard'
import { Icon } from '@/components/Icon'
import { KIND, rangeTitle } from '@/lib/format'
import { minutesLabel } from '@/components/ui'

export function SessionPage() {
  const nav = useNavigate()
  const s = useApp((x) => x.session)
  const complete = useApp((x) => x.completeItem)
  const skip = useApp((x) => x.skipItem)
  const end = useApp((x) => x.endSession)

  useEffect(() => { if (!s) nav('/', { replace: true }) }, [s, nav])
  if (!s) return null
  const item = s.queue[s.index]
  const total = s.queue.length

  if (!item) {
    const minutes = Math.max(1, Math.round((Date.now() - s.startedAt) / 60000))
    return (
      <div className="mx-auto max-w-[680px] px-4 pt-10" data-testid="session-summary">
        <div className="card enter p-7 text-center">
          <h1 className="font-display text-3xl">Session complete</h1>
          <p className="mt-2 text-ink-2">{s.completed.length} of {total} items done in about {minutesLabel(minutes)}.{s.skipped.length ? ` ${s.skipped.length} skipped; they stay in your queue.` : ''}</p>
          <ul className="mt-5 space-y-2 text-left">
            {s.queue.map((q) => (
              <li key={q.id} className="card-flat flex items-center gap-3 p-3 text-sm"><Icon name={s.completed.includes(q.id) ? 'check' : 'right'} className={s.completed.includes(q.id) ? 'text-accent' : 'text-muted'} size={18} /><span className="flex-1 font-medium">{rangeTitle(q.range)}</span><span className="text-xs text-muted">{KIND[q.kind].label}</span></li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">Whatever you did today is saved. Tomorrow’s plan will take it into account.</p>
          <button className="btn btn-primary btn-lg mt-5 w-full" onClick={async () => { await end(); nav('/') }} data-testid="session-finish">Back to Today</button>
        </div>
      </div>
    )
  }

  const k = KIND[item.kind]
  return (
    <div className="mx-auto max-w-[680px]">
      <div className="safe-top sticky top-0 z-30 border-b border-line bg-bg/90 px-4 pb-3 pt-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <button className="btn btn-ghost btn-sm" onClick={async () => { await end(); nav('/') }} aria-label="End session"><Icon name="x" size={18} /></button>
          <div className="min-w-0 flex-1 text-center"><span className={`rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider ${k.cls}`}>{k.label}</span><div className="mt-0.5 truncate text-xs text-muted tabular">{s.index + 1} of {total}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={() => skip(item.id)} data-testid="skip-item">Skip</button>
        </div>
        <div className="mt-2 flex gap-1" aria-hidden="true">{s.queue.map((q, i) => <div key={q.id} className={`h-1 flex-1 rounded-full ${s.completed.includes(q.id) ? 'bg-accent' : i === s.index ? 'bg-accent/50' : 'bg-line'}`} />)}</div>
        <details className="mt-2 text-sm"><summary className="cursor-pointer select-none text-xs text-muted">Why this, today</summary><ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">{item.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></details>
      </div>
      <div key={item.id} className="pt-2">
        {item.kind === 'new'
          ? <LearnFlow embedded range={item.range} context="new" onExit={() => skip(item.id)} onDone={() => complete(item.id)} />
          : <RecallCard range={item.range} context={item.kind} title={rangeTitle(item.range)} onDone={() => complete(item.id)} />}
      </div>
    </div>
  )
}
