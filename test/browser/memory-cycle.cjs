const fs = require('fs');
const path = require('path');
const {
  withBackgroundTorn,
} = require('./browser-session.cjs');

const SCRIPT = process.argv[2] || path.resolve(__dirname, '..', '..', 'Torn_OC_Suite_PurrfectCrime.user.js');
const SKIP_SCRIPT = process.env.SKIP_SCRIPT === '1' || process.argv.includes('--skip-script');
const TABS = ['crimes', 'people', 'war', 'armoury', 'crimes'];
const CYCLES = Number(process.env.CYCLES || 8);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  // Mobile emulation and memory instrumentation run in an isolated background
  // tab. The authenticated 1920x1080 Torn tab stays in front and unchanged.
  await withBackgroundTorn({ width: 390, height: 844 }, async page => {
  await page.exposeFunction('gmXhr', async opts => {
    try {
      const ctrl = new AbortController();
      const timeout = opts.timeout ? setTimeout(() => ctrl.abort(), opts.timeout) : null;
      const res = await fetch(opts.url, { method: opts.method || 'GET', headers: opts.headers || {}, body: opts.data ?? undefined, signal: ctrl.signal });
      if (timeout) clearTimeout(timeout);
      return { status: res.status, statusText: res.statusText, responseText: await res.text(), finalUrl: res.url, ok: true };
    } catch (e) {
      return { status: 0, statusText: String(e), responseText: '', finalUrl: opts.url, ok: false };
    }
  });
  await page.setBypassCSP(true);
  await page.goto('https://www.torn.com/factions.php?step=your&type=1#/tab=crimes', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await pause(3500);

  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.evaluate(() => {
    const realSetInterval = window.setInterval.bind(window);
    const realClearInterval = window.clearInterval.bind(window);
    const active = new Map();
    window.setInterval = (fn, ms, ...args) => {
      const id = realSetInterval(fn, ms, ...args);
      active.set(id, { ms, stack: new Error().stack });
      return id;
    };
    window.clearInterval = id => { active.delete(id); return realClearInterval(id); };
    const realAdd = EventTarget.prototype.addEventListener;
    const listenerCounts = new Map();
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (type === 'hashchange') listenerCounts.set(type, (listenerCounts.get(type) || 0) + 1);
      return realAdd.call(this, type, listener, options);
    };
    window.__OCM_MEM_DEBUG__ = {
      intervals: active,
      listenerCounts,
      sample() {
        const perf = performance.memory;
        return {
          heapUsed: perf ? perf.usedJSHeapSize : null,
          heapLimit: perf ? perf.jsHeapSizeLimit : null,
          nodes: document.getElementsByTagName('*').length,
          ocmNodes: document.querySelectorAll('[id^="ocm-"], [class*="ocm-"]').length,
          intervals: [...active.values()].map(x => x.ms).sort((a, b) => a - b),
          hashListeners: listenerCounts.get('hashchange') || 0,
          root: !!document.getElementById('ocm-root')
        };
      }
    };
  });

  const seedStore = process.env.LIVE_DATA === '1'
    ? fs.readFileSync(path.join(__dirname, 'store.json'), 'utf8')
    : '';
  await page.evaluate(seed => {
    const S = seed ? JSON.parse(seed) : {};
    window.GM_getValue = (k, d) => Object.prototype.hasOwnProperty.call(S, k) ? S[k] : d;
    window.GM_setValue = (k, v) => { S[k] = v; };
    window.GM_deleteValue = k => { delete S[k]; };
    window.GM_listValues = () => Object.keys(S);
    window.GM_addStyle = css => { const el = document.createElement('style'); el.textContent = css; document.head.appendChild(el); return el; };
    window.GM_info = { script: { name: 'OC Suite memory test', version: '0.0.0' } };
    const xhr = opts => Promise.resolve(window.gmXhr({ method: opts.method, url: opts.url, headers: opts.headers, data: opts.data, timeout: opts.timeout }))
      .then(r => r.ok || r.status ? opts.onload?.(r) : opts.onerror?.(r)).catch(e => opts.onerror?.({ status: 0, statusText: String(e), responseText: '' }));
    window.GM_xmlHttpRequest = xhr;
    window.GM_xmlhttpRequest = xhr;
    window.GM = { xmlHttpRequest: xhr, getValue: async (k, d) => window.GM_getValue(k, d), setValue: async (k, v) => window.GM_setValue(k, v) };
    window.unsafeWindow = window;
  }, seedStore);
  if (!SKIP_SCRIPT) {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    await page.evaluate(src);
    await page.waitForSelector('#ocm-root', { timeout: 15000 }).catch(() => {});
  }
  await pause(2500);

  const samples = [];
  samples.push(await page.evaluate(() => ({ phase: 'initial', ...window.__OCM_MEM_DEBUG__.sample() })));
  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    for (const tab of TABS) {
      await page.evaluate(t => { location.hash = `#/tab=${t}`; }, tab);
      await pause(1200);
    }
    samples.push(await page.evaluate(cycle => ({ phase: `cycle-${cycle}`, ...window.__OCM_MEM_DEBUG__.sample() }), cycle));
  }
  console.log(JSON.stringify({ url: page.url().replace(/key=[^&]+/g, 'key=<redacted>'), samples, errors: errors.slice(0, 20) }, null, 2));
  });
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
