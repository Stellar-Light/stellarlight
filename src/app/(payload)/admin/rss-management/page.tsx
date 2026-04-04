"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@payloadcms/ui";
import "./styles.css";

type RSSFeed = {
	id: string;
	name: string;
	feedUrl: string;
	enabled: boolean;
	syncFrequency: string;
	lastSyncedAt?: string;
	totalPostsImported?: number;
};

export default function RSSManagementPage() {
	const { user } = useAuth();
	const [feeds, setFeeds] = useState<RSSFeed[]>([]);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [isLoading, setIsLoading] = useState(true);
	const [isSyncing, setIsSyncing] = useState(false);
	const [syncStatus, setSyncStatus] = useState<string>("");
	const [jobId, setJobId] = useState<string>("");

	// Fetch RSS feeds
	useEffect(() => {
		if (!user) return;

		const fetchFeeds = async () => {
			try {
				const response = await fetch("/api/rss-feeds?limit=100");
				const data = await response.json();
				setFeeds(data.docs || []);
			} catch (error) {
				// Silently handle fetch errors
			} finally {
				setIsLoading(false);
			}
		};

		fetchFeeds();
	}, [user]);

	const toggleSelection = (id: string) => {
		const newSelection = new Set(selectedIds);
		if (newSelection.has(id)) {
			newSelection.delete(id);
		} else {
			newSelection.add(id);
		}
		setSelectedIds(newSelection);
	};

	const toggleSelectAll = () => {
		if (selectedIds.size === feeds.length) {
			setSelectedIds(new Set());
		} else {
			setSelectedIds(new Set(feeds.map((f) => f.id)));
		}
	};

	const syncAll = async () => {
		if (!user) return;

		setIsSyncing(true);
		setSyncStatus("Queueing RSS sync job...");
		setJobId("");

		try {
			const response = await fetch("/api/sync/rss", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				credentials: "include",
			});

			const result = await response.json();

			if (result.success) {
				setJobId(result.jobId);
				setSyncStatus(`✓ ${result.message || "Job queued successfully!"}`);
			} else {
				setSyncStatus(`✗ Failed to queue job: ${result.error || "Unknown error"}`);
			}
		} catch (error) {
			setSyncStatus(`✗ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
		} finally {
			setIsSyncing(false);
		}
	};

	const syncSelected = async () => {
		if (!user || selectedIds.size === 0) return;

		setIsSyncing(true);
		setSyncStatus(`Queueing ${selectedIds.size} sync job(s)...`);
		setJobId("");

		try {
			const results = await Promise.all(
				Array.from(selectedIds).map(async (id) => {
					const response = await fetch(`/api/sync/rss/${id}`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						credentials: "include",
					});
					return response.json();
				}),
			);

			const successful = results.filter((r) => r.success).length;
			const failed = results.length - successful;

			setSyncStatus(
				`✓ Queued ${successful} job(s) successfully! ${failed > 0 ? `${failed} failed.` : "Check the Jobs panel to monitor progress."}`,
			);
		} catch (error) {
			setSyncStatus(`✗ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
		} finally {
			setIsSyncing(false);
			setSelectedIds(new Set());
		}
	};

	if (!user) {
		return (
			<div className="rss-management">
				<div className="rss-management__empty">
					<p>Please log in to access RSS Management.</p>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="rss-management">
				<div className="rss-management__loading">
					<div className="rss-management__spinner"></div>
					<p>Loading RSS feeds...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="rss-management">
			<div className="rss-management__header">
				<div>
					<div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
						<a
							href="/admin"
							className="rss-management__back-button"
							title="Back to Admin Dashboard"
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M19 12H5M12 19l-7-7 7-7" />
							</svg>
							Back to Admin
						</a>
						<h1 className="rss-management__title" style={{ margin: 0 }}>RSS Feed Management</h1>
					</div>
					<p className="rss-management__description">
						Manage and sync RSS feeds to import blog posts
					</p>
				</div>
			</div>

			{/* Action Bar */}
			<div className="rss-management__actions">
				<button
					onClick={syncAll}
					disabled={isSyncing}
					className="rss-management__button rss-management__button--primary"
				>
					{isSyncing ? "Syncing..." : "Sync All Enabled Feeds"}
				</button>

				<button
					onClick={syncSelected}
					disabled={isSyncing || selectedIds.size === 0}
					className={`rss-management__button ${
						selectedIds.size > 0
							? "rss-management__button--success"
							: "rss-management__button--disabled"
					}`}
				>
					Sync Selected ({selectedIds.size})
				</button>

				<a
					href="/admin/collections/rss-feeds/create"
					className="rss-management__button rss-management__button--secondary"
				>
					Add New Feed
				</a>
			</div>

			{/* Status Message */}
			{syncStatus && (
				<div
					className={`rss-management__status ${
						syncStatus.startsWith("✓")
							? "rss-management__status--success"
							: "rss-management__status--error"
					}`}
				>
					<div>{syncStatus}</div>
					{jobId && (
						<div style={{ marginTop: "0.75rem", fontSize: "0.875rem" }}>
							<a
								href={`/admin/collections/payload-jobs/${jobId}`}
								className="rss-management__job-link"
								target="_blank"
								rel="noopener noreferrer"
							>
								View Job Details →
							</a>
						</div>
					)}
					<div style={{ marginTop: "0.75rem", fontSize: "0.875rem", opacity: 0.9 }}>
						💡 All sync operations now run in the background. Visit{" "}
						<a
							href="/admin/collections/payload-jobs"
							className="rss-management__job-link"
							target="_blank"
							rel="noopener noreferrer"
						>
							Sync Jobs
						</a>{" "}
						to monitor progress and view completed jobs.
					</div>
				</div>
			)}

			{/* Feeds Table */}
			<div className="rss-management__table-container">
				<table className="rss-management__table">
					<thead>
						<tr>
							<th className="rss-management__th rss-management__th--checkbox">
								<input
									type="checkbox"
									checked={selectedIds.size === feeds.length && feeds.length > 0}
									onChange={toggleSelectAll}
									className="rss-management__checkbox"
								/>
							</th>
							<th className="rss-management__th">Name</th>
							<th className="rss-management__th">Feed URL</th>
							<th className="rss-management__th rss-management__th--center">
								Enabled
							</th>
							<th className="rss-management__th rss-management__th--center">
								Frequency
							</th>
							<th className="rss-management__th rss-management__th--center">
								Posts
							</th>
							<th className="rss-management__th">Last Synced</th>
							<th className="rss-management__th rss-management__th--center">
								Actions
							</th>
						</tr>
					</thead>
					<tbody>
						{feeds.length === 0 ? (
							<tr>
								<td colSpan={8} className="rss-management__empty-cell">
									No RSS feeds found. Create one to get started.
								</td>
							</tr>
						) : (
							feeds.map((feed) => (
								<tr
									key={feed.id}
									className={`rss-management__row ${
										selectedIds.has(feed.id) ? "rss-management__row--selected" : ""
									}`}
								>
									<td className="rss-management__td">
										<input
											type="checkbox"
											checked={selectedIds.has(feed.id)}
											onChange={() => toggleSelection(feed.id)}
											className="rss-management__checkbox"
										/>
									</td>
									<td className="rss-management__td rss-management__td--name">
										{feed.name}
									</td>
									<td className="rss-management__td rss-management__td--url">
										{feed.feedUrl}
									</td>
									<td className="rss-management__td rss-management__td--center">
										<span
											className={`rss-management__badge ${
												feed.enabled
													? "rss-management__badge--success"
													: "rss-management__badge--error"
											}`}
										>
											{feed.enabled ? "Yes" : "No"}
										</span>
									</td>
									<td className="rss-management__td rss-management__td--center rss-management__td--small">
										{feed.syncFrequency}
									</td>
									<td className="rss-management__td rss-management__td--center rss-management__td--bold">
										{feed.totalPostsImported || 0}
									</td>
									<td className="rss-management__td rss-management__td--small">
										{feed.lastSyncedAt
											? new Date(feed.lastSyncedAt).toLocaleString()
											: "Never"}
									</td>
									<td className="rss-management__td rss-management__td--center">
										<a
											href={`/admin/collections/rss-feeds/${feed.id}`}
											className="rss-management__edit-link"
										>
											Edit
										</a>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

