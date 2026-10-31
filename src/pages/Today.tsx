import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '@/app/store'
import { Header, Sheet, minutesLabel } from '@/components/ui'
import { Icon, Khatam } from '@/components/Icon'
import { KnownSheet } from '@/components/KnownSheet'
import { GoalSheet } from '@/components/GoalSheet'
import { KIND, dateLabel, rangeTitle, rangePath } from '@/lib/format'
import type { PlanItem } from '@/lib/engine/planner'
import { surahInfo } from '@/lib/quran/data'

const PRESETS = [10, 15, 20, 30, 45, 60]

function ItemCard({ item, open, onToggle, onStart }: { item: PlanItem; open: boolean; onToggle: () => void; onStart: () => void }) {
  const k = KIND[item.kind]
  const sInfo = surahInfo(item.range.surah)
  return (
    <li className="card enter overflow-hidden" data-testid="plan-item" data-kind={item.kind}>
      <div className="flex items-center gap-3 p-4">
        <button className="min-w-0 flex-1 text-left" onClick={onToggle} aria-expanded={open}>
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wider ${k.cls}`}>{k.label}</span>
          <span className="font-display mt-1.5 block text-[1.25rem] leading-snug">{rangeTitle(item.range)}</span>
          <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <span lang="ar" dir="rtl" className="font-[family-name:var(--font-arabic)] text-sm text-ink-2">{sInfo.ar}</span>
            <span>· {item.ayahs} ayah{item.ayahs > 1 ? 's' : ''}</span><span>· {item.estMinutes < 1 ? '' : '~'}{minutesLabel(item.estMinutes)}</span>
          </span>
        </button>
        <button className="btn btn-quiet btn-sm" onClick={onStart} aria-label={`Start ${rangeTitle(item.range)} now`}><Icon name="play" size={14} /></button>
      </div>
      {open && (
        <div className="border-t border-line bg-bg/60 px-4 py-3 text-sm" data-testid="plan-reasons">
          <div className="eyebrow mb-1.5">Why this, today</div>
          <ul className="space-y-1.5 text-ink-2">{item.reasons.map((r, i) => <li key={i} className="flex gap-2"><span className="mt-2 h-1 w-1 flex-none rounded-full bg-brass" />{r}</li>)}</ul>
        </div>
      )}
    </li>
  )
}

export function TodayPage() {
  const nav = useNavigate()
  const { snap, derived, now, session, patchSettings, startSession } = useApp()
  const [open, setOpen] = useState<string | null>(null)
  const [known, setKnown] = useState(false)
  const [goal, setGoal] = useState(false)
  const [custom, setCustom] = useState(false)
  const [how, setHow] = useState(false)
  const [cm, setCm] = useState(String(snap.settings.minutes))
  const planFn = useApp((s) => s.plan)
  const plan = useMemo(() => planFn(), [planFn, snap, derived, now])  // eslint-disable-line react-hooks/exhaustive-deps
  const targets = snap.targets.filter((t) => t.status === 'active')
  const minutes = snap.settings.minutes
  const isCustom = !PRESETS.includes(minutes)

  async function begin() {
    const s = await startSession(plan)
    if (s) nav('/session')
  }

  return (
    <div>
      <Header eyebrow={dateLabel(now)} title="Today’s hifz" subtitle={plan.mode === 'empty' ? 'Let’s begin with what you already carry.' : plan.headline} />

      {session && (
        <div className="enter mx-5 mb-4 flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-4">
          <div><div className="font-semibold text-accent-strong">A session is in progress</div><div className="text-sm text-ink-2">{session.completed.length + session.skipped.length} of {session.queue.length} done</div></div>
          <Link to="/session" className="btn btn-primary btn-sm">Resume</Link>
        </div>
      )}

      <section className="px-5">
        <div className="eyebrow mb-2">Time available</div>
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="group" aria-label="Session length">
          {PRESETS.map((m) => <button key={m} className="chip tabular whitespace-nowrap" aria-pressed={minutes === m} onClick={() => patchSettings({ minutes: m })}>{m} min</button>)}
          <button className="chip whitespace-nowrap" aria-pressed={isCustom} onClick={() => { setCm(String(minutes)); setCustom(true) }}>{isCustom ? `${minutes} min` : 'Custom'}</button>
        </div>
      </section>

      {plan.mode === 'empty' && (
        <section className="enter-2 mt-6 space-y-3 px-5" data-testid="onboarding">
          <div className="card p-6 text-center">
            <Khatam size={34} className="mx-auto text-brass" />
            <h2 className="font-display mt-3 text-2xl">Welcome</h2>
            <p className="mx-auto mt-2 max-w-md text-[0.95rem] text-ink-2">Hifz OS learns from what you actually recite. Tell it what you already know, choose something to learn, and each day it will plan what to revise, repair and learn, and explain why.</p>
          </div>
          <button className="card flex w-full items-center gap-4 p-4 text-left" onClick={() => setKnown(true)} data-testid="open-known"><span className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-accent"><Icon name="check" /></span><span className="flex-1"><span className="block font-semibold">Mark what I already know</span><span className="text-sm text-ink-2">Surahs or passages you have memorised</span></span><Icon name="right" className="text-muted" /></button>
          <button className="card flex w-full items-center gap-4 p-4 text-left" onClick={() => setGoal(true)} data-testid="open-goal"><span className="grid h-11 w-11 place-items-center rounded-full bg-brass-soft text-brass"><Icon name="target" /></span><span className="flex-1"><span className="block font-semibold">Choose something to memorise</span><span className="text-sm text-ink-2">A surah or passage as your goal</span></span><Icon name="right" className="text-muted" /></button>
          <Link to="/quran" className="card flex w-full items-center gap-4 p-4 text-left"><span className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-ink-2"><Icon name="headphones" /></span><span className="flex-1"><span className="block font-semibold">Just read and listen</span><span className="text-sm text-ink-2">Browse the Qur’an and hear recitation</span></span><Icon name="right" className="text-muted" /></Link>
        </section>
      )}

      {plan.mode !== 'empty' && (
        <section className="mt-5 space-y-3 px-5">
          {plan.notes.map((n, i) => <div key={i} className="enter rounded-2xl border border-brass/30 bg-brass-soft/60 p-4 text-sm text-ink" data-testid="plan-note">{n}</div>)}

          {plan.items.length > 0 ? (
            <>
              <div className="flex items-baseline justify-between"><div className="eyebrow">{plan.items.length} item{plan.items.length > 1 ? 's' : ''}</div><div className="text-sm text-muted tabular">about {minutesLabel(plan.plannedMinutes)} of {plan.budgetMinutes}</div></div>
              <ul className="space-y-3" data-testid="plan-list">
                {plan.items.map((it) => (
                  <ItemCard key={it.id} item={it} open={open === it.id} onToggle={() => setOpen(open === it.id ? null : it.id)}
                    onStart={() => nav(it.kind === 'new' ? rangePath('learn', it.range) : rangePath('review', it.range, `?ctx=${it.kind}`))} />
                ))}
              </ul>
              <button className="btn btn-primary btn-lg enter-3 !mt-5 w-full" onClick={begin} data-testid="start-session"><Icon name="play" size={16} /> Begin session</button>
            </>
          ) : (
            <div className="card p-6 text-center" data-testid="nothing-due">
              <h2 className="font-display text-xl">Nothing is due right now</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">Your material is on schedule. {plan.upcoming.next24h > 0 ? `${plan.upcoming.next24h} ayah${plan.upcoming.next24h > 1 ? 's' : ''} will fall due within a day.` : 'Come back tomorrow, or practise anything below.'}</p>
              {targets.length === 0 && <button className="btn btn-quiet mt-4" onClick={() => setGoal(true)}>Choose a new goal</button>}
            </div>
          )}

          {(plan.deferred.items > 0 || plan.upcoming.next7d > 0) && (
            <p className="text-center text-xs text-muted">{plan.deferred.ayahs > 0 ? `${plan.deferred.ayahs} more ${plan.deferred.ayahs === 1 ? 'ayah is' : 'ayahs are'} due but not in today’s plan. ` : ''}{plan.upcoming.next7d} {plan.upcoming.next7d === 1 ? 'ayah falls' : 'ayahs fall'} due in the next 7 days.</p>
          )}
        </section>
      )}

      {plan.mode !== 'empty' && (
        <section className="mt-8 px-5">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-display text-xl">Goals</h2><button className="btn btn-ghost btn-sm" onClick={() => setGoal(true)}><Icon name="plus" size={16} />Add</button></div>
          {targets.length ? (
            <ul className="space-y-2">
              {targets.map((t) => {
                let have = 0
                const n = t.range.end - t.range.start + 1
                for (let a = t.range.start; a <= t.range.end; a++) { const m = derived.memory.get(`${t.range.surah}:${a}`); if (m && m.firstDemonstratedAt) have++ }
                return (
                  <li key={t.id} className="card-flat flex items-center gap-3 p-3.5">
                    <div className="min-w-0 flex-1"><div className="truncate font-semibold">{t.label ?? rangeTitle(t.range)}</div><div className="text-xs text-muted">{rangeTitle(t.range)} · {have} of {n} recalled</div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(have / n) * 100}%` }} /></div></div>
                    <button className="btn btn-ghost btn-sm" onClick={() => void useApp.getState().setTargetStatus(t.id, have === n ? 'done' : 'paused')}>{have === n ? 'Done' : 'Pause'}</button>
                  </li>
                )
              })}
            </ul>
          ) : <p className="text-sm text-muted">No active goal. Without one, today’s plan will only revise and check what you know.</p>}
          <button className="btn btn-quiet mt-3 w-full" onClick={() => setKnown(true)}>Mark more as known</button>
        </section>
      )}

      <section className="mt-8 px-5 pb-4">
        <button className="flex w-full items-center gap-2 text-left text-sm text-ink-2" onClick={() => setHow(true)}><Icon name="info" size={16} /> How today’s plan is chosen</button>
      </section>

      <KnownSheet open={known} onClose={() => setKnown(false)} />
      <GoalSheet open={goal} onClose={() => setGoal(false)} />
      <Sheet open={custom} onClose={() => setCustom(false)} title="Custom time">
        <label className="block text-sm"><span className="eyebrow">Minutes (5–240)</span><input type="number" inputMode="numeric" min={5} max={240} className="mt-1 h-12 w-full rounded-xl border border-line bg-bg px-3 text-lg" value={cm} onChange={(e) => setCm(e.target.value)} /></label>
        <button className="btn btn-primary btn-lg mt-4 w-full" disabled={!(+cm >= 5 && +cm <= 240)} onClick={() => { void patchSettings({ minutes: Math.round(+cm) }); setCustom(false) }}>Use {cm || '…'} minutes</button>
      </Sheet>
      <Sheet open={how} onClose={() => setHow(false)} title="How today’s plan is chosen">
        <div className="space-y-3 text-sm text-ink-2">
          <p>Every ayah has an estimated chance you could recite it right now, based <b>only on your own recorded recall</b> and the time since. When that estimate drops to about 90%, it is due.</p>
          <p>Due material is ranked by risk. Material you needed help with comes first, then recent material, then older material. New memorisation takes a share of your time that <b>shrinks when revision is heavy</b>. After a long gap, the backlog is spread over several days, highest risk first. Nothing is reset.</p>
          <p>Reciting a long passage perfectly counts as <b>weaker evidence per ayah</b> than reciting one ayah alone, and flow (how smoothly it comes off your tongue) never changes the retention estimate.</p>
          <p className="rounded-xl bg-brass-soft/60 p-3 text-ink">{plan.modelNote}</p>
        </div>
      </Sheet>
    </div>
  )
}
