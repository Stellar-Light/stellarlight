import { scaleLinear, scaleLog } from "@visx/scale";
import type { LineConfig } from "./chart-context";
import { type ChartPhase, Y_DOMAIN_TWEEN_SKIP_THRESHOLD } from "./chart-phase";
import {
  groupLinesByYAxisId,
  normalizeYAxisId,
  type YScaleType,
} from "./y-axis-scales";

export type YDomain = [number, number];

/**
 * Apply visx `nice()` to raw domain endpoints for stable grid ticks.
 *
 * `scaleType` matters here, not just at render time: `scaleLinear(...).nice()`
 * rounds toward round linear numbers, which for a log domain can round the
 * floor down to 0 — invalid for a log scale (log(0) is undefined) and exactly
 * the "silently coerced" failure mode a log axis must avoid. `scaleLog(...).nice()`
 * rounds to nice powers instead and never crosses 0.
 */
export function niceYDomain(
  domain: YDomain,
  scaleType: YScaleType = "linear"
): YDomain {
  const build = scaleType === "log" ? scaleLog : scaleLinear;
  const scale = build({ domain, range: [0, 1], nice: true });
  const niceDomain = scale.domain();
  return [niceDomain[0] ?? domain[0], niceDomain[1] ?? domain[1]];
}

/**
 * Skip Y tween when both endpoints move less than the threshold relative to span.
 * When in doubt callers should tween — beauty wins over micro-optimization.
 */
export function shouldTweenYDomain(from: YDomain, to: YDomain): boolean {
  const span = Math.max(
    Math.abs(to[1] - to[0]),
    Math.abs(from[1] - from[0]),
    1
  );
  const deltaMin = Math.abs(to[0] - from[0]) / span;
  const deltaMax = Math.abs(to[1] - from[1]) / span;
  return (
    deltaMin >= Y_DOMAIN_TWEEN_SKIP_THRESHOLD ||
    deltaMax >= Y_DOMAIN_TWEEN_SKIP_THRESHOLD
  );
}

/** Phases where the chart shows loading chrome (shimmer, pulse, label). */
export function isLoadingChromePhase(phase: ChartPhase): boolean {
  return phase === "loading" || phase === "revealingLoading";
}

/** Phases where grid lines use loading stroke styling (muted / dashed chrome). */
export function isLoadingGridChromePhase(phase: ChartPhase): boolean {
  return (
    phase === "loading" || phase === "exiting" || phase === "gridTweenLoading"
  );
}

/** Phases where Y-domain tween runs after the series has exited. */
export function isYDomainTweenPhase(phase: ChartPhase): boolean {
  return phase === "gridTweenLoading" || phase === "gridTweenReady";
}

/** Phases where {@link ReferenceArea} bands are shown (fade in/out on transitions). */
export function isReferenceAreaVisiblePhase(phase: ChartPhase): boolean {
  return (
    phase === "ready" || phase === "revealing" || phase === "gridTweenReady"
  );
}

export function resolveAnimatedYDestinationDomains(
  chartPhase: ChartPhase,
  skeletonByAxis: Record<string, YDomain>,
  targetByAxis: Record<string, YDomain>
): Record<string, YDomain> {
  switch (chartPhase) {
    case "loading":
    case "exiting":
    case "gridTweenLoading":
      return skeletonByAxis;
    case "exitingReady":
    case "gridTweenReady":
    case "revealing":
    case "ready":
      return targetByAxis;
    default:
      return targetByAxis;
  }
}

export function computeYDomainsByAxis({
  lines,
  resolveDomain,
  scaleType = "linear",
}: {
  lines: LineConfig[];
  resolveDomain: (dataKeys: string[]) => YDomain;
  scaleType?: YScaleType;
}): Record<string, YDomain> {
  const groups = groupLinesByYAxisId(lines);
  const domains: Record<string, YDomain> = {};

  for (const [axisId, axisLines] of groups) {
    const dataKeys = axisLines.map((line) => line.dataKey);
    domains[normalizeYAxisId(axisId)] = niceYDomain(
      resolveDomain(dataKeys),
      scaleType
    );
  }

  if (!domains.left) {
    // Fallback for a chart with no lines yet — [0, 100] is invalid for a log
    // domain (0 has no logarithm), so use a strictly-positive stand-in.
    domains.left = niceYDomain(scaleType === "log" ? [1, 100] : [0, 100], scaleType);
  }

  return domains;
}

/** Merge domain maps, normalizing axis ids to strings. */
export function mergeYDomainRecords(
  ...records: Record<string, YDomain>[]
): Record<string, YDomain> {
  const merged: Record<string, YDomain> = {};
  for (const record of records) {
    for (const [axisId, domain] of Object.entries(record)) {
      merged[normalizeYAxisId(axisId)] = domain;
    }
  }
  return merged;
}

export function domainsEqual(
  left: Record<string, YDomain>,
  right: Record<string, YDomain>
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const axisId of leftKeys) {
    const from = left[axisId];
    const to = right[axisId];
    if (!(from && to) || from[0] !== to[0] || from[1] !== to[1]) {
      return false;
    }
  }

  return true;
}
