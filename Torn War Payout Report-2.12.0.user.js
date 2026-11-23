// ==UserScript==
// @name         Torn War Payout Report
// @namespace    https://github.com/iSatomi/torn-war-payout-report
// @version      2.12.21-local
// @description  Per-member ranked war breakdown: hits, losses (all attackers + enemy-only), defends held, stalemates, assists and respect — plus a FACTION DRUG ANALYZER that ties Xanax taken from the armoury to hits actually landed, per war, and a MULTI-WAR SWEEP that runs the same check across every war at once to surface repeat offenders. Loops faction/attacks across the war window (handles the 100-record cap), classifies every hit, and exports as an aligned table, Discord block, TSV, CSV or a standalone HTML report.
// @author       iSatomi [3580191]
// @license      GPL-3.0
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM.getValue
// @grant        GM.setValue
// @connect      api.torn.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /* ============================================================
     * Torn War Payout Report
     * ------------------------------------------------------------
     * WHY: The in-game war page only shows score per member, never
     * a wins / losses / stalemates breakdown. That detail only
     * exists in faction/attacks, which is capped at 100 rows per
     * call, so we paginate across the whole war window, dedupe,
     * classify each hit, and tally per member.
     *
     * Uses the stable v1 faction selections (attacks, rankedwars,
     * basic). If Torn fully retires v1 for you, ping me and I'll
     * port the request layer to v2 — only fetchJSON / parsing
     * would change.
     * ============================================================ */

    const LS_KEY = 'twpr_apikey';
    const LS_FABPOS = 'twpr_fabpos';
    const LS_COLORS = 'twpr_colors';
    const API_BASE = 'https://api.torn.com';
    const REQ_DELAY_MS = 650;          // stay well under 100 req/min
    const PAGE_HARD_LIMIT = 250;       // safety: max paginated calls (covers very large wars)
    const PAGE_SIZE = 100;             // Torn's fixed attacks cap

    // Result strings, bucketed from the ATTACKER's point of view.
    const WIN_RESULTS = new Set(['Attacked', 'Mugged', 'Hospitalized', 'Arrested', 'Looted', 'Special']);
    const LOSS_RESULTS = new Set(['Lost']);
    const STALE_RESULTS = new Set(['Stalemate']);
    const ESCAPE_RESULTS = new Set(['Escape', 'Timeout']);
    const ASSIST_RESULTS = new Set(['Assist']);

    // A ranked-war hit carries the war bonus (modifiers.war > 1). This is the
    // most reliable "is this a war hit" signal — it holds even when the
    // attacker stealthed and hid their faction, which is how enemy hits slip
    // through faction-based matching.
    function hasWarBonus(a) {
        const m = a && a.modifiers;
        if (!m) return false;
        const w = Number(m.war);
        return Number.isFinite(w) && w > 1;
    }

    /* ----------------------- tiny utils ----------------------- */
    const $ = (sel, root = document) => root.querySelector(sel);
    const fmt = (n) => Number(n || 0).toLocaleString('en-US');
    const fmtMoney = (n) => '$' + Math.round(Number(n || 0)).toLocaleString('en-US');
    const fmtMoneyShort = (n) => {
        n = Number(n || 0);
        if (!n) return '$0';
        const abs = Math.abs(n), trim = (x) => String(Math.round(x * 100) / 100);
        if (abs >= 1e9) return '$' + trim(n / 1e9) + 'b';
        if (abs >= 1e6) return '$' + trim(n / 1e6) + 'm';
        if (abs >= 1e3) return '$' + trim(n / 1e3) + 'k';
        return '$' + n;
    };
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    // Anything from Torn (player names, item names, raw news text) is escaped
    // before it reaches innerHTML — a name containing < or & would otherwise
    // break the table it lands in.
    const escHtml = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function gmGet(key, def) {
        try {
            if (typeof GM !== 'undefined' && GM.getValue) return GM.getValue(key, def);
            if (typeof GM_getValue === 'function') return Promise.resolve(GM_getValue(key, def));
        } catch (e) {}
        try { const v = localStorage.getItem(key); return Promise.resolve(v === null ? def : v); }
        catch (e) { return Promise.resolve(def); }
    }
    function gmSet(key, val) {
        try {
            if (typeof GM !== 'undefined' && GM.setValue) return GM.setValue(key, val);
            if (typeof GM_setValue === 'function') { GM_setValue(key, val); return Promise.resolve(); }
        } catch (e) {}
        try { localStorage.setItem(key, val); } catch (e) {}
        return Promise.resolve();
    }

    /* ------------------- 30-day report cache ------------------ */
    const CACHE_PREFIX = 'twpr_cache_';
    const CACHE_INDEX = 'twpr_cache_index';
    const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days

    function humanAge(ms) {
        const s = Math.max(0, Math.floor(ms / 1000));
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
        const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
        return `${Math.floor(h / 24)}d`;
    }

    async function cacheIndexGet() {
        try { const raw = await gmGet(CACHE_INDEX, ''); return raw ? JSON.parse(raw) : []; }
        catch (e) { return []; }
    }
    async function cacheIndexSet(arr) { try { await gmSet(CACHE_INDEX, JSON.stringify(arr)); } catch (e) {} }

    /**
     * Write a war's cache entry, MERGING with whatever is already stored.
     *
     * Three callers write here and each knows about a different slice: the
     * attack pull knows the full report, the drug pull knows the drug data, and
     * the multi-war sweep knows the drug data plus the official hit list but
     * never scans attacks. A plain overwrite meant each one silently destroyed
     * the others' work — pulling a fresh war report wiped that war's drug
     * report, and the sweep couldn't cache anything at all for a war it hadn't
     * seen before. Every argument is now optional and absent means "leave what
     * is there", so the entry accumulates instead of thrashing.
     */
    async function cacheSave(war, report, attacksScanned, partial, drugs, official, od) {
        // Deliberately reads storage directly rather than cacheLoad(): that
        // rejects report-less entries, which is exactly what a drug-only sweep
        // writes, and merging against null would erase it on the second pass.
        let prev = null;
        try {
            const raw = await gmGet(CACHE_PREFIX + war.warId, '');
            if (raw) prev = JSON.parse(raw);
        } catch (e) { prev = null; }
        if (prev && Date.now() - (prev.savedAt || 0) > CACHE_TTL_MS) prev = null;   // expired: don't revive it

        const slim = (r) => ({
            list: r.list,
            totalHits: r.totalHits,
            totalRespect: r.totalRespect,
            totalLosses: r.totalLosses,
            totalEnemyOn: r.totalEnemyOn,
            totalStealthOn: r.totalStealthOn,
            enemyReportHits: r.enemyReportHits != null ? r.enemyReportHits : null,
        });

        const payload = {
            v: 3,
            reportScanVersion: report ? 3 : ((prev && prev.reportScanVersion) || 0),
            savedAt: Date.now(),
            warId: war.warId,
            oppName: war.oppName,
            attacksScanned: attacksScanned != null ? attacksScanned : (prev ? prev.attacksScanned : 0),
            partial: report ? !!partial : !!(prev && prev.partial),
            reportSavedAt: report ? Date.now() : (prev ? (prev.reportSavedAt || prev.savedAt) : null),
            drugs: drugs || (prev ? prev.drugs : null) || null,
            // Torn's official per-member hits. Immutable once a war has ended,
            // so caching it makes a re-sweep of the same wars completely free.
            official: official || (prev ? prev.official : null) || null,
            od: od || (prev ? prev.od : null) || null,
            report: report ? slim(report) : ((prev && prev.report) || null),
        };
        try { await gmSet(CACHE_PREFIX + war.warId, JSON.stringify(payload)); } catch (e) { return; }
        const idx = (await cacheIndexGet()).filter(x => x.warId !== war.warId);
        idx.push({ warId: war.warId, savedAt: payload.savedAt, oppName: war.oppName });
        await cacheIndexSet(idx);
    }

    async function cacheLoad(warId) {
        try {
            const raw = await gmGet(CACHE_PREFIX + warId, '');
            if (!raw) return null;
            const p = JSON.parse(raw);
            // A sweep-written entry has drug data and no attack report. Demanding
            // a report here is what stopped those entries from ever being read
            // back, so the sweep re-pulled the same armoury log every time.
            // Callers that need the attack report must check `p.report` — and do.
            if (!p || !p.savedAt || (!p.report && !p.drugs && !p.official)) return null;
            if (Date.now() - p.savedAt > CACHE_TTL_MS) { await cacheDelete(warId); return null; }
            if (p.report && (p.reportScanVersion !== 3 || Date.now() - (p.reportSavedAt || p.savedAt) > CACHE_TTL_MS)) { p.report = null; p.partial = true; }
            return p;
        } catch (e) { return null; }
    }

    // Update the same stored report without renewing its age or overwriting
    // attack and drug data from the snapshot displayed before the request.
    async function cacheEnemyHitTotal(warId, reportSavedAt, count, current) {
        if (!Number.isSafeInteger(count) || count < 0) return;
        const cacheKey = CACHE_PREFIX + warId;
        try {
            const raw = await gmGet(cacheKey, '');
            const saved = raw ? JSON.parse(raw) : null;
            if (!current() || !saved?.report || saved.partial || saved.reportScanVersion !== 3 ||
                (saved.reportSavedAt || saved.savedAt) !== reportSavedAt ||
                Date.now() - reportSavedAt > CACHE_TTL_MS || saved.report.enemyReportHits != null) return;
            saved.report.enemyReportHits = count;
            await gmSet(cacheKey, JSON.stringify(saved));
        } catch (_) { /* Keep the fetched total for this view if storage is unavailable. */ }
    }

    async function cacheDelete(warId) {
        try { await gmSet(CACHE_PREFIX + warId, ''); } catch (e) {}
        const idx = await cacheIndexGet();
        await cacheIndexSet(idx.filter(x => x.warId !== warId));
    }

    async function cachePrune() {
        const idx = await cacheIndexGet();
        const now = Date.now();
        const keep = [];
        for (const x of idx) {
            if (now - x.savedAt > CACHE_TTL_MS) { try { await gmSet(CACHE_PREFIX + x.warId, ''); } catch (e) {} }
            else keep.push(x);
        }
        await cacheIndexSet(keep);
    }

    async function cacheClearAll() {
        const idx = await cacheIndexGet();
        // The key list is built OUTSIDE the try. Wrapping the lookups too would
        // let a mistyped constant throw a ReferenceError straight into an empty
        // catch, and Clear would report success while quietly leaving the data
        // exactly where it was — the worst possible outcome for a button whose
        // entire job is to remove things.
        const keys = [];
        for (const x of idx) keys.push(CACHE_PREFIX + x.warId, OD_BASELINE_PREFIX + x.warId);
        // The overdose snapshot cache is permanent BY DESIGN — a past day's
        // count cannot change, so it is never re-read. That makes it the one
        // store with no self-healing path: if Torn ever hands back a wrong
        // value that survives the validation guards, nothing would ever ask
        // again. Clear must reach it, or "clear the cache and retry" stops
        // being true advice.
        keys.push(OD_DAYS_KEY, OD_LIFE_KEY);
        for (const k of keys) { try { await gmSet(k, ''); } catch (e) {} }
        await cacheIndexSet([]);
    }

    // Dual-bind tap so buttons fire once on both TornPDA (touch) and desktop (click).
    function bindTap(el, handler) {
        let touched = false;
        el.addEventListener('touchend', (e) => {
            touched = true;
            e.preventDefault();
            handler(e);
            setTimeout(() => { touched = false; }, 400);
        }, { passive: false });
        el.addEventListener('click', (e) => {
            if (touched) return;
            handler(e);
        });
    }

    /* --------------------- network layer ---------------------- */
    // GM_xmlhttpRequest with a fetch fallback so it works on both
    // TornPDA and desktop without GM grant conflicts.
    function rawRequest(url) {
        return new Promise((resolve, reject) => {
            const gmx = (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest
                      : (typeof GM_xmlhttpRequest === 'function') ? GM_xmlhttpRequest : null;
            if (gmx) {
                gmx({
                    method: 'GET',
                    url,
                    timeout: 20000,
                    onload: (res) => resolve(res.responseText),
                    onerror: () => reject(new Error('Network error')),
                    ontimeout: () => reject(new Error('Request timed out')),
                });
            } else {
                fetch(url).then(r => r.text()).then(resolve).catch(reject);
            }
        });
    }

    // Torn error codes that are transient (server/rate-limit side) and worth
    // retrying rather than aborting the whole pull. 5=too many requests,
    // 8=IP temporarily blocked, 9=API temporarily disabled, 17=backend error.
    const RETRYABLE_CODES = new Set([5, 8, 9, 17]);
    const MAX_RETRIES = 4;

    async function fetchJSON(selectionPath, params, key, attempt = 0) {
        const qs = new URLSearchParams({ ...params, key }).toString();
        const url = `${API_BASE}/${selectionPath}?${qs}`;

        let text;
        try {
            text = await rawRequest(url);
        } catch (e) {
            // Network hiccup — retry a few times before giving up.
            if (attempt < MAX_RETRIES) {
                await sleep(700 * (attempt + 1));
                return fetchJSON(selectionPath, params, key, attempt + 1);
            }
            throw e;
        }

        let data;
        try { data = JSON.parse(text); }
        catch (e) {
            if (attempt < MAX_RETRIES) {
                await sleep(700 * (attempt + 1));
                return fetchJSON(selectionPath, params, key, attempt + 1);
            }
            throw new Error('Bad response from Torn API');
        }

        if (data && data.error) {
            const code = Number(data.error.code);
            if (RETRYABLE_CODES.has(code) && attempt < MAX_RETRIES) {
                // Backoff grows each attempt; error 5 (rate limit) waits longer.
                const base = code === 5 ? 2000 : 900;
                await sleep(base * (attempt + 1));
                return fetchJSON(selectionPath, params, key, attempt + 1);
            }
            throw new Error(`API error ${code}: ${data.error.error}`);
        }
        return data;
    }

    // v2 uses a different base and a path-style route, but the SAME key and the
    // same error envelope, so the retry/backoff logic above is reused verbatim.
    // Only the armoury news needs v2: v1's `armorynews` selection returns the
    // most recent ~100 entries with no reliable forward cursor, so a busy war
    // would silently lose everything older than the last hundred lines.
    async function fetchV2(path, params, key, attempt = 0) {
        const qs = new URLSearchParams({ ...params, key, comment: 'TWPR' }).toString();
        const url = `${API_BASE}/v2/${path}?${qs}`;

        let text;
        try { text = await rawRequest(url); }
        catch (e) {
            if (attempt < MAX_RETRIES) { await sleep(700 * (attempt + 1)); return fetchV2(path, params, key, attempt + 1); }
            throw e;
        }

        let data;
        try { data = JSON.parse(text); }
        catch (e) {
            if (attempt < MAX_RETRIES) { await sleep(700 * (attempt + 1)); return fetchV2(path, params, key, attempt + 1); }
            throw new Error('Bad response from Torn API (v2)');
        }

        if (data && data.error) {
            const code = Number(data.error.code);
            if (RETRYABLE_CODES.has(code) && attempt < MAX_RETRIES) {
                const base = code === 5 ? 2000 : 900;
                await sleep(base * (attempt + 1));
                return fetchV2(path, params, key, attempt + 1);
            }
            throw new Error(`API error ${code}: ${data.error.error}`);
        }
        return data;
    }

    /* ------------------- war + attack pulls ------------------- */
    async function getFactionContext(key) {
        const data = await fetchJSON('faction/', { selections: 'basic,rankedwars' }, key);
        const members = data.members || {};
        const wars = data.rankedwars || {};
        return {
            factionId: data.ID,
            factionName: data.name,
            members,                  // { id: { name, ... } }
            wars,                     // { warId: { factions:{...}, war:{start,end} } }
        };
    }

    // Normalise the rankedwars object into a clean list, newest first.
    function listWars(ctx) {
        const out = [];
        for (const warId of Object.keys(ctx.wars)) {
            const w = ctx.wars[warId];
            const factions = w.factions || {};
            const ids = Object.keys(factions).map(Number);
            const oppId = ids.find(id => id !== ctx.factionId);
            const opp = factions[oppId] || {};
            const me = factions[ctx.factionId] || {};
            const war = w.war || {};
            out.push({
                warId,
                start: war.start || 0,
                end: war.end || 0,             // 0 means still running
                oppId,
                oppName: opp.name || `Faction ${oppId}`,
                myScore: me.score || 0,
                oppScore: opp.score || 0,
                winner: war.winner,
            });
        }
        out.sort((a, b) => (b.start || 0) - (a.start || 0));
        return out;
    }

    // Loop faction/attacks across [from, to], advancing by timestamp.
    // Returns { list, partial } — partial is true if a page ultimately failed
    // after retries but some attacks were already collected.
    // Inclusive timestamp boundaries are re-read and deduplicated. A full
    // page at one second cannot prove completeness without an ID cursor.
    async function pullTimestampPages(fetchPage, from, to, normalize, onProgress) {
        if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to < from) throw new Error('Invalid report time window');
        const seen = new Map();
        let cursor = from, emptyStreak = 0, complete = false, partial = false;
        for (let page = 1; page <= PAGE_HARD_LIMIT; page++) {
            let rows;
            try { rows = normalize(await fetchPage(cursor)); }
            catch (error) { if (!seen.size) throw error; partial = true; break; }
            if (!Array.isArray(rows)) { partial = true; break; }
            if (!rows.length) {
                if (++emptyStreak >= 2) { complete = true; break; }
                await sleep(REQ_DELAY_MS); continue;
            }
            emptyStreak = 0;
            let maxTs = cursor;
            for (const row of rows) {
                const ts = Number(row.timestamp_started ?? row.timestamp ?? row.ts);
                const id = String(row.id ?? row.ID ?? '');
                if (!id || !Number.isFinite(ts) || ts < from || ts > to || ts < cursor) { partial = true; continue; }
                seen.set(id, row);
                maxTs = Math.max(maxTs, ts);
            }
            if (onProgress) onProgress(seen.size, page);
            if (maxTs === cursor && rows.length >= PAGE_SIZE) { partial = true; break; }
            if (maxTs >= to && rows.length < PAGE_SIZE) { complete = true; break; }
            cursor = maxTs > cursor ? maxTs : cursor + 1;
            if (cursor > to) { complete = true; break; }
            await sleep(REQ_DELAY_MS);
        }
        return { list: Array.from(seen.values()), partial: partial || !complete };
    }
    async function pullAttacks(key, from, to, onProgress) {
        return pullTimestampPages(cursor => fetchJSON('faction/', {
            selections: 'attacks', from: cursor, to, sort: 'ASC',
        }, key), from, to, data => {
            if (!data || !data.attacks || typeof data.attacks !== 'object' || Array.isArray(data.attacks)) return null;
            return Object.entries(data.attacks).map(([id, attack]) => ({ ...attack, id }));
        }, onProgress);
    }

    /* ==================== drug analyzer ======================== */
    /* WHY THIS EXISTS: the API has no "who used what drug" selection. Torn only
     * records armoury consumption as a line of NEWS TEXT, so the numbers below
     * are parsed out of the faction's armoury log rather than read from a field.
     *
     * SCOPE — read this before trusting a zero:
     *   · Only FACTION ARMOURY drugs are visible. A member who buys their own
     *     Xanax and pops it never appears in the armoury log at all, so "0 taken"
     *     means "took none of the faction's", NOT "took none".
     *   · Torn prunes faction news. Recent wars parse fully; an old war can come
     *     back thin or empty, which is why the pane reports the window it
     *     actually covered instead of quietly showing zeroes.
     */

    // "iSatomi used one of the faction's Xanax items."  ← the standard phrasing.
    // The apostrophe is matched as a CLASS, not a literal: Torn serves that line
    // with a straight ', a curly ’, or the entity &#039; depending on the route,
    // and a literal ' silently matched none of the entity-encoded ones — which
    // would have dropped every use line and reported a clean faction.
    const USE_ONE_RE = /used\s+one of the faction['’]?s\s+(.+?)\s+items?\b/i;
    // Defensive fallback for any bulk/alternate wording Torn may emit.
    const USE_QTY_RE = /used\s+(\d+)\s*x?\s+(.+?)(?:\s+items?)?(?:\s+from the faction)?\s*\.?$/i;

    // Torn's news is HTML, so the text carries entities. Decode the handful that
    // appear in item and player names before any matching happens.
    function decodeEntities(s) {
        return String(s)
            .replace(/&#0?39;|&apos;|&rsquo;/gi, "'")
            .replace(/&quot;/gi, '"')
            .replace(/&amp;/gi, '&')
            .replace(/&nbsp;/gi, ' ');
    }

    // Anything the game classes as a drug, so the pane can separate "Xanax" from
    // "everything else" without a second API call for item categories.
    const DRUG_ITEMS = new Set([
        'xanax', 'ecstasy', 'cannabis', 'ketamine', 'lsd', 'opium', 'pcp',
        'shrooms', 'speed', 'vicodin', 'love juice',
    ]);
    const isDrug = (item) => DRUG_ITEMS.has(String(item || '').trim().toLowerCase());

    // Drugs leave the armoury two ways, and ONLY counting one of them badly
    // understates the drain: a member can pull 40 Xanax out with "gave 40x Xanax
    // to themselves" and swallow them from their own inventory, at which point
    // the armoury log never mentions them again. Verified against a live log —
    // one member withdrew 227x Xanax and scored 0 on a use-only count.
    const TAKE_RE = /\b(?:gave|loaned)\s+(\d[\d,]*)\s*x?\s+(.+?)\s+to\s+(.+?)\s+from the faction armou?ry/i;
    const DEPOSIT_RE = /\bdeposited\s+(\d[\d,]*)\s*x?\s+(.+?)\s*\.?$/i;
    const qtyNum = (s) => Number(String(s).replace(/,/g, '')) || 1;

    function parseArmoryUse(entry) {
        const raw = decodeEntities(String(entry.text ?? entry.news ?? ''));
        const plain = raw.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        const ts = Number(entry.timestamp ?? entry.ts ?? 0);
        // Every profile link in the line, in order. The FIRST is always the actor;
        // for a "gave X to Y" line the SECOND is the recipient, and the recipient
        // is who actually ends up holding the drugs.
        const links = [...raw.matchAll(/XID=(\d+)[^>]*>([^<]+)</gi)].map(m => ({ uid: String(m[1]), name: m[2] }));
        // A line with no links at all (plain-text news, or a scraped page) still
        // names the actor first — take it from the text rather than losing the
        // attribution. Without this, "X gave 227x Xanax to themselves" resolved
        // to a phantom member literally called "themselves".
        const leadName = plain.split(/\s+(?:used|gave|loaned|deposited|returned|retrieved|filled)\b/i)[0].trim();
        const actor = links[0] || (leadName ? { uid: null, name: leadName } : null);

        let m = plain.match(USE_ONE_RE);
        if (m) return mk('use', m[1], 1);

        m = plain.match(TAKE_RE);
        if (m) {
            // "to themselves" keeps the actor; a named recipient takes the credit.
            const self = /\bthem\s?selves\b|\bthemself\b/i.test(m[3]);
            const who = self ? actor : (links[1] || actor);
            return {
                kind: 'take', ts,
                uid: who ? who.uid : null,
                name: (who ? who.name : m[3]) || 'Unknown',
                item: String(m[2]).trim(), qty: qtyNum(m[1]),
                actorName: actor ? actor.name : null,
            };
        }

        m = plain.match(DEPOSIT_RE);
        if (m) return mk('deposit', m[2], qtyNum(m[1]));

        m = plain.match(USE_QTY_RE);
        if (m) return mk('use', m[2], qtyNum(m[1]));

        return null;   // a retrieve/return/fill line — nothing to attribute

        function mk(kind, item, qty) {
            return {
                kind, ts,
                uid: actor ? actor.uid : null,
                name: (actor ? actor.name : plain.split(/\s+(?:used|deposited)\b/i)[0].trim()) || 'Unknown',
                item: String(item).trim(), qty,
                actorName: actor ? actor.name : null,
            };
        }
    }

    // Cursor-walk the armoury log across [from, to]. Same shape as pullAttacks:
    // ASCENDING from a timestamp cursor so a burst of 100+ entries in one window
    // is caught up on the next page instead of being stepped over permanently.
    async function pullArmoryNews(key, from, to, onProgress) {
        return pullTimestampPages(cursor => fetchV2('faction/news', {
            cat: 'armoryAction', striptags: 'false', limit: PAGE_SIZE, sort: 'ASC', from: cursor, to,
        }, key), from, to, data => {
            if (!data || !data.news || typeof data.news !== 'object') return null;
            return Array.isArray(data.news) ? data.news : Object.entries(data.news).map(([id, row]) => ({ ...row, id }));
        }, onProgress);
    }

    // Fold parsed uses into per-member rows and join them to the war report, so
    // "took 40 Xanax" sits next to "landed 3 hits" — which is the only view that
    // answers the question anyone actually asks after a war.
    /**
     * Everything DERIVED from the raw per-member counters, in one place.
     *
     * Kept separate and re-run on every load because the 30-day cache stores the
     * whole report object, booleans included. A cached report therefore carries
     * whatever the build that created it decided — so a fix to this logic could
     * never reach an existing report, and the first live run showed "ok" for
     * seven members who took Xanax and landed nothing. Raw counts are FACTS worth
     * caching; conclusions drawn from them are not.
     */
    function deriveDrugFlags(rows) {
        const list = rows.map(r => {
            const xanax = Number(r.xanax) || 0;
            const xanTaken = Number(r.xanTaken) || 0;
            const xanDeposited = Number(r.xanDeposited) || 0;
            const hits = Number(r.hits) || 0;
            // What actually left the armoury because of this member: swallowed
            // on the spot PLUS pulled into their own inventory.
            const drawn = xanax + xanTaken;
            const net = xanDeposited - xanTaken;
            // Someone who put MORE in than they drew out is stocking the armoury,
            // not draining it — never flag them. Note the exemption is `stocker`
            // and NOT `net < 0`: a member who simply swallowed 3 Xanax never
            // withdrew or deposited, so net === 0, and `net < 0` excluded every
            // one of them.
            const stocker = xanDeposited > 0 && net >= 0;
            return {
                ...r, xanax, xanTaken, xanDeposited, hits, drawn, net, stocker,
                // Both measured on SWALLOWED, matching the sweep: a withdrawal
                // is stock movement whose fate the log never reveals, so it can
                // neither flag a member nor drag their efficiency down. The old
                // drawn-based flag branded the quartermaster "no hits" here
                // while the sweep cleared them — same person, two verdicts.
                hitsPerXan: xanax > 0 ? hits / xanax : null,
                freeloader: xanax > 0 && hits === 0 && !stocker,
            };
        });
        list.sort((a, b) => b.drawn - a.drawn || b.hits - a.hits);
        return list;
    }

    /** Join cached armoury evidence to the current trusted hit source. */
    function restoreSingleWarDrugs(cached, report) {
        if (!Array.isArray(cached?.list) || !Array.isArray(report?.list) || report.__partial) {
            return refreshDrugReport(cached);
        }
        const byId = new Map(), byName = new Map();
        const nameKey = name => String(name || '').trim().toLowerCase();
        for (const row of report.list) {
            const name = nameKey(row.name);
            byId.set(String(row.id), row);
            if (name) byName.set(name, byName.has(name) ? null : row);
        }
        const counters = ['xanax', 'xanPre', 'xanWar', 'xanPost', 'xanTaken', 'xanDeposited',
            'drugTaken', 'otherDrugs', 'nonDrug', 'total'];
        const rows = [], joined = new Map();
        for (const evidence of cached.list) {
            // Hit-only rows were synthetic. Recreate these from the finished scan.
            if (!counters.some(k => Number(evidence[k]) > 0) && !Object.keys(evidence.byItem || {}).length) continue;
            const member = evidence.id ? byId.get(String(evidence.id)) : byName.get(nameKey(evidence.name));
            const id = member ? String(member.id) : '';
            const previous = id && joined.get(id);
            if (previous) {
                for (const k of counters) previous[k] = (Number(previous[k]) || 0) + (Number(evidence[k]) || 0);
                for (const [item, count] of Object.entries(evidence.byItem || {})) {
                    previous.byItem[item] = (Number(previous.byItem[item]) || 0) + (Number(count) || 0);
                }
                continue;
            }
            const row = { ...evidence, id: member?.id ?? evidence.id, name: member?.name ?? evidence.name,
                byItem: Object.assign(Object.create(null), evidence.byItem),
                hits: member?.wins ?? 0, respect: member?.respect ?? 0, inFaction: !!member || evidence.inFaction };
            rows.push(row);
            if (id) joined.set(id, row);
        }
        for (const member of report.list) {
            if (!member.wins || joined.has(String(member.id))) continue;
            rows.push({ ...Object.fromEntries(counters.map(k => [k, 0])), byItem: {},
                id: member.id, name: member.name, hits: member.wins, respect: member.respect, inFaction: true });
        }
        const totalHits = rows.reduce((sum, row) => sum + (Number(row.hits) || 0), 0);
        return refreshDrugReport({ ...cached, list: rows, totalHits,
            hitsPerXan: cached.totalXan > 0 ? totalHits / cached.totalXan : null });
    }

    /** Re-derive a cached report so old conclusions can't outlive a logic fix. */
    function refreshDrugReport(d) {
        if (!d || !Array.isArray(d.list)) return d;
        d.list = deriveDrugFlags(d.list);
        d.freeloaders = d.list.filter(r => r.freeloader);
        d.totalDrawn = d.list.reduce((s, r) => s + r.drawn, 0);
        d.takers = d.list.filter(r => r.drawn > 0).length;
        return d;
    }

    /* ================= multi-war drug sweep ==================
     * Checking one war answers "who wasted stock last week". Checking every
     * war answers the question a leader actually has: WHO KEEPS DOING IT.
     * A single bad war is a hospital stay; the same name flagged in four
     * straight wars is a pattern, and nothing in the game shows it.
     *
     * The expensive part of a single-war run is the attack walk — hundreds of
     * paginated calls to work out who landed hits. That cost is unacceptable
     * multiplied across ten wars, and it is also unnecessary: Torn publishes
     * the OFFICIAL per-member hit count on the ranked war report, one call per
     * war, exact. So a sweep is ~1 report call + a short armoury walk per war
     * rather than a full attack pull, and the hits it uses are Torn's own
     * numbers rather than our reconstruction of them.
     * ========================================================== */

    /**
     * Official per-member war stats for OUR faction, from the ranked war report.
     * One call, exact, and available for any ENDED war.
     *
     * Returns null when the report does not exist yet — which is the normal
     * state for a live war. That null matters: without hits, "took Xanax and
     * landed nothing" is unprovable, so the sweep must refuse to flag anyone in
     * that war rather than reporting everybody as a freeloader.
     */
    async function fetchWarMemberStats(key, warId, factionId) {
        try {
            const data = await fetchJSON(`torn/${warId}`, { selections: 'rankedwarreport' }, key);
            const rep = data.rankedwarreport;
            const f = rep && rep.factions && (rep.factions[factionId] || rep.factions[String(factionId)]);
            if (!f || !f.members) return null;
            const list = [];
            for (const mid of Object.keys(f.members)) {
                const m = f.members[mid] || {};
                const raw = m.attacks;
                const wins = typeof raw === 'number' ? raw
                    : typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw) : NaN;
                // The sweep judges hits per war, so it cannot use a partially known roster.
                if (!Number.isSafeInteger(wins) || wins < 0) return null;
                list.push({
                    id: String(mid),
                    name: m.name || `#${mid}`,
                    wins,
                    respect: Number(m.score || 0),
                });
            }
            return list.length ? { list, hitCountVersion: 1 } : null;
        } catch (e) { return null; }
    }

    function planSweepWindows(wars, opts) {
        const leadDays = Math.max(0, Math.min(14, Number(opts.leadDays) || 0));
        const tailHours = Math.max(0, Math.min(72, Number(opts.tailHours) || 0));
        const now = Math.floor(Date.now() / 1000);
        const windows = wars.map(war => {
            const warStart = war.start;
            const warEnd = war.end > 0 ? war.end : now;
            return { war, warStart, warEnd, leadDays, tailHours,
                from: warStart - Math.round(leadDays * 86400),
                to: warEnd + Math.round(tailHours * 3600) };
        });
        // A cached per-war count has no evidence IDs. Reject shared seconds
        // rather than counting a single armoury entry as multiple uses or flags.
        const sorted = windows.slice().sort((a, b) => a.from - b.from);
        for (let i = 1; i < sorted.length; i++) {
            const a = sorted[i - 1], b = sorted[i];
            if (a.to >= b.from) {
                const label = w => w.war.oppName || "war #" + w.war.warId;
                return { overlap: "Armoury windows overlap for " + label(a) + " and " + label(b) +
                    ". Reduce Lead days or Tail hours, or sweep those wars separately." };
            }
        }
        return { windows };
    }

    /**
     * Run the drug analysis across several wars.
     *
     * Per war the order is: cached drugs → live pull. Reusing the 30-day cache
     * is what makes a ten-war sweep tolerable; a re-run of the same wars costs
     * nothing at all.
     *
     * `hits` carries WHERE the hit numbers came from, because that decides
     * whether flags in that war mean anything:
     *   'report' — Torn's official war report. Exact.
     *   'cache'  — a full attack pull we did earlier and stored.
     *   'none'   — unavailable (live war). Nobody is flagged; the UI says so.
     */
    async function sweepWars(key, ctx, windows, opts, onProgress) {
        const out = [];
        for (let i = 0; i < windows.length; i++) {
            const { war, warStart, warEnd, from, to, leadDays, tailHours } = windows[i];
            const step = msg => onProgress && onProgress(i + 1, windows.length, war, msg);

            const cached = opts.useCache ? await cacheLoad(war.warId) : null;

            // Hits first — a drug report built without them can't be flagged.
            // Order matters: a full attack pull beats the official report, since
            // it carries losses and defends the report never had.
            let warReport = null, hitsSrc = 'none', freshOfficial = null;
            if (cached && !cached.partial && cached.report && cached.report.list && cached.report.list.length) {
                warReport = cached.report; hitsSrc = 'cache';
            } else if (cached?.official?.hitCountVersion === 1 && cached.official.list?.length) {
                // Older caches may have coerced an absent count to zero.
                // A validated, finished war's report
                // never changes, so re-reading it would be a wasted call.
                warReport = cached.official; hitsSrc = 'report';
            } else {
                step('reading the official war report…');
                const off = await fetchWarMemberStats(key, war.warId, ctx.factionId);
                await sleep(REQ_DELAY_MS);
                // Only cache-worthy once the war has ENDED. A live war's report
                // is absent now and will exist later, so caching the miss would
                // pin "no hit data" onto a war that is about to have some.
                if (off) { warReport = off; hitsSrc = 'report'; if (warEnd < Math.floor(Date.now() / 1000)) freshOfficial = off; }
            }

            let drugs = null, fromCache = false, partial = false, cachedNow = false;
            const windowClosed = war.end > 0 && to <= Math.floor(Date.now() / 1000);
            const evidence = cached?.drugs;
            if (windowClosed && Array.isArray(evidence?.list) && !evidence.armouryPartial &&
                evidence.warStart === warStart && evidence.warEnd === warEnd &&
                evidence.pullFrom === from && evidence.pullTo === to && (tailHours === 0 || evidence.armouryWindowClosed === true)) {
                // Rejoin to the trusted hit source even when both sides came from
                // cache. An unknown result must not retain any earlier hit values.
                drugs = restoreSingleWarDrugs(evidence, warReport || { list: [] });
                fromCache = true;
            } else {
                step('pulling the armoury log…');
                const pulled = await pullArmoryNews(key, from, to, (count, page) => {
                    step(`armoury log — ${fmt(count)} entries (page ${page})`);
                });
                partial = pulled.partial;
                const evidence = buildDrugReport(ctx, null, pulled.list, { warStart, warEnd });
                drugs = warReport ? restoreSingleWarDrugs(evidence, warReport) : evidence;
                drugs.leadDays = leadDays; drugs.tailHours = tailHours;
                drugs.pullFrom = from; drugs.pullTo = to; drugs.armouryWindowClosed = windowClosed;
                // Fold into the same 30-day cache the single-war view uses, so a
                // war analysed by the sweep never has to be pulled again — by
                // the sweep OR by the single-war pane.
                //
                // `null` for the report is the important argument: the sweep has
                // no attack data, and cacheSave now keeps whatever report is
                // already stored rather than being handed a report-derived stub
                // that would silently drop the losses, defends and stalemates
                // the payout view depends on.
                //
                // A partial pull is deliberately NOT cached. Caching a log the
                // API cut short would freeze an undercount in place for thirty
                // days, and an undercount here means somebody's Xanax quietly
                // goes missing from the totals.
                if (!partial && windowClosed) {
                    await cacheSave(war, null, null, false, drugs, freshOfficial);
                    cachedNow = true;
                }
            }

            // A war whose drugs came from cache may still be learning its
            // official hits for the first time — store those on their own.
            if (!cachedNow && freshOfficial) await cacheSave(war, null, null, false, null, freshOfficial);

            out.push({ war, drugs, hitsSrc, fromCache, partial, cachedNow });
        }
        return out;
    }

    /* ================= the cost of a Xanax =====================
     * A Xanax is 250 energy. A war hit costs 25. So one Xanax is worth exactly
     * TEN HITS, and that single fact reframes the whole report.
     *
     * The first version of this counted waste as "all the Xanax drawn in wars
     * where they landed nothing", which is wrong in both directions:
     *
     *   · It misses the real waste. Someone who draws 10 and lands 5 has burnt
     *     2,375 energy for nothing — far more than someone who draws 1 and
     *     lands 0 — yet only the second was ever flagged.
     *   · It sets the bar at zero. "Landed SOME hits" became a pass mark, so a
     *     member converting 6 hits per Xanax looked identical to one converting
     *     10, when the first is wasting 40% of everything they take.
     *
     * Waste is therefore energy that left the armoury and never became a hit:
     *
     *     wasted energy = (Xanax x 250) - (hits x 25)
     *
     * TWO THINGS THIS DELIBERATELY DOES NOT CLAIM:
     *
     *   · It is never negative. Natural regen is roughly 19 hits a day of free
     *     energy, so an active fighter lands far more than their Xanax paid
     *     for. That is not "negative waste", it is just someone doing their
     *     job, and it must not be allowed to cancel out somebody else's waste
     *     in a faction total.
     *   · Energy spent at the GYM is counted here as war waste, because from
     *     the war's point of view it is. That is a judgement about the war, not
     *     an accusation of theft, and the pane says so.
     */
    const ENERGY_PER_XANAX = 250;
    const ENERGY_PER_HIT = 25;
    const HITS_PER_XANAX = ENERGY_PER_XANAX / ENERGY_PER_HIT;   // 10 — the break-even

    /** Energy drawn but never converted into a war hit. Never below zero. */
    function wastedEnergy(drawn, hits) {
        return Math.max(0, (Number(drawn) || 0) * ENERGY_PER_XANAX - (Number(hits) || 0) * ENERGY_PER_HIT);
    }
    /** The same figure in the unit people actually think in. */
    const asXanax = (energy) => energy / ENERGY_PER_XANAX;

    /**
     * Fold the per-war reports into one row per member.
     *
     * Members are keyed by Torn ID where we have one, name otherwise — the same
     * fallback the single-war builder uses, because a plain-text armoury line
     * carries no profile link and would otherwise split one person into two.
     *
     * `flagged` only counts wars whose hits were actually known. A live war with
     * no report contributes drug totals but can never contribute a flag.
     */
    function buildSweep(perWar) {
        const rows = new Map();
        const wars = perWar.map(p => ({
            warId: p.war.warId,
            oppName: p.war.oppName,
            start: p.war.start,
            hitsSrc: p.hitsSrc,
            armouryPartial: !!p.partial,
            drawn: p.drugs ? p.drugs.totalDrawn || 0 : 0,
            hits: p.drugs ? p.drugs.totalHits || 0 : 0,
            entries: p.drugs ? p.drugs.entries || 0 : 0,
            empty: !p.drugs || p.drugs.uses === 0,
        }));

        /* IDENTITY FIRST, and this is not a nicety.
         *
         * A row only carries a Torn ID when something resolved it — a profile
         * link in the armoury line, or a match against that war's report. A war
         * with NO report (live) and plain-text log lines yields the same person
         * with an empty id, so keying naively splits them in two: "Blight 2/2"
         * and "Blight 0/1" instead of one honest "Blight 2/3". Both the repeat
         * count and the totals come out wrong, which is the whole finding.
         *
         * So: learn every name→id pairing across ALL wars first, then key
         * through it. A name held by two different ids stays unresolved rather
         * than merging two people — the same refusal-to-guess the payout
         * matcher makes. */
        const nameToId = new Map();
        for (const p of perWar) {
            for (const r of (p.drugs && p.drugs.list) || []) {
                if (!r.id) continue;
                const n = String(r.name).toLowerCase();
                if (!nameToId.has(n)) nameToId.set(n, String(r.id));
                else if (nameToId.get(n) !== String(r.id)) nameToId.set(n, null);   // ambiguous
            }
        }
        const idOf = (r) => r.id ? String(r.id) : (nameToId.get(String(r.name).toLowerCase()) || '');

        for (const p of perWar) {
            if (!p.drugs || !p.drugs.list) continue;
            const known = p.hitsSrc !== 'none';
            for (const r of p.drugs.list) {
                const uid = idOf(r);
                const key = uid ? 'u' + uid : 'n' + String(r.name).toLowerCase();
                if (!rows.has(key)) {
                    rows.set(key, {
                        id: uid, name: r.name,
                        totalDrawn: 0, totalHits: 0, totalOther: 0,
                        warsSeen: 0, warsTook: 0, warsFlagged: 0, warsFought: 0,
                        warsKnown: 0, wastedE: 0, worstWar: null,
                        totalUsed: 0, totalTaken: 0, totalDeposited: 0,
                        per: {},
                    });
                }
                const g = rows.get(key);
                if (r.name && !String(g.name).startsWith('#')) g.name = g.name || r.name;
                // "Landed nothing" has to mean SWALLOWED, never drawn — judging
                // it on drawn flags the quartermaster for the crime of restocking
                // the faction. r.freeloader is the drawn-based flag and must NOT
                // be used here; the per-war cell and the member counter both read
                // this single swallowed-based value so they can never disagree.
                const swallowed = Number(r.xanax) || 0;
                const flaggedWar = known && swallowed > 0 && r.hits === 0 && !r.stocker;
                g.totalDrawn += r.drawn;
                g.totalUsed += swallowed;
                g.totalTaken += Number(r.xanTaken) || 0;
                g.totalDeposited += Number(r.xanDeposited) || 0;
                g.totalHits += r.hits;
                g.totalOther += r.otherDrugs || 0;
                g.warsSeen++;
                if (known) g.warsKnown++;
                if (r.drawn > 0) g.warsTook++;
                if (r.hits > 0) g.warsFought++;
                if (known) {
                    // Waste is measured on EVERY known war, not only the ones
                    // where they landed nothing — 10 Xanax for 5 hits is a
                    // bigger loss than 1 for 0, and the old rule saw only the
                    // second. See the energy model above.
                    // swallowed — NOT r.drawn, which folds in withdrawals whose
                    // fate the log never reveals again.
                    const e = wastedEnergy(swallowed, r.hits);
                    g.wastedE += e;
                    if (e > 0 && (!g.worstWar || e > g.worstWar.energy)) {
                        g.worstWar = { energy: e, drawn: swallowed, hits: r.hits,
                                       opp: p.war.oppName, start: p.war.start };
                    }
                    if (flaggedWar) g.warsFlagged++;
                }
                g.per[p.war.warId] = {
                    // used = swallowed. taken = moved into their own inventory.
                    // Every judgement below is made on "used"; "taken" is
                    // reported and never charged, because the armoury log never
                    // mentions it again and cannot say what became of it.
                    used: swallowed,
                    taken: Number(r.xanTaken) || 0,
                    drawn: r.drawn, hits: r.hits,
                    flagged: flaggedWar,
                    stocker: r.stocker, known,
                };
            }
        }

        const hasCompleteSweepHits = g => g.warsKnown > 0 && g.warsKnown === g.warsSeen;
        const list = [...rows.values()].map(g => ({
            ...g,
            // Member aggregates require complete hit coverage. Known per-war counts remain visible.
            hitsKnown: hasCompleteSweepHits(g),
            avgHits: hasCompleteSweepHits(g) ? g.totalHits / g.warsKnown : null,
            // Both ratios are measured on what was SWALLOWED. A member who only
            // ever withdrew has no measurable efficiency — not a zero one.
            hitsPerXan: (hasCompleteSweepHits(g) && g.totalUsed > 0) ? g.totalHits / g.totalUsed : null,
            // Xanax-equivalents of energy that never became a hit, BEFORE any
            // overdose is taken into account. applyOdExcuses derives the
            // reported figure from this, so it can run repeatedly without
            // subtracting the same excuse twice.
            wastedRaw: g.warsKnown > 0 ? asXanax(g.wastedE) : null,
            wasted: g.warsKnown > 0 ? asXanax(g.wastedE) : null,
            excused: 0, warsExcused: 0, odWars: [],
            // What share of what they drew was actually converted. 100% means
            // every Xanax became ten hits; it can exceed 100% because natural
            // regen is free energy, and that is not an error.
            efficiency: (hasCompleteSweepHits(g) && g.totalUsed > 0)
                ? (g.totalHits / (g.totalUsed * HITS_PER_XANAX)) : null,
            // Stock that left the armoury into someone's pocket and was never
            // mentioned again. Reported, never charged as waste: the log simply
            // cannot say what happened to it.
            unaccounted: Math.max(0, g.totalTaken - g.totalDeposited),
            // The whole point of the sweep. One flagged war is an anecdote.
            repeat: g.warsFlagged >= 2,
        }));
        // Repeat offenders first — the reason anyone opened this view — then by
        // how much stock they actually WASTED, not how much they drew. Ordering
        // on totalDrawn put the faction's biggest contributor near the top for
        // the crime of being active.
        // Worst waste first. This is now a continuous measure, so it ranks the
        // whole faction rather than only sorting the flagged to the top.
        list.sort((a, b) => (b.wasted || 0) - (a.wasted || 0)
                         || b.warsFlagged - a.warsFlagged || b.totalDrawn - a.totalDrawn);

        return {
            wars, list,
            totalDrawn: list.reduce((s, r) => s + r.totalDrawn, 0),
            totalHits: list.reduce((s, r) => s + r.totalHits, 0),
            // Faction-wide waste: Xanax that left the armoury and produced
            // nothing. The headline figure for this whole pane.
            totalWasted: list.reduce((s, r) => s + (r.wasted || 0), 0),
            totalExcused: 0,
            odMembers: [],
            totalUsed: list.reduce((s, r) => s + r.totalUsed, 0),
            totalUnaccounted: list.reduce((s, r) => s + r.unaccounted, 0),
            repeats: list.filter(r => r.repeat),
            flaggedAny: list.filter(r => r.warsFlagged > 0),
            unknownWars: wars.filter(w => w.hitsSrc === 'none'),
            emptyWars: wars.filter(w => w.empty),
        };
    }

    // `win` = { warStart, warEnd } — the ACTUAL fighting window. The news pull
    // covers a wider span (build-up + tail), so every use is bucketed by when it
    // happened rather than lumped together: stacking Xanax in the days before a
    // war is the intended behaviour, and a leader needs to see it SEPARATELY
    // from mid-war use, not blended into one number that hides both.
    function buildDrugReport(ctx, warReport, newsEntries, win) {
        const warStart = Number(win && win.warStart) || 0;
        const warEnd = Number(win && win.warEnd) || Infinity;
        const phaseOf = (ts) => (ts < warStart ? 'pre' : ts > warEnd ? 'post' : 'war');

        const uses = [];
        const kinds = { use: 0, take: 0, deposit: 0 };
        const unrecognised = [];
        let unparsed = 0;
        for (const n of newsEntries) {
            const u = parseArmoryUse(n);
            if (u) { uses.push(u); kinds[u.kind] = (kinds[u.kind] || 0) + 1; }
            else {
                unparsed++;
                // Keep a few samples. If a phrasing this script doesn't know ever
                // starts carrying real drug movement, the footer will show it
                // rather than silently under-reporting the total.
                if (unrecognised.length < 5) {
                    unrecognised.push(String(n.text ?? n.news ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80));
                }
            }
        }

        // Hits, keyed by both id and lowercased name — the news link gives us an
        // id most of the time, but a plain-text line only gives a name.
        const hitsById = new Map(), hitsByName = new Map();
        for (const r of (warReport ? warReport.list : [])) {
            hitsById.set(String(r.id), r);
            hitsByName.set(String(r.name).toLowerCase(), r);
        }

        const rows = new Map();
        const itemTotals = new Map();
        const ensure = (uid, name) => {
            const key = uid ? 'u' + uid : 'n' + String(name).toLowerCase();
            if (!rows.has(key)) {
                const member = (uid && hitsById.get(uid)) || hitsByName.get(String(name).toLowerCase()) || null;
                rows.set(key, {
                    id: uid || (member ? member.id : ''),
                    name: (member && member.name) || name,
                    xanax: 0, xanPre: 0, xanWar: 0, xanPost: 0,
                    xanTaken: 0, xanDeposited: 0, drugTaken: 0,
                    otherDrugs: 0, nonDrug: 0, total: 0,
                    byItem: {},
                    hits: member ? member.wins : 0,
                    respect: member ? member.respect : 0,
                    inFaction: !!(uid && ctx.members[uid]) || !!member,
                });
            }
            return rows.get(key);
        };

        let firstTs = 0, lastTs = 0;
        for (const u of uses) {
            const row = ensure(u.uid, u.name);
            const item = u.item;
            const lower = item.toLowerCase();

            // Withdrawals and deposits are stock MOVEMENT, never consumption.
            // Blending them into "used" would rank whoever restocks the armoury
            // as its heaviest abuser — the live log has a leader who deposited
            // 300 Xanax and drew 227 back, i.e. a net contributor of 73.
            if (u.kind === 'take') {
                if (lower === 'xanax') row.xanTaken += u.qty;
                else if (isDrug(item)) row.drugTaken += u.qty;
                continue;
            }
            if (u.kind === 'deposit') {
                if (lower === 'xanax') row.xanDeposited += u.qty;
                continue;
            }

            row.byItem[item] = (row.byItem[item] || 0) + u.qty;
            row.total += u.qty;
            if (lower === 'xanax') {
                row.xanax += u.qty;
                const p = phaseOf(u.ts);
                if (p === 'pre') row.xanPre += u.qty;
                else if (p === 'post') row.xanPost += u.qty;
                else row.xanWar += u.qty;
            }
            else if (isDrug(item)) row.otherDrugs += u.qty;
            else row.nonDrug += u.qty;
            itemTotals.set(item, (itemTotals.get(item) || 0) + u.qty);
            if (!firstTs || u.ts < firstTs) firstTs = u.ts;
            if (u.ts > lastTs) lastTs = u.ts;
        }

        // Members who fought but drew nothing from the armoury still belong in
        // the table — "0 taken, 62 hits" is a finding, not an absence of data.
        for (const r of (warReport ? warReport.list : [])) {
            if (!r.wins) continue;
            const key = 'u' + String(r.id);
            if (!rows.has(key) && !rows.has('n' + String(r.name).toLowerCase())) {
                rows.set(key, {
                    id: r.id, name: r.name, xanax: 0, xanPre: 0, xanWar: 0, xanPost: 0,
                    xanTaken: 0, xanDeposited: 0, drugTaken: 0, otherDrugs: 0, nonDrug: 0,
                    total: 0, byItem: {}, hits: r.wins, respect: r.respect, inFaction: true,
                });
            }
        }

        const list = deriveDrugFlags(Array.from(rows.values()));

        const totalXan = list.reduce((s, r) => s + r.xanax, 0);
        const totalHits = list.reduce((s, r) => s + r.hits, 0);
        return {
            list,
            totalXan,
            totalXanPre: list.reduce((s, r) => s + r.xanPre, 0),
            totalXanWar: list.reduce((s, r) => s + r.xanWar, 0),
            totalXanPost: list.reduce((s, r) => s + r.xanPost, 0),
            totalXanTaken: list.reduce((s, r) => s + r.xanTaken, 0),
            totalXanDeposited: list.reduce((s, r) => s + r.xanDeposited, 0),
            totalDrawn: list.reduce((s, r) => s + r.drawn, 0),
            warStart, warEnd,
            totalHits,
            totalOtherDrugs: list.reduce((s, r) => s + r.otherDrugs, 0),
            takers: list.filter(r => r.xanax > 0).length,
            freeloaders: list.filter(r => r.freeloader),
            hitsPerXan: totalXan > 0 ? totalHits / totalXan : null,
            items: Array.from(itemTotals.entries()).sort((a, b) => b[1] - a[1]),
            entries: newsEntries.length,
            uses: uses.length,
            kinds, unrecognised,
            unparsed,
            firstTs, lastTs,
        };
    }

    /* ==================== overdose check ======================
     * "They took 12 Xanax and landed nothing" has an innocent explanation more
     * often than people assume, and the most common one is an OVERDOSE — an OD
     * puts you in hospital for hours and ends your war.
     *
     * Torn publishes `overdosed` on personalstats, which ANY key can read for
     * ANY player (same number as the Personal Stats tab of their profile). But
     * that counter is LIFETIME. "Has OD'd 4 times ever" is not evidence that one
     * happened during your war, and reporting it as though it were would put a
     * false accusation in front of a leader. So this reports one of four things
     * and never blurs them:
     *
     *   delta     — an OD count from BEFORE the war compared to AFTER it.
     *               Proof. Says how many.
     *   baseline  — no history yet; today's count is stored so the NEXT check
     *               can produce a real delta. Answers nothing this run.
     *   lifetime  — only the all-time count is available. Explicitly not a
     *               claim about this war.
     *   error     — the lookup failed. Say so rather than implying "clean".
     */

    const OD_BASELINE_PREFIX = 'twpr_od_';

    // Torn has moved this field's name and nesting between API revisions
    // (`overdosed`, `overdoses`, nested under a drugs group in v2). Rather than
    // hard-coding one shape and silently reading undefined — which would report
    // every member as having zero ODs — walk the response for any key that looks
    // like an overdose count and take the first number found.
    function pluckOverdoses(obj, depth = 0) {
        if (obj == null || depth > 5) return null;
        if (Array.isArray(obj)) {
            for (const v of obj) {
                // v2's stat= form returns [{name:'overdoses', value:N}]
                if (v && typeof v === 'object' && /overdos/i.test(String(v.name || v.stat || ''))) {
                    const n = Number(v.value ?? v.total);
                    if (Number.isFinite(n)) return n;
                }
                const hit = pluckOverdoses(v, depth + 1);
                if (hit != null) return hit;
            }
            return null;
        }
        if (typeof obj !== 'object') return null;
        for (const [k, v] of Object.entries(obj)) {
            if (/overdos/i.test(k) && Number.isFinite(Number(v))) return Number(v);
        }
        for (const v of Object.values(obj)) {
            const hit = pluckOverdoses(v, depth + 1);
            if (hit != null) return hit;
        }
        return null;
    }

    /* ================= overdose snapshot cache ==================
     * A member's overdose count ON A PAST DAY CANNOT CHANGE. It is a historical
     * fact, so once read it never needs reading again — not for this war, not
     * for the next one, not ever. That makes the OD check almost free after its
     * first run, and it makes checking five wars cost far less than five times
     * one war, because neighbouring wars share boundary days.
     *
     * Two rules keep the cache honest, and the second one is the important one:
     *
     *   · Only PAST days are stored. Today's count can still go up, so caching
     *     it would freeze a number that is still moving.
     *
     *   · A ZERO is only stored when the member's lifetime count is also zero.
     *     Torn's timestamped personalstats returns 0 instead of an error, and a
     *     false zero written to a permanent cache would clear an unchecked
     *     member forever — the worst thing this feature can do, made permanent.
     *     A genuine never-OD'd member still caches fine, because their lifetime
     *     is zero too.
     */
    const OD_DAYS_KEY = 'twpr_od_days';       // { uid: { 'YYYY-MM-DD': count } }
    const OD_LIFE_KEY = 'twpr_od_life';       // { uid: { v, at } } — lifetime, TTL'd
    const OD_LIFE_TTL_MS = 6 * 60 * 60 * 1000;

    async function loadOdDays() {
        try { const raw = await gmGet(OD_DAYS_KEY, ''); return raw ? JSON.parse(raw) : {}; }
        catch (e) { return {}; }
    }
    async function saveOdDays(map) {
        try { await gmSet(OD_DAYS_KEY, JSON.stringify(map)); } catch (e) {}
    }
    async function loadOdLife() {
        try { const raw = await gmGet(OD_LIFE_KEY, ''); return raw ? JSON.parse(raw) : {}; }
        catch (e) { return {}; }
    }
    async function saveOdLife(map) {
        try { await gmSet(OD_LIFE_KEY, JSON.stringify(map)); } catch (e) {}
    }

    /** Is this day finished, and therefore safe to remember? */
    const odDayIsPast = (day, nowSec) => day < dayOfTs(nowSec || Math.floor(Date.now() / 1000));

    /** Store a reading, or decline to. See the two rules above. */
    function odDaysPut(map, uid, day, val, lifetime, nowSec) {
        if (!Number.isFinite(val)) return false;
        if (!odDayIsPast(day, nowSec)) return false;
        if (val === 0 && Number(lifetime) > 0) return false;   // the false-zero guard
        (map[uid] || (map[uid] = {}))[day] = val;
        return true;
    }

    async function loadOdBaseline(warId) {
        try { const raw = await gmGet(OD_BASELINE_PREFIX + warId, ''); return raw ? JSON.parse(raw) : {}; }
        catch (e) { return {}; }
    }
    async function saveOdBaseline(warId, map) {
        try { await gmSet(OD_BASELINE_PREFIX + warId, JSON.stringify(map)); } catch (e) {}
    }

    /*
     * Historical personal stats. Request shape and timing conventions are lifted
     * from the Frostbite backend, which learned them the hard way:
     *
     *   · It is **v1** — user/{id}?selections=personalstats&stat=&timestamp=.
     *     The v2 route this originally used returned nothing, which is why every
     *     member came back "unknown" on the first live run.
     *   · 02:00 UTC, not midday. Torn stores these at Torn City midnight and
     *     returns the CLOSEST one, so midday is exactly equidistant between two
     *     days — when it resolves forward you silently get the next day's numbers
     *     and every delta comes out zero.
     *   · A query for day D returns the value as of the END of D. Measured
     *     directly by the Frostbite team: a live reading on 07-18 matched the
     *     timestamped query for 07-17.
     */
    const dayOfTs = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);
    const dayShift = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
    const dayToEpoch = (day) => Math.floor(Date.parse(day + 'T02:00:00Z') / 1000);

    /**
     * One day's overdose count. Answers from cache when it can — a past day is
     * immutable, so a cached reading is as good as a fresh one and costs
     * nothing. `st` accumulates {calls, hits} so the caller can report savings.
     */
    async function odAtDay(key, uid, day, ctx) {
        const cached = ctx && ctx.days[uid] && ctx.days[uid][day];
        if (Number.isFinite(cached)) { if (ctx) ctx.hits++; return cached; }
        try {
            const data = await fetchJSON(`user/${uid}`, {
                selections: 'personalstats', stat: 'overdosed', timestamp: dayToEpoch(day),
            }, key);
            if (ctx) ctx.calls++;
            const v = pluckOverdoses(data && (data.personalstats || data));
            if (ctx && odDaysPut(ctx.days, uid, day, v, ctx.life[uid], ctx.nowSec)) ctx.dirty = true;
            return v;
        } catch (e) { if (ctx) ctx.calls++; return null; }
    }

    async function checkOverdoses(key, members, war, onProgress) {
        const baseline = await loadOdBaseline(war.warId);
        const nowSec = Math.floor(Date.now() / 1000);
        const warEnded = war.end && war.end > 0 && war.end < nowSec;
        const out = {};
        let done = 0;

        // Shared across every member in this run AND across runs.
        const days = await loadOdDays();
        const lifeCache = await loadOdLife();
        const ctx = { days, life: {}, nowSec, calls: 0, hits: 0, dirty: false };

        for (const m of members) {
            if (onProgress) onProgress(++done, members.length, m.name);

            // Lifetime count first — every other reading is validated against it.
            // Short TTL rather than permanent: unlike a dated snapshot this one
            // genuinely moves, and a stale high value would mask a real OD.
            let lifetime = null, err = null;
            const lc = lifeCache[m.id];
            if (lc && Number.isFinite(lc.v) && (nowSec * 1000 - lc.at) < OD_LIFE_TTL_MS) {
                lifetime = lc.v;
                ctx.hits++;
            } else {
                try {
                    const v1 = await fetchJSON(`user/${m.id}`, { selections: 'personalstats' }, key);
                    ctx.calls++;
                    lifetime = pluckOverdoses(v1 && v1.personalstats);
                    if (Number.isFinite(lifetime)) lifeCache[m.id] = { v: lifetime, at: nowSec * 1000 };
                } catch (e) { err = e.message; ctx.calls++; }
            }
            ctx.life[m.id] = lifetime;

            if (lifetime == null) {
                out[m.id] = { mode: 'error', err: err || 'no overdose field in the response' };
                await sleep(REQ_DELAY_MS);
                continue;
            }

            // A lifetime total of zero settles it outright: they have never
            // overdosed, so they certainly did not overdose during this war.
            // Two dated lookups per member skipped, which is what makes
            // checking a whole roster affordable rather than a six-minute wait.
            if (lifetime === 0) {
                out[m.id] = { mode: 'delta', ods: 0, before: 0, after: 0, lifetime: 0 };
                baseline[m.id] = 0;
                continue;
            }

            // Best case: ask Torn what the count was on each side of the war.
            // A query for day D holds the value as of the END of D, so the
            // "before" reading is the day BEFORE the war started.
            let before = null, after = null;
            if (warEnded) {
                // Pacing is skipped on a cache hit — there is no request to pace.
                const bDay = dayShift(dayOfTs(war.start), -1);
                const hadB = ctx.hits;
                before = await odAtDay(key, m.id, bDay, ctx);
                if (ctx.hits === hadB) await sleep(REQ_DELAY_MS);

                const aDay = dayOfTs(war.end);
                const hadA = ctx.hits;
                after = await odAtDay(key, m.id, aDay, ctx);
                if (ctx.hits === hadA) await sleep(REQ_DELAY_MS);

                // Torn sometimes has no snapshot yet for a very recent day. One
                // step forward is worth trying before giving up on the delta.
                if (!Number.isFinite(after)) {
                    const hadA2 = ctx.hits;
                    after = await odAtDay(key, m.id, dayShift(aDay, 1), ctx);
                    if (ctx.hits === hadA2) await sleep(REQ_DELAY_MS);
                }
            }

            /*
             * THE TRAP, and the reason this guard exists: Torn's timestamped
             * personalstats has a documented habit of returning 0 for everything
             * rather than an error. Taken at face value that reads 0 → 0 = "no
             * overdose", and the script would CLEAR a member it never actually
             * checked — the single worst outcome this feature can produce.
             * Someone with 65 lifetime ODs did not have 0 before the war.
             */
            const zeroSuspect = before === 0 && after === 0 && lifetime > 0;
            if (zeroSuspect || (Number.isFinite(after) && after > lifetime)) {
                before = after = null;
                // Whatever nonsense produced that must not be remembered. The
                // cache-write guard already refuses a false zero, but an
                // above-lifetime reading is a different failure and gets purged
                // here so a re-check genuinely re-asks rather than replaying it.
                if (days[m.id]) {
                    delete days[m.id][dayShift(dayOfTs(war.start), -1)];
                    delete days[m.id][dayOfTs(war.end)];
                    ctx.dirty = true;
                }
            }

            if (Number.isFinite(before) && Number.isFinite(after) && after >= before) {
                out[m.id] = { mode: 'delta', ods: after - before, before, after, lifetime };
            } else if (Number.isFinite(baseline[m.id]) && lifetime >= baseline[m.id]) {
                // A snapshot we took on an earlier run gives a real delta too,
                // just anchored to when we first looked rather than to the war.
                out[m.id] = { mode: 'baseline', ods: lifetime - baseline[m.id],
                              before: baseline[m.id], after: lifetime, lifetime,
                              since: baseline.__at || null };
            } else {
                out[m.id] = { mode: 'lifetime', lifetime };
            }

            baseline[m.id] = lifetime;      // anchor the next check
            await sleep(REQ_DELAY_MS);
        }

        baseline.__at = nowSec;
        await saveOdBaseline(war.warId, baseline);
        if (ctx.dirty) await saveOdDays(days);
        await saveOdLife(lifeCache);
        // Non-enumerable so it can ride along without appearing as a member id
        // to anything that iterates the results — odCell would try to render it.
        Object.defineProperty(out, '__stats', { value: { calls: ctx.calls, hits: ctx.hits }, enumerable: false });
        return out;
    }

    /* --------------------- classification --------------------- */
    function blankRow(id, name) {
        return {
            id, name,
            wins: 0,          // offensive WAR HITS (successful hits on the enemy)
            offLost: 0,       // offensive: attacked the enemy and lost
            stalemates: 0,    // offensive stalemates vs enemy
            assists: 0,
            respect: 0,
            lossAll: 0,       // DEFENSIVE: beaten by ANYONE during the war window
            lossEnemy: 0,     // DEFENSIVE: beaten specifically by the enemy faction (subset of lossAll)
            enemyOn: 0,       // DEFENSIVE: incoming attacks confirmed from the enemy faction
            stealthOn: 0,     // DEFENSIVE: incoming stealthed attacks (attacker hidden — almost always the enemy mid-war)
            defHeld: 0,       // DEFENSIVE: held / repelled an incoming attack
            totalOff: 0,      // total offensive attacks vs the enemy
        };
    }

    function buildReport(ctx, war, attacks) {
        const rows = new Map();        // memberId -> row
        // Seed every current member so 0-hit members still appear.
        for (const id of Object.keys(ctx.members)) {
            rows.set(String(id), blankRow(id, ctx.members[id].name || `ID ${id}`));
        }
        const ensure = (id, name) => {
            const k = String(id);
            if (!rows.has(k)) rows.set(k, blankRow(k, name || `ID ${id}`));
            return rows.get(k);
        };

        const oppId = war.oppId;
        let totalHits = 0, totalRespect = 0, totalLosses = 0, totalEnemyOn = 0, totalStealthOn = 0;

        for (const a of attacks) {
            const result = a.result;
            const attackerIn = a.attacker_faction === ctx.factionId;
            const defenderIsEnemy = a.defender_faction === oppId;
            const attackerIsEnemy = a.attacker_faction === oppId;
            const defenderIn = a.defender_faction === ctx.factionId;
            const isStealthed = Number(a.stealthed) === 1;
            const warHit = hasWarBonus(a);

            // Offensive: our member hit the enemy faction.
            if (attackerIn && defenderIsEnemy && a.attacker_id) {
                const row = ensure(a.attacker_id, a.attacker_name);
                row.totalOff++;
                if (WIN_RESULTS.has(result)) { row.wins++; totalHits++; }
                else if (LOSS_RESULTS.has(result)) row.offLost++;
                else if (STALE_RESULTS.has(result)) row.stalemates++;
                else if (ASSIST_RESULTS.has(result)) row.assists++;
                row.respect += Number(a.respect_gain || 0);
                totalRespect += Number(a.respect_gain || 0);
            }

            // Defensive: one of our members got attacked during the war.
            // An incoming attack is an enemy war hit if it carries the war bonus
            // (definitive, even when stealthed) OR the attacker's faction is the
            // opponent. Remaining stealthed hits with no war bonus are tracked
            // separately as "likely enemy".
            if (defenderIn && a.defender_id && a.attacker_faction !== ctx.factionId) {
                const row = ensure(a.defender_id, a.defender_name);
                const enemyHit = attackerIsEnemy || warHit;
                if (enemyHit) { row.enemyOn++; totalEnemyOn++; }
                else if (isStealthed) { row.stealthOn++; totalStealthOn++; }
                if (WIN_RESULTS.has(result)) {           // attacker won = our member was beaten
                    row.lossAll++;
                    totalLosses++;
                    if (enemyHit) row.lossEnemy++;
                } else if (LOSS_RESULTS.has(result) || STALE_RESULTS.has(result) || ESCAPE_RESULTS.has(result)) {
                    row.defHeld++;
                }
            }
        }

        const list = Array.from(rows.values());
        list.sort((a, b) => b.wins - a.wins || b.lossAll - a.lossAll);
        return { list, totalHits, totalRespect, totalLosses, totalEnemyOn, totalStealthOn };
    }

    /* ----------------------- loss scope ----------------------- */
    // Which loss number drives the table: all attackers, or enemy only.
    function lossScope() {
        const el = $('#twpr-lossscope');
        return el && el.value === 'enemy' ? 'enemy' : 'all';
    }
    function scopedLoss(row) {
        return lossScope() === 'enemy' ? row.lossEnemy : row.lossAll;
    }

    function lossSummary(report) {
        return lossScope() === 'enemy'
            ? { suffix: ' (enemy only)', total: report.list.reduce((sum, row) => sum + row.lossEnemy, 0) }
            : { suffix: '', total: report.totalLosses };
    }

    /* ========================= UI ============================= */
    const CSS = `
    #twpr-fab{position:fixed;z-index:2147483646;width:54px;height:54px;border-radius:50%;
      background:linear-gradient(135deg,#7b2ff7,#2f80ed);color:#fff;border:none;font-size:22px;cursor:grab;
      box-shadow:0 6px 18px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;
      touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;
      padding:0;line-height:1;}
    #twpr-fab:active{cursor:grabbing;}
    #twpr-overlay{position:fixed;inset:0;z-index:2147483647;background:rgba(8,10,20,.55);backdrop-filter:blur(3px);
      display:none;align-items:flex-start;justify-content:center;padding:24px 10px;overflow:auto;}
    #twpr-overlay.open{display:flex;}
    #twpr-panel{width:min(960px,100%);background:rgba(20,22,34,.92);border:1px solid rgba(255,255,255,.12);
      border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.5);color:#e9ecf5;font-family:system-ui,Segoe UI,Roboto,sans-serif;
      backdrop-filter:blur(14px);overflow:hidden;
      --twpr-name:#f2f4fb;--twpr-id:#7f86a0;--twpr-text:#e9ecf5;--twpr-win:#7fe3a0;
      --twpr-loss:#ff9a9a;--twpr-stale:#ffd479;--twpr-respect:#cfd3e6;--twpr-pay:#9fc7ff;}
    #twpr-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;
      background:linear-gradient(135deg,rgba(123,47,247,.35),rgba(47,128,237,.25));border-bottom:1px solid rgba(255,255,255,.1);}
    #twpr-head h2{margin:0;font-size:16px;font-weight:600;letter-spacing:.3px;}
    #twpr-close{background:none;border:none;color:#cfd3e6;font-size:22px;cursor:pointer;line-height:1;}
    .twpr-body{padding:16px 18px;}
    .twpr-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px;}
    .twpr-row label{font-size:12px;color:#aab0c6;display:block;margin-bottom:3px;}
    .twpr-field{display:flex;flex-direction:column;}
    .twpr-input,.twpr-select{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);
      color:#fff;border-radius:8px;padding:8px 10px;font-size:13px;outline:none;}
    .twpr-input:focus,.twpr-select:focus{border-color:#7b2ff7;}
    /* The dropdown POPUP is drawn by the browser, not by this panel, and it
       defaults to a WHITE background — so the color:#fff above made every option
       white text on white paper: the wars were all there and all invisible.
       An <option> does not inherit the select's background, so it has to be
       told explicitly, and "optgroup" needs the same treatment or its label
       vanishes the same way. Colours are literal rather than translucent
       because the popup is not composited over the panel. */
    .twpr-select option,.twpr-select optgroup{background:#1b1f2e;color:#e9ecf5;}
    .twpr-select option:disabled{color:#6a7080;}
    /* A multi-select renders inline, so its own selected-row highlight applies
       and must not fall back to the same washed-out default. */
    .twpr-select[multiple]{background:#151926;padding:4px;}
    .twpr-select[multiple] option{padding:3px 6px;border-radius:4px;}
    .twpr-select[multiple] option:checked{background:#7b2ff7;color:#fff;font-weight:600;}
    .twpr-btn{background:linear-gradient(135deg,#7b2ff7,#2f80ed);color:#fff;border:none;border-radius:9px;
      padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;}
    .twpr-btn.ghost{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);}
    .twpr-note{font-size:11px;color:#8b90a6;margin-top:4px;}
    .twpr-status{font-size:12px;color:#9fe8c0;margin:8px 0;min-height:16px;}
    .twpr-status.err{color:#ff8b8b;}
    .twpr-status{line-height:1.45;overflow-wrap:anywhere;}
    #twpr-panel :is(#twpr-close,#twpr-load,#twpr-run,#twpr-cache-clear):focus-visible,
    #twpr-panel .twpr-fresh-control:has(input:focus-visible){outline:2px solid #9fc7ff;outline-offset:2px;}
    @media(max-width:600px){
      #twpr-overlay{padding:10px 8px;}
      #twpr-head{padding:6px 12px;}
      #twpr-close{min-width:44px;min-height:44px;}
      .twpr-body{padding:12px;}
      #twpr-panel :is(#twpr-api-row,#twpr-war-row){gap:8px;}
      #twpr-panel :is(#twpr-api-row,#twpr-war-row)>.twpr-field{flex:1 1 100% !important;min-width:0 !important;}
      #twpr-panel .twpr-control-spacer{display:none;}
      #twpr-panel :is(#twpr-key,#twpr-war,#twpr-load,#twpr-run,#twpr-cache-clear){
        width:100%;min-width:0;min-height:44px;box-sizing:border-box;}
      #twpr-panel :is(#twpr-key,#twpr-war){font-size:16px;}
      #twpr-panel .twpr-war-options{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;}
      #twpr-panel .twpr-fresh-control{box-sizing:border-box;display:flex;align-items:center;gap:6px;margin:0;
        min-height:44px;padding:0 8px;border:1px solid rgba(255,255,255,.18);border-radius:8px;}
    }
    .twpr-tablewrap{max-height:48vh;overflow:auto;border:1px solid rgba(255,255,255,.1);border-radius:10px;margin-top:10px;}
    table.twpr{width:100%;border-collapse:collapse;font-size:12.5px;}
    table.twpr th,table.twpr td{padding:7px 9px;text-align:right;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,.06);}
    table.twpr th:first-child,table.twpr td:first-child{text-align:left;position:sticky;left:0;background:rgba(20,22,34,.96);}
    table.twpr thead th{position:sticky;top:0;background:rgba(30,33,50,.98);cursor:pointer;color:#c7cbe0;}
    table.twpr tbody tr:hover{background:rgba(255,255,255,.04);}
    #twpr-panel .twpr td{color:var(--twpr-text) !important;}
    #twpr-panel .twpr-name{color:var(--twpr-name) !important;font-weight:500;}
    #twpr-panel .twpr-id{color:var(--twpr-id) !important;}
    #twpr-panel .twpr-win{color:var(--twpr-win) !important;}
    #twpr-panel .twpr-loss{color:var(--twpr-loss) !important;}
    #twpr-panel .twpr-stale{color:var(--twpr-stale) !important;}
    #twpr-panel .twpr-respect{color:var(--twpr-respect) !important;}
    #twpr-panel .twpr-pay{color:var(--twpr-pay) !important;font-weight:600;}
    .twpr-colortoggle{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.18);color:#cfd3e6;
      border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;}
    .twpr-colors{display:none;flex-wrap:wrap;gap:12px;margin:8px 0;padding:12px;border:1px solid rgba(255,255,255,.1);
      border-radius:10px;background:rgba(255,255,255,.03);align-items:flex-end;}
    .twpr-colors.open{display:flex;}
    .twpr-cpick{display:flex;flex-direction:column;gap:4px;}
    .twpr-cpick label{font-size:11px;color:#aab0c6;}
    .twpr-cpick input[type=color]{width:46px;height:30px;border:1px solid rgba(255,255,255,.2);border-radius:6px;
      background:none;cursor:pointer;padding:2px;}
    .twpr-guide{display:none;margin:0 0 10px;padding:12px 14px;border:1px solid rgba(255,255,255,.12);border-radius:10px;
      background:rgba(255,255,255,.04);font-size:12.5px;line-height:1.5;color:#c7cbe0;}
    .twpr-guide.open{display:block;}
    .twpr-guide p{margin:0 0 8px;} .twpr-guide p:last-child{margin-bottom:0;}
    .twpr-guide b{color:#e9ecf5;}
    .twpr-guide .twpr-gh{margin:10px 0 4px;font-weight:600;color:#c7cbe0;}
    .twpr-guide .twpr-key{margin:0 0 4px;padding-left:18px;}
    .twpr-guide .twpr-key li{margin:2px 0;}
    .twpr-raffle{display:none;margin:0 0 10px;padding:12px 14px;border:1px solid rgba(255,255,255,.12);border-radius:10px;
      background:rgba(255,255,255,.04);}
    .twpr-raffle.open{display:block;}
    .twpr-raffle-sum{font-size:12.5px;color:#c7cbe0;}
    .twpr-raffle-winner{min-height:34px;margin:6px 0;text-align:center;}
    .twpr-spin{font-size:20px;font-weight:700;color:#ffd479;opacity:.85;}
    .twpr-winner{font-size:15px;margin:4px 0;color:#7fe3a0;}
    .twpr-winner b{color:#fff;}
    .twpr-winner .sub{font-size:11.5px;color:#8b90a6;font-weight:400;}
    .twpr-raffle-odds{margin-top:6px;font-size:12px;color:#aab0c6;}
    .twpr-raffle-odds summary{cursor:pointer;color:#9fc7ff;}
    .twpr-raffle-odds table{width:100%;border-collapse:collapse;margin-top:6px;}
    .twpr-raffle-odds td{padding:3px 6px;border-bottom:1px solid rgba(255,255,255,.06);}
    .twpr-raffle-odds td:last-child{text-align:right;color:#c7cbe0;}
    .twpr-foot{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;margin-top:12px;}
    .twpr-summary{font-size:12px;color:#aab0c6;}
    .twpr-drugs{display:none;margin:0 0 10px;padding:12px 14px;border:1px solid rgba(255,255,255,.12);border-radius:10px;
      background:rgba(255,255,255,.04);}
    .twpr-drugs.open{display:block;}
    .twpr-drugs .twpr-tablewrap{max-height:40vh;}
    /* ── Tabs ──────────────────────────────────────────────────────────
       Every pane already had ".open" as its show/hide switch, so the tab bar
       drives that same class rather than introducing a second mechanism the
       two could disagree about. */
    .twpr-tabs{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 12px;
      border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:0;}
    .twpr-tab{background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-1px;
      color:#8b90a6;font-size:13px;font-weight:600;padding:9px 14px;cursor:pointer;
      border-radius:8px 8px 0 0;white-space:nowrap;transition:color .12s,background .12s;}
    .twpr-tab:hover{color:#c7cbe0;background:rgba(255,255,255,.05);}
    .twpr-tab.active{color:#fff;border-bottom-color:#7b2ff7;background:rgba(123,47,247,.14);}
    /* A dot, not a number: it says "there is something in here" without
       implying the count means anything. */
    .twpr-tabdot{display:none;width:7px;height:7px;border-radius:50%;background:#7fe3a0;
      vertical-align:middle;margin-left:5px;}
    .twpr-tabdot.on{display:inline-block;}
    .twpr-tabdot.warn{background:#ff8080;}
    .twpr-pane{display:none;}
    .twpr-pane.open{display:block;}
    .twpr-pane-report{margin-top:2px;}
    /* One honest empty state per pane, rather than hiding the whole panel and
       leaving the user to guess which button unlocks it. */
    .twpr-blank{padding:26px 18px;text-align:center;font-size:13px;color:#aab0c6;line-height:1.7;
      border:1px dashed rgba(255,255,255,.14);border-radius:10px;background:rgba(255,255,255,.02);}
    .twpr-blank span{font-size:12px;color:#8b90a6;}
    /* ── Numbered sections ──────────────────────────────────────────────
       The sweep controls used to be one long wrapping row, so "which wars",
       "how far back" and the export buttons all had equal weight and no
       order. Three steps, in the order you actually answer them. */
    .twpr-sec{border:1px solid rgba(255,255,255,.1);border-radius:10px;margin:0 0 10px;
      background:rgba(255,255,255,.022);overflow:hidden;}
    .twpr-sec-h{display:flex;align-items:center;gap:9px;padding:9px 13px;
      background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.08);
      font-size:12px;font-weight:700;color:#e9ecf5;letter-spacing:.02em;}
    .twpr-sec-h .n{display:inline-flex;align-items:center;justify-content:center;
      width:19px;height:19px;border-radius:50%;background:#7b2ff7;color:#fff;
      font-size:11px;font-weight:700;flex:0 0 19px;}
    .twpr-sec-h .sub{margin-left:auto;font-weight:400;font-size:11.5px;color:#8b90a6;}
    .twpr-sec-b{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;padding:12px 13px;}
    .twpr-btnrow{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
    .twpr-hint{font-size:11px;color:#8b90a6;margin-top:7px;line-height:1.45;}
    /* ── Colour pickers ─────────────────────────────────────────────────
       Seven swatches stacked vertically left an enormous empty panel and made
       you scroll to reach Reset. A grid, with each swatch beside a live sample
       of the thing it actually colours. */
    .twpr-cgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(196px,1fr));gap:9px;}
    .twpr-cpick{display:flex;align-items:center;gap:10px;padding:8px 11px;
      border:1px solid rgba(255,255,255,.1);border-radius:9px;background:rgba(255,255,255,.03);}
    .twpr-cpick input[type=color]{width:34px;height:26px;padding:0;border:1px solid rgba(255,255,255,.2);
      border-radius:6px;background:none;cursor:pointer;flex:0 0 34px;}
    .twpr-cpick .cl{display:flex;flex-direction:column;min-width:0;gap:1px;}
    .twpr-cpick .cl b{font-size:12px;color:#e9ecf5;font-weight:600;}
    .twpr-cpick .cl .ex{font-size:11px;font-variant-numeric:tabular-nums;}
    .twpr-oddstable{width:100%;border-collapse:collapse;font-size:12px;}
    .twpr-oddstable td{padding:4px 8px;border-bottom:1px solid rgba(255,255,255,.05);}
    .twpr-oddsbar{display:block;height:7px;border-radius:4px;background:rgba(255,255,255,.07);overflow:hidden;}
    .twpr-oddsbar i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#7b2ff7,#2f80ed);}
    .twpr-sweep-head{margin:16px 0 6px;padding-top:12px;border-top:1px solid rgba(255,255,255,.12);
      font-size:13px;font-weight:700;color:#e9ecf5;letter-spacing:.02em;}
    .twpr-check{white-space:nowrap;font-size:12px;color:#aab0c6;align-self:center;}
    .twpr-check input{vertical-align:middle;margin-right:4px;}
    /* Per-war cells pack two numbers into one column. Two numbers side by side
       are meaningless unless the reader knows which is which — so each one is
       COLOUR-CODED and the same two colours label the header and the legend.
       Amber is always Xanax, green is always hits, everywhere. */
    /* ONE colour per quantity, everywhere in this pane: amber is Xanax, green
       is hits. The per-column hue is a background wash (below) so it can never
       be mistaken for a verdict — a green NUMBER reads as a pass no matter what
       the legend says, which is exactly how "3 / 0" in the green column came to
       look like good news. */
    .twpr-wcell{white-space:nowrap;font-variant-numeric:tabular-nums;}
    .twpr-wcell .x{color:#ffd479;font-weight:700;}
    .twpr-wcell .h{color:#7fe3a0;}
    .twpr-wcell .sep{color:#5c6178;}
    /* Column tints: enough to track a column across, far too faint to read as
       meaning. Semantic colours live in the text and always win.
       The long selector is deliberate — the zebra rule further down is
       (0,2,4), so a bare .twpr-wcell.col0 at (0,2,0) would lose on every even
       row and the tint would appear on alternate rows only.
       The sticky HEADER is deliberately left opaque: a translucent thead lets
       the table body scroll visibly through it. */
    table.twpr tbody td.twpr-wcell.col0{background:rgba(127,212,255,.055);}
    table.twpr tbody td.twpr-wcell.col1{background:rgba(255,212,121,.055);}
    table.twpr tbody td.twpr-wcell.col2{background:rgba(142,230,160,.055);}
    table.twpr tbody td.twpr-wcell.col3{background:rgba(255,158,207,.055);}
    table.twpr tbody td.twpr-wcell.col4{background:rgba(195,166,255,.055);}
    table.twpr tbody td.twpr-wcell.col5{background:rgba(255,179,122,.055);}
    table.twpr tbody td.twpr-wcell.col6{background:rgba(142,230,213,.055);}
    table.twpr tbody td.twpr-wcell.col7{background:rgba(232,224,122,.055);}
    table.twpr tbody td.twpr-wcell.col8{background:rgba(255,154,154,.055);}
    table.twpr tbody td.twpr-wcell.col9{background:rgba(168,200,255,.055);}
    /* A flag outranks its column, and hover outranks everything. */
    table.twpr tbody td.twpr-wcell.flag{background:rgba(255,120,120,.17);}
    table.twpr tbody tr:hover td.twpr-wcell{background:rgba(127,180,255,.12);}
    .twpr-wcell.flag{background:rgba(255,120,120,.16);}
    .twpr-wcell.flag .x{color:#ffb3b3;}
    .twpr-wcell.flag .h{color:#ff8080;font-weight:700;}
    /* A flag must never be signalled by COLOUR ALONE — roughly one man in
       twelve cannot separate that red from the greys around it. The mark is
       the signal; the tint is reinforcement. */
    .twpr-wcell.flag .mk{color:#ff8080;font-size:10px;margin-left:3px;}
    /* An excused war is blue, not red — the numbers look the same as a flag but
       the verdict is the opposite, and colour is what people read first. */
    .twpr-wcell.excused .od{color:#9fc7ff;font-size:9.5px;font-weight:700;margin-left:3px;}
    /* Stock moved into a pocket, shown but never charged. */
    .twpr-wcell .tk{color:#7f8aa3;font-size:10px;}
    table.twpr tbody td.twpr-wcell.excused{background:rgba(127,180,255,.13);}
    .twpr-wcell.none{color:#4e5468;}
    /* Zebra striping. Eleven columns is further than the eye tracks unaided —
       without a banded background you lose your row halfway across and read
       someone else's numbers. */
    table.twpr tbody tr:nth-child(even) td{background:rgba(255,255,255,.028);}
    table.twpr tbody tr:hover td{background:rgba(127,180,255,.10);}
    table.twpr tbody tr:nth-child(even) td:first-child{background:rgba(24,26,40,.97);}
    table.twpr tbody tr:hover td:first-child{background:rgba(30,40,60,.99);}
    /* The vertical rule where per-member totals end and per-war history begins. */
    .twpr-split{border-left:2px solid rgba(255,255,255,.16) !important;}
    /* Group header: one label over each block, so no column has to explain
       itself twice. */
    .twpr-grp th{padding:5px 9px 4px;font-size:10px;font-weight:700;letter-spacing:.09em;
      text-transform:uppercase;color:#8b90a6;background:rgba(30,33,50,.98);
      border-bottom:1px solid rgba(255,255,255,.08);cursor:default;}
    .twpr-grp th.g-tot{color:#9fb0d0;}
    .twpr-grp th.g-war{color:#c9a6ff;}
    .twpr-repeat{color:#ff7a7a;font-weight:700;}
    /* Two-line war header: who and when, then the unit line so nobody has to
       guess what the pair of numbers underneath means. */
    .twpr-wh{line-height:1.25;text-align:right;}
    .twpr-wh .n{display:block;font-weight:700;color:#e9ecf5;}
    .twpr-wh .d{display:block;font-size:10px;color:#8b90a6;font-weight:400;}
    .twpr-wh .u{display:block;font-size:9.5px;font-weight:400;letter-spacing:.02em;}
    .twpr-wh .u .x{color:#ffd479;}
    .twpr-wh .u .h{color:#7fe3a0;}
    .twpr-legend{display:flex;flex-wrap:wrap;gap:8px 16px;margin:8px 0;padding:8px 11px;
      border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(255,255,255,.03);
      font-size:11.5px;color:#aab0c6;line-height:1.5;}
    .twpr-legend b{color:#e9ecf5;}
    .twpr-legend .sw{display:inline-block;padding:1px 6px;border-radius:4px;font-weight:700;
      font-variant-numeric:tabular-nums;}
    .twpr-kpis{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;}
    .twpr-kpi{flex:1;min-width:104px;padding:9px 12px;border:1px solid rgba(255,255,255,.1);border-radius:9px;
      background:rgba(255,255,255,.04);}
    .twpr-kpi .k{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#8b90a6;}
    .twpr-kpi .v{font-size:20px;font-weight:700;color:#e9ecf5;line-height:1.2;margin-top:2px;}
    .twpr-kpi .s{font-size:11px;color:#8b90a6;}
    .twpr-flag{color:#ff9a9a !important;font-weight:600;}
    .twpr-ok{color:#7fe3a0 !important;}
    .twpr-warnbox{margin:8px 0;padding:9px 12px;border-radius:8px;font-size:12px;line-height:1.5;
      background:rgba(255,154,154,.09);border:1px solid rgba(255,154,154,.28);color:#ffc9c9;}
    `;

    function injectCSS() {
        if ($('#twpr-css')) return;
        const s = document.createElement('style');
        s.id = 'twpr-css';
        s.textContent = CSS;
        document.head.appendChild(s);
    }

    let state = { ctx: null, wars: [], report: null, war: null, drugs: null, odResults: null, sweep: null, sweepOd: null, sweepRunning: false };

    /* --------------------- color settings --------------------- */
    const COLORS = [
        { key: 'name',    label: 'Member name', cssVar: '--twpr-name',    def: '#f2f4fb', sample: 'Blight' },
        { key: 'id',      label: 'Torn ID',     cssVar: '--twpr-id',      def: '#7f86a0', sample: '[797339]' },
        { key: 'win',     label: 'Hits',        cssVar: '--twpr-win',     def: '#7fe3a0', sample: '76' },
        { key: 'loss',    label: 'Losses',      cssVar: '--twpr-loss',    def: '#ff9a9a', sample: '12' },
        { key: 'stale',   label: 'Stalemates',  cssVar: '--twpr-stale',   def: '#ffd479', sample: '3' },
        { key: 'respect', label: 'Respect',     cssVar: '--twpr-respect', def: '#cfd3e6', sample: '665.31' },
        { key: 'text',    label: 'Other numbers', cssVar: '--twpr-text',  def: '#e9ecf5', sample: '1,571' },
    ];

    function buildColorUI() {
        const wrap = $('#twpr-colors');
        if (!wrap) return;
        // Each swatch sits beside a live sample of the thing it colours, so you
        // pick against the real rendering rather than against a word.
        wrap.innerHTML =
            `<div class="twpr-note" style="margin:0 0 10px;">Colours apply to every table in this panel and are saved to this browser.</div>` +
            `<div class="twpr-cgrid">` +
            COLORS.map(c =>
                `<div class="twpr-cpick">` +
                `<input type="color" data-key="${c.key}" value="${c.def}">` +
                `<span class="cl"><b>${c.label}</b>` +
                `<span class="ex" style="color:var(${c.cssVar})">${c.sample}</span></span></div>`
            ).join('') +
            `</div>` +
            `<div style="margin-top:12px;"><button class="twpr-colortoggle" id="twpr-colorreset" type="button">↺ Reset all colours</button></div>`;
    }

    function loadColors() {
        const panel = $('#twpr-panel');
        gmGet(LS_COLORS, '').then(raw => {
            let saved = {};
            try { saved = raw ? JSON.parse(raw) : {}; } catch (e) {}
            COLORS.forEach(c => {
                const val = saved[c.key] || c.def;
                panel.style.setProperty(c.cssVar, val);
                const inp = $(`#twpr-colors input[data-key="${c.key}"]`);
                if (inp) inp.value = val;
            });
        });
    }

    function saveColors() {
        const out = {};
        COLORS.forEach(c => {
            const inp = $(`#twpr-colors input[data-key="${c.key}"]`);
            if (inp) out[c.key] = inp.value;
        });
        gmSet(LS_COLORS, JSON.stringify(out));
    }

    function resetColors() {
        const panel = $('#twpr-panel');
        COLORS.forEach(c => {
            panel.style.setProperty(c.cssVar, c.def);
            const inp = $(`#twpr-colors input[data-key="${c.key}"]`);
            if (inp) inp.value = c.def;
        });
        gmSet(LS_COLORS, JSON.stringify({}));
    }

    /** The war table exists now; stop telling the user to go and make one. */
    function showReport() {
        const blank = $('#twpr-report-blank');
        if (blank) blank.style.display = 'none';
        const res = $('#twpr-result');
        if (res) res.style.display = 'block';
        const t = $('#twpr-tabs');
        if (t) t.style.display = 'flex';
    }

    function setStatus(msg, isErr) {
        const el = $('#twpr-status');
        if (!el) return;
        el.textContent = msg || '';
        el.classList.toggle('err', !!isErr);
    }

    function buildPanel() {
        injectCSS();
        if ($('#twpr-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'twpr-overlay';
        overlay.innerHTML = `
          <div id="twpr-panel">
            <div id="twpr-head">
              <h2>⚔️ War Payout Report</h2>
              <button id="twpr-close" type="button" title="Close" aria-label="Close">×</button>
            </div>
            <div class="twpr-body">
              <div class="twpr-row" id="twpr-api-row">
                <div class="twpr-field" style="flex:1;min-width:220px;">
                  <label for="twpr-key">Torn API key (faction access)</label>
                  <input class="twpr-input" id="twpr-key" type="password" placeholder="paste key…" autocomplete="off">
                  <div class="twpr-note">Leader/AA key. <a href="https://www.torn.com/preferences.php#tab=api" target="_blank" style="color:#9fc7ff;">Create one →</a> (stored locally only)</div>
                </div>
                <div class="twpr-field">
                  <span class="twpr-control-spacer" aria-hidden="true">&nbsp;</span>
                  <button class="twpr-btn ghost" id="twpr-load" type="button">Load wars</button>
                </div>
              </div>

              <div class="twpr-row" id="twpr-war-row" style="display:none;align-items:flex-end;">
                <div class="twpr-field" style="flex:1;min-width:200px;">
                  <label for="twpr-war">War</label>
                  <select class="twpr-select" id="twpr-war"></select>
                </div>
                <div class="twpr-field">
                  <span class="twpr-control-spacer" aria-hidden="true">&nbsp;</span>
                  <button class="twpr-btn" id="twpr-run" type="button">Pull report</button>
                </div>
                <div class="twpr-field twpr-war-options" style="min-width:auto;">
                  <label class="twpr-fresh-control" style="white-space:nowrap;"><input type="checkbox" id="twpr-fresh" style="vertical-align:middle;"> Fresh pull</label>
                  <button class="twpr-colortoggle" id="twpr-cache-clear" type="button" style="padding:4px 8px;font-size:11px;">Clear cache</button>
                </div>
              </div>

              <div class="twpr-status" id="twpr-status" role="status" aria-live="polite" aria-atomic="true"></div>

              <!-- The tab bar deliberately sits OUTSIDE the result wrapper.
                   It used to live inside it, so Colors, Guide and the sweep —
                   none of which need a war report — were all unreachable until
                   you had pulled one. -->
              <div class="twpr-tabs" id="twpr-tabs" style="display:none;">

                <!-- Six panels stacked behind four toggle buttons meant the
                     multi-war sweep sat below a full drug report below a war
                     table — its Copy button was real but three screens down,
                     which is the same as not existing. One pane at a time. -->
                  <button class="twpr-tab active" data-pane="twpr-pane-report" type="button">⚔️ War report</button>
                  <button class="twpr-tab" data-pane="twpr-drugs" type="button">💊 Drugs <span class="twpr-tabdot" id="twpr-tabdot-drugs"></span></button>
                  <button class="twpr-tab" data-pane="twpr-sweep" type="button">📊 Multi-war <span class="twpr-tabdot" id="twpr-tabdot-sweep"></span></button>
                  <button class="twpr-tab" data-pane="twpr-raffle" type="button">🎟️ Raffle</button>
                  <button class="twpr-tab" data-pane="twpr-guide" type="button">ℹ️ Guide</button>
                  <button class="twpr-tab" data-pane="twpr-colors" type="button">🎨 Colors</button>
              </div>

              <div id="twpr-panes">
                <div class="twpr-pane twpr-guide" id="twpr-guide">
                  <p><b>How to use:</b> pick the war, hit <b>Pull report</b>, then read the breakdown or <b>Copy table</b> to export it. The dropdown sets whether "Losses" counts all attackers or only the enemy.</p>
                  <p class="twpr-gh">⚔️ Offensive — what your member did to the enemy</p>
                  <ul class="twpr-key">
                    <li><b>Hits</b> — successful war hits landed on the enemy (your score).</li>
                    <li><b>Stale</b> — your attacks on the enemy that ended in a stalemate.</li>
                    <li><b>Assist</b> — assists on enemy targets.</li>
                    <li><b>Respect</b> — respect earned from your war hits.</li>
                  </ul>
                  <p class="twpr-gh">🛡️ Defensive — what was done to your member</p>
                  <ul class="twpr-key">
                    <li><b>Enemy Hits</b> — total times the enemy attacked this member (win or not). Includes stealthed hits, caught via the war bonus.</li>
                    <li><b>Losses</b> — times this member was beaten (per the dropdown: all attackers or enemy only).</li>
                    <li><b>vs Enemy</b> — of those losses, how many the enemy dealt.</li>
                    <li><b>Defended</b> — incoming attacks this member survived: the attacker lost, stalemated, or ran out of time. (Low here because the enemy beat your members most times they attacked.)</li>
                  </ul>
                  <p class="twpr-gh">In the CSV/TSV export you also get:</p>
                  <ul class="twpr-key">
                    <li><b>LossesAll / LossesEnemy</b> — beaten by anyone / beaten by the enemy.</li>
                    <li><b>EnemyConfirmed / Stealthed</b> — enemy hits with a visible faction or war bonus / hidden-attacker hits counted as enemy.</li>
                    <li><b>OffLost</b> — your attacks on the enemy that you lost.</li>
                  </ul>
                  <p class="twpr-gh">💊 Drug Report — Xanax vs hits</p>
                  <ul class="twpr-key">
                    <li><b>Pre-war / In war</b> — Xanax stacked during the build-up vs taken once the fighting started. Set <b>Build-up (days before)</b> to match how long your faction preps; 4 days is the usual.</li>
                    <li><b>Xanax</b> — the total of both, from the <b>faction armoury</b>.</li>
                    <li><b>Hits/Xan</b> — hits landed per Xanax taken. The efficiency number.</li>
                    <li><b>⚠ no hits</b> — took faction Xanax and landed nothing. Check hospital time and travel before you accuse anyone.</li>
                    <li>Personal Xanax is <b>invisible</b> — Torn exposes no endpoint for it, so 0 means "took none of yours", not "took none".</li>
                    <li>Torn prunes faction news, so an old war may return thin or empty. The pane tells you the window it actually covered.</li>
                  </ul>
                  <p class="twpr-gh">📊 Multi-war sweep</p>
                  <ul class="twpr-key">
                    <li><b>Flagged</b> — how many of the swept wars this member took Xanax in and landed nothing. <b>2 or more is the finding</b>; one is usually a hospital stay.</li>
                    <li>Each war column reads <b>Xanax out / hits landed</b>. Red is that war's flag.</li>
                    <li>Hits come from Torn's <b>official war report</b> — exact, one call per war, no attack pull. A <b>LIVE</b> war has no report yet, so its cells read <b>/ ?</b> and it can never flag anyone.</li>
                    <li>A war showing no armoury activity at all is <b>pruned news</b>, not a clean faction — the pane says which wars those were.</li>
                  </ul>
                  <p><b>Enemy total:</b> the summary's "Enemy hits on us" uses the official war report when available (the fully accurate faction total); otherwise it's the attack-log estimate. Re-pull after the war ends for the exact number.</p>
                </div>
                </div>
                <div class="twpr-pane twpr-colors" id="twpr-colors"></div>

                <div class="twpr-pane twpr-raffle" id="twpr-raffle">
                  <div class="twpr-sec">
                    <div class="twpr-sec-h"><span class="n">1</span> What earns a ticket</div>
                    <div class="twpr-sec-b" id="twpr-raffle-weights"></div>
                    <div class="twpr-note" style="margin:0;padding:0 13px 12px;">
                      Set how many tickets each thing is worth. Zero switches a source off entirely.
                      Fractions are fine — <b>0.1</b> per respect turns 665 respect into 66 tickets.
                      Presets: <button class="twpr-colortoggle" id="twpr-rf-p-loss" type="button">Consolation</button>
                      <button class="twpr-colortoggle" id="twpr-rf-p-hits" type="button">Reward fighters</button>
                      <button class="twpr-colortoggle" id="twpr-rf-p-bal" type="button">Balanced</button>
                      <button class="twpr-colortoggle" id="twpr-rf-p-part" type="button">Everyone who showed up</button>
                    </div>
                  </div>

                  <div class="twpr-sec">
                    <div class="twpr-sec-h"><span class="n">2</span> Draw <span class="sub" id="twpr-raffle-sum"></span></div>
                    <div class="twpr-sec-b">
                      <div class="twpr-field"><label>Winners to draw</label>
                        <input class="twpr-input" id="twpr-raffle-n" type="number" min="1" value="1" style="width:86px;"></div>
                      <div class="twpr-field"><label title="Nobody can hold more than this many tickets, however big their numbers. Stops one member owning the draw. 0 = no cap.">Ticket cap per member</label>
                        <input class="twpr-input" id="twpr-raffle-cap" type="number" min="0" step="1" value="0" style="width:86px;"></div>
                      <div class="twpr-field"><label title="Members below this many tickets are excluded from the draw entirely.">Minimum tickets</label>
                        <input class="twpr-input" id="twpr-raffle-min" type="number" min="0" step="1" value="1" style="width:86px;"></div>
                      <div class="twpr-field"><label>&nbsp;</label>
                        <div class="twpr-btnrow">
                          <button class="twpr-btn" id="twpr-raffle-draw" type="button">🎲 Draw</button>
                          <button class="twpr-colortoggle" id="twpr-raffle-wheel" type="button">Copy for wheelofnames</button>
                          <button class="twpr-colortoggle" id="twpr-raffle-csv" type="button">⬇ Odds CSV</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="twpr-raffle-winner" id="twpr-raffle-winner"></div>
                  <details class="twpr-raffle-odds" open><summary>Odds — tickets per member</summary><div id="twpr-raffle-oddsbody"></div></details>
                  <div class="twpr-note">The draw uses your browser's cryptographic RNG, weighted by tickets — genuinely random, not a shuffle. Drawing several winners removes each one before the next draw, so nobody wins twice.</div>
                </div>

                <div class="twpr-pane twpr-drugs" id="twpr-drugs">
                  <div class="twpr-blank" id="twpr-drug-blank">
                    Pull a war report first — the drug report ties Xanax to the hits that war produced.
                  </div>
                  <div id="twpr-drug-body">
                    <div class="twpr-note" style="font-size:12.5px;">
                      Pulls the faction <b>armoury log</b> for this war's window and ties every Xanax taken
                      to the hits that member actually landed. Press <b>Pull drug data</b> to fetch it.
                    </div>
                  </div>
                  <div class="twpr-row" style="gap:10px;align-items:flex-end;margin:10px 0 0;">
                    <div class="twpr-field">
                      <label title="Xanax stacked BEFORE the fighting starts still counts — this is how far back to look.">Build-up (days before)</label>
                      <input class="twpr-input" id="twpr-drug-lead" type="number" min="0" max="14" step="1" value="4" style="width:76px;">
                    </div>
                    <div class="twpr-field">
                      <label title="Catches the last hits' Xanax if the log timestamp lands just after the war ends.">Tail (hours after)</label>
                      <input class="twpr-input" id="twpr-drug-tail" type="number" min="0" max="72" step="1" value="6" style="width:76px;">
                    </div>
                    <button class="twpr-btn" id="twpr-drug-run" type="button">💊 Pull drug data</button>
                    <div class="twpr-field">
                      <label>Show</label>
                      <select class="twpr-select" id="twpr-drug-filter">
                        <option value="all">Everyone</option>
                        <option value="took">Took Xanax</option>
                        <option value="freeload">Took Xanax · zero hits</option>
                        <option value="nodrug">Hits · no faction Xanax</option>
                      </select>
                    </div>
                    <button class="twpr-colortoggle" id="twpr-drug-od" type="button" disabled title="For members who took drugs but landed no hits, read Torn's public overdose stat. An OD hospitalises you for hours and ends your war — it's the most common innocent explanation.">🩺 Check for ODs</button>
                    <div class="twpr-field">
                      <label>Export</label>
                      <select class="twpr-select" id="twpr-drug-fmt">
                        <option value="shown">Exactly as shown (CSV)</option>
                        <option value="full">Full data (raw columns)</option>
                        <option value="discord">Discord (code block)</option>
                      </select>
                    </div>
                    <button class="twpr-colortoggle" id="twpr-drug-copy" type="button" disabled>Copy</button>
                    <button class="twpr-colortoggle" id="twpr-drug-csv" type="button" disabled>⬇ Download</button>
                    <button class="twpr-colortoggle" id="twpr-drug-html" type="button" disabled>⬇ HTML report</button>
                  </div>

                </div>

                <div class="twpr-pane twpr-drugs" id="twpr-sweep">
                  <div class="twpr-blank" id="twpr-sweep-blank">
                    Press <b>Load wars</b> above to list your wars, then sweep them.
                  </div>
                  <div id="twpr-sweep-main" style="display:none;">

                  <!-- Three numbered steps, because the old single wrapping row
                       put "which wars", "how far back", "use cache" and the two
                       export buttons on one line in no particular order. -->
                  <div class="twpr-sec">
                    <div class="twpr-sec-h"><span class="n">1</span> Which wars</div>
                    <div class="twpr-sec-b">
                      <div class="twpr-field" style="flex:1;min-width:270px;">
                        <label title="Ctrl/Cmd-click or drag to pick several. Newest first.">Pick one or more — this is the only thing that changes how long a sweep takes</label>
                        <select class="twpr-select" id="twpr-sweep-wars" multiple size="7"></select>
                      </div>
                      <div class="twpr-field" style="gap:6px;">
                        <label>Quick pick</label>
                        <div class="twpr-btnrow">
                          <button class="twpr-colortoggle" id="twpr-sweep-last3" type="button">Last 3</button>
                          <button class="twpr-colortoggle" id="twpr-sweep-last5" type="button">Last 5</button>
                          <button class="twpr-colortoggle" id="twpr-sweep-all" type="button">All</button>
                        </div>
                        <label class="twpr-check" style="margin-top:8px;" title="A live war has no published hit report, so nobody can be judged in it. Its Xanax still shows, but every hits cell reads '?'.">
                          <input type="checkbox" id="twpr-sweep-skiplive"> Skip live wars
                        </label>
                        <div class="twpr-hint" id="twpr-sweep-cost">—</div>
                      </div>
                    </div>
                  </div>

                  <div class="twpr-sec">
                    <div class="twpr-sec-h"><span class="n">2</span> How to read them</div>
                    <div class="twpr-sec-b">
                      <div class="twpr-field">
                        <label title="Xanax stacked BEFORE the fighting starts still counts — this is how far back to look.">Build-up (days before)</label>
                        <input class="twpr-input" id="twpr-sweep-lead" type="number" min="0" max="14" step="1" value="4" style="width:86px;">
                      </div>
                      <div class="twpr-field">
                        <label title="Catches the last hits' Xanax if the log timestamp lands just after the war ends.">Tail (hours after)</label>
                        <input class="twpr-input" id="twpr-sweep-tail" type="number" min="0" max="72" step="1" value="6" style="width:86px;">
                      </div>
                      <div class="twpr-field" style="gap:7px;">
                        <label>Also</label>
                        <label class="twpr-check" title="Reuse the 30-day cache where a war has already been analysed. Untick to re-pull everything live.">
                          <input type="checkbox" id="twpr-sweep-cache" checked> Use cached wars (free)
                        </label>
                        <label class="twpr-check" title="After sweeping, read Torn's overdose stat for everyone who took Xanax and landed nothing. An OD hospitalises you for hours and is the most common innocent explanation. Readings are cached permanently, so this is cheap after the first run.">
                          <input type="checkbox" id="twpr-sweep-autood"> Check overdoses automatically
                        </label>
                      </div>
                      <button class="twpr-btn" id="twpr-sweep-run" type="button" style="align-self:flex-end;">📊 Sweep wars</button>
                    </div>
                  </div>

                  <div class="twpr-sec" id="twpr-sweep-filters" style="display:none;">
                    <div class="twpr-sec-h"><span class="n">3</span> Who to show <span class="sub" id="twpr-sweep-count"></span></div>
                    <div class="twpr-sec-b">
                      <div class="twpr-field">
                        <label>Show</label>
                        <select class="twpr-select" id="twpr-sweep-show" style="min-width:240px;">
                          <option value="all">Everyone</option>
                          <option value="took">Took faction Xanax</option>
                          <option value="zero">Confirmed zero hits in all recorded wars</option>
                          <option value="under">Hits below a threshold…</option>
                          <option value="waste">Wasted more than…</option>
                          <option value="flagged">Took Xanax, landed nothing (any war)</option>
                          <option value="repeat">Repeat offenders (2+ wars)</option>
                          <option value="od">Overdosed during a war</option>
                        </select>
                      </div>
                      <div class="twpr-field">
                        <label title="Used by “Hits below” and “Wasted more than”.">Threshold</label>
                        <input class="twpr-input" id="twpr-sweep-thresh" type="number" min="0" step="1" value="10" style="width:86px;">
                      </div>
                      <div class="twpr-field">
                        <label title="Compare against their run across ALL swept wars, or against their per-war average — a member in 5 wars and one in 1 are not comparable on totals.">Measured as</label>
                        <select class="twpr-select" id="twpr-sweep-basis">
                          <option value="total">Total across swept wars</option>
                          <option value="avg">Average per war they were in</option>
                        </select>
                      </div>
                      <div class="twpr-field" style="gap:7px;">
                        <label>Narrow further</label>
                        <label class="twpr-check" title="Someone who never touched the armoury is a different conversation — they cost the faction nothing.">
                          <input type="checkbox" id="twpr-sweep-onlytook"> Only members who took Xanax
                        </label>
                        <label class="twpr-check" title="Hide anyone whose overdose check came back positive — an OD ended their war, which is an explanation rather than an excuse.">
                          <input type="checkbox" id="twpr-sweep-hideod"> Hide confirmed overdoses
                        </label>
                      </div>
                      <div class="twpr-field">
                        <label>Export (follows this filter)</label>
                        <div class="twpr-btnrow">
                          <select class="twpr-select" id="twpr-sweep-fmt">
                            <option value="html">HTML report</option>
                            <option value="csv">CSV (per-war columns)</option>
                            <option value="discord-full">Discord — with each war</option>
                            <option value="discord">Discord — totals only</option>
                          </select>
                          <button class="twpr-colortoggle" id="twpr-sweep-copy" type="button">Copy</button>
                          <button class="twpr-colortoggle" id="twpr-sweep-dl" type="button">⬇ Download</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div id="twpr-sweep-body"></div>
                  </div>
                </div>

                <div class="twpr-pane twpr-pane-report open" id="twpr-pane-report">
                <div class="twpr-blank" id="twpr-report-blank">
                  Load your wars, pick one, then press <b>Pull report</b>.<br>
                  <span>The other tabs work without it — Multi-war only needs the war list.</span>
                </div>
                <div id="twpr-result" style="display:none;">
                <div class="twpr-row" style="margin-bottom:8px;gap:14px;">
                  <div class="twpr-field">
                    <label for="twpr-lossscope">Count "losses" as</label>
                    <select class="twpr-select" id="twpr-lossscope">
                      <option value="all">All losses during war (any attacker)</option>
                      <option value="enemy">Losses to enemy faction only</option>
                    </select>
                  </div>
                </div>

                <div class="twpr-tablewrap">
                  <table class="twpr">
                    <thead><tr>
                      <th data-k="name" title="Faction member [their Torn ID]">Member</th>
                      <th data-k="wins" title="Successful war hits landed on the enemy faction">Hits</th>
                      <th data-k="loss" title="Times this member was beaten during the war (any attacker, per the dropdown)">Losses</th>
                      <th data-k="lossEnemy" title="Of those losses, how many came from the war opponent">vs Enemy</th>
                      <th data-k="enemyHits" title="Times the enemy attacked this member — confirmed enemy hits plus stealthed hits (attacker hidden, almost always the enemy during a war)">Enemy Hits</th>
                      <th data-k="defHeld" title="Incoming attacks this member survived — the attacker lost, stalemated, or ran out of time">Defended</th>
                      <th data-k="stalemates" title="Stalemates against the enemy">Stale</th>
                      <th data-k="assists" title="Assists against the enemy">Assist</th>
                      <th data-k="respect" title="Respect earned from war hits">Respect</th>
                    </tr></thead>
                    <tbody id="twpr-tbody"></tbody>
                  </table>
                </div>

                <div class="twpr-foot">
                  <div class="twpr-summary" id="twpr-summary"></div>
                  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <select class="twpr-select" id="twpr-fmt" aria-label="Export format" style="padding:8px 10px;">
                      <option value="aligned">Aligned table</option>
                      <option value="discord">Discord (code block)</option>
                      <option value="tsv">Spreadsheet (TSV)</option>
                      <option value="csv">CSV</option>
                    </select>
                    <button class="twpr-btn" id="twpr-copy-table">Copy table</button>
                  </div>
                </div>
                </div>
              </div>
            </div>
          </div>`;
        document.body.appendChild(overlay);

        bindTap($('#twpr-close'), closePanel);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closePanel(); });
        bindTap($('#twpr-load'), onLoadWars);
        bindTap($('#twpr-run'), onRun);
        bindTap($('#twpr-copy-table'), onCopyTable);

        // Color settings: build pickers, restore saved values, wire toggle.
        buildColorUI();
        loadColors();
        // (The Colors toggle button became a tab; its binding went with it.)
        bindTap($('#twpr-colorreset'), resetColors);   // built by buildColorUI, not in the static markup
        showPane('twpr-pane-report');

        // Tabs. One pane visible at a time — see the markup for why.
        overlay.querySelectorAll('.twpr-tab').forEach(t => bindTap(t, () => showPane(t.dataset.pane)));
        bindTap($('#twpr-drug-run'), onDrugRun);
        bindTap($('#twpr-drug-od'), onDrugOD);
        bindTap($('#twpr-drug-copy'), onDrugCopy);
        bindTap($('#twpr-drug-csv'), onDrugCsvDownload);
        bindTap($('#twpr-drug-html'), onDrugHTML);
        bindTap($('#twpr-sweep-run'), onSweepRun);
        bindTap($('#twpr-sweep-copy'), onSweepCopy);
        bindTap($('#twpr-sweep-dl'), onSweepDownload);
        bindTap($('#twpr-sweep-last3'), () => pickSweep(3));
        bindTap($('#twpr-sweep-last5'), () => pickSweep(5));
        bindTap($('#twpr-sweep-all'), () => pickSweep(null));
        // Keep the cost line honest as the selection changes.
        ['#twpr-sweep-wars', '#twpr-sweep-skiplive'].forEach(sel => {
            const el = $(sel);
            if (el) el.addEventListener('change', updateSweepCost);
        });
        bindTap($('#twpr-raffle-draw'), onRaffleDraw);
        bindTap($('#twpr-raffle-wheel'), onCopyWheel);
        bindTap($('#twpr-raffle-csv'), onRaffleCsv);
        // Odds must move as you type a weight, or the numbers you draw against
        // are not the ones on screen.
        overlay.addEventListener('input', (e) => {
            if (e.target.id && (e.target.id.startsWith('twpr-rw-') ||
                ['twpr-raffle-cap', 'twpr-raffle-min'].includes(e.target.id))) renderRaffle();
        });
        bindTap($('#twpr-rf-p-loss'), () => applyRafflePreset({ loss: 1 }));
        bindTap($('#twpr-rf-p-hits'), () => applyRafflePreset({ wins: 1 }));
        bindTap($('#twpr-rf-p-bal'),  () => applyRafflePreset({ wins: 1, loss: 1, defHeld: 1, assists: 1 }));
        bindTap($('#twpr-rf-p-part'), () => applyRafflePreset({ flat: 1 }));
        bindTap($('#twpr-cache-clear'), async () => {
            await cacheClearAll();
            // Refresh the 💾 markers if wars are loaded.
            if (state.wars && state.wars.length) {
                const sel = $('#twpr-war');
                const cur = sel.value;
                sel.innerHTML = state.wars.map((w, i) => {
                    const when = w.start ? new Date(w.start * 1000).toISOString().slice(0, 10) : '?';
                    const live = w.end ? '' : ' [LIVE]';
                    return `<option value="${i}">${when} vs ${w.oppName} (${w.myScore}–${w.oppScore})${live}</option>`;
                }).join('');
                sel.value = cur;
            }
            setStatus('Cleared all cached reports, drug data and overdose readings.');
        });

        // Live color updates.
        overlay.addEventListener('input', (e) => {
            const t = e.target;
            if (t.matches && t.matches('#twpr-colors input[type=color]')) {
                const cfg = COLORS.find(c => c.key === t.dataset.key);
                if (cfg) $('#twpr-panel').style.setProperty(cfg.cssVar, t.value);
                saveColors();
            }
        });
        overlay.addEventListener('change', (e) => {
            if (e.target.id === 'twpr-lossscope') { renderTable(); renderRaffle(); }
            if (e.target.id && e.target.id.startsWith('twpr-rw-')) renderRaffle();
            if (e.target.id === 'twpr-drug-filter') renderDrugs();
            if (e.target.id && e.target.id.startsWith('twpr-sweep-') &&
                !['twpr-sweep-wars', 'twpr-sweep-fmt'].includes(e.target.id)) renderSweep();
        });
        // The threshold is a number field — it must repaint as you type, not
        // only when focus leaves it.
        overlay.addEventListener('input', (e) => {
            if (e.target.id === 'twpr-sweep-thresh') renderSweep();
        });

        // Sortable headers.
        overlay.querySelectorAll('table.twpr thead th').forEach(th => {
            bindTap(th, () => sortBy(th.dataset.k));
        });

        // Prefill saved key.
        gmGet(LS_KEY, '').then(k => { if (k) $('#twpr-key').value = k; });
    }

    /**
     * Show exactly one pane.
     *
     * Drives the SAME `.open` class the panes already used, rather than adding
     * a parallel display mechanism the two could drift apart on. The raffle is
     * rendered on reveal because its table depends on the loss-scope dropdown,
     * which can change while another tab is in front.
     */
    function showPane(id) {
        const overlay = $('#twpr-overlay');
        if (!overlay) return;
        overlay.querySelectorAll('.twpr-pane').forEach(p => p.classList.toggle('open', p.id === id));
        overlay.querySelectorAll('.twpr-tab').forEach(t => t.classList.toggle('active', t.dataset.pane === id));
        if (id === 'twpr-raffle') renderRaffle();
        if (id === 'twpr-sweep') fillSweepWars();   // wars may have loaded since this pane was last seen
    }

    /** A dot on a tab means "there is something in here", nothing more. */
    function markTab(which, on, warn) {
        const d = $('#twpr-tabdot-' + which);
        if (!d) return;
        d.classList.toggle('on', !!on);
        d.classList.toggle('warn', !!warn);
    }

    function openPanel() { buildPanel(); $('#twpr-overlay').classList.add('open'); }
    function closePanel() { const o = $('#twpr-overlay'); if (o) o.classList.remove('open'); }

    async function onLoadWars() {
        const key = $('#twpr-key').value.trim();
        if (!key) { setStatus('Enter your API key first.', true); return; }
        gmSet(LS_KEY, key);
        setStatus('Loading faction + wars…');
        try {
            await cachePrune();
            state.ctx = await getFactionContext(key);
            state.wars = listWars(state.ctx);
            if (!state.wars.length) { setStatus('No ranked wars found for this faction.', true); return; }
            const cachedIds = new Set((await cacheIndexGet()).map(x => x.warId));
            const sel = $('#twpr-war');
            sel.innerHTML = state.wars.map((w, i) => {
                const when = w.start ? new Date(w.start * 1000).toISOString().slice(0, 10) : '?';
                const live = w.end ? '' : ' [LIVE]';
                const cached = cachedIds.has(w.warId) ? ' 💾' : '';
                return `<option value="${i}">${when} vs ${w.oppName} (${w.myScore}–${w.oppScore})${live}${cached}</option>`;
            }).join('');
            $('#twpr-war-row').style.display = 'flex';
            // Wars are the only prerequisite the sweep has, so it unlocks here —
            // it does NOT need a war report, and used to be gated behind one.
            $('#twpr-tabs').style.display = 'flex';
            $('#twpr-sweep-blank').style.display = 'none';
            $('#twpr-sweep-main').style.display = 'block';
            fillSweepWars();
            updateSweepCost();
            pickSweep(Math.min(3, state.wars.length));
            setStatus(`Found ${state.wars.length} war(s) for ${state.ctx.factionName}. 💾 = cached. Pick one and pull, ` +
                      `or open 💊 Drug Report → Multi-war sweep to check them all at once.`);
        } catch (e) {
            setStatus(e.message || 'Failed to load.', true);
        }
    }

    let reportRun = 0;
    async function onRun() {
        const run = ++reportRun;
        const ownsRun = () => run === reportRun;
        const key = $('#twpr-key').value.trim();
        const idx = Number($('#twpr-war').value);
        const war = state.wars[idx];
        if (!war) { setStatus('Select a war.', true); return; }
        const current = () => ownsRun() && state.wars[Number($('#twpr-war').value)] === war
            && $('#twpr-key').value.trim() === key;
        const changed = () => { if (ownsRun()) setStatus('The selected war or API key changed. Pull again for a new report.'); };
        state.war = war;
        state.report = null;
        // Drug data is per-war — never carry the last war's numbers over.
        state.drugs = null;
        state.odResults = null;
        updateDrugActions();
        if ($('#twpr-drug-body')) {
            $('#twpr-drug-body').innerHTML =
                '<div class="twpr-note" style="font-size:12.5px;">Press <b>Pull drug data</b> to fetch the ' +
                'faction armoury log for this war and tie Xanax taken to hits landed.</div>';
        }

        const from = war.start;
        const to = war.end && war.end > 0 ? war.end : Math.floor(Date.now() / 1000);
        if (!from) { setStatus('That war has no start timestamp.', true); return; }

        // Serve from the 30-day cache unless "Fresh pull" is ticked.
        const forceFresh = !!($('#twpr-fresh') && $('#twpr-fresh').checked);
        if (!forceFresh && war.end > 0) {
            const cached = await cacheLoad(war.warId);
            if (!current()) { changed(); return; }
            // `cached.report` is now optional: the multi-war sweep writes drug
            // data for wars it never pulled attacks for. Such an entry can't
            // serve this pane — it must fall through to a live attack pull —
            // but its drug report is still restored below rather than discarded.
            if (cached && cached.report && !cached.partial) {
                state.report = cached.report;
                state.report.__scanned = cached.attacksScanned || 0;
                showReport();
                renderTable();
                renderRaffle();
                let drugNote = '';
                // refreshDrugReport, not a bare assignment: the cache holds the
                // raw counts AND whatever flags the build that saved it derived.
                // Re-deriving means a fix to the flag logic applies to reports
                // saved before that fix existed.
                if (cached.od) state.odResults = cached.od;   // before renderDrugs, so the OD column paints
                if (cached.drugs) {
                    state.drugs = restoreSingleWarDrugs(cached.drugs, state.report);
                    renderDrugs();
                    drugNote = ' Drug report restored too.' + (cached.od ? ' Overdose checks too.' : '');
                }
                const age = humanAge(Date.now() - (cached.reportSavedAt || cached.savedAt));
                const cacheStatus = `Loaded from cache (saved ${age} ago, ${fmt(cached.attacksScanned || 0)} attacks).${drugNote}`;
                const freshHint = ' Tick "Fresh pull" for a full rescan.';
                if (state.report.enemyReportHits == null && key && war.oppId) {
                    setStatus(cacheStatus + ' Checking the official enemy hit total.');
                    const officialEnemyHits = await fetchEnemyHits(key, war.warId, war.oppId);
                    if (!current()) { changed(); return; }
                    if (officialEnemyHits != null) {
                        state.report.enemyReportHits = officialEnemyHits;
                        renderTable();
                        setStatus(cacheStatus + ' Enemy hit total taken from the war report.' + freshHint);
                        await cacheEnemyHitTotal(war.warId, cached.reportSavedAt || cached.savedAt, officialEnemyHits, current);
                    } else {
                        setStatus(cacheStatus + ' Official enemy hit total unavailable; showing the attack-log estimate.' + freshHint);
                    }
                } else {
                    setStatus(cacheStatus + freshHint);
                }
                return;
            }
            // Sweep-only entry: no attack report, but the drug work is done.
            // Restore it before the attack pull so the drug pane isn't blank
            // and the log isn't fetched a second time for no reason.
            if (cached && !cached.report && cached.drugs) {
                if (cached.od) state.odResults = cached.od;
                state.drugs = refreshDrugReport(cached.drugs);
                renderDrugs();
            }
        }

        $('#twpr-run').disabled = true;
        setStatus('Pulling attacks… (this can take a moment for big wars)');
        try {
            const pulled = await pullAttacks(key, from, to, (count, page) => {
                if (current()) setStatus(`Pulling attacks… ${fmt(count)} loaded (page ${page})`);
            });
            if (!current()) return;
            const attacks = pulled.list;
            const report = buildReport(state.ctx, war, attacks);
            report.__scanned = attacks.length;
            report.__partial = pulled.partial;
            const partialNote = pulled.partial ? ' (partial — API pagination could not establish completeness; re-pull before using totals)' : '';
            setStatus(`Scanned ${fmt(attacks.length)} attacks${partialNote}. Checking the war report for the enemy's hit total…`);
            // Authoritative enemy hit count comes from the ranked war report,
            // since the attack log doesn't capture every incoming hit.
            const enemyHits = await fetchEnemyHits(key, war.warId, war.oppId);
            if (!current()) return;
            report.enemyReportHits = enemyHits;
            state.report = report;
            if (state.drugs) {
                if (!report.__partial) state.drugs = restoreSingleWarDrugs(state.drugs, report);
                renderDrugs();
            }
            showReport();
            renderTable();
            renderRaffle();
            // Cache the finished report for 30 days (skip caching partial pulls).
            if (!pulled.partial && war.end > 0) await cacheSave(war, state.report, attacks.length, pulled.partial);
            if (!current()) return;
            const source = state.report.enemyReportHits != null
                ? 'Enemy hit total taken from the war report.'
                : war.end > 0
                    ? 'Official enemy hit total unavailable; showing the attack-log estimate.'
                    : 'Official enemy hit total unavailable during the live war; showing the attack-log estimate.';
            const cacheNote = pulled.partial ? ' Not cached (partial).' : war.end > 0 ? ' Cached for 30 days.' : ' Live report not cached.';
            setStatus(`Done. ${source}${partialNote}${cacheNote}`, pulled.partial);
        } catch (e) {
            if (current()) setStatus(e.message || 'Pull failed.', true);
        } finally {
            if (ownsRun()) {
                if (!current()) changed();
                $('#twpr-run').disabled = false;
            }
        }
    }

    // Pull the enemy faction's total hits from the ranked war report. Returns
    // a number, or null if the report isn't available (e.g. war still live).
    async function fetchEnemyHits(key, warId, oppId) {
        try {
            const data = await fetchJSON(`torn/${warId}`, { selections: 'rankedwarreport' }, key);
            const rep = data.rankedwarreport;
            if (!rep || !rep.factions) return null;
            const enemy = rep.factions[oppId] || rep.factions[String(oppId)];
            if (!enemy) return null;
            // Missing data is not an authoritative zero.
            const hitCount = value => {
                if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value.trim()))) return null;
                const count = Number(value);
                return Number.isSafeInteger(count) && count >= 0 ? count : null;
            };
            const reported = hitCount(enemy.attacks);
            if (reported !== null) return reported;

            const members = enemy.members && typeof enemy.members === 'object'
                ? Object.values(enemy.members)
                : [];
            if (!members.length) return null;
            let total = 0;
            for (const member of members) {
                const count = hitCount(member?.attacks ?? member?.hits);
                if (count === null) return null;
                total += count;
            }
            return hitCount(total);
        } catch (e) {
            return null;
        }
    }

    let sortKey = 'wins', sortDir = -1;
    function sortBy(k) {
        if (!state.report) return;
        if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = (k === 'name') ? 1 : -1; }
        renderTable();
    }

    function sortedRows() {
        const list = state.report.list.slice();
        list.sort((a, b) => {
            let av, bv;
            if (sortKey === 'loss') { av = scopedLoss(a); bv = scopedLoss(b); }
            else if (sortKey === 'enemyHits') { av = a.enemyOn + a.stealthOn; bv = b.enemyOn + b.stealthOn; }
            else if (sortKey === 'name') { return a.name.localeCompare(b.name) * sortDir; }
            else { av = a[sortKey]; bv = b[sortKey]; }
            return (av - bv) * sortDir;
        });
        return list;
    }

    function renderTable() {
        if (!state.report) return;
        const list = sortedRows();
        const tbody = $('#twpr-tbody');
        tbody.innerHTML = list.map(row => {
            return `<tr>
              <td><span class="twpr-name">${row.name}</span> <span class="twpr-id">[${row.id}]</span></td>
              <td class="twpr-win">${fmt(row.wins)}</td>
              <td class="twpr-loss">${fmt(scopedLoss(row))}</td>
              <td>${fmt(row.lossEnemy)}</td>
              <td>${fmt(row.enemyOn + row.stealthOn)}</td>
              <td>${fmt(row.defHeld)}</td>
              <td class="twpr-stale">${fmt(row.stalemates)}</td>
              <td>${fmt(row.assists)}</td>
              <td class="twpr-respect">${fmt(row.respect.toFixed ? row.respect.toFixed(2) : row.respect)}</td>
            </tr>`;
        }).join('');

        const rep = state.report;
        const logEnemy = rep.totalEnemyOn + rep.totalStealthOn;
        let enemyStr;
        if (rep.enemyReportHits != null) {
            enemyStr = `Enemy hits on us: <b>${fmt(rep.enemyReportHits)}</b> <span style="color:#8b90a6;">(war report · log saw ${fmt(logEnemy)})</span>`;
        } else {
            enemyStr = `Enemy hits on us: <b>~${fmt(logEnemy)}</b> <span style="color:#8b90a6;">(attack-log estimate — undercounts incoming)</span>`;
        }
        $('#twpr-copy-table').disabled = !!rep.__partial;
        const scanWarning = rep.__partial
            ? '<strong>Partial attack scan. Re-pull before copying or using totals.</strong><br>'
            : '';
        const losses = lossSummary(rep);
        $('#twpr-summary').innerHTML = scanWarning +
            `War hits: <b>${fmt(rep.totalHits)}</b> · Our losses${losses.suffix}: <b class="twpr-loss">${fmt(losses.total)}</b> · ` +
            enemyStr + ` · Respect: <b>${fmt(rep.totalRespect.toFixed(2))}</b>`;
    }

    // Shared row set: drop members who did nothing at all.
    function reportRows() {
        return sortedRows()
            .filter(row => row.wins || row.lossAll || row.defHeld || row.assists || row.stalemates)
            .map(row => ({
                name: row.name,
                id: row.id,
                player: `${row.name} [${row.id}]`,
                hits: row.wins,
                loss: scopedLoss(row),
                lossAll: row.lossAll,
                enemy: row.lossEnemy,
                enemyHits: row.enemyOn + row.stealthOn,
                enemyConfirmed: row.enemyOn,
                stealth: row.stealthOn,
                held: row.defHeld,
                stale: row.stalemates,
                assist: row.assists,
                offlost: row.offLost,
                respect: (row.respect.toFixed ? row.respect.toFixed(2) : row.respect),
            }));
    }

    // Full column spec for the data formats (CSV / TSV).
    const COPY_COLS = [
        ['Member',      r => r.name],
        ['ID',          r => r.id],
        ['Hits',        r => r.hits],
        ['Losses',      r => r.loss],
        ['LossesAll',   r => r.lossAll],
        ['LossesEnemy', r => r.enemy],
        ['EnemyHits',   r => r.enemyHits],
        ['EnemyConfirmed', r => r.enemyConfirmed],
        ['Stealthed',   r => r.stealth],
        ['Defended',    r => r.held],
        ['Stalemates',  r => r.stale],
        ['Assists',     r => r.assist],
        ['OffLost',     r => r.offlost],
        ['Respect',     r => r.respect],
    ];

    // Compact, human-readable monospace table.
    function buildAligned(rows) {
        const headers = ['Player', 'Hits', 'Loss', 'Enmy', 'EnHits', 'Def', 'Stl', 'Ast', 'Respect'];
        const body = rows.map(r => [
            r.player, String(r.hits), String(r.loss), String(r.enemy), String(r.enemyHits),
            String(r.held), String(r.stale), String(r.assist), String(r.respect),
        ]);
        const all = [headers, ...body];
        const w = headers.map((_, i) => Math.max(...all.map(row => row[i].length)));
        const line = (row) => row.map((c, i) => i === 0 ? c.padEnd(w[i]) : c.padStart(w[i])).join('  ');
        const sep = w.map(x => '-'.repeat(x)).join('  ');
        return [line(headers), sep, ...body.map(line)].join('\n');
    }

    function buildDelimited(rows, delim, quoteNames) {
        const head = COPY_COLS.map(c => c[0]).join(delim);
        const lines = [head];
        for (const r of rows) {
            lines.push(COPY_COLS.map(c => {
                const v = c[1](r);
                return (quoteNames && c[0] === 'Member') ? `"${v}"` : v;
            }).join(delim));
        }
        return lines.join('\n');
    }

    // One-line war summary used at the top of the human-readable exports.
    function summaryLine() {
        const rep = state.report;
        if (!rep) return '';
        const logEnemy = rep.totalEnemyOn + rep.totalStealthOn;
        const enemy = rep.enemyReportHits != null
            ? `${fmt(rep.enemyReportHits)} (war report)`
            : `~${fmt(logEnemy)} (attack-log estimate)`;
        const when = state.war ? (state.war.oppName || 'enemy') : 'enemy';
        const losses = lossSummary(rep);
        return `War vs ${when} — our hits: ${fmt(rep.totalHits)} · our losses${losses.suffix}: ${fmt(losses.total)} · enemy hits on us: ${enemy}`;
    }

    function onCopyTable() {
        if (!state.report || state.report.__partial) return;
        const rows = reportRows();
        if (!rows.length) { setStatus('No active members to copy.', true); return; }
        const mode = $('#twpr-fmt') ? $('#twpr-fmt').value : 'aligned';
        const summary = summaryLine();
        let text, label;
        if (mode === 'aligned')      { text = summary + '\n\n' + buildAligned(rows);                 label = 'Aligned table copied.'; }
        else if (mode === 'discord') { text = '```\n' + summary + '\n\n' + buildAligned(rows) + '\n```'; label = 'Discord block copied.'; }
        else if (mode === 'tsv')     { text = buildDelimited(rows, '\t', false);  label = 'TSV copied — paste into a spreadsheet.'; }
        else                         { text = buildDelimited(rows, ',', true);    label = 'CSV copied.'; }
        copy(text, label);
    }

    /* =================== drug report UI ======================= */
    const dayStr = (ts) => ts ? new Date(ts * 1000).toISOString().slice(0, 16).replace('T', ' ') : '—';

    function drugFilter() {
        const el = $('#twpr-drug-filter');
        return el ? el.value : 'all';
    }

    /*
     * The OD verdict and the flag, as PLAIN TEXT. The table and the CSV both read
     * these, so an export can never disagree with the screen it was taken from —
     * which is the whole point of an "exactly as shown" export.
     */
    function odText(r) {
        const od = state.odResults && state.odResults[r.id];
        if (!od) return '–';
        if (od.mode === 'delta') return od.ods > 0 ? `💊 OD ×${od.ods}` : 'no OD';
        if (od.mode === 'baseline') return od.ods > 0 ? `💊 OD ×${od.ods}?` : 'no OD*';
        if (od.mode === 'lifetime') return `? (${fmt(od.lifetime)} ever)`;
        return 'could not check';
    }
    function flagText(r) {
        return r.freeloader ? '⚠ no hits' : r.stocker ? '📦 stocker' : (r.drawn ? 'ok' : '');
    }

    // Renders the four possible answers as four visibly different things. The
    // whole point of the OD check is that "no OD" and "we couldn't find out" must
    // never look the same — one clears a member, the other clears nobody.
    function odCell(r) {
        const od = state.odResults && state.odResults[r.id];
        const label = odText(r);
        if (!od) return '<span style="color:#5b6070">–</span>';
        if (od.mode === 'delta') {
            return od.ods > 0
                ? `<span class="twpr-stale" title="Overdose count rose by ${od.ods} between the war's start and end (${od.before} → ${od.after}). An OD hospitalises for hours — this very likely explains the missing hits.">${label}</span>`
                : `<span class="twpr-ok" title="Overdose count did not move across the war window (${od.before} → ${od.after}). No OD.">${label}</span>`;
        }
        if (od.mode === 'baseline') {
            const when = od.since ? ' (' + dayStr(od.since) + ')' : '';
            return od.ods > 0
                ? `<span class="twpr-stale" title="Overdose count rose by ${od.ods} since this script last looked${when} — that span is wider than the war, so the OD may have happened outside it.">${label}</span>`
                : `<span class="twpr-ok" title="No overdose since this script last looked${when}.">${label}</span>`;
        }
        if (od.mode === 'lifetime') {
            return `<span style="color:#8b90a6" title="Torn would only give the LIFETIME total: ${od.lifetime} overdose(s) ever. That says nothing about this war. Re-run the check after the next war for a real comparison.">${label}</span>`;
        }
        return `<span class="twpr-loss" title="The lookup failed: ${od.err || 'unknown error'}. This is NOT a clean result.">${label}</span>`;
    }

    function drugRows() {
        if (!state.drugs) return [];
        const mode = drugFilter();
        return state.drugs.list.filter(r => {
            if (mode === 'took') return r.drawn > 0;
            if (mode === 'freeload') return r.freeloader;
            if (mode === 'nodrug') return r.hits > 0 && r.drawn === 0;
            return r.drawn > 0 || r.hits > 0 || r.total > 0 || r.xanDeposited > 0;
        });
    }

    let drugOdInFlight = null;
    function drugIncompleteReason(d) {
        const reasons = [];
        if (state.report?.__partial) reasons.push('Incomplete attack scan. Pull a fresh war report.');
        if (d?.armouryPartial) reasons.push('Incomplete armoury scan. Pull drug data again.');
        return reasons.join(' ');
    }
    function drugActionProblem() {
        if (!state.report || !drugRunContext().current()) return 'Pull the selected war report first.';
        if ($('#twpr-drug-run')?.disabled) return 'Wait for the armoury scan to finish.';
        if (!state.drugs) return 'Pull drug data first.';
        return drugIncompleteReason(state.drugs);
    }
    function updateDrugActions() {
        const disabled = !!drugActionProblem();
        for (const id of ['copy', 'csv', 'html', 'od']) {
            const el = $('#twpr-drug-' + id);
            if (el) el.disabled = disabled || (id === 'od' && !!state.drugs && drugOdInFlight === state.drugs);
        }
    }
    function canUseDrugResults() {
        const problem = drugActionProblem();
        if (problem) setStatus(problem, true);
        return !problem;
    }

    function renderDrugs() {
        const box = $('#twpr-drug-body');
        if (!box) return;
        const d = state.drugs;
        updateDrugActions();
        const filter = $('#twpr-drug-filter');
        if (filter) filter.disabled = false;
        if (!d) return;

        const incomplete = drugIncompleteReason(d) || (!state.report ? 'War attacks are still loading.' : '');
        if (incomplete && filter) {
            filter.value = 'all';
            filter.disabled = true;
        }
        const rows = drugRows();
        const flagged = d.freeloaders.length;

        // A window that returned nothing is NOT the same as a faction that took
        // nothing, and the pane has to say which one it is.
        const noData = d.uses === 0;

        const kpis = `
          <div class="twpr-kpis">
            <div class="twpr-kpi"><div class="k">Xanax swallowed</div><div class="v" style="color:#ffd479">${fmt(d.totalXan)}</div>
              <div class="s">${fmt(d.takers)} member${d.takers === 1 ? '' : 's'}</div></div>
            <div class="twpr-kpi"><div class="k">Build-up</div><div class="v" style="color:#9fc7ff">${fmt(d.totalXanPre || 0)}</div>
              <div class="s">before fighting started</div></div>
            <div class="twpr-kpi"><div class="k">During war</div><div class="v" style="color:#ffd479">${fmt(d.totalXanWar || 0)}</div>
              <div class="s">${d.totalXanPost ? fmt(d.totalXanPost) + ' after the bell' : 'while it was live'}</div></div>
            <div class="twpr-kpi"><div class="k">Withdrawn</div><div class="v" style="color:#ff9a9a">${fmt(d.totalXanTaken || 0)}</div>
              <div class="s">pulled to inventory${d.totalXanDeposited ? ' · ' + fmt(d.totalXanDeposited) + ' put in' : ''}</div></div>
            <div class="twpr-kpi"><div class="k">Hits landed</div><div class="v">${fmt(d.totalHits)}</div>
              <div class="s">war hits only</div></div>
            <div class="twpr-kpi"><div class="k">Hits per Xanax</div>
              <div class="v">${incomplete || d.hitsPerXan == null ? '—' : d.hitsPerXan.toFixed(2)}</div>
              <div class="s">faction average</div></div>
            ${incomplete ? '' : `<div class="twpr-kpi"><div class="k">Took · no hits</div>
              <div class="v" style="color:${flagged ? '#ff9a9a' : '#7fe3a0'}">${fmt(flagged)}</div>
              <div class="s">${flagged ? 'burned stock for nothing' : 'nobody wasted stock'}</div></div>`}
            <div class="twpr-kpi"><div class="k">Other drugs</div><div class="v">${fmt(d.totalOtherDrugs)}</div>
              <div class="s">E, LSD, PCP, etc.</div></div>
          </div>`;

        const flagBox = !incomplete && flagged
            ? `<div class="twpr-warnbox"><b>${fmt(flagged)}</b> member${flagged === 1 ? '' : 's'} swallowed faction Xanax
               and landed <b>zero</b> war hits with it:
               ${d.freeloaders.slice(0, 12).map(r => `${escHtml(r.name)} (${fmt(r.xanax)})`).join(', ')}${flagged > 12 ? ` … +${flagged - 12} more` : ''}.
               Worth checking before you accuse anyone — a hospital stay, a travel trip, or Xanax taken for
               a chain outside the war window all land here too.</div>`
            : '';

        const table = noData ? '' : `
          <div class="twpr-tablewrap">
            <table class="twpr">
              <thead><tr>
                <th title="Faction member [Torn ID]">Member</th>
                <th title="Xanax taken from the armoury in the build-up, BEFORE the fighting started">Pre-war</th>
                <th title="Xanax taken from the armoury while the war was live">In war</th>
                <th title="Xanax swallowed straight from the armoury — 'used one of the faction's Xanax items'">Used</th>
                <th title="Xanax pulled OUT of the armoury into their own inventory (gave/loaned to themselves). It leaves the faction either way, and after this the log never mentions it again.">Withdrew</th>
                <th title="Used + withdrawn — everything that left the armoury because of this member">Total out</th>
                <th title="Every other drug taken from the armoury (Ecstasy, LSD, PCP…)">Other</th>
                <th title="Successful war hits landed on the enemy">Hits</th>
                <th title="Hits landed per Xanax SWALLOWED — withdrawals are excluded, since the log cannot say whether they were ever used">Hits/Xan</th>
                <th title="Respect earned from war hits">Respect</th>
                <th title="Overdose check — only run for members who took drugs and landed no hits">OD</th>
                <th title="Swallowed faction Xanax but landed nothing with it. Withdrawing stock never flags — that is supply, not use.">Flag</th>
              </tr></thead>
              <tbody>${rows.map(r => `<tr>
                <td><span class="twpr-name">${escHtml(r.name)}</span> <span class="twpr-id">[${escHtml(r.id || '?')}]</span></td>
                <td class="${r.xanPre ? 'twpr-pay' : ''}">${r.xanPre ? fmt(r.xanPre) : '—'}</td>
                <td class="${r.xanWar ? 'twpr-stale' : ''}">${r.xanWar ? fmt(r.xanWar) : '—'}</td>
                <td class="${r.xanax ? 'twpr-stale' : ''}">${fmt(r.xanax)}</td>
                <td class="${r.xanTaken ? 'twpr-loss' : ''}">${r.xanTaken ? fmt(r.xanTaken) : '—'}</td>
                <td><b>${fmt(r.drawn)}</b>${r.xanDeposited ? ` <span class="twpr-ok" title="Also put ${fmt(r.xanDeposited)} Xanax INTO the armoury">+${fmt(r.xanDeposited)} in</span>` : ''}</td>
                <td>${r.otherDrugs ? fmt(r.otherDrugs) : '—'}</td>
                <td class="twpr-win">${fmt(r.hits)}</td>
                <td>${incomplete || r.hitsPerXan == null ? '—' : r.hitsPerXan.toFixed(2)}</td>
                <td class="twpr-respect">${fmt(Number(r.respect || 0).toFixed(2))}</td>
                <td>${incomplete ? '-' : odCell(r)}</td>
                ${incomplete ? '<td>-</td>' : `<td class="${r.freeloader ? 'twpr-flag' : 'twpr-ok'}">${r.freeloader ? '⚠ no hits' : r.stocker ? '📦 stocker' : (r.drawn ? 'ok' : '')}</td>`}
              </tr>`).join('')}</tbody>
            </table>
          </div>
          <div class="twpr-note">${fmt(rows.length)} row(s) shown ·
            drug window ${dayStr(d.pullFrom || d.firstTs)} → ${dayStr(d.pullTo || d.lastTs)} TCT
            (${fmt(d.leadDays || 0)}d build-up + war + ${fmt(d.tailHours || 0)}h tail) ·
            fighting started ${dayStr(d.warStart)} TCT ·
            ${fmt(d.entries)} armoury entries scanned${d.kinds ? ` — ${fmt(d.kinds.use || 0)} item uses, ${fmt(d.kinds.take || 0)} withdrawals, ${fmt(d.kinds.deposit || 0)} deposits` : ''}${d.unparsed ? `, ${fmt(d.unparsed)} other (retrieve / return / blood-bag fills)` : ''}.
            ${d.unrecognised && d.unrecognised.length ? `<br><span style="color:#6a7080">Unrecognised phrasing sample: ${d.unrecognised.map(t => escHtml(t)).join(' · ')}</span>` : ''}</div>`;

        const emptyNote = noData && !incomplete
            ? `<div class="twpr-warnbox">The armoury log returned <b>no drug use at all</b> for this war window.
               That usually means Torn has already pruned the news that far back (faction news doesn't keep
               forever), or the faction genuinely runs on personal Xanax rather than armoury stock.
               Recent wars parse cleanly — try the newest one to confirm the pull itself works.</div>`
            : '';

        markTab('drugs', true, !!incomplete || flagged > 0);
        const db = $('#twpr-drug-blank');
        if (db) db.style.display = 'none';
        const coverageNote = incomplete
            ? `<div class="twpr-warnbox" role="status"><b>${incomplete}</b> Counts shown are provisional. Export and overdose checks are unavailable.</div>`
            : '';
        box.innerHTML = coverageNote + kpis + flagBox + emptyNote + table +
            `<div class="twpr-note" style="margin-top:8px;">
               <b>Armoury only.</b> This counts Xanax taken <i>from the faction</i>. Somebody using their own
               stash is invisible to the API entirely — there is no endpoint for it — so a 0 here means
               "took none of yours", not "took none".</div>`;
    }

    // Single-war drug work must stay paired with the attack report it started with.
    function drugRunContext() {
        const run = reportRun;
        const { war, report, ctx } = state;
        const key = $('#twpr-key').value.trim();
        return { war, report, ctx, key, current: () => run === reportRun &&
            state.war === war && state.report === report && state.ctx === ctx &&
            state.wars[Number($('#twpr-war').value)] === war && $('#twpr-key').value.trim() === key };
    }

    async function onDrugRun() {
        const { war, report, ctx, key, current } = drugRunContext();
        if (!key) { setStatus('Enter your API key first.', true); return; }
        if (!war || !report || !current()) { setStatus('Pull the selected war report first.', true); return; }

        // The fighting window and the DRUG window are deliberately different.
        // war.start is when hits begin, but the stack-up happens in the days
        // before that, so the log pull reaches back over the build-up and the
        // report buckets each use by which side of war.start it landed on.
        const leadDays = Math.max(0, Math.min(14, Number($('#twpr-drug-lead').value) || 0));
        const tailHours = Math.max(0, Math.min(72, Number($('#twpr-drug-tail').value) || 0));
        const warStart = war.start;
        const warEnd = war.end && war.end > 0 ? war.end : Math.floor(Date.now() / 1000);
        const from = warStart - Math.round(leadDays * 86400);
        const to = warEnd + Math.round(tailHours * 3600);

        const windowClosed = war.end > 0 && to <= Math.floor(Date.now() / 1000);
        const btn = $('#twpr-drug-run');
        if (btn) btn.disabled = true;
        updateDrugActions();
        setStatus('Pulling the faction armoury log…');
        try {
            const pulled = await pullArmoryNews(key, from, to, (count, page) => {
                if (current()) setStatus(`Pulling armoury log… ${fmt(count)} entries (page ${page})`);
            });
            if (!current()) return;
            const drugs = buildDrugReport(ctx, report, pulled.list, { warStart, warEnd });
            drugs.leadDays = leadDays;
            drugs.tailHours = tailHours;
            drugs.pullFrom = from;
            drugs.pullTo = to;
            drugs.armouryPartial = pulled.partial;
            drugs.armouryWindowClosed = windowClosed;
            if (state.drugs?.pullFrom !== from || state.drugs?.pullTo !== to) state.odResults = null;
            state.drugs = drugs;
            renderDrugs();
            const partialNote = pulled.partial ? ' (partial — API pagination could not establish completeness; re-pull before using totals)' : '';
            setStatus(`Drug report built from ${fmt(pulled.list.length)} armoury entries${partialNote}. ` +
                      `${fmt(state.drugs.totalXan)} Xanax taken by ${fmt(state.drugs.takers)} member(s).`, pulled.partial);
            // Merge only drug data; an incomplete attack report must not become a complete cache.
            if (!pulled.partial && !report.__partial && war.end > 0) {
                await cacheSave(war, null, null, false, drugs);
            }
        } catch (e) {
            if (current()) {
                state.drugs = null;
                state.odResults = null;
                const body = $('#twpr-drug-body');
                if (body) body.innerHTML = '<div class="twpr-warnbox" role="status"><b>Armoury scan failed.</b> Pull drug data again before using this report.</div>';
                markTab('drugs', true, true);
                setStatus(e.message || 'Drug pull failed.', true);
            }
        } finally {
            if (btn) btn.disabled = false;
            updateDrugActions();
        }
    }

    /**
     * Overdose check across a whole sweep.
     *
     * Only the population the question is about: members who took Xanax and
     * landed nothing in that war. Checking everyone would multiply the call
     * count by the roster to answer a question nobody asked about the people
     * who obviously fought.
     *
     * A live war is skipped outright — with no published hits nobody is flagged
     * in it, so there is no one to check and nothing the answer could mean.
     */
    async function sweepOverdoses(key, perWar, onProgress) {
        const out = {};
        for (const p of perWar) {
            if (p.hitsSrc === 'none' || !p.drugs || !p.drugs.list) continue;
            // Not just the members who landed NOTHING. Someone who swallowed 8
            // and landed 30 still burnt five Xanax worth of energy, and if an
            // overdose is why, that is not waste either. The population is
            // everyone whose war has measurable waste — which an OD would
            // excuse. Members who have never overdosed cost one cached call.
            const targets = p.drugs.list.filter(r =>
                r.id && r.xanax > 0 && wastedEnergy(r.xanax, r.hits) >= ENERGY_PER_XANAX);
            if (!targets.length) continue;
            const res = await checkOverdoses(key, targets, p.war,
                (i, n, name) => onProgress && onProgress(p.war, i, n, name));
            for (const [uid, o] of Object.entries(res)) {
                const g = out[uid] || (out[uid] = { checked: 0, ods: 0, wars: 0, unknown: 0, byWar: {} });
                g.checked++;
                if ((o.mode === 'delta' || o.mode === 'baseline') && o.ods > 0) {
                    g.ods += o.ods; g.wars++;
                    // WHICH war matters twice over: it is what a leader is told,
                    // and it is what decides whether that war's Xanax counts as
                    // wasted at all.
                    g.byWar[p.war.warId] = { ods: o.ods, opp: p.war.oppName, start: p.war.start };
                } else if (o.mode === 'lifetime' || o.mode === 'error') g.unknown++;
            }
        }
        return out;
    }

    /**
     * An overdose is not waste.
     *
     * An OD puts you in hospital for hours and ends your war. The Xanax
     * swallowed before it was not squandered — the member was physically
     * prevented from spending that energy, which is a different thing entirely
     * from taking stock and not bothering.
     *
     * So the affected war's waste moves OUT of "wasted" and into "excused". It
     * is not deleted: both numbers stay visible, because "wasted 17" and
     * "wasted 2, excused 15 to an overdose" are different conversations and a
     * leader should be able to see which one they are having.
     *
     * Derived from wastedRaw every time, so running it twice is harmless.
     */
    function applyOdExcuses(sweep, odMap) {
        if (!sweep || !sweep.list) return sweep;
        for (const r of sweep.list) {
            r.excused = 0; r.warsExcused = 0; r.odWars = [];
            for (const p of Object.values(r.per)) { delete p.od; delete p.excused; }

            const o = odMap && odMap[r.id];
            if (o && o.byWar) {
                for (const [warId, rec] of Object.entries(o.byWar)) {
                    const p = r.per[warId];
                    if (!p || !p.known) continue;
                    p.od = rec.ods;
                    // Excuse the SWALLOWED Xanax an OD prevented them spending —
                    // p.used, not p.drawn. Charging the excuse on drawn would
                    // credit a quartermaster's withdrawals back as if they were
                    // wasted energy the OD saved, inflating the Excused total.
                    const e = asXanax(wastedEnergy(p.used != null ? p.used : p.drawn, p.hits));
                    if (e > 0) { r.excused += e; p.excused = true; }
                    if (p.flagged) r.warsExcused++;
                    r.odWars.push({ warId, ...rec });
                }
            }
            r.wasted = r.wastedRaw == null ? null : Math.max(0, r.wastedRaw - r.excused);
            // A member flagged three times, two of them overdoses, is not a
            // repeat offender — the pattern is one war, not three.
            r.warsFlaggedNet = Math.max(0, r.warsFlagged - r.warsExcused);
            r.repeat = r.warsFlaggedNet >= 2;
        }
        sweep.totalWasted = sweep.list.reduce((t, r) => t + (r.wasted || 0), 0);
        sweep.totalExcused = sweep.list.reduce((t, r) => t + (r.excused || 0), 0);
        sweep.flaggedAny = sweep.list.filter(r => r.warsFlaggedNet > 0);
        sweep.repeats = sweep.list.filter(r => r.repeat);
        sweep.odMembers = sweep.list.filter(r => r.odWars && r.odWars.length);
        sweep.list.sort((a, b) => (b.wasted || 0) - (a.wasted || 0)
                               || b.warsFlaggedNet - a.warsFlaggedNet || b.totalUsed - a.totalUsed);
        return sweep;
    }

    /* ---------------- multi-war sweep: UI ---------------- */

    function fillSweepWars() {
        const sel = $('#twpr-sweep-wars');
        if (!sel || !state.wars || !state.wars.length) return;
        // Called on every visit to the tab, so a rebuild would silently throw
        // away a selection the user made before switching away.
        const chosen = new Set([...sel.selectedOptions].map(o => o.value));
        const markup = state.wars.map((w, i) => {
            const when = w.start ? new Date(w.start * 1000).toISOString().slice(0, 10) : '?';
            const live = w.end ? '' : ' [LIVE]';
            return `<option value="${i}">${when} vs ${escHtml(w.oppName)}${live}</option>`;
        }).join('');
        if (sel.innerHTML === markup) return;
        sel.innerHTML = markup;
        if (chosen.size) [...sel.options].forEach(o => { o.selected = chosen.has(o.value); });
        else pickSweep(Math.min(3, state.wars.length));
        updateSweepCost();
    }

    function pickSweep(n) {
        const sel = $('#twpr-sweep-wars');
        if (!sel) return;
        [...sel.options].forEach((o, i) => { o.selected = n == null ? true : i < n; });
    }

    function sweepSelection() {
        const sel = $('#twpr-sweep-wars');
        if (!sel) return [];
        let picked = [...sel.selectedOptions].map(o => state.wars[Number(o.value)]).filter(Boolean);
        if ($('#twpr-sweep-skiplive') && $('#twpr-sweep-skiplive').checked) {
            picked = picked.filter(w => w.end && w.end > 0);
        }
        return picked;
    }

    /**
     * Say what a sweep will cost BEFORE it runs.
     *
     * Only war count moves the needle — the armoury log is one faction-wide
     * stream per war, so no member filter can make the pull smaller. Saying so
     * here stops the filters below from looking like they save time.
     */
    function updateSweepCost() {
        const el = $('#twpr-sweep-cost');
        if (!el) return;
        const wars = sweepSelection();
        if (!wars.length) { el.textContent = 'Pick at least one war.'; return; }
        const live = [...($('#twpr-sweep-wars') || { selectedOptions: [] }).selectedOptions]
            .map(o => state.wars[Number(o.value)]).filter(w => w && !(w.end > 0)).length;
        el.innerHTML = `<b>${fmt(wars.length)}</b> war${wars.length === 1 ? '' : 's'} selected`
            + (live && $('#twpr-sweep-skiplive') && $('#twpr-sweep-skiplive').checked
                ? ` · ${live} live war${live === 1 ? '' : 's'} skipped` : '')
            + `.<br>Roughly ${fmt(wars.length)}–${fmt(wars.length * 4)} API calls; cached wars cost nothing.`;
    }

    // Newest war on the RIGHT, so the row reads left-to-right as a timeline.
    function sweepWarCols(s) { return s.wars.slice().sort((a, b) => (a.start || 0) - (b.start || 0)); }

    /**
     * Apply the Show filter.
     *
     * The threshold deliberately offers TOTAL or AVERAGE, because on a 5-war
     * sweep they answer different questions: someone in one war with 8 hits and
     * someone in five with 8 hits are not the same person, and a totals-only
     * filter would quietly convict the first for having joined recently.
     */
    function sweepVisible(s) {
        if (!s) return [];
        const mode = ($('#twpr-sweep-show') || {}).value || 'all';
        const thresh = Math.max(0, Number(($('#twpr-sweep-thresh') || {}).value) || 0);
        const basis = ($('#twpr-sweep-basis') || {}).value || 'total';
        const onlyTook = !!($('#twpr-sweep-onlytook') && $('#twpr-sweep-onlytook').checked);
        const hideOd = !!($('#twpr-sweep-hideod') && $('#twpr-sweep-hideod').checked);

        return s.list.filter(r => {
            // Never show a row that carries no information at all.
            if (!(r.totalDrawn > 0 || r.totalHits > 0)) return false;
            if (onlyTook && r.totalDrawn <= 0) return false;
            // An overdose ended their war. That is an explanation, and this
            // lets a leader set it aside rather than argue with it.
            if (hideOd) {
                const o = state.sweepOd && state.sweepOd[r.id];
                if (o && o.ods > 0) return false;
            }
            if (mode === 'took') return r.totalDrawn > 0;
            // NET of overdose excuses — the HTML export's filter already is,
            // and a member whose only flags were ODs must not be surfaced by
            // a filter whose label says overdoses are excused.
            if (mode === 'flagged') return (r.warsFlaggedNet ?? r.warsFlagged) > 0;
            if (mode === 'repeat') return r.repeat;
            // Both hit-based filters accuse someone of not fighting. Neither may
            // fire on a member whose only wars are still live — we have no hit
            // data on them, and "unknown" must never be filtered as "zero".
            // An unknown war with recorded activity cannot prove zero hits.
            if (mode === 'zero') return r.warsKnown > 0 && r.warsKnown === r.warsSeen && r.totalHits === 0;
            if (mode === 'under') {
                if (r.warsKnown <= 0 || r.warsKnown !== r.warsSeen) return false;
                const v = basis === 'avg' ? r.avgHits : r.totalHits;
                return v < thresh;
            }
            if (mode === 'waste') {
                if (r.wasted == null) return false;   // unmeasured is not "over the line"
                const v = basis === 'avg' ? (r.warsKnown ? r.wasted / r.warsKnown : 0) : r.wasted;
                return v > thresh;
            }
            if (mode === 'od') {
                const o = state.sweepOd && state.sweepOd[r.id];
                return !!(o && o.ods > 0);
            }
            return true;
        });
    }

    // One sentence naming exactly what is on screen, so a screenshot of this
    // table can never be mistaken for the whole faction.
    function sweepFilterLabel(shown, total) {
        const mode = ($('#twpr-sweep-show') || {}).value || 'all';
        const thresh = Number(($('#twpr-sweep-thresh') || {}).value) || 0;
        const basis = ($('#twpr-sweep-basis') || {}).value || 'total';
        const onlyTook = !!($('#twpr-sweep-onlytook') && $('#twpr-sweep-onlytook').checked);
        const hideOd = !!($('#twpr-sweep-hideod') && $('#twpr-sweep-hideod').checked);
        const what = {
            all: 'everyone with any drug or hit activity',
            took: 'members who took faction Xanax',
            zero: 'members with confirmed zero hits in all recorded wars',
            under: `members under ${fmt(thresh)} ${basis === 'avg' ? 'hits per war on average' : 'total hits'} with complete recorded hit counts`,
            waste: `members who wasted more than ${fmt(thresh)} Xanax ${basis === 'avg' ? 'per war on average' : 'in total'}`,
            od: 'members with a confirmed overdose during a war',
            flagged: 'members flagged in at least one war',
            repeat: 'repeat offenders — flagged in 2 or more wars',
        }[mode];
        return `Showing <b>${fmt(shown)}</b> of ${fmt(total)} — ${what}`
             + (onlyTook && mode !== 'took' ? ', and only those who took Xanax' : '')
             + (hideOd ? ', excluding confirmed overdoses' : '') + '.';
    }

    /* RAINBOW COLUMNS, corrected.
     *
     * The first version painted the Xanax number in its column's hue. That was
     * a mistake, and it was spotted immediately from a screenshot: the Disciples
     * column is green, so "3 / 0" there looked like a PASS — green reads as good
     * in every other part of this tool. The hue meant "column 3" and nothing
     * else, but nobody reads it that way, and a colour that looks like a verdict
     * IS a verdict whatever the legend claims.
     *
     * So the hue moved off the text and onto the column BACKGROUND, which is
     * what a rainbow-CSV viewer actually does. You still track a column by tint,
     * and the numbers are now free to mean something:
     *
     *     Xanax  — always amber, matching the "Xanax out" tile above
     *     Hits   — green when they landed some, red when they landed none
     *
     * One colour per quantity, the same everywhere in the pane. */
    const SWEEP_HUES = ['#7fd4ff', '#ffd479', '#8ee6a0', '#ff9ecf', '#c3a6ff',
                        '#ffb37a', '#8ee6d5', '#e8e07a', '#ff9a9a', '#a8c8ff'];
    const hueOf = (i) => SWEEP_HUES[i % SWEEP_HUES.length];

    /**
     * Overdose verdict for a sweep row.
     *
     * Four visibly different outcomes, and "not checked" must never look like
     * "clean" — that distinction is the entire reason this feature exists
     * rather than a blank column.
     */
    function odCellSweep(r) {
        const o = state.sweepOd && state.sweepOd[r.id];
        if (!o) return '<span style="color:#4e5468" title="' + (state.sweepOd ? 'Not selected for the overdose check' : 'Overdose checks were not run') + '">·</span>';
        if (o.ods > 0) {
            // Name the wars. "1 overdose" is not actionable; "overdosed during
            // Bravo Company" is, and the war window is the honest resolution —
            // Torn's snapshot is daily, so a precise time would be invented.
            const where = (r.odWars || []).map(x =>
                escHtml(x.opp) + (x.start ? ' ' + new Date(x.start * 1000).toISOString().slice(5, 10) : '')
                + (x.ods > 1 ? ' ×' + x.ods : '')).join(', ');
            return `<span style="color:#ff8080;font-weight:700" title="Overdosed during ${where || o.wars + ' war(s)'} — that ended their war, so those Xanax are excused rather than wasted">💊 ${where || o.ods}</span>`;
        }
        if (o.unknown) return `<span style="color:#ffd479" title="${o.unknown} of ${o.checked} war(s) could not be determined: no usable reading">?</span>`;
        return '<span style="color:#7fe3a0" title="Checked across every flagged war — no overdose">—</span>';
    }

    /** Waste is a scale, not a yes/no — so is its colour. */
    function wasteColor(r) {
        if (r.wasted == null) return '#5c6178';
        if (r.wasted < 0.05) return '#7fe3a0';
        if (r.wasted < 3) return '#ffd479';
        return '#ff8080';
    }

    function sweepHitSummary(s) {
        const count = s.wars.length;
        const known = count - s.unknownWars.length;
        const complete = known > 0 && known === count;
        const coverage = fmt(known) + ' of ' + fmt(count) + ' war' + (count === 1 ? '' : 's') + ' reported';
        const value = known > 0 ? fmt(s.totalHits) : '?';
        const description = complete ? value + ' war hits' :
            (known > 0 ? value + ' confirmed war hits' : 'War hits unknown') + ' (' + coverage + ')';
        return { known, complete, coverage, value, description };
    }

    // Only wars with published hits feed the waste calculation.
    function sweepWasteSummary(s, hits = sweepHitSummary(s)) {
        const present = hits.known > 0;
        const rounded = present ? s.totalWasted.toFixed(0) : '?';
        const description = !present ? 'Xanax waste unknown (' + hits.coverage + ')' :
            rounded + ' Xanax wasted' + (hits.complete ? '' : ' in wars with hit data (' + hits.coverage + ')');
        return { rounded, description,
            value: present ? fmt(s.totalWasted) : '?',
            color: !present ? '#8b90a6' : s.totalWasted ? '#ff8080' : '#7fe3a0' };
    }

    function renderSweep() {
        const box = $('#twpr-sweep-body');
        if (!box) return;
        const s = state.sweep;
        const partialWars = s?.wars.filter(w => w.armouryPartial) || [];
        for (const id of ['#twpr-sweep-copy', '#twpr-sweep-dl']) {
            const btn = $(id);
            if (btn) btn.disabled = state.sweepRunning || partialWars.length > 0;
        }
        const runningBox = state.sweepRunning
            ? '<div class="twpr-warnbox" role="status"><b>Sweep in progress.</b> Copy and Download are unavailable until it finishes.' + (s ? ' The rows below are from the previous sweep.' : '') + '</div>'
            : '';
        if (!s) {
            box.innerHTML = runningBox;
            const filterRow = $('#twpr-sweep-filters');
            if (filterRow) filterRow.style.display = 'none';
            const count = $('#twpr-sweep-count');
            if (count) count.textContent = '';
            markTab('sweep', false, false);
            return;
        }

        const filterRow = $('#twpr-sweep-filters');
        if (filterRow) filterRow.style.display = 'block';

        const cols = sweepWarCols(s);
        const repeats = s.repeats.length;
        const everyone = s.list.filter(r => r.totalDrawn > 0 || r.totalHits > 0);
        const rows = sweepVisible(s);

        const hits = sweepHitSummary(s);
        const waste = sweepWasteSummary(s, hits);
        const kpis = `
          <div class="twpr-kpis">
            <div class="twpr-kpi"><div class="k">Wars swept</div><div class="v">${fmt(s.wars.length)}</div>
              <div class="s">${s.unknownWars.length ? fmt(s.unknownWars.length) + ' without hit data' : 'all with hit data'}</div></div>
            <div class="twpr-kpi"><div class="k">${hits.complete ? 'Xanax wasted' : 'Measured waste'}</div>
              <div class="v" style="color:${waste.color}">${waste.value}</div>
              <div class="s">${hits.complete ? 'of ' + fmt(s.totalUsed) + ' swallowed \u00b7 ' + fmt(Math.round(s.totalWasted * ENERGY_PER_XANAX)) + ' energy' : hits.coverage}</div></div>
            <div class="twpr-kpi"><div class="k">${hits.complete ? 'Hits landed' : 'Confirmed war hits'}</div><div class="v" style="color:#7fe3a0">${hits.value}</div>
              <div class="s">${hits.complete ? 'official war reports' : hits.coverage}</div></div>
            <div class="twpr-kpi"><div class="k">Wasted a war</div>
              <div class="v" style="color:${s.flaggedAny.length ? '#ffd479' : '#7fe3a0'}">${fmt(s.flaggedAny.length)}</div>
              <div class="s">took Xanax, landed 0 hits</div></div>
            <div class="twpr-kpi"><div class="k">Repeat offenders</div>
              <div class="v" style="color:${repeats ? '#ff9a9a' : '#7fe3a0'}">${fmt(repeats)}</div>
              <div class="s">did it in 2+ wars</div></div>
          </div>`;

        // The one finding a single-war report physically cannot produce.
        const repeatBox = repeats
            ? `<div class="twpr-warnbox"><b>${fmt(repeats)}</b> member${repeats === 1 ? '' : 's'} drew Xanax and landed
               nothing in <b>two or more</b> wars:
               ${s.repeats.slice(0, 12).map(r => `${escHtml(r.name)} — ${(r.wasted || 0).toFixed(1)} Xanax wasted, ${r.warsFlaggedNet ?? r.warsFlagged} of ${r.warsSeen} wars with nothing landed`).join(' · ')}${repeats > 12 ? ` … +${repeats - 12} more` : ''}.
               One bad war is a hospital stay. The same name every war is a pattern — but check travel and
               hospital time before you act on it.</div>`
            : (s.flaggedAny.length
                ? `<div class="twpr-note" style="margin:8px 0;">Nobody was flagged in more than one war — the misses
                   look like one-offs rather than a habit.</div>`
                : '');

        const caveats = [];
        if (state.sweepOd) caveats.push(escHtml(sweepOdCoverage()));
        if (s.unknownWars.length) {
            caveats.push(`<b>${fmt(s.unknownWars.length)} war${s.unknownWars.length === 1 ? '' : 's'}</b> had no hit data
              (${s.unknownWars.map(w => escHtml(w.oppName)).join(', ')}) — no complete hit report was available.
              Their Xanax still counts, but <b>nobody can be flagged in them</b>, so <b>?</b> in the hits slot means
              unknown, not idle. An asterisk in the waste columns means the value covers only wars with hit data.`);
        }
        if (s.emptyWars.length) {
            caveats.push(`<b>${fmt(s.emptyWars.length)} war${s.emptyWars.length === 1 ? '' : 's'}</b> returned no armoury
              activity (${s.emptyWars.map(w => escHtml(w.oppName)).join(', ')}) — Torn prunes faction news, so older wars
              come back thin or empty. That is missing data, not a clean faction.`);
        }
        const caveatBox = caveats.length
            ? `<div class="twpr-warnbox" style="border-color:rgba(255,212,121,.35);">${caveats.join('<br><br>')}</div>` : '';

        // Read this and the table needs no explaining.
        const legend = `
          <div class="twpr-legend">
            <span>Each war cell reads
              <span class="sw" style="color:#ffd479;background:rgba(255,212,121,.14)">14</span>
              <b>Xanax they swallowed</b> <span style="color:#5c6178">/</span>
              <span class="sw" style="color:#7fe3a0">9</span> <b>hits they landed</b>
              — amber is always Xanax, green is always hits.</span>
            <span><span class="sw" style="color:#7f8aa3">+431</span>
              also withdrew stock into their own inventory — supplying the faction,
              so it is <b>never</b> counted as waste</span>
            <span><span class="sw" style="color:#ff8080;background:rgba(255,120,120,.16)">3 / 0 ⚠</span>
              took Xanax, landed <b>nothing</b> that war</span>
            <span><span class="sw" style="color:#4e5468">–</span> not in that war &nbsp;
              <span class="sw" style="color:#4e5468">/ ?</span> war hit data unavailable</span>
          </div>`;

        const cell = (r, w, i) => {
            const p = r.per[w.warId];
            const c = hueOf(i);
            // Swallowed is what the cell reports. A withdrawal is shown as a
            // separate "+N" so a quartermaster's activity is visible without
            // being counted against them.
            const u = p && (p.used != null ? p.used : p.drawn);
            const tk = p ? (p.taken || 0) : 0;
            const plus = tk ? ` <span class="tk" title="Also withdrew ${fmt(tk)} into their own inventory — not counted as waste">+${fmt(tk)}</span>` : '';
            // The hue is a BACKGROUND wash now, never the number's colour.
            const sp = `twpr-wcell col${i % SWEEP_HUES.length}` + (i === 0 ? ' twpr-split' : '');
            if (!p) return `<td class="${sp} none" title="${escHtml(r.name)} does not appear in this war's data at all — they were not in the faction, or took nothing and landed nothing">–</td>`;
            if (!p.known) {
                return `<td class="${sp} none" title="${escHtml(w.oppName)} has no complete hit report, so this cannot be judged">`
                     + `<span class="x">${fmt(u)}</span> <span class="sep">/ ?</span>${plus}</td>`;
            }
            // An overdose outranks the flag. They took the Xanax and landed
            // nothing, but they were hospitalised — leaving the red warning on
            // would keep accusing someone the data has already explained.
            if (p.od) {
                return `<td class="${sp} excused" title="Overdosed during ${escHtml(w.oppName)} — an OD hospitalises you for hours and ends your war, so these ${fmt(u)} Xanax are excused rather than wasted">`
                     + `<span class="x">${fmt(u)}</span> <span class="sep">/</span> <span class="h">${fmt(p.hits)}</span><span class="od">OD</span>${plus}</td>`;
            }
            if (p.flagged) {
                return `<td class="${sp} flag" title="Swallowed ${fmt(u)} Xanax from the armoury and landed 0 hits vs ${escHtml(w.oppName)} — ${fmt(u)} wasted">`
                     + `<span class="x">${fmt(u)}</span> <span class="sep">/</span> <span class="h">0</span><span class="mk">⚠</span>${plus}</td>`;
            }
            const tip = p.stocker
                ? `${escHtml(r.name)} put more Xanax INTO the armoury than they took out — never flagged`
                : `${fmt(u)} swallowed · ${fmt(p.hits)} hits landed vs ${escHtml(w.oppName)}${tk ? ` · ${fmt(tk)} withdrawn, not charged` : ''}`;
            return `<td class="${sp}" title="${tip}">`
                 + `<span class="x">${fmt(u)}</span> `
                 + `<span class="sep">/</span> <span class="h">${fmt(p.hits)}</span>${plus}</td>`;
        };

        const table = !rows.length
            ? `<div class="twpr-warnbox">No member matches this filter. ${fmt(everyone.length)} member(s) have activity —
               set <b>Show</b> back to <b>Everyone</b> to see them.</div>`
            : `<div class="twpr-tablewrap">
            <table class="twpr">
              <thead>
              <tr class="twpr-grp">
                <th></th>
<th class="g-tot" colspan="9">Totals across ${fmt(s.wars.length)} war${s.wars.length === 1 ? '' : 's'}</th>
                <th class="g-war twpr-split" colspan="${cols.length}">Each war — Xanax swallowed / hits landed</th>
              </tr>
              <tr>
                <th title="Faction member [Torn ID]">Member</th>
                <th title="How many of the swept wars this member took Xanax in and landed ZERO hits. This is the column that matters — 2 or more is a pattern.">Wasted<br><span style="font-weight:400;color:#8b90a6;font-size:10px">wars</span></th>
                <th title="Energy that left the armoury and never became a war hit, expressed in Xanax. A Xanax is 250 energy and a hit costs 25, so one Xanax is worth TEN hits — someone who draws 10 and lands 5 has wasted 9.5 of them. Never negative: natural regen means an active fighter lands more than their Xanax paid for, and that surplus must not cancel out somebody else's waste.">Wasted<br><span style="font-weight:400;color:#ff8080;font-size:10px">Xanax</span></th>
                <th title="Waste an overdose excuses. An OD hospitalises you for hours and ends your war, so the Xanax swallowed before it was not squandered — the member was prevented from spending that energy. Shown separately rather than deleted, because “wasted 2, excused 15” and “wasted 17” are different conversations.">Excused<br><span style="font-weight:400;color:#9fc7ff;font-size:10px">overdose</span></th>
                <th title="Xanax this member SWALLOWED straight from the armoury. This is the figure waste and efficiency are measured on, because this energy certainly entered a body.">Used<br><span style="font-weight:400;color:#ffd479;font-size:10px">swallowed</span></th>
                <th title="Xanax moved out of the armoury into their own inventory, minus anything they put back. The log never mentions it again, so this is NOT counted as waste — they may be handing it out, holding it for the next war, or restocking. A large number here is a question, not a verdict.">Withdrew<br><span style="font-weight:400;color:#9fc7ff;font-size:10px">net, unspent</span></th>
                <th title="Total successful war hits across every swept war, from Torn's official reports">Hits<br><span style="font-weight:400;color:#7fe3a0;font-size:10px">total</span></th>
                <th title="Average hits per war this member actually appeared in — the fair comparison when people joined at different times">Avg<br><span style="font-weight:400;color:#8b90a6;font-size:10px">hits/war</span></th>
                <th title="Overdoses confirmed during the swept wars, for members who took Xanax and landed nothing. An OD hospitalises you for hours and ends your war — the most common innocent explanation. A dot means NOT CHECKED; it never means clean.">OD<br><span style="font-weight:400;color:#8b90a6;font-size:10px">during war</span></th>
                <th title="Hits landed per Xanax taken, available only when all wars with recorded member activity have hit counts. TEN is break-even — that is exactly what 250 energy buys. Below 10 they are not converting what they take; above 10 they are also fighting on natural regen, which is what you want to see.">Hits/Xan<br><span style="font-weight:400;color:#8b90a6;font-size:10px">10 = break-even</span></th>
                ${cols.map((w, i) => `<th class="twpr-wh${i === 0 ? ' twpr-split' : ''}" title="${escHtml(w.oppName)} — ${w.start ? new Date(w.start * 1000).toISOString().slice(0, 10) : 'date unknown'}${w.hitsSrc === 'none' ? ' · hit data unavailable' : ''}">
                    <span class="n" style="color:${hueOf(i)}">${escHtml(String(w.oppName).slice(0, 12))}</span>
                    <span class="d">${w.start ? new Date(w.start * 1000).toISOString().slice(5, 10).replace('-', '/') : '?'}${w.hitsSrc === 'none' ? ' ?' : ''}</span>
                    <span class="u"><span class="x" style="color:${hueOf(i)}">xan</span> / <span class="h">hits</span></span>
                  </th>`).join('')}
              </tr></thead>
              <tbody>${rows.map(r => {
                // "?" not "0" — see hitsKnown in buildSweep.
                const unk = `<span class="twpr-wcell none" title="No complete hit report is available for this member. This is unknown, not zero.">?</span>`;
                const incomplete = r.warsKnown < r.warsSeen;
                const marker = incomplete && r.warsKnown > 0 ? '*' : '';
                const coverage = marker ? ' - measured in ' + r.warsKnown + ' of ' + r.warsSeen + ' wars with hit data' : '';
                const flags = r.warsFlaggedNet ?? r.warsFlagged;
                const flagValue = !r.warsKnown ? '?' : flags ? flags + ' of ' + r.warsSeen + marker : marker ? '0*' : '-';
                const wasteValue = r.wasted == null ? '?' : r.wasted < 0.05 ? (marker ? '0*' : '-') : r.wasted.toFixed(1) + marker;
                return `<tr>
                <td><span class="twpr-name">${escHtml(r.name)}</span> <span class="twpr-id">[${escHtml(r.id || '?')}]</span></td>
                <td class="${flags ? (r.repeat ? 'twpr-repeat' : 'twpr-flag') : incomplete ? '' : 'twpr-ok'}"
                    title="${!r.warsKnown ? 'No hit data - zero-hit Xanax wars cannot be measured'
                      : (r.warsFlagged ? 'Took Xanax and landed nothing in ' + r.warsFlagged + ' war(s)'
                        + (r.warsExcused ? ' - ' + r.warsExcused + ' explained by an overdose' : '')
                        : 'No zero-hit Xanax wars recorded') + coverage}">${flagValue}${r.warsExcused ? ' <span style="color:#9fc7ff;font-size:10px">+' + r.warsExcused + ' OD</span>' : ''}</td>
                <td style="color:${marker && r.wasted < 0.05 ? '#ffd479' : wasteColor(r)};font-weight:${(r.wasted || 0) >= 1 ? 700 : 400}"
                    title="${r.wasted == null ? 'No hit data yet - waste cannot be measured'
                      : (r.wasted < 0.05 ? 'No unexcused Xanax waste measured'
                        : fmt(Math.round(r.wasted * ENERGY_PER_XANAX)) + ' energy from swallowed Xanax not converted into war hits'
                          + (r.worstWar ? ' - worst vs ' + escHtml(r.worstWar.opp) + ': ' + fmt(r.worstWar.drawn) + ' Xanax for ' + fmt(r.worstWar.hits) + ' hits' : '')) + coverage}">${wasteValue}</td>
                <td style="color:${(r.excused || 0) >= 0.05 ? '#9fc7ff' : '#4e5468'}"
                    title="${(r.excused || 0) >= 0.05
                      ? `${r.excused.toFixed(1)} Xanax not counted as waste because they overdosed`
                      : 'Nothing excused'}">${(r.excused || 0) >= 0.05 ? r.excused.toFixed(1) : '—'}</td>
                <td style="color:#ffd479;font-weight:700">${fmt(r.totalUsed)}</td>
                <td style="color:${r.unaccounted ? '#9fc7ff' : '#5c6178'}"
                    title="${r.unaccounted ? `${fmt(r.totalTaken)} withdrawn${r.totalDeposited ? `, ${fmt(r.totalDeposited)} deposited back` : ''} — whereabouts unknown, so not charged as waste` : 'Never moved stock into their own inventory'}">${r.unaccounted ? fmt(r.unaccounted) : '—'}</td>
                <td style="color:#7fe3a0">${r.hitsKnown ? fmt(r.totalHits) : unk}</td>
                <td>${r.avgHits == null ? unk : r.avgHits.toFixed(1)}</td>
                <td>${odCellSweep(r)}</td>
                <td style="color:${r.hitsPerXan == null ? '#5c6178' : r.hitsPerXan >= HITS_PER_XANAX ? '#7fe3a0' : r.hitsPerXan >= HITS_PER_XANAX / 2 ? '#ffd479' : '#ff8080'};font-weight:600"
                    title="${r.hitsPerXan == null ? '' : `${(r.hitsPerXan / HITS_PER_XANAX * 100).toFixed(0)}% of what their Xanax could have bought`}">${r.hitsPerXan == null ? (r.warsKnown === r.warsSeen ? '—' : unk) : r.hitsPerXan.toFixed(1)}</td>
                ${cols.map((w, i) => cell(r, w, i)).join('')}
              </tr>`; }).join('')}</tbody>
            </table>
          </div>`;

        const shownNote = `<div class="twpr-note">${sweepFilterLabel(rows.length, everyone.length)}
            Wars run oldest → newest, left to right. Exports follow this filter.</div>`;

        markTab('sweep', true, repeats > 0);
        const cnt = $('#twpr-sweep-count');
        if (cnt) cnt.textContent = `${fmt(rows.length)} of ${fmt(everyone.length)} shown`;
        const partialBox = partialWars.length
            ? `<div class="twpr-warnbox" role="status"><strong>Incomplete armoury scan.</strong>
                 Affected wars: ${partialWars.map(w => escHtml(w.oppName)).join(', ')}.
                 Xanax totals, rates and flags are provisional. Run the sweep again before relying on them.
                 Copy and Download are unavailable until the armoury scan completes.</div>`
            : '';
        box.innerHTML = runningBox + partialBox + kpis + repeatBox + caveatBox + legend + table + shownNote;
    }

    async function onSweepRun() {
        if (state.sweepRunning) return;
        const key = $('#twpr-key').value.trim();
        if (!key) { setStatus('Enter your API key first.', true); return; }
        if (!state.ctx || !state.wars || !state.wars.length) { setStatus('Load wars first.', true); return; }
        const wars = sweepSelection();
        if (!wars.length) { setStatus('Pick at least one war to sweep.', true); return; }

        const opts = {
            leadDays: Number($('#twpr-sweep-lead').value) || 0,
            tailHours: Number($('#twpr-sweep-tail').value) || 0,
            useCache: !!($('#twpr-sweep-cache') && $('#twpr-sweep-cache').checked),
        };

        const plan = planSweepWindows(wars, opts);
        if (plan.overlap) {
            state.sweep = null;
            state.sweepOd = null;
            renderSweep();
            setStatus(plan.overlap, true);
            return;
        }
        const btn = $('#twpr-sweep-run');
        const autoOd = !!$('#twpr-sweep-autood')?.checked;
        state.sweepRunning = true;
        if (btn) btn.disabled = true;
        try {
            renderSweep();
            const perWar = await sweepWars(key, state.ctx, plan.windows, opts, (i, n, war, msg) => {
                setStatus(`Sweeping war ${i}/${n} — vs ${war.oppName}: ${msg}`);
            });
            const nextSweep = buildSweep(perWar);
            nextSweep.meta = { leadDays: opts.leadDays, tailHours: opts.tailHours,
                               useCache: opts.useCache, at: Date.now() };
            let nextOd = null;

            // Only the flagged are checked, and only in wars that published
            // hits — see sweepOverdoses. Readings are cached permanently, so
            // this is nearly free after the first run.
            if (autoOd) {
                nextOd = await sweepOverdoses(key, perWar, (war, i, n, name) => {
                    setStatus(`Checking overdoses — vs ${war.oppName}: ${i}/${n} (${name})`);
                });
                applyOdExcuses(nextSweep, nextOd);
            }
            state.sweep = nextSweep;
            state.sweepOd = nextOd;
            const reused = perWar.filter(p => p.fromCache).length;
            const saved = perWar.filter(p => p.cachedNow).length;
            const odFound = state.sweepOd
                ? Object.values(state.sweepOd).filter(o => o.ods > 0).length : 0;
            const partials = perWar.filter(p => p.partial).length;
            setStatus(`Swept ${fmt(wars.length)} war(s)${reused ? ` — ${reused} reused from cache` : ''}` +
                      `${saved ? `, ${saved} newly cached (re-sweeping them is now free)` : ''}. ` +
                      `${fmt(state.sweep.repeats.length)} repeat offender(s), ${fmt(state.sweep.flaggedAny.length)} flagged at least once.` +
                      (state.sweepOd ? (odFound ? ' ' + odFound + ' member(s) overdosed.' : '') + ' ' + sweepOdCoverage() : '') +
                      (partials ? ` ${partials} war(s) pulled partially and were NOT cached — re-run to fill in.` : ''), partials > 0);
        } catch (e) {
            setStatus((e.message || 'Sweep failed.') + (state.sweep ? ' Still showing the previous sweep.' : ''), true);
        } finally {
            state.sweepRunning = false;
            if (btn) btn.disabled = false;
            renderSweep();
        }
    }

    /* ---------------- multi-war sweep: exports ---------------- */

    /**
     * Who overdosed, and in which war. Sorted worst first.
     *
     * "8 members overdosed" is not actionable; "Ashvile OD'd during Bravo
     * Company" is. The war is the closest thing to a timestamp Torn will give
     * us — the personalstats snapshot is daily, so the war window is the
     * resolution, and claiming an exact minute would be inventing precision.
     */
    function sweepOdCoverage() {
        if (!state.sweepOd) return 'Overdose checks were not run.';
        let checked = 0, unknown = 0, found = false;
        for (const result of Object.values(state.sweepOd)) {
            checked += result.checked; unknown += result.unknown; found ||= result.ods > 0;
        }
        if (!checked) return 'Overdose check: no eligible member-war checks.';
        if (unknown) return 'Overdose check incomplete: ' + unknown + ' of ' + checked +
            ' targeted member-war checks could not be determined.' + (found ? '' : ' No overdoses confirmed.');
        return 'Overdose check: ' + checked + ' targeted member-war ' + (checked === 1 ? 'check' : 'checks') +
            ' resolved.' + (found ? '' : ' No overdoses found among those checked.');
    }

    function sweepOdRollCall(s) {
        if (!s || !s.odMembers || !s.odMembers.length) return [];
        return s.odMembers.slice()
            .sort((a, b) => (b.excused || 0) - (a.excused || 0))
            .map(r => ({
                name: r.name, id: r.id, excused: r.excused || 0,
                wars: r.odWars.slice().sort((a, b) => (a.start || 0) - (b.start || 0)),
            }));
    }

    /** Plain text, no markup — the same lines feed a CSV and a chat message. */
    const stripTags = (h) => String(h).replace(/<[^>]+>/g, '');

    /**
     * Everything that shaped the numbers underneath.
     *
     * The waste model is in here deliberately: WastedXanax means nothing without
     * knowing a Xanax was priced at 250 energy and a hit at 25, and a
     * spreadsheet long outlives the panel that produced it.
     */
    function sweepSettingsLines() {
        const s = state.sweep;
        if (!s) return [];
        const m = s.meta || {};
        const rows = sweepVisible(s);
        const warNames = s.wars.slice()
            .sort((a, b) => (a.start || 0) - (b.start || 0))
            .map(w => `${w.start ? new Date(w.start * 1000).toISOString().slice(0, 10) : '?'} ${w.oppName}${w.hitsSrc === 'none' ? ' (hit data unavailable)' : ''}`);

        const out = [
            'Torn War Payout Report — multi-war drug sweep',
            `Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 16)} UTC`,
            `Wars swept (${s.wars.length}): ${warNames.join(' | ')}`,
        ];
        if (m.leadDays != null) out.push(`Drug window: ${m.leadDays}d build-up + the war + ${m.tailHours}h tail`);
        out.push("Hits: Torn's official war reports. Without a complete hit report, nobody in that war can be flagged.");
        out.push(`Waste model: 1 Xanax = ${ENERGY_PER_XANAX} energy, 1 hit = ${ENERGY_PER_HIT} energy, so break-even is ${HITS_PER_XANAX} hits per Xanax.`);
        out.push('Waste is charged on Xanax SWALLOWED only — withdrawals to inventory are listed separately and never counted as waste.');
        out.push(`Filter: ${stripTags(sweepFilterLabel(rows.length, s.list.length))}`);
        out.push(sweepOdCoverage());
        out.push('OD count: confirmed overdose wars only. Blank means unchecked or unknown, not zero.');
        return out;
    }

    // Exports follow the on-screen filter. A CSV that quietly contains people
    // the table was hiding is how a "these six wasted stock" message ends up
    // with forty names in the attachment.
    function buildSweepCsv() {
        const s = state.sweep;
        if (!s) return null;
        const cols = sweepWarCols(s);
        const visible = sweepVisible(s);
        if (!visible.length) return null;
        const head = ['Member', 'ID', 'WastedWars', 'WarsSeen', 'TotalXanaxOut', 'TotalHits',
                      'AvgHitsPerWar', 'HitsPerXanax', 'XanaxUsed', 'XanaxWithdrawnNet',
                      'WastedXanax', 'WastedEnergy', 'EfficiencyPct',
                      'ExcusedXanax', 'OverdoseWars', 'OverdosedIn'];
        for (const w of cols) {
            const label = `${w.start ? new Date(w.start * 1000).toISOString().slice(0, 10) : '?'} ${w.oppName}`;
            head.push(label + ' XanaxSwallowed', label + ' Hits');
        }
        // Metadata first, one quoted cell per row, then a blank line. Excel and
        // Sheets both read those as plain text rows and leave the table intact.
        const lines = sweepSettingsLines().map(l => csvCell(l.startsWith('Hits: ')
            ? l + ' Blank waste cells mean no hit data for the member. Numeric waste values are measured subtotals from wars with hit data; WastedWars counts flags before overdose adjustments.'
            : l));
        lines.push('');
        lines.push(head.map(csvCell).join(','));
        for (const r of visible) {
            // Blank, never 0, where hits are unknown — a spreadsheet cell reading
            // 0 is an assertion, and an empty one is an honest absence.
            const row = [r.name, r.id || '', r.warsKnown > 0 ? r.warsFlagged : '', r.warsSeen,
                         r.totalDrawn,
                         r.hitsKnown ? r.totalHits : '',
                         r.avgHits == null ? '' : r.avgHits.toFixed(1),
                         r.hitsPerXan == null ? '' : r.hitsPerXan.toFixed(2),
                         r.totalUsed, r.unaccounted,
                         r.wasted == null ? '' : r.wasted.toFixed(2),
                         r.wasted == null ? '' : Math.round(r.wasted * ENERGY_PER_XANAX),
                         r.efficiency == null ? '' : (r.efficiency * 100).toFixed(0),
                         (r.excused || 0) >= 0.05 ? r.excused.toFixed(2) : '',
                         r.odWars?.length || (state.sweepOd?.[r.id] && !state.sweepOd[r.id].unknown ? 0 : ''),
                         // Blank when unchecked — an empty cell is an absence,
                         // where "none" would be a claim nobody verified.
                         !state.sweepOd ? '' : (r.odWars || []).map(x =>
                             x.opp + (x.start ? ' ' + new Date(x.start * 1000).toISOString().slice(0, 10) : '')).join('; ')];
            for (const w of cols) {
                const p = r.per[w.warId];
                row.push(p ? (p.used != null ? p.used : p.drawn) : '');
                // Blank, not 0 — an unknown-hits war must not export as "landed nothing".
                row.push(p ? (p.known ? p.hits : '') : '');
            }
            lines.push(row.map(csvCell).join(','));
        }
        return { text: lines.join('\r\n'), rows: visible.length };
    }

    function sweepDiscordWasteCell(r) {
        if (r.wasted == null) return '?';
        const partial = r.warsKnown < r.warsSeen;
        const value = r.wasted < 0.05 ? (partial ? '0' : '-') : r.wasted.toFixed(1);
        return value + (partial ? '*' : '');
    }

    function sweepDiscordWasteLegend(rows) {
        if (!rows.some(r => r.warsKnown < r.warsSeen)) return '';
        const tick = String.fromCharCode(96);
        return '_Wasted: ' + tick + '*' + tick + ' = waste subtotal from wars with hit data; '
            + tick + '?' + tick + ' = no hit data._\n';
    }

    // ASCII only inside the block: Discord's monospace font renders emoji at
    // double width, which shears every column to their right out of alignment.
    function buildSweepDiscord() {
        const s = state.sweep;
        if (!s) return null;
        const rows = sweepVisible(s);
        if (!rows.length) return null;

        // Spelled out, not abbreviated. This gets pasted into faction chat
        // where nobody has the legend in front of them.
        const headers = ['Player', 'Wasted', 'Xanax', 'Hits', 'Hits/Xan'];
        const body = rows.map(r => [
            r.name,
            sweepDiscordWasteCell(r),
            // Swallowed — the key below says "charged on Xanax swallowed only",
            // and this column printing drawn made the table contradict its own
            // caption. A "+" marks members who also withdrew stock.
            String(r.totalUsed) + (r.unaccounted > 0 ? '+' : ''),
            r.hitsKnown ? String(r.totalHits) : '?',
            r.hitsPerXan == null ? (r.warsKnown === r.warsSeen ? '-' : '?') : r.hitsPerXan.toFixed(1),
        ]);
        const w = headers.map((_, i) => Math.max(...[headers, ...body].map(row => row[i].length)));
        const line = (row) => row.map((c, i) =>
            i === 0 ? c.padEnd(w[i]) : c.padStart(w[i])).join('  ').replace(/\s+$/, '');

        const span = `${s.wars.length} war${s.wars.length === 1 ? '' : 's'}`;
        const head = `**Multi-war drug sweep — ${span}**\n`
            + `${fmt(s.totalUsed)} Xanax swallowed${s.totalUnaccounted ? ` (+${fmt(s.totalUnaccounted)} withdrawn as stock, not charged)` : ''}, ${sweepHitSummary(s).description}`
            + (s.totalUsed && !s.unknownWars.length ? ` (${(s.totalHits / s.totalUsed).toFixed(2)} hits per Xanax swallowed)` : '') + '.\n'
            + (s.repeats.length
                ? `:warning: ${s.repeats.length} member${s.repeats.length === 1 ? '' : 's'} took stock and landed nothing in 2+ wars.\n`
                : (s.flaggedAny.length ? `${s.flaggedAny.length} flagged in a single war; no repeat offenders.\n` : s.list.some(r => r.warsExcused > 0) ? 'No flags remain after overdose adjustments.\n' : 'Nobody was flagged.\n'))
            + (s.unknownWars.length ? `_${s.unknownWars.length} war(s) had no hit data yet and cannot flag anyone._\n` : '')
            // Say what the block IS. A filtered table pasted without this reads
            // as the whole faction, and names an innocent majority by omission.
            + `_Wasted = Xanax whose energy never became a hit (1 Xanax = ${ENERGY_PER_XANAX} E = ${HITS_PER_XANAX} hits), charged on Xanax swallowed only; a ${String.fromCharCode(96)}+${String.fromCharCode(96)} means they also withdrew stock (not charged). Hits/Xan: ${HITS_PER_XANAX} is break-even._\n`
            + sweepDiscordWasteLegend(rows)
            + `_${stripTags(sweepFilterLabel(rows.length, s.list.length))}${state.sweepOd ? '' : ' Overdoses not checked.'}_\n`;

        // Who overdosed, and where. This is the half the table cannot show:
        // the column says "1", this says which war it was.
        const roll = sweepOdRollCall(s);
        const odBlock = roll.length
            ? '\n**Overdosed during a war** — their Xanax that war is excused, not wasted:\n'
              + roll.slice(0, 15).map(r =>
                  '\u2022 ' + r.name + ' — ' + r.wars.map(x =>
                      x.opp + (x.start ? ' ' + new Date(x.start * 1000).toISOString().slice(5, 10) : '')
                      + (x.ods > 1 ? ' (x' + x.ods + ')' : '')).join(', ')
                  + (r.excused >= 0.05 ? ' [' + r.excused.toFixed(1) + ' Xanax excused]' : '')).join('\n')
              + (roll.length > 15 ? '\n\u2026 +' + (roll.length - 15) + ' more' : '') + '\n'
            : '';

        // 2000 chars is a hard cap, so chunk on ROW boundaries and repeat the
        // header — a table split mid-row is worse than two tables.
        const LIMIT = 1900;
        const chunks = [];
        const rule = w.map(n => '-'.repeat(n)).join('  ');
        const tableOverhead = line(headers).length + rule.length + 9;
        let cur = [], curLen = head.length + tableOverhead;
        for (const r of body) {
            const l = line(r);
            if (curLen + l.length + 1 > LIMIT && cur.length) {
                chunks.push(cur); cur = []; curLen = tableOverhead;
            }
            cur.push(l); curLen += l.length + 1;
        }
        if (cur.length) chunks.push(cur);

        const text = chunks.map((c, i) =>
            (i === 0 ? head : '') + '```\n' + [line(headers), rule, ...c].join('\n') + '\n```'
        ).join('\n\n') + odBlock + (state.sweepOd ? '\n_' + sweepOdCoverage() + '_\n' : '');
        return { text, rows: rows.length, messages: chunks.length };
    }

    /**
     * Per-war totals, folded out of the member rows.
     *
     * "1,119 Xanax across five wars" hides WHICH war went wrong. One war can
     * account for most of a faction's waste and the aggregate will never say so.
     */
    function sweepWarSummary(s) {
        return sweepWarCols(s).map(w => {
            let used = 0, hits = 0, wasted = 0, flagged = 0, took = 0, withdrew = 0;
            for (const r of s.list) {
                const p = r.per[w.warId];
                if (!p) continue;
                const u = p.used != null ? p.used : p.drawn;
                used += u;
                withdrew += (p.taken || 0);
                if (u > 0) took++;
                if (!p.known) continue;
                hits += p.hits;
                wasted += asXanax(wastedEnergy(u, p.hits));
                if (p.flagged) flagged++;
            }
            return { ...w, used, hits, wasted, flagged, took, withdrew,
                     hitsPerXan: w.hitsSrc !== 'none' && used > 0 ? hits / used : null };
        });
    }

    /** Four letters of an opponent's name, kept unique across the swept wars. */
    function shortWarKeys(wars) {
        const seen = {}, out = [];
        for (const w of wars) {
            const base = String(w.oppName || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 4) || 'War';
            let key = base, n = 2;
            while (seen[key]) key = base.slice(0, 3) + (n++);
            seen[key] = 1;
            out.push(key);
        }
        return out;
    }

    /**
     * Discord, with the per-war grid.
     *
     * ASCII only inside the block, as always: Discord renders emoji at double
     * width in its monospace font, so a single warning triangle shears every
     * column to its right out of alignment. A trailing "!" costs one cell and
     * actually lines up.
     */
    function buildSweepDiscordFull() {
        const s = state.sweep;
        if (!s) return null;
        const rows = sweepVisible(s);
        if (!rows.length) return null;
        const wars = sweepWarCols(s);
        const keys = shortWarKeys(wars);
        const TICK = String.fromCharCode(96);
        const FENCE = TICK + TICK + TICK;

        const cell = (r, w) => {
            const p = r.per[w.warId];
            if (!p) return '-';
            // Swallowed, never "drawn" — a withdrawal is stock movement, and
            // charging it made the faction's supplier look like its worst
            // offender. A "+" marks that they also moved stock.
            const u = p.used != null ? p.used : p.drawn;
            const plus = (p.taken || 0) > 0 ? '+' : '';
            if (!p.known) return u + '/?' + plus;
            // "od" beats "!" — an overdose explains the zero, so the row must
            // not still read as an accusation.
            if (p.od) return u + '/' + p.hits + 'od';
            return u + '/' + p.hits + (p.flagged ? '!' : plus);
        };
        const headers = ['Player', 'Wast', 'Excu', 'OD', 'Xan', 'Hits', 'H/X', ...keys];
        const body = rows.map(r => [
            r.name,
            sweepDiscordWasteCell(r),
            (r.excused || 0) >= 0.05 ? r.excused.toFixed(1) : '-',
            r.odWars?.length ? String(r.odWars.length) : !state.sweepOd?.[r.id] ? '.' : state.sweepOd[r.id].unknown ? '?' : '-',
            String(r.totalUsed),
            r.hitsKnown ? String(r.totalHits) : '?',
            r.hitsPerXan == null ? (r.warsKnown === r.warsSeen ? '-' : '?') : r.hitsPerXan.toFixed(1),
            ...wars.map(w => cell(r, w)),
        ]);
        const w = headers.map((_, i) => Math.max(...[headers, ...body].map(row => row[i].length)));
        const line = (row) => row.map((c, i) => i === 0 ? c.padEnd(w[i]) : c.padStart(w[i])).join('  ').replace(/\s+$/, '');
        const rule = w.map(n => '-'.repeat(n)).join('  ');

        // Abbreviated columns are useless without this key — it is the only
        // place the reader learns which war is which.
        const legend = wars.map((x, i) =>
            keys[i] + '=' + x.oppName
            + (x.start ? ' ' + new Date(x.start * 1000).toISOString().slice(5, 10) : '')
            + (x.hitsSrc === 'none' ? ' ?' : '')).join(' | ');

        const head = '**Multi-war drug sweep — ' + s.wars.length + ' war' + (s.wars.length === 1 ? '' : 's') + '**\n'
            + fmt(s.totalUsed) + ' Xanax swallowed, ' + sweepHitSummary(s).description + ', **'
            + sweepWasteSummary(s).description + '**'
            + ((s.totalExcused || 0) >= 0.5
                ? ' (a further ' + s.totalExcused.toFixed(0) + ' excused — those members overdosed)' : '')
            + '.\n'
            + (s.repeats.length
                ? ':warning: ' + s.repeats.length + ' member' + (s.repeats.length === 1 ? '' : 's')
                  + ' took stock and landed nothing in 2+ wars.\n' : '')
            + '_Each war cell is Xanax swallowed/hits. ' + TICK + '+' + TICK + ' = also withdrew stock (not charged). '
            + TICK + '!' + TICK + ' = swallowed Xanax, landed nothing. '
            + TICK + 'od' + TICK + ' = overdosed, so that war is excused. '
            + TICK + '-' + TICK + ' = not in that war. ' + TICK + '/?' + TICK + ' = hit data unavailable._\n'
            + '_OD: . = not checked; ? = unknown; - = none found in the checks performed._\n'
            + '_Wars: ' + legend + '_\n'
            + '_Wasted = energy that never became a hit (1 Xanax = ' + ENERGY_PER_XANAX + ' E = '
            + HITS_PER_XANAX + ' hits), charged on Xanax swallowed only. H/X: ' + HITS_PER_XANAX + ' is break-even; ? = incomplete hit data, - = no Xanax swallowed._\n'
            + sweepDiscordWasteLegend(rows)
            + '_' + stripTags(sweepFilterLabel(rows.length, s.list.length))
            + (state.sweepOd ? '' : ' Overdoses not checked.') + '_\n';

        // Who overdosed, and where. This is the half the table cannot show:
        // the column says "1", this says which war it was.
        const roll = sweepOdRollCall(s);
        const odBlock = roll.length
            ? '\n**Overdosed during a war** — their Xanax that war is excused, not wasted:\n'
              + roll.slice(0, 15).map(r =>
                  '\u2022 ' + r.name + ' — ' + r.wars.map(x =>
                      x.opp + (x.start ? ' ' + new Date(x.start * 1000).toISOString().slice(5, 10) : '')
                      + (x.ods > 1 ? ' (x' + x.ods + ')' : '')).join(', ')
                  + (r.excused >= 0.05 ? ' [' + r.excused.toFixed(1) + ' Xanax excused]' : '')).join('\n')
              + (roll.length > 15 ? '\n\u2026 +' + (roll.length - 15) + ' more' : '') + '\n'
            : '';

        // 2000 chars is a hard cap, so chunk on ROW boundaries and repeat the
        // header — a table split mid-row is worse than two tables.
        const LIMIT = 1900;
        const chunks = [];
        let cur = [], curLen = head.length + line(headers).length + rule.length + 12;
        for (const r of body) {
            const l = line(r);
            if (curLen + l.length + 1 > LIMIT && cur.length) {
                chunks.push(cur); cur = []; curLen = line(headers).length + rule.length + 12;
            }
            cur.push(l); curLen += l.length + 1;
        }
        if (cur.length) chunks.push(cur);

        const text = chunks.map((c, i) =>
            (i === 0 ? head : '') + FENCE + '\n' + [line(headers), rule, ...c].join('\n') + '\n' + FENCE
        ).join('\n\n') + odBlock + (state.sweepOd ? '\n_' + sweepOdCoverage() + '_\n' : '');
        return { text, rows: rows.length, messages: chunks.length };
    }

    /**
     * A standalone, INTERACTIVE HTML report.
     *
     * Two deliberate departures from the other exports:
     *
     *   · It carries EVERY member, never the on-screen filter. A filtered file
     *     is the one that misleads — the reader cannot tell what was left out.
     *     Shipping the lot and letting them filter in the page makes the
     *     omission impossible. The panel's current filter is applied as the
     *     starting view, so it opens on what you were looking at.
     *
     *   · It contains script. Everything else here is inert markup, but a
     *     filter that cannot filter is a screenshot. The rule that actually
     *     matters is unchanged: NOTHING is fetched. No CDN, no webfont, no
     *     analytics — the data is embedded, so it works offline, from an email
     *     attachment, on a machine with no network, years from now.
     */
    function buildSweepHtml() {
        const s = state.sweep;
        if (!s || !s.list || !s.list.length) return null;
        const wars = sweepWarCols(s);
        const warSum = sweepWarSummary(s);
        const hue = (i) => SWEEP_HUES[i % SWEEP_HUES.length];
        const e = (t) => String(t == null ? '' : t)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        // Embedded JSON must never be able to close the script tag that holds
        // it — a member called </script> would otherwise end the block and
        // dump the rest of the payload into the document as markup.
        const json = (v) => JSON.stringify(v)
            .replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
            .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

        const data = {
            generated: new Date().toISOString(),
            energyPerXanax: ENERGY_PER_XANAX,
            energyPerHit: ENERGY_PER_HIT,
            breakEven: HITS_PER_XANAX,
            odChecked: !!state.sweepOd,
            filter: {
                mode: ($('#twpr-sweep-show') || {}).value || 'all',
                thresh: Number(($('#twpr-sweep-thresh') || {}).value) || 0,
                basis: ($('#twpr-sweep-basis') || {}).value || 'total',
                onlyTook: !!($('#twpr-sweep-onlytook') || {}).checked,
                hideOd: !!($('#twpr-sweep-hideod') || {}).checked,
            },
            settings: sweepSettingsLines(),
            wars: wars.map((w, i) => ({
                id: w.warId, opp: w.oppName, hue: hue(i),
                date: w.start ? new Date(w.start * 1000).toISOString().slice(0, 10) : '',
                live: w.hitsSrc === 'none',
            })),
            warSummary: warSum.map(w => ({
                id: w.warId, opp: w.oppName,
                date: w.start ? new Date(w.start * 1000).toISOString().slice(0, 10) : '',
                live: w.hitsSrc === 'none',
                took: w.took, used: w.used, hits: w.hits, wasted: w.wasted, flagged: w.flagged,
                hitsPerXan: w.hitsPerXan,
            })),
            members: s.list.map(r => ({
                id: r.id, name: r.name,
                used: r.totalUsed, withdrew: r.unaccounted, hits: r.totalHits,
                hitsKnown: r.hitsKnown, hitsPerXan: r.hitsPerXan,
                avg: r.avgHits, wasted: r.wasted, excused: r.excused || 0,
                warsSeen: r.warsSeen, warsKnown: r.warsKnown,
                flagged: r.warsFlaggedNet != null ? r.warsFlaggedNet : r.warsFlagged,
                excusedWars: r.warsExcused || 0,
                repeat: !!r.repeat,
                odEvidence: !state.sweepOd?.[r.id] ? 'unchecked' : state.sweepOd[r.id].unknown ? 'unknown' : 'resolved',
                odWars: (r.odWars || []).map(x => ({
                    opp: x.opp, ods: x.ods,
                    date: x.start ? new Date(x.start * 1000).toISOString().slice(0, 10) : '',
                })),
                per: Object.fromEntries(Object.entries(r.per).map(([k, p]) => [k, {
                    // u = swallowed (judged), t = withdrawn (reported only).
                    u: p.used != null ? p.used : p.drawn, t: p.taken || 0,
                    h: p.hits, k: p.known, f: !!p.flagged, od: p.od || 0,
                }])),
            })),
        };

        data.generated = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

        const hits = sweepHitSummary(s);
        const waste = sweepWasteSummary(s, hits);
        const totals = {
            used: s.totalUsed, hits: s.totalHits, wasted: s.totalWasted,
            excused: s.totalExcused || 0, unaccounted: s.totalUnaccounted,
            repeats: s.repeats.length, wars: s.wars.length,
        };

        const STYLE = [
            '*{box-sizing:border-box}',
            'body{margin:0;padding:22px;background:#12141f;color:#c7cbe0;',
            'font:14px/1.55 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-variant-numeric:tabular-nums}',
            'h1{font-size:21px;margin:0 0 4px;color:#fff}',
            '.sub{color:#8b90a6;font-size:13px;margin-bottom:18px}',
            '.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(152px,1fr));gap:10px;margin-bottom:18px}',
            '.kpi{background:#191c2b;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:11px 14px}',
            '.kpi .k{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#8b90a6}',
            '.kpi .v{font-size:23px;font-weight:700;line-height:1.15;margin-top:2px}',
            '.kpi .s{font-size:11px;color:#8b90a6}',
            'h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#9fc7ff;margin:22px 0 9px}',
            '.wrap{overflow-x:auto;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:#191c2b}',
            'table{width:100%;border-collapse:collapse;font-size:12.5px}',
            'th{padding:9px 10px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.05em;',
            'color:#8b90a6;background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.1);',
            'white-space:nowrap;position:sticky;top:0;cursor:pointer;user-select:none}',
            'th:hover{color:#e9ecf5}th.sorted{color:#9fc7ff}',
            'th:first-child,td:first-child{text-align:left}',
            'td{padding:8px 10px;text-align:right;border-bottom:1px solid rgba(255,255,255,.05);white-space:nowrap}',
            'tr:last-child td{border-bottom:none}',
            'tr:nth-child(even) td{background:rgba(255,255,255,.022)}',
            'td.flag{background:rgba(255,120,120,.15)}',
            'td.excused{background:rgba(127,180,255,.13)}',
            'td.none{color:#4e5468}',
            '.sep{color:#5c6178;margin:0 2px}.mk{color:#ff8080;font-size:10px;margin-left:3px}',
            '.od{color:#9fc7ff;font-size:9.5px;font-weight:700;margin-left:3px}',
            '.tk{color:#7f8aa3;font-size:10px}',
            '.nm{color:#fff;font-weight:600}.id{color:#6a7080;font-size:11px}',
            '.note{font-size:12px;color:#8b90a6;line-height:1.7;margin:12px 0 0}',
            '.bar{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;background:#191c2b;',
            'border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:12px 14px;margin-bottom:14px}',
            '.f{display:flex;flex-direction:column;gap:4px}',
            '.f label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8b90a6}',
            '.f select,.f input[type=text],.f input[type=number]{background:#12141f;color:#e9ecf5;',
            'border:1px solid rgba(255,255,255,.16);border-radius:7px;padding:7px 9px;font:inherit;font-size:13px}',
            '.f select option{background:#1b1f2e;color:#e9ecf5}',
            '.chk{display:flex;align-items:center;gap:6px;font-size:12px;color:#c7cbe0;white-space:nowrap}',
            '.count{margin-left:auto;font-size:12px;color:#8b90a6;align-self:center}',
            '.pdf{background:#2b3a5c;color:#dce6ff;border:1px solid rgba(159,199,255,.45);',
            'border-radius:8px;padding:9px 15px;font:inherit;font-size:13px;font-weight:600;',
            'cursor:pointer;margin:0 0 18px}',
            '.pdf:hover{background:#374a75;color:#fff}',
            // Only ever shown on paper: a printed copy carries whatever filter
            // was active, so it must say so where the HTML's "contains
            // everyone" note would otherwise be read as covering the PDF too.
            '.pline{display:none;font-size:11px;color:#333;border:1px solid #bbb;',
            'border-radius:6px;padding:7px 9px;margin:0 0 12px;background:#f4f4f4}',
            'details{margin-top:16px;background:#191c2b;border:1px solid rgba(255,255,255,.1);',
            'border-radius:10px;padding:11px 14px}',
            'summary{cursor:pointer;font-size:12px;color:#9fc7ff}',
            'details ul{margin:9px 0 0;padding-left:18px;font-size:12px;color:#8b90a6;line-height:1.7}',
            // Landscape by default — the per-war grid grows a column per war and
            // portrait clips it. The print dialog can still override this.
            '@page{size:A4 landscape;margin:9mm}',
            '@media print{',
            // Colour is not decoration in this report: red means landed nothing,
            // blue means overdosed. Browsers drop backgrounds when printing
            // unless told otherwise, which would silently erase the verdict.
            'body{background:#fff;color:#1a1a1a;padding:0;font-size:11px;',
            '-webkit-print-color-adjust:exact;print-color-adjust:exact}',
            'h1{color:#000;font-size:17px}',
            'h2{color:#1c4a86;margin:14px 0 6px;break-after:avoid;page-break-after:avoid}',
            '.sub{color:#555;margin-bottom:10px}',
            '.kpis{grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:12px;',
            'break-inside:avoid;page-break-inside:avoid}',
            '.kpi{background:#fff;border-color:#bbb;padding:7px 9px}',
            '.kpi .v{font-size:16px}.kpi .k,.kpi .s{color:#555}',
            // Horizontal scrolling is meaningless on paper; let the table size
            // to the sheet instead of being cropped at the viewport width.
            '.wrap{overflow:visible;background:#fff;border-color:#bbb}',
            'table{font-size:9.5px}',
            // Repeat the header on every sheet and never split a member's row.
            'thead{display:table-header-group}',
            'tr{break-inside:avoid;page-break-inside:avoid}',
            'th{position:static;background:#eee;color:#222;padding:5px 6px;',
            'border-bottom:1px solid #999;cursor:default}',
            'td{padding:4px 6px;border-bottom:1px solid #e4e4e4}',
            'tr:nth-child(even) td{background:#f7f7f7}',
            'td.flag{background:#ffdcdc}td.excused{background:#dbe9ff}td.none{color:#999}',
            '.nm{color:#000}.id{color:#777}.sep{color:#999}.tk{color:#666}',
            '.note{color:#444;font-size:9px;line-height:1.5}',
            '.bar,.pdf{display:none!important}',
            '.pline{display:block!important}',
            // Provenance belongs in anything sent to leadership, so the
            // methodology is forced open — iOS Safari never fires beforeprint,
            // so CSS has to do it rather than script.
            'details{background:#fff;border-color:#bbb;break-inside:avoid}',
            'details>ul{display:block!important;content-visibility:visible!important}',
            'details ul{color:#444}summary{color:#1c4a86}',
            '}',
        ].join('');

        // The in-page runtime. Same filter semantics as the panel, including
        // the refusals: a member with no hit data can never be caught by a
        // filter that accuses them of not fighting.
        const SCRIPT = [
            'var D=window.__SWEEP__,T=window.__TOTALS__;',
            'var $=function(i){return document.getElementById(i)};',
            'var esc=function(t){return String(t==null?"":t).replace(/[&<>"]/g,function(c){',
            'return{"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]})};',
            'var fmt=function(n){return Number(n||0).toLocaleString("en-US")};',
            'var sortKey="wasted",sortDir=-1;',
            'function wasteCol(v){return v==null?"#4e5468":v<0.05?"#7fe3a0":v<3?"#ffd479":"#ff8080"}',
            'function visible(){',
            ' var mode=$("f-show").value,th=Number($("f-thresh").value)||0,basis=$("f-basis").value;',
            ' var only=$("f-took").checked,hide=$("f-od").checked,q=$("f-q").value.trim().toLowerCase();',
            ' return D.members.filter(function(r){',
            '  if(!(r.used>0||r.hits>0||r.withdrew>0))return false;',
            '  if(q&&r.name.toLowerCase().indexOf(q)<0&&String(r.id).indexOf(q)<0)return false;',
            '  if(only&&!(r.used>0))return false;',
            '  if(hide&&r.odWars.length)return false;',
            '  if(mode==="took")return r.used>0;',
            '  if(mode==="flagged")return r.flagged>0;',
            '  if(mode==="repeat")return r.repeat;',
            '  if(mode==="od")return r.odWars.length>0;',
            // Unknown hits must never be filtered as if they were zero.
            '  if(mode==="zero")return r.warsKnown>0&&r.warsKnown===r.warsSeen&&r.hits===0;',
            '  if(mode==="under"){if(r.warsKnown<=0||r.warsKnown!==r.warsSeen)return false;',
            '   var v=basis==="avg"?r.avg:r.hits;return v<th}',
            '  if(mode==="waste"){if(r.wasted==null)return false;',
            '   var w=basis==="avg"?(r.warsKnown?r.wasted/r.warsKnown:0):r.wasted;return w>th}',
            '  return true})}',
            'function label(n,t){',
            ' var m=$("f-show").value,th=Number($("f-thresh").value)||0,b=$("f-basis").value;',
            ' var w={all:"everyone with drug or hit activity",took:"members who took faction Xanax",',
            '  zero:"members with confirmed zero hits in all recorded wars",',
            '  under:"members under "+fmt(th)+(b==="avg"?" hits per war on average":" total hits")+" with complete recorded hit counts",',
            '  waste:"members who wasted more than "+fmt(th)+" Xanax"+(b==="avg"?" per war":" in total"),',
            '  flagged:"members who took Xanax and landed nothing in a war",',
            '  repeat:"repeat offenders — two or more such wars",',
            '  od:"members with a confirmed overdose"}[m];',
            ' return "Showing <b>"+fmt(n)+"</b> of "+fmt(t)+" — "+w',
            '  +($("f-took").checked&&m!=="took"?", and only those who took Xanax":"")',
            '  +($("f-od").checked?", excluding confirmed overdoses":"")+"."}',
            // Cells report Xanax SWALLOWED. A withdrawal is stock movement —
            // the quartermaster hands it out — so it is shown as "+N" and never
            // charged as waste.
            'function cell(r,w){var p=r.per[w.id];',
            ' if(!p)return \'<td class="none" title="Not in this war">\\u2013</td>\';',
            ' var plus=p.t?\' <span class="tk" title="Also withdrew \'+fmt(p.t)',
            '  +\' into their own inventory — not counted as waste">+\'+fmt(p.t)+\'</span>\':"";',
            ' if(!p.k)return \'<td class="none" title="War hit data unavailable">\'+fmt(p.u)',
            '  +\' <span class="sep">/ ?</span>\'+plus+\'</td>\';',
            ' if(p.od)return \'<td class="excused" title="Overdosed during \'+esc(w.opp)',
            '  +\' — these Xanax are excused, not wasted">\'+fmt(p.u)+\'<span class="sep">/</span>\'',
            '  +fmt(p.h)+\'<span class="od">OD</span>\'+plus+\'</td>\';',
            ' var waste=Math.max(0,p.u*D.energyPerXanax-p.h*D.energyPerHit)/D.energyPerXanax;',
            ' return \'<td class="\'+(p.f?"flag":"")+\'" title="\'+fmt(p.u)+\' swallowed, \'+fmt(p.h)+\' hits\'',
            '  +(waste>=0.05?" — "+waste.toFixed(1)+" wasted":"")+(p.t?" · "+fmt(p.t)+" withdrawn, not charged":"")+\'">\'',
            '  +\'<b style="color:\'+(p.f?"#ff8080":"#ffd479")+\'">\'+fmt(p.u)+\'</b><span class="sep">/</span>\'',
            '  +\'<span style="color:\'+(p.h?"#7fe3a0":"#ff8080")+\'">\'+fmt(p.h)+\'</span>\'',
            '  +(p.f?\'<span class="mk">!</span>\':"")+plus+\'</td>\'}',
            'function odCell(r){',
            ' if(r.odEvidence==="unchecked")return \'<td class="none" title="Overdoses were not checked — this is not the same as clean">\\u00b7</td>\';',
            ' if(!r.odWars.length&&r.odEvidence==="unknown")return \'<td title="No usable reading" style="color:#ffd479">?</td>\';',
            ' if(!r.odWars.length)return \'<td style="color:#7fe3a0" title="No overdose found in the targeted checks performed">none found</td>\';',
            ' var w=r.odWars.map(function(x){return x.opp+(x.date?" "+x.date.slice(5):"")',
            '  +(x.ods>1?" \\u00d7"+x.ods:"")}).join(", ");',
            ' return \'<td style="color:#ff8080;font-weight:700" title="Overdosed during \'+esc(w)+\'">\'+esc(w)+\'</td>\'}',
            'function render(){',
            ' var rows=visible().slice();',
            ' rows.sort(function(a,b){var x=a[sortKey],y=b[sortKey];',
            '  if(sortKey==="name")return String(x).localeCompare(String(y))*sortDir;',
            '  if(sortKey==="hits"){x=a.hitsKnown?x:null;y=b.hitsKnown?y:null;}if(x==null)return y==null?0:1;if(y==null)return -1;return((x-y)||0)*sortDir});',
            ' $("count").innerHTML=label(rows.length,D.members.length);',
            // Written on every render, not on beforeprint: iOS Safari prints
            // without ever firing that event, and a PDF that silently dropped
            // rows while quoting "every member included" would be a lie.
            ' var pl=$("pline");',
            ' if(pl)pl.innerHTML=(rows.length===D.members.length',
            '  ?"<b>Complete report.</b> All "+fmt(D.members.length)+" members are included. "',
            '  :"<b>Filtered copy \u2014 not the full roster.</b> ")',
            '  +label(rows.length,D.members.length)',
            '  +" Generated "+D.generated+".";',
            ' $("tbody").innerHTML=rows.map(function(r){',
            '  var incomplete=r.warsKnown<r.warsSeen,marker=incomplete&&r.warsKnown>0?"*":"";',
            '  var title=!r.warsKnown?\' title="No hit data for this member; waste is unknown."\':marker?\' title="Measured in \'+fmt(r.warsKnown)+" of "+fmt(r.warsSeen)+\' wars with hit data"\':"";',
            '  return "<tr>"',
            '  +\'<td><span class="nm">\'+esc(r.name)+\'</span> <span class="id">[\'+esc(r.id||"?")+\']</span></td>\'',
            '  +\'<td\'+title+\' style="color:\'+(r.flagged?(r.repeat?"#ff7a7a":"#ffb37a"):incomplete?"#8b90a6":"#7fe3a0")+\'">\'',
            '   +(!r.warsKnown?"?":r.flagged?r.flagged+" of "+r.warsSeen+marker:marker?"0*":"\\u2014")',
            '   +(r.excusedWars?\' <span style="color:#9fc7ff;font-size:10px">+\'+r.excusedWars+" OD</span>":"")+"</td>"',
            '  +\'<td\'+title+\' style="color:\'+(marker&&r.wasted<0.05?"#8b90a6":wasteCol(r.wasted))+\';font-weight:700">\'',
            '   +(r.wasted==null?"?":r.wasted<0.05?(marker?"0*":"\\u2014"):r.wasted.toFixed(1)+marker)+"</td>"',
            '  +\'<td style="color:\'+(r.excused>=0.05?"#9fc7ff":"#4e5468")+\'">\'',
            '   +(r.excused>=0.05?r.excused.toFixed(1):"\\u2014")+"</td>"',
            '  +\'<td style="color:#ffd479">\'+fmt(r.used)+"</td>"',
            '  +\'<td style="color:\'+(r.withdrew?"#9fc7ff":"#4e5468")+\'">\'+(r.withdrew?fmt(r.withdrew):"\\u2014")+"</td>"',
            '  +\'<td style="color:#7fe3a0">\'+(r.hitsKnown?fmt(r.hits):"?")+"</td>"',
            '  +\'<td style="color:\'+(r.hitsPerXan==null?"#4e5468":r.hitsPerXan>=D.breakEven?"#7fe3a0"',
            '   :r.hitsPerXan>=D.breakEven/2?"#ffd479":"#ff8080")+\'">\'',
            '   +(r.hitsPerXan==null?(r.warsKnown===r.warsSeen?"\\u2014":"?"):r.hitsPerXan.toFixed(1))+"</td>"',
            '  +odCell(r)',
            '  +D.wars.map(function(w){return cell(r,w)}).join("")+"</tr>"}).join("")||',
            '  \'<tr><td colspan="\'+(9+D.wars.length)+\'" style="text-align:center;color:#8b90a6;padding:26px">\'',
            '  +"No member matches this filter.</td></tr>"}',
            'function sortBy(k){if(sortKey===k)sortDir=-sortDir;else{sortKey=k;sortDir=k==="name"?1:-1}',
            ' var th=document.querySelectorAll("#mtable th");',
            ' for(var i=0;i<th.length;i++)th[i].className=th[i].dataset.k===k?"sorted":"";render()}',
            'window.addEventListener("DOMContentLoaded",function(){',
            ' var pb=$("btn-pdf");',
            ' if(pb)pb.onclick=function(){window.print()};',
            // Desktop belt-and-braces for the methodology block; the print CSS
            // above is what actually carries mobile.
            ' if(window.matchMedia)try{window.matchMedia("print").addListener(function(m){',
            '  if(m.matches){var d=document.querySelector("details");if(d)d.open=true}})}catch(e){}',
            ' window.onbeforeprint=function(){var d=document.querySelector("details");if(d)d.open=true};',
            ' var f=D.filter;$("f-show").value=f.mode;$("f-thresh").value=f.thresh;',
            ' $("f-basis").value=f.basis;$("f-took").checked=f.onlyTook;$("f-od").checked=f.hideOd;',
            ' ["f-show","f-thresh","f-basis","f-took","f-od","f-q"].forEach(function(i){',
            '  $(i).addEventListener("input",render);$(i).addEventListener("change",render)});',
            ' var th=document.querySelectorAll("#mtable th");',
            ' for(var i=0;i<th.length;i++)(function(t){if(t.dataset.k)',
            '  t.addEventListener("click",function(){sortBy(t.dataset.k)})})(th[i]);',
            ' render()});',
        ].join('\n');

        const kpi = (label, value, sub, colour) =>
            '<div class="kpi"><div class="k">' + e(label) + '</div><div class="v" style="color:'
            + (colour || '#e9ecf5') + '">' + value + '</div><div class="s">' + e(sub) + '</div></div>';

        const warRows = warSum.map((w, i) =>
            '<tr><td><span class="nm" style="color:' + hue(i) + '">' + e(w.oppName) + '</span>'
            + (w.hitsSrc === 'none' ? ' <span class="id">HITS UNKNOWN</span>' : '') + '</td>'
            + '<td>' + (w.start ? new Date(w.start * 1000).toISOString().slice(0, 10) : '?') + '</td>'
            + '<td>' + fmt(w.took) + '</td>'
            + '<td style="color:#ffd479">' + fmt(w.used) + '</td>'
            + '<td style="color:' + (w.withdrew ? '#7f8aa3' : '#4e5468') + '">'
            + (w.withdrew ? fmt(w.withdrew) : '—') + '</td>'
            + '<td style="color:#7fe3a0">' + (w.hitsSrc === 'none' ? '?' : fmt(w.hits)) + '</td>'
            + '<td>' + (w.hitsSrc === 'none' ? '?' : w.hitsPerXan == null ? '—' : w.hitsPerXan.toFixed(1)) + '</td>'
            + '<td style="color:' + (w.wasted > 0 ? '#ff8080' : '#7fe3a0') + ';font-weight:700">'
            + (w.hitsSrc === 'none' ? '—' : w.wasted.toFixed(1)) + '</td>'
            + '<td style="color:' + (w.flagged ? '#ff8080' : '#7fe3a0') + '">'
            + (w.hitsSrc === 'none' ? '—' : fmt(w.flagged)) + '</td></tr>').join('');

        const roll = sweepOdRollCall(s);
        const odSection = roll.length
            ? '<h2>Overdoses</h2><div class="wrap"><table><thead><tr><th>Member</th>'
              + '<th>Overdosed during</th><th>Xanax excused</th></tr></thead><tbody>'
              + roll.map(r => '<tr><td><span class="nm">' + e(r.name) + '</span> <span class="id">['
                  + e(r.id) + ']</span></td><td>' + e(r.wars.map(x => x.opp + (x.start
                      ? ' ' + new Date(x.start * 1000).toISOString().slice(0, 10) : '')
                      + (x.ods > 1 ? ' (×' + x.ods + ')' : '')).join(', '))
                  + '</td><td style="color:#9fc7ff">' + (r.excused >= 0.05 ? r.excused.toFixed(1) : '—')
                  + '</td></tr>').join('') + '</tbody></table></div>'
              + '<div class="note">An overdose hospitalises you for hours and ends your war. The Xanax '
              + 'swallowed beforehand was not squandered — the member was prevented from spending that '
              + 'energy — so it is excused rather than wasted. Torn records overdoses daily, so the war '
              + 'is the finest resolution available; a precise time would be invented. ' + e(sweepOdCoverage()) + '</div>'
            : '<h2>Overdoses</h2><div class="note">' + e(sweepOdCoverage()) + '</div>';

        const warHeads = wars.map((w, i) =>
            '<th data-k="" style="color:' + hue(i) + '">' + e(String(w.oppName).slice(0, 11))
            + '<br><span style="font-weight:400;color:#8b90a6">xan / hits</span></th>').join('');

        return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
+ '<meta name="viewport" content="width=device-width,initial-scale=1">'
+ '<title>Faction drug sweep</title><style>' + STYLE + '</style></head><body>'
+ '<h1>Faction drug sweep — ' + s.wars.length + ' war' + (s.wars.length === 1 ? '' : 's') + '</h1>'
+ '<div class="sub">' + e(wars.map(w => w.oppName).join(' · ')) + '<br>Generated '
+ new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC · every member included; filter below</div>'
+ '<button class="pdf" id="btn-pdf" type="button">\u2193 Save as PDF / Print</button>'
+ '<div class="pline" id="pline"></div>'
+ '<div class="kpis">'
+ kpi('Xanax swallowed', fmt(s.totalUsed), 'from the faction armoury', '#ffd479')
+ kpi(hits.complete ? 'Wasted' : 'Measured waste', waste.rounded,
     hits.complete ? fmt(Math.round(s.totalWasted * ENERGY_PER_XANAX)) + ' energy that bought no hits' : hits.coverage, waste.color)
+ kpi('Excused', (s.totalExcused || 0).toFixed(0), 'overdosed — not counted as waste',
     (s.totalExcused || 0) > 0 ? '#9fc7ff' : '#8b90a6')
+ kpi(hits.complete ? 'War hits' : 'Confirmed war hits', hits.value,
     hits.complete ? 'from official war reports' : hits.coverage, '#7fe3a0')
+ kpi('Repeat offenders', fmt(s.repeats.length), 'landed nothing in 2+ wars',
     s.repeats.length ? '#ff8080' : '#7fe3a0')
+ kpi('Unaccounted', fmt(s.totalUnaccounted), 'withdrawn, never seen again',
     s.totalUnaccounted ? '#9fc7ff' : '#8b90a6')
+ '</div>'
+ '<h2>By war</h2><div class="wrap"><table><thead><tr>'
+ '<th>War</th><th>Date</th><th>Members who took</th><th>Xanax<br>swallowed</th>'
+ '<th>Withdrawn<br>not charged</th><th>Hits</th>'
+ '<th>Hits/Xan</th><th>Wasted</th><th>Landed nothing</th></tr></thead><tbody>'
+ warRows + '</tbody></table></div>'
+ '<div class="note">Hits/Xan: use "?" for missing hit data and a dash when no Xanax swallowed. Without a complete hit report, waste cannot be measured for that war and nobody can be '
+ 'flagged in it — those cells read “—”, which is not the same as zero.</div>'
+ odSection
+ '<h2>By member</h2>'
+ '<div class="bar">'
+ '<div class="f"><label>Show</label><select id="f-show">'
+ '<option value="all">Everyone</option>'
+ '<option value="took">Took faction Xanax</option>'
+ '<option value="zero">Confirmed zero hits in all recorded wars</option>'
+ '<option value="under">Hits below a threshold</option>'
+ '<option value="waste">Wasted more than</option>'
+ '<option value="flagged">Took Xanax, landed nothing (any war)</option>'
+ '<option value="repeat">Repeat offenders (2+ wars)</option>'
+ '<option value="od">Overdosed during a war</option>'
+ '</select></div>'
+ '<div class="f"><label>Threshold</label><input type="number" id="f-thresh" min="0" step="1" style="width:92px"></div>'
+ '<div class="f"><label>Measured as</label><select id="f-basis">'
+ '<option value="total">Total across wars</option><option value="avg">Average per war</option>'
+ '</select></div>'
+ '<div class="f"><label>Search</label><input type="text" id="f-q" placeholder="name or ID" style="width:150px"></div>'
+ '<div class="f"><label>Narrow</label>'
+ '<label class="chk"><input type="checkbox" id="f-took"> Only those who took Xanax</label>'
+ '<label class="chk"><input type="checkbox" id="f-od"> Hide confirmed overdoses</label></div>'
+ '<div class="count" id="count"></div>'
+ '</div>'
+ '<div class="wrap"><table id="mtable"><thead><tr>'
+ '<th data-k="name">Member</th><th data-k="flagged">Wasted<br>wars</th>'
+ '<th data-k="wasted" class="sorted">Wasted<br>Xanax</th><th data-k="excused">Excused<br>overdose</th>'
+ '<th data-k="used">Used<br>swallowed</th><th data-k="withdrew">Withdrew<br>net</th>'
+ '<th data-k="hits">Hits</th><th data-k="hitsPerXan">Hits/Xan<br>' + HITS_PER_XANAX + ' = break-even</th>'
+ '<th data-k="">OD<br>during war</th>'
+ warHeads + '</tr></thead><tbody id="tbody"></tbody></table></div>'
+ '<div class="note"><b>Click any column heading to sort.</b> This file contains <b>every</b> member of the '
+ 'sweep — the filter above only changes what is displayed, so nothing is hidden from whoever you send it to.'
+ '<br><b>?</b> means no hit data for that member. An asterisk in the waste columns means the value '
+ 'covers only wars with hit data.'
+ '<br><b>Wasted</b> is energy that left the armoury and never became a war hit: a Xanax is '
+ ENERGY_PER_XANAX + ' energy and a hit costs ' + ENERGY_PER_HIT + ', so one Xanax is worth '
+ HITS_PER_XANAX + ' hits. It is charged on Xanax <b>swallowed</b> only — anything withdrawn into a '
+ "member's own inventory appears under <b>Withdrew</b> and is never counted as waste, because the log "
+ 'cannot say what became of it.'
+ '<br>A war cell reads <b>swallowed / hits</b>. A <b>+N</b> beside it is stock withdrawn into their own '
+ 'inventory — the quartermaster does this to supply the faction, so it is shown but <b>never charged '
+ 'as waste</b>.'
+ '<br><b>Red cells</b> are wars where a member swallowed Xanax and landed nothing. '
+ '<b>Blue cells</b> are wars they overdosed in — excused, not wasted.<br>'
+ 'This counts <b>faction</b> Xanax only; personal stock is invisible to the API.</div>'
+ '<details><summary>How this report was produced</summary><ul>'
+ sweepSettingsLines().map(l => '<li>' + e(l) + '</li>').join('') + '</ul></details>'
+ '<script>window.__SWEEP__=' + json(data) + ';window.__TOTALS__=' + json(totals) + ';\n'
+ SCRIPT + '</scr' + 'ipt></body></html>';
    }

    function sweepExport() {
        const el = $('#twpr-sweep-fmt');
        const v = el ? el.value : 'html';
        return ['html', 'csv', 'discord', 'discord-full'].includes(v) ? v : 'html';
    }

    /** One place that maps a chosen format to its builder and file type. */
    function sweepExportBuild() {
        const f = sweepExport();
        if (f === 'html') {
            const html = buildSweepHtml();
            return { out: html ? { text: html, rows: sweepVisible(state.sweep).length } : null,
                     ext: '.html', mime: 'text/html;charset=utf-8', kind: 'html' };
        }
        if (f === 'discord') return { out: buildSweepDiscord(), ext: '.txt', mime: 'text/plain;charset=utf-8', kind: 'discord' };
        if (f === 'discord-full') return { out: buildSweepDiscordFull(), ext: '.txt', mime: 'text/plain;charset=utf-8', kind: 'discord' };
        return { out: buildSweepCsv(), ext: '.csv', mime: 'text/csv;charset=utf-8', kind: 'csv' };
    }

    function onSweepCopy() {
        if (state.sweepRunning) return; // Leave progress visible and ignore direct/touch activation.
        if (!state.sweep) { setStatus('Run a sweep first.', true); return; }
        if (state.sweep.wars.some(w => w.armouryPartial)) {
            setStatus('Incomplete armoury scan. Run the sweep again before exporting.', true); return;
        }
        const { out, kind } = sweepExportBuild();
        if (!out || !out.text) { setStatus('Nothing to copy in this filter.', true); return; }
        // Copying a whole HTML document to the clipboard helps nobody — that
        // one is a file, and the button says so rather than silently pasting
        // 20KB of markup into a chat box.
        if (kind === 'html') { setStatus('HTML is a file — use ⬇ Download for that one.', true); return; }
        copy(out.text, `Copied ${fmt(out.rows)} member rows` + (out.messages > 1 ? ` (${out.messages} messages).` : '.'));
    }

    function onSweepDownload() {
        if (state.sweepRunning) return; // Leave progress visible and ignore direct/touch activation.
        if (!state.sweep) { setStatus('Run a sweep first.', true); return; }
        if (state.sweep.wars.some(w => w.armouryPartial)) {
            setStatus('Incomplete armoury scan. Run the sweep again before exporting.', true); return;
        }
        const { out, ext, mime, kind } = sweepExportBuild();
        if (!out || !out.text) { setStatus('Nothing to export in this filter.', true); return; }
        const name = `drug-sweep-${state.sweep.wars.length}-wars-${new Date().toISOString().slice(0, 10)}` + ext;
        let url, anchor;
        try {
            // The BOM is for Excel, which otherwise mangles the em-dashes in a
            // CSV. An HTML file declares its own charset and must NOT get one —
            // a stray BOM shows up as a glyph before the doctype.
            const blob = new Blob([(kind === 'csv' ? '﻿' : '') + out.text], { type: mime });
            url = URL.createObjectURL(blob);
            anchor = document.createElement('a');
            anchor.href = url; anchor.download = name;
            document.body.appendChild(anchor); anchor.click();
            setStatus(`Download requested: ${name} (${fmt(out.rows)} rows).`);
        } catch (e) {
            setStatus(kind === 'html'
                ? 'Download blocked. Try a desktop browser, or switch formats to copy the report.'
                : 'Download blocked. Use Copy instead.', true);
        } finally {
            anchor?.remove();
            if (url) setTimeout(() => URL.revokeObjectURL(url), 4000);
        }
    }

    async function onDrugOD() {
        const { war, report, key, current: reportCurrent } = drugRunContext();
        if (!key) { setStatus('Enter your API key first.', true); return; }
        if (!war || !report || !reportCurrent()) { setStatus('Pull the selected war report first.', true); return; }
        const drugs = state.drugs;
        if (!canUseDrugResults() || drugOdInFlight === drugs) return;
        const current = () => reportCurrent() && state.drugs === drugs;

        // Only the population this question is about: drew from the armoury and
        // landed nothing. Checking all 40 members would cost 120 API calls to
        // answer a question nobody asked about the 30 who clearly fought.
        const targets = drugs.list.filter(r => r.drawn > 0 && r.hits === 0 && r.id);
        if (!targets.length) { setStatus('Nobody took drugs without landing a hit — nothing to check.'); return; }

        drugOdInFlight = drugs;
        updateDrugActions();
        try {
            const results = await checkOverdoses(key, targets, war, (i, n, name) => {
                if (current()) setStatus(`Checking overdoses… ${i}/${n} (${name})`);
            });
            if (!current()) return;
            state.odResults = results;
            renderDrugs();

            const vals = Object.values(state.odResults);
            const changes = vals.filter(o => o.mode === 'delta' && o.ods > 0).length;
            const clear = vals.filter(o => o.mode === 'delta' && o.ods === 0).length;
            const comparison = vals.filter(o => o.mode === 'baseline');
            const comparisonChanges = comparison.filter(o => o.ods > 0).length;
            const lifetimeOnly = vals.filter(o => o.mode === 'lifetime').length;
            const failed = vals.filter(o => o.mode === 'error').length;
            const uncertain = comparison.length + lifetimeOnly + failed;
            const msg = [];
            if (changes) msg.push(`${changes} member(s) showed an overdose increase across the war window.`);
            if (clear) msg.push(uncertain || changes
                ? `${clear} checked without an overdose increase.`
                : `No overdoses found among the ${clear} checked member(s).`);
            if (comparison.length) msg.push(`${comparison.length} member(s) compared with an earlier reading (${comparisonChanges} with an increase), not a war-window check.`);
            if (lifetimeOnly) msg.push(`${lifetimeOnly} member(s) had a lifetime total only. That does not date an overdose to this war.`);
            if (failed) msg.push(`${failed} member lookup${failed === 1 ? '' : 's'} failed. No new baseline count for those members.`);
            const st = state.odResults.__stats;
            if (st && st.hits) msg.push(`(${st.hits} reading(s) served from cache, ${st.calls} fetched.)`);

            // Ride along in the war's cache entry so reopening it shows the OD
            // column straight away instead of asking Torn the same question.
            if (!report.__partial && war.end > 0) await cacheSave(war, null, null, false, null, null, results);
            if (current()) setStatus(msg.join(' '), uncertain > 0);
        } catch (e) {
            if (current()) setStatus(e.message || 'Overdose check failed.', true);
        } finally {
            if (drugOdInFlight === drugs) drugOdInFlight = null;
            updateDrugActions();
        }
    }

    const DRUG_COLS = [
        ['Member',    r => r.name],
        ['ID',        r => r.id],
        ['XanaxPreWar', r => r.xanPre],
        ['XanaxInWar',  r => r.xanWar],
        ['XanaxAfter',  r => r.xanPost],
        ['XanaxUsed',      r => r.xanax],
        ['XanaxWithdrawn', r => r.xanTaken],
        ['XanaxDeposited', r => r.xanDeposited],
        ['XanaxTotalOut',  r => r.drawn],
        ['OtherDrugs', r => r.otherDrugs],
        ['Overdose', r => { const o = state.odResults && state.odResults[r.id]; if (!o) return ''; if (o.mode === 'delta') return o.ods > 0 ? 'OD x' + o.ods : 'none'; if (o.mode === 'baseline') return o.ods > 0 ? 'OD x' + o.ods + ' (wider window)' : 'none (wider window)'; if (o.mode === 'lifetime') return 'unknown (' + o.lifetime + ' lifetime)'; return 'check failed'; }],
        ['TotalItems', r => r.total],
        ['Hits',      r => r.hits],
        ['HitsPerXanax', r => r.hitsPerXan == null ? '' : r.hitsPerXan.toFixed(2)],
        ['Respect',   r => Number(r.respect || 0).toFixed(2)],
        ['TookNoHits', r => r.freeloader ? 'YES' : ''],
    ];

    /*
     * The on-screen table, column for column, in the order it is drawn — including
     * the em-dash placeholders, so a pasted CSV reads like the panel it came from.
     *
     * `Total out` keeps the "+N in" deposit annotation the table shows, because
     * dropping it would turn Westend's 431-out/300-in into a bare 431 and lose the
     * one piece of context that stops it reading as the worst number in the file.
     */
    const DASH = '—';
    const DRUG_SCREEN_COLS = [
        ['Member',    r => `${r.name} [${r.id || '?'}]`],
        ['Pre-war',   r => r.xanPre || DASH],
        ['In war',    r => r.xanWar || DASH],
        ['Used',      r => fmt(r.xanax)],
        ['Withdrew',  r => r.xanTaken ? fmt(r.xanTaken) : DASH],
        ['Total out', r => fmt(r.drawn) + (r.xanDeposited ? ` (+${fmt(r.xanDeposited)} in)` : '')],
        ['Other',     r => r.otherDrugs ? fmt(r.otherDrugs) : DASH],
        ['Hits',      r => fmt(r.hits)],
        ['Hits/Xan',  r => r.hitsPerXan == null ? DASH : r.hitsPerXan.toFixed(2)],
        ['Respect',   r => fmt(Number(r.respect || 0).toFixed(2))],
        ['OD',        r => odText(r)],
        ['Flag',      r => flagText(r)],
    ];

    /** RFC-4180 quoting: any cell may contain a comma, a quote or a newline. */
    function csvCell(v) {
        const s = String(v == null ? '' : v);
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }

    function buildDrugCsv() {
        const shown = !$('#twpr-drug-fmt') || $('#twpr-drug-fmt').value === 'shown';
        const cols = shown ? DRUG_SCREEN_COLS : DRUG_COLS;
        const rows = drugRows();
        if (!rows.length) return null;
        // Same reasoning as the sweep: a filtered file must say so, because once
        // it is in a downloads folder nothing else can.
        const d = state.drugs || {};
        const war = state.war || {};
        const modeLabel = {
            all: 'everyone with drug or hit activity',
            took: 'members who took Xanax',
            freeload: 'members who took Xanax and landed zero hits',
            nodrug: 'members who landed hits without taking faction Xanax',
        }[drugFilter()] || 'everyone';
        const lines = [
            csvCell('Torn War Payout Report — drug report'),
            csvCell(`War: vs ${war.oppName || 'enemy'} · fighting started ${dayStr(d.warStart)} TCT`),
            csvCell(`Drug window: ${dayStr(d.pullFrom || d.firstTs)} → ${dayStr(d.pullTo || d.lastTs)} TCT (${d.leadDays || 0}d build-up + war + ${d.tailHours || 0}h tail)`),
            csvCell(`Showing: ${rows.length} of ${(d.list || []).length} — ${modeLabel}`),
            csvCell(`Columns: ${shown ? 'exactly as displayed on screen' : 'full raw data'}`),
            csvCell(state.odResults
                ? 'Overdose check: run. A blank OD cell means unchecked, never clean.'
                : 'Overdose check: NOT run — the OD column is empty because nobody was checked.'),
            csvCell('Armoury only — personal Xanax is invisible to the API, so 0 means "took none of yours".'),
            '',
            cols.map(c => csvCell(c[0])).join(','),
        ];
        for (const r of rows) lines.push(cols.map(c => csvCell(c[1](r))).join(','));
        // CRLF, not LF. A lone \n survives the clipboard on Windows but collapses
        // to one unreadable line the moment it's pasted into Notepad or Excel —
        // which is exactly what happened to the first exported report.
        return { text: lines.join('\r\n'), rows: rows.length, shown };
    }

    /*
     * Discord has no tables, so this is a fixed-width block — and fixed-width is
     * exactly why it is ASCII only. Emoji render double-width in Discord's
     * monospace font, so a single 💊 shears every column to the right of it out
     * of alignment. "OD x1" costs nothing and actually lines up.
     */
    function buildDrugDiscord() {
        const rows = drugRows();
        if (!rows.length) return null;
        const d = state.drugs, war = state.war || {};

        const note = (r) => {
            const bits = [];
            if (r.freeloader) bits.push('NO HITS');
            if (r.stocker) bits.push('stocker');
            const od = state.odResults && state.odResults[r.id];
            if (od) {
                if (od.mode === 'delta') bits.push(od.ods > 0 ? `OD x${od.ods}` : 'no OD');
                else if (od.mode === 'baseline') bits.push(od.ods > 0 ? `OD x${od.ods}?` : 'no OD*');
                else if (od.mode === 'lifetime') bits.push('OD unknown');
                else bits.push('OD check failed');
            }
            return bits.join(' - ');
        };

        const headers = ['Player', 'Xan', 'Hits', 'H/X', 'Note'];
        const body = rows.map(r => [
            r.name,
            String(r.drawn),
            String(r.hits),
            r.hitsPerXan == null ? '-' : r.hitsPerXan.toFixed(2),
            note(r),
        ]);
        const all = [headers, ...body];
        const w = headers.map((_, i) => Math.max(...all.map(row => row[i].length)));
        const line = (row) => row.map((c, i) =>
            (i === 0 || i === headers.length - 1) ? c.padEnd(w[i]) : c.padStart(w[i])).join('  ').replace(/\s+$/, '');
        const rule = w.map(x => '-'.repeat(x)).join('  ');

        const flagged = d.freeloaders ? d.freeloaders.length : 0;
        const summary =
            `**Drug report — war vs ${war.oppName || 'enemy'}**\n` +
            `${fmt(d.totalDrawn || d.totalXan)} Xanax out of the armoury ` +
            `(${fmt(d.totalXanPre || 0)} in the build-up, ${fmt(d.totalXanWar || 0)} during the war) · ` +
            `${fmt(d.totalHits)} war hits · ${d.hitsPerXan == null ? '—' : d.hitsPerXan.toFixed(2)} hits per Xanax` +
            (flagged ? `\n:warning: ${fmt(flagged)} member${flagged === 1 ? '' : 's'} took stock and landed nothing.` : '');

        // Discord hard-caps a message at 2000 characters. Rather than silently
        // producing something that won't send, split on ROW boundaries so every
        // chunk is a complete, readable table.
        const LIMIT = 1900;
        const chunks = [];
        let cur = [line(headers), rule];
        const flush = () => { if (cur.length > 2) chunks.push('```\n' + cur.join('\n') + '\n```'); };
        for (const row of body) {
            const l = line(row);
            if (cur.join('\n').length + l.length + 12 > LIMIT) { flush(); cur = [line(headers), rule]; }
            cur.push(l);
        }
        flush();

        const messages = chunks.length ? [summary + '\n' + chunks[0], ...chunks.slice(1)] : [summary];
        return { text: messages.join('\n\n'), messages: messages.length, rows: rows.length };
    }

    function drugExportFormat() {
        const el = $('#twpr-drug-fmt');
        return el ? el.value : 'shown';
    }

    function onDrugCopy() {
        if (!canUseDrugResults()) return;
        if (drugExportFormat() === 'discord') {
            const out = buildDrugDiscord();
            if (!out) { setStatus('Nothing to copy in this filter.', true); return; }
            copy(out.text, out.messages > 1
                ? `Copied ${fmt(out.rows)} rows as ${out.messages} messages — paste them one at a time (Discord caps a message at 2000 characters).`
                : `Copied ${fmt(out.rows)} rows — paste straight into Discord.`);
            return;
        }
        const out = buildDrugCsv();
        if (!out) { setStatus('Nothing to copy in this filter.', true); return; }
        copy(out.text, `Copied ${fmt(out.rows)} rows (${out.shown ? 'as shown' : 'full data'}).`);
    }

    function onDrugCsvDownload() {
        if (!canUseDrugResults()) return;
        const discord = drugExportFormat() === 'discord';
        const out = discord ? buildDrugDiscord() : buildDrugCsv();
        if (!out) { setStatus('Nothing to export in this filter.', true); return; }
        const war = state.war || {};
        const when = war.start ? new Date(war.start * 1000).toISOString().slice(0, 10) : 'war';
        const name = `drug-report-${when}-vs-${String(war.oppName || 'enemy').replace(/[^\w-]+/g, '_')}`
                   + (discord ? '.txt' : '.csv');
        try {
            // A UTF-8 BOM, or Excel renders — as "â€"" and the emoji as mojibake.
            const blob = new Blob(['﻿' + out.text],
                { type: discord ? 'text/plain;charset=utf-8' : 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
            setStatus(`Downloaded ${name} (${fmt(out.rows)} rows).`);
        } catch (e) {
            setStatus('Download blocked — use Copy instead.', true);
        }
    }

    // Standalone HTML report — self-contained, no external assets, so it opens
    // offline and can be dropped straight into Discord or a faction forum.
    function onDrugHTML() {
        if (!canUseDrugResults()) return;
        const d = state.drugs, war = state.war || {};
        const esc = (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const rows = drugRows();
        const when = war.start ? new Date(war.start * 1000).toISOString().slice(0, 10) : '?';

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Faction Drug Report — vs ${esc(war.oppName || 'enemy')}</title>
<style>
 body{background:#12151f;color:#c8cde0;font:14px/1.55 system-ui,Segoe UI,Roboto,sans-serif;margin:0;padding:28px;}
 h1{font-size:21px;color:#fff;margin:0 0 4px;} .sub{color:#8b90a6;font-size:12.5px;margin-bottom:20px;}
 .kpis{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:18px;}
 .kpi{flex:1;min-width:130px;background:#1a1f2e;border:1px solid #2a3142;border-radius:9px;padding:11px 14px;}
 .kpi .k{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#8b90a6;}
 .kpi .v{font-size:24px;font-weight:700;color:#fff;line-height:1.2;margin-top:2px;}
 .kpi .s{font-size:11px;color:#8b90a6;}
 .warn{background:rgba(255,154,154,.09);border:1px solid rgba(255,154,154,.3);color:#ffc9c9;
   border-radius:9px;padding:11px 14px;margin-bottom:18px;font-size:12.5px;line-height:1.6;}
 table{width:100%;border-collapse:collapse;font-size:13px;background:#1a1f2e;border-radius:9px;overflow:hidden;}
 th{background:#232a3c;color:#a8afc6;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;
   text-align:right;padding:10px 12px;} th:first-child{text-align:left;}
 td{padding:9px 12px;text-align:right;border-top:1px solid #232a3c;} td:first-child{text-align:left;color:#f2f4fb;}
 tr:hover td{background:#1f2637;}
 .win{color:#7fe3a0;} .xan{color:#ffd479;} .flag{color:#ff9a9a;font-weight:600;} .dim{color:#8b90a6;}
 .note{color:#8b90a6;font-size:12px;margin-top:16px;line-height:1.65;}
</style></head><body>
<h1>💊 Faction Drug Report</h1>
<div class="sub">War vs <b>${esc(war.oppName || 'enemy')}</b> · fighting started ${esc(dayStr(d.warStart))} TCT ·
  drug window ${esc(dayStr(d.pullFrom || d.firstTs))} → ${esc(dayStr(d.pullTo || d.lastTs))} TCT
  (${fmt(d.leadDays || 0)}d build-up + war + ${fmt(d.tailHours || 0)}h tail) ·
  generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</div>
<div class="kpis">
 <div class="kpi"><div class="k">Xanax taken</div><div class="v">${fmt(d.totalXan)}</div><div class="s">${fmt(d.takers)} members</div></div>
 <div class="kpi"><div class="k">Build-up</div><div class="v" style="color:#9fc7ff">${fmt(d.totalXanPre || 0)}</div><div class="s">before fighting</div></div>
 <div class="kpi"><div class="k">During war</div><div class="v" style="color:#ffd479">${fmt(d.totalXanWar || 0)}</div><div class="s">${d.totalXanPost ? fmt(d.totalXanPost) + ' after' : 'while live'}</div></div>
 <div class="kpi"><div class="k">Withdrawn</div><div class="v" style="color:#ff9a9a">${fmt(d.totalXanTaken || 0)}</div><div class="s">to inventory</div></div>
 <div class="kpi"><div class="k">Hits landed</div><div class="v">${fmt(d.totalHits)}</div><div class="s">war hits only</div></div>
 <div class="kpi"><div class="k">Hits per Xanax</div><div class="v">${d.hitsPerXan == null ? '—' : d.hitsPerXan.toFixed(2)}</div><div class="s">faction average</div></div>
 <div class="kpi"><div class="k">Took · no hits</div><div class="v" style="color:${d.freeloaders.length ? '#ff9a9a' : '#7fe3a0'}">${fmt(d.freeloaders.length)}</div><div class="s">members</div></div>
 <div class="kpi"><div class="k">Other drugs</div><div class="v">${fmt(d.totalOtherDrugs)}</div><div class="s">non-Xanax</div></div>
</div>
${d.freeloaders.length ? `<div class="warn"><b>${fmt(d.freeloaders.length)}</b> member(s) drew Xanax and landed zero war hits:
 ${d.freeloaders.map(r => {
     const o = state.odResults && state.odResults[r.id];
     const tag = !o ? ''
       : (o.mode === 'delta' && o.ods > 0) ? ' — 💊 OVERDOSED ×' + o.ods
       : (o.mode === 'baseline' && o.ods > 0) ? ' — 💊 OD ×' + o.ods + '?'
       : (o.mode === 'delta' || o.mode === 'baseline') ? ' — no OD'
       : ' — OD unknown';
     return esc(r.name) + ' (' + fmt(r.drawn) + ')' + tag;
   }).join(', ')}.
 ${state.odResults ? 'Members marked OVERDOSED were hospitalised — that is the explanation, not slacking.' :
   'Check for hospital time, travel, or chain use before drawing conclusions.'}</div>` : ''}
<table><thead><tr><th>Member</th><th>Pre-war</th><th>In war</th><th>Used</th><th>Withdrew</th><th>Total out</th><th>Other drugs</th><th>Hits</th><th>Hits/Xan</th><th>Respect</th><th>OD</th><th>Flag</th></tr></thead>
<tbody>${rows.map(r => `<tr>
 <td>${esc(r.name)} <span class="dim">[${esc(r.id)}]</span></td>
 <td class="dim">${r.xanPre ? fmt(r.xanPre) : '—'}</td>
 <td class="${r.xanWar ? 'xan' : 'dim'}">${r.xanWar ? fmt(r.xanWar) : '—'}</td>
 <td class="${r.xanax ? 'xan' : 'dim'}">${fmt(r.xanax)}</td>
 <td class="${r.xanTaken ? 'flag' : 'dim'}">${r.xanTaken ? fmt(r.xanTaken) : '—'}</td>
 <td><b>${fmt(r.drawn)}</b>${r.xanDeposited ? ` <span class="win">+${fmt(r.xanDeposited)} in</span>` : ''}</td>
 <td class="dim">${r.otherDrugs ? fmt(r.otherDrugs) : '—'}</td>
 <td class="win">${fmt(r.hits)}</td>
 <td>${r.hitsPerXan == null ? '<span class="dim">—</span>' : r.hitsPerXan.toFixed(2)}</td>
 <td class="dim">${fmt(Number(r.respect || 0).toFixed(2))}</td>
 <td>${(() => { const o = state.odResults && state.odResults[r.id];
   if (!o) return '<span class="dim">–</span>';
   if (o.mode === 'delta') return o.ods > 0 ? `<span class="xan">💊 OD ×${o.ods}</span>` : '<span class="win">no OD</span>';
   if (o.mode === 'baseline') return o.ods > 0 ? `<span class="xan">💊 OD ×${o.ods}?</span>` : '<span class="win">no OD*</span>';
   if (o.mode === 'lifetime') return `<span class="dim">? (${fmt(o.lifetime)} ever)</span>`;
   return '<span class="flag">could not check</span>'; })()}</td>
 <td class="${r.freeloader ? 'flag' : 'dim'}">${r.freeloader ? '⚠ no hits' : r.stocker ? '📦 stocker' : (r.drawn ? 'ok' : '')}</td>
</tr>`).join('')}</tbody></table>
<div class="note"><b>Armoury only.</b> These are drugs taken <i>from the faction armoury</i>, parsed from the
 faction news log — Torn exposes no endpoint for personal drug use, so a member using their own Xanax
 does not appear here at all. A 0 means "took none of the faction's", not "took none".<br>
 Scanned ${fmt(d.entries)} armoury entries, of which ${fmt(d.uses)} were item uses.
 Generated by Torn War Payout Report v2.11.0.</div>
</body></html>`;

        try {
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `drug-report-${when}-vs-${String(war.oppName || 'enemy').replace(/[^\w-]+/g, '_')}.html`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
            setStatus('HTML report downloaded.');
        } catch (e) {
            setStatus('Download blocked — use "Copy table" instead.', true);
        }
    }

    /* --------------------- loss raffle ------------------------ */
    // Cryptographically strong uniform [0,1). Falls back to Math.random only
    // if the crypto API is somehow unavailable.
    function cryptoFloat() {
        const c = (typeof crypto !== 'undefined' && crypto) || (typeof window !== 'undefined' && window.crypto);
        if (c && c.getRandomValues) {
            const buf = new Uint32Array(1);
            c.getRandomValues(buf);
            return buf[0] / 4294967296;
        }
        return Math.random();
    }

    // One ticket per loss, using the current "count losses as" setting.
    /**
     * What a raffle can count.
     *
     * Deliberately covers both ends of a war: things that happened TO a member
     * (losses, enemy hits) for a consolation draw, and things they DID (hits,
     * respect, defends) for a reward draw — plus a flat entry so a faction can
     * run "everyone who turned up" without weighting performance at all.
     */
    const RAFFLE_SOURCES = [
        { key: 'loss',    label: 'Losses',      def: 1, hint: 'per loss (uses the losses setting on the War report tab)',
          get: (r) => scopedLoss(r) },
        { key: 'wins',    label: 'War hits',    def: 0, hint: 'per successful hit on the enemy',
          get: (r) => r.wins },
        { key: 'respect', label: 'Respect',     def: 0, hint: 'per respect point — use a fraction like 0.1',
          get: (r) => r.respect },
        { key: 'defHeld', label: 'Defends',     def: 0, hint: 'per incoming attack they survived',
          get: (r) => r.defHeld },
        { key: 'assists', label: 'Assists',     def: 0, hint: 'per assist',
          get: (r) => r.assists },
        { key: 'enemyOn', label: 'Enemy hits taken', def: 0, hint: 'per time the enemy attacked them',
          get: (r) => r.enemyOn + r.stealthOn },
        { key: 'flat',    label: 'Just for taking part', def: 0, hint: 'tickets everyone gets, win or lose',
          get: () => 1 },
    ];

    function raffleWeights() {
        const out = {};
        for (const src of RAFFLE_SOURCES) {
            const el = $('#twpr-rw-' + src.key);
            const v = el ? Number(el.value) : src.def;
            out[src.key] = Number.isFinite(v) && v >= 0 ? v : 0;
        }
        return out;
    }

    /**
     * Tickets per member under the current weights.
     *
     * Rounded DOWN, so a weight that produces 0.6 of a ticket produces none —
     * a fractional ticket is not a thing anyone can hold, and rounding up would
     * hand an entry to somebody who did nothing.
     */
    function raffleEntrants() {
        if (!state.report) return [];
        const w = raffleWeights();
        const cap = Math.max(0, Number(($('#twpr-raffle-cap') || {}).value) || 0);
        const min = Math.max(0, Number(($('#twpr-raffle-min') || {}).value) || 0);
        const active = RAFFLE_SOURCES.filter(sc => w[sc.key] > 0);

        return state.report.list.map(row => {
            const parts = [];
            let raw = 0;
            for (const sc of active) {
                const n = Number(sc.get(row)) || 0;
                if (n <= 0) continue;
                const t = n * w[sc.key];
                raw += t;
                parts.push(`${fmt(n)} ${sc.label.toLowerCase()} x${w[sc.key]} = ${Math.round(t * 10) / 10}`);
            }
            let tickets = Math.floor(raw);
            const capped = cap > 0 && tickets > cap;
            if (capped) tickets = cap;
            return { name: row.name, id: row.id, tickets, raw, capped, parts };
        })
        .filter(e => e.tickets >= Math.max(1, min))
        .sort((a, b) => b.tickets - a.tickets);
    }

    function pickWeighted(pool) {
        const total = pool.reduce((s, e) => s + e.tickets, 0);
        if (total <= 0) return null;
        let r = cryptoFloat() * total;
        for (const e of pool) { r -= e.tickets; if (r < 0) return e; }
        return pool[pool.length - 1];
    }

    /** Build the weight inputs once; they drive every recalculation after. */
    function buildRaffleWeights() {
        const box = $('#twpr-raffle-weights');
        if (!box || box.dataset.built) return;
        box.dataset.built = '1';
        box.innerHTML = RAFFLE_SOURCES.map(sc =>
            `<div class="twpr-field" style="min-width:150px;">
               <label title="${escHtml(sc.hint)}">${escHtml(sc.label)}</label>
               <input class="twpr-input" id="twpr-rw-${sc.key}" type="number" min="0" step="0.1"
                      value="${sc.def}" style="width:92px;">
               <div class="twpr-hint">${escHtml(sc.hint)}</div>
             </div>`).join('');
    }

    function applyRafflePreset(w) {
        for (const sc of RAFFLE_SOURCES) {
            const el = $('#twpr-rw-' + sc.key);
            if (el) el.value = w[sc.key] != null ? w[sc.key] : 0;
        }
        renderRaffle();
    }

    function renderRaffle() {
        buildRaffleWeights();
        const sum = $('#twpr-raffle-sum');
        if (!sum) return;
        if (!state.report) {
            sum.textContent = 'Pull a war report first';
            const ob = $('#twpr-raffle-oddsbody');
            if (ob) ob.innerHTML = '<div style="color:#8b90a6;padding:6px 2px;">The raffle draws from a war\'s per-member numbers, so it needs a report.</div>';
            return;
        }
        const entrants = raffleEntrants();
        const total = entrants.reduce((s, e) => s + e.tickets, 0);
        const active = RAFFLE_SOURCES.filter(sc => raffleWeights()[sc.key] > 0);
        sum.innerHTML = active.length
            ? `<b>${fmt(entrants.length)}</b> members · <b>${fmt(total)}</b> tickets`
            : '<span style="color:#ff9a9a">every source is set to 0 — nobody has a ticket</span>';

        const odds = $('#twpr-raffle-oddsbody');
        if (!odds) return;
        if (!total) {
            odds.innerHTML = active.length
                ? '<div style="color:#8b90a6;padding:6px 2px;">Nobody clears the minimum ticket count.</div>'
                : '<div style="color:#8b90a6;padding:6px 2px;">Give at least one source a weight above zero.</div>';
            return;
        }
        const top = entrants[0].tickets;
        odds.innerHTML = `<table class="twpr-oddstable">${entrants.map(e => `<tr>
            <td>${escHtml(e.name)} <span style="color:#6a7080;">[${e.id}]</span>${e.capped ? ' <span style="color:#ffd479;font-size:10px;" title="Capped — raw total was ' + Math.floor(e.raw) + '">capped</span>' : ''}</td>
            <td style="width:34%;"><span class="twpr-oddsbar"><i style="width:${(e.tickets / top) * 100}%"></i></span></td>
            <td style="text-align:right;white-space:nowrap;" title="${escHtml(e.parts.join('  +  ') || 'no qualifying activity')}">
              <b>${fmt(e.tickets)}</b> <span style="color:#8b90a6;">${((e.tickets / total) * 100).toFixed(1)}%</span></td>
          </tr>`).join('')}</table>`;
    }

    function showRaffleWinners(winners, total) {
        const el = $('#twpr-raffle-winner');
        if (!el) return;
        el.innerHTML = winners.map((w, i) => {
            const odds = total ? ((w.tickets / total) * 100).toFixed(1) : '0';
            return `<div class="twpr-winner">🏆 ${winners.length > 1 ? `#${i + 1} ` : ''}<b>${w.name}</b> [${w.id}] <span class="sub">${fmt(w.tickets)} tickets · ${odds}% odds</span></div>`;
        }).join('');
    }

    function onRaffleDraw() {
        const entrants = raffleEntrants();
        if (!entrants.length) { setStatus('Nobody holds a ticket under these weights.', true); return; }
        const total = entrants.reduce((s, e) => s + e.tickets, 0);
        const n = Math.max(1, Math.min(Number($('#twpr-raffle-n').value || 1), entrants.length));

        // Pre-compute unique winners (weighted, without replacement).
        const pool = entrants.slice();
        const winners = [];
        for (let i = 0; i < n; i++) {
            const w = pickWeighted(pool);
            if (!w) break;
            winners.push(w);
            pool.splice(pool.indexOf(w), 1);
        }

        // Spin animation: cycle random names, decelerating, then reveal.
        const el = $('#twpr-raffle-winner');
        const btn = $('#twpr-raffle-draw');
        if (btn) btn.disabled = true;
        const start = Date.now();
        (function step() {
            const rnd = entrants[Math.floor(cryptoFloat() * entrants.length)];
            el.innerHTML = `<div class="twpr-spin">${rnd.name}</div>`;
            const elapsed = Date.now() - start;
            if (elapsed < 2200) {
                setTimeout(step, 50 + elapsed / 22);
            } else {
                showRaffleWinners(winners, total);
                if (btn) btn.disabled = false;
            }
        })();
    }

    // Each name repeated by its ticket count — paste into wheelofnames.com.
    function onCopyWheel() {
        const entrants = raffleEntrants();
        if (!entrants.length) { setStatus('No tickets to export.', true); return; }
        const lines = [];
        for (const e of entrants) for (let i = 0; i < e.tickets; i++) lines.push(e.name);
        copy(lines.join('\n'), `Copied ${fmt(lines.length)} entries — paste into wheelofnames.com.`);
    }

    /** The odds table as CSV — the receipt for a draw. */
    function onRaffleCsv() {
        const entrants = raffleEntrants();
        if (!entrants.length) { setStatus('No tickets to export.', true); return; }
        const total = entrants.reduce((s, e) => s + e.tickets, 0);
        const w = raffleWeights();
        const used = RAFFLE_SOURCES.filter(sc => w[sc.key] > 0).map(sc => `${sc.label} x${w[sc.key]}`).join(' + ');
        const lines = [`"Tickets from: ${used.replace(/"/g, '""')}"`, 'Member,ID,Tickets,Odds%'];
        for (const e of entrants) {
            lines.push([csvCell(e.name), e.id, e.tickets, ((e.tickets / total) * 100).toFixed(2)].join(','));
        }
        const war = state.war || {};
        const name = `raffle-odds-${String(war.oppName || 'war').replace(/[^\w-]+/g, '_')}.csv`;
        try {
            const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
            setStatus(`Downloaded ${name} — ${fmt(entrants.length)} entrants, ${fmt(total)} tickets.`);
        } catch (e) { setStatus('Download blocked — use Copy instead.', true); }
    }

    function copy(text, okMsg) {
        const done = () => setStatus(okMsg);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
        } else { fallbackCopy(text, done); }
    }
    function fallbackCopy(text, done) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { setStatus('Copy failed — select manually.', true); }
        document.body.removeChild(ta);
    }

    /* ----------------------- bootstrap ------------------------ */
    let fabPos = null;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    async function loadFabPos() {
        try { const raw = await gmGet(LS_FABPOS, ''); if (raw) fabPos = JSON.parse(raw); }
        catch (e) { fabPos = null; }
    }

    function placeFab(fab) {
        const size = fab.offsetWidth || 54;
        let left, top;
        if (fabPos && Number.isFinite(fabPos.left) && Number.isFinite(fabPos.top)) {
            left = fabPos.left; top = fabPos.top;
        } else {
            // Default: right edge, ~40% down — clear of TornPDA's top + bottom bars.
            left = window.innerWidth - size - 14;
            top = Math.round(window.innerHeight * 0.40);
        }
        fab.style.left = clamp(left, 4, window.innerWidth - size - 4) + 'px';
        fab.style.top = clamp(top, 4, window.innerHeight - size - 4) + 'px';
    }

    // Drag-or-tap: a small movement counts as a tap (opens panel); a larger
    // drag repositions the button and saves it. Pointer Events cover both
    // touch (TornPDA) and mouse (desktop) with one code path.
    function attachDrag(fab) {
        let active = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
        const THRESH = 6;

        const down = (e) => {
            const p = e.touches ? e.touches[0] : e;
            active = true; moved = false;
            sx = p.clientX; sy = p.clientY;
            const r = fab.getBoundingClientRect();
            ox = r.left; oy = r.top;
            if (fab.setPointerCapture && e.pointerId != null) {
                try { fab.setPointerCapture(e.pointerId); } catch (_) {}
            }
        };
        const move = (e) => {
            if (!active) return;
            const p = e.touches ? e.touches[0] : e;
            const dx = p.clientX - sx, dy = p.clientY - sy;
            if (Math.abs(dx) > THRESH || Math.abs(dy) > THRESH) moved = true;
            if (moved) {
                if (e.cancelable) e.preventDefault();
                const size = fab.offsetWidth || 54;
                fab.style.left = clamp(ox + dx, 4, window.innerWidth - size - 4) + 'px';
                fab.style.top = clamp(oy + dy, 4, window.innerHeight - size - 4) + 'px';
            }
        };
        const up = () => {
            if (!active) return;
            active = false;
            if (moved) {
                fabPos = { left: parseInt(fab.style.left, 10), top: parseInt(fab.style.top, 10) };
                gmSet(LS_FABPOS, JSON.stringify(fabPos));
            } else {
                openPanel();
            }
        };

        if (window.PointerEvent) {
            fab.addEventListener('pointerdown', down);
            fab.addEventListener('pointermove', move);
            fab.addEventListener('pointerup', up);
            fab.addEventListener('pointercancel', () => { active = false; });
        } else {
            fab.addEventListener('touchstart', down, { passive: false });
            fab.addEventListener('touchmove', move, { passive: false });
            fab.addEventListener('touchend', up);
            fab.addEventListener('mousedown', down);
            window.addEventListener('mousemove', move);
            window.addEventListener('mouseup', up);
        }
    }

    function addFab() {
        if (document.getElementById('twpr-fab')) return;
        injectCSS();
        const fab = document.createElement('button');
        fab.id = 'twpr-fab';
        fab.type = 'button';
        fab.title = 'War Payout Report (tap to open · drag to move)';
        fab.textContent = '⚔️';
        document.body.appendChild(fab);
        placeFab(fab);
        attachDrag(fab);
    }

    function init() {
        if (!document.body) { setTimeout(init, 300); return; }
        loadFabPos().then(() => {
            addFab();
            // Torn's SPA re-renders the body on navigation and can strip the
            // button out — re-add it whenever it goes missing.
            setInterval(() => { if (!document.getElementById('twpr-fab')) addFab(); }, 1500);
            window.addEventListener('resize', () => {
                const f = document.getElementById('twpr-fab');
                if (f) placeFab(f);
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
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


const hubMenuAdapter = registerTornScriptMenu(document, window, {
  "id": "war-payout-report",
  "name": "War Payout Report",
  "icon": "war",
  "version": "2.12.1-local",
  "url": "https://www.torn.com/factions.php?step=your&type=1",
  "actions": [
    {
      "id": "open",
      "label": "Open report"
    }
  ],
  "category": "Tools",
  "capabilities": [
    "appearance"
  ]
}, {
  "open": () => { if (!document.body) return false; openPanel(); return true; }
});

const hubAppearanceKey="torn-script-hub:ui-override:v1:war-payout-report";
const hubAppearance=createScriptUiAppearanceAdapter({doc:document,win:window,id:"war-payout-report",selectors:["#twpr-panel"],getInstance:()=>hubMenuAdapter.instance,
read:()=>typeof GM_getValue==='function'?GM_getValue(hubAppearanceKey,null):typeof GM!=='undefined'&&typeof GM.getValue==='function'?GM.getValue(hubAppearanceKey,null):JSON.parse(localStorage.getItem(hubAppearanceKey)||'null'),
write:value=>{if(typeof GM_setValue==='function')return GM_setValue(hubAppearanceKey,value);if(typeof GM!=='undefined'&&typeof GM.setValue==='function')return GM.setValue(hubAppearanceKey,value);localStorage.setItem(hubAppearanceKey,JSON.stringify(value));}});
hubAppearance.start().catch(()=>{});
// SCRIPT HUB ADAPTER END
})();
