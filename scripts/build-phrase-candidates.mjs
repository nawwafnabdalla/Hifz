#!/usr/bin/env node
// Phrase-break CANDIDATES from grammar, learned from the mushaf's own recitation guidance.
//
// Evidence:
//   * Word-by-word morphology (Quranic Arabic Corpus v0.4, fork by mustafa0x): part of speech, case, definiteness, conjunctions,
//     resumption/subordinating/conditional/vocative particles, pronoun suffixes, verb aspect.
//   * The stop signs already printed in the canonical text (ۘ ۗ ۚ ۜ = a stop is required/preferred/permitted/brief; ۙ = do not stop;
//     ۖ = continuing preferred). These are used ONLY as the answer key: a model learns what a natural clause boundary looks like
//     grammatically from ~6,000 marked positions, and is judged on surahs it never saw (grouped cross-validation).
//   * It then scores EVERY position of every ayah longer than the "whole ayah" limit. Candidates are probabilities, not rulings.
//
//   node scripts/build-phrase-candidates.mjs [--morph path/to/quran-morphology.txt]
//   (downloads the pinned file from raw.githubusercontent.com when --morph is not given; the checksum below is verified.)
//
// Licence note: with --features qac the corpus is distributed by its authors under the GNU GPL with attribution to corpus.quran.com (stated by the original
// project; the fork does not restate it and the page could not be read here). The raw morphology is NOT committed or shipped; only the
// derived per-position scores are.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = { dataset: 'Quranic Arabic Corpus morphology v0.4 (fork: mustafa0x/quran-morphology)', url: 'https://github.com/mustafa0x/quran-morphology', file: 'quran-morphology.txt', sha256: '742bfac59941b2cb09736d5b7aae694af50792261fb8450cbf6afafcc340645f', licence: 'GNU GPL with attribution to corpus.quran.com (per the original project; not re-read here). Raw data not shipped.' }
const argv = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined }
const MODE = argv('features') ?? 'qac'   // 'qac': corpus morphology (GPL); 'orth': spelling of the canonical text only, no third-party linguistic data

async function loadMorph() {
  if (MODE === 'orth') return ''
  let buf
  if (argv('morph')) buf = readFileSync(argv('morph'))
  else {
    const r = await fetch('https://raw.githubusercontent.com/mustafa0x/quran-morphology/master/quran-morphology.txt')
    if (!r.ok) throw new Error(`download failed: ${r.status}`)
    buf = Buffer.from(await r.arrayBuffer())
  }
  const sum = createHash('sha256').update(buf).digest('hex')
  if (sum !== SOURCE.sha256) throw new Error(`morphology file checksum mismatch: ${sum} (expected ${SOURCE.sha256}). Refusing to use an unreviewed version.`)
  return buf.toString('utf8')
}

const q = JSON.parse(readFileSync(join(root, 'src/data/generated/quran.json'), 'utf8'))
const words = (s, a) => q.text[s - 1][a - 1].split(' ').filter(Boolean)
const BASE = /[ؐ-ًؚ-ٰٟۖ-ۭـ࣓-ࣿ]/g
const letters = (w) => w.replace(BASE, '').length

// ---- parse morphology into per-ayah, per-word segment lists ----
const morph = new Map()
for (const line of (await loadMorph()).split('\n')) {
  const p = line.split('\t'); if (p.length < 4) continue
  const [s, a, w] = p[0].split(':').map(Number)
  const key = s * 1000 + a
  const ay = morph.get(key) ?? []; morph.set(key, ay)
  const word = (ay[w - 1] ??= [])
  word.push({ form: p[1], tag: p[2], f: new Set(p[3].split('|').filter((x) => !x.startsWith('LEM:') && !x.startsWith('ROOT:'))) })
}

const KEY = ['CONJ', 'REM', 'SUB', 'COND', 'INTG', 'REL', 'NEG', 'VOC', 'DEM', 'PRON', 'PN', 'ADJ', 'T', 'LOC', 'EMPH', 'RSLT', 'CERT', 'CIRC', 'PRP', 'SUP', 'RES', 'FUT', 'FAM:إِنّ', 'FAM:كَان', 'VN', 'ACT_PCPL', 'PASS_PCPL']
const OPENERS = ['CONJ', 'REM', 'SUB', 'COND', 'INTG', 'VOC', 'RSLT', 'REL', 'NEG', 'CERT', 'T', 'DEM', 'PRP', 'CIRC', 'RES']
function info(segs) {
  const stem = segs.find((s) => !s.f.has('PREF') && !s.f.has('SUFF')) ?? segs.at(-1)
  const pref = segs.filter((s) => s.f.has('PREF')), suff = segs.filter((s) => s.f.has('SUFF'))
  const all = new Set(); for (const s of segs) for (const f of s.f) all.add(f)
  return { segs, stem, stemTag: stem.tag, sf: stem.f, first: segs[0], prefF: new Set(pref.flatMap((s) => [...s.f])), suffPron: suff.some((s) => s.f.has('PRON')), all, single: segs.length === 1, det: pref.some((s) => s.f.has('DET')), prepPref: pref.some((s) => s.f.has('P') && !s.f.has('DET') && !s.f.has('CONJ')) }
}
const caseOf = (i) => (i.sf.has('GEN') ? 'GEN' : i.sf.has('NOM') ? 'NOM' : i.sf.has('ACC') ? 'ACC' : 'none')

function boundaryFeatures(W, i, n, wordsText) {
  const c = W[i], x = W[i + 1], f = ['bias']
  f.push(`cur.stem=${c.stemTag}`, `nxt.stem=${x.stemTag}`)
  for (const k of KEY) { if (c.sf.has(k) || c.prefF.has(k)) f.push(`cur.has=${k}`); if (x.sf.has(k)) f.push(`nxt.stemhas=${k}`); if (x.first.f.has(k)) f.push(`nxt.first=${k}`); if (x.prefF.has(k)) f.push(`nxt.pref=${k}`) }
  f.push(`cur.case=${caseOf(c)}`, `nxt.case=${caseOf(x)}`, `cur.def=${c.det ? 'DET' : c.sf.has('INDEF') ? 'INDEF' : 'bare'}`, `nxt.def=${x.det ? 'DET' : x.sf.has('INDEF') ? 'INDEF' : 'bare'}`)
  for (const asp of ['PERF', 'IMPF', 'IMPV']) { if (c.sf.has(asp)) f.push(`cur.asp=${asp}`); if (x.sf.has(asp)) f.push(`nxt.asp=${asp}`) }
  if (c.suffPron) f.push('cur.suffpron'); if (x.suffPron) f.push('nxt.suffpron')
  const curParticle = c.single && c.stemTag === 'P'
  if (curParticle) f.push('cur.particle')
  if (x.single && x.stemTag === 'P') f.push('nxt.particle')
  const idafa = c.stemTag === 'N' && !c.det && !c.sf.has('INDEF') && !c.sf.has('PN') && x.stemTag === 'N' && x.sf.has('GEN') && !x.prepPref
  if (idafa) f.push('idafa')
  if (c.stemTag === 'N' && x.sf.has('ADJ')) f.push('noun>adj')
  if (c.stemTag === 'V' && (x.stemTag === 'N' || x.sf.has('PRON')) && !OPENERS.some((o) => x.first.f.has(o))) f.push('verb>arg')
  const opener = OPENERS.find((o) => x.first.f.has(o) || x.prefF.has(o)) ?? 'plain'
  f.push(`cross=${c.stemTag}${curParticle ? 'P' : ''}>${opener}`, `crossc=${c.stemTag}.${caseOf(c)}>${opener}`)
  f.push(`cur.len=${Math.min(letters(wordsText[i]), 8)}`, `nxt.len=${Math.min(letters(wordsText[i + 1]), 8)}`, `pos=${Math.floor((i / (n - 1)) * 5)}`, `fromEnd=${Math.min(n - 2 - i, 6)}`, `fromStart=${Math.min(i + 1, 8)}`)
  return f
}


// ---- orthographic-only features (no corpus; my own short lists of Arabic function words, read from spelling alone) ----
const norm = (w) => w.replace(BASE, '').replace(/[أإآٱ]/g, 'ا')
const PREP = new Set(['في', 'من', 'عن', 'علي', 'الي', 'مع', 'حتي', 'عند', 'بعد', 'قبل', 'بين', 'دون', 'غير', 'الا', 'لدي', 'فوق', 'تحت'])
const NEGP = new Set(['لا', 'لم', 'لن', 'ما', 'ليس', 'ولا', 'فلا', 'وما', 'فما'])
const REL = new Set(['الذي', 'الذين', 'التي', 'اللاتي', 'الذان', 'من', 'ما'])
const OPEN = new Set(['ثم', 'اذ', 'اذا', 'قال', 'قالوا', 'قالت', 'قل', 'لكن', 'حتي', 'بل', 'ام', 'او', 'هل', 'يا', 'كلا', 'لو', 'ولو', 'انا', 'انه'])
const VOC = new Set(['يا', 'يايها', 'ياايها', 'يقوم', 'يبني'])
const DEMO = new Set(['هذا', 'هذه', 'ذلك', 'تلك', 'هولاء', 'اولئك'])
// Words that attach to what comes BEFORE them (a complement or exception, not a new clause): subordinating أَن / كَيۡ and the exception إِلَّا.
// Spelling decides: أَن (hamza above, no shadda) is the subordinator; إِنۡ (hamza below) is the conditional; with shadda it is أَنَّ / إِنَّ (a new sentence).
export const subordinatorAt = (raw) => { const n = norm(raw); if (n === 'ان' && raw.startsWith('أ') && !raw.includes('ّ')) return 'subord'; if (n === 'كي') return 'subord'; if (n === 'الا' && raw.includes('ّ')) return 'illa'; if (n === 'ان' && raw.startsWith('إ') && !raw.includes('ّ')) return 'cond'; return '' }
function orthFeatures(wt, i) {
  const c = norm(wt[i]), x = norm(wt[i + 1]), n = wt.length, f = ['bias']
  const kind = (w, raw) => [PREP.has(w) ? 'prep' : '', NEGP.has(w) ? 'neg' : '', REL.has(w) ? 'rel' : '', OPEN.has(w) ? 'open' : '', VOC.has(w) || w.startsWith('يا') ? 'voc' : '', DEMO.has(w) ? 'dem' : '',
    w.length > 2 && (w.startsWith('و') || w.startsWith('ف')) ? 'wafa' : '', w.startsWith('ال') ? 'def' : '', /[ًٌٍ]/.test(raw) ? 'tanwin' : '', /[هكي]$/.test(w) || /(هم|هن|ها|كم|نا|ني)$/.test(w) ? 'suffpron' : '', w.length <= 2 ? 'tiny' : ''].filter(Boolean)
  const ck = kind(c, wt[i]), xk = kind(x, wt[i + 1])
  { const s = subordinatorAt(wt[i + 1]); if (s) xk.push(s) }
  for (const k of ck) f.push(`cur=${k}`); for (const k of xk) f.push(`nxt=${k}`)
  for (const a of ck.length ? ck : ['plain']) for (const b of xk.length ? xk : ['plain']) f.push(`x=${a}>${b}`)
  f.push(`cur.len=${Math.min(letters(wt[i]), 8)}`, `nxt.len=${Math.min(letters(wt[i + 1]), 8)}`, `pos=${Math.floor((i / (n - 1)) * 5)}`, `fromEnd=${Math.min(n - 2 - i, 6)}`, `fromStart=${Math.min(i + 1, 8)}`)
  return f
}

// ---- build the labelled set ----
const POS = /[ۘۗۚۜ]/, NEG = /[ۙۖ]/
const rows = []   // {s, a, i, f, y}
const skipped = []
for (const sInfo of q.surahs) for (let a = 1; a <= sInfo.count; a++) {
  const wt = words(sInfo.n, a), m = morph.get(sInfo.n * 1000 + a)
  if (MODE === 'qac' && (!m || m.length !== wt.length || m.some((x) => !x))) { skipped.push(`${sInfo.n}:${a}`); continue }
  const W = MODE === 'qac' ? m.map(info) : null
  for (let i = 0; i < wt.length - 1; i++) {
    const mark = wt[i]
    const y = POS.test(mark) ? 1 : (NEG.test(mark) || !/[ۘۗۚۛۜۖۙ]/.test(mark)) ? 0 : null   // paired sign (ۛ) is ambiguous: not used for learning
    rows.push({ s: sInfo.n, a, i, n: wt.length, f: MODE === 'qac' ? boundaryFeatures(W, i, wt.length, wt) : orthFeatures(wt, i), y })
  }
}

// ---- logistic regression, sparse, L2, SGD ----
const vocab = new Map(); for (const r of rows) for (const k of r.f) if (!vocab.has(k)) vocab.set(k, vocab.size)
for (const r of rows) r.x = r.f.map((k) => vocab.get(k))
function train(set, epochs = 12, lr = 0.15, l2 = 1e-5) {
  const w = new Float64Array(vocab.size)
  let seed = 42; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  const idx = set.map((_, k) => k)
  for (let e = 0; e < epochs; e++) {
    for (let k = idx.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [idx[k], idx[j]] = [idx[j], idx[k]] }
    const step = lr / (1 + e * 0.5)
    for (const k of idx) { const r = set[k]; let z = 0; for (const j of r.x) z += w[j]; const p = 1 / (1 + Math.exp(-z)); const g = p - r.y; for (const j of r.x) w[j] -= step * (g + l2 * w[j]) }
  }
  return w
}
const score = (w, r) => { let z = 0; for (const j of r.x) z += w[j]; return 1 / (1 + Math.exp(-z)) }
function auc(pairs) { // [p, y]
  const s = pairs.slice().sort((a, b) => a[0] - b[0]); let rank = 0, pos = 0, sum = 0
  for (let i = 0; i < s.length; i++) { rank = i + 1; if (s[i][1] === 1) { pos++; sum += rank } }
  const neg = s.length - pos; return (sum - (pos * (pos + 1)) / 2) / (pos * neg)
}
const labelled = rows.filter((r) => r.y !== null)

// grouped 5-fold cross-validation by surah: judged only on surahs the model did not see
const folds = 5, held = []
for (let k = 0; k < folds; k++) {
  const tr = labelled.filter((r) => r.s % folds !== k), te = labelled.filter((r) => r.s % folds === k)
  const w = train(tr)
  for (const r of te) held.push([score(w, r), r.y, r])
}
const cvAuc = auc(held.map((h) => [h[0], h[1]]))
const base = labelled.filter((r) => r.y === 1).length / labelled.length
const TAU = 0.2
const above = held.filter((h) => h[0] >= TAU), tp = above.filter((h) => h[1] === 1).length, allPos = held.filter((h) => h[1] === 1).length
// "does the model's best position inside a long unmarked-looking stretch agree with a real sign?" top-1 per ayah that contains a sign
const byAyah = new Map(); for (const h of held) { const k = h[2].s * 1000 + h[2].a; (byAyah.get(k) ?? byAyah.set(k, []).get(k)).push(h) }
let top1 = 0, top1n = 0
for (const hs of byAyah.values()) { if (!hs.some((h) => h[1] === 1)) continue; top1n++; if (hs.slice().sort((a, b) => b[0] - a[0])[0][1] === 1) top1++ }
// the same, for ayahs with exactly one sign (a clean test of "where would a pause go?")
let one = 0, onen = 0
for (const hs of byAyah.values()) { if (hs.filter((h) => h[1] === 1).length !== 1 || hs.length < 6) continue; onen++; if (hs.slice().sort((a, b) => b[0] - a[0])[0][1] === 1) one++ }
const report = { mode: MODE, positions: labelled.length, signPositions: allPos, baseRate: +base.toFixed(4), cvAuc: +cvAuc.toFixed(4), tau: TAU, precisionAtTau: +(tp / above.length).toFixed(4), recallAtTau: +(tp / allPos).toFixed(4), top1AgreementAnyAyahWithSign: +(top1 / top1n).toFixed(4), top1AgreementAyahsWithOneSign: +(one / onen).toFixed(4), ayahsWithOneSignTested: onen, skippedAyahs: skipped.length }

// ---- final model on everything; write candidates for ayahs longer than the whole-ayah limit ----
const wAll = train(labelled)
const WHOLE_LIMIT = 12, MIN_P = 0.03
const ayahs = {}
for (const r of rows) {
  if (r.n <= WHOLE_LIMIT) continue
  const p = score(wAll, r)
  if (p < MIN_P) continue
  ;(ayahs[`${r.s}:${r.a}`] ??= { n: r.n, c: [] }).c.push([r.i, Math.round(p * 1000)])
}
// The SHIPPED model is the corpus-free one. Corpus-derived scores go to data/gpl/ (git-ignored, never bundled): developer cross-check only.
const outFile = argv('out') ?? join(root, MODE === 'orth' ? 'src/data/generated/phrase-candidates.json' : 'data/gpl/phrase-candidates-qac.json')
mkdirSync(dirname(outFile), { recursive: true })
const SRC = MODE === 'orth' ? { dataset: 'canonical text only (no third-party linguistic data)', note: 'spelling features and short function-word lists written for this project; trained on the mushaf\'s own stop signs' } : SOURCE
writeFileSync(outFile, JSON.stringify({ schema: 1, source: SRC, report, wholeLimit: WHOLE_LIMIT, ayahs }))
mkdirSync(join(root, 'data/crosscheck'), { recursive: true })
writeFileSync(join(root, MODE === 'orth' ? 'data/crosscheck/phrase-model-report.json' : 'data/crosscheck/phrase-model-report-qac-devonly.json'), JSON.stringify({ ...report, mode: MODE, features: vocab.size, source: SRC }, null, 2))
// the strongest learned signals, for review
const top = [...vocab.entries()].map(([k, j]) => [k, wAll[j]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 14).map(([k, v]) => `${k}:${v.toFixed(2)}`)
console.log(JSON.stringify(report, null, 1)); console.log('strongest signals:', top.join(' | ')); console.log(`wrote ${outFile} (${Object.keys(ayahs).length} ayahs)`)
