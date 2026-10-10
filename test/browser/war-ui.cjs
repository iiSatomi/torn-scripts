const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const source = fs.readFileSync(path.resolve(__dirname, '../../Torn_OC_Suite_Codex.user.js'), 'utf8');
const slice = (a,b) => source.slice(source.indexOf(a),source.indexOf(b));
const region = slice('  const _selStyle', '  function warRenderTab()') +
  slice('  function warRenderReport(', '  // ── Drugs tab') +
  slice('  async function warSelectWar(', '  async function warPullReport(');
(async()=>{
  const browser = await puppeteer.launch({executablePath:'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',headless:true});
  try {
    const page = await browser.newPage(); const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setContent('<style>body{font:14px Arial;background:#14202c;color:white;margin:12px}#ocm-pane-war{max-width:1100px;margin:auto}table{width:100%}td,th{padding:8px}button,input,select{background:#25394b;color:white;border:1px solid #64849b;border-radius:6px}button{cursor:pointer}</style><div id="ocm-pane-war"><div id="ocm-war-status"></div><div id="ocm-war-tabcontent"></div></div>');
    await page.evaluate(region=>{
      const OCUI={esc:v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),grid:s=>'<div>'+s+'</div>',statTile:o=>`<span style="display:inline-block;padding:12px">${o.label}: ${o.value}</span>`,card:o=>`<section><h3>${o.title}</h3>${o.body}</section>`};
      const TWPR={cacheLoad:()=>Promise.resolve(null),refreshDrugReport:v=>v};
      new Function('OCUI','TWPR','_num','_fmt2','_nameLink','_pillStyle','_btnStyle',region+`
        function warRenderTab(){warRenderReport(document.getElementById('ocm-war-tabcontent'));}
        document.getElementById('ocm-pane-war').insertAdjacentHTML('afterbegin',_warWorkspaceStyle());
        window.warTest={state:_warState,ui:_warUi,render:warRenderTab,rows:_warReportRows,select:warSelectWar,api:TWPR,copy:_warCopy,csv:_warBuildDelimited,guide:warRenderGuide};
      `)(OCUI,TWPR,String,String,(name)=>OCUI.esc(name),'','');
      warTest.state.report={totalHits:90,totalLosses:3,totalEnemyOn:2,totalStealthOn:1,totalRespect:100,list:Array.from({length:62},(_,i)=>({id:i+1,name:'Member '+i,wins:i+1,lossAll:2,lossEnemy:1,enemyOn:1,stealthOn:0,defHeld:0,stalemates:0,assists:0,respect:2,offLost:0}))};
      warTest.render();
    },region);
    assert.equal(await page.$$eval('tbody tr',e=>e.length),25);
    assert.equal(await page.evaluate(()=>warTest.rows().length),62,'Export spans pages');
    await page.click('#ocm-war-next');await page.click('#ocm-war-next');
    assert.equal(await page.$$eval('tbody tr',e=>e.length),12);
    await page.type('#ocm-war-search','Member 61');
    assert.equal(await page.$$eval('tbody tr',e=>e.length),1);
    assert.equal(await page.evaluate(()=>warTest.rows().length),1);
    await page.evaluate(()=>{warTest.ui.query='';warTest.ui.page=0;warTest.render();});
    await page.select('#ocm-war-sort','wins');await page.click('#ocm-war-direction');
    assert.equal(await page.$eval('tbody tr td',e=>e.textContent),'Member 0');
    for(const [width,height] of [[1920,1080],[390,844],[430,932],[844,390]]){
      await page.setViewport({width,height});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Overflow '+width);
      if(width<900)assert.ok(await page.$eval('#ocm-war-search',e=>e.getBoundingClientRect().height)>=44);
      await page.screenshot({path:path.join(__dirname,`shots/war-${width}.png`),fullPage:true});
    }
    await page.evaluate(async()=>{
      const {state,api,select}=warTest;let resolve;
      state.wars=[{warId:1,oppName:'First'},{warId:2,oppName:'Second'}];state.report=null;
      api.cacheLoad=id=>id===1?new Promise(r=>resolve=r):Promise.resolve(null);
      const first=select(0);await select(1);resolve({report:{list:[]}});await first;
      if(state.war.warId!==2||state.report!==null)throw Error('Stale cache replaced current war');
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(Error('Denied'))}});
      document.execCommand=()=>false;warTest.copy('fixture');
    });
    await page.waitForFunction(()=>document.getElementById('ocm-war-status').textContent.includes('Copy failed'));
    assert.deepEqual(errors,[]);
    console.log('War browser checks passed: sorting, search, paging, exports across pages, stale cache protection, clipboard failure, four viewport sizes.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
