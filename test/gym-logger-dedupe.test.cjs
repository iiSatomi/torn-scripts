const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('Torn Gym Planner-3.36.txt', 'utf8');
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

const isDuplicate = new Function('LOG_DEDUPE_MS',
  `${extractFunction('isDuplicateTrainLog')}
   return isDuplicateTrainLog;`)(30000);
const base = { ts: 1000, stat: 'speed', actualGain: 1000, newStat: 101000, energyUsed: 100 };

assert.equal(isDuplicate(base, { ...base, ts: 2000 }), true,
  'the same result emitted twice should deduplicate');
assert.equal(isDuplicate(base, { ...base, ts: 2000, newStat: 102000 }), false,
  'a rapid second train with a new resulting stat should be retained');
assert.equal(isDuplicate({ ...base, newStat: 0 }, { ...base, newStat: 0, ts: 2000 }), true,
  'legacy rows should use equal verified energy as their fallback identity');
assert.equal(isDuplicate({ ...base, newStat: 0, energyUsed: null }, { ...base, newStat: 0, energyUsed: null, ts: 2000 }), false,
  'rows without an identity must not suppress a new result');

console.log('Gym logger dedupe contract checks passed');
