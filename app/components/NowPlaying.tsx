"use client";
import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import Vibrant from "node-vibrant";
import type { Swatch } from "node-vibrant/lib/color";

async function getAlbumColor(imageUrl: string | null): Promise<{
	hex: string;
	rgb: string;
} | null> {
	if (!imageUrl) return null;

	const palette = await Vibrant.from(imageUrl).getPalette();

	function isUsable(swatch: Swatch | null): swatch is Swatch {
		if (!swatch) return false;
		const [, , l] = swatch.hsl;
		if (swatch.population === 0) return false;
		return l > 0.15 && l < 0.9; // remove saturation check entirely
	}

	const candidates = [
		palette.Vibrant ?? null,
		palette.LightVibrant ?? null,
		palette.DarkVibrant ?? null,
		palette.Muted ?? null,
	]
		.filter(isUsable)
		.sort((a, b) => {
			const score = (s: Swatch) => s.hsl[1] * 3 + s.population / 1000;
			return score(b) - score(a);
		});

	const swatch = candidates[0] ?? null;

	console.log("palette:", {
		Vibrant: palette.Vibrant
			? { hsl: palette.Vibrant.hsl, pop: palette.Vibrant.population }
			: null,
		LightVibrant: palette.LightVibrant
			? {
					hsl: palette.LightVibrant.hsl,
					pop: palette.LightVibrant.population,
				}
			: null,
		DarkVibrant: palette.DarkVibrant
			? {
					hsl: palette.DarkVibrant.hsl,
					pop: palette.DarkVibrant.population,
				}
			: null,
		Muted: palette.Muted
			? { hsl: palette.Muted.hsl, pop: palette.Muted.population }
			: null,
		DarkMuted: palette.DarkMuted
			? { hsl: palette.DarkMuted.hsl, pop: palette.DarkMuted.population }
			: null,
	});

	return swatch ? { hex: swatch.hex, rgb: swatch.rgb.join(", ") } : null;
}

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

	const [albumColor, setAlbumColor] = useState<{
		hex: string;
		rgb: string;
	} | null>(null);

	useEffect(() => {
		if (!song?.albumImageUrl || !song?.isPlaying) {
			setTimeout(() => {
				setAlbumColor(null);
				document.documentElement.style.setProperty(
					"--albumcolor",
					"203, 42, 38",
				);
			}, 0);
			return;
		}
		getAlbumColor(song.albumImageUrl).then((color) => {
			setAlbumColor(color);
			document.documentElement.style.setProperty(
				"--albumcolor",
				color?.rgb ?? "203, 42, 38",
			);
		});
	}, [song?.albumImageUrl, song?.isPlaying]);

	if (!song) return;
	if (!song.isPlaying) return;
	return (
		<div className="border border-black/50 rounded-2xl glow-pulse flex flex-col m-5 px-4 py-3 bg-background">
			<p className="text-gray-400 italic text-sm mb-1">
				I&apos;m currently listening to...
			</p>
			<div className="inline-flex items-center align-middle">
				{song.albumImageUrl && (
					<Image
						src={song.albumImageUrl}
						alt={`Album cover for ${song.title}`}
						width={54}
						height={54}
						className="mr-3 rounded-xs border border-gray-300/20"
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
