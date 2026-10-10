# Porting the v6 UI into the userscript

`ui/frostbite.html` is a standalone prototype: fake data, no network, opens in a
browser. This is the order to bring it into `Torn_OC_Suite.user.js`.

Run `node ui/check.js` after each step. 190 checks; several exist specifically to
catch the mistakes below.

---

## 0. Before touching anything

- Back up `Torn_OC_Suite.user.js`. There is no git repo — backups are the only
  safety net.
- `npm test` must be green first, so a later failure is unambiguously yours.
- **Bump `@version`.** Tampermonkey only fetches an update when the string
  changes. A perfect port with the old version number reaches nobody.

---

## 1. CSS → `GM_addStyle`

The `<style>` block goes into the existing `GM_addStyle(...)` call
(~line 3867). One rename does the whole job:

```
#app  →  #ocm-root
```

Everything is already scoped to `#app` — design tokens, the `data-theme`
attribute, the width classes. Nothing targets `:root`, `<html>` or `<body>`,
so nothing leaks onto Torn's own page. Checks under **Port boundary** enforce
this; if one fails after your edit, something escaped the container.

Two things to verify by eye, because CSS cannot be unit-tested here:

- **Duplicate selectors.** The suite has shipped a bug where new rules were
  silently overridden by older ones further down. `#app` is deliberately one
  single rule for this reason. Run the **Stylesheet hygiene** check after
  merging into the existing sheet — it will now be checking both stylesheets
  at once.
- **`color-mix()`** is used twice, in `.errnote`. Confirm it renders on
  TornPDA's webview; if not, substitute flat hex values.

## 2. Markup → the shell

The `<body>` contents (minus `.proto`, which is dev chrome and never ports)
become the shell injected into `#ocm-root`. Give that element
`id="ocm-root"` — the CSS, the theme attribute and the layout class all key
off it.

## 3. JS → the module body

Paste in this order, because later pieces reference earlier ones:

1. helpers — `esc money pct num monoColor initials avatar cprCls rateCls spark`
2. components — `card stat kv donut empty skeleton errnote prov bar barrow subnav`
3. `FEEDS` / `readFeed` / `feed` / `bound`
4. page functions
5. router — `go goSub openProfile closeProfile render`
6. `ACTIONS` + the delegated listener

**Watch for temporal dead zone.** `const` used above its definition parses
fine and throws at runtime, blanking the whole tab. This has happened here
before (`splitOf`, used ~700 lines early). `node --check` will not catch it.

## 4. Events — do not skip this

Bind the delegated listener to `#ocm-root` instead of `#app`. That is the
only change.

**Never reintroduce an inline `onclick`.** Any `@grant` puts the script in a
sandbox, so its functions are not on the page's `window`; an inline handler in
injected HTML evaluates in page scope, finds nothing, and the button is simply
dead with no error. There is a check (`not one inline handler survives`) that
fails if one reappears.

## 5. Data — the actual work

Replace `readFeed()`. It is the single swap point, and the real version is
written out in a comment directly above it:

```js
function readFeed(f) {
  const status = f.status ? String(GM_getValue(GMK[f.status], 'ok')) : 'ok';
  if (status !== 'ok') return { status: 'error', why: status };
  return { status: 'ok', data: f.read() };
}
```

Then, per feed, replace `mock: d => d.x` with `read: () => …`. Each entry in
`FEEDS` already declares:

- `store` — the real GMK key(s) to read
- `status` — the GMK key holding `'ok'` or the last error string
- `sync` — the function that populates it
- `shape` — the exact record the renderer expects

A check validates that every GMK key cited actually exists in the userscript,
so the contract cannot drift into fiction.

Delete `const D = {…}` last. While it is still there, the **Data state**
toggle keeps working, which is the fastest way to confirm a newly-wired feed
degrades properly.

## 6. Settings

Swap the two `localStorage` calls in `Store`:

```js
get: (k, d) => GM_getValue(k, d),
set: (k, v) => GM_setValue(k, v),
```

Keys are already `ocs_*`. Nothing else changes.

---

## The one open decision

The prototype re-renders **everything** through one `render()` that rewrites
`#content`. The real script keeps every pane in the DOM and toggles `.active`
on `.ocm-tab[data-tab]` / `.ocm-tab-pane#ocm-pane-X` — the decision that let
the v5.3 redesign leave all 29 tab tests untouched.

The prototype has not felt the cost yet because nothing auto-refreshes. Under
the real 60s refresh, a full `render()` wipes open `<details>`, expanded rows
and scroll position, and orphans Torn's `[title]` tooltips.

**Recommended:** keep the page-function structure, but mount each page into
its own persistent `.ocm-tab-pane#ocm-pane-X`, and have the refresh re-render
only the visible pane. Existing renderers and tests keep their hooks; the
page functions do not change. Reuse `openDetailKeys`/`restoreOpenDetails` and
call `clearStaleTooltips()` after each pass.

Decide this before step 3 — it shapes the router, and nothing else.

---

## Deliberate structural choices — don't "fix" these

- **No "Loans & Items" nav entry.** Loans and item status live under Armoury;
  they were moved there in v4.0 so one screen owns "where is our gear". A
  second entry puts the same numbers in two places.
- **Money has no Exports sub-tab.** Exporting is one screen for the whole
  suite.
- **War Overview does not repeat War History.** Overview is the war you are
  in; History is the ones you finished.
- **`--tx-faint` is decoration-only** and below AA on purpose. The lowest tier
  allowed to carry information is `--tx-muted`. A check enforces this by
  asserting every rule using `--tx-faint` matches a decorative selector.
- **`--green`/`--yellow`/`--red` are semantic slots, not hues.** The
  colour-safe theme puts blue in `--green` and orange in `--red`. They should
  be renamed `--good`/`--warn`/`--crit` during this port — the matching
  `.green`/`.red` markup classes are why it has not happened yet.
