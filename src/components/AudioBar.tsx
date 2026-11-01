import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { AyahPlayer, type PlayerState } from '@/lib/audio/player'
import { RECITERS, hasAyahCandidates, reciterById } from '@/lib/audio/sources'
import { reciterStatus, subscribeStatus } from '@/lib/audio/status'
import { fullSurahAudio, type SurahAudio } from '@/lib/audio/mp3quran'
import type { AyahRef } from '@/lib/engine/types'
import { useApp } from '@/app/store'
import { Icon } from './Icon'
import { Sheet } from './ui'
import { OfflineAudioCard } from './OfflineAudio'
import { offlineAudio } from '@/lib/audio/offline'
import { phrasePlayer } from '@/lib/audio/phraseAudio'

let player: AyahPlayer | null = null
export function getPlayer(): AyahPlayer {
  player ??= new AyahPlayer(new Audio() as never, offlineAudio)
  return player
}
export function usePlayerState(): PlayerState {
  const p = getPlayer()
  return useSyncExternalStore((cb) => p.subscribe(cb), () => p.state)
}

const RATES = [0.75, 1, 1.25]
const REPEATS = [1, 2, 3, 5, 10]
const MINE = ['turki', 'dossary', 'maher']
const PAUSES: { v: 0 | 1 | 1.5 | 2; label: string; hint: string }[] = [
  { v: 1, label: '1×', hint: 'as long as the ayah' },
  { v: 1.5, label: '1.5×', hint: 'a little longer' },
  { v: 2, label: '2×', hint: 'twice as long' },
  { v: 0, label: 'Tap', hint: 'wait until you tap Continue' },
]

/** The dot beside a reciter: what this device has actually observed, never an assumption. */
function StatusDot({ id }: { id: string }) {
  useSyncExternalStore(subscribeStatus, () => reciterStatus(id).at ?? 0)
  const s = reciterStatus(id)
  const cls = s.state === 'confirmed' ? 'bg-accent' : s.state === 'unavailable' || !hasAyahCandidates(id) ? 'bg-clay' : 'bg-line'
  const label = s.state === 'confirmed' ? `Verse-by-verse confirmed${s.via ? ` via ${s.via}` : ''}` : s.state === 'unavailable' || !hasAyahCandidates(id) ? 'No verse-by-verse audio available' : 'Not yet checked on this device'
  return <span className={`inline-block h-2.5 w-2.5 flex-none rounded-full ${cls}`} title={label} aria-label={label} />
}

export function AudioBar({ queue, autoKey, onListened, surahForFull }: { queue: AyahRef[]; autoKey?: string; onListened?: () => void; surahForFull?: number }) {
  const st = usePlayerState()
  const settings = useApp((s) => s.snap.settings)
  const patch = useApp((s) => s.patchSettings)
  const [pick, setPick] = useState(false)
  const [moreReciters, setMoreReciters] = useState(false)
  const [loop, setLoop] = useState(false)
  // A reciter used instead of the saved one, only on this screen, and always announced.
  const [override, setOverride] = useState<string | null>(null)
  const [full, setFull] = useState<SurahAudio | 'loading' | null>(null)
  const p = getPlayer()

  const chosen = override ?? settings.reciter
  const reciter = reciterById(chosen)
  const saved = reciterById(settings.reciter)
  const echo = settings.practiceMode === 'echo'
  const surah = surahForFull ?? queue[0]?.surah
  const targets = useApp((s) => s.snap.targets)
  // The one offline offer this screen can make: the goal this practice belongs to, else a multi-ayah selection.
  const offerRange = useMemo(() => {
    if (!queue.length || queue.some((q) => q.surah !== queue[0]!.surah)) return null
    const span = { surah: queue[0]!.surah, start: Math.min(...queue.map((q) => q.ayah)), end: Math.max(...queue.map((q) => q.ayah)) }
    const goal = targets.find((t) => t.status === 'active' && t.range.surah === span.surah && t.range.start <= span.start && t.range.end >= span.end)
    return goal ? { range: goal.range, goalId: goal.id } : queue.length > 1 ? { range: span, goalId: undefined } : null
  }, [queue, targets])

  useEffect(() => () => { p.stop() }, [autoKey, p])
  useEffect(() => { setOverride(null); setFull(null) }, [autoKey, settings.reciter])
  useEffect(() => { if (st.plays > 0) onListened?.() }, [st.plays, onListened])
  useEffect(() => {
    if (!('mediaSession' in navigator) || !st.current) return
    navigator.mediaSession.metadata = new MediaMetadata({ title: `Surah ${st.current.surah}, ayah ${st.current.ayah}`, artist: reciterById(st.reciterId).name, album: 'Hifz OS' })
    navigator.mediaSession.setActionHandler('play', () => p.play())
    navigator.mediaSession.setActionHandler('pause', () => p.pause())
    navigator.mediaSession.setActionHandler('nexttrack', () => p.next())
    navigator.mediaSession.setActionHandler('previoustrack', () => p.prev())
  }, [st.current?.surah, st.current?.ayah, st.reciterId, p, st])

  const playing = st.status === 'playing' || st.status === 'loading'
  const start = (id = chosen) => { phrasePlayer.stop(); p.load(queue, { reciterId: id, repeatEach: settings.repeatEach, repeatPassage: loop ? 'infinite' : 1, rate: settings.playbackRate, gapMs: 250, echoPause: echo ? settings.echoPause : undefined }) }
  const onPlay = () => (st.status === 'idle' || st.status === 'error' ? start() : p.toggle())

  const fallbackId = useMemo(() => {
    const confirmed = RECITERS.find((r) => r.id !== chosen && reciterStatus(r.id).state === 'confirmed')
    return (confirmed ?? RECITERS.find((r) => r.id === 'alafasy')!).id
  }, [chosen, st.status])
  const fallback = reciterById(fallbackId)

  async function showFull() {
    if (!surah) return
    setFull('loading')
    setFull(await fullSurahAudio(chosen, surah))
  }

  // Only says something when there is something to say; an idle bar is just play, reciter and Echo.
  const line = st.status === 'error' ? <span className="text-clay">{st.error}</span>
    : st.waiting ? <span className="font-semibold text-accent">Your turn. Tap Continue when you’re done.</span>
    : st.phase === 'recite' && st.status === 'playing' ? <span className="font-semibold text-accent">Your turn · {st.silenceSeconds}s</span>
    : st.status === 'loading' ? 'Loading…'
    : (st.status === 'playing' || st.status === 'paused') && st.current ? `Ayah ${st.current.ayah}${st.ayahRepeat ? ` · repeat ${st.ayahRepeat + 1}` : ''}${st.saved ? ' · saved offline' : ''}`
    : null

  return (
    <div className="card-flat p-3" data-testid="audio-bar">
      <div className="flex items-center gap-2">
        <button className="btn btn-primary h-12 w-12 flex-none !min-h-0 !p-0 rounded-full" onClick={onPlay} aria-label={playing ? 'Pause' : 'Play recitation'} data-testid="audio-play">
          <Icon name={playing ? 'pause' : 'play'} size={20} />
        </button>
        {queue.length > 1 && (
          <>
            <button className="btn btn-ghost btn-sm !px-2" onClick={() => p.prev()} aria-label="Previous ayah"><Icon name="back" size={16} /></button>
            <button className="btn btn-ghost btn-sm !px-2" onClick={() => p.next()} aria-label="Next ayah"><Icon name="skip" size={16} /></button>
          </>
        )}
        <button className="flex min-w-0 flex-1 items-center gap-1.5 px-1 text-left text-[0.95rem] font-semibold leading-tight" onClick={() => setPick(true)} data-testid="reciter-chip" aria-label={`Audio: ${reciter.name}. Tap to change reciter or options`}>
          <StatusDot id={chosen} /><span className="min-w-0 break-words">{reciter.name}</span><Icon name="down" size={13} className="flex-none text-muted" />
        </button>
        <button className="chip flex-none" aria-pressed={echo} onClick={() => void patch(echo ? { practiceMode: 'listen' } : { practiceMode: 'echo', repeatEach: Math.max(settings.repeatEach, 3) })} data-testid="echo-toggle" aria-label="Echo mode: leave a pause to recite after each ayah"><Icon name="mic" size={14} />Echo</button>
      </div>
      {line && <div className="mt-1.5 truncate pl-1 text-xs text-muted" aria-live="polite" data-testid="audio-status">{line}</div>}

      {override && (
        <div className="mt-2 rounded-xl bg-amber-soft px-3 py-2 text-xs text-ink" data-testid="fallback-notice">
          Playing <b>{reciterById(override).name}</b> on this screen instead of {saved.name}. <button className="underline" onClick={() => { setOverride(null); p.stop() }}>Switch back</button>
        </div>
      )}

      {st.waiting && <button className="btn btn-primary mt-2 w-full" onClick={() => p.continue()} data-testid="echo-continue">Continue</button>}

      {st.unavailable && (
        <div className="mt-2 space-y-2 rounded-xl bg-clay-soft p-3 text-sm" data-testid="unavailable">
          <p className="text-ink"><b>{reciter.name}</b> has no verse-by-verse recording that loads here. I won’t play a different reciter under this name.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-quiet btn-sm" onClick={() => { setOverride(fallbackId); start(fallbackId) }} data-testid="use-fallback">Use {fallback.name} for this screen</button>
            {reciter.mp3quran && <button className="btn btn-quiet btn-sm" onClick={() => void showFull()} data-testid="play-full">Play the full surah</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => p.retry()}>Try again</button>
          </div>
        </div>
      )}
      {full === 'loading' && <p className="mt-2 text-xs text-muted">Looking up the full-surah recording…</p>}
      {full && full !== 'loading' && (
        full.ok ? (
          <div className="mt-2 rounded-xl bg-bg p-2" data-testid="full-surah">
            <p className="mb-1 px-1 text-xs text-muted">{full.label}. Whole surah only: it can’t be looped by ayah.</p>
            <audio controls preload="none" src={full.url} className="w-full" />
          </div>
        ) : <p className="mt-2 text-xs text-clay" data-testid="full-surah-error">{full.reason}</p>
      )}

      <Sheet open={pick} onClose={() => setPick(false)} title="Audio">
        <div className="space-y-5 text-sm">
          <div>
            <div className="eyebrow mb-2">Reciter</div>
            <ul className="space-y-2">
              {[...RECITERS].sort((a, b) => (MINE.includes(b.id) ? 1 : 0) - (MINE.includes(a.id) ? 1 : 0)).map((r, i) => {
                const s = reciterStatus(r.id)
                const detail = !hasAyahCandidates(r.id) ? 'Full surah only' : s.state === 'unavailable' ? 'Didn’t load on this device' : r.note ?? ''
                return (
                  <li key={r.id} hidden={i >= MINE.length && !moreReciters}>
                    <button className={`card-flat flex w-full items-center justify-between gap-3 p-3 text-left ${r.id === settings.reciter ? '!border-accent' : ''}`}
                      onClick={() => { void patch({ reciter: r.id }); setOverride(null); p.setReciter(r.id); setPick(false) }} data-testid={`reciter-${r.id}`}>
                      <span className="flex min-w-0 items-center gap-2.5"><StatusDot id={r.id} />
                        <span className="min-w-0"><span className="block truncate font-semibold">{r.name}{r.arabic && <span lang="ar" dir="rtl" className="ml-2 font-[family-name:var(--font-arabic)] text-base font-normal text-ink-2">{r.arabic}</span>}</span>
                          {detail && <span className="block truncate text-xs text-muted">{detail}</span>}</span></span>
                      {r.id === settings.reciter && <Icon name="check" className="text-accent" />}
                    </button>
                  </li>
                )
              })}
            </ul>
            {!moreReciters && <button className="mt-2 text-sm text-muted underline" onClick={() => setMoreReciters(true)} data-testid="more-reciters">More reciters</button>}
          </div>

          <div>
            <div className="eyebrow mb-2">Practice</div>
            <div className="grid grid-cols-2 gap-2">
              <button className="chip justify-center" aria-pressed={!echo} onClick={() => void patch({ practiceMode: 'listen' })}>Listen</button>
              <button className="chip justify-center" aria-pressed={echo} onClick={() => void patch({ practiceMode: 'echo', repeatEach: Math.max(settings.repeatEach, 3) })}>Echo</button>
            </div>
            {echo && (
              <div className="mt-3">
                <div className="mb-1.5 text-xs text-muted">Pause length</div>
                <div className="grid grid-cols-4 gap-2">{PAUSES.map((o) => <button key={o.v} className="chip justify-center" aria-pressed={settings.echoPause === o.v} onClick={() => void patch({ echoPause: o.v })} title={o.hint}>{o.label}</button>)}</div>
                <p className="mt-1.5 text-xs text-muted">{PAUSES.find((o) => o.v === settings.echoPause)?.hint}.</p>
              </div>
            )}
          </div>

          <details data-testid="audio-more">
            <summary className="cursor-pointer select-none text-sm font-medium">More options</summary>
            <div className="mt-3 space-y-4">
              <div><div className="mb-1.5 text-xs text-muted">Repeat each ayah</div><div className="flex flex-wrap gap-2">{REPEATS.map((n) => <button key={n} className="chip tabular" aria-pressed={settings.repeatEach === n} onClick={() => { void patch({ repeatEach: n }); p.setRepeat(n) }}>{n}×</button>)}</div></div>
              <div><div className="mb-1.5 text-xs text-muted">Speed</div><div className="flex gap-2">{RATES.map((r) => <button key={r} className="chip tabular" aria-pressed={settings.playbackRate === r} onClick={() => { void patch({ playbackRate: r }); p.setRate(r) }}>{r}×</button>)}</div></div>
              {queue.length > 1 && (
                <label className="flex items-center justify-between gap-3"><span>Loop the whole passage</span>
                  <button role="switch" aria-checked={loop} aria-label="Loop passage" onClick={() => setLoop((l) => !l)} className={`relative h-7 w-12 flex-none rounded-full transition-colors ${loop ? 'bg-accent' : 'bg-line'}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${loop ? 'left-[22px]' : 'left-0.5'}`} /></button></label>
              )}
            </div>
          </details>

          {offerRange && (
            <div className="rounded-2xl border border-line p-3" data-testid="audio-offline">
              <OfflineAudioCard range={offerRange.range} goalId={offerRange.goalId} />
            </div>
          )}
        </div>
      </Sheet>
    </div>
  )
}
