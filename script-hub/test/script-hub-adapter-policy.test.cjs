'use strict';
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {createHubCredentialClient,createHubCredentialVault}=require('../src/script-hub-credentials.cjs');
const {registerTornScriptMenu}=require('../src/script-hub-adapter.cjs');
function storage(failEnrollment=false){const records=new Map();return {eligible:true,async get(k){return records.has(k)?structuredClone(records.get(k)):null;},async set(k,v){if(failEnrollment&&v.managedProviders?.length)return false;records.set(k,structuredClone(v));return true;}};}
(async()=>{
 const vault=createHubCredentialVault({storage:storage(),crypto:webcrypto}),client=createHubCredentialClient({storage:storage(true),crypto:webcrypto,scriptId:'consumer'});
 await vault.ready();await client.ready();await client.pinHub((await vault.publicIdentity()).publicJwk);await vault.grant('consumer','torn',(await client.publicIdentity()).publicJwk);await vault.setCredential('torn','synthetic-key');
 const doc=new EventTarget(),win=new EventTarget();doc.visibilityState='visible';let managed=0,failed=0;const policies=[];
 doc.addEventListener('torn-script-hub:v1:credential-request',async event=>{const request=JSON.parse(event.detail);doc.dispatchEvent(new CustomEvent('torn-script-hub:v1:credential-reply',{detail:JSON.stringify(await vault.respond(request))}));});
 doc.addEventListener('torn-script-hub:v1:credential-policy',event=>policies.push(JSON.parse(event.detail).status));
 const adapter=registerTornScriptMenu(doc,win,{id:'consumer',name:'Consumer',url:'https://www.torn.com/index.php',actions:[{id:'open',label:'Open'}]}, {},{credentialClient:client,credentialContext:true,onHubManagementChange:()=>managed++,onCredentialPolicyFailure:()=>failed++});
 try{await new Promise(resolve=>setTimeout(resolve,20));assert.equal(await adapter.requestSharedCredential('torn'),null);assert.equal(managed,0,'management is never announced before durable enrollment');assert.equal(failed,1);assert.deepEqual(policies,['failed']);}
 finally{adapter();vault.destroy();}
 console.log('PASS failed enrollment pauses delivery and reports failure without announcing management');
})().catch(error=>{console.error(error);process.exitCode=1;});
