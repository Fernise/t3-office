/** Real Chromium service-worker update: no mid-session takeover; an explicit click reloads once. Static/synthetic only. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
const dist = resolve('dist'), source = await readFile(resolve(dist, 'sw.js'), 'utf8');
let version = 1, browser;
const types = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json','.woff':'font/woff','.woff2':'font/woff2'};
const server = createServer(async (req, res) => {
 try {
  const path = new URL(req.url, 'http://local').pathname;
  res.setHeader('Cache-Control', 'no-store');
  if (path.startsWith('/api/')) { res.writeHead(path.endsWith('/auth/providers') ? 200 : 401, {'Content-Type':'application/json'}); return res.end(path.endsWith('/auth/providers') ? '{"github":false}' : '{"error":"synthetic signed out"}'); }
  if (path === '/sw.js') { res.setHeader('Content-Type','application/javascript'); return res.end(source.replace(/const CACHE = .*;/, `const CACHE = 't3-office-static-test-${version}';`)); }
  const file = resolve(dist, '.' + (path === '/' ? '/index.html' : path));
  if (!file.startsWith(dist + '/')) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');res.end(await readFile(file));
 } catch { res.writeHead(404);res.end(); }
});
try {
 await new Promise(r => server.listen(0, '127.0.0.1', r));
 const base = `http://127.0.0.1:${server.address().port}/?source=demo&agents=2&weather=clear`;
 browser = await chromium.launch({args:['--use-angle=swiftshader','--enable-webgl']});
 const context = await browser.newContext({viewport:{width:390,height:844}});
 const page = await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 const second=await page.context().newPage();second.on('pageerror',e=>errors.push(e.message));await second.goto(base);await second.waitForFunction(()=>!!navigator.serviceWorker.controller);const secondBefore=await second.evaluate(()=>performance.timeOrigin);
 const before = await page.evaluate(()=>performance.timeOrigin);
 version = 2;await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});
 await page.locator('.app-update').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>performance.timeOrigin),before,'new worker waits without interrupting the office');
 await page.locator('.app-update').getByRole('button',{name:'Reload to update',exact:true}).click();
 await page.waitForFunction(t=>performance.timeOrigin!==t,before);await page.waitForLoadState('load');
 assert.equal(await page.locator('.app-update').count(),0,'update banner clears after explicit reload');
 await second.waitForTimeout(200);assert.equal(await second.evaluate(()=>performance.timeOrigin),secondBefore,'another tab never reloads without its own consent');
 await second.locator('.app-update').getByRole('button',{name:'Reload to update',exact:true}).click();await second.waitForFunction(t=>performance.timeOrigin!==t,secondBefore);await second.waitForLoadState('load');
 assert.deepEqual(await page.evaluate(()=>caches.keys()),['t3-office-static-test-2'],'obsolete app cache removed');
 assert.deepEqual(errors,[]);
 console.log('PASS: real browser update waits, explicit reload takes over, banner clears and old public cache is removed; other tabs wait for their own consent.');
} finally {await browser?.close();await new Promise(r=>server.close(r));}
