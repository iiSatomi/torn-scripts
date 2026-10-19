'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.TORN_PLAYWRIGHT||'C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../../..');
const source=fs.readFileSync(path.join(root,'script-hub/dist/Torn_Script_Hub.user.js'),'utf8');
async function main(){
 const browser=await chromium.launch({executablePath:process.env.TORN_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#24272c;font-family:Arial"><aside id="sidebar" style="width:180px"><div><a href="/messages.php">Mail</a><a href="/page.php?sid=events">Events</a><a href="/page.php?sid=awards">Awards</a></div></aside></body></html>'}));
  await page.goto('https://www.torn.com/index.php');
  await page.evaluate(()=>localStorage.setItem('torn-script-hub:ui-theme:v1',JSON.stringify({layout:'stock',palette:'stock',mode:'dark'})));
  await page.evaluate(code=>(0,eval)(code),source);
  assert.equal(await page.locator('#tsh-launcher [data-tsh-icon="hub"]').count(),1,'launcher has a distinct Hub identity');
  assert.equal(await page.locator('#tsh-launcher svg').evaluate(svg=>{const b=svg.getBBox(),v=svg.viewBox.baseVal;return b.x>=1&&b.y>=1&&b.x+b.width<=v.width-1&&b.y+b.height<=v.height-1;}),true,'logo leaves room for its strokes at launcher size');
  assert.equal(await page.locator('#tsh-launcher').getAttribute('data-tsui-layout'),'stock','saved launcher appearance applies before first opening');
  await page.click('#tsh-launcher');
  await page.evaluate(()=>{
   for(const [id,name,icon]of [['oc-demo','OC Suite','oc'],['gym-demo','Gym Planner','gym'],['bank-demo','Banker Request','bank'],['war-demo','War Payout Calculator','war']]){
    document.dispatchEvent(new CustomEvent('torn-script-hub:v1:register',{detail:JSON.stringify({id,name,icon,instance:id,url:location.href,actions:[{id:'open',label:'Open tool'},{id:'settings',label:'Settings'}]})}));
   }
  });
  const artifacts=path.join(__dirname,'artifacts/current');fs.mkdirSync(artifacts,{recursive:true});
  for(const layout of ['frostbite','workbench','torn','stock'])for(const mode of ['dark','light']){
   await page.click('[data-hub-view="themes"]');await page.click('[data-layout="'+layout+'"]');await page.selectOption('.tsh-theme-palette',layout);await page.selectOption('.tsh-theme-mode',mode);await page.click('.tsh-theme-save');
   await page.waitForFunction(()=>document.querySelector('.tsh-theme-message').textContent==='Theme saved.');
   assert.equal(await page.locator('#tsh-launcher').getAttribute('data-tsui-mode'),mode,'launcher follows appearance mode');
   assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#tsh-launcher')).color===getComputedStyle(document.querySelector('#tsh-dialog')).getPropertyValue('--tsui-accent').trim()||document.querySelector('#tsh-launcher').style.getPropertyValue('--tsui-accent')===document.querySelector('#tsh-dialog').style.getPropertyValue('--tsui-accent')),true,'launcher inherits palette');
   await page.click('[data-hub-view="scripts"]');
   for(const [width,height]of [[1920,1080],[390,844],[430,932],[844,390]]){
    await page.setViewportSize({width,height});await page.waitForFunction(()=>{const r=document.querySelector('#tsh-dialog').getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;});
    assert.equal(await page.locator('#tsh-dialog').evaluate(n=>n.scrollWidth>n.clientWidth+1),false,layout+' '+mode+' fits '+width);
    const tile=page.locator('.tsh-tile').first();
    if(layout==='frostbite')assert.equal(await tile.evaluate(n=>{const a=n.getBoundingClientRect(),b=n.querySelector('.tsh-tile-controls').getBoundingClientRect();return b.bottom<=a.bottom+1&&parseFloat(getComputedStyle(n).borderTopWidth)>0;}),true,'Frostbite controls belong to one bordered card');
    if(width<=600||height<=500)assert.equal(await page.locator('.tsh-pin').first().evaluate(n=>n.getBoundingClientRect().height>=44),true,'favorite retains a touch target');
    await page.locator('.tsh-pin').first().focus();await page.keyboard.press('Space');
    assert.equal(await page.locator('.tsh-pin').first().getAttribute('aria-pressed'),'true');
    await page.keyboard.press('Space');
    if(mode==='dark'&&(width===1920||width===390))await page.locator('#tsh-dialog').screenshot({path:path.join(artifacts,'hub-polish-'+layout+'-'+width+'.png')});
   }
   await page.setViewportSize({width:1920,height:1080});
  }
  await page.click('[data-hub-view="themes"]');
  const saved=await page.locator('#tsh-launcher').getAttribute('style');
  await page.selectOption('.tsh-theme-palette','frostbite');await page.selectOption('.tsh-theme-mode','dark');
  assert.notEqual(await page.locator('#tsh-launcher').getAttribute('style'),saved,'launcher previews the appearance draft');
  await page.click('.tsh-theme-cancel');assert.equal(await page.locator('#tsh-launcher').getAttribute('style'),saved,'Cancel restores the launcher too');
  await page.goto('https://www.torn.com/index.php');
  const modules=['script-hub-theme.cjs','script-hub-ui-kit.cjs'].map(file=>fs.readFileSync(path.join(root,'script-hub/src',file),'utf8').replace(/^module\.exports[^\n]*$/m,'')).join('\n');
  await page.addScriptTag({content:modules+'\nwindow.makeUI=createTornScriptUI;window.applyUI=applyScriptUiTheme;'});
  await page.evaluate(()=>{
   const content=document.createElement('div');content.innerHTML='<label>Draft <input value="keep this draft"></label><button class="tsui-primary">Calculate</button><button disabled>Unavailable</button>';
   window.input=content.querySelector('input');window.tool=makeUI({doc:document,win:window,title:'Control states',applyTheme:applyUI,theme:{layout:'frostbite',mode:'dark'},sections:[{id:'main',label:'Main',node:content}]});
  });
  const primary=page.locator('.tsui-primary'),disabled=page.getByRole('button',{name:'Unavailable'});
  const normal=await primary.evaluate(n=>getComputedStyle(n).backgroundColor);await primary.hover();
  assert.equal(await primary.evaluate(n=>getComputedStyle(n).backgroundColor),normal,'primary hover preserves action contrast');
  assert.ok(Number(await disabled.evaluate(n=>getComputedStyle(n).opacity))<1,'unavailable action is visually distinct');
  await primary.focus();assert.notEqual(await primary.evaluate(n=>getComputedStyle(n).outlineStyle),'none','keyboard action has visible focus');
  await page.evaluate(()=>{tool.setTheme({layout:'stock',mode:'light'});tool.setTheme({layout:'workbench',mode:'dark'});});
  assert.equal(await page.evaluate(()=>input===tool.root.querySelector('input')&&input.value==='keep this draft'),true,'polish preserves script-owned content');
  await page.evaluate(()=>tool.destroy());assert.deepEqual(errors,[]);
  console.log('PASS Hub identity, palette preview/Cancel, integrated cards, keyboard/touch controls, 32 layout/mode/viewport combinations and universal control states');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
