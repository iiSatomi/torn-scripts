const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../src/domain.cjs');
const D = fs.existsSync(file) ? require(file) : {};
const now = Date.UTC(2026, 9, 16);
const own = () => ({ ...D.profile({ strength: 10000, defense: 10000, speed: 10000, dexterity: 10000 }, []), id: 1, name: 'Our Name' });
const enemy = (bss = 400, extra = {}) => ({ id: 2, name: 'Enemy', level: 50, bss, estimateAt: now, ...extra });
test('domain exports the planned API', () => {
  for (const name of ['normalizeName','profile','evaluate','recommend','message','endpoint','contractBlocked']) assert.equal(typeof D[name], 'function');
});
test('profile reads real raw and modified stats and selects equipped weapons', () => {
  const p = D.profile({ battlestats: { strength: 100, defense: 100, speed: 100, dexterity: 100, strength_modifier: 10 } }, { equipment: [
    { UID: 5, type: 'Primary', name: 'Rifle', equipped: true, damage: 65, accuracy: 60, bonuses: [{ title: 'Warlord', value: 15 }] },
    { UID: 6, type: 'Secondary', equipped: false, damage: 100 }
  ] }, 5);
  assert.equal(p.bss, 40); assert.ok(p.effectiveBss > p.bss); assert.equal(p.stats.strength, 100);
  assert.equal(p.effectiveStats.strength, 110.00000000000001);
  assert.equal(p.weapons.length, 1); assert.equal(p.weapon.uid, '5'); assert.equal(p.weapon.warlordPercent, 15);
});
test('equipment cannot cross conservative stat ceiling and defensive builds need offensive capacity', () => {
  const p = own(); p.weapon = {damage: 100, accuracy: 100}; p.armor = [{armor:100}];
  assert.equal(D.evaluate(p, enemy(560), {now}).viable, false);
  const defensive = D.profile({strength:100, speed:100, defense:1000000, dexterity:100}, []);
  const result = D.evaluate(defensive, enemy(defensive.bss * .8), {now});
  assert.equal(result.viable, false);
  assert.equal(result.ff, 3);
});
test('respect uses capped fair fight, defender level and selected Warlord only', () => {
  const p = own(); p.weapon = { warlordPercent: 10, damage: 99, accuracy: 99 };
  const r = D.evaluate(p, enemy(800), { now });
  assert.equal(r.ff, 3); assert.equal(r.respect, (1 + 49 * (.5 / 99)) * 3 * 2 * 1.1);
  assert.equal(D.evaluate({ ...p, weapon: null }, enemy(800), { now }).ff, r.ff);
  assert.equal(D.evaluate(p, enemy(200), { now }).ff, 1 + 8 / 3 * .5);
});
test('respect level endpoints and Warlord obey documented bounds', () => {
  assert.equal(D.evaluate(own(), enemy(400, { level: 1 }), { now }).respect, 6);
  assert.equal(D.evaluate(own(), enemy(400, { level: 100 }), { now }).respect, 9);
  const p = own(); p.weapon = { warlordPercent: 999 };
  assert.equal(D.evaluate(p, enemy(400, { level: 100 }), { now }).respect, 9 * 1.3);
  const parsed = D.profile({strength:100,defense:100,speed:100,dexterity:100}, [{type:'Primary', bonuses:[{title:'Warlord',value:999}]}]);
  assert.equal(parsed.weapon.warlordPercent, 30);
});
test('hard fights are review-only and Federal or Fallen opponents unavailable', () => {
  assert.equal(D.evaluate(own(), enemy(600), { now }).viable, false);
  assert.equal(D.recommend(own(), [enemy(600)], [], { now }).length, 0);
  for (const status of ['Federal','Fallen',{state:'Federal'},{state:'Fallen'}]) {
    assert.equal(D.recommend(own(), [enemy(400,{status})], [], { now }).length, 0);
  }
  assert.equal(D.recommend(own(), [enemy(400,{status:{state:'Traveling'}})], [], { now }).length, 1);
});
test('recommendations reject missing, unknown age, very old and extreme gaps', () => {
  assert.equal(D.recommend(own(), [enemy(0), enemy(400, { estimateAt: null }), enemy(400, { estimateAt: now - 181 * 86400000 }), enemy(5000)], [], { now }).length, 0);
});
test('FFScouter fields and second timestamps work; stale estimates carry less confidence', () => {
  const publicEstimate = D.evaluate(own(), { id: 9, level: 50, bss_public: 400, bs_estimate: 40000, estimateAt: now / 1000 }, { now });
  assert.equal(publicEstimate.ff, 3); assert.equal(publicEstimate.confidence, 'recent');
  const totalOnly = D.evaluate(own(), { id: 10, level: 50, bs_estimate: 40000, estimateAt: now }, { now });
  assert.equal(totalOnly.ff, 3);
  assert.match(totalOnly.reason, /balanced-stat approximation/);
  const old = D.evaluate(own(), enemy(400, { estimateAt: now - 40 * 86400000 }), { now });
  assert.equal(old.confidence, 'old'); assert.ok(old.rank < publicEstimate.rank);
  assert.equal(D.evaluate(D.profile({}, []), enemy(), { now }).viable, false);
});
test('manageable stretch beats low reward but easier full FF beats equal harder reward', () => {
  const ranked = D.recommend(own(), [enemy(120, { id: 3 }), enemy(400, { id: 4 }), enemy(700, { id: 5 })], [], { now });
  assert.equal(ranked[0].enemy.id, 4); assert.ok(ranked[0].reason.includes('heuristic'));
});
test('gear changes heuristic fit without changing fair fight', () => {
  const p = own(); const bare = D.evaluate(p, enemy(480), { now });
  const geared = D.evaluate({ ...p, weapon: { damage: 90, accuracy: 90 }, armor: [{ armor: 40 }] }, enemy(480), { now });
  assert.equal(geared.ff, bare.ff); assert.ok(geared.ratio < bare.ratio); assert.notEqual(geared.fit, bare.fit);
});
test('booking blocks either side by ID OR normalized names, excluding cancellation', () => {
  for (const status of ['manual','reserved','contacted','confirmed']) {
    assert.equal(D.contractBlocked([{ status, ourId: 1 }], own(), enemy()), true);
    assert.equal(D.contractBlocked([{ status, enemyId: 2 }], own(), enemy()), true);
    assert.equal(D.contractBlocked([{ status, ourId: 999, ourName: '  OUR   NAME ' }], own(), enemy()), true);
    assert.equal(D.contractBlocked([{ status, enemyName: ' enemy ' }], own(), enemy()), true);
  }
  assert.equal(D.contractBlocked([{ status: 'cancelled', enemyId: 2 }], own(), enemy()), false);
  assert.equal(D.recommend(own(), [enemy()], [{ status: 'manual', ourName: 'our name' }], { now }).length, 0);
});
test('templates replace only known placeholders literally', () => {
  assert.equal(D.message('Hi {name}, {unknown} {name}', { name: '$&<x>' }), 'Hi $&<x>, {unknown} $&<x>');
});
test('endpoint only accepts deployed HTTPS Apps Script exec URL', () => {
  assert.equal(D.endpoint('https://script.google.com/macros/s/abc-123_/exec'), 'https://script.google.com/macros/s/abc-123_/exec');
  for (const url of ['http://script.google.com/macros/s/a/exec','https://script.google.com/macros/s/a/dev','https://evil.test/macros/s/a/exec','https://user@script.google.com/macros/s/a/exec','https://script.google.com/macros/s/a/exec?x=1','https://script.google.com/macros/s/a/exec#x']) assert.equal(D.endpoint(url), null);
});
