"use client";
import Home from "./Home";
import Projects from "./Projects";
import Contact from "./Contact";
import Tab from "./Tab";
import { useState } from "react";

const tabTypes: string[] = ["Home", "Projects", "Contact"];

const MainDisplay = () => {
	// default to homepage (just the clock)
	const [selectedTab, setTab] = useState("Home");

	return (
		<div className="flex flex-col">
			<div className="flex flex-row justify-end gap-x-3 text-textwhite mr-4">
				{tabTypes.map((tab, index) => (
					<Tab
						key={index}
						type={tab}
						selected={selectedTab === tab}
						onTabChange={() => setTab(tab)}
					></Tab>
				))}
			</div>
			<div className="flex flex-col items-center text-textwhite border-8 border-gray-500 justify-center rounded-2xl w-[54em] h-[27em] overflow-y-auto">
				{selectedTab === "Home" && <Home />}
				{selectedTab === "Projects" && <Projects />}
				{selectedTab === "Contact" && <Contact />}
			</div>
		</div>
	);
};

export default MainDisplay;
