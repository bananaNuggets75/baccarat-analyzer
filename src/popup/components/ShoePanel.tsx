import { useEffect, useState } from "react";
import type { AnalysisResult } from "../../types";
import styles from "./ShoePanel.module.css";

interface Props { result: AnalysisResult | null }

interface LogStats { hands: number; shoes: number; avgPerShoe: number }

const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"] as const;

function exportAllData() {
  chrome.runtime.sendMessage({ type: 'GET_LOG' }, (res) => {
    if (!res?.ok || !res.log?.length) return;
    const rows = [
      ['Timestamp','ShoeID','GameID','Winner','PlayerScore','BankerScore','PlayerCards','BankerCards','Natural','PlayerPair','BankerPair'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...res.log.map((e: any) => [
        new Date(e.ts).toISOString(), e.shoeId, e.gameId,
        e.outcome, e.pScore, e.bScore,
        e.pCards, e.bCards,
        e.nat ? 'Y' : 'N', e.pp ? 'Y' : 'N', e.bp ? 'Y' : 'N',
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `baccarat-training-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function exportCSV(result: AnalysisResult) {
  const rows = [
    ["Hand","Winner","PlayerScore","BankerScore","PlayerCards","BankerCards","Natural","PlayerPair","BankerPair"],
    ...result.shoe.handsPlayed.map((h) => [
      h.id,
      h.outcome,
      h.playerScore,
      h.bankerScore,
      h.playerCards.map((c) => c.rank + c.suit[0].toUpperCase()).join(" "),
      h.bankerCards.map((c) => c.rank + c.suit[0].toUpperCase()).join(" "),
      h.natural ?? "",
      h.playerPair ? "Y" : "N",
      h.bankerPair ? "Y" : "N",
    ]),
  ];

  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `baccarat-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ShoePanel({ result }: Props) {
  const [logStats, setLogStats] = useState<LogStats | null>(null);
  const handCount = result?.shoe.handsPlayed.length ?? 0;

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_LOG' }, (res) => {
      if (chrome.runtime.lastError) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const log: any[] = res?.ok ? res.log : [];
      if (!log.length) { setLogStats({ hands: 0, shoes: 0, avgPerShoe: 0 }); return; }
      const shoes = new Set(log.map((e) => e.shoeId)).size;
      setLogStats({ hands: log.length, shoes, avgPerShoe: log.length / Math.max(shoes, 1) });
    });
  }, [handCount]);

  if (!result) return <div className={styles.empty}>Enter hands to see shoe data.</div>;
  const { shoe } = result;
  const total = shoe.totalDecks * 52;
  const dealt = shoe.cardsDealt.length;
  const remaining = total - dealt;
  const pct = (shoe.penetration * 100).toFixed(1);

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
        <div className={styles.historyHeader}>
          <span className={styles.title}>Last 10 Hands</span>
          <button className={styles.exportBtn} onClick={() => exportCSV(result)}>
            This Shoe
          </button>
          <button className={styles.exportBtn} onClick={exportAllData}>
            All Data
          </button>
        </div>
        {shoe.handsPlayed.slice(-10).reverse().map((h) => (
          <div key={h.id} className={styles.handRow}>
            <span className={styles.handId}>#{h.id}</span>
            <span className={`${styles.handOutcome} ${styles[h.outcome]}`}>
              {h.outcome.toUpperCase()}
            </span>
            <span className={styles.handScore}>{h.playerScore} – {h.bankerScore}</span>
            {h.natural && <span className={styles.natural}>N</span>}
            {h.playerPair && <span className={styles.pair}>PP</span>}
            {h.bankerPair && <span className={styles.pair}>BP</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
