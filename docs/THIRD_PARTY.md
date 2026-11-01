# Third-party material and credits

| Material | Source | Terms | How we comply |
|---|---|---|---|
| KFGQPC HAFS Uthmanic Script v3.0 (font) | King Fahd Glorious Quran Printing Complex, fonts.qurancomplex.gov.sa | Free to use, copy and distribute; may not be sold, modified, altered, converted or reverse engineered (embedded licence: `data/fonts/KFGQPC-EULA.txt`) | Byte-identical file, test-enforced; licence kept inside the file; credit in About |
| KFGQPC Hafs v3.0 text with signs, page and line data | `@quran.ws/text@0.1.0` (quran.ws), derived from the Complex's release | CC BY 4.0 | Credited; used as display text and cross-check only; canonical text untouched |
| Qur'an text (canonical) | `quran-json@3.1.2` (QuranEnc), cross-checked with Tanzil and QUL | see `data/PROVENANCE.md` | unchanged; whitespace errata documented |
| Amiri, Amiri Quran | SIL OFL 1.1 (via @fontsource) | OFL | Simple script and fallback |
| Translation | Saheeh International via Tanzil | personal, verbatim, attributed | review before public release |
| Verse audio (streaming) | EveryAyah.com (reciters hold the rights; site publishes no licence) | none stated | streamed only; **never saved offline**; credited with a link; personal study |
| Verse audio (streaming and offline copies) | Islamic Network CDN (alquran.cloud) | reported: free for personal, non-commercial and educational use incl. download (terms page not read directly; verify) | copies kept only on the listener's own device, removable in Settings; credited |
| Full-surah audio | MP3Quran catalogue | public catalogue; terms not verified from the build environment | streamed from the phone, never stored |
| Word timings (planned) | Quran Align (cpfair/quran-align), CC BY 4.0, or QUL segments | CC BY 4.0 for Quran Align (read from its README); QUL terms not read | Not yet bundled. When imported, provenance (source, licence, url, recording, method, date) is stored with the data and credit is shown in About. A timing licence does not grant any right to the audio itself. |
| Word morphology (developer comparison only) | Quranic Arabic Corpus v0.4, fork `mustafa0x/quran-morphology`, SHA-256 `742bfac5…` | GNU GPL with attribution to corpus.quran.com (confirmed by the project owner at corpus.quran.com/download) | **Not shipped and not used by the shipped model.** Raw data is git-ignored/not committed; corpus-derived scores go to the git-ignored `data/gpl/`. See `PHRASE_AUDIO_LEGAL.md`. |
