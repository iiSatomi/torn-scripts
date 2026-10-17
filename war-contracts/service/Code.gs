/* Bound Apps Script; no credentials or private battle statistics are persisted. */
function createWarContractsService(deps) {
  function fail(code) { var e = new Error(code); e.publicCode = code; throw e; }
  function positive(n) { return Number.isSafeInteger(Number(n)) && Number(n) > 0; }
  function norm(s) { return String(s || '').replace(/\[\d+\]/g, '').trim().replace(/\s+/g, ' ').toLowerCase(); }
  function text(s, max) { if (typeof s !== 'string' || s.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)) fail('INVALID'); return s.trim(); }
  function safe(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }
  function identity(r, side) { var name = String(r[side + 'Name'] || ''); var m = name.match(/\[(\d+)\]/); return {id:Number(r[side + 'Id'] || (m && m[1])) || null,name:norm(name)}; }
  function blocks(rows, user, enemy, excluded) { return rows.some(function(r) { if (r.id === excluded || r.status === 'cancelled') return false; var a=identity(r,'our'),b=identity(r,'enemy'); return (a.id === user.id || a.name === norm(user.name)) || (b.id === enemy.id || b.name === norm(enemy.name)); }); }
  function handle(p) {
    try {
      if (!p || JSON.stringify(p).length > 16384 || ['board','reserve','sent','release','confirm','cancel'].indexOf(p.action)<0 || typeof p.apiKey !== 'string' || !p.apiKey || p.apiKey.length>128) fail('INVALID');
      var c=deps.config;if(!c || !positive(c.factionId))fail('CONFIG');
      var auth=deps.authenticate(p.apiKey);if(!auth||!positive(auth.id)||Number(auth.factionId)!==Number(c.factionId))fail('AUTH');
      var user={id:Number(auth.id),name:String(auth.name),factionId:Number(auth.factionId)};
      return deps.lock(function() {
        var verified=deps.verifyContext(p.apiKey,c,p.action!=='board');
        if(p.action==='board'&&verified&&!verified.ended&&typeof deps.headersNeedFill==='function'&&deps.headersNeedFill())verified=deps.verifyContext(p.apiKey,c,true);
        if(!verified)fail('NO_WAR');
        if(!positive(verified.warId)||Number(verified.factionId)!==Number(c.factionId)||!positive(verified.opponentId)||Number(verified.opponentId)===Number(c.factionId)||typeof verified.ended!=='boolean'||!norm(verified.opponentName))fail('CONFIG');
        c={factionId:Number(c.factionId),warId:Number(verified.warId),opponentId:Number(verified.opponentId)};
        if(p.action!=='board' && Number(p.warId)!==c.warId)fail('CONTEXT_CHANGED');
        if(verified.ended && p.action!=='board')fail('WAR_ENDED');
        var roster=deps.rosters(p.apiKey,c),ours=roster.ours||[],enemies=roster.enemies||[];
        var member=ours.find(function(x){return Number(x.id)===user.id;});if(!member)fail('AUTH');user.name=String(member.name);
        var manual=deps.readManual(roster,verified),snapshot=deps.readRecords();
        if(norm(manual.opponentName)!==norm(verified.opponentName))fail('CONFIG');
        if(!positive(manual.maxHits)||Number(manual.maxHits)>10000)fail('CONFIG');
        var context={warId:Number(c.warId),factionId:Number(c.factionId),factionName:String(verified.factionName||''),opponentId:Number(c.opponentId),opponentName:String(verified.opponentName),startAt:positive(verified.startAt)?Number(verified.startAt):null,endAt:positive(verified.endAt)?Number(verified.endAt):null,maxHits:Number(manual.maxHits),ended:verified.ended};
        var rows=(snapshot.records||[]).filter(function(r){return Number(r.warId)===context.warId && Number(r.factionId)===context.factionId && Number(r.opponentId)===context.opponentId;});
        var confirmed=(snapshot.confirmed||[]).filter(function(r){return Number(r.warId)===context.warId && Number(r.factionId)===context.factionId && Number(r.opponentId)===context.opponentId;});
        confirmed.forEach(function(r){var registry=rows.find(function(x){return x.id===r.id;});if(registry&&registry.confirmation===r.confirmation&&registry.ourId===r.ourId&&registry.enemyId===r.enemyId){if(typeof registry.mainSheetSynced==='boolean')r=Object.assign({},r,{mainSheetSynced:registry.mainSheetSynced,mainSheetRow:registry.mainSheetRow,mainSheetError:registry.mainSheetError});if(r.status==='confirmed'&&registry.cancellationPending===true)r=Object.assign({},r,{cancellationPending:true,cancellationPlan:registry.cancellationPlan,cancellationError:registry.cancellationError,cancelOperationId:registry.cancelOperationId,cancelOriginalId:registry.cancelOriginalId});}rows=rows.filter(function(x){return x.id!==r.id;});rows.push(r);});
        function manualRows(data){return (data.contracts||[]).map(function(r,i){return Object.assign({id:'manual-'+i,ourId:null,enemyId:null,ourName:'',enemyName:'',hits:'',onlineWindow:'',time:'',warlord:'',notes:'',createdAt:null,updatedAt:null},r,{status:'manual',source:'manual'});});}
        var manuals=manualRows(manual);
        function project(record,refreshWar){
          if(typeof deps.syncMainContract!=='function'||record.mainSheetSynced===true||record.cancellationPending===true)return record;
          var updated=Object.assign({},record,{mainSheetSynced:false,mainSheetError:''});
          try {
            if(verified.ended)fail('WAR_ENDED');
            if(refreshWar){var fresh=deps.verifyContext(p.apiKey,deps.config,true);if(!fresh||Number(fresh.warId)!==context.warId||Number(fresh.factionId)!==context.factionId||Number(fresh.opponentId)!==context.opponentId)fail('CONTEXT_CHANGED');if(fresh.ended)fail('WAR_ENDED');}
            if(record.ourId!==user.id||!enemies.some(function(e){return Number(e.id)===Number(record.enemyId);})||record.strippedConfirmed!==true||!positive(record.hits)||Number(record.hits)>10000)fail('INVALID');
            var canonical={hits:Number(record.hits),onlineWindow:record.onlineWindow,time:record.time,warlord:record.warlord,notes:record.notes,strippedConfirmed:true};
            if(['onlineWindow','time','warlord','notes'].some(function(k){return typeof record[k]!=='string';})||record.confirmation!==JSON.stringify(canonical))fail('INVALID');
            updated.mainSheetRow=deps.syncMainContract(record,roster);
            manuals=manualRows(deps.readManual(roster,verified));
            updated.mainSheetSynced=true;
          }catch(e){updated.mainSheetError=['CONFLICT','CONTEXT_CHANGED','WAR_ENDED','INVALID'].indexOf(e&&e.publicCode)>=0?e.publicCode:'UNAVAILABLE';}
          // Ended/changed wars remain read-only, including internal sync bookkeeping.
          if(updated.mainSheetError!=='WAR_ENDED'&&updated.mainSheetError!=='CONTEXT_CHANGED')try{deps.writeRecord(updated);}catch(e){updated.mainSheetSynced=false;updated.mainSheetError='UNAVAILABLE';}
          rows=rows.filter(function(x){return x.id!==record.id;}).concat(updated);return updated;
        }
        function finishCancellation(record,freshWar){
          var updated=Object.assign({},record,{cancellationError:''});
          try{
            if(verified.ended)fail('WAR_ENDED');
            if(freshWar){var fresh=deps.verifyContext(p.apiKey,deps.config,true);if(!fresh||Number(fresh.warId)!==context.warId||Number(fresh.factionId)!==context.factionId||Number(fresh.opponentId)!==context.opponentId)fail('CONTEXT_CHANGED');if(fresh.ended)fail('WAR_ENDED');}
            if(Number(record.ourId)!==user.id||record.cancellationPending!==true||!record.cancellationPlan)fail('INVALID');
            deps.applyMainCancellation(record,record.cancellationPlan,roster,function(){
              // Persist before the destructive attempt. An uncertain write/clear must never
              // replay against a manually renewed agreement with the same two people.
              updated=Object.assign({},updated,{cancellationPlan:Object.assign({},record.cancellationPlan,{targetClearAttempted:true})});
              deps.writeRecord(updated);
            });
            manuals=manualRows(deps.readManual(roster,verified));
            var finalRecord=Object.assign({},updated,{status:'cancelled',cancellationPending:false,cancelledAt:deps.now(),updatedAt:deps.now()});delete finalRecord.cancellationPlan;
            deps.markCancelled(finalRecord);deps.writeRecord(finalRecord);updated=finalRecord;
          }catch(e){updated.cancellationError=['CONFLICT','CONTEXT_CHANGED','WAR_ENDED','INVALID'].indexOf(e&&e.publicCode)>=0?e.publicCode:'UNAVAILABLE';if(updated.cancellationError!=='WAR_ENDED'&&updated.cancellationError!=='CONTEXT_CHANGED')deps.writeRecord(updated);}
          rows=rows.filter(function(x){return x.id!==record.id;}).concat(updated);return updated;
        }
        function response(deal) {
          var visibleManual=manuals.slice(),display=rows.map(function(r){
            if(r.status!=='confirmed')return r;
            var matching=visibleManual.filter(function(m){return warContractProjectionMatches(m,r);});
            if(matching.length!==1)return r;
            var m=matching[0],merged=Object.assign({},r);visibleManual=visibleManual.filter(function(x){return x!==m;});
            ['onlineWindow','time','warlord','notes'].forEach(function(k){if(!merged[k])merged[k]=m[k];});return merged;
          });
          var publicRows=visibleManual.concat(display).map(function(r){var out={};['id','ourId','ourName','enemyId','enemyName','status','source','hits','onlineWindow','time','warlord','notes','createdAt','updatedAt'].forEach(function(k){out[k]=r[k]===undefined?'':r[k];});out.confirmationPending=Boolean(r.confirmation && (r.status==='reserved'||r.status==='contacted'));out.canCancel=!context.ended&&Number(r.ourId)===user.id&&positive(r.enemyId)&&['manual','confirmed'].indexOf(r.status)>=0;out.cancellationPending=r.cancellationPending===true;out.cancellationError=['CONFLICT','CONTEXT_CHANGED','WAR_ENDED','INVALID','UNAVAILABLE'].indexOf(r.cancellationError)>=0?r.cancellationError:'';if(r.source==='script'&&r.status==='confirmed'){out.mainSheetSynced=r.mainSheetSynced===true;out.mainSheetError=['CONFLICT','CONTEXT_CHANGED','WAR_ENDED','INVALID','UNAVAILABLE'].indexOf(r.mainSheetError)>=0?r.mainSheetError:'';}return out;});return {ok:true,user:user,context:context,contracts:publicRows,deal:deal?publicRows.find(function(r){return r.id===deal.id;}):(publicRows.find(function(r){return r.source==='script'&&r.status!=='cancelled'&&Number(r.ourId)===user.id;})||publicRows.find(function(r){return r.status!=='cancelled' && (Number(r.ourId)===user.id || norm(r.ourName)===norm(user.name));}))};
        }
        if(p.action==='board'){var owned=rows.find(function(r){return r.cancellationPending===true&&r.status==='confirmed'&&Number(r.ourId)===user.id;})||rows.find(function(r){return r.status==='confirmed'&&Number(r.ourId)===user.id;});if(owned){if(owned.cancellationPending===true)finishCancellation(owned,true);else project(owned,true);}return response();}
        if(p.action==='cancel'){
          if(p.cancelConfirmed!==true||typeof p.id!=='string'||typeof p.operationId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.operationId))fail('INVALID');
          if(typeof deps.planMainCancellation!=='function'||typeof deps.applyMainCancellation!=='function'||typeof deps.markCancelled!=='function')fail('CONFIG');
          var previous=rows.find(function(r){return r.cancelOperationId===p.operationId;});
          if(previous){if(Number(previous.ourId)!==user.id)fail('FORBIDDEN');if(previous.cancelOriginalId!==p.id&&previous.id!==p.id)fail('CONFLICT');return response(previous.status==='cancelled'?previous:finishCancellation(previous,false));}
          var chosen=rows.find(function(r){return r.id===p.id;})||manuals.find(function(r){return r.id===p.id;});if(!chosen||Number(chosen.ourId)!==user.id)fail('FORBIDDEN');
          if(chosen.status==='cancelled')return response(chosen);if(['confirmed','manual'].indexOf(chosen.status)<0)fail('CONFLICT');
          if(chosen.cancellationPending===true)return response(finishCancellation(chosen,false));
          if(chosen.source==='manual'){
            if(!positive(chosen.enemyId)||!p.expected||['ourId','ourName','enemyId','enemyName','hits','onlineWindow','time','warlord','notes'].some(function(k){return String(p.expected[k]===undefined?'':p.expected[k])!==String(chosen[k]===undefined?'':chosen[k]);}))fail('CONFLICT');
            chosen=Object.assign({},chosen,{id:deps.id(),source:'script',status:'confirmed',warId:context.warId,factionId:context.factionId,opponentId:context.opponentId,cancelFromManual:true});
          }
          var cancellation=Object.assign({},chosen,{cancelOriginalId:p.id,cancelOperationId:p.operationId,cancellationPending:true,cancellationError:'',cancellationPlan:deps.planMainCancellation(chosen,roster),updatedAt:deps.now()});
          deps.writeRecord(cancellation);rows=rows.filter(function(r){return r.id!==cancellation.id;}).concat(cancellation);return response(finishCancellation(cancellation,false));
        }
        if(p.action==='reserve') {
          if(typeof p.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.requestId)||!positive(p.enemyId))fail('INVALID');
          var old=rows.find(function(r){return r.requestId===p.requestId;});if(old){if(old.ourId!==user.id||old.enemyId!==Number(p.enemyId))fail('CONFLICT');return response(old);}
          var enemy=enemies.find(function(x){return Number(x.id)===Number(p.enemyId);});if(!enemy)fail('INVALID');
          if(blocks(manuals.concat(rows),user,enemy))fail('CONFLICT');
          var record={id:deps.id(),requestId:p.requestId,warId:context.warId,factionId:context.factionId,opponentId:context.opponentId,ourId:user.id,ourName:user.name,enemyId:Number(enemy.id),enemyName:String(enemy.name),status:'reserved',source:'script',createdAt:deps.now(),updatedAt:deps.now()};deps.writeRecord(record);rows.push(record);return response(record);
        }
        var record=rows.find(function(r){return r.id===p.id;});if(!record||record.ourId!==user.id)fail('FORBIDDEN');
        if(p.action==='confirm') {
          if(record.cancellationPending===true)fail('CONFLICT');
          if(p.strippedConfirmed!==true||!positive(p.hits)||Number(p.hits)>context.maxHits)fail('INVALID');
          // Only a previously saved canonical field may use the one-character formula escape allowance.
          function confirmationText(field,max) {
            var value=p[field];
            if(record.confirmation && typeof value==='string' && value===record[field] && value.length===max+1 && /^'[=+\-@]/.test(value))return text(value,max+1);
            return safe(text(value,max));
          }
          var terms={hits:Number(p.hits),onlineWindow:confirmationText('onlineWindow',120),time:confirmationText('time',80),warlord:confirmationText('warlord',80),notes:confirmationText('notes',1000),strippedConfirmed:true};
          var signature=JSON.stringify(terms);
          if(record.confirmation && record.confirmation!==signature)fail('CONFLICT');
          if(record.status==='confirmed')return response(project(record,false));
          if(record.status==='cancelled')fail('CONFLICT');
          var enemy=enemies.find(function(x){return Number(x.id)===record.enemyId;});if(!enemy||blocks(manuals.concat(rows),user,enemy,record.id))fail('CONFLICT');
          var finalRecord=Object.assign({},record,terms,{confirmation:signature,status:'confirmed',updatedAt:deps.now()});
          // Persist retry identity before append, but never mark the registry confirmed until output exists.
          Object.assign(record,terms,{confirmation:signature});deps.writeRecord(record);
          deps.appendConfirmed(finalRecord);deps.writeRecord(finalRecord);rows=rows.filter(function(r){return r.id!==record.id;}).concat(finalRecord);return response(project(finalRecord,false));
        }
        if(record.status==='confirmed'||record.status==='cancelled')fail('CONFLICT');
        record.status=p.action==='sent'?'contacted':'cancelled';record.updatedAt=deps.now();deps.writeRecord(record);return response(record);
      });
    } catch(e) { var code=e&&e.publicCode||'UNAVAILABLE';return {ok:false,error:{code:code,message:({INVALID:'Invalid request.',NO_WAR:'No ranked war is available for this faction.',WAR_ENDED:'This ranked war has ended. Contracts are read-only.',CONFIG:'Service configuration unavailable.',AUTH:'Faction membership could not be verified.',CONFLICT:'This agreement is no longer available or differs from its saved terms.',FORBIDDEN:'Only your own pending contact can be changed.',CONTEXT_CHANGED:'Current war changed. Reload the board.',UNAVAILABLE:'Service unavailable. Refresh the board before retrying.'})[code]||'Service unavailable.'}}; }
  }
  return {handle:handle};
}
if(typeof module!=='undefined')module.exports={createWarContractsService:createWarContractsService};
function warContractCellText(value){return String(value===undefined||value===null?'':value).replace(/^'(?=[=+\-@])/,'').trim();}
function warContractSamePerson(aId,aName,bId,bName){
  function norm(v){return String(v||'').replace(/\[\d+\]/g,'').trim().replace(/\s+/g,' ').toLowerCase();}
  return aId&&bId?Number(aId)===Number(bId):Boolean(norm(aName)&&norm(aName)===norm(bName));
}
function warContractProjectionMatches(manual,record){
  return warContractSamePerson(manual.ourId,manual.ourName,record.ourId,record.ourName)&&warContractSamePerson(manual.enemyId,manual.enemyName,record.enemyId,record.enemyName)&&
    ['hits','onlineWindow','time','warlord','notes'].every(function(field){var wanted=warContractCellText(record[field]);return !wanted||(field==='hits'&&Number.isSafeInteger(Number(manual[field]))&&Number(manual[field])>0?Number(manual[field])===Number(record[field]):warContractCellText(manual[field])===wanted);});
}
function writeMainWarContract(sheet,record){
  function conflict(){var e=new Error('Main sheet conflict');e.publicCode='CONFLICT';throw e;}
  function empty(value){return value===''||value===undefined||value===null;}
  function matches(value,rich,formula,id,name){
    var link=rich&&rich.getLinkUrl?rich.getLinkUrl():'';
    var found=String(link||formula||'').match(/XID=(\d+)/i)||String(value||'').match(/\[(\d+)\]/);
    return warContractSamePerson(found?Number(found[1]):null,value,id,name);
  }
  if(!record||!Number.isSafeInteger(Number(record.ourId))||Number(record.ourId)<=0||!Number.isSafeInteger(Number(record.enemyId))||Number(record.enemyId)<=0||!record.ourName||!record.enemyName||!Number.isSafeInteger(Number(record.hits))||Number(record.hits)<=0||Number(record.hits)>10000)conflict();
  var max=sheet.getMaxRows(),count=Math.min(max,10009)-9;
  if(count<1||count>10000)conflict();
  var area=sheet.getRange(10,4,count,9),values=area.getDisplayValues(),raw=area.getValues(),formulas=area.getFormulas(),rich=area.getRichTextValues(),notes=area.getNotes();
  var pair=[],unassigned=[],unused=[];
  values.forEach(function(row,i){
    var own=matches(row[0],rich[i][0],formulas[i][0],record.ourId,record.ourName),targets=[];
    [4,5].forEach(function(col){if(!empty(row[col])||formulas[i][col]){var target=matches(row[col],rich[i][col],formulas[i][col],record.enemyId,record.enemyName);if(target&&!own)conflict();targets.push({col:col,matches:target});}});
    if(own){if(targets.some(function(t){return !t.matches;})||targets.length>1)conflict();if(targets.length)pair.push({index:i,target:targets[0].col});else unassigned.push({index:i,target:4});}
    if(row.every(empty)&&formulas[i].every(empty)&&notes[i].every(empty))unused.push({index:i,target:4});
  });
  if(pair.length>1||(!pair.length&&unassigned.length>1))conflict();
  var chosen=pair[0]||unassigned[0]||unused[0],row=chosen?chosen.index+10:max+1,created=false;
  if(!chosen){if(row>10009)conflict();if(row>max){sheet.insertRowsAfter(max,row-max);var target=sheet.getRange(row,4,1,9),style=sheet.getRange(Math.max(10,row-1),4,1,9);style.copyTo(target,{formatOnly:true});target.setDataValidations(style.getDataValidations());}created=true;chosen={index:-1,target:4};}
  var old=created?Array(9).fill(''):values[chosen.index],oldFormulas=created?Array(9).fill(''):formulas[chosen.index],oldNotes=created?Array(9).fill(''):notes[chosen.index];
  var desired={0:String(record.ourName)+' ['+record.ourId+']',2:record.onlineWindow||'',3:Number(record.hits),6:record.time||'',7:record.warlord||'',8:record.notes||''};
  desired[chosen.target]=String(record.enemyName)+' ['+record.enemyId+']';
  var updates=[];
  Object.keys(desired).map(Number).sort(function(a,b){return a-b;}).forEach(function(col){
    var wanted=desired[col];if(empty(wanted))return;
    if(!empty(old[col])||oldFormulas[col]){if(col===0||col===chosen.target)return;if(col===3&&typeof raw[chosen.index][col]==='number'?raw[chosen.index][col]!==wanted:warContractCellText(old[col])!==warContractCellText(wanted))conflict();return;}
    if(oldNotes[col])conflict();updates.push({col:col,value:wanted});
  });
  var groups=[];updates.forEach(function(item){var group=groups[groups.length-1];if(!group||group[group.length-1].col+1!==item.col){group=[];groups.push(group);}group.push(item);});
  // Recheck every intended blank immediately before each bounded write; E/I are never included.
  groups.forEach(function(group){
    var range=sheet.getRange(row,group[0].col+4,1,group.length),current=range.getValues()[0],f=range.getFormulas()[0],n=range.getNotes()[0];
    if(current.some(function(value,i){return !empty(value)||f[i]||n[i];}))conflict();
    range.setValues([group.map(function(item){if(typeof item.value==='number')return item.value;var value=warContractCellText(item.value);return /^[=+\-@]/.test(value)?"'"+value:value;})]);
  });
  return row;
}
function warCancellationPairs(sheet,record){
  function conflict(){var e=new Error('Cancellation conflict');e.publicCode='CONFLICT';throw e;}
  if(!record||!Number.isSafeInteger(Number(record.ourId))||Number(record.ourId)<=0||!Number.isSafeInteger(Number(record.enemyId))||Number(record.enemyId)<=0||sheet.getLastRow()>10009)conflict();
  var count=Math.min(sheet.getMaxRows(),10009)-9;if(count<1)conflict();
  var area=sheet.getRange(10,4,count,9),values=area.getDisplayValues(),raw=area.getValues(),formulas=area.getFormulas(),rich=area.getRichTextValues(),notes=area.getNotes(),pairs=[];
  function person(value,link,formula,id,name){var url=link&&link.getLinkUrl?link.getLinkUrl():'';var found=String(url||formula||'').match(/XID=(\d+)/i)||String(value||'').match(/\[(\d+)\]/);return warContractSamePerson(found?Number(found[1]):null,value,id,name);}
  values.forEach(function(row,i){if(!person(row[0],rich[i][0],formulas[i][0],record.ourId,record.ourName))return;[4,5].forEach(function(col){if(person(row[col],rich[i][col],formulas[i][col],record.enemyId,record.enemyName))pairs.push({row:i+10,targetCol:col+4,values:row,raw:raw[i],formulas:formulas[i],notes:notes[i],other:!!(row[col===4?5:4]||formulas[i][col===4?5:4])});});});
  if(pairs.length>1)conflict();return pairs;
}
function planMainWarCancellation(sheet,record){
  var pairs=warCancellationPairs(sheet,record);if(!pairs.length){if(record.cancelFromManual){var missing=new Error('Manual pairing changed');missing.publicCode='CONFLICT';throw missing;}return {absent:true};}
  var pair=pairs[0],offset=pair.targetCol-4;if(pair.formulas[offset]||pair.notes[offset]){var e=new Error('Protected target');e.publicCode='CONFLICT';throw e;}
  var fields=[];
  if(!pair.other)[[6,'onlineWindow'],[7,'hits'],[10,'time'],[11,'warlord'],[12,'notes']].forEach(function(item){var col=item[0],key=item[1],value=pair.values[col-4],wanted=record[key];if(wanted===undefined||wanted===null||wanted===''||!value||pair.formulas[col-4]||pair.notes[col-4])return;var equal=key==='hits'&&typeof pair.raw[col-4]==='number'?pair.raw[col-4]===Number(wanted):warContractCellText(value)===warContractCellText(wanted);if(equal)fields.push({col:col,value:key==='hits'&&typeof pair.raw[col-4]==='number'?pair.raw[col-4]:value});});
  return {row:pair.row,ownValue:pair.values[0],targetCol:pair.targetCol,targetValue:pair.values[offset],fields:fields};
}
function applyMainWarCancellation(sheet,record,plan,beforeTargetClear){
  function conflict(){var e=new Error('Cancellation conflict');e.publicCode='CONFLICT';throw e;}
  var pairs=warCancellationPairs(sheet,record);if(!pairs.length)return;
  var pair=pairs[0];if(!plan||plan.absent||plan.targetClearAttempted===true||typeof beforeTargetClear!=='function'||pair.row!==plan.row||pair.targetCol!==plan.targetCol||pair.values[0]!==plan.ownValue||pair.values[plan.targetCol-4]!==plan.targetValue||!Array.isArray(plan.fields)||plan.fields.length>5)conflict();
  var target=sheet.getRange(plan.row,plan.targetCol),own=sheet.getRange(plan.row,4);
  function stillTarget(){return own.getDisplayValues()[0][0]===plan.ownValue&&target.getDisplayValues()[0][0]===plan.targetValue;}
  function protectedTarget(){if(target.getFormulas()[0][0]||target.getNotes()[0][0])conflict();}
  protectedTarget();
  // Shared fields are optional cleanup. New manual values/formulas/annotations survive.
  if(!pair.other)plan.fields.forEach(function(item){
    if([6,7,10,11,12].indexOf(item.col)<0)conflict();if(!stillTarget())return;
    var range=sheet.getRange(plan.row,item.col),raw=range.getValues()[0][0],display=range.getDisplayValues()[0][0];
    if(range.getFormulas()[0][0]||range.getNotes()[0][0])return;
    var equal=typeof item.value==='number'?raw===item.value:warContractCellText(display)===warContractCellText(item.value);if(equal)range.clearContent();
  });
  // Clear the target last, retaining duplicate protection until the other writes finish.
  if(stillTarget()){protectedTarget();beforeTargetClear();if(stillTarget()){protectedTarget();target.clearContent();}}
}
function fillWarContractHeaders(sheet,context) {
  if(!context||context.ended||!context.opponentName)return;
  function norm(value){return String(value||'').replace(/\[\d+\]/g,'').trim().replace(/\s+/g,' ').toLowerCase();}
  function blank(cell){return cell.isBlank()&&!cell.getFormula();}
  var opponent=sheet.getRange('D6');
  if(blank(opponent)){var name=String(context.opponentName);opponent.setValue(/^[=+\-@]/.test(name)?"'"+name:name);}
  if(norm(opponent.getDisplayValue())!==norm(context.opponentName))return;
  var start=Number(context.startAt),date=Number.isSafeInteger(start)&&start>0?new Date(start*1000):null;
  if(date&&Number.isFinite(date.getTime())){var time=sheet.getRange('E6');if(blank(time))time.setValue(date.toISOString().slice(0,16).replace('T',' '));}
}
function onOpen() { SpreadsheetApp.getUi().createMenu('War Contracts Service').addItem('Configure faction service','setupWarContracts').addToUi(); }
function setupWarContracts() {
  var ui=SpreadsheetApp.getUi(),book=SpreadsheetApp.getActiveSpreadsheet(),values={WORKBOOK_ID:book.getId()};
  var answer=ui.prompt('War Contracts setup','Our FACTION_ID (positive Torn ID). The ranked war and opponent are detected automatically.',ui.ButtonSet.OK_CANCEL);if(answer.getSelectedButton()!==ui.Button.OK)throw new Error('Setup cancelled.');var value=answer.getResponseText().trim();if(!/^[1-9]\d*$/.test(value))throw new Error('Invalid ID.');values.FACTION_ID=value;
  if(!book.getSheetByName('War Contracts'))throw new Error('Manual War Contracts tab missing.');
  PropertiesService.getScriptProperties().setProperties(values);
  ['Script Contracts','Script Contract Registry'].forEach(function(name){if(!book.getSheetByName(name))book.insertSheet(name).appendRow(['Record ID','War ID','Our member','Enemy','Status','Hits','Online window','Time','Warlord','Notes','Record JSON']);});
  ui.alert('Configuration saved. Deploy a new web app version after reviewing the source and access settings.');
}
function warContractsDependencies() {
  var prop=PropertiesService.getScriptProperties(),cache=CacheService.getScriptCache();
  var config={factionId:Number(prop.getProperty('FACTION_ID'))};
  var book=SpreadsheetApp.openById(prop.getProperty('WORKBOOK_ID'));
  function sheet(name){var s=book.getSheetByName(name);if(!s)throw new Error('Missing sheet');return s;}
  function hash(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
  function fetchJson(path,key){var r=UrlFetchApp.fetch('https://api.torn.com/v2/'+path,{headers:{Authorization:'ApiKey '+key},muteHttpExceptions:true,followRedirects:false});if(r.getResponseCode()!==200)throw new Error('Torn unavailable');var body=r.getContentText();if(body.length>300000)throw new Error('Response too large');var j=JSON.parse(body);if(j.error)throw new Error('Torn unavailable');return j;}
  function cached(k,seconds,load){var hit=cache.get(k);if(hit)return JSON.parse(hit);var value=load(),encoded=JSON.stringify(value);if(encoded.length<80000)cache.put(k,encoded,seconds);return value;}
  function readRows(name){var s=sheet(name),count=s.getLastRow()-1;if(count<1)return [];if(count>10000)throw new Error('Registry capacity');return s.getRange(2,11,count,1).getValues().filter(function(r){return r[0];}).map(function(r){return JSON.parse(r[0]);});}
  function cells(r){function literal(v){v=v===undefined?'':String(v);return /^[=+\-@]/.test(v)?"'"+v:v;}return [r.id,r.warId,r.ourName,r.enemyName,r.status,r.hits,r.onlineWindow,r.time,r.warlord,r.notes,JSON.stringify(r)].map(literal);}
  function lookup(value,rich,formula,roster){var str=String(value||''),url=rich&&rich.getLinkUrl?rich.getLinkUrl():null;var found=(url||String(formula||'')).match(/(?:XID=|profiles?\.php\?XID=)(\d+)/i)||str.match(/\[(\d+)\]/);var name=str.replace(/\[\d+\]/g,'').trim().replace(/\s+/g,' ');var m=roster.find(function(x){return x.name.trim().replace(/\s+/g,' ').toLowerCase()===name.toLowerCase();});return {id:found?Number(found[1]):m?Number(m.id):null,name:name};}
  return {
    config:config,
    authenticate:function(key){
      // Bounded attempts per credential and globally; key itself never enters cache keys or values.
      var digest=hash(key),guard=LockService.getScriptLock();guard.waitLock(5000);try{var bucket='rate:'+Math.floor(Date.now()/60000),count=Number(cache.get(bucket)||0),own='rate:'+digest+':'+Math.floor(Date.now()/60000),n=Number(cache.get(own)||0);if(count>=240||n>=30)throw new Error('Rate limited');cache.put(bucket,String(count+1),70);cache.put(own,String(n+1),70);}finally{guard.releaseLock();}
      return cached('identity:'+digest,30,function(){var info=fetchJson('key/info',key).info;if(!info||!info.user)throw new Error('Invalid identity');return {id:Number(info.user.id),factionId:Number(info.user.faction_id),name:''};});
    },
    verifyContext:function(key,c,fresh){
      function discover(){
        var data=fetchJson('faction/'+c.factionId+'/wars',key);
        if(!data.wars||!Object.prototype.hasOwnProperty.call(data.wars,'ranked'))throw new Error('Invalid current wars');
        var war=data.wars.ranked,warId=war&&war.war_id,history=false;
        if(war===null){
          var previous=fetchJson('faction/'+c.factionId+'/rankedwars?limit=20',key);
          if(!Array.isArray(previous.rankedwars)||previous.rankedwars.length>20)throw new Error('Invalid war list');
          if(!previous.rankedwars.length)return null;
          war=previous.rankedwars[0];warId=war&&war.id;history=true;
        }
        if(!war||!Number.isSafeInteger(Number(warId))||Number(warId)<=0||!Array.isArray(war.factions)||war.factions.length!==2||!war.factions.every(function(f){return f&&Number.isSafeInteger(Number(f.id))&&Number(f.id)>0;})||!war.factions.some(function(f){return Number(f.id)===Number(c.factionId);}))throw new Error('Invalid ranked war');
        var opponent=war.factions.find(function(f){return Number(f.id)!==Number(c.factionId);});
        if(!opponent||typeof opponent.name!=='string'||!opponent.name.trim()||!Object.prototype.hasOwnProperty.call(war,'end')||!Number.isFinite(Number(war.end))||Number(war.end)<0||(history&&Number(war.end)<=0))throw new Error('Invalid ranked opponent');
        var own=war.factions.find(function(f){return Number(f.id)===Number(c.factionId);});
        var start=Number(war.start),end=Number(war.end);
        return {warId:Number(warId),factionId:Number(c.factionId),factionName:String(own.name||''),opponentId:Number(opponent.id),opponentName:opponent.name,startAt:Number.isSafeInteger(start)&&start>0?start:null,endAt:end>0?end:null,ended:end>0};
      }
      // Boards use a brief public cache. Writes always check Torn again under the script lock.
      return fresh?discover():cached('current-war:'+c.factionId,30,discover);
    },
    rosters:function(key,c){function members(id){return cached('roster:'+id,30,function(){var data=fetchJson('faction/'+id+'/members?striptags=true',key);if(!Array.isArray(data.members)||data.members.length>1000)throw new Error('Invalid roster');return data.members.map(function(m){return {id:Number(m.id),name:String(m.name)};});});}return {ours:members(c.factionId),enemies:members(c.opponentId)};},
    headersNeedFill:function(){var s=sheet('War Contracts');return ['D6','E6'].some(function(address){var cell=s.getRange(address);return cell.isBlank()&&!cell.getFormula();});},
    readManual:function(roster,context){var s=sheet('War Contracts');fillWarContractHeaders(s,context);var count=s.getLastRow()-9;if(count>10000)throw new Error('Manual capacity');var rows=count>0?s.getRange(10,4,count,9).getDisplayValues():[],raw=count>0?s.getRange(10,4,count,9).getValues():[],rich=count>0?s.getRange(10,4,count,9).getRichTextValues():[],formulas=count>0?s.getRange(10,4,count,9).getFormulas():[];var contracts=[];
      rows.forEach(function(r,i){if(!r[0]||(!r[4]&&!r[5]))return;[4,5].forEach(function(col){if(!r[col])return;var a=lookup(r[0],rich[i][0],formulas[i][0],roster.ours),b=lookup(r[col],rich[i][col],formulas[i][col],roster.enemies);contracts.push({id:'manual-'+(i+10)+'-'+col,ourId:a.id,ourName:a.name,enemyId:b.id,enemyName:b.name,hits:typeof raw[i][3]==='number'?raw[i][3]:r[3],onlineWindow:r[2],time:r[6],warlord:r[7],notes:r[8]});});});return {maxHits:Number(s.getRange('I6').getValue()),opponentName:String(s.getRange('D6').getDisplayValue()),contracts:contracts};},
    readRecords:function(){return {records:readRows('Script Contract Registry'),confirmed:readRows('Script Contracts')};},
    writeRecord:function(r){var s=sheet('Script Contract Registry'),n=s.getLastRow(),ids=n>1?s.getRange(2,1,n-1,1).getValues():[],index=ids.findIndex(function(row){return String(row[0])===r.id;});s.getRange(index<0?n+1:index+2,1,1,11).setNumberFormat('@').setValues([cells(r)]);SpreadsheetApp.flush();},
    appendConfirmed:function(r){var s=sheet('Script Contracts'),rows=readRows('Script Contracts');if(rows.some(function(x){return x.id===r.id;}))return;s.getRange(s.getLastRow()+1,1,1,11).setNumberFormat('@').setValues([cells(r)]);SpreadsheetApp.flush();},
    syncMainContract:function(r,roster){var own=roster.ours.find(function(m){return Number(m.id)===Number(r.ourId);}),enemy=roster.enemies.find(function(m){return Number(m.id)===Number(r.enemyId);});if(!own||!enemy)throw new Error('Roster changed');var row=writeMainWarContract(sheet('War Contracts'),Object.assign({},r,{ourName:own.name,enemyName:enemy.name}));SpreadsheetApp.flush();return row;},
    planMainCancellation:function(r){return planMainWarCancellation(sheet('War Contracts'),r);},
    applyMainCancellation:function(r,plan,roster,beforeTargetClear){applyMainWarCancellation(sheet('War Contracts'),r,plan,beforeTargetClear);SpreadsheetApp.flush();},
    markCancelled:function(r){var s=sheet('Script Contracts'),count=s.getLastRow()-1;if(count>10000)throw new Error('History capacity');var ids=count>0?s.getRange(2,1,count,1).getValues():[],matches=[];ids.forEach(function(row,i){if(String(row[0])===r.id)matches.push(i+2);});if(matches.length>1)throw new Error('Duplicate history');var row=matches[0];if(row){var old=JSON.parse(s.getRange(row,11).getValue());if(old.id!==r.id||Number(old.ourId)!==Number(r.ourId)||Number(old.enemyId)!==Number(r.enemyId)||Number(old.warId)!==Number(r.warId)||Number(old.factionId)!==Number(r.factionId)||Number(old.opponentId)!==Number(r.opponentId)||old.confirmation!==r.confirmation)throw new Error('History changed');}s.getRange(row||s.getLastRow()+1,1,1,11).setNumberFormat('@').setValues([cells(r)]);SpreadsheetApp.flush();},
    lock:function(fn){var l=LockService.getScriptLock();l.waitLock(20000);try{return fn();}finally{l.releaseLock();}},now:function(){return Date.now();},id:function(){return Utilities.getUuid();}
  };
}
function doPost(e) {
  var result;
  try { if(!e||!e.postData||e.postData.contents.length>16384)throw new Error('Invalid body');result=createWarContractsService(warContractsDependencies()).handle(JSON.parse(e.postData.contents)); }
  catch(err){result={ok:false,error:{code:'UNAVAILABLE',message:'Service unavailable. Refresh the board before retrying.'}};}
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}



