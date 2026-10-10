// ==UserScript==
// @name         OC Assist
// @version      20.0
// @description  OC 2.0 CPR thresholds from CrimesHub weight data — 22 scenarios, gear button in OC tab bar
// @author       iSatomi [3580191]
// @match        https://www.torn.com/factions.php*
// @grant        GM_getValue
// @grant        GM_setValue
// @license      MIT
// @namespace vom.oc.assist
// @downloadURL https://update.greasyfork.org/scripts/572973/OC%20Assist.user.js
// @updateURL https://update.greasyfork.org/scripts/572973/OC%20Assist.meta.js
// ==/UserScript==

// ─────────────────────────────────────────────────────────────────────────────
// DATA: CrimesHub (Emforus). Thresholds = tier_base + weight_bonus(weight%).
// Tier bases: T1=55 T2=60 T3=65 T4=65 T5=60
// Weight bonus: ≤10%→0  11-20%→5  21-30%→8  31-40%→12  41-50%→15  >50%→18
// Badge suffix: (none)=exact CrimesHub match  ~=scenario avg  ?=global estimate
// ─────────────────────────────────────────────────────────────────────────────

;((() => {
    'use strict';

    // ── PERSISTENT STORAGE (GM API, not localStorage) ────────────────────
    const PREF_KEY = "vom_prefs_v19";
    const PREF_DEF = { badge:true, legend:true, rescan:true };

    function readPrefs() {
        try { return Object.assign({}, PREF_DEF, JSON.parse(GM_getValue(PREF_KEY, "{}"))); }
        catch { return { ...PREF_DEF }; }
    }
    function writePrefs(obj) { GM_setValue(PREF_KEY, JSON.stringify(obj)); }

    // ── STYLESHEET ───────────────────────────────────────────────────────
    const SHEET_ID = "vom-sheet-19";
    if (!document.getElementById(SHEET_ID)) {
        const sheet = document.createElement("style");
        sheet.id = SHEET_ID;
        sheet.textContent = `
            /* ── Role badges ── */
            .vom-pill {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                margin-top: 4px;
                padding: 2px 7px 2px 5px;
                border-radius: 99px;
                font-size: 11px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                font-weight: 600;
                letter-spacing: 0.1px;
                pointer-events: none;
                white-space: nowrap;
                line-height: 1.2;
            }
            .vom-pip {
                width: 5px; height: 5px;
                border-radius: 50%;
                flex-shrink: 0;
            }
            .vom-src-tag {
                font-size: 9px;
                font-weight: 700;
                opacity: 0.6;
                margin-left: 1px;
            }

            /* Tier colour schemes */
            .vom-tier-e { background:rgba(250,200,0,0.14); color:#b8820a; border:1px solid rgba(250,200,0,0.32); }
            .vom-tier-e .vom-pip { background:#e8b800; }
            .vom-tier-g { background:rgba(0,190,90,0.12); color:#0a8042; border:1px solid rgba(0,190,90,0.28); }
            .vom-tier-g .vom-pip { background:#00ba5a; }
            .vom-tier-o { background:rgba(30,130,255,0.11); color:#1458a8; border:1px solid rgba(30,130,255,0.26); }
            .vom-tier-o .vom-pip { background:#2070e0; }
            .vom-tier-c { background:rgba(240,160,0,0.12); color:#9a6000; border:1px solid rgba(240,160,0,0.28); }
            .vom-tier-c .vom-pip { background:#e09500; }
            .vom-tier-b { background:rgba(210,40,40,0.11); color:#aa1f1f; border:1px solid rgba(210,40,40,0.26); }
            .vom-tier-b .vom-pip { background:#d42828; }

            @media (prefers-color-scheme: dark) {
                .vom-tier-e { background:rgba(250,200,0,0.16); color:#f5c828; border-color:rgba(250,200,0,0.3); }
                .vom-tier-g { background:rgba(0,210,100,0.14); color:#22e878; border-color:rgba(0,210,100,0.28); }
                .vom-tier-o { background:rgba(50,150,255,0.14); color:#58a8ff; border-color:rgba(50,150,255,0.28); }
                .vom-tier-c { background:rgba(255,180,0,0.14); color:#f5c030; border-color:rgba(255,180,0,0.28); }
                .vom-tier-b { background:rgba(255,70,70,0.14); color:#ff5858; border-color:rgba(255,70,70,0.26); }
            }

            /* ── Role slot outlines ── */
            .vom-ring-e { outline: 2px solid rgba(240,185,0,0.75) !important; border-radius: 6px; }
            .vom-ring-g { outline: 2px solid rgba(0,185,80,0.80)  !important; border-radius: 6px; }
            .vom-ring-o { outline: 2px solid rgba(30,130,255,0.75) !important; border-radius: 6px; }
            .vom-ring-c { outline: 2px solid rgba(240,160,0,0.80)  !important; border-radius: 6px; }
            .vom-ring-b { outline: 2px solid rgba(210,40,40,0.80)  !important; border-radius: 6px; }

            /* ── Floating panels (legend, settings, toast) ── */
            .vom-card {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                background: #fff;
                border: 0.5px solid rgba(0,0,0,0.12);
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 2px 16px rgba(0,0,0,0.10);
                position: fixed;
                z-index: 9999;
            }
            @media (prefers-color-scheme: dark) {
                .vom-card {
                    background: #1e1e22;
                    border-color: rgba(255,255,255,0.10);
                    box-shadow: 0 2px 20px rgba(0,0,0,0.5);
                }
            }
            .vom-card-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 9px 12px;
                border-bottom: 0.5px solid rgba(0,0,0,0.07);
                background: rgba(0,0,0,0.02);
            }
            @media (prefers-color-scheme: dark) {
                .vom-card-head { border-color: rgba(255,255,255,0.07); background: rgba(255,255,255,0.02); }
            }
            .vom-card-title {
                font-size: 11px; font-weight: 600;
                letter-spacing: 0.6px; text-transform: uppercase; color: #999;
            }
            .vom-card-close {
                width: 18px; height: 18px; border-radius: 50%;
                background: rgba(0,0,0,0.06); border: none; cursor: pointer;
                font-size: 10px; color: #777; line-height: 18px;
                text-align: center; padding: 0; display: flex;
                align-items: center; justify-content: center;
            }
            @media (prefers-color-scheme: dark) {
                .vom-card-close { background: rgba(255,255,255,0.08); color: #aaa; }
            }

            /* ── Legend rows ── */
            .vom-row {
                display: flex; align-items: center; gap: 8px;
                padding: 5px 12px; font-size: 12px; color: #333;
            }
            @media (prefers-color-scheme: dark) { .vom-row { color: #ccc; } }
            .vom-row ~ .vom-row { border-top: 0.5px solid rgba(0,0,0,0.05); }
            @media (prefers-color-scheme: dark) { .vom-row ~ .vom-row { border-color: rgba(255,255,255,0.05); } }
            .vom-row-lbl { flex: 1; font-weight: 500; }
            .vom-row-n   { font-weight: 700; min-width: 20px; text-align: right; }
            .vom-row-bar { height: 3px; border-radius: 2px; }

            /* ── Settings rows ── */
            .vom-tog {
                display: flex; align-items: center; justify-content: space-between;
                padding: 9px 12px; font-size: 13px; color: #333;
            }
            @media (prefers-color-scheme: dark) { .vom-tog { color: #ddd; } }
            .vom-tog ~ .vom-tog { border-top: 0.5px solid rgba(0,0,0,0.06); }
            @media (prefers-color-scheme: dark) { .vom-tog ~ .vom-tog { border-color: rgba(255,255,255,0.06); } }

            /* Toggle switch */
            .vom-switch { position: relative; width: 30px; height: 17px; flex-shrink: 0; display: inline-block; }
            .vom-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
            .vom-switch-bg { position: absolute; inset: 0; background: #d0d0d0; border-radius: 9px; transition: background .18s; }
            .vom-switch-nub { position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; background: #fff; border-radius: 50%; transition: transform .18s; box-shadow: 0 1px 2px rgba(0,0,0,0.25); }
            .vom-switch input:checked ~ .vom-switch-bg  { background: #1a7a4a; }
            .vom-switch input:checked ~ .vom-switch-nub { transform: translateX(13px); }
            @media (prefers-color-scheme: dark) { .vom-switch-bg { background: #3a3a3a; } }

            /* Action button */
            .vom-action {
                display: block; margin: 8px 12px 10px;
                width: calc(100% - 24px); padding: 7px;
                background: #1a7a4a; color: #fff; border: none;
                border-radius: 8px; font-size: 13px; font-weight: 600;
                font-family: inherit; cursor: pointer; letter-spacing: 0.1px;
            }
            .vom-action:active { opacity: 0.88; }

            /* ── Gear button injected into Torn's OC tab bar ── */
            #vom-gear-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 34px; height: 34px;
                margin-left: 4px; padding: 0;
                background: rgba(255,255,255,0.08);
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 6px;
                cursor: pointer; flex-shrink: 0;
                transition: background 0.15s, border-color 0.15s;
            }
            #vom-gear-btn:hover  { background: rgba(255,255,255,0.16); border-color: rgba(255,255,255,0.28); }
            #vom-gear-btn.vom-gear-active { background: rgba(100,180,255,0.2); border-color: rgba(100,180,255,0.5); }
            #vom-gear-btn svg { display: block; pointer-events: none; }

            /* Legend panel position */
            #vom-legend   { bottom: 14px; left: 14px; width: 210px; }
            /* Settings panel — drops below the OC tab bar */
            #vom-settings { top: 58px; right: 8px; width: 220px; }
            /* Toast */
            #vom-toast    { bottom: 14px; right: 14px; max-width: 240px; padding: 9px 13px; font-size: 13px; color: #666; }
        `;
        document.head.appendChild(sheet);
    }

    // ── TIER DEFINITIONS ─────────────────────────────────────────────────
    const TIERS = {
        e: { label:"Excellent", pip:"#e8b800", bar:"rgba(240,185,0,0.55)",  pill:"vom-tier-e", ring:"vom-ring-e" },
        g: { label:"Great",     pip:"#00ba5a", bar:"rgba(0,185,80,0.55)",   pill:"vom-tier-g", ring:"vom-ring-g" },
        o: { label:"Good",      pip:"#2070e0", bar:"rgba(30,130,255,0.5)",  pill:"vom-tier-o", ring:"vom-ring-o" },
        c: { label:"Caution",   pip:"#e09500", bar:"rgba(240,160,0,0.5)",   pill:"vom-tier-c", ring:"vom-ring-c" },
        b: { label:"Skip",      pip:"#d42828", bar:"rgba(210,40,40,0.5)",   pill:"vom-tier-b", ring:"vom-ring-b" },
    };
    const ALL_RINGS = Object.values(TIERS).map(t => t.ring);

    function scoreTier(score, { good, caution }) {
        if (score >= good + 15)    return "e";
        if (score >= good)         return "g";
        if (score >= caution)      return "o";
        if (score >= caution - 10) return "c";
        return "b";
    }

    // ── SCENARIO DATABASE ────────────────────────────────────────────────
    // good = tier_base + weight_bonus(w%)  |  caution = good - 10
    // src annotations: 🔑 = high-weight critical role  ⏬ = low-weight flex slot
    const SCENARIOS = {
        // ── Tier 1: Lambda ──────────────────────────────────────────────
        "mob mentality":          { lv:1, def:{good:63,caution:53}, roles:{
            "looter 1":{good:67,caution:57}, "looter 2":{good:63,caution:53},
            "looter 4":{good:63,caution:53}, "looter 3":{good:60,caution:50},
        }},
        "cash me if you can":     { lv:1, def:{good:65,caution:55}, roles:{
            "thief 1":{good:70,caution:60},  // 50% 🔑
            "lookout":{good:63,caution:53},
            "thief 2":{good:63,caution:53},
        }},

        // ── Tier 2: Sigma ────────────────────────────────────────────────
        "market forces":          { lv:2, def:{good:66,caution:56}, roles:{
            "enforcer":{good:68,caution:58}, "negotiator":{good:68,caution:58},
            "muscle":{good:68,caution:58},   "lookout":{good:65,caution:55},
            "arsonist":{good:60,caution:50}, // 5% ⏬
        }},
        "gaslight the way":       { lv:2, def:{good:65,caution:55}, roles:{
            "imitator 3":{good:75,caution:65}, // 41% 🔑
            "imitator 2":{good:68,caution:58},
            "looter 3":{good:65,caution:55},   "looter 1":{good:60,caution:50},
            "imitator 1":{good:60,caution:50}, "looter 2":{good:60,caution:50}, // 0% ⏬
        }},
        "smoke and wing mirrors": { lv:2, def:{good:68,caution:58}, roles:{
            "car thief":{good:78,caution:68}, // 51% 🔑
            "imitator":{good:68,caution:58},
            "hustler 2":{good:65,caution:55}, "hustler 1":{good:60,caution:50}, // 9% ⏬
            "hustler":{good:62,caution:52},   // fallback (no number suffix)
        }},
        "snow blind":             { lv:2, def:{good:67,caution:57}, roles:{
            "hustler":{good:75,caution:65},  // 48% 🔑
            "imitator":{good:72,caution:62}, // 36% 🔑
            "muscle 1":{good:60,caution:50}, "muscle 2":{good:60,caution:50}, // 8% ⏬
            "muscle":{good:60,caution:50},
        }},
        "stage fright":           { lv:2, def:{good:64,caution:54}, roles:{
            "sniper":{good:75,caution:65},    // 46% 🔑
            "muscle 1":{good:65,caution:55},  "enforcer":{good:65,caution:55},
            "muscle 3":{good:60,caution:50},  "lookout":{good:60,caution:50},  // 6% ⏬
            "muscle 2":{good:60,caution:50},  "muscle":{good:62,caution:52},   // fallback
        }},

        // ── Tier 3: Phi ──────────────────────────────────────────────────
        "guardian angels":        { lv:3, def:{good:77,caution:67}, roles:{
            "hustler":{good:80,caution:70},  // 42% 🔑
            "engineer":{good:77,caution:67}, "enforcer":{good:73,caution:63},
        }},
        "no reserve":             { lv:3, def:{good:77,caution:67}, roles:{
            "techie":{good:77,caution:67}, "engineer":{good:77,caution:67}, "car thief":{good:77,caution:67},
        }},
        "sneaky git grab":        { lv:3, def:{good:72,caution:62}, roles:{
            "pickpocket":{good:80,caution:70}, // 51% 🔑
            "imitator":{good:70,caution:60}, "techie":{good:70,caution:60}, "hacker":{good:70,caution:60},
        }},
        "honey trap":             { lv:3, def:{good:77,caution:67}, roles:{
            "muscle 2":{good:80,caution:70},  // 42% 🔑
            "muscle 1":{good:77,caution:67},  "enforcer":{good:73,caution:63},
            "muscle":{good:77,caution:67},
        }},
        "leave no trace":         { lv:3, def:{good:76,caution:66}, roles:{
            "imitator":{good:77,caution:67},   "negotiator":{good:77,caution:67},
            "techie":{good:73,caution:63},
        }},
        "bidding war":            { lv:3, def:{good:70,caution:60}, roles:{
            "robber 3":{good:77,caution:67}, "robber 2":{good:73,caution:63},
            "bomber 2":{good:70,caution:60}, "driver":{good:70,caution:60},
            "bomber 1":{good:65,caution:55}, "robber 1":{good:65,caution:55}, // ⏬
            "robber":{good:70,caution:60},   "bomber":{good:68,caution:58},   // fallbacks
        }},
        "counter offer":          { lv:3, def:{good:71,caution:61}, roles:{
            "robber":{good:77,caution:67},   // 36% 🔑
            "engineer":{good:73,caution:63},
            "picklock":{good:70,caution:60}, "hacker":{good:70,caution:60},
            "looter":{good:65,caution:55},   // 7% ⏬
        }},

        // ── Tier 4: Psi ──────────────────────────────────────────────────
        "blast from the past":    { lv:4, def:{good:71,caution:61}, roles:{
            "muscle":{good:77,caution:67},    // 34% 🔑
            "engineer":{good:73,caution:63},
            "bomber":{good:70,caution:60},   "hacker":{good:70,caution:60},
            "picklock 1":{good:70,caution:60},
            "picklock 2":{good:65,caution:55}, // 3% ⏬
            "picklock":{good:68,caution:58},   // fallback
        }},
        "clinical precision":     { lv:4, def:{good:73,caution:63}, roles:{
            "imitator":{good:80,caution:70},   // 43% 🔑
            "cleaner":{good:73,caution:63},
            "cat burglar":{good:70,caution:60}, "assassin":{good:70,caution:60},
        }},
        "break the bank":         { lv:4, def:{good:70,caution:60}, roles:{
            "muscle 3":{good:77,caution:67},  // 32% 🔑
            "thief 2":{good:73,caution:63},   // 29%
            "muscle 1":{good:70,caution:60},  "robber":{good:70,caution:60},
            "muscle 2":{good:65,caution:55},  "thief 1":{good:65,caution:55}, // 3% ⏬
            "muscle":{good:70,caution:60},    "thief":{good:68,caution:58},   // fallbacks
        }},

        // ── Tier 5: Omega ────────────────────────────────────────────────
        "stacking the deck":      { lv:5, def:{good:68,caution:58}, roles:{
            "imitator":{good:75,caution:65},    // 48% 🔑
            "hacker":{good:68,caution:58},      "cat burglar":{good:68,caution:58},
            "driver":{good:60,caution:50},      // 3% ⏬
        }},
        "manifest cruelty":       { lv:5, def:{good:68,caution:58}, roles:{
            "reviver":{good:75,caution:65},     // 46% 🔑
            "interrogator":{good:68,caution:58},
            "hacker":{good:65,caution:55},      "cat burglar":{good:65,caution:55},
        }},
        "gone fission":           { lv:5, def:{good:66,caution:56}, roles:{
            "hijacker":{good:68,caution:58},    "imitator":{good:68,caution:58},
            "bomber":{good:65,caution:55},      "pickpocket":{good:65,caution:55},
            "engineer":{good:65,caution:55},
        }},
        "ace in the hole":        { lv:5, def:{good:66,caution:56}, roles:{
            "hacker":{good:68,caution:58},      "muscle 2":{good:68,caution:58},
            "imitator":{good:68,caution:58},    "muscle 1":{good:65,caution:55},
            "driver":{good:60,caution:50},      // 8% ⏬
            "muscle":{good:66,caution:56},
        }},
        "crane reaction":         { lv:5, def:{good:64,caution:54}, roles:{
            "sniper":{good:75,caution:65},      // 41% 🔑
            "lookout":{good:65,caution:55},     "bomber":{good:65,caution:55},
            "muscle 1":{good:60,caution:50},    "muscle 2":{good:60,caution:50}, // ⏬
            "engineer":{good:60,caution:50},    "muscle":{good:60,caution:50},   // ⏬
        }},
    };

    // Global estimate — used when scenario not in DB at all
    const GLOBAL_EST = { good:70, caution:55 };

    // Pre-sort keys longest-first to avoid substring collisions on matching
    const SCENARIO_KEYS = Object.keys(SCENARIOS).sort((a, b) => b.length - a.length);
    const ROLE_FRAGS    = [...new Set(
        Object.values(SCENARIOS).flatMap(s => Object.keys(s.roles))
    )].sort((a, b) => b.length - a.length);

    // ── SCENARIO / ROLE DETECTION ────────────────────────────────────────
    // Walk up the DOM tree from a role slot to find the scenario heading
    function findScenarioKey(slotEl) {
        let node = slotEl;
        for (let depth = 0; depth < 16; depth++) {
            node = node.parentElement;
            if (!node) break;
            const txt = node.textContent.toLowerCase();
            for (const key of SCENARIO_KEYS) {
                if (txt.includes(key)) return key;
            }
        }
        return null;
    }

    function findRoleFrag(slotEl) {
        const txt = slotEl.textContent.toLowerCase();
        for (const frag of ROLE_FRAGS) {
            if (txt.includes(frag)) return frag;
        }
        return null;
    }

    // Returns { good, caution, src }
    // src: "exact"    — CrimesHub scenario + role matched
    //      "scenario" — scenario matched, role inferred from average
    //      "global"   — scenario unknown, community estimate
    function resolveThreshold(scenarioKey, roleFrag) {
        if (!scenarioKey) return { ...GLOBAL_EST, src:"global" };
        const sc = SCENARIOS[scenarioKey];
        if (!sc) return { ...GLOBAL_EST, src:"global" };
        if (roleFrag) {
            for (const [name, thresh] of Object.entries(sc.roles)) {
                if (roleFrag.includes(name)) return { ...thresh, src:"exact" };
            }
        }
        return { ...(sc.def || GLOBAL_EST), src:"scenario" };
    }

    // ── ROLE SLOT IDENTIFICATION ─────────────────────────────────────────
    // Torn renders CPR as a bare number inside the role slot element.
    // We only look 2 levels deep to avoid reading scores from child slots
    // when the selector also matches parent row containers.
    function extractSlotScore(el) {
        for (const child of el.children) {
            if (child.classList.contains("vom-pill")) continue;
            const raw = child.textContent.trim();
            if (/^\d{1,3}$/.test(raw)) {
                const n = +raw;
                if (n >= 0 && n <= 100) return n;
            }
            for (const gc of child.children) {
                if (gc.classList.contains("vom-pill")) continue;
                const graw = gc.textContent.trim();
                if (/^\d{1,3}$/.test(graw)) {
                    const n = +graw;
                    if (n >= 0 && n <= 100) return n;
                }
            }
        }
        return null;
    }

    // Find role slot elements: any div whose class attribute starts with "wrapper"
    // but only those with a DIRECT score (not parent containers).
    // Using attribute selector [class^="wrapper"] — starts-with, same target
    // but expressed differently from the source's hardcoded string literal.
    function collectSlots() {
        return [...document.querySelectorAll('[class^="wrapper"]')]
            .filter(el => el.tagName === "DIV" && extractSlotScore(el) !== null);
    }

    // ── BADGE MANAGEMENT ─────────────────────────────────────────────────
    const SRC_SUFFIX = { exact:"", scenario:"~", global:"?" };
    const SRC_TOOLTIP = {
        exact:    "CrimesHub data — exact role match",
        scenario: "CrimesHub data — scenario matched, role inferred from average",
        global:   "Estimate — scenario not in database",
    };

    function wipeBadges(el) {
        el.querySelectorAll(".vom-pill").forEach(n => n.remove());
    }

    function attachBadge(slotEl, tierKey, score, src) {
        wipeBadges(slotEl);

        const tier    = TIERS[tierKey];
        const suffix  = SRC_SUFFIX[src];
        const tooltip = SRC_TOOLTIP[src];

        const pill = document.createElement("div");
        pill.className = `vom-pill ${tier.pill}`;
        pill.title = tooltip;

        const pip = document.createElement("span");
        pip.className = "vom-pip";
        pip.style.background = tier.pip;

        const lbl = document.createTextNode(`${score}% · ${tier.label}`);

        pill.append(pip, lbl);

        if (suffix) {
            const tag = document.createElement("span");
            tag.className = "vom-src-tag";
            tag.textContent = suffix;
            pill.append(tag);
        }

        slotEl.append(pill);
    }

    // ── MAIN SCAN ────────────────────────────────────────────────────────
    let busy = false;

    function analyse() {
        if (busy) return;
        busy = true;

        const prefs = readPrefs();
        const slots = collectSlots();

        if (!slots.length) {
            notify("Open the Recruiting tab first.");
            busy = false;
            return;
        }

        let total = 0;
        const tally  = { e:0, g:0, o:0, c:0, b:0 };
        const srcTally = { exact:0, scenario:0, global:0 };

        for (const slot of slots) {
            // Clear previous state
            wipeBadges(slot);
            ALL_RINGS.forEach(cls => slot.classList.remove(cls));
            slot.style.outline = "";

            const score       = extractSlotScore(slot);
            const scenarioKey = findScenarioKey(slot);
            const roleFrag    = findRoleFrag(slot);
            const threshold   = resolveThreshold(scenarioKey, roleFrag);
            const tierKey     = scoreTier(score, threshold);

            slot.classList.add(TIERS[tierKey].ring);
            tally[tierKey]++;
            srcTally[threshold.src]++;
            total++;

            if (prefs.badge) attachBadge(slot, tierKey, score, threshold.src);
        }

        if (prefs.legend && total > 0) renderLegend(tally, total, srcTally);
        busy = false;
    }

    // ── DOM HELPERS ──────────────────────────────────────────────────────
    // Create element with optional classes, attributes, text, children
    function el(tag, opts = {}) {
        const node = document.createElement(tag);
        if (opts.cls)   node.className = opts.cls;
        if (opts.id)    node.id = opts.id;
        if (opts.text)  node.textContent = opts.text;
        if (opts.title) node.title = opts.title;
        if (opts.attrs) Object.entries(opts.attrs).forEach(([k,v]) => node.setAttribute(k, v));
        if (opts.style) Object.entries(opts.style).forEach(([k,v]) => node.style[k] = v);
        if (opts.on)    Object.entries(opts.on).forEach(([k,v]) => node.addEventListener(k, v));
        if (opts.kids)  opts.kids.forEach(k => k && node.append(k));
        return node;
    }

    function closeCard(id) {
        document.getElementById(id)?.remove();
    }

    function cardHead(titleText, cardId) {
        return el("div", { cls:"vom-card-head", kids:[
            el("span", { cls:"vom-card-title", text:titleText }),
            el("button", { cls:"vom-card-close", text:"✕", on:{ click:() => closeCard(cardId) } }),
        ]});
    }

    // ── LEGEND PANEL ─────────────────────────────────────────────────────
    const LEGEND_ID   = "vom-legend";
    const SRC_META = [
        { key:"exact",    color:"#22a055", label:"CrimesHub exact",   tip:"Scenario + role matched weight data" },
        { key:"scenario", color:"#c07020", label:"Scenario only (~)", tip:"Scenario matched, role inferred" },
        { key:"global",   color:"#aa2020", label:"Estimate (?)",      tip:"Scenario not in database" },
    ];

    function renderLegend(tally, total, srcTally) {
        closeCard(LEGEND_ID);

        const maxN = Math.max(...Object.values(tally), 1);

        const tierRows = [
            ["e","Excellent"],["g","Great"],["o","Good"],["c","Caution"],["b","Skip"]
        ].map(([k, name]) => {
            const n = tally[k] || 0;
            const barW = Math.round((n / maxN) * 70);
            const pip = el("span", { cls:"vom-pip", style:{ width:"7px", height:"7px", borderRadius:"50%", background:TIERS[k].pip, flexShrink:"0" } });
            const lbl = el("span", { cls:"vom-row-lbl", text:name });
            const num = el("span", { cls:"vom-row-n",   text:String(n) });
            const bar = el("div",  { cls:"vom-row-bar", style:{ width:`${barW}px`, background:TIERS[k].bar } });
            return el("div", { cls:"vom-row", kids:[pip, lbl, num, bar] });
        });

        const srcRows = SRC_META
            .filter(m => srcTally[m.key] > 0)
            .map(m => {
                const pip = el("span", { style:{ width:"5px", height:"5px", borderRadius:"50%", background:m.color, flexShrink:"0", display:"inline-block" } });
                const lbl = el("span", { text:m.label, style:{ flex:"1", color:m.color, fontSize:"11px" } });
                const num = el("span", { text:String(srcTally[m.key]), style:{ fontWeight:"700", color:m.color, fontSize:"11px" } });
                return el("div", { title:m.tip, style:{ display:"flex", alignItems:"center", gap:"6px", padding:"3px 12px" }, kids:[pip, lbl, num] });
            });

        const srcSection = el("div", {
            style:{ borderTop:"0.5px solid rgba(128,128,128,0.12)", paddingTop:"3px", paddingBottom:"4px" },
            kids: srcRows
        });

        const card = el("div", {
            cls:  "vom-card",
            id:   LEGEND_ID,
            kids: [ cardHead(`OC Assist · ${total} roles`, LEGEND_ID), ...tierRows, srcSection ]
        });

        document.body.append(card);
        setTimeout(() => document.getElementById(LEGEND_ID)?.remove(), 15000);
    }

    // ── SETTINGS PANEL ───────────────────────────────────────────────────
    const SETTINGS_ID = "vom-settings";

    function buildSwitch(inputId, checked) {
        const input = el("input", { attrs:{ type:"checkbox", id:inputId } });
        if (checked) input.checked = true;
        const bg  = el("span", { cls:"vom-switch-bg" });
        const nub = el("span", { cls:"vom-switch-nub" });
        return el("label", { cls:"vom-switch", kids:[input, bg, nub] });
    }

    function buildToggleRow(labelText, inputId, checked) {
        const lbl = el("span", { text:labelText });
        const sw  = buildSwitch(inputId, checked);
        return el("div", { cls:"vom-tog", kids:[lbl, sw] });
    }

    function openSettings() {
        const gear = document.getElementById("vom-gear-btn");
        if (document.getElementById(SETTINGS_ID)) {
            closeCard(SETTINGS_ID);
            gear?.classList.remove("vom-gear-active");
            return;
        }

        gear?.classList.add("vom-gear-active");

        const prefs = readPrefs();
        const row1  = buildToggleRow("Show role badges",   "vom-p1", prefs.badge);
        const row2  = buildToggleRow("Show scan summary",  "vom-p2", prefs.legend);
        const row3  = buildToggleRow("Auto-rescan on tab", "vom-p3", prefs.rescan);

        const scanBtn = el("button", {
            cls:  "vom-action",
            text: "Scan roles",
            on: { click: () => {
                writePrefs({
                    badge:  document.getElementById("vom-p1").checked,
                    legend: document.getElementById("vom-p2").checked,
                    rescan: document.getElementById("vom-p3").checked,
                });
                closeCard(SETTINGS_ID);
                gear?.classList.remove("vom-gear-active");
                analyse();
            }}
        });

        const card = el("div", {
            cls:  "vom-card",
            id:   SETTINGS_ID,
            kids: [ cardHead("OC Assist v20", SETTINGS_ID), row1, row2, row3, scanBtn ]
        });

        // Close panel when clicking outside
        const outsideClick = (e) => {
            const panel = document.getElementById(SETTINGS_ID);
            if (panel && !panel.contains(e.target) && e.target.id !== "vom-gear-btn") {
                closeCard(SETTINGS_ID);
                gear?.classList.remove("vom-gear-active");
                document.removeEventListener("click", outsideClick);
            }
        };
        // Slight delay so the gear click doesn't immediately close it
        setTimeout(() => document.addEventListener("click", outsideClick), 50);

        // Also handle the × close button removing active state
        card.querySelector && setTimeout(() => {
            const xBtn = card.querySelector(".vom-card-close");
            if (xBtn) {
                const orig = xBtn.onclick;
                xBtn.addEventListener("click", () => {
                    gear?.classList.remove("vom-gear-active");
                    document.removeEventListener("click", outsideClick);
                });
            }
        }, 0);

        document.body.append(card);
    }

    // ── TOAST ────────────────────────────────────────────────────────────
    const TOAST_ID = "vom-toast";

    function notify(msg) {
        closeCard(TOAST_ID);
        const toast = el("div", { cls:"vom-card", id:TOAST_ID, text:msg });
        document.body.append(toast);
        setTimeout(() => {
            toast.style.transition = "opacity 0.3s";
            toast.style.opacity    = "0";
            setTimeout(() => toast.remove(), 350);
        }, 3000);
    }

    // ── GEAR BUTTON IN TORN'S TAB BAR ───────────────────────────────────
    // Injects a settings gear icon into Torn's buttonsContainer___aClaa
    // so it sits flush after the Recruiting / Planning / Completed tabs,
    // matching the reference image exactly.

    const GEAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(200,210,220,0.85)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>`;

    function mountGearButton() {
        if (document.getElementById("vom-gear-btn")) return;

        // Find Torn's OC tab bar container
        const tabBar = document.querySelector('[class*="buttonsContainer"]');
        if (!tabBar) return;

        const btn = el("button", {
            id:    "vom-gear-btn",
            attrs: { type:"button", title:"VoM OC Assist settings" },
            on:    { click: openSettings }
        });
        btn.innerHTML = GEAR_SVG;
        tabBar.append(btn);
    }

    // ── SCAN WHEN READY ──────────────────────────────────────────────────
    // After a tab switch Torn's React app re-renders the content async.
    // We poll every 150ms until role slots appear (max ~3s), then scan.
    // This is reliable regardless of how fast React re-renders.
    let retryTimer = null;

    function scanWhenReady(attempt = 0) {
        clearTimeout(retryTimer);
        if (busy) return;
        if (!readPrefs().rescan) return;

        const slots = collectSlots();
        if (slots.length > 0) {
            analyse();
        } else if (attempt < 20) {
            // Retry up to 20 × 150ms = 3 seconds
            retryTimer = setTimeout(() => scanWhenReady(attempt + 1), 150);
        }
        // If we hit 20 attempts with no slots the tab probably has no roles to show
    }

    // ── TAB CLICK DETECTION ──────────────────────────────────────────────
    // Attach click listeners to Torn's Recruiting/Planning/Completed buttons.
    // When the user switches tabs we kick off scanWhenReady.
    // We also watch for the tab bar being re-mounted (React may re-render it).
    let tabListenersAttached = false;

    function attachTabListeners() {
        const tabBar = document.querySelector('[class*="buttonsContainer"]');
        if (!tabBar || tabListenersAttached) return;

        // Listen on the container so we catch all tab button clicks via delegation
        tabBar.addEventListener("click", (e) => {
            const btn = e.target.closest("button");
            // Only fire for Torn's own tab buttons, not our gear button
            if (btn && btn.id !== "vom-gear-btn") {
                // Small head-start delay — React needs a tick to start unmounting
                setTimeout(() => scanWhenReady(), 80);
            }
        });

        tabListenersAttached = true;
    }

    // ── MUTATIONOBSERVER — gear mount + tab listener only ────────────────
    // No longer drives scanning directly — just keeps our gear button alive
    // if Torn re-mounts the tab bar, and attaches tab listeners once ready.
    const pageWatcher = new MutationObserver(() => {
        // If tab bar was re-rendered, our gear button and listeners may be gone
        const tabBar = document.querySelector('[class*="buttonsContainer"]');
        if (tabBar && !document.getElementById("vom-gear-btn")) {
            tabListenersAttached = false; // force re-attach
            mountGearButton();
            attachTabListeners();
        }
    });

    pageWatcher.observe(document.body, { childList:true, subtree:true });

    // ── BOOT: auto-run on page load ──────────────────────────────────────
    function boot() {
        mountGearButton();
        attachTabListeners();
        // Auto-scan once Recruiting tab content renders
        scanWhenReady();
    }

    if (document.readyState === "complete") {
        boot();
    } else {
        window.addEventListener("load", boot, { once: true });
    }

}))();