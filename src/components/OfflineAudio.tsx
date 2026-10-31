import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useApp } from '@/app/store'
import { Sheet } from './ui'
import { Icon } from './Icon'
import { RECITERS, canSaveOffline, reciterById, saveableReciters } from '@/lib/audio/sources'
import { LARGE_NOTICE_BYTES, MAX_TOTAL_BYTES, formatBytes, offlineAudio, planRemoval, rangeLabel, type RecKey, type SaveResult, type Want } from '@/lib/audio/offline'
import { rangeTitle } from '@/lib/format'
import { surahInfo } from '@/lib/quran/data'
import type { Range } from '@/lib/engine/types'

export function useOffline() {
  useSyncExternalStore(offlineAudio.subscribe, offlineAudio.getVersion)
  return offlineAudio
}

function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine !== false)
  useEffect(() => {
    const u = () => setOn(true), d = () => setOn(false)
    window.addEventListener('online', u); window.addEventListener('offline', d)
    return () => { window.removeEventListener('online', u); window.removeEventListener('offline', d) }
  }, [])
  return on
}

/** What the user is working towards: active goals and saved passages. Recordings are "needed" when they fall inside one of these. */
export function useWants(): Want[] {
  const targets = useApp((s) => s.snap.targets)
  const passages = useApp((s) => s.snap.settings.passages)
  return useMemo(() => [
    ...targets.filter((t) => t.status === 'active').map((t) => ({ id: t.id, label: t.label ?? rangeTitle(t.range), range: t.range })),
    ...passages.map((p) => ({ id: p.id, label: p.name, range: p.range })),
  ], [targets, passages])
}

const saidResult = (r: SaveResult, ok: boolean): string | null => {
  if (r.stopped === 'space') return `Your phone is running low on space. ${r.saved} saved so far.`
  if (r.stopped === 'too-large') return `That would use more than ${formatBytes(MAX_TOTAL_BYTES)}. Remove audio you no longer use, or save a smaller part.`
  if (r.stopped === 'offline') return r.saved ? `Connection lost. ${r.saved} saved; save again to continue.` : 'No connection. Try again when you’re online.'
  if (r.stopped === 'cancelled') return `Stopped. ${r.saved} saved.`
  if (r.failed.length) return `${r.failed.length} ${r.failed.length === 1 ? 'recording' : 'recordings'} couldn’t be saved. ${r.saved ? `${r.saved} saved.` : ''} They may be temporarily unavailable.`
  return ok ? null : null
}

/** Confirm removing recordings. Media only: memorisation progress is never touched. */
/**
 * `protect`: leave recordings that another goal still needs (used when removing one goal's audio).
 * Without it (the Downloads list, where the person picked these exact recordings) everything goes, and goals that use it are named.
 */
export function RemoveAudioSheet({ open, onClose, keys, title, reciter, exceptWantId, protect = false }: { open: boolean; onClose: () => void; keys: RecKey[]; title: string; reciter: string; exceptWantId?: string; protect?: boolean }) {
  const o = useOffline()
  const wants = useWants()
  const say = useApp((s) => s.say)
  const plan = useMemo(() => {
    const p = planRemoval(keys, wants, reciter, exceptWantId)
    return protect ? p : { remove: keys, keep: p.keep }
  }, [keys, wants, reciter, exceptWantId, protect])
  const bytes = (ks: RecKey[]) => ks.reduce((n, k) => n + (o.coverage(k.reciter, { surah: k.surah, start: k.ayah, end: k.ayah }).bytes), 0)
  const labels = [...new Set(plan.keep.flatMap((k) => k.by.map((w) => w.label)))]
  const go = async (ks: RecKey[]) => { await o.remove(ks); say('Audio removed'); onClose() }
  return (
    <Sheet open={open} onClose={onClose} title="Remove saved audio?">
      <div className="space-y-3 text-sm text-ink-2" data-testid="remove-audio">
        <p className="font-medium text-ink">{title}</p>
        <p>Remove audio only. Your memorisation progress will stay saved. You can save the audio again whenever it’s available.</p>
        {plan.keep.length > 0 && (protect
          ? <p className="rounded-xl bg-brass-soft/60 p-3 text-ink" data-testid="remove-kept">{plan.keep.length} {plan.keep.length === 1 ? 'recording is' : 'recordings are'} still used by {labels.join(', ')}, so {plan.keep.length === 1 ? 'it stays' : 'they stay'}.</p>
          : <p className="rounded-xl bg-brass-soft/60 p-3 text-ink" data-testid="remove-kept">Your goal {labels.join(', ')} uses some of this audio. You can save it again whenever you like.</p>)}
      </div>
      <div className="mt-4 grid gap-2">
        {plan.remove.length > 0 && <button className="btn btn-primary btn-lg !bg-clay" onClick={() => void go(plan.remove)} data-testid="confirm-remove-audio">Remove audio · {formatBytes(bytes(plan.remove))}</button>}
        {protect && plan.keep.length > 0 && <button className="btn btn-quiet" onClick={() => void go(keys)} data-testid="remove-all-anyway">Remove all, including shared</button>}
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  )
}

/**
 * The one offline action for a stretch of Qur'an (a goal, passage or selection). It states what is true right now, in one line,
 * and offers the single next step.
 */
export function OfflineAudioCard({ range, goalId, onChanged }: { range: Range; goalId?: string; onChanged?: () => void }) {
  const o = useOffline()
  const selected = useApp((s) => s.snap.settings.reciter)
  const patch = useApp((s) => s.patchSettings)
  const online = useOnline()
  const saveable = saveableReciters()
  const [chosen, setChosen] = useState<string | null>(null)
  const [pickOpen, setPickOpen] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<SaveResult | null>(null)
  const [removing, setRemoving] = useState(false)
  const ctl = useRef<AbortController | null>(null)
  useEffect(() => () => ctl.current?.abort(), [])

  if (!o.supported) return <p className="text-sm text-muted" data-testid="offline-unsupported">Saving audio isn’t available in this browser.</p>

  const reciter = chosen ?? (canSaveOffline(selected) ? selected : saveable[0]?.id ?? selected)
  const name = reciterById(reciter).name
  const cov = o.coverage(reciter, range)
  const need = o.estimateBytes(reciter, range.surah, cov.missing)
  const selectedCantSave = !canSaveOffline(selected)
  const saving = progress !== null
  const evicted = o.evictedCount()

  async function save() {
    setResult(null); setProgress({ done: 0, total: cov.missing.length })
    ctl.current = new AbortController()
    const r = await o.save(reciter, range, { signal: ctl.current.signal, onProgress: (done, total) => setProgress({ done, total }) })
    ctl.current = null
    setProgress(null); setResult(r)
    if (r.saved > 0) o.acknowledgeEvicted()
    onChanged?.()
  }

  const note = result ? saidResult(result, cov.complete) : null
  const heading = saving ? `Saving ${progress!.done} of ${progress!.total}…`
    : cov.complete ? `Ready offline · ${formatBytes(cov.bytes)}`
    : cov.have > 0 ? `Partly saved: ${cov.have} of ${cov.total} ayahs`
    : 'Save audio for offline practice?'

  return (
    <div className="space-y-3" data-testid="offline-card" data-state={saving ? 'saving' : cov.complete ? 'ready' : cov.have > 0 ? 'partial' : 'none'}>
      <div>
        <div className="flex items-center gap-2 font-semibold" data-testid="offline-heading">{cov.complete && <Icon name="check" size={16} className="text-accent" />}{heading}</div>
        <div className="text-sm text-muted">{rangeTitle(range)} · {name}{!cov.complete && !saving ? ` · about ${formatBytes(need)}` : ''}</div>
      </div>

      {saving && (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(progress!.done / Math.max(1, progress!.total)) * 100}%` }} /></div>
          <button className="btn btn-ghost btn-sm mt-2" onClick={() => ctl.current?.abort()} data-testid="offline-cancel">Stop</button>
        </div>
      )}

      {!saving && selectedCantSave && !cov.complete && (
        <p className="text-sm text-ink-2" data-testid="offline-cant">{reciterById(selected).name} can be played online but not saved. {chosen === null ? `I’ll save ${name} instead.` : ''}</p>
      )}

      {!saving && !cov.complete && (
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" disabled={!online} onClick={() => void save()} data-testid="offline-save">{cov.have > 0 ? `Save the missing ${cov.missing.length}` : 'Save audio'}</button>
          {saveable.length > 1 && <button className="btn btn-ghost btn-sm" onClick={() => setPickOpen(true)} data-testid="offline-reciter">Different reciter</button>}
        </div>
      )}
      {!saving && !cov.complete && (online
        ? <p className="text-xs text-muted">Best on Wi-Fi. It uses mobile data otherwise.</p>
        : <p className="text-xs text-muted" data-testid="offline-no-net">You’re offline. Connect to save audio.</p>)}

      {!saving && cov.complete && reciter !== selected && (
        <button className="btn btn-quiet btn-sm" onClick={() => void patch({ reciter })} data-testid="offline-use">Use {name} for practice</button>
      )}
      {!saving && cov.have > 0 && (
        <button className="text-sm text-muted underline" onClick={() => setRemoving(true)} data-testid="offline-remove">Remove audio</button>
      )}

      {evicted > 0 && !saving && <p className="rounded-xl bg-amber-soft px-3 py-2 text-sm text-ink" data-testid="offline-evicted">Your phone cleared {evicted} saved {evicted === 1 ? 'recording' : 'recordings'} to free up space.</p>}
      {note && <p className="text-sm text-clay" role="status" data-testid="offline-note">{note}</p>}

      <RemoveAudioSheet open={removing} onClose={() => { setRemoving(false); onChanged?.() }} keys={o.keysIn(reciter, range.surah, range.start, range.end)} title={`${rangeTitle(range)} · ${name}`} reciter={selected} exceptWantId={goalId} protect />
      <Sheet open={pickOpen} onClose={() => setPickOpen(false)} title="Save with">
        <ul className="space-y-2">
          {saveable.map((r) => (
            <li key={r.id}><button className={`card-flat flex w-full items-center justify-between p-3 text-left ${r.id === reciter ? '!border-accent' : ''}`} onClick={() => { setChosen(r.id); setResult(null); setPickOpen(false) }} data-testid={`offline-pick-${r.id}`}>
              <span className="font-semibold">{r.name}</span>{r.id === reciter && <Icon name="check" className="text-accent" />}</button></li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Only reciters whose recordings can be saved are listed.</p>
      </Sheet>
    </div>
  )
}

/** One quiet line on a goal: what is saved, and a way in. Nothing at all when saving isn't possible anywhere. */
export function GoalAudioLine({ goalId, range }: { goalId: string; range: Range }) {
  const o = useOffline()
  const selected = useApp((s) => s.snap.settings.reciter)
  const [open, setOpen] = useState(false)
  if (!o.supported) return null
  const reciter = canSaveOffline(selected) ? selected : saveableReciters().find((r) => o.coverage(r.id, range).have > 0)?.id ?? selected
  const cov = o.coverage(reciter, range)
  const text = cov.complete ? 'Audio saved offline' : cov.have > 0 ? `Audio partly saved · ${cov.have} of ${cov.total}` : 'Save audio for offline'
  return (
    <>
      <button className={`mt-1.5 flex items-center gap-1.5 text-xs ${cov.complete ? 'text-accent-strong' : 'text-muted'}`} onClick={() => setOpen(true)} data-testid="goal-audio" data-state={cov.complete ? 'ready' : cov.have > 0 ? 'partial' : 'none'}>
        <Icon name={cov.complete ? 'check' : 'download'} size={14} />{text}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Offline audio"><OfflineAudioCard range={range} goalId={goalId} /></Sheet>
    </>
  )
}

/** When a goal is finished: keep or remove the audio saved for it, saying what other goals still need. */
export function GoalFinishSheet({ open, onClose, goalId, range, label, onFinish }: { open: boolean; onClose: () => void; goalId: string; range: Range; label: string; onFinish: () => void }) {
  const o = useOffline()
  const wants = useWants()
  const selected = useApp((s) => s.snap.settings.reciter)
  const keys = useMemo(() => RECITERS.flatMap((r) => o.keysIn(r.id, range.surah, range.start, range.end)), [o, range, open])  // eslint-disable-line react-hooks/exhaustive-deps
  const plan = useMemo(() => planRemoval(keys, wants, selected, goalId), [keys, wants, selected, goalId])
  const bytes = plan.remove.reduce((n, k) => n + o.coverage(k.reciter, { surah: k.surah, start: k.ayah, end: k.ayah }).bytes, 0)
  const labels = [...new Set(plan.keep.flatMap((k) => k.by.map((w) => w.label)))]
  const done = async (removeAudio: boolean) => { if (removeAudio) await o.remove(plan.remove); onFinish(); onClose() }
  return (
    <Sheet open={open} onClose={onClose} title="Goal complete">
      <div className="space-y-3 text-sm text-ink-2" data-testid="goal-finish">
        <p className="text-ink">{label} is finished. Keep the audio saved for it?</p>
        <p>Removing audio never affects your memorisation progress.</p>
        {plan.keep.length > 0 && <p className="rounded-xl bg-brass-soft/60 p-3 text-ink">{plan.keep.length} {plan.keep.length === 1 ? 'recording is' : 'recordings are'} still used by {labels.join(', ')} and will stay.</p>}
      </div>
      <div className="mt-4 grid gap-2">
        <button className="btn btn-primary btn-lg" onClick={() => void done(false)} data-testid="finish-keep">Keep audio</button>
        {plan.remove.length > 0 && <button className="btn btn-quiet" onClick={() => void done(true)} data-testid="finish-remove">Remove audio · {formatBytes(bytes)}</button>}
      </div>
    </Sheet>
  )
}

/** Settings → Offline recitations. Plain language, measured sizes, clear removal. */
export function ManageDownloads() {
  const o = useOffline()
  const wants = useWants()
  const selected = useApp((s) => s.snap.settings.reciter)
  const [removeRun, setRemoveRun] = useState<{ keys: RecKey[]; title: string; reciter: string } | null>(null)
  const [all, setAll] = useState(false)
  const say = useApp((s) => s.say)
  if (!o.supported) return <div className="p-4 text-sm text-muted">Saving audio isn’t available in this browser.</div>
  const runs = o.runs()
  const total = o.totalBytes()
  const evicted = o.evictedCount()

  return (
    <div data-testid="manage-downloads">
      <div className="p-4">
        <div className="font-medium" data-testid="downloads-total">{runs.length ? `Using ${formatBytes(total)} on this device` : 'Nothing saved for offline'}</div>
        <div className="text-xs text-muted">{runs.length ? 'Saved recitations can be removed any time. Your progress stays.' : 'Save a goal’s audio from Today, or from the audio panel.'}</div>
        {total > LARGE_NOTICE_BYTES && <div className="mt-2 rounded-xl bg-amber-soft px-3 py-2 text-xs text-ink" data-testid="downloads-large">This is a lot of space. Removing audio you no longer practise is safe.</div>}
        {evicted > 0 && <div className="mt-2 rounded-xl bg-amber-soft px-3 py-2 text-xs text-ink" data-testid="downloads-evicted">Your phone cleared {evicted} saved {evicted === 1 ? 'recording' : 'recordings'} to free up space. <button className="underline" onClick={() => o.acknowledgeEvicted()}>OK</button></div>}
      </div>
      {runs.map((r) => {
        const range: Range = { surah: r.surah, start: r.start, end: r.end }
        const users = wants.filter((w) => w.range.surah === r.surah && w.range.start <= r.end && w.range.end >= r.start)
        const forThis = r.reciter === selected ? users : []
        const short = forThis.map((w) => ({ w, c: o.coverage(r.reciter, w.range) })).find((x) => !x.c.complete)
        const status = short ? `Partial · ${short.c.have} of ${short.c.total} for ${short.w.label}` : `Ready offline · ${formatBytes(r.bytes)}`
        const title = `${surahInfo(r.surah).tr} ${rangeLabel(r.start, r.end)} — ${reciterById(r.reciter).name}`
        return (
          <div key={`${r.reciter}:${r.surah}:${r.start}`} className="flex items-center justify-between gap-3 p-4" data-testid="download-row" data-complete={short ? 'false' : 'true'}>
            <div className="min-w-0">
              <div className="break-words font-medium">{title}</div>
              <div className="text-xs text-muted">{status}{short ? ` · ${formatBytes(r.bytes)}` : ''}</div>
              {forThis.length === 0 && <div className="text-xs text-muted">Not used by a current goal</div>}
            </div>
            <button className="btn btn-ghost btn-sm flex-none" onClick={() => setRemoveRun({ keys: o.keysIn(r.reciter, range.surah, range.start, range.end), title, reciter: selected })} data-testid="download-remove">Remove audio</button>
          </div>
        )
      })}
      {runs.length > 1 && <div className="p-4"><button className="btn btn-quiet btn-sm text-clay" onClick={() => setAll(true)} data-testid="remove-all-downloads">Remove all downloads</button></div>}

      {removeRun && <RemoveAudioSheet open onClose={() => setRemoveRun(null)} keys={removeRun.keys} title={removeRun.title} reciter={removeRun.reciter} />}
      <Sheet open={all} onClose={() => setAll(false)} title="Remove all downloads?">
        <p className="text-sm text-ink-2">This removes {runs.length} saved {runs.length === 1 ? 'recitation' : 'recitations'} ({formatBytes(total)}). Remove audio only. Your memorisation progress will stay saved.</p>
        <div className="mt-4 grid grid-cols-2 gap-2"><button className="btn btn-quiet" onClick={() => setAll(false)}>Cancel</button><button className="btn btn-primary !bg-clay" onClick={async () => { await o.removeAll(); setAll(false); say('All audio removed') }} data-testid="confirm-remove-all">Remove all</button></div>
      </Sheet>
    </div>
  )
}
