const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = path.join(__dirname, '../src/script-hub-themes-ui.cjs');
assert.ok(fs.existsSync(source), 'shared Themes editor and appearance transfer contract must exist');
const { normalizeScriptUiPresets, exportScriptUiTheme, importScriptUiTheme } = require(source);
const { normalizeScriptUiTheme } = require('../src/script-hub-theme.cjs');
const normalize = normalizeScriptUiTheme;
const theme = normalize({ layout: 'workbench', palette: 'frostbite', colors: { dark: { accent: '#eeaa55' } } });
const secret = 'synthetic-private-value-that-must-not-export';
const exported = exportScriptUiTheme({ ...theme, apiKey: secret }, normalize);
assert.equal(exported.includes(secret), false);
assert.deepEqual(importScriptUiTheme(exported, normalize), theme);
const stock=normalize({layout:'stock',palette:'stock',mode:'dark',colors:{dark:{accent:'#55aaaa'}}});
assert.equal(importScriptUiTheme(exportScriptUiTheme(stock,normalize),normalize).layout,'stock','Stock Mgr survives appearance transfer');
assert.throws(() => importScriptUiTheme(JSON.stringify({ version: 1, theme }), normalize));
assert.throws(() => importScriptUiTheme('x'.repeat(32769), normalize));
assert.throws(() => importScriptUiTheme(JSON.stringify({ kind: 'torn-script-ui-theme', version: 99, theme }), normalize));
assert.throws(() => importScriptUiTheme(JSON.stringify({ kind: 'torn-script-ui-theme', version: 1, theme: [] }), normalize));
const library = normalizeScriptUiPresets([
  { name: '  My blue  ', theme: { ...theme, secret } },
  { name: 'My blue', theme },
  { name: '', theme },
  ...Array.from({ length: 30 }, (_, i) => ({ name: 'Preset ' + i, theme })),
], normalize);
assert.equal(library.length, 12);
assert.equal(library[0].name, 'My blue');
assert.equal(JSON.stringify(library).includes(secret), false);
assert.equal(new Set(library.map(entry => entry.name)).size, library.length);
assert.deepEqual(normalizeScriptUiPresets(null, normalize), []);
console.log('PASS appearance-only import/export, schema versions, bounds and named presets');
