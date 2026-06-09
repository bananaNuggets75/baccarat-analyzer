/**
 * Baccarat edge calculation based on remaining shoe composition.
 * Uses the Thorp & Walden / Griffin derived point values for each rank.
 */
import type { Card, EdgeCalc, ShoeState } from "../types";

// Edge effect of removing one card of each rank from an 8-deck shoe
// Positive = benefits banker, negative = benefits player
const BANKER_EV: Record<string, number> = {
  A:  -0.00031, "2": 0.00099, "3": 0.00109, "4": 0.00149,
  "5": 0.00264, "6": 0.00094, "7": -0.00069, "8": -0.00038,
  "9": -0.00130, "10": 0.00010, J: 0.00010, Q: 0.00010, K: 0.00010,
};
const PLAYER_EV: Record<string, number> = {
  A:  0.00030, "2": -0.00086, "3": -0.00098, "4": -0.00144,
  "5": -0.00249, "6": -0.00090, "7": 0.00063, "8": 0.00048,
  "9": 0.00120, "10": -0.00009, J: -0.00009, Q: -0.00009, K: -0.00009,
};

const BASE_BANKER_EDGE = -0.01058; // −1.058% house edge on banker (after 5% commission)
const BASE_PLAYER_EDGE = -0.01235; // −1.235% house edge on player
const BASE_TIE_EDGE    = -0.14360; // −14.36% house edge on tie (8:1 payout)
const BASE_BANKER_PAIR = -0.10540;
const BASE_PLAYER_PAIR = -0.10540;

function countRemaining(shoe: ShoeState): Record<string, number> {
  const total = shoe.totalDecks * 52;
  const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const perRank = shoe.totalDecks * 4;
  const counts: Record<string, number> = {};
  for (const r of ranks) counts[r] = perRank;
  for (const c of shoe.cardsDealt) {
    counts[c.rank] = (counts[c.rank] ?? 0) - 1;
  }
  return counts;
}

export function calculateEdge(shoe: ShoeState): EdgeCalc {
  const remaining = countRemaining(shoe);
  const totalRemaining = shoe.totalDecks * 52 - shoe.cardsDealt.length;

  let bankerAdj = 0;
  let playerAdj = 0;
  for (const [rank, count] of Object.entries(remaining)) {
    const removed = shoe.totalDecks * 4 - count;
    bankerAdj += removed * (BANKER_EV[rank] ?? 0);
    playerAdj += removed * (PLAYER_EV[rank] ?? 0);
  }

  const bankerEdge = (BASE_BANKER_EDGE + bankerAdj) * 100;
  const playerEdge = (BASE_PLAYER_EDGE + playerAdj) * 100;
  const tieEdge    = BASE_TIE_EDGE * 100;
  const bankerPairEdge = BASE_BANKER_PAIR * 100;
  const playerPairEdge = BASE_PLAYER_PAIR * 100;

  // Recommendation: pick whichever is least negative (smallest house edge)
  let recommendation: "banker" | "player" | "tie" = "banker";
  if (playerEdge > bankerEdge) recommendation = "player";

  const spread = Math.abs(bankerEdge - playerEdge);
  const confidence = Math.min(spread / 0.5, 1); // normalize to 0–1

  return {
    bankerEdge,
    playerEdge,
    tieEdge,
    bankerPairEdge,
    playerPairEdge,
    recommendation,
    confidence,
  };
}
