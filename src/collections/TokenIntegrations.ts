import type { CollectionConfig } from "payload";
import {
	TOKEN_CONTRACT_KINDS,
	TOKEN_INTEGRATION_KINDS,
	TOKEN_INTEGRATION_STATUSES,
	TOKEN_INTEGRATION_TIERS,
} from "../lib/token-integrations";
import { adminOnly } from "./access";

/**
 * Which projects support a token on Stellar, how, since when: one row per
 * (token, kind, venue, project), written only by
 * scripts/refresh-token-integrations.ts (weekly lane) and served by
 * /api/tokens/integrations. SCF facts are not copied here: the route joins
 * them from the project row, whose SCF lane is their one writer. A row whose
 * evidence is gone is ended (status, endedAt, endedReason), never deleted.
 */
export const TokenIntegrations: CollectionConfig = {
	slug: "token-integrations",
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
			admin: { description: "<token>|<kind>|<venue>|<project slug or empty>" },
		},
		{
			name: "tokenId",
			type: "text",
			required: true,
			index: true,
			admin: {
				description: "The token's contract id (a classic asset's SAC id)",
			},
		},
		{
			name: "code",
			type: "text",
			index: true,
			admin: { description: "Asset code or token symbol; not an identity" },
		},
		{
			name: "issuer",
			type: "text",
			admin: {
				description:
					"Classic issuer account, native for XLM, null for a contract token",
			},
		},
		{ name: "tokenKind", type: "select", options: [...TOKEN_CONTRACT_KINDS] },
		{ name: "homeDomain", type: "text" },
		{
			name: "issuerLabel",
			type: "text",
			admin: {
				description:
					"Public directory label of the issuer (or contract token), with its tags",
			},
		},
		{
			name: "projectSlug",
			type: "text",
			index: true,
			admin: {
				description:
					"Directory project; null for network venues and unattributed holders",
			},
		},
		{
			name: "venue",
			type: "text",
			required: true,
			admin: {
				description: "Protocol, publisher, stellar-classic-amm or holder",
			},
		},
		{
			name: "kind",
			type: "select",
			options: [...TOKEN_INTEGRATION_KINDS],
			required: true,
			index: true,
		},
		{
			name: "tier",
			type: "select",
			options: [...TOKEN_INTEGRATION_TIERS],
			required: true,
			index: true,
		},
		{ name: "tierBasis", type: "text", required: true },
		{ name: "pools", type: "number", required: true },
		{
			// json, not a group: only the tiers present are stored
			name: "poolsByTier",
			type: "json",
		},
		{ name: "firstDate", type: "text" },
		{ name: "firstDateBasis", type: "text" },
		{ name: "lastSeenAt", type: "text" },
		{ name: "events90d", type: "number" },
		{ name: "events90dBasis", type: "text" },
		{
			name: "balance",
			type: "text",
			admin: {
				description:
					"Exact decimal string: the token held across this row's pools",
			},
		},
		{ name: "balanceUsd", type: "number" },
		{ name: "balanceBasis", type: "text" },
		{ name: "depthUsd", type: "number" },
		{ name: "depthBasis", type: "text" },
		{ name: "bestPool", type: "text" },
		{ name: "evidenceUrl", type: "text" },
		{ name: "method", type: "text" },
		{ name: "attributionBasis", type: "text" },
		{
			name: "source",
			type: "text",
			required: true,
			admin: {
				description:
					"The read this row comes from; a row ends only when that read finished",
			},
		},
		{ name: "holderSweep", type: "json" },
		{ name: "readAt", type: "text", required: true },
		{
			name: "status",
			type: "select",
			options: [...TOKEN_INTEGRATION_STATUSES],
			required: true,
			index: true,
		},
		{ name: "endedAt", type: "text" },
		{ name: "endedReason", type: "text" },
	],
};
