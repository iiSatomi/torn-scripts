const { JSDOM } = require('jsdom');
const fs = require('fs');
const dom = new JSDOM(`<!DOCTYPE html><body><div id="ocm-root">
  <div class="ocm-section-title" id="ocm-title-available">Members Available (0)</div>
  <div id="ocm-available"></div>
  <div class="ocm-section-title" id="ocm-title-analytics">Analytics</div>
  <div id="ocm-analytics"></div>
</div></body>`);
global.window = dom.window; global.document = dom.window.document;
const store = {};
global.GM_getValue = (k,d)=> (k in store ? store[k] : d);
global.GM_setValue = (k,v)=> { store[k]=v; };
const src = fs.readFileSync('Torn_OC_Suite.user.js','utf8');
const grab = re => { const m = src.match(re); if(!m) throw new Error('missing '+re); return m[0]; };
eval(grab(/const COLLAPSE_SECTIONS = [[\s\S]*?\n  ];/).replace('const COLLAPSE_SECTIONS =','COLLAPSE_SECTIONS ='));
eval(grab(/function setCollapsed\(title, content, collapsed\) \{[\s\S]*?\n  \}/).replace('function setCollapsed','setCollapsed=function'));
eval(grab(/function syncStaticCollapse\(\) \{[\s\S]*?\n  \}/).replace('function syncStaticCollapse','syncStaticCollapse=function'));
eval(grab(/function initCollapse\(\) \{[\s\S]*?\n  \}/).replace('function initCollapse','initCollapse=function'));

const t = document.getElementById('ocm-title-available');
const c = document.getElementById('ocm-available');
const vis = () => c.style.display !== 'none';
const chevronSaysOpen = () => !t.classList.contains('collapsed');
let pass = 0, fail = 0;
const ck = (label, cond) => { cond ? pass++ : fail++; console.log(`  ${cond?'✓':'✗'} ${label}`); };

initCollapse();                       // boot: no data yet, title reads "(0)"
c.innerHTML = '<div>Jaizo</div>';     // data arrives
t.textContent = 'Members Available (4)';
syncStaticCollapse();                 // ← the fix: re-evaluate AFTER render

console.log('After render (4 members, no saved preference):');
ck('section is open (it has content now)', vis());
ck('chevron agrees with what is shown', chevronSaysOpen() === vis());

console.log('\nOne click should fold it:');
t.dispatchEvent(new dom.window.Event('click', {bubbles:true}));
ck('folded on the FIRST click', !vis());
ck('chevron agrees', chevronSaysOpen() === vis());
ck('choice persisted', store['ocs_collapse_ocm-available'] === 'collapsed');

console.log('\nOne click should unfold it:');
t.dispatchEvent(new dom.window.Event('click', {bubbles:true}));
ck('open on the FIRST click', vis());

console.log('\nA re-render must not override my explicit choice:');
t.dispatchEvent(new dom.window.Event('click', {bubbles:true}));   // fold it
syncStaticCollapse();                                             // re-render happens
ck('stays folded across a re-render', !vis());

console.log('\nSection with defaultOpen:false and no data:');
const a = document.getElementById('ocm-analytics');
ck('analytics starts collapsed', a.style.display === 'none');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
