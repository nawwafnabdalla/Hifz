import { useEffect, useState } from 'react'
import { useApp } from '@/app/store'
import { findTiming, wholeAyahPlayable, type AyahTiming, type RecordingTimings } from './timings'

export interface PhraseTimingState {
  /** 'loading' only while the (local, small) timing file is being read. */
  status: 'loading' | 'ready' | 'none'
  timing: AyahTiming | null
  /** The recording the timing describes; the audio is always taken from exactly this one. */
  recording: string | null
  rec: RecordingTimings | null
  reciter: string
}

/** Whether the chosen reciter has verified word timings for this ayah. Never shares timings across reciters or recordings. */
export function usePhraseTiming(surah: number, ayah: number): PhraseTimingState {
  const reciter = useApp((s) => s.snap.settings.reciter)
  const [st, setSt] = useState<PhraseTimingState>({ status: 'loading', timing: null, recording: null, rec: null, reciter })
  useEffect(() => {
    let live = true
    setSt({ status: 'loading', timing: null, recording: null, rec: null, reciter })
    void findTiming(reciter, surah, ayah).then((f) => { if (live) setSt(f && wholeAyahPlayable(f.timing) ? { status: 'ready', timing: f.timing, recording: f.rec.provenance.recording, rec: f.rec, reciter } : { status: 'none', timing: null, recording: null, rec: null, reciter }) })
    return () => { live = false }
  }, [reciter, surah, ayah])
  return st
}
