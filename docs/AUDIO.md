# Audio

* Per-ayah MP3s are **streamed from third-party hosts**; the app never stores or redistributes them.
* Sources (`src/lib/audio/sources.ts`): **EveryAyah** (`everyayah.com/data/<folder>/SSSAAA.mp3`) and **Islamic Network CDN**
  (`cdn.islamic.network/quran/audio/128/<edition>/<global ayah number>.mp3`). If one host fails, the next is tried automatically.
* **Licensing:** neither host states a licence for programmatic use. Treat this as personal study use. For a public release, replace
  the source with a licensed one by implementing `AudioSource`; no other code changes. The Quran Foundation API is the obvious
  candidate; it needs client credentials, which must be kept **server-side** (e.g. a Supabase Edge Function proxy), never in the frontend.
* No private keys exist anywhere in the client; URLs are public.
* **Verification status:** the URL patterns are the documented ones, but the build sandbox could not reach these hosts. The player
  is tested against a local stand-in (unit tests + a real Chromium run that serves audio from a mocked route). Real-host playback
  must be confirmed on a device: Settings → *Check audio on this device*.
* Not implemented: word timings, phrase-level audio slicing, caching audio for offline use.
