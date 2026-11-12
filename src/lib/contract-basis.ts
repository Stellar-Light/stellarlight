/**
 * Whose contract is a repo's mainnetContractId? The stored basis, and the one
 * rule every reader applies to it. Dependency-free so API routes can import
 * it without the Stellar SDK the scanner's evidence readers need.
 *
 *   self-validated  the WASM's SEP-55 source_repo names this repo, and this
 *                   repo holds a GitHub build attestation for the WASM.
 *   source-matched  this repo's own #[contractimpl] source defines at least
 *                   half of the functions the deployed WASM exports (all of
 *                   them when it exports fewer than four).
 *   sibling-matched a repo under the same GitHub owner that this repo points
 *                   to (the WASM's SEP-55 source_repo, a git submodule, or a
 *                   README link) defines at least half of them: a team's
 *                   frontend or SDK repo whose contract lives next door.
 *   cited           the README names the contract, but neither this repo
 *                   nor a sibling it points to defines it: usually a
 *                   contract the repo calls.
 *   published       not judged under the source rule: stored before spec
 *                   1.9.135 and not yet rescanned, or a scan could not
 *                   decide: the source is pointed to in a same-owner repo
 *                   or submodule it could not read, or the contract's trait
 *                   impls take the trait's default functions, so its source
 *                   names fewer than it exports. Served as it was before.
 * Measured 2026-11-11 over the 135 registry rows: 125 were published, and a
 * README cites contracts it uses as often as ones it deployed (Reflector's
 * connector held the SushiSwap factory, lumenmap held Soroswap's).
 */
export const CONTRACT_BASES = [
	"self-validated",
	"source-matched",
	"sibling-matched",
	"cited",
	"published",
] as const;
export type ContractBasis = (typeof CONTRACT_BASES)[number];

/** Is the id served as this repo's own deployment? Yes unless the source
 * rule judged it cited. self-validated, source-matched and sibling-matched
 * are judged the repo's own; published and a basis never recorded (null) are
 * not judged yet and are served as they were until a rescan judges them, so
 * the rule moves each row once, with evidence, and never all at once on
 * deploy. */
export function isOwnContract(basis: unknown): boolean {
	return basis !== "cited";
}
