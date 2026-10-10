// ==UserScript==
// @name         Torn Item Stat Copier
// @namespace    iSatomi.tornitemstatcopier
// @version      1.9
// @description  Adds a "Copy Stats" button to the item info popup on items.php and the Item Market and lets you copy a clean rundown of the weapon/item's stats (name, description, Damage/Accuracy/Stealth/Bonus/Quality, plus the market Listing Price when applicable). Supports plain-text, BBCode, and Markdown formats. Each stat is individually toggleable.
// @author       iSatomi [3580191]
// @license      GPL-3.0
// @match        https://www.torn.com/*
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/598097/Torn%20Item%20Stat%20Copier.user.js
// @updateURL https://update.greasyfork.org/scripts/598097/Torn%20Item%20Stat%20Copier.meta.js
// ==/UserScript==

(function () {
    'use strict';

    /* ----------------------------------------------------------------------
     * Storage helpers (TornPDA-safe: localStorage wrapped, GM fallback)
     * -------------------------------------------------------------------- */
    const KEY_FORMAT = 'isatomi_stat_copier_format';
    const KEY_INCLUDE_DESC = 'isatomi_stat_copier_include_desc';
    const KEY_INCLUDE_TYPE = 'isatomi_stat_copier_include_type';
    const KEY_HIDDEN_STATS = 'isatomi_stat_copier_hidden_stats'; // JSON array of stat labels to omit

    // Stats hidden by default per user preference. Stored as a JSON array under
    // KEY_HIDDEN_STATS so the user can edit it from the toolbar's "Stats…" panel.
    const DEFAULT_HIDDEN_STATS = ['Buy', 'Sell', 'Value', 'Circ', 'Rate of Fire', 'Caliber', 'Ammo'];

    function getHiddenStats() {
        const raw = safeGet(KEY_HIDDEN_STATS, null);
        if (raw === null || raw === undefined) return DEFAULT_HIDDEN_STATS.slice();
        try {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) return arr;
        } catch (e) { /* fall through */ }
        return DEFAULT_HIDDEN_STATS.slice();
    }
    function setHiddenStats(arr) {
        safeSet(KEY_HIDDEN_STATS, JSON.stringify(arr));
    }

    function safeGet(key, def) {
        try {
            const v = localStorage.getItem(key);
            if (v !== null) return v;
        } catch (e) { /* ignore */ }
        try {
            if (typeof GM_getValue === 'function') {
                const v = GM_getValue(key, null);
                if (v !== null && v !== undefined) return v;
            }
        } catch (e) { /* ignore */ }
        return def;
    }
    function safeSet(key, val) {
        try { localStorage.setItem(key, val); } catch (e) { /* ignore */ }
        try { if (typeof GM_setValue === 'function') GM_setValue(key, val); } catch (e) { /* ignore */ }
    }

    /* ----------------------------------------------------------------------
     * Clipboard helper
     * -------------------------------------------------------------------- */
    function copyText(text) {
        // Prefer GM_setClipboard (works in TM and most managers)
        try {
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(text, { type: 'text', mimetype: 'text/plain' });
                return true;
            }
        } catch (e) { /* fall through */ }
        // Fallback: navigator.clipboard
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text);
                return true;
            }
        } catch (e) { /* fall through */ }
        // Last-resort fallback: hidden textarea
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            return true;
        } catch (e) { return false; }
    }

    /* ----------------------------------------------------------------------
     * Extraction — read everything from the currently-open item info panel
     * -------------------------------------------------------------------- */
    function findOpenPanel() {
        // The info popup container uses a React-hashed class name like itemInfo___N9c6v
        // The hash changes across deploys, so match by prefix.
        return document.querySelector('.show-item-info [class*="itemInfo___"]')
            || document.querySelector('[class*="itemInfo___"]');
    }

    function findOpenItemRow() {
        // The <li> that contains the open info panel — has data-item, data-category, data-sort
        const panel = findOpenPanel();
        if (!panel) return null;
        return panel.closest('li[data-item]') || panel.closest('li.show-item-info')?.previousElementSibling || null;
    }

    function getDescription(panel) {
        if (!panel) return { name: '', type: '', flavor: '' };
        const desc = panel.querySelector('[class*="description___"]');
        if (!desc) return { name: '', type: '', flavor: '' };

        // The .description___ block contains:
        //   <div class="m-bottom10"><span class="bold">The ArmaLite M-15A4</span> is a  Rifle Weapon.</div>
        //   Made from the latest composites, this lightweight but powerful rifle is perfect for the experienced shooter.
        const boldEl = desc.querySelector('.bold, b, strong');
        const nameRaw = boldEl ? boldEl.textContent.trim() : '';
        // Strip a leading "The " if present, so "The ArmaLite M-15A4" -> "ArmaLite M-15A4"
        const name = nameRaw.replace(/^The\s+/i, '').trim();

        // First line (m-bottom10) holds "is a <Type>." — pull the type after "is a"
        const firstLine = desc.querySelector('.m-bottom10');
        let type = '';
        if (firstLine) {
            const m = firstLine.textContent.match(/is\s+an?\s+(.+?)\./i);
            if (m) type = m[1].trim();
        }

        // Flavor = description text minus the first <div> line
        let flavor = '';
        const clone = desc.cloneNode(true);
        const first = clone.querySelector('.m-bottom10');
        if (first) first.remove();
        flavor = clone.textContent.replace(/\s+/g, ' ').trim();

        return { name, type, flavor };
    }

    function getProperties(panel) {
        if (!panel) return [];
        const out = [];
        const lis = panel.querySelectorAll('ul[class*="properties___"] > li[class*="propertyWrapper___"]');
        lis.forEach((li) => {
            const titleEl = li.querySelector('[class*="title___"]');
            if (!titleEl) return; // empty row
            const valWrap = li.querySelector('[class*="valueWrapper___"]');
            if (!valWrap) return;

            const label = titleEl.textContent.replace(/:\s*$/, '').trim();

            // Value: take the visible aria-hidden text (avoids dupes from aria-label)
            // Example: <span aria-hidden="true">$21,430,691</span>
            //          <span aria-hidden="true"><span>3 x 15</span></span>
            const hidden = valWrap.querySelector('span[aria-hidden="true"]');
            let value = '';
            if (hidden) {
                value = hidden.textContent.replace(/\s+/g, ' ').trim();
            } else {
                // fallback: strip the title text out of the wrap
                value = valWrap.textContent.replace(/\s+/g, ' ').trim();
            }

            // Quality row also has a rarity color tag (e.g. "Yellow") rendered in a sibling span
            if (/quality/i.test(label)) {
                const rarity = valWrap.querySelector('[class*="rarity___"]');
                if (rarity) {
                    const rTxt = rarity.textContent.replace(/\s+/g, ' ').trim();
                    if (rTxt && !value.toLowerCase().includes(rTxt.toLowerCase())) {
                        value = `${value} ${rTxt}`;
                    }
                }
            }

            // Bonus row: append the tooltip description after the value.
            // The text differs by page:
            //   - Item Market popup carries it on the icon as
            //     data-bonus-attachment-description="20% chance to Cripple..."
            //   - items.php popup has no description in the popup itself; the
            //     matching icon in the inventory row (sibling of the popup) has
            //     a `title` attr like `<b>Conserve</b><br/>29% increased ammo
            //     conservation`, which we parse and clean.
            if (/^bonus$/i.test(label)) {
                const icon = valWrap.querySelector('i[class*="bonus-attachment-"]');
                const desc = getBonusDescription(icon, panel);
                if (desc) value = `${value} - ${desc}`;
            }

            if (label && value) out.push({ label, value });
        });
        return out;
    }

    /**
     * Resolve the human-readable description for a bonus icon.
     * Tries (1) the data-bonus-attachment-description attribute on the icon,
     * then (2) the title attribute on any matching icon outside the popup
     * (e.g. on items.php where the description lives on the inventory row).
     */
    function getBonusDescription(icon, panel) {
        if (!icon) return '';

        // (1) Market popup: description is directly on the icon
        const direct = icon.getAttribute('data-bonus-attachment-description');
        if (direct && direct.trim()) return direct.trim();

        // (2) items.php: find the bonus-attachment-XYZ class and look elsewhere
        const cls = (icon.className || '').match(/bonus-attachment-[\w-]+/);
        if (!cls) return '';
        const bonusClass = cls[0];

        // Look at the inventory row that owns this popup (popup is inside
        // li.show-item-info, the row is its previous sibling).
        const popupLi = panel?.closest('li.show-item-info') || panel?.closest('li');
        const row = popupLi?.previousElementSibling;
        const candidates = [];
        if (row) candidates.push(row);
        // Fallback: search the whole tab pane for an icon with the same class
        const tabPane = panel?.closest('ul');
        if (tabPane) candidates.push(tabPane);

        for (const c of candidates) {
            // The matching icon outside the popup may carry either:
            //   - data-bonus-attachment-description="20% chance to..."  (Item Market listing row)
            //   - title="<b>Conserve</b><br/>29% increased..."          (items.php inventory row)
            const matches = c.querySelectorAll(`i.${bonusClass}`);
            for (const m of matches) {
                const d = m.getAttribute('data-bonus-attachment-description');
                if (d && d.trim()) return d.trim();
                const t = m.getAttribute('title');
                if (t && t.trim()) return parseBonusTitle(t);
            }
        }
        return '';
    }

    /**
     * Convert a bonus icon `title` attribute like
     *   "<b>Conserve</b><br/>29% increased ammo conservation"
     * into a clean description like "29% increased ammo conservation".
     * The bonus name itself is dropped because the row's value already has
     * it (e.g. "29% Conserve - 29% increased ammo conservation" → keep only
     * the part after the <br/>).
     */
    function parseBonusTitle(raw) {
        if (!raw) return '';
        // Strip the leading <b>NAME</b> if present, keep everything after the first <br>
        let s = raw;
        // Decode common HTML entities — the browser usually keeps them decoded
        // when reading via .getAttribute, but be defensive.
        s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
        const br = s.search(/<br\s*\/?\s*>/i);
        if (br >= 0) s = s.slice(br).replace(/<br\s*\/?\s*>/i, '');
        // Strip any remaining HTML tags
        s = s.replace(/<[^>]+>/g, '').trim();
        return s;
    }

    /**
     * Item Market only: when an info popup is open, the popup's <li> wrapper
     * sits immediately AFTER the listing's own <li>. The listing carries the
     * price in .priceAndTotal___ span. Return { price, seller } when found, or
     * null on the regular items.php inventory page.
     */
    function getMarketListingInfo(panel) {
        if (!panel) return null;
        // The popup is wrapped in <li class="itemInfoWrapper___...">. Walk up to
        // that, then to the previous <li> — that's the listing row.
        const wrapLi = panel.closest('li[class*="itemInfoWrapper___"]');
        if (!wrapLi) return null;
        const listingLi = wrapLi.previousElementSibling;
        if (!listingLi || listingLi.tagName !== 'LI') return null;

        const result = {};

        const priceEl = listingLi.querySelector('[class*="priceAndTotal___"] span');
        if (priceEl) {
            result.price = priceEl.textContent.replace(/\s+/g, ' ').trim();
        }

        // Seller name (when shown — varies by listing/category)
        const sellerLink = listingLi.querySelector('a[href*="profiles.php"]');
        if (sellerLink) {
            result.seller = sellerLink.textContent.replace(/\s+/g, ' ').trim();
        }

        return Object.keys(result).length ? result : null;
    }

    /**
     * Auction House only: extract Bid, Time Left, Seller, and Top Bidder from
     * the listing's labelled rows that sit above the info popup.
     *
     * Unlike the Item Market, the AH popup structure varies by deploy and I
     * don't have a stable class to anchor to, so this works via text scan:
     *   1. Walk up from the panel looking for the nearest ancestor whose text
     *      content (excluding the panel) contains "Bid:" followed by "$".
     *   2. Build a clean text blob from that ancestor (minus panel text) and
     *      regex out each labelled value.
     *
     * Returns null on pages without AH-style labels (items.php, Item Market),
     * so it's safe to call unconditionally.
     */
    function getAuctionListingInfo(panel) {
        if (!panel) return null;

        // (1) Walk upward to find the listing card that hosts both the popup
        // and the labelled rows. Bail out at body / after a sane depth limit.
        let host = null;
        let cur = panel.parentElement;
        for (let i = 0; i < 12 && cur; i++) {
            if (cur === document.body || cur === document.documentElement) break;
            let textOutside = '';
            for (const c of cur.children) {
                if (c === panel || c.contains(panel)) continue;
                textOutside += ' ' + (c.textContent || '');
            }
            if (/Bid:\s*\$/i.test(textOutside)) { host = cur; break; }
            cur = cur.parentElement;
        }
        if (!host) return null;

        // (2) Build a clean single-line text blob from non-panel children
        let text = '';
        for (const c of host.children) {
            if (c === panel || c.contains(panel)) continue;
            text += '  ' + (c.textContent || '');
        }
        text = text.replace(/\s+/g, ' ').trim();

        const result = {};

        const bidM = text.match(/Bid:\s*(\$[\d,]+)/i);
        if (bidM) result.bid = bidM[1];

        // "Time left: 14h 6m" / "1d 3h 22m" / "47m"
        const timeM = text.match(/Time left:\s*((?:\d+\s*[dhms]\s*)+)/i);
        if (timeM) result.timeLeft = timeM[1].replace(/\s+/g, ' ').trim();

        // Names terminated by the next labelled field. Allow letters, digits,
        // underscore, hyphen, square brackets (for [12345] suffixes), and spaces.
        const sellerM = text.match(/Seller:\s*([A-Za-z0-9_\-\[\] ]{2,40}?)\s+(?:Top bidder|Bid|Time left)\b/i);
        if (sellerM) result.seller = sellerM[1].trim();

        const topM = text.match(/Top bidder:\s*([A-Za-z0-9_\-\[\] ]{2,40}?)\s+(?:Seller|Bid|Time left)\b/i);
        if (topM) result.topBidder = topM[1].trim();

        return Object.keys(result).length ? result : null;
    }

    function getItemId(panel) {
        const row = panel?.closest('li')?.previousElementSibling
            || document.querySelector('li.show-item-info')?.previousElementSibling;
        if (row && row.dataset && row.dataset.item) return row.dataset.item;
        // Fallback: any nearby data-item
        const nearby = panel?.closest('ul')?.querySelector('li[data-item]');
        return nearby?.dataset?.item || '';
    }

    /* ----------------------------------------------------------------------
     * Formatters
     * -------------------------------------------------------------------- */
    function formatPlain(data) {
        const lines = [];
        lines.push(data.name || 'Item');
        if (data.includeType && data.type) lines.push(`Type: ${data.type}`);
        if (data.itemId) lines.push(`Item ID: ${data.itemId}`);
        if (data.includeDesc && data.flavor) lines.push(`"${data.flavor}"`);
        lines.push('');
        const pad = Math.max(...data.props.map(p => p.label.length), 0);
        data.props.forEach(p => {
            lines.push(`${p.label.padEnd(pad)} : ${p.value}`);
        });
        return lines.join('\n');
    }

    function formatBBCode(data) {
        const lines = [];
        lines.push(`[b]${data.name || 'Item'}[/b]`);
        if (data.includeType && data.type) lines.push(`Type: ${data.type}`);
        if (data.itemId) lines.push(`Item ID: ${data.itemId}`);
        if (data.includeDesc && data.flavor) lines.push(`[i]${data.flavor}[/i]`);
        lines.push('[list]');
        data.props.forEach(p => {
            lines.push(`[*][b]${p.label}:[/b] ${p.value}`);
        });
        lines.push('[/list]');
        return lines.join('\n');
    }

    function formatMarkdown(data) {
        const lines = [];
        lines.push(`**${data.name || 'Item'}**`);
        if (data.includeType && data.type) lines.push(`*Type:* ${data.type}`);
        if (data.itemId) lines.push(`*Item ID:* ${data.itemId}`);
        if (data.includeDesc && data.flavor) lines.push(`> ${data.flavor}`);
        lines.push('');
        lines.push('| Stat | Value |');
        lines.push('| --- | --- |');
        data.props.forEach(p => {
            lines.push(`| ${p.label} | ${p.value} |`);
        });
        return lines.join('\n');
    }

    /**
     * One-line chat-friendly summary. Uses abbreviated stat labels and pipes
     * as separators. Drops the bonus description (long tooltip text) and
     * keeps only the headline like "29% Conserve". Repeated labels (e.g.
     * two Bonus rows) are merged: "Bonus: 20% Cripple, 33% Weaken".
     */
    const COMPACT_LABEL_MAP = {
        'Listing Price': 'Price',
        'Damage': 'Dmg',
        'Accuracy': 'Acc',
        'Stealth': 'Stl',
        'Rate of Fire': 'RoF',
        'Quality': 'Qlt',
        'Value': 'Val',
        'Buy': 'Buy',
        'Sell': 'Sell',
        'Circ': 'Circ',
    };
    function compactValue(label, value) {
        // For Bonus rows, drop the " - long descriptor" trailer
        if (/^bonus$/i.test(label)) {
            return String(value).split(' - ')[0].trim();
        }
        return value;
    }
    function formatCompact(data) {
        const parts = [];
        if (data.name) parts.push(data.name);
        if (data.includeType && data.type) parts.push(`(${data.type})`);

        // Group props by label so multiple Bonus rows merge to "Bonus: A, B"
        const groups = new Map();
        const order = [];
        data.props.forEach(p => {
            const v = compactValue(p.label, p.value);
            if (!groups.has(p.label)) { groups.set(p.label, []); order.push(p.label); }
            groups.get(p.label).push(v);
        });
        order.forEach(label => {
            const short = COMPACT_LABEL_MAP[label] || label;
            parts.push(`${short}: ${groups.get(label).join(', ')}`);
        });

        return parts.join(' | ');
    }

    function buildPayload() {
        const panel = findOpenPanel();
        if (!panel) return null;
        const desc = getDescription(panel);
        const allProps = getProperties(panel);

        // On the Item Market, prepend the listing price (and seller when shown)
        // as synthetic stat rows so they flow through formatters AND show up in
        // the Stats… picker like any other field.
        const market = getMarketListingInfo(panel);
        if (market) {
            if (market.seller) allProps.unshift({ label: 'Seller', value: market.seller });
            if (market.price)  allProps.unshift({ label: 'Listing Price', value: market.price });
        }

        // On the Auction House, prepend Bid / Time Left / Seller / Top Bidder.
        // These come from a text-scan of the listing card so they're best-effort
        // — null when none of the labels are present (i.e. on non-AH pages).
        // Unshifted in reverse order of desired display so Bid lands first.
        const auction = getAuctionListingInfo(panel);
        if (auction) {
            if (auction.topBidder) allProps.unshift({ label: 'Top Bidder', value: auction.topBidder });
            if (auction.seller)    allProps.unshift({ label: 'Seller',     value: auction.seller });
            if (auction.timeLeft)  allProps.unshift({ label: 'Time Left',  value: auction.timeLeft });
            if (auction.bid)       allProps.unshift({ label: 'Bid',        value: auction.bid });
        }

        if (!desc.name && allProps.length === 0) return null;

        // Filter out stats the user has hidden (case-insensitive label match)
        const hidden = new Set(getHiddenStats().map(s => s.toLowerCase()));
        const props = allProps.filter(p => !hidden.has(p.label.toLowerCase()));

        return {
            name: desc.name,
            type: desc.type,
            flavor: desc.flavor,
            itemId: getItemId(panel),
            props,
            allProps, // kept so the "Stats…" picker can list everything available
            includeDesc: safeGet(KEY_INCLUDE_DESC, '1') === '1',
            includeType: safeGet(KEY_INCLUDE_TYPE, '0') === '1', // default OFF
        };
    }

    /* ----------------------------------------------------------------------
     * UI — inject Copy Stats button into the open info panel
     * -------------------------------------------------------------------- */
    const STYLE_ID = 'isatomi-stat-copier-style';
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = STYLE_ID;
        s.textContent = `
        .isc-btn-wrap {
            display: flex;
            gap: 6px;
            align-items: center;
            margin: 6px 8px 8px;
            flex-wrap: wrap;
        }
        .isc-btn {
            background: #1a1a1a;
            color: #ddd;
            border: 1px solid #444;
            border-radius: 4px;
            padding: 4px 10px;
            font: 11px/1.4 Arial, sans-serif;
            cursor: pointer;
            transition: background .15s, color .15s, border-color .15s;
        }
        .isc-btn:hover { background: #262626; color: #fff; border-color: #6aa84f; }
        .isc-btn.isc-primary { border-color: #6aa84f; color: #cfe9b6; }
        .isc-btn.isc-primary:hover { background: #2a3a22; }
        .isc-btn.isc-flash { background: #2a3a22; color: #b6e88a; border-color: #8bc34a; }
        .isc-select {
            background: #1a1a1a;
            color: #ddd;
            border: 1px solid #444;
            border-radius: 4px;
            padding: 3px 6px;
            font: 11px Arial, sans-serif;
        }
        .isc-check {
            font: 11px Arial, sans-serif;
            color: #bbb;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            cursor: pointer;
        }
        .isc-check input { accent-color: #8bc34a; }
        .isc-popover {
            position: absolute;
            z-index: 9999;
            background: #141414;
            border: 1px solid #4a6a3a;
            border-radius: 6px;
            padding: 8px 10px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.6);
            min-width: 180px;
            font: 11px Arial, sans-serif;
            color: #ddd;
        }
        .isc-popover h4 {
            margin: 0 0 6px;
            font: bold 11px Arial, sans-serif;
            color: #b6e88a;
            border-bottom: 1px solid #2a2a2a;
            padding-bottom: 4px;
        }
        .isc-popover label {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 2px 0;
            cursor: pointer;
            color: #ccc;
        }
        .isc-popover label:hover { color: #fff; }
        .isc-popover .isc-pop-actions {
            display: flex;
            gap: 6px;
            margin-top: 6px;
            padding-top: 6px;
            border-top: 1px solid #2a2a2a;
        }
        .isc-popover .isc-link {
            background: none;
            border: none;
            color: #8bc34a;
            cursor: pointer;
            padding: 0;
            font: 11px Arial, sans-serif;
        }
        .isc-popover .isc-link:hover { color: #b6e88a; text-decoration: underline; }
        `;
        document.head.appendChild(s);
    }

    function openStatsPicker(anchorEl, panel) {
        // Toggle: if a picker is already open, close it
        const existing = document.querySelector('.isc-popover');
        if (existing) { existing.remove(); return; }

        // Read every stat label currently in the panel so the user can toggle them.
        // Include synthetic market fields (Listing Price, Seller) when present
        // so the picker matches what the Copy button will actually emit.
        const allProps = getProperties(panel);
        const market = getMarketListingInfo(panel);
        if (market) {
            if (market.seller) allProps.unshift({ label: 'Seller', value: market.seller });
            if (market.price)  allProps.unshift({ label: 'Listing Price', value: market.price });
        }
        const auction = getAuctionListingInfo(panel);
        if (auction) {
            if (auction.topBidder) allProps.unshift({ label: 'Top Bidder', value: auction.topBidder });
            if (auction.seller)    allProps.unshift({ label: 'Seller',     value: auction.seller });
            if (auction.timeLeft)  allProps.unshift({ label: 'Time Left',  value: auction.timeLeft });
            if (auction.bid)       allProps.unshift({ label: 'Bid',        value: auction.bid });
        }
        if (allProps.length === 0) return;
        const hidden = new Set(getHiddenStats().map(s => s.toLowerCase()));

        const pop = document.createElement('div');
        pop.className = 'isc-popover';

        const h = document.createElement('h4');
        h.textContent = 'Include stats';
        pop.appendChild(h);

        const checkboxes = [];
        allProps.forEach((p) => {
            const row = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.dataset.label = p.label;
            cb.checked = !hidden.has(p.label.toLowerCase());
            const t = document.createElement('span');
            t.textContent = p.label;
            row.appendChild(cb);
            row.appendChild(t);
            pop.appendChild(row);
            checkboxes.push(cb);
        });

        const actions = document.createElement('div');
        actions.className = 'isc-pop-actions';

        const all = document.createElement('button');
        all.type = 'button';
        all.className = 'isc-link';
        all.textContent = 'All';
        all.addEventListener('click', () => checkboxes.forEach(c => c.checked = true));

        const none = document.createElement('button');
        none.type = 'button';
        none.className = 'isc-link';
        none.textContent = 'None';
        none.addEventListener('click', () => checkboxes.forEach(c => c.checked = false));

        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'isc-link';
        reset.textContent = 'Reset';
        reset.addEventListener('click', () => {
            const def = new Set(DEFAULT_HIDDEN_STATS.map(s => s.toLowerCase()));
            checkboxes.forEach(c => c.checked = !def.has(c.dataset.label.toLowerCase()));
        });

        actions.appendChild(all);
        actions.appendChild(none);
        actions.appendChild(reset);
        pop.appendChild(actions);

        // Save on any change so it persists immediately.
        //
        // IMPORTANT: only update state for the labels actually shown in this
        // picker. Hidden labels NOT in this picker (e.g. AH-only "Top Bidder"
        // when the user is currently viewing the picker on items.php) must be
        // preserved — otherwise switching pages silently wipes preferences
        // tied to fields the current popup doesn't expose.
        const save = () => {
            const shown = new Set(checkboxes.map(c => c.dataset.label.toLowerCase()));
            const preserved = getHiddenStats().filter(s => !shown.has(s.toLowerCase()));
            const newlyHidden = checkboxes.filter(c => !c.checked).map(c => c.dataset.label);
            setHiddenStats([...preserved, ...newlyHidden]);
        };
        checkboxes.forEach(c => c.addEventListener('change', save));
        all.addEventListener('click', save);
        none.addEventListener('click', save);
        reset.addEventListener('click', save);

        // Position the popover under the anchor button
        document.body.appendChild(pop);
        const r = anchorEl.getBoundingClientRect();
        pop.style.top = (window.scrollY + r.bottom + 4) + 'px';
        pop.style.left = (window.scrollX + r.left) + 'px';

        // Close on outside click
        const onDocClick = (ev) => {
            if (!pop.contains(ev.target) && ev.target !== anchorEl) {
                pop.remove();
                document.removeEventListener('click', onDocClick, true);
            }
        };
        setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
    }

    function buildToolbar(panel) {
        // Avoid duplicates
        if (panel.querySelector('.isc-btn-wrap')) return;

        const wrap = document.createElement('div');
        wrap.className = 'isc-btn-wrap';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'isc-btn isc-primary';
        btn.textContent = 'Copy Stats';

        const sel = document.createElement('select');
        sel.className = 'isc-select';
        [['plain', 'Plain text'], ['compact', 'Compact (1 line)'], ['bbcode', 'BBCode'], ['markdown', 'Markdown']].forEach(([v, label]) => {
            const o = document.createElement('option');
            o.value = v; o.textContent = label;
            sel.appendChild(o);
        });
        sel.value = safeGet(KEY_FORMAT, 'plain');
        sel.addEventListener('change', () => safeSet(KEY_FORMAT, sel.value));

        const lbl = document.createElement('label');
        lbl.className = 'isc-check';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = safeGet(KEY_INCLUDE_DESC, '1') === '1';
        cb.addEventListener('change', () => safeSet(KEY_INCLUDE_DESC, cb.checked ? '1' : '0'));
        const lblTxt = document.createElement('span');
        lblTxt.textContent = 'Include description';
        lbl.appendChild(cb);
        lbl.appendChild(lblTxt);

        const lblType = document.createElement('label');
        lblType.className = 'isc-check';
        const cbType = document.createElement('input');
        cbType.type = 'checkbox';
        cbType.checked = safeGet(KEY_INCLUDE_TYPE, '0') === '1'; // off by default
        cbType.addEventListener('change', () => safeSet(KEY_INCLUDE_TYPE, cbType.checked ? '1' : '0'));
        const lblTypeTxt = document.createElement('span');
        lblTypeTxt.textContent = 'Include type';
        lblType.appendChild(cbType);
        lblType.appendChild(lblTypeTxt);

        // "Stats…" picker — lets the user toggle individual stat rows
        const statsBtn = document.createElement('button');
        statsBtn.type = 'button';
        statsBtn.className = 'isc-btn';
        statsBtn.textContent = 'Stats…';
        statsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openStatsPicker(statsBtn, panel);
        });

        btn.addEventListener('click', () => {
            const data = buildPayload();
            if (!data) {
                btn.textContent = 'No data';
                setTimeout(() => { btn.textContent = 'Copy Stats'; }, 1200);
                return;
            }
            data.includeDesc = cb.checked;
            data.includeType = cbType.checked;
            let text = '';
            switch (sel.value) {
                case 'compact':  text = formatCompact(data); break;
                case 'bbcode':   text = formatBBCode(data); break;
                case 'markdown': text = formatMarkdown(data); break;
                default:         text = formatPlain(data);
            }
            const ok = copyText(text);
            btn.classList.add('isc-flash');
            btn.textContent = ok ? 'Copied!' : 'Copy failed';
            setTimeout(() => {
                btn.textContent = 'Copy Stats';
                btn.classList.remove('isc-flash');
            }, 1200);
        });

        wrap.appendChild(btn);
        wrap.appendChild(sel);
        wrap.appendChild(statsBtn);
        wrap.appendChild(lbl);
        wrap.appendChild(lblType);

        // Place the toolbar near the Price Check button if present, otherwise at the bottom of the panel
        const priceCheckBtn = panel.querySelector('button.ah-btn');
        if (priceCheckBtn && priceCheckBtn.parentElement) {
            priceCheckBtn.parentElement.insertBefore(wrap, priceCheckBtn.nextSibling);
        } else {
            panel.appendChild(wrap);
        }
    }

    /* ----------------------------------------------------------------------
     * Observer — info panel mounts/unmounts when user opens different items
     * -------------------------------------------------------------------- */
    function scan() {
        const panels = document.querySelectorAll('[class*="itemInfo___"]');
        panels.forEach((p) => {
            // Only inject when the properties list has actually rendered (avoids
            // injecting into a still-loading panel before stats are present).
            const hasProps = p.querySelector('ul[class*="properties___"] li[class*="propertyWrapper___"]');
            if (hasProps) buildToolbar(p);
        });
    }

    injectStyles();
    scan();

    const mo = new MutationObserver((muts) => {
        // Debounce-ish: only scan when DOM mutations touched something that could be a panel
        let touched = false;
        for (const m of muts) {
            if (m.addedNodes && m.addedNodes.length) { touched = true; break; }
        }
        if (touched) scan();
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Also rescan on tab changes / clicks (Torn switches inventory tabs without full reload)
    document.addEventListener('click', () => setTimeout(scan, 200), true);

})();
