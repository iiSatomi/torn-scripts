# Codex diagnostics panel implementation plan

1. Add source-level contracts for the diagnostics model, redaction, and UI IDs.
2. Add a bounded request recorder and snapshot/report helpers.
3. Add the Config panel markup, styling, refresh action, and safe copy action.
4. Instrument the existing Torn and Usage Command request wrappers without
   changing their transport or error behavior.
5. Run static checks and existing regression tests.
6. Run the live browser smoke test, inspect the panel, and close browser
   processes before handoff.

