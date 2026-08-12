# Re-scan on push (scan freshness)

**Projects from:** code-depth gist honest-gap 4. **Status: proposed.**

**What:** re-scan a repo's code signals when it actually changes, instead of waiting for the next wave — priority queue keyed on `lastCommitAt > codeScannedAt`, drained by the existing scan workflow on its budget.

**Why:** a repo that upgrades SDK 0.7→26 keeps its stale `versionStatus: deprecated` until a wave happens to reach it — the exact stale-advice class we guard against elsewhere, self-inflicted.

**How:** the wave selector already sorts by `-lastCommitAt`; add a `--stale-first` mode selecting `lastCommitAt > codeScannedAt` before unscanned repos, and schedule the existing workflow weekly with it.
