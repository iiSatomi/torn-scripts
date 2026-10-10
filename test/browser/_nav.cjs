const puppeteer=require('puppeteer-core');
(async()=>{
  const b=await puppeteer.connect({browserURL:'http://127.0.0.1:9222',defaultViewport:null});
  const pages=await b.pages();
  let page=pages.find(p=>p.url().includes('torn.com'))||pages[0];
  await page.goto('https://www.torn.com/factions.php?step=your#/tab=crimes',{waitUntil:'domcontentloaded',timeout:30000});
  await new Promise(r=>setTimeout(r,4500));
  const u=page.url();
  const info=await page.evaluate(()=>({
    login:/login\.php/i.test(location.href),
    hasFactionContent: !!document.querySelector('.faction-info, [class*="factions"], #factionsRoot, .content-wrapper'),
    title:document.title
  }));
  console.log(JSON.stringify({url:u,...info}));
  await b.disconnect();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
