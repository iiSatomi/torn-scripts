'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
// Mirrors Torn PDA UserScriptsProvider.adaptSource(), including quote normalization.
const adapt=source=>('(function(){const PDA_storage=null;'+source+'}());').replace(/[\u201c\u201d]/g,'"').replace(/[\u2018\u2019]/g,"'");
const {pdaSafeUserscriptSource}=require('../../tools/userscript-pda-source.cjs');
const message="A script\u2019s \u201cTheme\u201d and scripts\u2019 settings";
const expression='globalThis.result='+JSON.stringify(message)+';';
const desktop={},pda={};vm.runInNewContext(pdaSafeUserscriptSource(expression),desktop);vm.runInNewContext(adapt(pdaSafeUserscriptSource(expression)),pda);
assert.equal(desktop.result,message);assert.equal(pda.result,message,'PDA and desktop retain the same displayed punctuation');
assert.equal(pdaSafeUserscriptSource(pdaSafeUserscriptSource(expression)),pdaSafeUserscriptSource(expression),'rebuilding safe source is idempotent');
const platform=fs.readFileSync(path.resolve(__dirname,'../src/script-hub-platform.cjs'),'utf8').replace(/^module\.exports[^\n]*$/m,'');
const lexical={PDA_storage:{marker:'page-global'}};vm.runInNewContext('(function(){const PDA_storage={marker:"script-private"};'+platform+';globalThis.capturedPlatform=getHubPlatformEnvironment();})();',lexical);
assert.equal(lexical.capturedPlatform.PDA_storage?.marker,'script-private','PDA native storage is captured from its script-private lexical binding');
for(const file of ['script-hub/dist/Torn_Script_Hub.user.js','Torn_War_Payout_Calculator.user.js','script-hub/dist/Torn_Script_Hub_Example.user.js','script-hub/dist/Torn_Script_UI_Showcase.user.js']){
 const source=fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8');
 assert.doesNotThrow(()=>new vm.Script(adapt(source)),file+' survives actual PDA source preparation');
}
console.log('PASS all generated Hub/payout/example sources parse after PDA source preparation');
