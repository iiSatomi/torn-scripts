// Bundled after script-hub-core.cjs inside the hub's private IIFE.
(function bootHub() {
if (location.protocol !== 'https:' || location.hostname !== 'www.torn.com' || window.top !== window.self) return;
// PDA may inject at document-start, before even the HTML element exists.
// Defer only that early case; ordinary document-end startup stays immediate.
if (!document.documentElement) {
  document.addEventListener('DOMContentLoaded', bootHub, {once:true});
  return;
}
const HUB_PREFIX = 'torn-script-hub:v1:';
const CATALOG_KEY = 'torn-script-hub:v1:catalog';
const PENDING_KEY = 'torn-script-hub:v1:pending';
const OWNER_KEY = 'torn-script-hub:v1:owner';
if (document.documentElement.hasAttribute(OWNER_KEY)) return;
document.documentElement.setAttribute(OWNER_KEY, '1');
let saved = [];
try { saved = JSON.parse(localStorage.getItem(CATALOG_KEY) || '[]'); } catch (_) {}
const registry = createHubRegistry(location.origin, saved);
const settingsController = createHubSettingsController({doc:document,win:window,registry,emit,button,icon,launch,navigatePage,getDialog:()=>dialog,say,render,onPreferences:()=>{placeLauncher();windowController.update();},resetWindow:()=>windowController.reset()});
const windowController = createHubWindowController({doc:document,win:window,getPreferences:()=>settingsController.preferences().window,onChange:next=>settingsController.saveWindow(next)});
let launcher, slot, controlRow, dialog, grid, actionList, status, observer, frame = null;
let mounted = false, awake = true, pdaActive = true, requestCounter = 0;
let actionTimer = null, retryTimer = null, pendingTimer = null, actionInFlight = null, pendingAttempts = 0;
let selectedScript = null, pending = null;
try {
  const raw = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
  if (raw && typeof raw.id === 'string' && typeof raw.action === 'string' && Number.isFinite(raw.expires)
      && raw.expires > Date.now() && raw.expires <= Date.now() + 30000) pending = raw;
  else sessionStorage.removeItem(PENDING_KEY);
} catch (_) {}

const ICONS = {
  settings: '<path d="M9 3h6l1 4 4 1v7l-4 1-1 5H9l-1-5-4-1V8l4-1z"/><circle cx="12" cy="12" r="3"/>',
  themes: '<path d="M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4c0-4-5-6-9-6z"/><path d="M7 9h.01M11 6h.01M16 7h.01M6 14h.01"/>',
  keys: '<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-5-5 3-3m-1 5 3-3"/>',
  scripts: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>',
  oc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
  gym: '<path d="M7 12h10M3 8v8m4-11v14M17 5v14m4-11v8"/>',
  crime: '<path d="M6 10V8a6 6 0 0 1 12 0v2M4 10h16v11H4zM12 14v3"/>',
  property: '<path d="m2 11 10-8 10 8M5 9v12h14V9M10 21v-8h4v8"/>',
  cards: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="m12 8 4 4-4 4-4-4z"/>',
  bank: '<path d="m3 7 9-4 9 4M3 8h18M5 10v7m7-7v7m7-7v7M3 18h18M2 21h20"/>',
  war: '<path d="m3 3 14 14m0-4v4h-4M21 3 7 17m0-4v4h4M3 21l4-4m10 0 4 4"/>',
  usage: '<path d="M4 21V13h4v8m2 0V8h4v13m2 0V3h4v18"/>',
};
function icon(name) {
  const span = document.createElement('span');
  span.className = 'tsh-icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || ICONS.scripts) + '</svg>';
  return span;
}
function button(label, cls, click) {
  const node = document.createElement('button');
  node.type = 'button'; node.className = cls; node.textContent = label;
  node.addEventListener('click', click);
  return node;
}
function emit(name, value) { document.dispatchEvent(new CustomEvent(HUB_PREFIX + name, { detail: JSON.stringify(value) })); }
function parse(event) {
  try { return typeof event.detail === 'string' && event.detail.length <= 16000 ? JSON.parse(event.detail) : null; } catch (_) { return null; }
}
function persist() {
  try { localStorage.setItem(CATALOG_KEY, JSON.stringify(registry.snapshot())); } catch (_) {}
}
function say(message) { if (status) status.textContent = message; }
function clearPending() {
  pending = null; pendingAttempts = 0;
  clearTimeout(retryTimer); retryTimer = null;
  clearTimeout(pendingTimer); pendingTimer = null;
  try { sessionStorage.removeItem(PENDING_KEY); } catch (_) {}
}
function closeHub(restore = true, force = false) {
  if (!dialog) return;
  if (!force && !settingsController.allowLeave(()=>closeHub(restore,true))) return;
  if (restore) clearPending();
  clearTimeout(actionTimer); actionTimer = null; actionInFlight = null;
  settingsController.cancelPrompt();
  windowController.close();
  dialog.hidden = true;
  launcher?.setAttribute('aria-expanded', 'false');
  if (restore && launcher?.isConnected) launcher.focus({ preventScroll: true });
}
function openHub() {
  if (!dialog?.isConnected) return;
  dialog.hidden = false;
  launcher.setAttribute('aria-expanded', 'true');
  selectedScript = null;
  say(''); render();
  settingsController.open();
  windowController.open();
  focusScriptUiWindow(document,dialog);
  dialog.querySelector('.tsh-close').focus({ preventScroll: true });
  emit('discover', {});
}
function renderActions() {
  if (!actionList) return;
  for (const tile of grid.querySelectorAll('[data-script]')) tile.querySelector('.tsh-more')?.setAttribute('aria-expanded', String(tile.dataset.script === selectedScript));
  actionList.replaceChildren();
  const entry = settingsController.isScriptView() ? registry.get(selectedScript) : null;
  actionList.hidden = !entry;
  if (!entry) return;
  const title = document.createElement('h3'); title.textContent = entry.name;
  actionList.append(title);
  for (const action of entry.actions) {
    actionList.append(button(action.label, 'tsh-action', () => launch(entry.id, action.id)));
  }
  if (!entry.active) actionList.append(button('Forget shortcut', 'tsh-forget', () => {
    registry.forget(entry.id); selectedScript = null; persist(); render();
  }));
}
function render() {
  if (!grid || dialog.hidden) return;
  const focused = document.activeElement;
  const focusId = focused?.closest('[data-script]')?.dataset.script;
  const focusClass = focused?.classList.contains('tsh-more') ? '.tsh-more' : focused?.classList.contains('tsh-pin') ? '.tsh-pin' : '.tsh-primary';
  const visibleEntries = settingsController.filterEntries(registry.entries());
  if (selectedScript && !visibleEntries.some(entry => entry.id === selectedScript)) selectedScript = null;
  grid.replaceChildren();
  for (const entry of visibleEntries) {
    const tile = document.createElement('div'); tile.className = 'tsh-tile'; tile.dataset.script = entry.id;
    const primary = button('', 'tsh-primary', () => launch(entry.id, entry.actions[0].id));
    primary.title = entry.active ? entry.name + ' — ' + entry.actions[0].label : 'Go to ' + entry.name + ' and open menu';
    primary.append(icon(entry.icon));
    const name = document.createElement('span'); name.className = 'tsh-name'; name.textContent = entry.name;
    const state = document.createElement('span'); state.className = 'tsh-state'; state.textContent = entry.active ? 'On this page' : 'Go to page';
    primary.append(name, state); tile.append(primary);
    const controls=document.createElement('div');controls.className='tsh-tile-controls';controls.append(settingsController.pinButton(entry));
    if (entry.actions.length > 1 || !entry.active) {
      const more = button('More', 'tsh-more', () => { selectedScript = selectedScript === entry.id ? null : entry.id; renderActions(); more.setAttribute('aria-expanded', String(selectedScript === entry.id)); });
      more.setAttribute('aria-label', entry.name + ' actions');
      more.setAttribute('aria-controls', 'tsh-actions'); more.setAttribute('aria-expanded', String(selectedScript === entry.id));
      controls.append(more);
    }
    tile.append(controls);
    grid.append(tile);
  }
  if (!visibleEntries.length) {
    const empty = document.createElement('p'); empty.className = 'tsh-empty';
    empty.textContent = registry.entries().length ? 'No scripts match your search or category.' : 'Your script menus will appear here as connected scripts load. Visit each script’s page once to add its shortcut.';
    grid.append(empty);
  }
  dialog.querySelector('.tsh-count').textContent = registry.entries().length + ' scripts';
  renderActions();
  if (focusId) [...grid.querySelectorAll('[data-script]')].find(el => el.dataset.script === focusId)?.querySelector(focusClass)?.focus({ preventScroll: true });
}
function navigate(entry, action) {
    const next = { id: entry.id, action, expires: Date.now() + 30000 };
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(next)); }
    catch (_) { say('This browser cannot remember the requested menu. Open the script on its page.'); return; }
    pending = next; pendingAttempts = 0;
    location.assign(entry.url);
}
function navigatePage(entry,page) {
  const next={id:entry.id,action:entry.actions[0].id,page,expires:Date.now()+30000};
  try{sessionStorage.setItem(PENDING_KEY,JSON.stringify(next));}catch(_){say('This browser cannot remember the requested settings page.');return;}
  pending=next;pendingAttempts=0;location.assign(entry.url);
}
function launch(id, action, isPending = false) {
  if(!isPending&&!settingsController.allowLeave(()=>launch(id,action,isPending)))return;
  const entry = registry.get(id);
  if (!entry || !entry.actions.some(item => item.id === action) || actionInFlight) return;
  if (!isPending) clearPending();
  if (!entry.active) { navigate(entry, action); return; }
  const request = 'hub-' + Date.now() + '-' + (++requestCounter);
  actionInFlight = { id, action, request, instance: entry.instance, isPending, windows: new Set(scriptUiFloatingWindows(document)) };
  actionTimer = setTimeout(() => {
    actionInFlight = null; actionTimer = null;
    if (isPending) clearPending();
    if (dialog?.hidden) openHub();
    say('This script did not respond. Reload its page or check that it is enabled.');
  }, 2000);
  emit('activate', { id, action, request, instance: entry.instance });
}
function resumePending() {
  if (!pending || actionInFlight || retryTimer || !awake) return;
  if (pending.expires <= Date.now()) { clearPending(); openHub(); say('The menu request expired. Select the script again.'); return; }
  if (!pendingTimer) pendingTimer = setTimeout(() => {
    clearPending(); openHub(); say('This script did not load. Check that it is enabled, or select its shortcut again.');
  }, Math.max(0, pending.expires - Date.now()));
  const entry = registry.get(pending.id);
  if (!entry?.active) return;
  if(pending.page){
    if(!entry.pages?.some(page=>page.id===pending.page)){clearPending();openHub();say('This settings page is no longer available. Choose another page.');return;}
    const page=pending.page,id=pending.id;clearPending();openHub();settingsController.openPage(id,page);return;
  }
  if (!entry.actions.some(action => action.id === pending.action)) { clearPending(); openHub(); say('This menu is no longer available.'); return; }
  pendingAttempts++;
  launch(pending.id, pending.action, true);
}
function onRegister(event) {
  const entry = registry.register(parse(event));
  if (!entry) return;
  if(actionInFlight?.id===entry.id&&actionInFlight.instance!==registry.get(entry.id)?.instance){
    clearTimeout(actionTimer);actionTimer=null;actionInFlight=null;say('The script reloaded. Select its menu again.');
  }
  persist(); render(); resumePending();
  settingsController.refresh();
}
function onUnregister(event) {
  const entry = parse(event);
  if (entry && typeof entry.id === 'string') { registry.deactivate(entry.id, entry.instance); render(); }
}
function onResult(event) {
  const result = parse(event), request = actionInFlight;
  if (!request || !result || result.id !== request.id || result.action !== request.action || result.request !== request.request || result.instance !== request.instance) return;
  const owner=registry.get(request.id);
  if(!owner?.active||owner.instance!==request.instance){clearTimeout(actionTimer);actionTimer=null;actionInFlight=null;return;}
  if (!['opened', 'not-ready', 'navigate', 'error'].includes(result.status)) return;
  clearTimeout(actionTimer); actionTimer = null; actionInFlight = null;
  if (result.status === 'opened') {
    if (request.isPending) clearPending();
    // Legacy actions focus their own menus. Include the outer fixed backdrop;
    // raising a child alone cannot escape its parent's stacking context.
    const focused=scriptUiFloatingOwner(document,document.activeElement);
    const declared=[...document.querySelectorAll('[data-tsui-owner="'+owner.id+'"]')].map(root=>scriptUiFloatingOwner(document,root)).filter(node=>node&&!node.hidden&&node.getClientRects().length);
    const target=declared.find(node=>node.contains(document.activeElement))||declared.at(-1)||focused;
    if(target&&target!==dialog){target.setAttribute('data-tsui-stack-window','1');focusScriptUiWindow(document,target);}
    else {const opened=scriptUiFloatingWindows(document).filter(node=>node!==dialog&&!request.windows.has(node));if(opened.length)focusScriptUiWindow(document,opened.at(-1));}
    const platform=getHubPlatformEnvironment();
    if(platform.PDA_storage||typeof platform.PDA_getTabState==='function'||typeof platform.PDA_httpGet==='function')closeHub(false);
    if(!dialog?.hidden)say(owner.name+' opened.'); return;
  }
  if (result.status === 'navigate' && !request.isPending) { navigate(registry.get(request.id), request.action); return; }
  if (['not-ready', 'navigate'].includes(result.status) && request.isPending && pendingAttempts < 20 && pending?.expires > Date.now()) {
    retryTimer = setTimeout(() => { retryTimer = null; resumePending(); }, 500);
    return;
  }
  if (request.isPending) clearPending();
  if (dialog?.hidden) openHub();
  say(result.status === 'not-ready' ? 'The script menu is still loading. Try again in a moment.' : 'The script could not open its menu. Try its original control.');
}

function findControlRow() {
  const scope = document.querySelector('#sidebar') || document.querySelector('[class*="sidebar"]');
  if (!scope) return null;
  const mail = scope.querySelector('a[href*="messages.php"]');
  let row = mail?.parentElement;
  for (let depth = 0; row && row !== scope && depth < 5; depth++, row = row.parentElement) {
    if (!row.querySelector('a[href*="events.php"], a[href*="sid=events"]') || !row.querySelector('a[href*="awards.php"], a[href*="sid=awards"]')) continue;
    const bounds = row.getBoundingClientRect();
    if (bounds.width > 0 && bounds.width < 400 && bounds.height > 0 && bounds.height < 100) return row;
  }
  return null;
}
function placeLauncher() {
  if (!launcher) return;
  // Touch layouts may keep a measurable sidebar outside the visible viewport.
  // Give those screens a stable launcher independent of the sidebar drawer.
  const compact = window.innerWidth <= 600 || window.innerHeight <= 500 || window.matchMedia?.('(pointer:coarse)')?.matches === true;
  const row = settingsController.preferences().placement==='floating'||compact?null:findControlRow();
  if (controlRow !== row) { controlRow?.classList.remove('tsh-account-row'); controlRow = row; }
  if (row) {
    row.classList.add('tsh-account-row');
    const list = ['UL', 'OL'].includes(row.tagName);
    if (!slot || slot.tagName !== (list ? 'LI' : 'DIV')) {
      slot?.remove(); slot = document.createElement(list ? 'li' : 'div'); slot.id = 'tsh-slot';
    }
    if (slot.parentNode !== row) row.append(slot);
    if (launcher.parentNode !== slot) slot.append(launcher);
    launcher.classList.remove('tsh-floating');
  } else if (document.body) {
    document.body.append(launcher); slot?.remove(); slot = null;
    launcher.classList.add('tsh-floating');
  }
}
function mount() {
  if (!document.body) return;
  if (!document.getElementById('tsh-style')) {
    const style = document.createElement('style'); style.id = 'tsh-style';
    style.textContent = `
      #sidebar .tsh-account-row{display:flex!important;align-items:stretch}
      #sidebar .tsh-account-row>div,#sidebar .tsh-account-row>li{flex:1 1 0!important;min-width:0!important;width:auto!important}
      #tsh-slot{display:inline-flex;vertical-align:middle;flex:1 1 0;list-style:none;min-width:30px;margin:0;padding:0}
      #tsh-launcher{box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:100%;height:34px;min-width:32px;padding:6px;border:1px solid #1c1c1c;border-radius:3px;background:linear-gradient(#494949,#2b2b2b);color:#bdbdbd;cursor:pointer}
      #tsh-launcher:hover{background:linear-gradient(#575757,#343434);color:#d9ef9e}
      #tsh-launcher .tsh-icon{width:19px;height:19px;display:block}
      #tsh-launcher svg,#tsh-dialog svg{width:100%;height:100%}
      #tsh-launcher.tsh-floating{position:fixed;left:calc(10px + env(safe-area-inset-left,0px));bottom:calc(14px + env(safe-area-inset-bottom,0px));width:44px;height:44px;z-index:2147483000;box-shadow:0 3px 12px #0009}
      #tsh-dialog,#tsh-dialog *{box-sizing:border-box}
      #tsh-dialog[hidden],#tsh-dialog [hidden]{display:none!important}
      #tsh-dialog{position:fixed;z-index:2147483001;inset:0;width:min(510px,calc(100vw - 24px));height:fit-content;max-height:calc(100dvh - 32px);margin:auto;overflow:auto;color:#e5e5e5;background:#303030;border:1px solid #505050;border-radius:7px;box-shadow:0 12px 50px #000b;font:13px Arial,sans-serif;color-scheme:dark;overscroll-behavior:contain}
      #tsh-dialog .tsh-header{display:flex;align-items:center;gap:12px;padding:8px 12px;background:linear-gradient(#4a4a4a,#353535);border-bottom:1px solid #202020;position:sticky;top:0;z-index:1}
      #tsh-dialog h2{font-size:15px;margin:0;flex:1;color:#fff}
      #tsh-dialog .tsh-count{color:#c7e67c;font-size:12px}
      #tsh-dialog button{font:inherit;color:inherit;cursor:pointer}
      #tsh-dialog .tsh-close{width:32px;height:32px;background:#2d2d2d;border:1px solid #202020;border-radius:4px;font-size:21px}
      #tsh-dialog .tsh-intro{margin:12px 14px 0;color:#bababa;font-size:12px}
      #tsh-dialog .tsh-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:10px;padding:14px}
      #tsh-dialog .tsh-tile{min-width:0;display:flex;flex-direction:column}
      #tsh-dialog .tsh-primary{display:flex;align-items:center;flex-direction:column;gap:7px;min-height:106px;width:100%;padding:12px 5px 8px;border:1px solid #171717;border-radius:5px;background:linear-gradient(#404040,#292929);box-shadow:inset 0 1px 0 #ffffff0c;text-align:center}
      #tsh-dialog .tsh-primary:hover,#tsh-dialog .tsh-action:hover{background:linear-gradient(#4e4e4e,#353535);border-color:#809947}
      #tsh-dialog .tsh-icon{display:block;width:28px;height:28px;color:#b8b8b8}
      #tsh-dialog .tsh-primary:hover .tsh-icon{color:#d4e89b}
      #tsh-dialog .tsh-name{font-size:12px;line-height:1.3;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      #tsh-dialog .tsh-state{font-size:10px;color:#b9ce8b}
      #tsh-dialog .tsh-more{min-height:28px;margin-top:4px;background:#252525;border:1px solid #1b1b1b;border-radius:3px;color:#bdbdbd;font-size:11px}
      #tsh-dialog .tsh-actions{padding:0 14px 14px;display:flex;flex-wrap:wrap;gap:7px}
      #tsh-dialog h3{width:100%;font-size:13px;margin:0 0 4px}
      #tsh-dialog .tsh-action,#tsh-dialog .tsh-forget{min-height:36px;background:#383838;border:1px solid #181818;border-radius:4px;padding:7px 12px}
      #tsh-dialog .tsh-forget{color:#d8b4a4}
      #tsh-dialog .tsh-empty{grid-column:1/-1;margin:0;line-height:1.6;color:#bdbdbd}
      #tsh-dialog .tsh-status{margin:0;padding:0 14px 12px;line-height:1.5;color:#ecdca5}
      #tsh-dialog .tsh-status:empty{padding:0}
      #tsh-launcher:focus-visible,#tsh-dialog button:focus-visible{outline:2px solid #c7e67c;outline-offset:2px}
      @media(max-width:600px){#tsh-launcher{min-height:44px}#tsh-dialog .tsh-close{width:44px;height:44px}#tsh-dialog .tsh-more,#tsh-dialog .tsh-action,#tsh-dialog .tsh-forget{min-height:44px}#tsh-dialog{max-height:calc(100dvh - 24px)}#tsh-dialog .tsh-grid{gap:8px}}
    `;
    (document.head || document.documentElement).append(style);
  }
  if (!launcher) {
    launcher = button('', '', () => dialog?.hidden ? openHub() : closeHub()); launcher.id = 'tsh-launcher'; launcher.title = 'Script menus';
    launcher.setAttribute('aria-label', 'Open script menus'); launcher.setAttribute('aria-expanded', 'false'); launcher.setAttribute('aria-controls', 'tsh-dialog');
    launcher.append(icon('scripts'));
  }
  if (!dialog?.isConnected) {
    settingsController.cancelPrompt();
    dialog = document.createElement('section'); dialog.id = 'tsh-dialog'; dialog.hidden = true;
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-labelledby', 'tsh-title');
    const header = document.createElement('div'); header.className = 'tsh-header';
    const title = document.createElement('h2'); title.id = 'tsh-title'; title.textContent = 'Script menus';
    const count = document.createElement('span'); count.className = 'tsh-count';
    const close = button('×', 'tsh-close', () => closeHub()); close.setAttribute('aria-label', 'Close script menus');
    header.append(title, count, close);
    appendScriptUiHeaderArt(document,header);
    const intro = document.createElement('p'); intro.className = 'tsh-intro'; intro.textContent = 'All your connected tools, in one place.';
    grid = document.createElement('div'); grid.className = 'tsh-grid';
    actionList = document.createElement('div'); actionList.className = 'tsh-actions'; actionList.id = 'tsh-actions'; actionList.hidden = true;
    status = document.createElement('p'); status.className = 'tsh-status'; status.setAttribute('role', 'status');
    dialog.append(header, intro, grid, actionList, status); document.body.append(dialog);
    settingsController.mount(dialog);
    dialog.addEventListener('pointerdown',()=>focusScriptUiWindow(document,dialog));
    dialog.addEventListener('focusin',()=>focusScriptUiWindow(document,dialog));
  }
  windowController.mount(dialog);
  placeLauncher();
}
function scheduleMount() {
  if (!awake || frame !== null) return;
  frame = requestAnimationFrame(() => { frame = null; mount(); });
}
function observe() {
  if (!awake || !mounted) return;
  if (!observer) observer = new MutationObserver(records => {
    // Ignore our own grid updates and Torn's rapidly changing text counters.
    if (!dialog?.isConnected || !launcher?.isConnected || records.some(record => record.type === 'attributes' || [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && !dialog?.contains(node) && node !== dialog && node !== launcher && node !== slot))) scheduleMount();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
function onKey(event) {
  if (dialog?.hidden || event.defaultPrevented) return;
  if (event.key === 'Escape' && windowController.cancelInteraction()) { event.preventDefault(); return; }
  if (scriptUiFloatingWindows(document).at(-1) !== dialog) return;
  // The hub can stay open while Torn controls own keyboard focus.
  if (!dialog.contains(event.target) && !launcher?.contains(event.target)) return;
  if (event.key === 'Escape') { event.preventDefault(); if(settingsController.cancelPrompt())return;closeHub(); }
  if (event.key === 'Tab') {
    const scope = dialog.querySelector('.tsh-discard-confirm') || dialog;
    const focusable = [...scope.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(el => !el.disabled&&el.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
}
function onWindowFocus(event) {
  if(!awake||!dialog||dialog.hidden)return;
  const owner=scriptUiFloatingWindows(document).find(node=>node.contains(event.target));
  if(owner)focusScriptUiWindow(document,owner);
}
function onRoute() { closeHub(false,true); emit('discover', {}); scheduleMount(); }
function updateActivity() {
  awake = document.visibilityState !== 'hidden' && pdaActive;
  settingsController.activity(awake);
  if (awake) { observe(); scheduleMount(); emit('discover', {}); resumePending(); }
  else {
    observer?.disconnect();
    if (frame !== null) cancelAnimationFrame(frame); frame = null;
    clearTimeout(retryTimer); retryTimer = null;
    clearTimeout(pendingTimer); pendingTimer = null;
    closeHub(false,true);
  }
}
function onPda(event) { const info = event.detail; pdaActive = info?.isActiveTab === true && info?.isWebViewVisible === true; updateActivity(); }
function start() {
  if (mounted) return;
  // Re-read on BFCache restore: the destination may already have consumed it.
  try {
    const stored = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
    pending = stored && typeof stored.id === 'string' && typeof stored.action === 'string' && Number.isFinite(stored.expires)
      && stored.expires > Date.now() && stored.expires <= Date.now() + 30000 ? stored : null;
  } catch (_) { pending = null; }
  mounted = true;
  settingsController.start();
  document.addEventListener(HUB_PREFIX + 'register', onRegister);
  document.addEventListener(HUB_PREFIX + 'unregister', onUnregister);
  document.addEventListener(HUB_PREFIX + 'result', onResult);
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onWindowFocus);
  document.addEventListener('focusin', onWindowFocus);
  document.addEventListener('visibilitychange', updateActivity);
  window.addEventListener('hashchange', onRoute);
  window.addEventListener('popstate', onRoute);
  window.addEventListener('resize', scheduleMount);
  window.addEventListener('tornpda:tabState', onPda);
  mount(); updateActivity();
}
function stop() {
  mounted = false;
  windowController.stop();
  settingsController.stop();
  observer?.disconnect(); observer = null;
  if (frame !== null) cancelAnimationFrame(frame); frame = null;
  clearTimeout(actionTimer); clearTimeout(retryTimer); clearTimeout(pendingTimer); actionTimer = retryTimer = pendingTimer = null; actionInFlight = null;
  document.removeEventListener(HUB_PREFIX + 'register', onRegister);
  document.removeEventListener(HUB_PREFIX + 'unregister', onUnregister);
  document.removeEventListener(HUB_PREFIX + 'result', onResult);
  document.removeEventListener('keydown', onKey);
  document.removeEventListener('pointerdown', onWindowFocus);
  document.removeEventListener('focusin', onWindowFocus);
  document.removeEventListener('visibilitychange', updateActivity);
  window.removeEventListener('hashchange', onRoute);
  window.removeEventListener('popstate', onRoute);
  window.removeEventListener('resize', scheduleMount);
  window.removeEventListener('tornpda:tabState', onPda);
  registry.deactivateAll();
  launcher?.remove(); slot?.remove(); dialog?.remove();
  controlRow?.classList.remove('tsh-account-row'); controlRow = null;
  launcher = slot = dialog = grid = actionList = status = null;
  document.getElementById('tsh-style')?.remove();
}
window.addEventListener('pagehide', stop);
window.addEventListener('pageshow', start);
start();
if (typeof globalThis.PDA_getTabState === 'function') {
  Promise.resolve().then(() => globalThis.PDA_getTabState()).then(info => { pdaActive = info?.isActiveTab === true && info?.isWebViewVisible === true; updateActivity(); }).catch(() => {});
}
})();
