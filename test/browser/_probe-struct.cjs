const fs=require('fs'), path=require('path');
const puppeteer=require('puppeteer-core');
const SCRIPT='C:/Users/asato/Desktop/Game Stuff/Torn Scripts/Torn_OC_Suite_PurrfectCrime.user.js';
const STORE=path.join(__dirname,'store.json');
const loadStore=()=>{try{return JSON.parse(fs.readFileSync(STORE,'utf8'))}catch{return{}}};
(async()=>{
  const b=await puppeteer.connect({browserURL:'http://127.0.0.1:9222',defaultViewport:null});
  const pages=await b.pages(); let page=pages.find(p=>p.url().includes('torn.com'))||pages[0];
  await page.setBypassCSP(true);
  const expose=async(n,f)=>{try{await page.exposeFunction(n,f)}catch{}};
  await expose('gmPersist',j=>{try{fs.writeFileSync(STORE,j)}catch{}});
  await expose('gmXhr',async(opts)=>{try{const c=new AbortController();const t=opts.timeout?setTimeout(()=>c.abort(),opts.timeout):null;const r=await fetch(opts.url,{method:opts.method||'GET',headers:opts.headers||{},body:opts.data||undefined,signal:c.signal});if(t)clearTimeout(t);const text=await r.text();return{status:r.status,responseText:text,responseHeaders:''}}catch(e){return{status:0,responseText:'',error:String(e)}}});
  const store=loadStore();
  await page.evaluate((s)=>{window.__store=s;},store);
  // GM shim
  await page.evaluate(()=>{
    const S=window.__store||{};
    window.GM_getValue=(k,d)=>k in S?S[k]:d;
    window.GM_setValue=(k,v)=>{S[k]=v;window.gmPersist(JSON.stringify(S));};
    window.GM_deleteValue=(k)=>{delete S[k];window.gmPersist(JSON.stringify(S));};
    window.GM_addStyle=(css)=>{const e=document.createElement('style');e.textContent=css;document.head.appendChild(e);};
    window.GM_xmlhttpRequest=(o)=>{window.gmXhr({url:o.url,method:o.method,headers:o.headers,data:o.data,timeout:o.timeout}).then(r=>{if(r.error&&o.onerror)o.onerror(r);else if(o.onload)o.onload(r);}).catch(e=>o.onerror&&o.onerror({error:String(e)}));};
    window.GM_info={script:{version:'probe'}};
  });
  const src=fs.readFileSync(SCRIPT,'utf8');
  await page.evaluate(src);
  await new Promise(r=>setTimeout(r,3000));
  const struct=await page.evaluate(()=>{
    const q=s=>[...document.querySelectorAll(s)];
    const navs=q('#ocm-root .ocm-nav').map(n=>({t:(n.textContent||'').trim().slice(0,20),active:n.classList.contains('active')}));
    // find any subtab/pill rows
    const subSel=['.ocm-subtab','.ocm-war-tab','[class*="subtab"]','[class*="war-nav"] *','.ocm-war-nav *','.ocm-group-tab'];
    const found={};
    for(const s of subSel){const els=q(s);if(els.length)found[s]=els.slice(0,20).map(e=>(e.textContent||'').trim().slice(0,16)).filter(Boolean);}
    return {navs, subtabGroups:found};
  });
  console.log(JSON.stringify(struct,null,2));
  await b.disconnect();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
