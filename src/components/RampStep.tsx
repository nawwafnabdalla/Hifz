import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AyahWords, Medallion } from './Arabic'
import { hasFading, wordState, type RampRung } from '@/lib/engine/ramp'
import type { Phrase } from '@/lib/engine/phrases'

/**
 * One step of the practice ramp. Say what you see aloud, then tap once. Earlier pieces have thinned to their first word;
 * if you can't continue, "Show me" reveals the text (and the app remembers that joint for repair). There is no counter and no rating.
 */
export function RampStep({ surah, ayah, phrases, boundaries, rung, focusOnly, resetKey, onDone, above, arabicScale = 1 }: {
  surah: number; ayah: number; phrases: Phrase[]; boundaries: number[]; rung: RampRung; focusOnly?: boolean; resetKey: string
  /** Shown between the text and the button (the audio bar on the first step: hear it, then say it). */
  above?: ReactNode
  arabicScale?: number
  onDone: (r: { peeked: boolean; durationMs: number }) => void | Promise<void>
}) {
  const [peeked, setPeeked] = useState(false)
  const started = useRef(Date.now())
  useEffect(() => { setPeeked(false); started.current = Date.now() }, [resetKey])
  const fades = hasFading(rung, phrases)
  const done = () => onDone({ peeked, durationMs: Math.min(Date.now() - started.current, 10 * 60_000) })
  return (
    <div data-testid="ramp-step" data-faded={fades && !peeked ? 'true' : 'false'}>
      <div className="card px-4 py-6 text-center" style={!focusOnly && phrases.at(-1)!.to < 10 ? ({ '--arabic-scale': arabicScale * 1.2 } as CSSProperties) : undefined}>
        {focusOnly && <p className="mb-1 text-xs text-muted">Long ayah: showing the part you are practising ({phrases[rung.from]!.from + 1}–{phrases[rung.to]!.to + 1} of {phrases.at(-1)!.to + 1} words)</p>}
        <p className="arabic center" lang="ar" dir="rtl">
          <AyahWords surah={surah} ayah={ayah} gaps={boundaries} wordState={(i) => wordState(rung, phrases, i, peeked, focusOnly)} />{!focusOnly && <> <Medallion n={ayah} /></>}
        </p>
      </div>
      {phrases.length > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1.5" aria-hidden="true">
          {phrases.map((p) => <span key={p.index} className={`grid h-7 min-w-7 place-items-center rounded-full px-2 text-xs font-bold ${p.index >= rung.from && p.index <= rung.to ? 'bg-brass text-bg' : 'bg-surface-2 text-muted'}`}>{String.fromCharCode(65 + p.index)}</span>)}
        </div>
      )}
      {above && <div className="mt-3">{above}</div>}
      <button className="btn btn-primary btn-lg mt-4 w-full" onClick={() => void done()} data-testid="ramp-next">Said it</button>
      <div className="mt-2 h-9 text-center">
        {fades && !peeked && <button className="btn btn-ghost btn-sm" onClick={() => setPeeked(true)} data-testid="ramp-peek">Show me</button>}
      </div>
    </div>
  )
}
