# Offline tool: English clause evidence for the Arabic word gaps
Python 3, standard library only (about 3 minutes). It reads the shipped Arabic text and the Saheeh translation, learns an Arabic-English word alignment from them (an IBM-model-1-style model with a diagonal prior, in both directions), maps English clause boundaries onto Arabic word gaps and writes `src/data/generated/meaning-evidence.json`. That file is the only thing the app uses; nothing here runs in the app.
```
python3 -I scripts/meaning/align2.py      # trains both directions into scripts/meaning/.cache (git-ignored)
python3 -I scripts/meaning/gen.py         # writes src/data/generated/meaning-evidence.json
python3 -I scripts/meaning/build_evidence.py 2.0   # English-only precision/recall on the reference set (a diagnostic, not the method)
```
`proto.py` also holds the tokenisers (it is imported by the others; run on its own it trains a first, simpler model). See `docs/MEANING_BREAKDOWN.md`. If the translation text changes, regenerate: the evidence records the translation's length per ayah and is ignored for any ayah where it no longer matches (a test enforces this).
