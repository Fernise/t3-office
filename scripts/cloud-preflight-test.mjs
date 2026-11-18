/** Release preflight against disposable synthetic configuration. No account/network/secret reads. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const dir=await mkdtemp(join(tmpdir(),'office-preflight-')),script=resolve('scripts/cloud-trial.mjs');
const cfg={vars:{APP_ORIGIN:'http://localhost:8787'},env:{trial:{name:'trial',vars:{APP_ORIGIN:'https://trial.example.test',GITHUB_ALLOWED_LOGINS:'synthetic',ALLOW_PASSWORD_SIGNUP:'0',API_OPEN:'1',VAPID_SUBJECT:'https://operator.example.test/contact'},d1_databases:[{database_id:'00000000-0000-0000-0000-000000000000'}],observability:{logs:{invocation_logs:false}}}}};
try {
 await mkdir(join(dir,'cloud'));await mkdir(join(dir,'dist'));await writeFile(join(dir,'dist/index.html'),'synthetic');
 const run=async(c)=>{await writeFile(join(dir,'cloud/wrangler.jsonc'),JSON.stringify(c));return spawnSync(process.execPath,[script,'preflight'],{cwd:dir,encoding:'utf8'});};
 assert.equal((await run(cfg)).status,0);
 for(const mutate of[c=>c.env.trial.vars.VAPID_PRIVATE_KEY='synthetic-forbidden',c=>c.vars.VAPID_PRIVATE_KEY='synthetic-forbidden',c=>c.env.trial.vars.VAPID_SUBJECT='http://insecure.example.test',c=>c.env.trial.vars.VAPID_SUBJECT='https://user:password@example.test',c=>c.env.trial.services=[{binding:'PUSH_TRANSPORT',service:'synthetic'}],c=>c.env.trial.vars.PUSH_TRANSPORT='synthetic']){
  const bad=structuredClone(cfg);mutate(bad);assert.notEqual((await run(bad)).status,0);
 }
 console.log('PASS: trial preflight accepts valid synthetic config and rejects private VAPID vars, invalid contacts and production test transport.');
} finally {await rm(dir,{recursive:true,force:true});}
