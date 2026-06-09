import { useEffect, useState } from "react";
import type { AnalysisResult, Hand } from "../types";
import BetPanel from "./components/BetPanel";
import PredictionPanel from "./components/PredictionPanel";
import HandEntry from "./components/HandEntry";
import RoadsPanel from "./components/RoadsPanel";
import ShoePanel from "./components/ShoePanel";
import styles from "./App.module.css";

type Tab = "bet" | "predict" | "roads" | "shoe";
type Phase = "betting" | "dealing" | "resolved" | null;

export default function App() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [tab, setTab] = useState<Tab>("bet");
  const [handCount, setHandCount] = useState(0);
  const [phase, setPhase] = useState<Phase>(null);

  function fetchState() {
    chrome.runtime.sendMessage({ type: "GET_STATE" }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res?.ok) {
        setResult(res.result);
        setHandCount(res.shoe?.handsPlayed?.length ?? 0);
      }
    });
  }

  useEffect(() => {
    fetchState();
    chrome.storage.local.get('bac:phase', (data) => {
      setPhase((data['bac:phase'] as Phase) ?? null);
    });

    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if ('bac:shoe' in changes) fetchState();
      if ('bac:phase' in changes) {
        const p = changes['bac:phase'].newValue as Phase;
        setPhase(p);
        if (p === 'betting' || p === 'resolved') setTab('bet');
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  function handleHandSubmit(hand: Hand) {
    chrome.runtime.sendMessage({ type: "ADD_HAND", payload: hand }, (res) => {
      if (res?.ok) {
        setResult(res.result);
        setHandCount((n) => n + 1);
      }
    });
  }

  function handleReset() {
    chrome.runtime.sendMessage({ type: "RESET_SHOE", payload: { decks: 8 } }, (res) => {
      if (res?.ok) {
        setResult(null);
        setHandCount(0);
      }
    });
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.logo}>♠ Baccarat Analyzer</span>
        <button className={styles.resetBtn} onClick={handleReset}>New Shoe</button>
      </header>

      <HandEntry onSubmit={handleHandSubmit} nextId={handCount + 1} />

      <nav className={styles.tabs}>
        {([
          ["bet",     "Bet Now"],
          ["predict", "Analysis"],
          ["roads",   "Roads"],
          ["shoe",    "Shoe"],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.active : ""}`}
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className={styles.content}>
        {tab === "bet"     && <BetPanel result={result} phase={phase} />}
        {tab === "predict" && <PredictionPanel result={result} phase={phase} />}
        {tab === "roads"   && <RoadsPanel result={result} />}
        {tab === "shoe"    && <ShoePanel result={result} />}
      </main>
    </div>
  );
}
