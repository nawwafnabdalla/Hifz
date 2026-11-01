import { Coach } from '@/components/Coach'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ensureArm, useApp } from '@/app/store'
import { Passage } from '@/components/Arabic'
import { AudioBar } from '@/components/AudioBar'
import { PhraseEditor } from '@/components/PhraseEditor'
import { RungPractice } from '@/components/RungPractice'
import { RampStep } from '@/components/RampStep'
import { RecallCard } from '@/components/RecallCard'
import { Icon } from '@/components/Icon'
import { buildPhrases, suggestBoundaries } from '@/lib/engine/phrases'
import { buildRamp, flowFor, rampFromRepair, type RampRung } from '@/lib/engine/ramp'
import { troubledRungs } from '@/lib/engine/repair'
import { ayahKey, type FlowRating, type PracticeContext, type Range, type Strategy } from '@/lib/engine/types'
import { isValidRef, loadTranslation, wordsOfAyah } from '@/lib/quran/data'
import { rangeTitle } from '@/lib/format'

// 'sound' only appears in positions saved by earlier versions; it is treated as 'flow'.
type Stage = 'sound' | 'flow' | 'recall' | 'connect' | 'done'

const resumeKey = (r: Range) => `hifz.learn.v1.${r.surah}:${r.start}-${r.end}`
interface Saved { idx: number; stage: Stage; rungIdx: number; listened: boolean; at: number }
function loadSaved(r: Range, n: number): Saved | null {
  try {
    const raw = localStorage.getItem(resumeKey(r))
    if (!raw) return null
    const s = JSON.parse(raw) as Saved
    if (s.stage === 'sound') s.stage = 'flow'
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
  const [stage, setStage] = useState<Stage>(saved.current?.stage ?? 'flow')
  const [listened, setListened] = useState(saved.current?.listened ?? false)
  const [rungIdx, setRungIdx] = useState(saved.current?.rungIdx ?? 0)
  const [ladder, setLadder] = useState<{ key: string; rungs: RampRung[]; repair: boolean } | null>(null)
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
    void ensureArm(range).then((a) => { setArm(a); setArmReady(true) })
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
    if (methodA) { setLadder({ key: ladderKey, rungs: [{ from: 0, to: Math.max(0, phrases.length - 1), newFrom: 0, kind: 'full', label: 'Repeat aloud' }], repair: false }); return }
    const troubled = troubledRungs(snap.flows, range.surah, ayah, phrases.length)
    if (troubled.length) setLadder({ key: ladderKey, rungs: rampFromRepair(phrases, troubled), repair: true })
    else setLadder({ key: ladderKey, rungs: buildRamp(phrases, words.length), repair: false })
  }, [stage, armReady, ladderKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const rungs = ladder?.key === ladderKey ? ladder.rungs : buildRamp(phrases, words.length)
  const rung = rungs[Math.min(rungIdx, rungs.length - 1)]!
  const single = { surah: range.surah, start: ayah, end: ayah }
  // Very long ayahs: show only the phrases in play so the controls stay on screen.
  const focusOnly = !methodA && words.length > 28 && rung.kind !== 'full'

  const nextAyah = () => {
    setRepair(false); setListened(false); setHear(false); setRungIdx(0)
    if (idx < n - 1) { setIdx(idx + 1); setStage('flow') }
    else if (hasConnect) setStage('connect')
    else setStage('done')
  }

  async function rate(r: FlowRating, s: { reps: number; durationMs: number }) {
    await logFlow({ surah: range.surah, ayah, fromPhrase: rung.from, toPhrase: rung.to, phraseCount: phrases.length, rating: r, reps: s.reps, durationMs: s.durationMs, listenedFirst: listened })
    if (r === 'tangled') { say('Slow it down: try the audio at 0.75×, then say it again'); return }
    if (rungIdx >= rungs.length - 1) setStage('recall')
    else setRungIdx(rungIdx + 1)
  }

  /** One tap per step. A peek is remembered as a tangle on the joint; a clean pass clears it. Neither touches the retention estimate. */
  async function rampDone(r: { peeked: boolean; durationMs: number }) {
    const f = flowFor(rung, r.peeked)
    await logFlow({ surah: range.surah, ayah, fromPhrase: f.fromPhrase, toPhrase: f.toPhrase, phraseCount: phrases.length, rating: f.rating, reps: 1, durationMs: r.durationMs, listenedFirst: listened })
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
      <div className="mb-4 mt-3 px-4">{methodA && <div className="text-center text-xs text-muted">Method A · repeated recitation</div>}</div>

      {stage === 'flow' && (
        <section className="enter px-4" data-testid="stage-flow">
          <div className="mb-2 flex items-center justify-between text-sm">
            <div><span className="eyebrow">{ladder?.repair ? 'Repairing the tricky part' : methodA ? 'Method A' : ''}</span><div className="font-display text-lg">{rung.label}</div></div>
            {rungs.length > 1 && <div className="tabular text-muted">{Math.min(rungIdx + 1, rungs.length)} of {rungs.length}</div>}
          </div>
          {rungs.length > 1 && <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((rungIdx + 1) / rungs.length) * 100}%` }} /></div>}
          {methodA ? (
            <RungPractice surah={range.surah} ayah={ayah} words={words} phrases={phrases} boundaries={boundaries} from={rung.from} to={rung.to}
              focusOnly={focusOnly} dimOthers={false} resetKey={`${ayah}:${rungIdx}:${rung.label}`} onRate={rate} />
          ) : (
            <>
              {snap.settings.translation && rungIdx === 0 && !focusOnly && <p className="mb-2 text-center text-[0.95rem] leading-relaxed text-ink-2">{tr?.[ayah - 1] ?? ''}</p>}
              <RampStep surah={range.surah} ayah={ayah} phrases={phrases} boundaries={boundaries} rung={rung} focusOnly={focusOnly} resetKey={`${ayah}:${rungIdx}:${rung.label}`} onDone={rampDone} arabicScale={snap.settings.arabicScale}
                above={(hear || rungIdx === 0) ? <AudioBar queue={[{ surah: range.surah, ayah }]} autoKey={`f-${ayah}-b`} onListened={() => setListened(true)} /> : undefined} />
            </>
          )}
          {methodA && hear && <div className="mt-2"><AudioBar queue={[{ surah: range.surah, ayah }]} autoKey={`f-${ayah}-a`} onListened={() => setListened(true)} /></div>}
          {!methodA && rungIdx === 0 && <Coach id="ramp-first" className="mt-3 text-center text-sm text-ink-2" full="Listen, say it aloud, then tap. The text will thin out as you go." short="Listen, say it, tap." />}
          <div className="mt-3 flex items-center justify-center gap-1">
            {!(hear || (!methodA && rungIdx === 0)) && <button className="btn btn-ghost btn-sm" onClick={() => setHear((h) => !h)} data-testid="hear-it"><Icon name="headphones" size={15} />Hear it</button>}
            {!methodA && <button className="btn btn-ghost btn-sm" onClick={() => setEdit(true)} data-testid="edit-phrases"><Icon name="scissors" size={15} />Phrases</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => setStage('recall')}>Skip to recall</button>
          </div>
          <PhraseEditor open={edit} onClose={() => setEdit(false)} surah={range.surah} ayah={ayah} boundaries={boundaries} onSave={(b) => { void setMarker(range.surah, ayah, b); setLadder(null); setRungIdx(0); say('Phrases saved') }} />
        </section>
      )}

      {stage === 'recall' && !repair && (
        <section className="enter" data-testid="stage-recall">
          <RecallCard key={`r-${ayah}`} range={single} context={context} listenedFirst={listened} title={`Ayah ${ayah} from memory`} onDone={(e, info) => { if ((e.grade === 'prompted' || e.grade === 'failed') && !info?.repaired) setRepair(true); else nextAyah() }} />
        </section>
      )}
      {stage === 'recall' && repair && (
        <section className="enter px-4" data-testid="stage-repair">
          <div className="card p-6 text-center">
            <h2 className="font-display text-xl">One more round of flow</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">Not settled yet, which is normal. A little more practice usually helps.</p>
            <div className="mt-4 grid gap-2"><button className="btn btn-primary" onClick={() => { setRepair(false); setRungIdx(0); setLadder(null); setStage('flow') }} data-testid="back-to-flow">Practise it again</button><button className="btn btn-quiet" onClick={nextAyah}>Move on for now</button></div>
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
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">{rangeTitle(range)} is recorded. Its first check is scheduled.</p>
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
