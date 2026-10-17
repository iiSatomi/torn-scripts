'use strict';
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function run(args){const r=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
run(['war-contracts/tools/build.cjs']);
for(const file of ['war-contracts/src/domain.cjs','war-contracts/src/http.cjs','war-contracts/src/client.js','war-contracts/src/styles.js','war-contracts/dist/Torn_War_Contracts_Hub.user.js'])run(['--check',file]);
new vm.Script(fs.readFileSync(path.join(root,'war-contracts/service/Code.gs'),'utf8'),{filename:'Code.gs'});
const artifact=path.join(root,'war-contracts/dist/Torn_War_Contracts_Hub.user.js');
const before=fs.readFileSync(artifact,'utf8');
new vm.Script(before.replace(/[\u201c\u201d]/g,'"').replace(/[\u2018\u2019]/g,"'"),{filename:'PDA-prepared-userscript.js'});
run(['--test','war-contracts/test/domain.test.cjs','war-contracts/test/http.test.cjs','war-contracts/test/service.test.cjs','war-contracts/test/main-sheet.test.cjs']);
if(process.argv.includes('--browser')){run(['war-contracts/test/client-browser.cjs']);run(['war-contracts/test/hub-browser.cjs']);}
run(['war-contracts/tools/build.cjs']);
if(fs.readFileSync(artifact,'utf8')!==before)throw new Error('Build output changed after verification.');
console.log('PASS War Contracts package checks; generated source is reproducible.');
