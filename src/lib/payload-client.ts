import { getPayload } from "payload";
import configPromise from "@/payload.config";

/**
 * Safely get Payload instance with error handling
 * Returns null if connection fails, allowing pages to render gracefully
 */
export async function getPayloadSafe() {
	try {
		return await getPayload({ config: configPromise });
	} catch (error) {
		console.error("Failed to connect to MongoDB:", error);
		// Return null to allow pages to render with empty data
		return null;
	}
}

