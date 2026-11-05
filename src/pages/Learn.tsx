import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ensureArm, useApp } from '@/app/store'
import { AyahWords, Medallion, Passage } from '@/components/Arabic'
import { AudioBar } from '@/components/AudioBar'
import { PhraseEditor } from '@/components/PhraseEditor'
import { HearThisPart, PhraseChips } from '@/components/PhraseAudio'
import { usePhraseTiming } from '@/lib/audio/usePhraseTiming'
import { reciterPauses } from '@/lib/audio/timings'
import { meaningBreakdown } from '@/lib/engine/breakdown'
import { phraseMeanings } from '@/lib/engine/meaning'
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
    <div className="mt-3 flex items-center justify-center gap-1.5" data-testid="part-dots" aria-label={current === null ? 'All parts learned' : `Part ${current + 1} of ${states.length}`}>
      {states.map((s, i) => (
        <span key={i} data-secured={s.secured ? '1' : '0'} data-current={i === current ? '1' : '0'} className={`grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[0.7rem] font-bold ${i === current ? 'bg-brass text-bg' : s.secured ? 'bg-accent-soft text-accent-strong' : 'bg-surface-2 text-muted'}`}>{String.fromCharCode(65 + (i % 26))}</span>
      ))}
    </div>
  )
}

const resumeKey = (r: Range) => `hifz.learn.v1.${r.surah}:${r.start}-${r.end}`
interface Saved { idx: number; stage: Stage; rungIdx: number; listened: boolean; at: number; part?: number | null }
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
  // After a slip in a recitation of the growing sequence: the joint to practise briefly, and a counter that gives the next recitation a fresh screen.
  const [fix, setFix] = useState<{ from: number; to: number } | null>(null)
  const [attempt, setAttempt] = useState(0)
  // "I know up to here": the last part the learner says they already have, to be tested from the start up to it.
  const [testTo, setTestTo] = useState<number | null>(null)
  const [picking, setPicking] = useState(false)
  const [info, setInfo] = useState(false)       // the one place that says where the parts come from and that they are not places to stop
  // Only a saved part-by-part position (a number) skips the entry step; a position saved before the part was chosen is not one.
  const entered = useRef<string | null>(null)
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
      else localStorage.setItem(resumeKey(range), JSON.stringify({ idx, stage, rungIdx, listened, at: Date.now(), part } satisfies Saved))
    } catch { /* private mode */ }
  }, [idx, stage, rungIdx, listened, range, part])

  const words = wordsOfAyah(range.surah, ayah)
  const marker = snap.markers.find((m) => m.id === `${range.surah}:${ayah}`)
  // Your own breaks win. Otherwise: stop signs, plus practice breaks inside any stretch too long to learn in one piece, preferring places
  // where the reciter really pauses when timings are available. These are for practice only, never rulings on where to stop.
  const auto = useMemo(() => meaningBreakdown(range.surah, ayah, words, pt.timing ? reciterPauses(pt.timing) : []), [range.surah, ayah, words, pt.timing])
  const boundaries = marker ? marker.boundaries : auto.boundaries
  const phrases = useMemo(() => buildPhrases(words, boundaries), [words, boundaries])
  const methodA = arm === 'A'

  // Long ayahs are learned part by part. Where the learner is comes from what they have recalled (events), never from a saved screen.
  const spans = useMemo(() => phrases.map((p) => ({ from: p.from, to: p.to })), [phrases])
  // An ayah already recalled successfully is not learned from scratch: it keeps the ordinary ladder (and its slip repair).
  const alreadyRecalled = derived.memory.get(ayahKey(range.surah, ayah))?.firstDemonstratedAt != null
  const partsAyah = !methodA && !alreadyRecalled && isPartsLayout(spans, !!marker && marker.boundaries.length > 0)
  const partEvents = derived.parts.get(ayahKey(range.surah, ayah))
  const prog = useMemo(() => (partsAyah ? partProgress(spans, partEvents ?? [], Date.now()) : null), [partsAyah, spans, partEvents])
  // The meaning of each phrase, verbatim from the translation the learner reads (when it can be matched with confidence). One setting (Show translation) controls it.
  const patchSettings = useApp((s) => s.patchSettings)
  const meanings = useMemo(() => (snap.settings.translation && tr?.[ayah - 1] ? phraseMeanings(range.surah, ayah, tr[ayah - 1]!, spans) : []), [snap.settings.translation, tr, range.surah, ayah, spans])
  const partsActive = partsAyah && part !== null
  const P = part ?? 0
  const stepR = useMemo(() => (partsActive ? stepRungs(P) : null), [partsActive, P])

  // Entering a long ayah: straight to the first part not yet secured (after a quick check of the parts already learned if it has been a while);
  // if every part is secured, straight to reciting the whole ayah.
  useEffect(() => {
    if (!armReady || pt.status === 'loading' || entered.current === `${ayah}`) return
    entered.current = `${ayah}`
    if (!partsAyah || !prog) { setPart(null); return }
    // A saved position is honoured only if it is still the part the evidence says is next (evidence may have moved on since it was saved).
    const sv = saved.current
    if (sv && sv.idx === idx && typeof sv.part === 'number' && sv.part === prog.next) return
    if (prog.allSecured) { setPart(null); setStage('recall'); return }
    setPart(prog.next)
    setStage(prog.refreshDue ? 'refresh' : 'sound')
    setRungIdx(0)
  }, [armReady, pt.status, ayah, idx, partsAyah, prog])

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
    setRepair(false); setListened(false); setHear(false); setRungIdx(0); setPart(null)
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

  const L = (i: number) => String.fromCharCode(65 + (i % 26))
  const lastPart = spans.length - 1
  /** The last step of a long ayah is reciting the whole ayah: the final part's join with everything before it IS the whole ayah. */
  const wholeRecall = !partsActive || P === lastPart
  const finishToday = () => { try { localStorage.removeItem(resumeKey(range)) } catch { /* private mode */ } say('Saved. You can pick up from here.'); onDone() }
  const spanWords = (a: number, b: number): [number, number] => [phrases[a]!.from, phrases[b]!.to]
  /**
   * The recitation of the growing sequence (A, then A → B, then A → B → C …) is how a part is tested. If it goes well the part is joined on.
   * If it slips, only the joint where it slipped is practised, briefly, and the learner goes straight back to reciting from the start:
   * nothing already learned is repeated.
   */
  async function afterSpan(e: import('@/lib/engine/types').PartEvent) {
    if (!isGood(e)) {
      let r = e.slipWord !== undefined ? slipRung(e.slipWord, phrases) : (P >= 1 ? { from: P - 1, to: P } : { from: 0, to: 0 })
      if (r.to > P) r = { from: Math.min(r.from, P), to: P }                       // never a part that has not been learned yet
      if (e.slipWord !== undefined) await logFlow({ surah: range.surah, ayah, fromPhrase: r.from, toPhrase: r.to, phraseCount: phrases.length, rating: 'tangled', reps: 0, durationMs: 0 })
      setFix(r); setRepair(true)
      return
    }
    setStage('partdone')
  }
  /** The check of what the learner already has (after a break, or after they said "I know up to here"). The evidence decides where to go next. */
  async function afterRefresh(e: import('@/lib/engine/types').PartEvent) {
    const claimed = testTo !== null
    if (!isGood(e) && e.slipWord !== undefined) {
      const r = slipRung(e.slipWord, phrases)
      await logFlow({ surah: range.surah, ayah, fromPhrase: r.from, toPhrase: r.to, phraseCount: phrases.length, rating: 'tangled', reps: 0, durationMs: 0 })
    }
    const after = partProgress(spans, [...(partEvents ?? []), e], Date.now())
    setTestTo(null); setPicking(false); setRungIdx(0)
    if (!isGood(e)) { const np = after.next ?? 0; setPart(np); say(`Let’s firm up part ${L(np)} first`); setStage('sound'); return }
    if (claimed) say('Good. Everything up to there is counted.')
    if (after.next === null) { setPart(null); setStage('recall'); return }          // every part is in: the whole ayah is what is left
    setPart(after.next); setStage('sound')
  }

  if (!armReady || pt.status === 'loading') return <div className="grid min-h-[60dvh] place-items-center text-muted">Preparing…</div>

  // One quiet way to learn an automatically phrased ayah whole (and back). The phrases themselves are never something the learner has to set.
  // A medium ayah (13-20 words) with three or more meaningful pieces keeps the ordinary ladder, but the learner can choose to learn it part by part with one tap.
  const offerParts = !methodA && !alreadyRecalled && !marker && !partsAyah && auto.boundaries.length >= 2 && words.length > 12 && isPartsLayout(buildPhrases(words, auto.boundaries).map((p) => ({ from: p.from, to: p.to })), true)
  const byPartsLink = offerParts ? <button className="btn btn-quiet mt-3 w-full" onClick={() => { entered.current = null; void setMarker(range.surah, ayah, auto.boundaries); setLadder(null); setRungIdx(0) }} data-testid="learn-by-parts"><Icon name="scissors" size={15} />Learn it part by part · {auto.boundaries.length + 1} parts</button> : null
  // Practice parts are scaffolding, never rulings on where to stop. Say where this ayah's breaks come from: the mushaf's own printed signs or a reviewed list, the learner's own breaks, or an automatic preparation that no qualified reader has reviewed yet.
  // A marker that equals the automatic breaks (saved by tapping "Learn it part by part") is not the learner's own: only a different one is.
  const ownBreaks = !!marker && marker.boundaries.join(',') !== auto.boundaries.join(',')
  const validated = !ownBreaks && auto.boundaries.length > 0 && auto.boundaries.every((b) => ['stop sign', 'stop sign and the translation', 'reviewed'].includes(auto.basis[b] ?? ''))
  const basisNote = ownBreaks ? 'Your own breaks' : validated ? 'Follows the mushaf’s printed signs or a reviewed list' : 'Prepared automatically, not yet reviewed'
  const wholeToggle = !methodA && auto.boundaries.length > 0 ? (
    boundaries.length > 0
      ? <div className="text-center"><button className="min-h-[44px] text-sm text-muted underline" onClick={() => { entered.current = null; void setMarker(range.surah, ayah, []); setLadder(null); setRungIdx(0) }} data-testid="learn-whole">Learn this ayah whole</button></div>
      : <div className="text-center"><button className="min-h-[44px] text-sm text-muted underline" onClick={() => { entered.current = null; void setMarker(range.surah, ayah, auto.boundaries); setLadder(null); setRungIdx(0) }} data-testid="learn-phrases">Learn it in phrases</button></div>
  ) : null

  return (
    <div className="mx-auto max-w-[680px]" data-testid="learn-flow" data-stage={stage} data-arm={arm ?? 'none'}>
      {embedded ? (
        n > 1 && stage !== 'connect' && stage !== 'done' && <div className="pt-3 text-center text-xs text-muted tabular">ayah {idx + 1} of {n}</div>
      ) : (
        <div className="safe-top flex items-center justify-between px-4 pt-3">
          <button className="btn btn-ghost btn-sm" onClick={onExit} aria-label="Leave"><Icon name="x" size={18} /></button>
          <div className="eyebrow text-center">{rangeTitle(range)}{n > 1 && stage !== 'connect' && stage !== 'done' && <span className="tabular normal-case tracking-normal"> · {idx + 1}/{n}</span>}</div>
          <span className="w-10" />
        </div>
      )}
      <div className="mt-2 mb-4 px-4">{methodA ? <div className="text-center text-xs text-muted">Method A · repeated recitation</div> : <Stepper stage={stage} multi={hasConnect} />}{partsActive && prog && stage !== 'done' && <PartDots states={prog.phrases} current={P} />}</div>

      {stage === 'sound' && (
        <section className="enter px-4" data-testid="stage-sound">
          <div className="card px-4 py-6 text-center" style={words.length <= 10 ? ({ '--arabic-scale': snap.settings.arabicScale * 1.2 } as React.CSSProperties) : undefined}>
            {partsActive ? (
              <>
                <p className="arabic center" lang="ar" dir="rtl"><AyahWords surah={range.surah} ayah={ayah} only={[0, phrases[P]!.to]} dimOutside={spanWords(P, P)} highlight={spanWords(P, P)} gaps={boundaries} /></p>
                <p className="mt-2 flex items-center justify-center gap-1 text-xs text-muted" data-testid="part-caption">Part {L(P)} · {phrases[P]!.words.length} words
                  <button className="tool !min-h-[36px] !min-w-[36px] !px-0" onClick={() => setInfo((v) => !v)} aria-expanded={info} aria-label="About these parts" title="About these parts" data-testid="part-info-toggle"><Icon name="info" size={15} /></button></p>
                {info && (
                  <div className="mx-auto mt-1 max-w-sm space-y-1 text-xs text-muted" data-testid="part-info">
                    <p data-testid="part-basis">{basisNote} · for learning, not places to stop</p>
                    {pt.status !== 'ready' && <p data-testid="no-phrase-audio">Audio for this part on its own isn’t available for this reciter, so the whole ayah plays. Listen for part {L(P)}.</p>}
                  </div>
                )}
                {/* The meaning helps the sound stick; it fades once the part has been recalled again after a break, so it never becomes the prompt. */}
                {meanings[P] && !prog?.phrases[P]?.heldOverBreak && (
                  <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-2" data-testid="part-meaning">{meanings[P]}{' '}
                    <button className="text-xs text-muted underline" onClick={() => void patchSettings({ translation: false })} data-testid="hide-meaning">hide</button></p>
                )}
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
              <AudioBar queue={[{ surah: range.surah, ayah }]} autoKey={`s-${ayah}`} onListened={() => setListened(true)} />
            </div>
          )}
          {wholeToggle}
          {byPartsLink}
          {!methodA && !partsActive && <PhraseChips surah={range.surah} ayah={ayah} phrases={phrases} />}
          <button className="btn btn-primary btn-lg mt-4 w-full" onClick={() => setStage('flow')} data-testid="to-flow">Continue <Icon name="right" size={16} /></button>
          {partsActive && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 text-sm text-muted">
              <button className="min-h-[44px] underline" onClick={() => setStage('recall')} data-testid="know-this-part">I know this part</button>
              {P < lastPart && <button className="min-h-[44px] underline" onClick={() => setPicking((v) => !v)} data-testid="know-up-to" aria-expanded={picking}>I know further</button>}
            </div>
          )}
          {partsActive && P < lastPart && (
            <div className="text-center">
              {picking && (
                <div className="mt-2" data-testid="know-up-to-picker">
                  <p className="mb-1 text-xs text-muted">The last part you are sure of:</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {spans.map((_, i) => i > P && (
                      <button key={i} className="chip" onClick={() => { setPicking(false); if (i === lastPart) { setPart(null); setStage('recall') } else { setTestTo(i); setStage('refresh') } }} data-testid={`know-to-${i}`}>{i === lastPart ? 'all of it' : `up to ${L(i)}`}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {stage === 'flow' && (
        <section className="enter px-4" data-testid="stage-flow">
          {(rungs.length > 1 || partsActive || ladder?.repair) && <div className="mb-3 flex items-baseline justify-between">
            <div className="font-display text-lg">{partsActive ? `Part ${rung.label}` : rung.label}{ladder?.repair && !partsActive ? <span className="ml-2 text-sm font-normal text-muted">tricky spot</span> : null}</div>
            {rungs.length > 1 && <div className="tabular text-sm text-muted">{Math.min(rungIdx + 1, rungs.length)}/{rungs.length}</div>}
          </div>}
          {rungs.length > 1 && <div className="mb-3 h-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((rungIdx + 1) / rungs.length) * 100}%` }} /></div>}
          <RungPractice surah={range.surah} ayah={ayah} words={words} phrases={phrases} boundaries={boundaries} from={rung.from} to={rung.to}
            focusOnly={focusOnly} dimOthers={!methodA} resetKey={`${ayah}:${rungIdx}:${rung.label}`} onRate={rate} />
          {partsActive && rung.from === rung.to && meanings[rung.from] && !prog?.phrases[rung.from]?.heldOverBreak && <p className="mt-2 text-center text-sm text-ink-2" data-testid="flow-meaning">{meanings[rung.from]}</p>}
          {!methodA && <HearThisPart surah={range.surah} ayah={ayah} phrases={phrases} from={rung.from} to={rung.to} />}
          <div className="mt-3 flex items-center justify-center gap-1">
            <button className="btn btn-ghost btn-sm" onClick={() => setHear((h) => !h)}><Icon name="headphones" size={15} />Hear it</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setStage('recall')}>Skip to recall</button>
          </div>
          {hear && <div className="mt-2"><AudioBar queue={[{ surah: range.surah, ayah }]} autoKey={`f-${ayah}`} onListened={() => setListened(true)} /></div>}
          {wholeToggle}
          {byPartsLink}
          {!methodA && (
            <details className="mt-2 text-center" data-testid="advanced"><summary className="cursor-pointer select-none text-xs text-muted" data-testid="advanced-toggle">Advanced</summary>
              <button className="btn btn-ghost btn-sm mt-1" onClick={() => setEdit(true)} data-testid="edit-phrases"><Icon name="scissors" size={15} />Adjust phrases</button></details>
          )}
          <PhraseEditor open={edit} onClose={() => setEdit(false)} surah={range.surah} ayah={ayah} boundaries={boundaries} onSave={(b) => { entered.current = null; void setMarker(range.surah, ayah, b); setLadder(null); setRungIdx(0); say('Phrases saved') }} />
        </section>
      )}

      {stage === 'refresh' && partsActive && prog && (
        <section className="enter" data-testid="stage-refresh">
          {(() => {
            const last = testTo ?? prog.reach - 1
            const label = last > 0 ? `${L(0)} → ${L(last)} from memory` : `Part ${L(0)} from memory`
            return (
              <>
                <p className="mb-3 px-6 text-center text-sm text-ink-2" data-testid="refresh-intro">{testTo !== null ? `Up to part ${L(testTo)}, from the start.` : `Welcome back. Say what you already have before adding part ${L(P)}.`}</p>
                <SpanRecall key={`refresh-${ayah}-${testTo}`} surah={range.surah} ayah={ayah} from={spanWords(0, last)[0]} to={spanWords(0, last)[1]} label={label} onDone={(e) => void afterRefresh(e)} />
                <div className="mt-3 text-center">
                  {testTo !== null
                    ? <button className="btn btn-ghost btn-sm" onClick={() => { setTestTo(null); setStage('sound') }} data-testid="claim-cancel">Never mind</button>
                    : <button className="btn btn-ghost btn-sm" onClick={finishToday} data-testid="finish-today">Not now: save and finish</button>}
                </div>
              </>
            )
          })()}
        </section>
      )}

      {stage === 'recall' && !repair && !wholeRecall && (
        <section className="enter" data-testid="stage-recall" data-recall-kind="part">
          <SpanRecall key={`p-${ayah}-${P}-${attempt}-${phrases[0]!.from}-${phrases[P]!.to}`} surah={range.surah} ayah={ayah}
            from={spanWords(0, P)[0]} to={spanWords(0, P)[1]} hintFrom={phrases[P]!.from} hintName={L(P)}
            label={P > 0 ? `${L(0)} → ${L(P)}, from the beginning` : `Part ${L(0)} from memory`} onDone={(e) => void afterSpan(e)} />
        </section>
      )}
      {stage === 'recall' && !repair && wholeRecall && (
        <section className="enter" data-testid="stage-recall" data-recall-kind="whole">
          <RecallCard key={`r-${ayah}`} range={single} context={context} listenedFirst={listened} hideTitle={n > 1 || partsActive} onDone={(e, info) => { if ((e.grade === 'prompted' || e.grade === 'failed') && !info?.repaired) setRepair(true); else nextAyah() }} />
        </section>
      )}
      {stage === 'recall' && repair && partsActive && !wholeRecall && fix && (
        <section className="enter px-4" data-testid="stage-repair" data-repair-kind="part">
          <div className="mb-3 text-center">
            <h2 className="font-display text-xl">Say {fix.from === fix.to ? `part ${L(fix.from)}` : `${L(fix.from)} → ${L(fix.to)}`} until it flows</h2>
          </div>
          <RungPractice surah={range.surah} ayah={ayah} words={words} phrases={phrases} boundaries={boundaries} from={fix.from} to={fix.to} focusOnly dimOthers resetKey={`fix-${ayah}-${fix.from}-${fix.to}-${attempt}`}
            onRate={async (rating, st) => {
              await logFlow({ surah: range.surah, ayah, fromPhrase: fix.from, toPhrase: fix.to, phraseCount: phrases.length, rating, reps: st.reps, durationMs: st.durationMs })
              if (rating === 'natural') { setRepair(false); setAttempt((x) => x + 1) }
            }} />
          <button className="btn btn-primary btn-lg mt-3 w-full" onClick={() => { setRepair(false); setAttempt((x) => x + 1) }} data-testid="recite-again">Recite from the start again</button>
          <button className="btn btn-ghost mt-2 w-full" onClick={finishToday} data-testid="finish-today">Save and finish for today</button>
        </section>
      )}
      {stage === 'recall' && repair && !(partsActive && !wholeRecall) && (
        <section className="enter px-4" data-testid="stage-repair">
          <div className="card p-6 text-center">
            <h2 className="font-display text-xl">One more round of flow</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">Not settled yet, which is normal. A little more sound and flow usually helps.</p>
            <div className="mt-4 grid gap-2"><button className="btn btn-primary" onClick={() => { setRepair(false); setRungIdx(0); setLadder(null); setPart(null); setStage(methodA ? 'flow' : 'sound') }} data-testid="back-to-flow">Back to sound and flow</button><button className="btn btn-quiet" onClick={nextAyah}>Move on for now</button></div>
          </div>
        </section>
      )}

      {stage === 'partdone' && partsActive && prog && (
        <section className="enter px-4" data-testid="stage-partdone">
          <div className="pt-8 text-center">
            <h2 className="font-display text-2xl">{P === 0 ? `Part ${L(0)} is in` : `${L(0)} → ${L(P)} is joined`}</h2>
            <div className="mt-6 grid gap-2">
              <button className="btn btn-primary btn-lg" onClick={() => { if (prog.next === null) { setPart(null); setStage('recall') } else { setPart(prog.next); setRungIdx(0); setStage('sound') } }} data-testid="next-part">{prog.next === null ? 'Recite the whole ayah' : `Next: part ${L(prog.next)}`}</button>
              <button className="btn btn-quiet" onClick={finishToday} data-testid="finish-today">Finish for today</button>
            </div>
          </div>
        </section>
      )}

      {stage === 'connect' && (
        <section className="enter" data-testid="stage-connect">
          <RecallCard key="connect" range={connectRange} context={context} listenedFirst={listened} title={leadIn > 0 ? `Ayah ${connectRange.start} → ${connectRange.end}` : 'The whole passage'} onDone={() => setStage('done')} />
        </section>
      )}

      {stage === 'done' && (
        <section className="enter px-4" data-testid="stage-done">
          <div className="pt-8 text-center">
            <h2 className="font-display text-2xl">Well done</h2>
            <p className="mt-1 text-sm text-muted">{rangeTitle(range)} is recorded.</p>
            <button className="btn btn-primary btn-lg mt-6 w-full" onClick={onDone} data-testid="learn-finish">Continue</button>
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
