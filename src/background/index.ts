import { analyze, addHandToShoe, newShoe } from "../analysis";
import { buildHand } from "../analysis/scoring";
import type { Card, EvoRawCard, ExtMessage, Hand, Rank, ShoeState, Suit } from "../types";

let shoe: ShoeState = newShoe(8);
// Track round IDs we've already processed to avoid double-counting
const seenRounds = new Set<string>();

// ── Message handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg: ExtMessage, _sender, sendResponse) => {
  switch (msg.type) {
    case "ADD_HAND": {
      const hand = msg.payload as Hand;
      shoe = addHandToShoe(shoe, hand);
      sendResponse({ ok: true, result: analyze(shoe) });
      break;
    }
    case "RESET_SHOE": {
      const decks = (msg.payload as { decks?: number })?.decks ?? 8;
      shoe = newShoe(decks);
      seenRounds.clear();
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

// ── Evolution Gaming WebSocket event handler ─────────────────────────────────
function handleWsEvent(raw: unknown) {
  if (!raw || typeof raw !== 'object') return;
  const msg = raw as Record<string, unknown>;

  // Log every non-trivial game event so we can inspect from the service worker console
  console.log('[EVO WS]', msg.type, JSON.stringify(msg.args ?? {}).substring(0, 300));

  const parsed = tryParseHand(msg);
  if (!parsed) return;

  const roundKey = parsed.roundId ?? `${parsed.playerCards.map(c => c.rank + c.suit[0]).join('')}-${parsed.bankerCards.map(c => c.rank + c.suit[0]).join('')}`;
  if (seenRounds.has(roundKey)) return;
  seenRounds.add(roundKey);

  const hand = buildHand(shoe.handsPlayed.length + 1, parsed.playerCards, parsed.bankerCards);
  shoe = addHandToShoe(shoe, hand);
  console.log('[EVO] Auto-added hand', hand.outcome, '| Shoe penetration', (shoe.penetration * 100).toFixed(1) + '%');
}

// ── Card parser — handles multiple Evolution message formats ─────────────────
interface ParsedHand {
  playerCards: Card[];
  bankerCards: Card[];
  roundId?: string;
}

function tryParseHand(msg: Record<string, unknown>): ParsedHand | null {
  const args = msg.args as Record<string, unknown> | undefined;
  if (!args) return null;

  // Only try to extract a hand from messages that indicate a completed round
  if (!isCompletedRound(args)) return null;

  const roundId = extractRoundId(args);
  const cards = findCardArrays(args);
  if (!cards) return null;

  const playerCards = cards.player.map(normalizeCard).filter(Boolean) as Card[];
  const bankerCards = cards.banker.map(normalizeCard).filter(Boolean) as Card[];

  // A valid baccarat hand always has at least 2 cards per side
  if (playerCards.length < 2 || bankerCards.length < 2) return null;
  if (playerCards.length > 3 || bankerCards.length > 3) return null;

  return { playerCards, bankerCards, roundId };
}

/** Checks whether a message args object signals a completed/resolved round */
function isCompletedRound(args: Record<string, unknown>): boolean {
  const str = JSON.stringify(args).toUpperCase();
  return (
    str.includes('RESOLVED') ||
    str.includes('FINISHED') ||
    str.includes('GAME_RESOLVED') ||
    str.includes('"WINNER"') ||
    str.includes('"RESULT"') ||
    str.includes('PLAYER_WIN') ||
    str.includes('BANKER_WIN') ||
    str.includes('TIE_WIN') ||
    str.includes('"DECIDED"')
  );
}

/** Extracts a round/game ID for deduplication */
function extractRoundId(args: Record<string, unknown>): string | undefined {
  const str = JSON.stringify(args);
  const match = str.match(/"(?:roundId|gameId|round_id|id)"\s*:\s*"([^"]+)"/i);
  return match?.[1];
}

/**
 * Recursively searches for an object with player/banker card arrays.
 * Handles variations like { player: [...], banker: [...] }
 * or { PLAYER: [...], BANKER: [...] } or { Player: [...], Banker: [...] }.
 */
function findCardArrays(
  obj: unknown,
  depth = 0
): { player: EvoRawCard[]; banker: EvoRawCard[] } | null {
  if (depth > 6 || !obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) return null;

  const o = obj as Record<string, unknown>;

  // Look for a "cards" container first
  if (o.cards && typeof o.cards === 'object' && !Array.isArray(o.cards)) {
    const result = findCardArrays(o.cards, depth + 1);
    if (result) return result;
  }

  // Check if this object directly has player + banker arrays
  const playerKey = Object.keys(o).find(k => k.toLowerCase() === 'player');
  const bankerKey = Object.keys(o).find(k => k.toLowerCase() === 'banker');
  if (
    playerKey && bankerKey &&
    Array.isArray(o[playerKey]) && Array.isArray(o[bankerKey]) &&
    (o[playerKey] as unknown[]).length >= 2
  ) {
    return {
      player: o[playerKey] as EvoRawCard[],
      banker: o[bankerKey] as EvoRawCard[],
    };
  }

  // Recurse into nested objects
  for (const val of Object.values(o)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const result = findCardArrays(val, depth + 1);
      if (result) return result;
    }
    // Also check arrays of objects (e.g. results: [{ cards: {...} }])
    if (Array.isArray(val)) {
      for (const item of val) {
        const result = findCardArrays(item, depth + 1);
        if (result) return result;
      }
    }
  }

  return null;
}

/** Converts a raw Evolution card object into our typed Card */
function normalizeCard(raw: unknown): Card | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as EvoRawCard;

  const suitRaw = c.suit ?? c.Suit ?? c.s;
  const valRaw  = c.value ?? c.Value ?? c.v ?? c.rank;

  const suit = normalizeSuit(suitRaw);
  const rank = normalizeRank(valRaw);

  if (!suit || !rank) {
    console.warn('[EVO] Could not normalize card:', JSON.stringify(raw));
    return null;
  }
  return { suit, rank };
}

function normalizeSuit(raw: unknown): Suit | null {
  if (typeof raw === 'number') {
    // Common Evolution encoding: 0=S 1=H 2=D 3=C  (or 1=S 2=H 3=D 4=C)
    return (['spades', 'hearts', 'diamonds', 'clubs'] as Suit[])[raw] ??
           (['spades', 'hearts', 'diamonds', 'clubs'] as Suit[])[raw - 1] ??
           null;
  }
  if (typeof raw === 'string') {
    switch (raw.toUpperCase()[0]) {
      case 'S': return 'spades';
      case 'H': return 'hearts';
      case 'D': return 'diamonds';
      case 'C': return 'clubs';
    }
  }
  return null;
}

function normalizeRank(raw: unknown): Rank | null {
  if (typeof raw === 'number') {
    if (raw === 1)  return 'A';
    if (raw >= 2 && raw <= 9) return String(raw) as Rank;
    if (raw === 10) return '10';
    if (raw === 11) return 'J';
    if (raw === 12) return 'Q';
    if (raw === 13) return 'K';
  }
  if (typeof raw === 'string') {
    const v = raw.toUpperCase();
    if (v === 'A' || v === 'ACE' || v === '1') return 'A';
    if (v === 'J' || v === 'JACK' || v === '11') return 'J';
    if (v === 'Q' || v === 'QUEEN' || v === '12') return 'Q';
    if (v === 'K' || v === 'KING' || v === '13') return 'K';
    if (v === 'T' || v === '10') return '10';
    if (['2','3','4','5','6','7','8','9'].includes(v)) return v as Rank;
  }
  return null;
}
