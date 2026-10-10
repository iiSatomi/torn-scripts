// The multi-war sweep used to re-check overdoses on every run even though it had
// been writing each war's result to that war's cache slot all along. These tests
// pin the two things that fixes: a cache-only pass costs no API calls, and a LIVE
// war is never served from cache because someone can still overdose in it.
const fs = require('fs');
const SRC = String.raw`C:\Users\asato\Desktop\Game Stuff\Torn Scripts\Torn_OC_Suite_PurrfectCrime.user.js`;
const src = fs.readFileSync(SRC, 'utf8');

const start = src.indexOf('    async function sweepOverdoses(');
if (start < 0) throw new Error('sweepOverdoses not found');
let i = src.indexOf('{', start), d = 0, k = i;
for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
const body = src.slice(start, k + 1);

let apiCalls = 0, saves = 0;
const store = {};                                   // warId -> cache payload
const mk = (fn) => new Function('cacheLoad','cacheSave','checkOverdoses','wastedEnergy','ENERGY_PER_XANAX',
  fn + '\n; return sweepOverdoses;');
const sweepOverdoses = mk(body)(
  async warId => store[warId] || null,
  async (war, r, a, p, dr, off, od) => { saves++; store[war.warId] = Object.assign(store[war.warId] || {}, { od }); },
  async (key, targets, war) => { apiCalls++; return Object.fromEntries(targets.map(t => [t.id, { mode: 'delta', ods: t.id === 2 ? 1 : 0 }])); },
  (xan, hits) => xan * 250 - hits * 25,
  250
);

const drugs = { list: [{ id: 1, xanax: 5, hits: 2 }, { id: 2, xanax: 8, hits: 0 }] };
const ended = { warId: 'w1', oppName: 'Requiem', start: 100, end: 200 };
const live  = { warId: 'w2', oppName: 'Sedition', start: 300, end: 0 };
const pw = () => [{ war: ended, drugs, hitsSrc: 'report' }, { war: live, drugs, hitsSrc: 'report' }];

let fail = 0;
const check = (l, c) => { console.log((c ? '  PASS  ' : '  FAIL  ') + l); if (!c) fail++; };

(async () => {
  // ── first run, nothing cached: both wars cost calls
  let p = pw();
  await sweepOverdoses('k', p, null, {});
  check('first run checks both wars against the API', apiCalls === 2);
  check('each checked war is written to its cache slot', saves === 2);
  check('coverage marks both wars eligible and checked',
        p.filter(x => x.odEligible).length === 2 && p.filter(x => x.odChecked).length === 2);

  // ── second run: the ENDED war is served from cache, the LIVE one is not
  apiCalls = 0; p = pw();
  await sweepOverdoses('k', p, null, {});
  check('an ended war is reused from cache, costing no call', apiCalls === 1);
  check('the cached war is flagged as such', p[0].odFromCache === true);
  check('a LIVE war is re-checked, never served from cache', p[1].odFromCache === false);

  // ── cacheOnly: free, and silently skips what it has never seen
  apiCalls = 0; p = pw();
  const out = await sweepOverdoses('k', p, null, { cacheOnly: true });
  check('cacheOnly makes no API calls at all', apiCalls === 0);
  check('cacheOnly still returns what it had cached', !!out[2] && out[2].ods === 1);
  check('cacheOnly reports partial coverage honestly',
        p.filter(x => x.odEligible).length === 2 && p.filter(x => x.odChecked).length === 1);

  console.log(fail ? fail + ' FAILED' : 'all good');
  process.exitCode = fail ? 1 : 0;
})();
