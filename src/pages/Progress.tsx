import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '@/app/store'
import { Header, Stat } from '@/components/ui'
import { compareListening, coverage, learningByLength, learningSamples, learningSecPerWord, retentionByInterval, weakSpots, weeklyTime } from '@/lib/engine/analytics'
import { isActive, readout } from '@/lib/engine/experiment'
import { corpus, surahInfo, TOTAL_AYAHS } from '@/lib/quran/data'
import { pct, secs, shortDate } from '@/lib/format'
import { DAY } from '@/lib/engine/types'
import { Icon } from '@/components/Icon'
import { computePlan } from '@/lib/plan'

function Bar({ value, ci, label, n }: { value: number | null; ci: [number, number] | null; label: string; n: number }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-sm">
      <span className="text-ink-2">{label}</span>
      <div className="relative h-3 rounded-full bg-line" role="img" aria-label={n ? `${label}: ${pct(value)} recalled, ${n} attempts` : `${label}: no attempts yet`}>
        {value !== null && ci && <>
          <div className="absolute inset-y-0 rounded-full bg-accent/20" style={{ left: `${ci[0] * 100}%`, width: `${(ci[1] - ci[0]) * 100}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${value * 100}%` }} />
        </>}
      </div>
      <span className="tabular w-24 text-right text-xs text-muted">{n ? `${pct(value)} · n=${n}` : 'no data'}</span>
    </div>
  )
}

export function ProgressPage() {
  const { snap, derived, now, startExperiment, stopExperiment } = useApp()
  const cov = useMemo(() => coverage(derived, corpus, now), [derived, now])
  const retention = useMemo(() => retentionByInterval(snap.reviews), [snap.reviews])
  const samples = useMemo(() => learningSamples(snap.reviews, snap.flows, corpus), [snap.reviews, snap.flows])
  const pace = learningSecPerWord(samples)
  const byLen = useMemo(() => learningByLength(samples), [samples])
  const listen = useMemo(() => compareListening(samples), [samples])
  const weak = useMemo(() => weakSpots(derived, now), [derived, now])
  const weeks = useMemo(() => weeklyTime(snap.reviews, snap.flows, now), [snap.reviews, snap.flows, now])
  const plan = useMemo(() => computePlan(snap, derived, now), [snap, derived, now])
  const exp = [...snap.experiments].sort((a, b) => b.startedAt - a.startedAt)[0]
  const active = isActive(exp, now)
  const ro = useMemo(() => (exp ? readout(exp, snap.reviews, snap.flows, corpus) : null), [exp, snap.reviews, snap.flows])
  const maxMin = Math.max(30, ...weeks.map((w) => w.minutes))
  const none = snap.reviews.length === 0 && snap.flows.length === 0 && snap.declarations.length === 0

  return (
    <div>
      <Header eyebrow="Progress" title="What the evidence shows" subtitle="Every figure comes from your own recorded practice. Where there isn’t enough data, it says so." />

      <section className="grid grid-cols-2 gap-3 px-5" data-testid="coverage">
        <Stat label="Recalled" value={cov.demonstrated.toLocaleString()} hint={`of ${TOTAL_AYAHS.toLocaleString()} ayahs, shown by recall`} />
        <Stat label="Marked known" value={cov.declared.toLocaleString()} hint="your statement, not yet a test" />
        <Stat label="Recalled this week" value={cov.verifiedLast7.toLocaleString()} hint={`${cov.verifiedLast30.toLocaleString()} in 30 days`} />
        <Stat label="Due now" value={cov.dueNow.toLocaleString()} hint={plan.backlog.minutes ? `about ${Math.round(plan.backlog.minutes)} min of review` : 'on schedule'} />
      </section>

      {none && <p className="mx-5 mt-5 rounded-2xl bg-surface-2 p-4 text-sm text-ink-2">Nothing recorded yet. Once you recite and grade a few passages, this page fills in.</p>}

      <section className="mt-8 px-5">
        <h2 className="font-display text-xl">Retention by gap</h2>
        <p className="mt-1 text-sm text-ink-2">How often recall worked, by time since you last practised.</p>
        <div className="card mt-3 space-y-3 p-4" data-testid="retention">{retention.map((b) => <Bar key={b.label} label={b.label} value={b.rate} ci={b.ci} n={b.n} />)}</div>
        <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer select-none">How to read this</summary><p className="mt-1">Bars show the rate; the pale band is a 95% interval. Ayahs recited together are not independent tests, so intervals are optimistic. Long passage recitations are not counted here.</p></details>
      </section>

      <section className="mt-8 px-5">
        <h2 className="font-display text-xl">Learning effort</h2>
        <div className="card mt-3 p-4">
          <div className="flex items-baseline justify-between"><span className="text-sm text-ink-2">Median active time to first accurate recall</span><span className="font-display tabular text-2xl">{pace == null ? '–' : `${pace.toFixed(1)} s/word`}</span></div>
          <p className="mt-1 text-xs text-muted">{pace == null ? `Needs at least 5 ayahs learned through the app (${samples.length} so far). Until then, planning uses a default estimate.` : `From ${samples.length} ayahs. Your planner now uses this pace.`}</p>
          <div className="hairline my-3" />
          <ul className="space-y-2 text-sm">{byLen.map((b) => <li key={b.label} className="flex justify-between"><span className="text-ink-2">{b.label}</span><span className="tabular text-muted">{b.n ? `${secs(b.medianSeconds)} · ${b.medianSecPerWord?.toFixed(1)} s/word · n=${b.n}` : 'no data'}</span></li>)}</ul>
          <div className="hairline my-3" />
          <div className="text-sm"><div className="font-semibold">{listen.question}</div>
            <div className="mt-1 flex justify-between text-ink-2"><span>{listen.a.label} (n={listen.a.n})</span><span className="tabular">{listen.a.medianSecPerWord?.toFixed(1) ?? '–'} s/word</span></div>
            <div className="flex justify-between text-ink-2"><span>{listen.b.label} (n={listen.b.n})</span><span className="tabular">{listen.b.medianSecPerWord?.toFixed(1) ?? '–'} s/word</span></div>
            <p className="mt-1 text-xs text-muted">{listen.verdict}</p></div>
        </div>
      </section>

      <section className="mt-8 px-5">
        <h2 className="font-display text-xl">Practice time</h2>
        <div className="card mt-3 p-4">
          <div className="flex h-28 items-end gap-2" role="img" aria-label="Minutes practised per week for the last eight weeks">
            {weeks.map((w) => <div key={w.weekStart} className="flex flex-1 flex-col items-center justify-end gap-1"><div className="w-full rounded-t-md bg-accent/80" style={{ height: `${Math.max(2, (w.minutes / maxMin) * 100)}%` }} title={`${Math.round(w.minutes)} min on ${w.days} days`} /></div>)}
          </div>
          <div className="mt-1 flex gap-2 text-[0.65rem] text-muted tabular">{weeks.map((w) => <span key={w.weekStart} className="flex-1 text-center">{shortDate(w.weekStart)}</span>)}</div>
          <p className="mt-2 text-xs text-muted">Active minutes recorded in the app, by week. No streaks here: a missed day is just a day.</p>
        </div>
      </section>

      <section className="mt-8 px-5">
        <h2 className="font-display text-xl">Weak spots</h2>
        {weak.length ? (
          <ul className="mt-3 space-y-2" data-testid="weak">{weak.map((w) => <li key={`${w.surah}:${w.ayah}`}><Link to={`/quran/${w.surah}?a=${w.ayah}`} className="card-flat flex items-center justify-between p-3.5"><span><span className="font-semibold">{surahInfo(w.surah).tr} {w.ayah}</span><span className="block text-xs text-muted">forgotten {w.lapses}× · needed prompting {w.prompts}×</span></span><Icon name="right" className="text-muted" size={18} /></Link></li>)}</ul>
        ) : <p className="mt-2 text-sm text-muted">No ayah has been forgotten or needed repeated prompting yet.</p>}
      </section>

      <section className="mt-8 px-5 pb-6" data-testid="experiment">
        <h2 className="font-display text-xl">Does your method matter?</h2>
        <p className="mt-1 text-sm text-ink-2">A 14-day comparison of two ways to learn: <b>A</b> repeated recitation, <b>B</b> listen, practise phrases, then recall.</p>
        <div className="card mt-3 p-4">
          {!exp || !active && exp.endsAt < now && !ro ? null : null}
          {!active ? (
            <>
              {exp && ro && <p className="mb-3 text-xs text-muted">Last experiment ended {shortDate(exp.endsAt)}.</p>}
              <button className="btn btn-primary w-full" onClick={() => void startExperiment()} data-testid="start-experiment"><Icon name="flask" size={16} /> Start a 14-day comparison</button>
              <p className="mt-2 text-xs text-muted">Each new passage is assigned a method automatically.</p>
            </>
          ) : (
            <div className="flex items-center justify-between"><span className="text-sm"><b>Running</b> · {Math.max(0, Math.ceil((exp!.endsAt - now) / DAY))} days left</span><button className="btn btn-ghost btn-sm" onClick={() => void stopExperiment()}>End now</button></div>
          )}
          {ro && exp && (
            <div className="mt-4 border-t border-line pt-4" data-testid="readout">
              <p className="text-sm font-semibold">{ro.headline}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                {ro.arms.map((a) => (
                  <div key={a.arm} className="card-flat p-3">
                    <div className="text-xs font-semibold text-ink-2">{a.label}</div>
                    <dl className="mt-2 space-y-1.5 text-xs">
                      <div className="flex justify-between"><dt className="text-muted">Ayahs assigned</dt><dd className="tabular">{a.ayahs}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted">Learned (n)</dt><dd className="tabular">{a.learned}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted">Median s/word</dt><dd className="tabular">{a.medianSecPerWord?.toFixed(1) ?? '–'}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted">Delayed recall</dt><dd className="tabular">{a.delayedTested ? `${a.delayedIndependent}/${a.delayedTested}` : '–'}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted">95% interval</dt><dd className="tabular">{a.delayedCi ? `${pct(a.delayedCi[0])}–${pct(a.delayedCi[1])}` : '–'}</dd></div>
                    </dl>
                  </div>
                ))}
              </div>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">{ro.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
