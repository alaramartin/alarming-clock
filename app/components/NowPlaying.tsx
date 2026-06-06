"use client";
import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
// --keycolor (keyboard hexagons): album accent color while playing, else textred
// while playing with no accent, else #cf5654 when nothing is playing.
const TEXTRED = "#cb2a26"; // keep in sync with --textred in globals.css
const NO_SPOTIFY_KEY_COLOR = "#cf5654";
// --lightvibrant (key-press particle trail): the album's main/primary color, else this.
const TRAIL_FALLBACK = "#d8d8d8"; // keep in sync with --textwhite in globals.css

type RGB = [number, number, number];

const HISTOGRAM_SCALE = 24; // bucket size per channel
const SKIP_DARK = 40; // pixels with all channels below this are ignored
const SKIP_LIGHT = 225; // pixels with all channels above this are ignored
const MIN_BRIGHTNESS = 64; // raise only genuinely-dark colors up to this average
const ACCENT_MIN_DIST = 50; // accent must differ from dominant by at least this
const ACCENT_DIST_WEIGHT = 4.5; // weight distance-from-dominant over raw frequency
// The dominant drives the scene LIGHT color, so: boost its saturation a touch (a
// desaturated cast like a dark blue-grey then reads as a real blue, not grey), and
// cap its brightness so a light/white cover doesn't wash the moody wall out.
const FIELD_SAT = 1.9;
const FIELD_MAX_BRIGHTNESS = 150;

function toHex(r: number, g: number, b: number): string {
	const c = (n: number) =>
		Math.round(Math.max(0, Math.min(255, n)))
			.toString(16)
			.padStart(2, "0");
	return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbStr(c: RGB): string {
	return `${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}`;
}

function colorDist(a: RGB, b: RGB): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// Raise only genuinely-dark colors to a minimum brightness (preserves hue). This
// is the *only* tonal adjustment — no saturation faking, so colors stay accurate.
function brighten(c: RGB): RGB {
	const b = (c[0] + c[1] + c[2]) / 3;
	if (b >= MIN_BRIGHTNESS || b <= 0) return c;
	const f = MIN_BRIGHTNESS / b;
	return [
		Math.min(255, c[0] * f),
		Math.min(255, c[1] * f),
		Math.min(255, c[2] * f),
	];
}

// Push channels away from their average to increase saturation (f > 1), preserving
// brightness. A neutral grey (r≈g≈b) is unaffected — there's nothing to saturate.
function saturate(c: RGB, f: number): RGB {
	const avg = (c[0] + c[1] + c[2]) / 3;
	return [
		Math.max(0, Math.min(255, avg + (c[0] - avg) * f)),
		Math.max(0, Math.min(255, avg + (c[1] - avg) * f)),
		Math.max(0, Math.min(255, avg + (c[2] - avg) * f)),
	];
}

// Scale a too-bright color down to a maximum average brightness (preserves hue).
function capBrightness(c: RGB, max: number): RGB {
	const b = (c[0] + c[1] + c[2]) / 3;
	if (b <= max || b <= 0) return c;
	const f = max / b;
	return [c[0] * f, c[1] * f, c[2] * f];
}

// Scale a color to full brightness (max channel = 255), preserving hue. Used for
// the additive particle trail, which a dark/muted color would render invisible.
function vividize(c: RGB): RGB {
	const m = Math.max(c[0], c[1], c[2], 1);
	const f = 255 / m;
	return [c[0] * f, c[1] * f, c[2] * f];
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new window.Image();
		img.crossOrigin = "anonymous";
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = url;
	});
}

// Extract album colors directly from the cover's pixels. Dominant (main/field)
// color = the most frequent bucket after dropping near-black/near-white pixels;
// accent (keyboard) color = the bucket that best combines frequency with a large
// perceptual distance from the dominant. Colors are returned essentially raw.
async function getAlbumColor(imageUrl: string | null): Promise<{
	hex: string;
	rgb: string;
	secondaryHex: string | null;
	secondaryRgb: string | null;
	lightHex: string | null;
} | null> {
	if (!imageUrl) return null;

	let img: HTMLImageElement;
	try {
		img = await loadImage(imageUrl);
	} catch {
		return null;
	}

	// Sample at (near-)native resolution rather than rescaling to a tiny canvas —
	// rescaling blends a thin bright detail (e.g. yellow text on a dark field) into
	// its background, shifting the hue (yellow -> olive/green). This keeps pixels pure.
	const MAX_DIM = 512;
	const nw = img.naturalWidth || MAX_DIM;
	const nh = img.naturalHeight || MAX_DIM;
	const scale = Math.min(1, MAX_DIM / Math.max(nw, nh));
	const w = Math.max(1, Math.round(nw * scale));
	const h = Math.max(1, Math.round(nh * scale));
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) return null;
	ctx.imageSmoothingEnabled = false; // keep pixels pure (no blended hues)
	ctx.drawImage(img, 0, 0, w, h);
	let data: Uint8ClampedArray;
	try {
		data = ctx.getImageData(0, 0, w, h).data;
	} catch {
		return null; // tainted canvas (CORS)
	}

	const buckets = new Map<
		string,
		{ r: number; g: number; b: number; count: number }
	>();
	let total = 0;
	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3] < 125) continue; // transparent
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		if (r < SKIP_DARK && g < SKIP_DARK && b < SKIP_DARK) continue; // near-black
		if (r > SKIP_LIGHT && g > SKIP_LIGHT && b > SKIP_LIGHT) continue; // near-white
		const key = `${Math.floor(r / HISTOGRAM_SCALE)},${Math.floor(
			g / HISTOGRAM_SCALE,
		)},${Math.floor(b / HISTOGRAM_SCALE)}`;
		const bk = buckets.get(key);
		if (bk) {
			bk.r += r;
			bk.g += g;
			bk.b += b;
			bk.count++;
		} else {
			buckets.set(key, { r, g, b, count: 1 });
		}
		total++;
	}
	if (buckets.size === 0) return null;

	const list = [...buckets.values()]
		.map((bk) => ({
			color: [bk.r / bk.count, bk.g / bk.count, bk.b / bk.count] as RGB,
			count: bk.count,
		}))
		.sort((a, b) => b.count - a.count);

	const dominant = brighten(list[0].color);
	const maxFreq = list[0].count;

	// Accent: present enough + clearly different from the dominant
	const minFreq = Math.max(8, total * 0.001);
	const cands = list
		.map((c) => ({ ...c, dist: colorDist(c.color, dominant) }))
		.filter((c) => c.count > minFreq && c.dist > ACCENT_MIN_DIST);
	const maxDist = Math.max(1, ...cands.map((c) => c.dist));
	cands.sort(
		(a, b) =>
			b.count / maxFreq +
			(b.dist / maxDist) * ACCENT_DIST_WEIGHT -
			(a.count / maxFreq + (a.dist / maxDist) * ACCENT_DIST_WEIGHT),
	);
	const accent = cands[0] ? brighten(cands[0].color) : null;

	// Field/light color: the dominant, saturation-boosted and brightness-capped so
	// it reads as a real, moody color when used to light the wall.
	const field = capBrightness(
		saturate(dominant, FIELD_SAT),
		FIELD_MAX_BRIGHTNESS,
	);

	// Keyboard color: the accent, or a darker shade of the field if the cover is
	// essentially one color. Particle trail: a bright version of the field color.
	const secondary: RGB = accent ?? [
		field[0] * 0.6,
		field[1] * 0.6,
		field[2] * 0.6,
	];
	const trail = vividize(saturate(dominant, FIELD_SAT));

	console.log("album colors:", {
		field: toHex(...field),
		accent: accent ? toHex(...accent) : "none (darkened field)",
	});

	return {
		hex: toHex(...field),
		rgb: rgbStr(field),
		secondaryHex: toHex(...secondary),
		secondaryRgb: rgbStr(secondary),
		lightHex: toHex(...trail),
	};
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

	useEffect(() => {
		const rootStyle = document.documentElement.style;
		if (!song?.albumImageUrl || !song?.isPlaying) {
			setTimeout(() => {
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
			rootStyle.setProperty("--albumcolor", color?.rgb ?? "203, 42, 38");
			// Album accent color, falling back to textred when there isn't one.
			rootStyle.setProperty("--keycolor", color?.secondaryHex ?? TEXTRED);
			// Particle trail uses the album's main color.
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
