const assert = require('node:assert/strict');
const { registerTornScriptMenu } = require('../src/script-hub-adapter.cjs');
const { normalizeHubEntry } = require('../src/script-hub-core.cjs');
const meta = { id:'settings-tool', name:'Settings Tool', icon:'scripts', version:'1', url:'https://www.torn.com/gym.php', actions:[{id:'open',label:'Open'}], pages:[{id:'general',title:'General',values:{private:'discard'}}], category:'Tools', capabilities:['settings'] };
assert.deepEqual(normalizeHubEntry(meta,'https://www.torn.com').pages,[{id:'general',title:'General'}], 'page descriptors must survive registration without values');
(async () => {
  const doc = new EventTarget(), win = new EventTarget(), replies=[];
  let instance, settings = { title:'Original', amount:2 }, revision='r1', saves=0;
  const secret = crypto.randomUUID();
  doc.addEventListener('torn-script-hub:v1:register', event => { instance=JSON.parse(event.detail).instance; });
  doc.addEventListener('torn-script-hub:v1:rpc-result', event => replies.push(JSON.parse(event.detail)));
  const schema={id:'general',title:'General',sections:[{id:'main',title:'Main',fields:[{id:'title',type:'text',label:'Title'},{id:'amount',type:'number',label:'Amount'},{id:'token',type:'password',label:'Token',default:secret}]}],actions:[]};
  const dispose=registerTornScriptMenu(doc,win,meta,{open(){}},{
    describePage:()=>schema,
    readSettings:()=>({values:{...settings,token:secret},revision}),
    saveSettings:(page,values)=>{saves++;settings={...settings,...values};revision='r2';return {values:settings,revision};},
  });
  async function rpc(method, extra={}) {
    doc.dispatchEvent(new CustomEvent('torn-script-hub:v1:rpc',{detail:JSON.stringify({id:meta.id,instance,request:'rpc-'+method+'-'+replies.length,method,page:'general',...extra})}));
    await new Promise(resolve=>setImmediate(resolve));
    return replies.at(-1);
  }
  const described=await rpc('describe');
  assert.equal(described.status,'ok');
  assert.equal(JSON.stringify(described).includes(secret),false, 'secret schema defaults cannot enter public events');
  const read=await rpc('read');
  assert.deepEqual(read.data,{values:settings,revision:'r1'});
  const stale=await rpc('save',{values:{amount:3},revision:'old'});
  assert.equal(stale.status,'conflict');assert.equal(saves,0);
  const malicious=await rpc('save',{values:{token:secret},revision:'r1'});
  assert.equal(malicious.status,'error');assert.equal(saves,0);
  const saved=await rpc('save',{values:{amount:3},revision:'r1'});
  assert.equal(saved.status,'ok');assert.equal(settings.amount,3);assert.equal(saves,1);
  settings.title='x'.repeat(10000);
  const longRead=await rpc('read');assert.equal(longRead.data.values.title.length,10000,'supported long text survives readback');
  assert.equal(JSON.stringify(replies).includes(secret),false);
  dispose();
  const count=replies.length;
  await rpc('read');assert.equal(replies.length,count,'disposal releases optional RPC listeners');
  console.log('PASS additive pages, owned settings RPC, conflict handling and secret omission');
})().catch(error=>{console.error(error);process.exitCode=1;});
