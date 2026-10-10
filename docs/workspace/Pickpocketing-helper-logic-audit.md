# Pickpocketing Helper 1.7 Logic Audit

Last reviewed: 2026-09-01

## Evidence boundaries

- **Official mechanics:** Torn states that target type, body type, current status, and Pickpocketing skill affect difficulty. All 22 target types are available from skill level 1. Smaller or distracted targets generally have better success rates.
- **Advisory policy:** Tier numbers and skill cutoffs are conservative community strategy. They are not Torn success probabilities, unlock levels, or real XP values.
- **Unmodeled risk:** The current response appears to contain a `muscular` field, but build/body must not upgrade a verdict unless live verification proves the value is stable and reliably associated with the rendered card.
- **Fallback:** Missing, non-string, or mark-incompatible status is `WAIT`; an unknown target is unresolved and never `GO`. Valid empty/status-less responses clear prior status data so stale advice cannot survive a refresh.

Primary sources:

- [Official Torn Pickpocketing wiki](https://wiki.torn.com/wiki/Pickpocketing)
- [Torn community guidance from Emforus](https://www.torn.com/forums.php?a=0&b=0&f=3&p=threads&t=16396820)
- [Torn community status/unique evidence](https://www.torn.com/forums.php?a=0&b=0&f=61&p=threads&t=16358433)
- [Workspace Torn PDA userscript reference](Torn-PDA-userscript-reference.md)

## Mark policy matrix

`Not yet observed` means the value still requires the bounded live-browser audit. The official-status column comes from the Torn wiki and is not a guarantee that the page currently emits the same exact icon spelling.

| Mark | Official difficulty | Official statuses | Live status icons | Advisory tier | Conservative rule |
| --- | --- | --- | --- | ---: | --- |
| Drunk man | Easier | stumbling, distracted | Not yet observed | 1 | Any known status is GO; missing is WAIT |
| Drunk woman | Easier | stumbling, distracted | Not yet observed | 1 | Any known status is GO; missing is WAIT |
| Elderly man | Easier | walking | Not yet observed | 1 | Any known status is GO; missing is WAIT |
| Elderly woman | Easier | walking | Not yet observed | 1 | Any known status is GO; missing is WAIT |
| Homeless person | Easier | begging, loitering | Not yet observed | 1 | Any known status is GO; missing is WAIT |
| Junkie | Easier | loitering, stumbling | Not yet observed | 1 | Any known status is GO; missing is WAIT |
| Young man | Less difficult | listening to music, on phone, walking | Not yet observed | 2 | Documented known statuses are GO |
| Young woman | Less difficult | distracted, listening to music, on phone, walking | Not yet observed | 2 | Documented known statuses are GO |
| Laborer | Moderately difficult | distracted, on phone, walking | Not yet observed | 2 | Attentive/running is WAIT; distracted/phone/walking is GO |
| Postal worker | Moderately difficult | walking, distracted | Not yet observed | 2 | Walking/distracted is GO |
| Student | Moderately difficult | music, phone, running, walking | Not yet observed | 2 | Running is WAIT; music/phone/walking is GO |
| Businessman | Moderately difficult | walking, on phone | Not yet observed | 3 | Walking/phone requires skill 65 |
| Businesswoman | Moderately difficult | walking, on phone | Not yet observed | 3 | Walking/phone requires skill 65 |
| Jogger | Moderately difficult | jogging, walking | Not yet observed | 3 | Walking requires skill 65; jogging is WAIT |
| Thug | Moderately difficult | running, walking; wiki unique text also says loitering | Not yet observed | 3 | Loitering requires skill 45; all other statuses WAIT |
| Classy lady | More difficult | walking, on phone | Not yet observed | 4 | Phone/distracted requires skill 40; walking is WAIT |
| Gang member | More difficult | loitering | Not yet observed | 4 | Loitering requires skill 65 |
| Rich kid | More difficult | phone, music, walking | Not yet observed | 4 | Phone/music requires skill 40; walking is WAIT |
| Sex worker | More difficult | distracted, phone, soliciting | Not yet observed | 4 | Distracted/phone requires 40; soliciting requires 45 |
| Cyclist | More difficult with severe critical-failure outcomes | cycling | Not yet observed | 5 | AVOID below skill 80; GO at 80+ |
| Mobster | Very difficult | walking | Not yet observed | 6 | AVOID below skill 100; CAUTION at 100+ |
| Police officer | Very difficult | walking, running | Not yet observed | 6 | AVOID below skill 100; CAUTION at 100+ |

## Known source discrepancy

The official wiki describes Thug as spawning while running or walking, but its unique-outcome text says the unique requires a loitering male Thug. The live audit must record the actual current status icons without guessing. Until then, the helper treats loitering as the only special Thug opportunity and does not promote running or walking.

## Live verification completed

- Torn's current Crimes route is `page.php?sid=crimes`; the retired `loader.php` route now returns an endpoint-removal error. The userscript metadata already covers the current route.
- Signed-in browser runs passed at 1920×1080 and PDA-sized 390×844. Across bounded runs, 2–12 current target cards were mapped one-for-one to helper badge groups with no script errors or extra Crimes requests.
- Exact live `crimeInfo.status.icon` values observed across the runs were `begging`, `cycling`, `distracted`, `loitering`, `music`, `phone`, `running`, and `walking`.
- `crimeInfo.muscular` was a **string**, not a boolean, in every sampled record. The helper deliberately does not use it to promote a verdict.
- The current skill control exposes `aria-label="Skill: 80.30"`; the parser's numeric-label contract remains valid.
- The nearest repeated-card selector worked on both live layouts. Ready-only filtering was exercised when non-GO cards were present and every filtered card computed to `display: none`.
- A single-target regression test confirms the stable Torn `virtual-item` boundary is hidden rather than an inner wrapper, preventing an empty virtualized row. Live geometry checks also require every metadata label to remain inside its card and clear of the next card and native controls.
- Steady-state repainting is driven by the live Crimes response and a MutationObserver scoped to Torn's current crime panel. The old permanent 1.5-second fallback poll was removed; only a bounded document-start retry remains until a DOM anchor exists.
- No duplicate `iconClass` value appeared in the sampled live responses. Response-order consumption for duplicates remains covered by the focused automated test, but a live duplicate has not yet been observed.
