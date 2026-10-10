const puppeteer = require('puppeteer-core');
const path = require('path');
(async () => {
  const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await b.pages();
  const page = pages.find(p => p.url().includes('sid=blackjack')) || pages[0];
  const el = await page.$('#bjadv-panel');
  if (!el) { console.log('no panel'); await b.disconnect(); return; }
  // expand settings so the screenshot shows the full panel
  await page.evaluate(() => { const d = document.querySelector('#bjadv-settings details'); if (d) d.open = true; });
  await new Promise(r => setTimeout(r, 300));
  const out = path.join(__dirname, 'bj-panel.png');
  await el.screenshot({ path: out });
  console.log('shot:', out);
  await b.disconnect();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
