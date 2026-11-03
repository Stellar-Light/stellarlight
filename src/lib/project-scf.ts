import type { Project } from "@/payload-types";

type Scf = Pick<
	NonNullable<Project["scf"]>,
	"awardedRounds" | "lastAwardedRound"
>;

export function scfRoundsOf(scf: Scf | null | undefined): number[] {
	if (Array.isArray(scf?.awardedRounds)) return scf.awardedRounds;
	return scf?.lastAwardedRound && scf.lastAwardedRound > 0
		? [scf.lastAwardedRound]
		: [];
}

export function scfBadgeLabel(rounds: number[]): string {
	const newest = [...new Set(rounds)].sort((a, b) => b - a);
	const shown = newest.slice(0, 3).map((r) => `#${r}`);
	const more = newest.length - shown.length;

	return ["SCF funded", ...shown, ...(more > 0 ? [`+${more}`] : [])].join(" ");
}
