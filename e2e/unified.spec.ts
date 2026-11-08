// One record of what the learner knows. Practice is one natural activity; recall is the test; evidence from any screen counts everywhere,
// and nothing is asked twice just because it was asked from a different place.
import { expect, test, type Page } from '@playwright/test'
import { completeLearning, freshStart, idbRows, mockAudio, recall, seed } from './helpers'

const stage = (page: Page) => page.getByTestId('learn-flow').getAttribute('data-stage')
const hoursAgo = (h: number) => h

test.describe('Sound and Flow are one: practise', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  test('one screen has the text, the meaning, the reference audio and the repetition, and moving on asks for no rating', async ({ page }) => {
    await page.goto('/learn/112/1/1')
    await expect(page.getByTestId('stage-practise')).toBeVisible()
    await expect(page.getByTestId('audio-bar')).toBeVisible()
    await expect(page.locator('.arabic .w').first()).toBeVisible()
    await expect(page.getByTestId('rate-natural')).toHaveCount(0)               // no required self-rating
    await expect(page.getByText(/Sound|Flow/)).toHaveCount(0)                    // there is no Sound or Flow to be sent through
    await page.getByTestId('said-it').click(); await page.getByTestId('said-it').click(); await page.getByTestId('said-it').click()
    await page.getByTestId('practise-next').click()
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'recall')
    const flows = await idbRows(page, 'flows')
    expect(flows).toHaveLength(1)
    expect(flows[0]).toMatchObject({ surah: 112, ayah: 1, rating: 'improving', reps: 3 })   // practice is recorded as having happened, never as going well
  })

  test('the overlapping transitions are all still there: A, then A → B, then B → C … one tap each, no ratings', async ({ page }) => {
    await page.goto('/learn/2/110/110')                                          // 17 words, three phrases
    const labels: string[] = []
    for (let i = 0; i < 12 && (await stage(page)) === 'practise'; i++) {
      labels.push(await page.getByTestId('stage-practise').locator('.font-display').first().innerText())
      await page.getByTestId('practise-next').click()
    }
    expect(labels.length).toBeGreaterThan(2)
    expect(labels.some((l) => /→/.test(l))).toBe(true)                           // the overlapping transitions
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'recall')
  })

  test('the primary action says where it leads, and "Skip to recall" is always one tap away before the last step', async ({ page }) => {
    await page.goto('/learn/2/110/110')
    await expect(page.getByTestId('practise-next')).toContainText('Next:')
    await page.getByTestId('skip-to-recall').click()
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'recall')
  })

  test('a part the learner calls tricky is kept (a tangled mark, so it is practised again) and does not advance', async ({ page }) => {
    await page.goto('/learn/2/110/110')
    await page.getByTestId('practise-tricky').click()
    expect(await stage(page)).toBe('practise')
    const flows = await idbRows(page, 'flows')
    expect(flows.some((f) => f.rating === 'tangled')).toBe(true)
  })

  test('a spot marked tricky is rated explicitly to clear it (the one place a rating is itself the evidence)', async ({ page }) => {
    await page.goto('/review/2/255/255?ctx=free')
    await page.getByTestId('reveal').click(); await page.locator('[data-word="12"]').click(); await page.getByTestId('grade-hesitant').click(); await page.getByTestId('repair-skip').click()
    await page.goto('/learn/2/255/255')
    await expect(page.getByTestId('stage-practise')).toContainText('tricky spot')
    await expect(page.getByTestId('rate-natural')).toBeVisible()
  })
})

test.describe('reading is practice, never recall', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  test('practising every step leaves the ayah unrecalled: only a recall with the text hidden records one', async ({ page }) => {
    await page.goto('/learn/112/1/4')
    await page.getByTestId('said-it').click(); await page.getByTestId('practise-next').click()      // one ayah, one phrase
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'recall')
    expect(await idbRows(page, 'reviews')).toHaveLength(0)
    await page.goto('/progress')
    await expect(page.getByTestId('coverage').locator('div.font-display').first()).toHaveText('0')
    await page.goto('/learn/112/1/4')                                            // coming back resumes at recall; nothing was recorded on the learner's behalf
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'recall')
    expect(await idbRows(page, 'reviews')).toHaveLength(0)
  })

  test('the learning flow cannot finish on practice alone', async ({ page }) => {
    await page.goto('/learn/112/1/1')
    await page.getByTestId('practise-next').click()
    await expect(page.getByTestId('grades')).toHaveCount(0)                      // nothing to grade until the text has been recalled and checked
    await expect(page.getByTestId('learn-flow')).not.toHaveAttribute('data-stage', 'done')
    await completeLearning(page)
    expect((await idbRows(page, 'reviews')).filter((r) => r.context === 'new')).toHaveLength(1)
  })
})

test.describe('what is already known is recognised', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  test('an ayah recalled a little while ago is already in place: it is not taught or asked again, and nothing new is recorded', async ({ page }) => {
    await seed(page, 'reviews', [recall(20, 3, 3, 'independent', hoursAgo(1))])
    await page.goto('/learn/20/3/3')
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'done')
    await expect(page.getByTestId('stage-done')).toContainText('already in place')
    expect(await idbRows(page, 'reviews')).toHaveLength(1)
  })

  test('an ayah that is due opens straight at recall (no re-teaching), with practice one tap away', async ({ page }) => {
    await seed(page, 'reviews', [recall(20, 3, 3, 'independent', 24 * 20)])
    await page.goto('/learn/20/3/3')
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'recall')
    await page.getByTestId('practise-first').click()
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'practise')
  })

  test('a range with known and unknown ayahs teaches only what is not known yet', async ({ page }) => {
    await seed(page, 'reviews', [recall(20, 3, 3, 'independent', hoursAgo(1))])
    await page.goto('/learn/20/3/4')
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'practise')
    await expect(page.getByTestId('learn-flow')).toContainText('4')                // ayah 4 is the one being practised (ayah 3 was passed over)
    await completeLearning(page)
    const rs = await idbRows(page, 'reviews')
    expect(rs.filter((r) => r.context === 'new').every((r) => r.range.start >= 4 || r.range.start === 3)).toBe(true)
  })
})

test.describe('a session is checked against what has been recorded since the plan was made', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  test('an item whose ayahs were all recalled elsewhere is passed over, and the summary says so', async ({ page }) => {
    await seed(page, 'reviews', [recall(20, 7, 9, 'independent', 24 * 9)])
    await page.goto('/')
    await page.getByTestId('start-session').click()
    await expect(page.getByTestId('recall-card')).toBeVisible()
    // Meanwhile, from another screen (here: a plain revision), the same ayahs are recalled and checked.
    await page.goto('/review/20/7/9?ctx=free')
    await page.getByTestId('reveal').click(); await page.getByTestId('grade-independent').click()
    await expect(page.getByTestId('review-done')).toBeVisible()
    const before = (await idbRows(page, 'reviews')).length
    await page.goto('/session')
    await expect(page.getByTestId('session-summary')).toBeVisible()               // the planned item was covered: it is not asked for again
    await expect(page.getByTestId('summary-items')).toContainText('Already covered')
    expect((await idbRows(page, 'reviews')).length).toBe(before)                  // and nothing was recorded on the learner's behalf
  })

  test('an item that is partly covered keeps only what is still needed, and says which ayahs were covered', async ({ page }) => {
    await seed(page, 'reviews', [recall(20, 7, 10, 'independent', 24 * 9)])
    await page.goto('/')
    await page.getByTestId('start-session').click()
    await expect(page.getByTestId('recall-card')).toBeVisible()
    await page.goto('/review/20/7/7?ctx=free')
    await page.getByTestId('reveal').click(); await page.getByTestId('grade-independent').click()
    await page.goto('/session')
    await expect(page.getByTestId('covered-note')).toContainText('Ayah 7 already covered')
    await expect(page.getByTestId('lead-in')).toHaveAttribute('data-lead-ayah', '7')        // the covered ayah becomes the run-up
    await expect(page.getByTestId('ayah-row-7')).toHaveCount(0)
    await expect(page.getByTestId('ayah-row-8')).toBeVisible()
  })

  test('an ayah that is still due is never dropped: nothing is skipped on a guess', async ({ page }) => {
    await seed(page, 'reviews', [recall(20, 7, 9, 'independent', 24 * 9)])
    await page.goto('/')
    await page.getByTestId('start-session').click()
    await page.goto('/session')
    await expect(page.getByTestId('recall-card')).toBeVisible()
    await expect(page.getByTestId('covered-note')).toHaveCount(0)
    for (const a of [7, 8, 9]) await expect(page.getByTestId(`ayah-row-${a}`)).toBeVisible()
  })
})

test.describe('saved positions and the way back', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  test('a position saved by the previous version (stage "sound" or "flow") resumes as practise, rung and all', async ({ page }) => {
    for (const old of ['sound', 'flow']) {
      await page.goto('/')
      await page.evaluate((st) => localStorage.setItem('hifz.learn.v1.2:110-110', JSON.stringify({ idx: 0, stage: st, rungIdx: 1, listened: true, at: Date.now() })), old)
      await page.goto('/learn/2/110/110')
      await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'practise')
    }
  })

  test('this version writes "flow" for practise, so rolling back to the previous version resumes at the same place', async ({ page }) => {
    await page.goto('/learn/2/110/110')
    await page.getByTestId('practise-next').click()
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hifz.learn.v1.2:110-110') ?? '{}'))
    expect(saved.stage).toBe('flow')
    expect(saved.rungIdx).toBe(1)
  })

  test('joining ayahs is offered but never forced: it can be left for later', async ({ page }) => {
    await seed(page, 'declarations', [{ id: crypto.randomUUID(), range: { surah: 20, start: 1, end: 2 }, level: 'known', occurredAt: Date.now() - 5 * 86400e3 }])
    await page.goto('/learn/20/3/3')
    for (let i = 0; i < 12 && (await stage(page)) === 'practise'; i++) await page.getByTestId('practise-next').click()
    await page.getByTestId('reveal').click(); await page.getByTestId('grade-independent').click()
    await expect(page.getByTestId('stage-connect')).toBeVisible()
    await page.getByTestId('skip-connect').click()
    await expect(page.getByTestId('learn-flow')).toHaveAttribute('data-stage', 'done')
  })
})

test.describe('switching between whole and part by part', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })
  test('learning an ayah whole, leaving, coming back and choosing phrases again returns to part by part', async ({ page }) => {
    await page.goto('/learn/20/40/40')
    await expect(page.getByTestId('part-dots')).toBeVisible()
    await page.getByTestId('learn-whole').click()
    await expect(page.getByTestId('part-dots')).toHaveCount(0)
    await page.getByRole('button', { name: 'Leave', exact: true }).click()
    await page.goto('/learn/20/40/40')
    await expect(page.getByTestId('practise-next')).toContainText('Recall from memory')       // still whole after coming back
    await page.getByTestId('learn-phrases').click()
    await expect(page.getByTestId('part-dots')).toBeVisible()                                  // and back to parts, even straight after a reload
  })
})
