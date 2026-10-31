import { useMemo, useState } from 'react'
import { Sheet } from './ui'
import { useApp } from '@/app/store'
import { SURAHS, ayahCount } from '@/lib/quran/data'
import { ayahKey } from '@/lib/engine/types'
import { Icon } from './Icon'

export function KnownSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const declare = useApp((s) => s.declare)
  const say = useApp((s) => s.say)
  const derived = useApp((s) => s.derived)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [q, setQ] = useState('')
  const [rs, setRs] = useState({ surah: 2, from: 1, to: 5 })
  const [busy, setBusy] = useState(false)

  const done = useMemo(() => {
    const m = new Set<number>()
    for (const s of SURAHS) {
      let all = true
      for (let a = 1; a <= s.count && all; a++) { const mem = derived.memory.get(ayahKey(s.n, a)); if (!mem || !(mem.claimed || mem.firstDemonstratedAt)) all = false }
      if (all) m.add(s.n)
    }
    return m
  }, [derived])
  const list = SURAHS.filter((s) => !q || s.tr.toLowerCase().includes(q.toLowerCase()) || String(s.n) === q.trim() || s.en.toLowerCase().includes(q.toLowerCase()))
  const toggle = (n: number) => setPicked((p) => { const x = new Set(p); x.has(n) ? x.delete(n) : x.add(n); return x })
  const quick = (from: number, to: number) => setPicked((p) => { const x = new Set(p); for (let n = from; n <= to; n++) if (!done.has(n)) x.add(n); return x })
  const maxA = ayahCount(rs.surah)
  const rangeOk = rs.from >= 1 && rs.to >= rs.from && rs.to <= maxA

  async function save() {
    setBusy(true)
    for (const n of [...picked].sort((a, b) => a - b)) await declare({ surah: n, start: 1, end: ayahCount(n) }, 'known')
    setBusy(false)
    say(picked.size ? `Marked ${picked.size} surah${picked.size > 1 ? 's' : ''} as known` : 'Nothing selected')
    setPicked(new Set())
    onClose()
  }
  async function saveRange() {
    if (!rangeOk) return
    await declare({ surah: rs.surah, start: rs.from, end: rs.to }, 'known')
    say(`Marked ${SURAHS[rs.surah - 1]!.tr} ${rs.from}–${rs.to} as known`)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="What do you already know?">
      <p className="mb-3 text-sm text-ink-2">Mark what you’ve memorised. It’s saved as <b>marked known</b> until you recall it, and Hifz OS checks it gently over time.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <button className="chip" onClick={() => quick(1, 1)}>Al-Fatihah</button>
        <button className="chip" onClick={() => quick(105, 114)}>Short surahs (105–114)</button>
        <button className="chip" onClick={() => quick(78, 114)}>Juz ʿAmma (78–114)</button>
        <button className="chip" onClick={() => setPicked(new Set())}>Clear</button>
      </div>
      <input className="mb-2 h-11 w-full rounded-xl border border-line bg-bg px-3 text-[0.95rem]" placeholder="Search surahs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search surahs" />
      <ul className="max-h-[34dvh] space-y-1 overflow-auto rounded-xl border border-line bg-bg p-1" data-testid="known-list">
        {list.map((s) => {
          const on = picked.has(s.n)
          const was = done.has(s.n)
          return (
            <li key={s.n}>
              <button disabled={was} onClick={() => toggle(s.n)} aria-pressed={on} className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left ${on ? 'bg-accent-soft' : 'hover:bg-surface-2'} ${was ? 'opacity-50' : ''}`}>
                <span className={`grid h-5 w-5 place-items-center rounded-md border ${on ? 'border-accent bg-accent text-accent-ink' : 'border-line'}`}>{on && <Icon name="check" size={13} />}</span>
                <span className="tabular w-7 text-xs text-muted">{s.n}</span>
                <span className="flex-1 text-sm font-medium">{s.tr}<span className="ml-2 text-xs font-normal text-muted">{s.count} ayahs</span></span>
                {was && <span className="text-xs text-muted">already marked</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <button className="btn btn-primary btn-lg mt-3 w-full" onClick={save} disabled={busy || !picked.size}>{picked.size ? `Mark ${picked.size} surah${picked.size > 1 ? 's' : ''} as known` : 'Select surahs above'}</button>

      <div className="hairline my-5" />
      <h3 className="font-display text-lg">Or a specific passage</h3>
      <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
        <label className="col-span-3 sm:col-span-1"><span className="eyebrow">Surah</span>
          <select className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-2" value={rs.surah} onChange={(e) => setRs({ surah: +e.target.value, from: 1, to: Math.min(5, ayahCount(+e.target.value)) })}>
            {SURAHS.map((s) => <option key={s.n} value={s.n}>{s.n}. {s.tr}</option>)}
          </select></label>
        <label><span className="eyebrow">From ayah</span><input type="number" inputMode="numeric" min={1} max={maxA} className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3" value={rs.from} onChange={(e) => setRs({ ...rs, from: +e.target.value })} /></label>
        <label><span className="eyebrow">To ayah</span><input type="number" inputMode="numeric" min={1} max={maxA} className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3" value={rs.to} onChange={(e) => setRs({ ...rs, to: +e.target.value })} /></label>
      </div>
      <button className="btn btn-quiet mt-3 w-full" onClick={saveRange} disabled={!rangeOk}>{rangeOk ? 'Mark this passage as known' : `Ayahs 1–${maxA} only`}</button>
    </Sheet>
  )
}
