"use client";

import { useEffect, useState } from "react";

const MESSAGES = ["Alara Martin.", "Try typing something!"];
const HOLD_MS = [7000, 4000];
const FADE_MS = 500;

const CyclingTitle = () => {
	const [index, setIndex] = useState(0);
	const [visible, setVisible] = useState(true);

	useEffect(() => {
		const fadeOut = setTimeout(() => setVisible(false), HOLD_MS[index]);
		const swap = setTimeout(() => {
			setIndex((i) => (i + 1) % MESSAGES.length);
			setVisible(true);
		}, HOLD_MS[index] + FADE_MS);

		return () => {
			clearTimeout(fadeOut);
			clearTimeout(swap);
		};
	}, [index]);

	return (
		<p
			className="transition-opacity ease-in-out"
			style={{
				opacity: visible ? 1 : 0,
				transitionDuration: `${FADE_MS}ms`,
			}}
		>
			{MESSAGES[index]}
		</p>
	);
};

export default CyclingTitle;
