// ==UserScript==
// @name         Torn - OC Flight Guard
// @namespace    http://tampermonkey.net/
// @version      7.3
// @description  Stops you flying when it would make you miss your faction's Organized Crime. Uses Torn's own per-destination OC conflict flag (works in TornPDA), shows clear warnings, and explains exactly what's happening.
// @author       iSatomi [3580191]
// @match        https://www.torn.com/travelagency.php*
// @match        https://www.torn.com/page.php*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// @run-at       document-idle
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/566888/Torn%20-%20OC%20Flight%20Guard.user.js
// @updateURL https://update.greasyfork.org/scripts/566888/Torn%20-%20OC%20Flight%20Guard.meta.js
// ==/UserScript==

(function () {
    'use strict';

    const isTravel = location.href.includes('travelagency') || location.href.includes('sid=travel');
    if (!isTravel) return;

    // ═══════════════════════════════════════════════════════════════════════
    // BACKGROUND
    // ═══════════════════════════════════════════════════════════════════════
    // Every destination in Torn's travel page data-model has an `ocReadyBeforeBack`
    // boolean per travel type, computed by Torn's server. It's true iff your OC
    // would fire during the trip. This is the authoritative signal and it requires
    // no API access at all.
    //
    // Optionally we also fetch /user?selections=basic,profile to get the OC name
    // and a countdown for the status display. This is best-effort — if it fails
    // (TornPDA proxy issues, no API key, etc.) blocking still works via the DOM
    // flag alone.
    //
    // The v2 /faction/crimes endpoints are intentionally NOT used: TornPDA's API
    // proxy rewrites `{id}` parameters in v2 paths with the user's player_id,
    // which breaks every v2 faction URL with "Incorrect ID-entity relation" (7).
    // ═══════════════════════════════════════════════════════════════════════

    // Sanity caps so a typo can't make the script useless.
    // OC windows max out around 7 days, so allow generous headroom for testing:
    // stay caps at 14 days (20160m); buffer caps at 24h (1440m).
    const STAY_MAX   = 20160;
    const BUFFER_MAX = 1440;
    function clampStay(n)   { return Math.max(0, Math.min(STAY_MAX,   parseInt(n) || 0)); }
    function clampBuffer(n) { return Math.max(0, Math.min(BUFFER_MAX, parseInt(n) || 0)); }

    const CFG = {
        stayMinutes:   clampStay(GM_getValue('ocg_stay',   '30')),
        bufferMinutes: clampBuffer(GM_getValue('ocg_buffer', '5')),
        apiKey:        (GM_getValue('ocg_apikey', '') || '').trim(),
        helpSeen:      GM_getValue('ocg_helpseen', 'false') === 'true',
    };
    // Heal any previously-saved broken values
    GM_setValue('ocg_stay',   String(CFG.stayMinutes));
    GM_setValue('ocg_buffer', String(CFG.bufferMinutes));

    function saveCFG() {
        GM_setValue('ocg_stay',     String(CFG.stayMinutes));
        GM_setValue('ocg_buffer',   String(CFG.bufferMinutes));
        GM_setValue('ocg_apikey',   CFG.apiKey);
        GM_setValue('ocg_helpseen', String(CFG.helpSeen));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════
    let userInfo       = null;   // { playerId, factionId, factionName, role }
    let userInfoPending = false;
    let userInfoError  = null;
    let lastApiFetch   = 0;
    let applyingBlock  = false;
    let rootObserver   = null;
    let stashedButton  = null;
    let bypassInterceptor = false;
    let mobileInterceptorAttached = false;
    let refreshTimer   = null;

    const API_TTL = 60_000;
    const nowSec  = () => Math.floor(Date.now() / 1000);

    // ═══════════════════════════════════════════════════════════════════════
    // FORMATTING
    // ═══════════════════════════════════════════════════════════════════════
    const fmtMins = m => m < 60 ? `${m}m` : `${Math.floor(m/60)}h ${m%60}m`;
    const fmtSecs = s => {
        if (s <= 0) return 'now';
        const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };
    function escapeAttr(s) { return String(s || '').replace(/"/g, '&quot;'); }
    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // API: optional user info only
    // ═══════════════════════════════════════════════════════════════════════
    function fetchUserInfo(force) {
        if (!CFG.apiKey || CFG.apiKey.length !== 16) {
            userInfo = null; userInfoError = null;
            renderUI();
            return;
        }
        if (!force && Date.now() - lastApiFetch < API_TTL) return;
        lastApiFetch = Date.now();
        userInfoPending = true;
        userInfoError = null;
        renderUI();

        apiGet(`https://api.torn.com/user/?selections=profile&key=${CFG.apiKey}&comment=OCFlightGuard`)
            .then(d => {
                userInfoPending = false;
                if (!d) { userInfoError = 'Empty response'; renderUI(); return; }
                if (d.error) {
                    const c = d.error.code;
                    if (c === 2)       userInfoError = 'API key is invalid.';
                    else if (c === 16) userInfoError = 'Your API key needs "Public" access at minimum.';
                    else               userInfoError = `API error ${c}: ${d.error.error}`;
                    userInfo = null;
                    renderUI();
                    return;
                }
                userInfo = {
                    playerId:    d.player_id || null,
                    factionId:   (d.faction && d.faction.faction_id) || null,
                    factionName: (d.faction && d.faction.faction_name) || null,
                    role:        (d.faction && d.faction.position) || null,
                };
                console.log('[OCG] user info:', JSON.stringify(userInfo));
                renderUI();
            })
            .catch(e => {
                userInfoPending = false;
                userInfoError = 'Network error: ' + (e.message || 'unknown');
                renderUI();
            });
    }

    function apiGet(url) {
        return new Promise((resolve, reject) => {
            let done = false;
            const ok = j => { if (done) return; done = true; resolve(j); };
            const ko = m => { if (done) return; done = true; reject(new Error(m)); };
            setTimeout(() => ko('timeout'), 12000);

            // TornPDA: prefer PDA_httpGet (bypasses fetch wrappers, but still goes through API proxy)
            if (typeof window.PDA_httpGet === 'function') {
                try {
                    Promise.resolve(window.PDA_httpGet(url)).then(resp => {
                        try {
                            const text = typeof resp === 'string' ? resp
                                       : (resp && (resp.responseText || resp.body)) || JSON.stringify(resp);
                            ok(JSON.parse(text));
                        } catch (e) { ko('parse: ' + e.message); }
                    }).catch(e => ko('PDA: ' + (e && e.message ? e.message : e)));
                    return;
                } catch (e) { /* fall through */ }
            }

            // Desktop with GM_xmlhttpRequest
            if (typeof GM_xmlhttpRequest === 'function') {
                try {
                    GM_xmlhttpRequest({
                        method: 'GET', url, timeout: 12000,
                        headers: { 'Accept': 'application/json' },
                        onload: r => {
                            try { ok(JSON.parse(r.responseText)); }
                            catch (e) { ko('parse: ' + (r.responseText || '').substring(0,60)); }
                        },
                        onerror:   () => ko('net'),
                        ontimeout: () => ko('timeout'),
                    });
                    return;
                } catch (e) { /* fall through */ }
            }

            // Last resort: fetch
            if (typeof fetch === 'function') {
                fetch(url, { headers: { 'Accept': 'application/json' } })
                    .then(r => r.json())
                    .then(ok)
                    .catch(e => ko(e.message || 'fetch failed'));
            } else {
                ko('No network method available');
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DOM MODEL
    // ═══════════════════════════════════════════════════════════════════════
    function getModel() {
        try {
            const root = document.getElementById('travel-root');
            if (!root) return null;
            return JSON.parse(root.getAttribute('data-model') || 'null');
        } catch (e) { return null; }
    }

    function getSelectedDest(model) {
        const dests = (model && model.destinations) || [];
        if (stashedButton) {
            const c = (stashedButton.btn.getAttribute('aria-label') || '').replace('Travel to ', '').trim();
            const f = dests.find(d => d.country === c);
            if (f) return f;
        }
        const btn = document.querySelector('button[aria-label^="Travel to"]');
        if (btn) {
            const c = btn.getAttribute('aria-label').replace('Travel to ', '').trim();
            return dests.find(d => d.country === c) || null;
        }
        const radio = document.querySelector('input[name="destination"][aria-checked="true"]');
        if (radio) return dests.find(d => d.id === parseInt(radio.value)) || null;
        return null;
    }

    function getTravelType(model) {
        const el = document.querySelector('input[name="travelType"][aria-checked="true"]');
        return (el && el.value) || (model && model.travelTypes && model.travelTypes.default) || 'standard';
    }

    // Does the player have ANY active OC? Now derived from ocWarningText
    // (the authoritative source) via parseOCWarning() in evaluate().

    // Parse the OC warning text Torn embeds in the DOM model. Looks like:
    //   "Warning: An organized crime you're participating in will be initated in
    //    42 hours and 43 minutes"
    // Returns {hasOC: boolean, secondsUntil: number|null, raw: string|null}
    // This is the authoritative signal — Torn populates it whenever you have an
    // active OC, regardless of faction API availability. ocReadyBeforeBack is
    // derived from this server-side: it's true if (flight*2 + return wait) >
    // secondsUntil for that destination, false otherwise. We compute the same
    // ourselves so the script also works on near-OC + far-destination combos
    // and so the panel can show a real countdown.
    function parseOCWarning(model) {
        const text = model && model.ocWarningText;
        if (!text || typeof text !== 'string') return { hasOC: false, secondsUntil: null, raw: null };

        // Look for "in N days, N hours, N minutes" / "in N hours and N minutes" / "in N minutes"
        // Be liberal — Torn's text uses "and" and commas inconsistently.
        const re = /(\d+)\s*(day|hour|minute)/gi;
        let total = 0, m, found = false;
        while ((m = re.exec(text)) !== null) {
            found = true;
            const n = parseInt(m[1], 10);
            const unit = m[2].toLowerCase();
            if (unit === 'day')         total += n * 86400;
            else if (unit === 'hour')   total += n * 3600;
            else if (unit === 'minute') total += n * 60;
        }
        return { hasOC: found, secondsUntil: found ? total : null, raw: text };
    }

    function evaluate(destOverride) {
        const model    = getModel();
        const dest     = destOverride || (model ? getSelectedDest(model) : null);
        const type     = model ? getTravelType(model) : 'standard';
        const typeData = dest ? (dest[type] || dest.standard) : null;

        let flightSecs = null, flightMins = null, tripMins = null, tripSecs = null;
        if (typeData && typeData.time && typeof typeData.time.diff === 'number') {
            flightSecs = typeData.time.diff;
            flightMins = Math.round(flightSecs / 60);
            tripSecs   = flightSecs * 2 + CFG.stayMinutes * 60;
            tripMins   = flightMins * 2 + CFG.stayMinutes;
        }

        // Parse the OC warning text — works regardless of API or faction settings
        const ocInfo = model ? parseOCWarning(model) : { hasOC: false, secondsUntil: null, raw: null };

        // Conflict logic: BLOCK if we have an active OC AND the round trip
        // (with buffer) would extend past when the OC fires.
        let block = false;
        if (ocInfo.hasOC && tripSecs !== null && ocInfo.secondsUntil !== null) {
            const bufferSecs = CFG.bufferMinutes * 60;
            block = (tripSecs + bufferSecs) >= ocInfo.secondsUntil;
        }
        // Fallback: also trust Torn's own per-destination flag if it ever IS true
        if (typeData && typeData.ocReadyBeforeBack === true) block = true;

        return { block, dest, flightMins, tripMins, flightSecs, tripSecs, ocInfo, model };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UI STYLES
    // ═══════════════════════════════════════════════════════════════════════
    const STYLE = `
#ocg-panel { background:#0f0f0f; border:1px solid #2a2a2a; border-radius:6px; margin:6px 0; font-family:inherit; color:#bbb; font-size:12px; overflow:hidden }
#ocg-panel .ocg-head { display:flex; align-items:stretch; min-height:48px }
#ocg-panel .ocg-status { flex:1; padding:9px 12px; display:flex; flex-direction:column; justify-content:center; gap:3px; min-width:0 }
#ocg-panel .ocg-status .label { font-size:9px; color:#666; text-transform:uppercase; letter-spacing:0.8px }
#ocg-panel .ocg-status .value { font-size:14px; font-weight:bold; line-height:1.25 }
#ocg-panel .ocg-status .detail { font-size:11px; color:#888; line-height:1.4 }
#ocg-panel .ocg-actions { display:flex; flex-shrink:0; border-left:1px solid #1f1f1f }
#ocg-panel .ocg-actions button { background:#161616; color:#888; border:0; border-left:1px solid #1f1f1f; padding:0 14px; font-size:13px; cursor:pointer; font-family:inherit; min-width:42px }
#ocg-panel .ocg-actions button:first-child { border-left:0 }
#ocg-panel .ocg-actions button:hover { background:#1e1e1e; color:#ccc }
#ocg-panel .ocg-pill { display:inline-block; padding:2px 8px; border-radius:3px; font-size:10px; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px; vertical-align:middle; margin-right:6px }
#ocg-panel .ocg-stats { display:flex; flex-wrap:wrap; padding:0; border-top:1px solid #1f1f1f; background:#0a0a0a }
#ocg-panel .ocg-stat { flex:1 1 33%; padding:8px 10px; border-right:1px solid #1f1f1f; border-bottom:1px solid #1f1f1f; min-width:90px; box-sizing:border-box }
#ocg-panel .ocg-stat .k { font-size:9px; color:#555; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px }
#ocg-panel .ocg-stat .v { font-size:12px; color:#bbb; font-weight:bold; line-height:1.3; word-wrap:break-word }
#ocg-panel .ocg-stat.warn .v { color:#ffaa55 }
#ocg-panel .ocg-stat.bad .v { color:#ff7777 }
#ocg-panel .ocg-stat.good .v { color:#88cc88 }
#ocg-panel .ocg-banner { padding:9px 12px; font-size:11px; line-height:1.6; border-top:1px solid #1f1f1f }
#ocg-panel .ocg-banner.bad { background:#1a0808; color:#ffaaaa; border-top-color:#3a1010 }
#ocg-panel .ocg-banner.warn { background:#1a1208; color:#ffd699; border-top-color:#3a2810 }
#ocg-panel .ocg-banner.info { background:#0a1018; color:#9bb; border-top-color:#152030 }
#ocg-panel .ocg-banner.good { background:#0d180e; color:#aaccaa; border-top-color:#1f3a20 }
#ocg-panel .ocg-banner b { color:inherit }
#ocg-panel .ocg-section { padding:11px 12px; border-top:1px solid #1f1f1f; background:#0a0a0a }
#ocg-panel .ocg-section h4 { margin:0 0 6px 0; font-size:11px; color:#888; text-transform:uppercase; letter-spacing:0.5px; font-weight:bold }
#ocg-panel .ocg-section h4:not(:first-child) { margin-top:10px }
#ocg-panel .ocg-section p { margin:0 0 6px 0; font-size:11px; line-height:1.6; color:#aaa }
#ocg-panel .ocg-section p:last-child { margin-bottom:0 }
#ocg-panel .ocg-row { display:flex; flex-wrap:wrap; gap:8px; align-items:flex-end; margin-bottom:8px }
#ocg-panel .ocg-row:last-child { margin-bottom:0 }
#ocg-panel label.fld { display:flex; flex-direction:column; gap:3px; font-size:10px; color:#777 }
#ocg-panel label.fld input { background:#1a1a1a; color:#ddd; border:1px solid #333; border-radius:3px; padding:6px 8px; font-size:12px; font-family:inherit; box-sizing:border-box }
#ocg-panel label.fld input:focus { border-color:#555; outline:none }
#ocg-panel .full { width:100%; min-width:200px; flex:1 1 200px }
#ocg-panel button.btn { background:#1a1a1a; color:#bbb; border:1px solid #333; border-radius:3px; padding:7px 14px; font-size:11px; cursor:pointer; font-family:inherit; font-weight:bold }
#ocg-panel button.btn.primary { background:#15281a; color:#88cc88; border-color:#2a5030 }
#ocg-panel button.btn.primary:hover { background:#1a3220 }
#ocg-panel button.btn.danger { background:#281515; color:#cc8888; border-color:#502a2a }
#ocg-panel button.btn:hover { background:#222 }
#ocg-panel .ocg-flash { font-size:11px; color:#88cc88; margin-left:6px }
#ocg-panel .ocg-help-list { margin:0; padding-left:18px; font-size:11px; line-height:1.7; color:#999 }
#ocg-panel .ocg-help-list li { margin-bottom:3px }
#ocg-panel a { color:#88aacc; text-decoration:none }
#ocg-panel a:hover { text-decoration:underline }
@media (max-width: 500px) {
  #ocg-panel .ocg-stat { flex:1 1 50% }
}
`;

    function injectStyle() {
        if (document.getElementById('ocg-style')) return;
        const s = document.createElement('style');
        s.id = 'ocg-style';
        s.textContent = STYLE;
        document.head.appendChild(s);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PANEL INJECTION
    // ═══════════════════════════════════════════════════════════════════════
    function injectPanel() {
        if (document.getElementById('ocg-panel')) return;
        injectStyle();

        const anchor = document.querySelector('.topSection___U7sVi')
                    || document.querySelector('[class*="topSection"]')
                    || document.querySelector('[class*="travelHeader"]')
                    || document.querySelector('[class*="travel"] h4')
                    || document.querySelector('h4')
                    || document.getElementById('travel-root');
        if (!anchor) return;

        const panel = document.createElement('div');
        panel.id = 'ocg-panel';
        panel.innerHTML = `
<div class="ocg-head">
  <div class="ocg-status">
    <div class="label">OC Flight Guard</div>
    <div class="value" id="ocg-headline">Loading…</div>
    <div class="detail" id="ocg-subhead"></div>
  </div>
  <div class="ocg-actions">
    <button id="ocg-toggle-help" title="What does this do?">?</button>
    <button id="ocg-toggle-cfg"  title="Settings">⚙</button>
  </div>
</div>
<div class="ocg-stats" id="ocg-stats"></div>
<div id="ocg-banner"></div>
<div id="ocg-help" class="ocg-section" style="display:none"></div>
<div id="ocg-cfg"  class="ocg-section" style="display:none"></div>
`;

        const travelRoot = document.getElementById('travel-root');
        if (anchor === travelRoot) travelRoot.parentNode && travelRoot.parentNode.insertBefore(panel, travelRoot);
        else anchor.insertAdjacentElement('afterend', panel);

        buildHelpSection();
        buildCfgSection();

        document.getElementById('ocg-toggle-help').addEventListener('click', () => togglePanel('ocg-help'));
        document.getElementById('ocg-toggle-cfg').addEventListener('click',  () => togglePanel('ocg-cfg'));

        // Auto-open help on first run
        if (!CFG.helpSeen) {
            document.getElementById('ocg-help').style.display = 'block';
            CFG.helpSeen = true;
            saveCFG();
        }

        renderUI();
    }

    function togglePanel(id) {
        const el = document.getElementById(id);
        if (!el) return;
        const isOpen = el.style.display === 'block';
        el.style.display = isOpen ? 'none' : 'block';
        const other = id === 'ocg-help' ? 'ocg-cfg' : 'ocg-help';
        const oel = document.getElementById(other);
        if (oel) oel.style.display = 'none';
    }

    function buildHelpSection() {
        const h = document.getElementById('ocg-help');
        if (!h) return;
        h.innerHTML = `
<h4>What is an Organized Crime (OC)?</h4>
<p>OCs are scheduled faction crimes you must be <b>in Torn</b> for when they execute. Flying abroad during an OC window means you miss it and let your faction down.</p>

<h4>How this script works</h4>
<p>Torn embeds the OC info directly into the travel page (countdown + per-destination "would the OC fire before you return" flag). The script reads that and:</p>
<ul class="ocg-help-list">
  <li>Replaces the <b>Travel</b> button with a warning when there's a conflict</li>
  <li>Shows a confirm dialog if you click <b>Fly anyway</b></li>
  <li>Displays the current state in this panel so you always know what's happening</li>
</ul>
<p style="color:#888;font-size:10px;margin-top:6px">No API key needed for blocking — works for any faction, including ones that don't allow API access.</p>

<h4>Status meanings</h4>
<ul class="ocg-help-list">
  <li><b style="color:#77cc77">✓ Clear</b> — your trip ends before the OC fires (or no OC active).</li>
  <li><b style="color:#ff7777">⛔ Conflict</b> — Torn says your OC would fire mid-trip.</li>
  <li><b style="color:#ffaa55">⚠ Some destinations risky</b> — closer destinations are safe, longer ones aren't.</li>
</ul>

<h4>Settings (optional)</h4>
<ul class="ocg-help-list">
  <li><b>API key</b> — only adds your faction name and role to the display. Not needed for blocking.</li>
  <li><b>Stay abroad (min)</b> — how long you usually stay. Currently <b>${CFG.stayMinutes}m</b>.</li>
  <li><b>Buffer (min)</b> — extra safety margin (the script blocks if the trip ends within this many minutes of the OC). Currently <b>${CFG.bufferMinutes}m</b>.</li>
</ul>
<p style="font-size:10px;color:#666;margin-top:6px">
The script computes "would my OC fire before I return?" from the OC countdown Torn embeds in the page and the flight time for each destination. No API call required.
</p>`;
    }

    function buildCfgSection() {
        const c = document.getElementById('ocg-cfg');
        if (!c) return;
        c.innerHTML = `
<h4>Settings</h4>
<div class="ocg-row">
  <label class="fld full">
    <span>Torn API key (16 chars · optional, for faction info)</span>
    <input id="ocg-apikey" type="password" maxlength="16" value="${escapeAttr(CFG.apiKey)}" placeholder="Paste API key">
  </label>
</div>
<div class="ocg-row">
  <button class="btn primary" id="ocg-open-keypage" style="padding:7px 14px">🔑 Create preset key</button>
  <button class="btn" id="ocg-show-steps" style="padding:7px 14px">📋 Manual steps</button>
  <span class="ocg-flash" id="ocg-copy-flash" style="display:none">📋 Name copied</span>
</div>
<p style="margin:0 0 8px 0;color:#888;font-size:10px;line-height:1.6">
The <b>Create preset key</b> button opens Torn with the right permissions (<code>basic</code> + <code>profile</code>) and the name "OC Flight Guard" pre-filled — just click Create on Torn's page. The name is also copied to your clipboard as a backup.
</p>
<div id="ocg-key-steps" style="display:none;margin-top:8px;padding:10px;background:#0d1418;border:1px solid #1f2a35;border-radius:4px;font-size:11px;line-height:1.7;color:#9bb">
  <b style="color:#bcd">Manual fallback (if the preset link doesn't work):</b>
  <ol style="margin:6px 0 0 0;padding-left:20px">
    <li>Open the API key page on Torn</li>
    <li>Click <b>Create new key</b></li>
    <li>Set <b>Type</b> to <b>Custom</b> (also called "Limited Access")</li>
    <li>Under <b>User</b>, tick:
      <ul style="margin:3px 0;padding-left:18px">
        <li><b>basic</b> — gives your player ID</li>
        <li><b>profile</b> — gives your faction name and role</li>
      </ul>
    </li>
    <li>Set <b>Name</b> to <code style="background:#1a1a1a;padding:1px 5px;border-radius:3px">OC Flight Guard</code> (or anything memorable)</li>
    <li>Click <b>Create</b>, then copy the 16-character key and paste it above</li>
  </ol>
  <p style="margin:6px 0 0 0;color:#778">These minimal permissions are all this script needs — no faction or risky access required.</p>
</div>
<div class="ocg-row" style="margin-top:10px">
  <label class="fld" style="flex:1 1 120px">
    <span>Stay abroad (min)</span>
    <input id="ocg-stay" type="number" min="0" value="${CFG.stayMinutes}">
  </label>
  <label class="fld" style="flex:1 1 120px">
    <span>Buffer (min)</span>
    <input id="ocg-buffer" type="number" min="0" value="${CFG.bufferMinutes}">
  </label>
</div>
<div class="ocg-row">
  <button class="btn primary" id="ocg-save">Save</button>
  <button class="btn danger"  id="ocg-reset">Reset</button>
  <span class="ocg-flash" id="ocg-flash" style="display:none">✓ Saved</span>
</div>
<p style="margin-top:8px;color:#777;font-size:10px;line-height:1.6">
<b>Stay</b> — your typical time on the ground.<br>
<b>Buffer</b> — extra warning margin (higher = more cautious).<br>
<a href="https://greasyfork.org/scripts/566888" target="_blank">Updates / reinstall on Greasyfork ↗</a>
</p>`;

        document.getElementById('ocg-save').addEventListener('click', onSave);
        document.getElementById('ocg-reset').addEventListener('click', onReset);
        document.getElementById('ocg-show-steps').addEventListener('click', () => {
            const s = document.getElementById('ocg-key-steps');
            const btn = document.getElementById('ocg-show-steps');
            const open = s.style.display === 'block';
            s.style.display = open ? 'none' : 'block';
            btn.textContent = open ? '📋 Manual steps' : '📋 Hide steps';
        });

        // "Open API key page" button: copy the suggested key name to clipboard
        // first (so the user can paste it as the key's Name on Torn's page),
        // then auto-expand the steps panel, then open the API tab in a new tab.
        document.getElementById('ocg-open-keypage').addEventListener('click', () => {
            const name = 'OC Flight Guard';
            const flash = document.getElementById('ocg-copy-flash');
            const showFlash = () => {
                if (!flash) return;
                flash.style.display = 'inline';
                setTimeout(() => flash.style.display = 'none', 2500);
            };

            // Try clipboard API; fall back silently
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(name).then(showFlash, () => {});
                } else {
                    const ta = document.createElement('textarea');
                    ta.value = name;
                    ta.style.cssText = 'position:fixed;top:-1000px';
                    document.body.appendChild(ta);
                    ta.select();
                    try { document.execCommand('copy'); showFlash(); } catch (e) {}
                    document.body.removeChild(ta);
                }
            } catch (e) {}

            // Auto-open the steps so user knows exactly what to tick
            const steps = document.getElementById('ocg-key-steps');
            const stepsBtn = document.getElementById('ocg-show-steps');
            if (steps && steps.style.display !== 'block') {
                steps.style.display = 'block';
                if (stepsBtn) stepsBtn.textContent = '📋 Hide steps';
            }

            // Open the API page with preset Custom key parameters.
            // Format: #tab=api?step=addNewKey  (the ? after #tab=api is correct
            // and required — Torn's SPA parses everything after that ? as the
            // key-creation params). Documented at tornapi.tornplayground.eu
            // and used by other tools like the Crime+Gym Log spreadsheet.
            const presetUrl = 'https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=OC%20Flight%20Guard&user=basic,profile';
            window.open(presetUrl, '_blank');
        });
    }

    function onSave() {
        const stayInput   = document.getElementById('ocg-stay');
        const bufferInput = document.getElementById('ocg-buffer');
        const rawStay   = parseInt(stayInput.value)   || 0;
        const rawBuffer = parseInt(bufferInput.value) || 0;
        const rawKey    = document.getElementById('ocg-apikey').value.trim();
        const flash = document.getElementById('ocg-flash');

        if (rawKey.length > 0 && !/^[a-zA-Z0-9]{16}$/.test(rawKey)) {
            flash.style.color = '#cc6666';
            flash.textContent = '✗ Key must be 16 letters/numbers';
            flash.style.display = 'inline';
            setTimeout(() => { flash.style.display = 'none'; flash.style.color = '#88cc88'; flash.textContent = '✓ Saved'; }, 3000);
            return;
        }

        const clampedStay   = clampStay(rawStay);
        const clampedBuffer = clampBuffer(rawBuffer);
        const stayClamped   = clampedStay   !== rawStay;
        const bufferClamped = clampedBuffer !== rawBuffer;

        CFG.stayMinutes   = clampedStay;
        CFG.bufferMinutes = clampedBuffer;
        CFG.apiKey        = rawKey;
        saveCFG();

        // Reflect the clamped values in the inputs so the user sees what was saved
        if (stayClamped)   stayInput.value   = clampedStay;
        if (bufferClamped) bufferInput.value = clampedBuffer;

        if (CFG.apiKey.length === 16) fetchUserInfo(true);
        renderUI();
        applyBlock();

        flash.style.display = 'inline';
        if (stayClamped || bufferClamped) {
            const maxes = [];
            if (stayClamped)   maxes.push(`stay max ${STAY_MAX}m`);
            if (bufferClamped) maxes.push(`buffer max ${BUFFER_MAX}m`);
            flash.style.color = '#cc9966';
            flash.textContent = `⚠ Capped to ${maxes.join(', ')}`;
            setTimeout(() => { flash.style.display = 'none'; flash.style.color = '#88cc88'; flash.textContent = '✓ Saved'; }, 4000);
        } else {
            flash.style.color = '#88cc88';
            flash.textContent = '✓ Saved';
            setTimeout(() => flash.style.display = 'none', 2000);
        }
    }

    function onReset() {
        if (!confirm('Reset all OC Flight Guard settings?')) return;
        CFG.stayMinutes = 30; CFG.bufferMinutes = 5; CFG.apiKey = '';
        saveCFG();
        document.getElementById('ocg-stay').value   = 30;
        document.getElementById('ocg-buffer').value = 5;
        document.getElementById('ocg-apikey').value = '';
        userInfo = null;
        renderUI();
        applyBlock();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════
    function renderUI() {
        const headline = document.getElementById('ocg-headline');
        const subhead  = document.getElementById('ocg-subhead');
        const stats    = document.getElementById('ocg-stats');
        const banner   = document.getElementById('ocg-banner');
        if (!headline) return;

        const result = evaluate();
        const hasOC      = result.ocInfo && result.ocInfo.hasOC;
        const ocCountdown = (hasOC && result.ocInfo.secondsUntil !== null) ? fmtSecs(result.ocInfo.secondsUntil) : null;

        // ─── Headline ────────────────────────────────────────────────────────
        let pillHTML = '', valueHTML = '', subText = '';

        if (result.block && result.dest) {
            pillHTML  = `<span class="ocg-pill" style="background:#3a0808;color:#ff7777;border:1px solid #aa2222">CONFLICT</span>`;
            valueHTML = pillHTML + `Don't fly to ${escapeHtml(result.dest.country)}`;
            subText   = ocCountdown
                ? `Your OC fires in ${ocCountdown} — trip would extend past it.`
                : 'Your OC would fire while you\'re abroad.';
        }
        else if (result.block) {
            pillHTML  = `<span class="ocg-pill" style="background:#3a0808;color:#ff7777;border:1px solid #aa2222">CONFLICT</span>`;
            valueHTML = pillHTML + 'OC conflict detected';
            subText   = 'Selected destination would make you miss your OC.';
        }
        else if (hasOC && !result.dest) {
            pillHTML  = `<span class="ocg-pill" style="background:#2a1f08;color:#ffcc77;border:1px solid #886622">ACTIVE OC</span>`;
            valueHTML = pillHTML + (ocCountdown ? `OC fires in ${ocCountdown}` : 'You\'re in an active OC');
            subText   = 'Pick a destination above to check if the trip fits.';
        }
        else if (hasOC && result.dest) {
            pillHTML  = `<span class="ocg-pill" style="background:#15281a;color:#77cc77;border:1px solid #2a5030">CLEAR</span>`;
            valueHTML = pillHTML + `Safe to fly to ${escapeHtml(result.dest.country)}`;
            subText   = ocCountdown
                ? `OC fires in ${ocCountdown} — you'll be back well before.`
                : 'You\'ll return before your OC fires.';
        }
        else if (result.dest) {
            pillHTML  = `<span class="ocg-pill" style="background:#15281a;color:#77cc77;border:1px solid #2a5030">CLEAR</span>`;
            valueHTML = pillHTML + `${escapeHtml(result.dest.country)} — safe to fly`;
            subText   = 'No active OC detected.';
        }
        else {
            pillHTML  = `<span class="ocg-pill" style="background:#15281a;color:#77cc77;border:1px solid #2a5030">CLEAR</span>`;
            valueHTML = pillHTML + 'No active OC';
            subText   = 'Pick a destination to check the trip.';
        }

        headline.innerHTML = valueHTML;
        subhead.textContent = subText;

        // ─── Stats ──────────────────────────────────────────────────────────
        const cells = [];

        if (userInfo && userInfo.factionName) {
            cells.push({ k: 'Your faction', v: escapeHtml(userInfo.factionName) + (userInfo.role ? ` <span style="color:#666;font-weight:normal">· ${escapeHtml(userInfo.role)}</span>` : ''), cls: '' });
        } else if (CFG.apiKey && userInfoPending) {
            cells.push({ k: 'Your faction', v: '<span style="color:#666">loading…</span>', cls: '' });
        } else if (CFG.apiKey && userInfoError) {
            cells.push({ k: 'Your faction', v: '<span style="color:#aa6666">API error</span>', cls: '' });
        } else if (!CFG.apiKey) {
            cells.push({ k: 'Your faction', v: '<span style="color:#666">no API key</span>', cls: '' });
        }

        cells.push({
            k: 'OC status',
            v: hasOC ? (ocCountdown ? `Fires in ${ocCountdown}` : 'Active') : 'None detected',
            cls: hasOC ? 'warn' : '',
        });

        if (result.dest) {
            cells.push({ k: 'Destination', v: escapeHtml(result.dest.country), cls: '' });
            const flight = result.flightMins !== null ? fmtMins(result.flightMins) : '—';
            const trip   = result.tripMins   !== null ? fmtMins(result.tripMins)   : '—';
            cells.push({ k: 'Flight time', v: flight, cls: '' });
            cells.push({ k: 'Round trip', v: `${trip} <span style="color:#666;font-weight:normal">(+${CFG.stayMinutes}m stay)</span>`, cls: '' });
            cells.push({
                k: 'OC clash?',
                v: result.block ? 'YES — blocked' : 'No',
                cls: result.block ? 'bad' : 'good',
            });
        }

        stats.innerHTML = cells.length
            ? cells.map(c => `<div class="ocg-stat ${c.cls}"><div class="k">${c.k}</div><div class="v">${c.v}</div></div>`).join('')
            : '';
        stats.style.display = cells.length ? 'flex' : 'none';

        // ─── Banner ─────────────────────────────────────────────────────────
        if (banner) {
            if (result.block) {
                banner.className = 'ocg-banner bad';
                banner.innerHTML = `⛔ <b>The Travel button has been replaced</b> with a warning. Tap <b>Fly anyway</b> there if you really need to fly — you'll be asked to confirm.`;
            } else if (hasOC && !result.dest) {
                banner.className = 'ocg-banner warn';
                banner.innerHTML = `⚠ <b>You're in an active OC${ocCountdown ? ' — fires in ' + ocCountdown : ''}.</b> Pick a destination above; short trips are safe, longer ones may conflict.`;
            } else if (CFG.apiKey && userInfoError) {
                banner.className = 'ocg-banner warn';
                banner.innerHTML = `⚠ Couldn't load faction info: ${escapeHtml(userInfoError)} <span style="color:#996">(blocking still works)</span>`;
            } else if (!CFG.apiKey) {
                banner.className = 'ocg-banner info';
                banner.innerHTML = `ℹ Blocking works without an API key. Open <b>⚙ Settings</b> if you'd like to add one — it'll show your faction name and role.`;
            } else {
                banner.innerHTML = '';
                banner.className = '';
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CONFIRM MODAL
    // ═══════════════════════════════════════════════════════════════════════
    function showConfirmModal(result, onConfirm) {
        const existing = document.getElementById('ocg-modal');
        if (existing) existing.remove();

        const ocCountdown = (result.ocInfo && result.ocInfo.hasOC && result.ocInfo.secondsUntil !== null)
            ? fmtSecs(result.ocInfo.secondsUntil) : null;

        const tripLine = result.tripMins !== null
            ? `Round trip to <b>${escapeHtml(result.dest ? result.dest.country : 'destination')}</b>: <b>${fmtMins(result.tripMins)}</b> (${fmtMins(result.flightMins)} each way + ${fmtMins(CFG.stayMinutes)} stay)`
            : '';

        const ocLine = ocCountdown
            ? `Your OC fires in <b>${ocCountdown}</b> — sooner than you'd return.`
            : 'Your OC will fire before you return from this trip.';

        const overlay = document.createElement('div');
        overlay.id = 'ocg-modal';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font-family:inherit';
        overlay.innerHTML = `
<div style="background:#181818;border:2px solid #aa2222;border-radius:10px;padding:24px;max-width:380px;width:100%;box-sizing:border-box;color:#ddd">
  <div style="text-align:center;font-size:42px;margin-bottom:8px">⛔</div>
  <div style="text-align:center;color:#ff6666;font-size:18px;font-weight:bold;margin-bottom:14px">OC Conflict</div>
  <div style="background:#220a0a;border:1px solid #551111;border-radius:5px;padding:10px 12px;margin-bottom:10px;font-size:13px;color:#ffcccc;line-height:1.6">
    <strong>${ocLine}</strong>
  </div>
  ${tripLine ? `<div style="background:#1a1a0a;border:1px solid #443311;border-radius:5px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#ddbb88;line-height:1.6">${tripLine}</div>` : ''}
  <div style="color:#999;font-size:12px;margin-bottom:18px;line-height:1.7;text-align:center">
    Flying now means <strong style="color:#ff7777">missing the OC</strong><br>
    and letting your faction down.
  </div>
  <div style="display:flex;gap:10px">
    <button id="ocg-cancel" style="flex:1;background:#0d1f0e;color:#77cc77;border:1px solid #2a5a2a;border-radius:5px;padding:13px;font-size:14px;cursor:pointer;font-weight:bold">✓ Stay</button>
    <button id="ocg-confirm" style="flex:1;background:#2a0000;color:#ff8888;border:1px solid #882222;border-radius:5px;padding:13px;font-size:14px;cursor:pointer">Fly anyway</button>
  </div>
</div>`;

        document.body.appendChild(overlay);
        document.getElementById('ocg-cancel').addEventListener('click', () => overlay.remove());
        document.getElementById('ocg-confirm').addEventListener('click', () => { overlay.remove(); onConfirm(); });
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        setTimeout(() => { const c = document.getElementById('ocg-cancel'); if (c) c.focus(); }, 50);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BLOCKER WIDGET (desktop button replacement)
    // ═══════════════════════════════════════════════════════════════════════
    function buildBlocker(result, realButton) {
        const w = document.createElement('div');
        w.className = 'ocg-blocker';
        w.style.cssText = 'display:flex;flex-direction:column;align-items:stretch;gap:4px;min-width:130px';

        const warn = document.createElement('div');
        warn.style.cssText = 'background:#2a0000;border:1px solid #882222;border-radius:4px;padding:6px 8px;font-size:10px;text-align:center;line-height:1.5;color:#ff9999;font-weight:bold';
        warn.innerHTML = `⛔ OC Conflict<br><span style="font-size:9px;color:#ffcccc">fires during trip</span>`;
        w.appendChild(warn);

        const flyBtn = document.createElement('button');
        flyBtn.style.cssText = 'background:#1e0e00;color:#cc8844;border:1px solid #553311;border-radius:4px;padding:6px;font-size:11px;cursor:pointer;font-weight:bold;width:100%';
        flyBtn.textContent = '⚠ Fly anyway';
        flyBtn.addEventListener('click', () => {
            showConfirmModal(result, () => {
                pauseObserver(() => { w.replaceWith(realButton); stashedButton = null; });
                realButton.click();
            });
        });
        w.appendChild(flyBtn);
        return w;
    }

    function pauseObserver(fn) {
        if (rootObserver) rootObserver.disconnect();
        try { fn(); } finally {
            const root = document.getElementById('travel-root');
            if (rootObserver && root) rootObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-checked', 'data-model'] });
        }
    }

    function applyBlock() {
        if (applyingBlock) return;
        applyingBlock = true;
        try {
            const result = evaluate();

            const panel = document.querySelector('.destinationPanel___LsJ4v, [class*="destinationPanel"]');
            if (!panel) return;

            panel.querySelectorAll('.ocg-blocker').forEach(el => el.remove());

            const freshBtn = panel.querySelector('button[aria-label^="Travel to"]')
                          || panel.querySelector('button.torn-btn[type="button"]');

            if (!result.block) {
                if (stashedButton) {
                    const { btn, parent } = stashedButton;
                    if (!parent.querySelector('button[aria-label^="Travel to"]')) {
                        pauseObserver(() => parent.appendChild(btn));
                    }
                    stashedButton = null;
                }
                return;
            }

            if (freshBtn) {
                const originalParent = freshBtn.parentNode || panel;
                stashedButton = { btn: freshBtn, parent: originalParent };
                pauseObserver(() => { freshBtn.remove(); originalParent.appendChild(buildBlocker(result, freshBtn)); });
            } else if (stashedButton) {
                const blocker = buildBlocker(result, stashedButton.btn);
                pauseObserver(() => {
                    const old = panel.querySelector('.ocg-blocker');
                    if (old) old.replaceWith(blocker);
                    else {
                        const segs = panel.querySelectorAll('[class*="segment"]');
                        const last = segs[segs.length - 1];
                        if (last) last.appendChild(blocker);
                    }
                });
            }
        } finally {
            applyingBlock = false;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MOBILE / TornPDA INTERCEPTOR
    // ═══════════════════════════════════════════════════════════════════════
    function setupMobileInterceptor(root) {
        if (mobileInterceptorAttached) return;
        mobileInterceptorAttached = true;

        root.addEventListener('click', e => {
            if (bypassInterceptor) { bypassInterceptor = false; return; }
            const row = e.target.closest('li, tr, [class*="destination"], [class*="row"]');
            if (!row) return;
            const model = getModel();
            if (!model) return;
            const dest = (model.destinations || []).find(d => row.textContent.includes(d.country));
            if (!dest) return;
            const result = evaluate(dest);
            if (!result.block) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            showConfirmModal(result, () => {
                bypassInterceptor = true;
                setTimeout(() => { bypassInterceptor = false; }, 200);
                setTimeout(() => e.target.click(), 50);
            });
        }, true);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BOOT
    // ═══════════════════════════════════════════════════════════════════════
    (function boot() {
        let booted = false;
        let debounce = null;
        const dbc = (fn, ms) => { clearTimeout(debounce); debounce = setTimeout(fn, ms || 80); };

        function tryInit() {
            const root = document.getElementById('travel-root');
            if (!root) return;
            const model = root.getAttribute('data-model');
            if (!model) return;
            if (booted && document.getElementById('ocg-panel')) return;

            booted = true;
            injectPanel();
            setupMobileInterceptor(root);

            if (rootObserver) rootObserver.disconnect();
            let innerDebounce = null;
            const idbc = (fn, ms) => { clearTimeout(innerDebounce); innerDebounce = setTimeout(fn, ms || 80); };

            rootObserver = new MutationObserver(mutations => {
                const ours = mutations.every(m => {
                    const nodes = [].concat(Array.from(m.addedNodes || []), Array.from(m.removedNodes || []));
                    return nodes.length > 0 && nodes.every(n =>
                        (n.classList && n.classList.contains('ocg-blocker')) ||
                        (n.id && n.id.indexOf('ocg-') === 0)
                    );
                });
                if (ours) return;
                idbc(() => { injectPanel(); renderUI(); applyBlock(); });
            });
            rootObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-checked', 'data-model'] });

            // Light refresh every 30s to pick up data-model changes
            if (refreshTimer) clearInterval(refreshTimer);
            refreshTimer = setInterval(() => { renderUI(); applyBlock(); }, 30000);

            if (CFG.apiKey) fetchUserInfo();
            applyBlock();
        }

        const bodyObs = new MutationObserver(() => dbc(tryInit));
        bodyObs.observe(document.body || document.documentElement, { childList: true, subtree: true });
        tryInit();
    })();

})();