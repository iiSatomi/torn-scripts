'use strict';
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const {spawnSync}=require('node:child_process');const vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),base=path.join(root,'banker-request');
function run(args){const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
run(['banker-request/tools/build.cjs']);
for(const name of ['src/domain.cjs','src/native.cjs','src/transport.cjs','src/client.js','worker/worker.mjs','dist/Torn_Banker_Request_Hub.user.js'])run(['--check',path.join('banker-request',name)]);
const source=fs.readFileSync(path.join(base,'dist/Torn_Banker_Request_Hub.user.js'),'utf8');
assert.equal((source.match(/^\/\/ @license\s+GPL-3\.0\s*$/gm)||[]).length,1,'generated installer must declare GPL-3.0 once');
assert.ok(!/^\/\/ @require\s/m.test(source),'runtime must be bundled');
assert.ok(!/[\u2018\u2019\u201c\u201d]/.test(source),'PDA source must not contain literal smart quotes');
assert.ok(!/https:\/\/(?:discord(?:app)?\.com)\/api\/webhooks\/[0-9]{17,20}\/[A-Za-z0-9_-]+/.test(source),'client must not contain a webhook credential');
assert.equal((source.match(/installBankerRequestHub\(\);/g)||[]).length,1,'one client installation');
new vm.Script(source,{filename:'Torn_Banker_Request_Hub.user.js'});
run(['--test','banker-request/test/domain.test.cjs','banker-request/test/metadata.test.cjs','banker-request/test/transport.test.cjs','banker-request/test/worker.test.mjs']);
if(process.argv.includes('--browser')){run(['banker-request/test/native-browser.cjs']);run(['banker-request/test/client-browser.cjs']);}
console.log('PASS Banker Request package verification'+(process.argv.includes('--browser')?' including real-browser fixtures.':'.'));
