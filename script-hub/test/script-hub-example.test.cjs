const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { randomBytes, createHash, webcrypto } = require('node:crypto');
const base = path.resolve(__dirname, '../..');
const { metadata, body } = require('../src/script-hub-example.cjs');
const read = file => fs.readFileSync(path.join(base, file), 'utf8');
const hash = file => createHash('sha256').update(read(file)).digest('hex');
assert.equal(typeof metadata, 'string');
assert.equal(typeof body, 'string');
new vm.Script(body);
for (const grant of ['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_info']) assert.match(metadata, new RegExp('@grant\\s+' + grant + '(?:\\s|$)'));
assert.match(metadata, /@name\s+Torn Script Hub Example/);
assert.match(metadata, /@match\s+https:\/\/www\.torn\.com\/\*/);
assert.match(metadata, /@run-at\s+document-end/);

// --hub-only also works in a managed-release checkout with no consumer copies.
// Preserve both absence and contents; the isolated fixture below covers adapters.
const targets = require('../src/script-hub-integrations.cjs').targets;
const productionState = file => fs.existsSync(path.join(base, file)) ? hash(file) : null;
const productionHashes = new Map(targets.map(target => [target.file, productionState(target.file)]));
execFileSync(process.execPath, [path.join(base, 'script-hub/tools/build-script-hub.cjs'), '--hub-only'], { cwd: base, stdio: 'pipe' });
const output = path.join(base, 'script-hub/dist/Torn_Script_Hub_Example.user.js');
assert.ok(fs.existsSync(output), 'the builder must generate the optional example beside the hub');
const bundle = fs.readFileSync(output, 'utf8');
new vm.Script(bundle);
assert.ok(bundle.startsWith(metadata));
const firstHash = hash('script-hub/dist/Torn_Script_Hub_Example.user.js');
execFileSync(process.execPath, [path.join(base, 'script-hub/tools/build-script-hub.cjs'), '--hub-only'], { cwd: base, stdio: 'pipe' });
assert.equal(hash('script-hub/dist/Torn_Script_Hub_Example.user.js'), firstHash, 'example generation is deterministic');
for (const [file, before] of productionHashes) assert.equal(productionState(file), before, '--hub-only preserves ' + file);

// Exercise real generation against an isolated filesystem boundary: metadata
// changes must be limited to the two eligibility grants and stay idempotent.
const fixtureFile = path.join(base, 'example-build-fixture.user.js');
const generated = new Map([[fixtureFile, '// ==UserScript==\n// @name Fixture\n// @version 7.0\n// @match https://www.torn.com/*\n// @grant GM_getValue\n// @grant GM_setValue\n// ==/UserScript==\n(function () {\n})();\n']]);
const fixtureFs = { ...fs,
  readFileSync: (file, encoding) => generated.has(file) ? generated.get(file) : fs.readFileSync(file, encoding),
  writeFileSync: (file, value) => generated.set(file, value),
};
const fixtureTarget = { file: 'example-build-fixture.user.js', id: 'example-fixture', name: 'Fixture', icon: 'scripts', url: 'https://www.torn.com/index.php', actions: [['instructions', 'Instructions', 'return true;']], pages: [{ id: 'settings', title: 'Settings' }] };
const buildFixture = () => vm.runInNewContext(read('script-hub/tools/build-script-hub.cjs'), {
  __dirname: path.join(base, 'script-hub/tools'), process: { argv: [] }, console: { log() {} },
  require: id => id === 'node:fs' ? fixtureFs : id === '../src/script-hub-integrations.cjs' ? { targets: [fixtureTarget], reveal: '' } : id === '../src/script-hub-example.cjs' ? { metadata, body } : require(id),
});
buildFixture();
const firstFixture = generated.get(fixtureFile);
new vm.Script(firstFixture);
const header = firstFixture.match(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/)[0];
assert.deepEqual([...header.matchAll(/@grant\s+(\S+)/g)].map(match => match[1]), ['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_info']);
assert.match(header, /@version 7\.0/);
assert.match(header, /@name Fixture/);
buildFixture();
assert.equal(generated.get(fixtureFile), firstFixture, 'rebuilding pages does not duplicate grants or adapter code');

const modules = ['forms', 'credentials', 'platform', 'script-settings'].map(name => read('script-hub/src/script-hub-' + name + '.cjs').replace(/^module\.exports[^\n]+$/m, ''));
const stored = new Map(), events = new Map();
let registration, registrations = 0;
const context = {
  crypto: webcrypto, TextEncoder, URL, document: {},
  window: { addEventListener: (name, callback) => events.set(name, callback) },
  GM_info: { scriptHandler: 'Tampermonkey' },
  GM_getValue: (key, fallback) => stored.has(key) ? JSON.parse(JSON.stringify(stored.get(key))) : fallback,
  GM_setValue: (key, value) => stored.set(key, JSON.parse(JSON.stringify(value))),
  GM_deleteValue: key => stored.delete(key),
  registerTornScriptMenu: (_doc, _win, meta, callbacks, features) => { registration = { meta, callbacks, features }; registrations++; },
  fetch: () => { throw new Error('The example must not perform network calls.'); },
};
vm.createContext(context);
vm.runInContext(modules.join('\n') + '\n' + body, context);

(async () => {
  assert.equal(registrations, 1, 'one adapter owns all example capabilities');
  assert.equal(registration.meta.id, 'hub-example');
  assert.equal(registration.meta.pages.length, 2);
  assert.deepEqual(Array.from(registration.features.sharedProviders), [], 'the example requests no actual shared keys');
  const types = new Set();
  for (const descriptor of registration.meta.pages) {
    const schema = await registration.features.describePage(descriptor.id);
    assert.ok(schema.title.startsWith('Example'), 'each page retains source attribution');
    for (const section of schema.sections) for (const field of section.fields) {
      types.add(field.type);
      if (['secret', 'password'].includes(field.type)) { assert.equal(field.default, undefined); assert.match(field.description, /synthetic demo text only/i); }
    }
    assert.ok(schema.actions.every(action => typeof registration.callbacks[action.id] === 'function'));
  }
  for (const type of ['text', 'textarea', 'number', 'integer', 'password', 'secret', 'checkbox', 'toggle', 'select', 'radio', 'range', 'color', 'date', 'time']) assert.ok(types.has(type), 'example covers ' + type);
  let state = await registration.features.readSettings('appearance');
  state = await registration.features.saveSettings('appearance', { columns: 4, customTitle: 'Saved example' }, state.revision);
  assert.equal(state.values.columns, 4);
  assert.equal(state.values.customTitle, 'Saved example');
  assert.equal(stored.get('torn-hub-example:settings:v1').appearance.columns, 4);
  const synthetic = randomBytes(24).toString('base64');
  registration.features.saveSecrets('controls', { demoSecret: synthetic, demoPassword: synthetic });
  state = await registration.features.readSettings('controls');
  assert.equal(state.values.demoSecretPresent, true);
  assert.equal(state.values.demoPasswordPresent, true);
  assert.equal(Object.hasOwn(state.values, 'demoSecret'), false);
  assert.equal(Object.hasOwn(state.values, 'demoPassword'), false);
  assert.equal(JSON.stringify(state).includes(synthetic), false);
  assert.equal(JSON.stringify([...stored.values()]).includes(synthetic), false, 'synthetic secrets never enter manager settings');
  assert.equal(JSON.stringify(await registration.features.describePage('controls')).includes(synthetic), false);
  assert.throws(() => registration.features.saveSecrets('controls', { unexpected: synthetic }));
  events.get('pagehide')();
  state = await registration.features.readSettings('controls');
  assert.equal(state.values.demoSecretPresent, false);
  assert.equal(state.values.demoPasswordPresent, false);

  // Exercise the generated artifact's real adapter, without crypto or network.
  const doc = new EventTarget(), win = new EventTarget(), announcements = [], replies = [];
  doc.addEventListener('torn-script-hub:v1:register', event => announcements.push(JSON.parse(event.detail)));
  doc.addEventListener('torn-script-hub:v1:rpc-result', event => replies.push(JSON.parse(event.detail)));
  vm.runInNewContext(bundle, { document: doc, window: win, CustomEvent, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout });
  assert.equal(announcements.length, 1);
  const entry = announcements[0];
  const send = (method, page, request, extra = {}) => doc.dispatchEvent(new CustomEvent('torn-script-hub:v1:rpc', { detail: JSON.stringify({ id: entry.id, instance: entry.instance, method, page, request, ...extra }) }));
  send('describe', 'controls', 'describe-controls');
  send('read', 'controls', 'read-controls');
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(replies.find(reply => reply.request === 'describe-controls').data.sections.flatMap(section => section.fields).some(field => field.type === 'secret'));
  const publicRead = replies.find(reply => reply.request === 'read-controls');
  assert.equal(publicRead.data.values.demoSecretPresent, false);
  assert.equal(Object.hasOwn(publicRead.data.values, 'demoSecret'), false);
  send('save', 'controls', 'secret-public-save', { revision: publicRead.data.revision, values: { demoSecret: synthetic } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(replies.find(reply => reply.request === 'secret-public-save').status, 'error', 'ordinary adapter transport cannot write secret controls');
  assert.equal(JSON.stringify(announcements).includes(synthetic), false);
  assert.equal(JSON.stringify(replies).includes(synthetic), false);
  win.dispatchEvent(new Event('pagehide'));
  console.log('PASS optional example descriptor, deterministic bundle, controls, settings, secret redaction and lifecycle');
})().catch(error => { console.error(error); process.exitCode = 1; });
