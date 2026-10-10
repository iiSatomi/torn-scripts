// Live UI audit: inject the requested userscript, then walk every rendered subtab and war group.
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const SCRIPT = path.resolve(process.argv[2] || 'Torn_OC_Suite_PurrfectCrime.user.js');
const STORE = path.join(__dirname, 'store.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find(candidate => candidate.url().includes('factions.php')) || pages[0];
  await page.setBypassCSP(true);

  try { await page.exposeFunction('gmPersist', value => fs.writeFileSync(STORE, value)); } catch (_) {}
  try {
    await page.exposeFunction('gmXhr', async options => {
      try {
        const response = await fetch(options.url, {
          method: options.method || 'GET',
          headers: options.headers || {},
          body: options.data || undefined,
        });
        return { status: response.status, responseText: await response.text(), ok: response.ok };
      } catch (error) {
        return { status: 0, responseText: '', ok: false, error: String(error) };
      }
    });
  } catch (_) {}

  const store = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack || String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await page.evaluate(seed => {
    const save = () => gmPersist(JSON.stringify(seed));
    window.GM_getValue = (key, fallback) => Object.hasOwn(seed, key) ? seed[key] : fallback;
    window.GM_setValue = (key, value) => { seed[key] = value; save(); };
    window.GM_addStyle = css => {
      const element = document.createElement('style');
      element.textContent = css;
      document.head.append(element);
    };
    const xhr = options => gmXhr(options).then(response => {
      if (response.ok || response.status) options.onload?.(response);
      else options.onerror?.(response);
    }).catch(error => options.onerror?.({ status: 0, responseText: '', error: String(error) }));
    window.GM_xmlHttpRequest = xhr;
    window.GM_xmlhttpRequest = xhr;
    window.GM = {
      getValue: async (key, fallback) => GM_getValue(key, fallback),
      setValue: async (key, value) => GM_setValue(key, value),
      xmlHttpRequest: xhr,
    };
    window.unsafeWindow = window;
  }, store);

  await page.evaluate(fs.readFileSync(SCRIPT, 'utf8'));
  await page.waitForSelector('#ocm-root');
  await sleep(3000);

  const rows = await page.evaluate(async () => {
    const wait = () => new Promise(resolve => setTimeout(resolve, 80));
    const out = [];
    for (const nav of document.querySelectorAll('#ocm-tabs .ocm-nav')) {
      nav.click();
      await wait();
      const activePane = document.querySelector('.ocm-tab-pane.active');
      out.push([nav.dataset.tab, '__tab__', (activePane?.innerText || '').length]);
      for (const sub of document.querySelectorAll('.ocm-tab-pane.active .ocm-subtab')) {
        sub.click();
        await wait();
        out.push([nav.dataset.tab, sub.dataset.sub, (document.querySelector('.ocm-tab-pane.active')?.innerText || '').length]);
      }
      if (nav.dataset.tab === 'war') {
        for (const group of document.querySelectorAll('.ocm-war-group')) {
          group.click();
          await wait();
          for (const tab of document.querySelectorAll('.ocm-war-tabbtn')) {
            tab.click();
            await wait();
            out.push(['war', tab.dataset.tab, (document.querySelector('#ocm-war-tabcontent')?.innerText || '').length]);
          }
        }
      }
    }
    return out;
  });

  console.log('Walked', rows.length, 'views:', rows.map(row => row.join(':')).join(' | '));
  console.log('errors', errors.length, errors);
  await browser.disconnect();
  if (errors.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
