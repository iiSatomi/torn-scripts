// ==UserScript==
// @name         Torn Blackjack Advisor (OC Suite theme)
// @namespace    https://www.torn.com/
// @version      2.0.0
// @description  EV-optimal Blackjack advisor for Torn (8-deck S17, late surrender, split-vs-separate-dealer, 6-Card Charlie, BJ pays 2.5x). OC Suite-themed panel, reload/SPA hardened, optional Hi-Lo bet ramp. Rebuilt from Advisor 1.3.0 by iSatomi.
// @author       iSatomi [3580191]
// @match        https://www.torn.com/page.php?sid=blackjack*
// @match        https://www.torn.com/loader.php?sid=blackjack*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /* ════════════════════════════════════════════════════════════════════════
       TORN BLACKJACK RULES (wiki.torn.com/wiki/Blackjack)
       - 8 decks shuffled together
       - Dealer STANDS on all 17, including soft 17 (S17)
       - Blackjack pays 2.5x total (3:2)
       - 6-Card Charlie: 6 non-busted cards auto-wins (except vs dealer BJ)
       - Double: double bet, draw exactly one card, stand
       - Surrender: forfeit hand, recover half the bet (late surrender)
       - Split: pairs only; each split hand plays a SEPARATE dealer hand
       - Shoe persistence is UNCONFIRMED. Hi-Lo tracking stays OFF by default;
         the real edge is EV-perfect play. Tracking only powers the bet ramp
         when you explicitly enable it (and reset on the .shuffled banner).

       REBUILD NOTES (2.0.0, 2026-08-14):
       - Preserved verbatim from 1.3.0: the EV engine (verified 24/24), the
         DOM card parser (card-{suit}-{rank} classes + totals fallback), the
         Hi-Lo tracker, and the observer/heartbeat reliability core.
       - Rewrote the entire UI to the OC Suite visual language (navy palette,
         blue-gradient emphasis, accent bars, rounded cards, Arial).
       - Hardened result tracking: the win/lose amount is NOT in .bj-wonState
         (that line is "The dealer had X while you only had Y"), so net-$ now
         scans the whole win-lose wrap for a $ figure and degrades gracefully
         to W/L/P-only when none is present, instead of silently logging $0.
       - Card count now cross-checks the container's actN flag.
       ════════════════════════════════════════════════════════════════════════ */

    const VERSION = '2.0.0';
    const NS = 'bjadv';
    const LOG = (...a) => { try { console.log('[BJAdv]', ...a); } catch (e) {} };

    /* ─────────────────────── OC Suite theme tokens ──────────────────────────
       Mirrors the OC Suite "default" palette so the panel reads as native.
       Scoped as CSS variables on the panel root (this is a separate userscript,
       so OC Suite's own :root vars are not available here). */
    const T = {
        bg:        '#070c16',
        card:      '#0f1728',
        hover:     '#16223a',
        border:    '#1c2942',
        borderSoft:'#172236',
        text:      '#dce7f7',
        textCard:  '#c4d2e6',
        textDim:   '#97abc7',
        textMuted: '#8195b0',
        textFaint: '#74879f',
        link:      '#7cd4ff',
        good:      '#43c98b',
        warn:      '#e0a83a',
        crit:      '#f2678a',
        gold:      '#f2c94c',
    };
    // Action → accent, tuned to the OC Suite palette.
    const ACTION_COLOR = {
        Hit:       T.good,
        Stand:     T.crit,
        Double:    T.link,
        Split:     '#b98cf0',
        Surrender: T.textMuted,
    };

    /* ─────────────────────────── Storage (PDA-safe) ─────────────────────── */
    const mem = {};
    const Store = {
        get(key, def) {
            try {
                const v = localStorage.getItem(`${NS}_${key}`);
                if (v === null || v === undefined) return (key in mem) ? mem[key] : def;
                return JSON.parse(v);
            } catch (e) { return (key in mem) ? mem[key] : def; }
        },
        set(key, val) {
            mem[key] = val;
            try { localStorage.setItem(`${NS}_${key}`, JSON.stringify(val)); } catch (e) {}
        }
    };

    const cfg = {
        bankroll:  Store.get('bankroll', 1000000),
        minBet:    Store.get('minBet', 10),
        maxBet:    Store.get('maxBet', 10000000),
        risk:      Store.get('risk', 0.35),       // fractional Kelly
        tracking:  Store.get('tracking', false),  // Hi-Lo deck tracking for bet ramp
        collapsed: Store.get('collapsed', false)
    };
    const saveCfg = () => {
        Store.set('bankroll', cfg.bankroll); Store.set('minBet', cfg.minBet);
        Store.set('maxBet', cfg.maxBet); Store.set('risk', cfg.risk);
        Store.set('tracking', cfg.tracking); Store.set('collapsed', cfg.collapsed);
    };

    /* ═══════════════════════════ EV ENGINE (verified) ═══════════════════════
       Fixed-composition model: proportions taken from the current deck basis.
       Verified 24/24 against EV-true 8-deck S17 LS DAS + 6-Card Charlie play.
       Preserved verbatim from 1.3.0 — do not "simplify" without re-verifying.
       ════════════════════════════════════════════════════════════════════════ */
    function fullShoe() {
        const d = new Array(11).fill(0);
        for (let r = 1; r <= 9; r++) d[r] = 32;   // 4/deck * 8
        d[10] = 128;                              // T,J,Q,K = 16/deck * 8
        return d;
    }
    function addCard(total, soft, r) {
        if (r === 1) { total += 11; soft = true; } else total += r;
        if (total > 21 && soft) { total -= 10; soft = false; }
        return [total, soft];
    }
    function handValue(ranks) {
        let sum = 0, aces = 0;
        for (const r of ranks) { sum += r; if (r === 1) aces++; }
        if (aces > 0 && sum + 10 <= 21) return { total: sum + 10, soft: true };
        return { total: sum, soft: false };
    }
    function makeEngine(deck) {
        let tot = 0; for (let r = 1; r <= 10; r++) tot += deck[r];
        const p = new Array(11).fill(0);
        if (tot > 0) for (let r = 1; r <= 10; r++) p[r] = deck[r] / tot;

        const dealerMemo = new Map();
        function dealerDist(total, soft) {
            if (total > 21) return { bust: 1, 17: 0, 18: 0, 19: 0, 20: 0, 21: 0 };
            if (total >= 17) { const o = { bust: 0, 17: 0, 18: 0, 19: 0, 20: 0, 21: 0 }; o[total] = 1; return o; }
            const key = total * 2 + (soft ? 1 : 0);
            if (dealerMemo.has(key)) return dealerMemo.get(key);
            const o = { bust: 0, 17: 0, 18: 0, 19: 0, 20: 0, 21: 0 };
            for (let r = 1; r <= 10; r++) {
                if (p[r] <= 0) continue;
                const [nt, ns] = addCard(total, soft, r);
                const sub = dealerDist(nt, ns);
                for (const k in o) o[k] += p[r] * sub[k];
            }
            dealerMemo.set(key, o);
            return o;
        }
        function dealerOutcomes(up) { const [t, s] = addCard(0, false, up); return dealerDist(t, s); }

        const standMemo = new Map();
        function standEV(pt, up) {
            if (pt > 21) return -1;
            const key = pt * 11 + up;
            if (standMemo.has(key)) return standMemo.get(key);
            const d = dealerOutcomes(up);
            let win = d.bust, push = 0, lose = 0;
            for (const t of [17, 18, 19, 20, 21]) {
                if (pt > t) win += d[t]; else if (pt === t) push += d[t]; else lose += d[t];
            }
            const ev = win - lose; standMemo.set(key, ev); return ev;
        }
        const hitMemo = new Map();
        function hitEV(total, soft, cards, up) {
            const key = (total * 2 + (soft ? 1 : 0)) * 1000 + cards * 11 + up;
            if (hitMemo.has(key)) return hitMemo.get(key);
            let ev = 0;
            for (let r = 1; r <= 10; r++) {
                if (p[r] <= 0) continue;
                const [nt, ns] = addCard(total, soft, r);
                let v;
                if (nt > 21) v = -1;
                else if (cards + 1 >= 6) v = 1;                                 // 6-Card Charlie
                else v = Math.max(standEV(nt, up), hitEV(nt, ns, cards + 1, up));
                ev += p[r] * v;
            }
            hitMemo.set(key, ev); return ev;
        }
        function doubleEV(total, soft, cards, up) {
            let ev = 0;
            for (let r = 1; r <= 10; r++) {
                if (p[r] <= 0) continue;
                const [nt] = addCard(total, soft, r);
                let v;
                if (nt > 21) v = -1; else if (cards + 1 >= 6) v = 1; else v = standEV(nt, up);
                ev += p[r] * (2 * v);
            }
            return ev;
        }
        function splitHandRec(rank, up, splitsLeft) {
            let val = 0;
            for (let r = 1; r <= 10; r++) {
                if (p[r] <= 0) continue;
                let [t, s] = addCard(0, false, rank);
                [t, s] = addCard(t, s, r);
                const playVal = Math.max(standEV(t, up), hitEV(t, s, 2, up), doubleEV(t, s, 2, up));
                if (r === rank && splitsLeft > 0) {
                    const resplit = 2 * splitHandRec(rank, up, splitsLeft - 1);
                    val += p[r] * Math.max(resplit, playVal);
                } else {
                    val += p[r] * playVal;
                }
            }
            return val;
        }
        function splitEV(pairRank, up) {
            if (pairRank === 1) { // split aces: one card each, forced stand
                let ev = 0;
                for (let r = 1; r <= 10; r++) {
                    if (p[r] <= 0) continue;
                    let [t] = addCard(0, false, 1); [t] = addCard(t, false, r);
                    ev += p[r] * standEV(t, up);
                }
                return 2 * ev;
            }
            return 2 * splitHandRec(pairRank, up, 2);
        }
        function bustOnHit(total, soft) {
            let b = 0;
            for (let r = 1; r <= 10; r++) { if (p[r] <= 0) continue; const [nt] = addCard(total, soft, r); if (nt > 21) b += p[r]; }
            return b;
        }
        return { dealerOutcomes, standEV, hitEV, doubleEV, splitEV, bustOnHit };
    }

    function recommend(playerRanks, up, deck, opts) {
        opts = opts || {};
        const eng = makeEngine(deck);
        const { total, soft } = handValue(playerRanks);
        const cards = playerRanks.length;
        const actions = {};
        actions.Stand = eng.standEV(total, up);
        if (total < 21) actions.Hit = eng.hitEV(total, soft, cards, up);
        if (cards === 2) {
            actions.Double = eng.doubleEV(total, soft, cards, up);
            if (opts.surrender !== false) actions.Surrender = -0.5;
            if (playerRanks[0] === playerRanks[1] && !opts.noSplit) actions.Split = eng.splitEV(playerRanks[0], up);
        }
        let best = null, bestEV = -Infinity, second = -Infinity;
        for (const a in actions) {
            if (actions[a] > bestEV) { second = bestEV; bestEV = actions[a]; best = a; }
            else if (actions[a] > second) second = actions[a];
        }
        const d = eng.dealerOutcomes(up);
        return {
            best, actions, total, soft,
            margin: bestEV - second,
            dealerBust: d.bust,
            bustOnHit: total < 21 ? eng.bustOnHit(total, soft) : 0
        };
    }

    /* ════════════════════════════ DECK TRACKING ════════════════════════════ */
    const tracker = {
        seen: new Array(11).fill(0),  // per-rank counts since last shuffle
        total: 0,
        reset() { this.seen = new Array(11).fill(0); this.total = 0; },
        add(rank) { if (rank >= 1 && rank <= 10) { this.seen[rank]++; this.total++; } },
        runningCount() { // Hi-Lo: 2-6 = +1, 7-9 = 0, 10/A = -1
            let rc = 0;
            for (let r = 2; r <= 6; r++) rc += this.seen[r];
            rc -= (this.seen[10] + this.seen[1]);
            return rc;
        },
        decksRemaining() { return Math.max(0.5, (416 - this.total) / 52); },
        trueCount() { return this.runningCount() / this.decksRemaining(); }
    };

    /* ════════════════════════════ BET SUGGESTION ═══════════════════════════
       Base edge ≈ -0.5% (8-deck S17, perfect play). Each +1 true count ≈ +0.5%.
       Kelly fraction f* = edge / variance (var ≈ 1.3), scaled by the user's
       risk slider. Tracking OFF -> flat minimum (game is ~break-even/-EV).
       ════════════════════════════════════════════════════════════════════════ */
    const BASE_EDGE = -0.5, EDGE_PER_TC = 0.5, VARIANCE = 1.3;
    function betSuggestion() {
        let tc = 0, edge = BASE_EDGE;
        if (cfg.tracking) { tc = tracker.trueCount(); edge = BASE_EDGE + EDGE_PER_TC * tc; }
        let suggested = cfg.minBet, rationale;
        if (edge > 0) {
            const f = (edge / 100) / VARIANCE * cfg.risk;
            suggested = Math.round(cfg.bankroll * f);
            suggested = Math.max(cfg.minBet, Math.min(cfg.maxBet, suggested));
            rationale = cfg.tracking
                ? `Positive count (+${edge.toFixed(2)}% edge) → ramp up`
                : `Edge favorable → Kelly-sized`;
        } else {
            rationale = cfg.tracking
                ? `Count not favorable (${edge.toFixed(2)}%) → bet minimum`
                : `Game ~break-even/-EV → flat minimum for fun`;
        }
        return { suggested, edge, tc, rationale };
    }

    /* ══════════════════════════ DOM CARD PARSING ═══════════════════════════
       Preserved from 1.3.0. Confirmed live: cards encode as card-{suit}-{rank}
       classes under .player-cards/.dealer-cards → .cards; the container carries
       an actN flag; .total holds "(N)". Kept the broad fallbacks (img/text) so a
       skin change can't silently blind the parser. */
    const SUITS = 'spades|hearts|diamonds|clubs';
    function rankFromToken(tok) {
        tok = String(tok).toLowerCase();
        if (tok === 'ace' || tok === 'a' || tok === '1') return 1;
        if (tok === 'king' || tok === 'queen' || tok === 'jack' ||
            tok === 'k' || tok === 'q' || tok === 'j' || tok === '10' || tok === 't') return 10;
        const n = parseInt(tok, 10);
        return (n >= 2 && n <= 9) ? n : null;
    }
    function rankFromString(s) {
        if (!s) return null;
        s = String(s).toLowerCase();
        if (/(card[-_ ]?back|cardback|facedown|face-down|hidden|\bback\b)/.test(s)) return 'back';
        let m = s.match(new RegExp(`card[-_ ](?:${SUITS})[-_ ]([a-z0-9]+)`));
        if (m) { const r = rankFromToken(m[1]); if (r) return r; }
        m = s.match(new RegExp(`(?:${SUITS})[-_ ]?(10|[2-9akqjt])(?![a-z0-9])`));
        if (m) { const r = rankFromToken(m[1]); if (r) return r; }
        m = s.match(new RegExp(`(10|[2-9akqjt])[-_ ]?(?:${SUITS})`));
        if (m) { const r = rankFromToken(m[1]); if (r) return r; }
        m = s.match(/(?:^|[^a-z])(ace|king|queen|jack)(?:[^a-z]|$)/);
        if (m) { const r = rankFromToken(m[1]); if (r) return r; }
        m = s.match(/(10|[2-9akqj])\s*[♠♥♦♣]/i);
        if (m) { const r = rankFromToken(m[1]); if (r) return r; }
        m = s.match(/(?:^|[^0-9])(10|[2-9])(?:[^0-9]|$)/);
        if (m) { const r = rankFromToken(m[1]); if (r) return r; }
        return null;
    }
    function cardRank(el) {
        if (!el) return null;
        const cls = (typeof el.className === 'string') ? el.className : (el.getAttribute && el.getAttribute('class')) || '';
        if (/card-back|cardback/i.test(cls)) return 'back';
        let r = rankFromString(cls);
        if (r) return r;
        const img = (el.tagName === 'IMG') ? el : (el.querySelector && el.querySelector('img'));
        if (img) {
            r = rankFromString(img.getAttribute('alt')) || rankFromString(img.getAttribute('title')) || rankFromString(img.getAttribute('src'));
            if (r) return r;
        }
        if (el.dataset) for (const k in el.dataset) { r = rankFromString(k + '-' + el.dataset[k]); if (r) return r; }
        r = rankFromString(el.getAttribute && (el.getAttribute('aria-label') || ''));
        if (r) return r;
        r = rankFromString(el.textContent);
        if (r) return r;
        return null;
    }
    function looksLikeCard(el) {
        const cls = (typeof el.className === 'string') ? el.className : '';
        return /\bcard\b|card-|cardback/i.test(cls) || el.tagName === 'IMG' || (el.querySelector && el.querySelector('img'));
    }
    function parseTotal(scope) {
        if (!scope) return null;
        const t = scope.querySelector('.total');
        let m = t && String(t.textContent).match(/\((\d{1,2})\)/);
        if (m) return parseInt(m[1], 10);
        m = String(scope.textContent || '').match(/\((\d{1,2})\)/);
        return m ? parseInt(m[1], 10) : null;
    }
    // The container carries "cards actN" — N = number of cards dealt. Useful when
    // per-slot classes lag behind the animation. Returns null if not present.
    function actCount(scope) {
        if (!scope) return null;
        const cont = scope.querySelector('.table-cards-wrap .cards') || scope.querySelector('.cards');
        if (!cont) return null;
        const cls = (typeof cont.className === 'string') ? cont.className : '';
        const m = cls.match(/\bact(\d+)\b/);
        return m ? parseInt(m[1], 10) : null;
    }
    function readCards(scope) {
        const out = { ranks: [], hasBack: false, count: 0, total: null, act: null };
        if (!scope) return out;
        out.total = parseTotal(scope);
        out.act = actCount(scope);
        let kids = [];
        const c1 = scope.querySelector('.table-cards-wrap .cards') || scope.querySelector('.cards');
        if (c1 && c1.children.length) kids = Array.from(c1.children);
        if (!kids.length) {
            kids = Array.from(scope.querySelectorAll('*')).filter(e =>
                looksLikeCard(e) && !/cards-on-table|table-cards|cards-wrap|table-name/i.test(
                    (typeof e.className === 'string') ? e.className : ''));
        }
        for (const el of kids) {
            const r = cardRank(el);
            if (r === 'back') { out.hasBack = true; out.count++; continue; }
            if (r == null) continue;
            out.ranks.push(r); out.count++;
        }
        // If the container knows more cards were dealt than we could read, trust it
        // for the count (keeps the "waiting/approx" logic honest during animation).
        if (out.act != null && out.act > out.count) out.count = out.act;
        return out;
    }
    function synthHand(total, count) {
        count = Math.max(2, count || 2);
        const a = new Array(count).fill(2);
        let rem = total - 2 * count;
        for (let i = 0; i < count && rem > 0; i++) { const add = Math.min(8, rem); a[i] += add; rem -= add; }
        return a;
    }

    /* ══════════════════════════════ UI PANEL ═══════════════════════════════
       Rebuilt to the OC Suite look. Static inline panel (PDA/mobile friendly),
       inserted right after the game wrap. */
    let panel, els = {};
    function bindTap(el, fn) {
        let last = 0;
        const h = (e) => { const t = Date.now(); if (t - last < 400) return; last = t; if (e.cancelable) e.preventDefault(); fn(e); };
        el.addEventListener('touchend', h, { passive: false });
        el.addEventListener('click', h);
    }

    function buildPanel() {
        if (document.getElementById(`${NS}-panel`)) { panel = document.getElementById(`${NS}-panel`); return; }
        panel = document.createElement('div');
        panel.id = `${NS}-panel`;
        panel.style.cssText = `--bg:${T.bg};--card:${T.card};--hover:${T.hover};--border:${T.border};`
            + `--text:${T.text};--dim:${T.textDim};--muted:${T.textMuted};--faint:${T.textFaint};`
            + `font-family:Arial,Helvetica,sans-serif;color:var(--text);background:var(--bg);`
            + `border:1px solid var(--border);border-radius:12px;margin:8px 0;padding:0;`
            + `box-shadow:0 4px 18px rgba(0,0,0,.5);overflow:hidden;`;
        panel.innerHTML = `
          <div id="${NS}-head" style="display:flex;align-items:center;justify-content:space-between;
               padding:10px 13px;background:linear-gradient(180deg,#12203a,#0d1626);
               border-bottom:1px solid var(--border);cursor:pointer;user-select:none;">
            <span style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:13px;letter-spacing:.3px;color:#eaf2ff;">
              <span style="color:${T.gold};font-size:15px;">♠</span> Blackjack Advisor
              <span style="opacity:.45;font-weight:normal;font-size:11px;">v${VERSION}</span>
            </span>
            <span id="${NS}-toggle" style="font-size:12px;opacity:.7;">${cfg.collapsed ? '▸' : '▾'}</span>
          </div>
          <div id="${NS}-body" style="display:${cfg.collapsed ? 'none' : 'block'};padding:11px 13px;">
            <div id="${NS}-rec" style="text-align:center;font-size:23px;font-weight:800;letter-spacing:.5px;
                 padding:12px 8px;border-radius:10px;background:var(--card);border:1px solid var(--border);
                 border-left:4px solid ${T.textFaint};margin-bottom:8px;">—</div>
            <div id="${NS}-sub" style="text-align:center;font-size:11px;color:var(--dim);margin:-2px 0 9px;">waiting for hand…</div>
            <div id="${NS}-ev-label" style="font-size:10px;color:var(--faint);margin-bottom:3px;letter-spacing:.5px;display:none;">ALL MOVES · RANKED BY EV</div>
            <div id="${NS}-ev" style="font-size:11px;margin-bottom:9px;"></div>
            <div style="display:flex;gap:8px;margin-bottom:9px;">
              <div style="flex:1;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:7px;text-align:center;">
                <div style="font-size:10px;color:var(--muted);letter-spacing:.3px;">DEALER BUST</div>
                <div id="${NS}-dbust" style="font-size:16px;font-weight:800;color:${T.good};">—</div>
              </div>
              <div style="flex:1;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:7px;text-align:center;">
                <div style="font-size:10px;color:var(--muted);letter-spacing:.3px;">BUST IF HIT</div>
                <div id="${NS}-phit" style="font-size:16px;font-weight:800;color:${T.crit};">—</div>
              </div>
            </div>
            <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:9px 10px;margin-bottom:9px;">
              <div style="display:flex;justify-content:space-between;align-items:baseline;">
                <span style="font-size:11px;color:var(--dim);letter-spacing:.3px;">💰 SUGGESTED BET</span>
                <span id="${NS}-betedge" style="font-size:10px;color:var(--muted);"></span>
              </div>
              <div id="${NS}-bet" style="font-size:21px;font-weight:800;color:${T.gold};">—</div>
              <div id="${NS}-betwhy" style="font-size:10px;color:var(--muted);margin-top:2px;"></div>
            </div>
            <div id="${NS}-stats" style="font-size:11px;color:var(--dim);text-align:center;margin-bottom:9px;"></div>
            <div id="${NS}-settings"></div>
          </div>`;
        const host = document.querySelector('.blackjack-wrap') || document.querySelector('#mainContainer') || document.body;
        if (host.parentNode) host.parentNode.insertBefore(panel, host.nextSibling);
        else document.body.appendChild(panel);

        els = {
            head: panel.querySelector(`#${NS}-head`),
            toggle: panel.querySelector(`#${NS}-toggle`),
            body: panel.querySelector(`#${NS}-body`),
            rec: panel.querySelector(`#${NS}-rec`),
            sub: panel.querySelector(`#${NS}-sub`),
            ev: panel.querySelector(`#${NS}-ev`),
            evLabel: panel.querySelector(`#${NS}-ev-label`),
            dbust: panel.querySelector(`#${NS}-dbust`),
            phit: panel.querySelector(`#${NS}-phit`),
            bet: panel.querySelector(`#${NS}-bet`),
            betedge: panel.querySelector(`#${NS}-betedge`),
            betwhy: panel.querySelector(`#${NS}-betwhy`),
            stats: panel.querySelector(`#${NS}-stats`),
            settings: panel.querySelector(`#${NS}-settings`)
        };
        bindTap(els.head, () => {
            cfg.collapsed = !cfg.collapsed; saveCfg();
            els.body.style.display = cfg.collapsed ? 'none' : 'block';
            els.toggle.textContent = cfg.collapsed ? '▸' : '▾';
        });
        buildSettings();
        renderStats();
        renderBet();
    }

    function numRow(label, id, val) {
        return `<div style="display:flex;align-items:center;justify-content:space-between;margin:5px 0;">
          <label style="font-size:11px;color:var(--dim);">${label}</label>
          <input id="${NS}-${id}" type="number" value="${val}" style="width:120px;background:var(--bg);
            border:1px solid var(--border);color:var(--text);border-radius:5px;padding:5px 7px;font-size:12px;text-align:right;">
        </div>`;
    }
    function buildSettings() {
        els.settings.innerHTML = `
          <details style="border-top:1px solid var(--border);padding-top:7px;">
            <summary style="font-size:11px;color:var(--dim);cursor:pointer;">⚙ Settings</summary>
            <div style="padding:7px 0;">
              ${numRow('Bankroll ($)', 'bankroll', cfg.bankroll)}
              ${numRow('Min bet ($)', 'minBet', cfg.minBet)}
              ${numRow('Max bet ($)', 'maxBet', cfg.maxBet)}
              <div style="display:flex;align-items:center;justify-content:space-between;margin:5px 0;">
                <label style="font-size:11px;color:var(--dim);">Risk (Kelly ×<span id="${NS}-riskv">${cfg.risk.toFixed(2)}</span>)</label>
                <input id="${NS}-risk" type="range" min="0.1" max="1" step="0.05" value="${cfg.risk}" style="width:120px;accent-color:${T.link};">
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin:7px 0;">
                <label style="font-size:11px;color:var(--dim);">Hi-Lo deck tracking</label>
                <input id="${NS}-tracking" type="checkbox" ${cfg.tracking ? 'checked' : ''} style="accent-color:${T.link};">
              </div>
              <div style="font-size:10px;color:var(--faint);margin:4px 0;">Tracking powers the bet ramp. Torn's shoe persistence is unconfirmed, so leave OFF unless you've verified a real depleting shoe. Resets automatically on the shuffle banner.</div>
              <button id="${NS}-reset" style="margin-top:6px;width:100%;background:var(--hover);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:8px;font-size:11px;cursor:pointer;">Reset session stats &amp; count</button>
              <button id="${NS}-diag" style="margin-top:7px;width:100%;background:linear-gradient(180deg,#2ea0e6,#1c7fd0);border:none;color:#04121f;font-weight:800;letter-spacing:.3px;border-radius:8px;padding:9px;font-size:11px;cursor:pointer;box-shadow:0 0 14px rgba(61,184,245,.25);">🔍 Copy DOM for debug</button>
              <div style="font-size:10px;color:var(--faint);margin-top:5px;">If advice shows "—" or looks wrong, tap this during a live hand and send me the copied text so I can lock the selectors.</div>
            </div>
          </details>`;
        const onNum = (id, key, intgr) => {
            const inp = panel.querySelector(`#${NS}-${id}`);
            inp.addEventListener('change', () => {
                let v = parseFloat(inp.value); if (isNaN(v) || v < 0) v = 0;
                cfg[key] = intgr ? Math.round(v) : v; saveCfg(); renderBet();
            });
        };
        onNum('bankroll', 'bankroll', true);
        onNum('minBet', 'minBet', true);
        onNum('maxBet', 'maxBet', true);
        const risk = panel.querySelector(`#${NS}-risk`);
        risk.addEventListener('input', () => {
            cfg.risk = parseFloat(risk.value);
            panel.querySelector(`#${NS}-riskv`).textContent = cfg.risk.toFixed(2);
            saveCfg(); renderBet();
        });
        const trk = panel.querySelector(`#${NS}-tracking`);
        trk.addEventListener('change', () => { cfg.tracking = trk.checked; saveCfg(); renderBet(); });
        bindTap(panel.querySelector(`#${NS}-reset`), () => {
            stats.w = stats.l = stats.p = stats.bj = 0; stats.net = 0; stats.netKnown = true; saveStats();
            tracker.reset(); renderStats(); renderBet();
        });
        bindTap(panel.querySelector(`#${NS}-diag`), () => diagDump());
    }

    /* ════════════════════════════ SESSION STATS ════════════════════════════ */
    const stats = {
        w: Store.get('s_w', 0), l: Store.get('s_l', 0), p: Store.get('s_p', 0),
        bj: Store.get('s_bj', 0), net: Store.get('s_net', 0),
        netKnown: Store.get('s_netKnown', true)  // false once a result had no $ to read
    };
    const saveStats = () => {
        Store.set('s_w', stats.w); Store.set('s_l', stats.l); Store.set('s_p', stats.p);
        Store.set('s_bj', stats.bj); Store.set('s_net', stats.net); Store.set('s_netKnown', stats.netKnown);
    };
    function renderStats() {
        if (!els.stats) return;
        const tot = stats.w + stats.l + stats.p;
        const wr = tot ? ((stats.w / tot) * 100).toFixed(0) : '—';
        const netStr = stats.netKnown
            ? (stats.net >= 0 ? '+$' : '-$') + Math.abs(stats.net).toLocaleString()
            : 'n/a';
        els.stats.innerHTML =
            `W <b style="color:${T.good};">${stats.w}</b> · L <b style="color:${T.crit};">${stats.l}</b> · `
            + `P <b>${stats.p}</b> · BJ <b style="color:${T.gold};">${stats.bj}</b> · Win ${wr}% · `
            + `Net <b style="color:${stats.netKnown ? (stats.net >= 0 ? T.good : T.crit) : T.muted};">${netStr}</b>`;
    }
    function renderBet() {
        if (!els.bet) return;
        const b = betSuggestion();
        els.bet.textContent = '$' + b.suggested.toLocaleString();
        els.betwhy.textContent = b.rationale;
        els.betedge.textContent = cfg.tracking
            ? `TC ${b.tc >= 0 ? '+' : ''}${b.tc.toFixed(1)} · edge ${b.edge >= 0 ? '+' : ''}${b.edge.toFixed(2)}%`
            : `edge ${b.edge.toFixed(2)}%`;
        els.bet.style.color = b.edge > 0 ? T.gold : '#d9a93e';
    }

    /* ════════════════════════ RESULT / SHUFFLE TRACKING ════════════════════ */
    let lastResultToken = null;
    function parseMoney(s) { const m = String(s).replace(/,/g, '').match(/\$([\d.]+)/); return m ? parseFloat(m[1]) : null; }

    function handleResult(wrap) {
        const wl = wrap.querySelector('.win-lose-wrap .win-lose') || wrap.querySelector('.win-lose');
        if (!wl) { lastResultToken = null; return false; }
        const state = wl.querySelector('.bj-wonState');
        const msg = (wl.querySelector('.wl-msg span') || wl.querySelector('.wl-msg') || {}).textContent || '';
        const stateTxt = state ? state.textContent.trim() : '';
        const token = (msg + '|' + stateTxt).trim();
        if (!token || token === lastResultToken) return true; // already recorded or empty
        lastResultToken = token;

        const low = (msg + ' ' + stateTxt).toLowerCase();
        // The amount is NOT reliably in .bj-wonState (that's "dealer had X…"). Scan the
        // whole win-lose wrap for a $ figure; if none is present, flag net unknown
        // rather than silently recording $0 (the 1.3.0 net-tracking bug).
        const amt = parseMoney(wl.textContent);
        if (/push|draw|tie/.test(low)) { stats.p++; }
        else if (/won|win/.test(low)) {
            stats.w++;
            if (amt != null) stats.net += amt; else stats.netKnown = false;
            if (/blackjack/.test(low)) stats.bj++;
        } else if (/los|lost/.test(low)) {
            stats.l++;
            if (amt != null) stats.net -= amt; else stats.netKnown = false;
        }
        saveStats(); renderStats();
        return true;
    }

    function checkShuffle(wrap) {
        const sh = wrap.querySelector('.casino-msg-wrap .shuffled, .shuffled');
        if (sh && sh.offsetParent !== null) { // visible
            if (tracker.total > 0) { tracker.reset(); renderBet(); LOG('shuffle → count reset'); }
        }
    }

    /* ════════════════════════════ MAIN UPDATE ══════════════════════════════ */
    function countNewCards(scope) {
        if (!scope) return;
        const wrap = scope.querySelector('.table-cards-wrap .cards') || scope.querySelector('.cards');
        if (!wrap) return;
        for (const el of wrap.children) {
            if (el.getAttribute(`data-${NS}-c`)) continue;
            const r = cardRank(el);
            if (r === 'back' || r === null) continue;
            el.setAttribute(`data-${NS}-c`, '1');
            tracker.add(r);
        }
    }

    function findWrap() {
        return document.querySelector('.blackjack-wrap')
            || document.querySelector('[class*="blackjack" i]')
            || (document.querySelector('.dealer-cards') && document.querySelector('.player-cards')
                ? (document.querySelector('.player-cards').closest('[class]') || document.body)
                : null);
    }

    function setRecAccent(color) {
        if (els.rec) els.rec.style.borderLeftColor = color;
    }

    function update() {
        let wrap;
        try { wrap = findWrap(); } catch (e) { return; }
        if (!wrap) return;

        checkShuffle(wrap);

        const dealerScope = wrap.querySelector('.dealer-cards') || document.querySelector('.dealer-cards');
        const playerScope = wrap.querySelector('.player-cards') || document.querySelector('.player-cards');
        const dealer = readCards(dealerScope);
        const player = readCards(playerScope);

        if (cfg.tracking) { countNewCards(playerScope); countNewCards(dealerScope); renderBet(); }

        const resolved = handleResult(wrap);

        let dealerUp = null;
        if (dealer.ranks.length) dealerUp = dealer.ranks[0];
        else if (dealer.total != null && dealer.total >= 1) dealerUp = dealer.total === 11 ? 1 : Math.min(10, dealer.total);

        let playerRanks = player.ranks.slice();
        let approx = false;
        const playerCount = Math.max(player.count, player.ranks.length);
        if (playerRanks.length < 2 || playerRanks.length !== playerCount) {
            if (player.total != null && playerCount >= 2) {
                approx = true;
                playerRanks = synthHand(player.total, playerCount);
            }
        }

        const haveHand = playerRanks.length >= 2 && dealerUp !== null;
        const handActive = haveHand && !resolvedVisible(wrap);

        if (!handActive) {
            if (els.rec) {
                const over = resolvedVisible(wrap);
                els.rec.textContent = over ? '✓' : '—';
                els.rec.style.color = 'var(--text)';
                setRecAccent(over ? T.good : T.textFaint);
                els.sub.textContent = over ? 'hand over — place your next bet' : 'waiting for hand…';
                els.ev.innerHTML = '';
                if (els.evLabel) els.evLabel.style.display = 'none';
                els.dbust.textContent = '—'; els.phit.textContent = '—';
            }
            return;
        }

        let deck = fullShoe();
        if (cfg.tracking) {
            for (let r = 1; r <= 10; r++) deck[r] = Math.max(0, deck[r] - tracker.seen[r]);
        } else {
            for (const r of playerRanks) deck[r] = Math.max(0, deck[r] - 1);
            deck[dealerUp] = Math.max(0, deck[dealerUp] - 1);
        }

        let rec;
        try { rec = recommend(playerRanks, dealerUp, deck, { surrender: true, noSplit: approx }); }
        catch (e) { LOG('recommend error', e); return; }

        const isBJ = !approx && playerRanks.length === 2 && rec.total === 21;
        if (isBJ) {
            els.rec.textContent = 'BLACKJACK ♠';
            els.rec.style.color = T.gold;
            setRecAccent(T.gold);
            els.sub.textContent = 'natural 21 — pays 2.5×';
            els.ev.innerHTML = '';
            if (els.evLabel) els.evLabel.style.display = 'none';
            els.dbust.textContent = (rec.dealerBust * 100).toFixed(0) + '%'; els.phit.textContent = '—';
            return;
        }

        const bestColor = ACTION_COLOR[rec.best] || 'var(--text)';
        els.rec.textContent = rec.best.toUpperCase();
        els.rec.style.color = bestColor;
        setRecAccent(bestColor);
        const close = rec.margin < 0.02;
        els.sub.textContent = `your ${rec.soft ? 'soft ' : ''}${rec.total} vs dealer ${dealerUp === 1 ? 'A' : dealerUp}`
            + (close ? ' · close call' : '') + (approx ? ' · approx (totals)' : '');

        const order = ['Stand', 'Hit', 'Double', 'Split', 'Surrender'];
        if (els.evLabel) els.evLabel.style.display = 'block';
        els.ev.innerHTML = order.filter(a => a in rec.actions).map(a => {
            const v = rec.actions[a];
            const isBest = a === rec.best;
            const ac = ACTION_COLOR[a] || '#888';
            const evCol = v >= 0 ? T.good : T.crit;
            return `<div style="display:flex;align-items:center;justify-content:space-between;
                border-left:4px solid ${ac};border-radius:7px;padding:6px 10px;margin:4px 0;
                background:${isBest ? T.hover : T.card};
                ${isBest ? `box-shadow:inset 0 0 0 1px ${ac};` : `border:1px solid ${T.border};border-left:4px solid ${ac};`}">
              <span style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:13px;font-weight:${isBest ? '800' : '600'};color:${isBest ? '#fff' : T.textCard};">${a}</span>
                ${isBest ? `<span style="font-size:9px;background:${ac};color:#04121f;padding:1px 7px;border-radius:10px;font-weight:800;letter-spacing:.4px;">BEST</span>` : ''}
              </span>
              <span style="font-size:12px;font-weight:800;color:${evCol};">EV ${v >= 0 ? '+' : ''}${v.toFixed(3)}</span>
            </div>`;
        }).join('');

        els.dbust.textContent = (rec.dealerBust * 100).toFixed(0) + '%';
        els.phit.textContent = (rec.bustOnHit * 100).toFixed(0) + '%';
    }

    function resolvedVisible(wrap) {
        const state = wrap.querySelector('.bj-wonState');
        if (state) {
            const txt = (state.textContent || '').trim();
            const shown = state.offsetParent !== null || (state.getClientRects && state.getClientRects().length > 0);
            if (txt.length > 0 && shown) return true;
        }
        const msg = wrap.querySelector('.win-lose .wl-msg span, .win-lose .wl-msg');
        if (msg) {
            const txt = (msg.textContent || '').trim();
            const shown = msg.offsetParent !== null;
            if (txt.length > 0 && shown && /won|win|lost|lose|push|draw|tie|blackjack|bust/i.test(txt)) return true;
        }
        return false;
    }

    /* ═══════════════════════ OBSERVER + HEARTBEAT (reliability) ═════════════ */
    let pending = false, busy = false;
    function scheduleUpdate() {
        if (pending) return;
        pending = true;
        (window.requestIdleCallback || window.requestAnimationFrame || ((f) => setTimeout(f, 50)))(() => {
            pending = false;
            if (busy) return;
            busy = true;
            try { update(); } catch (e) { LOG('update error', e); } finally { busy = false; }
        });
    }

    let observer = null, debounceT = null;
    function attachObserver() {
        const target = findWrap() || document.body;
        if (!target) return false;
        if (observer) observer.disconnect();
        observer = new MutationObserver(() => {
            clearTimeout(debounceT);
            debounceT = setTimeout(scheduleUpdate, 120);
        });
        try { observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] }); }
        catch (e) { return false; }
        return true;
    }

    function ensureAlive() {
        if (!findWrap()) return;
        if (!document.getElementById(`${NS}-panel`) || !document.body.contains(panel)) buildPanel();
        if (!observer) attachObserver();
        scheduleUpdate();
    }

    /* ═══════════════════════════ DIAGNOSTICS ═══════════════════════════════ */
    function diagDump() {
        const w = document.querySelector('.blackjack-wrap')
            || document.querySelector('[class*="blackjack" i]')
            || document.querySelector('[class*="cards-on-table" i]')
            || document.querySelector('#mainContainer');
        const cut = (el, n) => el ? el.outerHTML.slice(0, n) : 'NOT FOUND';
        const dealerScope = document.querySelector('.dealer-cards');
        const playerScope = document.querySelector('.player-cards');
        const d = readCards(dealerScope), p = readCards(playerScope);
        const lines = [];
        lines.push(`=== Blackjack Advisor diagnostics v${VERSION} ===`);
        lines.push(`url: ${location.href}`);
        lines.push(`wrap: ${w ? w.className : 'NONE'}`);
        lines.push(`detected dealer: ranks=[${d.ranks}] total=${d.total} count=${d.count} act=${d.act} back=${d.hasBack}`);
        lines.push(`detected player: ranks=[${p.ranks}] total=${p.total} count=${p.count} act=${p.act} back=${p.hasBack}`);
        lines.push(`resolvedVisible: ${w ? resolvedVisible(w) : 'n/a'}`);
        lines.push('--- .dealer-cards ---'); lines.push(cut(dealerScope, 3000));
        lines.push('--- .player-cards ---'); lines.push(cut(playerScope, 3000));
        lines.push('--- .win-lose ---'); lines.push(cut(document.querySelector('.win-lose'), 1500));
        lines.push('--- wrap (first 7000) ---'); lines.push(cut(w, 7000));
        const txt = lines.join('\n');
        try { navigator.clipboard && navigator.clipboard.writeText(txt); } catch (e) {}
        let ta = document.getElementById(`${NS}-diagout`);
        if (!ta) {
            ta = document.createElement('textarea');
            ta.id = `${NS}-diagout`;
            ta.style.cssText = `width:100%;height:130px;margin-top:6px;background:${T.bg};color:${T.link};border:1px solid ${T.border};border-radius:6px;font-size:9px;white-space:pre;`;
            els.settings.appendChild(ta);
        }
        ta.value = txt;
        try { ta.focus(); ta.select(); } catch (e) {}
        LOG('diagnostics copied');
        return txt;
    }

    /* ═══════════════════════════════ BOOT ══════════════════════════════════ */
    function boot() {
        if (!findWrap()) return false;
        buildPanel();
        attachObserver();
        scheduleUpdate();
        return true;
    }

    let tries = 0;
    const waiter = setInterval(() => {
        tries++;
        if (boot() || tries > 40) clearInterval(waiter);
    }, 500);

    // Heartbeat fallback — catches mutations missed in TornPDA's WebView and
    // re-acquires after SPA navigation.
    setInterval(ensureAlive, 1500);

    LOG(`Torn Blackjack Advisor v${VERSION} loaded`);
})();
