// ==UserScript==
// @name         Torn OC Suite (Rebuild)
// @namespace    torn_oc_suite_rebuild
// @version      3.37.0-ui62-loader3
// @description  Dev loader. Reads the on-disk working copy at every page load, so saving the file is the deploy.
// @author       iSatomi (3580191)
// @match        https://www.torn.com/factions.php*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @grant        GM_registerMenuCommand
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @connect      localhost
// @connect      127.0.0.1
// @connect      file://*
// @connect      tornprobability.com
// @connect      www.tornstats.com
// @connect      ffscouter.com
// @connect      api.torn.com
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==
//
// WHAT THIS IS
// ------------
// The suite's 20k lines live in ONE place: the working copy on disk. This
// loader reads that file at each page load and executes it. Saving the file is
// the deploy. Browser storage holds this ~150-line pointer instead of a second
// 1.2 MB copy that silently drifts out of sync with the repo.
//
// Deliberately NOT using @require: Tampermonkey caches @require content with no
// way to disable it (upstream #475 / #723, both open), and Chrome intercepts
// .user.js URLs as userscript installs. GM_xmlHttpRequest sidesteps both.
//
// WHY http://127.0.0.1 AND NOT file://
// ------------------------------------
// Tampermonkey refuses file:// from GM_xmlHttpRequest even with BOTH the
// browser's "Allow access to file URLs" and Tampermonkey's own local-file
// setting enabled, and with @connect file://* declared. Verified the hard way;
// see upstream issue #754. http://127.0.0.1 has none of that machinery.
//
// REQUIRES the dev server to be running:
//     node dev-server.cjs
// It binds 127.0.0.1 only and serves the working copy no-store, so a save is
// live on the next page refresh. If it is not running the loader falls back to
// the last build that loaded cleanly and says so on the page.
//
// Note @connect localhost AND 127.0.0.1 are both listed explicitly: @connect *
// does not cover localhost or bare IPs (upstream issue #1421).
//
// RESTORE: _backup_OC_Suite_browser_ui61.user.js (v3.37.0-ui61, 20,198 lines,
// syntax-checked) is the previous browser build. Paste it back to undo.

(function () {
  'use strict';

  // Guard against double-init (SPA nav, iframe re-entry). The suite makes API
  // calls on start, so running it twice is not harmless.
  if (window.__ocSuiteLoaderRan) return;
  window.__ocSuiteLoaderRan = true;

  const K = {
    PATH: 'devloader.path',
    SRC:  'devloader.lastgood.src',
    VER:  'devloader.lastgood.version',
  };

  const DEFAULT_PATH = 'http://127.0.0.1:8787/oc-suite.js';

  const EXPECT_NS = 'torn_oc_suite_rebuild';
  const xhr = (typeof GM_xmlHttpRequest === 'function') ? GM_xmlHttpRequest
            : (typeof GM !== 'undefined' && GM.xmlHttpRequest);

  const path = () => GM_getValue(K.PATH, DEFAULT_PATH);

  /** Corner badge. Only ever shown on failure or when running stale code -- a
   *  silent console-only failure means staring at a blank page wondering
   *  whether the suite is broken or the loader is. */
  function badge(msg, tone) {
    const paint = () => {
      let el = document.getElementById('oc-loader-badge');
      if (!el) {
        el = document.createElement('div');
        el.id = 'oc-loader-badge';
        el.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:2147483647;'
          + 'max-width:420px;padding:8px 12px;border-radius:6px;cursor:pointer;'
          + 'font:600 11px/1.5 Arial,Helvetica,sans-serif;white-space:pre-wrap;'
          + 'box-shadow:0 2px 10px rgba(0,0,0,.5)';
        el.title = 'OC Suite dev loader - click to dismiss';
        el.addEventListener('click', () => el.remove());
        document.body.appendChild(el);
      }
      const warn = tone === 'warn';
      el.style.background = warn ? '#241f14' : '#2a1414';
      el.style.color      = warn ? '#e0a83a' : '#ff6b6b';
      el.style.border     = '1px solid ' + (warn ? '#3a3018' : '#5a2020');
      el.textContent = '[OC Suite loader] ' + msg;
    };
    if (document.body) paint();
    else document.addEventListener('DOMContentLoaded', paint, { once: true });
  }

  /** Reject a file that loaded fine but is not the script we meant to run -- a
   *  stale path pointing at some other userscript should fail loudly rather
   *  than execute something unexpected on the page. */
  function reject(src) {
    if (!src || src.length < 1000) {
      return 'source empty or truncated (' + ((src || '').length) + ' bytes) - check the path';
    }
    if (src.indexOf(EXPECT_NS) === -1) {
      return 'wrong file - @namespace ' + EXPECT_NS + ' not found in source';
    }
    return null;
  }

  const versionOf = (src) => (src.match(/^\/\/\s*@version\s+(\S+)/m) || [])[1] || 'unknown';

  /** Collect the GM API out of the userscript scope so it can be handed to the
   *  suite explicitly.
   *
   *  This is the crux of the loader. Tampermonkey exposes GM_* inside the
   *  *userscript* scope, not on the page's global object, so evaluating the
   *  suite in page scope (as indirect eval does) gives it no GM_getValue at all.
   *  Each lookup is guarded because referencing an ungranted name is a
   *  ReferenceError, not undefined. */
  function gmTable() {
    const t = {};
    const add = (name, get) => {
      try { const v = get(); if (typeof v !== 'undefined') t[name] = v; } catch (e) { /* not granted */ }
    };
    add('GM_getValue',            () => GM_getValue);
    add('GM_setValue',            () => GM_setValue);
    add('GM_addStyle',            () => GM_addStyle);
    add('GM_xmlHttpRequest',      () => GM_xmlHttpRequest);
    add('GM_xmlhttpRequest',      () => GM_xmlhttpRequest);
    add('GM_registerMenuCommand', () => GM_registerMenuCommand);
    add('GM_info',                () => GM_info);
    add('GM',                     () => GM);
    // The suite uses both spellings of the xhr helper (11x capital H, 6x lower).
    // Alias whichever one this Tampermonkey build did not define.
    if (!t.GM_xmlhttpRequest && t.GM_xmlHttpRequest) t.GM_xmlhttpRequest = t.GM_xmlHttpRequest;
    if (!t.GM_xmlHttpRequest && t.GM_xmlhttpRequest) t.GM_xmlHttpRequest = t.GM_xmlhttpRequest;
    return t;
  }

  function run(src, origin) {
    const ver = versionOf(src);
    try {
      const api = gmTable();
      const names = Object.keys(api);
      // new Function rather than eval: it binds the GM names as parameters, and
      // its body is non-strict by default, so the suite is not silently forced
      // into strict mode by this loader's own 'use strict'.
      //
      // sourceURL gives the suite a real identity in DevTools: a named file in
      // the Sources panel, true line numbers in stack traces, and working
      // breakpoints. Without it 20k lines report as <anonymous>.
      const fn = new Function(...names, src + '\n//# sourceURL=torn-oc-suite.dev.js\n');
      fn(...names.map((n) => api[n]));
      console.debug('[OC Suite loader] ran %s from %s (%d bytes, GM: %s)',
                    ver, origin, src.length, names.join(' '));
      return true;
    } catch (e) {
      console.error('[OC Suite loader] source failed to execute:', e);
      badge('source threw on execute:\n' + (e && e.message ? e.message : e)
          + '\n\nSee console for the stack (file: torn-oc-suite.dev.js).');
      return false;
    }
  }

  /** Fall back to the last build that loaded cleanly. Without this, any read
   *  failure means no panel at all; with it you get slightly stale code plus a
   *  warning, which is almost always the more useful outcome mid-session. */
  function fallback(why) {
    const cached = GM_getValue(K.SRC, '');
    if (!cached) {
      badge(why + '\n\nNo cached build to fall back on. The suite is NOT running.');
      return;
    }
    const ver = GM_getValue(K.VER, 'unknown');
    badge('Running CACHED build ' + ver + ' - disk read failed.\n\n' + why, 'warn');
    run(cached, 'cache');
  }

  if (!xhr) {
    badge('GM_xmlHttpRequest unavailable - check the @grant lines.');
    return;
  }

  xhr({
    method: 'GET',
    url: path(),
    onload(res) {
      const src = res.responseText || '';
      const bad = reject(src);
      if (bad) { fallback(bad); return; }

      if (run(src, 'disk')) {
        try {
          GM_setValue(K.SRC, src);
          GM_setValue(K.VER, versionOf(src));
        } catch (e) {
          // Not fatal: the suite is already running, we just lose the safety net.
          console.warn('[OC Suite loader] could not cache source:', e);
        }
      }
    },
    onerror() {
      fallback('Could not reach ' + path()
             + '\n\nIs the dev server running?   node dev-server.cjs');
    },
  });

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('OC loader: set source path', () => {
      const next = prompt('Full file:// URL of the working copy:', path());
      if (next && next.trim()) {
        GM_setValue(K.PATH, next.trim());
        location.reload();
      }
    });
    GM_registerMenuCommand('OC loader: status', () => {
      alert('Path:\n' + path()
        + '\n\nCached build: ' + GM_getValue(K.VER, 'none')
        + '\nCached bytes: ' + GM_getValue(K.SRC, '').length);
    });
    GM_registerMenuCommand('OC loader: clear cached build', () => {
      GM_setValue(K.SRC, '');
      GM_setValue(K.VER, '');
      alert('Cached build cleared.');
    });
  }
})();
