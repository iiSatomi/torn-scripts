const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Torn Gym Planner-3.36.txt'), 'utf8');

assert.match(source, /<style\s+data-torn-gym-planner-style=["']base["']>/,
  'base styles should be owned by the gym planner');
assert.match(source, /styleEl\.dataset\.tornGymPlannerStyle\s*=\s*["']planner["']/,
  'planner styles should be owned by the gym planner');
assert.match(source, /querySelectorAll\(["']style\[data-torn-gym-planner-style\]["']\)/,
  'cleanup should find every gym planner style node');
assert.match(source, /data-torn-gym-planner-style\][\s\S]{0,180}\.remove\(\)/,
  'cleanup should remove owned style nodes');

console.log('Gym style lifecycle checks passed');
