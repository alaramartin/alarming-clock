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
const KB_CENTER_R = 0; // vertical center of the keyboard, in r
const KB_COL_STEP = 2; // q between adjacent keys (1 = touching, 2 = one buffer hex, 3 = two…)
const KB_ROW_STEP = 3; // r between rows (1 = touching, 3 = two buffer rows…)

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

// Precompute the code → instance index table once at module load.
const CODE_TO_INDEX: Record<string, number> = (() => {
	const map: Record<string, number> = {};
	const rowMid = (ROWS.length - 1) / 2; // center the rows vertically around KB_CENTER_R
	ROWS.forEach((row, rowIdx) => {
		const r = KB_CENTER_R + Math.round((rowIdx - rowMid) * KB_ROW_STEP);
		const half = (row.codes.length - 1) / 2;
		row.codes.forEach((code, keyIdx) => {
			const slot = keyIdx - half; // symmetric horizontal slot around center
			// Subtract r*0.5 to undo the grid's accumulating x-stagger (keeps rows
			// vertically centered), then re-add a small rowOffset for keyboard feel.
			const q = Math.round(
				KB_CENTER_Q + slot * KB_COL_STEP - r * 0.5 + row.rowOffset,
			);
			const idx = qrToIndex(q, r);
			if (idx !== undefined) map[code] = idx;
		});
	});
	return map;
})();

/** Instance index for a KeyboardEvent.code, or undefined if the key isn't mapped. */
export function codeToIndex(code: string): number | undefined {
	return CODE_TO_INDEX[code];
}
