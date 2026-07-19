# On-chain metrics on project profiles (Q3 COMMITTED)

**Status: committed for Q3** (PG-award review response, 2026-07-19): profiles gain Soroban contract data, transaction volumes, and active-address counts — the deliverable conceded as not-met-as-written for Q2.

**How (candidate sources, verify before building):** SDF Hubble/BigQuery public datasets (aggregates), Horizon/RPC per-contract stats, stellar.expert contract APIs. Same provenance discipline as TVL: every number carries a source + asOf date; per-project mapping via the existing contract-address/codeVerified.mainnetContractId links. Weekly refresh Action; profile + API + spec + changelog in one contract bump.
