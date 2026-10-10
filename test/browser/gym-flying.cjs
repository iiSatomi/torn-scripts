const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { requireTornSession } = require('./session-guard.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'Torn Gym Planner-3.36.txt');
const SHOT = path.join(__dirname, 'shots', 'gym-planner-flying.png');

(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.setBypassCSP(true);
  await page.goto('https://www.torn.com/gym.php', { waitUntil: 'domcontentloaded' }).catch(() => {});
  const session = await requireTornSession(page);
  await page.evaluate(() => {
    document.body.dataset.traveling = 'true';
    document.body.dataset.abroad = 'true';
    let host = document.querySelector('.content-wrapper');
    if (!host) {
      host = document.createElement('main');
      host.className = 'content-wrapper';
      document.body.appendChild(host);
    }
    host.innerHTML = '<div id="gym-flight-placeholder" style="padding:12px;color:#aaa">Flying-state gym host</div>';
  });

  await page.evaluate(() => {
    const values = new Map();
    window.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
    window.GM_setValue = (key, value) => values.set(key, value);
    window.GM_deleteValue = key => values.delete(key);
    window.GM_setClipboard = () => {};
    window.GM_xmlhttpRequest = options => options.onerror?.({ status: 0, responseText: '' });
    window.GM_info = { script: { name: 'Gym Planner flying smoke', version: 'test' } };
  });

  errors.length = 0;
  await page.evaluate(fs.readFileSync(SCRIPT, 'utf8'));
  await page.waitForSelector('.gg-wrap', { timeout: 10000 });
  const state = await page.evaluate(() => {
    const root = document.querySelector('.gg-wrap');
    const host = document.querySelector('.content-wrapper');
    const stat = document.querySelector('#gg-statTotal');
    const initialNowText = document.querySelector('#gg-daily-results')?.innerText.trim() || '';
    const gym = document.querySelector('#gg-gym');
    if (gym) {
      gym.value = '24';
      gym.dispatchEvent(new Event('input', { bubbles: true }));
      gym.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const energy = document.querySelector('#gg-energy');
    if (stat) {
      stat.value = '1000000';
      stat.dispatchEvent(new Event('input', { bubbles: true }));
      stat.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (energy) {
      energy.value = '150';
      energy.dispatchEvent(new Event('input', { bubbles: true }));
      energy.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const readyNowText = document.querySelector('#gg-daily-results')?.innerText.trim() || '';
    const copyVisible = getComputedStyle(document.querySelector('#gg-copy')).display !== 'none';
    const manualInventory = !!document.querySelector('#gg-manual-inv') &&
      !!document.querySelector('[data-manual-inv="xanax"]');
    const predictionQuality = !!document.querySelector('#gg-log-quality');
    if (stat) {
      stat.value = '50';
      stat.dispatchEvent(new Event('input', { bubbles: true }));
      stat.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const invalidText = document.querySelector('#gg-now-validation')?.innerText.trim() || '';
    return {
      traveling: document.body.dataset.traveling,
      abroad: document.body.dataset.abroad,
      mounted: !!root,
      insideContentWrapper: !!root && root.parentElement === host,
      tabs: document.querySelectorAll('.gg-tabs button').length,
      gymSelect: !!document.querySelector('#gg-gym'),
      statInput: !!stat,
      nowResult: !!document.querySelector('#gg-now-results, #gg-daily-results'),
      initialNowText,
      readyNowText,
      copyVisible,
      manualInventory,
      predictionQuality,
      invalidText,
      rootText: root?.innerText.slice(0, 180) || '',
    };
  });
  await page.click('[data-tab="money"]');
  await page.click('#gg-assess-run');
  await page.waitForFunction(() => document.querySelector('#gg-assess-out')?.dataset.state !== 'loading', { timeout: 3000 });
  const moneyState = await page.$eval('#gg-assess-out', node => ({ state: node.dataset.state, text: node.innerText }));
  const manualSave = await page.evaluate(() => {
    const details = document.querySelector('#gg-manual-inv');
    if (details) details.open = true;
    const input = document.querySelector('[data-manual-inv="xanax"]');
    if (!input) return { present: false, status: '' };
    input.value = '3';
    document.querySelector('#gg-manual-inv-save')?.click();
    return { present: true, status: document.querySelector('#gg-manual-inv-status')?.textContent || '' };
  });
  await page.click('[data-tab="plan"]');
  const planResults = {};
  for (const method of ['daily', 'xanax', 'jump']) {
    await page.select('#gg-plan-method', method);
    await page.click('#gg-plan-calc');
    planResults[method] = await page.$eval('#gg-plan-results', node => node.innerText.trim());
  }
  await page.evaluate(() => {
    const host = document.querySelector('.content-wrapper');
    const fixture = document.createElement('section');
    fixture.id = 'gym-switch-fixture';
    fixture.innerHTML = `
      <h2>Cha Cha's</h2>
      <div class="energy"><span class="bar-value">150 / 150</span></div>
      <button id="gym-switch-test-train" aria-label="Train speed">TRAIN</button>
      <div class="gym-option"><span>Force Training</span><button id="gym-switch-test-switch">Switch</button></div>`;
    host.appendChild(fixture);
    let trainClicks = 0;
    let switchClicks = 0;
    fixture.querySelector('#gym-switch-test-train').addEventListener('click', () => { trainClicks++; });
    fixture.querySelector('#gym-switch-test-switch').addEventListener('click', () => { switchClicks++; });
    window.__gymSwitchTest = { fixture, trainClicks: () => trainClicks, switchClicks: () => switchClicks };
  });
  await page.evaluate(() => {
    const gym = document.querySelector('#gg-gym');
    if (gym) { gym.value = '20'; gym.dispatchEvent(new Event('change', { bubbles: true })); }
    const stat = document.querySelector('#gg-stat');
    if (stat) { stat.value = 'speed'; stat.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await new Promise(resolve => setTimeout(resolve, 700));
  const bestGymNudge = await page.$eval('#gg-bestgym-nudge', node => ({ hidden: node.hidden, text: node.innerText }));
  await page.click('#gym-switch-test-train');
  await new Promise(resolve => setTimeout(resolve, 100));
  const switchState = await page.evaluate(() => ({
    trainClicks: window.__gymSwitchTest?.trainClicks(),
    switchClicks: window.__gymSwitchTest?.switchClicks(),
    banner: document.body.innerText.includes('Switched to Force Training'),
  }));
  const rootHandle = await page.$('.gg-wrap');
  if (rootHandle) await rootHandle.screenshot({ path: SHOT });

  console.log(JSON.stringify({ session, state, moneyState, manualSave, planResults, bestGymNudge, switchState, errors }, null, 2));

  assert.equal(state.traveling, 'true');
  assert.equal(state.abroad, 'true');
  assert.equal(state.mounted, true);
  assert.equal(state.insideContentWrapper, true);
  assert.ok(state.tabs > 0, 'Gym Planner tabs should render while flying');
  assert.equal(state.gymSelect, true);
  assert.equal(state.statInput, true);
  assert.ok(state.initialNowText.length > 0, 'initial Now state should be actionable');
  assert.match(state.readyNowText, /This Session/i, 'valid inputs should render the live result');
  assert.equal(state.copyVisible, true, 'copy result should be available after a valid render');
  assert.equal(state.manualInventory, true, 'Money should expose the local inventory fallback');
  assert.equal(state.predictionQuality, true, 'Logger should expose the prediction-quality panel');
  assert.match(state.invalidText, /Check Setup/i, 'invalid inputs should be explained beside the result');
  assert.equal(moneyState.state, 'error', 'missing API key should render an actionable assessment state');
  assert.match(moneyState.text, /API key|Settings/i, 'assessment error should explain the next action');
  assert.equal(manualSave.present, true, 'manual inventory input should be interactive');
  assert.match(manualSave.status, /saved locally/i, 'manual inventory save should confirm local persistence');
  for (const method of ['daily', 'xanax', 'jump']) assert.match(planResults[method], /goal|gain|session/i, `${method} projection should render output`);
  assert.equal(bestGymNudge.hidden, false, 'best-gym nudge should appear when a better owned gym is available');
  assert.match(bestGymNudge.text, /Force Training|Better available/i, 'best-gym nudge should name the better gym');
  assert.equal(switchState.switchClicks, 1, 'auto-switcher should click a matching Torn gym switch control');
  assert.equal(switchState.trainClicks, 0, 'auto-switcher should stop the train click while switching gyms');
  assert.equal(switchState.banner, true, 'auto-switcher should explain the switch');
  assert.equal(errors.length, 0, `flying UI errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({ session, state, moneyState, manualSave, planResults, bestGymNudge, switchState, errors, screenshot: SHOT }, null, 2));
  await context.close();
  await browser.disconnect();
})().catch(error => { console.error(error); process.exit(1); });
