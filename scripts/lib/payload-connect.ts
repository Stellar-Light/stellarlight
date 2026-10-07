/**
 * Connect to Payload, or exit INCONCLUSIVE.
 *
 * `@payloadcms/db-mongodb` calls `process.exit(1)` **directly** when it cannot
 * connect (see its connect.js: it logs "cannot connect to MongoDB" and exits).
 * It never throws, so a script's own `.catch` handler can never see it — which
 * means every database-backed guard exited 1 on an outage, and exit 1 is the
 * declared signal for "I looked and the data is wrong".
 *
 * An outage and a defect therefore produced the same red, chased the same way,
 * for a problem that is not in the data at all. Exit 2 is "I could not look",
 * which the rest of the guards already use.
 *
 * The exit is intercepted only for the duration of the connect, so a real
 * exit(1) from the guard's own logic afterwards still means what it says.
 */
import { getPayload as getPayloadReal } from "payload";

export async function getPayloadOrInconclusive(
	// biome-ignore lint/suspicious/noExplicitAny: payload's config type
	config: any,
	// biome-ignore lint/suspicious/noExplicitAny: payload instance
): Promise<any> {
	const realExit = process.exit.bind(process);
	let intercepted = false;
	// biome-ignore lint/suspicious/noExplicitAny: replacing a node builtin
	(process as any).exit = (code?: number) => {
		if (code === 1) {
			intercepted = true;
			console.error(
				"INCONCLUSIVE: could not reach the store — the database refused the connection (check DATABASE_URI). No verdict; this is not a data finding.",
			);
			return realExit(2);
		}
		return realExit(code);
	};
	try {
		return await getPayloadReal({ config });
	} finally {
		if (!intercepted) process.exit = realExit;
	}
}
