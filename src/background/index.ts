import { analyze, addHandToShoe, newShoe } from "../analysis";
import type { ExtMessage, Hand, ShoeState } from "../types";

let shoe: ShoeState = newShoe(8);

chrome.runtime.onMessage.addListener((msg: ExtMessage, _sender, sendResponse) => {
  switch (msg.type) {
    case "ADD_HAND": {
      const hand = msg.payload as Hand;
      shoe = addHandToShoe(shoe, hand);
      const result = analyze(shoe);
      sendResponse({ ok: true, result });
      break;
    }
    case "RESET_SHOE": {
      const decks = (msg.payload as { decks?: number })?.decks ?? 8;
      shoe = newShoe(decks);
      sendResponse({ ok: true });
      break;
    }
    case "GET_STATE": {
      const result = analyze(shoe);
      sendResponse({ ok: true, result, shoe });
      break;
    }
    default:
      sendResponse({ ok: false, error: "Unknown message type" });
  }
  return true; // keep channel open for async
});
