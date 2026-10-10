const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Torn Gym Planner-3.36.txt'), 'utf8');

assert.match(source, /function\s+readManualOwnedGyms\s*\(/,
  'manual owned-gym cache should have a defensive reader');
assert.match(source, /readManualOwnedGyms\(\)/,
  'best-gym ranking should use the defensive owned-gym reader');
const rankStart = source.indexOf('function getOwnedGymsForStat(');
const rankEnd = source.indexOf('function updateBestGymNudge(', rankStart);
assert.ok(rankStart >= 0 && rankEnd > rankStart, 'best-gym ranking function should be present');
assert.doesNotMatch(source.slice(rankStart, rankEnd), /JSON\.parse\(_load\('manualGymOwned'/,
  'best-gym ranking must not parse the raw cache inline');
assert.doesNotMatch(source, /JSON\.parse\(_load\(["']manualGymOwned/,
  'all owned-gym cache consumers should use the defensive reader');
assert.match(source, /function\s+logLoad\s*\(\)\s*\{\s*try\s*\{\s*const\s+parsed\s*=/,
  'gain-log loading should reject valid JSON with the wrong top-level shape');
assert.match(source, /function\s+loadManualInventory\s*\(\)[\s\S]*?const\s+raw\s*=\s*_load\(MANUAL_INV_KEY[\s\S]*?typeof raw\s*===\s*["']string["']/,
  'manual inventory loading should tolerate GM storage returning an object');
assert.match(source, /function\s+nwHistory\s*\(\)[\s\S]*?typeof raw\s*===\s*["']string["']/,
  'net-worth history loading should tolerate structured GM storage values');

console.log('Gym storage safety contract checks passed');
