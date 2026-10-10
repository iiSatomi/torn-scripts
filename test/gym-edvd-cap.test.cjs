const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('Torn Gym Planner-3.36.txt', 'utf8');
assert.match(source, /const\s+requestedEdvdCount\s*=\s*gi\(el\.hjEDVDs\)/,
  'the jump planner should retain the user-requested eDVD count');
assert.match(source, /const\s+maxEdvdCount\s*=\s*boosterFit\(24\s*\+\s*voracity,\s*EDVD_CD\)/,
  'the feasible eDVD maximum should follow the Voracity cap');
assert.match(source, /const\s+edvdCount\s*=\s*Math\.min\(requestedEdvdCount,\s*maxEdvdCount\)/,
  'the gain and cost model should use only feasible eDVDs');
assert.match(source, /requestedEdvdCount\s*>\s*maxEdvdCount[\s\S]*projection uses/,
  'the UI should disclose when it corrected an impossible request');
assert.match(source, /function\s+updateEdvdLimit\s*\(\)[\s\S]*?el\.hjEDVDs\.max\s*=\s*String\(max\)/,
  'the form control should expose the same dynamic maximum as the calculator');

console.log('Gym eDVD cap contract checks passed');
