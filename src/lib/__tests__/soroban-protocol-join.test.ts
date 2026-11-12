/** protocolForSdkMajor — the sdk⇄protocol leg of the CAP join. Pins the
 * documented irregularities so table edits can't silently break the join. */
import { describe, expect, it } from "vitest";
import { parseSdkMajor, protocolForSdkMajor } from "../soroban-versions";

describe("protocolForSdkMajor", () => {
	it("maps the regular majors", () => {
		expect(protocolForSdkMajor(20)).toBe(20);
		expect(protocolForSdkMajor(22)).toBe(22);
		expect(protocolForSdkMajor(26)).toBe(26);
		expect(protocolForSdkMajor(27)).toBe(27);
		// rs-soroban-sdk v28.0.0 release notes: "a release supporting Protocol
		// 28"; v29.0.0 moves to soroban-env 29, Protocol 29's host environment.
		expect(protocolForSdkMajor(28)).toBe(28);
		expect(protocolForSdkMajor(29)).toBe(29);
	});

	it("pins the Whisk irregularity: sdk 23.x targets protocol 24", () => {
		expect(protocolForSdkMajor(23)).toBe(24);
	});

	it("0.x preview line maps to the protocol 20 launch", () => {
		expect(protocolForSdkMajor(parseSdkMajor("0.9.4"))).toBe(20);
	});

	it("unknown majors and null are null — never guessed", () => {
		expect(protocolForSdkMajor(99)).toBeNull();
		expect(protocolForSdkMajor(null)).toBeNull();
		expect(protocolForSdkMajor(parseSdkMajor(null))).toBeNull();
	});
});
