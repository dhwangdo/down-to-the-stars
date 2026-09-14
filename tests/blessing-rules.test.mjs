import assert from "node:assert/strict";
import test from "node:test";

import {
  BLESSING_IDS,
  hasUniqueCardEffects,
  resolveLethalDamage,
  rollBlessingOffers,
  rollGamblingBlessings,
  shouldPreserveTicket,
} from "../app/game/blessingRules.ts";

test("blessing offers are filled with repeatable empty blessings when the pool is short", () => {
  const owned = BLESSING_IDS.slice(0, -1);
  assert.deepEqual(rollBlessingOffers(owned, 3, () => 0), [BLESSING_IDS.at(-1), "empty", "empty"]);
});

test("gambling excludes itself and already owned blessings", () => {
  const offers = rollGamblingBlessings(["gambling", ...BLESSING_IDS.slice(0, -2)], () => 0);
  assert.equal(offers.length, 2);
  assert.ok(!offers.includes("gambling"));
});

test("highlander compares card effects and ignores card identity and color", () => {
  assert.equal(hasUniqueCardEffects([{ effect: "strike" }, { effect: "defend" }]), true);
  assert.equal(hasUniqueCardEffects([{ effect: "strike" }, { effect: "strike" }]), false);
});

test("1UP revives once at half maximum health rounded down", () => {
  assert.deepEqual(resolveLethalDamage(3, 10, 21, true), { hp: 10, usedOneUp: true });
  assert.deepEqual(resolveLethalDamage(3, 10, 21, false), { hp: 0, usedOneUp: false });
});

test("One More uses a fresh twenty-percent roll", () => {
  assert.equal(shouldPreserveTicket(true, () => .199), true);
  assert.equal(shouldPreserveTicket(true, () => .2), false);
  assert.equal(shouldPreserveTicket(false, () => 0), false);
});
