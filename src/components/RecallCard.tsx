import { Coach } from './Coach'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AyahWords, Medallion, type Cue } from './Arabic'
import { AudioBar } from './AudioBar'
import { RungPractice } from './RungPractice'
import { SelfRecorder } from './SelfRecorder'
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

const GRADES: { g: Grade; title: string; sub: string; cls: string }[] = [
  { g: 'independent', title: 'On my own', sub: 'Matched the text, no help', cls: 'btn-primary' },
  { g: 'hesitant', title: 'Hesitated', sub: 'Accurate, but unsure', cls: 'btn-quiet' },
  { g: 'prompted', title: 'Needed a prompt', sub: 'Partly right', cls: 'btn-quiet' },
  { g: 'failed', title: 'Couldn’t recall', sub: 'Not yet', cls: 'btn-quiet' },
]

export interface RecallResult { event: ReviewEvent }

/** The run-up before a passage that is revised from memory: readable, never tested, never recorded. */
function LeadInBlock({ lead }: { lead: LeadIn }) {
  if (lead.kind === 'surah-start') {
    const s = surahInfo(lead.surah)
    return (
      <div className="mb-3 rounded-2xl bg-surface-2/60 px-4 py-3 text-center" data-testid="lead-in" data-lead-kind="surah-start">
        <div className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted">Run-up</div>
        <p className="mt-1 text-ink-2">Surah {s.tr} <span lang="ar" dir="rtl" className="font-[family-name:var(--font-arabic)]">{s.ar}</span> begins here{lead.basmala ? ', after the Basmala' : ''}.</p>
      </div>
    )
  }
  return (
    <div className="mb-3 rounded-2xl bg-surface-2/60 px-4 py-3 text-center" data-testid="lead-in" data-lead-kind="ayah" data-lead-ayah={lead.ayah}>
      <div className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted">Run-up · ayah {lead.ayah}</div>
      <p className="arabic center mt-1 opacity-90" lang="ar" dir="rtl" data-testid="lead-in-text">{lead.truncated ? '… ' : ''}<AyahWords surah={lead.surah} ayah={lead.ayah} only={[lead.from, lead.to]} /> <Medallion n={lead.ayah} /></p>
      <Coach id="lead-in" className="mt-1 text-xs text-muted" full={`Read it to get into the rhythm, then continue from memory. It isn’t tested${lead.truncated ? ' (just its last words)' : ''}.`} short="Not tested: just the run-up." />
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
 * Recite from memory, then check against the text, and grade with one tap.
 *
 * Checking is ayah by ayah: each ayah of a passage has its own "Check" button, so one ayah can be compared without revealing the rest, and a revealed ayah can
 * be hidden again. Reciting several ayahs in one go and checking them afterwards works too ("Show all"). Revealing an ayah after reciting it is feedback, not a hint:
 * only the first-word hint (before the attempt) makes a recall assisted. An ayah that was never compared with the text, or that was read before it was recited,
 * carries no recall evidence. While checking, tap any word that was wrong and say what happened (forgot it / wrong word or vowel / pronunciation or tajweed): the app
 * practises that exact spot with you and schedules it. It never grades pronunciation or tajweed and never certifies a recitation.
 */
export function RecallCard({ range, context, listenedFirst, onDone, title, fixedCue }: {
  range: Range; context: PracticeContext; listenedFirst?: boolean; onDone: (e: ReviewEvent, info?: { repaired: boolean }) => void; title?: string; fixedCue?: Cue
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
  const [hearAyah, setHearAyah] = useState<number | null>(null)
  const [hintWords, setHintWords] = useState(0)
  const [meaning, setMeaning] = useState(false)
  const [firstWords, setFirstWords] = useState(false)       // passages only
  const [hear, setHear] = useState(false)
  const [flags, setFlags] = useState<Map<number, StumbleKind>>(new Map())
  const [shaky, setShaky] = useState<Set<number>>(new Set())
  const [stopAt, setStopAt] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [repair, setRepair] = useState<{ event: ReviewEvent; items: { ayah: number; word: number; kind: IssueKind }[]; i: number } | null>(null)
  const [tr, setTr] = useState<string[] | null>(null)
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
    if (busy || !evidence.length) return
    if (usedHelp && g === 'independent') return          // a hinted recall can never be claimed as unaided
    if (single && contradicts && (g === 'independent' || g === 'hesitant')) return   // a forgotten or wrong word contradicts "accurate"
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
        <div className="mb-3 text-center"><div className="eyebrow">Repair the exact spot{repair.items.length > 1 ? ` · ${repair.i + 1} of ${repair.items.length}` : ''}</div>
          <h2 className="font-display mt-1 text-xl">{n > 1 ? `Ayah ${it.ayah}: ` : ''}Practise {label}</h2>
          {it.kind === 'pronunciation'
            ? <p className="mt-1 text-sm text-ink-2" data-testid="repair-pronunciation">Listen to the reference, then say just this part until it flows. The app can’t hear pronunciation or tajweed: compare carefully, or ask a teacher.</p>
            : <Coach id="repair-intro" className="mt-1 text-sm text-ink-2" full="Say just this part until it flows. The rest of the ayah is already in your history." short="Say just this part until it flows." />}</div>
        {it.kind === 'pronunciation' && <div className="mb-3"><AudioBar queue={[{ surah: range.surah, ayah: it.ayah }]} autoKey={`repair-${range.surah}:${it.ayah}`} /></div>}
        <RungPractice key={`${it.ayah}-${repair.i}`} surah={range.surah} ayah={it.ayah} words={words} phrases={phrases} boundaries={boundaries} from={r.from} to={r.to} resetKey={`repair-${it.ayah}`} focusOnly={words.length > 28}
          onRate={async (rating: FlowRating, s) => {
            await logFlow({ surah: range.surah, ayah: it.ayah, fromPhrase: r.from, toPhrase: r.to, phraseCount: phrases.length, rating, reps: s.reps, durationMs: s.durationMs })
            if (rating === 'natural') next()
          }} />
        <button className="btn btn-ghost mt-3 w-full" onClick={() => onDone(repair.event, { repaired: true })} data-testid="repair-skip">Done for now</button>
        <Coach id="repair-outro" className="mt-2 text-center text-xs text-muted" full="Until it feels natural it stays marked as tricky and is practised first next time." />
      </div>
    )
  }

  const eyebrow = !revealed ? 'From memory' : n > 1 && notCounted.length ? 'Checking' : 'How was that?'
  return (
    <div className="px-4" data-testid="recall-card">
      <div className="mb-3 text-center">
        <div className="eyebrow">{eyebrow}</div>
        <h2 className="font-display mt-1 text-xl">{title ?? rangeTitle(range)}</h2>
        {!revealed && (n > 1
          ? <Coach id="recall-intro-multi" className="mt-1 text-sm text-ink-2" full={`Recite aloud, all ${n} ayahs in order. Then check them one at a time, or show them all.`} short="Recite, then check ayah by ayah." />
          : <Coach id="recall-intro" className="mt-1 text-sm text-ink-2" full="Recite aloud, then show the text to check." short="" />)}
      </div>

      {lead && <LeadInBlock lead={lead} />}
      <div className="card px-4 py-5" data-testid="recall-text">
        <div className={n > 1 ? 'divide-y divide-line' : ''}>
          {ayahs.map((a) => {
            const isShown = shown.has(a)
            const mine = issues.filter((i) => i.ayah === a)
            const cur = pick && pick.ayah === a ? issueAt(a, pick.word) : undefined
            return (
              <section key={a} role="group" aria-label={`Ayah ${a}`} className={n > 1 ? 'py-3 first:pt-0 last:pb-0' : ''} data-testid={`ayah-row-${a}`} data-shown={isShown} data-counts={evidence.includes(a)}>
                <p className="arabic" lang="ar" dir="rtl">
                  <span className="ayah" data-ayah={a}>
                    <AyahWords surah={range.surah} ayah={a} cue={isShown ? 0 : cue} revealCount={single && !isShown ? hintWords : undefined}
                      onWord={isShown ? (w) => tapWord(a, w) : undefined} marked={mine.map((i) => i.word)} />{' '}<Medallion n={a} />
                  </span>
                </p>
                {!isShown && (n > 1 || viewed.has(a)) && (
                  <div className="mt-2 text-center">
                    <button className="btn btn-quiet" onClick={() => checkAyah(a)} data-testid={`check-${a}`} aria-label={viewed.has(a) ? (n > 1 ? `Show ayah ${a} again` : 'Show the text again') : `Check ayah ${a}`}>
                      <Icon name="eye" size={15} />{viewed.has(a) ? (n > 1 ? `Show ayah ${a} again` : 'Show text again') : `Check ayah ${a}`}
                    </button>
                  </div>
                )}
                {isShown && (
                  <div className="mt-2 space-y-2" data-testid={`tools-${a}`}>
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      <button className="chip !min-h-[40px]" onClick={() => hideAyah(a)} data-testid={`hide-${a}`} aria-label={`Hide ayah ${a} again`}><Icon name="eyeoff" size={14} />Hide</button>
                      <button className="chip !min-h-[40px]" aria-pressed={hearAyah === a} onClick={() => setHearAyah((h) => (h === a ? null : a))} data-testid={`hear-${a}`} aria-label={`Hear the reference recording of ayah ${a}`}><Icon name="headphones" size={14} />Hear reference</button>
                      {n > 1 && <button className="chip !min-h-[40px]" aria-pressed={readFirst.has(a)} onClick={() => toggleReadFirst(a)} data-testid={`read-first-${a}`}>I read it before reciting</button>}
                    </div>
                    {readFirst.has(a) && <p className="text-center text-xs text-muted" data-testid={`read-first-note-${a}`}>Not counted as recall: you saw it first. It still helps you learn it.</p>}
                    {hearAyah === a && <AudioBar queue={[{ surah: range.surah, ayah: a }]} autoKey={`check-${range.surah}:${a}`} />}
                    {cur && (
                      <div className="rounded-2xl bg-surface-2/70 px-3 py-2.5" role="group" aria-label={`What went wrong with word ${cur.word + 1} of ayah ${a}`} data-testid="issue-picker">
                        <div className="text-center text-xs font-semibold text-ink-2">Word {cur.word + 1}: what happened?</div>
                        <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
                          {ISSUE_CHOICES.map((k) => <button key={k} className="chip !min-h-[40px]" aria-pressed={cur.kind === k} onClick={() => setKind(a, cur.word, k)} data-testid={`issue-${k}`}>{ISSUE_LABEL[k]}</button>)}
                          <button className="chip !min-h-[40px]" onClick={() => clearIssue(a, cur.word)} data-testid="issue-clear">Not a problem</button>
                        </div>
                        {cur.kind === 'pronunciation' && <p className="mt-1.5 text-center text-xs text-muted">The app can’t hear this. Compare with the reference recording, or ask a teacher.</p>}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
        {single && meaning && <p className="mt-3 border-t border-line pt-3 text-center text-[0.95rem] leading-relaxed text-ink-2" data-testid="meaning-line">{tr ? tr[range.start - 1] : '…'}</p>}
        {revealed && <Coach id="verify-tip" className="mt-3 text-center text-xs text-muted" full="Fluent isn’t the same as exact. Read each word against what you said: letters, vowels, endings. Tap any word you got wrong." short="Check every word, not just the flow." />}
        {revealed && n > 1 && (
          <div className="mt-3 space-y-3 border-t border-line pt-3" data-testid="stumble-tools">
            <Coach id="stumble-tip" className="text-xs text-muted" full="Optional: tap an ayah where you slipped. Tap again to change how." short="Tap an ayah where you slipped." />
            <div className="flex flex-wrap gap-1.5">
              {ayahs.map((a) => { const k = flags.get(a); return <button key={a} className={`chip tabular ${k ? KIND_STYLE[k] : ''}`} onClick={() => cycle(a)} aria-label={`Ayah ${a}: ${k ? KIND_LABEL[k] : 'fine'}`}>{a}{k && <span className="text-xs">· {KIND_LABEL[k]}</span>}</button> })}
            </div>
            <div>
              <div className="mb-1 text-xs text-muted">Any shaky transitions?</div>
              <div className="flex flex-wrap gap-1.5">
                {ayahs.slice(0, -1).map((a) => <button key={a} className="chip tabular" aria-pressed={shaky.has(a)} onClick={() => setShaky((s) => { const x = new Set(s); x.has(a) ? x.delete(a) : x.add(a); return x })}><Icon name="link" size={13} />{a}→{a + 1}</button>)}
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
        <SelfRecorder />
      </div>

      {!revealed ? (
        <div className="mt-4 space-y-2">
          <button className="btn btn-primary btn-lg w-full" onClick={showAll} data-testid="reveal"><Icon name="eye" size={18} /> {n > 1 ? 'Show all ayahs' : 'Show text'}</button>
          {single && !fixedCue && (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn btn-quiet" onClick={() => setHintWords((h) => nextReveal(h, total))} disabled={hintWords >= total} data-testid="hint">{hintWords === 0 ? 'Hint: first word' : 'Another hint'}</button>
              <button className="btn btn-quiet" aria-pressed={meaning} onClick={() => setMeaning((m) => !m)} data-testid="meaning">{meaning ? 'Hide meaning' : 'Meaning'}</button>
            </div>
          )}
          {!single && !fixedCue && <button className="btn btn-ghost w-full" onClick={() => setFirstWords((h) => !h)} aria-pressed={firstWords}>{firstWords ? 'First words shown (counts as weaker evidence)' : 'Need a hint? Show the first words'}</button>}
          {usedHelp && <p className="text-center text-xs text-muted" data-testid="hint-note">Hints count as weaker evidence, so “on my own” isn’t available.</p>}
        </div>
      ) : (
        <>
          {n > 1 && notCounted.length > 0 && (
            <div className="mt-3 rounded-2xl bg-amber-soft/60 px-3 py-2.5 text-center text-xs text-ink-2" data-testid="unchecked-note">
              {evidence.length === 0
                ? 'Nothing to record yet: check an ayah you recited from memory.'
                : `Ayah${notCounted.length > 1 ? 's' : ''} ${notCounted.join(', ')} ${notCounted.length > 1 ? 'aren’t' : 'isn’t'} counted as recalled, because ${notCounted.length > 1 ? 'they haven’t' : 'it hasn’t'} been checked against the text.`}
              {' '}<button className="font-semibold underline" onClick={showAll} data-testid="show-rest">Show {evidence.length === 0 ? 'all' : 'the rest'}</button>
            </div>
          )}
          {evidence.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2.5" data-testid="grades">
              {GRADES.map((g) => {
                const blocked = (usedHelp && g.g === 'independent') || (single && contradicts && (g.g === 'independent' || g.g === 'hesitant'))
                return (
                  <button key={g.g} disabled={busy || blocked} className={`btn ${g.cls} h-auto flex-col !items-start !gap-0 py-3 text-left`} onClick={() => void grade(g.g)} data-testid={`grade-${g.g}`}>
                    <span className="text-[0.98rem]">{g.title}</span><span className="text-xs font-normal opacity-75">{blocked ? (usedHelp && g.g === 'independent' ? 'Not with hints' : 'Not with a flagged word') : g.sub}</span>
                  </button>
                )
              })}
            </div>
          )}
          <div className="mt-3 text-center">
            <button className="btn btn-ghost btn-sm" onClick={() => setHear((h) => !h)} data-testid="hear-check"><Icon name="headphones" size={15} />{n > 1 ? 'Hear the whole passage' : 'Hear it to check'}</button>
          </div>
          {hear && <div className="mt-2"><AudioBar queue={ayahs.map((a) => ({ surah: range.surah, ayah: a }))} autoKey={`check-${range.surah}:${range.start}-${range.end}`} /></div>}
        </>
      )}
      <p className="mt-3 text-center text-xs text-muted">Saved to your history. The app doesn’t grade you: it records what you tell it.</p>
    </div>
  )
}
