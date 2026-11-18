/** Worker/D1 Web Push scenarios with synthetic accounts and a fake push service (no network, no real subscriptions or secrets). */
import assert from'node:assert/strict';import{cloudFixture}from'./cloud-test-harness.mjs';
const b64u=b=>Buffer.from(b).toString('base64url');
const ecdsa=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign']);const jwk=await crypto.subtle.exportKey('jwk',ecdsa.privateKey);
const bindings={VAPID_PUBLIC_KEY:b64u(await crypto.subtle.exportKey('raw',ecdsa.publicKey)),VAPID_PRIVATE_KEY:jwk.d,VAPID_SUBJECT:'mailto:ops@example.test'};
async function browserKeys(){const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);return{p256dh:b64u(await crypto.subtle.exportKey('raw',pair.publicKey)),auth:b64u(crypto.getRandomValues(new Uint8Array(16)))};}
let status=201,onSend=null;const calls=[];
const f=await cloudFixture({bindings,push:async req=>{calls.push({url:req.url,headers:Object.fromEntries(req.headers),redirect:req.redirect,body:new Uint8Array(await req.arrayBuffer())});await onSend?.(calls.length);return new Response(null,{status:typeof status==='function'?status(req.url):status});}});
const until=async(fn,ms=3000)=>{const t=Date.now();while(!fn()){if(Date.now()-t>ms)throw new Error('timed out waiting');await new Promise(r=>setTimeout(r,20));}};
const quiet=()=>new Promise(r=>setTimeout(r,350));
const ep=n=>`https://fcm.googleapis.com/fcm/send/synthetic-${n}`;let n=0,count=0;
try{
 const reg=async(handle)=>{const c=f.jar();const r=await f.call(c,'/register','POST',{handle,name:handle,password:'synthetic-cloud-password'});return{c,user:r.data.user,office:r.data.office};};
 const owner=await reg('owner'),guest=await reg('guest'),other=await reg('other');
 const browserSubscriptions=new Map();
 const sub=async(who,endpoint,extra={})=>{if(!browserSubscriptions.has(endpoint))browserSubscriptions.set(endpoint,await browserKeys());return f.call(who.c,'/push/subscriptions','POST',{endpoint,keys:browserSubscriptions.get(endpoint),...extra});};
 const key=(await f.call(owner.c,'/publisher-tokens','POST',{})).data;
 const publish=async(agents,k=key)=>{await f.db.prepare('DELETE FROM publish_rate').run();return f.call(f.jar(),'/publish','POST',{agents:agents.map(([id,status])=>({id,provider:'codex',status,title:'NEVER_SHARE'}))},{Authorization:'Bearer '+k.token});};
 const resetCooldown=()=>f.db.prepare('DELETE FROM push_state').run();
 // Configuration, authentication and validation
 assert.deepEqual((await f.call(owner.c,'/push/config')).data,{enabled:true,publicKey:bindings.VAPID_PUBLIC_KEY,subscriptions:0});
 assert.equal((await f.call(f.jar(),'/push/config')).status,401);
 assert.equal((await f.call(f.jar(),'/push/config','GET',undefined,{Authorization:'Bearer '+key.token})).status,401);
 assert.equal((await f.call(f.jar(),'/push/subscriptions','POST',{endpoint:ep(0),keys:await browserKeys()},{Authorization:'Bearer '+key.token})).status,401);
 for(const bad of['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://localhost:8787/x','https://169.254.169.254/x','https://evil.test/fcm.googleapis.com','https://fcm.googleapis.com.evil.test/x','javascript:alert(1)',5,null])assert.equal((await sub(owner,bad)).status,400,String(bad));
 assert.equal((await f.call(owner.c,'/push/subscriptions','POST',{endpoint:ep(0),keys:{p256dh:b64u(Uint8Array.from([4,...new Uint8Array(64).fill(1)])),auth:b64u(new Uint8Array(16))}})).status,400);
 assert.equal((await sub(owner,ep(0),{actorId:other.user.id})).status,409);assert.equal((await sub(owner,ep(0),{finished:'yes'})).status,400);
 assert.equal((await f.call(owner.c,'/push/subscriptions','POST',{endpoint:ep(0),keys:await browserKeys()},{Origin:'https://evil.test'})).status,403);
 const noJson=await f.mf.dispatchFetch(f.origin+'/api/building/push/subscriptions',{method:'POST',headers:{Cookie:[...owner.c].map(([k,v])=>k+'='+v).join('; '),'Content-Type':'text/plain',Origin:f.origin},body:'{}'});assert.equal(noJson.status,415);count++;
 // No automatic subscription: nothing exists until the explicit opt-in call
 assert.equal((await f.call(owner.c,'/push/config')).data.subscriptions,0);
 // Opt-in, per-account limit, idempotent re-registration
 const A=ep('a');assert.equal((await sub(owner,A)).status,200);assert.equal((await sub(owner,A)).status,200);assert.equal((await f.call(owner.c,'/push/config')).data.subscriptions,1);
 for(let i=0;i<4;i++)assert.equal((await sub(owner,ep('x'+i))).status,200);assert.equal((await sub(owner,ep('overflow'))).status,409);
 for(let i=0;i<4;i++)assert.equal((await f.call(owner.c,'/push/subscriptions','DELETE',{endpoint:ep('x'+i)})).status,200);
 assert.equal((await f.call(owner.c,'/push/config')).data.subscriptions,1);count++;
 // Generic alerts only: baseline/initial, repeats and new agents never notify; a real change does, once
 await publish([['a1','running'],['a2','running']]);await publish([['a1','running'],['a2','running'],['a3','waiting']]);await publish([['a1','running'],['a2','running'],['a3','waiting']]);await quiet();assert.equal(calls.length,0,'initial snapshot, new agent and unchanged repeat must not alert');
 await publish([['a1','waiting'],['a2','running'],['a3','waiting']]);await until(()=>calls.length===1);
 const first=calls[0];assert.equal(first.url,A);assert.equal(first.headers['content-encoding'],'aes128gcm');assert.match(first.headers.authorization,/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);assert.ok(first.body.length<200);
 assert.ok(!Buffer.from(first.body).toString('latin1').includes('a1'));
 // Cooldown: a storm of further changes inside the window is coalesced
 await publish([['a1','running'],['a2','running'],['a3','waiting']]);await publish([['a1','failed'],['a2','running'],['a3','waiting']]);await quiet();assert.equal(calls.length,1);
 await resetCooldown();await publish([['a1','running'],['a2','running'],['a3','waiting']]);await publish([['a1','waiting'],['a2','running'],['a3','waiting']]);await until(()=>calls.length===2);count++;
 // Reconnect after an offline gap is a baseline, not news
 await resetCooldown();await f.db.prepare('UPDATE offices SET updated=0 WHERE id=?').bind(owner.office.id).run();await publish([['a1','running'],['a2','failed'],['a3','waiting']]);await quiet();assert.equal(calls.length,2);
 // 'finished' only reaches subscriptions that opted in to it
 await resetCooldown();await publish([['a1','completed'],['a2','failed'],['a3','waiting']]);await quiet();assert.equal(calls.length,2);
 const F=ep('finished');assert.equal((await sub(owner,F,{finished:true})).status,200);await resetCooldown();await publish([['a1','running'],['a2','failed'],['a3','waiting']]);await publish([['a1','completed'],['a2','failed'],['a3','waiting']]);await until(()=>calls.length===3);assert.equal(calls[2].url,F);count++;
 // Guests with activity or presence grants never receive the owner's alerts and their own subscription is independent
 for(const scope of['activity','presence']){const inv=await f.call(owner.c,'/invites','POST',{scope});await f.call(guest.c,'/accept','POST',{token:inv.data.token});}
 const G=ep('guest');assert.equal((await sub(guest,G)).status,200);await resetCooldown();await publish([['a1','running'],['a2','failed'],['a3','waiting']]);await publish([['a1','waiting'],['a2','failed'],['a3','waiting']]);await until(()=>calls.length===5);await quiet();assert.ok(calls.every(c=>c.url!==G));
 assert.equal((await f.call(guest.c,'/push/subscriptions','DELETE',{endpoint:A})).status,200);assert.equal((await f.call(owner.c,'/push/config')).data.subscriptions,2,'a different account cannot remove another account subscription');
 await f.call(guest.c,'/push/subscriptions','DELETE',{endpoint:G});count++;
 // Account switch on one browser endpoint moves ownership; the old account no longer receives alerts there
 calls.length=0;assert.equal((await f.call(other.c,'/push/subscriptions','POST',{endpoint:A,keys:await browserKeys()})).status,409,'endpoint URL alone cannot transfer another account subscription');assert.equal((await sub(other,A)).status,200);await resetCooldown();await publish([['a1','running'],['a2','failed'],['a3','waiting']]);await publish([['a1','waiting'],['a2','failed'],['a3','waiting']]);await quiet();assert.ok(calls.every(c=>c.url!==A),'previous account must not push to the switched browser');
 assert.equal((await f.call(owner.c,'/push/subscriptions','DELETE',{endpoint:A})).status,200);assert.equal((await f.call(other.c,'/push/config')).data.subscriptions,1);
 await f.call(other.c,'/push/subscriptions','DELETE',{endpoint:A});await f.call(owner.c,'/push/subscriptions','DELETE',{endpoint:F});count++;
 // Only 410/404 expire a subscription; configuration failures keep it; retry stays bounded and redirects are not followed
 for(const[code,kept]of[[410,0],[404,0],[400,1],[401,1],[403,1],[413,1],[302,1],[503,1]]){calls.length=0;await f.call(owner.c,'/push/subscriptions','DELETE',{endpoint:A});const E=ep('r'+code);await sub(owner,E);status=code;await resetCooldown();await publish([['a1','running'],['a2','running']]);await publish([['a1','waiting'],['a2','running']]);await until(()=>calls.length>=1);await quiet();
  assert.equal((await f.call(owner.c,'/push/config')).data.subscriptions,kept,String(code));assert.equal(calls.length,code===503?2:1,String(code));await f.call(owner.c,'/push/subscriptions','DELETE',{endpoint:E});}
 status=201;count++;
 // Recheck at delivery: pause or publisher-key revocation after the publish was accepted but before sending stops later sends
 const P1=ep('p1'),P2=ep('p2');await sub(owner,P1);await sub(owner,P2);
 calls.length=0;onSend=async()=>{onSend=null;await f.call(owner.c,'/office','POST',{paused:true});};await resetCooldown();await publish([['a1','running']]);await publish([['a1','waiting']]);await until(()=>calls.length>=1);await quiet();assert.equal(calls.length,1,'paused office must stop the second delivery');
 await f.call(owner.c,'/office','POST',{paused:false});
 const key2=(await f.call(owner.c,'/publisher-tokens','POST',{})).data;calls.length=0;onSend=async()=>{onSend=null;await f.call(owner.c,'/publisher-tokens/'+key2.id,'DELETE',{});};await resetCooldown();await publish([['a1','running']],key2);await publish([['a1','waiting']],key2);await until(()=>calls.length>=1);await quiet();assert.equal(calls.length,1,'revoked key must stop the second delivery');
 assert.equal((await publish([['a1','running']],key2)).status,401);
 // A retry is another disclosure: a pause during a retryable first response must stop it too.
 calls.length=0;status=503;onSend=async()=>{onSend=null;await f.call(owner.c,'/office','POST',{paused:true});};await resetCooldown();await publish([['a1','running']]);await publish([['a1','waiting']]);await until(()=>calls.length===1);await quiet();assert.equal(calls.length,1,'pause must suppress a retry of the same subscription');status=201;await f.call(owner.c,'/office','POST',{paused:false});
 // Logout ends the session that enabled alerts: later publishes by the still-valid bridge key notify nobody and clean up
 calls.length=0;await resetCooldown();await publish([['a1','running']]);await f.call(owner.c,'/logout','POST',{});await publish([['a1','waiting']]);await quiet();assert.equal(calls.length,0);
 assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM push_subscriptions WHERE user=?').bind(owner.user.id).first()).n,0,'subscriptions of an ended session are removed');count++;
 // Unconfigured deployments report unsupported and refuse subscriptions
 const g=await cloudFixture();try{const c=g.jar();await g.call(c,'/register','POST',{handle:'solo',name:'solo',password:'synthetic-cloud-password'});assert.deepEqual((await g.call(c,'/push/config')).data,{enabled:false,publicKey:null,subscriptions:0});assert.equal((await g.call(c,'/push/subscriptions','POST',{endpoint:ep('z'),keys:await browserKeys()})).status,503);count++;}finally{await g.close();}
 // A malformed/mismatched server key pair is configuration failure, never a usable push setup.
 const secondPair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign']);const otherPrivate=(await crypto.subtle.exportKey('jwk',secondPair.privateKey)).d;
 const broken=await cloudFixture({bindings:{...bindings,VAPID_PRIVATE_KEY:otherPrivate}});try{const c=broken.jar();await broken.call(c,'/register','POST',{handle:'broken',name:'Broken',password:'synthetic-cloud-password'});assert.deepEqual((await broken.call(c,'/push/config')).data,{enabled:false,publicKey:null,subscriptions:0});assert.equal((await broken.call(c,'/push/subscriptions','POST',{endpoint:ep('broken'),keys:await browserKeys()})).status,503);count++;}finally{await broken.close();}
 console.log(`PASS: ${count} cloud push scenarios: validation/SSRF, opt-in, limits, generic payload, baseline/duplicate/cooldown, finished opt-in, guest isolation, account switch, expiry/retry, pause/key/logout rechecks, unconfigured.`);
}finally{await f.close();}
