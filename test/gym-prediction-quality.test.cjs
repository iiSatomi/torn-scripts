const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Torn Gym Planner-3.36.txt'), 'utf8');

// The production artifact is a single IIFE, so this contract protects the
// logger boundary without evaluating it against a real Torn page.
assert.match(source, /function\s+summarizePredictionQuality\s*\(/,
  'logger should expose a bounded prediction-quality summary helper');
assert.match(source, /gg-log-quality/,
  'logger should render a dedicated prediction-quality panel');
assert.match(source, /Prediction quality/i,
  'quality panel should be understandable without inspecting raw entries');
assert.match(source, /within 10%/i,
  'quality panel should report a useful accuracy threshold');
assert.match(source, /unknownCount/,
  'quality summary should keep unknown-energy rows out of accuracy metrics');
assert.match(source, /outlierCount/,
  'quality summary should report excluded outliers');
assert.match(source, /meanAbsoluteErrorPct/,
  'quality summary should report mean absolute error');
assert.match(source, /const\s+LOG_MAX_ENTRIES\s*=\s*2000/,
  'logger storage should have a hard row cap for long-running accounts');
assert.match(source, /const\s+LOG_MAX_BYTES\s*=\s*900000/,
  'logger storage should have a serialized byte cap for large PDA entries');
assert.match(source, /const\s+LOG_DISPLAY_ENTRIES\s*=\s*200/,
  'logger DOM rendering should have a smaller visible-row cap than storage');
assert.match(source, /slice\(\s*-LOG_MAX_ENTRIES\s*\)/,
  'logger pruning should retain only the newest bounded rows');
assert.match(source, /const\s+displayFrom\s*=\s*Math\.max\(0,\s*all\.length\s*-\s*LOG_DISPLAY_ENTRIES\)/,
  'logger rendering should select only the newest visible rows');
assert.match(source, /KiB stored/,
  'logger quality panel should expose approximate storage usage');
assert.match(source, /id="gg-diagnostics"/,
  'setup should expose a user-facing runtime diagnostics panel');
assert.match(source, /Network\/API requests this page/,
  'diagnostics should show this-page API request count');
assert.match(source, /performance\.memory\?\.usedJSHeapSize/,
  'diagnostics should report heap usage when the browser exposes it');
assert.match(source, /typeof\s+resultObserverQueue\s*!==\s*["']undefined["']/,
  'diagnostics should show pending observer work without assuming the queue exists');
assert.match(source, /LOG_MAX_BYTES/,
  'logger pruning should enforce the serialized byte cap');
assert.match(source, /const\s+savedEntries\s*=\s*logPrune\(entries\)/,
  'new logger rows should be pruned before they are persisted');
assert.match(source, /if\s*\(!all\.length\)[\s\S]*?q\("#gg-log-quality"\)[\s\S]*?innerHTML\s*=\s*""/,
  'clearing the final row should also clear stale prediction-quality UI');
assert.match(source, /querySelectorAll\("\.gg-log-del"\)[\s\S]*?const\s+entries\s*=\s*logPrune\(logLoad\(\)\)/,
  'deleting a visible row should use the same pruned view as the rendered table');

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

const summarize = new Function('predictEntry', 'OUTLIER_THRESHOLD',
  `${extractFunction('summarizePredictionQuality')}\nreturn summarizePredictionQuality;`
)((entry) => entry.predicted, 0.5);

const quality = summarize([
  { energySource: 'result', actualGain: 105, predicted: 100, gymDots: 6 },
  { energySource: 'unknown', actualGain: 100, predicted: 100, gymDots: 6 },
  { energySource: 'result', actualGain: 200, predicted: 100, gymDots: 6 },
  { energySource: 'result', actualGain: 100, predicted: 0, gymDots: 6 },
]);
assert.deepEqual({
  validCount: quality.validCount,
  unknownCount: quality.unknownCount,
  outlierCount: quality.outlierCount,
  within10Count: quality.within10Count,
}, { validCount: 1, unknownCount: 2, outlierCount: 1, within10Count: 1 },
  'quality summary should separate usable, unknown, invalid, and outlier rows');
assert.equal(Number(quality.meanAbsoluteErrorPct.toFixed(2)), 5,
  'quality summary should calculate absolute percentage error');

const prune = new Function('LOG_TTL', 'LOG_MAX_ENTRIES', 'LOG_MAX_BYTES', 'Date',
  `${extractFunction('logPrune')}\nreturn logPrune;`
)(30 * 24 * 60 * 60 * 1000, 2000, 900000, { now: () => 1_000_000 });
const rows = Array.from({ length: 2105 }, (_, i) => ({ id: i, ts: 1_000_000 }));
rows.push({ id: 'stale', ts: -4_000_000_000 });
const kept = prune(rows);
assert.equal(kept.length, 2000, 'log pruning should enforce the hard row cap');
assert.equal(kept[0].id, 105, 'log pruning should retain the newest rows');

const largeRows = Array.from({ length: 20 }, (_, i) => ({ id: i, ts: 1_000_000, payload: 'x'.repeat(100000) }));
const boundedLarge = prune(largeRows);
assert.ok(JSON.stringify(boundedLarge).length <= 900000,
  'log pruning should keep serialized storage below the memory budget');
assert.equal(boundedLarge.at(-1).id, 19, 'byte pruning should retain the newest row');

console.log('Gym prediction quality contract checks passed');
