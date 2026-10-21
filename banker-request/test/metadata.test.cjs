const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('published installer uses its own GitHub update and download feeds',()=>{
 const source=fs.readFileSync(require.resolve('../dist/Torn_Banker_Request_Hub.meta.js'),'utf8');
 assert.match(source,/^\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/iiSatomi\/torn-scripts\/main\/banker-request\/dist\/Torn_Banker_Request_Hub\.meta\.js\s*$/m);
 assert.match(source,/^\/\/ @downloadURL\s+https:\/\/raw\.githubusercontent\.com\/iiSatomi\/torn-scripts\/main\/banker-request\/dist\/Torn_Banker_Request_Hub\.user\.js\s*$/m);
});
test('generated relay permission uses the documented domain form accepted by Tampermonkey',()=>{
 const source=fs.readFileSync(require.resolve('../dist/Torn_Banker_Request_Hub.meta.js'),'utf8');
 assert.match(source,/^\/\/ @connect\s+workers\.dev\s*$/m);
 assert.doesNotMatch(source,/^\/\/ @connect\s+\*\.workers\.dev/m);
});
test('public release has no bundled faction relay default',()=>{
 assert.equal(Object.hasOwn(require('../release.json'),'defaultRelay'),false);
 const source=fs.readFileSync(require.resolve('../dist/Torn_Banker_Request_Hub.user.js'),'utf8');
 assert.doesNotMatch(source,/BANKER_REQUEST_DEFAULT_RELAY/);
});
