'use strict';

// Only selected manager/native APIs may hold identities, consent pins or values.
// Native PDA namespaces are durable storage, not protection against installed scripts.
function createHubCredentialStorage(env, namespace) {
  env = env || {};
  const validNamespace = typeof namespace === 'string' && /^[a-zA-Z0-9_.:-]{1,120}$/.test(namespace);
  const native = env.PDA_storage;
  const pda = !!native || !!env.flutter_inappwebview || !!env.__PDA_platformReadyPromise ||
    typeof env.PDA_getTabState === 'function' || typeof env.PDA_httpGet === 'function' ||
    env.isTornPDA === true || Object.keys(env).some(key => key.startsWith('PDA_') && env[key] != null);
  const manager = env.GM_info?.scriptHandler || env.GM?.info?.scriptHandler;
  const managerKnown = ['Tampermonkey', 'Violentmonkey', 'Greasemonkey'].includes(manager);
  let owner = null, read = null, write = null, remove = null, backend = 'none';
  if (native && ['get', 'set', 'delete'].every(name => typeof native[name] === 'function')) {
    owner = native; read = native.get; write = native.set; remove = native.delete; backend = 'pda';
  } else if (!pda && managerKnown) {
    if (['GM_getValue', 'GM_setValue', 'GM_deleteValue'].every(name => typeof env[name] === 'function')) {
      owner = env; read = env.GM_getValue; write = env.GM_setValue; remove = env.GM_deleteValue; backend = 'gm';
    } else if (env.GM && ['getValue', 'setValue', 'deleteValue'].every(name => typeof env.GM[name] === 'function')) {
      owner = env.GM; read = env.GM.getValue; write = env.GM.setValue; remove = env.GM.deleteValue; backend = 'gm';
    }
  }
  let eligible = validNamespace && backend !== 'none';
  const validKey = key => typeof key === 'string' && /^[a-zA-Z0-9_.:-]{1,150}$/.test(key);
  const prefix = namespace + ':';
  return {
    get eligible() { return eligible; },
    backend: eligible ? backend : 'none',
    async get(key) {
      if (!eligible || !validKey(key)) return null;
      try { const value = await read.call(owner, prefix + key, null); return value === undefined ? null : value; }
      catch (_) { eligible = false; return null; }
    },
    async set(key, value) {
      if (!eligible || !validKey(key)) return false;
      try { await write.call(owner, prefix + key, value); return true; }
      catch (_) { eligible = false; return false; }
    },
    async delete(key) {
      if (!eligible || !validKey(key)) return false;
      try { await remove.call(owner, prefix + key); return true; }
      catch (_) { eligible = false; return false; }
    }
  };
}

// No network, DOM, raw-error logging, or manager globals exist below this point.
const HUB_CREDENTIAL_TTL = 30000;
const HUB_CREDENTIAL_PROVIDERS = 20;
const HUB_CREDENTIAL_GRANTS = 200;
const HUB_CREDENTIAL_HISTORY = 256;
const HUB_CREDENTIAL_PENDING = 128;
const HUB_CREDENTIAL_KEYS = 20;
const hubCredentialLabel = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 60 && !/[\u0000-\u001f\u007f]/.test(value);
const hubCredentialClone = value => JSON.parse(JSON.stringify(value));
const hubCredentialBytes = value => new TextEncoder().encode(value);
const hubCredentialHex = value => Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join('');
function hubCredentialUnhex(value, maxBytes) {
  if (typeof value !== 'string' || value.length > maxBytes * 2 || value.length % 2 || !/^[a-f0-9]+$/.test(value)) throw new Error('Unavailable');
  return Uint8Array.from(value.match(/../g), byte => parseInt(byte, 16));
}
const hubCredentialId = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value);
function hubCredentialPublic(raw) {
  if (!raw || raw.kty !== 'EC' || raw.crv !== 'P-256' || typeof raw.x !== 'string' ||
      typeof raw.y !== 'string' || !/^[a-zA-Z0-9_-]{43}$/.test(raw.x) || !/^[a-zA-Z0-9_-]{43}$/.test(raw.y) || raw.d !== undefined) throw new Error('Unavailable');
  return { kty: 'EC', crv: 'P-256', x: raw.x, y: raw.y };
}
async function hubCredentialFingerprint(crypto, raw) {
  return hubCredentialHex(await crypto.subtle.digest('SHA-256', hubCredentialBytes(JSON.stringify(hubCredentialPublic(raw)))));
}
function hubCredentialCryptoAvailable(crypto) {
  return !!crypto && typeof crypto.getRandomValues === 'function' && crypto.subtle &&
    ['generateKey', 'exportKey', 'importKey', 'deriveKey', 'digest', 'encrypt', 'decrypt'].every(name => typeof crypto.subtle[name] === 'function');
}
async function hubCredentialIdentity(crypto, stored) {
  let publicJwk, privateJwk;
  if (stored) {
    publicJwk = hubCredentialPublic(stored.publicJwk);
    privateJwk = stored.privateJwk;
    if (!privateJwk || typeof privateJwk.d !== 'string' || privateJwk.x !== publicJwk.x || privateJwk.y !== publicJwk.y) throw new Error('Unavailable');
  } else {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    publicJwk = hubCredentialPublic(await crypto.subtle.exportKey('jwk', pair.publicKey));
    privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  }
  const privateKey = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
  // Public import validates that the stored coordinates describe an actual point.
  await crypto.subtle.importKey('jwk', publicJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  return { privateKey, persisted: { publicJwk, privateJwk }, publicJwk, fingerprint: await hubCredentialFingerprint(crypto, publicJwk) };
}
async function hubCredentialPeerKey(crypto, privateKey, publicJwk) {
  const publicKey = await crypto.subtle.importKey('jwk', hubCredentialPublic(publicJwk), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  return crypto.subtle.deriveKey({ name: 'ECDH', public: publicKey }, privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
function hubCredentialRoute(request) {
  if (!request || request.version !== 1 || !['scriptId', 'providerId', 'instance', 'requestId'].every(name => hubCredentialId(request[name])) ||
      !Number.isSafeInteger(request.expiresAt)) throw new Error('Unavailable');
  if (request.pageId !== undefined && !hubCredentialId(request.pageId)) throw new Error('Unavailable');
  const route = { version: 1, scriptId: request.scriptId, providerId: request.providerId, instance: request.instance, requestId: request.requestId, expiresAt: request.expiresAt };
  if (request.pageId !== undefined) route.pageId = request.pageId;
  return route;
}
function hubCredentialFresh(route) {
  const now = Date.now();
  return route.expiresAt > now && route.expiresAt <= now + HUB_CREDENTIAL_TTL;
}
function hubCredentialAad(route, clientFingerprint, hubFingerprint) {
  return hubCredentialBytes(JSON.stringify({ ...route, direction: 'hub-to-client', clientFingerprint, hubFingerprint }));
}
function hubCredentialPrune(map) {
  const now = Date.now();
  for (const [key, value] of map) if (value.expiresAt <= now) map.delete(key);
}
function hubCredentialRequestKey(route) { return JSON.stringify([route.scriptId, route.instance, route.requestId]); }
function hubCredentialValidatedVaultState(stored) {
  if (!stored || stored.version !== 1 || !stored.identity || !Array.isArray(stored.providers) || !Array.isArray(stored.grants) ||
      stored.providers.length > HUB_CREDENTIAL_PROVIDERS || stored.grants.length > HUB_CREDENTIAL_GRANTS) throw new Error('Unavailable');
  const providerIds = new Set();
  for (const p of stored.providers) {
    if (!p || !hubCredentialId(p.id) || providerIds.has(p.id) || !(p.value === null || typeof p.value === 'string' && p.value.length <= 4096) ||
        !Number.isSafeInteger(p.revision) || p.revision < 0) throw new Error('Unavailable');
    providerIds.add(p.id);
    if (p.globalFallback !== undefined && typeof p.globalFallback !== 'boolean') throw new Error('Unavailable');
    if (p.keys !== undefined && (!Array.isArray(p.keys) || p.keys.length > HUB_CREDENTIAL_KEYS)) throw new Error('Unavailable');
    const ids = new Set();
    for (const key of p.keys || []) {
      if (!key || !hubCredentialId(key.id) || key.id === 'global' || ids.has(key.id) || !hubCredentialLabel(key.label) ||
          !(key.value === null || typeof key.value === 'string' && key.value.length > 0 && key.value.length <= 4096)) throw new Error('Unavailable');
      ids.add(key.id);
    }
  }
  const grantIds = new Set();
  for (const g of stored.grants) {
    if (!g || !hubCredentialId(g.scriptId) || !providerIds.has(g.providerId) || !/^[a-f0-9]{64}$/.test(g.fingerprint)) throw new Error('Unavailable');
    const key = g.scriptId + '\n' + g.providerId;
    if (grantIds.has(key)) throw new Error('Unavailable');
    grantIds.add(key);
    if (g.keyId !== undefined && !hubCredentialId(g.keyId)) throw new Error('Unavailable');
    if (g.allowed !== undefined && typeof g.allowed !== 'boolean') throw new Error('Unavailable');
  }
  return hubCredentialClone(stored);
}

function createHubCredentialVault({ storage, crypto } = {}) {
  let destroyed = false, enabled = false, identity = null, state = null, initialization = null;
  const seen = new Map();
  let queue = Promise.resolve();
  const disable = () => { enabled = false; identity = null; state = null; seen.clear(); };
  function ordered(work) {
    const result = queue.then(work).catch(() => { disable(); return false; });
    queue = result.then(() => undefined);
    return result;
  }
  async function ready() {
    if (destroyed) return false;
    if (!initialization) initialization = (async () => {
      try {
        if (!storage?.eligible || !hubCredentialCryptoAvailable(crypto)) return false;
        const stored = await storage.get('vault-v1');
        if (!storage.eligible || destroyed) return false;
        const loaded = stored === null ? { version: 1, providers: ['torn', 'tornstats', 'ffscouter'].map(id => ({ id, value: null, revision: 0 })), grants: [] }
          : hubCredentialValidatedVaultState(stored);
        const keys = await hubCredentialIdentity(crypto, loaded.identity);
        if (destroyed) return false;
        loaded.identity = keys.persisted;
        if (!stored && !await storage.set('vault-v1', loaded)) return false;
        if (destroyed || !storage.eligible) return false;
        state = hubCredentialClone(loaded); identity = keys; enabled = true;
        return true;
      } catch (_) { disable(); return false; }
    })();
    return await initialization && !destroyed && enabled && storage.eligible;
  }
  async function save(next) {
    if (!await storage.set('vault-v1', next) || destroyed || !storage.eligible) { disable(); return false; }
    state = next;
    return true;
  }
  async function publicIdentity() {
    return await ready() ? { publicJwk: hubCredentialClone(identity.publicJwk), fingerprint: identity.fingerprint } : null;
  }
  function refresh() {
    return ordered(async () => {
      if (!await ready()) return false;
      // One private backend read; never generate an identity or rewrite on resume.
      const stored = await storage.get('vault-v1');
      if (!storage.eligible || destroyed) { disable(); return false; }
      const loaded = hubCredentialValidatedVaultState(stored);
      const keys = await hubCredentialIdentity(crypto, loaded.identity);
      if (destroyed || !storage.eligible) { disable(); return false; }
      state = loaded; identity = keys;
      // Keep seen requests intact across refresh, including key/grant changes.
      return true;
    });
  }
  async function status() {
    if (!await ready()) return [];
    return state.providers.map(p => ({ id: p.id, configured: typeof p.value === 'string' && p.value.length > 0, revision: p.revision,
      globalFallback: p.globalFallback === true,
      keys: (p.keys || []).map(key => ({id:key.id,label:key.label,configured:!!key.value})),
      assignments: state.grants.filter(g=>g.providerId===p.id).map(g=>({scriptId:g.scriptId,keyId:g.keyId||'global'})),
      permissions: state.grants.filter(g => g.providerId === p.id && g.allowed!==false).map(g => ({ scriptId: g.scriptId, fingerprint: g.fingerprint, keyId:g.keyId || 'global' })) }));
  }
  function editProvider(providerId, edit) {
    return ordered(async () => {
      if (!await ready() || !hubCredentialId(providerId) || providerId === 'script-settings') return false;
      const next = hubCredentialClone(state), provider = next.providers.find(p => p.id === providerId);
      if (!provider || provider.revision >= Number.MAX_SAFE_INTEGER || !edit(provider, next)) return false;
      provider.revision++;
      return save(next);
    });
  }
  async function addNamedKey(providerId, label, value) {
    if (!await ready() || !hubCredentialLabel(label) || typeof value !== 'string' || !value.length || value.length > 4096) return false;
    const id = 'key-' + hubCredentialHex(crypto.getRandomValues(new Uint8Array(12)));
    return await editProvider(providerId, provider => {
      provider.keys ||= [];
      if (provider.keys.length >= HUB_CREDENTIAL_KEYS) return false;
      provider.keys.push({id,label:label.trim(),value});return true;
    }) ? id : false;
  }
  function setNamedKey(providerId, keyId, label, value) {
    if (!hubCredentialLabel(label) || !(value === undefined || typeof value === 'string' && value.length > 0 && value.length <= 4096)) return Promise.resolve(false);
    return editProvider(providerId, provider => {
      const key = provider.keys?.find(k => k.id === keyId);if (!key) return false;
      key.label = label.trim();if (value !== undefined) key.value = value;return true;
    });
  }
  function deleteNamedKey(providerId, keyId) {
    return editProvider(providerId, provider => {
      const key = provider.keys?.find(k => k.id === keyId);if (!key) return false;
      key.value = null;return true;
    });
  }
  function setGlobalFallback(providerId, value) {
    if (typeof value !== 'boolean') return Promise.resolve(false);
    return editProvider(providerId, provider => {provider.globalFallback=value;return true;});
  }
  function assignKey(scriptId, providerId, keyId) {
    if (!hubCredentialId(scriptId) || !hubCredentialId(keyId)) return Promise.resolve(false);
    return editProvider(providerId, (provider, next) => {
      const grant = next.grants.find(g => g.scriptId === scriptId && g.providerId === providerId);
      if (!grant || keyId !== 'global' && !provider.keys?.some(k => k.id === keyId)) return false;
      grant.keyId=keyId;return true;
    });
  }
  function setCredential(providerId, value) {
    return ordered(async () => {
      if (!await ready() || !hubCredentialId(providerId) || typeof value !== 'string' || !value.length || value.length > 4096) return false;
      const next = hubCredentialClone(state);
      let provider = next.providers.find(p => p.id === providerId);
      if (!provider) {
        if (next.providers.length >= HUB_CREDENTIAL_PROVIDERS) return false;
        provider = { id: providerId, value: null, revision: 0 }; next.providers.push(provider);
      }
      if (provider.revision >= Number.MAX_SAFE_INTEGER) return false;
      provider.value = value; provider.revision += 1;
      return save(next);
    });
  }
  function deleteCredential(providerId) {
    return ordered(async () => {
      if (!await ready() || !hubCredentialId(providerId)) return false;
      const next = hubCredentialClone(state), provider = next.providers.find(p => p.id === providerId);
      if (!provider || provider.revision >= Number.MAX_SAFE_INTEGER) return false;
      provider.value = null; provider.revision += 1;
      return save(next);
    });
  }
  function grant(scriptId, providerId, publicJwk) {
    return ordered(async () => {
      if (!await ready() || !hubCredentialId(scriptId) || !hubCredentialId(providerId)) return false;
      let fingerprint;
      try {
        // Reject invalid points before pinning a grant.
        await hubCredentialPeerKey(crypto, identity.privateKey, publicJwk);
        fingerprint = await hubCredentialFingerprint(crypto, publicJwk);
      } catch (_) { return false; }
      const next = hubCredentialClone(state);
      if (!next.providers.some(p => p.id === providerId)) {
        if (next.providers.length >= HUB_CREDENTIAL_PROVIDERS) return false;
        next.providers.push({ id: providerId, value: null, revision: 0 });
      }
      const existing = next.grants.find(g => g.scriptId === scriptId && g.providerId === providerId);
      if (existing) {existing.fingerprint = fingerprint;existing.allowed=true;}
      else {
        if (next.grants.length >= HUB_CREDENTIAL_GRANTS) return false;
        next.grants.push({ scriptId, providerId, fingerprint });
      }
      return save(next);
    });
  }
  function revoke(scriptId, providerId) {
    return ordered(async () => {
      if (!await ready() || !hubCredentialId(scriptId) || !hubCredentialId(providerId)) return false;
      const next = hubCredentialClone(state);
      const grant=next.grants.find(g=>g.scriptId===scriptId&&g.providerId===providerId);
      if(grant)grant.allowed=false;
      return save(next);
    });
  }
  async function encryptedResponse(request, payloadForProvider) {
    const result = await ordered(async () => {
      if (!await ready()) return { status: 'unavailable' };
      try {
        const route = hubCredentialRoute(request);
        if (!hubCredentialFresh(route)) return { status: 'denied' };
        const publicJwk = hubCredentialPublic(request.publicJwk);
        const fingerprint = await hubCredentialFingerprint(crypto, publicJwk);
        const permission = state.grants.find(g => g.scriptId === route.scriptId && g.providerId === route.providerId);
        const provider = state.providers.find(p => p.id === route.providerId);
        if (!permission || permission.allowed===false || permission.fingerprint !== fingerprint || !provider) return { status: 'denied' };
        const payload = payloadForProvider(provider, permission);
        if (typeof payload !== 'string' || !payload.length || hubCredentialBytes(payload).length > 32768) return { status: 'denied' };
        hubCredentialPrune(seen);
        const requestKey = hubCredentialRequestKey(route);
        if (seen.has(requestKey) || seen.size >= HUB_CREDENTIAL_HISTORY) return { status: 'denied' };
        seen.set(requestKey, route);
        const key = await hubCredentialPeerKey(crypto, identity.privateKey, publicJwk);
        const nonce = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: hubCredentialAad(route, fingerprint, identity.fingerprint), tagLength: 128 }, key, hubCredentialBytes(payload));
        if (destroyed || !enabled || !storage.eligible || !hubCredentialFresh(route)) return { status: 'unavailable' };
        return { ...route, status: 'ok', publicJwk: hubCredentialClone(identity.publicJwk), nonce: hubCredentialHex(nonce), ciphertext: hubCredentialHex(encrypted) };
      } catch (_) { return { status: 'denied' }; }
    });
    return result || { status: 'unavailable' };
  }
  function respond(request) {
    return encryptedResponse(request, (provider, permission) => {
      const assigned=permission.keyId || 'global';
      let keyId=assigned,value=assigned==='global'?provider.value:provider.keys?.find(k=>k.id===assigned)?.value || null;
      const fallback=!value && assigned!=='global' && provider.globalFallback===true && !!provider.value;
      if(fallback){keyId='global';value=provider.value;}
      return request.pageId==='credential-context-v2'
        ? JSON.stringify({version:2,value:value || null,keyId,fallback,managed:true}) : value;
    });
  }
  // Internal hub UI only; same consent and routing checks as credential deliveries.
  function encryptMessage(request, payloadString) { return encryptedResponse(request, () => payloadString); }
  function destroy() { destroyed = true; disable(); }
  return { ready, publicIdentity, refresh, setCredential, deleteCredential, addNamedKey, setNamedKey, deleteNamedKey, setGlobalFallback, assignKey, status, grant, revoke, respond, encryptMessage, destroy };
}

function createHubCredentialClient({ storage, crypto, scriptId } = {}) {
  let destroyed = false, enabled = false, identity = null, state = null, initialization = null;
  let queue = Promise.resolve();
  const pending = new Map();
  const disable = () => { enabled = false; identity = null; state = null; pending.clear(); };
  const storageKey = 'client-v1:' + scriptId;
  async function ready() {
    if (destroyed) return false;
    if (!initialization) initialization = (async () => {
      try {
        if (!hubCredentialId(scriptId) || !storage?.eligible || !hubCredentialCryptoAvailable(crypto)) return false;
        const stored = await storage.get(storageKey);
        if (!storage.eligible || destroyed || stored && (stored.version !== 1 || !stored.identity || !(stored.hubFingerprint === null || /^[a-f0-9]{64}$/.test(stored.hubFingerprint)) ||
          stored.managedProviders !== undefined && (!Array.isArray(stored.managedProviders) || stored.managedProviders.length > 20 || !stored.managedProviders.every(hubCredentialId)))) return false;
        const loaded = stored || { version: 1, hubFingerprint: null };
        const keys = await hubCredentialIdentity(crypto, loaded.identity);
        if (destroyed) return false;
        loaded.identity = keys.persisted;
        if (!stored && !await storage.set(storageKey, loaded)) return false;
        if (destroyed || !storage.eligible) return false;
        state = hubCredentialClone(loaded); identity = keys; enabled = true;
        return true;
      } catch (_) { disable(); return false; }
    })();
    return await initialization && !destroyed && enabled && storage.eligible;
  }
  async function publicIdentity() {
    return await ready() ? { publicJwk: hubCredentialClone(identity.publicJwk), fingerprint: identity.fingerprint } : null;
  }
  function pinHub(publicJwk, options = {}) {
    // First discovery is TOFU, not authentication of the host page. Never pin a reply.
    const result = queue.then(async () => {
      if (!await ready()) return false;
      try {
        await hubCredentialPeerKey(crypto, identity.privateKey, publicJwk);
        const fingerprint = await hubCredentialFingerprint(crypto, publicJwk);
        if (state.hubFingerprint && state.hubFingerprint !== fingerprint && options.replace !== true) return false;
        if (state.hubFingerprint === fingerprint) return true;
        const next = { ...state, hubFingerprint: fingerprint };
        if (!await storage.set(storageKey, next) || destroyed || !storage.eligible) { disable(); return false; }
        state = next; pending.clear();
        return true;
      } catch (_) { return false; }
    }).catch(() => { disable(); return false; });
    queue = result.then(() => undefined);
    return result;
  }
  async function createRequest(providerId, instance, requestId, options = {}) {
    if (!await ready()) return null;
    try {
      const route = hubCredentialRoute({ version: 1, scriptId, providerId, instance, requestId, expiresAt: Date.now() + HUB_CREDENTIAL_TTL, ...(options.pageId === undefined ? {} : { pageId: options.pageId }) });
      hubCredentialPrune(pending);
      const requestKey = hubCredentialRequestKey(route);
      if (pending.size >= HUB_CREDENTIAL_PENDING || pending.has(requestKey)) return null;
      const request = { ...route, publicJwk: hubCredentialClone(identity.publicJwk) };
      pending.set(requestKey, { ...route, encoded: JSON.stringify(request), hubFingerprint: state.hubFingerprint });
      return request;
    } catch (_) { return null; }
  }
  async function consumeReply(reply, request) {
    if (!await ready()) return null;
    try {
      const route = hubCredentialRoute(request), requestKey = hubCredentialRequestKey(route), owned = pending.get(requestKey);
      if (!owned || owned.encoded !== JSON.stringify(request) || route.scriptId !== scriptId) return null;
      // Claim synchronously before any crypto await so concurrent replay cannot win.
      pending.delete(requestKey);
      if (!state.hubFingerprint || owned.hubFingerprint !== state.hubFingerprint || !hubCredentialFresh(route) || reply?.status !== 'ok') return null;
      const replyRoute = hubCredentialRoute(reply);
      if (JSON.stringify(replyRoute) !== JSON.stringify(route)) return null;
      const hubFingerprint = await hubCredentialFingerprint(crypto, reply.publicJwk);
      if (hubFingerprint !== state.hubFingerprint) return null;
      const key = await hubCredentialPeerKey(crypto, identity.privateKey, reply.publicJwk);
      const nonce = hubCredentialUnhex(reply.nonce, 12);
      if (nonce.length !== 12) return null;
      const ciphertext = hubCredentialUnhex(reply.ciphertext, 32784);
      const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: hubCredentialAad(route, identity.fingerprint, hubFingerprint), tagLength: 128 }, key, ciphertext);
      if (destroyed || !enabled || !storage.eligible || !hubCredentialFresh(route) || state.hubFingerprint !== hubFingerprint) return null;
      const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return value.length && bytes.byteLength <= 32768 ? value : null;
    } catch (_) { return null; }
  }
  function destroy() { destroyed = true; disable(); }
  function isManaged(providerId) { return state?.managedProviders?.includes(providerId) === true; }
  function rememberManaged(providerId) {
    const result=queue.then(async()=>{
      if(!await ready() || !hubCredentialId(providerId))return false;
      if(isManaged(providerId))return true;
      const managedProviders=[...(state.managedProviders || []),providerId];if(managedProviders.length>20)return false;
      const next={...state,managedProviders};
      if(!await storage.set(storageKey,next) || destroyed || !storage.eligible){disable();return false;}
      state=next;return true;
    }).catch(()=>{disable();return false;});queue=result.then(()=>undefined);return result;
  }
  return { ready, publicIdentity, pinHub, createRequest, consumeReply, isManaged, rememberManaged, destroy };
}

module.exports = { createHubCredentialStorage, createHubCredentialVault, createHubCredentialClient };
