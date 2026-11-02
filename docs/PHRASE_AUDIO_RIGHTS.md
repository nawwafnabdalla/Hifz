# Rights to use the recordings in Hifz OS: what is cleared, what is not, and exactly what to ask for

**Nothing is rights-cleared today.** The timing data is under CC BY 4.0. The recordings are not licensed to us by anyone we have found. Phrase audio therefore must not go to production until the owner decides (below). This page is the decision paper.

## What is technically true (tested) vs what is permitted (not established)
| | Technically | Permission |
|---|---|---|
| Stream a recording from its host into the app | Works (CORS `*`, Range 206) | **None found.** No licence on the file, the host, or QUL. QUA's `NOTICE.md`: recordings "remain the property of their respective reciters, producers, and original sources". |
| Fetch only a byte window and play a phrase | Works | Same question: it is still playing the recording. |
| Cache it in the browser / save it offline | Possible | **No.** The app does not (decoded windows held in memory only; the browser's normal HTTP cache applies). |
| Redistribute it in the app or repo | Possible | **No.** Nothing is bundled. |
| Use the word timings | Works | **Yes**, CC BY 4.0: attribution is now in Settings → About → Audio sources ("timing-credits"), stating that we changed the data. |

## Who can grant what (verify before relying on any of this)
1. **The host of the file** (Maher/Yasser Tarteel recordings: `audio-cdn.tarteel.ai`, operated by Tarteel, whose QUL platform lists Maher and Yasser recitations). Can say whether third-party apps may stream from the CDN.
2. **The reciter or the recording's producer/rights holder** (Maher Al-Mu'aiqly's and Yasser Al-Dosari's representatives, or the publisher named by the host). Only they can license the recitation itself; a CDN's permission may not cover that.
3. **QUA maintainers** (QUD Technologies): can confirm the CC BY terms and the provenance of each recording; they offer takedown/relink "within a few days" on request, so a rights holder can force removal. They cannot license the audio.

## Suggested request (send to 1 and 2; adapt)
> Hifz OS is a free, non-commercial app that helps one learner memorise the Qur'an with the recitation they love. It plays **short phrases of ayahs** from {recording URL}, by streaming small byte ranges directly from {host} in the user's browser. It never copies, stores, redistributes or sells the audio, always shows whose recitation is playing and credits the reciter and host, and stops at once if you ask. May we stream {reciter}'s recording from {URL} in this way? If you prefer a different recording or different terms, please tell us.

## Decision options for the owner
* **A. Written permission** from the host (and ideally the reciter's side) for the exact recordings used. Release phrase audio for those only. Keep the evidence in `docs/`.
* **B. Use recordings whose terms already permit it.** Islamic Network is an open CDN that asks apps to cache its files and states no restriction on keeping a copy (as recorded in `SOURCE_RIGHTS`, to be re-read before relying on it); EveryAyah publishes no licence, so streaming only. Neither has QUA timings for the same recording (never apply timings to a different file), so this needs our own alignment of that recording (see `ALIGNMENT.md`) and re-validation. That is more work but a clean position.
* **C. Personal-use build only**, not distributed. Does not need clearance but is not something to publish.
* **D. Keep phrase audio off** and ship only the recitation-independent practice (what production has today).
Recommendation: ask (A) now in parallel with developing (B) for Maher, whose Islamic Network recording (`ar.mahermuaiqly`) is on a host whose recorded terms allow caching (to be re-verified).

## Per-recording status
| Recording | Host | Timings licence | Audio permission | Release? |
|---|---|---|---|---|
| Yasser, QUA `yasser_al_dosari_tarteel` | audio-cdn.tarteel.ai | CC BY 4.0 | none found | **No** |
| Maher, QUA `maher_al_muaiqly_tarteel` | audio-cdn.tarteel.ai | CC BY 4.0 | none found | **No** |
| all other QUA recordings | various | CC BY 4.0 | none found | **No** |
