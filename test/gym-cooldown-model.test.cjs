const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Torn Gym Planner-3.36.txt'), 'utf8');

assert.match(source, /function\s+xanaxCooldownHours\s*\(/,
  'all Xanax projections should share one cooldown helper');
assert.match(source, /xanaxCooldownHours\(xan\)/,
  'shared drug simulation should use the four-dose cooldown rule');
assert.match(source, /xanaxCooldownHours\(r\.xanax\)/,
  'tier construction should use the same cooldown rule');
assert.match(source, /xanaxCooldownHours\(4\)/,
  'eDVD trade-off should use the same cooldown rule');
assert.doesNotMatch(source, /const\s+drugCD\s*=\s*XAN_CD_AVG\s*\*\s*xan\s*;/,
  'shared simulation must not assume 7h for every Xanax dose');

const start = source.indexOf('function xanaxCooldownHours(');
const open = source.indexOf('{', start);
let depth = 0;
let end = -1;
for (let i = open; i < source.length; i += 1) {
  if (source[i] === '{') depth += 1;
  if (source[i] === '}' && --depth === 0) { end = i + 1; break; }
}
assert.ok(end > 0, 'cooldown helper should have a complete function body');
const cooldown = new Function('XAN_CD_AVG', 'XAN_CD_MIN',
  `${source.slice(start, end)}\nreturn xanaxCooldownHours;`
)(7, 6);

assert.equal(cooldown(0), 0);
assert.equal(cooldown(3), 21);
assert.equal(cooldown(4), 24,
  'four Xanax should use four guaranteed six-hour cooldowns');

console.log('Gym cooldown model contract checks passed');
