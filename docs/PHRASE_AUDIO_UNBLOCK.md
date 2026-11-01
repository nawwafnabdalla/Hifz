# Unblocking the audio: exact hostnames and files

**State after Route A (1 Nov 2026).** The timing data is in hand. The audio is not: every audio host answers `403 CONNECT tunnel failed` from this environment's proxy. Verified by direct probe of each hostname.

## Allow these hostnames (Cloud environment → Network access → Allowed domains)
Needed first, for the Ta-Ha validation of Maher and Yasser:

| Hostname | Why | Recitations that use it |
|---|---|---|
| `audio-cdn.tarteel.ai` | Yasser (tarteel, 48 kHz CBR) and Maher (tarteel, 128 kbps) | 9 |
| `download.quranicaudio.com` | Maher (qdc, 96 kbps) | 19 |
| `archive.org` and `ia601406.us.archive.org` (archive.org redirects to `ia*.us.archive.org`; allow `*.us.archive.org` if wildcards are accepted) | Yasser (archive, 128 kbps) | 3 |
| `cdn.mp3quran.net` | Minshawi and 26 more | 27 |

For the wider expansion: `media.way2quran.com` (7) and `download.tvquran.com` (4).
Optional, for developer-only listening checks against per-ayah clips embedded in the QUA dataset: `us.aws.cdn.hf.co`, `cas-bridge.xethub.hf.co`, `cdn-lfs.huggingface.co`, `cdn.hf.co`.
Optional, to align recordings that have no timings (Badr Al-Turki on MP3Quran): `hetchyy-quranic-universal-aligner.hf.space`.

Then run (nothing else is needed; it checks Range support, the byte size, bitrate and MP3 header of each surah file, and stores them):
```
node scripts/import-qua.mjs --release-dir <folder with manifest.json, catalog.json and the zips> \
   --slug yasser_al_dosari_tarteel --reciter dossary --surahs 20 --probe
```
Download the release folder with `curl -L https://github.com/QUD-Technologies/quranic-universal-audio/releases/download/v4.0.0/<file>` for `manifest.json`, `catalog.json` and each `<slug>.zip` (all 102 were already fetched and checked in this session; they are not committed).

## Route B: send files instead (no allowlisting)
The exact files, from `data/crosscheck/qua-v4.0.0-taha-audio-urls.txt` (Ta-Ha is surah 20, file `020.mp3`). Download them yourself, from those URLs, and put them in one folder per recitation (`<slug>/020.mp3`):
1. `https://audio-cdn.tarteel.ai/quran/surah/yasserAlDosari/murattal/mp3/020.mp3` → `yasser_al_dosari_tarteel/020.mp3`
2. `https://download.quranicaudio.com/quran/maher_almu3aiqly/year1440/020.mp3` → `maher_al_muaiqly_qdc/020.mp3`
3. `https://audio-cdn.tarteel.ai/quran/surah/maherAlMuaiqly/murattal/mp3/020.mp3` → `maher_al_muaiqly_tarteel/020.mp3`
4. `https://archive.org/download/Yasser_Aldosari_MP3_Quran/020.mp3` → `yasser_al_dosari_archive/020.mp3`
Use the file exactly as served (no re-encoding; a re-encoded copy has different timing). Then:
```
node scripts/import-qua.mjs --release-dir <release folder> --slug yasser_al_dosari_tarteel --reciter dossary --surahs 20 --audio-dir yasser_al_dosari_tarteel
```
The importer refuses a file whose bitrate differs from the catalogue's, or that is variable-bitrate.

## After import
`ReciterCheck` (Settings) reports phrase audio for the selected reciter. On the phone: Learn → Ta-Ha → verse 94, listen to each phrase, then follow `IPHONE_CHECKLIST.md`.
