/** Runs public/sw.js in a VM with fake Cache/Clients/registration APIs: cache exclusions, lifecycle and generic push display. Plus manifest/icon/index.html static checks. Synthetic only. */
import assert from'node:assert/strict';import{readFile}from'node:fs/promises';import vm from'node:vm';
const src=await readFile('public/sw.js','utf8');let count=0;
function boot(){
 const listeners={},stores=new Map(),shown=[],opened=[],skipped=[];let deleted=[];
 const cacheOf=n=>{if(!stores.has(n))stores.set(n,new Map());const m=stores.get(n);return{match:async r=>m.get(new URL(typeof r==='string'?r:r.url,'https://office.test').pathname),put:async(r,res)=>{m.set(new URL(typeof r==='string'?r:r.url,'https://office.test').pathname,res);}};};
 const caches={open:async n=>cacheOf(n),keys:async()=>[...stores.keys()],delete:async n=>{deleted.push(n);return stores.delete(n);},match:async u=>{for(const m of stores.values()){const hit=m.get(u);if(hit)return hit;}}};
 const self={location:{origin:'https://office.test'},navigator:{language:'en-US'},addEventListener:(t,f)=>{listeners[t]=f;},skipWaiting:()=>skipped.push(1),registration:{showNotification:async(t,o)=>{shown.push([t,o]);}},clients:{matchAll:async()=>self._clients??[],openWindow:async u=>{opened.push(u);}},_clients:[]};
 let network=async(r)=>{const x=new Response('ok');if(typeof r==='string'&&r==='/offline.html'){Object.defineProperty(x,'redirected',{value:true});}return x;};const ctx=vm.createContext({self,caches,fetch:(r)=>network(r),Response,URL,Request,Promise,console});vm.runInContext(src,ctx);
 const dispatch=(type,event)=>{let p=Promise.resolve();const e={...event,waitUntil:x=>{p=x;},respondWith:x=>{e.responded=x;}};listeners[type](e);return{e,done:()=>p};};
 return{self,stores,shown,opened,skipped,deleted:()=>deleted,setNetwork:f=>{network=f;},dispatch,listeners};
}
const req=(path,o={})=>({method:o.method??'GET',mode:o.mode??'no-cors',url:'https://office.test'+path,headers:new Headers()});
const res=(body,type='application/javascript',extra={})=>{const r=new Response(body,{headers:{'Content-Type':type,...extra}});Object.defineProperty(r,'type',{value:'basic'});return r;};
// Lifecycle: precache only public files, no automatic skipWaiting, old caches removed on activate
let sw=boot();let d=sw.dispatch('install',{});await d.done();assert.deepEqual([...sw.stores.get('t3-office-static-v1').keys()].sort(),['/icons/icon-192.png','/icons/icon-512.png','/manifest.webmanifest','/offline.html']);assert.equal(sw.skipped.length,0);assert.equal(sw.stores.get('t3-office-static-v1').get('/offline.html').redirected,false,'a redirected response is never stored');
sw.stores.set('t3-office-static-v0',new Map());sw.stores.set('unrelated',new Map());d=sw.dispatch('activate',{});await d.done();assert.deepEqual(sw.deleted(),['t3-office-static-v0']);
sw.dispatch('message',{data:{type:'noise'}});assert.equal(sw.skipped.length,0);sw.dispatch('message',{data:{type:'SKIP_WAITING'}});assert.equal(sw.skipped.length,1);count++;
// Private, credentialed, non-GET and cross-origin requests are never intercepted (network only, nothing cached)
const privates=['/api/building/session','/api/building/offices/abc','/api/building/push/config','/api/t3/threads','/api/board','/api','/auth/github/callback?code=abc&state=xyz','/?code=abc&state=xyz','/?error=access_denied','/assets/index-abc.js?token=1','/.local/building.sqlite','/.env','/@vite/client','/node_modules/x.js','/oauth/callback','/?invite=secret','/assets/a.js?invitation=secret'];
for(const p of privates){for(const mode of['navigate','no-cors']){sw=boot();const x=sw.dispatch('fetch',{request:req(p,{mode})});assert.equal(x.e.responded,undefined,p+' '+mode);}}
sw=boot();assert.equal(sw.dispatch('fetch',{request:req('/assets/a.js',{method:'POST'})}).e.responded,undefined);
sw=boot();assert.equal(sw.dispatch('fetch',{request:{...req('/assets/a.js'),url:'https://evil.test/assets/a.js'}}).e.responded,undefined);
sw=boot();assert.equal(sw.dispatch('fetch',{request:req('/sets/other.png')}).e.responded,undefined,'only explicit public statics are cached');
sw=boot();assert.equal(sw.dispatch('fetch',{request:req('/assets/a.js?random=1')}).e.responded,undefined,'query variants cannot grow the public cache or carry unknown query secrets');count++;
// Navigation: network first; offline page only when the network fails; no HTML is ever cached
sw=boot();await sw.dispatch('install',{}).done();sw.setNetwork(async()=>res('<html>office</html>','text/html'));let x=sw.dispatch('fetch',{request:req('/',{mode:'navigate'})});assert.equal(await(await x.e.responded).text(),'<html>office</html>');assert.ok(!sw.stores.get('t3-office-static-v1').has('/'));
sw.setNetwork(async()=>{throw new Error('offline');});x=sw.dispatch('fetch',{request:req('/?view=friends',{mode:'navigate'})});assert.equal(await(await x.e.responded).text(),'ok','the stored offline page is served when the network fails');count++;
// Hashed assets: cached after first fetch, served from cache next time; HTML fallbacks, errors, no-store and cookie responses are not cached
sw=boot();let hits=0;sw.setNetwork(async()=>{hits++;return res('js');});let a1=sw.dispatch('fetch',{request:req('/assets/index-abc.js')});await a1.e.responded;await new Promise(r=>setTimeout(r,5));a1=sw.dispatch('fetch',{request:req('/assets/index-abc.js')});await a1.e.responded;assert.equal(hits,1);
for(const[name,response]of[['html',res('<html>','text/html')],['no-store',res('x','application/javascript',{'Cache-Control':'no-store'})],['private',res('x','application/javascript',{'Cache-Control':'private, max-age=5'})],['error',(()=>{const r=res('x');Object.defineProperty(r,'ok',{value:false});return r;})()]]){sw=boot();sw.setNetwork(async()=>response);const y=sw.dispatch('fetch',{request:req('/assets/other.js')});await y.e.responded;await new Promise(r=>setTimeout(r,5));assert.ok(!sw.stores.get('t3-office-static-v1')?.has('/assets/other.js'),name);}
count++;
// Push: generic fixed text regardless of payload; malformed payloads still show the generic notice; clicks focus or open the root only
sw=boot();for(const payload of[{v:1,kind:'attention'},{v:1,kind:'finished'},{v:1,kind:'attention',title:'SECRET PROMPT',body:'SECRET /Users/x/project'},{v:2,kind:'finished'},'garbage']){const e=sw.dispatch('push',{data:{json:()=>{if(typeof payload==='string')throw new Error('bad');return payload;}}});await e.done();}
assert.deepEqual(sw.shown.map(([t,o])=>[t,o.body]),[['T3 Office','An agent needs attention'],['T3 Office','An agent finished'],['T3 Office','An agent needs attention'],['T3 Office','An agent needs attention'],['T3 Office','An agent needs attention']]);assert.ok(!JSON.stringify(sw.shown).includes('SECRET'));assert.ok(sw.shown.every(([,o])=>o.tag==='office-attention'));
sw.self.navigator.language='de-DE';sw.dispatch('push',{data:null});await Promise.resolve();assert.equal(sw.shown.at(-1)[1].body,'Ein Agent braucht Aufmerksamkeit');
let closed=0,focused=0;await sw.dispatch('notificationclick',{notification:{close:()=>closed++}}).done();assert.deepEqual(sw.opened,['/']);sw.self._clients=[{url:'https://office.test/',focus:async()=>{focused++;}}];await sw.dispatch('notificationclick',{notification:{close:()=>closed++}}).done();assert.equal(focused,1);assert.equal(closed,2);count++;
// Static assets: manifest, icons, entry HTML
const manifest=JSON.parse(await readFile('public/manifest.webmanifest','utf8'));assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');assert.ok(manifest.name&&manifest.short_name&&manifest.theme_color&&manifest.background_color);
const sizes=new Set(manifest.icons.map(i=>i.sizes));assert.ok(sizes.has('192x192')&&sizes.has('512x512'));assert.ok(manifest.icons.some(i=>i.purpose==='maskable'));
for(const i of[...manifest.icons,{src:'/icons/apple-touch-icon.png',sizes:'180x180'}]){const b=await readFile('public'+i.src);assert.deepEqual([...b.subarray(0,8)],[137,80,78,71,13,10,26,10],i.src);const w=b.readUInt32BE(16),h=b.readUInt32BE(20);assert.equal(`${w}x${h}`,i.sizes,i.src);}
const html=await readFile('index.html','utf8');assert.match(html,/<link rel="manifest" href="\/manifest\.webmanifest"/);assert.match(html,/apple-touch-icon/);assert.match(html,/theme-color/);
assert.ok(!/localStorage|sessionStorage|indexedDB/.test(src),'service worker keeps no user data');count++;
console.log(`PASS: ${count} service-worker/manifest scenarios: lifecycle (no auto skipWaiting, old cache removal), network-only private/OAuth/dot/cross-origin routes, offline fallback, public-asset-only caching, generic push text, notification click, manifest/icons/HTML.`);
