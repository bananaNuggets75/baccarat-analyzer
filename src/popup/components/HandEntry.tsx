import { useState } from "react";
import type { Card, Hand, HandOutcome, Rank, Suit } from "../../types";
import { buildHand } from "../../analysis/scoring";
import styles from "./HandEntry.module.css";

const RANKS: Rank[] = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const SUITS: Suit[] = ["spades","hearts","diamonds","clubs"];
const SUIT_SYMBOL: Record<Suit, string> = {
  spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣",
};

interface Props {
  onSubmit: (hand: Hand) => void;
  nextId: number;
}

type SideKey = "p1" | "p2" | "p3" | "b1" | "b2" | "b3";

const EMPTY: Record<SideKey, Card | null> = {
  p1: null, p2: null, p3: null, b1: null, b2: null, b3: null,
};

export default function HandEntry({ onSubmit, nextId }: Props) {
  const [cards, setCards] = useState<Record<SideKey, Card | null>>(EMPTY);
  const [active, setActive] = useState<SideKey>("p1");

  function setCard(rank: Rank, suit: Suit) {
    const next = { ...cards, [active]: { rank, suit } };
    setCards(next);
    // auto-advance to next empty slot
    const order: SideKey[] = ["p1","p2","p3","b1","b2","b3"];
    const idx = order.indexOf(active);
    for (let i = idx + 1; i < order.length; i++) {
      if (!next[order[i]]) { setActive(order[i]); break; }
    }
  }

  function clearSlot(key: SideKey) {
    setCards({ ...cards, [key]: null });
    setActive(key);
  }

  function submit() {
    const pc = [cards.p1, cards.p2, cards.p3].filter(Boolean) as Card[];
    const bc = [cards.b1, cards.b2, cards.b3].filter(Boolean) as Card[];
    if (pc.length < 2 || bc.length < 2) return;
    onSubmit(buildHand(nextId, pc, bc));
    setCards(EMPTY);
    setActive("p1");
  }

  function renderSlot(key: SideKey, label: string) {
    const card = cards[key];
    const isActive = active === key;
    return (
      <button
        key={key}
        className={`${styles.slot} ${isActive ? styles.slotActive : ""} ${card ? styles.slotFilled : ""}`}
        onClick={() => { setActive(key); if (card) clearSlot(key); }}
        title={card ? `${card.rank}${SUIT_SYMBOL[card.suit]} — click to clear` : label}
      >
        {card
          ? <span style={{ color: card.suit === "hearts" || card.suit === "diamonds" ? "#fc8181" : "#e2e8f0" }}>
              {card.rank}{SUIT_SYMBOL[card.suit]}
            </span>
          : <span className={styles.slotLabel}>{label}</span>
        }
      </button>
    );
  }

  const pc = [cards.p1, cards.p2, cards.p3].filter(Boolean) as Card[];
  const bc = [cards.b1, cards.b2, cards.b3].filter(Boolean) as Card[];
  const canSubmit = pc.length >= 2 && bc.length >= 2;

  return (
    <div className={styles.root}>
      <div className={styles.sides}>
        <div className={styles.side}>
          <div className={styles.sideLabel}>Player</div>
          <div className={styles.slots}>
            {renderSlot("p1","P1")}
            {renderSlot("p2","P2")}
            {renderSlot("p3","P3")}
          </div>
        </div>
        <div className={styles.side}>
          <div className={styles.sideLabel}>Banker</div>
          <div className={styles.slots}>
            {renderSlot("b1","B1")}
            {renderSlot("b2","B2")}
            {renderSlot("b3","B3")}
          </div>
        </div>
      </div>

      <div className={styles.picker}>
        <div className={styles.ranks}>
          {RANKS.map((r) => (
            <button key={r} className={styles.rankBtn}
              onClick={() => setCard(r, "spades")}>{r}</button>
          ))}
        </div>
        <div className={styles.suits}>
          {SUITS.map((s) => (
            <button key={s}
              className={`${styles.suitBtn} ${s === "hearts" || s === "diamonds" ? styles.red : ""}`}
              onClick={() => {
                const prevRank = cards[active]?.rank ?? "A";
                setCard(prevRank, s);
              }}
            >{SUIT_SYMBOL[s]}</button>
          ))}
        </div>
      </div>

      <button className={styles.submit} disabled={!canSubmit} onClick={submit}>
        Add Hand #{nextId}
      </button>
    </div>
  );
}
