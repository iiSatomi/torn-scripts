const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SCRIPT = path.resolve(__dirname, '..', 'Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js');

function loadHelper(overrides = {}) {
    const context = {
        console,
        URL,
        __PP_HELPER_TEST_MODE__: true,
        location: { href: 'https://www.torn.com/loader.php?sid=crimes#/pickpocketing' },
        ...overrides,
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(SCRIPT, 'utf8'), context, { filename: SCRIPT });
    return { api: context.__PP_HELPER_TEST_API__, context };
}

test('ships version 2.1 and exposes a frozen source-backed test API', () => {
    const source = fs.readFileSync(SCRIPT, 'utf8');
    const { api } = loadHelper();
    assert.match(source, /^\/\/ @version\s+2\.1$/m);
    assert.equal(Object.isFrozen(api), true);
    assert.deepEqual(Object.keys(api).sort(), [
        'DEFAULT_SETTINGS',
        'buildDashboardStats',
        'buildInsights',
        'buildPeriodSummaries',
        'classifyAttemptOutcome',
        'consumeStatus',
        'csvFromAttempts',
        'extractAttemptValue',
        'findCompactionParent',
        'findSharedListParent',
        'findTargetCard',
        'formatAttemptResult',
        'installFetchHook',
        'installXhrHook',
        'isPickpocketAttemptRequest',
        'normalizeAttemptLog',
        'normalizeSettings',
        'onActivityChange',
        'resolveAttemptStatus',
        'resolveMark',
        'setCardFiltered',
        'shouldSyncListCompaction',
        'statusMapFromCrimesList',
        'summaryText',
        'verdict',
        'withObservedSkillDelta',
    ]);
});

test('resolves attempt status without depending on helper badges', () => {
    const { api } = loadHelper();
    assert.equal(api.resolveAttemptStatus('', { statusTitle: 'Stumbling', statusIcon: 'stumbling' }), 'Stumbling');
    assert.equal(api.resolveAttemptStatus('On phone', { statusTitle: 'Walking' }), 'On phone');
    assert.equal(api.resolveAttemptStatus('', null), 'unknown');
});

test('builds period-aware dashboard totals and keeps recommendations evidence-limited', () => {
    const { api } = loadHelper();
    const now = new Date(2026, 8, 1, 12, 0, 0).getTime();
    const hour = 60 * 60 * 1000;
    const sparse = JSON.parse(JSON.stringify(api.buildDashboardStats([
        { at: now - hour, mark: 'Drunk man', outcome: 'success', skillDelta: 0.02, value: 1200 },
        { at: now - hour, mark: 'Jogger', outcome: 'fail', skillDelta: 0, value: null },
    ], now)));
    assert.equal(sparse.periods.week.attempts, 2);
    assert.equal(sparse.periods.week.totalValue, 1200);
    assert.equal(sparse.recommendation, null);

    const dashboard = JSON.parse(JSON.stringify(api.buildDashboardStats([
        { at: now - hour, mark: 'Drunk man', outcome: 'success', skillDelta: 0.02, value: 1200 },
        { at: now - hour, mark: 'Drunk man', outcome: 'success', skillDelta: 0.01, value: 1800 },
        { at: now - hour, mark: 'Drunk man', outcome: 'success', skillDelta: 0.03, value: 3000 },
        { at: now - hour, mark: 'Jogger', outcome: 'success', skillDelta: 0.01, value: 5000 },
        { at: now - hour, mark: 'Jogger', outcome: 'fail', skillDelta: 0, value: null },
        { at: now - hour, mark: 'Jogger', outcome: 'critical', skillDelta: -0.2, value: null },
        { at: now - 8 * 24 * hour, mark: 'Mobster', outcome: 'success', skillDelta: 0.1, value: 50000 },
    ], now)));
    assert.deepEqual(dashboard.periods.week, {
        attempts: 6, success: 4, fail: 1, critical: 1, unknown: 0,
        gained: 0.07, lost: 0.2, net: -0.13, totalValue: 11000, valuedAttempts: 4, observedSkill: 6, successRate: 66.7,
    });
    assert.equal(dashboard.recommendation, null, 'three successes are not enough for a recommendation');
    assert.equal(dashboard.targets[0].mark, 'Drunk man');
    assert.equal(dashboard.targets[0].successRate, 100);
    assert.equal(dashboard.targets[0].averageValue, 2000);
    assert.equal(dashboard.targets[1].critical, 1);
});

test('decodes only pickpocket attempt requests and classifies outcome payloads conservatively', () => {
    const { api } = loadHelper();
    assert.equal(api.isPickpocketAttemptRequest('https://www.torn.com/page.php?sid=crimesData&step=attemptCrime'), true);
    assert.equal(api.isPickpocketAttemptRequest('https://www.torn.com/page.php?sid=crimesData&step=attempt'), true);
    assert.equal(api.isPickpocketAttemptRequest('https://www.torn.com/page.php?sid=crimesData&step=commitCrime'), true);
    assert.equal(api.isPickpocketAttemptRequest('https://www.torn.com/page.php?sid=crimesData&step=crimesList'), false);
    assert.equal(api.isPickpocketAttemptRequest('/page.php?sid=messages'), false);
    assert.equal(api.classifyAttemptOutcome({ result: { outcome: 'Success' } }), 'success');
    assert.equal(api.classifyAttemptOutcome({ data: { message: 'Critical failure' } }), 'critical');
    assert.equal(api.classifyAttemptOutcome({ response: { result: 'Failed' } }), 'fail');
    assert.equal(api.classifyAttemptOutcome({ crimeResult: { success: true } }), 'success');
    assert.equal(api.extractAttemptValue('SUCCESS Total value: $36,699'), 36699);
    assert.equal(api.extractAttemptValue('SUCCESS without a visible value'), null);
    assert.equal(api.extractAttemptValue(''), null);
    assert.equal(api.classifyAttemptOutcome({ DB: { crimesByType: [] } }), 'unknown');
});

test('builds conservative observed-progress rankings and labels small samples', () => {
    const { api } = loadHelper();
    const insights = JSON.parse(JSON.stringify(api.buildInsights([
        { mark: 'Drunk man', outcome: 'success' },
        { mark: 'Drunk man', outcome: 'success' },
        { mark: 'Drunk man', outcome: 'success' },
        { mark: 'Drunk man', outcome: 'success' },
        { mark: 'Drunk man', outcome: 'success' },
        { mark: 'Cyclist', outcome: 'success' },
        { mark: 'Cyclist', outcome: 'success' },
        { mark: 'Cyclist', outcome: 'success' },
        { mark: 'Cyclist', outcome: 'success' },
        { mark: 'Cyclist', outcome: 'critical' },
        { mark: 'Unknown mark', outcome: 'unknown' },
    ])));
    assert.equal(insights.totalAttempts, 11);
    assert.equal(insights.ranked[0].mark, 'Drunk man');
    assert.equal(insights.ranked[0].progressEstimate, 0.57);
    assert.equal(insights.ranked[0].confidence, 'low');
    assert.equal(insights.ranked[1].mark, 'Cyclist');
    assert.equal(insights.ranked[1].progressEstimate, 0.38);
    assert.equal(insights.unknownOutcomes, 1);
});

test('summarizes daily, weekly, and all-time outcomes with visible skill gains and losses', () => {
    const { api } = loadHelper();
    const now = new Date(2026, 8, 1, 12, 0, 0).getTime();
    const hour = 60 * 60 * 1000;
    const periods = JSON.parse(JSON.stringify(api.buildPeriodSummaries([
        { at: now - hour, outcome: 'success', skillDelta: 0.02 },
        { at: now - 2 * hour, outcome: 'fail', skillDelta: 0 },
        { at: now - 3 * hour, outcome: 'critical', skillDelta: -0.2 },
        { at: now - 3 * 24 * hour, outcome: 'success', skillDelta: 0.03 },
        { at: now - 8 * 24 * hour, outcome: 'success', skillDelta: 0.01 },
    ], now)));
    assert.deepEqual(periods.today, { attempts: 3, success: 1, fail: 1, critical: 1, gained: 0.02, lost: 0.2, net: -0.18 });
    assert.deepEqual(periods.week, { attempts: 4, success: 2, fail: 1, critical: 1, gained: 0.05, lost: 0.2, net: -0.15 });
    assert.deepEqual(periods.all, { attempts: 5, success: 3, fail: 1, critical: 1, gained: 0.06, lost: 0.2, net: -0.14 });
});

test('bounds stored attempt history and exports safe Excel-compatible CSV', () => {
    const { api } = loadHelper();
    const log = api.normalizeAttemptLog({ enabled: true, events: Array.from({ length: 802 }, (_, index) => ({
        mark: `Mark ${index}`,
        outcome: 'success',
        at: index,
    })) });
    assert.equal(log.enabled, true);
    assert.equal(log.events.length, 750);
    assert.equal(log.events[0].mark, 'Mark 52');
    const csv = api.csvFromAttempts([{
        at: 1700000000000,
        mark: 'A "quoted" target',
        status: 'on phone',
        outcome: 'success',
        tier: 2,
        skill: 42.1,
    }]);
    assert.match(csv, /^Timestamp,Target,Status,Outcome,Tier,Skill Before,Skill After,Visible Skill Change,Visible Total Value,Observed Torn Result\r\n/m);
    assert.match(csv, /"A ""quoted"" target"/);
    assert.doesNotMatch(csv, /api.?key/i);
});

test('keeps unavailable attempt measurements null instead of inventing zero values', () => {
    const { api } = loadHelper();
    const log = JSON.parse(JSON.stringify(api.normalizeAttemptLog({ enabled: true, events: [{
        at: 1700000000000,
        mark: 'Jogger',
        outcome: 'success',
        tier: null,
        skill: null,
        skillAfter: null,
        skillDelta: null,
        value: null,
    }] })));
    assert.deepEqual(log.events[0], {
        id: '1700000000000:Jogger:unknown',
        at: 1700000000000,
        mark: 'Jogger',
        status: 'unknown',
        outcome: 'success',
        tier: null,
        skill: null,
        skillAfter: null,
        skillDelta: null,
        value: null,
    });
});

test('records the visible skill change without claiming hidden experience', () => {
    const { api } = loadHelper();
    assert.deepEqual(
        JSON.parse(JSON.stringify(api.withObservedSkillDelta({ mark: 'Thug', skill: 44.12 }, 44.15))),
        { mark: 'Thug', skill: 44.12, skillAfter: 44.15, skillDelta: 0.03 },
    );
    assert.deepEqual(
        JSON.parse(JSON.stringify(api.withObservedSkillDelta({ mark: 'Thug', skill: null }, 44.15))),
        { mark: 'Thug', skill: null, skillAfter: 44.15, skillDelta: null },
    );
});

test('formats brief in-card attempt feedback including a real visible skill-level drop', () => {
    const { api } = loadHelper();
    assert.deepEqual(
        JSON.parse(JSON.stringify(api.formatAttemptResult({ mark: 'Drunk man', outcome: 'success', skill: 81.09, skillAfter: 81.12, skillDelta: 0.03 }))),
        { title: 'SUCCESS', detail: 'CS +0.03', levelDropped: false },
    );
    assert.deepEqual(
        JSON.parse(JSON.stringify(api.formatAttemptResult({ mark: 'Cyclist', outcome: 'critical', skill: 81.09, skillAfter: 80.95, skillDelta: -0.14 }))),
        { title: 'CRITICAL FAIL', detail: 'CS -0.14 · Skill level dropped', levelDropped: true },
    );
});

test('keeps a filtered virtual list compact while Torn briefly replaces its rows', () => {
    const { api } = loadHelper();
    assert.equal(api.shouldSyncListCompaction(0), false);
    assert.equal(api.shouldSyncListCompaction(1), true);
});

const MARKS = [
    ['Businessman', 3, 'moderately difficult'],
    ['Businesswoman', 3, 'moderately difficult'],
    ['Classy lady', 4, 'more difficult'],
    ['Cyclist', 5, 'more difficult'],
    ['Drunk man', 1, 'easier'],
    ['Drunk woman', 1, 'easier'],
    ['Elderly man', 1, 'easier'],
    ['Elderly woman', 1, 'easier'],
    ['Gang member', 4, 'more difficult'],
    ['Homeless person', 1, 'easier'],
    ['Jogger', 3, 'moderately difficult'],
    ['Junkie', 1, 'easier'],
    ['Laborer', 2, 'moderately difficult'],
    ['Mobster', 6, 'very difficult'],
    ['Police officer', 6, 'very difficult'],
    ['Postal worker', 2, 'moderately difficult'],
    ['Rich kid', 4, 'more difficult'],
    ['Sex worker', 4, 'more difficult'],
    ['Student', 2, 'moderately difficult'],
    ['Thug', 3, 'moderately difficult'],
    ['Young man', 2, 'less difficult'],
    ['Young woman', 2, 'less difficult'],
];

test('resolves the complete current 22-mark policy', () => {
    const { api } = loadHelper();
    const resolved = MARKS.map(([name, tier, difficulty]) => {
        const result = api.resolveMark(`${name} [old decoration]`);
        assert.equal(result.name, name);
        assert.equal(result.tier, tier, `${name} tier`);
        assert.equal(result.difficulty, difficulty, `${name} official difficulty`);
        return result.name;
    });
    assert.equal(new Set(resolved).size, 22);
    assert.equal(api.resolveMark('Unknown mark'), null);
});

test('uses conservative missing, unknown, and high-risk boundaries', () => {
    const { api } = loadHelper();
    assert.equal(api.verdict('Drunk man', null, 100, null), 'WAIT');
    assert.equal(api.verdict('Jogger', 'walking', 64, null), 'WAIT');
    assert.equal(api.verdict('Jogger', 'walking', 65, null), 'GO');
    assert.equal(api.verdict('Jogger', 'jogging', 100, null), 'WAIT');
    assert.equal(api.verdict('Cyclist', 'cycling', 79, null), 'AVOID');
    assert.equal(api.verdict('Cyclist', 'cycling', 80, null), 'GO');
    assert.equal(api.verdict('Mobster', 'walking', 99, null), 'AVOID');
    assert.equal(api.verdict('Mobster', 'walking', 100, null), 'CAUTION');
    assert.equal(api.verdict('Police officer', 'running', 99, null), 'AVOID');
    assert.equal(api.verdict('Police officer', 'running', 100, null), 'CAUTION');
    assert.equal(api.verdict('Drunk man', 'future-status', 100, null), 'WAIT');
    assert.equal(api.verdict('Cyclist', 'future-status', 100, null), 'WAIT');
    assert.equal(api.verdict('Drunk man', { icon: 'stumbling' }, 100, null), 'WAIT');
    assert.equal(api.verdict('Unknown mark', 'distracted', 100, null), 'WAIT');
});

test('keeps special opportunity thresholds mark-specific', () => {
    const { api } = loadHelper();
    assert.equal(api.verdict('Sex worker', 'soliciting', 44, null), 'WAIT');
    assert.equal(api.verdict('Sex worker', 'soliciting', 45, null), 'GO');
    assert.equal(api.verdict('Thug', 'loitering', 44, null), 'WAIT');
    assert.equal(api.verdict('Thug', 'loitering', 45, null), 'GO');
    assert.equal(api.verdict('Thug', 'distracted', 100, null), 'WAIT');
    assert.equal(api.verdict('Thug', 'running', 100, null), 'WAIT');
    assert.equal(api.verdict('Rich kid', 'music', 39, null), 'WAIT');
    assert.equal(api.verdict('Rich kid', 'music', 40, null), 'GO');
    assert.equal(api.verdict('Gang member', 'loitering', 64, null), 'WAIT');
    assert.equal(api.verdict('Gang member', 'loitering', 65, null), 'GO');
});

test('consumes duplicate icon status records in response order', () => {
    const { api } = loadHelper();
    const pool = {
        101: [
            { statusIcon: 'walking', statusTitle: 'Walking' },
            { statusIcon: 'phone', statusTitle: 'On the phone' },
        ],
    };
    assert.equal(api.consumeStatus(pool, 101).statusIcon, 'walking');
    assert.equal(api.consumeStatus(pool, '101').statusIcon, 'phone');
    assert.equal(api.consumeStatus(pool, 101), null);
    assert.equal(api.consumeStatus(pool, 999), null);
});

test('valid empty crimes responses clear status data instead of preserving stale advice', () => {
    const { api } = loadHelper();
    assert.deepEqual(
        JSON.parse(JSON.stringify(api.statusMapFromCrimesList({ DB: { crimesByType: [] } }))),
        {},
    );
    assert.equal(api.statusMapFromCrimesList({ DB: { crimesByType: null } }), null);
    assert.deepEqual(
        JSON.parse(JSON.stringify(api.statusMapFromCrimesList({
            DB: { crimesByType: [{ iconClass: 101, crimeInfo: {} }] },
        }))),
        { '101': [null] },
    );
});

test('normalizes legacy settings and clamps unsafe values', () => {
    const { api } = loadHelper();
    const normalized = JSON.parse(JSON.stringify(api.normalizeSettings({
        readyOnly: true,
        bestCount: 20,
        minTier: 0,
    })));
    assert.deepEqual(normalized, { readyOnly: true, bestCount: 10, minTier: 1, insightsEnabled: true, useHelperUi: true, search: '', adviceGoal: 'safety' });
    assert.deepEqual(
        JSON.parse(JSON.stringify(api.normalizeSettings({
            readyOnly: 'yes',
            bestCount: '3.9',
            minTier: '5',
        }))),
        { readyOnly: false, bestCount: 3, minTier: 5, insightsEnabled: true, useHelperUi: true, search: '', adviceGoal: 'safety' },
    );
    assert.deepEqual(
        JSON.parse(JSON.stringify(api.normalizeSettings(null))),
        { readyOnly: false, bestCount: 1, minTier: 1, insightsEnabled: true, useHelperUi: true, search: '', adviceGoal: 'safety' },
    );
    assert.equal(api.normalizeSettings({ insightsEnabled: false }).insightsEnabled, false);
    assert.equal(api.normalizeSettings({ useHelperUi: false }).useHelperUi, false);
});

test('summarizes the active settings in compact readable text', () => {
    const { api } = loadHelper();
    assert.equal(
        api.summaryText({ readyOnly: true, bestCount: 2, minTier: 3 }),
        'Ready only · Tier 3+ · Top 2',
    );
    assert.equal(
        api.summaryText({ readyOnly: false, bestCount: 1, minTier: 1 }),
        'All statuses · All tiers · Top 1',
    );
    assert.equal(api.summaryText({ useHelperUi: false }), 'Torn UI mode');
});

test('ships one semantic inline disclosure with touch-friendly controls', () => {
    const source = fs.readFileSync(SCRIPT, 'utf8');
    assert.match(source, /helper\.id = "pp-helper"|id="pp-helper"/);
    assert.match(source, /id="pp-helper-toggle"/);
    assert.match(source, /aria-expanded="false"/);
    assert.match(source, /aria-controls="pp-helper-controls"/);
    assert.match(source, /id="pp-helper-controls"/);
    assert.equal((source.match(/data-tier="[1-6]"/g) || []).length, 6);
    assert.match(source, /id="pp-count-dec"/);
    assert.match(source, /id="pp-count-inc"/);
    assert.match(source, /id="pp-reset"/);
    assert.match(source, /data-ui-mode="helper"/);
    assert.match(source, /data-ui-mode="torn"/);
    assert.match(source, /id="pp-attempt-feedback"/);
    assert.doesNotMatch(source, /\.pp-attempt-result\s*\{[^}]*position:\s*absolute/s);
    assert.doesNotMatch(source, /id="ppColorsPanel"/);
});

test('finds the repeated target card instead of an arbitrary ancestor depth', () => {
    const { api } = loadHelper();
    const list = { children: [] };
    const makeCard = () => {
        const card = {
            parentElement: list,
            children: [],
            querySelector(selector) {
                if (selector.includes('/crimes/faces/')) return this.face;
                if (selector.includes('titleAndProps___')) return this.titleWrap;
                return null;
            },
        };
        const titleWrap = {
            parentElement: card,
            querySelector: () => null,
        };
        const title = {
            parentElement: titleWrap,
            querySelector: () => null,
        };
        card.face = {};
        card.titleWrap = titleWrap;
        return { card, title };
    };
    const first = makeCard();
    const second = makeCard();
    list.children.push(first.card, second.card);
    assert.equal(api.findTargetCard(first.title), first.card);
});

test('finds the stable virtual item when only one target remains', () => {
    const { api } = loadHelper();
    const list = { children: [] };
    const virtualItem = {
        parentElement: list,
        children: [],
        classList: { contains: value => value === 'virtual-item' },
        querySelector(selector) {
            if (selector.includes('/crimes/faces/')) return this.face;
            if (selector.includes('titleAndProps___')) return this.titleWrap;
            return null;
        },
    };
    const sections = {
        parentElement: virtualItem,
        children: [],
        classList: { contains: () => false },
        querySelector: selector => selector.includes('/crimes/faces/') ? virtualItem.face
            : selector.includes('titleAndProps___') ? virtualItem.titleWrap : null,
    };
    const titleWrap = { parentElement: sections, querySelector: () => null };
    const title = { parentElement: titleWrap, querySelector: () => null };
    virtualItem.face = {};
    virtualItem.titleWrap = titleWrap;
    virtualItem.children.push(sections);
    list.children.push(virtualItem);

    assert.equal(api.findTargetCard(title), virtualItem);
});

test('compacts only target cards that share one direct list parent', () => {
    const { api } = loadHelper();
    const shared = { children: [] };
    const first = { parentElement: shared };
    const second = { parentElement: shared };
    shared.children.push(first, second);
    assert.equal(api.findSharedListParent([first, second]), shared);

    const other = { children: [] };
    const third = { parentElement: other };
    other.children.push(third);
    assert.equal(api.findSharedListParent([first, third]), null);
    assert.equal(api.findSharedListParent([]), null);
});

test('filtering changes only the script class and preserves Torn inline layout', () => {
    const classes = new Set();
    const card = {
        style: { display: 'grid' },
        classList: {
            add: value => classes.add(value),
            remove: value => classes.delete(value),
        },
    };
    const { api } = loadHelper();
    api.setCardFiltered(card, true);
    assert.equal(classes.has('pp-helper-filtered'), true);
    assert.equal(card.style.display, 'grid');
    api.setCardFiltered(card, false);
    assert.equal(classes.has('pp-helper-filtered'), false);
    assert.equal(card.style.display, 'grid');
});

test('keeps Torn target names intact and renders script-owned metadata', () => {
    const source = fs.readFileSync(SCRIPT, 'utf8');
    assert.doesNotMatch(source, /nameDiv\.textContent\s*=/);
    assert.match(source, /pp-helper-meta/);
    assert.match(source, /\.pp-helper-filtered\s*\{\s*display:\s*none\s*!important/);
    assert.doesNotMatch(source, /\.pp-helper-tier-badge\s*\{\s*display:\s*none/);
});

test('finds the lowest shared virtual-list parent when Torn nests target rows', () => {
    const { api } = loadHelper();
    const root = { children: [], parentElement: null };
    const slotA = { children: [], parentElement: root };
    const slotB = { children: [], parentElement: root };
    const first = { children: [], parentElement: slotA };
    const second = { children: [], parentElement: slotB };
    root.children.push(slotA, slotB);
    slotA.children.push(first);
    slotB.children.push(second);
    const contains = (node, child) => node === child || (node.children || []).some(next => contains(next, child));
    [root, slotA, slotB, first, second].forEach(node => { node.contains = child => contains(node, child); });
    assert.equal(api.findCompactionParent([first, second]), root);
});

test('installs one transparent fetch observer and ignores unrelated traffic', async () => {
    const { api } = loadHelper();
    const calls = [];
    let cloneCalls = 0;
    let ingested = 0;
    const response = {
        clone() {
            cloneCalls++;
            return { json: async () => ({ DB: { crimesByType: [] } }) };
        },
    };
    const original = function(...args) {
        calls.push({ receiver: this, args });
        return Promise.resolve(response);
    };
    const target = { fetch: original };
    const wrapped = api.installFetchHook(target, () => { ingested++; });
    assert.equal(api.installFetchHook(target, () => { ingested++; }), wrapped);

    const receiver = { name: 'receiver' };
    const init = { method: 'POST' };
    assert.equal(await wrapped.call(receiver, '/unrelated', init), response);
    assert.equal(calls[0].receiver, receiver);
    assert.deepEqual(calls[0].args, ['/unrelated', init]);
    assert.equal(cloneCalls, 0);

    await wrapped.call(receiver, 'https://www.torn.com/page.php?sid=crimesData&step=crimesList');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(cloneCalls, 1);
    assert.equal(ingested, 1);
});

test('observes a pickpocket attempt submitted through Torn\'s XHR path', () => {
    const { api } = loadHelper();
    const listeners = {};
    function FakeXhr() { this.responseText = '{"result":{"outcome":"Success"}}'; }
    FakeXhr.prototype.open = function(method, url) { this.url = url; };
    FakeXhr.prototype.send = function() { (listeners.loadend || []).forEach(listener => listener.call(this)); };
    FakeXhr.prototype.addEventListener = function(type, listener) { (listeners[type] ||= []).push(listener); };
    const target = { XMLHttpRequest: FakeXhr };
    const outcomes = [];
    api.installXhrHook(target, payload => outcomes.push(api.classifyAttemptOutcome(payload)));
    const request = new FakeXhr();
    request.open('POST', 'https://www.torn.com/page.php?sid=crimesData&step=attempt');
    request.send();
    assert.deepEqual(outcomes, ['success']);
});

test('pauses once and coalesces repeated activity resumes', () => {
    const { api } = loadHelper();
    const calls = [];
    const state = { active: true, repaintQueued: false };
    api.onActivityChange(state, false, action => calls.push(action));
    api.onActivityChange(state, false, action => calls.push(action));
    api.onActivityChange(state, true, action => calls.push(action));
    api.onActivityChange(state, true, action => calls.push(action));
    assert.deepEqual(calls, ['pause', 'resume-and-repaint']);
});

test('uses owned cancellable lifecycle work instead of a permanent interval', () => {
    const source = fs.readFileSync(SCRIPT, 'utf8');
    assert.doesNotMatch(source, /setInterval\s*\(/);
    assert.doesNotMatch(source, /function scheduleFallback\s*\(/);
    assert.match(source, /tornpda:tabState/);
    assert.match(source, /visibilitychange/);
    assert.match(source, /hashchange/);
    assert.match(source, /Symbol\.for\("pp-helper\.fetch-hook"\)/);
    assert.match(source, /Reflect\.apply\(originalFetch, this, args\)/);
});
