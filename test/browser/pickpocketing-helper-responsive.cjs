const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const puppeteer = require("puppeteer-core");

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT_PATH = path.join(ROOT, "Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js");
const FIXTURE_PATH = path.join(__dirname, "pickpocketing-helper-fixture.html");
const SHOT_DIR = path.join(__dirname, "shots");
const BROWSER_URL = process.env.PP_BROWSER_URL || "http://127.0.0.1:9222";

const viewports = [
    { name: "desktop-1920x1080", width: 1920, height: 1080, mobile: false },
    { name: "pda-390x844", width: 390, height: 844, mobile: true },
    { name: "pda-430x932", width: 430, height: 932, mobile: true },
    { name: "pda-landscape-844x390", width: 844, height: 390, mobile: true },
];
let currentStage = "startup";

async function readLayout(page) {
    return page.evaluate(() => {
        const helper = document.querySelector("#pp-helper");
        const grid = document.querySelector("#target-grid");
        const helperRect = helper.getBoundingClientRect();
        const gridRect = grid.getBoundingClientRect();
        const controls = Array.from(helper.querySelectorAll("button"))
            .filter(button => getComputedStyle(button).display !== "none" && button.getClientRects().length > 0);
        const visibleCards = Array.from(grid.children).filter(card => card.classList.contains("pp-helper-target") && getComputedStyle(card).display !== "none");
        return {
            helperCount: document.querySelectorAll("#pp-helper").length,
            position: getComputedStyle(helper).position,
            helperLeft: helperRect.left,
            helperRight: helperRect.right,
            helperBottom: helperRect.bottom,
            gridTop: gridRect.top,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
            minButtonHeight: Math.min(...controls.map(button => button.getBoundingClientRect().height)),
            visibleCardCount: visibleCards.length,
            filteredCardCount: grid.querySelectorAll(".pp-helper-filtered").length,
            filteredDisplays: Array.from(grid.querySelectorAll(".pp-helper-filtered")).map(card => getComputedStyle(card).display),
            cardTops: visibleCards.map(card => Math.round(card.getBoundingClientRect().top)),
        };
    });
}

(async () => {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const script = fs.readFileSync(SCRIPT_PATH, "utf8");
    const browser = await puppeteer.connect({ browserURL: BROWSER_URL, defaultViewport: null });
    const originalPage = (await browser.pages()).find(page => page.url().includes("torn.com"));
    const reports = [];

    try {
        for (const viewport of viewports) {
            currentStage = `${viewport.name}: open`;
            console.log(`[responsive] ${viewport.name}: open`);
            const page = await browser.newPage();
            await page.bringToFront();
            const browserErrors = [];
            page.on("pageerror", error => browserErrors.push(String(error.message || error)));
            page.on("console", message => {
                if (message.type() === "error") browserErrors.push(message.text());
            });
            await page.setViewport({
                width: viewport.width,
                height: viewport.height,
                isMobile: viewport.mobile,
                hasTouch: viewport.mobile,
                deviceScaleFactor: 1,
            });
            currentStage = `${viewport.name}: fixture navigation`;
            await page.goto(`${pathToFileURL(FIXTURE_PATH).href}#/pickpocketing`, { waitUntil: "domcontentloaded" });
            await page.evaluate(() => {
                localStorage.removeItem("ppColorsSettings_v2");
                localStorage.removeItem("ppColorsAttemptLog_v1");
            });
            currentStage = `${viewport.name}: script injection`;
            await page.addScriptTag({ content: script });
            assert.equal(await page.evaluate(() => document.visibilityState), "visible", `${viewport.name}: fixture tab must be active`);
            currentStage = `${viewport.name}: helper mount`;
            await page.waitForSelector("#pp-helper");
            console.log(`[responsive] ${viewport.name}: helper mounted`);
            currentStage = `${viewport.name}: observed fetch`;
            await page.evaluate(() => fetch("https://www.torn.com/page.php?sid=crimesData&step=crimesList"));
            currentStage = `${viewport.name}: target paint`;
            await page.waitForFunction(() => {
                const cards = document.querySelectorAll(".pp-helper-target");
                const metadata = Array.from(document.querySelectorAll(".pp-helper-meta[aria-label]"));
                return cards.length === 6 && metadata.length === 6
                    && metadata.every(meta => !meta.getAttribute("aria-label").includes("; Spawning;"));
            });
            console.log(`[responsive] ${viewport.name}: targets painted`);
            const duplicateMapping = await page.evaluate(() => Array.from(document.querySelectorAll('[class*="titleAndProps___"]')).reduce((result, title) => {
                const name = title.querySelector("div")?.firstChild?.textContent?.trim();
                if (name === "Drunk man" || name === "Young woman") {
                    result[name] = title.querySelector(".pp-helper-meta")?.getAttribute("aria-label") || "";
                }
                return result;
            }, {}));
            assert.match(duplicateMapping["Drunk man"] || "", /Stumbling/, `${viewport.name}: first duplicate icon mapped out of order`);
            assert.match(duplicateMapping["Young woman"] || "", /Listening to music/, `${viewport.name}: second duplicate icon mapped out of order`);
            const visibleCues = await page.evaluate(() => ({
                statuses: Array.from(document.querySelectorAll(".pp-helper-status-badge"))
                    .filter(node => getComputedStyle(node).display !== "none" && node.getBoundingClientRect().width > 0)
                    .map(node => node.textContent.trim()),
                tiers: Array.from(document.querySelectorAll(".pp-helper-tier-badge"))
                    .filter(node => getComputedStyle(node).display !== "none" && node.getBoundingClientRect().width > 0)
                    .map(node => node.textContent.trim()),
                best: Array.from(document.querySelectorAll(".pp-helper-best-badge"))
                    .filter(node => getComputedStyle(node).display !== "none" && node.getBoundingClientRect().width > 0)
                    .map(node => node.textContent.trim()),
            }));
            assert.equal(visibleCues.statuses.length, 6, `${viewport.name}: every target needs a visible live-status cue`);
            assert.ok(visibleCues.statuses.every(Boolean), `${viewport.name}: live-status cue cannot be blank`);
            assert.equal(visibleCues.tiers.length, 6, `${viewport.name}: every target needs a visible tier cue`);
            assert.deepEqual(visibleCues.best, ["★ BEST"], `${viewport.name}: best target needs a visible star label`);

            const collapsed = await readLayout(page);
            assert.equal(collapsed.helperCount, 1, `${viewport.name}: helper must be a singleton`);
            assert.notEqual(collapsed.position, "fixed", `${viewport.name}: helper must remain inline`);
            assert.ok(collapsed.helperBottom <= collapsed.gridTop + 1, `${viewport.name}: helper overlaps the target grid`);
            assert.ok(collapsed.documentWidth <= collapsed.viewportWidth, `${viewport.name}: horizontal overflow`);
            await page.screenshot({ path: path.join(SHOT_DIR, `pickpocket-helper-${viewport.name}-collapsed.png`), fullPage: true });

            await page.click('[data-helper-view="settings"]');
            await page.waitForSelector("#pp-helper-controls:not([hidden])");
            const expanded = await readLayout(page);
            assert.ok(expanded.helperBottom <= expanded.gridTop + 1, `${viewport.name}: expanded helper overlaps targets`);
            assert.ok(expanded.documentWidth <= expanded.viewportWidth, `${viewport.name}: expanded controls overflow`);
            if (viewport.mobile) assert.ok(expanded.minButtonHeight >= 44, `${viewport.name}: touch target below 44px`);
            assert.equal(await page.$eval("#pp-insights-toggle", node => node.getAttribute("aria-checked")), "true", `${viewport.name}: logging must begin automatically`);
            assert.equal(await page.$eval("#pp-export-log", node => node.disabled), true, `${viewport.name}: empty log export must be disabled`);
            assert.equal(await page.$eval("#pp-clear-log", node => node.hidden), true, `${viewport.name}: empty log clear action must stay hidden`);
            await page.click('button[data-ui-mode="torn"]');
            await page.waitForFunction(() => document.querySelector("#pp-helper")?.dataset.uiMode === "torn"
                && document.querySelectorAll(".pp-helper-target, .pp-helper-meta, .pp-helper-filtered").length === 0);
            assert.equal(await page.$eval("#pp-helper-summary", node => node.textContent), "Torn UI mode", `${viewport.name}: native mode summary is wrong`);
            assert.equal(await page.$eval('button[data-ui-mode="torn"]', node => node.getAttribute("aria-pressed")), "true", `${viewport.name}: Torn UI choice did not activate`);
            assert.equal(await page.$eval("#pp-insights-dashboard", node => node.hidden), true, `${viewport.name}: Torn UI mode left the dashboard open`);
            const nativeMode = await readLayout(page);
            assert.ok(nativeMode.documentWidth <= nativeMode.viewportWidth, `${viewport.name}: Torn UI switch caused horizontal overflow`);
            await page.click('button[data-ui-mode="helper"]');
            await page.waitForFunction(() => document.querySelector("#pp-helper")?.dataset.uiMode === "helper"
                && document.querySelectorAll(".pp-helper-target .pp-helper-meta").length === 6);
            await page.$eval("#target-grid > article:first-child", card => {
                const button = document.createElement("button");
                button.id = "fixture-pickpocket";
                button.type = "button";
                button.textContent = "Pickpocket";
                card.appendChild(button);
            });
            await page.click("#fixture-pickpocket");
            await page.evaluate(() => fetch("https://www.torn.com/page.php?sid=crimesData&step=attemptCrime"));
            await page.waitForFunction(() => document.querySelector("#pp-insights-summary")?.textContent.includes("Last: Drunk man · Success"));
            await page.waitForSelector("#pp-attempt-feedback:not([hidden])");
            assert.deepEqual(await page.$eval("#pp-attempt-feedback", node => ({
                text: node.textContent.replace(/\s+/g, " ").trim(),
                role: node.getAttribute("role"),
            })), { text: "SUCCESSDrunk man · CS +0.00", role: "status" }, `${viewport.name}: target card must briefly show the attempt outcome`);
            assert.equal(await page.$eval("#pp-export-log", node => node.disabled), false, `${viewport.name}: logged attempts must be exportable`);
            assert.equal(await page.$eval("#pp-clear-log", node => node.hidden), false, `${viewport.name}: recorded log must expose clear action`);
            assert.equal(await page.$eval("#pp-insights-dashboard", node => node.hidden), true, `${viewport.name}: dashboard should stay compact until opened`);
            await page.$eval("#target-grid > article:nth-child(2)", card => {
                const button = document.createElement("button");
                button.id = "fixture-pickpocket-dom-result";
                button.type = "button";
                button.textContent = "Pickpocket";
                card.appendChild(button);
            });
            await page.click("#fixture-pickpocket-dom-result");
            await page.evaluate(() => fetch("https://www.torn.com/page.php?sid=crimesData&step=commitCrime"));
            await page.$eval("#target-grid", grid => {
                const result = document.createElement("section");
                result.textContent = "SUCCESS Total value: $36,699";
                grid.appendChild(result);
            });
            await page.waitForFunction(() => document.querySelector("#pp-insights-summary")?.textContent.includes("Last: Jogger · Success"));
            assert.match(await page.$eval("#pp-attempt-feedback", node => node.textContent), /\$36,699/, `${viewport.name}: Torn result panel value was not captured`);
            await page.click("#pp-open-insights");
            await page.waitForSelector("#pp-insights-dashboard:not([hidden])");
            assert.equal(await page.$eval("#pp-metric-attempts", node => node.textContent), "2", `${viewport.name}: dashboard attempt count is wrong`);
            assert.equal(await page.$eval("#pp-metric-success", node => node.textContent), "100%", `${viewport.name}: dashboard success rate is wrong`);
            assert.equal(await page.$eval("#pp-metric-value", node => node.textContent), "$36,699", `${viewport.name}: dashboard visible value is wrong`);
            assert.match(await page.$eval("#pp-recommendation", node => node.textContent), /More history needed/, `${viewport.name}: sparse history must not claim a best target`);
            assert.equal(await page.$eval("#pp-target-scorecards", node => node.children.length), 2, `${viewport.name}: dashboard target scorecards are missing`);
            const dashboardLayout = await readLayout(page);
            assert.ok(dashboardLayout.helperBottom <= dashboardLayout.gridTop + 1, `${viewport.name}: dashboard overlaps targets`);
            assert.ok(dashboardLayout.documentWidth <= dashboardLayout.viewportWidth, `${viewport.name}: dashboard overflows horizontally`);
            if (viewport.mobile) assert.ok(dashboardLayout.minButtonHeight >= 44, `${viewport.name}: dashboard touch target below 44px`);
            await page.screenshot({ path: path.join(SHOT_DIR, `pickpocket-helper-${viewport.name}-expanded.png`), fullPage: true });

            await page.click('[data-helper-view="settings"]');
            await page.click('button[data-ui-mode="torn"]');
            await page.waitForFunction(() => document.querySelectorAll(".pp-helper-target, .pp-helper-meta").length === 0);
            await page.click("#fixture-pickpocket");
            await page.evaluate(() => fetch("https://www.torn.com/page.php?sid=crimesData&step=attemptCrime"));
            await page.waitForFunction(() => {
                const events = JSON.parse(localStorage.getItem("ppColorsAttemptLog_v1") || "{}").events || [];
                return events.length === 3 && events[2].status === "Stumbling";
            });
            assert.equal(await page.$eval("#pp-attempt-feedback", node => node.hidden), true, `${viewport.name}: Torn UI mode showed script feedback`);
            await page.click('button[data-ui-mode="helper"]');
            await page.waitForFunction(() => document.querySelectorAll(".pp-helper-target .pp-helper-meta").length === 6);

            currentStage = `${viewport.name}: settings interactions`;
            await page.click("#pp-count-inc");
            await page.click("#pp-count-inc");
            assert.equal(await page.$eval("#pp-best-count", node => node.textContent), "3", `${viewport.name}: count stepper did not increment`);
            assert.match(await page.$eval("#pp-helper-summary", node => node.textContent), /Top 3$/, `${viewport.name}: count summary did not update`);
            await page.click('[data-tier="4"]');
            await page.waitForFunction(() => document.querySelectorAll("#target-grid > .pp-helper-filtered").length === 3);
            assert.equal(await page.$eval('[data-tier="4"]', node => node.getAttribute("aria-pressed")), "true", `${viewport.name}: tier choice did not activate`);
            await page.click("#pp-reset");
            await page.waitForFunction(() => document.querySelectorAll("#target-grid > .pp-helper-filtered").length === 0);
            assert.equal(await page.$eval("#pp-best-count", node => node.textContent), "1", `${viewport.name}: reset did not restore highlight count`);
            assert.equal(await page.$eval('[data-tier="1"]', node => node.getAttribute("aria-pressed")), "true", `${viewport.name}: reset did not restore tier 1`);
            assert.equal(await page.$eval("#pp-ready-only", node => node.getAttribute("aria-checked")), "false", `${viewport.name}: reset did not restore status filter`);
            assert.equal(await page.$eval("#pp-insights-toggle", node => node.getAttribute("aria-checked")), "true", `${viewport.name}: reset did not restore automatic logging`);

            currentStage = `${viewport.name}: ready-only click`;
            await page.click("#pp-ready-only");
            currentStage = `${viewport.name}: ready-only paint`;
            await page.waitForFunction(() => document.querySelectorAll("#target-grid > .pp-helper-filtered").length === 3);
            console.log(`[responsive] ${viewport.name}: filtering verified`);
            const filtered = await readLayout(page);
            assert.equal(filtered.filteredCardCount, 3, `${viewport.name}: incorrect ready-only filter count`);
            assert.deepEqual(filtered.filteredDisplays, ["none", "none", "none"], `${viewport.name}: hidden cards still reserve layout space`);
            assert.equal(filtered.visibleCardCount, 3, `${viewport.name}: expected three ready targets`);
            assert.ok(new Set(filtered.cardTops).size < filtered.cardTops.length, `${viewport.name}: non-virtual grid was converted to one column`);
            await page.click("#pp-reset");
            await page.waitForFunction(() => document.querySelectorAll("#target-grid > .pp-helper-filtered").length === 0);

            currentStage = `${viewport.name}: same-route panel replacement`;
            await page.evaluate(() => {
                const panel = document.querySelector('[class*="currentCrime___"]');
                const replacement = panel.cloneNode(true);
                replacement.querySelector("#pp-helper")?.remove();
                replacement.querySelectorAll(".pp-helper-meta").forEach(node => node.remove());
                replacement.querySelectorAll(".pp-helper-target").forEach(card => {
                    card.classList.remove(
                        "pp-helper-target",
                        "pp-helper-best",
                        "pp-helper-filtered",
                        "pp-helper-verdict-go",
                        "pp-helper-verdict-wait",
                        "pp-helper-verdict-avoid",
                        "pp-helper-verdict-caution",
                    );
                });
                panel.replaceWith(replacement);
            });
            await page.waitForFunction(() => document.querySelectorAll("#pp-helper").length === 1
                && document.querySelectorAll(".pp-helper-target .pp-helper-meta").length === 6);
            assert.equal(await page.$$eval("#pp-helper", nodes => nodes.length), 1, `${viewport.name}: panel replacement duplicated helper`);

            currentStage = `${viewport.name}: route exit`;
            await page.evaluate(() => { location.hash = "#/other"; });
            await page.waitForFunction(() => !document.querySelector("#pp-helper"));
            currentStage = `${viewport.name}: route return`;
            await page.evaluate(() => { location.hash = "#/pickpocketing"; });
            await page.waitForSelector("#pp-helper");
            console.log(`[responsive] ${viewport.name}: route lifecycle verified`);
            assert.equal(await page.$$eval("#pp-helper", nodes => nodes.length), 1, `${viewport.name}: route return duplicated helper`);
            assert.equal(await page.evaluate(() => window.fixtureFetchCalls), 4, `${viewport.name}: helper made an extra request`);
            assert.deepEqual(browserErrors, [], `${viewport.name}: browser errors: ${browserErrors.join(" | ")}`);

            reports.push({ viewport: viewport.name, collapsed, expanded, filtered });
            await page.close();
        }
    } finally {
        if (originalPage && !originalPage.isClosed()) await originalPage.bringToFront().catch(() => {});
        await browser.disconnect();
    }

    console.log(JSON.stringify({ ok: true, reports }, null, 2));
})().catch(error => {
    console.error(`Responsive test failed at ${currentStage}`);
    console.error(error);
    process.exitCode = 1;
});
