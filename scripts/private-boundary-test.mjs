/** Vite must fail closed before SPA fallback, regardless of whether a private file exists. Synthetic database only. */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const dir=await mkdtemp(join(tmpdir(),'office-private-boundary-'));
process.env.BUILDING_DB=join(dir,'test.sqlite');delete process.env.T3_LOCAL_DATA;delete process.env.OFFICE_GITHUB_LOGIN;
const {createServer}=await import('vite');const server=await createServer({server:{host:'localhost',port:0,hmr:false},logLevel:'error'});
try {
 await server.listen();const base=server.resolvedUrls.local[0];
 for(const path of['.local/nonexistent-synthetic.sqlite','%2elocal/nonexistent-synthetic.sqlite','.env.synthetic','nested/.private-synthetic','@fs/synthetic/.local/test.sqlite']){
  const r=await fetch(base+path);assert.equal(r.status,403,path);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('content-type'),/json/);
 }
 for(const path of['api/t3/status','api/t3/threads','api/board'])assert.equal((await fetch(base+path)).status,404,path);
 const main=await fetch(base+'src/main.ts');assert.equal(main.status,200);const code=await main.text();
 const optimized=[...code.matchAll(/"(\/node_modules\/\.vite\/deps\/[^"]+)"/g)].map(m=>m[1]);assert.ok(optimized.length,'main has optimized public imports');for(const path of optimized)assert.equal((await fetch(new URL(path,base))).status,200,path);
 assert.equal((await fetch(base+'node_modules/.vite/deps/_metadata.json')).status,403);
 assert.equal((await fetch(base)).status,200);assert.equal((await fetch(base+'manifest.webmanifest')).status,200);assert.equal((await fetch(base+'sw.js')).status,200);
 console.log('PASS: private dot paths and encoded/nonexistent private files fail closed before SPA fallback; private APIs stay disabled and public app files load.');
} finally {await server.close();await rm(dir,{recursive:true,force:true});}
