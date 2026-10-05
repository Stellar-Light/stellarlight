/**
 * Sorts hackathon submissions into the directory's project types
 * (PROJECT_TYPES) by their nearest directory projects in embedding space, so
 * a submission and a directory project are counted in the same vocabulary.
 *
 * Both sides are voyage-3 embeddings: a submission of its name, summary and
 * write-up, a directory project of its name, description and category. A
 * type's score is the similarity-weighted share of the k nearest projects
 * that carry it. The directory's types are set by hand, so the method is
 * calibrated and measured on them before anything is written: each typed
 * project is scored from its neighbours without itself (leave-one-out), and
 * every type gets its own cut, the lowest at which it is right at least
 * MIN_PRECISION of the time. A shared cut over-assigned the common types
 * (Payments is 29% of the directory) and never reached the rare ones; a type
 * that cannot reach the bar at any cut is never assigned.
 *
 * ponytail: nearest neighbours only. Rare types with few directory examples
 * (Faucet, RPC) are the weak spot; type-definition prototypes or a model pass
 * (Jev) can be measured against the same leave-one-out numbers later.
 */
import type { BuildCategory } from "@/lib/hackathon-builds";

/** A type is assigned only at a cut where its leave-one-out precision on the
 * directory clears this. */
export const MIN_PRECISION = 0.7;
/** Directory examples a type needs before its precision means anything. */
export const MIN_SUPPORT = 15;
/** Correct assignments a type needs at its cut. */
const MIN_HITS = 5;
export const MAX_TYPES = 3;
export const K_GRID = [5, 10, 15, 25];
const CUTS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

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

/** Each labeled row's nearest other rows, computed once and shared by every
 * measurement. */
export function looNeighbours(labeled: Labeled[], kMax: number): Neighbour[][] {
	return labeled.map((l) => neighbours(l.vec, labeled, kMax, l.id));
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

/** The types whose score reaches their own cut, best first, at most
 * MAX_TYPES. A type with no cut is never assigned. */
export function assign(
	scores: Map<string, number>,
	cuts: Map<string, number>,
): BuildCategory[] {
	return [...scores]
		.filter(([t, s]) => cuts.has(t) && s >= (cuts.get(t) ?? 1))
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, MAX_TYPES)
		.map(([type, s]) => ({ type, score: Math.round(s * 100) / 100 }));
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export interface TypeMeasure {
	type: string;
	/** Directory projects that carry the type. */
	support: number;
	/** The type's own cut; null = never assigned. */
	cut: number | null;
	precision: number;
	recall: number;
}

export interface Calibration {
	k: number;
	/** type -> its cut, for the types that may be assigned. */
	cuts: Map<string, number>;
	types: TypeMeasure[];
	/** Over every row and every assignable type, with the MAX_TYPES cap. */
	precision: number;
	recall: number;
	f1: number;
	/** Share of rows that got at least one type. */
	covered: number;
}

/** Each type's lowest cut at which it is right at least MIN_PRECISION of the
 * time (leave-one-out), then the whole assignment measured with those cuts. */
export function calibrate(
	labeled: Labeled[],
	near: Neighbour[][],
	k: number,
): Calibration {
	const scores = near.map((n) => typeScores(n, k));
	const support = new Map<string, number>();
	for (const l of labeled)
		for (const t of l.types) support.set(t, (support.get(t) ?? 0) + 1);
	const cuts = new Map<string, number>();
	const types: TypeMeasure[] = [];
	for (const [type, n] of support) {
		let chosen: TypeMeasure = {
			type,
			support: n,
			cut: null,
			precision: 0,
			recall: 0,
		};
		if (n >= MIN_SUPPORT)
			for (const cut of CUTS) {
				let tp = 0;
				let fp = 0;
				labeled.forEach((l, i) => {
					if ((scores[i].get(type) ?? 0) < cut) return;
					l.types.includes(type) ? tp++ : fp++;
				});
				const precision = tp + fp ? tp / (tp + fp) : 0;
				if (tp >= MIN_HITS && precision >= MIN_PRECISION) {
					chosen = {
						type,
						support: n,
						cut,
						precision: r3(precision),
						recall: r3(tp / n),
					};
					break;
				}
			}
		if (chosen.cut != null) cuts.set(type, chosen.cut);
		types.push(chosen);
	}
	types.sort((a, b) => b.support - a.support || a.type.localeCompare(b.type));
	let tp = 0;
	let fp = 0;
	let fn = 0;
	let covered = 0;
	labeled.forEach((l, i) => {
		const got = assign(scores[i], cuts).map((c) => c.type);
		if (got.length) covered++;
		for (const t of got) l.types.includes(t) ? tp++ : fp++;
		for (const t of l.types) if (!got.includes(t)) fn++;
	});
	const precision = tp + fp ? tp / (tp + fp) : 0;
	const recall = tp + fn ? tp / (tp + fn) : 0;
	return {
		k,
		cuts,
		types,
		precision: r3(precision),
		recall: r3(recall),
		f1: r3(
			precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
		),
		covered: r3(labeled.length ? covered / labeled.length : 0),
	};
}

/** The k with the best F1 among calibrations whose overall precision clears
 * MIN_PRECISION; null when none does, and then nothing is written. */
export function bestCalibration(
	labeled: Labeled[],
	ks = K_GRID,
): { best: Calibration | null; all: Calibration[] } {
	const near = looNeighbours(labeled, Math.max(...ks));
	const all = ks.map((k) => calibrate(labeled, near, k));
	const best =
		all
			.filter((c) => c.precision >= MIN_PRECISION && c.cuts.size > 0)
			.sort((a, b) => b.f1 - a.f1)[0] ?? null;
	return { best, all };
}
