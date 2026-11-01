# Reciter compatibility matrix for phrase-by-phrase audio

Written 1 Nov 2026. **Honest summary: no reciter is yet "Ready".** The engine, the importers and the validators are built and tested on synthetic recordings; no *real* word timings or real recordings have been reachable from the build environment, so nothing has been validated on a real recitation. Classes are assigned from what was actually read, and "Promising" is never presented as verified.

## Update after Route A (network allowlist), 1 Nov 2026
**Reachable now:** `github.com` release assets (including the `objects`/`release-assets` redirect), `huggingface.co` API and `qul.tarteel.ai`. **Still blocked (`403 CONNECT tunnel failed`):** every audio host, and Hugging Face's file storage (`us.aws.cdn.hf.co`, `cas-bridge.xethub.hf.co`, `cdn-lfs.huggingface.co`, `cdn.hf.co`).

**Obtained and checked, from the real v4.0.0 release:** `manifest.json`, `catalog.json` and all 102 recitation zips. Every zip's SHA-256 matches the manifest. Every ayah's word count in the timing files equals this app's canonical text (no text-edition mismatch found). 86 recitations are Hafs ʿan ʿĀṣim; 16 are other qirāʾāt and are refused. Full per-recitation table: [`QUA_V4_MATRIX.md`](QUA_V4_MATRIX.md).

**What changed from the earlier guesses (now evidence):**
* QUA aligns to **specific whole-surah files at specific URLs** (the catalogue lists one per chapter) and times words edge to edge (median gap 0 ms), so pauses must come from the audio, as the player already does.
* **Maher:** `maher_al_muaiqly_qdc` (download.quranicaudio.com, 96 kbps, *mujawwad* style) and `maher_al_muaiqly_tarteel` (audio-cdn.tarteel.ai, 128 kbps, murattal). Both are 6,236 ayahs and Hafs. Neither is the EveryAyah file the app currently plays for Maher.
* **Yasser:** `yasser_al_dosari_tarteel` (audio-cdn.tarteel.ai, 48 kHz CBR) and `yasser_al_dosari_archive` (archive.org, 128 kbps, taraweeh recording) are streamable. `yasser_al_dosari_yt` is YouTube-only.
* **Minshawi:** `mohammed_siddiq_al_minshawi_mp3quran` (cdn.mp3quran.net, 128 kbps) is streamable.
* **Badr Al-Turki:** QUA has full timings, but they are aligned to a **YouTube** upload (192 kbps with chapter offsets). An app cannot stream or legitimately re-host that, and the MP3Quran recording of Badr is a different file, so QUA's timings must not be applied to it. Status: **Unavailable for now**; the route is to align the MP3Quran recording ourselves (see `ALIGNMENT.md`), which needs that audio reachable.
* 61 recitations (Hafs, streamable, constant bitrate) are **Promising**; 0 are **Ready**, because Ready requires the audio itself to have been fetched and checked against the timings.

## What "Ready" requires (all of these, for one specific recording)
1. Word timings that describe that exact recording (source, file, edition, byte size, bitrate, duration; never "the same reciter").
2. Same riwayah as the app's text (Hafs ʿan ʿĀṣim). No silent mixing of qirāʾāt.
3. The importer's checks pass for the ayahs claimed: word count equals the canonical text, ordered spans, inside the file, ≥85% of words timed, CBR MP3 (for surah files).
4. The audio can be fetched by the app's player (CORS; for surah files also HTTP Range, `Content-Range` exposed).
5. Rights: the app only *streams* the recording from its host (unchanged policy); saving it offline needs that source's terms to allow it (`SOURCE_RIGHTS`). Timing metadata licence is separate (see `PHRASE_AUDIO_LEGAL.md`).
6. At least the Ta-Ha example heard end to end on a real device (see `IPHONE_CHECKLIST.md`).

## Matrix
| Reciter | Recording (source:edition) | Timings | Coverage claimed | Audio source | Rights (audio / timings) | Phrase playback possible? | Needs | Class |
|---|---|---|---|---|---|---|---|---|
| Maher Al-Muʿaiqly | Quranic Universal Audio (QUA) v4.0.0 recitation, whole-surah recording (id from `catalog.json`, **not read**) | QUA word-level timing; reported by the user from the v4.0.0 release page, **files not obtained** | Reported full Qur'an | QUA lists the original surah URL in `catalog.json` (**not read**). The app's current Maher whole-ayah audio is EveryAyah `MaherAlMuaiqly128kbps` / Islamic Network `ar.mahermuaiqly`: **a different recording unless proved otherwise** | Audio: reciter's/host's; stream-only from EveryAyah; Islamic Network allows saving. Timings: CC BY 4.0 (QUA README/LICENSE read) | Yes, once files are imported and the *timed recording* is the one played | `catalog.json`, the recitation's timing file(s), a surah MP3 per surah for byte size/bitrate (or the app fetches Range headers live); decide whether Maher's whole-ayah button should also play the timed recording | **Promising** |
| Yasser Al-Dosari | QUA v4.0.0 recitation (as above) | Reported full coverage; **not obtained** | Reported full Qur'an | As above; app's current whole-ayah audio is EveryAyah `Yasser_Ad-Dussary_128kbps` (stream-only, not savable) | As above | Same | Same. If QUA's audio source is the EveryAyah per-ayah set, the existing `import-timings.mjs` path applies; if it is a surah recording, `import-qua.mjs` | **Promising** |
| Mohamed Siddiq Al-Minshawi | QUA entry `mohammed_siddiq_al_minshawi_mp3quran` (named in the QUA documentation I read) → `server10.mp3quran.net/minsh/{SSS}.mp3` (MP3Quran, full Qur'an) | Whether QUA has timings for it was **not verified** | Unknown | MP3Quran whole-surah; CORS/Range support unverified | Not read | Possible | The same catalogue/timing files | **Promising** (documented source, no verified timings) |
| Badr Al-Turki | MP3Quran whole-surah only; **no verse-by-verse source known** | None known | — | Whole surah only | Not verified | Only by aligning the surah recording ourselves, then storing timings per ayah | Alignment (see `ALIGNMENT.md`) + an audio source we may legitimately fetch | **Needs alignment** |
| Alafasy, Husary, Husary (teaching), Abdul Basit, Sudais, Shuraym, Shaatree, Hudhaify, Ayyoub, Rifai | EveryAyah per-ayah (and for most, Islamic Network) | Quran Align (cpfair) *may* publish some of the EveryAyah-style reciters; **which ones could not be read** | Unknown | EveryAyah: stream-only. Islamic Network: savable, different encoding → a different recording | Quran Align: CC BY 4.0 (README read). EveryAyah: no licence published, stream-only | Possible per recording, if timings exist | Quran Align release listing | **Unknown → treated as Needs data**, not Ready |
| Any reciter, qirāʾāt other than Hafs | — | — | — | — | — | **No**: refused by the importer and the registry | — | **Unavailable by design** |

## Why nothing is above "Promising"
* The QUA release assets (catalogue, timing files, surah audio) could not be fetched: `github.com`, `api.github.com`, `codeload`, `huggingface.co`, `qul.tarteel.ai`, `api.qurancdn.com`, `everyayah.com` and the MP3Quran hosts all return the environment's `403 CONNECT` policy answer. That is a policy decision of the sandbox, not evidence the files don't exist, and nothing was circumvented.
* What *was* read (via `raw.githubusercontent.com`): QUA README, LICENSE, the QUL-vs-QUA timestamp comparison, the inspector README; Quran Align README. The QUA data-format and catalogue-schema files returned 404 at the paths I guessed, so the real file layout is **unverified**; `import-qua.mjs --inspect` exists to settle that in one command.

## Catalogue survey (what each source offers, as far as read)
| Source | Verse-level audio | Word timings | Rights notes | Verdict |
|---|---|---|---|---|
| Quranic Universal Audio (QUD-Technologies) | Not bundled in one format (original surah URLs in `catalog.json`); another format embeds per-ayah clips (README) | Yes: word-level; the README badge claims 1,214 reciters; aligned to *whole-surah* recordings | Timings/catalogue/code CC BY 4.0; recordings stay with reciters/hosts | Primary candidate; the engine already reads this shape (windowing a surah file by byte range) |
| QUL / Tarteel (qul.tarteel.ai) | Per-ayah and surah | Word segments for many recitations (comparison doc read: QUA claims better accuracy) | Not read (403) | Unverified; `import-timings.mjs --format qul` is written from documentation only |
| Quran Align (cpfair) | EveryAyah-style recordings | Yes, word segments; mean error < 73 ms vs an independent system (README) | CC BY 4.0 | Known-good format; release listing not readable here |
| Quran Foundation / Quran.com API | Yes | Word segments in some endpoints | Not read (403) | Unverified |
| EveryAyah | Per-ayah, many reciters | No | No licence published; stream only | Audio source only |
| Islamic Network CDN | Per-ayah | No | Savable | Audio source only |
| MP3Quran | Whole-surah | No | Not read | Audio source for surah-aligned timings only |
| QuranLab (Hugging Face) | Not read | Not read | Not read (403) | Unknown |

## How the app protects users from mismatches (all tested)
* Timings are stored per recording (`reciter--recording.json`) and looked up by recording id; another recording of the same reciter never borrows them.
* Edition checks: decoded length within 60 ms (per-ayah) or surah file byte size equal to the stored size (Content-Range) — otherwise the phrase is refused, the reason is shown in plain words, and the *same reciter's whole ayah* plays. The reciter is never switched silently.
* Cuts are made only where the decoded audio has a real pause; otherwise refused.
* **Known limit (tested, documented):** a timing file that is consistently offset from the real audio (right file, wrong ayah origin) still cuts cleanly at genuine pauses and plays the *wrong words*. The runtime cannot detect that. Protection must come from import-time validation against the real recording and from listening to the Ta-Ha example once per recitation.

## Adding a reciter (the whole process)
1. `node scripts/import-qua.mjs --inspect --timings <file>` and read what it understood.
2. Import a single surah first: `--surahs 20`, with the surah MP3 in `--audio-dir` (named `020.mp3`), then read the skip report.
3. Open Learn → Ta-Ha → verse 94 in the app with that reciter selected; listen to each phrase once; check against the printed text.
4. Only then import the full set and commit `src/data/timings/<reciter>--<recording>.json` (provenance is stored in the file).
5. Add the reciter's recording to `sources.ts` only if the *timed* recording is the one that should play for that reciter.
