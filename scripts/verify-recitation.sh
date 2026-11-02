#!/bin/sh
# One recitation, end to end: import timings (remote probe), download its audio for checking, run the engine over the whole recording,
# summarise. Audio is downloaded to <work>/aud and deleted afterwards; only the timing JSON and the verification JSON are kept.
#   scripts/verify-recitation.sh <qua-slug> <app-reciter-id> <release-dir> <work-dir>
set -e
slug=$1; reciter=$2; rel=$3; work=$4
[ -n "$slug" ] && [ -n "$reciter" ] && [ -n "$rel" ] && [ -n "$work" ] || { echo "usage: $0 slug reciter release-dir work-dir"; exit 2; }
root=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$work/aud/$slug" "$work/real/$slug"
node "$root/scripts/import-qua.mjs" --release-dir "$rel" --slug "$slug" --reciter "$reciter" --probe --out "$work/$slug.json"
node -e "
const c=require('$rel/catalog.json').recitations.find(r=>r.slug==='$slug');
for (const [ch,u] of Object.entries(c.audio.chapter_urls).sort((a,b)=>a[0]-b[0])) console.log(ch,u)" > "$work/$slug.urls"
xargs -P 6 -L 1 sh -c 'out='"$work/aud/$slug"'/$(printf %03d $0).mp3; [ -s "$out" ] || curl -sS -m 900 -o "$out" "$1" || echo "FAILED $0"' < "$work/$slug.urls"
REAL_FAST=1 REAL_TIMINGS="$work/$slug.json" REAL_MP3_DIR="$work/aud/$slug" REAL_SURAH=all REAL_CLIP_EVERY=${CLIP_EVERY:-30} REAL_OUT="$work/real/$slug" \
  npx vitest run tests/realAudio.gen.test.ts
node "$root/scripts/summarize-verification.mjs" --report "$work/real/$slug/report.json" --slug "$slug" --out "$root/data/validation/$slug.json"
# Install the timings with the measured pauses and the verified-ayah list (only after the verification above reflects them).
dst="$root/src/data/timings/$reciter--qua_$slug.json"
cp "$work/$slug.json" "$dst"
node "$root/scripts/apply-verification.mjs" --timings "$dst" --verification "$root/data/validation/$slug.json" --pauses "$work/real/$slug/pauses.json"
rm -rf "$work/aud/$slug"
