"use client";

import { useEffect, useState } from "react";

interface TypewriterProps {
	text: string[];
	speed?: number;
	deleteSpeed?: number;
	waitTime?: number;
	className?: string;
	cursorChar?: string;
	whiteTextWords?: string[];
}

export default function Typewriter({
	text,
	speed = 100,
	deleteSpeed = 50,
	waitTime = 2000,
	className = "",
	cursorChar = "_",
	whiteTextWords = [],
}: TypewriterProps) {
	const [displayedText, setDisplayedText] = useState("");
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isDeleting, setIsDeleting] = useState(false);
	const [showCursor, setShowCursor] = useState(true);

	useEffect(() => {
		const currentWord = text[currentIndex];

		if (!isDeleting && displayedText === currentWord) {
			const timeout = setTimeout(() => setIsDeleting(true), waitTime);
			return () => clearTimeout(timeout);
		}

		if (isDeleting && displayedText === "") {
			setIsDeleting(false);
			setCurrentIndex((prev) => (prev + 1) % text.length);
			return;
		}

		const timeout = setTimeout(
			() => {
				setDisplayedText((prev) => {
					if (isDeleting) {
						return currentWord.substring(0, prev.length - 1);
					} else {
						return currentWord.substring(0, prev.length + 1);
					}
				});
			},
			isDeleting ? deleteSpeed : speed,
		);

		return () => clearTimeout(timeout);
	}, [
		displayedText,
		isDeleting,
		currentIndex,
		text,
		speed,
		deleteSpeed,
		waitTime,
	]);

	useEffect(() => {
		const cursorInterval = setInterval(() => {
			setShowCursor((prev) => !prev);
		}, 530);

		return () => clearInterval(cursorInterval);
	}, []);

	const currentWord = text[currentIndex];
	const isWhiteText = whiteTextWords.includes(currentWord);

	return (
		<span className={isWhiteText ? "text-foreground" : className}>
			{displayedText}
			<span className={showCursor ? "opacity-100" : "opacity-0"}>
				{cursorChar}
			</span>
		</span>
	);
}
