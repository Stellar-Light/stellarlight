import { tokenize, buildHaystack, scoreTokens, hitsAnyToken } from "../../src/lib/project-search-match";
const q = "AMM decentralized exchange Soroban";
const toks = tokenize(q);
async function row(slug: string) {
	const r = await fetch(`https://stellarlight.xyz/api/projects/search?q=${slug}&limit=1`);
	const d = await r.json();
	return d.projects?.[0];
}
for (const slug of ["soroswap", "switchly", "lumenswap"]) {
	const p = await row(slug);
	if (!p) { console.log(`  ${slug}: NOT FETCHED`); continue; }
	const hay = buildHaystack(p as never);
	const score = scoreTokens(hay, toks);
	const per = toks.map((t) => `${t}:${hitsAnyToken(hay, [t]) ? "✓" : "✗"}`).join(" ");
	console.log(`  ${slug}: score=${score}  ${per}`);
}
