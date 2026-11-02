import { Coach } from '@/components/Coach'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ensureArm, useApp } from '@/app/store'
import { AyahWords, Medallion, Passage } from '@/components/Arabic'
import { AudioBar } from '@/components/AudioBar'
import { PhraseEditor } from '@/components/PhraseEditor'
import { HearThisPart, PhraseChips } from '@/components/PhraseAudio'
import { usePhraseTiming } from '@/lib/audio/usePhraseTiming'
import { reciterPauses } from '@/lib/audio/timings'
import { defaultBreakdown } from '@/lib/engine/breakdown'
import { RungPractice } from '@/components/RungPractice'
import { RecallCard } from '@/components/RecallCard'
import { SpanRecall } from '@/components/SpanRecall'
import { isGood, isPartsLayout, partProgress, stepRungs } from '@/lib/engine/parts'
import { Icon } from '@/components/Icon'
import { buildLadder, buildPhrases, type Rung } from '@/lib/engine/phrases'
import { buildRepairLadder, slipRung, troubledRungs } from '@/lib/engine/repair'
import { ayahKey, type FlowRating, type PracticeContext, type Range, type Strategy } from '@/lib/engine/types'
import { isValidRef, loadTranslation, wordsOfAyah } from '@/lib/quran/data'
import { rangeTitle } from '@/lib/format'

type Stage = 'sound' | 'flow' | 'recall' | 'connect' | 'done' | 'refresh' | 'partdone'
const STEPS: { id: 'sound' | 'flow' | 'recall' | 'connect'; label: string }[] = [
  { id: 'sound', label: 'Sound' }, { id: 'flow', label: 'Flow' }, { id: 'recall', label: 'Recall' }, { id: 'connect', label: 'Connect' },
]

function Stepper({ stage, multi }: { stage: Stage; multi: boolean }) {
  const steps = multi ? STEPS : STEPS.slice(0, 3)
  const shown = stage === 'refresh' ? 'sound' : stage === 'partdone' ? 'recall' : stage
  const cur = steps.findIndex((s) => s.id === shown)
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

/** Where you are in a long ayah: A B C D, the ones you have in already filled, the one in hand highlighted. */
function PartDots({ states, current }: { states: { secured: boolean }[]; current: number | null }) {
  return (
    <div className="mt-2 flex items-center justify-center gap-1.5" data-testid="part-dots" aria-label={current === null ? 'All parts learned' : `Part ${current + 1} of ${states.length}`}>
      {states.map((s, i) => (
        <span key={i} data-secured={s.secured ? '1' : '0'} data-current={i === current ? '1' : '0'} className={`grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[0.7rem] font-bold ${i === current ? 'bg-brass text-bg' : s.secured ? 'bg-accent-soft text-accent-strong' : 'bg-surface-2 text-muted'}`}>{String.fromCharCode(65 + (i % 26))}</span>
      ))}
      <span className="ml-1 text-xs text-muted tabular">{current === null ? 'whole ayah' : `part ${current + 1} of ${states.length}`}</span>
    </div>
  )
}

const resumeKey = (r: Range) => `hifz.learn.v1.${r.surah}:${r.start}-${r.end}`
interface Saved { idx: number; stage: Stage; rungIdx: number; listened: boolean; at: number; part?: number | null; sub?: 'part' | 'span' }
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
  // Part-by-part learning of a long ayah: the part in hand, and whether the recall in progress is of that part alone or of everything so far.
  const [part, setPart] = useState<number | null>(saved.current?.part ?? null)
  const [sub, setSub] = useState<'part' | 'span'>(saved.current?.sub ?? 'part')
  // Only a saved part-by-part position (a number) skips the entry step; a position saved before the part was chosen is not one.
  const entered = useRef<string | null>(saved.current && typeof saved.current.part === 'number' ? `${range.start + saved.current.idx}` : null)
  const [tr, setTr] = useState<string[] | null>(null)
  const ayah = range.start + idx
  // Word timings for the chosen reciter's recording of this ayah, if verified ones exist. They only ever add: nothing below depends on them.
  const pt = usePhraseTiming(range.surah, ayah)

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
      else localStorage.setItem(resumeKey(range), JSON.stringify({ idx, stage, rungIdx, listened, at: Date.now(), part, sub } satisfies Saved))
    } catch { /* private mode */ }
  }, [idx, stage, rungIdx, listened, range, part, sub])

  const words = wordsOfAyah(range.surah, ayah)
  const marker = snap.markers.find((m) => m.id === `${range.surah}:${ayah}`)
  // Your own breaks win. Otherwise: stop signs, plus practice breaks inside any stretch too long to learn in one piece, preferring places
  // where the reciter really pauses when timings are available. These are for practice only, never rulings on where to stop.
  const auto = useMemo(() => defaultBreakdown(range.surah, ayah, words, pt.timing ? reciterPauses(pt.timing) : []), [range.surah, ayah, words, pt.timing])
  const boundaries = marker ? marker.boundaries : auto.boundaries
  const phrases = useMemo(() => buildPhrases(words, boundaries), [words, boundaries])
  const methodA = arm === 'A'

  // Long ayahs are learned part by part. Where the learner is comes from what they have recalled (events), never from a saved screen.
  const spans = useMemo(() => phrases.map((p) => ({ from: p.from, to: p.to })), [phrases])
  // An ayah already recalled successfully is not learned from scratch: it keeps the ordinary ladder (and its slip repair).
  const alreadyRecalled = derived.memory.get(ayahKey(range.surah, ayah))?.firstDemonstratedAt != null
  const partsAyah = !methodA && !alreadyRecalled && isPartsLayout(spans)
  const partEvents = derived.parts.get(ayahKey(range.surah, ayah))
  const prog = useMemo(() => (partsAyah ? partProgress(spans, partEvents ?? [], Date.now()) : null), [partsAyah, spans, partEvents])
  const partsActive = partsAyah && part !== null
  const P = part ?? 0
  const stepR = useMemo(() => (partsActive ? stepRungs(P) : null), [partsActive, P])

  // Entering a long ayah: straight to the first part not yet secured (after a quick check of the parts already learned if it has been a while);
  // if every part is secured, straight to reciting the whole ayah.
  useEffect(() => {
    if (!armReady || pt.status === 'loading' || entered.current === `${ayah}`) return
    entered.current = `${ayah}`
    if (!partsAyah || !prog) { setPart(null); return }
    if (prog.allSecured) { setPart(null); setStage('recall'); return }
    setPart(prog.next)
    setSub('part')
    setStage(prog.refreshDue ? 'refresh' : 'sound')
    setRungIdx(0)
  }, [armReady, pt.status, ayah, partsAyah, prog])

  // Build the ladder once when an ayah's flow starts: the normal chain, or a short repair ladder for joints that keep going wrong.
  const ladderKey = `${ayah}:${phrases.length}:${methodA}`
  useEffect(() => {
    if (stage !== 'flow' || !armReady || partsActive || ladder?.key === ladderKey) return
    if (methodA) { setLadder({ key: ladderKey, rungs: [{ from: 0, to: Math.max(0, phrases.length - 1), kind: 'full', label: 'Repeat aloud' }], repair: false }); return }
    const troubled = troubledRungs(snap.flows, range.surah, ayah, phrases.length)
    if (troubled.length) setLadder({ key: ladderKey, rungs: buildRepairLadder(phrases, troubled), repair: true })
    else setLadder({ key: ladderKey, rungs: buildLadder(phrases), repair: false })
  }, [stage, armReady, ladderKey, partsActive]) // eslint-disable-line react-hooks/exhaustive-deps
  const rungs: Rung[] = stepR ? stepR.map((r) => ({ from: r.from, to: r.to, kind: r.kind, label: r.label })) : ladder?.key === ladderKey ? ladder.rungs : buildLadder(phrases)
  const rung = rungs[Math.min(rungIdx, rungs.length - 1)]!
  const single = { surah: range.surah, start: ayah, end: ayah }
  // Very long ayahs: show only the phrases in play so the controls stay on screen.
  const focusOnly = partsActive || (!methodA && words.length > 28 && rung.kind !== 'full')

  const nextAyah = () => {
    setRepair(false); setListened(false); setHear(false); setRungIdx(0); setPart(null); setSub('part')
    if (idx < n - 1) { setIdx(idx + 1); setStage(methodA ? 'flow' : 'sound') }
    else if (hasConnect) setStage('connect')
    else setStage('done')
  }

  async function rate(r: FlowRating, s: { reps: number; durationMs: number }) {
    await logFlow({ surah: range.surah, ayah, fromPhrase: rung.from, toPhrase: rung.to, phraseCount: phrases.length, rating: r, reps: s.reps, durationMs: s.durationMs, listenedFirst: listened })
    if (r === 'tangled') { say('Slow it down: try the audio at 0.75×, then say it again'); return }
    if (rungIdx >= rungs.length - 1) { setSub('part'); setStage('recall') }
    else setRungIdx(rungIdx + 1)
  }

  const L = (i: number) => String.fromCharCode(65 + (i % 26))
  const lastPart = spans.length - 1
  /** Reciting the whole ayah is the last step of a long ayah: the final part's join with everything before it IS the whole ayah. */
  const wholeRecall = !partsActive || (P === lastPart && sub === 'span')
  const finishToday = () => { try { localStorage.removeItem(resumeKey(range)) } catch { /* private mode */ } say('Saved. You can pick up from here.'); onDone() }
  const spanWords = (a: number, b: number): [number, number] => [phrases[a]!.from, phrases[b]!.to]
  async function afterSpan(e: import('@/lib/engine/types').PartEvent) {
    if (!isGood(e)) {
      // A slip is recorded on that exact joint, as after any recall; the part in hand becomes whichever phrase is now the first not secured.
      if (e.slipWord !== undefined) {
        const r = slipRung(e.slipWord, phrases)
        await logFlow({ surah: range.surah, ayah, fromPhrase: r.from, toPhrase: r.to, phraseCount: phrases.length, rating: 'tangled', reps: 0, durationMs: 0 })
      }
      const after = partProgress(spans, [...(partEvents ?? []), e], Date.now())
      setPart(after.next ?? P); setSub('part'); setRepair(true)
      return
    }
    if (sub === 'part' && P >= 1) { setSub('span'); return }
    setStage('partdone')
  }
  async function afterRefresh(e: import('@/lib/engine/types').PartEvent) {
    if (!isGood(e)) {
      if (e.slipWord !== undefined) {
        const r = slipRung(e.slipWord, phrases)
        await logFlow({ surah: range.surah, ayah, fromPhrase: r.from, toPhrase: r.to, phraseCount: phrases.length, rating: 'tangled', reps: 0, durationMs: 0 })
      }
      const after = partProgress(spans, [...(partEvents ?? []), e], Date.now())
      const np = after.next ?? 0
      setPart(np)
      say(`Let’s firm up part ${L(np)} first`)
    }
    setSub('part'); setRungIdx(0); setStage('sound')
  }

  if (!armReady || pt.status === 'loading') return <div className="grid min-h-[60dvh] place-items-center text-muted">Preparing…</div>

  // One quiet way to learn an automatically phrased ayah whole (and back). The phrases themselves are never something the learner has to set.
  const wholeToggle = !methodA && auto.boundaries.length > 0 ? (
    boundaries.length > 0
      ? <div className="mt-2 text-center"><button className="text-sm text-muted underline" onClick={() => { entered.current = null; void setMarker(range.surah, ayah, []); setLadder(null); setRungIdx(0) }} data-testid="learn-whole">Learn this ayah whole</button></div>
      : <div className="mt-2 text-center"><button className="text-sm text-muted underline" onClick={() => { entered.current = null; void setMarker(range.surah, ayah, auto.boundaries); setLadder(null); setRungIdx(0) }} data-testid="learn-phrases">Learn it in phrases</button></div>
  ) : null

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
      <div className="mt-3 mb-5 px-4">{methodA ? <div className="text-center text-xs text-muted">Method A · repeated recitation</div> : <Stepper stage={stage} multi={hasConnect} />}{partsActive && prog && stage !== 'done' && <PartDots states={prog.phrases} current={P} />}</div>

      {stage === 'sound' && (
        <section className="enter px-4" data-testid="stage-sound">
          <div className="card px-4 py-6 text-center" style={words.length <= 10 ? ({ '--arabic-scale': snap.settings.arabicScale * 1.2 } as React.CSSProperties) : undefined}>
            {partsActive ? (
              <>
                <p className="arabic center" lang="ar" dir="rtl"><AyahWords surah={range.surah} ayah={ayah} only={[0, phrases[P]!.to]} dimOutside={spanWords(P, P)} gaps={boundaries} /></p>
                <p className="mt-2 text-xs text-muted" data-testid="part-caption">Part {L(P)} · {phrases[P]!.words.length} words{P > 0 ? ' · earlier parts dimmed' : ''}</p>
              </>
            ) : (
              <>
                <p className="arabic center" lang="ar" dir="rtl"><AyahWords surah={range.surah} ayah={ayah} /> <Medallion n={ayah} /></p>
                {snap.settings.translation && <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-2">{tr?.[ayah - 1] ?? ''}</p>}
              </>
            )}
          </div>
          {partsActive && pt.status === 'ready' && <HearThisPart surah={range.surah} ayah={ayah} phrases={phrases} from={P} to={P} />}
          {(!partsActive || pt.status !== 'ready') && (
            <div className="mt-3">
              {partsActive && <p className="mb-1 text-center text-xs text-muted" data-testid="no-phrase-audio">Audio for this part on its own isn’t available for this reciter, so the whole ayah plays. Listen for part {L(P)}.</p>}
              <AudioBar queue={[{ surah: range.surah, ayah }]} autoKey={`s-${ayah}`} onListened={() => setListened(true)} />
            </div>
          )}
          {wholeToggle}
          {!methodA && !partsActive && <PhraseChips surah={range.surah} ayah={ayah} phrases={phrases} />}
          {snap.settings.practiceMode === 'echo'
            ? <Coach id="sound-echo" className="mt-3 text-center text-sm text-ink-2" full="Echo is on: listen, then say it in the pause." short="Listen, then say it." />
            : <Coach id="sound-listen" className="mt-3 text-center text-sm text-ink-2" full="Listen first, with the text in front of you. Notice the sounds and where the voice rests." short="Listen with the text." />}
          <button className="btn btn-primary btn-lg mt-4 w-full" onClick={() => setStage('flow')} data-testid="to-flow">{listened ? 'Continue to flow' : 'Continue'} <Icon name="right" size={16} /></button>
          {partsActive && <button className="btn btn-ghost mt-2 w-full" onClick={() => { setSub('part'); setStage('recall') }} data-testid="know-this-part">I know this part already: test me</button>}
        </section>
      )}

      {stage === 'flow' && (
        <section className="enter px-4" data-testid="stage-flow">
          <div className="mb-2 flex items-center justify-between text-sm">
            <div><span className="eyebrow">{partsActive ? `Part ${L(P)}` : ladder?.repair ? 'Repairing the tricky part' : methodA ? 'Method A' : phrases.length > 1 ? 'Chain' : 'Say it'}</span><div className="font-display text-lg">{rung.label}</div></div>
            <div className="tabular text-muted">{Math.min(rungIdx + 1, rungs.length)} of {rungs.length}</div>
          </div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((rungIdx + 1) / rungs.length) * 100}%` }} /></div>
          <RungPractice surah={range.surah} ayah={ayah} words={words} phrases={phrases} boundaries={boundaries} from={rung.from} to={rung.to}
            focusOnly={focusOnly} dimOthers={!methodA} resetKey={`${ayah}:${rungIdx}:${rung.label}`} onRate={rate} />
          {!methodA && <HearThisPart surah={range.surah} ayah={ayah} phrases={phrases} from={rung.from} to={rung.to} />}
          <div className="mt-3 flex items-center justify-center gap-1">
            <button className="btn btn-ghost btn-sm" onClick={() => setHear((h) => !h)}><Icon name="headphones" size={15} />Hear it</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSub('part'); setStage('recall') }}>Skip to recall</button>
          </div>
          {hear && <div className="mt-2"><AudioBar queue={[{ surah: range.surah, ayah }]} autoKey={`f-${ayah}`} onListened={() => setListened(true)} /></div>}
          <Coach id="flow-note" className="mt-3 text-center text-xs text-muted" full="Flow is about the mouth, memory is separate: this rating never changes your retention estimate." />
          {wholeToggle}
          {!methodA && (
            <details className="mt-2 text-center" data-testid="advanced"><summary className="cursor-pointer select-none text-xs text-muted" data-testid="advanced-toggle">Advanced</summary>
              <button className="btn btn-ghost btn-sm mt-1" onClick={() => setEdit(true)} data-testid="edit-phrases"><Icon name="scissors" size={15} />Adjust phrases</button></details>
          )}
          <PhraseEditor open={edit} onClose={() => setEdit(false)} surah={range.surah} ayah={ayah} boundaries={boundaries} onSave={(b) => { entered.current = null; void setMarker(range.surah, ayah, b); setLadder(null); setRungIdx(0); say('Phrases saved') }} />
        </section>
      )}

      {stage === 'refresh' && partsActive && prog && (
        <section className="enter" data-testid="stage-refresh">
          <p className="mb-3 px-6 text-center text-sm text-ink-2">Welcome back. Before adding part {L(P)}, say what you already have{prog.reach > 1 ? ` (${L(0)}–${L(prog.reach - 1)})` : ''}.</p>
          <SpanRecall key={`refresh-${ayah}`} surah={range.surah} ayah={ayah} from={spanWords(0, prog.reach - 1)[0]} to={spanWords(0, prog.reach - 1)[1]} label={prog.reach > 1 ? `Parts ${L(0)}–${L(prog.reach - 1)} from memory` : `Part ${L(0)} from memory`} onDone={(e) => void afterRefresh(e)} />
          <div className="mt-3 text-center"><button className="btn btn-ghost btn-sm" onClick={finishToday} data-testid="finish-today">Not now: save and finish</button></div>
        </section>
      )}

      {stage === 'recall' && !repair && !wholeRecall && (
        <section className="enter" data-testid="stage-recall" data-recall-kind="part">
          <SpanRecall key={`p-${ayah}-${P}-${sub}`} surah={range.surah} ayah={ayah}
            from={sub === 'span' ? spanWords(0, P)[0] : spanWords(P, P)[0]} to={spanWords(P, P)[1]}
            label={sub === 'span' ? `${P > 0 ? `${L(0)} → ${L(P)}` : L(0)} from memory` : `Part ${L(P)} from memory`} onDone={(e) => void afterSpan(e)} />
        </section>
      )}
      {stage === 'recall' && !repair && wholeRecall && (
        <section className="enter" data-testid="stage-recall" data-recall-kind="whole">
          {partsActive && <p className="mb-3 px-6 text-center text-sm text-ink-2">Every part is in. Now the whole ayah, as one recitation.</p>}
          <RecallCard key={`r-${ayah}`} range={single} context={context} listenedFirst={listened} title={`Ayah ${ayah} from memory`} onDone={(e, info) => { if ((e.grade === 'prompted' || e.grade === 'failed') && !info?.repaired) setRepair(true); else nextAyah() }} />
        </section>
      )}
      {stage === 'recall' && repair && partsActive && !wholeRecall && (
        <section className="enter px-4" data-testid="stage-repair" data-repair-kind="part">
          <div className="card p-6 text-center">
            <h2 className="font-display text-xl">Let’s go over part {L(P)} again</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">Not settled yet, which is normal. Nothing is lost: the parts that went well stay learned.</p>
            <div className="mt-4 grid gap-2"><button className="btn btn-primary" onClick={() => { setRepair(false); setRungIdx(0); setStage('flow') }} data-testid="back-to-flow">Practise it again</button><button className="btn btn-quiet" onClick={finishToday} data-testid="finish-today">Save and finish for today</button></div>
          </div>
        </section>
      )}
      {stage === 'recall' && repair && !(partsActive && !wholeRecall) && (
        <section className="enter px-4" data-testid="stage-repair">
          <div className="card p-6 text-center">
            <h2 className="font-display text-xl">One more round of flow</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">Not settled yet, which is normal. A little more sound and flow usually helps.</p>
            <div className="mt-4 grid gap-2"><button className="btn btn-primary" onClick={() => { setRepair(false); setRungIdx(0); setLadder(null); setPart(null); setSub('part'); setStage(methodA ? 'flow' : 'sound') }} data-testid="back-to-flow">Back to sound and flow</button><button className="btn btn-quiet" onClick={nextAyah}>Move on for now</button></div>
          </div>
        </section>
      )}

      {stage === 'partdone' && partsActive && prog && (
        <section className="enter px-4" data-testid="stage-partdone">
          <div className="card p-6 text-center">
            <h2 className="font-display text-xl">{P === 0 ? `Part ${L(0)} is in` : `${L(0)} → ${L(P)} is joined`}</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">{prog.next === null ? 'Every part is learned.' : `Next is part ${L(prog.next)}. You can stop here: it is all saved, and you will pick up from here.`}</p>
            <div className="mt-4 grid gap-2">
              <button className="btn btn-primary btn-lg" onClick={() => { if (prog.next === null) { setPart(null); setStage('recall') } else { setPart(prog.next); setSub('part'); setRungIdx(0); setStage('sound') } }} data-testid="next-part">{prog.next === null ? 'Recite the whole ayah' : `Next: part ${L(prog.next)}`}</button>
              <button className="btn btn-quiet" onClick={finishToday} data-testid="finish-today">Finish for today</button>
            </div>
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
