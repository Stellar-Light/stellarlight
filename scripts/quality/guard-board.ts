import { getGuardRows } from "../../src/lib/quality-artifacts";
const rows = getGuardRows();
for (const r of rows)
	console.log(
		`${r.state.padEnd(8)} ${r.severity.padEnd(6)} ${r.key.padEnd(22)} ${String(r.value).padEnd(9)} ${r.asOf} ${String(r.ageDays).padStart(3)}d/${r.freshnessDays}d`,
	);
console.log(
	"holding",
	rows.filter((r) => r.state === "holding").length,
	"breached",
	rows.filter((r) => r.state === "breached").length,
	"stale",
	rows.filter((r) => r.state === "stale").length,
);
