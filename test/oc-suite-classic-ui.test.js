const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(rootDir, 'Torn_OC_Suite_Codex.user.js'), 'utf8');
const rebuildSource = fs.readFileSync(path.join(rootDir, 'scripts', 'reference', 'Torn_OC_Suite_REBUILD.user.js'), 'utf8');
const purrfectSource = fs.readFileSync(path.join(rootDir, 'scripts', 'reference', 'Torn_OC_Suite_PurrfectCrime.user.js'), 'utf8');

function namedFunctions(scriptSource) {
  return new Set([...scriptSource.matchAll(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
    .map(match => match[1]));
}

const codexFunctions = namedFunctions(source);
const supersededFunctions = new Map([
  // The newer implementation handles Utilities plus on-demand armor/weapon
  // categories through one generalized parser; keeping both would duplicate loans.
  ['parseUtilities', 'parseArmoryCategory'],
]);
for (const [label, referenceSource] of [
  ['rebuild', rebuildSource],
  ['PurrfectCrime', purrfectSource],
]) {
  const missing = [...namedFunctions(referenceSource)]
    // A definition with no second call-site is dead reference code, not a feature.
    .filter(name => (referenceSource.match(new RegExp(`\\b${name}\\s*\\(`, 'g')) || []).length > 1)
    .filter(name => !codexFunctions.has(name))
    .filter(name => !codexFunctions.has(supersededFunctions.get(name)))
    .sort();
  assert.deepEqual(missing, [],
    `classic-shell Codex must retain or explicitly supersede every live named function from the ${label} feature baseline`);
}

function sourceBlock(startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start);
  assert.ok(start >= 0 && end > start, `could not extract block starting ${startToken}`);
  return source.slice(start, end);
}

const buildRailNavSource = sourceBlock('  function buildRailNav()', '\n  // OCUI');
const buildRootSource = sourceBlock('  function buildRoot()', '\n  // ─── RENDER');
const OCM_NAV = new Function(sourceBlock('  const OCM_NAV =', '  function buildRailNav()') + '\nreturn OCM_NAV;')();
const fakeDocument = {
  createElement() {
    return { id: '', className: '', innerHTML: '' };
  },
};
const loadShareByDiff = () => ({
  1: 100, 2: 100, 3: 90, 4: 90, 5: 80,
  6: 80, 7: 70, 8: 70, 9: 60, 10: 60,
});

const buildRoot = new Function(
  'document', 'SCRIPT_VERSION', 'OCM_NAV', 'CPR_WARN', 'CPR_CRIT',
  'WEIGHT_HIGH', 'WEIGHT_MID', 'REFRESH_S', 'MIN_PER_DIFF', 'loadShareByDiff',
  `${buildRailNavSource}\n${buildRootSource}\nreturn buildRoot;`,
)(fakeDocument, 'test', OCM_NAV, 70, 50, 70, 40, 60, 1, loadShareByDiff);

const root = buildRoot();
assert.equal(root.id, 'ocm-root');
assert.equal(root.className, 'ocm-ui2 ocm-classic',
  'the complete Codex engine should mount through the classic-shell modifier');
assert.match(root.innerHTML, /id="ocm-header"/,
  'classic shell should retain the compact 3.36 header');
assert.match(root.innerHTML, /class="ocm-tabs" id="ocm-tabs"/,
  'classic shell should render the main navigation as a horizontal tab strip');
assert.doesNotMatch(root.innerHTML, /id="ocm-rail"|id="ocm-topbar"/,
  'classic shell should not render the premium rail or topbar');

const navLabels = [...root.innerHTML.matchAll(/class="ocm-tab ocm-nav[^>]*>[\s\S]*?<span class="ocm-nav-l">([^<]+)<\/span>/g)]
  .map(match => match[1]);
assert.deepEqual(navLabels, ['Dashboard', 'Crimes', 'People', 'Finance', 'Armory', 'Consumables', 'War'],
  'classic tabs should expose every complete-feature pane in the current order');
assert.match(root.innerHTML, /id="ocm-tab-home"[\s\S]*?role="tab"[\s\S]*?tabindex="0"[\s\S]*?aria-controls="ocm-pane-home"[\s\S]*?aria-selected="true"/,
  'initial classic navigation should expose an accessible selected Dashboard tab');
assert.match(root.innerHTML, /id="ocm-pane-home" role="tabpanel" aria-labelledby="ocm-tab-home"/,
  'Dashboard pane should be associated with its tab for assistive technology');
const initiallyActivePanes = [...root.innerHTML.matchAll(/class="ocm-tab-pane active" id="ocm-pane-([^"]+)"/g)]
  .map(match => match[1]);
assert.deepEqual(initiallyActivePanes, ['home'],
  'initial pane state should match the initially active Dashboard navigation tab');
assert.doesNotMatch(root.innerHTML, /Coming (?:next|soon)/i,
  'completed features should not retain unfinished rebuild placeholder copy');

for (const pane of ['home', 'crimes', 'people', 'consumables', 'war', 'armoury']) {
  assert.match(root.innerHTML, new RegExp(`id="ocm-pane-${pane}"`),
    `classic shell should retain the ${pane} feature pane`);
}
for (const control of [
  'ocm-diagnostics-panel', 'ocm-fu-sheet', 'ocm-ff-key-input',
  'ocm-cfg-money-est', 'ocm-api-input', 'ocm-ts-key-input',
]) {
  assert.match(root.innerHTML, new RegExp(`id="${control}"`),
    `classic shell should retain the ${control} control`);
}
assert.match(root.innerHTML, /id="ocm-fu-save" class="ocm-cfg-btn"/,
  'Consumables settings should use the same compact control style as the old settings panel');
assert.match(root.innerHTML, /class="ocm-cfg-actions"/,
  'settings footer actions should use a responsive classic layout hook');
assert.match(root.innerHTML, /class="ocm-card ocm-feature-placeholder"/,
  'unopened rebuilt features should use a classic-aware placeholder card');
assert.match(root.innerHTML, /class="ocm-feature-launch"/,
  'rebuilt feature launch buttons should use the shared classic-aware button style');

const classicCssStart = source.indexOf('/* ═══════════ CLASSIC 3.36 SHELL ADAPTER');
assert.ok(classicCssStart >= 0, 'classic shell should ship a final modifier-scoped style adapter');
const classicCssEnd = source.indexOf('/* ═══════════ END CLASSIC 3.36 SHELL ADAPTER', classicCssStart);
assert.ok(classicCssEnd > classicCssStart, 'classic style adapter should have an explicit boundary');
const classicCss = source.slice(classicCssStart, classicCssEnd);
assert.match(classicCss, /#ocm-root\.ocm-ui2\.ocm-classic\s*\{/,
  'classic adapter should override the complete component root without removing ui2 features');
assert.match(classicCss, /#ocm-header\s*\{/,
  'classic adapter should style the compact header');
assert.match(classicCss, /#ocm-tabs\s*\{[\s\S]*?flex-direction:\s*row/,
  'classic adapter should make the main navigation horizontal');
assert.match(classicCss, /\.ocm-nav\.active::before\s*\{[\s\S]*?display:\s*none/,
  'classic adapter should remove the premium rail accent');
assert.match(classicCss, /\.ocm-card,[\s\S]*?\.ocm-tile,[\s\S]*?\.ocm-stat\s*\{[\s\S]*?background:\s*var\(--ocm-bg-card\)/,
  'classic adapter should restore flat neutral feature cards');
assert.match(classicCss, /@media\s*\(max-width:\s*720px\)[\s\S]*?#ocm-tabs\s*\{[\s\S]*?flex-wrap:\s*wrap/,
  'classic tabs should wrap on PDA-sized screens');
assert.match(classicCss, /#ocm-config-panel input:not\(\[type=color\]\),[\s\S]*?#ocm-config-panel select\s*\{[\s\S]*?border-radius:\s*4px\s*!important/,
  'classic settings controls should override the premium rounded input treatment');
assert.match(classicCss, /#ocm-theme-customize-btn\s*\{[\s\S]*?box-shadow:\s*none\s*!important/,
  'classic theme customization control should not retain the premium glow treatment');
assert.match(classicCss, /\.ocm-feature-placeholder[\s\S]*?filter:\s*none/,
  'classic unopened feature cards should remove premium icon glow');
assert.match(classicCss, /\.ocm-feature-launch\s*\{[\s\S]*?background:\s*none\s*!important/,
  'classic feature launch buttons should use the old flat control treatment');
assert.match(classicCss, /#ocm-stats-bar \.ocm-stat\s*\{[\s\S]*?display:\s*block/,
  'classic stat tiles should restore the 3.36 block layout instead of the rebuilt flex order');
assert.match(classicCss, /\.ocm-stat-label,[\s\S]*?\.ocm-stat-value\s*\{[\s\S]*?order:\s*initial/,
  'classic stat labels should appear before their values as they did in 3.36');
assert.match(classicCss, /@media\s*\(max-width:\s*900px\),\s*\(pointer:\s*coarse\)[\s\S]*?\.ocm-cfg-btn[\s\S]*?min-height:\s*44px/,
  'PDA settings buttons should expose 44px touch targets');
assert.match(classicCss, /@media\s*\(max-width:\s*900px\),\s*\(pointer:\s*coarse\)[\s\S]*?#ocm-config-close[\s\S]*?min-width:\s*44px/,
  'PDA settings close control should remain comfortably reachable');
assert.match(classicCss, /@media\s*\(max-width:\s*720px\)[\s\S]*?\.ocm-cfg-label\s*>\s*span\s*\{[\s\S]*?display:\s*block/,
  'PDA setting explanations should move below their compact labels');
assert.match(classicCss, /\.ocm-cfg-actions\s*\{[\s\S]*?flex-wrap:\s*wrap/,
  'settings footer actions should wrap instead of overflowing narrow PDA panes');
assert.doesNotMatch(classicCss, /var\(--ocm-border-hi\)/,
  'classic controls should not reference an undefined border token');

const initTabsSource = sourceBlock('  function initTabs()', '\n  /** Pulls (N) counts');
assert.match(initTabsSource, /setAttribute\('aria-selected'/,
  'tab activation should keep accessible selected state synchronized');
assert.match(initTabsSource, /addEventListener\('keydown'/,
  'classic tab strips should support keyboard interaction');
assert.match(initTabsSource, /ArrowLeft|ArrowRight/,
  'classic tab strips should support arrow-key navigation');

console.log('OC Suite classic UI shell behavior checks passed');
