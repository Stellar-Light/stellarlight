import type { Access } from "payload";

/**
 * Who counts as an admin.
 *
 * Payload sets `req.user` for a token from ANY auth-enabled collection — its
 * JWT strategy resolves `payload.collections[token.collection]` and returns
 * that user. This repo has two auth collections: `users` (admins) and
 * `partner-accounts` (partners, who log in through the partner portal). So
 * `!!req.user` does NOT mean "an admin is asking" — it means "somebody is
 * logged in", which includes every partner.
 *
 * Always gate private collections on the collection the user came from.
 */
export const isAdmin = (
	user: { collection?: string } | null | undefined,
): boolean => user?.collection === "users";

/**
 * The rule for anything only an admin may do. Payload's own default for an
 * operation a collection leaves out is "any logged-in user", which includes
 * every partner, so every collection states each operation explicitly
 * (src/collections/__tests__/access.test.ts fails if one does not).
 */
export const adminOnly: Access = ({ req }) => isAdmin(req.user);
