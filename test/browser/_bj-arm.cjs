const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await b.pages();
  const page = pages.find(p => p.url().includes('sid=blackjack')) || pages[0];
  const RESET = process.argv.includes('--reset');

  const recorder = (doReset) => {
    const cn = e => (e && e.className && e.className.baseVal !== undefined ? e.className.baseVal : String((e&&e.className) || ''));
    const SUITS = ['heart','diamond','club','spade'];
    const suitOf = el => SUITS.find(s => cn(el).split(/\s+/).includes(s)) || '?';
    const readHand = sel => [...document.querySelectorAll(sel + ' .cards > div')].map(d => { const nm=d.querySelector('.cards-name'); return nm?{r:nm.textContent.trim(),s:suitOf(d)}:null; }).filter(Boolean);
    const readNext = () => { const n=document.querySelector('.next-game-card'); if(!n)return null; const nm=n.querySelector('.cards-name'); return nm?{r:nm.textContent.trim(),s:suitOf(n)}:null; };
    const KEY='__bjEvents';
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)||'[]'); } catch(_) { return []; } };
    const push = o => { const a=load(); a.push({ t:Date.now(), ...o }); try{ localStorage.setItem(KEY, JSON.stringify(a.slice(-8000))); }catch(_){} };
    if (doReset) { try { localStorage.setItem(KEY,'[]'); } catch(_){} }
    let last='';
    const tick = () => {
      const P=readHand('.player-cards'), D=readHand('.dealer-cards'), N=readNext();
      const snap = JSON.stringify({P,D,N});
      if (snap===last) return; last=snap;
      if (P.length||D.length||N) push({ ev:'snap', player:P, dealer:D, next:N });
    };
    const boot = () => {
      const mo = new MutationObserver(tick);
      mo.observe(document.querySelector('.table-cards')||document.body, { childList:true, subtree:true, attributes:true, characterData:true });
      setInterval(tick, 700); tick();
      push({ ev:'load', url: location.href });
    };
    if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  };

  // register for all future loads + run once now
  await page.evaluateOnNewDocument(recorder, false);
  await page.evaluate(recorder, RESET);
  const n = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('__bjEvents')||'[]').length; } catch(_) { return -1; } });
  console.log((RESET?'[reset] ':'') + 'armed on-new-document + current page; current event count=', n);
  await b.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
