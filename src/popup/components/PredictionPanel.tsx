import type { AnalysisResult } from "../../types";
import styles from "./PredictionPanel.module.css";

type Phase = "betting" | "dealing" | "resolved" | null;
interface Props { result: AnalysisResult | null; phase?: Phase }

const LABEL: Record<string, string> = { banker: "BANKER", player: "PLAYER", tie: "TIE" };
const COLOR: Record<string, string> = { banker: "#63b3ed", player: "#fc8181", tie: "#68d391" };

const SIGNAL_LABEL: Record<string, string> = {
  default: "No signal — default (Banker has lower house edge)",
  pattern: "Road pattern signal",
  count:   "Card count signal (25%+ of shoe tracked)",
};
const SIGNAL_COLOR: Record<string, string> = {
  default: "#4a5568",
  pattern: "#f6c90e",
  count:   "#68d391",
};

function pct(n: number) { return (n * 100).toFixed(1) + "%"; }
function edge(n: number) { return (n >= 0 ? "+" : "") + n.toFixed(3) + "%"; }

export default function PredictionPanel({ result, phase }: Props) {
  if (!result) return <div className={styles.empty}>Waiting for hand data…</div>;

  const { prediction, edge: edgeCalc } = result;
  const rec = prediction.recommended;
  const src = prediction.signalSource;

  const lastHand = result.shoe?.handsPlayed?.at(-1);

  return (
    <div className={styles.root}>

      {/* ── Phase banner ── */}
      {phase === 'betting' && (
        <div className={styles.bettingBanner}>
          <span className={styles.bettingDot} />
          BET NOW — Betting window open
        </div>
      )}
      {phase === 'dealing' && (
        <div className={styles.dealingBanner}>Dealing cards…</div>
      )}
      {phase === 'resolved' && lastHand && (
        <div className={styles.resolvedBanner}>
          Last hand: <strong style={{ color: COLOR[lastHand.outcome] }}>
            {LABEL[lastHand.outcome]}
          </strong> (P:{lastHand.playerScore} B:{lastHand.bankerScore})
        </div>
      )}

      {/* ── Recommendation ── */}
      <div className={styles.recommendation} style={{ borderColor: COLOR[rec] }}>
        <div className={styles.recLabel}>Suggested Bet</div>
        <div className={styles.recValue} style={{ color: COLOR[rec] }}>{LABEL[rec]}</div>
        <div className={styles.signalBadge} style={{ color: SIGNAL_COLOR[src] }}>
          {SIGNAL_LABEL[src]}
        </div>
        <div className={styles.coverage}>
          Cards tracked: {pct(prediction.modelConfidence)}
          {prediction.modelConfidence < 0.25 && (
            <span className={styles.warn}> — count unreliable until 25%</span>
          )}
        </div>
      </div>

      {/* ── Win probabilities ── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Win Probabilities (this shoe)</div>
        {(["banker", "player", "tie"] as const).map((side) => {
          const prob = side === "banker" ? prediction.bankerProb
                     : side === "player" ? prediction.playerProb
                     : prediction.tieProb;
          return (
            <div key={side} className={styles.bar}>
              <span className={styles.barLabel} style={{ color: COLOR[side] }}>{LABEL[side]}</span>
              <div className={styles.track}>
                <div className={styles.fill} style={{ width: pct(prob), background: COLOR[side] }} />
              </div>
              <span className={styles.barPct}>{pct(prob)}</span>
            </div>
          );
        })}
        <div className={styles.note}>
          Barely move from base (45.9% B / 44.6% P) — don't over-index on small differences.
        </div>
      </div>

      {/* ── Card count edge ── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Card Count Edge</div>
        {(["banker", "player", "tie"] as const).map((side) => {
          const val = side === "banker" ? edgeCalc.bankerEdge
                    : side === "player" ? edgeCalc.playerEdge
                    : edgeCalc.tieEdge;
          return (
            <div key={side} className={styles.edgeRow}>
              <span style={{ color: COLOR[side] }}>{LABEL[side]}</span>
              <span style={{ color: val > 0 ? "#68d391" : "#fc8181" }}>{edge(val)}</span>
            </div>
          );
        })}
        {prediction.modelConfidence < 0.25 && (
          <div className={styles.note}>Track more cards for reliable count.</div>
        )}
      </div>

      {/* ── Pattern signal ── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Road Pattern Signal</div>
        {prediction.patternSignal ? (
          <div className={styles.patternValue} style={{ color: COLOR[prediction.patternSignal] }}>
            {LABEL[prediction.patternSignal]}
            <span className={styles.patternNote}> — streak likely continues</span>
          </div>
        ) : (
          <div className={styles.note}>No clear pattern yet (need more hands).</div>
        )}
      </div>

    </div>
  );
}
