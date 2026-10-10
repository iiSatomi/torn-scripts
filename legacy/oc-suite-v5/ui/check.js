/**
 * Render check for the UI prototype.
 *
 * The prototype is standalone, so it has no test suite — but "it looked fine in
 * the source" is exactly how three stray characters got into the CSS, and how a
 * `display:block` silently killed the v5.3 nav-rail grid in the real script.
 * This actually EXECUTES every page in jsdom and asserts on the resulting DOM.
 *
 *   node ui/check.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'frostbite.html'), 'utf8');

/* The prototype loads derive.js and fixtures.js as separate files so a browser
   gets one source of truth with the test suites. jsdom does not fetch relative
   scripts unless resources are enabled, so inline them here — same code, same
   order, no second copy to drift. */
const inlined = html.replace(
  /<script src="([\w.]+)"><\/script>/g,
  (_, f) => '<script>' + fs.readFileSync(path.join(__dirname, f), 'utf8') + '</script>');

let failed = 0;
const ok = (label, cond, detail) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + label);
  if (!cond) { failed++; if (detail) console.log('      ' + detail); }
};

/* ── 1. Stray characters ──────────────────────────────────────────────────
   Targets only the scripts that appear by ACCIDENT (CJK, Cyrillic, Arabic,
   Hangul). Box-drawing, en-dashes, ellipses and emoji are all deliberate in
   this file, so allowlisting "expected" characters would be endless and would
   flag legitimate typography — which is exactly what the first version did. */
console.log('\nStray characters');
const strays = [...new Set(
  [...html.matchAll(/[　-鿿Ѐ-ӿ؀-ۿ가-힯]/g)].map(m => m[0])
)];
ok('no CJK/Cyrillic/Arabic/Hangul in the source', strays.length === 0,
   strays.length ? 'found: ' + strays.join(' ') : '');

/* ── 2. Boot ─────────────────────────────────────────────────────────────── */
const dom = new JSDOM(inlined, { runScripts: 'dangerously', pretendToBeVisual: true });
const { window: w } = dom;
const d = w.document;
// jsdom implements no layout, so neither of these exists. The product code is
// right to call them; the harness just has to provide them.
w.scrollTo = () => {};
w.HTMLElement.prototype.scrollIntoView = () => {};

console.log('\nShell');
ok('sidebar renders every nav item', d.querySelectorAll('.nav-item').length === 9);
/* Loans and item status live under Armoury. A second top-level entry would put
   the same numbers on two screens, which is the trap the real suite already
   fell into once and deliberately backed out of. */
ok('there is no separate Loans entry — Armoury owns it',
   ![...d.querySelectorAll('.nav-label')].some(n => /loan/i.test(n.textContent)));
ok('dashboard is the landing page',
   d.querySelector('.nav-item.active .nav-label')?.textContent === 'Dashboard');
ok('brand block renders', !!d.querySelector('.brand-name'));
ok('search bar renders', !!d.querySelector('.search input'));
ok('sidebar footer renders', d.querySelectorAll('.side-foot > div').length === 2);

console.log('\nDashboard');
ok('page header renders', d.querySelector('.page-title')?.textContent === 'Dashboard');
ok('all 7 cards present', d.querySelectorAll('.content .card').length === 7);
ok('stat strip has 4 stats', d.querySelectorAll('.stats .stat').length === 4);
ok('donut drew track + value ring', d.querySelectorAll('.donut svg circle').length === 2);
ok('status dots render', d.querySelectorAll('.content .dot').length >= 12);
ok('activity feed renders', d.querySelectorAll('.feed').length === 5);

/* ── 3. Every page AND every sub-pane must render ─────────────────────────
   Sub-panes are where unrendered work hides: the page loads, the default tab
   looks fine, and the fourth tab throws. Enumerating them from the nav and
   the sub-nav means a pane added later is covered without touching this. */
const PAGE_IDS = [...d.querySelectorAll('.nav-item')].map(n => n.dataset.arg);
ok('discovered every page from the nav', PAGE_IDS.length === 9);

/** Enumerate a page's sub-tabs by rendering it and reading the sub-nav. */
const subsOf = id => {
  w.go(id);
  return [...d.querySelectorAll('.content .subnav button, .subnav button')]
    .map(b => b.dataset.arg2).filter(Boolean);
};

console.log('\nEvery page renders');
const ROUTES = [];   // [pageId, subId|null] — reused by later sections
for (const id of PAGE_IDS) {
  try {
    w.go(id);
    const title = d.querySelector('.page-title')?.textContent;
    const subs = subsOf(id);
    ROUTES.push(...(subs.length ? subs.map(s => [id, s]) : [[id, null]]));
    ok(`${id.padEnd(9)} → "${title}"${subs.length ? `  (${subs.length} sub-panes)` : ''}`,
       !!title && d.querySelectorAll('.content .card, .content .grid').length > 0);
  } catch (e) {
    ok(`${id} renders`, false, e.message);
  }
}

console.log('\nEvery sub-pane renders');
for (const [p, s] of ROUTES.filter(r => r[1])) {
  try {
    w.goSub(p, s);
    const cards = d.querySelectorAll('.content .card').length;
    ok(`${(p + ' › ' + s).padEnd(22)} ${cards} card(s)`, cards > 0);
  } catch (e) {
    ok(`${p} › ${s} renders`, false, e.message);
  }
}

/* Sub-tab state is per page: leaving a page and coming back should return you
   to the tab you were on, not reset you to the first one. */
console.log('\nSub-tab routing');
w.goSub('money', 'funds');
w.go('people');
w.go('money');
ok('a page remembers which sub-tab you were on',
   d.querySelector('.subnav button.on')?.textContent.trim().startsWith('Funds'));
ok('exactly one sub-tab is marked active', d.querySelectorAll('.subnav button.on').length === 1);
w.goSub('money', 'overview');

console.log('\nContent correctness');
w.goSub('people', 'roster');
ok('roster paints every row', d.querySelectorAll('.content tbody tr').length === 8);
ok('every row has an avatar', d.querySelectorAll('.content .av-mono').length === 8);
ok('top 3 ranks highlighted', d.querySelectorAll('.content td.yellow.b').length >= 3);

w.goSub('crimes', 'active');
ok('one card per active crime', d.querySelectorAll('.content .card').length === 3);

/* ── 3b. The states a pane spends most of its life in ─────────────────────
   The whole point of the data seam is that a pane can never come out blank.
   These drive every route through all four states and assert something is
   actually on screen each time — the failure this prevents is a permissions
   error rendering as an empty faction, which the real suite has done. */
console.log('\nNo route can render blank, in any data state');
for (const state of ['loading', 'error', 'empty', 'ok']) {
  w.setState(state);
  let worst = null;
  for (const [p, s] of ROUTES) {
    s ? w.goSub(p, s) : w.go(p);
    const txt = d.querySelector('.content').textContent.trim();
    if (txt.length < 40) { worst = `${p}${s ? ' › ' + s : ''} rendered ${txt.length} chars`; break; }
  }
  ok(`${state.padEnd(7)} — all ${ROUTES.length} routes render something`, !worst, worst);
}

w.setState('loading');
w.goSub('people', 'roster');
ok('loading shows a skeleton, not an empty box', !!d.querySelector('.content .skel i'));

w.setState('error');
w.goSub('people', 'roster');
const err = d.querySelector('.content .errnote');
ok('a failure explains itself', !!err && /faction api access/i.test(err.textContent));
ok('…names the access it needs, not just "error"', /Faction members/.test(err?.textContent || ''));
ok('…and offers the one action that helps', !!err?.querySelector('button'));

w.setState('empty');
w.goSub('people', 'roster');
ok('empty is worded as a real answer, not a failure',
   /genuinely nothing/i.test(d.querySelector('.content .empty')?.textContent || ''));

/* Loading, failed and empty must look DIFFERENT. Collapsing them is exactly
   how "we could not reach Torn" gets mistaken for "you have no members". */
const shot = st => { w.setState(st); w.goSub('people', 'roster');
                     return d.querySelector('.content').innerHTML; };
const [sl, se, sm] = ['loading', 'error', 'empty'].map(shot);
ok('the three no-data states are visually distinct',
   sl !== se && se !== sm && sl !== sm);
w.setState('ok');

console.log('\nMember profile drill-down');
w.goSub('people', 'roster');
const firstRow = d.querySelector('.content tbody tr[data-act="profile"]');
ok('roster rows are wired to open a profile', !!firstRow);
w.openProfile(firstRow.dataset.arg);
/* Not asserting a specific name any more — the roster is now ranked from real
   derived run counts, so who comes first is an output, not a fixture constant. */
ok('the profile renders the member whose row was clicked',
   (d.querySelector('.prof-name')?.textContent || '').length > 1);
ok('it keeps the shell rather than being a modal', !!d.querySelector('.side .nav-item'));
ok('it offers a way back', !!d.querySelector('.content .backbar'));
ok('an unknown uid degrades instead of throwing',
   (w.openProfile('nope-9999'), /No record/i.test(d.querySelector('.content').textContent)));
w.closeProfile();
ok('closing returns to the page underneath', !!d.querySelector('.content .subnav'));

w.go('money');
const cells = [...d.querySelectorAll('.content td')].map(t => t.textContent);
/* The magnitude depends on the fixture volume, so assert the FORMATTER is
   working — compact units, no raw digit soup — rather than a specific scale. */
ok('money renders in compact units', cells.some(c => /^-?\$[\d.]+[kmb]$/.test(c)),
   'sample: ' + cells.filter(c => c.startsWith('$')).slice(0, 4).join(' '));
ok('no money cell is a raw unformatted number',
   !cells.some(c => /^\$\d{7,}$/.test(c)));
ok('per-run figures computed', cells.some(c => /^\$\d/.test(c)));

/* ── 4. The leak check that has caught real bugs three times ─────────────── */
console.log('\nNo leaks');
w.setState('ok');
for (const [p, s] of ROUTES) {
  const id = p + (s ? ' › ' + s : '');
  s ? w.goSub(p, s) : w.go(p);
  const text = d.querySelector('.content').textContent;
  const hit = /undefined|NaN|\[object Object\]/.exec(text);
  ok(`${id.padEnd(22)} clean of undefined/NaN/[object Object]`, !hit,
     hit ? `found "${hit[0]}" near: …${text.slice(Math.max(0, hit.index - 40), hit.index + 40)}…` : '');
}

/* ── 5. Do the tables FIT in compact mode? ────────────────────────────────
   jsdom implements no layout, so this cannot measure real pixels. It estimates
   from character counts (~7px per body char at 12.5px, ~6.5px per header char
   at 10px uppercase, + 16px cell padding) and compares against the real content
   box. Approximate by construction — but it turns "looks fine to me" into a
   number that fails loudly when a column is added or a formatter gets wordier. */
console.log('\nTable fit (compact · estimated)');
const CONTENT_PX = 990 - 208 /* sidebar */ - 2 /* app borders */
                       - 36  /* .content padding */ - 28 /* .card-b padding */ - 2;
w.setW('compact');
w.setState('ok');
for (const [pageId, subId] of ROUTES) {
  subId ? w.goSub(pageId, subId) : w.go(pageId);
  for (const table of d.querySelectorAll('.content table')) {
    const heads = [...table.querySelectorAll('thead th')];
    if (!heads.length) continue;
    const rows = [...table.querySelectorAll('tbody tr')];
    const widths = heads.map((th, i) => {
      const headPx = th.textContent.trim().length * 6.5;
      const bodyPx = Math.max(0, ...rows.map(r => {
        const cell = r.cells[i];
        if (!cell) return 0;
        // The sparkline is dots, not text — 9 dots at 7px each in compact.
        if (cell.querySelector('.spark')) return cell.querySelectorAll('.spark i').length * 7;
        // Avatar + gap rides along with the name.
        const extra = cell.querySelector('.av') ? 34 : 0;
        return cell.textContent.trim().length * 7 + extra;
      }));
      return Math.max(headPx, bodyPx) + 16;
    });
    const total = Math.round(widths.reduce((a, b) => a + b, 0));
    const widest = heads[widths.indexOf(Math.max(...widths))].textContent.trim();
    const label = pageId + (subId ? ' › ' + subId : '');
    ok(`${label.padEnd(20)} ${String(heads.length).padStart(2)} cols ≈ ${String(total).padStart(3)}px / ${CONTENT_PX}px`,
       total <= CONTENT_PX,
       `overflows by ${total - CONTENT_PX}px — widest column is "${widest}"`);
  }
}

/* ── 6. Icons mode: the per-item hover flyout ─────────────────────────────
   jsdom applies no stylesheets and can't simulate :hover, so this asserts the
   CSS CONTRACT in source rather than pretending to test the interaction. Each
   of these is a rule the flyout genuinely cannot work without — the clipping
   ones especially, since an ancestor with overflow:hidden silently eats an
   absolutely-positioned child and looks like "the tooltip just doesn't show". */
console.log('\nIcons mode — hover flyout contract');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
const hasRule = re => re.test(css);

ok('label is revealed on the hovered item only (not the whole rail)',
   hasRule(/#app\.icons \.nav-item:hover \.nav-label\s*\{[^}]*opacity:\s*1/));
ok('label is positioned outside the 60px rail',
   hasRule(/#app\.icons \.nav-label\s*\{[^}]*position:\s*absolute[^}]*left:\s*calc\(100%/s));
ok('label starts hidden', hasRule(/#app\.icons \.nav-label\s*\{[^}]*opacity:\s*0/s));
ok('label cannot swallow clicks', hasRule(/#app\.icons \.nav-label\s*\{[^}]*pointer-events:\s*none/s));
ok('nav overflow is visible — otherwise the scroll box clips the flyout',
   hasRule(/#app\.icons \.nav\s*\{[^}]*overflow:\s*visible/s));
ok('label overflow is visible — otherwise it clips its own caret',
   hasRule(/#app\.icons \.nav-label\s*\{[^}]*overflow:\s*visible/s));
ok('nav-item is a positioning context for the flyout',
   hasRule(/#app\.icons \.nav-item\s*\{[^}]*position:\s*relative/s));
ok('badge moves to the icon corner so the icon stays centred',
   hasRule(/#app\.icons \.nav-badge\s*\{[^}]*position:\s*absolute/s));

/* The bug this caught: `position: sticky` on .side makes it a stacking
   context, so the flyout's z-index only ranks it INSIDE the sidebar. Without
   an explicit z-index on .side, .main paints over the whole sidebar purely
   because it comes later in the DOM — and the tooltip renders behind the page
   content. The numbers must stay ordered or it silently regresses. */
const zOf = re => { const m = re.exec(css); return m ? +m[1] : null; };
const zSide   = zOf(/\.side\s*\{[^}]*z-index:\s*(\d+)/s);
const zTopbar = zOf(/\.topbar\s*\{[^}]*z-index:\s*(\d+)/s);
ok('.side declares a z-index (it is a stacking context via position:sticky)', zSide != null);
ok(`.side (${zSide}) outranks .topbar (${zTopbar}) so the flyout clears page content`,
   zSide != null && zTopbar != null && zSide > zTopbar);
ok('one .nav-label per item — flyout reuses it rather than duplicating text',
   (w.setW('icons'), d.querySelectorAll('.nav-item').length === d.querySelectorAll('.nav-label').length));
ok('every nav item still carries a title as the no-CSS fallback',
   [...d.querySelectorAll('.nav-item')].every(n => n.getAttribute('title')));
ok('sidebar footer rows carry their own titles',
   [...d.querySelectorAll('.side-foot > div')].every(n => n.getAttribute('title')));

/* ── 7. Themes ────────────────────────────────────────────────────────────
   A theme is only variables, so the failure mode is a listed theme with no
   CSS behind it: the picker offers it, clicking does nothing visible, and
   nothing throws. These checks tie the two lists together in both directions. */
console.log('\nThemes');

const varsIn = block => Object.fromEntries(
  [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));

const rootBlock = /#app\s*\{([\s\S]*?)\n\}/.exec(css);
ok('the token block is on #app, the port boundary', !!rootBlock);
const baseVars = varsIn(rootBlock[1]);
const themeCss = Object.fromEntries(
  [...css.matchAll(/#app\[data-theme="([\w-]+)"\]\s*\{([\s\S]*?)\}/g)]
    .map(m => [m[1], varsIn(m[2])]));

/* The picker's list, read from the RENDERED page rather than the source — a
   `const THEMES` in a classic script never lands on window, and pulling the
   ids out of the real onclick handlers tests the wiring at the same time. */
w.go('settings');
const optIds = n => [...d.querySelectorAll('.content .opt-grid')[n].querySelectorAll('.opt')]
  .map(o => o.dataset.arg);
const picker = optIds(0);

ok(`picker offers ${picker.length} themes`, picker.length >= 4);
// Declarations and var() uses only — prose in a comment may still say "--blue".
ok('the accent rename is complete — no --blue declared or referenced',
   !/--blue\b\s*:/.test(css) && !/var\(\s*--blue\b/.test(css));
ok('Frostbite is :root itself, so it defines no override block',
   picker.includes('frostbite') && !themeCss.frostbite);
for (const id of picker.filter(t => t !== 'frostbite'))
  ok(`${id.padEnd(10)} has a :root[data-theme] block behind it`, !!themeCss[id]);
for (const id of Object.keys(themeCss))
  ok(`${id.padEnd(10)} block is reachable from the picker`, picker.includes(id));

const appEl = () => d.getElementById('app');
ok('setTheme stamps the attribute the CSS keys off',
   (w.setTheme('ember'), appEl().getAttribute('data-theme') === 'ember'));
ok('…and clears it for the default rather than stamping "frostbite"',
   (w.setTheme('frostbite'), appEl().getAttribute('data-theme') === null));
ok('an unknown theme id falls back instead of rendering unstyled',
   (w.setTheme('nope'), appEl().getAttribute('data-theme') === null));

/* Every colour that CARRIES MEANING must be distinguishable from the others
   within its own theme. Colour-safe is the reason: it moves good→blue, which
   collides with a blue accent unless the accent moves too. */
console.log('\nSemantic colours stay distinct');
for (const id of picker) {
  const v = { ...baseVars, ...(themeCss[id] || {}) };
  const slots = ['--accent', '--green', '--yellow', '--red', '--purple'];
  const seen = slots.map(s => v[s]);
  const dupe = seen.find((c, i) => seen.indexOf(c) !== i);
  ok(`${id.padEnd(10)} accent/good/warn/crit/info are five different colours`,
     !dupe, dupe ? `"${dupe}" is used for two different meanings` : '');
}

/* WCAG contrast, audited per theme — a new theme is the easiest way to
   reintroduce a failure the default already fixed.
   Measured against each theme's LIGHTEST surface, which is the worst case for
   light text on dark. The four informational tiers must clear AA (4.5:1).
   --tx-faint is exempt at 3:1 BECAUSE it is decoration-only; the separate
   check below is what keeps that exemption honest. */
console.log('\nText contrast (per theme · worst-case surface)');
const lum = hex => {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map(c => c + c) : h.match(/../g);
  const [r, g, b] = f.map(c => {
    const s = parseInt(c, 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const TIERS = [
  ['--tx',       4.5], ['--tx-body',  4.5],
  ['--tx-dim',   4.5], ['--tx-muted', 4.5],
  ['--tx-faint', 3.0],   // decoration-only, hence the lower floor
];
for (const id of picker) {
  const v = { ...baseVars, ...(themeCss[id] || {}) };
  const worst = ['--side','--bg','--card','--card-head','--sunk']
    .map(s => v[s]).reduce((a, b) => (lum(b) > lum(a) ? b : a));
  const results = TIERS.map(([tier, min]) => {
    const r = ratio(v[tier], worst);
    return { tier, min, r, pass: r >= min };
  });
  const bad = results.filter(x => !x.pass);
  ok(`${id.padEnd(10)} on ${worst} — ` +
     results.map(x => `${x.tier.slice(5) || 'tx'} ${x.r.toFixed(1)}`).join('  '),
     !bad.length,
     bad.map(x => `${x.tier} is ${x.r.toFixed(2)}:1, needs ${x.min}:1`).join('; '));

  // The hierarchy only means something if the tiers stay ordered.
  const order = TIERS.map(([t]) => ratio(v[t], worst));
  ok(`${id.padEnd(10)} tiers stay ordered brightest → faintest`,
     order.every((r, i) => i === 0 || r <= order[i - 1] + 0.01));
}

/* This is what makes the 3:1 exemption legitimate rather than a loophole:
   --tx-faint may only appear in rules that style decoration. If someone
   points a content class at it, the exemption is gone and so is AA. */
console.log('\nThe faint tier stays decoration-only');
const faintRules = [...css.matchAll(/([^{}]+)\{[^}]*var\(--tx-faint\)[^}]*\}/g)]
  .map(m => m[1].trim().replace(/\s+/g, ' '));
const DECORATIVE = /::placeholder|\.search-ico|\.stat-i|\.lay |\.lay\./;
for (const sel of faintRules)
  ok(`${sel} is decorative`, DECORATIVE.test(sel),
     'this rule styles content — use --tx-muted (the lowest informational tier)');

console.log('\nSettings page');
w.go('settings');
ok('theme picker renders one option per theme',
   d.querySelectorAll('.content .opt-grid')[0]?.querySelectorAll('.opt').length === picker.length);
ok('layout picker renders one option per layout',
   d.querySelectorAll('.content .opt-grid')[1]?.querySelectorAll('.opt').length === 3);
ok('exactly one theme and one layout are marked selected',
   d.querySelectorAll('.content .opt.on').length === 2);
ok('every theme option shows its swatches',
   [...d.querySelectorAll('.content .opt-grid')[0].querySelectorAll('.opt')]
     .every(o => o.querySelectorAll('.sw i').length >= 7));

/* Duplicate selectors have shipped as a real bug in this codebase: new rules
   were being silently overridden by older ones further down, and the redesign
   only worked by luck of source order. Same-selector-twice is occasionally
   deliberate, so this reports rather than assumes — but it must be a choice. */
/* ── 8. Event wiring ──────────────────────────────────────────────────────
   Inside Torn the script is sandboxed by @grant, so an inline onclick in
   injected HTML evaluates in PAGE scope and never finds our functions — the
   button is simply dead, with no error. Everything must go through the one
   delegated listener, and these checks dispatch REAL clicks rather than
   calling the functions directly, which is the only way to prove the wiring
   exists at all. */
console.log('\nEvent wiring (real click dispatch)');

ok('not one inline handler survives in the source',
   !/\son\w+\s*=\s*["']/.test(html),
   (html.match(/\son\w+\s*=\s*["'][^"']*/g) || []).slice(0, 3).join(' · '));

const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

w.setState('ok'); w.go('dashboard');
click(d.querySelector('.nav-item[data-arg="money"]'));
ok('clicking a nav item navigates', d.querySelector('.page-title')?.textContent === 'Money');

click([...d.querySelectorAll('.subnav button')].find(b => b.dataset.arg2 === 'funds'));
ok('clicking a sub-tab switches pane',
   d.querySelector('.subnav button.on')?.textContent.trim().startsWith('Funds'));

/* A click almost always lands on a child — the avatar, the name span — never
   on the row itself. If the handler used e.target instead of closest(), this
   is the check that fails. */
const nameSpan = d.querySelector('.content tr[data-act="profile"] .nm');
ok('a row is clickable via its children, not just its own box',
   (click(nameSpan), !!d.querySelector('.prof-name')));
click(d.querySelector('.content .backbar'));
ok('the back control returns to the page', !!d.querySelector('.content .subnav'));

w.go('settings');
click([...d.querySelectorAll('.opt')].find(o => o.dataset.arg === 'ember'));
ok('clicking a theme applies it',
   d.getElementById('app').getAttribute('data-theme') === 'ember');
click([...d.querySelectorAll('.opt')].find(o => o.dataset.arg === 'icons'));
ok('clicking a layout applies it', d.getElementById('app').classList.contains('icons'));
w.setTheme('frostbite'); w.setW('compact');

/* Every declared action must exist, and every action must be reachable — a
   typo in either direction is a dead control that throws nothing.
   Read from source, not window: a top-level `const` in a classic script never
   becomes a window property, so w.ACTIONS does not exist. */
const declared = [...(/const ACTIONS = \{([\s\S]*?)\n\};/.exec(html)?.[1] || '')
  .matchAll(/^\s*(\w+):/gm)].map(m => m[1]);
/* Collected from the RENDERED DOM across every route, not from the source —
   some actions are emitted through a template (`data-act="${act}"`) and are
   invisible to a source scan. */
const used = new Set();
// Both states: `retry` only ever exists on an error note, so an ok-only sweep
// would report it as declared-but-unused.
for (const state of ['ok', 'error']) {
  w.setState(state);
  for (const [p, s] of ROUTES) {
    s ? w.goSub(p, s) : w.go(p);
    d.querySelectorAll('[data-act]').forEach(el => used.add(el.dataset.act));
  }
}
w.setState('ok');
w.openProfile('3');
d.querySelectorAll('[data-act]').forEach(el => used.add(el.dataset.act));
w.closeProfile();
ok(`every data-act in the markup has a handler (${used.size} used, ${declared.length} declared)`,
   [...used].every(a => declared.includes(a)),
   'no handler for: ' + [...used].filter(a => !declared.includes(a)).join(', '));
ok('no handler is declared but never used',
   declared.every(a => used.has(a)),
   'unused: ' + declared.filter(a => !used.has(a)).join(', '));

/* ── 9. Port boundary ─────────────────────────────────────────────────────
   Inside Torn we own one div, not the document. Anything scoped to :root,
   html or body would restyle Torn's own page along with ours. */
console.log('\nPort boundary (#app owns everything)');
ok('design tokens are not on :root', !/^:root[\s[{]/m.test(css));
ok('theme blocks are scoped to #app', /#app\[data-theme="\w+"\]/.test(css));
ok('layout classes are not on body', !/body\.(compact|icons|full)/.test(css));
ok('the theme attribute is stamped on #app, not <html>',
   (w.setTheme('slate'),
    d.getElementById('app').getAttribute('data-theme') === 'slate' &&
    d.documentElement.getAttribute('data-theme') === null));
ok('the layout class is on #app, not <body>',
   (w.setW('icons'),
    d.getElementById('app').classList.contains('icons') && !d.body.classList.contains('icons')));
w.setTheme('frostbite'); w.setW('compact');
ok('body carries only the page backdrop, nothing the product needs',
   /body \{ margin: 0; padding: 0; background: #\w+; \}/.test(css));
ok('storage goes through one swappable seam, not scattered localStorage calls',
   (html.match(/localStorage\.\w+\(/g) || []).length === 2);
ok('…and uses the suite’s ocs_* key naming', /ocs_ui_theme/.test(html));

/* ── 10. The port contract ────────────────────────────────────────────────
   Every feed must say where its data comes from in the real script and what
   shape it hands back. A feed missing either is one somebody has to reverse-
   engineer from the renderer at port time, which is exactly the research
   detour this prototype exists to avoid. */
console.log('\nPort contract');

const feedBlock = /const FEEDS = \{([\s\S]*?)\n\};/.exec(html)?.[1] || '';
const feedNames = [...feedBlock.matchAll(/^  (\w+): \{/gm)].map(m => m[1]);
ok(`every feed is declared in one registry (${feedNames.length} feeds)`, feedNames.length >= 15);

const entries = feedBlock.split(/^  (?=\w+: \{)/m).filter(b => /^\w+: \{/.test(b));
/* Provenance must be honest at the FEED level, not just in prose. The payouts
   feed is inference (Torn does not record which OC a give paid for), and the
   moment it claims 'exact' the UI starts drawing guesses as facts. */
ok('the payouts feed declares itself an estimate, not exact',
   /payouts:\s*\{[\s\S]*?prov:'est'/.test(feedBlock));
ok('an inferred payout renders differently from a confirmed one',
   /chip green out/.test(html) && /confidence == null/.test(html));

for (const field of ['store', 'status', 'sync', 'shape', 'read']) {
  const missing = entries.filter(b => !new RegExp(`\\b${field}:`).test(b))
    .map(b => /^(\w+):/.exec(b)[1]);
  ok(`every feed declares \`${field}\``, !missing.length, 'missing on: ' + missing.join(', '));
}

/* The GMK keys cited must actually exist in the userscript. A contract that
   names a store nobody wrote is worse than no contract — it reads as verified. */
const realScript = path.join(__dirname, '..', 'Torn_OC_Suite.user.js');
if (fs.existsSync(realScript)) {
  const gmk = fs.readFileSync(realScript, 'utf8');
  const gmkBlock = /const GMK = \{([\s\S]*?)\n  \};/.exec(gmk)?.[1] || '';
  const realKeys = new Set([...gmkBlock.matchAll(/^\s*(\w+):/gm)].map(m => m[1]));
  // Only the store:/status: fields — prose in a comment may legitimately shout.
  const keyFields = [...feedBlock.matchAll(/(?:store|status):\s*'([^']*)'/g)].map(m => m[1]);
  const cited = [...new Set(keyFields.flatMap(v => v.match(/\b[A-Z][A-Z0-9_]{3,}\b/g) || []))];
  const bogus = cited.filter(k => !realKeys.has(k));
  ok(`every GMK key cited by a feed exists in the userscript (${cited.length} cited)`,
     !bogus.length, 'not real keys: ' + bogus.join(', '));
} else {
  ok('userscript present to validate GMK keys against', false, 'not found at ' + realScript);
}

/* readFeed is the documented single swap point. Anchored to column 0 so the
   worked example inside the comment above it is not counted as a second one. */
ok('there is exactly one real readFeed — the single swap point',
   (html.match(/^function readFeed\(/gm) || []).length === 1);
ok('every feed declares a reader, so readFeed stays the only swap point',
   entries.every(b => /read:\(\) =>/.test(b)),
   'missing a reader: ' + entries.filter(b => !/read:\(\) =>/.test(b))
     .map(b => /^(\w+):/.exec(b)[1]).join(', '));
ok('the real GM_getValue implementation is written out for the port',
   /GM_getValue\(GMK\[f\.status\]/.test(html));

console.log('\nStylesheet hygiene');
const selectors = [...css.matchAll(/(^|\})\s*([^{}@]+?)\s*\{/gm)]
  .map(m => m[2].trim().replace(/\s+/g, ' '))
  .filter(s => s && !s.startsWith('/*') && !/^(from|to|\d+%)$/.test(s));
const dupes = [...new Set(selectors.filter((s, i) => selectors.indexOf(s) !== i))];
ok(`no selector is defined twice (${selectors.length} rules)`, !dupes.length,
   dupes.length ? 'defined more than once: ' + dupes.join(' · ') : '');

console.log('\nWidth modes');
w.setW('compact');
ok('compact keeps the sidebar labelled',
   d.getElementById('app').classList.contains('compact') && d.querySelector('.nav-label')?.textContent === 'Dashboard');
w.setW('full');
ok('full drops every width class', !d.getElementById('app').className.replace('app','').trim());
w.setW('icons');
ok('icons mode set', d.getElementById('app').classList.contains('icons'));
ok('modes are mutually exclusive',
   !d.getElementById('app').classList.contains('compact') && !d.body.classList.contains('full'));
// Scoped to the width buttons — the proto bar also carries the data-state
// toggle, which legitimately has its own active button at the same time.
ok('the width toggle marks exactly one button active',
   ['compact', 'full', 'icons'].filter(m => d.getElementById('w-' + m).classList.contains('on')).length === 1);
ok('the data-state toggle marks exactly one button active',
   ['ok', 'loading', 'error', 'empty'].filter(s => d.getElementById('s-' + s).classList.contains('on')).length === 1);

console.log(failed ? `\n${failed} check(s) FAILED\n` : '\nAll checks passing\n');
process.exit(failed ? 1 : 0);
