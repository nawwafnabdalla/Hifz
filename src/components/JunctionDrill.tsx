import { useMemo, useRef, useState } from 'react'
import { Medallion, PlainWords } from './Arabic'
import { Icon } from './Icon'
import { useApp } from '@/app/store'
import { arabicIndic, wordsOfAyah } from '@/lib/quran/data'
import type { Grade, Range } from '@/lib/engine/types'

/**
 * Transition drill: shows the end of one ayah and asks for the start of the next.
 * Logged as continuity evidence only; it never counts as verifying either ayah.
 */
export function JunctionDrill({ range, onDone }: { range: Range; onDone: () => void }) {
  const logReview = useApp((s) => s.logReview)
  const pairs = useMemo(() => Array.from({ length: range.end - range.start }, (_, i) => range.start + i), [range])
  const [i, setI] = useState(0)
  const [shown, setShown] = useState(false)
  const t0 = useRef(Date.now())
  const k = pairs[i]
  if (k === undefined) return <div className="px-4 text-center text-sm text-ink-2">Pick at least two ayahs to practise a transition.</div>
  const tail = wordsOfAyah(range.surah, k).slice(-3)
  const next = wordsOfAyah(range.surah, k + 1)

  async function grade(g: Grade) {
    await logReview({ kind: 'junction', range: { surah: range.surah, start: k!, end: k! + 1 }, grade: g, context: 'free', cueLevel: 4, stumbles: [], shakyJunctions: [], durationMs: Math.min(Date.now() - t0.current, 120_000) })
    t0.current = Date.now(); setShown(false)
    if (i + 1 < pairs.length) setI(i + 1); else onDone()
  }

  return (
    <div className="px-4" data-testid="junction-drill">
      <div className="mb-3 text-center"><div className="eyebrow">Transition {i + 1} of {pairs.length}</div><h2 className="font-display mt-1 text-xl">Ayah {k} → {k + 1}</h2><p className="mt-1 text-sm text-ink-2">Say the ending, then carry straight on into the next ayah.</p></div>
      <div className="card px-4 py-6">
        <p className="arabic center" lang="ar" dir="rtl">
          <span className="text-muted">… </span><PlainWords words={tail} /> <Medallion n={k} />
        </p>
        <div className="my-3 flex items-center justify-center text-brass"><Icon name="down" /></div>
        <p className="arabic center" lang="ar" dir="rtl" aria-label={`Ayah ${k + 1}`}>
          {shown ? <><PlainWords words={next} /> <Medallion n={k + 1} /></> : <span className="inline-flex items-center gap-2 text-muted"><span className="mask" style={{ width: '3.2em' }} /><span className="mask" style={{ width: '2em' }} /><span className="mask" style={{ width: '2.6em' }} /><span className="text-sm font-sans">{arabicIndic(k + 1)}</span></span>}
        </p>
      </div>
      {!shown ? <button className="btn btn-primary btn-lg mt-4 w-full" onClick={() => setShown(true)} data-testid="junction-reveal"><Icon name="eye" size={18} /> Show what follows</button> : (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button className="btn btn-primary h-auto flex-col !gap-0 py-3" onClick={() => void grade('independent')} data-testid="junction-smooth"><span>Smooth</span><span className="text-xs font-normal opacity-80">flowed on</span></button>
          <button className="btn btn-quiet h-auto flex-col !gap-0 py-3" onClick={() => void grade('hesitant')}><span>Shaky</span><span className="text-xs font-normal text-muted">paused</span></button>
          <button className="btn btn-quiet h-auto flex-col !gap-0 py-3" onClick={() => void grade('failed')}><span>Lost it</span><span className="text-xs font-normal text-muted">stuck</span></button>
        </div>
      )}
    </div>
  )
}
