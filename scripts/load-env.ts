/**
 * Environment loader for `scripts/` — IMPORT THIS FIRST, before anything that
 * reaches Payload.
 *
 *   import "./load-env";              // scripts/*.ts
 *   import "../load-env";             // scripts/data/*.ts, scripts/eval/*.ts
 *
 * ## The bug this closes
 *
 * 29 scripts opened like this:
 *
 *   import { config as loadEnv } from "dotenv";
 *   loadEnv({ path: ".env.local" });        // ← runs THIRD
 *   import configPromise from "../src/payload.config";   // ← evaluates FIRST
 *
 * ESM hoists every `import` above module body statements, so `payload.config`
 * was evaluated before the env existed and every one of these died on
 * `missing secret key`. They worked in CI only because it injects env vars
 * directly, which is why the breakage stayed invisible: the scheduled runs were
 * green and only local debugging failed.
 *
 * The cost was real and repeated — it is why `check-links` could not be
 * exercised in #701, why the enrich read-back (#738) could not self-verify, and
 * it was filed as a process finding on 2026-07-23 before that.
 *
 * ## Why a side-effect import is the fix
 *
 * A bare `import "./load-env"` is itself hoisted, so it runs before the sibling
 * imports that need it — the ordering becomes a property of the module graph
 * rather than of statement order, which is what made the old form fragile.
 *
 * Biome's `organizeImports` is `on` in this repo and DOES sort imports, but it
 * treats a bare side-effect import as a barrier and will not move other imports
 * above it (verified against biome 2.3.2 with a module name that sorts last).
 * So the linter cannot silently reintroduce the bug.
 *
 * ## Semantics
 *
 * - Paths resolve from the REPO ROOT, not `process.cwd()`, so a script runs the
 *   same from anywhere.
 * - `.env.local` is loaded before `.env`, and dotenv does not overwrite a key
 *   that is already set, so precedence is: real environment > .env.local > .env.
 *   That matches Next.js and means CI-injected secrets always win.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Order matters: first loader to set a key wins (dotenv never overrides), so
// .env.local shadows .env — and anything already in process.env beats both.
for (const file of [".env.local", ".env"]) {
	const path = join(ROOT, file);
	if (existsSync(path)) loadEnv({ path });
}
