// ==UserScript==
// @name         Torn Property Manager
// @namespace    torn_property_manager
// @version      0.8.0
// @description  Rental manager for Torn properties — see every lease, what it earns, when it expires, and what a fair renewal price actually is. Prices from the live rental market, outliers removed.
// @author       iSatomi (3580191)
// @license      GPL-3.0
// @match        https://www.torn.com/properties.php*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==
//
// Changelog:
// v0.4.0 - Discount perks in the upgrade calculator.
//          ELT stock benefit and the 10-star Property Broker job perk are each 10%
//          off every home upgrade. Both are toggles; costs, the per-happy ranking and
//          the max-out total all recompute from the discounted price, and each row
//          shows what it was before.
//          THE TRAP THIS AVOIDS: if Torn were already printing YOUR discounted price,
//          subtracting 10% again would make every figure 10% too low - an error in the
//          direction that costs money. So the script MEASURES instead of assuming:
//          "Sufficient Interior Modification" is documented as exactly 1/4 of the
//          property value, so any shortfall against that is a discount Torn already
//          applied, and the perks are then NOT applied on top. Measured live on a
//          Mansion: $750,000 against a $750,000 list rate, ratio 1.0000 - this page
//          shows list prices, so perks are ours to apply. If that ever changes the
//          detector notices and the explainer says which prices you are looking at.
//          Whether the two perks STACK to 20% is not documented anywhere I could
//          verify, so the UI says so rather than quietly picking one.
// v0.3.0 - Upgrade planner + a real bug fix.
//          - PROPERTY ID BUG: a leased row's FIRST link is the TENANT's profile
//            (XID=...), and a loose /ID=(\d+)/ matches inside "XID=" - so every
//            leased property took the tenant's USER id as its property id, and Renew
//            would have navigated to the wrong page entirely. Now anchored on
//            [?&#]ID= with XID explicitly rejected. Caught on the live page.
//          - UPGRADE PLANNER on the customize tab: reads what is installed, ranks
//            every remaining step by cost per happiness, and warns where buying a
//            lower tier does not discount the higher one. One-off upgrades and staff
//            are ranked SEPARATELY - a 7,000 hot tub and a ,000/day maid are not
//            comparable, and mixing them would recommend a permanent liability.
//            Costs come from the page (they scale per property); happiness comes from
//            Torn's published table, which this screen never shows.
// v0.2.0 — Readable text + Renew/List actions.
//          · TEXT COLOUR FIX: Torn ships a bare `td { color:#000 }` that beat our
//            inherited colour, so every table cell rendered PURE BLACK on the navy
//            card (measured live as rgb(0,0,0) — the property names were essentially
//            invisible). Colour now lives in c-* classes carrying !important, and
//            the semantic set is consistent: green = earning, amber = money/attention,
//            pink = urgent. Every coloured state also carries a glyph, so colour is
//            never the only signal.
//          · Renew ▸ / List ▸ per row. Renew targets the existing tenant and offers
//            only the headroom left under Torn's 100-day cap; List puts an empty
//            property on the market. Both fill Torn's own form and stop at NEXT.
// v0.1.0 — Phase 1+2: rental dashboard + fair-price engine.
//
// DESIGN NOTES (why things are the way they are — see D:\Obsidian\AI Brain\Torn):
//
// · Rent is paid ENTIRELY UPFRONT. Torn hands the landlord one lump sum; there is no
//   daily income stream. So every figure here states whether it is a per-day rate or
//   a total for the period — conflating them is the easiest way to misprice a lease.
//
// · Market prices come from properties.php?step=rentalmarket, which is a QUERY-PARAM
//   page (not a #/p= hash route) and is deep-linkable per type via #/property=<1-13>.
//   Listings arrive by AJAX, so a plain fetch of the URL returns no rows — we load it
//   in a same-origin hidden iframe and read the DOM. That avoids replicating Torn's
//   rfcv-token POST, which would break the moment they rotate the scheme.
//
// · Listings come back sorted ascending by cost/day, so page 1 IS the competitive
//   frontier. Villa alone has 81 pages; we never need page 2.
//
// · THE OUTLIER PROBLEM (measured live, 2026-08-19). Villa page 1: one listing at
//   $1/day against a pack of $220-$250. Mansion: $1,429 against a $4,300 pack.
//   Those are friend deals, not market prices. Pricing "1% under the cheapest" would
//   have listed a Villa at $0.99/day. So we drop outliers first and undercut the
//   cheapest CREDIBLE listing — and always show how many rows were discarded, so a
//   bad filter is visible rather than silent.
//
// · Nothing here ever confirms a game action. Renewal fills Torn's own form and stops
//   at its NEXT button. If anything is unsafe (unknown tenant, >100 days, a hidden
//   input that refused to take the value) it fills NOTHING and says why.

(function () {
  'use strict';

  if (window.__tpmLoaded) return;          // Torn's SPA can re-run us on navigation
  window.__tpmLoaded = true;

  // ─── CONSTANTS ──────────────────────────────────────────────────────────────

  const K = {
    MARGIN:      'tpm_margin_pct',      // how far under the reference to price (default 1%)
    OUTLIER:     'tpm_outlier_frac',    // drop listings below this × the 25th percentile
    WARN_DAYS:   'tpm_warn_days',       // "expiring soon" window
    MARKET_CACHE:'tpm_market_cache',    // { [typeId]: {ts, rows:[{happy,perDay,days}]} }
    ELT:         'tpm_perk_elt',        // Empty Lunchbox Traders stock benefit
    BROKER:      'tpm_perk_broker',     // 10-star Property Broker job perk
    LEDGER:      'tpm_ledger',        // per-property basis / upgrades / rent received
    UP_WANT:     'tpm_up_want',       // upgrade selections queued from the panel
  };
  const DEFAULTS = { margin: 1, outlierFrac: 0.5, warnDays: 7 };

  /** Discounts on home-upgrade costs. Both are 10% and both are all-or-nothing.
   *  ELT needs 5,000,000 shares of Empty Lunchbox Traders held (wiki: "10% Home
   *  Upgrade Discount (Property)", passive). The other is the 10-star Property
   *  Broker company perk. Whether they stack is NOT documented anywhere I could
   *  verify, so the calculator shows both a stacked and a single-10% figure rather
   *  than picking one and quietly being wrong by 10%. */
  const PERKS = {
    elt:    { label: 'ELT stock benefit', detail: '5,000,000 shares of Empty Lunchbox Traders', pct: 10 },
    broker: { label: 'Property Broker job', detail: '10-star Property Broker company perk', pct: 10 },
  };
  const MARKET_TTL = 30 * 60 * 1000;    // 30 min — the market moves, but not per-second

  /** Rental-market type ids, from the radio values on ?step=rentalmarket.
   *  Shack is absent: it cannot be rented. Base happy/cost from wiki.torn.com. */
  const TYPES = {
    1:  { name: 'Trailer',             baseHappy: 110,  cost: 5000 },
    2:  { name: 'Apartment',           baseHappy: 125,  cost: 25000 },
    3:  { name: 'Semi-Detached House', baseHappy: 150,  cost: 75000 },
    4:  { name: 'Detached House',      baseHappy: 200,  cost: 300000 },
    5:  { name: 'Beach House',         baseHappy: 300,  cost: 500000 },
    6:  { name: 'Chalet',              baseHappy: 350,  cost: 750000 },
    7:  { name: 'Villa',               baseHappy: 400,  cost: 1250000 },
    8:  { name: 'Penthouse',           baseHappy: 450,  cost: 2000000 },
    9:  { name: 'Mansion',             baseHappy: 500,  cost: 3000000 },
    10: { name: 'Ranch',               baseHappy: 600,  cost: 15000000 },
    11: { name: 'Palace',              baseHappy: 1000, cost: 65000000 },
    12: { name: 'Castle',              baseHappy: 1500, cost: 200000000 },
    13: { name: 'Private Island',      baseHappy: 2000, cost: 500000000 },
  };
  const TYPE_BY_NAME = {};
  for (const [id, t] of Object.entries(TYPES)) TYPE_BY_NAME[t.name.toLowerCase()] = +id;

  /** Type names, LONGEST FIRST. Order matters: "Detached House" is a substring of
   *  "Semi-Detached House", so a shortest-first scan mislabels every semi. */
  const TYPE_NAMES_BY_LEN = Object.values(TYPES).map(t => t.name).sort((a, b) => b.length - a.length);

  const cfg = {
    margin:      Number(GM_getValue(K.MARGIN, DEFAULTS.margin)),
    outlierFrac: Number(GM_getValue(K.OUTLIER, DEFAULTS.outlierFrac)),
    warnDays:    Number(GM_getValue(K.WARN_DAYS, DEFAULTS.warnDays)),
    elt:         GM_getValue(K.ELT, false) === true || GM_getValue(K.ELT, false) === 'true',
    broker:      GM_getValue(K.BROKER, false) === true || GM_getValue(K.BROKER, false) === 'true',
  };

  // ─── HELPERS ────────────────────────────────────────────────────────────────

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const num = s => { const m = String(s == null ? '' : s).replace(/[,\s]/g, '').match(/-?\d+/); return m ? +m[0] : null; };
  const n0 = n => n == null ? '—' : String(n).replace(/B(?=(d{3})+(?!d))/g, ',');
  const money = n => {
    const v = Math.round(Number(n) || 0), a = Math.abs(v), sign = v < 0 ? '-' : '';
    if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(2) + 'b';
    if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(2) + 'm';
    if (a >= 1e3) return sign + '$' + (a / 1e3).toFixed(1) + 'k';
    return sign + '$' + a.toLocaleString();
  };
  const exact = n => '$' + Math.round(Number(n) || 0).toLocaleString();

  // ─── THEME ──────────────────────────────────────────────────────────────────
  // Frostbite, matching the OC Suite so the two read as one toolkit. Scoped to
  // #tpm-root with tpm- prefixes throughout so neither script can touch the other.

  GM_addStyle(`
    #tpm-root {
      --tpm-bg:#070c16; --tpm-card:#0f1728; --tpm-card2:#0c1322;
      --tpm-border:#172236; --tpm-border-soft:#223a58;
      --tpm-text:#dbe6f5; --tpm-dim:#97abc7; --tpm-faint:#54637a;
      --tpm-cyan:#5ad1e0; --tpm-good:#43c98b; --tpm-warn:#e0a83a; --tpm-crit:#f2678a;
      background:radial-gradient(120% 100% at 50% 0%, #0d1524 0%, var(--tpm-bg) 70%);
      border:1px solid var(--tpm-border); border-radius:10px;
      margin:10px 0; padding:0; color:var(--tpm-text);
      font:13px/1.5 Arial, Helvetica, sans-serif; overflow:hidden;
    }
    #tpm-root * { box-sizing:border-box; }
    .tpm-top {
      display:flex; align-items:center; gap:10px; padding:11px 14px;
      border-bottom:1px solid var(--tpm-border);
      background:linear-gradient(180deg,#101a2c,#0b1220);
    }
    .tpm-brand { font-weight:800; letter-spacing:.02em; color:var(--tpm-cyan);
      text-shadow:0 0 10px rgba(90,209,224,.35); }
    .tpm-sub { color:var(--tpm-faint); font-size:11px; }
    .tpm-btn {
      background:#16283a; color:var(--tpm-cyan); border:1px solid var(--tpm-border-soft);
      border-radius:7px; padding:5px 11px; font:600 12px/1.4 inherit; cursor:pointer;
    }
    .tpm-btn:hover { filter:brightness(1.25); }
    .tpm-btn.sm { padding:3px 8px; font-size:11px; }
    .tpm-tabs { display:flex; gap:6px; padding:0 14px; border-bottom:1px solid var(--tpm-border-soft); }
    .tpm-tab {
      background:none; border:none; border-bottom:2px solid transparent; color:var(--tpm-dim);
      padding:8px 12px; font:600 12px/1.4 inherit; cursor:pointer; border-radius:6px 6px 0 0;
    }
    .tpm-tab:hover { color:var(--tpm-text); background:rgba(255,255,255,.04); }
    .tpm-tab.on { color:var(--tpm-cyan); border-bottom-color:var(--tpm-cyan); }
    .tpm-editor {
      margin-top:12px; padding:12px; border:1px solid var(--tpm-border-soft);
      border-radius:9px; background:rgba(255,255,255,.02);
    }
    .tpm-sub2 { font:700 13px/1.5 inherit; color:var(--tpm-cyan); margin-bottom:8px; }
    .tpm-erow { display:flex; gap:12px; flex-wrap:wrap; align-items:center; margin-bottom:9px; }
    .tpm-erow label { font-size:11px; color:var(--tpm-dim); display:flex; gap:5px; align-items:center; }
    .tpm-erow input[type=text], .tpm-erow select {
      background:#0d1723; color:var(--tpm-text); border:1px solid var(--tpm-border-soft);
      border-radius:6px; padding:4px 7px; font:inherit; font-size:12px; width:120px;
    }
    .tpm-check { cursor:pointer; }
    .tpm-delup { color:var(--tpm-crit); text-decoration:none; font-weight:700; padding:0 3px; }
    .tpm-frame {
      border:1px solid var(--tpm-border-soft); border-radius:8px; overflow:hidden;
      background:#0d1723; margin-top:8px;
    }
    .tpm-frame iframe { width:100%; height:520px; border:0; display:block; }
    .tpm-btn[disabled] { opacity:.5; cursor:default; filter:none; }
    .tpm-body { padding:12px 14px; }
    .tpm-tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(132px,1fr)); gap:9px; margin-bottom:12px; }
    .tpm-tile { background:linear-gradient(180deg,var(--tpm-card),var(--tpm-card2));
      border:1px solid var(--tpm-border); border-radius:9px; padding:9px 11px; }
    .tpm-tile .v { font-size:19px; font-weight:800; font-variant-numeric:tabular-nums; }
    .tpm-tile .l1 { font-size:10.5px; color:var(--tpm-dim); text-transform:uppercase; letter-spacing:.05em; margin-top:2px; }
    .tpm-tile .l2 { font-size:10px; color:var(--tpm-faint); margin-top:1px; }
    .tpm-card { background:linear-gradient(180deg,var(--tpm-card),var(--tpm-card2));
      border:1px solid var(--tpm-border); border-radius:9px; margin-bottom:12px; overflow:hidden; }
    .tpm-card-h { display:flex; align-items:center; gap:8px; padding:8px 12px;
      border-bottom:1px solid var(--tpm-border); font-weight:700; color:var(--tpm-cyan); font-size:12.5px; }
    .tpm-card-b { padding:10px 12px; }
    .tpm-note { font-size:10.5px; color:var(--tpm-faint); line-height:1.55; }
    /* Fixed layout with explicit widths: under auto layout the right-aligned
       Upkeep column butted into Suggested rent and rendered as "$100,000—". */
    table.tpm-t { width:100%; border-collapse:collapse; font-size:12px; table-layout:fixed; }
    table.tpm-t col.w-prop{width:20%} table.tpm-t col.w-ten{width:12%}
    table.tpm-t col.w-lease{width:13%} table.tpm-t col.w-up{width:12%}
    table.tpm-t col.w-rent{width:27%} table.tpm-t col.w-act{width:16%}
    table.tpm-t td { overflow-wrap:anywhere; }
    table.tpm-t th { position:sticky; top:0; background:#101a2c; color:var(--tpm-dim) !important;
      font-size:9.5px; text-transform:uppercase; letter-spacing:.05em; text-align:left;
      padding:6px 8px; border-bottom:1px solid var(--tpm-border); white-space:nowrap; }
    table.tpm-t td { padding:6px 8px; border-bottom:1px solid #121c2e; vertical-align:middle; }
    table.tpm-t tr:hover td { background:#101a2c; }
    table.tpm-t td.n, table.tpm-t th.n { text-align:right; font-variant-numeric:tabular-nums; }

    /* ── TEXT COLOUR: the !important is load-bearing, do not remove ──────────
       Torn's global stylesheet sets a bare  td { color:#000 }  that beats our
       inherited #tpm-root colour, so every cell rendered PURE BLACK on the dark
       navy card — measured live as rgb(0,0,0). Same leak the War Payout Report hit.
       Colour is set by CLASS (not inline styles) so these rules can carry
       !important without a stylesheet rule outranking an inline one we meant to win. */
    #tpm-root table.tpm-t td,
    #tpm-root table.tpm-t td * { color: var(--tpm-text) !important; }
    #tpm-root .c-good  , #tpm-root .c-good   * { color: var(--tpm-good)  !important; }
    #tpm-root .c-warn  , #tpm-root .c-warn   * { color: var(--tpm-warn)  !important; }
    #tpm-root .c-crit  , #tpm-root .c-crit   * { color: var(--tpm-crit)  !important; }
    #tpm-root .c-dim   , #tpm-root .c-dim    * { color: var(--tpm-dim)   !important; }
    #tpm-root .c-faint , #tpm-root .c-faint  * { color: var(--tpm-faint) !important; }
    #tpm-root .c-cyan  , #tpm-root .c-cyan   * { color: var(--tpm-cyan)  !important; }
    #tpm-root .tpm-note, #tpm-root .tpm-note * { color: var(--tpm-faint) !important; }
    #tpm-root .tpm-name { font-weight:700; color: var(--tpm-text) !important; }
    #tpm-root .tpm-money { font-variant-numeric:tabular-nums; }

    .tpm-chip { display:inline-block; padding:1px 6px; border-radius:5px; font:700 10px/1.6 inherit;
      white-space:nowrap; border:1px solid var(--tpm-border-soft); background:var(--tpm-card2); }
    #tpm-root .tpm-chip.good { color:var(--tpm-good) !important; border-color:#1d4a38; background:#0d2118; }
    #tpm-root .tpm-chip.warn { color:var(--tpm-warn) !important; border-color:#4a3a18; background:#241f14; }
    #tpm-root .tpm-chip.crit { color:var(--tpm-crit) !important; border-color:#5a2436; background:#26121c; }
    #tpm-root .tpm-chip.dim  { color:var(--tpm-faint) !important; }
    .tpm-cfg { display:flex; gap:14px; align-items:center; flex-wrap:wrap; font-size:11.5px; color:var(--tpm-dim); }
    .tpm-cfg input { width:58px; background:#0b1322; border:1px solid var(--tpm-border-soft);
      color:var(--tpm-text); border-radius:6px; padding:3px 6px; font:inherit; text-align:center; }
    .tpm-scroll { max-height:420px; overflow-y:auto; }
  `);

  // ─── READ: MY PROPERTIES ────────────────────────────────────────────────────
  // The properties list already carries everything: market price, upkeep, happiness,
  // staff cost, tenant and days left. No API call, no key, no rate limit.

  /** Torn writes status as e.g. "Leased to Satomi (98 / 99 days)". */
  const RE_LEASED = /Leased to\s+([^(]+?)\s*\((\d+)\s*\/\s*(\d+)\s*days?\)/i;

  function parseMyProperties() {
    const wrap = document.querySelector('#properties-page-wrap');
    if (!wrap) return null;                       // not on the list view
    const out = [];
    // Each property is a list row; anchor on the presence of the money/happy labels
    // rather than any hashed class.
    for (const li of wrap.querySelectorAll('li, .property-wrap, .prop-row')) {
      const txt = (li.innerText || '').replace(/\s+/g, ' ').trim();
      if (!/Market price/i.test(txt) || !/Happiness/i.test(txt)) continue;
      // Match the type against the KNOWN list rather than a loose character class.
      // The row text runs "...Staff cost $252,500 per day Private Island ($1,952,788,000)",
      // so a greedy `[A-Za-z' -]+?` before the price captured "per day Private Island"
      // and every typeId came back null. Verified against the live list.
      let typeName = null;
      for (const n of TYPE_NAMES_BY_LEN) {
        if (new RegExp(n.replace(/[-]/g, '\\-') + '\\s*\\(\\$', 'i').test(txt)) { typeName = n; break; }
      }
      // The Shack is deliberately absent from TYPES — it cannot be rented, so it has
      // no rental-market type id. Name it anyway so it doesn't render as an unknown.
      const isShack = !typeName && /Shack\s*\(\$/i.test(txt);
      if (isShack) typeName = 'Shack';
      const leased = txt.match(RE_LEASED);
      // The property id must come from a link whose param is ID=, anchored on a
      // ?/&/# boundary. A LEASED row's FIRST link is the TENANT's profile (XID=),
      // and a loose /ID=(\d+)/ matches inside "XID=" — which handed us the tenant's
      // user id as the property id and would have pointed Renew at the wrong page.
      // Verified live on the leased Private Island row.
      let id = null;
      for (const a of li.querySelectorAll('a[href*="ID="]')) {
        const href = a.getAttribute('href') || '';
        if (/XID=/.test(href)) continue;                 // tenant profile, not the property
        const m = href.match(/[?&#]ID=(\d+)/);
        // ID=0 is real on the live page — one row link carries it — and it is not
        // a property. Taking it gave an owned property buttons pointing at a page
        // that does not exist: a button that genuinely does nothing.
        if (m && m[1] !== '0') { id = m[1]; break; }
      }
      out.push({
        id,
        typeName,
        typeId: typeName ? TYPE_BY_NAME[typeName.toLowerCase()] ?? null : null,
        marketPrice: num((txt.match(/Market price\s*\$?([\d,]+)/i) || [])[1]),
        upkeep:      num((txt.match(/Upkeep\s*\$?([\d,]+)/i) || [])[1]),
        happy:       num((txt.match(/Happiness\s*([\d,]+)/i) || [])[1]),
        staffCost:   num((txt.match(/Staff cost\s*\$?([\d,]+)/i) || [])[1]),
        tenant:      leased ? leased[1].trim() : null,
        daysLeft:    leased ? +leased[2] : null,
        daysTotal:   leased ? +leased[3] : null,
        spouse:      /Owned by your spouse/i.test(txt),
        // "Owned by you" is how the list marks a property that is actually YOURS.
        // The (?!r) matters: "Owned by your spouse" starts with "Owned by you", so
        // an unbounded test marks every spouse property as your own — the same
        // substring trap as "Detached House" inside "Semi-Detached House" above.
        owned:       /Owned by you(?!r)/i.test(txt),
        raw: txt.slice(0, 160),
      });
    }
    return out;
  }

  // ─── READ: THE RENTAL MARKET ────────────────────────────────────────────────

  /** Load one property type's market page-1 listings via a same-origin hidden iframe.
   *  Listings arrive by AJAX off the hash, so fetching the URL returns nothing — the
   *  iframe lets Torn's own JS do the work and we read the resulting DOM. */
  function fetchMarket(typeId, timeoutMs = 15000) {
    return new Promise(resolve => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:900px;border:0';
      f.src = `/properties.php?step=rentalmarket#/property=${typeId}`;
      let done = false;
      const finish = rows => {
        if (done) return;
        done = true;
        try { f.remove(); } catch (_) {}
        resolve(rows);
      };
      const deadline = Date.now() + timeoutMs;
      f.addEventListener('load', () => {
        const poll = setInterval(() => {
          let rows = [];
          try {
            const d = f.contentDocument;
            rows = [...d.querySelectorAll('li .expander-info')].map(e => {
              const g = c => { const x = e.querySelector('.' + c); return x ? x.textContent.replace(/^[^:]*:/, '').trim() : ''; };
              return { happy: num(g('happiness')), perDay: num(g('cost-per-day')), total: num(g('cost')), days: num(g('rental-period')) };
            }).filter(r => r.perDay != null && r.perDay > 0);
          } catch (_) { /* not ready */ }
          if (rows.length) { clearInterval(poll); finish(rows); }
          else if (Date.now() > deadline) { clearInterval(poll); finish([]); }
        }, 400);
      });
      document.body.appendChild(f);
    });
  }

  async function marketFor(typeId) {
    let cache = {};
    try { cache = JSON.parse(GM_getValue(K.MARKET_CACHE, '{}')) || {}; } catch (_) {}
    const hit = cache[typeId];
    if (hit && (Date.now() - hit.ts) < MARKET_TTL) return hit.rows;
    const rows = await fetchMarket(typeId);
    if (rows.length) {
      cache[typeId] = { ts: Date.now(), rows };
      try { GM_setValue(K.MARKET_CACHE, JSON.stringify(cache)); } catch (_) {}
    }
    return rows;
  }

  // ─── PRICE ──────────────────────────────────────────────────────────────────

  /**
   * Suggested per-day price for a property, and the working behind it.
   *
   * Rule (chosen deliberately over "1% under the cheapest"): comparables are listings
   * at the SAME happiness; outliers below `outlierFrac` × the 25th percentile are
   * discarded as friend-deals; we then undercut the cheapest survivor by `margin`%.
   *
   * Returns every intermediate value so the UI can show its working — a suggestion
   * nobody can audit is a suggestion nobody should trust.
   */
  function suggestPrice(happy, rows) {
    if (!rows || !rows.length) return { ok: false, why: 'no market listings loaded' };
    let pool = rows.filter(r => r.happy === happy);
    let matched = 'exact happiness';
    if (pool.length < 3) {                      // too thin to be a market — widen
      const near = rows.slice().sort((a, b) => Math.abs(a.happy - happy) - Math.abs(b.happy - happy));
      const h = near.length ? near[0].happy : null;
      pool = rows.filter(r => r.happy === h);
      matched = h == null ? 'none' : `nearest happiness (${h})`;
    }
    if (!pool.length) return { ok: false, why: 'no comparable listings' };

    const sorted = pool.map(r => r.perDay).sort((a, b) => a - b);
    const q25 = sorted[Math.floor(sorted.length * 0.25)];
    const floor = q25 * cfg.outlierFrac;
    const kept = sorted.filter(v => v >= floor);
    const dropped = sorted.length - kept.length;
    if (!kept.length) return { ok: false, why: 'every listing looked like an outlier' };

    const cheapest = kept[0];
    const perDay = Math.max(1, Math.round(cheapest * (1 - cfg.margin / 100)));
    return {
      ok: true, perDay, cheapest, dropped, considered: sorted.length,
      droppedValues: sorted.filter(v => v < floor), matched,
      median: kept[Math.floor(kept.length / 2)],
    };
  }

  // ─── UPGRADES ───────────────────────────────────────────────────────────────
  //
  // Torn's customize page shows every upgrade's COST but never its HAPPINESS, which
  // is exactly why the decision is hard to make in-game. Costs are read live off the
  // option labels because they differ per property — a Mansion's interior is $750,000
  // where a Villa's is $312,500, both being 1/4 of the house price. Happiness comes
  // from the table below (wiki.torn.com); the page never exposes it.
  //
  // ONE-OFF vs PER-DAY is the distinction that matters and the page blurs it: a
  // $17,000 hot tub is bought once; a $5,000 maid is charged EVERY DAY forever.
  // Ranking them together on "$ per happy" would float staff to the top and quietly
  // recommend an open-ended liability. They are ranked separately and never mixed.
  // Which is which is detected from the label ("per day"), not hardcoded.

  const UP_HAPPY = {
    interior: { 1: 'quarter', 2: 'half' },   // fraction of this type's BASE happy
    hottub:   { 1: 25 },
    sauna:    { 1: 25 },
    pool:     { 1: 100, 2: 125, 3: 150 },
    bar:      { 1: 50 },
    shootingrange: { 1: 50 },
    range:    { 1: 50 },
    vault:    { 1: 50, 2: 75, 3: 100, 4: 125 },
    medical:  { 1: 50 },
    airstrip: { 1: 250 },
    yacht:    { 1: 500 },
    maid:     { 1: 50, 2: 75, 3: 85, 4: 100 },
    butler:   { 1: 75, 2: 100, 3: 125 },
    guard:    { 1: 100, 2: 150, 3: 200, 4: 300, 5: 500 },
    doctor:   { 1: 25 },
    pilot:    { 1: 50 },
  };

  const PRETTY = {
    interior: 'Interior modification', hottub: 'Hot tub', sauna: 'Sauna', pool: 'Pool',
    bar: 'Open bar', shootingrange: 'Shooting range', range: 'Shooting range',
    vault: 'Vault', medical: 'Medical facility', airstrip: 'Airstrip', yacht: 'Yacht',
    maid: 'Maid service', butler: 'Butler service', guard: 'Guards',
    doctor: 'Doctor', pilot: 'Pilot',
  };

  /** Price from an option label. Must anchor on the $ amount: labels like
   *  "2x Maid service ($10,000 per day)" and "3x Guards ($45,000 per day)" lead with
   *  a multiplier, and reading the first number priced them at $2 and $3. */
  function costOf(label) {
    const m = String(label || '').match(/\$\s*([\d,]+)/);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  }

  /**
   * Does Torn ALREADY discount the prices printed on this page, or are they list?
   *
   * This matters more than it looks: if the page is already showing your discounted
   * price and we subtract 10% again, every figure is 10% too low and the "total to
   * max it out" is wrong in the direction that costs money. Rather than assume, we
   * measure — "Sufficient Interior Modification" is documented as exactly 1/4 of the
   * property's base value, so any shortfall against that is a discount Torn has
   * already applied.
   *
   * Returns { applied: <0..1 fraction already taken off>, measurable: bool }.
   */
  function detectPageDiscount(base_cost, doc) {
    doc = doc || document;
    const sel = doc.querySelector('form select[name="interior"]');
    if (!sel || !base_cost) return { applied: 0, measurable: false };
    const opt = [...sel.options].find(o => Number(o.value) === 1);
    const shown = opt ? costOf(opt.textContent) : null;
    if (!shown) return { applied: 0, measurable: false };
    const listPrice = base_cost / 4;
    const ratio = shown / listPrice;
    // Allow a little slack for rounding; anything within 2% counts as "no discount".
    const applied = ratio > 0.98 ? 0 : Math.max(0, 1 - ratio);
    return { applied, measurable: true, shown, listPrice };
  }

  /** The discount the user's perks should give, as a fraction. */
  function perkDiscount() {
    let pct = 0;
    if (cfg.elt) pct += PERKS.elt.pct;
    if (cfg.broker) pct += PERKS.broker.pct;
    return Math.min(pct, 100) / 100;
  }

  function happyFor(key, value, base) {
    const map = UP_HAPPY[key];
    if (!map || !value) return 0;
    const raw = map[value];
    if (raw === 'quarter') return base ? Math.round(base * 0.25) : 0;
    if (raw === 'half')    return base ? Math.round(base * 0.5)  : 0;
    return raw || 0;
  }

  /** Which property type this customize page is for — interior gains scale off it. */
  function upgradePageType(doc) {
    doc = doc || document;
    const wrap = doc.querySelector('#properties-page-wrap');
    const txt = wrap ? (wrap.innerText || '') : '';
    for (const n of TYPE_NAMES_BY_LEN) {
      if (new RegExp('(^|\n)\s*' + n.replace(/-/g, '\-') + '\s*($|\n)', 'i').test(txt)) return n;
    }
    for (const n of TYPE_NAMES_BY_LEN) if (txt.includes(n)) return n;
    return null;
  }

  /** Every upgrade select: what is installed now, and each step available above it. */
  function readUpgrades(doc) {
    doc = doc || document;
    const typeName = upgradePageType(doc);
    const typeId = typeName ? TYPE_BY_NAME[typeName.toLowerCase()] : null;
    const base = typeId ? TYPES[typeId].baseHappy : null;
    const sels = [...doc.querySelectorAll('form select')]
      .filter(s => s.name && UP_HAPPY[s.name.toLowerCase()]);

    // If Torn is already showing discounted prices, applying the perks again would
    // double-count them. Measure first, then only apply what is missing.
    const typeCost = typeId ? TYPES[typeId].cost : null;
    const pageDisc = detectPageDiscount(typeCost, doc);
    const wanted = perkDiscount();
    const toApply = pageDisc.applied > 0 ? 0 : wanted;   // page already did it -> don't repeat

    const steps = [];
    let installedHappy = 0;
    for (const s of sels) {
      const key = s.name.toLowerCase();
      const cur = Number(s.value) || 0;
      const curHappy = happyFor(key, cur, base);
      installedHappy += curHappy;
      const maxVal = Math.max(...[...s.options].map(x => Number(x.value) || 0));
      for (const o of [...s.options]) {
        const v = Number(o.value) || 0;
        if (v <= cur) continue;                    // already owned, or the "None" row
        const label = o.textContent.trim();
        // Anchor the cost on the $ figure, NOT the first number in the string.
        // "2x Maid service ($10,000 per day)" starts with a 2, so a first-number
        // parse read the multiplier as the price - staff came out costing $2/day.
        const cost = costOf(label);
        const gain = happyFor(key, v, base) - curHappy;
        if (cost == null || cost <= 0 || !gain || gain <= 0) continue;
        const effCost = Math.round(cost * (1 - toApply));
        steps.push({
          key, selName: s.name, value: v, label,
          name: PRETTY[key] || key, cost, effCost, gain,
          perDay: /per day/i.test(label),
          perHappy: effCost / gain,
          isTop: v === maxVal,
          curVal: cur,
        });
      }
    }
    return { typeName, base, steps, installedHappy, selCount: sels.length,
             pageDisc, wanted, toApply, typeCost };
  }


  // ─── ACT: FILL TORN'S OWN FORMS ─────────────────────────────────────────────
  //
  // Everything below fills Torn's form and STOPS at its own submit button. That is a
  // standing rule for these scripts, not caution for its own sake: this hands over
  // real property for real money, and a script that clicks the last button will one
  // day click it with the wrong number in the box. We do all the typing; you do the
  // final click. If anything looks unsafe we fill NOTHING and say why.

  /** Set a value the way a user would, so the page's own JS reacts.
   *  The lease form keeps the real value in a HIDDEN input shadowing each visible
   *  box — writing .value alone leaves the hidden one stale and Torn submits the OLD
   *  number. We write both and then verify. */
  function setNative(input, value) {
    const proto = Object.getPrototypeOf(input);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(input, value); else input.value = value;
    // The Event constructor must come from the element's OWN window: these are now
    // dispatched into iframe documents, which are a different realm.
    const V = (input.ownerDocument && input.ownerDocument.defaultView) || window;
    for (const t of ['input', 'change', 'keyup', 'blur']) {
      input.dispatchEvent(new V.Event(t, { bubbles: true }));
    }
  }

  const PENDING = 'tpm_pending_action';   // survives the navigation to the lease tab

  function queueAction(action) {
    try { GM_setValue(PENDING, JSON.stringify({ ...action, ts: Date.now() })); } catch (_) {}
  }
  function takeAction() {
    let a = null;
    try { a = JSON.parse(GM_getValue(PENDING, 'null')); } catch (_) { return null; }
    GM_setValue(PENDING, 'null');                       // one-shot, never fires later
    if (!a || (Date.now() - (a.ts || 0)) > 5 * 60 * 1000) return null;
    return a;
  }

  function toast(msg, kind) {
    let host = document.getElementById('tpm-toast');
    if (!host) {
      host = document.createElement('div');
      host.id = 'tpm-toast';
      host.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);'
        + 'z-index:2147483647;display:flex;flex-direction:column;gap:8px;align-items:center';
      document.body.appendChild(host);
    }
    const accent = kind === 'bad' ? '#f2678a' : kind === 'warn' ? '#e0a83a' : '#43c98b';
    const t = document.createElement('div');
    t.style.cssText = `background:#0f1728;border:1px solid ${accent};border-left:4px solid ${accent};`
      + 'border-radius:8px;color:#dbe6f5;font:13px/1.5 Arial,sans-serif;padding:11px 16px;'
      + 'max-width:460px;box-shadow:0 6px 22px rgba(0,0,0,.55);white-space:pre-line';
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => t.remove(), 9000);
  }

  /**
   * On the lease tab, fill the requested form. Two panes share the page:
   *   #leasemarket  — list publicly (ID, money, days)
   *   #leaseperson  — offer to one player (ID, money, days, userID)
   * Both keep the submitted value in hidden inputs; the visible boxes are display only.
   */
  function applyLeaseAction(a) {
    // Rent is paid upfront and never appears on the properties list, so the only
    // moment its value is knowable is the moment we type it into the form. Hold it
    // until that lease turns up as live, then it becomes recorded income.
    if (a && a.propId && a.perDay && a.days) {
      PENDING_RENT[a.propId] = { money: Math.round(a.perDay * a.days), days: a.days };
    }
    const pane = document.querySelector(a.mode === 'person' ? '#leaseperson' : '#leasemarket')
              || document.querySelector('#tab-menu-lease');
    if (!pane) return toast('Could not find the lease form on this page.', 'bad');

    const forms = [...document.querySelectorAll('#tab-menu-lease form')];
    // The person-offer form is the one carrying a userID field; the other is the market listing.
    const form = a.mode === 'person'
      ? forms.find(f => f.querySelector('[name="userID"]'))
      : forms.find(f => !f.querySelector('[name="userID"]'));
    if (!form) return toast('Could not find the right lease form.', 'bad');

    const total = Math.round(a.perDay * a.days);
    const visMoney = [...form.querySelectorAll('input.input-money')].find(i => i.type !== 'hidden');
    const hidMoney = form.querySelector('input[name="money"]');
    const visDays  = [...form.querySelectorAll('input.input-money')].filter(i => i.type !== 'hidden')[1];
    const hidDays  = form.querySelector('input[name="days"]');

    if (!hidMoney || !hidDays) return toast('Lease form looks different than expected — filled nothing.', 'bad');

    if (visMoney) setNative(visMoney, String(total));
    setNative(hidMoney, String(total));
    if (visDays) setNative(visDays, String(a.days));
    setNative(hidDays, String(a.days));

    if (a.mode === 'person') {
      const uid = form.querySelector('input[name="userID"]');
      if (!uid) return toast('No tenant field found — filled nothing.', 'bad');
      setNative(uid, String(a.userId || ''));
    }

    // Verify the HIDDEN values actually took. If Torn's own handler overwrote them we
    // must not claim success — that is exactly how a wrong number gets submitted.
    const okMoney = String(hidMoney.value).replace(/[^\d]/g, '') === String(total);
    const okDays  = String(hidDays.value).replace(/[^\d]/g, '') === String(a.days);
    if (!okMoney || !okDays) {
      return toast('Filled the visible boxes but Torn did not accept the hidden values.\n'
        + 'Check the numbers yourself before submitting.', 'warn');
    }

    try { form.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
    form.style.outline = '2px solid #43c98b';
    form.style.outlineOffset = '3px';
    setTimeout(() => { form.style.outline = ''; }, 8000);

    toast(`${a.mode === 'person' ? 'Renewal offer' : 'Market listing'} filled in:\n`
      + `${exact(a.perDay)}/day × ${a.days} days = ${exact(total)} total`
      + (a.mode === 'person' && a.tenantName ? `\nto ${a.tenantName}` : '')
      + `\n\nCheck it, then press NEXT yourself — this script never submits.`, 'ok');
  }

  /** Send the user to a property's lease tab with an action queued for arrival. */
  function startLeaseAction(a) {
    queueAction(a);
    const target = `#/p=options&ID=${a.propId}&tab=lease`;
    if (location.pathname.includes('properties.php') && location.hash === target) {
      applyLeaseAction(takeAction());
    } else {
      location.hash = target;
      setTimeout(() => {
        const q = takeAction();
        if (q) applyLeaseAction(q);
      }, 1800);
    }
  }

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  let MODEL = { props: [], prices: {}, loading: false, err: null, tab: 'rentals', editing: null, survey: null };
  // Declared here, not beside the observer at the foot of the file: boot() reads
  // _coldTries and boot() runs before that point, so a 'let' down there is a
  // temporal-dead-zone ReferenceError that kills the panel on load.
  let listObs = null;
  let _coldTries = 0;

  /** The per-row action button. Renewals need a tenant AND headroom under Torn's
   *  100-day cap; empty properties get a market listing instead. */
  function actionCell(p, price) {
    if (p.spouse || p.typeName === 'Shack') return '<span class="c-faint">—</span>';
    if (!price || price === 'loading' || !price.ok) return '<span class="c-faint">price first</span>';
    if (p.tenant) {
      const used = p.daysTotal || 0;
      const room = Math.max(0, 100 - used);
      if (room <= 0) {
        return `<span class="c-crit">⚠ at 100d cap</span><div class="tpm-note">cannot extend further</div>`;
      }
      return `<button class="tpm-btn tpm-act" data-act="person" data-id="${esc(p.id)}"
                data-perday="${price.perDay}" data-max="${room}" data-tenant="${esc(p.tenant)}">Renew ▸</button>
              <div class="tpm-note">up to ${room}d more</div>`;
    }
    return `<button class="tpm-btn tpm-act" data-act="market" data-id="${esc(p.id)}"
              data-perday="${price.perDay}" data-max="100">List ▸</button>
            <div class="tpm-note">to rental market</div>`;
  }

  /** Customize tab gets the upgrade planner; the list gets the rental dashboard.
   *  One panel, two modes - it mounts on both because both share #properties-page-wrap. */
  // ─── THE LEDGER ─────────────────────────────────────────────────────────────
  //
  // Torn tells you what a property is worth TODAY. It never tells you what you
  // paid for it, what the upgrades cost, or what rent you have collected — so
  // none of that can be scraped and all of it has to be remembered here.
  //
  //   acq    'bought' | 'free' | null   — some properties are gifts, and a gift
  //                                       with a $0 basis is in profit from day one
  //   basis  what it cost to buy (0 when free)
  //   ups    upgrades bought since tracking began, each with its cost
  //   inc    rent RECEIVED. Rent is paid entirely upfront as one lump sum, so
  //          this is a list of discrete payments, not a daily trickle
  //   ignore properties you RENT FROM someone else — not yours, no basis, no profit
  //
  // Anything from before this script started is invisible to it. The panel says so
  // rather than quietly reporting a loss that is really just missing history.
  function ledgerAll() {
    try { return JSON.parse(GM_getValue(K.LEDGER, '{}')) || {}; } catch (_) { return {}; }
  }
  function ledgerSave(all) { GM_setValue(K.LEDGER, JSON.stringify(all)); }
  function ledgerFor(id) {
    const all = ledgerAll();
    return all[id] || { acq: null, basis: 0, at: null, ups: [], inc: [], ignore: false };
  }
  function ledgerPut(id, patch) {
    const all = ledgerAll();
    all[id] = Object.assign(ledgerFor(id), patch);
    ledgerSave(all);
  }

  /** Basis = what you have put in: the purchase price plus every upgrade bought. */
  function basisOf(L) {
    return (L.acq === 'free' ? 0 : (L.basis || 0)) + (L.ups || []).reduce((n, u) => n + (u.cost || 0), 0);
  }
  /** Rent actually collected. Entries with a null amount are NOT counted — an
   *  unknown is not a zero, and guessing here would invent profit. */
  function incomeOf(L) { return (L.inc || []).reduce((n, i) => n + (i.amount || 0), 0); }
  function incomeUnknown(L) { return (L.inc || []).filter(i => i.amount == null).length; }

  /** Days since we started counting for this property. */
  function daysHeld(L) {
    if (!L.at) return null;
    return Math.max(0, Math.floor((Date.now() - L.at) / 86400000));
  }

  /**
   * Where this property stands, and when it turns a profit.
   *
   * Upkeep is a real daily cost and ignoring it would flatter every property, so
   * it is charged from the day tracking started at today's rate. That is an
   * ESTIMATE — the rate can have changed — and the panel labels it as one.
   *
   * The projection needs a rent rate. The live lease is the best evidence; the
   * market suggestion is the fallback; with neither there is no honest projection
   * and it returns null rather than a made-up number.
   */
  function profitOf(p, L, suggestedPerDay) {
    const basis = basisOf(L);
    const income = incomeOf(L);
    const held = daysHeld(L);
    const upkeepPerDay = (p.upkeep || 0) + (p.staffCost || 0);
    const upkeepPaid = held == null ? 0 : upkeepPerDay * held;
    const net = income - basis - upkeepPaid;

    let rentPerDay = null;
    const live = (L.inc || []).find(i => i.live && i.amount && i.days);
    if (live) rentPerDay = live.amount / live.days;
    else if (suggestedPerDay) rentPerDay = suggestedPerDay;

    const dailyNet = rentPerDay == null ? null : rentPerDay - upkeepPerDay;
    let daysToProfit = null, neverAtThisRate = false;
    if (net >= 0) daysToProfit = 0;
    else if (dailyNet != null && dailyNet > 0) daysToProfit = Math.ceil(-net / dailyNet);
    else if (dailyNet != null) neverAtThisRate = true;   // upkeep outruns the rent

    return { basis, income, held, upkeepPerDay, upkeepPaid, net, rentPerDay, dailyNet,
             daysToProfit, neverAtThisRate, unknowns: incomeUnknown(L) };
  }

  /**
   * Notice leases we have not recorded yet.
   *
   * A lease is identified by tenant + its total length + roughly when it started,
   * which is stable across page loads while "days left" counts down. The AMOUNT is
   * not on the properties list, so a lease we did not fill in ourselves is recorded
   * with a null amount and shown as needing a figure — never as zero income.
   */
  function reconcileLeases(props) {
    const all = ledgerAll();
    let added = 0;
    for (const p of props) {
      if (!p.id || !p.tenant || p.daysTotal == null) continue;
      const L = all[p.id] || (all[p.id] = { acq: null, basis: 0, at: null, ups: [], inc: [], ignore: false });
      if (L.ignore) continue;
      const startedDaysAgo = (p.daysTotal - (p.daysLeft || 0));
      const startAt = Date.now() - startedDaysAgo * 86400000;
      const sig = `${p.tenant}|${p.daysTotal}|${Math.round(startAt / 86400000)}`;
      L.inc = L.inc || [];
      if (L.inc.some(i => i.sig === sig)) { L.inc.forEach(i => { if (i.sig === sig) i.live = true; }); continue; }
      L.inc.forEach(i => { i.live = false; });
      const pend = PENDING_RENT[p.id];
      L.inc.push({ sig, who: p.tenant, days: p.daysTotal, at: startAt, live: true,
                   amount: pend && pend.days === p.daysTotal ? pend.money : null });
      if (pend) delete PENDING_RENT[p.id];
      if (!L.at) L.at = startAt;      // start counting upkeep from the first lease we saw
      added++;
    }
    if (added) ledgerSave(all);
    return added;
  }
  /** Amounts we filled into a lease form, held until that lease shows up as live. */
  const PENDING_RENT = {};

  // ─── UPGRADES, DRIVEN FROM THE PANEL ────────────────────────────────────────

  /** Send the browser to a property's upgrade page. Nothing is bought: the page
   *  opens with the options selected and STOPS at Torn's own UPGRADE button. */
  function goUpgrade(id, want) {
    if (want) GM_setValue(K.UP_WANT, JSON.stringify({ id, want, at: Date.now() }));
    location.hash = `/p=options&ID=${id}&tab=customize`;
  }

  /** On arriving at a customize page, preselect what the panel asked for. */
  function applyPendingUpgrade() {
    let job = null;
    try { job = JSON.parse(GM_getValue(K.UP_WANT, '') || 'null'); } catch (_) { job = null; }
    if (!job || Date.now() - job.at > 120000) { GM_setValue(K.UP_WANT, ''); return; }
    if (!new RegExp(`ID=${job.id}\\b`).test(location.hash)) return;
    GM_setValue(K.UP_WANT, '');
    const sels = document.querySelectorAll('#properties-page-wrap select[name], select[name="interior"], select[name="pool"]');
    let set = 0;
    for (const s of sels) {
      const w = job.want[s.getAttribute('name')];
      if (w == null) continue;
      const opt = [...s.options].find(o => String(o.value) === String(w));
      if (!opt) continue;
      setNative(s, opt.value);
      set++;
    }
    // Never click UPGRADE. The script sets the dropdowns and hands the decision —
    // and the money — back to the person whose money it is.
    toast(set ? `Selected ${set} upgrade${set === 1 ? '' : 's'}. Check the price, then press UPGRADE yourself.`
              : 'Could not find those upgrade dropdowns — nothing was changed.', set ? 'good' : 'bad');
  }

  /** Properties this panel is responsible for: yours, not your spouse's, and not
   *  ones you RENT FROM somebody else — those have no basis and never turn a
   *  profit for you, so counting them would drag every total down. */
  function ownProps() {
    const props = MODEL.props || [];
    // Torn writes "Owned by you" on properties that are yours. Anything without it
    // is somebody else's — a spouse's, or one you RENT FROM someone — and has no
    // basis, earns you nothing, and must not be upgraded from here.
    //
    // The filter is only trusted when the marker is actually present somewhere on
    // the page. If Torn ever renames it, a strict filter would silently empty the
    // whole panel, so an absent marker falls back to the old spouse-only rule
    // rather than showing you nothing and calling it an answer.
    const markerPresent = props.some(p => p.owned);
    return props.filter(p => (markerPresent ? p.owned : !p.spouse) && !ledgerFor(p.id).ignore);
  }
  /** True when Torn's "Owned by you" marker was found — the filter above is only
   *  as good as this, so the UI says which rule it is running under. */
  function ownerMarkerPresent() { return (MODEL.props || []).some(p => p.owned); }

  function renderProfit(root, shell) {
    const props = ownProps();
    const ledger = ledgerAll();
    const rows = props.map(p => {
      const L = ledgerFor(p.id);
      const sug = MODEL.prices[p.id];
      const perDay = sug && sug.perDay ? sug.perDay : null;
      return { p, L, r: profitOf(p, L, perDay) };
    });

    const totBasis = rows.reduce((n, x) => n + x.r.basis, 0);
    const totIncome = rows.reduce((n, x) => n + x.r.income, 0);
    const totNet = rows.reduce((n, x) => n + x.r.net, 0);
    const untracked = rows.filter(x => !x.L.acq).length;
    const unknowns = rows.reduce((n, x) => n + x.r.unknowns, 0);

    const tiles = [
      { v: money(totBasis), l1: 'Put in', l2: 'purchases + upgrades', c: 'c-faint' },
      { v: money(totIncome), l1: 'Rent collected', l2: 'since tracking began', c: totIncome ? 'c-good' : 'c-faint' },
      { v: money(totNet), l1: totNet >= 0 ? 'In profit' : 'Still down', l2: 'after upkeep', c: totNet >= 0 ? 'c-good' : 'c-warn' },
      { v: untracked, l1: 'Missing a basis', l2: untracked ? '⚠ set bought/free' : 'all set', c: untracked ? 'c-warn' : 'c-good' },
    ].map(t => `<div class="tpm-tile"><div class="v ${t.c}">${t.v}</div>`
      + `<div class="l1">${t.l1}</div><div class="l2 ${t.c === 'c-faint' ? '' : t.c}">${t.l2}</div></div>`).join('');

    const rowHtml = ({ p, L, r }) => {
      const name = esc(p.typeName || 'Property') + (p.id ? ` <span class="c-dim">#${esc(p.id)}</span>` : '');
      let when;
      if (!L.acq) when = '<span class="tpm-chip warn">set a basis</span>';
      else if (r.net >= 0) when = '<span class="tpm-chip good">in profit</span>';
      else if (r.neverAtThisRate) when = '<span class="tpm-chip crit" title="Upkeep costs more per day than the rent brings in">never at this rate</span>';
      else if (r.daysToProfit == null) when = '<span class="tpm-chip dim" title="No live lease and no market price yet — price the property to get a projection">no rate yet</span>';
      else when = `<span class="tpm-chip">${r.daysToProfit} day${r.daysToProfit === 1 ? '' : 's'}</span>`;

      return `<tr data-id="${esc(p.id || '')}">
        <td class="l">${name}${L.acq === 'free' ? ' <span class="tpm-chip good" title="Cost nothing, so it is in profit from the first rent">free</span>' : ''}</td>
        <td class="n">${money(r.basis)}</td>
        <td class="n">${money(r.income)}${r.unknowns ? ` <span class="tpm-chip warn" title="${r.unknowns} lease(s) recorded with no amount — they count as nothing until you fill them in">${r.unknowns}?</span>` : ''}</td>
        <td class="n c-dim" title="Estimated from today's upkeep and staff rate over ${r.held == null ? 0 : r.held} day(s)">${money(r.upkeepPaid)}</td>
        <td class="n ${r.net >= 0 ? 'c-good' : 'c-warn'}">${money(r.net)}</td>
        <td class="n">${when}</td>
        <td class="n"><button class="tpm-btn sm tpm-edit" data-id="${esc(p.id || '')}">Edit</button></td>
      </tr>`;
    };

    const editing = MODEL.editing && props.find(p => String(p.id) === String(MODEL.editing));
    let editor = '';
    if (editing) {
      const L = ledgerFor(editing.id);
      editor = `<div class="tpm-editor">
        <div class="tpm-sub2">${esc(editing.typeName || 'Property')} #${esc(editing.id)}</div>
        <div class="tpm-erow">
          <label>How did you get it?
            <select id="tpm-acq">
              <option value=""${!L.acq ? ' selected' : ''}>— not set —</option>
              <option value="bought"${L.acq === 'bought' ? ' selected' : ''}>Bought it</option>
              <option value="free"${L.acq === 'free' ? ' selected' : ''}>Got it free</option>
            </select></label>
          <label>Paid <input id="tpm-basis" type="text" value="${L.basis || ''}" placeholder="${TYPES[editing.typeId] ? TYPES[editing.typeId].cost : 0}"></label>
          <label class="tpm-check"><input type="checkbox" id="tpm-ignore"${L.ignore ? ' checked' : ''}> I rent this FROM someone — don't track it</label>
        </div>
        <div class="tpm-erow">
          <label>Add an upgrade cost <input id="tpm-upc" type="text" placeholder="e.g. 500000"></label>
          <label>called <input id="tpm-upl" type="text" placeholder="Large pool"></label>
          <button class="tpm-btn sm" id="tpm-addup">Add</button>
        </div>
        ${(L.ups || []).length ? `<div class="tpm-note">Upgrades: ${(L.ups || []).map((u, i) =>
          `${esc(u.label || 'upgrade')} ${money(u.cost)} <a href="#" class="tpm-delup" data-i="${i}" title="Remove">×</a>`).join(' · ')}</div>` : ''}
        ${(L.inc || []).length ? `<div class="tpm-note">Rent: ${(L.inc || []).map((i, n) =>
          i.amount == null
            ? `<span class="c-warn">${esc(i.who || '?')} ${i.days}d — <input class="tpm-incamt" data-i="${n}" type="text" placeholder="amount?" style="width:90px"></span>`
            : `${esc(i.who || '?')} ${i.days}d ${money(i.amount)}`).join(' · ')}</div>` : ''}
        <div class="tpm-erow"><button class="tpm-btn" id="tpm-save">Save</button>
          <button class="tpm-btn sm" id="tpm-close">Close</button></div>
      </div>`;
    }

    root.innerHTML = shell(`
      <div class="tpm-tiles">${tiles}</div>
      ${unknowns ? `<div class="tpm-note c-warn">⚠ ${unknowns} lease${unknowns === 1 ? '' : 's'} recorded with no amount. Rent is paid upfront and the properties list never shows it, so leases this panel did not fill in need the figure typing once. They count as nothing until then — not as zero income.</div>` : ''}
      <table class="tpm-t"><thead><tr>
        <th class="l">Property</th><th class="n">Put in</th><th class="n">Collected</th>
        <th class="n">Upkeep</th><th class="n">Net</th><th class="n">To profit</th><th class="n"></th>
      </tr></thead><tbody>${rows.map(rowHtml).join('') || '<tr><td colspan="7" class="c-dim">No properties.</td></tr>'}</tbody></table>
      ${editor}
      <div class="tpm-note">Only what has happened since this panel started is in here — Torn publishes no purchase price, no upgrade receipt and no rent history, so none of it can be recovered. Upkeep is charged from the first lease seen, at today's rate.</div>
    `);

    root.querySelectorAll('.tpm-edit').forEach(b => b.addEventListener('click', () => {
      MODEL.editing = b.dataset.id; render();
    }));
    const $ = id => document.getElementById(id);
    $('tpm-close') && $('tpm-close').addEventListener('click', () => { MODEL.editing = null; render(); });
    $('tpm-addup') && $('tpm-addup').addEventListener('click', () => {
      const c = num($('tpm-upc').value); if (!c) return toast('Give the upgrade a cost.', 'bad');
      const L = ledgerFor(MODEL.editing);
      L.ups = (L.ups || []).concat([{ label: $('tpm-upl').value.trim() || 'upgrade', cost: c, at: Date.now() }]);
      if (!L.at) L.at = Date.now();
      ledgerPut(MODEL.editing, L); render();
    });
    root.querySelectorAll('.tpm-delup').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const L = ledgerFor(MODEL.editing);
      L.ups.splice(+a.dataset.i, 1); ledgerPut(MODEL.editing, L); render();
    }));
    $('tpm-save') && $('tpm-save').addEventListener('click', () => {
      const L = ledgerFor(MODEL.editing);
      L.acq = $('tpm-acq').value || null;
      L.basis = num($('tpm-basis').value) || 0;
      L.ignore = $('tpm-ignore').checked;
      if (!L.at) L.at = Date.now();
      root.querySelectorAll('.tpm-incamt').forEach(inp => {
        const v = num(inp.value); if (v) L.inc[+inp.dataset.i].amount = v;
      });
      ledgerPut(MODEL.editing, L);
      MODEL.editing = null; render();
      toast('Saved.', 'good');
    });
  }

  // ─── THE SURVEY: every upgrade you can buy, anywhere, ranked together ───────
  //
  // The per-property calculator can only answer "what is the best buy HERE". The
  // question worth asking is "what is the best buy AT ALL" — and a $35k pool on a
  // Trailer may be far better value than anything left on the Palace.
  //
  // Each property's upgrade page is loaded in a hidden same-origin iframe and read
  // with the SAME readUpgrades() the on-page view uses, so the two can never
  // disagree. This is the pattern fetchMarket already proved on the rental market.

  /** Load one property's customize page out of sight and read its upgrades. */
  function fetchUpgrades(propId, timeoutMs = 20000) {
    return new Promise(resolve => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:900px;border:0';
      f.src = `/properties.php#/p=options&ID=${propId}&tab=customize`;
      let done = false;
      const finish = v => { if (done) return; done = true; try { f.remove(); } catch (_) {} resolve(v); };
      const deadline = Date.now() + timeoutMs;
      const hash = `#/p=options&ID=${propId}&tab=customize`;
      let nudged = 0;
      const poll = setInterval(() => {
        let u = null;
        try {
          const d = f.contentDocument;
          if (d && d.querySelector('form select[name]')) u = readUpgrades(d);
          else if (d && d.readyState === 'complete' && nudged < 3) {
            // A cold load carrying only a hash can land on the properties LIST and
            // never route: the SPA reads the hash on hashchange, and there was no
            // change. Poking it re-fires the router. fetchMarket sidesteps this by
            // carrying a ?step= query param as well, which this route has no
            // equivalent for.
            nudged++;
            const w = f.contentWindow;
            if (w) { w.location.hash = '#/p=options'; setTimeout(() => { try { w.location.hash = hash; } catch (_) {} }, 120); }
          }
        } catch (_) { /* still loading, or briefly cross-origin mid-navigation */ }
        if (u && u.selCount) { clearInterval(poll); finish(u); }
        else if (Date.now() > deadline) { clearInterval(poll); finish(null); }
      }, 500);
      document.body.appendChild(f);
    });
  }

  /**
   * Walk every property and collect what each could still buy.
   *
   * Sequential, with a pause between: this is Torn's own page being loaded N times
   * and hammering it in parallel is how a script earns a rate limit.
   */
  async function surveyUpgrades() {
    const all = ownProps();
    const props = all.filter(p => p.id);
    // Fail LOUDLY. The first version of this just finished instantly when there was
    // nothing to survey, which from the outside is indistinguishable from a dead
    // button — so every way out of here now says something.
    if (!props.length) {
      MODEL.survey = { running: false, done: 0, total: 0, rows: [], failed: [],
        note: all.length
          ? `Found ${all.length} propert${all.length === 1 ? 'y' : 'ies'} but none with a usable link to its upgrade page, so there is nothing to open. The id comes from an ID= link on each row.`
          : 'No properties of your own on this page. Open Your Properties and press Rescan.' };
      render();
      toast(MODEL.survey.note, 'bad');
      return;
    }
    MODEL.survey = { running: true, done: 0, total: props.length, rows: [], failed: [], note: null };
    render();
    const rows = [], failed = [];
    try {
    for (const p of props) {
      const u = await fetchUpgrades(p.id);
      MODEL.survey.done++;
      if (!u || !u.steps.length) { failed.push(p); MODEL.survey.failed = failed; render(); continue; }
      // One entry per property per track: the BEST value step available on it.
      // Listing every tier would bury the decision, and Torn does not discount a
      // higher tier once you own a lower one, so tiers are alternatives and not
      // a ladder to climb.
      const best = {};
      for (const st of u.steps) {
        if (st.perDay) continue;                       // staff is a daily bill, not a purchase
        if (!best[st.key] || st.perHappy < best[st.key].perHappy) best[st.key] = st;
      }
      for (const st of Object.values(best)) {
        const tiers = u.steps.filter(x => x.key === st.key && !x.perDay).length;
        rows.push({ prop: p, step: st, tiers, typeName: u.typeName });
      }
      MODEL.survey.rows = rows.slice();
      render();
      await new Promise(r => setTimeout(r, 400));
    }
    } catch (e) {
      // An async handler that throws is silent in the console-less world of a
      // userscript panel; say it on screen instead.
      MODEL.survey = { running: false, done: MODEL.survey.done, total: props.length, rows, failed,
        note: 'The survey stopped early: ' + (e && e.message ? e.message : String(e)) };
      render();
      toast('Survey failed — see the panel.', 'bad');
      return;
    }
    rows.sort((a, b) => a.step.perHappy - b.step.perHappy);
    MODEL.survey = { running: false, done: props.length, total: props.length, rows, failed,
      at: Date.now(),
      note: rows.length ? null : 'Read every property but found no upgrades available to buy on any of them.' };
    render();
    if (!rows.length) toast(MODEL.survey.note, 'bad');
  }

  /** The Upgrades tab: your properties, and — once surveyed — every buy ranked. */
  function renderUpgradeList(root, shell) {
    const props = ownProps();
    const sv = MODEL.survey;

    const propRow = p => {
      const L = ledgerFor(p.id);
      const spent = (L.ups || []).reduce((n, u) => n + (u.cost || 0), 0);
      return `<tr>
        <td class="l">${esc(p.typeName || 'Property')} <span class="c-dim">#${esc(p.id || '?')}</span></td>
        <td class="n">${p.happy == null ? '—' : n0(p.happy)}</td>
        <td class="n c-dim">${money(p.upkeep || 0)}/day</td>
        <td class="n">${spent ? money(spent) : '<span class="c-dim">—</span>'}</td>
        <td class="n"><button class="tpm-btn sm tpm-go-up" data-id="${esc(p.id || '')}">Open ▸</button>
          <button class="tpm-btn sm tpm-inline" data-id="${esc(p.id || '')}">Upgrade here ▾</button></td>
      </tr>`;
    };

    let survey = '';
    if (sv && sv.running) {
      survey = `<div class="tpm-note">⏳ Reading upgrade pages — ${sv.done} of ${sv.total}. Each one is a page load, so this takes a moment.</div>`;
    }
    if (sv && sv.note) {
      survey += `<div class="tpm-note c-warn">⚠ ${esc(sv.note)}</div>`;
    }
    if (sv && !sv.running && sv.failed && sv.failed.length && !sv.rows.length) {
      survey += `<div class="tpm-note c-warn">Could not read ${sv.failed.length} propert${sv.failed.length === 1 ? 'y' : 'ies'}: ${sv.failed.map(p => esc(p.typeName || p.id)).join(', ')}. Their upgrade pages did not load in time.</div>`;
    }
    if (sv && sv.rows.length) {
      const best = sv.rows[0];
      const svRow = r => `<tr>
        <td class="l">${esc(r.prop.typeName || '?')} <span class="c-dim">#${esc(r.prop.id)}</span></td>
        <td class="l">${esc(r.step.name)} — ${esc(r.step.label.replace(/\s*\(.*$/, ''))}</td>
        <td class="n">${money(r.step.effCost)}${r.step.effCost !== r.step.cost ? ` <span class="c-dim" title="List ${money(r.step.cost)} before your discounts">▾</span>` : ''}</td>
        <td class="n c-good">+${n0(r.step.gain)}</td>
        <td class="n">${money(Math.round(r.step.perHappy))}</td>
        <td class="n">${r.tiers > 1 ? `<span class="tpm-chip dim" title="${r.tiers} tiers exist on this track. Buying a lower one does NOT reduce the price of a higher one, so pick the tier you actually want.">${r.tiers} tiers</span>` : ''}</td>
        <td class="n"><button class="tpm-btn sm tpm-go-up" data-id="${esc(r.prop.id)}" data-sel="${esc(r.step.selName)}" data-val="${esc(r.step.value)}">Go ▸</button></td>
      </tr>`;
      survey += `<div class="tpm-card"><div class="tpm-card-h">🏆 Best value across every property
          <span style="flex:1"></span><span class="tpm-note">cheapest happiness first</span></div>
        <div class="tpm-card-b">
          <div class="tpm-note">Best buy right now: <b>${esc(best.step.name)}</b> on your ${esc(best.prop.typeName || 'property')} —
            ${money(best.step.effCost)} for +${n0(best.step.gain)} happy, ${money(Math.round(best.step.perHappy))} per point.</div>
          <div class="tpm-scroll"><table class="tpm-t"><thead><tr>
            <th class="l">Property</th><th class="l">Upgrade</th><th class="n">Cost</th>
            <th class="n">Happy</th><th class="n">$/happy</th><th class="n"></th><th class="n"></th>
          </tr></thead><tbody>${sv.rows.map(svRow).join('')}</tbody></table></div>
          ${sv.failed.length ? `<div class="tpm-note c-warn">⚠ Could not read ${sv.failed.length} propert${sv.failed.length === 1 ? 'y' : 'ies'} (${sv.failed.map(p => esc(p.typeName || p.id)).join(', ')}). They are missing from the ranking rather than being shown as having nothing.</div>` : ''}
          <div class="tpm-note">Staff is left out on purpose — it is a daily bill, not a purchase, so ranking it by $/happy against one-off upgrades would compare two different things.</div>
        </div></div>`;
    }

    root.innerHTML = shell(`
      <div class="tpm-erow">
        <button class="tpm-btn" id="tpm-survey" ${sv && sv.running ? 'disabled' : ''}>
          ${sv && sv.running ? '⏳ Surveying…' : '🔍 Survey every property'}</button>
        <span class="tpm-note">Loads each upgrade page once and ranks every available upgrade together.</span>
      </div>
      ${survey}
      <div class="tpm-card"><div class="tpm-card-h">🏠 Your properties</div><div class="tpm-card-b">
        <div class="tpm-scroll"><table class="tpm-t"><thead><tr>
          <th class="l">Property</th><th class="n">Happy</th><th class="n">Upkeep</th>
          <th class="n">Logged</th><th class="n"></th>
        </tr></thead><tbody>${props.map(propRow).join('') || '<tr><td colspan="5" class="c-dim">No properties.</td></tr>'}</tbody></table></div>
      </div></div>
      <div id="tpm-inline-host"></div>
    `);

    const sb = document.getElementById('tpm-survey');
    if (sb) sb.addEventListener('click', surveyUpgrades);
    root.querySelectorAll('.tpm-go-up').forEach(b => b.addEventListener('click', () => {
      const want = b.dataset.sel ? { [b.dataset.sel]: b.dataset.val } : null;
      goUpgrade(b.dataset.id, want);
    }));
    root.querySelectorAll('.tpm-inline').forEach(b => b.addEventListener('click', () => openInline(b.dataset.id)));
  }

  /** What is missing before this property is fully upgraded.
   *
   *  Only TOP tiers, which also sidesteps Torn's nastiest property trap: buying a
   *  lower tier does not reduce the price of a higher one, so working up a track
   *  burns the lower tier's money for nothing. Going straight to the top never
   *  wastes it. Best value first.
   *
   *  Staff is excluded. It is a daily wage, not a purchase, and "maxed" for a
   *  recurring bill is a different decision that should not ride along on a button
   *  labelled with a one-off count. */
  function toMaxSteps(u) {
    const top = {};
    for (const st of (u.steps || [])) {
      if (st.perDay || !st.isTop) continue;
      top[st.key] = st;
    }
    return Object.values(top).sort((a, b) => a.perHappy - b.perHappy);
  }

  /**
   * Torn's real upgrade form, embedded, with a one-click-per-purchase button.
   *
   * The button selects the next upgrade in Torn's own form and presses Torn's own
   * UPGRADE. It never touches whatever Torn shows next — if the game asks to
   * confirm, that is yours to answer. One deliberate click buys one upgrade, and
   * the button says exactly which and what it costs BEFORE you press it.
   *
   * If the dropdown will not take the value, or the UPGRADE button cannot be found,
   * it presses NOTHING and says so. Refusing to act beats acting wrongly when the
   * action spends money.
   */
  function openInline(propId) {
    const host = document.getElementById('tpm-inline-host');
    if (!host) return;
    if (host.dataset.id === String(propId)) { host.innerHTML = ''; host.dataset.id = ''; return; }
    host.dataset.id = String(propId);
    const p = (MODEL.props || []).find(x => String(x.id) === String(propId));

    host.innerHTML = `<div class="tpm-card"><div class="tpm-card-h">🔨 ${esc(p ? p.typeName : 'Property')} — upgrade
        <span style="flex:1"></span>
        <button class="tpm-btn sm" id="tpm-inline-open">Open full page ▸</button>
        <button class="tpm-btn sm" id="tpm-inline-close">Close</button></div>
      <div class="tpm-card-b">
        <div class="tpm-erow" id="tpm-auto-bar">
          <button class="tpm-btn" id="tpm-auto" disabled>⏳ Reading upgrades…</button>
          <span class="tpm-note" id="tpm-auto-note"></span>
        </div>
        <div class="tpm-frame"><iframe id="tpm-inline-frame" src="/properties.php#/p=options&ID=${encodeURIComponent(propId)}&tab=customize"></iframe></div>
      </div></div>`;

    document.getElementById('tpm-inline-close').addEventListener('click', () => { host.innerHTML = ''; host.dataset.id = ''; });
    document.getElementById('tpm-inline-open').addEventListener('click', () => goUpgrade(propId));

    const fr = document.getElementById('tpm-inline-frame');
    const btn = document.getElementById('tpm-auto');
    const note = document.getElementById('tpm-auto-note');
    const frameDoc = () => { try { return fr.contentDocument; } catch (_) { return null; } };

    let queue = [];
    const refresh = () => {
      const d = frameDoc();
      if (!d || !d.querySelector('form select[name]')) return false;
      const u = readUpgrades(d);
      queue = toMaxSteps(u);
      if (!queue.length) {
        btn.disabled = true;
        btn.textContent = '✓ Fully upgraded';
        note.textContent = 'Every one-off upgrade on this property is at its top tier. Staff is not counted here — it is a daily wage, not a purchase.';
        return true;
      }
      const next = queue[0];
      const total = queue.reduce((n, s) => n + s.effCost, 0);
      const happy = queue.reduce((n, s) => n + s.gain, 0);
      btn.disabled = false;
      btn.textContent = `⬆ ${next.name} — ${money(next.effCost)}  (${queue.length} left)`;
      note.innerHTML = `${queue.length} upgrade${queue.length === 1 ? '' : 's'} to max this property: `
        + `<b>${money(total)}</b> for <b class="c-good">+${n0(happy)}</b> happy. `
        + `One click buys the one named on the button — nothing else.`;
      return true;
    };

    // Poll until Torn's form exists, then keep the button in step with the page.
    let tries = 0;
    const t = setInterval(() => {
      if (refresh() || ++tries > 50) {
        clearInterval(t);
        if (tries > 50) { btn.textContent = '⚠ Could not read this page'; note.textContent = 'The upgrade form never appeared in the frame. Use Open full page.'; }
        else { const d = frameDoc(); const s = d && d.querySelector('form select[name]'); if (s) s.scrollIntoView({ block: 'center' }); }
      }
    }, 500);

    btn.addEventListener('click', () => {
      const step = queue[0];
      if (!step) return;
      const d = frameDoc();
      if (!d) return toast('Lost the upgrade page — nothing was pressed.', 'bad');
      const sel = d.querySelector(`form select[name="${step.selName}"]`);
      if (!sel) return toast(`The ${step.name} dropdown is not on that page any more — nothing was pressed.`, 'bad');
      setNative(sel, String(step.value));
      // Assert it actually took. Torn's selects have bitten this project before,
      // and a click on a form that silently kept its old value buys the wrong thing.
      if (String(sel.value) !== String(step.value)) {
        return toast(`The ${step.name} dropdown would not take that value — nothing was pressed.`, 'bad');
      }
      const up = [...d.querySelectorAll('form button, form input[type=submit], form .torn-btn, form a.torn-btn')]
        .find(b => /upgrade/i.test((b.textContent || b.value || '').trim()));
      if (!up) return toast('Could not find Torn\'s UPGRADE button — the dropdown is set, press it yourself.', 'bad');
      const wasAt = String(sel.value);
      up.click();
      // Torn answers into a .update-confirm panel INSIDE this frame — which is
      // exactly where nobody looks, and why five clicks once logged £2m of spend
      // against a property that never got upgraded. Surface it out here, and scroll
      // the frame to it so any confirmation Torn wants is actually reachable.
      btn.disabled = true;
      btn.textContent = '⏳ Waiting for Torn…';
      let n = 0, said = false;
      const re = setInterval(() => {
        const dd = frameDoc();
        if (!dd) { clearInterval(re); return; }
        const box = [...dd.querySelectorAll('.update-confirm, [class*="confirm"]')]
          .find(e => (e.offsetParent || e.getClientRects().length) && (e.innerText || '').trim());
        if (box && !said) {
          said = true;
          const msg = box.innerText.replace(/s+/g, ' ').trim().slice(0, 180);
          toast('Torn says: ' + msg, /error|cannot|not enough|insufficient/i.test(msg) ? 'bad' : 'good');
          try { box.scrollIntoView({ block: 'center' }); } catch (_) {}
        }
        // Only NOW is the money real. The ledger records a purchase when the page
        // shows it installed, never because a button was pressed — an optimistic
        // write here is a lie the profit tracker can never detect afterwards.
        const cur = dd.querySelector(`form select[name="${step.selName}"]`);
        if (cur && String(cur.value) !== wasAt && Number(cur.value) >= Number(step.value)) {
          const L = ledgerFor(propId);
          L.ups = (L.ups || []).concat([{ label: step.name, cost: step.effCost, at: Date.now() }]);
          if (!L.at) L.at = Date.now();
          ledgerPut(propId, L);
          clearInterval(re);
          toast(`${step.name} installed — ${money(step.effCost)} logged against this property.`, 'good');
          refresh();
          return;
        }
        if (++n > 25) {
          clearInterval(re);
          if (!refresh()) { btn.disabled = false; }
          if (!said) toast('Torn never answered — nothing was logged. Check the frame, or use Open full page.', 'bad');
          else toast('Not logged: the upgrade is not showing as installed yet. If Torn asked you to confirm, do it in the frame.', 'bad');
        }
      }, 700);
    });
  }

  /** Chrome shared by every tab, so a new tab cannot drift from the others. */
  function tabShell(inner) {
    const tab = (k, label) => `<button class="tpm-tab${MODEL.tab === k ? ' on' : ''}" data-tab="${k}">${label}</button>`;
    return `
      <div class="tpm-top">
        <span class="tpm-brand">🏠 Property Manager</span>
        <span class="tpm-sub">v0.8.0</span>
        <span style="flex:1"></span>
        <button class="tpm-btn" id="tpm-reload">↻ Rescan</button>
      </div>
      <div class="tpm-tabs">${tab('rentals', '🏷 Rentals')}${tab('upgrades', '🔨 Upgrades')}${tab('profit', '📈 Profit')}</div>
      <div class="tpm-body">${inner}</div>`;
  }
  function wireTabs(root) {
    root.querySelectorAll('.tpm-tab').forEach(b => b.addEventListener('click', () => {
      MODEL.tab = b.dataset.tab; MODEL.editing = null; render();
    }));
    const r = root.querySelector('#tpm-reload');
    if (r) r.addEventListener('click', () => boot(true));
  }

  function render() {
    const root = document.getElementById('tpm-root');
    if (!root) return;
    // The customize page is its own thing — the upgrade calculator lives there and
    // has no property list to tab between.
    if (/tab=customize/.test(location.hash)) return renderUpgrader(root);
    if (MODEL.tab === 'profit')   { renderProfit(root, tabShell); return wireTabs(root); }
    if (MODEL.tab === 'upgrades') { renderUpgradeList(root, tabShell); return wireTabs(root); }
    const props = MODEL.props || [];
    const mine = props.filter(p => !p.spouse);
    const leased = mine.filter(p => p.tenant);
    const empty = mine.filter(p => !p.tenant);
    const soon = leased.filter(p => p.daysLeft != null && p.daysLeft <= cfg.warnDays);

    // Colour reinforces, it never signals on its own — the ⚠ glyph carries the
    // meaning for anyone who can't separate the amber from the pink.
    const tiles = [
      { v: mine.length,   l1: 'Your properties', l2: props.length - mine.length ? `+${props.length - mine.length} spouse` : '&nbsp;', c: '' },
      { v: leased.length, l1: 'Currently leased', l2: 'earning rent', c: leased.length ? 'c-good' : 'c-faint' },
      { v: empty.length,  l1: 'Sitting empty',    l2: empty.length ? '⚠ no income' : 'all working', c: empty.length ? 'c-warn' : 'c-faint' },
      { v: soon.length,   l1: `Expiring ≤ ${cfg.warnDays}d`, l2: soon.length ? '⚠ needs renewal' : 'nothing urgent', c: soon.length ? 'c-crit' : 'c-faint' },
    ].map(t => `<div class="tpm-tile"><div class="v ${t.c}">${t.v}</div>`
      + `<div class="l1">${t.l1}</div><div class="l2 ${t.c === 'c-faint' ? '' : t.c}">${t.l2}</div></div>`).join('');

    const rowFor = p => {
      const price = MODEL.prices[p.id];
      const urgent = p.daysLeft != null && p.daysLeft <= cfg.warnDays;
      let daysCell;
      if (!p.tenant) daysCell = '<span class="tpm-chip dim">empty</span>';
      else if (urgent) daysCell = `<span class="tpm-chip crit">⚠ ${p.daysLeft}d left</span>`;
      else daysCell = `<span class="tpm-chip good">${p.daysLeft}d left</span>`;
      if (p.tenant && p.daysTotal) daysCell += `<div class="tpm-note">of ${p.daysTotal}d term</div>`;

      let suggestion = '<span class="c-faint">—</span>';
      if (p.typeName === 'Shack') suggestion = '<span class="c-faint">can\'t be rented</span>';
      else if (price === 'loading') suggestion = '<span class="c-dim">checking market…</span>';
      else if (price && price.ok) {
        suggestion = `<span class="c-warn tpm-money"><b>${exact(price.perDay)}</b></span> <span class="c-dim">/day</span>`
          + `<div class="tpm-note">vs cheapest credible ${exact(price.cheapest)} · −${cfg.margin}%`
          + (price.dropped ? ` · <span class="c-crit">${price.dropped} outlier${price.dropped > 1 ? 's' : ''} dropped</span>` : '')
          + (/nearest/.test(price.matched) ? ` · <span class="c-crit">⚠ ${esc(price.matched)}</span>` : '')
          + `</div>`;
      } else if (price && !price.ok) {
        suggestion = `<span class="c-crit">⚠ no price</span><div class="tpm-note">${esc(price.why)}</div>`;
      }

      return `<tr>
        <td><span class="tpm-name">${esc(p.typeName || '?')}</span>
            <div class="tpm-note">${p.happy != null ? p.happy.toLocaleString() + ' happy' : ''}</div></td>
        <td>${p.tenant ? '<span class="c-good">' + esc(p.tenant) + '</span>' : '<span class="c-faint">—</span>'}</td>
        <td>${daysCell}</td>
        <td class="n"><span class="tpm-money c-dim">${p.upkeep != null ? exact(p.upkeep) : '—'}</span>
            ${p.upkeep != null ? '<div class="tpm-note">per day</div>' : ''}</td>
        <td>${suggestion}</td>
        <td class="n">${actionCell(p, price)}</td>
      </tr>`;
    };

    const listRows = mine.length
      ? mine.slice().sort((a, b) => {
          const ad = a.daysLeft == null ? 1e9 : a.daysLeft, bd = b.daysLeft == null ? -1 : b.daysLeft;
          return ad - bd;
        }).map(rowFor).join('')
      : `<tr><td colspan="6" class="c-faint" style="padding:14px">No properties found on this page. Open <b>Your Properties</b> and reload.</td></tr>`;

    root.innerHTML = `
      <div class="tpm-top">
        <span class="tpm-brand">🏠 Property Manager</span>
        <span class="tpm-sub">v0.8.0 · rentals</span>
        <span style="flex:1"></span>
        <button class="tpm-btn" id="tpm-price" ${MODEL.loading ? 'disabled' : ''}>
          ${MODEL.loading ? '⏳ Checking market…' : '💲 Price all from market'}</button>
        <button class="tpm-btn" id="tpm-reload">↻ Rescan</button>
      </div>
      <div class="tpm-tabs">
        <button class="tpm-tab on" data-tab="rentals">🏷 Rentals</button>
        <button class="tpm-tab" data-tab="upgrades">🔨 Upgrades</button>
        <button class="tpm-tab" data-tab="profit">📈 Profit</button>
      </div>
      <div class="tpm-body">
        <div class="tpm-tiles">${tiles}</div>

        <div class="tpm-card">
          <div class="tpm-card-h">📋 Your properties <span style="flex:1"></span>
            <span class="tpm-note">soonest expiry first</span></div>
          <div class="tpm-scroll">
            <table class="tpm-t">
              <colgroup><col class="w-prop"><col class="w-ten"><col class="w-lease"><col class="w-up"><col class="w-rent"><col class="w-act"></colgroup>
              <thead><tr>
                <th>Property</th><th>Tenant</th><th>Lease</th>
                <th class="n">Upkeep</th><th>Suggested rent</th><th class="n">Action</th>
              </tr></thead>
              <tbody>${listRows}</tbody>
            </table>
          </div>
        </div>

        <div class="tpm-card">
          <div class="tpm-card-h">⚙ Pricing rule</div>
          <div class="tpm-card-b">
            <div class="tpm-cfg">
              <label>Undercut by <input id="tpm-margin" type="number" min="0" max="50" step="0.5" value="${cfg.margin}">%</label>
              <label>Drop listings under <input id="tpm-outlier" type="number" min="0" max="1" step="0.05" value="${cfg.outlierFrac}">× the 25th percentile</label>
              <label>Warn at <input id="tpm-warn" type="number" min="1" max="60" value="${cfg.warnDays}"> days left</label>
              <button class="tpm-btn" id="tpm-save">Save</button>
              <span id="tpm-saved" style="color:var(--tpm-good);font-size:11px"></span>
            </div>
            <div class="tpm-note" style="margin-top:8px">
              Prices are read from the live rental market for each property type (page 1 is
              already sorted cheapest-first, so it is the whole competitive picture).
              Comparables are listings at the <b>same happiness</b> as yours.
              <b>Outliers are removed first</b> — a Villa listed at $1/day is a friend deal,
              not a market price, and undercutting it would cost you real money. Every
              suggestion shows the listing it undercut and how many rows were discarded.
              All figures here are <b>per day</b>; Torn charges the tenant the whole period upfront.
            </div>
          </div>
        </div>
        ${MODEL.err ? `<div class="tpm-note" style="color:var(--tpm-crit)">${esc(MODEL.err)}</div>` : ''}
      </div>`;

    wireTabs(root);
    root.querySelector('#tpm-price').addEventListener('click', priceAll);

    // Renew / List — ask for the term, then fill Torn's form and stop at NEXT.
    root.querySelectorAll('.tpm-act').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.act, max = +btn.dataset.max, perDay = +btn.dataset.perday;
        const want = prompt(
          `${mode === 'person' ? 'Renewal for ' + btn.dataset.tenant : 'List on the rental market'}\n\n`
          + `Rate: ${exact(perDay)} per day\n`
          + `How many days? (1–${max}${mode === 'person' ? ', limited by Torn\'s 100-day cap' : ''})`,
          String(Math.min(mode === 'person' ? 30 : 100, max)));
        if (want == null) return;
        const days = Math.floor(Number(want));
        if (!days || days < 1 || days > max) {
          return toast(`${want} isn't a usable term — must be 1 to ${max} days. Filled nothing.`, 'bad');
        }
        startLeaseAction({
          mode, days, perDay,
          propId: btn.dataset.id,
          tenantName: btn.dataset.tenant || null,
          userId: null,     // resolved on the lease page from the tenant field where possible
        });
      });
    });
    root.querySelector('#tpm-save').addEventListener('click', () => {
      cfg.margin = Math.max(0, Number(root.querySelector('#tpm-margin').value) || 0);
      cfg.outlierFrac = Math.min(1, Math.max(0, Number(root.querySelector('#tpm-outlier').value) || 0));
      cfg.warnDays = Math.max(1, Number(root.querySelector('#tpm-warn').value) || 1);
      GM_setValue(K.MARGIN, cfg.margin);
      GM_setValue(K.OUTLIER, cfg.outlierFrac);
      GM_setValue(K.WARN_DAYS, cfg.warnDays);
      // Re-derive from the cached rows rather than re-fetching — the rule changed,
      // the market didn't.
      repriceFromCache().then(render);
    });
  }

  async function repriceFromCache() {
    for (const p of MODEL.props) {
      if (!p.typeId || p.happy == null) continue;
      const rows = await marketFor(p.typeId);
      MODEL.prices[p.id] = suggestPrice(p.happy, rows);
    }
  }

  async function priceAll() {
    const targets = MODEL.props.filter(p => !p.spouse && p.typeId && p.happy != null);
    if (!targets.length) { MODEL.err = 'Nothing to price — no property types recognised.'; return render(); }
    MODEL.loading = true; MODEL.err = null;
    targets.forEach(p => { MODEL.prices[p.id] = 'loading'; });
    render();
    // One iframe at a time: they each run Torn's full page JS, and a burst of them is
    // both slow and rude to the site.
    const seen = {};
    for (const p of targets) {
      try {
        if (!seen[p.typeId]) seen[p.typeId] = await marketFor(p.typeId);
        MODEL.prices[p.id] = suggestPrice(p.happy, seen[p.typeId]);
      } catch (e) {
        MODEL.prices[p.id] = { ok: false, why: e.message || 'market load failed' };
      }
      render();
    }
    MODEL.loading = false;
    render();
  }

  /** Say plainly which prices are on screen and why — a discount silently applied
   *  twice is a 10% error in the direction that costs money. */
  function discountExplainer(u) {
    const wantedPct = Math.round(u.wanted * 100);
    if (!u.pageDisc.measurable) {
      return 'Could not check whether Torn is already discounting this page (no interior option to measure against), '
        + (wantedPct ? 'so your ' + wantedPct + '% is applied on top of the listed prices. Verify one purchase before trusting the totals.'
                     : 'and no perks are switched on, so prices are exactly as listed.');
    }
    if (u.pageDisc.applied > 0) {
      const pct = Math.round(u.pageDisc.applied * 100);
      return 'Torn is ALREADY showing you discounted prices here — measured ' + pct + '% off the list price ('
        + exact(u.pageDisc.shown) + ' where the full rate is ' + exact(u.pageDisc.listPrice) + '). '
        + 'Your perk toggles are therefore NOT applied again, because that would double-count them and understate every total.';
    }
    if (!wantedPct) {
      return 'Prices here are full list rate — Torn is not discounting this page, and no perks are switched on. '
        + 'Each perk below is worth 10% off every upgrade.';
    }
    return 'Prices here are full list rate, so your ' + wantedPct + '% is applied on top. '
      + 'Whether the two perks actually stack to 20% is not documented anywhere I could verify — if you own both, '
      + 'check one real purchase against these figures before relying on the totals.';
  }

  // ─── RENDER: UPGRADE PLANNER ────────────────────────────────────────────────

  function renderUpgrader(root) {
    const u = readUpgrades();
    if (!u.selCount) {
      root.innerHTML = `<div class="tpm-top"><span class="tpm-brand">🏠 Property Manager</span>
        <span class="tpm-sub">v0.4.0 · upgrades</span></div>
        <div class="tpm-body"><div class="tpm-note">No upgrade options on this page yet — give it a moment, or reload.</div></div>`;
      return;
    }

    const oneOff = u.steps.filter(s => !s.perDay).sort((a, b) => a.perHappy - b.perHappy);
    const staff  = u.steps.filter(s => s.perDay).sort((a, b) => a.perHappy - b.perHappy);

    // What is still available if you took the TOP tier of each track. Buying a lower
    // tier does not discount the higher one, so the honest "what's left" figure is the
    // best step per track — summing every step would double-count the same pool.
    const bestPerTrack = {};
    for (const s of u.steps) {
      if (!bestPerTrack[s.key] || s.gain > bestPerTrack[s.key].gain) bestPerTrack[s.key] = s;
    }
    const remaining = Object.values(bestPerTrack).filter(s => !s.perDay);
    const potentialHappy = remaining.reduce((n, s) => n + s.gain, 0);
    const potentialCost  = remaining.reduce((n, s) => n + s.effCost, 0);
    const potentialList  = remaining.reduce((n, s) => n + s.cost, 0);
    const saved = potentialList - potentialCost;

    const rowFor = (s, i) => {
      // Torn does NOT discount a higher tier once you own a lower one, so buying a
      // Small pool and later a Large one costs the full price of both.
      const higher = u.steps.filter(x => x.key === s.key && x.value > s.value).length;
      const trap = higher
        ? `<div class="tpm-note c-crit">⚠ does not reduce the ${higher} higher tier${higher > 1 ? 's' : ''} — you would pay those in full</div>`
        : '';
      const cleanLabel = esc(s.label.replace(/\s*\([^)]*\)\s*$/, ''));
      return `<tr>
        <td><span class="tpm-name">${esc(s.name)}</span>
            <div class="tpm-note">${cleanLabel}</div>${trap}</td>
        <td class="n"><span class="tpm-money c-warn">${exact(s.effCost)}</span>
            <div class="tpm-note">${s.perDay ? 'every day' : 'one-off'}${
              s.effCost !== s.cost ? ' · was ' + exact(s.cost) : ''}</div></td>
        <td class="n"><span class="c-good">+${s.gain.toLocaleString()}</span><div class="tpm-note">happy</div></td>
        <td class="n"><span class="tpm-money">${exact(Math.round(s.perHappy))}</span>
            <div class="tpm-note">per happy${s.perDay ? ' / day' : ''}</div></td>
        <td class="n">${i === 0 ? '<span class="tpm-chip good">best value</span><br>' : ''}
            <button class="tpm-btn tpm-up" data-sel="${esc(s.selName)}" data-val="${s.value}">Select ▸</button></td>
      </tr>`;
    };

    const table = (rows, emptyMsg) => rows.length
      ? `<div class="tpm-scroll"><table class="tpm-t">
           <colgroup><col style="width:36%"><col style="width:17%"><col style="width:13%"><col style="width:17%"><col style="width:17%"></colgroup>
           <thead><tr><th>Upgrade</th><th class="n">Cost</th><th class="n">Gain</th>
             <th class="n">Value</th><th class="n">Action</th></tr></thead>
           <tbody>${rows.map(rowFor).join('')}</tbody></table></div>`
      : `<div class="tpm-card-b"><div class="tpm-note">${emptyMsg}</div></div>`;

    root.innerHTML = `
      <div class="tpm-top">
        <span class="tpm-brand">🏠 Property Manager</span>
        <span class="tpm-sub">v0.4.0 · upgrades${u.typeName ? ' · ' + esc(u.typeName) : ''}</span>
        <span style="flex:1"></span>
        <button class="tpm-btn" id="tpm-clear">Reset dropdowns</button>
      </div>
      <div class="tpm-body">
        <div class="tpm-tiles">
          <div class="tpm-tile"><div class="v">${u.base != null ? u.base.toLocaleString() : '?'}</div>
            <div class="l1">Base happy</div><div class="l2">${esc(u.typeName || 'unknown type')}</div></div>
          <div class="tpm-tile"><div class="v c-good">+${u.installedHappy.toLocaleString()}</div>
            <div class="l1">Already installed</div><div class="l2">from upgrades</div></div>
          <div class="tpm-tile"><div class="v c-warn">+${potentialHappy.toLocaleString()}</div>
            <div class="l1">Still available</div><div class="l2">one-off only</div></div>
          <div class="tpm-tile"><div class="v c-warn">${money(potentialCost)}</div>
            <div class="l1">To max it out</div>
            <div class="l2">${saved > 0 ? '<span class="c-good">saves ' + money(saved) + '</span>' : 'one-off spend'}</div></div>
        </div>

        <div class="tpm-card">
          <div class="tpm-card-h">🔨 One-off upgrades <span style="flex:1"></span>
            <span class="tpm-note">cheapest happiness first</span></div>
          ${table(oneOff, 'Every one-off upgrade is already installed.')}
        </div>

        <div class="tpm-card">
          <div class="tpm-card-h">👤 Staff <span style="flex:1"></span>
            <span class="tpm-note">charged daily — ranked separately</span></div>
          ${table(staff, 'This property type cannot hire staff.')}
          <div class="tpm-card-b" style="padding-top:2px">
            <div class="tpm-note">Staff is a <b>daily charge</b>, not a purchase, so its value column is
              per happy <b>per day</b> and cannot be compared with the one-off list above. If you rent this
              property out, the happiness that sets your rent is the fully-upgraded-<i>without</i>-staff
              figure — and unpaid staff fees start eating the property's max happy once they pass 10% of
              its base value.</div>
          </div>
        </div>

        <div class="tpm-card">
          <div class="tpm-card-h">🎫 Discount perks</div>
          <div class="tpm-card-b">
            <div class="tpm-cfg">
              <label><input type="checkbox" id="tpm-elt" ${cfg.elt ? 'checked' : ''}> ELT stock benefit (−10%)</label>
              <label><input type="checkbox" id="tpm-broker" ${cfg.broker ? 'checked' : ''}> Property Broker job (−10%)</label>
              <span class="tpm-note">${PERKS.elt.detail} · ${PERKS.broker.detail}</span>
            </div>
            <div class="tpm-note" style="margin-top:8px">${discountExplainer(u)}</div>
          </div>
        </div>

        <div class="tpm-card">
          <div class="tpm-card-b"><div class="tpm-note">
            Costs are read from this page, so they are this property's real prices — interior scales
            with the house (a quarter, then a half of its value). Happiness figures are Torn's published
            numbers; the game never shows them on this screen, which is what makes the choice hard.
            <b>Select ▸</b> sets the dropdown for you — you still press <b>UPGRADE</b> yourself.
          </div></div>
        </div>
      </div>`;

    root.querySelectorAll('.tpm-up').forEach(b => {
      b.addEventListener('click', () => {
        const sel = document.querySelector('form select[name="' + b.dataset.sel + '"]');
        if (!sel) return toast('Could not find that dropdown on the page.', 'bad');
        setNative(sel, b.dataset.val);
        if (String(sel.value) !== String(b.dataset.val)) {
          return toast('Torn did not accept that selection — set it by hand.', 'warn');
        }
        sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        sel.style.outline = '2px solid #43c98b';
        setTimeout(() => { sel.style.outline = ''; }, 6000);
        toast('Dropdown set. Check it, then press UPGRADE yourself — this script never submits.', 'ok');
        setTimeout(() => renderUpgrader(root), 400);   // the remaining steps shift once chosen
      });
    });
    const bindPerk = (id, key, storeKey) => {
      const el = root.querySelector(id);
      if (!el) return;
      el.addEventListener('change', () => {
        cfg[key] = el.checked;
        GM_setValue(storeKey, el.checked);
        renderUpgrader(root);
      });
    };
    bindPerk('#tpm-elt', 'elt', K.ELT);
    bindPerk('#tpm-broker', 'broker', K.BROKER);

    root.querySelector('#tpm-clear')?.addEventListener('click', () => {
      document.querySelectorAll('form select').forEach(s => {
        if (s.name && UP_HAPPY[s.name.toLowerCase()]) setNative(s, '0');
      });
      renderUpgrader(root);
      toast('Upgrade dropdowns reset to None. Nothing was submitted.', 'ok');
    });
  }

  // ─── MOUNT ──────────────────────────────────────────────────────────────────

  function mount() {
    if (document.getElementById('tpm-root')) return true;
    const wrap = document.querySelector('#properties-page-wrap');
    if (!wrap || !wrap.parentElement) return false;
    const root = document.createElement('div');
    root.id = 'tpm-root';
    wrap.parentElement.insertBefore(root, wrap);
    return true;
  }

  function boot(force) {
    if (!mount()) return;
    const props = parseMyProperties();
    // An EMPTY array is truthy, and every properties sub-view — customize, lease,
    // the rental market — still has #properties-page-wrap, just no property rows.
    // So letting an empty parse through wiped a perfectly good list on every
    // hashchange, and the survey then reported "no properties of your own" on a
    // page that had just listed them. Keep the last real parse.
    if (props && props.length) { MODEL.props = props; reconcileLeases(props); _coldTries = 40; }
    else if (props && !(MODEL.props || []).length) MODEL.props = props;   // genuinely none yet
    if (force) MODEL.prices = {};
    render();
  }

  // Torn's SPA swaps the properties list on navigation and takes our panel with it.
  // Re-mount on a heartbeat rather than trusting a one-shot init — the same lesson
  // the OC Suite learned about React re-renders.
  /** Arriving on a lease tab with a queued action? Wait for the form, then fill it. */
  function checkPendingOnLeaseTab() {
    if (!/tab=lease/.test(location.hash)) return;
    const a = takeAction();
    if (!a) return;
    const deadline = Date.now() + 15000;
    const t = setInterval(() => {
      if (document.querySelector('#tab-menu-lease form input[name="money"]')) {
        clearInterval(t);
        applyLeaseAction(a);
      } else if (Date.now() > deadline) {
        clearInterval(t);
        toast('The lease form never appeared — filled nothing.', 'bad');
      }
    }, 350);
  }

  boot(false);
  checkPendingOnLeaseTab();
  // Landing on a customize page with selections queued from the panel: wait for the
  // dropdowns, set them, and stop. Torn's UPGRADE button is never pressed for you.
  if (/tab=customize/.test(location.hash)) {
    const dl = Date.now() + 15000;
    const t = setInterval(() => {
      if (document.querySelector('select[name="interior"], select[name="pool"], select[name="hottub"]')) {
        clearInterval(t); applyPendingUpgrade();
      } else if (Date.now() > dl) clearInterval(t);
    }, 350);
  }
  /**
   * Re-parse whenever Torn (re)builds the list.
   *
   * The property rows arrive by AJAX AFTER the page loads, and the panel mounts the
   * moment #properties-page-wrap exists — which is before there is anything inside
   * it. The old heartbeat only re-booted when the PANEL was missing, so a cold load
   * parsed an empty list exactly once and never looked again. Switching tabs in
   * Torn fires a hashchange, which is why the list only ever appeared after a tab
   * switch. Watch the container instead of guessing at timing.
   *
   * The observer is on the WRAP, never on body: the panel is a sibling of the wrap,
   * so watching body with subtree would see our own renders and loop forever.
   */
  function watchPropertyList() {
    const target = document.querySelector('#properties-page-wrap');
    if (!target) return null;
    let timer = null;
    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const props = parseMyProperties();
        if (!props || !props.length) return;          // mid-rebuild: say nothing
        const before = (MODEL.props || []).length;
        const changed = before !== props.length
          || props.some((p, i) => !MODEL.props[i] || MODEL.props[i].id !== p.id
               || MODEL.props[i].tenant !== p.tenant || MODEL.props[i].daysLeft !== p.daysLeft);
        MODEL.props = props;
        reconcileLeases(props);
        // Only repaint when the picture actually moved, or the panel would rebuild
        // itself on every DOM tick and throw away scroll position and open editors.
        const busy = document.querySelector('#tpm-inline-host iframe');
        if (changed && !busy) render();
      }, 400);
    });
    obs.observe(target, { childList: true, subtree: true });
    obs.__target = target;
    return obs;
  }
  listObs = watchPropertyList();

  setInterval(() => {
    if (!document.getElementById('tpm-root')) { boot(false); return; }
    // Still nothing parsed? The rows have not landed yet — keep looking, but only
    // for about a minute. An unbounded poll re-renders the panel forever when the
    // portfolio is genuinely empty, and would reload an open upgrade frame with it.
    if (!(MODEL.props || []).length && _coldTries < 40
        && !document.querySelector('#tpm-inline-host iframe')) { _coldTries++; boot(false); }
    // The SPA can swap the whole wrap out, taking the observer's target with it.
    if (!listObs || !listObs.__target || !document.contains(listObs.__target)) {
      if (listObs) listObs.disconnect();
      listObs = watchPropertyList();
    }
  }, 1500);
  window.addEventListener('hashchange', () => setTimeout(() => { boot(false); checkPendingOnLeaseTab(); }, 600));
})();
