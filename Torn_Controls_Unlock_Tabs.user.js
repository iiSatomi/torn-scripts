// ==UserScript==
// @name         Torn Faction Controls — Unlock Tabs (view-only)
// @namespace    torn-controls-unlock
// @version      1.0.0
// @description  Un-greys the permission-locked tabs on the faction Control page so they can be clicked. IMPORTANT: this only removes the CLIENT-SIDE block. Each tab's content is fetched from Torn's server with a permission check, so locked tabs will still load EMPTY / access-denied — enabling them cannot bypass a server-side permission. This just lets you click through and see what (if anything) renders.
// @author       iSatomi (3580191)
// @match        https://www.torn.com/factions.php*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // The Control tabs are a jQuery UI tabs widget. Removing the disabled CLASS
  // from a <li> isn't enough on its own — jQuery UI re-checks its own internal
  // `disabled` option when you click, so we also flip that option off. jQuery is
  // guaranteed present (it's what renders the widget); reach it in page context.
  const jqOf = () =>
    (typeof unsafeWindow !== 'undefined' && unsafeWindow.jQuery) || window.jQuery || window.$ || null;

  // Strip the client-side disabled markers off the tab <li>s. Idempotent —
  // returns how many it changed, so we only re-run the jQuery UI refresh when
  // Torn's re-render has actually re-locked something.
  function stripDisabled() {
    const locked = document.querySelectorAll(
      'li[role="tab"].ui-state-disabled, li[role="tab"][aria-disabled="true"], li[role="tab"][data-disable="1"]'
    );
    locked.forEach(li => {
      li.classList.remove('ui-state-disabled');
      li.removeAttribute('aria-disabled');
      li.setAttribute('data-disable', '0');
      const a = li.querySelector('a.ui-tabs-anchor');
      if (a) a.setAttribute('tabindex', '0');
    });
    return locked.length;
  }

  // Tell the jQuery UI widget itself that nothing is disabled, then refresh so
  // clicks actually activate the tab (and fire Torn's own content loader).
  function enableWidget() {
    const jq = jqOf();
    if (!jq) return false;
    let ok = false;
    jq('.ui-tabs').each(function () {
      try { jq(this).tabs('option', 'disabled', false).tabs('refresh'); ok = true; } catch (_) {}
    });
    return ok;
  }

  let announced = false;
  setInterval(() => {
    if (!location.href.includes('tab=controls')) { announced = false; return; }
    const n = stripDisabled();
    if (n) {
      const widget = enableWidget();
      if (!announced) {
        announced = true;
        console.log(`[Controls Unlock] Un-greyed ${n} locked tab(s)` +
          (widget ? '' : ' (jQuery UI not reachable — class-only, clicks may not activate)') +
          '. Reminder: content is server-gated, so locked tabs will usually load empty / access-denied.');
      }
    }
  }, 1000);
})();
