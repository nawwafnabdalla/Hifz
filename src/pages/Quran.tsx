import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '@/app/store'
import { Header, Legend, cellStyle, STAGE_STYLE } from '@/components/ui'
import { Icon } from '@/components/Icon'
import { KnownSheet } from '@/components/KnownSheet'
import { PassagesCard } from '@/components/PassagesCard'
import { SURAHS, TOTAL_AYAHS } from '@/lib/quran/data'
import { useRollups } from '@/lib/useStatus'
import type { Stage } from '@/lib/engine/derive'

type Filter = 'all' | 'progress' | 'known' | 'attention'

export function QuranPage() {
  const nav = useNavigate()
  const roll = useRollups()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [known, setKnown] = useState(false)
  const derived = useApp((s) => s.derived)

  const totals = useMemo(() => {
    const t: Record<Stage, number> = { not_started: 0, learning: 0, claimed: 0, reviewing: 0, needs_repair: 0, strong: 0 }
    for (const r of roll) for (const k of Object.keys(t) as Stage[]) t[k] += r.counts[k]
    return t
  }, [roll])
  const demonstrated = [...derived.memory.values()].filter((m) => m.firstDemonstratedAt !== null).length
  const claimed = [...derived.memory.values()].filter((m) => m.claimed && m.firstDemonstratedAt === null).length

  const list = SURAHS.filter((s) => {
    const r = roll[s.n - 1]!
    if (q && !(s.tr.toLowerCase().includes(q.toLowerCase()) || s.en.toLowerCase().includes(q.toLowerCase()) || String(s.n) === q.trim() || s.ar.includes(q.trim()))) return false
    if (filter === 'progress') return r.counts.learning + r.counts.reviewing + r.counts.strong + r.counts.needs_repair > 0
    if (filter === 'known') return r.known > 0
    if (filter === 'attention') return r.counts.needs_repair > 0 || r.counts.learning > 0
    return true
  })

  return (
    <div>
      <Header eyebrow="My Qur’an" title="Knowledge map" subtitle={`${demonstrated.toLocaleString()} ayahs recalled · ${claimed.toLocaleString()} marked known, not yet checked`} />

      <section className="px-5">
        <div className="card p-4">
          <div className="flex h-3 overflow-hidden rounded-full bg-line" role="img" aria-label="Composition of the Qur'an by stage">
            {(['strong', 'reviewing', 'needs_repair', 'learning', 'claimed'] as Stage[]).map((s) => totals[s] > 0 && <div key={s} style={{ width: `${(totals[s] / TOTAL_AYAHS) * 100}%`, background: STAGE_STYLE[s].ring ?? STAGE_STYLE[s].bg, opacity: s === 'claimed' ? 0.35 : 1 }} />)}
          </div>
          <details className="mt-3"><summary className="cursor-pointer select-none text-xs text-muted">Colour key</summary><div className="mt-2"><Legend /></div></details>
          <div className="mt-4 grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(19, minmax(0, 1fr))' }} role="list" aria-label="All 114 surahs">
            {roll.map((r) => {
              const dominant: Stage = r.counts.needs_repair ? 'needs_repair' : r.counts.learning && !r.counts.strong && !r.counts.reviewing ? 'learning' : r.counts.strong + r.counts.reviewing > 0 ? (r.counts.strong >= r.counts.reviewing ? 'strong' : 'reviewing') : r.counts.claimed ? 'claimed' : 'not_started'
              const frac = r.known / r.total
              const mean = r.strip.length ? r.strip.reduce((n, c) => n + c.r, 0) / r.strip.length : 0
              return (
                <button key={r.surah} role="listitem" title={`${SURAHS[r.surah - 1]!.tr}`} aria-label={`${SURAHS[r.surah - 1]!.tr}, ${r.known} of ${r.total} ayahs known`} onClick={() => nav(`/quran/${r.surah}`)}
                  className="aspect-square rounded-[5px] transition-transform active:scale-90" style={{ ...cellStyle(dominant, dominant === 'reviewing' || dominant === 'strong' ? Math.max(0.35, mean) : 1), opacity: dominant === 'not_started' ? 1 : Math.max(0.35, 0.35 + 0.65 * frac) }} />
              )
            })}
          </div>
        </div>
      </section>

      <PassagesCard />

      <section className="mt-5 px-5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input className="h-11 w-full rounded-xl border border-line bg-surface pl-3 pr-3 text-[0.95rem]" placeholder="Search by name or number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search surahs" data-testid="surah-search" />
          </div>
          <button className="btn btn-quiet" onClick={() => setKnown(true)} data-testid="open-known-quran"><Icon name="check" size={16} />I know…</button>
        </div>
        <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
          {([['all', 'All'], ['progress', 'In progress'], ['known', 'Known'], ['attention', 'Needs attention']] as [Filter, string][]).map(([f, l]) => <button key={f} className="chip whitespace-nowrap" aria-pressed={filter === f} onClick={() => setFilter(f)}>{l}</button>)}
        </div>
      </section>

      <ul className="mt-4 space-y-2 px-5" data-testid="surah-list">
        {list.map((s) => {
          const r = roll[s.n - 1]!
          return (
            <li key={s.n}>
              <Link to={`/quran/${s.n}`} className="card-flat flex items-center gap-3 p-3.5 transition-colors hover:border-accent/50">
                <span className="relative grid h-11 w-11 flex-none place-items-center text-brass"><svg viewBox="0 0 24 24" className="absolute inset-0" fill="none" stroke="currentColor" strokeWidth="1"><rect x="5.2" y="5.2" width="13.6" height="13.6" /><rect x="5.2" y="5.2" width="13.6" height="13.6" transform="rotate(45 12 12)" /></svg><span className="tabular relative text-[0.78rem] font-bold text-ink">{s.n}</span></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2"><span className="truncate font-semibold">{s.tr}</span><span lang="ar" dir="rtl" className="font-[family-name:var(--font-arabic)] text-xl leading-none text-ink-2">{s.ar}</span></div>
                  <div className="flex items-center justify-between text-xs text-muted"><span className="truncate">{s.en}</span><span className="tabular flex-none">{s.count} ayahs</span></div>
                  <div className="mt-2 flex h-2 gap-px overflow-hidden rounded-full" aria-hidden="true">
                    {r.strip.map((c, i) => <div key={i} className="min-w-[2px] flex-1" style={cellStyle(c.stage, c.r)} />)}
                  </div>
                </div>
              </Link>
            </li>
          )
        })}
        {!list.length && <li className="py-10 text-center text-sm text-muted">No surah matches that search.</li>}
      </ul>
      <KnownSheet open={known} onClose={() => setKnown(false)} />
    </div>
  )
}
