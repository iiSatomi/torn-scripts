'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../Torn_Faction_Chat_Banker_Ping.user.js'),'utf8');
function fixture(saved=''){
 const block=source.match(/\/\/ PRIVATE WEBHOOK SETTINGS START([\s\S]*?)\/\/ PRIVATE WEBHOOK SETTINGS END/);
 assert.ok(block,'Webhook configuration must use private settings instead of a source credential.');
 const writes=[],menus=[],alerts=[];let next=null;
 const ctx=vm.createContext({GM_getValue:()=>saved,GM_setValue:(k,v)=>writes.push([k,v]),GM_registerMenuCommand:(name,handler)=>menus.push({name,handler}),window:{prompt:()=>next,alert:text=>alerts.push(text)}});
 vm.runInContext(block[1]+'\nthis.readConfiguredWebhook=()=>DISCORD_WEBHOOK_URL;',ctx);
 return {ctx,writes,menus,alerts,enter(value){next=value;menus[0].handler();}};
}
test('empty or invalid stored webhook cannot send and source contains no working webhook URL',()=>{
 assert.equal(fixture().ctx.readConfiguredWebhook(),'');
 assert.equal(fixture('https://untrusted.example/webhook').ctx.readConfiguredWebhook(),'');
 assert.ok(!/https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{20,}/.test(source));
});
test('menu saves only a validated personal Discord destination; cancel and invalid input leave it alone',()=>{
 const f=fixture();assert.equal(f.menus.length,1);
 f.enter(null);f.enter('https://untrusted.example/webhook');assert.equal(f.writes.length,0);assert.equal(f.alerts.length,1);
 const synthetic='https://discord.com/api/webhooks/123/SYNTHETIC_TEST_ONLY';
 f.enter(synthetic);assert.equal(f.ctx.readConfiguredWebhook(),synthetic);assert.equal(f.writes[0][1],synthetic);
 f.enter('');assert.equal(f.ctx.readConfiguredWebhook(),'');assert.equal(f.writes[1][1],'');
});
