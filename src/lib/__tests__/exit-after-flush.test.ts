// @vitest-environment node
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const FIXTURE = resolve(
	process.cwd(),
	"src/lib/__tests__/fixtures/print-then-exit.ts",
);
const MODE = process.env.EXIT_FIXTURE_MODE ?? "flush";

/** Run the fixture into a reader process that waits a second before it
 * reads, the way a slow log collector drains a pipe. Holding the stream
 * inside this process would not do: Node keeps reading into its own buffer,
 * so the writer never sees a full pipe. */
function runWithSlowReader(mode: string): Promise<string> {
	const node = JSON.stringify(process.execPath);
	const reader = `${node} -e "setTimeout(() => process.stdin.pipe(process.stdout), 1000)"`;
	return new Promise((done, fail) => {
		const sh = spawn(
			"sh",
			[
				"-c",
				`${node} --import tsx ${JSON.stringify(FIXTURE)} ${mode} | ${reader}`,
			],
			{ stdio: ["ignore", "pipe", "inherit"] },
		);
		let out = "";
		sh.stdout.on("data", (chunk) => {
			out += chunk;
		});
		sh.on("error", fail);
		sh.on("close", () => done(out));
	});
}

it("a script's whole plan and its summary reach a slow reader before it exits", async () => {
	const out = await runWithSlowReader(MODE);
	const lines = out.trimEnd().split("\n");
	expect(lines.filter((l) => l.startsWith("  create row"))).toHaveLength(1500);
	expect(lines.at(-1)).toBe("SUMMARY");
}, 30_000);
