import { useEffect, useMemo, useRef, useState } from 'react'
import { Coach } from './Coach'
import { AyahWords, Medallion, MedallionButton, type Cue } from './Arabic'
import { AudioBar } from './AudioBar'
import { RungPractice } from './RungPractice'
import { RecorderButton, RecorderPlayback, useSelfRecorder } from './SelfRecorder'
import { GradeGrid } from './GradeGrid'
import { Icon } from './Icon'
import { useApp } from '@/app/store'
import { rangeTitle } from '@/lib/format'
import { buildPhrases } from '@/lib/engine/phrases'
import { meaningBreakdown } from '@/lib/engine/breakdown'
import { usePhraseTiming } from '@/lib/audio/usePhraseTiming'
import { reciterPauses } from '@/lib/audio/timings'
import { slipRung } from '@/lib/engine/repair'
import type { FlowRating, Grade, IssueKind, PracticeContext, Range, ReviewEvent, StumbleKind, WordIssue } from '@/lib/engine/types'
import { ISSUE_CHOICES, ISSUE_LABEL, checkedAttempt, contradictsAccurate, mergeStumbles } from '@/lib/engine/check'
import { loadTranslation, surahInfo, wordsOfAyah } from '@/lib/quran/data'
import { leadInFor, type LeadIn } from '@/lib/engine/leadin'

const KINDS: StumbleKind[] = ['hesitated', 'prompted', 'wrong', 'blank']
const KIND_LABEL: Record<StumbleKind, string> = { hesitated: 'hesitated', prompted: 'needed a prompt', wrong: 'words wrong', blank: 'blank' }
const KIND_STYLE: Record<StumbleKind, string> = { hesitated: 'bg-amber-soft', prompted: 'bg-clay-soft', wrong: 'bg-clay-soft', blank: 'bg-clay-soft' }
/** Shorter words for the flag chips (the full wording is the accessible name). */
const ISSUE_SHORT: Record<IssueKind, string> = { slip: 'Marked', forgot: 'Forgot', wrong: 'Wrong word', pronunciation: 'Pronunciation' }

export interface RecallResult { event: ReviewEvent }

/** The run-up before a passage that is revised from memory: readable, never tested, never recorded. Quiet on purpose: the verse mark says which ayah it is. */
function LeadInBlock({ lead }: { lead: LeadIn }) {
  if (lead.kind === 'surah-start') {
    const s = surahInfo(lead.surah)
    return (
      <p className="mb-3 text-center text-sm text-muted" data-testid="lead-in" data-lead-kind="surah-start">
        <span className="sr-only">Run-up, not tested. </span>Surah {s.tr} <span lang="ar" dir="rtl" className="font-[family-name:var(--font-arabic)]">{s.ar}</span> begins here{lead.basmala ? ', after the Basmala' : ''}.
      </p>
    )
  }
  return (
    <div className="mb-2 border-b border-line/70 pb-3 text-center" data-testid="lead-in" data-lead-kind="ayah" data-lead-ayah={lead.ayah} role="group" aria-label={`Run-up: ayah ${lead.ayah}, not tested`}>
      <p className="arabic center opacity-60" lang="ar" dir="rtl" data-testid="lead-in-text">{lead.truncated ? '… ' : ''}<AyahWords surah={lead.surah} ayah={lead.ayah} only={[lead.from, lead.to]} />{'\u00a0'}<Medallion n={lead.ayah} /></p>
      <span className="sr-only">Run-up, not tested.</span>
    </div>
  )
}


/** Evidence level for a recall that used hints: how much of the ayah was shown before reciting. */
export function cueForHints(revealed: number, total: number, meaning: boolean): Cue {
  let cue: Cue = 4
  if (revealed > 0) { const f = revealed / total; cue = f <= 0.34 ? 3 : f <= 0.67 ? 2 : 1 }
  if (meaning) cue = Math.min(cue, 3) as Cue
  return cue
}
/** Next reveal: the first word, then three more words at a time. Never reveals text that is not in the canonical ayah. */
export const nextReveal = (current: number, total: number) => Math.min(total, current === 0 ? 1 : current + 3)

/**
 * Recite from memory, then check against the text. The text itself is the control: tap a concealed ayah to reveal it, tap its verse mark to hide it again,
 * tap a word of a revealed ayah to flag it. Recite the whole passage first and check afterwards, or check one ayah at a time.
 *
 * Revealing an ayah after reciting it is feedback, not a hint: only the first-word hint (before the attempt) makes a recall assisted. An ayah that was never
 * compared with the text, or that was read before it was recited, carries no recall evidence. Flagged words (forgot / wrong word or vowel / pronunciation or
 * tajweed) are practised at that exact spot and scheduled. The app never grades pronunciation or tajweed and never certifies a recitation.
 */
export function RecallCard({ range, context, listenedFirst, onDone, title, hideTitle, fixedCue }: {
  range: Range; context: PracticeContext; listenedFirst?: boolean; onDone: (e: ReviewEvent, info?: { repaired: boolean }) => void; title?: string; hideTitle?: boolean; fixedCue?: Cue
}) {
  const logReview = useApp((s) => s.logReview)
  const logFlow = useApp((s) => s.logFlow)
  // The same default phrases the learner practised, including where the reciter paused when timings exist.
  const pt = usePhraseTiming(range.surah, range.start)
  const pauses = pt.timing ? reciterPauses(pt.timing) : []
  const markers = useApp((s) => s.snap.markers)
  const n = range.end - range.start + 1
  const single = n === 1
  const total = single ? wordsOfAyah(range.surah, range.start).length : 0
  // Revision begins with a run-up: the ayah before the passage, shown, so the learner continues reciting instead of starting cold at an arbitrary number.
  // (First-time learning has its own flow, and a fixed-cue drill is a different exercise.)
  const lead = context !== 'new' && !fixedCue ? leadInFor(range.surah, range.start, (s, a) => wordsOfAyah(s, a).length) : null

  const [viewed, setViewed] = useState<Set<number>>(new Set())           // ayahs revealed at least once: the learner has started checking
  const [shown, setShown] = useState<Set<number>>(new Set())             // ayahs showing right now (a revealed ayah can be hidden again)
  const [readFirst, setReadFirst] = useState<Set<number>>(new Set())     // ayahs the learner read before reciting them: no recall evidence
  const [issues, setIssues] = useState<WordIssue[]>([])
  const [pick, setPick] = useState<{ ayah: number; word: number } | null>(null)
  const [hintWords, setHintWords] = useState(0)
  const [meaning, setMeaning] = useState(false)
  const [firstWords, setFirstWords] = useState(false)       // passages only
  const [hear, setHear] = useState(false)
  const [more, setMore] = useState(false)
  const [flags, setFlags] = useState<Map<number, StumbleKind>>(new Map())
  const [shaky, setShaky] = useState<Set<number>>(new Set())
  const [stopAt, setStopAt] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [repair, setRepair] = useState<{ event: ReviewEvent; items: { ayah: number; word: number; kind: IssueKind }[]; i: number } | null>(null)
  const [tr, setTr] = useState<string[] | null>(null)
  const rec = useSelfRecorder()
  const started = useRef(Date.now())
  const ayahs = useMemo(() => Array.from({ length: n }, (_, i) => range.start + i), [range.start, n])

  useEffect(() => { if (single && meaning && !tr) void loadTranslation().then((t) => setTr(t[range.surah - 1] ?? null)) }, [single, meaning, tr, range.surah])

  const revealed = viewed.size > 0
  const evidence = ayahs.filter((a) => viewed.has(a) && !readFirst.has(a))      // recited, then compared with the text
  const notCounted = ayahs.filter((a) => !evidence.includes(a))
  const usedHelp = single && (hintWords > 0 || meaning)
  const contradicts = contradictsAccurate(issues)
  const hintCue = single ? cueForHints(hintWords, total, meaning) : (firstWords ? 3 : 4) as Cue
  const eventCue: Cue = fixedCue ?? hintCue
  const cue: Cue = fixedCue ?? (firstWords ? 3 : 4)
  const blocked = (g: Grade) => (usedHelp && g === 'independent') || (single && contradicts && (g === 'independent' || g === 'hesitant'))

  const cycle = (a: number) => setFlags((m) => {
    const x = new Map(m)
    const cur = x.get(a)
    const next = cur === undefined ? KINDS[0] : KINDS[KINDS.indexOf(cur) + 1]
    if (next) x.set(a, next); else x.delete(a)
    return x
  })

  const checkAyah = (a: number) => { setViewed((v) => new Set(v).add(a)); setShown((v) => new Set(v).add(a)) }
  const hideAyah = (a: number) => { setShown((v) => { const x = new Set(v); x.delete(a); return x }); setPick((p) => (p?.ayah === a ? null : p)) }
  const showAll = () => { setViewed(new Set(ayahs)); setShown(new Set(ayahs)) }
  const hideAll = () => { setShown(new Set()); setPick(null) }
  const toggleReadFirst = (a: number) => setReadFirst((r) => { const x = new Set(r); x.has(a) ? x.delete(a) : x.add(a); return x })
  const issueAt = (a: number, w: number) => issues.find((i) => i.ayah === a && i.word === w)
  function tapWord(a: number, w: number) {
    if (!issueAt(a, w)) { setIssues((l) => [...l, { ayah: a, word: w, kind: 'slip' }]); setPick({ ayah: a, word: w }) }
    else setPick((p) => (p?.ayah === a && p.word === w ? null : { ayah: a, word: w }))
  }
  const setKind = (a: number, w: number, kind: IssueKind) => setIssues((l) => l.map((i) => (i.ayah === a && i.word === w ? { ...i, kind } : i)))
  const clearIssue = (a: number, w: number) => { setIssues((l) => l.filter((i) => !(i.ayah === a && i.word === w))); setPick(null) }

  const layoutFor = (ayah: number) => {
    const words = wordsOfAyah(range.surah, ayah)
    const m = markers.find((x) => x.id === `${range.surah}:${ayah}`)
    const boundaries = m ? m.boundaries : meaningBreakdown(range.surah, ayah, words, ayah === range.start ? pauses : []).boundaries
    return { words, boundaries, phrases: buildPhrases(words, boundaries) }
  }

  async function grade(g: Grade) {
    if (busy || !evidence.length || blocked(g)) return
    setBusy(true)
    // Only ayahs that were recited and then compared with the text carry evidence. All of them: the record is exactly what it always was.
    let evRange = range, checked: number[] | undefined, completedTo = stopAt ?? undefined
    if (evidence.length !== n) {
      const att = checkedAttempt(range, evidence, stopAt)!
      evRange = att.range; checked = att.checked; completedTo = att.completedTo
    }
    const e = await logReview({
      kind: 'recall', range: evRange, grade: g, context, cueLevel: eventCue,
      stumbles: mergeStumbles(flags, issues, single).filter((s) => s.ayah >= evRange.start && s.ayah <= evRange.end),
      shakyJunctions: [...shaky].filter((a) => a >= evRange.start && a < evRange.end).sort((a, b) => a - b),
      completedTo, checked, wordIssues: issues.length ? issues : undefined,
      durationMs: Math.min(Date.now() - started.current, 10 * 60_000), listenedFirst,
    })
    // Every flagged ayah is practised at its exact spot, and the slip is recorded as a tangled mark on that joint (practising it naturally clears it).
    const first = new Map<number, WordIssue>()
    for (const i of [...issues].sort((x, y) => x.ayah - y.ayah || x.word - y.word)) if (!first.has(i.ayah)) first.set(i.ayah, i)
    const items = [...first.values()].slice(0, 4).map((i) => ({ ayah: i.ayah, word: i.word, kind: i.kind }))
    for (const it of items) {
      const { phrases } = layoutFor(it.ayah)
      const r = slipRung(it.word, phrases)
      await logFlow({ surah: range.surah, ayah: it.ayah, fromPhrase: r.from, toPhrase: r.to, phraseCount: phrases.length, rating: 'tangled', reps: 0, durationMs: 0 })
    }
    if (items.length) { setRepair({ event: e, items, i: 0 }); setBusy(false); return }
    onDone(e)
  }

  if (repair) {
    const it = repair.items[repair.i]!
    const { words, boundaries, phrases } = layoutFor(it.ayah)
    const r = slipRung(it.word, phrases)
    const label = r.from === r.to ? (phrases.length === 1 ? 'the whole ayah' : `phrase ${String.fromCharCode(65 + r.from)}`) : `${String.fromCharCode(65 + r.from)} → ${String.fromCharCode(65 + r.to)}`
    const last = repair.i >= repair.items.length - 1
    const next = () => { if (last) onDone(repair.event, { repaired: true }); else setRepair({ ...repair, i: repair.i + 1 }) }
    return (
      <div className="px-4" data-testid="repair-panel" data-repair-ayah={it.ayah} data-repair-kind={it.kind}>
        <div className="mb-3 text-center">
          <h2 className="font-display text-xl">{n > 1 ? `Ayah ${it.ayah}: ` : ''}Practise {label}{repair.items.length > 1 ? <span className="ml-2 text-sm font-normal text-muted">{repair.i + 1} of {repair.items.length}</span> : null}</h2>
          {it.kind === 'pronunciation' && <p className="mt-1 text-sm text-ink-2" data-testid="repair-pronunciation">Listen, then say it until it flows. The app can’t hear pronunciation or tajweed: compare carefully, or ask a teacher.</p>}
        </div>
        {it.kind === 'pronunciation' && <div className="mb-3"><AudioBar queue={[{ surah: range.surah, ayah: it.ayah }]} autoKey={`repair-${range.surah}:${it.ayah}`} /></div>}
        <RungPractice key={`${it.ayah}-${repair.i}`} surah={range.surah} ayah={it.ayah} words={words} phrases={phrases} boundaries={boundaries} from={r.from} to={r.to} resetKey={`repair-${it.ayah}`} focusOnly={words.length > 28}
          onRate={async (rating: FlowRating, s) => {
            await logFlow({ surah: range.surah, ayah: it.ayah, fromPhrase: r.from, toPhrase: r.to, phraseCount: phrases.length, rating, reps: s.reps, durationMs: s.durationMs })
            if (rating === 'natural') next()
          }} />
        <button className="btn btn-ghost mt-3 w-full" onClick={() => onDone(repair.event, { repaired: true })} data-testid="repair-skip">Done for now</button>
      </div>
    )
  }

  const flaggedWords = (a: number) => issues.filter((i) => i.ayah === a).map((i) => i.word)
  const onKey = (fn: () => void) => (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() } }
  const pickedIssue = pick ? issueAt(pick.ayah, pick.word) : undefined
  // The reference plays the ayah you are flagging a word in, or else the whole passage.
  const hearAyahs = pick ? [pick.ayah] : ayahs
  const anyShown = shown.size > 0
  const headline = hideTitle ? null : <h2 className="mb-3 text-center text-sm font-semibold tracking-wide text-muted">{title ?? rangeTitle(range)}</h2>

  return (
    <div className="px-4" data-testid="recall-card">
      {headline}
      {lead && <LeadInBlock lead={lead} />}
      <div className="py-2" data-testid="recall-text">
        <p className="arabic" lang="ar" dir="rtl">
          {ayahs.map((a) => {
            const isShown = shown.has(a)
            return (
              <span key={a} data-testid={`ayah-row-${a}`} data-shown={isShown} data-counts={evidence.includes(a)}>
                <span className={`ayah${isShown ? '' : ' concealed'}`} data-ayah={a} data-testid={isShown ? undefined : `check-${a}`}
                  {...(isShown ? {} : { role: 'button', tabIndex: 0, 'aria-label': viewed.has(a) ? `Show ayah ${a} again` : `Reveal ayah ${a}`, onClick: () => checkAyah(a), onKeyDown: onKey(() => checkAyah(a)) })}>
                  <AyahWords surah={range.surah} ayah={a} cue={isShown ? 0 : cue} revealCount={single && !isShown ? hintWords : undefined}
                    onWord={isShown ? (w) => tapWord(a, w) : undefined} marked={flaggedWords(a)} />{'\u00a0'}
                  {isShown ? <MedallionButton n={a} onClick={() => hideAyah(a)} label={`Hide ayah ${a}`} testId={`hide-${a}`} /> : <Medallion n={a} />}
                </span>{' '}
              </span>
            )
          })}
        </p>
        {single && meaning && <p className="mt-3 text-center text-[0.95rem] leading-relaxed text-ink-2" data-testid="meaning-line">{tr ? tr[range.start - 1] : '…'}</p>}
      </div>

      {pickedIssue && (
        <div className="mb-1 flex flex-wrap items-center justify-center gap-1.5" role="group" aria-label={`What went wrong with word ${pickedIssue.word + 1} of ayah ${pickedIssue.ayah}`} data-testid="issue-picker">
          {ISSUE_CHOICES.map((k) => <button key={k} className="chip !min-h-[40px] !px-3" aria-pressed={pickedIssue.kind === k} aria-label={ISSUE_LABEL[k]} onClick={() => setKind(pickedIssue.ayah, pickedIssue.word, k)} data-testid={`issue-${k}`}>{ISSUE_SHORT[k]}</button>)}
          <button className="tool" onClick={() => clearIssue(pickedIssue.ayah, pickedIssue.word)} aria-label="Not a problem: clear the mark" title="Clear" data-testid="issue-clear"><Icon name="x" size={16} /></button>
        </div>
      )}

      {/* Everything secondary lives in one quiet row of small controls. */}
      <div className="mt-1 flex flex-wrap items-center justify-center gap-0.5" role="toolbar" aria-label="Recall tools">
        <button className="tool" onClick={anyShown ? hideAll : showAll} data-testid="reveal" aria-label={anyShown ? 'Hide the text again' : n > 1 ? 'Show all ayahs' : 'Show the text'} title={anyShown ? 'Hide' : n > 1 ? 'Show all' : 'Show text'}><Icon name={anyShown ? 'eyeoff' : 'eye'} size={19} /></button>
        {!revealed && single && !fixedCue && (
          <>
            <button className="tool" onClick={() => setHintWords((h) => nextReveal(h, total))} disabled={hintWords >= total} data-testid="hint" aria-label={hintWords === 0 ? 'Hint: first word' : 'Another hint'}>Hint</button>
            <button className="tool" aria-pressed={meaning} onClick={() => setMeaning((m) => !m)} data-testid="meaning" aria-label={meaning ? 'Hide meaning' : 'Show meaning'}>Meaning</button>
          </>
        )}
        {!revealed && !single && !fixedCue && <button className="tool" aria-pressed={firstWords} onClick={() => setFirstWords((h) => !h)} data-testid="first-words" aria-label="Show the first words of each ayah (a hint)">Hint</button>}
        {revealed && <button className="tool" aria-pressed={hear} onClick={() => setHear((h) => !h)} data-testid="hear-check" data-scope={hearAyahs.length === 1 ? hearAyahs[0] : 'all'} aria-label={hearAyahs.length === 1 && n > 1 ? `Hear the reference recording of ayah ${hearAyahs[0]}` : n > 1 ? 'Hear the reference recording of the passage' : 'Hear the reference recording'} title="Hear the reference"><Icon name="headphones" size={19} /></button>}
        <RecorderButton r={rec} />
        {revealed && n > 1 && <button className="tool" aria-pressed={more} aria-expanded={more} onClick={() => setMore((m) => !m)} data-testid="more-toggle" aria-label="More: slips, transitions, stopped early, read first" title="More"><Icon name="dots" size={19} /></button>}
      </div>
      <RecorderPlayback r={rec} />
      {!revealed && <Coach id="tap-hint" className="mt-2 text-center text-xs text-muted" full="Recite, then tap the text to check it." short="" />}
      {hear && <div className="mt-2"><AudioBar queue={hearAyahs.map((a) => ({ surah: range.surah, ayah: a }))} autoKey={`check-${range.surah}:${hearAyahs[0]}-${hearAyahs[hearAyahs.length - 1]}`} /></div>}

      {revealed && n > 1 && more && (
        <div className="mt-3 space-y-3 rounded-2xl bg-surface-2/60 px-3 py-3" data-testid="stumble-tools">
          <div>
            <div className="mb-1 text-xs text-muted">Where did you slip? Tap to change how.</div>
            <div className="flex flex-wrap gap-1.5">
              {ayahs.map((a) => { const k = flags.get(a); return <button key={a} className={`chip tabular !min-h-[40px] ${k ? KIND_STYLE[k] : ''}`} onClick={() => cycle(a)} aria-label={`Ayah ${a}: ${k ? KIND_LABEL[k] : 'fine'}`}>{a}{k && <span className="text-xs">· {KIND_LABEL[k]}</span>}</button> })}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted">Shaky transitions</div>
            <div className="flex flex-wrap gap-1.5">
              {ayahs.slice(0, -1).map((a) => <button key={a} className="chip tabular !min-h-[40px]" aria-pressed={shaky.has(a)} onClick={() => setShaky((s) => { const x = new Set(s); x.has(a) ? x.delete(a) : x.add(a); return x })}><Icon name="link" size={13} />{a}→{a + 1}</button>)}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted">Read before reciting (not counted as recall)</div>
            <div className="flex flex-wrap gap-1.5">
              {ayahs.map((a) => <button key={a} className="chip tabular !min-h-[40px]" aria-pressed={readFirst.has(a)} onClick={() => toggleReadFirst(a)} data-testid={`read-first-${a}`} aria-label={`Ayah ${a}: I read it before reciting`}>{a}</button>)}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={stopAt !== null} onChange={(e) => setStopAt(e.target.checked ? ayahs[ayahs.length - 1]! - 1 || ayahs[0]! : null)} />
            I stopped before the end
            {stopAt !== null && (
              <select className="ml-1 h-9 rounded-lg border border-line bg-bg px-2" value={stopAt} onChange={(e) => setStopAt(+e.target.value)} aria-label="Last ayah I reached">
                {ayahs.map((a) => <option key={a} value={a}>at ayah {a}</option>)}
              </select>
            )}
          </label>
        </div>
      )}

      {revealed && evidence.length > 0 && (
        <div className="mt-4" data-testid="grade-area">
          <GradeGrid onGrade={(g) => void grade(g)} busy={busy} blocked={blocked} />
          {(usedHelp || (single && contradicts) || (n > 1 && notCounted.length > 0)) && (
            <p className="mt-2 text-center text-xs text-muted" data-testid="grade-note">
              {usedHelp ? 'With a hint, “On my own” isn’t available.' : single && contradicts ? 'With a flagged word, “On my own” and “Hesitated” aren’t available.' : ''}
              {n > 1 && notCounted.length > 0 && <span data-testid="unchecked-note">{usedHelp || (single && contradicts) ? ' ' : ''}Ayah{notCounted.length > 1 ? 's' : ''} {notCounted.join(', ')} not checked, so not counted.</span>}
            </p>
          )}
        </div>
      )}
      {revealed && evidence.length === 0 && n > 1 && <p className="mt-3 text-center text-xs text-muted" data-testid="unchecked-note">Nothing to record yet: check an ayah you recited from memory.</p>}
    </div>
  )
}
