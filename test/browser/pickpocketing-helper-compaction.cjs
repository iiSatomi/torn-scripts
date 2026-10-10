const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const puppeteer = require("puppeteer-core");

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT_PATH = path.join(ROOT, "Torn_Pickpocketing_Colors_Status-Aware_1.7.user.js");
const FIXTURE_PATH = path.join(__dirname, "pickpocketing-helper-fixture.html");
const BROWSER_URL = process.env.PP_BROWSER_URL || "http://127.0.0.1:9222";

const viewports = [
    { name: "desktop", width: 1920, height: 1080, mobile: false },
    { name: "pda-390x844", width: 390, height: 844, mobile: true },
];

async function layoutSnapshot(page) {
    return page.evaluate(() => {
        const canvas = document.querySelector("#target-grid");
        const visible = Array.from(canvas.children).filter(node => getComputedStyle(node).display !== "none");
        const canvasRect = canvas.getBoundingClientRect();
        const owner = canvas.closest('[class*="currentCrime___"]');
        const ownerRect = owner.getBoundingClientRect();
        const slider = owner.parentElement;
        const firstRect = visible[0]?.getBoundingClientRect();
        return {
            visibleCount: visible.length,
            filteredCount: canvas.querySelectorAll(".pp-helper-filtered").length,
            compactedParents: document.querySelectorAll(".pp-helper-compacted").length,
            firstOffset: firstRect ? Math.round(firstRect.top - canvasRect.top) : null,
            canvasHeight: Math.round(canvasRect.height),
            cardHeight: firstRect ? Math.round(firstRect.height) : 0,
            ownerTrailingGap: Math.round(ownerRect.bottom - canvasRect.bottom),
            compactedOwners: document.querySelectorAll(".pp-helper-compacted-owner").length,
            compactedSliders: document.querySelectorAll(".pp-helper-compacted-slider").length,
            sliderPaddingBottom: Math.round(parseFloat(getComputedStyle(slider).paddingBottom) || 0),
        };
    });
}

(async () => {
    const source = fs.readFileSync(SCRIPT_PATH, "utf8");
    const browser = await puppeteer.connect({ browserURL: BROWSER_URL, defaultViewport: null });
    const originalPage = (await browser.pages()).find(page => page.url().includes("torn.com"));
    const openedPages = [];
    const reports = [];

    try {
        for (const viewport of viewports) {
            const page = await browser.newPage();
            openedPages.push(page);
            await page.setViewport({
                width: viewport.width,
                height: viewport.height,
                isMobile: viewport.mobile,
                hasTouch: viewport.mobile,
                deviceScaleFactor: 1,
            });
            await page.goto(`${pathToFileURL(FIXTURE_PATH).href}?virtual=1#/pickpocketing`, {
                waitUntil: "domcontentloaded",
            });
            await page.evaluate(() => localStorage.removeItem("ppColorsSettings_v2"));
            await page.addScriptTag({ content: source });
            await page.waitForSelector("#pp-helper");
            await page.evaluate(() => fetch("https://www.torn.com/page.php?sid=crimesData&step=crimesList"));
            await page.waitForFunction(() => {
                const metadata = Array.from(document.querySelectorAll(".pp-helper-meta[aria-label]"));
                return document.querySelectorAll(".pp-helper-target").length === 6
                    && metadata.length === 6
                    && metadata.every(meta => !meta.getAttribute("aria-label").includes("; Spawning;"));
            });
            const originalCardsMarkup = await page.$eval("#target-grid", node => node.innerHTML);

            await page.click('[data-helper-view="settings"]');
            await page.click('[data-tier="4"]');
            await page.click("#pp-ready-only");
            await page.waitForFunction(() => document.querySelectorAll(".pp-helper-filtered").length === 5);

            const filtered = await layoutSnapshot(page);
            assert.equal(filtered.visibleCount, 1, `${viewport.name}: expected one matching target`);
            assert.ok(filtered.firstOffset <= 1, `${viewport.name}: filtered target retains a virtual top gap`);
            assert.ok(filtered.canvasHeight <= filtered.cardHeight + 1, `${viewport.name}: virtual canvas retains hidden target height`);
            assert.ok(filtered.ownerTrailingGap <= 1, `${viewport.name}: outer crime panel retains hidden target height`);
            assert.equal(filtered.compactedOwners, 1, `${viewport.name}: outer crime panel was not compacted`);
            assert.equal(filtered.compactedSliders, 1, `${viewport.name}: crime slider was not compacted`);
            assert.equal(filtered.sliderPaddingBottom, 0, `${viewport.name}: crime slider retained blank padding`);

            await page.$eval("#target-grid", node => node.replaceChildren());
            await page.waitForFunction(() => document.querySelectorAll(".pp-helper-compacted, .pp-helper-compacted-owner, .pp-helper-compacted-slider").length === 3);
            const refreshing = await layoutSnapshot(page);
            assert.equal(refreshing.compactedParents, 1, `${viewport.name}: transient empty refresh dropped list compaction`);
            assert.equal(refreshing.compactedOwners, 1, `${viewport.name}: transient empty refresh dropped outer compaction`);
            assert.equal(refreshing.compactedSliders, 1, `${viewport.name}: transient empty refresh dropped slider compaction`);

            await page.$eval("#target-grid", (node, markup) => { node.innerHTML = markup; }, originalCardsMarkup);
            await page.waitForFunction(() => document.querySelectorAll(".pp-helper-target").length === 6 && document.querySelectorAll(".pp-helper-filtered").length === 5);

            await page.click("#pp-reset");
            await page.waitForFunction(() => document.querySelectorAll(".pp-helper-filtered").length === 0);
            const reset = await layoutSnapshot(page);
            assert.equal(reset.visibleCount, 6, `${viewport.name}: reset did not restore all targets`);
            assert.ok(reset.canvasHeight <= reset.visibleCount * reset.cardHeight + 1, `${viewport.name}: visible virtual rows retain blank result slots`);
            assert.equal(reset.compactedParents, 1, `${viewport.name}: reset dropped tight virtual layout`);
            assert.equal(reset.compactedOwners, 1, `${viewport.name}: reset dropped outer tight layout`);
            assert.equal(reset.compactedSliders, 1, `${viewport.name}: reset dropped slider tight layout`);
            assert.equal(reset.sliderPaddingBottom, 0, `${viewport.name}: reset restored blank virtual padding`);
            assert.equal(await page.evaluate(() => window.fixtureFetchCalls), 1, `${viewport.name}: helper made an extra request`);
            reports.push({ viewport: viewport.name, filtered, refreshing, reset });
        }
    } finally {
        await Promise.all(openedPages.map(page => page.isClosed() ? null : page.close().catch(() => {})));
        if (originalPage && !originalPage.isClosed()) await originalPage.bringToFront().catch(() => {});
        await browser.disconnect();
    }

    console.log(JSON.stringify({ ok: true, reports }, null, 2));
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
