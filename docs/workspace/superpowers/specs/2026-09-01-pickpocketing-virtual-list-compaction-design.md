# Pickpocketing Virtual-List Compaction Design

Date: 2026-09-01

## Problem

The helper applies `display: none` to filtered target wrappers. Torn renders the
targets in a virtual list whose canvas retains a fixed height and whose visible
items retain translated positions. The filtered people disappear, but their
reserved virtual positions remain as large blank rows.

## Chosen approach

Compact Torn's existing virtual-list container only while at least one target is
filtered. The helper will add one owned class to the common target-list parent.
Within that class, only helper-recognized target wrappers will be returned to
normal document flow; filtered wrappers remain `display: none`. The container's
virtual height will be allowed to shrink to the consecutive visible rows.

This approach preserves Torn's real target elements, click handlers, status
timers, ordering, and accessibility. It avoids deleting React-owned nodes and
avoids rendering a duplicate list.

## Behavior

- With no active filtering, the helper removes its compaction class and Torn's
  original virtual positioning remains untouched.
- With tier or ready-only filtering active, visible targets stack consecutively
  with no blank reserved rows.
- If no targets match, the target area collapses rather than displaying a tall
  empty virtual canvas.
- Status refreshes, target replacement, filter changes, reset, route exit, and
  PDA tab suspension all remove or recompute script-owned compaction state.
- The helper will not write over Torn's inline styles. All overrides remain
  scoped beneath script-owned classes so cleanup is reversible.

## Compatibility and fallback

Compaction activates only when the recognized targets share a parent that looks
like the current list container. If Torn changes the structure and no safe
common parent can be identified, individual cards will still be hidden and the
helper will avoid restructuring an unrelated ancestor.

The same implementation applies to desktop and Torn PDA. It makes no network
requests and does not depend on PDA-specific storage or unsupported APIs.

## Verification

1. Add a browser fixture that reproduces Torn's fixed-height canvas and
   translated target wrappers.
2. Prove the current implementation leaves a large vertical gap after filtering.
3. Verify visible cards become consecutive after the fix and the list height
   matches its visible content.
4. Verify reset restores the original virtual positioning contract.
5. Re-run focused logic tests and responsive layouts at 1920x1080, 390x844,
   430x932, and 844x390.
6. Verify the filtered state visually on live signed-in Torn at desktop and PDA
   width, with no extra Torn requests and no console errors caused by the helper.

