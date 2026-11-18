/** Make every public application build discoverable by the SW update lifecycle. No private/user data participates. */
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
const dir = 'dist';
const entries = await readdir(dir, { recursive: true, withFileTypes: true });
const assets = entries.filter(e => e.isFile()).map(e => join(e.parentPath, e.name)).filter(file => relative(dir, file) !== 'sw.js').sort();
const sw = await readFile(join(dir, 'sw.js'), 'utf8');
const hash = createHash('sha256').update(sw);
for (const file of assets) hash.update(relative(dir, file)).update(await readFile(file));
const version = hash.digest('hex').slice(0, 20);
if (!sw.includes("CACHE_PREFIX + 'v1'")) throw new Error('Missing SW version marker');
await writeFile(join(dir, 'sw.js'), sw.replace("CACHE_PREFIX + 'v1'", `CACHE_PREFIX + '${version}'`));
console.log(`Service worker stamped ${version}; public builds trigger optional update flow.`);
