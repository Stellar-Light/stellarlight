# JS/TS symbol extraction (non-Rust code depth, step 1)

**Projects from:** lessons class 15 (structure ≠ semantics) + code-depth gist honest-gap 1 (depth is Rust-only). **Status: proposed.**

**What:** extend `code-symbols.ts` to JS/TS repos — exported function/class names from the package entrypoints the scanner already sees; later, "dapp depth" signals (real wallet integration vs boilerplate: which SDK calls appear — tx building, signing, SEP flows).

**Why:** ~1,900 of 2,400 indexed repos are non-Rust and carry a flat shallow score + no symbols; "find a passkey wallet integration example" has the same README-luck problem escrow had for Rust.

**How:** phase 1 = export-name regex extraction (cheap, same idiom); phase 2 = SDK-call fingerprinting (which @stellar/stellar-sdk APIs are invoked) as the dapp-depth analog of contract-macro facts.
