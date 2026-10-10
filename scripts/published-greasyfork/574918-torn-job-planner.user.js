// ==UserScript==
// @name         Torn Job Planner
// @namespace    iSatomi
// @version      3.11
// @description  Job rank calculator, switch planner, and interview answer helper for Torn City
// @author       iSatomi [3580191]
// @license      MIT
// @match        https://www.torn.com/jobs.php*
// @match        https://www.torn.com/joblist.php*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/574918/Torn%20Job%20Planner.user.js
// @updateURL https://update.greasyfork.org/scripts/574918/Torn%20Job%20Planner.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // ── Shared persistence (TornPDA-safe) ──
    // On TornPDA GM_getValue/GM_setValue are often undefined and localStorage
    // access can be denied. Fall back gracefully so the script still runs.
    const _mem = {};
    const _hasGM = (typeof GM_getValue === 'function' && typeof GM_setValue === 'function');
    function _rawGet(k) {
        if (_hasGM) { try { return GM_getValue(k, null); } catch(_){} }
        try { const v = localStorage.getItem('jtp_'+k); return v===null ? null : v; } catch(_){}
        return (k in _mem) ? _mem[k] : null;
    }
    function _rawSet(k, v) {
        if (_hasGM) { try { GM_setValue(k, v); return; } catch(_){} }
        try { localStorage.setItem('jtp_'+k, v); return; } catch(_){}
        _mem[k] = v;
    }
    const _load = (k, d) => { const v = _rawGet(k); return v !== null && v !== undefined ? v : d; };
    const _save = (k, v) => _rawSet(k, v);

    const cache = {
        get: (k) => { try { const v = _rawGet('aio_'+k); return v ? JSON.parse(v) : null; } catch(_){ return null; }},
        set: (k, v) => { try { _rawSet('aio_'+k, JSON.stringify(v)); } catch(_){} },
    };

    function gmFetch(url) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') { reject(new Error("No GM_xmlhttpRequest")); return; }
            GM_xmlhttpRequest({
                method:"GET", url, timeout:10000,
                onload:    r => { try { resolve(JSON.parse(r.responseText)); } catch(e) { reject(e); }},
                onerror:   () => reject(new Error("Network error")),
                ontimeout: () => reject(new Error("Timeout")),
            });
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // JOB DATA
    // ─────────────────────────────────────────────────────────────────────────
    const JOBS = {
        army: {
            label:"Army", topRankPerk:"Spy battle stats once/day (10 pts + $5,000)",
            benefits:[],
            ranks:[
                {name:"Private",         req:{man:2,    int:2,    end:2    },gain:{man:3, int:1, end:2 },jpPerDay:1, jpNeeded:5,   perks:[]},
                {name:"Corporal",        req:{man:50,   int:15,   end:20   },gain:{man:5, int:2, end:3 },jpPerDay:2, jpNeeded:10,  perks:[]},
                {name:"Sergeant",        req:{man:120,  int:35,   end:50   },gain:{man:8, int:3, end:5 },jpPerDay:3, jpNeeded:15,  perks:[]},
                {name:"Master Sergeant", req:{man:325,  int:60,   end:115  },gain:{man:12,int:4, end:7 },jpPerDay:4, jpNeeded:20,  perks:[]},
                {name:"Warrant Officer", req:{man:700,  int:160,  end:300  },gain:{man:17,int:7, end:10},jpPerDay:5, jpNeeded:25,  perks:[]},
                {name:"Lieutenant",      req:{man:1300, int:360,  end:595  },gain:{man:20,int:9, end:11},jpPerDay:6, jpNeeded:30,  perks:[]},
                {name:"Major",           req:{man:2550, int:490,  end:900  },gain:{man:24,int:10,end:13},jpPerDay:7, jpNeeded:35,  perks:[]},
                {name:"Colonel",         req:{man:4150, int:600,  end:1100 },gain:{man:28,int:12,end:15},jpPerDay:8, jpNeeded:40,  perks:[]},
                {name:"Brigadier",       req:{man:7500, int:1350, end:2530 },gain:{man:33,int:18,end:15},jpPerDay:9, jpNeeded:45,  perks:[]},
                {name:"General",         req:{man:10000,int:2000, end:4000 },gain:{man:40,int:25,end:20},jpPerDay:10,jpNeeded:null,perks:["⭐ Spy battle stats once/day — active while in Army"]},
            ]
        },
        grocer: {
            label:"Grocer", topRankPerk:"Steal Energy Drink (25 pts — worth ~$3–5M each)",
            benefits:[],
            ranks:[
                {name:"Bag Boy",       req:{man:2,  int:2,  end:2  },gain:{man:2, int:1, end:3 },jpPerDay:1,jpNeeded:5,  perks:[]},
                {name:"Price Labeler",req:{man:30, int:15, end:50 },gain:{man:3, int:2, end:5 },jpPerDay:2,jpNeeded:10, perks:[]},
                {name:"Cashier",       req:{man:50, int:35, end:120},gain:{man:5, int:3, end:8 },jpPerDay:3,jpNeeded:15, perks:[]},
                {name:"Food Delivery", req:{man:120,int:60, end:225},gain:{man:10,int:5, end:15},jpPerDay:4,jpNeeded:20, perks:[]},
                {name:"Manager",       req:{man:250,int:200,end:500},gain:{man:15,int:10,end:20},jpPerDay:5,jpNeeded:null,perks:["⭐ Steal Energy Drink (~$3–5M each, 25 pts) — active while in Grocer"]},
            ]
        },
        casino: {
            label:"Casino", topRankPerk:"Money payout ~$120–160k per use (10 pts + $100k base)",
            benefits:[],
            ranks:[
                {name:"Dealer",           req:{man:2,  int:2,   end:2   },gain:{man:1, int:2, end:3 },jpPerDay:1,jpNeeded:5,  perks:[]},
                {name:"Gaming Consultant",req:{man:35, int:50,  end:120 },gain:{man:2, int:3, end:5 },jpPerDay:2,jpNeeded:10, perks:[]},
                {name:"Marketing Manager",req:{man:60, int:115, end:325 },gain:{man:4, int:7, end:12},jpPerDay:3,jpNeeded:15, perks:[]},
                {name:"Revenue Manager",  req:{man:360,int:595, end:1300},gain:{man:9, int:11,end:20},jpPerDay:4,jpNeeded:20, perks:[]},
                {name:"Casino Manager",   req:{man:490,int:900, end:2550},gain:{man:10,int:13,end:24},jpPerDay:5,jpNeeded:25, perks:[]},
                {name:"Casino President", req:{man:755,int:1100,end:4150},gain:{man:12,int:15,end:28},jpPerDay:6,jpNeeded:null,perks:["⭐ Count Cards ~$120–160k payout — active while in Casino"]},
            ]
        },
        medical: {
            label:"Medical", topRankPerk:"Revive players for 75 energy — permanent passive, earn $500k–$1M+ per revive",
            benefits:[],
            ranks:[
                {name:"Medical Student",req:{man:0,   int:300,  end:0   },gain:{man:4, int:12,end:7 },jpPerDay:1,jpNeeded:5,  perks:[]},
                {name:"Houseman",       req:{man:100, int:600,  end:150 },gain:{man:7, int:17,end:10},jpPerDay:2,jpNeeded:10, perks:[]},
                {name:"Senior Houseman",req:{man:175, int:1000, end:275 },gain:{man:9, int:20,end:11},jpPerDay:3,jpNeeded:15, perks:[]},
                {name:"GP",             req:{man:300, int:1500, end:500 },gain:{man:10,int:24,end:13},jpPerDay:4,jpNeeded:20, perks:[]},
                {name:"Consultant",     req:{man:600, int:2500, end:1000},gain:{man:12,int:28,end:15},jpPerDay:5,jpNeeded:25, perks:[]},
                {name:"Surgeon",        req:{man:1300,int:5000, end:2000},gain:{man:18,int:33,end:15},jpPerDay:6,jpNeeded:30, perks:[]},
                {name:"Brain Surgeon",  req:{man:2600,int:10000,end:4000},gain:{man:20,int:40,end:25},jpPerDay:7,jpNeeded:null,perks:["⭐ Revive players for 75 energy — permanent passive, earns $500k–$1M+ per revive"]},
            ]
        },
        education: {
            label:"Education", topRankPerk:"10% reduction in all education course completion times — permanent passive",
            benefits:[
                {statKey:"man",unlockedAtRank:0},
                {statKey:"end",unlockedAtRank:2},
                {statKey:"int",unlockedAtRank:4},
            ],
            ranks:[
                {name:"Recess Supervisor", req:{man:0,   int:500, end:0   },gain:{man:8, int:10,end:9 },jpPerDay:1,jpNeeded:5,  perks:[]},
                {name:"Substitute Teacher",req:{man:300, int:750, end:500 },gain:{man:13,int:15,end:14},jpPerDay:2,jpNeeded:10, perks:[]},
                {name:"Elementary Teacher",req:{man:600, int:1000,end:700 },gain:{man:15,int:20,end:17},jpPerDay:3,jpNeeded:15, perks:[]},
                {name:"Secondary Teacher", req:{man:1000,int:1300,end:1000},gain:{man:20,int:25,end:20},jpPerDay:4,jpNeeded:20, perks:[]},
                {name:"Professor",         req:{man:1500,int:2000,end:1500},gain:{man:25,int:30,end:25},jpPerDay:5,jpNeeded:25, perks:[]},
                {name:"Vice Principal",    req:{man:1500,int:3000,end:1500},gain:{man:30,int:35,end:30},jpPerDay:6,jpNeeded:30, perks:[]},
                {name:"Principal",         req:{man:1500,int:5000,end:1500},gain:{man:30,int:40,end:30},jpPerDay:7,jpNeeded:null,perks:["⭐ 10% reduction in all education course times — permanent passive"]},
            ]
        },
        law: {
            label:"Law", topRankPerk:"+5% crime experience & skill progression — permanent passive",
            benefits:[],
            ranks:[
                {name:"Law Student",        req:{man:0,   int:0,   end:1500 },gain:{man:15,int:15,end:20},jpPerDay:1,jpNeeded:5,  perks:[]},
                {name:"Paralegal",          req:{man:1750,int:2500,end:5000 },gain:{man:17,int:20,end:23},jpPerDay:2,jpNeeded:10, perks:[]},
                {name:"Probate Lawyer",     req:{man:2500,int:5000,end:7500 },gain:{man:19,int:23,end:30},jpPerDay:3,jpNeeded:15, perks:[]},
                {name:"Trial Lawyer",       req:{man:3500,int:6500,end:7750 },gain:{man:25,int:27,end:35},jpPerDay:4,jpNeeded:20, perks:[]},
                {name:"Circuit Court Judge",req:{man:4000,int:7250,end:10000},gain:{man:27,int:30,end:38},jpPerDay:5,jpNeeded:25, perks:[]},
                {name:"Federal Judge",      req:{man:6000,int:9000,end:15000},gain:{man:30,int:33,end:45},jpPerDay:6,jpNeeded:null,perks:["⭐ +5% crime experience & skill progression — permanent passive"]},
            ]
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // JOB DETECTION
    // ─────────────────────────────────────────────────────────────────────────
    const JOB_KEYWORDS = {
        education:"education",educational:"education","education system":"education",
        army:"army",grocer:"grocer",grocery:"grocer","grocery store":"grocer",
        casino:"casino",medical:"medical","medical system":"medical",law:"law",
    };

    function detectJob() {
        const text = sel => document.querySelector(sel)?.textContent.toLowerCase() ?? "";
        const match = t => {
            for (const [k,v] of Object.entries(JOB_KEYWORDS))
                if (k.length >= 3 && t.includes(k)) return v;
            return null;
        };
        const ptWord = text('.points-text').trim().split(/\s+/)[0];
        if (JOB_KEYWORDS[ptWord]) return JOB_KEYWORDS[ptWord];
        const msgT = text('.info-msg-cont:not(.red) .msg');
        const m1 = msgT.match(/\b(\w+)\s+points\b/);
        if (m1 && JOB_KEYWORDS[m1[1]]) return JOB_KEYWORDS[m1[1]];
        const m2 = msgT.match(/work in the\s+([\w ]+?)(?:\s+system|[.,\n]|$)/);
        if (m2) { const k=m2[1].trim(); if (JOB_KEYWORDS[k]) return JOB_KEYWORDS[k]; if (JOB_KEYWORDS[k.split(' ')[0]]) return JOB_KEYWORDS[k.split(' ')[0]]; }
        for (const e of document.querySelectorAll('.msg')) { const r=match(e.textContent.toLowerCase()); if (r) return r; }
        const bm = document.body.innerText.toLowerCase().match(/work in the\s+([\w ]+?)(?:\s+system|\n|\.)/);
        if (bm) { const k=bm[1].trim(); return JOB_KEYWORDS[k]||JOB_KEYWORDS[k.split(' ')[0]]||null; }
        return null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PERSISTENCE
    // ─────────────────────────────────────────────────────────────────────────
    const JT_DEFAULTS = {selectedJob:"education",currentRank:"0",currentJP:"5",manStat:"0",intStat:"0",endStat:"0",collapsed:"no"};
    const jt_load = k => _load(k, JT_DEFAULTS[k]);
    const jt_save = (k, v) => _save(k, v);

    // ─────────────────────────────────────────────────────────────────────────
    // CSS
    // ─────────────────────────────────────────────────────────────────────────
    const STYLES = `
.jt-wrap{margin:8px 0 12px;background:#181818;border:1px solid #333;border-radius:6px;font-family:Arial,sans-serif;font-size:14px;color:#ccc;overflow:hidden}
.jt-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:linear-gradient(135deg,#242424,#1c1c1c);border-bottom:1px solid #2a2a2a;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.jt-header:hover{background:linear-gradient(135deg,#2c2c2c,#222)}
.jt-title{font-size:15px;font-weight:bold;color:#e0e0e0}
.jt-toggle{font-size:16px;color:#555;transition:transform .2s}
.jt-wrap.open .jt-toggle{transform:rotate(180deg)}
.jt-body{display:none;padding:12px}
.jt-wrap.open .jt-body{display:block}
.jt-sec{font-size:10px;font-weight:bold;color:#555;letter-spacing:.08em;text-transform:uppercase;margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid #252525}
.jt-sec:first-child{margin-top:0}
.jt-field{margin-bottom:8px}
.jt-field label{display:block;font-size:12px;color:#888;margin-bottom:3px}
.jt-field select,.jt-field input[type=number]{width:100%;padding:8px 10px;background:#222;border:1px solid #383838;border-radius:4px;color:#e0e0e0;font-size:14px;box-sizing:border-box;-webkit-appearance:none;appearance:none}
.jt-field select:focus,.jt-field input:focus{outline:none;border-color:#555;background:#282828}
.jt-sg{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.jt-sg .jt-field{margin-bottom:0}
.jt-sg .jt-field label{font-size:11px}
.jt-btn-row{display:flex;gap:8px;margin-top:12px}
.jt-btn{flex:1;padding:10px 8px;border-radius:4px;border:1px solid #383838;background:#222;color:#ddd;font-size:13px;font-weight:bold;cursor:pointer;text-align:center;-webkit-tap-highlight-color:transparent;transition:background .15s}
.jt-btn:hover,.jt-btn:active{background:#2a2a2a}
.jt-btn-fill{background:#1a2518;border-color:#3a5030;color:#7abf7a}
.jt-btn-fill:hover,.jt-btn-fill:active{background:#20301e}
.jt-btn-calc{background:#18182a;border-color:#303058;color:#7a7acc}
.jt-btn-calc:hover,.jt-btn-calc:active{background:#20203a}
.jt-status{display:none;margin-top:8px;padding:8px 10px;border-radius:4px;font-size:12px;line-height:1.5;word-break:break-word}
.jt-status.ok{display:block;background:#182018;border:1px solid #2a4a2a;color:#7abf7a}
.jt-status.err{display:block;background:#201818;border:1px solid #4a2828;color:#bf7a7a}
.jt-status.warn{display:block;background:#201e10;border:1px solid #4a3a18;color:#bf9f5a}
.jt-row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:6px 10px;margin-top:3px;border-radius:4px;background:#1e1e1e}
.jt-row .jt-rl{color:#888;font-size:13px;flex-shrink:0}
.jt-row .jt-rv{color:#ddd;font-size:13px;text-align:right;word-break:break-word}
.jt-row.g{background:#18201a}.jt-row.g .jt-rv{color:#7abf7a}
.jt-row.r{background:#201818}.jt-row.r .jt-rv{color:#bf7a7a}
.jt-row.a{background:#201e10}.jt-row.a .jt-rv{color:#bf9f5a}
.jt-row.b{background:#181828}.jt-row.b .jt-rv{color:#7a7acc}
.jt-perk{margin-top:8px;padding:10px 12px;background:#182018;border:1px solid #2a4a2a;border-radius:4px;font-size:13px;color:#7abf7a;line-height:1.5}
.jt-perk.locked{background:#201818;border-color:#4a2828;color:#bf7a7a}
/* Action cards */
.jt-action{display:flex;flex-direction:column;gap:3px;padding:10px 12px;margin-top:5px;border-radius:5px;border-left:3px solid transparent}
.jt-action.now{background:#211208;border:1px solid #5a2a10;border-left:3px solid #cc5500}
.jt-action.soon{background:#1e1a08;border:1px solid #4a3a10;border-left:3px solid #c09030}
.jt-action.info{background:#141420;border:1px solid #2a2a40;border-left:3px solid #4a4a70}
.jt-action.good{background:#0e1e10;border:1px solid #2a4a2a;border-left:3px solid #3a8a3a}
.jt-action-badge{font-size:10px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;margin-bottom:1px}
.jt-action.now  .jt-action-badge{color:#e06020}
.jt-action.soon .jt-action-badge{color:#c0a030}
.jt-action.info .jt-action-badge{color:#6666aa}
.jt-action.good .jt-action-badge{color:#4aaa4a}
.jt-action-head{font-size:13px;font-weight:bold;line-height:1.4}
.jt-action.now  .jt-action-head{color:#f08040}
.jt-action.soon .jt-action-head{color:#d4b050}
.jt-action.info .jt-action-head{color:#8888cc}
.jt-action.good .jt-action-head{color:#6acc6a}
.jt-action-detail{font-size:12px;color:#889;line-height:1.5;margin-top:1px}
.jt-action-when{font-size:11px;font-weight:bold;margin-top:4px;padding:3px 8px;border-radius:3px;display:inline-block;width:fit-content}
.jt-action.now  .jt-action-when{background:#301808;color:#e07030}
.jt-action.soon .jt-action-when{background:#282010;color:#c0a030}
.jt-action.info .jt-action-when{background:#1a1a2a;color:#7878aa}
.jt-action.good .jt-action-when{background:#102010;color:#4aaa4a}
/* Switch planner */
.jt-switch-hero{padding:12px 14px;border-radius:6px;margin-bottom:8px;border:1px solid #2a4a6a;background:linear-gradient(135deg,#0d1a28,#111820)}
.jt-switch-hero.now{border-color:#2a5a2a;background:linear-gradient(135deg,#0d200f,#0f1a12)}
.jt-switch-hero-label{font-size:10px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;color:#5588aa;margin-bottom:4px}
.jt-switch-hero.now .jt-switch-hero-label{color:#4a8a4a}
.jt-switch-hero-date{font-size:20px;font-weight:bold;color:#aad4ff;line-height:1.2}
.jt-switch-hero.now .jt-switch-hero-date{color:#6acc6a}
.jt-switch-hero-sub{font-size:12px;color:#88a;margin-top:4px;line-height:1.5}
.jt-switch-hero-save{font-size:12px;color:#5aaa5a;margin-top:6px;font-weight:bold}
.jt-step{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #1f1f28;align-items:flex-start}
.jt-step:last-child{border-bottom:none}
.jt-step-num{flex-shrink:0;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;background:#1a3050;color:#6aaada;margin-top:1px}
.jt-step-body{flex:1;font-size:13px;line-height:1.5}
.jt-step-title{font-weight:bold;color:#cce;margin-bottom:2px}
.jt-step-detail{font-size:12px;color:#889}
.pk{display:inline-block;border-radius:3px;padding:1px 5px;font-size:10px;margin-left:3px}
.pk.ok{background:#1a3a1a;color:#7abf7a}
.pk.no{background:#3a1a1a;color:#bf6060}
.jt-summary{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#1e1e1e;border:1px solid #2e2e2e;border-radius:4px;margin-bottom:8px}
.jt-summary-text{font-size:12px;color:#aaa;line-height:1.5;flex:1}
.jt-summary-text strong{color:#ddd}
.jt-edit-btn{flex-shrink:0;padding:4px 10px;border-radius:3px;border:1px solid #383838;background:#252525;color:#888;font-size:11px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.jt-edit-btn:hover,.jt-edit-btn:active{background:#2e2e2e;color:#bbb}
.jt-inputs{display:none}
.jt-inputs.expanded{display:block}
.jt-planner{margin-top:14px;padding:10px 12px;background:#14181e;border:1px solid #2a3040;border-radius:4px}
.jt-planner-header{display:flex;align-items:center;justify-content:space-between;cursor:pointer;-webkit-tap-highlight-color:transparent}
.jt-planner-title{font-size:12px;font-weight:bold;color:#6a8aaa;letter-spacing:.04em;text-transform:uppercase}
.jt-planner-toggle{font-size:13px;color:#445;transition:transform .2s}
.jt-planner.open .jt-planner-toggle{transform:rotate(180deg)}
.jt-planner-body{display:none;margin-top:10px}
.jt-planner.open .jt-planner-body{display:block}`;

    // ─────────────────────────────────────────────────────────────────────────
    // HTML
    // ─────────────────────────────────────────────────────────────────────────
    function buildHTML() {
        const opts = (filter=null) => Object.entries(JOBS)
            .filter(([k]) => !filter || k !== filter)
            .map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('');
        return `
<div class="jt-header"><span class="jt-title">📋 Job Planner</span><span class="jt-toggle">▼</span></div>
<div class="jt-body">
<div class="jt-summary" id="jt-summary" style="display:none">
  <span class="jt-summary-text" id="jt-summary-text">—</span>
  <button class="jt-edit-btn" id="jt-edit-btn">✏ Edit</button>
</div>
<div class="jt-inputs expanded" id="jt-inputs">
  <div class="jt-sec">Job &amp; Rank</div>
  <div class="jt-field"><label>Job</label><select id="jt-job">${opts()}</select></div>
  <div class="jt-field"><label>Current Rank</label><select id="jt-rank"></select></div>
  <div class="jt-field"><label>Job Points (accumulated, not spent)</label><input type="number" id="jt-jp" min="0"></div>
  <div class="jt-sec">Working Stats</div>
  <div class="jt-sg">
    <div class="jt-field"><label>Manual</label><input type="number" id="jt-man" min="0"></div>
    <div class="jt-field"><label>Intelligence</label><input type="number" id="jt-int" min="0"></div>
    <div class="jt-field"><label>Endurance</label><input type="number" id="jt-end" min="0"></div>
  </div>
</div>
<div class="jt-btn-row">
  <button class="jt-btn jt-btn-fill" id="jt-autofill">⟳ Auto-fill</button>
  <button class="jt-btn jt-btn-calc" id="jt-calc">Calculate →</button>
</div>
<div class="jt-status" id="jt-status"></div>
<div id="jt-results"></div>
<div class="jt-planner" id="jt-planner">
  <div class="jt-planner-header" id="jt-planner-header">
    <span class="jt-planner-title">🎯 Switch Job Planner</span>
    <span class="jt-planner-toggle">▼</span>
  </div>
  <div class="jt-planner-body">
    <div class="jt-field"><label>Target Job</label><select id="jt-plan-job">${opts("education")}</select></div>
    <div class="jt-field"><label>Target Rank</label><select id="jt-plan-rank"></select></div>
    <button class="jt-btn jt-btn-calc" id="jt-plan-calc" style="margin-top:8px">Calculate Plan →</button>
    <div id="jt-plan-results"></div>
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
    wrap.className = "jt-wrap";
    wrap.innerHTML = buildHTML();
    const mountTarget = document.querySelector('.content-wrapper') || document.body;
    mountTarget.insertBefore(wrap, mountTarget.firstChild);

    const q = sel => wrap.querySelector(sel);
    const el = {
        header:     q(".jt-header"),   summary:    q("#jt-summary"),
        sumText:    q("#jt-summary-text"), editBtn: q("#jt-edit-btn"),
        inputs:     q("#jt-inputs"),   job:        q("#jt-job"),
        rank:       q("#jt-rank"),     jp:         q("#jt-jp"),
        man:        q("#jt-man"),      int:        q("#jt-int"),
        end:        q("#jt-end"),      calcBtn:    q("#jt-calc"),
        fillBtn:    q("#jt-autofill"), status:     q("#jt-status"),
        results:    q("#jt-results"),  planner:    q("#jt-planner"),
        planHdr:    q("#jt-planner-header"), planJob: q("#jt-plan-job"),
        planRank:   q("#jt-plan-rank"), planCalc:  q("#jt-plan-calc"),
        planOut:    q("#jt-plan-results"),
    };

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────────────────
    const iV      = e => parseInt(e.value) || 0;
    const fmt     = n => Math.round(n).toLocaleString();
    const met     = (req,m,i,e) => m>=req.man && i>=req.int && e>=req.end;
    const dateIn  = n => { const d=new Date(); d.setDate(d.getDate()+n); return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); };
    const row     = (l,v,c="") => `<div class="jt-row ${c}"><span class="jt-rl">${l}</span><span class="jt-rv">${v}</span></div>`;
    const sec     = l => `<div class="jt-sec" style="margin-top:14px">${l}</div>`;
    const actionCard = (type, badge, head, detail='', when='') =>
        `<div class="jt-action ${type}">` +
        (badge ? `<div class="jt-action-badge">${badge}</div>` : '') +
        `<div class="jt-action-head">${head}</div>` +
        (detail ? `<div class="jt-action-detail">${detail}</div>` : '') +
        (when   ? `<div class="jt-action-when">${when}</div>` : '') +
        `</div>`;
    const stepEl  = (n, title, detail='') =>
        `<div class="jt-step"><div class="jt-step-num">${n}</div><div class="jt-step-body"><div class="jt-step-title">${title}</div>${detail?`<div class="jt-step-detail">${detail}</div>`:''}</div></div>`;
    const pill    = (h,n) => h>=n ? `<span class="pk ok">${fmt(h)}</span>` : `${fmt(h)}<span class="pk no">-${fmt(n-h)}</span>`;
    const rq      = v => v > 0 ? fmt(v) : "—";

    // ─────────────────────────────────────────────────────────────────────────
    // RANK DROPDOWNS
    // ─────────────────────────────────────────────────────────────────────────
    function populateRanks(jobKey, idx) {
        el.rank.innerHTML = '';
        JOBS[jobKey].ranks.forEach((r,i) => {
            const o = document.createElement("option");
            o.value = i; o.textContent = `${i+1}. ${r.name}`;
            el.rank.appendChild(o);
        });
        el.rank.value = String(idx ?? 0);
    }

    function populatePlanRanks(jobKey) {
        el.planRank.innerHTML = '';
        JOBS[jobKey].ranks.forEach((r,i) => {
            const o = document.createElement("option");
            o.value = i; o.textContent = `${i+1}. ${r.name}`;
            el.planRank.appendChild(o);
        });
        el.planRank.value = String(JOBS[jobKey].ranks.length - 1);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SUMMARY BAR & PLANNER VISIBILITY
    // ─────────────────────────────────────────────────────────────────────────
    function showSummary(jobKey, ri, jp, man, int_, end) {
        refreshSummaryText(jobKey, ri, jp, man, int_, end);
        el.summary.style.display = "";
        el.inputs.classList.remove("expanded");
    }
    // Update only the summary text (does NOT collapse the input fields).
    function refreshSummaryText(jobKey, ri, jp, man, int_, end) {
        const rank = JOBS[jobKey].ranks[ri];
        if (!rank) return;
        el.sumText.innerHTML = `<strong>${JOBS[jobKey].label}</strong> · ${rank.name} · <strong>${jp} JP</strong><br>MAN <strong>${fmt(man)}</strong> · INT <strong>${fmt(int_)}</strong> · END <strong>${fmt(end)}</strong>`;
    }
    const hideSummary = () => { el.summary.style.display="none"; el.inputs.classList.add("expanded"); };
    const updatePlanner = () => { el.planner.style.display = el.job.value==="education" ? "" : "none"; };

    // ─────────────────────────────────────────────────────────────────────────
    // RESTORE & WIRE
    // Wire the buttons FIRST so they always work even if restore throws.
    //
    // TornPDA's webview sometimes fails to synthesise a 'click' from a tap on
    // dynamically-created buttons. bindTap also listens for touchend/pointerup
    // and de-dupes so the handler fires exactly once per tap on every platform.
    // ─────────────────────────────────────────────────────────────────────────
    function bindTap(elm, fn) {
        if (!elm) return;
        let lastFire = 0;
        const run = (ev) => {
            const now = Date.now();
            if (now - lastFire < 350) return;   // de-dupe click+touch double-fire
            lastFire = now;
            if (ev && ev.preventDefault) ev.preventDefault();
            try { fn(ev); } catch (err) { console.error('[Job Planner] handler error:', err); }
        };
        elm.addEventListener("click", run);
        elm.addEventListener("touchend", run, { passive: false });
    }

    bindTap(el.editBtn, hideSummary);
    bindTap(el.header, () => { const o=wrap.classList.toggle("open"); jt_save("collapsed", o?"no":"yes"); });
    el.job.addEventListener("change", () => {
        jt_save("selectedJob", el.job.value);
        populateRanks(el.job.value, 0); jt_save("currentRank","0");
        updatePlanner(); hideSummary();
    });
    el.rank.addEventListener("change", () => jt_save("currentRank", el.rank.value));
    el.jp.addEventListener("input",  () => jt_save("currentJP",  el.jp.value));
    el.man.addEventListener("input", () => jt_save("manStat",    el.man.value));
    el.int.addEventListener("input", () => jt_save("intStat",    el.int.value));
    el.end.addEventListener("input", () => jt_save("endStat",    el.end.value));
    el.planJob.addEventListener("change", () => populatePlanRanks(el.planJob.value));
    bindTap(el.planHdr, () => el.planner.classList.toggle("open"));
    bindTap(el.fillBtn, autofill);
    bindTap(el.calcBtn, calculate);
    bindTap(el.planCalc, calculatePlan);


    // Restore saved values — guarded so a storage failure can't break wiring.
    try {
        el.job.value = jt_load("selectedJob");
        populateRanks(el.job.value, jt_load("currentRank"));
        el.jp.value  = jt_load("currentJP");
        el.man.value = jt_load("manStat");
        el.int.value = jt_load("intStat");
        el.end.value = jt_load("endStat");
        populatePlanRanks(el.planJob.value || "army");
        updatePlanner();
        if (jt_load("collapsed") !== "yes") wrap.classList.add("open");
    } catch (err) {
        console.error('[Job Planner] restore failed (non-fatal):', err);
        // Sensible defaults so the UI is usable
        try { populateRanks(el.job.value || "education", 0); } catch(_){}
        try { populatePlanRanks(el.planJob.value || "army"); } catch(_){}
        wrap.classList.add("open");
    }


    // ─────────────────────────────────────────────────────────────────────────
    // AUTO-FILL
    // ─────────────────────────────────────────────────────────────────────────
    function autofill() {
        const num  = s => s ? parseInt(s.replace(/,/g,''),10)||0 : null;
        const text = sel => { const e=document.querySelector(sel); return e ? e.textContent.trim() : null; };
        const errs=[], filled=[];

        const job = detectJob();
        if (job) { el.job.value=job; jt_save("selectedJob",job); filled.push(JOBS[job].label); }
        else errs.push("Job not detected");

        let ri = 0;
        const rankName = text('.jrank');
        if (rankName && job) {
            const norm = s => s.toLowerCase().replace(/[-–—]/g,' ').replace(/\s+/g,' ').replace(/ll(er|or)\b/g,'l$1').trim();
            ri = JOBS[job].ranks.findIndex(r => norm(r.name) === norm(rankName));
            if (ri >= 0) { populateRanks(job,ri); jt_save("currentRank",String(ri)); filled.push(rankName); }
            else { errs.push(`Rank "${rankName}" not recognised`); ri=0; populateRanks(job,0); }
        } else if (!rankName) { errs.push("Rank not found"); if (job) populateRanks(job,0); }

        const jpRaw = text('.jpoints');
        if (jpRaw !== null) { const v=num(jpRaw); el.jp.value=v; jt_save("currentJP",String(v)); filled.push(`${v} JP`); }
        else errs.push("JP not found");

        [['.jmanLabor',el.man,"manStat","MAN"],['.jintelligence',el.int,"intStat","INT"],['.jendurance',el.end,"endStat","END"]]
        .forEach(([sel,inp,key,lbl]) => {
            const raw=text(sel);
            if (raw!==null) { const v=num(raw); inp.value=v; jt_save(key,String(v)); filled.push(`${lbl} ${fmt(v)}`); }
            else errs.push(`${lbl} not found`);
        });

        updatePlanner();
        if (!errs.length) {
            cache.set('workstats', {
                man: parseInt(jt_load('manStat')) || 0,
                int: parseInt(jt_load('intStat')) || 0,
                end: parseInt(jt_load('endStat')) || 0,
            });
            el.status.className = "jt-status ok";
            el.status.textContent = "✓ " + filled.join(" · ");
            showSummary(el.job.value, parseInt(el.rank.value)||0, iV(el.jp), iV(el.man), iV(el.int), iV(el.end));
        } else if (filled.length) {
            el.status.className="jt-status warn"; el.status.textContent="⚠ Partial: "+filled.join(", ")+" — "+errs.join("; ");
        } else {
            el.status.className="jt-status err"; el.status.textContent="✗ "+errs.join(" | ");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SIMULATION
    // ─────────────────────────────────────────────────────────────────────────
    function simulate(jobKey, startRi, startJP, startMan, startInt, startEnd) {
        const ranks=JOBS[jobKey].ranks, isEdu=jobKey==="education";
        let man=startMan, int_=startInt, end=startEnd, jp=startJP, ri=startRi;
        const results=[{rankIdx:ri, rankName:ranks[ri].name, dayReached:0}];

        for (let day=1; day<=3650; day++) {
            const r=ranks[ri];
            jp+=r.jpPerDay; man+=r.gain.man; int_+=r.gain.int; end+=r.gain.end;

            if (isEdu) {
                const boostable=new Set(JOBS.education.benefits.filter(b=>ri>=b.unlockedAtRank).map(b=>b.statKey));
                if (boostable.size) {
                    const nReq=r.jpNeeded!==null?ranks[ri+1].req:{man:0,int:0,end:0};
                    let surplus=Math.max(0,jp-(r.jpNeeded??0));
                    while (surplus>=10) {
                        let best=null, bs=-1;
                        for (const sk of boostable) {
                            const have=sk==="man"?man:sk==="int"?int_:end, need=sk==="man"?nReq.man:sk==="int"?nReq.int:nReq.end;
                            const gain=sk==="man"?r.gain.man:sk==="int"?r.gain.int:r.gain.end;
                            const score=gain>0?Math.max(0,need-have)/gain:(need>have?9999:0);
                            if (score>bs){bs=score;best=sk;}
                        }
                        if (!best||bs===0) break;
                        jp-=10; surplus-=10;
                        if (best==="man") man+=100; else if (best==="int") int_+=100; else end+=100;
                    }
                }
            }

            if (r.jpNeeded!==null && jp>=r.jpNeeded) {
                const next=ranks[ri+1];
                if (met(next.req,man,int_,end)) {
                    jp-=r.jpNeeded; ri++;
                    results.push({rankIdx:ri, rankName:ranks[ri].name, dayReached:day});
                    if (ri===ranks.length-1) break;
                }
            }
        }
        return results;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CALCULATE
    // ─────────────────────────────────────────────────────────────────────────
    function calculate() {
      try {
        const jobKey=el.job.value;
        const job=JOBS[jobKey];
        if (!job) { el.results.innerHTML='<div class="jt-status err" style="display:block">Pick a job first.</div>'; return; }
        const ranks=job.ranks, total=ranks.length;
        // Clamp rank to a valid index — a stale dropdown value would otherwise
        // make ranks[ri] undefined and silently crash the whole handler.
        let ri=parseInt(el.rank.value);
        if (!Number.isInteger(ri) || ri<0 || ri>=total) ri=0;
        const cur=ranks[ri];
        const jp=iV(el.jp), man=iV(el.man), int_=iV(el.int), end=iV(el.end);
        const sim=simulate(jobKey,ri,jp,man,int_,end);
        let html="";

        if (ri<total-1) {
            const nx=ranks[ri+1];
            const jpNote=cur.jpNeeded!==null
                ?` <span style="font-size:10px;color:#556;font-weight:normal">· ${fmt(jp)} / ${cur.jpNeeded} JP</span>`
                :'';
            html+=sec(`Stats vs ${nx.name}${jpNote}`);
            html+=row("Manual",      pill(man,nx.req.man)+` / ${rq(nx.req.man)}`);
            html+=row("Intelligence",pill(int_,nx.req.int)+` / ${rq(nx.req.int)}`);
            html+=row("Endurance",   pill(end,nx.req.end)+` / ${rq(nx.req.end)}`);
        } else {
            html+=sec(`${cur.name} — Top Rank`);
            html+=`<div class="jt-perk">${job.topRankPerk}</div>`;
        }

        if (sim.length>1) {
            html+=sec("Timeline");
            sim.forEach((r,i)=>{
                if(!i)return;
                html+=row(`→ ${r.rankName}`,r.dayReached===0?"✓ Now":`Day ${r.dayReached} (${dateIn(r.dayReached)})`,r.rankIdx===total-1?"g":"");
            });
        }

        html+=sec("What To Do");
        html+=buildRecs(jobKey,ri,jp,man,int_,end,sim).join('');
        el.results.innerHTML=html;
        // Keep the green summary line in sync with what was just calculated,
        // so it never shows stale page-load values.
        try { refreshSummaryText(jobKey, ri, jp, man, int_, end); } catch(_){}
      } catch (err) {
        el.results.innerHTML='<div class="jt-status err" style="display:block">Couldn\'t calculate — please re-check the stat/JP fields are numbers, then try again.</div>';
        console.error('[Job Planner] calculate() failed:', err);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WHAT TO DO — action cards
    // ─────────────────────────────────────────────────────────────────────────
    function buildRecs(jobKey,ri,jp,man,int_,end,sim) {
        const job=JOBS[jobKey], ranks=job.ranks, cur=ranks[ri], total=ranks.length;
        const cards=[];

        if (ri===total-1) {
            cards.push(actionCard('good','✓ Done',
                job.topRankPerk,
                jobKey==='medical'?'Revive passive is permanent — you can leave now if you want.'
                :jobKey==='law'?'Crime exp passive is permanent — consider switching for better stat gains.'
                :''));
            return cards;
        }

        const nx=ranks[ri+1];
        const simNext = sim.find(r => r.rankIdx === ri + 1);
        const promotionDay = simNext ? simNext.dayReached : null;
        const gaps={man:Math.max(0,nx.req.man-man),int:Math.max(0,nx.req.int-int_),end:Math.max(0,nx.req.end-end)};
        const hasStatGap = gaps.man > 0 || gaps.int > 0 || gaps.end > 0;
        const jpLeft=Math.max(0,(cur.jpNeeded??0)-jp);

        if (promotionDay === 0) {
            cards.push(actionCard('now','⚡ Promote Now',
                `All requirements met for ${nx.name}`, '',
                '→ Go to the Jobs page and promote'));
        } else if (promotionDay !== null) {
            const lines = [];
            if (gaps.man > 0) lines.push(`MAN: need ${fmt(gaps.man)} more (+${cur.gain.man}/day${jobKey==='education'?' + JP boosts':''})`);
            if (gaps.int > 0) lines.push(`INT: need ${fmt(gaps.int)} more (+${cur.gain.int}/day${jobKey==='education'?' + JP boosts':''})`);
            if (gaps.end > 0) lines.push(`END: need ${fmt(gaps.end)} more (+${cur.gain.end}/day${jobKey==='education'?' + JP boosts':''})`);
            if (jpLeft > 0) lines.push(`JP: need ${fmt(jpLeft)} more at ${cur.jpPerDay}/day`);
            const badge = (hasStatGap && jpLeft <= 0) ? '⏳ Waiting on Stats'
                        : (!hasStatGap && jpLeft > 0)  ? '⏳ Waiting on JP'
                        : '⏳ Waiting on Stats + JP';
            cards.push(actionCard('now', badge,
                `Promote to ${nx.name} on ~${dateIn(promotionDay)}`,
                lines.join('<br>'),
                `in ${promotionDay}d · ${dateIn(promotionDay)}`));
        } else {
            cards.push(actionCard('info','⏳ Long Wait',
                `${nx.name} is far away`,
                'Stat and JP requirements are very high for your current gains.', ''));
        }

        let secondaryDone = false;
        if (jobKey==='education' && !secondaryDone) {
            const boostable=JOBS.education.benefits.filter(b=>ri>=b.unlockedAtRank);
            if (boostable.length) {
                const statLabel={man:'MAN',int:'INT',end:'END'};
                const surplusNow=Math.max(0,jp-(cur.jpNeeded??0));
                const boostsNow=Math.floor(surplusNow/10);
                const needBoost=boostable
                    .map(b=>b.statKey).filter((s,i,a)=>a.indexOf(s)===i)
                    .map(sk=>{
                        const gap=sk==='man'?gaps.man:sk==='int'?gaps.int:gaps.end;
                        if (!gap) return null;
                        return {sk,gap,label:statLabel[sk],boostsNeeded:Math.ceil(gap/100)};
                    }).filter(Boolean);

                if (boostsNow>0 && needBoost.length>0) {
                    const target=needBoost.sort((a,b)=>b.boostsNeeded-a.boostsNeeded)[0];
                    cards.push(actionCard('soon','📈 Spend JP Boosts',
                        `${boostsNow} boost${boostsNow!==1?'s':''} ready · put into ${target.label}`,
                        needBoost.map(x=>`${x.label}: ${fmt(x.gap)} gap · ${x.boostsNeeded} boost${x.boostsNeeded!==1?'s':''} needed`).join('<br>'),
                        '→ Education → Job Specials'));
                    secondaryDone=true;
                } else if (boostsNow>0) {
                    const nextNextRank=ranks[Math.min(ri+2,total-1)];
                    let bestStat=null,bestScore=-1;
                    for (const b of boostable) {
                        const sk=b.statKey;
                        const have=sk==='man'?man:sk==='int'?int_:end;
                        const need=sk==='man'?nextNextRank.req.man:sk==='int'?nextNextRank.req.int:nextNextRank.req.end;
                        const gain=sk==='man'?cur.gain.man:sk==='int'?cur.gain.int:cur.gain.end;
                        const score=gain>0?Math.max(0,need-have)/gain:0;
                        if(score>bestScore){bestScore=score;bestStat=sk;}
                    }
                    if (bestStat && bestScore>0) {
                        cards.push(actionCard('info','📈 JP Boosts',
                            `${boostsNow} boost${boostsNow!==1?'s':''} available · spend on ${statLabel[bestStat]}`,
                            `Passive gains + boosts already cover ${nx.name} stats — put surplus into ${statLabel[bestStat]} for ${nextNextRank.name}`,
                            '→ Education → Job Specials'));
                        secondaryDone=true;
                    }
                } else if (needBoost.length>0) {
                    const daysToFirstBoost=Math.ceil(Math.max(0,(cur.jpNeeded??0)+10-jp)/cur.jpPerDay);
                    cards.push(actionCard('info','📈 JP Boosts Needed',
                        `Spend on ${needBoost.map(x=>x.label).join(' & ')} before promoting`,
                        needBoost.map(x=>`${x.label}: ${fmt(x.gap)} gap · ${x.boostsNeeded} boost${x.boostsNeeded!==1?'s':''} needed`).join('<br>'),
                        `First boost available in ~${daysToFirstBoost}d`));
                    secondaryDone=true;
                }
            }
        }

        if (!secondaryDone && ri<total-1) {
            const topR=sim.find(r=>r.rankIdx===total-1);
            if (topR?.dayReached>0) {
                cards.push(actionCard('info','🏁 Top Rank',
                    `${ranks[total-1].name} on ${dateIn(topR.dayReached)}`,
                    job.topRankPerk,
                    `in ~${topR.dayReached} days`));
            }
        }

        return cards;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CALCULATE PLAN — Switch Job Planner
    //
    // Plain-English explanation of what this does:
    //   You are in Education (great passive stat gains). You want to end up at
    //   the top rank of some OTHER job. Two options:
    //     A) Switch to that job right now.
    //     B) Stay in Education a while longer (banking fast stat gains + JP
    //        boosts toward the target job's requirements), THEN switch.
    //   This finds the switch day that gets you to the target's top rank on the
    //   earliest calendar date, and lays it out as numbered steps.
    // ─────────────────────────────────────────────────────────────────────────
    function calculatePlan() {
        if (el.job.value !== 'education') return;
        const targetJobKey = el.planJob?.value;
        if (!targetJobKey || !JOBS[targetJobKey]) return;

        const jp0  = iV(el.jp),  man0 = iV(el.man);
        const int0 = iV(el.int), end0 = iV(el.end);
        if (!man0 && !int0 && !end0) {
            if (el.planOut) el.planOut.innerHTML = '<div style="font-size:12px;color:#557;padding:8px 0">Fill in your current stats first.</div>';
            return;
        }

        const eduRi0  = iV(el.rank);
        const eduJobs = JOBS.education;
        const eduRanks= eduJobs.ranks;
        const tJob    = JOBS[targetJobKey];
        const tRanks  = tJob.ranks;
        const tTotal  = tRanks.length;
        const topReq  = tRanks[tTotal - 1].req;
        const topRankName = tRanks[tTotal-1].name;

        function daysToTop(man, int_, end, jp) {
            const sim = simulate(targetJobKey, 0, jp, man, int_, end);
            const top = sim.find(r => r.rankIdx === tTotal - 1);
            return top ? top.dayReached : null;
        }

        const daysNow  = daysToTop(man0, int0, end0, jp0);
        const totalNow = daysNow;

        let eduMan = man0, eduInt = int0, eduEnd = end0, eduJP = jp0;
        let eduRi  = eduRi0;
        let best   = { totalDays: totalNow ?? 99999, switchDay: 0,
                       man: man0, int: int0, end: end0, jp: jp0,
                       eduRankAtSwitch: eduRi0, targetDays: daysNow ?? 99999 };

        for (let day = 1; day <= 1095; day++) {
            const r = eduRanks[Math.min(eduRi, eduRanks.length - 1)];
            eduJP  += r.jpPerDay;
            eduMan += r.gain.man;
            eduInt += r.gain.int;
            eduEnd += r.gain.end;

            const bSet = new Set(eduJobs.benefits
                .filter(b => eduRi >= b.unlockedAtRank)
                .map(b => b.statKey));

            if (bSet.size) {
                const jpReserve = (r.jpNeeded !== null) ? r.jpNeeded : 0;
                let surplus = Math.max(0, eduJP - jpReserve);
                while (surplus >= 10) {
                    let bestStat = null, bestScore = -1;
                    for (const sk of bSet) {
                        const have  = sk==="man"?eduMan : sk==="int"?eduInt : eduEnd;
                        const need  = sk==="man"?topReq.man : sk==="int"?topReq.int : topReq.end;
                        const gain  = sk==="man"?r.gain.man : sk==="int"?r.gain.int : r.gain.end;
                        const gap   = Math.max(0, need - have);
                        const score = gain > 0 ? gap / gain : (gap > 0 ? 9999 : 0);
                        if (score > bestScore) { bestScore = score; bestStat = sk; }
                    }
                    if (!bestStat || bestScore === 0) break;
                    eduJP -= 10; surplus -= 10;
                    if (bestStat==="man") eduMan += 100;
                    else if (bestStat==="int") eduInt += 100;
                    else eduEnd += 100;
                }
            }

            if (eduRi < eduRanks.length - 1 && r.jpNeeded !== null && eduJP >= r.jpNeeded) {
                const next = eduRanks[eduRi + 1];
                if (met(next.req, eduMan, eduInt, eduEnd)) {
                    eduJP -= r.jpNeeded;
                    eduRi++;
                }
            }

            const targetDays = daysToTop(eduMan, eduInt, eduEnd, 0);
            if (targetDays === null) continue;

            const total = day + targetDays;
            if (total < best.totalDays) {
                best = { totalDays: total, switchDay: day,
                         man: Math.round(eduMan), int: Math.round(eduInt),
                         end: Math.round(eduEnd), jp: Math.round(eduJP),
                         eduRankAtSwitch: eduRi, targetDays };
            }
            if (day > best.switchDay + 60) break;
        }

        // ── Build output as a numbered step-by-step plan ──────────────────────
        let html = '';
        const saving      = best.switchDay > 0 ? ((totalNow ?? best.totalDays + 1) - best.totalDays) : 0;
        const finalSim    = simulate(targetJobKey, 0, 0, best.man, best.int, best.end);
        const topRankDay  = best.switchDay + (finalSim.find(r=>r.rankIdx===tTotal-1)?.dayReached ?? 0);

        // HERO: the single takeaway
        if (best.switchDay === 0 && totalNow !== null) {
            html += `<div class="jt-switch-hero now">
                <div class="jt-switch-hero-label">✓ Best Move</div>
                <div class="jt-switch-hero-date">Switch to ${tJob.label} today</div>
                <div class="jt-switch-hero-sub">Your stats are already best spent in ${tJob.label}. Staying in Education longer won't get you to ${topRankName} any faster.</div>
                <div class="jt-switch-hero-save">🏁 ${topRankName} by ${dateIn(totalNow)} (~${totalNow} days)</div>
            </div>`;
        } else if (best.switchDay > 0) {
            html += `<div class="jt-switch-hero">
                <div class="jt-switch-hero-label">✓ Best Move</div>
                <div class="jt-switch-hero-date">Switch on ${dateIn(best.switchDay)}</div>
                <div class="jt-switch-hero-sub">Stay in Education ${best.switchDay} more day${best.switchDay!==1?'s':''} first — you'll gain stats faster there, then carry them into ${tJob.label}.${saving>0?` This reaches ${topRankName} about <strong style="color:#8de88d">${saving} day${saving!==1?'s':''} sooner</strong> than switching today.`:''}</div>
                <div class="jt-switch-hero-save">🏁 ${topRankName} by ${dateIn(topRankDay)} (~${topRankDay} days)</div>
            </div>`;
        }

        // STEP-BY-STEP
        html += `<div style="font-size:10px;font-weight:bold;color:#556;letter-spacing:.08em;text-transform:uppercase;margin:12px 0 4px">Your Plan</div>`;

        let stepNum = 1;

        if (best.switchDay > 0) {
            // Step 1: stay + what to spend JP on
            const curEduRank = JOBS.education.ranks[Math.min(eduRi0, JOBS.education.ranks.length-1)];
            const boostable  = JOBS.education.benefits.filter(b=>eduRi0>=b.unlockedAtRank);
            const slabel     = {man:'MAN',int:'INT',end:'END'};

            let jpDetail = '';
            if (boostable.length) {
                // Which stat is the worst bottleneck to the target top rank?
                let bestStat=null, bestScore=-1, bestGap=0;
                for (const b of boostable) {
                    const sk   = b.statKey;
                    const have = sk==='man'?man0:sk==='int'?int0:end0;
                    const need = sk==='man'?topReq.man:sk==='int'?topReq.int:topReq.end;
                    const gain = sk==='man'?curEduRank.gain.man:sk==='int'?curEduRank.gain.int:curEduRank.gain.end;
                    const gap  = Math.max(0, need - have);
                    const score = gain>0 ? gap/gain : (gap>0?9999:0);
                    if (score>bestScore){bestScore=score;bestStat=sk;bestGap=gap;}
                }
                if (bestStat && bestGap > 0) {
                    const boostsNeeded = Math.ceil(bestGap/100);
                    jpDetail = `Spend Education job points on <strong style="color:#aac">${slabel[bestStat]}</strong> boosts (10 JP = +100 ${slabel[bestStat]}). You need about ${boostsNeeded} boost${boostsNeeded!==1?'s':''} to close the ${fmt(bestGap)} ${slabel[bestStat]} gap to ${topRankName}.`;
                } else {
                    jpDetail = `Your stats already meet ${topRankName}'s requirements — just keep your JP for Education promotions.`;
                }
            } else {
                jpDetail = `No stat-boost specials unlocked yet — save all JP for Education promotions.`;
            }

            html += stepEl(stepNum++,
                `Stay in Education until ${dateIn(best.switchDay)}`,
                `Keep working — your stats climb fastest here. ${jpDetail}`);

            // Step 2: switch
            html += stepEl(stepNum++,
                `On ${dateIn(best.switchDay)}, switch to ${tJob.label}`,
                `Apply for ${tJob.label}. You'll carry all your Education-built stats with you.`);
        } else {
            // Switch now
            html += stepEl(stepNum++,
                `Switch to ${tJob.label} now`,
                `Apply for ${tJob.label} today — your current stats are ready.`);
        }

        // Step 3: climb to top
        const rankList = finalSim.slice(1).map(r => {
            const absDay = best.switchDay + r.dayReached;
            const isTop  = r.rankIdx === tTotal - 1;
            return `${isTop?'🏁 <strong style="color:#6acc6a">':''}${r.rankName}${isTop?'</strong>':''} — ${dateIn(absDay)}`;
        });
        html += stepEl(stepNum++,
            `Climb to ${topRankName}`,
            rankList.join('<br>'));

        // Step 4: perk
        html += stepEl(stepNum++,
            `Unlock the perk`,
            tJob.topRankPerk);

        if (el.planOut) el.planOut.innerHTML = html;
    }

    function tryInit() {
        if(document.querySelector('.jrank')&&document.querySelector('.jmanLabor')){
            try { autofill(); calculate(); } catch(err){ console.error('[Job Planner] auto-init failed (non-fatal):', err); }
            wrap.classList.add("open"); jt_save("collapsed","no");
            updatePlanner(); return true;
        }
        return false;
    }
    (function() {
        const ws = cache.get('workstats');
        if (ws) {
            if (ws.man > 0 && !parseInt(jt_load('manStat'))) { jt_save('manStat', String(ws.man)); }
            if (ws.int > 0 && !parseInt(jt_load('intStat'))) { jt_save('intStat', String(ws.int)); }
            if (ws.end > 0 && !parseInt(jt_load('endStat'))) { jt_save('endStat', String(ws.end)); }
        }
    })();

    if(!tryInit()){
        const obs=new MutationObserver(()=>{if(tryInit())obs.disconnect();});
        obs.observe(document.body,{childList:true,subtree:true});
        setTimeout(()=>obs.disconnect(),10000);
    }

    // =========================================================================
    // INTERVIEW ANSWER HELPER
    // =========================================================================
    const INTERVIEW_QA = {
        army: [
            { q: "brain bucket",                                    a: "A helmet",                                          ap: "helmet" },
            { q: "when did world war 2 start",                      a: "1939",                                              ap: "^1939$|\\b1939\\b" },
            { q: "this is my rifle",                                a: "Fighting, Fun",                                     ap: "fighting" },
            { q: "jarhead",                                         a: "United States Marine",                              ap: "united states marine" },
            { q: "usmc.*stand for",                                 a: "United States Marine Corps",                        ap: "marine corps" },
            { q: "higher rank in the army",                         a: "General",                                           ap: "^general$|\\bgeneral\\b" },
            { q: "acronym.*rpg|rpg.*stand",                         a: "Rocket propelled grenade",                          ap: "rocket propelled grenade" },
            { q: "not a rank in the us army",                       a: "Admiral",                                           ap: "admiral" },
            { q: "never been at war with",                          a: "France",                                            ap: "^france$|\\bfrance\\b" },
        ],
        grocer: [
            { q: "does not grow on.*tree",                          a: "Strawberries",                                      ap: "strawberr" },
            { q: "not a stone fruit",                               a: "Pear",                                              ap: "^pear$|\\bpear\\b" },
            { q: "cannot find what they.*re looking",               a: "Leave their name and number",                       ap: "name and number" },
            { q: "cannot be rhymed",                                a: "Orange",                                            ap: "^orange$|\\borange\\b" },
            { q: "when is the customer right",                      a: "The customer is always right",                      ap: "always right" },
            { q: "stolen some produce",                             a: "Call the police",                                   ap: "call the police" },
            { q: "hands you the money",                             a: "Place money in the till and give change",           ap: "till|change" },
            { q: "produce is starting to go.*rotten",               a: "Immediately dispose of the rotting produce",        ap: "dispos" },
            { q: "mistaken as a vegetable",                         a: "Tomato",                                            ap: "^tomato$|\\btomato\\b" },
        ],
        casino: [
            { q: "common currency used in casinos",                 a: "Chips",                                             ap: "^chips$|\\bchips\\b" },
            { q: "overhead camera",                                 a: "Eye in the Sky",                                    ap: "eye in the sky" },
            { q: "type of poker game",                              a: "Texas Hold'em",                                     ap: "texas hold" },
            { q: "blackjack.*lowest number.*does not hit",          a: "17",                                                ap: "^17$|\\b17\\b" },
            { q: "better hand",                                     a: "Royal Flush",                                       ap: "royal flush" },
            { q: "would not beat a pair of fives",                  a: "A Pair of twos",                                    ap: "pair of twos" },
            { q: "not usually found in a casino",                   a: "A clock",                                           ap: "clock" },
            { q: "bigger payout",                                   a: "50 / 1",                                            ap: "50" },
            { q: "cash out",                                        a: "Exchange their credit back to cash",                ap: "exchange.*credit|credit.*cash" },
        ],
        medical: [
            { q: "embedded object.*arm.*artery",                    a: "Apply a dressing around the object",                ap: "dressing around the object" },
            { q: "how much blood",                                  a: "5 liters",                                          ap: "5 liters" },
            { q: "tachycardia",                                     a: "An accelerated heart rate",                         ap: "accelerated heart rate" },
            { q: "femur",                                           a: "Thigh bone",                                        ap: "thigh bone" },
            { q: "clutching their throat choking",                  a: "Perform the Heimlich Maneuver",                     ap: "heimlich" },
            { q: "how many bones",                                  a: "206",                                               ap: "^206$|\\b206\\b" },
            { q: "dre is an examination",                           a: "Rectum",                                            ap: "^rectum$|\\brectum\\b" },
            { q: "normal core body temperature",                    a: "37.0 degrees celsius",                              ap: "37" },
            { q: "soldiers disease",                                a: "Morphine addiction",                                ap: "morphine" },
        ],
        education: [
            { q: "illiterate",                                      a: "They cannot read or write",                         ap: "cannot read or write" },
            { q: "fill the gap.*loud noise",                        a: "There",                                             ap: "^there$|\\bthere\\b" },
            { q: "bullying another pupil",                          a: "Put bully in detention and send letter home",       ap: "detention" },
            { q: "adverb is what",                                  a: "A word describing an action",                       ap: "beautifully|describing an action" },
            { q: "x.*15.*27|27.*x.*15",                             a: "12",                                                ap: "^12$|\\b12\\b" },
            { q: "quoth the raven",                                 a: "Never more",                                        ap: "never more" },
            { q: "correct spelling",                                a: "Miscellaneous",                                     ap: "miscellaneous" },
            { q: "fallen over.*cut her knee",                       a: "Send her to the school nurse",                      ap: "school nurse" },
            { q: "sat.*college admissions",                         a: "Scholastic Aptitude Test",                          ap: "scholastic aptitude" },
        ],
        law: [
            { q: "purpose of the jury",                             a: "To give a true verdict based on evidence",          ap: "true verdict" },
            { q: "highest court",                                   a: "Supreme Court",                                     ap: "supreme court" },
            { q: "intentionally cause damage to property",          a: "Vandalism",                                         ap: "^vandalism$|\\bvandalism\\b" },
            { q: "how do you start a civil action",                 a: "File a complaint with the court",                   ap: "file a complaint" },
            { q: "plea bargain",                                    a: "Incentive for defendant to plead guilty",           ap: "plead guilty" },
            { q: "hiding from the law",                             a: "Fugitive from Justice",                             ap: "fugitive" },
            { q: "civil wrong",                                     a: "Tort",                                              ap: "^tort$|\\btort\\b" },
            { q: "usual basis for filing a civil lawsuit",          a: "Negligence, intentional acts or breach of contract", ap: "negligence" },
            { q: "only crime that doesn.*t occur during full moon", a: "Murder",                                            ap: "^murder$|\\bmurder\\b" },
        ],
    };

    document.head.insertAdjacentHTML('beforeend', `<style>
.ih-correct > .speech-wrap,
.ih-correct > .speech-wrap > .link {
    outline: 3px solid #5abf5a !important;
    box-shadow: 0 0 10px #3a9a3a55 !important;
    background: #0d2a0d !important;
    border-radius: 4px;
    position: relative;
}
.ih-correct > .speech-wrap > .link::after {
    content: "✓ Correct";
    position: absolute;
    top: 50%; right: 8px;
    transform: translateY(-50%);
    background: #2a6a2a; color: #9fe89f;
    font-size: 11px; font-weight: bold;
    padding: 2px 7px; border-radius: 3px;
    pointer-events: none; z-index: 10000;
    white-space: nowrap;
}
.ih-wrong > .speech-wrap { opacity: 0.35 !important; }
#ih-panel {
    position: fixed; bottom: 70px; right: 14px;
    width: 290px;
    background: #141414; border: 1px solid #2a5a2a;
    border-radius: 7px; box-shadow: 0 4px 18px #0009;
    font-family: Arial, sans-serif; font-size: 13px; color: #ccc;
    z-index: 99999;
}
#ih-panel-hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px;
    background: linear-gradient(135deg, #1a2e1a, #141414);
    border-bottom: 1px solid #2a4a2a; border-radius: 7px 7px 0 0;
    cursor: pointer; user-select: none; -webkit-user-select: none;
}
#ih-panel-title { font-size: 13px; font-weight: bold; color: #7abf7a; }
#ih-panel-tog { font-size: 12px; color: #456; transition: transform .2s; }
#ih-panel.ih-collapsed #ih-panel-tog { transform: rotate(180deg); }
#ih-panel-body { padding: 10px 12px; }
#ih-panel.ih-collapsed #ih-panel-body { display: none; }
.ih-qa-q { font-size: 11px; color: #778; line-height: 1.4; margin-bottom: 4px; }
.ih-qa-a {
    font-size: 13px; font-weight: bold; color: #7abf7a;
    background: #0e2010; border: 1px solid #2a4a2a;
    border-radius: 4px; padding: 5px 10px; line-height: 1.5;
}
.ih-qa-a.ih-unknown { color: #bf9f5a; background: #201a0e; border-color: #4a3a18; }
.ih-empty { font-size: 12px; color: #446; }
</style>`);

    const ihNorm = s =>
        s.toLowerCase()
         .replace(/[\u201c\u201d\u2018\u2019'"]/g, "'")
         .replace(/[^a-z0-9 ']/g, ' ')
         .replace(/\s+/g, ' ')
         .trim();

    const ihMatchEntry = (jobKey, normQ) => {
        const pool = INTERVIEW_QA[jobKey];
        if (!pool) return null;
        for (const e of pool)
            if (new RegExp(e.q, 'i').test(normQ)) return e;
        return null;
    };

    const ihFindOpt = (els, ap) => {
        const rx = new RegExp(ap, 'i');
        return els.find(e => rx.test(ihNorm(e.textContent))) || null;
    };

    function ihIsInterview() {
        return location.href.includes('joblist.php') && location.href.includes('p=interview');
    }

    function ihJobFromURL() {
        const m = location.href.match(/[?&#]job=([a-zA-Z]+)/);
        if (!m) return null;
        const raw = m[1].toLowerCase();
        if (raw === 'grocery') return 'grocer';
        return INTERVIEW_QA[raw] ? raw : null;
    }

    let ihPanel = null;

    function ihEnsurePanel() {
        if (ihPanel) return;
        ihPanel = document.createElement('div');
        ihPanel.id = 'ih-panel';
        ihPanel.innerHTML = `
            <div id="ih-panel-hdr">
                <span id="ih-panel-title">📋 Interview Helper</span>
                <span id="ih-panel-tog">▲</span>
            </div>
            <div id="ih-panel-body">
                <div class="ih-empty">Waiting for question…</div>
            </div>`;
        document.body.appendChild(ihPanel);
        ihPanel.querySelector('#ih-panel-hdr').addEventListener('click', () => {
            ihPanel.classList.toggle('ih-collapsed');
            _save('ih_collapsed', ihPanel.classList.contains('ih-collapsed') ? 'yes' : 'no');
        });
        if (_load('ih_collapsed', 'no') === 'yes') ihPanel.classList.add('ih-collapsed');
    }

    function ihRemovePanel() {
        if (!ihPanel) return;
        ihPanel.remove();
        ihPanel = null;
    }

    function ihSetPanel(qText, entry) {
        if (!ihPanel) return;
        const body = ihPanel.querySelector('#ih-panel-body');
        if (!qText) {
            body.innerHTML = '<div class="ih-empty">Waiting for question…</div>';
        } else if (!entry) {
            body.innerHTML = `
                <div class="ih-qa-q">${qText}</div>
                <div class="ih-qa-a ih-unknown">⚠ Answer not in database</div>`;
        } else {
            body.innerHTML = `
                <div class="ih-qa-q">${qText}</div>
                <div class="ih-qa-a">✓ ${entry.a}</div>`;
        }
    }

    let ihLastQ = '';

    function ihProcess() {
        if (!ihIsInterview()) {
            ihRemovePanel();
            ihLastQ = '';
            return;
        }
        ihEnsurePanel();

        const jobKey = ihJobFromURL();
        if (!jobKey) { ihSetPanel('', null); return; }

        const dialogs = document.querySelectorAll(
            '.interviewer-wrap.dialog.speech-right, .interviewer-wrap.dialog'
        );
        if (!dialogs.length) { ihSetPanel('', null); return; }

        const lastDialog = dialogs[dialogs.length - 1];
        const speechWrap = lastDialog.querySelector('.speech-wrap');
        if (!speechWrap) { ihSetPanel('', null); return; }

        const authorEl = speechWrap.querySelector('.author');
        let rawQ = speechWrap.textContent || '';
        if (authorEl) rawQ = rawQ.replace(authorEl.textContent, '').replace(/^\s*:\s*/, '');
        rawQ = rawQ.replace(/[\u201c\u201d\u201e\u2033]/g, '').trim();

        const answerDivs = Array.from(document.querySelectorAll('.interviewer-wrap.answer'));
        if (answerDivs.length < 3) { ihSetPanel('', null); return; }

        if (rawQ === ihLastQ) return;
        ihLastQ = rawQ;

        const normQ = ihNorm(rawQ);
        const links = answerDivs.map(
            div => div.querySelector('.link.t-blue-cont a') || div.querySelector('a')
        ).filter(Boolean);
        if (links.length < 3) return;

        const entry = ihMatchEntry(jobKey, normQ);
        answerDivs.forEach(div => div.classList.remove('ih-correct', 'ih-wrong'));
        if (entry) {
            const correctLink = ihFindOpt(links, entry.ap);
            answerDivs.forEach((div, i) => {
                div.classList.add(links[i] === correctLink ? 'ih-correct' : 'ih-wrong');
            });
        }

        ihSetPanel(rawQ, entry || null);
    }

    (function ihInit() {
        if (!location.href.includes('joblist.php')) return;
        ihProcess();
        let rafId = null;
        const obs = new MutationObserver(() => {
            if (rafId) return;
            rafId = requestAnimationFrame(() => { rafId = null; ihProcess(); });
        });
        obs.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('hashchange', () => { ihLastQ = ''; ihProcess(); });
        window.addEventListener('popstate',   () => { ihLastQ = ''; ihProcess(); });
    })();

})();