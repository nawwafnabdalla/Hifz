// What a recall of a whole ayah (or of a passage containing it) demonstrates about the PARTS of that ayah. Kept apart from evidence.ts so derive.ts can use it
// without a circular import.
import { attribute } from './attribution'
import { ayahKey, type Corpus, type Grade, type PartEvent, type ReviewEvent } from './types'

const SUCCESS: Grade[] = ['independent', 'hesitant']
/**
 * What a recall of a whole ayah (or of a passage containing it) demonstrates about the PARTS of that ayah, only to the extent shown:
 *  - an accurate recall with the text hidden (or only its first word shown) demonstrates every part;
 *  - a recall that went wrong at a word the learner marked demonstrates the parts before it and not the one containing it;
 *  - a recall that went wrong somewhere unknown, a hinted recall (more than the first word shown) or practice with the text visible demonstrates nothing.
 * These are derived on the fly, never stored, and never feed the ayah's memory (part evidence cannot make an ayah "memorised").
 */
export function partCreditFromReviews(reviews: ReviewEvent[], corpus: Corpus): Map<string, PartEvent[]> {
  const out = new Map<string, PartEvent[]>()
  for (const e of reviews) {
    if (e.kind !== 'recall' || e.cueLevel < 3) continue
    for (const ev of attribute(e).ayahs) {
      if (ev.outcome === 'untested' || ev.weight <= 0) continue
      const words = corpus.wordCount(ev.surah, ev.ayah)
      if (words <= 0) continue
      let slip: number | undefined
      if (!SUCCESS.includes(ev.outcome)) {
        const marked = (e.wordIssues ?? []).filter((i) => i.ayah === ev.ayah && i.kind !== 'pronunciation').map((i) => i.word)
        if (!marked.length) continue                                           // wrong somewhere unknown: no claim about any part
        slip = Math.min(...marked)
      }
      const k = ayahKey(ev.surah, ev.ayah)
      const list = out.get(k) ?? []
      list.push({ id: `credit:${e.id}:${ev.ayah}`, surah: ev.surah, ayah: ev.ayah, fromWord: 0, toWord: words - 1, wordCount: words, grade: ev.outcome as Grade, cueLevel: e.cueLevel, slipWord: slip, durationMs: 0, occurredAt: e.occurredAt })
      out.set(k, list)
    }
  }
  return out
}
