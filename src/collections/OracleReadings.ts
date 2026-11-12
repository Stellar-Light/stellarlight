import type { CollectionConfig } from "payload";
import { ORACLE_READ_METHODS } from "../data/oracle-registry";
import { ORACLE_CONTRACT_STATES } from "../lib/oracle-products";
import { adminOnly } from "./access";

/**
 * What the chain showed for each oracle contract (sls-029), one row per
 * network and contract, overwritten by each check. The registry
 * (src/data/oracle-registry.ts) says which contracts exist and where they
 * are published; scripts/refresh-oracle-feeds.ts is the only writer here.
 * A check that could not run writes nothing, so a row is always the last
 * check that did, dated by checkedAt.
 */
export const OracleReadings: CollectionConfig = {
	slug: "oracle-readings",
	admin: { useAsTitle: "key", group: "Ecosystem" },
	access: {
		read: () => true,
		create: adminOnly,
		update: adminOnly,
		delete: adminOnly,
	},
	fields: [
		{
			name: "key",
			type: "text",
			required: true,
			index: true,
			unique: true,
			admin: { description: "<network>:<contract id>" },
		},
		{
			name: "network",
			type: "select",
			options: ["mainnet", "testnet"],
			required: true,
		},
		{ name: "contractId", type: "text", required: true },
		{
			name: "checkedAt",
			type: "text",
			required: true,
			admin: { description: "ISO time of the check" },
		},
		{
			name: "contract",
			type: "select",
			options: [...ORACLE_CONTRACT_STATES],
			required: true,
			admin: {
				description:
					"present = a contract instance exists at this address; absent = none when checked",
			},
		},
		{
			name: "method",
			type: "select",
			options: [...ORACLE_READ_METHODS],
			required: true,
		},
		{
			name: "maxAgeSeconds",
			type: "number",
			admin: {
				description: "The age bound a feed was judged updating against",
			},
		},
		{
			name: "lastUpdateAt",
			type: "text",
			admin: { description: "Newest price write observed on the contract" },
		},
		{
			// json, not a group: a group stored empty reads back as an object of
			// nulls, and a reading with no feed list must read back null.
			name: "feedList",
			type: "json",
			admin: {
				description:
					"{ basis: contract | provider-list | seeded, sourceUrl, asOf }: where the feeds list came from and as of when; null when no feed was read",
			},
		},
		{
			name: "feeds",
			type: "json",
			admin: {
				description:
					"[{ feed, label, contractId, lastUpdateAt, state }]; null = pull model, absent contract, or nothing read",
			},
		},
	],
};
