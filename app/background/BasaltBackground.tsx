"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import dynamic from "next/dynamic";
import * as THREE from "three";
import { buildNoise } from "./noise";
import { codeToIndex } from "./keyboardMap";
import { EffectComposer, Bloom } from "@react-three/postprocessing";

export interface BasaltBackgroundProps {
	lightColor?: THREE.ColorRepresentation;
	lightIntensity?: number;
	lightAzimuthDeg?: number;
	lightElevDeg?: number;
	ambientIntensity?: number;
	style?: React.CSSProperties;
}

const R = 1.0;
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

function readCssColor(): string | null {
	if (typeof window === "undefined") return null;
	const raw = getComputedStyle(document.documentElement)
		.getPropertyValue("--albumcolor")
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
	const mat = useMemo(
		() =>
			new THREE.MeshStandardMaterial({
				color: "#0d0d0f",
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

	// One-time fill of every instance matrix from the base buffer.
	useEffect(() => {
		const mesh = meshRef.current;
		if (!mesh) return;
		const m = scratchRef.current;
		for (let i = 0; i < count; i++) {
			m.fromArray(buf, i * 16);
			mesh.setMatrixAt(i, m);
		}
		mesh.instanceMatrix.needsUpdate = true;
	}, [count, buf]);

	// Map key presses to a column pop. Ignore auto-repeat; share the R3F clock.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.repeat) return;
			const i = codeToIndex(e.code);
			if (i === undefined) return;
			if (e.code === "Space") e.preventDefault(); // avoid page scroll
			animsRef.current.set(i, clock.getElapsedTime());
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [clock]);

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
