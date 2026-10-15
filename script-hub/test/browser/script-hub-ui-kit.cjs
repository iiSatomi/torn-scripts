'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.TORN_PLAYWRIGHT || 'C:/Users/asato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.TORN_BROWSER || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setContent('<main id="host"></main><button id="outside">Outside</button>');
    const source = fs.readFileSync(path.join(__dirname, '../../src/script-hub-ui-kit.cjs'), 'utf8');
    await page.addScriptTag({ content: '{const module={exports:{}};' + source + ';window.kit=module.exports;}' });
    await page.evaluate(() => {
      window.visibility = [];
      window.renders = 0;
      window.selections = [];
      const applyTheme = (node, theme) => { node.dataset.tsuiLayout = theme.layout || 'frostbite'; node.style.setProperty('--tsui-text', '#eeeeee'); node.style.setProperty('--tsui-background', '#171a20'); };
      window.ui = kit.createTornScriptUI({ doc: document, win: window, id: 'one', title: 'First tool', applyTheme, onVisibilityChange: active => visibility.push(active), sections: [{ id: 'draft', label: 'Draft', render(host) { renders++; host.innerHTML = '<label>Note <input aria-label="Note"></label>'; } }, { id: 'report', label: 'Report', render(host) { host.textContent = 'Report view'; } }] });
      window.two = kit.createTornScriptUI({ doc: document, win: window, id: 'two', title: 'Second tool', applyTheme, onSelect: id => selections.push(id), sections: [{ id: 'home', label: 'Home' }, { id: 'settings', label: 'Settings' }] });
      window.embedded = kit.createTornScriptUI({ doc: document, win: window, id: 'embedded', title: 'Embedded', surface: 'embedded', mount: document.querySelector('#host'), applyTheme });
      two.hide();
    });
    await page.evaluate(() => two.select('settings'));
    assert.deepEqual(await page.evaluate(() => selections), ['home', 'settings'], 'consumer is notified of section changes');
    await page.evaluate(() => { window.closeCount=0;window.closable=kit.createTornScriptUI({doc:document,win:window,id:'closable',title:'Closable tool',applyTheme:()=>{},onClose:()=>closeCount++}); });
    await page.locator('[data-tsui-id="closable"]').getByLabel('Close window',{exact:true}).click({timeout:1500});
    assert.deepEqual(await page.evaluate(() => [closeCount,closable.getState().shown]),[1,false],'shared Close hides and notifies once');
    await page.evaluate(() => {closable.show();closable.close();closable.destroy();});
    assert.equal(await page.evaluate(() => closeCount),2,'programmatic close uses the same lifecycle');
    await page.getByLabel('Note', { exact: true }).fill('draft survives');
    await page.getByLabel('Note', { exact: true }).focus();
    await page.evaluate(() => { window.inputBefore = document.activeElement; ui.setTheme({ layout: 'workbench' }); ui.setTheme({ layout: 'torn' }); });
    assert.deepEqual(await page.evaluate(() => [document.activeElement === inputBefore, inputBefore.value, renders]), [true, 'draft survives', 1]);
    // Initial theme-client callback is optional: public changes must read the
    // client's updated snapshot, even when its listener was attached after UI.
    await page.evaluate(() => {
      window.snapshot = { layout: 'frostbite' };
      window.themed = kit.createTornScriptUI({ doc: document, win: window, id: 'themed', applyTheme: (node, value) => { node.dataset.tsuiLayout = value.layout; }, themeClient: { get: () => snapshot, start() { document.addEventListener('torn-script-hub:ui-theme:v1:changed', () => { snapshot = { layout: 'workbench' }; }, { once: true }); }, stop() {} }, ownsThemeClient: true });
      document.dispatchEvent(new CustomEvent('torn-script-hub:ui-theme:v1:changed'));
    });
    assert.equal(await page.locator('[data-tsui-id="themed"]').getAttribute('data-tsui-layout'), 'workbench');
    await page.evaluate(() => themed.destroy());
    await page.evaluate(() => {
      window.themeSubscribers=new Set();window.subscribed=kit.createTornScriptUI({doc:document,win:window,id:'subscribed',applyTheme:(node,value)=>node.dataset.tsuiLayout=value.layout,
        themeClient:{get:()=>({layout:'frostbite'}),subscribe(listener){themeSubscribers.add(listener);return()=>themeSubscribers.delete(listener);}}});
      for(const listener of themeSubscribers)listener({layout:'torn'});
    });
    assert.equal(await page.locator('[data-tsui-id="subscribed"]').getAttribute('data-tsui-layout'),'torn','private theme changes update the whole shared surface');
    assert.equal(await page.locator('[data-tsui-launcher-host]').last().getAttribute('data-tsui-layout'),'torn','minimized launcher follows private appearance');
    await page.evaluate(()=>subscribed.destroy());assert.equal(await page.evaluate(()=>themeSubscribers.size),0,'destroy releases theme subscription');
    await page.evaluate(async () => {
      window.savedLayouts = [];
      window.restored = kit.createTornScriptUI({ doc: document, win: window, id: 'restored', applyTheme: () => {}, readLayout: () => Promise.resolve({ version: 1, desktop: { x: 300, y: 120, width: 620, height: 420, locked: true, collapsed: true, selected: 'second', secret: 'discard' }, mobile: { x: -9999, y: Infinity, width: 999999, height: 999999 } }), writeLayout: value => savedLayouts.push(value), sections: [{ id: 'first', label: 'First' }, { id: 'second', label: 'Second' }] });
      await Promise.resolve(); await Promise.resolve();
    });
    assert.deepEqual(await page.evaluate(() => { const state = restored.getState(); return [state.rect.x, state.rect.width, state.locked, state.collapsed, state.selected]; }), [300, 620, true, true, 'second']);
    await page.evaluate(async () => { restored.setLocked(false); restored.collapse(false); await Promise.resolve(); });
    assert.equal(await page.evaluate(() => savedLayouts.length > 0 && !JSON.stringify(savedLayouts).includes('secret')), true);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok((await page.locator('[data-tsui-id="restored"]').boundingBox()).width <= 374);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForFunction(() => restored.getState().rect.width === 620);
    assert.equal(await page.evaluate(() => restored.getState().rect.width), 620, 'desktop geometry survives mobile profile');
    await page.evaluate(() => restored.destroy());
    await page.evaluate(()=>{
      window.geometryWrites=[];window.delayedGeometry=kit.createTornScriptUI({doc:document,win:window,id:'delayed-geometry',applyTheme:()=>{},readLayout:()=>new Promise(resolve=>window.finishGeometry=resolve),writeLayout:value=>geometryWrites.push(value),sections:[{id:'home',label:'Geometry home'},{id:'credits',label:'Geometry credits'}]});
      delayedGeometry.show();delayedGeometry.collapse(false);delayedGeometry.setLocked(false);delayedGeometry.select('credits');
    });
    assert.equal(await page.evaluate(()=>geometryWrites.length),0,'section changes cannot overwrite storage while initial geometry is loading');
    await page.evaluate(()=>finishGeometry({version:1,desktop:{x:200,y:180,width:900,height:700,locked:true,selected:'home'},mobile:{width:350}}));
    await page.waitForFunction(()=>delayedGeometry.getState().rect.width===900);
    assert.deepEqual(await page.evaluate(()=>{const state=delayedGeometry.getState();return[state.rect.x,state.rect.y,state.locked,state.selected];}),[200,180,true,'credits'],'explicit section wins without discarding saved geometry');
    await page.evaluate(()=>delayedGeometry.destroy());
    await page.evaluate(()=>{
      window.profileRace=kit.createTornScriptUI({doc:document,win:window,id:'profile-race',applyTheme:()=>{},readLayout:()=>new Promise(resolve=>window.finishProfiles=resolve)});
      profileRace.setLocked(true);
    });
    await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>profileRace.getState().rect.width<=374);
    await page.evaluate(()=>finishProfiles({version:1,desktop:{x:200,width:900,locked:false},mobile:{x:8,width:350,locked:false}}));
    await page.waitForFunction(()=>profileRace.getState().rect.width===350);
    await page.setViewportSize({width:1920,height:1080});await page.waitForFunction(()=>profileRace.getState().rect.width===760);
    assert.equal(await page.evaluate(()=>profileRace.getState().locked),true,'late mobile hydration retains earlier desktop edits');
    await page.evaluate(()=>profileRace.destroy());
    await page.evaluate(()=>{
      window.fallbackWrites=[];window.stalledLayout=kit.createTornScriptUI({doc:document,win:window,id:'stalled-layout',applyTheme:()=>{},readLayout:()=>new Promise(()=>{}),writeLayout:value=>fallbackWrites.push(value)});stalledLayout.setLocked(true);
    });
    await page.waitForFunction(()=>fallbackWrites.length===1,{},{timeout:2500});
    assert.equal(await page.evaluate(()=>fallbackWrites[0].desktop.locked),true,'bounded read fallback releases queued user preferences');await page.evaluate(()=>stalledLayout.destroy());
    await page.evaluate(async () => {
      let resolveRead;
      const late = new Promise(resolve => { resolveRead = resolve; });
      const tool = kit.createTornScriptUI({ doc: document, win: window, id: 'raced', applyTheme: () => {}, readLayout: () => late });
      tool.reset();
      resolveRead({ version: 1, desktop: { x: 999, width: 333 } });
      await Promise.resolve(); await Promise.resolve();
      window.raceWon = tool.getState().rect.x !== 999;
      tool.destroy();
    });
    assert.equal(await page.evaluate(() => raceWon), true, 'interaction wins over late stored geometry');
    await page.getByRole('button', { name: 'Report', exact: true }).click();
    await page.getByRole('button', { name: 'Draft', exact: true }).click();
    assert.equal(await page.getByLabel('Note', { exact: true }).inputValue(), 'draft survives');
    const header = page.locator('[data-tsui-id="one"] .tsui-title');
    const before = await page.locator('[data-tsui-id="one"]').boundingBox();
    const box = await header.boundingBox();
    await page.mouse.move(box.x + 20, box.y + 10); await page.mouse.down(); await page.mouse.move(box.x + 120, box.y + 70); await page.mouse.up();
    const moved = await page.locator('[data-tsui-id="one"]').boundingBox();
    assert.ok(moved.x > before.x + 50, 'pointer drag moves window');
    const cancelBox = await header.boundingBox();
    await page.mouse.move(cancelBox.x + 20, cancelBox.y + 10); await page.mouse.down(); await page.mouse.move(cancelBox.x + 160, cancelBox.y + 80);
    await page.keyboard.press('Escape'); await page.mouse.up();
    assert.equal((await page.locator('[data-tsui-id="one"]').boundingBox()).x, moved.x, 'Escape cancels gesture geometry');
    assert.equal(await page.evaluate(() => ui.getState().collapsed), false, 'gesture Escape does not also collapse');
    await page.evaluate(() => ui.setLocked(true));
    const locked = await header.boundingBox();
    await page.mouse.move(locked.x + 20, locked.y + 10); await page.mouse.down(); await page.mouse.move(locked.x + 100, locked.y + 50); await page.mouse.up();
    assert.equal((await page.locator('[data-tsui-id="one"]').boundingBox()).x, moved.x);
    await page.evaluate(() => ui.setLocked(false));
    const resize = await page.locator('[data-tsui-id="one"] .tsui-resize').boundingBox();
    await page.mouse.move(resize.x + 8, resize.y + 8); await page.mouse.down(); await page.mouse.move(resize.x + 100, resize.y + 80); await page.mouse.up();
    assert.ok((await page.locator('[data-tsui-id="one"]').boundingBox()).width > moved.width + 50);
    await page.evaluate(() => { ui.minimize(); two.show(); two.minimize(); });
    const firstLauncher = await page.getByRole('button', { name: 'Restore First tool', exact: true }).boundingBox();
    const secondLauncher = await page.getByRole('button', { name: 'Restore Second tool', exact: true }).boundingBox();
    assert.ok(Math.abs(firstLauncher.y - secondLauncher.y) >= 44, 'multiple minimized windows remain individually reachable');
    await page.getByRole('button', { name: 'Restore First tool', exact: true }).click();
    assert.equal(await page.locator('[data-tsui-id="one"]').isVisible(), true);
    await page.evaluate(() => { ui.maximize(); ui.restore(); two.restore(); two.focus(); });
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => [ui.getState().collapsed, two.getState().collapsed]), [false, true]);
    await page.getByRole('button', { name: 'Outside', exact: true }).click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'outside', 'modeless surfaces allow outside focus');
    await page.evaluate(() => { two.hide(); ui.root.querySelector('.tsui-title').focus(); });
    const keyBefore = await page.evaluate(() => ui.getState().rect.x);
    await page.keyboard.press('ArrowRight');
    assert.ok(await page.evaluate(x => ui.getState().rect.x > x, keyBefore));
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    assert.equal(await page.evaluate(() => ui.getState().active), false);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    assert.equal(await page.evaluate(() => ui.getState().active), true);
    await page.evaluate(() => {
      window.cancelled = 0;
      const task = ui.task({ id: 'demo', label: 'Work', onCancel: () => cancelled++ });
      task.update({ progress: 50, label: 'Halfway' });
      window.task = task;
      for (let i = 0; i < 40; i++) ui.notice('<script>literal</script>');
      const table = ui.table({ columns: [{ key: 'name', label: 'Name' }], rows: [{ name: '<img src=x onerror=alert(1)>' }] });
      ui.content.append(table);
      window.dispatchEvent(new CustomEvent('tornpda:tabState', { detail: { isActiveTab: false, isWebViewVisible: true } }));
    });
    assert.equal(await page.evaluate(() => cancelled), 0, 'inactivity never cancels business work');
    assert.ok(await page.locator('[data-tsui-id="one"] .tsui-notice').count() <= 5);
    assert.equal(await page.locator('[data-tsui-id="one"] table img').count(), 0);
    await page.getByRole('button', { name: 'Cancel Work', exact: true }).click();
    assert.equal(await page.evaluate(() => cancelled), 1);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tornpda:tabState', { detail: { isActiveTab: true, isWebViewVisible: true } })));
    for (const viewport of [{ width: 390, height: 844 }, { width: 430, height: 932 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => { ui.reset(); ui.setTheme({ layout: 'frostbite' }); });
      const rect = await page.locator('[data-tsui-id="one"]').boundingBox();
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width + 1 && rect.y + rect.height <= viewport.height + 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await page.evaluate(() => { ui.destroy(); two.destroy(); embedded.destroy(); window.dispatchEvent(new Event('resize')); });
    assert.equal(await page.locator('[data-tsui-id]').count(), 0);
    assert.equal(await page.locator('[data-tsui-style]').count(), 0);
    // Two actual source evaluations model independently bundled userscripts.
    // Their closures must share no JavaScript registry to coordinate windows.
    await page.addScriptTag({ content: '{const module={exports:{}};' + source + ';window.bundleA=module.exports;}' });
    await page.addScriptTag({ content: '{const module={exports:{}};' + source + ';window.bundleB=module.exports;}' });
    await page.evaluate(() => {
      window.crossA = bundleA.createTornScriptUI({ doc: document, win: window, id: 'cross-a', title: 'A very long script title that wraps into multiple lines on narrow mobile screens '.repeat(3), applyTheme: () => {} });
      window.crossB = bundleB.createTornScriptUI({ doc: document, win: window, id: 'cross-b', title: 'Independent second script', applyTheme: () => {} });
      crossB.focus();
    });
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => [crossA.getState().collapsed, crossB.getState().collapsed]), [false, true], 'only the top independent bundle owns Escape');
    await page.evaluate(() => crossA.focus());
    assert.equal(await page.evaluate(() => Number(crossA.root.style.zIndex) > Number(crossB.root.style.zIndex)), true, 'focus raises a window above other bundles');
    await page.evaluate(() => { crossA.minimize(); crossB.minimize(); });
    await page.setViewportSize({ width: 390, height: 844 });
    const launcherRects = await page.locator('[data-tsui-launcher-host]').evaluateAll(nodes => nodes.filter(node => !node.hidden).map(node => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; }));
    assert.equal(launcherRects.length, 2);
    assert.ok(launcherRects[0].y + launcherRects[0].height <= launcherRects[1].y || launcherRects[1].y + launcherRects[1].height <= launcherRects[0].y, 'wrapped minimized launchers do not overlap across bundles');
    for (const box of launcherRects) assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844);
    await page.getByRole('button', { name: 'Restore Independent second script', exact: true }).click();
    assert.equal(await page.evaluate(() => crossB.getState().minimized), false);
    await page.evaluate(() => crossA.destroy());
    assert.ok(await page.locator('[data-tsui-style]').count() >= 1, 'other bundles retain their stylesheet');
    await page.evaluate(() => { crossB.collapse(false); crossB.destroy(); });
    assert.equal(await page.locator('[data-tsui-style]').count(), 0);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.evaluate(async () => {
      window.ownedListenerCount = 0; window.ownedObserverCount = 0; window.sharedStopCount = 0;
      const listeners = new Set(), originals = [];
      for (const target of [window, document]) {
        const add = target.addEventListener, remove = target.removeEventListener;
        originals.push(() => { target.addEventListener = add; target.removeEventListener = remove; });
        target.addEventListener = function(type, fn, options) { listeners.add(fn); return add.call(this, type, fn, options); };
        target.removeEventListener = function(type, fn, options) { listeners.delete(fn); return remove.call(this, type, fn, options); };
      }
      const NativeObserver = MutationObserver;
      window.MutationObserver = class extends NativeObserver { constructor(fn) { super(fn); ownedObserverCount++; } disconnect() { ownedObserverCount--; super.disconnect(); } };
      const tool = kit.createTornScriptUI({ doc: document, win: window, applyTheme: () => {}, themeClient: { get: () => ({}), stop: () => sharedStopCount++ } });
      tool.root.remove(); await Promise.resolve(); await Promise.resolve();
      ownedListenerCount = listeners.size;
      window.detachDestroyed = tool.getState().destroyed;
      originals.forEach(restore => restore()); window.MutationObserver = NativeObserver;
    });
    assert.deepEqual(await page.evaluate(() => [detachDestroyed, ownedListenerCount, ownedObserverCount, sharedStopCount]), [true, 0, 0, 0]);
    await page.evaluate(() => {
      window.PDA_httpGet=()=>{};
      window.pdaFit=kit.createTornScriptUI({doc:document,win:window,applyTheme:()=>{},readLayout:()=>new Promise(resolve=>window.finishPdaLayout=resolve)});
      pdaFit.show();
    });
    assert.equal(await page.evaluate(()=>pdaFit.getState().maximized),true,'PDA floating base opens maximized without a Hub');
    await page.evaluate(()=>finishPdaLayout({version:1,desktop:{x:120,y:80,width:620,height:420,collapsed:true},mobile:{x:20,y:24,width:330,height:300,collapsed:true}}));
    await page.waitForFunction(()=>pdaFit.getState().maximized&&!pdaFit.getState().collapsed);
    await page.evaluate(()=>pdaFit.restore());
    assert.deepEqual(await page.evaluate(()=>{const state=pdaFit.getState();return[state.maximized,state.rect.width,state.rect.height];}),[false,620,420],'manual restore retains hydrated normal geometry');
    await page.evaluate(()=>{pdaFit.hide();pdaFit.show();});
    assert.equal(await page.evaluate(()=>pdaFit.getState().maximized),true,'PDA reopen maximizes');
    await page.evaluate(()=>{pdaFit.restore();pdaFit.minimize();pdaFit.restore();});
    assert.equal(await page.evaluate(()=>pdaFit.getState().maximized),true,'PDA minimized reopen maximizes');
    await page.evaluate(()=>{pdaFit.destroy();delete window.PDA_httpGet;});
    await page.evaluate(async () => {
      let resolveState; window.startupStates = [];
      window.PDA_getTabState = () => new Promise(resolve => { resolveState = resolve; });
      let returned=null;window.visibilityAfterConstruction=[];
      const tool = kit.createTornScriptUI({ doc: document, win: window, applyTheme: () => {}, onVisibilityChange: value => {startupStates.push(value);visibilityAfterConstruction.push(returned!==null&&returned.root.isConnected);} });
      returned=tool;
      await Promise.resolve();
      window.dispatchEvent(new CustomEvent('tornpda:tabState', { detail: { isActiveTab: true, isWebViewVisible: true } }));
      resolveState({ isActiveTab: false, isWebViewVisible: false });
      await Promise.resolve();
      window.pdaStartupActive = tool.getState().active;
      tool.destroy(); delete window.PDA_getTabState;
    });
    assert.deepEqual(await page.evaluate(() => [startupStates.slice(0, 2), pdaStartupActive]), [[false, true], true], 'PDA activation waits for native state, and newer events win');
    assert.equal(await page.evaluate(()=>visibilityAfterConstruction.every(Boolean)),true,'initial visibility callbacks can safely use the returned mounted shell');
    await page.evaluate(async () => {
      window.PDA_getTabState = () => Promise.resolve(undefined);
      window.malformedPda = kit.createTornScriptUI({ doc: document, win: window, applyTheme: () => {} });
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    assert.equal(await page.evaluate(() => malformedPda.getState().active), true, 'malformed native state falls back to document visibility');
    await page.evaluate(() => { malformedPda.destroy(); window.PDA_getTabState = () => new Promise(() => {}); window.hungPda = kit.createTornScriptUI({ doc: document, win: window, applyTheme: () => {} }); });
    assert.equal(await page.evaluate(() => hungPda.getState().active), false);
    await page.waitForTimeout(820);
    assert.equal(await page.evaluate(() => hungPda.getState().active), true, 'hung native state has a bounded visibility fallback');
    await page.evaluate(() => { hungPda.destroy(); delete window.PDA_getTabState; });
    await page.evaluate(async () => {
      const nativeSet = window.setTimeout, nativeClear = window.clearTimeout, owned = new Set();
      window.setTimeout = function(fn, delay) { const id = nativeSet.call(window, () => { owned.delete(id); fn(); }, delay); owned.add(id); return id; };
      window.clearTimeout = function(id) { owned.delete(id); return nativeClear.call(window, id); };
      window.PDA_getTabState = () => new Promise(() => {});
      const eventTool = kit.createTornScriptUI({ doc: document, win: window, applyTheme: () => {} });
      window.timerCreated = owned.size;
      window.dispatchEvent(new CustomEvent('tornpda:tabState', { detail: { isActiveTab: false, isWebViewVisible: true } }));
      window.timerAfterEvent = owned.size; eventTool.destroy();
      const removedTool = kit.createTornScriptUI({ doc: document, win: window, applyTheme: () => {} });
      removedTool.destroy(); window.timerAfterDestroy = owned.size;
      window.setTimeout = nativeSet; window.clearTimeout = nativeClear; delete window.PDA_getTabState;
      await Promise.resolve();
    });
    assert.deepEqual(await page.evaluate(() => [timerCreated, timerAfterEvent, timerAfterDestroy]), [1, 0, 0], 'native state event and destroy release the owned fallback timer');
    // The installable showcase must use the same bundled helpers and work without Hub.
    const themeSource = fs.readFileSync(path.join(__dirname, '../../src/script-hub-theme.cjs'), 'utf8');
    const clientSource = fs.readFileSync(path.join(__dirname, '../../src/script-hub-theme-client.cjs'), 'utf8');
    const showcase = require('../../src/script-hub-ui-showcase.cjs');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addScriptTag({ content: '{const module={exports:{}};' + themeSource + clientSource + source + showcase.body + '}' });
    await page.getByRole('button', { name: 'Open UI showcase', exact: true }).click();
    await page.getByRole('button', { name: 'Draft form', exact: true }).click();
    await page.getByLabel('Local note', { exact: true }).fill('showcase draft');
    await page.getByLabel('Layout preview', { exact: true }).selectOption('workbench');
    assert.equal(await page.getByLabel('Local note', { exact: true }).inputValue(), 'showcase draft');
    await page.getByRole('button', { name: 'Local tasks', exact: true }).click();
    await page.getByRole('button', { name: 'Start local task', exact: true }).click();
    await page.getByRole('button', { name: 'Advance task', exact: true }).click();
    assert.equal(await page.locator('[data-tsui-id="ui-showcase"] progress').getAttribute('value'), '25');
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
    assert.equal(await page.locator('[data-tsui-id]').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS real Brave UI kit drafts, navigation, pointer/keyboard, stacking, PDA visibility, bounds, safe helpers and teardown');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
