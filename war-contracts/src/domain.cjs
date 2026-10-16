var WarContractsDomain = (() => {
  'use strict';
  const DAY = 86400000;
  const fields = ['strength', 'defense', 'speed', 'dexterity'];
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const positive = value => Math.max(0, number(value));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const score = stats => fields.every(k => stats[k] > 0) ? fields.reduce((sum, k) => sum + Math.sqrt(stats[k]), 0) : 0;
  const normalizeName = text => String(text ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

  function profile(input, equipment, weaponUid) {
    const source = input?.battlestats || input || {};
    const stats = {}; const effective = {};
    for (const key of fields) {
      const stat = source[key];
      stats[key] = positive(typeof stat === 'object' ? stat?.value : stat);
      const modifier = number(source[key + '_modifier'] ?? stat?.modifier);
      effective[key] = positive(stat?.effective ?? stats[key] * Math.max(0, 1 + modifier / 100));
    }
    const items = Array.isArray(equipment) ? equipment : equipment?.equipment || [];
    const equipped = items.filter(item => item.equipped !== false);
    const weapons = equipped.filter(item => /primary|secondary|melee|weapon/i.test(item.type || item.category || '')).map(item => {
      const bonuses = item.bonuses || [];
      const warlord = Array.isArray(bonuses) ? bonuses.find(b => /warlord/i.test(b.title || b.name || '')) : null;
      return { uid: String(item.UID ?? item.uid ?? item.id ?? ''), name: String(item.name || 'Weapon'),
        damage: positive(item.damage ?? item.stats?.damage), accuracy: positive(item.accuracy ?? item.stats?.accuracy),
        warlordPercent: clamp(positive(item.warlordPercent ?? warlord?.value), 0, 30) };
    });
    return { id: input?.id ?? null, name: input?.name || '', level: positive(input?.level), stats, effectiveStats: effective,
      bss: score(stats), effectiveBss: score(effective), weapons,
      weapon: weapons.find(item => item.uid === String(weaponUid)) || weapons[0] || null,
      armor: equipped.filter(item => /armor|armour/i.test(item.type || item.category || '')) };
  }

  function estimateTime(value) {
    if (value == null || value === '') return null;
    const numeric = Number(value);
    const timestamp = Number.isFinite(numeric) ? numeric * (numeric < 1e12 ? 1000 : 1) : Date.parse(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
  }

  function evaluate(our, enemy, options = {}) {
    const now = options.now ?? Date.now();
    // FF uses raw BSS: sum(sqrt(each battle stat)). Total BS alone cannot identify
    // its distribution; sqrt(total)*2 is an explicitly approximate balanced build.
    const defenderBss = positive(enemy?.bss ?? enemy?.bss_public) || (positive(enemy?.bs ?? enemy?.bs_estimate) ? 2 * Math.sqrt(positive(enemy.bs ?? enemy.bs_estimate)) : 0);
    const rawRatio = our?.bss > 0 ? defenderBss / our.bss : 0;
    const ff = rawRatio > 0 ? Math.min(3, 1 + 8 / 3 * rawRatio) : 0;
    // Ranked-war baseline: level 1 => 1 base respect, level 100 => 1.5.
    const respect = enemy?.level > 0 && ff ? (1 + (clamp(number(enemy.level), 1, 100) - 1) * (.5 / 99)) * ff * 2 * (1 + clamp(positive(our?.weapon?.warlordPercent), 0, 30) / 100) : 0;
    const at = estimateTime(enemy?.estimateAt ?? enemy?.timestamp);
    const age = at == null ? null : Math.max(0, now - at);
    const confidence = age == null ? 'unknown' : age > 180 * DAY ? 'very old' : age > 30 * DAY ? 'old' : 'recent';
    // This is a bounded ordering heuristic, not Torn's combat simulator or win odds.
    // Opponent stripping is assumed by agreement, never observed. Own armor gets
    // only a small contextual benefit; damage/accuracy never alter fair fight.
    const weapon = our?.weapon;
    const weaponBenefit = weapon ? clamp((positive(weapon.damage) + positive(weapon.accuracy) - 100) / 400, 0, .2) : 0;
    const armorBenefit = our?.armor?.some(item => positive(item.armor ?? item.armour ?? item.stats?.armor) > 0) ? .05 : 0;
    const effectiveBss = positive(our?.effectiveBss) || positive(our?.bss);
    // Defensive skew must not masquerade as offensive capacity. This conservative
    // strength/speed proxy is only a ranking heuristic; FF still uses all raw stats.
    const effectiveStats = our?.effectiveStats || our?.stats;
    const attackBss = effectiveStats ? 2 * (Math.sqrt(positive(effectiveStats.strength)) + Math.sqrt(positive(effectiveStats.speed))) : effectiveBss;
    const combatBss = Math.min(effectiveBss, attackBss);
    const ratio = combatBss ? defenderBss / (combatBss * (1 + weaponBenefit + armorBenefit)) : 0;
    let fit = ratio <= .85 ? 'easy' : ratio <= 1.15 ? 'manageable stretch' : ratio <= 2 ? 'hard' : 'extreme';
    let reason = `Stripped-opponent heuristic: ${fit}; estimate ${confidence}. No guaranteed outcome.`;
    let viable = true;
    if (!respect || !ratio) { viable = false; fit = 'unknown'; reason = 'Missing battle stats, estimate or defender level.'; }
    else if (confidence === 'unknown' || confidence === 'very old') { viable = false; reason = 'Estimate age is unknown or very old; review manually.'; }
    else if (ratio > 2 || rawRatio > 3) { viable = false; reason = 'Extreme battle-stat gap; review manually.'; }
    else if (rawRatio > 1.35 || defenderBss / effectiveBss > 1.35) { viable = false; reason = 'Battle-stat gap exceeds the conservative ceiling; review manually.'; }
    else if (ratio > 1.15) { viable = false; reason = 'Hard stripped-opponent heuristic; review manually rather than automatic suggestion.'; }
    const status = normalizeName(typeof enemy?.status === 'object' ? enemy.status?.state : enemy?.status);
    if (['federal', 'fallen'].includes(status)) { viable = false; reason = 'Opponent is unavailable (Federal or Fallen).'; }
    if (defenderBss && !positive(enemy?.bss ?? enemy?.bss_public)) reason += ' BSS uses a balanced-stat approximation from total BS.';
    // Once fair fight caps, more difficulty receives no extra reward. Modest
    // stretch is favoured over low-FF fights, with a freshness penalty for old data.
    const rank = viable ? respect * (confidence === 'old' ? .8 : 1) / (1 + Math.max(0, ratio - .85) * .35) : -Infinity;
    return { enemy, respect, ff, fit, reason, confidence, ratio, viable, rank };
  }

  function contractBlocked(contracts, our, enemy) {
    const same = (id, name, person) => Boolean(person && ((id != null && person.id != null && String(id) === String(person.id)) || (normalizeName(name) && normalizeName(name) === normalizeName(person.name))));
    return (contracts || []).some(row => ['manual', 'reserved', 'contacted', 'confirmed'].includes(row.status) &&
      (same(row.ourId, row.ourName, our) || same(row.enemyId, row.enemyName, enemy)));
  }
  function recommend(our, enemies, contracts, options) {
    return (enemies || []).filter(enemy => !contractBlocked(contracts, our, enemy)).map(enemy => evaluate(our, enemy, options))
      .filter(result => result.viable).sort((a, b) => b.rank - a.rank || a.ratio - b.ratio);
  }
  function message(template, values = {}) {
    return String(template ?? '').replace(/\{([a-zA-Z][\w]*)\}/g, (match, key) => Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? '') : match);
  }
  function endpoint(value) {
    const text = String(value ?? '').trim();
    return /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(text) ? text : null;
  }
  return { normalizeName, profile, evaluate, recommend, message, endpoint, contractBlocked };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = WarContractsDomain;
