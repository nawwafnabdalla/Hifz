import { useMemo, useRef, useState } from 'react'
import { Passage, type Cue } from './Arabic'
import { Icon } from './Icon'
import { useApp } from '@/app/store'
import { rangeTitle } from '@/lib/format'
import type { Grade, PracticeContext, Range, ReviewEvent, StumbleKind } from '@/lib/engine/types'
import { surahInfo } from '@/lib/quran/data'

const KINDS: StumbleKind[] = ['hesitated', 'prompted', 'wrong', 'blank']
const KIND_LABEL: Record<StumbleKind, string> = { hesitated: 'hesitated', prompted: 'needed a prompt', wrong: 'words wrong', blank: 'blank' }
const KIND_STYLE: Record<StumbleKind, string> = {
  hesitated: 'bg-amber-soft', prompted: 'bg-clay-soft', wrong: 'bg-clay-soft', blank: 'bg-clay-soft',
}

const GRADES: { g: Grade; title: string; sub: string; cls: string }[] = [
  { g: 'independent', title: 'On my own', sub: 'Accurate, without help', cls: 'btn-primary' },
  { g: 'hesitant', title: 'Hesitated', sub: 'Accurate, but unsure', cls: 'btn-quiet' },
  { g: 'prompted', title: 'Needed a prompt', sub: 'Partly right', cls: 'btn-quiet' },
  { g: 'failed', title: 'Couldn’t recall', sub: 'Not yet', cls: 'btn-quiet' },
]

export interface RecallResult { event: ReviewEvent }

/**
 * Recite from memory, reveal, grade with one tap. Multi-ayah passages let you mark where
 * you slipped; that is what keeps passage results from over-crediting individual ayahs.
 */
export function RecallCard({ range, context, listenedFirst, onDone, title, fixedCue }: {
  range: Range; context: PracticeContext; listenedFirst?: boolean; onDone: (e: ReviewEvent) => void; title?: string; fixedCue?: Cue
}) {
  const logReview = useApp((s) => s.logReview)
  const [revealed, setRevealed] = useState(false)
  const [hint, setHint] = useState(false)
  const [flags, setFlags] = useState<Map<number, StumbleKind>>(new Map())
  const [shaky, setShaky] = useState<Set<number>>(new Set())
  const [stopAt, setStopAt] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(Date.now())
  const n = range.end - range.start + 1
  const ayahs = useMemo(() => Array.from({ length: n }, (_, i) => range.start + i), [range.start, n])
  const cue: Cue = revealed ? 0 : fixedCue ?? (hint ? 3 : 4)

  const cycle = (a: number) => setFlags((m) => {
    const x = new Map(m)
    const cur = x.get(a)
    const next = cur === undefined ? KINDS[0] : KINDS[KINDS.indexOf(cur) + 1]
    if (next) x.set(a, next); else x.delete(a)
    return x
  })

  async function grade(g: Grade) {
    if (busy) return
    setBusy(true)
    const e = await logReview({
      kind: 'recall', range, grade: g, context, cueLevel: fixedCue ?? (hint ? 3 : 4),
      stumbles: [...flags].map(([ayah, kind]) => ({ ayah, kind })), shakyJunctions: [...shaky].sort((a, b) => a - b),
      completedTo: stopAt ?? undefined, durationMs: Math.min(Date.now() - started.current, 10 * 60_000), listenedFirst,
    })
    onDone(e)
  }

  return (
    <div className="px-4" data-testid="recall-card">
      <div className="mb-3 text-center">
        <div className="eyebrow">{revealed ? 'How was that?' : 'From memory'}</div>
        <h2 className="font-display mt-1 text-xl">{title ?? rangeTitle(range)}</h2>
        {!revealed && <p className="mt-1 text-sm text-ink-2">Recite aloud, then show the text to check. {n > 1 ? `${n} ayahs, in order.` : ''}</p>}
      </div>

      <div className="card px-4 py-5">
        <Passage surah={range.surah} ayahs={ayahs} cue={cue} onTap={revealed && n > 1 ? cycle : undefined} stageOf={undefined} />
        {revealed && n > 1 && (
          <div className="mt-3 space-y-3 border-t border-line pt-3" data-testid="stumble-tools">
            <p className="text-xs text-muted">Optional: tap an ayah where you slipped. Tap again to change how.</p>
            <div className="flex flex-wrap gap-1.5">
              {ayahs.map((a) => { const k = flags.get(a); return <button key={a} className={`chip tabular ${k ? KIND_STYLE[k] : ''}`} onClick={() => cycle(a)} aria-label={`Ayah ${a}: ${k ? KIND_LABEL[k] : 'fine'}`}>{a}{k && <span className="text-xs">· {KIND_LABEL[k]}</span>}</button> })}
            </div>
            {n > 1 && (
              <div>
                <div className="mb-1 text-xs text-muted">Did a transition feel shaky? (end of one ayah into the next)</div>
                <div className="flex flex-wrap gap-1.5">
                  {ayahs.slice(0, -1).map((a) => <button key={a} className="chip tabular" aria-pressed={shaky.has(a)} onClick={() => setShaky((s) => { const x = new Set(s); x.has(a) ? x.delete(a) : x.add(a); return x })}><Icon name="link" size={13} />{a}→{a + 1}</button>)}
                </div>
              </div>
            )}
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
          {!fixedCue && <button className="btn btn-ghost w-full" onClick={() => setHint((h) => !h)} aria-pressed={hint}>{hint ? 'Hint on: first word shown (counts as weaker evidence)' : 'Need a hint? Show the first word'}</button>}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2.5" data-testid="grades">
          {GRADES.map((g) => (
            <button key={g.g} disabled={busy} className={`btn ${g.cls} h-auto flex-col !items-start !gap-0 py-3 text-left`} onClick={() => void grade(g.g)} data-testid={`grade-${g.g}`}>
              <span className="text-[0.98rem]">{g.title}</span><span className="text-xs font-normal opacity-75">{g.sub}</span>
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 text-center text-xs text-muted">{surahInfo(range.surah).tr} · your answer is saved to your history, not graded by the app.</p>
    </div>
  )
}
