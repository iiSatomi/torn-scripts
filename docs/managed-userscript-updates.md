# Automatic updates: Script Hub and War Payout Calculator

Publication uses the explicit file allowlist in `tools/managed-publication-files.json`. Local keys, browser profiles, storage exports, captures, and archives are excluded. `node tools/check-managed-secrets.cjs` checks allowlisted source and generated output before builds and publication, blocking common credential literals and private keys. Diagnostics contain only file, line, and rule names; matched values are never printed. This supplements source review and cannot identify every possible secret format. Never put credentials or personal data in source files.

These two scripts have independent update feeds in `iiSatomi/torn-scripts`.

| Script | Install/update source | Release state |
| --- | --- | --- |
| Script Hub | [Install Hub](https://raw.githubusercontent.com/iiSatomi/torn-scripts/main/script-hub/dist/Torn_Script_Hub.user.js) | `script-hub/release.json` |
| War Payout Calculator | [Install payout calculator](https://raw.githubusercontent.com/iiSatomi/torn-scripts/main/Torn_War_Payout_Calculator.user.js) | `lib/war-payout-release.json` |

Install each updated script once, replacing its existing entry. Its metadata then
points to its own small `.meta.js` feed and full `.user.js` download. Existing
names, namespaces and saved-data keys are preserved. Avoid enabling duplicate
copies. Update-check timing and installation prompts are controlled by the
userscript manager or Torn PDA, not by a polling loop in the script.

## What publishes automatically

Changes committed to the GitHub `main` branch trigger
`.github/workflows/managed-userscripts.yml`. The workflow builds and verifies the
two scripts, then publishes only changed releases. A Hub-only payload change
increments the Hub's patch version; a payout-only change increments payout's
version. Changes to bundled shared code can update both. Tests/docs/build inputs
that do not alter an installable payload do not cause version churn.

Unchanged releases retain their versions. For a deliberate minor or major release,
increase the owning JSON file's `version`; the releaser honors higher versions
and refuses to go backwards. The recorded `releasedVersion` and payload hash are
maintained by the releaser. Builders and payout registration use the same version
source, so consumers see the distribution's actual release version.

This is the approved GitHub-commit workflow. Local file saves are not uploaded by
a watcher. After local development, sync the reviewed source changes to GitHub.
No Torn key, personal access token, browser profile or saved user data is needed
by release checks. GitHub Actions uses its built-in repository token.

## Verification and publication

```text
node tools/release-userscripts.cjs --prepare
node tools/release-userscripts.cjs --check
```

Preparation builds both distributions, plans independent versions, rebuilds, runs
managed syntax/Node/browser checks, and verifies a final rebuild. Failed checks
restore this operation's original generated files and release state; unrelated
source changes are preserved. Browser checks use synthetic Torn/API/native forms.
They perform no actual member payouts or authenticated Torn requests.

The managed checker includes shared Hub modules, thirteen self-contained Hub
test files, payout domain/API/cache/credit checks, release tests, Hub themes/UI-kit
browser checks and the full payout browser suite. Tests involving the ten other
local consumer working copies are separate; those distributions are outside
automatic publishing. Full local Hub verification remains available with
`node script-hub/tools/check.cjs --browser` in the complete workspace.

PR checks have read-only repository access. Publication runs only for this
repository's trusted `main` branch, after checks pass, and stages exactly:

```text
script-hub/release.json
script-hub/dist/Torn_Script_Hub.user.js
script-hub/dist/Torn_Script_Hub.meta.js
lib/war-payout-release.json
Torn_War_Payout_Calculator.user.js
Torn_War_Payout_Calculator.meta.js
```

Publication never force-pushes. Runs are serialized. If main advances during
checking, the newer main run handles publication. Every main push triggers a run,
including unrelated commits, so that race cannot strand a pending release.
The built-in token's release commit does not recursively trigger another push
workflow. A failure leaves the last public release available; inspect the
[Actions page](https://github.com/iiSatomi/torn-scripts/actions/workflows/managed-userscripts.yml)
and rerun after fixing it.

For local CI-equivalent browser checks, install the pinned private test package:
`npm ci --ignore-scripts --prefix tools/release-browser`, then install Chromium
with its Playwright CLI. Set `TORN_PLAYWRIGHT` to that package's absolute module
path and `TORN_BROWSER` to `chromium.executablePath()`, then run the preparation
command. Ordinary users need only the generated userscript; no runtime npm
package or remote `@require` is needed.

## Rollback

Revert the faulty source change in GitHub and let the same verified workflow
publish a new, higher patch version containing the restored behavior. Do not
decrease versions or change install URLs: installed managers need a newer version
to discover the rollback. If checks fail, fix the source before publishing.

References: [userscript update metadata](https://www.tampermonkey.net/documentation.php?q=update_url),
[GitHub workflow triggers](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow),
[Playwright CI](https://playwright.dev/docs/ci-intro).
