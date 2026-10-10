const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await b.pages();
  const page = pages.find(p => p.url().includes('sid=blackjack')) || pages[0];
  const info = await page.evaluate(() => {
    const cn = e => (e.className && e.className.baseVal !== undefined ? e.className.baseVal : String(e.className || ''));
    const out = { url: location.href };
    const hint = /card|hand|dealer|player|deck|score|dealt|bet|chip|deal|hit|stand|split|double|you|casino/i;
    const seen = new Set(); const classes = [];
    [...document.querySelectorAll('[class]')].forEach(e => { cn(e).split(/\s+/).forEach(cl => { if (cl && hint.test(cl) && !seen.has(cl)) { seen.add(cl); classes.push(cl); } }); });
    out.hintClasses = classes.slice(0, 150);
    const imgs = [...document.querySelectorAll('img,[data-card],[data-rank],[data-value]')].filter(e => hint.test(cn(e)) || e.dataset.card || e.dataset.rank || e.dataset.value || /card|deck/i.test(e.getAttribute('src')||''));
    out.cardSamples = imgs.slice(0, 16).map(e => ({ tag: e.tagName, cls: cn(e).slice(0,70), src: (e.getAttribute('src')||'').slice(-70), alt: e.getAttribute('alt'), data: JSON.stringify(e.dataset) }));
    out.buttons = [...document.querySelectorAll('button, [class*="action" i], [class*="btn" i]')].map(e => (e.innerText||e.textContent||'').trim()).filter(Boolean).slice(0, 30);
    return out;
  });
  console.log(JSON.stringify(info, null, 2));
  await b.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
