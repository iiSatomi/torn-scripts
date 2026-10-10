/**
 * Torn Banker Request — Discord relay (Cloudflare Worker)
 * ============================================================================
 * A pass-through between the Apps Script backend and Discord. It exists for one
 * reason: Apps Script egresses from Google's SHARED IP ranges, and Cloudflare
 * rate-limits Discord per source IP (error 1015), so you can be throttled by
 * other people's traffic. A Worker egresses from Cloudflare's own network, off
 * that shared bucket.
 *
 * It is deliberately dumb. It holds the webhook, checks a shared key, forwards
 * the call, and passes Discord's status code straight back — the backend's 429
 * handling and circuit breaker depend on seeing the REAL response, not a
 * laundered one.
 *
 * ── SETUP (about 10 minutes, once) ──────────────────────────────────────────
 *   1. dash.cloudflare.com  →  Workers & Pages  →  Create  →  Create Worker
 *   2. Name it (e.g. banker-relay)  →  Deploy  →  Edit code
 *   3. Delete the sample, paste THIS whole file, Deploy.
 *   4. Settings → Variables and Secrets → add two:
 *        DISCORD_WEBHOOK   (secret)  your webhook URL
 *        RELAY_KEY         (secret)  any long random string — invent one
 *   5. Copy the Worker URL (…​.workers.dev).
 *   6. In Apps Script → Project Settings → Script Properties, add:
 *        RELAY_URL   the …​.workers.dev URL from step 5
 *        RELAY_KEY   the SAME random string from step 4
 *      You can now REMOVE DISCORD_WEBHOOK from Apps Script — the Worker holds it.
 *
 * To turn the relay OFF: clear RELAY_URL in Apps Script (and restore
 * DISCORD_WEBHOOK there). No redeploy — the backend falls straight back to
 * calling Discord directly.
 */
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('method', { status: 405 });

    // The key is what makes the public Worker URL safe to ship: without it, the
    // request is refused before the webhook is ever touched.
    if (request.headers.get('X-Relay-Key') !== env.RELAY_KEY)
      return new Response('forbidden', { status: 403 });

    let req;
    try { req = await request.json(); }
    catch (_) { return new Response('bad json', { status: 400 }); }

    const base = String(env.DISCORD_WEBHOOK || '').split('?')[0];
    if (!base) return new Response('DISCORD_WEBHOOK not set', { status: 500 });

    const id = String(req.message_id || '').replace(/[^0-9]/g, '');
    const target =
      req.op === 'post' ? { url: base + '?wait=true',          method: 'POST'   } :
      req.op === 'edit' ? { url: `${base}/messages/${id}`,     method: 'PATCH'  } :
      req.op === 'del'  ? { url: `${base}/messages/${id}`,     method: 'DELETE' } : null;
    if (!target) return new Response('bad op', { status: 400 });

    const res = await fetch(target.url, {
      method: target.method,
      headers: { 'Content-Type': 'application/json' },
      body: target.method === 'DELETE' ? undefined : JSON.stringify(req.body || {}),
    });

    // Pass status + body straight through. The backend upstream keys its retry
    // and circuit-breaker decisions on Discord's real code — laundering it here
    // would blind them.
    return new Response(await res.text(), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
