const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Torn Gym Planner-3.36.txt'), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `source should contain ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`could not extract ${name}`);
}

assert.match(source, /data-gg-build-guard/,
  'native training controls should expose a stable build-guard marker');
assert.match(source, /aria-disabled/,
  'native training controls should communicate the guard to assistive technology');
assert.match(source, /function applyBuildTrainingGuards\(/,
  'planner should reapply training guards after Torn redraws');

const code = `${extractFunction('getBuildTrainingLimit')}\nreturn getBuildTrainingLimit;`;
const getLimit = new Function('STAT_KEYS', 'statLimits', code)({
  strength: 'str', speed: 'spd', defense: 'def', dexterity: 'dex',
}, (pathKey, stats) => ({
  rows: [
    { key: 'strength', bound: 'floor', max: null },
    { key: 'speed', bound: 'ceiling', max: 500000 },
    { key: 'defense', bound: 'ceiling', max: 500000 },
    { key: 'dexterity', bound: 'ceiling', max: null },
  ],
}));

const stats = { strength: 900000, speed: 250000, defense: 500000, dexterity: 100000 };
assert.deepEqual(getLimit('hank-speed', 'def', stats), {
  guarded: true, statKey: 'defense', current: 500000, limit: 500000,
  remaining: 0, atLimit: true,
}, 'a capped stat at its build limit should be blocked');

assert.deepEqual(getLimit('hank-speed', 'spd', stats), {
  guarded: true, statKey: 'speed', current: 250000, limit: 500000,
  remaining: 250000, atLimit: false,
}, 'a capped stat below its build limit should remain trainable');

assert.deepEqual(getLimit('hank-speed', 'str', stats), {
  guarded: false, statKey: 'strength', current: 900000,
  limit: null, remaining: null, atLimit: false,
}, 'a floor/uncapped whored stat should not be disabled by the guard');

console.log('Gym training guard checks passed');
