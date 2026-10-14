'use strict';
const assert = require('node:assert/strict');
const { webcrypto, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const modulePath = path.join(__dirname, '../src/script-hub-credentials.cjs');
assert.ok(fs.existsSync(modulePath), 'credential module must implement explicit eligible storage and encrypted grants');
const { createHubCredentialStorage, createHubCredentialVault, createHubCredentialClient } = require(modulePath);
global.fetch = () => { throw new Error('network forbidden in credential tests'); };
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
function environment(manager = 'Tampermonkey') {
  const records = new Map();
  let fail = false, readFail = false;
  return {
    GM_info: { scriptHandler: manager }, records,
    GM_getValue: (key, def) => { if (readFail) throw new Error('StorageUnavailable'); return records.has(key) ? copy(records.get(key)) : def; },
    GM_setValue: (key, value) => { if (fail) throw new Error('QuotaExceeded'); records.set(key, copy(value)); },
    GM_deleteValue: key => { if (fail) throw new Error('QuotaExceeded'); records.delete(key); },
    quota: value => { fail = value; },
    failReads: value => { readFail = value; }
  };
}
const synthetic = () => randomBytes(24).toString('hex');
async function setup() {
  const hubEnv = environment();
  const clientEnv = environment();
  const storage = createHubCredentialStorage(hubEnv, 'vault-test');
  const clientStorage = createHubCredentialStorage(clientEnv, 'client-test');
  const vault = createHubCredentialVault({ storage, crypto: webcrypto });
  const client = createHubCredentialClient({ storage: clientStorage, crypto: webcrypto, scriptId: 'consumer' });
  assert.equal(await vault.ready(), true);
  assert.equal(await client.ready(), true);
  return { hubEnv, clientEnv, storage, clientStorage, vault, client };
}
async function approve(vault, client) {
  assert.equal(await client.pinHub((await vault.publicIdentity()).publicJwk), true);
  assert.equal(await vault.grant('consumer', 'torn', (await client.publicIdentity()).publicJwk), true);
}
async function request(client, suffix = synthetic()) {
  return client.createRequest('torn', 'current-instance', 'request-' + suffix);
}
async function main() {
  for (const manager of ['Tampermonkey', 'Violentmonkey', 'Greasemonkey']) {
    const env = environment(manager), storage = createHubCredentialStorage(env, 'test');
    assert.equal(storage.eligible, true);
    assert.equal(storage.backend, 'gm');
    assert.equal(await storage.set('item', { a: 1 }), true);
    assert.deepEqual(await storage.get('item'), { a: 1 });
    assert.equal(await storage.delete('item'), true);
    assert.equal(await storage.get('item'), null);
  }
  const isolatedEnv = environment();
  const isolatedA = createHubCredentialStorage(isolatedEnv, 'a'), isolatedB = createHubCredentialStorage(isolatedEnv, 'b');
  await isolatedA.set('value', 1);
  assert.equal(await isolatedB.get('value'), null);
  const dotEnv = environment();
  const dotStorage = createHubCredentialStorage({ GM: { info: dotEnv.GM_info, getValue: dotEnv.GM_getValue, setValue: dotEnv.GM_setValue, deleteValue: dotEnv.GM_deleteValue } }, 'dot');
  assert.equal(dotStorage.eligible, true);
  assert.equal(await dotStorage.set('x', 1), true);
  assert.equal(await dotStorage.get('x'), 1);
  assert.equal(createHubCredentialStorage(Object.assign(environment(), { PDA_storage: undefined, PDA_getTabState: undefined }), 'desktop-absent-native').eligible, true);
  for (const pda of [{ PDA_getTabState() {} }, { __PDA_platformReadyPromise: Promise.resolve() }, { flutter_inappwebview: { callHandler() {} } }, { PDA_httpGet() {} }]) {
    const env = Object.assign(environment(), pda);
    const store = createHubCredentialStorage(env, 'pda-fallback-forbidden');
    assert.equal(store.eligible, false, 'PDA compatibility GM must not hold vault secrets');
    assert.equal(await store.set('item', synthetic()), false);
    assert.equal(env.records.size, 0);
  }
  const nativeRecords = new Map(), native = {
    get: async (key, def) => nativeRecords.has(key) ? copy(nativeRecords.get(key)) : def,
    set: async (key, value) => { nativeRecords.set(key, copy(value)); },
    delete: async key => { nativeRecords.delete(key); }
  };
  const nativeEnv = Object.assign(environment(), { PDA_storage: native });
  const nativeStore = createHubCredentialStorage(nativeEnv, 'native');
  assert.equal(nativeStore.backend, 'pda');
  assert.equal(nativeStore.eligible, true);
  assert.equal(await nativeStore.set('item', 1), true);
  assert.equal(nativeEnv.records.size, 0);
  assert.equal(await nativeStore.get('item'), 1);
  assert.equal(await nativeStore.delete('item'), true);
  const nativeVault = createHubCredentialVault({ storage: nativeStore, crypto: webcrypto });
  assert.equal(await nativeVault.ready(), true);
  const nativeIdentity = await nativeVault.publicIdentity();
  assert.equal(await nativeVault.setCredential('torn', synthetic()), true);
  nativeVault.destroy();
  const nativeRestart = createHubCredentialVault({ storage: nativeStore, crypto: webcrypto });
  assert.equal(await nativeRestart.ready(), true);
  assert.deepEqual(await nativeRestart.publicIdentity(), nativeIdentity);
  assert.equal((await nativeRestart.status()).find(p => p.id === 'torn').configured, true);
  nativeRestart.destroy();
  const nativeFailEnv = Object.assign(environment(), { PDA_storage: { ...native, set: async () => { throw new Error('QuotaExceeded'); } } });
  const failedNative = createHubCredentialStorage(nativeFailEnv, 'native-quota');
  assert.equal(await failedNative.set('item', synthetic()), false);
  assert.equal(failedNative.eligible, false);
  assert.equal(nativeFailEnv.records.size, 0);

  for (const env of [environment('Unknown'), {}, Object.assign(environment(), { GM_deleteValue: undefined })]) {
    const store = createHubCredentialStorage(env, 'disabled');
    assert.equal(store.eligible, false);
    const vault = createHubCredentialVault({ storage: store, crypto: webcrypto });
    assert.equal(await vault.ready(), false);
    assert.deepEqual(await vault.respond({}), { status: 'unavailable' });
    assert.equal(await vault.setCredential('torn', synthetic()), false);
  }
  const noCrypto = createHubCredentialVault({ storage: createHubCredentialStorage(environment(), 'no-crypto'), crypto: {} });
  assert.equal(await noCrypto.ready(), false);
  const noCryptoClient = createHubCredentialClient({ storage: createHubCredentialStorage(environment(), 'no-client-crypto'), crypto: {}, scriptId: 'consumer' });
  assert.equal(await noCryptoClient.ready(), false);
  assert.equal(await noCryptoClient.createRequest('torn', 'current', 'request'), null);
  assert.equal(await noCryptoClient.consumeReply({}, {}), null);
  const quotaEnv = environment(); quotaEnv.quota(true);
  const quotaVault = createHubCredentialVault({ storage: createHubCredentialStorage(quotaEnv, 'quota'), crypto: webcrypto });
  assert.equal(await quotaVault.ready(), false);
  assert.equal(await quotaVault.publicIdentity(), null);

  const { hubEnv, clientEnv, storage, clientStorage, vault, client } = await setup();
  const value = synthetic();
  assert.equal(await vault.setCredential('torn', value), true);
  const deniedRequest = await request(client);
  assert.equal(await client.consumeReply(await vault.respond(deniedRequest), deniedRequest), null);
  assert.deepEqual(await vault.respond(await request(client)), { status: 'denied' });
  assert.equal(await vault.grant('consumer', 'torn', (await client.publicIdentity()).publicJwk), true);
  const unpinnedRequest = await request(client);
  assert.equal(await client.consumeReply(await vault.respond(unpinnedRequest), unpinnedRequest), null, 'hub identity must be pinned before consumption');
  await approve(vault, client);
  assert.deepEqual(await vault.respond(await client.createRequest('tornstats', 'current-instance', synthetic())), { status: 'denied' }, 'grant cannot cross provider scope');
  assert.equal((await vault.publicIdentity()).publicJwk.d, undefined);
  assert.equal((await client.publicIdentity()).publicJwk.d, undefined);
  let req = await request(client), reply = await vault.respond(req);
  assert.equal(reply.status, 'ok');
  assert.equal(JSON.stringify(req).includes(value), false);
  assert.equal(JSON.stringify(reply).includes(value), false);
  assert.equal(JSON.stringify(await vault.status()).includes(value), false);
  assert.equal(await client.consumeReply(reply, req), value);
  assert.equal(await client.consumeReply(reply, req), null, 'replayed reply rejected');
  assert.deepEqual(await vault.respond(req), { status: 'denied' }, 'replayed request rejected');
  const req2 = await request(client), reply2 = await vault.respond(req2);
  assert.notEqual(reply.nonce, reply2.nonce);
  assert.equal(await client.consumeReply(reply2, req2), value);
  assert.equal(await vault.grant('consumer', 'script-settings', (await client.publicIdentity()).publicJwk), true);
  const secretPatch = JSON.stringify({ secret: synthetic() });
  const formRequest = await client.createRequest('script-settings', 'current-instance', 'form-' + synthetic(), { pageId: 'options' });
  assert.equal(formRequest.pageId, 'options');
  assert.deepEqual(await vault.respond(formRequest), { status: 'denied' }, 'secret-control provider has no credential value');
  const secretRequest = await client.createRequest('script-settings', 'current-instance', 'form-' + synthetic(), { pageId: 'options' });
  const secretReply = await vault.encryptMessage(secretRequest, secretPatch);
  assert.equal(secretReply.pageId, 'options');
  assert.equal(JSON.stringify(secretReply).includes(secretPatch), false);
  assert.equal(await client.consumeReply(secretReply, secretRequest), secretPatch);
  const maximumPatch = JSON.stringify({ secret: synthetic(), padding: 'x'.repeat(24000) });
  const bigRequest = await client.createRequest('script-settings', 'current-instance', 'large-' + synthetic(), { pageId: 'options' });
  assert.equal(await client.consumeReply(await vault.encryptMessage(bigRequest, maximumPatch), bigRequest), maximumPatch);
  const excessive = await client.createRequest('script-settings', 'current-instance', 'large-' + synthetic(), { pageId: 'options' });
  assert.deepEqual(await vault.encryptMessage(excessive, 'x'.repeat(32769)), { status: 'denied' });
  const badPageRequest = await client.createRequest('script-settings', 'current-instance', 'form-' + synthetic(), { pageId: 'options' });
  const badPageReply = await vault.encryptMessage(badPageRequest, secretPatch);
  badPageReply.pageId = 'other';
  assert.equal(await client.consumeReply(badPageReply, badPageRequest), null);

  for (const field of ['providerId', 'scriptId', 'instance', 'requestId', 'expiresAt', 'nonce', 'ciphertext']) {
    const r = await request(client), good = await vault.respond(r), bad = copy(good);
    bad[field] = field === 'expiresAt' ? good.expiresAt + 1 : field === 'nonce' || field === 'ciphertext' ? (good[field][0] === 'a' ? 'b' : 'a') + good[field].slice(1) : 'other';
    assert.equal(await client.consumeReply(bad, r), null, 'tampered ' + field + ' rejected');
  }
  const mismatch = await request(client), mismatchReply = await vault.respond(mismatch);
  assert.equal(await client.consumeReply(mismatchReply, { ...mismatch, instance: 'spoof' }), null);
  const expired = await request(client); expired.expiresAt = Date.now() - 1;
  assert.deepEqual(await vault.respond(expired), { status: 'denied' });
  const distant = await request(client); distant.expiresAt = Date.now() + 120000;
  assert.deepEqual(await vault.respond(distant), { status: 'denied' });
  const stranger = createHubCredentialClient({ storage: createHubCredentialStorage(environment(), 'stranger'), crypto: webcrypto, scriptId: 'consumer' });
  await stranger.ready();
  assert.deepEqual(await vault.respond(await request(stranger)), { status: 'denied' }, 'new identity requires approval');
  assert.deepEqual(await vault.encryptMessage(await stranger.createRequest('script-settings', 'current-instance', synthetic(), { pageId: 'options' }), secretPatch), { status: 'denied' });
  await stranger.pinHub((await vault.publicIdentity()).publicJwk);
  await vault.grant('consumer', 'torn', (await stranger.publicIdentity()).publicJwk);
  const rotatedRequest = await request(stranger);
  assert.equal(await stranger.consumeReply(await vault.respond(rotatedRequest), rotatedRequest), value, 'explicit reapproval pins the replacement identity');
  assert.deepEqual(await vault.respond(await request(client)), { status: 'denied' }, 'replaced identity loses its old grant');
  await approve(vault, client);
  const otherVault = createHubCredentialVault({ storage: createHubCredentialStorage(environment(), 'other-vault'), crypto: webcrypto });
  await otherVault.ready();
  assert.equal(await client.pinHub((await otherVault.publicIdentity()).publicJwk), false, 'hub fingerprint rotation requires explicit replacement');
  assert.equal(await otherVault.setCredential('torn', synthetic()), true);
  await otherVault.grant('consumer', 'torn', (await client.publicIdentity()).publicJwk);
  const forgedRequest = await request(client);
  assert.equal(await client.consumeReply(await otherVault.respond(forgedRequest), forgedRequest), null, 'forged hub reply rejected');
  otherVault.destroy();
  const concurrentRequest = await request(client), concurrentReply = await vault.respond(concurrentRequest);
  const concurrentValues = await Promise.all([client.consumeReply(concurrentReply, concurrentRequest), client.consumeReply(concurrentReply, concurrentRequest)]);
  assert.equal(concurrentValues.filter(result => result === value).length, 1, 'only one simultaneous reply wins');
  const nonces = new Set();
  for (let i = 0; i < 20; i++) {
    const item = await request(client), envelope = await vault.respond(item);
    assert.equal(nonces.has(envelope.nonce), false);
    nonces.add(envelope.nonce);
    assert.equal(await client.consumeReply(envelope, item), value);
  }

  const firstIdentity = await vault.publicIdentity(), clientIdentity = await client.publicIdentity();
  vault.destroy(); client.destroy();
  const restartedVault = createHubCredentialVault({ storage, crypto: webcrypto });
  const restartedClient = createHubCredentialClient({ storage: clientStorage, crypto: webcrypto, scriptId: 'consumer' });
  assert.equal(await restartedVault.ready(), true);
  assert.equal(await restartedClient.ready(), true);
  assert.deepEqual(await restartedVault.publicIdentity(), firstIdentity);
  assert.deepEqual(await restartedClient.publicIdentity(), clientIdentity);
  const rr = await request(restartedClient);
  assert.equal(await restartedClient.consumeReply(await restartedVault.respond(rr), rr), value, 'grant and credential survive restart');
  assert.equal(await restartedVault.revoke('consumer', 'torn'), true);
  assert.deepEqual(await restartedVault.respond(await request(restartedClient)), { status: 'denied' });
  await approve(restartedVault, restartedClient);
  assert.equal(await restartedVault.deleteCredential('torn'), true);
  assert.deepEqual(await restartedVault.respond(await request(restartedClient)), { status: 'denied' });
  assert.equal((await restartedVault.status()).find(p => p.id === 'torn').configured, false);
  const replacement = synthetic();
  assert.equal(await restartedVault.setCredential('torn', replacement), true);
  assert.equal((await restartedVault.status()).find(p => p.id === 'torn').revision, 3);
  const replacementRequest = await request(restartedClient);
  assert.equal(await restartedClient.consumeReply(await restartedVault.respond(replacementRequest), replacementRequest), replacement, 'rotation immediately delivers the replacement');
  hubEnv.quota(true);
  assert.equal(await restartedVault.setCredential('torn', synthetic()), false, 'failed replacement is not used');
  assert.deepEqual(await restartedVault.respond(await request(restartedClient)), { status: 'unavailable' }, 'storage failure disables sharing');
  assert.equal(JSON.stringify(await restartedVault.status()).includes(replacement), false);
  assert.equal(clientEnv.records.size > 0, true);
  restartedVault.destroy(); restartedClient.destroy(); stranger.destroy();
  assert.equal(await restartedVault.ready(), false);
  assert.equal(await restartedClient.createRequest('torn', 'x', 'y'), null);

  const limited = await setup();
  await approve(limited.vault, limited.client);
  await limited.vault.setCredential('torn', synthetic());
  for (let i = 0; i < 17; i++) assert.equal(await limited.vault.setCredential('provider-' + i, synthetic()), true);
  assert.equal(await limited.vault.setCredential('one-too-many', synthetic()), false);
  assert.equal((await limited.vault.status()).length, 20);
  const boundPublic = (await limited.client.publicIdentity()).publicJwk;
  for (let i = 0; i < 199; i++) assert.equal(await limited.vault.grant('script-' + i, 'torn', boundPublic), true);
  assert.equal(await limited.vault.grant('extra-script', 'torn', boundPublic), false);
  assert.equal((await limited.vault.status()).find(p => p.id === 'torn').permissions.length, 200);
  const boundedClient = createHubCredentialClient({ storage: createHubCredentialStorage(environment(), 'bounded-client'), crypto: webcrypto, scriptId: 'consumer' });
  await boundedClient.ready();
  for (let i = 0; i < 128; i++) assert.notEqual(await request(boundedClient, 'bound-' + i), null);
  assert.equal(await request(boundedClient, 'overflow'), null);
  assert.equal(await request(boundedClient, 'bound-1'), null);
  boundedClient.destroy();
  for (let i = 0; i < 256; i++) {
    const reqBound = await request(limited.client, 'replay-bound-' + i), replyBound = await limited.vault.respond(reqBound);
    assert.equal(replyBound.status, 'ok');
    assert.notEqual(await limited.client.consumeReply(replyBound, reqBound), null);
  }
  assert.deepEqual(await limited.vault.respond(await request(limited.client, 'overflow')), { status: 'denied' });
  limited.vault.destroy(); limited.client.destroy();

  const quotaPin = await setup();
  quotaPin.clientEnv.quota(true);
  assert.equal(await quotaPin.client.pinHub((await quotaPin.vault.publicIdentity()).publicJwk), false);
  assert.equal(await quotaPin.client.ready(), false);
  assert.equal(await quotaPin.client.createRequest('torn', 'instance', 'request'), null);
  quotaPin.vault.destroy(); quotaPin.client.destroy();

  const expiredReplySetup = await setup();
  await approve(expiredReplySetup.vault, expiredReplySetup.client);
  await expiredReplySetup.vault.setCredential('torn', synthetic());
  const clockBefore = Date.now;
  const expiredReplyRequest = await request(expiredReplySetup.client), expiredReply = await expiredReplySetup.vault.respond(expiredReplyRequest);
  try {
    Date.now = () => expiredReplyRequest.expiresAt + 1;
    assert.equal(await expiredReplySetup.client.consumeReply(expiredReply, expiredReplyRequest), null);
  } finally { Date.now = clockBefore; }
  expiredReplySetup.vault.destroy(); expiredReplySetup.client.destroy();

  const multiTab = await setup();
  const initialMultiValue = synthetic();
  await multiTab.vault.setCredential('torn', initialMultiValue);
  await approve(multiTab.vault, multiTab.client);
  const secondVault = createHubCredentialVault({ storage: multiTab.storage, crypto: webcrypto });
  assert.equal(await secondVault.ready(), true);
  const rememberedRequest = await request(multiTab.client);
  assert.equal(await multiTab.client.consumeReply(await secondVault.respond(rememberedRequest), rememberedRequest), initialMultiValue);
  const updatedMultiValue = synthetic();
  await multiTab.vault.setCredential('torn', updatedMultiValue);
  const snapshotBeforeRefresh = JSON.stringify(Array.from(multiTab.hubEnv.records));
  assert.equal(await secondVault.refresh(), true);
  assert.equal(JSON.stringify(Array.from(multiTab.hubEnv.records)), snapshotBeforeRefresh, 'refresh reads without rewriting storage');
  assert.deepEqual(await secondVault.respond(rememberedRequest), { status: 'denied' }, 'refresh preserves replay history');
  assert.equal((await secondVault.status()).find(p => p.id === 'torn').revision, 2);
  const updatedMultiRequest = await request(multiTab.client);
  assert.equal(await multiTab.client.consumeReply(await secondVault.respond(updatedMultiRequest), updatedMultiRequest), updatedMultiValue, 'other-tab key rotation loads privately');
  await multiTab.vault.revoke('consumer', 'torn');
  const afterRevokeRequest = await request(multiTab.client);
  const [refreshed, afterRevokeReply] = await Promise.all([secondVault.refresh(), secondVault.respond(afterRevokeRequest)]);
  assert.equal(refreshed, true);
  assert.deepEqual(afterRevokeReply, { status: 'denied' }, 'queued response follows refreshed other-tab revocation');
  const corrupted = copy(multiTab.hubEnv.records.get('vault-test:vault-v1'));
  corrupted.version = 2;
  multiTab.hubEnv.records.set('vault-test:vault-v1', corrupted);
  assert.equal(await secondVault.refresh(), false, 'malformed persisted state disables sharing safely');
  assert.deepEqual(await secondVault.respond(await request(multiTab.client)), { status: 'unavailable' });
  assert.equal(await secondVault.publicIdentity(), null);
  multiTab.vault.destroy(); multiTab.client.destroy(); secondVault.destroy();
  assert.equal(await secondVault.refresh(), false);
  const readFailureSetup = await setup();
  readFailureSetup.hubEnv.failReads(true);
  assert.equal(await readFailureSetup.vault.refresh(), false, 'backend read error disables sharing without exposing the raw failure');
  assert.deepEqual(await readFailureSetup.vault.status(), []);
  assert.deepEqual(await readFailureSetup.vault.respond(await request(readFailureSetup.client)), { status: 'unavailable' });
  readFailureSetup.vault.destroy(); readFailureSetup.client.destroy();
  console.log('script-hub credentials: storage, consent, encrypted routing, persistence and failure checks passed');
}
main().catch(error => {
  console.error('script-hub credential checks failed (values suppressed)');
  const frame = String(error.stack || '').split('\n').find(line => /^\s+at /.test(line) && line.includes('script-hub-credentials.test.cjs'));
  if (frame) console.error(frame);
  process.exitCode = 1;
});
