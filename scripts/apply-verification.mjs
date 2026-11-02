#!/usr/bin/env node
// Record, inside a timing file, which ayahs were verified on the real audio (status 'ok': every phrase cut cleanly, no acoustic warning).
//   node scripts/apply-verification.mjs --timings src/data/timings/<file>.json --verification data/validation/<slug>.json
// The app then offers phrase audio, and plays the whole ayah from that recording, ONLY for these ayahs. A timing file without a `verified` list
// (hand-made or test timings) is used as before. Re-run the verification after any change to the phrase engine or the model.
import { readFileSync, writeFileSync } from 'node:fs'
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined }
const tf = arg('timings'), vf = arg('verification')
if (!tf || !vf) { console.error('usage: apply-verification.mjs --timings <json> --verification <json>'); process.exit(2) }
const t = JSON.parse(readFileSync(tf, 'utf8')), v = JSON.parse(readFileSync(vf, 'utf8'))
if (!v.okAyahs) { console.error('verification file has no okAyahs'); process.exit(3) }
const ok = Object.fromEntries(Object.entries(v.okAyahs).map(([s, a]) => [s, a.slice().sort((x, y) => x - y)]))
const n = Object.values(ok).reduce((s, a) => s + a.length, 0)
t.verified = ok
t.provenance.verification = { date: v.generated, method: v.method, ayahs: n, of: Object.keys(t.ayahs).length, thresholds: v.warnThresholds }
writeFileSync(tf, JSON.stringify(t))
console.log(`${tf}: ${n} of ${Object.keys(t.ayahs).length} ayahs marked verified`)
