# Armory update — Codex 6

The navigation label and tab heading now read Armory. Internal `armoury` route
and element identifiers remain stable for existing links and saved navigation.

The tab keeps Activity, Members, OC Stock, and Loans. The activity view now has
labeled action/member/period filters, search, a 50-row page limit, and access
to every loaded record instead of silently discarding rows beyond 400.
Phone layouts stack activity rows and provide 44px controls and 16px inputs,
following `Torn-PDA-userscript-reference.md`.

Member cards are keyboard-accessible buttons with full action labels. The grid
uses cached portraits and initials; opening a member detail may fetch its
portrait. Loan age uses the explicit recipient when available instead of
incorrectly attributing an officer's outgoing transfer to the officer.

Refresh/backfill buttons disable during an active sync. Status changes are
announced to assistive technology. The missing-key view opens suite Config.
Activity totals explicitly cover loaded faction history, not personal use.

Verification: `test/browser/armory-ui.cjs` exercises the actual extracted tab
code in Brave using 125 synthetic ledger records. It checks pagination, period
and text filtering, no matches, keyboard member details, all four views,
Config navigation, and overflow/touch sizes at 1920x1080, 390x844, 430x932,
and 844x390. This is responsive browser verification, not native PDA testing.
Existing stock and loan actions retain their existing confirmation workflow.

The separate live Torn smoke attempt did not complete: the dedicated headed
Brave launch never exposed port 9222. Its launch PID and stalled smoke runner
were closed. Live faction-data integration remains unverified for this update.
