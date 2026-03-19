"use client";

import React from "react";

export const AfterNavLinks: React.FC = () => {
	const linkStyle = {
		display: "flex",
		alignItems: "center",
		gap: "0.75rem",
		padding: "0.75rem 1rem",
		color: "var(--theme-text)",
		textDecoration: "none",
		borderRadius: "4px",
		transition: "background-color 0.2s",
		marginTop: "0.5rem",
		fontSize: "14px",
	};

	return (
		<>
			<a
				href="/admin/rss-management"
				style={linkStyle}
				onMouseEnter={(e) => {
					e.currentTarget.style.backgroundColor = "var(--theme-elevation-2)";
				}}
				onMouseLeave={(e) => {
					e.currentTarget.style.backgroundColor = "transparent";
				}}
				title="RSS Management"
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					style={{ flexShrink: 0 }}
				>
					<path d="M4 11a9 9 0 0 1 9 9" />
					<path d="M4 4a16 16 0 0 1 16 16" />
					<circle cx="5" cy="19" r="1" />
				</svg>
				<span style={{ fontWeight: 500 }}>RSS Management</span>
			</a>
			<a
				href="/"
				style={linkStyle}
				onMouseEnter={(e) => {
					e.currentTarget.style.backgroundColor = "var(--theme-elevation-2)";
				}}
				onMouseLeave={(e) => {
					e.currentTarget.style.backgroundColor = "transparent";
				}}
				title="Go to Home"
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					style={{ flexShrink: 0 }}
				>
					<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
					<polyline points="9 22 9 12 15 12 15 22" />
				</svg>
				<span style={{ fontWeight: 500 }}>Home</span>
			</a>
		</>
	);
};

