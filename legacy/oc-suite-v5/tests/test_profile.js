// v5.2 — the History restructure and the Member Profile drill-down.
//
// These guard the things that would parse fine and still be broken:
//   · validAvatarUrl must reject the SHARED silhouette Torn returns for members
//     with no picture (www.torn.com/images/profile_man.jpg). If it ever accepts
//     it, half the faction renders the same generic face — worse than initials.
//     It must also accept .gif, because animated avatars exist and an earlier
//     draft hardcoded .png.
//   · ocSlotList must read BOTH slot shapes. Live crimes carry user:{id};
//     archived rows are slimmed to a bare user_id. Reading only one is the exact
//     bug that gave every archived OC an empty crew in v5.0.1 and made the Money
//     tab disagree with itself.
//   · recordCprHistory must survive the renderReferenceSection deletion — it is
//     what grows the persistent CPR archive past Torn's ~100-OC window, and
//     losing it would silently freeze the archive forever.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'Torn_OC_Suite.user.js'), 'utf8');
const grab = (re, n) => { const m = src.match(re); if (!m) { console.error('MISSING', n); process.exit(1); } return m[0]; };

let fails = 0;
const ok = (label, cond) => { console.log(`${cond ? '✓' : '✗'} ${label}`); if (!cond) fails++; };
const eq = (label, got, want) => {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${pass ? '✓' : '✗'} ${label}${pass ? '' : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  if (!pass) fails++;
};

let validAvatarUrl, ocmInitials, ocmMonoColor, ocSlotList, ocmSortTable;
eval(grab(/function validAvatarUrl\(url, uid\) \{[\s\S]*?\n  \}/, 'validAvatarUrl').replace('function validAvatarUrl', 'validAvatarUrl=function'));
eval(grab(/function ocmInitials\(name\) \{[\s\S]*?\n  \}/, 'ocmInitials').replace('function ocmInitials', 'ocmInitials=function'));
eval(grab(/function ocmMonoColor\(uid\) \{[\s\S]*?\n  \}/, 'ocmMonoColor').replace('function ocmMonoColor', 'ocmMonoColor=function'));
eval(grab(/function ocSlotList\(oc\) \{[\s\S]*?\n  \}/, 'ocSlotList').replace('function ocSlotList', 'ocSlotList=function'));
eval(grab(/function ocmSortTable\(table, rows, cols, render, initial\) \{[\s\S]*?\n  \}/, 'ocmSortTable').replace('function ocmSortTable', 'ocmSortTable=function'));

// ── 1. Avatar URL acceptance — the rule that keeps generic faces off the roster.
console.log('\n— avatar URL validation —');
const REAL_PNG = 'https://profileimages.torn.com/14afebd0-ee13-4451-9abb-13e23ffac26c-3580191.png';
const REAL_GIF = 'https://profileimages.torn.com/553c89c9-263b-4e52-b87b-2106b315191d-3982553.gif';
ok('accepts a real .png avatar', validAvatarUrl(REAL_PNG, '3580191') === REAL_PNG);
ok('accepts a real .gif avatar (animated avatars exist)', validAvatarUrl(REAL_GIF, '3982553') === REAL_GIF);
ok('accepts when uid is passed as a number', validAvatarUrl(REAL_PNG, 3580191) === REAL_PNG);
ok('REJECTS the shared "no picture" silhouette',
   validAvatarUrl('https://www.torn.com/images/profile_man.jpg', '3580191') === '');
ok('rejects a URL whose uid does not match the member asked about',
   validAvatarUrl(REAL_PNG, '9999999') === '');
ok('rejects an empty / missing profile_image', validAvatarUrl('', '3580191') === '' && validAvatarUrl(null, '1') === '');
ok('rejects a lookalike host', validAvatarUrl('https://evil.example.com/abc-3580191.png', '3580191') === '');
ok('rejects http (downgrade)', validAvatarUrl(REAL_PNG.replace('https', 'http'), '3580191') === '');
ok('rejects a nested path on the right host',
   validAvatarUrl('https://profileimages.torn.com/x/abc-3580191.png', '3580191') === '');
// A member id that is a SUFFIX of another must not match: -13580191 vs -3580191.
ok('uid suffix match is exact, not a substring',
   validAvatarUrl('https://profileimages.torn.com/uuid-13580191.png', '3580191') === '');

// ── 2. Monogram fallback — every member gets a stable, distinct tile.
console.log('\n— monogram —');
eq('two-part name initials', ocmInitials('Big Bird'), 'BB');
eq('single name takes first two', ocmInitials('iSatomi'), 'IS');
eq('handles digits in name', ocmInitials('ST4TIC'), 'ST');
eq('underscore counts as a separator', ocmInitials('cool_guy'), 'CG');
eq('empty name degrades', ocmInitials(''), '?');
eq('null name degrades', ocmInitials(null), '?');
ok('colour is stable for the same uid', ocmMonoColor('3580191') === ocmMonoColor('3580191'));
ok('colour differs across uids', ocmMonoColor('3580191') !== ocmMonoColor('3982553'));
ok('colour is a valid hsl() with fixed S/L (legible white text)',
   /^hsl\(\d{1,3},42%,34%\)$/.test(ocmMonoColor('3580191')));

// ── 3. Slot shape tolerance — the v5.0.1 empty-crew bug.
console.log('\n— slot shapes (v5.0.1 regression) —');
const liveOc = { slots: [{ user: { id: 111 }, position_info: { label: 'Hacker' }, checkpoint_pass_rate: 80 }] };
const archivedOc = { slots: [{ user_id: 222, position: 'Muscle', checkpoint_pass_rate: 60 }] };
eq('reads the LIVE shape (user.id)', ocSlotList(liveOc), [{ uid: '111', role: 'Hacker', cpr: 80 }]);
eq('reads the ARCHIVED shape (user_id)', ocSlotList(archivedOc), [{ uid: '222', role: 'Muscle', cpr: 60 }]);
eq('open slot yields a null uid, not a crash', ocSlotList({ slots: [{ position: 'Bomber' }] }),
   [{ uid: null, role: 'Bomber', cpr: null }]);
eq('object-keyed slots (v1 leftovers) still work',
   ocSlotList({ slots: { a: { user_id: 5, position: 'X' } } }), [{ uid: '5', role: 'X', cpr: null }]);
eq('missing slots is empty, not a throw', ocSlotList({}), []);
eq('null OC is empty, not a throw', ocSlotList(null), []);

// ── 4. Sort helper — nulls must never win a ranking.
console.log('\n— ocmSortTable —');
{
  const mkTable = (n) => {
    const cells = Array.from({ length: n }, () => ({
      classList: { add() {}, remove() {} }, addEventListener() {},
      setAttribute() {}, removeAttribute() {},
    }));
    return { tHead: { rows: [{ cells }] } };
  };
  const rows = [
    { name: 'b', v: 5 }, { name: 'a', v: null }, { name: 'c', v: 10 },
  ];
  let painted = null;
  const cols = [{ key: 'name', get: r => r.name }, { key: 'v', get: r => r.v, num: true }];
  ocmSortTable(mkTable(2), rows, cols, r => { painted = r.map(x => x.name); }, { key: 'v', dir: 'desc' });
  eq('numeric desc puts nulls LAST (not treated as 0)', painted, ['c', 'b', 'a']);

  const rows2 = [{ name: 'b', v: 5 }, { name: 'a', v: null }, { name: 'c', v: 10 }];
  let painted2 = null;
  ocmSortTable(mkTable(2), rows2, cols, r => { painted2 = r.map(x => x.name); }, { key: 'v', dir: 'asc' });
  eq('numeric asc ALSO puts nulls last', painted2, ['b', 'c', 'a']);

  const rows3 = [{ name: 'c' }, { name: 'a' }, { name: 'b' }];
  let painted3 = null;
  ocmSortTable(mkTable(2), rows3, cols, r => { painted3 = r.map(x => x.name); }, { key: 'name', dir: 'asc' });
  eq('string sort is alphabetical', painted3, ['a', 'b', 'c']);

  ok('a table with no thead degrades instead of throwing',
     typeof ocmSortTable({}, [], [], () => {}, null).sort === 'function');
}

// ── 5. Side effects that had to SURVIVE deleting renderReferenceSection.
console.log('\n— preserved behaviour after the 1000-line deletion —');
ok('renderHistorySection exists', /function renderHistorySection\(ctx\)/.test(src));
ok('old renderReferenceSection is gone', !/function renderReferenceSection\(/.test(src));
ok('the History renderer is the one wired into renderDashboard', /renderHistorySection\(ctx\);/.test(src));
ok('recordCprHistory still runs — the CPR archive keeps growing',
   /recordCprHistory\(crimes, mInfo, exMemberNames, getWeight, normOcStatus\)/.test(src));
ok('TornStats CPR backfill button survived', /backfillCprFromTornStats\(tsData/.test(src));
ok('the header "Updated" stamp survived', /ocm-last-update'\)\.textContent = `Updated/.test(src));

// ── 6. The dead search widgets are gone — markup AND styling.
console.log('\n— dead widget removal —');
for (const dead of ['ocm-mh-search', 'ocm-oh-search', 'ocm-mh-dropdown', 'ocm-last5',
                    'ocm-member-history-wrap', 'ocm-oc-history-wrap',
                    'ocm-analytics-grid', 'ocm-analytics-card', 'ocm-chart-toggle']) {
  ok(`no leftover reference to .${dead}`, !src.includes(dead));
}
ok('.ocm-chart-wrap SURVIVED (still used by the charts drawer)', src.includes('.ocm-chart-wrap {'));
ok('.ocm-analytics-table SURVIVED (still used elsewhere)', src.includes('.ocm-analytics-table th'));

// ── 7. Profile view wiring.
console.log('\n— member profile —');
ok('buildMemberProfile exists', /function buildMemberProfile\(uid, ctx = \{\}\)/.test(src));
ok('profile hides the leader shell via a root class, like member mode',
   /#ocm-root\.ocm-profile-open \.ocm-tabs/.test(src));
ok('member mode never shows the profile',
   /#ocm-root\.ocm-member-mode #ocm-member-profile \{ display: none/.test(src));
ok('an open profile survives the 60s refresh',
   /if \(OCM_PROFILE_UID\) renderMemberProfile\(\);/.test(src));
ok('profile routing is delegated (survives innerHTML rebuilds)',
   /root\.addEventListener\('click'[\s\S]{0,300}data-ocm-profile/.test(src));
ok('a real Torn profile link is never swallowed by the drill-down',
   /if \(e\.target\.closest\('a\[href\*="profiles\.php"\]'\)\) return;/.test(src));
ok('Recent OCs paging state is module-level so re-render keeps your place',
   /let OCM_PROFILE_SHOWN = 5;/.test(src));

// ── 8. Avatar cache policy.
console.log('\n— avatar cache —');
ok('caches URLs, never image bytes', /AVATAR_CACHE: 'ocs_avatar_cache'/.test(src));
ok('30-day TTL matches Torn\'s own immutable cache window',
   /const AVATAR_TTL_MS = 30 \* 86400e3/.test(src));
ok('a failed lookup retries sooner than a good one',
   /const AVATAR_RETRY_MS = 7 \* 86400e3/.test(src));
ok('name resolution asks for profile too, so avatars ride along free',
   /selections=basic,profile/.test(src));
ok('paced at 400ms like every other per-uid walk', /syncProfileImages[\s\S]{0,2200}setTimeout\(r, 400\)/.test(src));
ok('avatar sync does NOT force a re-render (cosmetic only)',
   /syncProfileImages\(apiKey\)\.catch\(\(\) => \{\}\);/.test(src));
// v5.3: the roster shows faces too, so this is no longer "profile card only" —
// it now asserts the profile card renders a FULL-SIZE tile (no size class), while
// the roster opts into the small 'xs' variant.
ok('profile card renders the full-size avatar tile',
   /ocmAvatarHtml\(id\.uid, id\.name, id\.avatar\)/.test(src));
ok('images are lazy and fade in on load', /loading="lazy" onload="this\.classList\.add\('is-loaded'\)"/.test(src));

// ── 9. v5.3 — Scenarios + Runs merged into Crimes.
//
// The two views read as duplicates because both opened with the same four columns
// and the seat-failure breakdown was hidden behind a click. Merging them is only
// safe if the retired view names MIGRATE — a user sitting on 'runs' must not land
// on a blank pane — and if the weak seat is visible without expanding anything,
// which was the entire justification for the Scenarios view existing.
console.log('\n— v5.3 crimes merge —');
ok('histCrimesHtml replaces the two split builders', /function histCrimesHtml\(rows, allRuns\)/.test(src));
ok('histScenariosHtml is gone', !/function histScenariosHtml/.test(src));
ok('histRunsHtml is gone', !/function histRunsHtml/.test(src));
ok('no orphan call to either removed builder',
   !/histScenariosHtml\(/.test(src) && !/histRunsHtml\(/.test(src));
ok('the view list is two entries, roster + crimes',
   /HIST_VIEWS = \[\['roster', '👥 Roster'\], \['crimes', '🗂 Crimes'\]\]/.test(src));
ok('runs are grouped by a key stamped at build time, not re-derived',
   /run\.scenKey = sk;/.test(src) && /runsBy\[r\.scenKey\]/.test(src));
ok('the weak seat shows on the master row (the point of the old Scenarios view)',
   /const weak = s\.roleRows\.find\(r => r\.n >= 3 && r\.failRate > 0\.15\)/.test(src));
ok('crew names in a run drill through to the profile',
   /class="ocm-crewchip" data-ocm-profile=/.test(src));
ok('runs are capped per scenario, with the overflow stated not hidden',
   /const RUN_CAP = 25;/.test(src) && /Money ▸ Exports has the full set/.test(src));

// The migration must be real code, not a comment. Exercise histState directly.
{
  let histState;
  const store = {};
  global.GM_getValue = (k, d) => (k in store ? store[k] : d);
  global.GM_setValue = (k, v) => { store[k] = v; };
  global.GMK = { HIST_FILTERS: 'f', HIST_VIEW: 'v', HIST_WINDOW: 'w' };
  eval(grab(/function histState\(\) \{[\s\S]*?\n  \}/, 'histState').replace('function histState', 'histState=function'));

  store.v = 'scenarios';
  eq("saved 'scenarios' migrates to 'crimes'", histState().view, 'crimes');
  eq('…and the migration is PERSISTED, not recomputed every render', store.v, 'crimes');

  store.v = 'runs';
  eq("saved 'runs' migrates to 'crimes'", histState().view, 'crimes');

  store.v = 'roster';
  eq("'roster' is untouched", histState().view, 'roster');

  store.v = 'somethingelse';
  eq('an unknown saved view falls back to roster rather than rendering blank',
     histState().view, 'roster');

  delete store.v;
  eq('no saved view defaults to roster', histState().view, 'roster');
}

// ── 10. Roster faces.
console.log('\n— v5.3 roster avatars —');
ok('roster rows carry the cached avatar URL', /avatar: avatarUrl\(m\.uid\)/.test(src));
ok('roster renders an avatar tile per row', /ocmAvatarHtml\(r\.uid, r\.name, r\.avatar, 'xs'\)/.test(src));
ok('the dense tile is small enough to be cheap', /\.ocm-avatar\.xs \{ width: 28px; height: 28px/.test(src));
ok('rank column is unsortable (sorting by a sort artefact is meaningless)',
   /null,\s+\/\/ rank/.test(src));
ok('empty-state colspan matches the new column count', /colspan="10"/.test(src));
// The rank cell became :first-child, which an existing rule styles bright+bold.
// These must win on SPECIFICITY, not source order — v3.35/v5.2 both shipped a rule
// that lost a tie by luck of ordering.
ok('rank styling outranks the generic first-child rule by specificity',
   /\.ocm-datatable tbody td\.ocm-rank \{/.test(src));
ok('name emphasis moved to the second cell', /\.ocm-roster tbody td:nth-child\(2\)/.test(src));

console.log(fails ? `\n${fails} FAILED` : '\nall profile/performance checks passed');
process.exit(fails ? 1 : 0);
