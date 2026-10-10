// ==UserScript==
// @name         Torn Gym Planner
// @namespace    iSatomi
// @version      3.36
// @description  Gym gains calculator, happy jump planner, and logger for Torn City
// @author       iSatomi [3580191]
// @match        https://www.torn.com/gym.php*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/574916/Torn%20Gym%20Planner.user.js
// @updateURL https://update.greasyfork.org/scripts/574916/Torn%20Gym%20Planner.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // SHARED CORE — API key, gmFetch, cross-page stat/perk cache
    // =========================================================================


    // ── Shared persistence (key = 'apiKey' for all modules) ──────────────────
    const _load = (k, d) => { const v = GM_getValue(k, null); return v !== null ? v : d; };
    const _save = (k, v) => GM_setValue(k, v);

    // Cross-page cache helpers — data written on one page, read on another
    const cache = {
        get: (k) => { try { const v = GM_getValue('aio_'+k, null); return v ? JSON.parse(v) : null; } catch(_){ return null; }},
        set: (k, v) => GM_setValue('aio_'+k, JSON.stringify(v)),
    };
    // Keys: apiKey, battlestats {str,spd,def,dex}, workstats {man,int,end},
    //       perks_raw (flat array of all perk strings), edu_reduction (number)

    // ── Shared gmFetch ────────────────────────────────────────────────────────
    function gmFetch(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method:"GET", url, timeout:10000,
                onload:    r => { try { resolve(JSON.parse(r.responseText)); } catch(e) { reject(e); }},
                onerror:   () => reject(new Error("Network error")),
                ontimeout: () => reject(new Error("Timeout")),
            });
        });
    }

    // ── Shared CSS base — all three modules use .t-wrap, .t-sec, .t-row etc ──
    // Module-specific styles are injected separately per module.
    document.head.insertAdjacentHTML('beforeend', `<style>
.t-wrap{margin:8px 0 12px;background:#181818;border:1px solid #333;border-radius:6px;font-family:Arial,sans-serif;font-size:14px;color:#ccc;overflow:hidden}
.t-hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:linear-gradient(135deg,#222,#1a1a1a);border-bottom:1px solid #2a2a2a;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.t-hdr:active{background:#2a2a2a}
.t-title{font-size:15px;font-weight:bold;color:#e0e0e0}
.t-tog{font-size:16px;color:#555;transition:transform .2s}
.t-wrap.open .t-tog{transform:rotate(180deg)}
.t-body{display:none;padding:12px}
.t-wrap.open .t-body{display:block}
.t-sec{font-size:10px;font-weight:bold;color:#555;letter-spacing:.08em;text-transform:uppercase;margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid #252525}
.t-sec:first-child{margin-top:0}
.t-row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:6px 10px;margin-top:3px;border-radius:4px;background:#1e1e1e}
.t-rl{color:#778;font-size:12px;flex-shrink:0}
.t-rv{color:#dde;font-size:12px;text-align:right}
.t-row.g .t-rv{color:#7abf7a}.t-row.b .t-rv{color:#7a9acc}.t-row.r .t-rv{color:#bf7a7a}.t-row.a .t-rv{color:#bf9f5a}
.t-field{margin-bottom:8px}
.t-field label{display:block;font-size:12px;color:#888;margin-bottom:3px}
.t-field select,.t-field input[type=number],.t-field input[type=password],.t-field input[type=text]{width:100%;padding:8px 10px;background:#222;border:1px solid #383838;border-radius:4px;color:#e0e0e0;font-size:14px;box-sizing:border-box;-webkit-appearance:none;appearance:none}
.t-field select:focus,.t-field input:focus{outline:none;border-color:#555;background:#282828}
.t-sg{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.t-sg .t-field{margin-bottom:0}
.t-sg .t-field label{font-size:11px}
.t-btns{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.t-btn{flex:1;padding:10px 8px;border-radius:4px;border:1px solid #383838;background:#222;color:#ddd;font-size:13px;font-weight:bold;cursor:pointer;text-align:center;-webkit-tap-highlight-color:transparent;transition:background .15s;min-width:60px}
.t-btn:active{background:#2a2a3a}
.t-btn-g{background:#1a2518;border-color:#3a5030;color:#7abf7a}
.t-btn-b{background:#18182a;border-color:#3a3a60;color:#8a8aee}
.t-btn-c{background:#182028;border-color:#304060;color:#6aaade}
.t-status{display:none;margin-top:8px;padding:8px 10px;border-radius:4px;font-size:12px;line-height:1.5;word-break:break-word}
.t-status.ok{display:block;background:#182018;border:1px solid #2a4a2a;color:#7abf7a}
.t-status.err{display:block;background:#201818;border:1px solid #4a2828;color:#bf7a7a}
.t-status.warn{display:block;background:#1e1a10;border:1px solid #4a3a18;color:#bf9f5a}
.t-coll-hdr{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;cursor:pointer;-webkit-tap-highlight-color:transparent;font-size:11px;font-weight:bold;color:#555;letter-spacing:.06em;text-transform:uppercase}
.t-coll-tog{font-size:12px;color:#444;transition:transform .2s}
.t-coll.open .t-coll-tog{transform:rotate(180deg)}
.t-coll-body{display:none;padding:8px 10px 10px}
.t-coll.open .t-coll-body{display:block}
.t-bar{height:6px;background:#1e1e2a;border-radius:3px;margin-top:8px;overflow:hidden}
.t-bar-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#3a5aa0,#6a8acc)}
</style>`);




    // ─────────────────────────────────────────────────────────────────────────
    // GYM DATA — hardcoded fallback only. No separate API call needed.
    // Gym IDs match the Torn API user?selections=gym response (plain integer).
    // Dot values are the actual display values (API stores ×10, we store /10 already).
    // ─────────────────────────────────────────────────────────────────────────
    // Fallback gym data (API: gain/10, energy from energy_cost)
    // Format: { id, name, tier, energy, str, spd, def, dex }
    const GYMS_FALLBACK = [
        { id:1,  name:"Premier Fitness",    tier:"L", energy:5,  str:2.0, spd:2.0, def:2.0, dex:2.0 },
        { id:2,  name:"Average Joes",       tier:"L", energy:5,  str:2.4, spd:2.4, def:2.8, dex:2.4 },
        { id:3,  name:"Woody's Workout",    tier:"L", energy:5,  str:2.8, spd:3.2, def:3.0, dex:2.8 },
        { id:4,  name:"Beach Bods",         tier:"L", energy:5,  str:3.2, spd:3.2, def:3.2, dex:0   },
        { id:5,  name:"Silver Gym",         tier:"L", energy:5,  str:3.4, spd:3.6, def:3.4, dex:3.2 },
        { id:6,  name:"Pour Femme",         tier:"L", energy:5,  str:3.4, spd:3.6, def:3.6, dex:3.8 },
        { id:7,  name:"Davies Den",         tier:"L", energy:5,  str:3.7, spd:0,   def:3.7, dex:3.7 },
        { id:8,  name:"Global Gym",         tier:"L", energy:5,  str:4.0, spd:4.0, def:4.0, dex:4.0 },
        { id:9,  name:"Knuckle Heads",      tier:"M", energy:10, str:4.8, spd:4.4, def:4.0, dex:4.2 },
        { id:10, name:"Pioneer Fitness",    tier:"M", energy:10, str:4.4, spd:4.6, def:4.8, dex:4.4 },
        { id:11, name:"Anabolic Anomalies", tier:"M", energy:10, str:5.0, spd:4.6, def:5.2, dex:4.6 },
        { id:12, name:"Core",               tier:"M", energy:10, str:5.0, spd:5.2, def:5.0, dex:5.0 },
        { id:13, name:"Racing Fitness",     tier:"M", energy:10, str:5.0, spd:5.4, def:4.8, dex:5.2 },
        { id:14, name:"Complete Cardio",    tier:"M", energy:10, str:5.5, spd:5.8, def:5.5, dex:5.2 },
        { id:15, name:"Legs, Bums and Tums",tier:"M", energy:10, str:0,   spd:5.6, def:5.6, dex:5.8 },
        { id:16, name:"Deep Burn",          tier:"M", energy:10, str:6.0, spd:6.0, def:6.0, dex:6.0 },
        { id:17, name:"Apollo Gym",         tier:"H", energy:10, str:6.0, spd:6.2, def:6.4, dex:6.2 },
        { id:18, name:"Gun Shop",           tier:"H", energy:10, str:6.6, spd:6.4, def:6.2, dex:6.2 },
        { id:19, name:"Force Training",     tier:"H", energy:10, str:6.4, spd:6.6, def:6.4, dex:6.8 },
        { id:20, name:"Cha Cha's",          tier:"H", energy:10, str:6.4, spd:6.4, def:6.8, dex:7.0 },
        { id:21, name:"Atlas",              tier:"H", energy:10, str:7.0, spd:6.4, def:6.4, dex:6.6 },
        { id:22, name:"Last Round",         tier:"H", energy:10, str:6.8, spd:6.6, def:7.0, dex:6.6 },
        { id:23, name:"The Edge",           tier:"H", energy:10, str:6.8, spd:7.0, def:7.0, dex:6.8 },
        { id:24, name:"George's",           tier:"H", energy:10, str:7.3, spd:7.3, def:7.3, dex:7.3 },
        { id:25, name:"Balboas Gym",        tier:"S", energy:25, str:0,   spd:0,   def:7.5, dex:7.5 },
        { id:26, name:"Frontline Fitness",  tier:"S", energy:25, str:7.5, spd:7.5, def:0,   dex:0   },
        { id:27, name:"Gym 3000",           tier:"S", energy:50, str:8.0, spd:0,   def:0,   dex:0   },
        { id:28, name:"Mr. Isoyamas",       tier:"S", energy:50, str:0,   spd:0,   def:8.0, dex:0   },
        { id:29, name:"Total Rebound",      tier:"S", energy:50, str:0,   spd:8.0, def:0,   dex:0   },
        { id:30, name:"Elites",             tier:"S", energy:50, str:0,   spd:0,   def:0,   dex:8.0 },
        { id:31, name:"Sports Science Lab", tier:"S", energy:25, str:9.0, spd:9.0, def:9.0, dex:9.0 },
        { id:32, name:"The Jail Gym",       tier:"J", energy:5,  str:3.4, spd:3.4, def:4.6, dex:0   },
    ];

    // Runtime gym list — starts as fallback, gets replaced by API data
    // One-time cache migration: clear old key if present
    if (GM_getValue("gymDataCache", null)) { GM_deleteValue("gymDataCache"); GM_deleteValue("gymDataCacheTs"); }

    let GYMS = GYMS_FALLBACK.slice();
    // Maps: id → gym, name.lower → gym
    let GYM_BY_ID   = {};
    let GYM_BY_NAME = {};

    function buildGymMaps() {
        GYM_BY_ID   = {};
        GYM_BY_NAME = {};
        for (const g of GYMS) {
            GYM_BY_ID[g.id] = g;
            GYM_BY_NAME[g.name.toLowerCase()] = g;
        }
        // Debug: log any gym with very high dots (> Sports Science Lab 9.0)
        const suspicious = GYMS.filter(g => Math.max(g.str||0,g.spd||0,g.def||0,g.dex||0) > 9.5);
        if (suspicious.length) {
            console.warn('[AIO Debug] Gyms with >9.5 dots:', JSON.stringify(suspicious));
        }
    }
    buildGymMaps();

    // ─────────────────────────────────────────────────────────────────────────
    // ALL-STATS STORE — populated by fetchFromAPI, used for specialist eligibility
    // ─────────────────────────────────────────────────────────────────────────
    let allStats = { strength:0, speed:0, defense:0, dexterity:0 };
    // Restore battle stats from cross-page cache if available
    (function() {
        const bs = cache.get('battlestats');
        if (bs) { allStats = bs; }
    })();


    // Set of gym IDs the user has actually unlocked (purchased membership).
    // Populated by scraping the gym page DOM — zero API calls needed.
    // Falls back to null (unknown) if DOM scrape fails.
    // Standard gyms unlock sequentially — if user is at gym N, they've unlocked all standard
    // gyms up to and including N. Specialist gyms require separate purchase.
    // STANDARD_UNLOCK_ORDER maps gym id → sequential position (1=first gym, 24=George's)
    const STANDARD_UNLOCK_ORDER = {
        1:1, 2:2, 3:3, 4:4, 5:5, 6:6, 7:7, 8:8,      // L tier
        9:9, 10:10, 11:11, 12:12, 13:13, 14:14, 15:15, 16:16,  // M tier
        17:17, 18:18, 19:19, 20:20, 21:21, 22:22, 23:23, 24:24, // H tier
        32:0, // Jail gym — always accessible in jail
    };
    // Specialist gym IDs (purchased separately, not in the sequential chain)
    const SPECIALIST_IDS = new Set([25, 26, 27, 28, 29, 30, 31]);

    // Specialist unlock requirements — stat ratio conditions
    const SPECIALIST_REQS = {
        25: { // Balboas Gym — DEF+DEX ≥25% > STR+SPD, needs Cha Cha's (id 20) unlocked
            prereqId: 20,
            check: s => (s.defense + s.dexterity) >= (s.strength + s.speed) * 1.25,
            desc: "(DEF+DEX) must be ≥25% more than (STR+SPD) · Needs Cha Cha's",
        },
        26: { // Frontline Fitness — STR+SPD ≥25% > DEF+DEX, needs Cha Cha's
            prereqId: 20,
            check: s => (s.strength + s.speed) >= (s.defense + s.dexterity) * 1.25,
            desc: "(STR+SPD) must be ≥25% more than (DEF+DEX) · Needs Cha Cha's",
        },
        27: { // Gym 3000 — STR ≥25% > 2nd highest, needs George's (id 24)
            prereqId: 24,
            check: s => { const rest = [s.speed,s.defense,s.dexterity].sort((a,b)=>b-a); return s.strength >= rest[0]*1.25; },
            desc: "STR must be ≥25% above 2nd highest stat · Needs George's",
        },
        28: { // Mr. Isoyamas — DEF ≥25% > 2nd highest, needs George's
            prereqId: 24,
            check: s => { const rest = [s.strength,s.speed,s.dexterity].sort((a,b)=>b-a); return s.defense >= rest[0]*1.25; },
            desc: "DEF must be ≥25% above 2nd highest stat · Needs George's",
        },
        29: { // Total Rebound — SPD ≥25% > 2nd highest, needs George's
            prereqId: 24,
            check: s => { const rest = [s.strength,s.defense,s.dexterity].sort((a,b)=>b-a); return s.speed >= rest[0]*1.25; },
            desc: "SPD must be ≥25% above 2nd highest stat · Needs George's",
        },
        30: { // Elites — DEX ≥25% > 2nd highest, needs George's
            prereqId: 24,
            check: s => { const rest = [s.strength,s.speed,s.defense].sort((a,b)=>b-a); return s.dexterity >= rest[0]*1.25; },
            desc: "DEX must be ≥25% above 2nd highest stat · Needs George's",
        },
        31: { // Sports Science Lab — needs Last Round (id 22), drug-limited
            prereqId: 22,
            check: () => true,
            desc: "Needs Last Round unlocked · ≤50 Xanax and ≤50 Ecstasy lifetime",
            drugLimited: true,
        },
    };

    // Check if a gym is accessible given what we know about unlocks + stats
    // Returns { state: 'unlocked'|'ratio'|'prereq', reason, purchased }

    // Rank all gyms for a given stat — split into unlocked, purchasable (ratio met), and locked

    // ─────────────────────────────────────────────────────────────────────────
    // GYM DATA — fetched from Torn API (torn/?selections=gyms) on autofill,
    // cached 24h. Fallback table used only if API hasn't been called yet.
    // The fallback DEX column is approximate — API values are authoritative.
    // ─────────────────────────────────────────────────────────────────────────
    async function loadGymsFromAPI(key) {
        if (!key || key.length !== 16) return false;

        // Use cache if fresh (24h)
        const cacheTs   = _load("gymDataCacheTs_v2", 0);
        const cacheData = _load("gymDataCache_v2", null);
        if (cacheData && (Date.now() - cacheTs) < 86400000) {
            try {
                const cached = JSON.parse(cacheData);
                if (cached?.length > 20) {
                    GYMS = cached;
                    buildGymMaps();
                    rebuildGymDropdown();
                    return true;
                }
            } catch(_) { /* stale/corrupt cache */ }
        }

        try {
            const data = await gmFetch(`https://api.torn.com/torn/?selections=gyms&key=${key}&comment=GymGains`);
            if (data?.error) return false;
            if (!data?.gyms) return false;

            // API returns: { "13": { id:13, name:"Racing Fitness", energy_cost:10,
            //   strength:50, speed:54, defense:48, dexterity:52 }, ... }
            // Gains stored as *10 in API, divide by 10 to get actual dots
            // Build from API data directly — don't filter to fallback only,
            // so new gyms added to Torn are included automatically
            const fallbackById = {};
            GYMS_FALLBACK.forEach(g => { fallbackById[g.id] = g; });

            const updated = Object.entries(data.gyms).map(([idStr, apiGym]) => {
                const id       = parseInt(idStr);
                const fallback = fallbackById[id];
                // Determine tier from fallback if known, else guess from energy cost
                const energy   = apiGym.energy_cost ?? fallback?.energy ?? 10;
                const tier     = fallback?.tier ?? (energy >= 50 ? 'S' : energy >= 25 ? 'S' : energy >= 10 ? 'H' : 'L');
                return {
                    id,
                    name:   apiGym.name   || fallback?.name   || `Gym ${id}`,
                    tier,
                    energy,
                    str: apiGym.strength  != null ? apiGym.strength  / 10 : (fallback?.str ?? 0),
                    spd: apiGym.speed     != null ? apiGym.speed     / 10 : (fallback?.spd ?? 0),
                    def: apiGym.defense   != null ? apiGym.defense   / 10 : (fallback?.def ?? 0),
                    dex: apiGym.dexterity != null ? apiGym.dexterity / 10 : (fallback?.dex ?? 0),
                };
            }).filter(g => {
                if (!(g.str || g.spd || g.def || g.dex)) return false; // trains nothing
                // Skip gyms with suspiciously high dots that we can't identify
                // (likely API data artifacts or test gyms) — cap at 10 dots
                const maxDots = Math.max(g.str||0, g.spd||0, g.def||0, g.dex||0);
                if (maxDots > 10) { console.log('[AIO] Skipping implausible gym:', g); return false; }
                return true;
            });

            // Jail gym (id:32) reports inflated stats (10.0 dots) from API — always use fallback
            const jailFallback = GYMS_FALLBACK.find(g => g.id === 32);
            const jailIdx = updated.findIndex(g => g.id === 32);
            if (jailIdx >= 0) updated[jailIdx] = jailFallback;  // replace API version with fallback
            else if (jailFallback) updated.push(jailFallback);   // add if missing
            updated.sort((a, b) => a.id - b.id);

            GYMS = updated;
            buildGymMaps();
            rebuildGymDropdown();
            _save("gymDataCache_v2", JSON.stringify(GYMS));
            _save("gymDataCacheTs_v2", Date.now());
            return true;
        } catch(_) {
            return false;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONSTANTS
    // ─────────────────────────────────────────────────────────────────────────
    const STAT_KEYS   = { strength:"str", speed:"spd", defense:"def", dexterity:"dex" };
    const STAT_LABELS = { strength:"Strength", speed:"Speed", defense:"Defense", dexterity:"Dexterity" };
    const STAT_ABBREV = { strength:"STR", speed:"SPD", defense:"DEF", dexterity:"DEX" };

    // Vladar's formula constants per stat (post stat-cap-removal, still uses S in formula uncapped)
    // dS = (S*ROUND(1+0.07*ROUND(LN(1+H/250),4),4) + 8*H^1.05 + (1-(H/99999)^2)*A + B)
    //      * (1/200000) * G * E * perks
    // Note: The 50M cap in the formula term was removed Aug 2022 — use actual stat value
    const STAT_CONSTS = {
        strength:  { A:1600, B:1700,  C:700  },
        speed:     { A:1600, B:2000,  C:1350 },
        dexterity: { A:1800, B:1500,  C:1000 },
        defense:   { A:2100, B:-600,  C:1500 },
    };

    const NATURAL_E  = { no:20,  yes:30  };
    const E_CAP      = { no:100, yes:150 };
    const MAX_ITER   = 10000;
    const XAN_CD_AVG = 7, XAN_CD_MIN = 6, XAN_CD_MAX = 8;
    const EDVD_CD = 6, EDVD_HAPPY = 2500;
    const FHC_HAPPY = 500;   // Feathery Hotel Coupon: refills energy + +500 happy
    const FHC_CD    = 6;     // hours of booster CD per FHC
    const FHC_MAX   = 5;     // max FHCs in 30h CD window
    const ITEM_IDS  = { xanax:206, edvd:540, ecstasy:203, fhc:367, lsd:415 };

    // ── Tuning constants ─────────────────────────────────────────────────────
    const FORMULA_CORRECTION = 1.027;  // empirical correction from 34 logged sessions
    const LOG_CLICK_GATE_MS  = 8000;   // window after TRAIN click during which we accept a log
    const LOG_DEDUPE_MS      = 30000;  // suppress duplicate logs within this window
    const OUTLIER_THRESHOLD  = 0.50;   // entries with >50% prediction error excluded from calibration
    const JUMP_HAPPY_RATIO   = 1.5;    // happy / propHappy ratio that classifies a session as a jump
    // Energy can types — IDs resolved at runtime via Torn API items lookup
    // Name must exactly match the Torn item name (after "Can of " prefix)
    const CAN_TYPES = [
        { label:"Goose Juice",     name:"Can of Goose Juice",     e:5,  id:1,    cd:2 },
        { label:"Damp Valley",     name:"Can of Damp Valley",     e:10, id:68,   cd:2 },
        { label:"Crocozade",       name:"Can of Crocozade",       e:15, id:69,   cd:2 },
        { label:"Munster",         name:"Can of Munster",         e:20, id:372,  cd:2 },
        { label:"Santa Shooters",  name:"Can of Santa Shooters",  e:20, id:1020, cd:2 },
        { label:"Red Cow",         name:"Can of Red Cow",         e:25, id:607,  cd:2 },
        { label:"Rockstar Rudolph",name:"Can of Rockstar Rudolph",e:25, id:1021, cd:2 },
        { label:"Taurine Elite",   name:"Can of Taurine Elite",   e:30, id:967,  cd:2 },
    ];
    // Candy types — all give 30min booster CD each, max 48/jump
    // Grouped: 25-happy (cheapest/shoplift), 35-happy (big choc), 50-happy (Crimes 2.0)
    const CANDY_TYPES = [
        { label:"Bag of Candy Kisses",      happy:50, name:"Bag of Candy Kisses",      id:616 },
        { label:"Jawbreaker",               happy:50, name:"Jawbreaker",               id:617 },
        { label:"Pixie Sticks",             happy:50, name:"Pixie Sticks",             id:618 },
        { label:"Big Box of Chocolates",    happy:35, name:"Big Box of Chocolate Bars",id:207 },
        { label:"Box of Chocolates",        happy:25, name:"Box of Chocolate Bars",    id:208 },
        { label:"Lollipop",                 happy:25, name:"Lollipop",                 id:621 },
        { label:"Bag of Bon Bons",          happy:25, name:"Bag of Bon Bons",          id:619 },
        { label:"Box of Mints",             happy:25, name:"Box of Extra Strong Mints",id:620 },
    ];
    const CANDY_CD_HRS = 0.5; // 30min = 0.5h per candy

    // Live prices fetched for all cans, stored here
    let canPrices   = {};  // { canLabel: price }
    let candyPrices = {};  // { candyLabel: price }
    let allItemPrices = {}; // { xanax, edvd, ecstasy, fhc, lsd, + canLabel, candyLabel: price }
    const PRICE_CACHE_KEY = 'aio_priceCache';
    const PRICE_CACHE_TTL = 60 * 60 * 1000; // 1 hour

    // Resolve can item IDs from Torn API (cached in GM storage for 7 days)
    async function resolveCanIDs(apiKey) {
        const CACHE_KEY = "canItemIds", CACHE_TS = "canItemIdsTs";
        const cached = _load(CACHE_KEY, null), ts = _load(CACHE_TS, 0);
        if (cached && (Date.now()-ts) < 7*86400000) {
            try {
                const ids = JSON.parse(cached);
                CAN_TYPES.forEach(c   => { if (ids[c.name]) c.id = ids[c.name]; });
                CANDY_TYPES.forEach(c => { if (ids[c.name]) c.id = ids[c.name]; });
                return;
            } catch(_) {}
        }
        const key = (_load("apiKey","") || "").trim();
        if (!key || key.length !== 16) return;
        try {
            const data = await gmFetch("https://api.torn.com/torn/?selections=items&key="+key+"&comment=AIOIDs");
            if (data?.error || !data?.items) return;
            const idMap = {};
            for (const [id, item] of Object.entries(data.items)) {
                // Match by name only — Torn API types vary (cans="Energy Drink", candy="Drug")
                if (CAN_TYPES.some(c=>c.name===item.name) || CANDY_TYPES.some(c=>c.name===item.name))
                    idMap[item.name] = parseInt(id);
            }
            CAN_TYPES.forEach(c   => { if (idMap[c.name]) c.id = idMap[c.name]; });
            CANDY_TYPES.forEach(c => { if (idMap[c.name]) c.id = idMap[c.name]; });
            _save(CACHE_KEY, JSON.stringify(idMap)); _save(CACHE_TS, Date.now());
        } catch(_) {}
    }

    const GG_DEFAULTS = {
        gymId:"18", stat:"strength", subscriber:"no",
        happy:"4525", statTotal:"0", statGoal:"300000", calcMode:"daily",
        factionPerk:"0", propertyPerk:"0", eduStatPerk:"0", eduGenPerk:"0",
        jobPerk:"0", bookPerk:"0", sportsSneakers:"0", steroids:"0",
        energy:"10", dailyRefill:"no", dailyRefillCost:"1725000",
        hjXanaxCount:"4", hjEDVDs:"5", hjANJob:"no", hjEcstasy:"yes", hjRefill:"yes",
        hjBaseHappy:"0", hjVoracity:"0",
        hjXanaxCost:"880000", hjEDVDCost:"2500000", hjEcstasyCost:"100000",
        hjXanaxOD:"3", hjEcstasyOD:"5", hjToleration:"0", hjNightclub:"no",
        hjFHC:"0", hjFHCCost:"12000000", hjFHCHappy:"500",
        hjLSD:"0", hjLSDCost:"500000",
        hjCans:"0", hjCanType:"0", hjCanCost:"1650000", hjCanFactionPerk:"0",
        hjCandies:"0", hjCandyType:"0", hjCandyCost:"500000",
        hjCandyVoracity:"0", hjCandyAbsorption:"no",
        xgXanaxCount:"1", xgXanaxCost:"880000",
        xgRefill:"no", xgRefillCost:"1725000",
    };
    const gg_load = k => _load(k, GG_DEFAULTS[k]);
    const gg_save = (k, v) => _save(k, v);

    const STYLES = `
.gg-wrap{margin:8px 0 12px;background:#181818;border:1px solid #333;border-radius:6px;font-family:Arial,sans-serif;font-size:14px;color:#ccc;overflow:hidden}
.gg-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:linear-gradient(135deg,#242424,#1c1c1c);border-bottom:1px solid #2a2a2a;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.gg-header:hover{background:linear-gradient(135deg,#2c2c2c,#222)}
.gg-title{font-size:15px;font-weight:bold;color:#e0e0e0}
.gg-toggle{font-size:16px;color:#555;transition:transform .2s}
.gg-wrap.open .gg-toggle{transform:rotate(180deg)}
.gg-body{display:none;padding:12px}
.gg-wrap.open .gg-body{display:block}
.gg-sec{font-size:10px;font-weight:bold;color:#556;letter-spacing:.08em;text-transform:uppercase;margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid #252525}
.gg-sec:first-child{margin-top:0}
.gg-field{margin-bottom:8px}
.gg-field label{display:block;font-size:12px;color:#888;margin-bottom:3px}
.gg-field select,.gg-field input[type=number],.gg-field input[type=password]{width:100%;padding:8px 10px;background:#222;border:1px solid #383838;border-radius:4px;color:#e0e0e0;font-size:14px;box-sizing:border-box;-webkit-appearance:none;appearance:none}
.gg-field select:focus,.gg-field input:focus{outline:none;border-color:#555;background:#282828}
.gg-sg{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.gg-sg .gg-field{margin-bottom:0}
.gg-sg .gg-field label{font-size:11px}
.gg-api-row{display:flex;gap:6px;align-items:stretch}
.gg-api-row input{flex:1}
.gg-api-btn{flex-shrink:0;padding:8px 12px;border-radius:4px;border:1px solid #3a5030;background:#1a2518;color:#7abf7a;font-size:12px;font-weight:bold;cursor:pointer;-webkit-tap-highlight-color:transparent}
.gg-api-btn:hover{background:#20301e}
.gg-tab-row{display:flex;gap:4px}
.gg-tab{flex:1;padding:9px 6px;border-radius:4px;border:1px solid #383838;background:#222;color:#888;font-size:13px;font-weight:bold;cursor:pointer;text-align:center;-webkit-tap-highlight-color:transparent;transition:all .15s}
.gg-tab.active{background:#18182a;border-color:#303058;color:#7a7acc}
.gg-tab:hover{background:#2a2a2a}
.gg-cfg-btn{padding:9px 11px;border-radius:4px;border:1px solid #383838;background:#222;color:#556;font-size:13px;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:all .15s;flex-shrink:0}
.gg-cfg-btn.active{border-color:#303058;color:#7a7acc;background:#181828}
.gg-cfg-btn:hover{background:#2a2a2a}
.gg-section{display:none}
.gg-section.active{display:block}
.gg-btn-row{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
.gg-btn{flex:1;padding:10px 8px;border-radius:4px;border:1px solid #383838;background:#222;color:#ddd;font-size:13px;font-weight:bold;cursor:pointer;text-align:center;-webkit-tap-highlight-color:transparent;transition:background .15s;min-width:60px}
.gg-btn:hover,.gg-btn:active{background:#2a2a2a}
.gg-btn-fill{background:#1a2518;border-color:#3a5030;color:#7abf7a}
.gg-btn-fill:hover,.gg-btn-fill:active{background:#20301e}
.gg-btn-calc{background:#18182a;border-color:#303058;color:#7a7acc}
.gg-btn-calc:hover,.gg-btn-calc:active{background:#20203a}
.gg-btn-compare{background:#1a1a18;border-color:#3a3818;color:#aaaa5a;flex:0 0 auto;padding:10px 12px;font-size:12px}
.gg-btn-compare:hover,.gg-btn-compare:active{background:#26261a}
.gg-btn-copy{background:#1a1a2a;border-color:#2a2a48;color:#5a5a88;font-size:12px;flex:0 0 auto;padding:10px 12px}
.gg-status{display:none;margin-top:8px;padding:8px 10px;border-radius:4px;font-size:12px;line-height:1.5;word-break:break-word}
.gg-status.ok{display:block;background:#182018;border:1px solid #2a4a2a;color:#7abf7a}
.gg-status.warn{display:block;background:#201e10;border:1px solid #4a3a18;color:#bf9f5a}
.gg-row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:6px 10px;margin-top:3px;border-radius:4px;background:#1e1e1e}
.gg-row .gg-rl{color:#888;font-size:12px;flex-shrink:0}
.gg-row .gg-rv{color:#ddd;font-size:13px;text-align:right;word-break:break-word}
.gg-row.hi .gg-rv{color:#7abf7a}
.gg-row.g .gg-rv{color:#7abf7a}
.gg-row.a .gg-rv{color:#bf9f5a}
.gg-row.b .gg-rv{color:#7a7acc}
.gg-collapsible{margin-top:8px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:4px}
.gg-collapsible-header{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;cursor:pointer;-webkit-tap-highlight-color:transparent;font-size:11px;font-weight:bold;color:#556;letter-spacing:.06em;text-transform:uppercase}
.gg-collapsible-header:hover{color:#888}
.gg-collapsible-toggle{font-size:12px;color:#444;transition:transform .2s}
.gg-collapsible.open .gg-collapsible-toggle{transform:rotate(180deg)}
.gg-collapsible-body{display:none;padding:8px 10px 10px}
.gg-collapsible.open .gg-collapsible-body{display:block}
.gg-results{margin-top:10px}
.gg-tldr{background:#0e1a1e;border:1px solid #1a3a4a;border-radius:5px;padding:12px 14px;margin-bottom:10px}
.gg-tldr-title{font-size:11px;font-weight:bold;color:#4a8aaa;letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px}
.gg-tldr-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.gg-tldr-cell{background:#141e24;border:1px solid #1e3040;border-radius:3px;padding:8px 6px;text-align:center}
.gg-tldr-val{font-size:16px;font-weight:bold;color:#7abf7a;line-height:1.2}
.gg-tldr-lbl{font-size:10px;color:#446;margin-top:3px;text-transform:uppercase;letter-spacing:.04em}
.gg-rsec{font-size:10px;font-weight:bold;color:#445;letter-spacing:.08em;text-transform:uppercase;margin:12px 0 4px;padding-bottom:3px;border-bottom:1px solid #222}
.gg-rsec:first-child{margin-top:4px}
.gg-price-badge{font-size:10px;font-weight:normal;color:#4a7a4a;margin-left:4px}
.gg-price-badge.loading{color:#555}
.gg-price-badge.err{color:#7a4a4a}
.gg-cmp{margin-top:10px}
.gg-cmp-title{font-size:12px;font-weight:bold;color:#aaaa5a;letter-spacing:.05em;text-transform:uppercase;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #2a2a1a}
.gg-cmp-grid{display:grid;grid-template-columns:minmax(0,1.1fr) repeat(3,minmax(0,1fr));gap:0;width:100%;table-layout:fixed}
.gg-cmp-hdr{font-size:10px;font-weight:bold;color:#555;padding:5px 4px;background:#1a1a1a;border-bottom:1px solid #252525;text-align:center;word-break:break-word;line-height:1.3}
.gg-cmp-hdr:first-child{text-align:left;color:#444}
.gg-cmp-hdr.daily{color:#7a7acc}
.gg-cmp-hdr.jump{color:#aaaa5a}
.gg-cmp-label{font-size:11px;color:#666;padding:5px 4px;background:#1c1c1c;border-bottom:1px solid #222;word-break:break-word;line-height:1.3}
.gg-cmp-val{font-size:11px;color:#bbb;padding:5px 4px;background:#1e1e1e;border-bottom:1px solid #222;text-align:right;word-break:break-all;line-height:1.3}
.gg-cmp-val.win{color:#7abf7a;font-weight:bold}
.gg-cmp-val.lose{color:#555}
.gg-cmp-verdict{margin-top:12px;padding:10px 12px;border-radius:4px;font-size:12px;line-height:1.7;background:#141a10;border:1px solid #2a3a20;color:#8abf7a}
.gg-bestgym{margin-top:8px;background:#141414;border:1px solid #252525;border-radius:5px;overflow:hidden}
.gg-bestgym-header{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#1a1a1a;border-bottom:1px solid #252525;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none}
.gg-bestgym-title{font-size:11px;font-weight:bold;color:#aaaa5a;letter-spacing:.06em;text-transform:uppercase}
.gg-bestgym-toggle{font-size:12px;color:#555;transition:transform .2s}
.gg-bestgym.open .gg-bestgym-toggle{transform:rotate(180deg)}
.gg-bestgym-body{display:none;padding:8px 10px 10px}
.gg-bestgym.open .gg-bestgym-body{display:block}
.gg-gym-row{display:flex;align-items:center;gap:8px;padding:5px 8px;margin-top:3px;border-radius:3px;background:#1c1c1c;cursor:pointer;-webkit-tap-highlight-color:transparent}
.gg-gym-row:hover{background:#222}
.gg-gym-row.current{background:#18222a;border:1px solid #2a3a4a}
.gg-gym-row.best{background:#181e14;border:1px solid #2a3a20}
.gg-gym-rank{font-size:11px;color:#555;width:16px;flex-shrink:0;text-align:center}
.gg-gym-name{font-size:12px;color:#ccc;flex:1}
.gg-gym-name.current{color:#7aafcc}
.gg-gym-name.best{color:#7abf7a}
.gg-gym-dots-val{font-size:12px;font-weight:bold;color:#7abf7a;flex-shrink:0}
.gg-gym-dots-val.dim{color:#666}
.gg-gym-e{font-size:10px;color:#555;flex-shrink:0}
.gg-gym-use-btn{font-size:10px;padding:2px 6px;border-radius:3px;border:1px solid #2a4a2a;background:#182018;color:#6a9f6a;cursor:pointer;flex-shrink:0;-webkit-tap-highlight-color:transparent}
.gg-gym-use-btn:hover{background:#1e2a1e}
.gg-bestgym-sec{font-size:10px;color:#446;margin:8px 0 3px;letter-spacing:.05em;text-transform:uppercase}
.gg-dots{display:flex;gap:3px;align-items:center;margin-top:4px;font-size:11px;color:#556}
.gg-dot{width:10px;height:10px;border-radius:50%;background:#2a2a2a;border:1px solid #333;display:inline-block}
.gg-dot.on{background:#7abf7a;border-color:#5a9f5a}
.gg-dot.half{background:#bf9f5a;border-color:#9f7f3a}
.gg-dot.off{background:#1e1e1e;border-color:#2a2a2a}
.gg-dot-val{margin-left:4px;color:#7abf7a;font-weight:bold}
.gg-dot-na{color:#555;font-style:italic;margin-left:4px}
.gg-field input.invalid,.gg-field select.invalid{border-color:#7a3030!important;background:#201818!important}
.gg-field input.warn-input,.gg-field select.warn-input{border-color:#6a5020!important}
.gg-val-msg{font-size:10px;color:#bf5a5a;margin-top:2px;display:none}
.gg-val-msg.show{display:block}
.gg-infobar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;padding:6px 8px;background:#141414;border:1px solid #252525;border-radius:4px;font-size:11px;color:#556}
.gg-infobar-item{display:flex;align-items:center;gap:4px}
.gg-infobar-val{color:#888;font-weight:bold}
.gg-infobar-val.hi{color:#7abf7a}
.gg-last-updated{font-size:10px;color:#444;margin-left:auto;white-space:nowrap}
.gg-cfg-panel{margin-top:8px;padding:10px 12px;background:#141414;border:1px solid #252525;border-radius:5px}
`;

    function buildGymOptions() {
        const placeholder = `<option value="" disabled>— select gym —</option>`;
        return placeholder + GYMS.map(g => {
            const label = g.tier === "J" ? g.name : `[${g.tier}] ${g.name}`;
            return `<option value="${g.id}">${label}</option>`;
        }).join('');
    }

    function buildHTML() {
        const statOpts = Object.keys(STAT_KEYS).map(s =>
            `<option value="${s}">${STAT_LABELS[s]}</option>`).join('');
        const perkSel = id =>
            `<select id="gg-${id}">${Array.from({length:101},(_,i)=>
            `<option value="${i}">${i}%</option>`).join('')}</select>`;
        return `
<div class="gg-header">
  <span class="gg-title">🏋️ Gym Gains Calculator</span>
  <span class="gg-toggle">▼</span>
</div>
<div class="gg-body">

<!-- info bar shown after autofill -->
<div id="gg-infobar" class="gg-infobar" style="display:none">
  <div class="gg-infobar-item">⚡ <span class="gg-infobar-val" id="gg-info-energy">—</span></div>
  <div class="gg-infobar-item">😊 <span class="gg-infobar-val" id="gg-info-happy">—</span></div>
  <div class="gg-infobar-item" id="gg-info-sub-wrap" style="display:none">
    🎫 <span class="gg-infobar-val hi" id="gg-info-sub">Subscriber</span>
  </div>
  <div class="gg-last-updated" id="gg-last-updated"></div>
</div>

<!-- ── ONBOARDING — visible until first successful autofill ────────── -->
<div id="gg-onboard" style="margin:8px 0 12px;padding:10px 12px;background:#16201f;border:1px solid #2a4040;border-radius:5px;display:none">
  <div style="font-size:13px;color:#9aaaaa;font-weight:bold;margin-bottom:4px">👋 Welcome — quick setup</div>
  <div style="font-size:11px;color:#778;line-height:1.6">
    1. Add your Torn API key in <strong>⚙ Settings</strong> below<br>
    2. Tap <strong>⟳ Auto-fill</strong> to pull your stats, perks, and prices<br>
    3. Tell the script your current energy → tap <strong>Calculate</strong>
  </div>
</div>

<!-- ── STEP 1: WHAT TO TRAIN ─────────────────────────── -->
<div class="gg-sec">1. What to train</div>
<div class="gg-sg">
  <div class="gg-field">
    <label>Gym <span id="gg-gym-badge" style="font-size:10px;color:#4a7a4a"></span></label>
    <select id="gg-gym">${buildGymOptions()}</select>
    <div class="gg-dots" id="gg-dots-display"></div>
  </div>
  <div class="gg-field">
    <label style="font-weight:bold;color:#9a9acc">Stat</label>
    <select id="gg-stat" style="font-size:15px;font-weight:bold">${statOpts}</select>
  </div>
</div>
<div class="gg-bestgym" id="gg-bestgym-panel">
  <div class="gg-bestgym-header">
    <span class="gg-bestgym-title">⭐ Best Gym for Stat</span>
    <span class="gg-bestgym-toggle">▼</span>
  </div>
  <div class="gg-bestgym-body" id="gg-bestgym-body">
    <div style="font-size:11px;color:#446;padding:4px 0 2px">Auto-fill to check specialist gym eligibility.</div>
  </div>
</div>

<!-- ── STEP 2: YOUR PROFILE (one-time config) ─────────── -->
<div class="gg-collapsible" id="gg-profile-panel" style="margin-top:12px">
  <div class="gg-collapsible-header">
    <span style="color:#9a9aaa">2. Your profile</span>
    <span style="font-size:10px;color:#556;margin-left:6px" id="gg-profile-summary">— set once, applies to all sessions</span>
    <span class="gg-collapsible-toggle">▼</span>
  </div>
  <div class="gg-collapsible-body">
    <div style="font-size:11px;color:#556;margin-bottom:8px;line-height:1.5">
      Auto-fill pulls these from the API. Only edit if needed.
    </div>
    <div class="gg-sg">
      <div class="gg-field">
        <label>Current stat <span id="gg-autofill-badge" style="font-size:10px;color:#4a7a4a;display:none">✓ auto</span></label>
        <input type="number" id="gg-statTotal" min="0" placeholder="e.g. 120,000">
        <div class="gg-val-msg" id="gg-val-stat">Enter your current stat</div>
      </div>
      <div class="gg-field">
        <label>Your goal <span id="gg-goal-progress" style="font-size:10px;color:#556"></span></label>
        <input type="number" id="gg-statGoal" min="0" placeholder="e.g. 600,000">
        <div class="gg-val-msg" id="gg-val-goal">Goal must be higher than current</div>
      </div>
    </div>
    <div class="gg-sg">
      <div class="gg-field">
        <label>Your max happy</label>
        <input type="number" id="gg-happy" min="0" placeholder="e.g. 5025">
        <div class="gg-val-msg" id="gg-val-happy">From your property — auto-filled</div>
      </div>
      <div class="gg-field">
        <label>Subscriber?</label>
        <select id="gg-subscriber">
          <option value="no">No (100E cap)</option>
          <option value="yes">Yes (150E cap)</option>
        </select>
      </div>
    </div>
  </div>
</div>

<!-- ── STEP 3: THIS SESSION ─────────────────────────── -->
<div class="gg-sec" style="margin-top:14px">3. What you have right now</div>
<div style="font-size:11px;color:#556;margin-bottom:8px;line-height:1.5">
  Tell the script what energy and items are available, then tap Calculate.
</div>
<div class="gg-sg">
  <div class="gg-field">
    <label>Current energy ⚡ <span id="gg-energy-badge" style="font-size:10px;color:#4a7a4a"></span></label>
    <input type="number" id="gg-energy" min="0" placeholder="e.g. 150">
  </div>
  <div class="gg-field">
    <label>Drug ready?</label>
    <select id="gg-session-drug">
      <option value="none">None — no drug CD</option>
      <option value="xanax">Xanax (+250E)</option>
      <option value="lsd">LSD (+50E)</option>
    </select>
  </div>
</div>
<div class="gg-sg">
  <div class="gg-field">
    <label>Use Points Refill?</label>
    <select id="gg-session-refill">
      <option value="no">No</option>
      <option value="yes">Yes (+150E, ~$1.7m)</option>
    </select>
  </div>
  <div class="gg-field">
    <label>Happy right now 😊</label>
    <input type="number" id="gg-session-happy" min="0" placeholder="blank = your max">
  </div>
</div>

<!-- ── PRIMARY ACTION — big, obvious, hard to miss ─── -->
<button class="gg-btn gg-btn-calc" id="gg-calc" style="width:100%;font-size:15px;padding:13px;margin-top:10px;font-weight:bold">
  Calculate this session →
</button>

<!-- ── SECONDARY ACTIONS — smaller, less prominent ─── -->
<div class="gg-btn-row" style="margin-top:8px;gap:6px">
  <button class="gg-btn gg-btn-fill" id="gg-autofill" style="flex:1;font-size:12px">⟳ Auto-fill</button>
  <button class="gg-btn gg-btn-compare" id="gg-compare" style="flex:1;font-size:12px">⚖ Compare</button>
</div>
<div class="gg-btn-row" style="margin-top:6px;gap:6px">
  <button class="gg-btn" id="gg-tab-plan" style="flex:1;font-size:11px;color:#bf9f5a;border-color:#3a3018;background:#1a1808">📋 Long-term plan</button>
  <button class="gg-btn" id="gg-tab-bonuses-btn" style="flex:1;font-size:11px;color:#7a6a9a;border-color:#2a2038;background:#181620">🎖 Perks &amp; bonuses</button>
</div>
<button class="gg-btn gg-btn-copy" id="gg-copy" style="width:100%;margin-top:6px;font-size:11px;display:none">📋 Copy result</button>

<!-- ── BONUSES PANEL ── -->
<div class="gg-section" id="gg-bonuses-inputs">
  <div class="gg-cfg-panel">
    <div class="gg-sec" style="margin-top:0">🎖 Perks &amp; Training Bonuses</div>
    <div style="font-size:11px;color:#556;margin-bottom:10px;line-height:1.5">
      These boost gym gains. Auto-filled from your perks. <span id="gg-perks-badge" style="color:#4a7a4a"></span>
    </div>
    <div class="gg-sg">
      <div class="gg-field"><label>Faction Gym</label>${perkSel('factionPerk')}</div>
      <div class="gg-field"><label>Property Gym</label>${perkSel('propertyPerk')}</div>
      <div class="gg-field"><label>Education (this stat)</label>${perkSel('eduStatPerk')}</div>
      <div class="gg-field"><label>Education (all stats)</label>${perkSel('eduGenPerk')}</div>
      <div class="gg-field"><label>Job Bonus</label>${perkSel('jobPerk')}</div>
      <div class="gg-field"><label>Book Bonus</label>${perkSel('bookPerk')}</div>
      <div class="gg-field">
        <label>Steroids</label>
        <select id="gg-steroids"><option value="0">None</option><option value="20">+20%</option></select>
      </div>
      <div class="gg-field">
        <label>Sports Sneakers (SPD)</label>
        <select id="gg-sportsSneakers"><option value="0">None</option><option value="5">+5%</option></select>
      </div>
    </div>
    <div id="gg-bonus-summary" style="margin-top:10px;padding:8px 10px;background:#141e14;border:1px solid #253025;border-radius:4px;font-size:11px;color:#6a9a6a;display:none"></div>
  </div>
</div>

<!-- ── PLAN AHEAD PANEL ── -->
<div class="gg-section" id="gg-plan-inputs">
  <div class="gg-cfg-panel">
    <div class="gg-sec" style="margin-top:0">📋 Long-term Plan — How long to reach your goal?</div>
    <div style="font-size:11px;color:#556;margin-bottom:10px;line-height:1.5">
      Pick how you'll be training day-to-day. The script will project days until you hit your goal.
    </div>
    <div class="gg-field">
      <label>I'll be training with…</label>
      <select id="gg-plan-method">
        <option value="daily">📅 Just natural energy regen</option>
        <option value="xanax">💊 Regen + Xanax every CD</option>
        <option value="jump">⚡ Happy Jumps</option>
      </select>
    </div>
    <div id="gg-plan-xanax-opts" style="display:none;margin-top:8px">
      <div class="gg-sg">
        <div class="gg-field">
          <label>Xanax per day</label>
          <select id="gg-xgXanaxCount">
            <option value="1">1/day (~24h CD)</option>
            <option value="2">2/day (~12h CD)</option>
            <option value="3" selected>3/day (~8h CD) ← typical</option>
            <option value="4">4/day (6h CD)</option>
          </select>
        </div>
        <div class="gg-field">
          <label>Xanax cost <span id="gg-xg-xanax-price" class="gg-price-badge"></span></label>
          <input type="number" id="gg-xgXanaxCost" min="0" placeholder="e.g. 860000">
        </div>
      </div>
      <div class="gg-sg">
        <div class="gg-field">
          <label>Points Refill/day</label>
          <select id="gg-xgRefill"><option value="no">No</option><option value="yes">Yes</option></select>
        </div>
        <div class="gg-field">
          <label>Refill cost ($)</label>
          <input type="number" id="gg-xgRefillCost" min="0" placeholder="1725000">
        </div>
      </div>
    </div>
    <div id="gg-plan-daily-opts" style="margin-top:8px">
      <div class="gg-sg">
        <div class="gg-field">
          <label>Points Refill/day</label>
          <select id="gg-dailyRefill"><option value="no">No</option><option value="yes">Yes</option></select>
        </div>
        <div class="gg-field">
          <label>Refill cost ($)</label>
          <input type="number" id="gg-dailyRefillCost" min="0" placeholder="1725000">
        </div>
      </div>
    </div>
    <div id="gg-plan-jump-opts" style="display:none;margin-top:8px">
      <div class="gg-sec" style="margin-top:0;font-size:10px">Energy Sources</div>
      <div class="gg-sg">
        <div class="gg-field">
          <label>Xanax</label>
          <select id="gg-hjXanaxCount">
            <option value="0">None</option>
            <option value="1">1 (~400E)</option>
            <option value="2">2 (~650E)</option>
            <option value="3">3 (~900E)</option>
            <option value="4">4 (1000E)</option>
          </select>
        </div>
        <div class="gg-field">
          <label>LSD (50E, no OD)</label>
          <select id="gg-hjLSD">
            ${Array.from({length:6},(_,i)=>`<option value="${i}">${i===0?'None':i+' (+'+i*50+'E)'}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="gg-sg">
        <div class="gg-field">
          <label>FHC</label>
          <select id="gg-hjFHC">${Array.from({length:6},(_,i)=>`<option value="${i}">${i===0?'None':i+' FHC (+'+i*FHC_HAPPY+' happy)'}</option>`).join('')}</select>
        </div>
        <div class="gg-field">
          <label>Points Refill after</label>
          <select id="gg-hjRefill"><option value="yes">Yes</option><option value="no">No</option></select>
        </div>
      </div>
      <div class="gg-sg">
        <div class="gg-field">
          <label>Energy Cans</label>
          <select id="gg-hjCanType">
            <option value="0">None</option>
            ${CAN_TYPES.map((c,i)=>`<option value="${i+1}">${c.e}E — ${c.label}</option>`).join('')}
          </select>
        </div>
        <div class="gg-field">
          <label>Number of Cans</label>
          <input type="number" id="gg-hjCans" min="0" max="50" placeholder="0">
        </div>
      </div>
      <div class="gg-sg">
        <div class="gg-field">
          <label>Faction Can Bonus</label>
          <select id="gg-hjCanFactionPerk">
            ${[0,10,20,30,40,50].map(v=>`<option value="${v}">${v===0?'None':'+'+v+'%'}</option>`).join('')}
          </select>
        </div>
        <div class="gg-field">
          <label>Voracity hrs</label>
          <input type="number" id="gg-hjVoracity" min="0" max="24" placeholder="0">
        </div>
      </div>
      <div class="gg-sec" style="font-size:10px">Happy Boosters</div>
      <div class="gg-sg">
        <div class="gg-field">
          <label>eDVDs per jump</label>
          <input type="number" id="gg-hjEDVDs" min="0" max="12" placeholder="0">
        </div>
        <div class="gg-field">
          <label>Ecstasy</label>
          <select id="gg-hjEcstasy"><option value="yes">Yes (x2)</option><option value="no">No</option></select>
        </div>
      </div>
      <div class="gg-sg">
        <div class="gg-field">
          <label>10star Adult Novelties</label>
          <select id="gg-hjANJob"><option value="no">No</option><option value="yes">Yes (x2 eDVD)</option></select>
        </div>
        <div class="gg-field">
          <label>Candy type</label>
          <select id="gg-hjCandyType">
            <option value="0">None</option>
            ${CANDY_TYPES.map((c,i)=>`<option value="${i+1}">${c.happy}★ — ${c.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="gg-sg">
        <div class="gg-field">
          <label>Candies</label>
          <input type="number" id="gg-hjCandies" min="0" max="48" placeholder="0">
        </div>
        <div class="gg-field">
          <label>Candy Voracity</label>
          <select id="gg-hjCandyVoracity">${[0,5,10,15,20,25,30,35,40,45,50].map(v=>`<option value="${v}">${v===0?'None':'+'+v+'%'}</option>`).join('')}</select>
        </div>
      </div>
      <div class="gg-sg">
        <div class="gg-field">
          <label>7star Grocery Absorption</label>
          <select id="gg-hjCandyAbsorption"><option value="no">No</option><option value="yes">Yes (+10%)</option></select>
        </div>
        <div class="gg-field">
          <label>Happy before boosters</label>
          <input type="number" id="gg-hjBaseHappy" min="0" placeholder="0 = prop max">
        </div>
      </div>
      <div class="gg-collapsible" id="gg-od-panel">
        <div class="gg-collapsible-header">OD Risk Settings <span class="gg-collapsible-toggle">v</span></div>
        <div class="gg-collapsible-body">
          <div style="font-size:11px;color:#665533;margin-bottom:8px">Community estimates only.</div>
          <div class="gg-sg">
            <div class="gg-field"><label>Xanax OD %</label><input type="number" id="gg-hjXanaxOD" min="0" max="100" step="0.1"></div>
            <div class="gg-field"><label>Ecstasy OD %</label><input type="number" id="gg-hjEcstasyOD" min="0" max="100" step="0.1"></div>
          </div>
          <div class="gg-sg">
            <div class="gg-field">
              <label>Faction Toleration</label>
              <select id="gg-hjToleration">${Array.from({length:11},(_,i)=>`<option value="${i*3}">${i*3}%</option>`).join('')}</select>
            </div>
            <div class="gg-field">
              <label>7star Nightclub (-50% OD)</label>
              <select id="gg-hjNightclub"><option value="no">No</option><option value="yes">Yes</option></select>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="gg-btn-row" style="margin-top:12px">
      <button class="gg-btn gg-btn-calc" id="gg-plan-calc" style="flex:1">Calculate Plan</button>
    </div>
  </div>
</div>


<!-- ── STATUS + RESULTS ────────────────────────────── -->
<div class="gg-status" id="gg-status"></div>
<div class="gg-results" id="gg-daily-results" style="display:none"></div>
<div class="gg-results" id="gg-jump-results" style="display:none"></div>
<div class="gg-results" id="gg-compare-results" style="display:none"></div>

<!-- ── ITEM COSTS & PRICES ────────────────────────── -->
<div class="gg-collapsible" id="gg-item-info-panel" style="margin-top:10px">
  <div class="gg-collapsible-header">💰 Item Costs &amp; Prices <span class="gg-collapsible-toggle">▼</span></div>
  <div class="gg-collapsible-body">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <span style="font-size:11px;color:#556">Enter costs manually or fetch live.</span>
      <button class="gg-btn gg-btn-fill" id="gg-fetch-prices" style="font-size:11px;padding:5px 12px;flex:none">⟳ Live Prices</button>
    </div>
    <div class="gg-sg">
      <div class="gg-field"><label>Xanax <span id="gg-xanax-price" class="gg-price-badge"></span></label><input type="number" id="gg-hjXanaxCost" min="0" placeholder="$"></div>
      <div class="gg-field"><label>FHC <span id="gg-fhc-price" class="gg-price-badge"></span></label><input type="number" id="gg-hjFHCCost" min="0" placeholder="$"></div>
    </div>
    <div class="gg-sg">
      <div class="gg-field"><label>eDVD <span id="gg-edvd-price" class="gg-price-badge"></span></label><input type="number" id="gg-hjEDVDCost" min="0" placeholder="$"></div>
      <div class="gg-field"><label>Ecstasy <span id="gg-ecstasy-price" class="gg-price-badge"></span></label><input type="number" id="gg-hjEcstasyCost" min="0" placeholder="$"></div>
    </div>
    <div class="gg-sg">
      <div class="gg-field"><label>LSD <span id="gg-lsd-price" class="gg-price-badge"></span></label><input type="number" id="gg-hjLSDCost" min="0" placeholder="$"></div>
      <div class="gg-field"><label>Energy Can <span id="gg-can-price" class="gg-price-badge"></span></label><input type="number" id="gg-hjCanCost" min="0" placeholder="$"></div>
    </div>
    <div class="gg-sg">
      <div class="gg-field"><label>Candy <span id="gg-candy-price" class="gg-price-badge"></span></label><input type="number" id="gg-hjCandyCost" min="0" placeholder="$"></div>
    </div>
    <div id="gg-price-breakdown" style="margin-top:8px"></div>
  </div>
</div>

<!-- ── SETTINGS & API KEY ─────────────────────────── -->
<div class="gg-collapsible" id="gg-settings-panel" style="margin-top:8px">
  <div class="gg-collapsible-header">⚙ Settings &amp; API Key <span class="gg-collapsible-toggle">▼</span></div>
  <div class="gg-collapsible-body">
    <button class="gg-btn gg-btn-fill" id="gg-autofill-settings" style="width:100%;margin-bottom:10px">⟳ Auto-fill from API</button>
    <div class="gg-field">
      <label>Torn API Key <span style="font-size:10px;color:#556">— stored locally only</span></label>
      <div class="gg-api-row">
        <input type="password" id="gg-apikey" placeholder="Paste 16-character key…" autocomplete="off">
        <button class="gg-api-btn" id="gg-apikey-save">Save</button>
      </div>
      <div style="margin-top:6px;padding:6px 10px;background:#0e0e0e;border:1px solid #252525;border-radius:4px;font-size:11px;line-height:1.7;color:#556">
        Needs <strong style="color:#668">Normal Access</strong> (gym, perks, stats).<br>
        <a href="https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=AIO+Planner&type=3" target="_blank" style="color:#4a7aaa;text-decoration:none">🔑 Auto-create key →</a>
        <span style="margin-left:8px;color:#444">Prices via weav3r.dev (no key needed)</span>
      </div>
    </div>
    <div class="gg-sec">Cache</div>
    <div class="gg-sg">
      <button class="gg-btn" id="gg-copy-logs" style="background:#1a1a2a;border-color:#2a2a48;color:#7a7acc;font-size:12px">Copy Logs</button>
      <button class="gg-btn" id="gg-clear-cache" style="background:#2a1a1a;border-color:#4a2a2a;color:#bf7a7a;font-size:12px">Clear Cache</button>
    </div>
    <div id="gg-debug-status" style="font-size:10px;color:#445;margin-top:4px;display:none"></div>
  </div>
</div>

<!-- ── GAINS LOGGER ───────────────────────────────── -->
<div class="gg-collapsible" id="gg-logger-panel" style="margin-top:8px">
  <div class="gg-collapsible-header">
    📓 Gains Logger <span id="gg-logger-badge" style="font-size:10px;color:#4a7a4a;margin-left:4px"></span>
    <span class="gg-collapsible-toggle">▼</span>
  </div>
  <div class="gg-collapsible-body" id="gg-logger-body">

    <!-- Auto-log toggle -->
    <div id="gg-autolog-row" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#141414;border:1px solid #252525;border-radius:4px;margin-bottom:10px;cursor:pointer">
      <span id="gg-autolog-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0"></span>
      <div style="flex:1">
        <div id="gg-autolog-lbl" style="font-size:12px;font-weight:bold"></div>
        <div style="font-size:10px;color:#445;margin-top:1px">Watches for train results — logs every gym session automatically</div>
      </div>
      <span style="font-size:10px;color:#333;flex-shrink:0">tap</span>
    </div>

    <!-- Manual entry -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <div style="font-size:10px;font-weight:bold;color:#445;text-transform:uppercase;letter-spacing:.06em">Manual Entry</div>
      <button id="gg-log-autofill" style="background:#182028;border:1px solid #2a3a50;color:#6a9acc;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer;-webkit-tap-highlight-color:transparent">⚡ Fill from page</button>
    </div>
    <div class="gg-sg">
      <div class="gg-field"><label>Actual Gain</label><input type="number" id="gg-log-gain" placeholder="e.g. 31355" min="0"></div>
      <div class="gg-field"><label>Energy Used</label><input type="number" id="gg-log-energy" placeholder="e.g. 1000" min="0"></div>
    </div>
    <div class="gg-sg">
      <div class="gg-field"><label>Pre-train Stat</label><input type="number" id="gg-log-stat" placeholder="stat before" min="0"></div>
      <div class="gg-field"><label>Happy at Train</label><input type="number" id="gg-log-happy" placeholder="e.g. 35050" min="0"></div>
    </div>
    <button class="gg-btn gg-btn-fill" id="gg-log-add" style="width:100%;margin-bottom:12px">+ Log Entry</button>

    <!-- Log table -->
    <div id="gg-log-entries"></div>

    <!-- Calibration -->
    <div id="gg-log-calibration"></div>

    <!-- Actions -->
    <div class="gg-sg" style="margin-top:8px">
      <button class="gg-btn" id="gg-log-copy" style="background:#182028;border-color:#2a3a50;color:#6a9acc;font-size:12px">📋 Copy Log</button>
      <button class="gg-btn" id="gg-log-clear" style="background:#1a1010;border-color:#301818;color:#aa5a5a;font-size:12px">🗑 Clear Log</button>
    </div>
    <div id="gg-log-copy-status" style="display:none;margin-top:6px;font-size:11px;color:#7abf7a;padding:6px 8px;background:#141a14;border:1px solid #253025;border-radius:4px"></div>
  </div>
</div>

</div>`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MOUNT
    // ─────────────────────────────────────────────────────────────────────────
    const styleEl = document.createElement("style");
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);

    const wrap = document.createElement("div");
    wrap.className = "gg-wrap";
    try {
        wrap.innerHTML = buildHTML();
    } catch (e) {
        // If HTML render fails, show a visible error so the user knows something's wrong
        wrap.innerHTML = `<div style="background:#2a1010;border:2px solid #802020;color:#f88;padding:12px;font-family:monospace;font-size:12px;border-radius:4px;margin:8px;line-height:1.5">
            <strong style="color:#f44">⚠ Gym Planner: HTML render failed</strong><br>
            ${e.message?.replace(/[<>]/g, '') || 'Unknown error'}<br>
            <small style="color:#a66">Please report this with a screenshot.</small>
        </div>`;
        console.error('[GymPlanner] buildHTML failed:', e);
    }
    const mt = document.querySelector('.content-wrapper') || document.body;
    mt.insertBefore(wrap, mt.firstChild);

    const q = sel => wrap.querySelector(sel);

    let gymConfirmed = false;

    function rebuildGymDropdown() {
        const sel = q("#gg-gym"); if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = buildGymOptions();
        if (cur && GYMS.some(g => String(g.id) === cur)) { setGymSelect(sel, cur); }
        else { const rd = detectGymFromDOM(); if (rd) { setGymSelect(sel, String(rd)); gymConfirmed = true; if (el.gymBadge) el.gymBadge.textContent = "✓ page"; } }
        if (typeof updateDotsDisplay === 'function') updateDotsDisplay();
    }

    function setGymSelect(sel, idStr) {
        sel.value = idStr;
        for (const opt of sel.options) { if (opt.value === idStr) { opt.selected = true; break; } }
    }

    const el = {
        gym:              q("#gg-gym"),             gymBadge:       q("#gg-gym-badge"),
        stat:             q("#gg-stat"),             subscriber:     q("#gg-subscriber"),
        statTotal:        q("#gg-statTotal"),        statGoal:       q("#gg-statGoal"),
        happy:            q("#gg-happy"),
        factionPerk:      q("#gg-factionPerk"),      propertyPerk:   q("#gg-propertyPerk"),
        eduStatPerk:      q("#gg-eduStatPerk"),      eduGenPerk:     q("#gg-eduGenPerk"),
        jobPerk:          q("#gg-jobPerk"),          bookPerk:       q("#gg-bookPerk"),
        steroids:         q("#gg-steroids"),         sportsSneakers: q("#gg-sportsSneakers"),
        energy:           q("#gg-energy"),           dailyRefill:    q("#gg-dailyRefill"),
        dailyRefillCost:  q("#gg-dailyRefillCost"),
        hjBaseHappy:      q("#gg-hjBaseHappy"),
        hjXanaxCount:     q("#gg-hjXanaxCount"),     hjEDVDs:        q("#gg-hjEDVDs"),
        hjANJob:          q("#gg-hjANJob"),          hjEcstasy:      q("#gg-hjEcstasy"),
        hjRefill:         q("#gg-hjRefill"),         hjVoracity:     q("#gg-hjVoracity"),
        hjFHC:            q("#gg-hjFHC"),            hjFHCCost:      q("#gg-hjFHCCost"),
        hjLSD:            q("#gg-hjLSD"),            hjLSDCost:      q("#gg-hjLSDCost"),
        hjCans:           q("#gg-hjCans"),           hjCanType:      q("#gg-hjCanType"),
        hjCanCost:        q("#gg-hjCanCost"),        hjCanFactionPerk: q("#gg-hjCanFactionPerk"),
        hjCandies:        q("#gg-hjCandies"),        hjCandyType:    q("#gg-hjCandyType"),
        hjCandyCost:      q("#gg-hjCandyCost"),      hjCandyVoracity:q("#gg-hjCandyVoracity"),
        hjCandyAbsorption:q("#gg-hjCandyAbsorption"),
        candyBadge:       q("#gg-candy-price"),
        hjXanaxCost:      q("#gg-hjXanaxCost"),      hjEDVDCost:     q("#gg-hjEDVDCost"),
        hjEcstasyCost:    q("#gg-hjEcstasyCost"),    fhcBadge:       q("#gg-fhc-price"),
        lsdBadge:         q("#gg-lsd-price"),        canBadge:       q("#gg-can-price"),
        hjXanaxOD:        q("#gg-hjXanaxOD"),        hjEcstasyOD:    q("#gg-hjEcstasyOD"),
        hjToleration:     q("#gg-hjToleration"),     hjNightclub:    q("#gg-hjNightclub"),
        xanaxBadge:       q("#gg-xanax-price"),      edvdBadge:      q("#gg-edvd-price"),
        ecstasyBadge:     q("#gg-ecstasy-price"),    fetchPricesBtn: q("#gg-fetch-prices"),
        autofill:         q("#gg-autofill"),         calc:           q("#gg-calc"),
        sessionDrug:      q("#gg-session-drug"),      sessionRefill:  q("#gg-session-refill"),
        sessionHappy:     q("#gg-session-happy"),
        compare:          q("#gg-compare"),          copy:           q("#gg-copy"),
        perksBadge:       q("#gg-perks-badge"),      status:         q("#gg-status"),
        dailyResults:     q("#gg-daily-results"),    jumpResults:    q("#gg-jump-results"),
        compareResults:   q("#gg-compare-results"),  autofillBadge:  q("#gg-autofill-badge"),
        energyBadge:      q("#gg-energy-badge"),
        apikey:           q("#gg-apikey"),           apikeyBtn:      q("#gg-apikey-save"),
        dotsDisplay:      q("#gg-dots-display"),     bestGymPanel:   q("#gg-bestgym-panel"),
        bestGymBody:      q("#gg-bestgym-body"),     infobar:        q("#gg-infobar"),
        infoEnergy:       q("#gg-info-energy"),      infoHappy:      q("#gg-info-happy"),
        infoSubWrap:      q("#gg-info-sub-wrap"),    infoSub:        q("#gg-info-sub"),
        lastUpdated:      q("#gg-last-updated"),     valStat:        q("#gg-val-stat"),
        valGoal:          q("#gg-val-goal"),         valHappy:       q("#gg-val-happy"),
        xgXanaxCount:     q("#gg-xgXanaxCount"),      xgXanaxCost:    q("#gg-xgXanaxCost"),
        xgRefill:         q("#gg-xgRefill"),           xgRefillCost:   q("#gg-xgRefillCost"),
    };

    // ── Restore all saved inputs ──────────────────────────────────────────────
    const EL_MAP = {
        stat:"stat", subscriber:"subscriber", happy:"happy",
        statTotal:"statTotal", statGoal:"statGoal",
        factionPerk:"factionPerk", propertyPerk:"propertyPerk",
        eduStatPerk:"eduStatPerk", eduGenPerk:"eduGenPerk",
        jobPerk:"jobPerk", bookPerk:"bookPerk",
        steroids:"steroids", sportsSneakers:"sportsSneakers",
        energy:"energy", dailyRefill:"dailyRefill", dailyRefillCost:"dailyRefillCost",
        hjXanaxCount:"hjXanaxCount", hjEDVDs:"hjEDVDs", hjANJob:"hjANJob",
        hjEcstasy:"hjEcstasy", hjRefill:"hjRefill", hjVoracity:"hjVoracity",
        hjFHC:"hjFHC", hjFHCCost:"hjFHCCost",
        hjLSD:"hjLSD", hjLSDCost:"hjLSDCost",
        hjCans:"hjCans", hjCanType:"hjCanType", hjCanCost:"hjCanCost",
        hjCanFactionPerk:"hjCanFactionPerk",
        hjCandies:"hjCandies", hjCandyType:"hjCandyType", hjCandyCost:"hjCandyCost",
        hjCandyVoracity:"hjCandyVoracity", hjCandyAbsorption:"hjCandyAbsorption",
        hjXanaxCost:"hjXanaxCost", hjEDVDCost:"hjEDVDCost", hjEcstasyCost:"hjEcstasyCost",
        hjXanaxOD:"hjXanaxOD", hjEcstasyOD:"hjEcstasyOD",
        hjToleration:"hjToleration", hjNightclub:"hjNightclub",
        xgXanaxCount:"xgXanaxCount", xgXanaxCost:"xgXanaxCost",
        xgRefill:"xgRefill", xgRefillCost:"xgRefillCost",
    };
    Object.entries(EL_MAP).forEach(([k, ek]) => {
        if (!el[ek]) return;
        el[ek].value = gg_load(k);
        el[ek].addEventListener("change", () => {
            gg_save(k, el[ek].value);
            if (k === "statTotal" || k === "statGoal") updateGoalProgress();
        });
    });

    updateGoalProgress();

    // ── Header collapse ───────────────────────────────────────────────────────
    wrap.querySelector(".gg-header").addEventListener("click", () => {
        gg_save("ggCollapsed", wrap.classList.toggle("open") ? "no" : "yes");
    });
    if (gg_load("ggCollapsed") !== "yes") wrap.classList.add("open");

    // Show onboarding banner if user has never auto-filled successfully
    if (!_load("hasAutofilled", "")) {
        const ob = q("#gg-onboard");
        if (ob) ob.style.display = "block";
    } else {
        // Returning user — also collapse the profile panel by default
        // (they've already set it up). Show it if they want to edit.
        // Profile collapsible starts closed by default, that's fine.
    }

    // ── API key (in settings panel collapsible) ───────────────────────────────
    const savedKey = (_load("apiKey","") || "").trim();
    el.apikey.value = savedKey.length === 16 ? savedKey : "";
    el.apikey.placeholder = savedKey.length === 16 ? "Key saved ✓" : "Paste 16-character key…";
    el.apikeyBtn.addEventListener("click", () => {
        const k = el.apikey.value.trim();
        if (k.length !== 16) { showStatus("warn", `⚠ Key must be 16 characters (got ${k.length}).`); return; }
        _save("apiKey", k);
        el.apikey.placeholder = "Key saved ✓";
        el.apikey.value = "";
        showStatus("ok", "✓ Key saved. Click Auto-fill to load your data.");
        loadGymsFromAPI(k);
    });
    q("#gg-autofill-settings")?.addEventListener("click", autofill);

    // ── Panel visibility ──────────────────────────────────────────────────────
    // Single primary screen (gym/stat/session inputs) with two overlay panels:
    // 🎖 Bonuses & Perks, and 📋 Plan ahead. Only one shows at a time.
    // New UX: no tabs, just overlay panels toggled by buttons
    let activePanel = null; // "bonuses" | "plan" | null

    function showPanel(name) {
        activePanel = activePanel === name ? null : name;
        q("#gg-bonuses-inputs")?.classList.toggle("active", activePanel === "bonuses");
        q("#gg-plan-inputs")?.classList.toggle("active",    activePanel === "plan");
        // Highlight active button
        q("#gg-tab-bonuses-btn")?.classList.toggle("active", activePanel === "bonuses");
        q("#gg-tab-plan")?.classList.toggle("active",        activePanel === "plan");
        if (activePanel === "bonuses") updateBonusSummary();
        if (activePanel === "plan")    updatePlanMethodOpts();
    }

    q("#gg-tab-bonuses-btn")?.addEventListener("click", () => showPanel("bonuses"));
    q("#gg-tab-plan")?.addEventListener("click", () => showPanel("plan"));

    // Plan method sub-options toggle
    function updatePlanMethodOpts() {
        const m = q("#gg-plan-method")?.value || "daily";
        q("#gg-plan-xanax-opts") && (q("#gg-plan-xanax-opts").style.display = m==="xanax" ? "" : "none");
        q("#gg-plan-daily-opts") && (q("#gg-plan-daily-opts").style.display = m==="daily" ? "" : "none");
        q("#gg-plan-jump-opts")  && (q("#gg-plan-jump-opts").style.display  = m==="jump"  ? "" : "none");
    }
    q("#gg-plan-method")?.addEventListener("change", updatePlanMethodOpts);
    updatePlanMethodOpts();

    // Plan-ahead calculate button → routes to the right calculator
    q("#gg-plan-calc")?.addEventListener("click", () => {
        const m = q("#gg-plan-method")?.value || "daily";
        showPanel(null); // close plan panel
        if      (m === "xanax") calculateXanaxGrind();
        else if (m === "jump")  calculateHappyJump();
        else                    calculateDaily();
    });

    // ── Bonus summary — live combined multiplier shown on Bonuses tab ────────
    function updateBonusSummary() {
        const el_ = q("#gg-bonus-summary");
        if (!el_) return;
        const stat   = el.stat.value;
        const bonus  = calcBonus(stat);
        const pct    = ((bonus - 1) * 100).toFixed(1);
        const parts  = [];
        if (getPerk(el.factionPerk)    > 0) parts.push(`Faction +${el.factionPerk.value}%`);
        if (getPerk(el.propertyPerk)   > 0) parts.push(`Property +${el.propertyPerk.value}%`);
        if (getPerk(el.eduStatPerk)    > 0) parts.push(`Edu(stat) +${el.eduStatPerk.value}%`);
        if (getPerk(el.eduGenPerk)     > 0) parts.push(`Edu(all) +${el.eduGenPerk.value}%`);
        if (getPerk(el.jobPerk)        > 0) parts.push(`Job +${el.jobPerk.value}%`);
        if (getPerk(el.bookPerk)       > 0) parts.push(`Book +${el.bookPerk.value}%`);
        if (getPerk(el.steroids)       > 0) parts.push(`Steroids +${el.steroids.value}%`);
        if (stat === "speed" && getPerk(el.sportsSneakers) > 0) parts.push(`Sneakers +${el.sportsSneakers.value}%`);
        if (parts.length === 0) {
            el_.style.display = "none";
            return;
        }
        el_.style.display = "block";
        el_.innerHTML = `<span style="color:#9aaa9a">Combined: ×${bonus.toFixed(4)} (+${pct}%)</span><br><span style="color:#556;font-size:10px">${parts.join(" · ")}</span>`;
    }

    // Wire all perk inputs to refresh summary
    [el.factionPerk, el.propertyPerk, el.eduStatPerk, el.eduGenPerk,
     el.jobPerk, el.bookPerk, el.steroids, el.sportsSneakers].forEach(e => {
        e?.addEventListener("change", updateBonusSummary);
    });
    el.stat?.addEventListener("change", updateBonusSummary);
    const wireCollapsible = id => {
        q("#"+id)?.querySelector(".gg-collapsible-header")
            ?.addEventListener("click", e => { e.stopPropagation(); q("#"+id)?.classList.toggle("open"); });
    };
    ["gg-od-panel","gg-item-info-panel","gg-settings-panel","gg-profile-panel"].forEach(wireCollapsible);
    // Profile panel: open for new users (so they see what to fill), collapsed for returning
    if (!_load("hasAutofilled", "")) {
        q("#gg-profile-panel")?.classList.add("open");
    } else {
        // Returning user — populate the profile summary line with what's set
        const ps = q("#gg-profile-summary");
        const stat = parseInt(_load("statTotal","0"))||0;
        const goal = parseInt(_load("statGoal","0"))||0;
        // Note: cannot use `fmt` here — it's defined later (TDZ).
        const _fmt = n => Math.round(n).toLocaleString();
        if (ps && stat && goal) ps.textContent = `— ${_fmt(stat)} → ${_fmt(goal)}`;
    }
    q("#gg-logger-panel")?.querySelector(".gg-collapsible-header")?.addEventListener("click", e => {
        e.stopPropagation();
        q("#gg-logger-panel")?.classList.toggle("open");
        renderLogger();
    });

    // ── Load cached prices on startup ─────────────────────────────────────────
    (function loadCachedPrices() {
        const cached = _load(PRICE_CACHE_KEY, null); if (!cached) return;
        try {
            const { ts, data } = JSON.parse(cached);
            if (Date.now() - ts < PRICE_CACHE_TTL && data?.cans && Object.keys(data.cans).length > 0)
                applyPriceData(data, gg_load("subscriber") || "no", true);
        } catch(_) {}
    })();

    // ── Auto-switcher toggle (injected into Settings panel) ───────────────────
    let switcherEnabled = _load('autoSwitchEnabled', true);
    const _swEl = document.createElement('label');
    _swEl.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;margin-top:12px;font-size:12px;user-select:none;-webkit-tap-highlight-color:transparent';
    const _swDot = document.createElement('span');
    _swDot.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0';
    const _swLbl = document.createElement('span');
    const _updateSw = () => {
        _swDot.style.background = switcherEnabled ? '#5a9f5a' : '#555';
        _swLbl.style.color      = switcherEnabled ? '#7abf7a' : '#556';
        _swLbl.textContent = 'Auto gym switcher: ' + (switcherEnabled ? 'ON' : 'OFF');
    };
    _updateSw();
    _swEl.append(_swDot, _swLbl);
    _swEl.addEventListener('click', () => {
        switcherEnabled = !switcherEnabled;
        _save('autoSwitchEnabled', switcherEnabled);
        _updateSw();
        if (!switcherEnabled) hideSwitchBanner();
    });
    q("#gg-settings-panel .gg-collapsible-body")?.appendChild(_swEl);

    // ── Candy/can type → auto-fill cost ──────────────────────────────────────
    q("#gg-hjCandyType")?.addEventListener("change", () => {
        const idx = parseInt(q("#gg-hjCandyType").value);
        if (idx > 0) {
            const candy = CANDY_TYPES[idx-1], p = candyPrices[candy.label];
            if (p && el.hjCandyCost) {
                el.hjCandyCost.value = p; gg_save("hjCandyCost", String(p));
                if (el.candyBadge) el.candyBadge.textContent = p>=1e6?`$${(p/1e6).toFixed(1)}m`:`$${(p/1000).toFixed(0)}k`;
            }
        }
        maybeRecalc();
    });
    q("#gg-hjCanType")?.addEventListener("change", () => {
        const idx = parseInt(q("#gg-hjCanType").value);
        if (idx > 0) {
            const can = CAN_TYPES[idx-1], p = canPrices[can.label];
            if (p && el.hjCanCost) {
                el.hjCanCost.value = p; gg_save("hjCanCost", String(p));
                if (el.canBadge) el.canBadge.textContent = `$${(p/1000).toFixed(0)}k`;
            }
        }
        renderPriceBreakdown(el.subscriber?.value); maybeRecalc();
    });
    q("#gg-subscriber")?.addEventListener("change",        () => renderPriceBreakdown(el.subscriber?.value));
    q("#gg-hjCanFactionPerk")?.addEventListener("change",  () => renderPriceBreakdown(el.subscriber?.value));
    q("#gg-hjCandyVoracity")?.addEventListener("change",   () => renderPriceBreakdown(el.subscriber?.value));
    q("#gg-hjCandyAbsorption")?.addEventListener("change", () => renderPriceBreakdown(el.subscriber?.value));

    el.stat.addEventListener("change", () => {
        gg_save("stat", el.stat.value);
        tryAutoFillStat(); updateDotsDisplay(); updateBestGymPanel(); updateGoalProgress(); maybeRecalc();
    });

    // ── Goal progress badge ───────────────────────────────────────────────────
    function updateGoalProgress() {
        const badge = q("#gg-goal-progress"); if (!badge) return;
        const cur = parseFloat(el.statTotal?.value) || 0;
        const goal = parseFloat(el.statGoal?.value) || 0;
        if (!cur || !goal || goal <= cur) { badge.textContent = ""; return; }
        const pct  = Math.min(100, cur/goal*100).toFixed(1);
        const left = goal - cur;
        const fmt  = n => n>=1e6?(n/1e6).toFixed(2)+"m":n>=1000?Math.round(n/1000)+"k":String(Math.round(n));
        badge.textContent = `${pct}% · ${fmt(left)} to go`;
        badge.style.color = pct >= 90 ? "#66cc88" : pct >= 50 ? "#aaaa5a" : "#556";
    }

    // ── Button wiring ─────────────────────────────────────────────────────────
    el.autofill.addEventListener("click", () => {
        try { autofill(); }
        catch(e) { showStatus("warn", "✗ Auto-fill error: " + e.message); }
    });
    el.fetchPricesBtn.addEventListener("click", () => fetchPrices(!!_load(PRICE_CACHE_KEY, null)));
    el.calc.addEventListener("click", calculateSession);
    el.compare.addEventListener("click",        () => { try { calculateCompare(); } catch(e) { showStatus("warn", "✗ "+e.message); } });
    el.copy.addEventListener("click",           copyResults);
    wrap.addEventListener("keydown", e => { if (e.key === "Enter" && document.activeElement?.tagName !== "BUTTON") calculateSession(); });

    // ── Auto-recalc on input change ───────────────────────────────────────────
    const RECALC_INPUTS = ["gym","stat","subscriber","statTotal","statGoal","happy",
        "factionPerk","propertyPerk","eduStatPerk","eduGenPerk","jobPerk","bookPerk",
        "steroids","sportsSneakers","energy","dailyRefill","hjXanaxCount","hjEDVDs",
        "hjANJob","hjEcstasy","hjRefill","hjVoracity","hjBaseHappy",
        "hjFHC","hjLSD","hjCans","hjCanType","hjCanFactionPerk",
        "hjCandies","hjCandyType","hjCandyVoracity","hjCandyAbsorption"];
    RECALC_INPUTS.forEach(k => {
        const input = el[k]; if (!input) return;
        input.addEventListener("change", () => {
            if (k === "gym" && el.gym.value) gymConfirmed = true;
            updateDotsDisplay(); updateBestGymPanel(); validateInputs(); maybeRecalc();
        });
    });

    q("#gg-bestgym-panel")?.querySelector(".gg-bestgym-header")
        ?.addEventListener("click", () => { q("#gg-bestgym-panel").classList.toggle("open"); updateBestGymPanel(); });

    // ── Startup: detect gym, restore stats, load gym API data ─────────────────
    (function startup() {
        el.gym.value = "";
        const domGymId = detectGymFromDOM();
        if (domGymId) { setGymSelect(el.gym, String(domGymId)); el.gymBadge.textContent = "✓ page"; gymConfirmed = true; }
    })();
    setTimeout(() => {
        const d = detectGymFromDOM();
        if (d) { setGymSelect(el.gym, String(d)); el.gymBadge.textContent = "✓ page"; gymConfirmed = true; }
        tryAutoFillStat(); updateDotsDisplay(); validateInputs(); updateBestGymPanel();
    }, 800);
    setTimeout(() => {
        if (!gymConfirmed) {
            const d = detectGymFromDOM();
            if (d) { setGymSelect(el.gym, String(d)); el.gymBadge.textContent = "✓ page"; gymConfirmed = true; updateDotsDisplay(); updateBestGymPanel(); }
        }
    }, 2500);
    setTimeout(() => {
        const k = (_load("apiKey","") || "").trim();
        if (k.length === 16) loadGymsFromAPI(k).then(() => { updateDotsDisplay(); updateBestGymPanel(); });
    }, 100);
    const _storedTs = _load("lastAutofillTs", 0);
    if (_storedTs && el.lastUpdated) {
        const _ago = Math.round((Date.now()-_storedTs)/60000);
        el.lastUpdated.textContent = _ago < 2 ? "updated recently" : `updated ${_ago}m ago`;
    }
    setInterval(() => {
        const ts = _load("lastAutofillTs", 0);
        if (ts && el.lastUpdated) {
            const ago = Math.round((Date.now()-ts)/60000);
            el.lastUpdated.textContent = ago < 1 ? "updated just now" : `updated ${ago}m ago`;
        }
    }, 60000);



    function updateDotsDisplay() {
        const gym  = getGymData();
        const stat = el.stat.value;
        const disp = el.dotsDisplay;
        if (!disp) return;
        if (!gym) { disp.innerHTML = ""; return; }
        const key  = STAT_KEYS[stat];
        const dots = gym[key];
        if (!dots) {
            disp.innerHTML = `<span class="gg-dot-na">✗ ${gym.name} doesn't train ${STAT_LABELS[stat]}</span>`;
            return;
        }
        // Render dot pips (max 9 dots, each dot = 1.0)
        const MAX_DOTS = 9;
        const fullDots = Math.floor(dots);
        const halfDot  = (dots - fullDots) >= 0.3;
        let pips = "";
        for (let i = 0; i < MAX_DOTS; i++) {
            const cls = i < fullDots ? "on" : (i === fullDots && halfDot) ? "half" : "off";
            pips += `<span class="gg-dot ${cls}" title="${dots} dots"></span>`;
        }
        // Best gym for stat — use epsilon comparison to avoid floating point issues
        const allDots  = GYMS.map(g => g[key] || 0);
        const bestDots = Math.max(...allDots);
        const bestGym  = GYMS.find(g => Math.abs((g[key] || 0) - bestDots) < 0.01);
        const isBest   = bestGym && gym.id === bestGym.id;
        const bestLabel = bestGym ? (bestGym.name || `Gym ${bestGym.id}`) : null;
        disp.innerHTML = `${pips}<span class="gg-dot-val">${dots} dots</span>`
            + (isBest ? `<span style="margin-left:6px;font-size:10px;color:#aaaa5a">★ best for ${STAT_LABELS[stat]}</span>`
             : bestLabel ? `<span style="margin-left:6px;font-size:10px;color:#446">best: ${bestLabel} (${bestDots})</span>` : "");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BEST GYM PANEL
    // ─────────────────────────────────────────────────────────────────────────
    // BEST GYM PANEL — shows best unlocked gym for the selected stat,
    // updates whenever stat or gym changes
    // ─────────────────────────────────────────────────────────────────────────
    function updateBestGymPanel() {
        const body = el.bestGymBody;
        if (!body || !q("#gg-bestgym-panel").classList.contains("open")) return;

        // If gym hasn't been confirmed from page or API, show a prompt
        if (!gymConfirmed && !el.gym.value) {
            body.innerHTML = `<div style="font-size:11px;color:#bf9f5a;padding:6px 2px;line-height:1.6">
                ⚠ Gym not detected yet.<br>
                Click <strong>⟳ Auto-fill</strong> to detect your current gym and see the best gym recommendation.
            </div>`;
            return;
        }

        const stat       = el.stat.value;
        const statKey    = STAT_KEYS[stat];
        const statLabel  = STAT_LABELS[stat];
        const currentGym = getGymData();
        const currentId  = currentGym?.id || 0;
        const hasStats   = allStats.strength > 0 || allStats.speed > 0 || allStats.defense > 0 || allStats.dexterity > 0;
        const manualOwned = JSON.parse(_load('manualGymOwned','[]'));
        const currentPos = STANDARD_UNLOCK_ORDER[currentId] ?? 0;

        // A gym is "owned" if:
        //  - Standard: sequential position ≤ current position (unlocks automatically)
        //  - Specialist: manually confirmed via + button
        //  - Unknown/new gym: treat as owned if it appears in API data (user clearly has access)
        function isOwned(g) {
            if (SPECIALIST_IDS.has(g.id)) return manualOwned.includes(g.id);
            const knownPos = STANDARD_UNLOCK_ORDER[g.id];
            if (knownPos !== undefined) return knownPos <= currentPos;
            // Unknown gym ID (new gym added to Torn after this script was written)
            // If it came from the API, the user likely has access — treat as owned
            return true;
        }

        // Check stat ratio for specialist gyms
        function ratioMet(gymId) {
            const req = SPECIALIST_REQS[gymId];
            if (!req) return true;
            if (!hasStats) return false; // can't check without stats
            return req.check(allStats);
        }

        // Check if specialist prereq gym is owned
        function prereqOwned(gymId) {
            const req = SPECIALIST_REQS[gymId];
            if (!req) return true;
            const prereqPos = STANDARD_UNLOCK_ORDER[req.prereqId] ?? 99;
            return prereqPos <= currentPos;
        }

        // Build categorised gym list for this stat
        const ownedGyms      = []; // owned + trains this stat
        const purchasable    = []; // ratio met, prereq owned, but not purchased yet
        const ratioNeeded    = []; // specialist, prereq owned, but ratio not met
        const prereqNeeded   = []; // specialist, prereq not unlocked yet

        for (const g of GYMS) {
            const dots = g[statKey] || 0;
            if (!dots) continue; // doesn't train this stat

            if (isOwned(g)) {
                ownedGyms.push({ gym:g, dots });
            } else if (SPECIALIST_IDS.has(g.id)) {
                if (!prereqOwned(g.id)) {
                    prereqNeeded.push({ gym:g, dots, req: SPECIALIST_REQS[g.id] });
                } else if (!ratioMet(g.id)) {
                    ratioNeeded.push({ gym:g, dots, req: SPECIALIST_REQS[g.id] });
                } else {
                    purchasable.push({ gym:g, dots, req: SPECIALIST_REQS[g.id] });
                }
            }
            // Standard gyms above current position are just skipped (not unlocked yet)
        }

        // Sort all by dots descending
        [ownedGyms, purchasable, ratioNeeded, prereqNeeded].forEach(a => a.sort((x,y) => y.dots - x.dots));

        const bestOwned    = ownedGyms[0];
        const currentDots  = currentGym?.[statKey] || 0;

        let html = "";

        // ── Best available gym ────────────────────────────────────────────────
        if (bestOwned) {
            const isCurrent   = bestOwned.gym.id === currentId;
            const gymName_    = bestOwned.gym.name || `Gym ${bestOwned.gym.id}`;
            const tierLabel   = bestOwned.gym.tier === "J" ? gymName_ : `[${bestOwned.gym.tier}] ${gymName_}`;
            const pct         = currentDots > 0 && bestOwned.dots > currentDots
                ? `+${(((bestOwned.dots/currentDots)-1)*100).toFixed(0)}% vs current`
                : "";
            const drugNote    = bestOwned.gym.id === 31 ? " · ≤50 Xanax+Ecstasy" : "";
            const useBtn      = !isCurrent
                ? `<button class="gg-gym-use-btn" data-gymid="${bestOwned.gym.id}" style="margin-left:auto;font-size:11px;padding:3px 10px;border-radius:3px;border:1px solid #2a4a2a;background:#182018;color:#7abf7a;cursor:pointer">Use</button>` : "";

            html += `<div style="padding:4px 0 8px">
  <div style="font-size:10px;color:#4a8a4a;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">★ Best for ${statLabel}</div>
  <div class="gg-gym-row best" style="background:#181e14;border:1px solid #2a3a20">
    <span class="gg-gym-rank">★</span>
    <span class="gg-gym-name best">${tierLabel}${isCurrent?" ← you're here":""}</span>
    <span class="gg-gym-e">${bestOwned.gym.energy}E</span>
    <span class="gg-gym-dots-val">${bestOwned.dots}</span>
    ${useBtn}
  </div>
  ${pct ? `<div style="font-size:11px;color:#5a9f5a;margin-top:4px;padding-left:8px">Switch for <strong>${pct}</strong> more ${statLabel} per energy${drugNote}</div>` : `<div style="font-size:11px;color:#446;margin-top:4px;padding-left:8px">You're already in the best gym${drugNote}</div>`}
</div>`;
        } else {
            html += `<div style="font-size:11px;color:#556;padding:4px 0 8px">No owned gyms found that train ${statLabel}.</div>`;
        }

        // ── Your other unlocked gyms (compact) ───────────────────────────────
        const others = ownedGyms.slice(1);
        if (others.length) {
            html += `<div class="gg-bestgym-sec">Your other unlocked gyms for ${statLabel}</div>`;
            others.forEach((e, i) => {
                const isCurrent = e.gym.id === currentId;
                const tierLabel = e.gym.tier === "J" ? e.gym.name : `[${e.gym.tier}] ${e.gym.name}`;
                const useBtn    = !isCurrent
                    ? `<button class="gg-gym-use-btn" data-gymid="${e.gym.id}">Use</button>` : "";
                html += `<div class="gg-gym-row ${isCurrent?"current":""}">
  <span class="gg-gym-rank">#${i+2}</span>
  <span class="gg-gym-name ${isCurrent?"current":""}">${tierLabel}${isCurrent?" ←":""}</span>
  <span class="gg-gym-e">${e.gym.energy}E</span>
  <span class="gg-gym-dots-val dim">${e.dots}</span>
  ${useBtn}
</div>`;
            });
        }

        // ── Purchasable specialists ───────────────────────────────────────────
        if (purchasable.length) {
            html += `<div class="gg-bestgym-sec" style="margin-top:8px">💰 Your stats qualify — purchase to unlock</div>`;
            purchasable.forEach(e => {
                const tierLabel = `[${e.gym.tier}] ${e.gym.name}`;
                const drugNote  = e.gym.id === 31 ? " (drug-limited)" : "";
                const ownBtn    = `<button class="gg-gym-own-btn" data-gymid="${e.gym.id}" style="font-size:10px;padding:2px 7px;border-radius:3px;border:1px solid #2a5a2a;background:#182518;color:#6a9f6a;cursor:pointer">I own it</button>`;
                html += `<div class="gg-gym-row">
  <span class="gg-gym-rank">💰</span>
  <span class="gg-gym-name">${tierLabel}${drugNote}</span>
  <span class="gg-gym-e">${e.gym.energy}E</span>
  <span class="gg-gym-dots-val">${e.dots}</span>
  ${ownBtn}
</div>`;
            });
        }

        // ── Ratio not met ─────────────────────────────────────────────────────
        if (ratioNeeded.length) {
            html += `<div class="gg-bestgym-sec" style="margin-top:8px">📊 Better gyms — stat ratio not yet met</div>`;
            ratioNeeded.forEach(e => {
                const tierLabel = `[${e.gym.tier}] ${e.gym.name}`;
                html += `<div class="gg-gym-row" title="${e.req?.desc||''}">
  <span class="gg-gym-rank">📊</span>
  <span class="gg-gym-name">${tierLabel}</span>
  <span class="gg-gym-e">${e.gym.energy}E</span>
  <span class="gg-gym-dots-val dim">${e.dots}</span>
  <span class="gg-gym-locked" title="${e.req?.desc||''}" style="font-size:10px;color:#5a4a2a;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.req?.desc||''}</span>
</div>`;
            });
        }

        // ── Prereq not unlocked ───────────────────────────────────────────────
        if (prereqNeeded.length) {
            html += `<div class="gg-bestgym-sec" style="margin-top:8px">🔒 Unlock ${GYM_BY_ID[prereqNeeded[0]?.req?.prereqId]?.name || "required gym"} first</div>`;
            prereqNeeded.forEach(e => {
                const tierLabel = `[${e.gym.tier}] ${e.gym.name}`;
                html += `<div class="gg-gym-row">
  <span class="gg-gym-rank">🔒</span>
  <span class="gg-gym-name" style="color:#444">${tierLabel}</span>
  <span class="gg-gym-e">${e.gym.energy}E</span>
  <span class="gg-gym-dots-val dim">${e.dots}</span>
</div>`;
            });
        }

        if (!hasStats) html += `<div class="gg-bestgym-note" style="margin-top:8px">⚠ Auto-fill with API key to check specialist gym eligibility based on your actual stat ratios.</div>`;

        body.innerHTML = html;

        // Wire "I own it" buttons — mark specialist gym as purchased
        body.querySelectorAll(".gg-gym-own-btn").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                const gymId = parseInt(btn.dataset.gymid);
                const owned = JSON.parse(_load('manualGymOwned','[]'));
                if (!owned.includes(gymId)) owned.push(gymId);
                _save('manualGymOwned', JSON.stringify(owned));
                updateBestGymPanel();
            });
        });

        // Wire "Use" buttons — switch calculator to that gym
        body.querySelectorAll(".gg-gym-use-btn").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                const gymId = btn.dataset.gymid;
                setGymSelect(el.gym, gymId);
                gg_save("gymId", gymId);
                updateDotsDisplay();
                updateBestGymPanel();
                maybeRecalc();
                showStatus("ok", `✓ Calculator switched to ${GYM_BY_ID[parseInt(gymId)]?.name || "selected gym"}.`);
            });
        });
    }


    // ─────────────────────────────────────────────────────────────────────────
    // INPUT VALIDATION
    // ─────────────────────────────────────────────────────────────────────────
    function validateInputs() {
        let valid = true;
        const statNow  = parseFloat(el.statTotal.value) || 0;
        const statGoal = parseFloat(el.statGoal.value)  || 0;
        const happy    = parseFloat(el.happy.value)     || 0;

        // Current stat
        const statBad = statNow < 100 && el.statTotal.value !== "";
        el.statTotal.classList.toggle("invalid", statBad);
        el.valStat.classList.toggle("show", statBad);
        if (statBad) valid = false;

        // Goal
        const goalBad = statGoal > 0 && statGoal <= statNow;
        el.statGoal?.classList.toggle("warn-input", goalBad);
        el.valGoal?.classList.toggle("show", goalBad);
        if (goalBad) valid = false;

        // Happy
        const happyBad = happy < 100 && el.happy.value !== "";
        el.happy.classList.toggle("invalid", happyBad);
        el.valHappy.classList.toggle("show", happyBad);
        if (happyBad) valid = false;

        // Gym + stat compatibility
        const gym  = getGymData();
        const dots = gym?.[STAT_KEYS[el.stat.value]] || 0;
        el.gym.classList.toggle("warn-input", gym && !dots);

        return valid;
    }

    // Auto-recalc only if results panel is visible
    let _recalcTimer = null;
    function maybeRecalc() {
        const dailyVisible   = el.dailyResults.style.display   !== "none";
        const jumpVisible    = el.jumpResults.style.display    !== "none";
        const compareVisible = el.compareResults.style.display !== "none";
        if (!dailyVisible && !jumpVisible && !compareVisible) return;
        clearTimeout(_recalcTimer);
        _recalcTimer = setTimeout(() => {
            try {
                if (compareVisible) calculateCompare();
                else if (jumpVisible) calculateHappyJump();
                else calculateSession();
            } catch(e) { /* silently ignore during auto-recalc */ }
        }, 400);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INFOBAR — shows live page energy/happy and last autofill time
    // ─────────────────────────────────────────────────────────────────────────
    function updateInfobar(currentE, maxE, currentH, isSubscriber, timestamp) {
        if (!el.infobar) return;
        el.infobar.style.display = "flex";
        if (currentE != null) {
            el.infoEnergy.textContent = currentE > maxE
                ? `${currentE}/${maxE} (+${currentE-maxE} over)`
                : `${currentE}/${maxE}`;
            el.infoEnergy.className = "gg-infobar-val" + (currentE >= maxE ? " hi" : "");
        }
        if (currentH != null) el.infoHappy.textContent = currentH.toLocaleString();
        if (isSubscriber != null) {
            el.infoSubWrap.style.display = isSubscriber ? "" : "none";
        }
        if (timestamp) {
            const ago = Math.round((Date.now() - timestamp) / 60000);
            el.lastUpdated.textContent = ago < 1 ? "updated just now" : `updated ${ago}m ago`;
        }
    }

    // Update "X min ago" every minute
    setInterval(() => {
        const ts = _load("lastAutofillTs", 0);
        if (ts && el.lastUpdated) {
            const ago = Math.round((Date.now() - ts) / 60000);
            el.lastUpdated.textContent = ago < 1 ? "updated just now" : `updated ${ago}m ago`;
        }
    }, 60000);

    // ─────────────────────────────────────────────────────────────────────────
    // STATUS
    // ─────────────────────────────────────────────────────────────────────────
    function showStatus(type, msg) {
        el.status.className = `gg-status ${type}`;
        el.status.textContent = msg;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // API FETCH — user data (perks, stats, gym, bars, properties)
    // ─────────────────────────────────────────────────────────────────────────
    async function fetchFromAPI(stat) {
        const key = (_load("apiKey","") || "").trim();
        if (!key || key.length !== 16) return null;

        let data;
        try {
            data = await gmFetch(`https://api.torn.com/user/?selections=perks,battlestats,gym,bars,basic,properties&key=${key}&comment=GymGains`);
        } catch(e) {
            return { error: "Network error." };
        }
        if (data.error) return { error: `API ${data.error.code}: ${data.error.error}` };

        const statName = STAT_LABELS[stat].toLowerCase();
        const out = {
            factionPerk:0, propertyPerk:0, eduStatPerk:0, eduGenPerk:0, jobPerk:0, bookPerk:0,
            statValue:null, gymId:null, energyCap:null, subscriber:null, currentEnergy:null,
            propertyHappy:null, currentHappy:null, maxHappy:null, filled:[],
        };

        // Battle stats — capture all 4 for specialist gym eligibility checks
        if (data.battlestats) {
            const bs = data.battlestats;
            allStats = {
                strength:  Math.round(bs.strength  || 0),
                speed:     Math.round(bs.speed     || 0),
                defense:   Math.round(bs.defense   || 0),
                dexterity: Math.round(bs.dexterity || 0),
            };
            cache.set('battlestats', allStats);
            if (allStats[stat]) {
                out.statValue = allStats[stat];
                out.filled.push(`${STAT_LABELS[stat]} ${out.statValue.toLocaleString()}`);
            }
        }

        // Bars — energy cap (subscriber) + current energy + current/max happy
        if (data.energy?.maximum) {
            out.energyCap     = data.energy.maximum;
            out.subscriber    = data.energy.maximum >= 150 ? "yes" : "no";
            out.currentEnergy = data.energy.current ?? null;
            out.filled.push(`Subscriber: ${out.subscriber === "yes" ? "Yes" : "No"}`);
        }
        if (data.happy?.current != null) {
            out.currentHappy = data.happy.current;
            out.maxHappy     = data.happy.maximum;
        }

        // Gym — user?selections=gym returns the gym_id as a plain integer: { "gym": 13 }
        // Some API versions may return { gym: { gym_id: 13 } } — handle both
        const rawGym = data.gym;
        const gymId  = typeof rawGym === "number" ? rawGym
                     : typeof rawGym === "object" && rawGym !== null
                       ? (rawGym.gym_id ?? rawGym.id ?? null)
                       : null;
        if (gymId) {
            out.gymId = gymId;
            const g = GYM_BY_ID[gymId];
            if (g) out.filled.push(g.name);
        }

        // Property max happy — prefer bars.happy.maximum (reflects upgrades+staff)
        if (out.maxHappy && out.maxHappy > 0) {
            out.propertyHappy = out.maxHappy;
            out.filled.push(`Max Happy ${out.maxHappy.toLocaleString()}`);
        } else if (data.properties) {
            let max = 0;
            for (const p of Object.values(data.properties)) {
                if (p.happy && p.happy > max) max = p.happy;
            }
            if (max > 0) { out.propertyHappy = max; out.filled.push(`Max Happy ${max.toLocaleString()}`); }
        }
        if (out.currentHappy != null) out.filled.push(`Happy ${out.currentHappy.toLocaleString()}`);

        // Perks — API returns SEPARATE arrays per category, NOT a single flat array.
        // Each string is the perk text alone, e.g. "Increases dexterity gym gains by 8%"
        // Categories: faction_perks, property_perks, education_perks, company_perks, book_perks
        // Also handle legacy flat data.perks array (some API versions) with "Category: text" prefix
        function parsePerkList(arr, category) {
            if (!Array.isArray(arr)) return;
            for (const p of arr) {
                const lower = p.toLowerCase();
                if (!lower.includes('gym gain')) continue;
                const isGeneral  = lower.includes('all gym gain');
                const isThisStat = lower.includes(statName + ' gym gain');
                if (!isGeneral && !isThisStat) continue;
                const m = p.match(/(\d+(?:\.\d+)?)\s*%/);
                if (!m) continue;
                const pct = parseFloat(m[1]);
                switch (category) {
                    case 'faction':   out.factionPerk  += pct; break;
                    case 'property':  out.propertyPerk += pct; break;
                    case 'education': isThisStat ? (out.eduStatPerk += pct) : (out.eduGenPerk += pct); break;
                    case 'company':   out.jobPerk      += pct; break;
                    case 'book':      out.bookPerk     += pct; break;
                }
                perkCount++;
            }
        }

        let perkCount = 0;
        // Primary: separate named arrays (standard API v1 response)
        parsePerkList(data.faction_perks,   'faction');
        parsePerkList(data.property_perks,  'property');
        parsePerkList(data.education_perks, 'education');
        parsePerkList(data.company_perks,   'company');
        parsePerkList(data.book_perks,      'book');
        // Also parse job_perks if present
        parsePerkList(data.job_perks,       'company');

        // Fallback: legacy flat data.perks array with "Category: text" prefix format
        if (perkCount === 0 && Array.isArray(data.perks)) {
            for (const p of data.perks) {
                const lower = p.toLowerCase();
                if (!lower.includes('gym gain')) continue;
                const isGeneral  = lower.includes('all gym gain');
                const isThisStat = lower.includes(statName + ' gym gain');
                if (!isGeneral && !isThisStat) continue;
                const m = p.match(/(\d+(?:\.\d+)?)\s*%/);
                if (!m) continue;
                const pct = parseFloat(m[1]);
                if      (lower.startsWith('faction'))                          out.factionPerk  += pct;
                else if (lower.startsWith('property'))                         out.propertyPerk += pct;
                else if (lower.startsWith('education') && isThisStat)          out.eduStatPerk  += pct;
                else if (lower.startsWith('education') && isGeneral)           out.eduGenPerk   += pct;
                else if (lower.startsWith('job')||lower.startsWith('company')) out.jobPerk      += pct;
                else if (lower.startsWith('book'))                             out.bookPerk     += pct;
                perkCount++;
            }
        }

        if (perkCount > 0) out.filled.push(`${perkCount} gym perk${perkCount!==1?"s":""}`);

        // Store player identity from basic selection for use in logs
        if (data.player_id) { _save('playerId', String(data.player_id)); }
        if (data.name)      { _save('playerName', data.name); }

        return out;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRICE FETCH — weav3r.dev bazaar (live) + torn/items market_value (fallback)
    // ─────────────────────────────────────────────────────────────────────────
    async function fetchItemPrice(itemId) {
        if (!itemId) return null;
        try {
            const d = await gmFetch("https://weav3r.dev/api/marketplace/"+itemId);
            let price = null;
            if (d?.listings?.length > 0) {
                const s = d.listings.map(l=>l.price).filter(p=>p>100).sort((a,b)=>a-b);
                if (s.length) price = s[0];
            }
            if (!price && d?.market_price > 100) price = d.market_price;
            return price || null;
        } catch(_) { return null; }
    }

    async function fetchPrices(forceRefresh = false) {
        const apiKey     = (_load("apiKey","") || "").trim();
        const subscriber = el.subscriber?.value || _load("subscriber","no");
        if (forceRefresh) {
            _save(PRICE_CACHE_KEY, null);
            _save("canItemIds", null); _save("canItemIdsTs", 0);
            CAN_TYPES.forEach(c => c.id = null); CANDY_TYPES.forEach(c => c.id = null);
        }
        if (!forceRefresh) {
            const cached = _load(PRICE_CACHE_KEY, null);
            if (cached) {
                try {
                    const { ts, data } = JSON.parse(cached);
                    if (Date.now()-ts < PRICE_CACHE_TTL) {
                        applyPriceData(data, subscriber, true);
                        showStatus("ok", "✓ Prices cached (" + Math.round((Date.now()-ts)/60000) + "m ago) — click ⟳ to refresh");
                        return;
                    }
                } catch(_) {}
            }
        }
        showStatus("ok", "⟳ Fetching live prices…");
        await resolveCanIDs(apiKey);
        const MAIN = [
            {key:"xanax",   id:ITEM_IDS.xanax,   label:"Xanax",   badge:el.xanaxBadge,   save:"hjXanaxCost",   input:el.hjXanaxCost},
            {key:"edvd",    id:ITEM_IDS.edvd,     label:"eDVD",    badge:el.edvdBadge,    save:"hjEDVDCost",    input:el.hjEDVDCost},
            {key:"ecstasy", id:ITEM_IDS.ecstasy,  label:"Ecstasy", badge:el.ecstasyBadge, save:"hjEcstasyCost", input:el.hjEcstasyCost},
            {key:"fhc",     id:ITEM_IDS.fhc,      label:"FHC",     badge:el.fhcBadge,     save:"hjFHCCost",     input:el.hjFHCCost},
            {key:"lsd",     id:ITEM_IDS.lsd,      label:"LSD",     badge:el.lsdBadge,     save:"hjLSDCost",     input:el.hjLSDCost},
        ];
        MAIN.forEach(m => { if (m.badge) { m.badge.className = "gg-price-badge loading"; m.badge.textContent = "⟳"; } });
        const rC = CAN_TYPES.filter(c => c.id), rD = CANDY_TYPES.filter(c => c.id);
        const [mR,cR,dR] = await Promise.all([
            Promise.all(MAIN.map(m => fetchItemPrice(m.id))),
            Promise.all(rC.map(c => fetchItemPrice(c.id))),
            Promise.all(rD.map(c => fetchItemPrice(c.id))),
        ]);
        const snap = { main:{}, cans:{}, candies:{} };
        const fmt  = p => p >= 1e6 ? "$" + (p/1e6).toFixed(1) + "m" : "$" + Math.round(p/1000) + "k";
        MAIN.forEach((m,i) => {
            const p = mR[i];
            if (p) { snap.main[m.key]=p; gg_save(m.save,p); if(m.input) m.input.value=p; if(m.badge){m.badge.className="gg-price-badge";m.badge.textContent=fmt(p);} }
            else if (m.badge) { m.badge.className="gg-price-badge err"; m.badge.textContent="—"; }
        });
        rC.forEach((c,i) => { if (cR[i]) snap.cans[c.label]    = cR[i]; });
        rD.forEach((c,i) => { if (dR[i]) snap.candies[c.label] = dR[i]; });
        _save(PRICE_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: snap }));
        applyPriceData(snap, subscriber, false);
        const mc=Object.keys(snap.main).length, cc=Object.keys(snap.cans).length, dc=Object.keys(snap.candies).length;
        showStatus("ok", (!apiKey && (cc===0||dc===0))
            ? "✓ " + mc + " main prices · Add API key in ⚙ for can/candy prices"
            : "✓ " + mc + " items · " + cc + "/" + CAN_TYPES.length + " cans · " + dc + "/" + CANDY_TYPES.length + " candy · 1h cache");
    }

    // Apply a price snapshot to inputs, badges, and breakdown panel
    function applyPriceData(snapshot, subscriber, fromCache) {
        const mainDefs = {
            xanax:   { e: 250, label: "Xanax",   saveKey: "hjXanaxCost",   inputEl: el.hjXanaxCost,   badge: el.xanaxBadge },
            edvd:    { e: 0,   label: "eDVD",    saveKey: "hjEDVDCost",    inputEl: el.hjEDVDCost,    badge: el.edvdBadge },
            ecstasy: { e: 0,   label: "Ecstasy", saveKey: "hjEcstasyCost", inputEl: el.hjEcstasyCost, badge: el.ecstasyBadge },
            fhc:     { e: subscriber === "yes" ? 150 : 100, label: "FHC", saveKey: "hjFHCCost", inputEl: el.hjFHCCost, badge: el.fhcBadge },
            lsd:     { e: 50,  label: "LSD",     saveKey: "hjLSDCost",     inputEl: el.hjLSDCost,     badge: el.lsdBadge },
        };

        // Apply main item prices
        for (const [key, def] of Object.entries(mainDefs)) {
            const p = snapshot.main?.[key];
            if (p) {
                allItemPrices[key] = p;
                if (def.inputEl) { def.inputEl.value = p; gg_save(def.saveKey, String(p)); }
                if (def.badge) {
                    def.badge.className = "gg-price-badge";
                    const inK = p >= 1e6 ? `$${(p/1e6).toFixed(1)}m` : `$${(p/1000).toFixed(0)}k`;
                    def.badge.textContent = inK;
                }
                // Also sync Xanax price to Xanax Grind cost field
                if (key === 'xanax') {
                    if (el.xgXanaxCost) { el.xgXanaxCost.value = p; gg_save("xgXanaxCost", String(p)); }
                    const xgBadge = wrap.querySelector('#gg-xg-xanax-price');
                    if (xgBadge) {
                        xgBadge.className = "gg-price-badge";
                        xgBadge.textContent = p >= 1e6 ? `$${(p/1e6).toFixed(1)}m` : `$${(p/1000).toFixed(0)}k`;
                    }
                }
            }
        }

        // Apply can prices
        canPrices = {};
        CAN_TYPES.forEach(c => {
            const p = snapshot.cans?.[c.label];
            if (p) { canPrices[c.label] = p; allItemPrices['can_' + c.label] = p; }
        });

        // Apply candy prices
        candyPrices = {};
        CANDY_TYPES.forEach(c => {
            const p = snapshot.candies?.[c.label];
            if (p) { candyPrices[c.label] = p; allItemPrices['candy_' + c.label] = p; }
        });

        // Update selected candy cost input
        const selCandyIdx = gi(el.hjCandyType);
        if (selCandyIdx > 0) {
            const selCandy = CANDY_TYPES[selCandyIdx - 1];
            const p = candyPrices[selCandy.label];
            if (p && el.hjCandyCost) {
                el.hjCandyCost.value = p;
                gg_save("hjCandyCost", String(p));
                if (el.candyBadge) {
                    el.candyBadge.textContent = p >= 1e6 ? `$${(p/1e6).toFixed(1)}m` : `$${(p/1000).toFixed(0)}k`;
                }
            }
        }

        // Update selected can cost input
        const selCanIdx = gi(el.hjCanType);
        if (selCanIdx > 0) {
            const selCan = CAN_TYPES[selCanIdx - 1];
            const p = canPrices[selCan.label];
            if (p && el.hjCanCost) {
                el.hjCanCost.value = p;
                gg_save("hjCanCost", String(p));
                if (el.canBadge) {
                    const inK = p >= 1e6 ? `$${(p/1e6).toFixed(1)}m` : `$${(p/1000).toFixed(0)}k`;
                    el.canBadge.textContent = inK;
                }
            }
        }

        renderPriceBreakdown(subscriber);
    }

    // ── Unified price breakdown ───────────────────────────────────────────────
    function renderPriceBreakdown(subscriber) {
        const panel = q("#gg-price-breakdown");
        if (!panel) return;

        const sub         = subscriber || el.subscriber?.value || gg_load("subscriber") || "no";
        const cap         = sub === "yes" ? 150 : 100;
        const canFacPct   = gi(el.hjCanFactionPerk) / 100;
        const candyVorPct = gi(el.hjCandyVoracity)  / 100;
        const candyAbsPct = el.hjCandyAbsorption?.value === "yes" ? 0.10 : 0;
        const candyMult   = 1 + candyVorPct + candyAbsPct;
        const xanPrice    = parseFloat(el.hjXanaxCost?.value) || 0;
        const fhcPrice    = parseFloat(el.hjFHCCost?.value)   || 0;
        const lsdPrice    = parseFloat(el.hjLSDCost?.value)   || 0;

        const fmtM = p => p >= 1e6 ? `$${(p/1e6).toFixed(2)}m` : p >= 1000 ? `$${Math.round(p/1000)}k` : `$${p}`;

        // Energy sources
        const eRows = [];
        if (xanPrice > 0) eRows.push({ name:"Xanax",         e:250,  price:xanPrice, cd:"6–8h", note:"drug" });
        if (lsdPrice > 0) eRows.push({ name:"LSD",           e:50,   price:lsdPrice, cd:"~3h",  note:"no OD" });
        if (fhcPrice > 0) eRows.push({ name:"FHC",           e:cap,  price:fhcPrice, cd:"6h",   note:`+500 happy` });
        eRows.push(                   { name:"Points Refill", e:cap,  price:1725000,  cd:"daily" });
        CAN_TYPES.forEach(c => {
            const p = canPrices[c.label]; if (!p) return;
            eRows.push({ name:c.label, e:Math.round(c.e*(1+canFacPct)), price:p, cd:"2h" });
        });

        // Candy
        const cRows = [];
        CANDY_TYPES.forEach(c => {
            const p = candyPrices[c.label]; if (!p) return;
            cRows.push({ name:c.label, happy:Math.round(c.happy*candyMult), price:p });
        });

        const hasE = eRows.length > 1;
        const hasC = cRows.length > 0;

        if (!hasE && !hasC) {
            panel.innerHTML = `<div style="font-size:11px;color:#445;padding:6px 0">Click ⟳ Live Prices to load rankings.</div>`;
            return;
        }

        let cacheAge = "";
        try {
            const { ts } = JSON.parse(_load(PRICE_CACHE_KEY, "{}"));
            if (ts) { const m=Math.round((Date.now()-ts)/60000); cacheAge=m<1?"updated just now":`updated ${m}m ago`; }
        } catch(_) {}

        const secHdr = (icon, title, note="") => `
<div style="display:flex;align-items:baseline;gap:6px;margin:12px 0 5px;padding-bottom:4px;border-bottom:1px solid #252535">
  <span style="font-size:11px;font-weight:bold;color:#8a9aaa">${icon} ${title}</span>
  ${note?`<span style="font-size:10px;color:#445">${note}</span>`:""}
</div>`;
        const hdrRow = (cols) => `<div style="display:grid;grid-template-columns:${cols};gap:0 8px;margin-bottom:2px">`;
        const hdrCell = (t,a="right") => `<div style="font-size:9px;color:#445;text-transform:uppercase;letter-spacing:.04em;text-align:${a};padding-bottom:3px;border-bottom:1px solid #1e1e2a">${t}</div>`;

        let html = "";

        if (hasE) {
            eRows.forEach(r => r.perE = r.price / r.e);
            eRows.sort((a,b) => a.perE - b.perE);
            const bestPerE = eRows[0].perE;
            const noteStr = canFacPct > 0 ? `+${Math.round(canFacPct*100)}% faction applied` : "";
            html += secHdr("⚡","Energy Sources — ranked cheapest $/E", noteStr);
            html += hdrRow("1fr 44px 62px 40px");
            html += hdrCell("Item","left")+hdrCell("Energy")+hdrCell("$/E")+hdrCell("CD");
            html += `</div>`;
            eRows.forEach((r,i) => {
                const ratio=r.perE/bestPerE, isBest=i===0;
                const col = isBest?"#7abf7a":ratio<1.3?"#9abf6a":ratio<2?"#bf9f5a":"#667";
                const badge = isBest?` <span style="font-size:9px;color:#3a7a3a;background:#182018;border:1px solid #2a4a2a;border-radius:2px;padding:0 3px">BEST</span>`:"";
                const note = r.note?` <span style="font-size:9px;color:#4a6a5a">${r.note}</span>`:"";
                html += `<div style="display:grid;grid-template-columns:1fr 44px 62px 40px;gap:0 8px;padding:4px 0;border-bottom:1px solid #1a1a22;align-items:baseline">
  <div style="font-size:12px;color:${col};font-weight:${isBest?'bold':'normal'}">${r.name}${badge}${note}</div>
  <div style="font-size:11px;color:#667;text-align:right">+${r.e}E</div>
  <div style="font-size:12px;color:${col};text-align:right;font-weight:${isBest?'bold':'normal'}">${fmt(Math.round(r.perE))}</div>
  <div style="font-size:10px;color:#556;text-align:right">${r.cd}</div>
</div>`;
            });
        }

        if (hasC) {
            cRows.forEach(r => r.perH = r.price / r.happy);
            cRows.sort((a,b) => a.perH - b.perH);
            const bestPerH = cRows[0].perH;
            const modParts=[];
            if (candyVorPct>0) modParts.push(`+${Math.round(candyVorPct*100)}% Voracity`);
            if (candyAbsPct>0) modParts.push(`+10% Absorption`);
            const modStr = modParts.length ? modParts.join(", ")+" applied" : "30min CD · max 48";
            html += secHdr("🍬","Candy — ranked cheapest $/happy", modStr);
            html += hdrRow("1fr 50px 64px");
            html += hdrCell("Item","left")+hdrCell("Happy")+hdrCell("$/happy");
            html += `</div>`;
            cRows.forEach((r,i) => {
                const ratio=r.perH/bestPerH, isBest=i===0;
                const col = isBest?"#7abf7a":ratio<1.3?"#9abf6a":ratio<2.5?"#bf9f5a":"#667";
                const badge = isBest?` <span style="font-size:9px;color:#3a7a3a;background:#182018;border:1px solid #2a4a2a;border-radius:2px;padding:0 3px">BEST</span>`:"";
                html += `<div style="display:grid;grid-template-columns:1fr 50px 64px;gap:0 8px;padding:4px 0;border-bottom:1px solid #1a1a22;align-items:baseline">
  <div style="font-size:12px;color:${col};font-weight:${isBest?'bold':'normal'}">${r.name}${badge}</div>
  <div style="font-size:11px;color:#667;text-align:right">+${r.happy}</div>
  <div style="font-size:12px;color:${col};text-align:right;font-weight:${isBest?'bold':'normal'}">${fmt(Math.round(r.perH))}</div>
</div>`;
            });
            if (cRows[0]) {
                const b=cRows[0];
                html += `<div style="font-size:10px;color:#4a6a5a;margin-top:5px">Best for a jump: ${b.name} ×49 = ${fmtM(49*b.price)} → +${fmt(49*b.happy)} happy</div>`;
            }
        }

        if (hasE) {
            html += secHdr("📊",`Cost to get ${cap}E`);
            eRows.forEach(r => {
                const n=Math.ceil(cap/r.e), total=fmtM(n*r.price);
                const cdStr = r.cd==="daily"?"":r.cd==="6–8h"?` · ${r.cd} CD`:` · ${r.name==="FHC"?n*6:n*2}h CD`;
                html += `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:3px 0;border-bottom:1px solid #1a1a22">
  <span style="font-size:12px;color:#8a9aaa">${r.name}${n>1?` ×${n}`:""}</span>
  <span style="font-size:12px;color:#aab">${total}<span style="font-size:10px;color:#445">${cdStr}</span></span>
</div>`;
            });
        }

        if (cacheAge) html += `<div style="font-size:9px;color:#334;text-align:right;margin-top:8px;padding-top:4px;border-top:1px solid #1a1a22">${cacheAge} · 1h cache · ⟳ to refresh</div>`;

        panel.innerHTML = html;
    }


    // ─────────────────────────────────────────────────────────────────────────
    // DOM STAT DETECTION (fallback / supplement when no API key)
    // ─────────────────────────────────────────────────────────────────────────
    function tryAutoFillStat() {
        const stat = el.stat.value;
        const parseN = t => { const n = parseInt((t||"").replace(/[^0-9]/g,""), 10); return isNaN(n)||n<100 ? null : n; };

        // Method 1: Torn's canonical stat element IDs (confirmed from gym page DOM)
        // e.g. <span id="strength-val">528,412</span>
        const idEl = document.getElementById(stat + '-val');
        if (idEl) { const v = parseN(idEl.textContent); if (v) { setStatValue(v); return v; } }

        // Method 2: abbreviated label + value pattern  e.g. "DEX 528,412"
        const abbrev = STAT_ABBREV[stat];
        const allEls = document.querySelectorAll('h3,h4,span,div,[class*="stat"],[class*="Stat"]');
        for (const node of allEls) {
            if (wrap.contains(node)) continue;
            const txt = node.textContent.trim();
            const m = txt.match(new RegExp('^' + abbrev + '\\s+([\\d,]+)$'));
            if (m) { const v = parseN(m[1]); if (v) { setStatValue(v); return v; } }
            if (txt === abbrev) {
                const sib = node.nextElementSibling;
                if (sib) { const v = parseN(sib.textContent); if (v) { setStatValue(v); return v; } }
            }
        }

        // Method 3: look for full stat name with value — TornPDA sometimes renders
        // "Dexterity\n528,412" or "Dexterity: 528,412" in gym cards
        const fullName = stat.charAt(0).toUpperCase() + stat.slice(1);
        for (const node of allEls) {
            if (wrap.contains(node)) continue;
            const txt = node.textContent.trim();
            const m2 = txt.match(new RegExp(fullName + '[:\\s]+([\\d,]+)', 'i'));
            if (m2) { const v = parseN(m2[1]); if (v) { setStatValue(v); return v; } }
        }

        // Method 4: innerText scan of gym root — last resort
        const root = document.querySelector('#gymroot,[class*="gymRoot"],[class*="gym-root"],.content-wrapper');
        if (root) {
            for (const pat of [
                new RegExp('\\b' + abbrev + '\\s+([\\d,]+)'),
                new RegExp(fullName + '[:\\s]+([\\d,]+)', 'i'),
                new RegExp(stat + '-val[^>]*>([\\d,]+)', 'i'),
            ]) {
                const m = root.innerText.match(pat);
                if (m) { const v = parseN(m[1]); if (v) { setStatValue(v); return v; } }
            }
        }

        el.autofillBadge.style.display = "none";
        return null;
    }

    function setStatValue(v) {
        el.statTotal.value = v;
        gg_save("statTotal", String(v));
        el.autofillBadge.style.display = "inline";
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DOM GYM DETECTION
    // The gym name appears on the page as standalone text (e.g. "Racing Fitness")
    // followed by "You have X/Y energy". We find it by scanning all text nodes.
    // ─────────────────────────────────────────────────────────────────────────
    function detectGymFromDOM() {
        const gymNames = GYMS.map(g => ({ id: g.id, lower: g.name.toLowerCase(), name: g.name }));

        // Method 1: Torn's gym-name element ID (desktop web — confirmed stable)
        // The gym card has a heading with the gym name; sometimes in #gym-root h1/h2/h3
        const headingEls = document.querySelectorAll(
            'h1,h2,h3,[class*="gymName"],[class*="gym-name"],[class*="title"],[id*="gym"]'
        );
        for (const el_ of headingEls) {
            if (wrap.contains(el_)) continue;
            const t = el_.textContent.trim().toLowerCase();
            const g = gymNames.find(g => g.lower === t);
            if (g) return g.id;
        }

        // Method 2: Walk all text nodes (robust but slow — handles any rendering)
        const walker = document.createTreeWalker(
            document.body, NodeFilter.SHOW_TEXT,
            { acceptNode: n => {
                if (wrap.contains(n.parentElement)) return NodeFilter.FILTER_REJECT;
                const t = n.textContent.trim();
                return (t.length >= 4 && t.length <= 60) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
            }}
        );

        const candidates = [];
        let node;
        while ((node = walker.nextNode())) {
            const t = node.textContent.trim().toLowerCase();
            const g = gymNames.find(g => g.lower === t);
            if (g) candidates.push({ id: g.id, node });
        }

        if (!candidates.length) return null;

        // Prefer candidate near energy text
        for (const c of candidates) {
            const container = c.node.parentElement?.closest('div,section,article,li') || c.node.parentElement;
            if (container && /you have\s+[\d,]+\s*\/\s*[\d,]+\s*energy/i.test(container.textContent))
                return c.id;
        }

        // Prefer candidate near "train" button
        for (const c of candidates) {
            const container = c.node.parentElement?.closest('div,section,li') || c.node.parentElement;
            if (container) {
                const hasTrain = [...container.querySelectorAll('button,a')].some(
                    b => b.textContent.trim().toUpperCase() === 'TRAIN'
                );
                if (hasTrain) return c.id;
            }
        }

        return candidates[0].id;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AUTO-FILL
    // ─────────────────────────────────────────────────────────────────────────
    function autofill() {
        _save("lastAutofillTs", Date.now()); // throttle silent page-load autofill
        const stat   = el.stat.value;
        const apiKey = (_load("apiKey","")||"").trim();

        // Visible loading state on the Auto-fill button itself
        const btn = el.autofill;
        const origText = btn?.textContent;
        const origDisabled = btn?.disabled;
        if (btn) {
            btn.disabled = true;
            btn.textContent = "⟳ Loading…";
            btn.style.opacity = "0.7";
        }

        showStatus("ok", "⟳ Fetching data…");

        const gymLoadPromise = loadGymsFromAPI(apiKey);
        const apiPromise = apiKey.length===16 ? fetchFromAPI(stat) : Promise.resolve(null);
        const domStat  = tryAutoFillStat();
        const domGymId = detectGymFromDOM();

        const restoreBtn = (success) => {
            if (!btn) return;
            btn.disabled = origDisabled;
            btn.textContent = origText;
            btn.style.opacity = "1";
            // Brief green/red flash so user sees the click registered
            if (success) {
                btn.style.transition = "background-color 0.5s ease-out, border-color 0.5s ease-out";
                btn.style.backgroundColor = "#1a3a1a";
                btn.style.borderColor = "#5a9f5a";
                setTimeout(() => {
                    btn.style.backgroundColor = "";
                    btn.style.borderColor = "";
                    setTimeout(() => { btn.style.transition = ""; }, 600);
                }, 50);
            }
        };

        Promise.all([gymLoadPromise, apiPromise]).then(([_, api]) => {
            if (api?.error) { showStatus("warn", `⚠ ${api.error}`); restoreBtn(false); return; }

            const filled=[], missed=[];

            if (api) {
                // Gym from API gym_id — most reliable
                if (api.gymId) {
                    const g = GYM_BY_ID[api.gymId];
                    setGymSelect(el.gym, String(api.gymId));
                    gymConfirmed = true;
                    if (g) {
                        el.gymBadge.textContent = "✓ API";
                        filled.push(g.name);
                    } else {
                        filled.push(`Gym #${api.gymId}`);
                    }
                } else if (domGymId) {
                    setGymSelect(el.gym, String(domGymId));
                    gymConfirmed = true;
                    el.gymBadge.textContent = "✓ DOM";
                }

                // Stat
                if (api.statValue) setStatValue(api.statValue);
                else if (!domStat) missed.push(STAT_LABELS[stat]);

                // Subscriber + happy + current energy
                if (api.subscriber) { el.subscriber.value=api.subscriber; gg_save("subscriber",api.subscriber); }
                if (api.propertyHappy) { el.happy.value=api.propertyHappy; gg_save("happy",String(api.propertyHappy)); }
                if (api.currentEnergy != null && el.energy) {
                    el.energy.value = api.currentEnergy;
                    if (el.energyBadge) el.energyBadge.textContent = "✓ live";
                    filled.push(`Energy ${api.currentEnergy}`);
                }
                if (api.currentHappy != null) {
                    // Set hjBaseHappy to current happy for this session only — don't persist
                    el.hjBaseHappy.value = api.currentHappy;
                }

                // Perks
                const PERK_FIELDS = {factionPerk:"factionPerk",propertyPerk:"propertyPerk",
                    eduStatPerk:"eduStatPerk",eduGenPerk:"eduGenPerk",jobPerk:"jobPerk",bookPerk:"bookPerk"};
                let anyPerk = false;
                for (const [k,ek] of Object.entries(PERK_FIELDS)) {
                    const v = Math.min(Math.round(api[k]||0), 100);
                    if (el[ek]) { el[ek].value=String(v); gg_save(k,String(v)); }
                    if (v>0) anyPerk=true;
                }
                if (anyPerk) { el.perksBadge.textContent="✓ API"; updateBonusSummary(); }
                else el.perksBadge.textContent = "";

                filled.push(...api.filled.filter(f => !filled.includes(f)));
            } else {
                // No API — DOM fallback
                if (domGymId) {
                    const g = GYM_BY_ID[domGymId];
                    setGymSelect(el.gym, String(domGymId));
                    gymConfirmed = true;
                    el.gymBadge.textContent = "✓ DOM";
                    filled.push(g?.name || "Gym detected");
                } else missed.push("gym");
                if (domStat) filled.push(`${STAT_LABELS[stat]} ${domStat.toLocaleString()}`);
                else missed.push(STAT_LABELS[stat]);
                // Subscriber from page
                const em = document.body.innerText.match(/\d+\s*\/\s*(\d+)\s*energy/i);
                if (em) { const sub=parseInt(em[1])>=150?"yes":"no"; el.subscriber.value=sub; gg_save("subscriber",sub); }
                missed.push("perks (add API key)");
            }

            // Scrape current energy from page for infobar (works with or without API)
            const eMatch = document.body.innerText.match(/you have\s+(\d+)\s*\/\s*(\d+)\s*energy/i);
            if (eMatch) {
                updateInfobar(parseInt(eMatch[1]), parseInt(eMatch[2]), api?.currentHappy ?? null,
                    api?.subscriber === "yes", Date.now());
            } else if (api?.currentHappy != null) {
                updateInfobar(null, null, api.currentHappy, api.subscriber === "yes", Date.now());
            }
            _save("lastAutofillTs", Date.now());

            updateDotsDisplay();
            validateInputs();
            updateBestGymPanel();

            const msg = filled.length
                ? "✓ " + filled.join(" · ") + (missed.length?` — missing: ${missed.join(", ")}` : "")
                : "⚠ Could not detect data. Check your API key or enter manually.";
            showStatus(filled.length?"ok":"warn", msg);

            // Onboarding: hide welcome banner, collapse profile panel after first successful autofill
            if (filled.length) {
                _save("hasAutofilled", "1");
                const ob = q("#gg-onboard");
                if (ob) ob.style.display = "none";
                // Update profile summary to show what was filled
                const ps = q("#gg-profile-summary");
                if (ps) {
                    const stat = parseInt(el.statTotal?.value)||0;
                    const goal = parseInt(el.statGoal?.value)||0;
                    if (stat && goal) ps.textContent = `— ${fmt(stat)} → ${fmt(goal)}`;
                }
            }

            if (apiKey.length===16) fetchPrices();

            // Visible success feedback on the button
            restoreBtn(filled.length > 0);
        }).catch(e => {
            showStatus("warn", `✗ Auto-fill error: ${e.message}`);
            restoreBtn(false);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    let switchBanner = null;
    function showSwitchBanner(fromGym, toGym, statLabel) {
        hideSwitchBanner();
        switchBanner = document.createElement('div');
        switchBanner.style.cssText = [
            'position:fixed;top:60px;left:50%;transform:translateX(-50%)',
            'background:#1a2a1a;border:1px solid #3a6a3a;border-radius:6px',
            'padding:10px 16px;font-size:13px;color:#7abf7a',
            'z-index:99999;max-width:90vw;text-align:center',
            'box-shadow:0 4px 20px rgba(0,0,0,.6);font-family:Arial,sans-serif',
        ].join(';');
        switchBanner.innerHTML = `
            🏋️ <strong>Switched to ${toGym}</strong> for better ${statLabel} gains<br>
            <span style="font-size:11px;color:#4a8a4a">(was: ${fromGym}) — tap Train again to train</span>`;
        document.body.appendChild(switchBanner);
        setTimeout(hideSwitchBanner, 5000);
    }
    function hideSwitchBanner() {
        if (switchBanner) { switchBanner.remove(); switchBanner = null; }
    }

    // Map stat label text from the Torn UI to our stat keys
    // Torn shows "Strength", "Speed", "Defense", "Dexterity" as headings above Train buttons
    const TORN_STAT_LABELS = {
        'strength':'str', 'speed':'spd', 'defense':'def', 'dexterity':'dex',
        'str':'str', 'spd':'spd', 'def':'def', 'dex':'dex',
    };

    // Find which stat a Train button is for by looking at nearby headings
    function getStatForTrainButton(btn) {
        // TornPDA / Torn desktop: aria-label="Train speed", "Train strength" etc.
        const ariaLabel = btn.getAttribute('aria-label') || '';
        const ariaMatch = ariaLabel.match(/^Train\s+(strength|speed|defense|dexterity)/i);
        if (ariaMatch) return STAT_KEYS[ariaMatch[1].toLowerCase()];

        // Fallback: walk up the DOM looking for a stat label heading near the button
        let node = btn;
        for (let i = 0; i < 8; i++) {
            node = node.parentElement;
            if (!node) break;
            const headings = node.querySelectorAll('h3, h4, strong, span, div');
            for (const h of headings) {
                if (wrap.contains(h)) continue;
                const t = h.textContent.trim().toLowerCase().replace(/\s+gains?$/,'').trim();
                if (TORN_STAT_LABELS[t]) return TORN_STAT_LABELS[t];
            }
        }
        return null;
    }

    function findSwitchButtonForGym(gymName) {
        const allBtns = document.querySelectorAll('button, a, [role="button"]');
        for (const btn of allBtns) {
            if (wrap.contains(btn)) continue;
            const t = btn.textContent.trim().toLowerCase();
            if (t !== 'switch' && t !== 'enter' && t !== 'use') continue;
            const container = btn.closest('li, div, tr, [class*="gym"]') || btn.parentElement;
            if (!container) continue;
            if (container.textContent.toLowerCase().includes(gymName.toLowerCase())) return btn;
        }
        return null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PAGE READERS — extract live values (stat / energy / happy) from Torn DOM.
    // All readers skip our own widget (`wrap`) so we don't read our own values.
    // ─────────────────────────────────────────────────────────────────────────

    // Shared text-walker. `predicate(text, parentEl)` returns a value (truthy →
    // returned to caller) or null/undefined to keep walking.
    function walkPageText(predicate) {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: n => wrap.contains(n.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
        });
        let node;
        while ((node = walker.nextNode())) {
            const result = predicate(node.textContent.trim(), node.parentElement);
            if (result != null) return result;
        }
        return null;
    }

    // Read current stat value (e.g. SPD: 431,802) from the page
    function readStatFromPage(statKey) {
        const labelMap = { str:'STR', spd:'SPD', def:'DEF', dex:'DEX',
                           strength:'STR', speed:'SPD', defense:'DEF', dexterity:'DEX' };
        const abbrev = labelMap[statKey] || statKey.toUpperCase().slice(0,3);
        return walkPageText((t, parent) => {
            if (t === abbrev) {
                // Value usually in next sibling element
                const sib = parent?.nextElementSibling;
                if (sib) {
                    const v = parseFloat(sib.textContent.replace(/,/g,''));
                    if (v > 0) return v;
                }
                // Or as a number elsewhere in the same parent block
                const grandparent = parent?.parentElement;
                if (grandparent) {
                    const nums = grandparent.textContent.match(/[\d,]{3,}/g);
                    if (nums) {
                        const v = parseFloat(nums[0].replace(/,/g,''));
                        if (v > 0) return v;
                    }
                }
            }
            // "STR 33,401" combined-text form
            const m = t.match(new RegExp(`^${abbrev}\\s+([\\d,]+)$`));
            if (m) return parseFloat(m[1].replace(/,/g,''));
            return null;
        });
    }

    // Read current energy from the page (e.g. "125 / 150")
    function readEnergyFromPage() {
        // TornPDA: <p class="bar-value___NTdce">125 / 150</p> in .energy___hsTnO
        for (const node of document.querySelectorAll('[class*="energy"] [class*="bar-value"], [class*="bar-value"]')) {
            if (wrap.contains(node)) continue;
            const m = node.textContent.trim().match(/^(\d{1,4})\s*\/\s*\d{2,4}$/);
            if (m) {
                const v = parseInt(m[1]);
                if (v >= 0 && v <= 1500) return v;
            }
        }
        // Fallback: any "X / 150" or "X / 100" with energy-related ancestor
        return walkPageText((t, parent) => {
            const m = t.match(/^(\d{1,4})\s*\/\s*(150|100)$/);
            if (m && parent?.closest('[class*="energy"], [id*="energy"]')) {
                const v = parseInt(m[1]);
                if (v >= 0 && v <= 1500) return v;
            }
            return null;
        });
    }

    // Read current happy from the page (sidebar or top bar)
    function readHappyFromPage() {
        return walkPageText((t, parent) => {
            if (!/^\d{2,6}$/.test(t.replace(/,/g,''))) return null;
            const ctx = parent?.closest('[class*="happy"], [id*="happy"]') ||
                        parent?.previousElementSibling?.textContent?.toLowerCase().includes('happy') ||
                        parent?.parentElement?.textContent?.toLowerCase().includes('happiness');
            if (!ctx) return null;
            const v = parseInt(t.replace(/,/g,''));
            return (v > 0 && v < 100000) ? v : null;
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SESSION CLASSIFIER — tag each logged session by what kind of train it was.
    // ─────────────────────────────────────────────────────────────────────────
    function classifySession(energy, happy, propHappy) {
        if (energy == null || happy == null) return "unknown";
        const happyMult = propHappy > 0 ? happy / propHappy : 1;
        if (happyMult > JUMP_HAPPY_RATIO) {
            return energy >= 500 ? "jump-full" : "jump-partial";
        }
        if (energy >= 500) return "xanax-stack";   // multiple xanax stacked
        if (energy >= 200) return "xanax-burst";   // one xanax + regen
        if (energy >= 140) return "refill-or-cap"; // points refill or full cap
        if (energy >= 50)  return "regen";          // partial natural regen
        return "small";                             // tail-end train
    }


    // ─────────────────────────────────────────────────────────────────────────
    // AUTO LOGGER — captures gym sessions from result text + click snapshot
    // Each train result is logged independently. Click-time snapshots provide
    // authoritative energy/happy values; result text provides the gain.
    // ─────────────────────────────────────────────────────────────────────────

    function logTrainEvent(gain, newStat, statKey, energyUsed) {
        if (!gain || !statKey) return;
        if (!window._ggAutoLogEnabled) return;

        // Click-gate: only log if a real TRAIN button was clicked recently.
        // This eliminates ALL false positives from page-load event log replays —
        // no click = no log.
        if (!lastTrainClickTs || Date.now() - lastTrainClickTs > LOG_CLICK_GATE_MS) return;
        const stat    = Object.keys(STAT_KEYS).find(k => STAT_KEYS[k] === statKey) || statKey;
        const gym     = getGymData();
        const gymDots = gym?.[STAT_KEYS[stat]] || 0;
        if (!gymDots) return;

        // Energy used: prefer the click-time snapshot from the page (authoritative —
        // we know exactly what was on screen when TRAIN was pressed). Fall back to
        // parsed-from-text energyUsed only if the snapshot is missing.
        // This fixes the "1000E jump logged as 10E" bug.
        const finalEnergyUsed = (lastTrainedEnergy != null && lastTrainedEnergy > 0)
            ? lastTrainedEnergy
            : energyUsed;

        // If newStat wasn't in the result text (TornPDA short format),
        // try reading it from the page DOM. If that fails too, derive from
        // the pre-train stat field in our calculator.
        let resolvedNewStat = newStat;
        if (!resolvedNewStat) {
            resolvedNewStat = Math.round(readStatFromPage(STAT_KEYS[stat]) || 0);
        }
        if (!resolvedNewStat) {
            // Last resort: use calculator's current stat + gain as an approximation
            resolvedNewStat = Math.round(gf(el.statTotal) + gain);
        }

        const preStat = Math.round(resolvedNewStat - gain);
        if (preStat <= 0) return;

        // Happy: use the snapshot taken at TRAIN click (most accurate), fall back
        // to live read, then fall back to propHappy field value.
        const happyAtTrain = lastTrainedHappy || readHappyFromPage() || gf(el.happy) || 5025;

        const entry = {
            ts:         Date.now(),
            scriptVer:  "3.36",
            playerId:   _load('playerId', null),
            playerName: _load('playerName', null),
            stat,
            gymId:      gym?.id,
            gymName:    gym?.name,
            gymDots,
            ePerTrain:  gym?.energy || 10,
            subscriber: el.subscriber?.value || "?",
            preStat,
            newStat:    Math.round(resolvedNewStat),
            happy:      happyAtTrain,
            propHappy:  gf(el.happy) || 5025,
            energyUsed: finalEnergyUsed,
            actualGain: Math.round(gain),
            sessionType: lastSessionType || "unknown",
            // Individual perks — broken out for formula research
            perkFaction:  parseFloat(el.factionPerk?.value)    || 0,
            perkProperty: parseFloat(el.propertyPerk?.value)   || 0,
            perkEduStat:  parseFloat(el.eduStatPerk?.value)    || 0,
            perkEduGen:   parseFloat(el.eduGenPerk?.value)     || 0,
            perkJob:      parseFloat(el.jobPerk?.value)        || 0,
            perkBook:     parseFloat(el.bookPerk?.value)       || 0,
            perkSteroids: parseFloat(el.steroids?.value)       || 0,
            perkSneakers: parseFloat(el.sportsSneakers?.value) || 0,
            bonus:        calcBonus(stat), // combined multiplier (derived from above)
            auto:         true,
        };

        const entries = logPrune(logLoad());
        // Deduplicate: skip if a very similar entry exists within last 30s
        const isDupe = entries.some(e =>
            e.stat === entry.stat &&
            Math.abs(e.ts - entry.ts) < LOG_DEDUPE_MS &&
            Math.abs(e.actualGain - entry.actualGain) < 100
        );
        if (isDupe) return;

        entries.push(entry);
        logSave(entries);
        renderLogger();

        const banner = document.createElement('div');
        banner.style.cssText = [
            'position:fixed;top:60px;left:50%;transform:translateX(-50%)',
            'background:#141a14;border:1px solid #2a4a2a;border-radius:5px',
            'padding:8px 14px;font-size:12px;color:#7abf7a;z-index:99999',
            'font-family:Arial,sans-serif;box-shadow:0 3px 12px rgba(0,0,0,.5)',
        ].join(';');
        const sessionLabel = {
            "jump-full":      "🎉 Happy Jump",
            "jump-partial":   "⚡ Jump train",
            "xanax-stack":    "💊 Xanax stack",
            "xanax-burst":    "💊 Xanax burst",
            "refill-or-cap":  "🔋 Refill/cap",
            "regen":          "🌿 Regen",
            "small":          "↳ Tail train",
            "unknown":        "📓",
        }[entry.sessionType] || "📓";
        banner.textContent = `${sessionLabel} +${fmt(entry.actualGain)} ${STAT_LABELS[stat]} (${finalEnergyUsed}E)`;
        document.body.appendChild(banner);
        setTimeout(() => banner.remove(), 4000);
    }

    // Watch the DOM for train result text — Torn uses several formats:
    //   "You used 1000 energy and 5 happiness training your dexterity 999 times
    //    in Racing Fitness increasing it by 31,887.00 to 453,315.00"
    //   "You have gained 35,158.00 dexterity"   (TornPDA short form)
    //   "You gained 35,158 strength"
    // Torn sometimes UPDATES existing text nodes (characterData mutation) rather than
    // inserting new ones — we observe both to catch the refill result reliably.
    const resultObserver = new MutationObserver(mutations => {
        for (const mut of mutations) {
            // Only childList mutations — new DOM insertions only
            const nodes = [...mut.addedNodes];

            for (const node of nodes) {
                // Skip anything inside our own widget
                const el_ = node.nodeType === 3 ? node.parentElement : node;
                if (!el_) continue;
                if (wrap.contains(el_)) continue;

                // Skip results inside Torn's event log, notifications, or history panels.
                // These contain old train results that would create false entries.
                const inTornLog = el_.closest(
                    '[class*="log-"], [class*="-log"], [id*="log"],' +
                    '[class*="event"], [id*="event"],' +
                    '[class*="notification"], [class*="activity"],' +
                    '[class*="timeline"], [class*="history"]'
                );
                if (inTornLog) continue;

                const text = node.textContent || '';
                if (!text || text.length < 20) continue;

                let gain = null, newStat = null, statKey = null, energyUsed = null;

                // Pattern 1 — Desktop Torn full result (most reliable, contains all data):
                // "You used 150 energy and 76 happiness training your speed 15 times
                //  in Complete Cardio increasing it by 2,200.52 to 326,067.73"
                const mFull = text.match(/you used\s+([\d,]+)\s+energy[^.]*?training (?:your\s+)?(strength|speed|defense|dexterity)[^.]*?increasing it by\s+([\d,]+(?:\.\d+)?)\s+to\s+([\d,]+(?:\.\d+)?)/i);
                if (mFull) {
                    energyUsed = parseInt(mFull[1].replace(/,/g,''));
                    statKey    = STAT_KEYS[mFull[2].toLowerCase()];
                    gain       = parseFloat(mFull[3].replace(/,/g,''));
                    newStat    = Math.round(parseFloat(mFull[4].replace(/,/g,'')));
                }

                // Pattern 2 — TornPDA short result:
                // "You gained 2,247.56 speed" or "You have gained 2,247.56 speed"
                if (!gain) {
                    const mPDA = text.match(/you (?:have )?gained\s+([\d,]+(?:\.\d+)?)\s+(strength|speed|defense|dexterity)/i);
                    if (mPDA) {
                        gain    = parseFloat(mPDA[1].replace(/,/g,''));
                        statKey = STAT_KEYS[mPDA[2].toLowerCase()];
                        // newStat not available — derive after logTrainEvent from preStat+gain
                        newStat = 0; // will be computed inside logTrainEvent
                        // Energy: use current gym's ePerTrain × trains in result if available
                        const mTrains = text.match(/(\d+)\s+times/i);
                        const gymE    = getGymData()?.energy || 10;
                        energyUsed    = mTrains ? parseInt(mTrains[1]) * gymE : gymE;
                    }
                }

                if (!gain || !statKey || !energyUsed) continue;
                if (!newStat) newStat = Math.round(readStatFromPage(statKey) || 0);
                logTrainEvent(gain, newStat, statKey, energyUsed);
            }
        }
    });
    resultObserver.observe(document.body, { childList: true, subtree: true });


    // Track which stat was last clicked so we can attribute results correctly
    let lastTrainedStat   = null;
    let lastTrainedHappy  = null; // happy snapshotted at TRAIN click, before regen
    let lastTrainedEnergy = null; // energy snapshotted at TRAIN click — authoritative
    let lastTrainClickTs  = null; // timestamp of last TRAIN button click — gate for auto-log
    let lastSessionType   = null; // classified session type ("jump-full", "xanax-burst", etc.)

    function handleTrainClick(e, btn) {
        // Snapshot stat AND happy AND energy at the moment of click — before the train
        // processes and before any regen ticks. This is the only reliable moment.
        const statKey = getStatForTrainButton(btn);
        if (statKey) lastTrainedStat = statKey;
        lastTrainedHappy  = readHappyFromPage();
        lastTrainedEnergy = readEnergyFromPage();
        lastTrainClickTs  = Date.now(); // arm the log gate
        // Classify the session for context — fixes "10E logged for a 1000E jump" bug
        const propH = gf(el.happy) || 5025;
        lastSessionType = classifySession(lastTrainedEnergy, lastTrainedHappy, propH);

        if (!switcherEnabled) return;
        if (!statKey) return;

        const statLabel   = Object.keys(STAT_KEYS).find(k => STAT_KEYS[k] === statKey);
        const currentPos  = STANDARD_UNLOCK_ORDER[parseInt(el.gym.value)] ?? 0;
        const manualOwned = JSON.parse(_load('manualGymOwned','[]'));

        const owned = GYMS
            .filter(g => {
                const dots = g[statKey] || 0;
                if (!dots) return false;
                if (SPECIALIST_IDS.has(g.id)) return manualOwned.includes(g.id);
                return (STANDARD_UNLOCK_ORDER[g.id] ?? 99) <= currentPos;
            })
            .sort((a, b) => (b[statKey]||0) - (a[statKey]||0));

        if (!owned.length) return;

        const bestGym   = owned[0];
        const currentId = detectGymFromDOM();

        // Can't determine current gym — don't switch, would cause wrong behaviour
        if (!currentId) return;

        // Already in the best gym — let train proceed
        if (currentId === bestGym.id) return;

        const switchBtn = findSwitchButtonForGym(bestGym.name);
        if (!switchBtn) {
            showSwitchBanner(GYM_BY_ID[currentId]?.name || 'current gym', bestGym.name + ' (switch manually)', STAT_LABELS[statLabel]);
            return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();
        switchBtn.click();
        showSwitchBanner(GYM_BY_ID[currentId]?.name || 'current gym', bestGym.name, STAT_LABELS[statLabel]);

        setTimeout(() => {
            const newGymId = detectGymFromDOM();
            if (newGymId) {
                setGymSelect(el.gym, String(newGymId));
                gymConfirmed = true;
                el.gymBadge.textContent = "✓ page";
                updateDotsDisplay();
                updateBestGymPanel();
            }
        }, 1500);
    }

    const hookedButtons = new WeakSet();

    function hookTrainButtons() {
        // Primary selector from TornPDA DOM analysis:
        //   <button type="button" class="torn-btn" aria-label="Train speed" disabled="">TRAIN</button>
        // Also covers desktop Torn which uses the same aria-label pattern.
        // We use aria-label^="Train" as the definitive hook — much more precise
        // than matching text content which can catch unrelated buttons.
        const byAria = document.querySelectorAll('button[aria-label^="Train"]');
        for (const btn of byAria) {
            if (wrap.contains(btn)) continue;
            if (hookedButtons.has(btn)) continue;
            hookedButtons.add(btn);
            btn.addEventListener('click', e => handleTrainClick(e, btn), true);
        }

        // Fallback: text-content match for any platform that doesn't set aria-label
        const byText = document.querySelectorAll('button.torn-btn, button[class*="train"], a[class*="train"]');
        for (const btn of byText) {
            if (wrap.contains(btn)) continue;
            if (hookedButtons.has(btn)) continue;
            const t = btn.textContent.trim().toUpperCase();
            if (!t.startsWith('TRAIN')) continue;
            hookedButtons.add(btn);
            btn.addEventListener('click', e => handleTrainClick(e, btn), true);
        }
    }

    setTimeout(hookTrainButtons, 500);
    const trainObserver = new MutationObserver(() => hookTrainButtons());
    trainObserver.observe(document.body, { childList: true, subtree: true });

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────────────────
    const gf      = e => parseFloat(e?.value)||0;
    const gi      = e => parseInt(e?.value)  ||0;
    const fmt     = n => Math.round(n).toLocaleString();
    const fmtD    = (n,d=2) => n.toFixed(d);
    const getPerk = e => (parseFloat(e?.value)||0)/100;
    const dateIn  = n => { const d=new Date(); d.setDate(d.getDate()+Math.round(n)); return d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}); };
    const row     = (l,v,c="") => `<div class="gg-row ${c}"><span class="gg-rl">${l}</span><span class="gg-rv">${v}</span></div>`;
    const rsec    = l => `<div class="gg-rsec">${l}</div>`;

    // Current gym data object
    function getGymData() {
        const id = parseInt(el.gym.value);
        return GYM_BY_ID[id] || null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VLADAR FORMULA
    // dS = (S*ROUND(1+0.07*ROUND(LN(1+H/250),4),4) + 8*H^1.05 + (1-(H/99999)^2)*A + B)
    //      * (1/200000) * G * E * perks
    // S is actual stat (no cap since Aug 2022 stat cap removal)
    // G = gym dots (already stored as actual value e.g. 5.2, not ×10)
    // ─────────────────────────────────────────────────────────────────────────
    function calcGain(dots, stat, happy, bonus, energy, consts) {
        const H = happy;
        const lnPart = Math.round((1 + 0.07 * Math.round(Math.log(1+H/250)*10000)/10000)*10000)/10000;
        // FORMULA_CORRECTION (×1.027) is an empirical scalar derived from logged
        // sessions where the raw Vladar formula consistently underpredicted by
        // +2.70% (mean across 20+ entries, ±0.44% std).
        return (stat*lnPart + 8*Math.pow(H,1.05) + (1-Math.pow(H/99999,2))*consts.A + consts.B)
               * (1/200000) * dots * energy * bonus * FORMULA_CORRECTION;
    }

    // Happy decay per train: Vladar formula dH = ROUND((1/10) * E * RANDBETWEEN(4,6))
    // Midpoint = E * 0.5 (i.e. 5 per 10E train, 12.5 per 25E train, etc.)
    function happyDecay(energy) { return energy * 0.5; }

    function simulateBlock(dots, startStat, startHappy, bonus, energy, consts, numTrains, happyFloor=0) {
        let stat=startStat, happy=startHappy, gain=0;
        for (let i=0; i<numTrains; i++) {
            const g = calcGain(dots,stat,happy,bonus,energy,consts);
            gain += g; stat += g;
            happy = Math.max(happyFloor, happy - happyDecay(energy));
        }
        return { totalGain:gain, finalStat:stat, finalHappy:happy };
    }

    function calcBonus(stat) {
        let m = (1+getPerk(el.factionPerk))*(1+getPerk(el.propertyPerk))*
                (1+getPerk(el.eduStatPerk))*(1+getPerk(el.eduGenPerk))*
                (1+getPerk(el.jobPerk))*(1+getPerk(el.bookPerk))*(1+getPerk(el.steroids));
        if (stat==="speed") m *= (1+getPerk(el.sportsSneakers));
        return m;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DAILY GRIND
    // ─────────────────────────────────────────────────────────────────────────
    function calculateDaily() {
        const gym = getGymData();
        if (!gym) throw new Error("Invalid gym selection.");
        const stat = el.stat.value;
        const dots = gym[STAT_KEYS[stat]];
        if (!dots) throw new Error(`${gym.name} does not train ${STAT_LABELS[stat]}.`);

        const consts     = STAT_CONSTS[stat];
        const propHappy  = gf(el.happy);
        const bonus      = calcBonus(stat);
        const statNow    = gf(el.statTotal);
        const statGoal   = gf(el.statGoal) || statNow;
        const initEnergy = gf(el.energy);
        const ePerTrain  = gym.energy;

        // ── "Right Now" snapshot — spends whatever energy you have currently ──
        // This is separate from the daily total; just shows what this session gives.
        const numTrains  = Math.floor(initEnergy / ePerTrain);
        const initBlock  = simulateBlock(dots, statNow, propHappy, bonus, ePerTrain, consts, numTrains);
        const singleGain = calcGain(dots, statNow, propHappy, bonus, ePerTrain, consts);
        const errSingle  = consts.C * (1/200000) * dots * ePerTrain * bonus;

        // ── Daily total — natural regen (720E/day sub, 480E/day non-sub) + optional refill ──
        // initEnergy is NOT added here — the daily regen is the base, always.
        const natEPerHr  = NATURAL_E[el.subscriber.value] || NATURAL_E.no;
        const natEPerDay = natEPerHr * 24;   // 720E sub, 480E non-sub
        const natTrains  = Math.floor(natEPerDay / ePerTrain);
        const wastedE    = natEPerDay - natTrains * ePerTrain;
        const dayBlock   = simulateBlock(dots, statNow, propHappy, bonus, ePerTrain, consts, natTrains, propHappy);

        // Daily refill
        const useRefill      = el.dailyRefill.value === "yes";
        const refillCost     = gf(el.dailyRefillCost) || 1725000;
        const refillE        = E_CAP[el.subscriber.value];
        const refillTrains   = Math.floor(refillE / ePerTrain);
        const refillBlock    = useRefill
            ? simulateBlock(dots, dayBlock.finalStat, propHappy, bonus, ePerTrain, consts, refillTrains, propHappy)
            : { totalGain:0 };
        const totalDailyGain  = dayBlock.totalGain + refillBlock.totalGain;
        const dailyCostPerDay = useRefill ? refillCost : 0;

        // Goal projection
        let cur = initBlock.finalStat, days = 0;
        while (cur < statGoal && days < MAX_ITER) {
            const d = simulateBlock(dots,cur,propHappy,bonus,ePerTrain,consts,natTrains,propHappy);
            cur = d.finalStat;
            if (useRefill) cur += simulateBlock(dots,cur,propHappy,bonus,ePerTrain,consts,refillTrains,propHappy).totalGain;
            days++;
        }
        const goalUnreach    = days >= MAX_ITER;
        const dailyCostToGoal = dailyCostPerDay * days;
        const gymName        = gym.name;

        const remaining = Math.max(0, statGoal - statNow);
        const pctDone   = statGoal > 0 ? ((statNow/statGoal)*100).toFixed(1) : "—";

        let html = `<div class="gg-tldr">
  <div class="gg-tldr-title">📊 Daily Grind — ${STAT_LABELS[stat]} at ${gymName}</div>
  <div class="gg-tldr-grid">
    <div class="gg-tldr-cell"><div class="gg-tldr-val">+${fmtD(singleGain,1)}</div><div class="gg-tldr-lbl">per train</div></div>
    <div class="gg-tldr-cell"><div class="gg-tldr-val">+${fmt(totalDailyGain)}</div><div class="gg-tldr-lbl">per day${useRefill?" (regen+refill)":""}</div></div>
    <div class="gg-tldr-cell"><div class="gg-tldr-val">${goalUnreach?"∞":`~${days}d`}</div><div class="gg-tldr-lbl">days to goal</div></div>
    <div class="gg-tldr-cell"><div class="gg-tldr-val">${goalUnreach?"—":dateIn(days)}</div><div class="gg-tldr-lbl">done by</div></div>
  </div>
</div>`;

        // ── Snapshot ──────────────────────────────────────────────────────────
        html += rsec("Your Stats Right Now");
        html += row(`${STAT_LABELS[stat]}`, `${fmt(statNow)} (${pctDone}% of goal)`);
        html += row("Goal",        `${fmt(statGoal)} — need ${fmt(remaining)} more`);
        html += row("Happy",       `${fmt(propHappy)} — property max happy`);
        html += row("Total bonus", `${((bonus-1)*100).toFixed(1)}% from all perks combined`);

        // ── What you get per train ────────────────────────────────────────────
        html += rsec("Per Train");
        html += row("Gain",  `~${fmtD(singleGain,2)} ${STAT_LABELS[stat]} per ${ePerTrain}E train`, "hi");
        html += row("Range", `${fmtD(singleGain-errSingle,2)} – ${fmtD(singleGain+errSingle,2)} (±${fmtD(errSingle,2)} random variance)`);

        // ── Current energy snapshot ───────────────────────────────────────────
        if (numTrains > 0) {
            html += rsec(`This Session — Spending Your ${initEnergy}E Now`);
            html += row("Trains",   `${numTrains} trains × ${ePerTrain}E`);
            html += row("Gain",     `+${fmtD(initBlock.totalGain,1)} ${STAT_LABELS[stat]}`, "hi");
            html += row("New stat", `${fmt(initBlock.finalStat)} after this session`);
        }

        // ── Daily natural regen ───────────────────────────────────────────────
        html += rsec(`Daily Natural Regen — ${natEPerDay}E/day (${natEPerHr}E/hr × 24h)`);
        html += row("Trains/day",   `${natTrains} trains × ${ePerTrain}E`);
        if (wastedE > 0) html += row("Wasted energy", `${wastedE}E/day lost — regen doesn't divide evenly into ${ePerTrain}E trains`, "a");
        html += row("Gain/day",     `+${fmt(dayBlock.totalGain)} ${STAT_LABELS[stat]}/day from natural regen`, "hi");

        // ── Daily refill ──────────────────────────────────────────────────────
        if (useRefill) {
            html += rsec("Points Refill (+150E once/day)");
            html += row("Extra trains",  `${refillTrains} trains × ${ePerTrain}E`);
            html += row("Extra gain",    `+${fmt(refillBlock.totalGain)} ${STAT_LABELS[stat]}`, "hi");
            html += row("Cost",          `$${fmt(refillCost)}/day`, "b");
        }

        // ── Total ─────────────────────────────────────────────────────────────
        html += rsec("Daily Total");
        html += row("Gain/day",   `+${fmt(totalDailyGain)} ${STAT_LABELS[stat]}${useRefill?" (regen + refill)":""}`, "hi");
        if (useRefill) html += row("Cost/day", `$${fmt(dailyCostPerDay)}`, "b");

        // ── Goal projection ───────────────────────────────────────────────────
        html += rsec("Reaching Your Goal");
        if (goalUnreach) {
            html += row("⚠ Unreachable", "Increase your happy or add a refill — gains are too small vs your goal", "a");
        } else {
            html += row("Days needed",   `~${days} days`, "g");
            html += row("Finish date",   dateIn(days), "g");
            if (useRefill) html += row("Total spend", `$${fmt(dailyCostToGoal)} in Points refills over ${days} days`, "b");
            html += row("Tip", days > 30 ? "Consider Happy Jumps — they can cut this time significantly" : "You're close! Keep grinding 💪", "");
        }

        el.dailyResults.innerHTML = html;
        el.dailyResults.style.display = "";
        el.jumpResults.style.display  = "none";
        el.compareResults.style.display = "none";
        el.copy.style.display = "inline-block";
        el._lastResults = html;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HAPPY JUMP
    // ─────────────────────────────────────────────────────────────────────────
    // ── Shared jump parameter extraction ───────────────────────────────────────
    function readJumpParams() {
        const gym        = getGymData();
        if (!gym) throw new Error("Invalid gym selection.");
        const stat       = el.stat.value;
        const dots       = gym[STAT_KEYS[stat]];
        if (!dots) throw new Error(`${gym.name} does not train ${STAT_LABELS[stat]}.`);

        const energyCap   = E_CAP[el.subscriber.value];
        const natEPerHr   = NATURAL_E[el.subscriber.value];
        const propHappy   = gf(el.happy);
        const statNow     = gf(el.statTotal);
        const statGoal    = gf(el.statGoal) || statNow;
        const bonus       = calcBonus(stat);
        const ePerTrain   = gym.energy;

        // Energy sources
        const xanaxCount  = gi(el.hjXanaxCount);
        const fhcCount    = gi(el.hjFHC);
        const lsdCount    = gi(el.hjLSD);
        const canCount    = gi(el.hjCans);
        const canTypeIdx  = gi(el.hjCanType);
        const canFacPerk  = gi(el.hjCanFactionPerk) / 100;
        const canType     = canTypeIdx > 0 ? CAN_TYPES[canTypeIdx - 1] : null;
        const canEach     = canType ? Math.round(canType.e * (1 + canFacPerk)) : 0;
        const canCD       = canType ? canType.cd : 2;

        // Happy boosters
        const edvdCount     = gi(el.hjEDVDs);
        const anJob         = el.hjANJob.value === "yes";
        const useEcstasy    = el.hjEcstasy.value === "yes";
        const useRefill     = el.hjRefill.value === "yes";
        const voracity      = gi(el.hjVoracity);
        const fhcCount_     = fhcCount; // alias for clarity
        const fhcHappyBoost = fhcCount * FHC_HAPPY;
        const candyCount    = gi(el.hjCandies);
        const candyTypeIdx  = gi(el.hjCandyType);
        const candyType     = candyTypeIdx > 0 ? CANDY_TYPES[candyTypeIdx - 1] : null;
        const candyVorPct   = gi(el.hjCandyVoracity) / 100;
        const candyAbsPct   = el.hjCandyAbsorption?.value === "yes" ? 0.10 : 0;
        const candyMult     = 1 + candyVorPct + candyAbsPct;
        const candyHappyEach= candyType ? Math.round(candyType.happy * candyMult) : 0;
        const candyHappyTotal = candyCount * candyHappyEach;

        // Happy calculation
        const hjBase      = gf(el.hjBaseHappy);
        const baseHappy   = hjBase > 0 ? hjBase : propHappy;
        const edvdHappyPer = anJob ? EDVD_HAPPY * 2 : EDVD_HAPPY;
        let jumpHappy = baseHappy + edvdCount * edvdHappyPer + fhcHappyBoost + candyHappyTotal;
        if (useEcstasy) jumpHappy = Math.min(jumpHappy * 2, 99999);

        // Energy calculation
        const xanaxEnergy  = xanaxCount === 4 ? 1000 : Math.min(1000, energyCap + xanaxCount * 250);
        const xanStackE    = Math.min(1000, xanaxEnergy + lsdCount * 50 + canCount * canEach);
        const fhcEnergy    = fhcCount * energyCap;
        const stackTrains  = Math.floor(xanStackE / ePerTrain);
        const fhcTrains    = Math.floor(fhcEnergy / ePerTrain);

        // CD calculation
        const maxCD        = 24 + voracity;
        const xanCD        = XAN_CD_AVG * xanaxCount;
        const edvdCDTotal  = edvdCount * EDVD_CD;
        const fhcCDTotal   = fhcCount * FHC_CD;
        const canCDTotal   = canCount * canCD;
        const candyCDTotal = candyCount * CANDY_CD_HRS;
        const effectiveCD  = Math.min(xanCD + edvdCDTotal + fhcCDTotal + canCDTotal + candyCDTotal, maxCD);
        const cycleBest    = Math.min(XAN_CD_MIN * xanaxCount + edvdCDTotal + fhcCDTotal + canCDTotal + candyCDTotal, maxCD) + (useRefill ? energyCap / natEPerHr : 0);
        const cycleWorst   = Math.min(XAN_CD_MAX * xanaxCount + edvdCDTotal + fhcCDTotal + canCDTotal + candyCDTotal, maxCD) + (useRefill ? energyCap / natEPerHr : 0);
        const cycleAvg     = effectiveCD + (useRefill ? energyCap / natEPerHr : 0);

        // Costs
        const xanaxCost   = gf(el.hjXanaxCost);
        const edvdCost    = gf(el.hjEDVDCost);
        const ecstasyCost = useEcstasy ? gf(el.hjEcstasyCost) : 0;
        const fhcCost     = gf(el.hjFHCCost);
        const lsdCost     = gf(el.hjLSDCost);
        const canCost     = canCount > 0 ? gf(el.hjCanCost) : 0;
        const candyCost   = candyCount > 0 ? gf(el.hjCandyCost) : 0;
        const costTotal   = xanaxCount * xanaxCost + edvdCount * edvdCost + ecstasyCost
                          + fhcCount * fhcCost + lsdCount * lsdCost
                          + canCount * canCost + candyCount * candyCost
                          + (useRefill ? 1725000 : 0);

        return {
            gym, stat, dots, energyCap, natEPerHr, propHappy, statNow, statGoal,
            bonus, ePerTrain, xanaxCount, fhcCount, lsdCount, canCount, canType,
            canEach, canCD, edvdCount, anJob, useEcstasy, useRefill, voracity,
            fhcHappyBoost, candyCount, candyType, candyHappyTotal, candyHappyEach,
            baseHappy, jumpHappy, xanaxEnergy, xanStackE, fhcEnergy,
            stackTrains, fhcTrains, maxCD, xanCD, edvdCDTotal, fhcCDTotal,
            canCDTotal, candyCDTotal, effectiveCD, cycleBest, cycleWorst, cycleAvg,
            xanaxCost, edvdCost, ecstasyCost, fhcCost, lsdCost, canCost, candyCost,
            costTotal, edvdHappyPer, canFacPerk, candyMult,
        };
    }

    function calculateHappyJump() {
        const p = readJumpParams();
        const { gym, stat, dots, energyCap, natEPerHr, propHappy, statNow, statGoal,
                bonus, ePerTrain, xanaxCount, fhcCount, lsdCount, canCount, canType,
                canEach, edvdCount, useEcstasy, useRefill, fhcHappyBoost,
                candyCount, candyType, candyHappyTotal, baseHappy, jumpHappy,
                xanStackE, fhcEnergy, stackTrains, fhcTrains, maxCD, xanCD,
                edvdCDTotal, fhcCDTotal, canCDTotal, candyCDTotal, effectiveCD,
                cycleBest, cycleWorst, cycleAvg, xanaxCost, edvdCost, ecstasyCost,
                fhcCost, lsdCost, canCost, candyCost, costTotal, edvdHappyPer } = p;

        const consts = STAT_CONSTS[stat];

        // Simulate gains
        const stackBlock = simulateBlock(dots, statNow, jumpHappy, bonus, ePerTrain, consts, stackTrains);
        const fhcBlock   = fhcCount > 0
            ? simulateBlock(dots, statNow + stackBlock.totalGain, stackBlock.finalHappy + fhcHappyBoost, bonus, ePerTrain, consts, fhcTrains)
            : { totalGain: 0 };
        const gainStack  = stackBlock.totalGain + fhcBlock.totalGain;
        const gainRefill = useRefill
            ? simulateBlock(dots, statNow + gainStack, propHappy, bonus, ePerTrain, consts, Math.floor(energyCap / ePerTrain)).totalGain
            : 0;
        const gainTotal  = gainStack + gainRefill;
        const jumpsPerWeek = (24 * 7) / cycleAvg;
        const weeklyGain   = gainTotal * jumpsPerWeek;
        const costPerKStat = gainTotal > 0 ? (costTotal / gainTotal) * 1000 : 0;

        // Goal projection
        let jJumps = 0, cur = statNow;
        while (cur < statGoal && jJumps < MAX_ITER) {
            const sb = simulateBlock(dots, cur, jumpHappy, bonus, ePerTrain, consts, stackTrains);
            const fb = fhcCount > 0 ? simulateBlock(dots, cur + sb.totalGain, sb.finalHappy + fhcHappyBoost, bonus, ePerTrain, consts, fhcTrains) : { totalGain: 0 };
            cur += sb.totalGain + fb.totalGain;
            if (useRefill) cur += simulateBlock(dots, cur, propHappy, bonus, ePerTrain, consts, Math.floor(energyCap / ePerTrain)).totalGain;
            jJumps++;
        }
        const jumpGoalUnreach = jJumps >= MAX_ITER;
        const daysToGoal      = jJumps * (cycleAvg / 24);
        const totalCost       = costTotal * jJumps;

        // OD risk
        const xODBase = parseFloat(el.hjXanaxOD.value) / 100 || 0.03;
        const eODBase = parseFloat(el.hjEcstasyOD.value) / 100 || 0.05;
        const tolPct  = parseFloat(el.hjToleration.value) / 100 || 0;
        const odMult  = (1 - tolPct) * (el.hjNightclub.value === "yes" ? 0.5 : 1);
        const xODEff  = xODBase * odMult;
        const eODEff  = eODBase * odMult;
        const pClean  = Math.pow(1 - xODEff, xanaxCount) * (useEcstasy ? 1 - eODEff : 1);
        const odExtraCost = pClean > 0 ? (1/pClean - 1) * costTotal : 0;

        // Energy/happy summary
        const gymName = gym.name;
        const statLabel = STAT_LABELS[stat];
        const energyParts = [];
        if (xanaxCount > 0) energyParts.push(`${xanaxCount}× Xanax (${p.xanaxEnergy}E)`);
        if (lsdCount > 0)   energyParts.push(`${lsdCount}× LSD (+${lsdCount*50}E)`);
        if (canCount > 0)   energyParts.push(`${canCount}× ${canType?.label||'cans'} (+${canCount*canEach}E)`);
        if (fhcCount > 0)   energyParts.push(`${fhcCount}× FHC (${fhcEnergy}E + +${fhcHappyBoost} happy)`);
        if (useRefill)      energyParts.push(`Points refill (+${energyCap}E)`);
        if (candyCount > 0) energyParts.push(`${candyCount}× ${candyType?.label||'candy'} (+${candyHappyTotal} happy)`);

        const happyParts = [`${Math.round(baseHappy)} base`];
        if (edvdCount > 0)   happyParts.push(`+${edvdCount}×eDVD (+${edvdCount*edvdHappyPer})`);
        if (fhcCount > 0)    happyParts.push(`+${fhcCount}×FHC (+${fhcHappyBoost})`);
        if (candyCount > 0)  happyParts.push(`+${candyCount}×${candyType?.label||'candy'} (+${candyHappyTotal})`);
        if (useEcstasy)      happyParts.push(`×2 ecstasy`);

        let html = `<div class="gg-tldr">
  <div class="gg-tldr-title">⚡ Happy Jump — ${statLabel} at ${gymName}</div>
  <div class="gg-tldr-grid">
    <div class="gg-tldr-cell"><div class="gg-tldr-val">+${fmtD(gainTotal,1)}</div><div class="gg-tldr-lbl">per jump</div></div>
    <div class="gg-tldr-cell"><div class="gg-tldr-val">+${fmt(weeklyGain)}</div><div class="gg-tldr-lbl">per week</div></div>
    <div class="gg-tldr-cell"><div class="gg-tldr-val">${jumpGoalUnreach?"∞":`~${fmtD(daysToGoal,1)}d`}</div><div class="gg-tldr-lbl">days to goal</div></div>
    <div class="gg-tldr-cell"><div class="gg-tldr-val">$${fmt(costTotal)}</div><div class="gg-tldr-lbl">per jump</div></div>
  </div>
</div>`;
        html += rsec("Energy Setup");
        html += row("Sources", energyParts.join(', ') || 'Natural regen only');
        html += row("Total energy", `${fmt(p.xanStackE + fhcEnergy)}E (${Math.floor((p.xanStackE + fhcEnergy)/ePerTrain)} trains)`);
        html += rsec("Happy");
        html += row("Breakdown", happyParts.join(' '));
        html += row("Jump happy", `${fmt(jumpHappy)}`, "hi");
        html += rsec("Gains Per Jump");
        if (stackTrains > 0) html += row("Main stack", `+${fmtD(stackBlock.totalGain,1)} (${stackTrains} trains at ${fmt(jumpHappy)} happy)`, "hi");
        if (fhcCount > 0)    html += row("FHC trains", `+${fmtD(fhcBlock.totalGain,1)} (${fhcTrains} trains)`, "hi");
        if (useRefill)       html += row("Refill", `+${fmtD(gainRefill,1)} (${Math.floor(energyCap/ePerTrain)} trains at ${fmt(propHappy)})`, "hi");
        html += row("Total / jump", `+${fmtD(gainTotal,1)} ${statLabel}`, "hi");
        html += row("Stat after", fmt(statNow + gainTotal));
        html += rsec("Cycle Timing");
        const cdParts = [xanaxCount>0?`Xanax:${xanCD}h`:null, edvdCount>0?`eDVD:${edvdCDTotal}h`:null,
                         fhcCount>0?`FHC:${fhcCDTotal}h`:null, canCount>0?`Cans:${canCDTotal}h`:null,
                         candyCount>0?`Candy:${candyCDTotal}h`:null].filter(Boolean);
        html += row("CD breakdown", cdParts.join(' + ') || '—');
        html += row("Effective CD", `${fmtD(effectiveCD,1)}h (cap ${maxCD}h)`);
        if (useRefill) html += row("Refill wait", `+${fmtD(energyCap/natEPerHr,1)}h`);
        html += row("Cycle avg", `~${fmtD(cycleAvg,1)}h (best:${fmtD(cycleBest,1)} worst:${fmtD(cycleWorst,1)})`);
        html += row("Jumps/week", `~${fmtD(jumpsPerWeek,2)}`);
        html += row("Gain/week", `+${fmt(weeklyGain)} ${statLabel}`, "hi");
        html += rsec("Cost Per Jump");
        if (xanaxCount > 0) html += row("Xanax",   `${xanaxCount}× $${fmt(xanaxCost)} = $${fmt(xanaxCount*xanaxCost)}`);
        if (edvdCount > 0)  html += row("eDVD",    `${edvdCount}× $${fmt(edvdCost)} = $${fmt(edvdCount*edvdCost)}`);
        if (useEcstasy)     html += row("Ecstasy",  `$${fmt(ecstasyCost)}`);
        if (fhcCount > 0)   html += row("FHC",     `${fhcCount}× $${fmt(fhcCost)} = $${fmt(fhcCount*fhcCost)}`);
        if (lsdCount > 0)   html += row("LSD",     `${lsdCount}× $${fmt(lsdCost)} = $${fmt(lsdCount*lsdCost)}`);
        if (canCount > 0)   html += row("Cans",    `${canCount}× $${fmt(canCost)} = $${fmt(canCount*canCost)}`);
        if (candyCount > 0) html += row("Candy",   `${candyCount}× ${candyType?.label||''} $${fmt(candyCost)} = $${fmt(candyCount*candyCost)}`);
        if (useRefill)      html += row("Refill",   "$1,725,000");
        html += row("Total", `$${fmt(costTotal)}`, "b");
        html += row("Per 1k stat", `$${fmt(costPerKStat)}`);
        html += rsec("Goal: " + fmt(statGoal));
        if (jumpGoalUnreach) {
            html += row("⚠ Unreachable", "Add more energy/happy sources.", "a");
        } else {
            html += row("Jumps needed", `${jJumps}`, "g");
            html += row("Time", `~${fmtD(daysToGoal,1)} days`, "g");
            html += row("Finish date", dateIn(daysToGoal), "g");
            html += row("Total spend", `$${fmt(totalCost)}`, "b");
        }
        if (xanaxCount > 0) {
            html += rsec("OD Risk ⚠ Community Estimates");
            html += row("Per-Xanax OD%", `${(xODEff*100).toFixed(2)}%`);
            if (useEcstasy) html += row("Ecstasy OD%", `${(eODEff*100).toFixed(2)}%`);
            html += row("Clean jump odds", `${(pClean*100).toFixed(1)}%`);
            html += row("OD cost impact", `~$${fmt(odExtraCost)} extra/jump avg`, "a");
            html += row("Effective gain/wk", `~${fmt(weeklyGain*pClean)} after OD probability`, "hi");
        }
        el.jumpResults.innerHTML = html;
        el.jumpResults.style.display    = "";
        el.dailyResults.style.display   = "none";
        el.compareResults.style.display = "none";
        el.copy.style.display           = "inline-block";
        el._lastResults = html;
    }


    function calculateCompare() {
        const p = readJumpParams();
        const { gym, stat, dots, energyCap, natEPerHr, propHappy, statNow, statGoal,
                bonus, ePerTrain, xanaxCount, fhcCount, canCount,
                canEach, edvdCount, anJob, useEcstasy, useRefill, fhcHappyBoost,
                candyCount, candyType, candyHappyTotal, jumpHappy,
                xanStackE, fhcEnergy, stackTrains, fhcTrains,
                edvdCDTotal, fhcCDTotal, canCDTotal, candyCDTotal, cycleAvg,
                costTotal } = p;

        const consts    = STAT_CONSTS[stat];
        const statLabel = STAT_LABELS[stat];

        // ── Daily Grind ───────────────────────────────────────────────────────
        // Daily Grind = pure natural regen across 24h + optional Points Refill.
        // The "Current energy" field is irrelevant here (that's a one-time snapshot,
        // not a long-term training pattern). Compare must reflect long-term steady
        // state, otherwise typing 99999 in Current Energy would project absurd gains.
        const dailyUseRefill    = el.dailyRefill.value === "yes";
        const dailyRefillCost   = dailyUseRefill ? gf(el.dailyRefillCost) : 0;
        const dailyRefillTrains = Math.floor(energyCap / ePerTrain);
        const dailyNatTrains    = Math.floor(natEPerHr * 24 / ePerTrain);

        // Simulate one full Daily Grind day: full natural regen + optional refill
        const _dailyNat     = simulateBlock(dots, statNow, propHappy, bonus, ePerTrain, consts, dailyNatTrains, propHappy);
        const _dailyRefill  = dailyUseRefill
            ? simulateBlock(dots, _dailyNat.finalStat, propHappy, bonus, ePerTrain, consts, dailyRefillTrains, propHappy)
            : { totalGain: 0 };
        const gainDaily    = _dailyNat.totalGain + _dailyRefill.totalGain;
        const weeklyDaily  = gainDaily * 7;
        const cycleDaily   = 24; // one cycle = one day

        // ── Happy Jump ────────────────────────────────────────────────────────
        const _stackRes  = simulateBlock(dots, statNow, jumpHappy, bonus, ePerTrain, consts, stackTrains);
        const gainStack   = _stackRes.totalGain;
        const gainFHC     = fhcCount > 0 ? simulateBlock(dots, statNow+gainStack, _stackRes.finalHappy+fhcHappyBoost, bonus, ePerTrain, consts, fhcTrains).totalGain : 0;
        const gainRefill  = useRefill ? simulateBlock(dots, statNow+gainStack+gainFHC, propHappy, bonus, ePerTrain, consts, Math.floor(energyCap/ePerTrain)).totalGain : 0;
        const gainJump    = gainStack + gainFHC + gainRefill;
        const weeklyJump  = gainJump * (24 * 7 / cycleAvg);

        // ── Xanax Grind ───────────────────────────────────────────────────────
        // Same model as calculateXanaxGrind: each CD cycle has two trains:
        //   1. mid-CD nat (150E fills in 5h, CD is 7h avg)
        //   2. Xanax burst (2h × 30E/hr = 60E + 250E = 310E)
        const xgCount       = gi(el.xgXanaxCount);
        const xgCost        = gf(el.xgXanaxCost);
        const xgUseRefill   = el.xgRefill?.value === "yes";
        const xgRefillCost  = gf(el.xgRefillCost) || 1725000;
        const xgRefillTrains = Math.floor(energyCap / ePerTrain);
        const xgCdHrs       = xgCount >= 4 ? XAN_CD_MIN : XAN_CD_AVG;
        const xgFillHrs     = energyCap / natEPerHr;
        const xgMidCdTrains = Math.floor(energyCap / ePerTrain);
        const xgAtXanE      = Math.min(energyCap, (xgCdHrs - xgFillHrs) * natEPerHr);
        const xgCycleE      = xgAtXanE + 250;
        const xgCycleTrains = Math.floor(xgCycleE / ePerTrain);
        const xgHrsUsed     = xgCount * xgCdHrs;
        const xgRemainHrs   = Math.max(0, 24 - xgHrsUsed);
        const xgNatLeftoverE = Math.min(xgRemainHrs * natEPerHr, energyCap);
        const xgLeftoverTrains = Math.floor(xgNatLeftoverE / ePerTrain);
        let xgGainXan = 0, xgGainMid = 0, xgCur = statNow;
        for (let i = 0; i < xgCount; i++) {
            const mb = simulateBlock(dots, xgCur, propHappy, bonus, ePerTrain, consts, xgMidCdTrains, propHappy);
            xgGainMid += mb.totalGain; xgCur = mb.finalStat;
            const xb = simulateBlock(dots, xgCur, propHappy, bonus, ePerTrain, consts, xgCycleTrains, propHappy);
            xgGainXan += xb.totalGain; xgCur = xb.finalStat;
        }
        const xgGainRefill = xgUseRefill ? simulateBlock(dots, xgCur, propHappy, bonus, ePerTrain, consts, xgRefillTrains, propHappy).totalGain : 0;
        if (xgUseRefill) xgCur += xgGainRefill;
        const xgGainNat  = simulateBlock(dots, xgCur, propHappy, bonus, ePerTrain, consts, xgLeftoverTrains, propHappy).totalGain;
        const gainXG     = xgGainXan + xgGainMid + xgGainRefill + xgGainNat;
        const weeklyXG   = gainXG * 7;
        const costXG     = xgCount * xgCost + (xgUseRefill ? xgRefillCost : 0);

        // ── Goal projections ──────────────────────────────────────────────────
        let dJumps=0, dCur=statNow;
        while (dCur<statGoal && dJumps<MAX_ITER) {
            const _n = simulateBlock(dots,dCur,propHappy,bonus,ePerTrain,consts,dailyNatTrains,propHappy);
            dCur = _n.finalStat;
            if (dailyUseRefill) dCur += simulateBlock(dots,dCur,propHappy,bonus,ePerTrain,consts,dailyRefillTrains,propHappy).totalGain;
            dJumps++;
        }
        let jJumps=0, jCur=statNow;
        while (jCur<statGoal && jJumps<MAX_ITER) {
            const sb = simulateBlock(dots,jCur,jumpHappy,bonus,ePerTrain,consts,stackTrains);
            const fb = fhcCount>0 ? simulateBlock(dots,jCur+sb.totalGain,sb.finalHappy+fhcHappyBoost,bonus,ePerTrain,consts,fhcTrains) : {totalGain:0};
            jCur += sb.totalGain + fb.totalGain;
            if (useRefill) jCur += simulateBlock(dots,jCur,propHappy,bonus,ePerTrain,consts,Math.floor(energyCap/ePerTrain)).totalGain;
            jJumps++;
        }
        let xgDays=0, xgDayCur=statNow;
        while (xgDayCur<statGoal && xgDays<MAX_ITER) {
            let s=xgDayCur;
            for (let i=0; i<xgCount; i++) {
                s+=simulateBlock(dots,s,propHappy,bonus,ePerTrain,consts,xgMidCdTrains,propHappy).totalGain;
                s+=simulateBlock(dots,s,propHappy,bonus,ePerTrain,consts,xgCycleTrains,propHappy).totalGain;
            }
            if (xgUseRefill) s+=simulateBlock(dots,s,propHappy,bonus,ePerTrain,consts,xgRefillTrains,propHappy).totalGain;
            s+=simulateBlock(dots,s,propHappy,bonus,ePerTrain,consts,xgLeftoverTrains,propHappy).totalGain;
            xgDayCur=s; xgDays++;
        }
        const daysDaily = dJumps * (cycleDaily / 24);
        const daysJump  = jJumps * (cycleAvg / 24);
        // xgDays already in days

        // ── Build 3-column table ──────────────────────────────────────────────
        const best3 = (d, j, x, lowerBetter=false) => {
            const vals = [d, j, x];
            const best = lowerBetter ? Math.min(...vals.filter(v=>isFinite(v))) : Math.max(...vals.filter(v=>isFinite(v)));
            return vals.map(v => v === best && isFinite(v));
        };
        const cell = (text, win) => `<div class="gg-cmp-val${win?" win":" lose"}">${text}</div>`;
        const xgLabel = xgCount > 0 ? `💊 Xanax Grind (${xgCount}/day)` : "💊 Xanax Grind";

        let html = `<div class="gg-cmp">
  <div class="gg-cmp-title">⚖ Training Method Comparison — ${statLabel} at ${gym.name}</div>
  <div class="gg-cmp-grid">
    <div class="gg-cmp-hdr"></div>
    <div class="gg-cmp-hdr daily">📅 Daily<br>Grind</div>
    <div class="gg-cmp-hdr jump">⚡ Happy<br>Jump</div>
    <div class="gg-cmp-hdr" style="color:#bf9f7a">💊 Xanax<br>Grind</div>`;

        const rows_ = [
            { label:"Gain / session",   vals:[gainDaily, gainJump, gainXG],                fmt_:(v)=>`+${fmtD(v,1)}`,                  lower:false },
            { label:"Gain / week",      vals:[weeklyDaily, weeklyJump, weeklyXG],           fmt_:(v)=>`+${fmt(v)}`,                     lower:false },
            { label:"Cost / session",   vals:[dailyRefillCost, costTotal, costXG],          fmt_:(v)=>v===0?"free":`$${fmt(v)}`,        lower:true  },
            { label:"Sessions to goal", vals:[dJumps, jJumps, xgDays],                     fmt_:(v)=>v>=MAX_ITER?"∞":String(v),        lower:true  },
            { label:"Days to goal",     vals:[daysDaily, daysJump, xgDays],                 fmt_:(v)=>v>=MAX_ITER?"∞":`${fmtD(v,1)}d`, lower:true  },
        ];

        // Total cost to goal
        const totalCostDaily = dailyRefillCost * dJumps;
        const totalCostJump  = costTotal * jJumps;
        const totalCostXG    = costXG    * xgDays;
        rows_.push({ label:"Total cost to goal", vals:[totalCostDaily, totalCostJump, totalCostXG], fmt_:(v)=>v===0?"free":`$${fmt(v)}`, lower:true });

        // Cost per extra stat point — strips out the "free baseline" (daily nat regen)
        // and asks: for each $ spent, how much extra stat do you actually get?
        // Daily Grind has no "extra" — it's the baseline (or refill-only).
        // Jump and Xanax show price per stat point gained ABOVE the daily baseline.
        const remaining = Math.max(0, statGoal - statNow);
        const extraJump = Math.max(1, weeklyJump - weeklyDaily);   // weekly extra over daily
        const extraXG   = Math.max(1, weeklyXG   - weeklyDaily);
        // Cost per stat over the goal range — projects the weekly extra to the full remaining
        const costPerStatDaily = totalCostDaily > 0 && remaining > 0 ? totalCostDaily / remaining : 0;
        const costPerStatJump  = totalCostJump  > 0 && remaining > 0 ? totalCostJump  / remaining : Infinity;
        const costPerStatXG    = totalCostXG    > 0 && remaining > 0 ? totalCostXG    / remaining : Infinity;
        rows_.push({
            label:"$ / stat point",
            vals:[costPerStatDaily, costPerStatJump, costPerStatXG],
            fmt_:(v)=>v===0?"free":v===Infinity?"—":`$${fmtD(v,2)}`,
            lower:true
        });

        for (const {label, vals, fmt_, lower} of rows_) {
            const wins = best3(vals[0], vals[1], vals[2], lower);
            html += `<div class="gg-cmp-label">${label}</div>
    ${cell(fmt_(vals[0]), wins[0])}${cell(fmt_(vals[1]), wins[1])}${cell(fmt_(vals[2]), wins[2])}`;
        }
        html += `</div>`;

        // ── Verdict — factor in both speed AND cost ──────────────────────────
        const weekly      = [weeklyDaily, weeklyJump, weeklyXG];
        const totalCosts  = [totalCostDaily, totalCostJump, totalCostXG];
        const days        = [daysDaily, daysJump, xgDays];
        const names       = ["Daily Grind", "Happy Jump", "Xanax Grind"];
        const speedWinIdx = days.indexOf(Math.min(...days.filter(d => d < MAX_ITER)));
        const costWinIdx  = totalCosts.indexOf(Math.min(...totalCosts.filter((_,i) => days[i] < MAX_ITER)));
        const hasCosts    = totalCosts.some(c => c > 0);

        // Cost-efficiency: stat gained per $1M spent
        const efficiency = weekly.map((w, i) => {
            const dailyCostForMethod = totalCosts[i] / Math.max(days[i], 1);  // cost per day
            return dailyCostForMethod > 0 ? (w / (dailyCostForMethod / 1e6)) : Infinity; // stat/week per $1M/day
        });
        const effWinIdx = efficiency.indexOf(Math.max(...efficiency));

        let verdictLines = names.map((n, i) => {
            const dStr   = days[i] >= MAX_ITER ? "∞" : `${fmtD(days[i],1)}d`;
            const cStr   = totalCosts[i] > 0 ? ` · $${fmt(Math.round(totalCosts[i]))} total` : "";
            const wStr   = `${fmt(Math.round(weekly[i]))} ${statLabel}/week`;
            const badges = [];
            if (i === speedWinIdx) badges.push("⚡ fastest");
            if (i === costWinIdx && hasCosts)  badges.push("💰 cheapest");
            if (i === effWinIdx && hasCosts)   badges.push("📈 best value");
            const badgeStr = badges.length ? ` <span style="font-size:10px;opacity:.8">[${badges.join(", ")}]</span>` : "";
            return `<div style="padding:2px 0"><strong style="color:${i===speedWinIdx?"#7abf7a":i===costWinIdx&&hasCosts?"#bf9f7a":"#8899aa"}">${n}${badgeStr}</strong> — ${wStr} · ${dStr}${cStr}</div>`;
        }).join("");

        // Summary recommendation with crossover analysis
        let recommendation = "";
        if (speedWinIdx === costWinIdx || !hasCosts) {
            recommendation = `🏆 <strong>${names[speedWinIdx]}</strong> wins on all fronts.`;
        } else {
            const speedDays  = days[speedWinIdx];
            const cheapDays  = days[costWinIdx];
            const daysDiff   = (cheapDays - speedDays).toFixed(1);
            const costSaving = totalCosts[speedWinIdx] - totalCosts[costWinIdx];
            recommendation = `⚡ <strong>${names[speedWinIdx]}</strong> reaches goal ${daysDiff}d faster, but costs $${fmt(Math.round(costSaving))} more total. 💰 <strong>${names[costWinIdx]}</strong> is cheaper. Best value: <strong>${names[effWinIdx]}</strong>.`;
        }

        // Crossover advice — when does Happy Jump stop being worth it vs Xanax?
        // Compare $/stat: if Jump's $/stat is much higher than Xanax's, recommend switching
        let crossoverNote = "";
        if (costPerStatJump !== Infinity && costPerStatXG !== Infinity && costPerStatJump > 0 && costPerStatXG > 0) {
            const ratio = costPerStatJump / costPerStatXG;
            if (ratio > 3) {
                crossoverNote = `<div style="margin-top:6px;padding:6px 8px;background:#1a1408;border:1px solid #3a2818;border-radius:3px;font-size:11px;color:#bf9f5a">⚠ Jumps cost <strong>${ratio.toFixed(1)}×</strong> more per stat point than Xanax grinding. Consider switching to Xanax for cost efficiency unless you need fast results.</div>`;
            } else if (ratio < 1.5) {
                crossoverNote = `<div style="margin-top:6px;padding:6px 8px;background:#0a1a14;border:1px solid #1a3a28;border-radius:3px;font-size:11px;color:#7abf9a">✓ Jumps and Xanax are comparable cost-per-stat. Pick based on your time budget.</div>`;
            }
        }
        // Also flag when Daily catches up to paid methods (extra gain very small)
        if (weeklyDaily > 0 && weeklyJump > 0 && weeklyXG > 0) {
            const xgExtraPct = ((weeklyXG - weeklyDaily) / weeklyDaily) * 100;
            const jumpExtraPct = ((weeklyJump - weeklyDaily) / weeklyDaily) * 100;
            if (xgExtraPct < 30 && jumpExtraPct < 30) {
                crossoverNote += `<div style="margin-top:6px;padding:6px 8px;background:#0a1a14;border:1px solid #1a3a28;border-radius:3px;font-size:11px;color:#7abf9a">💡 Paid methods only add ~${xgExtraPct.toFixed(0)}% over free Daily Grind. Save your money — Daily is sufficient.</div>`;
            }
        }

        html += `<div class="gg-cmp-verdict">${verdictLines}<div style="margin-top:8px;padding-top:8px;border-top:1px solid #2a3a20;font-size:11px;color:#8abf7a">${recommendation}</div>${crossoverNote}</div>`;

        // ── 📋 Recommended Schedule — concrete jump-then-switch plan ──────────
        // Logic: simulate one jump at a time, comparing it to a typical Xanax day.
        // While jump gives ≥ THRESHOLD (default 150%) of an XG day's gain, do another jump.
        // Once below threshold, switch to Xanax for the remainder.
        // This gives the user a concrete plan: "do N jumps, then switch."
        const SWITCH_THRESHOLD = 1.5; // 150% — jumps must give 1.5× an XG day to be "worth it"

        // Only run plan if all three methods are viable (have positive gains and costs)
        if (gainJump > 0 && gainXG > 0 && remaining > 0 && costTotal > 0 && costXG > 0) {
            let planStat = statNow;
            let plannedJumps = 0;
            const maxPlanJumps = 50; // safety cap
            const jumpRatios = []; // track ratio of each jump for the breakdown

            // Step 1: do jumps while ratio >= threshold AND we haven't passed goal
            while (plannedJumps < maxPlanJumps && planStat < statGoal) {
                // Simulate a jump at current stat
                const sb = simulateBlock(dots, planStat, jumpHappy, bonus, ePerTrain, consts, stackTrains);
                const fb = fhcCount > 0
                    ? simulateBlock(dots, planStat + sb.totalGain, sb.finalHappy + fhcHappyBoost, bonus, ePerTrain, consts, fhcTrains)
                    : { totalGain: 0 };
                const rb = useRefill
                    ? simulateBlock(dots, planStat + sb.totalGain + fb.totalGain, propHappy, bonus, ePerTrain, consts, Math.floor(energyCap/ePerTrain))
                    : { totalGain: 0 };
                const thisJumpGain = sb.totalGain + fb.totalGain + rb.totalGain;

                // Simulate one Xanax day at the SAME starting stat for comparison
                let xgComp = planStat;
                for (let i = 0; i < xgCount; i++) {
                    xgComp += simulateBlock(dots, xgComp, propHappy, bonus, ePerTrain, consts, xgMidCdTrains, propHappy).totalGain;
                    xgComp += simulateBlock(dots, xgComp, propHappy, bonus, ePerTrain, consts, xgCycleTrains, propHappy).totalGain;
                }
                if (xgUseRefill) xgComp += simulateBlock(dots, xgComp, propHappy, bonus, ePerTrain, consts, xgRefillTrains, propHappy).totalGain;
                xgComp += simulateBlock(dots, xgComp, propHappy, bonus, ePerTrain, consts, xgLeftoverTrains, propHappy).totalGain;
                const xgDayGainAtStat = xgComp - planStat;

                const ratio = xgDayGainAtStat > 0 ? thisJumpGain / xgDayGainAtStat : Infinity;

                if (ratio < SWITCH_THRESHOLD) break; // switch to XG
                jumpRatios.push({ jumpNum: plannedJumps + 1, atStat: planStat, gain: thisJumpGain, ratio });
                planStat += thisJumpGain;
                plannedJumps++;
            }

            // Step 2: finish with Xanax grind
            const remainingForXG = Math.max(0, statGoal - planStat);
            let xgDaysNeeded = 0;
            if (remainingForXG > 0) {
                let xgFinishCur = planStat;
                while (xgFinishCur < statGoal && xgDaysNeeded < MAX_ITER) {
                    let s = xgFinishCur;
                    for (let i = 0; i < xgCount; i++) {
                        s += simulateBlock(dots, s, propHappy, bonus, ePerTrain, consts, xgMidCdTrains, propHappy).totalGain;
                        s += simulateBlock(dots, s, propHappy, bonus, ePerTrain, consts, xgCycleTrains, propHappy).totalGain;
                    }
                    if (xgUseRefill) s += simulateBlock(dots, s, propHappy, bonus, ePerTrain, consts, xgRefillTrains, propHappy).totalGain;
                    s += simulateBlock(dots, s, propHappy, bonus, ePerTrain, consts, xgLeftoverTrains, propHappy).totalGain;
                    xgFinishCur = s;
                    xgDaysNeeded++;
                }
            }

            const jumpHrs        = plannedJumps * cycleAvg;
            const totalDays      = jumpHrs/24 + xgDaysNeeded;
            const planJumpCost   = plannedJumps * costTotal;
            const planXGCost     = xgDaysNeeded * costXG;
            const planTotalCost  = planJumpCost + planXGCost;
            const altAllJumpCost = jJumps < MAX_ITER ? jJumps * costTotal : null;
            const altAllXGCost   = xgDays < MAX_ITER ? xgDays * costXG : null;

            const fmtMoney = v => v >= 1e9 ? `$${(v/1e9).toFixed(2)}b` : v >= 1e6 ? `$${(v/1e6).toFixed(1)}m` : `$${fmt(v)}`;

            // Build the schedule HTML
            html += `
<div style="margin-top:14px;padding:12px;background:#10181c;border:1px solid #2a3a48;border-radius:6px">
    <div style="font-size:13px;font-weight:bold;color:#9accbf;margin-bottom:8px">📋 Recommended Schedule</div>
    <div style="font-size:11px;color:#667;margin-bottom:10px;line-height:1.5">
        Jump while each jump gives at least 150% of a Xanax day's gain. Switch when the ratio drops below.
    </div>`;

            if (plannedJumps === 0) {
                html += `<div style="font-size:12px;color:#bf9f5a;padding:6px 8px;background:#1a1408;border-radius:3px">
                    ⚠ <strong>Skip jumps entirely.</strong> Even your first jump only gives ${jumpRatios.length === 0
                        ? "less than"
                        : `${(jumpRatios[0]?.ratio || 0).toFixed(2)}×`} a Xanax day's gain at your stat — not worth the cost.<br>
                    <span style="color:#9a8f6a">→ Just do <strong>${xgDaysNeeded} days of Xanax grind</strong> (${fmtMoney(planXGCost)} total).</span>
                </div>`;
            } else if (xgDaysNeeded === 0) {
                html += `<div style="font-size:12px;color:#7abf9a;padding:6px 8px;background:#0a1a14;border-radius:3px">
                    ✓ <strong>Do all ${plannedJumps} jumps.</strong> Each one gives more than 150% of a Xanax day — keep jumping until you hit the goal.<br>
                    <span style="color:#5a9a7a">→ Total: ${plannedJumps} jumps · ${fmtMoney(planTotalCost)}</span>
                </div>`;
            } else {
                // The interesting case: hybrid plan
                const lastJumpRatio = jumpRatios[jumpRatios.length - 1]?.ratio || 0;
                const switchStat = planStat;
                html += `<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:12px;align-items:baseline;margin-bottom:8px">
                    <div style="color:#bf9f5a;font-weight:bold">Phase 1</div>
                    <div style="color:#aab"><strong style="color:#bf9f5a">⚡ Do ${plannedJumps} happy jump${plannedJumps>1?"s":""}</strong> — until your stat reaches ~${fmt(Math.round(switchStat))}</div>
                    <div style="color:#778;font-size:10px"></div>
                    <div style="color:#778;font-size:10px">Last jump ratio: ${lastJumpRatio.toFixed(2)}× (${plannedJumps * cycleAvg / 24 < 1 ? `${Math.round(plannedJumps*cycleAvg)}h` : `${(plannedJumps*cycleAvg/24).toFixed(1)}d`} · ${fmtMoney(planJumpCost)})</div>
                    <div style="color:#7a9abf;font-weight:bold">Phase 2</div>
                    <div style="color:#aab"><strong style="color:#7a9abf">💊 Switch to Xanax grind</strong> for the remaining ${fmt(Math.round(statGoal - switchStat))} stat</div>
                    <div style="color:#778;font-size:10px"></div>
                    <div style="color:#778;font-size:10px">${xgDaysNeeded} days · ${fmtMoney(planXGCost)}</div>
                </div>`;
                html += `<div style="font-size:11px;padding:6px 8px;background:#0a1418;border-top:1px solid #2a3a48">
                    <span style="color:#9accbf;font-weight:bold">Total: ${totalDays.toFixed(1)} days · ${fmtMoney(planTotalCost)}</span>`;
                if (altAllJumpCost && altAllJumpCost > planTotalCost) {
                    const saving = altAllJumpCost - planTotalCost;
                    html += `<span style="color:#5a9a7a"> · saves ${fmtMoney(saving)} vs all jumps</span>`;
                }
                html += `</div>`;
            }

            // Per-jump breakdown (collapsed by default)
            if (jumpRatios.length > 0) {
                html += `<details style="margin-top:8px;font-size:11px;color:#778">
                    <summary style="cursor:pointer;padding:4px 0;color:#8a9aab">Show per-jump breakdown</summary>
                    <div style="display:grid;grid-template-columns:auto auto auto auto;gap:2px 10px;margin-top:6px;font-family:monospace;font-size:10px">
                        <div style="color:#445">Jump</div><div style="color:#445">At stat</div><div style="color:#445">Gain</div><div style="color:#445">Ratio</div>
                        ${jumpRatios.map(r => {
                            const col = r.ratio >= 2 ? "#7abf9a" : r.ratio >= 1.5 ? "#bf9f5a" : "#bf7a5a";
                            return `<div style="color:#778">#${r.jumpNum}</div><div style="color:#aab">${fmt(Math.round(r.atStat))}</div><div style="color:#aab">+${fmt(Math.round(r.gain))}</div><div style="color:${col}">${r.ratio.toFixed(2)}×</div>`;
                        }).join("")}
                    </div>
                </details>`;
            }

            html += `</div>`;
        }

        html += `</div>`;

        el.compareResults.innerHTML  = html;
        el.compareResults.style.display = "";
        el.dailyResults.style.display   = "none";
        el.jumpResults.style.display    = "none";
        el.copy.style.display           = "inline-block";
        el._lastResults = html;
    }


    // ─────────────────────────────────────────────────────────────────────────
    // XANAX GRIND
    // Natural regen + N xanax/day each used at cap energy.
    // No happy boosters — just property max happy throughout.
    // ─────────────────────────────────────────────────────────────────────────
    function calculateXanaxGrind() {
        const gym = getGymData();
        if (!gym) throw new Error("Invalid gym selection.");
        const stat = el.stat.value;
        const dots = gym[STAT_KEYS[stat]];
        if (!dots) throw new Error(`${gym.name} does not train ${STAT_LABELS[stat]}.`);

        const consts    = STAT_CONSTS[stat];
        const propHappy = gf(el.happy);
        const bonus     = calcBonus(stat);
        const statNow   = gf(el.statTotal);
        const statGoal  = gf(el.statGoal) || statNow;
        const ePerTrain = gym.energy;
        const sub       = el.subscriber.value;
        const energyCap = E_CAP[sub];
        const natEPerHr = NATURAL_E[sub];
        const natEPerDay= natEPerHr * 24;

        // Xanax config from xg- inputs
        const xanCount    = gi(el.xgXanaxCount);   // xanax per day
        const xanCost     = gf(el.xgXanaxCost);    // $ per xanax
        const useRefill   = el.xgRefill?.value === "yes";
        const refillCost  = gf(el.xgRefillCost) || 1725000;
        const refillTrains = Math.floor(energyCap / ePerTrain);

        // ── Time-simulation model ─────────────────────────────────────────────
        // Subscriber fills 150E in exactly 5h (30E/hr). Xanax CD averages 7h.
        // Each Xanax cycle actually contains TWO training opportunities:
        //   1. At t=0: train whatever E has regened since last train + 250E Xanax
        //   2. At t=5h: energy cap full again — train 150E (nat train mid-CD)
        //   3. At t=7h: CD over → take next Xanax, repeat
        //
        // So 3 Xanax/day = 3 Xanax bursts + 3 mid-CD nat trains
        // Then remaining hours after 3×7=21h → 3h left, 3×30=90E, not enough for a train
        //
        // For N Xanax/day, mid-CD nat trains = N (one per cycle) provided
        // energyFillHours (5h) < cdHours (7h) — which is always true for subscribers.
        // Non-subscribers fill in 100/20 = 5h too, same situation.

        // CD averages 7h (6-8h range). With 4 xanax/day the CD MUST be 6h flat
        // (4×6=24), so use min CD for that case. Otherwise use average.
        const xanCdHrs      = xanCount >= 4 ? XAN_CD_MIN : XAN_CD_AVG;
        const fillHrs       = energyCap / natEPerHr;  // 5h to fill cap (150/30 or 100/20)
        const midCdNatE     = energyCap;              // always fills fully between xanax
        const midCdTrains   = Math.floor(midCdNatE / ePerTrain);

        // At each Xanax moment: energy has regened for (cdHours - fillHours) = 2h after
        // the mid-CD train, so at Xanax time there's (cdHrs - fillHrs) × natEPerHr E built up
        const atXanE        = Math.min(energyCap, (xanCdHrs - fillHrs) * natEPerHr); // 2h × 30 = 60E
        const xanBurstE     = atXanE + 250;           // 60 + 250 = 310E per Xanax cycle
        const xanTrains     = Math.floor(xanBurstE / ePerTrain);

        // Hours used by N complete Xanax cycles
        const xanHrsUsed    = xanCount * xanCdHrs;   // 3 × 7 = 21h, or 4 × 6 = 24h
        const remainHrs     = Math.max(0, 24 - xanHrsUsed); // 3h or 0h
        // Remaining nat regen after all Xanax cycles (likely partial, < cap)
        const leftoverE     = Math.min(energyCap, remainHrs * natEPerHr); // 90E or 0E
        const leftoverTrains= Math.floor(leftoverE / ePerTrain);

        // Total daily energy breakdown for display
        const totalXanE     = xanCount * xanBurstE;
        const totalMidCdE   = xanCount * midCdNatE;
        const totalDailyE   = totalXanE + totalMidCdE + leftoverE + (useRefill ? energyCap : 0);

        // ── Simulate one full day ─────────────────────────────────────────────
        // For each Xanax: first train mid-CD nat (150E), then train Xanax burst
        let cur = statNow, xanGainTotal = 0, midCdGainTotal = 0;
        for (let i = 0; i < xanCount; i++) {
            // Mid-CD nat train (energy filled while waiting for CD)
            const midB = simulateBlock(dots, cur, propHappy, bonus, ePerTrain, consts, midCdTrains, propHappy);
            midCdGainTotal += midB.totalGain;
            cur = midB.finalStat;
            // Xanax burst (partial regen + 250E drug)
            const xanB = simulateBlock(dots, cur, propHappy, bonus, ePerTrain, consts, xanTrains, propHappy);
            xanGainTotal += xanB.totalGain;
            cur = xanB.finalStat;
        }
        // Points refill (once/day)
        const refillBlock = useRefill
            ? simulateBlock(dots, cur, propHappy, bonus, ePerTrain, consts, refillTrains, propHappy)
            : { totalGain: 0, finalStat: cur };
        if (useRefill) cur = refillBlock.finalStat;
        // Leftover nat regen after all Xanax cycles
        const natBlock   = simulateBlock(dots, cur, propHappy, bonus, ePerTrain, consts, leftoverTrains, propHappy);
        const dayGain    = xanGainTotal + midCdGainTotal + refillBlock.totalGain + natBlock.totalGain;

        // Cost per day
        const dailyCost  = xanCount * xanCost + (useRefill ? refillCost : 0);

        // ── Goal projection ───────────────────────────────────────────────────
        let gcur = statNow, gdays = 0;
        while (gcur < statGoal && gdays < MAX_ITER) {
            let s = gcur;
            for (let i = 0; i < xanCount; i++) {
                s += simulateBlock(dots, s, propHappy, bonus, ePerTrain, consts, midCdTrains, propHappy).totalGain;
                s += simulateBlock(dots, s, propHappy, bonus, ePerTrain, consts, xanTrains, propHappy).totalGain;
            }
            if (useRefill) s += simulateBlock(dots, s, propHappy, bonus, ePerTrain, consts, refillTrains, propHappy).totalGain;
            s += simulateBlock(dots, s, propHappy, bonus, ePerTrain, consts, leftoverTrains, propHappy).totalGain;
            gcur = s;
            gdays++;
        }
        const goalUnreach = gdays >= MAX_ITER;
        const totalCost   = dailyCost * gdays;

        // ── Xanax CD check ────────────────────────────────────────────────────
        // Xanax CD is 6–8h random. Max possible = 4/day at exactly 6h CD each (4×6=24h)
        const cdWarning   = xanCount === 4;

        // ── Per-train baseline (natural happy, natural energy) ─────────────────
        const singleGain  = calcGain(dots, statNow, propHappy, bonus, ePerTrain, consts);

        const gymName = gym.name;
        const statLabel = STAT_LABELS[stat];

        let html = `<div class="gg-tldr">
  <div class="gg-tldr-title">💊 Xanax Grind — ${statLabel} at ${gymName}</div>
  <div class="gg-tldr-grid">
    <div class="gg-tldr-cell"><div class="gg-tldr-val">+${fmt(dayGain)}</div><div class="gg-tldr-lbl">gain / day</div></div>
    <div class="gg-tldr-cell"><div class="gg-tldr-val">${xanCount}× xanax</div><div class="gg-tldr-lbl">+ natural regen</div></div>
    <div class="gg-tldr-cell"><div class="gg-tldr-val">${goalUnreach?"∞":`~${gdays}d`}</div><div class="gg-tldr-lbl">days to goal</div></div>
    <div class="gg-tldr-cell"><div class="gg-tldr-val">${goalUnreach?"—":dateIn(gdays)}</div><div class="gg-tldr-lbl">done by</div></div>
  </div>
</div>`;

        if (cdWarning) {
            html += `<div style="padding:8px 10px;background:#201a08;border:1px solid #4a3a10;border-radius:4px;font-size:11px;color:#bf9f5a;margin-bottom:8px">
  ⚠ 4 xanax/day requires back-to-back 6h CDs with no slack — only achievable on a perfect day. Most players reliably fit 3/day.
</div>`;
        }

        html += rsec("Your Setup");
        html += row("Gym / Stat",    `${gymName} — ${statLabel} (${ePerTrain}E/train)`);
        html += row("Happy",         `${fmt(propHappy)} — property max, used throughout`);
        html += row("Total bonus",   `${((bonus-1)*100).toFixed(1)}% from all perks combined`);
        html += row("Per train",     `~${fmtD(singleGain,2)} ${statLabel} at this happy`, "hi");

        html += rsec(`Each Xanax Cycle — ×${xanCount}/day`);
        html += row("How it works",      `Energy fills to ${energyCap}E in ${fillHrs.toFixed(0)}h — train that, then wait ${(xanCdHrs-fillHrs).toFixed(0)}h more for CD`);
        html += row("Mid-CD nat train",  `${midCdNatE}E ÷ ${ePerTrain}E = ${midCdTrains} trains (energy full while waiting for CD)`);
        html += row("Xanax burst",       `${atXanE.toFixed(0)}E regen (${(xanCdHrs-fillHrs).toFixed(0)}h × ${natEPerHr}E/hr) + 250E = ${xanBurstE.toFixed(0)}E = ${xanTrains} trains`);
        html += row("Gain per cycle",    `+${fmtD((xanGainTotal + midCdGainTotal) / Math.max(1,xanCount), 0)} ${statLabel} avg (nat + xanax)`, "hi");
        html += row("Total from xanax cycles", `+${fmt(xanGainTotal + midCdGainTotal)} ${statLabel}/day`, "hi");
        if (xanCost > 0) html += row("Xanax cost",  `$${fmt(xanCost)} × ${xanCount} = $${fmt(xanCount*xanCost)}/day`, "b");

        if (useRefill) {
            html += rsec("Points Refill");
            html += row("Refill trains", `${energyCap}E ÷ ${ePerTrain}E = ${refillTrains} trains at ${fmt(propHappy)} happy`);
            html += row("Gain",          `+${fmt(refillBlock.totalGain)} ${statLabel}`, "hi");
            html += row("Cost",          `$${fmt(refillCost)}/day`, "b");
        }

        html += rsec("Leftover Regen");
        html += row("After ${xanCount} cycles", `24h − ${xanHrsUsed}h = ${remainHrs}h → ${leftoverE.toFixed(0)}E → ${leftoverTrains} trains`);
        html += row("Gain",            `+${fmt(natBlock.totalGain)} ${statLabel}`, "hi");

        html += rsec("Daily Total");
        html += row("Energy breakdown", `${xanCount}×(${midCdNatE}E nat + ${xanBurstE.toFixed(0)}E xanax) + ${leftoverE.toFixed(0)}E leftover${useRefill?` + ${energyCap}E refill`:""} = ${totalDailyE.toFixed(0)}E`);
        html += row("Total gain/day",   `+${fmt(dayGain)} ${statLabel}`, "hi");
        if (dailyCost > 0) {
            const costBreakdown = [
                xanCount > 0 && xanCost > 0 ? `${xanCount}× xanax $${fmt(xanCount*xanCost)}` : null,
                useRefill ? `refill $${fmt(refillCost)}` : null,
            ].filter(Boolean).join(' + ');
            html += row("Cost/day", `$${fmt(dailyCost)}${costBreakdown ? ` (${costBreakdown})` : ""}`, "b");
        }

        html += rsec("Reaching Your Goal");
        if (goalUnreach) {
            html += row("⚠ Unreachable", "Gains are too small vs your goal at this happy level", "a");
        } else {
            html += row("Days needed",  `~${gdays} days`, "g");
            html += row("Finish date",  dateIn(gdays), "g");
            if (totalCost > 0) html += row("Total xanax spend", `$${fmt(totalCost)} over ${gdays} days`, "b");
        }

        el.dailyResults.innerHTML     = html;
        el.dailyResults.style.display = "";
        el.jumpResults.style.display  = "none";
        el.compareResults.style.display = "none";
        el.copy.style.display         = "inline-block";
        el._lastResults               = html;
    }


    function calculateSession() {
        // "This Session" — what do I get RIGHT NOW with what I have?
        try {
            el.compareResults.style.display = "none";

            const stat     = el.stat.value;
            const statNow  = gi(el.statTotal);
            const statGoal = gi(el.statGoal);
            const propH    = gf(el.happy) || 5025;
            const gym      = GYMS.find(g => String(g.id) === String(el.gym.value));
            const statKey  = STAT_KEYS[stat];
            const dots     = (statKey && gym?.[statKey]) || 5.0;
            const ePerTrain= gym?.energy || 10;
            const bonus    = calcBonus(stat);
            const consts   = STAT_CONSTS[stat] || STAT_CONSTS.speed;
            const sub      = el.subscriber.value;

            if (!statNow) { showStatus("warn", "Enter your current stat first."); return; }
            if (!gym)     { showStatus("warn", "Select your gym first."); return; }

            // Session energy = current E + drug + refill
            const baseE    = gi(el.energy) || 0;
            const drug     = el.sessionDrug?.value || "none";
            const drugE    = drug === "xanax" ? 250 : drug === "lsd" ? 50 : 0;
            const hasRefill= el.sessionRefill?.value === "yes";
            const refillE  = hasRefill ? (sub === "yes" ? 150 : 100) : 0;
            const totalE   = baseE + drugE + refillE;

            if (totalE <= 0) { showStatus("warn", "Enter your current energy (or pick a drug/refill)."); return; }

            // Happy — use field if filled, else property max
            const rawH     = gf(el.sessionHappy);
            const startH   = rawH > 0 ? rawH : propH;
            const numTrains= Math.floor(totalE / ePerTrain);
            const block    = simulateBlock(dots, statNow, startH, bonus, ePerTrain, consts, numTrains, propH);

            // Goal progress
            const remaining = statGoal > statNow ? statGoal - statNow : 0;
            const pctDone   = statGoal > 0 ? Math.min(100, (statNow / statGoal * 100)).toFixed(1) : "?";
            const pctAfter  = statGoal > 0 ? Math.min(100, (block.finalStat / statGoal * 100)).toFixed(1) : "?";
            const pctOfGoal = remaining > 0 ? (block.totalGain / remaining * 100).toFixed(1) : "100";

            // Estimate sessions to goal from here (using this session type)
            let sessionsLeft = 0;
            if (statGoal > statNow && totalE > 0) {
                let cur = statNow;
                const MAX = 5000;
                while (cur < statGoal && sessionsLeft < MAX) {
                    cur += simulateBlock(dots, cur, startH, bonus, ePerTrain, consts, numTrains, propH).totalGain;
                    sessionsLeft++;
                }
                if (sessionsLeft >= MAX) sessionsLeft = null; // unreachable
            }

            const gymName = gym?.name || "?";
            const statLabel = STAT_LABELS[stat];
            const fmtE = e => e > 0 ? `+${e}E` : "";

            // Energy breakdown line
            const parts = [];
            if (baseE > 0) parts.push(`${baseE}E current`);
            if (drugE > 0) parts.push(`${fmtE(drugE)} ${drug}`);
            if (refillE > 0) parts.push(`${fmtE(refillE)} refill`);
            const eLine = parts.join(" + ");

            const html = `
<div class="gg-tldr">
  <div class="gg-tldr-title">⚡ This Session — ${statLabel} at ${gymName}</div>
  <div class="gg-tldr-grid">
    <div class="gg-tldr-cell">
      <div class="gg-tldr-val">+${fmt(Math.round(block.totalGain))}</div>
      <div class="gg-tldr-lbl">${statLabel} gained</div>
    </div>
    <div class="gg-tldr-cell">
      <div class="gg-tldr-val">${numTrains} trains</div>
      <div class="gg-tldr-lbl">${totalE}E total</div>
    </div>
    <div class="gg-tldr-cell">
      <div class="gg-tldr-val">${pctAfter}%</div>
      <div class="gg-tldr-lbl">of goal after</div>
    </div>
    <div class="gg-tldr-cell">
      <div class="gg-tldr-val">${sessionsLeft == null ? "∞" : sessionsLeft > 999 ? "999+" : sessionsLeft}</div>
      <div class="gg-tldr-lbl">sessions like this left</div>
    </div>
  </div>
</div>
${rsec("Energy breakdown")}
${row("Using", eLine || `${totalE}E`)}
${row("Per train", `~${fmtD(calcGain(dots,statNow,startH,bonus,ePerTrain,consts),1)} ${statLabel}`)}
${row("Starting happy", fmt(startH) + (rawH > 0 ? "" : " (property max)"))}
${rsec("Your goal")}
${row("Current", `${fmt(statNow)} — ${pctDone}% of goal`)}
${row("After session", `${fmt(Math.round(block.finalStat))} — ${pctAfter}% of goal`, "g")}
${row("This session = ", `${pctOfGoal}% of remaining ${fmt(remaining)}`, "hi")}
${statGoal > 0 && sessionsLeft != null ? row("Sessions left", `~${sessionsLeft} more sessions like this`, "") : ""}
${rsec("Quick tip")}
${row("💡", drugE === 0 && baseE <= 150 ? "No drug CD? Xanax adds +250E and roughly doubles this session's gain." : drug === "xanax" ? "Good — Xanax gives the best gain per session. Stack with a Points Refill for even more." : "Use 📋 Plan ahead to project your full training schedule.")}
`;
            el.dailyResults.innerHTML = html;
            el.dailyResults.style.display = "";
            el.jumpResults.style.display = "none";
        } catch(e) {
            showStatus("warn", "✗ " + e.message);
        }
    }

    function copyResults() {
        const text = (el._lastResults||"")
            .replace(/<div class="gg-rsec">([^<]+)<\/div>/g, "\n── $1 ──")
            .replace(/<div class="gg-row[^"]*"><span class="gg-rl">([^<]+)<\/span><span class="gg-rv">([^<]+)<\/span><\/div>/g, "$1: $2")
            .replace(/<[^>]+>/g,"").trim();
        navigator.clipboard.writeText(text)
            .then(()=>showStatus("ok","✓ Copied."))
            .catch(()=>showStatus("warn","⚠ Copy failed."));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────────────────
    // GAINS LOGGER v2
    // Clean schema per entry:
    //   { ts, stat, gymName, gymId, gymDots, ePerTrain,
    //     preStat, happy, propHappy, energyUsed, actualGain, bonus, auto }
    // TTL: 30 days. No compression, no legacy compat cruft.
    // ─────────────────────────────────────────────────────────────────────────
    const LOG_KEY = "gainsLog_v2";
    const LOG_TTL = 30 * 24 * 60 * 60 * 1000;

    function logLoad()          { try { return JSON.parse(_load(LOG_KEY,"[]")); } catch(_){ return []; } }
    function logSave(e)         { _save(LOG_KEY, JSON.stringify(e)); }
    function logPrune(entries)  { const cut=Date.now()-LOG_TTL; return entries.filter(e=>e.ts>cut); }

    // Predict gain for one entry at a given dots value
    function predictEntry(e, dots) {
        const consts = STAT_CONSTS[e.stat] || STAT_CONSTS.speed;
        const trains = Math.round((e.energyUsed||e.ePerTrain||10) / (e.ePerTrain||10));
        return simulateBlock(dots, e.preStat, e.happy, e.bonus||1, e.ePerTrain||10, consts, trains, e.propHappy||0).totalGain;
    }

    // Golden-section search for best-fit dots value
    function calibrateDots(entries) {
        if (entries.length < 2) return null;
        const loss = d => entries.reduce((s,e) => { const diff=predictEntry(e,d)-e.actualGain; return s+diff*diff; }, 0);
        const phi = (Math.sqrt(5)-1)/2;
        let a=1.0, b=9.5, c=b-phi*(b-a), dd=a+phi*(b-a);
        for (let i=0; i<100; i++) {
            if (loss(c)<loss(dd)) b=dd; else a=c;
            c=b-phi*(b-a); dd=a+phi*(b-a);
            if (Math.abs(b-a)<0.001) break;
        }
        const bestDots = (a+b)/2;
        const meanA = entries.reduce((s,e)=>s+e.actualGain,0)/entries.length;
        const ssTot = entries.reduce((s,e)=>s+Math.pow(e.actualGain-meanA,2),0);
        const ssRes = entries.reduce((s,e)=>s+Math.pow(predictEntry(e,bestDots)-e.actualGain,2),0);
        const r2   = ssTot>0 ? 1-ssRes/ssTot : 1;
        const rmse = Math.sqrt(ssRes/entries.length);
        return { dots: Math.round(bestDots*100)/100, r2, rmse };
    }

    function renderLogger() {
        const all    = logPrune(logLoad());
        logSave(all);
        const badge  = q("#gg-logger-badge");
        if (badge) badge.textContent = all.length ? `${all.length} entries` : "";

        const entEl = q("#gg-log-entries");
        const calEl = q("#gg-log-calibration");
        if (!entEl) return;

        if (!all.length) {
            entEl.innerHTML = `<div style="font-size:11px;color:#445;padding:6px 0">No entries yet — auto-log is watching for train results.</div>`;
            if (calEl) calEl.innerHTML = "";
            return;
        }

        // ── Table ────────────────────────────────────────────────────────────
        // Two-line layout per entry — fits mobile without horizontal scroll:
        //   Line 1: age/source · stat · energyE · happy
        //   Line 2: Actual: X  vs  Pred: Y  →  diff (+Z%)
        let tableRows = "";
        for (let i = all.length-1; i >= 0; i--) {
            const e      = all[i];
            const pred   = predictEntry(e, e.gymDots);
            const diff   = e.actualGain - pred;
            const errPct = pred > 0 ? (diff / pred * 100) : 0;
            const isOutlier = Math.abs(errPct) > OUTLIER_THRESHOLD * 100;
            const errCol = isOutlier ? "#bf5a3a" : Math.abs(errPct) > 10 ? "#bf7a3a" : Math.abs(errPct) > 5 ? "#9a9a4a" : "#5a9f5a";
            const diffStr = `${diff >= 0 ? "+" : ""}${fmt(Math.round(diff))} (${errPct >= 0 ? "+" : ""}${errPct.toFixed(1)}%)`;
            const age    = Math.round((Date.now()-e.ts)/3600000);
            const ageS   = age < 1 ? "now" : age < 24 ? `${age}h` : `${Math.round(age/24)}d`;
            const srcDot = e.auto
                ? `<span style="color:#3a6a3a;font-size:10px" title="auto-logged">●</span>`
                : `<span style="color:#556;font-size:10px" title="manual">M</span>`;
            const statLabel = (e.stat||"").slice(0,3).toUpperCase();
            const rowBg = i % 2 === 0 ? "#191919" : "#161616";

            // Outlier warning — likely a partial jump log (energy understated)
            const outlierBanner = isOutlier ? `
  <div style="margin:3px 0;padding:3px 6px;background:#2a1a10;border:1px solid #5a3020;border-radius:3px;font-size:10px;color:#bf7a4a">
    ⚠ Likely bad log — gain vs energy mismatch (+${errPct.toFixed(0)}% off). Probably a jump session where only the last train was captured. Delete this entry.
  </div>` : "";

            const sessLabel = {
                "jump-full":"🎉jump", "jump-partial":"⚡jump",
                "xanax-stack":"💊stack", "xanax-burst":"💊xan",
                "refill-or-cap":"🔋full", "regen":"🌿regen", "small":"↳tail"
            }[e.sessionType] || "";
            const sessTag = sessLabel
                ? `<span style="color:#5a6a8a;font-size:9px;background:#161a22;padding:1px 4px;border-radius:2px">${sessLabel}</span>`
                : "";

            tableRows += `
<div style="padding:6px 8px;background:${rowBg};border-bottom:1px solid ${isOutlier?"#3a2010":"#1e1e2a"}">
  <!-- Row 1: meta -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
    <div style="display:flex;gap:6px;align-items:center;font-size:10px;flex-wrap:wrap">
      ${srcDot}
      <span style="color:#445">${ageS}</span>
      <span style="color:#6a8a6a;font-weight:bold">${statLabel}</span>
      <span style="color:#445">${e.energyUsed||"?"}E</span>
      <span style="color:#445">😊${fmt(e.happy||0)}</span>
      ${sessTag}
    </div>
    <button data-idx="${i}" class="gg-log-del" style="background:none;border:none;color:#553;cursor:pointer;font-size:14px;padding:0 4px;line-height:1">✕</button>
  </div>
  ${outlierBanner}
  <!-- Row 2: actual vs predicted -->
  <div style="display:flex;align-items:baseline;gap:0;font-family:monospace;font-size:12px;flex-wrap:wrap;gap:4px">
    <span style="color:#888;font-size:10px">Actual</span>
    <span style="color:#c8e6c8;font-weight:bold">+${fmt(e.actualGain)}</span>
    <span style="color:#334;font-size:11px">vs</span>
    <span style="color:#888;font-size:10px">Pred</span>
    <span style="color:#7a8a9a">+${fmt(Math.round(pred))}</span>
    <span style="color:#334;font-size:11px">→</span>
    <span style="color:${errCol};font-weight:bold">${diffStr}</span>
  </div>
</div>`;
        }

        entEl.innerHTML = `
<div style="margin-bottom:4px;font-size:9px;color:#334">● auto &nbsp; M manual &nbsp; diff = actual − predicted</div>
<div style="border:1px solid #252535;border-radius:4px;overflow:hidden;margin-bottom:8px">${tableRows}</div>`;

        entEl.querySelectorAll(".gg-log-del").forEach(btn => {
            btn.addEventListener("click", () => {
                const entries = logLoad();
                entries.splice(parseInt(btn.dataset.idx), 1);
                logSave(entries);
                renderLogger();
            });
        });

        // ── Calibration ───────────────────────────────────────────────────────
        if (!calEl) return;
        if (all.length < 2) {
            calEl.innerHTML = `<div style="font-size:11px;color:#445;padding:4px 0">Log 2+ entries to calibrate gym dots.</div>`;
            return;
        }

        // Exclude outlier entries (>OUTLIER_THRESHOLD error) from calibration —
        // these are bad logs (e.g. partial jump captures with wrong energy)
        const validEntries = all.filter(e => {
            const p = predictEntry(e, e.gymDots);
            return p > 0 && Math.abs((e.actualGain - p) / p) < OUTLIER_THRESHOLD;
        });
        const outlierCount = all.length - validEntries.length;

        if (validEntries.length < 2) {
            calEl.innerHTML = `<div style="font-size:11px;color:#7a5a3a;padding:4px 0">⚠ Need 2+ valid entries to calibrate. ${outlierCount} entr${outlierCount===1?"y":"ies"} excluded as outlier${outlierCount===1?"":"s"} (>50% error). Delete bad logs from the list above.</div>`;
            return;
        }

        const cal = calibrateDots(validEntries);
        if (!cal) return;
        const currentDots = getGymData()?.[STAT_KEYS[el.stat?.value]] ?? "?";
        const dotsMatch   = Math.abs(cal.dots - parseFloat(currentDots)) < 0.15;
        const conf        = validEntries.length >= 5 ? "High" : validEntries.length >= 3 ? "Medium" : "Low";
        const confCol     = validEntries.length >= 5 ? "#4a9a4a" : validEntries.length >= 3 ? "#9a9a4a" : "#9a7a3a";

        calEl.innerHTML = `
<div style="padding:10px;background:#141a14;border:1px solid #253025;border-radius:4px;margin-top:4px">
  <div style="font-size:10px;color:#4a7a4a;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Calibrated Gym Dots</div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
    <div>
      <span style="font-size:22px;font-weight:bold;color:#7abf7a">${cal.dots}</span>
      <span style="font-size:11px;color:#556;margin-left:8px">vs API: ${currentDots} ${dotsMatch?"✓":"⚠ differs"}</span>
    </div>
    <div style="text-align:right;font-size:11px;color:#556;line-height:1.6">
      <div>R² ${(cal.r2*100).toFixed(1)}%</div>
      <div>RMSE ±${fmt(Math.round(cal.rmse))}</div>
      <div style="color:${confCol}">${conf} (${validEntries.length} valid entries)</div>
    </div>
  </div>
  ${outlierCount > 0 ? `<div style="font-size:10px;color:#7a5a3a;margin-bottom:6px">⚠ ${outlierCount} outlier${outlierCount>1?"s":""} excluded from calibration (>50% error — likely bad jump logs). Delete them from the list above.</div>` : ""}
  ${!dotsMatch && validEntries.length>=3 ? `<div style="font-size:11px;color:#9a9a4a;margin-bottom:8px">⚠ Calibrated dots differ from API — your real gym dots may differ from the fallback table. Run Auto-fill to refresh API data.</div>` : ""}
  ${validEntries.length>=5 ? `<button id="gg-log-apply" class="gg-btn" style="width:100%;background:#182018;border-color:#2a4a2a;color:#7abf7a;font-size:12px">Apply ${cal.dots} dots to calculator</button>` : `<div style="font-size:10px;color:#445">Log ${5-validEntries.length} more valid entries to unlock Apply.</div>`}
</div>`;

        q("#gg-log-apply")?.addEventListener("click", () => {
            const gymId  = parseInt(el.gym.value);
            const stat   = el.stat.value;
            const sk     = STAT_KEYS[stat];
            const idx    = GYMS.findIndex(g=>g.id===gymId);
            if (idx>=0 && sk) {
                GYMS[idx] = {...GYMS[idx], [sk]: cal.dots};
                buildGymMaps(); updateDotsDisplay(); updateBestGymPanel();
                showStatus("ok", `✓ Applied ${cal.dots} dots to ${GYMS[idx].name} ${STAT_LABELS[stat]}.`);
            }
        });
    }

    // Build plain-text log for sharing (tab-separated, easy to paste to Claude)
    function buildLogText(entries) {
        if (!entries.length) return "No entries logged.";
        const header = [
            "#","date","scriptVer","playerId","playerName",
            "stat","gym","gymId","dots","E/train","subscriber","sessionType",
            "preStat","newStat","happy","propHappy","energyUsed","actualGain",
            "perkFaction","perkProperty","perkEduStat","perkEduGen","perkJob","perkBook","perkSteroids","perkSneakers",
            "bonusCombined","predicted","err%","source"
        ].join("\t");
        const rows = entries.map((e, i) => {
            const pred   = predictEntry(e, e.gymDots);
            const errPct = pred > 0 ? ((e.actualGain - pred) / pred * 100).toFixed(2) : "?";
            const date   = new Date(e.ts).toISOString().slice(0,16).replace("T"," ");
            return [
                i+1,
                date,
                e.scriptVer  || "?",
                e.playerId   || "?",
                e.playerName || "?",
                e.stat,
                e.gymName    || "?",
                e.gymId      || "?",
                e.gymDots,
                e.ePerTrain  || 10,
                e.subscriber || "?",
                e.sessionType || "?",
                e.preStat,
                e.newStat    || (e.preStat + e.actualGain),
                e.happy,
                e.propHappy  || "?",
                e.energyUsed || "?",
                e.actualGain,
                e.perkFaction  ?? "?",
                e.perkProperty ?? "?",
                e.perkEduStat  ?? "?",
                e.perkEduGen   ?? "?",
                e.perkJob      ?? "?",
                e.perkBook     ?? "?",
                e.perkSteroids ?? "?",
                e.perkSneakers ?? "?",
                (e.bonus || 1).toFixed(4),
                pred.toFixed(1),
                errPct,
                e.auto ? "auto" : "manual",
            ].join("\t");
        });
        return [header, ...rows].join("\n");
    }

    // Wire up logger UI
    (function initLogger() {
        // ── Auto-log toggle ──────────────────────────────────────────────────
        let autoLogEnabled = _load('autoLogEnabled', true);
        const updateAutoLogUI = () => {
            const dot = q("#gg-autolog-dot");
            const lbl = q("#gg-autolog-lbl");
            if (!dot) return;
            dot.style.background   = autoLogEnabled ? '#5a9f5a' : '#554444';
            lbl.style.color        = autoLogEnabled ? '#7abf7a' : '#aa6a6a';
            lbl.textContent        = autoLogEnabled ? 'Auto-log: ON' : 'Auto-log: OFF';
        };
        q("#gg-autolog-row")?.addEventListener("click", () => {
            autoLogEnabled = !autoLogEnabled;
            _save('autoLogEnabled', autoLogEnabled);
            window._ggAutoLogEnabled = autoLogEnabled;
            updateAutoLogUI();
        });
        window._ggAutoLogEnabled = autoLogEnabled;
        updateAutoLogUI();

        // ── Fill from page ───────────────────────────────────────────────────
        // Scans the current DOM for the most recent train result text and
        // pre-fills all fields it can find. User only needs to confirm/correct.
        q("#gg-log-autofill")?.addEventListener("click", () => {
            let filled = [];

            // Try to find the latest result text anywhere on the page
            let gain = null, energyUsed = null, statKey = null, newStat = null;

            // Scan all text nodes for known result patterns
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
                acceptNode: n => wrap.contains(n.parentElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
            });
            let node, bestMatch = null, bestLen = 0;
            while ((node = walker.nextNode())) {
                const t = node.textContent || '';
                // Prefer longer matches (more data)
                if (t.length > bestLen && (
                    /you used\s+[\d,]+\s+energy.*increasing it by/i.test(t) ||
                    /you (?:have )?gained\s+[\d,]+(?:\.\d+)?\s+(?:strength|speed|defense|dexterity)/i.test(t)
                )) {
                    bestMatch = t;
                    bestLen = t.length;
                }
            }

            if (bestMatch) {
                // Pattern 1: full desktop format
                const m1 = bestMatch.match(/you used\s+([\d,]+)\s+energy[^.]*?training (?:your\s+)?(strength|speed|defense|dexterity)[^.]*?increasing it by\s+([\d,]+(?:\.\d+)?)\s+to\s+([\d,]+(?:\.\d+)?)/i);
                if (m1) {
                    energyUsed = parseInt(m1[1].replace(/,/g,''));
                    statKey    = m1[2].toLowerCase();
                    gain       = parseFloat(m1[3].replace(/,/g,''));
                    newStat    = Math.round(parseFloat(m1[4].replace(/,/g,'')));
                }
                // Pattern 2: TornPDA short format
                if (!gain) {
                    const m2 = bestMatch.match(/you (?:have )?gained\s+([\d,]+(?:\.\d+)?)\s+(strength|speed|defense|dexterity)/i);
                    if (m2) {
                        gain    = parseFloat(m2[1].replace(/,/g,''));
                        statKey = m2[2].toLowerCase();
                        const mTrains = bestMatch.match(/(\d+)\s+times/i);
                        const gymE    = getGymData()?.energy || 10;
                        energyUsed    = mTrains ? parseInt(mTrains[1]) * gymE : gymE;
                    }
                }
            }

            // Fill Actual Gain
            if (gain) {
                q("#gg-log-gain").value = Math.round(gain);
                filled.push("gain");
            }

            // Fill Energy Used
            if (energyUsed) {
                q("#gg-log-energy").value = energyUsed;
                filled.push("energy");
            }

            // Fill Pre-train Stat: use newStat - gain if available, else calculator field
            if (gain && newStat) {
                q("#gg-log-stat").value = Math.round(newStat - gain);
                filled.push("stat");
            } else {
                const calcStat = gf(el.statTotal);
                if (calcStat > 0) {
                    q("#gg-log-stat").value = calcStat;
                    filled.push("stat");
                }
            }

            // Fill Happy: use lastTrainedHappy snapshot, else live read, else propHappy
            const happy = lastTrainedHappy || readHappyFromPage() || gf(el.happy);
            if (happy) {
                q("#gg-log-happy").value = happy;
                filled.push("happy");
            }

            if (filled.length === 0) {
                const statusEl = q("#gg-log-copy-status");
                if (statusEl) {
                    statusEl.textContent = "⚠ No train result found on page — fill manually.";
                    statusEl.style.color = "#bf9f5a";
                    statusEl.style.display = "block";
                    setTimeout(() => statusEl.style.display = "none", 3000);
                }
            } else {
                const statusEl = q("#gg-log-copy-status");
                const missing = ["gain","energy","stat","happy"].filter(f => !filled.includes(f));
                const msg = `⚡ Filled: ${filled.join(", ")}${missing.length ? ` — enter ${missing.join(", ")} manually` : " — ready to log!"}`;
                if (statusEl) {
                    statusEl.textContent = msg;
                    statusEl.style.color = "#7abf7a";
                    statusEl.style.display = "block";
                    setTimeout(() => statusEl.style.display = "none", 4000);
                }
                // Focus the first empty field so user can type straight away
                const emptyFields = [
                    {id:"#gg-log-gain",    filled: !!gain},
                    {id:"#gg-log-energy",  filled: !!energyUsed},
                    {id:"#gg-log-stat",    filled: filled.includes("stat")},
                    {id:"#gg-log-happy",   filled: !!happy},
                ].find(f => !f.filled);
                if (emptyFields) q(emptyFields.id)?.focus();
            }
        });
        q("#gg-log-add")?.addEventListener("click", () => {
            const gain      = parseFloat(q("#gg-log-gain")?.value)   || 0;
            const energyUsed= parseFloat(q("#gg-log-energy")?.value) || 0;
            const preStat   = parseFloat(q("#gg-log-stat")?.value)   || 0;
            const happy     = parseFloat(q("#gg-log-happy")?.value)  || 0;

            if (!gain || !preStat || !happy || !energyUsed) {
                showStatus("warn", "⚠ Fill in all four fields to log an entry.");
                return;
            }
            const gym   = getGymData();
            const stat  = el.stat.value;
            const sk    = STAT_KEYS[stat];
            const dots  = gym?.[sk] || 0;
            if (!dots) { showStatus("warn", "⚠ Gym doesn't train this stat."); return; }

            const entry = {
                ts:         Date.now(),
                scriptVer:  "3.36",
                playerId:   _load('playerId', null),
                playerName: _load('playerName', null),
                stat,
                gymId:      gym?.id,
                gymName:    gym?.name,
                gymDots:    dots,
                ePerTrain:  gym?.energy || 10,
                subscriber: el.subscriber?.value || "?",
                preStat,
                newStat:    Math.round(preStat + gain),
                happy,
                propHappy:  gf(el.happy) || 5025,
                energyUsed,
                actualGain: Math.round(gain),
                perkFaction:  parseFloat(el.factionPerk?.value)    || 0,
                perkProperty: parseFloat(el.propertyPerk?.value)   || 0,
                perkEduStat:  parseFloat(el.eduStatPerk?.value)    || 0,
                perkEduGen:   parseFloat(el.eduGenPerk?.value)     || 0,
                perkJob:      parseFloat(el.jobPerk?.value)        || 0,
                perkBook:     parseFloat(el.bookPerk?.value)       || 0,
                perkSteroids: parseFloat(el.steroids?.value)       || 0,
                perkSneakers: parseFloat(el.sportsSneakers?.value) || 0,
                bonus:        calcBonus(stat),
                auto:         false,
            };
            const entries = logPrune(logLoad());
            entries.push(entry);
            logSave(entries);

            q("#gg-log-gain").value   = "";
            q("#gg-log-energy").value = "";
            q("#gg-log-stat").value   = "";
            q("#gg-log-happy").value  = "";

            renderLogger();
            showStatus("ok", `✓ Entry logged (${entries.length} total).`);
        });

        // ── Copy log ─────────────────────────────────────────────────────────
        q("#gg-log-copy")?.addEventListener("click", () => {
            const entries = logPrune(logLoad());
            if (!entries.length) { showStatus("warn", "⚠ Nothing to copy."); return; }
            const text = buildLogText(entries);

            const statusEl = q("#gg-log-copy-status");
            const showSt   = (msg) => { if (statusEl) { statusEl.textContent=msg; statusEl.style.display="block"; setTimeout(()=>statusEl.style.display="none", 3000); } };

            // Try GM_setClipboard first (always works in Tampermonkey/TornPDA)
            if (typeof GM_setClipboard !== "undefined") {
                GM_setClipboard(text);
                showSt(`✓ ${entries.length} entries copied — paste anywhere (Notes, Discord, chat with Claude).`);
                return;
            }
            // Then try navigator.clipboard (works in modern browsers)
            if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(text)
                    .then(() => showSt(`✓ ${entries.length} entries copied to clipboard.`))
                    .catch(() => showFallback(text));
                return;
            }
            showFallback(text);
        });

        function showFallback(text) {
            // Full-screen selectable textarea fallback — always works in TornPDA
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:999999;display:flex;flex-direction:column;padding:16px;gap:10px';
            overlay.innerHTML = `
<div style="background:#1a1a1a;border:1px solid #2a4a2a;border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:10px;flex:1;overflow:hidden">
  <div style="color:#7abf7a;font-size:14px;font-weight:bold">📋 Gains Log — Select All &amp; Copy</div>
  <div style="font-size:11px;color:#556;line-height:1.5">Long-press → Select All → Copy. Then paste to Claude, Discord, or Notes.</div>
  <textarea id="gg-log-ta" readonly style="flex:1;min-height:0;background:#0e0e0e;color:#7a9a7a;border:1px solid #2a4a2a;border-radius:4px;padding:10px;font-size:11px;font-family:monospace;resize:none;line-height:1.4">${text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
  <button id="gg-fb-close" style="background:#181818;border:1px solid #333;color:#888;padding:10px;border-radius:4px;font-size:14px;font-weight:bold">Close</button>
</div>`;
            document.body.appendChild(overlay);
            const ta = overlay.querySelector('#gg-log-ta');
            // Set value directly (not innerHTML) so clipboard picks it up
            ta.value = text;
            setTimeout(() => { ta.focus(); ta.select(); }, 80);
            overlay.querySelector('#gg-fb-close').addEventListener('click', () => overlay.remove());
        }

        // ── Clear ────────────────────────────────────────────────────────────
        q("#gg-log-clear")?.addEventListener("click", () => {
            if (!confirm("Clear all logged entries? This cannot be undone.")) return;
            logSave([]);
            renderLogger();
            showStatus("ok", "✓ Log cleared.");
        });

        // ── Pre-fill stat from calculator on panel open ───────────────────────
        q("#gg-logger-panel")?.querySelector(".gg-collapsible-header")?.addEventListener("click", () => {
            const cur = gf(el.statTotal);
            if (cur > 0 && !q("#gg-log-stat")?.value) {
                const statInput = q("#gg-log-stat");
                if (statInput) statInput.value = cur;
            }
        });

        renderLogger();
    })();

    // Debug buttons
    const debugLog = [];
    const _ow = console.warn.bind(console);
    console.warn = (...a) => { _ow(...a); if (String(a[0]).includes("[AIO")) debugLog.push("W:"+a.join(" ")); };
    q("#gg-copy-logs")?.addEventListener("click", () => {
        const log = [
            "Gym Planner v3.0 " + new Date().toISOString(),
            "GYMS:" + GYMS.length + " maxSPD:" + Math.max(...GYMS.map(g=>g.spd||0)),
            "Jail:" + JSON.stringify(GYMS.find(g=>g.id===32)),
            "CanPrices:" + JSON.stringify(canPrices),
            "CAN_IDs:" + CAN_TYPES.map(c=>c.label+":"+c.id).join(","),
            "Stats:" + JSON.stringify(allStats), "ActivePanel:" + (typeof activePanel !== 'undefined' ? activePanel : 'n/a'),
            "---", ...debugLog.slice(-20),
        ].join("\n");
        GM_setClipboard ? GM_setClipboard(log) : navigator.clipboard?.writeText(log);
        const ds = q("#gg-debug-status");
        if (ds) { ds.style.display = "block"; ds.textContent = "✓ Copied"; setTimeout(() => ds.style.display = "none", 2000); }
    });
    q("#gg-clear-cache")?.addEventListener("click", () => {
        ["gymDataCache_v2","gymDataCacheTs_v2","gymDataCache","gymDataCacheTs",
         PRICE_CACHE_KEY,"canItemIds","canItemIdsTs","lastAutofillTs","manualGymOwned"]
         .forEach(k => { try { GM_deleteValue(k); } catch(_){} });
        CAN_TYPES.forEach(c => c.id = null); CANDY_TYPES.forEach(c => c.id = null);
        GYMS = GYMS_FALLBACK.slice(); buildGymMaps(); rebuildGymDropdown();
        const ds = q("#gg-debug-status");
        if (ds) { ds.style.display = "block"; ds.style.color = "#bf7a7a"; ds.textContent = "✓ Cleared"; setTimeout(() => ds.style.display = "none", 3000); }
        showStatus("ok", "✓ Cache cleared. Reload or Auto-fill.");
    });


})();