import React from "react";
import { Inter, Source_Serif_4, JetBrains_Mono } from "next/font/google";
import type { Metadata } from "next";
import "../globals.css";
import { Navigation } from "@/components/ui/navigation";
import Footer from "@/components/footer";
import { Providers } from "@/components/providers";

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-sans",
	display: "swap",
});

const sourceSerif = Source_Serif_4({
	subsets: ["latin"],
	variable: "--font-serif",
	display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
	subsets: ["latin"],
	variable: "--font-mono",
	display: "swap",
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://stellarlight.io";

export const metadata: Metadata = {
	metadataBase: new URL(appUrl),
	title: {
		default: "StellarLight - Stellar Ecosystem Directory",
		template: "%s | StellarLight",
	},
	description:
		"Stellar Ecosystem Directory - Discover projects, tools, and organizations building on Stellar.",
	keywords: [
		"Stellar",
		"Stellar blockchain",
		"Stellar ecosystem",
		"Stellar projects",
		"XLM",
		"cryptocurrency",
		"blockchain directory",
		"Stellar network",
	],
	authors: [{ name: "StellarLight" }],
	creator: "StellarLight",
	publisher: "StellarLight",
	formatDetection: {
		email: false,
		address: false,
		telephone: false,
	},
	icons: {
		icon: [
			{ url: "/favicon.ico", sizes: "any" },
			{ url: "/favicon.ico", type: "image/x-icon" },
		],
		shortcut: "/favicon.ico",
		apple: "/favicon.ico",
	},
	manifest: "/favicon.ico",
	openGraph: {
		type: "website",
		locale: "en_US",
		url: appUrl,
		siteName: "StellarLight",
		title: "StellarLight - Stellar Ecosystem Directory",
		description:
			"Stellar Ecosystem Directory - Discover projects, tools, and organizations building on Stellar.",
		images: [
			{
				url: "/opengraph.png",
				width: 1200,
				height: 630,
				alt: "StellarLight - Stellar Ecosystem Directory",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: "StellarLight - Stellar Ecosystem Directory",
		description:
			"Stellar Ecosystem Directory - Discover projects, tools, and organizations building on Stellar.",
		images: ["/opengraph.png"],
		creator: "@StellarLight",
	},
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-video-preview": -1,
			"max-image-preview": "large",
			"max-snippet": -1,
		},
	},
	verification: {
		// Add verification codes here if needed
		// google: "your-google-verification-code",
		// yandex: "your-yandex-verification-code",
	},
};

export default async function RootLayout(props: { children: React.ReactNode }) {
	const { children } = props;

  return (
		<html lang="en" suppressHydrationWarning className={`dark ${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable}`}>
			<body className="min-h-screen font-sans antialiased">
				<Providers>
					<Navigation />
					<main className="min-h-[calc(100vh-4rem)]">{children}</main>
					<Footer />
				</Providers>
      </body>
    </html>
	);
}
