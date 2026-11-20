#!/usr/bin/env node
/**
 * One-command home publishing: `npm run home -- --server https://your-building.example`
 *
 * Starts a private, loopback-only reader for this computer's T3 Code data, then publishes only anonymous agent IDs,
 * provider and status to your office with your publisher key, every 10 seconds, until you press Ctrl+C (which clears
 * your shared activity). Titles, prompts, paths, messages, costs and tool output never leave this computer.
 *
 * The key is asked once (hidden input) and saved to ~/.config/t3-office/publisher.key, readable only by you.
 * `--check` runs every step once and explains anything that needs fixing. `--new-key` replaces the saved key.
 */
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, chmod, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { filterSnapshot, validateEndpoints, publishAgents } from './bridge.mjs';

export const DEFAULT_KEY_FILE = join(homedir(), '.config', 't3-office', 'publisher.key');
export const KEY_PATTERN = /^[\w-]{43}$/;
const INTERVAL_MS = 10_000;

/** Plain-language meaning of a publish answer. `fatal` stops the command; anything else is retried. */
export function explainPublish(status) {
  if (status >= 200 && status < 300) return { ok: true, fatal: false, message: 'Published.' };
  if (status === 401) return { ok: false, fatal: true, message: 'Your key was not accepted: it was revoked, expired or belongs to another server. Create a new key in Sharing → Home computer, then run this command again with --new-key.' };
  if (status === 409) return { ok: false, fatal: false, message: 'Sharing is paused for your office. Resume sharing in Friends & characters → Sharing; this command keeps trying.' };
  if (status === 429) return { ok: false, fatal: false, message: 'The server asked to slow down. Retrying shortly.' };
  if (status === 503) return { ok: false, fatal: false, message: 'The office is closed for maintenance right now. Retrying shortly.' };
  return { ok: false, fatal: false, message: `The server refused this update (HTTP ${status}). Retrying shortly.` };
}

export async function loadKey(file) {
  try { const key = (await readFile(file, 'utf8')).trim(); return KEY_PATTERN.test(key) ? key : null; } catch { return null; }
}
/** Saves the key so only this user can read it (directory 0700, file 0600). */
export async function saveKey(file, key) {
  if (!KEY_PATTERN.test(key)) throw new Error('That does not look like a publisher key (43 letters, digits, - or _). Copy it again from Sharing → Home computer.');
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, key + '\n', { mode: 0o600 });
  await chmod(file, 0o600);
}
export async function keyIsPrivate(file) {
  if (process.platform === 'win32') return true;
  try { return ((await stat(file)).mode & 0o077) === 0; } catch { return false; }
}

/** Hidden terminal prompt for the key (nothing is echoed). */
async function promptKey() {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) throw new Error('No publisher key saved yet. Run this command in a terminal so it can ask for the key, or pass --key-file.');
  stdout.write('Paste the publisher key from Friends & characters → Sharing → Home computer (input hidden), then press Enter: ');
  stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
  return await new Promise((resolve, reject) => {
    let value = '';
    const done = (fn) => { stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); stdout.write('\n'); fn(); };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return done(() => resolve(value.trim()));
        if (ch === '\u0003') return done(() => reject(new Error('Cancelled.')));
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1); else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

/**
 * Private reader for this computer's T3 Code data, bound to 127.0.0.1 on a free port. Mounts the same `/api/t3`
 * handlers the local office uses (no Vite, no web pages, nothing else).
 */
export async function startLocalReader() {
  process.env.T3_LOCAL_DATA = '1';
  const { t3Api } = await import('../server/t3.ts');
  const handlers = [];
  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    const hit = handlers.find(([prefix]) => url === prefix || url.startsWith(prefix + '/') || url.startsWith(prefix + '?'));
    if (!hit || req.method !== 'GET') { res.statusCode = 404; res.end('{}'); return; }
    req.url = url.slice(hit[0].length) || '/';
    hit[1](req, res, () => { res.statusCode = 404; res.end('{}'); });
  });
  const plugin = t3Api();
  const hook = plugin.configureServer;
  (typeof hook === 'function' ? hook : hook.handler)({ httpServer: server, middlewares: { use: (prefix, fn) => handlers.push([prefix, fn]) } });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}/`, close: () => new Promise((r) => server.close(() => r())) };
}

/** Reads local agents; never invents data. `available:false` means T3 Code could not be read right now. */
export async function readLocal(source, salt, fetcher = fetch) {
  try {
    const response = await fetcher(new URL('/api/t3/threads?hours=12&seats=6', source), { signal: AbortSignal.timeout(10_000), redirect: 'error' });
    if (!response.ok) return { available: false, agents: [] };
    return { available: true, agents: filterSnapshot(await response.json(), salt) };
  } catch { return { available: false, agents: [] }; }
}
export async function serverReachable(server, fetcher = fetch) {
  try { const r = await fetcher(new URL('/api/building/auth/providers', server), { signal: AbortSignal.timeout(10_000), redirect: 'error' }); return r.ok; } catch { return false; }
}
/** One full step: read T3 Code, publish, explain. Network trouble is reported, never fatal. */
export async function step({ server, source, token, salt, fetcher = fetch }) {
  const local = await readLocal(source, salt, fetcher);
  let status;
  try { status = await publishAgents({ server, token, agents: local.agents, fetcher }); }
  catch { return { ok: false, fatal: false, local, message: 'Could not reach the building server. Check the Internet connection; retrying shortly.' }; }
  const result = explainPublish(status);
  return { ...result, local, status };
}
const describeLocal = (local) => local.available ? `${local.agents.length} agent${local.agents.length === 1 ? '' : 's'} from T3 Code` : 'T3 Code not found on this computer (is it running?), so no agents are shown';

async function main(args) {
  if (args.includes('--help')) {
    console.log('Usage: npm run home -- --server https://your-building.example [--check] [--new-key] [--key-file path]');
    console.log('Publishes anonymous agent status from this computer to your office until you press Ctrl+C. --check runs every step once.');
    return;
  }
  const value = (name) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined; };
  const serverText = value('--server') ?? process.env.OFFICE_SERVER;
  if (!serverText) throw new Error('Tell me which building to publish to, for example: npm run home -- --server https://your-building.example (Sharing → Home computer shows the exact command).');
  const keyFile = value('--key-file') ?? DEFAULT_KEY_FILE;
  const check = args.includes('--check');

  const { server } = validateEndpoints(serverText.replace(/\/+$/, '') + '/', 'http://127.0.0.1:1/');
  const ok = (text) => console.log(`✓ ${text}`), bad = (text) => console.log(`✗ ${text}`);

  let token = args.includes('--new-key') ? null : await loadKey(keyFile);
  if (!token) { token = await promptKey(); await saveKey(keyFile, token); ok(`Key saved privately to ${keyFile}`); }
  else if (!await keyIsPrivate(keyFile)) { await chmod(keyFile, 0o600); ok('Key file permissions tightened to owner-only.'); }

  if (!await serverReachable(server)) { bad(`Cannot reach ${server.origin}. Check the address and your Internet connection.`); process.exitCode = 1; return; }
  ok(`Building server reachable: ${server.origin}`);

  const reader = await startLocalReader();
  const salt = createHmac('sha256', token).update('t3-office character identities v1').digest();
  let stopped = false;
  const stop = () => { stopped = true; };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const first = await step({ server, source: reader.url, token, salt });
    (first.local.available ? ok : bad)(describeLocal(first.local));
    if (first.fatal) { bad(first.message); process.exitCode = 1; return; }
    if (!first.ok) bad(first.message); else ok('Your office accepted the update. Open Sharing → Home computer to see it connected.');
    console.log('Only anonymous IDs, provider and status are sent. No titles, prompts, paths, messages, costs or tool output.');
    if (check) { if (!first.ok) process.exitCode = 1; return; }
    console.log('Publishing every 10 seconds. Keep this window open; press Ctrl+C to stop and clear your shared activity.');
    let lastLine = '';
    while (!stopped) {
      for (let i = 0; i < INTERVAL_MS / 1000 && !stopped; i++) await new Promise((r) => setTimeout(r, 1000));
      if (stopped) break;
      const r = await step({ server, source: reader.url, token, salt });
      const line = r.ok ? `${new Date().toLocaleTimeString()} · published ${describeLocal(r.local)}` : `${new Date().toLocaleTimeString()} · ${r.message}`;
      if (process.stdout.isTTY) process.stdout.write(`\r\x1b[2K${line}`); else if (line !== lastLine) console.log(line);
      lastLine = line;
      if (r.fatal) { console.log(''); process.exitCode = 1; return; }
    }
  } finally {
    if (stopped) { await publishAgents({ server, token, agents: [] }).catch(() => {}); console.log('\nStopped. Your shared activity was cleared.'); }
    await reader.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(`✗ ${error.message}`); process.exitCode = 1; });
}
