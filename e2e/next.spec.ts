import { expect, test } from '@playwright/test'
import { completeLearning, declaration, freshStart, idbRows, mockAudio, recall, seed } from './helpers'

test.describe('recall: hints, meaning, slip-to-repair', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  test('a hint reveals only the next word from the canonical text, caps the grade, and lowers recorded evidence', async ({ page }) => {
    await page.goto('/review/112/1/1?ctx=free')
    await expect(page.locator('.arabic .w')).toHaveCount(0)               // fully hidden
    await page.getByTestId('hint').click()
    await expect(page.locator('.arabic .w')).toHaveCount(1)               // first word only
    await page.screenshot({ path: 'test-results/shots/20-hint.png' })
    await page.getByTestId('reveal').click()
    await expect(page.getByTestId('grade-independent')).toBeDisabled()    // a hinted recall can't claim "on my own"
    await expect(page.getByTestId('grade-hesitant')).toBeEnabled()
    await page.getByTestId('grade-hesitant').click()
    await expect(page.getByTestId('review-done')).toBeVisible()
    const [e] = await idbRows(page, 'reviews')
    expect(e.grade).toBe('hesitant')
    expect(e.cueLevel).toBeLessThan(4)                                     // weaker evidence than a fully hidden recall
  })

  test('the meaning cue is a labelled hint: translation shows, "on my own" is blocked, evidence is lowered', async ({ page }) => {
    await page.goto('/review/112/1/1?ctx=free')
    await page.getByTestId('meaning').click()
    await expect(page.getByTestId('meaning-line')).not.toHaveText('…')
    await expect(page.getByTestId('meaning-line')).toContainText(/Allah/)
    await page.getByTestId('reveal').click()
    await expect(page.getByTestId('grade-independent')).toBeDisabled()
    await page.getByTestId('grade-hesitant').click()
    const [e] = await idbRows(page, 'reviews')
    expect(e.cueLevel).toBe(3)
  })

  test('without hints, "on my own" is available and records full-strength evidence', async ({ page }) => {
    await page.goto('/review/112/1/1?ctx=free')
    await page.getByTestId('reveal').click()
    await expect(page.getByTestId('grade-independent')).toBeEnabled()
    await page.getByTestId('grade-independent').click()
    const [e] = await idbRows(page, 'reviews')
    expect(e.cueLevel).toBe(4)
  })

  test('tapping the word you slipped on opens an in-place repair of that exact joint, and logs it', async ({ page }) => {
    await page.goto('/review/2/255/255?ctx=free')
    await page.getByTestId('reveal').click()
    await page.locator('[data-word="12"]').click()
    await expect(page.locator('[data-word="12"]')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('grade-hesitant').click()
    await expect(page.getByTestId('repair-panel')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/21-repair.png' })
    await page.getByTestId('said-it').click()
    await page.getByTestId('rate-natural').click()
    await expect(page.getByTestId('review-done')).toBeVisible()
    const flows = await idbRows(page, 'flows')
    const ratings = flows.map((f) => f.rating)
    expect(ratings).toEqual(expect.arrayContaining(['tangled', 'natural']))
    const slip = flows.find((f) => f.rating === 'tangled')
    expect(slip.reps).toBe(0)                                               // marked, not practised
    const [e] = await idbRows(page, 'reviews')
    expect(e.grade).toBe('hesitant')                                        // the recall itself was recorded before repair began
  })

  test('the next visit to a repaired ayah starts with the tricky joint, not the whole chain', async ({ page }) => {
    await page.goto('/review/2/255/255?ctx=free')
    await page.getByTestId('reveal').click()
    await page.locator('[data-word="12"]').click()
    await page.getByTestId('grade-hesitant').click()
    await page.getByTestId('repair-skip').click()                          // left it tangled
    await page.goto('/learn/2/255/255')
    await page.getByTestId('to-flow').click()
    await expect(page.getByTestId('stage-flow')).toContainText(/tricky spot/)
    await expect(page.getByTestId('stage-flow')).toContainText(/Repair:/)
  })
})

test.describe('audio: your three reciters, echo, honesty', () => {
  test('all three reciters are offered with Arabic names, the choice persists, and the app never substitutes silently', async ({ page }) => {
    await mockAudio(page); await freshStart(page)
    const audioRequests: string[] = []
    page.on('request', (r) => { if (/\.mp3|\.wav/.test(r.url())) audioRequests.push(r.url()) })
    await page.goto('/learn/112/1/1')
    await page.getByTestId('reciter-chip').click()
    for (const [id, ar] of [['turki', 'بدر التركي'], ['dossary', 'ياسر الدوسري'], ['maher', 'ماهر المعيقلي']]) {
      await expect(page.getByTestId(`reciter-${id}`)).toContainText(ar!)
    }
    await page.screenshot({ path: 'test-results/shots/22-reciters.png' })
    await page.getByTestId('reciter-turki').click()
    await expect(page.getByTestId('reciter-chip')).toContainText('Badr Al-Turki')
    await page.getByTestId('audio-play').click()
    await expect(page.getByTestId('unavailable')).toBeVisible()
    await expect(page.getByTestId('unavailable')).toContainText(/won’t play a different reciter/)
    expect(audioRequests.filter((u) => !u.startsWith('blob:'))).toHaveLength(0)         // nothing from anyone was played
    // An explicit, announced fallback is offered, never applied silently.
    await page.getByTestId('use-fallback').click()
    await expect(page.getByTestId('fallback-notice')).toContainText(/instead of Badr Al-Turki/)
    await expect.poll(() => audioRequests.some((u) => /Alafasy/i.test(u))).toBe(true)
    // The saved choice survives a reload.
    await page.reload()
    await page.getByTestId('to-flow').or(page.getByTestId('reciter-chip')).first().waitFor()
    await expect(page.getByTestId('reciter-chip')).toContainText('Badr Al-Turki')
  })

  test('Maher and Dossary try only their own recordings; failure never plays another reciter', async ({ page }) => {
    await freshStart(page)
    const played: string[] = []
    await page.route(/everyayah\.com|cdn\.islamic\.network/, (r) => { played.push(r.request().url()); return r.abort('failed') })
    await page.goto('/learn/112/1/1')
    await page.getByTestId('reciter-chip').click()
    await page.getByTestId('reciter-maher').click()
    await page.getByTestId('audio-play').click()
    await expect(page.getByTestId('unavailable')).toBeVisible({ timeout: 15000 })
    expect(played.length).toBeGreaterThanOrEqual(2)
    for (const u of played) expect(u.toLowerCase()).toMatch(/maher/)
    expect(played.join(' ')).not.toMatch(/alafasy/i)
    await expect(page.getByTestId('reciter-chip')).toContainText('Maher')
  })

  test('echo mode plays the ayah, then a real silence labelled "Your turn", then continues', async ({ page }) => {
    await mockAudio(page); await freshStart(page)
    await page.goto('/learn/112/1/2')
    await page.getByTestId('echo-toggle').click()
    await expect(page.getByTestId('echo-toggle')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('audio-play').click()
    await expect(page.getByTestId('audio-status')).toContainText(/Your turn/, { timeout: 12000 })
    await page.screenshot({ path: 'test-results/shots/23-echo.png' })
    await page.getByTestId('reciter-chip').click()
    await expect(page.getByText('Pause length')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/24-audio-settings.png' })
  })
})

test.describe('resume, lead-in connect, scheduling window, junction repair', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  test('a reload mid-learning returns to the same stage, and never auto-grades a recall', async ({ page }) => {
    await page.goto('/learn/112/1/4')
    await page.getByTestId('to-flow').click()
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'flow')
    await page.reload()
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'flow')
    await page.getByTestId('said-it').click(); await page.getByTestId('rate-natural').click()
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'recall')
    await page.reload()                                                      // interrupted during recall
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'recall')
    await expect(page.locator('.arabic .w')).toHaveCount(0)                  // back to hidden, fresh
    expect(await idbRows(page, 'reviews')).toHaveLength(0)                   // nothing was credited or failed on the user's behalf
  })

  test('a new ayah is joined to the known ayahs before it (lead-in connect)', async ({ page }) => {
    await seed(page, 'declarations', [declaration(20, 1, 2)])
    await page.goto('/learn/20/3/3')
    await page.getByTestId('to-flow').click()
    for (let i = 0; i < 12 && (await page.getByTestId('learn-flow').getAttribute('data-stage')) === 'flow'; i++) {
      await page.getByTestId('said-it').click(); await page.getByTestId('rate-natural').click()
    }
    await page.getByTestId('reveal').click()
    await page.getByTestId('grade-independent').click()
    await expect(page.getByTestId('stage-connect')).toBeVisible()
    await expect(page.getByTestId('stage-connect')).toContainText('Ayah 1 → 3')
    await page.screenshot({ path: 'test-results/shots/25-connect.png' })
    await page.getByTestId('reveal').click()
    await page.getByTestId('grade-independent').click()
    await expect(page.getByTestId('stage-done')).toBeVisible()
    const rs = await idbRows(page, 'reviews')
    const passage = rs.find((r) => r.range.start === 1 && r.range.end === 3)
    expect(passage).toBeTruthy()
  })

  test('an ayah learned 23 hours ago is in today’s plan, so a same-time-tomorrow habit does not skip a day', async ({ page }) => {
    await seed(page, 'reviews', [recall(112, 1, 1, 'independent', 23)])
    await page.goto('/')
    await expect(page.getByTestId('plan-item').first()).toBeVisible()
    await page.getByTestId('plan-item').first().getByRole('button').first().click()
    await expect(page.getByTestId('plan-reasons')).toContainText(/Due around this time today/)
  })

  test('a transition that keeps going wrong becomes a short drill in the plan, and runs in a session', async ({ page }) => {
    const j = (g: string, h: number) => recall(20, 12, 13, g, h, { kind: 'junction' })
    await seed(page, 'reviews', [j('failed', 30), j('failed', 5)])
    await page.goto('/')
    await expect(page.getByText('Transition drill').first()).toBeVisible()
    await page.getByTestId('start-session').click()
    await expect(page.getByTestId('junction-drill')).toBeVisible()
    await page.getByTestId('junction-reveal').click()
    await page.getByTestId('junction-smooth').click()
    await expect(page.getByTestId('session-summary')).toBeVisible()
  })

  test('the session summary reports what happened, when each item returns, and what tomorrow starts with', async ({ page }) => {
    await seed(page, 'reviews', [recall(112, 1, 2, 'independent', 30)])
    await page.goto('/')
    await page.getByTestId('start-session').click()
    await page.getByTestId('reveal').click()
    await page.getByTestId('grade-hesitant').click()
    await expect(page.getByTestId('session-summary')).toBeVisible()
    await expect(page.getByTestId('summary-items')).toContainText(/Some hesitation/)
    await expect(page.getByTestId('summary-next')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/26-summary.png', fullPage: true })
    await page.getByTestId('session-finish').click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('recitation passages: save one, see its honest status, and get suggestions only from verified stretches', async ({ page }) => {
    await seed(page, 'reviews', [recall(20, 1, 1, 'independent', 2), recall(20, 2, 2, 'independent', 2), recall(20, 3, 3, 'independent', 2), recall(20, 4, 4, 'independent', 2)])
    await page.goto('/quran')
    await page.getByTestId('passages').getByRole('button').first().click()
    await page.getByTestId('passage-suggest').click()
    await expect(page.getByTestId('passage-suggestions')).toContainText('Taha 1–4')
    await expect(page.getByTestId('passage-suggestions')).toContainText(/not recommendations for where to stop/)
    await page.getByTestId('passage-add').click()
    await page.getByTestId('passage-surah').selectOption('20')
    await page.getByTestId('passage-from').fill('1'); await page.getByTestId('passage-to').fill('4')
    await page.getByTestId('passage-name').fill('First raka’ah')
    await page.getByTestId('passage-save').click()
    await expect(page.getByTestId('passage-row')).toContainText('First raka’ah')
    await expect(page.getByTestId('passage-row')).toContainText(/Every ayah recalled/)
    await page.screenshot({ path: 'test-results/shots/27-passages.png' })
    await page.reload()
    await page.getByTestId('passages').getByRole('button').first().click()
    await expect(page.getByTestId('passage-row')).toContainText('First raka’ah')           // persisted in settings
    await page.getByTestId('passage-practise').click()
    await expect(page.getByTestId('recall-card')).toBeVisible()
    await expect(page.getByTestId('stumble-tools')).toHaveCount(0)                          // hidden until text is revealed
  })
})

test('Learn still works end to end with the new audio bar, in dark mode, at phone width', async ({ page }) => {
  await mockAudio(page); await freshStart(page)
  await page.goto('/settings'); await page.getByRole('button', { name: 'dark' }).click()
  await page.goto('/learn/112/1/4')
  await expect(page.getByTestId('audio-bar')).toBeVisible()
  await page.screenshot({ path: 'test-results/shots/28-learn-dark.png' })
  const box = await page.getByTestId('audio-bar').boundingBox()
  expect(box!.width).toBeLessThanOrEqual(390)                                               // no horizontal overflow
  await completeLearning(page)
  const stage = await page.getByTestId('learn-flow').getAttribute('data-stage')
  expect(stage).toBe('done')
})
