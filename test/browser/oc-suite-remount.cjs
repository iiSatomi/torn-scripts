const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { fn } = require('../armory-categories.test.cjs');

(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="host"></div>');
    const result = await page.evaluate(code => {
      const counts = { armory: 0, consumables: 0, sync: 0 };
      const setup = `const _armMounted=new WeakSet(), _consMounted=new WeakSet();
        const GMK={API_KEY:'key'}, GM_getValue=()=> 'fixture';
        const ARM={entries:()=>[['old',{}]],state:{lastSync:0}}, FBUSAGE={init:()=>{}};
        const _armLoad=()=>{counts.sync++; ARM.state.lastSync=Date.now();};
        const renderArmoury=()=>{counts.armory++; document.getElementById('ocm-pane-armoury').textContent='Armory ready'};
        const renderConsumables=()=>{counts.consumables++; document.getElementById('ocm-pane-consumables').textContent='Consumables ready'};
      `;
      new Function('counts', setup + code + `
        for(let i=0;i<3;i++) {
          document.getElementById('host').innerHTML='<div id="ocm-pane-armoury"></div><div id="ocm-pane-consumables"></div>';
          mountArmouryInline(); mountArmouryInline();
          mountConsumablesInline(); mountConsumablesInline();
        }
      `)(counts);
      return counts;
    }, fn('mountArmouryInline') + '\n' + fn('mountConsumablesInline'));
    assert.deepEqual(result, { armory: 3, consumables: 3, sync: 1 }, 'Replacement panes mount; an existing stale ledger refreshes once');
    console.log('Suite remount: Armory and Consumables survive three pane replacements.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
