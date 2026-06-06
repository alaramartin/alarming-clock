"use client";
import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import Vibrant from "node-vibrant";
import type { Swatch } from "node-vibrant/lib/color";

// --keycolor (keyboard hexagons): album Muted swatch while playing, else textred
// while playing with no Muted swatch, else #004F98 when nothing is playing.
const TEXTRED = "#cb2a26"; // keep in sync with --textred in globals.css
const NO_SPOTIFY_KEY_COLOR = "#004F98";
// --lightvibrant (key-press particle trail): album LightVibrant swatch, else this.
const TRAIL_FALLBACK = "#d8d8d8"; // keep in sync with --textwhite in globals.css

async function getAlbumColor(imageUrl: string | null): Promise<{
	hex: string;
	rgb: string;
	secondaryHex: string | null;
	secondaryRgb: string | null;
	lightHex: string | null;
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
	// Keyboard color: the album's Muted swatch (DarkMuted as a fallback).
	const secondary = palette.Muted ?? palette.DarkMuted ?? null;

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

	return swatch
		? {
				hex: swatch.hex,
				rgb: swatch.rgb.join(", "),
				secondaryHex: secondary?.hex ?? null,
				secondaryRgb: secondary ? secondary.rgb.join(", ") : null,
				lightHex: palette.LightVibrant?.hex ?? null,
			}
		: null;
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
		secondaryHex: string | null;
		secondaryRgb: string | null;
		lightHex: string | null;
	} | null>(null);

	useEffect(() => {
		const rootStyle = document.documentElement.style;
		if (!song?.albumImageUrl || !song?.isPlaying) {
			setTimeout(() => {
				setAlbumColor(null);
				rootStyle.setProperty("--albumcolor", "203, 42, 38");
				// Playing but no art -> textred; nothing playing -> #004F98.
				rootStyle.setProperty(
					"--keycolor",
					song?.isPlaying ? TEXTRED : NO_SPOTIFY_KEY_COLOR,
				);
				rootStyle.setProperty("--lightvibrant", TRAIL_FALLBACK);
			}, 0);
			return;
		}
		getAlbumColor(song.albumImageUrl).then((color) => {
			setAlbumColor(color);
			rootStyle.setProperty("--albumcolor", color?.rgb ?? "203, 42, 38");
			// Muted album swatch, falling back to textred when there isn't one.
			rootStyle.setProperty("--keycolor", color?.secondaryHex ?? TEXTRED);
			// LightVibrant swatch for the particle trail.
			rootStyle.setProperty(
				"--lightvibrant",
				color?.lightHex ?? TRAIL_FALLBACK,
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
