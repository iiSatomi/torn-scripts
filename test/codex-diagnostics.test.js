const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'Torn_OC_Suite_Codex.user.js'), 'utf8');

assert.match(source, /const _ocmDiagnostics\s*=\s*\{/,
  'Codex should own a bounded diagnostics store');
assert.match(source, /function _ocmDiagSnapshot\(\)/,
  'Codex should expose a diagnostics snapshot builder');
assert.match(source, /function _ocmDiagReport\(\)/,
  'Codex should expose a redacted diagnostics report builder');
assert.match(source, /performance\.memory/,
  'memory diagnostics should use the Chromium heap API when available');
assert.match(source, /ocm-diagnostics-panel/,
  'Config should contain the diagnostics panel');
assert.match(source, /ocm-diagnostics-refresh/,
  'Config should contain a manual refresh action');
assert.match(source, /ocm-diagnostics-copy/,
  'Config should contain a safe report copy action');
assert.match(source, /aria-live="polite"/,
  'diagnostics status should be announced accessibly');
assert.match(source, /storage:\s*OCBulkStore\.snapshot\(\)/,
  'diagnostics snapshot should include sanitized bulk-storage state');
assert.match(source, /bulk storage/,
  'diagnostics panel should explain the active bulk-storage mode');

const reportStart = source.indexOf('function _ocmDiagReport()');
const reportEnd = source.indexOf('\n  // ───', reportStart);
assert.ok(reportStart >= 0 && reportEnd > reportStart, 'report helper block should be bounded');
const report = source.slice(reportStart, reportEnd);
assert.doesNotMatch(report, /apiKey|readSecret|GM_getValue\(GMK\.API_KEY/,
  'the safe report builder must not read or serialize secrets');
assert.match(report, /storage:\s*s\.storage/,
  'the safe report should include storage mode/counters without stored values');
assert.match(source, /_ocmDiagRecord\('Torn API'/,
  'Torn API activity should be recorded');
assert.match(source, /_ocmDiagRecord\('Usage API'/,
  'Usage Command API activity should be recorded');

console.log('codex diagnostics contracts passed');
