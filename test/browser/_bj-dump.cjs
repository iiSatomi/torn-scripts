const puppeteer = require('puppeteer-core');
const fs = require('fs');
(async () => {
  const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await b.pages();
  const page = pages.find(p => p.url().includes('sid=blackjack')) || pages[0];
  const evs = await page.evaluate(() => {
    let e = window.__bjEvents;
    if (!e || !e.length) { try { e = JSON.parse(localStorage.getItem('__bjEvents')||'[]'); } catch(_) { e = []; } }
    return e || [];
  });
  fs.writeFileSync('bj-record.json', JSON.stringify(evs));
  console.log('events:', evs.length);
  await b.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
