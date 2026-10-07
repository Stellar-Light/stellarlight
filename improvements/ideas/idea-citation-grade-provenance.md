# Idea: citation-grade provenance on every served fact

**Shipped** (verified in code 2026-08-13): all three slices exist — scf.{basis,asOf,sourceUrl} written by enrich-from-scf and served as scfBasis/scfAsOf/scfSourceUrl; repos codeVerified.scannedRef (write-shape → /api/repos/explain, field-population-guarded); partners tomlSourceUrl/tomlFetchedAt. The confidence scores (openapi@1.8.49) consume exactly these trios.

Projects from: SYNTHESIS-2026-08-12 (institutional trajectory) + the
sls-024 pattern that already works.

A memory-carrying agent (Raven's per-user memory) and any institutional
consumer need to STORE our claims and later defend or re-verify them. That
requires each fact to carry the sls-024 triple: **basis** (how we know:
human-verified > official-record > source-inherited > derived >
unverified), **asOf** (when it was last true), **sourceUrl** (where to
re-verify). Today only lifecycle status has all three.

Extend, in value order:
1. **SCF awards** — per-round official page URL (we already parse the
   page; the URL is in hand at write time) + award basis. The 18-row
   poison incident is the argument: a consumer holding `award r41 $100k`
   with a sourceUrl could have caught the lie themselves.
2. **Repo code facts** — scannedAt exists; add the commit SHA scanned (we
   fetch the tree at a ref already) so codeVerified claims pin to a
   commit, not a repo.
3. **Partners/anchors** — stellar.toml-derived fields carry the toml URL
   + fetch date.

Serve as one uniform optional shape (`provenance: {basis, asOf, sourceUrl}`)
documented once in the spec; spectral-lint that new served objects carry
it. This is also the INPUT to confidence scores (#87): confidence is a
function of basis + freshness + cross-check agreement, so provenance ships
first.

Effort: medium (schema + writers + spec, no new infra). Value: the single
biggest step toward "institution-grade" and the prerequisite for #87.
