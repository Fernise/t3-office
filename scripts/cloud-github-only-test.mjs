/** GitHub-only building (trial settings: GitHub configured, password sign-up closed), production build on the local Worker. Both sign-in screens offer GitHub with recovery help and no password form; GitHub itself is intercepted (no network). */
import assert from 'node:assert/strict'; import { spawn, execFileSync } from 'node:child_process'; import { mkdtemp, rm, access } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
const port = 8700 + Math.floor(Math.random() * 90), base = `http://localhost:${port}/`, wrangler = './node_modules/.bin/wrangler', config = 'cloud/wrangler.jsonc';
await access('dist/index.html').catch(() => { throw new Error('Run npm run build first; the Worker serves dist/.'); });
const dir = await mkdtemp(join(tmpdir(), 'office-github-only-')); let worker, browser; const errors = []; let count = 0;
try {
  execFileSync(wrangler, ['d1', 'migrations', 'apply', 'office-permissions-local', '--local', '--config', config, '--persist-to', dir], { stdio: 'ignore', env: { ...process.env, CI: '1' } });
  worker = spawn(wrangler, ['dev', '--local', '--config', config, '--persist-to', dir, '--ip', 'localhost', '--port', String(port), '--var', `APP_ORIGIN:http://localhost:${port}`, '--var', 'GITHUB_CLIENT_ID:synthetic-client', '--var', 'GITHUB_CLIENT_SECRET:synthetic-secret', '--var', 'ALLOW_PASSWORD_SIGNUP:0', '--show-interactive-dev-session=false', '--log-level', 'error'], { stdio: 'ignore', env: { ...process.env, CI: '1' } });
  for (let i = 0; ; i++) { try { if ((await fetch(base)).ok) break; } catch { /* starting */ } if (i > 120) throw new Error('Worker did not start'); await new Promise((r) => setTimeout(r, 500)); }
  assert.deepEqual(await (await fetch(base + 'api/building/auth/providers')).json(), { github: true, passwordSignup: false });
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-webgl'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' });
  let reachedGitHub = '';
  await ctx.route('https://github.com/**', (route) => { reachedGitHub = route.request().url(); return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>synthetic GitHub</p>' }); });

  // Friends & characters (standalone page): GitHub button, recovery help, no password form; the button reaches GitHub's authorize page.
  const menu = await ctx.newPage(); menu.on('pageerror', (e) => errors.push('menu: ' + e.message));
  await menu.goto(base + '?view=friends&lang=en');
  await menu.locator('[data-action=github-start]').waitFor({ timeout: 20000 });
  assert.equal(await menu.locator('#auth-form').count(), 0, 'no password form on a GitHub-only building');
  assert.equal(await menu.locator('[data-action=auth-mode]').count(), 0);
  assert.match(await menu.locator('#panel, main, body').first().innerText(), /Lost access\? Sign in with GitHub again/);
  await menu.locator('[data-action=github-start]').click();
  await menu.waitForURL((u) => u.hostname === 'github.com', { timeout: 20000 });
  const auth = new URL(reachedGitHub); assert.equal(auth.pathname, '/login/oauth/authorize'); assert.equal(auth.searchParams.get('client_id'), 'synthetic-client');
  assert.equal(auth.searchParams.get('redirect_uri'), base + 'api/building/auth/github/callback'); count++;

  // People & chat panel in the office: same message, GitHub button, no password form.
  const office = await ctx.newPage(); office.on('pageerror', (e) => errors.push('office: ' + e.message));
  await office.goto(base + '?source=demo&agents=2&weather=clear&lang=en'); await office.waitForFunction(() => window.__ready, {}, { timeout: 90000 });
  await office.evaluate(() => document.querySelector('.office-welcome')?.remove());
  await office.locator('.human-launcher').click(); await office.locator('.human-panel').waitFor();
  await office.locator('.human-panel [data-tab=avatar]').click();
  await office.locator('[data-human=github-start]').waitFor({ timeout: 20000 });
  await office.waitForFunction(() => /This building uses GitHub sign-in/.test(document.querySelector('.human-panel')?.textContent ?? ''), null, { timeout: 20000 });
  assert.equal(await office.locator('.human-auth').count(), 0, 'no password form in People & chat either');
  assert.match(await office.locator('.human-panel').innerText(), /Lost access\?/); count++;

  assert.deepEqual(errors, []);
  console.log(`PASS: ${count} GitHub-only sign-in scenarios on the Worker: friends screen and People & chat offer GitHub with recovery help and no password form; the friends screen reaches GitHub's authorize page with the right client and callback.`);
} finally { await browser?.close(); worker?.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 500)); await rm(dir, { recursive: true, force: true }); }
