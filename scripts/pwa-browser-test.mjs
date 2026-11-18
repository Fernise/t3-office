/** Production build served by the local Worker/D1 in real Chromium: installability metadata, service worker, cache exclusions, offline notice, opt-in dialog without automatic prompts, denied state. Synthetic only. */
import assert from'node:assert/strict';import{spawn,execFileSync}from'node:child_process';import{mkdtemp,rm,access,mkdir}from'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';import{chromium}from'playwright';
const port=Number(process.env.PWA_UI_PORT??8793),base=`http://localhost:${port}/`,wrangler='./node_modules/.bin/wrangler',config='cloud/wrangler.jsonc';
await access('dist/sw.js').catch(()=>{throw new Error('Run npm run build first; the Worker serves dist/.');});
const dir=await mkdtemp(join(tmpdir(),'office-pwa-ui-'));let worker,browser;const log=[],errors=[];
try{
 execFileSync(wrangler,['d1','migrations','apply','office-permissions-local','--local','--config',config,'--persist-to',dir],{stdio:'ignore',env:{...process.env,CI:'1'}});
 worker=spawn(wrangler,['dev','--local','--config',config,'--persist-to',dir,'--ip','localhost','--port',String(port),'--var',`APP_ORIGIN:http://localhost:${port}`,'--show-interactive-dev-session=false','--log-level','warn'],{stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'1'}});
 worker.stdout.on('data',d=>log.push(String(d)));worker.stderr.on('data',d=>log.push(String(d)));
 for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>120)throw new Error('Worker did not start:\n'+log.join(''));await new Promise(r=>setTimeout(r,500));}
 // Public files are served with sane types; private/dot paths are not.
 const manifestRes=await fetch(base+'manifest.webmanifest');assert.equal(manifestRes.status,200);assert.match(manifestRes.headers.get('content-type')??'',/json|manifest/);
 const sw=await fetch(base+'sw.js');assert.equal(sw.status,200);assert.match(sw.headers.get('content-type')??'',/javascript/);assert.equal((await fetch(base+'offline.html')).status,200);
 for(const p of['.env','.local/building.sqlite','api/t3/threads','api/building/push/config'])assert.ok([401,404].includes((await fetch(base+p)).status),p);
 browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-webgl']});
 const context=await browser.newContext({viewport:{width:900,height:800},reducedMotion:'reduce'});
 // Count anything that would prompt or subscribe; stub only the browser permission UI (headless cannot show it).
 await context.addInitScript(()=>{window.__asked=0;window.__subscribed=0;let perm='default';Object.defineProperty(Notification,'permission',{get:()=>perm,configurable:true});Notification.requestPermission=async()=>{window.__asked++;perm=window.__answer??'denied';return perm;};
  if(window.PushManager)PushManager.prototype.subscribe=async function(){window.__subscribed++;throw new Error('blocked in test');};});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'?source=demo&agents=2&weather=clear');await page.waitForFunction(()=>window.__ready,{},{timeout:90000});
 assert.equal(await page.locator('link[rel=manifest]').getAttribute('href'),'/manifest.webmanifest');
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller||true);
 await page.reload();await page.waitForFunction(()=>window.__ready&&!!navigator.serviceWorker.controller,{},{timeout:90000});
 assert.deepEqual(await page.evaluate(()=>[window.__asked,window.__subscribed]),[0,0],'no prompt or subscription on load');
 assert.equal(await page.locator('dialog.app-tools').count(),0,'the office stays the home screen; the dialog is created only on request');
 // Private traffic never reaches the cache.
 await page.evaluate(async()=>{await fetch('/api/building/session').catch(()=>{});await fetch('/api/building/floors').catch(()=>{});});
 const cached=await page.evaluate(async()=>{const out=[];for(const k of await caches.keys()){const c=await caches.open(k);for(const r of await c.keys())out.push(new URL(r.url).pathname);}return out;});
 assert.ok(cached.length>0&&cached.every(p=>/^\/(assets\/|icons\/|manifest\.webmanifest|offline\.html)/.test(p)),'cache holds only public static files: '+cached.join(','));
 // Dialog opens only via the event; signed out, "Turn on" explains and does not prompt.
 await page.evaluate(()=>dispatchEvent(new Event('office-app-tools')));const dlg=page.locator('dialog.app-tools');await dlg.waitFor({state:'visible'});
 assert.match(await dlg.innerText(),/App & alerts/);assert.match(await dlg.innerText(),/needs a connection/);
 for(const size of[{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(size);const box=await dlg.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=size.width&&box.y+box.height<=size.height,'App tools stay inside phone viewport');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.setViewportSize({width:390,height:844});await mkdir('shots',{recursive:true});await page.screenshot({path:'shots/app-tools-phone.png'});
 await dlg.getByRole('button',{name:'Turn on alerts'}).click();await dlg.locator('[role=status]').filter({hasText:'Sign in first'}).waitFor();assert.equal(await page.evaluate(()=>window.__asked),0,'no browser prompt while signed out');
 // Signed in: a denied prompt leaves alerts off and creates no subscription.
 const reg=await page.evaluate(async()=>{const r=await fetch('/api/building/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({handle:'pwa_user',name:'Pwa',password:'synthetic-pwa-password'})});return r.status;});assert.equal(reg,201);
 await dlg.getByRole('button',{name:'Turn on alerts'}).click();await dlg.locator('[role=status]').filter({hasText:/blocked|denied|not granted/i}).waitFor();
 assert.deepEqual(await page.evaluate(()=>[window.__asked,window.__subscribed]),[1,0]);assert.equal(await page.evaluate(async()=>(await (await fetch('/api/building/push/config')).json()).subscriptions),0);
 assert.equal(await page.evaluate(()=>localStorage.getItem('office.alerts')),null);
 await page.keyboard.press('Escape');assert.equal(await dlg.isVisible(),false);
 // Offline (the Worker is stopped; Playwright's offline switch does not reach service-worker requests): navigation shows the static notice, never office data.
 worker.kill('SIGTERM');await new Promise(r=>setTimeout(r,1500));const off=await context.newPage();await off.goto(base+'?view=friends').catch(()=>{});assert.match(await off.locator('body').innerText(),/You're offline/);assert.ok(!/api\/building/.test(await off.content()));
 assert.deepEqual(errors,[]);
 console.log('PASS: PWA browser: manifest link, Worker-served worker/manifest, SW controls page, cache holds public statics only, no prompt/subscription on load, event-opened dialog, signed-out and denied states, offline notice.');
}catch(e){if(log.length)console.error(log.join('').slice(-2500));throw e;}
finally{await browser?.close();worker?.kill('SIGTERM');await new Promise(r=>setTimeout(r,500));await rm(dir,{recursive:true,force:true});}
