const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await b.pages();
  const page = pages.find(p => p.url().includes('sid=blackjack')) || pages[0];
  const info = await page.evaluate(() => {
    const cn = e => (e.className && e.className.baseVal !== undefined ? e.className.baseVal : String(e.className || ''));
    const out = {};
    // deck / shoe indicators
    out.deckIconEls = [...document.querySelectorAll('.deck-icons, [class*="deck" i], [class*="shoe" i]')].map(e => ({ cls: cn(e), html: e.outerHTML.replace(/\s+/g,' ').slice(0,160), parent: cn(e.parentElement||{}) }));
    // anything showing a number that could be decks remaining / count
    out.numbers = [...document.querySelectorAll('*')].filter(e => e.children.length===0 && /^\s*\d{1,3}\s*$/.test(e.textContent) && /deck|shoe|card|count|remain/i.test(cn(e)+' '+cn(e.parentElement||{}))).map(e => ({ cls: cn(e), parent: cn(e.parentElement||{}), text: e.textContent.trim() })).slice(0,20);
    // full casino container class list for theme + reshuffle hooks
    const root = document.querySelector('[class*="black-jack" i], [class*="blackjack" i], .casino, [class*="casino" i]');
    out.rootCls = root ? cn(root) : '(no root)';
    // look for scripts / json state
    out.hasReshuffleText = /reshuffl|shuffl|new deck|new shoe/i.test(document.body.innerText);
    out.bodyDeckMentions = (document.body.innerText.match(/.{0,20}(deck|shoe|shuffl).{0,20}/gi)||[]).slice(0,10);
    return out;
  });
  console.log(JSON.stringify(info, null, 2));
  await b.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
