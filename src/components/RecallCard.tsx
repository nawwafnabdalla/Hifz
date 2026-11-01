import { Coach } from './Coach'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AyahWords, Medallion, Passage, type Cue } from './Arabic'
import { AudioBar } from './AudioBar'
import { RungPractice } from './RungPractice'
import { Icon } from './Icon'
import { useApp } from '@/app/store'
import { rangeTitle } from '@/lib/format'
import { buildPhrases } from '@/lib/engine/phrases'
import { defaultBoundaries } from '@/lib/engine/breakdown'
import { usePhraseTiming } from '@/lib/audio/usePhraseTiming'
import { reciterPauses } from '@/lib/audio/timings'
import { slipRung } from '@/lib/engine/repair'
import type { FlowRating, Grade, PracticeContext, Range, ReviewEvent, StumbleKind } from '@/lib/engine/types'
import { loadTranslation, wordsOfAyah } from '@/lib/quran/data'

const KINDS: StumbleKind[] = ['hesitated', 'prompted', 'wrong', 'blank']
const KIND_LABEL: Record<StumbleKind, string> = { hesitated: 'hesitated', prompted: 'needed a prompt', wrong: 'words wrong', blank: 'blank' }
const KIND_STYLE: Record<StumbleKind, string> = { hesitated: 'bg-amber-soft', prompted: 'bg-clay-soft', wrong: 'bg-clay-soft', blank: 'bg-clay-soft' }

const GRADES: { g: Grade; title: string; sub: string; cls: string }[] = [
  { g: 'independent', title: 'On my own', sub: 'Accurate, without help', cls: 'btn-primary' },
  { g: 'hesitant', title: 'Hesitated', sub: 'Accurate, but unsure', cls: 'btn-quiet' },
  { g: 'prompted', title: 'Needed a prompt', sub: 'Partly right', cls: 'btn-quiet' },
  { g: 'failed', title: 'Couldn’t recall', sub: 'Not yet', cls: 'btn-quiet' },
]

export interface RecallResult { event: ReviewEvent }

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
 * Recite from memory, reveal, grade with one tap. For a single ayah you can ask for hints (the next few words, or the
 * meaning) before showing everything; using either caps what you can claim and lowers the evidence recorded. Tap the
 * word you slipped on and the app practises that exact joint with you. For passages, mark where you slipped; that is
 * what keeps passage results from over-crediting individual ayahs.
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

  const [revealed, setRevealed] = useState(false)
  const [hintWords, setHintWords] = useState(0)
  const [meaning, setMeaning] = useState(false)
  const [firstWords, setFirstWords] = useState(false)       // passages only
  const [slip, setSlip] = useState<number | null>(null)
  const [hear, setHear] = useState(false)
  const [flags, setFlags] = useState<Map<number, StumbleKind>>(new Map())
  const [shaky, setShaky] = useState<Set<number>>(new Set())
  const [stopAt, setStopAt] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [repair, setRepair] = useState<{ event: ReviewEvent; from: number; to: number } | null>(null)
  const [tr, setTr] = useState<string[] | null>(null)
  const started = useRef(Date.now())
  const ayahs = useMemo(() => Array.from({ length: n }, (_, i) => range.start + i), [range.start, n])

  useEffect(() => { if (single && meaning && !tr) void loadTranslation().then((t) => setTr(t[range.surah - 1] ?? null)) }, [single, meaning, tr, range.surah])

  const usedHelp = single && (hintWords > 0 || meaning)
  const hintCue = single ? cueForHints(hintWords, total, meaning) : (firstWords ? 3 : 4) as Cue
  const eventCue: Cue = fixedCue ?? hintCue
  const cue: Cue = revealed ? 0 : fixedCue ?? (firstWords ? 3 : 4)

  const cycle = (a: number) => setFlags((m) => {
    const x = new Map(m)
    const cur = x.get(a)
    const next = cur === undefined ? KINDS[0] : KINDS[KINDS.indexOf(cur) + 1]
    if (next) x.set(a, next); else x.delete(a)
    return x
  })

  async function grade(g: Grade) {
    if (busy) return
    if (usedHelp && g === 'independent') return          // a hinted recall can never be claimed as unaided
    setBusy(true)
    const e = await logReview({
      kind: 'recall', range, grade: g, context, cueLevel: eventCue,
      stumbles: [...flags].map(([ayah, kind]) => ({ ayah, kind })), shakyJunctions: [...shaky].sort((a, b) => a - b),
      completedTo: stopAt ?? undefined, durationMs: Math.min(Date.now() - started.current, 10 * 60_000), listenedFirst,
    })
    if (single && slip !== null) {
      const words = wordsOfAyah(range.surah, range.start)
      const markersFor = markers.find((m) => m.id === `${range.surah}:${range.start}`)
      const phrases = buildPhrases(words, markersFor ? markersFor.boundaries : defaultBoundaries(range.surah, range.start, words, pauses))
      const r = slipRung(slip, phrases)
      // The slip itself is recorded as a tangled mark on that joint; practising it naturally clears it.
      await logFlow({ surah: range.surah, ayah: range.start, fromPhrase: r.from, toPhrase: r.to, phraseCount: phrases.length, rating: 'tangled', reps: 0, durationMs: 0 })
      setRepair({ event: e, ...r })
      return
    }
    onDone(e)
  }

  if (repair) {
    const words = wordsOfAyah(range.surah, range.start)
    const m = markers.find((x) => x.id === `${range.surah}:${range.start}`)
    const boundaries = m ? m.boundaries : defaultBoundaries(range.surah, range.start, words, pauses)
    const phrases = buildPhrases(words, boundaries)
    const label = repair.from === repair.to ? (phrases.length === 1 ? 'the whole ayah' : `phrase ${String.fromCharCode(65 + repair.from)}`) : `${String.fromCharCode(65 + repair.from)} → ${String.fromCharCode(65 + repair.to)}`
    return (
      <div className="px-4" data-testid="repair-panel">
        <div className="mb-3 text-center"><div className="eyebrow">Repair the exact spot</div><h2 className="font-display mt-1 text-xl">Practise {label}</h2>
          <Coach id="repair-intro" className="mt-1 text-sm text-ink-2" full="Say just this part until it flows. The rest of the ayah is already in your history." short="Say just this part until it flows." /></div>
        <RungPractice surah={range.surah} ayah={range.start} words={words} phrases={phrases} boundaries={boundaries} from={repair.from} to={repair.to} resetKey="repair" focusOnly={words.length > 28}
          onRate={async (rating: FlowRating, s) => {
            await logFlow({ surah: range.surah, ayah: range.start, fromPhrase: repair.from, toPhrase: repair.to, phraseCount: phrases.length, rating, reps: s.reps, durationMs: s.durationMs })
            if (rating === 'natural') onDone(repair.event, { repaired: true })
          }} />
        <button className="btn btn-ghost mt-3 w-full" onClick={() => onDone(repair.event, { repaired: true })} data-testid="repair-skip">Done for now</button>
        <Coach id="repair-outro" className="mt-2 text-center text-xs text-muted" full="Until it feels natural it stays marked as tricky and is practised first next time." />
      </div>
    )
  }

  return (
    <div className="px-4" data-testid="recall-card">
      <div className="mb-3 text-center">
        <div className="eyebrow">{revealed ? 'How was that?' : 'From memory'}</div>
        <h2 className="font-display mt-1 text-xl">{title ?? rangeTitle(range)}</h2>
        {!revealed && <Coach id="recall-intro" className="mt-1 text-sm text-ink-2" full={`Recite aloud, then show the text to check.${n > 1 ? ` ${n} ayahs, in order.` : ''}`} short={n > 1 ? `${n} ayahs, in order.` : ''} />}
      </div>

      <div className="card px-4 py-5">
        {single ? (
          <p className="arabic" lang="ar" dir="rtl">
            <AyahWords surah={range.surah} ayah={range.start} cue={revealed ? 0 : 4} revealCount={revealed ? undefined : hintWords}
              onWord={revealed ? setSlip : undefined} marked={slip} />{' '}<Medallion n={range.start} />
          </p>
        ) : (
          <Passage surah={range.surah} ayahs={ayahs} cue={cue} onTap={revealed ? cycle : undefined} stageOf={undefined} />
        )}
        {single && meaning && <p className="mt-3 border-t border-line pt-3 text-center text-[0.95rem] leading-relaxed text-ink-2" data-testid="meaning-line">{tr ? tr[range.start - 1] : '…'}</p>}
        {revealed && single && <Coach id="slip-tip" className="mt-2 text-center text-xs text-muted" full="Slipped somewhere? Tap that word and I’ll practise that exact spot with you." short="Tap the word where you slipped." />}
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
      </div>

      {!revealed ? (
        <div className="mt-4 space-y-2">
          <button className="btn btn-primary btn-lg w-full" onClick={() => setRevealed(true)} data-testid="reveal"><Icon name="eye" size={18} /> Show text</button>
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
          <div className="mt-4 grid grid-cols-2 gap-2.5" data-testid="grades">
            {GRADES.map((g) => {
              const blocked = usedHelp && g.g === 'independent'
              return (
                <button key={g.g} disabled={busy || blocked} className={`btn ${g.cls} h-auto flex-col !items-start !gap-0 py-3 text-left`} onClick={() => void grade(g.g)} data-testid={`grade-${g.g}`}>
                  <span className="text-[0.98rem]">{g.title}</span><span className="text-xs font-normal opacity-75">{blocked ? 'Not with hints' : g.sub}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-3 text-center">
            <button className="btn btn-ghost btn-sm" onClick={() => setHear((h) => !h)} data-testid="hear-check"><Icon name="headphones" size={15} />Hear it to check</button>
          </div>
          {hear && <div className="mt-2"><AudioBar queue={ayahs.map((a) => ({ surah: range.surah, ayah: a }))} autoKey={`check-${range.surah}:${range.start}-${range.end}`} /></div>}
        </>
      )}
      <p className="mt-3 text-center text-xs text-muted">Saved to your history. The app doesn’t grade you.</p>
    </div>
  )
}
