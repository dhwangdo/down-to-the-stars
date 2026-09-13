import assert from "node:assert/strict";
import test from "node:test";

import {
  nextRareCardDropChance,
} from "../app/game/rewardRules.ts";
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
