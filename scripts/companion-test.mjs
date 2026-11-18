/** Actual app, synthetic data only: optional agent companion on desktop and phone, shared-visit redaction, offline/stale and render conservation. */
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, devices } from 'playwright';
const dir = await mkdtemp(join(tmpdir(), 'office-companion-'));
process.env.BUILDING_DB = join(dir, 'test.sqlite'); delete process.env.T3_LOCAL_DATA;
const { createServer } = await import('vite');
const server = await createServer({ server: { host: 'localhost', port: 0, hmr: false }, logLevel: 'error' });
let browser;
const probe = () => {
  window.__draws = 0; window.__contexts = 0;
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) for (const f of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
    const o = C.prototype[f]; if (o) C.prototype[f] = function (...a) { window.__draws++; return o.apply(this, a); };
  }
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, ...r) { if (/webgl/.test(t)) window.__contexts++; return gc.call(this, t, ...r); };
};
const ready = async (page) => { await page.waitForFunction(() => window.__ready, {}, { timeout: 90000 }); await page.evaluate(() => document.querySelector('.office-welcome')?.remove()); };
const noOverflow = (page, what) => page.evaluate(() => { const bad = [...document.querySelectorAll('.companion, .companion *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 || e.getBoundingClientRect().left < -1).map((e) => e.className); return { page: document.documentElement.scrollWidth > innerWidth, bad }; }).then((r) => assert.deepEqual(r, { page: false, bad: [] }, what + ' overflow'));
try {
  await server.listen(); const base = server.resolvedUrls.local[0];
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-webgl'] });
  const errors = [];

  // ---- desktop, own (demo) office
  for (const [label, ctxOpts] of [['desktop', { viewport: { width: 1280, height: 800 } }], ['phone', { ...devices['iPhone 13'] }]]) {
    const ctx = await browser.newContext({ ...ctxOpts, reducedMotion: 'reduce' }); await ctx.addInitScript(probe);
    const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(label + ': ' + e.message));
    await page.goto(base + '?source=demo&agents=6&weather=clear&time=12:00&lang=en'); await ready(page);
    assert.equal(await page.locator('.companion').count(), 0, label + ': original office is the default');
    assert.ok(await page.locator('#scene').isVisible());
    const launcher = page.locator('.companion-launcher'); await launcher.waitFor();
    const contexts = await page.evaluate(() => window.__contexts);
    await launcher.focus(); await launcher.press('Enter');
    const panel = page.locator('.companion'); await panel.waitFor();
    assert.equal(await page.evaluate(() => document.body.classList.contains('companion-open')), true);
    // summaries match the source and update with statuses
    await page.evaluate(() => { window.__source.update = () => {}; }); // freeze the demo simulation so the test drives statuses
    const expected = () => page.evaluate(() => { const c = { running: 0, waiting: 0, failed: 0, completed: 0, idle: 0 }; for (const t of window.__source.threads()) c[t.status]++; return c; });
    const shownCounts = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.companion-chip')].map((b) => [b.dataset.filter, Number(b.textContent.match(/(\d+)$/)[1])])));
    const e0 = await expected(); const s0 = await shownCounts();
    for (const k of Object.keys(e0)) assert.equal(s0[k], e0[k], `${label}: ${k} count`);
    assert.equal(s0.all, await page.evaluate(() => window.__source.threads().length));
    await page.evaluate(() => { const t = window.__source.threads(); t[0].status = 'failed'; t[1].status = 'waiting'; });
    await page.waitForFunction(() => /\d+ Failed/.test(document.querySelector('.companion-summary').textContent) && document.querySelector('[data-filter=failed]').textContent.endsWith(String(window.__source.threads().filter((t) => t.status === 'failed').length)));
    assert.ok(Number((await shownCounts()).failed) >= 1);
    await noOverflow(page, label + ' list');
    if(label==='phone'){await mkdir('shots',{recursive:true});await page.screenshot({path:'shots/companion-phone.png'});}
    // rendering conserved while the companion covers the scene
    await page.waitForTimeout(300); const d1 = await page.evaluate(() => window.__draws); await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => window.__draws), d1, label + ': no scene draws while companion is open');
    // filter, details, focus order and Escape
    await page.locator('[data-filter=failed]').click();
    const rows = page.locator('.companion-row'); assert.ok(await rows.count() >= 1);
    for (const s of await rows.evaluateAll((r) => r.map((x) => x.className))) assert.match(s, /s-failed/);
    const row = rows.first(); const id = await row.getAttribute('data-id'); await row.click();
    const detail = page.locator('.companion-detail'); await detail.waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.activeElement.className), 'companion-back');
    assert.match(await detail.innerText(), /Failed/);
    assert.match(await detail.innerText(), /Provider/); assert.ok(await page.locator('.companion-focus').isVisible());
    const box = await page.locator('.companion-focus').boundingBox(); assert.ok(box.height >= 44, 'touch target');
    await noOverflow(page, label + ' detail');
    if(label==='phone')for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.companion-detail')),true,'mobile detail trap excludes covered controls');}
    await page.keyboard.press('Escape'); assert.equal(await detail.isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.id), id, label + ': focus returns to the row');
    // focus trap: Tab never leaves the panel
    for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement.closest('.companion')), true); }
    // stale and offline from the freshness contract
    await page.evaluate(() => { window.__fresh = Date.now() - 20000; window.__source.freshness = () => ({ updatedAt: window.__fresh, offline: false }); });
    await page.waitForFunction(() => document.querySelector('.companion-fresh').classList.contains('is-stale'), {}, { timeout: 5000 });
    assert.ok(await rows.count() >= 1, 'stale keeps the last list, marked');
    await page.evaluate(() => { window.__source.freshness = () => ({ updatedAt: Date.now(), offline: true }); });
    await page.waitForFunction(() => document.querySelector('.companion-fresh').classList.contains('is-offline'), {}, { timeout: 5000 });
    assert.equal(await page.locator('.companion-row').count(), 0, 'offline clears agents');
    assert.equal(await page.locator('.companion-chip').first().innerText(), 'All 0');
    await page.evaluate(() => { delete window.__source.freshness; });
    await page.waitForFunction(() => document.querySelector('.companion-row, .companion-note'));
    // add-on contract: slot + app-tools event
    const slot = await page.evaluate(() => !!document.querySelector('.companion [data-companion-addons]'));
    assert.ok(slot);
    await page.evaluate(() => { window.__tools = 0; window.addEventListener('office-app-tools', () => window.__tools++); });
    await page.locator('.companion-tools').click(); assert.equal(await page.evaluate(() => window.__tools), 1);
    await page.locator('dialog.app-tools').waitFor({state:'visible'}); await page.keyboard.press('Escape'); assert.equal(await panel.isVisible(),true);
    // close restores the opener; inert state fully restored; no leaked canvas/context after cycles
    for (let i = 0; i < 4; i++) { await page.evaluate(() => window.dispatchEvent(new Event('office-companion-close'))); await launcher.click(); await page.locator('.companion').waitFor(); await page.locator('.companion-tools').click();await page.locator('dialog.app-tools').getByRole('button',{name:'Close',exact:true}).click();await page.locator('.companion-close').click(); await page.locator('.companion').waitFor({ state: 'detached' }); }
    assert.equal(await page.evaluate(() => document.activeElement.className.includes('companion-launcher')), true, label + ': focus restored to launcher');
    assert.equal(await page.evaluate(() => [...document.body.children].filter((n) => n.inert).length), 0);
    assert.deepEqual(await page.evaluate(() => ({ canvases: document.querySelectorAll('canvas').length > 0, contexts: window.__contexts })), { canvases: true, contexts }, label + ': no extra WebGL contexts');
    await page.waitForTimeout(400); const d2 = await page.evaluate(() => window.__draws); await page.waitForTimeout(400);
    assert.ok(await page.evaluate(() => window.__draws) > d2, label + ': scene draws resume');
    // focus action (last: it leaves the office on the agent close-up)
    await launcher.click(); await page.locator('.companion-row').first().click();
    await page.locator('.companion-focus').click();
    await panel.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.querySelector('#focus')?.children.length > 0 || document.querySelector('.focus-view'), {}, { timeout: 5000 });
    assert.equal(await page.evaluate(() => document.body.classList.contains('companion-open')), false);
    await ctx.close();
  }

  // ---- actual T3 adapter exercised solely with an intercepted synthetic wire snapshot.
  const localCtx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}), local=await localCtx.newPage();let wireMode='stale';
  await local.route('**/api/t3/**',route=>{
    if(!route.request().url().includes('/threads'))return route.fulfill({status:503,contentType:'application/json',body:'{"error":"synthetic unavailable"}'});
    if(wireMode==='fail')return route.fulfill({status:503,contentType:'application/json',body:'{"error":"synthetic failure"}'});
    return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,fetchedAt:new Date(Date.now()-(wireMode==='stale'?20000:0)).toISOString(),environmentId:'synthetic',webBase:'http://example.test',teams:[],threads:[],boss:null,totals:{runs:0,tokens:0,cost:0,queued:0,running:0,waiting:0}})});
  });
  await local.goto(base+'?source=t3&weather=clear');await ready(local);await local.locator('.companion-launcher').click();await local.locator('.companion-fresh.is-stale').waitFor();wireMode='live';await local.locator('.companion-fresh.is-live').waitFor();wireMode='fail';await local.locator('.companion-fresh.is-offline').waitFor();await localCtx.close();
  // ---- phone explicitly connects to its own published metadata; no private data endpoint or mandatory account flow.
  const remoteCtx=await browser.newContext({...devices['iPhone 13'],reducedMotion:'reduce'});
  const account=await remoteCtx.request.post(base+'api/building/register',{data:{handle:'companion_remote',name:'Remote',password:'synthetic-test-password'}});assert.equal(account.status(),201);const me=await account.json();
  await remoteCtx.request.post(base+'api/building/publish',{data:{agents:[{id:'remote-agent',provider:'codex',status:'waiting'}]}});
  const remote=await remoteCtx.newPage();await remote.goto(base+'?source=demo&agents=2&weather=clear');await ready(remote);await remote.locator('.companion-launcher').click();assert.match(await remote.locator('.companion-demo').innerText(),/simulated agents/);
  await remote.getByRole('button',{name:'Use my published agents',exact:true}).click();await remote.waitForURL(u=>u.searchParams.get('source')==='shared'&&u.searchParams.get('floor')===me.office.id);await ready(remote);await remote.locator('.companion').waitFor();await remote.locator('.companion-row').waitFor();assert.match(await remote.locator('.companion-row').innerText(),/Waiting/);assert.equal(await remote.locator('.companion-demo').count(),0);
  // Successful HTTP polling cannot label a stale published snapshot as live.
  let remoteOnline=true;await remote.route('**/api/building/offices/*',async route=>{const response=await route.fetch();const body=await response.json();body.office.online=remoteOnline;body.office.updatedAt=Date.now()-60000;await route.fulfill({response,json:body});});await remote.waitForResponse(r=>r.url().includes('/api/building/offices/')&&r.status()===200);await remote.locator('.companion-fresh.is-live').waitFor();assert.equal(await remote.locator('.companion-row').count(),1,'phone/server clock skew cannot hide a server-online office');remoteOnline=false;await remote.locator('.companion-fresh.is-offline').waitFor();assert.equal(await remote.locator('.companion-row').count(),0);await remoteCtx.close();

  // ---- shared visit: minimal contract only, offline clears
  const ctx = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push('shared: ' + e.message));
  const privateRequests = []; page.on('request', (r) => { if (/\/api\/(t3|board)/.test(r.url())) privateRequests.push(r.url()); });
  let mode = 'ok'; let statuses = ['running', 'waiting', 'failed'];
  await page.route('**/api/building/offices/synthetic-floor', (route) => {
    if (mode === 'fail') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"down"}' });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      office: { id: 'synthetic-floor', name: 'Friend', ownerName: 'Friend', isOwner: false, scope: 'activity', online: true, appearance: { theme: 'campus', layout: 'original', lighting: 'original' }, updatedAt: Date.now(), agentCount: 3, areas: [] },
      agents: statuses.map((status, i) => ({ id: 'a' + i, name: ['Ada', 'Bo', 'Cy'][i], provider: 'claude', status, area: 'frontend', title: 'SECRET-TITLE', prompt: 'SECRET-PROMPT', cost: 'SECRET-COST', transcript: 'SECRET-TRANSCRIPT', model: 'SECRET-MODEL', url: 'http://127.0.0.1:3773/SECRET' })),
    }) });
  });
  await page.goto(base + '?source=shared&floor=synthetic-floor&weather=clear&lang=en'); await ready(page);
  await page.locator('.companion-launcher').click(); await page.locator('.companion').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.companion-row').length === 3);
  await page.locator('.companion-row').nth(0).click();
  const text = await page.locator('.companion').innerText();
  assert.doesNotMatch(text, /SECRET/); assert.match(text, /Frontend/); assert.match(text, /status only/i);
  assert.doesNotMatch(await page.locator('.companion').innerHTML(), /SECRET|3773/);
  await page.keyboard.press('Escape');
  statuses = ['completed', 'idle', 'failed'];
  await page.waitForFunction(() => document.querySelector('[data-filter=completed]').textContent.endsWith('1'), {}, { timeout: 10000 });
  await noOverflow(page, 'shared');
  mode = 'fail';
  await page.waitForFunction(() => window.__source.freshness().offline, {}, { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('.companion-fresh')?.classList.contains('is-offline'), {}, { timeout: 5000 });
  assert.equal(await page.locator('.companion-row').count(), 0, 'shared offline clears agents');
  assert.doesNotMatch(await page.locator('.companion').innerText(), /Ada|Bo|Cy/);
  assert.deepEqual(privateRequests, [], 'no local T3/board endpoint requested in a shared visit');
  assert.deepEqual(errors, []);
  console.log('PASS: companion desktop+phone — default office, live counts, filter/detail/focus, Escape/focus restore/trap, stale/offline, app-tools slot, no overflow, draws paused while open and resumed, no extra WebGL contexts; shared visit redaction, offline clearing, no private endpoints.');
} finally { await browser?.close(); await server.close(); await rm(dir, { recursive: true, force: true }); }
