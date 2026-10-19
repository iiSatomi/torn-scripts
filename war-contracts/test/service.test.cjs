const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path');
function factory(){const s={module:{exports:{}}};const p=path.join(__dirname,'../service/Code.gs');if(fs.existsSync(p))vm.runInNewContext(fs.readFileSync(p,'utf8'),s);assert.equal(typeof s.module.exports.createWarContractsService,'function','service factory exists');return s.module.exports.createWarContractsService;}
function fixture(overrides={}){let records=[],outputs=[],manual=[],locked=false,fail=false;const deps={config:{warId:8,factionId:1,opponentId:2},authenticate:k=>({id:k==='other'?12:11,name:k==='other'?'Other':'Own',factionId:1}),rosters:()=>({ours:[{id:11,name:'Own'},{id:12,name:'Other'}],enemies:[{id:21,name:'Enemy'},{id:22,name:'Second'}],opponentName:'Opponent'}),readManual:()=>({maxHits:10,opponentName:'Opponent',contracts:manual}),readRecords:()=>({records:structuredClone(records),confirmed:structuredClone(outputs)}),writeRecord:r=>{records=records.filter(x=>x.id!==r.id).concat(structuredClone(r));},appendConfirmed:r=>{outputs.push(structuredClone(r));if(fail){fail=false;throw Error('private-key');}},markCancelled:r=>{const i=outputs.findIndex(x=>x.id===r.id);if(i<0)outputs.push(structuredClone(r));else outputs[i]=structuredClone(r);},lock:fn=>{assert.equal(locked,false);locked=true;try{return fn();}finally{locked=false;}},now:()=>100,id:()=>`r${records.length+1}`};Object.assign(deps,{verifyContext:()=>({warId:8,factionId:1,opponentId:2,opponentName:'Opponent',ended:false})},overrides);const api=factory()(deps);return {call:(action,p={},key='key')=>api.handle({action,apiKey:key,warId:8,...p}),manual,outputs,setFail:()=>{fail=true;}};}
const req='12345678-1234-4123-8123-123456789012';
test('own script projection failure remains the selected deal alongside a conflicting manual row',()=>{
 const f=fixture({syncMainContract:()=>{if(!f.manual.length)f.manual.push({ourId:11,ourName:'Own',enemyId:22,enemyName:'Second',hits:9});const e=Error('Synthetic conflict');e.publicCode='CONFLICT';throw e;}});
 const a=reserve(f),saved=f.call('confirm',{id:a.deal.id,...terms});assert.equal(saved.deal.source,'script');
 const board=f.call('board');assert.equal(board.contracts.length,2);assert.equal(board.deal.id,a.deal.id);assert.equal(board.deal.mainSheetError,'CONFLICT');assert.equal(board.deal.mainSheetSynced,false);
});
test('a board that will fill blank headers bypasses cached war discovery before filling',()=>{
 const calls=[];let filledContext;
 const f=fixture({headersNeedFill:()=>true,verifyContext:(key,c,fresh)=>{calls.push(fresh);return {warId:fresh?9:8,factionId:1,opponentId:2,opponentName:'Opponent',ended:false};},readManual:(roster,context)=>{filledContext=context;return {opponentName:'Opponent',maxHits:10,contracts:[]};}});
 assert.equal(f.call('board').context.warId,9);assert.deepEqual(calls,[false,true]);assert.equal(filledContext.warId,9);
});
test('only genuinely blank opponent/start header cells are filled; manual values, placeholders and formulas survive',()=>{
 const sandbox={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../service/Code.gs'),'utf8'),sandbox);
 const context={opponentName:'Opponent',startAt:Date.parse('2026-10-18T19:00:00Z')/1000,ended:false};
 function sheet(name='',time='',formulas={}){
  const values={D6:name,E6:time},writes=[];
  return {values,writes,getRange(cell){assert.ok(['D6','E6'].includes(cell),'header filling cannot access any manual contract cell');return {getDisplayValue:()=>values[cell],isBlank:()=>values[cell]===''&&!formulas[cell],getFormula:()=>formulas[cell]||'',setValue:value=>{values[cell]=value;writes.push(cell);}};}};
 }
 const empty=sheet();sandbox.fillWarContractHeaders(empty,context);assert.equal(empty.values.D6,'Opponent');assert.equal(empty.values.E6,'2026-10-18 19:00');
 const placeholder=sheet('Opponent','-');sandbox.fillWarContractHeaders(placeholder,context);assert.deepEqual(placeholder.writes,[]);
 const manual=sheet('Opponent','19:30');sandbox.fillWarContractHeaders(manual,context);assert.deepEqual(manual.writes,[]);
 const formula=sheet('Opponent','',{E6:'=""'});sandbox.fillWarContractHeaders(formula,context);assert.deepEqual(formula.writes,[]);
 const conflict=sheet('Previous opponent');sandbox.fillWarContractHeaders(conflict,context);assert.deepEqual(conflict.writes,[]);
 const ended=sheet();sandbox.fillWarContractHeaders(ended,{...context,ended:true});assert.deepEqual(ended.writes,[]);
});
function reserve(f,enemyId=21){return f.call('reserve',{requestId:req,enemyId});}
const terms={hits:3,onlineWindow:'18-20 TCT',time:'19:00',warlord:'10%',notes:'=formula',strippedConfirmed:true};
const cancelRequest={operationId:'42345678-1234-4123-8123-123456789012',cancelConfirmed:true};
test('only the owner can explicitly cancel a confirmed deal and retries do not erase a rebooking',()=>{
 let clears=0;const f=fixture({planMainCancellation:()=>({row:10}),applyMainCancellation:()=>{clears++;}}),a=reserve(f);f.call('confirm',{id:a.deal.id,...terms});
 assert.equal(f.call('cancel',{id:a.deal.id,...cancelRequest,cancelConfirmed:false}).error.code,'INVALID');
 assert.equal(f.call('cancel',{id:a.deal.id,...cancelRequest},'other').error.code,'FORBIDDEN');assert.equal(clears,0);
 assert.equal(f.call('cancel',{id:a.deal.id,...cancelRequest}).ok,true);assert.equal(clears,1);assert.equal(f.outputs[0].status,'cancelled');assert.equal(f.call('board').deal,undefined);
 const next=f.call('reserve',{requestId:'52345678-1234-4123-8123-123456789012',enemyId:22});assert.equal(next.ok,true);
 assert.equal(f.call('cancel',{id:a.deal.id,...cancelRequest}).ok,true);assert.equal(clears,1);assert.equal(f.call('board').deal.id,next.deal.id);
 assert.equal(f.call('confirm',{id:a.deal.id,...terms}).error.code,'CONFLICT');
});
test('own manual cancellation checks the exact snapshot, keeps other bookings and is idempotent',()=>{
 let clears=0;const f=fixture({planMainCancellation:()=>({row:10}),applyMainCancellation:r=>{clears++;f.manual.splice(f.manual.findIndex(m=>m.enemyId===r.enemyId),1);}});
 const own={ourId:11,ourName:'Own',enemyId:21,enemyName:'Enemy',hits:3,onlineWindow:'18-20',time:'19:00',warlord:'No',notes:'Manual note'};f.manual.push(own,{ourId:12,ourName:'Other',enemyId:22,enemyName:'Second'});
 const request={id:'manual-0',expected:{...own},...cancelRequest};
 assert.equal(f.call('cancel',{...request,expected:{...own,notes:'Stale'}}).error.code,'CONFLICT');assert.equal(clears,0);
 assert.equal(f.call('cancel',request,'other').error.code,'FORBIDDEN');assert.equal(f.call('cancel',request).ok,true);assert.equal(f.manual.length,1);assert.equal(f.outputs[0].status,'cancelled');
 f.manual.unshift({...own,notes:'A new deal'});assert.equal(f.call('cancel',request).ok,true);assert.equal(clears,1);assert.equal(f.manual[0].notes,'A new deal');
});
test('partial cancellation stays blocking, never projects again, and owner board recovers it',()=>{
 let attempts=0,projections=0;const f=fixture({syncMainContract:()=>{projections++;return 10;},planMainCancellation:()=>({row:10}),applyMainCancellation:()=>{if(++attempts===1)throw Error('Synthetic outage');}}),a=reserve(f);f.call('confirm',{id:a.deal.id,...terms});
 const result=f.call('cancel',{id:a.deal.id,...cancelRequest});assert.equal(result.deal.cancellationPending,true);assert.equal(result.deal.cancellationError,'UNAVAILABLE');
 assert.equal(f.call('reserve',{requestId:'62345678-1234-4123-8123-123456789012',enemyId:22}).error.code,'CONFLICT');
 assert.equal(f.call('confirm',{id:a.deal.id,...terms}).error.code,'CONFLICT');
 assert.equal(f.call('board').deal,undefined);assert.equal(attempts,2);assert.equal(projections,1);assert.equal(f.outputs[0].status,'cancelled');
});
test('cancellation rejects old/ended wars and old audit confirmation cannot restore a cancelled deal',()=>{
 const f=fixture({planMainCancellation:()=>({row:10}),applyMainCancellation:()=>{}}),a=reserve(f);f.call('confirm',{id:a.deal.id,...terms});
 assert.equal(f.call('cancel',{id:a.deal.id,...cancelRequest,warId:7}).error.code,'CONTEXT_CHANGED');
 assert.equal(f.call('cancel',{id:a.deal.id,...cancelRequest}).ok,true);assert.equal(f.call('board').deal,undefined);
 const ended=fixture({verifyContext:()=>({warId:8,factionId:1,opponentId:2,opponentName:'Opponent',ended:true}),planMainCancellation:()=>{throw Error('must not write');}});assert.equal(ended.call('cancel',{id:'any',...cancelRequest}).error.code,'WAR_ENDED');
});
test('cancelled audit truth survives a lost success response without restoring or clearing the deal twice',()=>{
 let clears=0;const f=fixture({planMainCancellation:()=>({row:10}),applyMainCancellation:()=>{clears++;},markCancelled:r=>{f.outputs[0]=structuredClone(r);throw Error('Lost success response');}}),a=reserve(f);f.call('confirm',{id:a.deal.id,...terms});
 f.call('cancel',{id:a.deal.id,...cancelRequest});assert.equal(f.call('board').deal,undefined);assert.equal(f.call('cancel',{id:a.deal.id,...cancelRequest}).ok,true);assert.equal(clears,1);
});
test('durable target-clear guard survives audit failure, board merge and a fresh cancellation operation',()=>{
 let pair=true,clears=0;const f=fixture({planMainCancellation:()=>({row:10}),applyMainCancellation:(r,plan,roster,persist)=>{if(!pair)return;if(plan.targetClearAttempted){const e=Error('Renewed agreement');e.publicCode='CONFLICT';throw e;}persist();pair=false;clears++;},markCancelled:()=>{throw Error('History unavailable');}}),a=reserve(f);f.call('confirm',{id:a.deal.id,...terms});
 assert.equal(f.call('cancel',{id:a.deal.id,...cancelRequest}).deal.cancellationPending,true);assert.equal(clears,1);
 pair=true;assert.equal(f.call('board').deal.cancellationError,'CONFLICT');assert.equal(pair,true);assert.equal(clears,1);
 const retry=f.call('cancel',{id:a.deal.id,...cancelRequest,operationId:'72345678-1234-4123-8123-123456789012'});assert.equal(retry.deal.cancellationError,'CONFLICT');assert.equal(pair,true);assert.equal(clears,1);
});
test('bound cancellation updates the physical audit row even with blank history rows',()=>{
 const record={id:'saved',ourId:11,enemyId:21,warId:8,factionId:1,opponentId:2,confirmation:'canonical',status:'confirmed'},writes=[];
 const ids=[['other'],[''],['saved']],json=[[JSON.stringify({...record,id:'other'})],[''],[JSON.stringify(record)]];
 const sheet={getLastRow:()=>4,getRange(row,col,count=1,width=1){const range={getValues:()=>col===1?ids:json,getValue:()=>json[row-2][0],setNumberFormat:()=>range,setValues:data=>{writes.push({row,col,width,data});return range;}};return range;}};
 const ctx={module:{exports:{}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='FACTION_ID'?'1':'synthetic'})},CacheService:{getScriptCache:()=>({})},SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush:()=>{}}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../service/Code.gs'),'utf8'),ctx);
 ctx.warContractsDependencies().markCancelled({...record,status:'cancelled'});assert.equal(writes[0].row,4);assert.equal(writes[0].data[0][4],'cancelled');
 writes.length=0;json[2][0]=JSON.stringify({...record,id:'foreign'});assert.throws(()=>ctx.warContractsDependencies().markCancelled({...record,status:'cancelled'}));assert.equal(writes.length,0);
});
test('confirmed output projects to the main sheet once and completed projection does not rewrite later edits',()=>{
 const projected=[];const f=fixture({syncMainContract:r=>{projected.push(structuredClone(r));return 10;}});const a=reserve(f),confirmed=f.call('confirm',{id:a.deal.id,...terms});
 assert.equal(projected.length,1);assert.equal(confirmed.deal.mainSheetSynced,true);assert.equal(projected[0].confirmation,f.outputs[0].confirmation);
 f.manual.push({ourId:11,ourName:'Own',enemyId:21,enemyName:'Enemy',hits:'3.00',onlineWindow:terms.onlineWindow,time:terms.time,warlord:terms.warlord,notes:'=formula'});
 const board=f.call('board');assert.equal(board.contracts.length,1,'mirrored main/audit pair appears once');assert.equal(board.deal.source,'script');
 f.manual[0].notes='Later manual edit';assert.equal(f.call('board').contracts.length,2,'different manual details are retained');assert.equal(projected.length,1);assert.equal(f.call('confirm',{id:a.deal.id,...terms}).ok,true);assert.equal(projected.length,1);
});
test('audit confirmation survives a main-sheet conflict and the owner refresh completes it without a second append',()=>{
 let attempts=0;const f=fixture({syncMainContract:()=>{if(++attempts===1){const e=new Error('private details');e.publicCode='CONFLICT';throw e;}return 10;}});const a=reserve(f),confirmed=f.call('confirm',{id:a.deal.id,...terms});
 assert.equal(confirmed.ok,true);assert.equal(confirmed.deal.status,'confirmed');assert.equal(confirmed.deal.mainSheetSynced,false);assert.equal(confirmed.deal.mainSheetError,'CONFLICT');assert.equal(f.outputs.length,1);
 const recovered=f.call('board');assert.equal(recovered.deal.mainSheetSynced,true);assert.equal(f.outputs.length,1);assert.equal(attempts,2);f.call('board');assert.equal(attempts,2);
});
test('legacy confirmed deals backfill only for their owner and only after fresh same-war verification',()=>{
 const old=fixture(),a=reserve(old);old.call('confirm',{id:a.deal.id,...terms});const legacy=structuredClone(old.outputs[0]);let projected=0,war=8;
 const f=fixture({readRecords:()=>({records:[],confirmed:[legacy]}),syncMainContract:()=>{projected++;return 12;},verifyContext:(k,c,fresh)=>({warId:fresh?war:8,factionId:1,opponentId:2,opponentName:'Opponent',ended:false})});
 assert.equal(f.call('board',{},'other').deal,undefined);assert.equal(projected,0);
 war=9;assert.equal(f.call('board').deal.mainSheetError,'CONTEXT_CHANGED');assert.equal(projected,0);
 war=8;assert.equal(f.call('board').deal.mainSheetSynced,true);assert.equal(projected,1);
 const ended=fixture({readRecords:()=>({records:[],confirmed:[legacy]}),syncMainContract:()=>{throw Error('must not write');},verifyContext:()=>({warId:8,factionId:1,opponentId:2,opponentName:'Opponent',ended:true})});assert.equal(ended.call('board').ok,true);
});
test('service exists',()=>factory());
test('claims authoritative identities, locks target and retries exactly',()=>{const f=fixture(),a=reserve(f);assert.equal(a.ok,true);assert.equal(a.deal.ourId,11);assert.equal(reserve(f).deal.id,a.deal.id);assert.equal(reserve(f,22).ok,false);assert.equal(f.call('reserve',{requestId:req+'x',enemyId:21},'other').ok,false);assert.equal(f.call('release',{id:a.deal.id},'other').ok,false);assert.equal(f.call('sent',{id:a.deal.id}).deal.status,'contacted');assert.equal(f.call('release',{id:a.deal.id}).deal.status,'cancelled');});
test('manual names block both sides including additions after reservation',()=>{const f=fixture();f.manual.push({ourName:'  oWN  ',enemyName:'unknown'});assert.equal(reserve(f).ok,false);f.manual.length=0;const a=reserve(f);f.manual.push({ourName:'Someone',enemyName:' ENEMY [21] '});assert.equal(f.call('confirm',{id:a.deal.id,...terms}).ok,false);assert.equal(f.outputs.length,0);assert.equal(f.manual[0].enemyName,' ENEMY [21] ');});
test('confirmation requires explicit stripping, validates limits and escapes formulas',()=>{const f=fixture(),a=reserve(f);for(const patch of [{strippedConfirmed:false},{hits:11},{notes:'x'.repeat(1001)}])assert.equal(f.call('confirm',{id:a.deal.id,...terms,...patch}).ok,false);const b=f.call('confirm',{id:a.deal.id,...terms});assert.equal(b.ok,true);assert.equal(f.outputs[0].notes,"'=formula");assert.equal(f.call('confirm',{id:a.deal.id,...terms}).ok,true);assert.equal(f.outputs.length,1);assert.equal(f.call('confirm',{id:a.deal.id,...terms,hits:4}).ok,false);assert.equal(f.call('release',{id:a.deal.id}).ok,false);});
test('uncertain append is recovered by board and exact retry without duplicate',()=>{const f=fixture(),a=reserve(f);f.setFail();const r=f.call('confirm',{id:a.deal.id,...terms});assert.equal(r.ok,false);assert.ok(!JSON.stringify(r).includes('private-key'));assert.equal(f.call('board').deal.status,'confirmed');assert.equal(f.call('confirm',{id:a.deal.id,...terms}).ok,true);assert.equal(f.outputs.length,1);});
test('invalid actions and oversized requests fail closed',()=>{const f=fixture();assert.equal(f.call('oops').ok,false);assert.equal(f.call('board',{junk:'x'.repeat(20000)}).ok,false);assert.ok(!JSON.stringify(f.call('board')).includes('apiKey'));});

test('Apps Script entry points exist and original manual layout is read without writes',()=>{const sandbox={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../service/Code.gs'),'utf8'),sandbox);assert.equal(typeof sandbox.doPost,'function');assert.equal(typeof sandbox.onOpen,'function');assert.equal(typeof sandbox.warContractsDependencies,'function');});
test('stale war mutation rejected',()=>{const f=fixture();assert.equal(f.call('reserve',{requestId:req,enemyId:21,warId:7}).error.code,'CONTEXT_CHANGED');});
test('bound integration reads real manual columns and does not expose stats',()=>{const manualRows=[['Own [11]','PRIVATE STATS','evenings','4','Enemy','','20:00','10%','Keep this note']];let writes=0;const original={getLastRow:()=>10,getRange:(a,b,c,d)=>{if(a==='I6')return {getValue:()=>10};if(a==='D6')return {getDisplayValue:()=> 'Opponent'};assert.equal(a,10);assert.equal(b,4);assert.equal(d,9);return {getDisplayValues:()=>manualRows.map(r=>r.map((v,i)=>i===3?'4.00':v)),getValues:()=>manualRows.map(r=>r.map((v,i)=>i===3?4:v)),getRichTextValues:()=>manualRows.map(r=>r.map(()=>null)),getFormulas:()=>manualRows.map(r=>r.map(()=>'')),setValues:()=>{writes++;throw Error('manual write');}};}};const sandbox={module:{exports:{}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>({WAR_ID:'8',FACTION_ID:'1',OPPONENT_ID:'2',WORKBOOK_ID:'synthetic'})[k]})},CacheService:{getScriptCache:()=>({get:()=>null})},SpreadsheetApp:{openById:()=>({getSheetByName:n=>n==='War Contracts'?original:null})}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../service/Code.gs'),'utf8'),sandbox);const d=sandbox.warContractsDependencies(),result=d.readManual({ours:[{id:11,name:'Own'}],enemies:[{id:21,name:'Enemy'}]});assert.equal(result.contracts[0].hits,4);assert.equal(result.contracts[0].ourId,11);assert.equal(result.contracts[0].enemyId,21);assert.equal(result.contracts[0].notes,'Keep this note');assert.equal(result.contracts[0].time,'20:00');assert.ok(!JSON.stringify(result).includes('PRIVATE STATS'));assert.equal(writes,0);});
test('two services share claims and confirmed output prevents another owner claiming target',()=>{const f=fixture(),a=reserve(f);assert.equal(f.call('reserve',{requestId:'22345678-1234-4123-8123-123456789012',enemyId:21},'other').ok,false);assert.equal(f.call('confirm',{id:a.deal.id,...terms}).ok,true);assert.equal(f.call('reserve',{requestId:'32345678-1234-4123-8123-123456789012',enemyId:21},'other').ok,false);});
test('failed registry finalization recovers confirmed truth from append-only output',()=>{let records=[],output=[],failFinal=true;const api=factory()({config:{warId:8,factionId:1,opponentId:2},authenticate:()=>({id:11,factionId:1}),rosters:()=>({ours:[{id:11,name:'Own'}],enemies:[{id:21,name:'Enemy'}]}),verifyContext:()=>({warId:8,factionId:1,opponentId:2,opponentName:'Opponent',ended:false}),readManual:()=>({maxHits:10,opponentName:'Opponent',contracts:[]}),readRecords:()=>({records:structuredClone(records),confirmed:structuredClone(output)}),writeRecord:r=>{if(r.status==='confirmed'&&failFinal){failFinal=false;throw Error('private transport details');}records=[structuredClone(r)];},appendConfirmed:r=>output.push(structuredClone(r)),lock:fn=>fn(),now:()=>1,id:()=> 'stable'});const call=(action,p={})=>api.handle({apiKey:'secret',warId:8,action,...p});const a=call('reserve',{requestId:req,enemyId:21});assert.equal(a.ok,true);assert.equal(call('confirm',{id:a.deal.id,...terms}).ok,false);assert.equal(call('board').deal.status,'confirmed');assert.equal(call('confirm',{id:a.deal.id,...terms}).ok,true);assert.equal(output.length,1);});

test('discovered war must verify actual participants and manual opponent heading',()=>{for(const verified of [{warId:0,factionId:1,opponentId:2,opponentName:'Opponent',ended:false},{warId:8,factionId:9,opponentId:2,opponentName:'Opponent',ended:false},{warId:8,factionId:1,opponentId:1,opponentName:'Opponent',ended:false}]){const f=fixture({verifyContext:()=>verified});assert.equal(f.call('board').ok,false);}const f=fixture({readManual:()=>({maxHits:10,opponentName:'Wrong war',contracts:[]})});assert.equal(f.call('board').error.code,'CONFIG');});
test('ended war board remains readable while every mutation is rejected',()=>{const f=fixture({verifyContext:()=>({warId:8,factionId:1,opponentId:2,opponentName:'Opponent',ended:true})});assert.equal(f.call('board').context.ended,true);assert.equal(reserve(f).error.code,'WAR_ENDED');});
test('manual war binding rejects same-opponent rollover before returning cancellable old deals',()=>{
 let war=8,bound=null;const f=fixture({verifyContext:()=>({warId:war,factionId:1,opponentId:2,opponentName:'Opponent',ended:false}),ensureManualWar:(id,hasRows)=>{if(bound&&bound!==id&&hasRows){const e=Error('Previous manual war');e.publicCode='MANUAL_WAR_CHANGED';throw e;}bound=id;}});
 f.manual.push({ourId:11,ourName:'Own',enemyId:21,enemyName:'Enemy'});assert.equal(f.call('board').deal.status,'manual');assert.equal(bound,8);
 war=9;assert.equal(f.call('board').error.code,'MANUAL_WAR_CHANGED');assert.equal(f.call('cancel',{id:'manual-0',...cancelRequest,warId:9}).error.code,'MANUAL_WAR_CHANGED');
 f.manual.length=0;assert.equal(f.call('board').ok,true);assert.equal(bound,9);
});
test('a blank unused workbook can view the last ended war without changing headers',()=>{
 const f=fixture({verifyContext:()=>({warId:8,factionId:1,opponentId:2,opponentName:'Opponent',ended:true}),readManual:()=>({maxHits:30,opponentName:'',contracts:[]})});assert.equal(f.call('board').ok,true);assert.equal(f.call('board').context.ended,true);
 const stale=fixture({verifyContext:()=>({warId:8,factionId:1,opponentId:2,opponentName:'Opponent',ended:true}),readManual:()=>({maxHits:30,opponentName:'',contracts:[{ourId:11,enemyId:21}]})});assert.equal(stale.call('board').error.code,'CONFIG');
});
test('registry and output scoped to exact faction pair as well as war',()=>{const row={id:'foreign',warId:8,factionId:9,opponentId:2,ourId:11,ourName:'Own',enemyId:21,enemyName:'Enemy',status:'confirmed',source:'script'};const f=fixture({readRecords:()=>({records:[row],confirmed:[{...row,id:'foreign-output',factionId:1,opponentId:3}]})});assert.equal(f.call('board').contracts.length,0);assert.equal(reserve(f).ok,true);});
function discoveryFixture(){
 const stored=new Map(),requests=[],properties={FACTION_ID:'1',WORKBOOK_ID:'synthetic',WAR_ID:'999',OPPONENT_ID:'999'};
 const state={current:{war_id:8,start:9999999999,end:null,winner:null,factions:[{id:1,name:'Our faction'},{id:2,name:'Opponent'}],extra:'not cached'},history:[]};
 const sandbox={module:{exports:{}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k],setProperty:(k,v)=>{properties[k]=v;}})},CacheService:{getScriptCache:()=>({get:k=>stored.get(k),put:(k,v)=>stored.set(k,v)})},SpreadsheetApp:{openById:()=>({})},UrlFetchApp:{fetch:(url,options)=>{requests.push({url,options});return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(url.endsWith('/wars')?{wars:{ranked:state.current,raids:[],territory:[]}}:{rankedwars:state.history})};}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../service/Code.gs'),'utf8'),sandbox);
 return {d:sandbox.warContractsDependencies(),state,stored,requests,properties};
}
test('production discovers scheduled ranked war without fixed war/opponent IDs and sanitizes cache',()=>{
 const f=discoveryFixture(),d=f.d;
 assert.equal(d.verifyContext('temporary-key',d.config).opponentName,'Opponent');assert.equal(d.verifyContext('temporary-key',d.config).warId,8);assert.equal(d.verifyContext('temporary-key',d.config).ended,false);
 assert.equal(d.verifyContext('temporary-key',d.config).factionName,'Our faction');assert.equal(d.verifyContext('temporary-key',d.config).startAt,9999999999);assert.equal(d.verifyContext('temporary-key',d.config).endAt,null);
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'https://api.torn.com/v2/faction/1/wars');assert.ok(!JSON.stringify([...f.stored]).includes('temporary-key'));assert.ok(!JSON.stringify([...f.stored]).includes('not cached'));
 f.state.current={...f.state.current,war_id:9,factions:[{id:1,name:'Our faction'},{id:3,name:'Next opponent'}]};
 assert.equal(d.verifyContext('temporary-key',d.config).warId,8,'board can use brief cache');
 assert.equal(d.verifyContext('temporary-key',d.config,true).warId,9,'writes bypass cached discovery');
 f.state.current.factions=[{id:4,name:'Foreign faction'},{id:3,name:'Next opponent'}];assert.throws(()=>d.verifyContext('temporary-key',d.config,true));
});
test('no current ranked war uses latest ended contracts read-only or reports no war',()=>{
 const f=discoveryFixture();f.state.current=null;assert.equal(f.d.verifyContext('key',f.d.config,true),null);
 f.state.history=[{id:7,end:50,factions:[{id:1,name:'Our faction'},{id:2,name:'Opponent'}]}];assert.equal(f.d.verifyContext('key',f.d.config,true).ended,true);
 f.state.history[0].end=0;assert.throws(()=>f.d.verifyContext('key',f.d.config,true),'history must not silently substitute for a current war');
});
test('faction-only service follows detected rollover and rejects old reservations and foreign members',()=>{
 let war=8;const checks=[];const f=fixture({config:{factionId:1},verifyContext:(key,c,fresh)=>{checks.push(fresh);return {warId:war,factionId:1,opponentId:2,opponentName:'Opponent',ended:false};}});
 assert.equal(f.call('board').context.warId,8);const a=reserve(f);assert.equal(a.ok,true);war=9;
 assert.equal(f.call('confirm',{id:a.deal.id,...terms}).error.code,'CONTEXT_CHANGED');assert.equal(f.outputs.length,0);
 const next=f.call('board');assert.equal(next.context.warId,9);assert.equal(next.contracts.length,0);assert.equal(checks[0],false);assert.ok(checks.includes(true));
 assert.equal(fixture({config:{factionId:1},authenticate:()=>({id:11,factionId:9})}).call('board').error.code,'AUTH');
 assert.equal(fixture({config:{factionId:1},verifyContext:()=>null}).call('board').error.code,'NO_WAR');
});
test('pre-append failure preserves pending confirmation terms for reload and exact retry',()=>{let records=[],output=[],fail=true;const api=factory()({config:{warId:8,factionId:1,opponentId:2},authenticate:()=>({id:11,factionId:1}),verifyContext:()=>({warId:8,factionId:1,opponentId:2,opponentName:'Opponent',ended:false}),rosters:()=>({ours:[{id:11,name:'Own'}],enemies:[{id:21,name:'Enemy'}]}),readManual:()=>({maxHits:10,opponentName:'Opponent',contracts:[]}),readRecords:()=>({records:structuredClone(records),confirmed:structuredClone(output)}),writeRecord:r=>{records=[structuredClone(r)];},appendConfirmed:r=>{if(fail){fail=false;throw Error('before append');}output.push(structuredClone(r));},lock:fn=>fn(),now:()=>1,id:()=> 'pending-stable'});const call=(action,p={})=>api.handle({apiKey:'secret',warId:8,action,...p});const a=call('reserve',{requestId:req,enemyId:21});assert.equal(call('confirm',{id:a.deal.id,...terms}).ok,false);assert.equal(output.length,0);const restored=call('board').deal;assert.equal(restored.id,a.deal.id);assert.equal(restored.status,'reserved');assert.equal(restored.confirmationPending,true);assert.equal(restored.hits,terms.hits);assert.equal(restored.onlineWindow,terms.onlineWindow);assert.equal(restored.time,terms.time);assert.equal(restored.warlord,terms.warlord);assert.equal(restored.notes,"'=formula");const confirmed=call('confirm',{id:restored.id,hits:restored.hits,onlineWindow:restored.onlineWindow,time:restored.time,warlord:restored.warlord,notes:restored.notes,strippedConfirmed:true});assert.equal(confirmed.ok,true);assert.equal(confirmed.deal.confirmationPending,false);assert.equal(output.length,1);});
test('maximum-length formula terms recover canonically without allowing arbitrary overlong terms',()=>{let records=[],output=[],fail=true;const api=factory()({config:{warId:8,factionId:1,opponentId:2},authenticate:()=>({id:11,factionId:1}),verifyContext:()=>({warId:8,factionId:1,opponentId:2,opponentName:'Opponent',ended:false}),rosters:()=>({ours:[{id:11,name:'Own'}],enemies:[{id:21,name:'Enemy'}]}),readManual:()=>({maxHits:10,opponentName:'Opponent',contracts:[]}),readRecords:()=>({records:structuredClone(records),confirmed:structuredClone(output)}),writeRecord:r=>{records=[structuredClone(r)];},appendConfirmed:r=>{if(fail){fail=false;throw Error('before append');}output.push(structuredClone(r));},lock:fn=>fn(),now:()=>1,id:()=> 'maximum-stable'});const call=(action,p={})=>api.handle({apiKey:'secret',warId:8,action,...p});const a=call('reserve',{requestId:req,enemyId:21});const maximum={hits:2,onlineWindow:'='+ 'x'.repeat(119),time:'+'+'x'.repeat(79),warlord:'@'+'x'.repeat(79),notes:'-'+'x'.repeat(999),strippedConfirmed:true};assert.equal(call('confirm',{id:a.deal.id,...maximum}).ok,false);const restored=call('board').deal;assert.equal(restored.notes.length,1001);const retry={id:restored.id,hits:restored.hits,onlineWindow:restored.onlineWindow,time:restored.time,warlord:restored.warlord,notes:restored.notes,strippedConfirmed:true};assert.equal(call('confirm',{...retry,notes:"'"+'x'.repeat(1000)}).ok,false);assert.equal(call('confirm',retry).ok,true);assert.equal(output.length,1);assert.equal(output[0].notes,restored.notes);});

test('production manual-war property is sticky across repeats and only rebinds an empty table',()=>{
 const f=discoveryFixture();f.d.ensureManualWar(8,true);assert.equal(f.properties.MANUAL_WAR_ID,'8');f.d.ensureManualWar(8,true);
 assert.throws(()=>f.d.ensureManualWar(9,true),e=>e.publicCode==='MANUAL_WAR_CHANGED');assert.equal(f.properties.MANUAL_WAR_ID,'8');
 f.d.ensureManualWar(9,false);assert.equal(f.properties.MANUAL_WAR_ID,'9');
});

test('setup defaults only a genuinely blank hit-cap cell and never writes contract rows',()=>{
 for(const [initial,formula,expected] of [['','',30],[40,'',40],['','=""','']]){
  let value=initial;const added=[],props={};const cap={isBlank:()=>value===''&&!formula,getFormula:()=>formula,setValue:v=>{value=v;}};
  const main={getRange:a=>{assert.equal(a,'I6');return cap;}},book={getId:()=> 'synthetic-book',getSheetByName:name=>name==='War Contracts'?main:null,insertSheet:name=>{added.push(name);return {appendRow:row=>assert.equal(row.length,11)};}};
  const ctx={module:{exports:{}},SpreadsheetApp:{getActiveSpreadsheet:()=>book,getUi:()=>({ButtonSet:{OK_CANCEL:1},Button:{OK:1},prompt:()=>({getSelectedButton:()=>1,getResponseText:()=> '1'}),alert:()=>{}})},PropertiesService:{getScriptProperties:()=>({setProperties:v=>Object.assign(props,v)})}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../service/Code.gs'),'utf8'),ctx);ctx.setupWarContracts();assert.equal(value,expected);assert.equal(props.WORKBOOK_ID,'synthetic-book');assert.deepEqual(added,['Script Contracts','Script Contract Registry']);
 }
});
