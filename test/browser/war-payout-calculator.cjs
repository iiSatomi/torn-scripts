const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium}=require(process.env.TORN_PLAYWRIGHT||'C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = path.resolve(__dirname, '../..');
const file = path.join(base, 'Torn_War_Payout_Calculator.user.js');
assert.ok(fs.existsSync(file), 'standalone calculator must be built');
const source = fs.readFileSync(file, 'utf8');
const hub = fs.readFileSync(path.join(base, 'script-hub/dist/Torn_Script_Hub.user.js'), 'utf8');
const now = Math.floor(Date.now() / 1000);
const player = (id, faction, name = 'Player ' + id) => ({ id, name, faction: { id: faction } });
const attack = (id, attacker, defender, result, extra = {}) => ({ id, started: now - 3000, ended: now - 2990, attacker, defender, result, is_ranked_war: true, ...extra });
const fixtures = {
  basic: { basic: { id: 10, name: 'Test faction' } },
  wars: { rankedwars: [99,100].map(id=>({ id, start: now - 3600, end: now - 1800, factions: [{ id: 10, name: 'Test faction' }, { id: 20, name: 'Test opponent' }] })) },
  attacks: { attacks: [
    attack(1, player(1, 10, 'Alpha'), player(20, 20), 'Hospitalized'),
    attack(2, player(2, 10, 'Beta'), player(20, 20), 'Attacked'),
    attack(3, player(20, 20), player(1, 10, 'Alpha'), 'Mugged'),
    attack(4, player(1, 10), player(30, 30), 'Hospitalized', { is_ranked_war: false }),
    attack(5, player(30, 30), player(1, 10), 'Attacked', { is_ranked_war: false }),
    attack(6, player(2, 10, 'Beta'), player(20, 20), 'Lost'),
    attack(7, null, player(2, 10, 'Beta'), 'Hospitalized'),
    attack(8, null, player(2, 10, 'Beta'), 'Hospitalized', { is_ranked_war: false }),
  ], _metadata: { links: { next: null, prev: null } } },
  report: { rankedwarreport: { factions: [{ id: 10, rewards: { items: [{ id: 100, name: 'Test cache', quantity: 2 }] } }] } },
};
const fixture = '<!doctype html><html><head></head><body style="margin:0;background:#191919;color:white;font-family:Arial"><aside id="sidebar" style="width:172px;margin:25px"><div class="status-icons"><div><a href="/messages.php">Mail</a></div><div><a href="/page.php?sid=events">Events</a></div><div><a href="/page.php?sid=awards">Awards</a></div></div></aside></body></html>';
const shim = `
const store = new Map();
window.GM_info = {scriptHandler:'Tampermonkey'};
window.GM_getValue = (key, fallback) => store.has(key) ? store.get(key) : fallback;
window.GM_setValue = (key, value) => store.set(key, value);
window.GM_deleteValue = key => store.delete(key);
window.GM_registerMenuCommand = () => {};
window.GM_setClipboard = text => { document.body.dataset.copied = text; };
window.GM_xmlhttpRequest = options => {
  const pathname = new URL(options.url).pathname;
  const data = ${JSON.stringify(fixtures)};
  const type = pathname.endsWith('/basic') ? 'basic' : pathname.endsWith('/rankedwars') ? 'wars' : pathname.endsWith('/attacks') ? 'attacks' : 'report';
  if(type==='attacks'){
    const boundary=${now - 2990};
    if(Number(new URL(options.url).searchParams.get('to'))>boundary){
      data.attacks={attacks:data.attacks.attacks.slice(3,5),_metadata:{links:{next:null,prev:'https://api.torn.com/v2/faction/attacks?from=${now - 3601}&to='+boundary+'&sort=desc&limit=100'}}};
    }else data.attacks._metadata.links.next='https://api.torn.com/v2/faction/attacks?from=${now - 3601}&to=${now - 1800}&sort=desc&limit=100';
  }
  if(pathname.includes('/100/'))data.report.rankedwarreport.factions[0].rewards.items=[];
  document.body.dataset.requests = String(Number(document.body.dataset.requests || 0) + 1);
  if(new URL(options.url).searchParams.has('key')) throw new Error('API keys must be sent in a private header');
  const failed=document.body.dataset.failNext==='true';delete document.body.dataset.failNext;
  const delay=document.body.dataset.slow==='true'?1000:15;
  const timer = setTimeout(() => options.onload({ status:200, responseText:failed?'not-json':JSON.stringify(data[type]) }), delay);
  return {abort:()=>clearTimeout(timer)};
};
`;
const nativeShim = `
window.PDA_storage = {
  get: async (key, fallback) => store.has(key) ? store.get(key) : fallback,
  set: async (key, value) => {
    if(key.endsWith(':personal-key')) {
      document.body.dataset.writeStarted='true';
      await new Promise(resolve=>setTimeout(resolve,1000));
      store.set(key,value);document.body.dataset.personalPresent='true';document.body.dataset.writeFinished='true';
    } else store.set(key,value);
  },
  delete: async key => {store.delete(key);if(key.endsWith(':personal-key'))document.body.dataset.personalPresent='false';},
};
`;
async function install(page, code, world, native = false) {
  const cdp = await page.context().newCDPSession(page);
  const { frameTree } = await cdp.send('Page.getFrameTree');
  const { executionContextId } = await cdp.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: world });
  const result = await cdp.send('Runtime.evaluate', { contextId: executionContextId, expression: '(function(){' + shim + (native?nativeShim:'') + '\n' + code + '})();', awaitPromise: true });
  assert.equal(result.exceptionDetails, undefined, 'userscript must evaluate in isolated world');
  await cdp.detach();
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.TORN_BROWSER || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true, args: ['--no-first-run', '--no-default-browser-check'] });
  try {
    for (const calculatorFirst of [true, false]) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*',request=>request.fulfill({status:200,contentType:'text/html',body:fixture}));
      await page.setViewportSize({ width:1920, height:1080 });
      await page.goto('https://www.torn.com/index.php');
      for (const [code, world] of calculatorFirst ? [[source, 'calculator'], [hub, 'hub']] : [[hub, 'hub'], [source, 'calculator']]) await install(page, code, world);
      await page.waitForSelector('#tsh-launcher');
      assert.equal(await page.$eval('body', el => el.dataset.requests || '0'), '0', 'opening page makes no Torn requests');
      if(await page.isHidden('#tsh-dialog'))await page.click('#tsh-launcher');
      await page.click('[data-script="war-payout-calculator"] .tsh-primary');
      await page.waitForSelector('#twpc-dialog[data-tsui-kit="1"]:not([hidden])');
      assert.equal(await page.$eval('#twpc-dialog',e=>e.getBoundingClientRect().width),760,'desktop panel uses shared window geometry');
      assert.equal(await page.$eval('#twpc-dialog',e=>e.matches(':modal')),false,'floating tool must leave Torn usable');
      assert.equal(await page.isVisible('#twpc-settings-panel'),false,'extra settings are tucked away initially');
      const beforeDrag=await page.$eval('#twpc-dialog',e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y};});
      const grip=await page.$eval('#twpc-dialog .tsui-title',e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
      await page.mouse.move(grip.x,grip.y);await page.mouse.down();await page.mouse.move(grip.x+70,grip.y+20,{steps:4});await page.mouse.up();
      assert.equal(await page.$eval('#twpc-dialog',(e,start)=>Math.abs(e.getBoundingClientRect().x-start.x-70)<2,beforeDrag),true,'shared title moves the tool');
      await page.focus('#twpc-dialog .tsui-title');await page.keyboard.press('ArrowLeft');
      assert.equal(await page.$eval('#twpc-dialog',(e,start)=>Math.abs(e.getBoundingClientRect().x-start.x-60)<2,beforeDrag),true,'keyboard arrows also move the panel');
      await page.click('#twpc-settings-toggle');
      await page.type('#twpc-key', 'TESTTESTTESTTEST');
      await page.click('#twpc-use-key');
      assert.equal(await page.$eval('#twpc-key', el => el.value), '');
      await page.click('#twpc-tab-calculator');
      await page.click('#twpc-list-wars');
      await page.waitForFunction(() => document.querySelector('#twpc-war option[value="99"]'));
      await page.selectOption('#twpc-war', '99');
      await page.waitForFunction(() => document.getElementById('twpc-coverage').textContent.includes('2 war hits'));
      assert.equal(await page.$eval('#twpc-coverage',e=>e.textContent.includes('8 attacks checked across 2 pages')),true,'real prev-link shape loads every page and exposes distinct records checked');
      assert.equal(await page.$eval('#twpc-status',e=>!!e.closest('section')?.querySelector('#twpc-war')),true,'war progress belongs beside the selector');
      const set = async (id, value) => { await page.$eval('#' + id, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', {bubbles:true})); }, value); };
      await set('twpc-profit', '100000000');
      await page.selectOption('#twpc-cut-mode', 'percent');
      await set('twpc-cut', '20');
      await set('twpc-rate-hits', '1000000');
      await set('twpc-rate-losses', '500000');
      assert.equal(await page.$eval('#twpc-total', el => el.textContent), '$3,000,000');
      assert.equal(await page.$$eval('#twpc-players tbody tr', els => els.length), 2);
      await page.click('#twpc-collapse');
      assert.equal(await page.$eval('#twpc-dialog .tsui-body',e=>e.hidden),true,'collapse hides the body');
      assert.equal(await page.$eval('#twpc-dialog',e=>e.getBoundingClientRect().height<80),true,'collapsed tool stays small');
      await page.click('#twpc-collapse');
      assert.equal(await page.$eval('#twpc-total',e=>e.textContent),'$3,000,000','expand preserves draft amounts');
      await page.selectOption('#twpc-mode', 'estimate');
      await set('twpc-cache-total', '100000000');
      await page.selectOption('#twpc-count-source', 'expected');
      await set('twpc-expected-hits', '400');
      await set('twpc-expected-losses', '10');
      assert.equal(await page.$eval('#twpc-est-rate', el => el.textContent), '$187,500');
      await page.selectOption('#twpc-cache-source', 'items');
      assert.equal(await page.$eval('[data-cache-qty]',el=>el.value),'2','reward cache quantities load from selected war');
      await page.$eval('[data-cache-price]',el=>{el.value='50000000';el.dispatchEvent(new Event('input',{bubbles:true}));});
      assert.equal(await page.$eval('#twpc-est-rate',el=>el.textContent),'$187,500');
      assert.equal(await page.$eval('#twpc-copy',el=>el.disabled),true,'expected-only planning must not export verified player payouts');
      await page.selectOption('#twpc-cache-source','total');
      await page.click('#twpc-apply-rate');
      assert.equal(await page.$eval('#twpc-rate-hits', el => el.value), '187500');
      await page.selectOption('#twpc-mode', 'actual');
      await page.click('#twpc-copy');
      await page.waitForFunction(() => document.body.dataset.copied);
      const copied = await page.$eval('body', el => el.dataset.copied);
      assert.ok(copied.includes('Alpha') && copied.includes('Beta'));
      assert.ok(!copied.includes('TESTTESTTESTTEST'));
      assert.ok(copied.includes('completeness unverified')&&copied.includes('coverageStatus,unverified'),'exports identify incomplete retention evidence as a draft');
      await set('twpc-profit', '-1');
      assert.equal(await page.$eval('#twpc-copy', el => el.disabled), true);
      await set('twpc-profit', '100000000');
      await set('twpc-rate-hits','100000000');
      assert.equal(await page.$eval('#twpc-balance-label',el=>el.textContent),'Funding shortfall');
      assert.equal(await page.$eval('#twpc-rate-hits',el=>el.value),'100000000','budget shortfall must not silently change rate');
      await set('twpc-rate-hits','187500');
      for (const [width, height] of [[1920,1080],[390,844],[430,932],[844,390]]) {
        await page.setViewportSize({width,height});
        await page.waitForFunction(()=>{const r=document.getElementById('twpc-dialog').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;},null,{timeout:3000});
        await page.$eval('#twpc-dialog .tsui-content',el=>{el.scrollTop=0;});
        const rect = await page.$eval('#twpc-dialog', el => { const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth}; });
        assert.ok(rect.left>=0&&rect.right<=rect.width&&rect.top>=0&&rect.bottom<=rect.height, JSON.stringify(rect));
        assert.equal(rect.overflow,false);
        if (calculatorFirst) await page.screenshot({path:path.join(__dirname,'war-payout-'+width+'.png')});
      }
      await page.focus('#sidebar a[href*=messages]');await page.keyboard.press('Escape');
      assert.equal(await page.$eval('#twpc-dialog',e=>e.dataset.tsuiCollapsed),'true','Escape collapses the top shared window even from outside focus');
      await page.focus('#twpc-close');await page.keyboard.press('Escape');
      assert.equal(await page.$eval('#twpc-dialog',e=>e.dataset.tsuiCollapsed),'false','second Escape expands the shared window');
      await page.click('#twpc-close');
      assert.equal(await page.$eval('#twpc-dialog',el=>el.hidden),true,'Close hides the shared window');
      if(await page.isHidden('#tsh-dialog'))await page.click('#tsh-launcher');
      await page.click('[data-script="war-payout-calculator"] .tsh-primary');
      assert.equal(await page.$$eval('#twpc-dialog', els => els.length),1);
      await page.selectOption('#twpc-war','100');
      await page.waitForFunction(()=>document.getElementById('twpc-dialog').getAttribute('aria-busy')==='false'&&document.getElementById('twpc-coverage').textContent.includes('War #100:'));
      assert.equal(await page.$eval('[data-cache-qty]',el=>el.value),'0','a war without cache rewards must not inherit previous-war quantities');
      await page.$eval('body',el=>{el.dataset.failNext='true';});
      await page.click('#twpc-load');
      await page.waitForFunction(()=>document.getElementById('twpc-status').textContent.includes('unreadable response'));
      assert.equal(await page.$eval('#twpc-copy',el=>el.disabled),true,'failed loading clears exportable old counts');
      await page.$eval('body',el=>{el.dataset.slow='true';});
      await page.click('#twpc-load');
      await page.click('#twpc-cancel-load');
      const requestsAfterCancel=await page.$eval('body',el=>el.dataset.requests);
      await page.waitForFunction(()=>document.getElementById('twpc-cancel-load').hidden);
      await page.$eval('body',el=>{delete el.dataset.slow;});
      await page.$eval('body',el=>{el.dataset.slow='true';});await page.click('#twpc-load');await page.click('#twpc-collapse');
      const requestsAfterCollapse=await page.$eval('body',el=>el.dataset.requests);
      await page.click('#twpc-collapse');
      assert.equal(await page.$eval('body',el=>el.dataset.requests),requestsAfterCollapse,'expansion never automatically restarts a paused load');
      await page.$eval('body',el=>{delete el.dataset.slow;});
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('tornpda:tabState',{detail:{isActiveTab:false,isWebViewVisible:false}})));
      await page.click('#twpc-list-wars');
      assert.equal(await page.$eval('body',el=>el.dataset.requests),requestsAfterCollapse,'inactive PDA tab makes no API calls');
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('tornpda:tabState',{detail:{isActiveTab:true,isWebViewVisible:true}})));
      assert.equal(await page.$eval('body',el=>el.dataset.requests),requestsAfterCollapse,'resuming does not automatically fetch');
      await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
      assert.equal(await page.locator('#twpc-dialog').count(),0,'pagehide destroys the shared window');
      await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
      if(await page.isHidden('#tsh-dialog'))await page.click('#tsh-launcher');
      await page.click('[data-script="war-payout-calculator"] .tsh-primary');
      assert.equal(await page.$$eval('#twpc-dialog',els=>els.length),1);
      assert.deepEqual(errors,[]);
      await page.close();
    }
    const nativePage=await browser.newPage();
    await nativePage.route('**/*',request=>request.fulfill({status:200,contentType:'text/html',body:fixture}));
    await nativePage.goto('https://www.torn.com/index.php');
    await install(nativePage,hub,'native-hub');await install(nativePage,source,'native-calculator',true);
    await nativePage.waitForSelector('#tsh-launcher');await nativePage.click('#tsh-launcher');await nativePage.click('[data-script="war-payout-calculator"] .tsh-primary');
    await nativePage.click('#twpc-settings-toggle');
    await nativePage.type('#twpc-key','TESTTESTTESTTEST');await nativePage.click('#twpc-remember-key');await nativePage.click('#twpc-use-key');
    await nativePage.waitForFunction(()=>document.body.dataset.writeStarted==='true');
    await nativePage.click('#twpc-forget-key');
    await nativePage.waitForFunction(()=>document.body.dataset.writeFinished==='true');
    await nativePage.waitForFunction(()=>document.getElementById('twpc-status').textContent.includes('removed'));
    assert.equal(await nativePage.$eval('body',el=>el.dataset.personalPresent),'false','pending native save must not resurrect a forgotten key');
    await nativePage.$eval('body',el=>{delete el.dataset.writeStarted;delete el.dataset.writeFinished;});
    await nativePage.type('#twpc-key','TESTTESTTESTTEST');await nativePage.click('#twpc-use-key');
    await nativePage.waitForFunction(()=>document.body.dataset.writeStarted==='true');
    await nativePage.click('#twpc-forget-key');
    await install(nativePage,source,'native-takeover',true);
    await nativePage.waitForFunction(()=>document.body.dataset.writeFinished==='true');
    // A replaced adapter disposes its UI while the explicit deletion is queued.
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(await nativePage.$eval('body',el=>el.dataset.personalPresent),'false','adapter disposal must not skip a previously requested key deletion');
    await nativePage.close();
    console.log('PASS standalone calculator / Hub launch / enemy counts / actual and cache payouts / isolated worlds / four viewports / native key write ordering');
  } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode=1; });
