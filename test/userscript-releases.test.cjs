'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {scripts,readState,planRelease,payloadHash,metadataFile,assertDistribution}=require('../tools/userscript-release-core.cjs');
function source(script,version='1.0.0',body='void 0;'){
 return '// ==UserScript==\n// @name Test script\n// @namespace test.script\n// @version '+version+'\n// @updateURL '+script.updateURL+'\n// @downloadURL '+script.downloadURL+'\n// ==/UserScript==\n'+(script.id==='war-payout'?'const WAR_PAYOUT_RELEASE_VERSION = '+JSON.stringify(version)+';\n':'')+body+'\n';
}
const state=(version='1.0.0',hash=null)=>({version,releasedVersion:hash?version:null,payloadSha256:hash});
test('first release keeps its requested version and produces independent update endpoints',()=>{
 const [hub,payout]=scripts;const result=planRelease(state(),source(hub));assert.equal(result.version,'1.0.0');assert.equal(result.changed,true);
 assert.notEqual(hub.updateURL,payout.updateURL);assert.notEqual(hub.downloadURL,payout.downloadURL);
 assert.equal(metadataFile(source(hub)).includes('void 0'),false);assert.equal(metadataFile(source(hub)).includes('@version 1.0.0'),true);
});
test('identical payloads do not churn versions and version fields are excluded from payload hash',()=>{
 for(const script of scripts){const original=source(script);const hash=payloadHash(original);const saved=state('1.0.0',hash);assert.equal(planRelease(saved,original).changed,false);assert.equal(payloadHash(source(script,'1.2.3')),hash);}
});
test('only changed scripts increment; manual higher versions are honored',()=>{
 const [hub,payout]=scripts;const h=state('1.0.0',payloadHash(source(hub))),p=state('1.0.0',payloadHash(source(payout)));
 assert.equal(planRelease(h,source(hub,'1.0.0','void 1;')).version,'1.0.1');assert.equal(planRelease(p,source(payout)).version,'1.0.0');
 assert.equal(planRelease({...h,version:'2.0.0'},source(hub,'2.0.0')).version,'2.0.0');
});
test('bad state, backwards versions and invalid metadata fail closed',()=>{
 assert.throws(()=>readState({version:'1.0',releasedVersion:null,payloadSha256:null}),/version/i);
 assert.throws(()=>readState({version:'1.0.0',releasedVersion:'2.0.0',payloadSha256:'a'.repeat(64)}),/backwards/i);
 assert.throws(()=>readState({version:'1.0.0',releasedVersion:'1.0.0',payloadSha256:'bad'}),/hash/i);
 assert.throws(()=>metadataFile('void 0'),/metadata/i);
 assert.throws(()=>assertDistribution(source(scripts[0]).replace(scripts[0].downloadURL,'https://example.invalid/script.js'),scripts[0],'1.0.0'),/downloadURL/i);
});
test('payout registration and userscript metadata must agree on one release version',()=>{
 const payout=scripts[1];assert.doesNotThrow(()=>assertDistribution(source(payout),payout,'1.0.0'));
 assert.throws(()=>assertDistribution(source(payout).replace('const WAR_PAYOUT_RELEASE_VERSION = "1.0.0"','const WAR_PAYOUT_RELEASE_VERSION = "0.9.0"'),payout,'1.0.0'),/registration/i);
});
test('failed checks restore exact original release state and artifacts, successful checks are idempotent',()=>{
 const {prepare}=require('../tools/release-userscripts.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'torn-release-test-'));
 try{
  for(const script of scripts){for(const file of [script.state,script.file,script.meta])fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,script.state),JSON.stringify(state()));fs.writeFileSync(path.join(root,script.file),'original bytes');}
  const original=scripts.map(script=>fs.readFileSync(path.join(root,script.state),'utf8'));
  function build(){for(const script of scripts){const version=JSON.parse(fs.readFileSync(path.join(root,script.state),'utf8')).version;const text=source(script,version);fs.writeFileSync(path.join(root,script.file),text);fs.writeFileSync(path.join(root,script.meta),metadataFile(text));}}
  assert.throws(()=>prepare({root,build,check:()=>{throw new Error('synthetic failing check');}}),/synthetic failing check/);
  for(const [i,script]of scripts.entries()){assert.equal(fs.readFileSync(path.join(root,script.state),'utf8'),original[i]);assert.equal(fs.readFileSync(path.join(root,script.file),'utf8'),'original bytes');assert.equal(fs.existsSync(path.join(root,script.meta)),false);}
  assert.equal(prepare({root,build,check:()=>{}}).every(plan=>plan.changed),true);
  assert.equal(prepare({root,build,check:()=>{}}).every(plan=>!plan.changed),true);
 }finally{const resolved=fs.realpathSync(root),base=fs.realpathSync(os.tmpdir());if(!resolved.startsWith(base+path.sep)||!path.basename(resolved).startsWith('torn-release-test-'))throw new Error('Refusing unsafe test cleanup');fs.rmSync(resolved,{recursive:true,force:true});}
});
