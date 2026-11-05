// Ayah-by-ayah revision: check one ayah at a time without revealing the rest, hide it again, flag the exact word that was wrong and say what happened,
// and keep recall (the attempt) separate from verification (the check). The app records what the learner reports; it never certifies a recitation.
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { freshStart, idbRows, mockAudio, seed, recall } from './helpers'

const QURAN = JSON.parse(readFileSync(new URL('../src/data/generated/quran.json', import.meta.url), 'utf8')) as { text: string[][] }
const words = (s: number, a: number) => QURAN.text[s - 1]![a - 1]!.split(' ').filter(Boolean)
const row = (page: Page, a: number) => page.getByTestId(`ayah-row-${a}`)
const shownRows = (page: Page) => page.locator('[data-testid^="ayah-row-"][data-shown="true"]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-testid')!.replace('ayah-row-', ''))))
const visibleWords = (page: Page, a: number) => row(page, a).locator('[data-w],[data-word]').count()
const open = (page: Page, path = '/review/20/7/9?ctx=sabqi') => page.goto(path).then(() => expect(page.getByTestId('recall-card')).toBeVisible())

test.describe('ayah-by-ayah revision', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  test('Ta-Ha 7–9: ayah 6 is the run-up, 7–9 start hidden, and each has its own Check button', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('lead-in')).toHaveAttribute('data-lead-ayah', '6')
    for (const a of [7, 8, 9]) { expect(await visibleWords(page, a)).toBe(0); await expect(page.getByTestId(`check-${a}`)).toBeVisible() }
    expect(await shownRows(page)).toEqual([])
    await expect(page.getByTestId('grades')).toHaveCount(0)                                 // nothing to grade until something is checked
  })

  test('checking ayah 7 reveals exactly ayah 7; ayahs 8 and 9 stay hidden; the lead-in stays', async ({ page }) => {
    await open(page)
    await page.getByTestId('check-7').click()
    expect(await shownRows(page)).toEqual([7])
    expect(await visibleWords(page, 7)).toBe(words(20, 7).length)
    expect(await visibleWords(page, 8)).toBe(0)
    expect(await visibleWords(page, 9)).toBe(0)
    await expect(page.getByTestId('lead-in')).toBeVisible()
    await expect(page.getByTestId('check-8')).toBeVisible()
    await expect(page.getByTestId('check-9')).toBeVisible()
  })

  test('one ayah after another: 7, then 8, then 9, never revealing more than was asked for, and a revealed ayah can be hidden again and shown again', async ({ page }) => {
    await open(page)
    await page.getByTestId('check-7').click()
    await page.getByTestId('check-8').click()
    expect(await shownRows(page)).toEqual([7, 8])
    expect(await visibleWords(page, 9)).toBe(0)
    await page.getByTestId('hide-7').click()
    expect(await shownRows(page)).toEqual([8])
    expect(await visibleWords(page, 7)).toBe(0)
    await expect(page.getByTestId('check-7')).toBeVisible()
    await page.getByTestId('check-7').click()
    await page.getByTestId('check-9').click()
    expect(await shownRows(page)).toEqual([7, 8, 9])
    await page.getByTestId('hide-8').click()
    expect(await shownRows(page)).toEqual([7, 9])
  })

  test('verse numbers and Arabic text are exactly the stored ayahs (simple script, so the words are comparable)', async ({ page }) => {
    await page.goto('/settings'); await page.getByTestId('script-simple').click()
    await open(page)
    await page.getByTestId('reveal').click()
    for (const a of [7, 8, 9]) {
      const text = (await row(page, a).locator('[data-word]').allInnerTexts()).join(' ')
      expect(text).toBe(words(20, a).join(' '))
      await expect(row(page, a).getByLabel(`ayah ${a}`, { exact: true }).first()).toBeVisible()                       // the medallion carries the right number
    }
    expect(await page.getByTestId('lead-in-text').locator('[data-w]').allInnerTexts()).toEqual(words(20, 6))
  })

  test('"Show all ayahs" is still one tap, and then the record is exactly what it always was (no extra fields for an all-checked attempt)', async ({ page }) => {
    await open(page)
    await page.getByTestId('reveal').click()
    expect(await shownRows(page)).toEqual([7, 8, 9])
    await page.getByTestId('grade-independent').click()
    const r = (await idbRows(page, 'reviews'))[0]
    expect(r).toMatchObject({ kind: 'recall', range: { surah: 20, start: 7, end: 9 }, grade: 'independent', cueLevel: 4, context: 'sabqi' })
    expect(r.checked).toBeUndefined(); expect(r.wordIssues).toBeUndefined(); expect(r.completedTo).toBeUndefined(); expect(r.stumbles).toEqual([])
  })

  test('recite 7–9 in one go, then check 7 then 8 then 9 one at a time: still ONE recall of 7–9, blind (cue 4), not a hint', async ({ page }) => {
    await open(page)
    for (const a of [7, 8, 9]) await page.getByTestId(`check-${a}`).click()
    await expect(page.getByTestId('unchecked-note')).toHaveCount(0)
    await page.getByTestId('grade-independent').click()
    const rs = await idbRows(page, 'reviews')
    expect(rs).toHaveLength(1)
    expect(rs[0]).toMatchObject({ range: { surah: 20, start: 7, end: 9 }, grade: 'independent', cueLevel: 4 })
  })

  test('checking only ayah 7 counts only ayah 7: the others are not credited because they were never compared with the text', async ({ page }) => {
    await open(page)
    await page.getByTestId('check-7').click()
    await expect(page.getByTestId('unchecked-note')).toContainText('Ayahs 8, 9 aren’t counted as recalled')
    await page.getByTestId('grade-independent').click()
    const rs = await idbRows(page, 'reviews')
    expect(rs).toHaveLength(1)
    expect(rs[0].range).toEqual({ surah: 20, start: 7, end: 7 })
  })

  test('checking 7 and 9 but not 8 records the gap exactly, and stops completedTo before it', async ({ page }) => {
    await open(page)
    await page.getByTestId('check-7').click(); await page.getByTestId('check-9').click()
    await page.getByTestId('grade-hesitant').click()
    const r = (await idbRows(page, 'reviews'))[0]
    expect(r).toMatchObject({ range: { surah: 20, start: 7, end: 9 }, checked: [7, 9], completedTo: 7, grade: 'hesitant' })
  })

  test('"I read it before reciting" is assisted, not recall: that ayah carries no recall evidence, and the others are unaffected', async ({ page }) => {
    await open(page)
    await page.getByTestId('reveal').click()
    await page.getByTestId('read-first-8').click()
    await expect(page.getByTestId('read-first-note-8')).toContainText('Not counted as recall')
    await expect(page.getByTestId('unchecked-note')).toContainText('Ayah 8 isn’t counted')
    await page.getByTestId('grade-independent').click()
    const r = (await idbRows(page, 'reviews'))[0]
    expect(r).toMatchObject({ checked: [7, 9], completedTo: 7 })
  })

  test('revealing after reciting is NOT a hint; the first-word hint (before the attempt) is, and is still the first word of each of 7, 8, 9', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: /Need a hint\? Show the first words/ }).click()
    for (const a of [7, 8, 9]) expect(await row(page, a).locator('[data-w]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-w'))))).toEqual([0])
    await page.getByTestId('check-8').click()
    expect(await visibleWords(page, 8)).toBe(words(20, 8).length)                          // the checked ayah is shown in full
    expect(await row(page, 7).locator('[data-w]').count()).toBe(1)                         // the others still show only their first word
    expect(await row(page, 9).locator('[data-w]').count()).toBe(1)
    await page.getByTestId('grade-hesitant').click()
    expect((await idbRows(page, 'reviews'))[0]).toMatchObject({ cueLevel: 3 })              // assisted recall: weaker evidence, as before
  })

  test('single ayah: the hint pipeline is unchanged (first word, then three more) and a hinted recall still cannot be "on my own"', async ({ page }) => {
    await open(page, '/review/20/7/7?ctx=free')
    await page.getByTestId('hint').click()
    expect(await row(page, 7).locator('[data-w]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-w'))))).toEqual([0])
    await page.getByTestId('reveal').click()
    await expect(page.getByTestId('grade-independent')).toBeDisabled()
    await page.getByTestId('hide-7').click()                                              // a single ayah can be hidden again too
    expect(await shownRows(page)).toEqual([])
    await expect(page.getByTestId('check-7')).toContainText('Show text again')
    await page.getByTestId('check-7').click()
    await page.getByTestId('grade-hesitant').click()
    expect((await idbRows(page, 'reviews'))[0]).toMatchObject({ range: { surah: 20, start: 7, end: 7 }, cueLevel: 3 })
  })
})

test.describe('finding what went wrong', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  test('tap the word, say what happened: a forgotten word is recorded as needing a prompt, and the exact spot is practised', async ({ page }) => {
    await open(page)
    await page.getByTestId('reveal').click()
    await row(page, 8).locator('[data-word="2"]').click()
    await expect(page.getByTestId('issue-picker')).toContainText('Word 3')
    await page.getByTestId('issue-forgot').click()
    await expect(page.getByTestId('issue-forgot')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('grade-independent').click()                                    // the other ayahs were fine; the flag localises the problem
    const r = (await idbRows(page, 'reviews'))[0]
    expect(r.wordIssues).toEqual([{ ayah: 8, word: 2, kind: 'forgot' }])
    expect(r.stumbles).toEqual([{ ayah: 8, kind: 'prompted' }])
    await expect(page.getByTestId('repair-panel')).toHaveAttribute('data-repair-ayah', '8')
    const flows = await idbRows(page, 'flows')
    expect(flows.some((f) => f.ayah === 8 && f.rating === 'tangled')).toBe(true)           // scheduled for repair
    await page.getByTestId('repair-skip').click()
    await expect(page.getByTestId('review-done')).toBeVisible()
  })

  test('a wrong word or vowel is a failed recall of that ayah only', async ({ page }) => {
    await open(page)
    await page.getByTestId('reveal').click()
    await row(page, 9).locator('[data-word="0"]').click(); await page.getByTestId('issue-wrong').click()
    await page.getByTestId('grade-independent').click()
    const r = (await idbRows(page, 'reviews'))[0]
    expect(r.stumbles).toEqual([{ ayah: 9, kind: 'wrong' }]); expect(r.wordIssues[0].kind).toBe('wrong')
    await page.getByTestId('repair-skip').click()
  })

  test('pronunciation / tajweed is recorded and practised, but is NOT counted as forgetting; the app says it cannot judge it', async ({ page }) => {
    await open(page)
    await page.getByTestId('reveal').click()
    await row(page, 8).locator('[data-word="1"]').click(); await page.getByTestId('issue-pronunciation').click()
    await expect(page.getByTestId('issue-picker')).toContainText('The app can’t hear this')
    await page.getByTestId('grade-independent').click()
    const r = (await idbRows(page, 'reviews'))[0]
    expect(r.stumbles).toEqual([]); expect(r.grade).toBe('independent')
    expect(r.wordIssues).toEqual([{ ayah: 8, word: 1, kind: 'pronunciation' }])
    await expect(page.getByTestId('repair-pronunciation')).toContainText('can’t hear pronunciation or tajweed')
    await expect(page.getByTestId('audio-bar')).toBeVisible()                              // the reference recording is right there
    expect((await idbRows(page, 'flows')).some((f) => f.ayah === 8 && f.rating === 'tangled')).toBe(true)
    await page.getByTestId('repair-skip').click()
  })

  test('single ayah: a forgotten or wrong word contradicts "on my own" and "accurate but unsure"; a bare mark or a pronunciation concern does not', async ({ page }) => {
    await open(page, '/review/20/8/8?ctx=free')
    await page.getByTestId('reveal').click()
    await page.locator('[data-word="1"]').click()
    await expect(page.getByTestId('grade-independent')).toBeEnabled()                       // marked but not yet said what happened
    await page.getByTestId('issue-forgot').click()
    await expect(page.getByTestId('grade-independent')).toBeDisabled()
    await expect(page.getByTestId('grade-hesitant')).toBeDisabled()
    await expect(page.getByTestId('grade-prompted')).toBeEnabled()
    await page.getByTestId('issue-pronunciation').click()
    await expect(page.getByTestId('grade-independent')).toBeEnabled()
    await page.getByTestId('issue-wrong').click()
    await page.getByTestId('grade-prompted').click()
    const r = (await idbRows(page, 'reviews'))[0]
    expect(r).toMatchObject({ grade: 'prompted', range: { surah: 20, start: 8, end: 8 }, stumbles: [{ ayah: 8, kind: 'wrong' }] })
    await expect(page.getByTestId('repair-panel')).toBeVisible()
  })

  test('"Not a problem" clears a mark; several ayahs flagged are repaired one after another, then it finishes', async ({ page }) => {
    await open(page)
    await page.getByTestId('reveal').click()
    await row(page, 7).locator('[data-word="0"]').click(); await page.getByTestId('issue-clear').click()
    await expect(row(page, 7).locator('[data-word="0"]')).toHaveAttribute('aria-pressed', 'false')
    await row(page, 8).locator('[data-word="1"]').click(); await page.getByTestId('issue-forgot').click()
    await row(page, 9).locator('[data-word="1"]').click(); await page.getByTestId('issue-wrong').click()
    await page.getByTestId('grade-prompted').click()
    const r = (await idbRows(page, 'reviews'))[0]
    expect(r.wordIssues.map((i: { ayah: number }) => i.ayah)).toEqual([8, 9])
    await expect(page.getByTestId('repair-panel')).toHaveAttribute('data-repair-ayah', '8')
    await expect(page.getByTestId('repair-panel')).toContainText('1 of 2')
    // Practise the first spot to "natural", which moves on to the second.
    await page.getByTestId('repair-skip').click()                                          // "Done for now" ends the repairs; both spots were already scheduled
    await expect(page.getByTestId('review-done')).toBeVisible()
    expect((await idbRows(page, 'flows')).filter((f) => f.rating === 'tangled').map((f) => f.ayah).sort()).toEqual([8, 9])
  })

  test('the flagged ayah is scheduled sooner: it shows as needing repair, the unflagged ones do not', async ({ page }) => {
    await open(page)
    await seed(page, 'reviews', [recall(20, 7, 9, 'independent', 80)])                       // known and stable before today's check
    await page.goto('/review/20/7/9?ctx=sabqi')
    await page.getByTestId('reveal').click()
    await row(page, 8).locator('[data-word="1"]').click(); await page.getByTestId('issue-wrong').click()
    await page.getByTestId('grade-independent').click(); await page.getByTestId('repair-skip').click()
    await page.goto('/quran/20')
    await page.getByRole('button', { name: /Ayah-by-ayah map/ }).click()                    // the map is collapsed by default
    await expect(page.getByRole('listitem', { name: /Ayah 8: needs repair/ })).toBeVisible()
    await expect(page.getByRole('listitem', { name: /Ayah 7: needs repair/ })).toHaveCount(0)
  })

  test('history and progress persist across a reload, and earlier records are untouched', async ({ page }) => {
    await seed(page, 'reviews', [recall(112, 1, 4, 'independent', 30)])
    await open(page)
    await page.getByTestId('check-7').click(); await page.getByTestId('check-8').click()
    await page.getByTestId('grade-hesitant').click()
    await page.reload()
    const rs = await idbRows(page, 'reviews')
    expect(rs).toHaveLength(2)
    expect(rs.find((r) => r.range.surah === 112)).toMatchObject({ grade: 'independent', range: { start: 1, end: 4 } })
    expect(rs.find((r) => r.range.surah === 20)).toMatchObject({ range: { start: 7, end: 8 }, grade: 'hesitant' })
  })
})

test.describe('reference recording and your own recording', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  test('a revealed ayah can play its own reference recording (that exact ayah only), and the control is labelled', async ({ page }) => {
    const urls: string[] = []
    page.on('request', (r) => { if (/\.mp3/.test(r.url())) urls.push(r.url()) })
    await open(page)
    await page.getByTestId('check-8').click()
    await expect(page.getByTestId('hear-8')).toHaveAccessibleName(/reference recording of ayah 8/)
    await page.getByTestId('hear-8').click()
    await expect(page.getByTestId('audio-bar')).toBeVisible()
    await page.getByTestId('audio-play').click()
    await expect.poll(() => urls.length).toBeGreaterThan(0)
    // Either source names the ayah: EveryAyah as SSSAAA (020008), the Islamic Network CDN by its global ayah number (Ta-Ha 8 is 2,502 + 8 ... resolved by the app's own table).
    expect(urls.every((u) => /020008\.mp3/.test(u) || /\/(\d+)\.mp3/.test(u))).toBe(true)
    expect(urls.some((u) => /020008\.mp3/.test(u))).toBe(true)
  })

  test.describe('with a microphone', () => {
    test.use({ permissions: ['microphone'] })      // the fake microphone itself comes from the browser flags in playwright.config.ts
    test('record, listen back, discard: nothing is stored anywhere, and the recall record is unaffected', async ({ page }) => {
      await open(page)
      await expect(page.getByTestId('self-recorder')).toContainText('Stays on this device')
      await page.getByTestId('record-start').click()
      await expect(page.getByTestId('record-stop')).toBeVisible()
      await page.waitForTimeout(700)
      await page.getByTestId('record-stop').click()
      await expect(page.getByTestId('record-playback')).toBeVisible()
      await page.getByTestId('reveal').click()
      await expect(page.getByTestId('record-playback')).toBeVisible()                        // still there while checking
      await page.getByTestId('grade-independent').click()
      const stored = JSON.stringify(await idbRows(page, 'reviews')) + JSON.stringify(await page.evaluate(() => ({ ...localStorage })))
      expect(stored).not.toMatch(/blob:|data:audio|audio\/(webm|mp4)/)
      expect(await idbRows(page, 'reviews')).toHaveLength(1)
    })
    test('discard throws the recording away', async ({ page }) => {
      await open(page)
      await page.getByTestId('record-start').click(); await page.waitForTimeout(400); await page.getByTestId('record-stop').click()
      await page.getByTestId('record-discard').click()
      await expect(page.getByTestId('record-playback')).toHaveCount(0)
      await expect(page.getByTestId('record-start')).toBeVisible()
    })
  })

  test('a refused microphone is explained and nothing breaks', async ({ page }) => {
    await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('no', 'NotAllowedError')) })
    await open(page)
    await page.getByTestId('record-start').click()
    await expect(page.getByTestId('record-denied')).toContainText('Nothing was recorded')
    await page.getByTestId('reveal').click(); await page.getByTestId('grade-independent').click()
    expect(await idbRows(page, 'reviews')).toHaveLength(1)
  })
})

test.describe('phone layout and accessibility', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  for (const width of [390, 320]) {
    test(`${width}px wide: nothing overflows sideways, and the buttons are comfortable to tap`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await open(page, '/review/20/7/9?ctx=sabqi')
      await page.getByTestId('check-7').click(); await row(page, 8).scrollIntoViewIfNeeded()
      await row(page, 7).locator('[data-word="1"]').click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      for (const id of ['check-8', 'hide-7', 'hear-7', 'read-first-7', 'issue-forgot', 'issue-pronunciation']) {
        const box = await page.getByTestId(id).boundingBox()
        expect(box!.height, id).toBeGreaterThanOrEqual(40)
        expect(box!.x + box!.width, id).toBeLessThanOrEqual(width)
      }
      await page.screenshot({ path: `test-results/shots/60-revision-${width}.png`, fullPage: true })
    })
  }

  test('controls have meaningful names and states, and the word tap works from the keyboard', async ({ page }) => {
    await open(page)
    await expect(page.getByRole('button', { name: 'Check ayah 8' })).toBeVisible()
    await page.getByRole('button', { name: 'Check ayah 8' }).click()
    await expect(page.getByRole('group', { name: 'Ayah 8' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Hide ayah 8 again' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'I read it before reciting' })).toHaveAttribute('aria-pressed', 'false')
    const w = row(page, 8).locator('[data-word="0"]')
    await w.focus(); await page.keyboard.press('Enter')
    await expect(w).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('group', { name: /What went wrong with word 1 of ayah 8/ })).toBeVisible()
  })

  test('dark mode: the new controls are drawn and legible (no overflow, picker visible)', async ({ page }) => {
    await page.goto('/settings'); await page.getByRole('button', { name: 'dark' }).click()
    await open(page)
    await page.getByTestId('check-7').click(); await row(page, 7).locator('[data-word="0"]').click()
    await expect(page.getByTestId('issue-picker')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: 'test-results/shots/61-revision-dark.png', fullPage: true })
  })
})
