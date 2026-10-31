// Reconnection and duplicate-safety tests for the REAL client sync code in a REAL browser.
// The backend is a small in-test emulator of the Supabase REST/Auth endpoints (the live project
// is not reachable from the build sandbox), implementing the same semantics as the migration:
// unique keys, ignore-duplicates inserts, and a monotonic seq cursor.
import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test'
import { mockAudio } from './helpers'

const ORIGIN = 'https://fake-hifz.supabase.test'
const USER = { id: '5f1b7a6e-0000-4000-8000-000000000001', email: 'tester@example.com' }
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', email: USER.email, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }

class Emulator {
  tables = new Map<string, Record<string, any>[]>()
  seq = 0
  dropNextAck = false
  posts = 0
  rows(t: string) { if (!this.tables.has(t)) this.tables.set(t, []); return this.tables.get(t)! }

  async attach(ctx: BrowserContext) {
    await ctx.route(`${ORIGIN}/**`, (r) => this.handle(r))
  }
  async handle(route: Route) {
    const req = route.request()
    const url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (url.pathname.startsWith('/auth/v1/token')) {
      const access_token = jwt()
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ access_token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: USER.id, aud: 'authenticated', role: 'authenticated', email: USER.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }) })
    }
    if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: '{}' })
    const m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname)
    if (!m) return route.fulfill({ status: 404, headers: CORS, body: '{}' })
    const table = m[1]!
    if (req.method() === 'POST') {
      this.posts++
      const rows = JSON.parse(req.postData() ?? '[]') as Record<string, any>[]
      const keys = (url.searchParams.get('on_conflict') ?? 'id').split(',')
      const ignore = (req.headers()['prefer'] ?? '').includes('ignore-duplicates')
      for (const r of rows) {
        const full: Record<string, any> = { ...r, user_id: USER.id }
        const ex = this.rows(table).find((x) => keys.every((k) => x[k] === full[k]))
        if (ex) { if (!ignore) Object.assign(ex, full, { seq: ++this.seq }) }
        else this.rows(table).push({ ...full, seq: ++this.seq })
      }
      if (this.dropNextAck) { this.dropNextAck = false; return route.abort('connectionreset') }
      return route.fulfill({ status: 201, headers: CORS, body: '' })
    }
    const gt = Number((url.searchParams.get('seq') ?? 'gt.0').replace('gt.', ''))
    const limit = Number(url.searchParams.get('limit') ?? 1000)
    const out = this.rows(table).filter((r) => r.seq > gt).sort((a, b) => a.seq - b.seq).slice(0, limit)
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(out) })
  }
}

const idb = (page: Page, table: string) => page.evaluate(async (t) => {
  const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('hifz-os'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const rows: any[] = await new Promise((res, rej) => { const q = db.transaction(t).objectStore(t).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error) })
  db.close()
  return rows.map((x) => ({ id: x.id as string, synced: x.synced as number }))
}, table)

async function signIn(page: Page) {
  await page.goto('/settings')
  await page.getByLabel('Email').fill(USER.email)
  await page.getByLabel('Password').fill('correct horse battery')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText(USER.email)).toBeVisible()
}
async function gradeOnce(page: Page, again = false) {
  if (again) await page.getByRole('button', { name: 'Recite it again' }).click()
  await page.getByTestId('reveal').click()
  await page.getByTestId('grade-independent').click()
  await expect(page.getByTestId('review-done')).toBeVisible()
}

test.describe('cloud sync (emulated backend)', () => {
  test('offline use, reconnection upload, lost acknowledgement, and a second device, with no duplicates', async ({ browser }) => {
    const server = new Emulator()
    const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await server.attach(ctxA)
    const a = await ctxA.newPage()
    await mockAudio(a)
    await a.goto('/'); await a.evaluate(async () => { localStorage.clear(); for (const d of (await indexedDB.databases?.()) ?? []) indexedDB.deleteDatabase(d.name!) })
    await signIn(a)

    // Open the review screen while online, then lose the network.
    await a.goto('/review/112/1/1?ctx=free')
    await expect(a.getByTestId('recall-card')).toBeVisible()
    await ctxA.setOffline(true)
    await gradeOnce(a)
    await gradeOnce(a, true)
    await gradeOnce(a, true)
    await expect.poll(async () => (await idb(a, 'reviews')).filter((r) => r.synced === 0).length).toBe(3)
    expect(server.rows('review_events')).toHaveLength(0)

    // Reconnect: the three offline events upload exactly once.
    await ctxA.setOffline(false)
    await expect.poll(() => server.rows('review_events').length, { timeout: 20_000 }).toBe(3)
    await expect.poll(async () => (await idb(a, 'reviews')).filter((r) => r.synced === 0).length).toBe(0)

    // The server stores the event but the response is lost: the client must retry without duplicating.
    server.dropNextAck = true
    await gradeOnce(a, true)
    await expect.poll(() => server.rows('review_events').length, { timeout: 20_000 }).toBe(4)
    await expect.poll(async () => (await idb(a, 'reviews')).filter((r) => r.synced === 0).length).toBe(1)   // client doesn't know it landed
    await a.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect.poll(async () => (await idb(a, 'reviews')).filter((r) => r.synced === 0).length, { timeout: 20_000 }).toBe(0)
    expect(server.rows('review_events')).toHaveLength(4)
    expect(new Set(server.rows('review_events').map((r) => r.id)).size).toBe(4)

    // A second device signs in and receives exactly those four events.
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await server.attach(ctxB)
    const b = await ctxB.newPage()
    await b.goto('/'); await b.evaluate(async () => { localStorage.clear(); for (const d of (await indexedDB.databases?.()) ?? []) indexedDB.deleteDatabase(d.name!) })
    await signIn(b)
    await expect.poll(async () => (await idb(b, 'reviews')).length, { timeout: 20_000 }).toBe(4)
    expect((await idb(b, 'reviews')).map((r) => r.id).sort()).toEqual((await idb(a, 'reviews')).map((r) => r.id).sort())
    await b.goto('/progress')
    await expect(b.getByTestId('coverage')).toContainText('Recalled')
    expect(server.rows('review_events')).toHaveLength(4)
    await ctxA.close(); await ctxB.close()
  })
})
