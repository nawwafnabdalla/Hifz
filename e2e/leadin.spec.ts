// Revision begins with a run-up: the ayah before the passage is shown and readable; the passage itself is hidden; only the passage is recorded.
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { freshStart, idbRows, mockAudio } from './helpers'

const words = (s: number, a: number) => (JSON.parse(readFileSync(new URL('../src/data/generated/quran.json', import.meta.url), 'utf8')) as { text: string[][] }).text[s - 1]![a - 1]!.split(' ').filter(Boolean)
const leadWords = (page: import('@playwright/test').Page) => page.locator('[data-testid="lead-in-text"] [data-w]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-w'))))

test.describe('contextual lead-in for revision', () => {
  test.beforeEach(async ({ page }) => { await mockAudio(page); await freshStart(page) })

  test('Ta-Ha 7–9: ayah 6 is shown as a run-up, 7–9 are hidden, and only 7–9 are recorded', async ({ page }) => {
    await page.goto('/review/20/7/9?ctx=sabqi')
    await expect(page.getByTestId('recall-card')).toBeVisible()
    await expect(page.getByTestId('lead-in')).toHaveAttribute('data-lead-ayah', '6')
    expect(await leadWords(page)).toEqual(Array.from({ length: words(20, 6).length }, (_, i) => i))      // all of ayah 6, readable
    await expect(page.getByTestId('recall-text').locator('[data-w]')).toHaveCount(0)                      // 7–9: nothing visible
    await expect(page.getByTestId('lead-in')).toContainText('It isn’t tested')
    await page.getByTestId('reveal').click()
    await expect(page.getByTestId('lead-in')).toBeVisible()                                                // still there for context after the check
    await page.getByTestId('grade-independent').click()
    const reviews = await idbRows(page, 'reviews')
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({ kind: 'recall', range: { surah: 20, start: 7, end: 9 }, grade: 'independent', context: 'sabqi' })
    expect(reviews[0].stumbles).toEqual([])
  })

  test('ayah 6 does not need to have been memorised: no history at all, and nothing is recorded for it', async ({ page }) => {
    await page.goto('/review/20/7/9?ctx=manzil')
    await page.getByTestId('reveal').click(); await page.getByTestId('grade-failed').click()
    const reviews = await idbRows(page, 'reviews')
    expect(reviews.every((r) => r.range.start === 7 && r.range.end === 9)).toBe(true)
    expect(await idbRows(page, 'declarations')).toHaveLength(0)
  })

  test('the first-words hint still works, and still refers to the passage (the first word of each of ayahs 7, 8 and 9), not to the run-up', async ({ page }) => {
    await page.goto('/review/20/7/9?ctx=sabqi')
    await page.getByRole('button', { name: /Need a hint\? Show the first words/ }).click()
    expect(await page.getByTestId('recall-text').locator('[data-w]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-w'))))).toEqual([0, 0, 0])
    await expect(page.getByTestId('recall-text').locator('[data-w]')).toHaveCount(3)
    expect(await leadWords(page)).toHaveLength(words(20, 6).length)                                        // the run-up is unchanged
    await page.getByTestId('reveal').click(); await page.getByTestId('grade-hesitant').click()
    const r = (await idbRows(page, 'reviews'))[0]
    expect(r).toMatchObject({ range: { surah: 20, start: 7, end: 9 }, cueLevel: 3 })                        // recorded as weaker evidence, as before
  })

  test('a single ayah is revised with the previous ayah as its run-up, and its word hint is its own first word', async ({ page }) => {
    await page.goto('/review/20/7/7?ctx=free')
    await expect(page.getByTestId('lead-in')).toHaveAttribute('data-lead-ayah', '6')
    await page.getByTestId('hint').click()
    expect(await page.getByTestId('recall-text').locator('[data-w]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-w'))))).toEqual([0])
  })

  test('a very long preceding ayah (2:282 before 2:283) shows only its last words', async ({ page }) => {
    await page.goto('/review/2/283/283?ctx=free')
    await expect(page.getByTestId('lead-in-text')).toContainText('…')
    const idx = await leadWords(page)
    expect(idx).toHaveLength(14)
    expect(idx[idx.length - 1]).toBe(words(2, 282).length - 1)
  })

  test('at the start of a surah the cue is the surah (with the Basmala, except al-Fatiha and al-Tawbah)', async ({ page }) => {
    await page.goto('/review/20/1/3?ctx=sabqi')
    await expect(page.getByTestId('lead-in')).toHaveAttribute('data-lead-kind', 'surah-start')
    await expect(page.getByTestId('lead-in')).toContainText('after the Basmala')
    await page.goto('/review/9/1/3?ctx=sabqi')
    await expect(page.getByTestId('lead-in')).toContainText('begins here')
    await expect(page.getByTestId('lead-in')).not.toContainText('Basmala')
    await page.goto('/review/1/1/3?ctx=sabqi')
    await expect(page.getByTestId('lead-in')).not.toContainText('Basmala')
  })

  test('first-time learning is unchanged: no run-up in its recall step', async ({ page }) => {
    await page.goto('/learn/20/7/7')
    await page.getByTestId('to-flow').click()
    await page.getByRole('button', { name: 'Skip to recall' }).click()
    await expect(page.getByTestId('recall-card')).toBeVisible()
    await expect(page.getByTestId('lead-in')).toHaveCount(0)
  })
})
