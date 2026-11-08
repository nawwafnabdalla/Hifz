import { useNavigate } from 'react-router-dom'
import { useEffect, useMemo } from 'react'
import { useApp } from '@/app/store'
import { LearnFlow } from './Learn'
import { RecallCard } from '@/components/RecallCard'
import { JunctionDrill } from '@/components/JunctionDrill'
import { Icon } from '@/components/Icon'
import { KIND, rangeTitle } from '@/lib/format'
import { minutesLabel } from '@/components/ui'
import { dueLabel, summariseSession, type Result } from '@/lib/sessionSummary'
import { isOpen, junctionNeeded, neededRange } from '@/lib/engine/evidence'
import { ayahKey, type Range } from '@/lib/engine/types'
import { computePlan } from '@/lib/plan'

const RESULT: Record<Result, { label: string; cls: string }> = {
  smooth: { label: 'Smooth', cls: 'bg-accent-soft text-accent-strong' },
  learned: { label: 'Learned', cls: 'bg-accent-soft text-accent-strong' },
  mixed: { label: 'Some hesitation', cls: 'bg-amber-soft text-ink' },
  difficult: { label: 'Needs another go', cls: 'bg-clay-soft text-clay' },
  practised: { label: 'Practised', cls: 'bg-surface-2 text-ink-2' },
  skipped: { label: 'Skipped', cls: 'bg-surface-2 text-muted' },
  covered: { label: 'Already covered', cls: 'bg-surface-2 text-ink-2' },
}

export function SessionPage() {
  const nav = useNavigate()
  const s = useApp((x) => x.session)
  const snap = useApp((x) => x.snap)
  const derived = useApp((x) => x.derived)
  const complete = useApp((x) => x.completeItem)
  const skip = useApp((x) => x.skipItem)
  const end = useApp((x) => x.endSession)

  useEffect(() => { if (!s) nav('/', { replace: true }) }, [s, nav])
  const finished = !!s && !s.queue[s.index]
  const summary = useMemo(() => (s && finished ? summariseSession({ sessionId: s.id, queue: s.queue, completed: s.completed, skipped: s.skipped, covered: s.covered, startedAt: s.startedAt, reviews: snap.reviews, flows: snap.flows, parts: snap.parts, derived, now: Date.now() }) : null), [s, finished, snap.reviews, snap.flows, snap.parts, derived])
  // A plan is a snapshot. When an item comes up, it is checked once against everything recorded since (in any session, goal or screen): ayahs the learner has
  // already shown are not asked for again, and an item that is entirely covered is passed over. Checked once per item, so evidence recorded WHILE working on it
  // never changes what is on screen.
  const current = s?.queue[s.index]
  const reconciled = useMemo<{ range: Range | null; covered: number[] } | null>(() => {
    if (!current) return null
    const now = Date.now()
    if (current.drill === 'junction') return junctionNeeded(current.range, derived, now) ? { range: current.range, covered: [] } : { range: null, covered: [current.range.start] }
    if (current.kind === 'new') {
      const open = Array.from({ length: current.range.end - current.range.start + 1 }, (_, i) => current.range.start + i)
        .some((a) => isOpen(derived.memory.get(ayahKey(current.range.surah, a)), derived.flow.get(ayahKey(current.range.surah, a)), now))
      return open ? { range: current.range, covered: [] } : { range: null, covered: [] }
    }
    const inTarget = (su: number, a: number) => snap.targets.some((t) => t.status === 'active' && t.range.surah === su && a >= t.range.start && a <= t.range.end)
    const n = neededRange(current.range, derived, now, inTarget)
    return { range: n.range, covered: n.covered }
  }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (current && reconciled && reconciled.range === null) { useApp.getState().say('Already covered, so it isn’t asked again'); complete(current.id, { covered: true }) }
  }, [current?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const tomorrow = useMemo(() => (finished ? computePlan(snap, derived, Date.now() + 20 * 3600 * 1000) : null), [finished, snap, derived])
  if (!s) return null
  const item = s.queue[s.index]
  const total = s.queue.length

  if (!item && summary) {
    const now = Date.now()
    const nextSoon = summary.items.filter((i) => i.nextReviewAt !== null).sort((a, b) => a.nextReviewAt! - b.nextReviewAt!)
    return (
      <div className="mx-auto max-w-[680px] px-4 pt-10 pb-8" data-testid="session-summary">
        <div className="card enter p-6">
          <h1 className="font-display text-3xl">Session complete</h1>
          <p className="mt-1 text-ink-2">{s.completed.length} of {total} items in about {minutesLabel(summary.minutes)}{s.skipped.length ? `; ${s.skipped.length} skipped` : ''}.</p>

          <h2 className="eyebrow mt-6">What you practised</h2>
          <ul className="mt-2 space-y-2" data-testid="summary-items">
            {summary.items.map((i) => (
              <li key={i.id} className="card-flat p-3 text-sm">
                <div className="flex items-center justify-between gap-2"><span className="font-semibold">{i.drill ? `${rangeTitle(i.range)} (transition)` : rangeTitle(i.range)}</span><span className={`rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold ${RESULT[i.result].cls}`}>{RESULT[i.result].label}</span></div>
                <div className="mt-0.5 text-xs text-muted">{KIND[i.kind].label} · {i.note}</div>
              </li>
            ))}
          </ul>

          {summary.needsAttention.length > 0 && (
            <div className="mt-5 rounded-2xl border border-clay/30 bg-clay-soft/60 p-4" data-testid="summary-attention">
              <h2 className="eyebrow !text-clay">Needs attention</h2>
              <ul className="mt-2 space-y-1 text-sm text-ink">{summary.needsAttention.map((n) => <li key={n.text}>{n.text}</li>)}</ul>
              <p className="mt-2 text-xs text-ink-2">These are scheduled to come back. Nothing needs doing right now.</p>
            </div>
          )}

          <h2 className="eyebrow mt-6">When it comes back</h2>
          {nextSoon.length ? (
            <ul className="mt-2 space-y-1 text-sm" data-testid="summary-next">{nextSoon.slice(0, 6).map((i) => <li key={i.id} className="flex justify-between"><span>{rangeTitle(i.range)}</span><span className="text-ink-2">{dueLabel(i.nextReviewAt!, now)}</span></li>)}</ul>
          ) : <p className="mt-2 text-sm text-ink-2">Nothing newly scheduled from this session.</p>}

          {tomorrow && tomorrow.items.length > 0 && (
            <p className="mt-5 rounded-xl bg-bg p-3 text-sm text-ink-2" data-testid="summary-tomorrow">Tomorrow starts with <b className="text-ink">{tomorrow.items[0]!.title}</b>
              {tomorrow.items.length > 1 ? ` and ${tomorrow.items.length - 1} more` : ''} (about {minutesLabel(tomorrow.plannedMinutes)}), if you study at a similar time.</p>
          )}
          <p className="mt-4 text-xs text-muted">Everything is saved. “Recalled on your own” reflects what you reported; the app can’t hear or check your recitation.</p>
          <button className="btn btn-primary btn-lg mt-5 w-full" onClick={async () => { await end(); nav('/') }} data-testid="session-finish">Back to Today</button>
        </div>
      </div>
    )
  }
  if (!item || !reconciled || reconciled.range === null) return null
  const range = reconciled.range

  const k = KIND[item.kind]
  return (
    <div className="mx-auto max-w-[680px]">
      <div className="safe-top sticky top-0 z-30 border-b border-line bg-bg/90 px-4 pb-3 pt-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <button className="btn btn-ghost btn-sm" onClick={async () => { await end(); nav('/') }} aria-label="End session"><Icon name="x" size={18} /></button>
          <div className="min-w-0 flex-1 text-center"><span className={`rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider ${k.cls}`}>{item.drill ? 'Transition' : k.label}</span><div className="mt-0.5 truncate text-xs text-muted tabular">{s.index + 1} of {total}</div></div>
          <button className="btn btn-ghost btn-sm" onClick={() => skip(item.id)} data-testid="skip-item">Skip</button>
        </div>
        <div className="mt-2 flex gap-1" aria-hidden="true">{s.queue.map((q, i) => <div key={q.id} className={`h-1 flex-1 rounded-full ${s.completed.includes(q.id) ? 'bg-accent' : i === s.index ? 'bg-accent/50' : 'bg-line'}`} />)}</div>
        <details className="mt-2 text-sm"><summary className="cursor-pointer select-none text-xs text-muted">Why this, today</summary><ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">{item.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></details>
      </div>
      <div key={item.id} className="pt-2">
        {reconciled.covered.length > 0 && !item.drill && <p className="px-4 pb-1 text-center text-xs text-muted" data-testid="covered-note">Ayah{reconciled.covered.length > 1 ? 's' : ''} {reconciled.covered.join(', ')} already covered.</p>}
        {item.drill === 'junction'
          ? <JunctionDrill range={range} onDone={() => complete(item.id)} />
          : item.kind === 'new'
            ? <LearnFlow embedded range={range} context="new" onExit={() => skip(item.id)} onDone={() => complete(item.id)} />
            : <RecallCard range={range} context={item.kind} title={rangeTitle(range)} onDone={() => complete(item.id)} />}
      </div>
    </div>
  )
}
