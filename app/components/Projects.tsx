import { projects } from "../data/projects";
import ProjectCard from "./ProjectCard";

const Projects = () => {
	return (
		<div className="flex flex-col w-full h-full p-6 self-stretch items-start">
			<h1>My Projects</h1>
			<div className="flex flex-wrap w-full h-full items-stretch">
				{projects.map((project, index) => (
					<div key={index} className="flex-none w-1/2">
						<ProjectCard project={project} />
					</div>
				))}
			</div>
		</div>
	);
};

export default Projects;
