# Hifz OS

An adaptive Qur'an memorisation system. It knows what you have memorised, what you are learning, what is fading, and plans each day,
explaining why. Built around **Sound → Flow → Recall → Connect → Retain**.

* Local-first PWA (Vite + React + TypeScript + Tailwind), Supabase (Auth + Postgres + RLS) for optional backup and sync.
* Verified Qur'an text: see [`data/PROVENANCE.md`](data/PROVENANCE.md).
* Honest by design: flow and recall are separate, passage success is weak per-ayah evidence, and nothing is called "personalised" or
  "validated" until it is.

## Develop

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # unit tests (110)
npm run test:e2e       # Playwright (builds, then drives Chromium)
npm run typecheck
npm run data:build     # regenerate bundled Qur'an data from pinned sources (fails on any integrity break)
npm run data:crosscheck  # re-derive cross-check hashes from the pinned independent sources (needs network)
```

Copy `.env.example` to `.env.local` and fill in the Supabase URL and **publishable** key to enable sync (otherwise local-only).

## Docs

* [`docs/DEPLOY.md`](docs/DEPLOY.md): deploy from an iPhone (Supabase + Cloudflare Pages)
* [`docs/PROGRESS.md`](docs/PROGRESS.md): what is implemented, tested, and not
* [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): design decisions
* [`docs/AUDIO.md`](docs/AUDIO.md): audio sources and licensing
* [`data/PROVENANCE.md`](data/PROVENANCE.md): Qur'an text provenance and integrity

Hifz OS is a study aid. It does not assess pronunciation or tajweed and does not replace a qualified teacher.
