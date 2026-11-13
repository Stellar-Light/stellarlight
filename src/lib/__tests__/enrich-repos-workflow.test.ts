/**
 * enrich-repos.yml: the job that installs dependencies, reads third-party
 * repo data and holds DATABASE_URI can push nothing, and the one job that
 * can push installs and runs nothing from the repo. It commits the single
 * redirect file the enrich job hands it, with the retry that survives a
 * rejected first push.
 */
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

// biome-ignore lint/suspicious/noExplicitAny: workflow YAML
type Any = any;
const wf: Any = load(
	readFileSync(".github/workflows/enrich-repos.yml", "utf8"),
);
const enrich: Any = wf.jobs.enrich;
const record: Any = wf.jobs["record-redirects"];
const text = (x: unknown) => JSON.stringify(x);

describe("enrich-repos.yml", () => {
	it("gives the enrich job no write permission and no write token", () => {
		expect(wf.permissions).toEqual({ contents: "read" });
		// No job-level grant, so the read-only default applies.
		expect(enrich.permissions).toBeUndefined();
		const checkout = enrich.steps.find((s: Any) =>
			String(s.uses ?? "").startsWith("actions/checkout"),
		);
		expect(checkout.with["persist-credentials"]).toBe(false);
		// The only secrets in the job: the database, Payload and the job's
		// own read-only token. No step takes a token of its own.
		const secrets = new Set(
			[...text(enrich).matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]),
		);
		expect([...secrets].sort()).toEqual([
			"DATABASE_URI",
			"GITHUB_TOKEN",
			"PAYLOAD_SECRET",
		]);
		for (const s of enrich.steps) expect(s.with?.token).toBeUndefined();
		expect(text(enrich)).not.toMatch(/git push|git commit/);
	});

	it("hands the findings on as an artifact, not through the checkout", () => {
		const upload = enrich.steps.find((s: Any) =>
			String(s.uses ?? "").startsWith("actions/upload-artifact"),
		);
		expect(upload.with.path).toBe(
			"${{ runner.temp }}/repo-redirects-latest.json",
		);
		// A re-run attempt reuses the name.
		expect(upload.with.overwrite).toBe(true);
		expect(enrich.outputs.redirects).toBe(
			"${{ steps.redirects.outputs.wrote }}",
		);
	});

	it("the commit job may push but installs and runs nothing from the repo", () => {
		expect(record.permissions).toEqual({ contents: "write" });
		expect(record.needs).toBe("enrich");
		expect(record.if).toBe(
			"always() && github.ref == 'refs/heads/main' && needs.enrich.outputs.redirects == 'true'",
		);
		const uses = record.steps
			.map((s: Any) => s.uses)
			.filter(Boolean)
			.map((u: string) => u.split("@")[0]);
		expect(uses).toEqual(["actions/checkout", "actions/download-artifact"]);
		const runs = record.steps.map((s: Any) => s.run ?? "").join("\n");
		expect(runs).not.toMatch(/\b(pnpm|npm|npx|yarn|tsx|node)\b/);
		expect(runs).toContain(
			"git add improvements/audits/repo-redirects-latest.json",
		);
		expect(runs).toContain(
			"git pull --rebase --autostash -X theirs origin main || git rebase --abort",
		);
		expect(text(record)).not.toMatch(/secrets\./);
	});
});
