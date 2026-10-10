const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Torn Gym Planner-3.36.txt'), 'utf8');
const fixture = fs.readFileSync(path.join(root, 'test', 'browser', 'gym-local-live.html'), 'utf8');

assert.match(source, /const\s+INSTANCE_MARK\s*=\s*['"]data-torn-gym-planner-mounted['"]/,
  'planner should use a document-visible singleton marker');
assert.match(source, /documentRoot\?\.getAttribute\(INSTANCE_MARK\)\s*&&\s*document\.querySelector\('\.gg-wrap'\)\)\s*return/,
  'a second run should exit only while an existing planner is still mounted');
assert.match(source, /documentRoot\[INSTANCE_CLEANUP_KEY\]\s*=\s*\(\)\s*=>/,
  'a SPA remount should expose cleanup for the prior observers and timers');
assert.match(source, /clearInterval\(runtimeRefreshTimer\)/,
  'SPA cleanup should clear the recurring freshness timer');
assert.match(source, /resultObserver\?\.disconnect\(\)/,
  'SPA cleanup should disconnect the result observer');
assert.match(source, /resultObserverQueue\.length\s*=\s*0/,
  'SPA cleanup should release queued result mutations');
assert.match(source, /documentRoot\?\.setAttribute\(INSTANCE_MARK,\s*['"]3\.37['"]\)/,
  'the first run should mark the document before starting observers and timers');
assert.equal((source.match(/setInterval\(/g) || []).length, 1,
  'planner should keep only one minute refresh timer after startup refactors');
assert.match(source, /Only queue mutations whose\s*\/\/\s*text could actually be a train result/,
  'result observer should filter page churn before queueing mutations');
assert.match(source, /resultObserverQueue\.length\s*>\s*400/,
  'result observer should retain a hard queue cap as a second memory guard');
assert.ok(source.includes('const TRAIN_RESULT_HINT = /\\byou\\s+(?:used'),
  'result observer should compile its high-frequency text filter once');
assert.ok(source.includes('const TRAIN_BUTTON_HINT = /\\btrain\\b|torn-btn/i'),
  'train observer should ignore page mutations that cannot add train controls');
assert.match(source, /let\s+gymLoadInFlight\s*=\s*null/,
  'gym catalogue loading should track an in-flight request');
assert.match(source, /loadGymsFromAPIUnshared\(key\)\.finally/,
  'overlapping gym catalogue loads should share one request and clear the guard');
assert.match(source, /let\s+assessmentInFlight\s*=\s*null/,
  'assessment should track an in-flight request');
assert.match(source, /runAssessmentUnshared\(\)\.finally/,
  'overlapping assessments should share one request and clear the guard');
assert.match(source, /let\s+pricesInFlight\s*=\s*null/,
  'price loading should track an in-flight request');
assert.match(source, /fetchPricesUnshared\(forceRefresh\)\.finally/,
  'overlapping price loads should share one request and clear the guard');
assert.equal((fixture.match(/Torn%20Gym%20Planner-3\.36\.txt/g) || []).length, 2,
  'local live fixture should deliberately load the planner twice to test singleton protection');
assert.match(fixture, /Energy: 140\/150/, 'live fixture should exercise the desktop energy-cap reader');
assert.match(fixture, /Emit mock Torn result/, 'live fixture should exercise the train-result logger');

console.log('Gym singleton guard contract checks passed');
