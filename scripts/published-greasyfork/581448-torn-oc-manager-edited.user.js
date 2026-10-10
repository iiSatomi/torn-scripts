// ==UserScript==
// @name         Torn OC Manager - Edited
// @namespace    torn_oc_manager
// @version      3.5.2
// @description  Faction leader dashboard for Organised Crimes 2.0 — CPR warnings, member availability, slot gaps.
// @author       TheOddSod (2640064)
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlHttpRequest
// @grant        GM.xmlHttpRequest
// @connect      tornprobability.com
// @connect      www.tornstats.com
// @connect      api.torn.com
// @downloadURL https://update.greasyfork.org/scripts/581448/Torn%20OC%20Manager%20-%20Edited.user.js
// @updateURL https://update.greasyfork.org/scripts/581448/Torn%20OC%20Manager%20-%20Edited.meta.js
// ==/UserScript==
//
//
// Changelog (recent):
// v3.5.2 — Fixed 'best open slot' advisory recommending 0% CPR slots. An open
//          slot has no CPR of its own, so it now looks up YOUR predicted CPR for
//          that crime+role from TornStats data (leader mode now resolves your own
//          player ID). If there's no CPR data for you in any open role, the advisory
//          hides instead of showing a meaningless 0%.
// v3.5.1 — Profit tab: added a 'Profit since' date cutoff (defaults to first-run
//          date, so it shows profit since you took over) and an All-time (tracked)
//          view that persistently records every completed OC's profit keyed by OC id,
//          accumulating past the API's ~100-OC cap. Toggle between live API window
//          and tracked all-time; clear the date for full history.
// v3.5.0 — New 💰 Profit tab: aggregates money + item value + respect from
//          completed OCs. KPI tiles (total profit, cash, item value, respect, per-day),
//          a By-Scenario breakdown (cash vs items vs total, avg/run), and an Items
//          Received table (qty, unit market value, total). Item values pulled from
//          /torn/items market price. Estimates — actual sale value varies.
// v3.4.0 — Themes now apply across the whole UI (converted all semantic colours
//          to CSS variables, not just CPR-class elements). Fixed: stale leader
//          'best slot' card showing in forced member mode; member-mode best-slot
//          no longer recommends 0%/unknown-CPR slots; Force Member Mode toggle
//          stays reachable so you can switch back to leader mode.
// v3.3.9 — Ported from upstream v3.5.7: opt-in colour themes (High Contrast +
//          Deuteranopia/Protanopia/Tritanopia colourblind modes with ✓/⚠/✗ shape
//          markers; default theme = current look). Travel-page injection: dashboard
//          now also shows on the faction profile page when abroad (crimes tab gone).
// v3.3.8 — TornStats CPR table now shows live slot CPR (blue dot) overriding
//          the estimate, plus role weights per column. Layout fixes: blocked
//          timer column, analytics table overlap, Last-5 OC header spacing.
// v3.3.7 — Job Planner-style UI refactor; TornStats CPR integration; per-
//          member best-fit slot recommendation with assignment-based dedup;
//          OC history CPR fallback; newsletter button with personalized
//          recommendations; mobile-first card layout for Available members.
// v3.3.5 — OC History pivot in Analytics.
// v3.3.4 — Member mode current-OC card.
// v3.3.3 — 11 CSV exports grouped by section.
// v3.3.2 — Member OC History in Analytics.
// v3.3.1 — Stuck OCs section.
// v3.3.0 — Recruits split, abroad flags, spawn reminder, last 5 OCs, heatmap fix.

(function () {
  'use strict';

  // ─── DUPLICATE GUARD ─────────────────────────────────────────────────────────
  if (window._ocmLoaded) return;
  window._ocmLoaded = true;

  // ─── CONFIG ──────────────────────────────────────────────────────────────────
  const API_BASE      = 'https://api.torn.com/v2';

  // ─── PERSISTENT PROFIT TRACKING ────────────────────────────────────────────
  // The Torn API only returns ~100 recent completed OCs. To build an all-time
  // total that survives past that cap, we record each completed OC's profit
  // (keyed by its unique OC id) into GM storage as we see it. Re-seeing the same
  // OC id never double-counts. This only captures OCs from the moment the user
  // starts running this version forward — it can't recover OCs already aged out.
  const PROFIT_STORE_KEY = 'ocm_profit_ledger';

  /** Load the persistent ledger: { [ocId]: {name, money, itemValue, respect, executedAt, items:{id:qty}} } */
  function loadProfitLedger() {
    try { return JSON.parse(GM_getValue(PROFIT_STORE_KEY, '{}')) || {}; }
    catch (_) { return {}; }
  }
  function saveProfitLedger(ledger) {
    try { GM_setValue(PROFIT_STORE_KEY, JSON.stringify(ledger)); } catch (_) {}
  }

  /**
   * Record completed OCs into the persistent ledger. Keyed by oc.id so repeated
   * refreshes don't double-count. Returns the updated ledger.
   * itemValues is used to snapshot item value at time of recording (so historical
   * profit isn't retroactively changed by market price swings).
   */
  function recordProfit(crimes, itemValues = {}) {
    const ledger = loadProfitLedger();
    let changed = false;
    for (const oc of Object.values(crimes || {})) {
      if (!oc || typeof oc !== 'object') continue;
      const status = (oc.status || '').toLowerCase();
      if (status !== 'successful' && status !== 'success') continue;
      const id = String(oc.id ?? '');
      if (!id || ledger[id]) continue; // already recorded
      const rewards = oc.rewards;
      if (!rewards) continue;
      const money = Number(rewards.money) || 0;
      const resp  = Number(rewards.respect) || 0;
      const rwItems = rewards.items
        ? (Array.isArray(rewards.items) ? rewards.items : Object.values(rewards.items))
        : [];
      let itemValue = 0;
      const items = {};
      for (const it of rwItems) {
        const iid = String(it?.id || it?.item_id || '');
        const qty = Number(it?.quantity || it?.qty || 1);
        if (!iid) continue;
        items[iid] = (items[iid] || 0) + qty;
        itemValue += (Number(itemValues[iid]) || 0) * qty;
      }
      ledger[id] = {
        name: oc.name || `OC #${id}`,
        money, itemValue, respect: resp,
        executedAt: oc.executed_at ?? null,
        items,
      };
      changed = true;
    }
    if (changed) saveProfitLedger(ledger);
    return ledger;
  }

  let CPR_WARN        = Number(GM_getValue('ocm_cfg_cpr_warn',    70));
  let CPR_CRIT        = Number(GM_getValue('ocm_cfg_cpr_crit',    60));
  let WEIGHT_HIGH     = Number(GM_getValue('ocm_cfg_weight_high', 25));
  let WEIGHT_MID      = Number(GM_getValue('ocm_cfg_weight_mid',  15));
  let REFRESH_S       = Number(GM_getValue('ocm_cfg_refresh',     60));
  // Minimum number of recruiting OCs per difficulty before a warning is shown
  let MIN_PER_DIFF    = Number(GM_getValue('ocm_cfg_min_per_diff', 2));

  let tsCprData = {};
  const TS_CACHE_TTL = 86400000; // 24 hours in ms
  // Cooldown after a failed TornStats fetch so we don't hammer the API
  // when it returns errors (rate limit, auth fail, network blip, etc.)
  const TS_FAIL_COOLDOWN = 10 * 60 * 1000; // 10 minutes
  // In-flight guard so concurrent loadData() calls don't double-fire fetches
  let _tsFetchInFlight = false;
  let _tsLastFailAt    = 0;

  // Load cached TS CPR data immediately so it's available on first render
  try {
    const cached = JSON.parse(GM_getValue('ocm_ts_cpr_cache', '{}'));
    if (cached.ts && (Date.now() - cached.ts < TS_CACHE_TTL) && cached.data) {
      tsCprData = cached.data;
    }
  } catch(_) {}

  function saveTsCprCache(data) {
    tsCprData = data;
    GM_setValue('ocm_ts_cpr_cache', JSON.stringify({ ts: Date.now(), data }));
  }

  function isTsCprCacheFresh() {
    try {
      const cached = JSON.parse(GM_getValue('ocm_ts_cpr_cache', '{}'));
      return cached.ts && (Date.now() - cached.ts < TS_CACHE_TTL);
    } catch(_) { return false; }
  }

  // Reference to GM.xmlHttpRequest — the @grant GM.xmlHttpRequest makes this
  // available via the GM object even when GM_xmlHttpRequest is not directly accessible.
  const _gmXhrFn = (typeof GM_xmlHttpRequest === 'function' ? GM_xmlHttpRequest : null)
                || (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function'
                    ? GM.xmlHttpRequest.bind(GM) : null);

  /** Promise wrapper around GM_xmlHttpRequest for cross-origin requests only.
   *  Torn API calls continue using fetch() (same-origin). */
  function gmFetch(url) {
    return new Promise((resolve, reject) => {
      if (!_gmXhrFn) { reject(new Error('GM_xmlHttpRequest not available')); return; }
      _gmXhrFn({
        method: 'GET', url,
        onload(r) {
          if (r.status < 200 || r.status >= 300) { reject(new Error(`HTTP ${r.status}`)); return; }
          try { resolve(JSON.parse(r.responseText)); }
          catch (e) { reject(e); }
        },
        onerror() { reject(new Error('Network error')); },
      });
    });
  }

  /** Persist all config values and update local variables. */
  function saveConfig(warn, crit, wHigh, wMid, refresh, minPerDiff) {
    CPR_WARN     = warn;
    CPR_CRIT     = crit;
    WEIGHT_HIGH  = wHigh;
    WEIGHT_MID   = wMid;
    REFRESH_S    = refresh;
    MIN_PER_DIFF = minPerDiff;
    GM_setValue('ocm_cfg_cpr_warn',      warn);
    GM_setValue('ocm_cfg_cpr_crit',      crit);
    GM_setValue('ocm_cfg_weight_high',   wHigh);
    GM_setValue('ocm_cfg_weight_mid',    wMid);
    GM_setValue('ocm_cfg_refresh',       refresh);
    GM_setValue('ocm_cfg_min_per_diff',  minPerDiff);
  }

  // ─── ROLE WEIGHTS ────────────────────────────────────────────────────────────
  let roleWeights = {};

  const FALLBACK_WEIGHTS = {
    // Tier 1 / Low difficulty
    "no reserve":              { "car thief": 33, "techie": 33, "engineer": 33 },
    "cash me if you can":      { "thief #1": 54, "thief 1": 54, "thief #2": 28, "thief 2": 28, "lookout": 18, "thief": 41 },
    "pet project":             { "kidnapper": 40, "muscle": 35, "picklock": 25 },
    "best of the lot":         { "car thief": 35, "muscle": 30, "picklock": 20, "imitator": 15 },
    // Tier 2 / Mid difficulty
    "smoke and wing mirrors":  { "car thief": 32, "imitator": 28, "hustler": 20, "hustler #1": 20, "hustler #2": 20 },
    "plucking the lotus petal":{ "muscle": 48, "robber #1": 14, "robber #2": 24, "hustler": 14, "robber": 19 },
    "guardian ángels":         { "muscle": 34, "lookout": 33, "engineer": 33, "enforcer": 33, "hustler": 33 },
    "snow blind":              { "hustler": 48, "imitator": 36, "muscle": 8, "muscle #1": 8, "muscle #2": 8 },
    "leave no trace":          { "techie": 34, "negotiator": 33, "imitator": 33 },
    "market forces":           { "enforcer": 28, "negotiator": 24, "lookout": 20, "arsonist": 15, "muscle": 13 },
    "sneaky git grab":         { "hacker": 30, "techie": 28, "picklock": 22, "pickpocket": 22, "lookout": 20, "imitator": 20 },
    "gaslight the way":        { "imitator": 22, "looter": 18, "imitator #1": 22, "imitator #2": 22, "imitator #3": 22, "looter #1": 18, "looter #2": 18, "looter #3": 18 },
    "mob mentality":           { "looter 1": 34, "looter #1": 34, "looter 2": 26, "looter #2": 26, "looter 4": 23, "looter #4": 23, "looter 3": 18, "looter #3": 18, "looter": 25 },
    "counter offer":           { "hacker": 30, "picklock": 22, "engineer": 20, "looter": 15, "robber": 13 },
    "honey trap":              { "muscle #2": 42, "muscle #1": 31, "enforcer": 27, "muscle": 37 },
    "bidding war":             { "robber 3": 28, "robber #3": 28, "robber 2": 21, "robber #2": 21, "driver": 18, "bomber 2": 16, "bomber #2": 16, "bomber 1": 9, "bomber #1": 9, "robber 1": 7, "robber #1": 7, "robber": 19, "bomber": 13 },
    "stage fright":            { "sniper": 46, "enforcer": 16, "muscle #1": 12, "muscle 1": 12, "muscle #3": 9, "muscle 3": 9, "muscle #2": 3, "muscle 2": 3, "lookout": 6, "muscle": 8 },
    // Tier 3 / Higher difficulty
    "blast from the past":     { "muscle": 34, "engineer": 24, "hacker": 12, "bomber": 16, "picklock 1": 11, "picklock 2": 3, "picklock": 11 },
    "stacking the deck":       { "imitator": 48, "hacker": 26, "cat burglar": 23, "driver": 3 },
    "break the bank":          { "muscle 3": 32, "thief 2": 29, "muscle 1": 14, "robber": 13, "muscle 2": 10, "thief 1": 3, "muscle": 18, "thief": 16 },
    "clinical precision":      { "imitator": 43, "cleaner": 22, "cat burglar": 19, "assassin": 16 },
    // Tier 4 / High difficulty
    "crane reaction":          { "sniper": 41, "lookout": 17, "bomber": 16, "muscle 1": 10, "muscle 2": 8, "engineer": 8, "muscle": 9 },
    "manifest cruelty":        { "reviver": 46, "interrogator": 24, "hacker": 16, "cat burglar": 14 },
    // Tier 5 / Omega
    "ace in the hole":         { "hacker": 28, "muscle 2": 25, "imitator": 21, "muscle 1": 18, "driver": 8, "muscle": 22 },
    "gone fission":            { "hijacker": 25, "imitator": 25, "bomber": 18, "pickpocket": 17, "engineer": 15 },
  };

  /** Load fallback weights immediately then overlay with live data from tornprobability.com. */
  function fetchRoleWeights() {
    const normKey = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+v\d+$/i, '');

    // Pre-load fallbacks so weights are always available even if the live fetch fails
    roleWeights = {};
    for (const [ocName, roles] of Object.entries(FALLBACK_WEIGHTS)) {
      roleWeights[normKey(ocName)] = Object.fromEntries(
        Object.entries(roles).map(([r, w]) => [r.toLowerCase().trim(), w])
      );
    }

    const processResponse = text => {
      try {
        const data = JSON.parse(text);
        // Merge live data over fallbacks — never wipe what we already have
        for (const [ocName, roles] of Object.entries(data)) {
          roleWeights[normKey(ocName)] = Object.fromEntries(
            Object.entries(roles || {}).map(([r, w]) => [r.toLowerCase().trim(), w])
          );
        }
      } catch (_) {}
    };

    const url = 'https://tornprobability.com:3000/api/GetRoleWeights';

    if (typeof GM_xmlHttpRequest !== 'undefined') {
      GM_xmlHttpRequest({ method: 'GET', url, onload: r => processResponse(r.responseText), onerror: () => {} });
    } else if (typeof GM !== 'undefined' && GM.xmlHttpRequest) {
      GM.xmlHttpRequest({ method: 'GET', url, onload: r => processResponse(r.responseText), onerror: () => {} });
    }
  }

  /** Look up the weight for a given role in a given OC. Returns null if not found. */
  function getWeight(ocName, roleName) {
    const ocKey   = (ocName   || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+v\d+$/i, '');
    const roleKey = (roleName || '').toLowerCase().trim();
    const oc      = roleWeights[ocKey];
    if (oc && oc[roleKey] != null) return oc[roleKey];
    // Last resort — check FALLBACK_WEIGHTS directly in case live API used different key formatting
    const fb = FALLBACK_WEIGHTS[ocKey];
    if (fb && fb[roleKey] != null) return fb[roleKey];
    return null;
  }

  // ─── COUNTRY → FLAG EMOJI MAP ─────────────────────────────────────────────
  // Used by statusIcon() to convert Torn travel destination strings to emoji flags.
  // Torn description strings look like "Traveling to Japan" or "Returning from Mexico".
  // We scan the description for any of these country names (case-insensitive).
  const COUNTRY_FLAGS = {
    'argentina': '🇦🇷', 'canada': '🇨🇦', 'cayman': '🇰🇾', 'china': '🇨🇳',
    'hawaii': '🇺🇸',    'japan': '🇯🇵',   'mexico': '🇲🇽',  'south africa': '🇿🇦',
    'switzerland': '🇨🇭','uae': '🇦🇪',    'united arab': '🇦🇪', 'uk': '🇬🇧',
    'united kingdom': '🇬🇧', 'usa': '🇺🇸', 'united states': '🇺🇸',
  };

  /**
   * Returns the emoji flag for a country found in a Torn travel description,
   * or 🌍 if no known country is matched.
   */
  function flagFromDescription(description) {
    const lower = (description || '').toLowerCase();
    for (const [country, flag] of Object.entries(COUNTRY_FLAGS)) {
      if (lower.includes(country)) return flag;
    }
    return '🌍';
  }

  /** Title-case a country name pulled out of a description. */
  function prettyCountry(description) {
    const lower = (description || '').toLowerCase();
    for (const country of Object.keys(COUNTRY_FLAGS)) {
      if (lower.includes(country)) {
        return country.replace(/\b\w/g, c => c.toUpperCase());
      }
    }
    return null;
  }

  /**
   * Parse a Torn travel/abroad description into { dir, country, flag, label }.
   *   dir: 'out' (flying to a country) | 'back' (returning to Torn) | 'abroad' (landed)
   * Torn strings: "Traveling to Japan", "Returning to Torn from Japan",
   *               "In Japan", "Flying to Mexico", etc.
   */
  function travelInfo(status, description) {
    const s     = (status || '').toLowerCase();
    const lower = (description || '').toLowerCase();
    const flag  = flagFromDescription(description);
    const country = prettyCountry(description);
    if (s === 'abroad') {
      return { dir: 'abroad', country, flag, label: country ? `${flag} In ${country}` : `${flag} Abroad` };
    }
    // traveling — compact labels: arrow direction tells the story; country name kept short
    const returning = lower.includes('returning') || lower.includes('back to torn') || lower.includes('to torn');
    if (returning) {
      return { dir: 'back', country, flag, label: country ? `${flag}→🏠 From ${country}` : '✈→🏠 Returning' };
    }
    return { dir: 'out', country, flag, label: country ? `🏠→${flag} To ${country}` : '🏠→✈ Traveling' };
  }

  // ─── THEME SYSTEM (opt-in) ─────────────────────────────────────────────────
  // The dashboard's CSS uses hardcoded colours for layout-critical rules; only the
  // *semantic* colours (CPR good/warn/crit, links, key text/bg) are themeable via
  // CSS variables. The "default" theme reproduces the exact current look, so the
  // dashboard is visually identical unless the user opts into another theme.
  //
  // Accessibility themes remap the CPR good/warn/crit trio (and links) to palettes
  // that stay distinguishable under the common colourblindness types, and add
  // ✓/⚠/✗ shape prefixes so meaning is never carried by colour alone.
  const THEMES = {
    default: {
      label: 'Default (current look)',
      '--ocm-cpr-good':  '#7abf7a',
      '--ocm-cpr-warn':  '#bf9f5a',
      '--ocm-cpr-crit':  '#bf7a7a',
      '--ocm-link':      '#7a9acc',
      '--ocm-text':      '#e0e0e0',
      '--ocm-text-card': '#ccc',
      '--ocm-shape-good': '""',
      '--ocm-shape-warn': '""',
      '--ocm-shape-crit': '""',
    },
    highcontrast: {
      label: 'High Contrast',
      '--ocm-cpr-good':  '#00ff88',
      '--ocm-cpr-warn':  '#ffdd00',
      '--ocm-cpr-crit':  '#ff5555',
      '--ocm-link':      '#66bbff',
      '--ocm-text':      '#ffffff',
      '--ocm-text-card': '#f0f0f0',
      '--ocm-shape-good': '""',
      '--ocm-shape-warn': '""',
      '--ocm-shape-crit': '""',
    },
    // Red/green colourblindness (most common) — green→blue, red→orange, plus shapes
    deuteranopia: {
      label: 'Deuteranopia (Red/Green CB)',
      '--ocm-cpr-good':  '#4499ff',
      '--ocm-cpr-warn':  '#ffcc00',
      '--ocm-cpr-crit':  '#ff6600',
      '--ocm-link':      '#88ccff',
      '--ocm-text':      '#e0e0e0',
      '--ocm-text-card': '#ccc',
      '--ocm-shape-good': '"\\2713  "',
      '--ocm-shape-warn': '"\\26a0  "',
      '--ocm-shape-crit': '"\\2717  "',
    },
    // Red deficiency — red appears very dark; use cyan/amber/white + shapes
    protanopia: {
      label: 'Protanopia (Red Deficiency)',
      '--ocm-cpr-good':  '#00ddcc',
      '--ocm-cpr-warn':  '#ffcc00',
      '--ocm-cpr-crit':  '#ffffff',
      '--ocm-link':      '#88ccff',
      '--ocm-text':      '#e0e0e0',
      '--ocm-text-card': '#ccc',
      '--ocm-shape-good': '"\\2713  "',
      '--ocm-shape-warn': '"\\26a0  "',
      '--ocm-shape-crit': '"\\2717  "',
    },
    // Blue/yellow colourblindness — use teal/pink/red + shapes
    tritanopia: {
      label: 'Tritanopia (Blue/Yellow CB)',
      '--ocm-cpr-good':  '#00ddaa',
      '--ocm-cpr-warn':  '#ff88cc',
      '--ocm-cpr-crit':  '#ff2255',
      '--ocm-link':      '#ff99dd',
      '--ocm-text':      '#e0e0e0',
      '--ocm-text-card': '#ccc',
      '--ocm-shape-good': '"\\2713  "',
      '--ocm-shape-warn': '"\\26a0  "',
      '--ocm-shape-crit': '"\\2717  "',
    },
  };

  /** Apply a theme by setting its CSS variables on #ocm-root. */
  function applyTheme(themeKey) {
    const theme = THEMES[themeKey] || THEMES.default;
    const root  = document.getElementById('ocm-root');
    if (!root) return;
    for (const [prop, value] of Object.entries(theme)) {
      if (prop.startsWith('--')) root.style.setProperty(prop, value);
    }
    GM_setValue('ocm_theme', themeKey);
  }

  // ─── STYLES ──────────────────────────────────────────────────────────────────
  GM_addStyle(`
    /* ═══ OC Manager v3.3.7 — Job Planner-style UI ═══
       Palette: bg #181818  card #1e1e1e  hover #1f1f1f  border #333/#2e2e2e
                text #e0e0e0/#ccc/#889/#556
                accents: g #7abf7a  a #bf9f5a  r #bf7a7a  b #7a9acc        */

    /* ── ROOT ─────────────────────────────────────────────────────────── */
    #ocm-root {
      /* Themeable semantic colours — default values reproduce the current look.
         Overridden by applyTheme() when a non-default theme is selected. */
      --ocm-cpr-good:  #7abf7a;
      --ocm-cpr-warn:  #bf9f5a;
      --ocm-cpr-crit:  #bf7a7a;
      --ocm-link:      #7a9acc;
      --ocm-text:      #e0e0e0;
      --ocm-text-card: #ccc;
      --ocm-shape-good: "";
      --ocm-shape-warn: "";
      --ocm-shape-crit: "";
      margin: 8px 0 12px;
      background: #181818;
      border: 1px solid #333;
      border-radius: 6px;
      font-family: Arial, sans-serif;
      font-size: 13px;
      color: #ccc;
      overflow: hidden;
    }

    /* ── HEADER (top bar with title + refresh) ────────────────────────── */
    #ocm-header, .ocm-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: linear-gradient(135deg, #242424, #1c1c1c);
      border-bottom: 1px solid #2a2a2a;
      gap: 10px;
    }
    #ocm-header h2, .ocm-header h2 {
      font-size: 15px;
      font-weight: bold;
      color: #e0e0e0;
      margin: 0;
      letter-spacing: 0;
    }
    #ocm-header h2, .ocm-header h2 span {
      font-size: 10px;
      color: #555;
      font-weight: normal;
      margin-left: 4px;
    }
    #ocm-last-update, .ocm-time {
      font-size: 11px;
      color: #667;
    }

    /* ── SUB-STATUS BAR (key saved · CPR thresholds · refresh interval) */
    #ocm-config-strip, .ocm-config-strip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      background: #1c1c1c;
      border-bottom: 1px solid #252525;
      font-size: 11px;
      color: #aab;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* ── BUTTONS ──────────────────────────────────────────────────────── */
    .ocm-cfg-btn, #ocm-refresh-btn, .ocm-config-toggle {
      padding: 7px 12px;
      border-radius: 4px;
      border: 1px solid #383838;
      background: #222;
      color: #ddd;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
      transition: background .15s, border-color .15s;
    }
    .ocm-cfg-btn:hover, #ocm-refresh-btn:hover, .ocm-config-toggle:hover {
      background: #2a2a2a;
      border-color: #4a4a4a;
    }
    /* Primary save buttons get green tint */
    #ocm-save-key-btn, #ocm-cfg-save-btn, #ocm-ts-save-btn {
      background: #1a2518;
      border-color: #3a5030;
      color: #7abf7a;
    }
    #ocm-save-key-btn:hover, #ocm-cfg-save-btn:hover, #ocm-ts-save-btn:hover {
      background: #20301e;
      border-color: #4a6040;
    }
    /* Refresh gets blue tint */
    #ocm-refresh-btn {
      background: #182028;
      border-color: #304060;
      color: #6aaade;
    }
    #ocm-refresh-btn:hover {
      background: #1e2a38;
      border-color: #405078;
    }

    /* ── INPUTS ───────────────────────────────────────────────────────── */
    #ocm-root input[type="text"],
    #ocm-root input[type="password"],
    #ocm-root input[type="number"],
    #ocm-root select {
      padding: 7px 10px;
      background: #222;
      border: 1px solid #383838;
      border-radius: 4px;
      color: #e0e0e0;
      font-size: 13px;
      box-sizing: border-box;
    }
    #ocm-root input:focus, #ocm-root select:focus {
      outline: none;
      border-color: #555;
      background: #282828;
    }
    .ocm-cfg-num {
      width: 60px;
      text-align: center;
    }

    /* ── CONFIG PANEL ─────────────────────────────────────────────────── */
    #ocm-config-panel, .ocm-config-panel {
      background: #1a1a1a;
      border-bottom: 1px solid #252525;
    }
    .ocm-cfg-section {
      padding: 12px 14px;
      border-bottom: 1px solid #252525;
    }
    .ocm-cfg-section:last-child { border-bottom: none; }
    .ocm-cfg-label {
      display: block;
      color: #889;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: bold;
      margin-bottom: 8px;
    }
    .ocm-cfg-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 12px;
      color: #ccd;
    }
    .ocm-cfg-status {
      font-size: 11px;
      color: #99a;
      margin-top: 6px;
    }

    /* ── STATS BAR ────────────────────────────────────────────────────── */
    #ocm-stats-bar, .ocm-stats-bar {
      padding: 8px 10px;
      background: #181818;
      border-bottom: 1px solid #252525;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .ocm-stats-row {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 4px;
    }
    .ocm-stats-row-recruiting {
      background: #1e1e1e;
      border: 1px solid #2e2e2e;
      border-radius: 4px;
      padding: 6px 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .ocm-stats-row-recruiting .ocm-stat-label {
      margin-bottom: 0;
      flex-shrink: 0;
    }
    .ocm-recruiting-chip {
      background: #1f1f1f;
      border: 1px solid #2e2e2e;
      border-radius: 3px;
      padding: 2px 6px;
      font-size: 10px;
      color: #c8b060;
      font-weight: bold;
      white-space: nowrap;
    }
    .ocm-recruiting-chip.danger {
      color: var(--ocm-cpr-crit);
      border-color: #4a2a2a;
    }
    .ocm-stat {
      background: #1e1e1e;
      border: 1px solid #2e2e2e;
      border-radius: 4px;
      padding: 6px 8px;
      min-width: 0;
      overflow: hidden;
    }
    .ocm-stat-label {
      display: block;
      color: #667;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-weight: bold;
      margin-bottom: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ocm-stat-value {
      display: block;
      color: #dde;
      font-size: 18px;
      font-weight: bold;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ocm-s-active   .ocm-stat-value { color: var(--ocm-link); }
    .ocm-s-open     .ocm-stat-value { color: #dde; }
    .ocm-s-lowcpr   .ocm-stat-value { color: var(--ocm-cpr-warn); }
    .ocm-s-blocked  .ocm-stat-value { color: var(--ocm-cpr-crit); }
    .ocm-s-free     .ocm-stat-value { color: var(--ocm-cpr-good); }
    .ocm-s-stuck    .ocm-stat-value { color: var(--ocm-cpr-crit); }
    @media (max-width: 500px) {
      .ocm-stats-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .ocm-stat-value { font-size: 16px; }
    }

    /* ── BANNERS / NOTICES ────────────────────────────────────────────── */
    #ocm-stuck-banner, #ocm-next-banner, .ocm-banner-issue, .ocm-stuck-banner {
      margin: 8px 12px;
      padding: 10px 12px;
      background: #201810;
      border: 1px solid #4a3018;
      border-radius: 4px;
      color: #c8a060;
      font-size: 12px;
      line-height: 1.5;
    }
    .ocm-banner-title {
      color: #d8a060;
      font-weight: bold;
      margin-bottom: 4px;
    }
    .ocm-banner-issues { font-size: 11px; color: #b89060; }

    /* Next OC banner */
    #ocm-next-banner, .ocm-next-banner {
      margin: 8px 12px;
      padding: 10px 12px;
      background: #14181e;
      border: 1px solid #2a3040;
      border-radius: 4px;
      color: #aac;
      font-size: 12px;
      line-height: 1.6;
    }
    #ocm-next-banner.banner-ok {
      background: #14201a;
      border-color: #2a4a32;
      color: #aac8a0;
    }
    #ocm-next-banner.banner-warn, .ocm-next-banner.warn {
      background: #1c1810;
      border-color: #4a3a18;
      color: #c8a060;
    }
    #ocm-next-banner.banner-crit {
      background: #201410;
      border-color: #4a2820;
      color: #c88a70;
    }
    #ocm-next-banner .ocm-banner-title {
      color: inherit;
      font-size: 13px;
      font-weight: bold;
      margin-bottom: 4px;
    }
    #ocm-next-banner .ocm-banner-title strong { color: #e0e0e0; }
    #ocm-next-banner .ocm-banner-issues {
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    #ocm-next-banner .ocm-banner-issue {
      font-size: 11px;
      color: inherit;
      opacity: 0.85;
      display: block;
    }

    /* Best slot card */
    .ocm-stat-pill, #ocm-best-slot, .ocm-best-slot {
      margin: 8px 12px;
      padding: 10px 12px;
      background: #14181e;
      border: 1px solid #2a3040;
      border-radius: 4px;
      color: #aac;
      font-size: 12px;
      line-height: 1.6;
    }

    /* ── SECTION TITLES (collapsible headers) ─────────────────────────── */
    /* Group tabs — switch between Action / Status / Optimize / Active OCs / Reference */
    .ocm-tabs {
      display: flex;
      gap: 4px;
      padding: 8px 10px 0;
      background: #181818;
      border-bottom: 1px solid #2a2a2a;
      flex-wrap: wrap;
    }
    .ocm-tab {
      background: transparent;
      border: 1px solid #2a2a2a;
      border-bottom: none;
      border-radius: 4px 4px 0 0;
      color: #778;
      font-size: 11px;
      font-weight: bold;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 7px 12px;
      cursor: pointer;
      user-select: none;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: background .15s, color .15s, border-color .15s;
      position: relative;
      top: 1px;
    }
    .ocm-tab:hover {
      background: #1f1f1f;
      color: #aab;
    }
    .ocm-tab.active {
      background: #1e1e1e;
      color: #dde;
      border-color: #3a3a3a;
      border-bottom: 1px solid #1e1e1e;
    }
    .ocm-tab-count {
      background: #2a2a2a;
      color: #889;
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 8px;
      min-width: 14px;
      text-align: center;
    }
    .ocm-tab.active .ocm-tab-count {
      background: #3a3a3a;
      color: #ccd;
    }
    .ocm-tab-count.has-attn {
      background: #4a3a20;
      color: #d8b070;
    }
    .ocm-tab.active .ocm-tab-count.has-attn {
      background: #5a4a30;
      color: #e8c890;
    }
    .ocm-tab-pane { display: none; min-width: 0; }
    .ocm-tab-pane.active { display: block; min-width: 0; overflow: hidden; }

    .ocm-section-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 7px 14px;
      background: linear-gradient(135deg, #1e1e1e, #181818);
      border-bottom: 1px solid #252525;
      font-size: 11px;
      font-weight: bold;
      color: #889;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
      user-select: none;
      transition: background .15s, color .15s;
    }
    .ocm-section-title:hover {
      background: linear-gradient(135deg, #232323, #1c1c1c);
      color: #aab;
    }
    .ocm-section-title::after {
      content: '▼';
      font-size: 9px;
      color: #445;
      transition: transform .2s;
      margin-left: 8px;
    }
    .ocm-section-title.collapsed::after {
      transform: rotate(-90deg);
    }

    /* Section content panels */
    #ocm-available, #ocm-recruits, #ocm-blocked, #ocm-lowcpr, #ocm-overqualified, #ocm-tscpr,
    #ocm-analytics, #ocm-downloads {
      background: #181818;
      padding-top: 6px;
      padding-bottom: 6px;
      min-width: 0;
      overflow: hidden;
    }
    /* Section content gets uniform horizontal padding by default; specific
       layouts (mcard-list, row-grids, table wrappers) handle their own. */
    #ocm-available > *:not(.ocm-mcard-list),
    #ocm-recruits > *:not(.ocm-blocked-row):not(.ocm-lowcpr-row),
    #ocm-blocked > *:not(.ocm-blocked-row):not(.ocm-lowcpr-row),
    #ocm-lowcpr > *:not(.ocm-blocked-row):not(.ocm-lowcpr-row),
    #ocm-overqualified > *:not(.ocm-lowcpr-row),
    #ocm-tscpr > *:not(.ocm-tscpr-oc-block),
    #ocm-analytics > *,
    #ocm-downloads > * {
      padding-left: 12px;
      padding-right: 12px;
    }

    /* ── PHASE HEADERS (Planning / Recruiting bar) ────────────────────── */
    .ocm-phase-header, #ocm-planning-header, #ocm-recruiting-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin: 10px 12px;
      padding: 10px 14px;
      background: #14181e;
      border: 1px solid #2a3040;
      border-radius: 5px;
      flex-wrap: wrap;
    }
    .ocm-phase-recruiting, #ocm-recruiting-header {
      background: #1e180e;
      border-color: #4a3a18;
    }
    .ocm-phase-recruiting .ocm-phase-count, #ocm-recruiting-header .ocm-phase-count {
      color: #c8a060;
    }
    .ocm-phase-planning .ocm-phase-count, #ocm-planning-header .ocm-phase-count {
      color: var(--ocm-link);
    }
    .ocm-phase-count {
      font-size: 14px;
      font-weight: bold;
    }
    .ocm-phase-collapse {
      color: #445;
      font-size: 11px;
      cursor: pointer;
      user-select: none;
    }
    .ocm-diff-chip, .ocm-diff-chip-plan {
      background: #1a2030;
      border: 1px solid #2a4060;
      color: var(--ocm-link);
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: bold;
    }
    .ocm-diff-chip-plan { background: #14181e; }
    .ocm-diff-sep { color: #445; }

    /* ── OC GRID ──────────────────────────────────────────────────────── */
    .ocm-oc-grid, #ocm-grid-planning, #ocm-grid-recruiting {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 6px;
      padding: 0 12px 10px;
    }

    /* ── OC CARDS ─────────────────────────────────────────────────────── */
    .ocm-stuck-card, .ocm-card {
      background: #1e1e1e;
      border: 1px solid #2e2e2e;
      border-radius: 5px;
      overflow: hidden;
      transition: border-color .15s;
    }
    .ocm-stuck-card:hover, .ocm-card:hover {
      border-color: #3a3a3a;
    }
    .ocm-stuck-card-title, .ocm-card-title, .ocm-stuck-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px 2px;
      gap: 8px;
    }
    .ocm-stuck-card-title strong, .ocm-card-title strong {
      color: #e0e0e0;
      font-size: 13px;
      font-weight: bold;
    }
    .ocm-card-subtitle {
      padding: 0 10px 4px;
      color: #889;
      font-size: 11px;
    }
    .ocm-stuck-diff {
      background: #1a2030;
      border: 1px solid #2a4060;
      color: var(--ocm-link);
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: bold;
      letter-spacing: 0.05em;
    }
    .ocm-stuck-expiry { color: #778; font-size: 11px; padding: 0 12px 6px; }

    /* ── SLOTS ────────────────────────────────────────────────────────── */
    .ocm-slots {
      display: flex;
      flex-direction: column;
    }
    .ocm-slot {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      background: #181818;
      border-top: 1px solid #232323;
      font-size: 12px;
      flex-wrap: nowrap;
    }
    .ocm-slot:hover { background: #1f1f1f; }
    .ocm-slot-status { font-size: 11px; flex-shrink: 0; }
    .ocm-slot-role { color: #889; font-size: 12px; flex-shrink: 0; min-width: 60px; }
    .ocm-slot-member {
      color: #dde;
      font-size: 12px;
      flex: 1 1 auto;
      min-width: 50px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ocm-slot-cpr {
      font-weight: bold;
      font-size: 12px;
      text-align: right;
      flex-shrink: 0;
      min-width: 36px;
      margin-left: auto;
    }
    .ocm-slot-cpr.cpr-good { color: var(--ocm-cpr-good); }
    .ocm-slot-cpr.cpr-warn { color: var(--ocm-cpr-warn); }
    .ocm-slot-cpr.cpr-crit { color: var(--ocm-cpr-crit); }
    .ocm-slot-cpr.cpr-empty { color: #445; }
    .ocm-slot-weight { color: #556; font-size: 10px; flex-shrink: 0; }

    /* Smaller progress bar for mobile-friendly slot rows */
    .ocm-progress-wrap {
      width: 50px;
      height: 5px;
      background: #232323;
      border-radius: 3px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .ocm-progress-fill {
      height: 100%;
      background: #4a5a78;
      border-radius: 3px;
      transition: width .3s;
    }
    .ocm-progress-fill.cpr-good { background: #4a8a4a; }
    .ocm-progress-fill.cpr-warn { background: #8a7a3a; }
    .ocm-progress-fill.cpr-crit { background: #8a4a4a; }

    /* ── TS BADGE (TornStats CPR pill next to member name) ───────────── */
    .ocm-ts-badge {
      display: inline-block;
      background: #1a2028;
      border: 1px solid #2a3a4a;
      font-size: 9px;
      font-weight: bold;
      padding: 1px 5px;
      border-radius: 3px;
      letter-spacing: 0.02em;
      white-space: nowrap;
      flex-shrink: 0;
    }

    /* Item status badge — color-coded by availability so it's instantly readable */
    .ocm-item-tag {
      font-size: 10px;
      padding: 2px 5px;
      border-radius: 3px;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
      line-height: 1.2;
      transition: filter .15s;
    }
    .ocm-item-tag:hover { filter: brightness(1.3); }
    .ocm-item-tag.item-ok {
      background: #14201a;
      border: 1px solid #2a4a32;
      color: var(--ocm-cpr-good);
    }
    .ocm-item-tag.item-armory {
      background: #14181e;
      border: 1px solid #2a3a4a;
      color: var(--ocm-link);
    }
    .ocm-item-tag.item-missing {
      background: #201410;
      border: 1px solid #4a2820;
      color: var(--ocm-cpr-crit);
    }
    .ocm-item-tag.item-unknown {
      background: #1c1810;
      border: 1px solid #3a3018;
      color: var(--ocm-cpr-warn);
    }

    /* ── MEMBER TABLES (Available, Recruits, Blocked, Low CPR) ───────── */

    /* Recruits notice — info banner above the recruits table */
    .ocm-recruits-notice {
      background: #1c1810;
      border: 1px solid #3a3018;
      border-radius: 4px;
      color: #c8a060;
      font-size: 11px;
      line-height: 1.5;
      padding: 8px 10px !important;
      margin: 8px 0;
    }
    .ocm-recruits-notice strong { color: #d8a060; }

    /* Card layout for Available members — mobile-first, prominent recommendation */
    .ocm-mcard-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px 12px;
    }
    .ocm-mcard {
      background: #1e1e1e;
      border: 1px solid #2e2e2e;
      border-radius: 5px;
      padding: 8px 10px;
      transition: border-color .15s;
    }
    .ocm-mcard:hover { border-color: #3a3a3a; }
    .ocm-mcard-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    .ocm-mcard-name {
      color: #e0e0e0;
      font-weight: bold;
      font-size: 13px;
      text-decoration: none;
    }
    .ocm-mcard-name:hover { color: #fff; }
    .ocm-mcard-seen {
      font-size: 11px;
      color: #667;
      flex-shrink: 0;
    }
    .ocm-mcard-rec {
      background: #14181e;
      border: 1px solid #2a3040;
      border-radius: 4px;
      padding: 6px 8px;
      margin-bottom: 4px;
    }
    .ocm-mcard-meta {
      font-size: 11px;
      color: #667;
    }
    .ocm-members-table, .ocm-blocked-row, .ocm-mh-table, .ocm-analytics-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .ocm-members-table th, .ocm-mh-table th, .ocm-analytics-table th {
      background: #181818;
      color: #556;
      font-size: 10px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      font-weight: bold;
      border-bottom: 1px solid #2a2a2a;
      padding: 6px 12px;
      text-align: left;
    }
    .ocm-members-table td, .ocm-mh-table td, .ocm-analytics-table td {
      padding: 5px 12px;
      border-bottom: 1px solid #232323;
      color: #dde;
    }
    .ocm-members-table tr:hover td,
    .ocm-mh-table tr:hover td,
    .ocm-analytics-table tr:hover td {
      background: #1f1f1f;
    }

    .ocm-blocked-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 1.2fr) 88px;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-bottom: 1px solid #232323;
      font-size: 12px;
      min-width: 0;
      box-sizing: border-box;
      width: 100%;
    }
    .ocm-blocked-row:hover { background: #1f1f1f; }
    .ocm-blocked-name {
      color: #dde;
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .ocm-blocked-name:hover { color: #fff; }
    .ocm-blocked-status {
      font-size: 10px;
      color: #aac;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ocm-blocked-oc {
      color: #778;
      font-size: 10px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ocm-blocked-timer {
      color: #aac;
      font-size: 10px;
      text-align: right;
      white-space: nowrap;
    }
    .ocm-blocked-timer.notimer { color: #555; }

    /* Low CPR rows — different columns from blocked: member, OC, role, extras, CPR */
    .ocm-lowcpr-row {
      display: grid;
      grid-template-columns: minmax(80px, 1fr) minmax(0, 1.5fr) minmax(60px, 0.8fr) auto auto;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-bottom: 1px solid #232323;
      font-size: 12px;
    }
    .ocm-lowcpr-row:hover { background: #1f1f1f; }
    .ocm-lowcpr-name {
      color: #dde;
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ocm-lowcpr-oc {
      color: #889;
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ocm-lowcpr-role {
      color: #889;
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ocm-lowcpr-extras {
      display: flex;
      gap: 4px;
      align-items: center;
    }
    .ocm-lowcpr-cpr {
      text-align: right;
      min-width: 36px;
    }
    .ocm-blocked-reason { color: var(--ocm-cpr-crit); font-size: 11px; }

    /* ── TORNSTATS CPR SECTION ───────────────────────────────────────── */
    .ocm-tscpr-oc-block {
      margin: 8px 12px;
      background: #1e1e1e;
      border: 1px solid #2e2e2e;
      border-radius: 4px;
      overflow: hidden;
    }
    .ocm-tscpr-oc-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #1e1e1e;
      color: #dde;
      font-size: 13px;
      font-weight: bold;
      cursor: pointer;
      user-select: none;
      transition: background .15s;
    }
    .ocm-tscpr-oc-header:hover { background: #232323; }
    .ocm-tscpr-arrow {
      font-size: 9px;
      color: #445;
      transition: transform .2s;
    }
    .ocm-tscpr-oc-header.collapsed .ocm-tscpr-arrow {
      transform: rotate(-90deg);
    }
    .ocm-tscpr-oc-body {
      border-top: 1px solid #2a2a2a;
      overflow-x: auto;
    }
    .ocm-tscpr-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      table-layout: auto;
    }
    .ocm-tscpr-table th {
      background: #181818;
      color: #556;
      font-size: 9px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-weight: bold;
      border-bottom: 1px solid #2a2a2a;
      padding: 5px 6px;
      text-align: right;
      white-space: nowrap;
    }
    .ocm-tscpr-table th:first-child { text-align: left; }
    .ocm-tscpr-table td {
      padding: 3px 6px;
      border-bottom: 1px solid #232323;
      color: #dde;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .ocm-tscpr-table td:first-child {
      text-align: left;
      color: #ccc;
      white-space: nowrap;
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ocm-tscpr-table tr:hover td { background: #1f1f1f; }

    /* Difficulty badge inside TS CPR header */
    .ocm-tscpr-oc-header span[style*="7a9acc"] {
      background: #1a2030 !important;
      border: 1px solid #2a4060;
      color: var(--ocm-link) !important;
      padding: 1px 6px;
      border-radius: 3px;
      font-weight: bold !important;
      letter-spacing: 0.04em;
    }

    /* ── ANALYTICS ────────────────────────────────────────────────────── */
    .ocm-analytics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 8px;
      padding: 0 12px 12px;
    }
    .ocm-analytics-card {
      background: #1e1e1e;
      border: 1px solid #2e2e2e;
      border-radius: 4px;
      padding: 10px 12px;
      min-width: 0;
      overflow: hidden;
    }
    .ocm-analytics-card .ocm-analytics-table {
      table-layout: fixed;
      width: 100%;
    }
    .ocm-analytics-card .ocm-analytics-table td,
    .ocm-analytics-card .ocm-analytics-table th {
      padding: 5px 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* First column (name) takes all remaining space and ellipsizes */
    .ocm-analytics-card .ocm-analytics-table th:first-child,
    .ocm-analytics-card .ocm-analytics-table td:first-child {
      width: auto;
      padding-left: 10px;
    }
    .ocm-analytics-card .ocm-analytics-table th.td-right,
    .ocm-analytics-card .ocm-analytics-table td.td-right {
      width: 44px;
    }
    .ocm-analytics-card .ocm-analytics-table th.ocm-sfe-col,
    .ocm-analytics-card .ocm-analytics-table td.ocm-sfe-col {
      width: 70px;
    }
    .ocm-chart-wrap {
      background: #1e1e1e;
      border: 1px solid #2e2e2e;
      border-radius: 4px;
      padding: 8px;
      margin: 8px 12px;
    }

    /* ── HEATMAP / TIMER / SPINNER ────────────────────────────────────── */
    .ocm-heatmap td {
      padding: 4px 6px;
      font-size: 11px;
      color: #dde;
      border: 1px solid #232323;
    }
    .ocm-timer { font-family: monospace; color: #aac; }
    .ocm-spinner { color: #556; font-size: 12px; padding: 14px; text-align: center; }
    .ocm-error {
      background: #201818;
      border: 1px solid #4a2828;
      color: var(--ocm-cpr-crit);
      padding: 10px 14px;
      margin: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
    }
    .ocm-empty-phase { color: #556; padding: 12px 14px; font-size: 12px; }

    /* ── DOWNLOADS ────────────────────────────────────────────────────── */
    .ocm-downloads-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 6px;
      padding: 8px 12px;
    }
    .ocm-dl-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #1a2518;
      border: 1px solid #3a5030;
      border-radius: 4px;
      color: var(--ocm-cpr-good);
      font-size: 12px;
      cursor: pointer;
      transition: background .15s;
    }
    .ocm-dl-btn:hover { background: #20301e; border-color: #4a6040; }
    .ocm-dl-btn strong { color: var(--ocm-cpr-good); }
    .ocm-dl-btn span { color: #556; font-size: 10px; }

    /* ── FOOTER ───────────────────────────────────────────────────────── */
    #ocm-footer, .ocm-footer {
      padding: 8px 14px;
      background: #181818;
      border-top: 1px solid #252525;
      color: #445;
      font-size: 11px;
      text-align: center;
    }

    /* ── CPR TEXT COLOR CLASSES ───────────────────────────────────────── */
    .cpr-good { color: var(--ocm-cpr-good); }
    .cpr-warn { color: var(--ocm-cpr-warn); }
    .cpr-crit { color: var(--ocm-cpr-crit); }
    /* Shape prefixes — empty by default, set to ✓/⚠/✗ by accessibility themes */
    .cpr-good::before { content: var(--ocm-shape-good); }
    .cpr-warn::before { content: var(--ocm-shape-warn); }
    .cpr-crit::before { content: var(--ocm-shape-crit); }
    .cpr-empty { color: #445; }

    /* ── MEMBER HISTORY / OC HISTORY (Analytics drilldowns) ───────────── */
    .ocm-mh-search-wrap, .ocm-oh-search-wrap {
      position: relative;
      margin: 8px 0;
    }
    .ocm-mh-search, .ocm-oh-search {
      width: 100%;
      box-sizing: border-box;
    }
    .ocm-mh-clear, .ocm-oh-clear {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: #2a2a2a;
      border: none;
      color: #889;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 3px;
      cursor: pointer;
    }
    .ocm-mh-dropdown, .ocm-oh-dropdown {
      background: #1e1e1e;
      border: 1px solid #2e2e2e;
      border-radius: 4px;
      max-height: 200px;
      overflow-y: auto;
    }
    .ocm-mh-option {
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
      color: #dde;
      border-bottom: 1px solid #232323;
    }
    .ocm-mh-option:hover { background: #232323; }
    .ocm-mh-empty, .ocm-oh-empty { color: #556; padding: 10px 14px; font-size: 12px; }
    .ocm-mh-summary, .ocm-oh-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 6px;
      margin: 8px 0;
    }
    .ocm-mh-sum-item {
      background: #1e1e1e;
      border: 1px solid #2e2e2e;
      border-radius: 4px;
      padding: 6px 10px;
    }
    .ocm-mh-sum-label { color: #556; font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; }
    .ocm-mh-sum-value { color: #dde; font-size: 14px; font-weight: bold; }
    .ocm-mh-table-wrap, .ocm-oh-table-wrap { overflow-x: auto; margin-top: 8px; }

    .ocm-last5-wrap { margin: 4px 0; }
    .ocm-last5-row-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 10px;
      background: #1a1a1a;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      color: #aac;
    }
    .ocm-last5-row-header:hover { background: #1f1f1f; }
    .ocm-last5-detail, .ocm-oh-run-detail {
      padding: 8px 10px;
      background: #181818;
      border: 1px solid #2a2a2a;
      border-radius: 3px;
      margin-top: 4px;
      font-size: 11px;
      color: #aab;
    }

    /* ── KEY/STATUS LABELS ────────────────────────────────────────────── */
    .ocm-key-status {
      font-size: 11px;
      color: var(--ocm-cpr-good);
    }
    .ocm-key-status.bad { color: var(--ocm-cpr-crit); }
    .ocm-last-update { font-size: 11px; color: #667; }

    /* ── BADGE / PILL UTILITY ─────────────────────────────────────────── */
    .ocm-badge {
      display: inline-block;
      background: #1a2030;
      border: 1px solid #2a4060;
      color: var(--ocm-link);
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: bold;
      letter-spacing: 0.04em;
    }
  `);

  // ─── UTILITIES ───────────────────────────────────────────────────────────────

  /** Format a duration in seconds to a human-readable string. */
  function fmtTime(seconds) {
    if (seconds <= 0) return '0s';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `${d}d ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
    if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
    return `${m}m ${String(s).padStart(2,'0')}s`;
  }

  /** Returns a live countdown string for a future unix timestamp. */
  function fmtCountdown(untilTs) {
    const diff = Math.max(0, untilTs - Math.floor(Date.now() / 1000));
    return fmtTime(diff);
  }

  /** Returns the CSS class for a CPR value based on configured thresholds. */
  function cprClass(cpr) {
    if (cpr === null) return 'cpr-empty';
    if (cpr >= CPR_WARN) return 'cpr-good';
    if (cpr >= CPR_CRIT) return 'cpr-warn';
    return 'cpr-crit';
  }

  /**
   * Returns an HTML span with the appropriate status icon.
   * Now distinguishes 'abroad' (🌍 + country flag) from 'traveling' (✈ direction).
   * Country flag is resolved from the description field via COUNTRY_FLAGS.
   */
  function statusIcon(status, description) {
    if (!status) return `<span class="ocm-slot-status status-unknown">?</span>`;
    const s = status.toLowerCase();
    if (s === 'okay') {
      return `<span class="ocm-slot-status status-ok" title="Okay">✓</span>`;
    }
    if (s === 'hospital') {
      return `<span class="ocm-slot-status status-hospital" title="Hospital">🏥</span>`;
    }
    if (s === 'jail') {
      return `<span class="ocm-slot-status status-jail" title="Jail">⛓</span>`;
    }
    if (s === 'traveling') {
      // Traveling = in transit (plane is in the air)
      const desc      = (description || '').toLowerCase();
      const returning = desc.includes('returning');
      const tip       = description || 'Traveling';
      const arrow     = returning ? '✈→🏠' : '🏠→✈';
      return `<span class="ocm-slot-status status-travel" title="${tip}">${arrow}</span>`;
    }
    if (s === 'abroad') {
      // Abroad = already at destination — show country flag
      const flag = flagFromDescription(description);
      const tip  = description || 'Abroad';
      return `<span class="ocm-slot-status status-abroad" title="${tip}">${flag}</span>`;
    }
    return `<span class="ocm-slot-status status-unknown" title="${status}">?</span>`;
  }

  /**
   * Returns true if a member's status prevents them from participating in OC initiation.
   * Traveling and abroad are both blocking.
   */
  function isBlocked(status) {
    if (!status) return false;
    const s = status.toLowerCase();
    return s === 'hospital' || s === 'jail' || s === 'traveling' || s === 'abroad';
  }

  /**
   * Returns true if the member holds the Recruit rank and therefore cannot join OCs.
   * Checks both the faction.position field and a top-level rank field.
   */
  function isRecruit(member) {
    const pos  = (member?.faction?.position || member?.position || '').toLowerCase().trim();
    const rank = (member?.rank || '').toLowerCase().trim();
    return pos === 'recruit' || rank === 'recruit';
  }

  // ─── API ─────────────────────────────────────────────────────────────────────

  /** Fetch a Torn API v2 endpoint and return the parsed JSON. Throws on error. */
  async function apiFetch(path, apiKey) {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${API_BASE}${path}${sep}key=${apiKey}&comment=OCManager`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(`API error ${data.error.code}: ${data.error.error}`);
    return data;
  }

  /** Fetch all data required for leader (faction) mode. */
  async function fetchAll(apiKey) {
    const [faction, members, armoryData, me] = await Promise.all([
      apiFetch('/faction?selections=crimes,basic', apiKey),
      apiFetch('/faction?selections=members', apiKey),
      apiFetch('/faction?selections=armory', apiKey).catch(() => ({})),
      apiFetch('/user?selections=basic', apiKey).catch(() => ({})),
    ]);

    // Viewer's own player ID — used by the "best open slot" advisory to look up
    // YOUR predicted CPR for each open role (an empty slot has no CPR of its own).
    const viewerId = me?.player_id ? String(me.player_id) : (me?.profile?.id ? String(me.profile.id) : null);
    if (viewerId) GM_setValue('ocm_my_player_id', viewerId);

    // Build armory inventory: item_id → total quantity
    const armory = {};
    const rawArmory = armoryData.armory || {};
    for (const item of Object.values(rawArmory)) {
      const id = String(item.id || item.ID || '');
      if (id) armory[id] = (armory[id] || 0) + (item.quantity || item.qty || 1);
    }

    // Collect item IDs referenced in active OC slots so we can resolve their names
    const itemIds = new Set();
    const INACTIVE = new Set(['completed', 'expired', 'cancelled', 'failed', 'success']);
    for (const oc of Object.values(faction.crimes || {})) {
      if (!oc || typeof oc !== 'object') continue;
      const ocStatus = (oc.status || '').toLowerCase();
      // Active OCs: collect item-requirement IDs (for the slot item badges)
      if (!INACTIVE.has(ocStatus)) {
        for (const slot of Object.values(oc.slots || oc.participants || [])) {
          const rawItems = slot.items
            ? (Array.isArray(slot.items) ? slot.items : Object.values(slot.items))
            : slot.item_requirement ? [slot.item_requirement] : [];
          for (const item of rawItems) {
            const id = item?.id || item?.item_id;
            if (id) itemIds.add(String(id));
          }
        }
      }
      // ALL OCs: collect reward-item IDs (for profit tracking item values)
      const rwItems = oc.rewards?.items;
      if (rwItems) {
        const arr = Array.isArray(rwItems) ? rwItems : Object.values(rwItems);
        for (const it of arr) {
          const id = it?.id || it?.item_id;
          if (id) itemIds.add(String(id));
        }
      }
    }

    // Resolve item names AND market values via the torn items endpoint
    let itemNames = {};
    let itemValues = {};
    if (itemIds.size > 0) {
      try {
        const ids = [...itemIds].join(',');
        const url = `https://api.torn.com/torn/${ids}?selections=items&key=${apiKey}&comment=OCManager`;
        const res  = await fetch(url);
        const data = await res.json();
        for (const [id, item] of Object.entries(data.items || {})) {
          itemNames[String(id)]  = item.name || `Item #${id}`;
          // v2 nests price under value.market_price; v1 used market_value
          itemValues[String(id)] = item.value?.market_price ?? item.market_value ?? item.value?.sell_price ?? 0;
        }
      } catch (_) {}
    }

    // Build last-OC records and collect ex-member IDs from completed OC history
    const lastOc       = {};
    const exMemberIds  = new Set();
    const currentMemberIds = new Set(Object.values(members.members || {}).map(m => String(m.id)));

    // Historical CPR map from completed OCs:
    //   ocHistoryCpr[memberId][ocName][roleNoNum] = { sum, count }
    // Used as a fallback when TornStats has no data for a member+role
    const ocHistoryCpr = {};

    for (const oc of Object.values(faction.crimes || {})) {
      if (!oc?.executed_at) continue;
      const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      for (const slot of ocSlots) {
        if (!slot) continue;
        const uid = slot.user?.id ? String(slot.user.id) : null;
        if (!uid) continue;
        if (!lastOc[uid] || oc.executed_at > lastOc[uid].executed_at) {
          lastOc[uid] = { name: oc.name || `OC #${oc.id}`, executed_at: oc.executed_at };
        }
        if (!currentMemberIds.has(uid)) exMemberIds.add(uid);

        // Record CPR for fallback lookup
        const cpr = slot.checkpoint_pass_rate;
        if (cpr != null && oc.name) {
          const roleRaw  = slot.position_info?.label || slot.position || '';
          const roleNorm = roleRaw.replace(/\s*#\d+$/, '').toLowerCase().trim();
          if (roleNorm) {
            const ocKey = oc.name.toLowerCase().trim();
            if (!ocHistoryCpr[uid]) ocHistoryCpr[uid] = {};
            if (!ocHistoryCpr[uid][ocKey]) ocHistoryCpr[uid][ocKey] = {};
            const bucket = ocHistoryCpr[uid][ocKey][roleNorm] || { sum: 0, count: 0 };
            bucket.sum   += cpr;
            bucket.count += 1;
            ocHistoryCpr[uid][ocKey][roleNorm] = bucket;
          }
        }
      }
    }
    window._ocmHistoryCpr = ocHistoryCpr;

    // Fetch display names for ex-members who've left the faction
    const exMemberNames = {};
    if (exMemberIds.size > 0) {
      await Promise.all([...exMemberIds].map(async uid => {
        try {
          const url  = `https://api.torn.com/user/${uid}?selections=basic&key=${apiKey}&comment=OCManager`;
          const res  = await fetch(url);
          const data = await res.json();
          if (data?.name) exMemberNames[uid] = data.name;
        } catch (_) {}
      }));
    }

    return { faction, members: members.members || {}, armory, itemNames, itemValues, lastOc, exMemberNames, viewerId };
  }

  // ─── BUILD UI ────────────────────────────────────────────────────────────────

  /** Construct the dashboard root element. Returns an unattached DOM node. */
  function buildRoot() {
    const root = document.createElement('div');
    root.id = 'ocm-root';
    root.innerHTML = `
      <div id="ocm-header">
        <h2>⚔ OC Manager <span style="font-size:10px;font-weight:normal;opacity:.5">v3.5.2</span></h2>
        <small id="ocm-last-update">Not loaded</small>
        <button id="ocm-refresh-btn" title="Refresh data">↻ Refresh</button>
      </div>
      <div id="ocm-config-strip">
        <span id="ocm-key-status" style="font-size:11px;color:#99a;flex:1"></span>
        <button id="ocm-config-toggle" title="Settings">⚙ Config</button>
      </div>
      <div id="ocm-config-panel" style="display:none">
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">Colour Theme
            <span style="font-size:10px;color:#99a;font-weight:normal;text-transform:none;letter-spacing:0;margin-left:6px">
              Accessibility themes add ✓ ⚠ ✗ shape markers so CPR status isn't colour-only.
            </span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <select id="ocm-theme-select" style="background:#1c1810;border:1px solid #3a3018;border-radius:4px;color:#e0e0e0;padding:4px 8px;font-size:12px;cursor:pointer;flex:1;max-width:280px">
              <option value="default">Default (current look)</option>
              <option value="highcontrast">High Contrast</option>
              <option value="deuteranopia">Deuteranopia (Red/Green CB)</option>
              <option value="protanopia">Protanopia (Red Deficiency)</option>
              <option value="tritanopia">Tritanopia (Blue/Yellow CB)</option>
            </select>
          </div>
        </div>
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">Torn API Key
            <span style="font-size:10px;color:#99a;font-weight:normal;text-transform:none;letter-spacing:0;margin-left:6px">
              Requires: Faction data (read) access. Generate at
              <a href="https://www.torn.com/preferences.php#tab=api" target="_blank" style="color:var(--ocm-link)">Preferences → API</a>.
            </span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input id="ocm-api-input" type="password" placeholder="Paste your API key (faction read access)" style="flex:1;min-width:160px" />
            <button id="ocm-save-key-btn" class="ocm-cfg-btn">Save & Load</button>
          </div>
        </div>
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">TornStats API Key
            <span style="font-size:10px;color:#99a;font-weight:normal;text-transform:none;letter-spacing:0;margin-left:6px">
              Optional. Get at <a href="https://www.tornstats.com/profile" target="_blank" style="color:var(--ocm-link)">TornStats → Profile</a>.
            </span>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input id="ocm-ts-key-input" type="password" placeholder="TornStats API key" style="flex:1;min-width:160px" />
            <button id="ocm-ts-save-btn" class="ocm-cfg-btn">Save TS Key</button>
            <button id="ocm-ts-fetch-btn" class="ocm-cfg-btn" style="background:#1a3a1a">⬇ Fetch CPR</button>
          </div>
          <div id="ocm-ts-status" style="font-size:11px;color:#99a;margin-top:4px"></div>
        </div>
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">CPR Thresholds</div>
          <div class="ocm-cfg-row">
            <label>Warn below <input id="ocm-cfg-cpr-warn" type="number" min="0" max="100" value="${CPR_WARN}" class="ocm-cfg-num" />%</label>
            <label>Crit below <input id="ocm-cfg-cpr-crit" type="number" min="0" max="100" value="${CPR_CRIT}" class="ocm-cfg-num" />%</label>
          </div>
        </div>
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">Role Weight Thresholds</div>
          <div class="ocm-cfg-row">
            <label>High ≥ <input id="ocm-cfg-w-high" type="number" min="0" max="100" value="${WEIGHT_HIGH}" class="ocm-cfg-num" />%</label>
            <label>Mid ≥ <input id="ocm-cfg-w-mid" type="number" min="0" max="100" value="${WEIGHT_MID}" class="ocm-cfg-num" />%</label>
          </div>
        </div>
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">Auto-refresh Interval</div>
          <div class="ocm-cfg-row">
            <label>Every <input id="ocm-cfg-refresh" type="number" min="30" max="3600" value="${REFRESH_S}" class="ocm-cfg-num" style="width:52px" /> seconds</label>
          </div>
        </div>
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">OC Spawn Reminder — min recruiting OCs per difficulty</div>
          <div class="ocm-cfg-row">
            <label>Min per difficulty <input id="ocm-cfg-min-per-diff" type="number" min="0" max="20" value="${MIN_PER_DIFF}" class="ocm-cfg-num" /></label>
            <span style="font-size:10px;color:#99a">Stats bar turns red when any difficulty falls below this value. Set 0 to disable.</span>
          </div>
        </div>
        <div class="ocm-cfg-section" id="ocm-cfg-section-membermode" style="display:none">
          <div class="ocm-cfg-label">View Mode</div>
          <div class="ocm-cfg-row">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="ocm-cfg-force-member" style="cursor:pointer" />
              <span>Force Member Mode</span>
            </label>
          </div>
          <div style="font-size:10px;color:#99a;margin-top:6px;line-height:1.4">
            Your API key has faction-data access, so you can see the full leader dashboard.
            Tick this to preview the simplified Member Mode view (slot recommendations only).
          </div>
        </div>
        <div class="ocm-cfg-section">
          <div class="ocm-cfg-label">Debug</div>
          <div class="ocm-cfg-row">
            <button id="ocm-debug-snapshot-btn" class="ocm-cfg-btn" title="Download a JSON snapshot of the script's current internal state for troubleshooting">📋 Download Debug Snapshot</button>
            <button id="ocm-debug-copy-btn" class="ocm-cfg-btn" title="Copy a debug snapshot to clipboard">📋 Copy to Clipboard</button>
          </div>
          <div style="font-size:10px;color:#99a;margin-top:6px;line-height:1.4">
            Includes script state, computed sections, CPR data sources, and OC structure.
            API keys and full member rosters are redacted — safe to share for troubleshooting.
          </div>
        </div>
        <div style="padding:6px 10px 10px;display:flex;gap:8px">
          <button id="ocm-cfg-save-btn" class="ocm-cfg-btn">💾 Save Settings</button>
          <button id="ocm-cfg-reset-btn" class="ocm-cfg-btn" style="background:#222">↺ Reset Defaults</button>
          <span id="ocm-cfg-status" style="font-size:11px;color:var(--ocm-cpr-good);align-self:center"></span>
        </div>
      </div>
      <div id="ocm-stats-bar" style="display:none">
        <div class="ocm-stats-row">
          <div class="ocm-stat ocm-s-active" title="Number of active OCs (excluding completed/expired)">
            <span class="ocm-stat-label">Active</span>
            <span class="ocm-stat-value" id="ocm-s-active">–</span>
          </div>
          <div class="ocm-stat ocm-s-open" title="Slots across all active OCs with no member assigned yet">
            <span class="ocm-stat-label">Open</span>
            <span class="ocm-stat-value" id="ocm-s-open">–</span>
          </div>
          <div class="ocm-stat ocm-s-free" title="Faction members not currently assigned to any OC — available to fill open slots">
            <span class="ocm-stat-label">Free</span>
            <span class="ocm-stat-value" id="ocm-s-free">–</span>
          </div>
          <div class="ocm-stat ocm-s-lowcpr" title="Filled slots where the member's Checkpoint Pass Rate is below the warn threshold — they may cause failure">
            <span class="ocm-stat-label">⚠ Low CPR</span>
            <span class="ocm-stat-value" id="ocm-s-lowcpr">–</span>
          </div>
          <div class="ocm-stat ocm-s-blocked" title="Members currently in an OC who are jailed, hospitalised, or travelling — OC cannot initiate while any member is blocked">
            <span class="ocm-stat-label">🔴 Blocked</span>
            <span class="ocm-stat-value" id="ocm-s-blocked">–</span>
          </div>
          <div class="ocm-stat ocm-s-stuck" id="ocm-s-stuck-stat" title="OCs where all slots are filled and planning is complete, but initiation is blocked by a jailed/hospitalised/abroad member.">
            <span class="ocm-stat-label">🚨 Stuck</span>
            <span class="ocm-stat-value" id="ocm-s-stuck">–</span>
          </div>
        </div>
        <div class="ocm-stats-row-recruiting" id="ocm-s-recruiting-stat" title="Recruiting OCs per difficulty. Turns red when any difficulty is below the configured minimum.">
          <span class="ocm-stat-label">Recruiting by Diff</span>
          <span id="ocm-s-recruiting" style="display:flex;gap:4px;flex-wrap:wrap;flex:1">–</span>
        </div>
      </div>
      <div id="ocm-body" style="display:none">
        <div id="ocm-error"></div>
        <div id="ocm-stuck-banner" style="display:none"></div>
        <div id="ocm-next-banner"></div>
        <div id="ocm-leader-advice" style="display:none;background:#1e1e1e;border:0.5px solid #2e2e2e;border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:12px"></div>
        <div class="ocm-tabs" id="ocm-tabs" role="tablist">
          <div class="ocm-tab active" data-tab="action"    role="tab">🎯 Action <span class="ocm-tab-count" id="ocm-tab-count-action">0</span></div>
          <div class="ocm-tab"        data-tab="status"    role="tab">🚫 Status <span class="ocm-tab-count" id="ocm-tab-count-status">0</span></div>
          <div class="ocm-tab"        data-tab="optimize"  role="tab">⚡ Optimize <span class="ocm-tab-count" id="ocm-tab-count-optimize">0</span></div>
          <div class="ocm-tab"        data-tab="ocs"       role="tab">📋 Active OCs <span class="ocm-tab-count" id="ocm-tab-count-ocs">0</span></div>
          <div class="ocm-tab"        data-tab="profit"    role="tab">💰 Profit</div>
          <div class="ocm-tab"        data-tab="reference" role="tab">📚 Reference</div>
        </div>
        <div class="ocm-tab-pane active" id="ocm-pane-action">
          <div class="ocm-section-title collapsed" id="ocm-title-available">Members Available for Assignment <span id="ocm-newsletter-btn" title="Build a newsletter message with each member's recommended slot, copy it to clipboard, and open the newsletter page" onclick="event.stopPropagation()" style="color:var(--ocm-link);cursor:pointer;font-size:13px;margin-left:6px">✉</span></div>
          <div id="ocm-available" style="display:none"></div>
          <div class="ocm-section-title collapsed" id="ocm-title-recruits">🚧 Recruits (cannot join OCs)</div>
          <div id="ocm-recruits" style="display:none"></div>
        </div>
        <div class="ocm-tab-pane" id="ocm-pane-status">
          <div class="ocm-section-title collapsed" id="ocm-title-blocked">Blocked Members (Jail / Hospital / Abroad)</div>
          <div id="ocm-blocked" style="display:none"></div>
        </div>
        <div class="ocm-tab-pane" id="ocm-pane-optimize">
          <div class="ocm-section-title collapsed" id="ocm-title-lowcpr">⚠ Low CPR Members — below ${CPR_WARN}%</div>
          <div id="ocm-lowcpr" style="display:none"></div>
          <div class="ocm-section-title collapsed" id="ocm-title-overqualified">⬆ Underutilized — could run a harder OC</div>
          <div id="ocm-overqualified" style="display:none"></div>
        </div>
        <div class="ocm-tab-pane" id="ocm-pane-ocs">
          <div id="ocm-planning-header" class="ocm-phase-header ocm-phase-planning">⏳ Planning <span id="ocm-planning-count" class="ocm-phase-count"></span><span class="ocm-phase-collapse">▼</span></div>
          <div id="ocm-grid-planning" class="ocm-oc-grid"></div>
          <div id="ocm-recruiting-header" class="ocm-phase-header ocm-phase-recruiting">🔍 Recruiting <span id="ocm-recruiting-count" class="ocm-phase-count"></span><span class="ocm-phase-collapse">▼</span></div>
          <div id="ocm-grid-recruiting" class="ocm-oc-grid"></div>
        </div>
        <div class="ocm-tab-pane" id="ocm-pane-profit">
          <div id="ocm-profit"></div>
        </div>
        <div class="ocm-tab-pane" id="ocm-pane-reference">
          <div class="ocm-section-title collapsed" id="ocm-title-tscpr">📈 TornStats CPR</div>
          <div id="ocm-tscpr" style="display:none"></div>
          <div class="ocm-section-title collapsed" id="ocm-title-analytics">📊 Analytics — Last 100 OCs</div>
          <div id="ocm-analytics" style="display:none"></div>
          <div class="ocm-section-title collapsed" id="ocm-title-downloads">⬇ Downloads</div>
          <div id="ocm-downloads" style="display:none"></div>
        </div>
        <div id="ocm-footer"></div>
      </div>
    `;
    return root;
  }

  // ─── RENDER ──────────────────────────────────────────────────────────────────

  /**
   * Main render function — called after a successful faction API fetch.
   * Builds the complete dashboard from raw API data.
   */
  function renderDashboard(faction, memberMap, armory, itemNames, lastOc, exMemberNames = {}, itemValues = {}, viewerId = null) {
    const crimes = faction.crimes || {};
    // Make sure tab strip is visible (might have been hidden in a previous member-mode render)
    const _tabsEl = document.getElementById('ocm-tabs');
    if (_tabsEl) _tabsEl.style.display = '';

    /** Resolve an item name from itemNames cache or fall back gracefully. */
    function itemName(item) {
      const id = String(item?.id || item?.item_id || '');
      return itemNames[id] || item?.name || (id ? `Item #${id}` : 'Unknown item');
    }

    // Build a quick-lookup of member info indexed by string ID
    const mInfo = {};
    for (const [, m] of Object.entries(memberMap)) {
      const key   = String(m.id);
      const state = m.status?.state || m.status?.description || 'Unknown';
      const desc  = m.status?.description || '';
      mInfo[key] = { name: m.name, status: state, description: desc, recruit: isRecruit(m) };
    }

    // --- First pass: collect aggregate stats
    const assignedIds    = new Set();
    let openSlots        = 0;
    let lowCprCount      = 0;
    let blockedInOcCount = 0;
    const readyOcs       = [];
    const planningOcs    = [];
    const recruitingOcs  = [];
    const blockedOcs     = [];

    // Build OC name → difficulty map for TornStats CPR section
    const crimeDiffMap = {};
    for (const oc of Object.values(crimes)) {
      if (oc?.name && oc?.difficulty != null) crimeDiffMap[oc.name.toLowerCase().trim()] = oc.difficulty;
    }
    window._ocmCrimeDiffMap = crimeDiffMap;

    const ACTIVE = new Set(['recruiting', 'planning', 'ready', 'blocked', 'awaiting', 'initiated', 'executing', 'in progress', 'active']);

    for (const [ocId, oc] of Object.entries(crimes)) {
      if (!oc || typeof oc !== 'object') continue;
      const phase  = (oc.status || '').toLowerCase();
      if (!ACTIVE.has(phase)) continue;
      const ocName = oc.name || `OC #${ocId}`;

      for (const slot of (Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []))) {
        const user   = slot.user;
        const userId = user?.id ? String(user.id) : null;

        if (userId && !mInfo[userId]) {
          mInfo[userId] = { name: user.name || `#${userId}`, status: user.status?.state || 'Unknown' };
        }

        if (userId) assignedIds.add(userId);
        if (userId && mInfo[userId] && isBlocked(mInfo[userId].status)) blockedInOcCount++;

        const cpr = slot.checkpoint_pass_rate ?? null;
        if (cpr != null && userId && cpr < CPR_WARN) lowCprCount++;
        if (!userId) openSlots++;

        // Backfill tsCprData: if a member is in an OC with a known CPR but
        // TornStats doesn't have data for this crime+role, use the live CPR
        if (cpr != null && userId && oc.name) {
          const rn = (slot.position_info?.label || slot.position || '').replace(/\s*#\d+$/, '');
          if (rn) {
            if (!tsCprData[userId]) tsCprData[userId] = {};
            if (!tsCprData[userId][oc.name]) tsCprData[userId][oc.name] = {};
            if (tsCprData[userId][oc.name][rn] == null) {
              tsCprData[userId][oc.name][rn] = cpr;
            }
          }
        }
      }

      if (phase === 'recruiting')    recruitingOcs.push({ id: ocId, oc });
      else if (phase === 'planning') planningOcs.push({ id: ocId, oc });
      else if (phase === 'ready')    readyOcs.push({ id: ocId, oc });
      else if (phase === 'blocked')  blockedOcs.push({ id: ocId, oc });
    }

    // --- Split free members into recruits vs eligible
    const freeMembers  = [];
    const freeRecruits = [];
    for (const m of Object.values(memberMap)) {
      const mid  = String(m.id);
      const inOc = m.is_in_oc ?? assignedIds.has(mid);
      if (inOc) continue;
      const state = m.status?.state || m.status?.description || 'Unknown';
      if (isRecruit(m)) {
        freeRecruits.push({ id: mid, name: m.name, status: state });
      } else {
        freeMembers.push({ id: mid, name: m.name, status: state });
      }
    }

    // --- Recruiting OC counts per difficulty for spawn reminder stat
    const recruitingByDiff = {};
    for (const { oc } of recruitingOcs) {
      const diff = String(oc.difficulty ?? '?');
      recruitingByDiff[diff] = (recruitingByDiff[diff] || 0) + 1;
    }
    // Check if any known difficulty is below the minimum threshold
    const anyBelowMin = MIN_PER_DIFF > 0 && Object.values(recruitingByDiff).some(v => v < MIN_PER_DIFF);
    const recruitStatEl = document.getElementById('ocm-s-recruiting-stat');
    const sortedDiffs = Object.keys(recruitingByDiff).sort((a, b) => Number(a) - Number(b));
    const recruitChipHtml = sortedDiffs.length
      ? sortedDiffs.map(d => {
          const count = recruitingByDiff[d];
          const danger = MIN_PER_DIFF > 0 && count < MIN_PER_DIFF;
          return `<span class="ocm-recruiting-chip${danger ? ' danger' : ''}" title="D${d}: ${count} recruiting OC${count===1?'':'s'}">D${d}·${count}</span>`;
        }).join('')
      : '<span style="color:#556;font-size:11px">–</span>';
    document.getElementById('ocm-s-recruiting').innerHTML = recruitChipHtml;
    if (recruitStatEl) {
      const title = anyBelowMin
        ? `⚠ One or more difficulty levels has fewer than ${MIN_PER_DIFF} recruiting OC(s). Consider spawning more.`
        : 'Recruiting OCs per difficulty. All levels above minimum threshold.';
      recruitStatEl.title = title;
    }

    // --- Update stats bar
    const activeOcCount = Object.values(crimes).filter(oc => oc && ACTIVE.has((oc.status||'').toLowerCase())).length;
    document.getElementById('ocm-s-active').textContent  = activeOcCount;
    document.getElementById('ocm-s-open').textContent    = openSlots;
    document.getElementById('ocm-s-lowcpr').textContent  = lowCprCount;
    document.getElementById('ocm-s-blocked').textContent = blockedInOcCount;
    document.getElementById('ocm-s-free').textContent    = freeMembers.length;
    document.getElementById('ocm-stats-bar').style.display = 'flex';
    document.getElementById('ocm-body').style.display       = 'block';

    // 'now' used throughout the rest of renderDashboard — defined once here
    const now = Math.floor(Date.now() / 1000);

    // --- Detect stuck OCs:
    // An OC is "stuck" when every slot is filled, all planning progress is
    // complete (progress >= 100 for all members), and at least one member is
    // jailed, hospitalised, or abroad — preventing initiation.
    const stuckOcs = [];
    for (const [ocId, oc] of Object.entries(crimes)) {
      if (!oc || typeof oc !== 'object') continue;
      const phase = (oc.status || '').toLowerCase();
      // Only consider planning-phase OCs (ready, planning, blocked)
      if (!['planning', 'ready', 'blocked', 'awaiting'].includes(phase)) continue;
      const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      // All slots must be filled
      if (ocSlots.some(s => !s.user?.id)) continue;
      // All members must have completed planning (progress >= 100, or field absent = done)
      const allPlanned = ocSlots.every(s => (s.user?.progress ?? 100) >= 100);
      if (!allPlanned) continue;
      // At least one member must be blocked
      const blockers = ocSlots
        .map(s => {
          const uid  = String(s.user.id);
          const info = mInfo[uid];
          if (!info || !isBlocked(info.status)) return null;
          return { uid, name: info.name, status: info.status, description: info.description || '' };
        })
        .filter(Boolean);
      if (blockers.length === 0) continue;
      stuckOcs.push({ id: ocId, oc, blockers });
    }

    // --- Update stuck OC stat
    const stuckStatEl = document.getElementById('ocm-s-stuck-stat');
    document.getElementById('ocm-s-stuck').textContent = stuckOcs.length;
    if (stuckStatEl) {
      stuckStatEl.classList.toggle('ocm-stat-warn', stuckOcs.length > 0);
      stuckStatEl.title = stuckOcs.length > 0
        ? `⚠ ${stuckOcs.length} OC${stuckOcs.length > 1 ? 's are' : ' is'} fully planned and filled but cannot initiate — a member is unavailable.`
        : 'No stuck OCs — all fully planned OCs can initiate.';
    }

    // --- Render stuck OC banner
    const stuckBannerEl = document.getElementById('ocm-stuck-banner');
    if (stuckOcs.length === 0) {
      stuckBannerEl.style.display = 'none';
    } else {
      stuckBannerEl.style.display = 'block';
      const cardsHtml = stuckOcs.map(({ id, oc, blockers }) => {
        const expiredAt = oc.expired_at ?? null;
        const expiryHtml = expiredAt
          ? (() => {
              const secsLeft = expiredAt - now;
              const urgCol   = secsLeft < 3600  ? 'var(--ocm-cpr-crit)'
                             : secsLeft < 86400 ? 'var(--ocm-cpr-warn)'
                             : 'var(--ocm-cpr-warn)';
              return secsLeft > 0
                ? `<span class="ocm-stuck-expiry" style="color:${urgCol}">Expires in <span class="ocm-time" data-until="${expiredAt}">${fmtTime(secsLeft)}</span></span>`
                : `<span class="ocm-stuck-expiry" style="color:var(--ocm-cpr-crit)">Expired</span>`;
            })()
          : '';

        const blockersHtml = blockers.map(b => {
          const s           = (b.status || '').toLowerCase();
          let statusLabel;
          if (s === 'abroad' || s === 'traveling') {
            statusLabel = travelInfo(b.status, b.description).label;
          } else {
            const icons = { hospital: '🏥', jail: '⛓' };
            statusLabel = `${icons[s] || '❓'} ${b.status}`;
          }
          return `<div class="ocm-stuck-blocker">
            ↳ <a href="/profiles.php?XID=${b.uid}" target="_blank">${b.name}</a>
            <span style="color:var(--ocm-cpr-crit)">${statusLabel}</span>
            ${b.description ? `<span style="color:#666;font-size:10px" title="${b.description}">${b.description.length > 40 ? b.description.slice(0,38)+'…' : b.description}</span>` : ''}
          </div>`;
        }).join('');

        return `<div class="ocm-stuck-card">
          <div class="ocm-stuck-card-title">
            <strong>${oc.name || `OC #${id}`}</strong>
            <span class="ocm-stuck-diff">D${oc.difficulty ?? '?'} · ${(Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || [])).length} slots · fully planned</span>
            ${expiryHtml}
          </div>
          ${blockersHtml}
        </div>`;
      }).join('');

      stuckBannerEl.innerHTML = `
        <div class="ocm-stuck-header">
          🚨 Stuck OCs — cannot initiate
          <span>${stuckOcs.length} OC${stuckOcs.length > 1 ? 's are' : ' is'} ready but blocked by an unavailable member</span>
        </div>
        ${cardsHtml}`;
    }

    // --- Build OC card grids
    const gridPlanning   = document.getElementById('ocm-grid-planning');
    const gridRecruiting = document.getElementById('ocm-grid-recruiting');
    gridPlanning.innerHTML   = '';
    gridRecruiting.innerHTML = '';

    /** Compute a sort key for an OC so urgent/imminent ones sort first. */
    function ocSortKey(oc) {
      const now       = Math.floor(Date.now() / 1000);
      const ocSlots   = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      const openCount = ocSlots.filter(s => !s.user).length;
      if (oc.executed_at && oc.executed_at > now) return oc.executed_at;
      if (oc.ready_at    && oc.ready_at    > now) return oc.ready_at;
      if (oc.time_left > 0) return now + oc.time_left + (openCount * 24 * 3600);
      if (openCount > 0)    return now + (openCount * 24 * 3600);
      if (oc.expired_at)    return oc.expired_at;
      return Infinity;
    }

    const planningAll = [
      ...readyOcs.map(o    => ({ ...o, cardClass: 'ocm-card-ready',   badgeClass: 'badge-ready',    badgeLabel: 'READY' })),
      ...blockedOcs.map(o  => ({ ...o, cardClass: 'ocm-card-blocked', badgeClass: 'badge-blocked',  badgeLabel: 'BLOCKED' })),
      ...planningOcs.map(o => ({ ...o, cardClass: '',                 badgeClass: 'badge-planning', badgeLabel: 'PLANNING' })),
    ].sort((a, b) => ocSortKey(a.oc) - ocSortKey(b.oc));

    const recruitingAll = recruitingOcs
      .map(o => ({ ...o, cardClass: 'ocm-card-warn', badgeClass: 'badge-recruiting', badgeLabel: 'RECRUITING' }))
      .sort((a, b) => ocSortKey(a.oc) - ocSortKey(b.oc));

    // --- Update phase header labels
    const planningDiff = {};
    for (const { oc } of planningAll) {
      const diff = oc.difficulty ?? '?';
      planningDiff[diff] = (planningDiff[diff] || 0) + 1;
    }
    const planningBreakdownHtml = Object.keys(planningDiff)
      .sort((a, b) => Number(a) - Number(b))
      .map(diff => {
        const count = planningDiff[diff];
        return `<span class="ocm-diff-chip ocm-diff-chip-plan">D${diff}: <strong>${count}</strong> OC${count !== 1 ? 's' : ''}</span>`;
      }).join('');
    const planningHeader = document.getElementById('ocm-planning-header');
    planningHeader.innerHTML = `⏳ Planning <span class="ocm-phase-count">(${planningAll.length})</span>${planningBreakdownHtml ? '<span class="ocm-diff-sep" style="color:var(--ocm-link)">—</span>' + planningBreakdownHtml : ''}<span class="ocm-phase-collapse">▼</span>`;

    const diffBreakdown = {};
    for (const { oc } of recruitingAll) {
      const diff = oc.difficulty ?? '?';
      if (!diffBreakdown[diff]) diffBreakdown[diff] = { ocs: 0, slots: 0 };
      diffBreakdown[diff].ocs++;
      const ocSlotList = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      diffBreakdown[diff].slots += ocSlotList.filter(s => !s.user).length;
    }
    const breakdownHtml = Object.keys(diffBreakdown)
      .sort((a, b) => Number(a) - Number(b))
      .map(diff => {
        const { ocs, slots } = diffBreakdown[diff];
        return `<span class="ocm-diff-chip">D${diff}: <strong>${ocs}</strong> OC${ocs !== 1 ? 's' : ''} · <strong>${slots}</strong> slot${slots !== 1 ? 's' : ''}</span>`;
      }).join('');
    const recruitingHeader = document.getElementById('ocm-recruiting-header');
    recruitingHeader.innerHTML = `🔍 Recruiting <span class="ocm-phase-count">(${recruitingAll.length})</span>${breakdownHtml ? '<span class="ocm-diff-sep">—</span>' + breakdownHtml : ''}<span class="ocm-phase-collapse">▼</span>`;

    // --- Next OC banner
    const nextOc = planningAll.length > 0 ? planningAll[0].oc : null;
    const bannerEl = document.getElementById('ocm-next-banner');

    if (nextOc) {
      const ocSlotList = Array.isArray(nextOc.slots) ? nextOc.slots : Object.values(nextOc.slots || []);
      const executesAt = (nextOc.executed_at && nextOc.executed_at > now ? nextOc.executed_at : null)
                      ?? (nextOc.ready_at    && nextOc.ready_at    > now ? nextOc.ready_at    : null);
      const timeLeft   = nextOc.time_left ?? null;
      const openCount  = ocSlotList.filter(s => !s.user).length;

      let timeDisplay;
      if (executesAt) {
        const tctStr  = new Date(executesAt * 1000).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
        const tctDate = new Date(executesAt * 1000).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' });
        const openExtra = openCount > 0 ? ` + ~${fmtTime(openCount * 24 * 3600)} (${openCount} open)` : '';
        timeDisplay = `<span class="ocm-time" data-until="${executesAt}">${fmtTime(executesAt - now)}</span>${openExtra} <span style="opacity:.6;font-size:11px">(${tctDate} ${tctStr} TCT)</span>`;
      } else if (timeLeft > 0) {
        const openExtra = openCount > 0 ? ` + ~${fmtTime(openCount * 24 * 3600)} (${openCount} open)` : '';
        timeDisplay = `~${fmtTime(timeLeft)}${openExtra} <span style="opacity:.6;font-size:11px">(paused)</span>`;
      } else if (openCount > 0) {
        timeDisplay = `~${fmtTime(openCount * 24 * 3600)} <span style="opacity:.6;font-size:11px">(${openCount} slot${openCount > 1 ? 's' : ''} × 24h est.)</span>`;
      } else {
        timeDisplay = `<span style="color:var(--ocm-cpr-good);font-weight:bold">Ready to initiate!</span>`;
      }

      const issues = [];
      for (const slot of ocSlotList) {
        const uid      = slot.user?.id ? String(slot.user.id) : null;
        const info     = uid ? mInfo[uid] : null;
        const slotRole = slot.position_info?.label || slot.position || 'Unknown';
        const slotCpr  = slot.checkpoint_pass_rate ?? null;
        const slotW    = getWeight(nextOc.name || '', slotRole);

        if (!uid) {
          issues.push({ sev: 'crit', msg: `Open slot: ${slotRole}` });
        } else if (info && isBlocked(info.status)) {
          issues.push({ sev: 'crit', msg: `${info.name} — ${info.status}` });
        }
        const req = slot.item_requirement;
        if (req && uid && !req.is_available && !armory[String(req.id)]) {
          issues.push({ sev: 'warn', msg: `${info?.name || uid} missing: ${itemName(req)}` });
        }
        if (slotW != null && slotW >= WEIGHT_HIGH && slotCpr != null && slotCpr < CPR_WARN && uid) {
          issues.push({ sev: 'warn', msg: `${info?.name || uid} — low CPR (${slotCpr}%) in high-weight role ${slotRole} (${slotW.toFixed(0)}%)` });
        }
      }

      const hasCritIssue = issues.some(i => i.sev === 'crit');
      const hasWarnIssue = issues.some(i => i.sev === 'warn');
      const bannerClass  = hasCritIssue ? 'banner-crit' : hasWarnIssue ? 'banner-warn' : 'banner-ok';
      const bannerIcon   = hasCritIssue ? '🔴' : hasWarnIssue ? '⚠️' : '✅';

      const issuesHtml = issues.length > 0
        ? `<div class="ocm-banner-issues">${issues.map(i => `<span class="ocm-banner-issue">${i.sev === 'crit' ? '🔴' : '⚠️'} ${i.msg}</span>`).join('')}</div>`
        : `<div style="font-size:11px;margin-top:3px;opacity:.7">No issues — ready to initiate on schedule.</div>`;

      bannerEl.className = bannerClass;
      bannerEl.style.display = 'block';
      bannerEl.innerHTML = `
        <div class="ocm-banner-title">${bannerIcon} Next OC: <strong>${nextOc.name}</strong> &nbsp;·&nbsp; ${timeDisplay}</div>
        ${issuesHtml}`;

      GM_setValue('ocm_sidebar_cache', JSON.stringify({
        name:       nextOc.name,
        executesAt: executesAt ?? null,
        severity:   hasCritIssue ? 'crit' : hasWarnIssue ? 'warn' : 'ok',
        issues:     issues.slice(0, 3),
        cachedAt:   now,
      }));

      // --- Leader slot advice ("your best open slot")
      // An OPEN slot has no CPR of its own (nobody's in it), so we look up the
      // VIEWER's own predicted CPR for that crime+role via TornStats data. Without
      // a viewer ID or CPR data we can't recommend, so the advisory hides instead
      // of showing a meaningless 0%.
      const leaderAdvisoryEl = document.getElementById('ocm-leader-advice');
      if (leaderAdvisoryEl) {
        const myId = viewerId || GM_getValue('ocm_my_player_id', '') || null;
        const haveTs = myId && Object.keys(tsCprData).length > 0;
        const leaderSlots = [];
        if (haveTs) {
          for (const [ocId, oc] of Object.entries(crimes)) {
            if (!oc || (oc.status || '').toLowerCase() !== 'recruiting') continue;
            const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
            for (const slot of ocSlots) {
              if (slot.user?.id) continue;
              const role   = slot.position_info?.label || slot.position || 'Unknown';
              // Look up the viewer's predicted CPR for this exact crime+role
              const tsRes  = tsGetCpr(myId, oc.name || '', role);
              const cpr    = tsRes?.cpr ?? null;
              if (cpr == null) continue; // no CPR data for you in this role — skip
              const weight = getWeight(oc.name || '', role);
              leaderSlots.push({ ocName: oc.name || `OC #${ocId}`, ocId: oc.id ?? ocId, role, cpr, weight, difficulty: oc.difficulty ?? '?', expiredAt: oc.expired_at ?? null, timeLeft: oc.time_left ?? null });
            }
          }
        }
        if (leaderSlots.length === 0) {
          // Either we don't know who the viewer is, have no TS CPR data, or none of
          // the open roles have a CPR prediction for them. Hide rather than mislead.
          leaderAdvisoryEl.style.display = 'none';
        } else {
          const nowTs2 = Math.floor(Date.now() / 1000);
          function urgencyBonusL(s) {
            let bonus = 0;
            if (s.expiredAt) {
              const secsToExpiry = s.expiredAt - nowTs2;
              if (secsToExpiry > 0 && secsToExpiry < 6  * 3600) bonus += 500;
              else if (secsToExpiry > 0 && secsToExpiry < 24 * 3600) bonus += 200;
            }
            if (s.timeLeft != null) {
              if (s.timeLeft < 12 * 3600) bonus += 100;
              else if (s.timeLeft < 24 * 3600) bonus +=  50;
            }
            return Math.min(bonus, 999);
          }
          const scored = leaderSlots.map(s => {
            const cpr    = s.cpr ?? 0;
            const weight = s.weight ?? 15;
            const diff   = Number(s.difficulty) || 0;
            const eligible    = cpr >= CPR_WARN;
            const comfort     = eligible ? Math.max(0, (cpr - CPR_WARN) / (100 - CPR_WARN)) : 0;
            const weightBonus = weight * comfort;
            let tag = null;
            if (cpr < CPR_CRIT)           tag = 'risky';
            else if (cpr < CPR_WARN)      tag = 'marginal';
            else if (weight < WEIGHT_MID) tag = 'underutilised';
            else                          tag = 'good';
            const score = eligible
              ? diff * 1000 + urgencyBonusL(s) + weightBonus + cpr
              : -(1000 - cpr);
            return { ...s, score, tag, eligible, urgent: urgencyBonusL(s) > 0 };
          }).sort((a, b) => b.score - a.score);
          const top    = scored[0];
          const cprCol = top.cpr == null ? '#555' : top.cpr >= CPR_WARN ? 'var(--ocm-cpr-good)' : top.cpr >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
          const wCol   = top.weight == null ? '#555' : top.weight >= WEIGHT_HIGH ? 'var(--ocm-cpr-warn)' : top.weight >= WEIGHT_MID ? '#aaa' : '#555';
          const tagLabel = top.tag === 'good'
            ? '<span style="font-size:10px;background:#14201a;color:var(--ocm-cpr-good);border-radius:3px;padding:1px 5px">&#10003; Good fit</span>'
            : top.tag === 'underutilised'
              ? '<span style="font-size:10px;background:#1c1810;color:var(--ocm-cpr-warn);border-radius:3px;padding:1px 5px">&#9432; Low-weight role</span>'
              : top.tag === 'marginal'
                ? '<span style="font-size:10px;background:#1c1810;color:var(--ocm-cpr-warn);border-radius:3px;padding:1px 5px">&#9888; Marginal CPR</span>'
                : '<span style="font-size:10px;background:#1c1410;color:var(--ocm-cpr-crit);border-radius:3px;padding:1px 5px">&#9888; Below threshold</span>';
          const urgLabel2 = top.urgent ? (() => {
            const secsLeft = top.expiredAt ? top.expiredAt - Math.floor(Date.now()/1000) : null;
            return secsLeft != null && secsLeft < 6 * 3600
              ? '<span style="font-size:10px;background:#181810;color:var(--ocm-cpr-warn);border-radius:3px;padding:1px 5px">&#9201; Expires soon</span>'
              : secsLeft != null && secsLeft < 24 * 3600
                ? '<span style="font-size:10px;background:#181810;color:var(--ocm-cpr-warn);border-radius:3px;padding:1px 5px">&#9201; Expiring today</span>'
                : '<span style="font-size:10px;background:#181810;color:var(--ocm-cpr-warn);border-radius:3px;padding:1px 5px">&#9201; Nearly ready</span>';
          })() : '';
          leaderAdvisoryEl.style.display = 'block';
          leaderAdvisoryEl.innerHTML = `
            <div style="font-size:10px;color:var(--ocm-link);text-transform:uppercase;letter-spacing:.08em;font-weight:bold;margin-bottom:6px">Your best open slot</div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px">
              <span style="font-weight:bold;color:#e0e0e0">${top.role}</span>
              <span style="color:#667">in</span>
              <span style="color:#aac;font-weight:bold">${top.ocName}</span>
              <span style="color:#556;font-size:10px">D${top.difficulty}</span>
              ${tagLabel}${urgLabel2}
              <span style="margin-left:auto;display:flex;gap:10px;font-size:11px">
                <span style="color:#778">CPR: <strong style="color:${cprCol}">${top.cpr != null ? top.cpr+'%' : '?'}</strong></span>
                <span style="color:#778">Weight: <strong style="color:${wCol}">${top.weight != null ? top.weight.toFixed(0)+'%' : '?'}</strong></span>
              </span>
            </div>
            ${scored.length > 1 ? `<div style="font-size:10px;color:#445;margin-top:6px">${scored.length} open slots total — showing best fit</div>` : ''}`;
        }
      }
    } else {
      bannerEl.style.display = 'none';
      GM_setValue('ocm_sidebar_cache', '');
    }

    // Re-apply collapse state to phase headers after their content is refreshed
    ['ocm-planning-header','ocm-recruiting-header'].forEach(id => {
      const el   = document.getElementById(id);
      const grid = document.getElementById(id === 'ocm-planning-header' ? 'ocm-grid-planning' : 'ocm-grid-recruiting');
      if (el && grid && grid.style.display === 'none') el.classList.add('collapsed');
    });
    if (recruitingAll.length === 0) gridRecruiting.innerHTML = '<div class="ocm-empty-phase">No OCs currently recruiting.</div>';

    const allOcs = [...planningAll, ...recruitingAll];
    if (allOcs.length === 0) gridPlanning.innerHTML = '<div class="ocm-empty-phase">No active OCs found.</div>';

    // --- Render individual OC cards
    for (const { id, oc, cardClass, badgeClass, badgeLabel } of allOcs) {
      const isRecruiting = badgeLabel === 'RECRUITING';
      const targetGrid   = isRecruiting ? gridRecruiting : gridPlanning;

      const slots    = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      const hasLow   = slots.some(s => s.user?.id && s.checkpoint_pass_rate != null && s.checkpoint_pass_rate < CPR_WARN);
      const hasCrit  = slots.some(s => s.user?.id && s.checkpoint_pass_rate != null && s.checkpoint_pass_rate < CPR_CRIT);
      const hasBlock = slots.some(s => { const uid = s.user?.id ? String(s.user.id) : null; return uid && mInfo[uid] && isBlocked(mInfo[uid].status); });

      let finalClass = cardClass;
      if (hasCrit)       finalClass = 'ocm-card-crit';
      else if (hasBlock) finalClass = 'ocm-card-blocked';
      else if (hasLow && !cardClass) finalClass = 'ocm-card-warn';

      const card = document.createElement('div');
      card.className = `ocm-card ${finalClass}`;

      const executesAt         = oc.executed_at ?? oc.ready_at ?? null;
      const timeLeft           = oc.time_left ?? null;
      const expiredAt          = oc.expired_at ?? null;
      const ocSlots            = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      const openCount          = ocSlots.filter(s => !s.user).length;

      let timerHtml = '';
      if (executesAt && executesAt > now) {
        const secsLeft  = executesAt - now;
        const tctStr    = new Date(executesAt * 1000).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
        const tctDate   = new Date(executesAt * 1000).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' });
        const openExtra = openCount > 0
          ? ` <span style="color:#666;font-size:10px">+ ~${fmtTime(openCount * 24 * 3600)} (${openCount} open slot${openCount > 1 ? 's' : ''})</span>`
          : '';
        timerHtml = `<div class="ocm-timer" title="Executes at ${tctDate} ${tctStr} TCT">⏱ <span class="ocm-time" data-until="${executesAt}">${fmtTime(secsLeft)}</span>${openExtra} <span style="color:#555;font-size:10px">(${tctDate} ${tctStr} TCT)</span></div>`;
      } else if (timeLeft > 0) {
        const openExtra = openCount > 0 ? ` + ~${fmtTime(openCount * 24 * 3600)} for ${openCount} open slot${openCount > 1 ? 's' : ''}` : '';
        timerHtml = `<div class="ocm-timer" style="color:#888">⏸ ${fmtTime(timeLeft)} remaining (paused)${openExtra}</div>`;
      } else if (openCount > 0) {
        timerHtml = `<div class="ocm-timer" style="color:#888">⏸ ~${fmtTime(openCount * 24 * 3600)} est. remaining (${openCount} slot${openCount > 1 ? 's' : ''} × 24h)</div>`;
      } else if (expiredAt) {
        const secsToExpiry = expiredAt - now;
        const expTctStr    = new Date(expiredAt * 1000).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
        const expTctDate   = new Date(expiredAt * 1000).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' });
        const urgency      = secsToExpiry < 86400 ? 'color:var(--ocm-cpr-warn)' : 'color:#666';
        timerHtml = `<div class="ocm-timer" style="${urgency}">⏳ Expires in <span class="ocm-time" data-until="${expiredAt}">${secsToExpiry > 0 ? fmtTime(secsToExpiry) : 'Expired'}</span> <span style="color:#555;font-size:10px">(${expTctDate} ${expTctStr} TCT)</span></div>`;
      } else {
        timerHtml = `<div class="ocm-timer" style="color:#555">⏸ No timer info</div>`;
      }

      // Planning progress: find the most recently-joined still-planning member
      const filledSlots   = ocSlots.filter(s => s.user);
      const inProgress    = filledSlots.filter(s => (s.user.progress ?? 100) < 100);
      const activePlanner = inProgress.length > 0
        ? inProgress.reduce((a, b) => (a.user.joined_at ?? 0) < (b.user.joined_at ?? 0) ? a : b)
        : null;

      const sortedSlots = [...ocSlots].sort((a, b) => {
        const pa = a.user ? (a.user.progress ?? 0) : -1;
        const pb = b.user ? (b.user.progress ?? 0) : -1;
        return pb - pa;
      });

      const slotsHtml = sortedSlots.map(slot => {
        const user       = slot.user;
        const userId     = user?.id ? String(user.id) : null;
        const member     = userId ? mInfo[userId] : null;
        const memberName = member
          ? `<a href="/profiles.php?XID=${userId}" target="_blank" style="color:#ccc;text-decoration:none">${member.name}</a>`
          : '<span style="color:#555">Open slot</span>';
        const slotStatusHtml = member
          ? statusIcon(member.status, member.description)
          : `<span class="ocm-slot-status status-open" title="No member assigned">✗</span>`;
        const cpr     = slot.checkpoint_pass_rate ?? null;
        const cprText = cpr != null ? `${cpr}%` : (userId ? '?' : '–');
        const cprCls  = cpr != null ? cprClass(cpr) : 'cpr-empty';
        const roleName = slot.position_info?.label || slot.position || 'Unknown role';

        let progressHtml = '';
        if (userId) {
          const progress  = user.progress ?? null;
          const isDone    = progress >= 100;
          const isActive  = activePlanner && slot.user?.id === activePlanner.user?.id;
          const pct       = Math.min(100, Math.max(0, progress ?? 0));
          const fillClass = isDone ? 'progress-done' : isActive ? 'progress-active' : 'progress-waiting';
          const tip       = isDone ? 'Planning complete' : isActive ? `Actively planning — ${pct.toFixed(1)}%` : `Waiting — ${pct.toFixed(1)}%`;
          progressHtml = `<div class="ocm-progress-wrap" title="${tip}"><div class="ocm-progress-fill ${fillClass}" style="width:${pct}%"></div></div>`;
        } else {
          progressHtml = `<div class="ocm-progress-wrap" title="No member assigned"><div class="ocm-progress-fill progress-waiting" style="width:0%"></div></div>`;
        }

        const req = slot.item_requirement;
        let itemBadge = '<span style="flex:0 0 22px;display:inline-block"></span>';
        if (req) {
          const st      = !userId ? 'open' : req.is_available ? 'ok' : armory[String(req.id)] ? 'armory' : 'missing';
          const name    = itemName(req);
          const isTool  = req.is_reusable ?? false;
          const tips    = { ok:'Has item', armory:'In armory — needs to loan', missing:'MISSING — needs sourcing', open:'Item needed when slot is filled' };
          const icons   = { ok:'✓', armory:'🏛', missing:'✗', open:'?' };
          const classes = { ok:'item-ok', armory:'item-armory', missing:'item-missing', open:'item-unknown' };
          const marketUrl = `https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=${req.id}`;
          const tipText  = `${tips[st]||''}\n${name}\n${isTool ? '🔧 Tool (reusable)' : '📦 Material (consumed)'}\nClick to open item market`;
          itemBadge = `<a class="ocm-item-tag ${classes[st]||'item-unknown'}" href="${marketUrl}" target="_blank" title="${tipText}">${icons[st]||'?'}${isTool?'🔧':'📦'}</a>`;
        }

        const weight   = getWeight(oc.name || '', roleName);
        let weightHtml = '<span class="ocm-slot-weight"></span>';
        if (weight != null) {
          const wCls = weight >= WEIGHT_HIGH ? 'w-high' : weight >= WEIGHT_MID ? 'w-mid' : 'w-low';
          weightHtml = `<span class="ocm-slot-weight ${wCls}" title="Role weight: ${weight.toFixed(1)}% — how much this role influences overall success">${weight.toFixed(0)}%</span>`;
        }

        const isRisk  = weight != null && weight >= WEIGHT_HIGH && cpr != null && cpr < CPR_WARN && userId;
        const riskCls = isRisk ? 'ocm-slot-risk' : '';
        const riskIcon = isRisk
          ? `<span title="⚠ High-weight role (${weight.toFixed(0)}%) with low CPR (${cpr}%) — significant risk to OC success" style="font-size:11px;cursor:help">⚠</span>`
          : '';

        // TornStats CPR for this member in this specific OC+role
        let tsCprHtml = '';
        if (userId && Object.keys(tsCprData).length > 0) {
          const tsResult = tsGetCpr(userId, oc.name || '', roleName);
          if (tsResult != null) {
            const tsCol = tsResult.cpr >= CPR_WARN ? 'var(--ocm-cpr-good)' : tsResult.cpr >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
            const label = tsResult.exact ? `TS:${tsResult.cpr}%` : `TS:~${tsResult.cpr}%`;
            const tip = tsResult.exact
              ? `TornStats CPR for ${roleName}: ${tsResult.cpr}%`
              : `TornStats CPR (approx — no exact role match): ${tsResult.cpr}%`;
            tsCprHtml = `<span class="ocm-ts-badge" style="color:${tsCol}" title="${tip}">${label}</span>`;
          }
        }

        return `
          <div class="ocm-slot ${riskCls}">
            ${slotStatusHtml}
            <span class="ocm-slot-role" title="${roleName}">${roleName}</span>
            <span class="ocm-slot-member">${memberName}</span>${tsCprHtml}
            ${progressHtml}
            ${riskIcon}
            ${itemBadge}
            ${weightHtml}
            <span class="ocm-slot-cpr ${cprCls}">${cprText}</span>
          </div>`;
      }).join('');

      const level = oc.difficulty ?? '?';
      card.innerHTML = `
        <div class="ocm-card-title">
          <span>${oc.name || `OC #${id}`}</span>
          <span class="ocm-badge ${badgeClass}">${badgeLabel}</span>
        </div>
        <div class="ocm-card-subtitle">Difficulty ${level} · ${slots.length} slots</div>
        ${timerHtml}
        <div class="ocm-slots">${slotsHtml}</div>
      `;
      targetGrid.appendChild(card);
    }

    // ── Available members (non-recruits, not in OC)
    const availTitle = document.getElementById('ocm-title-available');
    const avail      = document.getElementById('ocm-available');
    if (availTitle) {
      const mailLink = availTitle.querySelector('a');
      availTitle.textContent = `Members Available for Assignment (${freeMembers.length})`;
      if (mailLink) availTitle.appendChild(mailLink);
    }

    function fmtRelative(ts) {
      if (!ts) return null;
      const diff = now - ts;
      if (diff < 3600)      return { text: `${Math.floor(diff / 60)}m ago`,   cls: 'ocm-seen-recent' };
      if (diff < 86400)     return { text: `${Math.floor(diff / 3600)}h ago`,  cls: 'ocm-seen-recent' };
      if (diff < 86400 * 7) return { text: `${Math.floor(diff / 86400)}d ago`, cls: 'ocm-seen-day' };
      return { text: `${Math.floor(diff / 86400)}d ago`, cls: 'ocm-seen-old' };
    }

    function fmtOcRelative(ts) {
      if (!ts) return null;
      const diff = now - ts;
      if (diff < 43200)  return { text: `${diff < 3600 ? Math.floor(diff/60)+'m' : Math.floor(diff/3600)+'h'} ago`, cls: 'ocm-oc-recent' };
      if (diff < 86400)  return { text: `${Math.floor(diff / 3600)}h ago`, cls: 'ocm-oc-warn' };
      return { text: `${Math.floor(diff / 86400)}d ago`, cls: 'ocm-oc-old' };
    }

    /** For an available member, find their best-fit open slot across all recruiting OCs.
     *  Uses TornStats CPR for matching, falls back to role weight only.
     *  Returns { ocName, role, cpr, weight, difficulty, score } or null. */
    /** Score a single (member, openSlot) candidate. Higher = better fit. */
    function scoreSlotForMember(memberId, oc, ocId, slot) {
      const role     = slot.position_info?.label || slot.position || 'Unknown';
      const ocName   = oc.name || `OC #${ocId}`;
      const tsResult = tsGetCpr(memberId, ocName, role);
      const cpr      = tsResult ? tsResult.cpr : null;
      const exact    = tsResult ? tsResult.exact : false;
      const source   = tsResult ? tsResult.source : null;
      const weight   = getWeight(ocName, role);
      const diff     = Number(oc.difficulty) || 0;
      // Item requirement (if any) and whether the faction armory has it
      const req         = slot.item_requirement;
      const itemMissing = !!(req && req.is_available === false);
      const itemName    = req ? (itemNames[String(req.id)] || `Item #${req.id}`) : null;
      const eligible    = cpr != null && cpr >= CPR_WARN;
      const comfort     = eligible ? Math.max(0, (cpr - CPR_WARN) / (100 - CPR_WARN)) : 0;
      const weightBonus = (weight ?? 15) * comfort;
      // Slight score penalty if item is missing so a recommendation with
      // the item available is preferred over one without (other things equal).
      const itemPenalty = itemMissing ? 25 : 0;
      const score       = eligible
        ? diff * 1000 + weightBonus + cpr + (exact ? 50 : 0) - itemPenalty
        : (cpr != null ? -(100 - cpr) : -10000);
      return { ocName, ocId, role, cpr, weight, difficulty: oc.difficulty ?? '?', score, exact, eligible, source, itemMissing, itemName };
    }

    /** Build the global assignment of available members → unique open slots.
     *  Greedy: at each step pick the highest-scoring eligible (member, slot) pair,
     *  lock both, and repeat. A member can only be assigned one slot, and each
     *  slot only goes to one member. Members without an eligible match still
     *  get a fallback recommendation (their highest-scoring non-eligible slot)
     *  so they aren't left empty-handed.
     *  Returns Map<memberId, slotInfo>. */
    function buildBestSlotAssignment(memberIds) {
      // Collect all open slots
       const openSlots = [];
      for (const [ocId, oc] of Object.entries(crimes)) {
        if (!oc || (oc.status || '').toLowerCase() !== 'recruiting') continue;
        const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
        ocSlots.forEach((slot, slotIdx) => {
          if (slot.user?.id) return;
          openSlots.push({ ocId, oc, slot, slotKey: `${ocId}:${slotIdx}` });
        });
      }

      // Build all (member, slot) pairs with scores
      const pairs = [];
      for (const mid of memberIds) {
        for (const os of openSlots) {
          const info = scoreSlotForMember(mid, os.oc, os.ocId, os.slot);
          pairs.push({ memberId: mid, slotKey: os.slotKey, info });
        }
      }
      // Sort by score descending
      pairs.sort((a, b) => b.info.score - a.info.score);

      const assigned    = new Map();      // memberId → slotInfo (eligible match only)
      const usedSlots   = new Set();
      const usedMembers = new Set();

      // Pass 1: greedy assignment of eligible pairs only
      for (const p of pairs) {
        if (!p.info.eligible) break; // sorted desc — no more eligibles after first non-eligible
        if (usedMembers.has(p.memberId) || usedSlots.has(p.slotKey)) continue;
        assigned.set(p.memberId, p.info);
        usedMembers.add(p.memberId);
        usedSlots.add(p.slotKey);
      }

      // Pass 2: members with no eligible match — give them a fallback only if
      // we have SOME CPR signal for them. Members with zero data (new recruits,
      // no TornStats, no faction history) get nothing — better to flag them as
      // "needs to run an OC" than to invent a recommendation.
      for (const mid of memberIds) {
        if (assigned.has(mid)) continue;
        const myPairs = pairs.filter(p => p.memberId === mid && p.info.cpr != null);
        if (myPairs.length) assigned.set(mid, myPairs[0].info);
      }

      return assigned;
    }

    // Cache the assignment per render so repeat lookups are free
    let _bestSlotCache = null;
    function getBestSlotForMember(memberId) {
      if (!_bestSlotCache) {
        _bestSlotCache = buildBestSlotAssignment(freeMembers.map(m => m.id));
      }
      return _bestSlotCache.get(memberId) || null;
    }

    /** Render a members table into a target element. Used for both Available and Recruits.
     *  When showBestFit=true, adds a recommended-role column using TornStats CPR data. */
    function renderMembersTable(members, containerEl, extraClass = '', showBestFit = false) {
      if (members.length === 0) {
        containerEl.innerHTML = '<span style="color:#555;font-size:11px">None.</span>';
        return;
      }
      const sorted = [...members].sort((a, b) => {
        const ta = lastOc[a.id]?.executed_at ?? Infinity;
        const tb = lastOc[b.id]?.executed_at ?? Infinity;
        return ta - tb;
      });

      // Available members get a card layout with prominent best-fit recommendation.
      // Recruits/etc keep the compact table layout.
      if (showBestFit) {
        const cards = sorted.map(m => {
          const member  = Object.values(memberMap).find(x => String(x.id) === m.id);
          const lastTs  = member?.last_action?.timestamp ?? null;
          const seen    = fmtRelative(lastTs);
          const oc      = lastOc[m.id];
          const ocTs    = oc ? fmtOcRelative(oc.executed_at) : null;
          const best    = getBestSlotForMember(m.id);

          let recHtml;
          if (!best) {
            recHtml = `<div style="color:#667;font-size:11px;line-height:1.4">
              <span style="color:var(--ocm-cpr-warn);font-weight:bold">No CPR data yet</span>
              <span style="color:#556"> — run any OC once to build a personal baseline.</span>
            </div>`;
          } else {
            const cprCol = best.cpr == null ? '#445'
                          : best.cpr >= CPR_WARN ? 'var(--ocm-cpr-good)'
                          : best.cpr >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
            const cprTxt = best.cpr == null ? '?' : `${best.cpr}%`;
            const exactMark = best.exact ? '' : '~';
            const sourceTag = best.source === 'history'
              ? `<span style="font-size:9px;color:#778;background:#1c1810;border:1px solid #3a3018;padding:0 4px;border-radius:2px;margin-left:4px" title="From this member's faction OC history (no TornStats data)">hist</span>`
              : '';
            const itemWarn = best.itemMissing
              ? `<div style="font-size:10px;color:var(--ocm-cpr-crit);margin-top:3px;display:flex;align-items:center;gap:4px" title="Required item not available in faction armory. The slot still recommends this member but they (or the faction) need to source ${best.itemName} before initiation.">⚠ Item missing: <span style="color:#d8a070">${best.itemName}</span></div>`
              : '';
            recHtml = `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:12px;line-height:1.5">
              <span style="color:var(--ocm-link);font-size:9px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase">Best fit</span>
              <span style="color:#e0e0e0;font-weight:bold">${best.role}</span>
              <span style="color:#667;font-size:11px">in</span>
              <span style="color:#aac">${best.ocName}</span>
              <span style="color:#556;font-size:10px">D${best.difficulty}</span>
              <span style="color:${cprCol};font-weight:bold;margin-left:auto">${exactMark}${cprTxt}${sourceTag}</span>
            </div>${itemWarn}`;
          }

          const lastOcStr = oc
            ? `<span style="color:#778">${oc.name.length > 22 ? oc.name.slice(0, 20) + '…' : oc.name}</span> · <span class="${ocTs ? ocTs.cls : ''}">${ocTs ? ocTs.text : ''}</span>`
            : `<span style="color:#445;font-style:italic">No OC history</span>`;
          const seenStr = seen
            ? `<span class="${seen.cls}">${seen.text}</span>`
            : `<span style="color:#444">Unknown</span>`;

          return `<div class="ocm-mcard">
            <div class="ocm-mcard-head">
              <a href="/profiles.php?XID=${m.id}" target="_blank" class="ocm-mcard-name">${m.name}</a>
              <span class="ocm-mcard-seen">${seenStr}</span>
            </div>
            <div class="ocm-mcard-rec">${recHtml}</div>
            <div class="ocm-mcard-meta">${lastOcStr}</div>
          </div>`;
        }).join('');
        containerEl.innerHTML = `<div class="ocm-mcard-list">${cards}</div>`;
        return;
      }

      // Default compact table layout (Recruits, etc.)
      const rows = sorted.map(m => {
        const member     = Object.values(memberMap).find(x => String(x.id) === m.id);
        const lastTs     = member?.last_action?.timestamp ?? null;
        const seen       = fmtRelative(lastTs);
        const oc         = lastOc[m.id];
        const ocTs       = oc ? fmtOcRelative(oc.executed_at) : null;
        const nameCell   = `<a href="/profiles.php?XID=${m.id}" target="_blank" style="color:#ccc;text-decoration:none">${m.name}</a>`;
        const ocName     = oc ? (oc.name.length > 24 ? oc.name.slice(0, 22) + '…' : oc.name) : '';
        const ocAgeCell  = oc
          ? `<span class="${ocTs ? ocTs.cls : ''}">${ocTs ? ocTs.text : ''}</span>`
          : `<span class="ocm-lastoc-never">No record</span>`;
        const ocNameCell = oc ? `<span title="${oc.name}" style="color:#888">${ocName}</span>` : '';
        const seenCell   = seen
          ? `<span class="${seen.cls}">${seen.text}</span>`
          : `<span style="color:#444">Unknown</span>`;
        return `<tr>
          <td class="col-name">${nameCell}</td>
          <td class="col-oc">${ocNameCell}</td>
          <td class="col-ocage">${ocAgeCell}</td>
          <td class="col-seen">${seenCell}</td>
        </tr>`;
      }).join('');
      containerEl.innerHTML = `
        <table class="ocm-members-table ${extraClass}">
          <thead><tr>
            <th>Member</th>
            <th>Last OC</th><th></th><th>Last Online</th>
          </tr></thead>
          <tbody>${rows}</tbody></table>`;
    }

    if (freeMembers.length === 0) {
      avail.innerHTML = '<span style="color:#555;font-size:11px">All active members are assigned.</span>';
    } else {
      renderMembersTable(freeMembers, avail, '', true);
      injectTsBadges(avail);
    }
    // Build a map of live OC slot CPRs so the TornStats table can show a member's
    // ACTUAL current checkpoint pass rate (overriding the TornStats estimate) when
    // they're slotted in that crime+role right now.
    //   liveCprMap[uid][crimeNameLower][roleNoNumLower] = checkpoint_pass_rate
    const liveCprMap = {};
    for (const oc of Object.values(crimes)) {
      if (!oc || typeof oc !== 'object') continue;
      const ocKey = (oc.name || '').toLowerCase().trim();
      if (!ocKey) continue;
      const slots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      for (const slot of slots) {
        if (!slot?.user?.id) continue;
        const cpr = slot.checkpoint_pass_rate;
        if (cpr == null) continue;
        const uid     = String(slot.user.id);
        const roleKey = (slot.position_info?.label || slot.position || '').replace(/\s*#\d+$/, '').toLowerCase().trim();
        if (!roleKey) continue;
        if (!liveCprMap[uid]) liveCprMap[uid] = {};
        if (!liveCprMap[uid][ocKey]) liveCprMap[uid][ocKey] = {};
        // Keep the highest live CPR if a member somehow appears in the same role twice
        if (liveCprMap[uid][ocKey][roleKey] == null || cpr > liveCprMap[uid][ocKey][roleKey]) {
          liveCprMap[uid][ocKey][roleKey] = cpr;
        }
      }
    }
    renderTsCprSection(memberMap, liveCprMap);
    recordProfit(crimes, itemValues);
    renderProfitSection(crimes, itemValues, itemNames);

    // ── Newsletter button — build message with per-member recommendations
    const newsletterBtn = document.getElementById('ocm-newsletter-btn');
    if (newsletterBtn && !newsletterBtn._wired) {
      newsletterBtn._wired = true;
      newsletterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (freeMembers.length === 0) {
          alert('No available members to message.');
          return;
        }
        // Build per-member recommendation list
        const lines = [];
        lines.push('Hey team — we have open OC slots that need filling. Here are the best fits based on your CPR:');
        lines.push('');
        const sorted = [...freeMembers].sort((a, b) => a.name.localeCompare(b.name));
        let withRecs = 0;
        for (const m of sorted) {
          const best = getBestSlotForMember(m.id);
          if (best && best.cpr != null) {
            const cprTxt = best.exact ? `${best.cpr}%` : `~${best.cpr}%`;
            lines.push(`• ${m.name}: ${best.role} in ${best.ocName} (D${best.difficulty}, CPR ${cprTxt})`);
            withRecs++;
          } else {
            lines.push(`• ${m.name}: no CPR data yet — please join any OC you're eligible for to build a baseline`);
          }
        }
        lines.push('');
        lines.push('Please join your recommended slot when you can. Thanks!');
        const message = lines.join('\n');

        // Copy to clipboard
        const opened = () => window.open('https://www.torn.com/factions.php?step=your#/tab=controls&option=newsletter&target=notInOC', '_blank');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(message).then(() => {
            alert(`✓ Message copied to clipboard (${withRecs} members with recommendations).\nOpening newsletter page — paste into the message body.`);
            opened();
          }).catch(() => {
            // Fallback if clipboard API blocked
            const ta = document.createElement('textarea');
            ta.value = message;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch(_) {}
            ta.remove();
            alert(`✓ Message copied (${withRecs} members with recommendations).\nOpening newsletter page — paste into the message body.`);
            opened();
          });
        } else {
          // Old browser fallback
          const ta = document.createElement('textarea');
          ta.value = message;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch(_) {}
          ta.remove();
          alert(`✓ Message copied (${withRecs} members with recommendations).\nOpening newsletter page — paste into the message body.`);
          opened();
        }
      });
    }

    // ── Recruits section
    const recruitsEl    = document.getElementById('ocm-recruits');
    const recruitsTitle = document.getElementById('ocm-title-recruits');
    if (recruitsTitle) recruitsTitle.textContent = `🚧 Recruits — cannot join OCs (${freeRecruits.length})`;
    if (freeRecruits.length === 0) {
      recruitsEl.innerHTML = '<span style="color:#555;font-size:11px">No recruits currently unassigned.</span>';
    } else {
      const notice = document.createElement('div');
      notice.className = 'ocm-recruits-notice';
      notice.innerHTML = 'Members listed here hold the <strong>Recruit</strong> rank and are not yet eligible to participate in Organised Crimes.';
      recruitsEl.innerHTML = '';
      recruitsEl.appendChild(notice);
      const tbl = document.createElement('div');
      renderMembersTable(freeRecruits, tbl, 'recruits-table');
      recruitsEl.appendChild(tbl);
    }

    // ── Blocked members (in OC + jail/hospital/abroad)
    const blockedEl    = document.getElementById('ocm-blocked');
    const blockedTitle = document.getElementById('ocm-title-blocked');
    const allBlocked   = [];
    for (const m of Object.values(memberMap)) {
      const mid = String(m.id);
      if (!assignedIds.has(mid) || !isBlocked(m.status?.state)) continue;
      let ocName = null, ocExecutesAt = null;
      for (const oc of Object.values(crimes)) {
        if (!oc?.slots) continue;
        const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots);
        if (!ocSlots.some(s => s.user?.id && String(s.user.id) === mid)) continue;
        ocName = oc.name || `OC #${oc.id}`;
        const exAt = oc.executed_at ?? oc.ready_at ?? null;
        ocExecutesAt = exAt && exAt > now ? exAt : null;
        break;
      }
      allBlocked.push({ id: mid, name: m.name, status: m.status?.state, description: m.status?.description || '', ocName, ocExecutesAt });
    }
    if (blockedTitle) blockedTitle.textContent = `Blocked Members — In OC (${allBlocked.length})`;
    allBlocked.sort((a, b) => {
      if (a.ocExecutesAt && b.ocExecutesAt) return a.ocExecutesAt - b.ocExecutesAt;
      if (a.ocExecutesAt) return -1;
      if (b.ocExecutesAt) return 1;
      return 0;
    });
    if (allBlocked.length === 0) {
      blockedEl.innerHTML = '<span style="color:#555;font-size:11px">No blocked members. ✓</span>';
    } else {
      blockedEl.innerHTML = allBlocked.map(m => {
        const s           = (m.status || '').toLowerCase();
        let statusLabel;
        if (s === 'abroad' || s === 'traveling') {
          statusLabel = travelInfo(m.status, m.description).label;
        } else {
          statusLabel = m.status || 'Unknown';
        }
        const ocLabel = m.ocName
          ? `<span class="ocm-blocked-oc" title="OC: ${m.ocName}">${m.ocName}</span>`
          : '<span class="ocm-blocked-oc"></span>';
        const countdownLabel = m.ocExecutesAt
          ? `<span class="ocm-blocked-timer ocm-time" data-until="${m.ocExecutesAt}">${fmtTime(m.ocExecutesAt - now)}</span>`
          : `<span class="ocm-blocked-timer notimer">No timer</span>`;
        return `
          <div class="ocm-blocked-row">
            <a class="ocm-blocked-name" href="/profiles.php?XID=${m.id}" target="_blank">${m.name}</a>
            <span class="ocm-blocked-status" title="${m.description || m.status}">${statusLabel}</span>
            ${ocLabel}
            ${countdownLabel}
          </div>`;
      }).join('');
    }

    // ── Low CPR members
    const lowCprEl    = document.getElementById('ocm-lowcpr');
    const lowCprTitle = document.getElementById('ocm-title-lowcpr');
    const lowCprRows  = [];

    for (const [ocId, oc] of Object.entries(crimes)) {
      if (!oc || typeof oc !== 'object') continue;
      const phase = (oc.status || '').toLowerCase();
      if (!ACTIVE.has(phase)) continue;
      const ocName = oc.name || `OC #${ocId}`;
      const slots  = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      for (const slot of slots) {
        const uid = slot.user?.id ? String(slot.user.id) : null;
        if (!uid) continue;
        const cpr = slot.checkpoint_pass_rate ?? null;
        if (cpr === null || cpr >= CPR_WARN) continue;
        const roleName = slot.position_info?.label || slot.position || 'Unknown role';
        const weight   = getWeight(ocName, roleName);
        const isRisk   = weight != null && weight >= WEIGHT_HIGH;
        lowCprRows.push({ uid, name: mInfo[uid]?.name || `#${uid}`, cpr, roleName, ocName, weight, isRisk });
      }
    }

    lowCprRows.sort((a, b) => a.cpr - b.cpr || (b.weight ?? 0) - (a.weight ?? 0));
    if (lowCprTitle) lowCprTitle.textContent = `⚠ Low CPR Members — below ${CPR_WARN}% (${lowCprRows.length})`;

    if (lowCprRows.length === 0) {
      lowCprEl.innerHTML = '<span style="color:#555;font-size:11px">No members with low CPR. ✓</span>';
    } else {
      lowCprEl.innerHTML = lowCprRows.map(r => {
        const cprCls     = r.cpr < CPR_CRIT ? 'cpr-crit' : 'cpr-warn';
        const weightHtml = r.weight != null
          ? `<span class="ocm-slot-weight ${r.weight >= WEIGHT_HIGH ? 'w-high' : r.weight >= WEIGHT_MID ? 'w-mid' : 'w-low'}" title="Role weight: ${r.weight.toFixed(1)}%">${r.weight.toFixed(0)}%</span>`
          : '';
        const riskBadge = r.isRisk
          ? `<span title="High-weight role (${r.weight.toFixed(0)}%) with low CPR — significant risk" style="font-size:11px;cursor:help">⚠</span>`
          : '';
        return `
          <div class="ocm-lowcpr-row">
            <a class="ocm-lowcpr-name" href="/profiles.php?XID=${r.uid}" target="_blank">${r.name}</a>
            <span class="ocm-lowcpr-oc" title="${r.ocName}">${r.ocName}</span>
            <span class="ocm-lowcpr-role" title="${r.roleName}">${r.roleName}</span>
            <span class="ocm-lowcpr-extras">${weightHtml}${riskBadge}</span>
            <span class="ocm-slot-cpr ${cprCls} ocm-lowcpr-cpr">${r.cpr}%</span>
          </div>`;
      }).join('');
    }

    // ── Underutilized members: in a low-difficulty OC but could clear a harder one
    // For each member currently assigned to an OC, compare their current OC's
    // difficulty against the highest-difficulty *recruiting* OC where they'd
    // still meet the CPR warn threshold (estimated via TornStats / OC history).
    // If a meaningfully harder OC is available, flag them as underutilized.
    const overEl    = document.getElementById('ocm-overqualified');
    const overTitle = document.getElementById('ocm-title-overqualified');
    const overRows  = [];

    // Build the set of difficulties currently recruiting (with at least one open slot)
    // mapped to a representative open OC name + role per difficulty.
    const recruitingOpenByDiff = {};
    for (const [ocId, oc] of Object.entries(crimes)) {
      if (!oc || (oc.status || '').toLowerCase() !== 'recruiting') continue;
      const diff   = Number(oc.difficulty) || 0;
      const ocName = oc.name || `OC #${ocId}`;
      const slots  = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      for (const slot of slots) {
        if (slot?.user?.id) continue; // only open slots
        const role = slot.position_info?.label || slot.position || 'Unknown';
        if (!recruitingOpenByDiff[diff]) recruitingOpenByDiff[diff] = [];
        recruitingOpenByDiff[diff].push({ ocName, role, difficulty: diff });
      }
    }
    const recruitingDiffs = Object.keys(recruitingOpenByDiff).map(Number).sort((a, b) => b - a); // high → low

    // For each filled slot in an active OC, see if a harder recruiting OC fits
    for (const [ocId, oc] of Object.entries(crimes)) {
      if (!oc || typeof oc !== 'object') continue;
      const phase = (oc.status || '').toLowerCase();
      if (!ACTIVE.has(phase)) continue;
      const curDiff = Number(oc.difficulty) || 0;
      const ocName  = oc.name || `OC #${ocId}`;
      const slots   = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);

      for (const slot of slots) {
        const uid = slot?.user?.id ? String(slot.user.id) : null;
        if (!uid) continue;
        const curCpr = slot.checkpoint_pass_rate ?? null;
        // Only consider members performing WELL in their current OC (>= warn).
        // A struggling member belongs in the Low CPR section, not here.
        if (curCpr === null || curCpr < CPR_WARN) continue;
        const curRole = slot.position_info?.label || slot.position || 'Unknown';

        // Find the highest-difficulty recruiting OC where this member would still
        // clear the warn threshold, strictly harder than their current OC.
        // CRITICAL: only trust an EXACT estimate — real TornStats data or personal
        // history for that specific crime+role. Fuzzy/overall-lowest fallbacks
        // (the "~" estimates) are not reliable predictions of a brand-new role at
        // a much higher difficulty, so they're rejected here to avoid suggesting
        // everyone could run the hardest OC in the game.
        let bestUpgrade = null;
        for (const hd of recruitingDiffs) {
          if (hd <= curDiff) break; // sorted desc — nothing harder left
          for (const cand of recruitingOpenByDiff[hd]) {
            const est = tsGetCpr(uid, cand.ocName, cand.role);
            // Require an exact match (TornStats exact, or personal history exact)
            if (est && est.exact && est.cpr >= CPR_WARN) {
              bestUpgrade = { ...cand, estCpr: est.cpr, exact: est.exact, source: est.source };
              break;
            }
          }
          if (bestUpgrade) break;
        }
        if (!bestUpgrade) continue;

        overRows.push({
          uid, name: mInfo[uid]?.name || `#${uid}`,
          curOc: ocName, curDiff, curRole, curCpr,
          upOc: bestUpgrade.ocName, upDiff: bestUpgrade.difficulty, upRole: bestUpgrade.role,
          upCpr: bestUpgrade.estCpr, upExact: bestUpgrade.exact, upSource: bestUpgrade.source,
          gain: bestUpgrade.difficulty - curDiff,
        });
      }
    }

    // Sort by biggest difficulty jump, then by current performance
    overRows.sort((a, b) => b.gain - a.gain || b.curCpr - a.curCpr);
    if (overTitle) overTitle.textContent = `⬆ Underutilized — could run a harder OC (${overRows.length})`;

    if (overRows.length === 0) {
      overEl.innerHTML = '<span style="color:#555;font-size:11px">No underutilized members — everyone is in an appropriately challenging OC. ✓</span>';
    } else {
      overEl.innerHTML = overRows.map(r => {
        const upCprCls = r.upCpr >= CPR_WARN ? 'cpr-good' : r.upCpr >= CPR_CRIT ? 'cpr-warn' : 'cpr-crit';
        const srcTag = r.upSource === 'history'
          ? `<span style="font-size:9px;color:#778;background:#1c1810;border:1px solid #3a3018;padding:0 4px;border-radius:2px;margin-left:3px" title="Estimate from this member's OC history">hist</span>`
          : '';
        return `
          <div class="ocm-lowcpr-row" title="${r.name} is doing well in a D${r.curDiff} OC and has real data showing they can clear a D${r.upDiff} OC">
            <a class="ocm-lowcpr-name" href="/profiles.php?XID=${r.uid}" target="_blank">${r.name}</a>
            <span class="ocm-lowcpr-oc">
              <span style="color:#778">D${r.curDiff}</span>
              <span style="color:var(--ocm-cpr-good);font-weight:bold">${r.curCpr}%</span>
              <span style="color:#445">→</span>
              <span style="color:var(--ocm-link);font-weight:bold">D${r.upDiff}</span>
            </span>
            <span class="ocm-lowcpr-role" title="${r.upOc} · ${r.upRole}">${r.upRole} in ${r.upOc}</span>
            <span class="ocm-lowcpr-extras"><span class="ocm-badge" title="+${r.gain} difficulty levels">+${r.gain}</span></span>
            <span class="ocm-slot-cpr ${upCprCls} ocm-lowcpr-cpr" title="Known CPR at D${r.upDiff}">${r.upCpr}%${srcTag}</span>
          </div>`;
      }).join('');
    }

    // ── Analytics section
    const analyticsEl    = document.getElementById('ocm-analytics');
    const analyticsTitle = document.getElementById('ocm-title-analytics');

    /** Normalise OC status to 'successful' | 'failure' | 'expired' | null */
    function normStatus(raw) {
      const s = (raw || '').toLowerCase().trim();
      if (s === 'successful' || s === 'success') return 'successful';
      if (s === 'failure'    || s === 'failed'  || s === 'fail') return 'failure';
      if (s === 'expired'    || s === 'expire')  return 'expired';
      return null;
    }

    /**
     * Normalise OC name for grouping — strip diacritics, version suffixes (V1/V2),
     * and lowercase. Used as the key for scenarioStats and heatmap data.
     */
    function normOcName(raw) {
      return (raw || 'Unknown')
        .trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+[Vv]\d+$/, '')
        .trim();
    }

    const completed = Object.values(crimes).filter(oc => oc && normStatus(oc.status) !== null);
    const successes = completed.filter(oc => normStatus(oc.status) === 'successful');
    const failures  = completed.filter(oc => normStatus(oc.status) === 'failure');
    const expired   = completed.filter(oc => normStatus(oc.status) === 'expired');
    const total     = completed.length;

    if (analyticsTitle) analyticsTitle.textContent = `📊 Analytics — ${total} completed OCs`;

    // Per-scenario stats — keyed by normOcName()
    const scenarioStats = {};
    for (const oc of completed) {
      const key = normOcName(oc.name);
      if (!scenarioStats[key]) scenarioStats[key] = { success: 0, failure: 0, expired: 0, total: 0 };
      const s = normStatus(oc.status);
      scenarioStats[key].total++;
      if (s === 'successful') scenarioStats[key].success++;
      else if (s === 'failure') scenarioStats[key].failure++;
      else scenarioStats[key].expired++;
    }

    // Per-member stats
    const memberStats = {};
    for (const oc of completed) {
      const s = normStatus(oc.status);
      const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      for (const slot of ocSlots) {
        const uid = slot.user?.id ? String(slot.user.id) : null;
        if (!uid) continue;
        if (!memberStats[uid]) {
          const name = mInfo[uid]?.name || exMemberNames[uid] || `#${uid}`;
          const isEx = !mInfo[uid];
          memberStats[uid] = { name, isEx, participated: 0, success: 0, failure: 0, cprSum: 0, cprCount: 0 };
        }
        memberStats[uid].participated++;
        if (s === 'successful') memberStats[uid].success++;
        else if (s === 'failure') memberStats[uid].failure++;
        const cpr = slot.checkpoint_pass_rate ?? null;
        if (cpr != null) { memberStats[uid].cprSum += cpr; memberStats[uid].cprCount++; }
      }
    }

    const memberRows = Object.entries(memberStats)
      .map(([uid, s]) => ({ uid, ...s, avgCpr: s.cprCount > 0 ? s.cprSum / s.cprCount : null, rate: (s.success + s.failure) > 0 ? s.success / (s.success + s.failure) : 0 }))
      .sort((a, b) => b.participated - a.participated);

    const scenarioRows = Object.entries(scenarioStats)
      .map(([name, s]) => ({ name, ...s, rate: (s.success + s.failure) > 0 ? s.success / (s.success + s.failure) : 0 }))
      .sort((a, b) => b.total - a.total);

    function rateCls(r) { return r >= 0.85 ? 'ocm-rate-high' : r >= 0.65 ? 'ocm-rate-mid' : 'ocm-rate-low'; }
    function pct(r)     { return `${Math.round(r * 100)}%`; }

    const overallRate = (successes.length + failures.length) > 0 ? successes.length / (successes.length + failures.length) : 0;

    // --- Last 5 completed OCs (sorted most-recent first)
    const last5 = [...completed]
      .sort((a, b) => (b.executed_at || 0) - (a.executed_at || 0))
      .slice(0, 5);

    const last5Html = last5.map((oc, idx) => {
      const s        = normStatus(oc.status);
      const icon     = s === 'successful' ? '✅' : '❌';
      const col      = s === 'successful' ? 'var(--ocm-cpr-good)' : 'var(--ocm-cpr-crit)';
      const ocSlots  = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      const filled   = ocSlots.filter(sl => sl.user?.id);
      const avgCpr   = filled.length > 0
        ? (filled.reduce((a, sl) => a + (sl.checkpoint_pass_rate ?? 0), 0) / filled.length).toFixed(1)
        : null;
      const execDate = oc.executed_at
        ? new Date(oc.executed_at * 1000).toLocaleDateString('en-GB', { timeZone:'UTC', day:'2-digit', month:'short', year:'2-digit' })
        : '–';
      const rewards    = oc.rewards;
      const money      = rewards?.money ?? null;
      const respect    = rewards?.respect ?? null;
      const paid       = rewards?.paid ?? rewards?.is_paid ?? null;
      const paidBadge  = paid === true
        ? `<span style="font-size:9px;background:#14201a;color:var(--ocm-cpr-good);border-radius:3px;padding:1px 4px;margin-left:4px">Paid ✓</span>`
        : paid === false
          ? `<span style="font-size:9px;background:#1c1410;color:var(--ocm-cpr-crit);border-radius:3px;padding:1px 4px;margin-left:4px">Unpaid</span>`
          : '';
      const rewardParts = [];
      if (money && Number(money) > 0) rewardParts.push(`💰 $${Number(money).toLocaleString()}`);
      if (respect && Number(respect) > 0) rewardParts.push(`⭐ ${respect} resp`);

      // Per-member detail rows for the expandable section
      const memberDetailRows = filled.map(sl => {
        const uid  = String(sl.user.id);
        const name = mInfo[uid]?.name || exMemberNames[uid] || `#${uid}`;
        const role = sl.position_info?.label || sl.position || '?';
        const cpr  = sl.checkpoint_pass_rate ?? null;
        const w    = getWeight(oc.name || '', role);
        const cprCol = cpr == null ? '#555' : cpr >= CPR_WARN ? 'var(--ocm-cpr-good)' : cpr >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
        const wCol   = w   == null ? '#555' : w >= WEIGHT_HIGH ? 'var(--ocm-cpr-warn)' : w >= WEIGHT_MID ? '#aaa' : '#555';
        return `<tr>
          <td><a href="/profiles.php?XID=${uid}" target="_blank" style="color:#ccc;text-decoration:none">${name}</a></td>
          <td style="color:#777;text-align:right">${role}</td>
          <td style="text-align:right;font-weight:bold;color:${cprCol}">${cpr != null ? cpr+'%' : '–'}</td>
          <td style="text-align:right;font-weight:bold;color:${wCol}">${w != null ? w.toFixed(0)+'%' : '–'}</td>
        </tr>`;
      }).join('');

      return `
        <div class="ocm-last5-row-header" data-idx="${idx}" style="border-left:3px solid ${col}">
          <span style="color:${col};font-size:13px">${icon}</span>
          <span style="font-weight:bold;color:#e0e0e0;flex:1">${oc.name || 'Unknown'}</span>
          <span style="color:#666;font-size:10px">D${oc.difficulty ?? '?'}</span>
          <span style="color:#888;font-size:10px">${execDate}</span>
          ${avgCpr ? `<span style="font-size:10px;color:#aaa">CPR: <strong class="${cprClass(Number(avgCpr))}">${avgCpr}%</strong></span>` : ''}
          ${paidBadge}
          ${rewardParts.length ? `<span style="font-size:10px;color:#99a">${rewardParts.join(' ')}</span>` : ''}
          <span style="color:#555;font-size:10px">▼</span>
        </div>
        <div class="ocm-last5-detail" id="ocm-last5-detail-${idx}">
          <table>
            <thead><tr style="font-size:9px;color:#555"><th>Member</th><th style="text-align:right">Role</th><th style="text-align:right">CPR</th><th style="text-align:right">Wt</th></tr></thead>
            <tbody>${memberDetailRows || '<tr><td colspan="4" style="color:#555;font-style:italic">No member data</td></tr>'}</tbody>
          </table>
        </div>`;
    }).join('');

    analyticsEl.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;align-items:stretch">
        <div style="background:#1e1e1e;border:1px solid #2e2e2e;border-radius:6px;padding:8px 14px;text-align:center;min-width:90px">
          <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.5px">Success Rate</div>
          <div style="font-size:22px;font-weight:bold" class="${rateCls(overallRate)}">${pct(overallRate)}</div>
          <div style="font-size:10px;color:#555">${successes.length}S / ${failures.length}F / ${expired.length}E</div>
        </div>
        <div style="background:#1e1e1e;border:1px solid #2e2e2e;border-radius:6px;padding:8px 14px;text-align:center;min-width:80px">
          <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.5px">OCs Analysed</div>
          <div style="font-size:22px;font-weight:bold;color:var(--ocm-link)">${total}</div>
          <div style="font-size:10px;color:#555">of 100 cap</div>
        </div>
      </div>

      <div id="ocm-last5-wrap">
        <button id="ocm-last5-toggle">📋 Last 5 Completed OCs ▼</button>
        <div id="ocm-last5-body">
          ${last5.length === 0
            ? '<div style="color:#555;font-size:11px;padding:6px">No completed OCs found.</div>'
            : last5Html}
        </div>
      </div>

      <div class="ocm-analytics-grid">
        <div class="ocm-analytics-card">
          <h4>By Scenario</h4>
          <table class="ocm-analytics-table">
            <thead><tr><th>OC</th><th class="td-right">Ran</th><th class="td-right">Success%</th><th class="td-right ocm-sfe-col">S/F/E</th></tr></thead>
            <tbody>${scenarioRows.map(r => {
              const activeRate = (r.success + r.failure) > 0 ? r.success / (r.success + r.failure) : 0;
              return `<tr>
                <td title="${r.name}">${r.name}</td>
                <td class="td-right">${r.total}</td>
                <td class="td-right ${rateCls(activeRate)}">${pct(activeRate)}</td>
                <td class="td-right ocm-sfe-col" style="font-size:10px">
                  <span class="ocm-stat-pill pill-success">${r.success}</span>
                  <span class="ocm-stat-pill pill-failure">${r.failure}</span>
                  <span class="ocm-stat-pill pill-expired">${r.expired}</span>
                </td>
              </tr>`;}).join('')}
            </tbody>
          </table>
        </div>
        <div class="ocm-analytics-card">
          <h4>By Member</h4>
          <table class="ocm-analytics-table">
            <thead><tr><th>Member</th><th class="td-right">OCs</th><th class="td-right">Success%</th><th class="td-right">Avg CPR</th></tr></thead>
            <tbody>${memberRows.map(r => `
              <tr${r.isEx ? ' style="opacity:.5"' : ''}>
                <td><a href="/profiles.php?XID=${r.uid}" target="_blank" style="color:${r.isEx?'#888':'#ccc'};text-decoration:none">${r.name}</a>${r.isEx?'<span style="font-size:9px;color:#555;margin-left:3px">(left)</span>':''}</td>
                <td class="td-right">${r.participated}</td>
                <td class="td-right ${rateCls(r.rate)}">${pct(r.rate)}</td>
                <td class="td-right ${r.avgCpr != null ? cprClass(r.avgCpr) : ''}">${r.avgCpr != null ? r.avgCpr.toFixed(1)+'%' : '–'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="ocm-analytics-card" style="grid-column:1/-1">
          <h4>Success Rate Over Time <button class="ocm-chart-toggle" data-target="ocm-chart-timeline">Show Chart</button></h4>
          <div id="ocm-chart-timeline" class="ocm-chart-wrap"></div>
        </div>
        <div class="ocm-analytics-card" style="grid-column:1/-1">
          <h4>Success Rate by Scenario <button class="ocm-chart-toggle" data-target="ocm-chart-scenario">Show Chart</button></h4>
          <div id="ocm-chart-scenario" class="ocm-chart-wrap"></div>
        </div>
        <div class="ocm-analytics-card" style="grid-column:1/-1">
          <h4>CPR Distribution <button class="ocm-chart-toggle" data-target="ocm-chart-cpr">Show Chart</button></h4>
          <div id="ocm-chart-cpr" class="ocm-chart-wrap"></div>
        </div>
        <div class="ocm-analytics-card" style="grid-column:1/-1">
          <h4>Member Participation &amp; Success Rate <button class="ocm-chart-toggle" data-target="ocm-chart-members">Show Chart</button></h4>
          <div id="ocm-chart-members" class="ocm-chart-wrap"></div>
        </div>
        <div class="ocm-analytics-card" style="grid-column:1/-1">
          <h4>Member × Scenario Heatmap <button class="ocm-chart-toggle" data-target="ocm-heatmap">Show Chart</button></h4>
          <div id="ocm-heatmap" class="ocm-chart-wrap" style="overflow-x:auto"></div>
        </div>
      </div>

      <div id="ocm-member-history-wrap">
        <h4>👤 Member OC History</h4>
        <div id="ocm-mh-search-wrap">
          <input id="ocm-mh-search" type="text" placeholder="Search member name…" autocomplete="off" />
          <div id="ocm-mh-dropdown"></div>
          <button id="ocm-mh-clear">✕ Clear</button>
        </div>
        <div id="ocm-mh-summary" style="display:none"></div>
        <div id="ocm-mh-table-wrap">
          <div id="ocm-mh-empty">Type a member name above to view their OC history.</div>
        </div>
      </div>

      <div id="ocm-oc-history-wrap">
        <h4>🗂 OC Scenario History</h4>
        <div id="ocm-oh-search-wrap">
          <input id="ocm-oh-search" type="text" placeholder="Search OC name… (e.g. Sneaky Git Grab)" autocomplete="off" />
          <div id="ocm-oh-dropdown"></div>
          <button id="ocm-oh-clear">✕ Clear</button>
        </div>
        <div id="ocm-oh-summary" style="display:none"></div>
        <div id="ocm-oh-table-wrap">
          <div id="ocm-oh-empty">Type an OC name above to view all runs of that scenario.</div>
        </div>
      </div>`;

    // Wire Last 5 expand/collapse toggle
    document.getElementById('ocm-last5-toggle').addEventListener('click', () => {
      const body = document.getElementById('ocm-last5-body');
      const btn  = document.getElementById('ocm-last5-toggle');
      const open = body.style.display === 'block';
      body.style.display = open ? 'none' : 'block';
      btn.textContent = `📋 Last 5 Completed OCs ${open ? '▼' : '▲'}`;
    });

    // Wire per-row expand/collapse in the Last 5 table
    analyticsEl.querySelectorAll('.ocm-last5-row-header').forEach(header => {
      header.addEventListener('click', () => {
        const idx    = header.dataset.idx;
        const detail = document.getElementById(`ocm-last5-detail-${idx}`);
        if (!detail) return;
        const isOpen = detail.style.display === 'block';
        detail.style.display = isOpen ? 'none' : 'block';
        const arrow = header.querySelector('span:last-child');
        if (arrow) arrow.textContent = isOpen ? '▼' : '▲';
      });
    });

    // ── Member OC History — search and render logic

    /**
     * Build a per-member history index from the completed OC list.
     * Each entry: { ocName, difficulty, role, weight, cpr, outcome, executedAt, respect }
     * Sorted newest-first within each member's array.
     */
    const memberHistoryIndex = {};
    for (const oc of completed) {
      const s       = normStatus(oc.status);
      const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      // Total respect from the OC rewards object (shared pot — not split per member)
      const respect = oc.rewards?.respect ?? null;
      for (const slot of ocSlots) {
        const uid = slot.user?.id ? String(slot.user.id) : null;
        if (!uid) continue;
        const name = mInfo[uid]?.name || exMemberNames[uid] || `#${uid}`;
        if (!memberHistoryIndex[uid]) memberHistoryIndex[uid] = { name, entries: [] };
        const role   = slot.position_info?.label || slot.position || '?';
        const weight = getWeight(oc.name || '', role);
        memberHistoryIndex[uid].entries.push({
          ocName:     oc.name || 'Unknown',
          difficulty: oc.difficulty ?? '?',
          role,
          weight,
          cpr:        slot.checkpoint_pass_rate ?? null,
          outcome:    s,
          executedAt: oc.executed_at ?? null,
          respect,
        });
      }
    }
    // Sort each member's entries newest-first
    for (const uid of Object.keys(memberHistoryIndex)) {
      memberHistoryIndex[uid].entries.sort((a, b) => (b.executedAt || 0) - (a.executedAt || 0));
    }

    // Build sorted list of all member names for autocomplete
    const mhAllMembers = Object.values(memberHistoryIndex)
      .map(m => ({ uid: Object.keys(memberHistoryIndex).find(k => memberHistoryIndex[k] === m), name: m.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    /** Render the history table and summary stats for a given uid. */
    function renderMemberHistory(uid) {
      const record    = memberHistoryIndex[uid];
      const summaryEl = document.getElementById('ocm-mh-summary');
      const tableWrap = document.getElementById('ocm-mh-table-wrap');
      if (!record || record.entries.length === 0) {
        summaryEl.style.display = 'none';
        tableWrap.innerHTML = `<div id="ocm-mh-empty">No completed OC history found for this member in the last 100 OCs.</div>`;
        return;
      }

      const entries   = record.entries;
      const total     = entries.length;
      const successes = entries.filter(e => e.outcome === 'successful').length;
      const rate      = total > 0 ? Math.round(successes / total * 100) : 0;
      const cprs      = entries.filter(e => e.cpr != null).map(e => e.cpr);
      const avgCpr    = cprs.length > 0 ? (cprs.reduce((a, b) => a + b, 0) / cprs.length).toFixed(1) : null;

      // Most-played role
      const roleCounts = {};
      for (const e of entries) roleCounts[e.role] = (roleCounts[e.role] || 0) + 1;
      const topRole = Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

      const rateCol = rate >= 85 ? 'var(--ocm-cpr-good)' : rate >= 65 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';

      // Summary bar
      summaryEl.style.display = 'flex';
      summaryEl.innerHTML = `
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">OCs</span>
          <span class="ocm-mh-sum-value">${total}</span>
        </div>
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">Success Rate</span>
          <span class="ocm-mh-sum-value" style="color:${rateCol}">${rate}%</span>
        </div>
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">Avg CPR</span>
          <span class="ocm-mh-sum-value ${avgCpr != null ? cprClass(Number(avgCpr)) : ''}">${avgCpr != null ? avgCpr + '%' : '—'}</span>
        </div>
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">Most Played Role</span>
          <span class="ocm-mh-sum-value" style="font-size:11px;padding-top:2px">${topRole}</span>
        </div>`;

      // History table
      const rows = entries.map(e => {
        const dateStr   = e.executedAt
          ? new Date(e.executedAt * 1000).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: '2-digit' })
          : '—';
        const cprStr    = e.cpr != null ? `${e.cpr}%` : '—';
        const cprCls    = e.cpr != null ? cprClass(e.cpr) : '';
        const wStr      = e.weight != null ? `${e.weight.toFixed(0)}%` : '—';
        const wCls      = e.weight != null ? (e.weight >= WEIGHT_HIGH ? 'w-high' : e.weight >= WEIGHT_MID ? 'w-mid' : 'w-low') : '';
        // Respect — only shown on successful OCs; dim/dash on failure or expired
        const respStr   = (e.outcome === 'successful' && e.respect != null) ? `${e.respect}` : '—';
        const respStyle = (e.outcome === 'successful' && e.respect != null) ? '' : 'color:#333';
        const outIcon   = e.outcome === 'successful' ? '✅' : e.outcome === 'failure' ? '❌' : '⏰';
        const outCls    = e.outcome === 'successful' ? 'ocm-mh-outcome-success' : e.outcome === 'failure' ? 'ocm-mh-outcome-failure' : 'ocm-mh-outcome-expired';
        const outText   = e.outcome === 'successful' ? 'Success' : e.outcome === 'failure' ? 'Failure' : 'Expired';
        return `<tr>
          <td class="col-date">${dateStr}</td>
          <td class="col-oc" title="${e.ocName}">${e.ocName}</td>
          <td class="col-diff">D${e.difficulty}</td>
          <td class="col-role" title="${e.role}">${e.role}</td>
          <td class="col-weight ocm-slot-weight ${wCls}">${wStr}</td>
          <td class="col-cpr ${cprCls}">${cprStr}</td>
          <td class="col-respect" style="${respStyle}">${respStr}</td>
          <td class="col-outcome ${outCls}">${outIcon} ${outText}</td>
        </tr>`;
      }).join('');

      tableWrap.innerHTML = `
        <table class="ocm-mh-table">
          <thead><tr>
            <th class="col-date">Date</th>
            <th class="col-oc">OC Name</th>
            <th class="col-diff" style="text-align:center">Diff</th>
            <th class="col-role">Role</th>
            <th class="col-weight" style="text-align:right">Weight</th>
            <th class="col-cpr" style="text-align:right">CPR</th>
            <th class="col-respect" style="text-align:right">Respect</th>
            <th class="col-outcome" style="padding-left:14px">Outcome</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }

    // ── Wire member history search UI
    const mhSearch   = document.getElementById('ocm-mh-search');
    const mhDropdown = document.getElementById('ocm-mh-dropdown');
    const mhClear    = document.getElementById('ocm-mh-clear');
    let mhSelectedUid = null;

    /** Highlight matching portion of a name with <em> tags. */
    function highlightMatch(name, query) {
      const idx = name.toLowerCase().indexOf(query.toLowerCase());
      if (idx === -1) return name;
      return name.slice(0, idx) + '<em>' + name.slice(idx, idx + query.length) + '</em>' + name.slice(idx + query.length);
    }

    /** Show the autocomplete dropdown filtered by the current search query. */
    function updateDropdown(query) {
      if (!query.trim()) { mhDropdown.classList.remove('visible'); mhDropdown.innerHTML = ''; return; }
      const matches = mhAllMembers.filter(m => m.name.toLowerCase().includes(query.toLowerCase()));
      if (matches.length === 0) { mhDropdown.classList.remove('visible'); mhDropdown.innerHTML = ''; return; }
      mhDropdown.innerHTML = matches.map(m =>
        `<div class="ocm-mh-option" data-uid="${m.uid}">${highlightMatch(m.name, query)}</div>`
      ).join('');
      mhDropdown.classList.add('visible');
      mhDropdown.querySelectorAll('.ocm-mh-option').forEach(opt => {
        opt.addEventListener('mousedown', e => {
          e.preventDefault(); // prevent blur firing before click
          const uid  = opt.dataset.uid;
          const name = memberHistoryIndex[uid]?.name || '';
          mhSearch.value  = name;
          mhSelectedUid   = uid;
          mhDropdown.classList.remove('visible');
          renderMemberHistory(uid);
        });
      });
    }

    mhSearch.addEventListener('input', () => {
      mhSelectedUid = null;
      updateDropdown(mhSearch.value);
      // If the typed text exactly matches a member name, render immediately
      const exact = mhAllMembers.find(m => m.name.toLowerCase() === mhSearch.value.toLowerCase());
      if (exact) renderMemberHistory(exact.uid);
    });

    mhSearch.addEventListener('blur', () => {
      // Small delay so mousedown on option fires first
      setTimeout(() => mhDropdown.classList.remove('visible'), 150);
    });

    mhSearch.addEventListener('focus', () => {
      if (mhSearch.value.trim()) updateDropdown(mhSearch.value);
    });

    mhClear.addEventListener('click', () => {
      mhSearch.value  = '';
      mhSelectedUid   = null;
      mhDropdown.classList.remove('visible');
      document.getElementById('ocm-mh-summary').style.display = 'none';
      document.getElementById('ocm-mh-table-wrap').innerHTML =
        `<div id="ocm-mh-empty">Type a member name above to view their OC history.</div>`;
    });

    // ── OC Scenario History — build index and wire search

    /**
     * Build a per-scenario history index from the completed OC list.
     * Keyed by normOcName() so searching "Sneaky Git Grab" matches all variants.
     * Each entry is a full OC record with its slots resolved for display.
     */
    const ocHistoryIndex = {};
    for (const oc of completed) {
      const key     = normOcName(oc.name);
      const display = oc.name || 'Unknown';
      if (!ocHistoryIndex[key]) ocHistoryIndex[key] = { display, runs: [] };
      const s       = normStatus(oc.status);
      const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      const respect = oc.rewards?.respect ?? null;
      // Build per-slot detail for the expandable row
      const slotDetail = ocSlots
        .filter(sl => sl.user?.id)
        .map(sl => {
          const uid  = String(sl.user.id);
          const name = mInfo[uid]?.name || exMemberNames[uid] || `#${uid}`;
          const role = sl.position_info?.label || sl.position || '?';
          const w    = getWeight(oc.name || '', role);
          const cpr  = sl.checkpoint_pass_rate ?? null;
          return { name, uid, role, weight: w, cpr };
        });
      // Avg CPR across filled slots
      const cprs   = slotDetail.filter(s => s.cpr != null).map(s => s.cpr);
      const avgCpr = cprs.length > 0 ? cprs.reduce((a, b) => a + b, 0) / cprs.length : null;

      ocHistoryIndex[key].runs.push({
        ocName:     display,
        difficulty: oc.difficulty ?? '?',
        outcome:    s,
        executedAt: oc.executed_at ?? null,
        respect,
        avgCpr,
        slots:      slotDetail,
      });
    }
    // Sort each scenario's runs newest-first
    for (const key of Object.keys(ocHistoryIndex)) {
      ocHistoryIndex[key].runs.sort((a, b) => (b.executedAt || 0) - (a.executedAt || 0));
    }

    // Sorted list of unique scenario names for autocomplete
    const ohAllScenarios = Object.entries(ocHistoryIndex)
      .map(([key, val]) => ({ key, display: val.display }))
      .sort((a, b) => a.display.localeCompare(b.display));

    /** Render all runs of a scenario into the OC history panel. */
    function renderOcHistory(key) {
      const record    = ocHistoryIndex[key];
      const summaryEl = document.getElementById('ocm-oh-summary');
      const tableWrap = document.getElementById('ocm-oh-table-wrap');
      if (!record || record.runs.length === 0) {
        summaryEl.style.display = 'none';
        tableWrap.innerHTML = `<div id="ocm-oh-empty">No history found for this scenario in the last 100 OCs.</div>`;
        return;
      }

      const runs      = record.runs;
      const total     = runs.length;
      const successes = runs.filter(r => r.outcome === 'successful').length;
      const failures  = runs.filter(r => r.outcome === 'failure').length;
      const rate      = (successes + failures) > 0 ? Math.round(successes / (successes + failures) * 100) : 0;
      const rateCol   = rate >= 85 ? 'var(--ocm-cpr-good)' : rate >= 65 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
      // Avg CPR across all runs
      const allCprs   = runs.filter(r => r.avgCpr != null).map(r => r.avgCpr);
      const overallAvgCpr = allCprs.length > 0 ? (allCprs.reduce((a, b) => a + b, 0) / allCprs.length).toFixed(1) : null;
      // Most common difficulty
      const diffCounts = {};
      for (const r of runs) diffCounts[r.difficulty] = (diffCounts[r.difficulty] || 0) + 1;
      const topDiff = Object.entries(diffCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '?';

      // Summary bar
      summaryEl.style.display = 'flex';
      summaryEl.innerHTML = `
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">Runs</span>
          <span class="ocm-mh-sum-value">${total}</span>
        </div>
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">Success Rate</span>
          <span class="ocm-mh-sum-value" style="color:${rateCol}">${rate}%</span>
        </div>
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">W / F / E</span>
          <span class="ocm-mh-sum-value" style="font-size:12px">
            <span style="color:var(--ocm-cpr-good)">${successes}</span> /
            <span style="color:var(--ocm-cpr-crit)">${failures}</span> /
            <span style="color:#888">${total - successes - failures}</span>
          </span>
        </div>
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">Avg CPR</span>
          <span class="ocm-mh-sum-value ${overallAvgCpr != null ? cprClass(Number(overallAvgCpr)) : ''}">${overallAvgCpr != null ? overallAvgCpr + '%' : '—'}</span>
        </div>
        <div class="ocm-mh-sum-item">
          <span class="ocm-mh-sum-label">Common Diff</span>
          <span class="ocm-mh-sum-value">D${topDiff}</span>
        </div>`;

      // Run rows — each expandable to show per-member slot detail
      const runsHtml = runs.map((r, idx) => {
        const dateStr  = r.executedAt
          ? new Date(r.executedAt * 1000).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: '2-digit' })
          : '—';
        const outIcon  = r.outcome === 'successful' ? '✅' : r.outcome === 'failure' ? '❌' : '⏰';
        const outCls   = r.outcome === 'successful' ? 'ocm-mh-outcome-success' : r.outcome === 'failure' ? 'ocm-mh-outcome-failure' : 'ocm-mh-outcome-expired';
        const outText  = r.outcome === 'successful' ? 'Success' : r.outcome === 'failure' ? 'Failure' : 'Expired';
        const respStr  = (r.outcome === 'successful' && r.respect != null) ? `${r.respect}` : '—';
        const respCol  = (r.outcome === 'successful' && r.respect != null) ? 'var(--ocm-cpr-warn)' : '#333';
        const avgStr   = r.avgCpr != null ? `${r.avgCpr.toFixed(1)}%` : '—';
        const avgCol   = r.avgCpr != null ? cprClass(r.avgCpr) : '';

        // Per-slot detail rows
        const slotRows = r.slots.map(sl => {
          const wStr  = sl.weight != null ? `${sl.weight.toFixed(0)}%` : '—';
          const wCls  = sl.weight != null ? (sl.weight >= WEIGHT_HIGH ? 'w-high' : sl.weight >= WEIGHT_MID ? 'w-mid' : 'w-low') : '';
          const cStr  = sl.cpr != null ? `${sl.cpr}%` : '—';
          const cCls  = sl.cpr != null ? cprClass(sl.cpr) : '';
          return `<tr>
            <td><a href="/profiles.php?XID=${sl.uid}" target="_blank" style="color:#ccc;text-decoration:none">${sl.name}</a></td>
            <td style="color:#888">${sl.role}</td>
            <td class="td-right ocm-slot-weight ${wCls}">${wStr}</td>
            <td class="td-right ${cCls}" style="font-weight:bold">${cStr}</td>
          </tr>`;
        }).join('');

        return `
          <div class="ocm-oh-run-header" data-oh-idx="${idx}" style="border-left:3px solid ${r.outcome === 'successful' ? '#3a5030' : r.outcome === 'failure' ? '#4a2820' : '#444'}">
            <span class="${outCls}">${outIcon}</span>
            <span style="color:#666;font-size:10px;flex:0 0 70px">${dateStr}</span>
            <span style="color:#888;font-size:10px;flex:0 0 30px">D${r.difficulty}</span>
            <span class="${outCls}" style="flex:1">${outText}</span>
            <span style="color:#aaa;font-size:10px">Avg CPR: <strong class="${avgCol}">${avgStr}</strong></span>
            <span style="color:${respCol};font-size:10px;flex:0 0 60px;text-align:right">${respStr !== '—' ? `${respStr} resp` : '—'}</span>
            <span style="color:#555;font-size:10px;margin-left:4px">▼</span>
          </div>
          <div class="ocm-oh-run-detail" id="ocm-oh-detail-${idx}">
            <table>
              <thead><tr>
                <th>Member</th><th>Role</th>
                <th class="td-right">Weight</th>
                <th class="td-right">CPR</th>
              </tr></thead>
              <tbody>${slotRows || '<tr><td colspan="4" style="color:#555;font-style:italic">No member data</td></tr>'}</tbody>
            </table>
          </div>`;
      }).join('');

      tableWrap.innerHTML = `<div>${runsHtml}</div>`;

      // Wire expand/collapse per run row
      tableWrap.querySelectorAll('.ocm-oh-run-header').forEach(header => {
        header.addEventListener('click', () => {
          const idx    = header.dataset.ohIdx;
          const detail = document.getElementById(`ocm-oh-detail-${idx}`);
          if (!detail) return;
          const isOpen = detail.style.display === 'block';
          detail.style.display = isOpen ? 'none' : 'block';
          const arrow = header.querySelector('span:last-child');
          if (arrow) arrow.textContent = isOpen ? '▼' : '▲';
        });
      });
    }

    // Wire OC history search UI
    const ohSearch   = document.getElementById('ocm-oh-search');
    const ohDropdown = document.getElementById('ocm-oh-dropdown');
    const ohClear    = document.getElementById('ocm-oh-clear');

    function updateOhDropdown(query) {
      if (!query.trim()) { ohDropdown.classList.remove('visible'); ohDropdown.innerHTML = ''; return; }
      const matches = ohAllScenarios.filter(s => s.display.toLowerCase().includes(query.toLowerCase()));
      if (matches.length === 0) { ohDropdown.classList.remove('visible'); ohDropdown.innerHTML = ''; return; }
      ohDropdown.innerHTML = matches.map(s =>
        `<div class="ocm-mh-option" data-key="${s.key}">${highlightMatch(s.display, query)}</div>`
      ).join('');
      ohDropdown.classList.add('visible');
      ohDropdown.querySelectorAll('.ocm-mh-option').forEach(opt => {
        opt.addEventListener('mousedown', e => {
          e.preventDefault();
          ohSearch.value = ocHistoryIndex[opt.dataset.key]?.display || '';
          ohDropdown.classList.remove('visible');
          renderOcHistory(opt.dataset.key);
        });
      });
    }

    ohSearch.addEventListener('input', () => {
      updateOhDropdown(ohSearch.value);
      const exact = ohAllScenarios.find(s => s.display.toLowerCase() === ohSearch.value.toLowerCase());
      if (exact) renderOcHistory(exact.key);
    });

    ohSearch.addEventListener('blur', () => {
      setTimeout(() => ohDropdown.classList.remove('visible'), 150);
    });

    ohSearch.addEventListener('focus', () => {
      if (ohSearch.value.trim()) updateOhDropdown(ohSearch.value);
    });

    ohClear.addEventListener('click', () => {
      ohSearch.value = '';
      ohDropdown.classList.remove('visible');
      document.getElementById('ocm-oh-summary').style.display = 'none';
      document.getElementById('ocm-oh-table-wrap').innerHTML =
        `<div id="ocm-oh-empty">Type an OC name above to view all runs of that scenario.</div>`;
    });



    function svgLine(canvasId, labels, values, color = 'var(--ocm-cpr-good)') {
      const el = document.getElementById(canvasId);
      if (!el) return;
      const W = 760, H = 120;
      const pad = { t: 10, r: 10, b: 30, l: 36 };
      const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
      const valids = values.filter(v => v != null);
      if (!valids.length) { el.innerHTML = '<span style="color:#555;font-size:11px;padding:8px;display:block">Not enough data</span>'; return; }
      const xStep  = cW / Math.max(labels.length - 1, 1);
      const yScale = v => cH - (v / 100) * cH;
      let pathD    = '';
      values.forEach((v, i) => {
        if (v == null) return;
        const x = pad.l + i * xStep, y = pad.t + yScale(v);
        pathD += pathD === '' ? `M${x},${y}` : `L${x},${y}`;
      });
      const yTicks = [0, 25, 50, 75, 100];
      el.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block">
        ${yTicks.map(t => `
          <line x1="${pad.l}" y1="${pad.t + yScale(t)}" x2="${pad.l + cW}" y2="${pad.t + yScale(t)}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
          <text x="${pad.l - 4}" y="${pad.t + yScale(t) + 4}" text-anchor="end" fill="#555" font-size="9">${t}%</text>`).join('')}
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
        ${values.map((v, i) => v != null ? `<circle cx="${pad.l + i * xStep}" cy="${pad.t + yScale(v)}" r="3" fill="${color}"/>` : '').join('')}
        ${labels.map((l, i) => (i === 0 || i === labels.length - 1 || i % Math.ceil(labels.length / 5) === 0)
          ? `<text x="${pad.l + i * xStep}" y="${H - 4}" text-anchor="middle" fill="#555" font-size="9">${l}</text>` : '').join('')}
      </svg>`;
    }

    function svgBarH(canvasId, labels, values) {
      const el = document.getElementById(canvasId);
      if (!el) return;
      const W = 760;
      const rowH = 22, pad = { t: 4, r: 54, b: 4, l: 160 };
      const H = labels.length * rowH + pad.t + pad.b;
      const cW = W - pad.l - pad.r;
      el.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block">
        ${labels.map((l, i) => {
          const barW = Math.max(2, (values[i] / 100) * cW);
          const y   = pad.t + i * rowH;
          const col = values[i] >= 85 ? 'var(--ocm-cpr-good)' : values[i] >= 65 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
          return `
            <text x="${pad.l - 6}" y="${y + rowH * 0.68}" text-anchor="end" fill="#aaa" font-size="10">${l}</text>
            <rect x="${pad.l}" y="${y + 3}" width="${barW}" height="${rowH - 6}" fill="${col}" rx="2" opacity="0.8"/>
            <text x="${pad.l + barW + 4}" y="${y + rowH * 0.68}" fill="#aaa" font-size="10">${values[i]}%</text>`;
        }).join('')}
      </svg>`;
    }

    function svgBarV(canvasId, labels, values, colors) {
      const el = document.getElementById(canvasId);
      if (!el) return;
      const W = 760, H = 160;
      const pad = { t: 16, r: 10, b: 50, l: 30 };
      const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
      const maxV = Math.max(...values, 1);
      const gap  = cW / labels.length;
      const barW = Math.max(6, gap - 4);
      el.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block">
        <line x1="${pad.l}" y1="${pad.t + cH}" x2="${pad.l + cW}" y2="${pad.t + cH}" stroke="#333" stroke-width="1"/>
        ${values.map((v, i) => {
          const bH  = Math.max(2, (v / maxV) * cH);
          const x   = pad.l + i * gap + (gap - barW) / 2;
          const y   = pad.t + cH - bH;
          const col = colors ? colors[i] : 'var(--ocm-cpr-good)';
          const raw = labels[i];
          const lbl = raw.length > 10 ? raw.slice(0,9)+'…' : raw;
          return `
            <rect x="${x}" y="${y}" width="${barW}" height="${bH}" fill="${col}" rx="2" opacity="0.85"/>
            <text x="${x + barW/2}" y="${y - 3}" text-anchor="middle" fill="#aaa" font-size="9">${v}</text>
            <text x="${x + barW/2}" y="${pad.t + cH + 12}" text-anchor="end" fill="#555" font-size="9"
              transform="rotate(-40 ${x + barW/2} ${pad.t + cH + 12})">${lbl}</text>`;
        }).join('')}
      </svg>`;
    }

    /**
     * Render the requested chart into its container.
     * The heatmap fix: both heatData and heatScenarios now use normOcName() as their key,
     * eliminating the previous mismatch between raw oc.name keys and normalised scenario keys.
     */
    function renderCharts(targetId) {
      // 1. Success rate over time (weekly buckets)
      if (targetId === 'ocm-chart-timeline') {
        const byWeek = {};
        for (const oc of completed) {
          if (!oc.executed_at) continue;
          const d  = new Date(oc.executed_at * 1000);
          const wk = Math.ceil(d.getUTCDate() / 7);
          const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-W${wk}`;
          if (!byWeek[key]) byWeek[key] = { s: 0, f: 0 };
          if (normStatus(oc.status) === 'successful') byWeek[key].s++;
          else if (normStatus(oc.status) === 'failure') byWeek[key].f++;
        }
        const weekKeys  = Object.keys(byWeek).sort();
        const weekRates = weekKeys.map(k => { const { s, f } = byWeek[k]; return (s+f) > 0 ? Math.round(s/(s+f)*100) : null; });
        svgLine('ocm-chart-timeline', weekKeys.map(k => k.slice(5)), weekRates);
      }

      // 2. Success rate by scenario (horizontal bar)
      if (targetId === 'ocm-chart-scenario') {
        const scenSorted = [...scenarioRows]
          .filter(r => r.success + r.failure > 0)
          .sort((a, b) => (b.success/(b.success+b.failure)) - (a.success/(a.success+a.failure)));
        svgBarH('ocm-chart-scenario',
          scenSorted.map(r => r.name.length > 22 ? r.name.slice(0,20)+'…' : r.name),
          scenSorted.map(r => Math.round(r.success / (r.success + r.failure) * 100)),
        );
      }

      // 3. CPR distribution histogram
      if (targetId === 'ocm-chart-cpr') {
        const cprBuckets = { '0–60': 0, '60–70': 0, '70–80': 0, '80–90': 0, '90–100': 0 };
        for (const oc of completed) {
          const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
          for (const slot of ocSlots) {
            if (!slot.user?.id) continue;
            const cpr = slot.checkpoint_pass_rate ?? null;
            if (cpr === null) continue;
            if (cpr < 60)       cprBuckets['0–60']++;
            else if (cpr < 70)  cprBuckets['60–70']++;
            else if (cpr < 80)  cprBuckets['70–80']++;
            else if (cpr < 90)  cprBuckets['80–90']++;
            else                cprBuckets['90–100']++;
          }
        }
        svgBarV('ocm-chart-cpr', Object.keys(cprBuckets), Object.values(cprBuckets),
          ['var(--ocm-cpr-crit)','var(--ocm-cpr-warn)','var(--ocm-cpr-warn)','var(--ocm-cpr-good)','var(--ocm-link)']);
      }

      // 4. Member participation & success rate (top 20 current members)
      if (targetId === 'ocm-chart-members') {
        const topMembers = memberRows.filter(r => !r.isEx).slice(0, 20);
        svgBarV('ocm-chart-members',
          topMembers.map(r => r.name),
          topMembers.map(r => r.participated),
          topMembers.map(r => r.rate >= 0.85 ? 'var(--ocm-cpr-good)' : r.rate >= 0.65 ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)'),
        );
      }

      // 5. Member × Scenario Heatmap
      // FIX: heatData is now keyed by normOcName(oc.name) to match heatScenarios
      // which comes from the normOcName()-keyed scenarioStats. Previously oc.name
      // was used as the key causing every cell lookup to miss.
      if (targetId === 'ocm-heatmap') {
        // Unique normalised scenario names that have at least one data point
        const heatScenarios = Object.keys(scenarioStats).sort();

        // Build heatData[memberUid][normOcName] = {s, f}
        const heatData = {};
        for (const oc of completed) {
          const s       = normStatus(oc.status);
          const normKey = normOcName(oc.name); // ← was oc.name (bug)
          const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
          for (const slot of ocSlots) {
            const uid = slot.user?.id ? String(slot.user.id) : null;
            if (!uid) continue;
            // Only include members who appear in memberRows (participated in at least one OC)
            if (!memberRows.find(m => m.uid === uid)) continue;
            if (!heatData[uid]) heatData[uid] = {};
            if (!heatData[uid][normKey]) heatData[uid][normKey] = { s: 0, f: 0 };
            if (s === 'successful') heatData[uid][normKey].s++;
            else if (s === 'failure') heatData[uid][normKey].f++;
          }
        }

        // Only show scenarios that have at least one cell of data
        const heatScens = heatScenarios.filter(sc =>
          memberRows.some(m => heatData[m.uid]?.[sc])
        );

        const cellSize = 30; // slightly larger for readability with 45 members
        const labelW   = 140;

        const heatEl = document.getElementById('ocm-heatmap');
        if (!heatEl) return;
        heatEl.innerHTML = `
          <table style="border-collapse:collapse;font-size:10px;min-width:${heatScens.length * cellSize + labelW}px">
            <thead><tr>
              <th style="min-width:${labelW}px"></th>
              ${heatScens.map(sc => `<th style="text-align:center;color:#666;padding:2px;writing-mode:vertical-rl;transform:rotate(180deg);height:80px;white-space:nowrap;font-weight:normal" title="${sc}">${sc.length>16 ? sc.slice(0,14)+'…' : sc}</th>`).join('')}
            </tr></thead>
            <tbody>${memberRows.map(m => {
              const hasAny = heatScens.some(sc => heatData[m.uid]?.[sc]);
              if (!hasAny) return '';
              return `<tr>
                <td style="padding:2px 6px;color:${m.isEx?'#555':'#ccc'};white-space:nowrap">${m.name}${m.isEx?' <span style="font-size:9px;color:#444">(left)</span>':''}</td>
                ${heatScens.map(sc => {
                  const d = heatData[m.uid]?.[sc];
                  if (!d || (d.s + d.f) === 0) return `<td style="width:${cellSize}px;height:${cellSize}px;background:#0a1020;border:1px solid #111" title="No data"></td>`;
                  const rate = d.s / (d.s + d.f);
                  const alpha = 0.3 + rate * 0.5;
                  const bg = rate >= 0.85
                    ? `rgba(68,238,136,${alpha})`
                    : rate >= 0.65
                      ? `rgba(255,170,0,${alpha})`
                      : `rgba(255,68,68,${0.3+(1-rate)*0.5})`;
                  return `<td style="width:${cellSize}px;height:${cellSize}px;background:${bg};border:1px solid #111;text-align:center;color:#e0e0e0;font-weight:bold;font-size:9px" title="${m.name} — ${sc}: ${d.s}/${d.s+d.f} (${Math.round(rate*100)}%)">${Math.round(rate*100)}%</td>`;
                }).join('')}
              </tr>`;
            }).join('')}
            </tbody>
          </table>`;
      }
    }

    // Wire chart show/hide toggles — chart is rendered on first click, then cached
    const chartRendered = {};
    analyticsEl.querySelectorAll('.ocm-chart-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        const visible = target.classList.toggle('visible');
        btn.textContent = visible ? 'Hide Chart' : 'Show Chart';
        if (visible && !chartRendered[btn.dataset.target]) {
          chartRendered[btn.dataset.target] = true;
          renderCharts(btn.dataset.target);
        }
      });
    });

    // ── Downloads section
    const downloadsEl = document.getElementById('ocm-downloads');

    function makeCSV(headers, rows) {
      const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      return [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
    }

    function triggerDownload(filename, csv) {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    }

    const dlButtons = [
      // ── Active state exports
      {
        icon: '📋', label: 'Active OC State', desc: 'All active OCs with slots, member, CPR, weight, item status',
        fn: () => {
          const headers = ['OC Name','Difficulty','Status','Role','Member','CPR%','Weight%','Item Status','Blocked'];
          const rows = [];
          for (const oc of [...planningAll, ...recruitingAll]) {
            const ocSlots = Array.isArray(oc.oc.slots) ? oc.oc.slots : Object.values(oc.oc.slots || []);
            for (const slot of ocSlots) {
              const uid    = slot.user?.id ? String(slot.user.id) : null;
              const name   = uid ? (mInfo[uid]?.name || uid) : 'Open';
              const cpr    = slot.checkpoint_pass_rate ?? '';
              const role   = slot.position_info?.label || slot.position || '';
              const w      = getWeight(oc.oc.name || '', role);
              const req    = slot.item_requirement;
              const itemSt = !req ? '' : !uid ? 'needed' : req.is_available ? 'has item' : armory[String(req.id)] ? 'in armory' : 'missing';
              const blocked = uid && mInfo[uid] && isBlocked(mInfo[uid].status) ? mInfo[uid].status : '';
              rows.push([oc.oc.name, oc.oc.difficulty, oc.badgeLabel, role, name, cpr, w != null ? w.toFixed(1) : '', itemSt, blocked]);
            }
          }
          triggerDownload(`ocm_active_ocs_${Date.now()}.csv`, makeCSV(headers, rows));
        },
      },
      {
        icon: '🚨', label: 'Stuck OCs', desc: 'Fully planned OCs blocked from initiating by an unavailable member',
        fn: () => {
          const headers = ['OC Name','Difficulty','Blocking Member','Member Status','Expires At'];
          const rows = [];
          for (const { oc, blockers } of stuckOcs) {
            for (const b of blockers) {
              const expiry = oc.expired_at
                ? new Date(oc.expired_at * 1000).toLocaleString('en-GB', { timeZone: 'UTC' })
                : '';
              rows.push([oc.name || '', oc.difficulty ?? '', b.name, b.status, expiry]);
            }
          }
          if (rows.length === 0) rows.push(['No stuck OCs','','','','']);
          triggerDownload(`ocm_stuck_ocs_${Date.now()}.csv`, makeCSV(headers, rows));
        },
      },
      {
        icon: '⚠', label: 'Low CPR Report', desc: 'Filled slots below CPR warn threshold, sorted by risk',
        fn: () => {
          const headers = ['Member','OC','Role','CPR%','Weight%','High Risk'];
          const rows = lowCprRows.map(r => [r.name, r.ocName, r.roleName, r.cpr, r.weight != null ? r.weight.toFixed(1) : '', r.isRisk ? 'Yes' : 'No']);
          triggerDownload(`ocm_low_cpr_${Date.now()}.csv`, makeCSV(headers, rows));
        },
      },
      // ── Member state exports
      {
        icon: '👥', label: 'Member Availability', desc: 'Members not currently in any OC, with last OC and last online',
        fn: () => {
          const headers = ['Member','Last OC','Last OC Date','Status'];
          const rows = freeMembers.map(m => {
            const oc = lastOc[m.id];
            const ts = oc ? new Date(oc.executed_at * 1000).toLocaleDateString('en-GB') : '';
            return [m.name, oc ? oc.name : 'No record', ts, m.status || ''];
          });
          triggerDownload(`ocm_availability_${Date.now()}.csv`, makeCSV(headers, rows));
        },
      },
      {
        icon: '🚧', label: 'Recruits', desc: 'Members currently holding Recruit rank — ineligible for OCs',
        fn: () => {
          const headers = ['Member','Last OC','Last OC Date','Last Online'];
          const rows = freeRecruits.map(m => {
            const member = Object.values(memberMap).find(x => String(x.id) === m.id);
            const oc     = lastOc[m.id];
            const ocDate = oc ? new Date(oc.executed_at * 1000).toLocaleDateString('en-GB') : '';
            const seenTs = member?.last_action?.timestamp ?? null;
            const seenStr = seenTs ? new Date(seenTs * 1000).toLocaleString('en-GB') : '';
            return [m.name, oc ? oc.name : 'No record', ocDate, seenStr];
          });
          if (rows.length === 0) rows.push(['No recruits','','','']);
          triggerDownload(`ocm_recruits_${Date.now()}.csv`, makeCSV(headers, rows));
        },
      },
      {
        icon: '🔴', label: 'Blocked Members', desc: 'Members in an OC who are jailed, hospitalised, or abroad',
        fn: () => {
          const headers = ['Member','Status','Description','OC Name','OC Executes At'];
          const rows = allBlocked.map(b => {
            const execStr = b.ocExecutesAt
              ? new Date(b.ocExecutesAt * 1000).toLocaleString('en-GB', { timeZone: 'UTC' })
              : '';
            return [b.name, b.status || '', b.description || '', b.ocName || '', execStr];
          });
          if (rows.length === 0) rows.push(['No blocked members','','','','']);
          triggerDownload(`ocm_blocked_${Date.now()}.csv`, makeCSV(headers, rows));
        },
      },
      // ── Analytics exports
      {
        icon: '📊', label: 'Member Analytics', desc: 'OC participation, success rate, avg CPR per member',
        fn: () => {
          const headers = ['Member','OCs Participated','Successes','Failures','Win%','Avg CPR%'];
          const rows = memberRows.map(r => [r.name, r.participated, r.success, r.failure, pct(r.rate), r.avgCpr != null ? r.avgCpr.toFixed(1) : '']);
          triggerDownload(`ocm_member_analytics_${Date.now()}.csv`, makeCSV(headers, rows));
        },
      },
      {
        icon: '🏆', label: 'Scenario Analytics', desc: 'Success rates and run counts per OC scenario',
        fn: () => {
          const headers = ['Scenario','Times Run','Successes','Failures','Expired','Win%'];
          const rows = scenarioRows.map(r => [r.name, r.total, r.success, r.failure, r.expired, pct(r.rate)]);
          triggerDownload(`ocm_scenario_analytics_${Date.now()}.csv`, makeCSV(headers, rows));
        },
      },
      {
        icon: '🗂', label: 'Full OC History', desc: 'Every completed OC slot — one row per member per OC, with all fields',
        fn: () => {
          const headers = ['Date','OC Name','Difficulty','Member','Role','Weight%','CPR%','Outcome','Respect'];
          const rows = [];
          for (const oc of [...completed].sort((a, b) => (b.executed_at || 0) - (a.executed_at || 0))) {
            const s       = normStatus(oc.status);
            const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
            const dateStr = oc.executed_at
              ? new Date(oc.executed_at * 1000).toLocaleDateString('en-GB', { timeZone: 'UTC' })
              : '';
            const respect = oc.rewards?.respect ?? '';
            for (const slot of ocSlots) {
              const uid  = slot.user?.id ? String(slot.user.id) : null;
              if (!uid) continue;
              const name = mInfo[uid]?.name || exMemberNames[uid] || `#${uid}`;
              const role = slot.position_info?.label || slot.position || '';
              const w    = getWeight(oc.name || '', role);
              const cpr  = slot.checkpoint_pass_rate ?? '';
              const out  = s === 'successful' ? 'Success' : s === 'failure' ? 'Failure' : 'Expired';
              rows.push([dateStr, oc.name || '', oc.difficulty ?? '', name, role, w != null ? w.toFixed(1) : '', cpr, out, s === 'successful' ? respect : '']);
            }
          }
          triggerDownload(`ocm_full_history_${Date.now()}.csv`, makeCSV(headers, rows));
        },
      },
      {
        icon: '🔥', label: 'Member × Scenario Heatmap', desc: 'Success rate per member per scenario — flat table for spreadsheet use',
        fn: () => {
          // Collect all normalised scenario names with data
          const heatScens = Object.keys(scenarioStats).sort();
          // Build heatmap data using same normOcName keying as the chart
          const heatData = {};
          for (const oc of completed) {
            const s       = normStatus(oc.status);
            const normKey = normOcName(oc.name);
            const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
            for (const slot of ocSlots) {
              const uid = slot.user?.id ? String(slot.user.id) : null;
              if (!uid) continue;
              if (!heatData[uid]) heatData[uid] = {};
              if (!heatData[uid][normKey]) heatData[uid][normKey] = { s: 0, f: 0 };
              if (s === 'successful') heatData[uid][normKey].s++;
              else if (s === 'failure') heatData[uid][normKey].f++;
            }
          }
          const headers = ['Member', ...heatScens];
          const rows = memberRows.map(m => {
            const cells = heatScens.map(sc => {
              const d = heatData[m.uid]?.[sc];
              if (!d || (d.s + d.f) === 0) return '';
              return `${Math.round(d.s / (d.s + d.f) * 100)}%`;
            });
            return [m.name, ...cells];
          });
          triggerDownload(`ocm_heatmap_${Date.now()}.csv`, makeCSV(headers, rows));
        },
      },
      {
        icon: '📝', label: 'Member OC History', desc: 'Full per-member OC history — one row per slot across all 100 completed OCs',
        fn: () => {
          const headers = ['Member','Date','OC Name','Difficulty','Role','Weight%','CPR%','Outcome','Respect'];
          const rows = [];
          // Iterate memberHistoryIndex already built above
          for (const [uid, record] of Object.entries(memberHistoryIndex)) {
            for (const e of record.entries) {
              const dateStr = e.executedAt
                ? new Date(e.executedAt * 1000).toLocaleDateString('en-GB', { timeZone: 'UTC' })
                : '';
              const out  = e.outcome === 'successful' ? 'Success' : e.outcome === 'failure' ? 'Failure' : 'Expired';
              const resp = (e.outcome === 'successful' && e.respect != null) ? e.respect : '';
              rows.push([record.name, dateStr, e.ocName, e.difficulty, e.role, e.weight != null ? e.weight.toFixed(1) : '', e.cpr ?? '', out, resp]);
            }
          }
          // Sort by member name then date desc
          rows.sort((a, b) => a[0].localeCompare(b[0]) || (b[1] < a[1] ? -1 : 1));
          triggerDownload(`ocm_member_history_${Date.now()}.csv`, makeCSV(headers, rows));
        },
      },
    ];

    const dlGroups = [
      { label: '📋 Active State',   indices: [0, 1, 2] },
      { label: '👤 Member State',   indices: [3, 4, 5] },
      { label: '📊 Analytics',      indices: [6, 7, 8, 9, 10] },
    ];

    downloadsEl.innerHTML = dlGroups.map(g => `
      <div style="margin-bottom:10px">
        <div style="font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid #1e1e1e">${g.label}</div>
        <div class="ocm-downloads-grid">
          ${g.indices.map(i => `<button class="ocm-dl-btn" data-dl="${i}"><strong>${dlButtons[i].icon} ${dlButtons[i].label}</strong><span>${dlButtons[i].desc}</span></button>`).join('')}
        </div>
      </div>`).join('');

    downloadsEl.querySelectorAll('.ocm-dl-btn').forEach(btn => {
      btn.addEventListener('click', () => dlButtons[Number(btn.dataset.dl)].fn());
    });

    document.getElementById('ocm-last-update').textContent = `Updated ${new Date().toLocaleTimeString()}`;
    updateTabCounts();
    startCountdowns();
  }

  /** Start the 1-second interval that updates all live countdown timers in the DOM. */
  function startCountdowns() {
    clearInterval(window._ocmTimer);
    window._ocmTimer = setInterval(() => {
      document.querySelectorAll('.ocm-time[data-until]').forEach(el => {
        el.textContent = fmtCountdown(parseInt(el.dataset.until, 10));
      });
    }, 1000);
  }

  // ─── MEMBER MODE ─────────────────────────────────────────────────────────────

  /** Fetch data for member mode (no faction API access). */
  async function fetchMember(apiKey) {
    const url  = `${API_BASE}/user?selections=organizedcrimes,basic&key=${apiKey}&comment=OCManager`;
    const res  = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(`API error ${data.error.code}: ${data.error.error}`);
    return data;
  }

  /** Render the member-mode dashboard (slot recommendations only, no faction data). */
  function renderMemberDashboard(data) {
    document.getElementById('ocm-body').style.display       = 'block';
    document.getElementById('ocm-stats-bar').style.display  = 'none';
    document.getElementById('ocm-next-banner').style.display = 'none';

    ['ocm-title-available','ocm-available','ocm-title-recruits','ocm-recruits',
     'ocm-title-blocked','ocm-blocked','ocm-title-lowcpr','ocm-lowcpr',
     'ocm-title-overqualified','ocm-overqualified',
     'ocm-title-tscpr','ocm-tscpr',
     'ocm-leader-advice',
     'ocm-planning-header','ocm-grid-planning','ocm-recruiting-header',
     'ocm-grid-recruiting','ocm-title-analytics','ocm-analytics',
     'ocm-title-downloads','ocm-downloads'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    // Hide tab strip; force all tab panes visible so the member-mode content (which is
    // injected inside panes) still renders. The member-mode UI is much smaller and
    // doesn't benefit from tabbing.
    const tabsEl = document.getElementById('ocm-tabs');
    if (tabsEl) tabsEl.style.display = 'none';
    document.querySelectorAll('.ocm-tab-pane').forEach(p => p.classList.add('active'));

    const crimes     = data.organizedcrimes || data.organized_crimes || {};
    const memberName = data.name || 'You';
    const myId       = data.player_id ? String(data.player_id) : null;
    const nowTs      = Math.floor(Date.now() / 1000);

    const errEl = document.getElementById('ocm-error');
    errEl.style.display = 'none';

    const footer = document.getElementById('ocm-footer');
    footer.innerHTML = '';

    const container = document.createElement('div');
    container.style.cssText = 'margin-top:4px';

    // Mode notice
    const notice = document.createElement('div');
    notice.style.cssText = 'background:#1e1e1e;border:0.5px solid #2e2e2e;border-left:3px solid #3a3018;border-radius:0 6px 6px 0;padding:8px 12px;font-size:11px;color:#99a;margin-bottom:10px';
    notice.innerHTML = '<strong style="color:var(--ocm-cpr-warn)">Member Mode</strong> \u2014 faction-wide data requires Faction API access on your role. Ask your faction leader.';
    container.appendChild(notice);

    // Detect whether the member is currently assigned to an active OC.
    // Scan all OCs returned by the API; find the one where a slot user.id
    // matches the member own player_id (returned as data.player_id).
    let currentOc = null;
    let mySlot    = null;

    for (const oc of Object.values(crimes)) {
      if (!oc) continue;
      const phase   = (oc.status || '').toLowerCase();
      // Skip terminal and recruiting phases
      if (['completed','expired','cancelled','failed','success','recruiting'].includes(phase)) continue;
      const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
      const mine    = myId ? ocSlots.find(s => s.user && String(s.user.id) === myId) : null;
      if (mine) { currentOc = oc; mySlot = mine; break; }
    }

    if (currentOc) {
      // ── CURRENT OC CARD ──────────────────────────────────────────────────────
      const phase   = (currentOc.status || '').toLowerCase();
      const ocSlots = Array.isArray(currentOc.slots) ? currentOc.slots : Object.values(currentOc.slots || []);

      // Determine countdown / timer display
      const executesAt = (currentOc.executed_at && currentOc.executed_at > nowTs ? currentOc.executed_at : null)
                      || (currentOc.ready_at    && currentOc.ready_at    > nowTs ? currentOc.ready_at    : null);
      const timeLeft   = currentOc.time_left != null ? currentOc.time_left : null;
      const expiredAt  = currentOc.expired_at != null ? currentOc.expired_at : null;
      const openCount  = ocSlots.filter(s => !s.user).length;

      let timerHtml;
      if (executesAt) {
        const tctStr  = new Date(executesAt * 1000).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
        const tctDate = new Date(executesAt * 1000).toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' });
        timerHtml = '\u23F1 <span class="ocm-time" data-until="' + executesAt + '">' + fmtTime(executesAt - nowTs) + '</span>'
          + ' <span style="color:#555;font-size:10px">(' + tctDate + ' ' + tctStr + ' TCT)</span>';
      } else if (timeLeft > 0) {
        timerHtml = '\u23F8 ~' + fmtTime(timeLeft) + ' remaining <span style="color:#555;font-size:10px">(paused)</span>';
      } else if (openCount > 0) {
        timerHtml = '\u23F8 ~' + fmtTime(openCount * 24 * 3600) + ' est.'
          + ' <span style="color:#555;font-size:10px">(' + openCount + ' open slot' + (openCount > 1 ? 's' : '') + ' x 24h)</span>';
      } else if (expiredAt && expiredAt > nowTs) {
        timerHtml = '\u23F3 Expires in <span class="ocm-time" data-until="' + expiredAt + '">' + fmtTime(expiredAt - nowTs) + '</span>';
      } else {
        timerHtml = '<span style="color:var(--ocm-cpr-good);font-weight:bold">Ready to initiate!</span>';
      }

      // My slot stats
      const myRole   = mySlot && mySlot.position_info && mySlot.position_info.label ? mySlot.position_info.label : (mySlot && mySlot.position ? mySlot.position : '?');
      const myCpr    = mySlot && mySlot.checkpoint_pass_rate != null ? mySlot.checkpoint_pass_rate : null;
      const myWeight = getWeight(currentOc.name || '', myRole);
      const myProg   = mySlot && mySlot.user && mySlot.user.progress != null ? mySlot.user.progress : null;
      const cprCol   = myCpr == null ? '#555' : myCpr >= CPR_WARN ? 'var(--ocm-cpr-good)' : myCpr >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
      const wCol     = myWeight == null ? '#555' : myWeight >= WEIGHT_HIGH ? 'var(--ocm-cpr-warn)' : myWeight >= WEIGHT_MID ? '#aaa' : '#555';
      const progPct  = Math.min(100, Math.max(0, myProg != null ? myProg : 0));
      const progCol  = progPct >= 100 ? 'var(--ocm-cpr-good)' : 'var(--ocm-cpr-warn)';
      const progLabel = myProg == null ? 'No progress data' : myProg >= 100 ? 'Planning complete \u2713' : ('Planning: ' + progPct.toFixed(0) + '%');

      // Phase badge
      const phaseBadge = phase === 'ready'
        ? '<span style="background:#14201a;color:var(--ocm-cpr-good);font-size:10px;padding:1px 6px;border-radius:3px;font-weight:bold">READY</span>'
        : phase === 'blocked'
          ? '<span style="background:#181818;color:#bf7abf;font-size:10px;padding:1px 6px;border-radius:3px;font-weight:bold">BLOCKED</span>'
          : '<span style="background:#14181e;color:var(--ocm-link);font-size:10px;padding:1px 6px;border-radius:3px;font-weight:bold">PLANNING</span>';

      // Detect blocked members and stuck status
      const blockedSlots = ocSlots.filter(s => {
        if (!s.user || !s.user.id) return false;
        const st = (s.user.status ? (s.user.status.state || s.user.status.description || '') : '').toLowerCase();
        return st === 'hospital' || st === 'jail' || st === 'traveling' || st === 'abroad';
      });
      const allFilled  = ocSlots.every(s => s.user && s.user.id);
      const allPlanned = ocSlots.every(s => {
        const p = s.user && s.user.progress != null ? s.user.progress : 100;
        return p >= 100;
      });
      const isStuck = allFilled && allPlanned && blockedSlots.length > 0;

      // Alert banner
      let alertHtml = '';
      if (isStuck) {
        alertHtml = '<div style="background:#1c1810;border:1px solid #4a2820;border-radius:4px;padding:6px 10px;margin-bottom:8px;font-size:11px;color:var(--ocm-cpr-crit)">'
          + '\uD83D\uDEA8 <strong>Stuck</strong> \u2014 OC is fully planned but cannot initiate. '
          + blockedSlots.length + ' member' + (blockedSlots.length > 1 ? 's are' : ' is') + ' unavailable.</div>';
      } else if (blockedSlots.length > 0) {
        alertHtml = '<div style="background:#181410;border:1px solid #3a3018;border-radius:4px;padding:6px 10px;margin-bottom:8px;font-size:11px;color:var(--ocm-cpr-warn)">'
          + '\u26A0 ' + blockedSlots.length + ' member' + (blockedSlots.length > 1 ? 's are' : ' is') + ' currently jailed, hospitalised, or abroad.</div>';
      }

      // All slots list
      const otherSlotsHtml = ocSlots.map(s => {
        const isMe   = myId && s.user && String(s.user.id) === myId;
        const uid    = s.user ? String(s.user.id) : null;
        const name   = uid ? (s.user.name || ('#' + uid)) : 'Open slot';
        const role   = s.position_info && s.position_info.label ? s.position_info.label : (s.position || '?');
        const prog   = s.user && s.user.progress != null ? s.user.progress : null;
        const st     = s.user && s.user.status ? (s.user.status.state || s.user.status.description || '') : '';
        const stL    = st.toLowerCase();
        const desc   = s.user && s.user.status ? (s.user.status.description || '') : '';
        const stIcon = stL === 'okay'     ? '<span style="color:var(--ocm-cpr-good)">\u2713</span>'
          : stL === 'hospital' ? '\uD83C\uDFE5'
          : stL === 'jail'     ? '\u26D3'
          : stL === 'traveling'? '\u2708'
          : stL === 'abroad'   ? (flagFromDescription(desc) + ' ')
          : uid                ? '<span style="color:#555">?</span>'
          : '<span style="color:var(--ocm-cpr-crit)">\u2717</span>';
        const progStr = prog == null ? '' : prog >= 100
          ? '<span style="color:var(--ocm-cpr-good);font-size:9px">\u2713 done</span>'
          : '<span style="color:var(--ocm-cpr-warn);font-size:9px">' + prog.toFixed(0) + '%</span>';
        const nameStyle = isMe ? 'color:var(--ocm-link);font-weight:bold' : !uid ? 'color:#555;font-style:italic' : 'color:#ccc';
        return '<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:11px;border-bottom:1px solid #111">'
          + '<span style="flex:0 0 14px;text-align:center">' + stIcon + '</span>'
          + '<span style="flex:0 0 90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#888" title="' + role + '">' + role + '</span>'
          + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' + nameStyle + '">' + name + (isMe ? ' (you)' : '') + '</span>'
          + progStr
          + '</div>';
      }).join('');

      const borderCol = isStuck ? '#4a2820' : blockedSlots.length ? '#3a3018' : phase === 'ready' ? 'var(--ocm-cpr-good)' : '#2a3040';
      const card = document.createElement('div');
      card.style.cssText = 'background:#1e1e1e;border:1px solid ' + borderCol + ';border-radius:6px;padding:10px 12px;margin-bottom:10px';
      card.innerHTML =
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">'
          + '<span style="font-size:13px;font-weight:bold;color:#e0e0e0">' + (currentOc.name || 'Your OC') + '</span>'
          + '<span style="color:#666;font-size:10px">D' + (currentOc.difficulty != null ? currentOc.difficulty : '?') + ' \xB7 ' + ocSlots.length + ' slots</span>'
          + phaseBadge
        + '</div>'
        + '<div style="font-size:11px;color:#aaa;margin-bottom:8px">' + timerHtml + '</div>'
        + alertHtml
        + '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px;padding:6px 10px;background:#14181e;border-radius:4px;font-size:11px">'
          + '<div><div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.5px">Your Role</div><div style="color:#ccc;font-weight:bold">' + myRole + '</div></div>'
          + '<div><div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.5px">Weight</div><div style="font-weight:bold;color:' + wCol + '">' + (myWeight != null ? myWeight.toFixed(0) + '%' : '\u2014') + '</div></div>'
          + '<div><div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.5px">Your CPR</div><div style="font-weight:bold;color:' + cprCol + '">' + (myCpr != null ? myCpr + '%' : '\u2014') + '</div></div>'
          + '<div style="flex:1;min-width:120px">'
            + '<div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">' + progLabel + '</div>'
            + '<div style="height:5px;background:#0a1020;border-radius:3px;overflow:hidden">'
              + '<div style="height:100%;width:' + progPct + '%;background:' + progCol + ';border-radius:3px;transition:width .3s"></div>'
            + '</div>'
          + '</div>'
        + '</div>'
        + '<div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">All Slots</div>'
        + '<div>' + otherSlotsHtml + '</div>';

      container.appendChild(card);

    } else {
      // ── NOT IN AN OC — show open slot recommendations ─────────────────────────

      const slots = [];
      for (const oc of Object.values(crimes)) {
        if (!oc || (oc.status || '').toLowerCase() !== 'recruiting') continue;
        const ocSlots = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
        for (const slot of ocSlots) {
          if (slot.user && slot.user.id) continue;
          const role   = slot.position_info && slot.position_info.label ? slot.position_info.label : (slot.position || 'Unknown');
          const cpr    = slot.checkpoint_pass_rate != null ? slot.checkpoint_pass_rate : null;
          const weight = getWeight(oc.name || '', role);
          slots.push({
            ocName: oc.name || 'Unknown OC', ocId: oc.id, role, cpr, weight,
            difficulty: oc.difficulty != null ? oc.difficulty : '?',
            expiredAt:  oc.expired_at  != null ? oc.expired_at  : null,
            timeLeft:   oc.time_left   != null ? oc.time_left   : null,
          });
        }
      }

      function urgencyBonus(s) {
        let bonus = 0;
        if (s.expiredAt) {
          const secsToExpiry = s.expiredAt - nowTs;
          if (secsToExpiry > 0 && secsToExpiry < 6  * 3600) bonus += 500;
          else if (secsToExpiry > 0 && secsToExpiry < 24 * 3600) bonus += 200;
        }
        if (s.timeLeft != null) {
          if (s.timeLeft < 12 * 3600) bonus += 100;
          else if (s.timeLeft < 24 * 3600) bonus +=  50;
        }
        return Math.min(bonus, 999);
      }

      const scored = slots.map(s => {
        const cpr    = s.cpr    != null ? s.cpr    : 0;
        const weight = s.weight != null ? s.weight : 15;
        const diff   = Number(s.difficulty) || 0;
        let tag;
        if      (cpr < CPR_CRIT)           tag = 'risky';
        else if (cpr < CPR_WARN)           tag = 'marginal';
        else if (weight < WEIGHT_MID)      tag = 'underutilised';
        else                               tag = 'good';
        const eligible    = cpr >= CPR_WARN;
        const comfort     = eligible ? Math.max(0, (cpr - CPR_WARN) / (100 - CPR_WARN)) : 0;
        const weightBonus = weight * comfort;
        const score       = eligible
          ? diff * 1000 + urgencyBonus(s) + weightBonus + cpr
          : -(1000 - cpr);
        return Object.assign({}, s, { score, tag, eligible, urgent: urgencyBonus(s) > 0 });
      }).sort((a, b) => b.score - a.score);

      if (scored.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'background:#1e1e1e;border:0.5px solid #2e2e2e;border-radius:6px;padding:12px;text-align:center;color:#555;font-size:12px';
        empty.textContent = 'No open recruiting slots found. All current OCs are full or in planning.';
        container.appendChild(empty);
      } else {
        const eligible   = scored.filter(s => s.eligible);
        // Only consider slots with REAL CPR data for the fallback — a slot with
        // null/unknown CPR (common in member mode for roles you're not slotted in)
        // shows as 0% and is meaningless as a "least risky" recommendation.
        const ineligible = scored.filter(s => !s.eligible && s.cpr != null && s.cpr > 0);
        const fallback   = eligible.length === 0 && ineligible.length > 0
          ? [ineligible.sort((a, b) => {
              if ((b.cpr || 0) !== (a.cpr || 0)) return (b.cpr || 0) - (a.cpr || 0);
              return (a.weight || 50) - (b.weight || 50);
            })[0]]
          : [];

        const belowWarn = eligible.length === 0 && fallback.length > 0;
        // No eligible slots AND no below-threshold slots with real CPR data either
        const noCprData = eligible.length === 0 && fallback.length === 0;

        if (noCprData) {
          const info = document.createElement('div');
          info.style.cssText = 'background:#1e1e1e;border:0.5px solid #2e2e2e;border-radius:6px;padding:12px;color:#99a;font-size:12px;line-height:1.5';
          info.innerHTML = 'No CPR data available for the open recruiting slots. '
            + 'In member mode, Torn only returns your checkpoint pass rate for crimes you\u2019ve run before. '
            + 'Run any OC once to build a CPR baseline, or ask your faction leader for the leader-mode view.';
          container.appendChild(info);
          footer.appendChild(container);
          startCountdowns();
          GM_setValue('ocm_sidebar_cache', JSON.stringify({
            name: 'Member Mode', executesAt: null, timeLeft: null, openCount: 0,
            severity: 'ok', issues: [], cachedAt: Math.floor(Date.now() / 1000), memberMode: true,
          }));
          renderSidebarWidget();
          document.getElementById('ocm-last-update').textContent = 'Updated ' + new Date().toLocaleTimeString() + ' \xB7 Member Mode';
          return;
        }

        const title = document.createElement('div');
        title.style.cssText = 'color:var(--ocm-link);font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;border-bottom:1px solid #333;padding-bottom:3px';
        title.textContent = belowWarn
          ? ('No suitable slots above ' + CPR_WARN + '% CPR \u2014 showing least risky option')
          : ('Best slots for ' + memberName + ' (top ' + Math.min(5, eligible.length) + ' of ' + scored.length + ')');
        container.appendChild(title);

        if (belowWarn) {
          const warn = document.createElement('div');
          warn.style.cssText = 'background:#1c1810;border:0.5px solid #4a2820;border-radius:6px;padding:8px 12px;margin-bottom:8px;font-size:11px;color:var(--ocm-cpr-warn)';
          warn.innerHTML = '\u26A0 All open slots are below your CPR warn threshold (' + CPR_WARN + '%). The option below is the least likely to cause the OC to fail \u2014 but consider waiting for a more suitable slot to open up.';
          container.appendChild(warn);
        }

        const display = (belowWarn ? fallback : scored).slice(0, 5);
        for (const s of display) {
          const card      = document.createElement('div');
          const borderCol = s.tag === 'good' ? '#3a5030' : s.tag === 'risky' ? '#4a2820' : s.tag === 'marginal' ? '#1c1810' : '#3a3018';
          card.style.cssText = 'background:#1e1e1e;border:0.5px solid ' + borderCol + ';border-radius:6px;padding:8px 12px;margin-bottom:6px';

          const cprCol = s.cpr == null ? '#555' : s.cpr >= CPR_WARN ? 'var(--ocm-cpr-good)' : s.cpr >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
          const wCol   = s.weight == null ? '#555' : s.weight >= WEIGHT_HIGH ? 'var(--ocm-cpr-warn)' : s.weight >= WEIGHT_MID ? '#aaa' : '#555';
          const cprStr = s.cpr    != null ? (s.cpr    + '%') : '?';
          const wStr   = s.weight != null ? (s.weight.toFixed(0) + '%') : '?';

          let tagHtml = '';
          if      (s.tag === 'good')          tagHtml = '<span style="font-size:10px;background:#14201a;color:var(--ocm-cpr-good);border-radius:3px;padding:1px 6px;margin-left:6px">&#10003; Good fit</span>';
          else if (s.tag === 'underutilised') tagHtml = '<span style="font-size:10px;background:#1c1810;color:var(--ocm-cpr-warn);border-radius:3px;padding:1px 6px;margin-left:6px">&#9432; Low-weight role</span>';
          else if (s.tag === 'marginal')      tagHtml = '<span style="font-size:10px;background:#1c1810;color:var(--ocm-cpr-warn);border-radius:3px;padding:1px 6px;margin-left:6px">&#9888; Marginal CPR</span>';
          else if (s.tag === 'risky')         tagHtml = '<span style="font-size:10px;background:#1c1410;color:var(--ocm-cpr-crit);border-radius:3px;padding:1px 6px;margin-left:6px">&#9888; Below threshold</span>';

          if (s.urgent) {
            const secsLeft = s.expiredAt ? s.expiredAt - Math.floor(Date.now()/1000) : null;
            const urgLabel = secsLeft != null && secsLeft < 6 * 3600
              ? '&#9201; Expires soon'
              : secsLeft != null && secsLeft < 24 * 3600
                ? '&#9201; Expiring today'
                : '&#9201; Nearly ready';
            tagHtml += '<span style="font-size:10px;background:#181810;color:var(--ocm-cpr-warn);border-radius:3px;padding:1px 6px;margin-left:4px">' + urgLabel + '</span>';
          }

          let adviceHtml = '';
          if      (s.tag === 'underutilised') adviceHtml = '<div style="font-size:10px;color:#99a;margin-top:4px">This role has low weight (' + wStr + ') \u2014 your ' + cprStr + ' CPR won\u2019t make much difference here. Check if a higher-weight role is available at this difficulty.</div>';
          else if (s.tag === 'marginal')      adviceHtml = '<div style="font-size:10px;color:#99a;margin-top:4px">Your CPR is slightly below the ' + CPR_WARN + '% threshold. You can join but may hold the OC back \u2014 check if a lower-weight role is available instead.</div>';
          else if (s.tag === 'risky')         adviceHtml = '<div style="font-size:10px;color:#99a;margin-top:4px">Your CPR is below the critical threshold (' + CPR_CRIT + '%). Joining this role is likely to cause the OC to fail. Avoid if possible.</div>';

          card.innerHTML =
            '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">'
              + '<span style="font-weight:bold;color:#e0e0e0;font-size:12px">' + s.role + '</span>'
              + '<span style="color:#888;font-size:11px">in</span>'
              + '<span style="color:var(--ocm-link);font-size:12px">' + s.ocName + '</span>'
              + '<span style="color:#666;font-size:10px">D' + s.difficulty + '</span>'
              + '<span style="margin-left:auto;display:flex;gap:10px;font-size:11px;white-space:nowrap">'
                + '<span>CPR: <strong style="color:' + cprCol + '">' + cprStr + '</strong></span>'
                + '<span>Weight: <strong style="color:' + wCol + '">' + wStr + '</strong></span>'
              + '</span>'
            + '</div>'
            + '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;min-height:18px">' + tagHtml + '</div>'
            + adviceHtml;
          container.appendChild(card);
        }
      }
    }

    footer.appendChild(container);
    startCountdowns();

    GM_setValue('ocm_sidebar_cache', JSON.stringify({
      name: 'Member Mode', executesAt: null, timeLeft: null, openCount: 0,
      severity: 'ok', issues: [], cachedAt: Math.floor(Date.now() / 1000), memberMode: true,
    }));
    renderSidebarWidget();
    document.getElementById('ocm-last-update').textContent = 'Updated ' + new Date().toLocaleTimeString() + ' \xB7 Member Mode';
  }


  // ─── TORNSTATS CPR ────────────────────────────────────────────────────────────

  function fetchTornStatsCpr(tsKey) {
    return gmFetch(`https://www.tornstats.com/api/v2/${tsKey}/faction/cpr`)
      .then(json => {
        if (!json.status) throw new Error(json.message || 'TornStats error');
        return json.members || {};
      });
  }

  function tsLowestCpr(obj) {
    let min = null;
    for (const roles of Object.values(obj)) for (const v of Object.values(roles)) if (min === null || v < min) min = v;
    return min;
  }

  /** Look up a member's TornStats CPR for a specific OC name + role.
   *  Falls back to: any role in same crime → overall lowest CPR.
   *  Returns { cpr, exact } where exact=true if crime+role matched. */
  /** Look up CPR for a member's specific OC role.
   *  Resolution order:
   *    1. TornStats exact crime+role match  (exact: true)
   *    2. TornStats fuzzy crime match, any role  (exact: false)
   *    3. Faction OC history avg for this crime+role  (exact: true, history)
   *    4. Faction OC history avg for this crime, any role  (exact: false, history)
   *    5. TornStats overall lowest  (exact: false)
   *  Returns { cpr, exact, source } | null. */
  function tsGetCpr(uid, ocName, roleName) {
    const normOc   = (ocName || '').toLowerCase().trim().replace(/\s+v\d+$/i, '');
    const normRole = (roleName || '').toLowerCase().trim().replace(/\s*#\d+$/, '');
    const memberData = tsCprData[String(uid)];

    // 1 & 2: TornStats lookup
    if (memberData) {
      for (const [crime, roles] of Object.entries(memberData)) {
        const nc = crime.toLowerCase().trim().replace(/\s+v\d+$/i, '');
        if (nc === normOc || nc.includes(normOc) || normOc.includes(nc)) {
          for (const [role, cpr] of Object.entries(roles)) {
            if (role.toLowerCase().trim() === normRole) return { cpr, exact: true, source: 'ts' };
          }
          const vals = Object.values(roles);
          if (vals.length) return { cpr: Math.min(...vals), exact: false, source: 'ts' };
        }
      }
    }

    // 3 & 4: Faction OC history fallback
    const history = window._ocmHistoryCpr;
    if (history && history[String(uid)]) {
      const memberHist = history[String(uid)];
      for (const [crime, roles] of Object.entries(memberHist)) {
        if (crime === normOc || crime.includes(normOc) || normOc.includes(crime)) {
          // Exact role match
          if (roles[normRole]) {
            const b = roles[normRole];
            return { cpr: Math.round(b.sum / b.count), exact: true, source: 'history' };
          }
          // Fuzzy role match — average all roles in this crime
          const buckets = Object.values(roles);
          if (buckets.length) {
            const totalSum   = buckets.reduce((s, b) => s + b.sum, 0);
            const totalCount = buckets.reduce((s, b) => s + b.count, 0);
            return { cpr: Math.round(totalSum / totalCount), exact: false, source: 'history' };
          }
        }
      }
    }

    // 5: TornStats overall lowest
    if (memberData) {
      const low = tsLowestCpr(memberData);
      if (low !== null) return { cpr: low, exact: false, source: 'ts' };
    }

    // No personal data — return null so caller can flag this member as needing
    // to run an OC first rather than guessing from faction averages.
    return null;
  }

  /**
   * Profit tab — aggregates money, item value, and respect from completed OCs.
   * Item value = quantity × market_price (from /torn/items value.market_price).
   * Built from the same ~100-OC completed window the rest of the dashboard uses.
   */
  function renderProfitSection(crimes, itemValues = {}, itemNames = {}) {
    const el = document.getElementById('ocm-profit');
    if (!el) return;

    const fmtMoney = n => {
      const v = Math.round(Number(n) || 0);
      if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'b';
      if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'm';
      if (Math.abs(v) >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'k';
      return '$' + v.toLocaleString();
    };
    const normStatus = raw => {
      const s = (raw || '').toLowerCase().trim();
      if (s === 'successful' || s === 'success') return 'successful';
      if (s === 'failure' || s === 'failed' || s === 'fail') return 'failure';
      if (s === 'expired' || s === 'expire') return 'expired';
      return null;
    };
    const normName = raw => (raw || 'Unknown').trim().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/\s+[Vv]\d+$/, '').trim();

    // View mode: 'window' (API ~100-OC window) or 'tracked' (persistent all-time ledger)
    const viewMode = GM_getValue('ocm_profit_view', 'window');
    // Date cutoff (unix seconds). 0 = no cutoff.
    // On first ever run we stamp "now" so the default view shows profit since you
    // started using this version (i.e. roughly since you took over the faction),
    // rather than mixing in OCs the previous owner ran. User can clear it anytime.
    let sinceTs = Number(GM_getValue('ocm_profit_since', -1));
    if (sinceTs === -1) {
      sinceTs = Math.floor(Date.now() / 1000);
      GM_setValue('ocm_profit_since', sinceTs);
    }
    sinceTs = sinceTs || 0;

    // Build a unified list of {id, name, money, itemValue, respect, executedAt, items{}}
    // from either the live crimes (window) or the persistent ledger (tracked).
    let records = [];
    if (viewMode === 'tracked') {
      const ledger = loadProfitLedger();
      records = Object.entries(ledger).map(([id, r]) => ({ id, ...r }));
    } else {
      for (const oc of Object.values(crimes)) {
        if (!oc || normStatus(oc.status) !== 'successful' || !oc.rewards) continue;
        const rewards = oc.rewards;
        const rwItems = rewards.items
          ? (Array.isArray(rewards.items) ? rewards.items : Object.values(rewards.items))
          : [];
        let itemValue = 0;
        const items = {};
        for (const it of rwItems) {
          const iid = String(it?.id || it?.item_id || '');
          const qty = Number(it?.quantity || it?.qty || 1);
          if (!iid) continue;
          items[iid] = (items[iid] || 0) + qty;
          itemValue += (Number(itemValues[iid]) || 0) * qty;
        }
        records.push({
          id: String(oc.id ?? ''),
          name: oc.name || 'Unknown',
          money: Number(rewards.money) || 0,
          itemValue,
          respect: Number(rewards.respect) || 0,
          executedAt: oc.executed_at ?? null,
          items,
        });
      }
    }

    // Apply date cutoff
    const allCount = records.length;
    if (sinceTs > 0) records = records.filter(r => (r.executedAt || 0) >= sinceTs);

    // Aggregate
    let totalMoney = 0, totalItemValue = 0, totalRespect = 0;
    const byScenario = {};
    const byItem     = {};
    let earliest = Infinity, latest = 0;
    for (const r of records) {
      const name = normName(r.name);
      totalMoney     += r.money;
      totalItemValue += r.itemValue;
      totalRespect   += r.respect;
      if (r.executedAt) { earliest = Math.min(earliest, r.executedAt); latest = Math.max(latest, r.executedAt); }
      if (!byScenario[name]) byScenario[name] = { runs: 0, money: 0, itemValue: 0, respect: 0 };
      byScenario[name].runs++;
      byScenario[name].money     += r.money;
      byScenario[name].itemValue += r.itemValue;
      byScenario[name].respect   += r.respect;
      for (const [iid, qty] of Object.entries(r.items || {})) {
        const unit = (viewMode === 'tracked')
          ? (r.itemValue && Object.keys(r.items).length ? (Number(itemValues[iid]) || 0) : (Number(itemValues[iid]) || 0))
          : (Number(itemValues[iid]) || 0);
        if (!byItem[iid]) byItem[iid] = { qty: 0, unitValue: Number(itemValues[iid]) || unit, total: 0 };
        byItem[iid].qty   += qty;
        byItem[iid].total += (byItem[iid].unitValue || 0) * qty;
      }
    }
    const ocCount = records.length;
    const grandTotal = totalMoney + totalItemValue;
    const days = (earliest !== Infinity && latest > earliest) ? Math.max(1, (latest - earliest) / 86400) : 1;
    const perDay = grandTotal / days;

    // ── Controls: view toggle + date cutoff
    const sinceDateStr = sinceTs > 0 ? new Date(sinceTs * 1000).toISOString().slice(0, 10) : '';
    const controls = `
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px;padding:8px 10px;background:#181818;border:1px solid #2e2e2e;border-radius:6px">
        <div style="display:flex;gap:4px;align-items:center">
          <span style="font-size:10px;color:#889;text-transform:uppercase;letter-spacing:.5px">View</span>
          <button class="ocm-profit-view-btn" data-view="window" style="font-size:11px;padding:3px 9px;border-radius:4px;cursor:pointer;border:1px solid ${viewMode==='window'?'var(--ocm-link)':'#3a3018'};background:${viewMode==='window'?'#14181e':'#1c1810'};color:${viewMode==='window'?'var(--ocm-link)':'#99a'}">API window</button>
          <button class="ocm-profit-view-btn" data-view="tracked" style="font-size:11px;padding:3px 9px;border-radius:4px;cursor:pointer;border:1px solid ${viewMode==='tracked'?'var(--ocm-link)':'#3a3018'};background:${viewMode==='tracked'?'#14181e':'#1c1810'};color:${viewMode==='tracked'?'var(--ocm-link)':'#99a'}">All-time (tracked)</button>
        </div>
        <div style="display:flex;gap:5px;align-items:center;margin-left:auto">
          <span style="font-size:10px;color:#889;text-transform:uppercase;letter-spacing:.5px">Profit since</span>
          <input type="date" id="ocm-profit-since" value="${sinceDateStr}" style="background:#1c1810;border:1px solid #3a3018;border-radius:4px;color:#e0e0e0;padding:3px 6px;font-size:11px" />
          <button id="ocm-profit-since-clear" style="font-size:11px;padding:3px 8px;border-radius:4px;cursor:pointer;border:1px solid #3a3018;background:#1c1810;color:#99a">All dates</button>
        </div>
      </div>`;

    // ── View-specific note
    const viewNote = viewMode === 'tracked'
      ? `Tracked total accumulates every completed OC this script has seen since you started running v3.5.1+ (survives past the API's ~100-OC cap). ${allCount} OC${allCount!==1?'s':''} recorded${sinceTs>0?` · ${ocCount} after cutoff`:''}.`
      : `Live API window — the ~100 most recent completed OCs Torn returns. Includes OCs run before you took over the faction.${sinceTs>0?` Showing ${ocCount} of ${allCount} after cutoff.`:''}`;

    if (ocCount === 0) {
      el.innerHTML = controls
        + '<div style="color:#99a;font-size:12px;padding:14px;line-height:1.5">'
        + (viewMode === 'tracked'
            ? 'No OCs recorded yet. The all-time tracker starts logging completed OCs from now on — check back after your faction completes some.'
            : 'No completed-OC reward data in this window' + (sinceTs>0?' after your cutoff date':'') + '. '
              + 'Profit appears here once your faction completes OCs that pay out money or items.')
        + '<br><span style="color:#667;font-size:11px">' + viewNote + '</span>'
        + '</div>';
      wireProfitControls();
      return;
    }

    const kpis = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <div style="flex:1;min-width:120px;background:#1e1e1e;border:1px solid #2e2e2e;border-radius:6px;padding:10px 14px">
          <div style="font-size:9px;color:#889;text-transform:uppercase;letter-spacing:.5px">Total Profit</div>
          <div style="font-size:20px;font-weight:bold;color:var(--ocm-cpr-good)">${fmtMoney(grandTotal)}</div>
          <div style="font-size:10px;color:#667">money + item value</div>
        </div>
        <div style="flex:1;min-width:110px;background:#1e1e1e;border:1px solid #2e2e2e;border-radius:6px;padding:10px 14px">
          <div style="font-size:9px;color:#889;text-transform:uppercase;letter-spacing:.5px">Cash</div>
          <div style="font-size:20px;font-weight:bold;color:#dde">${fmtMoney(totalMoney)}</div>
          <div style="font-size:10px;color:#667">paid out</div>
        </div>
        <div style="flex:1;min-width:110px;background:#1e1e1e;border:1px solid #2e2e2e;border-radius:6px;padding:10px 14px">
          <div style="font-size:9px;color:#889;text-transform:uppercase;letter-spacing:.5px">Item Value</div>
          <div style="font-size:20px;font-weight:bold;color:var(--ocm-cpr-warn)">${fmtMoney(totalItemValue)}</div>
          <div style="font-size:10px;color:#667">market est.</div>
        </div>
        <div style="flex:1;min-width:100px;background:#1e1e1e;border:1px solid #2e2e2e;border-radius:6px;padding:10px 14px">
          <div style="font-size:9px;color:#889;text-transform:uppercase;letter-spacing:.5px">Respect</div>
          <div style="font-size:20px;font-weight:bold;color:var(--ocm-link)">${totalRespect.toLocaleString()}</div>
          <div style="font-size:10px;color:#667">${ocCount} OCs</div>
        </div>
        <div style="flex:1;min-width:110px;background:#1e1e1e;border:1px solid #2e2e2e;border-radius:6px;padding:10px 14px">
          <div style="font-size:9px;color:#889;text-transform:uppercase;letter-spacing:.5px">~ Per Day</div>
          <div style="font-size:20px;font-weight:bold;color:#dde">${fmtMoney(perDay)}</div>
          <div style="font-size:10px;color:#667">over ${days.toFixed(0)}d</div>
        </div>
      </div>`;

    const scenRows = Object.entries(byScenario)
      .map(([name, s]) => ({ name, ...s, total: s.money + s.itemValue }))
      .sort((a, b) => b.total - a.total);
    const scenTable = `
      <div class="ocm-section-title" style="cursor:default" id="ocm-profit-scen-title">By Scenario</div>
      <table class="ocm-analytics-table" style="table-layout:fixed;width:100%">
        <thead><tr>
          <th style="width:auto">OC</th>
          <th class="td-right" style="width:48px">Runs</th>
          <th class="td-right" style="width:80px">Cash</th>
          <th class="td-right" style="width:80px">Items</th>
          <th class="td-right" style="width:90px">Total</th>
          <th class="td-right" style="width:64px">Avg/Run</th>
        </tr></thead>
        <tbody>${scenRows.map(r => `<tr>
            <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.name}">${r.name}</td>
            <td class="td-right">${r.runs}</td>
            <td class="td-right" style="color:#bcd">${fmtMoney(r.money)}</td>
            <td class="td-right" style="color:var(--ocm-cpr-warn)">${fmtMoney(r.itemValue)}</td>
            <td class="td-right" style="color:var(--ocm-cpr-good);font-weight:bold">${fmtMoney(r.total)}</td>
            <td class="td-right" style="color:#99a">${fmtMoney(r.total / r.runs)}</td>
          </tr>`).join('')}</tbody>
      </table>`;

    const itemRows = Object.entries(byItem)
      .map(([id, it]) => ({ id, name: itemNames[id] || `Item #${id}`, ...it }))
      .sort((a, b) => b.total - a.total);
    const itemTable = itemRows.length === 0 ? '' : `
      <div class="ocm-section-title" style="cursor:default;margin-top:12px" id="ocm-profit-item-title">Items Received</div>
      <table class="ocm-analytics-table" style="table-layout:fixed;width:100%">
        <thead><tr>
          <th style="width:auto">Item</th>
          <th class="td-right" style="width:60px">Qty</th>
          <th class="td-right" style="width:90px">Unit Value</th>
          <th class="td-right" style="width:90px">Total Value</th>
        </tr></thead>
        <tbody>${itemRows.map(r => `<tr>
          <td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.name}">
            <a href="https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=${r.id}" target="_blank" style="color:var(--ocm-link);text-decoration:none">${r.name}</a>
          </td>
          <td class="td-right">${r.qty.toLocaleString()}</td>
          <td class="td-right" style="color:#99a">${fmtMoney(r.unitValue)}</td>
          <td class="td-right" style="color:var(--ocm-cpr-warn);font-weight:bold">${fmtMoney(r.total)}</td>
        </tr>`).join('')}</tbody>
      </table>`;

    el.innerHTML = controls + kpis + scenTable + itemTable
      + '<div style="font-size:10px;color:#667;margin-top:10px;line-height:1.5">'
      + viewNote + ' Cash is the payout recorded on each OC; item value is an estimate using current market price × quantity (actual sale value varies).'
      + '</div>';

    wireProfitControls();

    function wireProfitControls() {
      el.querySelectorAll('.ocm-profit-view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          GM_setValue('ocm_profit_view', btn.dataset.view);
          renderProfitSection(crimes, itemValues, itemNames);
        });
      });
      const sinceInput = document.getElementById('ocm-profit-since');
      if (sinceInput) {
        sinceInput.addEventListener('change', () => {
          const v = sinceInput.value;
          if (v) {
            const ts = Math.floor(new Date(v + 'T00:00:00Z').getTime() / 1000);
            GM_setValue('ocm_profit_since', ts);
          } else {
            GM_setValue('ocm_profit_since', 0);
          }
          renderProfitSection(crimes, itemValues, itemNames);
        });
      }
      const clearBtn = document.getElementById('ocm-profit-since-clear');
      if (clearBtn) clearBtn.addEventListener('click', () => {
        GM_setValue('ocm_profit_since', 0);
        renderProfitSection(crimes, itemValues, itemNames);
      });
    }
  }


  function renderTsCprSection(memberMap, liveCprMap = {}) {
    const el = document.getElementById('ocm-tscpr'), title = document.getElementById('ocm-title-tscpr');
    if (!el) return;
    if (!tsCprData || Object.keys(tsCprData).length === 0) {
      if (title) title.textContent = '📈 TornStats CPR';
      el.innerHTML = '<span style="color:#555;font-size:11px">No data. Add TornStats key in \u2699 Config \u2192 \u2b07 Fetch CPR.</span>';
      return;
    }
    const idToName = {};
    if (memberMap) for (const m of Object.values(memberMap)) idToName[String(m.id)] = m.name || `#${m.id}`;
    const byCrime = {};
    for (const [uid, crimes] of Object.entries(tsCprData))
      for (const [crime, roles] of Object.entries(crimes))
        for (const [role, cpr] of Object.entries(roles)) {
          if (!byCrime[crime]) byCrime[crime] = {};
          if (!byCrime[crime][role]) byCrime[crime][role] = [];
          byCrime[crime][role].push({ uid, name: idToName[uid] || `#${uid}`, cpr });
        }
    const diffMap = window._ocmCrimeDiffMap || {};
    const crimeNames = Object.keys(byCrime).sort((a, b) => {
      const da = diffMap[a.toLowerCase().trim()] ?? 999;
      const db = diffMap[b.toLowerCase().trim()] ?? 999;
      return da - db || a.localeCompare(b);
    });
    if (title) title.textContent = `📈 TornStats CPR \u2014 ${Object.keys(tsCprData).length} members, ${crimeNames.length} crimes`;
    let html = '';
    for (const crime of crimeNames) {
      const crimeKey = crime.toLowerCase().trim();
      const roles = Object.keys(byCrime[crime]).sort();
      const ms = new Map();
      for (const role of roles) for (const e of byCrime[crime][role]) if (!ms.has(e.uid)) ms.set(e.uid, e.name);

      // cprs[uid][role] = { cpr, live } — live flag set when overridden by a current slot
      const cprs = {};
      for (const role of roles) {
        const roleKey = role.replace(/\s*#\d+$/, '').toLowerCase().trim();
        for (const { uid, cpr } of byCrime[crime][role]) {
          if (!cprs[uid]) cprs[uid] = {};
          const live = liveCprMap[uid]?.[crimeKey]?.[roleKey];
          cprs[uid][role] = (live != null) ? { cpr: live, live: true } : { cpr, live: false };
        }
      }
      const sorted = [...ms.keys()].sort((a, b) =>
        Math.min(...Object.values(cprs[a] || {}).map(o => o.cpr)) -
        Math.min(...Object.values(cprs[b] || {}).map(o => o.cpr)));

      // Header columns: role name + its weight (from getWeight)
      const thCols = roles.map(r => {
        const w = getWeight(crime, r.replace(/\s*#\d+$/, ''));
        const wLabel = w != null
          ? `<span style="color:var(--ocm-cpr-warn);font-weight:normal;font-size:9px;display:block;line-height:1.2">W ${w.toFixed(0)}%</span>`
          : '';
        return `<th style="text-align:right;min-width:62px">${r}${wLabel}</th>`;
      }).join('');

      const diff = diffMap[crimeKey];
      const diffBadge = diff != null ? `<span style="color:var(--ocm-link);font-size:10px;margin-left:6px;font-weight:normal">D${diff}</span>` : '';
      const rows = sorted.map(uid => {
        const cells = roles.map(role => {
          const entry = cprs[uid]?.[role];
          if (entry == null) return '<td style="text-align:right;color:#555">\u2013</td>';
          const v = entry.cpr;
          const col = v >= CPR_WARN ? 'var(--ocm-cpr-good)' : v >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
          // Live (currently-slotted) values get a small dot + tooltip so it's clear
          // this is their REAL current CPR, not the TornStats estimate.
          const liveMark = entry.live
            ? `<span title="Live CPR from their current OC slot (overrides TornStats estimate)" style="color:var(--ocm-link);font-size:9px;margin-right:2px">\u25cf</span>`
            : '';
          return `<td style="text-align:right;font-weight:bold;color:${col}">${liveMark}${v}%</td>`;
        }).join('');
        return `<tr><td><a href="/profiles.php?XID=${uid}" target="_blank" style="color:#ccc;text-decoration:none">${ms.get(uid)}</a></td>${cells}</tr>`;
      }).join('');
      html += `<div class="ocm-tscpr-oc-block"><div class="ocm-tscpr-oc-header collapsed"><span class="ocm-tscpr-arrow">\u25bc</span>${crime}${diffBadge} <span style="color:#666;font-weight:normal;font-size:10px">(${sorted.length} members)</span></div><div class="ocm-tscpr-oc-body" style="display:none"><table class="ocm-tscpr-table"><thead><tr><th>Member</th>${thCols}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('.ocm-tscpr-oc-header').forEach(h => h.addEventListener('click', () => { const b = h.nextElementSibling; const vis = b.style.display === 'none'; b.style.display = vis ? '' : 'none'; h.classList.toggle('collapsed', !vis); }));
  }

  function injectTsBadges(el) {
    if (!tsCprData || Object.keys(tsCprData).length === 0) return;
    el.querySelectorAll('a[href*="profiles.php"]').forEach(link => {
      const m = link.href.match(/XID=(\d+)/);
      if (!m || !tsCprData[m[1]] || link.parentNode.querySelector('.ocm-ts-badge')) return;
      const low = tsLowestCpr(tsCprData[m[1]]); if (low === null) return;
      const col = low >= CPR_WARN ? 'var(--ocm-cpr-good)' : low >= CPR_CRIT ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-crit)';
      const b = document.createElement('span'); b.className = 'ocm-ts-badge'; b.style.color = col;
      b.title = `TornStats lowest CPR: ${low}%`; b.textContent = `TS:${low}%`;
      link.insertAdjacentElement('afterend', b);
    });
  }

  // ─── LOAD DATA ───────────────────────────────────────────────────────────────

  /** Entry point for a data refresh. Falls back to member mode silently on faction API error. */
  async function loadData(apiKey) {
    const errEl = document.getElementById('ocm-error');
    const btn   = document.getElementById('ocm-refresh-btn');
    errEl.style.display = 'none';
    btn.innerHTML = '<span class="ocm-spinner"></span>Loading…';
    btn.disabled  = true;

    // If user has Force Member Mode enabled in Config, skip the leader fetch
    // entirely and go straight to member-mode rendering. This is a preview /
    // testing toggle for users whose API key works for both modes.
    const forceMember = GM_getValue('ocm_force_member', false);
    if (forceMember) {
      // Reveal the View Mode config section so the toggle remains reachable —
      // otherwise the user is locked in member mode with no way to switch back.
      const mmSection0 = document.getElementById('ocm-cfg-section-membermode');
      if (mmSection0) mmSection0.style.display = '';
      const fmEl0 = document.getElementById('ocm-cfg-force-member');
      if (fmEl0) fmEl0.checked = true;
      try {
        const data = await fetchMember(apiKey);
        window._ocmDebug = { mode: 'member', fetchedAt: Date.now(), data, forced: true };
        renderMemberDashboard(data);
        document.getElementById('ocm-key-status').textContent = `Key saved ✓ · Member Mode (forced) · ↻${REFRESH_S}s`;
        btn.innerHTML = '↻ Refresh';
        btn.disabled  = false;
        return;
      } catch (memberErr) {
        document.getElementById('ocm-body').style.display = 'block';
        errEl.innerHTML = `&#9888; Member mode fetch failed: ${memberErr.message}`;
        errEl.style.display = 'block';
        btn.innerHTML = '↻ Refresh';
        btn.disabled  = false;
        return;
      }
    }

    try {
      const { faction, members, armory, itemNames, itemValues, lastOc, exMemberNames, viewerId } = await fetchAll(apiKey);
      // Stash for debug snapshot — sanitised on demand, not here
      window._ocmDebug = { mode: 'leader', fetchedAt: Date.now(), faction, members, armory, itemNames, lastOc, exMemberNames };
      renderDashboard(faction, members, armory, itemNames, lastOc, exMemberNames, itemValues, viewerId);
      // Leader mode succeeded — show the View Mode toggle in Config
      const mmSection = document.getElementById('ocm-cfg-section-membermode');
      if (mmSection) mmSection.style.display = '';
      const _tsK = GM_getValue('ocm_ts_key', '');
      if (_tsK && !isTsCprCacheFresh() && !_tsFetchInFlight && (Date.now() - _tsLastFailAt > TS_FAIL_COOLDOWN)) {
        _tsFetchInFlight = true;
        fetchTornStatsCpr(_tsK)
          .then(d => {
            saveTsCprCache(d);
            renderDashboard(faction, members, armory, itemNames, lastOc, exMemberNames, itemValues, viewerId);
          })
          .catch(err => {
            // Record failure so we don't keep hammering the API every refresh
            _tsLastFailAt = Date.now();
            console.warn('[OCM] TornStats fetch failed, backing off for 10 min:', err);
          })
          .finally(() => { _tsFetchInFlight = false; });
      }
    } catch (leaderErr) {
      // Faction access failed — log it so we can debug, then try member mode
      console.warn('[OCM] Leader mode failed, falling back to member mode:', leaderErr);
      try {
        const data = await fetchMember(apiKey);
        window._ocmDebug = { mode: 'member', fetchedAt: Date.now(), data, leaderErr: leaderErr.message };
        renderMemberDashboard(data);
        document.getElementById('ocm-key-status').textContent = `Key saved ✓ · Member Mode · ↻${REFRESH_S}s · (leader: ${leaderErr.message})`;
      } catch (memberErr) {
        // Both failed — show error and open config panel
        document.getElementById('ocm-body').style.display = 'block';
        document.getElementById('ocm-config-panel').style.display = 'block';
        errEl.innerHTML = `&#9888; Could not load data: ${memberErr.message}<br>
          <span style="font-size:11px;color:var(--ocm-cpr-warn)">Please check your API key in &#9881; Config.</span>`;
        errEl.style.display = 'block';
      }
    } finally {
      btn.innerHTML = '↻ Refresh';
      btn.disabled  = false;
    }
  }

  /** Schedule the auto-refresh interval. Clears any existing interval first. */
  function scheduleRefresh(apiKey) {
    clearInterval(window._ocmRefresh);
    window._ocmRefresh = setInterval(() => loadData(apiKey), REFRESH_S * 1000);
    document.getElementById('ocm-footer').textContent = `Auto-refreshes every ${REFRESH_S}s`;
  }

  // ─── COLLAPSE / EXPAND ───────────────────────────────────────────────────────

  /** Wire up all collapsible sections with GM_setValue persistence. */
  function initCollapse() {
    // defaultOpen: section is expanded on first load when it has content.
    // Otherwise it starts collapsed. User clicks still persist via GM_setValue.
    [
      { titleId: 'ocm-title-available',     contentId: 'ocm-available',     defaultOpen: true  },
      { titleId: 'ocm-title-recruits',      contentId: 'ocm-recruits',      defaultOpen: true  },
      { titleId: 'ocm-title-blocked',       contentId: 'ocm-blocked',       defaultOpen: true  },
      { titleId: 'ocm-title-lowcpr',        contentId: 'ocm-lowcpr',        defaultOpen: true  },
      { titleId: 'ocm-title-overqualified', contentId: 'ocm-overqualified', defaultOpen: true  },
      { titleId: 'ocm-title-tscpr',         contentId: 'ocm-tscpr',         defaultOpen: false },
      { titleId: 'ocm-title-analytics',     contentId: 'ocm-analytics',     defaultOpen: false },
      { titleId: 'ocm-title-downloads',     contentId: 'ocm-downloads',     defaultOpen: false },
    ].forEach(({ titleId, contentId, defaultOpen }) => {
      const title   = document.getElementById(titleId);
      const content = document.getElementById(contentId);
      if (!title || !content) return;

      // Check if section has actual content worth showing: pull the (N) count
      // from the title text. If 0 (or no count), don't auto-open even if defaultOpen=true.
      const m = title.textContent.match(/\((\d+)\)/);
      const sectionCount = m ? Number(m[1]) : null;
      const hasContent = sectionCount === null ? true : sectionCount > 0;

      const saved = GM_getValue(`ocm_collapse_${contentId}`, null);
      let shouldOpen;
      if (saved === 'open')         shouldOpen = true;
      else if (saved === 'collapsed') shouldOpen = false;
      else                          shouldOpen = defaultOpen && hasContent; // first visit

      if (shouldOpen) { content.style.display = ''; title.classList.remove('collapsed'); }
      else            { content.style.display = 'none'; title.classList.add('collapsed'); }

      title.addEventListener('click', () => {
        const isCollapsed = content.style.display === 'none';
        content.style.display = isCollapsed ? '' : 'none';
        title.classList.toggle('collapsed', !isCollapsed);
        GM_setValue(`ocm_collapse_${contentId}`, isCollapsed ? 'open' : 'collapsed');
      });
    });

    [
      { headerId: 'ocm-planning-header',   gridId: 'ocm-grid-planning'   },
      { headerId: 'ocm-recruiting-header', gridId: 'ocm-grid-recruiting' },
    ].forEach(({ headerId, gridId }) => {
      const header = document.getElementById(headerId);
      const grid   = document.getElementById(gridId);
      if (!header || !grid) return;

      const saved = GM_getValue(`ocm_collapse_${gridId}`, 'open');
      if (saved === 'collapsed') { grid.style.display = 'none'; header.classList.add('collapsed'); }

      header.addEventListener('click', () => {
        const isCollapsed = grid.style.display === 'none';
        grid.style.display = isCollapsed ? '' : 'none';
        header.classList.toggle('collapsed', !isCollapsed);
        GM_setValue(`ocm_collapse_${gridId}`, isCollapsed ? 'open' : 'collapsed');
      });
    });
  }

  /** Wire up the group tabs — exactly one pane visible at a time. Remembers
   *  the last selected tab via GM_setValue. */
  function initTabs() {
    const tabs  = document.querySelectorAll('.ocm-tab');
    const panes = document.querySelectorAll('.ocm-tab-pane');
    if (!tabs.length) return;

    function activate(tabName) {
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
      panes.forEach(p => p.classList.toggle('active', p.id === `ocm-pane-${tabName}`));
      GM_setValue('ocm_active_tab', tabName);
    }

    tabs.forEach(t => {
      t.addEventListener('click', () => activate(t.dataset.tab));
    });

    // Default to Action tab on first load, or whichever was last open
    const saved = GM_getValue('ocm_active_tab', 'action');
    activate(saved);
  }

  /** Pulls (N) counts from each section title and updates tab badges.
   *  Called from renderDashboard after sections are populated. */
  function updateTabCounts() {
    function count(titleId) {
      const el = document.getElementById(titleId);
      if (!el) return 0;
      const m = el.textContent.match(/\((\d+)\)/);
      return m ? Number(m[1]) : 0;
    }
    const counts = {
      action:   count('ocm-title-available') + count('ocm-title-recruits'),
      status:   count('ocm-title-blocked'),
      optimize: count('ocm-title-lowcpr') + count('ocm-title-overqualified'),
    };
    // Active OCs: count from the planning + recruiting headers. After render,
    // the headers' innerHTML is rebuilt with the count inside an
    // <span class="ocm-phase-count">(N)</span>, so we parse from the header text.
    function extractCount(headerId) {
      const el = document.getElementById(headerId);
      if (!el) return 0;
      const m = el.textContent.match(/\((\d+)\)/);
      return m ? Number(m[1]) : 0;
    }
    counts.ocs = extractCount('ocm-planning-header') + extractCount('ocm-recruiting-header');

    // Update badge text + flag attention (red dot if section has the kind of issue you'd want to know about)
    function setBadge(id, val, attn) {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = val;
      el.classList.toggle('has-attn', !!attn);
    }
    setBadge('ocm-tab-count-action',   counts.action,   counts.action > 0);
    setBadge('ocm-tab-count-status',   counts.status,   counts.status > 0);
    setBadge('ocm-tab-count-optimize', counts.optimize, count('ocm-title-lowcpr') > 0);
    setBadge('ocm-tab-count-ocs',      counts.ocs,      false);
  }

  // ─── INJECT MAIN DASHBOARD ───────────────────────────────────────────────────

  /** Inject the dashboard into the OC tab when the URL matches. */
  function inject() {
    if (document.getElementById('ocm-root')) return;

    // Match the normal crimes tab, OR the faction profile/your page when the
    // player is travelling/abroad (Torn strips the crimes tab in that state).
    function isOcTab() {
      const isTraveling = document.body.dataset.traveling === 'true' || document.body.dataset.abroad === 'true';
      return location.href.includes('factions.php') && (
        location.hash.includes('tab=crimes') ||
        (isTraveling && (location.href.includes('step=profile') || location.href.includes('step=your')))
      );
    }

    if (!isOcTab()) {
      window.addEventListener('hashchange', () => { if (isOcTab() && !document.getElementById('ocm-root')) inject(); });
      return;
    }

    const isTraveling = document.body.dataset.traveling === 'true' || document.body.dataset.abroad === 'true';

    const tryInsert = setInterval(() => {
      const anchor = isTraveling
        ? (document.querySelector('#react-root') ||
           document.querySelector('.content-wrapper'))
        : (document.querySelector('.faction-crimes-wrap') ||
           document.querySelector('#faction-crimes')       ||
           document.querySelector('.content-wrapper')      ||
           document.querySelector('#mainContainer'));

      if (!anchor) return;
      clearInterval(tryInsert);

      const root = buildRoot();
      anchor.parentNode.insertBefore(root, anchor);
      initCollapse();
      initTabs();

      // Apply saved theme immediately, then wire the selector
      const savedTheme = GM_getValue('ocm_theme', 'default');
      applyTheme(savedTheme);
      const themeSelect = document.getElementById('ocm-theme-select');
      if (themeSelect) {
        themeSelect.value = savedTheme;
        themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));
      }

      const savedKey = GM_getValue('ocm_api_key', '');
      if (savedKey) {
        document.getElementById('ocm-api-input').value = '••••••••••••••••';
        document.getElementById('ocm-key-status').textContent = `Key saved ✓ · CPR ${CPR_WARN}%/${CPR_CRIT}% · W ${WEIGHT_HIGH}%/${WEIGHT_MID}% · ↻${REFRESH_S}s`;
        loadData(savedKey);
        scheduleRefresh(savedKey);
      } else {
        // No key saved — open config panel automatically
        document.getElementById('ocm-config-panel').style.display = 'block';
      }

      // Config panel toggle
      document.getElementById('ocm-config-toggle').addEventListener('click', () => {
        const panel = document.getElementById('ocm-config-panel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      });

      // Force Member Mode toggle — init from saved state, save on change, reload
      const forceMemberEl = document.getElementById('ocm-cfg-force-member');
      if (forceMemberEl) {
        forceMemberEl.checked = GM_getValue('ocm_force_member', false);
        forceMemberEl.addEventListener('change', () => {
          GM_setValue('ocm_force_member', forceMemberEl.checked);
          const k = GM_getValue('ocm_api_key', '');
          if (k) loadData(k);
        });
      }

      // Save API key
      document.getElementById('ocm-save-key-btn').addEventListener('click', () => {
        const key = document.getElementById('ocm-api-input').value.trim();
        if (!key || key.startsWith('•')) {
          const k = GM_getValue('ocm_api_key', '');
          if (k) { loadData(k); scheduleRefresh(k); }
          return;
        }
        GM_setValue('ocm_api_key', key);
        document.getElementById('ocm-api-input').value = '••••••••••••••••';
        document.getElementById('ocm-key-status').textContent = `Key saved ✓ · CPR ${CPR_WARN}%/${CPR_CRIT}% · W ${WEIGHT_HIGH}%/${WEIGHT_MID}% · ↻${REFRESH_S}s`;
        loadData(key);
        scheduleRefresh(key);
      });

      // Save all settings
      document.getElementById('ocm-cfg-save-btn').addEventListener('click', () => {
        const warn       = Number(document.getElementById('ocm-cfg-cpr-warn').value)      || 70;
        const crit       = Number(document.getElementById('ocm-cfg-cpr-crit').value)      || 60;
        const wHigh      = Number(document.getElementById('ocm-cfg-w-high').value)        || 25;
        const wMid       = Number(document.getElementById('ocm-cfg-w-mid').value)         || 15;
        const refresh    = Number(document.getElementById('ocm-cfg-refresh').value)       || 60;
        const minPerDiff = Number(document.getElementById('ocm-cfg-min-per-diff').value)  ?? 2;
        saveConfig(warn, crit, wHigh, wMid, refresh, minPerDiff);
        document.getElementById('ocm-key-status').textContent = `Key saved ✓ · CPR ${CPR_WARN}%/${CPR_CRIT}% · W ${WEIGHT_HIGH}%/${WEIGHT_MID}% · ↻${REFRESH_S}s`;
        document.getElementById('ocm-cfg-status').textContent = 'Saved ✓';
        setTimeout(() => { document.getElementById('ocm-cfg-status').textContent = ''; }, 2000);
        const key = GM_getValue('ocm_api_key', '');
        if (key) { scheduleRefresh(key); loadData(key); }
      });

      // Reset to defaults
      document.getElementById('ocm-cfg-reset-btn').addEventListener('click', () => {
        saveConfig(70, 60, 25, 15, 60, 2);
        document.getElementById('ocm-cfg-cpr-warn').value    = 70;
        document.getElementById('ocm-cfg-cpr-crit').value    = 60;
        document.getElementById('ocm-cfg-w-high').value      = 25;
        document.getElementById('ocm-cfg-w-mid').value       = 15;
        document.getElementById('ocm-cfg-refresh').value     = 60;
        document.getElementById('ocm-cfg-min-per-diff').value = 2;
        document.getElementById('ocm-key-status').textContent = `Key saved ✓ · CPR 70%/60% · W 25%/15% · ↻60s`;
        document.getElementById('ocm-cfg-status').textContent = 'Reset to defaults ✓';
        setTimeout(() => { document.getElementById('ocm-cfg-status').textContent = ''; }, 2000);
        const key = GM_getValue('ocm_api_key', '');
        if (key) { scheduleRefresh(key); loadData(key); }
      });

      // Manual refresh button
      document.getElementById('ocm-refresh-btn').addEventListener('click', () => {
        const key = GM_getValue('ocm_api_key', '');
        if (key) loadData(key);
      });

      // ── Debug snapshot — gathers internal state for troubleshooting
      function buildDebugSnapshot() {
        const dbg = window._ocmDebug || {};
        const tsCacheRaw = GM_getValue('ocm_ts_cpr_cache', '{}');
        let tsCacheMeta = { hasCache: false };
        try {
          const parsed = JSON.parse(tsCacheRaw);
          tsCacheMeta = {
            hasCache: !!parsed.ts,
            cachedAt: parsed.ts ? new Date(parsed.ts).toISOString() : null,
            memberCount: parsed.data ? Object.keys(parsed.data).length : 0,
            sampleMember: parsed.data ? Object.entries(parsed.data)[0] : null,
          };
        } catch (_) {}

        // Sanitise the raw faction data — keep structure, redact sensitive details
        function sanitiseFaction(faction) {
          if (!faction) return null;
          const out = { ID: faction.ID, name: '<redacted>', crimes: {} };
          for (const [id, oc] of Object.entries(faction.crimes || {})) {
            if (!oc) continue;
            out.crimes[id] = {
              id: oc.id,
              name: oc.name,
              difficulty: oc.difficulty,
              status: oc.status,
              executed_at: oc.executed_at,
              ready_at: oc.ready_at,
              expired_at: oc.expired_at,
              time_left: oc.time_left,
              slots: (Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || [])).map(s => s ? {
                position: s.position,
                position_info: s.position_info,
                checkpoint_pass_rate: s.checkpoint_pass_rate,
                user: s.user ? {
                  id: s.user.id,
                  progress: s.user.progress,
                  joined_at: s.user.joined_at,
                } : null,
                item_requirement: s.item_requirement ? {
                  id: s.item_requirement.id,
                  is_available: s.item_requirement.is_available,
                  is_reusable: s.item_requirement.is_reusable,
                } : null,
              } : null),
            };
          }
          return out;
        }
        function sanitiseMembers(members) {
          if (!members) return null;
          const out = {};
          for (const [k, m] of Object.entries(members)) {
            out[k] = {
              id: m.id,
              name: '<redacted>',
              status: m.status,
              is_in_oc: m.is_in_oc,
              last_action: m.last_action ? { timestamp: m.last_action.timestamp } : null,
              faction: m.faction ? { position: m.faction.position } : null,
              rank: m.rank,
            };
          }
          return out;
        }
        function sanitiseTsData(td) {
          if (!td) return null;
          const out = {};
          let i = 0;
          for (const [uid, crimes] of Object.entries(td)) {
            if (i++ < 3) {
              // Keep first 3 members in full to show structure
              out[uid] = crimes;
            } else {
              out[uid] = `<${Object.keys(crimes).length} crimes>`;
            }
          }
          return out;
        }
        function sanitiseHistoryCpr(h) {
          if (!h) return null;
          const out = {};
          let i = 0;
          for (const [uid, crimes] of Object.entries(h)) {
            if (i++ < 3) out[uid] = crimes;
            else out[uid] = `<${Object.keys(crimes).length} crimes>`;
          }
          return out;
        }

        // Snapshot of visible DOM sections — counts only
        function readSectionCount(titleId) {
          const el = document.getElementById(titleId);
          if (!el) return null;
          const m = el.textContent.match(/\((\d+)[\)\s]/);
          return m ? Number(m[1]) : null;
        }
        const visibleCounts = {
          available:      readSectionCount('ocm-title-available'),
          recruits:       readSectionCount('ocm-title-recruits'),
          blocked:        readSectionCount('ocm-title-blocked'),
          lowcpr:         readSectionCount('ocm-title-lowcpr'),
          overqualified:  readSectionCount('ocm-title-overqualified'),
          tscpr:          readSectionCount('ocm-title-tscpr'),
        };

        const statsBarValues = {};
        ['ocm-s-active','ocm-s-open','ocm-s-lowcpr','ocm-s-blocked','ocm-s-free','ocm-s-recruiting','ocm-s-stuck'].forEach(id => {
          const el = document.getElementById(id);
          if (el) statsBarValues[id] = el.textContent.trim();
        });

        return {
          generatedAt: new Date().toISOString(),
          script: { version: '3.5.2', userAgent: navigator.userAgent },
          config: { CPR_WARN, CPR_CRIT, WEIGHT_HIGH, WEIGHT_MID, REFRESH_S, MIN_PER_DIFF },
          mode: dbg.mode || 'unknown',
          fetchedAt: dbg.fetchedAt ? new Date(dbg.fetchedAt).toISOString() : null,
          leaderErr: dbg.leaderErr || null,
          tsCacheMeta,
          visibleCounts,
          statsBarValues,
          roleWeightsCount: Object.keys(roleWeights).length,
          tsCprData: sanitiseTsData(tsCprData),
          ocHistoryCpr: sanitiseHistoryCpr(window._ocmHistoryCpr),
          faction: sanitiseFaction(dbg.faction),
          memberCount: dbg.members ? Object.keys(dbg.members).length : 0,
          // Don't include full members list — too large + privacy
          membersSample: sanitiseMembers(
            dbg.members ? Object.fromEntries(Object.entries(dbg.members).slice(0, 5)) : null
          ),
          armoryItemCount: dbg.armory ? Object.keys(dbg.armory).length : 0,
          lastOcCount: dbg.lastOc ? Object.keys(dbg.lastOc).length : 0,
        };
      }

      document.getElementById('ocm-debug-snapshot-btn').addEventListener('click', () => {
        const snap = buildDebugSnapshot();
        const json = JSON.stringify(snap, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ocm-debug-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        document.getElementById('ocm-cfg-status').textContent = '✓ Debug snapshot downloaded';
        setTimeout(() => { document.getElementById('ocm-cfg-status').textContent = ''; }, 3000);
      });

      document.getElementById('ocm-debug-copy-btn').addEventListener('click', () => {
        const json = JSON.stringify(buildDebugSnapshot(), null, 2);
        const setStatus = (msg) => {
          document.getElementById('ocm-cfg-status').textContent = msg;
          setTimeout(() => { document.getElementById('ocm-cfg-status').textContent = ''; }, 3000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(json).then(
            () => setStatus(`✓ Debug snapshot copied (${(json.length/1024).toFixed(1)} KB)`),
            () => setStatus('✗ Copy failed — check console')
          );
        } else {
          const ta = document.createElement('textarea');
          ta.value = json;
          ta.style.position = 'fixed'; ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); setStatus(`✓ Copied (${(json.length/1024).toFixed(1)} KB)`); }
          catch(_) { setStatus('✗ Copy failed'); }
          ta.remove();
        }
        console.log('[OCM Debug Snapshot]', JSON.parse(json));
      });

      // TornStats
      const _stk = GM_getValue('ocm_ts_key', '');
      if (_stk) { document.getElementById('ocm-ts-key-input').value = '•'.repeat(16); document.getElementById('ocm-ts-status').textContent = 'Key saved ✓'; }
      document.getElementById('ocm-ts-save-btn').addEventListener('click', () => {
        const v = document.getElementById('ocm-ts-key-input').value.trim();
        if (!v || v.charCodeAt(0) === 0x2022) return;
        GM_setValue('ocm_ts_key', v);
        document.getElementById('ocm-ts-key-input').value = '•'.repeat(16);
        const s = document.getElementById('ocm-ts-status'); s.textContent = 'Key saved ✓'; s.style.color = 'var(--ocm-cpr-good)';
      });
      document.getElementById('ocm-ts-fetch-btn').addEventListener('click', async () => {
        const k = GM_getValue('ocm_ts_key', ''), s = document.getElementById('ocm-ts-status');
        if (!k) { s.textContent = '⚠ Save key first'; s.style.color = 'var(--ocm-cpr-warn)'; return; }
        s.textContent = 'Fetching…'; s.style.color = '#888';
        try {
          tsCprData = await fetchTornStatsCpr(k);
          saveTsCprCache(tsCprData);
          _tsLastFailAt = 0;  // Manual success clears the auto-fetch cooldown
          s.textContent = '✓ ' + Object.keys(tsCprData).length + ' members loaded';
          s.style.color = 'var(--ocm-cpr-good)';
          // Re-render dashboard so OC cards pick up TS badges
          const apiKey = GM_getValue('ocm_api_key', '');
          if (apiKey) loadData(apiKey);
        } catch (e) {
          _tsLastFailAt = Date.now();  // Manual failure also triggers cooldown
          s.textContent = '✗ ' + e.message;
          s.style.color = 'var(--ocm-cpr-crit)';
        }
      });

    }, 500);
  }

  // ─── SIDEBAR WIDGET ──────────────────────────────────────────────────────────

  /** Fetch fresh data for the sidebar widget and update the GM_setValue cache. */
  async function fetchSidebarData(apiKey) {
    try {
      const url  = `${API_BASE}/faction?selections=crimes,members&key=${apiKey}&comment=OCManager-sidebar`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.error) return;

      const now      = Math.floor(Date.now() / 1000);
      const INACTIVE = new Set(['completed','expired','cancelled','failed','success','recruiting']);

      const mInfo = {};
      for (const m of Object.values(data.members || {})) {
        if (m?.id) mInfo[String(m.id)] = { name: m.name, status: m.status?.state || 'Unknown' };
      }

      const planning = [];
      for (const oc of Object.values(data.crimes || {})) {
        if (!oc) continue;
        if (INACTIVE.has((oc.status || '').toLowerCase())) continue;
        const slots     = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || []);
        const openCount = slots.filter(s => !s.user).length;
        let sortKey = Infinity;
        if (oc.executed_at && oc.executed_at > now) sortKey = oc.executed_at;
        else if (oc.ready_at && oc.ready_at > now)  sortKey = oc.ready_at;
        else if (oc.time_left > 0)                   sortKey = now + oc.time_left + openCount * 86400;
        else if (openCount > 0)                      sortKey = now + openCount * 86400;
        planning.push({ oc, sortKey });
      }
      planning.sort((a, b) => a.sortKey - b.sortKey);
      const nextOc = planning[0]?.oc ?? null;

      if (!nextOc) { GM_setValue('ocm_sidebar_cache', ''); renderSidebarWidget(); return; }

      const slots      = Array.isArray(nextOc.slots) ? nextOc.slots : Object.values(nextOc.slots || []);
      const executesAt = (nextOc.executed_at && nextOc.executed_at > now ? nextOc.executed_at : null)
                      ?? (nextOc.ready_at    && nextOc.ready_at    > now ? nextOc.ready_at    : null);
      const issues = [];
      for (const slot of slots) {
        const uid  = slot.user?.id ? String(slot.user.id) : null;
        const info = uid ? mInfo[uid] : null;
        if (!uid)                                issues.push({ sev: 'crit', msg: `Open: ${slot.position_info?.label || slot.position || '?'}` });
        else if (info && isBlocked(info.status)) issues.push({ sev: 'crit', msg: `${info.name} — ${info.status}` });
        const req = slot.item_requirement;
        if (req && uid && !req.is_available)     issues.push({ sev: 'warn', msg: `${info?.name || uid} missing item` });
      }

      GM_setValue('ocm_sidebar_cache', JSON.stringify({
        name:       nextOc.name,
        executesAt: executesAt ?? null,
        timeLeft:   nextOc.time_left ?? null,
        openCount:  slots.filter(s => !s.user).length,
        severity:   issues.some(i => i.sev === 'crit') ? 'crit' : issues.some(i => i.sev === 'warn') ? 'warn' : 'ok',
        issues:     issues.slice(0, 3),
        cachedAt:   now,
      }));
      renderSidebarWidget();
    } catch (_) {}
  }

  /** Inject the sidebar widget, positioned before the NPC section if found. */
  function injectSidebar() {
    const tryInsert = setInterval(() => {
      const npcHeader = [...document.querySelectorAll('.title-black, .title-gray, [class*="title"]')]
        .find(el => /^NPC/i.test(el.textContent.trim()));
      const fallback = document.querySelector('#sidebar') || document.querySelector('[class*="sidebar"]');
      const anchor   = npcHeader || fallback;
      if (!anchor) return;
      clearInterval(tryInsert);
      if (document.getElementById('ocm-sidebar-widget')) return;

      const widget = document.createElement('div');
      widget.id    = 'ocm-sidebar-widget';
      widget.style.cssText = 'background:#1e1e1e;border-top:2px solid var(--ocm-link);border-bottom:1px solid #2a2a3a;font-size:11px;font-family:Arial,sans-serif;line-height:1.5';

      if (npcHeader) npcHeader.parentNode.insertBefore(widget, npcHeader);
      else           anchor.appendChild(widget);

      renderSidebarWidget();
      setInterval(renderSidebarWidget, 1000);

      const apiKey   = GM_getValue('ocm_api_key', '');
      const raw      = GM_getValue('ocm_sidebar_cache', '');
      const cachedAt = raw ? (JSON.parse(raw).cachedAt || 0) : 0;
      if (apiKey && (Math.floor(Date.now()/1000) - cachedAt > 300)) fetchSidebarData(apiKey);
    }, 500);
  }

  /** Render (or re-render) the sidebar widget from the GM_setValue cache. */
  function renderSidebarWidget() {
    const widget = document.getElementById('ocm-sidebar-widget');
    if (!widget) return;

    const expanded = widget.dataset.expanded === 'true';
    const raw = GM_getValue('ocm_sidebar_cache', '');
    if (!raw) {
      widget.innerHTML = `<div style="color:#555;font-size:10px;padding:6px 8px">⚔ OC Manager — loading…</div>`;
      return;
    }

    let data;
    try { data = JSON.parse(raw); } catch { return; }

    if (data.memberMode) { widget.style.display = 'none'; return; }

    const now   = Math.floor(Date.now() / 1000);
    const stale = now - (data.cachedAt || 0) > 300;
    const col   = stale ? '#555' : data.severity === 'crit' ? 'var(--ocm-cpr-crit)' : data.severity === 'warn' ? 'var(--ocm-cpr-warn)' : 'var(--ocm-cpr-good)';
    const icon  = data.severity === 'crit' ? '🔴' : data.severity === 'warn' ? '⚠️' : '✅';
    const arrow = expanded ? '▲' : '▼';

    let timeStr = '';
    if (data.executesAt && data.executesAt > now) {
      const d = data.executesAt - now;
      const h = Math.floor(d / 3600), m = Math.floor((d % 3600) / 60), s = d % 60;
      timeStr = h > 0 ? `${h}h ${String(m).padStart(2,'0')}m` : `${m}m ${String(s).padStart(2,'0')}s`;
    } else if (data.timeLeft > 0) {
      const h = Math.floor(data.timeLeft / 3600), m = Math.floor((data.timeLeft % 3600) / 60);
      timeStr = `~${h > 0 ? h+'h ' : ''}${String(m).padStart(2,'0')}m (paused)`;
    } else if (data.openCount > 0) {
      timeStr = `~${data.openCount * 24}h est.`;
    } else {
      timeStr = 'Ready to initiate!';
    }

    const issueLines = (data.issues || [])
      .map(i => `<div style="color:#aaa;font-size:10px;padding:1px 0">${i.sev === 'crit' ? '🔴' : '⚠️'} ${i.msg}</div>`)
      .join('');

    const ocLink = `<a href="/factions.php?step=your#/tab=crimes" style="color:#555;font-size:10px;text-decoration:none;float:right;margin-top:4px">Open →</a>`;

    widget.innerHTML = `
      <div id="ocm-sw-header" style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;cursor:pointer">
        <span style="color:var(--ocm-link);font-weight:bold;font-size:10px;letter-spacing:.5px">⚔ NEXT OC</span>
        <span style="color:${col};font-weight:bold;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 6px" title="${data.name}">${icon} ${data.name}</span>
        <span style="color:#555;font-size:10px">${timeStr}</span>
        <span style="color:#666;font-size:10px;margin-left:6px">${arrow}</span>
      </div>
      ${expanded ? `<div style="padding:2px 8px 7px;border-top:1px solid #2a2a3a">${issueLines || '<div style="color:#555;font-size:10px">No issues ✓</div>'}${ocLink}<div style="clear:both"></div></div>` : ''}`;

    const header = document.getElementById('ocm-sw-header');
    if (header) {
      header.addEventListener('click', () => {
        widget.dataset.expanded = widget.dataset.expanded === 'true' ? 'false' : 'true';
        renderSidebarWidget();
      });
    }
  }

  // ─── BOOT ────────────────────────────────────────────────────────────────────
  inject();
  injectSidebar();
  fetchRoleWeights();

})();