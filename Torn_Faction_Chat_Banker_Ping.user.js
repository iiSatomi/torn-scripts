// ==UserScript==
// @name         Torn Faction Chat – Banker Ping to Discord
// @namespace    torn-faction-banker-ping
// @version      1.4.0
// @license None (All Rights Reserved)
// @description  Watches Faction Chat for @banker mentions and forwards them to a Discord webhook. Scrolling back through history no longer re-posts old messages.
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_xmlHttpRequest
// @grant        GM.xmlHttpRequest
// @connect      discord.com
// @downloadURL https://update.greasyfork.org/scripts/588179/Torn%20Faction%20Chat%20%E2%80%93%20Banker%20Ping%20to%20Discord.user.js
// @updateURL https://update.greasyfork.org/scripts/588179/Torn%20Faction%20Chat%20%E2%80%93%20Banker%20Ping%20to%20Discord.meta.js
// ==/UserScript==
//
// v1.4.0 — FIXED: scrolling up in chat re-posted old messages to Discord.
//
//   THE BUG. Torn's chat is a VIRTUALIZED list: only the rows near the viewport
//   exist in the DOM, and scrolling mounts/unmounts them. The script watched for
//   added nodes and treated every one it hadn't seen as a new message. But the
//   "seen" set was only ever seeded from the rows mounted AT ATTACH TIME — so
//   any message older than that window was, by definition, unknown. Scroll up,
//   those rows mount, and every @banker request in your faction's history posts
//   to Discord again.
//
//   Deduping harder wouldn't have fixed it: the old key was `sender::text`, and
//   an old message genuinely isn't in a set that never contained it. The script
//   needed a way to tell OLD from NEW, which it had no signal for.
//
//   THE FIX — two independent gates, both verified against a saved copy of the
//   live chat DOM rather than guessed at:
//
//   1. REAL MESSAGE IDENTITY. Every row's sender link carries a per-message id:
//        <a id="rq-04e0762d-c512-4cca-a64a-0a96cf76b5cb:2360099" …>
//      23 rows in the saved page, 23 distinct ids. That's a stable identity that
//      survives unmount/remount, so a message can be recognised no matter how
//      many times the virtualizer recycles it. (It also fixes a quieter bug: the
//      old `sender::text` key meant two people asking for the same amount
//      collapsed into one, and the second request was silently dropped.)
//
//   2. A MONOTONIC ORDINAL. Each row is wrapped in an absolutely-positioned div:
//        <div style="contain:layout style;position:absolute;…;top:990px">
//      Those offsets increase strictly down the list (960, 990, 1020, 1050…), so
//      "further down" means "newer". We record a high-water mark and only post a
//      row whose offset is ABOVE it. Scrollback is always below the mark, so it
//      can never post — and a genuinely new message is appended at the very
//      bottom, so it always can.
//
//   Note this needs no scroll-direction tracking. Watching for "user scrolled
//   up" can't actually work: a row mounting above you and a row appended below
//   you look identical to a MutationObserver, and a new message arriving while
//   you happen to be scrolled up is a real case that would be lost. The ordinal
//   answers the question directly instead of inferring it from behaviour.
//
//   BASELINING. The high-water mark is only meaningful if it's taken from the
//   BOTTOM of the list — the newest messages. Chat opens scrolled to the bottom,
//   so normally that's free. If the panel is (re)attached while scrolled up, the
//   mark would sit mid-history and everything below it would look new, so the
//   script stays disarmed, keeps recording what it sees, and baselines the first
//   time the list is back at the bottom. It would rather miss a ping than spam
//   the channel with history.
//
//   ALSO FIXED:
//   • Discord messages read "**juga:** juga: send me 10m" — the row's innerText
//     includes the sender prefix, which was then printed again. Now only the
//     message body is sent.
//   • Chat text is posted with mentions disabled (allowed_mentions.parse = []),
//     so someone typing "@everyone @banker" in Torn can't mass-ping Discord.
//   • GM_xmlhttpRequest is resolved across managers. The bare function isn't
//     exposed everywhere (some expose only the GM4 `GM.xmlHttpRequest`
//     namespace), which fails with "GM_xmlHttpRequest is not a function".

(() => {
    'use strict';

    // 🔧 EDIT THIS — Discord webhook URL for your #bank-requests channel
    // Discord: right-click channel → Edit Channel → Integrations → Webhooks
    // → New Webhook → Copy Webhook URL
    const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1529636040627716200/wh5aCKvf3KBadNUHhOo9tkEVhnOHYqJ2_D3IgjJjEZ2UN6aQoIYLZD5AfgTrA_vMZf8N';

    // Trigger phrase — case-insensitive, matches "@banker" or "@ banker"
    const TRIGGER_PATTERN = /@\s?banker/i;

    // ── SELECTORS ────────────────────────────────────────────────────────────
    // All verified against a saved copy of the live faction chat panel. Torn's
    // class names are CSS-module hashes (virtualItem___ie1bt) whose suffix
    // changes on any deploy, so nothing here matches a full class name — only
    // the stable prefix, or an attribute.
    const CHAT_CONTAINER_SELECTOR = 'div[id^="faction-"]';
    const MESSAGE_ROW_SELECTOR    = 'div[class*="virtualItem__"]';
    const PROFILE_LINK_SELECTOR   = 'a[href*="XID="]';
    const MESSAGE_ID_SELECTOR     = 'a[id^="rq-"]';        // rq-<uuid>:<userId>
    const MESSAGE_BODY_SELECTOR   = 'span[class*="message__"]';

    // How long to let the list settle after attaching before we trust it. The
    // virtualizer mounts rows asynchronously, so the burst that lands right
    // after attach is existing history, not new traffic.
    const SETTLE_MS = 1500;

    // Treat the list as "at the bottom" within this many pixels. Chat lists
    // rarely sit at exactly 0 remaining.
    const BOTTOM_SLOP_PX = 80;

    const MAX_TRACKED = 800;

    // ── TRANSPORT ────────────────────────────────────────────────────────────
    // Managers disagree on which of these they expose; pick whichever exists.
    const gmxhr =
        (typeof GM_xmlhttpRequest === 'function' && GM_xmlhttpRequest) ||
        (typeof GM_xmlHttpRequest === 'function' && GM_xmlHttpRequest) ||
        (typeof GM !== 'undefined' && GM.xmlHttpRequest && GM.xmlHttpRequest.bind(GM)) ||
        null;

    // ── STATE ────────────────────────────────────────────────────────────────
    // seen: message ids we've already accounted for. Deliberately NOT reset on
    // reattach — the chat panel re-mounting shouldn't make old requests new.
    const seen = new Set();

    let hwm = -Infinity;      // highest row offset ever observed
    let armed = false;        // false until baselined from the bottom of the list
    let newestRow = null;     // fallback ordering anchor (see ordinalOf)
    let activeObserver = null;
    let activeContainer = null;
    let scrollEl = null;
    let warnedNoOrdinal = false;

    function remember(id) {
        seen.add(id);
        if (seen.size > MAX_TRACKED) seen.delete(seen.values().next().value);
    }

    // ── ROW INSPECTION ───────────────────────────────────────────────────────

    /** Not every virtualized row is a message. Day/time dividers ("Today 02:09")
     *  render as rows too, with no sender and no body — they'd otherwise sit in
     *  the seen-set under a text key that changes as the clock does. */
    function isMessageRow(row) {
        return !!(row.querySelector(MESSAGE_ID_SELECTOR) || row.querySelector(MESSAGE_BODY_SELECTOR));
    }

    /** Per-message id from the sender link ("rq-<uuid>:<userId>").
     *
     *  Where that link is absent — own messages may render without one, and a
     *  future deploy could drop it — fall back to a key built from the row's
     *  OFFSET plus its text. The offset is what makes that fallback safe: it's
     *  fixed for the life of the row, so it survives remounting, and it's
     *  distinct per position, so two people sending identical text don't
     *  collapse into one (which is exactly what the old sender::text key did). */
    function messageId(row) {
        const a = row.querySelector(MESSAGE_ID_SELECTOR);
        if (a && a.id) return a.id;
        const ord = ordinalOf(row);
        return `pos:${ord === null ? '?' : ord}::${(row.innerText || '').trim().slice(0, 160)}`;
    }

    /**
     * The row's position in the conversation, as a number that grows downward.
     *
     * The virtualizer absolutely-positions every row, so the wrapper's `top` is
     * exactly the ordering signal we need. Walk up a few levels rather than
     * assuming a fixed depth, so an extra wrapper in a future deploy doesn't
     * break it. Returns null if no positioned ancestor is found.
     */
    function ordinalOf(row) {
        let el = row;
        for (let i = 0; i < 4 && el; i++) {
            const inline = el.style && el.style.top;
            if (inline && el.style.position === 'absolute') {
                const n = parseFloat(inline);
                if (Number.isFinite(n)) return n;
            }
            el = el.parentElement;
        }
        // Deliberately no geometry fallback here: getBoundingClientRect is
        // viewport-relative, so it changes as you scroll and can't be compared
        // against a stored high-water mark. Returning null hands the decision
        // to the document-order path in processRow instead.
        return null;
    }

    function senderName(row) {
        const idLink = row.querySelector(MESSAGE_ID_SELECTOR);
        if (idLink) return (idLink.textContent || '').replace(/:\s*$/, '').trim() || 'Unknown';
        const link = row.querySelector(PROFILE_LINK_SELECTOR);
        return link ? (link.textContent || '').replace(/:\s*$/, '').trim() : 'You';
    }

    /** Just the message text — the row's innerText also carries the sender
     *  prefix, which used to get printed twice in the Discord message. */
    function messageBody(row) {
        const body = row.querySelector(MESSAGE_BODY_SELECTOR);
        if (body) return (body.innerText || '').trim();
        // Fallback: strip a leading "Name:" prefix off the whole row.
        return (row.innerText || '').trim().replace(/^[^\n:]{1,32}:\s*/, '');
    }

    // ── SCROLL POSITION ──────────────────────────────────────────────────────

    /** The scrolling element inside the chat panel — whichever descendant
     *  actually overflows. Found by measurement, so no class name is involved. */
    function findScroller(container) {
        if (scrollEl && container.contains(scrollEl)) return scrollEl;
        const cands = [container, ...container.querySelectorAll('div')];
        for (const el of cands) {
            if (el.scrollHeight > el.clientHeight + 20) { scrollEl = el; return el; }
        }
        return null;
    }

    function atBottom(container) {
        const el = findScroller(container);
        if (!el) return true; // nothing scrolls yet — the whole list is visible
        return (el.scrollHeight - el.scrollTop - el.clientHeight) <= BOTTOM_SLOP_PX;
    }

    // ── DISCORD ──────────────────────────────────────────────────────────────

    function postToDiscord(sender, text) {
        if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL.includes('PASTE_YOUR')) return;
        if (!gmxhr) {
            console.error('[Banker Ping] No GM_xmlhttpRequest available — grant it in your userscript manager, then re-save the script.');
            return;
        }
        gmxhr({
            method: 'POST',
            url: DISCORD_WEBHOOK_URL,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({
                content: `🏦 **Banker ping — Faction Chat**\n**${sender}:** ${text}`,
                // Chat text goes straight into Discord, so nothing in it is
                // allowed to resolve as a mention — otherwise "@everyone
                // @banker" typed in Torn would mass-ping the server.
                allowed_mentions: { parse: [] },
            }),
        });
    }

    // ── CORE ─────────────────────────────────────────────────────────────────

    /**
     * Decide what a newly-present row is, then record it either way.
     *
     * @param post  false during the initial scan and the settle window, so
     *              existing history is recorded as seen without being sent.
     */
    function processRow(row, post) {
        if (!(row instanceof HTMLElement)) return;
        if (!isMessageRow(row)) return;          // day divider, not a message

        const id = messageId(row);
        const ord = ordinalOf(row);
        const known = seen.has(id);

        // Is this newer than everything we've accounted for?
        let isNew;
        if (ord !== null) {
            isNew = ord > hwm;
        } else {
            // No positioned wrapper (markup changed). Fall back to document
            // order against the newest row we've handled — still structural,
            // still needs no class names.
            if (!warnedNoOrdinal) {
                warnedNoOrdinal = true;
                console.warn('[Banker Ping] Chat row offsets not found — falling back to document order. Torn may have changed its markup.');
            }
            isNew = !newestRow || !newestRow.isConnected ||
                    (newestRow.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        }

        // Record BEFORE deciding to send, so a row can only ever fire once.
        remember(id);
        if (ord !== null && ord > hwm) hwm = ord;
        if (isNew) newestRow = row;

        if (!post || !armed) return;
        if (known || !isNew) return;             // already handled, or scrollback

        const text = messageBody(row);
        if (!TRIGGER_PATTERN.test(row.innerText || '')) return;

        postToDiscord(senderName(row), text);
    }

    function scan(root, post) {
        if (!(root instanceof HTMLElement)) return;
        if (root.matches && root.matches(MESSAGE_ROW_SELECTOR)) processRow(root, post);
        root.querySelectorAll?.(MESSAGE_ROW_SELECTOR).forEach(r => processRow(r, post));
    }

    /**
     * Take the high-water mark from the bottom of the list and start posting.
     *
     * Only valid when the list is actually AT the bottom: baselining halfway up
     * history would mark everything below as "new" and dump it into Discord.
     * If we're not at the bottom, stay disarmed and try again — the check runs
     * on the same 1s timer that watches for the panel.
     */
    function tryArm(container) {
        if (armed) return;
        scan(container, false);              // record whatever is mounted now
        if (!atBottom(container)) return;    // can't trust this window yet
        armed = true;
    }

    function attachToContainer(container) {
        if (activeObserver) activeObserver.disconnect();
        activeContainer = container;
        scrollEl = null;

        // Reset the ordinal baseline — offsets are only comparable within one
        // mount of the list. `seen` deliberately survives, so a panel re-render
        // can't turn old requests back into new ones.
        hwm = -Infinity;
        armed = false;
        newestRow = null;

        scan(container, false);
        setTimeout(() => { if (activeContainer === container) tryArm(container); }, SETTLE_MS);

        activeObserver = new MutationObserver((mutations) => {
            for (const m of mutations) m.addedNodes.forEach(n => scan(n, true));
        });
        activeObserver.observe(container, { childList: true, subtree: true });
    }

    setInterval(() => {
        const container = document.querySelector(CHAT_CONTAINER_SELECTOR);
        if (container && container !== activeContainer) {
            attachToContainer(container);
        } else if (!container && activeContainer) {
            if (activeObserver) activeObserver.disconnect();
            activeObserver = null;
            activeContainer = null;
            scrollEl = null;
        } else if (container && !armed) {
            // Attached but never baselined — the list was scrolled up when we
            // started. Keep trying until it's back at the bottom.
            tryArm(container);
        }
    }, 1000);
})();
