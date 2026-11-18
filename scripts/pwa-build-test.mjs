/** Public-only artifact changes must all trigger a discoverable service-worker update. Disposable fixture only. */
import assert from 'node:assert/strict';import{mkdtemp,mkdir,readFile,writeFile,rm}from'node:fs/promises';import{join,resolve}from'node:path';import{tmpdir}from'node:os';import{execFileSync}from'node:child_process';
const dir=await mkdtemp(join(tmpdir(),'office-sw-version-')),script=resolve('scripts/stamp-service-worker.mjs');
try {
 await mkdir(join(dir,'dist/icons'),{recursive:true});await mkdir(join(dir,'dist/assets'));await writeFile(join(dir,'dist/index.html'),'initial');await writeFile(join(dir,'dist/icons/icon.png'),'initial-icon');await writeFile(join(dir,'dist/assets/app.js'),'initial-code');
 const stamp=async()=>{await writeFile(join(dir,'dist/sw.js'),"const CACHE_PREFIX = 'test-'; const CACHE = CACHE_PREFIX + 'v1';");execFileSync(process.execPath,[script],{cwd:dir,stdio:'ignore'});return readFile(join(dir,'dist/sw.js'),'utf8');};
 const first=await stamp();assert.equal(await stamp(),first,'identical public builds have a stable version');await writeFile(join(dir,'dist/index.html'),'new-page');const page=await stamp();assert.notEqual(page,first,'HTML-only change updates worker');await writeFile(join(dir,'dist/icons/icon.png'),'new-icon');const icon=await stamp();assert.notEqual(icon,page,'icon-only change updates worker');await writeFile(join(dir,'dist/assets/app.js'),'new-code');assert.notEqual(await stamp(),icon,'JS change updates worker');
 console.log('PASS: service-worker build version is stable and changes for HTML, icons or JS alone.');
}finally{await rm(dir,{recursive:true,force:true});}
