const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('HTTP client exists before building the member UI',()=>assert.ok(fs.existsSync(path.join(__dirname,'../src/http.cjs')),'War Contracts needs its bounded HTTP client'));
test('HTTP rejects provider redirects and never exposes upstream bodies',async()=>{
 const {createWarContractsHttp}=require('../src/http.cjs');
 const http=createWarContractsHttp({GM_xmlhttpRequest(o){queueMicrotask(()=>o.onload({status:200,responseText:JSON.stringify({error:{error:'private upstream details'}}),finalUrl:'https://untrusted.example/'}));return {abort(){}};}});
 await assert.rejects(http.json('https://api.torn.com/v2/key/info'),/redirect/i);
});
test('Apps Script content redirect is allowed, POST body is bounded and JSON errors sanitized',async()=>{
 const {createWarContractsHttp}=require('../src/http.cjs');let sent;
 const http=createWarContractsHttp({GM_xmlhttpRequest(o){sent=o;queueMicrotask(()=>o.onload({status:200,responseText:'{"ok":true}',finalUrl:'https://script.googleusercontent.com/macros/echo?opaque=value'}));return {abort(){}};}});
 assert.deepEqual(await http.json('https://script.google.com/macros/s/test/exec',{method:'POST',body:{action:'board'}}),{ok:true});
 assert.equal(sent.anonymous,true);assert.equal(sent.method,'POST');assert.deepEqual(JSON.parse(sent.data),{action:'board'});
 await assert.rejects(http.json('https://evil.example/'),/supported/i);
});
test('abort rejects pending request and aborts its owned handle',async()=>{
 const {createWarContractsHttp}=require('../src/http.cjs');let aborted=false;
 const http=createWarContractsHttp({GM_xmlhttpRequest(){return {abort(){aborted=true;}};}});
 const request=http.json('https://api.torn.com/v2/key/info');http.abort();await assert.rejects(request,/cancelled/i);assert.equal(aborted,true);
});
test('large or malformed payloads and upstream errors never escape as raw text',async()=>{
 const {createWarContractsHttp}=require('../src/http.cjs');
 const http=createWarContractsHttp({GM_xmlhttpRequest(o){queueMicrotask(()=>o.onload({status:500,responseText:'private raw error'}));return {};}});
 await assert.rejects(http.json('https://api.torn.com/v2/key/info'),e=>!e.message.includes('private'));
 await assert.rejects(http.json('https://api.torn.com/v2/key/info',{body:{text:'a'.repeat(20000)}}),/large/i);
});
test('HTTP failures identify the provider and safe status without leaking credentials or response bodies',async()=>{
 const {createWarContractsHttp}=require('../src/http.cjs');
 for(const [url,status,pattern] of [
  ['https://ffscouter.com/api/v1/get-stats?key=private-query&targets=123',401,/FFScouter.*HTTP 401.*registered key/i],
  ['https://api.torn.com/v2/user/equipment',403,/Torn equipment.*HTTP 403/i],
  ['https://api.torn.com/v2/user/battlestats',429,/Torn battle stats.*HTTP 429/i],
  ['https://script.google.com/macros/s/private-deployment/exec',403,/Contracts sheet service.*HTTP 403/i],
 ]){
  const http=createWarContractsHttp({GM_xmlhttpRequest(o){queueMicrotask(()=>o.onload({status,responseText:'private-response'}));return {};}});
  await assert.rejects(http.json(url),error=>pattern.test(error.message)&&!error.message.includes('private-'));
 }
});
