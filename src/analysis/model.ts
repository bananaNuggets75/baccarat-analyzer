/**
 * Logistic regression inference — mirrors train/train.py feature extraction exactly.
 *
 * Feature vector (25 features, ORDER MUST MATCH train.py FEATURE_NAMES):
 *  [0]  penetration        cards_dealt / 416
 *  [1]  hand_num           min(hands.length, 80)
 *  [2-11] comp_0..comp_9  fraction of remaining deck per baccarat value
 *  [12] recent_banker_5
 *  [13] recent_player_5
 *  [14] recent_tie_5
 *  [15] recent_banker_10
 *  [16] recent_player_10
 *  [17] recent_tie_10
 *  [18] streak_dir         1=banker, -1=player, 0=tie/none
 *  [19] streak_len         capped at 15
 *  [20] shoe_banker_rate
 *  [21] shoe_player_rate
 *  [22] shoe_tie_rate
 *  [23] pair_rate
 *  [24] natural_rate
 */

import type { Card, ShoeState } from "../types";

export interface ModelWeights {
  version: number;
  feature_names: string[];
  classes: string[];        // e.g. ["banker", "player", "tie"]
  coef: number[][];         // shape: [n_classes, n_features]
  intercept: number[];      // shape: [n_classes]
  scaler_mean: number[];    // shape: [n_features]
  scaler_scale: number[];   // shape: [n_features]
  metadata: {
    accuracy: number;
    baseline_accuracy: number;
    lift_pp: number;
    n_training_samples: number;
    trained_at: string;
  };
}

export interface MLResult {
  bankerProb: number;
  playerProb: number;
  tieProb: number;
  modelUsed: boolean;
}

// ── Baccarat value lookup ─────────────────────────────────────────────────────
const BAC_VALUE: Record<string, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5,
  "6": 6, "7": 7, "8": 8, "9": 9,
  "10": 0, J: 0, Q: 0, K: 0,
};

// Starting count per bac-value in an 8-deck shoe
// Value 0 (10/J/Q/K): 4 ranks × 4 suits × 8 decks = 128
// Values 1-9 (A, 2-9): 1 rank × 4 suits × 8 decks = 32 each
const INITIAL_COUNTS = [128, 32, 32, 32, 32, 32, 32, 32, 32, 32];
const TOTAL_CARDS = 416;

// ── Module-level weights (set once by background on startup) ─────────────────
let _weights: ModelWeights | null = null;

export function setModelWeights(w: ModelWeights): void {
  _weights = w;
  console.log(
    `[ML] Weights loaded — acc ${(w.metadata.accuracy * 100).toFixed(2)}%`,
    `(baseline ${(w.metadata.baseline_accuracy * 100).toFixed(2)}%,`,
    `lift ${w.metadata.lift_pp > 0 ? '+' : ''}${w.metadata.lift_pp.toFixed(2)}pp)`,
    `trained ${w.metadata.trained_at}`,
  );
}

export function getModelMetadata() {
  return _weights?.metadata ?? null;
}

// ── Feature extraction ────────────────────────────────────────────────────────

function bacValue(card: Card): number {
  return BAC_VALUE[card.rank] ?? 0;
}

function countIn(arr: string[], val: string): number {
  let n = 0;
  for (const x of arr) if (x === val) n++;
  return n;
}

export function extractFeatures(shoe: ShoeState): number[] {
  const { handsPlayed, cardsDealt } = shoe;

  // ── Card composition from dealt cards ──
  const dealtByVal = new Array(10).fill(0);
  for (const c of cardsDealt) {
    dealtByVal[bacValue(c)]++;
  }
  const totalDealt = cardsDealt.length;
  const penetration = totalDealt / TOTAL_CARDS;
  const handNum = Math.min(handsPlayed.length, 80);

  const totalRemaining = Math.max(TOTAL_CARDS - totalDealt, 1);
  const compFeatures: number[] = INITIAL_COUNTS.map((init, v) =>
    Math.max(init - dealtByVal[v], 0) / totalRemaining
  );

  // ── Outcome-based features ──
  const outcomes = handsPlayed.map(h => h.outcome as string);
  const recent5  = outcomes.slice(-5);
  const recent10 = outcomes.slice(-10);

  const len5  = Math.max(recent5.length, 1);
  const len10 = Math.max(recent10.length, 1);
  const b5  = countIn(recent5, 'banker')  / len5;
  const p5  = countIn(recent5, 'player')  / len5;
  const t5  = countIn(recent5, 'tie')     / len5;
  const b10 = countIn(recent10, 'banker') / len10;
  const p10 = countIn(recent10, 'player') / len10;
  const t10 = countIn(recent10, 'tie')    / len10;

  let streakDir = 0;
  let streakLen = 0;
  if (outcomes.length > 0) {
    const last = outcomes[outcomes.length - 1];
    streakDir = last === 'banker' ? 1 : last === 'player' ? -1 : 0;
    for (let i = outcomes.length - 1; i >= 0; i--) {
      if (outcomes[i] === last) streakLen++;
      else break;
    }
    streakLen = Math.min(streakLen, 15);
  }

  const total = Math.max(outcomes.length, 1);
  const bankerRate  = countIn(outcomes, 'banker') / total;
  const playerRate  = countIn(outcomes, 'player') / total;
  const tieRate     = countIn(outcomes, 'tie')    / total;
  const pairRate    = handsPlayed.filter(h => h.playerPair || h.bankerPair).length / total;
  const naturalRate = handsPlayed.filter(h => h.natural !== null).length / total;

  return [
    penetration,
    handNum,
    ...compFeatures,   // indices 2-11
    b5, p5, t5,        // 12-14
    b10, p10, t10,     // 15-17
    streakDir,         // 18
    streakLen,         // 19
    bankerRate, playerRate, tieRate,  // 20-22
    pairRate,          // 23
    naturalRate,       // 24
  ];
}

// ── Softmax ───────────────────────────────────────────────────────────────────

function softmax(z: number[]): number[] {
  const max = Math.max(...z);
  const exps = z.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}

// ── Inference ─────────────────────────────────────────────────────────────────

const FALLBACK: MLResult = {
  bankerProb: 0.4586,
  playerProb: 0.4462,
  tieProb: 0.0952,
  modelUsed: false,
};

export function predictML(shoe: ShoeState): MLResult {
  if (!_weights || shoe.handsPlayed.length < 2) return FALLBACK;

  const raw = extractFeatures(shoe);

  // Standardise: (x - mean) / scale
  const scaled = raw.map((x, i) =>
    (_weights!.scaler_scale[i] > 0)
      ? (x - _weights!.scaler_mean[i]) / _weights!.scaler_scale[i]
      : 0
  );

  // z[k] = coef[k] · scaled + intercept[k]
  const z = _weights.coef.map((row, k) => {
    const dot = row.reduce((sum, c, i) => sum + c * scaled[i], 0);
    return dot + _weights!.intercept[k];
  });

  const probs = softmax(z);

  const result: MLResult = { bankerProb: 0, playerProb: 0, tieProb: 0, modelUsed: true };
  _weights.classes.forEach((cls, i) => {
    if (cls === 'banker') result.bankerProb = probs[i];
    else if (cls === 'player') result.playerProb = probs[i];
    else if (cls === 'tie') result.tieProb = probs[i];
  });

  return result;
}
