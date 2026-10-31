import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/app/store'
import { Icon } from './Icon'
import { AudioBar } from './AudioBar'
import { Sheet } from './ui'
import { SURAHS, ayahCount, corpus } from '@/lib/quran/data'
import { connectedStretches, isDuplicate, passageStatus, roughMinutes } from '@/lib/passages'
import { agoText } from '@/lib/engine/planner'
import { rangePath, rangeTitle } from '@/lib/format'
import type { Range, SavedPassage } from '@/lib/engine/types'

const words = (r: Range) => { let w = 0; for (let a = r.start; a <= r.end; a++) w += corpus.wordCount(r.surah, a); return w }

export function PassageSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Range }) {
  const settings = useApp((s) => s.snap.settings)
  const patch = useApp((s) => s.patchSettings)
  const say = useApp((s) => s.say)
  const [r, setR] = useState<Range>(initial ?? { surah: 20, start: 1, end: 8 })
  const [name, setName] = useState('')
  const max = ayahCount(r.surah)
  const ok = r.start >= 1 && r.end >= r.start && r.end <= max
  const dup = ok && isDuplicate(settings.passages, r)
  return (
    <Sheet open={open} onClose={onClose} title="Save a recitation passage">
      <p className="mb-3 text-sm text-ink-2">Choose the ends yourself; the app never decides where a passage stops.</p>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <label className="col-span-3"><span className="eyebrow">Surah</span>
          <select className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-2" value={r.surah} onChange={(e) => setR({ surah: +e.target.value, start: 1, end: Math.min(8, ayahCount(+e.target.value)) })} data-testid="passage-surah">
            {SURAHS.map((s) => <option key={s.n} value={s.n}>{s.n}. {s.tr} ({s.count})</option>)}
          </select></label>
        <label><span className="eyebrow">From</span><input type="number" inputMode="numeric" min={1} max={max} className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3" value={r.start} onChange={(e) => setR({ ...r, start: +e.target.value })} data-testid="passage-from" /></label>
        <label><span className="eyebrow">To</span><input type="number" inputMode="numeric" min={1} max={max} className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3" value={r.end} onChange={(e) => setR({ ...r, end: +e.target.value })} data-testid="passage-to" /></label>
      </div>
      <label className="mt-3 block text-sm"><span className="eyebrow">Name (optional)</span><input className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. First raka’ah" data-testid="passage-name" /></label>
      {ok && <p className="mt-2 text-xs text-muted">{r.end - r.start + 1} ayahs · {words(r)} words · roughly {roughMinutes(words(r))} min at a steady pace (a guide only)</p>}
      <button className="btn btn-primary btn-lg mt-4 w-full" disabled={!ok || dup || settings.passages.length >= 30} data-testid="passage-save"
        onClick={async () => { const p: SavedPassage = { id: crypto.randomUUID(), name: name.trim() || rangeTitle(r), range: r, createdAt: Date.now() }; await patch({ passages: [...settings.passages, p] }); say('Passage saved'); onClose() }}>
        {!ok ? `Ayahs 1–${max} only` : dup ? 'Already saved' : 'Save passage'}
      </button>
    </Sheet>
  )
}

export function PassagesCard() {
  const nav = useNavigate()
  const settings = useApp((s) => s.snap.settings)
  const patch = useApp((s) => s.patchSettings)
  const derived = useApp((s) => s.derived)
  const now = useApp((s) => s.now)
  const [add, setAdd] = useState(false)
  const [open, setOpen] = useState(false)
  const [suggest, setSuggest] = useState(false)
  const [listen, setListen] = useState<string | null>(null)
  const list = settings.passages
  const suggestions = useMemo(() => (suggest ? connectedStretches(derived, corpus, now).filter((s) => !isDuplicate(list, s.range)) : []), [suggest, derived, now, list])

  return (
    <section className="mt-5 px-5" data-testid="passages">
      <div className="card p-4">
        <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span><span className="font-display block text-lg">Recitation passages</span><span className="text-xs text-muted">{list.length ? `${list.length} saved` : 'Stretches you want ready to recite'}</span></span>
          <Icon name={open ? 'up' : 'down'} className="text-muted" />
        </button>
        {open && (
          <div className="mt-3 space-y-3">
            {list.map((p) => {
              const st = passageStatus(p.range, derived, now)
              const w = words(p.range)
              return (
                <div key={p.id} className="card-flat p-3" data-testid="passage-row">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="truncate font-semibold">{p.name}</div>
                      <div className="text-xs text-muted">{rangeTitle(p.range)} · {st.ayahs} ayahs · ~{roughMinutes(w)} min</div></div>
                    <button className="btn btn-ghost btn-sm" aria-label={`Remove ${p.name}`} onClick={() => void patch({ passages: list.filter((x) => x.id !== p.id) })}><Icon name="trash" size={15} /></button>
                  </div>
                  <p className="mt-1.5 text-xs text-ink-2">{st.verified ? `Every ayah recalled and well retained${st.oldestSuccessAt ? `; the oldest check was ${agoText(st.oldestSuccessAt, now)}` : ''}.` : st.allDemonstrated ? 'All recalled at some point, but some ayahs are due for a check.' : 'Not every ayah has been recalled here yet.'}</p>
                  <div className="mt-2 flex gap-2">
                    <button className="btn btn-primary btn-sm" onClick={() => nav(rangePath('review', p.range, '?ctx=free'))} data-testid="passage-practise">Practise</button>
                    <button className="btn btn-quiet btn-sm" onClick={() => setListen(listen === p.id ? null : p.id)}><Icon name="headphones" size={14} />Listen</button>
                  </div>
                  {listen === p.id && <div className="mt-2"><AudioBar queue={Array.from({ length: p.range.end - p.range.start + 1 }, (_, i) => ({ surah: p.range.surah, ayah: p.range.start + i }))} autoKey={`passage-${p.id}`} /></div>}
                </div>
              )
            })}
            {!list.length && <p className="text-sm text-ink-2">Save a stretch you want ready to recite, such as one for prayer.</p>}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-quiet btn-sm" onClick={() => setAdd(true)} data-testid="passage-add"><Icon name="plus" size={15} />Save a passage</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSuggest((s) => !s)} data-testid="passage-suggest">Suggest from what I know</button>
            </div>
            {suggest && (
              <div className="rounded-xl bg-bg p-3" data-testid="passage-suggestions">
                {suggestions.length ? (
                  <>
                    <p className="mb-2 text-xs text-muted">Your longest unbroken stretches that you have recalled recently. The ends are simply where your verified memorisation ends. They are not recommendations for where to stop.</p>
                    <ul className="space-y-2">{suggestions.map((s) => (
                      <li key={rangeTitle(s.range)} className="flex items-center justify-between gap-2 text-sm"><span>{rangeTitle(s.range)}<span className="block text-xs text-muted">{s.ayahs} ayahs · ~{roughMinutes(s.words)} min</span></span>
                        <button className="btn btn-quiet btn-sm" onClick={() => void patch({ passages: [...list, { id: crypto.randomUUID(), name: rangeTitle(s.range), range: s.range, createdAt: Date.now() }] })}>Save</button></li>
                    ))}</ul>
                  </>
                ) : <p className="text-sm text-ink-2">No stretch of 3 or more consecutive ayahs has been recalled recently enough yet. Keep reviewing and they will appear.</p>}
              </div>
            )}
          </div>
        )}
      </div>
      <PassageSheet open={add} onClose={() => setAdd(false)} />
    </section>
  )
}
