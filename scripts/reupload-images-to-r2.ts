import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { getPayload } from "payload";
import configPromise from "../src/payload.config";

// Explicitly load .env and .env.local (dotenv/config may not load .env.local by default)
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

	let currentEntry = "";
	for (let i = 1; i < lines.length; i++) {
		currentEntry += (currentEntry ? "\n" : "") + lines[i];

		const quoteCount = (currentEntry.match(/"/g) || []).length;
		if (quoteCount % 2 === 0 && currentEntry.trim()) {
			const values = parseCSVLine(currentEntry);
			if (values.length >= headers.length - 1) {
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

function extractImageUrl(logoField: string): string | null {
	const match = logoField.match(/\((https?:\/\/[^)]+)\)/);
	return match ? match[1] : null;
}

function extractFilename(logoField: string): string {
	const match = logoField.match(/^([^(]+)/);
	const filename = match ? match[1].trim() : "logo.png";
	return filename;
}

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

function getExtension(contentType: string, originalFilename: string): string {
	const mimeToExt: Record<string, string> = {
		"image/png": ".png",
		"image/jpeg": ".jpg",
		"image/jpg": ".jpg",
		"image/gif": ".gif",
		"image/webp": ".webp",
		"image/svg+xml": ".svg",
	};

	const ext = mimeToExt[contentType.split(";")[0]];
	if (ext) return ext;

	const originalExt = path.extname(originalFilename).toLowerCase();
	if (originalExt) return originalExt;

	return ".png";
}

async function run() {
	// Verify required environment variables are set
	const r2AccessKey = process.env.R2_ACCESS_KEY_ID;
	const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY;
	const r2Bucket = process.env.R2_BUCKET;
	const r2Endpoint = process.env.R2_ENDPOINT;
	const payloadSecret = process.env.PAYLOAD_SECRET;

	if (!payloadSecret) {
		console.error("PAYLOAD_SECRET not found in environment variables");
		process.exit(1);
	}

	if (!r2AccessKey || !r2SecretKey || !r2Bucket || !r2Endpoint) {
		console.error("R2 credentials not found in environment variables");
		process.exit(1);
	}

	// Read CSV file
	const csvPath = path.join(__dirname, "airtable_import.csv");
	if (!fs.existsSync(csvPath)) {
		console.error(`CSV file not found at: ${csvPath}`);
		process.exit(1);
	}

	const csvContent = fs.readFileSync(csvPath, "utf-8");
	const rows = parseCSV(csvContent);

	// Initialize Payload
	const payload = await getPayload({
		config: configPromise,
	});

	// Track stats
	let updated = 0;
	let skipped = 0;
	let errors = 0;

	// Create a map of slug to CSV row for quick lookup
	const csvMap = new Map<string, CSVRow>();
	for (const row of rows) {
		csvMap.set(row.slug, row);
	}

	// Get all projects
	const projects = await payload.find({
		collection: "projects",
		limit: 1000,
	});

	for (const project of projects.docs) {
		try {
			// Find corresponding CSV row
			const csvRow = csvMap.get(project.slug);
			if (!csvRow) {
				skipped++;
				continue;
			}

			// Check if logo URL exists in CSV
			const logoUrl = extractImageUrl(csvRow.logo);
			if (!logoUrl) {
				skipped++;
				continue;
			}

			// Download image
			const imageData = await downloadImage(logoUrl);
			if (!imageData) {
				errors++;
				continue;
			}

			// Upload to R2 via Payload
			try {
				const originalFilename = extractFilename(csvRow.logo);
				const ext = getExtension(imageData.contentType, originalFilename);
				const safeFilename = `${project.slug}-logo${ext}`;

				// Create new media entry (this will upload to R2)
				const media = await payload.create({
					collection: "media",
					data: {
						alt: `${project.name} logo`,
					},
					file: {
						data: imageData.buffer,
						name: safeFilename,
						mimetype: imageData.contentType,
						size: imageData.buffer.length,
					},
				});

				const newLogoId = String(media.id);

				// Update project with new logo
				await payload.update({
					collection: "projects",
					id: project.id,
					data: {
						logo: newLogoId,
					},
				});

				updated++;

				// Small delay to avoid overwhelming the server
				await new Promise((r) => setTimeout(r, 200));
			} catch (uploadError) {
				errors++;
			}
		} catch (error) {
			errors++;
		}
	}

	console.log(
		`Re-upload Summary: ${updated} updated, ${skipped} skipped, ${errors} errors`,
	);
}

run()
	.then(() => {
		process.exit(0);
	})
	.catch((err) => {
		console.error(
			"Re-upload failed:",
			err instanceof Error ? err.message : String(err),
		);
		process.exit(1);
	});
