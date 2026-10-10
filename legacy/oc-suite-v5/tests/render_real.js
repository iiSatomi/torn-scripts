// Renders the REAL script (shell + CSS + rendered panes) into the saved Torn page,
// so what we look at is what actually ships — not a hand-written mockup.
const { JSDOM } = require('jsdom');
const fs = require('fs');

// Pane dump produced by the harness: node tests/harness.js Torn_OC_Suite.user.js harness_out.json
const panes = JSON.parse(fs.readFileSync('harness_out.json', 'utf8'));
const src   = fs.readFileSync('Torn_OC_Suite.user.js', 'utf8');

// Pull the shell markup + the CSS block straight out of the script.
const css   = src.match(/GM_addStyle\(`([\s\S]*?)`\);/)[1];
const shell = src.match(/root\.innerHTML = `([\s\S]*?)`;\n/)[1];

const base = fs.readFileSync('fixtures/torn_base.html', 'utf8');
const dom  = new JSDOM(base);
const doc  = dom.window.document;

const root = doc.getElementById('ocm-root');
root.innerHTML = shell
  .replace(/\$\{SCRIPT_VERSION\}/g, (src.match(/@version\s+([\d.]+)/) || [])[1] || '?')
  .replace(/\$\{[^}]*\}/g, '');            // strip remaining template holes

// Drop the real rendered pane contents in.
let filled = 0;
for (const [id, v] of Object.entries(panes)) {
  const el = doc.getElementById(id);
  if (el && v.html) { el.innerHTML = v.html; filled++; }
  if (el && v.text && !v.html) el.textContent = v.text;
}

// OC cards are appended as anonymous children, so the harness dumps them under
// @anon keys. Put them back in the grid where they belong.
const ocCards = Object.entries(panes).filter(([k]) => k.includes('oc2')).map(([, v]) => v.html);
const grid = doc.getElementById('ocm-grid-recruiting');
if (grid && ocCards.length) grid.innerHTML = ocCards.map(h => `<div class="oc2">${h}</div>`).join("");

// Show the People tab open too, so both are visible in one screenshot.
const st = doc.createElement('style');
st.textContent = css + `
  /* preview only: reveal a couple of panes at once so everything is visible */
  #ocm-root .ocm-subpane { display:block !important; }
  #ocm-root .ocm-pane { display:block !important; }
`;
doc.head.appendChild(st);

fs.writeFileSync('tests/torn_page_REAL_ui.html', dom.serialize());
console.log('written        : tests/torn_page_REAL_ui.html');
console.log('panes injected :', filled);
console.log('OC cards (ours):', root.querySelectorAll('.oc2').length);
console.log('slot headers   :', root.querySelectorAll('.oc2-slot-head').length);
console.log('section titles :', root.querySelectorAll('.ocm-section-title').length);
console.log('tables         :', root.querySelectorAll('.ocm-pay-table').length);
console.log('Torn page kept :', doc.querySelectorAll('[data-oc-id]').length, 'of its own OC cards');
