import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getAppUrl } from "../app-url";

type RelevantEnv = Pick<
	NodeJS.ProcessEnv,
	| "NEXT_PUBLIC_APP_URL"
	| "VERCEL"
	| "VERCEL_ENV"
	| "VERCEL_URL"
	| "VERCEL_PROJECT_PRODUCTION_URL"
>;

const ENV_KEYS: (keyof RelevantEnv)[] = [
	"NEXT_PUBLIC_APP_URL",
	"VERCEL",
	"VERCEL_ENV",
	"VERCEL_URL",
	"VERCEL_PROJECT_PRODUCTION_URL",
];

describe("getAppUrl", () => {
	const original: Partial<RelevantEnv> = {};

	beforeEach(() => {
		for (const key of ENV_KEYS) {
			original[key] = process.env[key];
			delete process.env[key];
		}
	});

	afterEach(() => {
		for (const key of ENV_KEYS) {
			if (original[key] === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = original[key];
			}
		}
	});

	it("returns an explicit non-localhost NEXT_PUBLIC_APP_URL", () => {
		process.env.NEXT_PUBLIC_APP_URL = "https://stellarlight.xyz";
		expect(getAppUrl()).toBe("https://stellarlight.xyz");
	});

	it("strips a trailing slash from NEXT_PUBLIC_APP_URL", () => {
		process.env.NEXT_PUBLIC_APP_URL = "https://stellarlight.xyz/";
		expect(getAppUrl()).toBe("https://stellarlight.xyz");
	});

	it("ignores localhost NEXT_PUBLIC_APP_URL on Vercel production", () => {
		process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
		process.env.VERCEL = "1";
		process.env.VERCEL_ENV = "production";
		process.env.VERCEL_PROJECT_PRODUCTION_URL = "stellarlight.xyz";
		process.env.VERCEL_URL = "stellarlight-abc123.vercel.app";
		expect(getAppUrl()).toBe("https://stellarlight.xyz");
	});

	it("ignores 127.0.0.1 NEXT_PUBLIC_APP_URL on Vercel production", () => {
		process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:3000";
		process.env.VERCEL = "1";
		process.env.VERCEL_ENV = "production";
		process.env.VERCEL_PROJECT_PRODUCTION_URL = "stellarlight.xyz";
		expect(getAppUrl()).toBe("https://stellarlight.xyz");
	});

	it("falls back to VERCEL_URL on Vercel preview deployments", () => {
		process.env.VERCEL = "1";
		process.env.VERCEL_ENV = "preview";
		process.env.VERCEL_URL = "stellarlight-git-feat-xyz.vercel.app";
		process.env.VERCEL_PROJECT_PRODUCTION_URL = "stellarlight.xyz";
		expect(getAppUrl()).toBe(
			"https://stellarlight-git-feat-xyz.vercel.app",
		);
	});

	it("falls back to VERCEL_PROJECT_PRODUCTION_URL if VERCEL_URL is missing", () => {
		process.env.VERCEL = "1";
		process.env.VERCEL_ENV = "preview";
		process.env.VERCEL_PROJECT_PRODUCTION_URL = "stellarlight.xyz";
		expect(getAppUrl()).toBe("https://stellarlight.xyz");
	});

	it("returns localhost in local dev when nothing is set", () => {
		expect(getAppUrl()).toBe("http://localhost:3000");
	});

	it("respects localhost NEXT_PUBLIC_APP_URL when not on Vercel", () => {
		process.env.NEXT_PUBLIC_APP_URL = "http://localhost:4000";
		expect(getAppUrl()).toBe("http://localhost:4000");
	});
});
