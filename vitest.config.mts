import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [tsconfigPaths(), react()],
	test: {
		environment: "jsdom",
		setupFiles: ["./vitest.setup.ts"],
		// .tsx included deliberately: component tests (the motion primitives'
		// reduced-motion behaviour) live next to their components, and a
		// .ts-only glob silently skipped them — a test that cannot run is
		// worse than no test, because it reads as covered.
		include: ["tests/int/**/*.int.spec.ts", "src/**/*.test.{ts,tsx}"],
	},
});
