'use strict';

const metadata = `// ==UserScript==
// @name         Torn Script UI Showcase
// @namespace    torn-script-hub
// @version      1.1.0
// @description  Local demonstration of shared native script windows, themes, tables, drafts and task controls.
// @author       iSatomi
// @license      GPL-3.0
// @match        https://www.torn.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==`;

function installScriptUiShowcase() {
  const overrideKey = 'torn-script-ui-showcase:appearance:v1';
  const layoutKey = 'torn-script-ui-showcase:window:v1';
  let surface = null, disposeAdapter = null;
  function element(tag, text) { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; return value; }
  const opener = element('button', 'UI showcase'); opener.type = 'button'; opener.setAttribute('aria-label', 'Open UI showcase');
  opener.style.cssText = 'position:fixed;left:max(12px,env(safe-area-inset-left));bottom:max(12px,env(safe-area-inset-bottom));z-index:99999;font:14px system-ui;padding:10px 14px;min-height:44px;border:1px solid #567;border-radius:8px;background:#243346;color:#edf4ff;cursor:pointer';
  function preview() {
    if (surface && !surface.getState().destroyed) { surface.restore(); surface.focus(); return true; }
    const themeClient = createScriptUiThemeClient({ doc: document, win: window, scriptId: 'ui-showcase',
      read: () => typeof GM_getValue === 'function' ? GM_getValue(overrideKey, null) : null,
      write: value => { if (typeof GM_setValue === 'function') return GM_setValue(overrideKey, value); },
      onChange: theme => { if (surface) surface.setTheme(theme); },
    });
    const settings = element('div');
    const label = element('label', 'Layout preview ');
    const picker = element('select'); picker.setAttribute('aria-label', 'Layout preview');
    for (const name of ['frostbite', 'workbench', 'torn']) { const option = element('option', name[0].toUpperCase() + name.slice(1)); option.value = name; picker.append(option); }
    label.append(picker); settings.append(label);
    const follow = element('button', 'Follow Hub appearance'); follow.type = 'button'; settings.append(follow);
    const inspector = element('p', 'Native content stays mounted when the layout or colors change. All example data is local.');
    let localTask = null, progress = 0;
    surface = createTornScriptUI({ doc: document, win: window, id: 'ui-showcase', title: 'Script UI showcase', themeClient, ownsThemeClient: true, applyTheme: applyScriptUiTheme,
      settings, inspector,
      readLayout: () => typeof GM_getValue === 'function' ? GM_getValue(layoutKey, null) : null,
      writeLayout: value => { if (typeof GM_setValue === 'function') return GM_setValue(layoutKey, value); },
      onDestroy: () => { surface = null; localTask = null; },
      sections: [
        { id: 'overview', label: 'Overview', render(host, ui) {
          host.append(element('h2', 'A shared home for script tools'), element('p', 'Try the window controls, switch layouts, and keep a draft open. This showcase makes no network requests. The Hub is optional.'));
          const notice = element('button', 'Show local notice'); notice.type = 'button'; host.append(notice);
          const onNotice = () => ui.notice('Your local showcase is ready.', { kind: 'success' }); notice.addEventListener('click', onNotice);
          const close = element('button', 'Close showcase'); close.type = 'button'; host.append(close); const onClose = () => ui.destroy(); close.addEventListener('click', onClose);
          return () => { notice.removeEventListener('click', onNotice); close.removeEventListener('click', onClose); };
        } },
        { id: 'table', label: 'Sample report', render(host, ui) {
          host.append(element('h2', 'Sample report'), ui.table({ label: 'Local sample report', columns: [{ key: 'name', label: 'Example' }, { key: 'state', label: 'State' }, { key: 'count', label: 'Count' }], rows: [{ name: 'Planning', state: 'Ready', count: 8 }, { name: 'Supplies', state: 'Review', count: 3 }, { name: 'Reports', state: 'Complete', count: 12 }] }));
        } },
        { id: 'draft', label: 'Draft form', render(host, ui) {
          host.append(element('h2', 'Keep your place'));
          const form = element('form');
          const noteLabel = element('label', 'Local note '), input = element('textarea'); input.setAttribute('aria-label', 'Local note'); input.maxLength = 400; input.rows = 4; input.placeholder = 'Harmless example text'; noteLabel.append(input); form.append(noteLabel);
          const save = element('button', 'Review local draft'); save.type = 'submit'; form.append(save); host.append(form);
          const submit = event => { event.preventDefault(); ui.notice('Draft is present in this window. It is never sent or stored.'); };
          form.addEventListener('submit', submit); return () => form.removeEventListener('submit', submit);
        } },
        { id: 'tasks', label: 'Local tasks', render(host, ui) {
          host.append(element('h2', 'Explicit task controls'), element('p', 'Advance this sample manually. Hiding the window preserves its progress. Pause, resume, and cancel only run when you choose them.'));
          const start = element('button', 'Start local task'), advance = element('button', 'Advance task'); start.type = advance.type = 'button'; host.append(start, advance);
          const begin = () => {
            if (localTask) return;
            progress = 0;
            localTask = ui.task({ id: 'local-demo', label: 'Local demo', onCancel: () => { localTask = null; ui.status('Local task cancelled.'); }, onPause: () => { advance.disabled = true; ui.status('Local task paused.'); }, onResume: () => { advance.disabled = false; ui.status('Local task resumed.'); } });
            advance.disabled = false; if (localTask) localTask.update({ progress });
          };
          const step = () => { if (!localTask) return; progress += 25; localTask.update({ progress }); if (progress >= 100) { localTask.finish(); localTask = null; ui.status('Local task complete.'); } };
          start.addEventListener('click', begin); advance.addEventListener('click', step);
          return () => { start.removeEventListener('click', begin); advance.removeEventListener('click', step); };
        } },
      ],
    });
    picker.value = themeClient.get().layout;
    const choose = () => { void themeClient.setOverride({ ...themeClient.get(), layout: picker.value }).catch(() => { if (surface) surface.notice('Appearance could not be saved.', { kind: 'error' }); }); };
    const inherit = () => { void themeClient.setOverride(null).then(theme => { picker.value = theme.layout; }).catch(() => { if (surface) surface.notice('Appearance could not be saved.', { kind: 'error' }); }); };
    picker.addEventListener('change', choose); follow.addEventListener('click', inherit);
    // The settings nodes are owned by this one surface and leave with it.
    surface.status('Local showcase. No Torn API calls.');
    return true;
  }
  opener.addEventListener('click', preview); (document.body || document.documentElement).append(opener);
  if (typeof registerTornScriptMenu === 'function') disposeAdapter = registerTornScriptMenu(document, window, {
    id: 'ui-showcase', name: 'Torn Script UI Showcase', icon: 'scripts', version: '1.1.0', category: 'Examples',
    url: 'https://www.torn.com/index.php',
    actions: [{ id: 'preview', label: 'Open UI showcase' }], capabilities: [],
  }, { preview }, { sharedProviders: [] });
  function leave(event) {
    if (surface) surface.destroy();
    if (event.persisted) return;
    opener.removeEventListener('click', preview); opener.remove();
    if (typeof disposeAdapter === 'function') disposeAdapter();
    window.removeEventListener('pagehide', leave);
  }
  window.addEventListener('pagehide', leave);
}

const body = '(' + installScriptUiShowcase.toString() + ')();';
module.exports = { metadata, body };
