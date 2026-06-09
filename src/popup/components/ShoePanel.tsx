import type { AnalysisResult } from "../../types";
import styles from "./ShoePanel.module.css";

interface Props { result: AnalysisResult | null }

const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"] as const;

export default function ShoePanel({ result }: Props) {
  if (!result) return <div className={styles.empty}>Enter hands to see shoe data.</div>;
  const { shoe } = result;
  const total = shoe.totalDecks * 52;
  const dealt = shoe.cardsDealt.length;
  const remaining = total - dealt;
  const pct = (shoe.penetration * 100).toFixed(1);

  // Count remaining cards per rank
  const perRank = shoe.totalDecks * 4;
  const dealtCount: Record<string, number> = {};
  for (const c of shoe.cardsDealt) {
    dealtCount[c.rank] = (dealtCount[c.rank] ?? 0) + 1;
  }

  return (
    <div className={styles.root}>
      <div className={styles.summary}>
        <div className={styles.stat}>
          <div className={styles.statVal}>{shoe.handsPlayed.length}</div>
          <div className={styles.statLbl}>Hands</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statVal}>{remaining}</div>
          <div className={styles.statLbl}>Cards Left</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statVal}>{pct}%</div>
          <div className={styles.statLbl}>Penetration</div>
        </div>
      </div>

      <div className={styles.penetrationBar}>
        <div className={styles.penetrationFill} style={{ width: `${pct}%` }} />
      </div>

      <div className={styles.rankGrid}>
        {RANKS.map((r) => {
          const gone = dealtCount[r] ?? 0;
          const left = perRank - gone;
          const depleted = left / perRank < 0.3;
          return (
            <div key={r} className={`${styles.rankCell} ${depleted ? styles.depleted : ""}`}>
              <div className={styles.rankName}>{r}</div>
              <div className={styles.rankLeft}>{left}</div>
              <div className={styles.rankOf}>/{perRank}</div>
            </div>
          );
        })}
      </div>

      <div className={styles.history}>
        <div className={styles.title}>Last 10 Hands</div>
        {shoe.handsPlayed.slice(-10).reverse().map((h) => (
          <div key={h.id} className={styles.handRow}>
            <span className={styles.handId}>#{h.id}</span>
            <span className={`${styles.handOutcome} ${styles[h.outcome]}`}>
              {h.outcome.toUpperCase()}
            </span>
            <span className={styles.handScore}>{h.playerScore} – {h.bankerScore}</span>
            {h.natural && <span className={styles.natural}>N</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
