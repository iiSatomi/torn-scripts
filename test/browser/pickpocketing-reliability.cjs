const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer-core');
const source = fs.readFileSync(path.resolve(__dirname,'../../Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js'),'utf8');
(async()=>{
    const browser = await puppeteer.connect({browserURL:'http://127.0.0.1:9222',defaultViewport:null});
    const page = await browser.newPage();
    try {
        await page.bringToFront();
        await page.goto(pathToFileURL(path.join(__dirname,'pickpocketing-helper-fixture.html')).href+'?virtual=1#/pickpocketing');
        await page.evaluate(()=>{
            localStorage.removeItem('ppColorsSettings_v2');localStorage.removeItem('ppColorsAttemptLog_v1');
            window.nativeCalls=[];window.releaseWrites=[];
            window.PDA_storage={get:async()=>null,set:(_,v)=>new Promise(resolve=>{window.nativeCalls.push(v);window.releaseWrites.push(resolve);})};
            document.querySelectorAll('.target-card').forEach((card,index)=>{
                const b=document.createElement('button');b.id='attempt-'+index;b.textContent='Pickpocket';card.append(b);
            });
        });
        await page.addScriptTag({content:source});
        await page.evaluate(()=>fetch('https://www.torn.com/page.php?sid=crimesData&step=crimesList'));
        await page.waitForSelector('#pp-helper');
        await page.waitForFunction(()=>window.nativeCalls.length===1);
        // A unresolved, then B: late A DOM must not label B successful.
        await page.click('#attempt-0');await page.click('#attempt-1');
        await page.evaluate(()=>{
            const a=document.createElement('div');a.textContent='SUCCESS Total value: $999';document.querySelectorAll('.target-card')[0].append(a);
            const b=document.createElement('div');b.textContent='FAIL';document.querySelectorAll('.target-card')[1].append(b);
        });
        await page.waitForFunction(()=>document.querySelector('#pp-insights-summary').textContent.includes('Last: Jogger · Failed'));
        await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
        const recovery=await page.evaluate(()=>JSON.parse(localStorage.getItem('ppColorsAttemptLog_v1')));
        assert.equal(recovery.events.length,2);
        assert.equal(recovery.events[0].outcome,'unknown');assert.equal(recovery.events[1].outcome,'fail');assert.equal(recovery.events[1].value,null);
        assert.equal(await page.evaluate(()=>window.nativeCalls.length),1,'native writes must be serialized');
        // Let the oldest empty write finish; recovery must retain both newer records.
        await page.evaluate(()=>window.releaseWrites[0]());
        await page.waitForFunction(()=>window.nativeCalls.length===2);
        assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ppColorsAttemptLog_v1')).events.length),2);
        // Explicit native sharing failure offers copyable data and a desktop download fallback.
        await page.click('#pp-open-insights');
        await page.evaluate(()=>{
            window.shareFile=async()=>{throw new Error('bridge unavailable')};
            window.downloads=[];
            HTMLAnchorElement.prototype.click=function(){window.downloads.push(this.download)};
        });
        await page.click('#pp-export-log');
        await page.waitForFunction(()=>window.downloads.length===1);
        assert.match(await page.$eval('#pp-export-text',el=>el.value),/Jogger/);
        console.log('PASS: delayed result identity; sibling evidence; serialized native writes; pagehide recovery; stale completion safety; export fallback.');
    } finally {await page.close();browser.disconnect();}
})().catch(e=>{console.error(e);process.exitCode=1});
