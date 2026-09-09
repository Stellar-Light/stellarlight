/**
 * Reconcile every tracked RWA issuer against its OWN stellar.toml — live.
 *
 * sls-083: Etherfuse's toml declared nine assets under its issuer account
 * and the registry held five; nothing said the list was partial. The unit
 * test pins the committed coverage table (RWA_ISSUER_COVERAGE) to the
 * registry, but a toml is the issuer's document and it moves without us.
 * This re-reads each toml and reports, per tracked issuer account:
 *
 *   declared-but-untracked   the issuer declares a (code, issuer) that is not
 *                            a registry row → add it after verification
 *   table-stale              the toml's declared set differs from the
 *                            committed coverage entry → update the table
 *   could-not-check          the toml did not answer (DNS/403/timeout/5xx)
 *                            → NOT "nothing declared"; reported apart
 *
 *   untabled                 a classic registry issuer with NO coverage entry
 *                            (on-chain-only: toml unreadable on the day it was
 *                            verified) whose home-domain toml now ANSWERS →
 *                            it needs a coverage entry; until then its
 *                            completeness is unknown, not green
 *
 *   deployer-drift           a Soroban entity's deployer account has created a
 *                            SEP-41 token contract that is neither a registry
 *                            row nor excluded with a reason (Horizon history,
 *                            ids from the envelope preimage, interface from
 *                            stellar.expert) → verify, then add a row or exclude
 *
 * Exit 1 on any of the five. A could-not-check is a red on purpose: an
 * unread toml cannot be reported as reconciled (a 4xx is a red, not a skip).
 * An on-chain-only issuer whose toml still does not answer is reported as
 * information, not a red — that is the state the registry already admits.
 *
 *   npx tsx scripts/data/reconcile-rwa-issuers.ts
 */
import {
	Account,
	Contract,
	hash,
	Networks,
	rpc,
	StrKey,
	TransactionBuilder,
	xdr,
} from "@stellar/stellar-sdk";
import {
	RWA_DEPLOYER_COVERAGE,
	RWA_ISSUER_COVERAGE,
	RWA_REGISTRY,
} from "../../src/data/rwa-registry";

const UA = {
	"User-Agent": "stellarlight-rwa-reconcile (+https://stellarlight.xyz)",
};

function parseCurrencies(
	toml: string,
): Array<{ code: string; issuer: string }> {
	const out: Array<{ code: string; issuer: string }> = [];
	// TOML strings may be double- or single-quoted; SEP-1 tomls in the wild use
	// both. A quote style this regex misses would read as "declares nothing".
	const str = (key: string, block: string) =>
		block.match(new RegExp(`^\\s*${key}\\s*=\\s*(?:"([^"]+)"|'([^']+)')`, "m"));
	for (const block of toml.split(/\[\[CURRENCIES\]\]/).slice(1)) {
		const c = str("code", block);
		const i = str("issuer", block);
		const code = c?.[1] ?? c?.[2];
		const issuer = i?.[1] ?? i?.[2];
		if (code && issuer) out.push({ code, issuer });
	}
	return out;
}

async function readToml(url: string): Promise<string | null> {
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const res = await fetch(url, {
				headers: UA,
				redirect: "follow",
				signal: AbortSignal.timeout(20_000),
			});
			if (res.ok) return await res.text();
			if (res.status >= 400 && res.status < 500 && res.status !== 429)
				return null; // a definite refusal; retrying will not change it
		} catch {
			/* retry */
		}
		await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
	}
	return null;
}

/**
 * Is this contract a token? Three sources, none sufficient alone:
 * stellar.expert's `features` tag ("sep41") is a fast positive but has false
 * negatives (Spiko's fund tokens carry no tag); a wasm hash changes on upgrade
 * and platforms build each token separately; a single RPC probe reads a
 * throttled response as "not a token". So: tag → token; otherwise probe
 * symbol() and decimals() over RPC with backoff and keep the three outcomes
 * apart — both answer → token; a host error saying the function is missing →
 * not-token; transport errors after retries → unknown (could-not-check).
 */
const RPC = new rpc.Server("https://mainnet.sorobanrpc.com");
const PROBE_SOURCE = new Account(
	"GBYIQXBKEB655EB3WTRITS6RR5GXEP6SQRBLPREZHNFYKT7WBMTMPR3H",
	"0",
);
async function probe(
	id: string,
	fn: string,
): Promise<"ok" | "missing" | "unknown"> {
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const tx = new TransactionBuilder(PROBE_SOURCE, {
				fee: "100",
				networkPassphrase: Networks.PUBLIC,
			})
				.addOperation(new Contract(id).call(fn))
				.setTimeout(30)
				.build();
			const sim = await RPC.simulateTransaction(tx);
			if (rpc.Api.isSimulationSuccess(sim) && sim.result) return "ok";
			const err = String((sim as { error?: string }).error ?? "");
			if (
				/MissingValue|not found|does not exist|no such|UnexpectedType|InvalidAction/i.test(
					err,
				)
			)
				return "missing";
		} catch {
			/* transport — retry */
		}
		await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
	}
	return "unknown";
}
async function classifyToken(
	id: string,
): Promise<"token" | "not-token" | "unknown"> {
	let tagged = false;
	try {
		const r = await fetch(
			`https://api.stellar.expert/explorer/public/contract/${id}`,
			{
				headers: UA,
				signal: AbortSignal.timeout(20_000),
			},
		);
		if (r.ok)
			tagged = (
				((await r.json()) as { features?: string[] }).features ?? []
			).includes("sep41");
	} catch {
		/* the tag is only a fast positive; fall through to the probe */
	}
	if (tagged) return "token";
	const sym = await probe(id, "symbol");
	if (sym === "unknown") return "unknown";
	if (sym === "missing") return "not-token";
	const dec = await probe(id, "decimals");
	if (dec === "unknown") return "unknown";
	return dec === "ok" ? "token" : "not-token";
}

async function main() {
	const ids = new Set(RWA_REGISTRY.map((r) => r.id));
	const byUrl = new Map<string, typeof RWA_ISSUER_COVERAGE>();
	for (const c of RWA_ISSUER_COVERAGE)
		byUrl.set(c.tomlUrl, [...(byUrl.get(c.tomlUrl) ?? []), c]);

	const untracked: string[] = [];
	const stale: string[] = [];
	const unreadable: string[] = [];
	const untabled: string[] = [];
	const stillDark: string[] = [];
	let read = 0;

	for (const [url, entries] of byUrl) {
		const body = await readToml(url);
		if (body === null) {
			unreadable.push(url);
			continue;
		}
		read++;
		const declared = parseCurrencies(body);
		for (const c of entries) {
			const live = declared
				.filter((d) => d.issuer === c.issuer)
				.map((d) => d.code);
			for (const code of live)
				if (!ids.has(`${code}-${c.issuer}`))
					untracked.push(
						`${code}-${c.issuer} (${c.issuerEntity ?? "?"}, ${url})`,
					);
			const a = [...new Set(live)].sort().join(",");
			const b = [...new Set(c.declared)].sort().join(",");
			if (a !== b)
				stale.push(
					`${c.issuerEntity ?? c.issuer}: toml declares [${a}] but the table says [${b}]`,
				);
		}
	}

	// The issuers OUTSIDE the table: every classic registry issuer with no
	// coverage entry. If its home-domain toml answers today, the registry can
	// no longer claim not to know what it declares.
	const tabled = new Set(RWA_ISSUER_COVERAGE.map((c) => c.issuer));
	const outside = [
		...new Set(
			RWA_REGISTRY.filter(
				(r) => r.kind === "classic" && r.issuer && !tabled.has(r.issuer),
			).map((r) => r.issuer as string),
		),
	];
	for (const issuer of outside) {
		let home: string | null = null;
		try {
			const acct = (await (
				await fetch(`https://horizon.stellar.org/accounts/${issuer}`, {
					headers: UA,
					signal: AbortSignal.timeout(20_000),
				})
			).json()) as { home_domain?: string };
			home = acct.home_domain ?? null;
		} catch {
			/* Horizon hiccup: treated as still dark below */
		}
		const url = home ? `https://${home}/.well-known/stellar.toml` : null;
		const body = url ? await readToml(url) : null;
		if (body === null) {
			stillDark.push(`${issuer} (${home ?? "no home_domain"})`);
			continue;
		}
		const live = parseCurrencies(body).filter((d) => d.issuer === issuer);
		untabled.push(
			`${issuer} → ${url} answers and declares [${live.map((d) => d.code).join(",")}] under this account: add an RWA_ISSUER_COVERAGE entry (and rows for any code not tracked)`,
		);
	}

	// Soroban entities: re-read each deployer's create-contract history,
	// derive every contract id it created, and classify each as a token with
	// classifyToken() (tag fast-path, then a trinary RPC probe) — not by wasm
	// hash (contracts get upgraded; platforms deploy each token with its own
	// build), not by the tag alone (Spiko's tokens carry none), and not by a
	// single probe (a throttled probe would read as "not a token"). Rule: every SEP-41 contract the deployer created is
	// a registry row OR explicitly excluded with a reason. A contract whose
	// interface could not be read is could-not-check, never "not a token".
	const deployerDrift: string[] = [];
	const netId = hash(Buffer.from(Networks.PUBLIC));
	for (const c of RWA_DEPLOYER_COVERAGE) {
		const created: string[] = [];
		try {
			type Op = { type: string; function?: string; transaction_hash: string };
			let url: string | null =
				`https://horizon.stellar.org/accounts/${c.deployer}/operations?limit=200&order=asc&include_failed=false`;
			const ops: Op[] = [];
			while (url) {
				const j = (await (
					await fetch(url, { headers: UA, signal: AbortSignal.timeout(30_000) })
				).json()) as {
					_embedded?: { records?: Op[] };
					_links?: { next?: { href?: string } };
				};
				const recs = j._embedded?.records ?? [];
				ops.push(...recs);
				url = recs.length === 200 ? (j._links?.next?.href ?? null) : null;
			}
			for (const op of ops) {
				if (
					op.type !== "invoke_host_function" ||
					!/CreateContract/.test(op.function ?? "")
				)
					continue;
				const tx = (await (
					await fetch(
						`https://horizon.stellar.org/transactions/${op.transaction_hash}`,
						{ headers: UA, signal: AbortSignal.timeout(30_000) },
					)
				).json()) as { envelope_xdr: string };
				const env = xdr.TransactionEnvelope.fromXDR(tx.envelope_xdr, "base64");
				const inner =
					env.switch().name === "envelopeTypeTxFeeBump"
						? env.feeBump().tx().innerTx().v1().tx()
						: env.v1().tx();
				for (const o of inner.operations()) {
					if (o.body().switch().name !== "invokeHostFunction") continue;
					const hf = o.body().invokeHostFunctionOp().hostFunction();
					const cc =
						hf.switch().name === "hostFunctionTypeCreateContractV2"
							? hf.createContractV2()
							: hf.switch().name === "hostFunctionTypeCreateContract"
								? hf.createContract()
								: null;
					if (!cc) continue;
					const pre = cc.contractIdPreimage();
					if (pre.switch().name !== "contractIdPreimageFromAddress") continue;
					const fa = pre.fromAddress();
					const preimage = xdr.HashIdPreimage.envelopeTypeContractId(
						new xdr.HashIdPreimageContractId({
							networkId: netId,
							contractIdPreimage:
								xdr.ContractIdPreimage.contractIdPreimageFromAddress(
									new xdr.ContractIdPreimageFromAddress({
										address: fa.address(),
										salt: fa.salt(),
									}),
								),
						}),
					);
					created.push(StrKey.encodeContract(hash(preimage.toXDR())));
				}
			}
		} catch (e) {
			unreadable.push(
				`deployer history for ${c.issuerEntity} (${c.deployer}): ${String((e as Error).message).slice(0, 80)}`,
			);
			continue;
		}
		const excluded = new Set(c.excluded.map((e) => e.contract));
		const tokens: string[] = [];
		for (const id of [...new Set(created)]) {
			const kind = await classifyToken(id);
			if (kind === "unknown") {
				unreadable.push(
					`${c.issuerEntity}: interface of ${id} could not be read — not classified (never 'not a token')`,
				);
				continue;
			}
			if (kind === "token") tokens.push(id);
		}
		for (const id of tokens) {
			if (!ids.has(id) && !excluded.has(id))
				deployerDrift.push(
					`${c.issuerEntity}: SEP-41 contract ${id} created by ${c.deployer} is neither a registry row nor excluded`,
				);
			if (!c.declared.includes(id))
				stale.push(
					`${c.issuerEntity}: deployer created SEP-41 contract ${id} but RWA_DEPLOYER_COVERAGE.declared does not list it`,
				);
		}
		for (const id of c.declared)
			if (!tokens.includes(id))
				stale.push(
					`${c.issuerEntity}: table declares ${id} but the deployer history / interface read does not show it as a SEP-41 token`,
				);
	}

	console.log(
		`tomls: ${byUrl.size} · read: ${read} · could-not-check: ${unreadable.length} · issuers in table: ${RWA_ISSUER_COVERAGE.length} · outside the table: ${outside.length} (still dark ${stillDark.length}, now answering ${untabled.length}) · deployers: ${RWA_DEPLOYER_COVERAGE.length}`,
	);
	const line = (label: string, xs: string[]) => {
		if (!xs.length) return;
		console.log(`\n${label} (${xs.length}):`);
		for (const x of xs) console.log(`  ${x}`);
	};
	line(
		"DECLARED BUT UNTRACKED — verify on Horizon, then add a registry row",
		untracked,
	);
	line("TABLE STALE — RWA_ISSUER_COVERAGE no longer matches the toml", stale);
	line("COULD NOT CHECK — not reconciled, not 'nothing declared'", unreadable);
	line(
		"UNTABLED — an on-chain-only issuer's toml now answers; reconcile it",
		untabled,
	);
	line(
		"DEPLOYER DRIFT — a Soroban entity deployed a token contract the registry lacks",
		deployerDrift,
	);
	if (stillDark.length)
		console.log(
			`\ninfo: ${stillDark.length} on-chain-only issuer(s) still serve no readable toml (unchanged; their completeness stays unknown)`,
		);
	const red =
		untracked.length +
		stale.length +
		unreadable.length +
		untabled.length +
		deployerDrift.length;
	console.log(
		red
			? `\n✗ ${red} finding(s)`
			: `\n✓ every tracked issuer's toml matches the registry and the table`,
	);
	process.exit(red ? 1 : 0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
