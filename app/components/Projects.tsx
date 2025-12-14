import { projects } from "../data/projects";
import ProjectCard from "./ProjectCard";
import { garamond } from "../ui/fonts";

const Projects = () => {
	return (
		<div className="flex flex-col w-full h-full p-2 self-stretch items-start">
			<p className={`text-3xl ${garamond.className} my-2 mx-4`}>
				Projects
			</p>
			<p className="text-sm mb-2 mx-4">
				Some projects I&apos;ve made, mostly in the past few months.
				I&apos;d like to make more. Clock&apos;s ticking.
			</p>
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
