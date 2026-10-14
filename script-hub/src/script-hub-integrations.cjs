// Build-time registrations. Menu callbacks execute inside each original script.
const faction = 'https://www.torn.com/factions.php?step=your&type=1#/tab=crimes';
const targets = [
  {
    file: 'Torn_OC_Suite_Codex.user.js', id: 'oc-suite', name: 'OC Suite', icon: 'oc', url: faction,
    setup: `function hubOpenOc(tab) {
      if (!document.getElementById('ocm-root')) return 'navigate';
      const button = document.querySelector('#ocm-tabs [data-tab="' + tab + '"]');
      if (!button) return false;
      button.click(); return hubReveal('#ocm-root');
    }`,
    actions: [
      ['open', 'Open OC Suite', `return hubOpenOc('home');`],
      ['war', 'War payout report', `return hubOpenOc('war');`],
      ['consumables', 'Consumables', `return hubOpenOc('consumables');`],
      ['armoury', 'Armoury', `return hubOpenOc('armoury');`],
      ['settings', 'Settings', `const panel = document.getElementById('ocm-config-panel'); if (!panel) return 'navigate'; panel.style.display = 'block'; return hubReveal('#ocm-config-panel');`],
    ],
  },
  {
    file: 'Torn Gym Planner-3.37.txt', id: 'gym-planner', name: 'Gym Planner', icon: 'gym', url: 'https://www.torn.com/gym.php',
    setup: `function hubOpenGym(tab) { if (!wrap?.isConnected) return false; wrap.classList.add('open'); gg_save('ggCollapsed', 'no'); showTab(tab); return hubReveal('.gg-wrap'); }`,
    actions: [['open', 'Open planner', `return hubOpenGym('now');`], ['plan', 'Plan', `return hubOpenGym('plan');`], ['settings', 'Setup', `return hubOpenGym('setup');`], ['help', 'Help', `return hubOpenGym('help');`]],
  },
  {
    file: 'Torn_Pickpocketing_Colors_Status-Aware_2.1.user.js', id: 'pickpocketing', name: 'Pickpocketing', icon: 'crime', url: 'https://www.torn.com/loader.php?sid=crimes#/pickpocketing',
    setup: `function hubOpenPickpocket(view) { if (!isPickpocketRoute()) return 'navigate'; const helper = document.getElementById('pp-helper'); if (!helper) return false; selectHelperView(view, helper); return hubReveal('#pp-helper'); }`,
    actions: [['open', 'Target helper', `return hubOpenPickpocket('targets');`], ['insights', 'Insights', `return hubOpenPickpocket('insights');`], ['settings', 'Settings', `return hubOpenPickpocket('settings');`]],
  },
  {
    file: 'Torn_Property_Manager.user.js', id: 'property-manager', name: 'Property Manager', icon: 'property', url: 'https://www.torn.com/properties.php',
    setup: `function hubOpenProperty(tab) { if (!document.getElementById('tpm-root')) return false; MODEL.tab = tab; render(); return hubReveal('#tpm-root'); }`,
    actions: [['open', 'Rentals', `return hubOpenProperty('rentals');`], ['upgrades', 'Upgrades', `return hubOpenProperty('upgrades');`], ['profit', 'Profit', `return hubOpenProperty('profit');`]],
  },
  {
    file: 'Torn_Blackjack_Advisor.user.js', id: 'blackjack-advisor', name: 'Blackjack Advisor', icon: 'cards', url: 'https://www.torn.com/page.php?sid=blackjack',
    actions: [['open', 'Open advisor', `const root = document.getElementById(NS + '-panel'); if (!root) return false; if (cfg.collapsed) { cfg.collapsed = false; saveCfg(); els.body.style.display = 'block'; els.toggle.textContent = '▾'; } return hubReveal('#' + NS + '-panel');`]],
  },
  {
    file: 'Torn_Banker_Request.user.js', id: 'banker-request', name: 'Banker Request', icon: 'bank', url: 'https://www.torn.com/factions.php?step=your&type=1#/tab=armoury&sub=donate',
    actions: [['open', 'Open banker board', `if (!document.body) return false; if (!document.getElementById('bank-board')) openBoard(); return hubReveal('#bank-board');`], ['request', 'Request panel', `ensurePanel(); if (!document.getElementById('bank-req-panel')) return 'navigate'; return hubReveal('#bank-req-panel');`]],
  },
  {
    file: 'Torn_War_Tools.user.js', id: 'war-tools', name: 'War Tools', icon: 'war', url: 'https://www.torn.com/factions.php?step=your&type=1',
    setup: `function hubOpenWar(menu) { if (!document.body) return false; const selector = '.wt-modal-bg[data-hub-menu="' + menu + '"]'; if (document.querySelector(selector)) return hubReveal(selector); if (menu === 'settings') openSettings(); else openMassCallout(); const bg = document.querySelector('.wt-modal-bg'); if (!bg) return false; bg.dataset.hubMenu = menu; return hubReveal(selector); }`,
    actions: [['open', 'Settings', `return hubOpenWar('settings');`], ['callout', 'Mass callout menu', `return hubOpenWar('callout');`]],
  },
  {
    file: 'Torn War Payout Report-2.12.0.user.js', id: 'war-payout-report', name: 'War Payout Report', icon: 'war', url: 'https://www.torn.com/factions.php?step=your&type=1',
    actions: [['open', 'Open report', `if (!document.body) return false; openPanel(); return true;`]],
  },
  {
    file: 'Frostbite Faction Usage Command (Leader).js', id: 'faction-usage-leader', name: 'Faction Usage', icon: 'usage', url: 'https://www.torn.com/factions.php?step=your&type=1',
    setup: `function hubOpenUsage(settingsMenu) { const root = document.getElementById(APP_ID); if (!root) return false; state.open = true; if (settingsMenu) { state.settingsOpen = true; root.querySelector('.fu-settings').hidden = false; fillSettingsInputs(); } renderVisibility(); keepAllOnScreen(); return true; }`,
    actions: [['open', 'Open usage command', `return hubOpenUsage(false);`], ['settings', 'Settings', `return hubOpenUsage(true);`]],
  },
  {
    file: 'Frostbite Faction Usage Command (Member).js', id: 'faction-usage-member', name: 'Usage Reporter', icon: 'usage', url: 'https://www.torn.com/factions.php?step=your&type=1',
    actions: [['open', 'Open reporter', `return hubReveal('#' + APP_ID);`]],
  },
];

// Optional pages share the existing menu registration and private callbacks.
Object.assign(targets.find(target => target.id === 'oc-suite'), {pages: [{"id":"preferences","title":"Display and refresh","sections":[{"id":"display","title":"Display","fields":[{"id":"theme","type":"select","label":"Theme","options":[{"value":"default","label":"Default"}],"default":"default"},{"id":"cprWarn","type":"number","label":"CPR warning threshold","min":0,"max":100,"step":1,"unit":"%","default":70,"required":true},{"id":"cprCrit","type":"number","label":"CPR critical threshold","min":0,"max":100,"step":1,"unit":"%","default":60,"required":true},{"id":"refreshSeconds","type":"integer","label":"Refresh interval","min":30,"max":3600,"step":1,"unit":"seconds","default":60,"required":true}]}],"actions":[{"id":"settings","label":"Open original full settings"}]},{"id":"connection","title":"API connection","description":"Use your personal key as fallback, or approve this script in API Keys for an optional shared Torn key.","sections":[{"id":"connection","title":"Connection","fields":[{"id":"personalKeyPresent","type":"checkbox","label":"Personal fallback key configured","readOnly":true},{"id":"sharedKeyPresent","type":"checkbox","label":"Shared key available","readOnly":true},{"id":"personalApiKey","type":"secret","label":"Replace personal fallback key","description":"Write-only. Saved in this script’s existing key setting; shared keys are never copied here.","minLength":16,"maxLength":16}]}],"actions":[{"id":"settings","label":"Open original full settings"}]}], settingsSetup: `
const hubSettingsPages = [{"id":"preferences","title":"Display and refresh","sections":[{"id":"display","title":"Display","fields":[{"id":"theme","type":"select","label":"Theme","options":[{"value":"default","label":"Default"}],"default":"default"},{"id":"cprWarn","type":"number","label":"CPR warning threshold","min":0,"max":100,"step":1,"unit":"%","default":70,"required":true},{"id":"cprCrit","type":"number","label":"CPR critical threshold","min":0,"max":100,"step":1,"unit":"%","default":60,"required":true},{"id":"refreshSeconds","type":"integer","label":"Refresh interval","min":30,"max":3600,"step":1,"unit":"seconds","default":60,"required":true}]}],"actions":[{"id":"settings","label":"Open original full settings"}]},{"id":"connection","title":"API connection","description":"Use your personal key as fallback, or approve this script in API Keys for an optional shared Torn key.","sections":[{"id":"connection","title":"Connection","fields":[{"id":"personalKeyPresent","type":"checkbox","label":"Personal fallback key configured","readOnly":true},{"id":"sharedKeyPresent","type":"checkbox","label":"Shared key available","readOnly":true},{"id":"personalApiKey","type":"secret","label":"Replace personal fallback key","description":"Write-only. Saved in this script’s existing key setting; shared keys are never copied here.","minLength":16,"maxLength":16}]}],"actions":[{"id":"settings","label":"Open original full settings"}]}];
hubSettingsPages[0].sections[0].fields[0].options = Object.entries(THEMES).map(([value, theme]) => ({value, label: theme.label || value}));
function hubBindingRootReady() { return !!document.getElementById('ocm-root'); }
function hubBindingRefresh(key) {
  if (!key) { clearInterval(window._ocmRefresh); return; }
  if (_ocmLoadInFlight) hubBindingPending = true;
  else loadData(key);
  scheduleRefresh(key);
}
function hubReadSettings(page) {
  if (page === 'connection') return {personalKeyPresent: !!GM_getValue(GMK.API_KEY, ''), sharedKeyPresent: !!hubSharedTornKey};
  return {theme: GM_getValue(GMK.THEME, 'default'), cprWarn: CPR_WARN, cprCrit: CPR_CRIT, refreshSeconds: REFRESH_S};
}
function hubApplySettings(page, values) {
  if (page === 'connection') return;
  if (values.cprCrit > values.cprWarn) throw new Error('Critical threshold must not exceed the warning threshold.');
  const changed = CPR_WARN !== values.cprWarn || CPR_CRIT !== values.cprCrit || REFRESH_S !== values.refreshSeconds;
  saveConfig(values.cprWarn, values.cprCrit, WEIGHT_HIGH, WEIGHT_MID, values.refreshSeconds, MIN_PER_DIFF);
  GM_setValue(GMK.THEME, values.theme); applyTheme(values.theme);
  for (const [id, value] of [['ocm-theme-select',values.theme],['ocm-cfg-cpr-warn',values.cprWarn],['ocm-cfg-cpr-crit',values.cprCrit],['ocm-cfg-refresh',values.refreshSeconds]]) {
    const input = document.getElementById(id); if (input) input.value = String(value);
  }
  if (changed) hubBindingQueueRefresh();
}
async function hubSavePersonalSecrets(page, patch) {
  if (page !== 'connection' || !patch || Object.keys(patch).some(key => key !== 'personalApiKey') ||
      typeof patch.personalApiKey !== 'string' || !/^[a-zA-Z0-9]{16}$/.test(patch.personalApiKey)) throw new Error('Invalid personal key.');
  const before = hubEffectiveTornKey();
  GM_setValue(GMK.API_KEY, patch.personalApiKey);
  const input = document.getElementById('ocm-api-input'); if (input) input.value = '••••••••••••••••';
  if (before !== hubEffectiveTornKey()) hubBindingQueueRefresh();
}
const hubPrivateCredentialClient = createHubCredentialClient({storage: createHubCredentialStorage(getHubPlatformEnvironment(), 'oc-suite-hub-client-v1'), crypto: globalThis.crypto, scriptId: 'oc-suite'});
const hubSettingsFeatures = createHubScriptSettings(hubSettingsPages, hubReadSettings, hubApplySettings, hubPrivateCredentialClient, undefined, hubSavePersonalSecrets);

let hubBindingAttached = false, hubBindingPending = false, hubBindingTimer = null, hubBindingPdaActive = true;
function hubBindingAwake() {
  return document.visibilityState !== 'hidden' && hubBindingPdaActive && hubBindingRootReady();
}
function hubBindingQueueRefresh() {
  hubBindingPending = true;
  if (!hubBindingAttached || !hubBindingAwake() || hubBindingTimer !== null) return;
  hubBindingTimer = setTimeout(() => {
    hubBindingTimer = null;
    if (!hubBindingAttached || !hubBindingAwake() || !hubBindingPending) return;
    hubBindingPending = false;
    const key = hubEffectiveTornKey();
    hubBindingRefresh(key);
  }, 250);
}
function hubBindingVisibility() { if (hubBindingPending) hubBindingQueueRefresh(); }
function hubBindingTabState(event) {
  const info = event.detail;
  hubBindingPdaActive = info?.isActiveTab === true && info?.isWebViewVisible === true;
  if (!hubBindingPdaActive) { clearTimeout(hubBindingTimer); hubBindingTimer = null; }
  else hubBindingVisibility();
}
function hubBindingCredentialChanged(provider, value) {
  if (provider !== 'torn') return;
  const before = hubEffectiveTornKey();
  hubStoreSharedTornKey(value);
  if (before !== hubEffectiveTornKey()) hubBindingQueueRefresh();
}
Object.assign(hubSettingsFeatures, {
  sharedProviders: ['torn'],
  onSharedCredentialChange: hubBindingCredentialChanged,
  onAttach() {
    if (hubBindingAttached) return;
    hubBindingAttached = true;
    document.addEventListener('visibilitychange', hubBindingVisibility);
    window.addEventListener('tornpda:tabState', hubBindingTabState);
    if (typeof globalThis.PDA_getTabState === 'function') {
      hubBindingPdaActive = false;
      Promise.resolve().then(() => globalThis.PDA_getTabState()).then(info => {
        if (hubBindingAttached) hubBindingTabState({detail: info});
      }).catch(() => {});
    }
    hubBindingVisibility();
  },
  onDetach() {
    hubBindingAttached = false;
    document.removeEventListener('visibilitychange', hubBindingVisibility);
    window.removeEventListener('tornpda:tabState', hubBindingTabState);
    clearTimeout(hubBindingTimer); hubBindingTimer = null;
    hubStoreSharedTornKey(null);
  },
  onDispose() { hubSettingsFeatures.onDetach(); hubBindingPending = false; },
});`, features: 'hubSettingsFeatures', secrets: true, category: 'Faction'});
Object.assign(targets.find(target => target.id === 'gym-planner'), {pages: [{"id":"calculator","title":"Calculator preferences","sections":[{"id":"calculator","title":"Calculator","fields":[{"id":"statGoal","type":"integer","label":"Stat goal","min":0,"max":9007199254740991,"step":1,"default":300000,"required":true},{"id":"happy","type":"integer","label":"Maximum happy","min":0,"max":1000000000,"step":1,"default":4525,"required":true},{"id":"subscriber","type":"checkbox","label":"Subscriber","default":false},{"id":"stat","type":"select","label":"Training stat","options":[{"value":"strength","label":"Strength"},{"value":"speed","label":"Speed"},{"value":"defense","label":"Defense"},{"value":"dexterity","label":"Dexterity"}],"default":"strength"}]}],"actions":[{"id":"settings","label":"Open original full setup"}]},{"id":"connection","title":"API connection","description":"Use your personal key as fallback, or approve this script in API Keys for an optional shared Torn key.","sections":[{"id":"connection","title":"Connection","fields":[{"id":"personalKeyPresent","type":"checkbox","label":"Personal fallback key configured","readOnly":true},{"id":"sharedKeyPresent","type":"checkbox","label":"Shared key available","readOnly":true},{"id":"personalApiKey","type":"secret","label":"Replace personal fallback key","description":"Write-only. Saved in this script’s existing key setting; shared keys are never copied here.","minLength":16,"maxLength":16}]}],"actions":[{"id":"settings","label":"Open original full settings"}]}], settingsSetup: `
const hubSettingsPages = [{"id":"calculator","title":"Calculator preferences","sections":[{"id":"calculator","title":"Calculator","fields":[{"id":"statGoal","type":"integer","label":"Stat goal","min":0,"max":9007199254740991,"step":1,"default":300000,"required":true},{"id":"happy","type":"integer","label":"Maximum happy","min":0,"max":1000000000,"step":1,"default":4525,"required":true},{"id":"subscriber","type":"checkbox","label":"Subscriber","default":false},{"id":"stat","type":"select","label":"Training stat","options":[{"value":"strength","label":"Strength"},{"value":"speed","label":"Speed"},{"value":"defense","label":"Defense"},{"value":"dexterity","label":"Dexterity"}],"default":"strength"}]}],"actions":[{"id":"settings","label":"Open original full setup"}]},{"id":"connection","title":"API connection","description":"Use your personal key as fallback, or approve this script in API Keys for an optional shared Torn key.","sections":[{"id":"connection","title":"Connection","fields":[{"id":"personalKeyPresent","type":"checkbox","label":"Personal fallback key configured","readOnly":true},{"id":"sharedKeyPresent","type":"checkbox","label":"Shared key available","readOnly":true},{"id":"personalApiKey","type":"secret","label":"Replace personal fallback key","description":"Write-only. Saved in this script’s existing key setting; shared keys are never copied here.","minLength":16,"maxLength":16}]}],"actions":[{"id":"settings","label":"Open original full settings"}]}];
function hubBindingRootReady() { return !!wrap?.isConnected; }
function hubBindingRefresh(key) {
  if (!key) return;
  if (hubGymAutofillInFlight) hubBindingPending = true;
  else autofill();
}
function hubReadSettings(page) {
  if (page === 'connection') return {personalKeyPresent: !!_load('apiKey', ''), sharedKeyPresent: !!hubSharedTornKey};
  return {statGoal: Number(el.statGoal?.value || 0), happy: Number(el.happy?.value || 0), subscriber: el.subscriber?.value === 'yes', stat: el.stat?.value || 'strength'};
}
function hubApplySettings(page, values) {
  if (page === 'connection') return;
  for (const [name, value] of [['statGoal',String(values.statGoal)],['happy',String(values.happy)],['subscriber',values.subscriber ? 'yes' : 'no'],['stat',values.stat]]) {
    gg_save(name, value); if (el[name]) el[name].value = value;
  }
  updateGoalProgress(); updateDotsDisplay(); updateBestGymPanel(); updateBonusSummary(); renderPriceBreakdown(el.subscriber?.value); checkStatClash(); validateInputs(); maybeRecalc();
}
async function hubSavePersonalSecrets(page, patch) {
  if (page !== 'connection' || !patch || Object.keys(patch).some(key => key !== 'personalApiKey') ||
      typeof patch.personalApiKey !== 'string' || !/^[a-zA-Z0-9]{16}$/.test(patch.personalApiKey)) throw new Error('Invalid personal key.');
  const before = hubEffectiveTornKey(); _save('apiKey', patch.personalApiKey);
  if (el.apikey) { el.apikey.value = ''; el.apikey.placeholder = 'Key saved ✓'; }
  if (before !== hubEffectiveTornKey()) hubBindingQueueRefresh();
}
const hubPrivateCredentialClient = createHubCredentialClient({storage: createHubCredentialStorage(getHubPlatformEnvironment(), 'gym-planner-hub-client-v1'), crypto: globalThis.crypto, scriptId: 'gym-planner'});
const hubSettingsFeatures = createHubScriptSettings(hubSettingsPages, hubReadSettings, hubApplySettings, hubPrivateCredentialClient, undefined, hubSavePersonalSecrets);

let hubBindingAttached = false, hubBindingPending = false, hubBindingTimer = null, hubBindingPdaActive = true;
function hubBindingAwake() {
  return document.visibilityState !== 'hidden' && hubBindingPdaActive && hubBindingRootReady();
}
function hubBindingQueueRefresh() {
  hubBindingPending = true;
  if (!hubBindingAttached || !hubBindingAwake() || hubBindingTimer !== null) return;
  hubBindingTimer = setTimeout(() => {
    hubBindingTimer = null;
    if (!hubBindingAttached || !hubBindingAwake() || !hubBindingPending) return;
    hubBindingPending = false;
    const key = hubEffectiveTornKey();
    hubBindingRefresh(key);
  }, 250);
}
function hubBindingVisibility() { if (hubBindingPending) hubBindingQueueRefresh(); }
function hubBindingTabState(event) {
  const info = event.detail;
  hubBindingPdaActive = info?.isActiveTab === true && info?.isWebViewVisible === true;
  if (!hubBindingPdaActive) { clearTimeout(hubBindingTimer); hubBindingTimer = null; }
  else hubBindingVisibility();
}
function hubBindingCredentialChanged(provider, value) {
  if (provider !== 'torn') return;
  const before = hubEffectiveTornKey();
  hubStoreSharedTornKey(value);
  if (before !== hubEffectiveTornKey()) hubBindingQueueRefresh();
}
Object.assign(hubSettingsFeatures, {
  sharedProviders: ['torn'],
  onSharedCredentialChange: hubBindingCredentialChanged,
  onAttach() {
    if (hubBindingAttached) return;
    hubBindingAttached = true;
    document.addEventListener('visibilitychange', hubBindingVisibility);
    window.addEventListener('tornpda:tabState', hubBindingTabState);
    if (typeof globalThis.PDA_getTabState === 'function') {
      hubBindingPdaActive = false;
      Promise.resolve().then(() => globalThis.PDA_getTabState()).then(info => {
        if (hubBindingAttached) hubBindingTabState({detail: info});
      }).catch(() => {});
    }
    hubBindingVisibility();
  },
  onDetach() {
    hubBindingAttached = false;
    document.removeEventListener('visibilitychange', hubBindingVisibility);
    window.removeEventListener('tornpda:tabState', hubBindingTabState);
    clearTimeout(hubBindingTimer); hubBindingTimer = null;
    hubStoreSharedTornKey(null);
  },
  onDispose() { hubSettingsFeatures.onDetach(); hubBindingPending = false; },
});`, features: 'hubSettingsFeatures', secrets: true, category: 'Training'});
const reveal = `function hubReveal(selector) {
  const root = document.querySelector(selector); if (!root) return false;
  root.hidden = false; root.scrollIntoView({ behavior: 'smooth', block: 'center' });
  root.querySelector('button, [tabindex="0"], input:not([type="password"])')?.focus({ preventScroll: true });
  return true;
}`;
module.exports = { targets, reveal };
