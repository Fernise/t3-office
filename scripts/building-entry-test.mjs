/** Synthetic floor-entry camera continuity, cancellation and live-refresh regressions. No private data or GPU required. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const dir = await mkdtemp(join(tmpdir(), 'office-building-entry-'));
process.env.BUILDING_DB = join(dir, 'test.sqlite'); delete process.env.T3_LOCAL_DATA;
const { createServer } = await import('vite');
const html = `<!doctype html><body><button id="open">Open building</button><canvas id="scene"></canvas><script type="module">
import * as THREE from '/node_modules/three/build/three.module.js';
import { openBuildingView } from '/src/building-view.ts';
import { FOOTPRINT } from '/src/floor-bake.ts';
import { THEMES } from '/src/themes.ts';
const pose = { target: new THREE.Vector3(4.5, 2.1, -.8), az: -.35, el: .62, half: 8.3 };
const expected = new THREE.OrthographicCamera(-pose.half*innerWidth/innerHeight,pose.half*innerWidth/innerHeight,pose.half,-pose.half,.1,200);
expected.position.copy(pose.target).add(new THREE.Vector3(Math.sin(pose.az)*Math.cos(pose.el),Math.sin(pose.el),Math.cos(pose.az)*Math.cos(pose.el)).multiplyScalar(60)); expected.lookAt(pose.target); expected.updateMatrixWorld();
const probes = [new THREE.Vector3(0,0,0),new THREE.Vector3(8,1,-4),new THREE.Vector3(-7,3,5)];
window.__expected = probes.map(p=>p.clone().project(expected).toArray().slice(0,2));
const host = { canvas: document.querySelector('#scene'), theme: THEMES[0], view: ()=>pose, sync() {}, render(scene,camera) {
 const v=window.__buildingView, id=v?.selected(), floor=v?.models.children.find(o=>o.userData.floorId===id);
 if (!floor) return;
 window.__frames ??= []; window.__frames.push({at:performance.now(),half:camera.top,xy:probes.map(p=>p.clone().add(floor.position).project(camera).toArray().slice(0,2))});
}};
document.querySelector('#open').onclick=()=>openBuildingView(()=>{},host);
</script></body>`;
const server = await createServer({ server: { host: 'localhost', port: 0 }, logLevel: 'error', plugins: [{ name: 'entry-harness', configureServer(s) { s.middlewares.use((req,res,next)=> { if (!new URL(req.url,'http://local').searchParams.has('harness')) return next(); res.setHeader('Content-Type','text/html'); res.end(html); }); } }] });
let browser;
try {
 await server.listen(); const base=server.resolvedUrls.local[0]; browser=await chromium.launch();
 const owner=await browser.newContext({viewport:{width:1280,height:800}}), friend=await browser.newContext();
 const call=async(ctx,path,body,method=body===undefined?'GET':'POST')=> { const r=await ctx.request.fetch(`${base}api/building${path}`,{method,data:body}); assert.ok(r.ok(),`${path}: ${r.status()}`); return r.json(); };
 const you=await call(owner,'/register',{handle:'entry_owner',name:'Owner',password:'synthetic-test-password'});
 const maya=await call(friend,'/register',{handle:'entry_friend',name:'Friend',password:'synthetic-test-password'});
 const invite=await call(friend,'/invites',{scope:'activity'}); await call(owner,'/accept',{token:invite.token});
 const page=await owner.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
 const open=async(suffix='')=> { await page.goto(`${base}?harness=1${suffix}`);await page.click('#open');await page.waitForFunction(()=>window.__buildingView?.pending()===0); };
 const select=async(id)=> { await page.locator('.building-world-labels button').evaluateAll((buttons,id)=>buttons.find(b=>b.dataset.floor===id).click(),id); await page.waitForFunction(()=>!window.__buildingView.moving()); };
 const enter=()=>page.locator('[data-action=enter]').click();
 await open(); await select(you.office.id); await enter(); await page.waitForTimeout(200);
 assert.equal(await page.locator('.building-world').evaluate(el=>el.classList.contains('diving')),true);
 assert.equal(await page.locator('.building-world header').evaluate(el=>el.inert),true);
 await page.keyboard.press('Escape');assert.equal(await page.locator('.building-world').evaluate(el=>el.classList.contains('diving')),false);
 assert.equal(await page.locator('.building-world header').evaluate(el=>el.inert),false);
 await page.getByRole('button',{name:'Whole building',exact:true}).click();await select(you.office.id);
 // Release a changed directory response while entering: a routine activity refresh must not reset the camera tween.
 let release, captured; const gate=new Promise(r=>release=r), ready=new Promise(r=>captured=r);
 await page.route('**/api/building/floors',async route=> {const response=await route.fetch();const body=await response.json();body.floors.find(f=>f.isOwner).agentCount=3;captured();await gate;await route.fulfill({response,json:body});});
 await ready;await page.evaluate(()=>window.__frames=[]);const start=Date.now();await enter();await page.waitForTimeout(200);release();await page.unrouteAll({behavior:'wait'});
 await page.locator('.building-world').waitFor({state:'detached'});assert.ok(Date.now()-start>=1150,'Own entry glides rather than cutting');
 const result=await page.evaluate(()=>({frames:window.__frames,expected:window.__expected}));const landing=result.frames.at(-1);
 assert.ok(result.frames.length>15,'Camera renders throughout the glide');
 assert.ok(result.frames.some(f=>f.half>8.4&&f.half<result.frames[0].half-.05),'Zoom has intermediate frames');
 for(let i=0;i<3;i++)for(let j=0;j<2;j++)assert.ok(Math.abs(landing.xy[i][j]-result.expected[i][j])<1e-8,'Last building frame matches live office projection');
 assert.equal(await page.locator('.elevator-overlay').count(),0);assert.equal(await page.locator('body > #scene').count(),1,'Host canvas restored');
 // Entering the shared office already under the building must also restore it without reloading or getting stuck.
 await open(`&source=shared&floor=${maya.office.id}`);await select(maya.office.id);const current=page.url();await enter();await page.locator('.building-world').waitFor({state:'detached'});assert.equal(page.url(),current);
 // A failed remote trip restores the building controls when dismissed.
 await open();await select(maya.office.id);await page.route(`**/api/building/offices/${maya.office.id}`,route=>route.fulfill({status:403,contentType:'application/json',body:'{"error":"synthetic revocation"}'}));
 await enter();await page.locator('.elevator-overlay[data-phase=failed]').waitFor();await page.getByRole('button',{name:'Back to office',exact:true}).last().click();
 assert.equal(await page.locator('.building-world').evaluate(el=>el.classList.contains('diving')),false);assert.equal(await page.locator('.building-world header').evaluate(el=>el.inert),false);
 await page.getByRole('button',{name:'Whole building',exact:true}).click();await page.unrouteAll({behavior:'wait'});
 // A sharing-scope change during entry must clear the old interior rather than defer it as activity churn.
 await open();await select(maya.office.id);
 let releaseScope, capturedScope;const scopeGate=new Promise(r=>releaseScope=r),scopeReady=new Promise(r=>capturedScope=r);
 await page.route('**/api/building/floors',async route=> {const response=await route.fetch();const body=await response.json();const floor=body.floors.find(f=>f.id===maya.office.id);Object.assign(floor,{scope:'presence',appearance:undefined,agentCount:0,areas:[]});capturedScope();await scopeGate;await route.fulfill({response,json:body});});
 await scopeReady;await enter();await page.waitForTimeout(200);releaseScope();
 await page.waitForFunction(()=>!document.querySelector('.building-world').classList.contains('diving'));
 await page.waitForFunction(id=>document.querySelector('.building-world').dataset.selectedFloor===id,maya.office.id);
 assert.match(await page.locator('.building-world-detail').innerText(),/Presence only/);
 assert.equal(await page.evaluate(id=>{const floor=window.__buildingView.models.children.find(o=>o.userData.floorId===id);return floor.children.every(o=>o.isLineSegments||(o.isMesh&&o.geometry.type==='BoxGeometry'));},maya.office.id),true,'Narrower permission clears the baked interior immediately');
 await page.unrouteAll({behavior:'wait'});
 // Reduced motion restores the office immediately.
 await page.emulateMedia({reducedMotion:'reduce'});await select(you.office.id);const reducedStart=Date.now();await enter();await page.locator('.building-world').waitFor({state:'detached'});assert.ok(Date.now()-reducedStart<500);
 assert.deepEqual(errors,[]);console.log('PASS: eased entry, exact final camera framing, Escape recovery, refresh during entry, scope-change clearing, current shared floor, failed-travel recovery, canvas restoration and reduced motion.');
} finally { await browser?.close();await server.close();await rm(dir,{recursive:true,force:true}); }
