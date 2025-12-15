"use client";
import Home from "./Home";
import Projects from "./Projects";
import Contact from "./Contact";
import Tab from "./Tab";
import { useState } from "react";

const tabTypes: string[] = ["Home", "Projects", "Contact"];

const MainDisplay = () => {
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

			<div className="flex flex-col items-center text-textwhite border border-gray-500 justify-center rounded-2xl w-full h-1/2 md:w-[54em] md:h-[27em] overflow-y-auto z-10">
				{selectedTab === "Home" && <Home />}
				{selectedTab === "Projects" && <Projects />}
				{selectedTab === "Contact" && <Contact />}
			</div>
		</div>
	);
};

export default MainDisplay;
