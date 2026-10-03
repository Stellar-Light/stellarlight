/**
 * Jev: TypeSafe AI's typed-decision model, called through Vercel AI Gateway.
 *
 * Jev is not a chat model. It reads one block of state and answers typed
 * questions (boolean, choice, score), each with a calibrated probability,
 * in roughly 70-500 ms for about $0.04 per million input tokens. Nothing it
 * returns is free text, so it cannot invent a URL or a name.
 *
 * We use it where a regex is too brittle and a human is too slow: what a
 * page actually shows, whether two records are one product. Its answer is a
 * triage signal that routes a row to review. It is never written over
 * curated data and never flips a status on its own.
 *
 * Raw HTTP, so scripts need no SDK. The route and headers mirror
 * GatewayEvaluationModel in @ai-sdk/gateway 4.0.103; auth is the same
 * AI_GATEWAY_API_KEY the SDK reads.
 */

export type JevInput = string | Record<string, unknown> | unknown[];

export type JevQuestion =
	| {
			type: "boolean";
			instructions: JevInput;
			criteria?: { true?: JevInput | null; false?: JevInput | null };
	  }
	| {
			type: "choice";
			instructions: JevInput;
			/** Option name to description; null means no description. */
			criteria: Record<string, JevInput | null>;
	  }
	| {
			type: "score";
			instructions: JevInput;
			/** At least two ordered levels, indexed from zero. */
			criteria: (JevInput | null)[];
	  };

export type JevAnswer =
	| { type: "boolean"; probability: number }
	| { type: "choice"; choice: string; probabilities?: Record<string, number> }
	| { type: "score"; score: number; probabilities?: Record<string, number> };

export const JEV_MODEL = "typesafe-ai/jev";
const ENDPOINT = "https://ai-gateway.vercel.sh/v4/ai/evaluation-model";

/** The gateway key, or null. Callers treat null as could-not-check. */
export function jevKey(): string | null {
	return process.env.AI_GATEWAY_API_KEY?.trim() || null;
}

/** One Jev call: every question is answered against the same state. */
export async function jevEvaluate<Q extends Record<string, JevQuestion>>(
	state: JevInput,
	questions: Q,
	opts: { apiKey?: string; signal?: AbortSignal } = {},
): Promise<{
	answers: { [K in keyof Q]: JevAnswer };
	inputTokens: number | null;
}> {
	const key = opts.apiKey ?? jevKey();
	if (!key) throw new Error("AI_GATEWAY_API_KEY is not set");
	const res = await fetch(ENDPOINT, {
		method: "POST",
		headers: {
			authorization: `Bearer ${key}`,
			"content-type": "application/json",
			"ai-gateway-protocol-version": "0.0.1",
			"ai-evaluation-model-specification-version": "4",
			"ai-model-id": JEV_MODEL,
		},
		body: JSON.stringify({ state, questions }),
		signal: opts.signal,
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`jev HTTP ${res.status}: ${text.slice(0, 200)}`);
	const body = JSON.parse(text) as {
		answers?: Record<string, JevAnswer>;
		usage?: { inputTokens?: number };
	};
	for (const k of Object.keys(questions))
		if (!body.answers?.[k]) throw new Error(`jev: no answer for "${k}"`);
	return {
		answers: body.answers as { [K in keyof Q]: JevAnswer },
		inputTokens: body.usage?.inputTokens ?? null,
	};
}

/** Probability of the chosen option, or null when the answer carries none. */
export function choiceConfidence(a: JevAnswer): number | null {
	if (a.type !== "choice") return null;
	return a.probabilities?.[a.choice] ?? null;
}
