const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const source = fs.readFileSync(path.resolve(__dirname, '../../Torn_OC_Suite_Codex.user.js'), 'utf8');
const region = source.slice(source.indexOf('  function _consMembers('), source.indexOf('  function mountConsumablesInline('));
const ui = source.match(/const _consUi = [^\n]+/)[0];
const css = source.slice(source.indexOf('    /* ─── Codex Consumables'), source.indexOf('    /* ─── Crimes tab content'));

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setContent('<style>body{background:#111923;color:#eee;font:14px Arial;margin:12px;--ocm-bg-card:#192536;--ocm-border:#405065;--ocm-text:#eee;--ocm-text-dim:#c3ccd9;--ocm-text-faint:#aeb9c9;--ocm-fb:#57b7ef;--ocm-fb-br:#8ad8ff}#ocm-root{max-width:1000px;margin:auto}td,th{padding:8px}table{width:100%}</style><div id="ocm-root" class="ocm-ui2"><div id="ocm-pane-consumables"></div></div>');
    await page.addStyleTag({content:css});
    await page.evaluate(({region,ui}) => {
      const fields = [{key:'xantaken',label:'Xanax',icon:'💊',type:'counter'},{key:'refills',label:'Refills',icon:'⚡',type:'counter'}];
      const state = {period:'lifetime',rows:[{id:1,name:'Zero',xantaken:0,refills:0},{id:2,name:'Missing'},{id:3,name:'Alex',xantaken:42,refills:2},{id:4,name:'Morgan',xantaken:5,refills:1}],meta:{historyDays:7}};
      const FBUSAGE = {STAT_FIELDS:fields,PERIODS:[{key:'lifetime',label:'Lifetime'},{key:'weekly',label:'7 Days'}],hasConfig:()=>true,getState:()=>state,setPeriod:p=>state.period=p,periodValue:(r,f)=>r[f.key]==null?null:{value:r[f.key],partial:state.period==='weekly'},refresh:async()=>false};
      const OCUI={esc:value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))};
      new Function('FBUSAGE','OCUI','_num','openSuiteConfig',ui+'\n'+region+'\nwindow.consTest={state:FBUSAGE.getState(),ui:_consUi,render:renderConsumables};renderConsumables();')(FBUSAGE,OCUI,String,()=>{});
    },{region,ui});
    assert.equal(await page.$eval('tbody tr:first-child td',el=>el.textContent),'Alex');
    await page.select('#ocm-cons-sort','xantaken');
    assert.equal(await page.$eval('tbody tr:first-child td',el=>el.textContent),'Alex');
    await page.click('#ocm-cons-direction');
    assert.equal(await page.$eval('tbody tr:first-child td',el=>el.textContent),'Zero');
    assert.equal(await page.$eval('tbody tr:last-child td',el=>el.textContent),'Missing');
    await page.select('#ocm-cons-activity','zero');
    assert.equal(await page.$$eval('tbody tr',els=>els.length),1);
    await page.select('#ocm-cons-activity','missing');
    assert.equal(await page.$eval('tbody',el=>el.textContent.includes('Missing')),true);
    assert.equal(await page.$eval('tbody',el=>el.textContent.includes('—')),true);
    await page.select('#ocm-cons-activity','all');
    await page.click('[data-p="weekly"]');
    assert.match(await page.$eval('tbody',el=>el.textContent),/Partial period/);
    await page.click('#ocm-cons-refresh');
    await page.waitForFunction(()=>document.getElementById('ocm-cons-status').textContent.includes('failed'));
    await page.type('#ocm-cons-search','Alex');
    assert.match(await page.$eval('#ocm-cons-status',el=>el.textContent),/failed/);
    assert.equal(await page.$$eval('tbody tr',els=>els.length),1);
    await page.evaluate(()=>{consTest.ui.query='';consTest.ui.error='';consTest.state.rows=Array.from({length:62},(_,i)=>({id:i+1,name:'Member '+i,xantaken:i,refills:1}));consTest.render();});
    assert.equal(await page.$$eval('tbody tr',els=>els.length),25);
    await page.click('#ocm-cons-next');await page.click('#ocm-cons-next');
    assert.equal(await page.$$eval('tbody tr',els=>els.length),12);
    for(const [width,height] of [[1920,1080],[390,844],[430,932],[844,390]]) {
      await page.setViewport({width,height});
      await page.evaluate(()=>scrollTo(0,0));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Overflow at '+width);
      if(width<=900) assert.ok(await page.$eval('#ocm-cons-search',el=>el.getBoundingClientRect().height)>=44);
      await page.screenshot({path:path.join(__dirname,`shots/consumables-${width}.png`),fullPage:true});
    }
    assert.deepEqual(errors,[]);
    console.log('Consumables browser checks passed: numeric sorting, missing/zero filters, partial data, persistent errors, pagination, and four viewport sizes.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
