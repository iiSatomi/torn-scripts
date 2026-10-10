const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Torn Gym Planner-3.36.txt'), 'utf8');

assert.match(source, /function\s+jumpCycleHours\s*\(/,
  'jump projections should centralize drug, booster, and daily-refill cadence');
assert.match(source, /jumpCycleHours\(XAN_CD_MIN\s*\*\s*xanaxCount,\s*boosterCD,\s*useRefill\)/,
  'the legacy jump view should use the shared cadence helper');
assert.match(source, /jumpCycleHours\(drugCD,\s*boosterCD,\s*cfg\.refill\)/,
  'the shared jump simulator should use the shared cadence helper');
assert.match(source, /row\("Cycle gate",/,
  'the jump timing panel should explain the two independent cooldown gates');
assert.doesNotMatch(source, /effectiveCD\s*\+\s*\(useRefill\s*\?\s*energyCap\s*\/\s*natEPerHr/,
  'a refill supplies energy immediately and must not add five hours to every jump');
assert.match(source, /Math\.max\([^\n]*useRefill\s*\?\s*24\s*:\s*0/,
  'a once-per-day refill should impose a 24-hour minimum cadence when selected');

const start = source.indexOf('function jumpCycleHours(');
const open = source.indexOf('{', start);
let depth = 0;
let end = -1;
for (let i = open; i < source.length; i += 1) {
  if (source[i] === '{') depth += 1;
  if (source[i] === '}' && --depth === 0) { end = i + 1; break; }
}
assert.ok(end > 0, 'cadence helper should have a complete function body');
const cadence = new Function(`${source.slice(start, end)}\nreturn jumpCycleHours;`)();

assert.equal(cadence(24, 30, false), 30);
assert.equal(cadence(6, 2, true), 24,
  'a daily refill cannot be modeled as a five-hour additive wait');
assert.equal(cadence(36, 30, true), 36);

console.log('Gym refill cadence contract checks passed');
