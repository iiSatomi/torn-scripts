'use strict';

const metadata = `// ==UserScript==
// @name         Torn Script Hub Example
// @namespace    torn-script-hub
// @version      1.0.0
// @description  Optional local examples of script-labeled settings and write-only synthetic controls.
// @author       iSatomi
// @license      GPL-3.0
// @match        https://www.torn.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_info
// @run-at       document-end
// ==/UserScript==`;

function installHubExample() {
  const storageKey = 'torn-hub-example:settings:v1';
  const syntheticHelp = 'Enter synthetic demo text only, never a real API key or password. This value stays in memory and is cleared when leaving the page.';
  const pages = [
    {
      id: 'appearance', title: 'Example — Appearance and text',
      description: 'Torn Script Hub Example: harmless preferences demonstrating reusable typed controls.',
      sections: [
        { id: 'text', title: 'Example text controls', fields: [
          { id: 'customTitle', type: 'text', label: 'Example title', description: 'A local label used only by this demonstration.', default: 'My example', required: true, minLength: 1, maxLength: 60 },
          { id: 'notes', type: 'textarea', label: 'Example notes', description: 'Harmless example text only. Notes remain in this script’s settings.', default: 'Try a few controls, then Save or Reset defaults.', maxLength: 400 },
          { id: 'exampleEmail', type: 'text', label: 'Example email format', description: 'This validates formatting only; it sends no messages.', format: 'email', default: 'example@example.test', maxLength: 80 },
          { id: 'exampleUrl', type: 'text', label: 'Example URL format', description: 'This address is never opened or fetched by the example.', format: 'url', default: 'https://example.test/', maxLength: 160 },
        ] },
        { id: 'appearance', title: 'Example appearance controls', fields: [
          { id: 'scale', type: 'number', label: 'Example scale', unit: '×', min: 0.5, max: 2, step: 0.1, default: 1 },
          { id: 'columns', type: 'integer', label: 'Example column count', min: 1, max: 6, step: 1, default: 3 },
          { id: 'showDetails', type: 'checkbox', label: 'Show the dependent example field', default: false },
          { id: 'detailText', type: 'text', label: 'Dependent example text', default: 'Extra detail', maxLength: 80, visibleWhen: { field: 'showDetails', equals: true } },
          { id: 'compact', type: 'toggle', label: 'Example compact mode', default: false },
          { id: 'theme', type: 'select', label: 'Example theme', options: [{ value: 'system', label: 'Follow system' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }], default: 'system' },
          { id: 'alignment', type: 'radio', label: 'Example alignment', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }], default: 'left' },
          { id: 'iconSize', type: 'range', label: 'Example icon size', unit: 'px', min: 20, max: 40, step: 1, default: 28 },
          { id: 'accent', type: 'color', label: 'Example accent color', default: '#c7e67c' },
        ] },
      ],
      actions: [{ id: 'instructions', label: 'Open example instructions' }],
    },
    {
      id: 'controls', title: 'Example — Dates and synthetic secrets',
      description: 'Torn Script Hub Example: date/time preferences and write-only demonstration inputs. No reminders or network calls are scheduled.',
      sections: [
        { id: 'schedule', title: 'Example date and time controls', fields: [
          { id: 'exampleDate', type: 'date', label: 'Example date', default: '2026-10-12' },
          { id: 'exampleTime', type: 'time', label: 'Example time', default: '12:00' },
        ] },
        { id: 'synthetic', title: 'Synthetic controls — demonstration only', fields: [
          { id: 'demoPassword', type: 'password', label: 'Synthetic password input', description: syntheticHelp, maxLength: 256 },
          { id: 'demoSecret', type: 'secret', label: 'Synthetic secret input', description: syntheticHelp, maxLength: 256 },
          { id: 'demoPasswordPresent', type: 'checkbox', label: 'Synthetic password configured in memory', description: 'Presence only. The existing value is never returned to the hub.', readOnly: true },
          { id: 'demoSecretPresent', type: 'checkbox', label: 'Synthetic secret configured in memory', description: 'Presence only. The existing value is never returned to the hub.', readOnly: true },
        ] },
      ],
      actions: [{ id: 'instructions', label: 'Open example instructions' }],
    },
  ];
  const schemas = new Map(pages.map(page => [page.id, normalizeHubPage(page)]));
  const settings = new Map();
  const syntheticValues = new Map();
  let saved = {};
  try { if (typeof GM_getValue === 'function') saved = GM_getValue(storageKey, {}); } catch (_) {}
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  for (const page of schemas.values()) {
    const candidate = saved[page.id];
    const validated = validateHubSettings(page, candidate && typeof candidate === 'object' ? candidate : {});
    settings.set(page.id, validated.ok ? validated.values : validateHubSettings(page, {}).values);
  }
  function readValues(id) {
    const values = { ...settings.get(id) };
    if (id === 'controls') {
      values.demoPasswordPresent = syntheticValues.has('demoPassword');
      values.demoSecretPresent = syntheticValues.has('demoSecret');
    }
    return values;
  }
  function applyValues(id, values) {
    const validated = validateHubSettings(schemas.get(id), values);
    if (!validated.ok) throw new Error('Invalid example preferences.');
    settings.set(id, { ...settings.get(id), ...validated.values });
    // Only allowlisted nonsecret preferences enter this script's manager storage.
    try {
      if (typeof GM_setValue === 'function') {
        const result = GM_setValue(storageKey, Object.fromEntries(settings));
        if (result && typeof result.catch === 'function') result.catch(() => {});
      }
    } catch (_) { /* The private in-memory example remains usable. */ }
  }
  function saveSecrets(id, patch) {
    if (id !== 'controls' || !patch || typeof patch !== 'object' || Array.isArray(patch)
      || Object.keys(patch).some(key => !['demoPassword', 'demoSecret'].includes(key) || typeof patch[key] !== 'string' || patch[key].length > 256)) throw new Error('Invalid synthetic demo input.');
    for (const [key, value] of Object.entries(patch)) {
      if (value) syntheticValues.set(key, value); else syntheticValues.delete(key);
    }
  }
  const credentialClient = createHubCredentialClient({ storage: createHubCredentialStorage(getHubPlatformEnvironment(), 'torn-hub-example-client'), crypto: globalThis.crypto, scriptId: 'hub-example' });
  const features = createHubScriptSettings(pages, readValues, applyValues, credentialClient, undefined, saveSecrets);
  features.sharedProviders = [];

  let overlay = null, previousFocus = null;
  function closeInstructions() {
    if (!overlay) return;
    if (typeof overlay.close === 'function' && overlay.open) overlay.close(); else overlay.removeAttribute('open');
    if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
  }
  function openInstructions() {
    previousFocus = document.activeElement;
    if (!overlay) {
      overlay = document.createElement('dialog');
      overlay.id = 'tsh-example-instructions';
      overlay.setAttribute('aria-labelledby', 'tsh-example-instructions-title');
      overlay.style.cssText = 'box-sizing:border-box;width:520px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);overflow:auto;padding:20px;border:1px solid #555;border-radius:8px;background:#202020;color:#eee;font:16px/1.5 Arial,sans-serif';
      const title = document.createElement('h2'); title.id = 'tsh-example-instructions-title'; title.textContent = 'Torn Script Hub Example';
      const text = document.createElement('p'); text.textContent = 'Open Settings in Torn Script Hub, choose this example, then select either example page. Try the controls and save harmless preferences. The date and time controls schedule nothing. Use synthetic text only in the write-only demo inputs; no real shared keys are requested.';
      const storage = document.createElement('p'); storage.textContent = 'Ordinary example preferences use this script’s own manager storage when available, with a private memory fallback. Synthetic secret inputs are kept only in memory until you leave the page. Every action here stays local.';
      const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close instructions'; close.style.cssText = 'min-height:44px;font:inherit;padding:8px 16px';
      close.addEventListener('click', closeInstructions);
      overlay.addEventListener('cancel', event => { event.preventDefault(); closeInstructions(); });
      overlay.append(title, text, storage, close); document.body.append(overlay);
    }
    if (!overlay.open) {
      if (typeof overlay.showModal === 'function') overlay.showModal(); else overlay.setAttribute('open', '');
    }
    overlay.querySelector('button').focus();
    return true;
  }
  registerTornScriptMenu(document, window, {
    id: 'hub-example', name: 'Torn Script Hub Example', icon: 'scripts', version: '1.0.0', category: 'Examples',
    url: 'https://www.torn.com/index.php',
    actions: [{ id: 'instructions', label: 'Open example instructions' }],
    pages: pages.map(page => ({ id: page.id, title: page.title })),
    capabilities: ['settings', 'credentials', 'secret-settings'],
  }, { instructions: openInstructions }, features);
  window.addEventListener('pagehide', () => {
    syntheticValues.clear();
    if (overlay) overlay.remove();
    overlay = null; previousFocus = null;
  });
}

const body = '(' + installHubExample.toString() + ')();';
module.exports = { metadata, body };
