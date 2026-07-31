import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { spec } from "@/lib/openapi-spec";

export const metadata: Metadata = {
	title: "API Reference · Stellar Scout | Stellar Light",
	description:
		"Endpoint reference for the public read-only APIs that power Stellar Scout — hackathons (curated + DoraHacks), projects search, builders, SDF skills proxy, and ecosystem dev stats.",
};

interface EndpointParam {
	name: string;
	type: string;
	description: string;
}

interface Endpoint {
	method: string;
	path: string;
	summary: string;
	/** The op's full routing-grade description, when it says more than the summary. */
	notes?: string;
	params: EndpointParam[];
	returns: string[];
}

/**
 * The endpoint list is DERIVED from the same `spec` object /api/openapi.json
 * serves — not hand-maintained. The previous version of this page was a
 * hardcoded array that documented 9 endpoints while the contract had grown to
 * 27 paths: every endpoint shipped after it was written was simply invisible
 * here. Deriving from the spec means this page can only drift if the contract
 * itself does, and the descriptions shown are the same routing-load-bearing
 * text agents read — one source of truth, maintained in one place.
 */
// biome-ignore lint/suspicious/noExplicitAny: OpenAPI nodes are heterogeneous JSON
function resolveParam(raw: any): EndpointParam | null {
	// biome-ignore lint/suspicious/noExplicitAny: $ref resolution against components
	let node: any = raw;
	if (typeof node?.$ref === "string") {
		const name = node.$ref.split("/").pop() ?? "";
		// biome-ignore lint/suspicious/noExplicitAny: components.parameters lookup
		node = (spec.components as any)?.parameters?.[name];
	}
	if (!node?.name) return null;
	const schema = node.schema ?? {};
	const type = Array.isArray(schema.enum)
		? schema.enum.join(" | ")
		: (schema.type ?? "string");
	return {
		name: String(node.name),
		type: String(type),
		description: String(node.description ?? ""),
	};
}

const ENDPOINTS: Endpoint[] = Object.entries(spec.paths).flatMap(
	([path, ops]) =>
		Object.entries(ops as Record<string, unknown>)
			.filter(([method]) => method === "get" || method === "post")
			.map(([method, rawOp]) => {
				// biome-ignore lint/suspicious/noExplicitAny: OpenAPI operation node
				const op = rawOp as any;
				const summary = String(op.summary ?? op.description ?? "");
				const description = String(op.description ?? "");
				const resp = String(op.responses?.["200"]?.description ?? "");
				return {
					method: method.toUpperCase(),
					path,
					summary,
					// The long description carries the Use-when/Not-for routing
					// guidance; show it only when it adds to the summary.
					notes:
						description && description !== summary ? description : undefined,
					params: (op.parameters ?? [])
						.map(resolveParam)
						.filter(
							(x: EndpointParam | null): x is EndpointParam => x !== null,
						),
					returns: resp ? [resp] : [],
				};
			}),
);

function MethodBadge({ method }: { method: string }) {
	return (
		<span className="font-mono text-xs px-1.5 py-0.5 rounded bg-emerald-400/10 border border-emerald-400/30 text-emerald-400">
			{method}
		</span>
	);
}

export default function ApiReferencePage() {
	return (
		<div className="min-h-screen relative">
			<main className="max-w-4xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<Link
					href="/scout"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">Back to Scout</span>
				</Link>

				<div className="mb-10">
					<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-2">
						API Reference
					</div>
					<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-3">
						Public endpoints
					</h1>
					<p className="text-muted-foreground max-w-2xl">
						Every endpoint Scout calls is public, read-only, no auth, edge-
						cached (5 minutes for ecosystem data, 24 hours for the SDF skill
						proxy). Hit them from your agent, your dashboard, your{" "}
						<a
							href="https://dune.com"
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-foreground"
						>
							Dune
						</a>{" "}
						query, or anywhere else.
					</p>
				</div>

				<div className="space-y-6">
					{ENDPOINTS.map((e) => (
						<div
							key={`${e.method} ${e.path}`}
							className="rounded-xl border border-border/50 bg-card p-6"
						>
							<div className="flex items-center gap-3 mb-3 flex-wrap">
								<MethodBadge method={e.method} />
								<code className="font-mono text-sm font-semibold text-foreground">
									{e.path}
								</code>
							</div>
							<p className="text-sm text-muted-foreground leading-relaxed mb-4">
								{e.summary}
							</p>

							{e.params.length > 0 && (
								<div className="mb-4">
									<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-2">
										Query params
									</div>
									<div className="rounded-lg border border-border/30 bg-black/20 overflow-hidden">
										<table className="w-full text-xs">
											<thead>
												<tr className="border-b border-border/30">
													<th className="text-left px-3 py-2 text-muted-foreground font-medium">
														Name
													</th>
													<th className="text-left px-3 py-2 text-muted-foreground font-medium">
														Type
													</th>
													<th className="text-left px-3 py-2 text-muted-foreground font-medium">
														Description
													</th>
												</tr>
											</thead>
											<tbody>
												{e.params.map((p) => (
													<tr
														key={p.name}
														className="border-b border-border/20 last:border-b-0"
													>
														<td className="px-3 py-2 font-mono text-foreground">
															{p.name}
														</td>
														<td className="px-3 py-2 font-mono text-muted-foreground">
															{p.type}
														</td>
														<td className="px-3 py-2 text-muted-foreground">
															{p.description}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>
							)}

							{e.returns.length > 0 && (
								<div className="mb-2">
									<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-2">
										Returns
									</div>
									<ul className="space-y-1">
										{e.returns.map((r) => (
											<li
												key={r}
												className="text-xs text-foreground font-mono leading-relaxed pl-4 relative"
											>
												<span className="absolute left-0 text-muted-foreground/60">
													·
												</span>
												{r}
											</li>
										))}
									</ul>
								</div>
							)}

							{e.notes && (
								<p className="text-xs text-muted-foreground/80 mt-3 pt-3 border-t border-border/30">
									{e.notes}
								</p>
							)}
						</div>
					))}
				</div>

				<div className="mt-12 rounded-xl border border-border/50 bg-card p-6">
					<h3 className="text-sm font-semibold text-foreground mb-2">Source</h3>
					<p className="text-sm text-muted-foreground leading-relaxed">
						All endpoints live in{" "}
						<a
							href="https://github.com/Stellar-Light/stellarlight/tree/main/src/app/api"
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-foreground inline-flex items-center gap-1"
						>
							Stellar-Light/stellarlight
							<ExternalLink className="w-3 h-3" />
						</a>
						. The skill manifest that documents them is in{" "}
						<a
							href="https://github.com/Stellar-Light/stellar-scout"
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-foreground inline-flex items-center gap-1"
						>
							Stellar-Light/stellar-scout
							<ExternalLink className="w-3 h-3" />
						</a>
						.
					</p>
				</div>
			</main>
		</div>
	);
}
