import assert from "node:assert/strict";
import test from "node:test";

import { calculateDefenseGain, getDefenseBaseValue } from "../app/game/defenseRules.ts";

test("fixed defense gains add toughness before applying the defense multiplier", () => {
  const options = { agility: 3, defenseMultiplier: 2 };

  assert.equal(calculateDefenseGain({ effect: "defend", value: 5 }, options), 16);
  assert.equal(calculateDefenseGain({ effect: "ironWall", value: 2 }, options), 16);
  assert.equal(calculateDefenseGain({ effect: "iceShield", value: 11 }, options), 28);
  assert.equal(calculateDefenseGain({ effect: "waterWave", value: 5 }, options), 16);
  assert.equal(getDefenseBaseValue({ effect: "ironWall", value: 2 }), 5);
});

test("fixed multi-purpose defense effects use the same calculation", () => {
  const options = { agility: 3, defenseMultiplier: 1 };

  assert.equal(calculateDefenseGain({ effect: "ironRampage", value: 8 }, options), 11);
  assert.equal(calculateDefenseGain({ effect: "starArk", value: 10 }, options), 13);
  assert.equal(calculateDefenseGain({ effect: "odinSpear", value: 40 }, options), 18);
  assert.equal(calculateDefenseGain({ effect: "ironWall", value: 2 }, { ...options, repetitions: 2 }), 16);
});

test("cards without ordinary defense values stay at zero without a base override", () => {
  const options = { agility: 3, defenseMultiplier: 2 };

  assert.equal(calculateDefenseGain({ effect: "suppression", value: 15 }, options), 0);
  assert.equal(calculateDefenseGain({ effect: "sturdyStance", value: 0 }, options), 0);
});

test("suppression uses the shared defense calculation with dealt damage as its base", () => {
  assert.equal(calculateDefenseGain(
    { effect: "suppression", value: 15 },
    { baseValue: 10, agility: 3, defenseMultiplier: 2 },
  ), 26);
  assert.equal(calculateDefenseGain(
    { effect: "suppression", value: 15 },
    { baseValue: 0, agility: 3, defenseMultiplier: 2 },
  ), 6);
});
