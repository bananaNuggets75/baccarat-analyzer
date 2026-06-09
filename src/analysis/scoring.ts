import type { Card, Hand, HandOutcome, NaturalType, Rank } from "../types";

const RANK_VALUE: Record<Rank, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5,
  "6": 6, "7": 7, "8": 8, "9": 9,
  "10": 0, J: 0, Q: 0, K: 0,
};

export function cardValue(card: Card): number {
  return RANK_VALUE[card.rank];
}

export function handScore(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + cardValue(c), 0) % 10;
}

export function needsThirdCard(playerScore: number, bankerScore: number, playerThird?: Card): {
  playerDraws: boolean;
  bankerDraws: boolean;
} {
  // naturals — no draw
  if (playerScore >= 8 || bankerScore >= 8) {
    return { playerDraws: false, bankerDraws: false };
  }

  const playerDraws = playerScore <= 5;

  let bankerDraws = false;
  if (!playerDraws) {
    bankerDraws = bankerScore <= 5;
  } else if (playerThird !== undefined) {
    const pv = cardValue(playerThird);
    if (bankerScore <= 2) bankerDraws = true;
    else if (bankerScore === 3) bankerDraws = pv !== 8;
    else if (bankerScore === 4) bankerDraws = pv >= 2 && pv <= 7;
    else if (bankerScore === 5) bankerDraws = pv >= 4 && pv <= 7;
    else if (bankerScore === 6) bankerDraws = pv === 6 || pv === 7;
    // bankerScore 7 stands
  } else {
    // player drew but we don't know the card yet — default to score rule
    bankerDraws = bankerScore <= 5;
  }

  return { playerDraws, bankerDraws };
}

export function determineOutcome(playerScore: number, bankerScore: number): HandOutcome {
  if (playerScore === bankerScore) return "tie";
  return bankerScore > playerScore ? "banker" : "player";
}

export function isNatural(playerScore: number, bankerScore: number): NaturalType {
  if (playerScore === 9 || bankerScore === 9) return "natural9";
  if (playerScore === 8 || bankerScore === 8) return "natural8";
  return null;
}

export function isPair(cards: Card[]): boolean {
  return cards.length >= 2 && cards[0].rank === cards[1].rank;
}

export function buildHand(
  id: number,
  playerCards: Card[],
  bankerCards: Card[]
): Hand {
  const playerScore = handScore(playerCards);
  const bankerScore = handScore(bankerCards);
  return {
    id,
    playerCards,
    bankerCards,
    outcome: determineOutcome(playerScore, bankerScore),
    playerScore,
    bankerScore,
    natural: isNatural(playerScore, bankerScore),
    playerPair: isPair(playerCards),
    bankerPair: isPair(bankerCards),
    timestamp: Date.now(),
  };
}
