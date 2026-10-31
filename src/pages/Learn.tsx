import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ensureArm, useApp } from '@/app/store'
import { AyahWords, Medallion, Passage } from '@/components/Arabic'
import { AudioBar } from '@/components/AudioBar'
import { PhraseEditor } from '@/components/PhraseEditor'
import { RungPractice } from '@/components/RungPractice'
import { RecallCard } from '@/components/RecallCard'
import { Icon } from '@/components/Icon'
import { buildLadder, buildPhrases, suggestBoundaries, type Rung } from '@/lib/engine/phrases'
import { buildRepairLadder, troubledRungs } from '@/lib/engine/repair'
import { ayahKey, type FlowRating, type PracticeContext, type Range, type Strategy } from '@/lib/engine/types'
import { isValidRef, loadTranslation, wordsOfAyah } from '@/lib/quran/data'
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

const resumeKey = (r: Range) => `hifz.learn.v1.${r.surah}:${r.start}-${r.end}`
interface Saved { idx: number; stage: Stage; rungIdx: number; listened: boolean; at: number }
function loadSaved(r: Range, n: number): Saved | null {
  try {
    const raw = localStorage.getItem(resumeKey(r))
    if (!raw) return null
    const s = JSON.parse(raw) as Saved
    if (Date.now() - s.at > 12 * 3600 * 1000 || s.idx < 0 || s.idx >= n || s.stage === 'done') return null
    return s
  } catch { return null }
}

export function LearnFlow({ range, context, onDone, onExit, embedded }: { range: Range; context: PracticeContext; onDone: () => void; onExit: () => void; embedded?: boolean }) {
  const snap = useApp((s) => s.snap)
  const derived = useApp((s) => s.derived)
  const logFlow = useApp((s) => s.logFlow)
  const setMarker = useApp((s) => s.setMarker)
  const say = useApp((s) => s.say)
  const n = range.end - range.start + 1
  // Resume: the learning position is restored after a reload. A half-finished recall is NOT: it comes back
  // hidden and fresh, and nothing is graded on the user's behalf.
  const saved = useRef<Saved | null | undefined>(undefined)
  if (saved.current === undefined) saved.current = loadSaved(range, n)
  const [idx, setIdx] = useState(saved.current?.idx ?? 0)
  const [arm, setArm] = useState<Strategy | undefined>(undefined)
  const [armReady, setArmReady] = useState(false)
  const [stage, setStage] = useState<Stage>(saved.current?.stage ?? 'sound')
  const [listened, setListened] = useState(saved.current?.listened ?? false)
  const [rungIdx, setRungIdx] = useState(saved.current?.rungIdx ?? 0)
  const [ladder, setLadder] = useState<{ key: string; rungs: Rung[]; repair: boolean } | null>(null)
  const [edit, setEdit] = useState(false)
  const [hear, setHear] = useState(false)
  const [repair, setRepair] = useState(false)
  const [tr, setTr] = useState<string[] | null>(null)
  const ayah = range.start + idx

  // Lead-in: up to two ayahs just before this passage that are already known, so the new ayah is joined to what precedes it.
  const leadIn = useMemo(() => {
    let k = 0
    while (k < 2 && range.start - k - 1 >= 1) {
      const m = derived.memory.get(ayahKey(range.surah, range.start - k - 1))
      if (m && (m.claimed || m.firstDemonstratedAt !== null)) k++
      else break
    }
    return k
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const connectRange: Range = { surah: range.surah, start: range.start - leadIn, end: range.end }
  const hasConnect = n > 1 || leadIn > 0

  useEffect(() => {
    void ensureArm(range).then((a) => { setArm(a); setArmReady(true); if (a === 'A' && !saved.current) setStage('flow') })
  }, [range.surah, range.start, range.end]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (snap.settings.translation) void loadTranslation().then((t) => setTr(t[range.surah - 1] ?? null)) }, [snap.settings.translation, range.surah])
  useEffect(() => {
    try {
      if (stage === 'done') localStorage.removeItem(resumeKey(range))
      else localStorage.setItem(resumeKey(range), JSON.stringify({ idx, stage, rungIdx, listened, at: Date.now() } satisfies Saved))
    } catch { /* private mode */ }
  }, [idx, stage, rungIdx, listened, range])

  const words = wordsOfAyah(range.surah, ayah)
  const marker = snap.markers.find((m) => m.id === `${range.surah}:${ayah}`)
  const boundaries = useMemo(() => (marker ? marker.boundaries : suggestBoundaries(words).boundaries), [marker, words])
  const phrases = useMemo(() => buildPhrases(words, boundaries), [words, boundaries])
  const methodA = arm === 'A'

  // Build the ladder once when an ayah's flow starts: the normal chain, or a short repair ladder for joints that keep going wrong.
  const ladderKey = `${ayah}:${phrases.length}:${methodA}`
  useEffect(() => {
    if (stage !== 'flow' || !armReady || ladder?.key === ladderKey) return
    if (methodA) { setLadder({ key: ladderKey, rungs: [{ from: 0, to: Math.max(0, phrases.length - 1), kind: 'full', label: 'Repeat aloud' }], repair: false }); return }
    const troubled = troubledRungs(snap.flows, range.surah, ayah, phrases.length)
    if (troubled.length) setLadder({ key: ladderKey, rungs: buildRepairLadder(phrases, troubled), repair: true })
    else setLadder({ key: ladderKey, rungs: buildLadder(phrases), repair: false })
  }, [stage, armReady, ladderKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const rungs = ladder?.key === ladderKey ? ladder.rungs : buildLadder(phrases)
  const rung = rungs[Math.min(rungIdx, rungs.length - 1)]!
  const single = { surah: range.surah, start: ayah, end: ayah }
  // Very long ayahs: show only the phrases in play so the controls stay on screen.
  const focusOnly = !methodA && words.length > 28 && rung.kind !== 'full'

  const nextAyah = () => {
    setRepair(false); setListened(false); setHear(false); setRungIdx(0)
    if (idx < n - 1) { setIdx(idx + 1); setStage(methodA ? 'flow' : 'sound') }
    else if (hasConnect) setStage('connect')
    else setStage('done')
  }

  async function rate(r: FlowRating, s: { reps: number; durationMs: number }) {
    await logFlow({ surah: range.surah, ayah, fromPhrase: rung.from, toPhrase: rung.to, phraseCount: phrases.length, rating: r, reps: s.reps, durationMs: s.durationMs, listenedFirst: listened })
    if (r === 'tangled') { say('Slow it down: try the audio at 0.75×, then say it again'); return }
    if (rungIdx >= rungs.length - 1) setStage('recall')
    else setRungIdx(rungIdx + 1)
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
      <div className="mt-3 mb-5 px-4">{methodA ? <div className="text-center text-xs text-muted">Method A · repeated recitation</div> : <Stepper stage={stage} multi={hasConnect} />}</div>

      {stage === 'sound' && (
        <section className="enter px-4" data-testid="stage-sound">
          <div className="card px-4 py-6 text-center">
            <p className="arabic center" lang="ar" dir="rtl"><AyahWords surah={range.surah} ayah={ayah} /> <Medallion n={ayah} /></p>
            {snap.settings.translation && <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-2">{tr?.[ayah - 1] ?? ''}</p>}
          </div>
          <div className="mt-3"><AudioBar queue={[{ surah: range.surah, ayah }]} autoKey={`s-${ayah}`} onListened={() => setListened(true)} /></div>
          <p className="mt-3 text-center text-sm text-ink-2">{snap.settings.practiceMode === 'echo' ? 'Echo is on: listen, then say it in the pause.' : 'Listen first, with the text in front of you. Notice the sounds and where the voice rests.'}</p>
          <button className="btn btn-primary btn-lg mt-4 w-full" onClick={() => setStage('flow')} data-testid="to-flow">{listened ? 'Continue to flow' : 'Continue'} <Icon name="right" size={16} /></button>
          {!listened && <p className="mt-2 text-center text-xs text-muted">You haven’t played the recitation yet. That’s fine if you already know how it sounds.</p>}
        </section>
      )}

      {stage === 'flow' && (
        <section className="enter px-4" data-testid="stage-flow">
          <div className="mb-2 flex items-center justify-between text-sm">
            <div><span className="eyebrow">{ladder?.repair ? 'Repairing the tricky part' : methodA ? 'Method A' : phrases.length > 1 ? 'Chain' : 'Say it'}</span><div className="font-display text-lg">{rung.label}</div></div>
            <div className="tabular text-muted">{Math.min(rungIdx + 1, rungs.length)} of {rungs.length}</div>
          </div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((rungIdx + 1) / rungs.length) * 100}%` }} /></div>
          <RungPractice surah={range.surah} ayah={ayah} words={words} phrases={phrases} boundaries={boundaries} from={rung.from} to={rung.to}
            focusOnly={focusOnly} dimOthers={!methodA} resetKey={`${ayah}:${rungIdx}:${rung.label}`} onRate={rate} />
          <div className="mt-3 flex items-center justify-center gap-1">
            <button className="btn btn-ghost btn-sm" onClick={() => setHear((h) => !h)}><Icon name="headphones" size={15} />Hear it</button>
            {!methodA && <button className="btn btn-ghost btn-sm" onClick={() => setEdit(true)} data-testid="edit-phrases"><Icon name="scissors" size={15} />Phrases</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => setStage('recall')}>Skip to recall</button>
          </div>
          {hear && <div className="mt-2"><AudioBar queue={[{ surah: range.surah, ayah }]} autoKey={`f-${ayah}`} onListened={() => setListened(true)} /></div>}
          <p className="mt-3 text-center text-xs text-muted">Flow is about the mouth, memory is separate: this rating never changes your retention estimate.</p>
          <PhraseEditor open={edit} onClose={() => setEdit(false)} surah={range.surah} ayah={ayah} boundaries={boundaries} onSave={(b) => { void setMarker(range.surah, ayah, b); setLadder(null); setRungIdx(0); say('Phrases saved') }} />
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
            <div className="mt-4 grid gap-2"><button className="btn btn-primary" onClick={() => { setRepair(false); setRungIdx(0); setLadder(null); setStage(methodA ? 'flow' : 'sound') }} data-testid="back-to-flow">Back to sound and flow</button><button className="btn btn-quiet" onClick={nextAyah}>Move on for now</button></div>
          </div>
        </section>
      )}

      {stage === 'connect' && (
        <section className="enter" data-testid="stage-connect">
          <p className="mb-3 px-6 text-center text-sm text-ink-2">{leadIn > 0 ? `Now join it to what comes before: ${leadIn === 1 ? 'the previous ayah' : 'the two ayahs before'} and then the new ${n === 1 ? 'ayah' : 'ayahs'}, as one recitation.` : 'Now join them. Individual ayahs are not the same as a continuous passage; mark any transition that wobbles.'}</p>
          <RecallCard key="connect" range={connectRange} context={context} listenedFirst={listened} title={leadIn > 0 ? `Ayah ${connectRange.start} → ${connectRange.end}` : 'The whole passage'} onDone={() => setStage('done')} />
        </section>
      )}

      {stage === 'done' && (
        <section className="enter px-4" data-testid="stage-done">
          <div className="card p-6 text-center">
            <h2 className="font-display text-2xl">Well done</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">{rangeTitle(range)} is recorded. Hifz OS will schedule its first check soon, close enough to catch what fades and far enough to be a real test.</p>
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
