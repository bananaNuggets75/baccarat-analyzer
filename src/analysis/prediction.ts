import type { EdgeCalc, Prediction, Roads, ShoeState, SignalSource } from "../types";
import { patternSignal } from "./roads";
import { predictML } from "./model";

export function predict(
  edge: EdgeCalc,
  roads: Roads,
  shoe: ShoeState,
): Prediction {
  const pattern = patternSignal(roads);

  // ── Base probabilities (static baccarat math) ───────────────────────────
  let bankerProb = 0.4586;
  let playerProb = 0.4462;
  let tieProb    = 0.0952;

  // ── Card count adjustment (only meaningful once >25% of shoe is tracked) ─
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

  // ── ML model blend ───────────────────────────────────────────────────────
  // Alpha grows with shoe depth so the model earns trust as it sees more data.
  // Max 0.65 — never let ML fully override the statistical baseline.
  const ml = predictML(shoe);
  const mlActive = ml.modelUsed && shoe.handsPlayed.length >= 3;

  if (mlActive) {
    const alpha = Math.min(0.65, shoe.penetration * 1.4 + 0.15);
    bankerProb = alpha * ml.bankerProb + (1 - alpha) * bankerProb;
    playerProb = alpha * ml.playerProb + (1 - alpha) * playerProb;
    tieProb    = alpha * ml.tieProb    + (1 - alpha) * tieProb;
  }

  // Normalize
  const total = bankerProb + playerProb + tieProb;
  bankerProb /= total;
  playerProb /= total;
  tieProb    /= total;

  // ── Determine recommendation and signal source ───────────────────────────
  // Priority: count (when reliable) > ML (when active) > pattern > default
  let recommended: "banker" | "player" | "tie" = "banker";
  let signalSource: SignalSource = "default";

  if (countReliable && edge.recommendation === "player") {
    recommended = "player";
    signalSource = "count";
  } else if (mlActive) {
    // ML-blended probabilities: recommend the highest
    if (bankerProb >= playerProb && bankerProb >= tieProb) recommended = "banker";
    else if (playerProb >= bankerProb && playerProb >= tieProb) recommended = "player";
    else recommended = "tie";
    signalSource = "ml";
  } else if (pattern !== null) {
    recommended = pattern;
    signalSource = "pattern";
  }

  return {
    recommended,
    bankerProb,
    playerProb,
    tieProb,
    modelConfidence: edge.confidence,
    patternSignal: pattern,
    edgeSignal: edge.recommendation,
    signalSource,
    mlModelActive: mlActive,
  };
}
