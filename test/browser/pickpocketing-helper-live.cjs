const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer-core");
const { getVisibleWindowState, assertVisibleWindowUnchanged } = require("./browser-session.cjs");
const { requireTornSession } = require("./session-guard.cjs");

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT_PATH = path.join(ROOT, "Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js");
const SHOT_DIR = path.join(__dirname, "shots");
const BROWSER_URL = process.env.PP_BROWSER_URL || "http://127.0.0.1:9222";
const ROUTE = "https://www.torn.com/page.php?sid=crimes#/pickpocketing";

const viewports = [
    { name: "desktop", width: 1920, height: 1080, mobile: false },
    { name: "pda-390x844", width: 390, height: 844, mobile: true },
    { name: "pda-430x932", width: 430, height: 932, mobile: true },
    { name: "pda-landscape-844x390", width: 844, height: 390, mobile: true },
];

async function layoutSnapshot(page) {
    return page.evaluate(() => {
        const helper = document.querySelector("#pp-helper");
        const firstCard = document.querySelector(".pp-helper-target");
        const helperRect = helper.getBoundingClientRect();
        const cardRect = firstCard.getBoundingClientRect();
        const skillButton = document.querySelector('button[aria-label^="Skill:"]');
        const cards = Array.from(document.querySelectorAll(".pp-helper-target"));
        const metadataViolations = [];
        const cueViolations = [];
        cards.forEach((card, index) => {
            const meta = card.querySelector(".pp-helper-meta");
            if (!meta || getComputedStyle(meta).display === "none") return;
            const metaRect = meta.getBoundingClientRect();
            const currentCardRect = card.getBoundingClientRect();
            const nextCardRect = cards[index + 1]?.getBoundingClientRect();
            const nativeTitleChildren = Array.from(meta.parentElement?.children || []).filter(child => child !== meta);
            const overlaps = rect => metaRect.left < rect.right && metaRect.right > rect.left
                && metaRect.top < rect.bottom && metaRect.bottom > rect.top;
            if (metaRect.bottom > currentCardRect.bottom + 1) metadataViolations.push("outside-card");
            if (nextCardRect && overlaps(nextCardRect)) metadataViolations.push("next-card");
            if (nativeTitleChildren.some(child => overlaps(child.getBoundingClientRect()))) metadataViolations.push("native-title");
            if (Array.from(card.querySelectorAll("button")).some(button => overlaps(button.getBoundingClientRect()))) {
                metadataViolations.push("native-control");
            }
            const contained = cue => {
                const rect = cue.getBoundingClientRect();
                return getComputedStyle(cue).display !== "none" && rect.width > 0 && rect.height > 0
                    && rect.left >= currentCardRect.left - 1 && rect.right <= currentCardRect.right + 1
                    && rect.top >= currentCardRect.top - 1 && rect.bottom <= currentCardRect.bottom + 1;
            };
            const statusCue = card.querySelector(".pp-helper-status-badge");
            if (!statusCue || !contained(statusCue)) cueViolations.push("status");
            if (card.classList.contains("pp-helper-best")) {
                const bestCue = card.querySelector(".pp-helper-best-badge");
                if (!bestCue || !contained(bestCue)) cueViolations.push("best");
            }
        });
        const verdicts = Array.from(document.querySelectorAll(".pp-helper-target")).reduce((counts, card) => {
            const name = Array.from(card.classList).find(value => value.startsWith("pp-helper-verdict-"));
            const verdict = name ? name.replace("pp-helper-verdict-", "") : "unknown";
            counts[verdict] = (counts[verdict] || 0) + 1;
            return counts;
        }, {});
        return {
            helperCount: document.querySelectorAll("#pp-helper").length,
            helperPosition: getComputedStyle(helper).position,
            decoratedCards: document.querySelectorAll(".pp-helper-target").length,
            badgeGroups: document.querySelectorAll(".pp-helper-meta").length,
            helperLeft: Math.round(helperRect.left),
            helperRight: Math.round(helperRect.right),
            helperScrollWidth: helper.scrollWidth,
            helperClientWidth: helper.clientWidth,
            helperBottom: Math.round(helperRect.bottom),
            firstCardTop: Math.round(cardRect.top),
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: innerWidth,
            spawningBadges: Array.from(document.querySelectorAll(".pp-helper-meta[aria-label]"))
                .filter(meta => meta.getAttribute("aria-label").includes("; Spawning;")).length,
            skillLabel: skillButton?.getAttribute("aria-label") || null,
            metadataViolations,
            cueViolations,
            verdicts,
        };
    });
}

async function filteredLayoutSnapshot(page) {
    return page.evaluate(() => {
        const compacted = Array.from(document.querySelectorAll(".pp-helper-compacted"));
        const blankGapViolations = [];
        compacted.forEach(parent => {
            const parentRect = parent.getBoundingClientRect();
            const visibleCards = Array.from(parent.children)
                .filter(card => card.classList.contains("pp-helper-target") && getComputedStyle(card).display !== "none")
                .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
            const visible = visibleCards.map(card => card.getBoundingClientRect());
            if (!visible.length) {
                if (parentRect.height > 1) blankGapViolations.push("empty-parent-height");
                return;
            }
            const parentStyle = getComputedStyle(parent);
            const paddingTop = parseFloat(parentStyle.paddingTop) || 0;
            const leadingGap = visible[0].top - parentRect.top - paddingTop;
            if (leadingGap > 2) blankGapViolations.push("leading-gap");
            for (let index = 1; index < visible.length; index += 1) {
                const gap = visible[index].top - visible[index - 1].bottom;
                if (gap > 2) blankGapViolations.push("between-card-gap");
            }
            const trailingGap = parentRect.bottom - visible[visible.length - 1].bottom;
            if (trailingGap > 2) blankGapViolations.push("trailing-gap");
        });
        const slider = document.querySelector(".pp-helper-compacted-slider");
        const sliderStyle = slider ? getComputedStyle(slider) : null;
        const firstVisible = Array.from(document.querySelectorAll(".pp-helper-target"))
            .find(card => getComputedStyle(card).display !== "none");
        const rowBoxDiagnostics = [];
        if (firstVisible) {
            for (let node = firstVisible; node && rowBoxDiagnostics.length < 5; node = node.parentElement) {
                const style = getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                rowBoxDiagnostics.push({
                    tag: node.tagName,
                    className: String(node.className || "").slice(0, 180),
                    height: Math.round(rect.height),
                    position: style.position,
                    display: style.display,
                    marginBottom: style.marginBottom,
                    paddingBottom: style.paddingBottom,
                    transform: style.transform,
                });
                if (node.classList.contains("pp-helper-compacted")) break;
            }
        }
        return {
            compactedParents: compacted.length,
            compactedOwners: document.querySelectorAll(".pp-helper-compacted-owner").length,
            compactedSliders: document.querySelectorAll(".pp-helper-compacted-slider").length,
            visibleCards: Array.from(document.querySelectorAll(".pp-helper-target"))
                .filter(card => getComputedStyle(card).display !== "none").length,
            filteredCards: document.querySelectorAll(".pp-helper-filtered").length,
            blankGapViolations,
            sliderPaddingBottom: sliderStyle ? parseFloat(sliderStyle.paddingBottom) || 0 : null,
            sliderOverflow: sliderStyle?.overflow || null,
            rowBoxDiagnostics,
        };
    });
}

(async () => {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const source = `${fs.readFileSync(SCRIPT_PATH, "utf8")}\n//# sourceURL=pp-helper-live.user.js`;
    const browser = await puppeteer.connect({ browserURL: BROWSER_URL, defaultViewport: null });
    const sourcePage = (await browser.pages()).find(page => page.url().includes("torn.com"));
    assert.ok(sourcePage, "The dedicated test browser has no Torn page open");
    await requireTornSession(sourcePage);
    const visibleBefore = await getVisibleWindowState(sourcePage);
    const reports = [];

    try {
        for (const viewport of viewports) {
            console.log(`[live] ${viewport.name}: opening signed-in Pickpocketing`);
            const page = await browser.newPage();
            // Torn chat can overlay the page. Dispatch only to owned controls so a
            // moving/covered coordinate can never click a native game action.
            const clickHelper = selector => page.$eval(selector, button => button.click());
            const scriptErrors = [];
            const statusCapture = {
                responses: 0,
                targetRecords: 0,
                statusRecords: 0,
                statusIcons: [],
                muscularTypes: [],
                duplicateIconClasses: 0,
            };
            let savedSettings = null;

            page.on("pageerror", error => {
                const value = String(error.stack || error.message || error);
                if (/pp-helper-live\.user\.js/i.test(value)) scriptErrors.push(value.split("\n")[0]);
            });
            page.on("response", async response => {
                const url = response.url();
                if (!url.includes("sid=crimesData") || !url.includes("step=crimesList")) return;
                statusCapture.responses += 1;
                try {
                    const data = await response.json();
                    const targets = Array.isArray(data?.DB?.crimesByType) ? data.DB.crimesByType : [];
                    statusCapture.targetRecords += targets.length;
                    statusCapture.statusRecords += targets.filter(target => target?.crimeInfo?.status?.icon).length;
                    statusCapture.statusIcons = Array.from(new Set([
                        ...statusCapture.statusIcons,
                        ...targets.map(target => target?.crimeInfo?.status?.icon).filter(Boolean).map(String),
                    ])).sort();
                    statusCapture.muscularTypes = Array.from(new Set([
                        ...statusCapture.muscularTypes,
                        ...targets.filter(target => target?.crimeInfo && "muscular" in target.crimeInfo)
                            .map(target => typeof target.crimeInfo.muscular),
                    ])).sort();
                    const iconCounts = targets.reduce((counts, target) => {
                        const icon = String(target?.iconClass || "");
                        if (icon) counts[icon] = (counts[icon] || 0) + 1;
                        return counts;
                    }, {});
                    statusCapture.duplicateIconClasses += Object.values(iconCounts).filter(count => count > 1).length;
                } catch (_) { /* Torn may discard or encode an obsolete response; the DOM assertion remains authoritative. */ }
            });

            try {
                await page.setViewport({
                    width: viewport.width,
                    height: viewport.height,
                    isMobile: viewport.mobile,
                    hasTouch: viewport.mobile,
                    deviceScaleFactor: 1,
                });
                await page.bringToFront();
                await page.goto("https://www.torn.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
                await requireTornSession(page);
                savedSettings = await page.evaluate(() => localStorage.getItem("ppColorsSettings_v2"));
                await page.evaluate(() => localStorage.setItem("ppColorsSettings_v2", JSON.stringify({ readyOnly: false, bestCount: 1, minTier: 1 })));
                await page.evaluateOnNewDocument(() => {
                    const originalFetch = window.fetch;
                    window.__ppCrimesListFetches = 0;
                    window.fetch = function(...args) {
                        const url = (typeof args[0] === "string" ? args[0] : args[0]?.url) || "";
                        if (url.includes("sid=crimesData") && url.includes("step=crimesList")) window.__ppCrimesListFetches += 1;
                        return Reflect.apply(originalFetch, this, args);
                    };
                });
                await page.evaluateOnNewDocument(source);
                await page.goto(ROUTE, { waitUntil: "domcontentloaded", timeout: 45000 });
                await page.waitForSelector('[class*="titleAndProps___"]', { timeout: 45000 });
                await page.waitForSelector("#pp-helper", { timeout: 45000 });
                await page.waitForFunction(() => document.querySelectorAll(".pp-helper-target").length > 0, { timeout: 45000 });
                await page.waitForFunction(() => {
                    const metadata = Array.from(document.querySelectorAll(".pp-helper-meta[aria-label]"));
                    return metadata.length > 0 && metadata.some(meta => !meta.getAttribute("aria-label").includes("; Spawning;"));
                }, { timeout: 30000 });

                const collapsed = await layoutSnapshot(page);
                assert.equal(collapsed.helperCount, 1, `${viewport.name}: helper duplicated`);
                assert.notEqual(collapsed.helperPosition, "fixed", `${viewport.name}: helper is not inline`);
                assert.ok(collapsed.helperBottom <= collapsed.firstCardTop + 1, `${viewport.name}: helper overlaps Torn targets`);
                assert.ok(collapsed.helperLeft >= 0 && collapsed.helperRight <= collapsed.viewportWidth + 1, `${viewport.name}: helper extends outside the viewport`);
                assert.ok(collapsed.helperScrollWidth <= collapsed.helperClientWidth, `${viewport.name}: helper controls overflow internally`);
                assert.equal(collapsed.decoratedCards, collapsed.badgeGroups, `${viewport.name}: card/badge mapping mismatch`);
                assert.deepEqual(collapsed.metadataViolations, [], `${viewport.name}: metadata collides with Torn content`);
                assert.deepEqual(collapsed.cueViolations, [], `${viewport.name}: status or best cue is clipped`);
                assert.match(collapsed.skillLabel || "", /^Skill:\s*[\d.]+$/, `${viewport.name}: current Torn skill label was not readable`);
                assert.ok(statusCapture.responses > 0, `${viewport.name}: no live crimes-list response observed`);
                assert.ok(statusCapture.statusRecords > 0, `${viewport.name}: live response had no status records`);

                for (let toggleIndex = 0; toggleIndex < 4; toggleIndex += 1) {
                    await clickHelper('#pp-helper-toggle');
                    assert.equal(await page.$eval('#pp-attempt-feedback', node => node.hidden), true, `${viewport.name}: minimizing/restoring the helper falsely started an attempt`);
                }
                await clickHelper('[data-helper-view="settings"]');
                await page.waitForSelector("#pp-helper-controls:not([hidden])");
                const expanded = await layoutSnapshot(page);
                assert.ok(expanded.helperLeft >= 0 && expanded.helperRight <= expanded.viewportWidth + 1, `${viewport.name}: expanded helper extends outside the viewport`);
                assert.ok(expanded.helperScrollWidth <= expanded.helperClientWidth, `${viewport.name}: expanded controls overflow internally`);
                assert.deepEqual(expanded.metadataViolations, [], `${viewport.name}: expanded view has metadata collisions`);
                assert.deepEqual(expanded.cueViolations, [], `${viewport.name}: expanded status or best cue is clipped`);
                if (viewport.mobile) {
                    const minTouchHeight = await page.$$eval("#pp-helper button", buttons => Math.min(...buttons
                        .filter(button => getComputedStyle(button).display !== "none" && button.getClientRects().length > 0)
                        .map(button => button.getBoundingClientRect().height)));
                    assert.ok(minTouchHeight >= 44, `${viewport.name}: live touch target below 44px`);
                }
                await clickHelper('button[data-ui-mode="torn"]');
                await page.waitForFunction(() => document.querySelector("#pp-helper")?.dataset.uiMode === "torn"
                    && document.querySelectorAll(".pp-helper-target, .pp-helper-meta, .pp-helper-filtered").length === 0);
                assert.equal(await page.$eval("#pp-helper-summary", node => node.textContent), "Torn UI mode", `${viewport.name}: live Torn UI mode did not activate`);
                await clickHelper('button[data-ui-mode="helper"]');
                await page.waitForFunction(() => document.querySelector("#pp-helper")?.dataset.uiMode === "helper"
                    && document.querySelectorAll(".pp-helper-target .pp-helper-meta").length > 0);
                await page.screenshot({ path: path.join(SHOT_DIR, `pickpocket-helper-live-${viewport.name}.png`), fullPage: true });

                const filterChoice = await page.evaluate(() => {
                    const tiers = Array.from(document.querySelectorAll(".pp-helper-tier-badge"))
                        .map(node => Number(node.textContent.replace(/^T/, "")))
                        .filter(Number.isFinite);
                    const unique = Array.from(new Set(tiers)).sort((a, b) => a - b);
                    if (unique.length > 1) return { kind: "tier", value: unique[unique.length - 1] };
                    const cards = document.querySelectorAll(".pp-helper-target").length;
                    const nonGo = document.querySelectorAll(".pp-helper-verdict-wait, .pp-helper-verdict-avoid, .pp-helper-verdict-caution").length;
                    if (nonGo > 0 && nonGo < cards) return { kind: "ready" };
                    return null;
                });
                let filtered = null;
                if (filterChoice?.kind === "tier") {
                    await clickHelper(`[data-tier="${filterChoice.value}"]`);
                } else if (filterChoice?.kind === "ready") {
                    await clickHelper("#pp-ready-only");
                }
                if (filterChoice) {
                    await page.waitForFunction(() => document.querySelectorAll(".pp-helper-filtered").length > 0, { timeout: 15000 });
                    filtered = await filteredLayoutSnapshot(page);
                    assert.ok(filtered.visibleCards > 0, `${viewport.name}: live filter removed every target`);
                    assert.equal(filtered.compactedParents, 1, `${viewport.name}: filtered list is not compacted exactly once`);
                    assert.equal(filtered.compactedOwners, 1, `${viewport.name}: outer crime panel is not compacted exactly once`);
                    assert.equal(filtered.compactedSliders, 1, `${viewport.name}: crime slider is not compacted exactly once`);
                    assert.deepEqual(filtered.blankGapViolations, [], `${viewport.name}: filtered list retains blank virtual gaps`);
                    assert.equal(filtered.sliderPaddingBottom, 0, `${viewport.name}: crime slider retained virtual-list padding`);
                    assert.equal(filtered.sliderOverflow, "hidden", `${viewport.name}: compacted rows are not clipped to the slider`);
                    await page.screenshot({ path: path.join(SHOT_DIR, `pickpocket-helper-live-${viewport.name}-filtered.png`), fullPage: true });
                    await clickHelper("#pp-reset");
                    await page.waitForFunction(() => document.querySelectorAll(".pp-helper-filtered").length === 0);
                    const resetLayout = await filteredLayoutSnapshot(page);
                    assert.deepEqual(resetLayout.blankGapViolations, [], `${viewport.name}: reset list contains blank virtual gaps`);
                }

                const fetches = await page.evaluate(() => window.__ppCrimesListFetches);
                assert.ok(fetches > 0, `${viewport.name}: Torn made no observable crimes-list request`);
                assert.deepEqual(scriptErrors, [], `${viewport.name}: userscript errors: ${scriptErrors.join(" | ")}`);
                reports.push({ viewport: viewport.name, collapsed, expanded, filtered, fetches, statusCapture });
                console.log(`[live] ${viewport.name}: ${collapsed.decoratedCards} targets, ${statusCapture.statusRecords} live statuses`);
            } catch (error) {
                const diagnostic = await page.evaluate(() => ({
                    href: location.href,
                    title: document.title,
                    readyState: document.readyState,
                    visibility: document.visibilityState,
                    textLength: document.body?.innerText?.length || 0,
                    titleNodes: document.querySelectorAll('[class*="titleAndProps___"]').length,
                    hasLoginForm: Boolean(document.querySelector('input[type="password"], form[action*="login"]')),
                    hasChallenge: Boolean(document.querySelector('iframe[src*="captcha"], iframe[src*="challenge"], [id*="captcha"]')),
                })).catch(() => ({ href: page.url(), diagnosticUnavailable: true }));
                await page.screenshot({ path: path.join(SHOT_DIR, `pickpocket-helper-live-${viewport.name}-blocked.png`), fullPage: true }).catch(() => {});
                console.error(`[live] ${viewport.name} diagnostic ${JSON.stringify(diagnostic)}`);
                throw error;
            } finally {
                if (!page.isClosed()) {
                    if (savedSettings === null) {
                        await page.evaluate(() => localStorage.removeItem("ppColorsSettings_v2")).catch(() => {});
                    } else {
                        await page.evaluate(value => localStorage.setItem("ppColorsSettings_v2", value), savedSettings).catch(() => {});
                    }
                    await page.close().catch(() => {});
                }
            }
        }
    } finally {
        if (!sourcePage.isClosed()) await sourcePage.bringToFront().catch(() => {});
        const visibleAfter = await getVisibleWindowState(sourcePage);
        assertVisibleWindowUnchanged(visibleBefore, visibleAfter);
        await browser.disconnect();
    }

    console.log(JSON.stringify({ ok: true, reports }, null, 2));
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
