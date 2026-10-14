'use strict';

// Pure, job-local calculations; no credentials, storage, network or raw attack archive.
const WarPayoutDomain = (() => {
  const fields = ['hits', 'losses', 'assists', 'stalemates', 'defends'];
  const wins = new Set(['Attacked', 'Mugged', 'Hospitalized', 'Arrested', 'Looted', 'Special']);
  // Public schema 6.13.8 lists Bounty but does not establish a faction-war win.
  // Keep it explicitly nonpaying until its semantics are documented.
  const known = new Set([...wins, 'Lost', 'Assist', 'Stalemate', 'Escape', 'Timeout', 'None', 'Interrupted', 'Bounty']);
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  const emptyCounts = () => Object.fromEntries(fields.map(key => [key, 0]));
  function integer(value, label, positive = false) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
      throw new Error(`${label} must be a ${positive ? 'positive' : 'nonnegative'} safe whole number.`);
    }
    return value;
  }
  function safe(value, label) {
    if (value < 0n || value > max) throw new Error(`${label} exceeds safe whole-number limits.`);
    return Number(value);
  }
  const add = (left, right, label) => safe(BigInt(left) + BigInt(right), label);
  const multiply = (left, right, label) => safe(BigInt(left) * BigInt(right), label);
  function ratesFor(input) {
    const raw = input.rates ?? {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Rates must be an object.');
    return Object.fromEntries(fields.map(key => [key, integer(raw[key] === undefined ? 0 : raw[key], `${key} rate`)]));
  }
  function roundedPercent(profit, percent) {
    // Convert the entered Number's decimal representation to a rational before
    // multiplying; even MAX_SAFE_INTEGER profit retains exact whole-dollar rounding.
    const [coefficient, exponentText] = percent.toString().split('e');
    const decimalPlaces = (coefficient.split('.')[1] || '').length;
    const exponent = Number(exponentText || 0) - decimalPlaces;
    let numerator = BigInt(coefficient.replace('.', ''));
    let denominator = 100n;
    if (exponent >= 0) numerator *= 10n ** BigInt(exponent);
    else denominator *= 10n ** BigInt(-exponent);
    return safe((BigInt(profit) * numerator * 2n + denominator) / (denominator * 2n), 'Faction cut');
  }
  function budget(input, profit) {
    integer(profit, 'Profit');
    const mode = input.cutMode === undefined ? 'amount' : input.cutMode;
    const value = input.cutValue === undefined ? 0 : input.cutValue;
    let cut;
    if (mode === 'percent') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
        throw new Error('Cut percent must be between 0 and 100.');
      }
      cut = roundedPercent(profit, value);
    } else if ((mode === 'amount' || mode === 'fixed')) cut = integer(value, 'Faction cut');
    else throw new Error('Cut mode must be amount or percent.');
    if (cut > profit) throw new Error('Faction cut cannot exceed profit.');
    return {profit, cut, pool:profit - cut};
  }
  function createAggregator(rawScope) {
    if (!rawScope || typeof rawScope !== 'object') throw new Error('A selected war scope is required.');
    const scope = Object.fromEntries(['warId', 'factionId', 'opponentId', 'start', 'end'].map(key =>
      [key, integer(rawScope[key], `Scope ${key}`, ['warId', 'factionId', 'opponentId'].includes(key))]));
    if (scope.factionId === scope.opponentId || scope.start > scope.end) throw new Error('Invalid war scope.');
    const seen = new Set(), members = new Map(), totals = emptyCounts();
    let excluded = 0, unattributed = 0, unknownResults = 0;
    function reject(reason) {
      excluded = add(excluded, 1, 'Excluded count');
      if (reason === 'unattributed') unattributed = add(unattributed, 1, 'Unattributed count');
      if (reason === 'unknown') unknownResults = add(unknownResults, 1, 'Unknown result count');
    }
    function credit(member, category) {
      const id = integer(member?.id, 'Participating player ID', true);
      if (!members.has(id)) members.set(id, {id, name:typeof member.name === 'string' && member.name ? member.name : `Player ${id}`, ...emptyCounts()});
      const row = members.get(id);
      row[category] = add(row[category], 1, `${category} count`);
      totals[category] = add(totals[category], 1, `Total ${category}`);
    }
    function addAttacks(attacks) {
      if (!Array.isArray(attacks)) throw new Error('Attacks must be an array.');
      for (const attack of attacks) {
        const id = integer(attack?.id, 'Attack ID', true);
        if (seen.has(id)) continue;
        const ended = integer(attack.ended, 'Attack completion timestamp');
        seen.add(id);
        if (ended < scope.start || ended > scope.end) { reject(); continue; }
        const attackerFaction = attack.attacker?.faction?.id;
        const defenderFaction = attack.defender?.faction?.id;
        const offensive = attackerFaction === scope.factionId && defenderFaction === scope.opponentId;
        const hiddenDefensive = attack.attacker === null && defenderFaction === scope.factionId && attack.is_ranked_war === true;
        const defensive = defenderFaction === scope.factionId && (attackerFaction === scope.opponentId || hiddenDefensive);
        if (!offensive && !defensive) {
          reject(attack.attacker === null && defenderFaction === scope.factionId ? 'unattributed' : undefined);
          continue;
        }
        if (!known.has(attack.result)) { reject('unknown'); continue; }
        let category;
        if (offensive) {
          if (wins.has(attack.result)) category = 'hits';
          else if (attack.result === 'Assist') category = 'assists';
          else if (attack.result === 'Stalemate') category = 'stalemates';
        } else if (wins.has(attack.result)) category = 'losses';
        else if (attack.result === 'Lost') category = 'defends';
        if (category) credit(offensive ? attack.attacker : attack.defender, category);
        else reject();
      }
    }
    function snapshot() {
      return {rows:[...members.values()].map(row => ({...row})).sort((a,b) => a.id - b.id),
        totals:{...totals}, excluded, unattributed, unknownResults};
    }
    return {add:addAttacks, snapshot};
  }
  function aggregate(attacks, scope) {
    const aggregator = createAggregator(scope);
    aggregator.add(attacks);
    return aggregator.snapshot();
  }
  function calculate(input, rows) {
    if (!input || typeof input !== 'object') throw new Error('Calculation inputs are required.');
    if (!Array.isArray(rows)) throw new Error('Member rows must be an array.');
    const amounts = budget(input, input.profit), rates = ratesFor(input), ids = new Set();
    let total = 0;
    const calculated = rows.map(raw => {
      const id = integer(raw?.id, 'Player ID', true);
      if (ids.has(id)) throw new Error('Duplicate player ID.');
      ids.add(id);
      const row = {id, name:typeof raw.name === 'string' ? raw.name : `Player ${id}`};
      let payout = 0;
      for (const key of fields) {
        row[key] = integer(raw[key] === undefined ? 0 : raw[key], `${key} count`);
        payout = add(payout, multiply(row[key], rates[key], `${key} payout`), 'Player payout');
      }
      total = add(total, payout, 'Total payout');
      return {...row, payout};
    }).sort((a,b) => b.payout - a.payout || a.id - b.id);
    return {...amounts, total, leftover:amounts.pool - total, rows:calculated, rates};
  }
  function estimate(input, counts) {
    if (!input || typeof input !== 'object' || !counts || typeof counts !== 'object') throw new Error('Estimate inputs and counts are required.');
    let profit = 0;
    if (input.cacheTotal !== undefined) profit = integer(input.cacheTotal, 'Estimated cache total');
    else {
      if (!Array.isArray(input.caches)) throw new Error('Estimated cache total or cache rows are required.');
      for (const cache of input.caches) {
        const quantity = integer(cache?.quantity, 'Cache quantity'), price = integer(cache?.price, 'Cache price');
        profit = add(profit, multiply(quantity, price, 'Cache value'), 'Estimated cache total');
      }
    }
    const amounts = budget(input, profit), rates = ratesFor(input);
    const hits = integer(counts.hits, 'Hit count');
    let reserved = 0;
    for (const key of fields.slice(1)) {
      const count = counts[key] === undefined && rates[key] === 0 ? 0 : integer(counts[key], `${key} count`);
      reserved = add(reserved, multiply(count, rates[key], `${key} reservation`), 'Reserved payouts');
    }
    const available = amounts.pool - reserved;
    const shortfall = Math.max(0, -available);
    const rate = shortfall || hits === 0 ? null : Math.floor(available / hits);
    const remainder = shortfall ? 0 : rate === null ? available : available - multiply(rate, hits, 'Estimated hit payouts');
    return {...amounts, reserved, rate, remainder, shortfall};
  }
  function csv(result, context = {}) {
    if (!result || !Array.isArray(result.rows)) throw new Error('A calculated player report is required.');
    const lines = [];
    function cell(value) {
      let text = String(value ?? '');
      if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }
    const line = values => lines.push(values.map(cell).join(','));
    const visited = new Set();
    let metadataCount = 0;
    function metadata(value, path, depth) {
      if (depth > 8 || metadataCount >= 500) return;
      if (value && typeof value === 'object') {
        if (visited.has(value)) return;
        visited.add(value);
        for (const [key, child] of Object.entries(value)) {
          if (/(key|secret|password|token|cookie|authorization|credential|request|url|body)/i.test(key)) continue;
          metadata(child, path ? `${path}.${key}` : key, depth + 1);
        }
        visited.delete(value);
      } else if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
        // Unknown caller metadata must not smuggle credential-bearing URLs.
        if (typeof value === 'string' && /(?:[?&](?:key|token|secret|password|api_key)=|https?:\/\/[^\s/]+@)/i.test(value)) return;
        metadataCount++;
        line([path, typeof value === 'string' ? value.slice(0, 2048) : value]);
      }
    }
    line(['War payout calculation']);
    metadata(context, '', 0);
    for (const key of ['profit', 'cut', 'pool', 'total', 'leftover']) line([key, result[key]]);
    for (const key of fields) line([`rates.${key}`, result.rates?.[key] ?? 0]);
    line([]);
    const columns = ['id', 'name', ...fields, 'payout'];
    line(columns);
    for (const row of result.rows) line(columns.map(key => row[key]));
    return lines.join('\r\n');
  }
  return {aggregate, createAggregator, calculate, estimate, csv};
})();

module.exports = { WarPayoutDomain };

