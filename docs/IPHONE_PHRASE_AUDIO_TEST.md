# iPhone test: phrase-by-phrase audio (private test build)

**What I can and cannot claim:** everything below has passed in desktop Chromium against the real host. **None of it has run on an iPhone.** This list is how to find out. Only the *private test build* has phrase audio (see `PREVIEW.md`); the real app does not.

## Before you start
* Test build deployed and opened via its private address; Add to Home Screen as **Hifz test** (title says "Hifz OS (test)"). Settings → Reciter → **Yasser Al-Dossary** (or Maher).
* Wi-Fi first, then repeat the key steps on mobile data. Note iOS version and iPhone model. Silent switch **off** for the first pass.

## Part-by-part learning (the main thing to try). Use **Ayat al-Kursi (2:255)** — it has eight parts — with Yasser or Maher in the test build
Verified phrase audio exists for **Ta-Ha** only (Yasser: 20:40; Maher: 20:71 are good long ones). For any other ayah, the part screen says "Audio for this part on its own isn't available… the whole ayah plays", which is the correct fallback. Do 2:255 for the learning flow and Ta-Ha for the audio.
| # | Do this | Expect | Record |
|---|---|---|---|
| 1 | Today → set a goal "Ayat al-Kursi" (or Quran → 2:255 → Learn) | The plan item says "start with part A of N" | screenshot |
| 2 | Open it | Row of letters A B C…, A highlighted; the text shows only the first part | |
| 3 | Sound: tap **Hear this part** (Ta-Ha 20:40 with phrase audio) | Only part A plays, in the chosen reciter's voice | first-sound seconds |
| 4 | Continue → Flow: tap "Say it aloud" a few times → **Natural** | Moves on to recall | |
| 5 | Recall: say it, **Show text**, **On my own** | "Part A is in" with **Next: part B** and **Finish for today** | |
| 6 | Tap **Finish for today** | Back on Today; nothing marked memorised | |
| 7 | Close the app completely, reopen, open the same ayah | Starts at **part B**; A shown as done | Y/N |
| 8 | Learn B: Flow shows **B**, then **A → B**; **Hear this part** on A → B plays both with the reciter's own pause | Y/N |
| 9 | Recall B, then **A → B** from memory | "A → B is joined" | |
| 10 | Mid-part: leave the app for a minute, return | Same step, nothing graded for you | Y/N |
| 11 | **Next day:** open the ayah | "Welcome back. Before adding part C, say what you already have (A–B)" | Y/N |
| 12 | In that check, choose **Needed a prompt**, tap the word you slipped on | You are sent back to that part only, not to A | Y/N |
| 13 | Finish all parts | The ordinary whole-ayah recall appears; only after it does the ayah get a review schedule | Y/N |
| 14 | A short ayah (112:1) | Exactly the familiar Sound → Flow → Recall, no letters | Y/N |
| 15 | Settings → another reciter, open Ta-Ha 40 | Parts still work; the part audio says it isn't available and plays the whole ayah (no other reciter's timings are used) | Y/N |

## Phrase-audio checks on the device (record pass/fail and the number asked for)
| # | Do this | Expect | Record |
|---|---|---|---|
| 1 | Settings → About → Audio sources → run the device check | The "Phrase audio" line says some pauses are "genuine and clean" and gives "median N ms for M KB" | N, M (latency + window size on your phone) |
| 2 | Part A with **3×** selected, **Hear this part** | Three whole copies, even gaps, no clicks, no cut-off first or last syllable | Y/N, any click |
| 3 | The ordinary play button on an ayah that has phrase audio | The line under it reads "same recording as the phrases"; voice and room match | Y/N |
| 4 | An ayah without phrase audio | No "same recording" wording; ordinary audio | Y/N |
| 5 | While a part plays: lock the phone; then return | Stops cleanly; next tap works | Y/N |
| 6 | Silent switch **on**, tap **Hear this part** | Report whether you hear it | heard? |
| 7 | From the Home Screen icon (installed mode): repeat 2 | Same as in Safari | Y/N |
| 8 | Airplane mode, tap **Hear this part** | Plain message and the whole ayah plays only if you saved it; never another reciter | message text |
| 9 | 10 minutes of practice across several parts | No slowdown, no page reload, no dropouts | any reload/slowdown |

## The specific iPhone risks I could not test
1. **Decoding an MP3 byte window that starts mid-stream** (`decodeAudioData`). Chromium accepted it; Safari's decoder may reject a window whose first frame lacks the bit reservoir. Symptom: step 3 says the recording "could not be read here" for every phrase. If so, tell me the iOS version; the fix is to align windows to frame boundaries.
2. **Memory.** By design a phrase decodes ≈10 s of stereo audio (≈3.5 MB) and at most five are kept; a session fetched 0.6–0.7 MB of a 23 MB file. If Safari reloads the page during step 13, that design is wrong for your device.
3. **Autoplay/gesture rules and the ringer switch** (steps 9–10): the player starts audio only from a tap and sets the playback audio session where Safari supports it.
4. **Range/CORS in Safari**: expected fine (the host answers `206`, `access-control-allow-origin: *`, exposes `Content-Range`).

## If you have a Mac
Safari → Develop → [your iPhone] → the page → Timelines/Memory while doing step 13 gives real memory numbers; I would use them to tune the cache size.
