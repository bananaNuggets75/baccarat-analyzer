import type { Hand, HandOutcome, Roads, RoadCell } from "../types";

function toCell(h: Hand): RoadCell {
  return {
    outcome: h.outcome,
    natural: h.natural,
    playerPair: h.playerPair,
    bankerPair: h.bankerPair,
  };
}

/** Bead Plate: fills row 0–5, then starts a new column */
function buildBeadPlate(hands: Hand[]): RoadCell[][] {
  const ROWS = 6;
  const grid: RoadCell[][] = [];
  let row = 0;
  let col = 0;
  for (const h of hands) {
    if (!grid[col]) grid[col] = [];
    grid[col][row] = toCell(h);
    row++;
    if (row >= ROWS) { row = 0; col++; }
  }
  return grid;
}

/**
 * Big Road: outcomes run downward while the same side keeps winning.
 * On change, start a new column (shifted right). Ties are marked on the
 * last cell of the current column (not a new column).
 */
function buildBigRoad(hands: Hand[]): (RoadCell | null)[][] {
  const grid: (RoadCell | null)[][] = [];
  let col = -1;
  let row = 0;
  let lastNonTie: HandOutcome | null = null;

  for (const h of hands) {
    if (h.outcome === "tie") {
      // mark tie on current cell position without advancing
      if (col >= 0 && row > 0) {
        const targetRow = row - 1;
        if (!grid[col]) grid[col] = [];
        grid[col][targetRow] = toCell(h);
      }
      continue;
    }

    if (h.outcome !== lastNonTie) {
      col++;
      row = 0;
      lastNonTie = h.outcome;
    }

    if (!grid[col]) grid[col] = [];
    grid[col][row] = toCell(h);
    row++;
  }

  return grid;
}

type DerivedGrid = boolean[][];

/**
 * Derived roads — standard casino algorithm.
 * offset 1 = Big Eye Boy, 2 = Small Road, 3 = Cockroach Pig.
 * true = red (predictable / repeating), false = blue (chaotic).
 *
 * For each Big Road cell at (col c, row r), in chronological order:
 *  - r == 0 (a new column starts): red iff the two reference columns
 *    (c-1) and (c-1-offset) have equal length — the pattern "repeated".
 *  - r >= 1 (column extends downward): look at column (c-offset) at the
 *    same depth: red if it also has a cell at row r (matched the move),
 *    blue if it ended exactly at r-1 (failed to match), red if it had
 *    already ended before r-1 (both "fell off" the same way earlier).
 *
 * Output is grouped into display columns: a new column starts whenever
 * the color changes, matching how casinos render these roads.
 */
function buildDerivedRoad(bigRoad: (RoadCell | null)[][], offset: number): DerivedGrid {
  function colLen(c: number): number {
    const col = bigRoad[c];
    if (!col) return 0;
    return col.filter(Boolean).length;
  }

  function hasCell(c: number, r: number): boolean {
    return r >= 0 && r < colLen(c);
  }

  // Walk Big Road cells in chronological order (column-major) and emit colors
  const colors: boolean[] = [];
  for (let c = 0; c < bigRoad.length; c++) {
    const len = colLen(c);
    for (let r = 0; r < len; r++) {
      if (r === 0) {
        if (c < offset + 1) continue; // not enough history yet
        colors.push(colLen(c - 1) === colLen(c - 1 - offset));
      } else {
        if (c < offset) continue;
        if (hasCell(c - offset, r)) colors.push(true);
        else if (hasCell(c - offset, r - 1)) colors.push(false);
        else colors.push(true);
      }
    }
  }

  // Group into display columns: new column on color change, 6 rows max
  const result: DerivedGrid = [];
  let current: boolean[] = [];
  for (const color of colors) {
    if (current.length === 0 || (current[0] === color && current.length < 6)) {
      current.push(color);
    } else {
      result.push(current);
      current = [color];
    }
  }
  if (current.length > 0) result.push(current);

  return result;
}

export function buildRoads(hands: Hand[]): Roads {
  const nonTieHands = hands; // keep ties for bead plate
  const bigRoad = buildBigRoad(nonTieHands);
  return {
    beadPlate: buildBeadPlate(nonTieHands),
    bigRoad,
    bigEyeBoy:    buildDerivedRoad(bigRoad, 1),
    smallRoad:    buildDerivedRoad(bigRoad, 2),
    cockroachPig: buildDerivedRoad(bigRoad, 3),
  };
}

/** Returns the streak pattern signal from the Big Road */
export function patternSignal(roads: Roads): HandOutcome | null {
  const bigRoad = roads.bigRoad;
  if (bigRoad.length < 2) return null;

  const lastCol = bigRoad[bigRoad.length - 1];
  const prevCol = bigRoad[bigRoad.length - 2];
  const lastLen = lastCol?.filter(Boolean).length ?? 0;
  const prevLen = prevCol?.filter(Boolean).length ?? 0;

  // If current streak is shorter than previous, pattern suggests it may continue
  const lastOutcome = lastCol?.find(Boolean);
  if (!lastOutcome) return null;

  return lastLen <= prevLen ? lastOutcome.outcome : null;
}
