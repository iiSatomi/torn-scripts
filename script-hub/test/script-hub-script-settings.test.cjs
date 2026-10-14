const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const forms = require('../src/script-hub-forms.cjs');
const context = { ...forms, module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/script-hub-script-settings.cjs'), 'utf8'), context);
const { createHubScriptSettings } = context.module.exports;
const page = { id: 'general', title: 'Script settings', description: '<b>Literal text</b>', sections: [{ id: 'preferences', title: 'Preferences', fields: [
  { id: 'count', label: 'Count', type: 'integer', min: 0, max: 10, default: 2 },
  { id: 'enabled', label: 'Enabled', type: 'checkbox', default: false },
  { id: 'locked', label: 'Authoritative flag', type: 'checkbox', readOnly: true },
  { id: 'demo', label: 'Write-only synthetic input', type: 'secret' },
] }], actions: [] };
let owned = { count: 2, enabled: false, locked: true }, writes = 0;
const client = {}, onChange = () => {}, saveSecrets = () => {};
const features = createHubScriptSettings([page], () => ({ ...owned }), (_id, patch) => { writes++; owned = { ...owned, ...patch }; }, client, onChange, saveSecrets);
assert.equal(features.credentialClient, client);
assert.equal(features.onSharedCredentialChange, onChange);
assert.equal(features.saveSecrets, saveSecrets);
assert.equal(features.describePage('general').description, '<b>Literal text</b>');
assert.notEqual(features.describePage('general'), page, 'helper normalizes an independent schema');
assert.throws(() => features.describePage('missing'));
assert.throws(() => createHubScriptSettings([{ ...page, sections: [{ id: 'bad', title: 'Bad', fields: [{ id: 'x', label: 'X', type: 'html' }] }] }], () => ({}), () => {}), TypeError);

(async () => {
  const first = await features.readSettings('general');
  const unchanged = await features.readSettings('general');
  assert.equal(unchanged.revision, first.revision, 're-reading unchanged native settings keeps revision');
  owned.enabled = true;
  const nativeChange = await features.readSettings('general');
  assert.notEqual(nativeChange.revision, first.revision, 'external native setting changes advance revision');
  await assert.rejects(features.saveSettings('general', { count: 4 }, first.revision));
  assert.equal(writes, 0, 'stale revisions cannot overwrite native changes');
  assert.equal(owned.count, 2);
  for (const patch of [{ unknown: true }, { demo: 'synthetic' }, { locked: false }, { count: 11 }, { count: 1.5 }, { enabled: 'true' }]) {
    await assert.rejects(features.saveSettings('general', patch, nativeChange.revision));
    assert.equal(writes, 0, 'unallowlisted or invalid patches cannot reach owned storage');
  }
  const saved = await features.saveSettings('general', { count: '4', enabled: false }, nativeChange.revision);
  assert.equal(saved.values.count, 4, 'owner receives normalized typed values');
  assert.equal(saved.values.enabled, false);
  assert.equal(saved.values.locked, true, 'read-only native value is preserved');
  assert.equal(writes, 1);
  assert.notEqual(saved.revision, nativeChange.revision);
  const after = await features.readSettings('general');
  assert.equal(after.revision, saved.revision);
  await assert.rejects(features.saveSettings('general', { count: 5 }, nativeChange.revision));
  assert.equal(owned.count, 4);
  const revision=(await features.readSettings('general')).revision;
  const simultaneous=await Promise.allSettled([features.saveSettings('general',{count:5},revision),features.saveSettings('general',{count:6},revision)]);
  assert.equal(simultaneous.filter(result=>result.status==='fulfilled').length,1,'only one concurrent save may consume a revision');
  assert.equal(owned.count,5);
  let asyncOwned={count:2,enabled:false};
  const asynchronous=createHubScriptSettings([page],async()=>({...asyncOwned}),async(_id,values)=>{await new Promise(resolve=>setImmediate(resolve));asyncOwned={...asyncOwned,...values};});
  const asyncState=await asynchronous.readSettings('general');
  const asyncSaved=await asynchronous.saveSettings('general',{count:3},asyncState.revision);
  assert.equal(asyncSaved.values.count,3,'async owners finish storage before reporting a save');
  console.log('PASS script settings normalization, stable revisions, native conflicts and allowlisted typed saves');
})().catch(error => { console.error(error); process.exitCode = 1; });
