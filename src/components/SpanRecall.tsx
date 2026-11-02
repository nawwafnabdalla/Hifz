import { useRef, useState } from 'react'
import { AyahWords } from './Arabic'
import { Icon } from './Icon'
import { Coach } from './Coach'
import { useApp } from '@/app/store'
import { wordsOfAyah } from '@/lib/quran/data'
import type { Grade, PartEvent } from '@/lib/engine/types'

const GRADES: { g: Grade; title: string; sub: string; cls: string }[] = [
  { g: 'independent', title: 'On my own', sub: 'Accurate, without help', cls: 'btn-primary' },
  { g: 'hesitant', title: 'Hesitated', sub: 'Accurate, but unsure', cls: 'btn-quiet' },
  { g: 'prompted', title: 'Needed a prompt', sub: 'Partly right', cls: 'btn-quiet' },
  { g: 'failed', title: 'Couldn’t recall', sub: 'Not yet', cls: 'btn-quiet' },
]

/**
 * Recall part of an ayah from memory: recite aloud, show the text, grade with one tap. If it went wrong, tap the word where it slipped
 * (optional) and the app practises exactly that spot. The result is saved as evidence for those words only: it never counts as having
 * memorised the ayah. The first word may be shown as a hint, which lowers the evidence and rules out "on my own".
 */
export function SpanRecall({ surah, ayah, from, to, label, onDone }: {
  surah: number; ayah: number; from: number; to: number; label: string
  onDone: (e: PartEvent) => void
}) {
  const logPart = useApp((s) => s.logPart)
  const [revealed, setRevealed] = useState(false)
  const [hint, setHint] = useState(false)
  const [slip, setSlip] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(Date.now())
  const total = wordsOfAyah(surah, ayah).length
  const multi = to > from

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

  return (
    <div className="px-4" data-testid="span-recall">
      <div className="mb-3 text-center">
        <div className="eyebrow">{revealed ? 'How was that?' : 'From memory'}</div>
        <h2 className="font-display mt-1 text-xl">{label}</h2>
        {!revealed && <Coach id="span-intro" className="mt-1 text-sm text-ink-2" full="Recite this part aloud, then show the text to check." short="Recite it, then check." />}
      </div>
      <div className="card px-4 py-5">
        <p className="arabic center" lang="ar" dir="rtl">
          <AyahWords surah={surah} ayah={ayah} only={[from, to]} cue={revealed ? 0 : hint ? 3 : 4}
            onWord={revealed ? (i) => setSlip(slip === i ? null : i) : undefined} marked={slip} />
        </p>
        {revealed && <Coach id="span-slip" className="mt-2 text-center text-xs text-muted" full="Slipped somewhere? Tap that word and I’ll practise that exact spot." short="Tap the word where you slipped." />}
      </div>
      {!revealed ? (
        <div className="mt-4 space-y-2">
          <button className="btn btn-primary btn-lg w-full" onClick={() => setRevealed(true)} data-testid="span-reveal"><Icon name="eye" size={18} /> Show text</button>
          <button className="btn btn-quiet w-full" onClick={() => setHint(true)} disabled={hint} data-testid="span-hint">{hint ? 'First word shown' : 'Hint: first word'}</button>
          {hint && <p className="text-center text-xs text-muted">Hints count as weaker evidence, so “on my own” isn’t available.</p>}
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2.5" data-testid="span-grades">
            {GRADES.map((g) => {
              const blocked = hint && g.g === 'independent'
              return (
                <button key={g.g} disabled={busy || blocked} className={`btn ${g.cls} h-auto flex-col !items-start !gap-0 py-3 text-left`} onClick={() => void grade(g.g)} data-testid={`span-grade-${g.g}`}>
                  <span className="text-[0.98rem]">{g.title}</span><span className="text-xs font-normal opacity-75">{blocked ? 'Not with hints' : g.sub}</span>
                </button>
              )
            })}
          </div>
          {multi && <p className="mt-2 text-center text-xs text-muted">If a join was shaky, tap the first word you slipped on before choosing.</p>}
        </>
      )}
      <p className="mt-3 text-center text-xs text-muted">Saved to your history. The app doesn’t grade you.</p>
    </div>
  )
}
