import { useEffect, useRef, useState } from 'react'
import { AyahWords, Medallion, PlainWords } from './Arabic'
import type { Phrase } from '@/lib/engine/phrases'
import type { FlowRating } from '@/lib/engine/types'

/**
 * One rung of the flow ladder: show the phrases in play, count spoken repetitions, rate how it feels.
 * Used by the Learn flow and by in-place repair after a slip. Rating is reported once, then the parent decides what's next.
 */
export function RungPractice({ surah, ayah, words, phrases, boundaries, from, to, focusOnly, dimOthers = true, onRate, resetKey }: {
  surah: number; ayah: number; words: string[]; phrases: Phrase[]; boundaries: number[]
  from: number; to: number
  /** Show only the words in play (very long ayahs) so the controls stay on screen. */
  focusOnly?: boolean
  dimOthers?: boolean
  onRate: (rating: FlowRating, stats: { reps: number; durationMs: number }) => void | Promise<void>
  resetKey: string
}) {
  const [reps, setReps] = useState(0)
  const started = useRef(Date.now())
  useEffect(() => { setReps(0); started.current = Date.now() }, [resetKey])
  const span: [number, number] = [phrases[from]!.from, phrases[to]!.to]

  const rate = async (r: FlowRating) => {
    await onRate(r, { reps, durationMs: Math.min(Date.now() - started.current, 10 * 60_000) })
    setReps(0)
    started.current = Date.now()
  }

  return (
    <>
      <div className="card px-4 py-6 text-center">
        {focusOnly ? (
          <>
            <p className="mb-1 text-xs text-muted">Long ayah: showing the part you are practising ({span[0] + 1}–{span[1] + 1} of {words.length} words)</p>
            <p className="arabic center" lang="ar" dir="rtl"><PlainWords words={words.slice(span[0], span[1] + 1)} /></p>
          </>
        ) : (
          <p className="arabic center" lang="ar" dir="rtl"><AyahWords surah={surah} ayah={ayah} dimOutside={dimOthers ? span : undefined} gaps={boundaries} /> <Medallion n={ayah} /></p>
        )}
      </div>
      {phrases.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1.5" aria-hidden="true">
          {phrases.map((p) => <span key={p.index} className={`grid h-7 min-w-7 place-items-center rounded-full px-2 text-xs font-bold ${p.index >= from && p.index <= to ? 'bg-brass text-bg' : 'bg-surface-2 text-muted'}`}>{String.fromCharCode(65 + p.index)}</span>)}
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
    </>
  )
}
