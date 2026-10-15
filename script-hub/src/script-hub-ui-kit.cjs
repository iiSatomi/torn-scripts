'use strict';

/** Shared, framework-free native script surfaces. No network or storage is owned here.
 * createTornScriptUI({doc,win,id,title,surface,mount,applyTheme,theme,themeClient,
 *   ownsThemeClient:false,sections:[{id,label,node,footer,headerAction,render(host,ui)}],settings,inspector,
 *   onVisibilityChange(active),onSelect(id),onClose(),onDestroy(),autoDestroyOnDetach:true,
 *   readLayout(),writeLayout({version:1,desktop,mobile})}).
 * Layout adapters are optional, may be async, and receive only a bounded geometry
 * profile (x/y/width/height/locked/collapsed/selected). Mount never waits for IO;
 * interaction wins over a pending read. Writes coalesce to one pending snapshot.
 * Render callbacks run once; their optional returned cleanup runs on destroy.
 * A section node and the public content/settings/inspector slots are escape hatches
 * for native script UI. Scripts own drafts, refreshes, jobs, persistence and secrets.
 * themeClient supports get/start/stop; use setTheme in its onChange callback.
 * notice(text,{kind}), status(text), task({id,label,onCancel,onPause,onResume}),
 * table({columns:[{key,label}],rows,limit}) are bounded text-only helpers.
 * Tasks never cancel implicitly; visibility is reported for script-owned policies.
 */
function createTornScriptUI(options = {}) {
  const doc = options.doc;
  const win = options.win || (doc && doc.defaultView);
  if (!doc || typeof doc.createElement !== 'function' || !win) throw new TypeError('UI kit requires a document and window');
  if (typeof options.applyTheme !== 'function') throw new TypeError('UI kit requires applyTheme');
  // Isolated userscript worlds share DOM, but cannot safely share JS objects.
  // Only version, visibility and stack order cross this coordination boundary.
  let style = doc.querySelector('style[data-tsui-style="1"]');
  if (!style) {
    style = doc.createElement('style'); style.setAttribute('data-tsui-style', '1');
    (doc.head || doc.documentElement).append(style);
  }
  // Independently updated scripts can arrive in either order. Upgrade older
  // shared CSS once, while leaving a future revision owned by a newer bundle.
  const styleRevision=Number(style.getAttribute('data-tsui-style-revision'));
  if(!Number.isSafeInteger(styleRevision)||styleRevision<2){style.textContent=scriptUiKitCss();style.setAttribute('data-tsui-style-revision','2');}
  let launcherTray = doc.querySelector('[data-tsui-launchers="1"]');
  if (!launcherTray) {
    launcherTray = doc.createElement('div'); launcherTray.className = 'tsui-launchers';
    launcherTray.setAttribute('data-tsui-launchers', '1');
    (doc.body || doc.documentElement).append(launcherTray);
  }
  const cleanups = [];
  const tasks = new Map();
  const sections = new Map();
  const floating = options.surface !== 'embedded';
  // PDA capabilities are independent of viewport size; desktop touch stays desktop.
  function pdaOpening() { return floating && (typeof PDA_storage !== 'undefined' && !!PDA_storage || typeof win.PDA_getTabState === 'function' || typeof win.PDA_httpGet === 'function'); }
  let destroyed = false, shown = true, collapsed = false, minimized = false, maximized = false, locked = false;
  let pdaActive = typeof win.PDA_getTabState !== 'function', pageActive = true, pdaRevision = 0, lastActive, gesture = null, selected = null, returnFocus = null;
  let pdaTimer = null;
  function clearPdaTimer() { if (pdaTimer !== null) { win.clearTimeout(pdaTimer); pdaTimer = null; } }
  let currentTheme = {}, explicitDark;
  let themeQueued = false, nextTask = 0;
  const firstTheme=options.theme||(options.themeClient?.get?options.themeClient.get():{});
  const initial = { x: 24, y: 40, width: firstTheme?.layout==='stock'?340:760, height: firstTheme?.layout==='stock'?760:540 };
  let rect = { ...initial }, previousRect = null;
  let booting = true, visibilityQueued = false, writingLayout = false, persistQueued = false, pendingLayout = null;
  let layoutLoading = floating && typeof options.readLayout === 'function';
  const editedGeometry = new Set(), editedSelection = new Set();
  let currentProfile = profileName();
  let profiles = { desktop: normalizeProfile(), mobile: normalizeProfile() };
  function profileName() { const view = viewport(); return view.width <= 600 || view.height <= 500 ? 'mobile' : 'desktop'; }
  function normalizeProfile(value) {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const normalized = { ...initial, locked: raw.locked === true, collapsed: raw.collapsed === true, selected: typeof raw.selected === 'string' ? raw.selected.slice(0, 100) : null };
    for (const key of ['x', 'y', 'width', 'height']) {
      if (typeof raw[key] === 'number' && Number.isFinite(raw[key]) && raw[key] >= 0 && raw[key] <= (key === 'x' || key === 'y' ? 100000 : 4096)) normalized[key] = raw[key];
    }
    return normalized;
  }
  function snapshotProfile() { return normalizeProfile({ ...(maximized && previousRect ? previousRect : rect), locked, collapsed, selected }); }
  function rememberLayout(geometryChanged = true) {
    if (booting || destroyed || !floating) return;
    if (layoutLoading) (geometryChanged ? editedGeometry : editedSelection).add(currentProfile);
    profiles[currentProfile] = snapshotProfile();
    if (typeof options.writeLayout !== 'function') return;
    pendingLayout = { version: 1, desktop: { ...profiles.desktop }, mobile: { ...profiles.mobile } };
    queuePersist();
  }
  function queuePersist() {
    if (layoutLoading || persistQueued || writingLayout || !pendingLayout || destroyed || doc.visibilityState === 'hidden' || !pdaActive || !pageActive) return;
    persistQueued = true;
    Promise.resolve().then(async () => {
      persistQueued = false; if (layoutLoading || destroyed || !pendingLayout || doc.visibilityState === 'hidden' || !pdaActive || !pageActive) return;
      const value = pendingLayout; pendingLayout = null; writingLayout = true;
      try { await options.writeLayout(value); } catch (_) { if (!destroyed) notice('Window layout could not be saved.', { kind: 'error' }); }
      finally { writingLayout = false; queuePersist(); }
    });
  }
  function applyProfile(value) {
    const normalized = normalizeProfile(value);
    rect = { x: normalized.x, y: normalized.y, width: normalized.width, height: normalized.height };
    locked = normalized.locked; collapsed = maximized ? false : normalized.collapsed;
    if (maximized) previousRect = { ...rect };
    if (normalized.selected && sections.has(normalized.selected)) {
      const wasBooting = booting; booting = true; select(normalized.selected); booting = wasBooting;
    }
    update();
  }
  function viewportChanged() {
    const nextProfile = profileName();
    if (nextProfile !== currentProfile) {
      profiles[currentProfile] = snapshotProfile(); currentProfile = nextProfile;
      applyProfile(profiles[currentProfile]);
    } else fit();
  }
  function node(tag, className, text) {
    const value = doc.createElement(tag);
    if (className) value.className = className;
    if (text !== undefined) value.textContent = String(text).slice(0, 4000);
    return value;
  }
  function listen(target, type, callback, opts) {
    target.addEventListener(type, callback, opts);
    cleanups.push(() => target.removeEventListener(type, callback, opts));
  }
  function button(text, label, callback, parent) {
    const value = node('button', '', text); value.type = 'button';
    value.setAttribute('aria-label', label);
    listen(value, 'click', callback); if (parent) parent.append(value);
    return value;
  }
  const root = node('section', 'tsui-root');
  root.setAttribute('data-tsui-kit', '1');
  root.dataset.tsuiId = String(options.id || 'script-ui').slice(0, 100);
  root.dataset.tsuiSurface = floating ? 'floating' : 'embedded';
  root.setAttribute('aria-label', String(options.title || 'Script tool').slice(0, 200));
  root.tabIndex = -1;
  const dragStrip=node('div','tsui-drag-strip','⠿ drag');dragStrip.tabIndex=0;dragStrip.setAttribute('role','button');dragStrip.setAttribute('aria-label','Move '+(options.title||'Script tool'));
  const header = node('header', 'tsui-header');
  const title = node('div', 'tsui-title', options.title || 'Script tool');
  title.tabIndex = 0;
  title.setAttribute('aria-label', 'Move ' + (options.title || 'Script tool'));
  title.title = 'Drag to move. Focus and use arrow keys to move; Shift + arrows resize. Escape cancels a drag.';
  const controls = node('div', 'tsui-controls');
  const headerActions=node('div','tsui-header-actions');controls.append(headerActions);
  header.append(title, controls);
  if(typeof appendScriptUiHeaderArt==='function')appendScriptUiHeaderArt(doc,header);
  const body = node('div', 'tsui-body');
  const nav = node('nav', 'tsui-nav'); nav.setAttribute('aria-label', 'Tool pages');
  const content = node('div', 'tsui-content');
  const settings = node('aside', 'tsui-settings'); settings.setAttribute('aria-label', 'Tool settings');
  const inspector = node('aside', 'tsui-inspector'); inspector.setAttribute('aria-label', 'Details');
  if (options.settings) settings.append(options.settings);
  if (options.inspector) inspector.append(options.inspector);
  body.append(nav, content, settings, inspector);
  const footer = node('footer', 'tsui-footer');
  const statusNode = node('div', 'tsui-status'); statusNode.setAttribute('role', 'status');
  const notices = node('div', 'tsui-notices'); notices.setAttribute('aria-live', 'polite');
  const taskList = node('div', 'tsui-tasks');
  footer.append(statusNode, notices, taskList);
  const sectionFooters=node('div','tsui-section-footers');
  const resize = node('div', 'tsui-resize'); resize.setAttribute('aria-hidden', 'true');
  root.append(dragStrip,header, body,sectionFooters, footer, resize);
  const launcher = button(options.title || 'Script tool', 'Restore ' + (options.title || 'Script tool'), () => { restore(); focus(); });
  launcher.className = 'tsui-launcher'; launcher.hidden = true;
  const mount = options.mount || doc.body || doc.documentElement;
  mount.append(root);
  // A DOM-owned tray gives independently bundled launchers native flex sizing,
  // wrapping and scrolling. Each host still owns its private handlers and tokens.
  const launcherHost = node('div', 'tsui-launcher-host'); launcherHost.setAttribute('data-tsui-launcher-host', '1');
  launcherHost.hidden = true; launcherHost.append(launcher); launcherTray.append(launcherHost);

  function active() { return !destroyed && shown && !minimized && !collapsed && pageActive && doc.visibilityState !== 'hidden' && pdaActive; }
  function visibility() {
    // Consumers may still be moving their content into the returned shell.
    // Initial notifications must run after construction and caller assignment.
    if(booting){
      if(!visibilityQueued){visibilityQueued=true;Promise.resolve().then(()=>{visibilityQueued=false;if(!destroyed)visibility();});}
      return;
    }
    queuePersist();
    const value = active();
    if (value === lastActive) return;
    lastActive = value;
    if (!value) endGesture(true);
    if (typeof options.onVisibilityChange === 'function') options.onVisibilityChange(value);
  }
  function viewport() {
    return { width: Math.max(1, Math.min(win.innerWidth || 1024, win.visualViewport ? win.visualViewport.width : Infinity)), height: Math.max(1, Math.min(win.innerHeight || 768, win.visualViewport ? win.visualViewport.height : Infinity)) };
  }
  function fit() {
    if (destroyed || !floating) return;
    const view = viewport(), inset = Math.min(8, view.width / 8, view.height / 8);
    const maxWidth = Math.max(1, view.width - inset * 2), maxHeight = Math.max(1, view.height - inset * 2);
    if (maximized) rect = { x: inset, y: inset, width: maxWidth, height: maxHeight };
    else {
      rect.width = Math.min(maxWidth, Math.max(Math.min(320, maxWidth), rect.width));
      rect.height = Math.min(maxHeight, Math.max(Math.min(180, maxHeight), rect.height));
      rect.x = Math.max(inset, Math.min(view.width - rect.width - inset, rect.x));
      rect.y = Math.max(inset, Math.min(view.height - (collapsed ? Math.min(92, rect.height) : rect.height) - inset, rect.y));
    }
    Object.assign(root.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: collapsed ? 'auto' : rect.height + 'px' });
  }
  function focus() {
    if (destroyed) return;
    if(typeof focusScriptUiWindow==='function'){
      const count=focusScriptUiWindow(doc,root);launcherTray.style.zIndex=String(2147481001+count*2);stackLaunchers();return;
    }
    const windows = floatingRoots();
    const index = windows.indexOf(root);
    if (index !== -1) { windows.splice(index, 1); windows.push(root); }
    windows.forEach((entry, i) => { entry.setAttribute('data-tsui-stack', String(i)); entry.style.zIndex = String(100000 + i * 2); });
    launcherTray.style.zIndex = String(100001 + windows.length * 2);
    stackLaunchers();
  }
  function floatingRoots() {
    if(typeof scriptUiFloatingWindows==='function')return scriptUiFloatingWindows(doc);
    return Array.from(doc.querySelectorAll('[data-tsui-kit="1"][data-tsui-surface="floating"]'))
      .filter(entry => !entry.hidden && entry.isConnected && entry.getClientRects().length)
      .sort((left, right) => {
        const rank = entry => { const value = Number(entry.getAttribute('data-tsui-stack')); return Number.isSafeInteger(value) && value >= 0 && value < 1000000 ? value : 0; };
        return rank(left) - rank(right);
      });
  }
  function stackLaunchers() {
    launcherTray.hidden = !Array.from(launcherTray.children).some(entry => !entry.hidden);
  }
  function update() {
    if (destroyed) return;
    root.hidden = !shown || minimized; launcherHost.hidden = launcher.hidden = !shown || !minimized;
    body.hidden = collapsed; footer.hidden = collapsed;sectionFooters.hidden=collapsed;
    if(!shown||minimized||collapsed)closeWindowOptions();
    root.dataset.tsuiCollapsed = String(collapsed); root.dataset.tsuiLocked = String(locked);root.dataset.tsuiMaximized=String(maximized);root.dataset.tsuiPda=String(pdaOpening());
    collapseButton.textContent = collapsed ? 'Expand' : 'Collapse'; collapseButton.setAttribute('aria-expanded', String(!collapsed));
    lockButton.textContent = locked ? 'Unlock' : 'Lock'; lockButton.setAttribute('aria-pressed', String(locked));
    resize.hidden = !floating || locked || maximized || collapsed;
    fit(); visibility(); stackLaunchers();
  }
  function show() { if (destroyed) return; shown = true; if (pdaOpening()) maximize(false); else update(); focus(); }
  function hide() { if (destroyed) return; shown = false; update(); }
  function close() { if (destroyed || !shown) return; hide(); if (typeof options.onClose === 'function') options.onClose(); }
  function collapse(value = !collapsed) { if (destroyed || collapsed === !!value) return; collapsed = !!value; update(); rememberLayout(); }
  function minimize() { if (destroyed) return; returnFocus = doc.activeElement; minimized = true; update(); launcher.focus(); }
  function maximize(remember = true) { if (destroyed || !floating) return; if (!maximized) previousRect = { ...rect }; maximized = true; minimized = collapsed = false; update(); if (remember) rememberLayout(); }
  function restore() {
    if (destroyed) return;
    const reopening = minimized || !shown;
    if (maximized && previousRect) rect = { ...previousRect };
    maximized = minimized = collapsed = false; shown = true; update();
    if (reopening && pdaOpening()) maximize(false);
    if (returnFocus && root.contains(returnFocus)) returnFocus.focus(); else title.focus();
    returnFocus = null;
    rememberLayout();
  }
  function setLocked(value) { if (destroyed || locked === !!value) return; locked = !!value; endGesture(true); update(); rememberLayout(); }
  function reset() { if (destroyed) return; rect = { ...initial }; maximized = minimized = collapsed = locked = false; shown = true; update(); rememberLayout(); }
  function endGesture(cancel) {
    if (!gesture) return;
    const old = gesture; gesture = null;
    if (cancel) { rect = old.start; fit(); }
    try { if (old.target.hasPointerCapture(old.pointerId)) old.target.releasePointerCapture(old.pointerId); } catch (_) {}
    root.classList.remove('tsui-gesturing');
    if (!cancel) rememberLayout();
  }
  function beginGesture(event, kind) {
    if (!floating || locked || maximized || event.button !== 0 || gesture || !active() || viewport().width <= 600 || event.pointerType === 'touch') return;
    if (layoutLoading) editedGeometry.add(currentProfile);
    focus(); gesture = { kind, pointerId: event.pointerId, target: event.currentTarget, start: { ...rect }, x: event.clientX, y: event.clientY };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_) {}
    root.classList.add('tsui-gesturing'); event.preventDefault();
  }
  const collapseButton = button('Collapse', 'Collapse or expand', () => collapse(), controls);
  const optionsToggle=button('⋯','Window options',()=>{const open=optionsToggle.getAttribute('aria-expanded')!=='true';optionsToggle.setAttribute('aria-expanded',String(open));windowOptions.dataset.open=String(open);if(open)windowOptions.querySelector('button')?.focus();},controls);
  optionsToggle.className='tsui-window-options-toggle';optionsToggle.setAttribute('aria-expanded','false');
  const windowOptions=node('div','tsui-window-options');windowOptions.setAttribute('role','group');windowOptions.setAttribute('aria-label','Window controls');controls.append(windowOptions);
  function closeWindowOptions(){optionsToggle.setAttribute('aria-expanded','false');windowOptions.dataset.open='false';}
  const lockButton = button('Lock', 'Lock or unlock position', () => setLocked(!locked), windowOptions);
  button('Reset', 'Reset window position', reset, windowOptions);
  if (floating) {
    button('Minimize', 'Minimize window', minimize, windowOptions);
    button('Maximize', 'Maximize or restore window', () => maximized ? restore() : maximize(), windowOptions);
  } else { lockButton.hidden = true; controls.querySelector('[aria-label="Reset window position"]').hidden = true; }
  button('×', 'Close window', close, controls);
  listen(doc,'pointerdown',event=>{if(!controls.contains(event.target))closeWindowOptions();});
  listen(title, 'pointerdown', event => beginGesture(event, 'move'));
  listen(dragStrip,'pointerdown',event=>beginGesture(event,'move'));
  listen(resize, 'pointerdown', event => beginGesture(event, 'resize'));
  listen(win, 'pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    rect = { ...gesture.start };
    if (gesture.kind === 'move') { rect.x += dx; rect.y += dy; } else { rect.width += dx; rect.height += dy; }
    fit();
  });
  listen(win, 'pointerup', event => { if (gesture && event.pointerId === gesture.pointerId) endGesture(false); });
  listen(win, 'pointercancel', () => endGesture(true));
  listen(win, 'blur', () => endGesture(true));
  listen(title, 'lostpointercapture', () => endGesture(true));
  listen(dragStrip,'lostpointercapture',()=>endGesture(true));
  listen(resize, 'lostpointercapture', () => endGesture(true));
  function moveKey(event) {
    if (!floating || locked || maximized || !/^Arrow(Left|Right|Up|Down)$/.test(event.key)) return;
    const delta = /Left|Up/.test(event.key) ? -10 : 10;
    const horizontal = /Left|Right/.test(event.key);
    rect[event.shiftKey ? horizontal ? 'width' : 'height' : horizontal ? 'x' : 'y'] += delta;
    fit(); rememberLayout(); event.preventDefault();
  }
  listen(title,'keydown',moveKey);listen(dragStrip,'keydown',moveKey);
  listen(root, 'pointerdown', focus);
  listen(root, 'focusin', focus);
  listen(doc, 'keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const top = floatingRoots().at(-1);
    if (top !== root) return;
    if(optionsToggle.getAttribute('aria-expanded')==='true'){closeWindowOptions();optionsToggle.focus();}
    else if (gesture) endGesture(true);
    else if (maximized) restore();
    else collapse();
    event.preventDefault();
  });
  listen(win, 'resize', viewportChanged);
  if (win.visualViewport) listen(win.visualViewport, 'resize', viewportChanged);
  listen(doc, 'visibilitychange', visibility);
  listen(win, 'pagehide', event => { if (!event.persisted) destroy(); else { pageActive = false; visibility(); } });
  listen(win, 'pageshow', () => { pageActive = true; visibility(); });
  listen(win, 'tornpda:tabState', event => {
    const detail = event.detail;
    if (!detail || typeof detail.isActiveTab !== 'boolean' || typeof detail.isWebViewVisible !== 'boolean') return;
    clearPdaTimer(); pdaRevision++; pdaActive = detail.isActiveTab && detail.isWebViewVisible; visibility();
  });
  if (typeof win.PDA_getTabState === 'function') {
    const revision = pdaRevision;
    function settleInitialPda(detail) {
      if (destroyed || revision !== pdaRevision) return;
      clearPdaTimer(); pdaRevision++;
      // Older or sleeping PDA bridges can return nothing or never settle.
      // Fall back to ordinary document visibility after a bounded wait.
      pdaActive = !detail || typeof detail.isActiveTab !== 'boolean' || typeof detail.isWebViewVisible !== 'boolean'
        ? true : detail.isActiveTab && detail.isWebViewVisible;
      visibility();
    }
    pdaTimer = win.setTimeout(() => settleInitialPda(null), 750);
    Promise.resolve().then(() => win.PDA_getTabState()).then(settleInitialPda, () => settleInitialPda(null));
  }
  function setTheme(theme, dark) {
    if (destroyed) return;
    closeWindowOptions();
    currentTheme = theme || {}; explicitDark = dark;
    const effectiveDark = typeof dark === 'boolean' ? dark : !!(win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches);
    options.applyTheme(root, currentTheme, effectiveDark);
    options.applyTheme(launcherHost, currentTheme, effectiveDark);
    fit();
  }
  if (typeof win.matchMedia === 'function') {
    const media = win.matchMedia('(prefers-color-scheme: dark)');
    if (media.addEventListener) listen(media, 'change', () => setTheme(currentTheme, explicitDark));
  }
  const client = options.themeClient;
  function queueTheme() {
    if (themeQueued || destroyed) return;
    themeQueued = true;
    // Read after every event listener has run, including a later client listener.
    Promise.resolve().then(() => { themeQueued = false; if (!destroyed && client.get) setTheme(client.get()); });
  }
  if (client && typeof client.subscribe === 'function') cleanups.push(client.subscribe(theme => setTheme(theme)));
  else if (client) {
    listen(doc, 'torn-script-hub:ui-theme:v1:changed', queueTheme);
    listen(win, 'torn-script-hub:ui-theme:v1:changed', queueTheme);
  }
  function select(id) {
    if (destroyed || !sections.has(id)) return false;
    const changed = selected !== id;
    selected = id;
    for (const [key, section] of sections) {
      section.host.hidden = key !== id; section.button.setAttribute('aria-current', key === id ? 'page' : 'false');
      if(section.footer)section.footer.hidden=key!==id;
      if(section.headerButton)section.headerButton.setAttribute('aria-pressed',String(key===id));
    }
    if (changed && !booting) rememberLayout(false);
    if (changed && typeof options.onSelect === 'function') options.onSelect(id);
    return true;
  }
  function notice(text, config = {}) {
    if (destroyed) return null;
    const item = node('div', 'tsui-notice');
    item.dataset.kind = ['success', 'warning', 'error'].includes(config.kind) ? config.kind : 'info';
    item.append(node('span', '', text));
    const dismiss = node('button', '', 'Dismiss'); dismiss.type = 'button'; dismiss.setAttribute('aria-label', 'Dismiss notice');
    dismiss.addEventListener('click', () => item.remove(), { once: true }); item.append(dismiss);
    notices.append(item);
    while (notices.children.length > 5) notices.firstElementChild.remove();
    return item;
  }
  function status(text) { if (!destroyed) statusNode.textContent = String(text || '').slice(0, 500); }
  function task(config = {}) {
    if (destroyed) return null;
    const id = String(config.id || 'task-' + nextTask++).slice(0, 100);
    if (tasks.has(id)) return tasks.get(id);
    if (tasks.size >= 8) { notice('Finish an existing task before adding another.', { kind: 'warning' }); return null; }
    const host = node('div', 'tsui-task');
    const label = node('span', '', config.label || 'Task');
    const progress = node('progress'); progress.max = 100; progress.removeAttribute('value');
    progress.setAttribute('aria-label', String(config.label || 'Task').slice(0, 100));
    host.append(label, progress);
    let ended = false, paused = false;
    const taskCleanups = [];
    // Task controls own their listeners, so finishing work releases callback closures.
    function taskButton(text, accessible, callback) {
      const value = node('button', '', text); value.type = 'button'; value.setAttribute('aria-label', accessible);
      value.addEventListener('click', callback); taskCleanups.push(() => value.removeEventListener('click', callback)); host.append(value); return value;
    }
    function finish() { if (ended) return; ended = true; taskCleanups.splice(0).forEach(fn => fn()); host.remove(); tasks.delete(id); }
    if (typeof config.onCancel === 'function') taskButton('Cancel', 'Cancel ' + (config.label || 'Task'), () => { finish(); config.onCancel(); });
    if (typeof config.onPause === 'function' && typeof config.onResume === 'function') {
      const pause = taskButton('Pause', 'Pause or resume ' + (config.label || 'Task'), () => { paused = !paused; pause.textContent = paused ? 'Resume' : 'Pause'; if (paused) config.onPause(); else config.onResume(); });
    }
    const controller = { update(value = {}) { if (ended || destroyed) return; if (value.label !== undefined) label.textContent = String(value.label).slice(0, 200); if (typeof value.progress === 'number' && Number.isFinite(value.progress)) progress.value = Math.max(0, Math.min(100, value.progress)); }, finish };
    tasks.set(id, controller); taskList.append(host); return controller;
  }
  function table(config = {}) {
    const wrap = node('div', 'tsui-table-scroll'); wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', String(config.label || 'Data table').slice(0, 100));
    const tableNode = node('table'), head = node('thead'), row = node('tr'), tbody = node('tbody');
    const columns = Array.isArray(config.columns) ? config.columns.slice(0, 20) : [];
    for (const column of columns) { const th = node('th', '', column.label || column.key); th.scope = 'col'; row.append(th); }
    head.append(row);
    const limit = Number.isInteger(config.limit) ? Math.max(0, Math.min(500, config.limit)) : 100;
    for (const item of (Array.isArray(config.rows) ? config.rows : []).slice(0, limit)) {
      const tr = node('tr'); for (const column of columns) tr.append(node('td', '', item && item[column.key] != null ? item[column.key] : '')); tbody.append(tr);
    }
    tableNode.append(head, tbody); wrap.append(tableNode); return wrap;
  }
  function destroy() {
    if (destroyed) return;
    endGesture(true); clearPdaTimer(); destroyed = true; pendingLayout = null; visibility();
    for (const value of tasks.values()) value.finish(); tasks.clear();
    cleanups.splice(0).reverse().forEach(fn => fn());
    if (client && options.ownsThemeClient && typeof client.stop === 'function') client.stop();
    root.remove(); launcherHost.remove();
    if (!doc.querySelector('[data-tsui-kit="1"]')) style.remove();
    if (!launcherTray.children.length) launcherTray.remove(); else stackLaunchers();
    if (typeof options.onDestroy === 'function') options.onDestroy();
  }
  const api = { root, content, settings, inspector, nav, launcherHost, setTheme, select, show, hide, close, collapse, minimize, maximize, restore, setLocked, reset, focus, notice, status, task, table, destroy,
    getState: () => ({ shown, collapsed, minimized, maximized, locked, destroyed, active: active(), selected, rect: { ...rect } }) };
  for (const section of (Array.isArray(options.sections) ? options.sections : []).slice(0, 30)) {
    const id = String(section.id || ''); if (!id || sections.has(id)) continue;
    const host = node('div', 'tsui-page');
    const navButton = button(section.label || id, section.label || id, () => select(id), nav);
    if (section.node) host.append(section.node);
    let footerHost=null,headerButton=null;
    if(section.footer){footerHost=node('div','tsui-section-footer');footerHost.append(section.footer);sectionFooters.append(footerHost);}
    if(typeof section.headerAction==='string'){navButton.dataset.tsuiHeaderAction='true';headerButton=button(section.headerAction.slice(0,4),section.label||id,()=>select(id),headerActions);headerButton.setAttribute('aria-pressed','false');}
    content.append(host); sections.set(id, { host, button: navButton,footer:footerHost,headerButton });
    if (typeof section.render === 'function') { const cleanup = section.render(host, api); if (typeof cleanup === 'function') cleanups.push(cleanup); }
  }
  if (sections.size) select(sections.keys().next().value);
  if (client && typeof client.start === 'function' && options.ownsThemeClient) client.start();
  setTheme(options.theme || (client && client.get ? client.get() : {}), options.dark);
  if (options.autoDestroyOnDetach !== false && typeof win.MutationObserver === 'function') {
    const observer = new win.MutationObserver(() => { if (!root.isConnected) destroy(); });
    observer.observe(doc.documentElement, { childList: true, subtree: true }); cleanups.push(() => observer.disconnect());
  }
  if (pdaOpening()) maximize(false); else update();
  focus();
  booting = false;
  if (floating && typeof options.readLayout === 'function') {
    let timer;
    const deadline = new Promise((_, reject) => { timer = win.setTimeout(() => reject(new Error('Layout read timed out')), 1500); });
    cleanups.push(() => win.clearTimeout(timer));
    Promise.race([Promise.resolve().then(() => options.readLayout()), deadline]).then(value => {
      if (destroyed || !value || typeof value !== 'object' || value.version !== 1) return;
      const restored = { desktop: normalizeProfile(value.desktop), mobile: normalizeProfile(value.mobile) };
      profiles[currentProfile] = snapshotProfile();
      for (const name of ['desktop', 'mobile']) {
        if (editedGeometry.has(name)) restored[name] = profiles[name];
        else if (editedSelection.has(name)) restored[name].selected = profiles[name].selected;
      }
      profiles = restored; applyProfile(profiles[currentProfile]);
      if (pendingLayout) pendingLayout = { version: 1, desktop: { ...profiles.desktop }, mobile: { ...profiles.mobile } };
    }).catch(() => { if (!destroyed) notice('Saved window layout could not be loaded.', { kind: 'warning' }); })
      .finally(() => { win.clearTimeout(timer); layoutLoading = false; editedGeometry.clear(); editedSelection.clear(); queuePersist(); });
  }
  return api;
}

function scriptUiKitCss() {
  return (typeof scriptUiIdentityCss==='function'?scriptUiIdentityCss('.tsui-root'):'')+`
.tsui-root,.tsui-launcher-host{font:calc(14px * var(--tsui-font-scale,1))/1.45 system-ui,sans-serif;color:var(--tsui-text,#e5eaf2);color-scheme:light;box-sizing:border-box}.tsui-root[data-tsui-mode=dark],.tsui-launcher-host[data-tsui-mode=dark]{color-scheme:dark}
.tsui-root *,.tsui-launcher-host *{box-sizing:border-box}.tsui-root[hidden],.tsui-root [hidden],.tsui-launchers[hidden],.tsui-launcher-host[hidden],.tsui-launcher-host [hidden]{display:none!important}
.tsui-root{background:var(--tsui-background,#171d28);border:1px solid var(--tsui-border,#506076);border-radius:var(--tsui-radius,12px);overflow:hidden;min-width:0;display:flex;flex-direction:column;isolation:isolate}
.tsui-root[data-tsui-surface=floating]{position:fixed;box-shadow:0 18px 60px #0007;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px)}
.tsui-root[data-tsui-surface=embedded]{position:relative;width:100%;min-height:220px;max-height:80dvh}
.tsui-header{position:relative;display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:var(--tsui-space,10px);background:var(--tsui-raised,#242d3c);border-bottom:1px solid var(--tsui-border,#506076);flex:none}
.tsui-title{font-weight:750;flex:1;min-width:90px;cursor:move;touch-action:none;padding:6px}.tsui-controls{display:flex;flex-wrap:wrap;gap:4px}
.tsui-drag-strip,.tsui-header-actions,.tsui-root .tsui-window-options-toggle{display:none}.tsui-window-options{display:contents}.tsui-section-footers{flex:none;max-height:44%;overflow:auto}.tsui-section-footers:empty,.tsui-section-footers:not(:has(.tsui-section-footer:not([hidden]))){display:none}.tsui-section-footer{border-top:1px solid var(--tsui-border);background:var(--tsui-raised);padding:10px}
.tsui-root button,.tsui-launcher{font:inherit;cursor:pointer;color:inherit;background:var(--tsui-surface,#242d3c);border:1px solid var(--tsui-border,#506076);border-radius:var(--tsui-radius,6px);padding:6px 10px;min-height:var(--tsui-control-height,34px)}
.tsui-root button:hover{background:var(--tsui-selection,#38455b)}.tsui-root :focus-visible,.tsui-launcher:focus-visible{outline:2px solid var(--tsui-focus,#8fbcff);outline-offset:2px}
.tsui-root input,.tsui-root select,.tsui-root textarea{font:inherit;color:inherit;background:var(--tsui-surface,#242d3c);border:1px solid var(--tsui-border,#506076);border-radius:4px;padding:8px;max-width:100%}
.tsui-body{display:grid;grid-template-columns:140px minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto auto;min-height:0;flex:1;overflow:auto}.tsui-root[data-tsui-layout=frostbite] .tsui-nav{background:var(--tsui-surface,#242d3c)}.tsui-nav{display:flex;flex-direction:column;gap:6px;padding:10px;border-right:1px solid var(--tsui-border,#506076);grid-row:1/-1}
.tsui-nav:empty,.tsui-settings:empty,.tsui-inspector:empty{display:none}.tsui-body:not(:has(.tsui-nav button)){grid-template-columns:minmax(0,1fr)}
.tsui-nav button{text-align:left}.tsui-nav button[aria-current=page]{border-color:var(--tsui-accent,#96b9ff);background:var(--tsui-selection,#38455b);font-weight:bold}
.tsui-content{min-width:0;padding:16px;overflow:auto;scrollbar-gutter:stable;grid-column:2}.tsui-body:not(:has(.tsui-nav button)) .tsui-content{grid-column:1}.tsui-settings,.tsui-inspector{padding:12px;min-width:0;grid-column:2;border-top:1px solid var(--tsui-border,#506076)}
.tsui-footer{padding:8px 16px;border-top:1px solid var(--tsui-border,#506076);max-height:34%;overflow:auto;flex:none}.tsui-status:empty,.tsui-notices:empty,.tsui-tasks:empty{display:none}.tsui-footer:not(:has(.tsui-status:not(:empty),.tsui-notice,.tsui-task)){display:none}
.tsui-notice,.tsui-task{display:flex;align-items:center;gap:8px;margin:4px 0}.tsui-notice span,.tsui-task span{flex:1;overflow-wrap:anywhere}.tsui-notice[data-kind=error]{color:var(--tsui-error,#ff9e9e)}.tsui-notice[data-kind=warning]{color:var(--tsui-warning,#f4ce83)}.tsui-notice[data-kind=success]{color:var(--tsui-success,#a4dfb6)}.tsui-task progress{width:90px}
.tsui-resize{position:absolute;right:0;bottom:0;width:22px;height:22px;cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 55%,var(--tsui-border,#506076) 56%,transparent 65%)}.tsui-gesturing{user-select:none}
.tsui-launchers{position:fixed;bottom:max(12px,env(safe-area-inset-bottom));right:max(12px,env(safe-area-inset-right));width:max-content;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;align-items:stretch;gap:12px;overflow:auto;box-sizing:border-box;padding:2px}
.tsui-launcher-host{position:relative;max-width:100%;flex:none}.tsui-launcher{max-width:100%;overflow-wrap:anywhere;white-space:normal;width:100%}
.tsui-table-scroll{max-width:100%;overflow:auto}.tsui-root table{border-collapse:collapse;width:100%}.tsui-root th,.tsui-root td{text-align:left;border-bottom:1px solid var(--tsui-border,#506076);padding:8px;overflow-wrap:anywhere}
.tsui-root[data-tsui-layout=workbench] .tsui-body,.tsui-root[data-tsui-layout=torn] .tsui-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto auto}.tsui-root[data-tsui-layout=workbench] .tsui-content,.tsui-root[data-tsui-layout=torn] .tsui-content{grid-column:1}
.tsui-root[data-tsui-layout=workbench] .tsui-nav,.tsui-root[data-tsui-layout=torn] .tsui-nav{flex-direction:row;flex-wrap:wrap;border-right:0;border-bottom:1px solid var(--tsui-border,#506076);grid-row:auto}
.tsui-root[data-tsui-layout=workbench] .tsui-nav{padding-bottom:0;gap:2px}.tsui-root[data-tsui-layout=workbench] .tsui-nav button{border-bottom-left-radius:0;border-bottom-right-radius:0}.tsui-root[data-tsui-layout=workbench] .tsui-settings,.tsui-root[data-tsui-layout=workbench] .tsui-inspector{grid-column:1}
.tsui-root[data-tsui-layout=frostbite] .tsui-header{background:linear-gradient(115deg,var(--tsui-surface),var(--tsui-raised));min-height:70px;padding:12px 16px}.tsui-root[data-tsui-layout=frostbite] .tsui-nav{background:var(--tsui-background)}.tsui-root[data-tsui-layout=frostbite] .tsui-nav button[aria-current=page]{box-shadow:inset 3px 0 0 var(--tsui-accent)}
.tsui-root[data-tsui-layout=workbench] .tsui-header{background:var(--tsui-background);padding:8px 12px}.tsui-root[data-tsui-layout=workbench] .tsui-title{font-family:Consolas,"SFMono-Regular",monospace;font-size:.95em}.tsui-root[data-tsui-layout=workbench] .tsui-nav{background:var(--tsui-background);gap:0;padding-top:0}.tsui-root[data-tsui-layout=workbench] .tsui-nav button{border-top:2px solid var(--tsui-background);border-bottom:0;color:var(--tsui-muted);background:var(--tsui-background);padding:9px 14px}.tsui-root[data-tsui-layout=workbench] .tsui-nav button[aria-current=page]{border-top-color:var(--tsui-accent);background:var(--tsui-surface);color:var(--tsui-text)}.tsui-root[data-tsui-layout=workbench] .tsui-inspector{background:var(--tsui-background)}
.tsui-root[data-tsui-layout=torn]{box-shadow:inset 0 0 0 2px var(--tsui-surface),0 18px 60px #0007}.tsui-root[data-tsui-layout=torn] .tsui-header{padding:5px 8px;background:linear-gradient(var(--tsui-raised),var(--tsui-surface));border-top:2px solid var(--tsui-accent);box-shadow:inset 0 1px 0 var(--tsui-surface)}.tsui-root[data-tsui-layout=torn] .tsui-title{font-family:Arial,Helvetica,sans-serif;font-size:.92em;letter-spacing:.025em;text-transform:uppercase}.tsui-root[data-tsui-layout=torn] .tsui-nav{padding:5px;gap:4px;background:var(--tsui-raised);box-shadow:inset 0 1px 0 var(--tsui-surface)}.tsui-root[data-tsui-layout=torn] .tsui-nav button{padding:5px 10px;font-size:.9em;font-weight:700}.tsui-root[data-tsui-layout=torn] .tsui-content{padding:10px;background:var(--tsui-surface)}.tsui-root[data-tsui-layout=torn] :is(th,td){padding:6px 8px}.tsui-root[data-tsui-layout=torn] th{background:linear-gradient(var(--tsui-raised),var(--tsui-surface));font-size:.9em}.tsui-root[data-tsui-layout=torn] tbody tr:nth-child(even){background:var(--tsui-raised)}.tsui-root[data-tsui-layout=torn] .tsui-settings,.tsui-root[data-tsui-layout=torn] .tsui-inspector{grid-column:1}
@media(min-width:850px){.tsui-root[data-tsui-layout=workbench] .tsui-body:has(.tsui-inspector:not(:empty)){grid-template-columns:minmax(0,1fr) 180px}.tsui-root[data-tsui-layout=workbench] .tsui-nav{grid-column:1/-1}.tsui-root[data-tsui-layout=workbench] .tsui-inspector{grid-column:2;grid-row:2/4;border-left:1px solid var(--tsui-border,#506076)}}
@media(max-width:600px),(pointer:coarse){.tsui-root button,.tsui-launcher{min-height:44px}.tsui-root input,.tsui-root select,.tsui-root textarea{font-size:16px}.tsui-header{gap:4px;padding:6px}.tsui-controls{width:100%;overflow:auto;flex-wrap:nowrap}.tsui-controls button{flex:1;padding:4px;font-size:12px}.tsui-root .tsui-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto auto auto;align-content:start}.tsui-root .tsui-nav{flex-direction:row;flex-wrap:wrap;border-right:0;border-bottom:1px solid var(--tsui-border,#506076);padding:6px;grid-row:auto}.tsui-root .tsui-content{padding:10px;grid-column:1;overflow:visible}.tsui-root .tsui-settings,.tsui-root .tsui-inspector{grid-column:1;grid-row:auto}.tsui-resize{display:none}.tsui-title{touch-action:auto;cursor:default}.tsui-task{flex-wrap:wrap}}
@media(prefers-reduced-motion:reduce){.tsui-root *{animation:none!important;transition:none!important}}
.tsui-root[data-tsui-layout=stock]{font-family:Arial,Helvetica,sans-serif;font-size:calc(13px * var(--tsui-font-scale,1))}
.tsui-root[data-tsui-layout=stock] .tsui-theme-mark{display:none}
.tsui-root[data-tsui-layout=stock][data-tsui-surface=floating]:not([data-tsui-maximized=true]) .tsui-drag-strip{display:block;background:var(--tsui-selection);color:var(--tsui-muted);font:10px/18px Consolas,monospace;letter-spacing:2px;text-align:center;cursor:move;touch-action:none;border-bottom:1px solid var(--tsui-border);flex:none}
.tsui-root[data-tsui-layout=stock] .tsui-header{padding:7px 10px;gap:6px;flex-wrap:nowrap;background:var(--tsui-raised);z-index:3}
.tsui-root[data-tsui-layout=stock] .tsui-title{font-size:1em;font-weight:600;color:var(--tsui-accent);padding:3px 0;min-width:60px;overflow-wrap:anywhere}
.tsui-root[data-tsui-layout=stock] .tsui-controls{width:auto;flex-wrap:nowrap;overflow:visible;gap:4px;flex:none}
.tsui-root[data-tsui-layout=stock] .tsui-header-actions{display:flex;gap:4px}.tsui-root[data-tsui-layout=stock] .tsui-header-actions:empty{display:none}
.tsui-root[data-tsui-layout=stock] .tsui-controls>button,.tsui-root[data-tsui-layout=stock] .tsui-header-actions>button{width:30px;min-height:30px;padding:3px;border-radius:3px;color:var(--tsui-accent)}
.tsui-root[data-tsui-layout=stock] .tsui-window-options-toggle{display:block}
.tsui-root[data-tsui-layout=stock] .tsui-controls>[aria-label="Collapse or expand"]{font-size:0}.tsui-root[data-tsui-layout=stock] .tsui-controls>[aria-label="Collapse or expand"]:before{content:'▴';font-size:16px}
.tsui-root[data-tsui-layout=stock][data-tsui-collapsed=true] .tsui-controls>[aria-label="Collapse or expand"]:before{content:'▾'}
.tsui-root[data-tsui-layout=stock] .tsui-window-options{display:none;position:absolute;right:8px;top:calc(100% + 3px);width:190px;max-height:min(250px,60dvh);overflow:auto;padding:6px;background:var(--tsui-surface);border:1px solid var(--tsui-border);border-radius:var(--tsui-radius);box-shadow:0 6px 20px #0006}
.tsui-root[data-tsui-layout=stock] .tsui-window-options[data-open=true]{display:flex;flex-direction:column;gap:4px}.tsui-root[data-tsui-layout=stock] .tsui-window-options button{text-align:left}
.tsui-root[data-tsui-layout=stock] .tsui-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto auto;overflow:hidden}
.tsui-root[data-tsui-layout=stock] .tsui-content{grid-column:1;padding:12px;overflow:auto;scrollbar-gutter:auto}
.tsui-root[data-tsui-layout=stock] .tsui-nav{flex-direction:row;flex-wrap:wrap;grid-row:auto;border-right:0;border-bottom:1px solid var(--tsui-border);padding:0 10px;gap:16px;background:var(--tsui-surface)}
.tsui-root[data-tsui-layout=stock] .tsui-nav button{background:transparent;border:0;border-bottom:2px solid transparent;border-radius:0;padding:9px 2px;color:var(--tsui-muted);font-size:.95em}
.tsui-root[data-tsui-layout=stock] .tsui-nav button[aria-current=page]{border-bottom-color:var(--tsui-accent);color:var(--tsui-accent)}
.tsui-root[data-tsui-layout=stock] .tsui-nav [data-tsui-header-action=true]{display:none}.tsui-root[data-tsui-layout=stock] .tsui-settings,.tsui-root[data-tsui-layout=stock] .tsui-inspector{grid-column:1}
.tsui-root[data-tsui-layout=stock] input,.tsui-root[data-tsui-layout=stock] select{background:var(--tsui-background)}
.tsui-root[data-tsui-layout=stock][data-tsui-pda=true] .tsui-section-footers{padding-bottom:max(48px,env(safe-area-inset-bottom));background:var(--tsui-raised)}
@media(max-width:600px),(pointer:coarse){.tsui-root[data-tsui-layout=stock] .tsui-controls>button,.tsui-root[data-tsui-layout=stock] .tsui-header-actions>button{width:44px;min-height:44px}.tsui-root[data-tsui-layout=stock] .tsui-body{grid-template-rows:auto minmax(0,1fr) auto auto;align-content:stretch}.tsui-root[data-tsui-layout=stock] .tsui-content{overflow:auto}.tsui-root[data-tsui-layout=stock] .tsui-nav button{min-height:44px}.tsui-root[data-tsui-layout=stock] .tsui-title{font-size:13px}}
`;
}

module.exports = { createTornScriptUI, scriptUiKitCss };
