// ==UserScript==
// @name         Torn War Tools
// @namespace    iSatomi.torn.war.tools
// @version      3.9.2
// @description  War-page command center: live hospital/travel/jail countdowns, hospital-first sorting, status highlighting, and a per-enemy 📢 callout button that prepares customizable, timer-aware faction-chat drafts for manual sending. FFScouter stat-estimate integration ({stats}/{ff} placeholders + inline badges). Unified ⚙ settings panel. TornPDA-safe (GM_xmlhttpRequest transport).
// @author       iSatomi [3580191]
// @license      GPL-3.0
// @match        https://www.torn.com/factions.php*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.xmlHttpRequest
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

    const VERSION = '3.9.2';
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

    // Credentials never fall back to page storage. Legacy values are removed
    // only after a successful private-storage write and readback.
    const SecretStore = {
        eligible() {
            const info = typeof GM_info !== 'undefined' ? GM_info : (typeof GM !== 'undefined' ? GM.info : null);
            const pda = typeof PDA_storage !== 'undefined' || typeof PDA_getTabState === 'function' ||
                typeof flutter_inappwebview !== 'undefined' || typeof __tornpda !== 'undefined';
            return !pda && /^(Tampermonkey|Violentmonkey|Greasemonkey)$/i.test(info?.scriptHandler || '');
        },
        async get(key) {
            if (!this.eligible()) throw new Error('Private userscript storage is unavailable');
            if (typeof GM_getValue === 'function') return await GM_getValue(key, undefined);
            if (typeof GM !== 'undefined' && typeof GM.getValue === 'function') return await GM.getValue(key, undefined);
            throw new Error('Private userscript storage is unavailable');
        },
        async locked(action) {
            if (typeof navigator === 'undefined' || !navigator.locks?.request) throw new Error('Secure key updates require browser locking support');
            return navigator.locks.request('torn-war-tools-credentials', action);
        },
        async write(key, value) {
            if (!this.eligible()) throw new Error('Private userscript storage is unavailable');
            if (typeof value !== 'string' || (value !== '' && !/^[A-Za-z0-9]{16}$/.test(value))) throw new Error('Invalid private credential');
            if (typeof GM_setValue === 'function') await GM_setValue(key, value);
            else if (typeof GM !== 'undefined' && typeof GM.setValue === 'function') await GM.setValue(key, value);
            else throw new Error('Private userscript storage is unavailable');
            if (await this.get(key) !== value) throw new Error('Private key storage verification failed');
        },
        async set(key, value) { return this.locked(() => this.write(key, value)); },
        async migrate(key, aliases) {
            return this.locked(async () => {
                let value = await this.get(key);
                // Undefined means never configured; an explicit empty string is
                // a revocation tombstone and must never restore a page mirror.
                if (value === undefined) {
                    for (const alias of aliases) {
                        let legacy = null;
                        try { legacy = localStorage.getItem(alias); } catch (_) {}
                        if (!legacy) continue;
                        try { const decoded = JSON.parse(legacy); if (typeof decoded === 'string') legacy = decoded; } catch (_) {}
                        if (typeof legacy !== 'string' || !/^[A-Za-z0-9]{16}$/.test(legacy)) continue;
                        await this.write(key, legacy); value = legacy; break;
                    }
                }
                if (value !== undefined && (typeof value !== 'string' || (value !== '' && !/^[A-Za-z0-9]{16}$/.test(value)))) throw new Error('Invalid private credential');
                if (value !== undefined) for (const alias of aliases) { try { localStorage.removeItem(alias); } catch (_) {} }
                return value || '';
            });
        },
    };

    /* ════════════════════════════════════════════════════════════════════════
     * 3. APPLICATION STATE
     * Everything mutable lives here, so behavior is easy to trace and reset.
     * ════════════════════════════════════════════════════════════════════════ */
    const state = {
        apiKey: '',
        ffsKey: '',
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

    let credentialRefresh = null;
    async function refreshCredentials() {
        if (credentialRefresh) return credentialRefresh;
        credentialRefresh = (async () => {
            let torn = '', ffs = '';
            try { [torn, ffs] = await Promise.all([SecretStore.get(C.KEY_API), SecretStore.get('ffscouter-key')]); }
            catch (_) { /* Fail closed if private storage cannot be read. */ }
            torn = apiKeyValid(torn) ? torn : ''; ffs = apiKeyValid(ffs) ? ffs : '';
            if (torn !== state.apiKey || ffs !== state.ffsKey) {
                state.credentialEpoch = (state.credentialEpoch || 0) + 1;
                state.apiKey = torn; state.ffsKey = ffs;
                state.members.clear(); state.ffs.clear();
                state.nextPollAllowedAt = 0; state.nextFfsAllowedAt = 0;
            }
        })();
        try { await credentialRefresh; } finally { credentialRefresh = null; }
    }

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
     * page-level fetch/XHR interception (TornTools) and work on TornPDA. Fails closed
     * if no private GM HTTP API is granted.
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
                            if (r.status < 200 || r.status >= 300) throw new Error('HTTP failure');
                            resolve(JSON.parse(r.responseText));
                        } catch (e) {
                            // Non-JSON body (HTML error page, 403, etc.) — surface status + snippet
                            reject(new Error(`HTTP ${r.status}: invalid JSON response`));
                        }
                    },
                    onerror: (r) => reject(new Error(`network error (status ${r && r.status})`)),
                    ontimeout: () => reject(new Error('timeout')),
                });
            } else {
                reject(new Error('Private userscript HTTP transport is required'));
            }
        });
    }

    /* ════════════════════════════════════════════════════════════════════════
     * 7. API KEY MANAGEMENT
     * ════════════════════════════════════════════════════════════════════════ */
    function apiKeyValid(k) { return typeof k === 'string' && /^[A-Za-z0-9]{16}$/.test(k); }
    let keyChangePending = false;
    async function changeKey(kind, clear = false) {
        if (keyChangePending) return false;
        keyChangePending = true;
        try {
            const field = kind === 'torn' ? 'apiKey' : 'ffsKey';
            const storageKey = kind === 'torn' ? C.KEY_API : 'ffscouter-key';
            const input = clear ? '' : prompt(`Enter a 16-character ${kind === 'torn' ? 'Torn public' : 'FFScouter'} API key:`, '');
            if (input === null) return false;
            const value = input.trim();
            if (!clear && !apiKeyValid(value)) { Toast.show('Key must be 16 alphanumeric characters'); return false; }
            await SecretStore.set(storageKey, value);
            // Invalidate requests made with the previous key before publishing a new one.
            state.credentialEpoch = (state.credentialEpoch || 0) + 1;
            state[field] = value;
            state.members.clear(); state.ffs.clear();
            const aliases = kind === 'torn' ? [C.KEY_API, 'wt:' + C.KEY_API] : [C.KEY_FFS];
            for (const alias of aliases) { try { localStorage.removeItem(alias); } catch (_) {} }
            state.running = true; state.nextPollAllowedAt = 0; state.nextFfsAllowedAt = 0;
            Toast.show(clear ? 'Key cleared' : 'Key saved in private userscript storage');
            return true;
        } catch (_) {
            Toast.show('Could not save key privately. Existing storage was preserved.');
            return false;
        } finally { keyChangePending = false; }
    }
    function promptApiKey() { return changeKey('torn'); }
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
        await refreshCredentials();
        if (!apiKeyValid(state.apiKey) || state.pollPending) return;
        const now = Date.now();
        if (now < state.nextPollAllowedAt) return;
        state.lastPollAt = now;
        state.pollPending = true;
        const epoch = state.credentialEpoch;
        const key = state.apiKey;
        try {
        const fids = getFactionIds();
        for (const fid of fids) {
            let data;
            try {
                data = await httpGetJSON(`https://api.torn.com/faction/${fid}?selections=basic&key=${encodeURIComponent(key)}&comment=TornWarTools`);
            } catch (e) { LOG('request failed', e.message); continue; }

            await refreshCredentials();
            if (epoch !== state.credentialEpoch) return;
            if (data.error) {
                const code = data.error.code ?? data.error;
                LOG('API error', code);
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
        state.nextPollAllowedAt = Math.max(state.nextPollAllowedAt, Date.now() + (document.hidden ? C.POLL_HIDDEN : C.POLL_ACTIVE));
        } finally { state.pollPending = false; }
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
        if (!state.warFound) return;
        await refreshCredentials();
        if (!ffsKeyValid(state.ffsKey) || state.ffsPending) return;
        const now = Date.now();
        if (now < state.nextFfsAllowedAt) return;

        const ids = [];
        for (const [pid, row] of state.rows) {
            if (!isOwnFaction(row.li)) ids.push(pid);
        }
        if (!ids.length) return;
        state.nextFfsAllowedAt = now + C.FFS_POLL;
        state.ffsPending = true;
        const epoch = state.credentialEpoch;
        const key = state.ffsKey;
        try {
        for (let i = 0; i < ids.length; i += 200) {
            const chunk = ids.slice(i, i + 200);
            const url = `${C.FFS_ENDPOINT}?key=${encodeURIComponent(key)}&targets=${chunk.join(',')}&comment=TornWarTools`;
            let data;
            try {
                data = await httpGetJSON(url);
            } catch (_) { LOG('FFScouter request failed'); continue; }
            await refreshCredentials();
            if (epoch !== state.credentialEpoch) return;

            // Error envelope (FFScouter returns { error, code } or { message })
            if (data && (data.error || data.code) && !Array.isArray(data) && !data.results && !data.data) {
                const code = data.code ?? '?';
                const msg = 'FFScouter rejected the request';
                LOG('FFScouter API error — code', code, '·', msg);
                state.ffsLastError = `${code}: ${msg}`;
                if ([1, 2, 6, 7].includes(code) || /key/i.test(String(msg))) {
                    Toast.show('⚠ FFScouter key issue: ' + msg);
                }
                return;
            }

            const records = ffsExtractRecords(data);

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
        } finally { state.ffsPending = false; }
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
                title: 'Prepare callout (open editor)',
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
     * 14. FACTION CHAT DRAFT
     * ════════════════════════════════════════════════════════════════════════ */
    // Prepare a draft only. The user verifies the recipient and sends in Torn.
    function prepareFactionDraft(text) {
        if (typeof text !== 'string' || !text.trim()) return false;
        const visible = node => node.isConnected && node.getClientRects().length > 0 &&
            !node.closest('[hidden], [inert], [aria-hidden="true"]') && getComputedStyle(node).visibility === 'visible';
        const unverified = () => {
            Toast.show('Open your faction chat to prepare a draft, or use Copy. No chat was changed.');
            return false;
        };
        const launchers = $$('button[id="chat_panel_button:faction"]').filter(visible);
        const panels = $$('div[id="faction"]').filter(visible);
        if (launchers.length !== 1 || panels.length !== 1) return unverified();
        const factionName = launchers[0].getAttribute('title');
        if (!factionName?.trim()) return unverified();
        const panel = panels[0];
        const headers = [...panel.querySelectorAll(':scope > * > button[class*="header___"]')].filter(visible);
        if (headers.length !== 1) return unverified();
        const titles = [...headers[0].querySelectorAll('span[title]')].filter(visible);
        if (titles.length !== 1 || titles[0].getAttribute('title') !== factionName) return unverified();
        const candidates = [...panel.querySelectorAll('textarea[placeholder="Type your message here..."]')]
            .filter(node => visible(node) && !node.matches(':disabled') && !node.readOnly);
        if (candidates.length !== 1) return unverified();
        const ta = candidates[0];
        if (ta.value !== '') { Toast.show('Faction chat already contains a draft; it was preserved'); return false; }
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        setter ? setter.call(ta, text) : (ta.value = text);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));
        ta.focus();
        Toast.show('Draft ready in faction chat. Review it and send manually.');
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

    // One-tap quick call: compose from saved settings and prepare a draft,
    // no modal. Used by the ⚡ button.
    function quickCallout(pid) {
        const text = composeCallout(pid);
        if (prepareFactionDraft(text)) {
            Toast.show('⚡ ' + text.slice(0, 44) + (text.length > 44 ? '…' : ''));
        }
    }

    /* ════════════════════════════════════════════════════════════════════════
     * MASS CALLOUT
     * Compiles a multi-line target list for every (filtered) enemy, sortable by
     * FF, hospital time, stats, or name, and prepares it for faction chat (chunked
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
                <button class="primary send">Prepare faction draft</button>
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
                ? `Copy as ${chunks.length} messages and send each part manually (chat length limit).`
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
            if (chunks.length !== 1) {
                Toast.show('This list spans multiple messages. Use Copy and send each part manually.');
                return;
            }
            if (prepareFactionDraft(chunks[0])) bg.remove();
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
    let activeWarModal = null;
    function modalShell(maxWidth = 420) {
        activeWarModal?.remove();
        const bg = el('div', { class: 'wt-modal-bg', onclick: (e) => { if (e.target === bg) bg.remove(); } });
        const box = el('div', { class: 'wt-modal', style: `max-width:${maxWidth}px` });
        bg.appendChild(box);
        const nativeRemove = bg.remove.bind(bg);
        const onEsc = (e) => { if (e.key === 'Escape') bg.remove(); };
        // Existing cancel/save/backdrop handlers all call bg.remove(). Keep
        // their behavior while releasing this modal's owned listener.
        bg.remove = () => {
            document.removeEventListener('keydown', onEsc);
            if (activeWarModal === bg) activeWarModal = null;
            nativeRemove();
        };
        activeWarModal = bg;
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
                <button class="primary send">Prepare faction draft</button>
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
            if (prepareFactionDraft(text)) bg.remove();
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
            <label class="wt-switch"><input type="checkbox" class="wt-quick"><span>Show ⚡ quick-call button (prepare draft, last-used template)</span></label>
            <div class="wt-help" style="margin-top:6px;margin-bottom:2px">Show callout buttons on which enemies:</div>
            <label class="wt-switch"><input type="checkbox" class="wt-cs-hosp"><span>In hospital</span></label>
            <label class="wt-switch"><input type="checkbox" class="wt-cs-okay"><span>Okay / attackable now</span></label>
            <label class="wt-switch"><input type="checkbox" class="wt-cs-travel"><span>Traveling / abroad</span></label>

            <label style="margin-top:14px">Torn API key</label>
            <div class="wt-row" style="align-items:center">
                <span class="wt-key-status"></span>
                <button class="wt-key-save" style="flex:0 0 auto">Set key</button><button class="wt-key-clear">Clear</button>
            </div>
            <div class="wt-help">Read-only faction status. A public key is enough.</div>

            <label style="margin-top:14px">FFScouter API key (stat estimates)</label>
            <div class="wt-row" style="align-items:center">
                <span class="wt-ffs-key-status"></span>
                <button class="wt-ffs-save" style="flex:0 0 auto">Set key</button><button class="wt-ffs-clear">Clear</button>
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
        const keyStatus = () => {
            q('.wt-key-status').textContent = apiKeyValid(state.apiKey) ? 'Key saved privately' : 'No key';
            q('.wt-ffs-key-status').textContent = ffsKeyValid(state.ffsKey) ? 'Key saved privately' : 'No key';
        };
        keyStatus();
        q('.wt-key-save').onclick = async () => { await changeKey('torn'); keyStatus(); };
        q('.wt-key-clear').onclick = async () => { await changeKey('torn', true); keyStatus(); };
        q('.wt-ffs-save').onclick = async () => { await changeKey('ffs'); keyStatus(); };
        q('.wt-ffs-clear').onclick = async () => { await changeKey('ffs', true); keyStatus(); };
        q('.wt-ffs-test').onclick = async () => {
            const statusEl = q('.wt-ffs-status');
            const key = state.ffsKey;
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
                    statusEl.textContent = 'FFScouter rejected the test request';
                } else if (recs.length) {
                    const rec = ffsReadRecord(recs[0]);
                    statusEl.innerHTML = `<span style="color:#9be8a8">✓ Works — player ${esc(rec.pid || '?')}: ~${esc(rec.est || '?')}, FF ${rec.ff != null ? rec.ff.toFixed(2) : '?'}</span>`;
                } else {
                    statusEl.textContent = 'Connected but no usable records';
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

    async function start() {
        state.credentialEpoch = 0;
        let migrationFailed = false;
        try { state.apiKey = await SecretStore.migrate(C.KEY_API, [C.KEY_API, 'wt:' + C.KEY_API]); } catch (_) { migrationFailed = true; }
        try { state.ffsKey = await SecretStore.migrate('ffscouter-key', [C.KEY_FFS]); } catch (_) { migrationFailed = true; }
        injectStyles();
        if (migrationFailed) Toast.show('Private key migration failed. Legacy storage was preserved. Secure updates require browser locking support.');
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

        // Do not export state or privileged functions into the page.
        LOG(`v${VERSION} ready — ⚙ gear + 📋 mass-callout bottom-right`);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
// SCRIPT HUB ADAPTER START
// Public appearance data only. These functions are bundled into userscripts.
function normalizeScriptUiTheme(raw) {
  const record=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key)?object[key]:undefined;
  raw=record(raw);if(own(raw,'version')!==undefined&&own(raw,'version')!==1)raw={};
  const choice=(key,allowed,fallback)=>allowed.includes(own(raw,key))?own(raw,key):fallback;
  const bounded=(key,min,max,fallback)=>typeof own(raw,key)==='number'&&Number.isFinite(own(raw,key))?Math.max(min,Math.min(max,own(raw,key))):fallback;
  const colors={light:{},dark:{}};
  const roles=['background','surface','raised','text','muted','border','accent','success','warning','error','focus','selection','chart1','chart2','chart3','chart4','chart5','chart6'];
  for(const mode of ['light','dark']){
    const input=record(own(record(own(raw,'colors')),mode));
    for(const role of roles){const value=own(input,role);if(typeof value==='string'&&/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value))colors[mode][role]=(value.length===4?'#'+[...value.slice(1)].map(c=>c+c).join(''):value).toLowerCase();}
  }
  return {version:1,layout:choice('layout',['frostbite','workbench','torn','stock'],'frostbite'),palette:choice('palette',['frostbite','workbench','torn','stock'],'frostbite'),
    mode:choice('mode',['system','dark','light'],'system'),density:choice('density',['comfortable','compact'],'comfortable'),
    radius:bounded('radius',0,18,null),fontScale:bounded('fontScale',.85,1.35,1),colors};
}

function resolveScriptUiTheme(raw, dark=false) {
  const theme=normalizeScriptUiTheme(raw),mode=theme.mode==='system'?(dark?'dark':'light'):theme.mode;
  // Each palette owns color roles only; layout defaults never select a palette.
  const bases={
    frostbite:{light:['#edf4fa','#ffffff','#e4edf6','#172b40','#4b6075','#bdcedd','#2563a8'],dark:['#0b1421','#111f31','#1a2c42','#e7f0fa','#a4b8cc','#3e546d','#69b5ff']},
    workbench:{light:['#e9e9f0','#ffffff','#f3f2f8','#302c40','#666078','#d3cede','#7051a2'],dark:['#202028','#2a2933','#34323f','#edeaf5','#b7b0c7','#4a4559','#c4a6f5']},
    torn:{light:['#e9e9e9','#ffffff','#dddddd','#222222','#555555','#bbbbbb','#416c38'],dark:['#181818','#242424','#333333','#eeeeee','#bbbbbb','#555555','#91be71']},
    stock:{light:['#edf4f3','#ffffff','#ddeceb','#182d2d','#486363','#9bb8b6','#1a696a'],dark:['#101212','#191c1c','#203030','#e5ebeb','#a3b2b2','#3c5555','#68c3c5']}
  };
  const [background,surface,raised,text,muted,border,accent]=bases[theme.palette][mode];
  const states=mode==='dark'?{success:'#83d99a',warning:'#f4ca68',error:'#ff9696',focus:'#b3d8ff',selection:'#2e4866'}:{success:'#23743c',warning:'#865600',error:'#b42328',focus:'#175fc4',selection:'#c5ddf5'};
  const chart=mode==='dark'?['#78b6ff','#e8b86a','#b29bff','#6ad0bf','#ed99bb','#b1ce78']:['#2866ae','#946000','#7547b5','#187c70','#ad426f','#657c24'];
  if(theme.palette==='stock'){states.focus=accent;states.selection=mode==='dark'?'#223b3b':'#c8e5e2';}
  const colors={background,surface,raised,text,muted,border,accent,...states,...Object.fromEntries(chart.map((value,i)=>['chart'+(i+1),value])),...theme.colors[mode]};
  const luminance=hex=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  colors.onAccent=ratio('#ffffff',colors.accent)>=ratio('#000000',colors.accent)?'#ffffff':'#000000';
  const acrossSurfaces=role=>Math.min(...['background','surface','raised'].map(key=>ratio(colors[role],colors[key])));
  const contrast={text:acrossSurfaces('text'),muted:acrossSurfaces('muted'),onAccent:ratio(colors.onAccent,colors.accent),flags:[]};
  for(const role of ['text','muted','onAccent'])if(contrast[role]<4.5)contrast.flags.push(role);
  if(ratio(colors.focus,colors.surface)<3)contrast.flags.push('focus');
  return {...theme,mode,colors,contrast};
}

function applyScriptUiTheme(node, raw, dark=false) {
  const resolved=resolveScriptUiTheme(raw,dark);
  for(const [role,value]of Object.entries(resolved.colors))node.style.setProperty('--tsui-'+role.replace(/[A-Z]/g,char=>'-'+char.toLowerCase()),value);
  const defaults={frostbite:12,workbench:6,torn:3,stock:6};
  node.style.setProperty('--tsui-radius',(resolved.radius===null?defaults[resolved.layout]:resolved.radius)+'px');
  node.style.setProperty('--tsui-font-scale',String(resolved.fontScale));
  node.style.setProperty('--tsui-space',resolved.density==='compact'?'6px':'10px');
  node.style.setProperty('--tsui-control-height',resolved.density==='compact'?'32px':'38px');
  node.setAttribute('data-tsui-layout',resolved.layout);node.setAttribute('data-tsui-density',resolved.density);node.setAttribute('data-tsui-mode',resolved.mode);
  return resolved;
}

function scriptUiThemeCss() {
  return `.tsui-surface{box-sizing:border-box;color:var(--tsui-text);background:var(--tsui-background);border:1px solid var(--tsui-border);border-radius:var(--tsui-radius);font-size:calc(14px * var(--tsui-font-scale,1));color-scheme:light;accent-color:var(--tsui-accent)}
.tsui-surface[data-tsui-mode="dark"]{color-scheme:dark}
.tsui-surface *{box-sizing:border-box}.tsui-surface ::selection{background:var(--tsui-selection);color:var(--tsui-text)}
.tsui-surface :is(button,input,select,textarea){font:inherit;color:var(--tsui-text);background:var(--tsui-surface);border:1px solid var(--tsui-border);border-radius:calc(var(--tsui-radius) / 2);min-height:var(--tsui-control-height);padding:var(--tsui-space)}
.tsui-surface button{cursor:pointer}.tsui-surface :disabled{cursor:default;opacity:.6}.tsui-surface :focus-visible{outline:2px solid var(--tsui-focus);outline-offset:2px}
.tsui-surface .tsui-primary{color:var(--tsui-on-accent);background:var(--tsui-accent)}.tsui-surface .tsui-muted{color:var(--tsui-muted)}
@media(pointer:coarse),(max-width:600px){.tsui-surface :is(button,input,select,textarea){min-height:44px}.tsui-surface :is(input,select,textarea){font-size:max(16px,1em)}}
@media(prefers-reduced-motion:reduce){.tsui-surface,.tsui-surface *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}`;
}
const SCRIPT_UI_THEME_KEY='torn-script-hub:ui-theme:v1';
const SCRIPT_UI_THEME_EVENT=SCRIPT_UI_THEME_KEY+':changed';

function createScriptUiThemeClient({doc,win,scriptId,read=()=>null,write=()=>{},onChange=()=>{}}) {
  if(typeof scriptId!=='string'||!scriptId.length||scriptId.length>80)throw new TypeError('A bounded scriptId is required.');
  // The builder concatenates the contract first; Node loads the same contract.
  const normalize=typeof normalizeScriptUiTheme==='function'?normalizeScriptUiTheme:require('./script-hub-theme.cjs').normalizeScriptUiTheme;
  let started=false,suspended=false,pdaActive=true,pending=true,override=null,globalTheme=normalize(),effective=normalize();
  let generation=0,overrideRevision=0,pdaRevision=0,readTask=null,lastSignature='',lastDark=null,writeQueue=Promise.resolve(),cancelPdaQuery=null;
  const removers=[],subscribers=new Set();
  let media=null;try{media=win.matchMedia?.('(prefers-color-scheme: dark)');}catch(_){}
  const active=()=>started&&!suspended&&pdaActive&&doc.visibilityState!=='hidden';
  const clone=theme=>normalize(theme);
  const parse=value=>{if(typeof value!=='string'||value.length>8192)return null;try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&(!Object.prototype.hasOwnProperty.call(parsed,'version')||parsed.version===1)?normalize(parsed):null;}catch(_){return null;}};
  function loadGlobal(){
    try{
      const current=parse(win.localStorage?.getItem(SCRIPT_UI_THEME_KEY));if(current)return current;
      const text=win.localStorage?.getItem('torn-script-hub:v2:preferences');
      if(typeof text==='string'&&text.length<=32768){const old=JSON.parse(text);if(old&&typeof old==='object'&&!Array.isArray(old)&&['torn','dark','light'].includes(old.theme))return normalize({layout:'torn',palette:'torn',mode:old.theme==='light'?'light':'dark',density:old.compact===true?'compact':'comfortable',colors:{light:{accent:old.accent},dark:{accent:old.accent}}});}
      return normalize();
    }catch(_){return normalize();}
  }
  function emit(force=false){
    if(!active()){pending=true;return;}
    effective=clone(override||globalTheme);const signature=JSON.stringify(effective),dark=media?.matches===true;
    if(force||signature!==lastSignature||(effective.mode==='system'&&dark!==lastDark)){
      lastSignature=signature;lastDark=dark;onChange(clone(effective));
      for(const listener of subscribers){try{listener(clone(effective));}catch(_){}}
    }
    pending=false;
  }
  function listen(target,name,callback){target.addEventListener(name,callback);removers.push(()=>target.removeEventListener(name,callback));}
  async function refresh(){
    pending=true;if(!active())return get();
    if(readTask)return readTask;
    const ownGeneration=generation,revision=overrideRevision;
    readTask=(async()=>{
      let value;try{value=await read();}catch(_){value=undefined;}
      if(!started||generation!==ownGeneration)return get();
      if(overrideRevision===revision&&value!==undefined)override=value===null?null:normalize(value);
      globalTheme=loadGlobal();emit();return get();
    })();
    try{return await readTask;}finally{if(generation===ownGeneration)readTask=null;}
  }
  function get(){return clone(override||globalTheme);}
  function publicChange(event){
    const value=parse(event.detail);if(!value)return;
    // Events never carry settings or credentials; only the appearance allowlist survives.
    globalTheme=value;pending=true;if(active())emit();
  }
  function storageChange(event){if(event.key!==SCRIPT_UI_THEME_KEY&&event.key!==null)return;pending=true;if(active()){globalTheme=loadGlobal();emit();}}
  function visibility(){if(active()&&pending)void refresh();}
  function tabState(event){
    const state=event.detail;if(!state||typeof state.isActiveTab!=='boolean'||typeof state.isWebViewVisible!=='boolean')return;
    pdaRevision++;pdaActive=state.isActiveTab&&state.isWebViewVisible;
    const awaitingQuery=!!cancelPdaQuery;cancelPdaQuery?.();
    if(active()&&pending&&!awaitingQuery)void refresh();
  }
  function pagehide(event){if(event.persisted){suspended=true;pending=true;}else stop();}
  function pageshow(event){if(event.persisted){suspended=false;pending=true;if(active())void refresh();}}
  function mediaChange(){if(active())emit();else pending=true;}
  async function start(){
    if(started)return refresh();started=true;suspended=false;pending=true;lastSignature='';lastDark=null;
    const ownGeneration=++generation;
    listen(doc,SCRIPT_UI_THEME_EVENT,publicChange);listen(win,SCRIPT_UI_THEME_EVENT,publicChange);listen(win,'storage',storageChange);
    listen(doc,'visibilitychange',visibility);listen(win,'tornpda:tabState',tabState);listen(win,'pagehide',pagehide);listen(win,'pageshow',pageshow);
    if(media?.addEventListener)listen(media,'change',mediaChange);
    else if(media?.addListener){media.addListener(mediaChange);removers.push(()=>media.removeListener(mediaChange));}
    if(typeof win.PDA_getTabState==='function'){
      const revision=pdaRevision;pdaActive=false;
      const state=await new Promise(resolve=>{
        const schedule=win.setTimeout?.bind(win)||setTimeout,clear=win.clearTimeout?.bind(win)||clearTimeout;
        let settled=false,timer=null;
        const finish=value=>{if(settled)return;settled=true;if(timer!==null)clear(timer);if(cancelPdaQuery===finish)cancelPdaQuery=null;resolve(value);};
        cancelPdaQuery=finish;timer=schedule(()=>finish(undefined),750);
        Promise.resolve().then(()=>started&&generation===ownGeneration?win.PDA_getTabState():undefined).then(finish,()=>finish(undefined));
      });
      if(started&&generation===ownGeneration&&revision===pdaRevision)pdaActive=!(state?.isActiveTab===false||state?.isWebViewVisible===false);
    }
    if(started&&generation===ownGeneration)return refresh();return get();
  }
  function stop(){started=false;suspended=false;generation++;readTask=null;cancelPdaQuery?.();for(const remove of removers.splice(0))remove();}
  function setOverride(value){
    const normalized=value===null?null:normalize(value);overrideRevision++;
    const run=async()=>{await write(normalized===null?null:clone(normalized));override=normalized;globalTheme=loadGlobal();emit();return get();};
    const task=writeQueue.then(run);writeQueue=task.catch(()=>{});return task;
  }
  function subscribe(listener){if(typeof listener!=='function')throw new TypeError('Theme listener must be a function');subscribers.add(listener);return()=>subscribers.delete(listener);}
  return {start,stop,get,setOverride,refresh,subscribe};
}
// DOM attributes coordinate independently bundled windows; no callbacks or data cross worlds.
function scriptUiFloatingOwner(doc,node) {
  let owner=null;
  for(let current=node;current&&current!==doc.body&&current!==doc.documentElement;current=current.parentElement){
    if(doc.defaultView.getComputedStyle(current).position==='fixed')owner=current;
  }
  return owner;
}
function scriptUiFloatingWindows(doc) {
  const nodes=new Set(doc.querySelectorAll('[data-tsui-kit="1"][data-tsui-surface="floating"],#tsh-dialog,[data-tsui-stack-window="1"]'));
  for(const root of doc.querySelectorAll('.tsui-legacy-surface')){const owner=scriptUiFloatingOwner(doc,root);if(owner)nodes.add(owner);}
  return Array.from(nodes)
    .filter(node=>!node.hidden&&node.isConnected&&node.getClientRects().length)
    .sort((a,b)=>{
      const rank=node=>{const value=Number(node.getAttribute('data-tsui-stack'));return Number.isSafeInteger(value)&&value>=0&&value<1000000?value:0;};
      return rank(a)-rank(b);
    });
}
function focusScriptUiWindow(doc,node) {
  const windows=scriptUiFloatingWindows(doc),index=windows.indexOf(node);
  if(index!==-1){windows.splice(index,1);windows.push(node);}
  windows.forEach((entry,i)=>{entry.setAttribute('data-tsui-stack',String(i));entry.style.zIndex=String(2147481000+i*2);});
  return windows.length;
}
// Original, bundled vector artwork. Colors inherit theme roles; no remote assets or user data.
function appendScriptUiHeaderArt(doc,header) {
  const mark=doc.createElement('span');mark.className='tsui-theme-mark';mark.setAttribute('aria-hidden','true');
  mark.innerHTML='<svg class="tsui-frost-mark" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M16 3v26M5 9l22 14M5 23L27 9M12 6l4 4 4-4M12 26l4-4 4 4M5 14l5-1-1-5M23 24l-1-5 5-1M5 18l5 1-1 5M23 8l-1 5 5 1"/><path d="m16 11 4 2v6l-4 2-4-2v-6z"/></svg><svg class="tsui-workbench-mark" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="4" y="5" width="24" height="22" rx="3"/><path d="M4 11h24M12 11v16M8 8h1m3 0h1m3 0h1M16 16l3 3-3 3m6 0h3"/></svg><svg class="tsui-torn-mark" viewBox="0 0 32 32" fill="currentColor"><path d="M3 26h26v3H3zm2-9h5v8H5zm7-10h8v18h-8zm10 6h5v12h-5zM14 3h4v3h-4z"/><path d="M14 10h1v2h-1zm3 0h1v2h-1zm-3 5h1v2h-1zm3 0h1v2h-1z" fill="var(--tsui-raised)"/></svg>';
  const scene=doc.createElement('span');scene.className='tsui-theme-scene';scene.setAttribute('aria-hidden','true');
  scene.innerHTML='<svg viewBox="0 0 300 72" preserveAspectRatio="xMaxYMid slice" fill="none" stroke="currentColor"><path d="m0 72 52-38 30 18 49-45 41 35 27-18 46 34 55-42v56z" fill="currentColor" opacity=".09" stroke="none"/><path d="m0 72 52-38 30 18 49-45 41 35 27-18 46 34 55-42M97 39l34-32 5 35 22 15m-70-2 43-48 41 35m-120-8 7 30m140-40 11 39" opacity=".45"/><path d="M260 6v18m-8-14 16 10m-16 0 16-10M224 8v8m-4-6 8 4m-8 0 8-4" opacity=".7"/></svg>';
  header.prepend(mark);header.append(scene);
}
function scriptUiIdentityCss(scope) {
  return `${scope} .tsui-theme-mark{display:none;flex:none;width:30px;height:30px;color:var(--tsui-accent);pointer-events:none}
${scope} .tsui-theme-mark svg{display:none;width:100%;height:100%}
${scope}[data-tsui-layout] .tsui-theme-mark{display:block}
${scope}[data-tsui-layout=frostbite] .tsui-frost-mark,${scope}[data-tsui-layout=workbench] .tsui-workbench-mark,${scope}[data-tsui-layout=torn] .tsui-torn-mark{display:block}
${scope} .tsui-theme-scene{display:none;position:absolute;inset:0 0 0 auto;width:min(44%,300px);overflow:hidden;color:var(--tsui-accent);opacity:.45;pointer-events:none;z-index:-1}
${scope} .tsui-theme-scene svg{width:100%;height:100%}
${scope}[data-tsui-layout=frostbite] .tsui-theme-scene{display:block}
${scope}[data-tsui-layout=frostbite] .tsui-header,${scope}[data-tsui-layout=frostbite] .tsh-header{isolation:isolate}
${scope}[data-tsui-layout=torn] .tsui-theme-mark{width:22px;height:22px}
@media(max-width:600px){${scope} .tsui-theme-mark{width:24px;height:24px}${scope} .tsui-theme-scene{opacity:.28;width:38%}}`;
}
'use strict';

/** Shared, framework-free native script surfaces. No network or storage is owned here.
 * createTornScriptUI({doc,win,id,title,surface,mount,applyTheme,theme,themeClient,
 *   ownsThemeClient:false,sections:[{id,label,node,footer,headerAction,render(host,ui)}],settings,inspector,
 *   onVisibilityChange(active),onSelect(id),onClose(),onDestroy(),autoDestroyOnDetach:true,
 *   readLayout(),writeLayout({version:1,desktop,mobile})}).
 * Layout adapters are optional, may be async, and receive only a bounded geometry
 * profile (x/y/width/height/locked/collapsed/selected). Mount never waits for IO;
 * interaction wins over a pending read. Writes coalesce to one pending snapshot.
 * Render callbacks run once; their optional returned cleanup runs on destroy.
 * A section node and the public content/settings/inspector slots are escape hatches
 * for native script UI. Scripts own drafts, refreshes, jobs, persistence and secrets.
 * themeClient supports get/start/stop; use setTheme in its onChange callback.
 * notice(text,{kind}), status(text), task({id,label,onCancel,onPause,onResume}),
 * table({columns:[{key,label}],rows,limit}) are bounded text-only helpers.
 * Tasks never cancel implicitly; visibility is reported for script-owned policies.
 */
function createTornScriptUI(options = {}) {
  const doc = options.doc;
  const win = options.win || (doc && doc.defaultView);
  if (!doc || typeof doc.createElement !== 'function' || !win) throw new TypeError('UI kit requires a document and window');
  if (typeof options.applyTheme !== 'function') throw new TypeError('UI kit requires applyTheme');
  // Isolated userscript worlds share DOM, but cannot safely share JS objects.
  // Only version, visibility and stack order cross this coordination boundary.
  let style = doc.querySelector('style[data-tsui-style="1"]');
  if (!style) {
    style = doc.createElement('style'); style.setAttribute('data-tsui-style', '1');
    (doc.head || doc.documentElement).append(style);
  }
  // Independently updated scripts can arrive in either order. Upgrade older
  // shared CSS once, while leaving a future revision owned by a newer bundle.
  const styleRevision=Number(style.getAttribute('data-tsui-style-revision'));
  if(!Number.isSafeInteger(styleRevision)||styleRevision<3){style.textContent=scriptUiKitCss();style.setAttribute('data-tsui-style-revision','3');}
  let launcherTray = doc.querySelector('[data-tsui-launchers="1"]');
  if (!launcherTray) {
    launcherTray = doc.createElement('div'); launcherTray.className = 'tsui-launchers';
    launcherTray.setAttribute('data-tsui-launchers', '1');
    (doc.body || doc.documentElement).append(launcherTray);
  }
  const cleanups = [];
  const tasks = new Map();
  const sections = new Map();
  const floating = options.surface !== 'embedded';
  // PDA capabilities are independent of viewport size; desktop touch stays desktop.
  function pdaOpening() { return floating && (typeof PDA_storage !== 'undefined' && !!PDA_storage || typeof win.PDA_getTabState === 'function' || typeof win.PDA_httpGet === 'function'); }
  let destroyed = false, shown = true, collapsed = false, minimized = false, maximized = false, locked = false;
  let pdaActive = typeof win.PDA_getTabState !== 'function', pageActive = true, pdaRevision = 0, lastActive, gesture = null, selected = null, returnFocus = null;
  let pdaTimer = null;
  function clearPdaTimer() { if (pdaTimer !== null) { win.clearTimeout(pdaTimer); pdaTimer = null; } }
  let currentTheme = {}, explicitDark;
  let themeQueued = false, nextTask = 0;
  const firstTheme=options.theme||(options.themeClient?.get?options.themeClient.get():{});
  const initial = { x: 24, y: 40, width: firstTheme?.layout==='stock'?340:760, height: firstTheme?.layout==='stock'?760:540 };
  let rect = { ...initial }, previousRect = null;
  let booting = true, visibilityQueued = false, writingLayout = false, persistQueued = false, pendingLayout = null;
  let layoutLoading = floating && typeof options.readLayout === 'function';
  const editedGeometry = new Set(), editedSelection = new Set();
  let currentProfile = profileName();
  let profiles = { desktop: normalizeProfile(), mobile: normalizeProfile() };
  function profileName() { const view = viewport(); return view.width <= 600 || view.height <= 500 ? 'mobile' : 'desktop'; }
  function normalizeProfile(value) {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const normalized = { ...initial, locked: raw.locked === true, collapsed: raw.collapsed === true, selected: typeof raw.selected === 'string' ? raw.selected.slice(0, 100) : null };
    for (const key of ['x', 'y', 'width', 'height']) {
      if (typeof raw[key] === 'number' && Number.isFinite(raw[key]) && raw[key] >= 0 && raw[key] <= (key === 'x' || key === 'y' ? 100000 : 4096)) normalized[key] = raw[key];
    }
    return normalized;
  }
  function snapshotProfile() { return normalizeProfile({ ...(maximized && previousRect ? previousRect : rect), locked, collapsed, selected }); }
  function rememberLayout(geometryChanged = true) {
    if (booting || destroyed || !floating) return;
    if (layoutLoading) (geometryChanged ? editedGeometry : editedSelection).add(currentProfile);
    profiles[currentProfile] = snapshotProfile();
    if (typeof options.writeLayout !== 'function') return;
    pendingLayout = { version: 1, desktop: { ...profiles.desktop }, mobile: { ...profiles.mobile } };
    queuePersist();
  }
  function queuePersist() {
    if (layoutLoading || persistQueued || writingLayout || !pendingLayout || destroyed || doc.visibilityState === 'hidden' || !pdaActive || !pageActive) return;
    persistQueued = true;
    Promise.resolve().then(async () => {
      persistQueued = false; if (layoutLoading || destroyed || !pendingLayout || doc.visibilityState === 'hidden' || !pdaActive || !pageActive) return;
      const value = pendingLayout; pendingLayout = null; writingLayout = true;
      try { await options.writeLayout(value); } catch (_) { if (!destroyed) notice('Window layout could not be saved.', { kind: 'error' }); }
      finally { writingLayout = false; queuePersist(); }
    });
  }
  function applyProfile(value) {
    const normalized = normalizeProfile(value);
    rect = { x: normalized.x, y: normalized.y, width: normalized.width, height: normalized.height };
    locked = normalized.locked; collapsed = maximized ? false : normalized.collapsed;
    if (maximized) previousRect = { ...rect };
    if (normalized.selected && sections.has(normalized.selected)) {
      const wasBooting = booting; booting = true; select(normalized.selected); booting = wasBooting;
    }
    update();
  }
  function viewportChanged() {
    const nextProfile = profileName();
    if (nextProfile !== currentProfile) {
      profiles[currentProfile] = snapshotProfile(); currentProfile = nextProfile;
      applyProfile(profiles[currentProfile]);
    } else fit();
  }
  function node(tag, className, text) {
    const value = doc.createElement(tag);
    if (className) value.className = className;
    if (text !== undefined) value.textContent = String(text).slice(0, 4000);
    return value;
  }
  function listen(target, type, callback, opts) {
    target.addEventListener(type, callback, opts);
    cleanups.push(() => target.removeEventListener(type, callback, opts));
  }
  function button(text, label, callback, parent) {
    const value = node('button', '', text); value.type = 'button';
    value.setAttribute('aria-label', label);
    listen(value, 'click', callback); if (parent) parent.append(value);
    return value;
  }
  const root = node('section', 'tsui-root');
  root.setAttribute('data-tsui-kit', '1');
  root.dataset.tsuiId = String(options.id || 'script-ui').slice(0, 100);
  root.dataset.tsuiSurface = floating ? 'floating' : 'embedded';
  root.setAttribute('aria-label', String(options.title || 'Script tool').slice(0, 200));
  root.tabIndex = -1;
  const dragStrip=node('div','tsui-drag-strip','⠿ drag');dragStrip.tabIndex=0;dragStrip.setAttribute('role','button');dragStrip.setAttribute('aria-label','Move '+(options.title||'Script tool'));
  const header = node('header', 'tsui-header');
  const title = node('div', 'tsui-title', options.title || 'Script tool');
  title.tabIndex = 0;
  title.setAttribute('aria-label', 'Move ' + (options.title || 'Script tool'));
  title.title = 'Drag to move. Focus and use arrow keys to move; Shift + arrows resize. Escape cancels a drag.';
  const controls = node('div', 'tsui-controls');
  const headerActions=node('div','tsui-header-actions');controls.append(headerActions);
  header.append(title, controls);
  if(typeof appendScriptUiHeaderArt==='function')appendScriptUiHeaderArt(doc,header);
  const body = node('div', 'tsui-body');
  const nav = node('nav', 'tsui-nav'); nav.setAttribute('aria-label', 'Tool pages');
  const content = node('div', 'tsui-content');
  const settings = node('aside', 'tsui-settings'); settings.setAttribute('aria-label', 'Tool settings');
  const inspector = node('aside', 'tsui-inspector'); inspector.setAttribute('aria-label', 'Details');
  if (options.settings) settings.append(options.settings);
  if (options.inspector) inspector.append(options.inspector);
  body.append(nav, content, settings, inspector);
  const footer = node('footer', 'tsui-footer');
  const statusNode = node('div', 'tsui-status'); statusNode.setAttribute('role', 'status');
  const notices = node('div', 'tsui-notices'); notices.setAttribute('aria-live', 'polite');
  const taskList = node('div', 'tsui-tasks');
  footer.append(statusNode, notices, taskList);
  const sectionFooters=node('div','tsui-section-footers');
  const resize = node('div', 'tsui-resize'); resize.setAttribute('aria-hidden', 'true');
  root.append(dragStrip,header, body,sectionFooters, footer, resize);
  const launcher = button(options.title || 'Script tool', 'Restore ' + (options.title || 'Script tool'), () => { restore(); focus(); });
  launcher.className = 'tsui-launcher'; launcher.hidden = true;
  const mount = options.mount || doc.body || doc.documentElement;
  mount.append(root);
  // A DOM-owned tray gives independently bundled launchers native flex sizing,
  // wrapping and scrolling. Each host still owns its private handlers and tokens.
  const launcherHost = node('div', 'tsui-launcher-host'); launcherHost.setAttribute('data-tsui-launcher-host', '1');
  launcherHost.hidden = true; launcherHost.append(launcher); launcherTray.append(launcherHost);

  function active() { return !destroyed && shown && !minimized && !collapsed && pageActive && doc.visibilityState !== 'hidden' && pdaActive; }
  function visibility() {
    // Consumers may still be moving their content into the returned shell.
    // Initial notifications must run after construction and caller assignment.
    if(booting){
      if(!visibilityQueued){visibilityQueued=true;Promise.resolve().then(()=>{visibilityQueued=false;if(!destroyed)visibility();});}
      return;
    }
    queuePersist();
    const value = active();
    if (value === lastActive) return;
    lastActive = value;
    if (!value) endGesture(true);
    if (typeof options.onVisibilityChange === 'function') options.onVisibilityChange(value);
  }
  function viewport() {
    return { width: Math.max(1, Math.min(win.innerWidth || 1024, win.visualViewport ? win.visualViewport.width : Infinity)), height: Math.max(1, Math.min(win.innerHeight || 768, win.visualViewport ? win.visualViewport.height : Infinity)) };
  }
  function fit() {
    if (destroyed || !floating) return;
    const view = viewport(), inset = Math.min(8, view.width / 8, view.height / 8);
    const maxWidth = Math.max(1, view.width - inset * 2), maxHeight = Math.max(1, view.height - inset * 2);
    if (maximized) rect = { x: inset, y: inset, width: maxWidth, height: maxHeight };
    else {
      rect.width = Math.min(maxWidth, Math.max(Math.min(320, maxWidth), rect.width));
      rect.height = Math.min(maxHeight, Math.max(Math.min(180, maxHeight), rect.height));
      rect.x = Math.max(inset, Math.min(view.width - rect.width - inset, rect.x));
      rect.y = Math.max(inset, Math.min(view.height - (collapsed ? Math.min(92, rect.height) : rect.height) - inset, rect.y));
    }
    Object.assign(root.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: collapsed ? 'auto' : rect.height + 'px' });
  }
  function focus() {
    if (destroyed) return;
    if(typeof focusScriptUiWindow==='function'){
      const count=focusScriptUiWindow(doc,root);launcherTray.style.zIndex=String(2147481001+count*2);stackLaunchers();return;
    }
    const windows = floatingRoots();
    const index = windows.indexOf(root);
    if (index !== -1) { windows.splice(index, 1); windows.push(root); }
    windows.forEach((entry, i) => { entry.setAttribute('data-tsui-stack', String(i)); entry.style.zIndex = String(100000 + i * 2); });
    launcherTray.style.zIndex = String(100001 + windows.length * 2);
    stackLaunchers();
  }
  function floatingRoots() {
    if(typeof scriptUiFloatingWindows==='function')return scriptUiFloatingWindows(doc);
    return Array.from(doc.querySelectorAll('[data-tsui-kit="1"][data-tsui-surface="floating"]'))
      .filter(entry => !entry.hidden && entry.isConnected && entry.getClientRects().length)
      .sort((left, right) => {
        const rank = entry => { const value = Number(entry.getAttribute('data-tsui-stack')); return Number.isSafeInteger(value) && value >= 0 && value < 1000000 ? value : 0; };
        return rank(left) - rank(right);
      });
  }
  function stackLaunchers() {
    launcherTray.hidden = !Array.from(launcherTray.children).some(entry => !entry.hidden);
  }
  function update() {
    if (destroyed) return;
    root.hidden = !shown || minimized; launcherHost.hidden = launcher.hidden = !shown || !minimized;
    body.hidden = collapsed; footer.hidden = collapsed;sectionFooters.hidden=collapsed;
    if(!shown||minimized||collapsed)closeWindowOptions();
    root.dataset.tsuiCollapsed = String(collapsed); root.dataset.tsuiLocked = String(locked);root.dataset.tsuiMaximized=String(maximized);root.dataset.tsuiPda=String(pdaOpening());
    collapseButton.textContent = collapsed ? 'Expand' : 'Collapse'; collapseButton.setAttribute('aria-expanded', String(!collapsed));
    lockButton.textContent = locked ? 'Unlock' : 'Lock'; lockButton.setAttribute('aria-pressed', String(locked));
    resize.hidden = !floating || locked || maximized || collapsed;
    fit(); visibility(); stackLaunchers();
  }
  function show() { if (destroyed) return; shown = true; if (pdaOpening()) maximize(false); else update(); focus(); }
  function hide() { if (destroyed) return; shown = false; update(); }
  function close() { if (destroyed || !shown) return; hide(); if (typeof options.onClose === 'function') options.onClose(); }
  function collapse(value = !collapsed) { if (destroyed || collapsed === !!value) return; collapsed = !!value; update(); rememberLayout(); }
  function minimize() { if (destroyed) return; returnFocus = doc.activeElement; minimized = true; update(); launcher.focus(); }
  function maximize(remember = true) { if (destroyed || !floating) return; if (!maximized) previousRect = { ...rect }; maximized = true; minimized = collapsed = false; update(); if (remember) rememberLayout(); }
  function restore() {
    if (destroyed) return;
    const reopening = minimized || !shown;
    if (maximized && previousRect) rect = { ...previousRect };
    maximized = minimized = collapsed = false; shown = true; update();
    if (reopening && pdaOpening()) maximize(false);
    if (returnFocus && root.contains(returnFocus)) returnFocus.focus(); else title.focus();
    returnFocus = null;
    rememberLayout();
  }
  function setLocked(value) { if (destroyed || locked === !!value) return; locked = !!value; endGesture(true); update(); rememberLayout(); }
  function reset() { if (destroyed) return; rect = { ...initial }; maximized = minimized = collapsed = locked = false; shown = true; update(); rememberLayout(); }
  function endGesture(cancel) {
    if (!gesture) return;
    const old = gesture; gesture = null;
    if (cancel) { rect = old.start; fit(); }
    try { if (old.target.hasPointerCapture(old.pointerId)) old.target.releasePointerCapture(old.pointerId); } catch (_) {}
    root.classList.remove('tsui-gesturing');
    if (!cancel) rememberLayout();
  }
  function beginGesture(event, kind) {
    if (!floating || locked || maximized || event.button !== 0 || gesture || !active() || viewport().width <= 600 || event.pointerType === 'touch') return;
    if (layoutLoading) editedGeometry.add(currentProfile);
    focus(); gesture = { kind, pointerId: event.pointerId, target: event.currentTarget, start: { ...rect }, x: event.clientX, y: event.clientY };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_) {}
    root.classList.add('tsui-gesturing'); event.preventDefault();
  }
  const collapseButton = button('Collapse', 'Collapse or expand', () => collapse(), controls);
  const optionsToggle=button('⋯','Window options',()=>{const open=optionsToggle.getAttribute('aria-expanded')!=='true';optionsToggle.setAttribute('aria-expanded',String(open));windowOptions.dataset.open=String(open);if(open)windowOptions.querySelector('button')?.focus();},controls);
  optionsToggle.className='tsui-window-options-toggle';optionsToggle.setAttribute('aria-expanded','false');
  const windowOptions=node('div','tsui-window-options');windowOptions.setAttribute('role','group');windowOptions.setAttribute('aria-label','Window controls');controls.append(windowOptions);
  function closeWindowOptions(){optionsToggle.setAttribute('aria-expanded','false');windowOptions.dataset.open='false';}
  const lockButton = button('Lock', 'Lock or unlock position', () => setLocked(!locked), windowOptions);
  button('Reset', 'Reset window position', reset, windowOptions);
  if (floating) {
    button('Minimize', 'Minimize window', minimize, windowOptions);
    button('Maximize', 'Maximize or restore window', () => maximized ? restore() : maximize(), windowOptions);
  } else { lockButton.hidden = true; controls.querySelector('[aria-label="Reset window position"]').hidden = true; }
  button('×', 'Close window', close, controls);
  listen(doc,'pointerdown',event=>{if(!controls.contains(event.target))closeWindowOptions();});
  listen(title, 'pointerdown', event => beginGesture(event, 'move'));
  listen(dragStrip,'pointerdown',event=>beginGesture(event,'move'));
  listen(resize, 'pointerdown', event => beginGesture(event, 'resize'));
  listen(win, 'pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    rect = { ...gesture.start };
    if (gesture.kind === 'move') { rect.x += dx; rect.y += dy; } else { rect.width += dx; rect.height += dy; }
    fit();
  });
  listen(win, 'pointerup', event => { if (gesture && event.pointerId === gesture.pointerId) endGesture(false); });
  listen(win, 'pointercancel', () => endGesture(true));
  listen(win, 'blur', () => endGesture(true));
  listen(title, 'lostpointercapture', () => endGesture(true));
  listen(dragStrip,'lostpointercapture',()=>endGesture(true));
  listen(resize, 'lostpointercapture', () => endGesture(true));
  function moveKey(event) {
    if (!floating || locked || maximized || !/^Arrow(Left|Right|Up|Down)$/.test(event.key)) return;
    const delta = /Left|Up/.test(event.key) ? -10 : 10;
    const horizontal = /Left|Right/.test(event.key);
    rect[event.shiftKey ? horizontal ? 'width' : 'height' : horizontal ? 'x' : 'y'] += delta;
    fit(); rememberLayout(); event.preventDefault();
  }
  listen(title,'keydown',moveKey);listen(dragStrip,'keydown',moveKey);
  listen(root, 'pointerdown', focus);
  listen(root, 'focusin', focus);
  listen(doc, 'keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const top = floatingRoots().at(-1);
    if (top !== root) return;
    if(optionsToggle.getAttribute('aria-expanded')==='true'){closeWindowOptions();optionsToggle.focus();}
    else if (gesture) endGesture(true);
    else if (maximized) restore();
    else collapse();
    event.preventDefault();
  });
  listen(win, 'resize', viewportChanged);
  if (win.visualViewport) listen(win.visualViewport, 'resize', viewportChanged);
  listen(doc, 'visibilitychange', visibility);
  listen(win, 'pagehide', event => { if (!event.persisted) destroy(); else { pageActive = false; visibility(); } });
  listen(win, 'pageshow', () => { pageActive = true; visibility(); });
  listen(win, 'tornpda:tabState', event => {
    const detail = event.detail;
    if (!detail || typeof detail.isActiveTab !== 'boolean' || typeof detail.isWebViewVisible !== 'boolean') return;
    clearPdaTimer(); pdaRevision++; pdaActive = detail.isActiveTab && detail.isWebViewVisible; visibility();
  });
  if (typeof win.PDA_getTabState === 'function') {
    const revision = pdaRevision;
    function settleInitialPda(detail) {
      if (destroyed || revision !== pdaRevision) return;
      clearPdaTimer(); pdaRevision++;
      // Older or sleeping PDA bridges can return nothing or never settle.
      // Fall back to ordinary document visibility after a bounded wait.
      pdaActive = !detail || typeof detail.isActiveTab !== 'boolean' || typeof detail.isWebViewVisible !== 'boolean'
        ? true : detail.isActiveTab && detail.isWebViewVisible;
      visibility();
    }
    pdaTimer = win.setTimeout(() => settleInitialPda(null), 750);
    Promise.resolve().then(() => win.PDA_getTabState()).then(settleInitialPda, () => settleInitialPda(null));
  }
  function setTheme(theme, dark) {
    if (destroyed) return;
    closeWindowOptions();
    currentTheme = theme || {}; explicitDark = dark;
    const effectiveDark = typeof dark === 'boolean' ? dark : !!(win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches);
    options.applyTheme(root, currentTheme, effectiveDark);
    options.applyTheme(launcherHost, currentTheme, effectiveDark);
    fit();
  }
  if (typeof win.matchMedia === 'function') {
    const media = win.matchMedia('(prefers-color-scheme: dark)');
    if (media.addEventListener) listen(media, 'change', () => setTheme(currentTheme, explicitDark));
  }
  const client = options.themeClient;
  function queueTheme() {
    if (themeQueued || destroyed) return;
    themeQueued = true;
    // Read after every event listener has run, including a later client listener.
    Promise.resolve().then(() => { themeQueued = false; if (!destroyed && client.get) setTheme(client.get()); });
  }
  if (client && typeof client.subscribe === 'function') cleanups.push(client.subscribe(theme => setTheme(theme)));
  else if (client) {
    listen(doc, 'torn-script-hub:ui-theme:v1:changed', queueTheme);
    listen(win, 'torn-script-hub:ui-theme:v1:changed', queueTheme);
  }
  function select(id) {
    if (destroyed || !sections.has(id)) return false;
    const changed = selected !== id;
    selected = id;
    for (const [key, section] of sections) {
      section.host.hidden = key !== id; section.button.setAttribute('aria-current', key === id ? 'page' : 'false');
      if(section.footer)section.footer.hidden=key!==id;
      if(section.headerButton)section.headerButton.setAttribute('aria-pressed',String(key===id));
    }
    if (changed && !booting) rememberLayout(false);
    if (changed && typeof options.onSelect === 'function') options.onSelect(id);
    return true;
  }
  function notice(text, config = {}) {
    if (destroyed) return null;
    const item = node('div', 'tsui-notice');
    item.dataset.kind = ['success', 'warning', 'error'].includes(config.kind) ? config.kind : 'info';
    item.append(node('span', '', text));
    const dismiss = node('button', '', 'Dismiss'); dismiss.type = 'button'; dismiss.setAttribute('aria-label', 'Dismiss notice');
    dismiss.addEventListener('click', () => item.remove(), { once: true }); item.append(dismiss);
    notices.append(item);
    while (notices.children.length > 5) notices.firstElementChild.remove();
    return item;
  }
  function status(text) { if (!destroyed) statusNode.textContent = String(text || '').slice(0, 500); }
  function task(config = {}) {
    if (destroyed) return null;
    const id = String(config.id || 'task-' + nextTask++).slice(0, 100);
    if (tasks.has(id)) return tasks.get(id);
    if (tasks.size >= 8) { notice('Finish an existing task before adding another.', { kind: 'warning' }); return null; }
    const host = node('div', 'tsui-task');
    const label = node('span', '', config.label || 'Task');
    const progress = node('progress'); progress.max = 100; progress.removeAttribute('value');
    progress.setAttribute('aria-label', String(config.label || 'Task').slice(0, 100));
    host.append(label, progress);
    let ended = false, paused = false;
    const taskCleanups = [];
    // Task controls own their listeners, so finishing work releases callback closures.
    function taskButton(text, accessible, callback) {
      const value = node('button', '', text); value.type = 'button'; value.setAttribute('aria-label', accessible);
      value.addEventListener('click', callback); taskCleanups.push(() => value.removeEventListener('click', callback)); host.append(value); return value;
    }
    function finish() { if (ended) return; ended = true; taskCleanups.splice(0).forEach(fn => fn()); host.remove(); tasks.delete(id); }
    if (typeof config.onCancel === 'function') taskButton('Cancel', 'Cancel ' + (config.label || 'Task'), () => { finish(); config.onCancel(); });
    if (typeof config.onPause === 'function' && typeof config.onResume === 'function') {
      const pause = taskButton('Pause', 'Pause or resume ' + (config.label || 'Task'), () => { paused = !paused; pause.textContent = paused ? 'Resume' : 'Pause'; if (paused) config.onPause(); else config.onResume(); });
    }
    const controller = { update(value = {}) { if (ended || destroyed) return; if (value.label !== undefined) label.textContent = String(value.label).slice(0, 200); if (typeof value.progress === 'number' && Number.isFinite(value.progress)) progress.value = Math.max(0, Math.min(100, value.progress)); }, finish };
    tasks.set(id, controller); taskList.append(host); return controller;
  }
  function table(config = {}) {
    const wrap = node('div', 'tsui-table-scroll'); wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', String(config.label || 'Data table').slice(0, 100));
    const tableNode = node('table'), head = node('thead'), row = node('tr'), tbody = node('tbody');
    const columns = Array.isArray(config.columns) ? config.columns.slice(0, 20) : [];
    for (const column of columns) { const th = node('th', '', column.label || column.key); th.scope = 'col'; row.append(th); }
    head.append(row);
    const limit = Number.isInteger(config.limit) ? Math.max(0, Math.min(500, config.limit)) : 100;
    for (const item of (Array.isArray(config.rows) ? config.rows : []).slice(0, limit)) {
      const tr = node('tr'); for (const column of columns) tr.append(node('td', '', item && item[column.key] != null ? item[column.key] : '')); tbody.append(tr);
    }
    tableNode.append(head, tbody); wrap.append(tableNode); return wrap;
  }
  function destroy() {
    if (destroyed) return;
    endGesture(true); clearPdaTimer(); destroyed = true; pendingLayout = null; visibility();
    for (const value of tasks.values()) value.finish(); tasks.clear();
    cleanups.splice(0).reverse().forEach(fn => fn());
    if (client && options.ownsThemeClient && typeof client.stop === 'function') client.stop();
    root.remove(); launcherHost.remove();
    if (!doc.querySelector('[data-tsui-kit="1"]')) style.remove();
    if (!launcherTray.children.length) launcherTray.remove(); else stackLaunchers();
    if (typeof options.onDestroy === 'function') options.onDestroy();
  }
  const api = { root, content, settings, inspector, nav, launcherHost, setTheme, select, show, hide, close, collapse, minimize, maximize, restore, setLocked, reset, focus, notice, status, task, table, destroy,
    getState: () => ({ shown, collapsed, minimized, maximized, locked, destroyed, active: active(), selected, rect: { ...rect } }) };
  for (const section of (Array.isArray(options.sections) ? options.sections : []).slice(0, 30)) {
    const id = String(section.id || ''); if (!id || sections.has(id)) continue;
    const host = node('div', 'tsui-page');
    const navButton = button(section.label || id, section.label || id, () => select(id), nav);
    if (section.node) host.append(section.node);
    let footerHost=null,headerButton=null;
    if(section.footer){footerHost=node('div','tsui-section-footer');footerHost.append(section.footer);sectionFooters.append(footerHost);}
    if(typeof section.headerAction==='string'){navButton.dataset.tsuiHeaderAction='true';headerButton=button(section.headerAction.slice(0,4),section.label||id,()=>select(id),headerActions);headerButton.setAttribute('aria-pressed','false');}
    content.append(host); sections.set(id, { host, button: navButton,footer:footerHost,headerButton });
    if (typeof section.render === 'function') { const cleanup = section.render(host, api); if (typeof cleanup === 'function') cleanups.push(cleanup); }
  }
  if (sections.size) select(sections.keys().next().value);
  if (client && typeof client.start === 'function' && options.ownsThemeClient) client.start();
  setTheme(options.theme || (client && client.get ? client.get() : {}), options.dark);
  if (options.autoDestroyOnDetach !== false && typeof win.MutationObserver === 'function') {
    const observer = new win.MutationObserver(() => { if (!root.isConnected) destroy(); });
    observer.observe(doc.documentElement, { childList: true, subtree: true }); cleanups.push(() => observer.disconnect());
  }
  if (pdaOpening()) maximize(false); else update();
  focus();
  booting = false;
  if (floating && typeof options.readLayout === 'function') {
    let timer;
    const deadline = new Promise((_, reject) => { timer = win.setTimeout(() => reject(new Error('Layout read timed out')), 1500); });
    cleanups.push(() => win.clearTimeout(timer));
    Promise.race([Promise.resolve().then(() => options.readLayout()), deadline]).then(value => {
      if (destroyed || !value || typeof value !== 'object' || value.version !== 1) return;
      const restored = { desktop: normalizeProfile(value.desktop), mobile: normalizeProfile(value.mobile) };
      profiles[currentProfile] = snapshotProfile();
      for (const name of ['desktop', 'mobile']) {
        if (editedGeometry.has(name)) restored[name] = profiles[name];
        else if (editedSelection.has(name)) restored[name].selected = profiles[name].selected;
      }
      profiles = restored; applyProfile(profiles[currentProfile]);
      if (pendingLayout) pendingLayout = { version: 1, desktop: { ...profiles.desktop }, mobile: { ...profiles.mobile } };
    }).catch(() => { if (!destroyed) notice('Saved window layout could not be loaded.', { kind: 'warning' }); })
      .finally(() => { win.clearTimeout(timer); layoutLoading = false; editedGeometry.clear(); editedSelection.clear(); queuePersist(); });
  }
  return api;
}

function scriptUiKitCss() {
  return (typeof scriptUiIdentityCss==='function'?scriptUiIdentityCss('.tsui-root'):'')+`
.tsui-root,.tsui-launcher-host{font:calc(14px * var(--tsui-font-scale,1))/1.45 system-ui,sans-serif;color:var(--tsui-text,#e5eaf2);color-scheme:light;box-sizing:border-box}.tsui-root[data-tsui-mode=dark],.tsui-launcher-host[data-tsui-mode=dark]{color-scheme:dark}
.tsui-root *,.tsui-launcher-host *{box-sizing:border-box}.tsui-root[hidden],.tsui-root [hidden],.tsui-launchers[hidden],.tsui-launcher-host[hidden],.tsui-launcher-host [hidden]{display:none!important}
.tsui-root{background:var(--tsui-background,#171d28);border:1px solid var(--tsui-border,#506076);border-radius:var(--tsui-radius,12px);overflow:hidden;min-width:0;display:flex;flex-direction:column;isolation:isolate}
.tsui-root[data-tsui-surface=floating]{position:fixed;box-shadow:0 18px 60px #0007;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px)}
.tsui-root[data-tsui-surface=embedded]{position:relative;width:100%;min-height:220px;max-height:80dvh}
.tsui-header{position:relative;display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:var(--tsui-space,10px);background:var(--tsui-raised,#242d3c);border-bottom:1px solid var(--tsui-border,#506076);flex:none}
.tsui-title{font-weight:750;flex:1;min-width:90px;cursor:move;touch-action:none;padding:6px}.tsui-controls{display:flex;flex-wrap:wrap;gap:4px}
.tsui-drag-strip,.tsui-header-actions,.tsui-root .tsui-window-options-toggle{display:none}.tsui-window-options{display:contents}.tsui-section-footers{flex:none;max-height:44%;overflow:auto}.tsui-section-footers:empty,.tsui-section-footers:not(:has(.tsui-section-footer:not([hidden]))){display:none}.tsui-section-footer{border-top:1px solid var(--tsui-border);background:var(--tsui-raised);padding:10px}
.tsui-root button,.tsui-launcher{font:inherit;cursor:pointer;color:inherit;background:var(--tsui-surface,#242d3c);border:1px solid var(--tsui-border,#506076);border-radius:var(--tsui-radius,6px);padding:6px 10px;min-height:var(--tsui-control-height,34px)}
.tsui-root button:not(:disabled):hover{background:var(--tsui-selection,#38455b)}.tsui-root :focus-visible,.tsui-launcher:focus-visible{outline:2px solid var(--tsui-focus,#8fbcff);outline-offset:2px}
.tsui-root :is(button,input,select,textarea):disabled{opacity:.55;cursor:default}
.tsui-root .tsui-primary,.tsui-root .tsui-primary:not(:disabled):hover{background:var(--tsui-accent,#96b9ff);color:var(--tsui-on-accent,#101828);border-color:var(--tsui-accent,#96b9ff);font-weight:600}
.tsui-root :is(.tsui-controls,.tsui-nav) button:focus-visible{outline-offset:-3px}
.tsui-root input,.tsui-root select,.tsui-root textarea{font:inherit;color:inherit;background:var(--tsui-surface,#242d3c);border:1px solid var(--tsui-border,#506076);border-radius:4px;padding:8px;max-width:100%}
.tsui-body{display:grid;grid-template-columns:140px minmax(0,1fr);grid-template-rows:minmax(0,1fr) auto auto;min-height:0;flex:1;overflow:auto}.tsui-root[data-tsui-layout=frostbite] .tsui-nav{background:var(--tsui-surface,#242d3c)}.tsui-nav{display:flex;flex-direction:column;gap:6px;padding:10px;border-right:1px solid var(--tsui-border,#506076);grid-row:1/-1}
.tsui-nav:empty,.tsui-settings:empty,.tsui-inspector:empty{display:none}.tsui-body:not(:has(.tsui-nav button)){grid-template-columns:minmax(0,1fr)}
.tsui-nav button{text-align:left}.tsui-nav button[aria-current=page]{border-color:var(--tsui-accent,#96b9ff);background:var(--tsui-selection,#38455b);font-weight:bold}
.tsui-content{min-width:0;padding:16px;overflow:auto;scrollbar-gutter:stable;grid-column:2}.tsui-body:not(:has(.tsui-nav button)) .tsui-content{grid-column:1}.tsui-settings,.tsui-inspector{padding:12px;min-width:0;grid-column:2;border-top:1px solid var(--tsui-border,#506076)}
.tsui-footer{padding:8px 16px;border-top:1px solid var(--tsui-border,#506076);max-height:34%;overflow:auto;flex:none}.tsui-status:empty,.tsui-notices:empty,.tsui-tasks:empty{display:none}.tsui-footer:not(:has(.tsui-status:not(:empty),.tsui-notice,.tsui-task)){display:none}
.tsui-notice,.tsui-task{display:flex;align-items:center;gap:8px;margin:4px 0}.tsui-notice span,.tsui-task span{flex:1;overflow-wrap:anywhere}.tsui-notice[data-kind=error]{color:var(--tsui-error,#ff9e9e)}.tsui-notice[data-kind=warning]{color:var(--tsui-warning,#f4ce83)}.tsui-notice[data-kind=success]{color:var(--tsui-success,#a4dfb6)}.tsui-task progress{width:90px}
.tsui-resize{position:absolute;right:0;bottom:0;width:22px;height:22px;cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 55%,var(--tsui-border,#506076) 56%,transparent 65%)}.tsui-gesturing{user-select:none}
.tsui-launchers{position:fixed;bottom:max(12px,env(safe-area-inset-bottom));right:max(12px,env(safe-area-inset-right));width:max-content;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;align-items:stretch;gap:12px;overflow:auto;box-sizing:border-box;padding:2px}
.tsui-launcher-host{position:relative;max-width:100%;flex:none}.tsui-launcher{max-width:100%;overflow-wrap:anywhere;white-space:normal;width:100%}
.tsui-table-scroll{max-width:100%;overflow:auto}.tsui-root table{border-collapse:collapse;width:100%}.tsui-root th,.tsui-root td{text-align:left;border-bottom:1px solid var(--tsui-border,#506076);padding:8px;overflow-wrap:anywhere}
.tsui-root[data-tsui-layout=workbench] .tsui-body,.tsui-root[data-tsui-layout=torn] .tsui-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto auto}.tsui-root[data-tsui-layout=workbench] .tsui-content,.tsui-root[data-tsui-layout=torn] .tsui-content{grid-column:1}
.tsui-root[data-tsui-layout=workbench] .tsui-nav,.tsui-root[data-tsui-layout=torn] .tsui-nav{flex-direction:row;flex-wrap:wrap;border-right:0;border-bottom:1px solid var(--tsui-border,#506076);grid-row:auto}
.tsui-root[data-tsui-layout=workbench] .tsui-nav{padding-bottom:0;gap:2px}.tsui-root[data-tsui-layout=workbench] .tsui-nav button{border-bottom-left-radius:0;border-bottom-right-radius:0}.tsui-root[data-tsui-layout=workbench] .tsui-settings,.tsui-root[data-tsui-layout=workbench] .tsui-inspector{grid-column:1}
.tsui-root[data-tsui-layout=frostbite] .tsui-header{background:linear-gradient(115deg,var(--tsui-surface),var(--tsui-raised));min-height:70px;padding:12px 16px}.tsui-root[data-tsui-layout=frostbite] .tsui-nav{background:var(--tsui-background)}.tsui-root[data-tsui-layout=frostbite] .tsui-nav button[aria-current=page]{box-shadow:inset 3px 0 0 var(--tsui-accent)}
.tsui-root[data-tsui-layout=workbench] .tsui-header{background:var(--tsui-background);padding:8px 12px}.tsui-root[data-tsui-layout=workbench] .tsui-title{font-family:Consolas,"SFMono-Regular",monospace;font-size:.95em}.tsui-root[data-tsui-layout=workbench] .tsui-nav{background:var(--tsui-background);gap:0;padding-top:0}.tsui-root[data-tsui-layout=workbench] .tsui-nav button{border-top:2px solid var(--tsui-background);border-bottom:0;color:var(--tsui-muted);background:var(--tsui-background);padding:9px 14px}.tsui-root[data-tsui-layout=workbench] .tsui-nav button[aria-current=page]{border-top-color:var(--tsui-accent);background:var(--tsui-surface);color:var(--tsui-text)}.tsui-root[data-tsui-layout=workbench] .tsui-inspector{background:var(--tsui-background)}
.tsui-root[data-tsui-layout=torn]{box-shadow:inset 0 0 0 2px var(--tsui-surface),0 18px 60px #0007}.tsui-root[data-tsui-layout=torn] .tsui-header{padding:5px 8px;background:linear-gradient(var(--tsui-raised),var(--tsui-surface));border-top:2px solid var(--tsui-accent);box-shadow:inset 0 1px 0 var(--tsui-surface)}.tsui-root[data-tsui-layout=torn] .tsui-title{font-family:Arial,Helvetica,sans-serif;font-size:.92em;letter-spacing:.025em;text-transform:uppercase}.tsui-root[data-tsui-layout=torn] .tsui-nav{padding:5px;gap:4px;background:var(--tsui-raised);box-shadow:inset 0 1px 0 var(--tsui-surface)}.tsui-root[data-tsui-layout=torn] .tsui-nav button{padding:5px 10px;font-size:.9em;font-weight:700}.tsui-root[data-tsui-layout=torn] .tsui-content{padding:10px;background:var(--tsui-surface)}.tsui-root[data-tsui-layout=torn] :is(th,td){padding:6px 8px}.tsui-root[data-tsui-layout=torn] th{background:linear-gradient(var(--tsui-raised),var(--tsui-surface));font-size:.9em}.tsui-root[data-tsui-layout=torn] tbody tr:nth-child(even){background:var(--tsui-raised)}.tsui-root[data-tsui-layout=torn] .tsui-settings,.tsui-root[data-tsui-layout=torn] .tsui-inspector{grid-column:1}
@media(min-width:850px){.tsui-root[data-tsui-layout=workbench] .tsui-body:has(.tsui-inspector:not(:empty)){grid-template-columns:minmax(0,1fr) 180px}.tsui-root[data-tsui-layout=workbench] .tsui-nav{grid-column:1/-1}.tsui-root[data-tsui-layout=workbench] .tsui-inspector{grid-column:2;grid-row:2/4;border-left:1px solid var(--tsui-border,#506076)}}
@media(max-width:600px),(pointer:coarse){.tsui-root button,.tsui-launcher{min-height:44px}.tsui-root input,.tsui-root select,.tsui-root textarea{font-size:16px}.tsui-header{gap:4px;padding:6px}.tsui-controls{width:100%;overflow:auto;flex-wrap:nowrap}.tsui-controls button{flex:1;padding:4px;font-size:12px}.tsui-root .tsui-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto auto auto;align-content:start}.tsui-root .tsui-nav{flex-direction:row;flex-wrap:wrap;border-right:0;border-bottom:1px solid var(--tsui-border,#506076);padding:6px;grid-row:auto}.tsui-root .tsui-content{padding:10px;grid-column:1;overflow:visible}.tsui-root .tsui-settings,.tsui-root .tsui-inspector{grid-column:1;grid-row:auto}.tsui-resize{display:none}.tsui-title{touch-action:auto;cursor:default}.tsui-task{flex-wrap:wrap}}
@media(prefers-reduced-motion:reduce){.tsui-root *{animation:none!important;transition:none!important}}
.tsui-root[data-tsui-layout=stock]{font-family:Arial,Helvetica,sans-serif;font-size:calc(13px * var(--tsui-font-scale,1))}
.tsui-root[data-tsui-layout=stock] .tsui-theme-mark{display:none}
.tsui-root[data-tsui-layout=stock][data-tsui-surface=floating]:not([data-tsui-maximized=true]) .tsui-drag-strip{display:block;background:var(--tsui-selection);color:var(--tsui-muted);font:10px/18px Consolas,monospace;letter-spacing:2px;text-align:center;cursor:move;touch-action:none;border-bottom:1px solid var(--tsui-border);flex:none}
.tsui-root[data-tsui-layout=stock] .tsui-header{padding:7px 10px;gap:6px;flex-wrap:nowrap;background:var(--tsui-raised);z-index:3}
.tsui-root[data-tsui-layout=stock] .tsui-title{font-size:1em;font-weight:600;color:var(--tsui-accent);padding:3px 0;min-width:60px;overflow-wrap:anywhere}
.tsui-root[data-tsui-layout=stock] .tsui-controls{width:auto;flex-wrap:nowrap;overflow:visible;gap:4px;flex:none}
.tsui-root[data-tsui-layout=stock] .tsui-header-actions{display:flex;gap:4px}.tsui-root[data-tsui-layout=stock] .tsui-header-actions:empty{display:none}
.tsui-root[data-tsui-layout=stock] .tsui-controls>button,.tsui-root[data-tsui-layout=stock] .tsui-header-actions>button{width:30px;min-height:30px;padding:3px;border-radius:3px;color:var(--tsui-accent)}
.tsui-root[data-tsui-layout=stock] .tsui-window-options-toggle{display:block}
.tsui-root[data-tsui-layout=stock] .tsui-controls>[aria-label="Collapse or expand"]{font-size:0}.tsui-root[data-tsui-layout=stock] .tsui-controls>[aria-label="Collapse or expand"]:before{content:'▴';font-size:16px}
.tsui-root[data-tsui-layout=stock][data-tsui-collapsed=true] .tsui-controls>[aria-label="Collapse or expand"]:before{content:'▾'}
.tsui-root[data-tsui-layout=stock] .tsui-window-options{display:none;position:absolute;right:8px;top:calc(100% + 3px);width:190px;max-height:min(250px,60dvh);overflow:auto;padding:6px;background:var(--tsui-surface);border:1px solid var(--tsui-border);border-radius:var(--tsui-radius);box-shadow:0 6px 20px #0006}
.tsui-root[data-tsui-layout=stock] .tsui-window-options[data-open=true]{display:flex;flex-direction:column;gap:4px}.tsui-root[data-tsui-layout=stock] .tsui-window-options button{text-align:left}
.tsui-root[data-tsui-layout=stock] .tsui-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto auto;overflow:hidden}
.tsui-root[data-tsui-layout=stock] .tsui-content{grid-column:1;padding:12px;overflow:auto;scrollbar-gutter:auto}
.tsui-root[data-tsui-layout=stock] .tsui-nav{flex-direction:row;flex-wrap:wrap;grid-row:auto;border-right:0;border-bottom:1px solid var(--tsui-border);padding:0 10px;gap:16px;background:var(--tsui-surface)}
.tsui-root[data-tsui-layout=stock] .tsui-nav button{background:transparent;border:0;border-bottom:2px solid transparent;border-radius:0;padding:9px 2px;color:var(--tsui-muted);font-size:.95em}
.tsui-root[data-tsui-layout=stock] .tsui-nav button[aria-current=page]{border-bottom-color:var(--tsui-accent);color:var(--tsui-accent)}
.tsui-root[data-tsui-layout=stock] .tsui-nav [data-tsui-header-action=true]{display:none}.tsui-root[data-tsui-layout=stock] .tsui-settings,.tsui-root[data-tsui-layout=stock] .tsui-inspector{grid-column:1}
.tsui-root[data-tsui-layout=stock] input,.tsui-root[data-tsui-layout=stock] select{background:var(--tsui-background)}
.tsui-root[data-tsui-layout=stock][data-tsui-pda=true] .tsui-section-footers{padding-bottom:max(48px,env(safe-area-inset-bottom));background:var(--tsui-raised)}
@media(max-width:600px),(pointer:coarse){.tsui-root[data-tsui-layout=stock] .tsui-controls>button,.tsui-root[data-tsui-layout=stock] .tsui-header-actions>button{width:44px;min-height:44px}.tsui-root[data-tsui-layout=stock] .tsui-body{grid-template-rows:auto minmax(0,1fr) auto auto;align-content:stretch}.tsui-root[data-tsui-layout=stock] .tsui-content{overflow:auto}.tsui-root[data-tsui-layout=stock] .tsui-nav button{min-height:44px}.tsui-root[data-tsui-layout=stock] .tsui-title{font-size:13px}}
`;
}
// Appearance-only adoption for explicitly declared legacy roots. This bridge
// shares the existing menu registration identity and never moves script content.
function createScriptUiAppearanceAdapter(options) {
  const {doc,win,id,read=()=>null,write=()=>{},getInstance=()=>null,onChange=()=>{}}=options;
  const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(value);
  if(!safeId(id))throw new TypeError('A bounded script id is required.');
  const normalize=options.normalize||(typeof normalizeScriptUiTheme==='function'?normalizeScriptUiTheme:require('./script-hub-theme.cjs').normalizeScriptUiTheme);
  const apply=options.apply||(typeof applyScriptUiTheme==='function'?applyScriptUiTheme:require('./script-hub-theme.cjs').applyScriptUiTheme);
  const css=options.css||(typeof scriptUiThemeCss==='function'?scriptUiThemeCss:require('./script-hub-theme.cjs').scriptUiThemeCss);
  const createClient=options.createClient||(typeof createScriptUiThemeClient==='function'?createScriptUiThemeClient:require('./script-hub-theme-client.cjs').createScriptUiThemeClient);
  const selectors=(Array.isArray(options.selectors)?options.selectors:[]).filter(value=>typeof value==='string'&&value.length>0&&value.length<=240).slice(0,12);
  const commandEvent='torn-script-hub:v1:appearance',resultEvent=commandEvent+'-result';
  let started=false,disposed=false,suspended=false,pdaActive=true,ready=false,generation=0,frame=null,observer=null,style=null;
  let saved=null,readFailed=false,pending=0,queue=Promise.resolve();
  const roots=new Map(),listeners=[],seen=new Set();
  const active=()=>started&&!suspended&&pdaActive&&doc.visibilityState!=='hidden';
  const stateTheme=()=>saved===null?client.get():normalize(saved);
  function revision(){
    const text=JSON.stringify(saved);let first=2166136261,second=5381;
    for(let i=0;i<text.length;i++){first=Math.imul(first^text.charCodeAt(i),16777619);second=Math.imul(second,33)^text.charCodeAt(i);}
    return 'ui-v1:'+(first>>>0).toString(16).padStart(8,'0')+(second>>>0).toString(16).padStart(8,'0');
  }
  async function readSaved(){try{const raw=await read();saved=raw===null||raw===undefined?null:normalize(raw);readFailed=false;return saved;}catch(error){readFailed=true;throw error;}}
  const client=createClient({doc,win,scriptId:id,read:readSaved,write:async value=>{const theme=value===null?null:normalize(value);await write(theme);saved=theme;},onChange:theme=>{ready=true;if(active()){schedule();try{onChange(normalize(theme));}catch(_){}}}});
  function response(command,status){
    if(!active()||getInstance()!==command.instance)return;
    const value={id,instance:command.instance,request:command.request,page:'ui-appearance',status,data:{theme:stateTheme(),inherit:saved===null,revision:revision()}};
    try{const EventClass=win.CustomEvent||globalThis.CustomEvent;doc.dispatchEvent(new EventClass(resultEvent,{detail:JSON.stringify(value)}));}catch(_){}
  }
  function receive(event){
    if(!active()||!ready||typeof event.detail!=='string'||event.detail.length>16384)return;
    let command;try{command=JSON.parse(event.detail);}catch(_){return;}
    if(!command||command.id!==id||!safeId(command.instance)||command.instance!==getInstance()||!safeId(command.request)||command.page!=='ui-appearance'||!['read','save'].includes(command.method))return;
    if(command.method==='save'&&(typeof command.revision!=='string'||command.revision.length>128||!Object.prototype.hasOwnProperty.call(command,'theme')||(command.theme!==null&&(typeof command.theme!=='object'||Array.isArray(command.theme)))))return;
    const key=command.instance+':'+command.request;if(seen.has(key))return;
    if(pending>=5){response(command,'error');return;}
    seen.add(key);if(seen.size>30)seen.delete(seen.values().next().value);pending++;
    const ownGeneration=generation;
    const run=async()=>{
      try{
        if(!active()||generation!==ownGeneration||getInstance()!==command.instance)return;
        await client.refresh();
        if(!active()||generation!==ownGeneration||getInstance()!==command.instance)return;
        if(readFailed)throw new Error('Appearance read unavailable.');
        if(command.method==='save'){
          if(command.revision!==revision()){response(command,'conflict');return;}
          await client.setOverride(command.theme===null?null:normalize(command.theme));
        }
        if(generation===ownGeneration)response(command,'ok');
      }catch(_){if(generation===ownGeneration)response(command,'error');}
      finally{if(generation===ownGeneration)pending--;}
    };
    queue=queue.then(run,run);
  }
  const aliases={
    '--ocm-bg':'background','--ocm-bg-card':'surface','--ocm-bg-hover':'raised','--ocm-text':'text','--ocm-text-card':'text',
    '--ocm-text-dim':'muted','--ocm-text-muted':'muted','--ocm-text-faint':'muted','--ocm-border':'border','--ocm-border-soft':'border','--ocm-link':'accent',
    '--ocm-cpr-good':'success','--ocm-cpr-warn':'warning','--ocm-cpr-crit':'error',
    '--ground':'background','--surface':'surface','--raise':'raised','--line':'border','--text':'text','--dim':'muted','--muted':'muted','--faint':'muted',
    '--accent':'accent','--accent-dim':'accent','--warn':'warning','--bad':'error','--info':'focus',
    '--twpc-bg':'background','--twpc-surface':'surface','--twpc-text':'text','--twpc-muted':'muted','--twpc-line':'border','--twpc-accent':'accent'
  };
  function restore(node,record){
    for(const [key,entry]of record.styles){
      // A script may update its own inline properties while the bridge is active.
      if(node.style.getPropertyValue(key)!==entry.last||node.style.getPropertyPriority(key)!==entry.lastPriority)continue;
      if(entry.value)node.style.setProperty(key,entry.value,entry.priority);else node.style.removeProperty(key);
    }
    for(const [key,entry]of record.attributes)if(node.getAttribute(key)===entry.last){if(entry.value===null)node.removeAttribute(key);else node.setAttribute(key,entry.value);}
    if(!record.hadClass)node.classList.remove('tsui-legacy-surface');
  }
  function releaseRoots(){for(const [node,record]of roots)restore(node,record);roots.clear();}
  function applyRoot(node,theme){
    let record=roots.get(node);if(!record){record={styles:new Map(),attributes:new Map(),hadClass:node.classList.contains('tsui-legacy-surface')};roots.set(node,record);}
    const styles=new Map(),attributes=new Map();
    const resolved=apply({style:{setProperty:(key,value)=>styles.set(key,value)},setAttribute:(key,value)=>attributes.set(key,value)},theme,win.matchMedia?.('(prefers-color-scheme: dark)').matches===true);
    attributes.set('data-tsui-owner',id);
    for(const [key,role]of Object.entries(aliases))styles.set(key,resolved.colors[role]);
    for(const [key,value]of styles){
      if(!record.styles.has(key))record.styles.set(key,{value:node.style.getPropertyValue(key),priority:node.style.getPropertyPriority(key)});
      node.style.setProperty(key,value);Object.assign(record.styles.get(key),{last:value,lastPriority:''});
    }
    for(const [key,value]of attributes){if(!record.attributes.has(key))record.attributes.set(key,{value:node.getAttribute(key)});node.setAttribute(key,value);record.attributes.get(key).last=value;}
    node.classList.add('tsui-legacy-surface');
  }
  function render(){
    frame=null;if(!active()||!ready)return;
    const found=new Set();for(const selector of selectors){let nodes;try{nodes=doc.querySelectorAll(selector);}catch(_){continue;}for(let i=0;i<nodes.length&&found.size<48;i++)found.add(nodes[i]);if(found.size>=48)break;}
    for(const [node,record]of roots)if(!found.has(node)||node.isConnected===false){restore(node,record);roots.delete(node);}
    const theme=client.get();for(const node of found)applyRoot(node,theme);
    if(found.size&&!style){style=doc.createElement('style');style.setAttribute('data-tsui-appearance-owner',id);style.textContent=css()+'\n.tsui-legacy-surface{background-color:var(--tsui-background);color:var(--tsui-text);border-color:var(--tsui-border)}';(doc.head||doc.documentElement).appendChild(style);}
    if(!observer&&selectors.length&&typeof win.MutationObserver==='function'){observer=new win.MutationObserver(schedule);observer.observe(doc.documentElement,{childList:true,subtree:true});}
  }
  function schedule(){if(!active()||!ready||frame!==null)return;frame=win.requestAnimationFrame(render);}
  function pause(){if(frame!==null)win.cancelAnimationFrame(frame);frame=null;observer?.disconnect();observer=null;}
  function activity(){if(active())schedule();else pause();}
  function pda(event){const state=event.detail;if(typeof state?.isActiveTab!=='boolean'||typeof state?.isWebViewVisible!=='boolean')return;pdaActive=state.isActiveTab&&state.isWebViewVisible;activity();}
  function route(){pause();if(active())releaseRoots();schedule();}
  function pagehide(event){if(event.persisted){suspended=true;pause();}else stop();}
  function pageshow(event){if(event.persisted){suspended=false;activity();}}
  function listen(target,name,callback){target.addEventListener(name,callback);listeners.push(()=>target.removeEventListener(name,callback));}
  async function start(){
    if(disposed)return client.get();if(started)return client.get();started=true;suspended=false;pdaActive=true;ready=false;generation++;
    listen(doc,commandEvent,receive);listen(doc,'visibilitychange',activity);listen(win,'tornpda:tabState',pda);listen(win,'hashchange',route);listen(win,'pagehide',pagehide);listen(win,'pageshow',pageshow);
    return client.start();
  }
  function stop(){started=false;generation++;client.stop();pause();releaseRoots();style?.remove();style=null;for(const remove of listeners.splice(0))remove();seen.clear();pending=0;queue=Promise.resolve();}
  function dispose(){if(disposed)return;stop();disposed=true;}
  return {start,stop,dispose,client};
}
// Bundled into each participating script; callbacks stay in that script's scope.
function registerTornScriptMenu(doc, win, metadata, callbacks, features = {}) {
  const prefix = 'torn-script-hub:v1:';
  const instance = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID() : 'menu-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  let attached = false, disposed = false;
  const seen = new Set();
  const requests = new Map();
  const preparedSecrets = new Map();
  const credentialContexts = new Map();
  let changeTimer = null;
  let credentialIdentity = null;
  let pairedHub = null;
  let pdaActive = true, active = doc.visibilityState !== 'hidden', drainingChanges = false, activityGeneration = 0;
  const providerRevisions = new Map(), changedProviders = new Map();
  const sharedProviders = [...new Set((Array.isArray(features.sharedProviders) ? features.sharedProviders : ['torn']).filter(value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value)))].slice(0,20);
  function usable() { return attached && !disposed && active && doc.visibilityState !== 'hidden'; }
  function hook(name) {
    try { const result = features[name]?.(); if(result && typeof result.then==='function')result.catch(()=>{}); } catch (_) {}
  }
  function send(name, value) {
    try { doc.dispatchEvent(new CustomEvent(prefix + name, { detail: JSON.stringify(value) })); } catch (_) {}
  }
  function announce() { send('register', { ...metadata, credentialScope:features.credentialScope==='script'?'script':'main', credentialProviders:features.credentialClient?sharedProviders:[], capabilities:[...new Set([...(metadata.capabilities||[]),...(features.credentialContext?['hub-keys-v2']:[])])], instance, ...(credentialIdentity ? {credentialIdentity} : {}) }); }
  const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(value);
  const safeField = value => typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
  function decode(event, limit = 65536) {
    try { return typeof event.detail === 'string' && event.detail.length <= limit ? JSON.parse(event.detail) : null; } catch (_) { return null; }
  }
  function publicSchema(schema) {
    if(typeof normalizeHubPage==='function')return normalizeHubPage(schema);
    const value={id:schema.id,title:schema.title,description:schema.description||'',sections:[],actions:[]};
    for(const section of schema.sections||[]){
      const fields=[];
      for(const source of section.fields||[]){
        const field={};for(const key of ['id','type','label','description','required','readOnly','min','max','step','minLength','maxLength','options','visibleWhen','format','unit'])if(source[key]!==undefined)field[key]=source[key];
        if(!['password','secret'].includes(source.type)&&source.default!==undefined)field.default=source.default;fields.push(field);
      }
      value.sections.push({id:section.id,title:section.title,fields});
    }
    value.actions=(schema.actions||[]).map(action=>({id:action.id,label:action.label}));
    for (const section of value.sections || []) for (const field of section.fields || []) {
      if (['password','secret'].includes(field.type)) { delete field.default; delete field.value; }
    }
    return value;
  }
  function publicValues(schema, state) {
    const values = {};
    for (const section of schema.sections || []) for (const field of section.fields || []) {
      if (['password','secret'].includes(field.type) || !safeField(field.id)) continue;
      const value = state?.values?.[field.id];
      if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.length <= 32768)) values[field.id] = value;
    }
    if(encodeURIComponent(JSON.stringify(values)).replace(/%[A-F\d]{2}/g,'_').length>32768)throw new Error('Settings exceed transport limit.');
    return {values,revision:typeof state?.revision === 'string' ? state.revision.slice(0,128) : ''};
  }
  async function rpc(event) {
    const command = decode(event, 49152);
    if (!command || command.id !== metadata.id || command.instance !== instance || !safeId(command.request)
        || !metadata.pages?.some(page => page.id === command.page) || !['describe','read','save','prepare-secret'].includes(command.method)
        || typeof features.describePage !== 'function' || typeof features.readSettings !== 'function' || !usable()) return;
    const key = 'rpc-' + command.request;
    if (seen.has(key)) return;
    seen.add(key); if (seen.size > 30) seen.delete(seen.values().next().value);
    const reply = (status, data) => {
      if (!attached || disposed) return;
      const output = {id:metadata.id,instance,request:command.request,page:command.page,status,...(data ? {data} : {})};
      if (JSON.stringify(output).length <= 98304) send('rpc-result', output);
      else send('rpc-result', {id:metadata.id,instance,request:command.request,page:command.page,status:'error'});
    };
    try {
      const schema = publicSchema(await features.describePage(command.page));
      if (command.method === 'describe') { reply('ok', schema); return; }
      if(command.method==='prepare-secret'){
        if(!features.credentialClient||typeof features.saveSecrets!=='function'||preparedSecrets.size>=10){reply('error');return;}
        const request=await features.credentialClient.createRequest('script-settings',instance,'secret-'+command.request,{pageId:command.page});
        if(!request||!usable()){reply('error');return;}
        const timer=setTimeout(()=>preparedSecrets.delete(request.requestId),30000);
        preparedSecrets.set(request.requestId,{request,timer});reply('ok',request);return;
      }
      const current = publicValues(schema, await features.readSettings(command.page));
      if (command.method === 'read') { reply('ok', current); return; }
      if (typeof features.saveSettings !== 'function' || !command.values || typeof command.values !== 'object' || Array.isArray(command.values)) { reply('error'); return; }
      const fields = (schema.sections || []).flatMap(section => section.fields || []).filter(field => !['password','secret'].includes(field.type) && !field.readOnly);
      if (Object.keys(command.values).some(id => !fields.some(field => field.id === id))) { reply('error'); return; }
      if(encodeURIComponent(JSON.stringify(command.values)).replace(/%[A-F\d]{2}/g,'_').length>32768){reply('error');return;}
      if (command.revision !== current.revision) { reply('conflict'); return; }
      const result = await features.saveSettings(command.page, command.values, command.revision);
      reply('ok', publicValues(schema, result || await features.readSettings(command.page)));
    } catch (_) { reply('error'); }
  }
  async function onCredentialInfo(event) {
    const info = decode(event, 8192);
    if (!info?.identity?.publicJwk || !features.credentialClient || !usable()) return;
    const token=activityGeneration;
    try {
      if (!await features.credentialClient.pinHub(info.identity.publicJwk)) return;
      const identity=await features.credentialClient.publicIdentity();
      if(!usable()||token!==activityGeneration)return;
      if(identity&&credentialIdentity?.fingerprint!==identity.fingerprint){credentialIdentity=identity;announce();}
      const peer=JSON.stringify([info.identity.publicJwk.x,info.identity.publicJwk.y]);
      const initial=pairedHub!==peer;pairedHub=peer;
      const providers=Array.isArray(info.providers)?info.providers.slice(0,20):[];
      for(const providerId of sharedProviders){
        const record=providers.find(item=>item?.id===providerId&&Number.isSafeInteger(item.revision)&&item.revision>=0&&typeof item.configured==='boolean');
        const revision=record?JSON.stringify([record.revision,record.configured]):null;
        if(initial||(revision!==null&&providerRevisions.get(providerId)!==revision))queueCredentialChange(providerId);
        if(revision!==null)providerRevisions.set(providerId,revision);
      }
    } catch (_) {}
  }
  async function onCredentialReply(event) {
    const reply = decode(event, 131072);
    if (!reply || reply.scriptId !== metadata.id || reply.instance !== instance || !usable()) return;
    const item = requests.get(reply.requestId);
    if (!item) return;
    requests.delete(reply.requestId); clearTimeout(item.timer);
    try{
      let value=await features.credentialClient.consumeReply(reply,item.request);
      if(item.request.pageId==='credential-context-v2' && value!==null){
        const context=JSON.parse(value);
        if(context?.version!==2||context.managed!==true||typeof context.fallback!=='boolean'||!(context.value===null||typeof context.value==='string'&&context.value.length<=4096)||
          !(context.keyId==='global'||/^key-[a-f0-9]{24}$/.test(context.keyId)))throw new Error('Unavailable');
        if(!usable())throw new Error('Unavailable');
        if(!await features.credentialClient.rememberManaged(reply.providerId)){
          send('credential-policy',{scriptId:metadata.id,instance,providerId:reply.providerId,status:'failed'});
          features.onCredentialPolicyFailure?.(reply.providerId);throw new Error('Unavailable');
        }
        if(!usable())throw new Error('Unavailable');
        features.onHubManagementChange?.(reply.providerId,true);
        send('credential-policy',{scriptId:metadata.id,instance,providerId:reply.providerId,status:'saved'});
        credentialContexts.set(reply.providerId,context);value=context.value;
        features.onCredentialContext?.(reply.providerId,{keyId:context.keyId,fallback:context.fallback});
      }else if(value===null)credentialContexts.delete(reply.providerId);
      item.resolve(usable()?value:null);
    }catch(_){credentialContexts.delete(reply.providerId);item.resolve(null);}
  }
  async function onSecretSettings(event){
    const message=decode(event,131072),request=message?.request;
    if(!request||request.scriptId!==metadata.id||request.instance!==instance||request.providerId!=='script-settings'||!usable())return;
    const item=preparedSecrets.get(request.requestId);if(!item||item.request.pageId!==request.pageId)return;
    preparedSecrets.delete(request.requestId);clearTimeout(item.timer);
    let status='error';
    try{
      const value=await features.credentialClient.consumeReply(message.envelope,item.request);
      if(value===null||!usable())return;
      const values=JSON.parse(value),schema=await features.describePage(request.pageId);
      const fields=(schema.sections||[]).flatMap(section=>section.fields||[]).filter(field=>['password','secret'].includes(field.type)&&!field.readOnly);
      if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).some(id=>{const field=fields.find(field=>field.id===id),value=values[id];return !field||typeof value!=='string'||value.length>32768||(field.minLength!==undefined&&value.length<field.minLength)||(field.maxLength!==undefined&&value.length>field.maxLength);}))throw new Error();
      if(!usable())return;
      await features.saveSecrets(request.pageId,values);status='ok';
    }catch(_){}
    if(usable())send('secret-result',{id:metadata.id,instance,page:request.pageId,request:request.requestId,status});
  }
  function queueCredentialChange(providerId){
    if(!features.credentialClient||!sharedProviders.includes(providerId))return;
    changedProviders.set(providerId,(changedProviders.get(providerId)||0)+1);
    if(!usable()||changeTimer!==null||drainingChanges)return;
    changeTimer=setTimeout(drainCredentialChanges,250);
  }
  async function drainCredentialChanges(){
    changeTimer=null;if(!usable()||drainingChanges)return;
    drainingChanges=true;const token=activityGeneration;
    try{
      const providers=[...changedProviders.keys()];changedProviders.clear();
      for(const providerId of providers){
        if(!usable()||token!==activityGeneration)break;
        const value=await requestSharedCredential(providerId);
        if(usable()&&token===activityGeneration&&!changedProviders.has(providerId)&&typeof features.onSharedCredentialChange==='function')try{features.onSharedCredentialChange(providerId,value);}catch(_){}
      }
    }finally{drainingChanges=false;if(usable()&&changedProviders.size&&changeTimer===null)changeTimer=setTimeout(drainCredentialChanges,250);}
  }
  function onCredentialChanged(event){
    const change=decode(event,1024);
    if(!features.credentialClient||typeof features.onSharedCredentialChange!=='function'||!change||!safeId(change.providerId)||(change.scriptId&&change.scriptId!==metadata.id))return;
    queueCredentialChange(change.providerId);
  }
  async function requestSharedCredential(providerId) {
    if (!usable() || !features.credentialClient || !sharedProviders.includes(providerId) || requests.size >= 10) return null;
    const requestId = 'key-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    try {
      const request = await features.credentialClient.createRequest(providerId,instance,requestId,features.credentialContext?{pageId:'credential-context-v2'}:{});
      if (!request || !usable()) return null;
      return await new Promise(resolve => {
        const timer = setTimeout(() => {requests.delete(requestId);resolve(null);},2000);
        requests.set(requestId,{resolve,timer,request}); send('credential-request',request);
      });
    } catch (_) { return null; }
  }
  function clearCredentialWork(){
    for(const item of requests.values()){clearTimeout(item.timer);item.resolve(null);}requests.clear();
    for(const item of preparedSecrets.values())clearTimeout(item.timer);preparedSecrets.clear();
    clearTimeout(changeTimer);changeTimer=null;
  }
  function updateActivity(){
    const next=doc.visibilityState!=='hidden'&&pdaActive;
    if(next===active)return;active=next;activityGeneration++;
    if(!active)clearCredentialWork();
    else if(attached){providerRevisions.clear();for(const providerId of sharedProviders)changedProviders.set(providerId,1);send('credential-discover',{});}
  }
  function onPdaActivity(event){const info=event.detail;pdaActive=info?.isActiveTab===true&&info?.isWebViewVisible===true;updateActivity();}
  function takeover(event) {
    try {
      if (typeof event.detail !== 'string' || event.detail.length > 16000) return;
      const next = JSON.parse(event.detail);
      if (next?.id === metadata.id && typeof next.instance === 'string' && next.instance !== instance) dispose();
    } catch (_) {}
  }
  function activate(event) {
    let command;
    try {
      if (typeof event.detail !== 'string' || event.detail.length > 1024) return;
      command = JSON.parse(event.detail);
    } catch (_) { return; }
    if (!command || command.id !== metadata.id || command.instance !== instance || typeof command.action !== 'string'
        || !Object.prototype.hasOwnProperty.call(callbacks, command.action)
        || !metadata.actions.some(action => action.id === command.action)
        || typeof command.request !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(command.request)) return;
    if (seen.has(command.request)) return;
    seen.add(command.request);
    if (seen.size > 30) seen.delete(seen.values().next().value);
    const report = status => send('result', { id: metadata.id, action: command.action, request: command.request, instance, status });
    const statusFor = value => value === false ? 'not-ready' : value === 'navigate' ? 'navigate' : 'opened';
    try {
      const result = callbacks[command.action]();
      if (result && typeof result.then === 'function') result.then(value => report(statusFor(value)), () => report('error'));
      else report(statusFor(result));
    } catch (_) { report('error'); }
  }
  function detach() {
    if (!attached) return;
    attached = false;
    activityGeneration++;
    doc.removeEventListener(prefix + 'discover', announce);
    doc.removeEventListener(prefix + 'activate', activate);
    doc.removeEventListener(prefix + 'register', takeover);
    doc.removeEventListener(prefix + 'rpc', rpc);
    doc.removeEventListener(prefix + 'credential-info', onCredentialInfo);
    doc.removeEventListener(prefix + 'credential-reply', onCredentialReply);
    doc.removeEventListener(prefix + 'credential-changed',onCredentialChanged);
    doc.removeEventListener(prefix + 'secret-settings',onSecretSettings);
    credentialContexts.clear();
    clearCredentialWork();
    send('unregister', { id: metadata.id, instance });
    hook('onDetach');
  }
  function attach() {
    if (attached || disposed) return;
    attached = true;
    active=doc.visibilityState!=='hidden'&&pdaActive;
    doc.addEventListener(prefix + 'discover', announce);
    doc.addEventListener(prefix + 'activate', activate);
    doc.addEventListener(prefix + 'register', takeover);
    if (metadata.pages?.length) doc.addEventListener(prefix + 'rpc', rpc);
    if (features.credentialClient) {
      doc.addEventListener(prefix + 'credential-info', onCredentialInfo);
      doc.addEventListener(prefix + 'credential-reply', onCredentialReply);
      doc.addEventListener(prefix + 'credential-changed',onCredentialChanged);
      if(typeof features.saveSecrets==='function')doc.addEventListener(prefix + 'secret-settings',onSecretSettings);
    }
    announce();
    hook('onAttach');
    if(features.credentialClient&&usable()){providerRevisions.clear();send('credential-discover',{});}
  }
  win.addEventListener('pagehide', detach);
  win.addEventListener('pageshow', attach);
  doc.addEventListener('visibilitychange',updateActivity);
  win.addEventListener('tornpda:tabState',onPdaActivity);
  if(typeof win.PDA_getTabState==='function')Promise.resolve().then(()=>win.PDA_getTabState()).then(info=>{if(!disposed)onPdaActivity({detail:info});}).catch(()=>{});
  function dispose() {
    if(disposed)return;
    disposed = true;
    detach();
    win.removeEventListener('pagehide', detach);
    win.removeEventListener('pageshow', attach);
    doc.removeEventListener('visibilitychange',updateActivity);
    win.removeEventListener('tornpda:tabState',onPdaActivity);
    seen.clear();
    features.credentialClient?.destroy();
    changedProviders.clear();providerRevisions.clear();hook('onDispose');
  }
  attach();
  dispose.requestSharedCredential = requestSharedCredential;
  dispose.instance = instance;
  if (features.credentialClient) {
    Promise.resolve().then(() => features.credentialClient.ready()).then(async ready => {
      if(disposed)return;
      features.onCredentialPolicyReady?.(ready,providerId=>features.credentialClient.isManaged?.(providerId)===true);
      if (!ready || !usable()) return;
      credentialIdentity = await features.credentialClient.publicIdentity();
      if (usable() && credentialIdentity) {announce();send('credential-discover',{});}
    }).catch(() => {});
  }
  return dispose;
}
function hubReveal(selector) {
  const root = document.querySelector(selector); if (!root) return false;
  root.hidden = false; root.scrollIntoView({ behavior: 'smooth', block: 'center' });
  root.querySelector('button, [tabindex="0"], input:not([type="password"])')?.focus({ preventScroll: true });
  return true;
}
function hubOpenWar(menu) { if (!document.body) return false; const selector = '.wt-modal-bg[data-hub-menu="' + menu + '"]'; if (document.querySelector(selector)) return hubReveal(selector); if (menu === 'settings') openSettings(); else openMassCallout(); const bg = document.querySelector('.wt-modal-bg'); if (!bg) return false; bg.dataset.hubMenu = menu; return hubReveal(selector); }

const hubMenuAdapter = registerTornScriptMenu(document, window, {
  "id": "war-tools",
  "name": "War Tools",
  "icon": "war",
  "version": "3.9.2",
  "url": "https://www.torn.com/factions.php?step=your&type=1",
  "actions": [
    {
      "id": "open",
      "label": "Settings"
    },
    {
      "id": "callout",
      "label": "Mass callout menu"
    }
  ],
  "category": "Tools",
  "capabilities": [
    "appearance"
  ]
}, {
  "open": () => { return hubOpenWar('settings'); },
  "callout": () => { return hubOpenWar('callout'); }
});

const hubAppearanceKey="torn-script-hub:ui-override:v1:war-tools";
const hubAppearance=createScriptUiAppearanceAdapter({doc:document,win:window,id:"war-tools",selectors:[".wt-modal"],getInstance:()=>hubMenuAdapter.instance,
read:()=>typeof GM_getValue==='function'?GM_getValue(hubAppearanceKey,null):typeof GM!=='undefined'&&typeof GM.getValue==='function'?GM.getValue(hubAppearanceKey,null):JSON.parse(localStorage.getItem(hubAppearanceKey)||'null'),
write:value=>{if(typeof GM_setValue==='function')return GM_setValue(hubAppearanceKey,value);if(typeof GM!=='undefined'&&typeof GM.setValue==='function')return GM.setValue(hubAppearanceKey,value);localStorage.setItem(hubAppearanceKey,JSON.stringify(value));}});
hubAppearance.start().catch(()=>{});
// SCRIPT HUB ADAPTER END
})();
