import type { CollectionConfig } from "payload";
import { adminOnly, isAdmin } from "./access";

export const Users: CollectionConfig = {
	slug: "users",
	admin: {
		useAsTitle: "email",
	},
	auth: true,
	// Admins only, for every operation. Payload's login, forgot-password,
	// reset-password and first-user routes read the store directly or with
	// overrideAccess, so they do not depend on these rules; /api/users/me
	// reads with the caller's access, which an admin passes.
	access: {
		read: adminOnly,
		create: adminOnly,
		update: adminOnly,
		delete: adminOnly,
		unlock: adminOnly,
		admin: ({ req }) => isAdmin(req.user),
	},
	fields: [
		// Email added by default
		// Add more fields as needed
	],
};
