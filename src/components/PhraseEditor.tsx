import { useEffect, useState } from 'react'
import { Sheet } from './ui'
import { wordsOfAyah } from '@/lib/quran/data'
import { suggestBoundaries } from '@/lib/engine/phrases'
import { wordFontClass } from './Arabic'

/** Tap between words to place or remove a practice break. Suggestions come from the text's stop signs, conservatively. */
export function PhraseEditor({ open, onClose, surah, ayah, boundaries, onSave }: {
  open: boolean; onClose: () => void; surah: number; ayah: number; boundaries: number[]; onSave: (b: number[]) => void
}) {
  const words = wordsOfAyah(surah, ayah)
  const [b, setB] = useState<number[]>(boundaries)
  useEffect(() => { if (open) setB(boundaries) }, [open, boundaries])
  const has = (i: number) => b.includes(i)
  const toggle = (i: number) => setB((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i].sort((p, q) => p - q)))
  return (
    <Sheet open={open} onClose={onClose} title="Practice phrases">
      <p className="mb-3 text-sm text-ink-2">Tap between words to split or join phrases. These breaks are only for practice. They are not rulings on where to stop when reciting.</p>
      <div className="card-flat p-3">
        <p className="arabic" lang="ar" dir="rtl" style={{ fontSize: 'calc(1.5rem * var(--arabic-scale, 1))', lineHeight: 2.6 }}>
          {words.map((w, i) => (
            <span key={i}>
              <span className={`w${wordFontClass(w)}`}>{w}</span>
              {i < words.length - 1 && (
                <button onClick={() => toggle(i)} aria-pressed={has(i)} aria-label={`${has(i) ? 'Remove' : 'Add'} break after word ${i + 1}`}
                  className={`mx-0.5 inline-block h-[1.1em] align-middle rounded-full transition-all ${has(i) ? 'w-[0.5em] bg-brass' : 'w-[0.5em] bg-transparent hover:bg-line'}`} style={{ verticalAlign: 'middle' }} />
              )}
            </span>
          ))}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="chip" onClick={() => setB(suggestBoundaries(words).boundaries)}>Use stop-sign suggestions</button>
        <button className="chip" onClick={() => setB(suggestBoundaries(words, { includeWeak: true }).boundaries)}>Include weaker signs</button>
        <button className="chip" onClick={() => setB([])}>No splits</button>
      </div>
      <p className="mt-2 text-xs text-muted">Suggestions use only signs that allow or prefer stopping; the “do not stop” sign and “continue” signs are ignored unless you ask for weaker signs. They have not been reviewed by a teacher.</p>
      <button className="btn btn-primary btn-lg mt-4 w-full" onClick={() => { onSave(b); onClose() }}>Save phrases ({b.length + 1})</button>
    </Sheet>
  )
}
