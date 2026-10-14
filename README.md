# Torn Scripts

Userscripts and development material for Torn, maintained by iSatomi.

## Start here

- **Current OC Suite working copy:** [Torn_OC_Suite_Codex.user.js](Torn_OC_Suite_Codex.user.js)
- **Published Greasy Fork snapshots:** [scripts/published-greasyfork](scripts/published-greasyfork) and its [source manifest](scripts/published-greasyfork/sources.json). These files were downloaded from [iSatomi's Greasy Fork profile](https://greasyfork.org/en/users/1572664-isatomi) on 2026-10-10. They are snapshots, not the edit target.
- **Other local working scripts:** [repository root](.). These are local versions and may differ from Greasy Fork releases.
- **Historical versions and original OC Suite:** [scripts/reference](scripts/reference). The PurrfectCrime file is preserved as an original reference.
- **Backend examples:** [backend](backend). These are source files, not deployment credentials or a live service.
- **UI concepts:** [prototypes](prototypes).
- **Tests and development helpers:** [test](test), [tools](tools).
- **Older OC Suite 5.x prototype:** [legacy/oc-suite-v5](legacy/oc-suite-v5).
- **Design notes, PDA reference, and Torn scripting rules:** [docs/workspace](docs/workspace).

## Version and origin labels

The folder names are intentional. A file in `scripts/published-greasyfork` is an exact downloaded snapshot of the public listing recorded in `sources.json`. A file in the repository root is a local working copy. A file in `scripts/reference` is kept for comparison and should not be mistaken for the current release. The Greasy Fork OC Suite snapshot and the local Codex file currently differ; use the local Codex file for continued development.

## Working on the OC Suite

The active target is `Torn_OC_Suite_Codex.user.js`. Keep initial UI mount separate from API loading, preserve timer and observer cleanup, and test normal, SPA, and travelling routes. See [project guidance](docs/workspace/Torn-PDA-userscript-reference.md) and [Torn rules](docs/workspace/Torn-scripting-rules-and-API-ToS.md) before changing PDA behavior or network access.

Run syntax and focused tests with Node.js. Some browser tests require a local signed-in browser and are intentionally not included as recordings. Captured Torn pages, browser sessions, API keys, app configuration, and personal Obsidian/Claude memory are excluded from this repository.

## Licensing

The downloaded Greasy Fork scripts retain their own metadata and licenses. Some local files have different provenance; do not assume one repository-wide license covers them all.




## Managed Script Hub and War Payout Calculator

The Script Hub and standalone War Payout Calculator have independent automatic update feeds. Verified changes on `main` are built and checked by GitHub Actions before the generated scripts are published. See [automatic update setup](docs/managed-userscript-updates.md) for installation links, release rules, and secret checks.
