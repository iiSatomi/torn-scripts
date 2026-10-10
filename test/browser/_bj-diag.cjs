const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await b.pages();
  console.log('BJ pages:', pages.filter(p=>p.url().includes('blackjack')).length, 'total:', pages.length);
  for (const p of pages) {
    if (!p.url().includes('blackjack')) continue;
    const s = await p.evaluate(() => {
      let ls=[]; try { ls=JSON.parse(localStorage.getItem('__bjEvents')||'[]'); } catch(_){}
      const cn = e => (e && e.className && e.className.baseVal!==undefined?e.className.baseVal:String((e&&e.className)||''));
      const player=[...document.querySelectorAll('.player-cards .cards > div')].map(d=>{const nm=d.querySelector('.cards-name');return nm?nm.textContent.trim()+cn(d).replace(/[^a-z]/gi,'').slice(0,1):null}).filter(Boolean);
      const dealer=[...document.querySelectorAll('.dealer-cards .cards > div')].map(d=>{const nm=d.querySelector('.cards-name');return nm?nm.textContent.trim()+cn(d).replace(/[^a-z]/gi,'').slice(0,1):null}).filter(Boolean);
      return { url: location.href, ready: document.readyState, winEv: (window.__bjEvents||[]).length, lsLen: ls.length, lsSample: ls.slice(-3), liveP: player, liveD: dealer, hasTable: !!document.querySelector('.table-cards') };
    });
    console.log(JSON.stringify(s, null, 1));
  }
  await b.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
