import base from "../../../vitest.config.mts";

// The sweep lives with its evidence, outside the main suite's include glob.
export default {
	...base,
	test: {
		...base.test,
		include: ["improvements/audits/2026-10-23-event-pages/page-sweep.test.tsx"],
		testTimeout: 600_000,
	},
};
