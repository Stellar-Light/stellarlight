# 2026-07-08 — The changelog advertised a package version that didn't exist

**Class:** 12 (verify-before-advertise)

## What happened

`/api/changelog` (deployed with the code change) named `scout-mcp@1.1.8` while the npm publish was still blocked on an expired token. For ~1 hour, an agent reading the changelog — the exact consumers it exists for — would `npm install` a 404. Second occurrence of the class (the first: npx install commands on the site before the npm org existed).

## Root cause

The changelog rides the code deploy; the package rides a separate, human-auth'd publish step. Nothing coupled "the changelog names version X" to "version X is installable." The existing verify-claims guard checks *site content* claims, not changelog-versions-vs-registry.

## The fix (mechanized)

Daily self-audit parses every `version` field in the live `/api/changelog` (scoped, short-name, and comma-separated formats; `openapi x.y.z` spec versions skipped) and asserts the npm registry serves each one. Failure auto-files an issue. Verified with a registry 404 probe on a phantom version.

## The transferable rule

Every surface that ADVERTISES an artifact needs a guard that the artifact WORKS — one per artifact type. Site claims → verify-claims; CLI commands → content-freshness; package versions → advertised-versions; spec ⊆ live → field-coverage. When a new artifact type appears, its guard ships with it.
