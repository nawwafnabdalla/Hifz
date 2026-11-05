import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

/**
 * Optional: record your own recitation and listen back, to compare with the text and with the reference recording.
 * Private by construction: the recording lives only in this page's memory. It is never saved, never uploaded, never put in a backup, and is gone when
 * you leave the screen. The microphone is asked for only when you tap "Record". The app does not analyse it or grade it.
 */
export const canRecord = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

const pickType = () => ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t))

export function SelfRecorder() {
  const [state, setState] = useState<'idle' | 'recording' | 'done' | 'denied'>('idle')
  const [url, setUrl] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const urlRef = useRef<string | null>(null)

  const release = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null }
  useEffect(() => () => { try { if (rec.current && rec.current.state !== 'inactive') rec.current.stop() } catch { /* leaving */ } release(); if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])
  if (!canRecord()) return null

  async function start() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.current = s
      const type = pickType()
      const r = new MediaRecorder(s, type ? { mimeType: type } : undefined)
      chunks.current = []
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data) }
      r.onstop = () => {
        const blob = new Blob(chunks.current, { type: r.mimeType || type || 'audio/webm' })
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = URL.createObjectURL(blob)
        setUrl(urlRef.current); setState('done'); release()
      }
      rec.current = r; r.start(); setState('recording')
    } catch { release(); setState('denied') }
  }
  const stop = () => { try { rec.current?.stop() } catch { setState('idle') } }
  const discard = () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = null; setUrl(null); setState('idle') }

  return (
    <div className="mt-3 rounded-2xl bg-surface-2/60 px-3 py-2.5 text-center" data-testid="self-recorder" data-state={state}>
      {state === 'idle' && (
        <>
          <button className="btn btn-ghost btn-sm" onClick={() => void start()} data-testid="record-start"><Icon name="mic" size={15} />Record my recitation</button>
          <p className="mt-1 text-xs text-muted">Optional. Stays on this device: never saved or uploaded.</p>
        </>
      )}
      {state === 'recording' && (
        <button className="btn btn-primary btn-sm" onClick={stop} data-testid="record-stop" aria-live="polite"><span className="inline-block h-2.5 w-2.5 rounded-full bg-current" aria-hidden="true" />Recording… tap to stop</button>
      )}
      {state === 'done' && url && (
        <div>
          <div className="text-xs font-semibold text-ink-2">Your recitation · not saved</div>
          <audio controls src={url} className="mt-1 h-10 w-full" data-testid="record-playback" aria-label="Your recorded recitation" />
          <p className="mt-1 text-xs text-muted">Listen, then compare it with the text and the reference recording. The app can’t judge pronunciation or tajweed.</p>
          <button className="btn btn-ghost btn-sm mt-1" onClick={discard} data-testid="record-discard">Discard and record again</button>
        </div>
      )}
      {state === 'denied' && (
        <p className="text-xs text-ink-2" role="status" data-testid="record-denied">The microphone isn’t available (permission was declined, or this browser blocks it). Nothing was recorded. <button className="underline" onClick={() => setState('idle')}>Try again</button></p>
      )}
    </div>
  )
}
