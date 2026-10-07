# Idea: one shared identity module (kill the string-matching family)

Projects from: SYNTHESIS-2026-08-12 S2 — fifth-plus incident in the
identity family: case-variant twin repos (#783), Payload `contains`
substring trap, read-back keyed by URL-casing vs canonical rows, the
spaceless-substring SCF matcher (18 poisoned rows), canonical-vs-dupe
routing (band). Each writer reinvents matching; each reinvention
rediscovers a trap.

`src/lib/identity.ts`, one module, all writers import:
- `canon(name)` / `normSpaceless(name)` / `normSpaced(name)` — the three
  normalizations, named for what they're safe for (spaceless = equality
  ONLY, never containment).
- `titlePrefixMatch(title, name)` — the partial-match rule that survived
  the 2026-08-12 audit (prefix at token boundary), with the rejection
  logged.
- `findRowCaseInsensitive(collection, field, value)` + the canonical-key
  write-back rule (write and verify against the value STORED, never the
  iteration spelling).
- Dupe routing: given canonical/dupe pairs, resolve which row a write
  must land on (the band lesson: identity work isn't done until the write
  lands on the row the directory serves).

Unit tests carry every past trap as a fixture: Creit-Tech casing,
soro·band·issassembler, "Basilic — Stablecoin Rails" vs "Rails",
utkurock/Lusty read-back, warp-drive/warpdrive stemming, velo/velocity.
A conformance check (see idea-writer-conformance-guard) can then assert
writers use it instead of local regex.

Effort: medium (extraction + migration of 4-5 call sites). Value: the
family stops recurring; every future trap becomes one fixture instead of
one incident.
