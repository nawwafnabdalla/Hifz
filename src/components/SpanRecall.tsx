import { useRef, useState } from 'react'
import { AyahWords } from './Arabic'
import { Icon } from './Icon'
import { GradeGrid } from './GradeGrid'
import { useApp } from '@/app/store'
import { wordsOfAyah } from '@/lib/quran/data'
import type { Grade, PartEvent } from '@/lib/engine/types'
import { hintWordFor } from '@/lib/engine/hints'

/**
 * Recall part of an ayah from memory: recite aloud, tap the concealed text to check it, grade with one tap. If it went wrong, tap the word where it slipped
 * (optional) and the app practises exactly that spot. The result is saved as evidence for those words only: it never counts as having memorised the ayah.
 * The first word may be shown as a hint, which lowers the evidence and rules out "on my own".
 */
export function SpanRecall({ surah, ayah, from, to, label, hintFrom, hintName, onDone }: {
  surah: number; ayah: number; from: number; to: number; label: string
  /** The word the first-word hint reveals (absolute index in the ayah): the first word of the part being added. Defaults to the first word of the range. */
  hintFrom?: number
  /** Name of the part that hint belongs to ("B"), shown on the button when it is not the start of the range. */
  hintName?: string
  onDone: (e: PartEvent) => void
}) {
  const hintWord = hintWordFor(from, to, hintFrom)
  const logPart = useApp((s) => s.logPart)
  const [revealed, setRevealed] = useState(false)
  const [hint, setHint] = useState(false)
  const [slip, setSlip] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(Date.now())
  const total = wordsOfAyah(surah, ayah).length

  async function grade(g: Grade) {
    if (busy || (hint && g === 'independent')) return
    setBusy(true)
    const bad = g === 'prompted' || g === 'failed'
    const e = await logPart({
      surah, ayah, fromWord: from, toWord: to, wordCount: total, grade: g, cueLevel: hint ? 3 : 4,
      slipWord: bad && slip !== null ? slip : undefined, durationMs: Math.min(Date.now() - started.current, 10 * 60_000),
    })
    onDone(e)
  }

  const hintLabel = hint ? 'First word shown' : hintWord > from && hintName ? `Hint: first word of ${hintName}` : 'Hint: first word'
  return (
    <div className="px-4" data-testid="span-recall">
      <h2 className="mb-3 text-center text-sm font-semibold tracking-wide text-muted">{label}</h2>
      <div className="py-2">
        <p className="arabic center" lang="ar" dir="rtl">
          <span className={`ayah${revealed ? '' : ' concealed'}`} data-testid={revealed ? undefined : 'span-text'}
            {...(revealed ? {} : { role: 'button', tabIndex: 0, 'aria-label': 'Reveal the text', onClick: () => setRevealed(true), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRevealed(true) } } })}>
            <AyahWords surah={surah} ayah={ayah} only={[from, to]} cue={revealed ? 0 : 4} revealWords={!revealed && hint ? [hintWord] : undefined}
              onWord={revealed ? (i) => setSlip(slip === i ? null : i) : undefined} marked={slip} />
          </span>
        </p>
      </div>
      <div className="mt-1 flex items-center justify-center gap-0.5" role="toolbar" aria-label="Recall tools">
        <button className="tool" onClick={() => setRevealed((r) => !r)} data-testid="span-reveal" aria-label={revealed ? 'Hide the text again' : 'Show the text'} title={revealed ? 'Hide' : 'Show text'}><Icon name={revealed ? 'eyeoff' : 'eye'} size={19} /></button>
        {!revealed && <button className="tool" onClick={() => setHint(true)} disabled={hint} data-testid="span-hint" aria-label={hintLabel} title={hintLabel}>Hint</button>}
      </div>
      {revealed && (
        <div className="mt-4">
          <GradeGrid onGrade={(g) => void grade(g)} busy={busy} blocked={(g) => hint && g === 'independent'} testPrefix="span-" testId="span-grades" />
          {hint && <p className="mt-2 text-center text-xs text-muted">With a hint, “On my own” isn’t available.</p>}
        </div>
      )}
    </div>
  )
}
