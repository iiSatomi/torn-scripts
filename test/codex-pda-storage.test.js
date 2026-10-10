const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.resolve(__dirname, '..', 'Torn_OC_Suite_Codex.user.js');
const source = fs.readFileSync(scriptPath, 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist in the userscript`);
  const signatureEnd = source.indexOf(') {', start);
  assert.notEqual(signatureEnd, -1, `${name} must have a normal function body`);
  const brace = signatureEnd + 2;
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') { blockComment = false; i++; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not find the end of ${name}`);
}

function loadFactory() {
  const code = `${extractFunction('createOcBulkStore')}; createOcBulkStore;`;
  return vm.runInNewContext(code, { setTimeout, clearTimeout, Promise, Map, Set });
}

async function testNativeMigrationAndBatching() {
  const nativeValues = new Map([['already-native', 'native-value']]);
  const writes = [];
  const legacy = new Map([
    ['needs-migration', 'legacy-value'],
    ['already-native', 'stale-legacy'],
  ]);
  const env = {
    PDA_storage: {
      async getMany(keys) {
        return Object.fromEntries(keys.map(key => [key, nativeValues.has(key) ? nativeValues.get(key) : null]));
      },
      async setMany(values) {
        writes.push({ ...values });
        for (const [key, value] of Object.entries(values)) nativeValues.set(key, value);
      },
      async delete(key) { nativeValues.delete(key); },
      async usage() { return { used: 128, quota: 1024 }; },
    },
  };
  const createOcBulkStore = loadFactory();
  const store = createOcBulkStore(env, {
    getFallback: (key, def) => legacy.has(key) ? legacy.get(key) : def,
    setFallback: (key, value) => legacy.set(key, value),
    deleteFallback: key => legacy.delete(key),
    debounceMs: 0,
  });

  await store.init(['needs-migration', 'already-native', 'empty']);
  assert.equal(store.getRaw('needs-migration', ''), 'legacy-value');
  assert.equal(store.getRaw('already-native', ''), 'native-value');
  assert.equal(writes.length, 1, 'legacy migration should use one setMany round-trip');
  assert.deepEqual(writes[0], { 'needs-migration': 'legacy-value' });

  store.setRaw('needs-migration', 'next');
  store.setRaw('empty', 'filled');
  await store.flush();
  assert.equal(writes.length, 2, 'normal writes should be batched');
  assert.deepEqual(writes[1], { 'needs-migration': 'next', empty: 'filled' });

  const snapshot = store.snapshot();
  assert.equal(snapshot.mode, 'pda-native');
  assert.equal(snapshot.migrations, 1);
  assert.equal(snapshot.pending, 0);
  assert.equal(snapshot.lastError, '');
  assert.deepEqual(await store.usage(), { used: 128, quota: 1024 });
}

async function testDesktopFallback() {
  const legacy = new Map();
  const createOcBulkStore = loadFactory();
  const store = createOcBulkStore({}, {
    getFallback: (key, def) => legacy.has(key) ? legacy.get(key) : def,
    setFallback: (key, value) => legacy.set(key, value),
    deleteFallback: key => legacy.delete(key),
    debounceMs: 0,
  });
  await store.init(['ledger']);
  store.setRaw('ledger', '{"a":1}');
  assert.equal(store.getRaw('ledger', '{}'), '{"a":1}');
  assert.equal(store.snapshot().mode, 'gm-fallback');
}

async function testQuotaFailureDegradesToFallback() {
  const legacy = new Map();
  const env = {
    PDA_storage: {
      async getMany(keys) { return Object.fromEntries(keys.map(key => [key, null])); },
      async setMany() { const error = new Error('full'); error.code = 'QuotaExceeded'; throw error; },
      async delete() {},
      async usage() { return { used: 1024, quota: 1024 }; },
    },
  };
  const createOcBulkStore = loadFactory();
  const store = createOcBulkStore(env, {
    getFallback: (key, def) => legacy.has(key) ? legacy.get(key) : def,
    setFallback: (key, value) => legacy.set(key, value),
    deleteFallback: key => legacy.delete(key),
    debounceMs: 0,
  });
  await store.init(['ledger']);
  store.setRaw('ledger', 'safe-copy');
  await store.flush();
  assert.equal(legacy.get('ledger'), 'safe-copy', 'quota failure must preserve a GM fallback copy');
  assert.equal(store.getRaw('ledger', ''), 'safe-copy');
  assert.equal(store.snapshot().lastError, 'QuotaExceeded');
}

async function main() {
  await testNativeMigrationAndBatching();
  await testDesktopFallback();
  await testQuotaFailureDegradesToFallback();
  assert.match(source, /OCBulkStore\.getRaw\(PROFIT_STORE_KEY/);
  assert.match(source, /OCBulkStore\.setRaw\(PROFIT_STORE_KEY/);
  assert.match(source, /OCBulkStore\.getRaw\(GMK\.OC_ARCHIVE/);
  assert.match(source, /OCBulkStore\.setRaw\(GMK\.OC_ARCHIVE/);
  assert.match(source, /OCBulkStore\.getRaw\(PS_CACHE_KEY/,
    'Consumables personal-stat cache should use the PDA bulk store');
  assert.match(source, /OCBulkStore\.setRaw\(PS_CACHE_KEY/,
    'Consumables personal-stat cache writes should use the PDA bulk store');
  assert.doesNotMatch(source, /localStorage\.(?:getItem|setItem|removeItem)\((?:UI_KEY|SETTINGS_KEY|CALL_LOG_KEY|PS_CACHE_KEY)/,
    'Consumables must not persist directly into Torn shared localStorage');
  assert.doesNotMatch(source, /OCBulkStore\.getRaw\(GMK\.API_KEY/,
    'API keys must remain outside bulk diagnostic/cache storage');
  console.log('codex PDA storage tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
