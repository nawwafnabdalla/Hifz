import { useEffect, useState } from 'react'
import { useApp } from '@/app/store'
import { reciterById, recordingId } from './sources'
import { ayahTiming, hasTimings, type AyahTiming } from './timings'

export interface PhraseTimingState {
  /** 'loading' only while the (local, small) timing file is being read. */
  status: 'loading' | 'ready' | 'none'
  timing: AyahTiming | null
  /** The recording the timing describes; the audio is always taken from exactly this one. */
  recording: string | null
  reciter: string
}

/** Whether the chosen reciter has verified word timings for this ayah's recording. Never shares timings across reciters or recordings. */
export function usePhraseTiming(surah: number, ayah: number): PhraseTimingState {
  const reciter = useApp((s) => s.snap.settings.reciter)
  const [st, setSt] = useState<PhraseTimingState>({ status: 'loading', timing: null, recording: null, reciter })
  useEffect(() => {
    let live = true
    setSt({ status: 'loading', timing: null, recording: null, reciter })
    void (async () => {
      for (const e of reciterById(reciter).endpoints) {
        const rec = recordingId(e)
        if (!(await hasTimings(reciter, rec))) continue
        const t = await ayahTiming(reciter, rec, surah, ayah)
        if (live && t) { setSt({ status: 'ready', timing: t, recording: rec, reciter }); return }
      }
      if (live) setSt({ status: 'none', timing: null, recording: null, reciter })
    })()
    return () => { live = false }
  }, [reciter, surah, ayah])
  return st
}
