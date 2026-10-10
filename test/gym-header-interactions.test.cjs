const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('Torn Gym Planner-3.36.txt', 'utf8');
assert.match(source,
  /\.gg-header"\)\.addEventListener\("click",\s*e\s*=>\s*\{[\s\S]*?e\.target\?\.closest\?\.\("button"\)\)\s*return;/,
  'header collapse should ignore clicks on its action buttons');

console.log('Gym header interaction contract checks passed');
