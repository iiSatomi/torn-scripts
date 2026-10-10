const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
(async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'Torn_Blackjack_Advisor.user.js'), 'utf8');
  const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await b.pages();
  const page = pages.find(p => p.url().includes('sid=blackjack')) || pages[0];
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  // remove any prior panel so we test a clean boot
  await page.evaluate(() => { const p = document.getElementById('bjadv-panel'); if (p) p.remove(); });
  await page.evaluate(src);
  await new Promise(r => setTimeout(r, 1500));
  const res = await page.evaluate(() => {
    const p = document.getElementById('bjadv-panel');
    if (!p) return { built:false };
    const q = s => p.querySelector(s);
    return {
      built:true,
      version: (q('#bjadv-head')?.textContent||'').replace(/\s+/g,' ').trim(),
      rec: q('#bjadv-rec')?.textContent?.trim(),
      sub: q('#bjadv-sub')?.textContent?.trim(),
      bet: q('#bjadv-bet')?.textContent?.trim(),
      stats: q('#bjadv-stats')?.textContent?.replace(/\s+/g,' ').trim(),
      hasSettings: !!q('#bjadv-settings details'),
      bg: getComputedStyle(p).backgroundColor,
      radius: getComputedStyle(p).borderRadius,
    };
  });
  console.log(JSON.stringify({ res, errors }, null, 2));
  await b.disconnect();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
