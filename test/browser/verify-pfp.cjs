// Regression check for ui38: img.onerror -> ARM.dropPfp must NOT throw, must swap in
// the fallback SVG, and must evict the stale K_PFP cache entry. Forces a real 404 on a
// loaded PFP image so the onerror path actually runs (the cold-cache pass never hit it).
// Run against the live debug Brave (CDP 9222) with a logged-in Torn crimes page open.
const fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const SCRIPT = 'C:/Users/asato/Desktop/Game Stuff/Torn Scripts/Torn_OC_Suite_PurrfectCrime.user.js';
const STORE = path.join(__dirname, 'store.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const loadStore = () => { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return {}; } };

(async () => {
  const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await b.pages();
  const page = pages.find(x => x.url().includes('factions.php') && x.url().includes('#/tab=crimes'))
    || pages.find(x => x.url().includes('factions.php')) || pages[0];
  await page.setBypassCSP(true);
  const expose = async (n, f) => { try { await page.exposeFunction(n, f); } catch (e) {} };
  await expose('gmPersist', j => { try { fs.writeFileSync(STORE, j); } catch (e) {} });
  await expose('gmXhr', async o => {
    try {
      const c = new AbortController(); const t = o.timeout ? setTimeout(() => c.abort(), o.timeout) : null;
      const r = await fetch(o.url, { method: o.method || 'GET', headers: o.headers || {}, body: o.data ?? undefined, signal: c.signal });
      if (t) clearTimeout(t);
      return { status: r.status, statusText: r.statusText, responseText: await r.text(), finalUrl: r.url, ok: true };
    } catch (e) { return { status: 0, statusText: String(e), responseText: '', ok: false }; }
  });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const shim = (S0) => {
    const S = S0 || {}; const persist = () => { try { window.gmPersist(JSON.stringify(S)); } catch (e) {} };
    window.GM_getValue = (k, d) => Object.prototype.hasOwnProperty.call(S, k) ? S[k] : d;
    window.GM_setValue = (k, v) => { S[k] = v; persist(); };
    window.GM_deleteValue = k => { delete S[k]; persist(); };
    window.GM_listValues = () => Object.keys(S);
    window.GM_addStyle = css => { const e = document.createElement('style'); e.textContent = css; document.head.appendChild(e); return e; };
    window.GM_info = { script: { name: 'OCS', version: 'live' } };
    const xhr = o => { Promise.resolve(window.gmXhr({ method: o.method, url: o.url, headers: o.headers, data: o.data, timeout: o.timeout }))
      .then(r => { (r.ok || r.status) ? o.onload && o.onload(r) : o.onerror && o.onerror(r); }).catch(e => o.onerror && o.onerror({ status: 0, responseText: '' })); };
    window.GM_xmlHttpRequest = xhr; window.GM_xmlhttpRequest = xhr; window.GM = window.GM || {};
    window.GM.xmlHttpRequest = xhr; window.GM.getValue = async (k, d) => window.GM_getValue(k, d);
    window.GM.setValue = async (k, v) => window.GM_setValue(k, v); window.unsafeWindow = window;
  };
  await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(3500);
  await page.evaluate(shim, loadStore());
  await page.evaluate(fs.readFileSync(SCRIPT, 'utf8'));
  await page.waitForSelector('#ocm-root', { timeout: 15000 });
  await sleep(5000);
  await page.evaluate(() => { const c = document.getElementById('ocm-config-close'); if (c) c.click(); });
  await page.evaluate(() => document.querySelector('#ocm-tabs .ocm-nav[data-tab="armoury"]')?.click());
  await sleep(6000); // news autoload
  await page.evaluate(() => { const btn = [...document.querySelectorAll('#ocm-pane-armoury .ocm-arm-view')].find(b => b.dataset.v === 'members'); if (btn) btn.click(); });
  await sleep(9000); // pfp hydrate

  // Confirm dropPfp exists as an exported member (would be undefined under the old bug).
  // We can't reach the closure directly, so we drive it through the real DOM handler.
  const before = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('#ocm-pane-armoury img.ocm-arm-pfp')];
    const loaded = imgs.find(x => x.naturalWidth > 0 && !String(x.src).startsWith('data:'));
    if (!loaded) return { ok: false, reason: 'no real (non-fallback) pfp loaded to test against' };
    const mid = loaded.getAttribute('data-mid');
    const cache = JSON.parse(window.GM_getValue('ocs_pfp_cache', '{}') || '{}');
    loaded.setAttribute('data-test-mid', '1');
    return { ok: true, mid, cachedUrl: cache[mid] && cache[mid].url, hadOnerror: typeof loaded.onerror === 'function', srcHead: String(loaded.src).slice(0, 48) };
  });
  console.log('picked:', JSON.stringify(before));
  if (!before.ok) { console.log('SKIP:', before.reason); await b.disconnect(); process.exit(2); }

  const errCountBefore = errs.length;
  // Force a 404 -> fires the onerror handler that calls ARM.dropPfp(mid, url).
  await page.evaluate(() => {
    const img = document.querySelector('#ocm-pane-armoury img.ocm-arm-pfp[data-test-mid="1"]');
    img.src = 'https://www.torn.com/images/__ocs_force_404__.png?' + Date.now();
  });
  await sleep(2500);

  const after = await page.evaluate((mid) => {
    const img = document.querySelector('#ocm-pane-armoury img.ocm-arm-pfp[data-test-mid="1"]');
    const cache = JSON.parse(window.GM_getValue('ocs_pfp_cache', '{}') || '{}');
    return { srcHead: img ? String(img.src).slice(0, 32) : null, cacheStillHasMid: Object.prototype.hasOwnProperty.call(cache, mid) };
  }, before.mid);

  const dropPfpErrors = errs.slice(errCountBefore).filter(e => /dropPfp is not a function|dropPfp/.test(e));
  const fellBackToSvg = String(after.srcHead).startsWith('data:image/svg');
  console.log('after :', JSON.stringify(after));
  console.log('new console errors during trigger:', errs.length - errCountBefore, errs.slice(errCountBefore).slice(0, 5));
  console.log('---');
  console.log('PASS fallback SVG applied :', fellBackToSvg);
  console.log('PASS cache entry evicted  :', !after.cacheStillHasMid);
  console.log('PASS no dropPfp TypeError  :', dropPfpErrors.length === 0);
  const pass = fellBackToSvg && !after.cacheStillHasMid && dropPfpErrors.length === 0;
  console.log(pass ? 'RESULT: PASS' : 'RESULT: FAIL');
  await b.disconnect();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('ERR', e); process.exit(1); });
