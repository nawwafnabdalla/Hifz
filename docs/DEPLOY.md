# Go live from your iPhone

Three short jobs. Do them in this order. Everything works in Safari.

> The app also works **without** the cloud (data stays on the phone). Jobs 1 and 2 add the cloud backup and sync.

---

## Job 1: Create the database tables (Supabase)

The project **hifz-os** exists and is empty (project id `dfygzjfrkkrmmomwbtma`). It needs one script run **once**.

### Easiest: paste it yourself (no time limit)

1. In Safari open the Raw script on GitHub (long-press, select all, Copy):
   `https://raw.githubusercontent.com/nawwafnabdalla/Hifz/claude/hifz-os-feasibility-btrmfb/supabase/migrations/20261031000001_core_schema.sql`
2. Open the SQL editor of **hifz-os**: `https://supabase.com/dashboard/project/dfygzjfrkkrmmomwbtma/sql/new`
3. Paste. Tap **Run**. If Supabase warns about "destructive" statements, that is the `REVOKE` and `DELETE` lines explained below. Confirm.
4. You should see "Success. No rows returned". Check **Table Editor**: 8 tables (`review_events`, `flow_events`, `declarations`, `study_sessions`, `learning_targets`, `phrase_markers`, `experiments`, `profiles`).
5. Tell Claude "migration applied". Claude will then run the security tests against the real database and report the results.

### Or: let Claude apply it
Reply **retry migration**. A confirmation card from Supabase appears and expires after about **60 seconds**, so keep the Claude app open and tap approve straight away. (It timed out twice because it went unanswered.)

### What the "destructive" lines are
| Statement | Meaning |
|---|---|
| `REVOKE …` | Removes privileges from tables created by this same script: signed-out visitors get no access; signed-in users cannot UPDATE, DELETE or TRUNCATE event history. It tightens security and deletes nothing. |
| `DELETE FROM …` (8 lines) | Inside the function `erase_my_data()`. Not run by the script. Runs only if a signed-in user taps "Erase all", and only on that user's own rows. |
| `ON DELETE CASCADE` | Deleting a user from this project's auth table removes that user's rows. Same project only. |
| Not present | `DROP`, `TRUNCATE`, changes to any other schema, any other project. |

---

## Job 2: Publish the app (Cloudflare Pages)

1. Open the Cloudflare dashboard in Safari and sign in. Go to **Workers & Pages**.
2. Tap **Create** (or **Create application**), choose the **Pages** tab, then **Connect to Git** (if you only see "Workers", look for the small link "Looking to deploy Pages? Get started").
3. Connect **GitHub**, allow access to the repository **`nawwafnabdalla/Hifz`**, select it, tap **Begin setup**.
4. Fill the form exactly:

   | Field | Value |
   |---|---|
   | Project name | `hifz-os` (your address becomes `hifz-os.pages.dev`) |
   | **Production branch** | `claude/hifz-os-feasibility-btrmfb` |
   | Framework preset | **None** |
   | **Build command** | `npm run build` |
   | **Build output directory** | `dist` |
   | Root directory | leave empty |

5. Open **Environment variables** and add these three (for Production):

   | Name | Value |
   |---|---|
   | `NODE_VERSION` | `22` |
   | `VITE_SUPABASE_URL` | `https://dfygzjfrkkrmmomwbtma.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_zSUZFDrMCOf3xKVQ9MKYrw_lhqsvVee` |

   The publishable key is meant to be public; it can only do what the database rules allow. Never paste a "secret" or "service_role" key anywhere.
6. Tap **Save and Deploy**. Wait about 2 minutes for "Success". Open the address it shows.

If the variables were forgotten: add them under the project's **Settings → Environment variables**, then **Deployments → Retry deployment**. They are read at build time.

I verified this exact recipe from a clean clone of the pushed branch: `npm ci` then `npm run build` succeeds, producing `dist/`.

### Then tell Supabase where the app lives
In Supabase (**hifz-os**) → **Authentication → URL Configuration**:
* **Site URL:** your Pages address, e.g. `https://hifz-os.pages.dev`
* **Redirect URLs:** add `https://hifz-os.pages.dev` and `https://hifz-os.pages.dev/**`

Then **Authentication → Sign In / Providers → Email** (names move around; look for *Confirm email*):
* Simplest for a personal app: turn **Confirm email OFF**, so "Create account" signs you in immediately.
* If you leave it ON: the confirmation email's link must open your Pages address (set above), and the built-in mailer allows only a few emails per hour.

---

## Job 3: Install and test

Open your Pages address in **Safari** → **Share** → **Add to Home Screen**. Open the app from its icon (not from Safari).
Then follow **`docs/VALIDATE.md`**, a step-by-step phone checklist for starting Surah Ta-Ha.

## If something goes wrong

| Symptom | Fix |
|---|---|
| Settings says "Cloud sync isn't configured" | The two `VITE_*` variables were missing at build. Add them, **Retry deployment**. |
| Sign-up says "check your email" and nothing arrives | Turn **Confirm email** off (above). |
| Signed in, but sync shows an error | Job 1 not done yet. |
| Page shows an old version | Close and reopen the app once. |
| A deep link such as `/quran/20` shows "not found" | It should not; Pages serves the app for unknown paths. Tell Claude. |
