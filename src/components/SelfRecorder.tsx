import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

/**
 * Optional: record your own recitation and listen back, to compare with the text and the reference recording.
 * Private by construction: the recording lives only in this page's memory. It is never saved, never uploaded, never put in a backup, and is gone when
 * you leave the screen. The microphone is asked for only when you tap the microphone. The app does not analyse it or grade it.
 */
export const canRecord = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
const pickType = () => ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t))

export type RecState = 'idle' | 'recording' | 'done' | 'denied'
export function useSelfRecorder() {
  const [state, setState] = useState<RecState>('idle')
  const [url, setUrl] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const urlRef = useRef<string | null>(null)
  const release = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null }
  useEffect(() => () => { try { if (rec.current && rec.current.state !== 'inactive') rec.current.stop() } catch { /* leaving */ } release(); if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  const start = useCallback(async () => {
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
  }, [])
  const stop = useCallback(() => { try { rec.current?.stop() } catch { setState('idle') } }, [])
  const discard = useCallback(() => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = null; setUrl(null); setState('idle') }, [])
  const dismiss = useCallback(() => setState('idle'), [])
  return { state, url, start, stop, discard, dismiss }
}
export type SelfRecorder = ReturnType<typeof useSelfRecorder>

/** The microphone: tap to record, tap again to stop. */
export function RecorderButton({ r }: { r: SelfRecorder }) {
  if (!canRecord()) return null
  const recording = r.state === 'recording'
  return (
    <button className={`tool${recording ? ' recording' : ''}`} onClick={() => void (recording ? r.stop() : r.start())} aria-pressed={recording}
      aria-label={recording ? 'Stop recording' : 'Record my recitation. It stays on this device.'} title={recording ? 'Stop recording' : 'Record my recitation (stays on this device)'}
      data-testid={recording ? 'record-stop' : 'record-start'}>
      <Icon name={recording ? 'pause' : 'mic'} size={18} />
    </button>
  )
}

/** Listen back (only when something was recorded), or a short note if the microphone could not be used. */
export function RecorderPlayback({ r }: { r: SelfRecorder }) {
  if (r.state === 'done' && r.url) {
    return (
      <div className="mt-2 flex items-center gap-2" data-testid="self-recorder" data-state="done">
        <audio controls src={r.url} className="h-10 min-w-0 flex-1" data-testid="record-playback" aria-label="Your recorded recitation. Only on this device." />
        <button className="tool" onClick={r.discard} aria-label="Discard the recording" title="Discard" data-testid="record-discard"><Icon name="x" size={16} /></button>
      </div>
    )
  }
  if (r.state === 'denied') return <p className="mt-2 text-center text-xs text-muted" role="status" data-testid="record-denied">The microphone isn’t available, so nothing was recorded. <button className="underline" onClick={r.dismiss}>OK</button></p>
  return null
}
