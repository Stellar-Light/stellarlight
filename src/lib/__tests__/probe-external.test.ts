/**
 * probeExternal — "could not verify" must never read as "does not exist".
 *
 * Pins the three shipped instances of the bug (improvements/lessons class 32):
 *  - self-audit's npm check called a published version MISSING on a registry
 *    504 (2026-07-23: api-client@1.5.0/@1.5.1 reported absent, both served 200
 *    seconds later);
 *  - report-liveness counted 5xx, timeouts, EAI_AGAIN and invalid TLS certs as
 *    positive evidence a project was DEAD;
 *  - check-links treated bot walls correctly but never retried a 5xx.
 *
 * The asymmetry these tests defend: `absent` is a FINDING and must stay rare
 * and provable (404/410, or a host that does not resolve / refuses); everything
 * else is `unverifiable` and must never fail a gate.
 */
import { describe, expect, it, vi } from "vitest";
import {
	classifyExternalError,
	classifyExternalStatus,
	probeExternal,
} from "../probe-external";

const noSleep = async () => {};
/** A fetch that returns the given statuses in order, one per call. */
const statusSeq = (...codes: number[]) => {
	let i = 0;
	return vi.fn(async () => new Response("", { status: codes[i++] ?? 500 }));
};

describe("classifyExternalStatus", () => {
	it("treats only 404/410 as absence", () => {
		expect(classifyExternalStatus(404)).toBe("absent");
		expect(classifyExternalStatus(410)).toBe("absent");
	});

	it("never calls a server error absence (the npm-504 regression)", () => {
		for (const s of [500, 502, 503, 504, 520]) {
			expect(classifyExternalStatus(s)).toBe("unverifiable");
		}
	});

	it("treats bot walls as unverifiable, not absent", () => {
		for (const s of [401, 403, 429, 999]) {
			expect(classifyExternalStatus(s)).toBe("unverifiable");
		}
	});

	it("treats 2xx and redirects as present — moved is not missing", () => {
		expect(classifyExternalStatus(200)).toBe("present");
		expect(classifyExternalStatus(204)).toBe("present");
		expect(classifyExternalStatus(301)).toBe("present");
		expect(classifyExternalStatus(308)).toBe("present");
	});

	it("does not accuse on 4xx we may have caused", () => {
		for (const s of [400, 405, 408, 451]) {
			expect(classifyExternalStatus(s)).toBe("unverifiable");
		}
	});
});

describe("classifyExternalError", () => {
	it("counts an unresolvable or refusing host as absent", () => {
		expect(
			classifyExternalError(new Error("getaddrinfo ENOTFOUND x.dead")),
		).toMatchObject({ verdict: "absent" });
		expect(
			classifyExternalError(new Error("connect ECONNREFUSED 1.2.3.4:443")),
		).toMatchObject({ verdict: "absent" });
	});

	it("does NOT count a temporary resolver failure as absent", () => {
		// EAI_AGAIN is the single most commonly misread code — report-liveness
		// grouped it with ENOTFOUND under "DNS/TLS failure" → dead.
		expect(
			classifyExternalError(new Error("getaddrinfo EAI_AGAIN x.io")),
		).toMatchObject({ verdict: "unverifiable" });
	});

	it("does NOT count a timeout or a bad certificate as absent", () => {
		const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
		expect(classifyExternalError(abort)).toMatchObject({
			verdict: "unverifiable",
			detail: "timeout",
		});
		// A cert error proves a server IS there, presenting a bad cert.
		expect(
			classifyExternalError(new Error("unable to verify certificate")),
		).toMatchObject({ verdict: "unverifiable" });
	});
});

describe("probeExternal", () => {
	it("retries an unverifiable result once and takes the second answer", async () => {
		const fetchImpl = statusSeq(504, 200); // the exact npm-504 sequence
		const r = await probeExternal("https://registry.example/pkg/1.5.0", {
			fetchImpl: fetchImpl as unknown as typeof fetch,
			sleepImpl: noSleep,
		});
		expect(r).toMatchObject({ verdict: "present", status: 200, attempts: 2 });
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("reports unverifiable — not absent — when both attempts fail", async () => {
		const fetchImpl = statusSeq(504, 503);
		const r = await probeExternal("https://registry.example/pkg/1.5.0", {
			fetchImpl: fetchImpl as unknown as typeof fetch,
			sleepImpl: noSleep,
		});
		expect(r.verdict).toBe("unverifiable");
		expect(r.attempts).toBe(2);
	});

	it("does not retry a stable answer", async () => {
		for (const [code, verdict] of [
			[404, "absent"],
			[200, "present"],
		] as const) {
			const fetchImpl = statusSeq(code, 200);
			const r = await probeExternal("https://x.example", {
				fetchImpl: fetchImpl as unknown as typeof fetch,
				sleepImpl: noSleep,
			});
			expect(r).toMatchObject({ verdict, attempts: 1 });
			expect(fetchImpl).toHaveBeenCalledTimes(1);
		}
	});

	it("classifies a thrown network error and still retries once", async () => {
		const fetchImpl = vi
			.fn()
			.mockRejectedValueOnce(new Error("getaddrinfo EAI_AGAIN x.io"))
			.mockResolvedValueOnce(new Response("", { status: 200 }));
		const r = await probeExternal("https://x.io", {
			fetchImpl: fetchImpl as unknown as typeof fetch,
			sleepImpl: noSleep,
		});
		expect(r).toMatchObject({ verdict: "present", attempts: 2 });
	});

	it("honours retry:false", async () => {
		const fetchImpl = statusSeq(503, 200);
		const r = await probeExternal("https://x.example", {
			retry: false,
			fetchImpl: fetchImpl as unknown as typeof fetch,
			sleepImpl: noSleep,
		});
		expect(r).toMatchObject({ verdict: "unverifiable", attempts: 1 });
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});
});
