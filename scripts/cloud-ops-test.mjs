/** Worker/D1 operations: per-account daily caps and the daily clean-up Cron Trigger. Synthetic accounts only. */
import assert from'node:assert/strict';import{cloudFixture}from'./cloud-test-harness.mjs';
const f=await cloudFixture();let count=0;const DAY=86400000;
try{
 const reg=async handle=>{const c=f.jar();const r=await f.call(c,'/register','POST',{handle,name:handle,password:'synthetic-cloud-password'});return{c,user:r.data.user,office:r.data.office};};
 const a=await reg('ops_a'),b=await reg('ops_b');
 // Daily caps: invitations (30), publisher keys (10, even when revoked in between), office changes (200), accepting (30).
 for(let i=0;i<30;i++)assert.equal((await f.call(a.c,'/invites','POST',{scope:'presence'})).status,201,'invite '+i);
 const over=await f.call(a.c,'/invites','POST',{scope:'presence'});assert.equal(over.status,429);assert.match(over.data.error,/Daily limit/);
 assert.equal((await f.call(b.c,'/invites','POST',{scope:'presence'})).status,201,'caps are per account');count++;
 for(let i=0;i<10;i++){const k=await f.call(a.c,'/publisher-tokens','POST',{});assert.equal(k.status,201);await f.call(a.c,'/publisher-tokens/'+k.data.id,'DELETE',{});}
 assert.equal((await f.call(a.c,'/publisher-tokens','POST',{})).status,429,'revoking does not reset the daily key cap');count++;
 await f.db.prepare("INSERT INTO auth_limits VALUES(?,200,?)").bind('day-office:'+a.user.id,Date.now()+DAY).run();
 assert.equal((await f.call(a.c,'/office','POST',{name:'Too many renames'})).status,429);
 await f.db.prepare("INSERT INTO auth_limits VALUES(?,30,?)").bind('day-accept:'+b.user.id,Date.now()+DAY).run();
 const inv=await f.call(b.c,'/invites','POST',{scope:'activity'});const c=await reg('ops_c');
 assert.equal((await f.call(b.c,'/accept','POST',{token:inv.data.token})).status,429,'accept attempts are capped');
 assert.equal((await f.call(c.c,'/accept','POST',{token:inv.data.token})).status,200,'others are unaffected');count++;
 // An expired cap window starts fresh.
 await f.db.prepare('UPDATE auth_limits SET expires=0 WHERE key=?').bind('day-office:'+a.user.id).run();
 assert.equal((await f.call(a.c,'/office','POST',{name:'Renamed tomorrow'})).status,200);count++;

 // Daily clean-up: only dead or long-stale rows go; anything still usable stays.
 const now=Date.now(),old=now-2*DAY;
 const q=(sql,...v)=>f.db.prepare(sql).bind(...v);
 await q('INSERT INTO sessions VALUES(?,?,?)','expired-session',a.user.id,now-1000).run();
 await q("INSERT INTO push_subscriptions(id,endpoint,user,session,p256dh,auth,finished,created) VALUES(?,?,?,?,?,?,0,?)",'dead-sub','https://fcm.googleapis.com/fcm/send/dead',a.user.id,'expired-session','x','y',now).run();
 const live=(await f.db.prepare('SELECT token FROM sessions WHERE user=? AND expires>? LIMIT 1').bind(a.user.id,now).first()).token;
 await q("INSERT INTO push_subscriptions(id,endpoint,user,session,p256dh,auth,finished,created) VALUES(?,?,?,?,?,?,0,?)",'live-sub','https://fcm.googleapis.com/fcm/send/live',a.user.id,live,'x','y',now).run();
 await q('UPDATE invites SET expires=? WHERE id IN(SELECT id FROM invites LIMIT 5)',now-1000).run();
 await q('INSERT INTO push_log VALUES(?,?,?,?,?,?)','old-log',a.user.id,now-100*DAY,'attention',1,0).run();
 await q('INSERT INTO push_log VALUES(?,?,?,?,?,?)','new-log',a.user.id,now-DAY,'attention',1,0).run();
 await q("UPDATE offices SET agents=?,updated=? WHERE id=?",JSON.stringify([{id:'x',name:'Agent 1',provider:'codex',status:'running'}]),old,a.office.id).run();
 await q("UPDATE offices SET agents=?,updated=? WHERE id=?",JSON.stringify([{id:'y',name:'Agent 1',provider:'codex',status:'running'}]),now,b.office.id).run();
 const invitesBefore=(await q('SELECT COUNT(*) n FROM invites').first()).n;
 const worker=await f.mf.getWorker();await worker.scheduled({cron:'23 3 * * *',scheduledTime:new Date()});
 await new Promise(r=>setTimeout(r,300));
 assert.equal((await q('SELECT COUNT(*) n FROM sessions WHERE token=?','expired-session').first()).n,0,'expired session removed');
 assert.equal((await q('SELECT COUNT(*) n FROM push_subscriptions WHERE id=?','dead-sub').first()).n,0,'alert of an ended session removed');
 assert.equal((await q('SELECT COUNT(*) n FROM push_subscriptions WHERE id=?','live-sub').first()).n,1,'live alert kept');
 assert.equal((await q('SELECT COUNT(*) n FROM invites').first()).n,invitesBefore-5,'only expired invitations removed');
 assert.deepEqual((await q("SELECT id FROM push_log WHERE id IN('old-log','new-log') ORDER BY id").all()).results.map(r=>r.id),['new-log'],'alert history older than 90 days removed');
 const offA=await q('SELECT agents,updated FROM offices WHERE id=?',a.office.id).first(),offB=await q('SELECT agents FROM offices WHERE id=?',b.office.id).first();
 assert.equal(offA.agents,'[]');assert.equal(offA.updated,old,'stale snapshot emptied, last-update time kept');assert.notEqual(offB.agents,'[]','fresh snapshot kept');
 assert.equal((await f.call(a.c,'/session')).status,200,'people stay signed in');count++;
 console.log(`PASS: ${count} cloud operations scenarios: daily per-account caps (invites, keys, office, accept; per account; fresh next day) and the daily clean-up (expired sessions/alerts/invites, 90-day history, stale snapshots; live data kept).`);
}finally{await f.close();}
