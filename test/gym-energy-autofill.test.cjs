const fs = require('node:fs');
const assert = require('node:assert/strict');

const source = fs.readFileSync('Torn Gym Planner-3.36.txt', 'utf8');

assert.match(source, /function readEnergyFromPage\(\)/, 'page energy reader should exist');
assert.match(source, /function readEnergyFromPageUncached\(\)/, 'page energy reader should keep the full scan isolated');
assert.match(source, /function readEnergyCapFromPage\(\)/, 'page energy reader should expose the live cap too');
assert.match(source, /pageEnergyCapCacheTs/, 'current energy and cap should share a short scan cache');
assert.match(source, /pageEnergyCacheTs/, 'page energy reader should collapse duplicate scans during one refresh');
assert.match(source, /const pageEnergy\s*=\s*readEnergyFromPage\(\)/, 'autofill should use the page energy reader');
assert.match(source, /el\.energy\.value\s*=\s*pageEnergy/, 'page energy should replace stale saved energy');
assert.match(source, /energy\\s*:?/i, 'reader should support the current Energy: label');
assert.match(source, /Live page shows/, 'validation should warn when saved energy differs from the page');
assert.match(source, /function\s+syncPageEnergy\s*\(/, 'startup should have a page-energy synchronizer');
assert.match(source, /syncPageEnergy\(\)/, 'startup should synchronize stale saved energy');
assert.match(source, /const pageCap = readEnergyCapFromPage\(\)/, 'startup should synchronize the live subscriber cap');
assert.match(source, /getClientRects\(\)\.length/, 'energy reader should ignore hidden or detached bars');
assert.match(source, /current\s*<=\s*1500/, 'energy reader should accept legitimate over-cap energy');
assert.doesNotMatch(source, /current\s*<=\s*cap\)/, 'energy reader must not reject over-cap energy');
const cacheDeclaration = source.indexOf('let pageEnergyCacheTs = 0');
const startupFunction = source.indexOf('function startup()');
assert.ok(cacheDeclaration >= 0 && startupFunction >= 0 && cacheDeclaration < startupFunction,
  'page energy cache state must initialize before startup reads page energy');

console.log('Gym energy autofill contract checks passed');
