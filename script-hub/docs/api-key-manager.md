# API key manager

Open **Hub → API Keys**. Save one global key, then approve the connections that
may use it. Leave a script on **Global default**, or add a named key and select
it in that script's dropdown. Each provider has its own global key and named
keys; labels do not change a key's provider permissions.

**Use global key when a named assignment is missing** is optional and off by
default. When enabled, a deleted/missing named key resolves to the global key.
Restoring the named key takes precedence again. Removing script access blocks
both sources, and re-enabling access preserves its chosen assignment.

Authentication errors, permission errors, timeouts and rate limits never trigger
another key attempt. Payout's updated connection remembers successful Hub
enrollment and pauses if no approved Hub key is available, including after a
reload without Hub. It does not reactivate its saved personal key. Older script
adapters retain their existing behavior and display an update-needed notice.
Legacy scripts and independently configured embedded tools are not migrated.

Keys are write-only in the manager and excluded from preference exports.
Existing identity pins, explicit grants, encrypted delivery and eligible
manager/native PDA storage are preserved. There is no PDA localStorage vault
fallback. Storage namespaces are not a security boundary or password encryption.

This update contains only the key manager and the Payout adapter changes needed
to use it. API tracking and other script migrations are outside this release.
