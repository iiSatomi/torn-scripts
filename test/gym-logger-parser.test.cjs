const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Torn Gym Planner-3.36.txt'), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `production should define ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`could not extract ${name}`);
}

const parse = new Function('STAT_KEYS', 'getGymData',
  `${extractFunction('parseTrainResultText')}
   return parseTrainResultText;`)({
  strength: 'str', speed: 'spd', defense: 'def', dexterity: 'dex',
}, () => ({ energy: 10 }));

const full = parse(
  "You used 100 energy and 0 happiness training your speed 10 times in George's\n" +
  'increasing it by 1,000.00 to 100,000.00',
);
assert.deepEqual(full, {
  gain: 1000,
  newStat: 100000,
  statKey: 'spd',
  energyUsed: 100,
  energySource: 'result',
}, 'desktop full result should parse into the shared schema');

const pda = parse('You have gained 2,247.56 speed');
assert.deepEqual(pda, {
  gain: 2247.56,
  newStat: 0,
  statKey: 'spd',
  energyUsed: null,
  energySource: 'unknown',
}, 'PDA short result should preserve unknown energy');

const pdaWithCount = parse('You gained 2,247.56 speed after training 10 times');
assert.equal(pdaWithCount.energyUsed, 100, 'short results with a train count should infer energy');
assert.equal(parse('This is not a train result'), null, 'unrelated page text should be ignored');

console.log('Gym logger parser contract checks passed');
