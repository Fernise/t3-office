/** Opt-in alert controller and foreground watcher against fake browser/API environments (synthetic only). Bundles the real TypeScript modules with esbuild. */
import assert from'node:assert/strict';import{build}from'esbuild';import{writeFile,mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join,resolve}from'node:path';import{pathToFileURL}from'node:url';
const dir=await mkdtemp(join(tmpdir(),'office-pwa-logic-'));let count=0;
try{
 const out=join(dir,'mod.mjs');const r=await build({stdin:{contents:`export*from'${resolve('src/alerts.ts')}';export*from'${resolve('src/alert-watch.ts')}';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});await writeFile(out,r.outputFiles[0].text);
 const{createAlerts,createWatcher}=await import(pathToFileURL(out).href);
 const keyBytes=Buffer.alloc(65,4).toString('base64url');
 function fakeEnv(o={}){
  const log=[];let pref=o.pref??null,permission=o.permission??'default',sub=o.sub??null;
  const env={log,support:()=>o.support??'ok',permission:()=>permission,requestPermission:async()=>{log.push('requestPermission');permission=o.answer??'granted';return permission;},
   push:()=>o.noPush?null:({get:async()=>sub,subscribe:async k=>{log.push('subscribe');sub={endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',keys:{p256dh:'p',auth:'a'},unsubscribe:async()=>{log.push('unsubscribe');sub=null;return true;}};return sub;}}),
   pref:{get:()=>pref,set:p=>{log.push('pref:'+(p?'set':'clear'));pref=p;}},
   session:async()=>{if(o.sessionError)throw new Error('offline');return o.session===undefined?{id:'u1'}:o.session;},
   config:async()=>o.config??{enabled:true,publicKey:keyBytes,subscriptions:0},
   register:async b=>{log.push('register:'+b.actorId);if(o.registerFails)throw new Error('x');},unregister:async e=>{log.push('unregister');},startWatcher:()=>log.push('watch'),stopWatcher:()=>log.push('unwatch')};
  return env;
 }
 // Nothing happens without an explicit opt-in
 let env=fakeEnv();const a=createAlerts(env);assert.equal((await a.reconcile()).state,'off');assert.equal(a.status().state,'off');assert.deepEqual(env.log,[]);count++;
 // Unsupported / insecure / iOS-needs-install states never prompt or subscribe
 for(const s of['insecure','unsupported','needs-install']){env=fakeEnv({support:s});const x=createAlerts(env);assert.equal((await x.enable(false)).state,s);assert.equal((await x.reconcile()).state,s);assert.deepEqual(env.log,[]);}
 // Denied in the browser: clear state, no prompt, no subscribe, no server call
 env=fakeEnv({permission:'denied'});let res=await createAlerts(env).enable(false);assert.deepEqual([res.state,res.notice],['denied','denied']);assert.deepEqual(env.log,[]);
 // Prompt dismissed (default) or denied at the prompt
 env=fakeEnv({answer:'default'});res=await createAlerts(env).enable(false);assert.deepEqual([res.state,res.notice],['off','dismissed']);assert.deepEqual(env.log,['requestPermission']);
 env=fakeEnv({answer:'denied'});res=await createAlerts(env).enable(false);assert.deepEqual([res.state,res.notice],['denied','denied']);assert.ok(!env.log.includes('subscribe'));
 // Signed out: no prompt at all
 env=fakeEnv({session:null});res=await createAlerts(env).enable(false);assert.deepEqual([res.state,res.notice],['signed-out','signedOut']);assert.deepEqual(env.log,[]);count++;
 // Successful opt-in binds the actor; disable removes browser + server subscription and the stored preference
 env=fakeEnv();let al=createAlerts(env);res=await al.enable(true);assert.equal(res.state,'on-push');assert.ok(env.log.includes('register:u1'));assert.equal(env.pref.get().actor,'u1');assert.equal(env.pref.get().finished,true);
 env.log.length=0;res=await al.disable();assert.equal(res.state,'off');assert.deepEqual(env.log.filter(l=>l!=='unwatch'),['unregister','unsubscribe','pref:clear']);assert.equal(env.pref.get(),null);count++;
 // Server registration failure rolls the browser subscription back and falls to foreground-only alerts
 env=fakeEnv({registerFails:true});res=await createAlerts(env).enable(false);assert.equal(res.state,'on-foreground');assert.ok(env.log.includes('unsubscribe'));assert.equal(env.pref.get().push,false);
 env=fakeEnv({config:{enabled:false,publicKey:null,subscriptions:0}});res=await createAlerts(env).enable(false);assert.equal(res.state,'on-foreground');assert.ok(!env.log.includes('subscribe'));
 env=fakeEnv({noPush:true});res=await createAlerts(env).enable(false);assert.equal(res.state,'on-foreground');count++;
 // Account switch, logout and revoked permission clean up and never leave another account's alerts behind
 const sub={endpoint:'https://fcm.googleapis.com/fcm/send/old',keys:{p256dh:'p',auth:'a'},unsubscribe:async()=>true};
 env=fakeEnv({pref:{actor:'u1',push:true,finished:false},permission:'granted',session:{id:'u2'},sub});res=await createAlerts(env).reconcile();assert.deepEqual([res.state,res.notice],['off','accountChanged']);assert.equal(env.pref.get(),null);assert.ok(env.log.includes('unregister'));
 env=fakeEnv({pref:{actor:'u1',push:true,finished:false},permission:'granted',session:null,sub});res=await createAlerts(env).reconcile();assert.deepEqual([res.state,res.notice],['signed-out','signedOut']);assert.equal(env.pref.get(),null);
 env=fakeEnv({pref:{actor:'u1',push:true,finished:false},permission:'denied',sub});res=await createAlerts(env).reconcile();assert.deepEqual([res.state,res.notice],['denied','denied']);assert.equal(env.pref.get(),null);
 env=fakeEnv({pref:{actor:'u1',push:true,finished:false},permission:'granted',sessionError:true,sub});res=await createAlerts(env).reconcile();assert.equal(res.state,'on-push','a network error must not drop the opt-in');assert.ok(env.pref.get());
 // Same account, subscription dropped by the browser: silently re-subscribe (permission already granted) and re-register; never prompt
 env=fakeEnv({pref:{actor:'u1',push:true,finished:false},permission:'granted'});res=await createAlerts(env).reconcile();assert.equal(res.state,'on-push');assert.ok(env.log.includes('subscribe')&&env.log.includes('register:u1')&&!env.log.includes('requestPermission'));count++;
 // Foreground watcher
 const S=(...a)=>a.map(([id,status])=>({id,status}));let t=0,floors,offices,notes=[],signedOut=0,own=false;
 const w=createWatcher({floors:async()=>{if(floors instanceof Error)throw floors;return floors;},office:async id=>{const o=offices[id];if(o instanceof Error)throw o;return o;},notify:k=>notes.push(k),now:()=>t,includeOwn:()=>own,isSignedOutError:e=>e.status===401,onSignedOut:()=>signedOut++});
 const fl=(id,scope='activity',extra={})=>({id,isOwner:false,scope,online:true,...extra}),snap=(agents,extra={})=>({office:{online:true,scope:'activity',...extra},agents});
 floors=[fl('f1')];offices={f1:snap(S(['a','running']))};await w.tick();assert.deepEqual(notes,[],'first sight is a baseline');
 offices.f1=snap(S(['a','running'],['b','waiting']));await w.tick();assert.deepEqual(notes,[],'new agent does not alert');
 offices.f1=snap(S(['a','waiting'],['b','waiting']));await w.tick();assert.deepEqual(notes,['attention']);
 await w.tick();assert.deepEqual(notes,['attention'],'unchanged repeat is silent');
 t=1000;offices.f1=snap(S(['a','running'],['b','waiting']));await w.tick();offices.f1=snap(S(['a','failed'],['b','waiting']));await w.tick();assert.deepEqual(notes,['attention'],'cooldown coalesces');
 t=70000;offices.f1=snap(S(['a','running'],['b','waiting']));await w.tick();offices.f1=snap(S(['a','completed'],['b','waiting']));await w.tick();assert.deepEqual(notes,['attention','finished']);
 // Reconnect / failure / offline gaps reset the baseline instead of alerting
 t=200000;floors=new Error('network');await w.tick();floors=[fl('f1')];offices.f1=snap(S(['a','waiting'],['b','failed']));await w.tick();assert.equal(notes.length,2,'after a failed poll the next snapshot is a baseline');
 offices.f1=new Error('x');await w.tick();offices.f1=snap(S(['a','running'],['b','failed']));await w.tick();assert.equal(notes.length,2);
 offices.f1=snap(S(['a','running']),{online:false});await w.tick();offices.f1=snap(S(['a','waiting']));await w.tick();assert.equal(notes.length,2,'offline then online is a baseline');
 // Only current activity grants: presence scope is never fetched; revoked grant stops; re-grant starts from a fresh baseline; own office only when no push covers it
 let fetched=[];const w2=createWatcher({floors:async()=>floors,office:async id=>{fetched.push(id);return offices[id];},notify:k=>notes.push(k),now:()=>t,includeOwn:()=>own});
 t=400000;notes.length=0;floors=[fl('pres','presence'),fl('mine','owner',{isOwner:true}),fl('act')];offices={pres:snap(S(['x','running']),{scope:'presence'}),mine:snap(S(['m','running'])),act:snap(S(['y','running']))};
 await w2.tick();assert.deepEqual(fetched,['act'],'presence and own office are not fetched');own=true;fetched=[];await w2.tick();assert.deepEqual(fetched.sort(),['act','mine']);own=false;
 floors=[fl('pres','presence'),fl('mine','owner',{isOwner:true})];await w2.tick();assert.equal(w2.size(),0,'revoked activity grant drops its baseline');
 t=500000;floors=[fl('act')];offices.act=snap(S(['y','waiting']));await w2.tick();assert.deepEqual(notes,[],'re-granted floor starts from a baseline');
 // Downgraded to presence between list and fetch: never alert from a snapshot that is not an activity snapshot
 offices.act=snap([],{scope:'presence'});await w2.tick();offices.act=snap(S(['y','waiting']));await w2.tick();assert.deepEqual(notes,[]);
 // Signed-out poll is reported
 floors=Object.assign(new Error('401'),{status:401});await w.tick();assert.equal(signedOut,1);count++;
 // Review regressions: every foreground tick and final notice remain bound to the opting-in account.
 let authorized=true, includeFinished=false, current='running', delivered=[], release;
 const guard=createWatcher({floors:async()=>[fl('secure')],office:async()=>snap(S(['a',current])),notify:k=>delivered.push(k),authorized:async()=>authorized,includeFinished:()=>includeFinished,now:()=>t});
 await guard.tick();current='completed';await guard.tick();assert.deepEqual(delivered,[],'finished alerts require the separate opt-in');
 current='running';await guard.tick();authorized=false;current='waiting';await guard.tick();assert.deepEqual(delivered,[],'an account switch cannot inherit another account consent');
 authorized=true;await guard.tick();assert.deepEqual(delivered,[],'resuming consent starts from a new baseline');
 current='running';await guard.tick();t+=60000;current='failed';await guard.tick();assert.deepEqual(delivered,[],'a suspended-page gap starts from a baseline');
 const race=createWatcher({floors:async()=>[fl('secure')],office:async()=>{if(release)await new Promise(r=>release=r);return snap(S(['a',current]));},notify:k=>delivered.push(k),authorized:async()=>authorized,now:()=>t});
 current='running';await race.tick();current='waiting';release=true;const pending=race.tick();while(typeof release!=='function')await new Promise(r=>setTimeout(r,0));authorized=false;release();await pending;assert.deepEqual(delivered,[],'account change during a poll suppresses its final notice');
 authorized=true;release=null;current='running';await race.tick();current='failed';release=true;const stopped=race.tick();while(typeof release!=='function')await new Promise(r=>setTimeout(r,0));race.reset();release();await stopped;assert.deepEqual(delivered,[],'turning alerts off invalidates in-flight polls');
 env=fakeEnv({pref:{actor:'u1',push:true,finished:false},permission:'granted',config:{enabled:true,publicKey:keyBytes,subscriptions:2}});await createAlerts(env).reconcile();assert.ok(env.log.includes('register:u1'),'rotated subscription re-registers even when other devices exist');
 const changing={};env=fakeEnv(changing);env.requestPermission=async()=>{changing.session={id:'u2'};return 'granted';};res=await createAlerts(env).enable(false);assert.equal(res.notice,'accountChanged');assert.equal(env.pref.get(),null,'account switch while enabling cannot store stale consent');count++;
 // A prepared dialog invokes browser subscription/permission synchronously inside the user click.
 env=fakeEnv();env.session=async()=>{env.log.push('session');return{id:'u1'};};let enabling=createAlerts(env).enable(false,{actor:'u1',config:{enabled:true,publicKey:keyBytes,subscriptions:0}});assert.equal(env.log[0],'subscribe','Safari subscription must precede any awaited network call');await enabling;
 env=fakeEnv({config:{enabled:false,publicKey:null,subscriptions:0}});env.session=async()=>{env.log.push('session');return{id:'u1'};};enabling=createAlerts(env).enable(false,{actor:'u1',config:{enabled:false,publicKey:null,subscriptions:0}});assert.equal(env.log[0],'requestPermission','foreground permission keeps the direct user gesture');await enabling;count++;
 // An informational completion must never suppress a subsequent attention notice.
 let priorityStatus='running',priorityNotes=[];const priority=createWatcher({floors:async()=>[fl('priority')],office:async()=>snap(S(['p',priorityStatus])),notify:k=>priorityNotes.push(k),now:()=>t,includeFinished:()=>true});await priority.tick();priorityStatus='completed';await priority.tick();priorityStatus='failed';await priority.tick();assert.deepEqual(priorityNotes,['finished','attention'],'attention takes priority within the completion cooldown');count++;
 console.log(`PASS: ${count} PWA alert-controller/watcher scenarios: no automatic prompt, unsupported/denied/dismissed/signed-out, opt-in binding, disable, rollback, account switch/logout/permission revocation, baseline/duplicate/cooldown/reconnect, activity-grant scope.`);
}finally{await rm(dir,{recursive:true,force:true});}
