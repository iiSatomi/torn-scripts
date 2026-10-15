# Torn Script Hub

For the complete operating/developer manual, see
[Torn Script Hub — complete reference](Torn-Script-Hub-docs.md).
The [illustrated examples](script-hub-examples.md) include three small scripts,
their source code, installable versions and actual hub screenshots.

**API Keys** manages one global key or named per-script assignments, with an
optional global fallback. See the [key manager guide](api-key-manager.md).

The universal hub adds a four-square Scripts icon beside Torn's sidebar mail,
events, and awards icons. It opens a dark grid of script menus. Each script has
its own tile; **More** shows its additional menus. Rows grow automatically as
compatible scripts register.

## Install and use

1. Install `script-hub/dist/Torn_Script_Hub.user.js` as a new userscript in your userscript
   manager or Torn PDA.
2. Update the scripts you use from the working copies listed below. The hub
   discovers their embedded adapters; installing the hub alone cannot add an
   adapter to an older installed script.
3. Reload Torn. Visit each page-specific script's page once so its shortcut is
   remembered. Scripts running on the current page say **On this page**; stored
   shortcuts say **Go to page**.
4. Click a tile to open its primary menu. Click **More** for settings or another
   menu. A page-specific shortcut navigates to that script's page and opens the
   chosen menu once it loads. If a script is disabled, the handoff expires with
   a message; remove obsolete shortcuts with **More → Forget shortcut**.

Existing script launch controls are retained. Small screens and touch layouts use
a floating Hub button at the lower left, even when Torn's sidebar is present.
Desktop layouts also use that button when no sidebar control row is available. Close
blocking script dialogs normally before using the sidebar again.

Clicking elsewhere on Torn keeps the hub open. Close it with **×**, Escape or
the hub launcher; unsaved settings still prompt before closing. Escape applies
when a hub control has focus, so Torn inputs keep their own keyboard behavior.
Escape first cancels an active move/resize or confirmation prompt.

## Settings submenus and pages

**Settings** lists one submenu per script. Select a script to see its name,
version and pages together; **Open full script settings** opens its existing
menu. OC Suite and Gym Planner also expose selected preferences directly in
the hub. Other connected scripts retain their original settings menu until
they supply modular pages.

**Hub preferences** controls the title, theme, accent, tile density, icon size,
columns and launcher placement. The Scripts tab includes search, categories
and favorites. Preference import/export includes hub appearance, window layout
and favorites. It excludes script settings, API keys, permissions and identities.
Unsaved form changes prompt before leaving; reset restores a draft, then Save
applies it.

Preference imports are ignored if their page is left or the hub restarts before
the file finishes loading. A browser-storage error is reported instead of a
successful save; the draft remains available to retry. If Torn removes the hub
window or launcher during a page update, the hub repairs its controls and keeps
mounted form drafts.

Script settings reflect the actual values returned after saving, including
values the script trims or clamps. Explicit closing cancels pending handoffs;
selecting another menu supersedes the previous request.

## Move and resize the window

Drag the header to move the hub, or its bottom-right handle to resize it.
**Lock** prevents movement and resizing; **Unlock** enables them again.
**Reset** restores the active screen profile's position, size and unlocked state.

In **Settings → Hub preferences**, choose last position, centered, a corner,
custom coordinates or fit screen. Width and height of `0` mean automatic size.
Desktop and small-screen profiles are saved separately. Small screens default
to fit screen; saved geometry is kept inside the current viewport.

For keyboard control, focus the header or resize handle and use arrow keys:
10 px per press, or 50 px with Shift. Escape cancels an active move or resize.
Moving the window keeps unsaved settings drafts intact.

Preference exports use version 2 and include both window profiles. Version 1
imports still work and receive the default window profiles.

![Hub window controls and layout settings](images/window-controls.png)

The optional `Torn_Script_Hub_Example.user.js` demonstrates two pages and text,
textarea, number, integer, password/secret, checkbox/toggle, select/radio,
range, color, date and time controls. Install it only to explore the controls
or copy its registration pattern. Its secret fields are for synthetic demo
values and stay in memory.

## Shared API keys

In **API Keys**, enter a key once and enable access separately for each script
you trust. Existing keys remain masked: replacement inputs are always blank.
Deleting a key or revoking access makes connected consumers fall back to their
own saved key, when one exists. OC Suite and Gym Planner support the shared
Torn key; other adapters can opt in as described below.

Saving or deleting one provider keeps another provider's unsaved input intact.
If an entry is rejected, Save remains available to retry. If key storage becomes
unavailable, the key page clears pending inputs, disables its controls and asks
you to reload Torn; scripts can still use their own key settings.

Shared keys and private identities use recognized desktop userscript-manager
storage, or native `PDA_storage` when available. Sharing is disabled if those
capabilities or WebCrypto are unavailable. PDA's GM compatibility/localStorage
is never used for the hub's central credentials or private identities.

The first hub public identity is pinned by each consumer, and access grants
pin the consumer's public identity. Requests and encrypted replies include
the script, current instance, provider, request and short expiry. Replay,
tampering and mismatched identities are rejected. This protects the event
transport from accidental plaintext exposure; installed scripts and the page
remain part of the user's trust environment. Storage namespaces alone do not
protect secrets from a malicious installed script or compromised page.

**Write-only script secret fields** requires a separate per-script opt-in.
This permits a newly entered personal fallback key to reach that script
through the encrypted adapter. Existing personal keys are never read back
into the hub. The script owns its manual key storage and API behavior.

## Updated working copies

| Script | File | Hub menus |
| --- | --- | --- |
| OC Suite Codex | `Torn_OC_Suite_Codex.user.js` | Suite, War, Consumables, Armoury, Settings |
| Gym Planner | `Torn Gym Planner-3.37.txt` | Planner, Plan, Setup, Help |
| Pickpocketing | `Torn_Pickpocketing_Colors_Status-Aware_2.1.user.js` | Targets, Insights, Settings |
| Property Manager | `Torn_Property_Manager.user.js` | Rentals, Upgrades, Profit |
| Blackjack Advisor | `Torn_Blackjack_Advisor.user.js` | Advisor |
| Banker Request | `Torn_Banker_Request.user.js` | Board, Request panel |
| War Tools | `Torn_War_Tools.user.js` | Settings, Mass callout menu |
| War Payout Report | `Torn War Payout Report-2.12.0.user.js` | Report |
| Faction Usage | `Frostbite Faction Usage Command (Leader).js` | Usage command, Settings |
| Usage Reporter | `Frostbite Faction Usage Command (Member).js` | Reporter |

Install only the tools you already use. The standalone War Payout Report and
Usage tools are optional if you use the versions inside OC Suite. The original
PurrfectCrime script and older/reference copies are not changed by the builder.

## Add another script

Bundle the `registerTornScriptMenu` function from
`script-hub/src/script-hub-adapter.cjs` inside your script's outer closure, omitting its
last CommonJS `module.exports` line. Then register your existing callbacks:

```js
registerTornScriptMenu(document, window, {
  id: 'my-tool',
  name: 'My Tool',
  icon: 'scripts',
  version: '1.0.0',
  url: 'https://www.torn.com/gym.php',
  actions: [
    { id: 'open', label: 'Open menu' },
    { id: 'settings', label: 'Settings' },
  ],
}, {
  open: () => openMyMenu(),
  settings: () => openMySettings(),
});
```

The hub needs no edit for a new registration. Keep IDs stable and unique.
Available icon IDs are `scripts`, `oc`, `gym`, `crime`, `property`, `cards`,
`bank`, `war`, and `usage`. Register menu-opening callbacks only, never actions
that submit requests, send messages, spend money, attack, or train.

A callback returning `false` means its UI is still mounting. Returning
`'navigate'` asks the hub to use the registered landing URL and retain the
chosen action, including on hash-only SPA routes. A callback resolving normally
reports success. Throws/rejections produce a generic error without copying
private error details. Do not return `false` if a menu was opened successfully.
Callbacks can return promises. The hub expects a response within two seconds.

Adapters work regardless of startup order. A newer same-ID adapter retires the
previous one and releases its listeners. Runtime ownership IDs are never saved
in the remembered catalog. The bridge is public page data and is not an
authorization mechanism.

Landing URLs must be HTTPS on `www.torn.com`, use a `.php` page, and include only
the supported `step`, `type`, and `sid` query parameters. Hash routes are allowed.
Names and labels render as text. The catalog is limited to 100 scripts and 20
actions per script; only public display metadata is stored. Storage failures
leave current-page menus usable. No API key, API requests, backend, remote-code
loader, or shared faction data is required by the hub.

### Add modular settings

Use the optional example as the complete bundled pattern. Extend the same
registration with public `pages: [{id, title}]` and `capabilities:
['settings']`, then pass a fifth `features` argument with `describePage(id)`,
`readSettings(id)` returning `{values, revision}`, and
`saveSettings(id, patch, revision)`. Do not register a second adapter for
settings. Keep actual schemas and values in the script until requested.

Bundle `script-hub-forms.cjs` and `script-hub-script-settings.cjs` to use
`createHubScriptSettings(pages, readValues, applyValues, credentialClient,
onSharedCredentialChange, saveSecrets)`. It validates typed fields, rejects
unknown/readonly/secret public writes, and detects changes made by native
settings between reads and saves. Settings saves must be harmless preferences;
buttons route only to known menu-opening actions.

Page schemas contain `id`, `title`, optional `description`, `sections` with
script-owned headings and `fields`, plus `actions`. Fields support labels,
defaults, numeric bounds/steps, string limits, required values, select/radio
options, `visibleWhen: {field, equals}`, readonly state and email/URL formats.
Existing secret values and secret defaults are omitted. IDs must be stable;
pages, schemas, controls and transport messages have bounded size.

For shared credentials, also bundle the platform/credential modules, create
a script-scoped `createHubCredentialClient`, and pass it in features. Declare
`capabilities: ['settings', 'credentials']`, `sharedProviders: ['torn']` and
a private `onSharedCredentialChange(providerId, value)` callback. Its value is
the decrypted key or `null` on denied/unavailable access. Prefer that in private
memory when reading a key; retain the script's existing personal-key fallback.
Never insert a shared key into the DOM, public settings, logs or exports.

To receive write-only fields, declare `secret-settings` and implement private
`saveSecrets(pageId, newValues)`. The hub requires the separate opt-in and sends
only freshly typed secret values through encryption. Optional `onAttach`,
`onDetach`, and `onDispose` hooks own script-specific lifecycle cleanup.

## Build

```text
node script-hub/tools/build-script-hub.cjs
```

This bundles the core/UI into `Torn_Script_Hub.user.js` and replaces the marked
adapter blocks in the ten working copies above. It preserves source outside
those blocks, with idempotent metadata grants for page-enabled targets, and
rebuilds deterministically. Use `--hub-only` when updating only
the hub and optional example. Modify `script-hub/src/script-hub-integrations.cjs` to maintain the existing
working-copy integrations. New third-party scripts can bundle the adapter
themselves without adding a builder target.

## Verification — 2026-10-12

- Node contracts: normalization, bounded metadata, registration order, duplicate
  ownership, error redaction, action routing and lifecycle cleanup.
- Real headless browser with controlled Torn fixtures: separate userscript
  worlds, late registration, ten-script grid, sidebar replacement, full-page
  and SPA handoff, action consumption, keyboard close/focus and repeat mounting.
- Responsive checks: 1920×1080, 390×844, 430×932, and 844×390, with screenshot
  inspection and viewport/overflow assertions.
- Complete working-copy script fixtures exercise the actual menu callbacks.
- Authenticated Torn: live mail/events/awards row insertion, four controls
  fitting the row, real Codex Settings opening, late registration, and close.
- Existing Codex diagnostics, lifecycle, consumables, memory and loan contracts,
  plus Gym header/singleton/style and Pickpocketing upgrade regressions.
- Modular controls: typed validation, dependent visibility, reset/drafts,
  simultaneous-save conflicts, long text readback and script-owned preferences.
- Credential pipeline in Brave with runtime-generated synthetic values: consent,
  rotation, revocation, pinned identities, encrypted write-only fields, public
  message redaction, hidden/PDA activity pause and cross-tab refresh.
- Authenticated Torn OC/Gym modular preference saves update their native controls;
  test values restored in an isolated empty GM store, with no real key read.
- Independent review corrected numeric-step precision, stale asynchronous vault
  startup and a legacy OC Consumables save that could copy a shared key.

Desktop storage/events and mobile viewport layouts have been verified. An
actual Torn PDA device has not been tested. The implementation feature-detects
tab-state helpers and pauses observation/automatic handoffs on hidden or
inactive tabs, following the workspace PDA reference and the
[official tab-state contract](https://github.com/Manuito83/torn-pda/blob/master/docs/webview/tab-state-handler.md).

```text
node --check script-hub/dist/Torn_Script_Hub.user.js
node script-hub/test/script-hub.test.cjs
node script-hub/test/script-hub-integrations.test.cjs
node test/war-menu-lifecycle.test.cjs
node script-hub/test/script-hub-forms.test.cjs
node script-hub/test/script-hub-credentials.test.cjs
node script-hub/test/script-hub-settings-rpc.test.cjs
node script-hub/test/script-hub-script-settings.test.cjs
node script-hub/test/script-hub-settings-lifecycle.test.cjs
node script-hub/test/script-hub-bindings.test.cjs
node script-hub/test/script-hub-example.test.cjs
node script-hub/test/browser/script-hub-forms.cjs
node script-hub/test/browser/script-hub-keys.cjs
node script-hub/test/browser/script-hub-settings.cjs
node script-hub/test/browser/script-hub.cjs
node script-hub/test/browser/script-hub-menus.cjs
node script-hub/test/browser/script-hub-live.cjs
```

The fixture browser tests create and close their own headless browsers. The
live test requires the authenticated dedicated Brave profile on CDP port 9222.
`node test/browser/launch-script-hub.cjs` starts that dedicated browser with
Windows occlusion disabled for testing while Codex is in front. Close that
exact dedicated instance after testing; never close all Brave processes.
