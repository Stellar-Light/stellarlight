import bundled from "../../data/snapshots/projects/lifecycle-report.json";
import type { LifecycleReport } from "./lifecycle-metrics";

/**
 * The lifecycle report as the daily snapshot lane last committed it. The
 * lane's bot commits do not redeploy the site, so this reads the file from
 * the repository first and falls back to the copy bundled at the last deploy,
 * taking whichever is newer.
 */
export const LIFECYCLE_REPORT_URL =
	"https://raw.githubusercontent.com/Stellar-Light/stellarlight/main/data/snapshots/projects/lifecycle-report.json";

export type LifecycleReportFile = LifecycleReport & {
	generatedAt: string;
	source: string;
};

export async function getLifecycleReport(): Promise<{
	report: LifecycleReportFile;
	from: "repository" | "bundled";
}> {
	const local = bundled as unknown as LifecycleReportFile;
	try {
		const r = await fetch(LIFECYCLE_REPORT_URL, {
			next: { revalidate: 3600 },
			signal: AbortSignal.timeout(5000),
		});
		if (r.ok) {
			const remote = (await r.json()) as LifecycleReportFile;
			if (
				remote?.latestSnapshot &&
				remote?.groups?.all &&
				remote.latestSnapshot >= local.latestSnapshot
			)
				return { report: remote, from: "repository" };
		}
	} catch {
		// The bundled copy is still a dated, committed report.
	}
	return { report: local, from: "bundled" };
}
