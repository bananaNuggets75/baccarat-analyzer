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

// ── Training log entry ───────────────────────────────────────────────────────
interface LogEntry {
  ts: number;
  shoeId: string;
  gameId: string;
  outcome: string;
  pScore: number;
  bScore: number;
  pCards: string; // e.g. "5H TD KS"
  bCards: string;
  nat: boolean;
  pp: boolean;
  bp: boolean;
}

// ── State ────────────────────────────────────────────────────────────────────
let shoe: ShoeState = newShoe(8);
let shoeHistoryLoaded = false;
let currentShoeId: string = Date.now().toString();
let lastShoeCardsOut = 0;
const pendingGameData = new Map<string, EvoGameData>();
const seenGameIds = new Set<string>();

function persistShoe() {
  chrome.storage.local.set({ 'bac:shoe': shoe });
}

function appendToLog(entry: LogEntry) {
  chrome.storage.local.get('bac:log', (data) => {
    const log: LogEntry[] = (data['bac:log'] as LogEntry[]) ?? [];
    log.push(entry);
    chrome.storage.local.set({ 'bac:log': log });
  });
}

chrome.storage.local.get('bac:shoe', (data) => {
  if (data['bac:shoe']) {
    shoe = data['bac:shoe'] as ShoeState;
    console.log(`[EVO] Restored ${shoe.handsPlayed.length} hands from storage`);
  }
});

// ── Extension message handler ────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg: ExtMessage, _sender, sendResponse) => {
  switch (msg.type) {
    case "ADD_HAND": {
      shoe = addHandToShoe(shoe, msg.payload as Hand);
      persistShoe();
      sendResponse({ ok: true, result: analyze(shoe) });
      break;
    }
    case "RESET_SHOE": {
      const decks = (msg.payload as { decks?: number })?.decks ?? 8;
      shoe = newShoe(decks);
      shoeHistoryLoaded = false;
      pendingGameData.clear();
      seenGameIds.clear();
      persistShoe();
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
    case "GET_LOG": {
      chrome.storage.local.get('bac:log', (data) => {
        sendResponse({ ok: true, log: data['bac:log'] ?? [] });
      });
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
        // Detect shoe shuffle: cards-out counter reset below last known value
        if (out < lastShoeCardsOut - 10) {
          currentShoeId = Date.now().toString();
          shoeHistoryLoaded = false;
          shoe = newShoe(8);
          pendingGameData.clear();
          seenGameIds.clear();
          console.log('[EVO] New shoe detected — state reset');
        }
        lastShoeCardsOut = out;
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
  persistShoe();
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
  persistShoe();

  appendToLog({
    ts: Date.now(),
    shoeId: currentShoeId,
    gameId,
    outcome: hand.outcome,
    pScore: hand.playerScore,
    bScore: hand.bankerScore,
    pCards: playerCards.map(c => c.rank + c.suit[0].toUpperCase()).join(' '),
    bCards: bankerCards.map(c => c.rank + c.suit[0].toUpperCase()).join(' '),
    nat: !!hand.natural,
    pp: hand.playerPair,
    bp: hand.bankerPair,
  });

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
