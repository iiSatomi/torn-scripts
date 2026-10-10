const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'reference', 'Torn_OC_Suite_PurrfectCrime.user.js');
const source = fs.readFileSync(SCRIPT, 'utf8');

function extractFunction(name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\s*\\(`));
  assert(match, `${name} must exist`);
  const start = source.indexOf('{', match.index);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (escaped) { escaped = false; continue; }
    if (quote) {
      if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(match.index, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

(async () => {
  const requests = [];
  const apiFetchV1 = Function('API_BASE_V1', 'tornApiGet',
    `return (${extractFunction('apiFetchV1')})`)(
      'https://api.torn.com',
      async (url) => { requests.push(url); return {}; },
    );

  await apiFetchV1('/faction?selections=utilities', 'test-key');
  assert.strictEqual(
    requests[0],
    'https://api.torn.com/faction?selections=utilities&key=test-key&comment=OCSuite',
    'armory calls must use API v1, where faction armory selections are supported',
  );

  const fetchAll = source.slice(source.indexOf('async function fetchAll('), source.indexOf('\n  // ─── BUILD UI', source.indexOf('async function fetchAll(')));
  assert(
    fetchAll.includes("apiFetchV1('/faction?selections=utilities'"),
    'fetchAll must route the utilities armory selection through API v1',
  );
  assert(
    fetchAll.includes('catList.map(cat => apiFetchV1(`/faction?selections=${ARMORY_CATS[cat].selection}`'),
    'fetchAll must route every conditional armory selection through API v1',
  );

  console.log('loan-endpoint: PASS');
})().catch((error) => {
  console.error('loan-endpoint: FAIL');
  console.error(error.message);
  process.exitCode = 1;
});
