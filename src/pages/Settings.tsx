import { useRef, useState } from 'react'
import { useApp } from '@/app/store'
import { Header, Sheet } from '@/components/ui'
import { Icon } from '@/components/Icon'
import { AudioCredits, ReciterCheck } from '@/components/ReciterCheck'
import { ManageDownloads } from '@/components/OfflineAudio'
import { RECITERS, SOURCE_RIGHTS } from '@/lib/audio/sources'
import { INTEGRITY } from '@/lib/quran/data'
import { cloudConfigured } from '@/lib/store/remote'
import { shortDate } from '@/lib/format'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-7 px-5"><h2 className="eyebrow mb-2">{title}</h2><div className="card divide-y divide-line">{children}</div></section>
}
function Row({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 p-4"><div className="min-w-0"><div className="font-medium">{label}</div>{hint && <div className="text-xs text-muted">{hint}</div>}</div><div className="flex-none">{children}</div></div>
}
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-7 w-12 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-line'}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} /></button>
}

export function SettingsPage() {
  const { snap, sync, user, authLoading, patchSettings, signIn, signUp, signOut, syncNow, exportJson, importJson, eraseLocal, eraseRemoteAndLocal, say } = useApp()
  const s = snap.settings
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [about, setAbout] = useState(false)
  const [sources, setSources] = useState(false)
  const [confirm, setConfirm] = useState<null | 'local' | 'all'>(null)
  const file = useRef<HTMLInputElement>(null)

  async function auth(kind: 'in' | 'up') {
    setBusy(true); setMsg(null)
    const err = await (kind === 'in' ? signIn(email.trim(), pw) : signUp(email.trim(), pw))
    setBusy(false); setMsg(err)
  }
  async function download() {
    const blob = new Blob([await exportJson()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `hifz-os-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    say('Backup downloaded')
  }

  return (
    <div>
      <Header eyebrow="Settings" title="Settings" />

      <Section title="Account & sync">
        {!cloudConfigured ? (
          <Row label="Saved on this device" hint="Everything works offline. Export a backup below." />
        ) : authLoading ? <Row label="Checking account…" /> : user ? (
          <>
            <Row label={user.email} hint={sync.status === 'syncing' ? 'Syncing…' : sync.status === 'offline' ? 'Offline. Changes are kept and will upload when you’re back online.' : sync.status === 'mismatch' ? sync.error ?? '' : sync.status === 'error' ? `Sync problem: ${sync.error}` : `Synced${sync.lastSyncAt ? ` ${shortDate(sync.lastSyncAt)}` : ''} · ${sync.pending} waiting to upload`}>
              <button className="btn btn-quiet btn-sm" onClick={() => void syncNow()} disabled={sync.status === 'syncing'} data-testid="sync-now"><Icon name="refresh" size={15} />Sync</button>
            </Row>
            {sync.quarantined > 0 && <Row label={`${sync.quarantined} item(s) couldn’t be uploaded`} hint="The server rejected them. They stay on this device and in your export." />}
            <Row label="Sign out"><button className="btn btn-ghost btn-sm" onClick={() => void signOut()}>Sign out</button></Row>
          </>
        ) : (
          <div className="space-y-3 p-4" data-testid="auth-form">
            <p className="text-sm text-ink-2">Optional. Sign in to back up your history and use it on other devices. Without an account, everything stays on this device.</p>
            <input className="h-11 w-full rounded-xl border border-line bg-bg px-3" type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
            <input className="h-11 w-full rounded-xl border border-line bg-bg px-3" type="password" autoComplete="current-password" placeholder="Password (8+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Password" />
            {msg && <p className="text-sm text-clay" role="alert">{msg}</p>}
            <div className="grid grid-cols-2 gap-2"><button className="btn btn-primary" disabled={busy || !email || pw.length < 8} onClick={() => void auth('in')}>Sign in</button><button className="btn btn-quiet" disabled={busy || !email || pw.length < 8} onClick={() => void auth('up')}>Create account</button></div>
          </div>
        )}
      </Section>

      <Section title="Offline recitations"><ManageDownloads /></Section>

      <Section title="Study">
        <Row label="Plan new memorisation" hint="Turn off to only revise"><Toggle on={s.planNew} onChange={(v) => void patchSettings({ planNew: v })} label="Plan new memorisation" /></Row>
        <Row label="Most new ayahs per day" hint="A ceiling, not a target"><select className="h-10 rounded-lg border border-line bg-bg px-2" value={s.newPerDayCap} onChange={(e) => void patchSettings({ newPerDayCap: +e.target.value })} aria-label="New ayahs cap">{[0, 3, 5, 10, 15, 20, 30].map((m) => <option key={m} value={m}>{m === 0 ? 'None' : m}</option>)}</select></Row>
      </Section>

      <Section title="Reading">
        <Row label="Appearance"><div className="flex gap-1.5">{(['system', 'light', 'dark'] as const).map((t) => <button key={t} className="chip capitalize" aria-pressed={s.theme === t} onClick={() => void patchSettings({ theme: t })}>{t}</button>)}</div></Row>
        <Row label="Script" hint="Official King Fahd Complex font"><div className="flex gap-1.5">{([['madinah', 'Mushaf'], ['simple', 'Simple']] as const).map(([v, l]) => <button key={v} className="chip" aria-pressed={s.script === v} onClick={() => void patchSettings({ script: v })} data-testid={`script-${v}`}>{l}</button>)}</div></Row>
        <Row label="Arabic size" hint="Applies everywhere"><input type="range" min={0.9} max={1.6} step={0.05} value={s.arabicScale} onChange={(e) => void patchSettings({ arabicScale: +e.target.value })} aria-label="Arabic text size" /></Row>
        <Row label="Show translation" hint="Saheeh International"><Toggle on={s.translation} onChange={(v) => void patchSettings({ translation: v })} label="Show translation" /></Row>
      </Section>

      <Section title="Audio">
        <Row label="Reciter"><select className="h-10 max-w-[12rem] rounded-lg border border-line bg-bg px-2" value={s.reciter} onChange={(e) => void patchSettings({ reciter: e.target.value })} aria-label="Reciter">{RECITERS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Row>
      </Section>

      <Section title="Your data">
        <Row label="Export backup" hint="Everything you’ve recorded, as a JSON file"><button className="btn btn-quiet btn-sm" onClick={() => void download()} data-testid="export"><Icon name="download" size={15} />Export</button></Row>
        <Row label="Restore from backup" hint="Adds anything missing; never overwrites"><button className="btn btn-quiet btn-sm" onClick={() => file.current?.click()}><Icon name="upload" size={15} />Import</button></Row>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) say(await importJson(await f.text())); e.target.value = '' }} />
        <Row label="Erase data on this device"><button className="btn btn-ghost btn-sm text-clay" onClick={() => setConfirm('local')}><Icon name="trash" size={15} />Erase</button></Row>
        {user && <Row label="Erase everything, including cloud" hint="Cannot be undone"><button className="btn btn-ghost btn-sm text-clay" onClick={() => setConfirm('all')}>Erase all</button></Row>}
      </Section>

      <Section title="About">
        <Row label="Qur’an text & sources" hint="Verified against two independent sources"><button className="btn btn-quiet btn-sm" onClick={() => setAbout(true)}>Details</button></Row>
        <Row label="Audio sources & checks" hint="Credits, terms and a device check"><button className="btn btn-quiet btn-sm" onClick={() => setSources(true)} data-testid="open-audio-sources">Open</button></Row>
        <div className="p-4 text-xs text-muted">
          <p>Hifz OS is a study aid. It doesn’t check pronunciation or tajweed and doesn’t replace a teacher.</p>
        </div>
      </Section>
      <div className="h-6" />

      <Sheet open={about} onClose={() => setAbout(false)} title="Text provenance">
        <div className="space-y-3 text-sm text-ink-2">
          <p><b>Arabic:</b> Hafs Uthmani from the Noble Qur’an Encyclopedia (via <code>quran-json@3.1.2</code>, pinned and checksummed). Compared letter-for-letter with two independent sources (Tanzil v1.1 and Tarteel’s QUL): <b>{INTEGRITY.ayahs.toLocaleString()} of {INTEGRITY.ayahs.toLocaleString()}</b> agree.</p>
          <p><b>{INTEGRITY.errata.length} whitespace-only corrections</b> are applied where the primary source disagreed with both others on word spacing: {INTEGRITY.errata.map((e) => `${e.surah}:${e.ayah}`).join(', ')}. No letter, vowel or sign is ever altered. They are pending review by a qualified reader.</p>
          <p><b>Madinah Mushaf script:</b> the official text and font of the <a className="underline" href="https://fonts.qurancomplex.gov.sa/" target="_blank" rel="noopener noreferrer">King Fahd Glorious Quran Printing Complex</a> (KFGQPC Uthmanic Hafs v3.0), delivered unmodified under the font’s own licence (free to use and distribute; not to be sold or altered). The official text reaches the app through the CC BY 4.0 <i>quran-text</i> dataset from quran.ws. It is checked word for word against the stored text; the stored text itself is never altered.</p>
          <p><b>Translation:</b> Saheeh International (via Tanzil, personal use). <b>Simple script:</b> Amiri Quran and Amiri (SIL OFL). <b>Audio:</b> see Audio sources & checks.</p>
          <p className="break-all text-xs">Text checksum (sha256): {INTEGRITY.generatedTextSha256}</p>
        </div>
      </Sheet>
      <Sheet open={sources} onClose={() => setSources(false)} title="Audio sources & checks">
        <div className="space-y-4 text-sm text-ink-2">
          <ReciterCheck />
          <AudioCredits />
          <div data-testid="audio-terms">
            <div className="eyebrow mb-1.5">Saving recordings on your device</div>
            <ul className="space-y-1.5 text-xs">
              <li><b>Islamic Network:</b> {SOURCE_RIGHTS.islamicnetwork.basis} Saving is on. <a className="underline" href={SOURCE_RIGHTS.islamicnetwork.terms} target="_blank" rel="noopener noreferrer">Terms</a></li>
              <li><b>EveryAyah:</b> {SOURCE_RIGHTS.everyayah.basis} Saving is off; streaming only. <a className="underline" href={SOURCE_RIGHTS.everyayah.terms} target="_blank" rel="noopener noreferrer">Site</a></li>
              <li><b>MP3Quran:</b> whole-surah streaming only; nothing is saved.</li>
            </ul>
          </div>
        </div>
      </Sheet>
      <Sheet open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === 'all' ? 'Erase everything?' : 'Erase data on this device?'}>
        <p className="text-sm text-ink-2">{confirm === 'all' ? 'This deletes your history from this device and from your account. Export a backup first if you might want it back.' : 'This removes your history from this device. If you’re signed in, your cloud copy is kept and will download again on the next sync.'}</p>
        <div className="mt-4 grid grid-cols-2 gap-2"><button className="btn btn-quiet" onClick={() => setConfirm(null)}>Cancel</button><button className="btn btn-primary !bg-clay" onClick={async () => { if (confirm === 'all') { const e = await eraseRemoteAndLocal(); say(e ?? 'Everything erased') } else { await eraseLocal(); say('Erased from this device') } setConfirm(null) }} data-testid="confirm-erase">Erase</button></div>
      </Sheet>
    </div>
  )
}
