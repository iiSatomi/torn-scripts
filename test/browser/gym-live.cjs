const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'Torn Gym Planner-3.36.txt');
const SHOT = path.join(__dirname, 'shots', 'gym-planner-live-flying.png');

(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find(candidate => candidate.url().includes('torn.com/gym.php'));
  assert.ok(page, 'No live Torn gym.php tab was found');

  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  const before = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    traveling: document.body?.dataset.traveling || null,
    abroad: document.body?.dataset.abroad || null,
    contentWrapper: !!document.querySelector('.content-wrapper'),
  }));

  await page.evaluate(() => {
    const values = new Map();
    window.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
    window.GM_setValue = (key, value) => values.set(key, value);
    window.GM_deleteValue = key => values.delete(key);
    window.GM_setClipboard = () => {};
    window.GM_xmlhttpRequest = options => options.onerror?.({ status: 0, responseText: '' });
    window.GM_info = { script: { name: 'Gym Planner live flying smoke', version: 'test' } };
  });
  errors.length = 0;
  await page.evaluate(fs.readFileSync(SCRIPT, 'utf8'));
  await page.waitForSelector('.gg-wrap', { timeout: 10000 });

  const state = await page.evaluate(() => {
    const root = document.querySelector('.gg-wrap');
    const host = document.querySelector('.content-wrapper');
    const stat = document.querySelector('#gg-statTotal');
    if (stat) {
      stat.value = '1000000';
      stat.dispatchEvent(new Event('input', { bubbles: true }));
      stat.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return {
      url: location.href,
      title: document.title,
      traveling: document.body?.dataset.traveling || null,
      abroad: document.body?.dataset.abroad || null,
      mounted: !!root,
      insideContentWrapper: !!root && root.parentElement === host,
      tabs: document.querySelectorAll('.gg-tabs button').length,
      gymSelect: !!document.querySelector('#gg-gym'),
      statInput: !!stat,
      nowPane: !!document.querySelector('#gg-pane-now'),
      setupButton: !!document.querySelector('#gg-tab-setup'),
    };
  });
  const rootHandle = await page.$('.gg-wrap');
  if (rootHandle) await rootHandle.screenshot({ path: SHOT });

  assert.equal(state.mounted, true);
  assert.equal(state.insideContentWrapper, true);
  assert.equal(state.tabs, 3);
  assert.equal(state.gymSelect, true);
  assert.equal(state.statInput, true);
  assert.equal(state.nowPane, true);
  assert.equal(state.setupButton, true);
  assert.equal(errors.length, 0, `live Gym Planner errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({ before, state, errors, screenshot: SHOT }, null, 2));
  await browser.disconnect();
})().catch(error => { console.error(error); process.exit(1); });
