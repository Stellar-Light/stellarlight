# Generalized capability-mismatch sweep

**Projects from:** lessons class 14 (multi-product single-identity). **Status: proposed.**

**What:** generalize the dual-identity sweep (currently: ramp-capable partner whose project lacks the Anchor type) to more capability axes: partner sectors ⇄ project types (a partner selling wallet infra whose project is typed Payments only), stellar.toml-issued assets ⇄ Stablecoin/Asset type, bridges' supportedNetworks ⇄ Bridge type.

**Why:** raven#8's proposed fix explicitly asked for "audit for other multi-product projects"; the current sweep only covers the axis that already burned us. `audd` (Asset/Stablecoin, partner typed anchor) is the open candidate proving other axes exist.

**How:** table-drive the sweep in curate-projects.ts: each axis = (partner evidence predicate, implied project type). Report-only, feeding TYPES_ADD after owner review — same discipline as today.
