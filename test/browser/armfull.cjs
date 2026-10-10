// Full Armoury flow in ONE live connection (gmXhr stays alive → pfps load).
const fs=require('fs'),path=require('path');const puppeteer=require('puppeteer-core');
const SCRIPT='C:/Users/asato/Desktop/Game Stuff/Torn Scripts/Torn_OC_Suite_PurrfectCrime.user.js';
const STORE=path.join(__dirname,'store.json'),SHOTS=path.join(__dirname,'shots');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const loadStore=()=>{try{return JSON.parse(fs.readFileSync(STORE,'utf8'));}catch{return{};}};
(async()=>{
  const b=await puppeteer.connect({browserURL:'http://127.0.0.1:9222',defaultViewport:null});
  const pages = await b.pages();
  const page = pages.find(x => x.url().includes('factions.php') && x.url().includes('#/tab=crimes')) || pages.find(x => x.url().includes('factions.php')) || pages[0];
  await page.setBypassCSP(true);
  const expose=async(n,f)=>{try{await page.exposeFunction(n,f);}catch(e){}};
  await expose('gmPersist',j=>{try{fs.writeFileSync(STORE,j);}catch(e){}});
  await expose('gmXhr',async o=>{try{const c=new AbortController();const t=o.timeout?setTimeout(()=>c.abort(),o.timeout):null;
    const r=await fetch(o.url,{method:o.method||'GET',headers:o.headers||{},body:o.data??undefined,signal:c.signal});if(t)clearTimeout(t);
    return{status:r.status,statusText:r.statusText,responseText:await r.text(),finalUrl:r.url,ok:true};}catch(e){return{status:0,statusText:String(e),responseText:'',ok:false};}});
  const errs=[];page.on('pageerror',e=>errs.push(String(e)));page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  const shim=(S0)=>{const S=S0||{};const persist=()=>{try{window.gmPersist(JSON.stringify(S));}catch(e){}};
    window.GM_getValue=(k,d)=>Object.prototype.hasOwnProperty.call(S,k)?S[k]:d;window.GM_setValue=(k,v)=>{S[k]=v;persist();};
    window.GM_deleteValue=k=>{delete S[k];persist();};window.GM_listValues=()=>Object.keys(S);
    window.GM_addStyle=css=>{const e=document.createElement('style');e.textContent=css;document.head.appendChild(e);return e;};
    window.GM_info={script:{name:'OCS',version:'live'}};
    const xhr=o=>{Promise.resolve(window.gmXhr({method:o.method,url:o.url,headers:o.headers,data:o.data,timeout:o.timeout}))
      .then(r=>{(r.ok||r.status)?o.onload&&o.onload(r):o.onerror&&o.onerror(r);}).catch(e=>o.onerror&&o.onerror({status:0,responseText:''}));};
    window.GM_xmlHttpRequest=xhr;window.GM_xmlhttpRequest=xhr;window.GM=window.GM||{};window.GM.xmlHttpRequest=xhr;
    window.GM.getValue=async(k,d)=>window.GM_getValue(k,d);window.GM.setValue=async(k,v)=>window.GM_setValue(k,v);window.unsafeWindow=window;};
  await page.reload({waitUntil:'domcontentloaded'});await sleep(3500);
  await page.evaluate(shim,loadStore());
  await page.evaluate(fs.readFileSync(SCRIPT,'utf8'));
  await page.waitForSelector('#ocm-root',{timeout:15000});
  await sleep(5000);
  await page.evaluate(()=>{const c=document.getElementById('ocm-config-close');if(c)c.click();});
  await page.evaluate(()=>document.querySelector('#ocm-tabs .ocm-nav[data-tab="armoury"]')?.click());
  console.log('armoury opened; loading news + pfps...');
  await sleep(6000); // news autoload
  await page.evaluate(()=>{const btn=[...document.querySelectorAll('#ocm-pane-armoury .ocm-arm-view')].find(b=>b.dataset.v==='members');if(btn)btn.click();});
  await sleep(9000); // let 22 pfps hydrate over the live connection
  const pf=await page.evaluate(()=>{const i=[...document.querySelectorAll('#ocm-pane-armoury img.ocm-arm-pfp')];return{n:i.length,loaded:i.filter(x=>x.naturalWidth>0).length,sample:i[0]?i[0].src.slice(0,60):''};});
  console.log('pfp imgs:',pf.n,'| actually loaded (naturalWidth>0):',pf.loaded,'| sample',pf.sample);
  await page.screenshot({path:path.join(SHOTS,'arm-members2.png')});
  await page.evaluate(()=>{const c=document.querySelector('#ocm-pane-armoury .ocm-arm-mcard');if(c)c.click();});
  await sleep(3000);
  await page.screenshot({path:path.join(SHOTS,'arm-detail2.png')});
  await page.evaluate(() => document.querySelector('#ocm-tabs .ocm-nav[data-tab="armoury"]')?.click());
  await sleep(400);
  await page.evaluate(() => [...document.querySelectorAll('#ocm-pane-armoury .ocm-arm-view')].find(b => b.dataset.v === 'loans')?.click());
  await sleep(1000);
  const loans = await page.evaluate(() => document.querySelector('#ocm-pane-armoury')?.innerText || '');
  console.log('loans:', loans.slice(0, 500).replace(/\n/g, ' | '));
  await page.screenshot({path:path.join(SHOTS,'arm-loans.png')});
  console.log('errors:',errs.length,errs.slice(0,5));
  await b.disconnect();
})().catch(e=>{console.error('ERR',e);process.exit(1);});
