'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.TORN_PLAYWRIGHT||'C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'../../..');
const source=fs.readFileSync(path.join(root,'script-hub/dist/Torn_Script_Hub.user.js'),'utf8');
const payout=fs.readFileSync(path.join(root,'Torn_War_Payout_Calculator.user.js'),'utf8');
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.TORN_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',headless:true});
 const failures=[];
 try{
  for(const layout of ['frostbite','workbench','torn','stock'])for(const [width,height,windowHeight] of [[1920,1080,450],[1920,1080,0],[390,844,0],[430,932,0],[844,390,0]]){
   const label=layout+' '+width+'x'+height+' window '+windowHeight;
   const page=await browser.newPage({viewport:{width,height}});
   try{
    await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><aside id="sidebar"><a href="/messages.php">Mail</a><a href="/page.php?sid=events">Events</a><a href="/page.php?sid=awards">Awards</a></aside></body></html>'}));
    await page.goto('https://www.torn.com/index.php');
    await page.evaluate(({layout,windowHeight})=>{
     localStorage.setItem('torn-script-hub:ui-theme:v1',JSON.stringify({layout}));
     localStorage.setItem('torn-script-hub:v2:preferences',JSON.stringify({window:{desktop:{mode:'custom',x:40,y:40,width:800,height:windowHeight}}}));
    },{layout,windowHeight});
    await page.evaluate(code=>(0,eval)(code),source);await page.click('#tsh-launcher');await page.click('[data-hub-view="themes"]');await settle(page);
    await page.getByText('Status and chart colors',{exact:true}).click();await page.getByText('Spacing and shape',{exact:true}).click();
    const slider=page.getByRole('slider',{name:'Text size',exact:true});await slider.focus();await settle(page);
    const before=await page.$eval('#tsh-dialog',n=>n.scrollTop);
    assert.ok(before>100,label+' fixture must be scrolled into the lower editor');
    await page.keyboard.press('ArrowRight');await page.evaluate(()=>{const n=document.createElement('div');n.textContent='Synthetic Torn page update';document.body.append(n);});await settle(page);
    const after=await page.$eval('#tsh-dialog',n=>n.scrollTop);
    try{assert.ok(after>=before-30,label+' preview scroll jumped: '+before+' -> '+after);}catch(error){failures.push(error.message);}
    assert.equal(await slider.inputValue(),'105');
    await slider.focus();await settle(page);
    const editingScroll=await page.$eval('#tsh-dialog',n=>n.scrollTop);
    await page.click('[data-hub-view="scripts"]');await page.click('.tsh-keep-editing');await settle(page);
    try{
     assert.equal(await slider.evaluate(n=>n===document.activeElement),true,layout+' Keep editing must return to the edited control');
     assert.ok(Math.abs(await page.$eval('#tsh-dialog',n=>n.scrollTop)-editingScroll)<2,layout+' Keep editing must restore editor scroll');
    }catch(error){failures.push(error.message);}
    assert.equal(await page.getByText('Status and chart colors',{exact:true}).evaluate(n=>n.parentElement.open),true,'expanded color section survives');
    if(width===390){const dir=path.join(__dirname,'artifacts/current');fs.mkdirSync(dir,{recursive:true});await page.locator('#tsh-dialog').screenshot({path:path.join(dir,'theme-scroll-'+layout+'-390.png')});}
    assert.equal(await slider.inputValue(),'105','unsaved draft survives the leave prompt');
    await page.click('[data-hub-view="scripts"]');await page.keyboard.press('Escape');await settle(page);
    try{
     assert.equal(await slider.evaluate(n=>n===document.activeElement),true,layout+' Escape returns focus to the edited control');
     assert.ok(Math.abs(await page.$eval('#tsh-dialog',n=>n.scrollTop)-editingScroll)<2,layout+' repeated Keep editing must retain the same scroll position');
    }catch(error){failures.push(error.message);}
    if(layout==='frostbite'&&width===1920&&windowHeight===450){
     await page.evaluate(code=>(0,eval)(code),payout);
     await page.click('[data-hub-view="settings"]');await page.click('.tsh-discard');
     await page.click('[data-settings-script="war-payout-calculator"]');await page.click('.tsh-script-appearance');
     await page.uncheck('.tsh-theme-follow input');await page.getByText('Spacing and shape',{exact:true}).click();
     await slider.focus();await page.keyboard.press('ArrowRight');await settle(page);
     const privateScroll=await page.$eval('#tsh-dialog',n=>n.scrollTop);
     await page.click('.tsh-back');await page.click('.tsh-keep-editing');await settle(page);
     try{
      assert.equal(await slider.evaluate(n=>n===document.activeElement),true,'Back prompt returns focus to the private appearance field');
      assert.ok(Math.abs(await page.$eval('#tsh-dialog',n=>n.scrollTop)-privateScroll)<2,'Back prompt preserves private appearance scroll');
     }catch(error){failures.push(error.message);}
    }
   }finally{await page.close();}
  }
  assert.deepEqual(failures,[]);
  console.log('PASS theme preview scroll, background reflow, repeat Keep editing/Escape focus and drafts across 20 layout/window/viewport combinations');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
