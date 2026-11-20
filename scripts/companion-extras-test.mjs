/** Actual app, synthetic data only: home-computer setup and health, building-wide summary, remembered phone view and alert controls. */
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, devices } from 'playwright';
const dir = await mkdtemp(join(tmpdir(), 'office-extras-'));
process.env.BUILDING_DB = join(dir, 'test.sqlite'); delete process.env.T3_LOCAL_DATA;
const { createServer } = await import('vite');
const server = await createServer({ server: { host: 'localhost', port: 0, hmr: false }, logLevel: 'error' });
let browser; let count = 0;
const ready = async (page) => { await page.waitForFunction(() => window.__ready, {}, { timeout: 90000 }); await page.evaluate(() => document.querySelector('.office-welcome')?.remove()); };
try {
  await server.listen(); const base = server.resolvedUrls.local[0]; const origin = new URL(base).origin;
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-webgl'] });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce', permissions: ['notifications'] });
  const call = async (c, path, data, method = data === undefined ? 'GET' : 'POST', headers = {}) => { const r = await c.request.fetch(`${base}api/building${path}`, { method, data, headers }); return { status: r.status(), data: await r.json().catch(() => null) }; };
  const register = async (c, handle, name) => { const r = await call(c, '/register', { handle, name, password: 'synthetic-extras-password' }); assert.equal(r.status, 201); return r.data; };
  const owner = await register(ctx, 'extras_owner', 'Owner');
  const friendCtx = await browser.newContext(), quietCtx = await browser.newContext();
  const friend = await register(friendCtx, 'extras_friend', 'Maya'), quiet = await register(quietCtx, 'extras_quiet', 'Quiet');
  await call(friendCtx, '/office', { name: 'Maya studio' }); await call(quietCtx, '/office', { name: 'Quiet room' });
  for (const [c, scope] of [[friendCtx, 'activity'], [quietCtx, 'presence']]) { const inv = await call(c, '/invites', { scope }); assert.equal((await call(ctx, '/accept', { token: inv.data.token })).status, 200); }
  const keyOf = async (c) => (await call(c, '/publisher-tokens', {})).data.token;
  const publish = (key, agents) => call(friendCtx, '/publish', { agents: agents.map(([id, status]) => ({ id, provider: 'codex', status })) }, 'POST', { authorization: 'Bearer ' + key });
  const friendKey = await keyOf(friendCtx), quietKey = await keyOf(quietCtx);
  await publish(friendKey, [['m1', 'waiting'], ['m2', 'failed'], ['m3', 'running']]); await publish(quietKey, [['q1', 'running']]);

  // ---- 1. Home computer: guided steps and live connection health
  const menu = await ctx.newPage(); menu.on('pageerror', (e) => errors.push('menu: ' + e.message));
  await menu.goto(base + '?view=friends&lang=en'); await menu.locator('[data-tab=sharing]').click();
  const health = menu.locator('#home-health');
  assert.equal(await menu.locator('#home-command').innerText(), `npm run home -- --server ${origin}`);
  await menu.waitForFunction(() => document.querySelector('#home-health')?.dataset.state === 'no-key', null, { timeout: 15000 });
  await menu.locator('[data-action=create-key]').click(); const ownKey = await menu.locator('#key-result textarea').inputValue(); assert.match(ownKey, /^[\w-]{43}$/);
  await menu.waitForFunction(() => document.querySelector('#home-health')?.dataset.state === 'waiting', null, { timeout: 15000 });
  await call(ctx, '/publish', { agents: [{ id: 'o1', provider: 'claude', status: 'running' }, { id: 'o2', provider: 'codex', status: 'running' }] }, 'POST', { authorization: 'Bearer ' + ownKey });
  await menu.waitForFunction(() => document.querySelector('#home-health')?.dataset.state === 'connected', null, { timeout: 15000 });
  assert.match(await health.innerText(), /Connected · 2 agents/);
  await call(ctx, '/office', { paused: true }); await menu.waitForFunction(() => document.querySelector('#home-health')?.dataset.state === 'paused', null, { timeout: 15000 });
  await call(ctx, '/office', { paused: false }); await call(ctx, '/publish', { agents: [{ id: 'o1', provider: 'claude', status: 'running' }] }, 'POST', { authorization: 'Bearer ' + ownKey });
  await menu.waitForFunction(() => document.querySelector('#home-health')?.dataset.state === 'connected', null, { timeout: 15000 });
  assert.ok(await menu.locator('.home-help summary').isVisible()); await mkdir('shots', { recursive: true }); await menu.locator('.home-setup').screenshot({ path: 'shots/home-setup.png' }); await menu.close(); count++;

  // ---- 2. Building-wide summary: attention first, presence stays presence, counts only, opens the office
  const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push('office: ' + e.message));
  await page.goto(base + '?source=demo&agents=3&weather=clear&lang=en'); await ready(page);
  await page.locator('.companion-launcher').click(); await page.locator('.companion').waitFor();
  await page.locator('.companion-views [data-view=building]').click();
  await page.locator('.companion-office').first().waitFor({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('.companion-office').length === 3);
  const rows = await page.locator('.companion-office').allInnerTexts();
  assert.match(rows[0], /Maya studio[\s\S]*1 Failed · 1 Waiting · 1 Running/, rows.join(' | '));
  assert.match(rows[1], /Owner[\s\S]*1 Running/, 'own published office (demo agents are never counted as yours)');
  assert.match(rows[2], /Quiet room[\s\S]*Presence only · Online/);
  assert.ok(!(await page.locator('.companion-building').innerText()).match(/Agent \d|m1|q1/), 'no agent names or ids from other offices');
  assert.match(await page.locator('.companion-building-total').innerText(), /1 Failed · 1 Waiting · 2 Running/);
  await page.locator('.companion-office').first().click();
  await page.waitForURL((u) => u.searchParams.get('floor') === friend.office.id && u.searchParams.get('companion') === '1', { timeout: 30000 });
  await ready(page); await page.locator('.companion').waitFor(); await page.waitForFunction(() => document.querySelectorAll('.companion-row').length === 3);
  await page.locator('.companion-views [data-view=office]').waitFor(); count++;

  // ---- 3. Remembered phone view: opt-in, once per launch, filter kept, account-bound
  await page.goto(`${base}?source=shared&floor=${owner.office.id}&companion=1&lang=en`); await ready(page); await page.locator('.companion').waitFor();
  await page.locator('.companion-chip[data-filter=running]').click();
  await page.locator('.companion-remember input').check(); await page.waitForFunction(() => /opens when you start/.test(document.querySelector('.companion-remember + .companion-note')?.textContent ?? ''));
  const launch = await ctx.newPage(); launch.on('pageerror', (e) => errors.push('launch: ' + e.message));
  await launch.goto(base + '?lang=en');
  await launch.waitForURL((u) => u.searchParams.get('floor') === owner.office.id && u.searchParams.get('companion') === '1', { timeout: 30000 });
  await ready(launch); await launch.locator('.companion').waitFor();
  assert.equal(await launch.locator('.companion-chip[data-filter=running]').getAttribute('aria-pressed'), 'true', 'filter restored');
  await launch.goto(base + '?source=demo&lang=en'); await ready(launch); assert.equal(new URL(launch.url()).searchParams.get('source'), 'demo', 'other navigation untouched');
  await launch.goto(base + '?lang=en'); await ready(launch); assert.equal(new URL(launch.url()).searchParams.get('floor'), null, 'only once per launch: "← Your floor" is never bounced back');
  await launch.close();
  const another = await ctx.newPage(); await another.addInitScript(() => { const v = JSON.parse(localStorage.getItem('office.companion.view.v1') ?? 'null'); if (v) localStorage.setItem('office.companion.view.v1', JSON.stringify({ ...v, actor: 'someone-else' })); });
  await another.goto(base + '?lang=en'); await ready(another); assert.equal(new URL(another.url()).searchParams.get('floor'), null, 'another account never reopens it');
  assert.equal(await another.evaluate(() => localStorage.getItem('office.companion.view.v1')), null, 'and the saved view is dropped'); await another.close(); count++;

  // ---- 4. App & alerts: on (foreground here), per-office choice, quiet hours, test alert and recent alerts
  // Headless Chromium always reports notifications as denied; a stand-in that reports "granted" and records what would be shown
  // tests the app's own logic. Real operating-system delivery is a device check, not claimed here.
  await page.close();
  const alertsPage = await ctx.newPage(); alertsPage.on('pageerror', (e) => errors.push('alerts: ' + e.message));
  await alertsPage.addInitScript(() => { window.__shown = []; class N { static permission = 'granted'; static requestPermission = async () => 'granted'; constructor(title, o) { window.__shown.push(o?.body ?? title); } } Object.defineProperty(window, 'Notification', { value: N, configurable: true }); });
  const page2 = alertsPage;
  await page2.goto(base + '?source=demo&agents=2&weather=clear&lang=en'); await ready(page2);
  await page2.evaluate(() => window.openOfficeAppTools());
  const dlg = page2.locator('dialog.app-tools'); await dlg.waitFor();
  await dlg.getByRole('button', { name: 'Turn on alerts' }).click();
  await dlg.getByRole('button', { name: 'Turn off alerts' }).waitFor({ timeout: 15000 });
  await dlg.locator(`#app-mute-${friend.office.id}`).waitFor({ timeout: 15000 });
  assert.equal(await dlg.locator(`#app-mute-${quiet.office.id}`).count(), 0, 'presence-only offices are not offered');
  await dlg.locator(`#app-mute-${friend.office.id}`).uncheck(); await page2.waitForFunction((id) => JSON.parse(localStorage.getItem('office.alerts')).muted.includes(id), friend.office.id);
  await dlg.locator('#app-alerts-quiet').check(); await page2.waitForFunction(() => JSON.parse(localStorage.getItem('office.alerts')).quiet?.start === 1320);
  assert.equal(await dlg.locator('#app-quiet-from').isEnabled(), true);
  await dlg.locator('#app-quiet-from').fill('21:30'); await dlg.locator('#app-quiet-from').dispatchEvent('change');
  await page2.waitForFunction(() => JSON.parse(localStorage.getItem('office.alerts')).quiet?.start === 21 * 60 + 30);
  await dlg.getByRole('button', { name: 'Send a test alert' }).click();
  await dlg.getByText('Test shown on this device.').waitFor({ timeout: 10000 });
  assert.match(await dlg.locator('.app-history').innerText(), /Test · this device/);
  assert.deepEqual(await page2.evaluate(() => window.__shown), ['Test alert: notifications work on this device.'], 'generic text only');
  const off = page2.locator('dialog.app-tools section').filter({ hasText: 'Alert settings' }); assert.equal(await off.count(), 1);
  await dlg.locator('section').filter({ hasText: 'Alert settings' }).scrollIntoViewIfNeeded(); await page2.screenshot({ path: 'shots/alert-controls.png' });
  await dlg.getByRole('button', { name: 'Turn off alerts' }).click(); await dlg.getByRole('button', { name: 'Turn on alerts' }).waitFor();
  assert.equal(await dlg.locator('#app-alerts-quiet').count(), 0, 'settings only while alerts are on'); count++;

  // ---- phone width: building summary fits
  const phone = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce', storageState: await ctx.storageState() });
  const p2 = await phone.newPage(); await p2.goto(base + '?source=demo&agents=2&weather=clear&lang=en'); await ready(p2);
  await p2.locator('.companion-launcher').click(); await p2.locator('.companion-views [data-view=building]').click(); await p2.locator('.companion-office').first().waitFor({ timeout: 15000 });
  assert.equal(await p2.evaluate(() => document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('.companion *')].some((e) => e.getBoundingClientRect().right > innerWidth + 1)), false, 'no horizontal overflow on a phone');
  await p2.screenshot({ path: 'shots/building-summary-phone.png' }); count++;

  assert.deepEqual(errors, []);
  console.log(`PASS: ${count} companion extras: home-computer steps and live health (no key/waiting/connected/paused), building summary (attention first, presence-only, counts only, opens office), remembered view (once per launch, filter, account-bound), alert controls (office choice, quiet hours, test, history) and phone fit.`);
} finally { await browser?.close(); await server.close(); await rm(dir, { recursive: true, force: true }); }
