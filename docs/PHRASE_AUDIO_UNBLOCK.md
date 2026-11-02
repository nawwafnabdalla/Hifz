# Hosts still blocked from the build environment, and what each unlocks (3 Nov 2026)

Already reachable and used: `github.com` (release assets), `huggingface.co` (API only), `qul.tarteel.ai` (documentation), `audio-cdn.tarteel.ai` (the Maher/Yasser/other Tarteel recordings).
Every host below answers `403 CONNECT tunnel failed` today. Allow them in Cloud environment → Network access → Allowed domains.

| Hostname(s) | Unlocks |
|---|---|
| `www.tarteel.ai` | Read Tarteel's Terms of use and Privacy Policy (linked from QUL) for the audio-rights decision. **Highest value for rights.** |
| `alquran.cloud`, `cdn.islamic.network` | Re-read Islamic Network's terms (which `SOURCE_RIGHTS` relies on) and test whether Maher's Islamic Network recording can be a cleaner, cacheable alternative. |
| `quran.foundation`, `api-docs.quran.foundation`, `quranicaudio.com`, `download.quranicaudio.com` | Read the Quran Foundation / Quran.com audio terms; verify Maher's and other QuranicAudio recordings (19 QUA recitations). |
| `everyayah.com`, `www.everyayah.com` | Re-read EveryAyah's statement; align the existing EveryAyah recordings the app already plays. |
| `mp3quran.net`, `api.mp3quran.net`, `cdn.mp3quran.net` (and the `serverN.mp3quran.net` host the API returns) | **Badr Al-Turki**'s MP3Quran recording: fetch it and align it ourselves; Minshawi and 26 other QUA recitations; MP3Quran terms. |
| `archive.org`, `*.us.archive.org` | Yasser (taraweeh recording). |
| `media.way2quran.com`, `download.tvquran.com` | 7 + 4 more QUA recitations. |
| `us.aws.cdn.hf.co`, `cas-bridge.xethub.hf.co`, `cdn-lfs.huggingface.co` | Optional: Hugging Face file storage (the QUA dataset's per-ayah clips). |
| `hetchyy-quranic-universal-aligner.hf.space` | Optional: QUA's hosted aligner for recordings without timings (Badr). |

Nothing else is needed to continue; every script reports the exact failing hostname when one is blocked.
