const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

async function getVisibleWindowState(page) {
  const session = await page.target().createCDPSession();
  try {
    const { windowId, bounds } = await session.send('Browser.getWindowForTarget');
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    return { windowId, bounds, viewport };
  } finally {
    await session.detach().catch(() => {});
  }
}

function assertVisibleWindowUnchanged(before, after) {
  try {
    assert.deepEqual(after, before);
  } catch (cause) {
    const error = new Error(
      `Visible test browser changed size or position. Before=${JSON.stringify(before)} After=${JSON.stringify(after)}`,
    );
    error.cause = cause;
    throw error;
  }
}

async function withBackgroundTorn(options, callback) {
  const {
    width,
    height,
    puppeteerImpl = puppeteer,
    browserURL = 'http://127.0.0.1:9222',
  } = options;

  const browser = await puppeteerImpl.connect({ browserURL, defaultViewport: null });
  let context;
  let browserSession;
  let sourcePage;
  let visibleBefore;
  try {
    sourcePage = (await browser.pages()).find(page => page.url().includes('torn.com'));
    if (!sourcePage) {
      throw new Error('The dedicated test browser has no Torn page open. Launch it and log in before running browser tests.');
    }
    visibleBefore = await getVisibleWindowState(sourcePage);
    const cookies = await sourcePage.cookies('https://www.torn.com');
    context = await browser.createBrowserContext();
    browserSession = await browser.target().createCDPSession();
    const { targetId } = await browserSession.send('Target.createTarget', {
      url: 'about:blank',
      browserContextId: context.id,
      background: true,
    });
    const target = await browser.waitForTarget(candidate => candidate._targetId === targetId);
    const page = await target.page();
    if (!page) throw new Error('The dedicated browser did not create the isolated background PDA page.');
    await page.setViewport({ width, height, isMobile: true, deviceScaleFactor: 1 });
    if (cookies.length) await page.setCookie(...cookies);
    const backgroundPage = new Proxy(page, {
      get(targetPage, property) {
        if (property === 'bringToFront') {
          return async () => {
            throw new Error('The background PDA page cannot be brought to the foreground.');
          };
        }
        const value = Reflect.get(targetPage, property, targetPage);
        return typeof value === 'function' ? value.bind(targetPage) : value;
      },
    });
    return await callback(backgroundPage, browser);
  } finally {
    if (context) await context.close().catch(() => {});
    if (browserSession) await browserSession.detach().catch(() => {});
    if (sourcePage && visibleBefore) {
      const visibleAfter = await getVisibleWindowState(sourcePage);
      assertVisibleWindowUnchanged(visibleBefore, visibleAfter);
    }
    await browser.disconnect().catch(() => {});
  }
}

module.exports = {
  getVisibleWindowState,
  assertVisibleWindowUnchanged,
  withBackgroundTorn,
};
