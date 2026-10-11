const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../Torn_OC_Suite_Codex.user.js'), 'utf8');
for (const field of ['downloadURL', 'updateURL']) {
  const value = source.match(new RegExp('^// @' + field + '\\s+(\\S+)', 'm'))?.[1];
  assert.equal(value, 'https://raw.githubusercontent.com/iiSatomi/torn-scripts/main/Torn_OC_Suite_Codex.user.js', `${field} must update this distribution`);
}
console.log('Codex distribution points to its maintained GitHub working copy.');
