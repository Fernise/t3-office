/** Restore drill with data: builds a synthetic trial-like D1 (accounts, invitation/grant, room style, publication, character), exports it exactly like the real backup, then runs the restore check with exact expected counts. Disposable; no live data. */
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const W = resolve('node_modules/.bin/wrangler'), env = { ...process.env, CI: '1' };
const dir = await mkdtemp(join(tmpdir(), 'office-synth-')), out = join(dir, 'synthetic-backup.sql');
const port = 8900 + Math.floor(Math.random() * 90), origin = `http://localhost:${port}`;
let dev;
// `d1 export --local` only reads the config's default local state, so the drill uses its own copy of the config in the
// throwaway folder: that keeps the real local development database untouched.
const config = JSON.parse(await readFile('cloud/wrangler.jsonc', 'utf8'));
config.main = resolve('cloud/worker.ts'); config.assets = { ...config.assets, directory: resolve('dist') }; config.d1_databases[0].migrations_dir = resolve('cloud/migrations'); delete config.env;
const C = join(dir, 'wrangler.jsonc'); await writeFile(C, JSON.stringify(config));
try {
  execFileSync(W, ['d1', 'migrations', 'apply', 'office-permissions-local', '--local', '--config', C], { stdio: 'ignore', env });
  dev = spawn(W, ['dev', '--local', '--config', C, '--ip', 'localhost', '--port', String(port), '--var', `APP_ORIGIN:${origin}`, '--show-interactive-dev-session=false', '--log-level', 'error'], { stdio: 'ignore', env });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(origin + '/api/building/auth/providers')).ok) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  const jar = () => ({ c: '' });
  const call = async (j, path, body, headers = {}) => {
    const r = await fetch(origin + '/api/building' + path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}), ...(j.c ? { Cookie: j.c } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const set = r.headers.getSetCookie().find((x) => x.startsWith('office_cloud_session=')); if (set) j.c = set.split(';')[0];
    if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json();
  };
  const a = jar(), b = jar();
  await call(a, '/register', { handle: 'synth_a', name: 'Synth A', password: 'synthetic-restore-pass' });
  await call(b, '/register', { handle: 'synth_b', name: 'Synth B', password: 'synthetic-restore-pass' });
  await call(a, '/office', { appearance: { theme: 'loft', layout: 'lounge', lighting: 'warm' } });
  const inv = await call(a, '/invites', { scope: 'activity' }); await call(b, '/accept', { token: inv.token });
  const key = await call(a, '/publisher-tokens', {});
  await call(jar(), '/publish', { agents: [{ id: 'syn1', provider: 'codex', status: 'running' }] }, { Authorization: 'Bearer ' + key.token });
  await call(a, '/characters/syn1', { name: 'Restored', area: 'design' });
  dev.kill('SIGTERM'); dev = undefined; await new Promise((r) => setTimeout(r, 800));
  try { execFileSync(W, ['d1', 'export', 'office-permissions-local', '--local', '--config', C, '--output', out], { encoding: 'utf8', env }); } catch (e) { console.error(String(e.stdout ?? '').slice(-800), String(e.stderr ?? '').slice(-800)); throw e; }
  execFileSync('node', ['scripts/cloud-restore-check.mjs', '--backup', out, '--no-remote', '--expect', 'users=2,offices=2,grants=1,appearance=1,characters=1,publisher_tokens=1', '--login', 'synth_b:synthetic-restore-pass'], { stdio: 'inherit', env });
} finally {
  dev?.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 300));
  await rm(dir, { recursive: true, force: true });
}
