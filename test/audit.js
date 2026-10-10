const { execSync } = require('child_process');
const REPO = 'C:/Users/asato/Desktop/Game Stuff/Torn Scripts';
const FILE = 'Torn Gym Planner-3.36.txt';
const get = ref => execSync(`git -C "${REPO}" show ${ref}:"${FILE}"`, { maxBuffer: 1 << 28 }).toString();

const OLD = get('master');
const NEW = get('ui-rebuild');

const fns   = s => new Set([...s.matchAll(/^\s{4}(?:async )?function\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]));
// A function is "live" if it is called somewhere other than its own definition
const calls = (s, name) => (s.match(new RegExp('(?<!function\\s)\\b' + name + '\\s*\\(', 'g')) || []).length;
const handlers = s => [...s.matchAll(/q\("#(gg-[\w-]+)"\)\??\.?a?d?dEventListener|el\.(\w+)\??\.addEventListener/g)]
                        .map(m => m[1] || m[2]);

const oldF = fns(OLD), newF = fns(NEW);

console.log('=== FUNCTIONS ===');
const gone = [...oldF].filter(f => !newF.has(f));
const added = [...newF].filter(f => !oldF.has(f));
console.log('removed :', gone.join(', ') || 'none');
console.log('added   :', added.join(', ') || 'none');

console.log('\n=== DEAD IN NEW BRANCH (defined, never called) ===');
const dead = [...newF].filter(f => calls(NEW, f) <= 1);
console.log(dead.length ? '  ' + dead.join('\n  ') : '  none');

console.log('\n=== HANDLERS BOUND ===');
const oh = new Set(handlers(OLD)), nh = new Set(handlers(NEW));
const lostH = [...oh].filter(h => !nh.has(h));
console.log('bound in old, NOT in new:');
console.log(lostH.length ? '  ' + lostH.join('\n  ') : '  none');

console.log('\n=== KEY CALCULATORS: are they reachable? ===');
for (const f of ['calculateSession','calculateDaily','calculateHappyJump','calculateXanaxGrind','calculateCompare',
                 'autofill','fetchPrices','runAssessment','renderLogger','updateInfobar','renderBuildPage',
                 'renderGymTracker','updateBuildBar','maybeRecalc','validateInputs','updateDotsDisplay']) {
  const n = calls(NEW, f), o = calls(OLD, f);
  console.log(`  ${f.padEnd(22)} old:${String(o).padStart(2)}  new:${String(n).padStart(2)}  ${n <= 1 ? '<-- NEVER CALLED' : ''}`);
}

console.log('\n=== RECALC WIRING ===');
for (const pat of ['RECALC_INPUTS', 'maybeRecalc()', 'addEventListener("input"', 'addEventListener("change"']) {
  console.log(`  ${pat.padEnd(28)} old:${(OLD.split(pat).length-1)}  new:${(NEW.split(pat).length-1)}`);
}
