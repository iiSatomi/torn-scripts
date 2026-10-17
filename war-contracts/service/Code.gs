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
      if (!p || JSON.stringify(p).length > 16384 || ['board','reserve','sent','release','confirm'].indexOf(p.action)<0 || typeof p.apiKey !== 'string' || !p.apiKey || p.apiKey.length>128) fail('INVALID');
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
        confirmed.forEach(function(r){rows=rows.filter(function(x){return x.id!==r.id;});rows.push(r);});
        var manuals=(manual.contracts||[]).map(function(r,i){return Object.assign({id:'manual-'+i,ourId:null,enemyId:null,ourName:'',enemyName:'',hits:'',onlineWindow:'',time:'',warlord:'',notes:'',createdAt:null,updatedAt:null},r,{status:'manual',source:'manual'});});
        function response(deal) { var publicRows=manuals.concat(rows).map(function(r){var out={};['id','ourId','ourName','enemyId','enemyName','status','source','hits','onlineWindow','time','warlord','notes','createdAt','updatedAt'].forEach(function(k){out[k]=r[k]===undefined?'':r[k];});out.confirmationPending=Boolean(r.confirmation && (r.status==='reserved'||r.status==='contacted'));return out;});return {ok:true,user:user,context:context,contracts:publicRows,deal:deal?publicRows.find(function(r){return r.id===deal.id;}):publicRows.find(function(r){return r.status!=='cancelled' && (Number(r.ourId)===user.id || norm(r.ourName)===norm(user.name));})}; }
        if(p.action==='board')return response();
        if(p.action==='reserve') {
          if(typeof p.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.requestId)||!positive(p.enemyId))fail('INVALID');
          var old=rows.find(function(r){return r.requestId===p.requestId;});if(old){if(old.ourId!==user.id||old.enemyId!==Number(p.enemyId))fail('CONFLICT');return response(old);}
          var enemy=enemies.find(function(x){return Number(x.id)===Number(p.enemyId);});if(!enemy)fail('INVALID');
          if(blocks(manuals.concat(rows),user,enemy))fail('CONFLICT');
          var record={id:deps.id(),requestId:p.requestId,warId:context.warId,factionId:context.factionId,opponentId:context.opponentId,ourId:user.id,ourName:user.name,enemyId:Number(enemy.id),enemyName:String(enemy.name),status:'reserved',source:'script',createdAt:deps.now(),updatedAt:deps.now()};deps.writeRecord(record);rows.push(record);return response(record);
        }
        var record=rows.find(function(r){return r.id===p.id;});if(!record||record.ourId!==user.id)fail('FORBIDDEN');
        if(p.action==='confirm') {
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
          if(record.status==='confirmed')return response(record);
          if(record.status==='cancelled')fail('CONFLICT');
          var enemy=enemies.find(function(x){return Number(x.id)===record.enemyId;});if(!enemy||blocks(manuals.concat(rows),user,enemy,record.id))fail('CONFLICT');
          var finalRecord=Object.assign({},record,terms,{confirmation:signature,status:'confirmed',updatedAt:deps.now()});
          // Persist retry identity before append, but never mark the registry confirmed until output exists.
          Object.assign(record,terms,{confirmation:signature});deps.writeRecord(record);
          deps.appendConfirmed(finalRecord);deps.writeRecord(finalRecord);rows=rows.filter(function(r){return r.id!==record.id;}).concat(finalRecord);return response(finalRecord);
        }
        if(record.status==='confirmed'||record.status==='cancelled')fail('CONFLICT');
        record.status=p.action==='sent'?'contacted':'cancelled';record.updatedAt=deps.now();deps.writeRecord(record);return response(record);
      });
    } catch(e) { var code=e&&e.publicCode||'UNAVAILABLE';return {ok:false,error:{code:code,message:({INVALID:'Invalid request.',NO_WAR:'No ranked war is available for this faction.',WAR_ENDED:'This ranked war has ended. Contracts are read-only.',CONFIG:'Service configuration unavailable.',AUTH:'Faction membership could not be verified.',CONFLICT:'This agreement is no longer available or differs from its saved terms.',FORBIDDEN:'Only your own pending contact can be changed.',CONTEXT_CHANGED:'Current war changed. Reload the board.',UNAVAILABLE:'Service unavailable. Refresh the board before retrying.'})[code]||'Service unavailable.'}}; }
  }
  return {handle:handle};
}
if(typeof module!=='undefined')module.exports={createWarContractsService:createWarContractsService};
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
    readManual:function(roster,context){var s=sheet('War Contracts');fillWarContractHeaders(s,context);var count=s.getLastRow()-9;if(count>10000)throw new Error('Manual capacity');var rows=count>0?s.getRange(10,4,count,9).getDisplayValues():[],rich=count>0?s.getRange(10,4,count,9).getRichTextValues():[],formulas=count>0?s.getRange(10,4,count,9).getFormulas():[];var contracts=[];
      rows.forEach(function(r,i){if(!r[0]||(!r[4]&&!r[5]))return;[4,5].forEach(function(col){if(!r[col])return;var a=lookup(r[0],rich[i][0],formulas[i][0],roster.ours),b=lookup(r[col],rich[i][col],formulas[i][col],roster.enemies);contracts.push({id:'manual-'+(i+10)+'-'+col,ourId:a.id,ourName:a.name,enemyId:b.id,enemyName:b.name,hits:r[3],onlineWindow:r[2],time:r[6],warlord:r[7],notes:r[8]});});});return {maxHits:Number(s.getRange('I6').getValue()),opponentName:String(s.getRange('D6').getDisplayValue()),contracts:contracts};},
    readRecords:function(){return {records:readRows('Script Contract Registry'),confirmed:readRows('Script Contracts')};},
    writeRecord:function(r){var s=sheet('Script Contract Registry'),n=s.getLastRow(),ids=n>1?s.getRange(2,1,n-1,1).getValues():[],index=ids.findIndex(function(row){return String(row[0])===r.id;});s.getRange(index<0?n+1:index+2,1,1,11).setNumberFormat('@').setValues([cells(r)]);SpreadsheetApp.flush();},
    appendConfirmed:function(r){var s=sheet('Script Contracts'),rows=readRows('Script Contracts');if(rows.some(function(x){return x.id===r.id;}))return;s.getRange(s.getLastRow()+1,1,1,11).setNumberFormat('@').setValues([cells(r)]);SpreadsheetApp.flush();},
    lock:function(fn){var l=LockService.getScriptLock();l.waitLock(20000);try{return fn();}finally{l.releaseLock();}},now:function(){return Date.now();},id:function(){return Utilities.getUuid();}
  };
}
function doPost(e) {
  var result;
  try { if(!e||!e.postData||e.postData.contents.length>16384)throw new Error('Invalid body');result=createWarContractsService(warContractsDependencies()).handle(JSON.parse(e.postData.contents)); }
  catch(err){result={ok:false,error:{code:'UNAVAILABLE',message:'Service unavailable. Refresh the board before retrying.'}};}
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}



