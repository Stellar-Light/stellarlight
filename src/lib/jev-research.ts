/**
 * Jev questions for research passages, shared by every reader that scores
 * them: the source scoring in scripts/eval/jev-eval.ts and the Raven
 * benchmark's re-rank experiment in scripts/eval/raven-source-recall.ts.
 * One definition, so a score means the same thing in both reports.
 */
import type { JevQuestion } from "./jev";

/** Pass 1, relevance: the question and the passage, nothing else. */
export const RELEVANCE_QUESTIONS: Record<string, JevQuestion> = {
	answers: {
		type: "score",
		instructions: "How much does this passage help answer the question?",
		criteria: [
			"Unrelated to the question.",
			"Same topic, but it does not help answer the question.",
			"Partly answers the question.",
			"Directly answers the question.",
		],
	},
};

/** Pass 2, quality: the passage with its date, no question. Separate passes
 * so one framing cannot colour the other. */
export const QUALITY_QUESTIONS: Record<string, JevQuestion> = {
	substance: {
		type: "boolean",
		instructions:
			"Is this passage substantive content a developer could learn from, rather than navigation, a list of links or other posts, a cookie or subscription banner, a table of contents, or a fragment with no information?",
	},
	currency: {
		type: "choice",
		instructions:
			"As of the date given as today, does this passage describe how Stellar works today?",
		criteria: {
			current: "It describes current behaviour, or history that is still true.",
			possibly_outdated:
				"It may describe a superseded API, tool, process, version or rule.",
			outdated:
				"It clearly describes something that has been replaced or is no longer true.",
			unclear: "The passage gives no basis to tell.",
		},
	},
};
