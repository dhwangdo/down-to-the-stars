import assert from "node:assert/strict";
import test from "node:test";

import {
  createCardOriginDeckIds,
  validateDeckEditorCardMove,
} from "../app/game/deckEditorRules.ts";

const baseRequest = {
  source: { area: "deck", deckId: "A" },
  target: { area: "deck", deckId: "B" },
  safeArea: false,
  originalOriginDeckId: "A",
  effectiveOriginDeckId: "A",
  targetDeckCardCount: 0,
  targetDeckCapacity: 10,
  inventoryItemCount: 0,
  inventoryCapacity: 10,
};

test("editor snapshot records origins by card id and deck id", () => {
  const origins = createCardOriginDeckIds(
    [{ id: "A", cards: [{ id: 1 }] }],
    [{ id: "floor-deck", cards: [{ id: 2 }] }],
    [{ id: 3 }],
    [{ id: 4 }],
  );
  assert.deepEqual(origins, { 1: "A", 2: "floor-deck", 3: null, 4: null });
});

test("outside a safe area an original deck card stays bound to its origin deck", () => {
  assert.deepEqual(validateDeckEditorCardMove(baseRequest), {
    allowed: false,
    reason: "origin-locked",
  });
  assert.deepEqual(validateDeckEditorCardMove({
    ...baseRequest,
    target: { area: "inventory" },
  }), { allowed: false, reason: "origin-locked" });
  assert.deepEqual(validateDeckEditorCardMove({
    ...baseRequest,
    target: { area: "floor" },
  }), { allowed: true, action: "schedule-removal" });
});

test("a pending removal can return only to its original deck", () => {
  const pending = { ...baseRequest, source: { area: "pendingRemoval" } };
  assert.deepEqual(validateDeckEditorCardMove({
    ...pending,
    target: { area: "deck", deckId: "A" },
  }), { allowed: true, action: "restore-removal" });
  assert.deepEqual(validateDeckEditorCardMove(pending), {
    allowed: false,
    reason: "origin-locked",
  });
});

test("temporary cards can move freely outside a safe area", () => {
  const temporary = {
    ...baseRequest,
    originalOriginDeckId: null,
    effectiveOriginDeckId: null,
  };
  assert.deepEqual(validateDeckEditorCardMove(temporary), { allowed: true, action: "move" });
  assert.deepEqual(validateDeckEditorCardMove({
    ...temporary,
    target: { area: "inventory" },
  }), { allowed: true, action: "move" });
  assert.deepEqual(validateDeckEditorCardMove({
    ...temporary,
    target: { area: "floor" },
  }), { allowed: true, action: "move" });
});

test("safe-area editing ignores origin deck restrictions", () => {
  assert.deepEqual(validateDeckEditorCardMove({ ...baseRequest, safeArea: true }), {
    allowed: true,
    action: "move",
  });
  assert.deepEqual(validateDeckEditorCardMove({
    ...baseRequest,
    safeArea: true,
    target: { area: "inventory" },
  }), { allowed: true, action: "move" });
});

test("extraction accepts only an unreleased card recorded in a deck at session start", () => {
  assert.deepEqual(validateDeckEditorCardMove({
    ...baseRequest,
    target: { area: "inventory" },
    viaExtractionTicket: true,
  }), { allowed: true, action: "move" });
  assert.deepEqual(validateDeckEditorCardMove({
    ...baseRequest,
    target: { area: "inventory" },
    originalOriginDeckId: null,
    effectiveOriginDeckId: null,
    viaExtractionTicket: true,
  }), { allowed: false, reason: "extract-original-only" });
  assert.deepEqual(validateDeckEditorCardMove({
    ...baseRequest,
    target: { area: "inventory" },
    effectiveOriginDeckId: null,
    viaExtractionTicket: true,
  }), { allowed: false, reason: "extract-original-only" });
});

test("empty decks are allowed while capacities remain enforced", () => {
  assert.deepEqual(validateDeckEditorCardMove({
    ...baseRequest,
    target: { area: "floor" },
  }), { allowed: true, action: "schedule-removal" });
  assert.deepEqual(validateDeckEditorCardMove({
    ...baseRequest,
    originalOriginDeckId: null,
    effectiveOriginDeckId: null,
    targetDeckCardCount: 10,
  }), { allowed: false, reason: "deck-full" });
  assert.deepEqual(validateDeckEditorCardMove({
    ...baseRequest,
    target: { area: "inventory" },
    inventoryItemCount: 10,
    viaExtractionTicket: true,
  }), { allowed: false, reason: "inventory-full" });
});

test("an inventory extraction ticket can free its occupied slot", () => {
  assert.deepEqual(validateDeckEditorCardMove({
    ...baseRequest,
    target: { area: "inventory" },
    inventoryItemCount: 10,
    inventoryCapacity: 10,
    inventorySlotsFreed: 1,
    viaExtractionTicket: true,
  }), { allowed: true, action: "move" });
});
