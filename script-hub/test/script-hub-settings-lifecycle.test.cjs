const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const doc=new EventTarget();doc.getElementById=()=>null;
const vaults=[];
const context={...require('../src/script-hub-window.cjs'),setTimeout,clearTimeout,URL,getHubPlatformEnvironment:()=>({}),createHubCredentialStorage:()=>({}),createHubCredentialVault:()=>{
  let ready;const promise=new Promise(resolve=>{ready=resolve;});
  const vault={ready:()=>promise,resolve:ready,refreshes:0,refresh:async()=>{vault.refreshes++;return true;},destroy(){},publicIdentity:async()=>null,status:async()=>[]};vaults.push(vault);return vault;
}};
vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../src/script-hub-settings-ui.js'),'utf8')+'\nthis.factory=createHubSettingsController;',context);
const controller=context.factory({doc,win:{localStorage:{getItem:()=>null}},registry:{entries:()=>[]},getDialog:()=>null,emit(){},say(){}});
(async()=>{
  controller.start();controller.stop();controller.start();
  vaults[1].resolve(true);await new Promise(resolve=>setImmediate(resolve));
  vaults[0].resolve(false);await new Promise(resolve=>setImmediate(resolve));
  controller.activity(false);controller.activity(true);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(vaults[1].refreshes,1,'retired asynchronous startup must not disable the current vault');
  controller.stop();console.log('PASS settings lifecycle ignores stale vault readiness after restart');
})().catch(error=>{console.error(error);process.exitCode=1;});
