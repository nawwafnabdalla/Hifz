# Permission request: ready to send

**Status: not sent. No permission exists yet.** Send it yourself (or tell me to post the GitHub issue if you want it posted from this account; I will not post anything outward without your say-so). Channels below come from the projects' own documentation, not guesses. I have not invented email addresses.

## Where to send it
| Who | Why them | Channel (from their docs) |
|---|---|---|
| **Tarteel / QUL** (Quranic Universal Library) | Operates `audio-cdn.tarteel.ai`; QUL publishes these recordings as downloadable resources "to integrate in your own app" but tells developers to self-host and not hotlink; its licence pane for Maher and Yasser says "We don't have copyright information for this resource" | GitHub issue: https://github.com/TarteelAI/quranic-universal-library/issues · QUL Discord (link in QUL's header, `t.zip/discord`) · Terms: https://www.tarteel.ai/terms (not readable from my sandbox; please read it) |
| **QUA** (Quranic Universal Audio, QUD Technologies) | Built the word timings; lists the recordings' sources; offers removal/relinking on request | GitHub issue: https://github.com/QUD-Technologies/quranic-universal-audio/issues · Discord https://discord.gg/cZ3V2FynXz |
| **The reciters' side** (ask Tarteel who) | Only the rights holder can license the recitation itself | via the answer from Tarteel/QUL |

## What QUL actually says (read 3 Nov 2026)
* `docs/tutorial-recitation-end-to-end`: "audio_url points at Tarteel's CDN… the CDN is shared infrastructure that QUL does not guarantee for third-party production traffic. **Download the files and self-host them (own storage or CDN) before wiring them into a production app; do not hotlink audio-cdn.tarteel.ai at runtime.**"
* `docs/downloading-data`: "download them once and serve them from your own storage or CDN. Tarteel's CDN is shared infrastructure, not a guaranteed production dependency."
* `faq`: "Can I use QUL data commercially? Check repository license terms and dataset-specific licensing details before production use." The repository's MIT licence covers the **software**; each recitation's own Licence pane says **no copyright information is held**.
* So: QUL's guidance **assumes** apps will download and self-host, and forbids hotlinking in production. It does **not** state a licence for the recordings. Self-hosting is therefore *invited by the instructions but not granted in writing*; that gap is what the request closes.

## Draft (adapt names in brackets)
**Subject:** Permission to use Maher Al-Mu'aiqly and Yasser Al-Dosari recordings in a free memorisation app (Hifz OS)

> As-salamu alaykum,
>
> I am [YOUR NAME], developer of **Hifz OS**, a free, non-commercial web app that helps a learner memorise the Qur'an phrase by phrase with the recitation they love. It has no ads, no sales and no tracking; at present it is used by me and [a small circle of friends / N people]. It is not distributed through an app store.
>
> I would like to use up to three recitations from the Quranic Universal Library, in Hafs 'an 'Asim: **Maher Al-Mu'aiqly**, **Yasser Al-Dosari** and **Abdulrahman Al-Sudais** (the surah-by-surah recordings at `audio-cdn.tarteel.ai/quran/surah/maherAlMuaiqly/murattal/mp3/` and `…/yasserAlDosari/murattal/mp3/` and the equivalent Sudais path, with the word-level timings published in Quranic Universal Audio v4.0.0, CC BY 4.0).
>
> **What the app does:** a learner memorises a long ayah a section at a time. The app plays one short section of the ayah (a few seconds), repeats it for memorisation, then plays it joined to the section before, and finally the whole ayah. Technically the browser requests only the small byte range of the surah file that contains the section, decodes it in memory, plays it, and keeps nothing on disk beyond the browser's normal cache; nothing is re-encoded, re-uploaded or offered for download. It always shows whose recitation is playing and credits the reciter, QUL/Tarteel and Quranic Universal Audio. It never offers audio for download, never sells or monetises it, and never mixes recordings of different reciters.
>
> **Your guidance is to self-host rather than hotlink**, and I would like to follow it. Could you please confirm, in writing:
> 1. that I may **download these recordings and serve them from my own storage/CDN** (Cloudflare R2) to the users of Hifz OS, in a free, non-commercial app, with credit;
> 2. whether I may also let users' browsers **cache** the audio for offline practice, or whether it must be streamed only;
> 3. who owns the rights to these recordings (the reciter, a publisher, or Tarteel), and, if it is not Tarteel, whom I should ask and what terms apply;
> 4. any conditions you would like: attribution wording, a takedown contact, limits on traffic or number of users.
>
> If self-hosting is not permitted, I will not use these recordings and would be grateful for any recordings you can point me to whose terms allow this use.
>
> Jazakum Allahu khayran,
> [NAME] · [contact] · [Hifz OS link, if you want one shared]

## Short version for a Discord message
> Salam. I'm building a free, non-commercial Qur'an memorisation app (Hifz OS). QUL's docs say to self-host Tarteel CDN audio instead of hotlinking. For Maher Al-Mu'aiqly and Yasser Al-Dosari (QUL surah-by-surah), may I download and self-host them with credit for a free app, and may users cache them offline? The resource's Licence tab says there's no copyright info; who holds the rights? Happy to share details. JazakAllahu khayran.

## What I will do with each answer
| Answer | Action |
|---|---|
| Yes, self-host allowed | Host the files on Cloudflare R2 (≈2.7 GB for both; check current R2 pricing/free tier), point `import-qua.mjs --audio-base` at them (same bytes, so every verification stays valid; the script re-checks size and hash), add the credit wording they ask for, then proceed to the other release gates. |
| Yes, but streaming only / their CDN allowed | Keep the current design; ask for a written statement and a traffic expectation. |
| Rights are the reciter's/publisher's | Send the same request to that party; nothing ships meanwhile. |
| No / no answer | Do not ship. Use the alternatives in `PHRASE_AUDIO_RIGHTS.md`. |
