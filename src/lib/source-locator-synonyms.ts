/**
 * locateSource's synonym map: crypto and auth words builders type, mapped to
 * the names Stellar's code uses for the same thing. Query side only (stored
 * pointers never change), and a word of q scores by its best form: itself
 * or one of these. Each entry carries the reason it holds; each has a test
 * in src/lib/__tests__/source-locator.test.ts, and a test fails if an entry
 * has none. Keep it short: an entry is here because the code never says the
 * builder's word, not to steer one question.
 */
export const SYNONYMS: ReadonlyMap<
	string,
	{ alts: readonly string[]; why: string }
> = new Map(
	Object.entries({
		passkey: {
			alts: ["secp256r1", "webauthn"],
			why: "Passkeys are WebAuthn credentials that sign with secp256r1 (P-256); Soroban verifies them with secp256r1_verify (protocol 21, CAP-0051).",
		},
		webauthn: {
			alts: ["secp256r1"],
			why: "WebAuthn signatures are secp256r1 ECDSA; the SDK and host name only the curve.",
		},
		p256: {
			alts: ["secp256r1"],
			why: "P-256 is the NIST name of secp256r1; no indexed symbol says p256.",
		},
		ecdsa: {
			alts: ["secp256k1", "secp256r1"],
			why: "Soroban's two ECDSA curves; the SDK's secp256k1_recover and secp256r1_verify never say ecdsa.",
		},
		ethereum: {
			alts: ["secp256k1", "keccak256", "eth"],
			why: "Ethereum signs with secp256k1 over keccak256 hashes; soroban-examples names its Ethereum ABI example eth_abi.",
		},
		keccak: {
			alts: ["keccak256"],
			why: "Soroban's Keccak hash is keccak256, one word to the index, which a six-letter word never matches.",
		},
		sep41: {
			alts: ["TokenInterface"],
			why: "SEP-41 is the token interface standard; soroban-sdk defines it as the TokenInterface trait.",
		},
		sep0041: {
			alts: ["TokenInterface"],
			why: "SEP-0041 is the padded spelling of SEP-41.",
		},
		sac: {
			alts: ["StellarAssetContract"],
			why: "SAC is the Stellar Asset Contract (CAP-0046-06), StellarAssetContract in the host.",
		},
		signature: {
			alts: ["sig"],
			why: "The host's verifiers abbreviate it: verify_sig_ed25519, verify_sig_ecdsa_secp256r1.",
		},
		bls: {
			alts: ["bls12", "bls12381"],
			why: "BLS12-381 is Soroban's only BLS curve (protocol 22, CAP-0059); the index splits it as bls12 or keeps bls12381.",
		},
	}),
);
