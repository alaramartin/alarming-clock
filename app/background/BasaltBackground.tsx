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
const AMPLITUDE = 5.5;
const NOISE_SCALE = 0.15;
const SX = R * Math.sqrt(3);
const SZ = R * 1.5;

// --- Key-press pop animation (tunable) ---------------------------------------
const POP_HEIGHT = 6; // peak rise toward the camera, in world units
const POP_DURATION = 0.45; // seconds from press to fully settled
const POP_DAMP = 3.2; // settle damping (higher = bounce dies faster)
const POP_OMEGA = 2.4 * Math.PI; // ~1.2 oscillations: one big pop + a small bounce

// Normalize so the first (largest) peak of the damped sine equals 1.
const POP_NORM = (() => {
	let max = 1e-6;
	for (let u = 0; u <= 1; u += 0.001) {
		const v = Math.exp(-POP_DAMP * u) * Math.sin(POP_OMEGA * u);
		if (v > max) max = v;
	}
	return max;
})();

/** +Y offset for a column `t` seconds after it was pressed. 0 outside the pop. */
function popOffset(t: number): number {
	const u = t / POP_DURATION;
	if (u <= 0 || u >= 1) return 0;
	return (
		(POP_HEIGHT / POP_NORM) *
		Math.exp(-POP_DAMP * u) *
		Math.sin(POP_OMEGA * u)
	);
}

// --- Key-press particle trail (tunable) --------------------------------------
const MAX_PARTICLES = 1200; // ring-buffer pool size
const PARTICLE_LIFETIME = 0.7; // seconds (× random 0.7–1.3); "fades fairly quickly"
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
			const y = noise(x * NOISE_SCALE, z * NOISE_SCALE) * AMPLITUDE;
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
	lightIntensity = 20,
	lightAzimuthDeg = 45,
	lightElevDeg = 30,
	ambientIntensity = 0.4,
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

	useEffect(() => {
		if (!floorRef.current) return;
		floorRef.current.color.copy(floorColor);
		floorRef.current.emissive.copy(floorColor);
	}, [floorColor]);

	const geo = useMemo(() => buildHexPrism(), []);
	// White base so per-instance colors (instanceColor) act as the true albedo.
	const mat = useMemo(
		() =>
			new THREE.MeshStandardMaterial({
				color: "#ffffff",
				roughness: 0.6,
				metalness: 0.0,
				flatShading: true,
			}),
		[],
	);
	const { count, buf } = useMemo(() => buildMatrices(), []);

	const meshRef = useRef<THREE.InstancedMesh>(null);
	// Active pops: instance index -> press start time (R3F clock seconds).
	const animsRef = useRef(new Map<number, number>());
	const scratchRef = useRef(new THREE.Matrix4());
	const clock = useThree((s) => s.clock);
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
	const prevKey = useRef<{ x: number; y: number; z: number; t: number } | null>(
		null,
	);

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

	// One-time fill of every instance matrix + base (dark) color from the buffer.
	useEffect(() => {
		const mesh = meshRef.current;
		if (!mesh) return;
		const m = scratchRef.current;
		const dark = new THREE.Color(BASE_COLOR);
		for (let i = 0; i < count; i++) {
			m.fromArray(buf, i * 16);
			mesh.setMatrixAt(i, m);
			mesh.setColorAt(i, dark);
		}
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}, [count, buf]);

	// Tint just the interactive (keyboard) columns with the current key color.
	useEffect(() => {
		const mesh = meshRef.current;
		if (!mesh) return;
		let c: THREE.Color;
		try {
			c = new THREE.Color(keyColor);
		} catch {
			return;
		}
		for (const i of KEYBOARD_INDEX_SET) mesh.setColorAt(i, c);
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}, [keyColor]);

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
			animsRef.current.set(i, now);

			const x = buf[i * 16 + 12];
			const y = buf[i * 16 + 13] + PARTICLE_Y;
			const z = buf[i * 16 + 14];
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
						prev.x + dx * t + (Math.random() * 2 - 1) * TRAIL_JITTER,
						prev.y + dy * t,
						prev.z + dz * t + (Math.random() * 2 - 1) * TRAIL_JITTER,
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
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [
		clock,
		buf,
		particleGeo,
		pPos,
		pOpacity,
		pSize,
		pVel,
		pBirth,
		pLife,
	]);

	// Per-frame: offset each active column's Y, restoring base when it finishes.
	useFrame(() => {
		const mesh = meshRef.current;
		const anims = animsRef.current;
		if (!mesh || anims.size === 0) return;
		const now = clock.getElapsedTime();
		const m = scratchRef.current;
		for (const [i, start] of anims) {
			m.fromArray(buf, i * 16);
			const t = now - start;
			if (t >= POP_DURATION) {
				mesh.setMatrixAt(i, m); // exact base matrix, no drift
				anims.delete(i);
				continue;
			}
			m.elements[13] = buf[i * 16 + 13] + popOffset(t); // base Y + pop
			mesh.setMatrixAt(i, m);
		}
		mesh.instanceMatrix.needsUpdate = true;
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
		try {
			lightRef.current.color.set(resolved);
		} catch {}
	}, [resolved]);

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
			<ambientLight intensity={ambientIntensity} />
			<directionalLight
				ref={lightRef}
				color={resolved}
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
					intensity={0.4}
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
