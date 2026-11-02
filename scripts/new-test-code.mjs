#!/usr/bin/env node
// Make (or rotate) the private test code for the phrase-audio preview.
//   node scripts/new-test-code.mjs            prints a new code ONCE and the line to put in src/lib/audio/previewAccess.ts
//   node scripts/new-test-code.mjs --write    also writes the new hash into previewAccess.ts
// The code is never written to a file or the repository: copy it from the terminal. Only its SHA-256 goes into the app.
// (Alternatively set the hash as the Cloudflare build variable VITE_TEST_CODE_SHA256 and leave the source alone.)
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
const code = `hifz-${randomBytes(3).toString('hex')}-${randomBytes(3).toString('hex')}`
const hash = createHash('sha256').update(code).digest('hex')
console.log(`test code (shown once): ${code}\nsha256: ${hash}`)
if (process.argv.includes('--write')) {
  const f = new URL('../src/lib/audio/previewAccess.ts', import.meta.url)
  const s = readFileSync(f, 'utf8')
  const next = s.replace(/\|\| '[0-9a-f]{64}'/, `|| '${hash}'`)
  if (next === s) { console.error('could not find the hash to replace'); process.exit(1) }
  writeFileSync(f, next); console.log('written to src/lib/audio/previewAccess.ts')
}
