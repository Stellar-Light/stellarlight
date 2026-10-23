import base from "../../../vitest.config.mts";

// The dry-run proof lives with its evidence, outside the main suite's
// include glob. Spread, not mergeConfig: mergeConfig concatenates arrays.
export default {
	...base,
	test: {
		...base.test,
		include: [
			"improvements/audits/2026-10-23-locate-ranking/builder-dry-run.test.ts",
		],
	},
};
