export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export interface Card {
  rank: Rank;
  suit: Suit;
}

export type HandOutcome = "banker" | "player" | "tie";
export type NaturalType = "natural8" | "natural9" | null;

export interface Hand {
  id: number;
  playerCards: Card[];
  bankerCards: Card[];
  outcome: HandOutcome;
  playerScore: number;
  bankerScore: number;
  natural: NaturalType;
  playerPair: boolean;
  bankerPair: boolean;
  timestamp: number;
}

export interface ShoeState {
  totalDecks: number;
  cardsDealt: Card[];
  handsPlayed: Hand[];
  penetration: number; // 0–1, fraction of shoe dealt
}

export interface EdgeCalc {
  bankerEdge: number;  // house edge % on banker bet
  playerEdge: number;  // house edge % on player bet
  tieEdge: number;
  bankerPairEdge: number;
  playerPairEdge: number;
  recommendation: HandOutcome;
  confidence: number; // 0–1
}

export interface RoadCell {
  outcome: HandOutcome;
  natural: NaturalType;
  playerPair: boolean;
  bankerPair: boolean;
}

export interface Roads {
  beadPlate: RoadCell[][];       // 6 rows × N cols
  bigRoad: (RoadCell | null)[][]; // standard dragon tail
  bigEyeBoy: boolean[][];        // red/blue grid derived from bigRoad
  smallRoad: boolean[][];
  cockroachPig: boolean[][];
}

export interface Prediction {
  recommended: HandOutcome;
  bankerProb: number;
  playerProb: number;
  tieProb: number;
  modelConfidence: number;
  patternSignal: HandOutcome | null;
  edgeSignal: HandOutcome;
}

export interface AnalysisResult {
  roads: Roads;
  edge: EdgeCalc;
  prediction: Prediction;
  shoe: ShoeState;
}

export interface ExtMessage {
  type: "ADD_HAND" | "RESET_SHOE" | "GET_STATE" | "SCREENSHOT_HAND" | "WS_GAME_EVENT" | "GET_LOG";
  payload?: unknown;
}

