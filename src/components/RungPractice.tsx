import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AyahWords, Medallion, PlainWords } from './Arabic'
import type { Phrase } from '@/lib/engine/phrases'
import type { FlowRating } from '@/lib/engine/types'

/**
 * One rung of the flow ladder: show the phrases in play, count spoken repetitions, rate how it feels.
 * Used by the Learn flow and by in-place repair after a slip. Rating is reported once, then the parent decides what's next.
 */
export function RungPractice({ surah, ayah, words, phrases, boundaries, from, to, focusOnly, upTo, showChips = true, dimOthers = true, onRate, onNext, onTricky, nextLabel, meaning, caption, aside, resetKey }: {
  surah: number; ayah: number; words: string[]; phrases: Phrase[]; boundaries: number[]
  from: number; to: number
  /** Show only the words in play (very long ayahs) so the controls stay on screen. */
  focusOnly?: boolean
  /** Part-by-part: show the ayah up to the end of the step, with the step highlighted and what came before it dimmed. */
  upTo?: boolean
  /** The A B C chips for the phrases (not needed where another indicator already shows them). */
  showChips?: boolean
  dimOthers?: boolean
  /** Explicit rating (used where a rating is itself the evidence, such as clearing a spot marked tricky). */
  onRate?: (rating: FlowRating, stats: { reps: number; durationMs: number }) => void | Promise<void>
  /** Free practice: moving on needs no rating. `onTricky` is the only judgement offered, and only if the learner wants to make it. */
  onNext?: (stats: { reps: number; durationMs: number }) => void | Promise<void>
  onTricky?: (stats: { reps: number; durationMs: number }) => void | Promise<void>
  nextLabel?: string
  /** A quiet line under the text (the meaning), and the caption and extras (audio) around the repetition control. */
  meaning?: ReactNode
  caption?: ReactNode
  aside?: ReactNode
  resetKey: string
}) {
  const [reps, setReps] = useState(0)
  const started = useRef(Date.now())
  useEffect(() => { setReps(0); started.current = Date.now() }, [resetKey])
  const span: [number, number] = [phrases[from]!.from, phrases[to]!.to]

  const stats = () => ({ reps, durationMs: Math.min(Date.now() - started.current, 10 * 60_000) })
  const rate = async (r: FlowRating) => {
    await onRate?.(r, stats())
    setReps(0)
    started.current = Date.now()
  }
  const reset = () => { setReps(0); started.current = Date.now() }

  return (
    <>
      <div className="card px-4 py-6 text-center">
        {upTo ? (
          <p className="arabic center" lang="ar" dir="rtl"><AyahWords surah={surah} ayah={ayah} only={[0, span[1]]} dimOutside={span} highlight={span} gaps={boundaries} /></p>
        ) : focusOnly ? (
          <>
            <p className="mb-1 text-xs text-muted">Long ayah: showing the part you are practising ({span[0] + 1}–{span[1] + 1} of {words.length} words)</p>
            <p className="arabic center" lang="ar" dir="rtl"><PlainWords surah={surah} ayah={ayah} from={span[0]} to={span[1]} /></p>
          </>
        ) : (
          <p className="arabic center" lang="ar" dir="rtl"><AyahWords surah={surah} ayah={ayah} dimOutside={dimOthers ? span : undefined} gaps={boundaries} /> <Medallion n={ayah} /></p>
        )}
        {meaning && <div className="mt-3">{meaning}</div>}
        {caption}
      </div>
      {showChips && phrases.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1.5" aria-hidden="true">
          {phrases.map((p) => <span key={p.index} className={`grid h-7 min-w-7 place-items-center rounded-full px-2 text-xs font-bold ${p.index >= from && p.index <= to ? 'bg-brass text-bg' : 'bg-surface-2 text-muted'}`}>{String.fromCharCode(65 + p.index)}</span>)}
        </div>
      )}
      {aside}
      {onNext ? (
        <>
          <div className="mt-3 text-center">
            <button className="btn btn-quiet" onClick={() => setReps((r) => r + 1)} data-testid="said-it" aria-label={`Say it aloud, then tap to count. ${reps} so far.`} style={reps === 0 ? { animation: 'pulse-ring 2s ease-out infinite' } : undefined}>
              {reps === 0 ? 'Say it aloud, then tap' : <>Said it <span className="tabular font-display text-lg">×{reps}</span></>}
            </button>
          </div>
          <button className="btn btn-primary btn-lg mt-4 w-full" onClick={async () => { await onNext(stats()); reset() }} data-testid="practise-next">{nextLabel ?? 'Next'}</button>
          {onTricky && <div className="mt-1 text-center"><button className="link-quiet" onClick={async () => { await onTricky(stats()); reset() }} data-testid="practise-tricky">This part is tricky</button></div>}
        </>
      ) : (
      <>
      <button className="card mt-4 flex w-full flex-col items-center gap-1 py-6 active:scale-[0.99]" onClick={() => setReps((r) => r + 1)} data-testid="said-it" style={reps === 0 ? { animation: 'pulse-ring 2s ease-out infinite' } : undefined}>
        <span className="text-sm font-semibold text-accent">Say it aloud, then tap</span>
        <span className="font-display tabular text-5xl text-ink">{reps}</span>
        <span className="text-xs text-muted">{reps === 0 ? '' : reps < 3 ? 'A few more times' : 'Rate how it feels'}</span>
      </button>
      <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="How does it feel on the tongue?">
        <button className="btn btn-quiet h-12" onClick={() => void rate('tangled')} data-testid="rate-tangled" title="Tangled: again">Tangled</button>
        <button className="btn btn-quiet h-12" onClick={() => void rate('improving')} data-testid="rate-improving" title="Improving: next">Improving</button>
        <button className="btn btn-primary h-12" onClick={() => void rate('natural')} data-testid="rate-natural" title="Natural: it rolls off the tongue">Natural</button>
      </div>
      </>
      )}
    </>
  )
}
