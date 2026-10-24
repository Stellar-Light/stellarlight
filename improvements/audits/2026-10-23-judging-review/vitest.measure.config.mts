import base from "../../../vitest.config.mts";

// The measurement lives with its evidence, outside the main suite's include
// glob, in Node (real network for the live GitHub read).
export default {
	...base,
	test: {
		...base.test,
		environment: "node",
		testTimeout: 180_000,
		include: [
			"improvements/audits/2026-10-23-judging-review/measure.test.ts",
			"improvements/audits/2026-10-23-judging-review/stored-replay.test.ts",
		],
	},
};
