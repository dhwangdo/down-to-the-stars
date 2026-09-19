import assert from "node:assert/strict";
import test from "node:test";

import {
  nextRareCardDropChance,
} from "../app/game/rewardRules.ts";
import {
  calculateDeckCapacityScore,
  calculateDeckScore,
  getAvailableDeckEditions,
  generateDebugDecksByScore,
  createBattleReward,
} from "../app/game/rewards.ts";
import {
  TICKET_TYPES,
  TICKET_TIERS,
  ticketBasePrice,
} from "../app/game/shopRules.ts";

test("deck rewards leave the rare-card pity chance unchanged", () => {
  assert.equal(nextRareCardDropChance(0.17, []), 0.17);
});

test("card rewards update the rare-card pity chance", () => {
  assert.equal(nextRareCardDropChance(0.17, [{ rarity: "rare" }]), 0.05);
  assert.equal(nextRareCardDropChance(0.17, [{ rarity: "special" }]), 0.19);
});

test("out-of-depth battle rewards always include a deck", () => {
  const reward = createBattleReward(2, 0, 0, 0, 0, true);
  assert.equal(reward.decks.length, 1);
  assert.equal(reward.cards.length, 0);
});

test("ticket tiers and base prices match the shop rules", () => {
  assert.deepEqual(TICKET_TIERS, {
    paintTicket: 1,
    bombTicket: 1,
    extractTicket: 1,
    mapTicket: 1,
    mindEyeTicket: 1,
    transformTicket: 2,
    cloneTicket: 3,
  });
  for (const type of TICKET_TYPES) {
    assert.equal(ticketBasePrice(type), TICKET_TIERS[type] * 30);
  }
});

test("deck capacity scores follow the five-card growth sequence", () => {
  assert.equal(calculateDeckCapacityScore(15), 0);
  assert.equal(calculateDeckCapacityScore(20), 13);
  assert.equal(calculateDeckCapacityScore(25), 26);
  assert.equal(calculateDeckCapacityScore(30), 39);
});

test("deck score sums editions, rare cards, and capacity", () => {
  const score = calculateDeckScore({
    capacity: 20,
    editions: ["clever", "fantastic"],
    cards: [{ rarity: "special" }, { rarity: "rare" }, { rarity: "basic" }],
  });
  assert.deepEqual(score, {
    editionScore: 80,
    cardScore: 8,
    capacityScore: 13,
    total: 101,
  });
});

test("deck edition scores do not use a progressive surcharge", () => {
  const score = calculateDeckScore({
    capacity: 15,
    editions: ["clever", "roomy", "lively"],
    cards: [],
  });
  assert.equal(score.editionScore, 80);
});

test("recycling editions are mutually exclusive", () => {
  assert.equal(getAvailableDeckEditions(["frugal"]).includes("frugalPlus"), false);
  assert.equal(getAvailableDeckEditions(["frugalPlus"]).includes("frugal"), false);
  assert.equal(getAvailableDeckEditions([]).includes("frugal"), true);
  assert.equal(getAvailableDeckEditions([]).includes("frugalPlus"), true);
});

test("debug score generation creates the requested number of start-score decks", () => {
  const result = generateDebugDecksByScore(0, 3, 100, () => 0.7);
  assert.equal(result.attempted, 3);
  assert.equal(result.discarded, 0);
  assert.equal(result.decks.length, 3);
  assert.ok(result.decks.every((deck) => deck.capacity === 15 && deck.cards.length <= 15));
  assert.ok(result.decks.every((deck) => calculateDeckScore(deck).total === 0));
});

test("special filler cards do not add debug deck score", () => {
  const result = generateDebugDecksByScore(0, 1, 200, () => 0.999);
  assert.equal(result.discarded, 0);
  assert.equal(result.decks.length, 1);
  assert.equal(calculateDeckScore(result.decks[0]).cardScore, 0);
});

test("debug filler bags use three eighths empty slots", () => {
  const result = generateDebugDecksByScore(0, 1, 200, () => 0);
  assert.equal(result.discarded, 0);
  assert.equal(result.decks[0].cards.length, 6);
});
