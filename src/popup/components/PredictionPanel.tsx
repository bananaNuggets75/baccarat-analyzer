import type { AnalysisResult } from "../../types";
import styles from "./PredictionPanel.module.css";

interface Props { result: AnalysisResult | null }

const LABEL: Record<string, string> = { banker: "BANKER", player: "PLAYER", tie: "TIE" };
const COLOR: Record<string, string> = { banker: "#63b3ed", player: "#fc8181", tie: "#68d391" };

function pct(n: number) { return (n * 100).toFixed(1) + "%"; }
function edge(n: number) { return (n >= 0 ? "+" : "") + n.toFixed(3) + "%"; }

export default function PredictionPanel({ result }: Props) {
  if (!result) return <div className={styles.empty}>Enter hands to see predictions.</div>;

  const { prediction, edge: edgeCalc } = result;
  const rec = prediction.recommended;

  return (
    <div className={styles.root}>
      <div className={styles.recommendation} style={{ borderColor: COLOR[rec] }}>
        <div className={styles.recLabel}>Recommended Bet</div>
        <div className={styles.recValue} style={{ color: COLOR[rec] }}>{LABEL[rec]}</div>
        <div className={styles.confidence}>
          Cards tracked: {pct(prediction.modelConfidence)}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Win Probabilities</div>
        {(["banker","player","tie"] as const).map((side) => {
          const prob = side === "banker" ? prediction.bankerProb
                     : side === "player" ? prediction.playerProb
                     : prediction.tieProb;
          return (
            <div key={side} className={styles.bar}>
              <span className={styles.barLabel} style={{ color: COLOR[side] }}>{LABEL[side]}</span>
              <div className={styles.track}>
                <div className={styles.fill}
                  style={{ width: pct(prob), background: COLOR[side] }} />
              </div>
              <span className={styles.barPct}>{pct(prob)}</span>
            </div>
          );
        })}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Card Count Edge</div>
        <div className={styles.edgeRow}>
          <span style={{ color: COLOR.banker }}>Banker</span>
          <span>{edge(edgeCalc.bankerEdge)}</span>
        </div>
        <div className={styles.edgeRow}>
          <span style={{ color: COLOR.player }}>Player</span>
          <span>{edge(edgeCalc.playerEdge)}</span>
        </div>
        <div className={styles.edgeRow}>
          <span style={{ color: COLOR.tie }}>Tie</span>
          <span>{edge(edgeCalc.tieEdge)}</span>
        </div>
      </div>

      {prediction.patternSignal && (
        <div className={styles.signal}>
          Pattern signal: <strong style={{ color: COLOR[prediction.patternSignal] }}>
            {LABEL[prediction.patternSignal]}
          </strong>
        </div>
      )}
    </div>
  );
}
