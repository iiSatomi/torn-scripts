const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await b.pages();
  const page = pages.find(p => p.url().includes('sid=blackjack')) || pages[0];
  const info = await page.evaluate(() => {
    const dump = sel => { const el = document.querySelector(sel); return el ? el.outerHTML.replace(/\s+/g,' ').slice(0, 900) : '(none)'; };
    const out = {};
    out.dealer = dump('.dealer-cards');
    out.player = dump('.player-cards');
    out.tableCards = dump('.table-cards');
    out.deckIcons = dump('.deck-icons');
    out.nextGameCard = dump('.next-game-card');
    out.cardsName = dump('.cards-name');
    // any element whose class or src references a specific rank/suit
    const cards = [...document.querySelectorAll('[class*="card" i]')].filter(e => !/wrap|table|cards-on|player-cards|dealer-cards|name/i.test((e.className.baseVal ?? e.className)));
    out.cardEls = cards.slice(0, 8).map(e => e.outerHTML.replace(/\s+/g,' ').slice(0,200));
    // window globals that might hold game state
    out.globals = Object.keys(window).filter(k => /black|jack|casino|card|deck|game/i.test(k)).slice(0,30);
    return out;
  });
  console.log(JSON.stringify(info, null, 2));
  await b.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
