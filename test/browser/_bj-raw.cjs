const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await b.pages();
  const page = pages.find(p => p.url().includes('sid=blackjack')) || pages[0];
  const s = await page.evaluate(() => {
    const q = sel => document.querySelector(sel);
    const clip = el => el ? el.outerHTML.replace(/\s+/g,' ') : '(none)';
    return {
      booted: !!window.__bjBooted,
      ready: document.readyState,
      url: location.href,
      playerRaw: clip(q('.player-cards')).slice(0, 1400),
      dealerRaw: clip(q('.dealer-cards')).slice(0, 900),
      nextRaw: clip(q('.next-game-card')).slice(0, 300),
      tableExists: !!q('.table-cards'),
    };
  });
  console.log(JSON.stringify(s, null, 1));
  await b.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
