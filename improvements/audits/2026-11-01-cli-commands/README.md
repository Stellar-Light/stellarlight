# locateSource: a stellar-cli command checked against the commands tree (2026-11-01)

From an outside review of `src/lib/source-locator.ts` (lead G4b in
`../../rounds/2026-10-31-post-event-audit.md`): the command parser took the
first run of words after a CLI mention, in English order, so "which
stellar-cli file implements the keys generate command" read `file
implements`, "the stellar CLI extend a contract's TTL" read `extend
contract`, and "stellar contracts invoke" read `contracts invoke`. None
names a module, so the command was dropped.

## The change

`parseQuery` takes an optional commands tree (`cliCommandPaths`, read off
the index's own paths under `cmd/soroban-cli/src/commands/`: two segments or
more). With it, after an alias that names the CLI ("the stellar CLI",
"stellar-cli"), every run of words within 10 tokens is tried, stemmed on
both sides, and a two-word run also reversed; the first that names a module
stellar-cli has is the command, in the module's own words. A bare lowercase
"stellar" keeps the old in-order reading: the review of the first version
found that, read loosely after it, prose about the network ("the stellar
asset contract", "stellar contracts read events") lifted the CLI router over
the answer (clawback in the asset contract fell from 1 to 5, contract
events from 6 to 15). A test now holds those five phrasings to main's parse. Without a tree, or when no run names a module, the old reading
stands. The route reads the tree once per instance for 10 minutes (a
`distinct` over the index, failure tolerant); the battery harness reads it
off its rows. "Stellar" capitalized, as the network's name, is not the
binary, as before.

## Criteria, set before the replay

(a) no case in any frozen set moves down at file or symbol level; (b) the
CLI-class dev cases d13 and d14 reach the top 3 at file level; (c) the
priority battery's code questions are reported, not tuned on. The criteria
were set in the session before the change ran; they were not committed
first.

## Results (`scripts/source-locator-battery.ts --tarballs`, the nine repos at the refs the sets pin)

| set | base file top 1/3/10 | change | base symbol top 1/3/10 | change |
| --- | --- | --- | --- | --- |
| dev-set (14) | 8/10/13 | 10/12/14 | 6/8/12 | 6/9/14 |
| dev-heldout (6) | 3/4/6 | 3/4/6 | 2/3/5 | 2/3/5 |
| dev-set-a1 | 2/2/2 | 2/2/2 | 0/1/2 | 0/1/2 |
| dev-heldout-a1 | 2/2/2 | 2/2/2 | 1/2/2 | 1/2/2 |
| battery (20) | 18/20/20 | 18/20/20 | 15/19/20 | 15/19/20 |
| fresh-battery (20) | 11/14/17 | 11/14/17 | 8/9/12 | 8/9/12 |

- (a) met: no case moves down in any set. Only d13 (file 77 to 1, symbol
  none to 2) and d14 (file 5 to 1, symbol none to 5) move.
- (b) met. Both were in the dev set the reviewer quoted, so they are not
  held-out evidence.
- (c) the priority check is unchanged (3 strict, 8 of 12 required): its
  code questions write "Stellar" as the network's name, and hm26-cc-06's
  asset-deploy module stays out of reach for that reason.

Base runs use origin/main's harness and locator; change runs use this
branch (the narrowed rule; the first version scored the same on these sets,
which is why the review's prose probes are pinned in a test). Result files: `base-*.json`, `change-*.json`, `*-priority.txt`.
