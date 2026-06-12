import type { AnalysisResult, HandOutcome, RoadCell } from "../../types";
import styles from "./RoadsPanel.module.css";

interface Props { result: AnalysisResult | null }

const BG: Record<HandOutcome, string> = {
  banker: "#63b3ed", player: "#fc8181", tie: "#68d391",
};

function BeadGrid({ grid }: { grid: RoadCell[][] }) {
  if (!grid.length) return <div className={styles.empty}>No data yet.</div>;
  return (
    <div className={styles.beadGrid}>
      {grid.map((col, ci) =>
        Array.from({ length: 6 }).map((_, ri) => {
          const cell = col[ri];
          return (
            <div key={`${ci}-${ri}`} className={styles.bead}
              style={{ background: cell ? BG[cell.outcome] : "#1a1f2e",
                       gridColumn: ci + 1, gridRow: ri + 1 }}>
              {cell?.natural ? "N" : ""}
            </div>
          );
        })
      )}
    </div>
  );
}

function BigRoadGrid({ grid }: { grid: (RoadCell | null)[][] }) {
  if (!grid.length) return <div className={styles.empty}>No data yet.</div>;
  const maxRow = Math.max(...grid.map((col) => col.filter(Boolean).length));
  return (
    <div className={styles.bigRoadGrid} style={{ gridTemplateColumns: `repeat(${grid.length}, 20px)` }}>
      {grid.map((col, ci) =>
        Array.from({ length: Math.max(maxRow, 1) }).map((_, ri) => {
          const cell = col[ri];
          return (
            <div key={`${ci}-${ri}`} className={styles.bead}
              style={{ background: cell ? BG[cell.outcome] : "transparent",
                       gridColumn: ci + 1, gridRow: ri + 1,
                       border: cell ? undefined : "none" }}>
              {cell?.natural ? "N" : ""}
            </div>
          );
        })
      )}
    </div>
  );
}

export default function RoadsPanel({ result }: Props) {
  if (!result) return <div className={styles.empty}>Enter hands to see roads.</div>;
  const { roads } = result;

  return (
    <div className={styles.root}>
      <section>
        <div className={styles.title}>Bead Plate</div>
        <div className={styles.scroll}><BeadGrid grid={roads.beadPlate} /></div>
      </section>
      <section>
        <div className={styles.title}>Big Road</div>
        <div className={styles.scroll}><BigRoadGrid grid={roads.bigRoad} /></div>
      </section>
      <div className={styles.legend}>
        <span><span className={styles.dot} style={{background:"#63b3ed"}} />Banker</span>
        <span><span className={styles.dot} style={{background:"#fc8181"}} />Player</span>
        <span><span className={styles.dot} style={{background:"#68d391"}} />Tie</span>
      </div>
    </div>
  );
}
