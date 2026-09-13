export type DeckEditorCardArea = "deck" | "inventory" | "floor" | "pendingRemoval";

export type DeckEditorCardLocation = {
  area: DeckEditorCardArea;
  deckId?: string;
};

export type CardOriginDeckIds = Record<number, string | null>;

type CardLike = { id: number };
type DeckLike = { id: string; cards: CardLike[] };

export function createCardOriginDeckIds(
  ownedDecks: DeckLike[],
  floorDecks: DeckLike[],
  inventoryCards: CardLike[],
  floorCards: CardLike[],
): CardOriginDeckIds {
  const origins: CardOriginDeckIds = {};
  for (const card of [...inventoryCards, ...floorCards]) origins[card.id] = null;
  for (const deck of [...ownedDecks, ...floorDecks]) {
    for (const card of deck.cards) origins[card.id] = deck.id;
  }
  return origins;
}

export type DeckEditorMoveBlockReason =
  | "same-location"
  | "minimum-deck-size"
  | "inventory-full"
  | "deck-full"
  | "origin-locked"
  | "extract-original-only";

export type DeckEditorMoveAction = "move" | "schedule-removal" | "restore-removal";

export type DeckEditorMoveValidation =
  | { allowed: true; action: DeckEditorMoveAction }
  | { allowed: false; reason: DeckEditorMoveBlockReason };

export type DeckEditorMoveRequest = {
  source: DeckEditorCardLocation;
  target: DeckEditorCardLocation;
  safeArea: boolean;
  originalOriginDeckId: string | null;
  effectiveOriginDeckId: string | null;
  sourceDeckCardCount?: number;
  targetDeckCardCount?: number;
  targetDeckCapacity?: number;
  inventoryItemCount: number;
  inventoryCapacity: number;
  viaExtractionTicket?: boolean;
};

export function validateDeckEditorCardMove(request: DeckEditorMoveRequest): DeckEditorMoveValidation {
  const sameLocation = request.source.area === request.target.area
    && (request.source.area !== "deck" || request.source.deckId === request.target.deckId);
  if (sameLocation) return { allowed: false, reason: "same-location" };

  const leavesSourceDeck = request.source.area === "deck"
    && (request.target.area !== "deck" || request.source.deckId !== request.target.deckId);
  if (leavesSourceDeck && (request.sourceDeckCardCount ?? 0) <= 1) {
    return { allowed: false, reason: "minimum-deck-size" };
  }
  if (request.target.area === "inventory"
    && request.source.area !== "inventory"
    && request.inventoryItemCount >= request.inventoryCapacity) {
    return { allowed: false, reason: "inventory-full" };
  }
  if (request.target.area === "deck"
    && (request.source.area !== "deck" || request.source.deckId !== request.target.deckId)
    && (request.targetDeckCardCount ?? 0) >= (request.targetDeckCapacity ?? 0)) {
    return { allowed: false, reason: "deck-full" };
  }

  if (request.viaExtractionTicket) {
    if (
      request.source.area !== "deck"
      || request.target.area !== "inventory"
      || request.originalOriginDeckId === null
      || request.effectiveOriginDeckId === null
    ) return { allowed: false, reason: "extract-original-only" };
    return { allowed: true, action: "move" };
  }

  if (request.safeArea) {
    return { allowed: true, action: request.source.area === "pendingRemoval" ? "restore-removal" : "move" };
  }

  if (request.source.area === "pendingRemoval") {
    if (request.target.area === "deck" && request.target.deckId === request.effectiveOriginDeckId) {
      return { allowed: true, action: "restore-removal" };
    }
    return { allowed: false, reason: "origin-locked" };
  }

  if (request.effectiveOriginDeckId !== null) {
    if (request.source.area !== "deck" || request.source.deckId !== request.effectiveOriginDeckId) {
      return { allowed: false, reason: "origin-locked" };
    }
    if (request.target.area === "floor") return { allowed: true, action: "schedule-removal" };
    if (request.target.area === "deck" && request.target.deckId === request.effectiveOriginDeckId) {
      return { allowed: false, reason: "same-location" };
    }
    return { allowed: false, reason: "origin-locked" };
  }

  return { allowed: true, action: "move" };
}
