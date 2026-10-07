/** Re-judge every stored mainnetContractId against ownership evidence.
 *
 * The scanner used to accept any address stellar.expert could resolve, which
 * proves the contract exists and nothing about whose it is. Measured over the
 * 137 live rows on 2026-09-03: 19 were shared token contracts (XLM/USDC/BLND),
 * 8 were contracts stellar.expert independently attributes to a different repo
 * (Reflector, Blend, Tansu), 4 were provably the repo's own, and the rest had
 * no evidence either way — all published under a signal named
 * "verified-contract-id".
 *
 * fetch-repo-code.ts now applies the two provable exclusions at scan time, but
 * that only governs FUTURE scans. This repairs what is already stored.
 *
 *   clear  — provably not this repo's (SAC, or validated against another repo)
 *   self-validated / published — kept, with the basis recorded
 *   skip   — stellar.expert would not answer. Could-not-look is not a verdict:
 *            these rows are left exactly as they are and counted separately.
 *
 * Dry-run by default; --execute writes.
 */
import "./load-env";
import { getPayload } from "payload";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const SE = "https://api.stellar.expert/explorer/public/contract";

type Verdict =
	| { kind: "clear"; why: string }
	| { kind: "keep"; basis: "self-validated" | "published" }
	| { kind: "skip"; why: string };

/** One id, with backoff. 429/5xx is could-not-check, never a negative. */
async function judge(id: string, repo: string): Promise<Verdict> {
	for (let attempt = 0; attempt < 4; attempt++) {
		let res: Response;
		try {
			res = await fetch(`${SE}/${id}`, {
				headers: { "user-agent": "sl-contract-basis-backfill" },
			});
		} catch (e) {
			return { kind: "skip", why: `transport: ${(e as Error).message}` };
		}
		if (res.status === 429 || res.status >= 500) {
			await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
			continue;
		}
		if (res.status === 404)
			return { kind: "skip", why: "404 — not resolvable now; left alone" };
		if (!res.ok) return { kind: "skip", why: `HTTP ${res.status}` };
		const j = (await res.json()) as {
			contract?: string;
			asset?: string;
			validation?: { repository?: string };
		};
		if (j.contract !== id) return { kind: "skip", why: "id mismatch" };
		if (j.asset)
			return { kind: "clear", why: `Stellar Asset Contract (${j.asset})` };
		const v = j.validation?.repository;
		if (v) {
			const named = v
				.replace(/\.git$/, "")
				.replace(/\/+$/, "")
				.split("/")
				.slice(-2)
				.join("/")
				.toLowerCase();
			return named === repo.toLowerCase()
				? { kind: "keep", basis: "self-validated" }
				: { kind: "clear", why: `validated against ${named}` };
		}
		return { kind: "keep", basis: "published" };
	}
	return { kind: "skip", why: "rate-limited after 4 attempts" };
}

(async () => {
	const payload = await getPayload({ config: await configPromise });
	const res = await payload.find({
		collection: "repos",
		where: { mainnetContractId: { exists: true } },
		limit: 1000,
		depth: 0,
		select: { fullName: true, mainnetContractId: true },
	});
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	const docs = (res.docs as any[]).filter((d) => d.mainnetContractId);
	console.log(
		`${docs.length} rows carry a contract id — ${EXECUTE ? "EXECUTING" : "dry run"}\n`,
	);

	const tally = { cleared: 0, self: 0, published: 0, skipped: 0 };
	for (const d of docs) {
		const repo = String(d.fullName ?? "");
		const id = String(d.mainnetContractId);
		const v = await judge(id, repo);
		if (v.kind === "skip") {
			tally.skipped++;
			console.log(`  SKIP  ${repo} — ${v.why}`);
		} else if (v.kind === "clear") {
			tally.cleared++;
			console.log(`  CLEAR ${repo} — ${v.why}`);
			if (EXECUTE)
				await payload.update({
					collection: "repos",
					id: d.id,
					data: { mainnetContractId: null, mainnetContractBasis: null },
					context: { internal: true },
				});
		} else {
			v.basis === "self-validated" ? tally.self++ : tally.published++;
			if (EXECUTE)
				await payload.update({
					collection: "repos",
					id: d.id,
					data: { mainnetContractBasis: v.basis },
					context: { internal: true },
				});
		}
		await new Promise((r) => setTimeout(r, 350));
	}
	console.log(
		`\ncleared ${tally.cleared} | self-validated ${tally.self} | published ${tally.published} | could-not-check ${tally.skipped}`,
	);
	// A run that could not look at most of the set proves nothing about the set.
	if (tally.skipped > docs.length / 2) {
		console.error(
			`FAILED TO LOOK at ${tally.skipped}/${docs.length} rows — do not read this run as a clean bill of health.`,
		);
		process.exit(2);
	}
	process.exit(0);
})();
