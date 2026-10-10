// ==UserScript==
// @name         Torn War Tools
// @namespace    iSatomi.torn.war.tools
// @version      3.9.1
// @description  War-page command center: live hospital/travel/jail countdowns, hospital-first sorting, status highlighting, and a per-enemy 📢 callout button that sends customizable, timer-aware messages to faction chat in one tap. FFScouter stat-estimate integration ({stats}/{ff} placeholders + inline badges). Unified ⚙ settings panel. TornPDA-safe (GM_xmlhttpRequest transport).
// @author       iSatomi [3580191]
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.xmlHttpRequest
// @grant        unsafeWindow
// @connect      api.torn.com
// @connect      ffscouter.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /* ════════════════════════════════════════════════════════════════════════
     * 0. SINGLETON GUARD
     * Prevents double-execution (e.g. SPA re-inject, duplicate install) and
     * signals FFScouter to stand down its own war monitor.
     * ════════════════════════════════════════════════════════════════════════ */
    if (window.__tornWarToolsLoaded) return;
    window.__tornWarToolsLoaded = true;
    if (!document.getElementById('FFScouterV2DisableWarMonitor')) {
        const g = document.createElement('div');
        g.id = 'FFScouterV2DisableWarMonitor';
        g.style.display = 'none';
        document.documentElement.appendChild(g);
        try { window.dispatchEvent(new Event('FFScouterV2DisableWarMonitor')); } catch (_) {}
    }

    const VERSION = '3.9.1';
    const LOG = (...a) => console.log('%c[WarTools]', 'color:#4a78b8;font-weight:bold', ...a);

    /* ════════════════════════════════════════════════════════════════════════
     * 1. STORAGE LAYER
     * A small abstraction over GM_* with a localStorage fallback so the script
     * behaves identically under Tampermonkey, Violentmonkey, and TornPDA.
     * Keys for shared TWSE-compatible values reuse the original namespace so an
     * existing API key / hosp-first preference carries over with no re-entry.
     * ════════════════════════════════════════════════════════════════════════ */
    const Store = {
        _gmGet: typeof GM_getValue === 'function' ? GM_getValue
              : (typeof GM !== 'undefined' && GM.getValue) ? GM.getValue : null,
        _gmSet: typeof GM_setValue === 'function' ? GM_setValue
              : (typeof GM !== 'undefined' && GM.setValue) ? GM.setValue : null,

        get(key, def) {
            // Try GM storage first (synchronous form only; async GM.* falls through to LS mirror)
            try {
                if (typeof GM_getValue === 'function') {
                    const v = GM_getValue(key, undefined);
                    if (v !== undefined) return v;
                }
            } catch (_) {}
            try {
                const raw = localStorage.getItem('wt:' + key);
                if (raw !== null) return JSON.parse(raw);
            } catch (_) {}
            return def;
        },
        set(key, val) {
            try { if (typeof GM_setValue === 'function') GM_setValue(key, val); } catch (_) {}
            try { localStorage.setItem('wt:' + key, JSON.stringify(val)); } catch (_) {}
        },
        // Raw localStorage passthrough for TWSE-compatible keys
        rawGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
        rawSet(key, val) { try { localStorage.setItem(key, val); } catch (_) {} },
    };

    /* ════════════════════════════════════════════════════════════════════════
     * 2. CONFIG & CONSTANTS
     * ════════════════════════════════════════════════════════════════════════ */
    const C = {
        // TWSE-compatible storage keys (so migration is seamless)
        KEY_API:        'xentac-torn_war_stuff_enhanced-apikey',
        KEY_HOSP_FIRST: 'xentac-torn_war_stuff_enhanced-hosp-first',
        KEY_FFS:        'wt:ffscouter-key',
        CACHE_PREFIX:   'wt:status-cache:',

        FFS_ENDPOINT:   'https://ffscouter.com/api/v1/get-stats',
        FFS_POLL:       120_000,  // FFScouter caches ~5min; refreshing every 2min is plenty
        FFS_TTL:        330_000,  // treat a fetched estimate as usable for ~5.5 min

        // Timings (ms)
        POLL_ACTIVE:    12_000,   // API poll cadence while tab is focused
        POLL_HIDDEN:    45_000,   // slower poll when tab is in background
        TICK_CLOCK:     1_000,    // live countdown repaint
        TICK_RECONCILE: 600,      // DOM reconcile (re-find rows, re-apply state)
        CACHE_TTL:      11_000,   // status cache lifetime
        API_BACKOFF:    30_000,   // wait after a soft API error

        // Sort buckets (lower = higher in list when ascending)
        SORT: { DIFFERS: 0, OKAY: 1, HOSPITAL: 2, RETURNING: 3, ABROAD: 4, TRAVEL_TO: 5, TRAVELING: 6, UNKNOWN: 99 },

        RED_THRESHOLD: 300,       // seconds; hospital timer turns red/highlight under this

        FATAL_API: new Set([1, 2, 6, 7, 10, 13, 16, 18, 21]),
        RETRY_API: new Set([5, 8, 9, 17]),

        COUNTRY_ABBR: {
            'United Arab Emirates': 'UAE', 'South Africa': 'SA', 'Cayman Islands': 'Cayman',
            'United Kingdom': 'UK', 'Argentina': 'Arg', 'Switzerland': 'Switz',
            'China': 'China', 'Japan': 'Japan', 'Mexico': 'Mexico', 'Canada': 'Canada',
            'Hawaii': 'Hawaii',
        },

        // DOM attributes we stamp on rows
        ATTR: {
            PID: 'data-wt-pid', UNTIL: 'data-wt-until', SINCE: 'data-wt-since',
            SORT: 'data-wt-sort', LOC: 'data-wt-loc', STATE: 'data-wt-state',
        },
    };

    /* ════════════════════════════════════════════════════════════════════════
     * 3. APPLICATION STATE
     * Everything mutable lives here, so behavior is easy to trace and reset.
     * ════════════════════════════════════════════════════════════════════════ */
    const state = {
        apiKey: Store.rawGet(C.KEY_API) || '',
        ffsKey: Store.get('ffscouter-key', '') || '',
        hospFirst: Store.rawGet(C.KEY_HOSP_FIRST) !== 'false',  // default ON
        running: true,
        warFound: false,
        everManualSort: false,
        lastPollAt: 0,
        nextPollAllowedAt: 0,
        nextFfsAllowedAt: 0,
        members: new Map(),   // pid -> { state, until, since, description, lastSeen }
        ffs: new Map(),       // pid -> { estHuman, ff, fetchedAt }
        rows: new Map(),      // pid -> { li, statusDiv, countdownEl }
        settings: {
            templates:        Store.get('templates', null) || defaultTemplates(),
            lastTemplate:     Store.get('lastTemplate', 0),
            offsetSeconds:    Store.get('offsetSeconds', 0),
            defaultMode:      Store.get('defaultMode', 'remaining'),
            calloutOnOwn:     Store.get('calloutOnOwn', false),
            quickCallBtn:     Store.get('quickCallBtn', true),
            calloutStates:    Store.get('calloutStates', { hosp: true, okay: true, traveling: false }),
            colorCountdowns:  Store.get('colorCountdowns', true),
            showStatsInline:  Store.get('showStatsInline', false),
            hideOffline:      Store.get('hideOffline', false),
            hideIdle:         Store.get('hideIdle', false),
            hideOnline:       Store.get('hideOnline', false),
            keepHospVisible:  Store.get('keepHospVisible', false),
            massFilter:       Store.get('massFilter', 'all'),
            massOnline:       Store.get('massOnline', 'any'),
            massLimit:        Store.get('massLimit', 0),
            massFFCap:        Store.get('massFFCap', false),
            massFFVal:        Store.get('massFFVal', 2),
            massHospU:        Store.get('massHospU', false),
            massHospUMin:     Store.get('massHospUMin', 15),
            massRespWar:      Store.get('massRespWar', true),
            massRespOverseas: Store.get('massRespOverseas', false),
            massPresets:      Store.get('massPresets', []),
            massLineFormats:  Store.get('massLineFormats', []),
            massSort:         Store.get('massSort', 'hosp_asc'),
            massLineTpl:      Store.get('massLineTpl', '{name} — {time} (FF {ff})'),
            massShowHeader:   Store.get('massShowHeader', true),
            massHeader:       Store.get('massHeader', '🎯 Targets:'),
            massNumber:       Store.get('massNumber', true),
        },
    };

    function defaultTemplates() {
        return [
            { name: 'Call X in Y',         body: 'Call on {name} in {time}' },
            { name: 'X out in Y',          body: '{name} out in {time}' },
            { name: 'X out + stats/FF',    body: '{name} out in {time} (~{stats}, FF {ff})' },
            { name: 'X out + FF',          body: '{name} out in {time} — FF {ff}' },
            { name: 'X + attack link',     body: '{name} out in {time} → https://www.torn.com/loader.php?sid=attack&user2ID={id}' },
            { name: 'X available in Y',    body: '{name} is available in {time}' },
            { name: 'X out NOW',           body: '{name} is out now — go go go' },
            { name: 'X out at HH:MM',      body: '{name} out at {clock} TCT' },
            { name: 'Soft on X (Y left)',  body: 'Soft target: {name} ({time} left)' },
        ];
    }
    function saveSetting(key, val) {
        state.settings[key] = val;
        Store.set(key, val);
    }

    // ── Mass-callout presets ─────────────────────────────────────────────────
    // A preset is a full snapshot of the mass-callout configuration. Built-ins
    // encode common war intents with plain-language names so they're useful the
    // moment you open the panel. The `cfg` object mirrors the panel controls.
    // `builtin: true` presets can't be deleted (but you can save a tweaked copy).
    function defaultMassPresets() {
        return [
            {
                name: '🏥 Hosp — soonest out',
                builtin: true,
                cfg: { filter: 'hosp', sort: 'hosp_asc', online: 'any', limit: 0,
                       ffCap: false, ffVal: 2, hospU: false, hospUMin: 15,
                       line: '{name} — {time}', header: true, headText: '🏥 Coming out:', number: true },
            },
            {
                name: '⏰ Out within 5 min',
                builtin: true,
                cfg: { filter: 'hosp', sort: 'hosp_asc', online: 'any', limit: 0,
                       ffCap: false, ffVal: 2, hospU: true, hospUMin: 5,
                       line: '{name} — {time}', header: true, headText: '⏰ Out in 5:', number: true },
            },
            {
                name: '🎯 Soft & online (FF≤2)',
                builtin: true,
                cfg: { filter: 'okay', sort: 'ff_asc', online: 'online', limit: 0,
                       ffCap: true, ffVal: 2, hospU: false, hospUMin: 15,
                       line: '{name} — FF {ff} (~{stats})', header: true, headText: '🎯 Hit now:', number: true },
            },
            {
                name: '✅ Attackable now',
                builtin: true,
                cfg: { filter: 'okay', sort: 'ff_asc', online: 'any', limit: 0,
                       ffCap: false, ffVal: 2, hospU: false, hospUMin: 15,
                       line: '{name} — FF {ff}', header: true, headText: '✅ Available:', number: true },
            },
            {
                name: '💤 Offline hosp targets',
                builtin: true,
                cfg: { filter: 'hosp', sort: 'hosp_asc', online: 'offline', limit: 0,
                       ffCap: false, ffVal: 2, hospU: false, hospUMin: 15,
                       line: '{name} — {time}', header: true, headText: '💤 Sleeping in hosp:', number: true },
            },
            {
                name: '📋 Everyone + timers',
                builtin: true,
                cfg: { filter: 'all', sort: 'hosp_asc', online: 'any', limit: 0,
                       ffCap: false, ffVal: 2, hospU: false, hospUMin: 15,
                       line: '{name} — {time} (FF {ff})', header: true, headText: '🎯 Targets:', number: true },
            },
        ];
    }
    // Merge built-ins (always present, by name) with the user's saved customs.
    function allMassPresets() {
        const custom = state.settings.massPresets || [];
        const builtinNames = new Set(defaultMassPresets().map(p => p.name));
        const cleanCustom = custom.filter(p => p && p.name && !builtinNames.has(p.name));
        return [...defaultMassPresets(), ...cleanCustom];
    }

    // Line-format presets: just the per-player line wording. Quick way to swap
    // the format without retyping placeholders. Customs append below built-ins.
    function defaultLineFormats() {
        return [
            { name: 'Name + timer',           body: '{name} — {time}' },
            { name: 'Name + timer + FF',      body: '{name} — {time} (FF {ff})' },
            { name: 'Name + timer + stats',   body: '{name} — {time} (~{stats})' },
            { name: 'Name + timer + both',    body: '{name} — {time} (~{stats}, FF {ff})' },
            { name: 'Name + release clock',   body: '{name} out at {clock} TCT' },
            { name: 'Name + FF only',         body: '{name} — FF {ff}' },
            { name: 'Name + respect est',     body: '{name} — {time} (~{respect} RP)' },
            { name: 'Name + FF + respect',    body: '{name} — FF {ff}, ~{respect} RP' },
            { name: 'Profile link (clickable)', body: '{name} ({time}) https://www.torn.com/profiles.php?XID={id}' },
            { name: 'Attack link (clickable)',  body: '{name} ({time}) https://www.torn.com/loader.php?sid=attack&user2ID={id}' },
            { name: 'Attack link + FF',         body: '{name} FF {ff} https://www.torn.com/loader.php?sid=attack&user2ID={id}' },
            { name: 'Compact',                body: '{name} {time}' },
        ];
    }
    function allLineFormats() {
        const custom = state.settings.massLineFormats || [];
        const builtinBodies = new Set(defaultLineFormats().map(f => f.body));
        const cleanCustom = custom.filter(f => f && f.body && !builtinBodies.has(f.body));
        return [...defaultLineFormats(), ...cleanCustom];
    }

    // One-time migration: if the user already has saved templates but none of
    // them use {ff}, append the FF-aware defaults so the feature is discoverable
    // without forcing a full reset (which would wipe their customs).
    (function migrateFFTemplates() {
        if (Store.get('mig_ff_templates', false)) return;
        const tpls = state.settings.templates || [];
        const hasFF = tpls.some(t => /\{ff\}/.test(t.body || ''));
        if (!hasFF) {
            tpls.push({ name: 'X out + stats/FF', body: '{name} out in {time} (~{stats}, FF {ff})' });
            tpls.push({ name: 'X out + FF',       body: '{name} out in {time} — FF {ff}' });
            state.settings.templates = tpls;
            Store.set('templates', tpls);
        }
        Store.set('mig_ff_templates', true);
    })();

    // One-time migration: a prior build briefly stripped FF from the mass-callout
    // line. If the saved line is the bare name+timer default, restore the
    // FF-bearing default. (Skips genuinely custom lines.)
    (function restoreMassLineFF() {
        if (Store.get('mig_mass_line_v3', false)) return;
        const cur = state.settings.massLineTpl || '';
        if (cur === '{name} — {time}') {
            state.settings.massLineTpl = '{name} — {time} (FF {ff})';
            Store.set('massLineTpl', state.settings.massLineTpl);
        }
        Store.set('mig_mass_line_v3', true);
    })();

    /* ════════════════════════════════════════════════════════════════════════
     * 4. TIME UTILITIES
     * Single source of truth for "now" so countdowns and callout math agree.
     * Torn exposes a server-synced clock via window.getCurrentTimestamp() on
     * many pages; we use it when present for sub-second accuracy.
     * ════════════════════════════════════════════════════════════════════════ */
    const Time = {
        nowSec() {
            try { if (typeof unsafeWindow !== 'undefined' && unsafeWindow.getCurrentTimestamp) return unsafeWindow.getCurrentTimestamp() / 1000; } catch (_) {}
            try { if (window.getCurrentTimestamp) return window.getCurrentTimestamp() / 1000; } catch (_) {}
            return Date.now() / 1000;
        },
        pad(n) { return n < 10 ? '0' + n : '' + n; },
        hms(totalSec) {
            totalSec = Math.max(0, Math.round(totalSec));
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            const s = totalSec % 60;
            return `${Time.pad(h)}:${Time.pad(m)}:${Time.pad(s)}`;
        },
        // Human-friendly: "5m 12s", "1h 23m", "47s"
        human(totalSec) {
            totalSec = Math.max(0, Math.round(totalSec));
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            const s = totalSec % 60;
            if (h > 0) return `${h}h ${Time.pad(m)}m`;
            if (m > 0) return s === 0 ? `${m}m` : `${m}m ${Time.pad(s)}s`;
            return `${s}s`;
        },
        clockTCT(unixSec) {
            const d = new Date(unixSec * 1000);
            return Time.pad(d.getUTCHours()) + ':' + Time.pad(d.getUTCMinutes());
        },
    };

    /* ════════════════════════════════════════════════════════════════════════
     * 5. DOM HELPERS
     * ════════════════════════════════════════════════════════════════════════ */
    const $  = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const el = (tag, props = {}, ...kids) => {
        const node = document.createElement(tag);
        for (const [k, v] of Object.entries(props)) {
            if (k === 'class') node.className = v;
            else if (k === 'style') node.style.cssText = v;
            else if (k === 'html') node.innerHTML = v;
            else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
            else node.setAttribute(k, v);
        }
        for (const kid of kids) if (kid != null) node.append(kid.nodeType ? kid : document.createTextNode(kid));
        return node;
    };
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    /* ════════════════════════════════════════════════════════════════════════
     * 6. HTTP TRANSPORT
     * GM_xmlhttpRequest is used as the primary path so requests bypass any
     * page-level fetch/XHR interception (TornTools) and work on TornPDA. Falls
     * back to fetch() if no GM HTTP API is granted.
     * ════════════════════════════════════════════════════════════════════════ */
    function httpGetJSON(url) {
        return new Promise((resolve, reject) => {
            const gmReq = (typeof GM_xmlhttpRequest === 'function') ? GM_xmlhttpRequest
                        : (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest : null;
            if (gmReq) {
                gmReq({
                    method: 'GET', url, timeout: 15000,
                    onload: (r) => {
                        try {
                            resolve(JSON.parse(r.responseText));
                        } catch (e) {
                            // Non-JSON body (HTML error page, 403, etc.) — surface status + snippet
                            reject(new Error(`HTTP ${r.status} non-JSON: ${String(r.responseText || '').slice(0, 120)}`));
                        }
                    },
                    onerror: (r) => reject(new Error(`network error (status ${r && r.status})`)),
                    ontimeout: () => reject(new Error('timeout')),
                });
            } else {
                fetch(url).then(async (r) => {
                    const txt = await r.text();
                    try { return JSON.parse(txt); }
                    catch (e) { throw new Error(`HTTP ${r.status} non-JSON: ${txt.slice(0, 120)}`); }
                }).then(resolve).catch(reject);
            }
        });
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 7. API KEY MANAGEMENT
     * ════════════════════════════════════════════════════════════════════════ */
    function apiKeyValid(k) { return !!k && k.length === 16 && !k.includes('PDA-APIKEY'); }
    function promptApiKey() {
        const input = prompt('Torn War Tools needs a PUBLIC API key (16 chars) to read faction status:', state.apiKey || '');
        if (input && input.trim().length === 16) {
            state.apiKey = input.trim();
            Store.rawSet(C.KEY_API, state.apiKey);
            state.nextPollAllowedAt = 0;
            poll();
            return true;
        }
        return false;
    }
    try { GM_registerMenuCommand('Set Torn API Key', () => promptApiKey()); } catch (_) {}

    /* ════════════════════════════════════════════════════════════════════════
     * 8. FACTION / MEMBER DISCOVERY
     * ════════════════════════════════════════════════════════════════════════ */
    function getMemberLists() { return $$('ul.members-list'); }

    function getFactionIds() {
        const ids = new Set();
        for (const ul of getMemberLists()) {
            const link = ul.parentNode?.querySelector("a[href*='factions.php']");
            const m = link?.href.match(/ID=(\d+)/);
            if (m) ids.add(m[1]);
        }
        return [...ids];
    }

    // Map every visible enemy/your row by player id and cache its status div.
    function indexRows() {
        let changed = false;
        const seen = new Set();
        for (const ul of getMemberLists()) {
            for (const li of ul.querySelectorAll('li.enemy, li.your, li[class*="enemy"], li[class*="your"]')) {
                const profile = li.querySelector("a[href*='profiles.php']");
                const pid = profile?.href.match(/(?:XID=|user2ID=|ID=)(\d+)/)?.[1];
                if (!pid) continue;
                seen.add(pid);
                if (li.getAttribute(C.ATTR.PID) !== pid) li.setAttribute(C.ATTR.PID, pid);
                const prev = state.rows.get(pid);
                if (!prev || prev.li !== li) {
                    state.rows.set(pid, { li, statusDiv: li.querySelector('div.status'), countdownEl: null });
                    changed = true;
                }
            }
        }
        for (const pid of [...state.rows.keys()]) {
            if (!seen.has(pid)) { state.rows.delete(pid); changed = true; }
        }
        return changed;
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 9. STATUS CACHE (smooths over poll gaps & page nav)
     * ════════════════════════════════════════════════════════════════════════ */
    function cacheWrite(fid, map) {
        try { localStorage.setItem(C.CACHE_PREFIX + fid, JSON.stringify({ t: Date.now(), m: map })); } catch (_) {}
    }
    function cacheRead(fid) {
        try {
            const raw = localStorage.getItem(C.CACHE_PREFIX + fid);
            if (!raw) return null;
            const p = JSON.parse(raw);
            return (Date.now() - p.t > C.CACHE_TTL) ? null : p.m;
        } catch (_) { return null; }
    }
    function hydrateFromCache() {
        for (const fid of getFactionIds()) {
            const c = cacheRead(fid);
            if (c) for (const [pid, s] of Object.entries(c)) state.members.set(pid, s);
        }
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 10. API POLL
     * One call per faction to v1 /faction/{id}?selections=basic — the cheapest
     * way to get every member's status block. Adaptive cadence + error handling.
     * ════════════════════════════════════════════════════════════════════════ */
    function abbreviate(desc) {
        let out = desc || '';
        for (const [full, abbr] of Object.entries(C.COUNTRY_ABBR)) out = out.replace(full, abbr);
        return out;
    }

    async function poll() {
        if (!state.running || !state.warFound) return;
        if (!apiKeyValid(state.apiKey)) { promptApiKey(); return; }
        const now = Date.now();
        if (now < state.nextPollAllowedAt) return;
        state.lastPollAt = now;

        const fids = getFactionIds();
        for (const fid of fids) {
            let data;
            try {
                data = await httpGetJSON(`https://api.torn.com/faction/${fid}?selections=basic&key=${state.apiKey}&comment=TornWarTools`);
            } catch (e) { LOG('request failed', e.message); continue; }

            if (data.error) {
                const code = data.error.code ?? data.error;
                LOG('API error', code, data.error.error || '');
                if (C.FATAL_API.has(code)) { state.running = false; Toast.show('⚠ API key rejected — open ⚙ to re-enter'); return; }
                if (C.RETRY_API.has(code)) state.nextPollAllowedAt = now + C.API_BACKOFF;
                continue;
            }
            if (!data.members) continue;

            const reqTime = Math.floor(Time.nowSec());
            const fmap = {};
            for (const [pid, member] of Object.entries(data.members)) {
                const s = member.status || {};
                const prev = state.members.get(pid);
                const rec = {
                    state: s.state || 'Unknown',
                    until: s.until || 0,
                    description: abbreviate(s.description || ''),
                    since: (prev && prev.state === s.state) ? prev.since : reqTime,
                    lastSeen: reqTime,
                };
                state.members.set(pid, rec);
                fmap[pid] = rec;
            }
            cacheWrite(fid, fmap);
        }
        // schedule next
        state.nextPollAllowedAt = Date.now() + (document.hidden ? C.POLL_HIDDEN : C.POLL_ACTIVE);
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 10b. FFSCOUTER POLL
     * Bulk-fetches battle-stat estimates + fair-fight scores for every visible
     * ENEMY player in one request (get-stats supports up to 205 IDs). Results
     * feed the {stats} and {ff} callout placeholders and the optional inline
     * stats badge. Skipped entirely if no FFScouter key is set.
     * ════════════════════════════════════════════════════════════════════════ */
    function ffsKeyValid(k) { return !!k && /^[A-Za-z0-9]{16}$/.test(k); }

    // Pull the list of result records out of whatever shape FFScouter returns.
    // Known/likely shapes: a bare array, { results: [...] }, { data: [...] },
    // or an object keyed by player id { "12345": {...} }.
    function ffsExtractRecords(data) {
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.results)) return data.results;
        if (data && Array.isArray(data.data)) return data.data;
        if (data && typeof data === 'object') {
            // object keyed by id? collect values that look like records
            const vals = Object.values(data).filter(v => v && typeof v === 'object' && (v.player_id != null || v.fair_fight != null || v.bs_estimate_human != null));
            if (vals.length) return vals;
        }
        return [];
    }

    // Read a record's player id / estimate / fair-fight across field-name variants.
    function ffsReadRecord(r) {
        const pid = r.player_id ?? r.playerId ?? r.id ?? r.user_id ?? null;
        const est = r.bs_estimate_human ?? r.bs_estimate ?? r.estimate_human ?? r.estimate ?? null;
        let ff = r.fair_fight ?? r.fairfight ?? r.ff ?? null;
        if (typeof ff === 'string') { const n = parseFloat(ff); ff = Number.isFinite(n) ? n : null; }
        return { pid: pid == null ? null : String(pid), est: est != null ? String(est) : null, ff: (typeof ff === 'number') ? ff : null };
    }

    let _ffsDiagShown = false;
    async function pollFFScouter() {
        if (!state.warFound || !ffsKeyValid(state.ffsKey)) return;
        const now = Date.now();
        if (now < state.nextFfsAllowedAt) return;

        const ids = [];
        for (const [pid, row] of state.rows) {
            if (!isOwnFaction(row.li)) ids.push(pid);
        }
        if (!ids.length) return;
        state.nextFfsAllowedAt = now + C.FFS_POLL;

        for (let i = 0; i < ids.length; i += 200) {
            const chunk = ids.slice(i, i + 200);
            const url = `${C.FFS_ENDPOINT}?key=${state.ffsKey}&targets=${chunk.join(',')}&comment=TornWarTools`;
            let data;
            try {
                data = await httpGetJSON(url);
            } catch (e) { LOG('FFScouter request FAILED', e.message, '\n  url:', url.replace(state.ffsKey, '***')); continue; }

            // Error envelope (FFScouter returns { error, code } or { message })
            if (data && (data.error || data.code) && !Array.isArray(data) && !data.results && !data.data) {
                const code = data.code ?? '?';
                const msg = data.error ?? data.message ?? JSON.stringify(data);
                LOG('FFScouter API error — code', code, '·', msg);
                state.ffsLastError = `${code}: ${msg}`;
                if ([1, 2, 6, 7].includes(code) || /key/i.test(String(msg))) {
                    Toast.show('⚠ FFScouter key issue: ' + msg);
                }
                return;
            }

            const records = ffsExtractRecords(data);

            // One-time diagnostic so we can SEE the real shape on the live device.
            if (!_ffsDiagShown) {
                _ffsDiagShown = true;
                LOG('FFScouter response OK. records:', records.length,
                    '\n  sample:', records[0] ? JSON.stringify(records[0]) : '(none)',
                    '\n  top-level keys:', data && typeof data === 'object' ? Object.keys(data).slice(0, 8) : typeof data);
            }

            const t = Math.floor(Time.nowSec());
            let stored = 0;
            for (const r of records) {
                const rec = ffsReadRecord(r);
                if (rec.pid == null) continue;
                state.ffs.set(rec.pid, { estHuman: rec.est, ff: rec.ff, fetchedAt: t });
                stored++;
            }
            state.ffsLastError = stored ? null : (state.ffsLastError || 'response had no usable records');
        }
    }

    // Format a player's FFScouter data for display: "~1.2m · FF 2.4"
    function ffsLabel(pid) {
        const d = state.ffs.get(String(pid));
        if (!d) return '';
        const parts = [];
        if (d.estHuman) parts.push('~' + d.estHuman);
        if (d.ff != null) parts.push('FF ' + d.ff.toFixed(2));
        return parts.join(' · ');
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 11. ROW RENDERING
     * Instead of TWSE's CSS ::after trick, we render the countdown into a real
     * <span> we own. This eliminates all the z-index/pointer-events/overflow
     * gymnastics the callout button needed, and lets us color/position freely.
     * ════════════════════════════════════════════════════════════════════════ */
    function classifyTraveling(desc) {
        if (desc.includes('Traveling to ')) return { bucket: C.SORT.TRAVEL_TO, label: '► ' + desc.split('Traveling to ')[1], loc: desc.split('Traveling to ')[1] };
        if (desc.includes('Returning'))     return { bucket: C.SORT.RETURNING, label: '◄ ' + (desc.split('Returning to Torn from ')[1] || 'Torn'), loc: desc.split('Returning to Torn from ')[1] || '' };
        if (desc.includes('In '))           return { bucket: C.SORT.ABROAD, label: desc.split('In ')[1], loc: desc.split('In ')[1] };
        return { bucket: C.SORT.TRAVELING, label: 'Traveling', loc: '' };
    }

    // Hide Torn's own status content (element children + bare text nodes) so
    // only our countdown shows. Stash originals so we can restore on "Okay".
    function hideNativeStatus(statusDiv) {
        for (const node of [...statusDiv.childNodes]) {
            if (node.nodeType === Node.TEXT_NODE) {
                if (node.textContent.trim()) { node.__wtText = node.textContent; node.textContent = ''; }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (!node.classList.contains('wt-countdown') && !node.classList.contains('wt-callout') && !node.classList.contains('wt-stats')) {
                    node.dataset.wtHidden = '1';
                }
            }
        }
    }
    function restoreNativeStatus(statusDiv) {
        for (const node of [...statusDiv.childNodes]) {
            if (node.nodeType === Node.TEXT_NODE && node.__wtText != null) { node.textContent = node.__wtText; delete node.__wtText; }
            else if (node.nodeType === Node.ELEMENT_NODE && node.dataset && node.dataset.wtHidden) delete node.dataset.wtHidden;
        }
    }

    function ensureCountdownEl(row) {
        if (row.countdownEl && row.countdownEl.isConnected) return row.countdownEl;
        const span = el('span', { class: 'wt-countdown' });
        row.statusDiv.appendChild(span);
        row.countdownEl = span;
        return span;
    }

    function paintRow(pid, rec) {
        const row = state.rows.get(pid);
        if (!row || !row.li.isConnected) return;
        const { li, statusDiv } = row;
        if (!statusDiv) return;

        const nowSec = Time.nowSec();
        const remaining = Math.round((rec.until || 0) - nowSec);

        li.setAttribute(C.ATTR.UNTIL, rec.until || 0);
        li.setAttribute(C.ATTR.SINCE, rec.since || 0);
        li.setAttribute(C.ATTR.STATE, rec.state);

        let bucket = C.SORT.OKAY, loc = '', highlight = false;
        const manage = (rec.state === 'Hospital' || rec.state === 'Jail' || rec.state === 'Traveling' || rec.state === 'Abroad');

        if (manage) {
            statusDiv.classList.add('wt-managed');
            hideNativeStatus(statusDiv);
        } else {
            statusDiv.classList.remove('wt-managed');
            restoreNativeStatus(statusDiv);
        }

        if (rec.state === 'Hospital' || rec.state === 'Jail') {
            bucket = C.SORT.HOSPITAL;
            if (remaining > 0) {
                const cd = ensureCountdownEl(row);
                cd.textContent = Time.hms(remaining);
                cd.dataset.kind = remaining < C.RED_THRESHOLD ? 'urgent' : 'hosp';
                highlight = remaining < C.RED_THRESHOLD;
                if (rec.state === 'Hospital' && calloutAllowedFor('hosp')) ensureCallout(pid, row);
                else removeCallout(row);
            } else {
                clearCountdown(row);
                removeCallout(row);
            }
        } else if (rec.state === 'Traveling' || rec.state === 'Abroad') {
            const t = classifyTraveling(rec.description);
            bucket = t.bucket; loc = t.loc;
            const cd = ensureCountdownEl(row);
            cd.textContent = t.label;
            cd.dataset.kind = 'travel';
            if (calloutAllowedFor('traveling')) ensureCallout(pid, row); else removeCallout(row);
        } else { // Okay / Unknown — let Torn's native text show
            bucket = C.SORT.OKAY;
            clearCountdown(row);
            if (calloutAllowedFor('okay')) ensureCallout(pid, row); else removeCallout(row);
        }

        li.setAttribute(C.ATTR.SORT, bucket);
        li.setAttribute(C.ATTR.LOC, loc);
        li.classList.toggle('wt-highlight', highlight);
        updateInlineStats(pid, row);
    }

    function clearCountdown(row) {
        if (row.countdownEl) { row.countdownEl.remove(); row.countdownEl = null; }
    }

    // Optional inline stat badge on enemy rows. Rendered in the SCORE column
    // (roomy) rather than the cramped status/timer cell, so it never collides
    // with the countdown or the callout buttons.
    function updateInlineStats(pid, row) {
        // Always clean up any stray badge from the old status-cell location.
        const oldInStatus = row.statusDiv?.querySelector('.wt-stats');
        if (oldInStatus) oldInStatus.remove();

        const scoreCell = row.li.querySelector('div.points, [class*="points"]');
        const existing = scoreCell ? scoreCell.querySelector('.wt-stats') : row.li.querySelector('.wt-stats');

        if (!state.settings.showStatsInline || isOwnFaction(row.li)) {
            if (existing) existing.remove();
            return;
        }
        const label = ffsLabel(pid);
        if (!label) { if (existing) existing.remove(); return; }
        if (!scoreCell) return; // no obvious home; skip rather than crowd status

        let badge = existing;
        if (!badge) {
            badge = el('span', { class: 'wt-stats' });
            scoreCell.appendChild(badge);
        }
        badge.textContent = label;
    }

    // Repaint just the countdown text every second (cheap; no re-classify).
    function tickCountdowns() {
        const nowSec = Time.nowSec();
        for (const [pid, rec] of state.members) {
            if (rec.state !== 'Hospital' && rec.state !== 'Jail') continue;
            const row = state.rows.get(pid);
            if (!row || !row.countdownEl) continue;
            const remaining = Math.round((rec.until || 0) - nowSec);
            if (remaining <= 0) { paintRow(pid, rec); continue; } // flip handling
            row.countdownEl.textContent = Time.hms(remaining);
            const urgent = remaining < C.RED_THRESHOLD;
            row.countdownEl.dataset.kind = urgent ? 'urgent' : 'hosp';
            row.li.classList.toggle('wt-highlight', urgent);
        }
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 12. SORTING
     * Hospital-first (by soonest release) when enabled; otherwise a full status
     * sort matching the column the user clicked. DocumentFragment keeps it to a
     * single reflow, and we suspend our own observer during the swap.
     * ════════════════════════════════════════════════════════════════════════ */
    const num = (li, attr) => { const v = parseInt(li.getAttribute(attr), 10); return Number.isFinite(v) ? v : 0; };

    function compareFull(a, b, desc) {
        const as = li => li.hasAttribute(C.ATTR.SORT) ? num(li, C.ATTR.SORT) : C.SORT.UNKNOWN;
        const av = as(a), bv = as(b);
        if (av !== bv) return desc ? bv - av : av - bv;
        if (av === C.SORT.HOSPITAL) { const c = num(a, C.ATTR.UNTIL) - num(b, C.ATTR.UNTIL); if (c) return c; }
        else { const c = num(b, C.ATTR.SINCE) - num(a, C.ATTR.SINCE); if (c) return c; }
        return num(a, C.ATTR.PID) - num(b, C.ATTR.PID);
    }

    function sortAll() {
        for (const ul of getMemberLists()) {
            const kids = [...ul.children];
            let sorted;
            if (state.hospFirst) {
                const hosp = [], rest = [];
                for (const li of kids) (li.getAttribute(C.ATTR.SORT) === String(C.SORT.HOSPITAL) ? hosp : rest).push(li);
                hosp.sort((a, b) => (num(a, C.ATTR.UNTIL) - num(b, C.ATTR.UNTIL)) || (num(a, C.ATTR.PID) - num(b, C.ATTR.PID)));
                sorted = [...hosp, ...rest];
            } else {
                sorted = kids.slice().sort((a, b) => compareFull(a, b, false));
            }
            let same = true;
            for (let i = 0; i < sorted.length; i++) if (ul.children[i] !== sorted[i]) { same = false; break; }
            if (same) continue;
            suspendObserver(ul);
            const frag = document.createDocumentFragment();
            sorted.forEach(li => frag.appendChild(li));
            ul.appendChild(frag);
            resumeObserver(ul);
        }
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 13. CALLOUT BUTTON
     * Real DOM element placed in the status-column gutter. Enemy-only unless the
     * user opts in. Click → modal.
     * ════════════════════════════════════════════════════════════════════════ */
    function isOwnFaction(li) { return li.classList.contains('your') || /\byour\b/.test(li.className) || /your___/.test(li.className); }

    // Read a row's online state. Torn marks the avatar wrapper link with one of
    // the gradient-dot classes online___ / idle___ / offline___ (hash-suffixed).
    // We read the class tokens of the avatar link specifically and look for the
    // FIRST token that starts with one of those prefixes — this avoids matching
    // unrelated sprite icons elsewhere in the row.
    function classifyStateToken(className) {
        const tokens = (className || '').split(/\s+/);
        for (const tok of tokens) {
            if (tok.startsWith('online___'))  return 'online';
            if (tok.startsWith('idle___'))    return 'idle';
            if (tok.startsWith('offline___')) return 'offline';
        }
        return null;
    }

    function onlineState(li) {
        // 1) The avatar link is the authoritative carrier.
        const avatar = li.querySelector('a[data-label="avatar"]');
        if (avatar) {
            const s = classifyStateToken(avatar.className);
            if (s) return s;
        }
        // 2) Search within the row for any element whose class TOKEN is a state.
        for (const node of li.querySelectorAll('[class*="online___"], [class*="idle___"], [class*="offline___"]')) {
            const s = classifyStateToken(node.className);
            if (s) return s;
        }
        // 3) Some virtual-scroll layouts render the indicator in a wrapper that
        //    is a sibling/ancestor of the content rather than a child of the
        //    <li>. Climb up to the nearest row-ish container and search there,
        //    but stay scoped to this one row (don't bleed into siblings).
        const container = li.closest('[class*="root___"]') || li.parentElement;
        if (container && container !== li) {
            const a2 = container.querySelector('a[data-label="avatar"]');
            if (a2) { const s = classifyStateToken(a2.className); if (s) return s; }
        }
        return null;
    }

    // One-time diagnostic: dump the structure of the first enemy row so we can
    // see exactly where (if anywhere) the online indicator lives on this device.
    let _debugDumped = false;
    function debugDumpRow() {
        if (_debugDumped) return;
        for (const [pid, row] of state.rows) {
            if (isOwnFaction(row.li)) continue;
            _debugDumped = true;
            const av = row.li.querySelector('a[data-label="avatar"]');
            LOG('DEBUG row pid', pid,
                '\n  state detected:', onlineState(row.li),
                '\n  avatar class:', av ? av.className : '(no avatar link)',
                '\n  li class:', row.li.className);
            const dots = row.li.querySelectorAll('[class*="online___"],[class*="idle___"],[class*="offline___"]');
            LOG('  state-class elements in row:', dots.length,
                [...dots].map(d => d.tagName + '.' + d.className).slice(0, 5));
            break;
        }
    }

    // Hide/show a row based on the offline/idle hide settings. Only ever hides
    // ENEMY rows (you always want to see your own faction). Never hides a row
    // that's currently in hospital with a live timer — that's the whole point
    // of a callout, even if they're idle/offline.
    function applyRowVisibility(pid, rec) {
        const row = state.rows.get(pid);
        if (!row || !row.li.isConnected) return;
        const S = state.settings;
        if (!S.hideOffline && !S.hideIdle && !S.hideOnline) { row.li.classList.remove('wt-hidden-row'); return; }
        if (isOwnFaction(row.li)) { row.li.classList.remove('wt-hidden-row'); return; }

        const st = onlineState(row.li);
        let hide = false;
        if (S.hideOffline && st === 'offline') hide = true;
        if (S.hideIdle && st === 'idle') hide = true;
        if (S.hideOnline && st === 'online') hide = true;

        row.li.classList.toggle('wt-hidden-row', hide);
    }

    // Which player states get callout buttons. Controlled by settings.calloutStates,
    // a set like {hosp:true, okay:true, traveling:false}.
    function calloutAllowedFor(stateKey) {
        const cs = state.settings.calloutStates || { hosp: true, okay: false, traveling: false };
        return !!cs[stateKey];
    }

    function ensureCallout(pid, row) {
        const { li, statusDiv } = row;
        if (!statusDiv) return;
        if (isOwnFaction(li) && !state.settings.calloutOnOwn) { removeCallout(row); return; }

        li.classList.add('wt-has-callout');

        // Host the buttons in the ATTACK column (rightmost), appended after the
        // Attack link so they sit to its right. Fall back to the status cell if
        // the attack cell can't be found.
        const host = li.querySelector('[class*="attack___"]') || li.querySelector('div.attack') || statusDiv;
        host.classList.add('wt-callout-host');

        const hasModal = host.querySelector('.wt-callout-modal');
        const hasQuick = host.querySelector('.wt-quick');

        // Quick-call (⚡): add if enabled & missing, remove if disabled & present.
        if (state.settings.quickCallBtn && !hasQuick) {
            const quick = el('a', {
                class: 'wt-callout wt-quick', href: 'javascript:void(0)',
                title: 'Quick call (last used template)',
                onclick: (e) => { e.preventDefault(); e.stopPropagation(); quickCallout(pid); },
            }, '⚡');
            host.appendChild(quick);
        } else if (!state.settings.quickCallBtn && hasQuick) {
            hasQuick.remove();
        }

        // Full callout (📢): the modal opener.
        if (!hasModal) {
            const btn = el('a', {
                class: 'wt-callout wt-callout-modal', href: 'javascript:void(0)',
                title: 'Send callout (open editor)',
                onclick: (e) => { e.preventDefault(); e.stopPropagation(); openCalloutModal(pid); },
            }, '📢');
            host.appendChild(btn);
        }
    }
    function removeCallout(row) {
        // Buttons may live in the attack cell or (fallback) the status cell.
        row.li.querySelectorAll('.wt-callout').forEach(b => b.remove());
        row.li.querySelectorAll('.wt-callout-host').forEach(h => h.classList.remove('wt-callout-host'));
        row.li.classList.remove('wt-has-callout');
    }

    function memberName(pid) {
        const row = state.rows.get(pid);
        const a = row?.li.querySelector("a[href*='profiles.php']");
        if (a) {
            const aria = a.getAttribute('aria-label') || '';
            const m = aria.match(/View profile of (.+)$/);
            if (m) return m[1].trim();
            const h = a.querySelector('.honor-text');
            if (h) return h.textContent.trim();
        }
        return 'Player ' + pid;
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 14. FACTION CHAT SEND
     * ════════════════════════════════════════════════════════════════════════ */
    function sendToFactionChat(text) {
        const cands = $$('textarea.tt-chat-autocomplete, .root___dCIzf textarea, textarea[placeholder*="Type your message"]');
        const ta = cands.find(t => t.offsetParent !== null) || cands[0];
        if (!ta) { Toast.show('⚠ Open the faction chat panel first'); return false; }

        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        setter ? setter.call(ta, text) : (ta.value = text);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        ta.focus();
        ['keydown', 'keypress', 'keyup'].forEach(type =>
            ta.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })));
        setTimeout(() => {
            if (ta.value) {
                const send = ta.parentElement?.querySelector('button.iconWrapper___SHmCW, button[type="button"]');
                if (send && !send.disabled) send.click();
            }
        }, 30);
        return true;
    }
    function copyText(text) {
        try { navigator.clipboard.writeText(text); return true; }
        catch (_) {
            try { const t = el('textarea', { style: 'position:fixed;opacity:0' }); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); return true; }
            catch (e) { return false; }
        }
    }

    function buildMessage(tpl, ctx) {
        return tpl.replace(/\{name\}/g, ctx.name).replace(/\{time\}/g, ctx.time)
                  .replace(/\{clock\}/g, ctx.clock).replace(/\{id\}/g, ctx.id)
                  .replace(/\{stats\}/g, ctx.stats).replace(/\{ff\}/g, ctx.ff)
                  .replace(/\{est\}/g, ctx.stats)   // {est} alias for {stats}
                  .replace(/\{level\}/g, ctx.level).replace(/\{respect\}/g, ctx.respect);
    }

    /* ── Respect calculator ──────────────────────────────────────────────────
     * Torn respect per attack (per the wiki, Chain > Fair fights):
     *   Respect = BaseRespect × FF × War × Overseas × Group × Chain
     *   BaseRespect scales linearly with DEFENDER level:
     *     level 1  → 1.00,  level 100 → 1.50   →  1 + (level-1) × (0.5/99)
     *   FF (1–3×)   comes from FFScouter per player.
     *   War 2×, Overseas 1.25× are optional toggles.
     * We surface the "EBR" (Expected Base Respect = Base × FF), matching common
     * war tools, then apply optional war/overseas multipliers the user picks.
     * ──────────────────────────────────────────────────────────────────────── */
    function baseRespectForLevel(level) {
        const lv = Math.max(1, Math.min(100, level || 1));
        return 1 + (lv - 1) * (0.5 / 99);
    }
    // Read the level shown in a member row (the Level column).
    function rowLevel(pid) {
        const row = state.rows.get(String(pid));
        if (!row) return null;
        const cell = row.li.querySelector('div.level, [class*="level"]');
        if (!cell) return null;
        const m = (cell.textContent || '').match(/\d+/);
        return m ? parseInt(m[0], 10) : null;
    }
    // Estimate respect for a player. opts: { war, overseas } booleans.
    function estimateRespect(pid, opts = {}) {
        const level = rowLevel(pid);
        const ffd = state.ffs.get(String(pid));
        const ff = ffd && ffd.ff != null ? ffd.ff : null;
        if (level == null || ff == null) return null;   // need both to be meaningful
        let r = baseRespectForLevel(level) * ff;
        if (opts.war) r *= 2;
        if (opts.overseas) r *= 1.25;
        return r;
    }
    function fmtRespect(r) {
        if (r == null) return '?';
        return r.toFixed(2);
    }


    // Build the callout text for a player using the CURRENTLY SAVED settings
    // (last template, last offset, last time-mode). Shared by the modal preview
    // path and the one-tap quick-call button so they always agree.
    function composeCallout(pid) {
        const S = state.settings;
        const rec = state.members.get(String(pid)) || {};
        const until = rec.until || 0;
        const tpl = S.templates[Math.min(S.lastTemplate, S.templates.length - 1)] || S.templates[0];
        const offSec = Math.round((S.offsetSeconds || 0));
        const nowSec = Time.nowSec();
        const mode = S.defaultMode === 'clock' ? 'remaining' : (S.defaultMode || 'remaining');
        const target = (mode === 'remaining' && until > 0) ? until + offSec : nowSec + offSec;
        const ffd = state.ffs.get(String(pid));
        const isHosp = (rec.state === 'Hospital' || rec.state === 'Jail') && until > nowSec;
        const timeStr = isHosp ? Time.human(target - nowSec) : (rec.state === 'Okay' ? 'OUT' : (rec.state || 'OUT'));
        return buildMessage(tpl.body, {
            name: memberName(pid), id: pid,
            time: timeStr,
            clock: isHosp ? Time.clockTCT(target) : '--:--',
            stats: ffd && ffd.estHuman ? ffd.estHuman : '?',
            ff: ffd && ffd.ff != null ? ffd.ff.toFixed(2) : '?',
            level: rowLevel(pid) ?? '?',
            respect: fmtRespect(estimateRespect(pid, { war: state.settings.massRespWar, overseas: state.settings.massRespOverseas })),
        });
    }

    // One-tap quick call: compose from saved settings and send immediately,
    // no modal. Used by the ⚡ button.
    function quickCallout(pid) {
        const text = composeCallout(pid);
        if (sendToFactionChat(text)) {
            Toast.show('⚡ ' + text.slice(0, 44) + (text.length > 44 ? '…' : ''));
        }
    }

    /* ════════════════════════════════════════════════════════════════════════
     * MASS CALLOUT
     * Compiles a multi-line target list for every (filtered) enemy, sortable by
     * FF, hospital time, stats, or name, and sends it to faction chat (chunked
     * to respect chat length limits).
     * ════════════════════════════════════════════════════════════════════════ */

    // Build a normalized data row for one player for the mass list.
    function massRowData(pid) {
        const rec = state.members.get(String(pid)) || {};
        const ffd = state.ffs.get(String(pid));
        const row = state.rows.get(String(pid));
        const nowSec = Time.nowSec();
        const until = rec.until || 0;
        const remaining = until > 0 ? Math.max(0, Math.round(until - nowSec)) : 0;
        const st = rec.state || 'Unknown';
        return {
            pid,
            name: memberName(pid),
            state: st,
            inHosp: (st === 'Hospital' || st === 'Jail') && remaining > 0,
            isOkay: st === 'Okay',
            isTraveling: st === 'Traveling' || st === 'Abroad',
            until, remaining,
            online: row ? onlineState(row.li) : null,   // 'online' | 'idle' | 'offline' | null
            ff: ffd && ffd.ff != null ? ffd.ff : null,
            est: ffd && ffd.estHuman ? ffd.estHuman : null,
            level: rowLevel(pid),
            respect: estimateRespect(pid, { war: state.settings.massRespWar, overseas: state.settings.massRespOverseas }),
        };
    }

    function gatherMassRows(opts) {
        // opts: { filter, onlineFilter, maxFFEnabled, maxFF, hospUnderEnabled, hospUnderMin }
        const rows = [];
        for (const [pid, row] of state.rows) {
            if (isOwnFaction(row.li)) continue;
            // Respect the offline/idle hide settings so the mass list matches what you see
            if (row.li.classList.contains('wt-hidden-row')) continue;
            const d = massRowData(pid);

            // Status filter
            if (opts.filter === 'hosp' && !d.inHosp) continue;
            if (opts.filter === 'out' && d.inHosp) continue;            // anyone not in hosp (okay/travel/etc)
            if (opts.filter === 'okay' && !d.isOkay) continue;          // strictly attackable now
            if (opts.filter === 'traveling' && !d.isTraveling) continue;

            // Online-state filter
            if (opts.onlineFilter === 'online' && d.online !== 'online') continue;
            if (opts.onlineFilter === 'idle_online' && !(d.online === 'online' || d.online === 'idle')) continue;
            if (opts.onlineFilter === 'offline' && d.online !== 'offline') continue;

            // FF ceiling (only keep targets at or below this FF; players with no
            // FF data are kept so you don't silently miss them)
            if (opts.maxFFEnabled && d.ff != null && d.ff > opts.maxFF) continue;

            // Hospital "out within N minutes" filter (only meaningful for hosp rows)
            if (opts.hospUnderEnabled) {
                if (!d.inHosp) continue;
                if (d.remaining > opts.hospUnderMin * 60) continue;
            }

            rows.push(d);
        }
        return rows;
    }

    function sortMassRows(rows, sortBy) {
        const byName = (a, b) => a.name.localeCompare(b.name);
        const cmp = {
            ff_asc:   (a, b) => (a.ff ?? 1e9) - (b.ff ?? 1e9) || byName(a, b),
            ff_desc:  (a, b) => (b.ff ?? -1) - (a.ff ?? -1) || byName(a, b),
            hosp_asc: (a, b) => {
                // soonest out first; non-hosp pushed to the bottom
                const av = a.inHosp ? a.remaining : 1e9;
                const bv = b.inHosp ? b.remaining : 1e9;
                return av - bv || byName(a, b);
            },
            hosp_desc: (a, b) => {
                const av = a.inHosp ? a.remaining : -1;
                const bv = b.inHosp ? b.remaining : -1;
                return bv - av || byName(a, b);
            },
            stats_desc: (a, b) => parseEstHuman(b.est) - parseEstHuman(a.est) || byName(a, b),
            stats_asc:  (a, b) => parseEstHuman(a.est) - parseEstHuman(b.est) || byName(a, b),
            respect_desc: (a, b) => (b.respect ?? -1) - (a.respect ?? -1) || byName(a, b),
            respect_asc:  (a, b) => (a.respect ?? 1e9) - (b.respect ?? 1e9) || byName(a, b),
            name:       byName,
        }[sortBy] || ((a, b) => (a.ff ?? 1e9) - (b.ff ?? 1e9) || byName(a, b));
        return rows.slice().sort(cmp);
    }

    // Convert "1.2m" / "33.3k" / "2.99b" to a number for sorting.
    function parseEstHuman(s) {
        if (!s) return 0;
        const m = String(s).match(/([\d.]+)\s*([kmb])?/i);
        if (!m) return 0;
        let n = parseFloat(m[1]) || 0;
        const unit = (m[2] || '').toLowerCase();
        if (unit === 'k') n *= 1e3;
        else if (unit === 'm') n *= 1e6;
        else if (unit === 'b') n *= 1e9;
        return n;
    }

    // Format one line of the mass message from the chosen line template.
    function formatMassLine(d, lineTpl) {
        const timeStr = d.inHosp ? Time.hms(d.remaining) : (d.state === 'Okay' ? 'OUT' : d.state);
        return lineTpl
            .replace(/\{name\}/g, d.name)
            .replace(/\{id\}/g, d.pid)
            .replace(/\{time\}/g, timeStr)
            .replace(/\{clock\}/g, d.until > 0 ? Time.clockTCT(d.until) : '--:--')
            .replace(/\{stats\}/g, d.est ? '~' + d.est : '?')
            .replace(/\{ff\}/g, d.ff != null ? d.ff.toFixed(2) : '?')
            .replace(/\{state\}/g, d.state)
            .replace(/\{level\}/g, d.level ?? '?')
            .replace(/\{respect\}/g, fmtRespect(d.respect));
    }

    function openMassCallout() {
        const { bg, box } = modalShell(560);
        const S = state.settings;

        box.innerHTML = `
            <h2>📋 Mass Callout</h2>

            <label style="margin-top:0">Preset</label>
            <div class="wt-row" style="align-items:center">
                <select class="wt-mass-preset" style="flex:1"></select>
                <button class="wt-preset-save" title="Save current settings as a preset" style="flex:0 0 auto">Save as…</button>
                <button class="wt-preset-del" title="Delete selected custom preset" style="flex:0 0 auto;background:#5a2a2a;border-color:#7a3a3a">Delete</button>
            </div>
            <div class="wt-help">Pick a preset to load its filters &amp; format instantly, then tweak below if needed.</div>

            <div class="wt-row" style="margin-top:8px">
                <div>
                    <label style="margin-top:0">Status</label>
                    <select class="wt-mass-filter">
                        <option value="all">Everyone (visible)</option>
                        <option value="hosp">In hospital only</option>
                        <option value="out">Out of hospital</option>
                        <option value="okay">Okay (attackable now)</option>
                        <option value="traveling">Traveling/abroad</option>
                    </select>
                </div>
                <div>
                    <label style="margin-top:0">Sort by</label>
                    <select class="wt-mass-sort">
                        <option value="hosp_asc">Hosp time — soonest out</option>
                        <option value="hosp_desc">Hosp time — latest out</option>
                        <option value="ff_asc">FF — lowest first (easiest)</option>
                        <option value="ff_desc">FF — highest first</option>
                        <option value="stats_asc">Stats — lowest first</option>
                        <option value="stats_desc">Stats — highest first</option>
                        <option value="respect_desc">Respect — most first</option>
                        <option value="respect_asc">Respect — least first</option>
                        <option value="name">Name (A–Z)</option>
                    </select>
                </div>
            </div>

            <div class="wt-row" style="margin-top:6px">
                <div>
                    <label style="margin-top:0">Online state</label>
                    <select class="wt-mass-online">
                        <option value="any">Any</option>
                        <option value="online">Online only</option>
                        <option value="idle_online">Online + idle</option>
                        <option value="offline">Offline only</option>
                    </select>
                </div>
                <div>
                    <label style="margin-top:0">Limit count</label>
                    <input type="number" class="wt-mass-limit" min="0" max="200" step="1" placeholder="0 = no limit">
                </div>
            </div>

            <div class="wt-row" style="align-items:center;margin-top:6px">
                <label class="wt-switch" style="margin:0;flex:0 0 auto"><input type="checkbox" class="wt-mass-ffcap"><span>Only FF ≤</span></label>
                <input type="number" class="wt-mass-ffval" min="0" max="10" step="0.25" style="flex:0 0 70px">
                <label class="wt-switch" style="margin:0 0 0 12px;flex:0 0 auto"><input type="checkbox" class="wt-mass-hospu"><span>Out within</span></label>
                <input type="number" class="wt-mass-hospumin" min="1" max="120" step="1" style="flex:0 0 60px">
                <span style="font-size:11px;color:#aaa">min</span>
            </div>

            <div class="wt-row" style="align-items:center;margin-top:6px">
                <span style="font-size:11px;color:#aaa;flex:0 0 auto">Respect estimate assumes:</span>
                <label class="wt-switch" style="margin:0;flex:0 0 auto"><input type="checkbox" class="wt-mass-war"><span>War ×2</span></label>
                <label class="wt-switch" style="margin:0 0 0 12px;flex:0 0 auto"><input type="checkbox" class="wt-mass-overseas"><span>Overseas ×1.25</span></label>
            </div>

            <label>Line format</label>
            <select class="wt-mass-lineformat" style="margin-bottom:4px"></select>
            <input type="text" class="wt-mass-line" value="${esc(S.massLineTpl)}">
            <div class="wt-help">Per-player line. Pick a format above or type your own. Placeholders: {name} {time} {clock} {stats} {ff} {state} {id} {level} {respect}<br>Links: Torn chat shows full URLs as plain text — they're only tappable if you (and readers) run a "clickable chat links" script like TornTools. The name itself can't be hyperlinked.</div>

            <div class="wt-row" style="align-items:center;margin-top:6px">
                <label class="wt-switch" style="margin:0"><input type="checkbox" class="wt-mass-header"><span>Add a header line</span></label>
                <input type="text" class="wt-mass-headtext" value="${esc(S.massHeader)}" placeholder="Header text" style="flex:1">
            </div>
            <div class="wt-row" style="align-items:center;margin-top:6px">
                <label class="wt-switch" style="margin:0"><input type="checkbox" class="wt-mass-number"><span>Number each line (1. 2. 3.)</span></label>
            </div>

            <label>Preview <span class="wt-mass-count" style="color:#888;font-weight:normal"></span></label>
            <textarea class="wt-mass-preview" rows="8" style="font-family:monospace;font-size:12px"></textarea>

            <div class="wt-help wt-mass-chunkinfo"></div>

            <div class="wt-btns">
                <button class="copy">Copy</button>
                <button class="cancel">Close</button>
                <button class="primary send">Send to chat</button>
            </div>`;

        const q = (s) => box.querySelector(s);

        // Read all panel controls into a cfg object (the preset shape).
        function readCfg() {
            return {
                filter:   q('.wt-mass-filter').value,
                sort:     q('.wt-mass-sort').value,
                online:   q('.wt-mass-online').value,
                limit:    parseInt(q('.wt-mass-limit').value, 10) || 0,
                ffCap:    q('.wt-mass-ffcap').checked,
                ffVal:    parseFloat(q('.wt-mass-ffval').value) || 0,
                war:      q('.wt-mass-war').checked,
                overseas: q('.wt-mass-overseas').checked,
                hospU:    q('.wt-mass-hospu').checked,
                hospUMin: parseFloat(q('.wt-mass-hospumin').value) || 0,
                line:     q('.wt-mass-line').value,
                header:   q('.wt-mass-header').checked,
                headText: q('.wt-mass-headtext').value,
                number:   q('.wt-mass-number').checked,
            };
        }
        // Write a cfg object back into the controls.
        function applyCfg(c) {
            if (!c) return;
            q('.wt-mass-filter').value = c.filter ?? 'all';
            q('.wt-mass-sort').value = c.sort ?? 'hosp_asc';
            q('.wt-mass-online').value = c.online ?? 'any';
            q('.wt-mass-limit').value = c.limit || '';
            q('.wt-mass-ffcap').checked = !!c.ffCap;
            q('.wt-mass-ffval').value = c.ffVal ?? 2;
            if (c.war !== undefined) q('.wt-mass-war').checked = !!c.war;
            if (c.overseas !== undefined) q('.wt-mass-overseas').checked = !!c.overseas;
            q('.wt-mass-hospu').checked = !!c.hospU;
            q('.wt-mass-hospumin').value = c.hospUMin ?? 15;
            q('.wt-mass-line').value = c.line ?? '{name} — {time}';
            q('.wt-mass-header').checked = c.header !== false;
            q('.wt-mass-headtext').value = c.headText ?? '🎯 Targets:';
            q('.wt-mass-number').checked = c.number !== false;
        }

        // Populate the preset dropdown (built-ins first, then customs).
        function refreshPresetDropdown(selectName) {
            const sel = q('.wt-mass-preset');
            const presets = allMassPresets();
            sel.innerHTML = '<option value="">— current settings —</option>' +
                presets.map((p, i) => `<option value="${i}">${esc(p.name)}${p.builtin ? '' : ' ✎'}</option>`).join('');
            if (selectName) {
                const idx = presets.findIndex(p => p.name === selectName);
                if (idx >= 0) sel.value = String(idx);
            }
        }
        refreshPresetDropdown();

        // Line-format dropdown: populate, select current if it matches a known
        // format, and apply the chosen body to the text input on change.
        function refreshLineFormatDropdown() {
            const sel = q('.wt-mass-lineformat');
            const formats = allLineFormats();
            const cur = q('.wt-mass-line').value;
            sel.innerHTML = '<option value="">— custom / type below —</option>' +
                formats.map((f, i) => `<option value="${i}">${esc(f.name)}</option>`).join('') +
                '<option value="save">+ Save current as format…</option>';
            const idx = formats.findIndex(f => f.body === cur);
            sel.value = idx >= 0 ? String(idx) : '';
        }
        refreshLineFormatDropdown();

        q('.wt-mass-lineformat').onchange = () => {
            const v = q('.wt-mass-lineformat').value;
            if (v === '') return;
            if (v === 'save') {
                const name = prompt('Name this line format:', '');
                if (name && name.trim()) {
                    const body = q('.wt-mass-line').value;
                    const custom = (state.settings.massLineFormats || []).filter(f => f.name !== name.trim());
                    custom.push({ name: name.trim(), body });
                    saveSetting('massLineFormats', custom);
                    Toast.show('✓ Format saved: ' + name.trim());
                }
                refreshLineFormatDropdown();
                return;
            }
            const f = allLineFormats()[+v];
            if (f) { q('.wt-mass-line').value = f.body; onManualChange(); }
        };

        q('.wt-mass-preset').onchange = () => {
            const idx = q('.wt-mass-preset').value;
            if (idx === '') return;
            const p = allMassPresets()[+idx];
            if (p) { applyCfg(p.cfg); refreshLineFormatDropdown(); rebuild(); }
        };
        q('.wt-preset-save').onclick = () => {
            const name = prompt('Save this preset as:', '');
            if (!name || !name.trim()) return;
            const clean = name.trim();
            // Don't allow overwriting a built-in name
            if (defaultMassPresets().some(p => p.name === clean)) { Toast.show('⚠ That name is reserved by a built-in preset'); return; }
            const custom = (state.settings.massPresets || []).filter(p => p.name !== clean);
            custom.push({ name: clean, builtin: false, cfg: readCfg() });
            saveSetting('massPresets', custom);
            refreshPresetDropdown(clean);
            Toast.show('✓ Preset saved: ' + clean);
        };
        q('.wt-preset-del').onclick = () => {
            const idx = q('.wt-mass-preset').value;
            if (idx === '') { Toast.show('Pick a preset to delete'); return; }
            const p = allMassPresets()[+idx];
            if (!p) return;
            if (p.builtin) { Toast.show('⚠ Built-in presets cannot be deleted'); return; }
            if (!confirm(`Delete preset "${p.name}"?`)) return;
            const custom = (state.settings.massPresets || []).filter(x => x.name !== p.name);
            saveSetting('massPresets', custom);
            refreshPresetDropdown();
            Toast.show('Preset deleted');
        };

        q('.wt-mass-filter').value = S.massFilter;
        q('.wt-mass-sort').value = S.massSort;
        q('.wt-mass-online').value = S.massOnline;
        q('.wt-mass-limit').value = S.massLimit || '';
        q('.wt-mass-ffcap').checked = S.massFFCap;
        q('.wt-mass-ffval').value = S.massFFVal;
        q('.wt-mass-war').checked = S.massRespWar;
        q('.wt-mass-overseas').checked = S.massRespOverseas;
        q('.wt-mass-hospu').checked = S.massHospU;
        q('.wt-mass-hospumin').value = S.massHospUMin;
        q('.wt-mass-header').checked = S.massShowHeader;
        q('.wt-mass-number').checked = S.massNumber;

        let lines = [];   // current compiled lines (without chunking)

        function rebuild() {
            // Sync respect-multiplier toggles into settings so massRowData picks them up.
            state.settings.massRespWar = q('.wt-mass-war').checked;
            state.settings.massRespOverseas = q('.wt-mass-overseas').checked;
            const opts = {
                filter:           q('.wt-mass-filter').value,
                onlineFilter:     q('.wt-mass-online').value,
                maxFFEnabled:     q('.wt-mass-ffcap').checked,
                maxFF:            parseFloat(q('.wt-mass-ffval').value) || 0,
                hospUnderEnabled: q('.wt-mass-hospu').checked,
                hospUnderMin:     parseFloat(q('.wt-mass-hospumin').value) || 0,
            };
            const sortBy = q('.wt-mass-sort').value;
            const lineTpl = q('.wt-mass-line').value || '{name} — {time}';
            const number = q('.wt-mass-number').checked;
            const showHeader = q('.wt-mass-header').checked;
            const headText = q('.wt-mass-headtext').value;
            const limit = parseInt(q('.wt-mass-limit').value, 10) || 0;

            let data = sortMassRows(gatherMassRows(opts), sortBy);
            if (limit > 0) data = data.slice(0, limit);
            lines = data.map((d, i) => (number ? `${i + 1}. ` : '') + formatMassLine(d, lineTpl));

            const body = [];
            if (showHeader && headText.trim()) body.push(headText.trim());
            body.push(...lines);
            const full = body.join('\n');

            q('.wt-mass-preview').value = full;
            q('.wt-mass-count').textContent = `(${data.length} player${data.length === 1 ? '' : 's'})`;

            // Chat messages have a length cap (~1000 chars is safe). Show chunk plan.
            const chunks = chunkLines(body, 950);
            q('.wt-mass-chunkinfo').textContent = chunks.length > 1
                ? `Will send as ${chunks.length} messages (chat length limit).`
                : '';
            box._chunks = chunks;
            return full;
        }

        // persist choices as they change
        const onManualChange = () => {
            // A manual tweak no longer matches the loaded preset → reset selector.
            const sel = q('.wt-mass-preset');
            if (sel.value !== '') sel.value = '';
            // Keep the line-format dropdown in sync with the current text.
            const lf = q('.wt-mass-lineformat');
            if (lf) {
                const formats = allLineFormats();
                const idx = formats.findIndex(f => f.body === q('.wt-mass-line').value);
                lf.value = idx >= 0 ? String(idx) : '';
            }
            rebuild();
        };
        ['change', 'input'].forEach(ev => {
            ['.wt-mass-filter', '.wt-mass-sort', '.wt-mass-online', '.wt-mass-limit',
             '.wt-mass-ffcap', '.wt-mass-ffval', '.wt-mass-hospu', '.wt-mass-hospumin',
             '.wt-mass-war', '.wt-mass-overseas',
             '.wt-mass-line', '.wt-mass-header', '.wt-mass-headtext', '.wt-mass-number'
            ].forEach(sel => q(sel).addEventListener(ev, onManualChange));
        });
        rebuild();

        q('.cancel').onclick = () => bg.remove();
        q('.copy').onclick = () => {
            const ok = copyText(q('.wt-mass-preview').value);
            Toast.show(ok ? '📋 Copied full list' : '⚠ Copy failed');
        };
        q('.send').onclick = async () => {
            // Save preferences
            saveSetting('massFilter', q('.wt-mass-filter').value);
            saveSetting('massSort', q('.wt-mass-sort').value);
            saveSetting('massOnline', q('.wt-mass-online').value);
            saveSetting('massLimit', parseInt(q('.wt-mass-limit').value, 10) || 0);
            saveSetting('massFFCap', q('.wt-mass-ffcap').checked);
            saveSetting('massFFVal', parseFloat(q('.wt-mass-ffval').value) || 0);
            saveSetting('massRespWar', q('.wt-mass-war').checked);
            saveSetting('massRespOverseas', q('.wt-mass-overseas').checked);
            saveSetting('massHospU', q('.wt-mass-hospu').checked);
            saveSetting('massHospUMin', parseFloat(q('.wt-mass-hospumin').value) || 0);
            saveSetting('massLineTpl', q('.wt-mass-line').value);
            saveSetting('massShowHeader', q('.wt-mass-header').checked);
            saveSetting('massHeader', q('.wt-mass-headtext').value);
            saveSetting('massNumber', q('.wt-mass-number').checked);

            const chunks = box._chunks || [];
            if (!chunks.length) { Toast.show('Nothing to send'); return; }
            bg.remove();
            // Send each chunk with a small delay so chat accepts them in order.
            for (let i = 0; i < chunks.length; i++) {
                const ok = sendToFactionChat(chunks[i]);
                if (!ok) { Toast.show('⚠ Open faction chat first'); break; }
                if (i < chunks.length - 1) await sleep(700);
            }
            Toast.show(`✓ Sent ${chunks.length} message${chunks.length === 1 ? '' : 's'}`);
        };

        document.body.appendChild(bg);
    }

    // Group lines into chat-sized chunks without splitting a line.
    function chunkLines(linesArr, maxLen) {
        const chunks = [];
        let cur = '';
        for (const line of linesArr) {
            const add = (cur ? '\n' : '') + line;
            if (cur && (cur.length + add.length) > maxLen) { chunks.push(cur); cur = line; }
            else cur += add;
        }
        if (cur) chunks.push(cur);
        return chunks;
    }
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    /* ════════════════════════════════════════════════════════════════════════
     * 15. UI — TOASTS
     * ════════════════════════════════════════════════════════════════════════ */
    const Toast = {
        show(msg, ms = 1900) {
            let t = $('.wt-toast');
            if (!t) { t = el('div', { class: 'wt-toast' }); document.body.appendChild(t); }
            t.textContent = msg;
            requestAnimationFrame(() => t.classList.add('show'));
            clearTimeout(t._h);
            t._h = setTimeout(() => t.classList.remove('show'), ms);
        },
    };

    /* ════════════════════════════════════════════════════════════════════════
     * 16. UI — MODALS
     * ════════════════════════════════════════════════════════════════════════ */
    function modalShell(maxWidth = 420) {
        const bg = el('div', { class: 'wt-modal-bg', onclick: (e) => { if (e.target === bg) bg.remove(); } });
        const box = el('div', { class: 'wt-modal', style: `max-width:${maxWidth}px` });
        bg.appendChild(box);
        const onEsc = (e) => { if (e.key === 'Escape') { bg.remove(); document.removeEventListener('keydown', onEsc); } };
        document.addEventListener('keydown', onEsc);
        return { bg, box };
    }

    function openCalloutModal(pid) {
        const rec = state.members.get(pid) || {};
        const name = memberName(pid);
        const until = rec.until || 0;
        const { bg, box } = modalShell(420);
        const S = state.settings;

        box.innerHTML = `
            <h2>📢 Callout — ${esc(name)}</h2>
            <label>Template</label>
            <select class="wt-tpl">${S.templates.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join('')}</select>
            <label>Time mode</label>
            <div class="wt-row">
                <select class="wt-mode">
                    <option value="remaining">Hospital timer</option>
                    <option value="offsetNow">In X minutes (from now)</option>
                </select>
                <input type="number" class="wt-offset" min="-60" max="240" step="1" value="${S.offsetSeconds / 60}" title="Minutes to add (+later / −earlier)">
            </div>
            <div class="wt-help">"Hospital timer" uses their real release time + offset. "In X minutes" ignores the timer. Placeholders: {name} {time} {clock} {id} {stats} {ff} {level} {respect}</div>
            <label>Message</label>
            <textarea class="wt-msg" rows="2"></textarea>
            <label>Preview</label>
            <div class="wt-preview"></div>
            <div class="wt-statline"></div>
            <div class="wt-btns">
                <button class="copy">Copy</button>
                <button class="cancel">Cancel</button>
                <button class="primary send">Send to chat</button>
            </div>
            <span class="wt-link">⚙ Manage templates & defaults</span>`;

        const q = (s) => box.querySelector(s);
        const tplSel = q('.wt-tpl'), modeSel = q('.wt-mode'), offEl = q('.wt-offset'), msgEl = q('.wt-msg'), prev = q('.wt-preview');
        tplSel.value = String(Math.min(S.lastTemplate, S.templates.length - 1));
        modeSel.value = S.defaultMode === 'clock' ? 'remaining' : S.defaultMode;
        let dirty = false;

        // Resolve FFScouter data for this player (may be empty if no key / not yet fetched)
        const ffd = state.ffs.get(String(pid));
        const statsStr = ffd && ffd.estHuman ? ffd.estHuman : '?';
        const ffStr = ffd && ffd.ff != null ? ffd.ff.toFixed(2) : '?';
        const statLineEl = q('.wt-statline');
        if (ffd && (ffd.estHuman || ffd.ff != null)) {
            statLineEl.innerHTML = `<span class="wt-stat-badge">📊 ~${esc(ffd.estHuman || '?')} &nbsp;·&nbsp; FF ${esc(ffStr)}</span>`;
        } else if (ffsKeyValid(state.ffsKey)) {
            statLineEl.innerHTML = `<span class="wt-stat-badge muted">📊 estimate loading… (use {stats}/{ff} in your message)</span>`;
        } else {
            statLineEl.innerHTML = `<span class="wt-stat-badge muted">📊 add an FFScouter key in ⚙ to use {stats}/{ff}</span>`;
        }

        function recompute() {
            const tpl = S.templates[+tplSel.value] || S.templates[0];
            if (!dirty) msgEl.value = tpl.body;
            const offSec = Math.round((parseFloat(offEl.value) || 0) * 60);
            const nowSec = Time.nowSec();
            const target = modeSel.value === 'remaining' && until > 0 ? until + offSec : nowSec + offSec;
            const out = buildMessage(msgEl.value, {
                name, id: pid, time: Time.human(target - nowSec), clock: Time.clockTCT(target),
                stats: statsStr, ff: ffStr,
                level: rowLevel(pid) ?? '?', respect: fmtRespect(estimateRespect(pid)),
            });
            prev.textContent = out;
            return out;
        }
        tplSel.onchange = () => { dirty = false; recompute(); };
        modeSel.onchange = recompute;
        offEl.oninput = recompute;
        msgEl.oninput = () => { dirty = true; recompute(); };
        recompute();

        q('.cancel').onclick = () => bg.remove();
        q('.copy').onclick = () => Toast.show(copyText(recompute()) ? '📋 Copied' : '⚠ Copy failed');
        q('.send').onclick = () => {
            const text = recompute();
            saveSetting('lastTemplate', +tplSel.value);
            saveSetting('offsetSeconds', (parseFloat(offEl.value) || 0) * 60);
            saveSetting('defaultMode', modeSel.value);
            if (sendToFactionChat(text)) { Toast.show('✓ Sent'); bg.remove(); }
        };
        q('.wt-link').onclick = () => { bg.remove(); openSettings(); };

        document.body.appendChild(bg);
        msgEl.focus();
        msgEl.setSelectionRange(msgEl.value.length, msgEl.value.length);
    }

    function openSettings() {
        const { bg, box } = modalShell(520);
        const S = state.settings;
        box.innerHTML = `
            <h2>⚙ Torn War Tools — Settings <span style="font-weight:normal;color:#666;font-size:11px">v${VERSION}</span></h2>

            <button class="wt-open-mass" style="width:100%;padding:8px;margin-bottom:10px;background:linear-gradient(180deg,#3a8a5a,#1f5a36);color:#fff;border:1px solid #16401f;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600">📋 Open Mass Callout</button>

            <label style="margin-top:0">War list</label>
            <label class="wt-switch"><input type="checkbox" class="wt-hosp"><span>Hosp First: pin hospitalized players to top</span></label>
            <label class="wt-switch"><input type="checkbox" class="wt-color"><span>Color-code countdowns (red under 5 min)</span></label>
            <label class="wt-switch"><input type="checkbox" class="wt-hide-offline"><span>Hide offline enemies</span></label>
            <label class="wt-switch"><input type="checkbox" class="wt-hide-idle"><span>Hide idle enemies</span></label>
            <label class="wt-switch"><input type="checkbox" class="wt-hide-online"><span>Hide online enemies</span></label>
            <label class="wt-switch" style="margin-left:18px"><input type="checkbox" class="wt-keep-hosp"><span>…but keep them if they're in hospital</span></label>

            <label style="margin-top:14px">Callout button</label>
            <label class="wt-switch"><input type="checkbox" class="wt-own"><span>Show 📢 on my own faction too (default: enemy only)</span></label>
            <label class="wt-switch"><input type="checkbox" class="wt-quick"><span>Show ⚡ quick-call button (instant send, last-used template)</span></label>
            <div class="wt-help" style="margin-top:6px;margin-bottom:2px">Show callout buttons on which enemies:</div>
            <label class="wt-switch"><input type="checkbox" class="wt-cs-hosp"><span>In hospital</span></label>
            <label class="wt-switch"><input type="checkbox" class="wt-cs-okay"><span>Okay / attackable now</span></label>
            <label class="wt-switch"><input type="checkbox" class="wt-cs-travel"><span>Traveling / abroad</span></label>

            <label style="margin-top:14px">Torn API key</label>
            <div class="wt-row" style="align-items:center">
                <input type="text" class="wt-key" placeholder="16-char public API key">
                <button class="wt-key-save" style="flex:0 0 auto">Save</button>
            </div>
            <div class="wt-help">Read-only faction status. A public key is enough.</div>

            <label style="margin-top:14px">FFScouter API key (stat estimates)</label>
            <div class="wt-row" style="align-items:center">
                <input type="text" class="wt-ffs" placeholder="16-char FFScouter-registered key">
                <button class="wt-ffs-save" style="flex:0 0 auto">Save</button>
                <button class="wt-ffs-test" style="flex:0 0 auto">Test</button>
            </div>
            <div class="wt-help">Enables <b>{stats}</b> &amp; <b>{ff}</b> in callouts (e.g. ~1.2m · FF 2.40). Get a key at <span style="color:#7ab3ff">ffscouter.com</span> — register there first. <b>Test</b> checks the key against one player and shows the result below.</div>
            <div class="wt-ffs-status" style="font-size:11px;margin-top:4px;min-height:14px"></div>
            <label class="wt-switch"><input type="checkbox" class="wt-inline-stats"><span>Show stat estimate under the Score column</span></label>

            <label style="margin-top:14px">Callout templates</label>
            <div class="wt-help" style="margin-top:0;margin-bottom:6px">Placeholders: <b>{name}</b>, <b>{time}</b>, <b>{clock}</b> (HH:MM TCT), <b>{id}</b>, <b>{stats}</b>, <b>{ff}</b></div>
            <div class="wt-tpl-list"></div>
            <button class="wt-tpl-add">+ Add template</button>

            <label style="margin-top:14px">Callout defaults</label>
            <div class="wt-row">
                <div><label style="margin-top:0">Time mode</label>
                    <select class="wt-def-mode"><option value="remaining">Hospital timer</option><option value="offsetNow">In X minutes</option></select></div>
                <div><label style="margin-top:0">Offset (min)</label>
                    <input type="number" class="wt-def-off" min="-60" max="240" step="1"></div>
            </div>

            <div class="wt-btns">
                <button class="danger reset">Reset defaults</button>
                <button class="cancel">Close</button>
                <button class="primary save">Save</button>
            </div>`;

        const q = (s) => box.querySelector(s);
        // toggles
        q('.wt-open-mass').onclick = () => { bg.remove(); openMassCallout(); };
        q('.wt-hosp').checked = state.hospFirst;
        q('.wt-hosp').onchange = (e) => {
            state.hospFirst = e.target.checked;
            Store.rawSet(C.KEY_HOSP_FIRST, state.hospFirst ? 'true' : 'false');
            sortAll(); Toast.show(`Hosp First: ${state.hospFirst ? 'ON' : 'OFF'}`);
        };
        q('.wt-color').checked = S.colorCountdowns;
        q('.wt-color').onchange = (e) => { saveSetting('colorCountdowns', e.target.checked); document.body.classList.toggle('wt-no-color', !e.target.checked); };
        q('.wt-hide-offline').checked = S.hideOffline;
        q('.wt-hide-offline').onchange = (e) => { saveSetting('hideOffline', e.target.checked); reconcile(); Toast.show(`Hide offline: ${e.target.checked ? 'ON' : 'OFF'}`); };
        q('.wt-hide-idle').checked = S.hideIdle;
        q('.wt-hide-idle').onchange = (e) => { saveSetting('hideIdle', e.target.checked); reconcile(); Toast.show(`Hide idle: ${e.target.checked ? 'ON' : 'OFF'}`); };
        q('.wt-hide-online').checked = S.hideOnline;
        q('.wt-hide-online').onchange = (e) => { saveSetting('hideOnline', e.target.checked); reconcile(); Toast.show(`Hide online: ${e.target.checked ? 'ON' : 'OFF'}`); };
        q('.wt-keep-hosp').checked = S.keepHospVisible;
        q('.wt-keep-hosp').onchange = (e) => { saveSetting('keepHospVisible', e.target.checked); reconcile(); };
        q('.wt-own').checked = S.calloutOnOwn;
        q('.wt-own').onchange = (e) => {
            saveSetting('calloutOnOwn', e.target.checked);
            if (!e.target.checked) for (const [, row] of state.rows) if (isOwnFaction(row.li)) removeCallout(row);
            Toast.show(`Own-faction callouts: ${e.target.checked ? 'ON' : 'OFF'}`);
        };
        q('.wt-quick').checked = S.quickCallBtn;
        q('.wt-quick').onchange = (e) => {
            saveSetting('quickCallBtn', e.target.checked);
            reconcile();
            Toast.show(`Quick-call button: ${e.target.checked ? 'ON' : 'OFF'}`);
        };
        // callout state toggles
        const cs = S.calloutStates || { hosp: true, okay: true, traveling: false };
        q('.wt-cs-hosp').checked = !!cs.hosp;
        q('.wt-cs-okay').checked = !!cs.okay;
        q('.wt-cs-travel').checked = !!cs.traveling;
        const onCsChange = () => {
            saveSetting('calloutStates', {
                hosp: q('.wt-cs-hosp').checked,
                okay: q('.wt-cs-okay').checked,
                traveling: q('.wt-cs-travel').checked,
            });
            reconcile();
        };
        q('.wt-cs-hosp').onchange = onCsChange;
        q('.wt-cs-okay').onchange = onCsChange;
        q('.wt-cs-travel').onchange = onCsChange;
        // torn api key
        q('.wt-key').value = apiKeyValid(state.apiKey) ? state.apiKey : '';
        q('.wt-key-save').onclick = () => {
            const v = q('.wt-key').value.trim();
            if (v.length !== 16) { Toast.show('⚠ Key must be 16 characters'); return; }
            state.apiKey = v; Store.rawSet(C.KEY_API, v); state.running = true; state.nextPollAllowedAt = 0;
            Toast.show('✓ API key saved'); poll();
        };
        // ffscouter key
        q('.wt-ffs').value = ffsKeyValid(state.ffsKey) ? state.ffsKey : '';
        q('.wt-ffs-save').onclick = () => {
            const v = q('.wt-ffs').value.trim();
            if (!ffsKeyValid(v)) { Toast.show('⚠ Key must be 16 alphanumeric characters'); return; }
            state.ffsKey = v; Store.set('ffscouter-key', v); state.nextFfsAllowedAt = 0;
            Toast.show('✓ FFScouter key saved — fetching estimates'); pollFFScouter();
        };
        q('.wt-ffs-test').onclick = async () => {
            const statusEl = q('.wt-ffs-status');
            const key = q('.wt-ffs').value.trim() || state.ffsKey;
            if (!ffsKeyValid(key)) { statusEl.innerHTML = '<span style="color:#e88">✗ enter a 16-char key first</span>'; return; }
            // Pick a target: first enemy on the page, else a fallback id.
            let target = null;
            for (const [pid, row] of state.rows) { if (!isOwnFaction(row.li)) { target = pid; break; } }
            if (!target) target = '1';
            statusEl.innerHTML = '<span style="color:#aaa">Testing…</span>';
            const url = `${C.FFS_ENDPOINT}?key=${key}&targets=${target}&comment=TornWarTools`;
            try {
                const data = await httpGetJSON(url);
                const recs = ffsExtractRecords(data);
                if ((data && (data.error || data.code)) && !recs.length) {
                    statusEl.innerHTML = `<span style="color:#e88">✗ API error ${esc(String(data.code ?? ''))}: ${esc(String(data.error ?? data.message ?? 'unknown'))}</span>`;
                } else if (recs.length) {
                    const rec = ffsReadRecord(recs[0]);
                    statusEl.innerHTML = `<span style="color:#9be8a8">✓ Works — player ${esc(rec.pid || '?')}: ~${esc(rec.est || '?')}, FF ${rec.ff != null ? rec.ff.toFixed(2) : '?'}</span>`;
                } else {
                    statusEl.innerHTML = `<span style="color:#e8c">⚠ Connected but no records. Raw: ${esc(JSON.stringify(data).slice(0, 100))}</span>`;
                }
            } catch (e) {
                statusEl.innerHTML = `<span style="color:#e88">✗ Request failed: ${esc(e.message)}</span>`;
            }
        };
        q('.wt-inline-stats').checked = S.showStatsInline;
        q('.wt-inline-stats').onchange = (e) => {
            saveSetting('showStatsInline', e.target.checked);
            if (!e.target.checked) $$('.wt-stats').forEach(n => n.remove());
            Toast.show(`Inline stats: ${e.target.checked ? 'ON' : 'OFF'}`);
        };
        // templates editor
        const list = q('.wt-tpl-list');
        const renderTpls = () => {
            list.innerHTML = '';
            S.templates.forEach((t, i) => {
                const row = el('div', { class: 'wt-tpl-row' });
                row.innerHTML = `
                    <input type="text" class="n" value="${esc(t.name)}" style="flex:0 0 32%" placeholder="Label">
                    <input type="text" class="b" value="${esc(t.body)}" placeholder="Body">
                    <button class="d" title="Delete">✕</button>`;
                row.querySelector('.n').oninput = (e) => { S.templates[i].name = e.target.value; };
                row.querySelector('.b').oninput = (e) => { S.templates[i].body = e.target.value; };
                row.querySelector('.d').onclick = () => { S.templates.splice(i, 1); if (!S.templates.length) S.templates.push({ name: 'Custom', body: '{name} out in {time}' }); renderTpls(); };
                list.appendChild(row);
            });
        };
        renderTpls();
        q('.wt-tpl-add').onclick = () => { S.templates.push({ name: 'New', body: '{name} — {time}' }); renderTpls(); };
        // callout defaults
        q('.wt-def-mode').value = S.defaultMode === 'clock' ? 'remaining' : S.defaultMode;
        q('.wt-def-off').value = S.offsetSeconds / 60;
        // buttons
        q('.cancel').onclick = () => bg.remove();
        q('.reset').onclick = () => {
            if (!confirm('Reset templates and callout defaults? (API key & Hosp First are kept.)')) return;
            S.templates = defaultTemplates(); saveSetting('templates', S.templates);
            saveSetting('defaultMode', 'remaining'); saveSetting('offsetSeconds', 0); saveSetting('lastTemplate', 0);
            renderTpls(); q('.wt-def-mode').value = 'remaining'; q('.wt-def-off').value = 0; Toast.show('Defaults restored');
        };
        q('.save').onclick = () => {
            S.templates = S.templates.filter(t => (t.name || '').trim() && (t.body || '').trim());
            if (!S.templates.length) S.templates = defaultTemplates();
            saveSetting('templates', S.templates);
            saveSetting('defaultMode', q('.wt-def-mode').value);
            saveSetting('offsetSeconds', (parseFloat(q('.wt-def-off').value) || 0) * 60);
            Toast.show('✓ Saved'); bg.remove();
        };

        document.body.appendChild(bg);
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 17. UI — FLOATING GEAR
     * ════════════════════════════════════════════════════════════════════════ */
    function ensureGear() {
        if (!document.body) return;
        if (!$('.wt-gear')) {
            const gear = el('div', {
                class: 'wt-gear', title: 'War Tools settings',
                onclick: (e) => { e.preventDefault(); e.stopPropagation(); openSettings(); },
                html: '⚙<span class="wt-gear-tip">War Tools</span>',
            });
            document.body.appendChild(gear);
        }
        if (!$('.wt-mass-btn')) {
            const mass = el('div', {
                class: 'wt-mass-btn', title: 'Mass callout',
                onclick: (e) => { e.preventDefault(); e.stopPropagation(); openMassCallout(); },
                html: '📋<span class="wt-gear-tip">Mass callout</span>',
            });
            document.body.appendChild(mass);
        }
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 18. PER-LIST OBSERVER (detect Torn re-renders / re-sorts)
     * ════════════════════════════════════════════════════════════════════════ */
    const observers = new WeakMap();
    const suspended = new WeakSet();
    let reconcileQueued = false;
    function suspendObserver(ul) { suspended.add(ul); }
    function resumeObserver(ul) { setTimeout(() => suspended.delete(ul), 0); }
    function queueReconcile() {
        if (reconcileQueued) return;
        reconcileQueued = true;
        requestAnimationFrame(() => { reconcileQueued = false; reconcile(); });
    }
    function attachObserver(ul) {
        if (observers.has(ul)) return;
        const o = new MutationObserver(() => { if (!suspended.has(ul)) queueReconcile(); });
        o.observe(ul, { childList: true });
        observers.set(ul, o);
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 19. RECONCILE — the heartbeat that ties state → DOM
     * ════════════════════════════════════════════════════════════════════════ */
    function reconcile() {
        if (!state.warFound) return;
        const structureChanged = indexRows();
        for (const ul of getMemberLists()) attachObserver(ul);
        ensureGear();
        for (const [pid, rec] of state.members) {
            if (state.rows.has(pid)) paintRow(pid, rec);
        }
        // Apply offline/idle hiding across every row (even ones without an API
        // record yet). Hospital rows with a live timer are protected inside
        // applyRowVisibility so we never hide an active callout target.
        debugDumpRow();
        for (const [pid, row] of state.rows) {
            const rec = state.members.get(pid);
            const inHosp = rec && (rec.state === 'Hospital' || rec.state === 'Jail') && (rec.until || 0) > Time.nowSec();
            if (inHosp && state.settings.keepHospVisible) { row.li.classList.remove('wt-hidden-row'); continue; }
            applyRowVisibility(pid, rec || {});
        }
        sortAll();
        // prune dead rows
        for (const [pid, row] of state.rows) if (!row.li.isConnected) state.rows.delete(pid);
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 20. STYLES
     * ════════════════════════════════════════════════════════════════════════ */
    function injectStyles() {
        const css = `
        /* Managed status cell: lay out the callout button and countdown as a
           horizontal flex row so they never overlap. Button sits at the left,
           timer fills the rest and is fully visible. */
        .members-list div.status.wt-managed {
            position: relative;
            display: flex !important;
            align-items: center;
            justify-content: flex-end;
            gap: 4px;
            padding-right: 4px !important;
        }
        .members-list div.status [data-wt-hidden] { display: none !important; }
        .wt-countdown {
            display: inline-block;
            text-align: right;
            font-variant-numeric: tabular-nums;
            font-weight: 600;
            white-space: nowrap;
            flex: 0 1 auto;
            font-size: 12px;
        }
        .wt-countdown[data-kind="hosp"]   { color: var(--user-status-red-color, #e05038); }
        .wt-countdown[data-kind="urgent"] { color: #ff3b3b; }
        .wt-countdown[data-kind="travel"] { color: var(--user-status-blue-color, #4a90d9); font-weight: 500; }
        .wt-stats { display: block; font-size: 10px; font-weight: 600; line-height: 1.1; margin-top: 1px;
            color: #9be8a8; opacity: 0.9; white-space: nowrap; text-align: right; }
        body.wt-no-color .wt-countdown { color: inherit !important; }

        /* Offline/idle hiding */
        .members-list li.wt-hidden-row { display: none !important; }

        /* Soft row highlight when a hosp timer is under threshold */
        .members-list li.wt-highlight { background-color: rgba(224,80,56,0.10) !important; }
        :root .dark-mode .members-list li.wt-highlight { background-color: rgba(255,80,80,0.14) !important; }

        /* Callout buttons now live in the Attack column, to the RIGHT of the
           Attack link. Make the attack cell a flex row so the link and our
           buttons sit side by side without overlap. */
        .members-list .wt-callout-host {
            display: flex !important;
            align-items: center;
            gap: 4px;
            flex-wrap: nowrap;
        }
        .wt-callout {
            flex: 0 0 auto;
            order: 2;                        /* after the Attack link */
            position: static;
            transform: none;
            display: inline-flex; align-items: center; justify-content: center;
            width: 21px; height: 19px; font-size: 11px; line-height: 1;
            background: linear-gradient(180deg,#4a78b8,#2c4d7d);
            color: #fff !important; text-decoration: none !important;
            border: 1px solid #1b3358; border-radius: 3px; cursor: pointer; user-select: none;
            box-shadow: 0 1px 0 rgba(255,255,255,.15) inset, 0 2px 5px rgba(0,0,0,.55);
            transition: filter .1s, transform .1s; z-index: 5;
        }
        .wt-callout:hover  { filter: brightness(1.2); transform: scale(1.1); }
        .wt-callout:active { filter: brightness(.9); transform: scale(.95); }
        /* ⚡ sits just before 📢 (both after the Attack link) with amber tint */
        .wt-quick { order: 1; background: linear-gradient(180deg,#c8922e,#8a5f12); border-color: #6a4a10; }

        /* Modal */
        .wt-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 999999;
            display: flex; align-items: center; justify-content: center; font-family: Arial, sans-serif; }
        .wt-modal { background: #1e1e1e; color: #ddd; border: 1px solid #444; border-radius: 6px;
            width: 92vw; padding: 14px 16px 12px; box-shadow: 0 8px 32px rgba(0,0,0,.6); font-size: 13px; max-height: 88vh; overflow-y: auto; }
        .wt-modal h2 { font-size: 14px; margin: 0 0 10px; padding-bottom: 8px; border-bottom: 1px solid #333; color: #7ab3ff; }
        .wt-modal label { display: block; margin: 8px 0 3px; font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: .5px; }
        .wt-modal select, .wt-modal input[type=text], .wt-modal input[type=number], .wt-modal textarea {
            width: 100%; box-sizing: border-box; padding: 6px 8px; background: #111; color: #eee;
            border: 1px solid #444; border-radius: 3px; font-size: 13px; font-family: inherit; }
        .wt-modal textarea { resize: vertical; min-height: 54px; }
        .wt-row { display: flex; gap: 8px; } .wt-row > * { flex: 1; }
        .wt-preview { margin-top: 8px; padding: 8px 10px; background: #0d1c2e; border: 1px solid #284970;
            border-radius: 3px; color: #cfe4ff; min-height: 18px; word-wrap: break-word; }
        .wt-statline { margin-top: 8px; }
        .wt-stat-badge { display: inline-block; padding: 4px 9px; background: #16281a; border: 1px solid #2d5a35;
            border-radius: 4px; color: #9be8a8; font-size: 12px; font-weight: 600; }
        .wt-stat-badge.muted { background: #222; border-color: #3a3a3a; color: #888; font-weight: 500; }
        .wt-btns { display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end; }
        .wt-btns button { padding: 6px 14px; border-radius: 3px; cursor: pointer; font-size: 12px;
            border: 1px solid #444; background: #2a2a2a; color: #ddd; }
        .wt-btns button.primary { background: linear-gradient(180deg,#4a78b8,#2c4d7d); border-color: #1b3358; color: #fff; }
        .wt-btns button.danger { background: #5a2a2a; border-color: #7a3a3a; color: #fff; }
        .wt-btns button:hover { filter: brightness(1.15); }
        .wt-link { display: block; text-align: right; margin-top: 8px; font-size: 11px; color: #7ab3ff; cursor: pointer; text-decoration: underline; }
        .wt-help { font-size: 11px; color: #888; margin-top: 4px; line-height: 1.4; }
        .wt-switch { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #ddd; cursor: pointer;
            text-transform: none; letter-spacing: normal; margin: 6px 0; }
        .wt-switch input { width: 16px; height: 16px; cursor: pointer; margin: 0; accent-color: #4a78b8; }
        .wt-tpl-row { display: flex; gap: 6px; margin-bottom: 4px; }
        .wt-tpl-row input { flex: 1; } .wt-tpl-row .d { padding: 0 8px; flex: 0 0 auto; cursor: pointer; background: #3a2a2a; color: #f99; border: 1px solid #5a3a3a; border-radius: 3px; }
        .wt-tpl-add { margin-top: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer; background: #2a4a2a; color: #cfc; border: 1px solid #3a6a3a; border-radius: 3px; }
        .wt-key-save, .wt-ffs-save, .wt-ffs-test, .wt-preset-save, .wt-preset-del { padding: 6px 12px; background: #2a4a7a; color: #fff; border: 1px solid #3a5a8a; border-radius: 3px; cursor: pointer; white-space: nowrap; }
        .wt-preset-save { background: #2a5a3a; border-color: #3a7a4a; }
        .wt-ffs-test { background: #2a5a3a; border-color: #3a7a4a; }

        /* Toast */
        .wt-toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
            background: #2a4a7a; color: #fff; padding: 8px 16px; border-radius: 4px; font-size: 13px;
            z-index: 1000000; box-shadow: 0 2px 8px rgba(0,0,0,.5); pointer-events: none; opacity: 0; transition: opacity .2s; }
        .wt-toast.show { opacity: 1; }

        /* Gear */
        .wt-gear { position: fixed; top: 60px; left: 12px; width: 42px; height: 42px; border-radius: 50%;
            background: linear-gradient(180deg,#4a78b8,#2c4d7d); color: #fff; border: 1px solid #1b3358;
            box-shadow: 0 2px 8px rgba(0,0,0,.5), 0 1px 0 rgba(255,255,255,.15) inset; font-size: 20px;
            cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: center;
            z-index: 99998; transition: transform .15s, filter .15s; }
        .wt-gear:hover { filter: brightness(1.2); transform: scale(1.08); }
        .wt-gear:active { transform: scale(.95); }
        .wt-gear-tip { position: absolute; left: 52px; top: 50%; transform: translateY(-50%);
            background: rgba(0,0,0,.85); color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 11px;
            white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity .15s; }
        .wt-gear:hover .wt-gear-tip { opacity: 1; }
        /* Mass-callout floating button — sits just below the gear, top-left */
        .wt-mass-btn { position: fixed; top: 110px; left: 12px; width: 42px; height: 42px; border-radius: 50%;
            background: linear-gradient(180deg,#3a8a5a,#1f5a36); color: #fff; border: 1px solid #16401f;
            box-shadow: 0 2px 8px rgba(0,0,0,.5), 0 1px 0 rgba(255,255,255,.15) inset; font-size: 18px;
            cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: center;
            z-index: 99998; transition: transform .15s, filter .15s; }
        .wt-mass-btn:hover { filter: brightness(1.2); transform: scale(1.08); }
        .wt-mass-btn:active { transform: scale(.95); }
        .wt-mass-btn .wt-gear-tip { position: absolute; left: 52px; top: 50%; transform: translateY(-50%);
            background: rgba(0,0,0,.85); color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 11px;
            white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity .15s; }
        .wt-mass-btn:hover .wt-gear-tip { opacity: 1; }`;
        try { if (typeof GM_addStyle === 'function') { GM_addStyle(css); return; } } catch (_) {}
        document.head.appendChild(el('style', {}, css));
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 21. BOOTSTRAP
     * ════════════════════════════════════════════════════════════════════════ */
    function onWarReady() {
        if (state.warFound) return;
        state.warFound = true;
        LOG('war list detected — starting');
        hydrateFromCache();
        reconcile();
        poll();
        pollFFScouter();
    }

    function watchForWar() {
        const existing = $('#faction_war_list_id .faction-war') || $('.faction-war');
        if (existing) { onWarReady(); return; }
        const obs = new MutationObserver(() => {
            if ($('.faction-war')) { obs.disconnect(); onWarReady(); }
        });
        if (document.body) obs.observe(document.body, { childList: true, subtree: true });
        // Safety timeout: even on a plain faction page, show the gear so settings are reachable
        setTimeout(() => { if (!state.warFound && $('.faction-war')) onWarReady(); }, 10_000);
    }

    function start() {
        injectStyles();
        if (!state.settings.colorCountdowns) document.body?.classList.add('wt-no-color');
        ensureGear();
        watchForWar();

        // Timers
        setInterval(() => { if (state.running && state.warFound) poll(); }, 3_000); // poll() self-gates on cadence
        setInterval(() => { if (state.warFound) pollFFScouter(); }, 5_000);          // self-gates on FFS_POLL
        setInterval(() => { if (state.warFound && !document.hidden) tickCountdowns(); }, C.TICK_CLOCK);
        setInterval(() => { if (state.warFound) reconcile(); }, C.TICK_RECONCILE);
        setInterval(ensureGear, 3_000);

        // Repaint immediately when tab regains focus
        document.addEventListener('visibilitychange', () => { if (!document.hidden && state.warFound) { state.nextPollAllowedAt = 0; poll(); reconcile(); } });

        // Console handle
        const w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
        w.TornWarTools = {
            state, openSettings, openMassCallout, poll, pollFFScouter, version: VERSION,
            onlineState, reconcile,
            // Manual probe: TornWarTools.debugStates() prints every enemy row's detected state
            debugStates() {
                const out = [];
                for (const [pid, row] of state.rows) {
                    if (isOwnFaction(row.li)) continue;
                    const av = row.li.querySelector('a[data-label="avatar"]');
                    out.push({ pid, state: onlineState(row.li), avatarClass: av ? av.className : '(none)' });
                }
                console.table(out);
                return out;
            },
        };
        LOG(`v${VERSION} ready — ⚙ gear + 📋 mass-callout bottom-right`);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
