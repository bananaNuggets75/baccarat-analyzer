import { useEffect, useState } from "react";
import type { AnalysisResult, Hand } from "../types";
import { buildHand } from "../analysis/scoring";
import HandEntry from "./components/HandEntry";
import PredictionPanel from "./components/PredictionPanel";
import RoadsPanel from "./components/RoadsPanel";
import ShoePanel from "./components/ShoePanel";
import styles from "./App.module.css";

type Tab = "predict" | "roads" | "shoe";

export default function App() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [tab, setTab] = useState<Tab>("predict");
  const [handCount, setHandCount] = useState(0);

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
    // Initial load
    fetchState();

    // Auto-refresh whenever the background persists a new hand to storage
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if ('bac:shoe' in changes) fetchState();
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
        {(["predict", "roads", "shoe"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.active : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "predict" ? "Prediction" : t === "roads" ? "Roads" : "Shoe"}
          </button>
        ))}
      </nav>

      <main className={styles.content}>
        {tab === "predict" && <PredictionPanel result={result} />}
        {tab === "roads"   && <RoadsPanel result={result} />}
        {tab === "shoe"    && <ShoePanel result={result} />}
      </main>
    </div>
  );
}
