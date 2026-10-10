// Un-stick the debug Brave when a page is pinned to 800x600 (or any tiny size) by a
// lingering Emulation.setDeviceMetricsOverride — the classic "app in the top-left
// quarter, black everywhere else" symptom. Root cause: a puppeteer.connect() WITHOUT
// defaultViewport:null forces puppeteer's default 800x600 viewport and never clears it
// on disconnect. Prevention lives in the harnesses (all now pass defaultViewport:null);
// this tool repairs a browser that's already stuck.
//
// Per skills/diagnose-browser-css-viewport-mismatch: clearing the override alone has
// been observed NOT to restore the CSS viewport, so we clear first and, if innerWidth
// is still small, apply an explicit desktop override sized to the real window bounds.
const puppeteer = require('puppeteer-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', defaultViewport: null });
  const pages = await browser.pages();
  const targets = pages.filter(p => p.url().includes('torn.com'));
  if (!targets.length) { console.log('No torn.com page open to fix.'); await browser.disconnect(); return; }

  for (const page of targets) {
    const s = await page.target().createCDPSession();
    const before = await page.evaluate(() => ({ iw: innerWidth, ih: innerHeight }));
    const { bounds } = await s.send('Browser.getWindowForTarget');
    // Content area of the maximized window: trim window borders (~16px total) and the
    // tab strip + URL/bookmark bars (~120px). Slightly conservative so nothing clips.
    const W = Math.max(1024, bounds.width - 16);
    const H = Math.max(720, bounds.height - 120);

    // 1) Try the clean route first.
    await s.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
    await sleep(300);
    let now = await page.evaluate(() => ({ iw: innerWidth, ih: innerHeight }));

    // 2) If still pinned small, force an explicit desktop override (the reliable path).
    let method = 'clear';
    if (now.iw < W - 200) {
      await s.send('Emulation.setDeviceMetricsOverride', {
        width: W, height: H, deviceScaleFactor: 1, mobile: false,
        screenWidth: W, screenHeight: H, positionX: 0, positionY: 0, dontSetVisibleSize: false,
      });
      await sleep(300);
      now = await page.evaluate(() => ({ iw: innerWidth, ih: innerHeight }));
      method = `override ${W}x${H}`;
    }

    // 3) Verify it survives a reload (skill's verification step).
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(1500);
    const after = await page.evaluate(() => ({ iw: innerWidth, ih: innerHeight, scroll: document.documentElement.scrollWidth }));
    console.log(`${page.url().slice(0, 60)}\n  before=${before.iw}x${before.ih}  via=${method}  afterReload=${after.iw}x${after.ih} (scrollW ${after.scroll})  window=${bounds.width}x${bounds.height}`);
  }
  await browser.disconnect();
  console.log('done');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
