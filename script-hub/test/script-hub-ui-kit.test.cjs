'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const filename = path.join(__dirname, '../src/script-hub-ui-kit.cjs');
assert.ok(fs.existsSync(filename), 'shared UI kit must exist');
const { createTornScriptUI, scriptUiKitCss } = require(filename);
assert.equal(typeof createTornScriptUI, 'function');
assert.throws(() => createTornScriptUI({}), /document/);
assert.throws(() => createTornScriptUI({ doc: { createElement() {} }, win: {} }), /applyTheme/);
const css = scriptUiKitCss();
for (const layout of ['frostbite', 'workbench', 'torn']) assert.ok(css.includes(layout));
assert.ok(css.includes('--tsui-'));
assert.ok(css.includes('prefers-reduced-motion'));
assert.ok(!/require\s*\(/.test(createTornScriptUI.toString()), 'bundled runtime has no require');
const vm = require('node:vm');
const { normalizeHubEntry } = require('../src/script-hub-core.cjs');
const showcase = require('../src/script-hub-ui-showcase.cjs');
let registration;
vm.runInNewContext(showcase.body, {
  document: { createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {} }), body: { append() {} } },
  window: { addEventListener() {} },
  registerTornScriptMenu: (_doc, _win, metadata) => { registration = metadata; },
});
assert.ok(normalizeHubEntry(registration, 'https://www.torn.com'), 'showcase registration must be accepted by actual Hub core');
console.log('PASS UI kit injected dependencies, layouts and runtime bundling');
