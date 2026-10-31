import { useEffect, useState } from 'react'
import { Sheet } from './ui'
import { OfflineAudioCard, useOffline } from './OfflineAudio'
import { useApp } from '@/app/store'
import { SURAHS, ayahCount } from '@/lib/quran/data'
import { canSaveOffline } from '@/lib/audio/sources'
import type { LearningTarget, Range } from '@/lib/engine/types'

/**
 * Add a goal, or change an existing one (for example, extend Ta-Ha 1–36 to 1–50).
 * Afterwards, if this goal's audio could be saved for offline practice and isn't yet, that one offer is made here.
 */
export function GoalSheet({ open, onClose, initial, target }: { open: boolean; onClose: () => void; initial?: Range; target?: LearningTarget }) {
  const addTarget = useApp((s) => s.addTarget)
  const updateTarget = useApp((s) => s.updateTarget)
  const say = useApp((s) => s.say)
  const reciter = useApp((s) => s.snap.settings.reciter)
  const offline = useOffline()
  const start = target?.range ?? initial ?? { surah: 112, start: 1, end: 4 }
  const [r, setR] = useState<Range>(start)
  const [label, setLabel] = useState(target?.label ?? '')
  const [offer, setOffer] = useState<{ range: Range; goalId?: string; added: boolean } | null>(null)
  useEffect(() => { if (open) { setR(target?.range ?? initial ?? { surah: 112, start: 1, end: 4 }); setLabel(target?.label ?? ''); setOffer(null) } }, [open, initial, target])
  const max = ayahCount(r.surah)
  const ok = r.start >= 1 && r.end >= r.start && r.end <= max

  async function save() {
    if (target) await updateTarget(target.id, r, label.trim() || undefined)
    else await addTarget(r, label.trim() || undefined)
    const goalId = target?.id ?? useApp.getState().snap.targets.at(-1)?.id
    // One offer, only when it can be acted on: the reciter's recordings may be saved and this range isn't fully saved yet.
    if (offline.supported && canSaveOffline(reciter) && !offline.coverage(reciter, r).complete) setOffer({ range: r, goalId, added: !target })   // the sheet's own title says it was saved
    else { say(target ? 'Goal updated' : 'Goal added'); onClose() }
  }

  if (offer) {
    return (
      <Sheet open={open} onClose={onClose} title={offer.added ? 'Goal added' : 'Goal updated'}>
        <OfflineAudioCard range={offer.range} goalId={offer.goalId} />
        <button className="btn btn-quiet btn-lg mt-4 w-full" onClick={onClose} data-testid="goal-audio-skip">{offline.coverage(reciter, offer.range).complete ? 'Done' : 'Not now'}</button>
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title={target ? 'Change goal' : 'Choose something to memorise'}>
      {!target && <p className="mb-3 text-sm text-ink-2">Pick a surah or passage. Hifz OS decides how much to take each day.</p>}
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
      <button className="btn btn-primary btn-lg mt-4 w-full" disabled={!ok} data-testid="goal-save" onClick={() => void save()}>{ok ? (target ? 'Save changes' : 'Add goal') : `Ayahs 1–${max} only`}</button>
    </Sheet>
  )
}
