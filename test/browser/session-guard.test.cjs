const assert = require('node:assert/strict');
const vm = require('node:vm');
const { classifyTornSession, readTornSessionState } = require('./session-guard.cjs');

assert.equal(classifyTornSession({ hasLogoutControl: true }).state, 'ready');
assert.equal(classifyTornSession({ hasLoginForm: true }).state, 'logged-out');
assert.equal(classifyTornSession({ text: 'Verify you are human' }).state, 'captcha');
assert.equal(classifyTornSession({ url: 'https://www.torn.com/gym.php?__cf_chl_tk=challenge' }).state, 'captcha');
assert.equal(classifyTornSession({ hasLogoutControl: true, text: 'This area is unavailable while you are traveling.' }).state, 'traveling');
assert.equal(classifyTornSession({}).state, 'unknown');

(async () => {
  const page = {
    async evaluate(browserFunction) {
      const browserContext = {
        location: { href: 'https://www.torn.com/factions.php' },
        document: {
          body: { innerText: 'This area is unavailable while you are traveling.' },
          querySelector: () => null,
        },
      };
      return vm.runInNewContext(`(${browserFunction.toString()})()`, browserContext);
    },
  };

  const state = await readTornSessionState(page);
  assert.equal(state.state, 'traveling');
  console.log('Torn session guard checks passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
