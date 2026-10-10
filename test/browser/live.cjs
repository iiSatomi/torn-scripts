// Like smoke.cjs but STAYS CONNECTED: mounts the script, then waits for the user
// to paste their API key + Save & Load in the debug window (data fetch works
// because this Node process backs GM_xmlHttpRequest). Once data loads, walks
// every tab WITH real data and screenshots. Key never touches the chat.
const fs = require('fs'); const path = require('path');
const puppeteer = require('puppeteer-core');
const SCRIPT = process.argv[2] || 'C:\Users\asato\Desktop\Game Stuff\Torn Scripts\Torn_OC_Suite_PurrfectCrime.user.js';
const STORE = path.join(__dirname, 'store.json');
const SHOTS = path.join(__dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const TABS = ['home','crimes','people','consumables','war','armoury'];
const loadStore = () => { try { return JSON.parse(fs.readFileSync(STORE,'utf8')); } catch { return {}; } };
const sleep = ms => new Promise(r=>setTimeout(r,ms));

(async () => {
  const browser = await puppeteer.connect({ browserURL:'http://127.0.0.1:9222', defaultViewport:null });
  const pages = await browser.pages();
  const page = pages.find(p=>p.url().includes('factions.php')) || pages.find(p=>p.url().includes('torn.com')) || pages[0];
  console.log('Attached:', page.url());
  await page.setBypassCSP(true);
  const expose = async (n,f)=>{ try{ await page.exposeFunction(n,f); }catch(e){} };
  await expose('gmPersist', j=>{ try{ fs.writeFileSync(STORE,j);}catch(e){} });
  await expose('gmXhr', async o=>{ try{
    const c=new AbortController(); const t=o.timeout?setTimeout(()=>c.abort(),o.timeout):null;
    const res=await fetch(o.url,{method:o.method||'GET',headers:o.headers||{},body:o.data??undefined,signal:c.signal});
    if(t)clearTimeout(t); const text=await res.text();
    return {status:res.status,statusText:res.statusText,responseText:text,finalUrl:res.url,ok:true};
  }catch(e){ return {status:0,statusText:String(e),responseText:'',finalUrl:o.url,ok:false}; } });
  const errors=[];
  page.on('pageerror',e=>errors.push({kind:'pageerror',text:String(e)}));
  page.on('console',m=>{ if(m.type()==='error') errors.push({kind:'console',text:m.text()}); });

  const shim = (S0) => { const S=S0||{}; const persist=()=>{try{window.gmPersist(JSON.stringify(S));}catch(e){}};
    window.GM_getValue=(k,d)=>Object.prototype.hasOwnProperty.call(S,k)?S[k]:d;
    window.GM_setValue=(k,v)=>{S[k]=v;persist();}; window.GM_deleteValue=k=>{delete S[k];persist();};
    window.GM_listValues=()=>Object.keys(S);
    window.GM_addStyle=css=>{const e=document.createElement('style');e.textContent=css;document.head.appendChild(e);return e;};
    window.GM_info={script:{name:'OC Suite (live)',version:'0.0.0-live'}};
    const xhr=o=>{Promise.resolve(window.gmXhr({method:o.method,url:o.url,headers:o.headers,data:o.data,timeout:o.timeout}))
      .then(r=>{(r.ok||r.status)?o.onload&&o.onload(r):o.onerror&&o.onerror(r);})
      .catch(e=>o.onerror&&o.onerror({status:0,statusText:String(e),responseText:''}));};
    window.GM_xmlHttpRequest=xhr; window.GM_xmlhttpRequest=xhr; window.GM=window.GM||{}; window.GM.xmlHttpRequest=xhr;
    window.GM.getValue=async(k,d)=>window.GM_getValue(k,d); window.GM.setValue=async(k,v)=>window.GM_setValue(k,v);
    window.unsafeWindow=window; };
  await page.reload({waitUntil:'domcontentloaded'}).catch(()=>{});
  await sleep(3500);
  await page.evaluate(shim, loadStore());
  await page.evaluate(fs.readFileSync(SCRIPT,'utf8'));
  try{ await page.waitForSelector('#ocm-root',{timeout:15000}); console.log('✅ mounted'); }
  catch{ console.log('❌ did not mount'); }

  console.log('\n>>> In the debug Brave window: paste your Torn API key and click "Save & Load". Waiting up to 150s...');
  let haveKey=false;
  for (let i=0;i<50;i++){
    await sleep(3000);
    const st = await page.evaluate(()=>({
      key:String((window.GM_getValue&&window.GM_getValue('ocs_api_key',''))||'').length,
      loaded: !/Not loaded/i.test((document.querySelector('#ocm-root')||{}).innerText||'') ,
    })).catch(()=>({key:0,loaded:false}));
    if (st.key>0){ if(!haveKey){ console.log(`  key detected (len ${st.key}); letting data load...`); haveKey=true; } 
      if (st.loaded){ console.log('  data loaded.'); break; } }
    if (i%5===4) console.log(`  ...still waiting (${(i+1)*3}s)`);
  }
  if(!haveKey){ console.log('No key entered in time — walking first-run state anyway.'); }
  else { await sleep(4000); }

  const report={script:path.basename(SCRIPT),url:page.url(),haveKey,tabs:{},errors:[]};
  for (const tab of TABS){
    const before=errors.length;
    const nav=await page.evaluate(t=>{const n=document.querySelector(`#ocm-tabs .ocm-nav[data-tab="${t}"]`);if(!n)return false;n.click();return true;},tab).catch(()=>false);
    await sleep(1800);
    const info=await page.evaluate(t=>{const p=document.getElementById(`ocm-pane-${t}`);if(!p)return{exists:false};const x=(p.innerText||'').trim();return{exists:true,chars:x.length,sample:x.slice(0,90).replace(/\s+/g,' ')};},tab).catch(()=>({exists:false}));
    await page.screenshot({path:path.join(SHOTS,`data-${tab}.png`),fullPage:false}).catch(()=>{});
    report.tabs[tab]={navFound:nav,...info,newErrors:errors.length-before};
    console.log(`  [${tab}] nav=${nav} chars=${info.chars||0} errs=${errors.length-before} :: ${info.sample||''}`);
  }
  report.errors=errors.slice(0,40);
  fs.writeFileSync(path.join(__dirname,'live-report.json'),JSON.stringify(report,null,2));
  console.log(`\nTotal errors: ${errors.length}`);
  errors.slice(0,10).forEach(e=>console.log(`  • [${e.kind}] ${e.text.slice(0,160)}`));
  await browser.disconnect();
})().catch(e=>{console.error('HARNESS ERROR:',e);process.exit(1);});
