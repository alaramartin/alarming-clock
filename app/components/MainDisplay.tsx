"use client";
import Home from "./Home";
import Projects from "./Projects";
import Contact from "./Contact";
import { useState } from "react";

const MainDisplay = () => {
	// default to homepage (just the clock)
	const [selectedTab, setTab] = useState("home");

	// todo: make the Tab element

	return (
		<div className="flex flex-col">
			<div className="text-right space-x-3 text-textwhite">
				<button
					onClick={() => setTab("home")}
					className="cursor-pointer"
				>
					Home
				</button>
				<button
					onClick={() => setTab("projects")}
					className="cursor-pointer"
				>
					Projects
				</button>
				<button
					onClick={() => setTab("contact")}
					className="cursor-pointer"
				>
					Contact
				</button>
			</div>
			<div className="flex flex-col items-center text-textwhite border-8 border-gray-500 justify-center rounded-2xl w-[54em] h-[27em]">
				{selectedTab === "home" && <Home />}
				{selectedTab === "projects" && <Projects />}
				{selectedTab === "contact" && <Contact />}
			</div>
		</div>
	);
};

export default MainDisplay;
