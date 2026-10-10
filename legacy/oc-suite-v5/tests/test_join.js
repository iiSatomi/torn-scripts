// Drives joinOcSlot() against the REAL saved Torn OC 2.0 crimes page.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(fs.readFileSync('fixtures/Recruiting.html', 'utf8'), {
  url: 'https://www.torn.com/factions.php?step=your#/tab=crimes',
});
const { window } = dom;
global.window = window; global.document = window.document; global.CSS = window.CSS;
window.HTMLElement.prototype.scrollIntoView = function () { this.__scrolled = true; };

const toasts = [];
global.ocmToast = (m, t) => toasts.push(`[${t}] ${m}`);

const src = fs.readFileSync('Torn_OC_Suite.user.js', 'utf8');
const grab = re => src.match(re)[0];
eval(grab(/const JOIN = \{[\s\S]*?\n  \};/).replace('const JOIN', 'JOIN'));
eval(grab(/function normRole\(s\) \{[\s\S]*?\n  \}/).replace('function normRole', 'normRole=function'));
eval(grab(/function joinOcSlot\(ocId, ocName, role\) \{[\s\S]*?\n  \}\n/).replace('function joinOcSlot', 'joinOcSlot=function'));

// Track every real click so we can prove we never click the wrong thing.
const clicks = [];
for (const b of document.querySelectorAll('button')) {
  b.addEventListener('click', () => {
    const card = b.closest('[data-oc-id]');
    const slot = card ? JOIN.slotOf(b, card) : null;
    clicks.push({ oc: card?.dataset.ocId, role: slot ? JOIN.roleTextOf(slot) : '?' });
  });
}

console.log('=== WHAT THE REAL PAGE CONTAINS ===');
const cards = [...document.querySelectorAll('[data-oc-id]')];
for (const c of cards.slice(0, 4)) {
  const joins = [...c.querySelectorAll('button')].filter(JOIN.isJoinBtn);
  const roles = joins.map(b => { const s = JOIN.slotOf(b, c); return s ? JOIN.roleTextOf(s) : '?'; });
  console.log(`  OC ${c.dataset.ocId}: ${joins.length} open -> ${roles.join(', ')}`);
}

// Pick a real target from the page itself
const card0 = cards.find(c => [...c.querySelectorAll('button')].filter(JOIN.isJoinBtn).length > 0);
const btn0 = [...card0.querySelectorAll('button')].filter(JOIN.isJoinBtn)[0];
const role0 = JOIN.roleTextOf(JOIN.slotOf(btn0, card0));

console.log('\n=== TEST 1: join a real open slot ===');
console.log(`  target: OC ${card0.dataset.ocId}, role "${role0}"`);
joinOcSlot(card0.dataset.ocId, 'Test OC', role0);
console.log('  clicked:', JSON.stringify(clicks));
console.log('  ✓ clicked exactly one button :', clicks.length === 1);
console.log('  ✓ correct OC                 :', clicks[0]?.oc === card0.dataset.ocId);
console.log('  ✓ correct role               :', clicks[0]?.role === role0);
console.log('  ✓ slot highlighted           :', !!document.querySelector('.ocm-join-target'));
console.log('  toast:', toasts.pop());

console.log('\n=== TEST 2: our label has a "#2" suffix, Torn\'s does not ===');
clicks.length = 0;
joinOcSlot(card0.dataset.ocId, 'Test OC', `${role0} #2`);
console.log('  ✓ still matched              :', clicks.length === 1 && clicks[0].role === role0);
console.log('  toast:', toasts.pop());

console.log('\n=== TEST 3: recommended role is GONE (must NOT click a different slot) ===');
clicks.length = 0;
joinOcSlot(card0.dataset.ocId, 'Test OC', 'Sniper');   // role not open in this OC
console.log('  ✓ clicked NOTHING            :', clicks.length === 0 ? 'yes (safe)' : 'NO — clicked ' + JSON.stringify(clicks));
console.log('  toast:', toasts.pop());

console.log('\n=== TEST 4: OC not on screen (wrong Torn tab) ===');
clicks.length = 0;
joinOcSlot('9999999', 'Ghost OC', 'Muscle');
console.log('  ✓ clicked nothing            :', clicks.length === 0);
console.log('  toast:', toasts.pop());

console.log('\n=== TEST 5: OC exists but is full ===');
const fullCard = cards.find(c => [...c.querySelectorAll('button')].filter(JOIN.isJoinBtn).length === 0);
if (fullCard) {
  clicks.length = 0;
  joinOcSlot(fullCard.dataset.ocId, 'Full OC', 'Muscle');
  console.log('  ✓ clicked nothing            :', clicks.length === 0);
  console.log('  toast:', toasts.pop());
} else console.log('  (no full OC on this page to test)');
