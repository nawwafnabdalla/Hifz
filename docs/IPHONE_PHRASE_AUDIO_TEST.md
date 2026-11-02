# iPhone test: phrase-by-phrase audio (private test build)

**What I can and cannot claim:** everything below has passed in desktop Chromium against the real host. **None of it has run on an iPhone.** This list is how to find out. Only the *private test build* has phrase audio (see `PREVIEW.md`); the real app does not.

## Before you start
* Test build deployed and opened via its private address; Add to Home Screen as **Hifz test** (title says "Hifz OS (test)"). Settings → Reciter → **Yasser Al-Dossary** (or Maher).
* Wi-Fi first, then repeat the key steps on mobile data. Note iOS version and iPhone model. Silent switch **off** for the first pass.

## Steps (record pass/fail and the number asked for)
| # | Do this | Expect | Record |
|---|---|---|---|
| 1 | Settings → About → Audio sources → run the device check | The "Phrase audio" line says some pauses are "genuine and clean" and gives "median N ms for M KB" | N, M (latency + window size on your phone) |
| 2 | Learn → Ta-Ha **94** (Yasser) | Sound step shows "Hear a phrase on its own" with **A** and **B** | screenshot |
| 3 | Tap **A**, stopwatch to first sound | First time under ~2 s; later taps under ~0.5 s. Words are "Qāla yabna'um lā ta'khudh biliḥyatī wa lā bira'sī" and nothing else | seconds; correct words? (Y/N) |
| 4 | Set **3×**, tap **A** | Three whole copies, even gaps, no clicks, no cut-off first or last syllable | Y/N, any click |
| 5 | Tap **B** | "Innī khashītu an taqūla… qawlī", nothing from phrase A | Y/N |
| 6 | Continue to Flow; reach **A → B** and tap **Hear this part** | One smooth recitation of both phrases with the reciter's own pause | Y/N |
| 7 | Tap the ordinary play button | The line under it names `audio-cdn.tarteel.ai (same recording as the phrases)`; the voice/room matches the phrases | Y/N |
| 8 | Open Ta-Ha **71** (not verified for Yasser) | No phrase panel; ordinary audio; the line names the ordinary source | Y/N |
| 9 | While a phrase plays: lock the phone; then return | Stops cleanly (does not play on); next tap works | Y/N |
| 10 | Silent switch **on**, tap **A** | Report whether you hear it (Web Audio and the ringer switch behave differently across iOS versions) | heard? |
| 11 | From the Home Screen icon (installed mode): repeat 3 and 4 | Same as in Safari | Y/N |
| 12 | Airplane mode, tap **A** | Plain message (phrase audio unavailable) and the whole ayah plays from a saved copy only if you saved one; the app never plays another reciter | message text |
| 13 | 10 minutes of practice, ~30 phrases across 5 ayahs | No slowdown, no page reload, no audio dropouts | any reload/slowdown |
| 14 | Repeat 3–5 with **Maher**, Ta-Ha **71** | Same | Y/N |

## The specific iPhone risks I could not test
1. **Decoding an MP3 byte window that starts mid-stream** (`decodeAudioData`). Chromium accepted it; Safari's decoder may reject a window whose first frame lacks the bit reservoir. Symptom: step 3 says the recording "could not be read here" for every phrase. If so, tell me the iOS version; the fix is to align windows to frame boundaries.
2. **Memory.** By design a phrase decodes ≈10 s of stereo audio (≈3.5 MB) and at most five are kept; a session fetched 0.6–0.7 MB of a 23 MB file. If Safari reloads the page during step 13, that design is wrong for your device.
3. **Autoplay/gesture rules and the ringer switch** (steps 9–10): the player starts audio only from a tap and sets the playback audio session where Safari supports it.
4. **Range/CORS in Safari**: expected fine (the host answers `206`, `access-control-allow-origin: *`, exposes `Content-Range`).

## If you have a Mac
Safari → Develop → [your iPhone] → the page → Timelines/Memory while doing step 13 gives real memory numbers; I would use them to tune the cache size.
