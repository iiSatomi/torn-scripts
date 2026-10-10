const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Torn Gym Planner-3.36.txt'), 'utf8');

assert.match(source, /const\s+REFILL_POINTS\s*=\s*30\b/,
  'energy refill pricing should match the current official points cost');
assert.doesNotMatch(source, /const\s+REFILL_POINTS\s*=\s*25\b/,
  'the planner must not retain the retired 25-point refill price');
assert.match(source, /p\.points\s*>=\s*REFILL_POINTS/,
  'refill availability should use the shared current price');
assert.match(source, /Math\.floor\(p\.points\/REFILL_POINTS\)/,
  'refill quantity should use the shared current price');

console.log('Gym refill pricing contract checks passed');
