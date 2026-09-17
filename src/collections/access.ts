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
