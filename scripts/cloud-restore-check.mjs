/**
 * Proves a trial backup can be restored: loads the newest (or given) D1 export into a throwaway local database, checks
 * SQLite integrity and foreign keys, compares per-table row counts with the live database (counts only, never data),
 * boots the real Worker on the restored copy and checks it answers, then deletes the copy.
 *
 * Usage: npm run cloud:trial:restore-check [-- --backup .local/backups/<file>.sql] [--no-remote] [--expect users=2,offices=2]
 * Needs `wrangler login` for the live comparison. Prints table names and counts only.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const WRANGLER = './node_modules/.bin/wrangler', CONFIG = 'cloud/wrangler.jsonc';
/** Tables whose rows only change through people (not every few seconds): a mismatch here means the backup is incomplete. */
const STABLE = ['users', 'offices', 'external_identities', 'grants', 'appearance'];
const problems = [];
const run = (cmd, a, extra = {}) => execFileSync(cmd, a, { encoding: 'utf8', env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' }, maxBuffer: 64 * 1024 * 1024, ...extra });
const query = (sql, where) => {
  const out = run(WRANGLER, ['d1', 'execute', where === 'remote' ? 't3-office-trial' : 'office-permissions-local', ...(where === 'remote' ? ['--remote', '--env', 'trial'] : ['--local', '--persist-to', where]), '--config', CONFIG, '--json', '--command', sql]);
  return JSON.parse(out.slice(out.indexOf('['))).flatMap((r) => r.results ?? []);
};

const backup = opt('--backup') ?? await (async () => {
  const dir = '.local/backups', files = (await readdir(dir)).filter((f) => f.endsWith('.sql'));
  const dated = await Promise.all(files.map(async (f) => ({ f: join(dir, f), t: (await stat(join(dir, f))).mtimeMs })));
  const newest = dated.sort((a, b) => b.t - a.t)[0]; if (!newest) throw new Error('No backups in .local/backups. Run npm run cloud:trial:backup first.');
  return newest.f;
})();
const dir = await mkdtemp(join(tmpdir(), 'office-restore-'));
let worker;
try {
  console.log(`Restoring ${backup} (${(await stat(backup)).size} bytes) into a throwaway local database…`);
  run(WRANGLER, ['d1', 'execute', 'office-permissions-local', '--local', '--persist-to', dir, '--config', CONFIG, '--file', backup, '--yes']);
  const tables = query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name", dir).map((r) => r.name);
  // D1 allows quick_check (not integrity_check): page structure and indexes, without the slow cross-index pass.
  const integrity = query('PRAGMA quick_check', dir)[0]?.quick_check;
  let fk = []; try { fk = query('PRAGMA foreign_key_check', dir); } catch { problems.push('foreign_key_check unavailable'); }
  const migrations = query('SELECT name FROM d1_migrations ORDER BY id', dir).map((r) => r.name);
  if (integrity !== 'ok') problems.push(`quick_check: ${integrity}`);
  if (fk.length) problems.push(`${fk.length} foreign-key problems`);
  const local = Object.fromEntries(tables.map((t) => [t, Number(query(`SELECT COUNT(*) AS n FROM "${t}"`, dir)[0].n)]));
  console.log(`✓ ${tables.length} tables, integrity ${integrity}, ${fk.length} foreign-key problems, last migration ${migrations.at(-1) ?? 'none'}`);
  const expected = (await readdir('cloud/migrations')).filter((f) => f.endsWith('.sql')).sort();
  const missing = expected.filter((m) => !migrations.includes(m));
  if (missing.length) console.log(`! Backup predates migrations: ${missing.join(', ')} (expected for older backups; restore, then apply them)`);

  // --expect users=2,offices=2: exact counts a known (synthetic) backup must restore to.
  for (const pair of (opt('--expect') ?? '').split(',').filter(Boolean)) { const [t, n] = pair.split('='); if (local[t] !== Number(n)) problems.push(`${t}: expected ${n} rows, restored ${local[t]}`); }
  if (opt('--expect')) console.log(`✓ Expected counts checked: ${opt('--expect')}`);
  if (!args.includes('--no-remote')) {
    const remote = Object.fromEntries(tables.map((t) => { try { return [t, Number(query(`SELECT COUNT(*) AS n FROM "${t}"`, 'remote')[0].n)]; } catch { return [t, null]; } }));
    const rows = tables.map((t) => [t, local[t], remote[t]]);
    for (const [t, l, r] of rows) if (STABLE.includes(t) && r !== null && l !== r) problems.push(`${t}: backup ${l} rows, live ${r}`);
    console.log('Table counts (backup → live):\n' + rows.map(([t, l, r]) => `  ${STABLE.includes(t) ? '*' : ' '} ${t.padEnd(22)} ${String(l).padStart(5)} → ${r === null ? '   n/a' : String(r).padStart(5)}`).join('\n') + '\n  (* must match; others change on their own: sessions, limits, presence, logs)');
  }

  // Boot the real Worker on the restored copy: schema and data must be usable, not just loadable.
  const port = 8800 + Math.floor(Math.random() * 100), origin = `http://localhost:${port}`;
  worker = spawn(WRANGLER, ['dev', '--local', '--config', CONFIG, '--persist-to', dir, '--ip', 'localhost', '--port', String(port), '--var', `APP_ORIGIN:${origin}`, '--show-interactive-dev-session=false', '--log-level', 'error'], { stdio: 'ignore', env: { ...process.env, CI: '1' } });
  let up = false; for (let i = 0; i < 120 && !up; i++) { try { up = (await fetch(origin + '/api/building/auth/providers')).ok; } catch { /* starting */ } if (!up) await new Promise((r) => setTimeout(r, 500)); }
  if (!up) problems.push('Worker did not start on the restored database');
  else {
    const session = (await fetch(origin + '/api/building/session')).status, floors = (await fetch(origin + '/api/building/floors')).status;
    if (session !== 401 || floors !== 401) problems.push(`restored Worker answered session ${session}, floors ${floors} (expected 401 anonymous)`);
    else console.log('✓ The Worker starts on the restored copy and answers normally.');
    // --login handle:password (synthetic drills only): a restored account signs in and sees its office.
    const login = opt('--login');
    if (login) {
      const [handle, password] = login.split(':');
      const r = await fetch(origin + '/api/building/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ handle, password }) });
      const cookie = r.headers.getSetCookie().find((c) => c.startsWith('office_cloud_session='))?.split(';')[0];
      const floors = cookie ? await (await fetch(origin + '/api/building/floors', { headers: { Cookie: cookie } })).json() : null;
      if (r.status !== 200 || !floors?.floors?.length) problems.push(`restored account could not sign in (${r.status})`);
      else console.log(`✓ A restored account signs in and sees ${floors.floors.length} floor(s).`);
    }
  }
} finally {
  worker?.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 500));
  await rm(dir, { recursive: true, force: true });
}
if (problems.length) { console.error('✗ Restore check failed:\n - ' + problems.join('\n - ')); process.exitCode = 1; }
else console.log(`PASS: backup ${backup} restores completely; throwaway copy deleted.`);
