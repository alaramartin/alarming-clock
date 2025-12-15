"use client";
import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";

type Song = {
	album?: string;
	albumImageUrl?: string;
	artist?: string;
	isPlaying?: boolean;
	songUrl?: string;
	title?: string;
} | null;

export default function NowPlaying() {
	const [song, setSong] = useState<Song>(null);
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;
		const controller = new AbortController();

		async function fetchNowPlaying() {
			try {
				const res = await fetch("/api/spotify/now-playing", {
					cache: "no-store",
					signal: controller.signal,
				});
				if (!res.ok) {
					setSong({ isPlaying: false });
					return;
				}
				const data = await res
					.json()
					.catch(() => ({ isPlaying: false }));
				if (mountedRef.current) setSong(data);
			} catch {
				if (mountedRef.current) setSong({ isPlaying: false });
			}
		}

		fetchNowPlaying();
		const id = setInterval(fetchNowPlaying, 5000);

		return () => {
			mountedRef.current = false;
			controller.abort();
			clearInterval(id);
		};
	}, []);
	// todo: add a progress bar of the music
	// todo: glow and border is color of album cover
	// todo: pulses to beat/bass of music

	if (!song) return;
	if (!song.isPlaying) return;
	return (
		<div className="border border-textred/50 rounded-2xl glow-pulse flex flex-col bg-inherit m-5 px-4 py-3">
			<p className="text-gray-400 italic text-sm mb-1">
				I&apos;m currently listening to...
			</p>
			<div className="inline-flex items-center align-middle">
				{song.albumImageUrl && (
					<Image
						src={song.albumImageUrl}
						alt={`Album cover for ${song.title}`}
						width={46}
						height={46}
						className="mr-3 rounded-xs"
					></Image>
				)}
				<div className="flex flex-col">
					{song.songUrl && (
						<Link
							href={song.songUrl}
							className="text-white hover:underline "
							target="_blank"
							rel="noopener noreferrer"
						>
							{song.title}
						</Link>
					)}
					{!song.songUrl && (
						<p className="text-white ">{song.title}</p>
					)}
					<p className="text-gray-300 text-sm">{song.artist}</p>
				</div>
			</div>
		</div>
	);
}
