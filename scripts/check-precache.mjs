#!/usr/bin/env node
// Every script and stylesheet the app needs offline must be in the service worker's precache, except the per-recording phrase timings (assets/timings/).
// Guards against a bug found 4 Nov 2026: a file-name pattern that also matched an ordinary page chunk whose random hash began with "-", so that page was missing offline.
//   node scripts/check-precache.mjs [dist]
import { readFileSync, readdirSync } from 'node:fs'
const dist = process.argv[2] ?? 'dist'
const sw = readFileSync(`${dist}/sw.js`, 'utf8') + (() => { try { return readdirSync(dist).filter((f) => /^workbox-.*\.js$/.test(f)).map((f) => readFileSync(`${dist}/${f}`, 'utf8')).join('') } catch { return '' } })()
const missing = readdirSync(`${dist}/assets`, { withFileTypes: true }).filter((e) => e.isFile() && /\.(js|css)$/.test(e.name)).map((e) => `assets/${e.name}`).filter((p) => !sw.includes(p))
if (missing.length) { console.error('Not precached (would be missing offline):\n  ' + missing.join('\n  ')); process.exit(1) }
console.log(`precache ok: every script and stylesheet in ${dist}/assets is precached`)
