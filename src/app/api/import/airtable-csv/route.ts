import fs from "node:fs";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import configPromise from "@/payload.config";

// Category mapping from Airtable to our schema
const categoryMapping: Record<string, string> = {
	AMM: "Protocol/Contract",
	"Block Explorer": "Infrastructure",
	Bridge: "Partner Integration",
	"Collatralized Stablecoin": "Asset",
	"Content & News": "User-Facing App",
	"DAO & Governance": "Protocol/Contract",
	"Data & Onchain Tools": "Tooling",
	"Dev Tools": "Tooling",
	DEX: "Protocol/Contract",
	"Domain Service": "User-Facing App",
	"Education & Accelerator": "User-Facing App",
	Gaming: "User-Facing App",
	IDE: "Tooling",
	Indexing: "Infrastructure",
	"Lending & Borrowing": "Protocol/Contract",
	NFT: "User-Facing App",
	Oracle: "Infrastructure",
	Payments: "Anchor",
	"RPC & Nodes": "Infrastructure",
	RWA: "Asset",
	Stablecoin: "Asset",
	"Sustainability & Public Goods": "User-Facing App",
	Wallet: "User-Facing App",
};

// Type mapping for additional classification
const typeMapping: Record<string, string[]> = {
	AMM: ["DEX"],
	"Block Explorer": ["Explorer"],
	Bridge: ["Bridge"],
	DEX: ["DEX"],
	Indexing: ["Indexer"],
	Payments: ["Payments", "Anchor"],
	Wallet: ["Wallet"],
	"RPC & Nodes": ["Other"],
	Oracle: ["Other"],
};

interface CSVRow {
	slug: string;
	title: string;
	logo: string;
	image: string;
	imageAlt: string;
	websiteName: string;
	link: string;
	labelCategory: string;
	mainnet: boolean;
	soroban: boolean;
	comingSoon: boolean;
	moneygram: boolean;
	youtube: boolean;
	spotify: boolean;
	description: string;
}

function parseCSVLine(line: string): string[] {
	const result: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];

		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
		} else if (char === "," && !inQuotes) {
			result.push(current.trim());
			current = "";
		} else {
			current += char;
		}
	}
	result.push(current.trim());

	return result;
}

function parseCSV(content: string): CSVRow[] {
	const lines = content.split("\n");
	const headers = parseCSVLine(lines[0]);
	const rows: CSVRow[] = [];

	// Handle multi-line entries (description might span multiple lines)
	let currentEntry = "";
	for (let i = 1; i < lines.length; i++) {
		currentEntry += (currentEntry ? "\n" : "") + lines[i];

		// Check if we have a complete entry (count quotes to see if we're inside a quoted field)
		const quoteCount = (currentEntry.match(/"/g) || []).length;
		if (quoteCount % 2 === 0 && currentEntry.trim()) {
			const values = parseCSVLine(currentEntry);
			if (values.length >= headers.length - 1) {
				// Allow slightly shorter rows
				rows.push({
					slug: values[0] || "",
					title: values[1] || "",
					logo: values[2] || "",
					image: values[3] || "",
					imageAlt: values[4] || "",
					websiteName: values[5] || "",
					link: values[6] || "",
					labelCategory: values[7] || "",
					mainnet: values[8]?.toLowerCase() === "checked",
					soroban: values[9]?.toLowerCase() === "checked",
					comingSoon: values[10]?.toLowerCase() === "checked",
					moneygram: values[11]?.toLowerCase() === "checked",
					youtube: values[12]?.toLowerCase() === "checked",
					spotify: values[13]?.toLowerCase() === "checked",
					description: values[14] || "",
				});
			}
			currentEntry = "";
		}
	}

	return rows;
}

// Extract image URL from the logo field
// Format: "filename.png (https://url...)"
function extractImageUrl(logoField: string): string | null {
	const match = logoField.match(/\((https?:\/\/[^)]+)\)/);
	return match ? match[1] : null;
}

// Extract filename from logo field
function extractFilename(logoField: string): string {
	const match = logoField.match(/^([^(]+)/);
	const filename = match ? match[1].trim() : "logo.png";
	return filename;
}

// Download image and return buffer
async function downloadImage(
	url: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
	try {
		const response = await fetch(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
				Accept: "image/*,*/*;q=0.8",
			},
		});

		if (!response.ok) {
			return null;
		}

		const contentType = response.headers.get("content-type") || "image/png";
		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		return { buffer, contentType };
	} catch (error) {
		return null;
	}
}

// Map MIME type to file extension
function getExtension(contentType: string, originalFilename: string): string {
	const mimeToExt: Record<string, string> = {
		"image/png": ".png",
		"image/jpeg": ".jpg",
		"image/jpg": ".jpg",
		"image/gif": ".gif",
		"image/webp": ".webp",
		"image/svg+xml": ".svg",
	};

	// Try to get from content type
	const ext = mimeToExt[contentType.split(";")[0]];
	if (ext) return ext;

	// Fall back to original filename extension
	const originalExt = path.extname(originalFilename).toLowerCase();
	if (originalExt) return originalExt;

	return ".png";
}

// Normalize website link
function normalizeLink(link: string): string {
	if (!link) return "";
	link = link.trim();
	if (link.startsWith("http://") || link.startsWith("https://")) {
		return link;
	}
	return `https://${link}`;
}

/**
 * API Route: Import projects from Airtable CSV
 *
 * This endpoint imports projects from the CSV file with image uploads.
 * Images are downloaded and uploaded to R2 storage via Payload.
 *
 * Security: Protected by CRON_SECRET (same as other cron jobs)
 *
 * Usage:
 *   POST /api/import/airtable-csv
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Or via curl:
 *   curl -X POST https://yourdomain.com/api/import/airtable-csv \
 *     -H "Authorization: Bearer <CRON_SECRET>"
 */
export async function POST(request: NextRequest) {
	// Verify this is an authorized request
	const authHeader = request.headers.get("authorization");
	const cronSecret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;

	if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		// Read CSV file from scripts directory
		// In production, this file should be in the repository
		const csvPath = path.join(process.cwd(), "scripts", "airtable_import.csv");

		if (!fs.existsSync(csvPath)) {
			return NextResponse.json(
				{ error: `CSV file not found at: ${csvPath}` },
				{ status: 404 },
			);
		}

		const csvContent = fs.readFileSync(csvPath, "utf-8");
		const rows = parseCSV(csvContent);

		// Initialize Payload
		const payload = await getPayload({
			config: configPromise,
		});

		// Track stats
		let created = 0;
		let skipped = 0;
		let errors = 0;
		const errorDetails: string[] = [];

		for (const row of rows) {
			try {
				// Check if project already exists
				const existing = await payload.find({
					collection: "projects",
					where: {
						slug: { equals: row.slug },
					},
					limit: 1,
				});

				if (existing.docs.length > 0) {
					skipped++;
					continue;
				}

				// Upload logo if available
				let logoId: string | null = null;
				const logoUrl = extractImageUrl(row.logo);

				if (logoUrl) {
					const imageData = await downloadImage(logoUrl);
					if (imageData) {
						try {
							const originalFilename = extractFilename(row.logo);
							const ext = getExtension(imageData.contentType, originalFilename);
							const safeFilename = `${row.slug}-logo${ext}`;

							// Create media entry using Payload's upload
							const media = await payload.create({
								collection: "media",
								data: {
									alt: `${row.title} logo`,
								},
								file: {
									data: imageData.buffer,
									name: safeFilename,
									mimetype: imageData.contentType,
									size: imageData.buffer.length,
								},
							});

							logoId = String(media.id);
						} catch (uploadError) {
							// Log but don't fail the entire import
							errorDetails.push(
								`Logo upload failed for ${row.title}: ${uploadError instanceof Error ? uploadError.message : "Unknown error"}`,
							);
						}
					}
				}

				// Determine category
				const category =
					categoryMapping[row.labelCategory] || "User-Facing App";

				// Determine types
				const types = typeMapping[row.labelCategory] || ["Other"];

				// Determine status
				let status: "Draft" | "Development" | "Pre-Release" | "Live" = "Live";
				if (row.comingSoon) {
					status = "Development";
				}

				// Create project
				const projectData: any = {
					name: row.title,
					slug: row.slug,
					shortDescription: row.description || undefined,
					category,
					types,
					status,
					links: {
						website: normalizeLink(row.link) || undefined,
					},
					verificationLevel: "Unverified",
					provenance: {
						source: "LumenloopSeed",
						sourceId: `airtable-${row.slug}`,
						firstSeenAt: new Date().toISOString(),
					},
				};

				// Add logo if uploaded
				if (logoId) {
					projectData.logo = logoId;
				}

				await payload.create({
					collection: "projects",
					data: projectData,
				});

				created++;

				// Small delay to avoid overwhelming the server
				await new Promise((r) => setTimeout(r, 100));
			} catch (error) {
				errors++;
				errorDetails.push(
					`Error processing ${row.title}: ${error instanceof Error ? error.message : "Unknown error"}`,
				);
			}
		}

		return NextResponse.json({
			success: true,
			stats: {
				created,
				skipped,
				errors,
				total: rows.length,
			},
			errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
			message: `Import completed: ${created} created, ${skipped} skipped, ${errors} errors`,
		});
	} catch (error) {
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 },
		);
	}
}

// Also support GET for easier triggering
export async function GET(request: NextRequest) {
	return POST(request);
}
