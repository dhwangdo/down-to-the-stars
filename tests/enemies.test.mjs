import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseNextIntent,
  createSewerEncounterByIndex,
  getEnemyCodexEntries,
  getEncounterIndicesForRegion,
  getEncounterRegionNumber,
  getEncounterSpawnPool,
  reduceEnemyDamageByResistance,
} from "../app/game/enemies.ts";

test("physical and magic resistance halve matching enemy damage", () => {
  assert.equal(reduceEnemyDamageByResistance(11, "physical", 1, 0), 5);
  assert.equal(reduceEnemyDamageByResistance(11, "magic", 0, 1), 5);
  assert.equal(reduceEnemyDamageByResistance(11, "physical", 0, 1), 11);
  assert.equal(reduceEnemyDamageByResistance(11, "magic", 1, 0), 11);
  assert.equal(reduceEnemyDamageByResistance(1, "physical", 1, 0), 0);
});

test("regions select only their assigned encounters", () => {
  assert.deepEqual(getEncounterIndicesForRegion(0), [0, 1, 3, 5, 7]);
  assert.deepEqual(getEncounterIndicesForRegion(1), [2, 4, 6, 8, 9]);
  assert.deepEqual(getEncounterIndicesForRegion(2), []);
});

test("debug enemy codex is derived from every encounter and its spawn regions", () => {
  const entries = getEnemyCodexEntries();
  assert.equal(entries.length, 10);
  assert.deepEqual(entries[0].regions, [1]);
  assert.deepEqual(entries.map((entry) => entry.regions[0]), [1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
  const golem = entries.find((entry) => entry.label === "골렘");
  assert.deepEqual(golem.regions, [2]);
  const rats = entries.find((entry) => entry.label === "쥐 3마리");
  assert.equal(rats.enemies[0].count, 3);
  assert.equal(rats.enemies[0].enemy.maxHp, 10);
});

test("each region has a three-percent chance to use the next region enemy pool", () => {
  assert.deepEqual(getEncounterSpawnPool(0, 0.029), [2, 4, 6, 8, 9]);
  assert.deepEqual(getEncounterSpawnPool(0, 0.03), [0, 1, 3, 5, 7]);
  assert.deepEqual(getEncounterSpawnPool(1, 0), [2, 4, 6, 8, 9]);
  assert.equal(getEncounterRegionNumber(2), 2);
  assert.equal(getEncounterRegionNumber(0), 1);
});

test("orange slime rolls 36 to 40 health and alternates its upgraded pattern", () => {
  const slime = createSewerEncounterByIndex(1, () => 0)[0];
  const actions = slime.actions;
  assert.equal(slime.hp, 36);
  assert.equal(slime.intentIndex, 0);
  assert.equal(actions.length, 2);
  assert.equal(actions[0].attacks[0].value, 9);
  assert.equal(actions[0].blockGain, undefined);
  assert.equal(actions[1].attacks[0].value, 6);
  assert.equal(actions[1].blockGain, 10);
  assert.equal(chooseNextIntent(actions, 0), 1);
  assert.equal(chooseNextIntent(actions, 1), 0);
});

test("golem waits twice, then alternates a wait and a 24-damage attack", () => {
  const golem = createSewerEncounterByIndex(2, () => 1)[0];
  assert.equal(golem.name, "골렘");
  assert.equal(golem.hp, 80);
  assert.equal(golem.intentIndex, 0);
  assert.deepEqual(golem.actions.map((action) => action.name), ["...", "...!", "공격", "...", "공격"]);
  assert.equal(golem.actions[2].attacks[0].value, 24);
  assert.equal(chooseNextIntent(golem.actions, 0), 1);
  assert.equal(chooseNextIntent(golem.actions, 1), 2);
  assert.equal(chooseNextIntent(golem.actions, 2), 3);
  assert.equal(chooseNextIntent(golem.actions, 3), 4);
  assert.equal(chooseNextIntent(golem.actions, 4), 3);
});

test("sewer rat alternates discard attacks and marks a target pile", () => {
  const rat = createSewerEncounterByIndex(3, () => 1)[0];
  assert.equal(rat.name, "하수구 쥐");
  assert.equal(rat.hp, 35);
  assert.equal(rat.actions[0].attacks[0].value, 11);
  assert.equal(rat.actions[0].discardCount, 1);
  assert.equal(rat.actions[1].blockGain, 10);
  assert.equal(rat.actions[1].discardCount, 1);
  assert.equal(rat.actions[2].attacks[0].value, 6);
  assert.equal(rat.actions[2].strengthGain, 3);
  assert.equal(rat.discardPileIndex, undefined);
});

test("goblin repeats 14, 8x2, and 7x3 physical attacks", () => {
  const goblin = createSewerEncounterByIndex(4, () => 1)[0];
  assert.equal(goblin.name, "도깨비");
  assert.equal(goblin.hp, 60);
  assert.equal(goblin.actions[0].attacks[0].value, 14);
  assert.equal(goblin.actions[0].attacks[0].hits, undefined);
  assert.equal(goblin.actions[1].attacks[0].value, 8);
  assert.equal(goblin.actions[1].attacks[0].hits, 2);
  assert.equal(goblin.actions[2].attacks[0].value, 7);
  assert.equal(goblin.actions[2].attacks[0].hits, 3);
  assert.equal(chooseNextIntent(goblin.actions, 2), 0);
});

test("small wizard always attacks with 8 magic damage", () => {
  const wizard = createSewerEncounterByIndex(0, () => 0)[0];
  assert.equal(wizard.hp, 27);
  assert.deepEqual(wizard.actions[0].attacks, [{ type: "magic", value: 8 }]);
});

test("three rats are 10-health enemies with fixed 5 damage", () => {
  const rats = createSewerEncounterByIndex(5, () => 0);
  assert.equal(rats.length, 3);
  assert.ok(rats.every((rat) => rat.hp === 9 && rat.actions[0].attacks[0].value === 5));
});

test("warlock applies delayed physical vulnerability, then attacks twice", () => {
  const warlock = createSewerEncounterByIndex(6, () => 0)[0];
  assert.equal(warlock.hp, 45);
  assert.equal(warlock.actions[0].nextTurnPhysicalVulnerabilityGain, 2);
  assert.equal(warlock.actions[0].nextTurnMagicVulnerabilityGain, undefined);
  assert.equal(warlock.actions[1].attacks[0].value, 12);
  assert.equal(warlock.actions[2].attacks[0].value, 12);
});

test("green slime randomly chooses either 8-damage pattern", () => {
  const slime = createSewerEncounterByIndex(7, () => 0)[0];
  assert.equal(slime.hp, 36);
  assert.equal(slime.givesToxicSlime, undefined);
  assert.equal(chooseNextIntent(slime.actions, 0, () => 0), 0);
  assert.equal(chooseNextIntent(slime.actions, 0, () => 0.99), 1);
});

test("mana beast encounter includes a fixed dual attack and delayed magic vulnerability wisp", () => {
  const encounter = createSewerEncounterByIndex(8, () => 1);
  assert.equal(encounter.length, 2);
  assert.equal(encounter[0].name, "마나 야수");
  assert.deepEqual(encounter[0].actions[0].attacks, [
    { type: "physical", value: 7 },
    { type: "magic", value: 5 },
  ]);
  assert.equal(encounter[1].name, "도깨비불");
  assert.equal(encounter[1].actions[0].nextTurnMagicVulnerabilityGain, 1);
});

test("second-region small wizard encounter contains two wizards", () => {
  const encounter = createSewerEncounterByIndex(9, () => 1);
  assert.equal(encounter.length, 2);
  assert.ok(encounter.every((enemy) => enemy.name === "작은 마법사" && enemy.hp === 30));
});

test("enemy health rolls from floor 90 percent through full base health", () => {
  assert.equal(createSewerEncounterByIndex(2, () => 0)[0].hp, 72);
  assert.equal(createSewerEncounterByIndex(2, () => 0.999)[0].hp, 80);
});
