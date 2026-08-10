/**
 * Stellar-ecosystem dependency extraction — the dependency-graph leg of the
 * repo-intel arc. Pure, offline, same idiom as code-symbols.ts.
 *
 * Forward read: a repo row lists WHICH ecosystem packages it builds on
 * (`stellarDeps: ["@stellar/stellar-sdk", "passkey-kit"]`) — the stack is
 * legible without opening manifests. Reverse read (the graph): search matches
 * deps, so "passkey-kit" surfaces its DEPENDENTS — adoption evidence for
 * ecosystem tooling that no README mention can fake.
 *
 * Precision rules:
 *  - ALLOWLIST only — matched names are stored verbatim; lodash noise never
 *    enters. Extend the list as the ecosystem grows (names, not guesses).
 *  - Manifests only (Cargo.toml dependency sections + package.json dep maps) —
 *    an import in a comment or README is not a dependency.
 *  - Unparseable manifests contribute nothing (never error a scan).
 *
 * ponytail: Cargo.toml + package.json only — go.mod/pubspec/pyproject deps
 * wait until a consumer asks for those ecosystems.
 */

export interface DepBlob {
	path: string;
	text: string | null;
}

/** npm scopes whose every package is Stellar-ecosystem by construction. */
const NPM_SCOPE_PREFIXES = [
	"@stellar/",
	"@creit.tech/",
	"@creit-tech/",
	"@blend-capital/",
	"@soroswap/",
	"@phoenix-protocol/",
	"@script3/",
	"@reflector-network/",
	"@defindex/",
	"@x402/",
	"@sorobanbyexample/",
	"@colibri/",
	"@stellar-indexer/",
];

/** Exact npm package names outside those scopes. */
const NPM_EXACT = new Set([
	"stellar-sdk",
	"stellar-base",
	"soroban-client",
	"passkey-kit",
	"passkey-kit-sdk",
	"stellar-wallets-kit",
	"stellar-hd-wallet",
	"sorosan-sdk",
	"mercury-sdk",
	"as-soroban-sdk",
]);

/** Cargo crate names (exact or prefix) that are Stellar-ecosystem. */
const CARGO_EXACT = new Set([
	"soroban-sdk",
	"soroban-token-sdk",
	"soroban-fixed-point-math",
	"soroban-decimal",
	"blend-contract-sdk",
	"sep-40-oracle",
	"sep-41-token",
	"stellar-xdr",
	"stellar-strkey",
	"stellar-baselib",
]);
const CARGO_PREFIXES = ["soroban-env-", "soroban-spec", "stellar-contract-"];

const MAX_DEPS = 24;

const matchNpm = (name: string): boolean =>
	NPM_EXACT.has(name) || NPM_SCOPE_PREFIXES.some((p) => name.startsWith(p));

const matchCargo = (name: string): boolean =>
	CARGO_EXACT.has(name) || CARGO_PREFIXES.some((p) => name.startsWith(p));

/** Extract the Stellar-ecosystem dependency set from fetched manifest blobs. */
export function extractStellarDeps(blobs: DepBlob[]): string[] {
	const out = new Set<string>();
	for (const b of blobs) {
		if (!b.text) continue;
		const base = b.path.split("/").pop()?.toLowerCase();
		if (base === "package.json") {
			try {
				const pkg = JSON.parse(b.text) as Record<
					string,
					Record<string, unknown> | unknown
				>;
				for (const key of [
					"dependencies",
					"devDependencies",
					"peerDependencies",
				]) {
					const deps = pkg[key];
					if (deps && typeof deps === "object")
						for (const name of Object.keys(deps))
							if (matchNpm(name)) out.add(name);
				}
			} catch {
				/* unparseable manifest contributes nothing */
			}
		} else if (base === "cargo.toml") {
			// Dependency names appear as `name = ...`, `name.workspace = true`, or
			// section headers `[dependencies.name]` — collect all three forms and
			// filter through the allowlist (never guess from section context).
			for (const m of b.text.matchAll(
				/^\s*([a-zA-Z0-9_-]+)\s*(?:=|\.\s*workspace)/gm,
			)) {
				if (matchCargo(m[1])) out.add(m[1]);
			}
			for (const m of b.text.matchAll(
				/^\s*\[(?:workspace\.)?(?:dev-)?dependencies\.([a-zA-Z0-9_-]+)\]/gm,
			)) {
				if (matchCargo(m[1])) out.add(m[1]);
			}
		}
	}
	return [...out].sort().slice(0, MAX_DEPS);
}
