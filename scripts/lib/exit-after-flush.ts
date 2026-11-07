/**
 * Exit once stdout and stderr have flushed. process.exit() drops whatever is
 * still queued for a pipe whose reader is slower than the writer: on the CI
 * runner the curated-builds dry run printed 58 of its planned rows and no
 * summary, and still exited 0 (2026-11-07), so its plan could not be read.
 * An empty write's callback runs only after every write queued before it.
 */
export function exitAfterFlush(code: Parameters<typeof process.exit>[0]): void {
	let pending = 2;
	const done = () => {
		pending -= 1;
		if (pending === 0) process.exit(code);
	};
	process.stdout.write("", done);
	process.stderr.write("", done);
}
