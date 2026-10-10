const assert = require('node:assert/strict');
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

const COMBO_GYMS = {
  balboas: { id: 25, stat1: 'defense', stat2: 'dexterity', sec1: 'strength', sec2: 'speed' },
  frontline: { id: 26, stat1: 'strength', stat2: 'speed', sec1: 'defense', sec2: 'dexterity' },
};
const SOLO_GYM_FOR = { strength: 27, defense: 28, speed: 29, dexterity: 30 };
const BUILD_PATHS = {
  hank_def: { ratio: 'Hank', whore: 'defense', combo: 'frontline' },
  hank_dex: { ratio: 'Hank', whore: 'dexterity', combo: 'frontline' },
  hank_str: { ratio: 'Hank', whore: 'strength', combo: 'balboas' },
  hank_spd: { ratio: 'Hank', whore: 'speed', combo: 'balboas' },
  baldr_str: { ratio: 'Baldr', whore: 'strength', combo: 'frontline' },
  baldr_spd: { ratio: 'Baldr', whore: 'speed', combo: 'frontline' },
  baldr_def: { ratio: 'Baldr', whore: 'defense', combo: 'balboas' },
  baldr_dex: { ratio: 'Baldr', whore: 'dexterity', combo: 'balboas' },
  combo_bal: { ratio: 'Combo', whore: null, combo: 'balboas' },
  combo_fro: { ratio: 'Combo', whore: null, combo: 'frontline' },
};
const STAT_KEYS = { strength: 'str', speed: 'spd', defense: 'def', dexterity: 'dex' };
const STAT_ABBREV = { strength: 'STR', speed: 'SPD', defense: 'DEF', dexterity: 'DEX' };
const STAT_LABELS = { strength: 'Strength', speed: 'Speed', defense: 'Defense', dexterity: 'Dexterity' };
const RATIO_MIN = 1.25;
const RATIO_MAX = 1.5;
const GYM_BY_ID = new Proxy({}, { get: (_, id) => ({ id: Number(id), name: `Gym ${id}` }) });
const SPECIALIST_REQS = {
  25: { check: s => (s.defense + s.dexterity) >= (s.strength + s.speed) * RATIO_MIN },
  26: { check: s => (s.strength + s.speed) >= (s.defense + s.dexterity) * RATIO_MIN },
  27: { check: s => s.strength >= Math.max(s.speed, s.defense, s.dexterity) * RATIO_MIN },
  28: { check: s => s.defense >= Math.max(s.strength, s.speed, s.dexterity) * RATIO_MIN },
  29: { check: s => s.speed >= Math.max(s.strength, s.defense, s.dexterity) * RATIO_MIN },
  30: { check: s => s.dexterity >= Math.max(s.strength, s.speed, s.defense) * RATIO_MIN },
};

const code = `${extractFunction('analysePath')}\n${extractFunction('suggestPath')}\nreturn { analysePath, suggestPath };`;
const { suggestPath } = new Function(
  'BUILD_PATHS', 'COMBO_GYMS', 'SOLO_GYM_FOR', 'STAT_KEYS', 'STAT_ABBREV',
  'STAT_LABELS', 'RATIO_MIN', 'RATIO_MAX', 'GYM_BY_ID', 'SPECIALIST_REQS', code,
)(BUILD_PATHS, COMBO_GYMS, SOLO_GYM_FOR, STAT_KEYS, STAT_ABBREV, STAT_LABELS,
  RATIO_MIN, RATIO_MAX, GYM_BY_ID, SPECIALIST_REQS);

const stats = { strength: 1_000_000, speed: 100_000, defense: 80_000, dexterity: 80_000 };
const suggestion = suggestPath(stats);

assert.equal(suggestion.key, 'baldr_str',
  'path suggestion should score the actual whored stat instead of defaulting to the first path');
assert.ok(Number.isFinite(suggestion.score), 'path suggestion score should remain numeric');

console.log('Gym path suggestion checks passed');
