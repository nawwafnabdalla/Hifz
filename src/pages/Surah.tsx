import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '@/app/store'
import { Passage, Medallion, AyahWords } from '@/components/Arabic'
import { AudioBar } from '@/components/AudioBar'
import { GoalSheet } from '@/components/GoalSheet'
import { Icon, Divider } from '@/components/Icon'
import { Legend, Sheet, cellStyle } from '@/components/ui'
import { SURAHS, bismillahText, hasBismillahHeader, isValidRef, juzOf, loadTranslation, pageOf, surahInfo } from '@/lib/quran/data'
import { useStatusFn } from '@/lib/useStatus'
import { labelGrade } from '@/lib/engine/derive'
import { agoText } from '@/lib/engine/planner'
import { rangePath, rangeTitle } from '@/lib/format'
import { ayahKey } from '@/lib/engine/types'
import { dueAt } from '@/lib/engine/memory'

const PAGE = 40

export function SurahPage() {
  const nav = useNavigate()
  const params = useParams()
  const [sp] = useSearchParams()
  const n = Number(params.surah)
  const valid = Number.isInteger(n) && n >= 1 && n <= 114
  const info = surahInfo(valid ? n : 1)
  const status = useStatusFn()
  const settings = useApp((s) => s.snap.settings)
  const patch = useApp((s) => s.patchSettings)
  const derived = useApp((s) => s.derived)
  const now = useApp((s) => s.now)
  const declare = useApp((s) => s.declare)
  const say = useApp((s) => s.say)
  const [shown, setShown] = useState(PAGE)
  const [sel, setSel] = useState<[number, number] | null>(() => { const a = Number(sp.get('a')); return isValidRef(n, a) ? [a, a] : null })
  const [study, setStudy] = useState(settings.translation)
  const [tr, setTr] = useState<string[] | null>(null)
  const [listen, setListen] = useState(false)
  const [goal, setGoal] = useState(false)
  const [detail, setDetail] = useState(false)
  const [mapOpen, setMapOpen] = useState(info.count <= 80)

  useEffect(() => { if (study && !tr) void loadTranslation().then((t) => setTr(t[n - 1] ?? null)) }, [study, tr, n])
  const prevN = useRef(n)
  useEffect(() => {
    // Reset only when moving to a different surah, never on first mount (that would drop a deep-linked ?a= selection).
    if (prevN.current === n) return
    prevN.current = n
    setShown(PAGE); setSel(null); setListen(false); setMapOpen(surahInfo(n).count <= 80); window.scrollTo(0, 0)
  }, [n])
  useEffect(() => { if (sel && sel[1] > shown) setShown(Math.ceil(sel[1] / PAGE) * PAGE) }, [sel, shown])
  useEffect(() => { if (sel && sp.get('a')) document.querySelector(`[data-ayah="${sel[0]}"]`)?.scrollIntoView({ block: 'center' }) }, [sp, sel])

  const ayahs = useMemo(() => Array.from({ length: Math.min(shown, info.count) }, (_, i) => i + 1), [shown, info.count])
  if (!valid) return <div className="p-8 text-center">That surah doesn’t exist. <button className="underline" onClick={() => nav('/quran')}>Back</button></div>

  const onTap = (a: number) => {
    setSel((cur) => {
      if (!cur) return [a, a]
      if (cur[0] === cur[1] && a !== cur[0]) return [Math.min(cur[0], a), Math.max(cur[0], a)]
      if (cur[0] === a && cur[1] === a) return null
      return [a, a]
    })
    setListen(false)
  }
  const range = sel ? { surah: n, start: sel[0], end: sel[1] } : null
  const stageOf = (a: number) => { const s = status(n, a); return { stage: s.stage, r: s.retrievability } }
  const queue = sel ? Array.from({ length: sel[1] - sel[0] + 1 }, (_, i) => ({ surah: n, ayah: sel[0] + i })) : []
  const one = sel && sel[0] === sel[1] ? status(n, sel[0]) : null
  const mem = sel && sel[0] === sel[1] ? derived.memory.get(ayahKey(n, sel[0])) : undefined
  const flow = sel && sel[0] === sel[1] ? derived.flow.get(ayahKey(n, sel[0])) : undefined
  const allClaimed = sel ? Array.from({ length: sel[1] - sel[0] + 1 }, (_, i) => derived.memory.get(ayahKey(n, sel[0] + i))?.claimed).every(Boolean) : false

  return (
    <div className="pb-40">
      <header className="safe-top px-5 pt-4">
        <button className="btn btn-ghost btn-sm -ml-3" onClick={() => nav('/quran')}><Icon name="left" size={18} />Qur’an</button>
        <div className="mt-1 text-center">
          <div className="eyebrow">Surah {info.n} · {info.type === 'meccan' ? 'Meccan' : 'Medinan'} · {info.count} ayahs · Juz {juzOf(n, 1)} · p. {pageOf(n, 1)}</div>
          <h1 lang="ar" dir="rtl" className="mt-3 font-[family-name:var(--font-arabic)] text-[2.6rem] leading-[2] text-ink">{info.ar}</h1>
          <div className="font-display mt-1 text-xl">{info.tr}</div>
          <div className="text-sm text-muted">{info.en}</div>
        </div>
        <Divider className="mx-auto mt-4 max-w-xs" />
      </header>

      <section className="mt-4 px-5">
        <div className="card-flat p-3">
          <button className="flex w-full items-center justify-between text-sm font-semibold text-ink-2" onClick={() => setMapOpen((o) => !o)} aria-expanded={mapOpen}>
            <span>Ayah-by-ayah map <span className="font-normal text-muted">· {info.count} ayahs</span></span><Icon name={mapOpen ? 'up' : 'down'} size={18} />
          </button>
          {mapOpen && (
            <>
              <div className="mt-3 flex flex-wrap gap-[3px]" role="list" aria-label="Ayah-by-ayah progress">
                {Array.from({ length: info.count }, (_, i) => i + 1).map((a) => { const s = status(n, a); const on = sel && a >= sel[0] && a <= sel[1]; return (
                  <button key={a} role="listitem" aria-label={`Ayah ${a}: ${s.stage.replace('_', ' ')}`} onClick={() => { onTap(a) }} className={`${info.count > 80 ? 'h-3.5 w-3.5' : 'h-4 w-4'} rounded-[4px] ${on ? 'ring-2 ring-ink' : ''}`} style={cellStyle(s.stage, s.retrievability)} />
                ) })}
              </div>
              <div className="mt-3"><Legend /></div>
            </>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex gap-2"><button className="chip" aria-pressed={!study} onClick={() => setStudy(false)}>Mushaf</button><button className="chip" aria-pressed={study} onClick={() => setStudy(true)} data-testid="study-mode">Study</button></div>
          <button className="chip" aria-pressed={settings.arabicScale > 1.1} onClick={() => patch({ arabicScale: settings.arabicScale > 1.1 ? 1 : 1.3 })}>Larger text</button>
        </div>
      </section>

      <article className="mt-3 px-4" aria-label={`Text of ${info.tr}`}>
        {hasBismillahHeader(n) && (
          <p className="arabic center mb-2 text-brass" lang="ar" dir="rtl" style={{ fontSize: 'calc(1.5rem * var(--arabic-scale, 1))' }} aria-label="Bismillah">{bismillahText()}</p>
        )}
        {!study ? (
          <div className="card px-4 py-5"><Passage surah={n} ayahs={ayahs} selected={sel} onTap={onTap} stageOf={stageOf} /></div>
        ) : (
          <ol className="space-y-3">
            {ayahs.map((a) => {
              const on = sel && a >= sel[0] && a <= sel[1]
              const s = status(n, a)
              return (
                <li key={a}>
                  <button onClick={() => onTap(a)} className={`card-flat w-full p-4 text-left transition-colors ${on ? '!border-accent bg-accent-soft/50' : ''}`} aria-pressed={!!on}>
                    <div className="mb-1 flex items-center justify-between text-xs text-muted"><span className="tabular font-semibold">{n}:{a}</span><span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={cellStyle(s.stage, s.retrievability)} />{s.stage === 'claimed' ? 'marked known' : s.stage.replace('_', ' ')}</span></div>
                    <p className="arabic" lang="ar" dir="rtl"><AyahWords surah={n} ayah={a} />{' '}<Medallion n={a} /></p>
                    <p className="mt-1 text-[0.95rem] leading-relaxed text-ink-2">{tr ? tr[a - 1] : '…'}</p>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
        {shown < info.count && <button className="btn btn-quiet mt-4 w-full" onClick={() => setShown((x) => x + PAGE)}>Show more ({info.count - shown} remaining)</button>}
        {n < 114 && shown >= info.count && <button className="btn btn-ghost mt-4 w-full" onClick={() => nav(`/quran/${n + 1}`)}>Next: {SURAHS[n]!.tr} <Icon name="right" size={16} /></button>}
        <p className="mt-6 px-2 text-center text-xs text-muted">Text: Hafs Uthmani, verified against independent sources. Translation: Saheeh International. See Settings → About for provenance. This app does not replace a teacher or a printed mushaf.</p>
      </article>

      {range && (
        <div className="fixed inset-x-0 z-40 mx-auto max-w-[720px] px-3" style={{ bottom: 'calc(78px + env(safe-area-inset-bottom))' }} data-testid="selection-bar">
          <div className="card enter p-3">
            {listen && <div className="mb-3"><AudioBar queue={queue} autoKey={`${n}:${sel![0]}-${sel![1]}`} /></div>}
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
              <button className="min-w-0 text-left" onClick={() => setDetail(true)}>
                <div className="font-display truncate text-lg leading-tight">{rangeTitle(range)}</div>
                <div className="truncate text-xs text-muted">{one ? `${one.stage.replace('_', ' ')}${one.demonstrated ? ` · est. recall ${Math.round(one.retrievability * 100)}%` : ''}` : `${range.end - range.start + 1} ayahs selected`} · details</div>
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)} aria-label="Clear selection"><Icon name="x" size={16} /></button>
            </div>
            <div className={`grid gap-2 ${sel![1] > sel![0] ? 'grid-cols-5' : 'grid-cols-4'}`}>
              <button className="btn btn-quiet flex-col !gap-0.5 !py-2" onClick={() => setListen((l) => !l)} data-testid="act-listen"><Icon name="headphones" size={18} /><span className="text-[0.7rem]">Listen</span></button>
              <button className="btn btn-primary flex-col !gap-0.5 !py-2" onClick={() => nav(rangePath('learn', range))} data-testid="act-learn"><Icon name="wave" size={18} /><span className="text-[0.7rem]">Learn</span></button>
              <button className="btn btn-quiet flex-col !gap-0.5 !py-2" onClick={() => nav(rangePath('review', range, '?ctx=free'))} data-testid="act-recall"><Icon name="eyeoff" size={18} /><span className="text-[0.7rem]">Recall</span></button>
              {sel![1] > sel![0] && <button className="btn btn-quiet flex-col !gap-0.5 !py-2" onClick={() => nav(rangePath('review', range, '?mode=junction'))} data-testid="act-connect"><Icon name="link" size={18} /><span className="text-[0.7rem]">Connect</span></button>}
              <button className="btn btn-quiet flex-col !gap-0.5 !py-2" onClick={() => setGoal(true)} data-testid="act-goal"><Icon name="target" size={18} /><span className="text-[0.7rem]">Goal</span></button>
            </div>
          </div>
        </div>
      )}

      <GoalSheet open={goal} onClose={() => setGoal(false)} initial={range ?? undefined} />
      <Sheet open={detail && !!range} onClose={() => setDetail(false)} title={range ? rangeTitle(range) : ''}>
        {range && (
          <div className="space-y-3 text-sm">
            {one ? (
              <>
                <div className="card-flat p-3"><div className="eyebrow">Status</div><div className="mt-1 font-semibold capitalize">{one.stage.replace('_', ' ')}</div><p className="mt-1 text-ink-2">{one.because}</p></div>
                <dl className="grid grid-cols-2 gap-2">
                  <div className="card-flat p-3"><dt className="eyebrow">Estimated recall</dt><dd className="tabular mt-1 text-lg">{one.demonstrated || one.stage === 'claimed' ? `${Math.round(one.retrievability * 100)}%` : '–'}</dd><dd className="text-xs text-muted">from a default model</dd></div>
                  <div className="card-flat p-3"><dt className="eyebrow">Verified on its own</dt><dd className="mt-1 text-lg">{one.verifiedIndividually ? 'Yes' : 'Not yet'}</dd><dd className="text-xs text-muted">passage recall alone is weaker proof</dd></div>
                  <div className="card-flat p-3"><dt className="eyebrow">Last recalled</dt><dd className="mt-1">{mem?.lastSuccessAt ? agoText(mem.lastSuccessAt, now) : '–'}</dd></div>
                  <div className="card-flat p-3" data-testid="next-review"><dt className="eyebrow">Next review</dt><dd className="mt-1">{mem && mem.firstDemonstratedAt !== null ? (dueAt(mem) <= now ? 'Due now' : new Date(dueAt(mem)).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : '–'}</dd><dd className="text-xs text-muted">when estimated recall reaches 90%</dd></div>
                  <div className="card-flat p-3"><dt className="eyebrow">Flow</dt><dd className="mt-1 capitalize">{flow?.rating ?? 'not practised'}</dd><dd className="text-xs text-muted">separate from memory</dd></div>
                </dl>
                {mem?.lastOutcome && <p className="text-ink-2">Last attempt: {labelGrade(mem.lastOutcome)}. Forgotten {mem.lapses}×, needed prompting {mem.prompts}×.</p>}
              </>
            ) : <p className="text-ink-2">A passage of {range.end - range.start + 1} ayahs. Open a single ayah to see its individual status.</p>}
            <div className="flex gap-2">
              {allClaimed
                ? <button className="btn btn-quiet flex-1" onClick={async () => { await declare(range, 'retract'); say('Unmarked'); setDetail(false) }}>I don’t know this after all</button>
                : <button className="btn btn-quiet flex-1" onClick={async () => { await declare(range, 'known'); say('Marked as known'); setDetail(false) }} data-testid="mark-known">I already know this</button>}
            </div>
            <p className="text-xs text-muted">“I already know this” is saved as your statement. It does not count as checked until you recall it.</p>
          </div>
        )}
      </Sheet>
    </div>
  )
}
