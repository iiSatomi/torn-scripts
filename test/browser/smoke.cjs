// Live smoke test: attaches to the debug Brave (CDP 9222), injects the OC Suite
// userscript with a faithful GM_* shim, mounts it on the real logged-in faction
// crimes page, clicks every top-level tab, and reports mount success, per-tab
// render, console errors, and uncaught exceptions. Screenshots land in ./shots.
//
// Usage: node smoke.cjs [path-to-userscript]
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const SCRIPT = process.argv[2] ||
  'C:\\Users\\asato\\Desktop\\Game Stuff\\Torn Scripts\\Torn_OC_Suite_PurrfectCrime.user.js';
const STORE = path.join(__dirname, 'store.json');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const TABS = ['home', 'crimes', 'people', 'consumables', 'war', 'armoury'];

const loadStore = () => { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return {}; } };

(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await browser.pages();
  let page = pages.find(p => p.url().includes('torn.com')) || pages[0];
  if (!page) page = await browser.newPage();
  const url = page.url();
  console.log('Attached to page:', url);
  if (!url.includes('factions.php')) {
    console.log('\n⚠  The active tab is not on factions.php. Log into Torn in the debug window,');
    console.log('   open your faction > Organized Crimes tab, then re-run this.\n');
  }

  // Torn ships a strict CSP (script-src 'nonce-…') that blocks DOM-injected
  // <script> tags — the thing Tampermonkey's privileged injection sidesteps.
  // Bypass CSP for this page and run the userscript via Runtime.evaluate
  // (page.evaluate), which CSP does not govern.
  await page.setBypassCSP(true);

  // ── Node-side bindings the in-page shim calls (survive reloads; ignore re-add)
  const expose = async (name, fn) => { try { await page.exposeFunction(name, fn); } catch (e) { /* already bound from a prior run */ } };
  await expose('gmPersist', (json) => { try { fs.writeFileSync(STORE, json); } catch (e) {} });
  await expose('gmXhr', async (opts) => {
    try {
      const ctrl = new AbortController();
      const t = opts.timeout ? setTimeout(() => ctrl.abort(), opts.timeout) : null;
      const res = await fetch(opts.url, {
        method: opts.method || 'GET',
        headers: opts.headers || {},
        body: opts.data ?? undefined,
        signal: ctrl.signal,
      });
      if (t) clearTimeout(t);
      const text = await res.text();
      return { status: res.status, statusText: res.statusText, responseText: text, finalUrl: res.url, ok: true };
    } catch (e) {
      return { status: 0, statusText: String(e), responseText: '', finalUrl: opts.url, ok: false };
    }
  });

  // ── Error capture ──────────────────────────────────────────────────────────
  const errors = [];
  page.on('pageerror', e => errors.push({ kind: 'pageerror', text: String(e), at: Date.now() }));
  page.on('console', m => { if (m.type() === 'error') errors.push({ kind: 'console', text: m.text(), at: Date.now() }); });

  // ── The GM shim (runs in page context) ─────────────────────────────────────
  const shim = (initialStore) => {
    const S = initialStore || {};
    const persist = () => { try { window.gmPersist(JSON.stringify(S)); } catch (e) {} };
    window.GM_getValue = (k, d) => (Object.prototype.hasOwnProperty.call(S, k) ? S[k] : d);
    window.GM_setValue = (k, v) => { S[k] = v; persist(); };
    window.GM_deleteValue = (k) => { delete S[k]; persist(); };
    window.GM_listValues = () => Object.keys(S);
    window.GM_addStyle = (css) => { const el = document.createElement('style'); el.textContent = css; document.head.appendChild(el); return el; };
    window.GM_info = { script: { name: 'OC Suite (smoke)', version: '0.0.0-smoke' }, scriptHandler: 'smoke' };
    const xhr = (opts) => {
      Promise.resolve(window.gmXhr({
        method: opts.method, url: opts.url, headers: opts.headers, data: opts.data, timeout: opts.timeout,
      })).then(r => {
        if (r.ok || r.status) { opts.onload && opts.onload(r); }
        else { opts.onerror && opts.onerror(r); }
      }).catch(e => opts.onerror && opts.onerror({ status: 0, statusText: String(e), responseText: '' }));
    };
    window.GM_xmlHttpRequest = xhr;
    window.GM_xmlhttpRequest = xhr;
    window.GM = window.GM || {};
    window.GM.xmlHttpRequest = xhr;
    window.GM.getValue = async (k, d) => window.GM_getValue(k, d);
    window.GM.setValue = async (k, v) => window.GM_setValue(k, v);
    window.unsafeWindow = window;
    window.__SMOKE_SHIM__ = true;
  };

  // setBypassCSP only takes effect on the next load, so reload once, then inject.
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await new Promise(r => setTimeout(r, 3500)); // let Torn's SPA re-render the crimes pane

  await page.evaluate(shim, loadStore());
  console.log('GM shim installed (CSP bypassed).');

  // ── Inject the userscript via Runtime.evaluate (not a <script> tag) ─────────
  const src = fs.readFileSync(SCRIPT, 'utf8');
  try {
    await page.evaluate(src);
    console.log('Injected:', path.basename(SCRIPT));
  } catch (e) {
    console.log('Injection threw:', String(e).slice(0, 300));
    errors.push({ kind: 'inject', text: String(e), at: Date.now() });
  }

  // ── Wait for mount ─────────────────────────────────────────────────────────
  let mounted = false;
  try {
    await page.waitForSelector('#ocm-root', { timeout: 15000 });
    mounted = true;
  } catch { mounted = false; }
  console.log(mounted ? '✅ #ocm-root mounted' : '❌ #ocm-root did NOT mount within 15s');

  const report = { script: path.basename(SCRIPT), url, mounted, tabs: {}, errors: [] };

  if (mounted) {
    // If a key is already stored, the script auto-fetches on mount — let it settle,
    // then close the Settings panel so screenshots show the actual tab bodies.
    await new Promise(r => setTimeout(r, 6000));
    await page.evaluate(() => { const c = document.getElementById('ocm-config-close'); if (c) c.click(); }).catch(() => {});
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(SHOTS, '00-mounted.png') }).catch(() => {});
    for (const tab of TABS) {
      const before = errors.length;
      const clicked = await page.evaluate((t) => {
        const nav = document.querySelector(`#ocm-tabs .ocm-nav[data-tab="${t}"]`);
        if (!nav) return false; nav.click(); return true;
      }, tab).catch(() => false);
      await new Promise(r => setTimeout(r, 1600));
      const paneInfo = await page.evaluate((t) => {
        const pane = document.getElementById(`ocm-pane-${t}`);
        if (!pane) return { exists: false };
        const txt = (pane.innerText || '').trim();
        return { exists: true, chars: txt.length, sample: txt.slice(0, 80).replace(/\s+/g, ' ') };
      }, tab).catch(() => ({ exists: false }));
      await page.screenshot({ path: path.join(SHOTS, `tab-${tab}.png`) }).catch(() => {});
      report.tabs[tab] = { navFound: clicked, ...paneInfo, newErrors: errors.length - before };
      console.log(`  [${tab}] nav=${clicked} pane=${paneInfo.exists} chars=${paneInfo.chars || 0} errs=${errors.length - before}`);
    }
  }

  report.errors = errors.slice(0, 40);
  fs.writeFileSync(path.join(__dirname, 'smoke-report.json'), JSON.stringify(report, null, 2));
  console.log(`\nErrors captured: ${errors.length}`);
  errors.slice(0, 12).forEach(e => console.log(`  • [${e.kind}] ${e.text.slice(0, 160)}`));
  console.log('\nReport → test/browser/smoke-report.json   Screenshots → test/browser/shots/');
  await browser.disconnect();
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
