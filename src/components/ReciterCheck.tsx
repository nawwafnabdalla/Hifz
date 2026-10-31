import { useState } from 'react'
import { checkMyReciters, type ReciterCheck as Result } from '@/lib/audio/check'
import { Icon } from './Icon'

const tone = (s: 'ok' | 'fail' | 'none') => (s === 'ok' ? 'text-accent' : s === 'fail' ? 'text-clay' : 'text-muted')
const mark = (s: 'ok' | 'fail' | 'none') => (s === 'ok' ? '✓' : s === 'fail' ? '✗' : '–')

/** One tap: really try each of the three reciters' files (Ta-Ha) and report what loaded on this device. */
export function ReciterCheck() {
  const [res, setRes] = useState<Result[] | null>(null)
  const [busy, setBusy] = useState(false)
  async function run() { setBusy(true); setRes(null); setRes(await checkMyReciters()); setBusy(false) }
  return (
    <div data-testid="reciter-check">
      <button className="btn btn-quiet w-full" onClick={() => void run()} disabled={busy} data-testid="run-reciter-check"><Icon name="headphones" size={16} />{busy ? 'Checking… (about 30 seconds)' : 'Check my three reciters on this device'}</button>
      {res && (
        <ul className="mt-3 space-y-3 text-sm" data-testid="reciter-check-results">
          {res.map((r) => (
            <li key={r.id} className="card-flat p-3">
              <div className="font-semibold">{r.name}</div>
              <div className={`mt-1 flex gap-2 ${tone(r.verse.state)}`}><span className="w-4 flex-none">{mark(r.verse.state)}</span><span><b>Verse by verse:</b> {r.verse.detail}</span></div>
              <div className={`mt-1 flex gap-2 ${tone(r.full.state)}`}><span className="w-4 flex-none">{mark(r.full.state)}</span><span><b>Full surah:</b> {r.full.detail}</span></div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted">This tests real audio files for Ta-Ha (first, middle and last ayah), not directory listings. Nothing is downloaded beyond file headers.</p>
    </div>
  )
}

export function AudioCredits() {
  const a = (href: string, label: string) => <a className="underline" href={href} target="_blank" rel="noopener noreferrer">{label}</a>
  return (
    <p className="text-xs text-muted" data-testid="audio-credits">
      Recitations are streamed, never stored or redistributed by this app. Verse-by-verse files come from {a('https://everyayah.com', 'EveryAyah.com')} (it publishes no licence; the recordings belong to the reciters, so please use them for personal study and credit the reciters), and full surahs from {a('https://mp3quran.net', 'MP3Quran')}.
    </p>
  )
}
