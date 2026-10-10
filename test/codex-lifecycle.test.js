const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(ROOT, 'Torn_OC_Suite_Codex.user.js');
const HARNESS_PATH = path.join(ROOT, 'test', 'browser', 'audit-subtabs.cjs');
const source = fs.readFileSync(SCRIPT_PATH, 'utf8');

function expectSource(pattern, message) {
  assert.match(source, pattern, message);
}

expectSource(/let _ocmInjectTimer\s*=\s*null;/,
  'route insertion must have one cancellable timer slot');
expectSource(/let _ocmMoneyObserver\s*=\s*null;/,
  'native money observer must have one lifecycle slot');
expectSource(/let _ocmArmoryObserver\s*=\s*null;/,
  'armory observer must have one lifecycle slot');

const countdownStart = source.indexOf('function startCountdowns()');
const countdownEnd = source.indexOf('\n  // ─── MEMBER MODE', countdownStart);
assert.ok(countdownStart >= 0 && countdownEnd > countdownStart, 'countdown function must exist');
const countdown = source.slice(countdownStart, countdownEnd);
assert.match(countdown, /!document\.getElementById\(['"]ocm-root['"]\)/,
  'countdowns must stop when the suite root is gone');

const sidebarStart = source.indexOf('function injectSidebar()');
const sidebarEnd = source.indexOf('\n  /** Render (or re-render) the sidebar widget', sidebarStart);
assert.ok(sidebarStart >= 0 && sidebarEnd > sidebarStart, 'sidebar injector must exist');
const sidebar = source.slice(sidebarStart, sidebarEnd);
assert.match(sidebar, /!document\.getElementById\(['"]ocm-sidebar-widget['"]\)/,
  'sidebar timer must stop when its widget is gone');

const injectStart = source.indexOf('function inject()');
const injectEnd = source.indexOf('\n  function injectSidebar()', injectStart);
assert.ok(injectStart >= 0 && injectEnd > injectStart, 'inject function must exist');
const inject = source.slice(injectStart, injectEnd);
assert.match(inject, /_ocmInjectTimer/, 'inject must own its insertion timer');
assert.match(inject, /if \(!isOcTab\(\)\)/,
  'route insertion must re-check the route before mounting');

const moneyStart = source.indexOf('async function initNativeOcMoney()');
const moneyEnd = source.indexOf('\n  /**\n   * Act on a pending armory intent', moneyStart);
assert.ok(moneyStart >= 0 && moneyEnd > moneyStart, 'native money initializer must exist');
const money = source.slice(moneyStart, moneyEnd);
assert.match(money, /_ocmMoneyObserver\s*\.disconnect\(\)|_ocmMoneyObserver\s*=\s*null/,
  'native money observer must be disconnectable');

const armoryStart = source.indexOf('async function initArmoryAnnotations()');
const armoryEnd = source.indexOf('\n  /** Poll for an element to appear', armoryStart);
assert.ok(armoryStart >= 0 && armoryEnd > armoryStart, 'armory initializer must exist');
const armory = source.slice(armoryStart, armoryEnd);
assert.match(armory, /_ocmArmoryObserver\s*\.disconnect\(\)|_ocmArmoryObserver\s*=\s*null/,
  'armory observer must be disconnectable');

const gmFetchStart = source.indexOf('function gmFetch(url)');
const gmFetchEnd = source.indexOf('\n  /**', gmFetchStart);
assert.ok(gmFetchStart >= 0 && gmFetchEnd > gmFetchStart, 'GM fetch helper must exist');
const gmFetch = source.slice(gmFetchStart, gmFetchEnd);
assert.match(gmFetch, /timeout:\s*\d+/, 'Torn API GM requests must have a finite timeout');
assert.match(gmFetch, /ontimeout\s*\(/, 'Torn API GM timeouts must reject cleanly');

const usageFetchStart = source.indexOf('function gmFetchJSON(url, options = {})');
const usageFetchEnd = source.indexOf('\n    function loadCallLog()', usageFetchStart);
assert.ok(usageFetchStart >= 0 && usageFetchEnd > usageFetchStart, 'Usage Command GM fetch helper must exist');
const usageFetch = source.slice(usageFetchStart, usageFetchEnd);
assert.match(usageFetch, /timeout:\s*options\.timeout\s*\|\|\s*\d+/,
  'Usage Command sheet requests must have a finite timeout');
assert.match(usageFetch, /ontimeout\s*:/, 'Usage Command timeouts must reject cleanly');

const apiStart = source.indexOf('async function apiFetch(path, apiKey)');
const apiEnd = source.indexOf('\n  const ARMORY_CATS', apiStart);
assert.ok(apiStart >= 0 && apiEnd > apiStart, 'suite API helpers must exist');
const apiHelpers = source.slice(apiStart, apiEnd);
assert.ok((apiHelpers.match(/encodeURIComponent\(apiKey\)/g) || []).length >= 2,
  'v1 and v2 suite API helpers must encode API keys');

const memberStart = source.indexOf('async function fetchMember(apiKey)');
const memberEnd = source.indexOf('\n  function renderMemberDashboard', memberStart);
assert.ok(memberStart >= 0 && memberEnd > memberStart, 'member API helper must exist');
assert.match(source.slice(memberStart, memberEnd), /encodeURIComponent\(apiKey\)/,
  'member-mode API helper must encode its API key');
assert.doesNotMatch(source, /key=\$\{apiKey\}/,
  'no direct suite API URL may interpolate an unencoded API key');

const syntax = spawnSync(process.execPath, ['--check', HARNESS_PATH], { encoding: 'utf8' });
assert.equal(syntax.status, 0,
  `all-subtab browser audit must parse before it is used\n${syntax.stderr || syntax.stdout}`);

console.log('codex lifecycle contracts passed');
