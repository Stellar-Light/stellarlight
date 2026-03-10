"use client";

import React, { useState } from "react";
import { useAuth } from "@payloadcms/ui";

export const AirtableSyncButton: React.FC = () => {
	const { user } = useAuth();
	const [isRunning, setIsRunning] = useState(false);
	const [result, setResult] = useState<{
		success: boolean;
		stats?: any;
		error?: string;
	} | null>(null);

	const handleSync = async () => {
		if (!user) return;

		setIsRunning(true);
		setResult(null);

		try {
			const response = await fetch(`/api/import/airtable`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				credentials: "include",
			});

			const data = await response.json();

			if (response.ok) {
				setResult({
					success: true,
					stats: data.stats,
				});
			} else {
				setResult({
					success: false,
					error: data.error || "Import failed",
				});
			}
		} catch (error) {
			setResult({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			setIsRunning(false);
		}
	};

	if (!user) return null;

	return (
		<div
			style={{
				padding: "20px",
				border: "1px solid var(--theme-border-color)",
				borderRadius: "4px",
				marginBottom: "20px",
				backgroundColor: "var(--theme-elevation-1)",
			}}
		>
			<h3
				style={{
					marginTop: 0,
					marginBottom: "12px",
					fontSize: "16px",
					fontWeight: 600,
					color: "var(--theme-text)",
				}}
			>
				Airtable Import
			</h3>
			<p
				style={{
					marginBottom: "16px",
					color: "var(--theme-text-muted)",
					fontSize: "14px",
				}}
			>
				Import projects from Airtable. This will fetch all records from the configured Airtable base and create or update projects.
			</p>
			<button
				onClick={handleSync}
				disabled={isRunning}
				style={{
					padding: "8px 16px",
					backgroundColor: isRunning
						? "var(--theme-elevation-3)"
						: "var(--theme-btn-primary)",
					color: isRunning
						? "var(--theme-text-muted)"
						: "var(--theme-btn-primary-text)",
					border: "none",
					borderRadius: "4px",
					cursor: isRunning ? "not-allowed" : "pointer",
					fontSize: "14px",
					fontWeight: 500,
					transition: "all 0.2s",
				}}
			>
				{isRunning ? "Importing..." : "Import from Airtable"}
			</button>

			{result && (
				<div
					style={{
						marginTop: "16px",
						padding: "12px",
						backgroundColor: result.success
							? "rgba(16, 185, 129, 0.1)"
							: "rgba(239, 68, 68, 0.1)",
						border: `1px solid ${
							result.success ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"
						}`,
						borderRadius: "4px",
					}}
				>
					{result.success ? (
						<div>
							<p
								style={{
									margin: 0,
									marginBottom: "8px",
									fontWeight: 600,
									color: "#10b981",
								}}
							>
								✓ Import Completed Successfully
							</p>
							{result.stats && (
								<div style={{ fontSize: "13px", color: "var(--theme-text-muted)" }}>
									<p style={{ margin: "4px 0" }}>
										Inserted: <strong>{result.stats.inserted || 0}</strong>
									</p>
									<p style={{ margin: "4px 0" }}>
										Updated: <strong>{result.stats.updated || 0}</strong>
									</p>
									<p style={{ margin: "4px 0" }}>
										Skipped: <strong>{result.stats.skipped || 0}</strong>
									</p>
									{result.stats.errors > 0 && (
										<p style={{ margin: "4px 0", color: "#ef4444" }}>
											Errors: <strong>{result.stats.errors}</strong>
										</p>
									)}
								</div>
							)}
						</div>
					) : (
						<p style={{ margin: 0, color: "#ef4444" }}>
							✗ Error: {result.error}
						</p>
					)}
				</div>
			)}
		</div>
	);
};

