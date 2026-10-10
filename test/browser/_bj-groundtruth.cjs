const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await b.pages();
  const page = pages.find(p => p.url().includes('sid=blackjack')) || pages[0];
  const info = await page.evaluate(() => {
    const cls = el => !el ? '' : (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className||'')).trim();
    const dump = sel => {
      const scope = document.querySelector(sel);
      if (!scope) return { sel, found:false };
      const cont = scope.querySelector('.table-cards-wrap .cards') || scope.querySelector('.cards');
      const kids = cont ? [...cont.children].map(d => ({ cls: cls(d), name:(d.querySelector('.cards-name')?.textContent||'').trim(), html:d.outerHTML.replace(/\s+/g,' ').slice(0,120) })) : [];
      const total = (scope.querySelector('.total')?.textContent||'').trim();
      return { sel, found:true, contCls: cls(cont), total, kids };
    };
    const next = document.querySelector('.next-game-card');
    // all distinct card-* classes anywhere
    const cardCls = new Set();
    document.querySelectorAll('[class*="card" i]').forEach(e => cls(e).split(/\s+/).forEach(c => { if(/card/i.test(c)) cardCls.add(c); }));
    return {
      url: location.href,
      dealer: dump('.dealer-cards'),
      player: dump('.player-cards'),
      next: next ? { cls: cls(next), name:(next.querySelector('.cards-name')?.textContent||'').trim(), html: next.outerHTML.replace(/\s+/g,' ').slice(0,200) } : null,
      winLose: (document.querySelector('.win-lose')?.outerHTML||'').replace(/\s+/g,' ').slice(0,300),
      shuffled: !!document.querySelector('.shuffled'),
      distinctCardClasses: [...cardCls].slice(0,60),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await b.disconnect();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
