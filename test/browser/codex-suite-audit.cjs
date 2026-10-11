// Full production userscript with synthetic API data; no login, keys or Torn requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const source = fs.readFileSync(path.resolve(__dirname, '../../Torn_OC_Suite_Codex.user.js'), 'utf8');

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => request.respond({ status: 200, contentType: 'text/html', body: '<body><div id="sidebarroot"></div><div class="content-wrapper"><div class="faction-crimes-wrap"></div></div></body>' }));
    await page.goto('http://127.0.0.1/factions.php?step=your#/tab=crimes');
    await page.evaluate(() => {
      const intervals = new Map(), realSet=setInterval.bind(window), realClear=clearInterval.bind(window);
      window.setInterval=(fn,ms,...args)=>{const id=realSet(fn,ms,...args); intervals.set(id,ms); return id;};
      window.clearInterval=id=>{intervals.delete(id); realClear(id);};
      window.auditIntervals=intervals;
      const store = { ocs_api_key: 'synthetic-key', ocs_active_tab: 'crimes', ocs_profit_since:0 };
      window.GM_getValue = (k, d) => Object.hasOwn(store, k) ? store[k] : d;
      window.GM_setValue = (k, v) => { store[k] = v; };
      window.GM_addStyle = css => { const style=document.createElement('style'); style.textContent=css; document.head.appendChild(style); };
      window.GM_info = {script:{name:'OC Suite audit',version:'synthetic'}};
      window.unsafeWindow = window;
      const members = [{ id: 123, name: 'Fixture Member', position: 'Member', status: {state:'Okay'}, last_action:{status:'Online',timestamp:1}, days_in_faction:300 }];
      const crimes = [{ id: 100, name: 'Blast From The Past', difficulty:3, status:'Planning', created_at:1, ready_at:Math.floor(Date.now()/1000)+7200, slots:[{position:'Medic',user:{id:123},success_chance:80,item_requirement:{id:101,is_available:false}}] }];
      for(let i=0;i<251;i++) crimes.push({id:1000+i,name:'Fixture OC '+i,difficulty:3,status:'Successful',executed_at:Math.floor(Date.now()/1000)-i*60,slots:[{user:{id:123,name:'Fixture Member'}}],rewards:{money:10000,respect:1,items:[],payout:{percentage:90,paid_by:123,paid_at:Math.floor(Date.now()/1000)}}});
      window.requests=[];
      window.GM_xmlHttpRequest = window.GM_xmlhttpRequest = opts => {
        const url=new URL(opts.url), selections=url.searchParams.get('selections')||'';
        requests.push(url.pathname+'?selections='+selections);
        let data={};
        if (url.hostname==='api.torn.com') {
          if (url.pathname.includes('/news')) data={news:[]};
          else if (url.pathname.includes('/user')) data={player_id:123,name:'Fixture Member'};
          else if (url.pathname.includes('/torn/')) data={items:{101:{name:'Ipecac Syrup',type:'Medical',market_value:100}}};
          else if (selections.includes('medical')) data={medical:[{ID:101,name:'Ipecac Syrup',available:3,loaned:0}]};
          else if (selections.includes('rankedwars')) data={ID:9,name:'Fixture Faction',rankedwars:{}};
          else if (selections==='members') data={members};
          else data={id:9,name:'Fixture Faction',crimes};
        }
        setTimeout(()=>opts.onload?.({status:200,responseText:JSON.stringify(data)}),5);
      };
      window.GM={xmlHttpRequest:GM_xmlHttpRequest,getValue:async(k,d)=>GM_getValue(k,d),setValue:async(k,v)=>GM_setValue(k,v)};
      window.auditStore=store;
    });
    const start=Date.now();
    await page.evaluate(source);
    await page.waitForSelector('#ocm-root');
    await page.waitForFunction(()=>document.querySelector('#ocm-key-status')?.textContent.includes('Key saved'));
    console.log('Synthetic normal startup and data render:',Date.now()-start,'ms');
    for (const tab of ['home','crimes','people','money','armoury','consumables','war']) {
      await page.click(`#ocm-tabs [data-tab="${tab}"]`);
      assert.ok(await page.$eval(`#ocm-pane-${tab}`,el=>el.classList.contains('active')),`${tab} activates`);
    }
    assert.equal(await page.$$eval('.ocm-fin-ocrow',els=>els.length),50,'Large OC archives render one page');
    assert.equal(await page.$$eval('.ocm-pay-row',els=>els.length),50,'Native payouts render one page');
    await page.click('#ocm-tabs [data-tab="money"]');
    await page.click('#ocm-pane-money .ocm-subtab[data-sub="ocsran"]');
    await page.click('[data-fin-page="ocs"][data-step="1"]');
    assert.equal(await page.$eval('.ocm-fin-ocrow',el=>el.dataset.oc),'1050','Next page remains reachable');
    assert.match(await page.$eval('#ocm-money-ocs',el=>el.textContent),/251/,'Total covers every record');
    await page.click('#ocm-pane-money .ocm-subtab[data-sub="payouts"]');
    await page.click('[data-fin-page="paid"][data-step="1"]');
    assert.equal(await page.$eval('.ocm-pay-row',el=>el.dataset.oc),'1050','Older payouts remain reachable');
    await page.waitForFunction(()=>document.querySelector('#ocm-war-select')?.textContent.includes('No ranked wars'));
    await page.click('#ocm-tabs [data-tab="armoury"]');
    await page.click('#ocm-pane-armoury [data-v="loans"]');
    assert.match(await page.$eval('#ocm-pane-armoury',el=>el.textContent),/Fixture Member/);
    assert.equal(await page.$$eval('#ocm-pane-armoury .ocm-loan-go',els=>els.length),1);
    for (const [width,height] of [[1920,1080],[390,844],[430,932],[844,390]]) {
      await page.setViewport({width,height});
      assert.equal(await page.$eval('#ocm-root',el=>el.scrollWidth>el.clientWidth+1),false,`Suite overflow at ${width}`);
    }
    // Simulate Torn removing and recreating the shell while preserving this runtime.
    const baselineIntervals=await page.evaluate(()=>auditIntervals.size);
    for(let cycle=0;cycle<4;cycle++) {
      await page.evaluate(()=>{document.getElementById('ocm-root').remove(); location.hash='#/tab=armoury';});
      await page.evaluate(()=>{location.hash='#/tab=crimes';});
      await page.waitForSelector('#ocm-root');
      await page.waitForSelector('#ocm-tabs [data-tab="armoury"]', { visible: true });
    }
    const intervals=await page.evaluate(()=>[...auditIntervals.values()]);
    assert.ok(intervals.length<=baselineIntervals+1, `Navigation leaked timers: baseline=${baselineIntervals}, now=${JSON.stringify(intervals)}`);
    for (const tab of ['armoury','consumables','war']) {
      await page.click(`#ocm-tabs [data-tab="${tab}"]`);
      assert.ok(await page.$eval(`#ocm-pane-${tab}`,el=>el.textContent.length>250),`${tab} renders after replacement`);
    }
    assert.equal(await page.$$eval('#ocm-root',els=>els.length),1,'Singleton root after SPA navigation');
    assert.deepEqual(errors,[],'No production script errors');
    console.log('Full suite: seven tabs, OC loan data, four viewport sizes, SPA replacement and no browser errors passed.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
