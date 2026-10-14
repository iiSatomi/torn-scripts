'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {scripts,readState,planRelease,payloadHash,metadataFile,assertDistribution}=require('./userscript-release-core.cjs');
const workspace=path.resolve(__dirname,'..');
function run(root,args){const result=cp.spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:900000});if(result.status!==0)throw new Error('Failed: node '+args.join(' ')+'\n'+(result.stdout||'')+(result.stderr||''));}
function releaseState(root,script){return readState(JSON.parse(fs.readFileSync(path.join(root,script.state),'utf8')));}
function buildAll(root){require('./check-managed-secrets.cjs').scanFiles(root);for(const script of scripts)run(root,[script.builder,...script.args]);}
function assertReleased(root){
 for(const script of scripts){
  const state=releaseState(root,script),source=fs.readFileSync(path.join(root,script.file),'utf8');
  assertDistribution(source,script,state.version);
  if(state.version!==state.releasedVersion||payloadHash(source)!==state.payloadSha256)throw new Error(script.id+' is not a verified release');
  if(fs.readFileSync(path.join(root,script.meta),'utf8')!==metadataFile(source))throw new Error(script.id+' metadata differs from install file');
 }
}
function prepare({root=workspace,build=()=>buildAll(root),check=()=>run(root,['tools/check-managed-userscripts.cjs','--browser'])}={}){
 root=path.resolve(root);
 // Only this operation's generated artifacts/state are restored on failure.
 // Source edits and unrelated dirty work are never reset or staged here.
 const owned=[...scripts.flatMap(script=>[script.state,script.file,script.meta]),'script-hub/dist/Torn_Script_Hub_Example.user.js','script-hub/dist/Torn_Script_UI_Showcase.user.js'];
 const before=new Map(owned.map(file=>{const absolute=path.join(root,file);return[file,fs.existsSync(absolute)?fs.readFileSync(absolute):null];}));
 const states=scripts.map(script=>releaseState(root,script));
 try{
  build();
  const plans=scripts.map((script,index)=>({id:script.id,...planRelease(states[index],fs.readFileSync(path.join(root,script.file),'utf8'))}));
  for(const [index,script]of scripts.entries())fs.writeFileSync(path.join(root,script.state),JSON.stringify({...states[index],version:plans[index].version},null,2)+'\n');
  build();
  for(const [index,script]of scripts.entries())assertDistribution(fs.readFileSync(path.join(root,script.file),'utf8'),script,plans[index].version);
  check();
  // Rebuild after checks: tests may build examples, and source changes during a
  // long local check must never be silently included in a verified release.
  build();
  for(const [index,script]of scripts.entries()){
   const source=fs.readFileSync(path.join(root,script.file),'utf8'),plan=plans[index];
   assertDistribution(source,script,plan.version);
   if(payloadHash(source)!==plan.payloadSha256)throw new Error(script.id+' changed during verification; run checks again');
   const current=releaseState(root,script);if(current.version!==plan.version)throw new Error(script.id+' release state changed during verification');
   fs.writeFileSync(path.join(root,script.state),JSON.stringify({version:plan.version,releasedVersion:plan.version,payloadSha256:plan.payloadSha256},null,2)+'\n');
  }
  assertReleased(root);return plans;
 }catch(error){
  for(const [file,bytes]of before){const absolute=path.join(root,file);if(bytes===null){if(fs.existsSync(absolute))fs.unlinkSync(absolute);}else fs.writeFileSync(absolute,bytes);}
  throw error;
 }
}
if(require.main===module){
 try{
  if(process.argv.length!==3||!['--prepare','--check'].includes(process.argv[2]))throw new Error('Use --prepare (build and verify releases) or --check (verify released artifacts).');
  if(process.argv[2]==='--check'){assertReleased(workspace);console.log('PASS both script-specific release artifacts and metadata');}
  else for(const plan of prepare())console.log(plan.id+': '+plan.version+(plan.changed?' — verified update prepared':' — unchanged'));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={prepare,assertReleased};
