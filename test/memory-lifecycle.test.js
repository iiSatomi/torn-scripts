const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const files = [
  path.join(__dirname, '..', 'scripts', 'reference', 'Torn_OC_Suite_PurrfectCrime.user.js'),
  path.join(__dirname, '..', 'Torn_OC_Suite_Codex.user.js'),
];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const injectStart = source.indexOf('  function inject() {');
  const sidebarStart = source.indexOf('  function injectSidebar() {', injectStart);
  assert.ok(injectStart >= 0 && sidebarStart > injectStart, `${file}: inject lifecycle block must exist`);
  const injectBlock = source.slice(injectStart, sidebarStart);

  assert.match(source, /let _ocmInjectRouteHandler\s*=\s*null;/,
    `${file}: route handler must have one shared lifecycle slot`);
  assert.match(injectBlock, /if \(!_ocmInjectRouteHandler\)\s*\{[\s\S]*_ocmInjectRouteHandler\s*=\s*\(\)\s*=>/,
    `${file}: inject must install the route handler only once`);
  assert.doesNotMatch(injectBlock, /window\.addEventListener\(['"]hashchange['"],\s*\(\)\s*=>/,
    `${file}: inject must not add a fresh hashchange closure on every off-route call`);
}

console.log('memory lifecycle regression checks passed for current and Codex variants');
