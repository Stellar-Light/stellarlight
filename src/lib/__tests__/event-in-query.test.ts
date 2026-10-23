import { describe, expect, it } from "vitest";
import { eventInQuery, type NamedEvent } from "@/lib/event-in-query";

// Built from its code point: no dash character in source.
const EN_DASH = String.fromCharCode(0x2013);
// Slugs and titles as getHackathons lists them on 2026-10-23, plus two
// made-up events (a second "Stellar LATAM" one, and one whose title has
// accents and an en dash).
const EVENTS: NamedEvent[] = [
	{ slug: "hackmeridian-2025", title: "HackMeridian 2025" },
	{ slug: "hackmeridian-2026", title: "HackMeridian 2026" },
	{ slug: "stellar-hacks-blend", title: "Stellar Hacks: Blend" },
	{ slug: "stellar-hacks-zk", title: "Stellar Hacks: Real-World ZK" },
	{ slug: "stellar-hacks-zk-gaming", title: "Stellar Hacks: ZK Gaming" },
	{ slug: "stellar-agents-x402-stripe-mpp", title: "Stellar Hacks: Agents" },
	{
		slug: "stellar-hacks-kale-reflector",
		title: "Stellar Hacks: KALE x Reflector",
	},
	{ slug: "stellar-latam", title: "Stellar LATAM Hackathon" },
	{ slug: "latam-demo-day", title: "Stellar LATAM Demo Day" },
	{ slug: "build-on-stellar", title: "Stellar Build Better Hackathon" },
	{
		slug: "build-on-stellar-philippines-2026",
		title: "Build on Stellar Philippines Hackathon",
	},
	{
		slug: "buildonstellarchile",
		title: "Build on Stellar Chile Ideatón: Ideas Reales, Impacto Real",
	},
	{ slug: "scaffoldstellar", title: "Scaffold Stellar Hackathon" },
	{
		slug: "telluscoop-ideaton",
		title: "Stellar Ideaton: Build, Create & Win on the Road to Meridian",
	},
	{
		slug: "hackaton-ejemplo",
		title: `Hackatón Año Nuevo ${EN_DASH} Powered by Ejemplo`,
	},
];
const find = (q: string, events = EVENTS) => eventInQuery(q, events);
/** The rest of q after the event's name, or null when no event was found. */
const restOf = (q: string) => {
	const r = find(q);
	return r.kind === "event" ? r.rest : null;
};
const STELLAR_HACKS = [
	"stellar-agents-x402-stripe-mpp",
	"stellar-hacks-blend",
	"stellar-hacks-kale-reflector",
	"stellar-hacks-zk",
	"stellar-hacks-zk-gaming",
];

describe("eventInQuery finds an event named in full", () => {
	it("by its title, in any case and punctuation", () => {
		expect(find("HackMeridian 2025")).toEqual({
			kind: "event",
			slug: "hackmeridian-2025",
			matched: "HackMeridian 2025",
			rest: "",
		});
		expect(find("Stellar Hacks: Blend")).toMatchObject({
			kind: "event",
			slug: "stellar-hacks-blend",
			matched: "Stellar Hacks: Blend",
		});
		expect(find("stellar hacks blend")).toMatchObject({
			slug: "stellar-hacks-blend",
			matched: "stellar hacks blend",
		});
		expect(find("STELLAR HACKS | real world zk")).toMatchObject({
			slug: "stellar-hacks-zk",
		});
	});

	it("without its accents, and with the en dash in its title", () => {
		expect(find("Hackaton Ano Nuevo Powered by Ejemplo")).toMatchObject({
			kind: "event",
			slug: "hackaton-ejemplo",
			rest: "",
		});
		expect(
			find(`Hackatón Año Nuevo ${EN_DASH} Powered by Ejemplo payroll`),
		).toMatchObject({ slug: "hackaton-ejemplo", rest: "payroll" });
	});

	it("by its slug as typed, hyphens included", () => {
		expect(find("hackmeridian-2025")).toMatchObject({
			kind: "event",
			slug: "hackmeridian-2025",
			matched: "hackmeridian-2025",
		});
		expect(find("HACKMERIDIAN-2025 payments")).toMatchObject({
			slug: "hackmeridian-2025",
			rest: "payments",
		});
		expect(find("build-on-stellar lending")).toMatchObject({
			slug: "build-on-stellar",
			rest: "lending",
		});
	});

	it("never by a slug of common words with its hyphens dropped", () => {
		expect(find("build on stellar lending app")).toEqual({ kind: "none" });
		expect(find("stellar latam remittances")).not.toMatchObject({
			kind: "event",
		});
	});

	it("on whole words only", () => {
		expect(find("Meridian")).toEqual({ kind: "none" });
		expect(find("hackmeridian2025 vault")).toEqual({ kind: "none" });
		// The slug stellar-hacks-zk inside another slug is not that slug.
		expect(find("stellar-hacks-zk-gaming")).toMatchObject({
			slug: "stellar-hacks-zk-gaming",
		});
	});

	it("preferring the longest name", () => {
		// "stellar-hacks-zk" is the start of this run, the title is all of it.
		expect(find("stellar-hacks-zk gaming")).toMatchObject({
			kind: "event",
			slug: "stellar-hacks-zk-gaming",
			matched: "stellar-hacks-zk gaming",
		});
	});

	it("keeps the rest of q as typed, without the separators beside the name", () => {
		expect(restOf("HackMeridian 2025 café payments")).toBe("café payments");
		expect(restOf("lending (Stellar Hacks: Blend), vaults")).toBe(
			"lending vaults",
		);
		expect(find("hackmeridian-2025 HackMeridian 2025 oracle")).toMatchObject({
			kind: "event",
			slug: "hackmeridian-2025",
			rest: "oracle",
		});
	});

	it("leaves nothing when the rest only asks for the event's entries", () => {
		for (const q of [
			"HackMeridian 2025 winners",
			"builds from Stellar Hacks: Blend",
			"Which teams won HackMeridian 2025?",
			"HackMeridian 2025 hackathon projects and submissions",
			"Stellar Hacks: Blend!",
		])
			expect(find(q)).toMatchObject({ kind: "event", rest: "" });
		expect(restOf("HackMeridian 2025 payments app")).toBe("payments app");
	});

	// Review 2026-10-23: each of these was searched as text inside an event
	// whose rows hold no text, and answered a bare 0.
	it("reads placement, award and ranking words as asking for the entries", () => {
		for (const q of [
			"HackMeridian 2025 first place",
			"HackMeridian 2025 awards",
			"HackMeridian 2025 leaderboard",
			"HackMeridian 2025 participants",
			"HackMeridian 2025 1st 2nd 3rd",
			"HackMeridian 2025 second and third placements",
			"HackMeridian 2025 rankings and demos",
			"HackMeridian 2025 top",
			// Words the scorer never searches leave nothing too.
			"HackMeridian 2025 crypto tokens on github",
		])
			expect([q, restOf(q)]).toEqual([q, ""]);
		// A topic word keeps the whole rest, entry words included.
		expect(restOf("HackMeridian 2025 top three")).toBe("top three");
		expect(restOf("HackMeridian 2025 give me")).toBe("give me");
		expect(restOf("HackMeridian 2025 first time users")).toBe(
			"first time users",
		);
	});
});

describe("eventInQuery infers nothing from a partial or shared name", () => {
	it("names the events whose titles start with the words q holds", () => {
		expect(find("hackmeridian")).toEqual({
			kind: "partial",
			slugs: ["hackmeridian-2025", "hackmeridian-2026"],
			matched: "hackmeridian",
		});
		expect(find("HackMeridian 2024")).toMatchObject({
			kind: "partial",
			slugs: ["hackmeridian-2025", "hackmeridian-2026"],
		});
		expect(find("Stellar Hacks")).toEqual({
			kind: "partial",
			slugs: STELLAR_HACKS,
			matched: "Stellar Hacks",
		});
		expect(find("stellar latam remittances")).toEqual({
			kind: "partial",
			slugs: ["latam-demo-day", "stellar-latam"],
			matched: "stellar latam",
		});
	});

	it("says nothing for stopwords, the middle of a title or one event's start", () => {
		for (const q of [
			"stellar wallet",
			"build on stellar",
			"ZK Gaming",
			"real world assets tokenization",
			"blend lending vault",
			"KALE Markets",
			"agents x402 payments",
			"scaffold stellar templates",
		])
			expect([q, find(q)]).toEqual([q, { kind: "none" }]);
	});

	it("names every event when q holds the full names of several", () => {
		expect(find("HackMeridian 2025 vs HackMeridian 2026")).toEqual({
			kind: "several",
			slugs: ["hackmeridian-2025", "hackmeridian-2026"],
			matched: ["HackMeridian 2025", "HackMeridian 2026"],
		});
		// Two events that share one title.
		const twins = [
			{ slug: "a-2024", title: "Lumen Jam" },
			{ slug: "b-2025", title: "Lumen Jam" },
		];
		expect(find("lumen jam payments", twins)).toMatchObject({
			kind: "several",
			slugs: ["a-2024", "b-2025"],
		});
	});

	it("reads an empty or punctuation-only q as naming nothing", () => {
		for (const q of ["", "   ", "!!!", ": , |", EN_DASH])
			expect(find(q)).toEqual({ kind: "none" });
	});
});
