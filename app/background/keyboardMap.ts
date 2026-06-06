// Maps physical keyboard keys (KeyboardEvent.code) to instances in the hex grid
// built by buildMatrices() in BasaltBackground.tsx.
//
// Grid recap: the build loop is `for q=-30..30 { for r=-30..30 }`, so
//   index = (q + 30) * 61 + (r + 30)
// and an instance's world position is x = SX*(q + r*0.5), z = SZ*r. Each +1 in r
// shifts x by +SX*0.5 (half a column) — the same half-key stagger a real keyboard
// has — so we place keyboard rows on consecutive r values.
//
// Screen mapping (camera at [0,200,0.1] looking at origin): world +x = screen
// right, world +z = screen DOWN. So the top (number) row gets the smallest r and
// each row below increases r.

const GRID_MIN = -30;
const GRID_MAX = 30;
const GRID_SPAN = GRID_MAX - GRID_MIN + 1; // 61

/** Axial (q, r) → flat instance index. Returns undefined if outside the grid. */
export function qrToIndex(q: number, r: number): number | undefined {
	if (q < GRID_MIN || q > GRID_MAX || r < GRID_MIN || r > GRID_MAX)
		return undefined;
	return (q - GRID_MIN) * GRID_SPAN + (r - GRID_MIN);
}

// --- Tunable layout constants -------------------------------------------------
// Where the keyboard sits and how spread out it is, in grid units. If a key clips
// outside the visible window (~q∈[-7,7], r∈[-3,2] at fov 6), tweak these.
const KB_CENTER_Q = 0; // horizontal center of the keyboard, in q
const KB_CENTER_R = 1; // vertical center of the keyboard, in r (shifted down a bit)
// NOTE: these are in grid-cell units, so they scale with R in BasaltBackground.tsx.
// If you change R, divide these by the same factor to keep the on-screen footprint.
const KB_COL_STEP = 2; // base q between adjacent keys (before scatter)
const KB_ROW_STEP = 2.5; // base r between rows (before scatter)
const KB_JITTER_RADIUS = 1; // each key is randomly nudged within this many hexes (0 = rigid grid)

// Each row, top → bottom, as KeyboardEvent.code values, plus a small fractional
// `rowOffset` (in q) for the subtle per-row keyboard stagger.
interface KbRow {
	codes: string[];
	rowOffset: number;
}

const ROWS: KbRow[] = [
	{
		codes: [
			"Digit1",
			"Digit2",
			"Digit3",
			"Digit4",
			"Digit5",
			"Digit6",
			"Digit7",
			"Digit8",
			"Digit9",
			"Digit0",
			"Minus",
			"Equal",
		],
		rowOffset: 0,
	},
	{
		codes: [
			"KeyQ",
			"KeyW",
			"KeyE",
			"KeyR",
			"KeyT",
			"KeyY",
			"KeyU",
			"KeyI",
			"KeyO",
			"KeyP",
			"BracketLeft",
			"BracketRight",
		],
		rowOffset: 0.5,
	},
	{
		codes: [
			"KeyA",
			"KeyS",
			"KeyD",
			"KeyF",
			"KeyG",
			"KeyH",
			"KeyJ",
			"KeyK",
			"KeyL",
			"Semicolon",
			"Quote",
		],
		rowOffset: 0.75,
	},
	{
		codes: [
			"KeyZ",
			"KeyX",
			"KeyC",
			"KeyV",
			"KeyB",
			"KeyN",
			"KeyM",
			"Comma",
			"Period",
			"Slash",
		],
		rowOffset: 1,
	},
	{
		codes: ["Space"],
		rowOffset: 0,
	},
];

// --- Deterministic per-key scatter --------------------------------------------
// A stable hash of the key code seeds a small PRNG so each key's random nudge is
// the same on every load (the layout doesn't reshuffle when you refresh).
function hashSeed(str: string): number {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}
function mulberry32(a: number): () => number {
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
/** Axial hex-grid distance from the origin cell. */
function hexDist(dq: number, dr: number): number {
	return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// Precompute the code → instance index table once at module load.
const CODE_TO_INDEX: Record<string, number> = (() => {
	const map: Record<string, number> = {};
	const used = new Set<number>(); // ensure no two keys land on the same hexagon
	const rowMid = (ROWS.length - 1) / 2; // center the rows vertically around KB_CENTER_R
	ROWS.forEach((row, rowIdx) => {
		const r0 = KB_CENTER_R + Math.round((rowIdx - rowMid) * KB_ROW_STEP);
		const half = (row.codes.length - 1) / 2;
		row.codes.forEach((code, keyIdx) => {
			const slot = keyIdx - half; // symmetric horizontal slot around center
			// Subtract r*0.5 to undo the grid's accumulating x-stagger (keeps rows
			// vertically centered), then re-add a small rowOffset for keyboard feel.
			const q0 = Math.round(
				KB_CENTER_Q + slot * KB_COL_STEP - r0 * 0.5 + row.rowOffset,
			);
			// Scatter: pick a stable random cell within KB_JITTER_RADIUS of the grid
			// slot, skipping cells that are off-grid or already taken.
			const rng = mulberry32(hashSeed(code));
			let idx = qrToIndex(q0, r0);
			for (let attempt = 0; attempt < 32; attempt++) {
				const dq = Math.round((rng() * 2 - 1) * KB_JITTER_RADIUS);
				const dr = Math.round((rng() * 2 - 1) * KB_JITTER_RADIUS);
				if (hexDist(dq, dr) > KB_JITTER_RADIUS) continue;
				const cand = qrToIndex(q0 + dq, r0 + dr);
				if (cand === undefined || used.has(cand)) continue;
				idx = cand;
				break;
			}
			if (idx === undefined || used.has(idx)) return; // rare: leave unmapped
			used.add(idx);
			map[code] = idx;
		});
	});
	return map;
})();

/** Instance index for a KeyboardEvent.code, or undefined if the key isn't mapped. */
export function codeToIndex(code: string): number | undefined {
	return CODE_TO_INDEX[code];
}

/** All instance indices that correspond to a mapped (interactive) key. */
export const KEYBOARD_INDICES: readonly number[] = Array.from(
	new Set(Object.values(CODE_TO_INDEX)),
);
export const KEYBOARD_INDEX_SET: ReadonlySet<number> = new Set(KEYBOARD_INDICES);
