// Differential harness: evals the userscript module body (IIFE stripped, boot
// neutralized) with DOM/GM shims, calls renderDashboard with fixed mocks, and
// dumps every element's innerHTML keyed by id. Run on old + new code and diff.
'use strict';
const fs = require('fs');
const file = process.argv[2];
let src = fs.readFileSync(file, 'utf8');

// Keep the IIFE (module body has a top-level return guard) but inject an
// expose hook before the closing so the harness can reach renderDashboard.
src = src.replace(/\}\)\(\);\s*$/, '  global.__ocm = { renderDashboard };\n})();');
src = src.replace(/^\s*inject\(\);/m, '  // inject();');
src = src.replace(/^\s*injectSidebar\(\);/m, '  // injectSidebar();');
src = src.replace(/^\s*fetchRoleWeights\(\);/m, '  // fetchRoleWeights();');

// ── GM / env shims ──────────────────────────────────────────────────────────
const store = {
  ocm_profit_since: 0,
  ocm_profit_view: 'window',
  ocm_finance_subtab: 'summary',
  ocm_payout_share: 100,
  ocm_payout_ledger: JSON.stringify({ '2': { paid: true, ts: 1 } }),
  ocm_payout_events: JSON.stringify({
    g1: { ts: 1751000000, fromId: '1', fromName: 'Lead', toId: '11', toName: 'AliceM', amount: 50000 },
  }),
  ocm_payout_news_status: 'ok',
  ocm_theme: 'default',
};
global.GM_getValue = (k, d) => (k in store ? store[k] : d);
global.GM_setValue = (k, v) => { store[k] = v; };
global.GM_addStyle = () => {};
global.GM_registerMenuCommand = () => {};
global.GM_xmlHttpRequest = () => {};
global.GM = { xmlHttpRequest: () => {} };
global.unsafeWindow = {};
global.fetch = () => Promise.reject(new Error('no net in harness'));
global.setInterval = () => 0; global.clearInterval = () => {};
global.setTimeout = () => 0;  global.clearTimeout = () => {};
global.location = { href: 'https://www.torn.com/factions.php?step=your#/tab=crimes', hash: '#/tab=crimes', pathname: '/factions.php' };
global.MutationObserver = class { observe() {} disconnect() {} };
Object.defineProperty(global, "navigator", { value: { clipboard: { writeText: () => Promise.resolve() } }, configurable: true });

// ── DOM shim ────────────────────────────────────────────────────────────────
const elements = new Map();  // id -> El
const allEls = [];           // every element ever created (capture appended cards)
let elSeq = 0;
class ClassList {
  constructor() { this._s = new Set(); }
  add(...c) { c.forEach(x => this._s.add(x)); }
  remove(...c) { c.forEach(x => this._s.delete(x)); }
  toggle(c, f) { const on = f === undefined ? !this._s.has(c) : !!f; on ? this._s.add(c) : this._s.delete(c); return on; }
  contains(c) { return this._s.has(c); }
  toString() { return [...this._s].join(' '); }
}
class El {
  constructor(tag = 'div', id = '') {
    allEls.push(this);
    this.tagName = tag.toUpperCase(); this.id = id; this._html = ''; this._text = '';
    this.style = {}; this.dataset = {}; this.classList = new ClassList();
    this.children = []; this.parentElement = null; this.value = ''; this.checked = false;
    this.offsetHeight = 0; this.offsetWidth = 0; this.scrollTop = 0;
  }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html; }
  set textContent(v) { this._text = String(v); this._html = ''; }
  get textContent() { return this._text || this._html.replace(/<[^>]*>/g, ''); }
  set className(v) { this.classList = new ClassList(); String(v).split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c)); }
  get className() { return this.classList.toString(); }
  addEventListener() {}
  removeEventListener() {}
  setAttribute(k, v) { if (k === 'id') { this.id = v; elements.set(v, this); } this['attr_' + k] = v; }
  getAttribute(k) { return this['attr_' + k] ?? null; }
  appendChild(c) { this.children.push(c); c.parentElement = this; return c; }
  prepend(c) { this.children.unshift(c); c.parentElement = this; return c; }
  insertBefore(c) { this.children.unshift(c); c.parentElement = this; return c; }
  insertAdjacentHTML(pos, html) { this._html = pos === 'afterbegin' ? html + this._html : this._html + html; }
  insertAdjacentElement(pos, elm) { this.appendChild(elm); return elm; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  remove() {}
  focus() {} blur() {} click() {}
  getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; }
}
// The real shell's ids, parsed straight out of the script source. getElementById
// must return null for anything NOT in the shell — exactly like a browser would.
// Fabricating an element for every id is what let the v3.17 "ocm-finance" bug ship:
// renderFinanceSection guarded on a container I'd deleted, and the harness happily
// invented one, so the guard never tripped in testing but returned instantly in Chrome.
const SHELL_IDS = new Set([
  ...fs.readFileSync(file, 'utf8').matchAll(/id="(ocm-[\w-]+)"/g),
].map(m => m[1]));
function getEl(id) {
  if (!SHELL_IDS.has(id)) return null;          // not in the markup -> null, like the DOM
  if (!elements.has(id)) elements.set(id, new El('div', id));
  return elements.get(id);
}
global.document = {
  readyState: 'complete',
  getElementById: id => getEl(id),
  createElement: tag => new El(tag, 'anon-' + (++elSeq)),
  createDocumentFragment: () => new El('fragment'),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  body: new El('body', 'body'),
  head: new El('head', 'head'),
  documentElement: new El('html', 'html'),
};
global.addEventListener = () => {};
global.window = global;

// ── Evaluate the module body ────────────────────────────────────────────────
eval(src);
const renderDashboard = global.__ocm && global.__ocm.renderDashboard;
if (typeof renderDashboard !== "function") { console.error("renderDashboard not exposed"); process.exit(1); }

// ── Fixed mocks ─────────────────────────────────────────────────────────────
const NOW = 1751500000; // fixed clock
const RealDate = Date;
global.Date = class extends RealDate {
  constructor(...a) { a.length ? super(...a) : super(NOW * 1000); }
  static now() { return NOW * 1000; }
};
const day = 86400;
const mkUser = (id, name) => ({ id, name });
const crimes = {
  // completed, unpaid, crew 11+12, materials consumed
  1: { id: 1, name: 'Break the Bank', status: 'Successful', difficulty: 7, executed_at: NOW - 2 * day, created_at: NOW - 3 * day,
       rewards: { money: 1000000, respect: 120, items: [{ id: 888, quantity: 1 }] },
       slots: [
         { position: 'Muscle', position_info: { label: 'Muscle' }, user: mkUser(11, 'AliceM'), item_requirement: { id: 206, is_reusable: false, is_available: true } },
         { position: 'Hacker', position_info: { label: 'Hacker' }, user: mkUser(12, 'BobH'), item_requirement: { id: 207, is_reusable: false, is_available: true } },
       ] },
  // completed, marked paid
  2: { id: 2, name: 'Smash and Grab', status: 'Successful', difficulty: 3, executed_at: NOW - 9 * day, created_at: NOW - 10 * day,
       rewards: { money: 300000, respect: 40, items: [] },
       slots: [ { position: 'Thief', position_info: { label: 'Thief' }, user: mkUser(13, 'CarolT'), item_requirement: { id: 777, is_reusable: true, is_available: true } } ] },
  // failed OC (analytics)
  3: { id: 3, name: 'Break the Bank', status: 'Failure', difficulty: 7, executed_at: NOW - 5 * day, created_at: NOW - 6 * day,
       rewards: null, slots: [ { position: 'Muscle', user: mkUser(14, 'DanM') } ] },
  // recruiting: Bob filled but missing item; one open slot
  9: { id: 9, name: 'Stage a Political Assassination', status: 'Recruiting', difficulty: 8, ready_at: NOW + 2 * day, created_at: NOW - 1 * day, expired_at: NOW + 6 * day,
       slots: [
         { position: 'Sniper', position_info: { label: 'Sniper' }, user: mkUser(12, 'BobH'), item_requirement: { id: 207, is_reusable: false, is_available: false } },
         { position: 'Spotter', position_info: { label: 'Spotter' }, user: null, item_requirement: { id: 206, is_reusable: false } },
       ] },
  // planning: full, ready soon
  10: { id: 10, name: 'Blackmail a Politician', status: 'Planning', difficulty: 5, ready_at: NOW + day / 2, created_at: NOW - 2 * day,
        slots: [ { position: 'Enforcer', position_info: { label: 'Enforcer' }, user: mkUser(11, 'AliceM') } ] },
};
const memberMap = {
  11: { name: 'AliceM', level: 40, status: { state: 'Okay', description: '' }, last_action: { relative: '1 hour ago', timestamp: NOW - 3600 }, is_in_oc: true,  position: 'Member', days_in_faction: 200 },
  12: { name: 'BobH',   level: 35, status: { state: 'Okay', description: '' }, last_action: { relative: '2 hours ago', timestamp: NOW - 7200 }, is_in_oc: true,  position: 'Member', days_in_faction: 150 },
  13: { name: 'CarolT', level: 28, status: { state: 'Hospital', description: 'In hospital for 2 hrs' }, last_action: { relative: '10 minutes ago', timestamp: NOW - 600 }, is_in_oc: false, position: 'Member', days_in_faction: 90 },
  14: { name: 'DanM',   level: 15, status: { state: 'Okay', description: '' }, last_action: { relative: '3 days ago', timestamp: NOW - 3 * day }, is_in_oc: false, position: 'Member', days_in_faction: 5 },
  15: { name: 'EveF',   level: 22, status: { state: 'Traveling', description: 'Traveling to Mexico' }, last_action: { relative: '1 day ago', timestamp: NOW - day }, is_in_oc: false, position: 'Member', days_in_faction: 60 },
};
const faction = { crimes, basic: { name: 'TestFaction', respect: 1000 } };
const armory = { '206': 1, '207': 0 };
const itemNames = { '206': 'Tissues', '207': 'Advanced Sniper Rifle', '888': 'Diamond', '777': 'Lockpick' };
const itemValues = { '206': 1000, '207': 5000000, '888': 2500000, '777': 20000 };
const loanedOut = [
  { itemId: '777', itemName: 'Lockpick', uid: '13', holderName: 'CarolT' },   // not needed -> retrievable
  { itemId: '207', itemName: 'Advanced Sniper Rifle', uid: '12', holderName: 'BobH' }, // wait: Bob NEEDS 207 but is_available=false... loaned but flag says missing; keep identical both runs
];

// ── Render + dump ───────────────────────────────────────────────────────────
try {
  renderDashboard(faction, memberMap, armory, itemNames, { 14: { executed_at: 1751000000, name: "Break the Bank" } }, {}, itemValues, '11', loanedOut);
} catch (e) {
  console.error('RENDER THREW:', e && e.stack || e);
  process.exit(2);
}
const dump = {};
for (const [id, el] of [...elements.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (el._html || el._text) dump[id] = { html: el._html, text: el._text || undefined };
}
let anonIdx = 0;
for (const el of allEls) {
  if (el.id && elements.get(el.id) === el) continue;
  anonIdx++;
  if (el._html || el._text) dump['@anon' + anonIdx + ':' + el.tagName + ':' + el.className] = { html: el._html, text: el._text || undefined };
}
fs.writeFileSync(process.argv[3] || '/dev/stdout', JSON.stringify(dump, null, 1));
console.error(`OK — ${Object.keys(dump).length} populated elements dumped`);
