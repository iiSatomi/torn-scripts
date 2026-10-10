const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Torn Gym Planner-3.36.txt'), 'utf8');

assert.match(source, /const\s+refillStartHappy\s*=\s*fhcCount\s*>\s*0\s*\?\s*fhcBlock\.finalHappy\s*:\s*stackBlock\.finalHappy/,
  'legacy happy-jump refill should begin at the post-stack happiness');
assert.match(source, /simulateBlock\(dots,\s*statNow\s*\+\s*gainStack,\s*refillStartHappy,[\s\S]*?Math\.floor\(energyCap\s*\/\s*ePerTrain\)\)\.totalGain/,
  'legacy happy-jump refill should preserve post-stack happiness without an instant reset');
assert.match(source, /const\s+postStackHappy\s*=\s*fhc\s*>\s*0\s*\?\s*fb\.finalHappy\s*:\s*sb\.finalHappy/,
  'shared jump simulation should carry happiness through the jump stack');
assert.match(source, /simulateBlock\(c\.dots,\s*c\.statNow\s*\+\s*sb\.totalGain\s*\+\s*fb\.totalGain,\s*postStackHappy,[\s\S]*?Math\.floor\(c\.cap\/c\.ePerTrain\)\)/,
  'shared refill simulation should preserve post-stack happiness without an instant reset');
assert.match(source, /const\s+jumpAfterStackHappy\s*=\s*fhcCount\s*>\s*0\s*\?\s*fb\.finalHappy\s*:\s*sb\.finalHappy/,
  'goal projections should carry post-stack happiness into refill trains');
assert.match(source, /const\s+compareRefillHappy\s*=\s*_fhcRes\.finalHappy/,
  'compare projections should carry post-stack happiness into refill trains');
assert.match(source, /const\s+compareJumpHappy\s*=\s*fhcCount\s*>\s*0\s*\?\s*fb\.finalHappy\s*:\s*sb\.finalHappy/,
  'compare goal projections should carry post-stack happiness into refill trains');
assert.match(source, /const\s+plannedRefillHappy\s*=\s*fb\.finalHappy/,
  'recommended schedules should carry post-stack happiness into refill trains');
assert.match(source, /const\s+totalSessionEnergy\s*=\s*p\.xanStackE\s*\+\s*fhcEnergy\s*\+\s*\(useRefill\s*\?\s*energyCap\s*:\s*0\)/,
  'happy-jump energy summary should include the optional refill energy');

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

const simulateBlock = new Function('calcGain', 'happyDecay',
  `${extractFunction('simulateBlock')}\nreturn simulateBlock;`
)((_dots, _stat, happy) => happy, () => 100);

const afterStack = simulateBlock(6, 1000, 4000, 1, 10, {}, 2, 0);
assert.equal(afterStack.finalHappy, 3800,
  'training should reduce the happiness carried into the refill block');
assert.notEqual(afterStack.finalHappy, 4000,
  'a refill block must not reset happiness to property max');

console.log('Gym refill happiness-order contract checks passed');
