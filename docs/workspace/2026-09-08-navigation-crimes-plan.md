# Crimes and navigation refinement

## Design

Keep the classic shell, existing theme tokens and saved internal tab IDs. Organize by task, not data source. A cosmetic-only pass leaves finance unreachable; merging all related workflows into Crimes would overload it. Restore Finance and add short purpose descriptions/cross-links instead.

Main navigation: Dashboard (triage), Crimes (staff/run/review OCs), People (member assignments, availability and CPR), Finance (OC earnings/payouts/costs/exports), Armory (stock/loans/activity), Consumables (period usage), War (battle planning and war reports).

Crimes: Fill slots, Active OCs, History & performance. Put current-workload metrics above the subviews so switching from assignment to active operations retains context. Distinguish OC outcomes from Finance's completed-OC accounting records. Add links to blockers and loans without copying those worklists into Crimes. Use compact section introductions and existing blue/neutral semantic tokens; no extra fonts, images, API calls or animation.

## Implementation and checks

1. Exercise production navigation in a local browser fixture; verify Finance can open and keyboard navigation triggers lazy feature loading. Observe failures first.
2. Restore Finance and migrate old money/profit/finance preferences to it. Add task descriptions and Crimes cross-links. Keep internal IDs and renderers intact.
3. Apply scoped Crimes spacing, section hierarchy, mobile touch targets and shared workload metrics. Preserve existing collapse/assignment handlers.
4. Test main tabs and all static subviews, saved preferences, cross-links, lazy-loader keyboard activation and overflow at 1920x1080, 390x844, 430x932, 844x390. Review screenshots. Run syntax and existing regressions.
5. Record audit decisions for dynamic Armory/War subviews and any unverified live behavior. Close only fixture browsers.

Standing user authorization permits implementation without another design-approval cycle. No original script edits, live faction writes, or authenticated browser connection are included.
