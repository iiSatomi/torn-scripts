const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core');
const source=fs.readFileSync(path.resolve(__dirname,'../../Torn_OC_Suite_Codex.user.js'),'utf8');
const block=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const nav=block('  const OCM_NAV =','  // OCUI');
const root=block('  function buildRoot()','\n  // ─── RENDER');
const tabs=block('  function initTabs()','\n  /** Pulls (N)');
const cssStart=source.indexOf('  GM_addStyle(`');
const css=source.slice(cssStart+'  GM_addStyle(`'.length,source.indexOf('\n  `);',cssStart));
(async()=>{
 const browser=await puppeteer.launch({executablePath:'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<style>body{margin:8px;background:#202733}</style>');await page.addStyleTag({content:css});
  await page.evaluate(({nav,root,tabs})=>{
   const setup=`const SCRIPT_VERSION='fixture',CPR_WARN=70,CPR_CRIT=50,WEIGHT_HIGH=70,WEIGHT_MID=40,REFRESH_S=60,MIN_PER_DIFF=1;
    const loadShareByDiff=()=>({});const saved={active:'money'};const GMK={ACTIVE_TAB:'active',SUBTAB_PREFIX:'sub:'};const GM_getValue=(k,d)=>saved[k]??d;const GM_setValue=(k,v)=>saved[k]=v;`;
   new Function(setup+nav+root+tabs+`document.body.appendChild(buildRoot());document.getElementById('ocm-body').style.display='block';initTabs();window.navTest={saved};`)();
  },{nav,root,tabs});
  assert.ok(await page.$('#ocm-tab-money'),'Finance must be reachable');
  assert.equal(await page.$eval('.ocm-tab.active',el=>el.dataset.tab),'money','Saved Finance survives initialization');
  const mainTabs=await page.$$eval('#ocm-tabs .ocm-tab',els=>els.map(el=>el.dataset.tab));
  for(const tab of mainTabs){
   await page.click('#ocm-tab-'+tab);
   assert.equal(await page.$eval('#ocm-pane-'+tab,el=>el.getAttribute('aria-hidden')),'false');
   const subs=await page.$$eval('#ocm-pane-'+tab+' .ocm-subtab',els=>els.map(el=>el.dataset.sub));
   for(const sub of subs){await page.click(`#ocm-pane-${tab} [data-sub="${sub}"]`);assert.equal(await page.$eval('#ocm-sub-'+sub,el=>el.getAttribute('aria-hidden')),'false');}
  }
  await page.evaluate(()=>{window.warOpened=0;document.getElementById('ocm-tab-war').addEventListener('click',()=>warOpened++);});
  await page.focus('#ocm-tab-war');await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>warOpened),1,'Keyboard activation invokes lazy tab loader');
  await page.click('#ocm-tab-crimes');await page.click('[data-sub="fill"]');
  await page.click('[data-suite-tab="people"][data-suite-sub="blocked"]');
  assert.equal(await page.$eval('#ocm-sub-blocked',el=>el.getAttribute('aria-hidden')),'false');
  await page.click('#ocm-tab-crimes');
  await page.evaluate(()=>{document.getElementById('ocm-stats-bar').style.display='';document.querySelectorAll('.ocm-stat-value').forEach((el,i)=>el.textContent=[12,8,5,2,1,0][i]);document.getElementById('ocm-available').innerHTML='<p>5 members available. Choose a member below to compare open roles.</p>';});
  for(const [width,height]of [[1920,1080],[390,844],[430,932],[844,390]]){
   await page.setViewport({width,height});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Page overflow '+width);
   await page.screenshot({path:path.join(__dirname,`shots/crimes-navigation-${width}.png`),fullPage:true});
  }
  assert.deepEqual(errors,[]);console.log('Navigation browser checks passed: main/static subtabs, saved Finance, keyboard loader, cross-links, four viewports.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
