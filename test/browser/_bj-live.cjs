const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const LOG = path.join(__dirname, 'bj-record.jsonl');
fs.writeFileSync(LOG, '');
const recorder = () => {
  if (window.__bjBooted2) return; window.__bjBooted2 = true;
  const cls = el => (el && el.className && el.className.baseVal !== undefined ? el.className.baseVal : String((el&&el.className)||'')).trim();
  const slots = sel => [...document.querySelectorAll(sel + ' .cards > div')].map(d => ({ c: cls(d), t: (d.querySelector('.cards-name')?.textContent||'').trim(), h: d.innerHTML.replace(/\s+/g,' ').slice(0,80) }));
  const parentCls = sel => cls(document.querySelector(sel + ' .cards'));
  const nextC = () => { const n=document.querySelector('.next-game-card'); return n ? { c: cls(n), t: (n.querySelector('.cards-name')?.textContent||'').trim() } : null; };
  let last='';
  const tick = () => {
    const P=slots('.player-cards'), D=slots('.dealer-cards'), N=nextC();
    const pAct=parentCls('.player-cards'), dAct=parentCls('.dealer-cards');
    // keep only non-empty slots for signal, but record parent act-classes always
    const Pf=P.filter(s=>s.c||s.t||s.h), Df=D.filter(s=>s.c||s.t||s.h);
    const snap=JSON.stringify({Pf,Df,N,pAct,dAct}); if(snap===last)return; last=snap;
    try{ window.bjLog(JSON.stringify({t:Date.now(),ev:'snap',pAct,dAct,player:Pf,dealer:Df,next:N})); }catch(_){}
  };
  const boot=()=>{ const mo=new MutationObserver(tick); mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class'],characterData:true}); setInterval(tick,500); tick(); try{window.bjLog(JSON.stringify({t:Date.now(),ev:'load'}));}catch(_){}};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
};
(async () => {
  const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await b.pages();
  const page = pages.find(p => p.url().includes('sid=blackjack')) || pages[0];
  await page.exposeFunction('bjLog', line => { fs.appendFileSync(LOG, line+'\n'); });
  await page.evaluateOnNewDocument(recorder);
  await page.evaluate(recorder);
  page.on('framenavigated', async f => { try { if (f===page.mainFrame()) await page.evaluate(recorder); } catch(_){} });
  console.log('[LIVE2] recording raw slot classes to bj-record.jsonl');
  await new Promise(()=>{});
})().catch(e => { console.error(e); process.exit(1); });
