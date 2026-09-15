import { describe, expect, it } from "vitest";
import { poolWarning } from "../../../scripts/scan/scan-repo-code-pool";

/**
 * A capped fetch that silently truncates reads exactly like an exhausted
 * backlog. On 2026-09-15 TypeScript had 4,196 scanned rows against a 3,000-row
 * cap with no sort, so 1,196 rows could never be selected however stale they
 * were: stellar/js-xdr carried a 2026-08-14 scan against a 2026-08-31 push
 * through four consecutive waves, while the runs reported "no eligible repos".
 */
describe("the scanned-pool cap announces itself", () => {
	it("warns when the fetch came back full, because rows may be hidden", () => {
		const w = poolWarning(3000, 3000);
		expect(w).not.toBeNull();
		expect(w).toMatch(/cap/i);
		// it must say why the run's own "no eligible repos" line is untrustworthy
		expect(w).toMatch(/none in the window/i);
	});

	it("stays quiet when the whole population fit", () => {
		expect(poolWarning(2976, 3000)).toBeNull();
		expect(poolWarning(0, 3000)).toBeNull();
	});

	it("warns on an over-full fetch too, never only on exact equality", () => {
		expect(poolWarning(3001, 3000)).not.toBeNull();
	});
});
