// Gets the bytes of one ayah's recording for phrase playback, from exactly the recording a timing file describes.
// A saved offline copy is used only if it came from that same recording; otherwise it is fetched from that recording's own host.
// If the host does not allow the app to read the file (cross-origin rules), phrase audio is simply unavailable for it, and the
// normal whole-ayah player carries on: the app never plays a different recording with another recording's timings.
import { endpointByRecording, offlineEndpoint, recordingId, urlForEndpoint } from './sources'
import { offlineAudio } from './offline'

export async function ayahBytes(reciter: string, recording: string, surah: number, ayah: number): Promise<ArrayBuffer> {
  const e = endpointByRecording(reciter, recording)
  if (!e) throw new Error('no such recording')
  const saved = offlineEndpoint(reciter)
  if (saved && recordingId(saved) === recording) {
    const blob = await offlineAudio.blob(reciter, surah, ayah)
    if (blob) return blob.arrayBuffer()
  }
  const res = await fetch(urlForEndpoint(e, surah, ayah), { mode: 'cors', credentials: 'omit' })
  if (!res.ok) throw new Error(`server said ${res.status}`)
  return res.arrayBuffer()
}
