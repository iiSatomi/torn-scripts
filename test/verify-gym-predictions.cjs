const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ACTIVE_SCRIPT = path.join(ROOT, 'Torn Gym Planner-3.36.txt');
const LOGS = [
  ['PDA', path.join(ROOT, 'Torn PDA Gym Log.txt')],
  ['Browser', path.join(ROOT, 'Torn Browser Gym Log.txt')],
];

const STAT_CONSTS = {
  strength: { A: 1600, B: 1700 },
  speed: { A: 1600, B: 2000 },
  defense: { A: 2100, B: -600 },
  dexterity: { A: 1800, B: 1500 },
};
const SCRIPT_SOURCE = fs.readFileSync(ACTIVE_SCRIPT, 'utf8');
const FORMULA_CORRECTION = Number(SCRIPT_SOURCE.match(/const\s+FORMULA_CORRECTION\s*=\s*([0-9.]+)/)?.[1] || 1.027);

function number(value) {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseTsv(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split('\t');
  headers[0] = 'id';
  return lines.slice(1).map(line => {
    const cells = line.split('\t');
    return Object.fromEntries(headers.map((key, index) => [key, cells[index] ?? '']));
  });
}

function calcGain({ stat, happy, bonus, energy, dots }) {
  const c = STAT_CONSTS[stat] || STAT_CONSTS.speed;
  const h = happy;
  const lnPart = Math.round((1 + 0.07 * Math.round(Math.log(1 + h / 250) * 10000) / 10000) * 10000) / 10000;
  return (stat * lnPart + 8 * Math.pow(h, 1.05) + (1 - Math.pow(h / 99999, 2)) * c.A + c.B)
    * (1 / 200000) * dots * energy * bonus * FORMULA_CORRECTION;
}

function predict(row, dots = number(row.dots)) {
  const ePerTrain = number(row['E/train']) || 10;
  const trains = Math.round((number(row.energyUsed) || ePerTrain) / ePerTrain);
  let stat = number(row.preStat);
  let happy = number(row.happy);
  let total = 0;
  const happyFloor = number(row.propHappy);
  for (let i = 0; i < trains; i += 1) {
    const gain = calcGain({
      stat,
      happy,
      bonus: number(row.bonusCombined) || 1,
      energy: ePerTrain,
      dots,
    });
    total += gain;
    stat += gain;
    happy = Math.max(happyFloor, happy - ePerTrain * 0.5);
  }
  return total;
}

function pct(actual, predicted) {
  return predicted ? ((actual - predicted) / predicted) * 100 : 0;
}

function summarize(label, rows) {
  const results = rows.map((row, index) => {
    const actual = number(row.actualGain);
    const current = predict(row);
    const logged = number(row.predicted);
    return {
      index: index + 1,
      date: row.date,
      scriptVer: row.scriptVer,
      stat: row.stat,
      gym: row.gym,
      session: row.sessionType,
      energy: number(row.energyUsed),
      actual,
      logged,
      recomputed: current,
      loggedDeltaPct: pct(current, logged),
      errorPct: pct(actual, current),
    };
  });
  const mean = key => results.reduce((sum, row) => sum + row[key], 0) / results.length;
  const absMean = key => results.reduce((sum, row) => sum + Math.abs(row[key]), 0) / results.length;
  const within = threshold => results.filter(row => Math.abs(row.errorPct) <= threshold).length;
  const worst = [...results].sort((a, b) => Math.abs(b.errorPct) - Math.abs(a.errorPct)).slice(0, 5);
  return {
    label,
    count: results.length,
    versions: [...new Set(results.map(row => row.scriptVer))],
    stats: [...new Set(results.map(row => row.stat))],
    gyms: [...new Set(results.map(row => row.gym))],
    meanErrorPct: mean('errorPct'),
    meanAbsoluteErrorPct: absMean('errorPct'),
    within10Pct: within(10),
    within15Pct: within(15),
    within25Pct: within(25),
    worst,
    results,
  };
}

function compact(summary) {
  return {
    label: summary.label,
    count: summary.count,
    versions: summary.versions,
    stats: summary.stats,
    gyms: summary.gyms,
    within10Pct: summary.within10Pct,
    within15Pct: summary.within15Pct,
    within25Pct: summary.within25Pct,
    meanErrorPct: Number(summary.meanErrorPct.toFixed(2)),
    meanAbsoluteErrorPct: Number(summary.meanAbsoluteErrorPct.toFixed(2)),
    worst: summary.worst.map(row => ({
      row: row.index,
      date: row.date,
      stat: row.stat,
      gym: row.gym,
      session: row.session,
      energy: row.energy,
      actual: row.actual,
      logged: Number(row.logged.toFixed(1)),
      recomputed: Number(row.recomputed.toFixed(1)),
      loggedVsRecomputedPct: Number(row.loggedDeltaPct.toFixed(2)),
      actualVsRecomputedPct: Number(row.errorPct.toFixed(2)),
    })),
  };
}

function compactGroups(rows, label) {
  const keys = [...new Set(rows.map(row => `${row.stat} / ${row.gym}`))];
  return keys.map(key => {
    const groupRows = rows.filter(row => `${row.stat} / ${row.gym}` === key);
    const summary = summarize(`${label} ${key}`, groupRows);
    return {
      label: key,
      count: summary.count,
      meanErrorPct: Number(summary.meanErrorPct.toFixed(2)),
      meanAbsoluteErrorPct: Number(summary.meanAbsoluteErrorPct.toFixed(2)),
      within15Pct: summary.within15Pct,
    };
  });
}

for (const [label, file] of LOGS) {
  const rows = parseTsv(file);
  const summary = summarize(label, rows);
  const byVersion = [...new Set(rows.map(row => row.scriptVer))]
    .map(version => compact(summarize(`${label} ${version}`, rows.filter(row => row.scriptVer === version))));
  const byVersionAndGroup = byVersion.map(versionSummary => {
    const versionRows = rows.filter(row => row.scriptVer === versionSummary.versions[0]);
    return { version: versionSummary.versions[0], groups: compactGroups(versionRows, label) };
  });
  console.log(JSON.stringify({ summary: compact(summary), byVersion, byVersionAndGroup }, null, 2));
}
