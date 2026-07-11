# Intent classes need a mechanism AND a standing eval (2026-07-11)

**What failed:** four query-intent classes silently inverted: "latest soroban release" served a Feb-2024 Protocol 20 section (evergreen docs never decay + "latest" treated as a keyword); "highest tvl" returned tvl=null rows (structured field unused); "blend vs yieldblox" dropped a subject (tiered token matching); "custody" matched "NON-custodial"/"self-custodial" (substring synonyms).

**The class:** keyword+evergreen defaults are *correct for topical queries and inverted for intent queries*. Every intent class (recency, superlative, comparison, negation) needs BOTH a ranking mechanism that consults the structured truth the query asks about AND a standing eval probe — no engine tested temporal intent, so the Protocol-20 failure survived three audits.

**Prevention shipped:** recency re-rank (dated freshness overrides evergreen, golden locks), tvl bypass+float, vs re-pin post-sort, (non|self)- negation guard; golden eval now runs weekly in engine-c-health.

**Two meta-lessons from the same day:**
1. *Generated evals can't see coverage holes.* R-SYM read 100% on 5 probes while real symbol queries failed — Engine A only probes what's indexed. Keep external-sample audits in the loop; a green generated eval is necessary, not sufficient.
2. *Fix waves create bug classes.* The dupe-merge wave created tombstones that served "Inactive" for live flagships; the shadow-fold fix then leaked Live rows into ?status=Inactive and made counts phantom. Every wave's next audit must probe the wave itself.
