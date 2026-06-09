import type { AnalysisResult, Hand, ShoeState } from "../types";
import { calculateEdge } from "./counting";
import { buildRoads } from "./roads";
import { predict } from "./prediction";

export function analyze(shoe: ShoeState): AnalysisResult {
  const edge = calculateEdge(shoe);
  const roads = buildRoads(shoe.handsPlayed);
  const prediction = predict(edge, roads, shoe.handsPlayed);
  return { roads, edge, prediction, shoe };
}

export function addHandToShoe(shoe: ShoeState, hand: Hand): ShoeState {
  const allCards = [...hand.playerCards, ...hand.bankerCards];
  return {
    ...shoe,
    cardsDealt: [...shoe.cardsDealt, ...allCards],
    handsPlayed: [...shoe.handsPlayed, hand],
    penetration: (shoe.cardsDealt.length + allCards.length) / (shoe.totalDecks * 52),
  };
}

export function newShoe(totalDecks = 8): ShoeState {
  return { totalDecks, cardsDealt: [], handsPlayed: [], penetration: 0 };
}
