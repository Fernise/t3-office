/** Optional Web Push for the signed-in owner's own agent status changes. Payloads are generic; guests never receive background pushes. */
import{randomUUID}from'node:crypto';
import{authorizedInput,fail,limit,type AuthContext,type Sql,type User}from'./context';
import{isAllowedPushEndpoint,validateSubscriptionKeys,vapidFrom,validateVapid,sendPush,type PushKind}from'../src/webpush';
import{transitions,ALERT_COOLDOWN_MS,type AgentState}from'../src/alert-rules';
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
   const rows=(await sql(`SELECT p.id,p.endpoint,p.p256dh,p.auth FROM push_subscriptions p WHERE p.user=? AND (?='attention' OR p.finished=1)`,user.id,kind).all<{id:string;endpoint:string;p256dh:string;auth:string}>()).results;if(!rows.length)return;
   const now=Date.now(),claim=await sql('INSERT INTO push_state(user,last,kind) VALUES(?,?,?) ON CONFLICT(user) DO UPDATE SET last=excluded.last,kind=excluded.kind WHERE push_state.last<=? OR (excluded.kind=\'attention\' AND push_state.kind=\'finished\') RETURNING last',user.id,now,kind,now-ALERT_COOLDOWN_MS).first();if(!claim)return;
   const transport=deps.env.PUSH_TRANSPORT?(r:Request)=>deps.env.PUSH_TRANSPORT!.fetch(r):undefined;
   for(const row of rows){
    // Recheck right before disclosure to the push service: a revoked key, ended session or paused office sends nothing.
    const authorized=async()=>!!await sql(eligible('p.id=?',live()),Date.now(),epoch,row.id).first();
    if(!await authorized())continue;
    const outcome=await sendPush({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},kind,vapid,transport,{authorized});
    if(outcome==='gone')await sql('DELETE FROM push_subscriptions WHERE id=?',row.id).run();
    else if(outcome==='misconfigured')console.error(JSON.stringify({event:'push-misconfigured'}));
   }
  }catch{console.error(JSON.stringify({event:'push-failed'}));}})());
 };
}
export async function cloudPush(ctx:AuthContext,env:PushEnv):Promise<Response|null>{
 const{sql,path,method,user,reply}=ctx;if(path!=='/push/config'&&path!=='/push/subscriptions')return null;
 if(ctx.publisher)fail(401,'Publish-only credential.');const candidate=vapidFrom(env),vapid=candidate&&await validateVapid(candidate)?candidate:null;
 if(path==='/push/config'){if(method!=='GET')fail(405,'Method not allowed.');const n=await sql(`SELECT COUNT(*) n FROM push_subscriptions p WHERE p.user=? AND ${ctx.live()}`,user.id).first<{n:number}>();return reply(200,{enabled:!!vapid,publicKey:vapid?.publicKey??null,subscriptions:n?.n??0});}
 if(method!=='POST'&&method!=='DELETE')fail(405,'Method not allowed.');
 const input=await authorizedInput(ctx);
 if(method==='DELETE'){if(typeof input.endpoint!=='string'||input.endpoint.length>1024)fail(400,'Invalid subscription.');await sql(`DELETE FROM push_subscriptions WHERE endpoint=? AND user=? AND ${ctx.live()}`,input.endpoint,user.id).run();return reply(200,{ok:true});}
 if(!vapid)fail(503,'Background alerts are not configured on this server.');
 if(!isAllowedPushEndpoint(input.endpoint))fail(400,'That push service is not supported.');const keys=await validateSubscriptionKeys(input.keys);if(!keys)fail(400,'Invalid subscription keys.');
 if(input.finished!==undefined&&typeof input.finished!=='boolean')fail(400,'Invalid alert choice.');
 await limit(sql,'push:'+user.id,20,3600000,'Too many alert changes. Try again later.');
 await sql(`DELETE FROM push_subscriptions WHERE user=? AND session NOT IN(SELECT token FROM sessions WHERE user=? AND expires>?) AND ${ctx.live()}`,user.id,user.id,Date.now()).run();
 const r=await sql(`INSERT INTO push_subscriptions SELECT ?,?,?,?,?,?,?,? WHERE ${ctx.live()} AND (SELECT COUNT(*) FROM push_subscriptions WHERE user=? AND endpoint<>?)<${MAX_SUBSCRIPTIONS} ON CONFLICT(endpoint) DO UPDATE SET user=excluded.user,session=excluded.session,p256dh=excluded.p256dh,auth=excluded.auth,finished=excluded.finished,created=excluded.created WHERE push_subscriptions.user=excluded.user OR (push_subscriptions.p256dh=excluded.p256dh AND push_subscriptions.auth=excluded.auth)`,randomUUID(),input.endpoint,user.id,ctx.token,keys.p256dh,keys.auth,input.finished?1:0,Date.now(),user.id,input.endpoint).run();
 if(!r.meta.changes)fail(409,'Alert limit reached or session expired.');return reply(200,{ok:true});
}
