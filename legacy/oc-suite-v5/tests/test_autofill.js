// Drives initLoanAutofill() against the REAL saved Torn armory page.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('fixtures/armory.html', 'utf8');
const dom = new JSDOM(html, { url: 'https://www.torn.com/factions.php?step=your#/tab=armoury&start=0&sub=utilities' });
const { window } = dom;

global.window = window;
global.document = window.document;
global.Event = window.Event;
global.location = window.location;
global.HTMLElement = window.HTMLElement;

// GM shim with a pending loan intent: loan Cassock (1313) to a member
const store = {
  ocm_loan_intent: JSON.stringify({
    itemId: '1380', itemName: 'RF Detector',
    uid: '2360099', memberName: 'RealPlayer',
    qty: 1, ts: Math.floor(Date.now() / 1000),
  }),
};
global.GM_getValue = (k, d) => (k in store ? store[k] : d);
global.GM_setValue = (k, v) => { store[k] = v; };

const toasts = [];
global.ocmToast = (m, t) => toasts.push(`[${t}] ${m}`);

// Pull the autofill pieces out of the script
const src = fs.readFileSync('Torn_OC_Suite.user.js', 'utf8');
const grab = (re, n) => { const m = src.match(re); if (!m) { console.error('MISSING', n); process.exit(1); } return m[0]; };
global.GMK = { LOAN_INTENT: 'ocm_loan_intent' };
global.LOAN_INTENT_TTL = 300;
window.HTMLElement.prototype.scrollIntoView = function () { this.__scrolled = true; };
eval(grab(/const LOAN_INTENT_TTL = [\s\S]*?\n  \}\n/, 'ttl+setLoanIntent').replace('function setLoanIntent', 'setLoanIntent=function'));
eval(grab(/function takeLoanIntent\(\) \{[\s\S]*?\n  \}/, 'take').replace('function takeLoanIntent', 'takeLoanIntent=function'));
eval(grab(/function setNativeValue\(input, value\) \{[\s\S]*?\n  \}/, 'snv').replace('function setNativeValue', 'setNativeValue=function'));
eval(grab(/function initLoanAutofill\(\) \{[\s\S]*?\n  \}\n/, 'init').replace('function initLoanAutofill', 'initLoanAutofill=function'));
// v4.9 extracted the give/retrieve flow so the quick-loan panel can reuse it.
eval(grab(/function execArmoryLoanIntent\(intent\) \{[\s\S]*?\n  \}\n/, 'exec').replace('function execArmoryLoanIntent', 'execArmoryLoanIntent=function'));

// The real page's Loan link is an <a href="#"> whose form is already in the DOM.
// Track whether we clicked it (jsdom won't run Torn's JS).
let clicked = 0;
const row = document.querySelector(String.raw`.img-wrap[data-itemid="1380"]`).closest('li');
const loanLink = row.querySelector('a[data-role="loan"]');
loanLink.addEventListener('click', () => { clicked++; });

console.log('--- BEFORE ---');
const contBefore = row.querySelector('.loan-cont');
const userBefore = contBefore?.querySelector('input.ac-search[name="user"]');
console.log('row found            :', !!row);
console.log('loan link found      :', !!loanLink);
console.log('loan form present    :', !!contBefore);
console.log('member field value   :', JSON.stringify(userBefore?.value));

initLoanAutofill();

setTimeout(() => {
  const cont = row.querySelector('.loan-cont');
  const userInput = cont.querySelector('input.ac-search[name="user"]');
  const qtyInputs = [...cont.querySelectorAll('input.quantity')];
  console.log('\n--- AFTER ---');
  console.log('loan link clicked    :', clicked === 1 ? '✓ yes' : '✗ no (' + clicked + ')');
  console.log('member field value   :', JSON.stringify(userInput.value));
  console.log('  expected           :', JSON.stringify('RealPlayer [2360099]'));
  console.log('  MATCH              :', userInput.value === 'RealPlayer [2360099]' ? '✓' : '✗');
  console.log('quantity inputs      :', qtyInputs.map(q => `${q.type}=${q.value}`).join(', '));
  console.log('  both set to 1      :', qtyInputs.every(q => q.value === '1') ? '✓' : '✗');
  console.log('row highlighted      :', row.style.outline ? '✓ ' + row.style.outline : '✗');
  console.log('toasts               :', toasts);
  console.log('intent consumed      :', store.ocm_loan_intent === 'null' ? '✓ (one-shot)' : '✗ still set');

  // Re-running must NOT re-fire (stale/consumed intent)
  toasts.length = 0;
  initLoanAutofill();
  setTimeout(() => {
    console.log('\n--- RE-RUN (should do nothing) ---');
    console.log('toasts on re-run     :', toasts.length === 0 ? '✓ none' : '✗ ' + JSON.stringify(toasts));
  }, 700);
}, 1200);
