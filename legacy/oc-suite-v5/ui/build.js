/**
 * Assemble the v6 UI into one pasteable block.
 *
 *   node ui/build.js        → writes ui/v6-bundle.js
 *
 * The SHIPPED userscript stays a single self-contained file with no build
 * step — that constraint is about what the user installs, not about how the
 * source is prepared here. This exists so the bundle cannot drift from the
 * prototype: it is generated from frostbite.html and derive.js, never edited
 * by hand.
 *
 * What changes on the way through:
 *   · #app            → #ocm-v6      (we own a div inside Torn, not a page)
 *   · fixtures        → the real stores, via v5's existing loaders
 *   · prototype chrome (the grey dev bar) is dropped entirely
 *   · module.exports guards are stripped — one scope, no module system
 */
const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const html = read('frostbite.html');

/**
 * Prefix every selector with `#ocm-v6` so nothing can reach Torn's page.
 *
 * The prototype owns its document, so bare `.card` and `.content` are fine
 * there. Inside Torn they are not: Torn has its own elements with those class
 * names, and an unscoped rule restyles them. Scoping also raises specificity,
 * which is how the v5 rail CSS wins against older rules by weight rather than
 * by source order.
 *
 * Handles the cases a naive regex gets wrong:
 *   · comments containing braces
 *   · @media / @supports — the inner selectors get scoped, the at-rule does not
 *   · @keyframes — `from`, `to` and `50%` must be left completely alone
 *   · comma-separated lists — every part is scoped, not just the first
 *   · a selector already mentioning the scope is left as-is
 *   · A COMMENT DIRECTLY ABOVE A RULE IS NOT PART OF ITS SELECTOR.
 *
 *     This one shipped. The prelude was scoped as a single blob, so a rule
 *     with an explanatory comment above it came out as
 *         #ocm-v6 <comment> #ocm-v6[data-theme="midnight"]
 *     A browser strips the comment and reads a DESCENDANT selector — an
 *     #ocm-v6 inside an #ocm-v6 — which cannot match anything.
 *
 *     Every theme block and both width-mode rules are commented, so all of
 *     them were dead. The base rule has no comment above it and still
 *     applied, so the panel looked correctly styled and simply ignored every
 *     theme and layout switch. Comments are now separated from the selector
 *     before scoping, and a build check below fails on `#ocm-v6 #ocm-v6`.
 */
function scopeCss(src, scope) {
  let out = '';
  let buf = '';
  let depth = 0;
  let inKeyframes = -1;   // depth at which a @keyframes block opened

  for (let i = 0; i < src.length; i++) {
    // Pass comments through untouched — they may contain braces.
    if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      buf += src.slice(i, stop);
      i = stop - 1;
      continue;
    }

    const c = src[i];
    if (c === '{') {
      const prelude = buf;
      const trimmed = prelude.trim();
      if (trimmed.startsWith('@')) {
        if (/^@keyframes/i.test(trimmed)) inKeyframes = depth;
        out += prelude + '{';
      } else if (inKeyframes >= 0) {
        out += prelude + '{';                  // from / to / 50%
      } else {
        /* Split the prelude into [whitespace and comments] + [selector].
           Comments are emitted verbatim and never scoped — treating them as
           selector text is what produced `#ocm-v6 #ocm-v6[data-theme=…]`. */
        const [, lead, selText] =
          prelude.match(/^((?:\s|\/\*[\s\S]*?\*\/)*)([\s\S]*)$/);
        const scoped = selText.trim().split(',').map(part => {
          const p = part.trim();
          if (!p || p.includes(scope)) return p;
          return `${scope} ${p}`;
        }).join(', ');
        out += lead + scoped + ' {';
      }
      depth++;
      buf = '';
    } else if (c === '}') {
      depth--;
      if (inKeyframes >= 0 && depth <= inKeyframes) inKeyframes = -1;
      out += buf + '}';
      buf = '';
    } else {
      buf += c;
    }
  }
  return out + buf;
}

/** Slice between two markers, exclusive of both. */
function between(src, open, close, label) {
  const a = src.indexOf(open);
  const b = src.indexOf(close, a + open.length);
  if (a < 0 || b < 0) throw new Error(`build: could not find ${label}`);
  return src.slice(a + open.length, b);
}

/* ── 1. CSS ──────────────────────────────────────────────────────────────
   Scoped to #ocm-v6, which is where every token, the theme attribute and
   the width class already live. Nothing here targets :root, html or body,
   so it cannot reach Torn's own page. */
const css = between(html, '<style>', '</style>', 'stylesheet')
  .replace(/#app\b/g, '#ocm-v6')
  /* The universal reset is fine in a page we own and catastrophic in one we
     do not — unscoped, `* { box-sizing: border-box }` restyles every element
     on Torn. Confine it to our subtree. */
  .replace(/^\*, \*::before, \*::after \{/m,
           '#ocm-v6, #ocm-v6 *, #ocm-v6 *::before, #ocm-v6 *::after {')
  // #app was already renamed above, so the token to scope against is final.
  .replace(/^[\s\S]*$/, s => scopeCss(s, '#ocm-v6'))
  // The dev toolbar never ships. Its rules would be dead weight and its
  // hardcoded colours would look wrong against a themed panel.
  .replace(/\/\* ═+ PROTOTYPE CHROME[\s\S]*?(?=\/\* ═+ APP SHELL)/, '')
  .replace(/^body \{[^}]*\}\n/m, '');

/* ── 2. Shell markup ─────────────────────────────────────────────────────
   Just the app div. The proto bar above it is dev chrome. */
const shell = between(html, '<div class="app" id="app">', '\n</div>', 'app shell').trim();

/* ── 3. Pure logic ───────────────────────────────────────────────────────
   derive.js verbatim, minus its CommonJS tail. */
const derive = read('derive.js').replace(
  /if \(typeof module !== 'undefined'[\s\S]*$/, '');

/* ── 4. UI code ──────────────────────────────────────────────────────────
   Everything from the prototype's script block EXCEPT the fixture wiring and
   the dev-only bits, which are replaced below. */
let ui = between(html, '<script>', '</script>', 'ui script');

/* Replace ONLY the banner comment, not the code under it. computeViews() and
   payoutRows() are the shape layer and are identical in both builds — an
   earlier version of this strip was greedy and swallowed them, which failed
   at mount rather than at build. Only their INPUT differs: fixtures in the
   prototype, real stores here. */
ui = ui.replace(
  /\/\* ═+\n {3}THE STORES, AND WHAT WE DERIVE FROM THEM[\s\S]*?═+ \*\//,
  `/* ═══════════════════════════════════════════════════════════════════════════
   VIEWS

   \`S\` is the real stores, read by ocmV6Refresh() through v5's own loaders.
   \`V\` is what the screens show, produced by the same derive functions the
   test suites cover. If the arithmetic is wrong, this panel is visibly wrong.
   ═══════════════════════════════════════════════════════════════════════════ */`);

/* The prototype computes S/V/F at load time from fixtures. In the userscript
   the adapter owns those three bindings and fills them on every refresh, so
   strip the eager declarations — leaving them declares the names twice and
   the whole bundle fails to parse. */
ui = ui.replace(/^let F = faction\(\);$/m, '');
ui = ui.replace(/^let V = computeViews\(S\);$/m, '');
ui = ui.replace(/^const S = makeFixtures\(\);$/m, '');

// Drop the prototype's forced-state toggle wiring. The real thing gets its
// states from actual sync status, not a dev switch.
ui = ui.replace(/\/\*\* Prototype-only\. Forces every feed[\s\S]*?\n\}\n/, '');
ui = ui.replace(/let forced = 'ok';/, "const forced = 'ok';   // real states come from *_STATUS keys");
ui = ui.replace(/\/\* Prototype chrome only[\s\S]*?\n\}\);\n/, '');
ui = ui.replace(/const PROTO_ACTIONS[\s\S]*?\n\}\);\n/, '');

// The prototype binds the click handler at load. The userscript binds it in
// ocmV6Mount(), once #ocm-v6 actually has contents.
ui = ui.replace(/^APP\(\)\.addEventListener\('click', onAppClick\);$/m, '');

// Boot differs: the userscript mounts on demand, it does not run at load.
ui = ui.replace(/\/\* Appearance BEFORE the first paint[\s\S]*$/, '');

// #app → #ocm-v6 everywhere in the JS, INCLUDING comments. Prose that still
// says #app after the rename is prose that lies to the next reader.
ui = ui.replace(/getElementById\('app'\)/g, "getElementById('ocm-v6')");
ui = ui.replace(/#app\b/g, '#ocm-v6');

// One comment reads as an instruction for the port, which has now happened.
ui = ui.replace(
  'Ports as-is: bind to #ocm-v6 instead of #ocm-v6 and nothing else changes.',
  'This IS the ported form — bound to #ocm-v6, the div we own inside Torn.');

/* ── 5. The adapter — the only genuinely new code ────────────────────────
   Reads the real stores through v5's OWN loaders. Those are already covered
   by the existing 19 suites, so reimplementing them here would be adding
   untested copies of tested code. */
const adapter = `
/* ═══════════════════════════════════════════════════════════════════════════
   v6 ADAPTER — real stores in, views out

   Deliberately calls v5's existing load*() functions rather than reading GM
   storage directly. They already handle the malformed-JSON and missing-key
   cases, and they are covered by the shipped test suites; a parallel set of
   readers here would be untested duplicates of tested code.
   ═══════════════════════════════════════════════════════════════════════════ */
let S = null, V = null, F = null;

function ocmV6Stores() {
  const gear = (() => { try { return loadGearCache() || {}; } catch (_) { return {}; } })();
  return {
    now: Math.floor(Date.now() / 1000),
    myFactionId: String(GM_getValue(GMK.MY_FACTION_ID, '') || ''),
    names:        safe(loadMemberNameCache, {}),
    ocArchive:    safe(loadOcArchive, {}),
    profitLedger: safe(loadProfitLedger, {}),
    cprArchive:   safe(loadCprArchive, {}),
    payoutEvents: safe(loadPayoutEvents, {}),
    deposits:     safe(loadDepositEvents, {}),
    gearCache:    gear,
    loanLedger:   safe(loadLoanLedger, {}),
    warArchive:   safe(loadWarArchive, {}),
    chainArchive: safe(loadChainArchive, {}),
    live:         ocmV6Live(),
  };
}

/**
 * The LIVE slice: crimes in flight, present-tense member status, enemy roster.
 *
 * None of it is persisted, because none of it is worth keeping — it describes
 * right now. Crimes and members ride \`OCM_LAST_CTX\`, the context v5's
 * renderDashboard already stashed from the payload it fetched anyway, so this
 * costs ZERO extra API calls. The enemy roster and stat estimates come from the
 * War Room's own short-TTL caches.
 *
 * Everything defaults to empty, and that is the honest answer rather than a
 * failure: before the first refresh (and outside a live war) there genuinely is
 * nothing. The panes render an empty state; they never fabricate rows.
 */
function ocmV6Live() {
  const ctx = (typeof OCM_LAST_CTX !== 'undefined' && OCM_LAST_CTX) || null;
  /* Thunks, not bare references: \`safe(loadSpyCache, …)\` evaluates the
     identifier BEFORE the try/catch, so a loader that does not exist throws a
     ReferenceError past the guard. Wrapping puts the lookup inside it. */
  const enemies = safe(() => loadEnemyCache(), null);
  return {
    crimes:  ctx?.crimes || {},
    // memberById is already keyed by real user id. memberMap is NOT reliably so —
    // Torn's v2 members payload is an ARRAY, which is exactly how v4.8's name
    // lookups silently indexed by 0,1,2 and rendered "#3580191" everywhere.
    members: ctx?.memberById || {},
    enemies,
    spies:   safe(() => loadSpyCache(), {}),
    // The hit-call queues live inside the War Tools module, reachable only
    // through its handle — and only once a war page has actually booted it.
    calls:   (typeof OCM_WT !== 'undefined' && OCM_WT && OCM_WT.state)
               ? OCM_WT.state.calls : null,
  };
}

/** A loader that throws must not take the whole panel down with it. */
function safe(fn, dflt) {
  try { const v = fn(); return v == null ? dflt : v; } catch (_) { return dflt; }
}

/** Recompute everything the screens read. Cheap enough to run per refresh —
 *  it is pure array work over data already in memory, no API calls. */
function ocmV6Refresh() {
  S = ocmV6Stores();
  V = computeViews(S);
  F = faction();
}

/** Mount into #ocm-v6. Idempotent — safe to call on every render pass. */
function ocmV6Mount() {
  const root = document.getElementById('ocm-v6');
  if (!root) return false;
  if (!root.querySelector('.side')) {
    root.innerHTML = ${JSON.stringify(shell)};
    APP().addEventListener('click', onAppClick);
  }
  ocmV6Refresh();
  setTheme(theme);
  setW(width);
  render();
  return true;
}
`;

/* computeViews and faction() live in the prototype's script and are kept —
   they are the shape layer, identical in both. Only their INPUT changes. */

const banner = `/* ═══════════════════════════════════════════════════════════════════════════
   v6 UI — GENERATED, DO NOT EDIT HERE

   Built from ui/frostbite.html + ui/derive.js by ui/build.js.
   Edit those and re-run \`node ui/build.js\`; hand-edits to this block are
   lost on the next build and will silently diverge from the tests.

   Generated: ${new Date().toISOString().slice(0, 10)}
   ═══════════════════════════════════════════════════════════════════════════ */
`;

const bundle = [
  banner,
  'const OCM_V6_CSS = ' + JSON.stringify(css) + ';',
  '',
  derive.trim(),
  '',
  ui.trim(),
  '',
  adapter.trim(),
].join('\n');

fs.writeFileSync(path.join(__dirname, 'v6-bundle.js'), bundle, 'utf8');

const kb = n => (n / 1024).toFixed(1) + 'kb';
console.log('wrote ui/v6-bundle.js');
console.log('  css     ' + kb(css.length));
console.log('  shell   ' + kb(shell.length));
console.log('  derive  ' + kb(derive.length));
console.log('  ui      ' + kb(ui.length));
console.log('  total   ' + kb(bundle.length) + '  (' + bundle.split('\n').length + ' lines)');

/* Fail loudly on anything that would break inside Torn. These are cheap and
   they are exactly the mistakes that do not show up until the page is live. */
const problems = [];
/* Control characters do not belong in source. A stray NUL is invisible in an
   editor, survives every syntax check, makes grep/diff treat the file as
   binary — and one reached the userscript from a composite map key here. */
const ctrl = [...bundle].filter(c => {
  const n = c.charCodeAt(0);
  return n < 0x09 || (n > 0x0a && n < 0x20 && n !== 0x0d);
});
if (ctrl.length) {
  problems.push(`${ctrl.length} control character(s) in the bundle — ` +
    'codes ' + [...new Set(ctrl.map(c => 'U+' + c.charCodeAt(0).toString(16).padStart(4, '0')))].join(', '));
}
if (/#app\b/.test(bundle)) problems.push('#app survived the rename to #ocm-v6');
if (/\bmakeFixtures\b/.test(bundle)) problems.push('fixture data leaked into the bundle');
if (/\bclass="proto"/.test(bundle)) problems.push('dev toolbar leaked into the bundle');
if (/module\.exports/.test(bundle)) problems.push('CommonJS export survived');
if (/\son\w+\s*=\s*["']/.test(bundle)) problems.push('an inline event handler survived');
if (/^:root[\s[{]/m.test(css)) problems.push('CSS still targets :root');
if (/\bbody\.(compact|icons|full)/.test(css)) problems.push('CSS still targets body');

/* Read the CSS the way a browser does — comments gone — and check the rules
   the user can actually SEE fail. A dead selector throws nothing, renders
   nothing, and looks exactly like "the toggle doesn't work". */
const seen = css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* `#ocm-v6 #ocm-v6` is a descendant of itself: unmatchable, always a bug. */
if (/#ocm-v6\s+#ocm-v6/.test(seen)) {
  problems.push('a selector scopes #ocm-v6 inside itself — the rule is dead ' +
    '(a comment above the rule was scoped as if it were selector text)');
}

/* Themes and width modes are the switchable surface. If one of these is
   missing the panel still draws, so nothing else catches it. */
for (const t of ['midnight', 'slate', 'ember', 'contrast', 'colorsafe']) {
  if (!new RegExp(`#ocm-v6\\[data-theme="${t}"\\]\\s*\\{`).test(seen)) {
    problems.push(`theme "${t}" has no live rule — switching to it does nothing`);
  }
}
for (const mode of ['compact', 'icons']) {
  if (!new RegExp(`#ocm-v6\\.${mode}\\s*\\{`).test(seen)) {
    problems.push(`layout "${mode}" has no live root rule — --sidebar-w never changes`);
  }
}

if (problems.length) {
  console.log('\nFAILED:');
  for (const p of problems) console.log('  ✗ ' + p);
  process.exit(1);
}
console.log('\nbundle checks passed');
