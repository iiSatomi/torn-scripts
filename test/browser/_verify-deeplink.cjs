const fs=require('fs'), path=require('path');
const puppeteer=require('puppeteer-core');
const SCRIPT='C:/Users/asato/Desktop/Game Stuff/Torn Scripts/Torn_OC_Suite_PurrfectCrime.user.js';
const STORE=path.join(__dirname,'store.json');
const loadStore=()=>{try{return JSON.parse(fs.readFileSync(STORE,'utf8'))}catch{return{}}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.connect({browserURL:'http://127.0.0.1:9222',defaultViewport:null});
  const pages=await b.pages(); let page=pages.find(p=>p.url().includes('torn.com'))||pages[0];
  const errs=[]; page.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,160));});
  page.on('pageerror',e=>errs.push('PE:'+e.message.slice(0,160)));
  await page.setBypassCSP(true);
  const expose=async(n,f)=>{try{await page.exposeFunction(n,f)}catch{}};
  await expose('gmPersist',j=>{try{fs.writeFileSync(STORE,j)}catch{}});
  await expose('gmXhr',async(o)=>{try{const c=new AbortController();const t=o.timeout?setTimeout(()=>c.abort(),o.timeout):null;const r=await fetch(o.url,{method:o.method||'GET',headers:o.headers||{},body:o.data||undefined,signal:c.signal});if(t)clearTimeout(t);return{status:r.status,responseText:await r.text(),responseHeaders:''}}catch(e){return{status:0,responseText:'',error:String(e)}}});
  await page.reload({waitUntil:"domcontentloaded"}); await sleep(3500); await page.setBypassCSP(true);
  await page.evaluate((s)=>{window.__store=s;},loadStore());
  await page.evaluate(()=>{const S=window.__store||{};window.GM_getValue=(k,d)=>k in S?S[k]:d;window.GM_setValue=(k,v)=>{S[k]=v;window.gmPersist(JSON.stringify(S));};window.GM_deleteValue=(k)=>{delete S[k];window.gmPersist(JSON.stringify(S));};window.GM_addStyle=(c)=>{const e=document.createElement('style');e.textContent=c;document.head.appendChild(e);};window.GM_xmlhttpRequest=(o)=>{window.gmXhr({url:o.url,method:o.method,headers:o.headers,data:o.data,timeout:o.timeout}).then(r=>{if(r.error&&o.onerror)o.onerror(r);else if(o.onload)o.onload(r);}).catch(e=>o.onerror&&o.onerror({error:String(e)}));};window.GM_info={script:{version:'probe'}};});
  await page.evaluate(fs.readFileSync(SCRIPT,'utf8'));
  await sleep(3500);
  // go to home tab
  await page.evaluate(()=>document.querySelector('#ocm-tabs .ocm-nav[data-tab="home"]')?.click());
  await sleep(1200);
  const home=await page.evaluate(()=>{
    const gos=[...document.querySelectorAll('#ocm-pane-home .ocm-home-go')].map(e=>({go:e.dataset.go,sub:e.dataset.sub,label:(e.textContent||'').trim()}));
    return {gos};
  });
  // click each go link and record resulting active tab+subpane
  const outcomes=[];
  for(let i=0;i<home.gos.length;i++){
    await page.evaluate(()=>document.querySelector('#ocm-tabs .ocm-nav[data-tab="home"]')?.click());
    await sleep(500);
    const res=await page.evaluate((idx)=>{
      const el=document.querySelectorAll('#ocm-pane-home .ocm-home-go')[idx];
      if(!el)return null;
      const want={go:el.dataset.go,sub:el.dataset.sub,label:(el.textContent||'').trim()};
      el.click();
      const activeTab=document.querySelector('#ocm-tabs .ocm-nav.active')?.dataset.tab;
      const activePane=[...document.querySelectorAll('.ocm-tab-pane.active')].map(p=>p.id)[0];
      const activeSub=document.querySelector('#ocm-pane-'+want.go+' .ocm-subpane.active')?.id;
      return {want, activeTab, activePane, activeSub};
    },i);
    await sleep(400);
    outcomes.push(res);
  }
  console.log(JSON.stringify({gos:home.gos, outcomes, errs},null,2));
  await b.disconnect();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
