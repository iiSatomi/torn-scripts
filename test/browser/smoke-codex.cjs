const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const {
  getVisibleWindowState,
  assertVisibleWindowUnchanged,
  withBackgroundTorn,
} = require('./browser-session.cjs');

const SCRIPT = path.resolve(__dirname, '..', '..', 'Torn_OC_Suite_Codex.user.js');
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT, 'utf8');
const SHOT = path.join(__dirname, 'shots', 'codex-configured-mobile.png');
const DIAG_SHOT = path.join(__dirname, 'shots', 'codex-diagnostics-mobile.png');
const CLASSIC_DESKTOP_SHOT = path.join(__dirname, 'shots', 'codex-classic-shell-desktop.png');
const CLASSIC_DESKTOP_CONFIG_SHOT = path.join(__dirname, 'shots', 'codex-classic-config-desktop.png');
const CLASSIC_MOBILE_SHOT = path.join(__dirname, 'shots', 'codex-classic-shell-mobile.png');
const CLASSIC_WIDE_MOBILE_SHOT = path.join(__dirname, 'shots', 'codex-classic-shell-mobile-430.png');
const CLASSIC_LANDSCAPE_SHOT = path.join(__dirname, 'shots', 'codex-classic-shell-landscape.png');
const CLASSIC_TAB_SHOTS = Object.fromEntries(
  ['home', 'crimes', 'people', 'consumables', 'war', 'armoury']
    .map(tab => [tab, path.join(__dirname, 'shots', `codex-classic-tab-${tab}-desktop.png`)])
);
const MOCK = {
  ok: true,
  meta: { historyDays: 7, lastSync: '2026-08-23T20:19:00.000Z', unattended: false },
  rows: [
    { id: 101, name: 'Alex', position: 'Leader', xantaken: 42, alcoholused: 8, drugsused: 3, refills: 2, nerverefills: 1, statenhancersused: 0 },
    { id: 102, name: 'Morgan', position: 'Member', xantaken: 31, alcoholused: 4, drugsused: 2, refills: 1, nerverefills: 0, statenhancersused: 2 },
    { id: 103, name: 'Sam', position: 'Member', xantaken: 12, alcoholused: 6, drugsused: 1, refills: 0, nerverefills: 1, statenhancersused: 0 }
  ],
  periods: [
    { id: 101, d_xantaken: 6, d_alcoholused: 1, d_drugsused: 1, d_refills: 0, d_nerverefills: 0, d_statenhancersused: 0, d_window: 1, w_xantaken: 42, w_alcoholused: 8, w_drugsused: 3, w_refills: 2, w_nerverefills: 1, w_statenhancersused: 0, w_window: 7, m_xantaken: 42, m_alcoholused: 8, m_drugsused: 3, m_refills: 2, m_nerverefills: 1, m_statenhancersused: 0, m_window: 7 },
    { id: 102, d_xantaken: 4, d_alcoholused: 1, d_drugsused: 0, d_refills: 0, d_nerverefills: 0, d_statenhancersused: 1, d_window: 1, w_xantaken: 31, w_alcoholused: 4, w_drugsused: 2, w_refills: 1, w_nerverefills: 0, w_statenhancersused: 2, w_window: 7, m_xantaken: 31, m_alcoholused: 4, m_drugsused: 2, m_refills: 1, m_nerverefills: 0, m_statenhancersused: 2, m_window: 7 },
    { id: 103, d_xantaken: 2, d_alcoholused: 1, d_drugsused: 0, d_refills: 0, d_nerverefills: 0, d_statenhancersused: 0, d_window: 1, w_xantaken: 12, w_alcoholused: 6, w_drugsused: 1, w_refills: 0, w_nerverefills: 1, w_statenhancersused: 0, w_window: 7, m_xantaken: 12, m_alcoholused: 6, m_drugsused: 1, m_refills: 0, m_nerverefills: 1, m_statenhancersused: 0, m_window: 7 }
  ]
};

let visibleBrowser;
let visibleContext;

(async () => {
  visibleBrowser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const sourcePage = (await visibleBrowser.pages()).find(p => p.url().includes('torn.com')) || await visibleBrowser.newPage();
  visibleContext = await visibleBrowser.createBrowserContext();
  let page = await visibleContext.newPage();
  const cookies = await sourcePage.cookies('https://www.torn.com');
  if (cookies.length) await page.setCookie(...cookies);
  const errors = [];
  let gmStore = {};
  const configurePage = async targetPage => {
    page = targetPage;
    await page.setBypassCSP(true);
    page.on('pageerror', e => errors.push({ kind: 'pageerror', text: String(e), stack: e.stack || '' }));
    page.on('console', m => {
      if (m.type() === 'error') errors.push({ kind: 'console', text: m.text(), location: m.location() });
    });
    await page.exposeFunction('gmPersist', raw => {
      try { gmStore = JSON.parse(raw); } catch (_) {}
    });
    await page.exposeFunction('gmXhr', async opts => {
      if (String(opts.url).startsWith('https://codex.test/')) {
        return { status: 200, statusText: 'OK', responseText: JSON.stringify(MOCK), finalUrl: opts.url, ok: true };
      }
      return { status: 200, statusText: 'OK', responseText: JSON.stringify({ error: { code: 1, error: 'mock blocked' } }), finalUrl: opts.url, ok: true };
    });
  };
  await configurePage(page);
  await page.goto('https://www.torn.com/factions.php?step=your&type=1#/tab=crimes', { waitUntil: 'domcontentloaded' }).catch(() => {});
  const visibleWindowBefore = await getVisibleWindowState(page);
  assert.ok(visibleWindowBefore.bounds.width >= 1920 && visibleWindowBefore.bounds.height >= 1080,
    `Dedicated test window must be at least 1920x1080; got ${visibleWindowBefore.bounds.width}x${visibleWindowBefore.bounds.height}`);
  assert.ok(visibleWindowBefore.viewport.width >= 1800 && visibleWindowBefore.viewport.height >= 850,
    `Desktop content viewport is too small: ${visibleWindowBefore.viewport.width}x${visibleWindowBefore.viewport.height}`);
  const installSuite = async ({ navigate = false } = {}) => {
    if (navigate) {
      await page.goto('https://www.torn.com/factions.php?step=your&type=1#/tab=crimes', { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    await page.evaluate(() => localStorage.setItem('frostbiteUsage.settings.v1', JSON.stringify({
      sheetUrl: 'https://codex.test/usage', readSecret: 'test-secret', tornApiKey: 'test-key',
      tornEnabled: false, fetchAll: false, autoRefresh: false
    })));
    await page.evaluate(initialStore => {
      const S = { ...initialStore };
      const persist = () => { try { window.gmPersist(JSON.stringify(S)); } catch (_) {} };
      window.GM_getValue = (k, d) => Object.prototype.hasOwnProperty.call(S, k) ? S[k] : d;
      window.GM_setValue = (k, v) => { S[k] = v; persist(); };
      window.GM_deleteValue = k => { delete S[k]; persist(); };
      window.GM_listValues = () => Object.keys(S);
      window.GM_addStyle = css => { const el = document.createElement('style'); el.textContent = css; document.head.appendChild(el); return el; };
      window.GM_info = { script: { name: 'OC Suite Codex smoke', version: '0.0.0' } };
      const xhr = opts => Promise.resolve(window.gmXhr({ method: opts.method, url: opts.url, headers: opts.headers, data: opts.data, timeout: opts.timeout }))
        .then(r => r.ok || r.status ? opts.onload?.(r) : opts.onerror?.(r)).catch(e => opts.onerror?.({ status: 0, statusText: String(e), responseText: '' }));
      window.GM_xmlHttpRequest = xhr;
      window.GM_xmlhttpRequest = xhr;
      window.GM = { xmlHttpRequest: xhr, getValue: async (k, d) => window.GM_getValue(k, d), setValue: async (k, v) => window.GM_setValue(k, v) };
      window.unsafeWindow = window;
    }, gmStore);
    await page.evaluate(SCRIPT_SOURCE);
    await page.waitForSelector('#ocm-root', { timeout: 15000 });
    await page.waitForSelector('#ocm-diagnostics-panel', { timeout: 5000 });
    // With no real faction API key in this isolated smoke run, the suite keeps
    // its body hidden behind setup. Reveal the built shell before measuring CSS.
    await page.evaluate(() => { document.getElementById('ocm-body').style.display = 'block'; });
  };
  await installSuite();
  const measureShell = () => page.evaluate(() => {
    const root = document.getElementById('ocm-root');
    const tabs = document.getElementById('ocm-tabs');
    const nav = [...tabs.querySelectorAll('.ocm-nav')];
    const headerButtons = [...document.querySelectorAll('#ocm-header button')];
    return {
      viewport: { width: innerWidth, height: innerHeight },
      rootRect: (() => {
        const rect = root.getBoundingClientRect();
        const style = getComputedStyle(root);
        return {
          x: Math.round(rect.x), y: Math.round(rect.y),
          width: Math.round(rect.width), height: Math.round(rect.height),
          display: style.display, visibility: style.visibility, opacity: style.opacity,
        };
      })(),
      pdaControlMinimums: (() => {
        const cssSize = (selector, property) => {
          const el = document.querySelector(selector);
          return el ? (parseFloat(getComputedStyle(el)[property]) || 0) : null;
        };
        return {
          configButtonHeight: cssSize('#ocm-fu-save', 'minHeight'),
          configInputHeight: cssSize('#ocm-fu-sheet', 'minHeight'),
          configCloseWidth: cssSize('#ocm-config-close', 'minWidth'),
          featureButtonHeight: cssSize('.ocm-feature-launch, .ocm-cons-action', 'minHeight'),
        };
      })(),
      className: root.className,
      header: !!document.getElementById('ocm-header'),
      rail: !!document.getElementById('ocm-rail'),
      topbar: !!document.getElementById('ocm-topbar'),
      labels: nav.map(el => el.querySelector('.ocm-nav-l')?.textContent.trim()),
      labelFontSizes: nav.map(el => parseFloat(getComputedStyle(el.querySelector('.ocm-nav-l')).fontSize)),
      flexDirection: getComputedStyle(tabs).flexDirection,
      flexWrap: getComputedStyle(tabs).flexWrap,
      tabRows: new Set(nav.map(el => Math.round(el.getBoundingClientRect().top))).size,
      overflow: root.scrollWidth > root.clientWidth + 1,
      navMinHeight: Math.min(...nav.map(el => el.getBoundingClientRect().height)),
      headerButtonMinHeight: headerButtons.length
        ? Math.min(...headerButtons.map(el => el.getBoundingClientRect().height))
        : 0,
    };
  });
  const desktopShell = await measureShell();
  assert.ok(desktopShell.viewport.width >= 1800 && desktopShell.viewport.height >= 850,
    `Desktop content viewport is too small: ${desktopShell.viewport.width}x${desktopShell.viewport.height}`);
  assert.equal(desktopShell.className, 'ocm-ui2 ocm-classic');
  assert.equal(desktopShell.header, true);
  assert.equal(desktopShell.rail, false);
  assert.equal(desktopShell.topbar, false);
  assert.deepEqual(desktopShell.labels, ['Dashboard', 'Crimes', 'People', 'Consumables', 'War', 'Armory']);
  assert.equal(desktopShell.flexDirection, 'row');
  assert.equal(desktopShell.flexWrap, 'nowrap');
  assert.equal(desktopShell.tabRows, 1);
  assert.equal(desktopShell.overflow, false);
  const desktopRoot = await page.$('#ocm-root');
  if (desktopRoot) await desktopRoot.screenshot({ path: CLASSIC_DESKTOP_CONFIG_SHOT }).catch(() => {});
  await page.evaluate(() => {
    document.getElementById('ocm-config-panel').style.display = 'none';
    document.getElementById('ocm-body').style.display = 'block';
  });
  if (desktopRoot) await desktopRoot.screenshot({ path: CLASSIC_DESKTOP_SHOT }).catch(() => {});
  await page.focus('#ocm-tab-home');
  await page.keyboard.press('ArrowRight');
  const keyboardNavigation = await page.evaluate(() => ({
    active: document.querySelector('#ocm-tabs .ocm-nav.active')?.dataset.tab,
    focused: document.activeElement?.dataset?.tab,
    selected: document.getElementById('ocm-tab-crimes')?.getAttribute('aria-selected'),
    homeTabIndex: document.getElementById('ocm-tab-home')?.tabIndex,
    crimesTabIndex: document.getElementById('ocm-tab-crimes')?.tabIndex,
  }));
  assert.deepEqual(keyboardNavigation, {
    active: 'crimes', focused: 'crimes', selected: 'true', homeTabIndex: -1, crimesTabIndex: 0,
  });
  await page.focus('#ocm-pane-crimes .ocm-subtab.active');
  await page.keyboard.press('ArrowRight');
  const keyboardSubtabNavigation = await page.evaluate(() => {
    const active = document.querySelector('#ocm-pane-crimes .ocm-subtab.active');
    const panel = active?.getAttribute('aria-controls')
      ? document.getElementById(active.getAttribute('aria-controls'))
      : null;
    return {
      active: active?.dataset.sub,
      focused: document.activeElement?.dataset?.sub,
      selected: active?.getAttribute('aria-selected'),
      panelRole: panel?.getAttribute('role'),
      panelHidden: panel?.getAttribute('aria-hidden'),
    };
  });
  assert.deepEqual(keyboardSubtabNavigation, {
    active: 'active', focused: 'active', selected: 'true', panelRole: 'tabpanel', panelHidden: 'false',
  });
  await page.evaluate(() => document.getElementById('ocm-tab-home')?.click());
  const desktopTabs = [];
  for (const [tab, screenshot] of Object.entries(CLASSIC_TAB_SHOTS)) {
    const clickedTab = await page.evaluate(tabName => {
      const nav = document.querySelector(`#ocm-tabs .ocm-nav[data-tab="${tabName}"]`);
      nav?.click();
      return !!nav;
    }, tab);
    assert.equal(clickedTab, true, `${tab} navigation should exist`);
    await new Promise(resolve => setTimeout(resolve, tab === 'consumables' || tab === 'war' ? 500 : 100));
    const tabState = await page.evaluate(tabName => {
      const pane = document.getElementById(`ocm-pane-${tabName}`);
      const rect = pane?.getBoundingClientRect();
      return {
        tab: tabName,
        active: document.querySelector('#ocm-tabs .ocm-nav.active')?.dataset.tab,
        display: pane ? getComputedStyle(pane).display : 'missing',
        width: Math.round(rect?.width || 0),
        overflow: !!pane && pane.scrollWidth > pane.clientWidth + 1,
      };
    }, tab);
    desktopTabs.push(tabState);
    assert.equal(tabState.active, tab, `${tab} navigation should become active`);
    assert.notEqual(tabState.display, 'none', `${tab} pane should be visible after selection`);
    assert.equal(tabState.overflow, false, `${tab} pane should not overflow horizontally at desktop width`);
    const paneHandle = await page.$(`#ocm-pane-${tab}`);
    if (paneHandle) await paneHandle.screenshot({ path: screenshot }).catch(() => {});
  }
  await page.evaluate(() => document.querySelector('#ocm-tabs .ocm-nav[data-tab="home"]')?.click());

  const visibleWindowAfter = await getVisibleWindowState(page);
  assertVisibleWindowUnchanged(visibleWindowBefore, visibleWindowAfter);
  await visibleContext.close();
  visibleContext = null;
  await visibleBrowser.disconnect();
  visibleBrowser = null;

  await withBackgroundTorn({ width: 390, height: 844 }, async isolatedPage => {
  await configurePage(isolatedPage);
  const pdaViewports = [
    { name: 'narrow', width: 390, height: 844, rows: 3, screenshot: CLASSIC_MOBILE_SHOT },
    { name: 'wide', width: 430, height: 932, rows: 3, screenshot: CLASSIC_WIDE_MOBILE_SHOT },
    { name: 'landscape', width: 844, height: 390, rows: 1, screenshot: CLASSIC_LANDSCAPE_SHOT },
  ];
  const pdaShells = [];
  for (const viewport of pdaViewports) {
    await page.setViewport({
      width: viewport.width, height: viewport.height, deviceScaleFactor: 1, isMobile: true,
    });
    await installSuite({ navigate: true });
    await page.evaluate(() => {
      document.getElementById('ocm-config-panel').style.display = 'none';
      document.getElementById('ocm-body').style.display = 'block';
      document.getElementById('ocm-root').scrollIntoView({ block: 'start' });
    });
    const shell = await measureShell();
    pdaShells.push({ name: viewport.name, ...shell });
    assert.deepEqual(shell.viewport, { width: viewport.width, height: viewport.height });
    assert.equal(shell.flexDirection, 'row');
    assert.equal(shell.tabRows, viewport.rows, `${viewport.name} PDA navigation should use the expected row count`);
    assert.equal(shell.overflow, false, `${viewport.name} PDA shell must not overflow horizontally`);
    assert.ok(shell.rootRect.y < viewport.height && shell.rootRect.y + shell.rootRect.height > 0,
      `${viewport.name} PDA shell should be reachable in the viewport`);
    assert.ok(shell.labelFontSizes.every(size => size >= 11),
      `${viewport.name} PDA tabs should keep readable text labels`);
    assert.ok(shell.navMinHeight >= 44,
      `${viewport.name} PDA navigation targets should be at least 44px high`);
    assert.ok(Object.values(shell.pdaControlMinimums).filter(size => size !== null).every(size => size >= 44),
      `${viewport.name} PDA settings and feature controls should expose 44px touch targets`);
    await new Promise(resolve => setTimeout(resolve, 250));
    const rootHandle = await page.$('#ocm-root');
    if (rootHandle) await rootHandle.screenshot({ path: viewport.screenshot });
  }
  const mobileShell = pdaShells[0];

  // Continue interaction checks in a freshly loaded narrow PDA document rather
  // than a desktop Torn document that was merely resized after React mounted.
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true });
  await installSuite({ navigate: true });
  await page.evaluate(() => {
    document.getElementById('ocm-config-panel').style.display = 'none';
    document.getElementById('ocm-body').style.display = 'block';
    document.getElementById('ocm-root').scrollIntoView({ block: 'start' });
  });

  const diagnostics = await page.evaluate(() => {
    document.getElementById('ocm-diagnostics-refresh')?.click();
    const panel = document.getElementById('ocm-diagnostics-panel');
    return {
      panel: !!panel,
      refresh: !!document.getElementById('ocm-diagnostics-refresh'),
      copy: !!document.getElementById('ocm-diagnostics-copy'),
      text: panel?.innerText || '',
      hasScriptVersion: /script ·/.test(panel?.innerText || ''),
      hasDomCount: /suite DOM nodes/.test(panel?.innerText || ''),
      hasTimers: /Timers:/.test(panel?.innerText || ''),
    };
  });
  assert.equal(diagnostics.panel, true);
  assert.equal(diagnostics.refresh, true);
  assert.equal(diagnostics.copy, true);
  assert.equal(diagnostics.hasScriptVersion, true);
  assert.equal(diagnostics.hasDomCount, true);
  assert.equal(diagnostics.hasTimers, true);
  const diagnosticsHandle = await page.$('#ocm-diagnostics-panel');
  if (diagnosticsHandle) await diagnosticsHandle.screenshot({ path: DIAG_SHOT }).catch(() => {});
  const clicked = await page.evaluate(() => {
    const nav = document.querySelector('#ocm-tabs .ocm-nav[data-tab="consumables"]');
    if (!nav) return false;
    nav.click();
    return true;
  });
  await new Promise(resolve => setTimeout(resolve, 1200));
  if (!clicked || !(await page.$('#ocm-cons-pulse'))) {
    console.log(JSON.stringify({ clicked, pane: await page.$eval('#ocm-pane-consumables', el => el.innerText).catch(() => ''), errors }, null, 2));
  }
  await page.waitForSelector('#ocm-cons-pulse', { timeout: 10000 });
  await page.evaluate(() => document.getElementById('ocm-cons-refresh')?.click());
  await page.waitForFunction(() => document.querySelector('#ocm-cons-attention')?.textContent.includes('Alex'), { timeout: 10000 });
  // The suite shell normally keeps its body behind the API-key settings panel
  // until the faction dashboard has loaded. This test isolates Consumables, so
  // reveal the already-rendered pane for visual and interaction verification.
  await page.evaluate(() => {
    document.getElementById('ocm-body').style.display = 'block';
    document.getElementById('ocm-config-panel').style.display = 'none';
  });

  const summary = await page.evaluate(() => ({
    pulse: !!document.querySelector('#ocm-cons-pulse'),
    attention: !!document.querySelector('#ocm-cons-attention'),
    ledger: !!document.querySelector('#ocm-cons-ledger'),
    trends: !!document.querySelector('#ocm-cons-trends'),
    searchType: document.querySelector('#ocm-cons-search')?.type,
    visibleText: document.querySelector('#ocm-pane-consumables')?.innerText.slice(0, 500),
    activeTab: document.querySelector('#ocm-tabs .ocm-nav.active')?.dataset.tab,
    paneDisplay: getComputedStyle(document.querySelector('#ocm-pane-consumables')).display,
    paneRect: (() => { const r = document.querySelector('#ocm-pane-consumables').getBoundingClientRect(); return { width: r.width, height: r.height, top: r.top }; })(),
    bodyDisplay: getComputedStyle(document.querySelector('#ocm-body')).display,
    configDisplay: getComputedStyle(document.querySelector('#ocm-config-panel')).display,
    overflowNodes: [...document.querySelector('#ocm-pane-consumables').querySelectorAll('*')].filter(el => el.scrollWidth > el.clientWidth + 1).slice(0, 8).map(el => ({ id: el.id, cls: el.className, sw: el.scrollWidth, cw: el.clientWidth })),
    shellChildren: [...document.querySelector('.ocm-cons-shell').children].map(el => ({ id: el.id, cls: el.className, sw: el.scrollWidth, cw: el.clientWidth })),
    overflow: document.querySelector('#ocm-pane-consumables').scrollWidth > document.querySelector('#ocm-pane-consumables').clientWidth
  }));
  assert.equal(summary.pulse, true);
  assert.equal(summary.attention, true);
  assert.equal(summary.ledger, true);
  assert.equal(summary.trends, true);
  assert.equal(summary.searchType, 'search');
  if (summary.overflow) console.log('overflow diagnostic', JSON.stringify(summary));
  assert.equal(summary.overflow, false);

  const paneHandle = await page.$('#ocm-pane-consumables');
  if (paneHandle && summary.paneDisplay !== 'none') await paneHandle.screenshot({ path: SHOT }).catch(() => {});

  await page.evaluate(() => { const input = document.getElementById('ocm-cons-search'); input.focus(); input.value = 'Alex'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  const filtered = await page.evaluate(() => document.querySelector('#ocm-cons-ledger').innerText);
  assert.match(filtered, /Alex/);
  assert.doesNotMatch(filtered, /Morgan/);
  await page.select('#ocm-cons-sort', 'xantaken');
  await page.evaluate(() => document.querySelector('.ocm-cons-period[data-p="weekly"]')?.click());
  const suiteErrors = errors.filter(error =>
    error.kind === 'pageerror' || !String(error.location?.url || '').startsWith('https://www.torn.com/builds/')
  );
  const hostPageErrors = errors.filter(error => !suiteErrors.includes(error));
  console.log(JSON.stringify({ desktopShell, keyboardNavigation, keyboardSubtabNavigation, desktopTabs, mobileShell, pdaShells, summary, diagnostics, suiteErrors, hostPageErrors, screenshot: SHOT, diagnosticsScreenshot: DIAG_SHOT, classicDesktopScreenshot: CLASSIC_DESKTOP_SHOT, classicDesktopConfigScreenshot: CLASSIC_DESKTOP_CONFIG_SHOT, classicMobileScreenshot: CLASSIC_MOBILE_SHOT, classicTabScreenshots: CLASSIC_TAB_SHOTS }, null, 2));
  assert.equal(suiteErrors.length, 0, 'Codex configured mobile smoke must have no suite-originated console errors');
  });
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
}).finally(async () => {
  if (visibleContext) await visibleContext.close().catch(() => {});
  if (visibleBrowser) await visibleBrowser.disconnect().catch(() => {});
});
