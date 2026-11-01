import type { Page, Route } from '@playwright/test'
import { randomUUID } from 'node:crypto'

/** A 0.4 s silent mono WAV, served in place of third-party audio so the player path is exercised for real. */
export function silentWav(): Buffer {
  const rate = 8000, n = Math.floor(rate * 0.4)
  const buf = Buffer.alloc(44 + n)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n, 4); buf.write('WAVE', 8); buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate, 28)
  buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34); buf.write('data', 36); buf.writeUInt32LE(n, 40)
  buf.fill(128, 44)
  return buf
}

export async function mockAudio(page: Page, opts: { failEveryAyah?: boolean } = {}) {
  const wav = silentWav()
  await page.route(/everyayah\.com\/.*\.mp3/, (r: Route) => (opts.failEveryAyah ? r.abort('failed') : r.fulfill({ status: 200, contentType: 'audio/wav', body: wav, headers: { 'access-control-allow-origin': '*' } })))
  await page.route(/cdn\.islamic\.network\/.*\.mp3/, (r: Route) => r.fulfill({ status: 200, contentType: 'audio/wav', body: wav, headers: { 'access-control-allow-origin': '*' } }))
}

/** Clear IndexedDB and storage so each test starts as a brand-new user. */
export async function freshStart(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    localStorage.clear(); sessionStorage.clear()
    await caches?.delete('hifz-audio-v1')
    const dbs = await indexedDB.databases?.()
    await Promise.all((dbs ?? []).map((d) => new Promise((res) => { const r = indexedDB.deleteDatabase(d.name!); r.onsuccess = r.onerror = r.onblocked = () => res(null) })))
  })
  await page.reload()
}

/** Drive the Learn flow to completion, choosing ratings/grades. */
export async function completeLearning(page: Page, opts: { grade?: 'independent' | 'hesitant' | 'prompted' | 'failed' } = {}) {
  const grade = opts.grade ?? 'independent'
  for (let guard = 0; guard < 60; guard++) {
    const stage = await page.locator('[data-testid="learn-flow"]').getAttribute('data-stage')
    if (stage === 'done') return
    if (stage === 'sound') await page.getByTestId('to-flow').click()
    else if (stage === 'flow') { await page.getByTestId('said-it').click(); await page.getByTestId('rate-natural').click() }
    else if (stage === 'recall' || stage === 'connect') {
      if (await page.getByTestId('stage-repair').count()) { await page.getByText('Move on for now').click(); continue }
      await page.getByTestId('reveal').click()
      await page.getByTestId(`grade-${grade}`).click()
    }
    await page.waitForTimeout(60)
  }
  throw new Error('learning flow did not finish')
}


/** Insert rows straight into the app's IndexedDB (as unsynced local data), then reload so the app rebuilds its state. */
export async function seed(page: Page, table: 'reviews' | 'flows' | 'declarations', rows: Record<string, unknown>[]) {
  await page.evaluate(async ({ table, rows }) => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('hifz-os'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    await new Promise<void>((res, rej) => { const tx = db.transaction(table, 'readwrite'); const st = tx.objectStore(table); rows.forEach((x) => st.put({ ...x, synced: 0 })); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error) })
    db.close()
  }, { table, rows })
  await page.reload()
}

export async function idbRows(page: Page, table: string): Promise<any[]> {
  return page.evaluate(async (t) => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('hifz-os'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const rows: any[] = await new Promise((res, rej) => { const q = db.transaction(t).objectStore(t).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error) })
    db.close()
    return rows
  }, table)
}

export const recall = (surah: number, start: number, end: number, grade: string, hoursAgo: number, extra: Record<string, unknown> = {}) => ({
  id: randomUUID(), kind: 'recall', range: { surah, start, end }, grade, context: 'free', cueLevel: 4, stumbles: [], shakyJunctions: [], durationMs: 15000,
  occurredAt: Date.now() - hoursAgo * 3600e3, ...extra,
})
export const declaration = (surah: number, start: number, end: number) => ({ id: randomUUID(), range: { surah, start, end }, level: 'known', occurredAt: Date.now() - 5 * 86400e3 })
