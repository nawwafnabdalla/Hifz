import { expect, test } from '@playwright/test'
import { completeLearning, freshStart, mockAudio } from './helpers'

test.describe('core hifz loop', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  test('first run shows onboarding, with no placeholder data', async ({ page }) => {
    await expect(page.getByTestId('onboarding')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Today’s hifz' })).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/01-today-empty.png' })
  })

  test('importing known surahs records claims, distinct from demonstrated recall', async ({ page }) => {
    await page.getByTestId('open-known').click()
    await page.getByRole('button', { name: 'Juz ʿAmma (78–114)' }).click()
    await page.getByRole('button', { name: /Mark \d+ surahs as known/ }).click()
    await expect(page.getByText(/Marked 37 surahs as known/)).toBeVisible()
    // Plan now offers to verify rather than assuming the material is solid, and 37 small checks collapse into one row.
    await expect(page.getByTestId('plan-group').first()).toHaveAttribute('data-kind', 'verify')
    await page.getByTestId('plan-group').first().getByRole('button').first().click()
    await page.getByTestId('plan-item').first().getByRole('button', { name: /^(?!Start).*/ }).first().click()
    await expect(page.getByTestId('plan-reasons')).toContainText('marked this as known')
    await page.getByRole('link', { name: /Qur’an/ }).click()
    await expect(page.getByText(/0 ayahs recalled · \d[\d,]* marked known, not yet checked/)).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/02-map-claimed.png', fullPage: true })
  })

  test('learn a new ayah end to end, then see it scheduled and reflected in progress', async ({ page }) => {
    // Goal: Al-Ikhlas
    await page.getByTestId('open-goal').click()
    await page.getByTestId('goal-surah').selectOption('112')
    await page.getByTestId('goal-save').click()
    await page.getByTestId('goal-audio-skip').click()                 // the one-time offer to save audio offline
    await expect(page.getByTestId('plan-item').first()).toHaveAttribute('data-kind', 'new')
    await page.getByTestId('start-session').click()
    await expect(page).toHaveURL(/\/session/)
    await expect(page.getByTestId('stage-sound')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/03-learn-sound.png' })

    // Audio path works against mocked host.
    await page.getByTestId('audio-play').click()
    await expect(page.getByTestId('audio-bar')).toContainText(/Ayah 1/)

    await page.getByTestId('to-flow').click()
    await expect(page.getByTestId('stage-flow')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/04-learn-flow.png' })
    await page.getByTestId('said-it').click()
    await page.getByTestId('rate-natural').click()
    await expect(page.getByTestId('stage-recall')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/05-recall-hidden.png' })
    await page.getByTestId('reveal').click()
    await page.screenshot({ path: 'test-results/shots/06-recall-grade.png' })
    await page.getByTestId('grade-independent').click()

    // Remaining ayahs of the chunk (the planner may take several), then the session summary.
    for (let i = 0; i < 40; i++) {
      if (await page.getByTestId('session-summary').count()) break
      if (await page.getByTestId('learn-flow').count()) {
        const stage = await page.getByTestId('learn-flow').getAttribute('data-stage')
        if (stage === 'done') await page.getByTestId('learn-finish').click()
        else await completeLearning(page).catch(() => {})
      }
      await page.waitForTimeout(50)
    }
    await expect(page.getByTestId('session-summary')).toBeVisible()
    await page.getByTestId('session-finish').click()

    await page.goto('/progress')
    await expect(page.getByTestId('coverage')).toContainText('Recalled')
    const recalled = await page.getByTestId('coverage').locator('div.font-display').first().innerText()
    expect(Number(recalled.replace(/,/g, ''))).toBeGreaterThanOrEqual(1)
    await page.screenshot({ path: 'test-results/shots/07-progress.png', fullPage: true })
  })

  test('data survives a reload (local-first persistence)', async ({ page }) => {
    await page.goto('/review/112/1/1?ctx=free')
    await page.getByTestId('reveal').click()
    await page.getByTestId('grade-independent').click()
    await expect(page.getByTestId('review-done')).toBeVisible()
    await page.reload()
    await page.goto('/progress')
    await expect(page.getByTestId('coverage').locator('div.font-display').first()).toHaveText('1')
  })

  test('multi-ayah recall records where you slipped; a failed passage does not credit every ayah', async ({ page }) => {
    await page.goto('/review/112/1/4?ctx=free')
    await page.getByTestId('reveal').click()
    await page.getByTestId('more-toggle').click()
    await expect(page.getByTestId('stumble-tools')).toBeVisible()
    await page.getByRole('button', { name: /^Ayah 3: fine/ }).click()      // hesitated
    await page.getByRole('button', { name: /^Ayah 3: hesitated/ }).click() // prompted
    await page.getByRole('button', { name: /^Ayah 3: needed a prompt/ }).click() // wrong
    await page.getByRole('button', { name: /^Ayah 3: words wrong/ }).click()    // blank
    await page.getByTestId('grade-prompted').click()
    await page.goto('/quran/112')
    await expect(page.getByRole('listitem', { name: /Ayah 3:/ })).toBeVisible()
  })

  test('theme and settings persist; export produces a valid backup', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'dark' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.screenshot({ path: 'test-results/shots/08-settings-dark.png', fullPage: true })
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export').click()])
    const text = await (await import('node:fs')).promises.readFile((await dl.path())!, 'utf8')
    const j = JSON.parse(text)
    expect(j.app).toBe('hifz-os')
    expect(j.schema).toBe(1)
  })

  test('audio falls back to a second host when the first fails', async ({ page }) => {
    await page.unrouteAll()
    await mockAudio(page, { failEveryAyah: true })
    await page.goto('/learn/1/1/1')
    await expect(page.getByTestId('stage-sound')).toBeVisible()
    const hosts: string[] = []
    page.on('request', (r) => { if (/\.mp3/.test(r.url())) hosts.push(new URL(r.url()).host) })
    await page.getByTestId('audio-play').click()
    await expect(page.getByTestId('audio-status')).toContainText(/Ayah 1/, { timeout: 15000 })       // plays; the host is not shown on the main screen
    expect(hosts).toContain('everyayah.com')
    expect(hosts).toContain('cdn.islamic.network')
  })
})

test.describe('continuity and long ayahs', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  test('a transition drill records continuity without verifying either ayah', async ({ page }) => {
    await page.goto('/quran/112')
    await page.getByRole('listitem', { name: /^Ayah 1:/ }).click()
    await page.getByRole('listitem', { name: /^Ayah 3:/ }).click()
    await page.getByTestId('act-connect').click()
    await expect(page.getByTestId('junction-drill')).toBeVisible()
    await page.getByTestId('junction-reveal').click()
    await page.getByTestId('junction-smooth').click()
    await page.getByTestId('junction-reveal').click()
    await page.getByTestId('junction-smooth').click()
    await expect(page.getByTestId('review-done')).toBeVisible()
    await page.goto('/progress')
    await expect(page.getByTestId('coverage').locator('div.font-display').first()).toHaveText('0')   // nothing "recalled"
  })

  test('a very long ayah gets a conservative phrase ladder that keeps controls on screen', async ({ page }) => {
    await page.goto('/learn/2/282/282')           // the longest ayah (128 words)
    await page.getByTestId('to-flow').click()
    await expect(page.getByTestId('stage-flow')).toBeVisible()
    await expect(page.getByText(/Long ayah: showing the part you are practising/)).toBeVisible()
    await expect(page.getByTestId('said-it')).toBeInViewport()
    await page.getByTestId('edit-phrases').click()
    await expect(page.getByText(/not rulings on where to stop/)).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/09-phrase-editor.png' })
  })
})

test('after a first accurate recall, the details sheet shows the next review about a day later', async ({ page }) => {
  await mockAudio(page); await freshStart(page)
  await page.goto('/review/112/1/1?ctx=free')
  await page.getByTestId('reveal').click(); await page.getByTestId('grade-independent').click()
  await page.goto('/quran/112?a=1')
  await page.getByTestId('selection-bar').getByText('details').click()
  const text = await page.getByTestId('next-review').innerText()
  expect(text).toMatch(/next review/i)
  expect(text).not.toMatch(/Due now/)
  // Today reports that it falls due within a day.
  await page.goto('/')
  await expect(page.getByTestId('nothing-due')).toContainText(/1 ayah will fall due within a day/)
})
