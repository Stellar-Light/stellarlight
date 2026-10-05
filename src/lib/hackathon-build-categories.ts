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
/** A type is assigned only when, on its own, its leave-one-out precision
 * clears this and the directory has enough examples of it to say so. */
export const MIN_TYPE_PRECISION = 0.7;
export const MIN_TYPE_SUPPORT = 10;
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

/** The types at or above the cut, best first, at most MAX_TYPES; only
 * `allowed` types when given. */
export function assign(
	scores: Map<string, number>,
	cut: number,
	allowed?: Set<string>,
): BuildCategory[] {
	return [...scores]
		.filter(([t, s]) => s >= cut && (!allowed || allowed.has(t)))
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

/** Each labeled row's nearest other rows, computed once and shared by every
 * measurement below. */
export function looNeighbours(labeled: Labeled[], kMax: number): Neighbour[][] {
	return labeled.map((l) => neighbours(l.vec, labeled, kMax, l.id));
}

/** Precision and recall of every (k, cut) on the labeled rows themselves,
 * each sorted from its neighbours without itself; only `allowed` types are
 * assigned when given. */
export function leaveOneOut(
	labeled: Labeled[],
	near: Neighbour[][],
	ks = K_GRID,
	cuts = CUT_GRID,
	allowed?: Set<string>,
): Measured[] {
	const out: Measured[] = [];
	for (const k of ks) {
		const scores = near.map((n) => typeScores(n, k));
		for (const cut of cuts) {
			let tp = 0;
			let fp = 0;
			let fn = 0;
			let covered = 0;
			labeled.forEach((l, i) => {
				const got = assign(scores[i], cut, allowed).map((c) => c.type);
				if (got.length) covered++;
				for (const t of got) l.types.includes(t) ? tp++ : fp++;
				for (const t of l.types) if (!got.includes(t)) fn++;
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

export interface TypeMeasure {
	type: string;
	/** Directory projects that carry the type. */
	support: number;
	/** Times the method assigned it. */
	assigned: number;
	precision: number;
	recall: number;
}

/** Leave-one-out precision and recall of each type on its own, at one
 * setting. */
export function perType(
	labeled: Labeled[],
	near: Neighbour[][],
	k: number,
	cut: number,
	allowed?: Set<string>,
): TypeMeasure[] {
	const stats = new Map<string, { support: number; tp: number; fp: number }>();
	const at = (t: string) => {
		let s = stats.get(t);
		if (!s) {
			s = { support: 0, tp: 0, fp: 0 };
			stats.set(t, s);
		}
		return s;
	};
	labeled.forEach((l, i) => {
		for (const t of l.types) at(t).support++;
		const got = assign(typeScores(near[i], k), cut, allowed).map((c) => c.type);
		for (const t of got) l.types.includes(t) ? at(t).tp++ : at(t).fp++;
	});
	return [...stats]
		.map(([type, s]) => ({
			type,
			support: s.support,
			assigned: s.tp + s.fp,
			precision: r3(s.tp + s.fp ? s.tp / (s.tp + s.fp) : 0),
			recall: r3(s.support ? s.tp / s.support : 0),
		}))
		.sort((a, b) => b.support - a.support || a.type.localeCompare(b.type));
}

/** The types the method may assign: measured precise enough, with enough
 * directory examples behind the measurement. */
export function trustedTypes(measures: TypeMeasure[]): Set<string> {
	return new Set(
		measures
			.filter(
				(m) =>
					m.support >= MIN_TYPE_SUPPORT &&
					m.assigned > 0 &&
					m.precision >= MIN_TYPE_PRECISION,
			)
			.map((m) => m.type),
	);
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
