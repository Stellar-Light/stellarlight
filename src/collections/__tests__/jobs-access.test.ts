// @vitest-environment node
import type { PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";

// Read the config as written (see access.test.ts). The jobs collection is
// built by Payload from jobsCollectionOverrides, and the jobs REST endpoint
// (/api/payload-jobs/run) checks jobs.access.run, which defaults to "any
// logged-in user": partners included.
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	buildConfig: (c: unknown) => c,
}));

type Rule = (args: { req: PayloadRequest }) => unknown;
type JobsConfig = {
	access?: Record<string, Rule>;
	jobsCollectionOverrides: (a: {
		defaultJobsCollection: { admin: Record<string, unknown> };
	}) => { access: Record<string, Rule> };
};
const config = (await import("@/payload.config")).default as unknown as {
	jobs: JobsConfig;
};

const partner = { collection: "partner-accounts", id: "p1" };
const admin = { collection: "users", id: "a1" };
const as = (fn: Rule | undefined, user: unknown) =>
	fn?.({ req: { user } as unknown as PayloadRequest });

const jobs = config.jobs.jobsCollectionOverrides({
	defaultJobsCollection: { admin: {} },
});

describe("payload-jobs access", () => {
	for (const op of ["read", "delete"]) {
		it(`${op}: denies a partner and nobody, allows an admin`, async () => {
			expect(await as(jobs.access[op], partner)).toBe(false);
			expect(await as(jobs.access[op], null)).toBe(false);
			expect(await as(jobs.access[op], admin)).toBe(true);
		});
	}

	it("create and update stay closed to everyone", async () => {
		for (const op of ["create", "update"])
			expect(await as(jobs.access[op], admin)).toBe(false);
	});

	for (const op of ["run", "queue", "cancel"]) {
		it(`jobs.access.${op}: denies a partner, allows an admin`, async () => {
			const rule = config.jobs.access?.[op];
			expect(typeof rule).toBe("function");
			expect(await as(rule, partner)).toBe(false);
			expect(await as(rule, admin)).toBe(true);
		});
	}
});
