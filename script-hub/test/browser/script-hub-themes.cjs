const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.TORN_PLAYWRIGHT||'C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=path.resolve(__dirname, '../../..');
const source=fs.readFileSync(path.join(base,'script-hub/dist/Torn_Script_Hub.user.js'),'utf8');
const moduleSource=file=>fs.readFileSync(path.join(base,'script-hub/src',file),'utf8').replace(/^module\.exports[^\n]*$/m,'');
const artifacts=path.join(__dirname,'artifacts/current');fs.mkdirSync(artifacts,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.TORN_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.log('Browser error:',error.message);});
  await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><head></head><body><div id="sidebar"><div><a href="/messages.php">Mail</a><a href="/page.php?sid=events">Events</a><a href="/page.php?sid=awards">Awards</a></div></div></body></html>'}));
  await page.setViewportSize({width:1920,height:1080});await page.goto('https://www.torn.com/gym.php',{waitUntil:'domcontentloaded'});console.log('Fixture loaded');
  await page.evaluate(code=>(0,eval)(code),source);console.log('Hub evaluated');await page.waitForSelector('#tsh-launcher');await page.click('#tsh-launcher');console.log('Hub opened');
  await page.click('[data-hub-view="themes"]');await page.waitForSelector('.tsh-themes');console.log('Themes editor mounted');
  assert.equal(await page.$eval('#tsh-dialog',n=>n.dataset.tsuiLayout),'frostbite');
  await page.click('.tsh-theme-layout[data-layout="workbench"]');
  assert.equal(await page.$eval('.tsh-theme-palette',n=>n.value),'frostbite','layout does not change palette');
  await page.selectOption('.tsh-theme-mode','dark');
  await page.$eval('[data-color-role="accent"]',input=>{input.value='#eeaa55';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.click('[data-hub-view="scripts"]');await page.waitForSelector('.tsh-discard-confirm');
  await page.click('.tsh-keep-editing');
  assert.equal(await page.$eval('[data-color-role="accent"]',input=>input.value),'#eeaa55');
  await page.click('.tsh-theme-save');console.log('Save status:',await page.$eval('.tsh-theme-message',n=>n.textContent));await page.waitForFunction(()=>document.querySelector('.tsh-theme-message').textContent==='Theme saved.');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('torn-script-hub:ui-theme:v1')));
  assert.equal(stored.layout,'workbench');assert.equal(stored.palette,'frostbite');assert.equal(stored.colors.dark.accent,'#eeaa55');
  await page.click('.tsh-theme-layout[data-layout="torn"]');await page.click('.tsh-theme-cancel');
  assert.equal(await page.$eval('#tsh-dialog',n=>n.dataset.tsuiLayout),'workbench');
  await page.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='torn-script-hub:ui-theme:v1')throw new Error('test quota');return window.originalSet.call(this,k,v);};});
  await page.click('.tsh-theme-layout[data-layout="torn"]');await page.click('.tsh-theme-save');
  await page.waitForFunction(()=>document.querySelector('.tsh-theme-message').textContent.includes('could not be saved'));
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalSet;});await page.click('.tsh-theme-cancel');
  await page.click('.tsh-theme-stock-preset');
  assert.equal(await page.$eval('#tsh-dialog',n=>n.dataset.tsuiLayout),'stock');
  assert.equal(await page.$eval('.tsh-theme-palette',n=>n.value),'stock');
  assert.equal(await page.$eval('.tsh-theme-mode',n=>n.value),'dark');
  await page.click('.tsh-theme-save');await page.waitForFunction(()=>document.querySelector('.tsh-theme-message').textContent==='Theme saved.');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('torn-script-hub:ui-theme:v1')).layout),'stock');
  for(const layout of ['frostbite','workbench','torn','stock']){
   await page.click('.tsh-theme-layout[data-layout="'+layout+'"]');
   for(const [width,height]of [[1920,1080],[390,844],[430,932],[844,390]]){console.log('Viewport',layout,width,height);
    await page.setViewportSize({width,height});
    await page.waitForFunction(()=>{const r=document.getElementById('tsh-dialog').getBoundingClientRect();return r.right<=innerWidth+1&&r.bottom<=innerHeight+1;});
    const overflow=await page.$eval('.tsh-themes',n=>n.scrollWidth>n.clientWidth+1);assert.equal(overflow,false,layout+' '+width+' theme overflow');
    await (await page.$('#tsh-dialog')).screenshot({path:path.join(artifacts,'script-hub-theme-'+layout+'-'+width+'.png')});
   }
  }
  // Exercise asynchronous editor work separately with controlled, harmless files.
  await page.setViewportSize({width:1200,height:1000});await page.goto('https://www.torn.com/index.php');
  const modules=['script-hub-theme.cjs','script-hub-themes-ui.cjs'].map(moduleSource).join('\n');
  await page.evaluate(code=>(0,eval)(code+'\nwindow.makeThemeEditor=renderHubThemes;window.normTheme=normalizeScriptUiTheme;window.resolveTheme=resolveScriptUiTheme;'),modules);
  await page.evaluate(()=>{
   window.savedTheme=null;window.previewTheme=null;
   window.editor=window.makeThemeEditor({doc:document,win:window,normalize:window.normTheme,resolve:window.resolveTheme,value:{},presets:[],onPreview:value=>{window.previewTheme=value;},onSave:async value=>{if(window.deferSave)await new Promise(r=>{window.completeThemeSave=r;});window.savedTheme=value;return true;}});
   document.body.append(window.editor.element);
   const file={size:100,text:()=>new Promise(resolve=>{window.completeImport=resolve;})};Object.defineProperty(document.querySelector('.tsh-theme-import'),'files',{configurable:true,get:()=>[file]});
   document.querySelector('.tsh-theme-import').dispatchEvent(new Event('change'));
  });
  await page.click('.tsh-theme-cancel');
  await page.evaluate(()=>window.completeImport(JSON.stringify({kind:'torn-script-ui-theme',version:1,theme:{layout:'workbench'}})));
  assert.equal(await page.evaluate(()=>window.previewTheme.layout),'frostbite','late import cannot override Cancel');
  await page.click('.tsh-theme-layout[data-layout="workbench"]');await page.evaluate(()=>{window.deferSave=true;});await page.click('.tsh-theme-save');
  await page.evaluate(()=>document.querySelector('.tsh-theme-import').dispatchEvent(new Event('change')));
  await page.evaluate(()=>window.completeThemeSave());await page.waitForFunction(()=>!document.querySelector('.tsh-theme-save').disabled);
  assert.equal(await page.evaluate(()=>window.editor.isDirty()),false,'import cannot invalidate successful save');
  await page.click('.tsh-theme-cancel');assert.equal(await page.evaluate(()=>window.previewTheme.layout),'workbench');
  await page.evaluate(()=>window.editor.destroy());assert.deepEqual(errors,[]);
  console.log('PASS four Hub theme styles, Stock Mgr defaults, independent palettes, save/cancel, quota recovery, 16 viewport/layout combinations and async import/save races');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
