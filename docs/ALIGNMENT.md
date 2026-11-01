# Generating our own alignments: assessment

Status: **not attempted; nothing could be run here** (no reachable audio, no reachable models). This is the plan and the cost, not a result.

## When it is needed
* Reciters with no published word timings (for example Badr Al-Turki, whose only source is whole-surah MP3Quran files).
* Recordings where published timings disagree with the file we can play (checked by the import-time validators).

## Options
| Approach | What it needs | Expected quality | Cost / risk |
|---|---|---|---|
| Re-use the QUA alignment method (their repository documents the aligner; the QUL comparison document describes how it differs) | Their code and models, the recording | Documented by them as more accurate than QUL; not verified by us | Needs the code running locally; models and licences unread |
| CTC forced alignment with an Arabic / Qur'an acoustic model (for example the `@tilawi/quran-asr` family on npm, or wav2vec2-style Arabic CTC models) | Model weights, the audio, the canonical text as target | Good at word level on clean murattal; weak at long elongations and heavy qalqalah | CPU-feasible offline; hours for a full Qur'an per reciter; must be validated word by word on samples |
| Ayah-level alignment (cut each ayah, align words inside) | A per-ayah recording or a reliable ayah boundary list | More robust than whole-surah | Needs ayah boundaries first |
| Full-surah alignment | The surah file | Drift risk over long files; errors accumulate | Segment-by-segment checks needed |

## Validation required before any generated alignment is used
1. Word count equals the canonical text (the importer enforces it).
2. Silence check at every cut (the player enforces it at play time).
3. Manual spot check: ≥30 ayahs per reciter spanning short/long/elongated, listening to each phrase boundary; any failure blocks the recitation.
4. Cross-check against a second aligner or against published timings of the same recording where they exist; differences > 150 ms investigated.
5. Whole-ayah fallback remains wherever any check fails. Never keep a timestamp that cannot be explained.

## Recommendation
Use published timings first (QUA/Quran Align), validate on Ta-Ha, and only then consider aligning Badr Al-Turki. Do not build an in-house aligner before one real recitation has been verified end to end.
