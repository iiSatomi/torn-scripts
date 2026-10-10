const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'Torn Gym Planner-3.36.txt');
const LOG = path.join(ROOT, 'Torn PDA Gym Log.txt');
const BASELINE_CORRECTION = 1.027;
const TRAIN_ROWS = 70;

const STAT_CONSTS = {
  strength: { A: 1600, B: 1700 },
  speed: { A: 1600, B: 2000 },
  defense: { A: 2100, B: -600 },
  dexterity: { A: 1800, B: 1500 },
};

function n(value) {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function readRows() {
  const lines = fs.readFileSync(LOG, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split('\t');
  headers[0] = 'id';
  return lines.slice(1).map(line => {
    const cells = line.split('\t');
    return Object.fromEntries(headers.map((key, index) => [key, cells[index] ?? '']));
  }).filter(row => row.scriptVer === '3.36');
}

function readCurrentCorrection() {
  const source = fs.readFileSync(SCRIPT, 'utf8');
  const match = source.match(/const\s+FORMULA_CORRECTION\s*=\s*([0-9.]+)/);
  assert.ok(match, 'active script must define FORMULA_CORRECTION');
  return Number(match[1]);
}

function oneTrainGain(row, stat, happy, correction) {
  const c = STAT_CONSTS[row.stat] || STAT_CONSTS.speed;
  const lnPart = Math.round((1 + 0.07 * Math.round(Math.log(1 + happy / 250) * 10000) / 10000) * 10000) / 10000;
  return (stat * lnPart + 8 * Math.pow(happy, 1.05) + (1 - Math.pow(happy / 99999, 2)) * c.A + c.B)
    * (1 / 200000) * n(row.dots) * n(row['E/train']) * (n(row.bonusCombined) || 1) * correction;
}

function predict(row, correction) {
  const energyPerTrain = n(row['E/train']) || 10;
  const trains = Math.round((n(row.energyUsed) || energyPerTrain) / energyPerTrain);
  let stat = n(row.preStat);
  let happy = n(row.happy);
  let total = 0;
  for (let i = 0; i < trains; i += 1) {
    const gain = oneTrainGain(row, stat, happy, correction);
    total += gain;
    stat += gain;
    happy = Math.max(n(row.propHappy), happy - energyPerTrain * 0.5);
  }
  return total;
}

function fitCorrection(rows) {
  let numerator = 0;
  let denominator = 0;
  for (const row of rows) {
    const base = predict(row, 1);
    numerator += base * n(row.actualGain);
    denominator += base * base;
  }
  return numerator / denominator;
}

function meanAbsoluteError(rows, correction) {
  return rows.reduce((sum, row) => {
    const actual = n(row.actualGain);
    const predicted = predict(row, correction);
    return sum + Math.abs((actual - predicted) / actual) * 100;
  }, 0) / rows.length;
}

const rows = readRows();
assert.equal(rows.length, 90, 'PDA log should contain 90 rows marked script version 3.36');
const training = rows.slice(0, TRAIN_ROWS);
const holdout = rows.slice(TRAIN_ROWS);
const fitted = fitCorrection(training);
const current = readCurrentCorrection();
const baselineError = meanAbsoluteError(holdout, BASELINE_CORRECTION);
const fittedError = meanAbsoluteError(holdout, fitted);

assert.ok(Math.abs(current - fitted) <= 0.002,
  `active correction ${current} must match PDA-derived correction ${fitted.toFixed(6)}`);
assert.ok(fittedError < baselineError,
  `calibrated holdout error ${fittedError.toFixed(3)} must beat baseline ${baselineError.toFixed(3)}`);

console.log(JSON.stringify({
  rows: rows.length,
  trainingRows: training.length,
  holdoutRows: holdout.length,
  currentCorrection: current,
  fittedCorrection: Number(fitted.toFixed(6)),
  baselineHoldoutMaePct: Number(baselineError.toFixed(3)),
  calibratedHoldoutMaePct: Number(fittedError.toFixed(3)),
}, null, 2));
