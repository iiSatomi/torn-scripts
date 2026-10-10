const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const SCRIPT = path.resolve(process.argv[2] || 'Torn_OC_Suite_PurrfectCrime.user.js');
const STORE = path.join(__dirname, 'store.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  // defaultViewport:null is REQUIRED — without it puppeteer forces its default 800x600
  // device-metrics override onto the page and never clears it on disconnect, leaving the
  // debug Brave stuck rendering in the top-left quarter. See test/browser/fix-viewport.cjs.
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('factions.php') && p.url().includes('#/tab=crimes')) || pages[0];
  await page.setBypassCSP(true);
  try { await page.exposeFunction('gmPersist', raw => fs.writeFileSync(STORE, raw)); } catch (_) {}
  try { await page.exposeFunction('gmXhr', async o => { const r = await fetch(o.url, { method: o.method || 'GET', headers: o.headers || {}, body: o.data || undefined }); return { status: r.status, responseText: await r.text(), ok: true }; }); } catch (_) {}
  const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(3000);
  await page.evaluate(S => {
    const save=()=>window.gmPersist(JSON.stringify(S)); window.GM_getValue=(k,d)=>Object.hasOwn(S,k)?S[k]:d; window.GM_setValue=(k,v)=>{S[k]=v;save()}; window.GM_addStyle=css=>{const e=document.createElement('style');e.textContent=css;document.head.append(e)}; const xhr=o=>window.gmXhr(o).then(r=>o.onload?.(r)).catch(e=>o.onerror?.(e)); window.GM_xmlHttpRequest=xhr; window.GM_xmlhttpRequest=xhr; window.GM={getValue:async(k,d)=>GM_getValue(k,d),setValue:async(k,v)=>GM_setValue(k,v),xmlHttpRequest:xhr}; window.unsafeWindow=window;
  }, store);
  await page.evaluate(fs.readFileSync(SCRIPT, 'utf8'));
  await page.waitForSelector('#ocm-root'); await sleep(3000);
  await page.evaluate(() => document.querySelector('#ocm-tabs .ocm-nav[data-tab="war"]')?.click()); await sleep(300);
  let r = await page.evaluate(() => ({ command: !!document.querySelector('#ocm-war-tabcontent .ocm-war-jump'), planner: !!document.querySelector('#ocm-pane-war [data-tab="planner"]'), compact: !!document.querySelector('#ocm-war-more'), text: document.querySelector('#ocm-war-tabcontent')?.innerText || '' }));
  console.log('command state:', r); console.log('tabs:', await page.evaluate(() => [...document.querySelectorAll('.ocm-war-tabbtn')].map(x => [x.dataset.tab, x.textContent])));
  if (!r.command || !r.compact) throw new Error('War Command landing or compact toolbar missing');
  await page.evaluate(() => document.querySelector('.ocm-war-tabbtn[data-tab="planner"]')?.click()); await sleep(200);
  r = await page.evaluate(() => ({ ours: !!document.querySelector('#ocm-plan-our-target'), theirs: !!document.querySelector('#ocm-plan-enemy-target'), text: document.querySelector('#ocm-war-tabcontent')?.innerText || '' }));
  console.log('planner state:', r); if (!r.ours || !r.theirs) throw new Error('Planner bilateral controls missing');
  console.log('War Command + bilateral Planner: PASS'); console.log(r.text.slice(0, 500).replace(/\n/g, ' | '));
  await page.evaluate(() => document.querySelector('.ocm-war-tabbtn[data-tab="contracts"]')?.click()); await sleep(200);
  r = await page.evaluate(() => ({ load: !!document.querySelector('#ocm-contract-load'), text: document.querySelector('#ocm-war-tabcontent')?.innerText || '' }));
  if (!r.load && !/FFScouter API key/i.test(r.text)) throw new Error('Contracts setup state missing');
  if (r.load) {
    await page.evaluate(() => document.querySelector('#ocm-contract-load')?.click()); await sleep(12000);
    r = await page.evaluate(() => ({ pairs: document.querySelectorAll('.ocm-contract-pair').length, cards: document.querySelectorAll('.ocm-contract-pfp').length, text: document.querySelector('#ocm-war-tabcontent')?.innerText || '' }));
    if (r.pairs < 1) throw new Error('Contracts recommendations did not render');
    const paired = await page.evaluate(() => { const b = document.querySelector('.ocm-contract-pair'); const enemy = b?.dataset.enemy; b?.click(); return enemy; }); await sleep(250);
    const lock = await page.evaluate(enemy => ({ confirmed: document.querySelectorAll('.ocm-contract-unpair').length, stillOffered: [...document.querySelectorAll('.ocm-contract-pair')].some(b => b.dataset.enemy === enemy) }), paired);
    if (lock.confirmed !== 1 || lock.stillOffered) throw new Error('Pair reservation failed');
    await page.evaluate(() => document.querySelector('.ocm-contract-unpair')?.click()); await sleep(150);
    const restored = await page.evaluate(enemy => [...document.querySelectorAll('.ocm-contract-pair')].some(b => b.dataset.enemy === enemy), paired);
    if (!restored) throw new Error('Unpair did not restore recommendation');
    console.log('Contracts:', r.pairs + ' recommendations, ' + r.cards + ' profile images; pair/unpair PASS');
  }
  console.log(r.text.slice(0, 500).replace(/\n/g, ' | '));
  console.log('errors:', errs.length, errs);
  if (errs.length) process.exitCode = 1; await browser.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
