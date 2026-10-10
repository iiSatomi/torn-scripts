const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { URL, console, __PP_HELPER_TEST_MODE__: true };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js', 'utf8'), context);
const api = context.__PP_HELPER_TEST_API__;
test('missing readings never become a zero or a fabricated level loss', () => {
    const event = api.withObservedSkillDelta({ skill: 72 }, null);
    assert.equal(event.skillAfter, null);
    assert.equal(event.skillDelta, null);
    assert.equal(api.formatAttemptResult(event).levelDropped, false);
    assert.match(api.formatAttemptResult(event).detail, /unavailable/);
});
test('crime outcomes take precedence over transport flags and substring prose', () => {
    assert.equal(api.classifyAttemptOutcome({ success: true, result: { outcome: 'critical failure' } }), 'critical');
    assert.equal(api.classifyAttemptOutcome({ message: 'Your attempt was unsuccessful' }), 'fail');
    assert.equal(api.classifyAttemptOutcome({ message: 'successfully loading targets' }), 'unknown');
});
test('missing status preserves the shared-face queue position', () => {
    const map = api.statusMapFromCrimesList({ DB: { crimesByType: [
        { iconClass: 7, crimeInfo: {} },
        { iconClass: 7, crimeInfo: { status: { icon: 'phone' } } },
    ] } });
    assert.equal(api.consumeStatus(map, '7'), null);
    assert.equal(api.consumeStatus(map, '7').statusIcon, 'phone');
});
test('CSV neutralizes spreadsheet formulas in text but preserves numeric losses', () => {
    const csv = api.csvFromAttempts([{ at: 1000, mark: '=1+1', status: '@evil', skillDelta: -0.5 }]);
    assert.match(csv, /'=1\+1/);
    assert.match(csv, /'@evil/);
    assert.match(csv, /,-0.5,/);
});
test('dashboard reports observation coverage, UTC days, and ignores future entries', () => {
    const now = Date.UTC(2026, 8, 7, 12);
    const stats = api.buildDashboardStats([
        { at: now, mark: 'Student', status: 'Phone', outcome: 'success', skillDelta: null },
        { at: now - 1000, mark: 'Student', status: 'Phone', outcome: 'fail', skillDelta: -0.02 },
        { at: now + 1000, mark: 'Student', outcome: 'success' },
    ], now);
    assert.equal(stats.periods.today.attempts, 2);
    assert.equal(stats.periods.today.observedSkill, 1);
    assert.equal(stats.periods.month.attempts, 2);
    assert.equal(stats.trend.at(-1).lost, 0.02);
    assert.equal(stats.recommendation, null);
});
test('new settings allow no highlights and bounded target search', () => {
    const settings = api.normalizeSettings({ bestCount: 0, search: 'Student', adviceGoal: 'value' });
    assert.equal(settings.bestCount, 0);
    assert.equal(settings.search, 'Student');
    assert.equal(settings.adviceGoal, 'value');
});
test('explicit backup restores survive a prior clear marker, but a later clear removes them', () => {
    const event = { at: 1000, mark: 'Student', outcome: 'success', restoredAt: 3000 };
    assert.equal(api.normalizeAttemptLog({ clearedAt:2000, events:[event] }).events.length, 1);
    assert.equal(api.normalizeAttemptLog({ clearedAt:4000, events:[event] }).events.length, 0);
});
