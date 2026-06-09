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
 * Derived roads compare current column length vs prior column lengths.
 * offset 1 = Big Eye Boy, 2 = Small Road, 3 = Cockroach Pig.
 * true = repetitive (red), false = chaotic (blue).
 */
function buildDerivedRoad(bigRoad: (RoadCell | null)[][], offset: number): DerivedGrid {
  const result: DerivedGrid = [];

  function colLen(c: number): number {
    const col = bigRoad[c];
    if (!col) return 0;
    return col.filter(Boolean).length;
  }

  for (let col = offset; col < bigRoad.length; col++) {
    const len = colLen(col);
    const refLen = colLen(col - offset);
    if (!result[col - offset]) result[col - offset] = [];

    for (let row = 0; row < len; row++) {
      const refRow = colLen(col - offset + 1 - 1); // derived comparison
      const repetitive = row === 0
        ? colLen(col - offset + 1) >= colLen(col - offset - 1 + 1)
        : row < refLen;
      result[col - offset].push(repetitive);
    }
  }

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
