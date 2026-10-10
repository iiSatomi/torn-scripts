// ==UserScript==
// @name         Torn City Item Finder
// @namespace    https://www.torn.com/profiles.php?XID=3580191
// @version      1.0.8
// @description  Floating GUI on the city page that lists every item currently spawned in the city and lets you collect them with a tap. Reads Torn's own mapData feed and uses the game's native pickup endpoint. Built for TornPDA + desktop.
// @author       iSatomi [3580191]
// @license      MIT
// @match        https://www.torn.com/city.php*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @connect      www.torn.com
// @connect      api.torn.com
// @downloadURL https://update.greasyfork.org/scripts/584457/Torn%20City%20Item%20Finder.user.js
// @updateURL https://update.greasyfork.org/scripts/584457/Torn%20City%20Item%20Finder.meta.js
// ==/UserScript==

(function () {
    'use strict';

    /* =========================================================================
     * Torn City Item Finder
     * -------------------------------------------------------------------------
     * Item list    : GET  /city.php?step=mapData          -> data.territoryUserItems
     *                each item = { c:{x,y}, d:item_id, id:row_id, ts:timestamp, title }
     * Collect      : POST /city.php  step=uif
     *                td = base64( x.b36 +"O"+ y.b36 +"O"+ row_id.b36 +"O"+ ts.b36 )
     * Every request must carry  rfcv=<rfc_v cookie>  or Torn rejects it.
     * ========================================================================= */

    const VERSION = '1.0.8';
    const DEBUG = false; // flip to true for verbose console logs
    const LOG = (...a) => console.log('%c[CityItemFinder]', 'color:#5cc8ff', ...a);

    /* ---------------------------------------------------------------- storage */
    const Store = {
        get(key, def) {
            try {
                if (typeof GM_getValue === 'function') {
                    const v = GM_getValue(key, undefined);
                    if (v !== undefined) return v;
                }
            } catch (e) {}
            try {
                const raw = localStorage.getItem('cif_' + key);
                if (raw !== null) return JSON.parse(raw);
            } catch (e) {}
            return def;
        },
        set(key, val) {
            try { if (typeof GM_setValue === 'function') GM_setValue(key, val); } catch (e) {}
            try { localStorage.setItem('cif_' + key, JSON.stringify(val)); } catch (e) {}
        }
    };

    const settings = Object.assign({
        fabX: null, fabY: null,
        autoRefresh: false,
        autoRefreshSecs: 20,
        apiKey: '',
        sortByValue: true
    }, Store.get('settings', {}));

    function saveSettings() { Store.set('settings', settings); }

    /* ------------------------------------------------------------------- rfc */
    // Torn appends rfcv=<rfc_v cookie> to every ajax request (addRFC in ajaxHelpers.js).
    function getRfc() {
        const parts = document.cookie.split('; ');
        for (const p of parts) {
            const i = p.indexOf('=');
            if (i < 0) continue;
            if (p.slice(0, i) === 'rfc_v') return p.slice(i + 1);
        }
        return '';
    }

    /* --------------------------------------------------------------- request */
    // These are all same-origin calls to www.torn.com. A page-context fetch
    // reproduces Torn's own in-page XHR signature (same-origin Referer/Sec-Fetch
    // + cookies), which is what makes city.php return the JSON feed instead of
    // the full HTML page. GM_xmlhttpRequest fires from the extension's network
    // context and gets served HTML, so we only keep it as a last-ditch fallback.
    function rawRequest(method, url, body, extraHeaders) {
        const headers = Object.assign({ 'X-Requested-With': 'XMLHttpRequest' }, extraHeaders || {});
        if (body && !headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';

        // Use the real page-context fetch when we can reach it (truest same-origin
        // request); otherwise the sandbox fetch, which normally routes through the
        // page network stack too.
        let pageFetch = (typeof fetch === 'function') ? fetch : null;
        try {
            if (typeof unsafeWindow !== 'undefined' && unsafeWindow && typeof unsafeWindow.fetch === 'function') {
                pageFetch = unsafeWindow.fetch.bind(unsafeWindow);
            }
        } catch (e) { /* keep sandbox fetch */ }

        if (pageFetch) {
            return Promise.resolve(
                pageFetch(url, { method, headers, credentials: 'include', body: body || undefined })
            ).then(r => r.text());
        }

        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method, url, headers, data: body || null, timeout: 15000,
                    onload: r => resolve(r.responseText),
                    onerror: () => reject(new Error('Network error')),
                    ontimeout: () => reject(new Error('Request timed out'))
                });
            } else {
                reject(new Error('No transport available'));
            }
        });
    }

    /* ----------------------------------------------------------- city API */
    // Tolerant base36 normaliser. Torn's pickup encodes coords/ids/ts as base36.
    // The source values may arrive as base36 strings (legacy) or plain numbers.
    function b36(v) {
        if (v === undefined || v === null) return '';
        if (typeof v === 'number') return Math.trunc(v).toString(36);
        const n = parseInt(v, 36);
        return isNaN(n) ? String(v) : n.toString(36);
    }

    // Pull an item record into a normalised shape, tolerating field renames /
    // number-vs-string coords. Returns null for anything that isn't an item.
    function parseItem(it) {
        if (!it || typeof it !== 'object') return null;

        let cx, cy;
        if (it.c && typeof it.c === 'object') { cx = it.c.x; cy = it.c.y; }
        else if ('x' in it && 'y' in it) { cx = it.x; cy = it.y; }
        else if (Array.isArray(it.coordinates)) { cx = it.coordinates[0]; cy = it.coordinates[1]; }
        if (cx === undefined || cy === undefined) return null;

        const pick = (...keys) => { for (const k of keys) if (it[k] !== undefined) return it[k]; return undefined; };
        const d = pick('d', 'item_id', 'itemID', 'itemId', 'ID');
        const rid = pick('id', 'row_id', 'rowID', 'rowId');
        const ts = pick('ts', 'timestamp', 'time');
        if (d === undefined || rid === undefined || ts === undefined) return null;

        const itemId = (typeof d === 'number') ? d : parseInt(d, 36);
        return {
            raw: it,
            cx, cy, rid, ts,
            rowId: String(rid),
            itemId,
            title: it.title || it.name || ('Item #' + itemId)
        };
    }

    function looksLikeItem(o) { return parseItem(o) !== null; }

    // territoryUserItems arrives as a base64-encoded JSON string. Decode it
    // (UTF-8 safe) back into the item array. Tolerates a plain array or plain
    // JSON string too, in case Torn changes the wrapping later.
    function b64ToStr(b64) {
        const bin = atob(b64);
        try {
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new TextDecoder('utf-8').decode(bytes);
        } catch (e) { return bin; }
    }

    function decodeTUI(data) {
        const v = data && data.territoryUserItems;
        if (Array.isArray(v)) return v;
        if (typeof v === 'string' && v) {
            try { return JSON.parse(b64ToStr(v)); } catch (e) {}
            try { return JSON.parse(v); } catch (e) {}
        }
        return [];
    }

    // Walk the whole response and find the largest array of item-shaped objects,
    // so the script keeps working even if Torn renames the containing field.
    function findItemArray(root) {
        let best = null;
        const seen = new Set();
        const stack = [root];
        while (stack.length) {
            const cur = stack.pop();
            if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
            seen.add(cur);
            if (Array.isArray(cur)) {
                const parsed = cur.map(parseItem).filter(Boolean);
                if (parsed.length && (!best || parsed.length > best.length)) best = parsed;
                for (const v of cur) if (v && typeof v === 'object') stack.push(v);
            } else {
                for (const k in cur) {
                    const v = cur[k];
                    if (v && typeof v === 'object') stack.push(v);
                }
            }
        }
        return best || [];
    }

    async function fetchCityItems() {
        // Match Torn's own request shape: city.php?rfcv=<token>&step=mapData
        const url = '/city.php?rfcv=' + encodeURIComponent(getRfc()) + '&step=mapData';
        const text = await rawRequest('GET', url, null, {
            'Accept': 'application/json, text/javascript, */*; q=0.01'
        });
        const clean = (text || '').replace(/^\uFEFF/, '').trim();
        let data;
        try {
            data = JSON.parse(clean);
        } catch (e) {
            LOG('mapData was not JSON. First 300 chars:', clean.slice(0, 300));
            throw new Error('Could not read map data (unexpected response)');
        }

        const tui = decodeTUI(data);
        let items = tui.map(parseItem).filter(Boolean);

        // If nothing parsed, hunt by shape elsewhere (future-proofing).
        if (!items.length) {
            const found = findItemArray(data);
            if (found.length) {
                LOG('territoryUserItems yielded 0; auto-detected', found.length, 'items elsewhere');
                items = found;
            }
        }

        if (DEBUG) LOG('decoded territoryUserItems:', tui.length, '| parsed items:', items.length);

        return items;
    }

    async function collectItem(it) {
        // td = base64( cx.b36 +"O"+ cy.b36 +"O"+ rowId.b36 +"O"+ ts.b36 )
        const td = btoa(b36(it.cx) + 'O' + b36(it.cy) + 'O' + b36(it.rid) + 'O' + b36(it.ts));
        const url = '/city.php?rfcv=' + encodeURIComponent(getRfc());
        const body = 'step=uif&td=' + encodeURIComponent(td);
        const text = await rawRequest('POST', url, body);
        let res;
        try { res = JSON.parse(text); } catch (e) { res = { success: false }; }
        return res && res.success === true;
    }

    function itemImg(itemId) {
        return 'https://www.torn.com/images/items/' + itemId + '/small.png';
    }

    /* --------------------------------------------------------------- prices */
    // priceMap: { itemId(number): market_value(number) }. Cached in storage and
    // refreshed from the Torn API (items selection) at most once per 6h.
    let priceMap = null;
    const PRICE_TTL = 6 * 60 * 60 * 1000;

    function loadPriceCache() {
        const c = Store.get('prices', null);
        if (c && c.map && (Date.now() - (c.ts || 0) < PRICE_TTL)) priceMap = c.map;
        return priceMap;
    }

    function fmtMoney(n) {
        if (n == null || isNaN(n)) return '—';
        return '$' + Math.round(n).toLocaleString('en-US');
    }

    function tornApiItems(key) {
        return new Promise((resolve, reject) => {
            const url = 'https://api.torn.com/torn/?selections=items&key=' + encodeURIComponent(key) + '&comment=CityItemFinder';
            const handle = (txt) => {
                let j;
                try { j = JSON.parse(txt); } catch (e) { return reject(new Error('Bad API response')); }
                if (j.error) return reject(new Error('API error ' + j.error.code + ': ' + j.error.error));
                const map = {};
                const items = j.items || {};
                for (const id in items) {
                    const v = items[id];
                    map[parseInt(id, 10)] = (v && (v.market_value != null ? v.market_value : v.value)) || 0;
                }
                resolve(map);
            };
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET', url, timeout: 20000,
                    onload: r => handle(r.responseText),
                    onerror: () => reject(new Error('Network error')),
                    ontimeout: () => reject(new Error('Timed out'))
                });
            } else {
                fetch(url).then(r => r.text()).then(handle).catch(reject);
            }
        });
    }

    async function refreshPrices(force) {
        if (!settings.apiKey) return null;
        if (!force && loadPriceCache()) return priceMap;
        try {
            const map = await tornApiItems(settings.apiKey);
            priceMap = map;
            Store.set('prices', { ts: Date.now(), map });
            return map;
        } catch (e) {
            LOG('price refresh failed:', e.message);
            throw e;
        }
    }

    function valueOf(it) {
        if (!priceMap) return null;
        const v = priceMap[it.itemId];
        return (v == null) ? null : v;
    }

    /* ----------------------------------------------- native call interceptor */
    // Capture Torn's own mapData response (the game's known-good request) so we can
    // compare it to ours and, if needed, use it directly. Torn's map uses XHR; this
    // also catches any fetch-based variant. Wrapped in try/catch so a failure here
    // never breaks the rest of the script.
    const nativeCapture = { text: null, url: null, when: 0 };

    function installNativeCapture() {
        try {
            const w = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;

            const XHR = w.XMLHttpRequest;
            if (XHR && XHR.prototype && !XHR.prototype.__cifPatched) {
                const _open = XHR.prototype.open;
                const _send = XHR.prototype.send;
                XHR.prototype.open = function (method, url) {
                    try { this.__cifUrl = url; } catch (e) {}
                    return _open.apply(this, arguments);
                };
                XHR.prototype.send = function () {
                    try {
                        const self = this;
                        this.addEventListener('load', function () {
                            try {
                                const u = self.__cifUrl || '';
                                if (typeof u === 'string' && u.indexOf('step=mapData') >= 0) {
                                    nativeCapture.text = self.responseText;
                                    nativeCapture.url = u;
                                    nativeCapture.when = Date.now();
                                    LOG('captured native mapData via XHR (' + (self.responseText || '').length + ' chars)');
                                }
                            } catch (e) {}
                        });
                    } catch (e) {}
                    return _send.apply(this, arguments);
                };
                XHR.prototype.__cifPatched = true;
            }

            const _fetch = w.fetch;
            if (_fetch && !_fetch.__cifPatched) {
                const patched = function (input, init) {
                    let u = '';
                    try { u = (typeof input === 'string') ? input : (input && input.url) || ''; } catch (e) {}
                    const p = _fetch.apply(this, arguments);
                    if (typeof u === 'string' && u.indexOf('step=mapData') >= 0) {
                        try {
                            p.then(r => {
                                r.clone().text().then(t => {
                                    nativeCapture.text = t; nativeCapture.url = u; nativeCapture.when = Date.now();
                                    LOG('captured native mapData via fetch (' + (t || '').length + ' chars)');
                                }).catch(() => {});
                            }).catch(() => {});
                        } catch (e) {}
                    }
                    return p;
                };
                patched.__cifPatched = true;
                w.fetch = patched;
            }
        } catch (e) {
            LOG('native capture install failed:', e);
        }
    }

    /* ----------------------------------------------------- full debug request */
    function rawRequestFull(method, url, body, extraHeaders) {
        const headers = Object.assign({ 'X-Requested-With': 'XMLHttpRequest' }, extraHeaders || {});
        if (body && !headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
        let pf = (typeof fetch === 'function') ? fetch : null;
        try {
            if (typeof unsafeWindow !== 'undefined' && unsafeWindow && typeof unsafeWindow.fetch === 'function') {
                pf = unsafeWindow.fetch.bind(unsafeWindow);
            }
        } catch (e) {}
        return Promise.resolve(pf(url, { method, headers, credentials: 'include', body: body || undefined }))
            .then(r => r.text().then(t => ({
                status: r.status,
                contentType: (r.headers && r.headers.get) ? r.headers.get('content-type') : '?',
                text: t
            })));
    }

    /* ----------------------------------------------------------- diagnostics */
    async function runDiagnostics() {
        const L = [];
        L.push('=== City Item Finder diagnostics v' + VERSION + ' ===');
        L.push('href: ' + location.href);
        const rfc = getRfc();
        L.push('rfc_v cookie: ' + (rfc ? ('present (' + rfc.length + ' chars)') : 'MISSING'));

        const url = '/city.php?rfcv=' + encodeURIComponent(rfc) + '&step=mapData';
        L.push('our request URL: ' + url);
        let full;
        try { full = await rawRequestFull('GET', url, null, { 'Accept': 'application/json, text/javascript, */*; q=0.01' }); }
        catch (e) { full = { error: String(e) }; }

        if (full.error) {
            L.push('our request ERROR: ' + full.error);
        } else {
            L.push('status: ' + full.status + ' | content-type: ' + full.contentType);
            L.push('length: ' + (full.text || '').length + ' | starts: ' + JSON.stringify((full.text || '').slice(0, 60)));
            let d = null, ok = false;
            try { d = JSON.parse((full.text || '').replace(/^\uFEFF/, '').trim()); ok = true; } catch (e) {}
            L.push('JSON parse: ' + (ok ? 'OK' : 'FAILED'));
            if (ok) {
                L.push('top-level keys: ' + JSON.stringify(Object.keys(d || {})));
                const rawTUI = d && d.territoryUserItems;
                L.push('territoryUserItems field type: ' + (Array.isArray(rawTUI) ? 'array' : typeof rawTUI) +
                    (typeof rawTUI === 'string' ? (' (len ' + rawTUI.length + ', base64-encoded)') : ''));
                const tui = decodeTUI(d);
                L.push('decoded item count: ' + tui.length);
                if (tui.length) {
                    L.push('>>> decoded sample (first 3): ' + JSON.stringify(tui.slice(0, 3)));
                    const parsed = tui.map(parseItem).filter(Boolean);
                    L.push('parsed by script: ' + parsed.length + (parsed.length ? (' | first: ' + JSON.stringify({ itemId: parsed[0].itemId, title: parsed[0].title })) : ''));
                }
                const auto = findItemArray(d);
                L.push('auto-detected item-array length: ' + auto.length);
            }
        }

        if (nativeCapture.text) {
            L.push('--- native mapData captured ' + Math.round((Date.now() - nativeCapture.when) / 1000) + 's ago ---');
            L.push('native url: ' + nativeCapture.url);
            L.push('native length: ' + nativeCapture.text.length);
            let nd = null; try { nd = JSON.parse(nativeCapture.text); } catch (e) {}
            if (nd) {
                L.push('native top-level keys: ' + JSON.stringify(Object.keys(nd)));
                const ntui = decodeTUI(nd);
                L.push('native decoded item count: ' + ntui.length);
                const np = ntui.map(parseItem).filter(Boolean);
                L.push('native parsed by script: ' + np.length);
            }
        } else {
            L.push('native mapData: NOT captured yet — switch to the Quick Links tab and back to Map (or reload) to trigger Torn\'s own request, then run Debug again.');
        }

        const report = L.join('\n');
        LOG(report);

        // Dump the decoded item list (titles + ids), not the base64 blob.
        let raw = '';
        try {
            const d2 = (full && full.text) ? JSON.parse(full.text.replace(/^\uFEFF/, '').trim()) : null;
            const list = decodeTUI(d2).map(parseItem).filter(Boolean);
            if (list.length) {
                raw += '\n\n===== decoded items (' + list.length + ') =====\n' +
                    list.map(x => x.itemId + '  ' + x.title).join('\n');
            }
        } catch (e) {}
        showDebugOverlay(report + raw);
    }

    function showDebugOverlay(text) {
        const ov = panel.querySelector('.cif-debug');
        ov.querySelector('textarea').value = text;
        ov.classList.add('cif-open');
    }

    /* --------------------------------------------------------------- tap bind */
    // Reliable tap on TornPDA: fire on touchend only when the finger did not move
    // (so list scrolling never triggers a collect), and suppress the synthetic
    // click that follows a real touch.
    function bindTap(el, handler) {
        let sx = 0, sy = 0, moved = false, lastTouch = 0;
        el.addEventListener('touchstart', e => {
            const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; moved = false;
        }, { passive: true });
        el.addEventListener('touchmove', e => {
            const t = e.changedTouches[0];
            if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) moved = true;
        }, { passive: true });
        el.addEventListener('touchend', e => {
            if (moved) return;
            lastTouch = Date.now();
            e.preventDefault();
            handler(e);
        });
        el.addEventListener('click', e => {
            if (Date.now() - lastTouch < 600) return; // swallow ghost click
            handler(e);
        });
    }

    /* ----------------------------------------------------------------- styles */
    function injectStyles() {
        if (document.getElementById('cif-styles')) return;
        const css = `
        #cif-fab{
            position:fixed; width:52px; height:52px; border-radius:50%;
            background:linear-gradient(145deg,#1f6feb,#0b4aa2);
            box-shadow:0 4px 14px rgba(0,0,0,.45); cursor:pointer; z-index:2147483600;
            display:flex; align-items:center; justify-content:center;
            color:#fff; font-size:22px; user-select:none; touch-action:none;
            border:1px solid rgba(255,255,255,.25);
        }
        #cif-fab .cif-badge{
            position:absolute; top:-4px; right:-4px; min-width:18px; height:18px;
            padding:0 4px; border-radius:9px; background:#e3493a; color:#fff;
            font-size:11px; font-weight:700; line-height:18px; text-align:center;
            box-shadow:0 1px 4px rgba(0,0,0,.4); display:none;
        }
        #cif-panel{
            position:fixed; z-index:2147483601; width:300px; max-width:calc(100vw - 24px);
            max-height:min(70vh,520px); display:none; flex-direction:column;
            background:rgba(20,24,33,.92); backdrop-filter:blur(10px);
            -webkit-backdrop-filter:blur(10px); color:#e6edf3;
            border:1px solid rgba(255,255,255,.12); border-radius:14px;
            box-shadow:0 12px 40px rgba(0,0,0,.55); overflow:hidden;
            font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        }
        #cif-panel.cif-open{ display:flex; }
        .cif-head{
            display:flex; align-items:center; gap:8px; padding:10px 12px;
            background:rgba(255,255,255,.04); border-bottom:1px solid rgba(255,255,255,.08);
        }
        .cif-head .cif-title{ font-weight:700; font-size:14px; flex:1; }
        .cif-head .cif-sub{ font-size:11px; opacity:.6; font-weight:400; margin-left:6px; }
        .cif-iconbtn{
            width:30px; height:30px; border-radius:8px; border:1px solid rgba(255,255,255,.12);
            background:rgba(255,255,255,.06); color:#e6edf3; cursor:pointer;
            display:flex; align-items:center; justify-content:center; font-size:15px;
        }
        .cif-iconbtn:active{ background:rgba(255,255,255,.16); }
        .cif-toolbar{
            display:flex; gap:8px; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.08);
        }
        .cif-btn{
            flex:1; padding:9px 10px; border-radius:10px; border:1px solid rgba(255,255,255,.14);
            background:rgba(255,255,255,.06); color:#e6edf3; font-size:13px; font-weight:600;
            cursor:pointer; text-align:center;
        }
        .cif-btn.cif-primary{ background:linear-gradient(145deg,#1f6feb,#0b4aa2); border-color:transparent; }
        .cif-btn:active{ filter:brightness(1.15); }
        .cif-btn[disabled]{ opacity:.45; pointer-events:none; }
        .cif-list{ overflow-y:auto; -webkit-overflow-scrolling:touch; padding:6px; flex:1; }
        .cif-row{
            display:flex; align-items:center; gap:10px; padding:8px; border-radius:10px;
            margin-bottom:6px; background:rgba(255,255,255,.04);
            border:1px solid rgba(255,255,255,.06);
        }
        .cif-row.cif-done{ opacity:.4; }
        .cif-row.cif-fail{ border-color:rgba(227,73,58,.6); }
        .cif-row img{ width:32px; height:32px; object-fit:contain; flex:none; }
        .cif-row .cif-meta{ flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
        .cif-row .cif-name{ font-size:13px; line-height:1.2; }
        .cif-row .cif-val{ font-size:11px; font-weight:700; color:#7ee787; line-height:1.2; }
        .cif-row .cif-collect{
            flex:none; padding:7px 12px; border-radius:8px; border:none;
            background:linear-gradient(145deg,#2ea043,#1a7431); color:#fff;
            font-size:12px; font-weight:700; cursor:pointer;
        }
        .cif-row .cif-collect:active{ filter:brightness(1.15); }
        .cif-row .cif-collect[disabled]{ opacity:.5; pointer-events:none; }
        .cif-empty{ text-align:center; padding:26px 14px; opacity:.6; font-size:13px; }
        .cif-foot{
            display:flex; align-items:center; gap:6px; padding:8px 12px;
            border-top:1px solid rgba(255,255,255,.08); font-size:11px; opacity:.85;
        }
        .cif-foot label{ display:flex; align-items:center; gap:5px; cursor:pointer; opacity:.8; }
        .cif-foot .cif-total{ font-weight:700; color:#7ee787; white-space:nowrap; }
        .cif-foot .cif-count{ white-space:nowrap; opacity:.7; }
        .cif-link{ color:#58a6ff; cursor:pointer; text-decoration:underline; }
        .cif-spin{ animation:cif-spin 1s linear infinite; }
        @keyframes cif-spin{ to{ transform:rotate(360deg); } }
        #cif-toast{
            position:fixed; left:50%; bottom:88px; transform:translateX(-50%);
            background:rgba(20,24,33,.95); color:#e6edf3; padding:10px 16px;
            border-radius:10px; font-size:13px; z-index:2147483602;
            box-shadow:0 6px 24px rgba(0,0,0,.5); border:1px solid rgba(255,255,255,.12);
            opacity:0; transition:opacity .2s; pointer-events:none; max-width:80vw; text-align:center;
        }
        #cif-toast.cif-show{ opacity:1; }
        .cif-debug,.cif-settings{
            position:absolute; inset:0; background:rgba(10,12,16,.985);
            display:none; flex-direction:column; z-index:5;
        }
        .cif-debug.cif-open,.cif-settings.cif-open{ display:flex; }
        .cif-dhead{
            display:flex; gap:8px; padding:8px 10px;
            border-bottom:1px solid rgba(255,255,255,.1);
        }
        .cif-debug textarea{
            flex:1; width:100%; box-sizing:border-box; background:#0b0e13;
            color:#cdd9e5; border:none; outline:none; padding:8px;
            font:11px/1.45 ui-monospace,Menlo,Consolas,monospace; resize:none;
            white-space:pre; overflow:auto; -webkit-overflow-scrolling:touch;
        }
        .cif-sbody{ padding:12px; display:flex; flex-direction:column; gap:10px; overflow-y:auto; }
        .cif-slabel{ font-size:12px; opacity:.85; }
        .cif-key{
            width:100%; box-sizing:border-box; padding:9px 10px; border-radius:8px;
            background:#0b0e13; color:#e6edf3; border:1px solid rgba(255,255,255,.16);
            font:12px ui-monospace,Menlo,Consolas,monospace; outline:none;
        }
        .cif-srow{ display:flex; gap:8px; }
        .cif-sopt{ display:flex; align-items:center; gap:6px; font-size:12px; opacity:.85; cursor:pointer; }
        .cif-snote{ font-size:11px; opacity:.7; min-height:14px; line-height:1.4; }
        `;
        const el = document.createElement('style');
        el.id = 'cif-styles';
        el.textContent = css;
        document.head.appendChild(el);
    }

    /* ------------------------------------------------------------------- toast */
    let toastTimer = null;
    function toast(msg) {
        let t = document.getElementById('cif-toast');
        if (!t) { t = document.createElement('div'); t.id = 'cif-toast'; document.body.appendChild(t); }
        t.textContent = msg;
        t.classList.add('cif-show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('cif-show'), 2200);
    }

    /* -------------------------------------------------------------------- UI */
    let panel, fab, listEl, badgeEl, autoTimer = null, busy = false;
    let currentItems = [];

    function buildUI() {
        injectStyles();

        /* FAB */
        fab = document.createElement('div');
        fab.id = 'cif-fab';
        fab.innerHTML = '🔍<span class="cif-badge"></span>';
        document.body.appendChild(fab);
        badgeEl = fab.querySelector('.cif-badge');

        // position
        const fx = (settings.fabX != null) ? settings.fabX : (window.innerWidth - 68);
        const fy = (settings.fabY != null) ? settings.fabY : (window.innerHeight - 150);
        placeFab(fx, fy);
        makeFabDraggable();

        /* Panel */
        panel = document.createElement('div');
        panel.id = 'cif-panel';
        panel.innerHTML = `
            <div class="cif-head">
                <span class="cif-title">City Items <span class="cif-sub">v${VERSION}</span></span>
                <div class="cif-iconbtn" data-act="settings" title="Settings">⚙</div>
                <div class="cif-iconbtn" data-act="debug" title="Debug">🐛</div>
                <div class="cif-iconbtn" data-act="refresh" title="Refresh">⟳</div>
                <div class="cif-iconbtn" data-act="close" title="Close">✕</div>
            </div>
            <div class="cif-toolbar">
                <button class="cif-btn cif-primary" data-act="collect-all">Collect All</button>
            </div>
            <div class="cif-list"></div>
            <div class="cif-foot">
                <label><input type="checkbox" data-act="auto"> Auto-refresh (${settings.autoRefreshSecs}s)</label>
                <span style="flex:1"></span>
                <span class="cif-total"></span>
                <span class="cif-count"></span>
            </div>
            <div class="cif-debug">
                <div class="cif-dhead">
                    <span style="flex:1;font-weight:700;font-size:13px;align-self:center">Debug report</span>
                    <button class="cif-btn" data-act="dbg-copy" style="flex:none;padding:6px 12px">Copy</button>
                    <button class="cif-btn" data-act="dbg-close" style="flex:none;padding:6px 12px">Close</button>
                </div>
                <textarea readonly placeholder="Tap the bug icon to run diagnostics..."></textarea>
            </div>
            <div class="cif-settings">
                <div class="cif-dhead">
                    <span style="flex:1;font-weight:700;font-size:13px;align-self:center">Settings</span>
                    <button class="cif-btn" data-act="set-close" style="flex:none;padding:6px 12px">Close</button>
                </div>
                <div class="cif-sbody">
                    <div class="cif-slabel">Torn API key <span style="opacity:.55">(for item values — public/limited key is fine)</span></div>
                    <input type="text" class="cif-key" placeholder="paste API key" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
                    <div class="cif-srow">
                        <button class="cif-btn cif-primary" data-act="set-save" style="flex:2">Save &amp; load prices</button>
                        <button class="cif-btn" data-act="set-clear" style="flex:1">Clear</button>
                    </div>
                    <label class="cif-sopt"><input type="checkbox" data-act="set-sort"> Sort list by value (highest first)</label>
                    <div class="cif-srow">
                        <button class="cif-btn" data-act="set-refresh-prices" style="flex:1">Refresh prices now</button>
                    </div>
                    <div class="cif-snote"></div>
                </div>
            </div>`;
        document.body.appendChild(panel);
        listEl = panel.querySelector('.cif-list');

        bindTap(panel.querySelector('[data-act="refresh"]'), () => refresh());
        bindTap(panel.querySelector('[data-act="close"]'), () => togglePanel(false));
        bindTap(panel.querySelector('[data-act="collect-all"]'), () => collectAll());
        bindTap(panel.querySelector('[data-act="debug"]'), () => runDiagnostics());
        bindTap(panel.querySelector('[data-act="dbg-close"]'), () => panel.querySelector('.cif-debug').classList.remove('cif-open'));
        bindTap(panel.querySelector('[data-act="dbg-copy"]'), () => {
            const ta = panel.querySelector('.cif-debug textarea');
            const txt = ta.value;
            const done = () => toast('Debug report copied');
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(txt).then(done).catch(() => { ta.focus(); ta.select(); document.execCommand('copy'); done(); });
                } else {
                    ta.focus(); ta.select(); document.execCommand('copy'); done();
                }
            } catch (e) { ta.focus(); ta.select(); }
        });

        // settings overlay
        bindTap(panel.querySelector('[data-act="settings"]'), () => openSettings());
        bindTap(panel.querySelector('[data-act="set-close"]'), () => panel.querySelector('.cif-settings').classList.remove('cif-open'));
        bindTap(panel.querySelector('[data-act="set-save"]'), () => saveApiKey());
        bindTap(panel.querySelector('[data-act="set-clear"]'), () => {
            settings.apiKey = ''; saveSettings(); priceMap = null; Store.set('prices', null);
            panel.querySelector('.cif-key').value = '';
            setSettingsNote('API key cleared. Values hidden.');
            renderList();
        });
        bindTap(panel.querySelector('[data-act="set-refresh-prices"]'), () => {
            if (!settings.apiKey) { setSettingsNote('Add an API key first.'); return; }
            setSettingsNote('Refreshing prices…');
            refreshPrices(true).then(() => { setSettingsNote('Prices updated.'); renderList(); })
                .catch(e => setSettingsNote('Failed: ' + e.message));
        });
        const sortCb = panel.querySelector('[data-act="set-sort"]');
        sortCb.checked = !!settings.sortByValue;
        sortCb.addEventListener('change', () => { settings.sortByValue = sortCb.checked; saveSettings(); renderList(); });

        const autoCb = panel.querySelector('[data-act="auto"]');
        autoCb.checked = !!settings.autoRefresh;
        autoCb.addEventListener('change', () => {
            settings.autoRefresh = autoCb.checked;
            saveSettings();
            setupAuto();
        });

        setupAuto();
    }

    /* --------------------------------------------------------- settings ui */
    function setSettingsNote(msg) {
        const n = panel.querySelector('.cif-snote');
        if (n) n.textContent = msg || '';
    }

    function openSettings() {
        const keyInput = panel.querySelector('.cif-key');
        keyInput.value = settings.apiKey || '';
        panel.querySelector('[data-act="set-sort"]').checked = !!settings.sortByValue;
        const c = Store.get('prices', null);
        if (settings.apiKey && c && c.map) {
            const age = Math.round((Date.now() - (c.ts || 0)) / 60000);
            setSettingsNote('Prices loaded (' + Object.keys(c.map).length + ' items, ~' + age + ' min ago).');
        } else if (settings.apiKey) {
            setSettingsNote('Key saved. Tap "Refresh prices now" to load values.');
        } else {
            setSettingsNote('No API key set — item values are hidden.');
        }
        panel.querySelector('.cif-settings').classList.add('cif-open');
    }

    function saveApiKey() {
        const v = (panel.querySelector('.cif-key').value || '').trim();
        if (!v) { setSettingsNote('Please paste a key first.'); return; }
        settings.apiKey = v; saveSettings();
        setSettingsNote('Loading prices…');
        refreshPrices(true)
            .then(() => { setSettingsNote('Prices loaded. Values will show in the list.'); renderList(); })
            .catch(e => setSettingsNote('Saved, but price load failed: ' + e.message));
    }

    function placeFab(x, y) {
        x = Math.max(4, Math.min(x, window.innerWidth - 56));
        y = Math.max(4, Math.min(y, window.innerHeight - 56));
        fab.style.left = x + 'px';
        fab.style.top = y + 'px';
    }

    function makeFabDraggable() {
        let dragging = false, moved = false, ox = 0, oy = 0, sx = 0, sy = 0;

        const down = (px, py) => {
            dragging = true; moved = false;
            const r = fab.getBoundingClientRect();
            ox = px - r.left; oy = py - r.top; sx = px; sy = py;
        };
        const move = (px, py) => {
            if (!dragging) return;
            if (Math.abs(px - sx) > 6 || Math.abs(py - sy) > 6) moved = true;
            placeFab(px - ox, py - oy);
        };
        const up = () => {
            if (!dragging) return;
            dragging = false;
            if (moved) {
                const r = fab.getBoundingClientRect();
                settings.fabX = r.left; settings.fabY = r.top; saveSettings();
            } else {
                togglePanel();
            }
        };

        let lastTouch = 0; // suppress synthetic mouse events fired right after a touch
        const recentlyTouched = () => (Date.now() - lastTouch) < 700;

        // Touch path
        fab.addEventListener('touchstart', e => { const t = e.touches[0]; lastTouch = Date.now(); down(t.clientX, t.clientY); }, { passive: true });
        fab.addEventListener('touchmove', e => { const t = e.touches[0]; move(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
        fab.addEventListener('touchend', e => { lastTouch = Date.now(); e.preventDefault(); up(); }, { passive: false });
        fab.addEventListener('touchcancel', () => { dragging = false; });

        // Mouse path — ignored for a moment after a touch so the ghost
        // mousedown/mouseup that follow a tap don't toggle the panel a second time.
        fab.addEventListener('mousedown', e => { if (recentlyTouched()) return; down(e.clientX, e.clientY); e.preventDefault(); });
        window.addEventListener('mousemove', e => { if (recentlyTouched()) return; move(e.clientX, e.clientY); });
        window.addEventListener('mouseup', () => { if (recentlyTouched()) return; up(); });
    }

    function togglePanel(force) {
        const open = (force === undefined) ? !panel.classList.contains('cif-open') : force;
        panel.classList.toggle('cif-open', open);
        if (open) {
            anchorPanel();
            refresh();
        }
    }

    function anchorPanel() {
        // Position the panel near the FAB but kept on-screen.
        const r = fab.getBoundingClientRect();
        const pw = Math.min(300, window.innerWidth - 24);
        let left = r.left + r.width / 2 - pw / 2;
        left = Math.max(12, Math.min(left, window.innerWidth - pw - 12));
        panel.style.width = pw + 'px';
        panel.style.left = left + 'px';
        // open upward if FAB is in lower half
        if (r.top > window.innerHeight / 2) {
            panel.style.bottom = (window.innerHeight - r.top + 10) + 'px';
            panel.style.top = 'auto';
        } else {
            panel.style.top = (r.bottom + 10) + 'px';
            panel.style.bottom = 'auto';
        }
    }

    function setupAuto() {
        if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
        if (settings.autoRefresh) {
            autoTimer = setInterval(() => {
                if (panel.classList.contains('cif-open') && !busy) refresh(true);
            }, Math.max(8, settings.autoRefreshSecs) * 1000);
        }
    }

    function updateBadge(n) {
        badgeEl.style.display = n > 0 ? 'block' : 'none';
        badgeEl.textContent = n > 99 ? '99+' : String(n);
    }

    /* ---------------------------------------------------------------- render */
    function renderList() {
        const countEl = panel.querySelector('.cif-count');
        const totalEl = panel.querySelector('.cif-total');
        const collectAllBtn = panel.querySelector('[data-act="collect-all"]');
        listEl.innerHTML = '';

        if (!currentItems.length) {
            listEl.innerHTML = '<div class="cif-empty">No items in the city right now.<br>Tap ⟳ to check again.</div>';
            countEl.textContent = '';
            totalEl.textContent = '';
            collectAllBtn.disabled = true;
            return;
        }
        collectAllBtn.disabled = false;

        const havePrices = !!priceMap;

        // Optionally sort by value (highest first); unknown values sink to the bottom.
        const list = currentItems.slice();
        if (havePrices && settings.sortByValue) {
            list.sort((a, b) => (valueOf(b) || 0) - (valueOf(a) || 0));
        }

        let total = 0, anyVal = false;
        for (const it of list) {
            const val = valueOf(it);
            if (val != null) { total += val; anyVal = true; }

            const row = document.createElement('div');
            row.className = 'cif-row';
            row.dataset.row = it.rowId;
            const valHtml = havePrices
                ? `<div class="cif-val">${fmtMoney(val)}</div>`
                : '';
            row.innerHTML = `
                <img src="${itemImg(it.itemId)}" alt="" onerror="this.style.visibility='hidden'">
                <div class="cif-meta">
                    <div class="cif-name">${escapeHtml(it.title)}</div>
                    ${valHtml}
                </div>
                <button class="cif-collect">Collect</button>`;
            const btn = row.querySelector('.cif-collect');
            bindTap(btn, () => doCollect(it, row, btn));
            listEl.appendChild(row);
        }

        countEl.textContent = list.length + ' item' + (list.length === 1 ? '' : 's');
        if (havePrices && anyVal) {
            totalEl.textContent = 'Total ' + fmtMoney(total) + '  ·  ';
        } else if (!havePrices) {
            totalEl.innerHTML = '<span class="cif-link" data-act="set-prompt">+ values</span>  ·  ';
            const link = totalEl.querySelector('[data-act="set-prompt"]');
            if (link) bindTap(link, () => openSettings());
        } else {
            totalEl.textContent = '';
        }
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    /* ---------------------------------------------------------------- actions */
    async function refresh(silent) {
        if (busy) return;
        busy = true;
        const refBtn = panel.querySelector('[data-act="refresh"]');
        refBtn.classList.add('cif-spin');
        try {
            currentItems = await fetchCityItems();
            updateBadge(currentItems.length);
            renderList();
        } catch (e) {
            LOG('refresh error', e);
            if (!silent) toast('Error: ' + e.message);
        } finally {
            refBtn.classList.remove('cif-spin');
            busy = false;
        }
    }

    async function doCollect(it, row, btn) {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.textContent = '...';
        try {
            const ok = await collectItem(it);
            if (ok) {
                row.classList.add('cif-done');
                btn.textContent = '✓ Got it';
                toast('Collected: ' + it.title);
                currentItems = currentItems.filter(x => x.rowId !== it.rowId);
                updateBadge(currentItems.length);
                setTimeout(() => { row.remove(); if (!currentItems.length) renderList(); }, 600);
                return true;
            } else {
                row.classList.add('cif-fail');
                btn.textContent = 'Gone';
                toast(it.title + ' could not be collected (already taken?)');
                return false;
            }
        } catch (e) {
            btn.disabled = false;
            btn.textContent = 'Retry';
            toast('Network error collecting ' + it.title);
            return false;
        }
    }

    async function collectAll() {
        if (busy) return;
        busy = true;
        const allBtn = panel.querySelector('[data-act="collect-all"]');
        allBtn.disabled = true;
        const rows = Array.from(listEl.querySelectorAll('.cif-row'));
        let got = 0;
        for (const row of rows) {
            const rowId = row.dataset.row;
            const it = currentItems.find(x => x.rowId === rowId);
            if (!it) continue;
            const btn = row.querySelector('.cif-collect');
            const ok = await doCollect(it, row, btn);
            if (ok) got++;
            await new Promise(r => setTimeout(r, 450)); // gentle on the server
        }
        busy = false;
        allBtn.disabled = false;
        toast('Collect All done — ' + got + ' collected');
    }

    /* ------------------------------------------------------------------- boot */
    function boot() {
        if (document.getElementById('cif-fab')) return;
        installNativeCapture();
        buildUI();
        // load cached prices; refresh in background if we have a key and cache is stale
        loadPriceCache();
        if (settings.apiKey && !priceMap) {
            refreshPrices(false).then(() => renderList()).catch(() => {});
        }
        // background prime so the badge shows a count without opening the panel
        fetchCityItems().then(items => {
            currentItems = items;
            updateBadge(items.length);
        }).catch(() => {});
        LOG('ready v' + VERSION);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
