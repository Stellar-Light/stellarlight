/**
 * Sorts hackathon submissions into the directory's project types
 * (PROJECT_TYPES) by their nearest directory projects in embedding space, so
 * a submission and a directory project are counted in the same vocabulary.
 *
 * Both sides are voyage-3 embeddings: a submission of its name, summary and
 * write-up, a directory project of its name, description and category. A
 * type's score is the similarity-weighted share of the k nearest projects
 * that carry it. The directory's types are set by hand, so the method is
 * measured on them before anything is written: each typed project is sorted
 * from its neighbours without itself (leave-one-out) across a small grid of
 * k and score cuts, and the lane writes only with a setting whose precision
 * clears MIN_PRECISION.
 *
 * ponytail: nearest neighbours only. Rare types with few directory examples
 * (Faucet, RPC) are the weak spot; type-definition prototypes or a model pass
 * (Jev) can be measured against the same leave-one-out numbers later.
 */
import type { BuildCategory } from "@/lib/hackathon-builds";

/** Below this measured precision, categories are not written at all. */
export const MIN_PRECISION = 0.7;
export const MAX_TYPES = 3;
export const K_GRID = [5, 10, 15, 25];
export const CUT_GRID = [0.3, 0.4, 0.5, 0.6];

export interface Labeled {
	id: string;
	vec: Float32Array;
	types: string[];
}

/** Unit-length copy of an embedding, or null when it is not a usable vector. */
export function unit(v: unknown, dims = 1024): Float32Array | null {
	if (!Array.isArray(v) || v.length !== dims) return null;
	const out = new Float32Array(dims);
	let n = 0;
	for (let i = 0; i < dims; i++) {
		const x = Number(v[i]);
		if (!Number.isFinite(x)) return null;
		out[i] = x;
		n += x * x;
	}
	if (!n) return null;
	const s = 1 / Math.sqrt(n);
	for (let i = 0; i < dims; i++) out[i] *= s;
	return out;
}

function dot(a: Float32Array, b: Float32Array): number {
	let s = 0;
	for (let i = 0; i < a.length; i++) s += a[i] * b[i];
	return s;
}

type Neighbour = { sim: number; types: string[] };

/** The k most similar labeled rows, most similar first. */
export function neighbours(
	vec: Float32Array,
	labeled: Labeled[],
	k: number,
	skipId?: string,
): Neighbour[] {
	const best: Neighbour[] = [];
	for (const l of labeled) {
		if (l.id === skipId) continue;
		const sim = dot(vec, l.vec);
		if (best.length < k || sim > best[best.length - 1].sim) {
			if (best.length === k) best.pop();
			let i = best.length;
			while (i > 0 && best[i - 1].sim < sim) i--;
			best.splice(i, 0, { sim, types: l.types });
		}
	}
	return best;
}

/** Each type's similarity-weighted share among the first k neighbours. */
export function typeScores(near: Neighbour[], k: number): Map<string, number> {
	const scores = new Map<string, number>();
	let total = 0;
	for (const n of near.slice(0, k)) {
		const w = Math.max(n.sim, 0);
		total += w;
		for (const t of n.types) scores.set(t, (scores.get(t) ?? 0) + w);
	}
	if (total) for (const [t, s] of scores) scores.set(t, s / total);
	return scores;
}

/** The types at or above the cut, best first, at most MAX_TYPES. */
export function assign(
	scores: Map<string, number>,
	cut: number,
): BuildCategory[] {
	return [...scores]
		.filter(([, s]) => s >= cut)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, MAX_TYPES)
		.map(([type, s]) => ({ type, score: Math.round(s * 100) / 100 }));
}

export interface Measured {
	k: number;
	cut: number;
	precision: number;
	recall: number;
	f1: number;
	/** Share of rows that got at least one type. */
	covered: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Precision and recall of every (k, cut) on the labeled rows themselves,
 * each sorted from its neighbours without itself. */
export function leaveOneOut(
	labeled: Labeled[],
	ks = K_GRID,
	cuts = CUT_GRID,
): Measured[] {
	const kMax = Math.max(...ks);
	const near = labeled.map((l) => neighbours(l.vec, labeled, kMax, l.id));
	const out: Measured[] = [];
	for (const k of ks) {
		const scores = near.map((n) => typeScores(n, k));
		for (const cut of cuts) {
			let tp = 0;
			let fp = 0;
			let fn = 0;
			let covered = 0;
			labeled.forEach((l, i) => {
				const got = assign(scores[i], cut).map((c) => c.type);
				if (got.length) covered++;
				const truth = new Set(l.types);
				for (const t of got) truth.has(t) ? tp++ : fp++;
				for (const t of truth) if (!got.includes(t)) fn++;
			});
			const precision = tp + fp ? tp / (tp + fp) : 0;
			const recall = tp + fn ? tp / (tp + fn) : 0;
			out.push({
				k,
				cut,
				precision: r3(precision),
				recall: r3(recall),
				f1: r3(
					precision + recall
						? (2 * precision * recall) / (precision + recall)
						: 0,
				),
				covered: r3(labeled.length ? covered / labeled.length : 0),
			});
		}
	}
	return out;
}

/** Best F1 among the settings whose precision clears the floor; null when
 * none does, and then nothing is written. */
export function pickSetting(
	measured: Measured[],
	floor = MIN_PRECISION,
): Measured | null {
	return (
		measured
			.filter((m) => m.precision >= floor)
			.sort((a, b) => b.f1 - a.f1 || b.precision - a.precision)[0] ?? null
	);
}
