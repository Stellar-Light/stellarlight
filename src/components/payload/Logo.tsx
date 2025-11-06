import React from "react";

export const Logo: React.FC = () => {
	const appUrl = typeof window !== "undefined" 
		? window.location.origin 
		: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

	return (
		<a 
			href={`${appUrl}/`}
			style={{ 
				display: "flex", 
				alignItems: "center", 
				gap: "0.5rem",
				textDecoration: "none",
				cursor: "pointer",
			}}
			title="Go to Home"
		>
			<div style={{ height: "32px", width: "32px", display: "flex", alignItems: "center", justifyContent: "center" }}>
				<img
					src="/logo.png"
					alt="Stellar Light Logo"
					style={{ height: "100%", width: "100%", objectFit: "contain" }}
				/>
			</div>
			<span
				style={{
					color: "#E5E5E5",
					fontWeight: 600,
					fontSize: "16px",
					fontFamily: "Inter, sans-serif",
				}}
			>
				Stellar Light
			</span>
		</a>
	);
};


