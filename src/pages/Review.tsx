import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { RecallCard } from '@/components/RecallCard'
import { Icon } from '@/components/Icon'
import { isValidRef } from '@/lib/quran/data'
import type { PracticeContext } from '@/lib/engine/types'
import { useState } from 'react'
import { rangeTitle } from '@/lib/format'

const CTX: PracticeContext[] = ['new', 'sabqi', 'manzil', 'repair', 'verify', 'free', 'probe']

export function ReviewPage() {
  const p = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const [done, setDone] = useState(false)
  const surah = Number(p.surah), start = Number(p.start), end = Number(p.end)
  const ok = isValidRef(surah, start) && isValidRef(surah, end) && end >= start && end - start < 80
  if (!ok) return <div className="p-8 text-center">That passage can’t be opened. <button className="underline" onClick={() => nav('/quran')}>Back</button></div>
  const raw = sp.get('ctx') as PracticeContext | null
  const ctx: PracticeContext = raw && CTX.includes(raw) ? raw : 'free'
  const range = { surah, start, end }
  return (
    <div className="mx-auto max-w-[680px]">
      <div className="safe-top flex items-center justify-between px-4 pt-4"><button className="btn btn-ghost btn-sm" onClick={() => nav(-1)} aria-label="Leave"><Icon name="x" size={18} /></button><span className="w-10" /></div>
      {done ? (
        <div className="enter mt-6 px-4" data-testid="review-done"><div className="card p-6 text-center"><h2 className="font-display text-2xl">Saved</h2><p className="mt-2 text-sm text-ink-2">{rangeTitle(range)} is now part of your history.</p><div className="mt-4 grid gap-2"><button className="btn btn-primary" onClick={() => nav('/')}>Back to Today</button><button className="btn btn-quiet" onClick={() => setDone(false)}>Recite it again</button></div></div></div>
      ) : (
        <RecallCard key={String(done)} range={range} context={ctx} onDone={() => setDone(true)} />
      )}
    </div>
  )
}
