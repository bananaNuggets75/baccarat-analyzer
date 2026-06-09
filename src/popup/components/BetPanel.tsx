import { useMemo } from "react";
import type { AnalysisResult, Hand, Prediction } from "../../types";
import { analyze, addHandToShoe } from "../../analysis";
import styles from "./BetPanel.module.css";

type Phase = "betting" | "dealing" | "resolved" | null;
interface Props { result: AnalysisResult | null; phase?: Phase }

const LABEL: Record<string, string> = { banker: "BANKER", player: "PLAYER", tie: "TIE" };
const SHORT: Record<string, string> = { banker: "B", player: "P", tie: "T" };
const COLOR: Record<string, string> = { banker: "#63b3ed", player: "#fc8181", tie: "#68d391" };

function makeSyntheticHand(id: number, outcome: "banker" | "player" | "tie"): Hand {
  return {
    id, outcome,
    playerCards: [], bankerCards: [],
    playerScore: 0, bankerScore: 0,
    natural: null, playerPair: false, bankerPair: false,
    timestamp: Date.now(),
  };
}

export default function BetPanel({ result, phase }: Props) {
  if (!result) {
    return (
      <div className={styles.empty}>
        <div>♠</div>
        Waiting for game data…
      </div>
    );
  }

  const isDealing = phase === 'dealing';
  const isBetting = phase === 'betting';
  const rec = result.prediction.recommended;

  // Simulate next 2 future hands assuming each predicted outcome comes true
  const forecasts: Prediction[] = useMemo(() => {
    const preds: Prediction[] = [result.prediction];
    let simShoe = result.shoe;
    for (let i = 0; i < 2; i++) {
      const prevPred = preds[preds.length - 1];
      simShoe = addHandToShoe(
        simShoe,
        makeSyntheticHand(simShoe.handsPlayed.length + 1, prevPred.recommended)
      );
      preds.push(analyze(simShoe).prediction);
    }
    return preds;
  }, [result]);

  const lastHands = result.shoe?.handsPlayed?.slice(-5) ?? [];
  const lastHand = lastHands[lastHands.length - 1];

  return (
    <div className={styles.root}>

      {/* ── Phase status bar ── */}
      {isBetting && (
        <div className={styles.bettingBar}>
          <span className={styles.dot} /> BETTING WINDOW OPEN — PLACE YOUR BET
        </div>
      )}
      {isDealing && (
        <div className={styles.dealingBar}>
          ✋ NO MORE BETS — Cards are being dealt
        </div>
      )}
      {!isBetting && !isDealing && lastHand && (
        <div className={styles.resolvedBar}>
          Last result: <strong style={{ color: COLOR[lastHand.outcome] }}>
            {LABEL[lastHand.outcome]}
          </strong> (P:{lastHand.playerScore} / B:{lastHand.bankerScore})
        </div>
      )}

      {/* ── Big bet recommendation ── */}
      <div
        className={`${styles.betBox} ${isBetting ? styles.betBoxPulse : ''}`}
        style={{ borderColor: isDealing ? '#4a5568' : COLOR[rec] }}
      >
        {isDealing ? (
          <div className={styles.noBets}>NO MORE BETS</div>
        ) : (
          <>
            <div className={styles.betLabel}>BET THIS HAND</div>
            <div className={styles.betValue} style={{ color: COLOR[rec] }}>
              {LABEL[rec]}
            </div>
            <div className={styles.betHint}>
              {result.prediction.signalSource === 'count'
                ? 'Card count edge'
                : result.prediction.signalSource === 'pattern'
                ? 'Road pattern signal'
                : 'Default — lowest house edge'}
            </div>
          </>
        )}
      </div>

      {/* ── 3-hand prediction strip ── */}
      <div className={styles.forecastSection}>
        <div className={styles.forecastTitle}>Predicted next 3 hands</div>
        <div className={styles.forecastRow}>
          {forecasts.map((pred, i) => (
            <div key={i} className={styles.forecastCard}>
              <div className={styles.forecastNum}>Hand {i === 0 ? 'NOW' : `+${i}`}</div>
              <div
                className={`${styles.forecastChip} ${i === 0 ? styles.forecastNow : ''}`}
                style={{ background: COLOR[pred.recommended], boxShadow: i === 0 ? `0 0 12px ${COLOR[pred.recommended]}66` : 'none' }}
              >
                {SHORT[pred.recommended]}
              </div>
              <div className={styles.forecastLabel}>{LABEL[pred.recommended]}</div>
              <div className={styles.forecastPct}>
                {pred.recommended === 'banker'
                  ? (pred.bankerProb * 100).toFixed(0)
                  : pred.recommended === 'player'
                  ? (pred.playerProb * 100).toFixed(0)
                  : (pred.tieProb * 100).toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
        <div className={styles.forecastNote}>
          +1/+2 assume each prediction wins — pattern extrapolation only
        </div>
      </div>

      {/* ── Recent outcomes ── */}
      <div className={styles.recentSection}>
        <div className={styles.recentTitle}>Recent outcomes</div>
        <div className={styles.recentRow}>
          {lastHands.length === 0
            ? <span className={styles.noHistory}>No hands yet</span>
            : lastHands.map((h, i) => (
                <span key={i} className={styles.chip} style={{ background: COLOR[h.outcome] }}>
                  {SHORT[h.outcome]}
                </span>
              ))
          }
          <span className={styles.arrow}>→</span>
          <span className={styles.chip} style={{ background: 'transparent', border: `2px solid ${COLOR[rec]}`, color: COLOR[rec] }}>
            ?
          </span>
        </div>
      </div>

    </div>
  );
}
