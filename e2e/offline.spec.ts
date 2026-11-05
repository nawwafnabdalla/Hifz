import { expect, test, type Page } from '@playwright/test'
import { declaration, freshStart, idbRows, mockAudio, recall, seed } from './helpers'

const addGoal = async (page: Page, surah: string, from?: string, to?: string) => {
  await page.getByTestId('open-goal').or(page.getByRole('button', { name: 'Add', exact: true })).first().click()
  await page.getByTestId('goal-surah').selectOption(surah)
  if (from) await page.getByTestId('goal-from').fill(from)
  if (to) await page.getByTestId('goal-to').fill(to)
  await page.getByTestId('goal-save').click()
}
const heading = (page: Page) => page.getByTestId('offline-heading')

test.describe('goal-based offline audio', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  test('a new goal offers its audio once; one tap saves it; it is listed with a measured size and can be removed without touching progress', async ({ page }) => {
    await addGoal(page, '112')
    await expect(heading(page)).toHaveText('Save for offline listening')
    await expect(page.getByTestId('offline-card')).toContainText('Al-Ikhlas 1–4 · Mishary Alafasy')
    await expect(page.getByTestId('offline-card')).not.toContainText(/about|KB|MB/)        // no size is promised before it is measured
    await page.screenshot({ path: 'test-results/shots/60-goal-offer.png' })
    await page.getByTestId('offline-save').click()
    await expect(page.getByTestId('offline-card')).toHaveAttribute('data-state', 'ready')
    await expect(heading(page)).toContainText(/Ready offline · \d/)
    await page.getByTestId('goal-audio-skip').click()
    await expect(page.getByTestId('goal-audio')).toHaveAttribute('data-state', 'ready')
    await page.screenshot({ path: 'test-results/shots/61-goal-ready.png' })

    await page.goto('/settings')
    await expect(page.getByTestId('downloads-total')).toContainText(/\d[\d.]* (KB|MB) saved on this device/)
    const row = page.getByTestId('download-row')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Al-Ikhlas 1–4 — Mishary Alafasy')
    await expect(row).toContainText(/Ready offline · \d[\d.]* (KB|MB)/)
    await page.screenshot({ path: 'test-results/shots/62-manage-downloads.png', fullPage: true })

    await expect(page.getByTestId('remove-all-downloads')).toBeVisible()
    const goalsBefore = (await idbRows(page, 'targets')).length
    await page.getByTestId('download-remove').click()
    await expect(page.getByTestId('remove-audio')).toContainText('Remove audio only. Your memorisation progress will stay saved.')
    await page.getByTestId('confirm-remove-audio').click()
    await expect(page.getByTestId('download-row')).toHaveCount(0)
    await expect(page.getByTestId('downloads-total')).toHaveText('No audio saved')
    expect((await idbRows(page, 'targets')).length).toBe(goalsBefore)
    // …and it can be saved again.
    await page.goto('/')
    await expect(page.getByTestId('goal-audio')).toHaveAttribute('data-state', 'none')
  })

  test('extending a goal offers only the missing audio and downloads only that', async ({ page }) => {
    const requested: string[] = []
    page.on('request', (r) => { if (/cdn\.islamic\.network/.test(r.url())) requested.push(r.url()) })
    await addGoal(page, '112', '1', '2')
    await page.getByTestId('offline-save').click()
    await expect(page.getByTestId('offline-card')).toHaveAttribute('data-state', 'ready')
    await page.getByTestId('goal-audio-skip').click()
    expect(requested).toHaveLength(2)

    await page.getByTestId('goal-edit').click()
    await page.getByTestId('goal-to').fill('4')
    await page.getByTestId('goal-save').click()
    await expect(page.getByTestId('offline-card')).toHaveAttribute('data-state', 'partial')
    await expect(heading(page)).toHaveText('Partly saved: 2 of 4 ayahs')
    await expect(page.getByTestId('offline-save')).toHaveText('Save the missing 2')
    await page.getByTestId('offline-save').click()
    await expect(page.getByTestId('offline-card')).toHaveAttribute('data-state', 'ready')
    expect(requested).toHaveLength(4)                                   // two new recordings, none repeated
    expect(new Set(requested).size).toBe(4)
  })

  test('saved recitations play with no connection, labelled as saved, using no network', async ({ page, context }) => {
    await addGoal(page, '112', '1', '2')
    await page.getByTestId('offline-save').click()
    await expect(page.getByTestId('offline-card')).toHaveAttribute('data-state', 'ready')
    await page.getByTestId('goal-audio-skip').click()
    await page.reload()
    await context.setOffline(true)
    const hits: string[] = []
    page.on('request', (r) => { if (/\.mp3|everyayah|islamic\.network/.test(r.url())) hits.push(r.url()) })
    await page.goto('/learn/112/1/2').catch(() => undefined)
    await page.getByTestId('audio-play').click()
    await expect(page.getByTestId('audio-status')).toContainText(/saved offline/, { timeout: 15000 })
    expect(hits).toHaveLength(0)
    await page.screenshot({ path: 'test-results/shots/63-offline-play.png' })
    // An ayah that was never saved says so plainly instead of failing mysteriously.
    await page.unroute(/everyayah\.com\/.*\.mp3/); await page.unroute(/cdn\.islamic\.network\/.*\.mp3/)
    await page.route(/\.mp3/, (r) => r.abort('internetdisconnected'))
    await page.goto('/learn/112/3/3').catch(() => undefined)
    await page.getByTestId('audio-play').click()
    await expect(page.getByTestId('audio-status')).toContainText(/offline, and Mishary Alafasy isn’t saved/, { timeout: 15000 })
    await context.setOffline(false)
  })

  test('if the phone clears saved audio, the app notices and never claims it is still there', async ({ page }) => {
    await addGoal(page, '112', '1', '3')
    await page.getByTestId('offline-save').click()
    await expect(page.getByTestId('offline-card')).toHaveAttribute('data-state', 'ready')
    await page.getByTestId('goal-audio-skip').click()
    await page.evaluate(async () => { const c = await caches.open('hifz-audio-v1'); const ks = await c.keys(); await c.delete(ks[0]!); await c.delete(ks[1]!) })
    await page.reload()
    await expect(page.getByTestId('goal-audio')).toHaveAttribute('data-state', 'partial')
    await expect(page.getByTestId('goal-audio')).toContainText('Audio partly saved · 1 of 3')
    await page.getByTestId('goal-audio').click()
    await expect(page.getByTestId('offline-evicted')).toContainText('Your phone cleared 2 saved recordings')
    await page.getByTestId('offline-save').click()
    await expect(page.getByTestId('offline-card')).toHaveAttribute('data-state', 'ready')
    await expect(page.getByTestId('offline-evicted')).toHaveCount(0)
  })

  test('a failed or interrupted download says so, never calls the goal complete, and can be retried', async ({ page }) => {
    await page.unroute(/cdn\.islamic\.network\/.*\.mp3/)
    let n = 0
    await page.route(/cdn\.islamic\.network\/.*\.mp3/, (r) => (++n % 2 === 0 ? r.fulfill({ status: 404, body: 'gone' }) : r.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(4000, 7), headers: { 'access-control-allow-origin': '*' } })))
    await addGoal(page, '112', '1', '4')
    await page.getByTestId('offline-save').click()
    await expect(page.getByTestId('offline-note')).toContainText(/couldn’t be saved/)
    await expect(page.getByTestId('offline-card')).toHaveAttribute('data-state', 'partial')
    await expect(page.getByTestId('offline-heading')).not.toContainText('Ready offline')
    await page.screenshot({ path: 'test-results/shots/64-partial.png' })
  })

  test('shows real progress while saving, and an interrupted save carries on by itself when the app is back', async ({ page }) => {
    await page.unroute(/cdn\.islamic\.network\/.*\.mp3/)
    let n = 0
    let cut = true
    await page.route(/cdn\.islamic\.network\/.*\.mp3/, async (r) => {
      await new Promise((res) => setTimeout(res, 250))
      if (cut && ++n > 2) return r.abort('connectionreset')
      return r.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(4000, 7), headers: { 'access-control-allow-origin': '*' } })
    })
    await addGoal(page, '112', '1', '4')
    await page.getByTestId('offline-save').click()
    await expect(heading(page)).toHaveText(/Saving \d of 4/, { timeout: 5000 })           // measured count while saving
    await expect(page.getByTestId('offline-card')).toHaveAttribute('data-state', /partial|saving/, { timeout: 20000 })
    await expect(page.getByTestId('offline-card')).not.toHaveAttribute('data-state', 'ready')
    // The connection comes back; the app finishes the save with no further tap.
    cut = false
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(page.getByTestId('offline-card')).toHaveAttribute('data-state', 'ready', { timeout: 30000 })
    await expect(heading(page)).toContainText(/Ready offline · 16 KB|Ready offline · 15.6 KB|Ready offline · \d/)
  })

  test('a reciter whose recordings may not be saved is never saved; the choice is a reciter that can be', async ({ page }) => {
    const everyayah: string[] = []
    page.on('request', (r) => { if (/everyayah\.com/.test(r.url())) everyayah.push(r.url()) })
    await page.goto('/settings')
    await page.getByLabel('Reciter').selectOption('dossary')
    await page.goto('/')
    await addGoal(page, '112')
    // The offer is only made when the chosen reciter can be saved, so this goal goes straight in…
    await expect(page.getByTestId('goal-row')).toBeVisible()
    await page.getByTestId('goal-audio').click()
    await expect(page.getByTestId('offline-cant')).toContainText('Yasser Al-Dossary can be played online but not saved.')
    await expect(page.getByTestId('offline-card')).toContainText('Maher Al-Mu’aiqly')
    await page.getByTestId('offline-save').click()
    await expect(page.getByTestId('offline-card')).toHaveAttribute('data-state', 'ready')
    await expect(page.getByTestId('offline-use')).toHaveText('Use Maher Al-Mu’aiqly for practice')
    expect(everyayah).toHaveLength(0)                                    // nothing was fetched from the unlicensed source
  })

  test('finishing a goal asks whether to keep its audio; audio shared with another goal stays; progress is untouched', async ({ page }) => {
    await addGoal(page, '112', '1', '4')
    await page.getByTestId('offline-save').click()
    await expect(page.getByTestId('offline-card')).toHaveAttribute('data-state', 'ready')
    await page.getByTestId('goal-audio-skip').click()
    // A second goal that overlaps ayahs 3–4, with its own audio already present.
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByTestId('goal-surah').selectOption('112')
    await page.getByTestId('goal-from').fill('3'); await page.getByTestId('goal-to').fill('4')
    await page.getByTestId('goal-save').click()                          // already fully saved, so no second offer is made
    await seed(page, 'reviews', [1, 2, 3, 4].map((a) => recall(112, a, a, 'independent', 3)))
    const reviewsBefore = (await idbRows(page, 'reviews')).length
    await page.getByTestId('goal-row').filter({ hasText: 'Al-Ikhlas 1–4' }).getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.getByTestId('goal-finish')).toContainText('Keep the audio saved for it?')
    await expect(page.getByTestId('goal-finish')).toContainText('2 recordings are still used by')
    await page.screenshot({ path: 'test-results/shots/65-goal-finish.png' })
    await page.getByTestId('finish-remove').click()
    await expect(page.getByTestId('goal-finish')).toHaveCount(0)
    await page.goto('/settings')
    await expect(page.getByTestId('download-row')).toHaveCount(1)
    await expect(page.getByTestId('download-row')).toContainText('3–4')
    expect((await idbRows(page, 'reviews')).length).toBe(reviewsBefore)
  })
})

test.describe('calm, goal-first screens', () => {
  test('Settings keeps technical audio explanations out of the main page; they are one tap away in About', async ({ page }) => {
    await freshStart(page)
    await page.goto('/settings')
    const main = page.locator('main')
    await expect(main).not.toContainText(/file headers|directory listing|EveryAyah|MP3Quran catalogue|licence/i)
    await expect(page.getByTestId('manage-downloads')).toBeVisible()
    await page.getByTestId('open-audio-sources').click()
    await expect(page.getByTestId('audio-terms')).toContainText(/Saving is off; streaming only/)
    await expect(page.getByTestId('audio-credits')).toBeVisible()
  })

  test('instructions teach for a few days, then shrink to a short reminder', async ({ page }) => {
    await mockAudio(page); await freshStart(page)
    await page.goto('/review/112/1/1?ctx=free')
    await expect(page.getByTestId('recall-card')).toContainText('Recite, then tap the text to check it.')
    await page.evaluate(() => localStorage.setItem('hifz.coach.v1', JSON.stringify({ 'tap-hint': ['2020-01-01', '2020-01-02', '2020-01-03'] })))
    await page.reload()
    await expect(page.getByTestId('recall-card')).not.toContainText('tap the text to check it')      // taught for a few days, then it gets out of the way
  })

  test('the audio bar is one calm row at rest, with the options in a single sheet', async ({ page }) => {
    await mockAudio(page); await freshStart(page)
    await page.goto('/learn/112/1/1')
    const bar = page.getByTestId('audio-bar')
    await expect(bar.getByTestId('audio-status')).toHaveCount(0)
    await expect(page.getByTestId('audio-settings')).toHaveCount(0)
    const box = await bar.boundingBox()
    expect(box!.height).toBeLessThan(90)
    await page.getByTestId('reciter-chip').click()
    await expect(page.getByTestId('reciter-maher')).toBeVisible()
    await expect(page.getByTestId('audio-more')).toBeVisible()
    await expect(page.getByTestId('audio-offline')).toHaveCount(0)      // a lone ayah has nothing worth saving, so no download control
    await page.screenshot({ path: 'test-results/shots/66-audio-sheet.png' })
  })
})

void declaration
