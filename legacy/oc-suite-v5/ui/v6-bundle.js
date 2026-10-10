/* ═══════════════════════════════════════════════════════════════════════════
   v6 UI — GENERATED, DO NOT EDIT HERE

   Built from ui/frostbite.html + ui/derive.js by ui/build.js.
   Edit those and re-run `node ui/build.js`; hand-edits to this block are
   lost on the next build and will silently diverge from the tests.

   Generated: 2026-07-21
   ═══════════════════════════════════════════════════════════════════════════ */

const OCM_V6_CSS = "\n/* ═══════════════════════════════════════════════════════════════════════════\n   OC SUITE — \"CENTRAL COMMAND\" UI\n   Standalone prototype. Fake data. Open it in a browser — no Torn, no\n   Tampermonkey. Built to match the Frostbite Central Command reference.\n\n   THE ONE THING TO DECIDE (see the width toggle at the top of the page):\n   this layout is drawn at ~1490px with a 290px sidebar. Torn's content column\n   is ~990px, which leaves ~700px of content — and the war report table alone\n   needs 830px. So the suite either breaks OUT of Torn's column to full width,\n   or the sidebar collapses on narrow screens. The toggle shows both.\n   ═══════════════════════════════════════════════════════════════════════════ */\n\n#ocm-v6, #ocm-v6 *, #ocm-v6 *::before, #ocm-v6 *::after { box-sizing: border-box; }\n\n#ocm-v6 {\n  /* ── Surfaces ──────────────────────────────────────────────────────────── */\n  --side:        #0d1117;   /* sidebar — deepest */\n  --bg:          #121821;   /* page */\n  --card:        #171d28;   /* card body */\n  --card-head:   #1a212d;   /* card header strip */\n  --sunk:        #0f141c;   /* wells, inset panels */\n  --line:        #222b39;   /* borders */\n  --line-soft:   #1b2330;\n\n  /* ── Text ──────────────────────────────────────────────────────────────────\n     Five tiers, but only the top FOUR may carry information. The mockup's\n     greys were pretty and unreadable — muted came in at 3.5:1 while styling\n     every table header in the app. These values are the measured minimum that\n     clears AA against each theme's LIGHTEST surface (--card-head), which is\n     the worst case for light-on-dark.\n\n     --tx-faint is deliberately BELOW AA and is therefore decoration only:\n     placeholders, inert icons, the layout-preview bars. Never put a number,\n     a label, or anything a user has to read into it. (This tier has failed\n     AA twice in the real script for exactly that reason.) */\n  --tx:          #e8eef7;   /* the value you came to read        — 12.4:1 */\n  --tx-body:     #c2cbd8;   /* prose                             —  8.6:1 */\n  --tx-dim:      #8996a8;   /* de-emphasised but still read      —  5.4:1 */\n  --tx-muted:    #818d9f;   /* LOWEST informational tier         —  4.8:1 */\n  --tx-faint:    #6a7484;   /* decoration ONLY, not information  —  3.4:1 */\n\n  /* ── One accent ────────────────────────────────────────────────────────── */\n  --accent:        #2f8fed;\n  --accent-bright: #4da3f5;\n  --accent-soft:   #14273d;\n\n  /* ── Semantic — the only colours allowed to carry meaning ──────────────── */\n  --green:       #3fb950;\n  --yellow:      #d4a017;\n  --red:         #e05252;\n  --purple:      #a371f7;\n\n  --r:   10px;   /* card radius */\n  --r-s: 7px;\n\n  --sidebar-w: 268px;\n\n  /* ── The shell itself ──────────────────────────────────────────────────────\n     Layout lives in the same rule as the tokens on purpose: #ocm-v6 is the port\n     boundary, and splitting it across two `#ocm-v6 { }` blocks would mean the\n     same selector defined twice — the exact source-order hazard that let new\n     rules get silently overridden by older ones in the real script. */\n  display: grid;\n  grid-template-columns: var(--sidebar-w) minmax(0, 1fr);\n  background: var(--bg);\n  /* Inside Torn we sit in a column someone else sized. `max-width` alone lets\n     the panel exceed a narrower parent — which is what made it spill out of\n     the content column and appear to grow on zoom-out, since zooming enlarges\n     the viewport in CSS pixels while Torn's column stays put. `width:100%`\n     with `box-sizing:border-box` keeps the parent authoritative. */\n  width: 100%;\n  max-width: 1490px;                 /* the reference width */\n  margin: 0 auto;\n  /* A minimum in px, not vh. `100vh` measures the WINDOW, not our column, so\n     it stretched the panel past the page on short viewports and left a tall\n     empty well on tall ones. */\n  min-height: 560px;\n  border-left: 1px solid var(--line);\n  border-right: 1px solid var(--line);\n  /* Typography is set HERE, not on body — inside Torn we cannot rely on\n     inheriting anything from the host page. */\n  font: 14px/1.5 -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif;\n  color: var(--tx-body);\n  font-variant-numeric: tabular-nums;\n  -webkit-font-smoothing: antialiased;\n}\n\n/* ═══ THEMES ══════════════════════════════════════════════════════════════\n   Every theme overrides the SAME small set of slots — surfaces, one accent,\n   and four semantic colours. Nothing else in the stylesheet knows a theme\n   exists, which is the whole point: a new theme is a block of variables, not\n   a fork of the CSS.\n\n   NOTE on naming: --green/--yellow/--red are SEMANTIC SLOTS (good / warn /\n   crit), not literal hues. The colourblind-safe theme deliberately puts blue\n   in --green and orange in --red. They should be renamed --good/--warn/--crit\n   when this ports into the userscript; the matching `.green`/`.red` markup\n   classes are why that didn't happen here.\n\n   Contrast discipline from the design system applies to all of them: the\n   faint text tier carries real information and has failed AA twice before. */\n\n/* Midnight — deeper, cooler, navy. Lower contrast surfaces for long sessions. */\n#ocm-v6[data-theme=\"midnight\"] {\n  --side: #0a0e1a; --bg: #0e1424; --card: #141b2e; --card-head: #171f34;\n  --sunk: #0b1120; --line: #232c45; --line-soft: #1b2338;\n  --accent: #6a8fe8; --accent-bright: #8aa9f0; --accent-soft: #1a2444;\n  --purple: #b48ef7;\n}\n\n/* Slate — neutral grey, no colour cast. This is close to what the suite\n   ships today, so it doubles as the \"don't change anything\" option. */\n#ocm-v6[data-theme=\"slate\"] {\n  --side: #121212; --bg: #181818; --card: #1e1e1e; --card-head: #232323;\n  --sunk: #141414; --line: #2e2e2e; --line-soft: #262626;\n  --accent: #59a5d8; --accent-bright: #7cbde8; --accent-soft: #16242e;\n  --green: #7cba5c; --yellow: #c9a227; --red: #d75f5f;\n  --tx-faint: #848494;   /* neutral cast to match the greys, still over 3:1 */\n}\n\n/* Ember — warm. The accent is amber, which is exactly why --blue got renamed. */\n#ocm-v6[data-theme=\"ember\"] {\n  --side: #14100d; --bg: #1a1512; --card: #211a16; --card-head: #261e19;\n  --sunk: #150f0c; --line: #35291f; --line-soft: #2a2019;\n  --accent: #e08b3c; --accent-bright: #f0a55c; --accent-soft: #2e2013;\n  --green: #86b34a; --yellow: #e0b93c; --red: #e0603c; --purple: #c98ae0;\n}\n\n/* Contrast — pure black, heavier borders, brighter text throughout.\n   For sunlight, poor screens, and anyone the default is simply too dim for. */\n#ocm-v6[data-theme=\"contrast\"] {\n  --side: #000; --bg: #000; --card: #0d0d0d; --card-head: #161616;\n  --sunk: #000; --line: #555; --line-soft: #444;\n  --accent: #4db8ff; --accent-bright: #85d0ff; --accent-soft: #002238;\n  --tx: #fff; --tx-body: #f0f0f0; --tx-dim: #d4d4d4;\n  --tx-muted: #b8b8b8; --tx-faint: #9c9c9c;\n  --green: #4ae08a; --yellow: #ffd633; --red: #ff6b6b; --purple: #c9a3ff;\n}\n\n/* Colour-safe — red/green deuteranopia & protanopia.\n   Good becomes BLUE and crit becomes ORANGE, which stay distinct under both.\n   The accent must then move off blue entirely or it collides with \"good\" —\n   hence purple. This is the one theme where the slot names actively lie. */\n#ocm-v6[data-theme=\"colorsafe\"] {\n  --accent: #b088ff; --accent-bright: #c9a8ff; --accent-soft: #241a3a;\n  --green: #4d9bff;   /* good  → blue   */\n  --yellow: #ffc233;  /* warn  → yellow, already safe */\n  --red: #ff7733;     /* crit  → orange */\n  --purple: #ff5fa2;  /* must not read as the accent — pushed to pink */\n}\n\n/* Page backdrop only. Everything that is part of the PRODUCT lives on #ocm-v6 —\n   inside Torn we own a div, not the document, so nothing may depend on body. */\n#ocm-v6 body { margin: 0; padding: 0; background: #080b10; }\n\n/* ═══ APP SHELL — width modes ═════════════════════════════════════════════\n   The #ocm-v6 rule itself is at the top of the file, alongside the tokens it\n   shares an element with. What follows is only the per-mode overrides. */\n/* ── COMPACT: Torn's real 990px column, sidebar KEEPS its labels ──────────\n   The middle option, and probably the right one. A 208px sidebar still fits\n   \"Organized Crimes\" comfortably and leaves ~745px of content.\n   The 830px war-report table was NOT a reason to rule this out — it already\n   ships wrapped in its own `overflow-x:auto` container, so it scrolls inside\n   itself and never constrained the page layout. One self-handling table is\n   not a floor on the whole app.                                             */\n#ocm-v6.compact { max-width: 990px; --sidebar-w: 208px; }\n#ocm-v6.compact .nav-item { height: 40px; padding: 0 11px; gap: 11px; font-size: 13px; }\n#ocm-v6.compact .brand { padding: 16px 14px 14px; gap: 10px; }\n#ocm-v6.compact .brand-mark { width: 32px; flex-basis: 32px; font-size: 24px; }\n#ocm-v6.compact .brand-name { font-size: 17px; }\n#ocm-v6.compact .brand-sub { font-size: 9px; letter-spacing: .11em; }\n#ocm-v6.compact .nav { padding: 0 9px; }\n#ocm-v6.compact .side-foot { padding: 13px 15px 15px; font-size: 11px; }\n#ocm-v6.compact .content, #ocm-v6.compact .topbar { padding-left: 18px; padding-right: 18px; }\n#ocm-v6.compact .stat-v { font-size: 27px; }\n#ocm-v6.compact .page-title { font-size: 22px; }\n\n/* Tables are the whole reason a width mode is hard. At 16px each side, ten\n   columns spend 320px on padding alone — more than a third of the available\n   width, buying nothing. 8px still separates columns cleanly. */\n#ocm-v6.compact thead th, #ocm-v6.compact tbody td { padding: 9px 8px; font-size: 12.5px; }\n#ocm-v6.compact thead th { font-size: 10px; letter-spacing: .04em; }\n#ocm-v6.compact .card-b { padding: 14px; }\n#ocm-v6.compact .spark { gap: 2px; }\n#ocm-v6.compact .spark i { width: 5px; height: 5px; }\n#ocm-v6.compact .av { width: 26px; height: 26px; flex-basis: 26px; }\n#ocm-v6.compact .namecell { gap: 8px; }\n/* Only the free-text column may truncate — never a number. */\n#ocm-v6.compact td.ellipsis { max-width: 90px; overflow: hidden; text-overflow: ellipsis; }\n\n/* ══ ICONS: 60px rail, label flies out for the ONE item under the cursor ══\n   Not \"expand the whole sidebar on hover\" — that shoves a 200px panel over\n   the content every time the mouse crosses the rail. A per-item flyout keeps\n   the rail 60px at all times and answers exactly the question you asked\n   (\"what is this icon?\") without disturbing anything else.                  */\n#ocm-v6.icons { max-width: 990px; --sidebar-w: 60px; }\n#ocm-v6.icons .brand-text { display: none; }\n#ocm-v6.icons .brand { justify-content: center; padding: 18px 0; }\n#ocm-v6.icons .nav { padding: 0 8px; overflow: visible; }\n/* ↑ overflow MUST be visible or the scroll container clips the flyout.\n   The nav only scrolled because of `overflow-y:auto`; at 60px wide with ten\n   44px items it is ~460px tall and never needed to. */\n#ocm-v6.icons .nav-item { justify-content: center; padding: 0; position: relative; }\n\n/* The flyout. Same .nav-label element — re-purposed, not duplicated, so there\n   is one source of truth for the text and nothing to keep in sync. */\n#ocm-v6.icons .nav-label {\n  display: block; opacity: 0; pointer-events: none;\n  /* The item is 44px wide inside an 8px-padded 60px rail, so 100% lands only\n     ~4px past the sidebar border. 16px gives the caret room to sit clear. */\n  position: absolute; left: calc(100% + 16px); top: 50%; z-index: 200;\n  overflow: visible;   /* base rule clips; the caret hangs outside at -5px */\n  transform: translateY(-50%) translateX(-5px);\n  padding: 7px 12px; border-radius: var(--r-s);\n  background: #232c3a; border: 1px solid #313d4e;\n  color: var(--tx); font-size: 13px; font-weight: 600; white-space: nowrap;\n  box-shadow: 0 4px 16px rgba(0,0,0,.55);\n  transition: opacity .13s ease, transform .13s ease;\n}\n#ocm-v6.icons .nav-item:hover .nav-label { opacity: 1; transform: translateY(-50%) translateX(0); }\n/* Caret. Inherits the panel's background so the two can't drift apart. */\n#ocm-v6.icons .nav-label::before {\n  content: ''; position: absolute; left: -5px; top: 50%;\n  width: 8px; height: 8px; background: inherit;\n  border-left: 1px solid #313d4e; border-bottom: 1px solid #313d4e;\n  transform: translateY(-50%) rotate(45deg);\n}\n\n/* Badge becomes a corner marker on the icon — in the middle of a 60px rail it\n   would otherwise push the icon off-centre. */\n#ocm-v6.icons .nav-badge {\n  position: absolute; top: 3px; right: 4px;\n  min-width: 17px; padding: 0 4px;\n  font-size: 9px; line-height: 17px; text-align: center;\n  border: 2px solid var(--side);   /* punches it out of the icon behind it */\n}\n#ocm-v6.icons .nav-sec { margin: 12px 14px; }\n\n#ocm-v6.icons .side-foot { align-items: center; padding: 14px 6px; gap: 11px; }\n#ocm-v6.icons .side-foot > div { flex-direction: column; gap: 5px; position: relative; }\n#ocm-v6.icons .side-foot span:not(.dot) { display: none; }\n#ocm-v6.icons .side-foot b { margin: 0; font-size: 10px; }\n\n/* ═══ SIDEBAR ════════════════════════════════════════════════════════════ */\n#ocm-v6 .side {\n  background: var(--side);\n  border-right: 1px solid var(--line);\n  display: flex; flex-direction: column;\n  /* `height: 100vh` pinned the rail to the WINDOW, so inside Torn it ran past\n     the bottom of our own panel and grew the page on every zoom step.\n     `align-self: stretch` makes it exactly as tall as the grid row it lives\n     in — our panel — which is what it always meant.\n     Deliberately NO overflow here: the icons-mode hover flyout escapes the\n     rail, and any overflow value other than visible silently eats it. */\n  position: sticky; top: 0; align-self: stretch;\n  /* MUST outrank .main (and .topbar's z-index:10). `position: sticky` makes\n     this element its own stacking context, so the icon-mode flyout's z-index\n     is only meaningful INSIDE the sidebar — without a z-index here, .main\n     paints over the entire sidebar simply because it comes later in the DOM,\n     and the flyout renders behind the page content. */\n  z-index: 40;\n}\n\n#ocm-v6 .brand {\n  display: flex; align-items: center; gap: 12px;\n  padding: 20px 18px 18px;\n}\n#ocm-v6 .brand-mark {\n  width: 40px; height: 40px; flex: 0 0 40px;\n  display: flex; align-items: center; justify-content: center;\n  font-size: 30px; line-height: 1; color: var(--accent);\n  filter: drop-shadow(0 0 10px rgba(47,143,237,.35));\n}\n#ocm-v6 .brand-text { min-width: 0; }\n#ocm-v6 .brand-name {\n  font-size: 20px; font-weight: 800; letter-spacing: .02em; color: #fff;\n  line-height: 1.1;\n}\n#ocm-v6 .brand-sub {\n  font-size: 10px; font-weight: 700; letter-spacing: .14em;\n  color: var(--accent); margin-top: 2px;\n}\n\n#ocm-v6 .nav { padding: 0 12px; flex: 1; overflow-y: auto; }\n#ocm-v6 .nav::-webkit-scrollbar { width: 6px; }\n#ocm-v6 .nav::-webkit-scrollbar-thumb { background: #232b38; border-radius: 3px; }\n\n#ocm-v6 .nav-item {\n  display: flex; align-items: center; gap: 14px;\n  height: 46px; padding: 0 14px; margin-bottom: 2px;\n  border-radius: var(--r-s);\n  color: var(--tx-dim); cursor: pointer;\n  font-size: 14px; font-weight: 500; white-space: nowrap;\n  border: 1px solid transparent;\n  transition: background .13s, color .13s, border-color .13s;\n}\n#ocm-v6 .nav-item:hover { background: #141b25; color: var(--tx-body); }\n#ocm-v6 .nav-item.active {\n  background: var(--accent-soft); border-color: #2a4d73;\n  color: #fff; font-weight: 600;\n}\n#ocm-v6 .nav-ico { flex: 0 0 20px; font-size: 17px; line-height: 1; text-align: center; color: var(--tx-muted); }\n#ocm-v6 .nav-item:hover .nav-ico { color: var(--tx-dim); }\n#ocm-v6 .nav-item.active .nav-ico { color: var(--accent-bright); }\n#ocm-v6 .nav-label { flex: 1; overflow: hidden; text-overflow: ellipsis; }\n#ocm-v6 .nav-badge {\n  padding: 1px 7px; border-radius: 9px;\n  background: #263041; color: var(--tx-dim);\n  font-size: 10px; font-weight: 700;\n}\n#ocm-v6 .nav-badge.attn { background: var(--red); color: #fff; }\n#ocm-v6 .nav-badge:empty { display: none; }\n\n#ocm-v6 .nav-sec { height: 1px; background: var(--line); margin: 12px 14px; }\n\n#ocm-v6 .side-foot {\n  display: flex; flex-direction: column; gap: 9px;\n  padding: 16px 20px 18px; border-top: 1px solid var(--line);\n  font-size: 12px; color: var(--tx-dim);\n}\n#ocm-v6 .side-foot > div { display: flex; align-items: center; gap: 9px; }\n#ocm-v6 .side-foot b { color: var(--tx-body); font-weight: 600; margin-left: auto; }\n\n/* ═══ MAIN COLUMN ════════════════════════════════════════════════════════ */\n#ocm-v6 .main { display: flex; flex-direction: column; min-width: 0; }\n\n#ocm-v6 .topbar {\n  display: flex; align-items: center; gap: 14px;\n  padding: 14px 22px; border-bottom: 1px solid var(--line);\n  background: var(--bg);\n  position: sticky; top: 0; z-index: 10;\n}\n#ocm-v6 .search {\n  flex: 1; max-width: 560px; position: relative;\n}\n#ocm-v6 .search input {\n  width: 100%; height: 40px; padding: 0 14px 0 40px;\n  background: var(--sunk); border: 1px solid var(--line);\n  border-radius: var(--r-s); color: var(--tx); font: inherit; font-size: 13px;\n  transition: border-color .13s, background .13s;\n}\n#ocm-v6 .search input::placeholder { color: var(--tx-faint); }\n#ocm-v6 .search input:focus { outline: none; border-color: #2f4d70; background: #10161f; }\n#ocm-v6 .search-ico {\n  position: absolute; left: 13px; top: 50%; transform: translateY(-50%);\n  color: var(--tx-faint); font-size: 14px; pointer-events: none;\n}\n#ocm-v6 .topbar .push { margin-left: auto; }\n#ocm-v6 .icobtn {\n  width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;\n  border: none; background: none; color: var(--tx-muted);\n  font-size: 15px; border-radius: var(--r-s); cursor: pointer;\n  transition: color .13s, background .13s;\n}\n#ocm-v6 .icobtn:hover { color: var(--tx); background: #1a212d; }\n#ocm-v6 .icobtn.on { color: var(--accent-bright); }\n\n#ocm-v6 .content { padding: 22px; flex: 1; }\n\n#ocm-v6 .page-head { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 22px; }\n#ocm-v6 .page-ico {\n  font-size: 26px; line-height: 1; color: var(--accent); margin-top: 3px;\n  filter: drop-shadow(0 0 8px rgba(47,143,237,.3));\n}\n#ocm-v6 .page-title { font-size: 26px; font-weight: 700; color: #fff; letter-spacing: -.02em; line-height: 1.2; }\n#ocm-v6 .page-sub { font-size: 13px; color: var(--tx-muted); margin-top: 3px; }\n#ocm-v6 .page-head .push { margin-left: auto; }\n\n#ocm-v6 .foot {\n  display: flex; align-items: center; padding: 14px 22px;\n  /* muted, not faint — the footer states the version and the sync time, and\n     both are things someone actually needs to read. */\n  border-top: 1px solid var(--line); font-size: 12px; color: var(--tx-muted);\n}\n#ocm-v6 .foot .push { margin-left: auto; }\n\n/* ═══ GRID ═══════════════════════════════════════════════════════════════ */\n#ocm-v6 .grid { display: grid; gap: 16px; margin-bottom: 16px; }\n#ocm-v6 .g-2 { grid-template-columns: 1.9fr 1.1fr; }\n#ocm-v6 .g-3 { grid-template-columns: repeat(3, 1fr); }\n#ocm-v6 .g-2e { grid-template-columns: 1.25fr 1fr; }\n@media (max-width: 1100px) { #ocm-v6 .g-2, #ocm-v6 .g-3, #ocm-v6 .g-2e { grid-template-columns: 1fr; } }\n/* At 990px the 3-across row is too tight for a donut beside two stat columns,\n   so it drops to 2 and the 2-across rows stay. Stacking everything to 1fr\n   wastes the width that IS there. */\n#ocm-v6.compact .g-3 { grid-template-columns: repeat(2, 1fr); }\n#ocm-v6.icons .g-2, #ocm-v6.icons .g-3, #ocm-v6.icons .g-2e { grid-template-columns: 1fr; }\n\n/* ═══ CARD ═══════════════════════════════════════════════════════════════\n   Header strip, hairline, body. One shape for everything on the page.       */\n#ocm-v6 .card {\n  background: var(--card); border: 1px solid var(--line);\n  border-radius: var(--r); overflow: hidden;\n  display: flex; flex-direction: column;\n}\n#ocm-v6 .card-h {\n  display: flex; align-items: center; gap: 10px;\n  padding: 15px 18px; background: var(--card-head);\n  border-bottom: 1px solid var(--line);\n}\n#ocm-v6 .card-h h3 { margin: 0; font-size: 15px; font-weight: 600; color: var(--tx); }\n#ocm-v6 .card-h .small { font-size: 12px; color: var(--tx-muted); font-weight: 400; }\n#ocm-v6 .card-h .push { margin-left: auto; }\n#ocm-v6 .card-h a { color: var(--accent); font-size: 12px; font-weight: 500; text-decoration: none; }\n#ocm-v6 .card-h a:hover { text-decoration: underline; }\n#ocm-v6 .card-b { padding: 18px; flex: 1; }\n#ocm-v6 .card-b.tight { padding: 8px 18px; }\n#ocm-v6 .card-b.flush { padding: 0; }\n\n/* ═══ STAT STRIP — the \"Faction Overview\" row ════════════════════════════ */\n#ocm-v6 .stats { display: flex; align-items: stretch; }\n#ocm-v6 .stat { flex: 1; text-align: center; padding: 6px 10px; position: relative; }\n#ocm-v6 .stat + .stat::before {\n  content: ''; position: absolute; left: 0; top: 8px; bottom: 8px;\n  width: 1px; background: var(--line);\n}\n#ocm-v6 .stat-l { font-size: 13px; color: var(--tx-dim); font-weight: 500; }\n#ocm-v6 .stat-v {\n  font-size: 34px; font-weight: 700; color: #fff;\n  line-height: 1.15; margin: 6px 0 8px; letter-spacing: -.02em;\n}\n#ocm-v6 .stat-v.green { color: var(--green); }\n#ocm-v6 .stat-v.red { color: var(--red); }\n#ocm-v6 .stat-i { font-size: 17px; color: var(--tx-faint); }\n\n/* ═══ KEY/VALUE ROWS ═════════════════════════════════════════════════════ */\n#ocm-v6 .kv { display: flex; align-items: center; gap: 10px; padding: 9px 0; font-size: 13px; }\n#ocm-v6 .kv + .kv { border-top: 1px solid var(--line-soft); }\n#ocm-v6 .kv .k { color: var(--tx-dim); }\n#ocm-v6 .kv .v { margin-left: auto; color: var(--tx); font-weight: 600; white-space: nowrap; }\n#ocm-v6 .kv .v.green { color: var(--green); }\n#ocm-v6 .kv .v.red { color: var(--red); }\n#ocm-v6 .kv .v.dim { color: var(--tx-dim); font-weight: 500; }\n#ocm-v6 .kv-rule { height: 1px; background: var(--line); margin: 8px 0; }\n\n#ocm-v6 .dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 9px; }\n#ocm-v6 .dot.green { background: var(--green);  box-shadow: 0 0 7px rgba(63,185,80,.5); }\n#ocm-v6 .dot.yellow { background: var(--yellow); box-shadow: 0 0 7px rgba(212,160,23,.45); }\n#ocm-v6 .dot.grey { background: #5b6675; }\n#ocm-v6 .dot.purple { background: var(--purple); box-shadow: 0 0 7px rgba(163,113,247,.45); }\n#ocm-v6 .dot.red { background: var(--red);    box-shadow: 0 0 7px rgba(224,82,82,.45); }\n\n/* ═══ DONUT ══════════════════════════════════════════════════════════════ */\n#ocm-v6 .donut-row { display: flex; align-items: center; gap: 22px; }\n#ocm-v6 .donut { position: relative; flex: 0 0 auto; }\n#ocm-v6 .donut-mid {\n  position: absolute; inset: 0;\n  display: flex; flex-direction: column; align-items: center; justify-content: center;\n}\n#ocm-v6 .donut-pct { font-size: 27px; font-weight: 700; color: #fff; line-height: 1; }\n#ocm-v6 .donut-lbl { font-size: 11px; color: var(--tx-muted); margin-top: 3px; }\n#ocm-v6 .donut-side { flex: 1; min-width: 0; }\n#ocm-v6 .donut-side .k { font-size: 12px; color: var(--tx-dim); }\n#ocm-v6 .donut-side .v { font-size: 21px; font-weight: 700; color: #fff; line-height: 1.2; }\n#ocm-v6 .donut-side > div + div { margin-top: 13px; }\n\n/* ═══ BANNER — the \"FACTION NOT CHAINING\" panel ═════════════════════════ */\n#ocm-v6 .banner {\n  background: var(--sunk); border: 1px solid var(--line);\n  border-radius: var(--r-s); padding: 18px; text-align: center; margin-bottom: 4px;\n}\n#ocm-v6 .banner .big {\n  font-size: 18px; font-weight: 700; letter-spacing: .01em; color: var(--accent-bright);\n}\n#ocm-v6 .banner .sub { font-size: 13px; margin-top: 5px; color: var(--green); font-weight: 500; }\n#ocm-v6 .banner.alert .big { color: var(--red); }\n#ocm-v6 .banner.alert .sub { color: var(--yellow); }\n\n/* ═══ ACTIVITY FEED ══════════════════════════════════════════════════════ */\n#ocm-v6 .feed { display: flex; align-items: center; gap: 12px; padding: 10px 0; font-size: 13px; }\n#ocm-v6 .feed + .feed { border-top: 1px solid var(--line-soft); }\n#ocm-v6 .feed .fi { flex: 0 0 20px; text-align: center; font-size: 14px; color: var(--tx-muted); }\n#ocm-v6 .feed .ft { flex: 1; min-width: 0; color: var(--tx-body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n#ocm-v6 .feed .ft b { color: var(--tx); font-weight: 600; }\n#ocm-v6 .feed .fw { color: var(--tx-muted); font-size: 12px; white-space: nowrap; }\n\n/* ═══ MEMBER COLUMNS ═════════════════════════════════════════════════════ */\n#ocm-v6 .mcols { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; }\n#ocm-v6 .mrow { display: flex; align-items: center; gap: 10px; padding: 7px 0; font-size: 13px; color: var(--tx-body); }\n\n/* ═══ TABLE ══════════════════════════════════════════════════════════════ */\n#ocm-v6 .tablewrap { overflow-x: auto; }\n#ocm-v6 table { width: 100%; border-collapse: collapse; font-size: 13px; }\n#ocm-v6 thead th {\n  padding: 11px 16px; background: var(--card-head);\n  font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;\n  color: var(--tx-muted); text-align: left; white-space: nowrap;\n  border-bottom: 1px solid var(--line);\n}\n#ocm-v6 thead th.num { text-align: right; }\n#ocm-v6 tbody td {\n  padding: 11px 16px; border-bottom: 1px solid var(--line-soft);\n  color: var(--tx-dim); white-space: nowrap;\n}\n#ocm-v6 tbody td.num { text-align: right; }\n#ocm-v6 tbody tr:last-child td { border-bottom: none; }\n#ocm-v6 tbody tr:hover td { background: #1b222e; }\n#ocm-v6 tbody tr.clickable { cursor: pointer; }\n#ocm-v6 td.strong { color: var(--tx); font-weight: 600; }\n#ocm-v6 a.link { color: var(--accent); text-decoration: none; }\n#ocm-v6 a.link:hover { text-decoration: underline; }\n\n/* ═══ CHIPS + SEMANTIC TEXT ══════════════════════════════════════════════ */\n#ocm-v6 .chip {\n  display: inline-block; padding: 3px 9px; border-radius: 5px;\n  background: #263041; color: var(--tx-dim); font-size: 11px; font-weight: 600;\n}\n#ocm-v6 .chip.green { background: rgba(63,185,80,.13);  color: var(--green); }\n#ocm-v6 .chip.yellow { background: rgba(212,160,23,.13); color: var(--yellow); }\n#ocm-v6 .chip.red { background: rgba(224,82,82,.13);  color: var(--red); }\n#ocm-v6 .chip.blue { background: var(--accent-soft);     color: var(--accent-bright); }\n/* Hollow = INFERRED. Same hue as its solid sibling so the meaning still reads\n   at a glance, but visibly not the same claim — used where the suite is\n   guessing (a give-funds match) rather than reporting what Torn recorded. */\n#ocm-v6 .chip.out { background: none; box-shadow: inset 0 0 0 1px currentColor; opacity: .85; }\n#ocm-v6 .green { color: var(--green); } #ocm-v6 .yellow { color: var(--yellow); }\n#ocm-v6 .red { color: var(--red); }     #ocm-v6 .dim { color: var(--tx-muted); }\n/* .faint is a CONTENT class, so it resolves to the muted tier, not the faint\n   variable — content is by definition information. --tx-faint is reachable\n   only from decorative rules (placeholders, inert icons). */\n#ocm-v6 .faint { color: var(--tx-muted); } #ocm-v6 .b { font-weight: 700; }\n\n#ocm-v6 .note { font-size: 12px; line-height: 1.65; color: var(--tx-muted); margin: 12px 0 0; }\n#ocm-v6 .note b { color: var(--tx-dim); }\n\n/* ═══ AVATAR ═════════════════════════════════════════════════════════════ */\n#ocm-v6 .av { position: relative; width: 30px; height: 30px; flex: 0 0 30px; border-radius: var(--r-s); overflow: hidden; }\n#ocm-v6 .av-mono {\n  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;\n  font-size: 11px; font-weight: 700; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.5);\n}\n#ocm-v6 .namecell { display: flex; align-items: center; gap: 10px; min-width: 0; }\n#ocm-v6 table.avatars td, #ocm-v6 table.avatars th { vertical-align: middle; }\n\n#ocm-v6 .spark { display: inline-flex; gap: 3px; }\n#ocm-v6 .spark i { width: 6px; height: 6px; border-radius: 50%; background: #2a3444; display: inline-block; }\n#ocm-v6 .spark i.s { background: var(--green); } #ocm-v6 .spark i.f { background: var(--red); }\n\n#ocm-v6 .bar { height: 5px; background: var(--sunk); border-radius: 3px; overflow: hidden; }\n#ocm-v6 .bar > span { display: block; height: 100%; background: var(--accent); border-radius: 3px; }\n#ocm-v6 .bar > span.green { background: var(--green); }\n\n#ocm-v6 .empty { padding: 54px 20px; text-align: center; }\n#ocm-v6 .empty .i { font-size: 30px; opacity: .45; }\n#ocm-v6 .empty .m { margin-top: 12px; font-size: 15px; color: var(--tx-dim); }\n#ocm-v6 .empty .s { margin-top: 5px; font-size: 12px; color: var(--tx-muted); }\n/* ═══ SUB-NAV ═════════════════════════════════════════════════════════════\n   Second-level navigation inside a page. Scrolls horizontally rather than\n   wrapping — a wrapping tab strip changes the page height when you switch\n   tabs, which shifts everything below it for no reason. */\n#ocm-v6 .subnav {\n  display: flex; gap: 2px; margin-bottom: 16px;\n  border-bottom: 1px solid var(--line);\n  overflow-x: auto; scrollbar-width: none;\n}\n#ocm-v6 .subnav::-webkit-scrollbar { display: none; }\n#ocm-v6 .subnav button {\n  flex: 0 0 auto; background: none; border: 0; cursor: pointer;\n  padding: 9px 13px; font: 600 12.5px/1 inherit; color: var(--tx-dim);\n  border-bottom: 2px solid transparent; margin-bottom: -1px;\n  white-space: nowrap; transition: color .12s ease;\n}\n#ocm-v6 .subnav button:hover { color: var(--tx-body); }\n#ocm-v6 .subnav button.on { color: var(--accent-bright); border-bottom-color: var(--accent); }\n/* muted, not faint — the count is the whole reason to look at the tab. Size\n   already separates it from the label, so it does not need to be dimmer too. */\n#ocm-v6 .subnav .n { font-size: 10.5px; color: var(--tx-muted); margin-left: 5px; }\n#ocm-v6 .subnav button.on .n { color: var(--accent); }\n#ocm-v6.compact .subnav button { padding: 8px 10px; font-size: 12px; }\n\n/* ═══ ASYNC STATES ════════════════════════════════════════════════════════\n   Three ways a pane can have nothing to show, and all three must look\n   DIFFERENT — \"loading\", \"this failed\", and \"there is genuinely none\" are\n   different messages, and collapsing them into one blank box is how the old\n   suite made a permissions error look like an empty faction. */\n#ocm-v6 .skel { display: grid; gap: 8px; }\n#ocm-v6 .skel i {\n  display: block; height: 13px; border-radius: 4px;\n  background: linear-gradient(90deg, var(--sunk) 25%, var(--line-soft) 37%, var(--sunk) 63%);\n  background-size: 400% 100%; animation: shimmer 1.4s ease infinite;\n}\n@keyframes shimmer { from { background-position: 100% 0 } to { background-position: -100% 0 } }\n/* Respect the OS setting — a shimmer is decoration, not information. */\n#ocm-v6 @media (prefers-reduced-motion: reduce) { #ocm-v6 .skel i { animation: none } }\n\n#ocm-v6 .errnote {\n  display: flex; gap: 10px; align-items: flex-start;\n  padding: 13px 15px; border-radius: var(--r-s);\n  background: color-mix(in srgb, var(--red) 9%, transparent);\n  border: 1px solid color-mix(in srgb, var(--red) 32%, transparent);\n}\n#ocm-v6 .errnote .ei { font-size: 15px; line-height: 1.3; }\n#ocm-v6 .errnote .em { font-size: 12.5px; color: var(--tx); font-weight: 600; }\n#ocm-v6 .errnote .es { font-size: 12px; color: var(--tx-muted); margin-top: 3px; line-height: 1.5; }\n#ocm-v6 .errnote button {\n  margin-top: 7px; background: none; cursor: pointer;\n  border: 1px solid var(--line); color: var(--tx-body);\n  border-radius: 5px; padding: 4px 10px; font: 600 11.5px inherit;\n}\n#ocm-v6 .errnote button:hover { border-color: #35404f; color: var(--tx); }\n\n/* ═══ PROVENANCE ══════════════════════════════════════════════════════════\n   Where a number came from, shown next to the number itself. The suite mixes\n   official war-report figures, ledger-computed observations and third-party\n   estimates in the same table; presenting an estimate as if it were measured\n   is the one dishonesty this UI must never commit. */\n#ocm-v6 .prov {\n  display: inline-flex; align-items: center; gap: 3px; margin-left: 5px;\n  font-size: 9.5px; font-weight: 700; letter-spacing: .04em;\n  text-transform: uppercase; vertical-align: middle;\n}\n#ocm-v6 .prov::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: currentColor; }\n#ocm-v6 .prov.exact { color: var(--green); }\n#ocm-v6 .prov.obs { color: var(--accent); }\n#ocm-v6 .prov.est { color: var(--tx-muted); }\n#ocm-v6 .prov.est::before { background: none; box-shadow: inset 0 0 0 1px currentColor; }\n\n/* ═══ BAR ═════════════════════════════════════════════════════════════════ */\n#ocm-v6 .bar { height: 6px; border-radius: 3px; background: var(--sunk); overflow: hidden; }\n#ocm-v6 .bar i { display: block; height: 100%; border-radius: 3px; background: var(--accent); }\n#ocm-v6 .bar.green i { background: var(--green); } #ocm-v6 .bar.yellow i { background: var(--yellow); }\n#ocm-v6 .bar.red i { background: var(--red); }\n#ocm-v6 .barrow { display: grid; grid-template-columns: 1fr auto; gap: 3px 10px; align-items: center; margin-bottom: 11px; }\n#ocm-v6 .barrow .bl { font-size: 12.5px; color: var(--tx-body); }\n#ocm-v6 .barrow .bv { font-size: 12.5px; font-weight: 700; color: var(--tx); font-variant-numeric: tabular-nums; }\n#ocm-v6 .barrow .bar { grid-column: 1 / -1; }\n\n/* ═══ MEMBER PROFILE DRILL-DOWN ═══════════════════════════════════════════\n   A drill-down, NOT a modal: it replaces the page body and keeps the shell,\n   so browser back and the nav both still mean something. */\n#ocm-v6 .backbar {\n  display: flex; align-items: center; gap: 9px; margin-bottom: 15px;\n  background: none; border: 0; cursor: pointer; padding: 0;\n  font: 600 12.5px inherit; color: var(--tx-muted);\n}\n#ocm-v6 .backbar:hover { color: var(--tx); }\n#ocm-v6 .prof-head { display: flex; gap: 16px; align-items: center; margin-bottom: 18px; }\n#ocm-v6 .prof-head .av { width: 64px; height: 64px; flex-basis: 64px; }\n#ocm-v6 .prof-head .av-mono { font-size: 22px; }\n#ocm-v6 .prof-name { font-size: 21px; font-weight: 700; color: var(--tx); }\n#ocm-v6 .prof-sub { font-size: 12.5px; color: var(--tx-muted); margin-top: 3px; }\n#ocm-v6 [data-act=\"profile\"] { cursor: pointer; }\n#ocm-v6 [data-act=\"profile\"]:hover .nm { color: var(--accent-bright); text-decoration: underline; }\n\n/* ═══ EXPORT TILES ════════════════════════════════════════════════════════ */\n#ocm-v6 .exp { display: flex; gap: 12px; align-items: flex-start; padding: 13px 0; border-bottom: 1px solid var(--line-soft); }\n#ocm-v6 .exp:last-child { border-bottom: 0; }\n#ocm-v6 .exp .xi { font-size: 17px; flex: 0 0 22px; text-align: center; }\n#ocm-v6 .exp .xn { font-size: 13px; font-weight: 600; color: var(--tx); }\n#ocm-v6 .exp .xs { font-size: 12px; color: var(--tx-muted); margin-top: 2px; line-height: 1.5; }\n#ocm-v6 .exp .xf { display: flex; gap: 5px; margin-left: auto; flex: 0 0 auto; }\n#ocm-v6 .exp .xf button {\n  background: var(--sunk); border: 1px solid var(--line); color: var(--tx-dim);\n  border-radius: 5px; padding: 5px 9px; font: 600 11px inherit; cursor: pointer;\n}\n#ocm-v6 .exp .xf button:hover { border-color: var(--accent); color: var(--accent-bright); }\n\n/* ═══ DEFINITION LIST — the Legend page ═══════════════════════════════════ */\n#ocm-v6 .def { display: grid; grid-template-columns: 130px 1fr; gap: 9px 16px; font-size: 12.5px; }\n#ocm-v6 .def dt { font-weight: 700; color: var(--tx); }\n#ocm-v6 .def dd { margin: 0; color: var(--tx-muted); line-height: 1.6; }\n#ocm-v6.compact .def { grid-template-columns: 104px 1fr; }\n\n/* ═══ SETTINGS PICKERS ════════════════════════════════════════════════════\n   Both pickers show the thing itself rather than describing it — a theme is\n   its swatches, a layout is its shape. Reading \"Compact · 990px\" tells you\n   nothing you can act on; seeing the rail width does. */\n#ocm-v6 .opt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }\n#ocm-v6 .opt {\n  background: var(--sunk); border: 1px solid var(--line);\n  border-radius: var(--r-s); padding: 11px; cursor: pointer; text-align: left;\n  font: inherit; color: var(--tx-body);\n  transition: border-color .12s ease, background .12s ease;\n}\n#ocm-v6 .opt:hover { border-color: #35404f; background: var(--card-head); }\n#ocm-v6 .opt.on { border-color: var(--accent); background: var(--accent-soft); }\n#ocm-v6 .opt-name { font-size: 12.5px; font-weight: 600; color: var(--tx); margin-bottom: 2px; }\n#ocm-v6 .opt.on .opt-name::after { content: ' ✓'; color: var(--accent-bright); }\n#ocm-v6 .opt-sub { font-size: 11px; color: var(--tx-muted); line-height: 1.35; }\n\n/* Theme swatch: the surface ramp, then the accent, then the semantic trio.\n   The trio is what actually matters for the colour-safe theme — you can see\n   at a glance whether good/warn/crit stay apart. */\n#ocm-v6 .sw { display: flex; gap: 3px; margin-bottom: 9px; }\n#ocm-v6 .sw i { height: 22px; flex: 1; border-radius: 3px; border: 1px solid rgba(255,255,255,.07); }\n#ocm-v6 .sw i.gap { flex: 0 0 5px; border: 0; background: none; }\n\n/* Miniature of the real layout — sidebar rail plus content lines, to scale. */\n#ocm-v6 .lay { display: flex; gap: 3px; height: 40px; margin-bottom: 9px;\n       background: var(--bg); border: 1px solid var(--line); border-radius: 4px; padding: 3px; }\n#ocm-v6 .lay .lay-side { background: var(--side); border-radius: 2px; flex: 0 0 auto;\n                 display: flex; flex-direction: column; gap: 2px; padding: 3px; }\n#ocm-v6 .lay .lay-side u { display: block; height: 3px; background: var(--tx-faint);\n                   border-radius: 1px; text-decoration: none; }\n#ocm-v6 .lay .lay-main { flex: 1; display: flex; flex-direction: column; gap: 2px; }\n#ocm-v6 .lay .lay-main u { display: block; height: 3px; background: var(--line);\n                   border-radius: 1px; text-decoration: none; }\n#ocm-v6 .lay .lay-main u:first-child { background: var(--accent); width: 40%; }\n";

/**
 * v6 DERIVE — stores in, display numbers out.
 *
 * Every function here is PURE: no DOM, no network, no storage, no clock it
 * did not receive. That is the whole point. In v5 the fetching, the
 * arithmetic and the HTML all live in one renderer, so the arithmetic cannot
 * be tested without a browser and has never been tested at all.
 *
 * The money model is the reason this file exists. Getting it wrong does not
 * crash anything — it just quietly reports the wrong number, and a faction
 * leader makes decisions on it.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   THE MONEY MODEL

   The old "NET" column was gross minus item cost — the whole pie BEFORE
   anyone was paid. A "$313m net" OC on an 80% split really left the faction
   about $62m. That is a five-fold overstatement of the only number that
   answers "was this worth running", so the three quantities are now kept
   explicitly separate and never collapsed:

     gross   = cash + reward-item value
     members = cash × split%        counted ONLY for OCs Torn marks paid
     kept    = gross − members − item cost
   ═══════════════════════════════════════════════════════════════════════════ */

/** Default member share by difficulty. Every level is user-editable. */
const DEFAULT_SHARE = { 1: 1.00, 2: 1.00, 3: 0.90, 4: 0.90, 5: 0.80 };

/** The most conservative share configured — the fallback when we do not know. */
function lowestShare(cfg = DEFAULT_SHARE) {
  const vals = Object.values(cfg).filter(Number.isFinite);
  return vals.length ? Math.min(...vals) : 0.80;
}

/**
 * Resolve the member split for one OC.
 *
 * Torn's own recorded percentage ALWAYS wins. A local setting must never
 * rewrite what was actually paid — the setting is a fallback for OCs that
 * have not been paid yet, nothing more.
 *
 * THE TRAP, and why the guard below is so explicit:
 *   Number(null) === 0, and 0 passes isFinite().
 * v5 tested difficulty with isFinite(), so an OC whose difficulty was null
 * scored 0, fell through to the level-1 bucket, and was silently treated as
 * the MOST GENEROUS split — overstating what members were owed on exactly
 * the OCs we knew least about. Unknown must fall back to the LOWEST share,
 * because under-promising is recoverable and over-promising is not.
 *
 * @returns {{pct:number, source:'exact'|'config'|'unknown'}}
 */
function splitFor(oc, cfg = DEFAULT_SHARE) {
  const recorded = oc?.rewards?.payout?.percentage;
  if (typeof recorded === 'number' && Number.isFinite(recorded) && recorded > 0) {
    return { pct: recorded / 100, source: 'exact' };
  }

  const diff = oc?.difficulty;
  // Deliberately NOT isFinite(Number(diff)) — see the trap above. It must be
  // a number already, and a positive one.
  const known = typeof diff === 'number' && Number.isFinite(diff) && diff >= 1;
  if (!known) return { pct: lowestShare(cfg), source: 'unknown' };

  // Levels above the configured table take the highest configured level,
  // which is the lowest share — harder crimes never pay members MORE.
  const levels = Object.keys(cfg).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const bucket = cfg[diff] ?? cfg[levels[levels.length - 1]];
  return { pct: Number.isFinite(bucket) ? bucket : lowestShare(cfg), source: 'config' };
}

/** Has Torn itself recorded this OC as paid? The only authoritative signal. */
function isPaid(oc) {
  return Boolean(oc?.rewards?.payout?.paid_at);
}

/**
 * Join the two stores into one row per completed OC.
 *
 * `profitLedger` holds the money snapshot taken when we saw the OC; the
 * archive holds difficulty and Torn's payout record. Neither alone is enough
 * and neither is authoritative for the other's fields.
 *
 * @param {object} profitLedger  { [ocId]: {name, money, itemValue, cost, executedAt} }
 * @param {object} ocArchive     { [ocId]: {difficulty, rewards:{payout}} }
 */
function ocRows(profitLedger = {}, ocArchive = {}, cfg = DEFAULT_SHARE) {
  return Object.entries(profitLedger).map(([id, p]) => {
    const oc = ocArchive[id] || {};
    const cash = toNum(p.money);
    const items = toNum(p.itemValue);
    const cost = toNum(p.cost);
    const split = splitFor({ ...oc, difficulty: oc.difficulty ?? p.difficulty }, cfg);
    const paid = isPaid(oc);

    const gross = cash + items;
    // Only counted once Torn says it was paid. An unpaid OC's cash is still
    // sitting with the faction, so counting the cut early flatters nobody —
    // it just makes "kept" wrong in the pessimistic direction.
    const members = paid ? cash * split.pct : 0;

    return {
      id, name: p.name || 'Unknown',
      executedAt: toNum(p.executedAt),
      cash, items, cost, gross, members,
      kept: gross - members - cost,
      split: split.pct, splitSource: split.source, paid,
    };
  });
}

/**
 * Aggregate rows into the per-scenario table Money shows.
 *
 * `runs` is a count, `perRun` is derived at the end — never averaged from
 * per-row averages, which would weight a 1-run scenario the same as a
 * 96-run one.
 */
function moneyByScenario(rows = []) {
  const by = new Map();
  for (const r of rows) {
    const g = by.get(r.name) || {
      name: r.name, runs: 0, gross: 0, members: 0, cost: 0, kept: 0,
      paidRuns: 0, estimated: 0,
    };
    g.runs++;
    g.gross += r.gross;
    g.members += r.members;
    g.cost += r.cost;
    g.kept += r.kept;
    if (r.paid) g.paidRuns++;
    if (r.splitSource !== 'exact') g.estimated++;
    by.set(r.name, g);
  }
  return [...by.values()]
    .map(g => ({
      ...g,
      perRun: g.runs ? g.kept / g.runs : 0,
      // If any run in the group used a fallback split, the group's `members`
      // and `kept` are partly estimated and the UI must say so.
      prov: g.estimated === 0 ? 'exact' : g.estimated === g.runs ? 'est' : 'mixed',
    }))
    .sort((a, b) => b.kept - a.kept);
}

/** Faction-wide totals. Same arithmetic, one bucket. */
function moneyTotals(rows = []) {
  const t = { runs: rows.length, gross: 0, members: 0, cost: 0, kept: 0, unpaidCash: 0, unpaidCount: 0 };
  for (const r of rows) {
    t.gross += r.gross; t.members += r.members; t.cost += r.cost; t.kept += r.kept;
    if (!r.paid) { t.unpaidCash += r.cash; t.unpaidCount++; }
  }
  return t;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAYOUT MATCHING — inference, and labelled as such

   Torn does not record which OC a give-funds transfer paid for. So this
   matches gives back to OCs by amount and timing, and every result carries a
   confidence. It is a best guess, and the UI must never draw it as a fact.

   Ported from v5's matchPayouts. The rules below were learned by getting
   them wrong; each one is pinned by a test:

    · Natively-paid OCs produce NO claims. An OC Torn paid through its own
      system never touched the funds log, so a claim for it cannot be settled
      by any real give — it can only steal one from a claim that genuinely
      needs it, corrupting a match elsewhere.

    · Manually-marked-paid OCs DO keep their claims. Those really were paid
      by gives, and letting their claims absorb those gives is what stops the
      same gives being mis-attributed to other OCs.

    · The split must be resolved PER OC. v5 first used one flat percentage;
      on an 80%-split OC that made the expected amount 25% too high, so real
      gives fell outside tolerance and legitimate payments looked unpaid.

    · A name that maps to two different members stays unresolved. Guessing
      attributes someone else's money to the wrong person.
   ═══════════════════════════════════════════════════════════════════════════ */

const PAYOUT_WINDOW_DAYS = 21;    // a give this long after the OC still counts
const PAYOUT_TOLERANCE   = 0.15;  // amount may differ from expected by 15%
const CLOCK_SKEW_GRACE   = 3600;  // a give may predate the OC by up to an hour

/**
 * One claim per participant per unpaid OC: what that member is owed for it.
 * @param {Array} ocs  [{id, name, money, executedAt, participants:{uid:name}, nativePaid}]
 */
function buildClaims(ocs = [], splitOf) {
  const claims = [];
  for (const oc of ocs) {
    if (!(toNum(oc.money) > 0)) continue;
    if (oc.nativePaid) continue;              // see the header — this one matters
    const ids = Object.keys(oc.participants || {});
    if (!ids.length) continue;

    const pct = splitOf(oc);
    const expected = (toNum(oc.money) * pct) / ids.length;
    if (!(expected > 0)) continue;

    for (const uid of ids) {
      claims.push({
        ocId: String(oc.id), ocName: oc.name, uid: String(uid),
        name: oc.participants[uid], expected, ts: toNum(oc.executedAt), matched: null,
      });
    }
  }
  return claims;
}

/**
 * Attach a recipient id to each give.
 *
 * Plain-text news entries carry no XID, so those gives were once dropped from
 * matching entirely. Resolve them by exact case-insensitive name against the
 * claim population — but a name held by two different uids is ambiguous and
 * stays unresolved rather than guessing.
 */
function resolveRecipients(events = {}, claims = []) {
  const nameToUid = Object.create(null);
  for (const c of claims) {
    const k = String(c.name || '').trim().toLowerCase();
    if (!k) continue;
    if (!(k in nameToUid)) nameToUid[k] = c.uid;
    else if (nameToUid[k] !== c.uid) nameToUid[k] = null;   // ambiguous — refuse
  }

  return Object.entries(events)
    .filter(([, e]) => e && toNum(e.amount) > 0)
    .map(([id, e]) => {
      const explicit = e.toId !== null && e.toId !== undefined && e.toId !== '';
      const toId = explicit
        ? String(e.toId)
        : nameToUid[String(e.toName || '').trim().toLowerCase()] || null;
      return { id, ...e, amount: toNum(e.amount), ts: toNum(e.ts), toId, usedBy: [] };
    })
    .filter(e => e.toId)
    .sort((a, b) => a.ts - b.ts);
}

/**
 * Match gives to claims, then summarise per OC.
 *
 * @param {Array} ocs
 * @param {object} events    { [newsId]: {ts, toId, toName, amount} }
 * @param {(oc)=>number} splitOf   returns 0–1. Per OC — never a flat number.
 */
function matchPayouts(ocs = [], events = {}, splitOf = () => 0.8, opt = {}) {
  const windowDays = opt.windowDays ?? PAYOUT_WINDOW_DAYS;
  const tol = opt.tolerance ?? PAYOUT_TOLERANCE;
  const maxGap = windowDays * 86400;

  const claims = buildClaims(ocs, splitOf);
  const evts = resolveRecipients(events, claims);

  /* Pass 1 — confident 1:1 pairings, greedy by best score. Score favours a
     close amount first and a short delay second, so the most defensible
     pairing claims its give before a weaker one can take it. */
  const cands = [];
  for (const c of claims) {
    for (const e of evts) {
      if (e.toId !== c.uid) continue;
      const gap = e.ts - c.ts;
      if (gap < -CLOCK_SKEW_GRACE || gap > maxGap) continue;
      const relErr = Math.abs(e.amount - c.expected) / c.expected;
      if (relErr > tol) continue;
      cands.push({ c, e, relErr, score: relErr * 10 + gap / maxGap });
    }
  }
  cands.sort((a, b) => a.score - b.score);
  for (const cd of cands) {
    if (cd.c.matched || cd.e.usedBy.length) continue;
    cd.c.matched = { eventId: cd.e.id, ts: cd.e.ts, amount: cd.e.amount,
                     relErr: cd.relErr, mode: 'exact', covers: 1 };
    cd.e.usedBy.push(cd.c);
  }

  /* Pass 2 — lump sums. Leaders batch-pay, so one unused give may settle
     several of that member's open claims at once. Needs at least two, because
     a single claim already had its chance at a cleaner 1:1 match. */
  for (const e of evts) {
    if (e.usedBy.length) continue;
    const open = claims
      .filter(c => !c.matched && c.uid === e.toId &&
                   e.ts - c.ts >= -CLOCK_SKEW_GRACE && e.ts - c.ts <= maxGap)
      .sort((a, b) => a.ts - b.ts);
    if (open.length < 2) continue;

    let acc = 0; const take = [];
    for (const c of open) {
      if (acc + c.expected <= e.amount * (1 + tol)) { acc += c.expected; take.push(c); }
    }
    if (take.length < 2 || !(acc > 0)) continue;
    const relErr = Math.abs(e.amount - acc) / acc;
    if (relErr > tol) continue;

    for (const c of take) {
      c.matched = { eventId: e.id, ts: e.ts, amount: e.amount,
                    relErr, mode: 'lump', covers: take.length };
      e.usedBy.push(c);
    }
  }

  /* Summarise per OC. `confidence` is deliberately a word, not a number —
     "high" and "likely" mean different things to a reader, whereas 0.94 vs
     0.91 invites false precision about a guess. */
  const byOc = {};
  for (const c of claims) {
    const o = byOc[c.ocId] || (byOc[c.ocId] = {
      total: 0, matched: 0, paidSum: 0, owedSum: 0, lastTs: 0, minErr: 1, lump: false,
    });
    o.total++;
    if (c.matched) {
      o.matched++; o.paidSum += c.expected;
      o.lastTs = Math.max(o.lastTs, c.matched.ts);
      o.minErr = Math.min(o.minErr, c.matched.relErr);
      if (c.matched.mode === 'lump') o.lump = true;
    } else {
      o.owedSum += c.expected;
    }
  }
  for (const o of Object.values(byOc)) {
    o.full = o.total > 0 && o.matched === o.total;
    o.confidence = !o.full ? (o.matched ? 'partial' : 'none')
                 : o.minErr <= 0.02 ? 'high' : 'likely';
  }

  return { byOc, claims, events: evts, unmatchedEvents: evts.filter(e => !e.usedBy.length) };
}

/** What each member is owed, across every OC. Money › Member earnings. */
function earningsByMember(claims = [], names = {}) {
  const by = new Map();
  for (const c of claims) {
    const g = by.get(c.uid) || {
      uid: c.uid, name: names[c.uid] || c.name || `#${c.uid}`,
      runs: 0, earned: 0, paid: 0,
    };
    g.runs++;
    g.earned += c.expected;
    if (c.matched) g.paid += c.expected;
    by.set(c.uid, g);
  }
  return [...by.values()]
    .map(g => ({ ...g, owed: g.earned - g.paid }))
    .sort((a, b) => b.earned - a.earned);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ROSTER — two stores, because neither one can answer the question alone

   CPR_ARCHIVE holds only the MOST RECENT entry per (member, OC, role). That
   is deliberate: it lets the archive cover every crime a member has run
   without growing by one row per run. The consequence is that it contains no
   run history at all, so it cannot supply runs, success rate, recent form or
   trend — only current CPR, preferred role and best difficulty.

   Everything time-series comes from OC_ARCHIVE. Reading run counts out of
   the CPR archive would silently report "1 run" for a member with 400.
   ═══════════════════════════════════════════════════════════════════════════ */

const SPARK_LEN = 9;   // how many recent runs the sparkline shows

/**
 * Normalise Torn's OC status. Mirrors v5's normOcStatus — the API has used
 * 'successful', 'success', 'failure', 'failed' and 'fail', and anything
 * unrecognised must come back null rather than being guessed at.
 */
function ocOutcome(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'successful' || s === 'success') return 'successful';
  if (s === 'failure' || s === 'failed' || s === 'fail') return 'failure';
  if (s === 'expired' || s === 'expire') return 'expired';
  return null;
}

/**
 * Roster rows from the two archives.
 *
 * THE SHAPES HERE ARE THE REAL ONES, read out of v5's slimCrime(). An earlier
 * version guessed them from fixtures and produced a completely empty roster
 * against live data — the most expensive mistake in this rewrite so far, and
 * the reason fixtures must be derived from the writer, never invented:
 *
 *   ocArchive[id] = { id, name, difficulty, status, executed_at,
 *                     rewards: { money, respect, items, payout },
 *                     slots: [ { position, user_id, checkpoint_pass_rate } ] }
 *
 * Two things that are NOT in it and must not be invented:
 *   · `participants` — members live in `slots`, keyed by `user_id`
 *   · a per-member outcome — success belongs to the WHOLE crime (`status`).
 *     So a member's rate means "how often did the crimes I was in succeed",
 *     not "how often did I personally pass". Torn does not publish the
 *     latter, and implying it would blame one member for a crew's failure.
 *
 * @param {object} cprArchive  { [uid]: {name, slots: {[k]: {role, difficulty, cpr, ...}}} }
 * @param {object} ocArchive   see above
 * @param {object} names       uid -> name
 */
function rosterRows(cprArchive = {}, ocArchive = {}, names = {}, opt = {}) {
  const now = opt.now ?? Math.floor(Date.now() / 1000);

  /* Walk the OC archive once, oldest first, collecting per-member run history.
     Sorting here rather than per member keeps this O(n log n) instead of
     O(members × runs) — the archive can hold thousands of OCs. */
  const runsBy = new Map();
  const ocs = Object.values(ocArchive)
    .filter(o => o && Array.isArray(o.slots))
    .sort((a, b) => toNum(a.executed_at) - toNum(b.executed_at));

  for (const o of ocs) {
    // One outcome for the whole crime, shared by everyone who was in it.
    const outcome = ocOutcome(o.status);
    for (const s of o.slots) {
      const uid = s?.user_id == null ? null : String(s.user_id);
      if (!uid) continue;                    // an unfilled seat has no member
      const list = runsBy.get(uid) || [];
      list.push({
        ts: toNum(o.executed_at),
        // An OC nobody ran (expired) is not a failure by anyone — it is
        // excluded from the rate entirely rather than counted as a loss.
        outcome,
        role: s.position || null,
      });
      runsBy.set(uid, list);
    }
  }

  const uids = new Set([...Object.keys(cprArchive), ...runsBy.keys()]);

  return [...uids].map(uid => {
    const cpr = cprArchive[uid] || {};
    const slots = Object.values(cpr.slots || {});
    const runs = (runsBy.get(uid) || []).filter(r => r.outcome === 'successful' || r.outcome === 'failure');

    const passed = runs.filter(r => r.outcome === 'successful').length;
    const recent = runs.slice(-SPARK_LEN);

    return {
      uid,
      name: names[uid] || cpr.name || `#${uid}`,
      runs: runs.length,
      rate: runs.length ? passed / runs.length : null,
      cpr: avg(slots.map(s => toNum(s.cpr)).filter(n => n > 0)),
      best: slots.length ? Math.max(...slots.map(s => toNum(s.difficulty))) : null,
      role: topRole(slots, runsBy.get(uid) || []),
      spark: recent.map(r => (r.outcome === 'successful' ? 's' : 'f')).join(''),
      trend: trendOf(runs),
      last: runs.length ? now - runs[runs.length - 1].ts : null,
    };
  }).sort((a, b) => b.runs - a.runs || String(a.name).localeCompare(String(b.name)));
}

/**
 * Recent form against earlier form, as a signed fraction.
 *
 * Returns null rather than 0 when there is not enough history. Those are
 * different statements — "steady" and "we don't know yet" — and rendering
 * an unknown as a flat line claims something we cannot support.
 */
function trendOf(runs, span = SPARK_LEN) {
  if (runs.length < span * 2) return null;
  const rate = list => list.filter(r => r.outcome === 'successful').length / list.length;
  const recent = runs.slice(-span);
  const before = runs.slice(-span * 2, -span);
  return rate(recent) - rate(before);
}

/** The role a member plays most, preferring observed runs over the archive. */
function topRole(slots, runs) {
  const tally = new Map();
  for (const r of runs) if (r.role) tally.set(r.role, (tally.get(r.role) || 0) + 1);
  if (!tally.size) for (const s of slots) if (s.role) tally.set(s.role, (tally.get(s.role) || 0) + 1);
  if (!tally.size) return null;
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** Mean, or null for an empty set — never NaN, and never a misleading 0. */
function avg(list) {
  return list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null;
}

/**
 * Seats worth fixing: a high-weight role held below the CPR threshold.
 * Sorted by how much damage the gap is doing, not by how bad the CPR is —
 * a weak member in a low-weight seat is not the problem to solve first.
 */
function riskSeats(activeOcs = [], cprArchive = {}, names = {}, opt = {}) {
  const minCpr = opt.minCpr ?? 70;
  const minWeight = opt.minWeight ?? 20;
  const out = [];

  for (const oc of activeOcs) {
    for (const slot of oc.slots || []) {
      if (!slot.who) continue;                       // empty seats are a different problem
      const cpr = toNum(slot.cpr);
      const w = toNum(slot.w);
      if (!(cpr > 0) || cpr >= minCpr || w < minWeight) continue;
      out.push({
        uid: slot.uid, name: names[slot.uid] || slot.who,
        role: slot.role, cpr, w, oc: oc.name,
        impact: (minCpr - cpr) * w,
      });
    }
  }
  return out.sort((a, b) => b.impact - a.impact);
}

/* ═══════════════════════════════════════════════════════════════════════════
   WAR & CHAINS

   Record shape, from v5's mergeWarsPayload:
     { [warId]: { start, end, target, winner, factions:[{id,name,score,chain}] } }

   `end === 0` means the war has not finished. `winner` is a faction id, and
   it is compared as a STRING everywhere — Torn returns it as a number in some
   payloads and a string in others, and `4 === '4'` is false.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Torn ships lists as arrays (v2) or id-keyed objects (v1 leftovers).
 * Return [{id, ...}] either way — Object.values() would silently drop the ids,
 * which is how a war list can lose track of which war is which.
 */
function tornList(raw) {
  if (Array.isArray(raw)) return raw;
  return Object.entries(raw || {})
    .map(([id, v]) => (v && typeof v === 'object' ? { id, ...v } : { id, value: v }));
}

/** Split a war record into "us" and "them" from our own faction id. */
function sides(war, myFid) {
  const list = war?.factions || [];
  const me = String(myFid ?? '');
  return {
    us: list.find(f => String(f.id) === me) || {},
    them: list.find(f => String(f.id) !== me) || {},
  };
}

/** The war currently running, or null. */
function currentWar(warArchive = {}, myFid, opt = {}) {
  const now = opt.now ?? Math.floor(Date.now() / 1000);
  const live = tornList(warArchive)
    .filter(w => !toNum(w.end) || toNum(w.end) > now)
    .sort((a, b) => toNum(b.start) - toNum(a.start))[0];
  if (!live) return null;

  const { us, them } = sides(live, myFid);
  return {
    id: String(live.id),
    opponent: them.name || 'Unknown faction',
    oppId: them.id || null,
    us: toNum(us.score), them: toNum(them.score),
    target: toNum(live.target),
    // A war with a future start has not begun; one already running has.
    started: toNum(live.start) > 0 && toNum(live.start) <= now,
    startsAt: toNum(live.start),
  };
}

/** Finished wars, newest first. */
function warHistory(warArchive = {}, myFid, opt = {}) {
  const now = opt.now ?? Math.floor(Date.now() / 1000);
  const me = String(myFid ?? '');

  return tornList(warArchive)
    .map(w => {
      const { us, them } = sides(w, me);
      const ended = toNum(w.end) > 0 && toNum(w.end) <= now;
      // Compared as strings deliberately — see the header.
      const winner = w.winner === null || w.winner === undefined ? null : String(w.winner);
      return {
        id: String(w.id),
        opp: them.name || 'Unknown faction',
        start: toNum(w.start), end: toNum(w.end),
        us: ended ? toNum(us.score) : null,
        them: ended ? toNum(them.score) : null,
        result: !ended ? 'pending' : winner === null ? 'unknown' : winner === me ? 'won' : 'lost',
      };
    })
    .sort((a, b) => b.start - a.start);
}

/** Chain archive → display rows, longest-recent first. */
function chainRows(chainArchive = {}) {
  return tornList(chainArchive)
    .map(c => ({
      id: String(c.id),
      len: toNum(c.length ?? c.chain),
      respect: toNum(c.respect),
      start: toNum(c.start), end: toNum(c.end),
    }))
    .filter(c => c.len > 0)
    .sort((a, b) => b.end - a.end || b.start - a.start);
}

/* ═══════════════════════════════════════════════════════════════════════════
   ARMOURY

   From `?selections=utilities` — NOT `armory`, which is not a real selection,
   and NOT `temporary`, which is grenades and flashbangs.

   Shape: { ID, name, type, quantity, available, loaned, loaned_to }
   `loaned_to` is a COMMA-SEPARATED STRING of user ids, not an array.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Parse `loaned_to`. Tolerates a string, an array, empty, or absent. */
function loanHolders(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  return String(raw ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/** Current item stock. `available` is what can actually be given out now. */
function itemRows(gearCache = {}) {
  return (gearCache.items || []).map(i => ({
    id: String(i.ID ?? i.id ?? ''),
    name: i.name || `Item #${i.ID ?? i.id ?? '?'}`,
    type: i.type || 'Unknown',
    qty: toNum(i.quantity),
    // Total minus available is NOT always "on loan" — items get consumed too,
    // which is why both are shown rather than one being inferred.
    avail: toNum(i.available),
    loaned: toNum(i.loaned),
    holders: loanHolders(i.loaned_to),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Who currently holds what.
 *
 * Current holders come from the utilities payload — that is present-tense
 * truth. The news ledger only says when something went OUT; on its own it
 * cannot tell you whether it came back. Using it for "who has this" would
 * keep showing returned items forever.
 *
 * The ledger is still needed for `since`, which the utilities payload does
 * not carry.
 */
function loanRows(gearCache = {}, loanLedger = {}, names = {}, opt = {}) {
  const now = opt.now ?? Math.floor(Date.now() / 1000);
  const overdueAfter = (opt.overdueDays ?? 7) * 86400;

  /* Newest "X gave item to Y" event per (uid, item), for the since stamp.
     NESTED maps rather than a joined "uid|item" key: any separator can in
     principle appear in an item name, and picking one that cannot is how a
     literal NUL byte ended up in this file — invisible in an editor, and
     enough to make every tool treat the source as binary. Two maps have no
     separator to get wrong. */
  const outAt = new Map();                     // uid -> Map(itemName -> newest ts)
  for (const e of Object.values(loanLedger)) {
    if (!e || !e.uid || !e.item) continue;
    let byItem = outAt.get(e.uid);
    if (!byItem) outAt.set(e.uid, byItem = new Map());
    const prev = byItem.get(e.item);
    const ts = toNum(e.ts);
    if (prev === undefined || ts > prev) byItem.set(e.item, ts);
  }

  const rows = [];
  for (const item of itemRows(gearCache)) {
    for (const uid of item.holders) {
      const since = outAt.get(uid)?.get(item.name) ?? null;
      rows.push({
        uid, who: names[uid] || `#${uid}`,
        item: item.name,
        since,
        heldFor: since ? now - since : null,
        // Unknown age is not overdue. Flagging it would nag about items that
        // may have gone out an hour ago.
        overdue: since ? now - since > overdueAfter : false,
      });
    }
  }
  return rows.sort((a, b) => (b.heldFor ?? -1) - (a.heldFor ?? -1));
}

/**
 * Consumption over a window, counted from the armoury ledger.
 *
 * The utilities payload has NO usage field — it is a snapshot of stock, not a
 * history. (An earlier draft of this read `used30` off the item, which does
 * not exist and would have silently reported every item as unused.) Movement
 * counts therefore come from the armouryAction news ledger.
 *
 * KNOWN GAP: distinguishing "consumed" from "loaned out and returned" needs
 * the news-text parser, which is not written yet. Until it is, `used` counts
 * MOVEMENTS, which overstates consumption for reusable tools. `kind` is
 * honoured when present so the parser can drop in without touching this.
 *
 * @param {object} ledger  { [id]: {ts, item, kind?} }
 */
function itemUsage(gearCache = {}, ledger = {}, opt = {}) {
  const now = opt.now ?? Math.floor(Date.now() / 1000);
  const since = now - (opt.days ?? 30) * 86400;

  const moves = new Map();
  for (const e of Object.values(ledger)) {
    if (!e || !e.item || toNum(e.ts) < since) continue;
    if (e.kind && e.kind !== 'use') continue;      // honoured once the parser exists
    moves.set(e.item, (moves.get(e.item) || 0) + 1);
  }

  const rows = itemRows(gearCache).map(i => {
    const used = moves.get(i.name) || 0;
    return {
      ...i, used,
      // Out of stock is urgent. Low relative to the burn rate is a warning —
      // under about a week's supply at the current rate.
      tone: i.avail === 0 ? 'crit' : used > 0 && i.avail < used / 4 ? 'warn' : 'ok',
    };
  });

  const max = Math.max(1, ...rows.map(r => r.used));
  return rows.map(r => ({ ...r, share: r.used / max })).sort((a, b) => b.used - a.used);
}

/* ═══════════════════════════════════════════════════════════════════════════
   LIVE SESSION DATA — crimes in flight, the enemy roster, who is online

   None of this is in a persistent store, because none of it is worth keeping:
   it describes right now. It comes from the payload the dashboard already
   fetches (`faction?selections=crimes,members`) and from the two short-TTL
   caches the War Room maintains.

   These three are the last places the v6 UI was inventing data. Each one used
   to synthesise plausible-looking rows so the layout had something to draw —
   active crimes were the newest COMPLETED ones re-badged "READY", the war room
   was `50 + i * 7` for level and `1 + i * 0.6` for fair fight, and "members
   online" was really "members who ran an OC recently". All three rendered as
   confident fact. Now they read the real thing and return NOTHING when there
   is nothing, which the panes render as an honest empty state.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Crime states that mean "still in flight". Mirrors v5's ACTIVE set exactly. */
const ACTIVE_OC_STATES = new Set([
  'recruiting', 'planning', 'ready', 'blocked',
  'awaiting', 'initiated', 'executing', 'in progress', 'active',
]);

/** Statuses that stop a member taking part, so the crime cannot initiate. */
const BLOCKING_STATES = new Set(['hospital', 'jail', 'traveling', 'abroad']);

/** Short "2d 04h" / "18m" gap. Pure — the clock is always passed in. */
function shortGap(sec) {
  const s = Math.max(0, Math.round(toNum(sec)));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${String(h).padStart(2, '0')}h`;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

/**
 * Crimes currently in flight, as the Crimes ▸ Active cards want them.
 *
 * Reads the LIVE crimes payload, whose slot shape is different from the
 * archive's — live carries `user:{id,name}` and `position_info.label`, the
 * archive is slimmed to a bare `user_id` and `position`. Both are read, because
 * this same function must not break if it is ever handed an archived crime.
 *
 * `status` is the card's accent, and it reflects the crime's WORST real problem
 * rather than its phase — a "READY" crime with someone in hospital is not ready,
 * and colouring it green would say it was. The phase still shows as the badge.
 *
 * @param {object} liveCrimes  faction.crimes, id-keyed
 * @param {object} cprArchive  for role weight, and CPR where the slot omits it
 * @param {object} members     uid -> live member, for blocking status
 */
function activeCrimes(liveCrimes = {}, cprArchive = {}, names = {}, members = {}, opt = {}) {
  const now = opt.now ?? Math.floor(Date.now() / 1000);
  const critCpr = opt.critCpr ?? 60;

  return Object.entries(liveCrimes)
    .map(([id, oc]) => ({ id, ...oc }))
    .filter(oc => ACTIVE_OC_STATES.has(String(oc.status || '').toLowerCase()))
    .map(oc => {
      const raw = Array.isArray(oc.slots) ? oc.slots : Object.values(oc.slots || {});
      const slots = raw.filter(Boolean).map(s => {
        const uid = (s.user?.id ?? s.user_id) == null ? null : String(s.user?.id ?? s.user_id);
        const role = s.position_info?.label || s.position || 'Unknown';
        const rec = uid && cprArchive[uid]?.slots?.[`${(oc.name || '').toLowerCase()}|${role.toLowerCase()}`];
        const state = uid ? String(members[uid]?.status?.state || '').toLowerCase() : '';
        return {
          uid, role,
          who: uid ? (names[uid] || s.user?.name || `#${uid}`) : null,
          cpr: s.checkpoint_pass_rate ?? rec?.cpr ?? null,
          // Weight is recorded per run by recordCprHistory, so it is a stored
          // fact rather than a live lookup. 10 is the "no data" floor, not a guess
          // at importance — it keeps a weightless seat out of the risk list.
          w: rec?.weight ?? 10,
          blocked: BLOCKING_STATES.has(state),
          // A filled seat whose required item is not available is a hard blocker:
          // the crime cannot run until someone hands the item over.
          needsItem: Boolean(uid && s.item_requirement && s.item_requirement.is_available === false),
        };
      });

      const filled = slots.filter(s => s.who).length;
      const phase = String(oc.status || '').toLowerCase();
      const trouble = slots.some(s => s.who && (s.blocked || s.needsItem
                                    || (s.cpr != null && s.cpr < critCpr)));

      // Ready means ready. Every seat filled, nobody blocked, nothing missing.
      const status = trouble ? 'crit'
                   : filled === slots.length && slots.length ? 'ready'
                   : 'recruit';

      /* One timer, chosen by what the crime is actually waiting on. An open seat
         has no countdown at all, so saying "~5d" there would be invention —
         that case reads "N seats open", which is the truthful answer. */
      const at = toNum(oc.executed_at) > now ? toNum(oc.executed_at)
               : toNum(oc.ready_at) > now ? toNum(oc.ready_at) : 0;
      const time = at ? shortGap(at - now)
                 : toNum(oc.time_left) > 0 ? '~' + shortGap(oc.time_left)
                 : filled < slots.length ? `${slots.length - filled} open`
                 : 'Ready';

      return {
        id: String(oc.id ?? ''),
        name: oc.name || `OC #${oc.id ?? '?'}`,
        diff: oc.difficulty ?? '?',
        status, badge: (oc.status || 'active').toUpperCase(),
        time, filled, total: slots.length, slots,
      };
    })
    // Soonest first, and crimes with no timer last — they are waiting on people,
    // not on the clock, and belong under the ones about to fire.
    .sort((a, b) => (a.time === 'Ready' ? -1 : 0) - (b.time === 'Ready' ? -1 : 0)
                 || a.name.localeCompare(b.name));
}

/**
 * War Room targets: the enemy roster, with estimates attached where we have them.
 *
 * FFScouter figures are ESTIMATES and the row carries them as such — the pane
 * labels the whole table `est`. `since` is a countdown to the moment they become
 * attackable, which is the only thing anyone actually reads off this screen.
 *
 * @param {object} enemyCache  {at, fid, name, members:[{id,name,level,la,st}]}
 * @param {object} spyCache    {[uid]: {ff, bs}}
 * @param {Map|object} calls   targetId -> [{caller}] from the hit-call sheet
 */
function warRoomTargets(enemyCache = null, spyCache = {}, calls = null, opt = {}) {
  const now = opt.now ?? Math.floor(Date.now() / 1000);
  const callerOf = id => {
    if (!calls) return null;
    const q = typeof calls.get === 'function' ? calls.get(String(id)) : calls[String(id)];
    return q && q.length ? (q[0].caller || null) : null;
  };

  return (enemyCache?.members || []).map(m => {
    const spy = spyCache[String(m.id)] || {};
    const state = String(m.st?.state || '').toLowerCase();
    const until = toNum(m.st?.until);
    const out = until > now ? until - now : 0;
    return {
      uid: String(m.id), name: m.name || `#${m.id}`,
      lvl: toNum(m.level) || null,
      // May genuinely be absent — no FFScouter key, or not yet fetched. The pane
      // must show a dash, never a plausible-looking number.
      ff: spy.ff == null ? null : Number(spy.ff),
      est: spy.bs == null ? null : spy.bs,
      status: state === 'hospital' ? 'hosp' : state === 'jail' ? 'jail'
            : state === 'okay' ? 'ok' : (state || 'ok'),
      since: out ? shortGap(out) : '—',
      readyIn: out,
      called: callerOf(m.id),
    };
  })
  // Attackable soonest first — that is the question the pane exists to answer.
  .sort((a, b) => a.readyIn - b.readyIn || String(a.name).localeCompare(String(b.name)));
}

/**
 * Who is around right now, from the live members payload.
 *
 * Torn reports `last_action.status` directly ("Online"/"Idle"/"Offline"), so
 * this reads it rather than inferring presence from a timestamp. The old version
 * inferred it from how recently someone ran an OC, which is a completely
 * different question and was wrong for anyone who simply hadn't run one.
 *
 * Returns null when there is no live roster at all — the card then says so
 * instead of reporting a confident zero.
 */
function presence(members = {}, opt = {}) {
  const now = opt.now ?? Math.floor(Date.now() / 1000);
  const list = Object.entries(members).map(([k, m]) => ({ ...m, id: String(m?.id ?? k) }));
  if (!list.length) return null;

  const rank = { Online: 0, Idle: 1, Offline: 2 };
  const rows = list.map(m => {
    const la = String(m.last_action?.status || '');
    const ts = toNum(m.last_action?.timestamp);
    const st = String(m.status?.state || '').toLowerCase();
    return {
      uid: m.id, name: m.name || `#${m.id}`,
      // Fall back to the timestamp only when Torn omits the label.
      state: la || (ts && now - ts < 900 ? 'Online' : ts && now - ts < 3 * 3600 ? 'Idle' : 'Offline'),
      abroad: st === 'traveling' || st === 'abroad',
      hospital: st === 'hospital' || st === 'jail',
      okay: st === 'okay',
      level: toNum(m.level) || null,
      idleFor: ts ? now - ts : null,
    };
  }).sort((a, b) => (rank[a.state] ?? 3) - (rank[b.state] ?? 3)
                 || String(a.name).localeCompare(String(b.name)));

  return {
    total: rows.length,
    online: rows.filter(r => r.state === 'Online').length,
    idle: rows.filter(r => r.state === 'Idle').length,
    offline: rows.filter(r => r.state === 'Offline').length,
    abroad: rows.filter(r => r.abroad).length,
    hospital: rows.filter(r => r.hospital).length,
    // Able to act right now: not in hospital, not travelling, and at the keyboard.
    ready: rows.filter(r => r.okay && r.state === 'Online').length,
    rows,
  };
}

/** Coerce to a finite number. null/undefined/'' all become 0, not NaN. */
function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/* ═══════════════════════════════════════════════════════════════════════════
   VIEWS

   `S` is the real stores, read by ocmV6Refresh() through v5's own loaders.
   `V` is what the screens show, produced by the same derive functions the
   test suites cover. If the arithmetic is wrong, this panel is visibly wrong.
   ═══════════════════════════════════════════════════════════════════════════ */


/** Everything the screens read. Computed once per render pass, not per card. */
function computeViews(s) {
  const rows = ocRows(s.profitLedger, s.ocArchive);

  /* Payout matching needs OCs in its own shape, and needs to know which were
     paid natively — those must produce no claims at all. */
  const forMatching = Object.entries(s.ocArchive).map(([id, oc]) => ({
    id, name: oc.name, money: s.profitLedger[id]?.money || 0,
    executedAt: oc.executed_at,
    participants: Object.fromEntries(
      (oc.slots || []).filter(x => x.user_id != null)
        .map(x => [String(x.user_id), s.names[String(x.user_id)] || String(x.user_id)])),
    nativePaid: Boolean(oc.rewards?.payout?.paid_at),
  }));
  const match = matchPayouts(forMatching, s.payoutEvents, oc => splitFor(
    s.ocArchive[oc.id] || {}).pct);

  const roster = rosterRows(s.cprArchive, s.ocArchive, s.names, { now: s.now });
  const items = itemRows(s.gearCache);

  return {
    rows,
    money: moneyByScenario(rows),
    totals: moneyTotals(rows),
    roster,
    earnings: earningsByMember(match.claims, s.names),
    payouts: payoutRows(s, match),
    match,
    warNow: currentWar(s.warArchive, s.myFactionId, { now: s.now }),
    warPast: warHistory(s.warArchive, s.myFactionId, { now: s.now }),
    chains: chainRows(s.chainArchive),
    items,
    loans: loanRows(s.gearCache, s.loanLedger, s.names, { now: s.now }),
    usage: itemUsage(s.gearCache, s.loanLedger, { now: s.now }),
  };
}

/** Money › Payouts rows: newest OCs, with how we know they were paid. */
function payoutRows(s, match) {
  return Object.entries(s.ocArchive)
    .sort((a, b) => b[1].executed_at - a[1].executed_at)
    .slice(0, 25)
    .map(([id, oc]) => {
      const p = s.profitLedger[id] || {};
      const native = oc.rewards?.payout;
      const m = match.byOc[id];
      return {
        oc: oc.name, when: s.now - oc.executed_at, cash: p.money || 0,
        split: splitFor(oc).source === 'exact' ? splitFor(oc).pct : null,
        paid: Boolean(native?.paid_at) || Boolean(m?.full),
        by: native?.paid_by ? s.names[native.paid_by] : null,
        // null = Torn recorded it. A number = we inferred it from a give.
        confidence: native?.paid_at ? null
                  : m?.confidence === 'high' ? 0.95
                  : m?.confidence === 'likely' ? 0.75
                  : m?.confidence === 'partial' ? 0.4 : null,
      };
    });
}



/* ── View helpers ─────────────────────────────────────────────────────────
   Small reshapes the screens want that are not worth a derive function of
   their own. Anything with arithmetic worth testing belongs in derive.js,
   not here — the rule is that this file must never be the only place a
   number is computed. */

/** Per-crime performance. Success rate is over runs, not over members. */
function crimeStats() {
  const by = new Map();
  for (const oc of Object.values(S.ocArchive)) {
    const g = by.get(oc.name) || { name: oc.name, runs: 0, passed: 0, cprs: [], money: 0, weak: new Map() };
    g.runs++;
    /* Success belongs to the CRIME, not to a seat — Torn reports one status
       for the whole thing. A per-member pass/fail does not exist. */
    const outcome = ocOutcome(oc.status);
    if (outcome === 'successful') g.passed++;
    for (const seat of oc.slots || []) {
      const uid = seat.user_id == null ? null : String(seat.user_id);
      // On a failed crime we cannot know WHICH seat failed, so the weakest-seat
      // tally counts participation in failures, not blame for them.
      if (outcome === 'failure' && seat.position) {
        g.weak.set(seat.position, (g.weak.get(seat.position) || 0) + 1);
      }
      const cpr = seat.checkpoint_pass_rate
        ?? (uid && S.cprArchive[uid]?.slots?.[oc.name + '|' + seat.position]?.cpr);
      if (cpr) g.cprs.push(cpr);
    }
    g.money += S.profitLedger[oc.id]?.money || 0;
    by.set(oc.name, g);
  }
  return [...by.values()].map(g => {
    const worst = [...g.weak.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      name: g.name, runs: g.runs, rate: g.runs ? g.passed / g.runs : null,
      cpr: g.cprs.length ? Math.round(g.cprs.reduce((a, b) => a + b, 0) / g.cprs.length) : null,
      respect: Math.round(g.money / 1e6),
      money: g.money,
      weak: worst ? { role: worst[0], pct: Math.round((worst[1] / g.runs) * 100) } : null,
    };
  }).sort((a, b) => b.runs - a.runs);
}

/* Crimes in flight and the enemy roster are LIVE data — they describe right
   now, so nothing persists them and they arrive on `S.live`. Empty is the
   normal state outside a live session (and on first load), and the panes render
   that as an honest empty rather than a fabricated one. */
const activeOcs = () =>
  activeCrimes(S.live.crimes, S.cprArchive, S.names, S.live.members, { now: S.now });

const riskRows = () => riskSeats(activeOcs(), S.cprArchive, S.names);

/** Recent faction events, newest first. */
function activityFeed() {
  const out = Object.values(S.ocArchive)
    .sort((a, b) => b.executed_at - a.executed_at).slice(0, 5)
    .map(oc => {
      const first = (oc.slots || []).find(x => x.user_id != null);
      const who = first ? String(first.user_id) : null;
      return {
        i: '★', w: ago(S.now - oc.executed_at),
        t: `<b>${esc(oc.name)}</b> completed by ${
          esc(who ? (S.names[who] || '#' + who) : 'the crew')}`,
      };
    });
  const give = Object.values(S.payoutEvents).sort((a, b) => b.ts - a.ts)[0];
  if (give) out.splice(1, 0, {
    i: '💸', w: ago(S.now - give.ts),
    t: `Payout sent — <b>${money(give.amount)}</b> to ${esc(give.toName)}`,
  });
  return out.slice(0, 5);
}

/** War room targets — the real enemy roster, with FFScouter estimates attached
 *  where a key is configured and the batch has landed. */
const warRoomRows = () =>
  warRoomTargets(S.live.enemies, S.live.spies, S.live.calls, { now: S.now });

/** Deposits vs gives, per member. */
function fundsRows() {
  const by = new Map();
  const row = uid => by.get(uid) || { uid, name: S.names[uid] || `#${uid}`, deposited: 0, given: 0 };
  for (const d of Object.values(S.deposits)) {
    const r = row(d.fromId); r.deposited += d.amount; by.set(d.fromId, r);
  }
  for (const g of Object.values(S.payoutEvents)) {
    const r = row(g.toId); r.given += g.amount; by.set(g.toId, r);
  }
  return [...by.values()].sort((a, b) => (b.deposited + b.given) - (a.deposited + a.given));
}

/** Export catalogue. Row counts are real, so an empty store shows as empty. */
function exportRows() {
  const n = o => Object.keys(o || {}).length;
  return [
    { i:'🎯', n:'OC history',        s:'Every completed OC with seats, outcome, payout and item cost.', rows:n(S.ocArchive) },
    { i:'👥', n:'Member performance', s:'Runs, success rate, CPR and role history per member.',          rows:V.roster.length },
    { i:'💰', n:'Payout ledger',     s:'What was paid, to whom, by whom, and when.',                     rows:n(S.payoutEvents) },
    { i:'📊', n:'CPR archive',       s:'Observed crime-pass-rate history beyond Torn’s 100-OC window.',   rows:n(S.cprArchive) },
    { i:'⚔',  n:'War records',       s:'Ranked wars with scores, respect and outcome.',                   rows:n(S.warArchive) },
    { i:'🔗', n:'Chain reports',     s:'Per-chain hit counts, respect and bonus placements.',             rows:n(S.chainArchive) },
    { i:'🛡',  n:'Armoury movements', s:'Gives, retrievals and loans over time.',                          rows:n(S.loanLedger) },
    { i:'🏦', n:'Faction funds',     s:'Deposits and gives per member.',                                  rows:n(S.deposits) },
  ];
}

/** Seconds → a short human gap. */
function ago(sec) {
  if (sec == null) return '—';
  const m = Math.round(sec / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 48) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}

/**
 * Faction-level figures the Dashboard shows.
 *
 * Everything here is COUNTED from the stores, not asserted. That is the
 * difference that matters: the old mock declared `members: 48` and could
 * never disagree with itself, whereas this will visibly break if the roster
 * derive breaks.
 */
function faction() {
  const active = activeOcs();
  const rated = V.roster.filter(m => m.rate != null);
  /* Presence is LIVE — it comes from Torn's own last_action label on the members
     payload. It used to be inferred from how recently someone ran an OC, which
     answers a completely different question and was wrong for everyone who
     simply had not run one. null here means "no live roster", and the card says
     that rather than reporting a confident zero. */
  const seen = presence(S.live.members, { now: S.now });

  return {
    // The live roster is the truth about who is IN the faction. The archive
    // roster only knows who has ever run a crime, so it under-counts new members
    // and over-counts everyone who has left.
    members: seen ? seen.total : V.roster.length,
    knownMembers: V.roster.length,
    ocsRun: Object.keys(S.ocArchive).length,
    success: rated.length ? rated.reduce((n, m) => n + m.rate, 0) / rated.length : 0,
    openSlots: active.reduce((n, oc) => n + (oc.total - oc.filled), 0),
    inProgress: active.length,
    completed: Object.keys(S.ocArchive).length,
    unpaidCount: V.totals.unpaidCount,
    unpaidCash: V.totals.unpaidCash,
    itemCost: V.totals.cost,
    potentialRespect: Math.round(V.money.reduce((n, s) => n + s.runs * 25, 0)),

    // null, not 0 — "we don't know yet" and "nobody is online" are different
    // statements, and the Member Status card renders them differently.
    seen,
    freeMembers: (seen ? seen.rows : V.roster).filter(m => !active.some(
      oc => oc.slots.some(s => s.uid === m.uid))).length,

    // No live chain in fixture data — the Dashboard's "not chaining" panel is
    // the honest rendering of that, and the one worth exercising anyway.
    chaining: false,
    lastChain: ago(S.now - Math.max(...V.chains.map(c => c.end))),
  };
}


/* ═══════════════════════════════════════════════════════════════════════════
   DATA SEAM — the point of this whole prototype

   No page reads D directly. Every data-bearing block goes through bound(),
   which hands the renderer a FEED: the data plus how it got here.

       { state, data, synced, prov, need }

   Wiring the real script in means replacing feed() — one function — with
   reads from GM storage and the *_STATUS keys the syncs already write. Not
   one renderer below changes.

   The states exist because the real thing is asynchronous and allowed to
   fail. The suite's rule is that a pane NEVER goes blank: a permissions
   error must not look like an empty faction, and neither must a pane that
   simply hasn't loaded yet. bound() makes that structural instead of a thing
   each renderer has to remember.

     ok       data is here
     loading  a sync is in flight and nothing is cached
     error    the sync failed — say why, and what the user can do
     empty    it worked and there is genuinely nothing

   `need` names the API access a feed requires, so an error can say
   "needs faction API access (AA)" rather than "something went wrong".
   ═══════════════════════════════════════════════════════════════════════════ */
/* THE PORT CONTRACT. Every feed declares, in one place, what the real script
   must hand it. `store` and `status` are actual GMK keys from the live suite
   — not invented names — and `shape` is the record the renderer below already
   expects. Wiring the brains in is: for each row, read `store`, map it to
   `shape`. Nothing else needs deciding.

   `status` names the GMK key holding `'ok'` or the last error string, which is
   the convention every sync already writes (see syncWarData, syncAttacks).
   A null status means the feed cannot fail on its own — it is derived from
   data another feed already fetched, so it has no sync of its own to break. */
const FEEDS = {
  roster: {
    need:'Faction members', prov:'obs', synced:'2m ago',
    store:'CPR_ARCHIVE + OC_ARCHIVE + MEMBER_NAMES', status:null, sync:'recordCprHistory',
    // CPR_ARCHIVE keeps only the MOST RECENT entry per (member, OC, role) —
    // deliberately, so it does not bloat with repeat runs. That means it cannot
    // supply `runs`, `rate`, `spark` or `trend`: there is no run history in it.
    // Those four must come from OC_ARCHIVE. Only `cpr`, `role` and `best` are
    // answerable from CPR_ARCHIVE alone.
    derive:'cpr/role/best ← CPR_ARCHIVE · runs/rate/spark/trend ← OC_ARCHIVE',
    shape:'{ uid, name, runs, rate:0–1, cpr:0–100, best, role, spark:"sf…", trend:±0–1|null, last }',
    read:() => V.roster },
  crimes: {
    need:'Faction crimes', prov:'exact', synced:'2m ago',
    store:'OC_ARCHIVE', status:null, sync:'backfillOcHistory',
    shape:'{ name, runs, rate:0–1, cpr, respect, money, weak:{role,pct}|null }',
    read:() => crimeStats() },
  ocCards: {
    need:'Faction crimes', prov:'exact', synced:'2m ago',
    // NOT cached anywhere — this describes right now. It rides the payload
    // renderDashboard already fetches, so it costs no extra API call.
    store:'(live faction.crimes — not persisted)', status:null, sync:'renderDashboard',
    derive:'activeCrimes — live slots + CPR_ARCHIVE for weight',
    shape:'{ id, name, diff, status:"crit|ready|recruit", badge, time, filled, total, slots:[{uid,role,who,cpr,w,blocked,needsItem}] }',
    read:() => activeOcs() },
  risk: {
    need:'Faction crimes', prov:'obs', synced:'2m ago',
    store:'(derived from ocCards + CPR_ARCHIVE)', status:null, sync:'—',
    shape:'{ uid, name, role, cpr, w, oc }',
    read:() => riskRows() },
  money: {
    need:'Faction crimes', prov:'exact', synced:'2m ago',
    store:'PROFIT_LEDGER', status:null, sync:'saveProfitLedger',
    // VERIFIED against the real store. PROFIT_LEDGER is PER-OC:
    //   { [ocId]: {name, money, itemValue, respect, executedAt, cost, costItems} }
    // Every column below is an AGGREGATE the UI computes — none of them exist
    // in storage. Group by `name`, then:
    //   runs    = count of ocIds in the group
    //   gross   = Σ (money + itemValue)
    //   members = Σ (money × split)      split per the money model, NOT a flat %
    //   kept    = gross − members − Σ cost
    derive:'group PROFIT_LEDGER by name; see CLAUDE.md “the money model”',
    shape:'{ name, runs, gross, members, cost, kept }',
    read:() => V.money },
  activity: {
    need:'Faction news', prov:'exact', synced:'1m ago',
    store:'ACTIVITY_LOG', status:null, sync:'snapshotActivity',
    shape:'{ i:emoji, t:html, w:"2m ago" }',
    read:() => activityFeed() },
  warNow: {
    need:'Faction wars', prov:'exact', synced:'40s ago',
    store:'WAR_ARCHIVE', status:'WAR_STATUS', sync:'syncWarData',
    shape:'{ opponent, oppId, oppMembers, us, them, target, started, starts }',
    read:() => V.warNow },
  warPast: {
    need:'Faction wars', prov:'exact', synced:'40s ago',
    store:'WAR_ARCHIVE', status:'WAR_STATUS', sync:'syncWarData',
    shape:'{ id, opp, when, us, them, result:"won|lost|pending", respect, payout }',
    read:() => V.warPast },
  chains: {
    need:'Faction chains', prov:'exact', synced:'40s ago',
    store:'CHAIN_ARCHIVE', status:'CHAIN_STATUS', sync:'syncWarData',
    shape:'{ id, len, when, respect, best, bestHits, broke }',
    read:() => V.chains },
  warRoom: {
    need:'FFScouter', prov:'est', synced:'20s ago',
    store:'ENEMY_CACHE + SPY_CACHE', status:'ENEMY_STATUS', sync:'pollEnemyRoster',
    derive:'warRoomTargets — roster is exact, ff/est are FFScouter estimates',
    shape:'{ uid, name, lvl, ff:number|null, status:"ok|hosp|jail", since, readyIn, called:name|null, est }',
    read:() => warRoomRows() },
  items: {
    need:'Faction armoury', prov:'exact', synced:'5m ago',
    store:'GEAR_CACHE', status:'GEAR_STATUS', sync:'syncGearCache',
    shape:'{ id, name, type, qty, avail, loaned, used30 }',
    read:() => V.items },
  usage: {
    need:'Faction armoury', prov:'obs', synced:'5m ago',
    store:'ocs_gear_cache + ocs_loan_ledger', status:'ocs_gear_status', sync:'syncGearCache',
    derive:'itemUsage — counts ledger movements in the window',
    shape:'{ id, name, used, share:0-1, tone:"ok|warn|crit" }',
    read:() => V.usage },
  loans: {
    need:'Faction armoury', prov:'exact', synced:'5m ago',
    store:'LOAN_LEDGER', status:'LOAN_STATUS', sync:'syncArmoryActions',
    shape:'{ uid, who, item, since, oc, overdue }',
    read:() => V.loans },
  earnings: {
    need:'Faction crimes', prov:'obs', synced:'2m ago',
    store:'OC_ARCHIVE + PAYOUT_EVENTS', status:'PAYOUT_NEWS_STATUS', sync:'syncPayoutNews',
    // CORRECTED. PAYOUT_LEDGER is NOT this — it is only { [ocId]: {paid, ts} },
    // a leader-set flag with no per-member data whatsoever.
    //   earned = per-participant share from OC_ARCHIVE × split
    //   paid   = Σ PAYOUT_EVENTS amounts to that uid
    //   owed   = earned − paid, computed at render, never stored
    derive:'OC_ARCHIVE participants × split, reconciled against PAYOUT_EVENTS',
    shape:'{ uid, name, runs, earned, paid }',
    read:() => V.earnings },
  payouts: {
    // prov is 'est', NOT 'exact'. Torn does not record which OC a give-funds
    // transfer was for; matchGivesToOcs() INFERS it and carries a confidence.
    // PAYOUT_EVENTS is raw transfers: { [newsId]: {ts, fromId, fromName, toId,
    // toName, amount} } — there is no `oc` field to read.
    // The only authoritative signal is Torn's own rewards.payout.paid_at on the
    // crimes API; that is exact. Everything else here is inference and the UI
    // must not draw it as fact.
    need:'Faction crimes', prov:'est', synced:'2m ago',
    store:'PAYOUT_EVENTS + crimes rewards.payout', status:'PAYOUT_NEWS_STATUS',
    sync:'syncPayoutNews + matchGivesToOcs',
    derive:'infer OC↔give matches; carry the confidence into the UI',
    shape:'{ oc, when, cash, split:0–1|null, paid, by:name|null, confidence:0–1|null }',
    read:() => V.payouts },
  funds: {
    need:'Faction donations', prov:'exact', synced:'8m ago',
    store:'DEPOSIT_EVENTS', status:'DEPOSIT_STATUS', sync:'syncDepositFunds',
    shape:'{ uid, name, deposited, given }   // net is computed, never stored',
    read:() => fundsRows() },
  exports: {
    need:null, prov:null, synced:null,
    store:'(synthesised from the other stores)', status:null, sync:'—',
    shape:'{ i:emoji, n:name, s:description, rows }',
    read:() => exportRows() },
};

/** Prototype-only: forces every feed into one state so all the degraded
 *  renderings are reachable without breaking anything. This is the reason
 *  the states are worth building NOW rather than discovering them later. */
const forced = 'ok';   // real states come from *_STATUS keys

/* ─────────────────────────────────────────────────────────────────────────
   THE SWAP POINT — the only function that changes when the brains go in.

   Prototype: returns mock data, always 'ok'.
   Real script: replace the body with the commented version below. That is
   the entire port for the data layer; feed() and bound() stay as they are.

     function readFeed(f) {
       // A sync that failed wrote its reason here. 'ok' or absent means fine.
       const status = f.status ? String(GM_getValue(GMK[f.status], 'ok')) : 'ok';
       if (status !== 'ok') return { status: 'error', why: status };
       return { status: 'ok', data: f.read() };   // f.read() replaces f.mock
     }

   Note it returns `why` on failure. The renderer shows the AA hint from
   `need`, but the raw message is what makes a bug report useful, so it must
   survive this far even though nothing displays it yet.
   ───────────────────────────────────────────────────────────────────────── */
function readFeed(f) {
  return { status: 'ok', data: f.read() };
}

function feed(key) {
  const f = FEEDS[key];
  if (!f) return { state:'error', need:null, why:`No feed registered for "${key}"` };
  if (forced !== 'ok') return { ...f, state: forced, data: forced === 'empty' ? [] : null };

  const r = readFeed(f);
  if (r.status !== 'ok') return { ...f, state:'error', why:r.why, data:null };
  /* An empty result is a legitimate answer, not a failure — say so distinctly.
     "Empty" includes null, and that is not a nicety: currentWar() returns null
     when no war is running, this only tested `Array.isArray`, so the pane was
     handed null as if it were good data and the renderer died on `w.started`.
     A single-object feed with nothing to show is exactly as empty as [].  */
  const nothing = r.data == null || (Array.isArray(r.data) && !r.data.length);
  return { ...f, state: nothing ? 'empty' : 'ok', data: r.data };
}

/** Render a data-backed block. A pane physically cannot come out blank. */
function bound(key, render, opts = {}) {
  const f = feed(key);
  if (f.state === 'loading') return skeleton(opts.rows || 4);
  if (f.state === 'error')   return errnote(f, key);
  if (f.state === 'empty')   return empty(opts.icon || '📭',
    opts.emptyMsg || 'Nothing here yet',
    opts.emptySub || 'This synced fine — there is genuinely nothing to show.');
  return render(f.data, f);
}

/* ═══ HELPERS ════════════════════════════════════════════════════════════ */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Compact money. Precision SCALES with magnitude instead of being a flat 2dp:
 *  $694.00m was three characters of false precision — those trailing zeros are
 *  not information, and across a 7-column table they were a big part of why it
 *  needed a horizontal scrollbar. 100+ → 0dp, 10+ → 1dp, under 10 → 2dp. */
function money(n) {
  const v = Math.round(+n || 0), a = Math.abs(v), sg = v < 0 ? '-' : '';
  const fmt = (x, unit) =>
    sg + '$' + x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2).replace(/\.0+$/, '') + unit;
  if (a >= 1e9) return fmt(a / 1e9, 'b');
  if (a >= 1e6) return fmt(a / 1e6, 'm');
  if (a >= 1e3) return fmt(a / 1e3, 'k');
  return sg + '$' + a;
}
const pct = v => v == null ? '—' : Math.round(v * 100) + '%';
const num = n => (+n).toLocaleString();

/** Stable tile colour per uid. Saturation/lightness FIXED so white initials
 *  stay legible on every one, rather than depending on a contrast lottery. */
function monoColor(uid) {
  let h = 0; const s = String(uid);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360},38%,33%)`;
}
const initials = n => { const p = String(n||'').trim().split(/[\s_\-.]+/).filter(Boolean);
  return (p.length >= 2 ? p[0][0]+p[1][0] : String(n).slice(0,2)).toUpperCase(); };
const avatar = (uid, name) =>
  `<span class="av"><span class="av-mono" style="background:${monoColor(uid)}">${esc(initials(name))}</span></span>`;

/** Presence rows as dotted names. Offline is GREY, not red — being asleep is
 *  not a fault, and red is reserved for things that need acting on. */
const PRESENCE_DOT = { Online: 'green', Idle: 'yellow', Offline: 'grey' };
const presenceList = rows => rows.map(r =>
  `<div class="mrow" data-act="profile" data-arg="${esc(r.uid)}"
     title="${esc(r.state)}${r.abroad ? ' · abroad' : ''}">
     <span class="dot ${PRESENCE_DOT[r.state] || 'grey'}"></span>${esc(r.name)}
   </div>`).join('');

const cprCls  = v => v == null ? 'faint' : v >= 70 ? 'green' : v >= 60 ? 'yellow' : 'red';
const rateCls = v => v == null ? 'dim'   : v >= .85 ? 'green' : v >= .65 ? 'yellow' : 'red';
const spark = s => `<span class="spark">${[...s].map(c => `<i class="${c}"></i>`).join('')}</span>`;

/* ═══ COMPONENTS ═════════════════════════════════════════════════════════ */
const card = (title, body, opts = {}) => `
  <div class="card">
    ${title ? `<div class="card-h">
      <h3>${esc(title)}</h3>
      ${opts.small ? `<span class="small">${esc(opts.small)}</span>` : ''}
      ${opts.action ? `<span class="push"></span><a href="#" data-act="noop">${esc(opts.action)}</a>` : ''}
    </div>` : ''}
    <div class="card-b ${opts.pad || ''}">${body}</div>
  </div>`;

const stat = (label, value, ico, tone = '') =>
  `<div class="stat"><div class="stat-l">${esc(label)}</div>
   <div class="stat-v ${tone}">${value}</div><div class="stat-i">${ico}</div></div>`;

const kv = (k, v, cls = '') => `<div class="kv"><span class="k">${k}</span><span class="v ${cls}">${v}</span></div>`;

/** Donut. Pure SVG — no library, so it works offline and forever. */
function donut(percent, size = 150, stroke = 15) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<div class="donut" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#232c3a" stroke-width="${stroke}"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--accent)" stroke-width="${stroke}"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - percent)}"
        transform="rotate(-90 ${size/2} ${size/2})"/>
    </svg>
    <div class="donut-mid"><div class="donut-pct">${Math.round(percent*100)}%</div>
      <div class="donut-lbl">Participation</div></div>
  </div>`;
}

const empty = (i, m, s) => `<div class="empty"><div class="i">${i}</div><div class="m">${esc(m)}</div>${s?`<div class="s">${esc(s)}</div>`:''}</div>`;

/** Loading placeholder shaped like the content it stands in for, so the pane
 *  doesn't jump when the real rows arrive. */
const skeleton = (rows = 4) =>
  `<div class="skel">${Array.from({ length: rows },
    (_, i) => `<i style="width:${[100, 82, 91, 68, 95, 74][i % 6]}%"></i>`).join('')}</div>`;

/** A failed sync explains itself and offers the one action that helps.
 *  "needs faction API access (AA)" is a fixable problem; "error" is not. */
const errnote = (f, key) => `
  <div class="errnote">
    <span class="ei">⚠</span>
    <div>
      <div class="em">Couldn’t load this</div>
      <div class="es">${f.need
        ? `<b>${esc(f.need)}</b> needs faction API access (AA). Everything else on this page is unaffected.`
        : esc(f.why || 'The last sync failed.')}</div>
      <button data-act="retry" data-arg="${esc(key)}">Retry now</button>
    </div>
  </div>`;

/** Where a number came from. exact = Torn told us · obs = we measured it ·
 *  est = a third party guessed. Never dress an estimate as a measurement. */
const PROV_TITLE = {
  exact: 'Reported by Torn — authoritative',
  obs:   'Computed from our own recorded history',
  est:   'Third-party estimate, not measured',
};
const prov = t => t ? `<span class="prov ${t}" title="${esc(PROV_TITLE[t] || '')}">${t}</span>` : '';

const bar = (v, cls = '') =>
  `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(1, v)) * 100}%"></i></div>`;
const barrow = (label, value, v, cls = '') =>
  `<div class="barrow"><span class="bl">${label}</span><span class="bv">${value}</span>${bar(v, cls)}</div>`;

/** Sub-navigation. `counts` is optional and only shown when non-zero — a
 *  bare "0" next to a tab name reads as broken rather than as information. */
const subnav = (page, items, current) => `
  <div class="subnav">${items.map(t => `
    <button class="${t.id === current ? 'on' : ''}" data-act="sub" data-arg="${page}" data-arg2="${t.id}">
      ${esc(t.label)}${t.n ? `<span class="n">${num(t.n)}</span>` : ''}
    </button>`).join('')}</div>`;

/* ═══════════════════════════════════════════════════════════════════════════
   PAGES
   ═══════════════════════════════════════════════════════════════════════════ */

function pageDashboard() {
  const overview = card('Faction Overview', `<div class="stats">
    ${stat('Members', F.members, '👥')}
    ${stat('OCs Run', num(F.ocsRun), '🎯')}
    ${stat('Failed', num(Math.round(F.ocsRun * (1 - F.success))), '🛡')}
    ${stat('Success Rate', pct(F.success), '📈', 'green')}
  </div>`, { pad: 'tight' });

  /* Presence is live-only. With no members payload yet the card SAYS so —
     four confident zeroes would read as a dead faction. */
  const status = card('Member Status', F.seen
    ? `${kv('<span class="dot green"></span> Online', F.seen.online)}
       ${kv('<span class="dot yellow"></span> Idle', F.seen.idle)}
       ${kv('<span class="dot grey"></span> Offline', F.seen.offline)}
       ${kv('<span class="dot purple"></span> Abroad', F.seen.abroad)}`
    : empty('🕐', 'No live roster yet',
        'Presence comes from the members payload, which lands on the next refresh.'),
    F.seen ? {} : { pad: 'flush' });

  const exposure = card('Pending Exposure', `
    ${kv('Open slots', F.openSlots)}
    ${kv('Awaiting payout', F.unpaidCount)}
    ${kv('Owed to members', money(F.unpaidCash), 'green')}
    ${kv('Item cost to cover', money(F.itemCost), 'red')}
    <div class="kv-rule"></div>
    ${kv('Members free', F.freeMembers)}
    ${kv('Respect in flight', num(F.potentialRespect), 'green')}`);

  const activity = card('OC Activity', `
    <div class="donut-row">
      ${donut(.76)}
      <div class="donut-side">
        <div><div class="k">Completed</div><div class="v">${F.completed}</div></div>
        <div><div class="k">In Progress</div><div class="v">${F.inProgress}</div></div>
        <div><div class="k">Available</div><div class="v">${F.openSlots - 34}</div></div>
      </div>
    </div>`, { small: '(This Cycle)' });

  const war = card('War / Chaining', `
    <div class="banner${F.chaining ? '' : ''}">
      <div class="big">${F.chaining ? 'CHAIN LIVE' : 'FACTION NOT CHAINING'}</div>
      <div class="sub">Ready for Retals</div>
    </div>
    ${kv('Last Chain', F.lastChain, 'dim')}
    ${kv('Ranked War', `vs ${esc((V.warNow?.opponent || 'nobody'))}`)}
    ${kv('Score', `${(V.warNow?.us || 0)} : ${(V.warNow?.them || 0)}`, 'dim')}`);

  const feed = card('Recent Activity', bound('activity', rows =>
    rows.map(a => `<div class="feed"><span class="fi">${a.i}</span>
      <span class="ft">${a.t}</span><span class="fw">${esc(a.w)}</span></div>`).join(''), {
    icon: '📭', emptyMsg: 'Nothing has happened yet',
    emptySub: 'Completed crimes and payouts appear here as they are recorded.',
  }));

  const online = card('Members Online', F.seen
    ? `<div class="mcols">${presenceList(F.seen.rows.slice(0, 12))}</div>`
    : empty('🕐', 'No live roster yet', 'It arrives with the next data refresh.'),
    F.seen ? { action: 'View All' } : { pad: 'flush' });

  return `
    <div class="page-head">
      <span class="page-ico">🏠</span>
      <div><div class="page-title">Dashboard</div>
        <div class="page-sub">Faction overview and key statistics.</div></div>
    </div>
    <div class="grid g-2">${overview}${status}</div>
    <div class="grid g-3">${exposure}${activity}${war}</div>
    <div class="grid g-2e">${feed}${online}</div>`;
}

function activeCrimesPane() {
  /* Went straight to activeOcs() and joined the result, so an empty archive
     produced an empty string and the pane rendered as blank space — which reads
     as "the script is broken", not as "there is nothing to show". */
  return bound('ocCards', list => `<div class="grid g-3">${crimeCards(list)}</div>`, {
    icon: '🎯', emptyMsg: 'No crimes on record',
    emptySub: 'The OC archive is empty. It fills itself on the next background '
            + 'history pass, or immediately from Crimes ▸ Performance in the v5 UI.',
  });
}

function crimeCards(list) {
  return list.map(oc => {
    const acc = { crit:'var(--red)', ready:'var(--green)', recruit:'var(--accent)' }[oc.status];
    const chip = { crit:'yellow', ready:'green', recruit:'blue' }[oc.status];
    return card(oc.name, `
      <div class="kv" style="padding-top:0;border:none">
        <span class="chip">D${oc.diff}</span> <span class="chip ${chip}">${oc.badge}</span>
        <span class="v dim">${esc(oc.time)}</span>
      </div>
      <div class="kv" style="border:none;padding-bottom:14px">
        <div class="bar" style="flex:1"><span class="${oc.filled===oc.total?'green':''}" style="width:${oc.filled/oc.total*100}%"></span></div>
        <span class="v dim">${oc.filled}/${oc.total}</span>
      </div>
      <table><thead><tr><th>Role</th><th>Member</th><th class="num">Wgt</th><th class="num">CPR</th></tr></thead>
      <tbody>${oc.slots.map(s => `<tr>
        <td class="dim">${esc(s.role)}</td>
        <td class="strong">${s.who ? esc(s.who) : '<i class="faint">Open</i>'}</td>
        <td class="num ${s.w >= 25 ? 'yellow' : 'dim'}">${s.w}%</td>
        <td class="num b ${cprCls(s.cpr)}">${s.cpr != null ? s.cpr + '%' : '–'}</td>
      </tr>`).join('')}</tbody></table>`, { pad: 'tight' })
      .replace('class="card"', `class="card" style="border-top:2px solid ${acc}"`);
  }).join('');
}

function riskPane() {
  return card('Risk seats', bound('risk', rows => `
    <div class="note" style="margin:0 0 14px">A high-weight role held below the 70% CPR threshold.
      This is what loses OCs — fix these before filling anything else.</div>
    <div class="tablewrap"><table class="avatars">
      <thead><tr><th>Member</th><th>Crime</th><th>Role</th>
        <th class="num">Weight</th><th class="num">CPR</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="clickable" data-act="profile" data-arg="${r.uid}">
        <td class="strong"><span class="namecell">${avatar(r.uid, r.name)}<span class="nm">${esc(r.name)}</span></span></td>
        <td class="dim">${esc(r.oc)}</td><td class="dim">${esc(r.role)}</td>
        <td class="num yellow b">${r.w}%</td>
        <td class="num b ${cprCls(r.cpr)}">${r.cpr}%</td></tr>`).join('')}</tbody>
    </table></div>`), {
    icon: '✅', emptyMsg: 'No risk seats',
    emptySub: 'Every high-weight role is held by someone above the threshold.',
  });
}

function crimePerfPane() {
  return card('Performance by crime', bound('crimes', rows => `
    <div class="tablewrap"><table>
      <thead><tr><th>Crime</th><th class="num">Runs</th><th class="num">Success</th>
        <th class="num">Avg CPR</th><th class="num">Respect</th><th class="num">Money</th>
        <th>Weakest seat</th></tr></thead>
      <tbody>${rows.map(c => `<tr>
        <td class="strong">${esc(c.name)}</td>
        <td class="num dim">${c.runs}</td>
        <td class="num b ${rateCls(c.rate)}">${pct(c.rate)}</td>
        <td class="num ${cprCls(c.cpr)}">${c.cpr}%</td>
        <td class="num dim">${num(c.respect)}</td>
        <td class="num green">${money(c.money)}</td>
        <td class="${c.weak ? 'red' : 'faint'}">${c.weak
          ? `${esc(c.weak.role)} · ${c.weak.pct}%` : 'none'}</td>
      </tr>`).join('')}</tbody></table></div>
    <div class="note">Weakest seat is the role that failed most often in this crime — the
      single thing most worth fixing before running it again.</div>`), { small: 'obs' });
}

function pageCrimes() {
  const sub = curSub('crimes');
  const panes = { active: activeCrimesPane, risk: riskPane, perf: crimePerfPane };
  return pageHead('🎯', 'Organized Crimes', 'Active crews, open seats, and who is at risk.',
      `<span class="chip yellow">${F.openSlots} open slots</span>`)
    + subnav('crimes', subTabs().crimes, sub)
    + (panes[sub] || activeCrimesPane)();
}

function rosterPane() {
  return card('Roster', bound('roster', rows => `
    <div class="tablewrap"><table class="avatars">
      <thead><tr><th class="num">#</th><th>Player</th><th class="num">OCs</th>
        <th class="num">Success</th><th class="num">Avg CPR</th><th class="num">Best</th>
        <th>Top role</th><th>Last 10</th><th class="num">Trend</th><th class="num">Last run</th></tr></thead>
      <tbody>${rows.map((m, i) => `<tr class="clickable" data-act="profile" data-arg="${m.uid}">
        <td class="num ${i < 3 ? 'yellow b' : 'faint'}">${i + 1}</td>
        <td class="strong"><span class="namecell">${avatar(m.uid, m.name)}<span class="nm">${esc(m.name)}</span></span></td>
        <td class="num">${m.runs}</td>
        <td class="num b ${rateCls(m.rate)}">${pct(m.rate)}</td>
        <td class="num ${cprCls(m.cpr)}">${m.cpr}%</td>
        <td class="num">D${m.best}</td>
        <td class="dim ellipsis">${esc(m.role)}</td>
        <td>${spark(m.spark)}</td>
        <td class="num ${m.trend == null ? 'faint' : m.trend > .05 ? 'green' : m.trend < -.05 ? 'red' : 'dim'}">
          ${m.trend == null ? '—' : (m.trend > .05 ? '▲' : m.trend < -.05 ? '▼' : '–') + ' ' + Math.abs(Math.round(m.trend*100)) + '%'}</td>
        <td class="num dim">${esc(m.last)}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="note">Click any row for that member's full profile. Expired OCs are excluded from
      success rate — nobody ran them.</div>`), { small: 'obs' });
}

function activityPane() {
  return `<div class="grid g-2">
    ${card('Who is on', F.seen
      ? `<div class="mcols">${presenceList(F.seen.rows)}</div>
         <div class="note">Green is online, amber is idle, grey is offline — read straight
           from Torn's own last-action label, not inferred from OC activity. Only current
           faction members appear; Torn does not report this for anyone who has left.</div>`
      : empty('🕐', 'No live roster yet',
          'This needs the members payload, which arrives on the next data refresh.'),
      F.seen ? { small: `${F.seen.online} online` } : { pad: 'flush' })}
    ${card('Recent activity', bound('activity', rows =>
      rows.map(a => `<div class="feed"><span class="fi">${a.i}</span>
        <span class="ft">${a.t}</span><span class="fw">${esc(a.w)}</span></div>`).join('')),
      { small: 'exact' })}
  </div>`;
}

function pagePeople() {
  const sub = curSub('people');
  const panes = { roster: rosterPane, activity: activityPane };
  return pageHead('👥', 'People', 'Every player who has run an OC, ranked.',
      `<span class="chip">${V.roster.length} tracked</span>`)
    + subnav('people', subTabs().people, sub)
    + (panes[sub] || rosterPane)();
}

function moneyOverviewPane() {
  const m = V.totals;
  return `
    <div class="grid g-2">
      ${card('The split', `<div class="stats">
        ${stat('Faction kept', money(m.kept), '🏦', 'green')}
        ${stat('Gross', money(m.gross), '📊')}
        <!-- m.members, NOT m.paid — moneyTotals has no "paid" field, so this
             read undefined and money() turned it into a confident $0. -->
        ${stat('Paid out', money(m.members), '👤')}
        ${stat('Item cost', money(m.cost), '📦', 'red')}
      </div>`, { pad: 'tight' })}
      ${card('Awaiting payout', `
        <div class="banner alert">
          <div class="big">${money(F.unpaidCash)}</div>
          <div class="sub">${F.unpaidCount} OCs not yet paid</div>
        </div>
        <div class="note" style="margin-top:14px">Still with the faction, so "kept" is
          flattering by that much until you settle it.</div>`)}
    </div>
    ${card('What the faction actually keeps', bound('money', rows => `
      <div class="note" style="margin:0 0 14px"><b>Gross</b> = everything the OC produced.
        <b>To members</b> = cash × the split. <b>Kept</b> = what's actually left — the number that
        decides whether a crime is worth running. A huge-gross crime on a 90% split can keep less
        than a modest one at 50%.</div>
      <div class="tablewrap"><table>
        <thead><tr><th>Scenario</th><th class="num">Runs</th><th class="num">Gross</th>
          <th class="num">To members</th><th class="num">Cost</th>
          <th class="num">Kept</th><th class="num">Per run</th></tr></thead>
        <tbody>${rows.map(s => `<tr>
          <td class="strong">${esc(s.name)}</td>
          <td class="num dim">${s.runs}</td>
          <td class="num dim">${money(s.gross)}</td>
          <td class="num" style="color:var(--accent)">−${money(s.members)}</td>
          <td class="num yellow">−${money(s.cost)}</td>
          <td class="num b green">${money(s.kept)}</td>
          <td class="num green">${money(s.perRun)}</td></tr>`).join('')}</tbody>
      </table></div>`, {
      icon: '💰', emptyMsg: 'No money recorded',
      emptySub: 'The profit ledger is empty — it fills as completed OCs are seen.',
    }), { small: 'exact' })}`;
}

function earningsPane() {
  return card('Member earnings', bound('earnings', rows => `
    <div class="tablewrap"><table class="avatars">
      <thead><tr><th>Member</th><th class="num">Runs</th><th class="num">Earned</th>
        <th class="num">Paid</th><th class="num">Owed</th></tr></thead>
      <tbody>${rows.map(e => {
        const owed = e.earned - e.paid;
        return `<tr class="clickable" data-act="profile" data-arg="${e.uid}">
          <td class="strong"><span class="namecell">${avatar(e.uid, e.name)}<span class="nm">${esc(e.name)}</span></span></td>
          <td class="num dim">${e.runs}</td>
          <td class="num">${money(e.earned)}</td>
          <td class="num green">${money(e.paid)}</td>
          <td class="num ${owed ? 'red b' : 'faint'}">${owed ? money(owed) : '—'}</td></tr>`;
      }).join('')}</tbody></table></div>
    <div class="note"><b>Owed</b> is what a member has earned but not yet been paid. It is
      the same money as "awaiting payout" on Overview, split by person.</div>`), { small: 'exact' });
}

/** Paid status, honest about how it was arrived at. Torn's own record is the
 *  only exact signal; a give-funds match is inference and renders as such —
 *  same green, but hollow and captioned, so it can never be mistaken for a
 *  confirmed payout at a glance. */
function paidChip(p) {
  if (!p.paid) return '<span class="chip red">Unpaid</span>';
  if (p.confidence == null) return `<span class="chip green">Paid${prov('exact')}</span>`;
  return `<span class="chip green out" title="Inferred from a give-funds match — ${
    Math.round(p.confidence * 100)}% confidence. Torn did not record this payout.">Likely paid ${
    Math.round(p.confidence * 100)}%</span>`;
}

function payoutsPane() {
  return card('Which OCs have been paid', bound('payouts', rows => `
    <div class="tablewrap"><table>
      <thead><tr><th>Crime</th><th>Finished</th><th class="num">Cash</th>
        <th class="num">Split</th><th>Paid</th><th>By</th></tr></thead>
      <tbody>${rows.map(p => `<tr>
        <td class="strong">${esc(p.oc)}</td>
        <td class="dim">${esc(p.when)}</td>
        <td class="num">${money(p.cash)}</td>
        <td class="num ${p.split == null ? 'faint' : ''}">${
          p.split == null ? '~80%' : pct(p.split)}${p.split == null ? prov('est') : ''}</td>
        <td>${paidChip(p)}</td>
        <td class="${p.by ? 'dim' : 'faint'}">${p.by ? esc(p.by) : '—'}</td>
      </tr>`).join('')}</tbody></table></div>
    <div class="note"><b>Paid</b> is only certain when Torn itself recorded the payout${prov('exact')}.
      Otherwise it is <b>inferred</b>${prov('est')} by matching faction give-funds transfers to
      completed OCs — Torn does not record which OC a give was for, so a match is a best guess
      with a confidence, never a fact. A tilde on the split means the same thing: Torn recorded
      no percentage, so the figure is your configured fallback.</div>`), { small: 'mixed' });
}

function costsPane() {
  return card('What crimes cost to run', bound('money', rows => {
    const max = Math.max(...rows.map(x => x.cost), 1);
    return rows.slice().sort((a, b) => b.cost - a.cost).map(x =>
        barrow(esc(x.name), `${money(x.cost)} · ${money(x.cost / x.runs)}/run`,
          x.cost / max, 'yellow')).join('')
      + `<div class="note">Item cost is subtracted before "kept", so an expensive crime with a
         big gross can still be the worse one to run. Per-run is the figure to compare.</div>`;
  }, { icon: '📦', emptyMsg: 'No costs recorded',
       emptySub: 'The profit ledger is empty, so there is nothing to price.' }),
    { small: 'exact' });
}

function fundsPane() {
  return card('Deposits vs gives', bound('funds', rows => `
    <div class="tablewrap"><table class="avatars">
      <thead><tr><th>Member</th><th class="num">Deposited</th>
        <th class="num">Given out</th><th class="num">Net</th></tr></thead>
      <tbody>${rows.map(f => {
        const net = f.deposited - f.given;
        return `<tr class="clickable" data-act="profile" data-arg="${f.uid}">
          <td class="strong"><span class="namecell">${avatar(f.uid, f.name)}<span class="nm">${esc(f.name)}</span></span></td>
          <td class="num green">${money(f.deposited)}</td>
          <td class="num" style="color:var(--accent)">${money(f.given)}</td>
          <td class="num b ${net >= 0 ? 'green' : 'red'}">${net >= 0 ? '+' : ''}${money(net)}</td></tr>`;
      }).join('')}</tbody></table></div>
    <div class="note">This is faction-bank movement only. A negative net is not a debt — most
      of it is OC payouts flowing back out, which is exactly what should happen.</div>`),
    { small: 'exact' });
}

function pageMoney() {
  const sub = curSub('money');
  const panes = { overview: moneyOverviewPane, earnings: earningsPane,
                  payouts: payoutsPane, costs: costsPane, funds: fundsPane };
  return pageHead('💰', 'Money', 'What the faction produced, paid out, and actually kept.')
    + subnav('money', subTabs().money, sub)
    + (panes[sub] || moneyOverviewPane)();
}

/* ═══════════════════════════════════════════════════════════════════════════
   WAR CENTRE
   ═══════════════════════════════════════════════════════════════════════════ */
const pageHead = (ico, title, sub, right = '') => `
  <div class="page-head"><span class="page-ico">${ico}</span>
    <div><div class="page-title">${esc(title)}</div><div class="page-sub">${esc(sub)}</div></div>
    ${right ? `<span class="push"></span>${right}` : ''}</div>`;

function warOverviewPane() {
  /* Only the war CARD depends on there being a war. Wrapping the whole pane in
     bound('warNow') meant a quiet week blanked the chain card too, which has
     nothing to do with the war. Each card owns its own empty state. */
  const warCard = bound('warNow', w => card('Ranked war', `
      <div class="banner ${w.started ? 'alert' : ''}">
        <div class="big">${esc(w.opponent)}</div>
        <div class="sub">${w.started
          ? `${num(w.us)} — ${num(w.them)}`
          : `Starts ${esc(ago(S.now - w.startsAt))}`}</div>
      </div>
      <div style="margin-top:15px">
        ${kv('Target score', num(w.target))}
        <!-- No "their members" row: the war archive records scores and
             names, not roster sizes. A blank or a 0 there would look like
             an empty enemy faction rather than a figure we do not hold. -->
        ${kv('Status', w.started ? 'Live' : 'Scheduled', w.started ? 'green' : 'yellow')}
      </div>`, { small: 'exact' }), {
    icon: '🕊', emptyMsg: 'No ranked war',
    emptySub: 'Nothing scheduled or running. Past wars are under History.',
  });

  const chainCard = card('Chain', F.chaining
    ? `<div class="banner"><div class="big">Live</div></div>`
    : `<div class="banner alert"><div class="big">NOT CHAINING</div>
         <div class="sub">Last chain ${esc(F.lastChain)}</div></div>
       <div class="note" style="margin-top:14px">The watcher polls every 30s while this
         pane is open, and only then — Torn caches identical calls for about that long
         anyway, so polling harder buys nothing.</div>`);

  /* This card once held three bars reading 31/48, 39/48, 4/48 — literals, from
     a mock, labelled "obs". It was removed rather than dressed up, on the note
     that it could come back once the member list was really wired in. It is now,
     so these are counted from the live members payload. */
  const readiness = card('Readiness', F.seen
    ? barrow('Able to fight now', `${F.seen.ready} / ${F.seen.total}`,
             F.seen.ready / F.seen.total, 'green')
      + barrow('At the keyboard', `${F.seen.online + F.seen.idle} / ${F.seen.total}`,
               (F.seen.online + F.seen.idle) / F.seen.total)
      + barrow('In hospital or jail', `${F.seen.hospital} / ${F.seen.total}`,
               F.seen.hospital / F.seen.total, 'red')
      + `<div class="note">"Able to fight" means okay <b>and</b> online — someone asleep and
         someone hospitalised are both unavailable, for different reasons.</div>`
    : empty('🕐', 'No live roster yet', 'It arrives with the next data refresh.'),
    F.seen ? { small: 'exact' } : { pad: 'flush' });

  return `<div class="grid g-3">${warCard}${chainCard}${readiness}</div>`;
}

/** Past wars. Deliberately NOT repeated on the Overview pane — Overview is
 *  about the war you are in, this is about the ones you finished. */
function warHistoryPane() {
  return card('War history', bound('warPast', rows => `
    <div class="tablewrap"><table>
      <thead><tr><th>Opponent</th><th>When</th><th class="num">Us</th><th class="num">Them</th>
        <th class="num">Respect</th><th class="num">Payout</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td class="strong">${esc(r.opp)}</td>
        <td class="dim">${esc(r.when)}</td>
        <td class="num ${r.result === 'won' ? 'green b' : 'dim'}">${r.us == null ? '—' : num(r.us)}</td>
        <td class="num ${r.result === 'lost' ? 'red b' : 'dim'}">${r.them == null ? '—' : num(r.them)}</td>
        <td class="num ${r.respect > 0 ? 'green' : r.respect < 0 ? 'red' : 'dim'}">${
          r.respect == null ? '—' : (r.respect > 0 ? '+' : '') + num(r.respect)}</td>
        <td class="num ${r.payout ? 'green' : 'dim'}">${r.payout == null ? '—' : money(r.payout)}</td>
      </tr>`).join('')}</tbody></table></div>`), { small: 'exact', pad: 'flush' });
}

function warRoomPane() {
  return card('War room', bound('warRoom', rows => `
    <div class="note" style="margin:0 0 14px">Fair-fight and value figures are
      <b>estimates</b> from FFScouter${prov('est')} — they are not measured, and the UI
      never pretends otherwise. Calling a target is a message to your faction; the
      script never attacks for you.</div>
    <div class="tablewrap"><table>
      <thead><tr><th>Target</th><th class="num">Lvl</th><th class="num">FF</th>
        <th>Status</th><th>Called by</th><th class="num">Est. value</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td><div class="mem" data-act="profile" data-arg="${r.uid}">
          ${avatar(r.uid, r.name)}<span class="nm">${esc(r.name)}</span></div></td>
        <td class="num dim">${r.lvl ?? '—'}</td>
        <!-- FF and value are absent without an FFScouter key, or before the batch
             lands. A dash says so; a number would be an invention. -->
        <td class="num ${r.ff == null ? 'faint' : r.ff >= 2.5 ? 'green' : r.ff >= 1.5 ? 'yellow' : 'dim'}">${
          r.ff == null ? '—' : r.ff.toFixed(1) + '×'}</td>
        <td>${r.status === 'ok'
          ? '<span class="chip green">Attackable</span>'
          : `<span class="chip ${r.status === 'hosp' ? 'red' : 'yellow'}">${
              r.status === 'hosp' ? 'Hospital' : r.status === 'jail' ? 'Jail' : esc(r.status)}${
              r.since === '—' ? '' : ' ' + esc(r.since)}</span>`}</td>
        <td class="${r.called ? '' : 'faint'}">${r.called ? `🔒 ${esc(r.called)}` : '—'}</td>
        <td class="num ${r.est == null ? 'faint' : 'dim'}">${r.est == null ? '—' : esc(String(r.est))}</td>
      </tr>`).join('')}</tbody></table></div>`), { small: 'est', pad: 'flush' });
}

function chainsPane() {
  return card('Chain history', bound('chains', rows => `
    <div class="tablewrap"><table>
      <!-- Top hitter and how the chain ended are NOT in the chain archive —
           they would need the attack ledger cross-referenced per chain. The
           columns are gone rather than empty. -->
      <thead><tr><th>Chain</th><th>When</th><th class="num">Respect</th>
        <th class="num">Per hit</th><th>Lasted</th></tr></thead>
      <tbody>${rows.map(c => `<tr>
        <td class="strong">${num(c.len)}</td>
        <td class="dim">${esc(ago(S.now - c.end))}</td>
        <td class="num green">${num(c.respect)}</td>
        <td class="num dim">${c.len ? (c.respect / c.len).toFixed(2) : '—'}</td>
        <td class="dim">${c.end > c.start ? Math.round((c.end - c.start) / 60) + 'm' : '—'}</td>
      </tr>`).join('')}</tbody></table></div>`), { small: 'exact', pad: 'flush' });
}

function pageWar() {
  const sub = curSub('war');
  const panes = {
    overview: warOverviewPane, room: warRoomPane,
    chains:   chainsPane,      history: warHistoryPane,
  };
  return pageHead('⚔', 'War Centre', 'Ranked wars, chains, the war room and payout calculation.')
    + subnav('war', subTabs().war, sub)
    + (panes[sub] || panes.overview)();
}

/* ═══════════════════════════════════════════════════════════════════════════
   ARMOURY — owns loans and item status
   ═══════════════════════════════════════════════════════════════════════════ */
function itemsPane() {
  return card('Item status', bound('items', rows => `
    <div class="note" style="margin:0 0 14px"><b>Available</b> is what you can actually
      give out right now. Total minus available is not always "on loan" — items get used
      up too, which is why both columns are shown.</div>
    <div class="tablewrap"><table>
      <!-- No usage column here. Consumption is counted from the armoury
           ledger, not carried on the item, and it has its own pane — putting
           it here too would be the same number in two places. -->
      <thead><tr><th>Item</th><th>Type</th><th class="num">Total</th>
        <th class="num">Available</th><th class="num">On loan</th></tr></thead>
      <tbody>${rows.map(i => `<tr>
        <td class="strong">${esc(i.name)}</td>
        <td class="dim">${esc(i.type)}</td>
        <td class="num ${i.qty ? '' : 'red b'}">${i.qty}</td>
        <td class="num ${i.avail ? 'green' : 'red'}">${i.avail}</td>
        <td class="num ${i.loaned ? 'yellow' : 'faint'}">${i.loaned || '—'}</td>
      </tr>`).join('')}</tbody></table></div>`), { small: 'exact', pad: 'flush' });
}

function loansPane() {
  return card('Out on loan', bound('loans', rows => `
    <div class="tablewrap"><table>
      <thead><tr><th>Member</th><th>Item</th><th>Out for</th><th>For</th><th></th></tr></thead>
      <tbody>${rows.map(l => `<tr>
        <td><div class="mem" data-act="profile" data-arg="${l.uid}">
          ${avatar(l.uid, l.who)}<span class="nm">${esc(l.who)}</span></div></td>
        <td class="strong">${esc(l.item)}</td>
        <td class="${l.overdue ? 'red b' : 'dim'}">${esc(l.since)}</td>
        <td class="dim">${esc(l.oc)}</td>
        <td>${l.overdue ? '<span class="chip red">Overdue</span>' : ''}</td>
      </tr>`).join('')}</tbody></table></div>`), {
    small: 'exact', pad: 'flush',
  });
}

function usagePane() {
  /* Ordering, scaling and the warning tone all come from itemUsage() — the
     pane only chooses colours. Recomputing any of it here would put the same
     rule in two places, which is how the old suite's numbers drifted. */
  return card('Consumption, last 30 days', bound('usage', rows =>
    rows.map(i => barrow(
      esc(i.name), `${i.used} movement${i.used === 1 ? '' : 's'}`, i.share,
      i.tone === 'crit' ? 'red' : i.tone === 'warn' ? 'yellow' : '')).join('')
    + `<div class="note">Bars are scaled to the busiest item, not to stock. Red means
       none left; amber means under about a week at this rate.
       <b>Movements, not consumption</b> — separating a used-up material from a tool that
       went out and came back needs the armoury log parser, which is not written yet, so
       reusable tools read high here.</div>`), { small: 'obs' });
}

function pageArmoury() {
  const sub = curSub('armoury');
  const panes = { items: itemsPane, loans: loansPane, usage: usagePane };
  return pageHead('🛡', 'Armoury', 'What you own, who has it, and how fast it is going.')
    + subnav('armoury', subTabs().armoury, sub)
    + (panes[sub] || itemsPane)();
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════════════════════════ */
function pageExports() {
  return pageHead('⬇', 'Exports', 'Every dataset the suite holds, in whichever format you need.')
    + card('Datasets', bound('exports', rows => rows.map(x => `
        <div class="exp">
          <span class="xi">${x.i}</span>
          <div><div class="xn">${esc(x.n)}</div><div class="xs">${esc(x.s)}</div></div>
          <span class="xf">
            <button data-act="noop">CSV</button>
            <button data-act="noop">JSON</button>
            <button data-act="noop">HTML</button>
          </span>
        </div>`).join('')))
    + card('Why these formats', `
        <dl class="def">
          <dt>CSV</dt><dd>For a spreadsheet. One row per record, no nesting — the nested
            fields are flattened rather than dropped.</dd>
          <dt>JSON</dt><dd>The full structure, nothing flattened. Use this if you are
            feeding another tool.</dd>
          <dt>HTML</dt><dd>A styled, self-contained report you can send to someone who
            does not run the script.</dd>
        </dl>`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   LEGEND & ABOUT — the page that makes every other page legible
   ═══════════════════════════════════════════════════════════════════════════ */
function pageAbout() {
  return pageHead('ⓘ', 'Legend & About', 'What every number, colour and marker on these screens means.')
    + card('Where numbers come from', `
        <div class="note" style="margin:0 0 14px">This marker sits next to figures whose
          origin matters. It is the difference between a fact and a guess, and the suite
          will not blur it.</div>
        <dl class="def">
          <dt>${prov('exact')}</dt><dd>Reported by Torn itself. Authoritative — a payout
            percentage Torn recorded always beats whatever the local setting says.</dd>
          <dt>${prov('obs')}</dt><dd>Computed from history this script recorded itself.
            Real measurement, but only covers what it was running for.</dd>
          <dt>${prov('est')}</dt><dd>A third-party estimate, such as FFScouter. Useful for
            ranking targets, never treated as truth.</dd>
        </dl>`)
    + `<div class="grid g-2">
      ${card('Crime metrics', `<dl class="def">
        <dt>CPR</dt><dd>Crime Pass Rate — how likely this member is to pass this role.
          Shown as <span class="green">green ≥70</span>,
          <span class="yellow">amber 60–69</span>, <span class="red">red under 60</span>.</dd>
        <dt>Weight</dt><dd>How much that seat influences the whole crime. A weak member in a
          high-weight seat is the thing worth fixing.</dd>
        <dt>Success rate</dt><dd>Completed ÷ attempted, over the window you selected.</dd>
        <dt>Sparkline</dt><dd>The last nine runs, newest last.
          <span class="spark"><i class="s"></i><i class="s"></i><i class="f"></i><i class="s"></i></span>
          Filled is a pass, hollow is a fail.</dd>
      </dl>`)}
      ${card('Money', `<dl class="def">
        <dt>Gross</dt><dd>Everything the crime produced — cash plus the value of reward items.</dd>
        <dt>To members</dt><dd>Cash × the split percentage, counted only once Torn marks
          the OC paid.</dd>
        <dt>Kept</dt><dd>Gross − to members − item cost. The only figure that answers
          "was this worth running".</dd>
        <dt>Why not "net"</dt><dd>The old Net column was gross minus item cost — before
          anyone was paid. A "$313m net" crime on an 80% split really left about $62m.</dd>
      </dl>`)}
    </div>`
    + card('About', `
        <dl class="def">
          <dt>Version</dt><dd>UI prototype for v6.0 — standalone, fake data, no network.</dd>
          <dt>Scope</dt><dd>Everything here is advisory. The suite links to Torn's own
            pages and never performs a game action for you.</dd>
          <dt>Your data</dt><dd>Stored in your browser. There is no backend and nothing is
            sent anywhere.</dd>
        </dl>`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   MEMBER PROFILE — the drill-down every roster row opens
   ═══════════════════════════════════════════════════════════════════════════ */
function pageProfile(uid) {
  const m = V.roster.find(r => r.uid === uid);
  if (!m) return pageHead('👤', 'Unknown member', `No record for id ${esc(uid)}.`)
    + card('', empty('🔍', 'No record for that member',
      'They may have left the faction before this script started recording.'), { pad: 'flush' });

  const crimesFor = crimeStats().slice(0, 4);
  return `
    <button class="backbar" data-act="back">← Back</button>
    <div class="prof-head">
      ${avatar(m.uid, m.name)}
      <div><div class="prof-name">${esc(m.name)}</div>
        <div class="prof-sub">${esc(m.role)} · ${num(m.runs)} runs · last seen ${esc(m.last)}</div></div>
    </div>
    ${card('At a glance', `<div class="stats">
      ${stat('Runs', num(m.runs), '🎯')}
      ${stat('Success', pct(m.rate), '✅', rateCls(m.rate))}
      ${stat('CPR', m.cpr, '📊', cprCls(m.cpr))}
      ${stat('Best level', m.best, '⭐')}
    </div>`, { pad: 'tight', small: 'obs' })}
    <div class="grid g-2">
      ${card('Recent form', `
        <div style="font-size:26px;margin-bottom:10px">${spark(m.spark)}</div>
        ${kv('Last nine runs', `${[...m.spark].filter(c => c === 's').length} passed`)}
        ${kv('Trend', m.trend == null ? 'Not enough data'
          : (m.trend > 0 ? '+' : '') + Math.round(m.trend * 100) + '%',
          m.trend == null ? 'faint' : m.trend > 0 ? 'green' : m.trend < 0 ? 'red' : 'dim')}
        ${kv('Preferred role', esc(m.role))}`, { small: 'obs' })}
      ${card('Where they help most', crimesFor.map(c =>
        barrow(esc(c.name), `CPR ${c.cpr}`, c.cpr / 100,
          c.cpr >= 70 ? 'green' : c.cpr >= 60 ? 'yellow' : 'red')).join('')
        + `<div class="note">Ranked by this member's pass rate in each crime, not by
           what the crime pays.</div>`, { small: 'obs' })}
    </div>
    ${card('Not built yet', empty('🚧', 'Loans, payouts and war record',
      'Each needs its own store wired in — the layout above is the pattern they follow.'),
      { pad: 'flush' })}`;
}

/* ═══ APPEARANCE ═════════════════════════════════════════════════════════
   Theme = colour only. Layout = shape only. Keeping them independent is what
   makes "icons + colour-safe" possible without writing six more themes. */
const THEMES = [
  { id:'frostbite', name:'Frostbite',  sub:'The default. Cool blue on deep navy.',
    ramp:['#0d1117','#171d28','#222b39'], accent:'#2f8fed', trio:['#3fb950','#d4a017','#e05252'] },
  { id:'midnight',  name:'Midnight',   sub:'Deeper and softer. Easier for long sessions.',
    ramp:['#0a0e1a','#141b2e','#232c45'], accent:'#6a8fe8', trio:['#3fb950','#d4a017','#e05252'] },
  { id:'slate',     name:'Slate',      sub:'Neutral grey, no colour cast. Close to today’s suite.',
    ramp:['#121212','#1e1e1e','#2e2e2e'], accent:'#59a5d8', trio:['#7cba5c','#c9a227','#d75f5f'] },
  { id:'ember',     name:'Ember',      sub:'Warm. Amber accent instead of blue.',
    ramp:['#14100d','#211a16','#35291f'], accent:'#e08b3c', trio:['#86b34a','#e0b93c','#e0603c'] },
  { id:'contrast',  name:'Contrast',   sub:'Pure black, brighter text, heavier borders.',
    ramp:['#000000','#0d0d0d','#555555'], accent:'#4db8ff', trio:['#4ae08a','#ffd633','#ff6b6b'] },
  { id:'colorsafe', name:'Colour-safe', sub:'Red/green safe — good reads blue, critical reads orange.',
    ramp:['#0d1117','#171d28','#222b39'], accent:'#b088ff', trio:['#4d9bff','#ffc233','#ff7733'] },
];

const LAYOUTS = [
  { id:'compact', name:'Compact', sub:'990px with labels. Fits Torn’s own column.', rail:13, rows:5 },
  { id:'full',    name:'Full',    sub:'1490px. Needs a wide screen — breaks out of Torn’s column.', rail:17, rows:5 },
  { id:'icons',   name:'Icons only', sub:'990px, 60px rail. Labels appear on hover.', rail:6, rows:5 },
];

const swatch = t => `<div class="sw">
  ${t.ramp.map(c => `<i style="background:${c}"></i>`).join('')}
  <i class="gap"></i><i style="background:${t.accent}"></i>
  <i class="gap"></i>${t.trio.map(c => `<i style="background:${c}"></i>`).join('')}</div>`;

const layPrev = l => `<div class="lay">
  <div class="lay-side" style="flex-basis:${l.rail}px">${'<u></u>'.repeat(4)}</div>
  <div class="lay-main">${'<u></u>'.repeat(l.rows)}</div></div>`;

const optBtn = (o, on, act, prev) =>
  `<button class="opt ${on ? 'on' : ''}" data-act="${act}" data-arg="${o.id}">
     ${prev}<div class="opt-name">${esc(o.name)}</div><div class="opt-sub">${esc(o.sub)}</div></button>`;

function pageSettings() {
  return `
  <div class="page-head"><span class="page-ico">⚙</span>
    <div><div class="page-title">Settings</div>
      <div class="page-sub">Appearance now; API keys, CPR thresholds and payout splits when the data layer lands.</div></div></div>
  ${card('Theme', `<div class="opt-grid">${
    THEMES.map(t => optBtn(t, t.id === theme, 'theme', swatch(t))).join('')}</div>`)}
  ${card('Layout', `<div class="opt-grid">${
    LAYOUTS.map(l => optBtn(l, l.id === width, 'width', layPrev(l))).join('')}</div>`)}
  ${card('Data sources', storeReport(), { small: 'diagnostic' })}
  ${card('Not built yet', empty('🚧', 'Everything below is still the old script',
    'API key, sync cadence, CPR thresholds, member share by level, export defaults.'), { pad: 'flush' })}`;
}

/**
 * What is actually in storage, per store.
 *
 * Exists because of a real failure mode: an empty pane is ambiguous. It might
 * mean the archive has not been backfilled, or it might mean a derive function
 * is broken — and from the outside those look identical. Every version of this
 * panel so far has been debugged by guessing between them. This makes the
 * distinction readable: a store showing 0 records is the suite's data problem,
 * a store with records behind an empty pane is my bug.
 */
function storeReport() {
  const n = o => Object.keys(o || {}).length;
  const rows = [
    ['OC archive',      n(S.ocArchive),    'Crimes, Performance, Money, Dashboard'],
    ['Profit ledger',   n(S.profitLedger), 'Money — every figure on it'],
    ['CPR archive',     n(S.cprArchive),   'People roster, risk seats'],
    ['Member names',    n(S.names),        'Every name shown anywhere'],
    ['Payout events',   n(S.payoutEvents), 'Payouts, member earnings'],
    ['Deposits',        n(S.deposits),     'Money ▸ Funds'],
    ['Gear cache',      (S.gearCache.items || []).length, 'Armoury items and loans'],
    ['Armoury ledger',  n(S.loanLedger),   'Armoury usage, loan ages'],
    ['War archive',     n(S.warArchive),   'War overview and history'],
    ['Chain archive',   n(S.chainArchive), 'War ▸ Chains'],
  ];
  const dead = rows.filter(r => !r[1]).length;
  return `
    <div class="note" style="margin:0 0 14px">Record counts read straight from storage.
      A pane that is empty <b>and</b> whose store reads 0 is waiting on a sync, not broken —
      the OC archive in particular fills on a background history pass that can take a few
      minutes on first run. A pane that is empty while its store has records is a bug in
      this UI; that is worth reporting.</div>
    <div class="tablewrap"><table>
      <thead><tr><th>Store</th><th class="num">Records</th><th>Feeds</th></tr></thead>
      <tbody>${rows.map(([name, count, uses]) => `<tr>
        <td class="strong">${esc(name)}</td>
        <td class="num b ${count ? 'green' : 'red'}">${num(count)}</td>
        <td class="dim">${esc(uses)}</td></tr>`).join('')}</tbody>
    </table></div>
    ${dead ? `<div class="note"><b>${dead}</b> of ${rows.length} stores are empty. Those panes
      have nothing to draw yet — the v5 UI writes these, so leaving it running fills them.</div>` : ''}`;
}

const pageStub = (ico, title, sub) => `
  <div class="page-head"><span class="page-ico">${ico}</span>
    <div><div class="page-title">${esc(title)}</div><div class="page-sub">${esc(sub)}</div></div></div>
  ${card('', empty('🚧', 'Not built in the prototype yet',
    'Dashboard, Crimes, People and Money prove the design language first. Say which pane matters next.'), { pad: 'flush' })}`;

/* ═══ NAV + ROUTER ═══════════════════════════════════════════════════════
   There is no "Loans & Items" entry. Loans and item status live under
   Armoury — they were moved there in v4.0 precisely so one screen owns the
   question "where is our gear", and a second top-level entry would put the
   same numbers in two places. */
/* Badges are COUNTED, not declared. They were literals (67 / 5 / 84 / 1 / 3)
   carried over from the mock, so the rail confidently advertised 84 payouts
   next to an empty Money tab. A badge that cannot be wrong is not information.
   Zero is rendered as nothing at all — `.nav-badge:empty` hides it — because a
   "0" beside a menu item reads as broken rather than as calm. */
const navItems = () => [
  { id:'dashboard', ico:'🏠', label:'Dashboard' },
  { id:'crimes',    ico:'🎯', label:'Organized Crimes',
    badge: F.openSlots || '', attn: F.openSlots > 0 },
  { id:'people',    ico:'👥', label:'People',
    badge: riskRows().length || '', attn: riskRows().length > 0 },
  { id:'money',     ico:'💰', label:'Money',
    badge: F.unpaidCount || '', attn: false },
  { id:'war',       ico:'⚔',  label:'War Centre',
    badge: V.warNow ? 1 : '', attn: false },
  { id:'armoury',   ico:'🛡',  label:'Armoury',
    badge: V.loans.filter(l => l.overdue).length || '', attn: false },
  { id:'exports',   ico:'⬇',  label:'Exports' },
  { sep:true },
  { id:'settings',  ico:'⚙',  label:'Settings' },
  { id:'about',     ico:'ⓘ',  label:'Legend & About' },
];

/* Sub-tabs. Money deliberately has no "Exports" sub-tab — exporting is one
   screen for the whole suite, not a copy per section.

   Counts are COUNTED, like the rail badges. "Roster 48" sat beside an empty
   roster table in the first live test, which is worse than no count at all:
   it looks like the table failed rather than like the archive is empty. */
const subTabs = () => ({
  crimes:  [{ id:'active', label:'Active',   n: activeOcs().length },
            { id:'risk',   label:'Risk seats', n: riskRows().length },
            { id:'perf',   label:'Performance', n: crimeStats().length }],
  people:  [{ id:'roster', label:'Roster',   n: V.roster.length },
            { id:'activity', label:'Activity' }],
  money:   [{ id:'overview', label:'Overview' },
            { id:'earnings', label:'Member earnings', n: V.earnings.length },
            { id:'payouts',  label:'Payouts', n: V.payouts.length },
            { id:'costs',    label:'Costs' },
            { id:'funds',    label:'Funds' }],
  war:     [{ id:'overview', label:'Overview' }, { id:'room', label:'War room' },
            { id:'chains',   label:'Chains', n: V.chains.length },
            { id:'history',  label:'History', n: V.warPast.length }],
  armoury: [{ id:'items', label:'Item status', n: V.items.length },
            { id:'loans', label:'On loan',     n: V.loans.length },
            { id:'usage', label:'Usage' }],
});

const PAGES = {
  dashboard: pageDashboard,
  crimes:    pageCrimes,
  people:    pagePeople,
  money:     pageMoney,
  war:       pageWar,
  armoury:   pageArmoury,
  exports:   pageExports,
  settings:  pageSettings,
  about:     pageAbout,
};

let page = 'dashboard';
/** Per-page sub-tab. Keyed by page, so switching away and back returns you to
 *  the sub-tab you were on rather than resetting to the first one. */
const subOf = {};
const subsFor = p => (subTabs()[p] || []);
const curSub  = p => subOf[p] || subsFor(p)[0]?.id || null;

/** The member drill-down. It is a page-level MODE, not a modal: it replaces
 *  the body and keeps the shell, so the nav and browser back still work. */
let profileUid = null;

function go(id) {
  page = id; profileUid = null; render(); toTop();
}
function goSub(p, s) {
  subOf[p] = s;
  if (page !== p) { page = p; profileUid = null; }
  render(); toTop();
}
function openProfile(uid) { profileUid = uid; render(); toTop(); }
function closeProfile()   { profileUid = null; render(); toTop(); }

function toTop() {
  document.querySelector('.content')?.scrollTo?.({ top: 0 });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Stub. In the real script this re-runs the one sync that failed, not all of
 *  them — a retry that refetches everything is how you hit the rate limit. */
function retry(key) {
  const f = FEEDS[key];
  alert(`Prototype — no network.\n\nHere this would re-run just the "${f?.need || key}" sync,\n`
      + `not every sync. Refetching everything on a retry is how you\nburn the 100-call/minute budget.`);
}
/* ── Appearance state ─────────────────────────────────────────────────────
   Persisted, because a look you have to re-pick every page load isn't a
   preference. localStorage is the stand-in for GM_setValue; in the real
   script these become ocs_* keys. Both readers fall back to the default on
   an unknown id, so a renamed theme degrades instead of rendering unstyled. */
const LS = { theme: 'ocs_ui_theme', width: 'ocs_ui_width' };

/* THE STORAGE SEAM. Swap these two bodies for GM_getValue / GM_setValue and
   nothing else changes — the keys are already in the suite's `ocs_*` naming.
   GM storage is what survives in TornPDA, where localStorage is not reliably
   persistent, so the port is not optional.
       get: (k, d) => GM_getValue(k, d)
       set: (k, v) => GM_setValue(k, v)
   Both wrap in try/catch because storage can throw outright — Firefox private
   mode and a blocked-cookies TornPDA both do it, and a settings read must
   never be the thing that stops the UI from drawing. */
const Store = {
  get(k, dflt) { try { return localStorage.getItem(k) ?? dflt; } catch { return dflt; } },
  set(k, v)    { try { localStorage.setItem(k, v); } catch {} },
};

/** Read a stored choice, falling back if it names something that no longer
 *  exists — a renamed theme must degrade to the default, not render unstyled. */
const read  = (k, valid, dflt) => { const v = Store.get(k, dflt); return valid.includes(v) ? v : dflt; };
const write = (k, v) => Store.set(k, v);

let theme = read(LS.theme, THEMES.map(t => t.id), 'frostbite');
let width = read(LS.width, LAYOUTS.map(l => l.id), 'compact');

/* Both of these target #ocm-v6, never document.documentElement or body. Inside
   Torn we own one div; stamping an attribute or class on <html>/<body> would
   restyle Torn's own page along with ours. */
const APP = () => document.getElementById('ocm-v6');

/** Colour only. Never touches layout. */
function setTheme(id) {
  theme = THEMES.some(t => t.id === id) ? id : 'frostbite';
  // Frostbite IS #ocm-v6's own values, so it carries no attribute — that keeps
  // the default reachable even if every theme block were deleted.
  if (theme === 'frostbite') APP().removeAttribute('data-theme');
  else APP().setAttribute('data-theme', theme);
  write(LS.theme, theme);
  if (page === 'settings') render();   // repaint the ✓
}

/** Shape only: 'compact' (990px, labelled) | 'full' (1490px) | 'icons' (60px rail). */
function setW(mode) {
  width = LAYOUTS.some(l => l.id === mode) ? mode : 'compact';
  APP().classList.remove('compact', 'full', 'icons');
  // 'full' is the bare stylesheet, so it is the absence of a class, not a class.
  if (width !== 'full') APP().classList.add(width);
  for (const m of ['compact', 'full', 'icons'])
    document.getElementById('w-' + m)?.classList.toggle('on', m === width);
  write(LS.width, width);
  if (page === 'settings') render();
}

function render() {
  document.getElementById('nav').innerHTML = navItems().map(n => n.sep
    ? '<div class="nav-sec"></div>'
    : `<div class="nav-item ${n.id === page ? 'active' : ''}" data-act="go" data-arg="${n.id}" title="${esc(n.label)}">
         <span class="nav-ico">${n.ico}</span>
         <span class="nav-label">${esc(n.label)}</span>
         <span class="nav-badge ${n.attn ? 'attn' : ''}">${n.badge || ''}</span>
       </div>`).join('');
  // The profile REPLACES the page body but keeps the shell, so the nav still
  // shows where you are and clicking it takes you back out.
  document.getElementById('content').innerHTML = profileUid
    ? pageProfile(profileUid)
    : (PAGES[page] || PAGES.dashboard)();
}

/* ═══════════════════════════════════════════════════════════════════════════
   EVENT WIRING — one delegated listener on #ocm-v6

   There is not a single inline onclick in this file, and there must never be
   one. Inside Torn the script runs SANDBOXED (any @grant does that), so its
   functions do not exist on the page's own window — an inline handler in
   injected HTML is evaluated in page scope and silently finds nothing. The
   buttons would simply be dead, with no error worth noticing.

   Delegation also outlives innerHTML. Every render() replaces the entire
   content subtree; a listener bound to a button would die with it, whereas
   this one is bound to #ocm-v6 and keeps working for markup that does not exist
   yet. That is what lets a new pane become clickable by adding an attribute.

   Ports as-is: bind to #ocm-root instead of #ocm-v6 and nothing else changes.
   ═══════════════════════════════════════════════════════════════════════════ */
const ACTIONS = {
  go:      el => go(el.dataset.arg),
  sub:     el => goSub(el.dataset.arg, el.dataset.arg2),
  profile: el => openProfile(el.dataset.arg),
  back:    () => closeProfile(),
  retry:   el => retry(el.dataset.arg),
  theme:   el => setTheme(el.dataset.arg),
  width:   el => setW(el.dataset.arg),
  noop:    () => {},
};

/** Named rather than inline, because the userscript build attaches it at
 *  mount time (when #ocm-root's contents first exist) rather than at load. */
function onAppClick(e) {
  // closest(), not e.target — clicks land on the icon or label INSIDE the row,
  // and those children must count as clicks on the row itself.
  const el = e.target.closest('[data-act]');
  if (!el || !APP().contains(el)) return;
  const fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el);
}

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
 * right now. Crimes and members ride `OCM_LAST_CTX`, the context v5's
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
  /* Thunks, not bare references: `safe(loadSpyCache, …)` evaluates the
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
    root.innerHTML = "<aside class=\"side\">\n    <div class=\"brand\">\n      <div class=\"brand-mark\">❄</div>\n      <div class=\"brand-text\">\n        <div class=\"brand-name\">OC SUITE</div>\n        <div class=\"brand-sub\">CENTRAL COMMAND</div>\n      </div>\n    </div>\n    <nav class=\"nav\" id=\"nav\"></nav>\n    <div class=\"side-foot\">\n      <div title=\"Faction Online — 32 of 48\"><span class=\"dot green\"></span><span>Faction Online</span><b>32 / 48</b></div>\n      <div title=\"Next OC ready in 2d 04h\"><span class=\"dot yellow\"></span><span>Next OC</span><b>2d 04h</b></div>\n    </div>\n  </aside>\n\n  <div class=\"main\">\n    <div class=\"topbar\">\n      <div class=\"search\">\n        <span class=\"search-ico\">⌕</span>\n        <input placeholder=\"Search members, crimes, items…\">\n      </div>\n      <span class=\"push\"></span>\n      <button class=\"icobtn\" title=\"Pin\">📌</button>\n      <button class=\"icobtn\" title=\"Close\">✕</button>\n    </div>\n\n    <div class=\"content\" id=\"content\"></div>\n\n    <div class=\"foot\">\n      <span>OC Suite — Central Command v6.0-proto</span>\n      <span class=\"push\"></span>\n      <span>Fake data · prototype</span>\n    </div>\n  </div>";
    APP().addEventListener('click', onAppClick);
  }
  ocmV6Refresh();
  setTheme(theme);
  setW(width);
  render();
  return true;
}