"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import dynamic from "next/dynamic";
import * as THREE from "three";
import { buildNoise } from "./noise";
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

	const refCb = useCallback(
		(mesh: THREE.InstancedMesh | null) => {
			if (!mesh) return;
			const m = new THREE.Matrix4();
			for (let i = 0; i < count; i++) {
				m.fromArray(buf, i * 16);
				mesh.setMatrixAt(i, m);
			}
			mesh.instanceMatrix.needsUpdate = true;
		},
		[count, buf],
	);

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
			<instancedMesh ref={refCb} args={[geo, mat, count]} />

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
