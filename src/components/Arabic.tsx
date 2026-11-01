// Renders Qur'anic text exactly as stored. Words are never altered, split mid-word or
// re-ordered; hiding is done by replacing a word with a neutral bar in the display only.
import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { arabicIndic, wordsOfAyah } from '@/lib/quran/data'
import { drawnWord, useMushaf } from '@/lib/quran/script'
import type { Stage } from '@/lib/engine/derive'

export type Cue = 0 | 1 | 2 | 3 | 4

/** Characters the main Qur'an font lacks. Words containing one are drawn in Amiri (same family) so no glyph is ever missing. */
export const ALT_FONT_CHARS = /[\u065E]/
export const wordFontClass = (w: string) => (ALT_FONT_CHARS.test(w) ? ' alt' : '')

/** A run of an ayah's words (inclusive indices) exactly as stored, joined by single spaces, drawn in the active script. */
export function PlainWords({ surah, ayah, from, to }: { surah: number; ayah: number; from: number; to: number }) {
  const mushaf = useMushaf()
  const ws = wordsOfAyah(surah, ayah)
  const out: ReactNode[] = []
  for (let i = from; i <= to && i < ws.length; i++) {
    const w = drawnWord(surah, ayah, i, ws[i]!, mushaf)
    out.push(<span key={i}><span className={`w${mushaf ? '' : wordFontClass(w)}`}>{w}</span>{i < to && i < ws.length - 1 ? ' ' : ''}</span>)
  }
  return <>{out}</>
}

/** Which word indices stay visible at a given cue level (4 = none, 3 = first word, 2 = every third, 1 = two of three, 0 = all). */
export function visibleAt(cue: Cue, i: number): boolean {
  if (cue === 0) return true
  if (cue === 1) return i % 3 !== 2
  if (cue === 2) return i % 3 === 0
  if (cue === 3) return i === 0
  return false
}

export function AyahWords({ surah, ayah, cue = 0, dimOutside, gaps, revealCount, onWord, marked, wordState }: {
  surah: number; ayah: number; cue?: Cue
  /** Per-word drawing, used by the practice ramp: shown, masked (first words only), dimmed, or left out entirely. Overrides the other visibility props. */
  wordState?: (index: number) => 'show' | 'mask' | 'dim' | 'none'
  /** When set, exactly the first N words are visible (progressive hints) and `cue` is ignored. */
  revealCount?: number
  /** Makes each word tappable (used to mark where a recitation slipped). */
  onWord?: (index: number) => void
  marked?: number | null
  /** Words outside [from, to] are dimmed (used by the phrase ladder). */
  dimOutside?: [number, number]
  /** Word indices after which to show a small gap (phrase boundaries). */
  gaps?: number[]
}) {
  const words = wordsOfAyah(surah, ayah)
  const mushaf = useMushaf()
  const gapSet = useMemo(() => new Set(gaps ?? []), [gaps])
  return (
    <>
      {words.map((w, i) => {
        const ws = wordState?.(i)
        if (ws === 'none') return <span key={i} />
        const shown = ws ? ws !== 'mask' : revealCount !== undefined ? i < revealCount : visibleAt(cue, i)
        const dim = ws ? ws === 'dim' : dimOutside && (i < dimOutside[0] || i > dimOutside[1])
        const drawn = drawnWord(surah, ayah, i, w, mushaf)
        const alt = mushaf ? '' : wordFontClass(w)
        return (
          <span key={i}>
            {shown ? (
              onWord ? (
                <span className={`w wordtap${marked === i ? ' marked' : ''}${alt}`} role="button" tabIndex={0} aria-label={`Word ${i + 1}`} aria-pressed={marked === i} data-word={i}
                  onClick={() => onWord(i)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onWord(i))}>{drawn}</span>
              ) : (
                <span className={`w${dim ? ' dim' : ''}${alt}`}>{drawn}</span>
              )
            ) : (
              <span className="mask" style={{ width: `${Math.max(0.9, w.replace(/[ً-ٰٟۖ-ۭ]/g, '').length * 0.42)}em` } as CSSProperties} aria-hidden="true" />
            )}
            {i < words.length - 1 && (gapSet.has(i) ? <span className="phrase-gap"> </span> : ' ')}
          </span>
        )
      })}
    </>
  )
}

export function Medallion({ n }: { n: number }) {
  const mushaf = useMushaf()
  // In the official font the end-of-ayah sign (U+06DD) and its number are drawn by the font itself, as in the printed Mushaf.
  if (mushaf) return <span className="endmark" lang="ar" aria-label={`ayah ${n}`}>{'\u06DD' + arabicIndic(n)}</span>
  return <span className="medallion" aria-label={`ayah ${n}`}>{arabicIndic(n)}</span>
}

export interface PassageProps {
  surah: number
  ayahs: number[]
  cue?: Cue
  selected?: [number, number] | null
  onTap?: (ayah: number) => void
  stageOf?: (ayah: number) => { stage: Stage; r: number } | undefined
  center?: boolean
  /** Extra per-ayah content (e.g. translation) rendered below the passage is handled by callers. */
  dimOutside?: Record<number, [number, number]>
  gaps?: Record<number, number[]>
  children?: ReactNode
}

export function Passage({ surah, ayahs, cue = 0, selected, onTap, stageOf, center, dimOutside, gaps }: PassageProps) {
  return (
    <p className={`arabic${center ? ' center' : ''}`} lang="ar" dir="rtl">
      {ayahs.map((a) => {
        const sel = selected && a >= selected[0] && a <= selected[1]
        const st = stageOf?.(a)
        return (
          <span key={a}>
            <span
              className={`ayah${sel ? ' sel' : ''}`}
              data-ayah={a}
              data-stage={st?.stage}
              role={onTap ? 'button' : undefined}
              tabIndex={onTap ? 0 : undefined}
              onClick={onTap ? () => onTap(a) : undefined}
              onKeyDown={onTap ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onTap(a)) : undefined}
            >
              <AyahWords surah={surah} ayah={a} cue={cue} dimOutside={dimOutside?.[a]} gaps={gaps?.[a]} />
              {' '}<Medallion n={a} />
            </span>{' '}
          </span>
        )
      })}
    </p>
  )
}
