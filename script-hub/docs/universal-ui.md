# Universal script UI and themes

Implementation: Script Hub 1.4.6, shared UI contract version 1.

## User controls

Small screens and touch layouts use a persistent bottom-left floating launcher,
so a collapsed or offscreen Torn sidebar cannot hide the Hub entry point. Desktop
screens retain sidebar placement when a control row is available. Launcher
placement remains a Hub preference.
If PDA injects before the HTML element exists, Hub startup waits for DOM readiness
before claiming its singleton or mounting. Normal document-end startup stays
immediate; repeated early injections still create one Hub.

Builders encode literal smart quotes as JavaScript Unicode escapes. This preserves
the displayed text while surviving Torn PDA's source punctuation normalization,
which otherwise turns apostrophes in messages into JavaScript syntax errors.
Both managed distributions, optional examples, and generated adapter blocks use
the same build helper. Tests run PDA's actual preparation step before evaluation,
including S25 Ultra display scaling and reserved native toolbar space.
The shared UI factory also defers its initial visibility notification until after
construction, so PDA's initial inactive state cannot call a script while its
content is still being moved into the new shell.
Native PDA storage is captured from PDA's script-private lexical binding, with
priority over a page-global object. Native namespaces and credentials remain
private to their owning script.

The Hub **Themes** tab selects layout, palette, and appearance independently.
Background page updates and window remeasurement preserve the editor's scroll
position. **Keep editing**, including Escape from the discard prompt, returns
to the last edited control and position without losing the draft or open sections.
Frostbite, Workbench, and Torn native layouts share components and content slots.
Frostbite uses bundled crystal icons and restrained mountain artwork in its header.
Workbench uses editor tabs and an inspector; Torn uses compact game-style title
bars and script rows. Artwork inherits color roles and requires no remote assets.
Palettes provide separate light/dark colors. Custom colors cover surfaces, text,
accents, focus, selection, semantic statuses, and six chart categories. Spacing,
corner radius, and text scale are separate preferences.

Opening a script keeps the Hub open on desktop. On Torn PDA, a successful menu
launch dismisses the Hub without moving focus away from the opened tool. Failed
launches retain the Hub and its error message; unsaved drafts keep their guard.
Shared floating tools open maximized on PDA, including reopen and minimized
restore. They stay fitted after rotation. The normal restore control still
restores the saved rectangle, and embedded/legacy native content keeps its own
placement. PDA detection uses native storage/tab-state/HTTP capabilities rather
than screen width, so desktop touch and narrow browser windows retain desktop
opening behavior.

Shared floating tools and declared legacy
floating menus cooperate on window order; interacting with a window brings it
forward. Fixed modal backdrops move with their menu. Embedded content keeps its
page placement. Escape applies to the foreground window. Navigation to another
page still follows the existing route cleanup and pending-menu behavior.

Theme edits are previews until **Save theme**. **Cancel** restores the saved
appearance. Individual color reset and Reset colors affect the draft. Contrast
feedback does not silently reject the user's colors. Named themes are bounded
to 12; duplicate a theme by saving it under a different name.

Global presets and appearance-only JSON transfer are in **Saved themes and
transfer**. Imported files must match the versioned theme format and fit 32 KiB.
They cannot carry script data, credentials, or arbitrary CSS/JavaScript.

Use **Settings → script → Appearance** for a script override. Uncheck **Follow
Hub appearance**, edit, and save. Check it again and save to remove the override.
Only live appearance-capable adapters can save these settings. Stale revisions
are rejected; reopen the appearance page to read current settings.

## Adoption levels

Existing working copies receive a bundled appearance adapter. It applies tokens
and known color aliases to declared roots and exposes the script's own appearance
settings to the Hub. It preserves native DOM placement, drafts, business logic,
and private storage. Legacy inline styles and custom charts may still require
explicit migration. Selecting Workbench does not rebuild arbitrary legacy HTML.

The reusable UI factory supplies full shared shell behavior for newly adopted
interfaces. The generated **UI Showcase** demonstrates that factory without
network requests and works with or without the Hub. The older **Hub Example**
continues to demonstrate typed settings and synthetic secret controls.

## Build and module boundaries

- `src/script-hub-theme.cjs`: validated appearance preferences, concrete color
  roles, derived button contrast, token-only application, and shared CSS.
- `src/script-hub-theme-client.cjs`: global inheritance, script-owned overrides,
  visibility/PDA/media updates, bounded bridge fallback and listener cleanup.
- `src/script-hub-appearance-adapter.cjs`: declared legacy-root color adoption
  and bounded instance-specific settings transport.
- `src/script-hub-ui-kit.cjs`: reusable window/component factory.
- `src/script-hub-window-stack.cjs`: DOM-only ordering for shared windows and
  legacy floating owners; no script data crosses this boundary.
- `src/script-hub-theme-art.cjs`: bundled decorative vector marks and header art.
- `src/script-hub-themes-ui.cjs`: theme editor and appearance-only transfer.
- `src/script-hub-theme-styles.cjs`: Hub-specific layout and component styles.

The builder bundles these modules inside each participating script's private
closure. There is no runtime package installation or remote `@require`. Add new
script registrations in `src/script-hub-integrations.cjs`; keep one registration
per script. Do not edit generated files or marked adapter blocks by hand.

## Appearance contract

```js
const appearance = normalizeScriptUiTheme({
  version: 1,
  layout: 'frostbite',       // frostbite | workbench | torn
  palette: 'frostbite',      // independent from layout
  mode: 'system',           // system | dark | light
  density: 'comfortable',   // comfortable | compact
  radius: null,             // layout default, or 0..18 px
  fontScale: 1,             // 0.85..1.35
  colors: { light: {}, dark: { accent: '#69b5ff' } },
});
const concrete = resolveScriptUiTheme(appearance, matchMedia('(prefers-color-scheme: dark)').matches);
applyScriptUiTheme(element, appearance, concrete.mode === 'dark');
```

Unknown properties are discarded. Custom color values must be hex colors. Role
names are allowlisted; applying a theme changes CSS variables/data attributes,
not content DOM. Semantic values become `--tsui-background`, `--tsui-surface`,
`--tsui-accent`, and corresponding role variables. `--tsui-on-accent` is derived
for readable button text. Keep data/status meanings separate from decoration.

Global appearance uses the small public key `torn-script-hub:ui-theme:v1`.
It is non-secret preference data. Saved legacy Hub appearance is migrated so
consumers following the Hub retain the old selection. Per-script overrides
remain in the owning userscript's storage. Storage namespaces are not a security
boundary; credentials remain on the existing separate transport.

## UI factory

```js
const client = createScriptUiThemeClient({
  doc: document, win: window, scriptId: 'my-script',
  read: () => GM_getValue('my-ui-appearance', null),
  write: value => GM_setValue('my-ui-appearance', value),
});
const ui = createTornScriptUI({
  doc: document, win: window, id: 'my-script-main', title: 'My script',
  surface: 'floating', // or embedded with mount: an existing element
  applyTheme: applyScriptUiTheme,
  themeClient: client, ownsThemeClient: true,
  readLayout: () => GM_getValue('my-ui-layout', null),
  writeLayout: value => GM_setValue('my-ui-layout', value),
  sections: [{ id: 'home', label: 'Home', render(host) {
    const text = document.createElement('p');
    text.textContent = 'Script-owned content goes here.';
    host.append(text);
  } }],
  onVisibilityChange(active) { /* Pause/resume this script's nonessential work. */ },
  onSelect(id) { /* Release section-owned work before changing tools. */ },
  onClose() { /* Apply the script's explicit close/cancellation policy. */ },
});
```

Content renderers run once and may return a cleanup callback. `content`,
`settings`, and `inspector` are stable DOM slots for custom content. Methods:

- `select(id)`, `show()`, `hide()`, `close()`, `focus()`.
- `collapse(boolean)`, `minimize()`, `maximize()`, `restore()`.
- `setLocked(boolean)`, `reset()`, `setTheme(theme, optionalDark)`.
- `status(text)`, `notice(text, {kind})`, `task(options)`, `table(options)`.
- `getState()`, `destroy()`.

Inspect the factory's opening JSDoc and Showcase source for full helper shapes.
Geometry adapters store only versioned desktop/mobile position, size, lock,
collapse, and selected section. They support promises; initial UI mounting does
not wait for storage. Initial reads have a 1.5-second bound. Writes wait for that
read to settle, preserving saved geometry when a section is selected at startup.
User edits win independently for each screen profile, including changes made
before switching between desktop and mobile. Repeated setters with unchanged
values do not mark geometry as edited. Writes coalesce and pause when inactive.
Layout read/write failures produce bounded notices.

`onSelect(id)` runs for actual section changes, including restored selections.
Shared Close hides the surface and calls `onClose()` once; `hide()` does not call
the close callback. `close()` is also available programmatically.

Theme clients expose `subscribe(listener)`, returning an unsubscribe function.
The factory subscribes automatically, so inherited changes and script-owned
overrides update the window and minimized launcher together. Destroying a window
removes its subscription without stopping a caller-owned client. An optional
client `onChange` callback remains available for other script-specific uses.

Only the top visible floating window handles Escape. Focus/stack order and the
minimized launcher tray coordinate through versioned DOM attributes across
independently bundled scripts. Private callbacks and business data stay private.
Modeless windows allow focus on Torn. Keyboard movement/resizing and pointer
cancellation are supported. Mobile viewports clamp windows and preserve reachable
controls; optional embedded surfaces retain their native host.

Hiding/minimizing does not implicitly cancel business tasks. A script supplies
its own visibility and task callbacks. `destroy()` releases owned DOM, listeners,
observers, active gestures, and timers; shared theme clients remain owned by the
caller unless `ownsThemeClient` was set. Native PDA query handling is bounded,
capability-detected, and ignores stale replies after newer events or teardown.

## Verification

```text
node tools/check-managed-userscripts.cjs --browser
```

The full local workspace also checks integrations with its other script copies:

```text
node script-hub/tools/check.cjs --browser
```

The current checks include all three theme layouts at 1920x1080, 390x844,
430x932 and 844x390; save/cancel/import races; per-script inheritance/conflicts;
native draft preservation; storage failure; cross-bundle window ownership;
pointer/keyboard gestures; layout persistence; background reflow scroll stability;
repeated Keep editing/Escape and per-script Back focus restoration;
hidden/PDA/BFCache transitions;
and cleanup. These run in actual isolated Brave instances with synthetic page
fixtures and no Torn API requests. They do not establish actual-device PDA or
authenticated live-Torn compatibility.
