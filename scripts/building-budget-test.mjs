/** Draw-call budget for the realistic building view: 12 synthetic floors of the real (baked) office must stay cheap, share baked copies, and keep presence floors opaque. Disposable database. */
import assert from 'node:assert/strict'; import { chromium } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os';
const FLOORS=12;
const dir=await mkdtemp(join(tmpdir(),'office-building-budget-'));process.env.BUILDING_DB=join(dir,'test.sqlite');delete process.env.T3_LOCAL_DATA;
const {createServer}=await import('vite');
const html='<!doctype html><body><button id="open">Open building</button><script type="module">import{openBuildingView}from"/src/building-view.ts";document.querySelector("#open").onclick=()=>openBuildingView(()=>{});</script></body>';
const server=await createServer({server:{host:'localhost',port:0},logLevel:'error',plugins:[{name:'budget-harness',configureServer(s){s.middlewares.use((req,res,next)=>{if(!new URL(req.url,'http://local').searchParams.has('harness'))return next();res.setHeader('Content-Type','text/html');res.end(html);});}}]});let browser;
const LOOKS=[{theme:'loft',layout:'lounge',lighting:'warm'},{theme:'boiler',layout:'focus',lighting:'cool'},{theme:'soma',layout:'original',lighting:'original'}];
try{
 await server.listen();const base=server.resolvedUrls.local[0];browser=await chromium.launch({args:['--use-angle=swiftshader','--enable-webgl']});
 const owner=await browser.newContext({viewport:{width:1440,height:1000}});
 const call=async(ctx,path,body,method=body===undefined?'GET':'POST')=>{const r=await ctx.request.fetch(`${base}api/building${path}`,{method,data:body});assert.equal(r.ok(),true,`${path}:${r.status()}`);return r.json();};
 await call(owner,'/register',{handle:'budget_owner',name:'Owner',password:'synthetic-test-password'});
 const presenceIds=[];
 for(let i=0;i<FLOORS-1;i++){
  const ctx=await browser.newContext();const me=await call(ctx,'/register',{handle:'budget_'+i,name:'Budget '+i,password:'synthetic-test-password'});
  // Three looks and two agent counts: floors with the same look and count must share one baked copy.
  await call(ctx,'/office',{name:'Floor '+i,appearance:LOOKS[i%3]});await call(ctx,'/publish',{agents:Array.from({length:i%2?4:2},(_,n)=>({id:`b${i}-${n}`,provider:'codex',status:'running'}))});
  const presence=i%4===3;if(presence)presenceIds.push(me.office.id);
  const inv=await call(ctx,'/invites',{scope:presence?'presence':'activity'});await call(owner,'/accept',{token:inv.token});
 }
 const page=await owner.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'?harness=1');await page.click('#open');await page.waitForSelector('.building-world[data-rendered=true]');
 await page.waitForFunction(n=>document.querySelectorAll('.building-world-labels button').length===n,FLOORS,{timeout:60000});await page.waitForFunction(()=>window.__buildingView.pending()===0,null,{timeout:60000});
 const stats=await page.evaluate(presence=>{
  const v=window.__buildingView;let draws=0;const geos=new Set();let shared=0;const perFloor={};
  v.models.traverse(o=>{if(!o.isMesh&&!o.isLineSegments)return;for(let c=o;c;c=c.parent)if(!c.visible)return;draws++;if(o.isMesh){if(geos.has(o.geometry.uuid))shared++;geos.add(o.geometry.uuid);}let f=o;while(f&&!f.userData.floorId)f=f.parent;if(f)perFloor[f.userData.floorId]=(perFloor[f.userData.floorId]??0)+1;});
  const lights=[];v.models.parent.traverse(o=>{if(o.isLight)lights.push(o.type);});
  const presenceInterior=presence.map(id=>{const g=v.models.children.find(g=>g.userData.floorId===id);let n=0;g.traverse(o=>{if(o.isMesh&&o.geometry.type!=='BoxGeometry')n++;});return n;});
  return{draws,sharedMeshes:shared,maxPerFloor:Math.max(...Object.values(perFloor)),lights:lights.length,presenceInterior};
 },presenceIds);
 // A naive stack of real offices would be ~3,100 meshes per floor; the baked building must stay well under a single live office.
 assert.ok(stats.draws<=60*FLOORS+60,`Whole building draws ${stats.draws} exceed budget ${60*FLOORS+60}`);
 assert.ok(stats.maxPerFloor<=90,`One floor uses ${stats.maxPerFloor} draws (budget 90)`);
 assert.ok(stats.sharedMeshes>=100,`Floors with the same look should share baked geometry (shared meshes: ${stats.sharedMeshes})`);
 assert.ok(stats.lights<=12,`Light count ${stats.lights} must stay small and fixed`);
 assert.deepEqual(stats.presenceInterior,presenceIds.map(()=>0),'Presence-only floors stay opaque blocks');
 // Focusing a floor hides the rest.
 await page.locator('.building-world-labels button').nth(2).click();await page.waitForFunction(()=>document.querySelector('.building-world').dataset.selectedFloor);
 const focused=await page.evaluate(()=>{let n=0;window.__buildingView.models.traverse(o=>{if(!o.isMesh)return;for(let c=o;c;c=c.parent)if(!c.visible)return;n++;});return n;});
 assert.ok(focused<=90,`Focused floor draws ${focused} (budget 90)`);
 assert.deepEqual(errors,[]);
 console.log(`PASS: realistic building budget: ${FLOORS} real floors in ${stats.draws} draws (max ${stats.maxPerFloor}/floor, focused ${focused}), ${stats.sharedMeshes} meshes share baked copies, ${stats.lights} lights, presence floors opaque.`);
}finally{await browser?.close();await server.close();await rm(dir,{recursive:true,force:true});}
