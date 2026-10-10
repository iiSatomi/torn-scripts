const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Torn Gym Planner-3.36.txt'), 'utf8');

// These are intentionally red until the first completion slice is implemented.
// They protect behavior at the source boundary because the production artifact
// is a single IIFE and does not expose its internal render/logger functions.
assert.match(source, /function\s+refreshAll\s*\(/,
  'dependent UI needs one refresh coordinator');
assert.match(source, /energyBefore/,
  'logger entries must distinguish available energy before training');
assert.doesNotMatch(source, /const\s+finalEnergyUsed\s*=\s*\(lastTrainedEnergy/,
  'click-time available energy must not be stored as energy spent');
assert.match(source, /function\s+renderValidationNotice\s*\(/,
  'invalid inputs need a result-area validation notice');
assert.match(source, /gg-manual-inv/, 'Money needs a local inventory fallback');
assert.match(source, /MANUAL_INV_KEY/, 'manual inventory values must have a dedicated storage key');
assert.match(source, /inventorySource/, 'Money needs to label API, manual, and unknown inventory');
assert.match(source, /GM_setClipboard/, 'copy result needs a userscript clipboard fallback');
assert.match(source, /function\s+setAssessmentState\s*\(/, 'Money assessment needs explicit loading and result states');
assert.match(source, /gg-bestgym-nudge/, 'Now needs a compact best-gym recommendation');
assert.match(source, /function\s+getOwnedGymsForStat\s*\(/, 'best-gym guidance needs one ownership-aware ranking helper');
assert.doesNotMatch(source, /Unknown gym ID[\s\S]{0,260}return true;/,
  'catalogue presence must not be treated as ownership for unknown gyms');
assert.match(source, /typeof\s+el_\.closest\s*!==\s*["']function["']/, 'mutation observer must ignore non-element nodes');
assert.match(source, /mut\.type\s*===\s*["']characterData["']/, 'logger should process in-place result text updates');
assert.match(source, /characterData\s*:\s*true/, 'logger observer should subscribe to character-data mutations');
assert.match(source, /const\s+TRAIN_RESULT_HINT\s*=\s*\/\\byou\\s\+/, 'logger should cheaply reject unrelated text mutations');
assert.match(source, /resultObserverQueue/, 'logger observer should batch mutation records to reduce PDA churn');
assert.match(source, /slice\(\s*-400\s*\)/, 'logger observer queue should stay bounded during high-mutation pages');
assert.match(source, /trainHookTimer/, 'train-button discovery should be throttled on mutation-heavy PDA pages');
assert.match(source, /trainHookTimer\s*=\s*setTimeout/, 'train-button discovery should batch repeated DOM mutations');

console.log('Gym Planner completion contract checks passed');
