// @vitest-environment node

/**
 * The relay account: one key we hold, every ballot written from it. It
 * serialises all voters through one sequence number across several app
 * instances, so a sequence conflict is the NORMAL case under load and must be
 * retried, while every other refusal must be reported.
 */
import { Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	AWARDS_NETWORK_PASSPHRASE,
	relayKeypair,
	submitFromRelay,
} from "../awards/stellar";

const relay = Keypair.random();
afterEach(() => {
	vi.unstubAllGlobals();
	delete process.env.AWARDS_RELAY_SECRET;
});

function fetchScript(
	script: Array<(url: string, init?: RequestInit) => Response | null>,
) {
	let i = 0;
	return vi.fn(async (url: string, init?: RequestInit) => {
		for (; i < script.length; i++) {
			const r = script[i](url, init);
			if (r) {
				i++;
				return r;
			}
		}
		throw new Error(`unexpected fetch: ${url}`);
	});
}
const account = (sequence: string) => (url: string) =>
	url.includes("/accounts/")
		? new Response(JSON.stringify({ sequence, data: {}, signers: [] }), {
				status: 200,
			})
		: null;
const submit =
	(body: object, status = 200) =>
	(url: string, init?: RequestInit) =>
		url.endsWith("/transactions") && init?.method === "POST"
			? new Response(JSON.stringify(body), { status })
			: null;
const build = (a: import("@stellar/stellar-sdk").Account) =>
	new TransactionBuilder(a, {
		fee: "10000",
		networkPassphrase: AWARDS_NETWORK_PASSPHRASE,
	})
		.addOperation(Operation.manageData({ name: "k", value: "v" }))
		.setTimeout(60)
		.build();

describe("submitFromRelay", () => {
	it("refuses, without touching the network, when no relay key is configured", async () => {
		expect(relayKeypair()).toBeNull();
		const f = vi.fn();
		vi.stubGlobal("fetch", f);
		const r = await submitFromRelay(build);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toMatch(/AWARDS_RELAY_SECRET/);
		expect(f).not.toHaveBeenCalled();
	});

	it("retries a sequence conflict with a fresh sequence, then succeeds", async () => {
		process.env.AWARDS_RELAY_SECRET = relay.secret();
		const f = fetchScript([
			account("100"),
			submit({ extras: { result_codes: { transaction: "tx_bad_seq" } } }, 400),
			account("101"),
			submit({ hash: "abc123" }),
		]);
		vi.stubGlobal("fetch", f);
		const r = await submitFromRelay(build);
		expect(r).toEqual({ ok: true, hash: "abc123", attempts: 2 });
		expect(f).toHaveBeenCalledTimes(4);
	});

	it("reports any other refusal immediately", async () => {
		process.env.AWARDS_RELAY_SECRET = relay.secret();
		const f = fetchScript([
			account("100"),
			submit(
				{
					extras: {
						result_codes: {
							transaction: "tx_failed",
							operations: ["op_underfunded"],
						},
					},
				},
				400,
			),
		]);
		vi.stubGlobal("fetch", f);
		const r = await submitFromRelay(build);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.resultCodes).toContain("op_underfunded");
		expect(f).toHaveBeenCalledTimes(2);
	});

	it("gives up after the configured attempts", async () => {
		process.env.AWARDS_RELAY_SECRET = relay.secret();
		const bad = submit(
			{ extras: { result_codes: { transaction: "tx_bad_seq" } } },
			400,
		);
		const f = fetchScript([account("1"), bad, account("2"), bad]);
		vi.stubGlobal("fetch", f);
		const r = await submitFromRelay(build, { attempts: 2 });
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.resultCodes).toContain("tx_bad_seq");
	});

	it("creates an unfunded relay via friendbot before the first attempt (testnet)", async () => {
		process.env.AWARDS_RELAY_SECRET = relay.secret();
		let created = false;
		const f = vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes("/accounts/"))
				return created
					? new Response(
							JSON.stringify({ sequence: "5", data: {}, signers: [] }),
							{ status: 200 },
						)
					: new Response("{}", { status: 404 });
			if (url.startsWith("https://friendbot.stellar.org")) {
				created = true;
				return new Response("{}", { status: 200 });
			}
			if (url.endsWith("/transactions") && init?.method === "POST")
				return new Response(JSON.stringify({ hash: "h" }), { status: 200 });
			throw new Error(`unexpected ${url}`);
		});
		vi.stubGlobal("fetch", f);
		const r = await submitFromRelay(build);
		expect(r.ok).toBe(true);
		expect(
			f.mock.calls.some(([u]) => String(u).startsWith("https://friendbot")),
		).toBe(true);
	});
});
