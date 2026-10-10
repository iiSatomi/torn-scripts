// ==UserScript==
// @name         Frostbite Faction Usage Reporter (Member)
// @namespace    frostbite.intel
// @version      1.0.0
// @description  Reads YOUR OWN personal stats (your key can only ever read your own data — this never touches anyone else's account) and submits them to your faction's shared sheet.
// @author       Frostbite
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const APP_ID = 'frostbite-member-report';
    const SETTINGS_KEY = 'ffr.settings.v1';
    const API_BASE = 'https://api.torn.com';

    const STAT_FIELDS = [
        { key: 'xantaken',    label: 'Xanax Taken',    aliases: ['xantaken', 'xanaxused'] },
        { key: 'alcoholused', label: 'Alcohol Used',   aliases: ['alcoholused', 'alcohol_used'] },
        { key: 'drugsused',   label: 'Drugs Used',     aliases: ['drugsused', 'drugs_used'] },
        { key: 'refills',     label: 'Energy Refills', aliases: ['refills', 'energyrefills'] },
        { key: 'nerverefills',label: 'Nerve Refills',  aliases: ['nerverefills', 'nerve_refills'] },
        { key: 'statenhancersused', label: 'Stat Enhancers', aliases: ['statenhancersused'] },
        { key: 'networth', label: 'Networth', aliases: [] },
        { key: 'energy', label: 'Current Energy', aliases: [] }
    ];

    let settings = loadJSON(SETTINGS_KEY, { apiKey: '', sheetUrl: '', secret: '', autoUpdate: false });
    let lastFetched = null; // {id, name, position, stats}
    let autoTimer = null;
    const AUTO_INTERVAL_MS = 5 * 60 * 1000;

    init();

    function init() {
        if (document.getElementById(APP_ID)) return;
        injectStyles();
        buildUI();
        if (settings.autoUpdate) startAutoUpdate();
    }

    function startAutoUpdate() {
        stopAutoUpdate();
        autoTimer = setInterval(runAutoCycle, AUTO_INTERVAL_MS);
        runAutoCycle(); // fire once immediately
    }

    function stopAutoUpdate() {
        if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    }

    async function runAutoCycle() {
        await pullMyStats();
        if (lastFetched) await submitReport();
    }

    function loadJSON(key, fallback) {
        try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }; }
        catch (_) { return fallback; }
    }
    function save() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }

    const gmXhr = (typeof GM_xmlhttpRequest !== 'undefined') ? GM_xmlhttpRequest
        : (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest
        : null;

    function gmFetchJSON(url, options = {}) {
        if (!gmXhr) return Promise.reject(new Error('GM_xmlhttpRequest not available — enable it under the userscript manager permissions.'));
        return new Promise((resolve, reject) => {
            gmXhr({
                method: options.method || 'GET',
                url,
                data: options.body,
                headers: options.headers || {},
                onload: (res) => {
                    try { resolve(JSON.parse(res.responseText)); }
                    catch (e) { reject(new Error('Bad JSON response: ' + res.responseText.slice(0, 200))); }
                },
                onerror: () => reject(new Error('Network error contacting the sheet backend.')),
                ontimeout: () => reject(new Error('Request timed out.'))
            });
        });
    }

    async function apiGet(path) {
        const url = `${API_BASE}${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(settings.apiKey)}`;
        const res = await fetch(url);
        return res.json();
    }

    async function pullMyStats() {
        if (!settings.apiKey) { setStatus('Enter your own API key first.'); return; }
        setStatus('Fetching your personal stats…');

        // Your own key against yourself never returns error 7 — a key always has
        // full access to its own owner's data, that's how Torn's API is designed.
        const [profileRes, statsRes, barsRes] = await Promise.all([
            apiGet('/user/?selections=profile'),
            apiGet('/user/?selections=personalstats'),
            apiGet('/user/?selections=bars')
        ]);

        if (profileRes.error || statsRes.error || barsRes.error) {
            setStatus(`API error: ${(profileRes.error || statsRes.error || barsRes.error).error}`);
            return;
        }

        const ps = statsRes.personalstats || {};
        const stats = {};
        STAT_FIELDS.forEach(f => {
            for (const alias of f.aliases) {
                if (ps[alias] !== undefined) { stats[f.key] = ps[alias]; break; }
            }
        });
        if (profileRes.networth !== undefined) stats.networth = profileRes.networth;
        if (barsRes.energy?.current !== undefined) stats.energy = barsRes.energy.current;

        lastFetched = {
            id: String(profileRes.player_id || ''),
            name: profileRes.name || '',
            position: profileRes.faction?.position || '',
            stats
        };

        document.querySelector(`#${APP_ID} .ffr-name`).textContent = lastFetched.name;
        document.querySelector(`#${APP_ID} .ffr-id`).textContent = lastFetched.id;
        STAT_FIELDS.forEach(f => {
            document.querySelector(`#${APP_ID} .ffr-stat[data-key="${f.key}"]`).textContent =
                stats[f.key] !== undefined ? stats[f.key] : '—';
        });
        setStatus('Loaded. Review the numbers, then submit.');
    }

    async function submitReport() {
        if (!lastFetched) { setStatus('Fetch your stats first.'); return; }
        if (!settings.sheetUrl || !settings.secret) { setStatus('Set the faction sheet URL + secret in Settings.'); return; }

        setStatus('Submitting…');
        try {
            const data = await gmFetchJSON(settings.sheetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    secret: settings.secret,
                    id: lastFetched.id,
                    name: lastFetched.name,
                    position: lastFetched.position,
                    stats: lastFetched.stats,
                    source: 'api-self'
                })
            });
            setStatus(data.ok ? 'Submitted! Thanks.' : `Submit failed: ${data.error}`);
        } catch (e) {
            setStatus(`Submit failed: ${e.message}`);
        }
    }

    function setStatus(msg) {
        const el = document.querySelector(`#${APP_ID} .ffr-status`);
        if (el) el.textContent = msg;
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #${APP_ID} { position: fixed; top: 90px; right: 14px; width: 300px;
                background: #08121b; border: 1px solid #29475c; border-radius: 8px;
                color: #edf4fb; font: 11px/1.4 Arial, sans-serif; z-index: 999999; padding: 10px; }
            #${APP_ID} h3 { margin: 6px 0 4px; color: #8ad5ff; font-size: 12px; }
            #${APP_ID} input, #${APP_ID} button { font: inherit; background: #0a1823; color: #edf4fb;
                border: 1px solid #2e5874; border-radius: 4px; padding: 4px; width: 100%; margin-bottom: 4px; }
            #${APP_ID} button { cursor: pointer; }
            #${APP_ID} button:hover { border-color: #55b7ff; }
            #${APP_ID} table { width: 100%; font-size: 10px; margin-top: 4px; }
            #${APP_ID} td { padding: 2px 0; }
            #${APP_ID} .ffr-status { color: #99aab8; min-height: 14px; margin-top: 4px; }
            #${APP_ID} .ffr-drag-handle { cursor: move; user-select: none; background: #0a1823;
                border: 1px solid #2e5874; border-radius: 4px; padding: 5px 8px; margin-bottom: 8px;
                color: #8ad5ff; font-weight: bold; letter-spacing: 0.3px; touch-action: none; }
            #${APP_ID} .ffr-drag-handle:active { border-color: #55b7ff; }
        `;
        document.head.appendChild(style);
    }

    function makeDraggable(root, handle) {
        let dragging = false;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        handle.addEventListener('pointerdown', (e) => {
            dragging = true;
            handle.setPointerCapture(e.pointerId);
            const rect = root.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            startX = e.clientX;
            startY = e.clientY;
            root.style.right = 'auto';
        });

        handle.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            let left = startLeft + (e.clientX - startX);
            let top = startTop + (e.clientY - startY);
            left = Math.max(0, Math.min(window.innerWidth - 60, left));
            top = Math.max(0, Math.min(window.innerHeight - 30, top));
            root.style.left = `${left}px`;
            root.style.top = `${top}px`;
        });

        handle.addEventListener('pointerup', (e) => {
            if (!dragging) return;
            dragging = false;
            handle.releasePointerCapture(e.pointerId);
            const rect = root.getBoundingClientRect();
            settings.pos = { left: rect.left, top: rect.top };
            save();
        });
    }

    function buildUI() {
        const root = document.createElement('div');
        root.id = APP_ID;
        root.innerHTML = `
            <div class="ffr-drag-handle">⠿ Frostbite Reporter</div>
            <h3>Settings (ask your leader for these)</h3>
            <input class="ffr-api-key" type="password" placeholder="Your own Torn API key" value="${settings.apiKey}">
            <input class="ffr-sheet-url" placeholder="Faction sheet Web App URL" value="${settings.sheetUrl}">
            <input class="ffr-secret" type="password" placeholder="Submit secret (from your leader)" value="${settings.secret}">
            <button class="ffr-save">Save Settings</button>

            <h3>My Stats</h3>
            <button class="ffr-fetch">Fetch My Stats</button>
            <table>
                <tr><td>Name:</td><td class="ffr-name">—</td></tr>
                <tr><td>ID:</td><td class="ffr-id">—</td></tr>
                ${STAT_FIELDS.map(f => `<tr><td>${f.label}:</td><td class="ffr-stat" data-key="${f.key}">—</td></tr>`).join('')}
            </table>
            <button class="ffr-submit">Submit to Faction Sheet</button>
            <label style="display:flex; align-items:center; gap:6px; margin-top:4px;">
                <input type="checkbox" class="ffr-auto" style="width:auto;" ${settings.autoUpdate ? 'checked' : ''}>
                Auto-fetch &amp; submit every 5 minutes (while this tab is open)
            </label>
            <div class="ffr-status"></div>
        `;
        document.body.appendChild(root);

        if (settings.pos && Number.isFinite(settings.pos.left) && Number.isFinite(settings.pos.top)) {
            root.style.left = `${settings.pos.left}px`;
            root.style.top = `${settings.pos.top}px`;
            root.style.right = 'auto';
        }
        makeDraggable(root, root.querySelector('.ffr-drag-handle'));

        root.querySelector('.ffr-save').addEventListener('click', () => {
            settings.apiKey = root.querySelector('.ffr-api-key').value.trim();
            settings.sheetUrl = root.querySelector('.ffr-sheet-url').value.trim();
            settings.secret = root.querySelector('.ffr-secret').value.trim();
            save();
            setStatus('Settings saved locally (only on this browser).');
        });
        root.querySelector('.ffr-fetch').addEventListener('click', pullMyStats);
        root.querySelector('.ffr-submit').addEventListener('click', submitReport);
        root.querySelector('.ffr-auto').addEventListener('change', (e) => {
            settings.autoUpdate = e.target.checked;
            save();
            if (settings.autoUpdate) { startAutoUpdate(); setStatus('Auto-update on — will fetch & submit every 5 min while this tab stays open.'); }
            else { stopAutoUpdate(); setStatus('Auto-update off.'); }
        });
    }
})();
