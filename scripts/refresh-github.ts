import "dotenv/config";
import configPromise from "../src/payload.config";
import { getPayload } from "payload";

async function run() {
	const payload = await getPayload({
		config: configPromise,
	});

	const list = await payload.find({
		collection: "projects",
		limit: 500,
	});

	for (const p of list.docs) {
		try {
			const appUrl =
				process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
			await fetch(`${appUrl}/api/projects/${p.id}/github`);
			await new Promise((r) => setTimeout(r, 250));
		} catch {
			// ignore
		}
	}
}

run()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});

