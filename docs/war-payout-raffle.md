# Standalone War Payout Calculator — Raffle

Open **Raffle** inside the calculator, or **War raffle** from its Hub menu.
Load a war from Calculate first; saved war counts work without another API scan.
The raffle is bundled into the standalone script and does not require OC Suite
or the older War Payout Report.

## Tickets and eligibility

The default is one ticket per **enemy-inflicted loss**: an enemy attack that
defeated a member. Successful enemy-war hits, assists, offensive stalemates,
successful defends and a flat entry per counted participant have editable
weights. Presets select losses, hits, balanced activity or equal entries.
Outside attacks do not contribute. Equal entries cover members represented
in the loaded report, not the entire faction roster. Respect or other metrics
absent from cached counts are not guessed.

Weights accept up to four decimal places. The calculator sums weighted counts
using exact decimal arithmetic and rounds down once per member. It then applies
the optional per-member cap (0 means unlimited) and the minimum ticket threshold.
Zero-ticket members are always excluded. Enter the number of unique winners;
it must not exceed eligible members. **Entrants and first-pick odds** shows each
entrant's tickets and chance on the first pick. Later picks use smaller pools.

Live wars show an odds preview. Draws require completed-war counts, an active
foreground panel, secure randomness, durable storage and cross-tab storage
locking. API-log completeness remains unverified, including for saved wars.

## Random selection

Each pick uses the browser's cryptographic `crypto.getRandomValues` source.
Two random 32-bit words supply 53 random bits. Rejection sampling discards the
uneven tail before mapping the accepted value into the ticket range. This avoids
the modulo bias from simply taking any random integer modulo the ticket total.
BigInt arithmetic preserves the bounds, including pools above 2^32 tickets.

Every ticket has an equal chance of being selected within that pick's pool.
Members with more tickets therefore have proportionally higher chances. After
a winner is selected, all of that member's tickets are removed before the next
pick, so one draw cannot select the same member twice. A broken or unavailable
secure generator stops the draw; there is no Math.random fallback.

This is cryptographically strong local pseudorandomness. It is not a physical
true-random generator or an externally verifiable, tamper-proof public lottery.
Someone controlling their own browser/script can alter local data or make other
draws; exported local history does not prove otherwise. No external randomness
service, backend or Torn endpoint is needed.

Reference: [Web Crypto getRandomValues specification](https://www.w3.org/TR/webcrypto/#Crypto-method-getRandomValues).

## Saved results and redraws

**Draw winners** saves the original scope, aggregate participant counts, ticket
weights, eligible entries, per-pick pool sizes/winning ticket, ranked winners,
save time and cryptographic draw ID before displaying winners. Results persist
across closing/reopening and reload; changing ticket weights does not rewrite a
saved draw. Pick an older entry in Draw history, copy its result, or export the
complete JSON record. Odds CSV is a snapshot of the current draft's first-pick
chances; it is distinct from a saved draw record.

A war with an existing result requires **New draw** confirmation. The previous
result remains in history. The append rechecks the acknowledged previous result
under a cross-tab lock, so another tab cannot silently bypass confirmation.
If another draw appeared meanwhile, review it and confirm again. There are no
automatic retries, redraws, member credits or prize transfers.

The separate `twpc-raffle-draws-v1` archive retains up to 50 draws and 2 MiB,
with up to 1,000 eligible entrants per draw. It refuses additional saves at the
limit instead of silently evicting records. An expanded archival workflow would
be needed beyond that capacity. Use native asynchronous PDA storage where
available, otherwise bounded userscript-manager storage. Valid legacy storage
can migrate under the same lock. Storage failures preserve previous records;
failed reads disable drawing and can be retried by reopening Raffle.

No API keys, raw attacks, faction/native balances or payout statuses are stored.
Raffle records and exports contain names, IDs and aggregate war participation,
so share them intentionally. Payout amounts, locked credit runs and paid receipts
remain owned by their existing separate modules. Inactive/hidden panels do not
start new archive writes; already dispatched native writes must finish.

## Checks

```text
node --check Torn_War_Payout_Calculator.user.js
node test/war-payout-raffle.test.cjs
node test/browser/war-payout-raffle.cjs
node tools/check-war-payout.cjs --browser
node tools/release-userscripts.cjs --prepare
node tools/release-userscripts.cjs --check
```

The focused tests use deterministic injected random values to check interval
boundaries, rejection tails, without-replacement behavior and failure paths.
Statistical frequency tests are not used as a proof of fairness. Browser tests
use synthetic Torn/API data and perform no real payouts. Native PDA execution
remains a separate device verification.
