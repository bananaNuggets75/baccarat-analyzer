/**
 * Combines card-counting edge, road pattern signal, and (eventually) ML model
 * into a single Prediction output.
 */
import type { EdgeCalc, Hand, Prediction, Roads } from "../types";
import { patternSignal } from "./roads";

export function predict(
  edge: EdgeCalc,
  roads: Roads,
  _recentHands: Hand[],
  modelProbs?: { banker: number; player: number; tie: number }
): Prediction {
  const pattern = patternSignal(roads);

  // Base probabilities from house edge adjusted values
  // Convert edge % → rough win probability (banker wins ~50.68% of decisive hands)
  let bankerProb = 0.4586;
  let playerProb = 0.4462;
  let tieProb    = 0.0952;

  // Shift based on card counting edge differential
  const edgeDiff = edge.bankerEdge - edge.playerEdge; // negative = banker better
  const shift = Math.min(Math.abs(edgeDiff) * 0.05, 0.03);
  if (edge.recommendation === "banker") {
    bankerProb += shift;
    playerProb -= shift;
  } else {
    playerProb += shift;
    bankerProb -= shift;
  }

  // Blend in model probabilities if available (from trained TF.js model)
  if (modelProbs) {
    const weight = 0.6; // trust model 60%, prior 40%
    bankerProb = bankerProb * (1 - weight) + modelProbs.banker * weight;
    playerProb = playerProb * (1 - weight) + modelProbs.player * weight;
    tieProb    = tieProb    * (1 - weight) + modelProbs.tie    * weight;
  }

  // Normalize
  const total = bankerProb + playerProb + tieProb;
  bankerProb /= total;
  playerProb /= total;
  tieProb    /= total;

  let recommended: "banker" | "player" | "tie" = "banker";
  if (playerProb > bankerProb && playerProb > tieProb) recommended = "player";

  const modelConfidence = modelProbs
    ? Math.max(modelProbs.banker, modelProbs.player, modelProbs.tie)
    : edge.confidence;

  return {
    recommended,
    bankerProb,
    playerProb,
    tieProb,
    modelConfidence,
    patternSignal: pattern,
    edgeSignal: edge.recommendation,
  };
}
