const fs=require('fs'), path=require('path');
const puppeteer=require('puppeteer-core');
const SCRIPT='C:/Users/asato/Desktop/Game Stuff/Torn Scripts/Torn_OC_Suite_PurrfectCrime.user.js';
const STORE=path.join(__dirname,'store.json');
const loadStore=()=>{try{return JSON.parse(fs.readFileSync(STORE,'utf8'))}catch{return{}}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await puppeteer.connect({browserURL:'http://127.0.0.1:9222',defaultViewport:null});
  const pages=await b.pages(); let page=pages.find(p=>p.url().includes('torn.com'))||pages[0];
  const errors=[];
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,200));});
  page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message.slice(0,200)));
  await page.setBypassCSP(true);
  const expose=async(n,f)=>{try{await page.exposeFunction(n,f)}catch{}};
  await expose('gmPersist',j=>{try{fs.writeFileSync(STORE,j)}catch{}});
  await expose('gmXhr',async(opts)=>{try{const c=new AbortController();const t=opts.timeout?setTimeout(()=>c.abort(),opts.timeout):null;const r=await fetch(opts.url,{method:opts.method||'GET',headers:opts.headers||{},body:opts.data||undefined,signal:c.signal});if(t)clearTimeout(t);const text=await r.text();return{status:r.status,responseText:text,responseHeaders:''}}catch(e){return{status:0,responseText:'',error:String(e)}}});
  const store=loadStore();
  await page.evaluate((s)=>{window.__store=s;},store);
  await page.evaluate(()=>{
    const S=window.__store||{};
    window.GM_getValue=(k,d)=>k in S?S[k]:d;
    window.GM_setValue=(k,v)=>{S[k]=v;window.gmPersist(JSON.stringify(S));};
    window.GM_deleteValue=(k)=>{delete S[k];window.gmPersist(JSON.stringify(S));};
    window.GM_addStyle=(css)=>{const e=document.createElement('style');e.textContent=css;document.head.appendChild(e);};
    window.GM_xmlhttpRequest=(o)=>{window.gmXhr({url:o.url,method:o.method,headers:o.headers,data:o.data,timeout:o.timeout}).then(r=>{if(r.error&&o.onerror)o.onerror(r);else if(o.onload)o.onload(r);}).catch(e=>o.onerror&&o.onerror({error:String(e)}));};
    window.GM_info={script:{version:'probe'}};
  });
  await page.evaluate(fs.readFileSync(SCRIPT,'utf8'));
  await sleep(3000);
  const results=[];
  const navCount=await page.evaluate(()=>document.querySelectorAll('#ocm-root .ocm-nav').length);
  for(let ni=0;ni<navCount;ni++){
    const navName=await page.evaluate((i)=>{const n=document.querySelectorAll('#ocm-root .ocm-nav')[i];n.click();return (n.textContent||'').trim().slice(0,16);},ni);
    await sleep(1400);
    // war group toggle: click each group if present
    const groups=await page.evaluate(()=>[...document.querySelectorAll('#ocm-root .ocm-war-group-tab, #ocm-root [class*="group-tab"]')].map(e=>(e.textContent||'').trim().slice(0,12)));
    const doSubs=async(label)=>{
      const subN=await page.evaluate(()=>document.querySelectorAll('#ocm-root .ocm-subtab').length);
      for(let si=0;si<subN;si++){
        const errBefore=errors.length;
        const info=await page.evaluate((i)=>{const subs=document.querySelectorAll('#ocm-root .ocm-subtab');const s=subs[i];if(!s)return null;const name=(s.textContent||'').trim().slice(0,18);s.click();return {name};},si);
        if(!info)continue;
        await sleep(700);
        const chars=await page.evaluate(()=>{const a=document.querySelector('#ocm-root .ocm-subpane.active');return a?(a.textContent||'').length:0;});
        const newErrs=errors.slice(errBefore);
        results.push({nav:navName,group:label,sub:info.name,chars,errs:newErrs.length,errText:newErrs.slice(0,2)});
      }
    };
    if(groups.length){
      for(let gi=0;gi<groups.length;gi++){
        await page.evaluate((i)=>{const g=document.querySelectorAll('#ocm-root .ocm-war-group-tab, #ocm-root [class*="group-tab"]')[i];if(g)g.click();},gi);
        await sleep(900);
        await doSubs(groups[gi]);
      }
    } else {
      await doSubs('');
    }
  }
  console.log(JSON.stringify({totalErrors:errors.length,results},null,2));
  await b.disconnect();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
