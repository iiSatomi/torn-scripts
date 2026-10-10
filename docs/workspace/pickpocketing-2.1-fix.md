# Pickpocket Helper 2.1

Fixes minimizing/restoring the helper being mistaken for a crime attempt.

Cause: the document capture listener matched any button containing "pickpocket", including "Pickpocket Helper". The row finder then climbed to a shared ancestor and selected an unrelated target.

Fix: ignore helper-owned controls, require the exact Pickpocket action label (optional nerve cost), and verify that the button and title independently resolve to the same single target card. Existing history is preserved; potentially false older entries are not automatically deleted because they cannot be identified reliably.

Verified with 36 source-backed tests, a new desktop/three-mobile-size browser regression covering repeated minimize/restore plus a real simulated pending attempt, and read-only signed-in Torn layout/menu checks at all four sizes. No real crime actions are used by the regression.

Install the 2.1 distribution as a replacement for 2.0, then reload Torn. Keep only one version enabled.
