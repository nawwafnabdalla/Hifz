# Offline audio: assessment, journey, rights, tests

## Critical assessment
**Goal-based entry is right; goal-owned storage would be wrong.** People think "my Ta-Ha goal", not "36 files", so the *offer* belongs to goals.
But goals change (extended, paused, finished, overlapping), reciters change, and the phone can evict files at any time. So underneath there is one
shared library of recordings keyed by (reciter, surah, ayah). Goals and passages never own files; they only *need* ranges. Everything the person sees is derived:

* **Ready / partly saved / not saved** = count what is really present for the goal's range and the chosen reciter. Extending a goal automatically becomes "Partly saved: 36 of 50, save the missing 14".
* **Shared recordings** need no reference counts. A recording is "still needed" if an active goal or saved passage covers it for the reciter in use; removal plans compare against that.
* **Eviction** needs no special case: a recording the phone deleted simply stops counting. A small ledger of what we saved lets us say "your phone cleared 2 recordings" instead of silently looking empty.
* Passages and ad-hoc selections reuse the same card, so there is one mechanism, not three.

Alternatives rejected: a separate download manager (the admin work you did not want); "auto-download everything for my goals" (needs a Wi-Fi check iOS Safari cannot do, so it would be consent-by-default).
Automatic clean-up *suggestions* are limited to a quiet "Not used by a current goal" tag in Settings, one question when a goal is finished, and one line above 300 MB. No notifications.

## The journey
1. **Create a goal** → the sheet's last step reads "Goal added · Save audio for offline practice? · Al-Ikhlas 1–4 · Mishary Alafasy · about 188 KB · [Save audio] [Different reciter] · Best on Wi-Fi. It uses mobile data otherwise.  [Not now]". Shown only when the reciter's recordings may be saved and the goal isn't already saved.
2. **Today → Goals** shows one quiet line per goal: "Save audio for offline" / "Audio partly saved · 30 of 36" / "✓ Audio saved offline". Tapping it opens the same card. Tapping the goal's name opens *Change goal* (extend 1–36 to 1–50), then the card offers only the missing 14.
3. **Listening** (Learn, Surah selection): the Audio sheet carries the same card, but only when the practice belongs to a goal or is a multi-ayah selection. A lone ayah shows no download control.
4. **Playback** uses saved copies first, automatically (normal, repeat and Echo). With no connection and no copy it says "You're offline, and X isn't saved on this device for ayah N."
5. **Finish a goal** (Done) → "Keep the audio saved for it?" [Keep audio] [Remove audio · 7 MB]. Recordings another goal still needs are named and stay.
6. **Settings → Offline recitations**: "Using 12 MB on this device", then rows such as "Ta-Ha 1–36 — Maher Al-Mu'aiqly · Ready offline · 12 MB [Remove audio]", "Not used by a current goal" where true, "Partial · 30 of 36 for Ta-Ha" where true, and Remove all downloads (confirmed). Removal always says: *Remove audio only. Your memorisation progress will stay saved.*
7. **Change reciter**: the goal line now reflects the new reciter (not saved); the old reciter's audio stays until you remove it (it shows as "Not used by a current goal").

## Rights (what is and is not enabled)
| Source | Saving | Basis |
|---|---|---|
| Islamic Network (cdn.islamic.network, alquran.cloud) | **On** | Terms reported as: free for personal, non-commercial and educational use, including download. *I could only read this through a search summary of the terms page; the page itself was unreachable from the build environment. Please read https://alquran.cloud/terms-and-conditions once.* One constant to turn it off: `SOURCE_RIGHTS.islamicnetwork.saveOffline`. |
| EveryAyah | **Off** | No licence published; recordings belong to their reciters. Streaming only. Turn on only with written permission. |
| MP3Quran | Off | Whole-surah streaming only; nothing is saved. |

Consequences for your reciters: **Maher** and Alafasy etc. can be saved (they have an Islamic Network source). **Yasser Al-Dossary** and **Badr Al-Turki** cannot be saved: they stream normally, and the card says "Yasser Al-Dossary can be played online but not saved" and offers a reciter that can.
Getting Yasser saved needs permission from EveryAyah's operator (or a licensed source for him). That is the single action that would unlock it.

## Reliability design
* Recordings are written only after the whole file is read, validated (HTTP ok, audio type, ≥1 KB, matches declared length) and read back; nothing is half-written, an interrupted save resumes by fetching only what is missing.
* Concurrency 3; one retry; stops cleanly on out of space, lost connection, Stop. A 600 MB cap, and a free-space check (estimate × 1.25) before starting.
* Sizes after saving are measured (bytes stored). Sizes before saving are labelled "about" (words × typical pace, replaced by measured bytes per word once a reciter has audio saved).
* Cache API storage, requested persistent where the browser allows (best effort, never relied on).
* Nothing in `offline.ts` can reach the learning database (enforced by a test).

## Tests
Unit (`tests/offline.test.ts`, 26): permission gating (never fetches EveryAyah for saving), complete/partial/expansion/overlap/other-reciter, estimate vs measured, cancel + resume, 404s, html / tiny / truncated files rejected, quota exhausted, offline / low space / size cap, eviction detection and recovery, removal runs, shared-goal removal plans, player plays saved copy first, falls back when the copy is bad or missing, plain offline message, DB isolation.
Browser (`e2e/offline.spec.ts`, 9, Chromium at 390 px): goal offer → save → listed with measured size → remove with progress intact; expansion fetches only the missing recordings; saved audio plays with the network off and zero audio requests; unsaved ayah explains itself; cache eviction noticed and repaired; failed download never "complete"; non-saveable reciter never touches EveryAyah; finishing a goal with shared audio; calm-screen checks.

## Not verified, needs a device
* That `cdn.islamic.network` answers a cross-origin `fetch` (CORS) from the app. If it does not, saving fails honestly ("couldn't be saved") and nothing is claimed. (Playback streaming is unaffected.)
* iOS Safari: Cache API retention, `blob:` audio playback with the screen locked, Echo from saved audio, storage eviction behaviour, persistent-storage grant.
* Real file sizes (the estimate is a guess until the first save).
