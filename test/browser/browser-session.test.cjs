const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getVisibleWindowState,
  assertVisibleWindowUnchanged,
  withBackgroundTorn,
} = require('./browser-session.cjs');

function makeVisiblePage({
  windowId = 12,
  bounds = { left: 0, top: 0, width: 1920, height: 1080, windowState: 'normal' },
  viewport = { width: 1903, height: 945 },
} = {}) {
  const commands = [];
  return {
    commands,
    target() {
      return {
        async createCDPSession() {
          return {
            async send(command) {
              commands.push(command);
              assert.equal(command, 'Browser.getWindowForTarget');
              return { windowId, bounds };
            },
            async detach() {},
          };
        },
      };
    },
    async evaluate() {
      return viewport;
    },
  };
}

test('captures real visible bounds without applying a device override', async () => {
  const page = makeVisiblePage();

  const state = await getVisibleWindowState(page);

  assert.deepEqual(state, {
    windowId: 12,
    bounds: { left: 0, top: 0, width: 1920, height: 1080, windowState: 'normal' },
    viewport: { width: 1903, height: 945 },
  });
  assert.deepEqual(page.commands, ['Browser.getWindowForTarget']);
});

test('desktop stability guard rejects any visible window or viewport change', () => {
  const before = {
    windowId: 12,
    bounds: { left: 0, top: 0, width: 1920, height: 1080, windowState: 'normal' },
    viewport: { width: 1903, height: 945 },
  };

  assert.doesNotThrow(() => assertVisibleWindowUnchanged(before, structuredClone(before)));
  assert.throws(
    () => assertVisibleWindowUnchanged(before, {
      ...structuredClone(before),
      viewport: { width: 390, height: 844 },
    }),
    /visible test browser changed size/i,
  );
});

test('background PDA session never activates or resizes the visible Torn page', async () => {
  const events = [];
  const bounds = { left: 0, top: 0, width: 1920, height: 1080, windowState: 'normal' };
  const sourcePage = {
    url: () => 'https://www.torn.com/factions.php',
    async cookies() { events.push(['cookies']); return [{ name: 'session', value: 'not-logged' }]; },
    target() {
      return {
        async createCDPSession() {
          return {
            async send(command) {
              events.push(['visible-command', command]);
              return { windowId: 8, bounds };
            },
            async detach() {},
          };
        },
      };
    },
    async evaluate() { return { width: 1903, height: 945 }; },
    async bringToFront() { events.push(['unexpected-foreground']); },
  };
  const mobilePage = {
    async setViewport(value) { events.push(['mobile-viewport', value]); },
    async setCookie(...value) { events.push(['mobile-cookies', value.length]); },
    async bringToFront() { events.push(['unexpected-mobile-foreground']); },
  };
  const context = {
    id: 'isolated-context',
    async close() { events.push(['context-close']); },
  };
  const browserSession = {
    async send(command, options) {
      events.push(['browser-command', command, options]);
      return { targetId: 'background-target' };
    },
    async detach() { events.push(['browser-session-detach']); },
  };
  const target = { _targetId: 'background-target', async page() { return mobilePage; } };
  const browser = {
    async pages() { return [sourcePage]; },
    async createBrowserContext() { events.push(['context-create']); return context; },
    target() { return { async createCDPSession() { return browserSession; } }; },
    async waitForTarget(predicate) { assert.equal(predicate(target), true); return target; },
    async disconnect() { events.push(['disconnect']); },
  };
  const puppeteerImpl = {
    async connect(options) { events.push(['connect', options]); return browser; },
  };

  await assert.rejects(
    withBackgroundTorn({ width: 390, height: 844, puppeteerImpl }, async page => {
      await assert.rejects(page.bringToFront(), /background PDA page cannot be brought to the foreground/i);
      throw new Error('planned background failure');
    }),
    /planned background failure/,
  );

  assert.equal(events.some(event => String(event[0]).includes('foreground')), false);
  assert.deepEqual(events.filter(event => event[0] === 'browser-command'), [[
    'browser-command',
    'Target.createTarget',
    { url: 'about:blank', browserContextId: 'isolated-context', background: true },
  ]]);
  assert.deepEqual(events.filter(event => event[0] === 'mobile-viewport'), [[
    'mobile-viewport',
    { width: 390, height: 844, isMobile: true, deviceScaleFactor: 1 },
  ]]);
  assert.equal(events.filter(event => event[0] === 'context-close').length, 1);
  assert.equal(events.filter(event => event[0] === 'disconnect').length, 1);
});
