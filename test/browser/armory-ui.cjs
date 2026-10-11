const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const source = fs.readFileSync(path.resolve(__dirname, '../../Torn_OC_Suite_Codex.user.js'), 'utf8');
const region = source.slice(source.indexOf('  const _armMounted = new WeakSet();'), source.indexOf('  function _ocmDiagBytes('));

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<style>body{margin:8px;background:#17202c;color:#eee;font:14px Arial;--ocm-text-dim:#bac5d4;--ocm-link:#8ac8ff;--ocm-border-soft:#445;--ocm-text:#eee}section{padding:12px;border:1px solid #445;margin-bottom:12px}button,input,select{padding:8px;background:#253446;color:#eee;border:1px solid #64758a}table{width:100%}td,th{padding:8px}#ocm-pane-armoury{max-width:1000px;margin:auto}</style><button id="ocm-config-toggle">Config</button><div id="ocm-pane-armoury"></div>');
    await page.evaluate(region => {
      const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
      const ledger = Object.fromEntries(Array.from({length:125}, (_,i) => [i,{ts:Math.floor(Date.now()/1000)-i*3600,mid:String(i%3+1),name:['Alex','Morgan','Sam'][i%3],cat:i%2?'used':'deposited',qty:2,item:i%2?'Xanax':'Medical Kit'}]));
      const setup = `
        const GMK={API_KEY:'key'};
        let hasKey=true;
        const GM_getValue=(key,def)=>key==='key'?(hasKey?'fixture':''):key==='ocs_armory_ledger'?JSON.stringify(ledger):def;
        const GM_setValue=()=>{};
        const OCUI={esc,card:({title,right='',body})=>'<section><h3>'+title+'</h3><div>'+right+'</div>'+body+'</section>'};
        const _genBtnStyle='',_pillStyle='',_btnStyle='',_selStyle='';
        const _num=value=>String(value);
        const _nameLink=(name,id)=>'<a href="#member-'+esc(id)+'">'+esc(name)+'</a>';
        const _armDataCache=null;
        const wireLoanGoButtons=()=>{};
        const apiFetch=async()=>{throw Error('Unexpected API request')};
      `;
      new Function('ledger','esc',setup+region+'\nwindow.armoryTest={state:ARM.state,render:renderArmoury,noKey:()=>{hasKey=false;renderArmoury()}};renderArmoury();')(ledger,esc);
    }, region);
    assert.equal(await page.$$eval('.ocm-arm-log-table tbody tr', rows=>rows.length),50);
    await page.click('#ocm-arm-next');
    await page.click('#ocm-arm-next');
    assert.equal(await page.$$eval('.ocm-arm-log-table tbody tr', rows=>rows.length),25);
    await page.select('#ocm-arm-days','1');
    assert.equal(await page.$eval('.ocm-arm-pager',el=>el.textContent.includes('1 / 1')),true);
    await page.type('#ocm-arm-q','does not exist');
    assert.match(await page.$eval('#ocm-pane-armoury',el=>el.textContent),/No activity matches/);
    await page.evaluate(()=>{armoryTest.state.q='';armoryTest.state.days='all';armoryTest.render();});
    for(const [width,height] of [[1920,1080],[390,844],[430,932],[844,390]]) {
      await page.setViewport({width,height});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);
      if(width<=900) assert.ok(await page.$eval('#ocm-arm-q',el=>el.getBoundingClientRect().height)>=44);
      await page.screenshot({path:path.join(__dirname,`shots/armory-${width}.png`)});
    }
    await page.click('[data-v="members"]');
    assert.equal(await page.$$eval('button.ocm-arm-mcard',els=>els.length),3);
    await page.focus('.ocm-arm-mcard');
    await page.keyboard.press('Enter');
    assert.ok(await page.$('#ocm-arm-back'));
    await page.click('#ocm-arm-back');
    for(const view of ['ocs','loans','log']) {
      await page.click(`[data-v="${view}"]`);
      assert.equal(await page.$eval(`[data-v="${view}"]`,el=>el.getAttribute('aria-pressed')),'true');
    }
    await page.evaluate(()=>{armoryTest.noKey();document.getElementById('ocm-config-toggle').onclick=()=>window.configOpened=true;});
    await page.click('#ocm-arm-config');
    assert.equal(await page.evaluate(()=>window.configOpened),true);
    assert.deepEqual(errors,[]);
    console.log('Armory: pagination, filters, keyboard member detail, all views, Config, and four viewport checks passed.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
