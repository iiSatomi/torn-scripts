const test=require('node:test');const assert=require('node:assert/strict');
const {createBankerHttp}=require('../src/transport.cjs');
test('uses HTTPS relay authorization header and rejects malformed response without echoing it',async()=>{
 let sent;const client=createBankerHttp({GM_xmlhttpRequest:o=>{sent=o;queueMicrotask(()=>o.onload({status:200,responseText:'{"ok":true}',finalUrl:o.url}));return {abort(){}};}});
 assert.equal((await client.post('https://banker.example.workers.dev','TESTONLY00000001','/v1/identity',{})).ok,true);
 assert.equal(sent.headers.Authorization,'Bearer TESTONLY00000001');assert.ok(!sent.url.includes('TESTONLY00000001'));
 assert.equal(sent.timeout,35000,'deadline covers bounded identity, balance and Discord upstream work');
 const bad=createBankerHttp({GM_xmlhttpRequest:o=>{queueMicrotask(()=>o.onload({status:500,responseText:'private upstream details'}));}});
 await assert.rejects(bad.post('https://banker.example.workers.dev','TESTONLY00000001','/v1/identity',{}),e=>!e.message.includes('private upstream'));
});
test('abort cancels transport and ignores late callbacks',async()=>{
 let o,aborted=0;const client=createBankerHttp({GM_xmlhttpRequest:x=>{o=x;return {abort(){aborted++;}};}});const promise=client.post('https://banker.example.workers.dev','TESTONLY00000001','/v1/identity',{});client.abort();await assert.rejects(promise,/cancel/i);o.onload({status:200,responseText:'{"ok":true}'});assert.equal(aborted,1);
});
test('PDA response normalization and redirect-origin check fail closed',async()=>{
 const client=createBankerHttp({PDA_httpPost:async()=>({status:200,responseText:'{"ok":true}'})});assert.equal((await client.post('https://banker.example.workers.dev','TESTONLY00000001','/v1/identity',{})).ok,true);
 const moved=createBankerHttp({GM_xmlhttpRequest:o=>queueMicrotask(()=>o.onload({status:200,finalUrl:'https://foreign.example',responseText:'{"ok":true}'}))});await assert.rejects(moved.post('https://banker.example.workers.dev','TESTONLY00000001','/v1/identity',{}),/redirect/i);
});
