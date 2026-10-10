const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer-core');
const source = fs.readFileSync(path.resolve(process.argv[2] || 'Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js'), 'utf8');
(async () => {
    const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
    try {
        for (const [width, height] of [[1920,1080],[390,844],[430,932],[844,390]]) {
            const page = await browser.newPage();
            try {
                await page.setViewport({ width, height, isMobile:width<900, hasTouch:width<900 });
                await page.bringToFront();
                await page.goto(pathToFileURL(path.join(__dirname,'pickpocketing-helper-fixture.html')).href+'?virtual=1#/pickpocketing');
                await page.evaluate(() => {
                    localStorage.removeItem('ppColorsSettings_v2'); localStorage.removeItem('ppColorsAttemptLog_v1');
                    const button = document.createElement('button'); button.id='real-pickpocket'; button.innerHTML='PICKPOCKET <span>5</span>';
                    document.querySelector('.target-card').append(button);
                });
                await page.addScriptTag({content:source});
                await page.waitForSelector('#pp-helper');
                for (let i=0;i<4;i++) {
                    await page.click('#pp-helper-toggle');
                    assert.equal(await page.$eval('#pp-attempt-feedback',el=>el.hidden),true,`${width}: menu click started a false attempt`);
                }
                await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
                assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ppColorsAttemptLog_v1')||'{}').events?.length||0),0);
                await page.click('#real-pickpocket');
                await page.waitForFunction(()=>document.querySelector('#pp-attempt-feedback').textContent.includes('ATTEMPT SENT'));
                // Minimizing during an actual pending attempt must not replace it.
                await page.click('#pp-helper-toggle');
                await page.evaluate(()=>{
                    const result=document.createElement('div'); result.textContent='SUCCESS Total value: $123'; document.querySelector('.target-card').append(result);
                });
                await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ppColorsAttemptLog_v1')||'{}').events?.length===1);
                const event=await page.evaluate(()=>JSON.parse(localStorage.getItem('ppColorsAttemptLog_v1')).events[0]);
                assert.equal(event.mark,'Drunk man'); assert.equal(event.outcome,'success'); assert.equal(event.value,123);
                console.log(`PASS ${width}x${height}: menu toggles never create or replace attempts; real action logged once`);
            } finally { await page.close(); }
        }
    } finally { browser.disconnect(); }
})().catch(error=>{console.error(error);process.exitCode=1});
