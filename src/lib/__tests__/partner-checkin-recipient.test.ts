import { describe, expect, it } from "vitest";
import { checkinRecipient } from "../partner-invite";

// The quarterly check-in must reach a real mailbox: the login email once a
// partner has claimed the account, else the listing's public contact, and
// never the curated+slug placeholder that curated accounts sign in through.
describe("checkinRecipient", () => {
	it("prefers a real login email", () => {
		expect(
			checkinRecipient({
				email: "ops@etherfuse.com",
				contactEmail: "hello@etherfuse.com",
			}),
		).toBe("ops@etherfuse.com");
	});
	it("falls back to the listing contact when the login is the placeholder", () => {
		expect(
			checkinRecipient({
				email: "curated+etherfuse@stellarlight.xyz",
				contactEmail: " hello@etherfuse.com ",
			}),
		).toBe("hello@etherfuse.com");
	});
	it("returns null when neither is a real address", () => {
		expect(
			checkinRecipient({
				email: "curated+x@stellarlight.xyz",
				contactEmail: "",
			}),
		).toBeNull();
		expect(
			checkinRecipient({ email: null, contactEmail: "not an email" }),
		).toBeNull();
		expect(checkinRecipient({})).toBeNull();
	});
});
