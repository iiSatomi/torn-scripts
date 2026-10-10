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

assert.match(source, /const\s+STANDARD_GYM_PROGRESS\s*=\s*Object\.freeze\(/,
  'planner should keep the verified standard-gym energy estimates in one table');
assert.match(source, /31:\s*\{[\s\S]*?drugLimited:\s*true/,
  'Sports Science Lab should remain identified as drug-limited');
assert.match(source, /150\s+Xanax.*Ecstasy/i,
  'Sports Science Lab should use the current 150 combined-drug requirement');
assert.match(source, /Estimated\s+energy\s+for\s+the\s+next\s+gym/i,
  'the UI should label gym progression estimates as estimates');
assert.match(source, /Allowed\s+for\s+this\s+build/i,
  'build guidance should explicitly separate allowed training from forbidden drift');

const code = `${extractFunction('calculateGymProgress')}\nreturn calculateGymProgress;`;
const progress = new Function('STANDARD_GYM_PROGRESS', code)({
  18: { nextId: 19, estimatedEnergy: 36610 },
  24: { nextId: null, estimatedEnergy: null },
});

assert.deepEqual(progress(18, 10000), {
  state: 'in-progress', currentGymId: 18, nextGymId: 19,
  estimatedEnergy: 36610, energySpent: 10000, energyRemaining: 26610,
}, 'tracker should calculate remaining energy from the saved current-gym total');
assert.equal(progress(18, 50000).state, 'ready',
  'tracker should mark the next gym ready once the estimate is met');
assert.equal(progress(18, -1).energySpent, 0,
  'tracker should clamp invalid negative energy input');
assert.deepEqual(progress(24, 0), {
  state: 'complete', currentGymId: 24, nextGymId: null,
  estimatedEnergy: null, energySpent: 0, energyRemaining: 0,
}, 'George\'s should report that standard gym progression is complete');
assert.equal(progress(999, 0).state, 'unknown',
  'unknown or specialist gyms should not invent a standard progression estimate');

console.log('Gym build and energy-progress checks passed');
