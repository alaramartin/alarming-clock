import Image from "next/image";
import { ArrowSquareOutIcon, GithubLogoIcon } from "@phosphor-icons/react";
import Link from "next/link";

type Project = {
	name: string;
	githubLink: string;
	href?: string;
	miniDescription?: string;
	description: string;
	notes?: string[];
	tags: string[];
	year: number;
	imageFilename?: string;
};

interface ProjectCardProps {
	project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
	return (
		<div className="flex flex-col p-4 items-center w-full h-70 justify-between">
			<div className="h-3/4 group relative rounded-md border border-textwhite/80 hover:border-textwhite w-[99%] hover:w-full hover:h-[76%] transition-all duration-100 items-center text-center justify-center flex">
				{project.href && (
					<div className="rounded-full absolute top-2 right-2 bg-gray-500/70 opacity-70 group-hover:opacity-90 hover:opacity-100 transition-all duration-100 cursor-pointer p-1.5">
						<Link
							href={project.href}
							target="_blank"
							rel="noopener noreferrer"
						>
							<ArrowSquareOutIcon size={22} />
						</Link>
					</div>
				)}
				{project.imageFilename ? (
					<Image
						src={`/images/${project.imageFilename}`}
						alt={`project demo`}
						width={362}
						height={185}
						className="w-full h-full object-cover rounded-md"
					></Image>
				) : (
					<div>Demo image coming soon...</div>
				)}
			</div>

			<div className="flex flex-col h-1/5 w-full">
				<div className="flex justify-between items-center">
					<p className="text-gray-300 text-lg">{project.name}</p>
					<div>
						<Link
							href={project.githubLink}
							target="_blank"
							rel="noopener noreferrer"
						>
							<GithubLogoIcon size={22} />
						</Link>
					</div>
				</div>
				<p className="w-full text-left text-sm text-gray-400 italic">
					{project.miniDescription}
				</p>
			</div>
		</div>
	);
}
