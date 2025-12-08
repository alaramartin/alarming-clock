"use client";
import { useState, useRef, useEffect } from "react";

type Commit = {
	repo: string;
	sha: string;
	timestamp: string;
} | null;

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
	return (
		<div className="border-2 border-gray-500 rounded-2xl flex flex-col bg-gray-800 m-3 px-4 py-3">
			{commit.sha} {commit.repo} {commit.timestamp}
		</div>
	);
}
