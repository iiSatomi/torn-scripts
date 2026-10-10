const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('Torn Gym Planner-3.36.txt', 'utf8');

assert.match(source, /function\s+updateInfobar\s*\(currentE,\s*maxE,/,
  'the freshness strip should have a dedicated energy-cap parameter');
assert.match(source, /updateInfobar\(effectiveEnergy,\s*api\?\.energyCap\s*\?\?\s*null,/,
  'API autofill should pass the field produced by fetchFromAPI');
assert.doesNotMatch(source, /updateInfobar\(effectiveEnergy,\s*api\?\.energyMax\b/,
  'API autofill must not use the removed energyMax field');

console.log('Gym infobar energy-cap contract checks passed');
