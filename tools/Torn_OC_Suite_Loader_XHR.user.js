// ==UserScript==
// @name         Torn OC Suite (Rebuild)
// @namespace    torn_oc_suite_rebuild
// @version      3.37.0-ui62-loader2
// @description  Dev loader. Reads the on-disk working copy at every page load via GM_xmlHttpRequest, so saving the file is the deploy.
// @author       iSatomi (3580191)
// @match        https://www.torn.com/factions.php*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlHttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @connect      *
// @connect      tornprobability.com
// @connect      www.tornstats.com
// @connect      ffscouter.com
// @connect      api.torn.com
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==
//
// WHY NOT @require
// ----------------
// Two problems with the @require file:// approach this replaces:
//   1. Tampermonkey caches @require content with no way to disable it
//      (upstream issues #475 / #723, both still open). Edits would go stale and
//      need a manual purge from the Externals tab -- defeating the whole point.
//   2. Chrome intercepts .user.js URLs as userscript *installs*, which can break
//      loading the working copy as a require.
// GM_xmlHttpRequest goes through the extension's privileged request path, so it
// sidesteps both: no external cache, no .user.js interception, and no need to
// keep a second .js-named copy of the file in sync.
//
// STILL REQUIRED
// --------------
// "Allow access to file URLs" must be ON in the Tampermonkey extension details.
// That permission gates all local file reads regardless of which method is used.
//
// TRADE-OFF
// ---------
// This is async, so the suite starts a beat later than @require would. For a
// script that works on factions.php at document-end this should not matter, but
// it is a real behavioural difference, not a free lunch.
//
// RESTORE
// -------
// _backup_OC_Suite_browser_ui61.user.js in the repo root is the previous browser
// build (v3.37.0-ui61, 20,198 lines, syntax-checked). Paste it back to undo.

(function () {
  'use strict';

  const SRC = 'file:///C:/Users/asato/Desktop/Game%20Stuff/Torn%20Scripts/Torn_OC_Suite_PurrfectCrime.user.js';
  const xhr = (typeof GM_xmlHttpRequest === 'function') ? GM_xmlHttpRequest : (GM && GM.xmlHttpRequest);

  if (!xhr) {
    console.error('[OC Suite loader] no GM_xmlHttpRequest available - check @grant lines');
    return;
  }

  xhr({
    method: 'GET',
    url: SRC,
    onload(res) {
      if (!res.responseText || res.responseText.length < 1000) {
        console.error('[OC Suite loader] source looks empty or truncated (%d bytes) - wrong path?',
                      (res.responseText || '').length);
        return;
      }
      try {
        // Indirect eval -> runs in global scope, same as @require would.
        (0, eval)(res.responseText);
        console.debug('[OC Suite loader] loaded %d bytes from disk', res.responseText.length);
      } catch (e) {
        console.error('[OC Suite loader] source failed to execute:', e);
      }
    },
    onerror(e) {
      console.error('[OC Suite loader] could not read local file. Is "Allow access to '
                  + 'file URLs" enabled for Tampermonkey?', e);
    }
  });
})();
