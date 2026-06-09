import { analyze, addHandToShoe, newShoe } from "../analysis";
import { buildHand } from "../analysis/scoring";
import type { Card, ExtMessage, Hand, NaturalType, Rank, ShoeState, Suit } from "../types";

// ── Evolution Gaming wire types ──────────────────────────────────────────────
interface EvoGameData {
  playerHand: { cards: string[]; score: number };
  bankerHand: { cards: string[]; score: number };
  result?: {
    winner: string;
    playerScore: number;
    bankerScore: number;
    playerPair: boolean;
    bankerPair: boolean;
    natural: boolean;
  };
}

interface EvoHistoryEntry {
  winner: string;
  playerScore: number;
  bankerScore: number;
  playerPair?: boolean;
  bankerPair?: boolean;
  natural?: boolean;
}

// ── State ────────────────────────────────────────────────────────────────────
let shoe: ShoeState = newShoe(8);
let shoeHistoryLoaded = false;
// gameId → latest gameData snapshot (updated on every baccarat.cardDealt)
const pendingGameData = new Map<string, EvoGameData>();
// gameIds already added to shoe (deduplication)
const seenGameIds = new Set<string>();

// ── Extension message handler ────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg: ExtMessage, _sender, sendResponse) => {
  switch (msg.type) {
    case "ADD_HAND": {
      shoe = addHandToShoe(shoe, msg.payload as Hand);
      sendResponse({ ok: true, result: analyze(shoe) });
      break;
    }
    case "RESET_SHOE": {
      const decks = (msg.payload as { decks?: number })?.decks ?? 8;
      shoe = newShoe(decks);
      shoeHistoryLoaded = false;
      pendingGameData.clear();
      seenGameIds.clear();
      sendResponse({ ok: true });
      break;
    }
    case "GET_STATE": {
      sendResponse({ ok: true, result: analyze(shoe), shoe });
      break;
    }
    case "WS_GAME_EVENT": {
      handleWsEvent(msg.payload);
      sendResponse({ ok: true });
      break;
    }
    default:
      sendResponse({ ok: false, error: "Unknown message type" });
  }
  return true;
});

// ── Evolution WebSocket dispatcher ───────────────────────────────────────────
function handleWsEvent(raw: unknown) {
  if (!raw || typeof raw !== 'object') return;
  const { type, args } = raw as { type: string; args: Record<string, unknown> };
  if (!type) return;

  console.log('[EVO WS]', type, JSON.stringify(args ?? {}).substring(0, 300));

  const a = (args ?? {}) as Record<string, unknown>;

  switch (type) {
    // Full shoe history — sent once when the socket connects
    case 'baccarat.shoeState':
    case 'baccarat.encodedShoeState':
      if (!shoeHistoryLoaded) {
        loadShoeHistory(a);
        shoeHistoryLoaded = true;
      }
      break;

    // Track card data for the active game so we have it when the round resolves
    case 'baccarat.cardDealt':
    case 'baccarat.gameState': {
      const gameId = a.gameId as string | undefined;
      const gameData = a.gameData as EvoGameData | undefined;
      if (gameId && gameData?.playerHand) {
        pendingGameData.set(gameId, gameData);
      }
      break;
    }

    // baccarat.tableState nests currentGame.gameData — useful when joining mid-hand
    case 'baccarat.tableState': {
      const current = a.currentGame as Record<string, unknown> | undefined;
      if (current?.gameId && current.gameData) {
        pendingGameData.set(
          current.gameId as string,
          current.gameData as EvoGameData
        );
      }
      break;
    }

    // Hand resolved — build and store the hand
    case 'baccarat.resolved':
    case 'widget.resolved': {
      const gameId = a.gameId as string | undefined;
      if (gameId) finalizeHand(gameId);
      break;
    }

    // New game starting — use Evolution's authoritative shoeCardsOut for penetration
    case 'baccarat.newGame': {
      const out = a.shoeCardsOut as number | undefined;
      if (typeof out === 'number') {
        shoe = { ...shoe, penetration: out / (shoe.totalDecks * 52) };
        console.log(`[EVO] Shoe penetration: ${(shoe.penetration * 100).toFixed(1)}% (${out} cards out)`);
      }
      break;
    }
  }
}

// ── Load shoe history on connect ─────────────────────────────────────────────
function loadShoeHistory(args: Record<string, unknown>) {
  const history = (args.history ?? args.history_v2) as EvoHistoryEntry[] | undefined;
  if (!history?.length) return;

  const syntheticHands: Hand[] = history.map((entry, i) => ({
    id: i + 1,
    playerCards: [] as Card[],
    bankerCards: [] as Card[],
    outcome: normalizeWinner(entry.winner),
    playerScore: entry.playerScore,
    bankerScore: entry.bankerScore,
    natural: entry.natural
      ? (entry.playerScore === 9 || entry.bankerScore === 9 ? 'natural9' : 'natural8') as NaturalType
      : null,
    playerPair: entry.playerPair ?? false,
    bankerPair: entry.bankerPair ?? false,
    timestamp: Date.now(),
  }));

  shoe = { ...shoe, handsPlayed: syntheticHands };
  console.log(`[EVO] Loaded ${syntheticHands.length} historical hands from shoe state`);
}

// ── Finalize a resolved hand ──────────────────────────────────────────────────
function finalizeHand(gameId: string) {
  if (seenGameIds.has(gameId)) return;

  const gameData = pendingGameData.get(gameId);
  if (!gameData?.playerHand?.cards?.length || !gameData?.bankerHand?.cards?.length) {
    console.warn('[EVO] No card data for resolved game', gameId);
    return;
  }

  const playerCards = gameData.playerHand.cards.map(parseCardStr).filter(Boolean) as Card[];
  const bankerCards = gameData.bankerHand.cards.map(parseCardStr).filter(Boolean) as Card[];

  if (playerCards.length < 2 || bankerCards.length < 2) {
    console.warn('[EVO] Insufficient cards:', playerCards.length, 'player,', bankerCards.length, 'banker');
    return;
  }

  seenGameIds.add(gameId);
  pendingGameData.delete(gameId);

  const hand = buildHand(shoe.handsPlayed.length + 1, playerCards, bankerCards);
  shoe = addHandToShoe(shoe, hand);

  const result = analyze(shoe);
  console.log(
    `[EVO] Hand #${shoe.handsPlayed.length}: ${hand.outcome.toUpperCase()}`,
    `P:${hand.playerScore} B:${hand.bankerScore}`,
    `| Recommend: ${result.prediction.recommended.toUpperCase()}`,
    `(${(result.prediction.bankerProb * 100).toFixed(1)}% B / ${(result.prediction.playerProb * 100).toFixed(1)}% P)`,
    `| Shoe ${(shoe.penetration * 100).toFixed(1)}%`
  );
}

// ── Card string parser: "TD"→10♦, "5H"→5♥, "KS"→K♠ ─────────────────────────
function parseCardStr(s: string): Card | null {
  if (typeof s !== 'string' || s.length !== 2) return null;
  const rankChar = s[0].toUpperCase();
  const suitChar = s[1].toUpperCase();

  const rankMap: Record<string, Rank> = {
    A: 'A', '2': '2', '3': '3', '4': '4', '5': '5',
    '6': '6', '7': '7', '8': '8', '9': '9',
    T: '10', J: 'J', Q: 'Q', K: 'K',
  };
  const suitMap: Record<string, Suit> = {
    H: 'hearts', D: 'diamonds', C: 'clubs', S: 'spades',
  };

  const rank = rankMap[rankChar];
  const suit = suitMap[suitChar];
  if (!rank || !suit) return null;
  return { rank, suit };
}

function normalizeWinner(w: string): 'banker' | 'player' | 'tie' {
  const l = w.toLowerCase();
  if (l === 'player') return 'player';
  if (l === 'banker') return 'banker';
  return 'tie';
}
