// ==UserScript==
// @name         Torn Banker Request
// @namespace    torn-banker-request
// @version      3.2.1
// @description  Request money from your faction bankers — from the armoury panel or by typing @banker in faction chat. Requests are marked PAID automatically when the money lands, and if a member fronted it out of pocket the faction is told to correct their balance.
// @author       iSatomi (3580191)
// @license      GPL-3.0
// @match        https://www.torn.com/*
// @grant        GM_xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==

// Copyright (c) iSatomi - 3580191. All Rights Reserved.
//
// v3.0.0 — THE WEBHOOK IS GONE FROM THE CLIENT.
//
//   Every previous version shipped the Discord webhook URL inside the script, so
//   anyone holding the file could post to the channel forever and the only remedy
//   was rotating it for the whole faction. The script now talks to a Google Apps
//   Script endpoint; the webhook lives in that project's Script Properties and is
//   never sent to a browser.
//
//   THE ENDPOINT URL BELOW IS NOT A SECRET, and shouldn't be treated as one. It
//   ships in this file, so assume it's public. Holding it lets someone CALL the
//   endpoint — it does not let them open the sheet, read the roster or see the
//   webhook, and the server rejects anyone who isn't on the live faction roster
//   before it spends a single API call. That's the trade: a leaked address you
//   can disable from one cell, instead of a leaked credential you can't.
//
//   WHAT MOVED SERVER-SIDE
//     · expiry — EXPIRED/UNCONFIRMED used to run on setTimeout in a tab and
//       silently never fired if you closed it. Now a timed trigger.
//     · dedup — which is what makes chat scope 'all' safe: every member can
//       relay, N clients post, one Discord message results.
//     · payment detection for VAULT routes — the sheet reads the faction funds
//       log directly, so a banker filling your request is noticed whether or not
//       any browser is open.
//
//   WHAT MUST STAY CLIENT-SIDE, AND WHY
//     A personal send (a member fronting you money out of pocket) is invisible to
//     the faction API — money is private to its two parties. Only the payer's and
//     the payee's own logs show it. So both ends report it:
//       · the requester's client reads "X sent $Y to you" from page.php?sid=log
//       · the helper's client reads "You sent $Y to X" from the same page
//     Either one closes the loop, so it resolves even if only one of them has the
//     script installed. A closed browser delays this, never loses it — the log
//     keeps history, so it resolves next time Torn is opened.
//
//   PARSERS ARE VALIDATED, NOT GUESSED. Every selector and regex here was checked
//   against saved copies of the live pages:
//     · chat rows / ids / ordinals — 23/23 on the deposit page
//     · player log — 4/4 wordings, 380 non-transfer money lines correctly ignored
//     · amount parsing — 38 cases, including the ones that must NOT parse
//   Notes at each parser record the trap it exposed. Don't "tidy" them.

(() => {
  'use strict';
  if (window.__bankReqLoaded) return;
  window.__bankReqLoaded = true;

  // Real installed version, read from the userscript header so the boot log and
  // console handle can never drift from @version again (they used to hardcode
  // "3.0.1", which made the console lie about which build was running). Falls
  // back on Torn PDA, which may not expose GM_info.
  const VERSION =
    (typeof GM_info !== 'undefined' && GM_info && GM_info.script && GM_info.script.version) ||
    (typeof GM !== 'undefined' && GM.info && GM.info.script && GM.info.script.version) ||
    '3.2.1';

  // ── CONFIG ─────────────────────────────────────────────────────────────────

  // Pre-installed so members only have to install the script. Overridable via ⚙
  // if the backend is ever redeployed to a new URL.
  const DEFAULT_ENDPOINT =
    'https://script.google.com/macros/s/AKfycbzpoHoG9-l7HV4zXcSFCEiO1kMw4pR6vH6p7zYaYsK3TREt-bCFgk8CQhV_kQYQic33/exec';

  const COOLDOWN_S = 45;        // between your own requests, any entry point
  const NOTE_MAX = 200;
  const LOG_POLL_MS = 60_000;   // player-log check while anything is outstanding
  const BOARD_POLL_MS = 20_000; // banker board refresh while it's open
  const RETRY_MS = 30_000;      // queued request retry

  const CHAT = {
    SCOPE_DEFAULT: 'all',       // safe now that the server dedups
    ENABLED_DEFAULT: true,
    TRIGGER: /@\s?banker/i,
    SETTLE_MS: 1500,
    BOTTOM_SLOP_PX: 80,
    // "@banker cancel" / "@banker nvm" withdraws your most recent open request.
    // Anchored to the START of the message body (after the trigger is stripped)
    // so "@banker 1m, cancel my order at the shop" can't withdraw anything.
    CANCEL: /^(?:cancel|nvm|never\s?mind|nevermind|disregard|ignore\s+(?:that|me))\b/i,
    CONTAINER: 'div[id^="faction-"]',
    ROW: 'div[class*="virtualItem__"]',
    MSG_ID: 'a[id^="rq-"]',     // rq-<uuid>:<userId>
    BODY: 'span[class*="message__"]',
    PROFILE: 'a[href*="XID="]',
  };

  const K = {
    ENDPOINT:  'bankreq_endpoint',
    SELF:      'bankreq_self',
    LAST:      'bankreq_last',
    OBS:       'bankreq_obs',        // last observed {cash, bal, at}
    MINE:      'bankreq_mine',       // my open requests [{request_id, amount, at}]
    QUEUE:     'bankreq_queue',      // requests awaiting retry
    LOGSEEN:   'bankreq_logseen',    // player-log lines already reported
    CHAT_ON:   'bankreq_chat_on',
    CHAT_SCOPE:'bankreq_chat_scope',
    CHAT_SENT: 'bankreq_chat_sent',
  };

  const qs  = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => [...r.querySelectorAll(s)];
  const nowS = () => Math.floor(Date.now() / 1000);
  // Storage with a fallback: GM on desktop, localStorage on Torn PDA (which may
  // expose no GM storage at all). Values are stored as JSON strings; jget also
  // tolerates a manager that hands back an already-parsed value (GM4 / the PDA
  // GM shim), which would otherwise throw in JSON.parse and lose the key.
  const rawGet = (k) => {
    try { if (typeof GM_getValue === 'function') return GM_getValue(k, null); } catch (_) {}
    try { return localStorage.getItem(k); } catch (_) { return null; }
  };
  const rawSet = (k, s) => {
    try { if (typeof GM_setValue === 'function') { GM_setValue(k, s); return; } } catch (_) {}
    try { localStorage.setItem(k, s); } catch (_) {}
  };
  const jget = (k, d) => {
    const raw = rawGet(k);
    if (raw === null || raw === undefined) return d;
    if (typeof raw !== 'string') return raw;          // already parsed by the manager
    try { const v = JSON.parse(raw); return v === null ? d : v; } catch (_) { return d; }
  };
  const jset = (k, v) => rawSet(k, JSON.stringify(v));
  const fmtMoney = n => '$' + Math.round(n).toLocaleString();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── AMOUNT PARSING ─────────────────────────────────────────────────────────

  const MULT = { k: 1e3, thou: 1e3, thousand: 1e3, m: 1e6, mil: 1e6, million: 1e6, b: 1e9, bil: 1e9, billion: 1e9 };
  // Any mention of "balance" in a banker request means the whole vault balance —
  // "grab my balance", "my balance please", "entire balance" all count. This is
  // checked only AFTER an explicit number is ruled out (see parseRequestAmount),
  // so "send my balance, ~5m" is still read as 5m, not everything.
  const ALL_RE = /\bbalance\b|\beverything\b|\ball\s+of\s+it\b|\bmax(?:imum)?\b|\bthe\s+lot\b|\bempty\s+it\b/i;
  // A number followed by a time word is a deadline, not an amount.
  const TIME_UNIT_RE = /^\s*(?:min(?:ute)?s?|hours?|hrs?|sec(?:ond)?s?|days?|m(?:in)?s\b)/i;

  /**
   * Read a money amount out of free text.
   * @param strict true for the panel field (the WHOLE string must be an amount);
   *               false for chat, where it sits inside a sentence.
   * @returns {kind:'all'} | {kind:'amount', value} | null
   *
   * Bare short numbers are rejected deliberately — a number only counts as money
   * with a k/m/b suffix, a $, thousands separators, or 5+ digits. Otherwise
   * "@banker 2 mins" and "@banker slot 3" become requests for $2 and $3.
   */
  function parseRequestAmount(text, strict) {
    const raw = String(text || '');
    if (!raw.trim()) return null;
    const body = raw.replace(/@\s?banker/ig, ' ');
    // The trailing \b is load-bearing: without it the "m" suffix matches the "m"
    // of "min" and "@banker in 10 min" posts a request for $10,000,000.
    const re = /(\$)?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m|b|mil(?:lion)?|bil(?:lion)?|thou(?:sand)?)?\b/gi;
    let m;
    while ((m = re.exec(body)) !== null) {
      const [, dollar, numStr, suffixRaw] = m;
      if (!suffixRaw && TIME_UNIT_RE.test(body.slice(m.index + m[0].length))) continue;
      const hasComma = numStr.includes(',');
      const n = parseFloat(numStr.replace(/,/g, ''));
      if (!isFinite(n) || n <= 0) continue;
      const suffix = suffixRaw ? suffixRaw.toLowerCase() : null;
      const value = Math.round(n * (suffix ? (MULT[suffix] || 1) : 1));
      if (!isFinite(value) || value <= 0) continue;
      const digits = numStr.replace(/[^\d]/g, '').length;
      if (strict) {
        // The panel's field is prefixed with "$" and can hold nothing but an
        // amount, so "100" unambiguously means $100. Requiring a suffix or 5+
        // digits here — the rule that keeps CHAT honest — just rejects perfectly
        // clear input. All that matters is the whole field is the number.
        if (body.trim() !== m[0].trim()) continue;
      } else if (!(suffix || dollar || hasComma || digits >= 5)) {
        // Chat needs a stronger signal: free text contains numbers that aren't
        // money ("in 10 min", "slot 3"), and guessing wrong posts a real request.
        continue;
      }
      return { kind: 'amount', value };
    }
    // No explicit number — a "balance"/"everything" cue means the whole balance.
    if (ALL_RE.test(raw)) return { kind: 'all' };
    return null;
  }
  const describeAmount = a => !a ? 'an unspecified amount'
    : a.kind === 'all' ? 'their entire balance' : fmtMoney(a.value);

  function sanitizeNote(s) {
    return String(s || '').replace(/\s+/g, ' ')
      .replace(/@(everyone|here)/gi, '@​$1')
      .replace(/<(@|#|t:|a?:)/g, '< $1')
      .replace(/```/g, '').trim().slice(0, NOTE_MAX);
  }

  // ── IDENTITY ───────────────────────────────────────────────────────────────

  function detectSelf() {
    const a = qs('a[aria-label^="Name:"][href*="profiles.php?XID="]');
    if (a) {
      const id = (a.href.match(/XID=(\d+)/) || [])[1];
      const name = (a.getAttribute('aria-label') || '').replace(/^Name:\s*/, '').trim()
                || (a.textContent || '').trim();
      if (id) { const s = { id, name: name || ('#' + id) }; jset(K.SELF, s); return s; }
    }
    const s = jget(K.SELF, null);
    return (s && s.id) ? s : null;
  }

  // ── TRANSPORT ──────────────────────────────────────────────────────────────

  // Torn PDA exposes no GM_xmlHttpRequest, but provides native, cross-origin,
  // Promise-based PDA_httpGet/PDA_httpPost. Adapt them to the GM callback shape so
  // the ONE callSheet path works on desktop AND in PDA, with no per-member GM shim
  // required. A plain fetch can't stand in here — the backend is cross-origin
  // Google and sends no CORS headers, so only a native bridge can read the reply.
  const PDA_POST = (typeof PDA_httpPost === 'function' && PDA_httpPost)
    || (typeof unsafeWindow !== 'undefined' && unsafeWindow.PDA_httpPost) || null;
  const PDA_GET = (typeof PDA_httpGet === 'function' && PDA_httpGet)
    || (typeof unsafeWindow !== 'undefined' && unsafeWindow.PDA_httpGet) || null;

  function pdaXhr(o) {
    const isPost = String(o.method || 'GET').toUpperCase() === 'POST';
    let settled = false;
    const timer = o.timeout ? setTimeout(() => {
      if (settled) return; settled = true; o.ontimeout && o.ontimeout();
    }, o.timeout) : null;
    Promise.resolve(isPost ? PDA_POST(o.url, o.headers || {}, o.data || '')
                           : PDA_GET(o.url, o.headers || {}))
      .then((r) => {
        if (settled) return; settled = true; if (timer) clearTimeout(timer);
        o.onload && o.onload({
          status: Number(r && r.status) || 0,
          statusText: r && r.statusText,
          responseText: (r && r.responseText) || '',
          responseHeaders: (r && r.responseHeaders) || '',
        });
      })
      .catch((e) => {
        if (settled) return; settled = true; if (timer) clearTimeout(timer);
        o.onerror && o.onerror(e);
      });
  }

  const gmxhr =
      (typeof GM_xmlHttpRequest === 'function' && GM_xmlHttpRequest) ||
      (typeof GM_xmlhttpRequest === 'function' && GM_xmlhttpRequest) ||
      (typeof GM !== 'undefined' && GM.xmlHttpRequest && GM.xmlHttpRequest.bind(GM)) ||
      (PDA_POST && pdaXhr) ||
      function () { throw new Error('No HTTP transport — on desktop grant GM_xmlHttpRequest and reinstall; on Torn PDA, update the app to a version with PDA_httpPost.'); };

  const getEndpoint = () => rawGet(K.ENDPOINT) || DEFAULT_ENDPOINT;
  function setEndpoint() {
    const v = prompt('Apps Script Web App URL (ends in /exec):', getEndpoint());
    if (v && /^https:\/\/script\.google\.com\/macros\//.test(v.trim())) rawSet(K.ENDPOINT, v.trim());
    else if (v) alert('That should start with https://script.google.com/macros/ and end in /exec');
    return getEndpoint();
  }

  /** POST to the backend. Apps Script 302-redirects to googleusercontent, which
   *  GM_xmlHttpRequest follows for us — both hosts are in @connect. */
  function callSheet(action, payload) {
    const self = detectSelf();
    const body = Object.assign({ action, user_id: self ? self.id : '', name: self ? self.name : '' }, payload || {});
    return new Promise((res, rej) => {
      gmxhr({
        method: 'POST', url: getEndpoint(), data: JSON.stringify(body),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // avoids a CORS preflight
        timeout: 20000,
        onload(r) {
          if (r.status < 200 || r.status >= 300) { rej(new Error('HTTP ' + r.status)); return; }
          try { res(JSON.parse(r.responseText)); }
          catch (_) { rej(new Error('bad response from the sheet')); }
        },
        onerror() { rej(new Error('network error')); },
        ontimeout() { rej(new Error('timeout')); },
      });
    });
  }

  // ── RETRY QUEUE ────────────────────────────────────────────────────────────
  // Apps Script cold-starts and occasionally times out. Without this a request
  // simply vanished and the member had no idea.

  const loadQueue = () => jget(K.QUEUE, []);
  const saveQueue = q => jset(K.QUEUE, q);
  function enqueue(payload) { const q = loadQueue(); q.push({ at: nowS(), payload }); saveQueue(q); }

  async function drainQueue() {
    const q = loadQueue();
    if (!q.length) return;
    const keep = [];
    for (const item of q) {
      if (nowS() - item.at > 1800) continue;   // older than the watch window — pointless now
      try {
        const r = await callSheet('request', item.payload);
        if (r && r.ok) { noteMine(r.request_id, item.payload.amount); toast('✓ Queued request sent.'); continue; }
        if (r && !r.ok) continue;              // server said no; retrying won't change that
        keep.push(item);
      } catch (_) { keep.push(item); }
    }
    saveQueue(keep);
  }

  // ── MY OPEN REQUESTS ───────────────────────────────────────────────────────

  const loadMine = () => jget(K.MINE, []).filter(r => nowS() - r.at < 3600);
  function noteMine(id, amount) {
    if (!id) return;
    const a = loadMine();
    a.push({ request_id: id, amount, at: nowS() });
    jset(K.MINE, a);
  }
  function dropMine(id) { jset(K.MINE, loadMine().filter(r => r.request_id !== id)); }

  // ── MONEY READERS ──────────────────────────────────────────────────────────

  /** Cash on hand, from the sidebar — present on every Torn page.
   *  <span class="value___c6eCp" id="user-money" data-money="0">$0</span> */
  function readCash() {
    const el = qs('#user-money');
    if (!el) return null;
    const attr = el.getAttribute('data-money');
    if (attr != null && attr !== '') {
      const n = Number(String(attr).replace(/[^0-9.-]/g, ''));
      if (Number.isFinite(n)) return n;
    }
    const n = Number(String(el.textContent || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  /** Faction vault balance — only rendered on the armoury donate page. */
  function readBalance() {
    const el = qs('.money-balance');
    if (!el) return null;
    const n = Number(String(el.textContent || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  // ── PLAYER LOG ─────────────────────────────────────────────────────────────
  //
  // page.php?sid=log is the only place a PERSONAL send is visible. Validated
  // against a saved copy: 4/4 wordings parsed, and of 384 lines containing a $
  // amount only the 4 real transfers were classified — the other 380 ("You used
  // 5 nerve successfully cracking a password gaining $62,400") correctly ignored.
  //
  // .log-text is an UNHASHED class, unlike text___fcNNS / collapsed___qKf5M
  // beside it, so it survives Torn deploys.

  const logSeen = () => jget(K.LOGSEEN, []);
  function noteLogSeen(sig) {
    const a = logSeen();
    a.push(sig);
    while (a.length > 200) a.shift();
    jset(K.LOGSEEN, a);
  }

  function parseLogEntry(el) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const idOf = i => {
      const a = el.querySelectorAll('a[href*="XID="]')[i];
      return a ? (a.href.match(/XID=(\d+)/) || [])[1] || null : null;
    };
    let m;
    if ((m = text.match(/^(.+?) gave \$([\d,]+) to you from (.+?)$/)))
      return { kind: 'in-vault', name: m[1].trim(), id: idOf(0), amount: Number(m[2].replace(/,/g, '')) };
    if ((m = text.match(/^(.+?) sent \$([\d,]+) to you(?: with the message: (.*))?$/)))
      return { kind: 'in-personal', name: m[1].trim(), id: idOf(0), amount: Number(m[2].replace(/,/g, '')) };
    if ((m = text.match(/^You sent \$([\d,]+) to (.+?)$/)))
      return { kind: 'out-personal', name: m[2].trim(), id: idOf(0), amount: Number(m[1].replace(/,/g, '')) };
    return null;
  }

  /** Fetch our own log page. Same-origin, so the session cookie rides along. */
  function fetchLogDoc() {
    return fetch('https://www.torn.com/page.php?sid=log', { credentials: 'same-origin' })
      .then(r => r.text())
      .then(html => new DOMParser().parseFromString(html, 'text/html'));
  }

  /**
   * Report any money movement the sheet cannot see for itself.
   *
   * Incoming: someone paid ME — settles my own request.
   * Outgoing: I paid someone — settles THEIR request and records that I fronted
   *           it, which is the whole point of the helper flow. This works even
   *           when the person I helped has no script installed.
   */
  let _logBusy = false;
  async function pollPlayerLog(force) {
    if (_logBusy) return;
    const self = detectSelf();
    if (!self) return;
    // Only worth the request when something is actually outstanding — either my
    // own request, or (for the helper path) any open request at all.
    if (!force && !loadMine().length && !_boardHasOpen) return;
    _logBusy = true;
    try {
      const doc = await fetchLogDoc();
      const rows = [...doc.querySelectorAll('.log-text')].map(parseLogEntry).filter(Boolean);
      const seen = logSeen();
      for (const r of rows) {
        const sig = `${r.kind}|${r.id}|${r.amount}`;
        if (seen.includes(sig)) continue;
        noteLogSeen(sig);
        try {
          if (r.kind === 'out-personal') {
            await callSheet('report', { direction: 'out', recipient_id: r.id, amount: r.amount, route: 'personal' });
          } else {
            await callSheet('report', {
              direction: 'in', payer_id: r.id, payer_name: r.name, amount: r.amount,
              route: r.kind === 'in-vault' ? 'vault' : 'personal',
            });
          }
        } catch (_) { /* retried on the next poll — the signature isn't re-recorded on failure */ }
      }
    } catch (_) { /* log page unreachable; try again next tick */ }
    finally { _logBusy = false; }
  }

  /**
   * Cash/balance deltas aren't used to settle anything any more — the log names
   * the payer and the server does the matching. They're used as a TRIGGER: money
   * moved, so read the log now instead of waiting for the next poll.
   */
  function checkMoney() {
    const cash = readCash(), bal = readBalance();
    if (cash === null && bal === null) return;
    const prev = jget(K.OBS, null);
    const obs = { cash, bal: bal === null ? (prev ? prev.bal : null) : bal, at: nowS() };
    jset(K.OBS, obs);
    if (!prev || nowS() - (prev.at || 0) > 86400) return;
    const credit = (cash !== null && prev.cash != null && cash > prev.cash)
                || (bal !== null && prev.bal != null && bal > prev.bal);
    const debit  = (cash !== null && prev.cash != null && cash < prev.cash);
    if (credit || debit) pollPlayerLog(true);   // debit matters too: I may have just helped someone
  }

  function watchMoney() {
    checkMoney();
    const el = qs('#user-money');
    if (el && !el.__bankReqWatched) {
      el.__bankReqWatched = true;
      new MutationObserver(() => checkMoney()).observe(el, {
        attributes: true, attributeFilter: ['data-money'],
        childList: true, characterData: true, subtree: true,
      });
    }
  }

  // ── TOAST ──────────────────────────────────────────────────────────────────

  function toast(msg, bad) {
    let t = qs('#bank-req-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'bank-req-toast';
      document.body.appendChild(t);
    }
    const col = bad ? '#bf7a7a' : '#7abf7a';
    t.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:2147483647;'
      + `background:#1e1e1e;border:1px solid ${col};border-left:3px solid ${col};border-radius:6px;`
      + 'color:#e0e0e0;font:13px/1.45 Arial,sans-serif;padding:10px 16px;max-width:340px;'
      + 'box-shadow:0 4px 16px rgba(0,0,0,.5);opacity:1;transition:opacity .2s';
    t.textContent = msg;
    clearTimeout(t.__h);
    t.__h = setTimeout(() => { t.style.opacity = '0'; }, 5000);
  }

  // ── SENDING ────────────────────────────────────────────────────────────────

  const loadLast = () => jget(K.LAST, {});
  const cooldownLeft = () => Math.max(0, COOLDOWN_S - (Date.now() - (loadLast().ts || 0)) / 1000);

  async function sendRequest(o) {
    const self = detectSelf();
    if (!self) return { ok: false, reason: 'Open any Torn page so the script can read your name.' };
    const payload = {
      amount: o.amount && o.amount.kind === 'amount' ? o.amount.value : 0,
      amount_kind: o.amount ? o.amount.kind : 'none',
      note: sanitizeNote(o.note), mode: o.mode, minutes: o.minutes || 10,
      source: o.source || 'panel', balance: readBalance() || 0,
    };
    jset(K.LAST, { ts: Date.now() });
    try {
      const r = await callSheet('request', payload);
      if (r && r.ok && !r.deduped) noteMine(r.request_id, payload.amount);
      return r || { ok: false, reason: 'no response' };
    } catch (e) {
      enqueue(payload);
      return { ok: false, reason: 'Sheet unreachable — queued, will retry.', queued: true };
    }
  }

  // ── CHAT WATCHER ───────────────────────────────────────────────────────────
  //
  // Torn's chat is virtualized: only rows near the viewport exist, and scrolling
  // MOUNTS old ones. Two verified signals stop history reposting:
  //   1. each row's sender link carries a per-message id "rq-<uuid>:<userId>"
  //   2. each row sits in an absolutely-positioned wrapper whose `top` grows
  //      strictly down the list, so further down means newer
  // A high-water mark on that offset means scrollback is always below it.

  const chatEnabled = () => jget(K.CHAT_ON, CHAT.ENABLED_DEFAULT);
  const chatScope = () => jget(K.CHAT_SCOPE, CHAT.SCOPE_DEFAULT);
  const chatSent = () => jget(K.CHAT_SENT, []);
  function rememberSent(id) {
    const a = chatSent(); a.push(id);
    while (a.length > 200) a.shift();
    jset(K.CHAT_SENT, a);
  }

  const chat = { seen: new Set(), hwm: -Infinity, armed: false, newestRow: null,
                 observer: null, container: null, scrollEl: null, warned: false, debug: false };

  /** Turn on from the console: __bankReq.chat.debug = true
   *  Then type in faction chat and watch each stage report itself. Cheaper than
   *  guessing which of five links in the chain is the broken one. */
  const dbg = (...a) => { if (chat.debug) console.log('[Banker Request]', ...a); };

  /** Day dividers ("Today 02:09") render as rows too, with no sender and no body. */
  const isMessageRow = row => !!(row.querySelector(CHAT.MSG_ID) || row.querySelector(CHAT.BODY));

  function chatOrdinal(row) {
    let el = row;
    for (let i = 0; i < 4 && el; i++) {
      if (el.style && el.style.top && el.style.position === 'absolute') {
        const n = parseFloat(el.style.top);
        if (Number.isFinite(n)) return n;
      }
      el = el.parentElement;
    }
    // No geometry fallback: getBoundingClientRect is viewport-relative, so it
    // changes as you scroll and can't be compared against a stored mark.
    return null;
  }
  function chatMessageId(row) {
    const a = row.querySelector(CHAT.MSG_ID);
    if (a && a.id) return a.id;
    const ord = chatOrdinal(row);
    return `pos:${ord === null ? '?' : ord}::${(row.innerText || '').trim().slice(0, 160)}`;
  }
  function chatSenderId(row) {
    const a = row.querySelector(CHAT.MSG_ID);
    const fromId = a && a.id ? (a.id.match(/:(\d+)$/) || [])[1] : null;
    if (fromId) return fromId;
    const link = row.querySelector(CHAT.PROFILE);
    return link ? (link.href.match(/XID=(\d+)/) || [])[1] || null : null;
  }
  function chatBody(row) {
    const b = row.querySelector(CHAT.BODY);
    if (b) return (b.innerText || '').trim();
    return (row.innerText || '').trim().replace(/^[^\n:]{1,32}:\s*/, '');
  }
  function chatScroller(c) {
    if (chat.scrollEl && c.contains(chat.scrollEl)) return chat.scrollEl;
    for (const el of [c, ...c.querySelectorAll('div')])
      if (el.scrollHeight > el.clientHeight + 20) { chat.scrollEl = el; return el; }
    return null;
  }
  function chatAtBottom(c) {
    const el = chatScroller(c);
    if (!el) return true;
    return (el.scrollHeight - el.scrollTop - el.clientHeight) <= CHAT.BOTTOM_SLOP_PX;
  }

  async function forwardChatRequest(row, id) {
    const self = detectSelf();
    const senderId = chatSenderId(row);
    const isSelf = !!(self && senderId && String(senderId) === String(self.id));
    if (chatScope() === 'self' && !isSelf) return;
    if (chatSent().includes(id)) return;   // another tab already relayed it
    rememberSent(id);

    const text = chatBody(row);

    // "@banker cancel" — withdraw rather than raise. Checked first, or the
    // amount parser would look at "cancel my 1m" and post a fresh request.
    if (CHAT.CANCEL.test(text.replace(/@\s?banker/ig, '').trim())) {
      dbg('cancel intent', { isSelf, senderId, text });
      try {
        const r = await callSheet('cancel', { on_behalf_of: isSelf ? '' : String(senderId || '') });
        dbg('cancel replied', r);
        if (r && r.ok) toast(`🚫 Request cancelled${r.amount ? ' — ' + fmtMoney(r.amount) : ''}`);
        else if (isSelf) toast('Nothing to cancel: ' + ((r && r.reason) || 'no response'), true);
      } catch (e) {
        console.warn('[Banker Request] cancel failed:', e.message);
        if (isSelf) toast('Cancel failed: ' + e.message, true);
      }
      refreshLive();
      return;
    }

    const amount = parseRequestAmount(text, false);
    // No amount and no "balance"/"everything" cue — an ambiguous "@banker …" that
    // must NOT go out as $0. Only the sender can fix it, so hint them and stop;
    // when we're relaying someone else's line, drop it silently.
    if (!amount) {
      if (isSelf) toast('Add an amount — e.g. @banker 1m, 592932065, or "entire balance".', true);
      return;
    }
    // Relaying someone else's request: the server verifies THEM against the
    // roster, so a relay can't smuggle in a non-member.
    const payload = {
      amount: amount.kind === 'amount' ? amount.value : 0,
      amount_kind: amount.kind,
      note: sanitizeNote(text), mode: 'chat', source: 'chat',
      on_behalf_of: isSelf ? '' : String(senderId || ''),
      balance: isSelf ? (readBalance() || 0) : 0,
    };
    dbg('relaying', { isSelf, senderId, amount, text });
    try {
      const r = await callSheet('request', payload);
      dbg('sheet replied', r);
      if (r && r.ok) {
        if (!r.deduped) {
          if (isSelf) noteMine(r.request_id, payload.amount);
          toast(`💬 Chat request sent — ${describeAmount(amount)}`);
          refreshLive();
        }
      } else {
        // Never fail silently. A rejected relay used to produce nothing at all —
        // no toast, no console line — which is indistinguishable from the
        // watcher not having seen the message in the first place.
        const why = (r && r.reason) || 'no response';
        console.warn('[Banker Request] chat relay rejected:', why, payload);
        if (isSelf) toast('Chat request rejected: ' + why, true);
      }
    } catch (e) {
      console.warn('[Banker Request] chat relay failed:', e.message, payload);
      if (isSelf) { toast('Chat request failed: ' + e.message + ' — queued.', true); enqueue(payload); }
    }
  }

  function chatProcessRow(row, post) {
    if (!(row instanceof HTMLElement) || !isMessageRow(row)) return;
    const id = chatMessageId(row);
    const ord = chatOrdinal(row);
    const known = chat.seen.has(id);
    let isNew;
    if (ord !== null) isNew = ord > chat.hwm;
    else {
      if (!chat.warned) { chat.warned = true; console.warn('[Banker Request] chat offsets missing — using document order'); }
      isNew = !chat.newestRow || !chat.newestRow.isConnected
           || (chat.newestRow.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    }
    chat.seen.add(id);
    if (chat.seen.size > 1500) chat.seen.delete(chat.seen.values().next().value);
    if (ord !== null && ord > chat.hwm) chat.hwm = ord;
    if (isNew) chat.newestRow = row;
    const trigger = CHAT.TRIGGER.test(row.innerText || '');
    if (trigger || chat.debug) {
      dbg('row', { text: (row.innerText || '').slice(0, 60), trigger, post, armed: chat.armed,
                   known, isNew, ord, hwm: chat.hwm, id });
    }
    if (!post || !chat.armed || known || !isNew || !trigger) return;
    forwardChatRequest(row, id);
  }
  function chatScan(root, post) {
    if (!(root instanceof HTMLElement)) return;
    if (root.matches && root.matches(CHAT.ROW)) chatProcessRow(root, post);
    root.querySelectorAll?.(CHAT.ROW).forEach(r => chatProcessRow(r, post));
  }
  /** Arm from the BOTTOM of the list (baselining mid-history would mark
   *  everything below as new and dump the backlog into Discord).
   *  Deliberately does NOT re-scan: chatAttach already scanned once, and new rows
   *  arrive via the observer. Re-scanning every tick while un-armed walked every
   *  row every second — silent waste normally, a console FLOOD with debug on. */
  function chatTryArm(c) {
    if (chat.armed) return;
    if (chatAtBottom(c)) chat.armed = true;
  }
  function chatAttach(c) {
    if (chat.observer) chat.observer.disconnect();
    chat.container = c; chat.scrollEl = null;
    chat.hwm = -Infinity; chat.armed = false; chat.newestRow = null;
    chatScan(c, false);
    setTimeout(() => { if (chat.container === c) chatTryArm(c); }, CHAT.SETTLE_MS);
    chat.observer = new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(n => chatScan(n, true)); });
    chat.observer.observe(c, { childList: true, subtree: true });
  }
  function chatTick() {
    if (!chatEnabled()) {
      if (chat.observer) { chat.observer.disconnect(); chat.observer = null; chat.container = null; }
      return;
    }
    const c = qs(CHAT.CONTAINER);
    if (c && c !== chat.container) chatAttach(c);
    else if (!c && chat.container) {
      if (chat.observer) chat.observer.disconnect();
      chat.observer = null; chat.container = null; chat.scrollEl = null;
    } else if (c && !chat.armed) chatTryArm(c);
  }

  // ── BANKER BOARD ───────────────────────────────────────────────────────────

  let _boardHasOpen = false;
  let _boardTimer = null;

  function openBoard() {
    let bg = qs('#bank-board-bg');
    if (bg) { bg.remove(); clearInterval(_boardTimer); return; }
    bg = document.createElement('div');
    bg.id = 'bank-board-bg';
    bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483646;'
      + 'display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif';
    bg.addEventListener('click', e => { if (e.target === bg) { bg.remove(); clearInterval(_boardTimer); } });
    bg.innerHTML = '<div id="bank-board" style="background:#1e1e1e;border:1px solid #444;border-radius:8px;'
      + 'width:92vw;max-width:560px;max-height:86vh;overflow:auto;padding:14px 16px;color:#ddd;font-size:13px">'
      + '<div style="color:#7a9acc;font-weight:bold;margin-bottom:10px">🏦 Banker board</div>'
      + '<div id="bank-board-body">Loading…</div></div>';
    document.body.appendChild(bg);
    refreshBoard();
    clearInterval(_boardTimer);
    _boardTimer = setInterval(refreshBoard, BOARD_POLL_MS);
  }

  async function refreshBoard() {
    const body = qs('#bank-board-body');
    if (!body) { clearInterval(_boardTimer); return; }
    let data;
    try { data = await callSheet('open', {}); }
    catch (e) { body.textContent = 'Sheet unreachable — ' + e.message; return; }
    if (!data || !data.ok) { body.textContent = (data && data.reason) || 'not authorised'; return; }

    _boardHasOpen = (data.requests || []).length > 0;
    updateBoardBadge((data.requests || []).length);
    const self = detectSelf();
    const ageOf = t => { const s = nowS() - t; return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm' : Math.floor(s / 3600) + 'h'; };

    const reqs = (data.requests || []).map(r => {
      const mine = self && String(r.user_id) === String(self.id);
      const amt = r.kind === 'all' ? 'entire balance' : fmtMoney(r.amount);
      return `<div style="border-top:1px solid #333;padding:7px 0">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <a href="/profiles.php?XID=${esc(r.user_id)}" target="_blank" style="color:#7a9acc;font-weight:bold">${esc(r.name)}</a>
          <b>${esc(amt)}</b>
          <span style="color:#8a8a99;font-size:11px">${ageOf(r.created)} ago${r.mode === 'online' ? ' · 🟢 online now' : r.mode === 'chat' ? ' · 💬 chat' : ''}</span>
          <span style="margin-left:auto;display:flex;gap:6px">
            ${r.claimed_by
              ? `<span style="color:#bf9f5a;font-size:11px">🔒 ${esc(r.claimed_by)}</span>`
              : `<button class="bank-claim" data-id="${esc(r.id)}" style="cursor:pointer;background:#16202c;border:1px solid #2f4a68;color:#7a9acc;border-radius:4px;padding:2px 10px;font-size:11px">Claim</button>`}
            ${mine ? `<button class="bank-cancel" data-id="${esc(r.id)}" style="cursor:pointer;background:#2a1618;border:1px solid #5a2a2a;color:#bf7a7a;border-radius:4px;padding:2px 10px;font-size:11px">Cancel</button>` : ''}
          </span>
        </div>
        ${r.note ? `<div style="color:#8a8a99;font-size:11px;margin-top:3px">📝 ${esc(r.note)}</div>` : ''}
      </div>`;
    }).join('') || '<div style="color:#8a8a99;padding:6px 0">No open requests.</div>';

    const debts = (data.debts || []).map(d => `<div style="border-top:1px solid #333;padding:6px 0;font-size:12px">
        🤝 <b>${esc(d.helper)}</b> is owed <b style="color:#bf9f5a">${fmtMoney(d.amount)}</b>
        <span style="color:#8a8a99">— fronted ${esc(d.for_member)}'s request</span></div>`).join('');

    body.innerHTML = reqs
      + (debts ? `<div style="color:#7a9acc;font-weight:bold;margin-top:14px">Balances to correct</div>${debts}` : '')
      + '<div style="color:#8a8a99;font-size:11px;margin-top:12px">Claiming tells other bankers you have it. '
      + 'Nothing here moves money — you still pay in Torn as normal.</div>';

    qsa('.bank-claim', body).forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try { const r = await callSheet('claim', { request_id: b.dataset.id });
            toast(r && r.ok ? '📌 Claimed.' : ((r && r.reason) || 'Failed'), !(r && r.ok)); }
      catch (e) { toast('Failed: ' + e.message, true); }
      refreshBoard();
    }));
    qsa('.bank-cancel', body).forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try { const r = await callSheet('cancel', { request_id: b.dataset.id });
            if (r && r.ok) { dropMine(b.dataset.id); toast('🚫 Cancelled.'); refreshLive(); }
            else toast((r && r.reason) || 'Failed', true); }
      catch (e) { toast('Failed: ' + e.message, true); }
      refreshBoard();
    }));
  }

  function ensureBoardButton() {
    if (qs('#bank-board-btn')) return;
    const b = document.createElement('div');
    b.id = 'bank-board-btn';
    b.title = 'Banker board — open requests';
    b.style.cssText = 'position:fixed;top:210px;left:12px;width:42px;height:42px;border-radius:50%;'
      + 'background:linear-gradient(180deg,#3a8a5a,#1f5a36);color:#fff;border:1px solid #16401f;'
      + 'box-shadow:0 2px 8px rgba(0,0,0,.5);font-size:18px;cursor:pointer;user-select:none;'
      + 'display:flex;align-items:center;justify-content:center;z-index:99998';
    b.innerHTML = '🏦<span id="bank-board-count" style="position:absolute;top:-4px;right:-4px;min-width:17px;'
      + 'height:17px;border-radius:9px;background:#c8922e;border:1px solid #6a4a10;color:#fff;font-size:10px;'
      + 'font-weight:700;line-height:15px;text-align:center;padding:0 3px;box-sizing:border-box;display:none"></span>';
    b.addEventListener('click', openBoard);
    document.body.appendChild(b);
  }
  function updateBoardBadge(n) {
    const el = qs('#bank-board-count');
    if (!el) return;
    el.textContent = n || '';
    el.style.display = n ? '' : 'none';
  }

  // ── PANEL ──────────────────────────────────────────────────────────────────

  const INP = 'background:#111;border:1px solid #444;border-radius:3px;color:#eee;padding:5px 8px;font-size:13px;box-sizing:border-box';

  function buildPanel() {
    const el = document.createElement('div');
    el.id = 'bank-req-panel';
    el.className = 'cont-gray bottom-round';
    el.style.cssText = 'margin-top:8px;padding:10px 14px;font-family:Arial,sans-serif';
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:9px">
        <b style="color:#cfcfcf;font-size:13px">🏦 Request from a banker</b>
        <span id="bank-req-as" style="font-size:11px;color:#8a8a99;margin-left:auto"></span>
        <span id="bank-req-cfg" title="Backend URL" style="cursor:pointer;color:#7a9acc;font-size:13px">⚙</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <div style="display:flex;align-items:center;gap:0">
          <span style="background:#333;border:1px solid #444;border-right:none;border-radius:3px 0 0 3px;color:#9a9a9a;padding:5px 9px;font-size:13px">$</span>
          <input id="bank-req-amt" type="text" placeholder="1m · 500k · 592932065 · entire balance" autocomplete="off"
                 style="${INP};border-radius:0 3px 3px 0;width:210px">
        </div>
        <input id="bank-req-note" type="text" placeholder="note (optional)" autocomplete="off"
               style="${INP};flex:1;min-width:140px">
        <button id="bank-req-send" class="torn-btn" style="cursor:pointer">REQUEST BANKER</button>
      </div>
      <div style="margin-top:9px;display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:#bbb;align-items:center">
        <label style="cursor:pointer"><input type="radio" name="bank-req-when" value="whenever" checked> No rush</label>
        <label style="cursor:pointer"><input type="radio" name="bank-req-when" value="online"> Online now (hand-to-hand)</label>
        <label style="cursor:pointer"><input type="radio" name="bank-req-when" value="within"> Within
          <input id="bank-req-min" type="number" min="1" max="1440" value="10" style="${INP};width:56px;padding:3px 6px"> min</label>
      </div>
      <div id="bank-req-status" style="margin-top:7px;font-size:11px;min-height:14px;color:#8a8a99"></div>
      <div id="bank-req-live" style="margin-top:4px;font-size:11px;color:#8a8a99"></div>
      <div style="margin-top:10px;border-top:1px solid #333;padding-top:8px;font-size:12px;color:#bbb">
        <label style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
          <input type="checkbox" id="bank-chat-on"> 💬 Watch faction chat for <b>@banker</b>
        </label>
        <select id="bank-chat-scope" style="${INP};padding:3px 6px;font-size:11px;margin-left:8px">
          <option value="all">everyone's messages</option>
          <option value="self">my messages only</option>
        </select>
        <button id="bank-board-open" class="torn-btn" style="cursor:pointer;margin-left:8px">🏦 Board</button>
        <div id="bank-chat-status" style="margin-top:5px;font-size:11px;color:#8a8a99"></div>
      </div>`;
    return el;
  }

  function refreshLive(root) {
    const live = qs('#bank-req-live', root || document);
    if (!live) return;
    const mine = loadMine();
    const queued = loadQueue().length;
    const bits = [];
    if (mine.length) bits.push(`👁 ${mine.map(r => fmtMoney(r.amount)).join(', ')} outstanding — marks itself paid when it lands.`);
    if (queued) bits.push(`⏳ ${queued} queued (sheet unreachable), retrying.`);
    live.textContent = bits.join('  ');
  }
  function refreshChatStatus(root) {
    const s = qs('#bank-chat-status', root || document);
    if (!s) return;
    if (!chatEnabled()) { s.textContent = 'Chat watching off — use the form above.'; return; }
    if (!chat.container) { s.textContent = 'Waiting for the faction chat panel to open…'; return; }
    if (!chat.armed) { s.textContent = "⏳ Scroll chat to the bottom to arm (won't post history)."; return; }
    s.textContent = chatScope() === 'all'
      ? "✓ Watching everyone. Duplicates are dropped by the sheet, so it's safe for all members to run this."
      : '✓ Watching your messages only.';
  }

  function wirePanel(el) {
    const status = qs('#bank-req-status', el);
    const self = detectSelf();
    qs('#bank-req-as', el).textContent = self ? `as ${self.name} [${self.id}]` : 'open any Torn page first';
    refreshLive(el); refreshChatStatus(el);

    const chatOn = qs('#bank-chat-on', el), chatSel = qs('#bank-chat-scope', el);
    chatOn.checked = chatEnabled(); chatSel.value = chatScope(); chatSel.disabled = !chatOn.checked;
    chatOn.addEventListener('change', () => { jset(K.CHAT_ON, chatOn.checked); chatSel.disabled = !chatOn.checked; chatTick(); refreshChatStatus(el); });
    chatSel.addEventListener('change', () => { jset(K.CHAT_SCOPE, chatSel.value); refreshChatStatus(el); });
    qs('#bank-req-cfg', el).addEventListener('click', () => setEndpoint());
    qs('#bank-board-open', el).addEventListener('click', openBoard);

    qs('#bank-req-send', el).addEventListener('click', async () => {
      const amount = parseRequestAmount(qs('#bank-req-amt', el).value, true);
      if (!amount) {
        status.style.color = '#bf7a7a';
        status.textContent = 'Enter an amount — 1m, 500k, 592932065, or "entire balance".';
        return;
      }
      const cd = cooldownLeft();
      if (cd > 0) { status.style.color = '#bf9f5a'; status.textContent = `Slow down — wait ${Math.ceil(cd)}s.`; return; }
      const when = (qsa('input[name=bank-req-when]', el).find(r => r.checked) || {}).value || 'whenever';
      const btn = qs('#bank-req-send', el);
      btn.disabled = true; status.style.color = '#8a8a99'; status.textContent = 'Sending…';
      const r = await sendRequest({
        amount, note: qs('#bank-req-note', el).value, mode: when,
        minutes: parseInt(qs('#bank-req-min', el).value, 10) || 10, source: 'panel',
      });
      btn.disabled = false;
      if (r.ok) {
        status.style.color = r.queued ? '#bf9f5a' : '#7abf7a';
        status.textContent = r.queued
          // Recorded, just not posted yet — Discord is briefly unreachable. Saying
          // "failed" would be wrong and would make people re-send.
          ? '✓ Request saved — Discord is rate limited, it will post within ~5 min.'
          : r.deduped ? '✓ Already sent just now.' : '✓ Sent to bankers. Watching for the money.';
        qs('#bank-req-amt', el).value = ''; qs('#bank-req-note', el).value = '';
      } else {
        status.style.color = r.queued ? '#bf9f5a' : '#bf7a7a';
        status.textContent = r.reason || 'Failed';
      }
      refreshLive(el);
    });
  }

  function ensurePanel() {
    const host = qs('.armoury-donate-wrap, [id="tab=armoury&sub=donate"]');
    if (!host) return;
    if (host.querySelector('#bank-req-panel')) { refreshLive(host); refreshChatStatus(host); return; }
    const donate = host.querySelector('.donate-wrap');
    const panel = buildPanel();
    if (donate && donate.parentNode === host) donate.after(panel);
    else host.appendChild(panel);
    wirePanel(panel);
  }

  // ── BOOT ───────────────────────────────────────────────────────────────────
  // The money and chat watchers run on EVERY Torn page: a payment can land, and
  // chat can be used, anywhere in the game.
  watchMoney();
  chatTick();
  ensureBoardButton();
  setInterval(() => { watchMoney(); chatTick(); ensureBoardButton(); }, 5000);
  setInterval(() => pollPlayerLog(false), LOG_POLL_MS);
  setInterval(drainQueue, RETRY_MS);
  drainQueue();

  if (location.pathname.includes('factions.php')) {
    setInterval(ensurePanel, 1000);
    window.addEventListener('hashchange', ensurePanel);
    ensurePanel();
  }

  // Any @grant puts the script in an isolated window, so assigning to `window`
  // exposes nothing to the page console — the handle exists, just not where you
  // can reach it. unsafeWindow is the page's real window. (Same pattern the OC
  // Suite uses for TornWarTools.)
  const PAGE = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
  PAGE.__bankReq = {
    version: VERSION,
    parseRequestAmount, parseLogEntry, callSheet, pollPlayerLog, loadMine, loadQueue,
    chat,
    self: () => detectSelf(),
    endpoint: () => getEndpoint(),
    /** One call that reports the state of every moving part. */
    status() {
      return {
        self: detectSelf(), endpoint: getEndpoint(),
        chat: { enabled: chatEnabled(), scope: chatScope(), armed: chat.armed,
                attached: !!chat.container, hwm: chat.hwm, seen: chat.seen.size },
        mine: loadMine(), queued: loadQueue().length,
      };
    },
  };
  console.log('[Banker Request] v' + VERSION + ' loaded — console handle: __bankReq  ·  try __bankReq.status()');
})();
