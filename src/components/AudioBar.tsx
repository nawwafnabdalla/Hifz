import { useEffect, useState, useSyncExternalStore } from 'react'
import { AyahPlayer, type PlayerState } from '@/lib/audio/player'
import { RECITERS, reciterById } from '@/lib/audio/sources'
import type { AyahRef } from '@/lib/engine/types'
import { useApp } from '@/app/store'
import { Icon } from './Icon'
import { Sheet } from './ui'

let player: AyahPlayer | null = null
export function getPlayer(): AyahPlayer {
  player ??= new AyahPlayer(new Audio() as never)
  return player
}
export function usePlayerState(): PlayerState {
  const p = getPlayer()
  return useSyncExternalStore((cb) => p.subscribe(cb), () => p.state)
}

const RATES = [0.75, 1, 1.25]
const REPEATS = [1, 3, 5, 10]

export function AudioBar({ queue, autoKey, onListened }: { queue: AyahRef[]; autoKey?: string; onListened?: () => void }) {
  const st = usePlayerState()
  const settings = useApp((s) => s.snap.settings)
  const patch = useApp((s) => s.patchSettings)
  const [rate, setRate] = useState(1)
  const [rep, setRep] = useState(1)
  const [pick, setPick] = useState(false)
  const p = getPlayer()

  useEffect(() => () => { p.stop() }, [autoKey, p])
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
  const start = () => p.load(queue, { reciterId: settings.reciter, repeatEach: rep, repeatPassage: 1, rate, gapMs: 250 })
  const onPlay = () => (st.status === 'idle' || st.status === 'error' ? start() : p.toggle())
  const reciter = reciterById(settings.reciter)

  return (
    <div className="card-flat p-3" data-testid="audio-bar">
      <div className="flex items-center gap-2">
        <button className="btn btn-primary h-12 w-12 !min-h-0 !p-0 rounded-full" onClick={onPlay} aria-label={playing ? 'Pause' : 'Play recitation'} data-testid="audio-play">
          <Icon name={playing ? 'pause' : 'play'} size={20} />
        </button>
        {queue.length > 1 && (
          <>
            <button className="btn btn-ghost btn-sm !px-2" onClick={() => p.prev()} aria-label="Previous ayah"><Icon name="back" size={16} /></button>
            <button className="btn btn-ghost btn-sm !px-2" onClick={() => p.next()} aria-label="Next ayah"><Icon name="skip" size={16} /></button>
          </>
        )}
        <div className="min-w-0 flex-1 px-1">
          <button className="block max-w-full truncate text-left text-sm font-semibold" onClick={() => setPick(true)}>{reciter.name}</button>
          <div className="truncate text-xs text-muted" aria-live="polite">
            {st.status === 'error' ? <span className="text-clay">{st.error}</span>
              : st.status === 'loading' ? 'Loading…'
              : st.status === 'playing' && st.current ? `Ayah ${st.current.ayah}${st.ayahRepeat ? ` · repeat ${st.ayahRepeat + 1}` : ''}${st.via ? ` · ${st.via}` : ''}`
              : st.error ?? 'Tap play to listen'}
          </div>
        </div>
        <button className="chip tabular" onClick={() => { const n = RATES[(RATES.indexOf(rate) + 1) % RATES.length]!; setRate(n); p.setRate(n) }} aria-label={`Speed ${rate}×`}>{rate}×</button>
        <button className="chip tabular" onClick={() => setRep(REPEATS[(REPEATS.indexOf(rep) + 1) % REPEATS.length]!)} aria-label={`Repeat each ayah ${rep} times`}><Icon name="repeat" size={14} />{rep}</button>
      </div>
      {st.status === 'error' && <div className="mt-2 flex gap-2"><button className="btn btn-quiet btn-sm" onClick={() => p.retry()}>Try again</button><button className="btn btn-ghost btn-sm" onClick={() => setPick(true)}>Choose another reciter</button></div>}
      <Sheet open={pick} onClose={() => setPick(false)} title="Reciter">
        <ul className="space-y-2">
          {RECITERS.map((r) => (
            <li key={r.id}>
              <button className={`card-flat flex w-full items-center justify-between gap-3 p-3 text-left ${r.id === settings.reciter ? '!border-accent' : ''}`}
                onClick={() => { void patch({ reciter: r.id }); p.setReciter(r.id); setPick(false) }}>
                <span><span className="block font-semibold">{r.name}</span><span className="block text-xs text-muted">{r.style}{r.note ? ` · ${r.note}` : ''}</span></span>
                {r.id === settings.reciter && <Icon name="check" className="text-accent" />}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Audio is streamed from third-party hosts and is not stored by this app. Availability varies by reciter and host.</p>
      </Sheet>
    </div>
  )
}
