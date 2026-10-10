// ==UserScript==
// @name         Torn Education Planner
// @namespace    iSatomi
// @version      3.0
// @description  Education course tracker, queue planner, and progress for Torn City
// @author       iSatomi [3580191]
// @license MIT
// @match        https://www.torn.com/page.php?sid=education*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/574917/Torn%20Education%20Planner.user.js
// @updateURL https://update.greasyfork.org/scripts/574917/Torn%20Education%20Planner.meta.js
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



    const SUBJECTS = {
        BIO: { label: "Biology",           color: "#4a8a5a" },
        BUS: { label: "Business",          color: "#6a6aaa" },
        CBT: { label: "Combat Training",   color: "#aa5a3a" },
        CMT: { label: "Computer Science",  color: "#3a7aaa" },
        DEF: { label: "Self Defense",      color: "#8a5aaa" },
        GEN: { label: "General Studies",   color: "#7a7a5a" },
        HAF: { label: "Health & Fitness",  color: "#5a9a5a" },
        HIS: { label: "History",           color: "#9a7a3a" },
        LAW: { label: "Law",               color: "#7a5a3a" },
        MTH: { label: "Mathematics",       color: "#3a8a9a" },
        PSY: { label: "Psychology",        color: "#9a5a7a" },
        SPT: { label: "Sports Science",    color: "#5a9a7a" },
    };

    // Tier: 1=intro (always 7d), 2=mid, 3=bachelor
    // prereqs: array of course codes that must be completed first
    const COURSES = [
        // ── BIOLOGY (9 courses) ───────────────────────────────────────────────
        { id:"BIO1340", subj:"BIO", tier:1, days:7,  prereqs:[],                                                                                          name:"Introduction to Biochemistry",           perk:"" },
        { id:"BIO2127", subj:"BIO", tier:2, days:21, prereqs:["BIO1340"],                                                                                  name:"Intravenous Therapy",                    perk:"Use blood bags to heal yourself and others" },
        { id:"BIO2350", subj:"BIO", tier:2, days:21, prereqs:["BIO1340"],                                                                                  name:"Evolution",                              perk:"+3% damage to chest shots" },
        { id:"BIO2360", subj:"BIO", tier:2, days:28, prereqs:["BIO1340"],                                                                                  name:"Intermediate Biochemistry",              perk:"+10% medical item effectiveness" },
        { id:"BIO2370", subj:"BIO", tier:2, days:35, prereqs:["BIO2360"],                                                                                  name:"Advanced Biochemistry",                  perk:"+10% further medical item effectiveness" },
        { id:"BIO2380", subj:"BIO", tier:2, days:21, prereqs:["BIO1340"],                                                                                  name:"Fundamentals Of Neurobiology",           perk:"+3% damage to throat shots" },
        { id:"BIO2390", subj:"BIO", tier:2, days:21, prereqs:["BIO1340"],                                                                                  name:"Chromosomes And Gene Functions",         perk:"+3% damage to stomach shots" },
        { id:"BIO2400", subj:"BIO", tier:2, days:21, prereqs:["BIO1340"],                                                                                  name:"Forensic Science",                       perk:"Decrease opponent stealth by 25%" },
        { id:"BIO2410", subj:"BIO", tier:2, days:28, prereqs:["BIO1340"],                                                                                  name:"Anatomy",                                perk:"+3% critical hit chance" },
        { id:"BIO3420", subj:"BIO", tier:3, days:42, prereqs:["BIO2127","BIO2350","BIO2360","BIO2370","BIO2380","BIO2390","BIO2400","BIO2410"],             name:"Bachelor Of Biology",                    perk:"Equip life/stat booster temps + unlock Pharmacy" },
        // ── BUSINESS (13 courses) ────────────────────────────────────────────
        { id:"BUS1100", subj:"BUS", tier:1, days:7,  prereqs:[],                                                                                          name:"Introduction To Business",               perk:"" },
        { id:"BUS2100", subj:"BUS", tier:2, days:14, prereqs:["BUS1100"],                                                                                  name:"Business Ethics",                        perk:"Small increase in company popularity" },
        { id:"BUS2110", subj:"BUS", tier:2, days:21, prereqs:["BUS1100"],                                                                                  name:"Human Resource Management",              perk:"Passive bonus to employee working stats" },
        { id:"BUS2120", subj:"BUS", tier:2, days:21, prereqs:["BUS1100"],                                                                                  name:"E-Commerce",                             perk:"+2% company productivity" },
        { id:"BUS2200", subj:"BUS", tier:2, days:21, prereqs:["BUS1100"],                                                                                  name:"Statistics",                             perk:"+2% company productivity" },
        { id:"BUS2300", subj:"BUS", tier:2, days:21, prereqs:["BUS1100"],                                                                                  name:"Communication",                          perk:"+5% employee effectiveness" },
        { id:"BUS2400", subj:"BUS", tier:2, days:21, prereqs:["BUS1100"],                                                                                  name:"Marketing",                              perk:"Increase advertising effectiveness" },
        { id:"BUS2500", subj:"BUS", tier:2, days:21, prereqs:["BUS1100"],                                                                                  name:"Corporate Finance",                      perk:"+2% company productivity" },
        { id:"BUS2600", subj:"BUS", tier:2, days:28, prereqs:["BUS1100"],                                                                                  name:"Corporate Strategy",                     perk:"+7% employee effectiveness" },
        { id:"BUS2700", subj:"BUS", tier:2, days:21, prereqs:["BUS1100"],                                                                                  name:"Pricing Strategy",                       perk:"+10% product price ceiling" },
        { id:"BUS2800", subj:"BUS", tier:2, days:21, prereqs:["BUS1100"],                                                                                  name:"Logistics",                              perk:"+2% company productivity" },
        { id:"BUS2900", subj:"BUS", tier:2, days:21, prereqs:["BUS1100"],                                                                                  name:"Product Management",                     perk:"+5% product price ceiling" },
        { id:"BUS3130", subj:"BUS", tier:3, days:42, prereqs:["BUS2100","BUS2110","BUS2120","BUS2200","BUS2300","BUS2400","BUS2500","BUS2600","BUS2700","BUS2800","BUS2900"], name:"Bachelor Of Commerce",          perk:"Unlock new company size/storage/staff upgrades" },
        // ── COMBAT TRAINING (10 courses) ─────────────────────────────────────
        { id:"CBT1780", subj:"CBT", tier:1, days:7,  prereqs:[],                                                                                          name:"Introduction To Combat",                 perk:"" },
        { id:"CBT2125", subj:"CBT", tier:2, days:14, prereqs:["CBT1780"],                                                                                  name:"Study Of Shotguns",                      perk:"+5% accuracy with shotguns" },
        { id:"CBT2790", subj:"CBT", tier:2, days:14, prereqs:["CBT1780"],                                                                                  name:"Military Psychology",                    perk:"+3% damage in all attacks" },
        { id:"CBT2800", subj:"CBT", tier:2, days:14, prereqs:["CBT1780"],                                                                                  name:"Study Of War And Technology",            perk:"+5% accuracy with temporary weapons" },
        { id:"CBT2810", subj:"CBT", tier:2, days:14, prereqs:["CBT1780"],                                                                                  name:"Study Of Society And Warfare",           perk:"+5% accuracy with melee weapons" },
        { id:"CBT2820", subj:"CBT", tier:2, days:14, prereqs:["CBT1780"],                                                                                  name:"Study Of Machine Guns",                  perk:"+5% accuracy with machine guns" },
        { id:"CBT2830", subj:"CBT", tier:2, days:14, prereqs:["CBT1780"],                                                                                  name:"Study Of Submachine Guns",               perk:"+5% accuracy with sub-machine guns" },
        { id:"CBT2840", subj:"CBT", tier:2, days:14, prereqs:["CBT1780"],                                                                                  name:"Study Of Pistols",                       perk:"+5% accuracy with pistols" },
        { id:"CBT2850", subj:"CBT", tier:2, days:14, prereqs:["CBT1780"],                                                                                  name:"Study Of Rifles",                        perk:"+5% accuracy with rifles" },
        { id:"CBT2860", subj:"CBT", tier:2, days:14, prereqs:["CBT1780"],                                                                                  name:"Study Of Heavy Artillery",               perk:"+5% accuracy with heavy artillery" },
        { id:"CBT3870", subj:"CBT", tier:3, days:42, prereqs:["CBT2125","CBT2790","CBT2800","CBT2810","CBT2820","CBT2830","CBT2840","CBT2850","CBT2860"],  name:"Bachelor Of Military Arts And Science",  perk:"Start gaining weapon experience" },
        // ── COMPUTER SCIENCE (16 courses) ────────────────────────────────────
        { id:"CMT1520", subj:"CMT", tier:1, days:7,  prereqs:[],                                                                                          name:"Introduction To Computing",              perk:"Code simple viruses" },
        { id:"CMT2128", subj:"CMT", tier:2, days:21, prereqs:["CMT2570"],                                                                                  name:"Overclocking",                           perk:"+10% overclocking cracking bonus" },
        { id:"CMT2129", subj:"CMT", tier:2, days:28, prereqs:["CMT2128"],                                                                                  name:"Advanced Overclocking",                  perk:"+15% overclocking cracking bonus" },
        { id:"CMT2130", subj:"CMT", tier:2, days:21, prereqs:["CMT2530"],                                                                                  name:"Web Security And Penetration Testing",   perk:"+10% hacking success rate" },
        { id:"CMT2131", subj:"CMT", tier:2, days:21, prereqs:["CMT2530"],                                                                                  name:"Automated Data Mining & Processing",     perk:"+10% data mining success rate" },
        { id:"CMT2230", subj:"CMT", tier:2, days:14, prereqs:["CMT1520"],                                                                                  name:"Web Design And Development",             perk:"+5% company advertising effectiveness" },
        { id:"CMT2530", subj:"CMT", tier:2, days:21, prereqs:["CMT1520"],                                                                                  name:"Intermediate Programming",               perk:"Code Polymorphic and Tunneling viruses" },
        { id:"CMT2540", subj:"CMT", tier:2, days:14, prereqs:["CMT1520"],                                                                                  name:"Networking",                             perk:"+5% hacking success rate" },
        { id:"CMT2550", subj:"CMT", tier:2, days:14, prereqs:["CMT1520"],                                                                                  name:"Computer Repair",                        perk:"+5% company productivity" },
        { id:"CMT2560", subj:"CMT", tier:2, days:28, prereqs:["CMT2530"],                                                                                  name:"Algorithms And Advanced Programming",    perk:"Code Armored and Stealth viruses" },
        { id:"CMT2570", subj:"CMT", tier:2, days:21, prereqs:["CMT1520"],                                                                                  name:"Fundamentals Of Computer Architecture", perk:"+5% computer speed" },
        { id:"CMT2580", subj:"CMT", tier:2, days:21, prereqs:["CMT1520"],                                                                                  name:"Software Engineering",                   perk:"+5% virus effectiveness" },
        { id:"CMT2590", subj:"CMT", tier:2, days:28, prereqs:["CMT1520"],                                                                                  name:"Quantum Computing",                      perk:"+10% virus effectiveness" },
        { id:"CMT2600", subj:"CMT", tier:2, days:28, prereqs:["CMT1520"],                                                                                  name:"Natural Language Engineering",           perk:"+5% virus detection avoidance" },
        { id:"CMT2610", subj:"CMT", tier:2, days:28, prereqs:["CMT2540"],                                                                                  name:"Computer Security And Defense",          perk:"+10% hacking crime success rate" },
        { id:"CMT3620", subj:"CMT", tier:3, days:42, prereqs:["CMT2128","CMT2129","CMT2130","CMT2131","CMT2230","CMT2530","CMT2540","CMT2550","CMT2560","CMT2570","CMT2580","CMT2590","CMT2600","CMT2610"], name:"Bachelor Of Computer Science", perk:"Send mails anonymously" },
        // ── SELF DEFENSE (7 courses) ──────────────────────────────────────────
        { id:"DEF1700", subj:"DEF", tier:1, days:7,  prereqs:[],                                                                                          name:"Introduction To Self Defense",           perk:"" },
        { id:"DEF2710", subj:"DEF", tier:2, days:14, prereqs:["DEF1700"],                                                                                  name:"Judo",                                   perk:"+1% passive defense bonus" },
        { id:"DEF2720", subj:"DEF", tier:2, days:14, prereqs:["DEF1700"],                                                                                  name:"Kick Boxing",                            perk:"Unlock kick attack" },
        { id:"DEF2730", subj:"DEF", tier:2, days:21, prereqs:["DEF1700"],                                                                                  name:"Krav Maga",                              perk:"+1% passive speed bonus" },
        { id:"DEF2740", subj:"DEF", tier:2, days:21, prereqs:["DEF1700"],                                                                                  name:"Jujitsu",                                perk:"+1% passive defense bonus" },
        { id:"DEF2750", subj:"DEF", tier:2, days:21, prereqs:["DEF1700"],                                                                                  name:"Tae Kwon Do",                            perk:"+1% passive speed bonus" },
        { id:"DEF2760", subj:"DEF", tier:2, days:21, prereqs:["DEF1700"],                                                                                  name:"Muay Thai",                              perk:"+1% passive strength bonus" },
        { id:"DEF3770", subj:"DEF", tier:3, days:35, prereqs:["DEF2710","DEF2720","DEF2730","DEF2740","DEF2750","DEF2760"],                                name:"Bachelor Of Self Defense",               perk:"+100% fist/kick damage" },
        // ── GENERAL STUDIES (12 courses) ─────────────────────────────────────
        { id:"GEN1112", subj:"GEN", tier:1, days:7,  prereqs:[],                                                                                          name:"Introduction To General Studies",        perk:"" },
        { id:"GEN2113", subj:"GEN", tier:2, days:14, prereqs:["GEN1112"],                                                                                  name:"Driving License",                        perk:"Drive cars in the city" },
        { id:"GEN2114", subj:"GEN", tier:2, days:14, prereqs:["GEN1112"],                                                                                  name:"Astronomy",                              perk:"+3% city find chance" },
        { id:"GEN2115", subj:"GEN", tier:2, days:14, prereqs:["GEN1112"],                                                                                  name:"Mechanical Arts",                        perk:"+5% city find chance" },
        { id:"GEN2116", subj:"GEN", tier:2, days:14, prereqs:["GEN1112"],                                                                                  name:"General Mechanics",                      perk:"+5% hit increase with temporary weapons" },
        { id:"GEN2117", subj:"GEN", tier:2, days:14, prereqs:["GEN1112"],                                                                                  name:"Basic English",                          perk:"+5% effectiveness negotiating bail" },
        { id:"GEN2118", subj:"GEN", tier:2, days:14, prereqs:["GEN1112"],                                                                                  name:"Creative Writing",                       perk:"+5% company advertising effectiveness" },
        { id:"GEN2119", subj:"GEN", tier:2, days:21, prereqs:["GEN1112"],                                                                                  name:"General Science",                        perk:"+5% damage with temporary weapons" },
        { id:"GEN2120", subj:"GEN", tier:2, days:14, prereqs:["GEN1112"],                                                                                  name:"Survival Skills",                        perk:"+15% hunting bonus" },
        { id:"GEN2122", subj:"GEN", tier:2, days:21, prereqs:["GEN1112"],                                                                                  name:"Newtonian Physics",                      perk:"+5% damage with thrown weapons" },
        { id:"GEN2123", subj:"GEN", tier:2, days:21, prereqs:["GEN1112"],                                                                                  name:"Ivory Crafting",                         perk:"+5% city find chance" },
        { id:"GEN3121", subj:"GEN", tier:3, days:42, prereqs:["GEN2113","GEN2114","GEN2115","GEN2116","GEN2117","GEN2118","GEN2119","GEN2120","GEN2122","GEN2123"], name:"Bachelor Of General Studies",  perk:"+10% working stat gains from all education" },
        // ── HEALTH & FITNESS (8 courses) ─────────────────────────────────────
        { id:"HAF1103", subj:"HAF", tier:1, days:7,  prereqs:[],                                                                                          name:"Introduction To Health And Fitness",     perk:"" },
        { id:"HAF2104", subj:"HAF", tier:2, days:14, prereqs:["HAF1103"],                                                                                  name:"Aerobics",                               perk:"+1% passive dexterity bonus" },
        { id:"HAF2105", subj:"HAF", tier:2, days:14, prereqs:["HAF1103"],                                                                                  name:"Acrobatics",                             perk:"+1% passive speed bonus" },
        { id:"HAF2106", subj:"HAF", tier:2, days:14, prereqs:["HAF1103"],                                                                                  name:"Power Lifting",                          perk:"+1% passive strength bonus" },
        { id:"HAF2107", subj:"HAF", tier:2, days:14, prereqs:["HAF1103"],                                                                                  name:"Yoga",                                   perk:"+2% passive strength bonus" },
        { id:"HAF2108", subj:"HAF", tier:2, days:14, prereqs:["HAF1103"],                                                                                  name:"Swimming",                               perk:"+1% passive dexterity bonus" },
        { id:"HAF2109", subj:"HAF", tier:2, days:28, prereqs:["HAF1103"],                                                                                  name:"Marathon Training",                      perk:"+3% passive speed bonus" },
        { id:"HAF2110", subj:"HAF", tier:2, days:14, prereqs:["HAF1103"],                                                                                  name:"Sailing",                                perk:"+5% travel speed" },
        { id:"HAF3111", subj:"HAF", tier:3, days:35, prereqs:["HAF2104","HAF2105","HAF2106","HAF2107","HAF2108","HAF2109","HAF2110"],                       name:"Bachelor Of Health Sciences",            perk:"+25% speed during escape + 50% reduce chance opponent flees" },
        // ── HISTORY (7 courses) ───────────────────────────────────────────────
        { id:"HIS1140", subj:"HIS", tier:1, days:7,  prereqs:[],                                                                                          name:"Introduction To History",                perk:"" },
        { id:"HIS2150", subj:"HIS", tier:2, days:21, prereqs:["HIS1140"],                                                                                  name:"Aims And Methods In Archaeology",        perk:"+10% city find chance" },
        { id:"HIS2160", subj:"HIS", tier:2, days:21, prereqs:["HIS1140"],                                                                                  name:"Ancient Japanese History",               perk:"+10% damage with Japanese blade weapons" },
        { id:"HIS2170", subj:"HIS", tier:2, days:21, prereqs:["HIS1140"],                                                                                  name:"Medieval History",                       perk:"+10% damage with clubbing weapons" },
        { id:"HIS2180", subj:"HIS", tier:2, days:21, prereqs:["HIS1140"],                                                                                  name:"Medieval Archaeology",                   perk:"+10% damage with piercing weapons" },
        { id:"HIS2190", subj:"HIS", tier:2, days:21, prereqs:["HIS1140"],                                                                                  name:"South Asian Archaeology",                perk:"+10% city find chance" },
        { id:"HIS2200", subj:"HIS", tier:2, days:21, prereqs:["HIS1140"],                                                                                  name:"Egyptian Archaeology",                   perk:"+10% damage with slashing weapons" },
        { id:"HIS3210", subj:"HIS", tier:3, days:42, prereqs:["HIS2150","HIS2160","HIS2170","HIS2180","HIS2190","HIS2200"],                                name:"Bachelor Of History",                    perk:"Unlock museum" },
        // ── LAW (14 courses) ──────────────────────────────────────────────────
        { id:"LAW1880", subj:"LAW", tier:1, days:7,  prereqs:[],                                                                                          name:"Introduction To Law",                    perk:"" },
        { id:"LAW2100", subj:"LAW", tier:2, days:21, prereqs:["LAW1880"],                                                                                  name:"Media Law",                              perk:"Increase advertising effectiveness" },
        { id:"LAW2101", subj:"LAW", tier:2, days:21, prereqs:["LAW1880"],                                                                                  name:"Revenue Law",                            perk:"-5% bail cost" },
        { id:"LAW2890", subj:"LAW", tier:2, days:21, prereqs:["LAW1880"],                                                                                  name:"Public Law",                             perk:"-25% nerve to escape jail" },
        { id:"LAW2900", subj:"LAW", tier:2, days:21, prereqs:["LAW1880"],                                                                                  name:"Common Law",                             perk:"Buy yourself/others out of jail while in jail" },
        { id:"LAW2910", subj:"LAW", tier:2, days:21, prereqs:["LAW1880"],                                                                                  name:"Property Law",                           perk:"-5% property upgrade cost" },
        { id:"LAW2920", subj:"LAW", tier:2, days:21, prereqs:["LAW1880"],                                                                                  name:"Criminal Law",                           perk:"+5% crime success rate" },
        { id:"LAW2930", subj:"LAW", tier:2, days:28, prereqs:["LAW1880"],                                                                                  name:"Administrative Law",                     perk:"+5% busting skill" },
        { id:"LAW2940", subj:"LAW", tier:2, days:21, prereqs:["LAW1880"],                                                                                  name:"Commercial And Consumer Law",            perk:"+5% company profit" },
        { id:"LAW2950", subj:"LAW", tier:2, days:21, prereqs:["LAW1880"],                                                                                  name:"Family Law",                             perk:"-5% bail cost" },
        { id:"LAW2960", subj:"LAW", tier:2, days:28, prereqs:["LAW1880"],                                                                                  name:"Labor Law",                              perk:"+5% employee effectiveness" },
        { id:"LAW2970", subj:"LAW", tier:2, days:28, prereqs:["LAW1880"],                                                                                  name:"Social And Economic Law",                perk:"+5% busting skill" },
        { id:"LAW2980", subj:"LAW", tier:2, days:28, prereqs:["LAW1880"],                                                                                  name:"Use Of Force In International Law",      perk:"+5% crime success rate" },
        { id:"LAW2990", subj:"LAW", tier:2, days:28, prereqs:["LAW1880"],                                                                                  name:"International Human Rights",             perk:"-10% bail cost" },
        { id:"LAW3102", subj:"LAW", tier:3, days:42, prereqs:["LAW2100","LAW2101","LAW2890","LAW2900","LAW2910","LAW2920","LAW2930","LAW2940","LAW2950","LAW2960","LAW2970","LAW2980","LAW2990"], name:"Bachelor Of Law", perk:"Greatly increased busting skill" },
        // ── MATHEMATICS (10 courses) ─────────────────────────────────────────
        { id:"MTH1220", subj:"MTH", tier:1, days:7,  prereqs:[],                                                                                          name:"Introduction To Mathematics",            perk:"" },
        { id:"MTH2240", subj:"MTH", tier:2, days:21, prereqs:["MTH1220"],                                                                                  name:"Essential Foundation Mathematics",       perk:"+1% passive speed bonus" },
        { id:"MTH2250", subj:"MTH", tier:2, days:21, prereqs:["MTH1220"],                                                                                  name:"Intermediate Mathematics",               perk:"+1% passive speed bonus" },
        { id:"MTH2260", subj:"MTH", tier:2, days:21, prereqs:["MTH1220"],                                                                                  name:"Geometry",                               perk:"+1% passive defense bonus" },
        { id:"MTH2270", subj:"MTH", tier:2, days:21, prereqs:["MTH1220"],                                                                                  name:"Algebra",                                perk:"+5% ammo conservation" },
        { id:"MTH2280", subj:"MTH", tier:2, days:21, prereqs:["MTH1220"],                                                                                  name:"Probability",                            perk:"+1% company productivity" },
        { id:"MTH2290", subj:"MTH", tier:2, days:21, prereqs:["MTH1220"],                                                                                  name:"Trigonometry",                           perk:"+5% ammo conservation" },
        { id:"MTH2300", subj:"MTH", tier:2, days:21, prereqs:["MTH1220"],                                                                                  name:"Calculus",                               perk:"+5% ammo conservation" },
        { id:"MTH2310", subj:"MTH", tier:2, days:28, prereqs:["MTH1220"],                                                                                  name:"Discrete Mathematics",                   perk:"+5% ammo conservation" },
        { id:"MTH2320", subj:"MTH", tier:2, days:21, prereqs:["MTH1220"],                                                                                  name:"Geometry 2",                             perk:"+2% passive defense bonus" },
        { id:"MTH3330", subj:"MTH", tier:3, days:42, prereqs:["MTH2240","MTH2250","MTH2260","MTH2270","MTH2280","MTH2290","MTH2300","MTH2310","MTH2320"],  name:"Bachelor Of Mathematics",                perk:"+20% ammo conservation" },
        // ── PSYCHOLOGY (7 courses) ────────────────────────────────────────────
        { id:"PSY1630", subj:"PSY", tier:1, days:7,  prereqs:[],                                                                                          name:"Introduction To Psychology",             perk:"" },
        { id:"PSY2132", subj:"PSY", tier:2, days:21, prereqs:["PSY1630"],                                                                                  name:"Intrapersonal Dynamics",                 perk:"+5% crime success rate" },
        { id:"PSY2640", subj:"PSY", tier:2, days:14, prereqs:["PSY1630"],                                                                                  name:"Memory And Decision",                    perk:"+1% passive dexterity bonus" },
        { id:"PSY2650", subj:"PSY", tier:2, days:14, prereqs:["PSY1630"],                                                                                  name:"Brain And Behaviour",                    perk:"+2% passive dexterity bonus" },
        { id:"PSY2660", subj:"PSY", tier:2, days:21, prereqs:["PSY1630"],                                                                                  name:"Quantitative Methods In Psychology",     perk:"+4% passive dexterity bonus" },
        { id:"PSY2670", subj:"PSY", tier:2, days:28, prereqs:["PSY1630"],                                                                                  name:"Applied Decision Methods",               perk:"+8% passive dexterity bonus" },
        { id:"PSY2680", subj:"PSY", tier:2, days:21, prereqs:["PSY1630"],                                                                                  name:"Attention And Awareness",                perk:"+5% city find chance" },
        { id:"PSY3690", subj:"PSY", tier:3, days:35, prereqs:["PSY2132","PSY2640","PSY2650","PSY2660","PSY2670","PSY2680"],                                name:"Bachelor Of Psychological Sciences",     perk:"+10% crime success rate" },
        // ── SPORTS SCIENCE (10 courses) — order matches Torn DOM slot positions ─
        { id:"SPT1430", subj:"SPT", tier:1, days:7,  prereqs:[],                                                                                          name:"Introduction To Sports Science",         perk:"" },
        { id:"SPT2440", subj:"SPT", tier:2, days:21, prereqs:["SPT1430"],                                                                                  name:"Strength And Conditioning",              perk:"+1% strength gym gains" },
        { id:"SPT2450", subj:"SPT", tier:2, days:21, prereqs:["SPT1430"],                                                                                  name:"Physiological Testing",                  perk:"+1% speed gym gains" },
        { id:"SPT2460", subj:"SPT", tier:2, days:21, prereqs:["SPT1430"],                                                                                  name:"Human Movement Analysis",                perk:"+1% defense gym gains" },
        { id:"SPT2470", subj:"SPT", tier:2, days:21, prereqs:["SPT1430"],                                                                                  name:"Bio Mechanical Determinants Of Skill",   perk:"+1% dexterity gym gains" },
        { id:"SPT2480", subj:"SPT", tier:2, days:21, prereqs:["SPT1430"],                                                                                  name:"Sports Medicine",                        perk:"+10% temporary booster stat increases" },
        { id:"SPT2490", subj:"SPT", tier:2, days:21, prereqs:["SPT1430"],                                                                                  name:"Nutritional Science",                    perk:"+2% passive speed and strength bonus" },
        { id:"SPT2500", subj:"SPT", tier:2, days:21, prereqs:["SPT1430"],                                                                                  name:"Analysis And Performance",               perk:"+2% passive defense and dexterity bonus" },
        { id:"SPT2126", subj:"SPT", tier:2, days:14, prereqs:["SPT1430"],                                                                                  name:"Sports Administration",                  perk:"Unlock the Sports Shop" },
        { id:"SPT3510", subj:"SPT", tier:3, days:35, prereqs:["SPT2440","SPT2450","SPT2460","SPT2470","SPT2480","SPT2490","SPT2500","SPT2126"],             name:"Bachelor Of Sports Science",             perk:"+1% all gym gains + 1% all passive stats" },
    ];

    // ── Lookup maps ──────────────────────────────────────────────────────────
    const COURSE_BY_ID = Object.fromEntries(COURSES.map(c => [c.id, c]));
    const BY_SUBJECT   = COURSES.reduce((m, c) => { (m[c.subj] ??= []).push(c); return m; }, {});
    const TOTAL_BASE_DAYS = COURSES.reduce((s, c) => s + c.days, 0);

    // ── Persistence ──────────────────────────────────────────────────────────
    const loadCompleted = () => { try { return new Set(JSON.parse(_load("ep_completed","[]"))); } catch(_){ return new Set(); }};
    const saveCompleted = s  => _save("ep_completed", JSON.stringify([...s]));
    const loadQueue     = () => { try { return JSON.parse(_load("ep_queue","[]")); } catch(_){ return []; }};
    const saveQueue     = a  => _save("ep_queue", JSON.stringify(a));

    // ── State ─────────────────────────────────────────────────────────────────
    let completed     = loadCompleted();
    let queue         = loadQueue();
    let currentCourse = null;    // { id, timeLeft (seconds) }
    let reduction     = parseFloat(_load("ep_reduction","0"));
    // pickerOpen: set of subject keys whose picker section is expanded
    const pickerOpen  = new Set();

    // ── Helpers ───────────────────────────────────────────────────────────────
    const applyRed  = d => d * (1 - reduction / 100);
    const canEnroll = id => (COURSE_BY_ID[id]?.prereqs ?? []).every(p => completed.has(p));
    const subjDone  = s => BY_SUBJECT[s].every(c => completed.has(c.id));
    const fmtD      = (d,r=1) => parseFloat(d.toFixed(r));

    function daysToStr(d) {
        d = Math.ceil(d);
        if (d <= 0) return "Done";
        if (d < 7)  return `${d}d`;
        const w = Math.floor(d/7), r = d%7;
        return r ? `${w}w ${r}d` : `${w}w`;
    }

    function dateIn(days) {
        const d = new Date();
        d.setDate(d.getDate() + Math.ceil(days));
        return d.toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'});
    }

    function remSubjDays(subj) {
        return BY_SUBJECT[subj].filter(c => !completed.has(c.id)).reduce((s,c) => s + applyRed(c.days), 0);
    }

    // ── CSS ───────────────────────────────────────────────────────────────────
    document.head.insertAdjacentHTML('beforeend', `<style>
.ep-wrap{margin:8px 0 12px;background:#181818;border:1px solid #333;border-radius:6px;font-family:Arial,sans-serif;font-size:14px;color:#ccc;overflow:hidden}
.ep-hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:linear-gradient(135deg,#1e1e28,#181820);border-bottom:1px solid #2a2a38;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.ep-hdr:active{background:#24243a}
.ep-title{font-size:15px;font-weight:bold;color:#aab8dd}
.ep-tog{font-size:16px;color:#555;transition:transform .2s}
.ep-wrap.open .ep-tog{transform:rotate(180deg)}
.ep-body{display:none;padding:12px}
.ep-wrap.open .ep-body{display:block}
.ep-sec{font-size:10px;font-weight:bold;color:#555;letter-spacing:.08em;text-transform:uppercase;margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid #252535}
.ep-sec:first-child{margin-top:0}
.ep-row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:6px 10px;margin-top:3px;border-radius:4px;background:#1e1e28}
.ep-rl{color:#778;font-size:12px;flex-shrink:0}
.ep-rv{color:#dde;font-size:12px;text-align:right}
.ep-row.g .ep-rv{color:#7abf7a}.ep-row.b .ep-rv{color:#7a9acc}.ep-row.r .ep-rv{color:#bf7a7a}.ep-row.a .ep-rv{color:#bf9f5a}
/* status */
.ep-st{display:none;margin-top:8px;padding:8px 10px;border-radius:4px;font-size:12px;line-height:1.5;word-break:break-word}
.ep-st.ok{display:block;background:#182018;border:1px solid #2a4a2a;color:#7abf7a}
.ep-st.err{display:block;background:#201818;border:1px solid #4a2828;color:#bf7a7a}
.ep-st.warn{display:block;background:#1e1a10;border:1px solid #4a3a18;color:#bf9f5a}
/* buttons */
.ep-btns{display:flex;gap:8px;margin-top:10px}
.ep-btn{flex:1;padding:10px 8px;border-radius:4px;border:1px solid #383848;background:#222;color:#ddd;font-size:13px;font-weight:bold;cursor:pointer;text-align:center;-webkit-tap-highlight-color:transparent}
.ep-btn:active{background:#2a2a3a}
.ep-btn-api{background:#18182a;border-color:#3a3a60;color:#8a8aee}
.ep-btn-dom{background:#182028;border-color:#304060;color:#6aaade}
/* reduction */
.ep-red-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.ep-red-row label{font-size:12px;color:#778;white-space:nowrap}
.ep-red-row input{flex:1;padding:6px 10px;background:#222;border:1px solid #383848;border-radius:4px;color:#e0e0e0;font-size:14px;max-width:80px}
.ep-red-chips{display:flex;gap:4px;flex-wrap:wrap;flex:1}
.ep-chip{font-size:10px;font-weight:bold;padding:2px 7px;border-radius:10px;border:1px solid}
.ep-chip.merit{color:#8a8aee;border-color:#3a3a60;background:#14142a}
.ep-chip.princ{color:#7abf7a;border-color:#2a4a2a;background:#141e14}
.ep-chip.wsu{color:#7a9acc;border-color:#2a3a50;background:#0e1420}
/* current course */
.ep-cur{padding:10px 12px;background:#14182a;border:1px solid #2a3060;border-radius:5px;margin-bottom:8px}
.ep-cur-name{font-size:14px;color:#aabfee;font-weight:bold;margin-bottom:2px}
.ep-cur-sub{font-size:11px;margin-bottom:4px}
.ep-cur-perk{font-size:11px;color:#556;margin-bottom:6px}
.ep-cur-time{font-size:13px;color:#7a9acc}
.ep-bar{height:6px;background:#1e1e38;border-radius:3px;margin-top:8px;overflow:hidden}
.ep-bar-fill{height:100%;background:linear-gradient(90deg,#3a5aa0,#6a8acc);border-radius:3px}
.ep-bar-note{font-size:10px;color:#4a5a6a;margin-top:4px}
/* queue */
.ep-q-item{display:flex;align-items:center;gap:8px;padding:8px 10px;margin-top:3px;background:#1a1a28;border:1px solid #252535;border-radius:5px}
.ep-q-num{flex-shrink:0;width:20px;height:20px;background:#1a2040;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;color:#6a8acc}
.ep-q-body{flex:1;min-width:0}
.ep-q-name{font-size:13px;color:#ccd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ep-q-info{font-size:10px;color:#4a5a6a;margin-top:1px}
.ep-q-right{display:flex;align-items:center;gap:6px;flex-shrink:0}
.ep-q-days{font-size:12px;font-weight:bold;color:#7a9acc}
.ep-q-del{background:none;border:none;color:#3a3a5a;cursor:pointer;font-size:18px;padding:0 2px;line-height:1;-webkit-tap-highlight-color:transparent}
.ep-q-del:active{color:#9a5a5a}
.ep-q-date{font-size:10px;color:#2a4a2a;text-align:right;padding:0 10px 4px}
.ep-q-empty{font-size:12px;color:#3a3a5a;padding:12px;text-align:center;border:1px dashed #252535;border-radius:5px;margin-top:3px}
.ep-q-total{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;margin-top:6px;background:#0e1420;border:1px solid #2a3a50;border-radius:5px}
.ep-q-total-l{font-size:12px;color:#5a7a9a}
.ep-q-total-r{font-size:13px;font-weight:bold;color:#7abfee}
/* picker */
.ep-pick{margin-top:10px;border:1px solid #252535;border-radius:6px;overflow:hidden}
.ep-pick-hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#141424;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent}
.ep-pick-hdr:active{background:#1c1c32}
.ep-pick-title{font-size:12px;font-weight:bold;color:#6a8acc;text-transform:uppercase;letter-spacing:.05em}
.ep-pick-tog{font-size:12px;color:#3a4a6a;transition:transform .15s}
.ep-pick.open .ep-pick-tog{transform:rotate(180deg)}
.ep-pick-body{display:none;background:#0e0e1e}
.ep-pick.open .ep-pick-body{display:block}
.ep-ps{border-bottom:1px solid #1a1a2e}
.ep-ps:last-child{border-bottom:none}
.ep-ps-hdr{display:flex;align-items:center;padding:9px 12px;gap:8px;-webkit-tap-highlight-color:transparent}
.ep-ps-hdr:active{background:#141424}
.ep-ps-name{flex:1;font-size:13px;font-weight:bold;cursor:pointer}
.ep-ps-info{font-size:11px;color:#3a4a5a;flex-shrink:0}
.ep-ps-addall{flex-shrink:0;padding:5px 11px;border-radius:4px;border:1px solid #2a3a50;background:#0e1828;color:#5a8acc;font-size:11px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.ep-ps-addall:active{background:#142030}
.ep-pc-list{display:none;padding:0 4px 6px}
.ep-ps.open .ep-pc-list{display:block}
.ep-pc{display:flex;align-items:center;padding:7px 8px;border-radius:4px;cursor:pointer;-webkit-tap-highlight-color:transparent;gap:8px;margin-top:2px}
.ep-pc:active{background:#141424}
.ep-pc-icon{flex-shrink:0;font-size:13px;width:18px;text-align:center}
.ep-pc-body{flex:1;min-width:0}
.ep-pc-name{font-size:12px;color:#aab}
.ep-pc-perk{font-size:10px;color:#3a4a5a;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ep-pc-days{flex-shrink:0;font-size:11px;color:#4a6a8a;min-width:30px;text-align:right}
.ep-pc.done{opacity:.35;pointer-events:none}
.ep-pc.queued .ep-pc-name{color:#4a8a4a}
.ep-pc.locked .ep-pc-name{color:#4a4a6a}
/* subjects section */
.ep-subj{margin-top:8px;border:1px solid #252535;border-radius:5px;overflow:hidden}
.ep-subj-hdr{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none}
.ep-subj-hdr:active{filter:brightness(1.15)}
.ep-subj-r{display:flex;align-items:center;gap:8px}
.ep-subj-days{font-size:12px;font-weight:bold;color:#aabfee}
.ep-subj-tog{font-size:11px;color:#445;transition:transform .15s}
.ep-subj.open .ep-subj-tog{transform:rotate(180deg)}
.ep-subj-bar{height:4px;background:#222;border-radius:0;overflow:hidden}
.ep-subj-fill{height:100%;transition:width .3s}
.ep-subj-body{display:none;border-top:1px solid #1e1e28}
.ep-subj.open .ep-subj-body{display:block}
.ep-cr{display:flex;align-items:flex-start;gap:8px;padding:7px 10px;border-bottom:1px solid #1a1a28;font-size:12px}
.ep-cr:last-child{border-bottom:none}
.ep-cr-icon{flex-shrink:0;width:16px;text-align:center;font-size:13px;margin-top:1px}
.ep-cr-body{flex:1}
.ep-cr-name{line-height:1.3}
.ep-cr-perk{font-size:10px;color:#446;margin-top:1px}
.ep-cr-days{flex-shrink:0;font-size:11px;color:#445;text-align:right;white-space:nowrap}
/* summary */
.ep-sg{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
.ep-sb{background:#1a1a28;border:1px solid #252540;border-radius:4px;padding:7px 10px}
.ep-sb-l{font-size:10px;color:#4a5a6a;text-transform:uppercase;letter-spacing:.04em}
.ep-sb-v{font-size:13px;font-weight:bold;color:#aabfee;margin-top:1px}
</style>`);

    // ── Mount ─────────────────────────────────────────────────────────────────
    const wrap = document.createElement("div");
    wrap.className = "ep-wrap";
    const q = sel => wrap.querySelector(sel);

    function mount() {
        if (wrap.parentElement) return;
        const eduRoot = document.querySelector('#education-root');
        const cw      = document.querySelector('.content-wrapper');
        if      (eduRoot?.parentElement) eduRoot.parentElement.insertBefore(wrap, eduRoot);
        else if (cw)                     cw.insertBefore(wrap, cw.firstChild);
        else                             document.body.insertBefore(wrap, document.body.firstChild);
    }

    mount();
    if (!wrap.parentElement || wrap.parentElement === document.body) {
        const obs = new MutationObserver(() => { if (document.querySelector('#education-root')) { obs.disconnect(); mount(); }});
        obs.observe(document.body, {childList:true, subtree:true});
        setTimeout(() => obs.disconnect(), 8000);
    }

    // ── Render scaffold ───────────────────────────────────────────────────────
    function buildHTML() {
        wrap.innerHTML = `
<div class="ep-hdr" id="ep-hdr"><span class="ep-title">🎓 Education Planner</span><span class="ep-tog">▼</span></div>
<div class="ep-body">

<div class="ep-red-row">
  <label>Reduction %</label>
  <input type="number" id="ep-red" min="0" max="40" step="1" value="${reduction}">
  <div class="ep-red-chips" id="ep-chips"></div>
</div>
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;font-size:12px;color:#778">
  <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
    <input type="checkbox" id="ep-manual-princ" style="width:14px;height:14px;accent-color:#7abf7a">
    <span>Principal 10%</span>
  </label>
  <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
    <input type="checkbox" id="ep-manual-wsu" style="width:14px;height:14px;accent-color:#7a9acc">
    <span>WSU stock 10%</span>
  </label>
</div>
<div class="ep-btns">
  <button class="ep-btn ep-btn-api" id="ep-api-btn">⟳ Auto-fill API</button>
  <button class="ep-btn ep-btn-dom" id="ep-dom-btn">↺ Recalculate</button>
</div>
<div class="ep-st" id="ep-st"></div>
<div style="margin:6px 0 8px">
  <label style="display:block;font-size:12px;color:#888;margin-bottom:3px">
    Torn API Key <span style="font-size:10px;color:#556">— needs Education access</span>
  </label>
  <div style="display:flex;gap:6px;align-items:stretch">
    <input type="password" id="ep-apikey" placeholder="Paste 16-character key…" autocomplete="off"
      style="flex:1;padding:8px 10px;background:#222;border:1px solid #383838;border-radius:4px;color:#e0e0e0;font-size:14px;box-sizing:border-box">
    <button id="ep-apikey-save"
      style="flex-shrink:0;padding:8px 12px;border-radius:4px;border:1px solid #3a5030;background:#1a2518;color:#7abf7a;font-size:12px;font-weight:bold;cursor:pointer;-webkit-tap-highlight-color:transparent">
      Save
    </button>
  </div>
  <div style="margin-top:5px;padding:6px 8px;background:#141414;border:1px solid #252525;border-radius:4px;font-size:10px;color:#556;line-height:1.7">
    <strong style="color:#668">Needs "Education" permission on your key.</strong>
    <a href="https://www.torn.com/preferences.php#tab=api?step=addNewKey&title=AIO+Planner&type=3" target="_blank"
      style="display:block;color:#4a7aaa;text-decoration:none;margin-top:2px">🔑 Auto-create key with Education access →</a>
  </div>
</div>

<div id="ep-cur-sec" style="display:none">
  <div class="ep-sec">Current Course</div>
  <div class="ep-cur" id="ep-cur"></div>
</div>

<div class="ep-sec">Queue Planner</div>
<div id="ep-q-list"></div>
<div id="ep-q-sum"></div>
<div class="ep-pick" id="ep-pick">
  <div class="ep-pick-hdr" id="ep-pick-hdr">
    <span class="ep-pick-title">＋ Add Courses</span>
    <span class="ep-pick-tog">▼</span>
  </div>
  <div class="ep-pick-body" id="ep-pick-body"></div>
</div>

<div class="ep-sec" style="margin-top:14px">All Subjects</div>
<div style="font-size:11px;color:#4a5a6a;margin-bottom:8px">✓ done · ▶ active · ○ available · 🔒 locked</div>
<div id="ep-subjs"></div>

<div class="ep-sec" style="margin-top:14px">Summary</div>
<div id="ep-sum"></div>

</div>`;
    }

    buildHTML();
    if (_load("ep_collapsed","no") !== "yes") wrap.classList.add("open");

    // ── Wire persistent events ────────────────────────────────────────────────
    q("#ep-hdr").addEventListener("click", () => {
        const o = wrap.classList.toggle("open");
        _save("ep_collapsed", o ? "no" : "yes");
    });
    q("#ep-red").addEventListener("input", e => {
        reduction = parseFloat(e.target.value) || 0;
        _save("ep_reduction", String(reduction));
        renderAll();
    });
    // API key field
    const _savedKey = (_load("apiKey", "") || "").trim();
    const _keyInp = q("#ep-apikey");
    if (_keyInp) {
        _keyInp.value = _savedKey.length === 16 ? _savedKey : "";
        _keyInp.placeholder = _savedKey.length === 16 ? "Key saved ✓" : "Paste 16-character key…";
    }
    q("#ep-apikey-save")?.addEventListener("click", () => {
        const k = (q("#ep-apikey")?.value || "").trim();
        if (k.length !== 16) { showStatus("err", `⚠ Key must be 16 characters (got ${k.length}).`); return; }
        _save("apiKey", k);
        const inp = q("#ep-apikey");
        if (inp) { inp.placeholder = "Key saved ✓"; inp.value = ""; }
        showStatus("ok", "✓ Key saved. Click ⟳ Auto-fill API to load your data.");
    });
    q("#ep-apikey")?.addEventListener("keydown", e => {
        if (e.key === "Enter") q("#ep-apikey-save")?.click();
    });

    q("#ep-api-btn").addEventListener("click", doAutofill);

    // Manual override checkboxes
    const _syncManualOverrides = () => {
        const princChecked = q("#ep-manual-princ")?.checked ?? false;
        const wsuChecked   = q("#ep-manual-wsu")?.checked   ?? false;
        _save("ep_manual_princ", princChecked ? "1" : "0");
        _save("ep_manual_wsu",   wsuChecked   ? "1" : "0");
        // Recompute reduction
        const meritPct  = parseFloat(_load("ep_merit_pct", "0")) || 0;
        const hasPrincAuto = _load("ep_has_princ", "0") === "1";
        const hasWSUAuto   = _load("ep_has_wsu",   "0") === "1";
        const total = meritPct
            + (hasPrincAuto || princChecked ? 10 : 0)
            + (hasWSUAuto   || wsuChecked   ? 10 : 0);
        reduction = total;
        _save("ep_reduction", String(total));
        const inp = q("#ep-red");
        if (inp) inp.value = total;
        renderAll();
    };
    q("#ep-manual-princ")?.addEventListener("change", _syncManualOverrides);
    q("#ep-manual-wsu")?.addEventListener("change", _syncManualOverrides);
    // Restore checkbox states
    if (_load("ep_manual_princ", "0") === "1") { const cb = q("#ep-manual-princ"); if (cb) cb.checked = true; }
    if (_load("ep_manual_wsu",   "0") === "1") { const cb = q("#ep-manual-wsu");   if (cb) cb.checked = true; }
    q("#ep-dom-btn").addEventListener("click", () => { domDetect(); renderAll(); });
    q("#ep-pick-hdr").addEventListener("click", () => q("#ep-pick").classList.toggle("open"));

    // ── Render functions ──────────────────────────────────────────────────────

    function renderAll() {
        renderCurrent();
        renderQueue();
        renderPickerUpdate();  // in-place update, preserves open state
        renderSubjects();
        renderSummary();
        renderChips();
    }

    function renderChips() {
        const el = q("#ep-chips");
        if (!el) return;
        const meritPct = _load("ep_merit_pct", 0);
        const hasPrinc = _load("ep_has_princ", "0") === "1";
        const hasWSU   = _load("ep_has_wsu",   "0") === "1";
        let html = "";
        if (meritPct > 0) html += `<span class="ep-chip merit">Merits ${meritPct}%</span>`;
        if (hasPrinc)     html += `<span class="ep-chip princ">Principal 10%</span>`;
        if (hasWSU)       html += `<span class="ep-chip wsu">WSU 10%</span>`;
        el.innerHTML = html;
    }

    function showStatus(type, msg) {
        const el = q("#ep-st");
        if (!el) return;
        el.className = `ep-st ${type}`;
        el.textContent = msg;
    }

    // ── Current course ────────────────────────────────────────────────────────
    function renderCurrent() {
        const sec = q("#ep-cur-sec");
        const box = q("#ep-cur");
        if (!sec || !box) return;
        if (!currentCourse) { sec.style.display = "none"; return; }
        sec.style.display = "";
        const c = COURSE_BY_ID[currentCourse.id];
        if (!c) { box.innerHTML = `<div class="ep-cur-name">${currentCourse.id}</div>`; return; }
        const base   = c.days;
        const red    = applyRed(base);
        const remD   = currentCourse.timeLeft > 0 ? currentCourse.timeLeft / 86400 : 0;
        const pct    = red > 0 ? Math.min(100, (1 - remD / red) * 100) : 100;
        const subj   = SUBJECTS[c.subj];
        box.innerHTML = `
<div class="ep-cur-name">${c.name}</div>
<div class="ep-cur-sub" style="color:${subj.color}">${subj.label}</div>
${c.perk ? `<div class="ep-cur-perk">🎁 ${c.perk}</div>` : ""}
<div class="ep-cur-time">${remD > 0 ? `⏱ ${daysToStr(remD)} remaining — done ${dateIn(remD)}` : "✓ Complete"}</div>
<div class="ep-bar"><div class="ep-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
<div class="ep-bar-note">Base ${base}d · ${reduction}% reduction → ${fmtD(red)}d total</div>`;
    }

    // ── Queue ─────────────────────────────────────────────────────────────────
    function renderQueue() {
        const listEl = q("#ep-q-list");
        const sumEl  = q("#ep-q-sum");
        if (!listEl) return;

        if (!queue.length) {
            listEl.innerHTML = `<div class="ep-q-empty">No courses queued — use Add Courses below</div>`;
            sumEl.innerHTML  = "";
            return;
        }

        const curOff = currentCourse?.timeLeft > 0 ? currentCourse.timeLeft / 86400 : 0;
        let cumul = curOff, html = "";

        queue.forEach((id, i) => {
            const c = COURSE_BY_ID[id];
            if (!c) return;
            const d    = applyRed(c.days);
            cumul     += d;
            const subj = SUBJECTS[c.subj];
            const flag = completed.has(id) ? "✓ " : !canEnroll(id) ? "🔒 " : "";

            if (i > 0 && COURSE_BY_ID[queue[i-1]]?.subj !== c.subj)
                html += `<div style="font-size:9px;color:#2a2a4a;text-align:center;padding:2px 0">· · ·</div>`;

            html += `
<div class="ep-q-item">
  <div class="ep-q-num">${i+1}</div>
  <div class="ep-q-body">
    <div class="ep-q-name">${flag}${c.name}</div>
    <div class="ep-q-info" style="color:${subj.color}55">${subj.label}${c.perk ? " · " + c.perk : ""}</div>
  </div>
  <div class="ep-q-right">
    <div class="ep-q-days">${daysToStr(d)}</div>
    <button class="ep-q-del" data-id="${id}">✕</button>
  </div>
</div>
<div class="ep-q-date">→ ${dateIn(cumul)}</div>`;
        });

        listEl.innerHTML = html;
        listEl.querySelectorAll(".ep-q-del").forEach(btn =>
            btn.addEventListener("click", () => {
                queue = queue.filter(id => id !== btn.dataset.id);
                saveQueue(queue);
                renderQueue();
                renderPickerUpdate();
                renderSummary();
            })
        );

        const totalD = queue.reduce((s, id) => s + (COURSE_BY_ID[id] ? applyRed(COURSE_BY_ID[id].days) : 0), 0);
        sumEl.innerHTML = `
<div class="ep-q-total">
  <span class="ep-q-total-l">${queue.length} course${queue.length!==1?"s":""} · ${daysToStr(totalD)}</span>
  <span class="ep-q-total-r">done ${dateIn(curOff + totalD)}</span>
</div>`;
    }

    // ── Picker — build once, update in-place ──────────────────────────────────
    let pickerBuilt = false;

    function renderPickerBuild() {
        const body = q("#ep-pick-body");
        if (!body) return;
        let html = "";
        for (const [subj, meta] of Object.entries(SUBJECTS)) {
            const courses = BY_SUBJECT[subj] || [];
            html += `<div class="ep-ps" id="ep-ps-${subj}${pickerOpen.has(subj) ? " open" : ""}">
<div class="ep-ps-hdr">
  <span class="ep-ps-name" data-subj="${subj}" style="color:${meta.color}">${meta.label}</span>
  <span class="ep-ps-info" id="ep-ps-info-${subj}"></span>
  <button class="ep-ps-addall" data-subj="${subj}">+ All</button>
</div>
<div class="ep-pc-list" id="ep-pcl-${subj}">`;
            courses.forEach(c => {
                html += `<div class="ep-pc" id="ep-pc-${c.id}" data-id="${c.id}">
  <div class="ep-pc-icon" id="ep-pc-icon-${c.id}"></div>
  <div class="ep-pc-body">
    <div class="ep-pc-name">${c.name}</div>
    ${c.perk ? `<div class="ep-pc-perk">${c.perk}</div>` : ""}
  </div>
  <div class="ep-pc-days" id="ep-pc-days-${c.id}"></div>
</div>`;
            });
            html += `</div></div>`;
        }
        body.innerHTML = html;
        pickerBuilt = true;

        // Wire subject header clicks (name only — not the button)
        body.querySelectorAll(".ep-ps-name").forEach(el =>
            el.addEventListener("click", () => {
                const subj = el.dataset.subj;
                const card = q(`#ep-ps-${subj}`);
                if (!card) return;
                const isOpen = card.classList.toggle("open");
                if (isOpen) pickerOpen.add(subj); else pickerOpen.delete(subj);
            })
        );

        // Wire + All buttons
        body.querySelectorAll(".ep-ps-addall").forEach(btn =>
            btn.addEventListener("click", e => { e.stopPropagation(); queueSubject(btn.dataset.subj); })
        );

        // Wire course row clicks
        body.querySelectorAll(".ep-pc").forEach(row =>
            row.addEventListener("click", () => {
                const id = row.dataset.id;
                if (completed.has(id)) return;
                if (queue.includes(id)) {
                    queue = queue.filter(q => q !== id);
                } else {
                    if (!canEnroll(id)) return; // don't queue locked courses
                    queue.push(id);
                }
                saveQueue(queue);
                renderQueue();
                renderPickerUpdate(); // only updates classes/text, no DOM rebuild
                renderSummary();
            })
        );

        renderPickerUpdate();
    }

    function renderPickerUpdate() {
        if (!pickerBuilt) { renderPickerBuild(); return; }
        // Update each course row's classes and icon without rebuilding DOM
        for (const [subj] of Object.entries(SUBJECTS)) {
            const courses  = BY_SUBJECT[subj] || [];
            const notDone  = courses.filter(c => !completed.has(c.id));
            const allQ     = notDone.length > 0 && notDone.every(c => queue.includes(c.id));
            const doneCount= courses.filter(c => completed.has(c.id)).length;
            const infoEl   = q(`#ep-ps-info-${subj}`);
            if (infoEl) infoEl.textContent = `${doneCount}/${courses.length}`;

            courses.forEach(c => {
                const row  = q(`#ep-pc-${c.id}`);
                const icon = q(`#ep-pc-icon-${c.id}`);
                const days = q(`#ep-pc-days-${c.id}`);
                if (!row) return;
                const isDone   = completed.has(c.id);
                const isQueued = queue.includes(c.id);
                const isLocked = !canEnroll(c.id) && !isDone;

                row.className  = `ep-pc${isDone?" done":isQueued?" queued":isLocked?" locked":""}`;
                if (icon) icon.textContent = isDone ? "✓" : isQueued ? "⊕" : isLocked ? "🔒" : "○";
                if (days) days.textContent = isDone ? "done" : daysToStr(applyRed(c.days));
            });
        }
    }

    function queueSubject(subj) {
        let added = 0;
        for (const c of BY_SUBJECT[subj] || []) {
            if (!completed.has(c.id) && !queue.includes(c.id) && canEnroll(c.id)) { queue.push(c.id); added++; }
        }
        if (added) { saveQueue(queue); renderQueue(); renderPickerUpdate(); renderSummary(); }
    }

    // ── All Subjects section ──────────────────────────────────────────────────
    function renderSubjects() {
        const el = q("#ep-subjs");
        if (!el) return;
        let html = "";
        for (const [subj, meta] of Object.entries(SUBJECTS)) {
            const courses = BY_SUBJECT[subj] || [];
            const done    = courses.filter(c => completed.has(c.id)).length;
            const total   = courses.length;
            const remD    = remSubjDays(subj);
            const pct     = total > 0 ? done/total*100 : 0;
            const bach    = courses.find(c => c.tier === 3);

            html += `<div class="ep-subj" id="ep-subj-${subj}">
<div class="ep-subj-hdr" data-subj="${subj}" style="background:${meta.color}14;border-bottom:1px solid ${meta.color}20">
  <div>
    <div style="font-size:13px;font-weight:bold;color:${meta.color}">${done===total?"✓ ":""}${meta.label}</div>
    <div style="font-size:11px;color:#557">${done}/${total} courses${bach&&completed.has(bach.id)?" · 🎓 done":""}</div>
  </div>
  <div class="ep-subj-r">
    <div class="ep-subj-days">${done===total?"✓":daysToStr(remD)}</div>
    <div class="ep-subj-tog">▼</div>
  </div>
</div>
<div class="ep-subj-bar"><div class="ep-subj-fill" style="width:${pct.toFixed(1)}%;background:${meta.color}80"></div></div>
<div class="ep-subj-body">`;

            courses.forEach(c => {
                const isDone   = completed.has(c.id);
                const isActive = currentCourse?.id === c.id;
                const isLocked = !canEnroll(c.id) && !isDone;
                const isQueued = queue.includes(c.id);
                const icon  = isDone?"✓":isActive?"▶":isLocked?"🔒":"○";
                const color = isDone?"#3a6a3a":isActive?"#5a5a9a":isLocked?"#3a3a4a":"#668";
                const qBadge= isQueued?` <span style="font-size:9px;color:#4a6a8a;background:#1a2030;border:1px solid #2a3a50;border-radius:3px;padding:0 3px">queued</span>`:"";
                html += `<div class="ep-cr">
  <div class="ep-cr-icon" style="color:${color}">${icon}</div>
  <div class="ep-cr-body">
    <div class="ep-cr-name" style="color:${color}">${c.name}${qBadge}</div>
    ${c.perk?`<div class="ep-cr-perk">${c.perk}</div>`:""}
  </div>
  <div class="ep-cr-days">${isDone?"✓":`${daysToStr(applyRed(c.days))}<div style="font-size:9px;color:#334">${c.days}d base</div>`}</div>
</div>`;
            });

            if (bach) html += `<div style="padding:7px 10px;font-size:11px;background:#0e1418;color:${meta.color}99;border-top:1px solid #1e2028">🎓 ${bach.perk}</div>`;
            html += `</div></div>`;
        }
        el.innerHTML = html;
        el.querySelectorAll(".ep-subj-hdr").forEach(hdr =>
            hdr.addEventListener("click", () => q(`#ep-subj-${hdr.dataset.subj}`)?.classList.toggle("open"))
        );
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    function renderSummary() {
        const el = q("#ep-sum");
        if (!el) return;
        const done    = completed.size;
        const total   = COURSES.length;
        const degrees = Object.keys(SUBJECTS).filter(s => subjDone(s)).length;
        const remD    = COURSES.filter(c => !completed.has(c.id)).reduce((s,c) => s + applyRed(c.days), 0);
        const totalD  = applyRed(TOTAL_BASE_DAYS);
        const perks   = COURSES.filter(c => completed.has(c.id) && c.perk).map(c => c.perk);
        const avail   = COURSES.filter(c => !completed.has(c.id) && canEnroll(c.id) && c.id !== currentCourse?.id);

        let html = `<div class="ep-sg">
  <div class="ep-sb"><div class="ep-sb-l">Courses</div><div class="ep-sb-v">${done}/${total} <span style="font-size:11px;color:#445">(${(done/total*100).toFixed(1)}%)</span></div></div>
  <div class="ep-sb"><div class="ep-sb-l">Degrees</div><div class="ep-sb-v">${degrees}/${Object.keys(SUBJECTS).length}</div></div>
  <div class="ep-sb"><div class="ep-sb-l">Remaining</div><div class="ep-sb-v" style="font-size:12px">${daysToStr(remD)}</div></div>
  <div class="ep-sb"><div class="ep-sb-l">Finish</div><div class="ep-sb-v" style="font-size:11px">${dateIn(remD)}</div></div>
</div>
<div class="ep-row b" style="margin-top:8px"><span class="ep-rl">Base total</span><span class="ep-rv">${daysToStr(TOTAL_BASE_DAYS)}</span></div>
<div class="ep-row g"><span class="ep-rl">With ${reduction}% reduction</span><span class="ep-rv">${daysToStr(totalD)}</span></div>`;

        if (perks.length) {
            html += `<div class="ep-sec" style="margin-top:12px">Earned Bonuses (${perks.length})</div>`;
            perks.forEach(p => html += `<div style="padding:4px 10px;font-size:11px;color:#7a9a7a;background:#141e14;border-left:2px solid #2a5a2a;margin-top:3px;border-radius:0 3px 3px 0">🔓 ${p}</div>`);
        }

        if (avail.length) {
            html += `<div class="ep-sec" style="margin-top:12px">Available Now (${avail.length})</div>`;
            avail.slice(0,8).forEach(c => html += `<div class="ep-row"><span class="ep-rl">${c.name}</span><span class="ep-rv">${daysToStr(applyRed(c.days))}</span></div>`);
            if (avail.length > 8) html += `<div style="font-size:11px;color:#445;padding:4px 10px">…+${avail.length-8} more</div>`;
        }
        el.innerHTML = html;
    }

    // ── DOM auto-detect ───────────────────────────────────────────────────────
    function domDetect() {
        // Current course
        const btn = document.querySelector('[class*="goToCourseBtn"]');
        const cdEl = document.querySelector('.hasCountdown,[class*="hasCountdown"]');
        if (btn) {
            const name  = btn.textContent.trim();
            const match = COURSES.find(c => c.name.toLowerCase() === name.toLowerCase());
            if (match) {
                let t = 0;
                if (cdEl) {
                    const tx = cdEl.textContent;
                    const n = s => parseInt(tx.match(new RegExp(`(\\d+)\\s*${s}`))?.[1] || 0);
                    t = n("day")*86400 + n("hour")*3600 + n("minute")*60 + n("second");
                }
                currentCourse = { id: match.id, timeLeft: t };
            }
        }

        // Completed via slot positions
        let found = 0;
        document.querySelectorAll('[class*="categoryItem"]').forEach(item => {
            const titleEl = item.querySelector('[class*="categoryTitle"]');
            if (!titleEl) return;
            const label   = titleEl.textContent.trim();
            const subjKey = Object.entries(SUBJECTS).find(([,v]) => v.label === label)?.[0];
            if (!subjKey) return;
            const courses = BY_SUBJECT[subjKey] || [];
            item.querySelectorAll('[class*="courseWrapper"]').forEach((slot, idx) => {
                if (idx >= courses.length) return;
                const ind = slot.querySelector('[class*="courseIndicator"]');
                if (!ind) return;
                const cls  = ind.className;
                const done = cls.includes('Ghv3G') || cls.includes('completed___');
                const prog = cls.includes('a9M6f') || cls.includes('inProgress');
                if (done && !prog) { completed.add(courses[idx].id); found++; }
            });
        });

        if (found || currentCourse) saveCompleted(completed);
        return found > 0 || !!currentCourse;
    }

    // ── API auto-fill ─────────────────────────────────────────────────────────
    const WSU_ID = 25, WSU_MIN = 1000000;

    function doAutofill() {
        // Try field first (unsaved input), then stored key
        const fieldVal = (q("#ep-apikey")?.value || "").trim();
        let key = fieldVal.length === 16 ? fieldVal : (_load("apiKey","") || "").trim();
        if (key.length !== 16) {
            showStatus("err", "⚠ No API key saved. Paste your key above and tap Save first.");
            return;
        }
        showStatus("ok","⟳ Fetching from API…");

        // Single Torn API call — education+merits+perks+stocks merged
        GM_xmlhttpRequest({
            method:"GET",
            url:`https://api.torn.com/user/?selections=education,merits,perks,stocks&key=${key}&comment=EduPlan`,
            onload: r => {
                try {
                    const d = JSON.parse(r.responseText);
                    if (d.error) {
                        const code = d.error.code;
                        const msg  = d.error.error;
                        if (code === 16) {
                            showStatus("err",
                                `✗ Error 16: Key access level too low for Education data.\n\n` +
                                `Your key needs "education" permission.\n` +
                                `Go to: Torn → Preferences → API Keys → Edit your key → check "Education" → Save.\n` +
                                `Or delete your key and use the Auto-create link in the Gym widget ⚙ settings.`
                            );
                        } else {
                            showStatus("err", `✗ Error ${code}: ${msg}`);
                        }
                        return;
                    }
                    applyAPIData(d, d); // stocks are in same response
                } catch(e) { showStatus("err",`✗ Parse error: ${e.message}`); }
            },
            onerror: () => showStatus("err","✗ Network error.")
        });
    }

    function applyAPIData(d, stockData) {
        const filled = [], notes = [];

        // Current course
        if (d.education_current != null) {
            const raw = d.education_current;
            const match = COURSES.find(c => c.name.toLowerCase() === String(raw).toLowerCase().trim());
            if (match && d.education_timeleft != null) {
                currentCourse = { id: match.id, timeLeft: Number(d.education_timeleft) };
                filled.push(`current: ${match.name}`);
            } else if (typeof raw === "number") {
                notes.push(`course ID ${raw} resolved from DOM`);
            }
        }

        // Completed courses
        if (d.education_completed) {
            const raw = Array.isArray(d.education_completed) ? d.education_completed : Object.values(d.education_completed);
            const matched = raw.map(item => COURSES.find(c => c.name.toLowerCase() === String(item).toLowerCase().trim())?.id).filter(Boolean);
            if (matched.length) { completed = new Set(matched); saveCompleted(completed); filled.push(`${matched.length} courses`); }
        }

        // Merits — Education Length: each point = 2%, max 10 pts = 20%
        let meritPct = 0;
        if (d.merits) {
            const key = Object.keys(d.merits).find(k => k.toLowerCase().includes("education") && k.toLowerCase().includes("length"));
            if (key) {
                const val = d.merits[key];
                const n = typeof val === "object" ? (val.current ?? val.level ?? val.value ?? 0) : Number(val);
                meritPct = Math.min(20, n * 2);
            }
        }

        // Perks — Principal job perk
        let hasPrinc = false;
        if (d.perks) {
            // Flatten all perk categories — API may return as flat array or
            // nested object (job_perks, education_perks, etc.)
            const rawPerks = Array.isArray(d.perks)
                ? d.perks
                : Object.values(d.perks).flat();
            const flat = rawPerks.map(p => String(p).toLowerCase());
            // Save raw perks for diagnosis
            _save("ep_debug_perks", JSON.stringify(flat.slice(0, 30)));
            console.log("[EduPlan] perks received:", flat.slice(0, 30));
            // Match any variant of the Principal 10% education reduction perk:
            // "Reduces all education course times by 10%"
            // "10% reduction in all education course completion times"
            // "Education course speed increased by 10%"
            // "Education course completion time reduced by 10%"
            hasPrinc = flat.some(p =>
                (p.includes("education") && p.includes("10") && (p.includes("reduc") || p.includes("course") || p.includes("time"))) ||
                p.includes("principal")
            );
        }
        // Also check job_perks / company_perks separately in case they're top-level
        if (!hasPrinc && (d.job_perks || d.company_perks)) {
            const jobFlat = [...(d.job_perks || []), ...(d.company_perks || [])].map(p => String(p).toLowerCase());
            hasPrinc = jobFlat.some(p =>
                (p.includes("education") && p.includes("10")) || p.includes("principal")
            );
            if (hasPrinc) console.log("[EduPlan] Principal perk found in job_perks/company_perks");
        }

        // WSU stock — check portfolio directly
        let hasWSU = false;
        if (stockData?.stocks) {
            const wsu = stockData.stocks[String(WSU_ID)] ?? stockData.stocks[WSU_ID];
            if (wsu) {
                const shares = Array.isArray(wsu) ? wsu.reduce((s,b) => s + (b.shares ?? b.quantity ?? 0), 0) : (wsu.shares ?? wsu.total_shares ?? 0);
                const activeBenefit = wsu.benefit?.active === true || wsu.benefit?.active === 1;
                hasWSU = activeBenefit || shares >= WSU_MIN;
            }
        }

        // Persist reduction sources for chips display
        _save("ep_merit_pct", meritPct);
        _save("ep_has_princ", hasPrinc ? "1" : "0");
        _save("ep_has_wsu",   hasWSU   ? "1" : "0");

        // Apply total reduction
        const manualPrinc = _load("ep_manual_princ", "0") === "1";
        const manualWSU   = _load("ep_manual_wsu",   "0") === "1";
        const total = meritPct + ((hasPrinc || manualPrinc) ? 10 : 0) + ((hasWSU || manualWSU) ? 10 : 0);
        if (total > 0) {
            reduction = total;
            _save("ep_reduction", String(reduction));
            const inp = q("#ep-red");
            if (inp) inp.value = reduction;

        cache.set('edu_reduction', { reduction: total, meritPct, hasPrinc, hasWSU });
            const parts = [];
            if (meritPct) parts.push(`merits ${meritPct}%`);
            if (hasPrinc) parts.push("Principal 10%");
            if (hasWSU)   parts.push("WSU 10%");
            filled.push(`${parts.join(" + ")} = ${reduction}%`);
        } else {
            notes.push("no reductions found");
        }

        // Also run DOM detect to catch anything API missed
        domDetect();

        const msg = (filled.length ? "✓ " + filled.join(" · ") : "") + (notes.length ? "  " + notes.join(" — ") : "");
        showStatus(filled.length ? "ok" : "warn", msg.trim() || "Done");
        renderAll();
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    // Check cross-page cache for reduction data from gym session
    (function() {
        const cached = cache.get('edu_reduction');
        if (cached && typeof cached.reduction === 'number') {
            if (!_load('ep_merit_pct', 0) && cached.meritPct > 0) {
                _save('ep_merit_pct', cached.meritPct);
                _save('ep_has_princ', cached.hasPrinc ? '1' : '0');
                _save('ep_has_wsu',   cached.hasWSU   ? '1' : '0');
                reduction = cached.reduction;
                _save('ep_reduction', String(reduction));
            }
        }
    })();
    renderAll();

    // Auto-detect from DOM on load, then auto-fill from API if key saved
    setTimeout(() => {
        const changed = domDetect();
        if (changed) renderAll();

        const savedKey = (_load("apiKey","") || "").trim();
        const lastTs   = parseInt(_load("lastAutofillTs", "0")) || 0;
        if (savedKey.length === 16 && (Date.now() - lastTs) > 30 * 60000) {
            // Silent auto-fill only if >30min since last autofill (saves Torn API calls)
            doAutofill();
        }
    }, 1200);


})();
