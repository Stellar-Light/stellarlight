# The Creit router for the i³ round — evaluated, not recommended for this one

Tupui pointed at `Creit-Tech/Stellar-Router-Contract` as the way to collapse a
whole ballot into one signature if the i³ vote ran on Tansu. Read the contract,
the SDK and the repo health today. It is a good, honest little contract. It
also solves a problem our current design does not have.

## What it is

Thirty lines. `exec(caller, invocations)` loops `invoke_contract` over a list
and returns the results.

    pub fn exec(e, caller: Address, invocations: Vec<(Address, Symbol, Vec<Val>, bool)>) -> Vec<Val> {
        caller.require_auth();
        ...
    }

v0 is atomic. v1 adds a per-invocation `can_fail` so one call may fail without
taking the batch down. Each version is a separate immutable contract — they
never upgrade one in place, which is the right call for something this small.

The `caller.require_auth()` carries a comment explaining itself: it is there so
the auth tree is rooted at the router, which is exactly what lets one signature
cover every nested call. That confirms the correction already recorded in
[[project-tansu-i3-voting-fit]] — the router does not break `require_auth` for
Tansu's `vote()`, because `vote()` takes the voter as an argument.

## Why it exists, in the SDK's own words

> with soroban you are limited to a single operation per transaction but by
> using this router you can make multiple soroban calls at once

That is the whole motivation: **Soroban permits one contract invocation per
transaction.** The router buys back what classic Stellar gives for free.

## Why it buys us nothing today

Our i³ ballot is not Soroban. It writes `manageData` entries on the voter's own
account, and classic Stellar already allows up to 100 operations in a single
transaction. That is precisely why the ballot is already one signature, and has
been since the design was chosen — proven end to end on prod, real testnet tx
`b681b15a`.

So the router would be recreating, for Soroban, a capability we already use
directly. It is only interesting if the vote MOVES to Soroban — which in
practice means Tansu.

## If we did move to Tansu, what it would and would not fix

Buys:
- voter side: `add_member` + `vote`×N in one signature
- our side: N × `set_badges` in one maintainer transaction

Does not buy:
- `MAX_VOTES_PER_PROPOSAL = 40`. A Pilots-only round votes at ~33 on historical
  turnout — seven voters of headroom, and a well-attended awards round is
  exactly the scenario that eats it.
- Self-sovereign membership. `add_member` does `member_address.require_auth()`,
  so every voter enrols themselves before a badge can be granted. A roster is a
  reconciliation tool, never a whitelist.

Note the shape of that: the router's voter-side win exists **because** Tansu
requires enrolment. It is a fix for friction Tansu introduces, not an
improvement on what we have.

## Health signals

| | |
|---|---|
| repo | last pushed 2025-07-19, 3 stars |
| contracts | v0 mainnet-verified; v1 (the `can_fail` one) unverified on-chain |
| surface | ~30 lines, no storage of user state, no admin, no upgrade path |

Small and immutable is good. Unmaintained and unverified-for-the-version-you-
want is the part to weigh, and v1 is the version anyone would reach for.

## Recommendation

**Not for the round landing this week.** The nominees arrive in days, the
current path is proven on prod, and switching the voting substrate days before
a live round trades a working system for one whose cap has seven voters of
headroom and whose membership every Pilot has to self-enrol into.

Worth keeping for the round after, paired with a real answer on the 40-vote
cap. If we ever do move, use v0 unless `can_fail` is genuinely needed, since v0
is the verified one.
