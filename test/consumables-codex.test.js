const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const originalPath = path.join(root, 'scripts', 'reference', 'Torn_OC_Suite_PurrfectCrime.user.js');
const codexPath = path.join(root, 'Torn_OC_Suite_Codex.user.js');

assert.ok(fs.existsSync(originalPath), 'original suite must exist');
assert.ok(fs.existsSync(codexPath), 'Codex suite variant must exist');

const original = fs.readFileSync(originalPath, 'utf8');
const codex = fs.readFileSync(codexPath, 'utf8');

assert.match(codex, /@name\s+Torn OC Suite Codex/);
assert.match(codex, /@version\s+3\.37\.0-codex\d+/,
  'Codex variant should remain on the versioned Codex release line');
for (const grant of ['GM_getValue', 'GM_setValue', 'GM_addStyle', 'GM_xmlHttpRequest']) {
  assert.match(codex, new RegExp(`@grant\\s+${grant}`), `missing ${grant} grant`);
}
assert.match(codex, /let _ocmInjectRouteHandler\s*=\s*null;/, 'memory lifecycle fix must be carried into Codex');
assert.ok(codex.length >= original.length - 1000, 'Codex baseline must retain the suite implementation');

const renderStart = codex.indexOf('  function _consMembers');
const mountStart = codex.indexOf('function mountConsumablesInline()', renderStart);
assert.ok(renderStart >= 0 && mountStart > renderStart, 'native Consumables renderer must exist');
const consumablesBlock = codex.slice(renderStart, mountStart);
for (const helper of [
  'renderConsumablesHeader',
  'renderConsumablesPulse',
  'renderConsumablesAttention',
  'renderConsumablesLedger',
  'renderConsumablesTrends'
]) {
  assert.match(consumablesBlock, new RegExp(`function ${helper}\\(`), `missing ${helper}`);
}
for (const id of ['ocm-cons-pulse', 'ocm-cons-attention', 'ocm-cons-ledger', 'ocm-cons-trends']) {
  assert.match(consumablesBlock, new RegExp(`id=["']${id}["']`), `missing ${id}`);
}
assert.match(consumablesBlock, /aria-live=["']polite["']/);
assert.match(consumablesBlock, /type=["']search["']/);
assert.doesNotMatch(consumablesBlock, /OCUI\.grid\(fields\.map/,
  'native Consumables renderer must not rebuild the old equal-weight tile wall');

console.log('consumables Codex baseline checks passed');
