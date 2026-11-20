/** Optional Web Push for the signed-in owner's own agent status changes. Payloads are generic; guests never receive background pushes.
 * Per device: own-office on/off, finished on/off and quiet hours (checked here, right before sending, because a push must always be shown). */
import{randomUUID}from'node:crypto';
import{authorizedInput,fail,limit,type AuthContext,type Sql,type User}from'./context';
import{isAllowedPushEndpoint,validateSubscriptionKeys,vapidFrom,validateVapid,sendPush,type PushKind}from'../src/webpush';
import{transitions,ALERT_COOLDOWN_MS,ALERT_HISTORY,parseQuiet,inQuietHours,type AgentState}from'../src/alert-rules';
export interface PushEnv{VAPID_PUBLIC_KEY?:string;VAPID_PRIVATE_KEY?:string;VAPID_SUBJECT?:string;PUSH_TRANSPORT?:Fetcher}
export const MAX_SUBSCRIPTIONS=5;
/** Eligibility is re-evaluated in SQL at the moment of sending: live credential (session or publisher key), session that enabled the alert still valid, office not paused and not superseded. */
const eligible=(sub:string,live:string)=>`SELECT 1 FROM push_subscriptions p JOIN sessions s ON s.token=p.session AND s.user=p.user AND s.expires>? JOIN offices o ON o.owner=p.user AND o.paused=0 AND o.epoch=? WHERE ${sub} AND ${live}`;
export function pushNotifier(deps:{sql:Sql;env:PushEnv;defer:(p:Promise<unknown>)=>void}){
 const vapid=vapidFrom(deps.env);
 /** Called after a successful publish with the state before it. Returns without work when push is unconfigured, the baseline is untrusted, or nothing changed. */
 return(user:User,previous:AgentState[]|null,next:AgentState[],epoch:number,live:()=>string)=>{
  if(!vapid)return;const t=transitions(previous,next);if(!t.attention&&!t.finished)return;const kind:PushKind=t.attention?'attention':'finished';
  deps.defer((async()=>{try{
   const{sql}=deps;await sql('DELETE FROM push_subscriptions WHERE user=? AND session NOT IN(SELECT token FROM sessions WHERE user=? AND expires>?)',user.id,user.id,Date.now()).run();
   const rows=(await sql(`SELECT p.id,p.endpoint,p.p256dh,p.auth,p.quiet_start,p.quiet_end,p.tz FROM push_subscriptions p WHERE p.user=? AND p.own=1 AND (?='attention' OR p.finished=1)`,user.id,kind).all<{id:string;endpoint:string;p256dh:string;auth:string;quiet_start:number|null;quiet_end:number|null;tz:string|null}>()).results;if(!rows.length)return;
   const now=Date.now(),claim=await sql('INSERT INTO push_state(user,last,kind) VALUES(?,?,?) ON CONFLICT(user) DO UPDATE SET last=excluded.last,kind=excluded.kind WHERE push_state.last<=? OR (excluded.kind=\'attention\' AND push_state.kind=\'finished\') RETURNING last',user.id,now,kind,now-ALERT_COOLDOWN_MS).first();if(!claim)return;
   const transport=deps.env.PUSH_TRANSPORT?(r:Request)=>deps.env.PUSH_TRANSPORT!.fetch(r):undefined;
   let sent=0,held=0;
   for(const row of rows){
    // Quiet hours hold the alert for this device (recorded in Recent alerts); nothing is sent to its push service.
    if(row.quiet_start!==null&&row.quiet_end!==null&&row.tz&&inQuietHours({start:row.quiet_start,end:row.quiet_end,tz:row.tz},Date.now())){held++;continue;}
    // Recheck right before disclosure to the push service: a revoked key, ended session or paused office sends nothing.
    const authorized=async()=>!!await sql(eligible('p.id=?',live()),Date.now(),epoch,row.id).first();
    if(!await authorized())continue;
    const outcome=await sendPush({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},kind,vapid,transport,{authorized});
    if(outcome==='sent')sent++;
    if(outcome==='gone')await sql('DELETE FROM push_subscriptions WHERE id=?',row.id).run();
    else if(outcome==='misconfigured')console.error(JSON.stringify({event:'push-misconfigured'}));
   }
   if(sent||held)await logAlert(sql,user.id,kind,sent,held);
  }catch{console.error(JSON.stringify({event:'push-failed'}));}})());
 };
}
/** Recent alerts for this account: kind and how many devices got it or held it. No content, ever. */
async function logAlert(sql:Sql,user:string,kind:PushKind,sent:number,held:number){
 await sql('INSERT INTO push_log VALUES(?,?,?,?,?,?)',randomUUID(),user,Date.now(),kind,sent,held).run();
 await sql('DELETE FROM push_log WHERE user=? AND id NOT IN(SELECT id FROM push_log WHERE user=? ORDER BY at DESC,rowid DESC LIMIT ?)',user,user,ALERT_HISTORY).run();
}
const PATHS=['/push/config','/push/subscriptions','/push/settings','/push/test','/push/history'];
export async function cloudPush(ctx:AuthContext,env:PushEnv):Promise<Response|null>{
 const{sql,path,method,user,reply}=ctx;if(!PATHS.includes(path))return null;
 if(ctx.publisher)fail(401,'Publish-only credential.');const candidate=vapidFrom(env),vapid=candidate&&await validateVapid(candidate)?candidate:null;
 if(path==='/push/history'){if(method!=='GET')fail(405,'Method not allowed.');return reply(200,{alerts:(await sql(`SELECT at,kind,sent,held FROM push_log WHERE user=? AND ${ctx.live()} ORDER BY at DESC,rowid DESC LIMIT ?`,user.id,ALERT_HISTORY).all()).results});}
 if(path==='/push/config'){if(method!=='GET')fail(405,'Method not allowed.');const n=await sql(`SELECT COUNT(*) n FROM push_subscriptions p WHERE p.user=? AND ${ctx.live()}`,user.id).first<{n:number}>();return reply(200,{enabled:!!vapid,publicKey:vapid?.publicKey??null,subscriptions:n?.n??0});}
 if(method!=='POST'&&method!=='DELETE')fail(405,'Method not allowed.');
 const input=await authorizedInput(ctx);
 if(method==='POST'&&path==='/push/settings'){
  // Per-device choices. Only the account that registered this device can change them.
  if(typeof input.endpoint!=='string'||input.endpoint.length>1024)fail(400,'Invalid subscription.');
  if((input.finished!==undefined&&typeof input.finished!=='boolean')||(input.own!==undefined&&typeof input.own!=='boolean'))fail(400,'Invalid alert choice.');
  const setQuiet='quiet' in input,quiet=setQuiet?parseQuiet(input.quiet):null;if(quiet===undefined)fail(400,'Invalid quiet hours.');
  await limit(sql,'push-settings:'+user.id,60,3600000,'Too many alert changes. Try again later.');
  const flag=(v:unknown)=>v===undefined?-1:v?1:0;
  const r=await sql(`UPDATE push_subscriptions SET finished=COALESCE(NULLIF(?,-1),finished),own=COALESCE(NULLIF(?,-1),own),quiet_start=CASE WHEN ?=1 THEN NULLIF(?,-1) ELSE quiet_start END,quiet_end=CASE WHEN ?=1 THEN NULLIF(?,-1) ELSE quiet_end END,tz=CASE WHEN ?=1 THEN NULLIF(?,'') ELSE tz END WHERE endpoint=? AND user=? AND ${ctx.live()}`,flag(input.finished),flag(input.own),setQuiet?1:0,quiet?.start??-1,setQuiet?1:0,quiet?.end??-1,setQuiet?1:0,quiet?.tz??'',input.endpoint,user.id).run();
  if(!r.meta.changes)fail(404,'This device has no alerts registered.');return reply(200,{ok:true});
 }
 if(method==='POST'&&path==='/push/test'){
  // One generic test notice to this device only. Ignores quiet hours (the person asked for it) but not authorization.
  if(typeof input.endpoint!=='string'||input.endpoint.length>1024)fail(400,'Invalid subscription.');
  if(!vapid)fail(503,'Background alerts are not configured on this server.');
  await limit(sql,'push-test:'+user.id,5,600000,'Please wait a few minutes before sending another test.');
  const row=await sql(`SELECT p.id,p.endpoint,p.p256dh,p.auth FROM push_subscriptions p WHERE p.endpoint=? AND p.user=? AND ${ctx.live()}`,input.endpoint,user.id).first<{id:string;endpoint:string;p256dh:string;auth:string}>();if(!row)fail(404,'This device has no alerts registered.');
  const authorized=async()=>!!await sql(`SELECT 1 FROM push_subscriptions p WHERE p.id=? AND p.user=? AND ${ctx.live()}`,row.id,user.id).first();
  const outcome=await sendPush({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},'test',vapid,env.PUSH_TRANSPORT?(r:Request)=>env.PUSH_TRANSPORT!.fetch(r):undefined,{authorized});
  if(outcome==='gone')await sql('DELETE FROM push_subscriptions WHERE id=?',row.id).run();
  await logAlert(sql,user.id,'test',outcome==='sent'?1:0,0);
  return reply(200,{ok:true,delivered:outcome==='sent',gone:outcome==='gone'});
 }
 if(path!=='/push/subscriptions')fail(405,'Method not allowed.');
 if(method==='DELETE'){if(typeof input.endpoint!=='string'||input.endpoint.length>1024)fail(400,'Invalid subscription.');await sql(`DELETE FROM push_subscriptions WHERE endpoint=? AND user=? AND ${ctx.live()}`,input.endpoint,user.id).run();return reply(200,{ok:true});}
 if(!vapid)fail(503,'Background alerts are not configured on this server.');
 if(!isAllowedPushEndpoint(input.endpoint))fail(400,'That push service is not supported.');const keys=await validateSubscriptionKeys(input.keys);if(!keys)fail(400,'Invalid subscription keys.');
 if(input.finished!==undefined&&typeof input.finished!=='boolean')fail(400,'Invalid alert choice.');
 if(input.own!==undefined&&typeof input.own!=='boolean')fail(400,'Invalid alert choice.');const quiet=parseQuiet(input.quiet);if(quiet===undefined)fail(400,'Invalid quiet hours.');
 await limit(sql,'push:'+user.id,20,3600000,'Too many alert changes. Try again later.');
 await sql(`DELETE FROM push_subscriptions WHERE user=? AND session NOT IN(SELECT token FROM sessions WHERE user=? AND expires>?) AND ${ctx.live()}`,user.id,user.id,Date.now()).run();
 const r=await sql(`INSERT INTO push_subscriptions(id,endpoint,user,session,p256dh,auth,finished,created,own,quiet_start,quiet_end,tz) SELECT ?,?,?,?,?,?,?,?,?,NULLIF(?,-1),NULLIF(?,-1),NULLIF(?,'') WHERE ${ctx.live()} AND (SELECT COUNT(*) FROM push_subscriptions WHERE user=? AND endpoint<>?)<${MAX_SUBSCRIPTIONS} ON CONFLICT(endpoint) DO UPDATE SET user=excluded.user,session=excluded.session,p256dh=excluded.p256dh,auth=excluded.auth,finished=excluded.finished,created=excluded.created,own=excluded.own,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,tz=excluded.tz WHERE push_subscriptions.user=excluded.user OR (push_subscriptions.p256dh=excluded.p256dh AND push_subscriptions.auth=excluded.auth)`,randomUUID(),input.endpoint,user.id,ctx.token,keys.p256dh,keys.auth,input.finished?1:0,Date.now(),input.own===false?0:1,quiet?.start??-1,quiet?.end??-1,quiet?.tz??'',user.id,input.endpoint).run();
 if(!r.meta.changes)fail(409,'Alert limit reached or session expired.');return reply(200,{ok:true});
}
