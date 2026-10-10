const CAPTCHA_RE = /captcha|challenge|cloudflare|verify\s+(?:you are human|your identity)|checking your browser/i;
const LOGIN_RE = /\b(?:log|sign)\s*in\b|create\s+an?\s+account|username\s+and\s+password/i;
const TRAVEL_RE = /this area is unavailable while you(?:'re| are) traveling|traveling from\s+.+\s+to\s+.+/i;

function classifyTornSession(snapshot = {}) {
  const url = String(snapshot.url || '');
  const text = String(snapshot.text || '');
  if (snapshot.hasCaptcha || CAPTCHA_RE.test(text) || /__cf_chl|challenge-platform|cdn-cgi\/challenge/i.test(url)) {
    return { state: 'captcha', reason: 'A CAPTCHA or browser challenge is visible.' };
  }
  if (snapshot.hasLoginForm || (!snapshot.hasLogoutControl && LOGIN_RE.test(text))) {
    return { state: 'logged-out', reason: 'The Torn login screen is visible.' };
  }
  if (snapshot.isTraveling || TRAVEL_RE.test(text)) {
    return { state: 'traveling', reason: 'Torn is unavailable for training while the account is traveling.' };
  }
  if (snapshot.hasLogoutControl || snapshot.hasAuthenticatedShell) {
    return { state: 'ready', reason: 'An authenticated Torn shell is visible.' };
  }
  return { state: 'unknown', reason: 'The Torn session could not be verified.' };
}

async function readTornSessionState(page) {
  const snapshot = await page.evaluate(() => ({
    url: location.href,
    text: (document.body?.innerText || '').slice(0, 12000),
    hasCaptcha: Boolean(document.querySelector(
      'iframe[src*="captcha"], iframe[src*="challenge"], [id*="captcha"], [class*="captcha"], [class*="challenge"]'
    )),
    hasLoginForm: Boolean(document.querySelector(
      'form[action*="login"], input[type="password"], #login, [class*="login"]'
    )),
    isTraveling: /this area is unavailable while you(?:'re| are) traveling|traveling from\s+.+\s+to\s+.+/i
      .test(document.body?.innerText || ''),
    hasLogoutControl: Boolean(document.querySelector(
      'a[href*="logout"], button[aria-label*="logout" i], [data-action="logout"]'
    )),
    hasAuthenticatedShell: Boolean(document.querySelector(
      '#sidebar, #user-info, [class*="sidebar"], [class*="user-menu"]'
    )),
  }));
  return { ...snapshot, ...classifyTornSession(snapshot) };
}

async function requireTornSession(page) {
  const state = await readTornSessionState(page);
  if (state.state !== 'ready') {
    const next = state.state === 'captcha'
      ? 'Complete the CAPTCHA/challenge in the open Torn browser, then rerun the test.'
      : state.state === 'logged-out'
        ? 'Log into Torn in the open browser, then rerun the test.'
        : state.state === 'traveling'
          ? 'Wait until the flight ends and rerun the test after Torn makes the gym available.'
        : 'Open a normal authenticated Torn page in the open browser, then rerun the test.';
    throw new Error(`Torn preflight blocked: ${state.reason} ${next} URL=${state.url}`);
  }
  return state;
}

module.exports = { classifyTornSession, readTornSessionState, requireTornSession };
