/** Seed / reset a DEDICATED TEST partner account so login can be verified
 * end-to-end WITHOUT Resend — the password path works today.
 *
 *   pnpm exec tsx scripts/data/seed-test-partner.ts
 *   TEST_PARTNER_PASSWORD=whatever pnpm exec tsx scripts/data/seed-test-partner.ts
 *
 * Idempotent: creates the account if missing, otherwise just resets its
 * password. Kept as status "draft" ON PURPOSE — a draft is invisible in the
 * public directory and the /api/partners contract (published-only), but the
 * OWNER can still log in and see the full dashboard (own-record read access).
 * So this proves the login + dashboard flow live without putting a fake
 * company in front of anyone.
 *
 * Hook-safe: create never fires the invite hook; the reset is an update that
 * changes neither status nor email, so no invite/sign-in email is sent (no
 * Resend dependency).
 *
 * The magic-link (passwordless) path is separate — it needs RESEND_API_KEY set
 * in Vercel to actually deliver the email; verify that once the key is in.
 */
import { randomBytes } from "node:crypto";
import { getPayload } from "payload";
import configPromise from "../../src/payload.config";

const EMAIL = process.env.TEST_PARTNER_EMAIL || "partner-test@stellarlight.xyz";
const PASSWORD = process.env.TEST_PARTNER_PASSWORD || genPassword();
const SLUG = "test-partner";

/** Readable-but-strong throwaway password (no ambiguous chars). */
function genPassword(): string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
	const bytes = randomBytes(16);
	let out = "";
	for (let i = 0; i < 16; i++) out += alphabet[bytes[i] % alphabet.length];
	return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12)}`;
}

async function main() {
	const payload = await getPayload({ config: await configPromise });

	const existing = await payload.find({
		collection: "partner-accounts",
		where: { email: { equals: EMAIL } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});

	// Fields that make the dashboard look real when the tester logs in.
	const profile = {
		name: "Test Partner (Stellar Light)",
		slug: SLUG,
		partnerType: "other" as const,
		tagline: "A sandbox partner account for verifying login + the dashboard.",
		description:
			"This is a test account. It stays in draft so it never appears in the public directory, but you can log in with it to exercise the whole partner portal.",
		websiteUrl: "https://stellarlight.xyz",
		acceptingClients: true,
		status: "draft" as const,
	};

	if (existing.docs[0]) {
		const id = existing.docs[0].id;
		await payload.update({
			collection: "partner-accounts",
			id,
			data: { password: PASSWORD },
			overrideAccess: true,
		});
		console.log(`Reset password on existing test account (${id}).`);
	} else {
		const created = await payload.create({
			collection: "partner-accounts",
			data: { ...profile, email: EMAIL, password: PASSWORD },
			overrideAccess: true,
		});
		console.log(`Created test account (${created.id}).`);
	}

	// In CI (GitHub Actions) NEVER let the generated password land in the public
	// run log — a repo collaborator could read it. `::add-mask::` makes the runner
	// redact it everywhere after. Locally it prints normally so you can grab it.
	if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${PASSWORD}`);
	console.log("\n──────── TEST LOGIN (password path — works today) ────────");
	console.log(`  URL:      https://stellarlight.xyz/partners/dashboard`);
	console.log(`  Email:    ${EMAIL}`);
	console.log(`  Password: ${PASSWORD}`);
	console.log("  Status:   draft (hidden from the public directory)");
	console.log("──────────────────────────────────────────────────────────");
	console.log(
		"\nLog in there, toggle 'Have a password?', and you should land on the dashboard.",
	);
	process.exit(0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
