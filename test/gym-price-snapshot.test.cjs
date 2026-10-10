const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Torn Gym Planner-3.36.txt'), 'utf8');
const start = source.indexOf('function applyPriceData(');
assert.ok(start >= 0, 'source should contain applyPriceData');
const end = source.indexOf('\n    }\n', start);
assert.ok(end > start, 'applyPriceData should have a complete function body');
const body = source.slice(start, end);

assert.match(body, /allItemPrices\s*=\s*\{\};/, 'a new price snapshot must discard stale main-item prices');
assert.match(body, /canPrices\s*=\s*\{\};/, 'a new price snapshot must discard stale can prices');
assert.match(body, /candyPrices\s*=\s*\{\};/, 'a new price snapshot must discard stale candy prices');

console.log('Gym price snapshot checks passed');
