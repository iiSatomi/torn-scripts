# Consumables — Codex 7

The native Consumables view now preserves zero-usage members and unavailable
counters. Missing values render as a dash/No data, and shorter measurement
windows are labeled Partial period. Coverage reports members with complete
counters for the selected period. Combined counters may overlap and are not
presented as a count of unique items.

Member controls include name/ID search, sorting by every supported counter,
ascending/descending order, activity/confirmed-zero/missing-counter filters,
and 25-member pages. Unknown values sort last. Search and filtering leave
faction-wide summaries unchanged, which is explained in the summary.

The former Needs attention panel is now Most recorded activity. The former
Trends panel is a collapsed Category totals section; it does not claim to
measure change over time. Refresh errors persist through rerenders, and the
refresh button stays disabled during the current request.

PDA layout follows docs/Torn-PDA-userscript-reference.md: bounded rendered
member lists, responsive cards, 44px controls and 16px mobile inputs. No new
storage keys, backend integrations, or automatic API requests were added.

Verification: test/browser/consumables-ui.cjs renders the actual native
Consumables functions and CSS in isolated headless Brave with synthetic data.
It exercises sorting, missing/zero data, partial windows, persistent refresh
errors, pagination and 1920x1080, 390x844, 430x932, 844x390 layouts. This is
browser verification with fixtures, not a live Google Sheet or native PDA test.
The test closes its browser in finally.
