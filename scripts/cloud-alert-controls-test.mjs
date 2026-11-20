/** Worker/D1 alert controls: per-device own/quiet settings held before delivery, test alert, recent alerts. Synthetic accounts and a fake push service only. */
import assert from'node:assert/strict';import{cloudFixture}from'./cloud-test-harness.mjs';
const b64u=b=>Buffer.from(b).toString('base64url');
const ecdsa=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign']);const jwk=await crypto.subtle.exportKey('jwk',ecdsa.privateKey);
const bindings={VAPID_PUBLIC_KEY:b64u(await crypto.subtle.exportKey('raw',ecdsa.publicKey)),VAPID_PRIVATE_KEY:jwk.d,VAPID_SUBJECT:'mailto:ops@example.test'};
async function browserKeys(){const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);return{p256dh:b64u(await crypto.subtle.exportKey('raw',pair.publicKey)),auth:b64u(crypto.getRandomValues(new Uint8Array(16)))};}
const calls=[];const f=await cloudFixture({bindings,push:async req=>{calls.push({url:req.url,body:new Uint8Array(await req.arrayBuffer())});return new Response(null,{status:201});}});
const until=async(fn,ms=4000)=>{const t=Date.now();while(!fn()){if(Date.now()-t>ms)throw new Error('timed out waiting');await new Promise(r=>setTimeout(r,20));}};
const settle=()=>new Promise(r=>setTimeout(r,400));
const ep=n=>`https://fcm.googleapis.com/fcm/send/controls-${n}`;let count=0;
try{
 const reg=async handle=>{const c=f.jar();const r=await f.call(c,'/register','POST',{handle,name:handle,password:'synthetic-cloud-password'});return{c,user:r.data.user};};
 const owner=await reg('ctl_owner'),other=await reg('ctl_other');
 const key=(await f.call(owner.c,'/publisher-tokens','POST',{})).data.token;
 const publish=agents=>f.call(f.jar(),'/publish','POST',{agents:agents.map(([id,status])=>({id,provider:'codex',status}))},{Authorization:'Bearer '+key});
 // Each flip starts from a fresh cooldown and publish window (real clock in the Worker).
 const flip=async(from,to)=>{await f.db.prepare('UPDATE push_state SET last=0').run();await f.db.prepare('DELETE FROM publish_rate').run();assert.equal((await publish([['a1',from]])).status,200);assert.equal((await publish([['a1',to]])).status,200);};
 const A=ep('a');
 assert.equal((await f.call(owner.c,'/push/subscriptions','POST',{endpoint:A,keys:await browserKeys(),quiet:{start:1,end:2,tz:'Mars/Base'}})).status,400,'invalid quiet hours rejected');
 assert.equal((await f.call(owner.c,'/push/subscriptions','POST',{endpoint:A,keys:await browserKeys(),own:true,quiet:null})).status,200);
 await publish([['a1','running']]);await flip('running','waiting');await until(()=>calls.length===1);count++;
 // Own office off for this device: nothing sent and nothing logged.
 assert.equal((await f.call(owner.c,'/push/settings','POST',{endpoint:A,own:false})).status,200);
 await flip('running','failed');await settle();assert.equal(calls.length,1,'own office muted on this device');
 assert.equal((await f.call(owner.c,'/push/settings','POST',{endpoint:A,own:true})).status,200);count++;
 // Quiet hours around now: held before reaching the push service, recorded in history.
 const d=new Date(),m=d.getUTCHours()*60+d.getUTCMinutes();
 assert.equal((await f.call(owner.c,'/push/settings','POST',{endpoint:A,quiet:{start:(m+1380)%1440,end:(m+120)%1440,tz:'UTC'}})).status,200);
 await flip('running','waiting');await settle();assert.equal(calls.length,1,'quiet hours hold the push');
 let history=(await f.call(owner.c,'/push/history')).data.alerts;
 assert.deepEqual(history.map(h=>[h.kind,h.sent,h.held]),[['attention',0,1],['attention',1,0]]);
 assert.equal((await f.call(owner.c,'/push/settings','POST',{endpoint:A,quiet:null})).status,200);
 await flip('running','failed');await until(()=>calls.length===2);count++;
 // Per device and per account; validation; publisher keys cannot touch alert controls.
 assert.equal((await f.call(other.c,'/push/settings','POST',{endpoint:A,own:false})).status,404);
 assert.equal((await f.call(owner.c,'/push/settings','POST',{endpoint:A,own:'no'})).status,400);
 assert.equal((await f.call(owner.c,'/push/settings','POST',{endpoint:A,quiet:{start:5,end:9999,tz:'UTC'}})).status,400);
 assert.equal((await f.call(f.jar(),'/push/settings','POST',{endpoint:A,own:false})).status,401);
 assert.equal((await f.call(f.jar(),'/push/history','GET',undefined,{Authorization:'Bearer '+key})).status,401);count++;
 // Test alert: one push to this device, ignores quiet hours, logged, rate-limited, never for other accounts.
 await f.call(owner.c,'/push/settings','POST',{endpoint:A,quiet:{start:0,end:1439,tz:'UTC'}});
 const t=await f.call(owner.c,'/push/test','POST',{endpoint:A});assert.equal(t.status,200);assert.equal(t.data.delivered,true);
 await until(()=>calls.length===3);assert.equal(calls[2].url,A);assert.ok(calls[2].body.length<200);
 assert.equal((await f.call(other.c,'/push/test','POST',{endpoint:A})).status,404);
 for(let i=0;i<4;i++)assert.equal((await f.call(owner.c,'/push/test','POST',{endpoint:A})).status,200);
 assert.equal((await f.call(owner.c,'/push/test','POST',{endpoint:A})).status,429);
 history=(await f.call(owner.c,'/push/history')).data.alerts;assert.equal(history[0].kind,'test');assert.ok(history.length<=20);
 assert.deepEqual((await f.call(other.c,'/push/history')).data.alerts,[],'history is per account');
 assert.ok(!JSON.stringify(history).includes('a1'),'history holds kinds and counts only');count++;
 // History keeps the newest 20 per account.
 for(let i=0;i<25;i++)await f.db.prepare('INSERT INTO push_log VALUES(?,?,?,?,?,?)').bind('x'+i,owner.user.id,Date.now()-100000+i,'attention',1,0).run();
 await f.call(owner.c,'/push/settings','POST',{endpoint:A,quiet:null});
 await f.db.prepare('UPDATE push_state SET last=0').run();await f.db.prepare('DELETE FROM publish_rate').run();
 await publish([['a1','running']]);await publish([['a1','waiting']]);await until(()=>calls.length===8);await settle();
 assert.equal((await f.db.prepare('SELECT COUNT(*) n FROM push_log WHERE user=?').bind(owner.user.id).first()).n,20,'trimmed to the newest 20');count++;
 console.log(`PASS: ${count} cloud alert-control scenarios: own-office per device, quiet hours held before delivery and logged, validation and account scoping, test alert (quiet-hours exempt, rate-limited), per-account history trimmed to 20.`);
}finally{await f.close();}
