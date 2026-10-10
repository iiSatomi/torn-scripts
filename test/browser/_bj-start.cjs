const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await b.pages();
  const page = pages.find(p => p.url().includes('sid=blackjack')) || pages[0];
  const res = await page.evaluate(() => {
    if (window.__bjRec) return 'already running (' + (window.__bjEvents?.length||0) + ' events)';
    const cn = e => (e && e.className && e.className.baseVal !== undefined ? e.className.baseVal : String((e&&e.className) || ''));
    const SUITS = ['heart','diamond','club','spade'];
    const suitOf = el => SUITS.find(s => cn(el).split(/\s+/).includes(s)) || '?';
    const readHand = sel => [...document.querySelectorAll(sel + ' .cards > div')].map(d => { const nm=d.querySelector('.cards-name'); return nm?{r:nm.textContent.trim(),s:suitOf(d)}:null; }).filter(Boolean);
    const readNext = () => { const n=document.querySelector('.next-game-card'); if(!n)return null; const nm=n.querySelector('.cards-name'); return nm?{r:nm.textContent.trim(),s:suitOf(n)}:null; };
    window.__bjEvents = JSON.parse(localStorage.getItem('__bjEvents')||'[]');
    const save = () => { try { localStorage.setItem('__bjEvents', JSON.stringify(window.__bjEvents.slice(-4000))); } catch(_){} };
    const emit = o => { window.__bjEvents.push({ t: Date.now(), ...o }); save(); };
    let lastP='', lastD='', hand=0, everDealt=false;
    emit({ ev:'start', next: readNext() });
    const tick = () => {
      const P=readHand('.player-cards'), D=readHand('.dealer-cards');
      const pk=JSON.stringify(P), dk=JSON.stringify(D);
      if (pk===lastP && dk===lastD) return;
      if (everDealt && P.length===0 && D.length===0 && lastP!=='[]' && lastP!=='') { hand++; emit({ev:'clear',hand}); }
      if (P.length||D.length) everDealt=true;
      emit({ ev:'state', hand, player:P, dealer:D, next:readNext() });
      lastP=pk; lastD=dk;
    };
    const mo = new MutationObserver(tick);
    mo.observe(document.querySelector('.table-cards')||document.body, { childList:true, subtree:true, attributes:true, characterData:true });
    window.__bjPoll = setInterval(tick, 800);
    window.__bjRec = true;
    window.__bjStop = () => { mo.disconnect(); clearInterval(window.__bjPoll); window.__bjRec=false; return window.__bjEvents.length; };
    return 'recorder attached';
  });
  console.log(res);
  await b.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
