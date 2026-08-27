import { tokenize, intentTypesFor, termsForToken } from "../../src/lib/project-search-match";
const q = "AMM decentralized exchange Soroban";
const toks = tokenize(q);
console.log("  tokens:", JSON.stringify(toks));
console.log("  intentTypes:", JSON.stringify([...intentTypesFor(toks)]));
for (const t of toks) console.log(`   termsFor(${t}):`, JSON.stringify(termsForToken(t)).slice(0,120));
