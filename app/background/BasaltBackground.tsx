"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import dynamic from "next/dynamic";
import * as THREE from "three";
import { buildNoise } from "./noise";
import { codeToIndex, KEYBOARD_INDEX_SET } from "./keyboardMap";
import { EffectComposer, Bloom } from "@react-three/postprocessing";

export interface BasaltBackgroundProps {
	lightColor?: THREE.ColorRepresentation;
	lightIntensity?: number;
	lightAzimuthDeg?: number;
	lightElevDeg?: number;
	ambientIntensity?: number;
	style?: React.CSSProperties;
}

const R = 1.2; // hexagon circumradius; also drives grid spacing (SX/SZ), so larger = fewer, bigger columns
const COL_HEIGHT = 2.5;
// Terrain height band the noise is mapped into (noise ∈ ~[-1,1] → [MIN_Y, MAX_Y]).
// Raise MIN_Y to lift the lowest columns / shrink the overall height range.
const MIN_Y = -2.5;
const MAX_Y = 5.5;
const NOISE_SCALE = 0.15;
const SX = R * Math.sqrt(3);
const SZ = R * 1.5;

// --- Key-hold rise / hold / fall (tunable) -----------------------------------
const HOLD_TARGET_Y = -4.5; // absolute world Y a held column eases down to (only ever pushed down, never up — so already-low columns barely move)
const RISE_DURATION = 0.13; // seconds to snap up to HOLD_HEIGHT
const FALL_DURATION = 0.45; // seconds to settle back down after release
const FALL_DAMP = 3; // settle damping on release (higher = bounce dies faster)
const FALL_OMEGA = 1.3 * Math.PI; // release spring frequency (one small bounce)

const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3);
const easeOutQuad = (u: number) => 1 - (1 - u) * (1 - u);

/**
 * Held column offset `t` seconds after keydown — eases toward `target`, then
 * holds. `target` is the per-column drop (≤ 0) needed to reach `HOLD_TARGET_Y`.
 */
function riseOffset(t: number, target: number): number {
	return target * easeOutCubic(Math.min(1, t / RISE_DURATION));
}

// --- Key-hold lens flare (tunable) -------------------------------------------
const FLARE_MAX = 4 * R; // overall flare extent (incl. streaks) at full hold
const FLARE_TIME_TO_MAX = 2.0; // seconds of holding to reach FLARE_MAX
const FLARE_FADE = 0.3; // seconds to fade out after release
const FLARE_TINT = 0.15; // how far the white flare is tinted toward the album color
const FLARE_POOL = 16; // max simultaneous flares (pooled sprites)
// The flare emerges from behind/beside the rising column, not centered on top:
const FLARE_SIDE = 0.85 * R; // lateral offset to one side of the column
const FLARE_SIDE_DIRX = 0.7; // side direction in world x/z (screen-space "side")
const FLARE_SIDE_DIRZ = 0.7;
const FLARE_SINK = 0.7; // depth below the column top so the wall occludes it ("breaks through")

/** Flare sprite size `t` seconds after keydown — grows, eased, capped at FLARE_MAX. */
function flareScale(t: number): number {
	return FLARE_MAX * easeOutQuad(Math.min(1, t / FLARE_TIME_TO_MAX));
}

/** Current +Y offset of a held/released column (eased rise, then damped fall). */
function holdHeight(
	hold: {
		start: number;
		release: number | null;
		releaseOffset: number;
		target: number;
	},
	now: number,
): number {
	if (hold.release === null) return riseOffset(now - hold.start, hold.target);
	const s = (now - hold.release) / FALL_DURATION;
	if (s >= 1) return 0;
	return (
		hold.releaseOffset * Math.exp(-FALL_DAMP * s) * Math.cos(FALL_OMEGA * s)
	);
}

/** Starburst lens-flare texture: small bright core, anamorphic streaks, faint halo.
 *  White on transparent — SpriteMaterial.color tints it; additive blending glows. */
function makeFlareTexture(): THREE.Texture {
	const size = 256;
	const cv = document.createElement("canvas");
	cv.width = cv.height = size;
	const ctx = cv.getContext("2d")!;
	ctx.translate(size / 2, size / 2);
	ctx.globalCompositeOperation = "lighter"; // additive build-up

	// small bright core + soft glow
	const core = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.25);
	core.addColorStop(0, "rgba(255,255,255,1)");
	core.addColorStop(0.05, "rgba(255,255,255,0.95)");
	core.addColorStop(0.15, "rgba(255,255,255,0.4)");
	core.addColorStop(0.4, "rgba(255,255,255,0.08)");
	core.addColorStop(1, "rgba(255,255,255,0)");
	ctx.fillStyle = core;
	ctx.beginPath();
	ctx.arc(0, 0, size * 0.25, 0, Math.PI * 2);
	ctx.fill();

	const ray = (angle: number, len: number, halfWidth: number, a: number) => {
		ctx.save();
		ctx.rotate(angle);
		const grad = ctx.createLinearGradient(0, 0, len, 0);
		grad.addColorStop(0, `rgba(255,255,255,${a})`);
		grad.addColorStop(0.12, `rgba(255,255,255,${a * 0.55})`);
		grad.addColorStop(1, "rgba(255,255,255,0)");
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.moveTo(0, -halfWidth);
		ctx.lineTo(len, 0);
		ctx.lineTo(0, halfWidth);
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	};

	const reach = size * 0.5;
	// 4 long primary spikes (both directions)
	for (const base of [0, Math.PI / 2]) {
		ray(base, reach * 0.95, 5, 0.85);
		ray(base + Math.PI, reach * 0.95, 5, 0.85);
	}
	// 4 medium diagonal spikes
	for (let k = 0; k < 4; k++) {
		ray(Math.PI / 4 + (k * Math.PI) / 2, reach * 0.6, 3, 0.45);
	}
	// scattered thin rays (deterministic)
	let seed = 7;
	const rnd = () => {
		seed = (seed * 1103515245 + 12345) & 0x7fffffff;
		return seed / 0x7fffffff;
	};
	for (let k = 0; k < 18; k++) {
		ray(rnd() * Math.PI * 2, reach * (0.3 + rnd() * 0.5), 1.2, 0.16);
	}

	// faint halo ring
	ctx.lineWidth = 2;
	ctx.strokeStyle = "rgba(255,255,255,0.12)";
	ctx.beginPath();
	ctx.arc(0, 0, size * 0.34, 0, Math.PI * 2);
	ctx.stroke();

	const tex = new THREE.CanvasTexture(cv);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

// --- Key-press particle trail (tunable) --------------------------------------
const MAX_PARTICLES = 1200; // ring-buffer pool size
const PARTICLE_LIFETIME = 1.2; // seconds (× random 0.7–1.3); lingers a bit before fading
const PARTICLE_FADE_IN = 0.08; // seconds to ramp to full opacity (avoids a hard pop-in)
const PARTICLE_SIZE = 11; // base point size in px (× random 0.6–1.4)
const TRAIL_DENSITY = 1.1; // particles per world unit along the segment between two keys
const TRAIL_MIN = 4; // min/max particles per segment
const TRAIL_MAX = 60;
const TRAIL_BURST = 4; // particles emitted at a key with no recent predecessor
const TRAIL_MAX_GAP = 1.2; // s: presses farther apart than this don't get connected
const TRAIL_JITTER = 0.5; // random lateral spread off the segment (world units)
const TRAIL_DRIFT = 1.6; // horizontal float speed (world units/s)
const TRAIL_RISE = 1.2; // upward (toward-camera) float bias (world units/s)
const TRAIL_DAMP = 0.94; // per-frame velocity damping
const PARTICLE_Y = COL_HEIGHT + 0.4; // spawn just above the column tops

const PARTICLE_VERT = `
	attribute float aOpacity;
	attribute float aSize;
	varying float vOpacity;
	void main() {
		vOpacity = aOpacity;
		vec4 mv = modelViewMatrix * vec4(position, 1.0);
		gl_PointSize = aSize;
		gl_Position = projectionMatrix * mv;
	}
`;
const PARTICLE_FRAG = `
	uniform vec3 uColor;
	varying float vOpacity;
	void main() {
		if (vOpacity <= 0.0) discard;
		float d = length(gl_PointCoord - vec2(0.5));
		if (d > 0.5) discard;
		float a = smoothstep(0.5, 0.0, d) * vOpacity;
		gl_FragColor = vec4(uColor, a);
	}
`;

function buildHexPrism(): THREE.BufferGeometry {
	const vx: number[] = [],
		vz: number[] = [];
	for (let i = 0; i < 6; i++) {
		const a = (i * Math.PI) / 3 + Math.PI / 6;
		vx.push(R * Math.cos(a));
		vz.push(R * Math.sin(a));
	}
	const pos: number[] = [],
		nor: number[] = [];
	const h = COL_HEIGHT;
	for (let i = 0; i < 6; i++) {
		const j = (i + 1) % 6;
		pos.push(0, h, 0, vx[i], h, vz[i], vx[j], h, vz[j]);
		nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
	}
	for (let i = 0; i < 6; i++) {
		const j = (i + 1) % 6;
		pos.push(0, 0, 0, vx[j], 0, vz[j], vx[i], 0, vz[i]);
		nor.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
	}
	for (let i = 0; i < 6; i++) {
		const j = (i + 1) % 6;
		const mx = (vx[i] + vx[j]) / 2,
			mz = (vz[i] + vz[j]) / 2;
		const len = Math.sqrt(mx * mx + mz * mz);
		const nx = mx / len,
			nz = mz / len;
		pos.push(vx[i], h, vz[i], vx[j], h, vz[j], vx[i], 0, vz[i]);
		nor.push(nx, 0, nz, nx, 0, nz, nx, 0, nz);
		pos.push(vx[j], h, vz[j], vx[j], 0, vz[j], vx[i], 0, vz[i]);
		nor.push(nx, 0, nz, nx, 0, nz, nx, 0, nz);
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
	geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
	return geo;
}

function buildMatrices() {
	const noise = buildNoise(137);
	const items: [number, number, number][] = [];
	for (let q = -30; q <= 30; q++) {
		for (let r = -30; r <= 30; r++) {
			const x = SX * (q + r * 0.5);
			const z = SZ * r;
			const n = noise(x * NOISE_SCALE, z * NOISE_SCALE); // ~[-1, 1]
			const y = MIN_Y + ((n + 1) / 2) * (MAX_Y - MIN_Y);
			items.push([x, y, z]);
		}
	}
	const buf = new Float32Array(items.length * 16);
	const dummy = new THREE.Object3D();
	items.forEach(([x, y, z], i) => {
		dummy.position.set(x, y, z);
		dummy.rotation.set(0, 0, 0);
		dummy.scale.set(1, 1, 1);
		dummy.updateMatrix();
		dummy.matrix.toArray(buf, i * 16);
	});
	return { count: items.length, buf };
}

const BASE_COLOR = "#0d0d0f"; // decorative (non-key) columns

// How far the lights are tinted toward the album color. The directional "key"
// light is kept near-neutral so albedo reads true — a fully album-tinted key
// light multiplies the keyboard hexagons into a muddy hue (e.g. a yellow
// --keycolor under a navy light renders olive-green). The album color instead
// pervades the scene through the dimmer, uniform ambient fill and the emissive
// floor glow, which set the mood without corrupting the hex colors.
// The album's MAIN color comes from the directional light hitting near-black
// columns: lit faces glow the album color, shadowed faces fall dark → a moody,
// "backlit wall" whose brightness stays controlled no matter how light or dark the
// cover is (the dark albedo, not the cover, sets the brightness). Ambient stays
// neutral and low so shadows read.
const LIGHT_TINT = 1.0; // directional key light: 0 = white, 1 = full album color
const AMBIENT_TINT = 0.0; // ambient fill stays neutral white

// The accent (keyboard) hexagons are drawn as per-instance EMISSIVE so they show
// their true --keycolor regardless of the album-colored light (a lit yellow under
// a blue light would otherwise read olive). Kept just under the bloom threshold so
// they're a solid color, not a neon glow.
const EMISSIVE_STRENGTH = 0.7;

// Read a CSS custom property and coerce it to a THREE-parseable color string.
// Accepts hex ("#rrggbb") or a bare "r, g, b" triple (wrapped as rgb()).
function readCssVarColor(name: string): string | null {
	if (typeof window === "undefined") return null;
	const raw = getComputedStyle(document.documentElement)
		.getPropertyValue(name)
		.trim();
	if (!raw) return null;
	const val = raw.startsWith("#") ? raw : `rgb(${raw})`;
	try {
		new THREE.Color(val);
		return val;
	} catch {
		return null;
	}
}

function readCssColor(): string | null {
	return readCssVarColor("--albumcolor");
}

function Scene({
	lightColor,
	lightIntensity = 18,
	lightAzimuthDeg = 45,
	lightElevDeg = 30,
	ambientIntensity = 0.35,
}: BasaltBackgroundProps) {
	const { scene } = useThree();
	const lightRef = useRef<THREE.DirectionalLight>(null);
	const floorRef = useRef<THREE.MeshStandardMaterial>(null);
	const targetRef = useRef(new THREE.Object3D());
	const [cssColor, setCssColor] = useState("#ffffff");
	const resolved: THREE.ColorRepresentation = lightColor ?? cssColor;

	const floorColor = useMemo(() => {
		try {
			const base = new THREE.Color("#ffffff");
			const accent = new THREE.Color(resolved as string);
			return base.lerp(accent, 0.6);
		} catch {
			return new THREE.Color("#ffffff");
		}
	}, [resolved]);

	// Near-neutral key light (keeps hexagon albedo true) and a more album-tinted
	// ambient fill (carries the mood). See LIGHT_TINT / AMBIENT_TINT above.
	const keyLightColor = useMemo(() => {
		try {
			return new THREE.Color("#ffffff").lerp(
				new THREE.Color(resolved as string),
				LIGHT_TINT,
			);
		} catch {
			return new THREE.Color("#ffffff");
		}
	}, [resolved]);
	const ambientColor = useMemo(() => {
		try {
			return new THREE.Color("#ffffff").lerp(
				new THREE.Color(resolved as string),
				AMBIENT_TINT,
			);
		} catch {
			return new THREE.Color("#ffffff");
		}
	}, [resolved]);

	useEffect(() => {
		if (!floorRef.current) return;
		floorRef.current.color.copy(floorColor);
		floorRef.current.emissive.copy(floorColor);
	}, [floorColor]);

	const geo = useMemo(() => buildHexPrism(), []);
	// White base so per-instance colors (instanceColor) act as the true albedo.
	// Patched to add a per-instance emissive term (`instanceEmissive`) so the
	// keyboard hexagons can self-illuminate their accent color independent of light.
	const mat = useMemo(() => {
		const m = new THREE.MeshStandardMaterial({
			color: "#ffffff",
			roughness: 0.6,
			metalness: 0.0,
			flatShading: true,
		});
		m.onBeforeCompile = (shader) => {
			shader.vertexShader = (
				"attribute vec3 instanceEmissive;\nvarying vec3 vInstEmissive;\n" +
				shader.vertexShader
			).replace(
				"void main() {",
				"void main() {\n\tvInstEmissive = instanceEmissive;",
			);
			shader.fragmentShader = (
				"varying vec3 vInstEmissive;\n" + shader.fragmentShader
			).replace(
				"#include <emissivemap_fragment>",
				"#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vInstEmissive;",
			);
		};
		return m;
	}, []);
	const { count, buf } = useMemo(() => buildMatrices(), []);
	// Per-instance emissive (accent glow on keyboard columns; 0 elsewhere).
	const emissiveAttr = useMemo(
		() =>
			new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3),
		[count],
	);

	const meshRef = useRef<THREE.InstancedMesh>(null);
	// Active holds: index -> { keydown time, keyup time | null, height at release }.
	const animsRef = useRef(
		new Map<
			number,
			{
				start: number;
				release: number | null;
				releaseOffset: number;
				target: number;
			}
		>(),
	);
	const scratchRef = useRef(new THREE.Matrix4());
	const clock = useThree((s) => s.clock);

	// White flare, very slightly tinted toward the main album color.
	const flareColor = useMemo(() => {
		try {
			return new THREE.Color("#ffffff").lerp(
				new THREE.Color(resolved as string),
				FLARE_TINT,
			);
		} catch {
			return new THREE.Color("#ffffff");
		}
	}, [resolved]);

	// Pooled flare sprites (avoids per-keystroke allocation). One Group of
	// FLARE_POOL sprites, each with its own additive material + a shared glow tex.
	const flarePool = useMemo(() => {
		const tex = makeFlareTexture();
		const group = new THREE.Group();
		const sprites: THREE.Sprite[] = [];
		for (let k = 0; k < FLARE_POOL; k++) {
			const material = new THREE.SpriteMaterial({
				map: tex,
				color: 0xffffff,
				transparent: true,
				depthTest: true, // the hexagon wall occludes it → light "breaks through"
				depthWrite: false,
				blending: THREE.AdditiveBlending,
				opacity: 0,
			});
			const sprite = new THREE.Sprite(material);
			sprite.visible = false;
			sprite.scale.set(0, 0, 1);
			group.add(sprite);
			sprites.push(sprite);
		}
		return { group, sprites };
	}, []);
	// index -> active flare; plus a free-slot stack into flarePool.sprites.
	const flaresRef = useRef(
		new Map<
			number,
			{
				slot: number;
				start: number;
				release: number | null;
				releaseScale: number;
				x: number;
				z: number;
				baseY: number;
			}
		>(),
	);
	const freeSlots = useRef<number[] | null>(null);
	if (freeSlots.current === null) {
		freeSlots.current = Array.from({ length: FLARE_POOL }, (_, k) => k);
	}

	// Keep the pool's tint in sync with the album color.
	useEffect(() => {
		for (const s of flarePool.sprites) {
			(s.material as THREE.SpriteMaterial).color.copy(flareColor);
		}
	}, [flareColor, flarePool]);
	// Keyboard-hexagon color, tracking the --keycolor CSS var.
	const [keyColor, setKeyColor] = useState("#004f98");
	// Particle trail color, tracking the --lightvibrant CSS var.
	const [trailColor, setTrailColor] = useState("#d8d8d8");

	// Particle pool (ring buffer). Geometry attrs drive the GPU; the parallel
	// CPU arrays (velocity/birth/life) drive the per-frame simulation.
	const pPos = useMemo(() => new Float32Array(MAX_PARTICLES * 3), []);
	const pOpacity = useMemo(() => new Float32Array(MAX_PARTICLES), []);
	const pSize = useMemo(() => new Float32Array(MAX_PARTICLES), []);
	const pVel = useMemo(() => new Float32Array(MAX_PARTICLES * 3), []);
	const pBirth = useMemo(() => {
		const a = new Float32Array(MAX_PARTICLES);
		a.fill(-1); // -1 = dead slot
		return a;
	}, []);
	const pLife = useMemo(() => new Float32Array(MAX_PARTICLES), []);
	const pNext = useRef(0); // next ring-buffer slot
	const pActive = useRef(0); // live particle count (for frame early-out)
	const prevKey = useRef<{
		x: number;
		y: number;
		z: number;
		t: number;
	} | null>(null);

	const particleGeo = useMemo(() => {
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
		g.setAttribute("aOpacity", new THREE.BufferAttribute(pOpacity, 1));
		g.setAttribute("aSize", new THREE.BufferAttribute(pSize, 1));
		return g;
	}, [pPos, pOpacity, pSize]);

	const particleMat = useMemo(
		() =>
			new THREE.ShaderMaterial({
				uniforms: { uColor: { value: new THREE.Color("#d8d8d8") } },
				vertexShader: PARTICLE_VERT,
				fragmentShader: PARTICLE_FRAG,
				transparent: true,
				depthTest: false, // always over the hexagons (still under the HTML clock)
				depthWrite: false,
				blending: THREE.AdditiveBlending,
			}),
		[],
	);

	useEffect(() => {
		try {
			(particleMat.uniforms.uColor.value as THREE.Color).set(trailColor);
		} catch {}
	}, [trailColor, particleMat]);

	// One-time fill of every instance matrix from the buffer + the emissive attr.
	useEffect(() => {
		const mesh = meshRef.current;
		if (!mesh) return;
		geo.setAttribute("instanceEmissive", emissiveAttr);
		const m = scratchRef.current;
		for (let i = 0; i < count; i++) {
			m.fromArray(buf, i * 16);
			mesh.setMatrixAt(i, m);
		}
		mesh.instanceMatrix.needsUpdate = true;
	}, [count, buf, geo, emissiveAttr]);

	// Per-instance albedo. Decorative columns are near-black: their *color* comes
	// from the album-tinted directional light → the moody "backlit wall". Keyboard
	// columns are pure black albedo so only their emissive accent (below) shows,
	// keeping the accent color accurate regardless of the colored light.
	useEffect(() => {
		const mesh = meshRef.current;
		if (!mesh) return;
		const dark = new THREE.Color(BASE_COLOR);
		const black = new THREE.Color(0, 0, 0);
		for (let i = 0; i < count; i++) {
			mesh.setColorAt(i, KEYBOARD_INDEX_SET.has(i) ? black : dark);
		}
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}, [count]);

	// Drive the keyboard columns' emissive glow from the --keycolor accent.
	useEffect(() => {
		let col: THREE.Color;
		try {
			col = new THREE.Color(keyColor);
		} catch {
			return;
		}
		const arr = emissiveAttr.array as Float32Array;
		arr.fill(0);
		for (const i of KEYBOARD_INDEX_SET) {
			arr[i * 3] = col.r * EMISSIVE_STRENGTH;
			arr[i * 3 + 1] = col.g * EMISSIVE_STRENGTH;
			arr[i * 3 + 2] = col.b * EMISSIVE_STRENGTH;
		}
		emissiveAttr.needsUpdate = true;
	}, [keyColor, emissiveAttr]);

	// Map key presses to a column pop + a particle trail between consecutive keys.
	useEffect(() => {
		const spawnAt = (x: number, y: number, z: number, now: number) => {
			const p = pNext.current;
			pNext.current = (p + 1) % MAX_PARTICLES;
			if (pBirth[p] < 0) pActive.current++; // reusing a dead slot
			pPos[p * 3] = x;
			pPos[p * 3 + 1] = y;
			pPos[p * 3 + 2] = z;
			pVel[p * 3] = (Math.random() * 2 - 1) * TRAIL_DRIFT;
			pVel[p * 3 + 1] = TRAIL_RISE * (0.4 + Math.random() * 0.8);
			pVel[p * 3 + 2] = (Math.random() * 2 - 1) * TRAIL_DRIFT;
			pSize[p] = PARTICLE_SIZE * (0.6 + Math.random() * 0.8);
			pLife[p] = PARTICLE_LIFETIME * (0.7 + Math.random() * 0.6);
			pBirth[p] = now;
			pOpacity[p] = 0;
		};

		const onKey = (e: KeyboardEvent) => {
			if (e.repeat) return;
			const i = codeToIndex(e.code);
			if (i === undefined) return;
			if (e.code === "Space") e.preventDefault(); // avoid page scroll
			const now = clock.getElapsedTime();
			// Drop this column to HOLD_TARGET_Y, but never push it up: columns
			// already at/below the target get a 0 target so they stay put.
			const target = Math.min(0, HOLD_TARGET_Y - buf[i * 16 + 13]);
			animsRef.current.set(i, {
				start: now,
				release: null,
				releaseOffset: 0,
				target,
			});

			const x = buf[i * 16 + 12];
			const y = buf[i * 16 + 13] + PARTICLE_Y;
			const z = buf[i * 16 + 14];

			// Start a lens flare beside/behind the held column (if a pool slot is free).
			const flares = flaresRef.current;
			const free = freeSlots.current!;
			if (!flares.has(i) && free.length > 0) {
				const slot = free.pop()!;
				const sprite = flarePool.sprites[slot];
				const baseY = buf[i * 16 + 13];
				sprite.position.set(
					x + FLARE_SIDE * FLARE_SIDE_DIRX,
					baseY + COL_HEIGHT - FLARE_SINK,
					z + FLARE_SIDE * FLARE_SIDE_DIRZ,
				);
				sprite.scale.set(0.001, 0.001, 1);
				(sprite.material as THREE.SpriteMaterial).opacity = 0;
				sprite.visible = true;
				flares.set(i, {
					slot,
					start: now,
					release: null,
					releaseScale: 0,
					x,
					z,
					baseY,
				});
			}
			const prev = prevKey.current;
			if (prev && now - prev.t < TRAIL_MAX_GAP) {
				// Lay particles along the segment from the previous key to this one.
				const dx = x - prev.x,
					dy = y - prev.y,
					dz = z - prev.z;
				const dist = Math.hypot(dx, dz);
				const n = Math.max(
					TRAIL_MIN,
					Math.min(TRAIL_MAX, Math.round(dist * TRAIL_DENSITY)),
				);
				for (let k = 0; k < n; k++) {
					const t = n === 1 ? 0.5 : k / (n - 1);
					spawnAt(
						prev.x +
							dx * t +
							(Math.random() * 2 - 1) * TRAIL_JITTER,
						prev.y + dy * t,
						prev.z +
							dz * t +
							(Math.random() * 2 - 1) * TRAIL_JITTER,
						now,
					);
				}
			} else {
				// No recent predecessor: a small burst at the key itself.
				for (let k = 0; k < TRAIL_BURST; k++) {
					spawnAt(
						x + (Math.random() * 2 - 1) * TRAIL_JITTER,
						y,
						z + (Math.random() * 2 - 1) * TRAIL_JITTER,
						now,
					);
				}
			}
			prevKey.current = { x, y, z, t: now };
			particleGeo.attributes.position.needsUpdate = true;
			particleGeo.attributes.aOpacity.needsUpdate = true;
			particleGeo.attributes.aSize.needsUpdate = true;
		};

		// Release a held column + flare: freeze their current height/size, then let
		// the per-frame loops play the fall and fade.
		const releaseHold = (i: number, now: number) => {
			const hold = animsRef.current.get(i);
			if (hold && hold.release === null) {
				hold.releaseOffset = riseOffset(now - hold.start, hold.target);
				hold.release = now;
			}
			const flare = flaresRef.current.get(i);
			if (flare && flare.release === null) {
				flare.releaseScale = flareScale(now - flare.start);
				flare.release = now;
			}
		};
		const onKeyUp = (e: KeyboardEvent) => {
			const i = codeToIndex(e.code);
			if (i === undefined) return;
			releaseHold(i, clock.getElapsedTime());
		};
		const onBlur = () => {
			const now = clock.getElapsedTime();
			for (const i of animsRef.current.keys()) releaseHold(i, now);
			for (const i of flaresRef.current.keys()) releaseHold(i, now);
		};

		window.addEventListener("keydown", onKey);
		window.addEventListener("keyup", onKeyUp);
		window.addEventListener("blur", onBlur);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("blur", onBlur);
		};
	}, [
		clock,
		buf,
		particleGeo,
		flarePool,
		pPos,
		pOpacity,
		pSize,
		pVel,
		pBirth,
		pLife,
	]);

	// Per-frame: rise/hold while a key is down, fall + bounce after release.
	useFrame(() => {
		const mesh = meshRef.current;
		const anims = animsRef.current;
		if (!mesh || anims.size === 0) return;
		const now = clock.getElapsedTime();
		const m = scratchRef.current;
		for (const [i, hold] of anims) {
			m.fromArray(buf, i * 16);
			if (hold.release !== null && now - hold.release >= FALL_DURATION) {
				mesh.setMatrixAt(i, m); // settled: exact base matrix, no drift
				anims.delete(i);
				continue;
			}
			m.elements[13] = buf[i * 16 + 13] + holdHeight(hold, now);
			mesh.setMatrixAt(i, m);
		}
		mesh.instanceMatrix.needsUpdate = true;
	});

	// Per-frame: grow flares while held, fade + release them after keyup.
	useFrame(() => {
		const flares = flaresRef.current;
		if (flares.size === 0) return;
		const now = clock.getElapsedTime();
		for (const [i, flare] of flares) {
			const sprite = flarePool.sprites[flare.slot];
			const mat = sprite.material as THREE.SpriteMaterial;
			// Track the rising column so the flare stays at its top edge.
			const hold = animsRef.current.get(i);
			const rise = hold ? holdHeight(hold, now) : 0;
			sprite.position.set(
				flare.x + FLARE_SIDE * FLARE_SIDE_DIRX,
				flare.baseY + COL_HEIGHT + rise - FLARE_SINK,
				flare.z + FLARE_SIDE * FLARE_SIDE_DIRZ,
			);
			if (flare.release === null) {
				const held = now - flare.start;
				const sc = flareScale(held);
				sprite.scale.set(sc, sc, 1);
				mat.opacity = Math.min(1, held / 0.08); // quick fade-in
			} else {
				const fo = (now - flare.release) / FLARE_FADE;
				if (fo >= 1) {
					sprite.visible = false;
					mat.opacity = 0;
					freeSlots.current!.push(flare.slot);
					flares.delete(i);
					continue;
				}
				mat.opacity = 1 - fo;
				const sc = flare.releaseScale * (1 + 0.25 * fo); // slight dissipating expand
				sprite.scale.set(sc, sc, 1);
			}
		}
	});

	// Per-frame: float + fade active particles; free them when their life ends.
	useFrame((_, delta) => {
		if (pActive.current <= 0) return;
		const now = clock.getElapsedTime();
		const dt = Math.min(delta, 0.05); // clamp on tab-refocus / hitches
		for (let p = 0; p < MAX_PARTICLES; p++) {
			const birth = pBirth[p];
			if (birth < 0) continue;
			const age = now - birth;
			const life = pLife[p];
			if (age >= life) {
				pBirth[p] = -1;
				pOpacity[p] = 0;
				pActive.current--;
				continue;
			}
			pPos[p * 3] += pVel[p * 3] * dt;
			pPos[p * 3 + 1] += pVel[p * 3 + 1] * dt;
			pPos[p * 3 + 2] += pVel[p * 3 + 2] * dt;
			pVel[p * 3] *= TRAIL_DAMP;
			pVel[p * 3 + 1] *= TRAIL_DAMP;
			pVel[p * 3 + 2] *= TRAIL_DAMP;
			const t = age / life;
			const fadeIn = Math.min(1, age / PARTICLE_FADE_IN);
			pOpacity[p] = fadeIn * (1 - t) * (1 - t); // quick-in, ease-out fade
		}
		particleGeo.attributes.position.needsUpdate = true;
		particleGeo.attributes.aOpacity.needsUpdate = true;
	});

	useEffect(() => {
		const t = targetRef.current;
		scene.add(t);
		return () => {
			scene.remove(t);
		};
	}, [scene]);

	useEffect(() => {
		if (lightRef.current) lightRef.current.target = targetRef.current;
	}, []);

	useEffect(() => {
		if (!lightRef.current) return;
		lightRef.current.color.copy(keyLightColor);
	}, [keyLightColor]);

	useEffect(() => {
		if (lightColor !== undefined) return;
		const update = () => {
			const c = readCssColor();
			if (c) setCssColor(c);
		};
		update();
		const obs = new MutationObserver(update);
		obs.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class", "style"],
		});
		const iv = setInterval(update, 300);
		return () => {
			obs.disconnect();
			clearInterval(iv);
		};
	}, [lightColor]);

	// Track --keycolor (interactive columns) and --lightvibrant (particle trail).
	useEffect(() => {
		const update = () => {
			const k = readCssVarColor("--keycolor");
			if (k) setKeyColor(k);
			const t = readCssVarColor("--lightvibrant");
			if (t) setTrailColor(t);
		};
		update();
		const obs = new MutationObserver(update);
		obs.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class", "style"],
		});
		const iv = setInterval(update, 300);
		return () => {
			obs.disconnect();
			clearInterval(iv);
		};
	}, []);

	const az = (lightAzimuthDeg! * Math.PI) / 180;
	const el = (lightElevDeg! * Math.PI) / 180;
	const D = 60;

	return (
		<>
			<ambientLight color={ambientColor} intensity={ambientIntensity} />
			<directionalLight
				ref={lightRef}
				color={keyLightColor}
				intensity={lightIntensity}
				position={[
					Math.sin(az) * Math.cos(el) * D,
					Math.sin(el) * D,
					Math.cos(az) * Math.cos(el) * D,
				]}
				castShadow={false}
			/>
			<instancedMesh ref={meshRef} args={[geo, mat, count]} />

			{/* Key-press particle trail; renders over the columns, under the HTML clock. */}
			<points
				geometry={particleGeo}
				material={particleMat}
				frustumCulled={false}
			/>

			{/* Key-hold lens flares (pooled sprites). */}
			<primitive object={flarePool.group} />

			<mesh position={[0, -8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
				<planeGeometry args={[500, 500]} />
				<meshStandardMaterial
					ref={floorRef}
					color={floorColor}
					emissive={floorColor}
					emissiveIntensity={2.5}
				/>
			</mesh>
		</>
	);
}

function BasaltCanvas(props: BasaltBackgroundProps) {
	return (
		<Canvas
			style={{
				position: "fixed",
				inset: 0,
				zIndex: -1,
				background: "#ffffff",
				...props.style,
			}}
			camera={{ fov: 6, near: 1, far: 1000, position: [0, 200, 0.1] }}
			gl={{
				antialias: true,
				toneMapping: THREE.NoToneMapping,
				toneMappingExposure: 1.0,
			}}
			onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
		>
			<Scene {...props} />
			<EffectComposer>
				<Bloom
					intensity={0.6}
					luminanceThreshold={0.7}
					luminanceSmoothing={0.9}
					mipmapBlur
				/>
			</EffectComposer>
		</Canvas>
	);
}

const BasaltCanvasDynamic = dynamic(() => Promise.resolve(BasaltCanvas), {
	ssr: false,
});
export function BasaltBackground(props: BasaltBackgroundProps) {
	return <BasaltCanvasDynamic {...props} />;
}
