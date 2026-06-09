import type { EdgeCalc, Hand, Prediction, Roads, SignalSource } from "../types";
import { patternSignal } from "./roads";

export function predict(
  edge: EdgeCalc,
  roads: Roads,
  _recentHands: Hand[]
): Prediction {
  const pattern = patternSignal(roads);

  // ── Base probabilities (static baccarat math) ───────────────────────────
  let bankerProb = 0.4586;
  let playerProb = 0.4462;
  let tieProb    = 0.0952;

  // ── Card count adjustment (tiny in baccarat, only meaningful at depth) ──
  // Only shift probabilities if we've tracked at least 25% of the shoe.
  // Below that threshold the count is unreliable noise.
  const countReliable = edge.confidence >= 0.25;
  if (countReliable) {
    const edgeDiff = edge.bankerEdge - edge.playerEdge;
    const shift = Math.min(Math.abs(edgeDiff) * 0.05, 0.03);
    if (edge.recommendation === "banker") {
      bankerProb += shift;
      playerProb -= shift;
    } else {
      playerProb += shift;
      bankerProb -= shift;
    }
  }

  // Normalize
  const total = bankerProb + playerProb + tieProb;
  bankerProb /= total;
  playerProb /= total;
  tieProb    /= total;

  // ── Determine recommendation and signal source ───────────────────────────
  // Priority: count (when reliable) > pattern > default (Banker = lowest edge)
  let recommended: "banker" | "player" | "tie" = "banker";
  let signalSource: SignalSource = "default";

  if (countReliable && edge.recommendation === "player") {
    // Count has observed enough cards and says player has better edge
    recommended = "player";
    signalSource = "count";
  } else if (pattern !== null) {
    // Pattern signal from road analysis
    recommended = pattern;
    signalSource = "pattern";
  }
  // else: default Banker — no signal, just lowest base house edge

  return {
    recommended,
    bankerProb,
    playerProb,
    tieProb,
    modelConfidence: edge.confidence,
    patternSignal: pattern,
    edgeSignal: edge.recommendation,
    signalSource,
  };
}
