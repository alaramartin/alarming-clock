"use client";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { GithubLogoIcon } from "@phosphor-icons/react/ssr";

type Commit = {
	repo: string;
	sha: string;
	timestamp: string;
} | null;

const repoToDisplayRepo = (repoName: string) => {
	const toReturn = repoName.split("/");
	return toReturn[toReturn.length - 1];
};

const getLink = (repo: string, sha?: string) => {
	return "https://github.com/" + repo + (sha ? "/commit/" + sha : "");
};

const formatTime = (timestamp: string) => {
	// YYYY-MM-DDTHH:MM:SSZ UTC
	return timestamp;
};

export default function MostRecentCommit() {
	const [commit, setCommit] = useState<Commit>(null);
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;
		const controller = new AbortController();

		async function fetchLatestCommit() {
			try {
				const res = await fetch("/api/github", {
					cache: "no-store",
					signal: controller.signal,
				});
				if (!res.ok) {
					return;
				}
				const data = await res.json().catch(() => null);
				if (mountedRef.current) setCommit(data);
			} catch {
				if (mountedRef.current) setCommit(null);
			}
		}

		fetchLatestCommit();
		const id = setInterval(fetchLatestCommit, 960000);

		return () => {
			mountedRef.current = false;
			controller.abort();
			clearInterval(id);
		};
	}, []);

	if (!commit) return;
	// todo: convert time iso68 or whatever to like "...min/hour/day/wk ago"
	// todo: decide if i also want private repos included
	// 			idea: have a boolean for private/public and have "(private)" next to repo link

	return (
		<div className="border border-gray-500 text-sm rounded-md text-textwhite flex flex-col bg-inherit m-5 px-4 py-3">
			<div className="flex justify-between mb-1">
				<p className="">
					<GithubLogoIcon size={17} />
				</p>
				<p className="text-gray-400 italic">
					{formatTime(commit.timestamp)}
				</p>
			</div>

			<div className="flex">
				<p>
					<Link
						href="https://github.com/alaramartin"
						target="_blank"
						rel="noopener noreferrer"
						className="italic underline text-textred"
					>
						alaramartin
					</Link>{" "}
					made commit{" "}
					<Link
						href={getLink(commit.repo, commit.sha)}
						target="_blank"
						rel="noopener noreferrer"
						className="italic underline text-textred"
					>
						{commit.sha.substring(0, 7)}
					</Link>{" "}
					to{" "}
					<Link
						href={getLink(commit.repo)}
						target="_blank"
						rel="noopener noreferrer"
						className="italic underline text-textred"
					>
						{repoToDisplayRepo(commit.repo)}
					</Link>
				</p>
			</div>
		</div>
	);
}
