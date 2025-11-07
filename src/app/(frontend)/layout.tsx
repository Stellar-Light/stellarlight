import React from "react";
import { Inter, Source_Serif_4, JetBrains_Mono } from "next/font/google";
import "../globals.css";
import { Navigation } from "@/components/ui/navigation";
import Footer from "@/components/footer";

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

export const metadata = {
	description:
		"Stellar Ecosystem Directory - Discover projects, tools, and organizations building on Stellar.",
	title: "StellarLight - Stellar Ecosystem Directory",
};

export default async function RootLayout(props: { children: React.ReactNode }) {
	const { children } = props;

  return (
		<html lang="en" suppressHydrationWarning className={`dark ${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable}`}>
			<body className="min-h-screen font-sans antialiased">
				<Navigation />
				<main className="min-h-[calc(100vh-4rem)]">{children}</main>
				<Footer />
      </body>
    </html>
	);
}
