import { useEffect, useState } from 'react'
import { Sheet } from './ui'
import { useApp } from '@/app/store'
import { SURAHS, ayahCount } from '@/lib/quran/data'
import type { Range } from '@/lib/engine/types'

export function GoalSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Range }) {
  const addTarget = useApp((s) => s.addTarget)
  const say = useApp((s) => s.say)
  const [r, setR] = useState<Range>(initial ?? { surah: 112, start: 1, end: 4 })
  const [label, setLabel] = useState('')
  useEffect(() => { if (open && initial) setR(initial) }, [open, initial])
  const max = ayahCount(r.surah)
  const ok = r.start >= 1 && r.end >= r.start && r.end <= max
  return (
    <Sheet open={open} onClose={onClose} title="Choose something to memorise">
      <p className="mb-3 text-sm text-ink-2">A goal is a stretch of Qur’an you want to learn. Hifz OS plans how much to take each day from your time and review load. You decide the pace, not a fixed number of lines.</p>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <label className="col-span-3"><span className="eyebrow">Surah</span>
          <select className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-2" value={r.surah} onChange={(e) => setR({ surah: +e.target.value, start: 1, end: ayahCount(+e.target.value) })} data-testid="goal-surah">
            {SURAHS.map((s) => <option key={s.n} value={s.n}>{s.n}. {s.tr} ({s.count})</option>)}
          </select></label>
        <label><span className="eyebrow">From</span><input type="number" inputMode="numeric" min={1} max={max} className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3" value={r.start} onChange={(e) => setR({ ...r, start: +e.target.value })} data-testid="goal-from" /></label>
        <label><span className="eyebrow">To</span><input type="number" inputMode="numeric" min={1} max={max} className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3" value={r.end} onChange={(e) => setR({ ...r, end: +e.target.value })} data-testid="goal-to" /></label>
        <button className="chip mt-6 self-center justify-self-start" onClick={() => setR({ ...r, start: 1, end: max })}>Whole surah</button>
      </div>
      <label className="mt-3 block text-sm"><span className="eyebrow">Name (optional)</span><input className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My next surah" /></label>
      <button className="btn btn-primary btn-lg mt-4 w-full" disabled={!ok} data-testid="goal-save" onClick={async () => { await addTarget(r, label.trim() || undefined); say('Goal added'); onClose() }}>{ok ? 'Add goal' : `Ayahs 1–${max} only`}</button>
    </Sheet>
  )
}
