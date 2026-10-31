import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ensureArm, useApp } from '@/app/store'
import { AyahWords, Medallion, Passage } from '@/components/Arabic'
import { AudioBar } from '@/components/AudioBar'
import { PhraseEditor } from '@/components/PhraseEditor'
import { RecallCard } from '@/components/RecallCard'
import { Icon } from '@/components/Icon'
import { buildLadder, buildPhrases, suggestBoundaries } from '@/lib/engine/phrases'
import type { FlowRating, PracticeContext, Range, Strategy } from '@/lib/engine/types'
import { isValidRef, loadTranslation, textOf, wordsOfAyah } from '@/lib/quran/data'
import { rangeTitle } from '@/lib/format'

type Stage = 'sound' | 'flow' | 'recall' | 'connect' | 'done'
const STEPS: { id: Exclude<Stage, 'done'>; label: string }[] = [
  { id: 'sound', label: 'Sound' }, { id: 'flow', label: 'Flow' }, { id: 'recall', label: 'Recall' }, { id: 'connect', label: 'Connect' },
]

function Stepper({ stage, multi }: { stage: Stage; multi: boolean }) {
  const steps = multi ? STEPS : STEPS.slice(0, 3)
  const cur = steps.findIndex((s) => s.id === stage)
  return (
    <ol className="flex items-center justify-center gap-1.5" aria-label="Learning stages">
      {steps.map((s, i) => (
        <li key={s.id} className="flex items-center gap-1.5" aria-current={i === cur ? 'step' : undefined}>
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${i === cur ? 'bg-accent text-accent-ink' : i < cur || stage === 'done' ? 'bg-accent-soft text-accent-strong' : 'bg-surface-2 text-muted'}`}>
            {(i < cur || stage === 'done') && <Icon name="check" size={12} />}{s.label}
          </span>
          {i < steps.length - 1 && <span className="h-px w-3 bg-line" />}
        </li>
      ))}
    </ol>
  )
}

export function LearnFlow({ range, context, onDone, onExit, embedded }: { range: Range; context: PracticeContext; onDone: () => void; onExit: () => void; embedded?: boolean }) {
  const snap = useApp((s) => s.snap)
  const logFlow = useApp((s) => s.logFlow)
  const setMarker = useApp((s) => s.setMarker)
  const say = useApp((s) => s.say)
  const n = range.end - range.start + 1
  const [idx, setIdx] = useState(0)
  const [arm, setArm] = useState<Strategy | undefined>(undefined)
  const [armReady, setArmReady] = useState(false)
  const [stage, setStage] = useState<Stage>('sound')
  const [listened, setListened] = useState(false)
  const [rungIdx, setRungIdx] = useState(0)
  const [reps, setReps] = useState(0)
  const [edit, setEdit] = useState(false)
  const [hear, setHear] = useState(false)
  const [repair, setRepair] = useState(false)
  const [tr, setTr] = useState<string[] | null>(null)
  const flowStart = useRef(Date.now())
  const ayah = range.start + idx

  useEffect(() => { void ensureArm(range).then((a) => { setArm(a); setArmReady(true); if (a === 'A') setStage('flow') }) }, [range.surah, range.start, range.end]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (snap.settings.translation) void loadTranslation().then((t) => setTr(t[range.surah - 1] ?? null)) }, [snap.settings.translation, range.surah])

  const words = wordsOfAyah(range.surah, ayah)
  const marker = snap.markers.find((m) => m.id === `${range.surah}:${ayah}`)
  const boundaries = useMemo(() => (marker ? marker.boundaries : suggestBoundaries(words).boundaries), [marker, words])
  const phrases = useMemo(() => buildPhrases(words, boundaries), [words, boundaries])
  const methodA = arm === 'A'
  const rungs = useMemo(() => (methodA ? [{ from: 0, to: Math.max(0, phrases.length - 1), kind: 'full' as const, label: 'Repeat aloud' }] : buildLadder(phrases)), [phrases, methodA])
  const rung = rungs[Math.min(rungIdx, rungs.length - 1)]!
  const wordSpan: [number, number] = [phrases[rung.from]!.from, phrases[rung.to]!.to]
  const single = { surah: range.surah, start: ayah, end: ayah }

  const resetFlow = () => { setRungIdx(0); setReps(0); flowStart.current = Date.now() }
  const nextAyah = () => {
    setRepair(false); setListened(false); setHear(false); resetFlow()
    if (idx < n - 1) { setIdx(idx + 1); setStage(methodA ? 'flow' : 'sound') }
    else if (n > 1) setStage('connect')
    else setStage('done')
  }

  async function rate(r: FlowRating) {
    await logFlow({ surah: range.surah, ayah, fromPhrase: rung.from, toPhrase: rung.to, phraseCount: phrases.length, rating: r, reps, durationMs: Math.min(Date.now() - flowStart.current, 10 * 60_000), listenedFirst: listened })
    if (r === 'tangled') { setReps(0); flowStart.current = Date.now(); say('Slow it down: try the audio at 0.75×, then say it again'); return }
    if (rungIdx >= rungs.length - 1) { setStage('recall'); setReps(0) }
    else { setRungIdx(rungIdx + 1); setReps(0); flowStart.current = Date.now() }
  }

  if (!armReady) return <div className="grid min-h-[60dvh] place-items-center text-muted">Preparing…</div>

  return (
    <div className="mx-auto max-w-[680px]" data-testid="learn-flow" data-stage={stage} data-arm={arm ?? 'none'}>
      {embedded ? (
        n > 1 && stage !== 'connect' && stage !== 'done' && <div className="pt-3 text-center text-xs text-muted tabular">ayah {idx + 1} of {n}</div>
      ) : (
        <div className="safe-top flex items-center justify-between px-4 pt-4">
          <button className="btn btn-ghost btn-sm" onClick={onExit} aria-label="Leave"><Icon name="x" size={18} /></button>
          <div className="text-center"><div className="eyebrow">{rangeTitle(range)}</div>{n > 1 && stage !== 'connect' && stage !== 'done' && <div className="text-xs text-muted tabular">ayah {idx + 1} of {n}</div>}</div>
          <span className="w-10" />
        </div>
      )}
      <div className="mt-3 mb-5 px-4">{methodA ? <div className="text-center text-xs text-muted">Method A · repeated recitation</div> : <Stepper stage={stage} multi={n > 1} />}</div>

      {stage === 'sound' && (
        <section className="enter px-4" data-testid="stage-sound">
          <div className="card px-4 py-6 text-center">
            <p className="arabic center" lang="ar" dir="rtl"><AyahWords surah={range.surah} ayah={ayah} /> <Medallion n={ayah} /></p>
            {snap.settings.translation && <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-2">{tr?.[ayah - 1] ?? ''}</p>}
          </div>
          <div className="mt-3"><AudioBar queue={[{ surah: range.surah, ayah }]} autoKey={`s-${ayah}`} onListened={() => setListened(true)} /></div>
          <p className="mt-3 text-center text-sm text-ink-2">Listen first, with the text in front of you. Notice the sounds and where the voice rests.</p>
          <button className="btn btn-primary btn-lg mt-4 w-full" onClick={() => { setStage('flow'); flowStart.current = Date.now() }} data-testid="to-flow">{listened ? 'Continue to flow' : 'Continue'} <Icon name="right" size={16} /></button>
          {!listened && <p className="mt-2 text-center text-xs text-muted">You haven’t played the recitation yet. That’s fine if you already know how it sounds.</p>}
        </section>
      )}

      {stage === 'flow' && (
        <section className="enter px-4" data-testid="stage-flow">
          <div className="mb-2 flex items-center justify-between text-sm">
            <div><span className="eyebrow">{methodA ? 'Method A' : phrases.length > 1 ? 'Chain' : 'Say it'}</span><div className="font-display text-lg">{rung.label}</div></div>
            <div className="tabular text-muted">{Math.min(rungIdx + 1, rungs.length)} of {rungs.length}</div>
          </div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((rungIdx + 1) / rungs.length) * 100}%` }} /></div>
          <div className="card px-4 py-6 text-center">
            <p className="arabic center" lang="ar" dir="rtl"><AyahWords surah={range.surah} ayah={ayah} dimOutside={methodA ? undefined : wordSpan} gaps={boundaries} /> <Medallion n={ayah} /></p>
          </div>
          {phrases.length > 1 && !methodA && (
            <div className="mt-2 flex items-center justify-center gap-1.5" aria-hidden="true">
              {phrases.map((p) => <span key={p.index} className={`grid h-7 min-w-7 place-items-center rounded-full px-2 text-xs font-bold ${p.index >= rung.from && p.index <= rung.to ? 'bg-brass text-bg' : 'bg-surface-2 text-muted'}`}>{String.fromCharCode(65 + p.index)}</span>)}
            </div>
          )}
          <button className="card mt-4 flex w-full flex-col items-center gap-1 py-6 active:scale-[0.99]" onClick={() => setReps((r) => r + 1)} data-testid="said-it" style={reps === 0 ? { animation: 'pulse-ring 2s ease-out infinite' } : undefined}>
            <span className="text-sm font-semibold text-accent">Say it aloud, then tap</span>
            <span className="font-display tabular text-5xl text-ink">{reps}</span>
            <span className="text-xs text-muted">{reps === 0 ? 'Smooth and unhurried; sound matters more than speed' : reps < 3 ? 'A few more times' : 'Rate how it feels'}</span>
          </button>
          <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="How does it feel on the tongue?">
            <button className="btn btn-quiet h-auto flex-col !gap-0 py-2.5" onClick={() => void rate('tangled')} data-testid="rate-tangled"><span>Tangled</span><span className="text-[0.7rem] font-normal text-muted">again</span></button>
            <button className="btn btn-quiet h-auto flex-col !gap-0 py-2.5" onClick={() => void rate('improving')} data-testid="rate-improving"><span>Improving</span><span className="text-[0.7rem] font-normal text-muted">next</span></button>
            <button className="btn btn-primary h-auto flex-col !gap-0 py-2.5" onClick={() => void rate('natural')} data-testid="rate-natural"><span>Natural</span><span className="text-[0.7rem] font-normal opacity-80">rolls off</span></button>
          </div>
          <div className="mt-3 flex items-center justify-center gap-1">
            <button className="btn btn-ghost btn-sm" onClick={() => setHear((h) => !h)}><Icon name="headphones" size={15} />Hear it</button>
            {!methodA && <button className="btn btn-ghost btn-sm" onClick={() => setEdit(true)} data-testid="edit-phrases"><Icon name="scissors" size={15} />Phrases</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => { setStage('recall'); setReps(0) }}>Skip to recall</button>
          </div>
          {hear && <div className="mt-2"><AudioBar queue={[{ surah: range.surah, ayah }]} autoKey={`f-${ayah}`} onListened={() => setListened(true)} /></div>}
          <p className="mt-3 text-center text-xs text-muted">Flow is about the mouth, memory is separate: this rating never changes your retention estimate.</p>
          <PhraseEditor open={edit} onClose={() => setEdit(false)} surah={range.surah} ayah={ayah} boundaries={boundaries} onSave={(b) => { void setMarker(range.surah, ayah, b); setRungIdx(0); setReps(0); say('Phrases saved') }} />
        </section>
      )}

      {stage === 'recall' && !repair && (
        <section className="enter" data-testid="stage-recall">
          <RecallCard key={`r-${ayah}`} range={single} context={context} listenedFirst={listened} title={`Ayah ${ayah} from memory`} onDone={(e) => { if (e.grade === 'prompted' || e.grade === 'failed') setRepair(true); else nextAyah() }} />
        </section>
      )}
      {stage === 'recall' && repair && (
        <section className="enter px-4" data-testid="stage-repair">
          <div className="card p-6 text-center">
            <h2 className="font-display text-xl">One more round of flow</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">That ayah isn’t settled yet, which is normal. Going back to the sound and the chain usually helps more than hammering recall.</p>
            <div className="mt-4 grid gap-2"><button className="btn btn-primary" onClick={() => { setRepair(false); resetFlow(); setStage(methodA ? 'flow' : 'sound') }} data-testid="back-to-flow">Back to sound and flow</button><button className="btn btn-quiet" onClick={nextAyah}>Move on for now</button></div>
          </div>
        </section>
      )}

      {stage === 'connect' && (
        <section className="enter" data-testid="stage-connect">
          <p className="mb-3 px-6 text-center text-sm text-ink-2">Now join them. Individual ayahs are not the same as a continuous passage; mark any transition that wobbles.</p>
          <RecallCard key="connect" range={range} context={context} listenedFirst={listened} title="The whole passage" onDone={() => setStage('done')} />
        </section>
      )}

      {stage === 'done' && (
        <section className="enter px-4" data-testid="stage-done">
          <div className="card p-6 text-center">
            <h2 className="font-display text-2xl">Well done</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">{rangeTitle(range)} is recorded. Hifz OS will schedule its first check soon, close enough to catch what fades and far enough to be a real test.</p>
            <p className="arabic center mt-4 text-brass" lang="ar" dir="rtl" style={{ fontSize: '1.4rem' }}>{n === 1 ? textOf(range.surah, ayah).split(' ').slice(0, 3).join(' ') + '…' : ''}</p>
            <button className="btn btn-primary btn-lg mt-4 w-full" onClick={onDone} data-testid="learn-finish">Continue</button>
          </div>
        </section>
      )}
    </div>
  )
}

export function LearnPage() {
  const p = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const surah = Number(p.surah), start = Number(p.start), end = Number(p.end)
  const ok = isValidRef(surah, start) && isValidRef(surah, end) && end >= start && end - start < 60
  if (!ok) return <div className="p-8 text-center">That passage can’t be opened. <button className="underline" onClick={() => nav('/quran')}>Back</button></div>
  const ctx = (sp.get('ctx') as PracticeContext | null) ?? 'new'
  return <LearnFlow range={{ surah, start, end }} context={ctx} onExit={() => nav(-1)} onDone={() => nav('/')} />
}

export { Passage }
