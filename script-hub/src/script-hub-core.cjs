// Public menu metadata only. This module is bundled inside the universal hub.
function normalizeHubEntry(raw, origin) {
  const validId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
  const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  if (!raw || typeof raw !== 'object' || !validId(raw.id) || !text(raw.name, 80)) return null;
  if (!Array.isArray(raw.actions) || !raw.actions.length || raw.actions.length > 20) return null;
  let url;
  try {
    url = new URL(raw.url, origin);
    if (url.origin !== origin || url.protocol !== 'https:' || url.username || url.password || url.href.length > 512) return null;
    if (!/^\/[a-zA-Z0-9_-]+\.php$/.test(url.pathname)) return null;
    if ([...url.searchParams.keys()].some(key => !['step', 'type', 'sid'].includes(key))) return null;
    if (url.hash && !/^#[/a-zA-Z0-9=_&%-]*$/.test(url.hash)) return null;
  } catch (_) { return null; }
  const actions = [], ids = new Set();
  for (const action of raw.actions) {
    if (!action || !validId(action.id) || !text(action.label, 80) || ids.has(action.id)) return null;
    ids.add(action.id);
    actions.push({ id: action.id, label: action.label });
  }
  const icons = ['scripts', 'oc', 'gym', 'crime', 'property', 'cards', 'bank', 'war', 'usage'];
  const entry = {
    id: raw.id, name: raw.name.trim(), icon: icons.includes(raw.icon) ? raw.icon : 'scripts',
    version: typeof raw.version === 'string' ? raw.version.slice(0, 32) : '', url: url.href, actions,
  };
  if (typeof raw.category === 'string' && raw.category.length <= 40) entry.category = raw.category.trim();
  if (Array.isArray(raw.capabilities)) entry.capabilities = [...new Set(raw.capabilities.filter(value => ['settings','credentials','secret-settings','appearance','hub-keys-v2'].includes(value)))];
  if(Array.isArray(raw.credentialProviders))entry.credentialProviders=[...new Set(raw.credentialProviders.filter(value=>['torn','tornstats','ffscouter'].includes(value)))];
  if(['script','main'].includes(raw.credentialScope))entry.credentialScope=raw.credentialScope;
  if (Array.isArray(raw.pages) && raw.pages.length <= 20) {
    const pageIds = new Set();
    entry.pages = [];
    for (const page of raw.pages) {
      if (!page || !validId(page.id) || !text(page.title, 80) || pageIds.has(page.id)) continue;
      pageIds.add(page.id); entry.pages.push({ id: page.id, title: page.title });
    }
  }
  return entry;
}

function createHubRegistry(origin, savedEntries) {
  const items = new Map();
  function insert(raw, active) {
    const entry = normalizeHubEntry(raw, origin);
    if (!entry || (!items.has(entry.id) && items.size >= 100)) return null;
    const instance = active && typeof raw.instance === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(raw.instance) ? raw.instance : '';
    const candidate = raw.credentialIdentity;
    const credentialIdentity = active && candidate?.publicJwk?.kty === 'EC' && candidate.publicJwk.crv === 'P-256'
      && /^[a-zA-Z0-9_-]{43}$/.test(candidate.publicJwk.x) && /^[a-zA-Z0-9_-]{43}$/.test(candidate.publicJwk.y)
      ? {publicJwk:{kty:'EC',crv:'P-256',x:candidate.publicJwk.x,y:candidate.publicJwk.y,ext:true},fingerprint:typeof candidate.fingerprint === 'string' ? candidate.fingerprint.slice(0,80) : ''} : null;
    items.set(entry.id, { ...entry, active, instance, credentialIdentity });
    return entry;
  }
  if (Array.isArray(savedEntries)) savedEntries.slice(0, 100).forEach(entry => insert(entry, false));
  return {
    register: raw => insert(raw, true),
    get: id => items.get(id),
    entries: () => [...items.values()].sort((a, b) => a.name.localeCompare(b.name)),
    forget: id => items.delete(id),
    deactivate: (id, instance) => { const item = items.get(id); if (item && item.instance === instance) item.active = false; },
    deactivateAll: () => { for (const item of items.values()) item.active = false; },
    snapshot: () => [...items.values()].map(({ active, instance, credentialIdentity, ...entry }) => entry),
  };
}

module.exports = { normalizeHubEntry, createHubRegistry };
