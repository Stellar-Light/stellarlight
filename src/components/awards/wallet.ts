/**
 * i³ Awards — thin client-side wrapper around @creit.tech/stellar-wallets-kit.
 *
 * The kit is browser-only (preact web components, wallet extensions), so it
 * is ONLY ever loaded through dynamic import() from user gestures — never
 * at module scope — keeping /awards SSR-safe and the kit out of the page's
 * initial JS. We use our own on-brand wallet picker UI instead of the
 * kit's built-in modal, so only the SDK core + the three wallet modules
 * (Freighter, xBull, Albedo) are pulled in.
 *
 * Network is pinned to TESTNET here as well — the wallet prompt itself
 * tells the voter they're signing a testnet transaction.
 */

export type AwardsWalletId = "freighter" | "xbull" | "albedo";

export const AWARDS_WALLETS: Array<{
	id: AwardsWalletId;
	name: string;
	hint: string;
	/** Self-hosted brand logo (public/wallets/*.png, from the wallet kit's
	 *  official icons) — kept local so the picker doesn't depend on an
	 *  external host at connect time. */
	icon: string;
}> = [
	{
		id: "freighter",
		name: "Freighter",
		hint: "Browser extension",
		icon: "/wallets/freighter.png",
	},
	{
		id: "xbull",
		name: "xBull",
		hint: "Extension / mobile",
		icon: "/wallets/xbull.png",
	},
	{
		id: "albedo",
		name: "Albedo",
		hint: "Web — no install needed",
		icon: "/wallets/albedo.png",
	},
];

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

// biome-ignore lint/suspicious/noExplicitAny: kit types resolved at dynamic-import time
let kitPromise: Promise<any> | null = null;
let moduleIds: Record<AwardsWalletId, string> | null = null;

async function getKit() {
	if (!kitPromise) {
		kitPromise = (async () => {
			const [sdk, freighter, xbull, albedo, types] = await Promise.all([
				import("@creit.tech/stellar-wallets-kit/sdk"),
				import("@creit.tech/stellar-wallets-kit/modules/freighter"),
				import("@creit.tech/stellar-wallets-kit/modules/xbull"),
				import("@creit.tech/stellar-wallets-kit/modules/albedo"),
				import("@creit.tech/stellar-wallets-kit/types"),
			]);
			moduleIds = {
				freighter: freighter.FREIGHTER_ID,
				xbull: xbull.XBULL_ID,
				albedo: albedo.ALBEDO_ID,
			};
			sdk.StellarWalletsKit.init({
				modules: [
					new freighter.FreighterModule(),
					new xbull.xBullModule(),
					new albedo.AlbedoModule(),
				],
				network: types.Networks.TESTNET,
			});
			return sdk.StellarWalletsKit;
		})();
	}
	return kitPromise;
}

/** Connect a wallet and return the voter's public address. */
export async function connectAwardsWallet(
	walletId: AwardsWalletId,
): Promise<string> {
	const kit = await getKit();
	if (!moduleIds) throw new Error("wallet kit failed to initialize");
	kit.setWallet(moduleIds[walletId]);
	const { address } = await kit.fetchAddress();
	if (!address) throw new Error("wallet returned no address");
	return address;
}

/** Sign the unsigned ballot XDR with the connected wallet (testnet). */
export async function signAwardsBallot(
	xdr: string,
	address: string,
): Promise<string> {
	const kit = await getKit();
	const { signedTxXdr } = await kit.signTransaction(xdr, {
		address,
		networkPassphrase: TESTNET_PASSPHRASE,
	});
	if (!signedTxXdr) throw new Error("wallet returned no signed transaction");
	return signedTxXdr;
}

export async function disconnectAwardsWallet(): Promise<void> {
	if (!kitPromise) return;
	try {
		const kit = await getKit();
		await kit.disconnect();
	} catch {
		/* disconnect is best-effort */
	}
}

/** Human-readable message out of the kit's error shapes. */
export function walletErrorMessage(err: unknown): string {
	if (typeof err === "object" && err !== null) {
		const anyErr = err as { message?: unknown; code?: unknown };
		if (typeof anyErr.message === "string" && anyErr.message.trim()) {
			return anyErr.message;
		}
	}
	if (err instanceof Error) return err.message;
	return "The wallet did not complete the request.";
}
