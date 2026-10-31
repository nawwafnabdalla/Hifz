import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '@/app/store'
import { Header, Sheet, minutesLabel } from '@/components/ui'
import { Icon } from '@/components/Icon'
import { KnownSheet } from '@/components/KnownSheet'
import { GoalSheet } from '@/components/GoalSheet'
import { GoalAudioLine, GoalFinishSheet, useOffline } from '@/components/OfflineAudio'
import { RECITERS } from '@/lib/audio/sources'
import type { LearningTarget } from '@/lib/engine/types'
import { KIND, dateLabel, rangeTitle, rangePath } from '@/lib/format'
import type { PlanItem } from '@/lib/engine/planner'
import { surahInfo } from '@/lib/quran/data'

const PRESETS = [10, 15, 20, 30, 45, 60]

type Row = { type: 'item'; item: PlanItem } | { type: 'group'; kind: PlanItem['kind']; items: PlanItem[] }
/** Four or more consecutive items of the same kind collapse into one row, so the day does not look like a to-do list. */
export function groupRows(items: PlanItem[]): Row[] {
  const rows: Row[] = []
  let i = 0
  while (i < items.length) {
    let j = i
    while (j + 1 < items.length && items[j + 1]!.kind === items[i]!.kind && !items[j + 1]!.drill === !items[i]!.drill) j++
    const run = items.slice(i, j + 1)
    if (run.length >= 4) rows.push({ type: 'group', kind: items[i]!.kind, items: run })
    else run.forEach((item) => rows.push({ type: 'item', item }))
    i = j + 1
  }
  return rows
}

function ItemCard({ item, open, onToggle, onStart }: { item: PlanItem; open: boolean; onToggle: () => void; onStart: () => void }) {
  const k = KIND[item.kind]
  const sInfo = surahInfo(item.range.surah)
  return (
    <li className="card enter overflow-hidden" data-testid="plan-item" data-kind={item.kind}>
      <div className="flex items-center gap-3 p-4">
        <button className="min-w-0 flex-1 text-left" onClick={onToggle} aria-expanded={open}>
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wider ${k.cls}`}>{item.drill ? 'Transition drill' : k.label}</span>
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
  const [groupOpen, setGroupOpen] = useState<string | null>(null)
  const [known, setKnown] = useState(false)
  const [goal, setGoal] = useState(false)
  const [editGoal, setEditGoal] = useState<LearningTarget | null>(null)
  const [finishGoal, setFinishGoal] = useState<LearningTarget | null>(null)
  const offline = useOffline()
  const [timeOpen, setTimeOpen] = useState(false)
  const [custom, setCustom] = useState(false)
  const [how, setHow] = useState(false)
  const [cm, setCm] = useState(String(snap.settings.minutes))
  const planFn = useApp((s) => s.plan)
  const plan = useMemo(() => planFn(), [planFn, snap, derived, now])  // eslint-disable-line react-hooks/exhaustive-deps
  const targets = snap.targets.filter((t) => t.status === 'active')
  const minutes = snap.settings.minutes
  const isCustom = !PRESETS.includes(minutes)

  async function begin() {
    if (session) { nav('/session'); return }
    const s = await startSession(plan)
    if (s) nav('/session')
  }

  return (
    <div>
      <Header eyebrow={dateLabel(now)} title="Today’s hifz" subtitle={plan.mode === 'empty' ? 'Let’s begin with what you already carry.' : /^A \d+-minute session$/.test(plan.headline) ? undefined : plan.headline} />

      {session && (
        <div className="enter mx-5 mb-4 flex items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent-soft p-4">
          <div><div className="font-semibold text-accent-strong">A session is in progress</div><div className="text-sm text-ink-2">{session.completed.length + session.skipped.length} of {session.queue.length} done</div></div>
          <Link to="/session" className="btn btn-primary btn-sm">Resume</Link>
        </div>
      )}

      {plan.mode !== 'empty' && <section className="px-5">
        <button className="chip tabular" onClick={() => setTimeOpen(true)} data-testid="time-pill" aria-label={`Time today: ${minutes} minutes. Change`}><Icon name="clock" size={14} />{minutes} min today<Icon name="down" size={13} className="text-muted" /></button>
      </section>}

      {plan.mode === 'empty' && (
        <section className="enter-2 mt-6 space-y-3 px-5" data-testid="onboarding">
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
              <button className="btn btn-primary btn-lg enter-3 w-full" onClick={begin} data-testid="start-session"><Icon name="play" size={16} /> {session ? 'Continue session' : 'Begin session'}</button>
              <div className="flex items-baseline justify-between"><div className="eyebrow">{plan.items.length} item{plan.items.length > 1 ? 's' : ''}</div><div className="text-sm text-muted tabular">about {minutesLabel(plan.plannedMinutes)} of {plan.budgetMinutes}</div></div>
              <ul className="space-y-3" data-testid="plan-list">
                {groupRows(plan.items).map((row) => {
                  const start = (it: PlanItem) => nav(it.kind === 'new' ? rangePath('learn', it.range) : rangePath('review', it.range, `?ctx=${it.kind}${it.drill ? '&mode=junction' : ''}`))
                  if (row.type === 'item') return <ItemCard key={row.item.id} item={row.item} open={open === row.item.id} onToggle={() => setOpen(open === row.item.id ? null : row.item.id)} onStart={() => start(row.item)} />
                  const gid = `group:${row.kind}`
                  const mins = row.items.reduce((n, i) => n + i.estMinutes, 0)
                  const k = KIND[row.kind]
                  return (
                    <li key={gid} className="card enter overflow-hidden" data-testid="plan-group" data-kind={row.kind}>
                      <button className="flex w-full items-center justify-between gap-3 p-4 text-left" onClick={() => setGroupOpen(groupOpen === gid ? null : gid)} aria-expanded={groupOpen === gid}>
                        <span><span className={`inline-block rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wider ${k.cls}`}>{k.label}</span>
                          <span className="font-display mt-1.5 block text-[1.2rem] leading-snug">{row.items.length} passages</span>
                          <span className="text-xs text-muted">{row.items.reduce((n, i) => n + i.ayahs, 0)} ayahs · ~{minutesLabel(mins)} · all in this session</span></span>
                        <Icon name={groupOpen === gid ? 'up' : 'down'} className="text-muted" />
                      </button>
                      {groupOpen === gid && <ul className="space-y-2 border-t border-line bg-bg/60 p-3">{row.items.map((it) => <ItemCard key={it.id} item={it} open={open === it.id} onToggle={() => setOpen(open === it.id ? null : it.id)} onStart={() => start(it)} />)}</ul>}
                    </li>
                  )
                })}
              </ul>
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
                  <li key={t.id} className="card-flat flex items-center gap-3 p-3.5" data-testid="goal-row">
                    <div className="min-w-0 flex-1">
                      <button className="block max-w-full truncate text-left font-semibold" onClick={() => setEditGoal(t)} data-testid="goal-edit" aria-label={`Change goal ${t.label ?? rangeTitle(t.range)}`}>{t.label ?? rangeTitle(t.range)}</button>
                      <div className="text-xs text-muted">{t.label ? `${rangeTitle(t.range)} · ` : ''}{have} of {n} recalled</div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(have / n) * 100}%` }} /></div>
                      {offline.supported && <GoalAudioLine goalId={t.id} range={t.range} />}
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      if (have !== n) { void useApp.getState().setTargetStatus(t.id, 'paused'); return }
                      const hasAudio = RECITERS.some((r) => offline.keysIn(r.id, t.range.surah, t.range.start, t.range.end).length > 0)
                      if (hasAudio) setFinishGoal(t); else void useApp.getState().setTargetStatus(t.id, 'done')
                    }}>{have === n ? 'Done' : 'Pause'}</button>
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
      <GoalSheet open={editGoal !== null} onClose={() => setEditGoal(null)} target={editGoal ?? undefined} />
      {finishGoal && <GoalFinishSheet open onClose={() => setFinishGoal(null)} goalId={finishGoal.id} range={finishGoal.range} label={finishGoal.label ?? rangeTitle(finishGoal.range)} onFinish={() => void useApp.getState().setTargetStatus(finishGoal.id, 'done')} />}
      <Sheet open={timeOpen} onClose={() => setTimeOpen(false)} title="Time today">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Session length">
          {PRESETS.map((m) => <button key={m} className="chip tabular" aria-pressed={minutes === m} onClick={() => { void patchSettings({ minutes: m }); setTimeOpen(false) }}>{m} min</button>)}
          <button className="chip" aria-pressed={isCustom} onClick={() => { setCm(String(minutes)); setTimeOpen(false); setCustom(true) }}>{isCustom ? `${minutes} min` : 'Custom'}</button>
        </div>
      </Sheet>
      <Sheet open={custom} onClose={() => setCustom(false)} title="Custom time">
        <label className="block text-sm"><span className="eyebrow">Minutes (5–240)</span><input type="number" inputMode="numeric" min={5} max={240} className="mt-1 h-12 w-full rounded-xl border border-line bg-bg px-3 text-lg" value={cm} onChange={(e) => setCm(e.target.value)} /></label>
        <button className="btn btn-primary btn-lg mt-4 w-full" disabled={!(+cm >= 5 && +cm <= 240)} onClick={() => { void patchSettings({ minutes: Math.round(+cm) }); setCustom(false) }}>Use {cm || '…'} minutes</button>
      </Sheet>
      <Sheet open={how} onClose={() => setHow(false)} title="How today’s plan is chosen">
        <div className="space-y-3 text-sm text-ink-2">
          <p>Each ayah has an estimated chance you could recite it now, based only on your own recorded recall. When it drops to about 90%, it’s due.</p>
          <p>Due material goes first, riskiest first. New memorisation gets less time when revision is heavy. After a gap, the backlog is spread over several days; nothing is reset.</p>
          <p className="rounded-xl bg-brass-soft/60 p-3 text-ink">{plan.modelNote}</p>
        </div>
      </Sheet>
    </div>
  )
}
