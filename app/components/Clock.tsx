"use client";
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
			console.log(time);
			setTime(timeRef.current);
		}
		const interval = setInterval(showTime, 1000);
		return () => clearInterval(interval);
	}, [time]);

	return <div>{time}</div>;
};

export default Clock;
