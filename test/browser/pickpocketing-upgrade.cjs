const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const puppeteer = require('puppeteer-core');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js'), 'utf8');
(async () => {
    const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
    const reports = [];
    try {
        for (const [width, height] of [[1920,1080],[390,844],[430,932],[844,390]]) {
            const page = await browser.newPage();
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            try {
                await page.setViewport({ width, height, isMobile: width < 900, hasTouch: width < 900 });
                await page.bringToFront();
                await page.goto(pathToFileURL(path.join(__dirname, 'pickpocketing-helper-fixture.html')).href + '?virtual=1#/pickpocketing');
                await page.evaluate(() => {
                    localStorage.removeItem('ppColorsSettings_v2');
                    localStorage.removeItem('ppColorsAttemptLog_v1');
                    window.nativeWrites = [];
                    window.PDA_storage = {
                        get: () => new Promise(resolve => { window.resolveHistory = resolve; }),
                        set: async (_, value) => { window.nativeWrites.push(structuredClone(value)); },
                    };
                    const button = document.createElement('button');
                    button.textContent = 'Pickpocket';
                    document.querySelector('.target-card').append(button);
                });
                await page.addScriptTag({ content: source });
                await page.evaluate(() => fetch('https://www.torn.com/page.php?sid=crimesData&step=crimesList'));
                await page.waitForSelector('#pp-target-search', { timeout: 3000 });
                // Capture while native history is still loading; unrelated body prose must not win.
                await page.click('.target-card button');
                await page.evaluate(() => {
                    const outside = document.createElement('p'); outside.textContent = 'CRITICAL failure elsewhere'; document.body.append(outside);
                    const result = document.createElement('div'); result.className = 'result___fixture'; result.textContent = 'SUCCESS';
                    const value = document.createElement('span'); value.textContent = 'Total value: $36,699';
                    document.querySelector('.target-card').append(result, value);
                    document.querySelector('.skill').setAttribute('aria-label', 'Skill: 70.02');
                });
                await page.waitForFunction(() => document.querySelector('#pp-attempt-feedback').textContent.includes('+0.02'));
                assert.match(await page.$eval('.pp-card-feedback', el=>el.textContent), /SUCCESS.*\+0\.02/);
                assert.ok(await page.$eval('.pp-card-feedback', el=>el.getBoundingClientRect().height<80));
                await page.evaluate(() => window.resolveHistory({ events: [{ at: Date.now()-86400000, mark:'Student', status:'Phone', outcome:'fail', skillDelta:0 }]}));
                await page.waitForFunction(() => window.nativeWrites.at(-1)?.events.length === 2);
                const captured = await page.evaluate(() => window.nativeWrites.at(-1).events.at(-1));
                assert.equal(captured.outcome, 'success'); assert.equal(captured.value, 36699); assert.equal(captured.skillDelta, .02);
                await page.click('#pp-open-insights');
                assert.equal(await page.$eval('#pp-open-insights',el=>getComputedStyle(el).backgroundColor),'rgb(38, 61, 51)','active navigation must be visibly selected');
                await page.waitForSelector('#pp-daily-chart', { visible: true });
                assert.equal(await page.$eval('#pp-recent-attempts', el => el.children.length), 2);
                await page.evaluate(() => {
                    window.sharedFiles = [];
                    window.__PDA_platformReadyPromise = Promise.resolve();
                    window.flutter_inappwebview = { callHandler: async (name, args) => { window.sharedFiles.push({ name, ...args }); return { status:'success' }; } };
                });
                await page.click('#pp-export-log');
                await page.waitForFunction(() => window.sharedFiles.length === 1);
                const csv = await page.evaluate(() => new TextDecoder().decode(Uint8Array.from(atob(window.sharedFiles[0].base64Data), c=>c.charCodeAt(0))));
                assert.match(csv, /Visible Skill Change/); assert.match(csv, /36699/);
                await page.click('#pp-backup-log');
                await page.waitForFunction(() => window.sharedFiles.length === 2);
                await page.evaluate(() => {
                    const data = new TextDecoder().decode(Uint8Array.from(atob(window.sharedFiles[1].base64Data), c=>c.charCodeAt(0)));
                    const transfer = new DataTransfer(); transfer.items.add(new File([data], 'backup.json', { type:'application/json' }));
                    const input = document.querySelector('#pp-import-file'); input.files=transfer.files; input.dispatchEvent(new Event('change', { bubbles:true }));
                });
                await page.waitForFunction(() => document.querySelector('#pp-insights-summary').textContent.includes('2 unique attempts'));
                for (const period of ['today','month','all','week']) await page.click(`[data-insight-period="${period}"]`);
                await page.screenshot({ path: path.join(__dirname, 'shots', `pickpocket-2.0-${width}.png`), fullPage: true });
                const layout = await page.evaluate(() => ({ width:document.documentElement.scrollWidth, right:document.querySelector('#pp-helper').getBoundingClientRect().right,
                    buttons: [...document.querySelectorAll('#pp-helper button')].filter(el=>el.getClientRects().length).map(el=>el.getBoundingClientRect().height) }));
                assert.ok(layout.width <= width + 1, `overflow ${width}: ${layout.width}`);
                assert.ok(layout.right <= width + 1);
                if(width<900) assert.ok(Math.min(...layout.buttons)>=44, `small button: ${Math.min(...layout.buttons)}`);
                await page.click('[data-helper-view="targets"]');
                await page.type('#pp-target-search', 'nobody');
                await page.waitForFunction(() => document.querySelector('#pp-target-count').textContent.includes('0 shown'));
                await page.click('#pp-reset-filters');
                await page.waitForFunction(() => document.querySelector('#pp-target-count').textContent.includes('6 shown'));
                await page.click('[data-helper-view="settings"]');
                await page.click('[data-ui-mode="torn"]');
                await page.waitForFunction(() => !document.querySelector('.pp-helper-meta'));
                await page.click('#pp-open-insights');
                assert.equal(await page.$eval('#pp-insights-dashboard', el=>el.hidden), false);
                await page.click('[data-helper-view="settings"]');
                await page.click('[data-ui-mode="helper"]');
                await page.waitForSelector('.pp-helper-meta');
                await page.click('[data-helper-view="targets"]');
                await page.click('.target-card button');
                await page.evaluate(() => {
                    const result = document.createElement('div'); result.textContent='FAIL'; document.querySelector('.target-card').append(result);
                });
                await page.waitForFunction(() => document.querySelector('#pp-attempt-feedback').textContent.includes('FAIL'));
                await page.evaluate(() => { document.querySelector('.skill').remove(); location.hash='#/burglary'; });
                await page.waitForFunction(() => !document.querySelector('#pp-helper'));
                await page.waitForFunction(() => window.nativeWrites.at(-1)?.events.length === 3);
                const last = await page.evaluate(() => window.nativeWrites.at(-1).events.at(-1));
                assert.equal(last.skillDelta, null);
                assert.deepEqual(errors, []);
                reports.push({ width, height, attempts:3, overflow:false, errors });
            } finally { await page.close(); }
        }
        console.log(JSON.stringify(reports, null, 2));
    } finally { browser.disconnect(); }
})().catch(e=> { console.error(e); process.exitCode=1; });
