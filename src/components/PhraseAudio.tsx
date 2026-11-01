import { useEffect, useState, useSyncExternalStore } from 'react'
import { useApp } from '@/app/store'
import { Icon } from './Icon'
import { getPlayer } from './AudioBar'
import { phrasePlayer, type PhraseState, type UnavailableReason } from '@/lib/audio/phraseAudio'
import { ayahBytes } from '@/lib/audio/phraseSource'
import { usePhraseTiming } from '@/lib/audio/usePhraseTiming'
import { reciterById } from '@/lib/audio/sources'
import type { Phrase } from '@/lib/engine/phrases'

const REPEATS = [1, 3, 5]
const WHY: Record<UnavailableReason, string> = {
  'no-audio': 'The recording could not be read here',
  'wrong-recording': 'This recording does not match its timings',
  'no-range': 'This part cannot be isolated',
  'no-pause': 'The reciter does not pause cleanly at this point',
}

export function usePhraseState(): PhraseState {
  return useSyncExternalStore((cb) => phrasePlayer.subscribe(cb), () => phrasePlayer.state)
}

/** Plays exactly the words [fromWord, toWord] of an ayah in the chosen reciter's own voice. Falls back to the whole ayah when that is not possible. */
function usePlayPart(surah: number, ayah: number) {
  const settings = useApp((s) => s.snap.settings)
  const pt = usePhraseTiming(surah, ayah)
  const [fellBack, setFellBack] = useState<string | null>(null)
  const play = async (fromWord: number, toWord: number) => {
    if (!pt.timing || !pt.recording || !pt.rec) return
    setFellBack(null)
    getPlayer().stop()
    const echo = settings.practiceMode === 'echo'
    const factor = echo ? (settings.echoPause === 0 ? 1 : settings.echoPause) : 0
    const reason = await phrasePlayer.play({
      // A whole-surah recording is decoded as a window around THIS phrase, so the cache key includes the range.
      key: `${pt.reciter}|${pt.recording}|${surah}:${ayah}${pt.rec!.provenance.granularity === 'surah' ? `|${fromWord}-${toWord}` : ''}`,
      timing: pt.timing, fromWord, toWord, repeat: settings.repeatEach,
      gapSec: (len) => (factor ? len * factor : 0.5),
      bytes: (prop) => ayahBytes(pt.reciter, pt.rec!, surah, ayah, pt.timing!, prop),
    })
    if (reason) {                                   // graceful fallback: the whole ayah, in the same reciter, and say so
      setFellBack(`${WHY[reason]}. Playing the whole ayah instead.`)
      getPlayer().load([{ surah, ayah }], { reciterId: pt.reciter, repeatEach: settings.repeatEach, repeatPassage: 1, rate: settings.playbackRate, gapMs: 250 })
    }
  }
  return { pt, play, fellBack, settings }
}

function RepeatChips() {
  const repeat = useApp((s) => s.snap.settings.repeatEach)
  const patch = useApp((s) => s.patchSettings)
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Repeat this part">
      {REPEATS.map((n) => <button key={n} className="chip tabular !px-2.5" aria-pressed={repeat === n} onClick={() => void patch({ repeatEach: n })} data-testid={`repeat-${n}`}>{n}×</button>)}
    </div>
  )
}

function Status({ st }: { st: PhraseState }) {
  if (st.status === 'loading') return <span>Loading…</span>
  if (st.status === 'playing') return st.phrase === 'recite' ? <span className="font-semibold text-accent">Your turn</span> : <span>Listening{st.total > 1 ? ` · ${st.repeat} of ${st.total}` : ''}</span>
  return null
}

/** Flow stage: hear exactly the part of the ayah you are practising (A, or A → B, …), repeat it, then say it. */
export function HearThisPart({ surah, ayah, phrases, from, to }: { surah: number; ayah: number; phrases: Phrase[]; from: number; to: number }) {
  const { pt, play, fellBack } = usePlayPart(surah, ayah)
  const st = usePhraseState()
  useEffect(() => () => phrasePlayer.stop(), [from, to, ayah])
  if (pt.status !== 'ready') return null
  const busy = st.status === 'playing' || st.status === 'loading'
  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface p-3" data-testid="hear-part">
      <div className="flex items-center justify-between gap-2">
        <button className="btn btn-quiet" onClick={() => (busy ? phrasePlayer.stop() : void play(phrases[from]!.from, phrases[to]!.to))} data-testid="hear-part-play" aria-label={busy ? 'Stop' : 'Hear this part'}>
          <Icon name={busy ? 'pause' : 'headphones'} size={16} />{busy ? 'Stop' : 'Hear this part'}
        </button>
        <RepeatChips />
      </div>
      <div className="mt-1.5 min-h-4 text-xs text-muted" aria-live="polite" data-testid="hear-part-status"><Status st={st} /></div>
      {fellBack && <p className="mt-1 text-xs text-clay" data-testid="hear-part-fallback">{fellBack}</p>}
    </div>
  )
}

/** Sound stage: tap a phrase to hear only that phrase, in the reciter's own voice. */
export function PhraseChips({ surah, ayah, phrases }: { surah: number; ayah: number; phrases: Phrase[] }) {
  const { pt, play, fellBack } = usePlayPart(surah, ayah)
  const st = usePhraseState()
  const [which, setWhich] = useState<number | null>(null)
  useEffect(() => () => phrasePlayer.stop(), [ayah])
  if (pt.status !== 'ready' || phrases.length < 2) return null
  const busy = st.status === 'playing' || st.status === 'loading'
  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface p-3" data-testid="phrase-chips">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Hear a phrase on its own</span>
        <RepeatChips />
      </div>
      <div className="flex flex-wrap gap-2">
        {phrases.map((p) => (
          <button key={p.index} className="chip" aria-pressed={busy && which === p.index} onClick={() => { setWhich(p.index); void play(p.from, p.to) }} data-testid={`phrase-chip-${p.index}`} aria-label={`Hear phrase ${String.fromCharCode(65 + p.index)}`}>
            <Icon name="play" size={12} />{String.fromCharCode(65 + p.index)}
          </button>
        ))}
        {busy && <button className="btn btn-ghost btn-sm" onClick={() => phrasePlayer.stop()}>Stop</button>}
      </div>
      <div className="mt-1.5 min-h-4 text-xs text-muted" aria-live="polite" data-testid="phrase-status"><Status st={st} /></div>
      {fellBack && <p className="mt-1 text-xs text-clay" data-testid="phrase-fallback">{fellBack}</p>}
      <p className="sr-only">Played in {reciterById(pt.reciter).name}'s own recording.</p>
    </div>
  )
}
