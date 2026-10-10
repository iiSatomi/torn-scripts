const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Torn Gym Planner-3.36.txt'), 'utf8');

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

test('API error responses are counted without rejecting the response', async () => {
  const runtimeDiagnostics = { apiCalls: 0, apiErrors: 0, lastApiTs: 0, lastApiErrorCode: null };
  let request;
  const GM_xmlhttpRequest = options => { request = options; };
  const gmFetch = new Function('runtimeDiagnostics', 'GM_xmlhttpRequest',
    `${extractFunction('gmFetch')}\nreturn gmFetch;`)(runtimeDiagnostics, GM_xmlhttpRequest);

  const pending = gmFetch('https://api.torn.com/user/');
  request.onload({ responseText: JSON.stringify({ error: { code: 17, error: 'Too many requests' } }) });
  const response = await pending;

  assert.equal(response.error.code, 17);
  assert.equal(runtimeDiagnostics.apiCalls, 1);
  assert.equal(runtimeDiagnostics.apiErrors, 1);
  assert.equal(runtimeDiagnostics.lastApiErrorCode, 17);
});

console.log('Gym API diagnostics checks passed');
