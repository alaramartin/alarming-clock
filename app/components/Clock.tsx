"use client";
import { digital } from "../ui/fonts";
import { useState, useRef, useEffect } from "react";

const Clock = () => {
	const [time, setTime] = useState("");
	const timeRef = useRef(time);
	useEffect(() => {
		timeRef.current = time;
	}, [time]);

	useEffect(() => {
		function showTime() {
			timeRef.current = new Date().toLocaleTimeString();
			setTime(timeRef.current);
		}
		const interval = setInterval(showTime, 50);
		return () => clearInterval(interval);
	}, [time]);

	return (
		<div className={`${digital.className} text-textred text-9xl`}>
			{time}
			{/* alara martin */}
		</div>
	);
};

export default Clock;
