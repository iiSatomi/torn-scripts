// ==UserScript==
// @name         Frostbite Faction Usage Command (Leader)
// @namespace    frostbite.intel
// @version      3.0.0
// @description  Faction-wide usage tracking with daily / weekly / monthly windows. Pulls public personal stats straight from Torn — no spies, no TornStats.
// @author       Frostbite
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-idle
// @license      All Rights Reserved
// ==/UserScript==

(function () {
    'use strict';

    const APP_ID = 'frostbite-usage-command';
    const UI_KEY = 'frostbiteUsage.ui.v1';
    const SETTINGS_KEY = 'frostbiteUsage.settings.v1';
    const PS_CACHE_KEY = 'frostbiteUsage.psCache.v1';
    const API_BASE = 'https://api.torn.com';

    /*
     * type 'counter' — a lifetime cumulative total. Period value = how much it went up.
     * type 'level'   — a point-in-time value. Period value = signed change, and it
     *                  makes no sense to sum it across the faction.
     * apiKey null    — not obtainable for other players; self-reports only.
     */
    const STAT_FIELDS = [
        { key: 'xantaken',          label: 'Xanax',     icon: '💊', apiKey: 'xantaken',          type: 'counter' },
        { key: 'alcoholused',       label: 'Alcohol',   icon: '🍾', apiKey: 'alcoholused',       type: 'counter' },
        { key: 'drugsused',         label: 'Drugs',     icon: '💉', apiKey: 'drugsused',         type: 'counter' },
        { key: 'refills',           label: 'E-Refills', icon: '⚡', apiKey: 'refills',           type: 'counter' },
        { key: 'nerverefills',      label: 'N-Refills', icon: '🧠', apiKey: 'nerverefills',      type: 'counter' },
        { key: 'statenhancersused', label: 'Enhancers', icon: '☆',  apiKey: 'statenhancersused', type: 'counter' },
        { key: 'networth',          label: 'Networth',  icon: '$',  apiKey: 'networth',          type: 'level', currency: true },
        { key: 'energy',            label: 'Energy',    icon: '🔋', apiKey: null,                type: 'level', lifetimeOnly: true }
    ];

    const API_FIELDS = STAT_FIELDS.filter(f => f.apiKey);

    /*
     * `prefix` must match the column prefixes the backend writes into UsagePeriods.
     *
     * Labelled "1 Day" rather than "Today" on purpose. Torn serves other players'
     * personal stats as a once-daily snapshot, so a delta between two reads covers
     * the Torn day that just closed, not the one in progress. Calling it "Today"
     * would promise a live number the API cannot give.
     */
    const PERIODS = [
        { key: 'lifetime', label: 'Lifetime', days: null, prefix: null },
        { key: 'daily',    label: '1 Day',    days: 1,    prefix: 'd' },
        { key: 'weekly',   label: '7 Days',   days: 7,    prefix: 'w' },
        { key: 'monthly',  label: '30 Days',  days: 30,   prefix: 'm' }
    ];

    // Torn allows 100 calls/min per USER — shared across every key you own and every
    // other script running under your account (TornTools, FF Scouter, anything else).
    // We hold to 30/min so this can never be the reason your other tooling starts
    // erroring. awaitCallSlot() is the actual guarantee; the delay paces the normal
    // case. The window persists to localStorage so a page reload cannot reset it.
    const MAX_CALLS_PER_MIN = 30;
    const API_DELAY_MS = 2000;
    const CALL_LOG_KEY = 'frostbiteUsage.callLog.v1';
    const PS_CACHE_TTL = 3 * 60 * 60 * 1000;
    const FAIL_COOLDOWN = 10 * 60 * 1000;
    const AUTO_INTERVAL_MS = 5 * 60 * 1000;

    const defaultSettings = {
        sheetUrl: '', readSecret: '', tornApiKey: '',
        tornEnabled: true, fetchAll: false, autoRefresh: false
    };

    const state = {
        open: false,
        settingsOpen: false,
        loading: false,
        busy: false,
        cancelRequested: false,
        message: 'Open Settings and add your sheet URL, read secret and Torn API key.',
        period: 'lifetime',
        perDay: false,
        filter: '',
        sort: { key: 'name', dir: 'asc' },
        rows: [],
        periodsById: {},
        meta: { historyDays: 0, today: todayUtc(), lastSync: '', lastSyncSource: '', unattended: false },
        launcherPosition: { left: null, top: null },
        windowPosition: { left: null, top: null },
        settings: { ...defaultSettings }
    };

    let autoTimer = null;
    let suppressLauncherClick = false;

    init();

    function init() {
        if (document.getElementById(APP_ID)) return;
        restoreState();
        injectStyles();
        buildApp();
        bindEvents();
        renderAll();
        if (state.settings.autoRefresh) startAutoRefresh();
    }

    /* ---------------------------------------------------------------- *
     * Persistence
     * ---------------------------------------------------------------- */

    function restoreState() {
        try {
            const saved = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
            if (typeof saved.open === 'boolean') state.open = saved.open;
            if (typeof saved.period === 'string' && PERIODS.some(p => p.key === saved.period)) {
                state.period = saved.period;
            }
            if (typeof saved.perDay === 'boolean') state.perDay = saved.perDay;
            if (saved.sort && saved.sort.key) state.sort = saved.sort;
            applySavedCoords(saved.launcherPosition, state.launcherPosition);
            applySavedCoords(saved.windowPosition, state.windowPosition);
        } catch (_) { /* defaults are fine */ }

        try {
            state.settings = { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
        } catch (_) {
            state.settings = { ...defaultSettings };
        }
    }

    function applySavedCoords(source, target) {
        if (source && Number.isFinite(source.left) && Number.isFinite(source.top)) {
            target.left = source.left;
            target.top = source.top;
        }
    }

    function saveState() {
        localStorage.setItem(UI_KEY, JSON.stringify({
            open: state.open,
            period: state.period,
            perDay: state.perDay,
            sort: state.sort,
            launcherPosition: state.launcherPosition,
            windowPosition: state.windowPosition
        }));
    }

    function saveSettings() {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    }

    /* ---------------------------------------------------------------- *
     * Dates
     * ---------------------------------------------------------------- */

    // Only used as a placeholder before the first load — every real date and all
    // period maths comes from the sheet, so leaders in different timezones can never
    // disagree about where a Torn day starts.
    function todayUtc() { return new Date().toISOString().slice(0, 10); }

    /* ---------------------------------------------------------------- *
     * Network
     * ---------------------------------------------------------------- */

    // Resolved on demand rather than into a module-scope const: a const would sit in
    // the temporal dead zone if anything above it ever throws during load, turning an
    // unrelated error into a confusing "cannot access gmXhr" on every later request.
    function getGmXhr() {
        if (typeof GM_xmlhttpRequest !== 'undefined') return GM_xmlhttpRequest;
        if (typeof GM !== 'undefined' && GM.xmlHttpRequest) return GM.xmlHttpRequest;
        return null;
    }

    function gmFetchJSON(url, options = {}) {
        const gmXhr = getGmXhr();
        if (!gmXhr) return Promise.reject(new Error('GM_xmlhttpRequest unavailable — check the userscript manager permissions.'));
        return new Promise((resolve, reject) => {
            gmXhr({
                method: options.method || 'GET',
                url,
                data: options.body,
                headers: options.headers || {},
                onload: (res) => {
                    try { resolve(JSON.parse(res.responseText)); }
                    catch (_) { reject(new Error(`Bad JSON from the sheet: ${res.responseText.slice(0, 120)}`)); }
                },
                onerror: () => reject(new Error('Network error contacting the sheet backend.')),
                ontimeout: () => reject(new Error('Sheet request timed out.'))
            });
        });
    }

    function loadCallLog() {
        try { return JSON.parse(localStorage.getItem(CALL_LOG_KEY) || '[]'); }
        catch (_) { return []; }
    }

    /**
     * Block until one more call fits inside MAX_CALLS_PER_MIN over the trailing 60
     * seconds. Persisted rather than in-memory so reloading the page mid-sweep, or
     * having Torn open in two tabs, cannot quietly double the rate.
     */
    async function awaitCallSlot() {
        for (;;) {
            const now = Date.now();
            const times = loadCallLog().filter(t => now - t < 60000);

            if (times.length < MAX_CALLS_PER_MIN) {
                times.push(now);
                localStorage.setItem(CALL_LOG_KEY, JSON.stringify(times));
                return;
            }

            const wait = Math.min(Math.max((times[0] + 60000) - now + 50, 100), 15000);
            setMessage(`Rate limit guard: waiting ${Math.ceil(wait / 1000)}s (${times.length}/${MAX_CALLS_PER_MIN} calls in the last minute)…`);
            await sleep(wait);
        }
    }

    /** Calls made in the trailing minute — for display. */
    function recentCallCount() {
        const now = Date.now();
        return loadCallLog().filter(t => now - t < 60000).length;
    }

    async function apiGet(path) {
        await awaitCallSlot();
        const url = `${API_BASE}${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(state.settings.tornApiKey)}&comment=FrostbiteUsage`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Torn API returned HTTP ${res.status}.`);
        const json = await res.json();
        if (json.error) throw new Error(`Torn API error ${json.error.code}: ${json.error.error}`);
        return json;
    }

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    /* ---------------------------------------------------------------- *
     * Load pipeline
     * ---------------------------------------------------------------- */

    function startAutoRefresh() {
        stopAutoRefresh();
        autoTimer = setInterval(refresh, AUTO_INTERVAL_MS);
        refresh();
    }

    function stopAutoRefresh() {
        if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    }

    async function refresh() {
        if (state.busy) { setMessage('A fetch is already running.'); return; }
        const s = state.settings;
        if (!s.sheetUrl || !s.readSecret) { setMessage('Set the sheet URL and read secret in Settings.'); return; }

        state.loading = true;
        state.busy = true;
        state.cancelRequested = false;
        renderChrome();
        setMessage('Loading from the sheet…');

        try {
            const data = await gmFetchJSON(`${s.sheetUrl}?secret=${encodeURIComponent(s.readSecret)}`);
            if (!data.ok) { setMessage(`Sheet error: ${data.error}`); return; }
            absorb(data);
            renderAll();

            // With the sheet syncing itself hourly there is nothing for the browser
            // to do — sweeping from here would just burn the same rate limit twice.
            if (s.tornEnabled && s.tornApiKey && !state.meta.unattended) {
                await mergeTornApi();
            }

            renderAll();
            setMessage(summaryLine());
        } catch (e) {
            setMessage(`Load failed: ${e.message}`);
        } finally {
            state.loading = false;
            state.busy = false;
            renderChrome();
        }
    }

    /** Take whatever the sheet returned — from a read or a sync — as the truth. */
    function absorb(data) {
        if (Array.isArray(data.rows)) state.rows = data.rows;
        if (Array.isArray(data.periods)) indexPeriods(data.periods);
        if (data.meta) state.meta = { ...state.meta, ...data.meta };
    }

    function indexPeriods(periods) {
        const byId = {};
        periods.forEach(p => { byId[String(p.id)] = p; });
        state.periodsById = byId;
    }

    function summaryLine() {
        const m = state.meta;
        const history = m.historyDays > 1 ? `${m.historyDays} days of history` : 'building history';
        const mode = m.unattended ? 'sheet auto-syncs hourly' : 'browser-driven';
        const last = m.lastSync ? new Date(m.lastSync).toLocaleString() : 'never';
        return `${state.rows.length} members • ${history} • ${mode} • last sync ${last}`;
    }

    /**
     * Pull the roster, then read each member's public personal stats. `personalstats`
     * is a public-access selection — any key can read any player's stats, the same
     * numbers on the Personal Stats tab of their profile. No spies, no cooperation.
     */
    async function mergeTornApi() {
        const cache = loadPsCache();
        const now = Date.now();

        if (cache.lastFailAt && (now - cache.lastFailAt < FAIL_COOLDOWN)) {
            const waitMin = Math.ceil((FAIL_COOLDOWN - (now - cache.lastFailAt)) / 60000);
            setMessage(`Torn API cooling down after a failure (retry in ~${waitMin} min). Sheet data only.`);
            return;
        }

        setMessage('Fetching faction roster…');
        // Always the faction this key's owner belongs to — no id to configure.
        let members;
        try {
            const faction = await apiGet('/faction/?selections=basic');
            members = faction.members || {};
        } catch (e) {
            markFail();
            setMessage(`Roster fetch failed: ${e.message}`);
            return;
        }

        const knownById = {};
        state.rows.forEach(r => { knownById[String(r.id)] = r; });

        const todo = Object.keys(members).filter(id => {
            if (state.settings.fetchAll) return true;
            const known = knownById[id];
            return !known || API_FIELDS.some(f => isBlank(known[f.key]));
        });

        if (!todo.length) { setMessage('Sheet is already current for every member.'); return; }

        const swept = [];
        let done = 0;
        let fromCache = 0;

        for (const id of todo) {
            if (state.cancelRequested) break;

            const cached = cache[id];
            let ps;

            if (cached && (Date.now() - cached.at < PS_CACHE_TTL)) {
                ps = cached.ps;
                fromCache++;
            } else {
                setMessage(`Fetching ${done + 1}/${todo.length} — ${members[id].name} (${recentCallCount()}/${MAX_CALLS_PER_MIN} calls this minute)…`);
                try {
                    const res = await apiGet(`/user/${encodeURIComponent(id)}?selections=personalstats`);
                    ps = res.personalstats || {};
                    cache[id] = { ps, at: Date.now() };
                    savePsCache(cache);
                } catch (e) {
                    if (/error 5:/i.test(e.message)) {
                        markFail();
                        setMessage(`Rate limited by Torn after ${done} members. Backing off ${FAIL_COOLDOWN / 60000} min.`);
                        break;
                    }
                    console.warn('[Frostbite] personalstats failed for', id, e.message);
                    done++;
                    await sleep(API_DELAY_MS);
                    continue;
                }
                await sleep(API_DELAY_MS);
            }

            const stats = {};
            API_FIELDS.forEach(f => {
                const v = ps[f.apiKey];
                if (v !== undefined && v !== null && v !== '') stats[f.key] = v;
            });

            swept.push({ id, name: members[id].name, position: members[id].position || '', stats });
            done++;
        }

        if (state.cancelRequested) setMessage(`Cancelled after ${done} of ${todo.length}.`);

        cache.lastFailAt = null;
        savePsCache(cache);

        // Whatever we managed to read gets written back, even a partial sweep — the
        // sheet merges rather than replaces, so half a roster is never destructive.
        if (swept.length) await syncToSheet(swept, `Swept ${done} members (${fromCache} cached).`);
    }

    /**
     * Hand observed values to the sheet and take its answer as the new truth.
     *
     * The client deliberately does not decide what is newer or better — it posts
     * what it saw and the backend merges: lifetime counters only ever move up, so a
     * stale or partial read can never lower someone's recorded total, and blanks
     * never overwrite a value that already exists. The response carries the merged
     * rows and freshly recomputed period columns, so one round trip leaves the
     * dashboard showing exactly what is in the spreadsheet.
     */
    async function syncToSheet(members, prefix) {
        const s = state.settings;
        if (!s.sheetUrl || !s.readSecret) { setMessage('Set the sheet URL and read secret first.'); return; }
        if (!members || !members.length) { setMessage('Nothing to sync yet — load data first.'); return; }

        setMessage(`${prefix ? prefix + ' ' : ''}Writing to the sheet…`);

        try {
            const res = await gmFetchJSON(s.sheetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    secret: s.readSecret,
                    action: 'sync',
                    source: 'dashboard',
                    members
                })
            });

            if (!res.ok) { setMessage(`Sync failed: ${res.error}`); return; }

            absorb(res);
            const parts = [`Synced ${res.merged} members for ${res.day}`, `${res.raised} stat${res.raised === 1 ? '' : 's'} increased`];
            if (res.drained) parts.push(`${res.drained} queued self-report${res.drained === 1 ? '' : 's'} folded in`);
            if (res.ignoredLower) parts.push(`${res.ignoredLower} lower value${res.ignoredLower === 1 ? '' : 's'} ignored`);
            setMessage(`${parts.join(' • ')}.`);
        } catch (e) {
            setMessage(`Sync failed: ${e.message}`);
        }
    }

    /** Manual "push what the browser currently shows" — used by the Sync button. */
    function syncCurrentRows() {
        const members = state.rows
            .filter(r => r.id && STAT_FIELDS.some(f => !isBlank(r[f.key])))
            .map(r => ({
                id: String(r.id),
                name: r.name,
                position: r.position || '',
                stats: Object.fromEntries(
                    STAT_FIELDS.filter(f => !isBlank(r[f.key])).map(f => [f.key, r[f.key]])
                )
            }));
        return syncToSheet(members, '');
    }

    function loadPsCache() {
        try { return JSON.parse(localStorage.getItem(PS_CACHE_KEY) || '{}'); }
        catch (_) { return {}; }
    }
    function savePsCache(obj) { localStorage.setItem(PS_CACHE_KEY, JSON.stringify(obj)); }
    function markFail() {
        const c = loadPsCache();
        c.lastFailAt = Date.now();
        savePsCache(c);
    }

    /* ---------------------------------------------------------------- *
     * Period maths
     * ---------------------------------------------------------------- */

    function currentPeriod() {
        return PERIODS.find(p => p.key === state.period) || PERIODS[0];
    }

    /**
     * The value to show for one member/field under the active period.
     * Returns { value, partial, windowDays } or null when it cannot be computed.
     *
     * Lifetime comes from the FactionUsage row; every period figure is read straight
     * out of the sheet's UsagePeriods tab. Deliberately not recomputed here — the
     * dashboard and the spreadsheet must never be able to disagree about a number.
     */
    function periodValue(row, field) {
        const period = currentPeriod();

        if (!period.days) {
            return isBlank(row[field.key]) ? null : { value: Number(row[field.key]) };
        }
        if (field.lifetimeOnly) return null;

        const periods = state.periodsById[String(row.id)];
        if (!periods) return null;

        const value = periods[`${period.prefix}_${field.key}`];
        if (isBlank(value)) return null;

        const rawWindow = Number(periods[`${period.prefix}_window`]);
        const windowDays = Number.isFinite(rawWindow) && rawWindow > 0 ? rawWindow : period.days;

        return {
            value: Number(value),
            partial: windowDays < period.days,
            windowDays,
            anchor: periods.anchor || ''
        };
    }

    /**
     * Rate per day over the window that was actually measured.
     *
     * Dividing by the real span rather than the nominal one matters: a 5-day window
     * labelled "7 Days" would otherwise understate someone's rate by nearly a third.
     * Only meaningful for counters — networth is a balance, not something accrued.
     */
    function displayValue(result, field) {
        if (!state.perDay || !currentPeriod().days || field.type !== 'counter') {
            return { value: result.value, rate: false };
        }
        return { value: result.value / (result.windowDays || 1), rate: true };
    }

    function visibleFields() {
        const period = currentPeriod();
        return STAT_FIELDS.filter(f => !(period.days && f.lifetimeOnly));
    }

    function visibleRows() {
        const needle = state.filter.trim().toLowerCase();
        let list = state.rows.filter(r => {
            if (!needle) return true;
            return String(r.name).toLowerCase().includes(needle) ||
                   String(r.id).includes(needle) ||
                   String(r.position || '').toLowerCase().includes(needle);
        });

        const { key, dir } = state.sort;
        const mult = dir === 'asc' ? 1 : -1;
        const field = STAT_FIELDS.find(f => f.key === key);

        list = [...list].sort((a, b) => {
            if (key === 'name' || key === 'position') {
                return mult * String(a[key] || '').localeCompare(String(b[key] || ''));
            }
            if (!field) return 0;
            const av = periodValue(a, field);
            const bv = periodValue(b, field);
            // Members with no value for this column always sink to the bottom.
            if (!av && !bv) return 0;
            if (!av) return 1;
            if (!bv) return -1;
            return mult * (av.value - bv.value);
        });

        return list;
    }

    function columnTotals(list) {
        const totals = {};
        visibleFields().forEach(f => {
            if (f.type !== 'counter') return;
            let sum = 0;
            let any = false;
            list.forEach(r => {
                const v = periodValue(r, f);
                if (v && Number.isFinite(v.value)) { sum += v.value; any = true; }
            });
            totals[f.key] = any ? sum : null;
        });
        return totals;
    }

    /* ---------------------------------------------------------------- *
     * Styles
     * ---------------------------------------------------------------- */

    function injectStyles() {
        const style = document.createElement('style');
        style.id = `${APP_ID}-styles`;
        style.textContent = `
            #${APP_ID}, #${APP_ID} * { box-sizing: border-box; }

            #${APP_ID} {
                --fi-panel: rgba(8, 18, 27, 0.98);
                --fi-border: #29475c;
                --fi-border-soft: rgba(71, 117, 148, 0.3);
                --fi-blue: #55b7ff;
                --fi-blue-bright: #8ad5ff;
                --fi-text: #edf4fb;
                --fi-muted: #99aab8;
                --fi-green: #51d96a;
                --fi-red: #ff6c77;
                --fi-amber: #e8c276;

                position: static;
                z-index: 999999;
                color: var(--fi-text);
                font-family: Arial, Helvetica, sans-serif;
                font-size: 11px;
                line-height: 1.25;
                user-select: none;
            }

            #${APP_ID} button, #${APP_ID} input, #${APP_ID} select { font: inherit; }

            .fu-launcher, .fu-shell {
                position: fixed;
                top: 92px;
                right: 14px;
                z-index: 999999;
            }

            .fu-launcher {
                display: grid;
                place-items: center;
                width: 40px;
                height: 40px;
                padding: 0;
                border: 1px solid #2e5874;
                border-radius: 9px;
                background:
                    radial-gradient(circle, rgba(73, 185, 255, 0.18), transparent 55%),
                    linear-gradient(180deg, #0a1823, #07121b);
                color: var(--fi-blue-bright);
                box-shadow: 0 7px 18px rgba(0, 0, 0, 0.42), inset 0 0 0 1px rgba(116, 199, 255, 0.04);
                cursor: move;
                touch-action: none;
                font-size: 21px;
                line-height: 1;
            }

            .fu-launcher:hover {
                border-color: var(--fi-blue);
                background:
                    radial-gradient(circle, rgba(73, 185, 255, 0.27), transparent 58%),
                    linear-gradient(180deg, #102433, #091722);
            }

            .fu-shell {
                display: flex;
                flex-direction: column;
                width: 780px;
                max-width: calc(100vw - 20px);
                max-height: calc(100vh - 24px);
                overflow: hidden;
                border: 1px solid var(--fi-border);
                border-radius: 9px;
                background:
                    radial-gradient(circle at 20% 0%, rgba(42, 147, 218, 0.08), transparent 27%),
                    linear-gradient(180deg, #071018 0%, #08121a 100%);
                box-shadow: 0 14px 34px rgba(0, 0, 0, 0.52), inset 0 0 0 2px rgba(92, 164, 209, 0.05);
            }

            .fu-shell[hidden], .fu-launcher[hidden] { display: none !important; }

            .fu-header {
                display: grid;
                grid-template-columns: 30px minmax(0, 1fr) auto 26px 26px;
                gap: 7px;
                align-items: center;
                min-height: 36px;
                padding: 4px 7px;
                border-bottom: 1px solid var(--fi-border-soft);
                cursor: move;
                touch-action: none;
            }

            .fu-brand-mark {
                display: grid;
                place-items: center;
                width: 28px;
                height: 28px;
                border: 1px solid var(--fi-border);
                border-radius: 7px;
                background:
                    radial-gradient(circle, rgba(72, 178, 255, 0.19), transparent 52%),
                    linear-gradient(145deg, #071019, #0a1d2b);
                color: var(--fi-blue-bright);
                font-size: 16px;
                text-shadow: 0 0 8px rgba(75, 184, 255, 0.48);
            }

            .fu-title {
                color: #f0f7ff;
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 0.4px;
                line-height: 1;
                text-transform: uppercase;
                white-space: nowrap;
            }

            .fu-subtitle {
                margin-top: 1px;
                color: var(--fi-blue);
                font-size: 6px;
                font-weight: 700;
                letter-spacing: 0.85px;
                line-height: 1.2;
                text-transform: uppercase;
            }

            .fu-history-chip {
                padding: 3px 7px;
                border: 1px solid var(--fi-border);
                border-radius: 20px;
                color: var(--fi-muted);
                font-size: 7px;
                font-weight: 700;
                letter-spacing: 0.5px;
                text-transform: uppercase;
                white-space: nowrap;
            }

            .fu-icon-button {
                width: 26px;
                height: 26px;
                padding: 0;
                border: 1px solid var(--fi-border);
                border-radius: 6px;
                background: #09131c;
                color: var(--fi-blue-bright);
                cursor: pointer;
                font-size: 14px;
                line-height: 1;
            }

            .fu-icon-button:hover { border-color: var(--fi-blue); background: #102331; }
            .fu-close { color: var(--fi-text); font-size: 17px; }

            .fu-scroll {
                display: flex;
                flex-direction: column;
                min-height: 0;
                overflow-y: auto;
            }

            .fu-section {
                margin: 5px 6px 0;
                padding: 6px;
                border: 1px solid var(--fi-border);
                border-radius: 6px;
                background: var(--fi-panel);
            }

            .fu-section[hidden] { display: none !important; }

            .fu-section-title {
                display: flex;
                align-items: center;
                gap: 4px;
                margin: 0 0 5px;
                color: var(--fi-blue);
                font-size: 10px;
                font-weight: 800;
                letter-spacing: 0.55px;
                text-transform: uppercase;
            }

            .fu-snow { color: var(--fi-blue-bright); font-size: 11px; }

            .fu-field-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 5px;
            }

            .fu-field-label {
                display: block;
                margin-bottom: 3px;
                color: var(--fi-muted);
                font-size: 8px;
                text-transform: uppercase;
                letter-spacing: 0.4px;
            }

            .fu-input {
                width: 100%;
                min-width: 0;
                height: 29px;
                padding: 0 8px;
                border: 1px solid #27465c;
                border-radius: 5px;
                outline: none;
                background: #050d13;
                color: var(--fi-text);
                font-size: 10px;
            }

            .fu-input::placeholder { color: #6f7e89; }
            .fu-input:focus { border-color: var(--fi-blue); box-shadow: 0 0 0 2px rgba(70, 174, 245, 0.08); }

            .fu-toggles {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 4px;
                margin-top: 6px;
            }

            .fu-toggle {
                display: flex;
                align-items: center;
                gap: 6px;
                color: var(--fi-muted);
                font-size: 9px;
                cursor: pointer;
            }

            .fu-toggle input { width: auto; height: auto; margin: 0; accent-color: #2d7fc3; }

            .fu-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 5px;
                margin-top: 6px;
            }

            .fu-action {
                height: 27px;
                padding: 0 9px;
                border: 1px solid #2d7fc3;
                border-radius: 5px;
                background: linear-gradient(180deg, #174c7c, #10355a);
                color: #fff;
                cursor: pointer;
                font-size: 8px;
                font-weight: 700;
                letter-spacing: 0.4px;
                text-transform: uppercase;
            }

            .fu-action:hover { filter: brightness(1.14); }
            .fu-action:disabled { cursor: wait; opacity: 0.55; filter: none; }
            .fu-action.fu-secondary { border-color: var(--fi-border); background: #09131c; color: var(--fi-text); }
            .fu-action.fu-danger { border-color: #6d2b32; background: #1a0d10; color: #ffb3b8; }
            .fu-action[hidden] { display: none !important; }

            .fu-note {
                margin-top: 5px;
                color: var(--fi-muted);
                font-size: 7px;
                line-height: 1.35;
            }

            .fu-control-bar {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                gap: 6px;
                align-items: center;
            }

            .fu-periods {
                display: inline-flex;
                overflow: hidden;
                border: 1px solid var(--fi-border);
                border-radius: 6px;
            }

            .fu-period {
                padding: 0 11px;
                height: 27px;
                border: 0;
                border-right: 1px solid var(--fi-border-soft);
                background: #09131c;
                color: var(--fi-muted);
                cursor: pointer;
                font-size: 9px;
                font-weight: 700;
                letter-spacing: 0.4px;
                text-transform: uppercase;
            }

            .fu-period:last-child { border-right: 0; }
            .fu-period:hover { color: var(--fi-text); background: #102331; }

            .fu-period[aria-pressed="true"] {
                background: linear-gradient(180deg, #174c7c, #10355a);
                color: #fff;
                text-shadow: 0 0 6px rgba(120, 200, 255, 0.5);
            }

            .fu-message {
                min-height: 11px;
                margin-top: 5px;
                color: var(--fi-muted);
                font-size: 8px;
                line-height: 1.3;
            }

            .fu-table-wrap {
                margin: 5px 6px;
                border: 1px solid var(--fi-border-soft);
                border-radius: 6px;
                background: rgba(4, 11, 17, 0.52);
                overflow: auto;
                max-height: 52vh;
            }

            .fu-table { width: 100%; border-collapse: collapse; }

            .fu-table th {
                position: sticky;
                top: 0;
                z-index: 1;
                padding: 5px 6px;
                border-bottom: 1px solid var(--fi-border);
                background: #0a1620;
                color: var(--fi-blue);
                cursor: pointer;
                font-size: 8px;
                font-weight: 800;
                letter-spacing: 0.4px;
                text-align: right;
                text-transform: uppercase;
                white-space: nowrap;
            }

            .fu-table th:first-child, .fu-table th:nth-child(2) { text-align: left; }
            .fu-table th:hover { color: var(--fi-blue-bright); background: #102331; }
            .fu-table th .fu-sort { color: var(--fi-muted); font-size: 7px; }

            .fu-table td {
                padding: 3px 6px;
                border-bottom: 1px solid var(--fi-border-soft);
                font-size: 9px;
                font-variant-numeric: tabular-nums;
                text-align: right;
                white-space: nowrap;
            }

            .fu-table td:first-child, .fu-table td:nth-child(2) { text-align: left; }
            .fu-table tbody tr:hover td { background: rgba(30, 79, 116, 0.18); }

            .fu-name { color: #f4f7fb; font-weight: 700; }
            .fu-position { color: var(--fi-muted); font-size: 8px; }
            .fu-value { color: #f7f9fc; font-weight: 700; }
            .fu-value.fu-empty { color: #55646f; font-weight: 500; }
            .fu-value.fu-zero { color: #7d8a94; font-weight: 600; }
            .fu-value.fu-partial { color: var(--fi-amber); }
            .fu-value.fu-up { color: var(--fi-green); }
            .fu-value.fu-down { color: var(--fi-red); }

            .fu-table tfoot td {
                position: sticky;
                bottom: 0;
                border-top: 1px solid var(--fi-border);
                border-bottom: 0;
                background: #0a1620;
                color: var(--fi-blue-bright);
                font-size: 9px;
                font-weight: 800;
            }

            .fu-empty-state {
                padding: 16px 10px;
                color: var(--fi-muted);
                font-size: 9px;
                text-align: center;
            }

            .fu-footer {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                min-height: 24px;
                padding: 5px 7px;
                border-top: 1px solid var(--fi-border-soft);
                color: var(--fi-blue);
                font-size: 6px;
                letter-spacing: 0.65px;
                text-align: center;
                text-transform: uppercase;
                white-space: nowrap;
            }

            .fu-footer-snow { color: var(--fi-blue-bright); font-size: 9px; }

            @media (max-width: 820px) {
                .fu-shell { width: calc(100vw - 12px); }
                .fu-field-grid, .fu-toggles { grid-template-columns: minmax(0, 1fr); }
                .fu-control-bar { grid-template-columns: minmax(0, 1fr); }
            }
        `;
        document.head.appendChild(style);
    }

    /* ---------------------------------------------------------------- *
     * Markup
     * ---------------------------------------------------------------- */

    function buildApp() {
        const root = document.createElement('div');
        root.id = APP_ID;
        root.innerHTML = `
            <button class="fu-launcher" type="button" title="Open Faction Usage Command" aria-label="Open Faction Usage Command">❄</button>

            <aside class="fu-shell" aria-label="Frostbite Faction Usage Command" hidden>
                <header class="fu-header">
                    <div class="fu-brand-mark" aria-hidden="true">❄</div>
                    <div>
                        <div class="fu-title">Usage Command</div>
                        <div class="fu-subtitle">Knowledge • Awareness • Advantage</div>
                    </div>
                    <div class="fu-history-chip">No history</div>
                    <button class="fu-icon-button fu-settings-button" type="button" title="Settings" aria-label="Settings">⚙</button>
                    <button class="fu-icon-button fu-close" type="button" title="Close" aria-label="Close">×</button>
                </header>

                <div class="fu-scroll">
                    <section class="fu-section fu-settings" hidden>
                        <div class="fu-section-title"><span class="fu-snow">❄</span>Settings</div>

                        <div class="fu-field-grid">
                            <div>
                                <label class="fu-field-label" for="fu-sheet-url">Sheet Web App URL</label>
                                <input id="fu-sheet-url" class="fu-input fu-sheet-url" type="text" autocomplete="off" spellcheck="false" placeholder="https://script.google.com/...">
                            </div>
                            <div>
                                <label class="fu-field-label" for="fu-read-secret">Leader Read Secret</label>
                                <input id="fu-read-secret" class="fu-input fu-read-secret" type="password" autocomplete="off" spellcheck="false" placeholder="Keep this private">
                            </div>
                            <div>
                                <label class="fu-field-label" for="fu-torn-key">Torn API Key</label>
                                <input id="fu-torn-key" class="fu-input fu-torn-key" type="password" maxlength="32" autocomplete="off" spellcheck="false" placeholder="Your own key">
                            </div>
                            <div>
                                <label class="fu-field-label">Faction</label>
                                <input class="fu-input fu-faction-readout" type="text" tabindex="-1" readonly value="From your API key">
                            </div>
                        </div>

                        <div class="fu-toggles">
                            <label class="fu-toggle"><input type="checkbox" class="fu-torn-enabled"> Sweep Torn from this browser</label>
                            <label class="fu-toggle"><input type="checkbox" class="fu-fetch-all"> Re-fetch every member (slower)</label>
                            <label class="fu-toggle"><input type="checkbox" class="fu-auto-refresh"> Auto-refresh every 5 minutes</label>
                        </div>

                        <div class="fu-actions">
                            <button class="fu-action fu-save" type="button">Save</button>
                            <button class="fu-action fu-secondary fu-probe" type="button">Probe Fields</button>
                            <button class="fu-action fu-secondary fu-sync-now" type="button">Push To Sheet</button>
                            <button class="fu-action fu-danger fu-clear-cache" type="button">Clear Stat Cache</button>
                        </div>

                        <div class="fu-note fu-mode-note"></div>

                        <div class="fu-note">
                            Stats come from Torn's public personal stats — the same numbers on any profile's
                            Personal Stats tab. No spies, no TornStats, nothing members have to install.
                            The sheet is the record: it merges rather than overwrites, so lifetime totals only
                            ever move up and a partial sweep can never lower someone's numbers. Period columns
                            are day-over-day differences, so they fill in once history builds. Days roll over
                            at Torn City Time.
                        </div>
                    </section>

                    <section class="fu-section">
                        <div class="fu-section-title"><span class="fu-snow">❄</span>Faction Usage</div>

                        <div class="fu-control-bar">
                            <div class="fu-periods" role="group" aria-label="Reporting period">
                                ${PERIODS.map(p => `
                                    <button class="fu-period" type="button" data-period="${p.key}" aria-pressed="false">${escapeHtml(p.label)}</button>
                                `).join('')}
                            </div>
                            <div class="fu-actions" style="margin-top:0;">
                                <button class="fu-action fu-secondary fu-perday" type="button" aria-pressed="false" title="Show usage per day instead of the window total">Per Day</button>
                                <input class="fu-input fu-filter" type="text" placeholder="Filter name / ID / rank" style="width:170px;height:27px;">
                                <button class="fu-action fu-refresh" type="button">Refresh</button>
                                <button class="fu-action fu-secondary fu-export" type="button">CSV</button>
                                <button class="fu-action fu-danger fu-cancel" type="button" hidden>Cancel</button>
                            </div>
                        </div>

                        <div class="fu-message" role="status"></div>
                    </section>

                    <div class="fu-table-wrap"></div>

                    <footer class="fu-footer">
                        <span class="fu-footer-snow">❄</span>
                        <span>© 2026 Frostbite Faction • All Rights Reserved • Loyalty. Strength. Family.</span>
                    </footer>
                </div>
            </aside>
        `;
        document.body.appendChild(root);
    }

    /* ---------------------------------------------------------------- *
     * Events
     * ---------------------------------------------------------------- */

    function bindEvents() {
        const root = document.getElementById(APP_ID);
        const launcher = root.querySelector('.fu-launcher');
        const shell = root.querySelector('.fu-shell');
        const header = root.querySelector('.fu-header');
        const settingsPanel = root.querySelector('.fu-settings');

        makeDraggable(launcher, launcher, 'launcherPosition');
        makeDraggable(shell, header, 'windowPosition');

        launcher.addEventListener('click', () => {
            if (suppressLauncherClick) { suppressLauncherClick = false; return; }
            state.open = true;
            saveState();
            renderVisibility();
            if (!state.rows.length && state.settings.sheetUrl) refresh();
        });

        root.querySelector('.fu-settings-button').addEventListener('pointerdown', e => e.stopPropagation());
        root.querySelector('.fu-settings-button').addEventListener('click', e => {
            e.stopPropagation();
            state.settingsOpen = !state.settingsOpen;
            settingsPanel.hidden = !state.settingsOpen;
            if (state.settingsOpen) fillSettingsInputs();
            requestAnimationFrame(keepAllOnScreen);
        });

        root.querySelector('.fu-close').addEventListener('pointerdown', e => e.stopPropagation());
        root.querySelector('.fu-close').addEventListener('click', e => {
            e.stopPropagation();
            state.open = false;
            saveState();
            renderVisibility();
        });

        root.querySelector('.fu-save').addEventListener('click', () => {
            state.settings.sheetUrl = root.querySelector('.fu-sheet-url').value.trim();
            state.settings.readSecret = root.querySelector('.fu-read-secret').value.trim();
            state.settings.tornApiKey = root.querySelector('.fu-torn-key').value.trim();
            saveSettings();
            setMessage('Settings saved to this browser only.');
        });

        bindToggle(root, '.fu-torn-enabled', 'tornEnabled');
        bindToggle(root, '.fu-fetch-all', 'fetchAll');
        bindToggle(root, '.fu-auto-refresh', 'autoRefresh', value => {
            if (value) { startAutoRefresh(); setMessage('Auto-refresh on.'); }
            else { stopAutoRefresh(); setMessage('Auto-refresh off.'); }
        });

        root.querySelector('.fu-probe').addEventListener('click', probeFields);
        root.querySelector('.fu-sync-now').addEventListener('click', syncCurrentRows);
        root.querySelector('.fu-clear-cache').addEventListener('click', () => {
            localStorage.removeItem(PS_CACHE_KEY);
            setMessage('Stat cache cleared — the next refresh re-pulls everyone.');
        });

        root.querySelector('.fu-refresh').addEventListener('click', refresh);
        root.querySelector('.fu-export').addEventListener('click', exportCSV);
        root.querySelector('.fu-cancel').addEventListener('click', () => {
            state.cancelRequested = true;
            setMessage('Cancelling after the current request…');
        });

        root.querySelectorAll('.fu-period').forEach(button => {
            button.addEventListener('click', () => {
                state.period = button.dataset.period;
                // Sorting by a column that this period hides would silently do nothing.
                const stillVisible = visibleFields().some(f => f.key === state.sort.key);
                if (!stillVisible && state.sort.key !== 'name' && state.sort.key !== 'position') {
                    state.sort = { key: 'name', dir: 'asc' };
                }
                saveState();
                renderAll();
            });
        });

        root.querySelector('.fu-perday').addEventListener('click', () => {
            state.perDay = !state.perDay;
            saveState();
            renderAll();
        });

        const filter = root.querySelector('.fu-filter');
        filter.addEventListener('input', () => {
            state.filter = filter.value;
            renderTable();
        });

        shell.addEventListener('click', e => e.stopPropagation());
        window.addEventListener('resize', keepAllOnScreen);
    }

    function bindToggle(root, selector, settingKey, after) {
        const el = root.querySelector(selector);
        el.addEventListener('change', () => {
            state.settings[settingKey] = el.checked;
            saveSettings();
            if (after) after(el.checked);
        });
    }

    function makeDraggable(target, handle, positionKey) {
        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            if (event.target.closest('button, input, select, .fu-table-wrap')) {
                if (!event.target.classList.contains('fu-launcher')) return;
            }

            const rect = target.getBoundingClientRect();
            const startX = event.clientX;
            const startY = event.clientY;
            const startLeft = rect.left;
            const startTop = rect.top;
            let moved = false;

            target.style.right = 'auto';
            target.style.left = `${startLeft}px`;
            target.style.top = `${startTop}px`;
            handle.setPointerCapture(event.pointerId);

            const onMove = moveEvent => {
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;

                const maxLeft = Math.max(0, window.innerWidth - target.offsetWidth);
                const maxTop = Math.max(0, window.innerHeight - target.offsetHeight);
                target.style.left = `${Math.min(maxLeft, Math.max(0, startLeft + dx))}px`;
                target.style.top = `${Math.min(maxTop, Math.max(0, startTop + dy))}px`;
            };

            const onEnd = endEvent => {
                handle.removeEventListener('pointermove', onMove);
                handle.removeEventListener('pointerup', onEnd);
                handle.removeEventListener('pointercancel', onEnd);
                if (handle.hasPointerCapture(endEvent.pointerId)) handle.releasePointerCapture(endEvent.pointerId);

                const finalRect = target.getBoundingClientRect();
                state[positionKey].left = Math.round(finalRect.left);
                state[positionKey].top = Math.round(finalRect.top);
                saveState();

                if (target.classList.contains('fu-launcher') && moved) suppressLauncherClick = true;
            };

            handle.addEventListener('pointermove', onMove);
            handle.addEventListener('pointerup', onEnd);
            handle.addEventListener('pointercancel', onEnd);
        });
    }

    /* ---------------------------------------------------------------- *
     * Probe / export
     * ---------------------------------------------------------------- */

    /**
     * Torn keeps some stats private for other players and the docs do not spell out
     * which. Rather than trust a field list, query a real faction member and report
     * exactly what came back.
     */
    async function probeFields() {
        if (!state.settings.tornApiKey) { setMessage('Enter your Torn API key first.'); return; }
        setMessage('Probing which fields are public…');
        try {
            const faction = await apiGet('/faction/?selections=basic');
            const me = await apiGet('/user/?selections=basic');
            const otherId = Object.keys(faction.members || {}).find(id => String(id) !== String(me.player_id));
            if (!otherId) { setMessage('No other faction member found to probe against.'); return; }

            const res = await apiGet(`/user/${otherId}?selections=personalstats`);
            const ps = res.personalstats || {};
            const present = API_FIELDS.filter(f => ps[f.apiKey] !== undefined).map(f => f.label);
            const missing = API_FIELDS.filter(f => ps[f.apiKey] === undefined).map(f => f.label);

            console.log('[Frostbite] Probe target:', faction.members[otherId].name, otherId);
            console.log('[Frostbite] All personalstats keys returned:', Object.keys(ps).sort());
            console.log('[Frostbite] Tracked field values:',
                Object.fromEntries(API_FIELDS.map(f => [f.label, ps[f.apiKey]])));

            setMessage(`Probe OK via ${faction.members[otherId].name}. Public: ${present.join(', ') || 'none'}. ` +
                       `Not returned: ${missing.join(', ') || 'none'}. Full key list is in the console.`);
        } catch (e) {
            setMessage(`Probe failed: ${e.message}`);
        }
    }

    function exportCSV() {
        const list = visibleRows();
        if (!list.length) { setMessage('Nothing to export.'); return; }

        const period = currentPeriod();
        const fields = visibleFields();
        const headers = ['id', 'name', 'position', ...fields.map(f => f.key), 'source', 'updated'];

        const body = list.map(r => [
            r.id, r.name, r.position || '',
            ...fields.map(f => {
                const v = periodValue(r, f);
                return v ? v.value : '';
            }),
            r.source || '', r.updated || ''
        ]);

        const csv = [headers, ...body]
            .map(line => line.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `frostbite-usage-${period.key}-${state.meta.today}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
        setMessage(`Exported ${list.length} rows (${period.label}).`);
    }

    /* ---------------------------------------------------------------- *
     * Render
     * ---------------------------------------------------------------- */

    function renderAll() {
        renderVisibility();
        applySavedPositions();
        fillSettingsInputs();
        renderChrome();
        renderMessage();
        renderTable();
    }

    function renderVisibility() {
        const root = document.getElementById(APP_ID);
        root.querySelector('.fu-shell').hidden = !state.open;
        root.querySelector('.fu-launcher').hidden = state.open;
    }

    function renderChrome() {
        const root = document.getElementById(APP_ID);

        root.querySelectorAll('.fu-period').forEach(b => {
            b.setAttribute('aria-pressed', String(b.dataset.period === state.period));
        });

        const chip = root.querySelector('.fu-history-chip');
        const days = state.meta.historyDays || 0;
        chip.textContent = days > 1 ? `${days} days history`
            : (days === 1 ? 'Day 1 of history' : 'No history');
        chip.title = state.meta.oldestDay ? `History starts ${state.meta.oldestDay} (UTC)` : '';

        const modeNote = root.querySelector('.fu-mode-note');
        if (modeNote) {
            modeNote.textContent = state.meta.unattended
                ? 'The sheet is syncing itself hourly, so this browser only reads. Browser sweeping is skipped to avoid spending the same rate limit twice.'
                : 'No unattended sync detected — data only updates while this dashboard is open. Set TORN_API_KEY and run setupHourlySync in the Apps Script editor to have the sheet track 24/7.';
        }

        const perDay = root.querySelector('.fu-perday');
        if (perDay) {
            // Only means anything over a window — hidden on Lifetime rather than
            // left visible and inert.
            perDay.hidden = !currentPeriod().days;
            perDay.setAttribute('aria-pressed', String(state.perDay));
            perDay.classList.toggle('fu-secondary', !state.perDay);
        }

        root.querySelector('.fu-refresh').disabled = state.busy;
        root.querySelector('.fu-cancel').hidden = !state.busy;
        root.querySelector('.fu-settings').hidden = !state.settingsOpen;
    }

    function fillSettingsInputs() {
        const root = document.getElementById(APP_ID);
        const map = {
            '.fu-sheet-url': 'sheetUrl',
            '.fu-read-secret': 'readSecret',
            '.fu-torn-key': 'tornApiKey'
        };
        Object.entries(map).forEach(([selector, key]) => {
            const el = root.querySelector(selector);
            if (el && document.activeElement !== el) el.value = state.settings[key] || '';
        });

        const toggles = {
            '.fu-torn-enabled': 'tornEnabled',
            '.fu-fetch-all': 'fetchAll',
            '.fu-auto-refresh': 'autoRefresh'
        };
        Object.entries(toggles).forEach(([selector, key]) => {
            const el = root.querySelector(selector);
            if (el) el.checked = !!state.settings[key];
        });
    }

    function setMessage(msg) {
        state.message = msg;
        renderMessage();
    }

    function renderMessage() {
        const el = document.querySelector(`#${APP_ID} .fu-message`);
        if (el) el.textContent = state.message;
    }

    function renderTable() {
        const wrap = document.querySelector(`#${APP_ID} .fu-table-wrap`);
        if (!wrap) return;

        const period = currentPeriod();
        const fields = visibleFields();
        const list = visibleRows();

        if (!list.length) {
            wrap.innerHTML = `<div class="fu-empty-state">${
                state.rows.length ? 'No members match that filter.' : 'No data loaded yet — hit Refresh.'
            }</div>`;
            return;
        }

        const totals = columnTotals(list);
        const sortMark = key => state.sort.key === key
            ? `<span class="fu-sort">${state.sort.dir === 'asc' ? '▲' : '▼'}</span>`
            : '';

        wrap.innerHTML = `
            <table class="fu-table">
                <thead>
                    <tr>
                        <th data-sort="name">Member ${sortMark('name')}</th>
                        <th data-sort="position">Rank ${sortMark('position')}</th>
                        ${fields.map(f => `
                            <th data-sort="${f.key}" title="${escapeHtml(f.label)}">
                                ${escapeHtml(f.icon)} ${escapeHtml(f.label)} ${sortMark(f.key)}
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${list.map(r => `
                        <tr>
                            <td><span class="fu-name">${escapeHtml(r.name)}</span></td>
                            <td><span class="fu-position">${escapeHtml(r.position || '—')}</span></td>
                            ${fields.map(f => renderCell(r, f, period)).join('')}
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot>
                    <tr>
                        <td>Faction total</td>
                        <td>${list.length} shown</td>
                        ${fields.map(f => `
                            <td>${renderTotal(totals[f.key], f, list)}</td>
                        `).join('')}
                    </tr>
                </tfoot>
            </table>
        `;

        wrap.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                const key = th.dataset.sort;
                if (state.sort.key === key) {
                    state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    // Names read best A–Z; numbers read best biggest-first.
                    state.sort = { key, dir: (key === 'name' || key === 'position') ? 'asc' : 'desc' };
                }
                saveState();
                renderTable();
            });
        });
    }

    /**
     * In per-day mode the footer shows the faction's average rate rather than a sum
     * of rates, which would be a meaningless number. Averaged across members who
     * actually have a figure, so members with no data don't drag it toward zero.
     */
    function renderTotal(total, field, list) {
        if (total === null || total === undefined) return '—';
        if (!state.perDay || !currentPeriod().days || field.type !== 'counter') {
            return escapeHtml(formatNumber(total, field.currency));
        }

        const rates = list
            .map(r => periodValue(r, field))
            .filter(Boolean)
            .map(v => v.value / (v.windowDays || 1));

        if (!rates.length) return '—';
        const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
        return `${mean.toFixed(1)} avg`;
    }

    function renderCell(row, field, period) {
        const result = periodValue(row, field);

        if (!result) {
            const reason = period.days && !field.lifetimeOnly
                ? 'No snapshot old enough yet'
                : (field.lifetimeOnly && period.days ? 'Not tracked over time' : 'No data');
            return `<td><span class="fu-value fu-empty" title="${escapeHtml(reason)}">—</span></td>`;
        }

        const classes = ['fu-value'];
        const shown = displayValue(result, field);
        let text;

        if (!period.days) {
            text = formatNumber(result.value, field.currency);
            if (result.value === 0) classes.push('fu-zero');
        } else if (field.type === 'level') {
            const sign = result.value > 0 ? '+' : (result.value < 0 ? '−' : '');
            text = `${sign}${formatNumber(Math.abs(result.value), field.currency)}`;
            if (result.value > 0) classes.push('fu-up');
            else if (result.value < 0) classes.push('fu-down');
            else classes.push('fu-zero');
        } else if (shown.rate) {
            // One decimal: "0.9/day" and "1.4/day" are meaningfully different, but
            // any more precision is false confidence on a handful of days of data.
            text = shown.value.toFixed(1);
            if (shown.value === 0) classes.push('fu-zero');
        } else {
            text = formatNumber(result.value, field.currency);
            if (result.value === 0) classes.push('fu-zero');
        }

        const notes = [];
        if (period.days) {
            notes.push(`${formatNumber(result.value, field.currency)} over ${result.windowDays} day${result.windowDays === 1 ? '' : 's'}`);
            if (result.anchor) notes.push(`measured to ${result.anchor}`);
        }
        if (result.partial) {
            classes.push('fu-partial');
            notes.push(`shorter than the ${period.label} window — not enough history yet`);
        }

        const title = notes.join(' • ');
        return `<td><span class="${classes.join(' ')}"${title ? ` title="${escapeHtml(title)}"` : ''}>${escapeHtml(text)}</span></td>`;
    }

    /* ---------------------------------------------------------------- *
     * Positioning
     * ---------------------------------------------------------------- */

    function applySavedPositions() {
        const root = document.getElementById(APP_ID);
        applySavedPosition(root.querySelector('.fu-launcher'), state.launcherPosition);
        applySavedPosition(root.querySelector('.fu-shell'), state.windowPosition);
    }

    function applySavedPosition(element, position) {
        if (Number.isFinite(position.left) && Number.isFinite(position.top)) {
            element.style.right = 'auto';
            element.style.left = `${position.left}px`;
            element.style.top = `${position.top}px`;
        }
        requestAnimationFrame(() => keepElementOnScreen(element, position));
    }

    function keepAllOnScreen() {
        const root = document.getElementById(APP_ID);
        if (!root) return;
        keepElementOnScreen(root.querySelector('.fu-launcher'), state.launcherPosition);
        keepElementOnScreen(root.querySelector('.fu-shell'), state.windowPosition);
        saveState();
    }

    function keepElementOnScreen(element, position) {
        if (!element || element.hidden) return;
        const rect = element.getBoundingClientRect();
        const nextLeft = Math.min(Math.max(0, window.innerWidth - rect.width), Math.max(0, rect.left));
        const nextTop = Math.min(Math.max(0, window.innerHeight - rect.height), Math.max(0, rect.top));

        element.style.right = 'auto';
        element.style.left = `${nextLeft}px`;
        element.style.top = `${nextTop}px`;
        position.left = Math.round(nextLeft);
        position.top = Math.round(nextTop);
    }

    /* ---------------------------------------------------------------- *
     * Helpers
     * ---------------------------------------------------------------- */

    function isBlank(v) { return v === undefined || v === null || v === ''; }

    function formatNumber(value, currency) {
        const num = Number(value);
        if (!Number.isFinite(num)) return String(value);
        const text = Math.round(num).toLocaleString('en-US');
        return currency ? `$${text}` : text;
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[c]));
    }
})();
