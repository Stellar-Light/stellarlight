# Skill-mirror freshness guard

**Projects from:** lessons class 12 (verify-before-advertise). **Status: proposed.**

**What:** a self-audit check that the public Stellar-Light/stellar-scout mirror serves the SAME skill content as `public/skills/stellar-scout.md` (hash compare via raw.githubusercontent), filing an issue on drift.

**Why:** the mirror sync runs on a PAT that isn't wired (task open since June); until it is — and even after — a stale mirror is an advertised artifact that doesn't match reality: Tyler's Raven pins our skill by commit and re-reviews on drift, so silent staleness = his agents running an old contract.

**How:** ~15 lines in scripts/self-audit.ts, same pattern as the advertised-versions check.
