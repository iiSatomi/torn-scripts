const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core');
const source=fs.readFileSync(path.resolve(__dirname,'../../Torn_OC_Suite_Codex.user.js'),'utf8');
function fn(name){const s=source.indexOf('  function '+name+'(');assert.ok(s>=0);return source.slice(s,source.indexOf('\n  }',s)+4);}
(async()=>{const browser=await puppeteer.launch({executablePath:'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',headless:true});try{
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent('<h2 id="ocm-title-tscpr"></h2><div id="ocm-tscoverage"></div><div id="ocm-tscpr"></div>');
await page.evaluate(code=>{new Function(code+`
const esc=v=>String(v).replace(/</g,'&lt;');
const roster=Object.fromEntries(Array.from({length:49},(_,i)=>[i+1,{id:i+1,name:'Member '+(i+1)}]));
let tsCprData=Object.fromEntries(Array.from({length:22},(_,i)=>[i+1,{'Bidding War':{'Bidder #1':70}}]));
const cprArchive=()=>({23:{slots:{a:{ocName:'Bidding War',role:'Bidder',cpr:65,executedAt:100}}}});
renderTsCoverage(roster);renderTsCprSection(roster);window.historyOnly=()=>{tsCprData={};renderTsCprSection(roster);};`)();
},['buildCprCoverage','renderTsCoverage','renderTsCprSection'].map(fn).join('\n'));
assert.equal(await page.$$eval('tbody tr',rows=>rows.length),49);assert.match(await page.$eval('[data-cpr-summary]',e=>e.textContent),/23 \/ 49/);
assert.match(await page.$eval('tbody',e=>e.textContent),/History/);assert.match(await page.$eval('tbody',e=>e.textContent),/Missing/);
for(const [width,height]of [[1920,1080],[390,844],[430,932],[844,390]]){await page.setViewport({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
await page.evaluate(()=>window.historyOnly());assert.equal(await page.$$eval('tbody tr',rows=>rows.length),49);assert.match(await page.$eval('[data-cpr-summary]',e=>e.textContent),/1 \/ 49/);assert.deepEqual(errors,[]);console.log('CPR browser fixture passed: full roster, sources, history-only fallback, four viewports.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
