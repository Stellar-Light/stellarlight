import base from "../../../vitest.config.mts";

// The replay lives with its evidence, outside the main suite's include glob.
// Spread, not mergeConfig: mergeConfig concatenates include arrays.
export default {
	...base,
	test: {
		...base.test,
		environment: "node",
		include: ["improvements/audits/2026-10-23-event-pages/replay.test.ts"],
		testTimeout: 600_000,
	},
};
