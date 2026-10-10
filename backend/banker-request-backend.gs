/**
 * Torn Banker Request — Sheets backend
 * ============================================================================
 * Sits between the userscript and Discord so the webhook never ships to clients.
 *
 * SETUP (once, by one person — about 3 minutes)
 *   1. sheets.new  →  name it e.g. "Banker Requests"
 *   2. Extensions → Apps Script → delete the sample → paste this whole file → save
 *   3. Project Settings → Script Properties:
 *        TORN_API_KEY      see below (always required)
 *        DISCORD_WEBHOOK   a NEWLY CREATED webhook — ONLY if you are NOT using
 *                          the Cloudflare relay. With the relay, the Worker holds
 *                          the webhook and this is omitted entirely.
 *      (No FACTION_ID needed — the API uses the key owner's own faction.)
 *
 *   USING THE RELAY (recommended — see banker-request-worker.js): instead of
 *   DISCORD_WEBHOOK here, set
 *        RELAY_URL   your https://…workers.dev URL
 *        RELAY_KEY   the same secret string configured in the Worker
 *      The backend routes Discord calls through the Worker whenever RELAY_URL is
 *      present, and falls straight back to a direct DISCORD_WEBHOOK when it isn't.
 *
 *   THE API KEY — make a scoped one, not a Limited/Full key. This link opens
 *   Torn's key builder with exactly the four selections this backend uses and
 *   nothing else (verified working):
 *
 *     https://www.torn.com/preferences.php#tab=api?step=addNewKey&=,,&faction=members,news,positions,fundsnews&title=Banker Sheet
 *
 *   The resulting key reads: faction members, positions, news, fundsnews. No
 *   user selections at all — it cannot see your money, messages or events. Check
 *   any key's real scope with:
 *     https://api.torn.com/key/?selections=info&key=YOUR_KEY
 *
 *   The Custom Key Builder is NOT on the preferences page — it lives in the top
 *   menu of https://www.torn.com/api.html and generates a link like the one
 *   above. Worth knowing, because looking for it in Preferences turns up nothing.
 *
 *   Torn's API is read-only: no endpoint moves money or takes any game action, so
 *   this key can only ever read. Anyone with EDIT access to this Apps Script
 *   project can read it, though, so don't add editors you wouldn't hand it to.
 *   4. Run  setup()  once, and authorise it when prompted.
 *   5. Deploy → New deployment → Web app
 *        Execute as: Me      ·  Who has access: Anyone
 *      Copy the /exec URL and give it to your members.
 *
 * ⚠ ROTATE THE WEBHOOK FIRST. Every previously shipped copy of the userscript has
 *   the old URL embedded in it. Migrating without rotating leaves that hole wide
 *   open and makes the whole exercise pointless.
 *
 * WHY THE /exec URL IS NOT A SECRET
 *   It ships inside the userscript, so treat it as public. Holding it lets someone
 *   CALL this script; it does not let them open the sheet, read the roster, or see
 *   the webhook. The only bytes they get are what doPost returns — which is why
 *   every response here is {ok:…} and nothing else. Never echo config or roster.
 *
 * WHAT IT ENFORCES
 *   · whitelist   — auto-synced faction roster, with a manual override column
 *   · kill switch — one cell stops all forwarding instantly
 *   · rate limits — per member and faction-wide, checked BEFORE any fetch/write
 *                   so a flood costs almost no quota
 *   · dedup       — the same request from two clients posts once
 *   · caps        — amount ceiling, note length, mentions neutralised server-side
 *
 * PARSERS ARE VALIDATED, NOT GUESSED
 *   Every regex below was checked against saved copies of the live pages:
 *     · faction funds log — 525/525 entries classified
 *     · player log        — 4/4 wordings, 380 non-transfer money lines ignored
 *   The traps they exposed are noted at each parser. Don't "simplify" them.
 */

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

var TABS = {
  CONFIG: 'Config', ROSTER: 'Roster', REQUESTS: 'Requests', PAYMENTS: 'Payments',
  DEBTS: 'Reimbursements', LOG: 'Log', UNPARSED: 'Unparsed',
};

var DEFAULT_CONFIG = [
  ['FORWARDING', 'on', 'Kill switch. Set to "off" to stop all Discord posts instantly.'],
  ['BANKER_ROLE_ID', '1502606173109747803', 'Discord role pinged on new requests. Blank to disable.'],
  ['RATE_GLOBAL_PER_HOUR', '20', 'Max requests forwarded per hour, whole faction.'],
  ['RATE_MEMBER_PER_HOUR', '5', 'Max requests forwarded per hour, per member.'],
  ['MAX_AMOUNT', '5000000000', 'Requests above this are rejected.'],
  ['NOTE_MAX', '200', 'Note characters kept.'],
  ['DEDUP_WINDOW_S', '120', 'Identical request from any client suppressed within this.'],
  ['WATCH_WINDOW_S', '1800', 'How long an untimed request stays open for auto-matching.'],
  ['WITHIN_GRACE_S', '600',
   'Extra watching after a "within X min" deadline, so a late payment still marks it PAID rather than leaving it EXPIRED.'],
  ['NEWS_CATEGORIES', 'giveFunds,depositFunds', 'Faction news categories polled. Edit if entries are missing.'],
  ['BANKER_ABILITIES', 'Money Giving,Balance Adjustment',
   'Position abilities that make someone a banker. Money Giving fills requests; Balance Adjustment corrects a helper. Anyone with neither who pays a request is treated as having fronted it.'],
  ['DEBT_ALERT_HOURS', '24', 'Nag about unsettled reimbursements older than this.'],
  ['WEEKLY_SUMMARY', 'on', 'Post a weekly digest to Discord.'],
  ['SHOW_BALANCE', 'off',
   'Show the requester\'s faction vault balance on the request embed. OFF by default. '
   + 'When on, the backend reads it from /faction/balance so it appears on chat requests too, '
   + 'not just panel ones. This is a current-state call — it does NOT count against the 50k/day '
   + 'row limit. May require the "balance" selection on TORN_API_KEY; if the key can\'t read it, '
   + 'the request still posts and just omits the balance (see the balance-error log line).'],
];

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function nowS_() { return Math.floor(Date.now() / 1000); }
function money_(s) { return Number(String(s).replace(/[^0-9.\-]/g, '')) || 0; }
/** Position names arrive spelled differently by different endpoints — the
 *  positions list says "Co Leader", the members payload says "Co-leader".
 *  Compare on letters and digits only so the two can't drift apart. */
function normPos_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function fmtMoney_(n) { return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) sh = ss_().insertSheet(name);
  return sh;
}

/** Config as a plain object, cached per execution. */
var _cfg = null;
function cfg_(key) {
  if (!_cfg) {
    _cfg = {};
    var rows = sheet_(TABS.CONFIG).getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) if (rows[i][0]) _cfg[String(rows[i][0])] = String(rows[i][1]);
  }
  return _cfg[key] !== undefined ? _cfg[key] : '';
}

function log_(kind, detail, extra) {
  try {
    sheet_(TABS.LOG).appendRow([new Date(), kind, detail || '', extra ? JSON.stringify(extra).slice(0, 500) : '']);
  } catch (e) { /* logging must never break the request path */ }
}

// ─── SETUP ───────────────────────────────────────────────────────────────────

function setup() {
  var headers = {};
  headers[TABS.CONFIG]   = ['key', 'value', 'what it does'];
  headers[TABS.ROSTER]   = ['user_id', 'name', 'position', 'is_banker_auto', 'is_banker_override',
                            'in_faction', 'override', 'last_seen'];
  headers[TABS.REQUESTS] = ['request_id', 'created', 'user_id', 'name', 'amount', 'amount_kind', 'note',
                            'mode', 'source', 'message_id', 'status', 'paid_by', 'paid_by_id', 'paid_route',
                            'paid_at', 'claimed_by', 'claimed_at', 'balance', 'deadline'];
  headers[TABS.PAYMENTS] = ['when', 'payer', 'payer_id', 'recipient', 'recipient_id', 'amount',
                            'route', 'request_id', 'detected_by'];
  headers[TABS.DEBTS]    = ['raised', 'helper', 'helper_id', 'amount', 'for_request', 'for_member',
                            'settled', 'settled_at', 'settled_by', 'note'];
  headers[TABS.LOG]      = ['when', 'kind', 'detail', 'extra'];
  headers[TABS.UNPARSED] = ['when', 'source', 'raw text'];

  for (var name in headers) {
    var sh = sheet_(name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(headers[name]);
      sh.setFrozenRows(1);
    } else if (sh.getLastColumn() < headers[name].length) {
      // A sheet created by an older version is missing trailing columns. Rewrite
      // just the header row — data columns are only ever APPENDED, never
      // reordered, so existing rows stay correct and simply have blanks at the end.
      sh.getRange(1, 1, 1, headers[name].length).setValues([headers[name]]);
    }
    sh.getRange(1, 1, 1, headers[name].length).setFontWeight('bold');
  }
  var c = sheet_(TABS.CONFIG);
  // Backfill any DEFAULT_CONFIG key missing from the sheet, so settings added in
  // a later version appear on a re-run WITHOUT overwriting values you've tuned.
  var haveKeys = {};
  if (c.getLastRow() > 1)
    c.getRange(2, 1, c.getLastRow() - 1, 1).getValues()
      .forEach(function (r) { if (r[0]) haveKeys[String(r[0])] = true; });
  DEFAULT_CONFIG.forEach(function (r) { if (!haveKeys[r[0]]) c.appendRow(r); });

  // Triggers — remove ours first so setup() is safe to re-run.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['pollFunds', 'syncRoster', 'sweepRequests', 'postWeeklySummary'].indexOf(t.getHandlerFunction()) >= 0)
      ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('pollFunds').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('sweepRequests').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('syncRoster').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('postWeeklySummary').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();

  syncRoster();
  log_('setup', 'tabs + triggers created');
  return 'Setup complete. Now deploy as a Web App (Execute as Me, Access Anyone).';
}

/**
 * Forget which news entries have been seen and empty the Unparsed tab, so the
 * next pollFunds() re-reads everything. Safe: settlement only ever touches OPEN
 * requests, so replaying old news can't disturb anything already closed.
 * Run this after changing a parser to check the fix on real data.
 */
function resetNewsCursor() {
  var p = PropertiesService.getScriptProperties();
  p.deleteProperty('SEEN_NEWS');
  p.deleteProperty('NEWS_CURSORS');
  p.deleteProperty('NEWS_CURSOR');           // legacy single-cursor key, if present
  var sh = sheet_(TABS.UNPARSED);
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  log_('reset', 'news cursors cleared, Unparsed emptied');
  return 'Cleared. Run pollFunds() to reprocess.';
}

/**
 * Clear the funds-poll cooldown set after an error-14 daily-limit hit. Run this
 * once the rolling 24h window has passed if you don't want to wait for the 3h
 * auto-retry. Harmless to run any time.
 */
function clearNewsCooldown() {
  PropertiesService.getScriptProperties().deleteProperty('NEWS_COOLDOWN_UNTIL');
  log_('reset', 'news cooldown cleared');
  return 'Cooldown cleared. Polling resumes on the next trigger (if a request is open).';
}

// ─── TORN API ────────────────────────────────────────────────────────────────

function tornGet_(path) {
  var key = prop_('TORN_API_KEY');
  if (!key) throw new Error('TORN_API_KEY not set in Script Properties');
  var url = 'https://api.torn.com/v2' + path + (path.indexOf('?') >= 0 ? '&' : '?')
          + 'key=' + encodeURIComponent(key) + '&comment=BankerRequest';
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var data = JSON.parse(res.getContentText());
  if (data && data.error) throw new Error('Torn API ' + data.error.code + ': ' + data.error.error);
  return data;
}

/** Torn ships lists as arrays (v2) or id-keyed objects (v1 leftovers). */
function tornList_(raw) {
  if (!raw) return [];
  if (Object.prototype.toString.call(raw) === '[object Array]') return raw;
  return Object.keys(raw).map(function (k) {
    var v = raw[k];
    return (v && typeof v === 'object') ? Object.assign({ id: k }, v) : { id: k, value: v };
  });
}

// ─── ROSTER SYNC ─────────────────────────────────────────────────────────────

/**
 * Rebuild the whitelist from the live faction, deriving bankers from position
 * permissions where possible.
 *
 * The cardinal rule here: this NEVER writes the columns you own. A sync that
 * rewrote whole rows would silently wipe every manual override on its next run,
 * and you would only notice when someone you blocked started posting again.
 * Only name / position / is_banker_auto / in_faction / last_seen are touched.
 */
function syncRoster() {
  var sh = sheet_(TABS.ROSTER);
  var rows = sh.getDataRange().getValues();
  var byId = {};
  for (var i = 1; i < rows.length; i++) if (rows[i][0]) byId[String(rows[i][0])] = i + 1;

  var members;
  try { members = tornList_(tornGet_('/faction/members').members); }
  catch (e) { log_('roster-error', String(e)); return; }

  // Torn returns permissions as an `abilities` ARRAY of human-readable strings,
  // not boolean fields — confirmed from a live run:
  //     {"name":"Conscript","is_default":true,"abilities":[]}
  //     … | Item Giving | Money Giving | … | Balance Adjustment | War Management | …
  // Matched by exact name from BANKER_ABILITIES in Config, so this is tunable
  // without touching code, with a loose fallback in case Torn renames one. Every
  // distinct ability seen is still logged, so a rename is visible immediately
  // rather than silently emptying the banker list.
  // Torn's built-in top roles are NOT returned by /faction/positions — they
  // implicitly hold every permission, so they never appear as custom positions.
  // Found the hard way on live data: /faction/positions returned
  //   Co Leader | Management | Leadership
  // while the roster listed Westend as "Leader" and Collete as "Co-leader" —
  // and those two are the 2nd and 3rd most active givers in the funds log.
  // Without this they'd be classed as ordinary members, so every vault fill they
  // made would raise a false debt claiming the faction owed THEM the money.
  var BUILTIN_LEADER_RE = /^(?:leader|co[-\s]?leader)$/i;

  var wanted = String(cfg_('BANKER_ABILITIES') || 'Money Giving,Balance Adjustment')
    .split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(String);
  var isBankerAbility = function (label) {
    var l = String(label || '').trim().toLowerCase();
    if (!l) return false;
    if (wanted.indexOf(l) >= 0) return true;
    return /giv.*money|money.*giv|balance.*adjust/i.test(l);
  };
  var bankerPositions = {}, knownPositions = {};
  try {
    var pos = tornList_(tornGet_('/faction/positions').positions);
    var allAbilities = {};
    pos.forEach(function (p) {
      var name = String(p.name || p.title || '');
      knownPositions[normPos_(name)] = true;
      var abilities = p.abilities || p.permissions || [];
      var hit = false;
      // Array of strings, array of objects, or an object of booleans — accept all.
      if (Object.prototype.toString.call(abilities) === '[object Array]') {
        abilities.forEach(function (a) {
          var label = typeof a === 'string' ? a : String((a && (a.name || a.ability || a.key)) || '');
          if (label) allAbilities[label] = true;
          if (isBankerAbility(label)) hit = true;
        });
      } else if (abilities && typeof abilities === 'object') {
        Object.keys(abilities).forEach(function (k) {
          allAbilities[k] = true;
          if (abilities[k] && isBankerAbility(k)) hit = true;
        });
      }
      // Keyed on a normalised name: the positions endpoint says "Co Leader"
      // while the members payload says "Co-leader" for the built-in role. An
      // exact-string lookup silently misses one of them.
      if (hit) bankerPositions[normPos_(name)] = true;
    });
    log_('positions-abilities', Object.keys(allAbilities).join(' | ').slice(0, 480),
         { positions: pos.length, bankers: Object.keys(bankerPositions) });
  } catch (e) { log_('positions-error', String(e)); }

  var seen = {}, unmatched = {};
  members.forEach(function (m) {
    var id = String(m.id != null ? m.id : '');
    if (!id) return;
    seen[id] = true;
    var position = String((m.position) || (m.faction && m.faction.position) || '');
    var banker = BUILTIN_LEADER_RE.test(position.trim()) || !!bankerPositions[normPos_(position)];
    // Any roster position with no counterpart in /faction/positions is worth
    // surfacing — that mismatch is exactly what hid Leader and Co-leader.
    if (!banker && position && !knownPositions[normPos_(position)]) unmatched[position] = true;
    var isBanker = banker ? 'TRUE' : '';
    if (byId[id]) {
      var r = byId[id];
      sh.getRange(r, 2).setValue(m.name || '');
      sh.getRange(r, 3).setValue(position);
      sh.getRange(r, 4).setValue(isBanker);
      sh.getRange(r, 6).setValue('TRUE');
      sh.getRange(r, 8).setValue(new Date());
    } else {
      // user_id, name, position, is_banker_auto, is_banker_override, in_faction, override, last_seen
      sh.appendRow([id, m.name || '', position, isBanker, '', 'TRUE', '', new Date()]);
    }
  });

  // Departed members keep their row — the audit trail matters more than tidiness.
  rows = sh.getDataRange().getValues();
  for (var j = 1; j < rows.length; j++) {
    var uid = String(rows[j][0]);
    if (uid && !seen[uid]) sh.getRange(j + 1, 6).setValue('FALSE');
  }
  PropertiesService.getScriptProperties().setProperty('LAST_ROSTER_SYNC', String(Date.now()));
  var bankerCount = 0;
  var rows2 = sh.getDataRange().getValues();
  for (var k = 1; k < rows2.length; k++) if (String(rows2[k][3]).toUpperCase() === 'TRUE') bankerCount++;
  log_('roster-sync', members.length + ' members, ' + bankerCount + ' flagged as bankers',
       { bankerPositions: Object.keys(bankerPositions), unmatchedRosterPositions: Object.keys(unmatched) });
}

/**
 * Re-sync when we're asked about somebody we've never heard of.
 *
 * The hourly trigger means a member who joined 50 minutes ago is rejected with
 * no explanation they could act on. An unknown id is exactly the signal that the
 * roster is stale, so refresh once and re-check.
 *
 * THROTTLED, and deliberately: without the cooldown this is a quota-burn vector —
 * anyone holding the endpoint URL could force a Torn API call per request just by
 * sending random ids. Only fires for genuinely unknown ids, never for someone we
 * know has left.
 */
function maybeSyncRoster_() {
  var last = Number(PropertiesService.getScriptProperties().getProperty('LAST_ROSTER_SYNC') || 0);
  if (Date.now() - last < 5 * 60e3) return false;
  PropertiesService.getScriptProperties().setProperty('LAST_ROSTER_SYNC', String(Date.now()));
  try { syncRoster(); return true; } catch (e) { log_('roster-error', String(e)); return false; }
}

/** {allowed, banker, name} for a claimed user id. Override always wins. */
function rosterCheck_(userId) {
  var rows = sheet_(TABS.ROSTER).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(userId)) continue;
    var override = String(rows[i][6] || '').toLowerCase();
    var inFaction = String(rows[i][5]).toUpperCase() === 'TRUE';
    var banker = String(rows[i][4] || '').toUpperCase() === 'TRUE'
              || (String(rows[i][4] || '') === '' && String(rows[i][3]).toUpperCase() === 'TRUE');
    if (override === 'block') return { allowed: false, banker: banker, name: rows[i][1], reason: 'blocked' };
    if (override === 'allow') return { allowed: true, banker: banker, name: rows[i][1] };
    return { allowed: inFaction, banker: banker, name: rows[i][1], reason: inFaction ? '' : 'not in faction' };
  }
  return { allowed: false, banker: false, name: null, reason: 'unknown id' };
}

// ─── DISCORD ─────────────────────────────────────────────────────────────────

// ─── EMBED ───────────────────────────────────────────────────────────────────
// State is carried by the colour bar, so a banker can read a channel at a glance
// without parsing text. The amount is the title because it's the one thing they
// need before deciding to act.

var EMBED_COLOR = {
  whenever:    0x5865F2,   // blurple — no rush
  online:      0x3BA55D,   // green   — waiting right now
  within:      0xFAA61A,   // amber   — on a clock
  chat:        0x5865F2,
  paid:        0x57F287,
  expired:     0xED4245,
  cancelled:   0x4F545C,
  unconfirmed: 0xFAA61A,
};

var MODE_TEXT = {
  whenever: "🕒 No rush — whenever a banker's free",
  online:   '🟢 Online now — wants it hand-to-hand',
  within:   '⏳ Time-limited',
  chat:     '💬 Asked in faction chat',
};

/**
 * Rebuild a request's embed from its sheet row.
 *
 * Deliberately derived from the row rather than patched onto the previous
 * message: an edit then can't drift from what's actually recorded, and every
 * state transition renders through one code path.
 */
function buildEmbed_(row, extra) {
  extra = extra || {};
  var status = String(extra.status || row[10] || 'open');
  var amountText = String(row[5]) === 'all' ? 'Entire balance' : fmtMoney_(Number(row[4]) || 0);
  var mode = String(row[7] || 'whenever');

  var head = {
    open:        { c: EMBED_COLOR[mode] || EMBED_COLOR.whenever, t: '🏦 ' + amountText },
    paid:        { c: EMBED_COLOR.paid,        t: '✅ PAID · ' + amountText },
    expired:     { c: EMBED_COLOR.expired,     t: '❌ EXPIRED · ' + amountText },
    cancelled:   { c: EMBED_COLOR.cancelled,   t: '🚫 CANCELLED · ' + amountText },
    unconfirmed: { c: EMBED_COLOR.unconfirmed, t: '⚠️ UNCONFIRMED · ' + amountText },
  }[status] || { c: EMBED_COLOR.whenever, t: '🏦 ' + amountText };

  var fields = [];
  if (status === 'open') {
    fields.push({ name: 'When', value: MODE_TEXT[mode] || MODE_TEXT.whenever, inline: false });
    if (Number(row[17]))   // non-zero (positive, or negative when they owe the faction); 0/unknown hides
      fields.push({ name: 'Their vault balance', value: fmtMoney_(Number(row[17])), inline: true });
    if (row[15]) fields.push({ name: 'Claimed by', value: '🔒 ' + row[15], inline: true });
  }
  if (status === 'paid') {
    if (row[11]) fields.push({ name: 'Paid by', value: String(row[11]), inline: true });
    fields.push({ name: 'Route', value: String(row[13]) === 'vault' ? '🏦 Faction vault' : '🤝 Personal send', inline: true });
  }
  if (extra.debtHelper) {
    fields.push({
      name: '🤝 Needs correcting',
      value: '**' + extra.debtHelper + '** fronted this out of pocket — their faction balance '
           + 'needs **+' + fmtMoney_(extra.debtAmount || Number(row[4])) + '**',
      inline: false,
    });
  }
  if (status === 'unconfirmed') {
    fields.push({
      name: 'What this means',
      // Never asserts non-payment: detection misses odd amounts and routes we
      // can't see, and "unpaid" would invite a second payment.
      value: 'No payment was detected. It may still have been paid — check before sending again.',
      inline: false,
    });
  }
  if (status === 'expired' && extra.mins)
    fields.push({ name: 'Deadline', value: 'Not filled within ' + extra.mins + ' min', inline: true });

  var e = {
    color: head.c,
    title: head.t,
    author: { name: String(row[3] || 'Unknown'),
              url: 'https://www.torn.com/profiles.php?XID=' + String(row[2]) },
    fields: fields,
    footer: { text: String(row[0] || '') + (status === 'open' ? '' : ' · ' + status) },
    timestamp: new Date(row[1] || Date.now()).toISOString(),
  };
  if (row[6]) e.description = '📝 ' + String(row[6]).slice(0, 3900);
  return e;
}

/** Rebuild and push a request's message. One path for every state change.
 *  A failure is queued rather than dropped — the sheet is already correct, so
 *  the message just needs pushing again once Discord lets us. */
function updateRequestMessage_(row, extra) {
  var r = discordEdit_(row[9], '', buildEmbed_(row, extra));
  if (!r.ok && r.retryable && row[0]) queueEdit_(row[0]);
  return r.ok;
}

/**
 * How long to wait after a 429.
 *
 * Discord's own throttle returns JSON with retry_after. Cloudflare's (error code
 * 1015) returns plain text, so JSON.parse throws — hence a sane default rather
 * than a crash. CF's limit is per source IP, and Apps Script egresses from
 * Google's shared ranges, so it can fire from traffic that isn't even ours.
 */
function retryAfterFrom_(text) {
  try {
    var j = JSON.parse(text);
    if (j && j.retry_after) return Math.min(Number(j.retry_after) * 1000 + 250, 15000);
  } catch (_) {}
  return 5000;
}

/**
 * The one place any Discord HTTP request goes out.
 *
 * A TOGGLE, not a fork: if RELAY_URL is set in Script Properties, requests go
 * through a Cloudflare Worker (which egresses from Cloudflare's network instead
 * of Google's shared ranges, sidestepping the 1015 IP throttle); if it isn't,
 * they go straight to Discord exactly as before. Turn it on or off by adding or
 * clearing one property — no code change, no redeploy.
 *
 * The relay is REQUIRED to pass Discord's status code straight through, so the
 * 429 handling and circuit breaker upstream still see the real response.
 *
 * @param op  'post' | 'edit' | 'del'
 * @returns {code, text} — normalised so callers don't care which path ran.
 */
function discordFetch_(op, messageId, payload) {
  var relay = prop_('RELAY_URL');
  // Only route to the relay if RELAY_URL is a REAL https URL. A placeholder or
  // typo (e.g. the value literally "RELAY_URL") would otherwise be fetched as
  // http://RELAY_URL and DNS-fail every Discord call. A bad value falls through
  // to direct instead, which fails with a clear "DISCORD_WEBHOOK not set" if
  // that's also missing — far more diagnostic than a DNS error.
  if (relay && !/^https:\/\/\S+\.\S+/i.test(relay)) {
    log_('relay-misconfig', 'RELAY_URL is not a valid https URL ("' + String(relay).slice(0, 40) + '") — using direct Discord instead');
    relay = '';
  }
  var res;
  if (relay) {
    res = UrlFetchApp.fetch(relay, {
      method: 'post', contentType: 'application/json',
      headers: { 'X-Relay-Key': prop_('RELAY_KEY') },
      payload: JSON.stringify({ op: op, message_id: messageId || '', body: payload || null }),
      muteHttpExceptions: true,
    });
  } else {
    var hook = prop_('DISCORD_WEBHOOK');
    if (!hook) throw new Error('DISCORD_WEBHOOK not set');
    var base = hook.split('?')[0];
    var url = op === 'post' ? base + '?wait=true' : base + '/messages/' + messageId;
    var method = op === 'post' ? 'post' : op === 'edit' ? 'patch' : 'delete';
    var opts = { method: method, muteHttpExceptions: true };
    if (method !== 'delete') { opts.contentType = 'application/json'; opts.payload = JSON.stringify(payload || {}); }
    res = UrlFetchApp.fetch(url, opts);
  }
  return { code: res.getResponseCode(), text: res.getContentText() };
}

function discordPost_(content, roleId, embed, attempt) {
  if (!prop_('RELAY_URL') && !prop_('DISCORD_WEBHOOK')) throw new Error('DISCORD_WEBHOOK not set');
  if (discordCooling_()) throw new Error('Discord rate limited — cooling down, try again shortly');
  var payload = { content: content, allowed_mentions: { parse: [], roles: roleId ? [roleId] : [] } };
  if (embed) payload.embeds = [embed];
  var res = discordFetch_('post', null, payload);
  if (res.code === 429) {
    // Capped. This used to recurse without a limit, so a sustained rate limit
    // spun until Apps Script's 6-minute execution timeout killed the whole run.
    if ((attempt || 0) >= 1) {
      discordCooldown_(retryAfterFrom_(res.text) * 4);
      throw new Error('Discord 429 — rate limited, backing off');
    }
    Utilities.sleep(retryAfterFrom_(res.text));
    return discordPost_(content, roleId, embed, (attempt || 0) + 1);
  }
  if (res.code >= 300) throw new Error('Discord ' + res.code + ' ' + String(res.text).slice(0, 120));
  return JSON.parse(res.text);
}

/**
 * Edit a message this webhook posted.
 *
 * Returns false rather than throwing — but callers used to ignore that, so every
 * failed edit was invisible: the sheet updated, the user saw a success toast,
 * and Discord silently kept showing the old text. Failures are logged here so
 * one place always records them regardless of what the caller does.
 *
 * The usual cause is a CHANGED WEBHOOK: a webhook can only edit its own
 * messages, so anything posted by a previous webhook is permanently uneditable
 * and returns 404.
 */
/**
 * CIRCUIT BREAKER.
 *
 * Apps Script egresses from Google's SHARED IP ranges and Cloudflare rate-limits
 * per IP, so we can be throttled by traffic that isn't ours (that's Cloudflare
 * error 1015 — an IP ban, not a per-webhook one). Retrying into that makes it
 * worse and can extend the ban, so once we see a 429 we stop talking to Discord
 * entirely for a while. Edits queue up meanwhile and land when it lifts; nothing
 * is lost, because every message renders from the sheet row.
 */
function discordCooling_() {
  return Date.now() < Number(PropertiesService.getScriptProperties()
    .getProperty('DISCORD_COOLDOWN_UNTIL') || 0);
}
function discordCooldown_(ms) {
  var until = Date.now() + (ms || 60000);
  PropertiesService.getScriptProperties().setProperty('DISCORD_COOLDOWN_UNTIL', String(until));
  log_('discord-cooldown', 'pausing Discord calls until ' + new Date(until).toISOString());
}

/**
 * @returns {ok, code, retryable} — NOT a bare boolean, because the caller has to
 *          know WHY it failed. A 404 (message posted by a different webhook) can
 *          never succeed, and retrying it forever is precisely what earns an IP
 *          ban. Only 429 and 5xx are worth queueing.
 */
function discordEdit_(messageId, content, embed, attempt) {
  if (discordCooling_()) return { ok: false, code: 429, retryable: true };
  var body = { content: content || '', allowed_mentions: { parse: [] } };
  if (embed) body.embeds = [embed];
  var res = discordFetch_('edit', messageId, body);
  var code = res.code;
  if (code === 429) {
    if ((attempt || 0) < 1) {                      // one quick retry, then back off
      Utilities.sleep(retryAfterFrom_(res.text));
      return discordEdit_(messageId, content, embed, (attempt || 0) + 1);
    }
    discordCooldown_(retryAfterFrom_(res.text) * 4);
  }
  if (code >= 300) {
    var retryable = (code === 429 || code >= 500);
    log_('discord-edit-error', 'HTTP ' + code + ' editing message ' + messageId
      + (code === 404 ? ' — posted by a DIFFERENT webhook (or deleted): unfixable, not retried' : '')
      + (retryable ? ' — queued for retry' : ''),
      String(res.text).slice(0, 200));
    return { ok: false, code: code, retryable: retryable };
  }
  return { ok: true, code: code, retryable: false };
}

// ─── EDIT RETRY QUEUE ────────────────────────────────────────────────────────
// Every state renders from the sheet row, so a retry only needs to know WHICH
// request still needs pushing — not what the message should have said.
//
// Entries are "requestId|attempts" and are dropped after MAX_EDIT_ATTEMPTS. An
// unbounded queue of permanently-failing edits is a self-inflicted rate limit.

var MAX_EDIT_ATTEMPTS = 5;

function queueEdit_(requestId) {
  var p = PropertiesService.getScriptProperties();
  var q = String(p.getProperty('EDIT_QUEUE') || '').split(',').filter(String);
  for (var i = 0; i < q.length; i++) if (q[i].split('|')[0] === String(requestId)) return;
  q.push(String(requestId) + '|0');
  p.setProperty('EDIT_QUEUE', q.slice(-50).join(','));
}

function drainEditQueue_() {
  var p = PropertiesService.getScriptProperties();
  var q = String(p.getProperty('EDIT_QUEUE') || '').split(',').filter(String);
  if (!q.length || discordCooling_()) return;
  var rows = sheet_(TABS.REQUESTS).getDataRange().getValues();
  var still = [];
  for (var k = 0; k < q.length; k++) {
    var parts = q[k].split('|');
    var id = parts[0], tries = Number(parts[1] || 0);
    var found = null;
    for (var i = rows.length - 1; i > 0; i--) if (String(rows[i][0]) === id) { found = rows[i]; break; }
    if (!found || !found[9]) continue;                     // gone, or never posted
    var r = discordEdit_(found[9], '', buildEmbed_(found, {}));
    if (r.ok) continue;
    if (!r.retryable) { log_('edit-dropped', id + ' — HTTP ' + r.code + ', not retryable'); continue; }
    if (tries + 1 >= MAX_EDIT_ATTEMPTS) { log_('edit-dropped', id + ' — gave up after ' + MAX_EDIT_ATTEMPTS); continue; }
    still.push(id + '|' + (tries + 1));
    if (discordCooling_()) {                               // breaker tripped mid-drain: keep the rest
      for (var j = k + 1; j < q.length; j++) still.push(q[j]);
      break;
    }
    Utilities.sleep(400);                                  // stay inside the per-webhook limit
  }
  p.setProperty('EDIT_QUEUE', still.join(','));
  if (still.length) log_('edit-queue', still.length + ' edit(s) still pending');
}

// ─── REQUEST HANDLING ────────────────────────────────────────────────────────

function sanitizeNote_(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/@(everyone|here)/gi, '@​$1')   // neutralise here, not in the client:
    .replace(/<(@|#|t:|a?:)/g, '< $1')            // an attacker isn't running your code
    .replace(/```/g, '')
    .trim().slice(0, Number(cfg_('NOTE_MAX')) || 200);
}

function rateOk_(userId) {
  var sh = sheet_(TABS.REQUESTS);
  var rows = sh.getDataRange().getValues();
  var cutoff = new Date(Date.now() - 3600e3);
  var global = 0, mine = 0;
  for (var i = rows.length - 1; i > 0; i--) {
    var when = rows[i][1];
    if (!(when instanceof Date) || when < cutoff) break;   // rows are append-ordered
    global++;
    if (String(rows[i][2]) === String(userId)) mine++;
  }
  if (global >= (Number(cfg_('RATE_GLOBAL_PER_HOUR')) || 20)) return 'faction rate limit';
  if (mine >= (Number(cfg_('RATE_MEMBER_PER_HOUR')) || 5)) return 'your rate limit';
  return null;
}

/** Same person + amount + mode inside the dedup window ⇒ already posted. This is
 *  what makes it safe for every member to relay chat requests: N clients see the
 *  same @banker line, N requests arrive, one Discord message results. */
function dedupFind_(userId, amount, mode) {
  var win = Number(cfg_('DEDUP_WINDOW_S')) || 120;
  var rows = sheet_(TABS.REQUESTS).getDataRange().getValues();
  var cutoff = new Date(Date.now() - win * 1000);
  for (var i = rows.length - 1; i > 0; i--) {
    var when = rows[i][1];
    if (!(when instanceof Date) || when < cutoff) break;
    if (String(rows[i][2]) === String(userId) && Number(rows[i][4]) === Number(amount)
        && String(rows[i][7]) === String(mode)) return rows[i][9];   // existing message_id
  }
  return null;
}

/**
 * A member's faction vault balance, or null if disabled/unavailable.
 *
 * OFF by default (SHOW_BALANCE). Reads /faction/balance — a CURRENT-STATE call,
 * so it does NOT count against the 50k/day row limit — and a 60s cache lets a
 * burst of requests share a single call.
 *
 * NOT VERIFIED AGAINST LIVE DATA when written: the v2 response shape here is a
 * best guess, so the parse is deliberately tolerant and the raw response is
 * logged ONCE ('balance-shape') the first time it succeeds. Confirm that log
 * line against the real payload, then extractMemberMoney_ can be tightened — do
 * not treat the shapes below as validated. (Same discipline as the funds-log
 * parser, which failed 100% of live entries the first time it was guessed.)
 */
function memberBalance_(userId) {
  if (String(cfg_('SHOW_BALANCE')).toLowerCase() !== 'on') return null;
  var id = String(userId || '').replace(/[^0-9]/g, '');
  if (!id) return null;

  var cache = CacheService.getScriptCache();
  var ck = 'bal_' + id;
  var hit = cache.get(ck);
  if (hit !== null && hit !== '') { var cv = Number(hit); return Number.isFinite(cv) ? cv : null; }

  var data;
  try { data = tornGet_('/faction/balance'); }
  catch (e) { log_('balance-error', String(e)); return null; }

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('BALANCE_SHAPE_LOGGED')) {
    log_('balance-shape', JSON.stringify(data).slice(0, 450));
    props.setProperty('BALANCE_SHAPE_LOGGED', '1');
  }

  var money = extractMemberMoney_(data, id);
  if (money !== null) cache.put(ck, String(money), 60);
  return money;
}

/** Pull one member's money out of /faction/balance, tolerant of shape: members
 *  as an array of {id, money}, an object keyed by id, or the id-map at the root;
 *  value as {money}/{balance}/{total} or a bare number. null if not found. */
function extractMemberMoney_(data, id) {
  var root = (data && data.balance) ? data.balance : data;
  if (!root || typeof root !== 'object') return null;
  var members = root.members || root.member || root.balances || null;
  if (members && typeof members === 'object' && !Array.isArray(members) && members[id] !== undefined)
    return pickMoney_(members[id]);
  if (Array.isArray(members)) {
    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      if (m && String(m.id !== undefined ? m.id : m.user_id) === id) return pickMoney_(m);
    }
  }
  if (root[id] !== undefined) return pickMoney_(root[id]);
  return null;
}

function pickMoney_(m) {
  if (m == null) return null;
  if (typeof m === 'number') return Math.round(m);
  var v = (m.money != null) ? m.money : (m.balance != null ? m.balance : (m.total != null ? m.total : null));
  return (v == null) ? null : Math.round(Number(v));
}

function handleRequest_(p) {
  if (String(cfg_('FORWARDING')).toLowerCase() !== 'on') return { ok: false, reason: 'forwarding disabled' };

  // The RELAYER must be on the roster — that's the whitelist doing its job. But a
  // chat relay is raised on behalf of whoever actually typed "@banker", so the
  // request is attributed to them and THEY are roster-checked too. Otherwise a
  // relay could raise requests naming anyone at all.
  var relay = rosterCheck_(p.user_id);
  // Never heard of them? The roster may simply be stale — refresh once and retry
  // before turning away someone who joined since the last hourly sync.
  if (!relay.allowed && relay.reason === 'unknown id' && maybeSyncRoster_()) {
    relay = rosterCheck_(p.user_id);
    if (relay.allowed) log_('roster-catchup', 'admitted ' + p.user_id + ' after refresh');
  }
  if (!relay.allowed) {
    log_('reject', 'roster: ' + (relay.reason || ''), { user_id: p.user_id });
    return { ok: false, reason: relay.reason === 'not in faction'
      ? 'not in the faction' : 'not authorised (roster may take up to an hour to pick up new members)' };
  }
  var subject = String(p.on_behalf_of || '').replace(/[^0-9]/g, '');
  if (subject && subject !== String(p.user_id)) {
    var onBehalf = rosterCheck_(subject);
    if (!onBehalf.allowed) {
      log_('reject', 'relay subject not on roster', { relay: p.user_id, subject: subject });
      return { ok: false, reason: 'subject not authorised' };
    }
    p = Object.assign({}, p, { user_id: subject, name: onBehalf.name });
  }
  var who = rosterCheck_(p.user_id);
  var amount = Math.round(Number(p.amount) || 0);
  var kind = String(p.amount_kind || 'amount');
  // Only real amounts or an explicit "all" post. A 'none'/blank kind (an ambiguous
  // "@banker …" with no amount) must never post as $0 — reject it here too, so an
  // un-updated client can't produce the $0 noise either.
  if (kind !== 'amount' && kind !== 'all') return { ok: false, reason: 'no amount specified' };
  if (kind === 'amount' && (!amount || amount <= 0)) return { ok: false, reason: 'bad amount' };
  if (amount > (Number(cfg_('MAX_AMOUNT')) || 5e9)) {
    log_('reject', 'amount cap', { user_id: p.user_id, amount: amount });
    return { ok: false, reason: 'amount above the configured cap' };
  }
  var rate = rateOk_(p.user_id);
  if (rate) { log_('reject', rate, { user_id: p.user_id }); return { ok: false, reason: rate }; }

  var mode = String(p.mode || 'whenever');
  var dup = dedupFind_(p.user_id, amount, mode);
  if (dup) return { ok: true, message_id: dup, deduped: true };

  var note = sanitizeNote_(p.note);
  var name = who.name || p.name || ('#' + p.user_id);
  var amountText = kind === 'all' ? 'their entire balance' : fmtMoney_(amount);
  var role = cfg_('BANKER_ROLE_ID');
  var rid = 'R' + nowS_() + '-' + Math.floor(Math.random() * 1000);
  var balance = Math.max(0, Math.round(Number(p.balance) || 0));
  // SHOW_BALANCE on → read the real vault balance server-side so it's present on
  // chat requests too (the client can only scrape it on the donate page). null
  // means disabled or unreadable, so the client-supplied value stands. A real
  // value may be negative (the member owes the faction) — kept, not clamped.
  var apiBal = memberBalance_(p.user_id);
  if (apiBal !== null) balance = apiBal;

  // Build the row first, then render the embed FROM it, so the posted message
  // and the stored record can't disagree — every later edit renders the same way.
  // "Within X min" gets a real deadline. Without one, a timed request behaved
  // exactly like any other and quietly ignored the clock the member set.
  var deadline = (mode === 'within')
    ? nowS_() + Math.max(1, Math.min(1440, Number(p.minutes) || 10)) * 60 : '';
  var row = [rid, new Date(), String(p.user_id), name, amount, kind, note,
             mode, String(p.source || 'panel'), '', 'open', '', '', '', '', '', '', balance, deadline];

  // The request is RECORDED whether or not Discord accepts it right now. A
  // rate limit is transient and outside our control; losing somebody's request
  // to it is not acceptable. A queued row is posted by the next sweep, so the
  // worst case is a few minutes' delay rather than a request that vanished.
  var msg = null, postErr = null;
  try { msg = discordPost_(role ? '<@&' + role + '>' : '', role, buildEmbed_(row)); }
  catch (e) { postErr = String(e); log_('discord-error', postErr); }

  row[9] = msg ? msg.id : '';
  row[10] = msg ? 'open' : 'queued';
  sheet_(TABS.REQUESTS).appendRow(row);
  log_('request', rid + ' ' + name + ' ' + amountText + (msg ? '' : ' [QUEUED — Discord unavailable]'));
  if (!msg) return { ok: true, request_id: rid, queued: true, reason: postErr };
  return { ok: true, message_id: msg.id, request_id: rid };
}

// ─── FUNDS-LOG WATCHER ───────────────────────────────────────────────────────
//
// Validated against a saved copy of the live funds log: 525/525 entries
// classified. Three traps that cost real correctness, all found in real data:
//
//   1. "was given" is PASSIVE and puts the RECIPIENT FIRST, the opposite of the
//      balance lines. 90 of 525 entries — the entire normal-fill path. Sharing
//      one field order between the two would invert every ledger row.
//   2. Balances go NEGATIVE ("from $-241,354,063 to $0"), because Torn natively
//      tracks a member owing the faction. Without the minus, entries vanish.
//   3. 162 of 210 balance lines are OC PAYOUTS carrying "cut for their role …
//      scenario". Counted as reimbursements, every OC payout would settle a debt
//      that was never paid.

// Anchored on XID, NOT on the full href. The API and the rendered page disagree
// about the markup — the page emits  <a href="https://www.torn.com/...">  while
// the API emits  <a href = "http://www.torn.com/...">  (spaces around the =, and
// http rather than https). A URL-anchored regex matched the saved page perfectly
// and then failed on 100% of live entries. Anything that carries an XID is a
// profile link; that's the only part worth depending on.
var RE_A = '<a[^>]*XID=(\\d+)[^>]*>([^<]*)</a>';
var RE_GIVEN = new RegExp(RE_A + ' was given \\$([\\d,]+) by ' + RE_A, 'g');
var RE_BAL = new RegExp(RE_A + '\\s+(increased|decreased)\\s+' + RE_A +
  "'s\\s+(?:<a[^>]*>[^<]*</a>\\s+)?money balance by \\$(-?[\\d,]+) from \\$(-?[\\d,]+) to \\$(-?[\\d,]+)([^<]*)", 'g');
var RE_OC_PAYOUT = /cut for their role as .+ in the faction's .+ scenario/i;

function parseFundsEntry_(text) {
  var m;
  RE_GIVEN.lastIndex = 0;
  if ((m = RE_GIVEN.exec(text)) !== null)
    return { kind: 'given', toId: m[1], to: m[2], amount: money_(m[3]), byId: m[4], by: m[5] };
  RE_BAL.lastIndex = 0;
  if ((m = RE_BAL.exec(text)) !== null)
    return { kind: 'balance', byId: m[1], by: m[2], verb: m[3], toId: m[4], to: m[5],
             amount: money_(m[6]), before: money_(m[7]), after: money_(m[8]),
             isOc: RE_OC_PAYOUT.test(m[9] || '') };
  return null;
}

/**
 * Is there anything the funds log could tell us right now?
 *
 * The whole reason to read the faction news is to catch a banker filling a
 * request from the vault, or correcting a helper's balance. If there are no open
 * requests and no fresh unsettled debts, there is NOTHING to detect — so we make
 * zero API calls. Most of the day that's the case, and this is what keeps us
 * under Torn's 50,000-rows/day cloud limit (error 14).
 *
 * @returns the oldest unix timestamp worth looking back to, or 0 if nothing is
 *          pending (meaning: don't poll at all).
 */
function fundsWatchFrom_() {
  var win = Number(cfg_('WATCH_WINDOW_S')) || 1800;
  var grace = Number(cfg_('WITHIN_GRACE_S')) || 600;
  var debtWin = (Number(cfg_('DEBT_ALERT_HOURS')) || 24) * 3600 * 2;
  var oldest = 0;
  var consider = function (createdSec, deadlineSec) {
    var until = deadlineSec ? deadlineSec + grace : createdSec + win;
    if (nowS_() <= until) oldest = oldest ? Math.min(oldest, createdSec) : createdSec;
  };

  var rows = sheet_(TABS.REQUESTS).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var st = String(rows[i][10]);
    if (st !== 'open' && st !== 'expired') continue;         // only these can still be paid
    var created = Math.floor(new Date(rows[i][1]).getTime() / 1000);
    consider(created, Number(rows[i][18]) || 0);
  }
  var drows = sheet_(TABS.DEBTS).getDataRange().getValues();
  for (var j = 1; j < drows.length; j++) {
    if (String(drows[j][6]).toUpperCase() === 'TRUE') continue;   // already settled
    var raised = Math.floor(new Date(drows[j][0]).getTime() / 1000);
    if (nowS_() - raised <= debtWin) oldest = oldest ? Math.min(oldest, raised) : raised;
  }
  return oldest;
}

/**
 * Read only what's NEW, and only when something is pending.
 *
 * v3.1 — three changes, all to stay under the 50k-rows/day cloud limit that the
 * old every-minute × 2-categories × 100-rows poll blew through in ~4 hours (and
 * shares with the OC Suite, since both use the same account):
 *   1. GATE — no open request or fresh debt ⇒ no call at all.
 *   2. CURSOR — fetch from the last-seen timestamp forward (ASC), so a poll pulls
 *      the handful of new entries since last time, not a fixed 100.
 *   3. BACKOFF — on error 14, stop calling for a few hours instead of hammering
 *      the maxed-out limit every minute (which also spammed the log).
 */
function pollFunds() {
  if (!prop_('TORN_API_KEY')) return;

  var props = PropertiesService.getScriptProperties();
  var coolUntil = Number(props.getProperty('NEWS_COOLDOWN_UNTIL') || 0);
  if (Date.now() < coolUntil) return;                        // daily limit hit; wait it out

  var watchFrom = fundsWatchFrom_();
  if (!watchFrom) return;                                    // nothing pending — spend nothing

  // A cursor PER CATEGORY. A single shared cursor advanced to the newest entry
  // across both would skip a category that lagged behind — e.g. giveFunds up to
  // T+100 but depositFunds only to T+10 leaves everything between skipped.
  var cursors = {};
  try { cursors = JSON.parse(props.getProperty('NEWS_CURSORS') || '{}') || {}; } catch (_) {}

  var seen = {};
  (props.getProperty('SEEN_NEWS') || '').split(',').forEach(function (id) { if (id) seen[id] = true; });

  var cats = String(cfg_('NEWS_CATEGORIES') || 'giveFunds').split(',');
  var fresh = [];
  for (var c = 0; c < cats.length; c++) {
    var cat = cats[c].trim();
    if (!cat) continue;
    var cur = Number(cursors[cat] || 0);
    var from = cur > 0 ? Math.max(cur, watchFrom - 1) : watchFrom;
    var data;
    try {
      // from + ASC = only entries after this category's cursor, oldest first.
      // limit=25 is plenty per poll; a burst just carries over, since the cursor
      // only advances past what we actually pulled.
      data = tornGet_('/faction/news?cat=' + cat + '&striptags=false&limit=25&sort=ASC&from=' + from);
    } catch (e) {
      var msg = String(e);
      if (msg.indexOf('API 14') >= 0 || /Daily read limit/i.test(msg)) {
        props.setProperty('NEWS_COOLDOWN_UNTIL', String(Date.now() + 3 * 3600e3));
        log_('news-limit', 'daily read limit reached — pausing funds polling for 3h');
        break;                        // stop hitting the wall; cursors already saved below
      }
      log_('news-error', cat + ': ' + e);
      continue;
    }
    var catMax = cur;
    tornList_(data.news).forEach(function (n) {
      var id = String(n.id != null ? n.id : '');
      var ts = Number(n.timestamp || 0);
      if (ts > catMax) catMax = ts;
      if (!id || seen[id]) return;
      seen[id] = true;
      fresh.push({ id: id, ts: ts, text: String(n.news || n.text || '') });
    });
    cursors[cat] = catMax;
  }

  props.setProperty('NEWS_CURSORS', JSON.stringify(cursors));
  if (!fresh.length) return;

  fresh.sort(function (a, b) { return a.ts - b.ts; });
  fresh.forEach(function (n) {
    var e = parseFundsEntry_(n.text);
    if (!e) {
      if (/money balance|was given/i.test(n.text))
        sheet_(TABS.UNPARSED).appendRow([new Date(), 'funds', n.text.slice(0, 400)]);
      return;
    }
    if (e.kind === 'balance' && e.isOc) return;              // OC payout, never a fill
    if (e.kind === 'given') settleRequest_(e.toId, e.amount, e.by, e.byId, 'vault', n.ts);
    if (e.kind === 'balance') settleDebt_(e, n.ts);
  });

  var keep = Object.keys(seen).slice(-400);
  props.setProperty('SEEN_NEWS', keep.join(','));
}

/** Mark an open request paid. Amount must match exactly — a loose match would let
 *  any unrelated transfer close somebody's request. */
function settleRequest_(userId, amount, payerName, payerId, route, ts) {
  var sh = sheet_(TABS.REQUESTS);
  var rows = sh.getDataRange().getValues();
  var win = Number(cfg_('WATCH_WINDOW_S')) || 1800;
  var grace = Number(cfg_('WITHIN_GRACE_S')) || 600;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][2]) !== String(userId)) continue;
    // 'expired' still counts: a timed request that missed its deadline can be
    // paid late, and PAID is the truth of what happened.
    var st = String(rows[i][10]);
    if (st !== 'open' && st !== 'expired') continue;
    if (Number(rows[i][4]) !== Number(amount)) continue;
    var created = Math.floor(new Date(rows[i][1]).getTime() / 1000);
    var deadline = Number(rows[i][18]) || 0;
    if (nowS_() > (deadline ? deadline + grace : created + win)) continue;

    sh.getRange(i + 1, 11).setValue('paid');
    sh.getRange(i + 1, 12).setValue(payerName || '');
    sh.getRange(i + 1, 13).setValue(payerId || '');
    sh.getRange(i + 1, 14).setValue(route);
    sh.getRange(i + 1, 15).setValue(new Date((ts || nowS_()) * 1000));
    sheet_(TABS.PAYMENTS).appendRow([new Date((ts || nowS_()) * 1000), payerName || '', payerId || '',
      rows[i][3], String(userId), amount, route, rows[i][0], route === 'vault' ? 'funds log' : 'client log']);

    var who = rosterCheck_(payerId);
    var extra = { status: 'paid' };
    // A non-banker filling a request means they fronted it out of pocket, so the
    // faction owes them — that debt is the whole point of tracking this.
    if (route === 'personal' && payerId && !who.banker) {
      sheet_(TABS.DEBTS).appendRow([new Date(), payerName || '', payerId, amount, rows[i][0], rows[i][3],
        'FALSE', '', '', 'fronted a request']);
      extra.debtHelper = payerName;
      extra.debtAmount = amount;
    }
    // Re-read so the embed renders from the values just written, not stale ones.
    var fresh = sh.getRange(i + 1, 1, 1, Math.max(18, sh.getLastColumn())).getValues()[0];
    updateRequestMessage_(fresh, extra);
    log_('paid', rows[i][0] + ' by ' + payerName + ' (' + route + ')');
    return true;
  }
  return false;
}

/**
 * A balance adjustment settles a debt ONLY when it lines up with something we
 * already know about. Balance movements happen constantly for reasons that have
 * nothing to do with requests — consolidations, war splits, self-withdrawals —
 * and treating any increase as a reimbursement would close debts nobody paid.
 */
function settleDebt_(e, ts) {
  if (e.verb !== 'increased') return;
  if (String(e.byId) === String(e.toId)) return;          // self-adjustment
  var sh = sheet_(TABS.DEBTS);
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][6]).toUpperCase() === 'TRUE') continue;
    if (String(rows[i][2]) !== String(e.toId)) continue;
    if (Number(rows[i][3]) !== Number(e.amount)) continue;
    sh.getRange(i + 1, 7).setValue('TRUE');
    sh.getRange(i + 1, 8).setValue(new Date((ts || nowS_()) * 1000));
    sh.getRange(i + 1, 9).setValue(e.by || '');
    log_('debt-settled', e.to + ' +' + fmtMoney_(e.amount) + ' by ' + e.by);
    return;
  }
}

// ─── EXPIRY ──────────────────────────────────────────────────────────────────

/**
 * Close out requests nobody filled.
 *
 * The note deliberately never says "unpaid". Detection legitimately misses
 * payments — an odd amount, a route we can't see — and a message asserting
 * non-payment invites a banker to pay a second time. That costs real money, so
 * it reports only what is actually known: nothing was detected.
 */
/**
 * Post any request that couldn't reach Discord when it was made.
 *
 * This is what makes a rate limit a delay instead of a loss. Rows are held as
 * 'queued' with no message_id; once Discord is reachable they post and become
 * ordinary open requests. Anything still queued past its watch window is given
 * up on — posting a request nobody can fill any more just adds noise.
 */
function drainQueuedPosts_(sh, rows, win) {
  if (discordCooling_()) return;
  var role = cfg_('BANKER_ROLE_ID');
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][10]) !== 'queued') continue;
    var age = nowS_() - Math.floor(new Date(rows[i][1]).getTime() / 1000);
    if (age > win) {
      sh.getRange(i + 1, 11).setValue('dropped');
      log_('request-dropped', rows[i][0] + ' — never reached Discord within the watch window');
      continue;
    }
    try {
      var msg = discordPost_(role ? '<@&' + role + '>' : '', role, buildEmbed_(rows[i], { status: 'open' }));
      sh.getRange(i + 1, 10).setValue(msg.id);
      sh.getRange(i + 1, 11).setValue('open');
      rows[i][9] = msg.id; rows[i][10] = 'open';
      log_('request-posted', rows[i][0] + ' — queued post delivered');
      Utilities.sleep(400);
    } catch (e) {
      log_('discord-error', 'queued post ' + rows[i][0] + ': ' + e);
      return;                       // breaker likely tripped; leave the rest queued
    }
  }
}

function sweepRequests() {
  var sh = sheet_(TABS.REQUESTS);
  var rows = sh.getDataRange().getValues();
  var win = Number(cfg_('WATCH_WINDOW_S')) || 1800;
  var grace = Number(cfg_('WITHIN_GRACE_S')) || 600;
  var mins = Math.round(win / 60);
  drainQueuedPosts_(sh, rows, win);

  for (var i = 1; i < rows.length; i++) {
    var status = String(rows[i][10]);
    if (status !== 'open' && status !== 'expired') continue;
    var created = Math.floor(new Date(rows[i][1]).getTime() / 1000);
    var deadline = Number(rows[i][18]) || 0;

    // A timed request that blew its deadline gets struck through — but keeps
    // being watched through the grace, so a late payment still flips it to PAID.
    if (status === 'open' && deadline && nowS_() > deadline) {
      sh.getRange(i + 1, 11).setValue('expired');
      rows[i][10] = 'expired';
      updateRequestMessage_(rows[i], { status: 'expired',
        mins: Math.round((deadline - created) / 60) });
      log_('expired', rows[i][0]);
      status = 'expired';
    }

    var until = deadline ? deadline + grace : created + win;
    if (nowS_() <= until) continue;

    if (status === 'expired') {
      sh.getRange(i + 1, 11).setValue('closed');    // EXPIRED already said its piece
      log_('closed', rows[i][0]);
    } else {
      sh.getRange(i + 1, 11).setValue('unconfirmed');
      updateRequestMessage_(rows[i], { status: 'unconfirmed', mins: mins });
      log_('unconfirmed', rows[i][0]);
    }
  }
  drainEditQueue_();   // retry anything Discord refused earlier
  nagDebts_();
}

function nagDebts_() {
  var hours = Number(cfg_('DEBT_ALERT_HOURS')) || 24;
  var rows = sheet_(TABS.DEBTS).getDataRange().getValues();
  var owed = [];
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][6]).toUpperCase() === 'TRUE') continue;
    if (Date.now() - new Date(rows[i][0]).getTime() < hours * 3600e3) continue;
    owed.push('• **' + rows[i][1] + '** — ' + fmtMoney_(rows[i][3]) + ' (covered ' + rows[i][5] + ')');
  }
  if (!owed.length) return;
  var last = Number(PropertiesService.getScriptProperties().getProperty('LAST_DEBT_NAG') || 0);
  if (Date.now() - last < 12 * 3600e3) return;             // at most twice a day
  PropertiesService.getScriptProperties().setProperty('LAST_DEBT_NAG', String(Date.now()));
  try {
    discordPost_('🤝 **Unsettled reimbursements** — these members fronted money and still need their '
      + 'faction balance corrected:\n' + owed.join('\n'), cfg_('BANKER_ROLE_ID'));
  } catch (e) { log_('nag-error', String(e)); }
}

// ─── WEEKLY SUMMARY ──────────────────────────────────────────────────────────

function postWeeklySummary() {
  if (String(cfg_('WEEKLY_SUMMARY')).toLowerCase() !== 'on') return;
  var rows = sheet_(TABS.REQUESTS).getDataRange().getValues();
  var since = Date.now() - 7 * 86400e3;
  var total = 0, paid = 0, moved = 0, fillMs = 0, filled = 0, bankers = {};
  for (var i = 1; i < rows.length; i++) {
    var when = new Date(rows[i][1]).getTime();
    if (when < since) continue;
    total++;
    if (String(rows[i][10]) === 'paid') {
      paid++; moved += Number(rows[i][4]) || 0;
      var by = String(rows[i][11] || '');
      if (by) bankers[by] = (bankers[by] || 0) + 1;
      if (rows[i][14]) { fillMs += new Date(rows[i][14]).getTime() - when; filled++; }
    }
  }
  if (!total) return;
  var top = Object.keys(bankers).sort(function (a, b) { return bankers[b] - bankers[a]; })[0];
  var avg = filled ? Math.round(fillMs / filled / 60000) : null;
  discordPost_('📊 **Banker requests — last 7 days**\n'
    + '• ' + total + ' requests, ' + paid + ' filled (' + Math.round(paid / total * 100) + '%)\n'
    + '• ' + fmtMoney_(moved) + ' moved\n'
    + (top ? '• Top banker: **' + top + '** (' + bankers[top] + ')\n' : '')
    + (avg !== null ? '• Average time to fill: ' + avg + ' min' : ''), '');
}

// ─── WEB ENDPOINT ────────────────────────────────────────────────────────────
//
// Returns {ok:…} and nothing else, ever. This script runs as YOU, so anything it
// returns is handed to whoever holds the URL — never echo config, roster or keys.

function doPost(e) { return route_(e); }
function doGet(e) { return route_(e); }

function route_(e) {
  var out;
  try {
    var p = (e && e.parameter) || {};
    if (e && e.postData && e.postData.contents) {
      try { p = Object.assign(p, JSON.parse(e.postData.contents)); } catch (_) {}
    }
    var lock = LockService.getScriptLock();
    lock.tryLock(10000);
    try { out = dispatch_(p); } finally { lock.releaseLock(); }
  } catch (err) {
    log_('error', String(err));
    out = { ok: false, reason: 'server error' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function dispatch_(p) {
  switch (String(p.action || '')) {
    case 'request': return handleRequest_(p);
    case 'cancel':  return handleCancel_(p);
    // The client reporting a payment it saw in its own player log — the only way
    // a personal send is ever visible, since the faction API can't see one.
    case 'report':  return handleReport_(p);
    case 'open':    return handleOpen_(p);
    case 'claim':   return handleClaim_(p, true);
    case 'release': return handleClaim_(p, false);
    case 'ping':    return { ok: true, forwarding: String(cfg_('FORWARDING')).toLowerCase() === 'on' };
    default:        return { ok: false, reason: 'unknown action' };
  }
}

/**
 * Cancel a request.
 *
 * With `request_id` — the board's Cancel button, targeting one row.
 * Without it — "@banker cancel" typed in chat, which can't know an id, so it
 * takes the person's most recent OPEN request. Either way you can only ever
 * cancel your own: the subject is roster-checked and rows belonging to anyone
 * else are skipped, so a relay can't cancel someone else's request.
 */
function handleCancel_(p) {
  var relay = rosterCheck_(p.user_id);
  if (!relay.allowed) return { ok: false, reason: 'not authorised' };
  var subject = String(p.on_behalf_of || '').replace(/[^0-9]/g, '') || String(p.user_id);
  if (subject !== String(p.user_id)) {
    var s = rosterCheck_(subject);
    if (!s.allowed) return { ok: false, reason: 'subject not authorised' };
  }
  var sh = sheet_(TABS.REQUESTS);
  var rows = sh.getDataRange().getValues();
  for (var i = rows.length - 1; i > 0; i--) {
    if (String(rows[i][10]) !== 'open') continue;
    if (String(rows[i][2]) !== subject) continue;
    if (p.request_id && String(rows[i][0]) !== String(p.request_id)) continue;
    sh.getRange(i + 1, 11).setValue('cancelled');
    var edited = updateRequestMessage_(rows[i], { status: 'cancelled' });
    log_('cancel', rows[i][0] + ' by ' + subject + (edited ? '' : ' (Discord edit FAILED)'));
    return { ok: true, request_id: rows[i][0], amount: Number(rows[i][4]), edited: edited };
  }
  return { ok: false, reason: p.request_id ? 'not found or already closed' : 'no open request to cancel' };
}

function handleReport_(p) {
  var who = rosterCheck_(p.user_id);
  if (!who.allowed) return { ok: false, reason: 'not authorised' };
  // p.direction: 'in'  → I was paid by payer_id
  //              'out' → I paid recipient_id (a helper reporting their own send)
  var recipient = String(p.direction) === 'out' ? String(p.recipient_id) : String(p.user_id);
  var payerId   = String(p.direction) === 'out' ? String(p.user_id) : String(p.payer_id || '');
  var payerName = String(p.direction) === 'out' ? (who.name || '') : String(p.payer_name || '');
  var okSettle = settleRequest_(recipient, Math.round(Number(p.amount) || 0), payerName, payerId,
                                String(p.route || 'personal'), Number(p.ts) || nowS_());
  return { ok: true, matched: okSettle };
}

function handleOpen_(p) {
  var who = rosterCheck_(p.user_id);
  if (!who.allowed) return { ok: false, reason: 'not authorised' };
  var rows = sheet_(TABS.REQUESTS).getDataRange().getValues();
  var out = [];
  for (var i = Math.max(1, rows.length - 60); i < rows.length; i++) {
    if (String(rows[i][10]) !== 'open') continue;
    out.push({ id: rows[i][0], name: rows[i][3], user_id: String(rows[i][2]),
               amount: Number(rows[i][4]), kind: String(rows[i][5]), note: String(rows[i][6]),
               mode: String(rows[i][7]), created: Math.floor(new Date(rows[i][1]).getTime() / 1000),
               claimed_by: String(rows[i][15] || '') });
  }
  var debts = [], drows = sheet_(TABS.DEBTS).getDataRange().getValues();
  for (var j = 1; j < drows.length; j++) {
    if (String(drows[j][6]).toUpperCase() === 'TRUE') continue;
    debts.push({ helper: drows[j][1], helper_id: String(drows[j][2]), amount: Number(drows[j][3]),
                 for_member: String(drows[j][5]) });
  }
  return { ok: true, requests: out, debts: debts };
}

function handleClaim_(p, claiming) {
  var who = rosterCheck_(p.user_id);
  if (!who.allowed) return { ok: false, reason: 'not authorised' };
  var sh = sheet_(TABS.REQUESTS);
  var rows = sh.getDataRange().getValues();
  for (var i = rows.length - 1; i > 0; i--) {
    if (String(rows[i][0]) !== String(p.request_id)) continue;
    if (String(rows[i][10]) !== 'open') return { ok: false, reason: 'already ' + rows[i][10] };
    var current = String(rows[i][15] || '');
    if (claiming && current && current !== (who.name || '')) return { ok: false, reason: 'claimed by ' + current };
    sh.getRange(i + 1, 16).setValue(claiming ? (who.name || '') : '');
    sh.getRange(i + 1, 17).setValue(claiming ? new Date() : '');
    rows[i][15] = claiming ? (who.name || '') : '';   // so the embed shows it
    updateRequestMessage_(rows[i], { status: 'open' });
    return { ok: true };
  }
  return { ok: false, reason: 'not found' };
}
