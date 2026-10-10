const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'Torn Gym Planner-3.36.txt');
const FIXTURE = path.join(__dirname, 'gym-local-live.html');
let liveStage = 'startup';

(async () => {
  let browser;
  let launched = false;
  try {
    liveStage = 'connect-existing';
    browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  } catch (_) {
    liveStage = 'launch-isolated';
    browser = await puppeteer.launch({
      headless: true,
      defaultViewport: null,
      executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      args: [
        `--user-data-dir=${path.join(ROOT, 'test', 'browser', 'gym-live-profile')}`,
        '--no-first-run', '--no-default-browser-check', '--disable-popup-blocking',
        '--window-position=0,0', '--window-size=1280,800', '--disable-gpu',
      ],
    });
    launched = true;
  }
  liveStage = 'create-context';
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  liveStage = 'load-fixture';
  const fixture = fs.readFileSync(FIXTURE, 'utf8')
    .replace(/\s*<script src="\/Torn%20Gym%20Planner-3\.36\.txt"><\/script>/g, '');
  await page.setContent(fixture, { waitUntil: 'domcontentloaded', timeout: 15000 });
  liveStage = 'seed-fixture';
  await page.evaluate(() => {
    GM_setValue('aio_battlestats', JSON.stringify({
      strength: 1000000, speed: 100000, defense: 80000, dexterity: 80000,
    }));
    GM_setValue('buildPath', 'baldr_str');
  });
  liveStage = 'inject-planner';
  await page.evaluate(fs.readFileSync(SCRIPT, 'utf8'), { timeout: 15000 });
  liveStage = 'wait-for-shell';
  await page.waitForSelector('.gg-wrap', { timeout: 10000 });

  liveStage = 'build-guidance';
  await page.click('[data-tab="plan"]');
  await page.click('[data-sub="plan-build"]');
  const buildText = await page.$eval('#gg-build-out', node => node.innerText);
  assert.match(buildText, /What to do next/i);
  assert.match(buildText, /How to get there/i);
  assert.match(buildText, /Gym 3000|Frontline Fitness|Balboas Gym/i);

  liveStage = 'gym-progress';
  await page.click('[data-sub="plan-gyms"]');
  await page.select('#gg-gym', '18');
  await page.$eval('#gg-gym-energy-spent', input => {
    input.value = '10000';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const tracker = await page.$eval('#gg-gyms-out', node => node.innerText);
  assert.match(tracker, /Estimated energy for the next gym/i);
  assert.match(tracker, /36,610E/i);
  assert.match(tracker, /26,610E estimated remaining/i);

  await page.select('#gg-gym', '24');
  const finalGymText = await page.$eval('#gg-gyms-out', node => node.innerText);
  assert.match(finalGymText, /final standard gym/i);
  assert.match(finalGymText, /no longer awards standard gym EXP/i);
  assert.equal(errors.length, 0, `live planner errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({ buildText: buildText.slice(0, 400), tracker: tracker.slice(0, 500), errors }, null, 2));

  await context.close();
  if (launched) await browser.close();
  else await browser.disconnect();
})().catch(error => { console.error(`Gym live test failed during ${liveStage}:`, error); process.exit(1); });
