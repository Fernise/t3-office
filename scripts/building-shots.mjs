/** Screenshots and draw-call counts for the building view with several synthetic floors (disposable database). Usage: node scripts/building-shots.mjs [floors=5] */
import assert from 'node:assert/strict'; import { chromium } from 'playwright';
import { mkdtemp, mkdir, rm } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os';
const extra=Math.max(0,Number(process.argv[2]??5)-1);
const dir=await mkdtemp(join(tmpdir(),'office-building-shots-'));process.env.BUILDING_DB=join(dir,'test.sqlite');delete process.env.T3_LOCAL_DATA;
const {createServer}=await import('vite');
const html='<!doctype html><body><button id="open">Open building</button><script type="module">import{openBuildingView}from"/src/building-view.ts";document.querySelector("#open").onclick=()=>openBuildingView(()=>{});</script></body>';
const server=await createServer({server:{host:'localhost',port:0},logLevel:'error',plugins:[{name:'shots-harness',configureServer(s){s.middlewares.use((req,res,next)=>{if(!new URL(req.url,'http://local').searchParams.has('harness'))return next();res.setHeader('Content-Type','text/html');res.end(html);});}}]});let browser;
const LOOKS=[{theme:'loft',layout:'lounge',lighting:'warm'},{theme:'boiler',layout:'focus',lighting:'cool'},{theme:'soma',layout:'original',lighting:'original'},{theme:'campus',layout:'lounge',lighting:'warm'}];
try{
 await server.listen();const base=server.resolvedUrls.local[0];browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-webgl']});
 const vp=(process.env.VIEWPORT??'1440x1000').split('x').map(Number);const owner=await browser.newContext({viewport:{width:vp[0],height:vp[1]},...(vp[0]<600?{isMobile:true,hasTouch:true}:{})});
 const call=async(ctx,path,body,method=body===undefined?'GET':'POST')=>{const r=await ctx.request.fetch(`${base}api/building${path}`,{method,data:body});assert.equal(r.ok(),true,`${path}:${r.status()} ${await r.text()}`);return r.json();};
 await call(owner,'/register',{handle:'you_shots',name:'You',password:'synthetic-test-password'});
 for(let i=0;i<extra;i++){
  const ctx=await browser.newContext();await call(ctx,'/register',{handle:'friend_'+i,name:'Friend '+i,password:'synthetic-test-password'});
  const presence=i===1;await call(ctx,'/office',{name:['Maya studio','Quiet room','Kai lab','Rio desk','Noa corner','Lee loft','Ana hub'][i%7],appearance:LOOKS[i%LOOKS.length]});
  await call(ctx,'/publish',{agents:Array.from({length:2+i%4},(_,n)=>({id:`f${i}-${n}`,provider:n%2?'claude':'codex',status:'running'}))});
  const inv=await call(ctx,'/invites',{scope:presence?'presence':'activity'});await call(owner,'/accept',{token:inv.token});
 }
 const page=await owner.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'?harness=1'+(process.env.Q??''));await page.click('#open');await page.waitForSelector('.building-world[data-rendered=true]');
 await page.waitForFunction(n=>document.querySelectorAll('.building-world-labels button').length===n,extra+1,{timeout:60000});await page.waitForFunction(()=>window.__buildingView.pending()===0,null,{timeout:60000});await page.waitForTimeout(2500);
 const draws=()=>page.evaluate(()=>{let n=0,tris=0;window.__buildingView.models.traverse(o=>{if(!o.isMesh&&!o.isLineSegments)return;for(let c=o;c;c=c.parent)if(!c.visible)return;n++;if(o.isMesh)tris+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;});return{draws:n,triangles:Math.round(tris)};});
 const fps=()=>page.evaluate(async()=>{let n=0;const s=performance.now();await new Promise(r=>{const f=()=>{n++;if(performance.now()-s<2000)requestAnimationFrame(f);else r();};requestAnimationFrame(f);});return Math.round(n/2);});
 await mkdir('shots',{recursive:true});
 const whole=await draws();await page.screenshot({path:`shots/building-real-${extra+1}${process.env.TAG??''}.png`});
 const label=page.locator('.building-world-labels button').nth(Math.min(1,extra));await label.click();await page.waitForTimeout(2500);const focused=await draws();await page.screenshot({path:`shots/building-real-${extra+1}${process.env.TAG??''}-focus.png`});
 console.log(JSON.stringify({floors:extra+1,whole,focused,rafPerSecondSoftwareGL:await fps(),errors}));
}finally{await browser?.close();await server.close();await rm(dir,{recursive:true,force:true});}
