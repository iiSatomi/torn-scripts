const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { fn } = require('../armory-categories.test.cjs');

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', headless: true });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', request => request.respond({ status: 200, contentType: 'text/html', body: '<body></body>' }));
    await page.goto('http://127.0.0.1/factions.php#/tab=armoury&sub=medical');
    await page.evaluate(code => {
      document.body.innerHTML = '<div id="faction-armoury-tabs"><li class="ui-tabs-active" aria-selected="true"><a href="#tab=armoury&sub=medical">Medical</a></li><section class="armoury-tabs" id="tab=armoury&sub=utilities"><ul class="item-list"><li><div class="img-wrap" data-itemid="1"></div></li></ul></section><section class="armoury-tabs" id="tab=armoury&sub=medical"><ul class="item-list"><li><div class="img-wrap" data-itemid="2"></div></li></ul></section></div>';
      const setup = `let _armoryNeed=null, _ocmArmoryObserver=null, _ocmArmoryObservedRoot=null;
        let _armoryAnnotationGeneration=0;
        const GMK={API_KEY:'key'}, GM_getValue=()=> 'fixture';
        const NATIVE_LOAN_SUBS=new Set(['medical','utilities']);
        const fetchArmoryNeed=()=>new Promise(resolve=>window.finishNeed=()=>resolve({}));
        const ocmToast=()=>{};
        const paintArmoryColumn=wrap=>window.paints.push(wrap.id);
      `;
      window.paints = [];
      new Function(setup + code + '\nwindow.activeSub=activeArmourySub; window.annotate=initArmoryAnnotations; window.resetNeed=()=>{_armoryNeed=null;};')();
      window.pendingAnnotation = annotate();
    }, ['activeArmourySub', 'nativeArmouryWrap', 'waitForEl', 'initArmoryAnnotations'].map(fn).join('\n'));
    assert.equal(await page.evaluate(() => activeSub()), 'medical', 'Selected LI is a container; resolve its category anchor');
    await page.waitForFunction(() => typeof finishNeed === 'function');
    await page.evaluate(() => finishNeed());
    await page.evaluate(() => pendingAnnotation);
    assert.deepEqual(await page.evaluate(() => paints), ['tab=armoury&sub=medical'], 'Never annotate an old category retained in the DOM');
    // Leaving the armory during a fetch must not install a stale observer.
    await page.evaluate(() => { paints=[]; resetNeed(); pendingAnnotation=annotate(); });
    await page.evaluate(() => { location.hash='#/tab=crimes'; annotate(); finishNeed(); });
    await page.evaluate(() => pendingAnnotation);
    assert.deepEqual(await page.evaluate(() => paints), [], 'Route departure cancels pending annotation');
    console.log('Armory navigation: current category only; route departure cancels pending work.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
