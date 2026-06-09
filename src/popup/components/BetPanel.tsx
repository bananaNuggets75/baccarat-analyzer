import { useMemo } from "react";
import type { AnalysisResult, Hand, Prediction } from "../../types";
import { analyze, addHandToShoe } from "../../analysis";
import styles from "./BetPanel.module.css";

type Phase = "betting" | "dealing" | "resolved" | null;
interface Props { result: AnalysisResult | null; phase?: Phase }

const LABEL: Record<string, string> = { banker: "BANKER", player: "PLAYER", tie: "TIE" };
const SHORT: Record<string, string>  = { banker: "B",      player: "P",      tie: "T"  };
const COLOR: Record<string, string>  = { banker: "#63b3ed", player: "#fc8181", tie: "#68d391" };

function makeSyntheticHand(id: number, outcome: "banker" | "player" | "tie"): Hand {
  return {
    id, outcome,
    playerCards: [], bankerCards: [],
    playerScore: 0, bankerScore: 0,
    natural: null, playerPair: false, bankerPair: false,
    timestamp: Date.now(),
  };
}

interface ForecastBranch { plus1: Prediction; plus2: Prediction }

export default function BetPanel({ result, phase }: Props) {
  if (!result) {
    return <div className={styles.empty}><div>♠</div>Waiting for game data…</div>;
  }

  const isDealing = phase === 'dealing';
  const isBetting = phase === 'betting';
  const rec = result.prediction.recommended;
  // opposite for "if wrong" branch
  const opp: "banker" | "player" = rec === 'banker' ? 'player' : 'banker';

  // Build two forecast branches each time result changes (real shoe data)
  const { winBranch, loseBranch } = useMemo<{
    winBranch: ForecastBranch;
    loseBranch: ForecastBranch;
  }>(() => {
    const baseId = result.shoe.handsPlayed.length + 1;

    function branch(outcome1: "banker" | "player" | "tie"): ForecastBranch {
      const shoe1 = addHandToShoe(result.shoe, makeSyntheticHand(baseId, outcome1));
      const pred1 = analyze(shoe1).prediction;
      const shoe2 = addHandToShoe(shoe1, makeSyntheticHand(baseId + 1, pred1.recommended));
      const pred2 = analyze(shoe2).prediction;
      return { plus1: pred1, plus2: pred2 };
    }

    return {
      winBranch:  branch(rec),
      loseBranch: branch(opp),
    };
  }, [result, rec, opp]);

  const lastHands = result.shoe?.handsPlayed?.slice(-5) ?? [];
  const lastHand  = lastHands[lastHands.length - 1];

  return (
    <div className={styles.root}>

      {/* ── Phase status bar ── */}
      {isBetting && (
        <div className={styles.bettingBar}>
          <span className={styles.dot} /> BETTING WINDOW OPEN — PLACE YOUR BET NOW
        </div>
      )}
      {isDealing && (
        <div className={styles.dealingBar}>✋ NO MORE BETS — Cards are being dealt</div>
      )}
      {!isBetting && !isDealing && lastHand && (
        <div className={styles.resolvedBar}>
          Last result:{" "}
          <strong style={{ color: COLOR[lastHand.outcome] }}>{LABEL[lastHand.outcome]}</strong>
          {" "}(P:{lastHand.playerScore} / B:{lastHand.bankerScore})
        </div>
      )}

      {/* ── Big bet box ── */}
      <div
        className={`${styles.betBox} ${isBetting ? styles.betBoxFlash : ''}`}
        style={{ borderColor: isDealing ? '#4a5568' : COLOR[rec] }}
      >
        {isDealing ? (
          <div className={styles.noBets}>NO MORE BETS</div>
        ) : (
          <>
            <div className={styles.betLabel}>BET THIS HAND</div>
            <div className={styles.betValue} style={{ color: COLOR[rec] }}>{LABEL[rec]}</div>
            <div className={styles.betHint}>
              {result.prediction.signalSource === 'count'   ? 'Card count edge'
               : result.prediction.signalSource === 'pattern' ? 'Road pattern signal'
               : 'Default — lowest house edge'}
            </div>
          </>
        )}
      </div>

      {/* ── Forecast table: both branches ── */}
      <div className={styles.forecastSection}>
        <div className={styles.forecastTitle}>
          Next 3 hands — updates after each real result
        </div>

        {/* Header row */}
        <div className={styles.forecastGrid}>
          <div className={styles.fgHeader} />
          <div className={styles.fgHeader}>NOW</div>
          <div className={styles.fgHeader}>+1</div>
          <div className={styles.fgHeader}>+2</div>

          {/* If WIN row */}
          <div className={styles.fgBranchLabel} style={{ color: '#68d391' }}>
            If {SHORT[rec]} wins
          </div>
          <ChipCell outcome={rec} now />
          <ChipCell outcome={winBranch.plus1.recommended} />
          <ChipCell outcome={winBranch.plus2.recommended} />

          {/* If LOSE row */}
          <div className={styles.fgBranchLabel} style={{ color: '#fc8181' }}>
            If {SHORT[opp]} wins
          </div>
          <ChipCell outcome={opp} dim />
          <ChipCell outcome={loseBranch.plus1.recommended} />
          <ChipCell outcome={loseBranch.plus2.recommended} />
        </div>

        <div className={styles.forecastNote}>
          +1/+2 are pattern extrapolations — not guarantees
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
          <span className={styles.chip}
            style={{ background: 'transparent', border: `2px solid ${COLOR[rec]}`, color: COLOR[rec] }}>
            ?
          </span>
        </div>
      </div>

    </div>
  );
}

function ChipCell({ outcome, now, dim }: {
  outcome: "banker" | "player" | "tie";
  now?: boolean;
  dim?: boolean;
}) {
  const SHORT: Record<string, string> = { banker: "B", player: "P", tie: "T" };
  const COLOR: Record<string, string> = { banker: "#63b3ed", player: "#fc8181", tie: "#68d391" };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <span
        style={{
          width: now ? 36 : 28,
          height: now ? 36 : 28,
          borderRadius: '50%',
          background: dim ? 'transparent' : COLOR[outcome],
          border: dim ? `2px solid ${COLOR[outcome]}` : 'none',
          color: dim ? COLOR[outcome] : '#0d1117',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: now ? 14 : 11,
          fontWeight: 900,
          opacity: dim ? 0.5 : 1,
        }}
      >
        {SHORT[outcome]}
      </span>
    </div>
  );
}
