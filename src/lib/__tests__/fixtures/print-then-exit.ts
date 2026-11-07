// A dry run in miniature: a long plan, a summary, then the exit. "plain"
// exits the way the import scripts did; anything else waits for the flush.
import { exitAfterFlush } from "../../../../scripts/lib/exit-after-flush";

for (let i = 0; i < 1500; i++)
	console.log(`  create row ${i} ${"x".repeat(60)}`);
console.log("SUMMARY");
if (process.argv[2] === "plain") process.exit(0);
else exitAfterFlush(0);
