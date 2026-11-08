#!/usr/bin/env node
// Checks a production build for what MUST be in it and what MUST NOT. Run after `npm run build`.
//   MUST: part-by-part learning (the button, its meaning data, the practice-phrase data), the lead-in, and ayah-by-ayah checking in revision.
//   MUST NOT: test hooks, the private test-access code gate, third-party recording hosts, per-recording timings.
// Part-by-part learning was once lost from a release because nothing checked for it; this is that check.
import { readFileSync, readdirSync } from 'node:fs'
const dist = process.argv[2] ?? 'dist'
const files = readdirSync(`${dist}/assets`).filter((f) => f.endsWith('.js')).map((f) => ({ f, s: readFileSync(`${dist}/assets/${f}`, 'utf8') }))
const has = (t) => files.some(({ s }) => s.includes(t))
const must = [
  ['the "Learn it part by part" button', 'learn-by-parts'], ['its label', 'Learn it part by part'], ['the part-by-part screen', 'part-dots'],
  ['the English meaning of each part', 'part-meaning'], ['the translation evidence (Ta-Ha 20:10)', '"20:10":{"n":18'], ['the owner-specified Ta-Ha 20:10 units', 'owner-specified'],
  ['the first-word hint of the part being added', 'Hint: first word of'], ['the run-up into revised passages', 'lead-in'], ['the note that parts are not places to stop', 'not places to stop'],
  ['checking one ayah at a time in revision', 'Show all ayahs'], ['flagging what went wrong with a word', 'Wrong word or vowel'],
  ['pronunciation / tajweed as its own kind of concern', 'Pronunciation / tajweed'], ['assisted vs recall (read before reciting)', 'I read it before reciting'], ['the optional self-recording', 'Record my recitation'],
  ['tapping the concealed text to reveal it', 'Reveal ayah'], ['the one-tap explanation of the parts', 'About these parts'],
  ['Sound and Flow as one practise stage', 'Recall from memory'], ['an ayah already known is recognised, not re-taught', 'already in place'], ['a session is re-checked against evidence recorded since the plan', 'Already covered'],
]
const mustNot = [['browser-test hook', '__hifzPhrases'], ['private test-access gate', 'hifz.testCode'], ['third-party recording host', 'audio-cdn.tarteel.ai'], ['per-recording timing data', '--qua_']]
const bad = []
for (const [what, t] of must) if (!has(t)) bad.push(`MISSING: ${what} (${t})`)
for (const [what, t] of mustNot) if (has(t) || readdirSync(`${dist}/assets`).some((f) => f.includes(t))) bad.push(`PRESENT but must not be: ${what} (${t})`)
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log(`release contract ok: ${must.length} required features present, ${mustNot.length} excluded items absent`)
