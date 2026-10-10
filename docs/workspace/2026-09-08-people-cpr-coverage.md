# People CPR coverage

The old view constructed crime rows exclusively from TornStats records. It omitted roster members with no imported record and historical-only members. Record-count thresholds also described fewer than five records as unusable regardless of exact-role coverage.

The replacement shows the full current roster for each known crime, one selected crime table at a time. Exact-role sources are current active slot, then TornStats, then locally available completed OC history. Numbered role labels normalize together. Unknown values remain missing, valid zero stays zero, and TornStats archive backfills without an execution timestamp are not historical observations. Completed OCs are excluded from the Live map. Recommendation algorithms retain their existing source-selection behavior; this change corrects the People coverage display.

TornStats official API documentation: https://www.tornstats.com/api — faction/cpr returns a member map; no pagination is documented. The client does not impose a 22-member cap. Server-side availability or sharing may explain missing imported records, but the actual account response has not been inspected. No extra per-member API calls were added. Refresh imports through the existing Config Fetch CPR action.

The supplied console log contains unsupported Permissions-Policy feature warnings and blocked Torn telemetry. It contains no OC Suite or TornStats import failure. Do not disable browser protections based on those messages.

Verification: syntax check; focused 49-roster/22-import model fixture; local headless Brave fixture at 1920x1080, 390x844, 430x932 and 844x390; diagnostics, lifecycle, consumables, memory, classic UI, PDA storage and armory fetch regression tests passed. Dedicated fixture browser closed automatically. These are synthetic browser checks, not authenticated Torn integration or native PDA verification. Existing authenticated-browser access restriction remains unresolved.
