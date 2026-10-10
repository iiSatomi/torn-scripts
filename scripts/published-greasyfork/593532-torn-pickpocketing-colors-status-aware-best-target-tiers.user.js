// ==UserScript==
// @name         Torn Pickpocketing Colors (Status-Aware + Best Target + Tiers)
// @version      2.1
// @namespace    https://github.com/Korbrm
// @description  Inline target guide, optional Torn UI, status-aware history, skill/outcome charts, observed target comparisons, and mobile-safe CSV/JSON backups.
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @author       Korbrm [2931507] (status logic added per TheChase00's note; tiers/best-target/live-updates added by request)
// @license      MIT License
// @match        https://www.torn.com/loader.php?sid=crimes*
// @match        https://www.torn.com/page.php?sid=crimes*
// @grant        none
// @run-at       document-start
// @downloadURL https://update.greasyfork.org/scripts/593532/Torn%20Pickpocketing%20Colors%20%28Status-Aware%20%2B%20Best%20Target%20%2B%20Tiers%29.user.js
// @updateURL https://update.greasyfork.org/scripts/593532/Torn%20Pickpocketing%20Colors%20%28Status-Aware%20%2B%20Best%20Target%20%2B%20Tiers%29.meta.js
// ==/UserScript==

/*
 * 2.0 — Inline Targets / Insights / Settings, evidence-limited advice,
 * status-specific history, UTC charts, safe CSV and JSON backup/restore.
 * Observes user-initiated crimes only. No automation, API key, or uploads.
 *
 * MARK_POLICY tiers and skill thresholds are an advisory strategy, not game
 * levels, verified probabilities, or XP rates. Visible skill and loot are
 * recorded only when observed; unknown results remain explicitly unread.
 * Status records come from Torn's own crimesList response and map by face icon
 * in response order, including null placeholders for unobserved statuses.
 * One bundled script supports desktop and capability-detected Torn PDA APIs.
 * Existing settings/history keys are retained for migration compatibility.
 */

(function() {
    'use strict';

    // Official difficulty labels come from Torn's Pickpocketing wiki. Tiers are
    // conservative relative guidance, not unlock levels, odds, or real XP.
    const MARK_POLICY = Object.freeze({
        "Drunk man":       { tier: 1, difficulty: "easier", statuses: ["stumbling", "distracted"] },
        "Drunk woman":     { tier: 1, difficulty: "easier", statuses: ["stumbling", "distracted"] },
        "Elderly man":     { tier: 1, difficulty: "easier", statuses: ["walking"] },
        "Elderly woman":   { tier: 1, difficulty: "easier", statuses: ["walking"] },
        "Homeless person": { tier: 1, difficulty: "easier", statuses: ["begging", "loitering"] },
        "Junkie":          { tier: 1, difficulty: "easier", statuses: ["loitering", "stumbling"] },
        "Young man":       { tier: 2, difficulty: "less difficult", statuses: ["music", "phone", "walking"] },
        "Young woman":     { tier: 2, difficulty: "less difficult", statuses: ["distracted", "music", "phone", "walking"] },
        "Laborer":         { tier: 2, difficulty: "moderately difficult", statuses: ["distracted", "phone", "walking"] },
        "Postal worker":   { tier: 2, difficulty: "moderately difficult", statuses: ["walking", "distracted"] },
        "Student":         { tier: 2, difficulty: "moderately difficult", statuses: ["music", "phone", "running", "walking"] },
        "Businessman":     { tier: 3, difficulty: "moderately difficult", statuses: ["walking", "phone"] },
        "Businesswoman":   { tier: 3, difficulty: "moderately difficult", statuses: ["walking", "phone"] },
        "Jogger":          { tier: 3, difficulty: "moderately difficult", statuses: ["jogging", "walking"] },
        "Thug":            { tier: 3, difficulty: "moderately difficult", statuses: ["running", "walking", "loitering"] },
        "Classy lady":     { tier: 4, difficulty: "more difficult", statuses: ["walking", "phone"] },
        "Gang member":     { tier: 4, difficulty: "more difficult", statuses: ["loitering"] },
        "Rich kid":        { tier: 4, difficulty: "more difficult", statuses: ["phone", "music", "walking"] },
        "Sex worker":      { tier: 4, difficulty: "more difficult", statuses: ["distracted", "phone", "soliciting"] },
        "Cyclist":         { tier: 5, difficulty: "more difficult", statuses: ["cycling"] },
        "Mobster":         { tier: 6, difficulty: "very difficult", statuses: ["walking"] },
        "Police officer":  { tier: 6, difficulty: "very difficult", statuses: ["walking", "running"] },
    });
    const MARK_NAMES = Object.keys(MARK_POLICY).sort((a, b) => b.length - a.length);
    const MAX_TIER = 6;
    const DEFAULT_SETTINGS = Object.freeze({ readyOnly: false, bestCount: 1, minTier: 1, insightsEnabled: true, useHelperUi: true });
    const FETCH_HOOK = Symbol.for("pp-helper.fetch-hook");
    const ATTEMPT_LOG_LIMIT = 750;

    // "Good" oblivious statuses per TheChase00 (icon strings from the API)
    const GOOD_STATUS = ["distracted", "phone", "music", "stumbling"];

    function resolveMark(text) {
        const lower = String(text || "").toLowerCase().trim();
        for (const name of MARK_NAMES) {
            if (lower.startsWith(name.toLowerCase())) {
                return { name, ...MARK_POLICY[name] };
            }
        }
        return null;
    }

    function verdict(markName, statusIcon, skill, build) {
        const policy = MARK_POLICY[markName];
        if (!policy) return "WAIT";
        if (typeof statusIcon !== "string") return "WAIT";
        statusIcon = statusIcon.trim().toLowerCase();
        if (!statusIcon || !policy.statuses.includes(statusIcon)) return "WAIT";
        skill = Number(skill) || 0;
        const good = GOOD_STATUS.includes(statusIcon);

        if (markName === "Police officer" || markName === "Mobster") {
            return skill >= 100 ? "CAUTION" : "AVOID";
        }
        if (markName === "Cyclist") return skill >= 80 ? "GO" : "AVOID";
        if (policy.tier === 1) return "GO";
        if (markName === "Young man" || markName === "Young woman") {
            return (good || statusIcon === "walking") ? "GO" : "WAIT";
        }
        if (["Laborer", "Postal worker", "Student"].includes(markName)) {
            return (good || statusIcon === "walking") ? "GO" : "WAIT";
        }
        if (markName === "Businessman" || markName === "Businesswoman") {
            return (good || statusIcon === "walking") && skill >= 65 ? "GO" : "WAIT";
        }
        if (markName === "Jogger") {
            return statusIcon === "walking" && skill >= 65 ? "GO" : "WAIT";
        }
        if (markName === "Thug") {
            return statusIcon === "loitering" && skill >= 45 ? "GO" : "WAIT";
        }
        if (markName === "Classy lady" || markName === "Rich kid") {
            return good && skill >= 40 ? "GO" : "WAIT";
        }
        if (markName === "Sex worker") {
            if (statusIcon === "soliciting") return skill >= 45 ? "GO" : "WAIT";
            return good && skill >= 40 ? "GO" : "WAIT";
        }
        if (markName === "Gang member") {
            return statusIcon === "loitering" && skill >= 65 ? "GO" : "WAIT";
        }

        return "WAIT";
    }

    function normalizeSettings(value) {
        const raw = value && typeof value === "object" ? value : {};
        const bestCount = Math.min(10, Math.max(0, Math.floor(optionalNumber(raw.bestCount) ?? DEFAULT_SETTINGS.bestCount)));
        const minTier = Math.min(MAX_TIER, Math.max(1, Math.floor(Number(raw.minTier) || DEFAULT_SETTINGS.minTier)));
        return {
            readyOnly: raw.readyOnly === true,
            bestCount,
            minTier,
            insightsEnabled: raw.insightsEnabled !== false,
            useHelperUi: raw.useHelperUi !== false,
            search: typeof raw.search === "string" ? raw.search.slice(0, 80) : "",
            adviceGoal: ["safety", "skill", "value"].includes(raw.adviceGoal) ? raw.adviceGoal : "safety",
        };
    }

    function isPickpocketAttemptRequest(url) {
        try {
            const parsed = new URL(String(url || ""), "https://www.torn.com/");
            return /^(?:www\.)?torn\.com$/.test(parsed.hostname) && parsed.searchParams.get("sid") === "crimesData"
                && /^(?:attemptCrime|crimeAttempt|attempt|commitCrime)$/.test(parsed.searchParams.get("step") || "");
        } catch { return false; }
    }

    function classifyAttemptOutcome(payload) {
        const queue = [payload];
        const seen = new Set();
        const outcomes = new Set();
        let booleanSuccess = false;
        while (queue.length && seen.size < 2000) {
            const value = queue.shift();
            if (!value || typeof value !== "object" || seen.has(value)) continue;
            seen.add(value);
            for (const [key, child] of Object.entries(value)) {
                if (child === true && /^(?:success|succeeded)$/i.test(key) && value !== payload) booleanSuccess = true;
                if (child === true && /^(?:critical|critfail)$/i.test(key)) outcomes.add("critical");
                if (child === true && /^(?:fail|failed)$/i.test(key)) outcomes.add("fail");
                if (typeof child === "string" && /^(?:outcome|result|message|status|type)$/i.test(key)) {
                    const text = child.toLowerCase();
                    if (/\b(?:critical(?: failure)?|crit[\s-]*fail|red outcome)\b/.test(text)) outcomes.add("critical");
                    else if (/\b(?:fail(?:ed|ure)?|unsuccessful|orange outcome|yellow outcome)\b/.test(text)) outcomes.add("fail");
                    else if (/\b(?:success|unique|green outcome)\b/.test(text)) outcomes.add("success");
                }
                if (child && typeof child === "object") queue.push(child);
            }
        }
        return ["critical", "fail", "success"].find(outcome => outcomes.has(outcome)) || (booleanSuccess ? "success" : "unknown");
    }

    function extractAttemptValue(text) {
        const match = String(text || "").match(/total\s+value\s*:\s*\$?\s*([\d,]+)/i);
        if (!match) return null;
        const value = Number(String(match?.[1] || "").replace(/,/g, ""));
        return Number.isFinite(value) ? value : null;
    }

    function optionalNumber(input) {
        return input === null || input === undefined || input === "" || !Number.isFinite(Number(input)) ? null : Number(input);
    }

    function normalizeAttemptLog(value) {
        const raw = value && typeof value === "object" ? value : {};
        const events = Array.isArray(raw.events) ? raw.events : [];
        const clean = events.filter(event => event && typeof event === "object" && typeof event.mark === "string" && Number(event.at) > 0 && Number(event.at) <= 8640000000000000)
            .map(event => ({
                id: String(event.id || `${event.at}:${event.mark}:${event.status || "unknown"}`).slice(0, 200),
                ...(optionalNumber(event.restoredAt) > 0 ? { restoredAt: Number(event.restoredAt) } : {}),
                ...(typeof event.resultText === "string" && event.resultText ? { resultText: event.resultText.slice(0, 1600) } : {}),
                at: Number.isFinite(Number(event.at)) ? Number(event.at) : Date.now(),
                mark: String(event.mark).slice(0, 80),
                status: typeof event.status === "string" ? event.status.slice(0, 80) : "unknown",
                outcome: ["success", "fail", "critical", "unknown"].includes(event.outcome) ? event.outcome : "unknown",
                tier: optionalNumber(event.tier),
                skill: optionalNumber(event.skill),
                skillAfter: optionalNumber(event.skillAfter),
                skillDelta: optionalNumber(event.skillDelta),
                value: optionalNumber(event.value),
            }));
        const clearedAt = optionalNumber(raw.clearedAt) || 0;
        const unique = Array.from(new Map(clean.filter(event => event.at > clearedAt || event.restoredAt > clearedAt).map(event => [event.id, event])).values());
        unique.sort((a, b) => a.at - b.at);
        return { schema: 2, updatedAt: optionalNumber(raw.updatedAt) || 0, clearedAt, enabled: raw.enabled === true, events: unique.slice(-ATTEMPT_LOG_LIMIT) };
    }

    function buildInsights(events) {
        const groups = new Map();
        let unknownOutcomes = 0;
        for (const event of Array.isArray(events) ? events : []) {
            if (!event || typeof event.mark !== "string") continue;
            const row = groups.get(event.mark) || { mark: event.mark, attempts: 0, success: 0, fail: 0, critical: 0 };
            row.attempts += 1;
            if (["success", "fail", "critical"].includes(event.outcome)) row[event.outcome] += 1;
            else unknownOutcomes += 1;
            groups.set(event.mark, row);
        }
        const ranked = Array.from(groups.values()).map(row => {
            const known = row.success + row.fail + row.critical;
            const progressEstimate = known ? Number(wilsonLowerBound(row.success, known).toFixed(2)) : null;
            return { ...row, known, progressEstimate, confidence: known >= 30 ? "high" : known >= 10 ? "medium" : "low" };
        }).filter(row => row.known > 0).sort((a, b) => b.progressEstimate - a.progressEstimate || b.known - a.known || a.mark.localeCompare(b.mark));
        return { totalAttempts: Array.isArray(events) ? events.length : 0, unknownOutcomes, ranked };
    }

    function summarizeAttemptPeriod(events) {
        const summary = { attempts: 0, success: 0, fail: 0, critical: 0, gained: 0, lost: 0, net: 0 };
        for (const event of Array.isArray(events) ? events : []) {
            if (!event || typeof event !== "object") continue;
            summary.attempts += 1;
            if (["success", "fail", "critical"].includes(event.outcome)) summary[event.outcome] += 1;
            const delta = Number(event.skillDelta);
            if (!Number.isFinite(delta)) continue;
            if (delta > 0) summary.gained += delta;
            if (delta < 0) summary.lost += Math.abs(delta);
            summary.net += delta;
        }
        for (const key of ["gained", "lost", "net"]) summary[key] = Number(summary[key].toFixed(2));
        return summary;
    }

    function buildPeriodSummaries(events, now = Date.now()) {
        const current = Number(now);
        const safeNow = Number.isFinite(current) ? current : Date.now();
        const today = new Date(safeNow);
        today.setUTCHours(0, 0, 0, 0);
        const recent = Array.isArray(events) ? events.filter(event => optionalNumber(event?.at) !== null && Number(event.at) <= safeNow) : [];
        return {
            today: summarizeAttemptPeriod(recent.filter(event => Number(event.at) >= today.getTime())),
            week: summarizeAttemptPeriod(recent.filter(event => Number(event.at) >= safeNow - (7 * 24 * 60 * 60 * 1000))),
            all: summarizeAttemptPeriod(recent),
        };
    }

    function summarizeDashboardEvents(events) {
        const summary = { attempts: 0, success: 0, fail: 0, critical: 0, unknown: 0, gained: 0, lost: 0, net: 0, totalValue: 0, valuedAttempts: 0, observedSkill: 0, successRate: 0 };
        for (const event of Array.isArray(events) ? events : []) {
            if (!event || typeof event !== "object") continue;
            summary.attempts += 1;
            if (["success", "fail", "critical"].includes(event.outcome)) summary[event.outcome] += 1;
            else summary.unknown += 1;
            const delta = optionalNumber(event.skillDelta);
            if (delta !== null) {
                summary.observedSkill += 1;
                if (delta > 0) summary.gained += delta;
                if (delta < 0) summary.lost += Math.abs(delta);
                summary.net += delta;
            }
            const value = Number(event.value);
            if (event.value !== null && event.value !== undefined && Number.isFinite(value) && value >= 0) {
                summary.totalValue += value;
                summary.valuedAttempts += 1;
            }
        }
        const known = summary.success + summary.fail + summary.critical;
        summary.successRate = known ? Number(((summary.success / known) * 100).toFixed(1)) : 0;
        for (const key of ["gained", "lost", "net"]) summary[key] = Number(summary[key].toFixed(2));
        return summary;
    }

    function wilsonLowerBound(successes, count) {
        if (!count) return 0;
        const z = 1.96;
        const p = successes / count;
        return (p + z * z / (2 * count) - z * Math.sqrt((p * (1 - p) + z * z / (4 * count)) / count)) / (1 + z * z / count);
    }

    function summarizeDashboardTargets(events) {
        const groups = new Map();
        for (const event of Array.isArray(events) ? events : []) {
            if (!event || typeof event.mark !== "string") continue;
            const status = String(event.status || "unknown").trim().toLowerCase();
            const key = `${event.mark}|${status}`;
            const row = groups.get(key) || { mark: event.mark, status, attempts: 0, success: 0, fail: 0, critical: 0, unknown: 0, netSkill: 0, observedSkill: 0, totalValue: 0, valuedAttempts: 0 };
            row.attempts += 1;
            if (["success", "fail", "critical"].includes(event.outcome)) row[event.outcome] += 1;
            else row.unknown += 1;
            const delta = optionalNumber(event.skillDelta);
            if (delta !== null) { row.netSkill += delta; row.observedSkill += 1; }
            const value = Number(event.value);
            if (event.value !== null && event.value !== undefined && Number.isFinite(value) && value >= 0) {
                row.totalValue += value;
                row.valuedAttempts += 1;
            }
            groups.set(key, row);
        }
        return Array.from(groups.values()).map(row => {
            const known = row.success + row.fail + row.critical;
            return {
                ...row,
                known,
                safetyScore: wilsonLowerBound(row.success, known),
                averageSkill: row.observedSkill ? row.netSkill / row.observedSkill : null,
                successRate: known ? Number(((row.success / known) * 100).toFixed(1)) : 0,
                criticalRate: known ? Number(((row.critical / known) * 100).toFixed(1)) : 0,
                netSkill: Number(row.netSkill.toFixed(2)),
                averageValue: row.valuedAttempts ? Math.round(row.totalValue / row.valuedAttempts) : null,
                confidence: known >= 30 ? "high" : known >= 10 ? "medium" : "low",
            };
        }).sort((a, b) => b.safetyScore - a.safetyScore || b.known - a.known || a.mark.localeCompare(b.mark));
    }

    function buildDashboardStats(events, now = Date.now()) {
        const safeNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
        const midnight = new Date(safeNow);
        midnight.setUTCHours(0, 0, 0, 0);
        const valid = Array.isArray(events) ? events.filter(event => optionalNumber(event?.at) !== null && Number(event.at) > 0 && Number(event.at) <= safeNow) : [];
        const sets = {
            today: valid.filter(event => Number(event.at) >= midnight.getTime()),
            week: valid.filter(event => Number(event.at) >= safeNow - (7 * 24 * 60 * 60 * 1000)),
            month: valid.filter(event => Number(event.at) >= safeNow - (30 * 24 * 60 * 60 * 1000)),
            all: valid,
        };
        const periods = {};
        const targetPeriods = {};
        for (const key of Object.keys(sets)) {
            periods[key] = summarizeDashboardEvents(sets[key]);
            targetPeriods[key] = summarizeDashboardTargets(sets[key]);
        }
        const targets = targetPeriods.week;
        const knownAttempts = periods.week.success + periods.week.fail + periods.week.critical;
        const eligible = targets.filter(target => target.known >= 10);
        const leader = knownAttempts >= 10 ? eligible[0] : null;
        const recommendation = leader ? {
            mark: leader.mark,
            sample: leader.known,
            successRate: leader.successRate,
            critical: leader.critical,
            confidence: leader.confidence,
            status: leader.status,
        } : null;
        const trend = Array.from({ length: 14 }, (_, index) => {
            const start = midnight.getTime() - (13 - index) * 86400000;
            return { day: new Date(start).toISOString().slice(0, 10), ...summarizeDashboardEvents(valid.filter(event => event.at >= start && event.at < start + 86400000)) };
        });
        return { periods, targetPeriods, targets, recommendation, trend, events: sets };
    }

    function csvValue(value) {
        let text = String(value ?? "");
        if (typeof value === "string" && /^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function csvFromAttempts(events) {
        const header = ["Timestamp", "Target", "Status", "Outcome", "Tier", "Skill Before", "Skill After", "Visible Skill Change", "Visible Total Value", "Observed Torn Result"];
        const rows = (Array.isArray(events) ? events : []).map(event => [
            Number.isFinite(Number(event.at)) ? new Date(Number(event.at)).toISOString() : "",
            event.mark, event.status, event.outcome, event.tier, event.skill, event.skillAfter, event.skillDelta, event.value, event.resultText,
        ]);
        return [header, ...rows].map(row => row.map(csvValue).join(",")).join("\r\n");
    }

    function withObservedSkillDelta(event, skillAfter) {
        const before = event?.skill === null || event?.skill === undefined ? NaN : Number(event.skill);
        const after = optionalNumber(skillAfter);
        return {
            ...event,
            skillAfter: after,
            skillDelta: Number.isFinite(before) && after !== null ? Number((after - before).toFixed(2)) : null,
        };
    }

    function formatAttemptResult(event) {
        const outcome = event?.outcome;
        const title = outcome === "success" ? "SUCCESS" : outcome === "critical" ? "CRITICAL FAIL" : outcome === "fail" ? "FAIL" : outcome === "pending" ? "ATTEMPT SENT" : "RESULT UNREAD";
        const delta = optionalNumber(event?.skillDelta);
        const hasDelta = delta !== null;
        const before = optionalNumber(event?.skill);
        const after = optionalNumber(event?.skillAfter);
        const levelDropped = before !== null && after !== null && Math.floor(after) < Math.floor(before);
        const change = outcome === "pending" ? "Checking result…" : !hasDelta ? "CS change unavailable" : `CS ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`;
        const value = event?.value !== null && event?.value !== undefined && Number.isFinite(Number(event.value)) ? ` · $${Number(event.value).toLocaleString()}` : "";
        return { title, detail: `${levelDropped ? `${change} · Skill level dropped` : change}${value}`, levelDropped };
    }

    function shouldSyncListCompaction(rowCount) {
        return Number(rowCount) > 0;
    }

    function consumeStatus(pool, icon) {
        const queue = pool && pool[String(icon)];
        return Array.isArray(queue) && queue.length ? queue.shift() : null;
    }

    function summaryText(value) {
        const normalized = normalizeSettings(value);
        if (!normalized.useHelperUi) return "Torn UI mode";
        const readiness = normalized.readyOnly ? "Ready only" : "All statuses";
        const tiers = normalized.minTier > 1 ? `Tier ${normalized.minTier}+` : "All tiers";
        return `${readiness} · ${tiers} · Top ${normalized.bestCount}`;
    }

    function resolveAttemptStatus(badgeText, observedStatus) {
        const badge = String(badgeText || "").trim();
        if (badge) return badge;
        const title = typeof observedStatus?.statusTitle === "string" ? observedStatus.statusTitle.trim() : "";
        if (title) return title;
        const icon = typeof observedStatus?.statusIcon === "string" ? observedStatus.statusIcon.trim() : "";
        return icon || "unknown";
    }

    function isTargetCardCandidate(node) {
        if (!node || typeof node.querySelector !== "function") return false;
        return Boolean(
            node.querySelector('img[src*="/crimes/faces/"]') &&
            node.querySelector('[class*="titleAndProps___"]')
        );
    }

    function findTargetCard(titleNode) {
        let fallback = null;
        for (let node = titleNode; node && node.parentElement; node = node.parentElement) {
            if (!isTargetCardCandidate(node)) continue;
            if (node.classList?.contains?.("virtual-item") || /(?:^|\s)virtualItem___/.test(String(node.className || ""))) {
                return node;
            }
            if (!fallback) fallback = node;
            const siblings = Array.from(node.parentElement.children || []);
            if (siblings.filter(isTargetCardCandidate).length > 1) return node;
        }
        return fallback;
    }

    function setCardFiltered(card, hidden) {
        if (!card || !card.classList) return;
        card.classList[hidden ? "add" : "remove"]("pp-helper-filtered");
    }

    function findSharedListParent(cards) {
        const list = Array.from(cards || []).filter(Boolean);
        if (!list.length) return null;
        const parent = list[0].parentElement;
        if (!parent || !list.every(card => card.parentElement === parent)) return null;
        return parent;
    }

    function findCompactionParent(cards) {
        const list = Array.from(cards || []).filter(Boolean);
        const direct = findSharedListParent(list);
        if (direct) return direct;
        for (let parent = list[0]?.parentElement; parent; parent = parent.parentElement) {
            if (!list.every(card => parent.contains?.(card))) continue;
            const rows = Array.from(parent.children || []).filter(child => list.some(card => child === card || child.contains?.(card)));
            if (rows.length > 1) return parent;
        }
        return null;
    }

    function findCompactionRows(parent, cards) {
        const list = Array.from(cards || []).filter(Boolean);
        return Array.from(parent?.children || []).filter(child => list.some(card => child === card || child.contains?.(card)));
    }

    function syncListCompaction(cards, active) {
        const list = Array.from(cards || []).filter(Boolean);
        const parent = findCompactionParent(list);
        const rows = findCompactionRows(parent, list);
        const owner = parent?.closest?.('[class*="currentCrime___"]') || null;
        const slider = owner?.closest?.('[class*="crimeSlider___"]') || null;
        const isVirtualized = Boolean(parent && (
            parent.classList.contains("pp-helper-compacted") ||
            [...list, ...rows].some(card => {
                const className = String(card.className || "");
                if (card.classList?.contains?.("virtual-item") || /(?:^|\s)virtualItem___/.test(className)) return true;
                const style = globalThis.getComputedStyle?.(card);
                return style?.position === "absolute" || (style?.transform && style.transform !== "none");
            })
        ));
        document.querySelectorAll(".pp-helper-compacted").forEach(node => {
            if (!active || node !== parent) node.classList.remove("pp-helper-compacted");
        });
        document.querySelectorAll(".pp-helper-compacted-owner").forEach(node => {
            if (!active || node !== owner) node.classList.remove("pp-helper-compacted-owner");
        });
        document.querySelectorAll(".pp-helper-compacted-slider").forEach(node => {
            if (!active || node !== slider) node.classList.remove("pp-helper-compacted-slider");
        });
        document.querySelectorAll(".pp-helper-compact-row").forEach(node => {
            if (!active || !rows.includes(node)) node.classList.remove("pp-helper-compact-row");
        });
        document.querySelectorAll(".pp-helper-filtered-wrapper").forEach(node => node.classList.remove("pp-helper-filtered-wrapper"));
        if (active && isVirtualized) {
            parent.classList.add("pp-helper-compacted");
            rows.forEach(row => {
                row.classList?.add("pp-helper-compact-row");
                const children = list.filter(card => card === row || row.contains(card));
                row.classList.toggle("pp-helper-filtered-wrapper", children.length > 0 && children.every(card => card.classList.contains("pp-helper-filtered")));
            });
            owner?.classList.add("pp-helper-compacted-owner");
            slider?.classList.add("pp-helper-compacted-slider");
        }
    }

    function onActivityChange(state, active, emit = () => {}) {
        if (!state) return;
        const next = Boolean(active);
        if (state.active === next) return;
        state.active = next;
        state.repaintQueued = false;
        if (!next) {
            emit("pause");
            return;
        }
        state.repaintQueued = true;
        emit("resume-and-repaint");
    }

    function statusMapFromCrimesList(data) {
        const list = data && data.DB && data.DB.crimesByType;
        if (!Array.isArray(list)) return null;
        const map = {};
        for (const target of list) {
            const crimeInfo = target && target.crimeInfo;
            const icon = crimeInfo && crimeInfo.status && crimeInfo.status.icon;
            if (target?.iconClass == null) continue;
            const key = String(target.iconClass);
            if (typeof icon !== "string" || !icon.trim()) { (map[key] = map[key] || []).push(null); continue; }
            (map[key] = map[key] || []).push({
                statusIcon: icon.trim().toLowerCase(),
                statusTitle: typeof crimeInfo.status.title === "string" ? crimeInfo.status.title : icon,
                build: crimeInfo.muscular,
            });
        }
        return map;
    }

    const TEST_API = Object.freeze({
        DEFAULT_SETTINGS,
        buildDashboardStats,
        buildInsights,
        buildPeriodSummaries,
        classifyAttemptOutcome,
        resolveMark,
        resolveAttemptStatus,
        normalizeSettings,
        verdict,
        consumeStatus,
        findTargetCard,
        findSharedListParent,
        findCompactionParent,
        isPickpocketAttemptRequest,
        installFetchHook,
        installXhrHook,
        normalizeAttemptLog,
        csvFromAttempts,
        extractAttemptValue,
        formatAttemptResult,
        withObservedSkillDelta,
        shouldSyncListCompaction,
        summaryText,
        setCardFiltered,
        statusMapFromCrimesList,
        onActivityChange,
    });
    if (globalThis.__PP_HELPER_TEST_MODE__ === true) {
        globalThis.__PP_HELPER_TEST_API__ = TEST_API;
        return;
    }
    if (globalThis[Symbol.for("pp-helper.running")]) return;
    globalThis[Symbol.for("pp-helper.running")] = true;

    // ---- Live status data from the crimes API ----
    let statusByIcon = {};
    const statusByCard = new WeakMap();

    function ingestCrimesList(data) {
        try {
            const map = statusMapFromCrimesList(data);
            if (map === null) return;
            statusByIcon = map;
            scheduleRepaint();
        } catch (e) { /* ignore */ }
    }

    function installFetchHook(target, onData = ingestCrimesList, onAttempt = () => {}, getAttemptId = () => null) {
        if (!target || typeof target.fetch !== "function") return null;
        if (target[FETCH_HOOK] && target[FETCH_HOOK].wrapped === target.fetch) {
            return target[FETCH_HOOK].wrapped;
        }
        const originalFetch = target.fetch;
        const wrapped = async function(...args) {
            const attemptId = getAttemptId();
            const response = await Reflect.apply(originalFetch, this, args);
            try {
                const url = (typeof args[0] === "string" ? args[0] : (args[0] && args[0].url)) || "";
                if (url.includes("sid=crimesData") && url.includes("step=crimesList")) {
                    response.clone().json().then(onData).catch(() => {});
                } else if (isPickpocketAttemptRequest(url)) {
                    response.clone().json().then(data => onAttempt(data, attemptId)).catch(() => {});
                }
            } catch (e) { /* preserve the page response even when observation fails */ }
            return response;
        };
        Object.defineProperty(target, FETCH_HOOK, {
            configurable: true,
            enumerable: false,
            value: { original: originalFetch, wrapped },
        });
        target.fetch = wrapped;
        return wrapped;
    }
    function installXhrHook(target, onAttempt = () => {}, getAttemptId = () => null, onData = () => {}) {
        const proto = target?.XMLHttpRequest?.prototype;
        if (!proto || proto[FETCH_HOOK]) return proto?.[FETCH_HOOK]?.wrapped || null;
        const originalOpen = proto.open;
        const originalSend = proto.send;
        if (typeof originalOpen !== "function" || typeof originalSend !== "function") return null;
        const requestUrl = Symbol("pp-helper.xhr-url");
        proto.open = function(method, url, ...args) {
            this[requestUrl] = url;
            return Reflect.apply(originalOpen, this, [method, url, ...args]);
        };
        proto.send = function(...args) {
            const attemptId = getAttemptId();
            if (isPickpocketAttemptRequest(this[requestUrl])) {
                this.addEventListener("loadend", () => {
                    try { onAttempt(this.responseType === "json" ? this.response : JSON.parse(this.responseText), attemptId); } catch (e) { /* unreadable response */ }
                }, { once: true });
            } else if (String(this[requestUrl]).includes("step=crimesList")) {
                this.addEventListener("loadend", () => {
                    try { onData(this.responseType === "json" ? this.response : JSON.parse(this.responseText)); } catch { /* unreadable list */ }
                }, { once: true });
            }
            return Reflect.apply(originalSend, this, args);
        };
        Object.defineProperty(proto, FETCH_HOOK, { configurable: false, enumerable: false, value: { wrapped: proto.send } });
        return proto.send;
    }
    installFetchHook(globalThis, ingestCrimesList, ingestAttemptPayload, () => pendingAttempt?.id);
    installXhrHook(globalThis, ingestAttemptPayload, () => pendingAttempt?.id, ingestCrimesList);

    // ---- User settings (persisted in localStorage) ----
    const LS_KEY = "ppColorsSettings_v2";
    function loadSettings() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) return normalizeSettings(JSON.parse(raw));
        } catch (e) { /* ignore */ }
        return normalizeSettings(DEFAULT_SETTINGS);
    }
    function saveSettings(s) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(normalizeSettings(s))); } catch (e) { /* ignore */ }
    }
    let settings = loadSettings();
    const ATTEMPT_LOG_KEY = "ppColorsAttemptLog_v1";
    let attemptLog = normalizeAttemptLog({ enabled: settings.insightsEnabled, events: [] });
    let pendingAttempt = null;
    let attemptLogSaveTimer = null;
    let attemptLogMessage = "";
    let lastAttemptResult = null;
    let attemptResultTimer = null;
    let attemptResultObserver = null;
    let attemptExpiryTimer = null;
    let attemptNetworkTimer = null;
    let insightPeriod = "week";
    let helperView = "targets";
    let historyPageSize = 20;
    let logHydrated = false;
    let logWriteChain = Promise.resolve();
    let attemptCompletionTimer = null;
    let attemptSerial = 0;
    let lastUnresolvedAt = 0;
    let nativeConfirmedIds = new Set();

    function hasNativeAttemptStorage() {
        return Boolean(globalThis.PDA_storage && typeof globalThis.PDA_storage.get === "function" && typeof globalThis.PDA_storage.set === "function");
    }

    function readLocalAttemptLog() {
        try { return normalizeAttemptLog(JSON.parse(localStorage.getItem(ATTEMPT_LOG_KEY) || "null")); } catch (e) { return normalizeAttemptLog(null); }
    }

    function money(value) {
        return `$${Math.round(Number(value) || 0).toLocaleString()}`;
    }

    function renderInsightsDashboard(helper) {
        const dashboard = helper?.querySelector("#pp-insights-dashboard");
        if (!dashboard || dashboard.hidden) return;
        const stats = buildDashboardStats(attemptLog.events);
        const period = stats.periods[insightPeriod];
        const targets = rankHistory(stats.targetPeriods[insightPeriod]);
        const known = period.success + period.fail + period.critical;
        const setText = (selector, value) => {
            const node = dashboard.querySelector(selector);
            if (node) node.textContent = value;
        };
        setText("#pp-metric-attempts", String(period.attempts));
        setText("#pp-metric-success", known ? `${period.successRate}%` : "—");
        setText("#pp-metric-cs", period.observedSkill ? `${period.net >= 0 ? "+" : ""}${period.net.toFixed(2)}` : "—");
        setText("#pp-metric-value", period.valuedAttempts ? money(period.totalValue) : "—");
        setText("#pp-value-note", period.valuedAttempts ? `from ${period.valuedAttempts} visible result${period.valuedAttempts === 1 ? "" : "s"}` : "no visible values yet");
        setText("#pp-skill-coverage", `CS gained +${period.gained.toFixed(2)} · lost −${period.lost.toFixed(2)} · ${period.observedSkill}/${period.attempts} attempts have a visible CS change. ${period.unknown} unread outcomes excluded from success rate.`);
        const daily = dashboard.querySelector("#pp-daily-chart");
        daily.replaceChildren();
        const dailyFigures = dashboard.querySelector("#pp-daily-figures"); dailyFigures.replaceChildren();
        const max = Math.max(.01, ...stats.trend.flatMap(day => [day.gained, day.lost]));
        for (const day of stats.trend) {
            const column = document.createElement("div");
            column.className = "pp-daily-column";
            column.title = `${day.day}: +${day.gained.toFixed(2)} / −${day.lost.toFixed(2)} CS; ${day.attempts} attempts, ${day.observedSkill} CS readings`;
            column.setAttribute("aria-label", column.title);
            const bars = document.createElement("div"); bars.className = "pp-daily-bars";
            for (const [kind, value] of [["gain", day.gained], ["loss", day.lost]]) {
                const bar = document.createElement("span"); bar.className = `pp-daily-${kind}`; bar.style.height = `${value / max * 100}%`; bars.append(bar);
            }
            const date = document.createElement("small"); date.textContent = day.day.slice(-2);
            column.append(bars, date); daily.append(column);
            const figure = document.createElement("p"); figure.textContent = column.title; dailyFigures.append(figure);
        }
        const recent = dashboard.querySelector("#pp-recent-attempts"); recent.replaceChildren();
        const events = stats.events[insightPeriod].slice().sort((a,b) => b.at-a.at);
        for (const event of events.slice(0, historyPageSize)) {
            const row = document.createElement("article"); row.className = `pp-history-row pp-history-${event.outcome}`;
            const title = document.createElement("strong"); title.textContent = `${event.mark} · ${event.status}`;
            const result = document.createElement("span"); const formatted = formatAttemptResult(event); result.textContent = `${formatted.title} · ${formatted.detail}`;
            const time = document.createElement("time"); time.dateTime = new Date(event.at).toISOString(); time.textContent = `${time.dateTime.slice(5, 16).replace("T", " ")} UTC`;
            row.append(title, result, time);
            if (event.resultText) {
                const details = document.createElement("details");
                const summary = document.createElement("summary"); summary.textContent = "Observed Torn result";
                const text = document.createElement("p"); text.textContent = event.resultText;
                details.append(summary, text); row.append(details);
            }
            recent.append(row);
        }
        if (!events.length) recent.textContent = "No attempts in this period. Log a pickpocket to start your ledger.";
        dashboard.querySelector("#pp-more-history").hidden = events.length <= historyPageSize;

        const chart = dashboard.querySelector("#pp-outcome-chart");
        const outcomes = [
            ["success", period.success, "Success"],
            ["fail", period.fail, "Fail"],
            ["critical", period.critical, "Critical"],
            ["unknown", period.unknown, "Unread"],
        ];
        chart.replaceChildren();
        outcomes.forEach(([name, count, label]) => {
            const segment = document.createElement("span");
            segment.className = `pp-chart-segment pp-chart-${name}`;
            segment.style.flexGrow = String(count);
            segment.hidden = count === 0;
            segment.title = `${label}: ${count}`;
            chart.appendChild(segment);
        });
        chart.setAttribute("aria-label", outcomes.map(([, count, label]) => `${label} ${count}`).join(", "));
        setText("#pp-outcome-legend", `Success ${period.success} · Fail ${period.fail} · Critical ${period.critical}${period.unknown ? ` · Unread ${period.unknown}` : ""}`);

        const rec = dashboard.querySelector("#pp-recommendation");
        const eligible = targets.filter(historyEligible);
        const periodKnown = known;
        const leader = eligible[0];
        if (leader) {
            rec.className = "pp-recommendation pp-recommendation-ready";
            rec.querySelector("strong").textContent = `Observed leader: ${leader.mark} · ${leader.status}`;
            rec.querySelector("span").textContent = `${leader.successRate}% success · ${leader.critical} critical · ${leader.known} readable attempts. Ranked for ${settings.adviceGoal}; small samples remain uncertain. History is not guaranteed odds or XP.`;
        } else {
            rec.className = "pp-recommendation";
            rec.querySelector("strong").textContent = "More history needed";
            rec.querySelector("span").textContent = "Each target + status needs 10 readable outcomes and 80% outcome coverage. CS/value goals also need 10 readings and 80% coverage. Until then, highlights use advisory difficulty only.";
        }

        const list = dashboard.querySelector("#pp-target-scorecards");
        list.replaceChildren();
        if (!targets.length) {
            const empty = document.createElement("p");
            empty.className = "pp-dashboard-empty";
            empty.textContent = "No target history in this period yet.";
            list.appendChild(empty);
        } else {
            targets.slice(0, 60).forEach(target => {
                const row = document.createElement("article");
                row.className = "pp-target-scorecard";
                const head = document.createElement("div");
                head.className = "pp-scorecard-head";
                const name = document.createElement("strong");
                name.textContent = `${target.mark} · ${target.status}`;
                const sample = document.createElement("span");
                sample.textContent = `${target.known} readable / ${target.attempts} total`;
                head.append(name, sample);
                const bar = document.createElement("div");
                bar.className = "pp-scorecard-bar";
                bar.setAttribute("aria-label", `${target.mark}: ${target.successRate}% success, ${target.criticalRate}% critical`);
                const success = document.createElement("span");
                success.className = "pp-score-success";
                success.style.width = `${target.successRate}%`;
                const critical = document.createElement("span");
                critical.className = "pp-score-critical";
                critical.style.width = `${target.criticalRate}%`;
                bar.append(success, critical);
                const detail = document.createElement("div");
                detail.className = "pp-scorecard-detail";
                detail.textContent = `${target.successRate}% success · ${target.fail} fail / ${target.critical} critical · CS/reading ${target.averageSkill === null ? "—" : target.averageSkill.toFixed(3)} (${target.observedSkill}) · Avg loot ${target.averageValue === null ? "—" : money(target.averageValue)} (${target.valuedAttempts})${historyEligible(target) ? "" : " · Building sample"}`;
                row.append(head, bar, detail);
                list.appendChild(row);
            });
        }
        dashboard.querySelectorAll("[data-insight-period]").forEach(button => {
            button.setAttribute("aria-pressed", String(button.dataset.insightPeriod === insightPeriod));
        });
    }

    function historyEligible(row) {
        if (row.known < 10 || row.known / row.attempts < .8 || row.status === "unknown") return false;
        const readings = settings.adviceGoal === "skill" ? row.observedSkill : settings.adviceGoal === "value" ? row.valuedAttempts : row.known;
        return readings >= 10 && readings / row.attempts >= .8;
    }

    function rankHistory(rows) {
        const score = row => settings.adviceGoal === "skill" ? row.averageSkill ?? -Infinity : settings.adviceGoal === "value" ? row.averageValue ?? -Infinity : row.safetyScore;
        return rows.slice().sort((a,b) => Number(historyEligible(b)) - Number(historyEligible(a)) || score(b)-score(a) || b.known-a.known);
    }

    function renderInsights(helper = document.getElementById("pp-helper")) {
        if (!helper || document.visibilityState === "hidden") return;
        const summary = helper.querySelector("#pp-insights-summary");
        const toggle = helper.querySelector("#pp-insights-toggle");
        const exportButton = helper.querySelector("#pp-export-log");
        const clearButton = helper.querySelector("#pp-clear-log");
        if (!summary || !toggle || !exportButton || !clearButton) return;
        toggle.setAttribute("aria-checked", String(attemptLog.enabled));
        toggle.querySelector("span").textContent = attemptLog.enabled ? "Logging attempts" : "Logging off";
        exportButton.disabled = attemptLog.events.length === 0;
        clearButton.hidden = attemptLog.events.length === 0;
        const base = !logHydrated ? "Loading saved history…" : `${attemptLog.enabled ? "Logging on" : "Logging paused"} · ${attemptLog.events.length}/750 retained attempts`;
        const labels = { success: "Success", fail: "Failed", critical: "Critical fail", unknown: "Attempt recorded" };
        const delta = lastAttemptResult?.skillDelta;
        const last = lastAttemptResult ? `Last: ${lastAttemptResult.mark} · ${labels[lastAttemptResult.outcome] || "Attempt recorded"}${delta === null ? " · CS change unavailable" : ` · CS ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`}` : "";
        summary.textContent = attemptLogMessage || (last ? `${last} · ${base}` : base);
        renderInsightsDashboard(helper);
    }

    async function hydrateAttemptLog() {
        const legacy = readLocalAttemptLog();
        let stored = legacy;
        try {
            if (hasNativeAttemptStorage()) {
                const native = await globalThis.PDA_storage.get(ATTEMPT_LOG_KEY, null);
                if (native) {
                    const normalized = normalizeAttemptLog(native);
                    nativeConfirmedIds = new Set(normalized.events.map(event => `${event.id}:${event.restoredAt || 0}`));
                    stored = normalizeAttemptLog({ ...normalized, clearedAt: Math.max(normalized.clearedAt, legacy.clearedAt), events: [...normalized.events, ...legacy.events] });
                }
            }
        } catch (e) {
            attemptLogMessage = "Storage unavailable — using this browser only";
        }
        attemptLog = normalizeAttemptLog({ ...stored, clearedAt: Math.max(stored.clearedAt, attemptLog.clearedAt), events: [...stored.events, ...attemptLog.events] });
        attemptLog.enabled = settings.insightsEnabled;
        logHydrated = true;
        queueAttemptLogSave();
        renderInsights();
    }

    function saveAttemptLogNow() {
        if (!logHydrated) return;
        attemptLog.updatedAt = Date.now();
        const snapshot = normalizeAttemptLog(attemptLog);
        const fallback = () => {
            try { localStorage.setItem(ATTEMPT_LOG_KEY, JSON.stringify(snapshot)); }
            catch (e) { attemptLogMessage = "History is not saved: storage full. Export a backup now."; renderInsights(); }
        };
        if (!hasNativeAttemptStorage()) {
            fallback();
            return;
        }
        writeRecoverySnapshot();
        logWriteChain = logWriteChain.then(async () => {
            try {
                await globalThis.PDA_storage.set(ATTEMPT_LOG_KEY, snapshot);
                nativeConfirmedIds = new Set(snapshot.events.map(event => `${event.id}:${event.restoredAt || 0}`));
                writeRecoverySnapshot();
            } catch {
                fallback();
                attemptLogMessage = "PDA storage unavailable — browser fallback saved if space permits";
                renderInsights();
            }
        });
        return logWriteChain;
    }

    function writeRecoverySnapshot() {
        // Synchronous journal contains only records not yet confirmed in SQLite.
        // Never let completion of an older native write erase a newer pending record.
        const unconfirmed = event => !nativeConfirmedIds.has(`${event.id}:${event.restoredAt || 0}`);
        const events = attemptLog.events.filter(unconfirmed);
        try {
            const old = readLocalAttemptLog();
            const recovery = normalizeAttemptLog({ ...attemptLog, clearedAt: Math.max(old.clearedAt, attemptLog.clearedAt), events: [...old.events.filter(unconfirmed), ...events] });
            localStorage.setItem(ATTEMPT_LOG_KEY, JSON.stringify(recovery));
        } catch { attemptLogMessage = "Recovery storage is full. Export a backup before closing this tab."; }
    }

    function queueAttemptLogSave() {
        if (attemptLogSaveTimer) globalThis.clearTimeout(attemptLogSaveTimer);
        attemptLogSaveTimer = globalThis.setTimeout(() => {
            attemptLogSaveTimer = null;
            saveAttemptLogNow();
        }, 300);
    }

    function appendAttempt(event) {
        if (!attemptLog.enabled || !event?.mark) return;
        attemptLog.events.push(event);
        attemptLog = normalizeAttemptLog(attemptLog);
        attemptLogMessage = "";
        queueAttemptLogSave();
        renderInsights();
    }

    function showAttemptResult(event) {
        const feedback = document.getElementById("pp-attempt-feedback");
        if (!feedback) return;
        if (!settings.useHelperUi) {
            feedback.hidden = true;
            return;
        }
        if (attemptResultTimer) globalThis.clearTimeout(attemptResultTimer);
        const result = formatAttemptResult(event);
        feedback.className = `pp-attempt-result pp-attempt-${event.outcome || "unknown"}`;
        feedback.replaceChildren();
        const title = document.createElement("strong");
        title.textContent = result.title;
        const detail = document.createElement("span");
        detail.textContent = `${event.mark || "Pickpocket"} · ${result.detail}`;
        feedback.append(title, detail);
        feedback.hidden = false;
        attemptResultTimer = globalThis.setTimeout(() => {
            feedback.hidden = true;
            attemptResultTimer = null;
        }, 6500);
    }

    function clearAttemptWatch() {
        attemptResultObserver?.disconnect();
        attemptResultObserver = null;
        if (attemptExpiryTimer) globalThis.clearTimeout(attemptExpiryTimer);
        if (attemptNetworkTimer) globalThis.clearTimeout(attemptNetworkTimer);
        if (attemptCompletionTimer) globalThis.clearTimeout(attemptCompletionTimer);
        attemptCompletionTimer = null;
        attemptExpiryTimer = null;
        attemptNetworkTimer = null;
    }

    function commitPendingAttempt(readSkill = true) {
        if (!pendingAttempt) return;
        const card = pendingAttempt.card;
        const observed = { ...pendingAttempt, outcome: pendingAttempt.outcome || pendingAttempt.networkOutcome || "unknown" };
        if (observed.outcome === "unknown") lastUnresolvedAt = Date.now();
        delete observed.card;
        delete observed.domAmbiguous;
        delete observed.networkOutcome;
        clearAttemptWatch();
        pendingAttempt = null;
        const completed = withObservedSkillDelta(observed, readSkill && observed.outcome !== "unknown" ? getSkill() : null);
        showCardResult(card, completed);
        lastAttemptResult = completed;
        showAttemptResult(completed);
        appendAttempt(completed);
        renderInsights();
    }

    function showCardResult(card, event) {
        if (!settings.useHelperUi || !card?.isConnected) return;
        let output = card.querySelector(".pp-card-feedback");
        if (!output) {
            output = document.createElement("output"); output.className = "pp-card-feedback";
            output.dataset.ppHelperOwned = "true"; output.setAttribute("role", "status"); card.append(output);
        }
        const result = formatAttemptResult(event);
        output.textContent = `${result.title} · ${result.detail}`;
    }

    function finishPendingAttempt(outcome, value = null) {
        if (!pendingAttempt || !["success", "fail", "critical"].includes(outcome)) return;
        pendingAttempt.outcome = outcome;
        if (value !== null) pendingAttempt.value = value;
        showAttemptResult({ ...pendingAttempt, skillDelta: null });
        showCardResult(pendingAttempt.card, { ...pendingAttempt, skillDelta: null });
        if (!attemptCompletionTimer) attemptCompletionTimer = globalThis.setTimeout(() => commitPendingAttempt(), 700);
    }

    function ingestAttemptPayload(payload, attemptId) {
        if (!pendingAttempt || (attemptId !== undefined && attemptId !== pendingAttempt.id)) return;
        const outcome = classifyAttemptOutcome(payload);
        if (outcome === "unknown") return;
        pendingAttempt.networkOutcome = outcome;
        if (attemptNetworkTimer) globalThis.clearTimeout(attemptNetworkTimer);
        attemptNetworkTimer = globalThis.setTimeout(() => {
            attemptNetworkTimer = null;
            if (pendingAttempt?.id === attemptId) finishPendingAttempt(pendingAttempt.networkOutcome || outcome);
        }, 1200);
    }

    function watchAttemptResultPanel() {
        attemptResultObserver?.disconnect();
        const root = pendingAttempt?.card?.closest?.('[class*="currentCrime___"]')?.parentElement || pendingAttempt?.card?.parentElement;
        if (typeof MutationObserver !== "function" || !root) return;
        attemptResultObserver = new MutationObserver(records => {
            if (!pendingAttempt) return;
            let outcome = null;
            let value = pendingAttempt.value;
            for (const record of records) {
                const candidates = record.type === "characterData" ? [record.target?.parentElement] : [...record.addedNodes];
                for (const candidate of candidates) {
                    const node = candidate?.nodeType === 3 ? candidate.parentElement : candidate;
                    if (!node || node.id === "pp-helper" || node.closest?.("#pp-helper, [data-pp-helper-owned]") || node.matches?.("[data-pp-helper-owned]") || node.querySelector?.("#pp-helper, .pp-card-feedback")) continue;
                    const resultCard = node.closest?.(".pp-helper-target, .virtual-item, [class*='virtualItem___']") || (pendingAttempt.card.contains(node) ? pendingAttempt.card : null);
                    if (resultCard && resultCard !== pendingAttempt.card) {
                        const title = resultCard.querySelector?.('[class*="titleAndProps___"] div');
                        const sameIdentity = !pendingAttempt.domAmbiguous && resolveMark(title?.textContent)?.name === pendingAttempt.mark
                            && faceIconFromRow(resultCard) === pendingAttempt.face;
                        if (!sameIdentity) continue;
                    }
                    if (!resultCard && pendingAttempt.domAmbiguous && !pendingAttempt.networkOutcome) continue;
                    const text = node?.textContent;
                    if (!text || text.length > 4000) continue;
                    const lateValue = extractAttemptValue(text);
                    if (lateValue !== null) value = lateValue;
                    if (!/\b(?:SUCCESS|FAIL(?:ED|URE)?|CRITICAL)\b/.test(text)) continue;
                    const classified = classifyAttemptOutcome({ message: text });
                    if (classified !== "unknown") {
                        outcome = classified;
                        pendingAttempt.resultText = String(text).replace(/\s+/g, " ").trim().slice(0, 1600);
                    }
                }
            }
            pendingAttempt.value = value;
            if (outcome) finishPendingAttempt(pendingAttempt.networkOutcome || outcome, value);
        });
        attemptResultObserver.observe(root, { childList: true, characterData: true, subtree: true });
    }

    function captureAttemptIntent(event) {
        if (!isPickpocketRoute()) return;
        const button = event.target?.closest?.("button");
        if (!button || button.closest("#pp-helper, [data-pp-helper-owned]") || button.disabled || button.getAttribute("aria-disabled") === "true") return;
        const labels = [button.textContent, button.getAttribute("aria-label")];
        if (!labels.some(label => /^pickpocket(?:\s*\d+)?$/i.test(String(label || "").trim()))) return;
        const card = findTargetCard(button);
        const title = card?.querySelector?.('[class*="titleAndProps___"] div');
        // Reject common page/list ancestors found while walking up from a menu.
        // The action and target title must independently resolve to the same row.
        if (!title || card.querySelectorAll('[class*="titleAndProps___"]').length !== 1 || findTargetCard(title) !== card) return;
        const resolved = resolveMark(title?.textContent);
        if (!resolved) return;
        if (pendingAttempt?.card === card && !pendingAttempt.outcome && Date.now() - pendingAttempt.at < 15000) return;
        if (pendingAttempt) commitPendingAttempt(false);
        card.querySelector(".pp-card-feedback")?.remove();
        const status = resolveAttemptStatus("", statusByCard.get(card));
        clearAttemptWatch();
        pendingAttempt = { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${++attemptSerial}-${Math.random().toString(36).slice(2)}`, mark: resolved.name, status, tier: resolved.tier, skill: getSkill(), card, at: Date.now(), value: null, domAmbiguous: Date.now() - lastUnresolvedAt < 15000 };
        pendingAttempt.face = faceIconFromRow(card);
        attemptExpiryTimer = globalThis.setTimeout(() => {
            commitPendingAttempt(false);
        }, 15000);
        showAttemptResult({ ...pendingAttempt, outcome: "pending", skillDelta: null });
        watchAttemptResultPanel();
    }

    function utf8Base64(value) {
        const bytes = new TextEncoder().encode(value);
        let binary = "";
        bytes.forEach(byte => { binary += String.fromCharCode(byte); });
        return btoa(binary);
    }

    async function importAttemptLog(event) {
        const input = event.target;
        const file = input.files?.[0];
        if (!file) return;
        try {
            if (!logHydrated) throw new Error("Wait for saved history to load first");
            if (file.size > 2000000) throw new Error("Backup is too large (2 MB maximum)");
            const raw = JSON.parse(await file.text());
            if (!raw || !Array.isArray(raw.events) || raw.events.length > 10000) throw new Error("Not a Pickpocket Helper backup");
            const restored = normalizeAttemptLog({ events: raw.events });
            if (!restored.events.length) throw new Error("Backup has no valid attempts");
            const restoredAt = Date.now();
            attemptLog = normalizeAttemptLog({ ...attemptLog, events: [...restored.events.map(event => ({ ...event, restoredAt })), ...attemptLog.events] });
            queueAttemptLogSave();
            attemptLogMessage = `Backup merged; ${attemptLog.events.length} unique attempts retained. Existing records were preserved.`;
        } catch (error) { attemptLogMessage = `Restore failed: ${error.message}`; }
        finally { input.value = ""; renderInsights(); }
    }

    async function exportAttemptLog(format = "csv") {
        if (!attemptLog.events.length) return;
        const csv = format === "json" ? JSON.stringify(normalizeAttemptLog(attemptLog), null, 2) : `\uFEFF${csvFromAttempts(attemptLog.events)}`;
        const filename = `torn-pickpocket-insights-${new Date().toISOString().slice(0, 10)}.${format}`;
        const download = () => {
            const url = URL.createObjectURL(new Blob([csv], { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" }));
            const link = document.createElement("a");
            link.href = url; link.download = filename; link.hidden = true;
            document.body.appendChild(link); link.click(); link.remove();
            globalThis.setTimeout(() => URL.revokeObjectURL(url), 30000);
            attemptLogMessage = "Download requested. If your mobile browser blocks it, use the copyable export below.";
        };
        try {
            const bridge = globalThis.flutter_inappwebview;
            if (typeof globalThis.shareFile === "function" || typeof bridge?.callHandler === "function") {
                try {
                    const args = { base64Data: utf8Base64(csv), fileName: filename };
                    if (globalThis.__PDA_platformReadyPromise) await globalThis.__PDA_platformReadyPromise;
                    const result = typeof globalThis.shareFile === "function" ? await globalThis.shareFile(args) : await bridge.callHandler("shareFile", args);
                    if (result?.success === false || result?.status === "error") throw new Error("Share unavailable");
                    attemptLogMessage = "Native share sheet opened";
                } catch { download(); }
            } else {
                download();
            }
        } catch (e) {
            attemptLogMessage = "Download unavailable. Copy the export below and save it as a file.";
        }
        const backupText = document.querySelector("#pp-export-text");
        if (backupText) { backupText.value = csv; backupText.closest("details").hidden = false; }
        renderInsights();
    }

    // ---- Inline settings UI ----
    function ensureStyles() {
        if (document.getElementById("pp-helper-styles")) return;
        const style = document.createElement("style");
        style.id = "pp-helper-styles";
        style.textContent = `
            :root {
                --pp-helper-go: #51cf66;
                --pp-helper-wait: #fcc419;
                --pp-helper-avoid: #ff6b6b;
                --pp-helper-caution: #b197fc;
                --pp-helper-best: #ffe066;
            }
            #pp-helper {
                /* Primitive tokens */
                --pp-gray-950: #151719;
                --pp-gray-900: #1b1d20;
                --pp-gray-800: #24272b;
                --pp-gray-700: #34383e;
                --pp-gray-600: #464c54;
                --pp-gray-300: #c5cbd1;
                --pp-gray-100: #f1f3f5;
                --pp-green-500: #37b24d;
                --pp-gold-400: #ffd43b;
                --pp-space-1: 4px;
                --pp-space-2: 8px;
                --pp-space-3: 12px;
                --pp-radius-sm: 4px;
                --pp-radius-md: 6px;

                /* Semantic tokens */
                --pp-color-surface: var(--pp-gray-900);
                --pp-color-surface-raised: var(--pp-gray-800);
                --pp-color-border: var(--pp-gray-600);
                --pp-color-border-muted: var(--pp-gray-700);
                --pp-color-text: var(--pp-gray-100);
                --pp-color-text-muted: var(--pp-gray-300);
                --pp-color-accent: var(--pp-green-500);
                --pp-color-best: var(--pp-gold-400);

                /* Component tokens */
                --pp-helper-bg: var(--pp-color-surface);
                --pp-helper-border: var(--pp-color-border-muted);
                --pp-control-bg: var(--pp-color-surface-raised);
                --pp-control-border: var(--pp-color-border);
                --pp-control-focus: var(--pp-color-best);

                box-sizing: border-box;
                width: auto;
                margin-block: var(--pp-space-2);
                margin-left: max(0px, env(safe-area-inset-left));
                margin-right: max(0px, env(safe-area-inset-right));
                border: 1px solid var(--pp-helper-border);
                border-radius: var(--pp-radius-md);
                background: var(--pp-helper-bg);
                color: var(--pp-color-text);
                font: 14px/1.4 Arial, sans-serif;
            }
            #pp-helper *, #pp-helper *::before, #pp-helper *::after { box-sizing: border-box; }
            #pp-helper button { font: inherit; }
            #pp-helper-toggle {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                align-items: center;
                gap: var(--pp-space-2);
                width: 100%;
                min-height: 40px;
                padding: var(--pp-space-2) var(--pp-space-3);
                border: 0;
                border-radius: var(--pp-radius-md);
                background: transparent;
                color: inherit;
                text-align: left;
                cursor: pointer;
            }
            #pp-helper-toggle:hover { background: var(--pp-control-bg); }
            #pp-helper-toggle:focus-visible,
            #pp-helper button:focus-visible {
                outline: 2px solid var(--pp-control-focus);
                outline-offset: 2px;
            }
            .pp-helper-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--pp-space-2); min-width: 0; }
            .pp-helper-title { font-weight: 700; letter-spacing: .01em; }
            #pp-helper-summary { color: var(--pp-color-text-muted); font-size: 12px; }
            .pp-helper-chevron { transition: transform 120ms ease; }
            #pp-helper-toggle[aria-expanded="true"] .pp-helper-chevron { transform: rotate(180deg); }
            #pp-helper-controls {
                display: grid;
                grid-template-columns: minmax(170px, 1fr) minmax(250px, 2fr) minmax(180px, 1fr) auto;
                align-items: end;
                gap: var(--pp-space-3);
                padding: var(--pp-space-3);
                border-top: 1px solid var(--pp-helper-border);
            }
            #pp-helper-controls[hidden] { display: none; }
            .pp-helper-control { display: grid; gap: var(--pp-space-1); min-width: 0; }
            .pp-ui-mode-control { grid-column: 1 / -1; }
            .pp-ui-mode-options { display: grid; grid-template-columns: 1fr 1fr; gap: var(--pp-space-1); }
            #pp-helper[data-ui-mode="torn"] #pp-attempt-feedback { display: none !important; }
            .pp-helper-label, #pp-helper legend { color: var(--pp-color-text-muted); font-size: 12px; font-weight: 700; }
            #pp-helper fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
            .pp-tier-options, .pp-stepper { display: flex; align-items: center; gap: var(--pp-space-1); }
            #pp-helper button:not(#pp-helper-toggle) {
                min-width: 36px;
                min-height: 36px;
                padding: var(--pp-space-1) var(--pp-space-2);
                border: 1px solid var(--pp-control-border);
                border-radius: var(--pp-radius-sm);
                background: var(--pp-control-bg);
                color: var(--pp-color-text);
                cursor: pointer;
            }
            #pp-helper button[aria-pressed="true"],
            #pp-ready-only[aria-checked="true"] {
                border-color: var(--pp-color-accent);
                box-shadow: inset 0 0 0 1px var(--pp-color-accent);
            }
            #pp-ready-only { justify-content: flex-start; width: 100%; }
            #pp-ready-only::before { content: "○"; margin-right: var(--pp-space-2); }
            #pp-ready-only[aria-checked="true"]::before { content: "●"; color: var(--pp-color-accent); }
            #pp-best-count { min-width: 2ch; text-align: center; font-weight: 700; }
            #pp-reset { white-space: nowrap; }
            .pp-helper-insights {
                grid-column: 1 / -1;
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto auto auto auto;
                align-items: center;
                gap: var(--pp-space-2);
                padding-top: var(--pp-space-2);
                border-top: 1px solid var(--pp-helper-border);
            }
            #pp-insights-summary { color: var(--pp-color-text-muted); font-size: 12px; min-width: 0; }
            #pp-insights-toggle[aria-checked="true"] { border-color: var(--pp-color-accent); box-shadow: inset 0 0 0 1px var(--pp-color-accent); }
            #pp-export-log:disabled { cursor: not-allowed; opacity: .55; }
            #pp-insights-dashboard {
                grid-column: 1 / -1;
                display: grid;
                gap: var(--pp-space-3);
                padding: var(--pp-space-3);
                border: 1px solid var(--pp-helper-border);
                border-radius: var(--pp-radius-sm);
                background: linear-gradient(145deg, #1a1e22, #15181b);
            }
            #pp-insights-dashboard[hidden] { display: none; }
            .pp-dashboard-toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--pp-space-2); }
            .pp-dashboard-toolbar h3 { margin: 0; color: var(--pp-color-text); font-size: 14px; letter-spacing: .03em; }
            .pp-period-tabs { display: flex; gap: var(--pp-space-1); }
            .pp-period-tabs button { min-height: 32px !important; font-size: 11px; }
            .pp-dashboard-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--pp-space-2); }
            .pp-dashboard-metric { display: grid; gap: 2px; padding: 9px; border: 1px solid #343a40; border-radius: var(--pp-radius-sm); background: #20252a; }
            .pp-dashboard-metric span { color: var(--pp-color-text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: .07em; }
            .pp-dashboard-metric strong { color: #f5f7f8; font-size: 17px; font-variant-numeric: tabular-nums; }
            .pp-dashboard-metric small { color: var(--pp-color-text-muted); font-size: 9px; }
            .pp-dashboard-grid { display: grid; grid-template-columns: minmax(180px, .8fr) minmax(260px, 1.2fr); gap: var(--pp-space-3); align-items: start; }
            .pp-dashboard-panel { display: grid; gap: var(--pp-space-2); min-width: 0; }
            .pp-dashboard-panel h4 { margin: 0; color: var(--pp-color-text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
            .pp-outcome-chart { display: flex; height: 14px; overflow: hidden; border-radius: 999px; background: #30353a; }
            .pp-chart-segment { min-width: 3px; }
            .pp-chart-success { background: #36c76c; }
            .pp-chart-fail { background: #e0a526; }
            .pp-chart-critical { background: #e04b4b; }
            .pp-chart-unknown { background: #77818a; }
            #pp-outcome-legend { color: var(--pp-color-text-muted); font-size: 10px; }
            .pp-recommendation { display: grid; gap: 4px; padding: 10px; border-left: 3px solid #77818a; background: #20252a; }
            .pp-recommendation-ready { border-left-color: var(--pp-helper-best); }
            .pp-recommendation strong { color: #f5f7f8; font-size: 12px; }
            .pp-recommendation span { color: var(--pp-color-text-muted); font-size: 10px; line-height: 1.4; }
            #pp-target-scorecards { display: grid; gap: 7px; }
            .pp-target-scorecard { display: grid; gap: 5px; padding: 8px; border: 1px solid #343a40; border-radius: var(--pp-radius-sm); background: #20252a; }
            .pp-scorecard-head, .pp-scorecard-detail { display: flex; justify-content: space-between; gap: var(--pp-space-2); }
            .pp-scorecard-head strong { color: #f5f7f8; font-size: 12px; }
            .pp-scorecard-head span, .pp-scorecard-detail { color: var(--pp-color-text-muted); font-size: 10px; }
            .pp-scorecard-bar { display: flex; height: 6px; overflow: hidden; border-radius: 999px; background: #30353a; }
            .pp-score-success { background: #36c76c; }
            .pp-score-critical { margin-left: auto; background: #e04b4b; }
            .pp-dashboard-empty { margin: 0; padding: 12px; color: var(--pp-color-text-muted); text-align: center; }
            @media (max-width: 900px), (pointer: coarse) {
                #pp-helper { font-size: 16px; }
                #pp-helper-toggle { min-height: 44px; }
                #pp-helper-summary { flex-basis: 100%; font-size: 12px; }
                #pp-helper-controls { grid-template-columns: 1fr; }
                #pp-helper button:not(#pp-helper-toggle), #pp-ready-only { min-height: 44px; }
                .pp-tier-options { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); }
                .pp-tier-options button { min-width: 0 !important; padding-inline: var(--pp-space-1) !important; }
                #pp-reset { width: 100%; }
                .pp-helper-insights { grid-template-columns: 1fr 1fr; }
                #pp-insights-summary { grid-column: 1 / -1; font-size: 12px; }
                #pp-open-insights { grid-column: 1 / -1; }
                .pp-dashboard-toolbar { align-items: stretch; flex-direction: column; }
                .pp-period-tabs { display: grid; grid-template-columns: repeat(3, 1fr); }
                .pp-period-tabs button { min-height: 44px !important; }
                .pp-dashboard-metrics { grid-template-columns: 1fr 1fr; }
                .pp-dashboard-grid { grid-template-columns: 1fr; }
                .pp-scorecard-detail { display: block; line-height: 1.4; }
            }
            @media (prefers-reduced-motion: reduce) { .pp-helper-chevron { transition: none; } }
            /* 2.0: inline navigation and a readable, contained ledger. */
            #pp-helper { max-width: 100%; min-width: 0; overflow-wrap: anywhere; }
            #pp-helper [hidden] { display: none !important; }
            #pp-helper .pp-main-nav { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 6px; padding: 8px 12px; border-top: 1px solid #34383e; }
            #pp-helper .pp-main-nav button { background: transparent; border-color: transparent; border-radius: 0; }
            #pp-helper .pp-main-nav button[aria-pressed="true"] { border-color: #52cb82 !important; box-shadow: inset 0 -2px #52cb82 !important; background: #263d33 !important; }
            #pp-helper .pp-main-nav #pp-open-insights { grid-column: auto; }
            #pp-helper .pp-helper-title small { color: #aeb8bf; font-size: 11px; font-weight: normal; }
            #pp-helper input, #pp-helper select, #pp-helper textarea { min-width: 0; max-width: 100%; width: 100%; border: 1px solid #505960; border-radius: 4px; background: #24292e; color: #f1f3f5; padding: 9px; font: 16px/1.3 Arial,sans-serif; }
            #pp-helper input:focus-visible, #pp-helper select:focus-visible, #pp-helper textarea:focus-visible, #pp-helper summary:focus-visible { outline: 2px solid #ffd43b; outline-offset: 2px; }
            #pp-target-tools { padding: 8px 12px 12px; display: grid; grid-template-columns: auto minmax(0,1fr); align-items: center; gap: 8px; }
            #pp-target-tools label { font-size: 12px; color: #c5cbd1; }
            .pp-target-summary { grid-column: 1/-1; display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px; }
            #pp-helper .pp-help-note { grid-column: 1/-1; margin: 0; color: #b9c3cb; font-size: 12px; line-height: 1.5; }
            #pp-helper .pp-helper-insights { margin: 0; padding: 12px; grid-template-columns: repeat(3,minmax(0,1fr)); }
            #pp-insights-summary { grid-column: 1/-1; }
            #pp-helper #pp-helper-controls { grid-template-columns: repeat(2,minmax(0,1fr)); align-items: end; }
            #pp-helper button:disabled { opacity: .5; cursor: not-allowed; }
            #pp-helper #pp-insights-dashboard { padding: 12px; background: #171c20; }
            #pp-helper .pp-dashboard-metric span, #pp-helper .pp-dashboard-metric small, #pp-helper #pp-outcome-legend,
            #pp-helper .pp-recommendation span, #pp-helper .pp-scorecard-head span, #pp-helper .pp-scorecard-detail { font-size: 12px; }
            #pp-helper .pp-dashboard-metric strong { font-size: 22px; }
            #pp-helper .pp-scorecard-head { flex-wrap: wrap; }
            #pp-helper .pp-scorecard-detail { display: block; line-height: 1.6; }
            #pp-helper .pp-period-tabs { flex-wrap: wrap; }
            #pp-helper .pp-period-tabs button { min-height: 36px !important; font-size: 12px; }
            #pp-target-scorecards { max-height: 540px; overflow-y: auto; overscroll-behavior: contain; }
            #pp-daily-chart { display: grid; grid-template-columns: repeat(14,minmax(0,1fr)); gap: 4px; padding-top: 8px; }
            .pp-daily-column { min-width: 0; text-align: center; color: #c5cbd1; }
            .pp-daily-bars { height: 84px; display: flex; align-items: end; gap: 2px; border-bottom: 1px solid #657079; background: #22282d; }
            .pp-daily-bars span { flex: 1; min-width: 0; }
            .pp-daily-gain { background: #52cb82; }
            .pp-daily-loss { background: #ef8585; }
            .pp-daily-column small { font-size: 11px; }
            #pp-helper .pp-daily-details summary { cursor: pointer; min-height: 44px; padding-block: 12px; font-size: 12px; }
            #pp-daily-figures { max-height: 240px; overflow-y: auto; font-size: 12px; } #pp-daily-figures p { margin: 0 0 8px; }
            #pp-recent-attempts { display: grid; gap: 8px; max-height: 420px; overflow-y: auto; overscroll-behavior: contain; }
            .pp-history-row { display: grid; gap: 4px; padding: 10px; background: #24292e; border-left: 3px solid #77818a; font-size: 12px; }
            .pp-history-success { border-color: #52cb82; } .pp-history-fail { border-color: #e0a526; } .pp-history-critical { border-color: #ef8585; }
            .pp-history-row time { color: #b9c3cb; font-size: 11px; }
            .pp-history-row summary { min-height: 44px; padding-block: 12px; cursor: pointer; }
            .pp-history-row details p { margin: 0; max-height: 180px; overflow-y: auto; line-height: 1.5; }
            .pp-card-feedback { display: block; clear: both; padding: 8px 10px; color: #f1f3f5; background: #222b2c; border-top: 1px solid #576569; font: 12px/1.5 Arial,sans-serif; white-space: normal; overflow-wrap: anywhere; }
            #pp-export-fallback { grid-column: 1/-1; } #pp-export-fallback summary { min-height: 44px; cursor: pointer; padding: 12px 0; }
            #pp-export-text { height: 140px; }
            .pp-helper-target [class*="titleAndProps___"] { min-width: 0; overflow-wrap: anywhere; }
            .pp-helper-target .pp-helper-meta { flex-wrap: wrap !important; white-space: normal !important; max-width: 100%; }
            @media (max-width: 900px), (pointer: coarse) {
                #pp-helper button:not(#pp-helper-toggle), #pp-helper .pp-period-tabs button { min-height: 44px !important; }
                #pp-helper #pp-helper-controls { grid-template-columns: 1fr; }
                #pp-helper .pp-helper-insights { grid-template-columns: repeat(2,minmax(0,1fr)); padding: 8px; }
                #pp-helper .pp-period-tabs { grid-template-columns: repeat(4,minmax(0,1fr)); }
                #pp-helper .pp-dashboard-grid { grid-template-columns: 1fr; }
                #pp-helper .pp-dashboard-metrics { grid-template-columns: repeat(2,minmax(0,1fr)); }
                #pp-helper #pp-insights-dashboard { padding: 8px; }
                #pp-target-tools { grid-template-columns: minmax(0,1fr); }
                #pp-helper .pp-dashboard-toolbar { flex-direction: column; align-items: stretch; }
            }
            .pp-helper-filtered, .pp-helper-filtered-wrapper { display: none !important; }
            .pp-helper-compacted {
                display: block !important;
                height: auto !important;
                min-height: 0 !important;
            }
            .pp-helper-compacted-owner {
                height: auto !important;
                min-height: 0 !important;
            }
            .pp-helper-compacted-slider {
                padding-bottom: 0 !important;
                overflow: hidden !important;
            }
            .pp-helper-compacted > .pp-helper-compact-row {
                position: relative !important;
                inset: auto !important;
                height: auto !important;
                min-height: 0 !important;
                transform: none !important;
                transition: none !important;
            }
            .pp-helper-compacted > .pp-helper-filtered { display: none !important; }
            .pp-helper-target {
                --pp-target-accent: var(--pp-helper-wait);
                border-left: 4px solid var(--pp-target-accent) !important;
            }
            .pp-helper-verdict-go { --pp-target-accent: var(--pp-helper-go); }
            .pp-helper-verdict-wait { --pp-target-accent: var(--pp-helper-wait); }
            .pp-helper-verdict-avoid { --pp-target-accent: var(--pp-helper-avoid); }
            .pp-helper-verdict-caution { --pp-target-accent: var(--pp-helper-caution); }
            .pp-helper-target.pp-helper-best {
                border-left-color: var(--pp-helper-best) !important;
                box-shadow: inset 0 0 0 1px var(--pp-helper-best) !important;
            }
            .pp-attempt-result {
                display: flex;
                align-items: center;
                gap: 8px;
                min-height: 38px;
                padding: 7px 12px;
                background: #20252a;
                color: #f4f7f8;
                border-top: 1px solid var(--pp-helper-border);
                border-left: 4px solid var(--pp-helper-wait);
                font: 700 13px/1.25 Arial, sans-serif;
            }
            .pp-attempt-result[hidden] { display: none; }
            .pp-attempt-result strong { font-size: 16px; letter-spacing: .04em; }
            .pp-attempt-result span { color: #d2d9de; font-weight: 600; }
            .pp-attempt-success { border-left-color: var(--pp-helper-go); }
            .pp-attempt-fail { border-left-color: var(--pp-helper-wait); }
            .pp-attempt-critical { border-left-color: var(--pp-helper-avoid); }
            @media (max-width: 900px), (pointer: coarse) {
                .pp-attempt-result { flex-wrap: wrap; padding: 8px 10px; font-size: 12px; }
                .pp-attempt-result strong { font-size: 15px; }
            }
            .pp-helper-meta {
                display: inline-flex;
                align-items: baseline;
                flex-wrap: nowrap;
                gap: 3px;
                margin-left: 6px;
                vertical-align: baseline;
                white-space: nowrap;
                color: var(--pp-target-accent);
                font: 700 11px/1.35 Arial, sans-serif;
            }
            .pp-helper-badge {
                padding: 1px 5px;
                border: 1px solid currentColor;
                border-radius: 3px;
            }
            .pp-helper-best-badge { color: var(--pp-helper-best); }
            @media (max-width: 900px), (pointer: coarse) {
                .pp-helper-meta { gap: 2px; margin-left: 4px; font-size: 10px; }
                .pp-helper-badge { padding-inline: 3px; }
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function renderHelperState(helper) {
        if (!helper) return;
        helper.dataset.uiMode = settings.useHelperUi ? "helper" : "torn";
        helper.querySelector("#pp-helper-summary").textContent = summaryText(settings);
        helper.querySelectorAll("button[data-ui-mode]").forEach(button => {
            button.setAttribute("aria-pressed", String((button.dataset.uiMode === "helper") === settings.useHelperUi));
        });
        if (!settings.useHelperUi) helper.querySelector("#pp-attempt-feedback").hidden = true;
        const ready = helper.querySelector("#pp-ready-only");
        ready.setAttribute("aria-checked", String(settings.readyOnly));
        ready.querySelector("span").textContent = settings.readyOnly ? "Ready targets only" : "Show every status";
        helper.querySelectorAll("[data-tier]").forEach(button => {
            button.setAttribute("aria-pressed", String(Number(button.dataset.tier) === settings.minTier));
        });
        helper.querySelector("#pp-best-count").textContent = String(settings.bestCount);
        helper.querySelector("#pp-count-dec").disabled = settings.bestCount === 0;
        helper.querySelector("#pp-count-inc").disabled = settings.bestCount === 10;
        helper.querySelector("#pp-target-search").value = settings.search;
        helper.querySelector("#pp-advice-goal").value = settings.adviceGoal;
        selectHelperView(helperView, helper);
        renderInsights(helper);
    }

    function selectHelperView(view, helper = document.getElementById("pp-helper")) {
        if (!helper) return;
        helperView = view;
        helper.querySelector("#pp-helper-controls").hidden = view !== "settings";
        helper.querySelector("#pp-target-tools").hidden = view !== "targets";
        helper.querySelector(".pp-helper-insights").hidden = view !== "insights";
        helper.querySelector("#pp-insights-dashboard").hidden = view !== "insights";
        helper.querySelector("#pp-helper-toggle").setAttribute("aria-expanded", String(view !== "collapsed"));
        helper.querySelectorAll("[data-helper-view]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.helperView === view)));
        helper.querySelector("#pp-open-insights").setAttribute("aria-expanded", String(view === "insights"));
        if (view === "insights") renderInsightsDashboard(helper);
    }

    function updateSettings(next) {
        settings = normalizeSettings({ ...settings, ...next });
        saveSettings(settings);
        renderHelperState(document.getElementById("pp-helper"));
        scheduleRepaint();
    }

    function buildHelper() {
        const existing = document.getElementById("pp-helper");
        if (existing) return existing;
        const firstTitle = document.querySelector('[class*="titleAndProps___"]');
        if (!firstTitle) return null;
        ensureStyles();

        const helper = document.createElement("section");
        helper.id = "pp-helper";
        helper.setAttribute("aria-label", "Pickpocket helper");
        helper.innerHTML = `
            <button id="pp-helper-toggle" type="button" aria-expanded="false" aria-controls="pp-helper-controls">
                <span class="pp-helper-heading">
                    <span class="pp-helper-title">Pickpocket Helper <small>2.1</small></span>
                    <span id="pp-helper-summary"></span>
                </span>
                <span class="pp-helper-chevron" aria-hidden="true">⌄</span>
            </button>
            <output id="pp-attempt-feedback" class="pp-attempt-result" role="status" aria-live="assertive" hidden></output>
            <nav class="pp-main-nav" aria-label="Helper sections">
                <button type="button" data-helper-view="targets" aria-pressed="true">Targets</button>
                <button id="pp-open-insights" type="button" data-helper-view="insights" aria-expanded="false" aria-controls="pp-insights-dashboard">Insights</button>
                <button type="button" data-helper-view="settings" aria-pressed="false">Settings</button>
            </nav>
            <section id="pp-target-tools">
                <label for="pp-target-search">Find a target</label>
                <input id="pp-target-search" type="search" maxlength="80" placeholder="Name or status…" autocomplete="off">
                <div class="pp-target-summary"><span id="pp-target-count" role="status">Reading targets…</span><button id="pp-reset-filters" type="button">Clear filters</button></div>
                <p class="pp-help-note">T1–T6 are advisory difficulty tiers, not XP. GO means the status fits your guide; it does not guarantee success. Starred picks follow your selected advice goal.</p>
            </section>
            <div id="pp-helper-controls" hidden>
                <div class="pp-helper-control pp-ui-mode-control">
                    <span class="pp-helper-label">Display mode</span>
                    <div class="pp-ui-mode-options">
                        <button type="button" data-ui-mode="helper" aria-pressed="true">Helper UI</button>
                        <button type="button" data-ui-mode="torn" aria-pressed="false">Torn UI</button>
                    </div>
                </div>
                <div class="pp-helper-control">
                    <span class="pp-helper-label">Status filter</span>
                    <button id="pp-ready-only" type="button" role="switch" aria-checked="false"><span>Show every status</span></button>
                </div>
                <fieldset class="pp-helper-control">
                    <legend>Minimum tier</legend>
                    <div class="pp-tier-options">
                        <button type="button" data-tier="1" aria-label="Minimum tier 1">1</button>
                        <button type="button" data-tier="2" aria-label="Minimum tier 2">2</button>
                        <button type="button" data-tier="3" aria-label="Minimum tier 3">3</button>
                        <button type="button" data-tier="4" aria-label="Minimum tier 4">4</button>
                        <button type="button" data-tier="5" aria-label="Minimum tier 5">5</button>
                        <button type="button" data-tier="6" aria-label="Minimum tier 6">6</button>
                    </div>
                </fieldset>
                <div class="pp-helper-control">
                    <span class="pp-helper-label">Highlighted picks (0 = off)</span>
                    <div class="pp-stepper">
                        <button id="pp-count-dec" type="button" aria-label="Highlight fewer targets">−</button>
                        <output id="pp-best-count" aria-live="polite">1</output>
                        <button id="pp-count-inc" type="button" aria-label="Highlight more targets">+</button>
                    </div>
                </div>
                <label class="pp-helper-control">Advice goal
                    <select id="pp-advice-goal"><option value="safety">Safer outcomes</option><option value="skill">Observed CS / attempt</option><option value="value">Observed loot value</option></select>
                </label>
                <button id="pp-reset" type="button">Reset</button>
                <section class="pp-helper-insights" aria-label="Target Insights">
                    <span id="pp-insights-summary" aria-live="polite"></span>
                    <button id="pp-insights-toggle" type="button" role="switch" aria-checked="false"><span>Logging off</span></button>
                    <button id="pp-export-log" type="button">Export CSV</button>
                    <button id="pp-backup-log" type="button">JSON backup</button>
                    <button id="pp-import-log" type="button">Restore backup</button>
                    <input id="pp-import-file" type="file" accept=".json,application/json" hidden>
                    <details id="pp-export-fallback" hidden><summary>Copyable export</summary><textarea id="pp-export-text" readonly aria-label="Export contents; select all to copy"></textarea></details>
                    <button id="pp-clear-log" type="button">Clear log</button>
                    <section id="pp-insights-dashboard" aria-label="Pickpocket history dashboard" hidden>
                        <div class="pp-dashboard-toolbar">
                            <h3>Pickpocket ledger</h3>
                            <div class="pp-period-tabs" role="group" aria-label="Insights period">
                                <button type="button" data-insight-period="today" aria-pressed="false">Today</button>
                                <button type="button" data-insight-period="week" aria-pressed="true">7 days</button>
                                <button type="button" data-insight-period="month" aria-pressed="false">30 days</button>
                                <button type="button" data-insight-period="all" aria-pressed="false">Retained</button>
                            </div>
                        </div>
                        <p id="pp-skill-coverage" class="pp-help-note"></p>
                        <section class="pp-dashboard-panel"><h4>Daily CS gained / lost · last 14 UTC days</h4><p class="pp-help-note">Green: gained · Red: lost. Blank bars can also mean no CS reading.</p><div id="pp-daily-chart" aria-label="Daily skill gains and losses"></div><details class="pp-daily-details"><summary>Daily figures and reading coverage</summary><div id="pp-daily-figures"></div></details></section>
                        <div class="pp-dashboard-metrics">
                            <div class="pp-dashboard-metric"><span>Attempts</span><strong id="pp-metric-attempts">0</strong></div>
                            <div class="pp-dashboard-metric"><span>Success rate</span><strong id="pp-metric-success">—</strong></div>
                            <div class="pp-dashboard-metric"><span>CS net</span><strong id="pp-metric-cs">+0.00</strong></div>
                            <div class="pp-dashboard-metric"><span>Visible value</span><strong id="pp-metric-value">$0</strong><small id="pp-value-note">no visible values yet</small></div>
                        </div>
                        <div class="pp-dashboard-grid">
                            <div class="pp-dashboard-panel">
                                <h4>Outcomes</h4>
                                <div id="pp-outcome-chart" class="pp-outcome-chart" role="img" aria-label="No outcomes"></div>
                                <span id="pp-outcome-legend"></span>
                                <div id="pp-recommendation" class="pp-recommendation">
                                    <strong>More history needed</strong>
                                    <span>Record readable attempts to compare targets.</span>
                                </div>
                            </div>
                            <div class="pp-dashboard-panel">
                                <h4>Target + status comparisons</h4>
                                <div id="pp-target-scorecards"></div>
                            </div>
                        </div>
                        <section class="pp-dashboard-panel"><h4>Recent attempts · selected period</h4><div id="pp-recent-attempts"></div><button id="pp-more-history" type="button">Show 20 more</button></section>
                        <p class="pp-help-note">UTC day boundaries. History stays on this device; the newest 750 attempts are retained. CS is the visible skill reading, not hidden crime XP. Loot value is not cash profit. Comparisons do not control for body type or changing skill. Old imported records may contain errors from earlier versions.</p>
                    </section>
                </section>
            </div>
        `;
        helper.append(helper.querySelector(".pp-helper-insights"));
        helper.querySelector(".pp-dashboard-toolbar").after(helper.querySelector(".pp-dashboard-metrics"));

        const firstCard = findTargetCard(firstTitle);
        const listAnchor = firstCard && firstCard.parentElement ? firstCard.parentElement : firstTitle.parentElement;
        if (!listAnchor || !listAnchor.parentElement) return null;
        listAnchor.parentElement.insertBefore(helper, listAnchor);

        const toggle = helper.querySelector("#pp-helper-toggle");
        const controls = helper.querySelector("#pp-helper-controls");
        toggle.addEventListener("click", () => {
            selectHelperView(helperView === "collapsed" ? "targets" : "collapsed", helper);
        });
        helper.querySelectorAll("[data-helper-view]").forEach(button => button.addEventListener("click", () => selectHelperView(button.dataset.helperView, helper)));
        helper.querySelector("#pp-target-search").addEventListener("input", event => updateSettings({ search: event.target.value }));
        helper.querySelector("#pp-reset-filters").addEventListener("click", () => updateSettings({ search: "", minTier: 1, readyOnly: false }));
        helper.querySelector("#pp-advice-goal").addEventListener("change", event => updateSettings({ adviceGoal: event.target.value }));
        helper.querySelector("#pp-ready-only").addEventListener("click", () => updateSettings({ readyOnly: !settings.readyOnly }));
        helper.querySelectorAll("button[data-ui-mode]").forEach(button => {
            button.addEventListener("click", () => updateSettings({ useHelperUi: button.dataset.uiMode === "helper" }));
        });
        helper.querySelectorAll("[data-tier]").forEach(button => {
            button.addEventListener("click", () => updateSettings({ minTier: Number(button.dataset.tier) }));
        });
        helper.querySelector("#pp-count-dec").addEventListener("click", () => updateSettings({ bestCount: settings.bestCount - 1 }));
        helper.querySelector("#pp-count-inc").addEventListener("click", () => updateSettings({ bestCount: settings.bestCount + 1 }));
        helper.querySelector("#pp-insights-toggle").addEventListener("click", () => {
            updateSettings({ insightsEnabled: !settings.insightsEnabled });
            attemptLog.enabled = settings.insightsEnabled;
            queueAttemptLogSave();
            renderInsights(helper);
        });
        helper.querySelectorAll("[data-insight-period]").forEach(button => {
            button.addEventListener("click", () => {
                insightPeriod = button.dataset.insightPeriod;
                historyPageSize = 20;
                renderInsightsDashboard(helper);
            });
        });
        helper.querySelector("#pp-export-log").addEventListener("click", () => { exportAttemptLog(); });
        helper.querySelector("#pp-backup-log").addEventListener("click", () => { exportAttemptLog("json"); });
        helper.querySelector("#pp-import-log").addEventListener("click", () => helper.querySelector("#pp-import-file").click());
        helper.querySelector("#pp-import-file").addEventListener("change", importAttemptLog);
        helper.querySelector("#pp-more-history").addEventListener("click", () => { historyPageSize += 20; renderInsightsDashboard(helper); });
        helper.querySelector("#pp-clear-log").addEventListener("click", () => {
            if (!globalThis.confirm("Clear all locally stored Pickpocketing Insights attempts?")) return;
            attemptLog.events = [];
            attemptLog.clearedAt = Date.now();
            lastAttemptResult = null;
            attemptLogMessage = "Log cleared";
            queueAttemptLogSave();
            renderInsights(helper);
        });
        helper.querySelector("#pp-reset").addEventListener("click", () => {
            settings = normalizeSettings(DEFAULT_SETTINGS);
            saveSettings(settings);
            attemptLog.enabled = settings.insightsEnabled;
            queueAttemptLogSave();
            renderHelperState(helper);
            scheduleRepaint();
        });
        renderHelperState(helper);
        return helper;
    }

    // ---- Painting ----
    function getSkill() {
        const el = document.querySelector('button[aria-label^="Skill:"]');
        if (el) {
            const m = el.getAttribute('aria-label').match(/Skill:\s*([\d.]+)/);
            if (m) return parseFloat(m[1]);
        }
        return null;
    }

    function faceIconFromRow(row) {
        const img = row.querySelector('img[src*="/crimes/faces/"]');
        if (!img) return null;
        const m = img.src.match(/faces\/(\d+)\.webp/);
        return m ? m[1] : null;
    }

    const VERDICT_CLASSES = [
        "pp-helper-verdict-go",
        "pp-helper-verdict-wait",
        "pp-helper-verdict-avoid",
        "pp-helper-verdict-caution",
    ];

    function clearCardDecoration(card, includeFilter = false) {
        if (!card || !card.classList) return;
        card.classList.remove("pp-helper-target", "pp-helper-best", ...VERDICT_CLASSES);
        if (includeFilter) card.classList.remove("pp-helper-filtered");
        card.querySelectorAll?.(".pp-helper-meta").forEach(meta => meta.remove());
        card.querySelectorAll?.(".pp-card-feedback").forEach(output => output.remove());
    }

    function renderTargetMeta(nameElement, row, isBest) {
        let meta = nameElement.querySelector(".pp-helper-meta");
        if (!meta) {
            meta = document.createElement("span");
            meta.className = "pp-helper-meta";
            meta.dataset.ppHelperOwned = "true";
            nameElement.appendChild(meta);
        }
        const label = `Tier ${row.tier}; ${row.statusTxt || "Status unavailable"}; ${row.v}${isBest ? "; best target" : ""}`;
        if (meta.getAttribute("aria-label") === label) return;
        meta.replaceChildren();
        meta.setAttribute("aria-label", label);
        meta.title = `${label}. Advisory difficulty, not XP or guaranteed odds. ${isBest ? row.adviceReason || "Guide-based pick; more history needed." : "GO = guide-ready; WAIT = unsuitable or unobserved status; CAUTION/AVOID = elevated risk."}`;
        const labels = [
            { text: `T${row.tier}`, className: " pp-helper-tier-badge" },
            { text: row.statusIcon ? row.statusIcon.charAt(0).toUpperCase() + row.statusIcon.slice(1) : "Unknown", className: " pp-helper-status-badge" },
            { text: row.v, className: " pp-helper-verdict-badge" },
        ];
        if (isBest) labels.push({ text: "★ BEST", className: " pp-helper-best-badge" });
        labels.forEach(label => {
            const badge = document.createElement("span");
            badge.className = `pp-helper-badge${label.className}`;
            badge.textContent = label.text;
            meta.appendChild(badge);
        });
    }

    function updateColors() {
        if (!location.href.includes("#/pickpocketing")) return;

        buildHelper();
        const skill = getSkill();

        const pool = {};
        for (const k in statusByIcon) pool[k] = statusByIcon[k].slice();

        const titleEls = document.querySelectorAll('[class*="titleAndProps___"]');

        const rows = [];
        titleEls.forEach(divElement => {
            const nameDiv = divElement.querySelector('div');
            if (!nameDiv) return;
            const resolved = resolveMark(nameDiv.textContent);
            if (!resolved) return;
            const baseName = resolved.name;

            const card = findTargetCard(divElement);
            if (!card) return;
            const icon = faceIconFromRow(card);

            const status = icon ? consumeStatus(pool, icon) : null;
            if (status) statusByCard.set(card, status);
            else statusByCard.delete(card);

            const v = verdict(baseName, status ? status.statusIcon : null, skill, status ? status.build : null);

            const tier = resolved.tier;

            rows.push({
                nameDiv, titleContainer: divElement, card, baseName, v, tier,
                statusIcon: status ? status.statusIcon : null,
                statusTxt: status ? status.statusTitle : null,
            });
        });

        if (!settings.useHelperUi) {
            document.querySelectorAll(".pp-helper-target, .pp-helper-filtered").forEach(card => clearCardDecoration(card, true));
            syncListCompaction([], false);
            const count = document.querySelector("#pp-target-count");
            if (count) count.textContent = `${rows.length} shown · Torn presentation; filters and highlights paused. Logging still follows your setting.`;
            return;
        }

        const matchesFilters = row => row.tier >= settings.minTier && (!settings.readyOnly || row.v === "GO")
            && `${row.baseName} ${row.statusTxt || ""} ${row.statusIcon || ""}`.toLowerCase().includes(settings.search.toLowerCase().trim());
        const history = rankHistory(summarizeDashboardTargets(attemptLog.events.filter(event => event.at >= Date.now() - 30 * 86400000 && event.at <= Date.now()))).filter(historyEligible);
        for (const row of rows) {
            row.historyRank = history.findIndex(item => item.mark === row.baseName && item.status === String(row.statusTxt || row.statusIcon || "unknown").toLowerCase());
            row.adviceReason = row.historyRank >= 0 ? `Based on your last 30 days of ${settings.adviceGoal} observations for this target and status.` : "Guide-based pick; no qualifying target/status history. Lower tiers favored for safety; higher tiers for other goals are not verified XP rankings.";
        }
        const bestIds = new Set();
        rows
            .filter(r => r.v === "GO" && matchesFilters(r))
            .sort((a, b) => (a.historyRank < 0 ? 999 : a.historyRank) - (b.historyRank < 0 ? 999 : b.historyRank) || (settings.adviceGoal === "safety" ? a.tier - b.tier : b.tier - a.tier))
            .slice(0, settings.bestCount)
            .forEach(r => bestIds.add(r));

        const seenCards = new Set(rows.map(row => row.card));
        document.querySelectorAll(".pp-helper-target, .pp-helper-filtered").forEach(card => {
            if (!seenCards.has(card)) clearCardDecoration(card, true);
        });

        rows.forEach(r => {
            const { card, v, tier } = r;

            const hidden = !matchesFilters(r);
            setCardFiltered(card, hidden);

            const isBest = bestIds.has(r);
            card.classList.remove(...VERDICT_CLASSES);
            card.classList.add("pp-helper-target", `pp-helper-verdict-${v.toLowerCase()}`);
            card.classList.toggle("pp-helper-best", isBest);
            renderTargetMeta(r.nameDiv, r, isBest);
        });
        const shown = rows.filter(matchesFilters).length;
        const count = document.querySelector("#pp-target-count");
        if (count) {
            const text = `${shown} shown · ${rows.length - shown} hidden · ${rows.filter(row => row.v === "GO").length} guide-ready${shown ? "" : " — clear filters to show targets"}`;
            if (count.textContent !== text) count.textContent = text;
        }
        // Torn briefly replaces the virtual rows after an attempt. Leaving the
        // previous compacted container in place during that empty frame avoids
        // the old 500px grid flashing back before fresh marks arrive.
        if (shouldSyncListCompaction(rows.length)) {
            syncListCompaction(rows.map(row => row.card), true);
        }
    }

    // Debounced repaint so rapid DOM mutations don't cause a repaint storm.
    let repaintScheduled = false;
    let repaintFrame = null;
    let marksObserver = null;
    let observedAnchor = null;
    let startupTimer = null;
    let startupAttempts = 0;
    let pdaTabActive = null;
    const activityState = { active: null, repaintQueued: false };
    const MAX_STARTUP_ATTEMPTS = 40;
    const STARTUP_RETRY_MS = 250;

    function isPickpocketRoute() {
        return location.href.includes("#/pickpocketing");
    }

    function workIsActive() {
        return isPickpocketRoute() && activityState.active === true;
    }

    // Runs updateColors() with the mutation observer detached, so our own
    // DOM writes (textContent, style) can never re-trigger it and cause a
    // feedback loop. This was an actual bug in 1.4/1.5 pre-fix — the
    // observer was watching document.body's subtree for childList changes,
    // and reassigning nameDiv.textContent counts as one, so every repaint
    // scheduled another repaint forever at ~60fps even when nothing on the
    // page had actually changed.
    function paint() {
        if (!workIsActive()) return;
        marksObserver?.disconnect();
        try {
            updateColors();
        } catch (e) {
            // Torn's live DOM is external input; keep lifecycle recovery alive.
        } finally {
            if (workIsActive()) watchMarksList();
        }
    }

    function scheduleRepaint() {
        if (repaintScheduled || !workIsActive()) return;
        repaintScheduled = true;
        repaintFrame = requestAnimationFrame(() => {
            repaintScheduled = false;
            repaintFrame = null;
            activityState.repaintQueued = false;
            paint();
        });
    }

    function findMarksObserverAnchor() {
        const currentCrime = document.querySelector?.('[class*="currentCrime___"]');
        // Watch Torn's stable container so replacing the entire crime panel is
        // observable without widening steady-state monitoring to document.body.
        if (currentCrime) return currentCrime.parentElement || currentCrime;
        const firstTitle = document.querySelector?.('[class*="titleAndProps___"]');
        const firstCard = firstTitle ? findTargetCard(firstTitle) : null;
        return (firstCard && firstCard.parentElement) || document.body || null;
    }

    function cancelStartupRetry(resetAttempts = true) {
        if (startupTimer !== null) clearTimeout(startupTimer);
        startupTimer = null;
        if (resetAttempts) startupAttempts = 0;
    }

    function scheduleStartupRetry() {
        if (startupTimer !== null || !workIsActive() || startupAttempts >= MAX_STARTUP_ATTEMPTS) return;
        startupTimer = setTimeout(() => {
            startupTimer = null;
            startupAttempts += 1;
            if (!workIsActive()) return;
            watchMarksList();
            scheduleRepaint();
        }, STARTUP_RETRY_MS);
    }

    // Scope steady-state observation to Torn's current crime panel. Body-wide
    // observation is only a short startup bridge until that panel appears.
    function watchMarksList() {
        if (!workIsActive()) return;
        const anchor = findMarksObserverAnchor();
        if (!anchor) {
            scheduleStartupRetry();
            return;
        }
        cancelStartupRetry();
        if (!marksObserver) {
            marksObserver = new MutationObserver(() => {
                const nextAnchor = findMarksObserverAnchor();
                if (nextAnchor && nextAnchor !== observedAnchor) {
                    observedAnchor = nextAnchor;
                    marksObserver.disconnect();
                    marksObserver.observe(observedAnchor, { childList: true, subtree: true });
                }
                scheduleRepaint();
            });
        }
        observedAnchor = anchor;
        marksObserver.disconnect();
        marksObserver.observe(observedAnchor, { childList: true, subtree: true });
    }

    function pauseWork() {
        marksObserver?.disconnect();
        observedAnchor = null;
        cancelStartupRetry();
        if (repaintFrame !== null) cancelAnimationFrame(repaintFrame);
        repaintFrame = null;
        repaintScheduled = false;
        activityState.repaintQueued = false;
    }

    function resumeWork() {
        if (!workIsActive()) return;
        watchMarksList();
        scheduleRepaint();
        renderInsights();
    }

    function cleanupRoute() {
        pauseWork();
        if (pendingAttempt) commitPendingAttempt(false);
        clearAttemptWatch();
        if (attemptResultTimer) globalThis.clearTimeout(attemptResultTimer);
        attemptResultTimer = null;
        const feedback = document.getElementById("pp-attempt-feedback");
        if (feedback) feedback.hidden = true;
        document.querySelectorAll(".pp-helper-target, .pp-helper-filtered").forEach(card => clearCardDecoration(card, true));
        syncListCompaction([], false);
        document.getElementById("pp-helper")?.remove();
        document.getElementById("pp-helper-styles")?.remove();
    }

    function computeActivity() {
        const visible = document.visibilityState !== "hidden";
        return visible && (pdaTabActive === null || pdaTabActive);
    }

    function applyActivity() {
        onActivityChange(activityState, computeActivity(), action => {
            if (action === "pause") pauseWork();
            if (action === "resume-and-repaint") resumeWork();
        });
    }

    function syncRoute() {
        if (!isPickpocketRoute()) {
            cleanupRoute();
            return;
        }
        if (activityState.active) resumeWork();
    }

    window.addEventListener("hashchange", syncRoute);
    document.addEventListener("visibilitychange", applyActivity);
    window.addEventListener("pagehide", () => { if (pendingAttempt) commitPendingAttempt(false); if (hasNativeAttemptStorage()) writeRecoverySnapshot(); saveAttemptLogNow(); });
    document.addEventListener("click", captureAttemptIntent, true);
    window.addEventListener("tornpda:tabState", event => {
        const detail = event && event.detail;
        pdaTabActive = Boolean(detail && detail.isActiveTab === true && detail.isWebViewVisible === true);
        applyActivity();
    });

    hydrateAttemptLog();
    if (typeof globalThis.PDA_getTabState === "function") {
        Promise.resolve().then(() => globalThis.PDA_getTabState()).then(detail => {
            pdaTabActive = detail?.isActiveTab === true && detail?.isWebViewVisible === true;
            applyActivity();
        }).catch(() => {});
    }
    applyActivity();
    syncRoute();
})();
