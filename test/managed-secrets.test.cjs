'use strict';
const assert = require('node:assert/strict');
const { scanText, validatePath, formatFindings } = require('../tools/check-managed-secrets.cjs');
const key = ['aB9x', '7Qm2', 'kL4v', '8Np6'].join('');
for (const source of [
  'const apiKey = "' + key + '";',
  'const settings = {"api_key":"' + key + '"};',
  'const personalApiKey = "' + key + '";',
  'const sharedApiKey = "' + key + '";',
  'https://api.torn.com/?key=' + key,
  'const password = "' + key + '";',
  'const password = "' + key.slice(0, 11) + '!";',
  ['ghp', '_', 'x'.repeat(36)].join(''),
  ['-----BEGIN ', 'RSA PRIVATE KEY-----'].join(''),
]) {
  const findings = scanText('example.js', source);
  assert.ok(findings.length, 'credential-like material must block publication');
  assert.ok(!formatFindings(findings).includes(key), 'diagnostics never include credential values');
}
assert.deepEqual(scanText('example.js', 'const apiKey = readSettings(); const token = generation;'), []);
assert.deepEqual(scanText('example.js', 'const apiKey = "";'), []);
assert.equal(scanText('example.js', '\nconst apiKey = "' + key + '";')[0].line, 2);
for (const file of ['../outside.js', '/absolute.js', 'archive/source.js', '.env', 'capture.png', 'browser/storageState.json', 'node_modules/code.js']) {
  assert.throws(() => validatePath(file));
}
assert.equal(validatePath('script-hub/src/script-hub-credentials.cjs'), true);
console.log('PASS managed secret detection, redacted diagnostics, and upload path restrictions');
