import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPlayerTurnStart,
  applyPlayerAttack,
  chooseNextIntent,
  createSewerEncounterByIndex,
  getEnemyCodexEntries,
  getEncounterIndicesForRegion,
  getEncounterRegionNumber,
  getEncounterSpawnPool,
  playerAttackThornHits,
  reduceEnemyDamageByResistance,
  resolveEnemyHitAgainstPlayer,
  retainBlockAfterEnemyTurn,
} from "../app/game/enemies.ts";

test("physical and magic resistance halve matching enemy damage", () => {
  assert.equal(reduceEnemyDamageByResistance(11, "physical", 1, 0), 5);
  assert.equal(reduceEnemyDamageByResistance(11, "magic", 0, 1), 5);
  assert.equal(reduceEnemyDamageByResistance(11, "physical", 0, 1), 11);
  assert.equal(reduceEnemyDamageByResistance(11, "magic", 1, 0), 11);
  assert.equal(reduceEnemyDamageByResistance(1, "physical", 1, 0), 0);
});

test("vulnerability transforms each hit before matching block is consumed", () => {
  assert.deepEqual(resolveEnemyHitAgainstPlayer({
    damage: 10,
    damageType: "physical",
    block: 7,
  }), { transformedDamage: 10, blocked: 7, damageTaken: 3, remainingBlock: 0 });
  assert.deepEqual(resolveEnemyHitAgainstPlayer({
    damage: 10,
    damageType: "physical",
    block: 7,
    vulnerability: 1,
  }), { transformedDamage: 20, blocked: 7, damageTaken: 13, remainingBlock: 0 });
  assert.deepEqual(resolveEnemyHitAgainstPlayer({
    damage: 12,
    damageType: "physical",
    block: 7,
    vulnerability: 1,
  }), { transformedDamage: 24, blocked: 7, damageTaken: 17, remainingBlock: 0 });
});

test("vulnerability insurance uses 150 percent damage rounded down before block", () => {
  assert.deepEqual(resolveEnemyHitAgainstPlayer({
    damage: 11,
    damageType: "physical",
    block: 3,
    vulnerability: 1,
    vulnerabilityMultiplier: 1.5,
  }), { transformedDamage: 16, blocked: 3, damageTaken: 13, remainingBlock: 0 });
});

test("sturdy stance retains half of block remaining after the enemy turn", () => {
  const hit = resolveEnemyHitAgainstPlayer({ damage: 8, damageType: "physical", block: 11 });
  assert.equal(hit.damageTaken, 0);
  assert.equal(hit.remainingBlock, 3);
  assert.equal(retainBlockAfterEnemyTurn(hit.remainingBlock, true), 1);
  assert.equal(retainBlockAfterEnemyTurn(hit.remainingBlock, false), 0);
});

test("regions select only their assigned encounters", () => {
  assert.deepEqual(getEncounterIndicesForRegion(0), [0, 1, 3, 5, 7]);
  assert.deepEqual(getEncounterIndicesForRegion(1), [2, 4, 6, 8, 9]);
  assert.deepEqual(getEncounterIndicesForRegion(2), [10, 11, 12, 13]);
});

test("debug enemy codex is derived from every encounter and its spawn regions", () => {
  const entries = getEnemyCodexEntries();
  assert.equal(entries.length, 17);
  assert.deepEqual(entries[0].regions, [1]);
  assert.deepEqual(entries.map((entry) => entry.regions[0]), [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3]);
  const golem = entries.find((entry) => entry.label === "골렘");
  assert.deepEqual(golem.regions, [2]);
  const rats = entries.find((entry) => entry.label === "쥐 3마리");
  assert.equal(rats.enemies[0].count, 3);
  assert.equal(rats.enemies[0].enemy.maxHp, 10);
});

test("each region has a three-percent chance to use the next region enemy pool", () => {
  assert.deepEqual(getEncounterSpawnPool(0, 0.029), [2, 4, 6, 8, 9]);
  assert.deepEqual(getEncounterSpawnPool(0, 0.03), [0, 1, 3, 5, 7]);
  assert.deepEqual(getEncounterSpawnPool(1, 0), [10, 11, 12, 13]);
  assert.deepEqual(getEncounterSpawnPool(1, 0.03), [2, 4, 6, 8, 9]);
  assert.equal(getEncounterRegionNumber(2), 2);
  assert.equal(getEncounterRegionNumber(0), 1);
  assert.equal(getEncounterRegionNumber(10), 3);
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

test("golem deals 8 damage during its waits and 30 damage on attack turns", () => {
  const golem = createSewerEncounterByIndex(2, () => 1)[0];
  assert.equal(golem.name, "골렘");
  assert.equal(golem.hp, 90);
  assert.equal(golem.intentIndex, 0);
  assert.deepEqual(golem.actions.map((action) => action.name), ["...", "...!", "공격", "...", "공격"]);
  assert.deepEqual(golem.actions.slice(0, 2).map((action) => action.attacks[0].value), [8, 8]);
  assert.equal(golem.actions[2].attacks[0].value, 30);
  assert.equal(golem.actions[3].attacks[0].value, 8);
  assert.equal(golem.actions[4].attacks[0].value, 30);
  assert.equal(chooseNextIntent(golem.actions, 0), 1);
  assert.equal(chooseNextIntent(golem.actions, 1), 2);
  assert.equal(chooseNextIntent(golem.actions, 2), 3);
  assert.equal(chooseNextIntent(golem.actions, 3), 4);
  assert.equal(chooseNextIntent(golem.actions, 4), 3);
});

test("sewer rat uses the requested discard patterns", () => {
  const rat = createSewerEncounterByIndex(3, () => 1)[0];
  assert.equal(rat.name, "하수구 쥐");
  assert.equal(rat.hp, 40);
  assert.deepEqual(rat.actions[0].attacks, [{ type: "physical", value: 5, hits: 2 }]);
  assert.equal(rat.actions[0].discardCount, 1);
  assert.deepEqual(rat.actions[1].attacks, [{ type: "physical", value: 10 }]);
  assert.equal(rat.actions[1].discardCount, 1);
  assert.deepEqual(rat.actions[2].attacks, []);
  assert.equal(rat.actions[2].blockGain, 10);
  assert.equal(rat.actions[2].strengthGain, 3);
  assert.equal(rat.actions[2].discardCount, 1);
  assert.equal(rat.discardPileIndex, undefined);
});

test("goblin repeats 14, 8x2, and 7x3 physical attacks", () => {
  const goblin = createSewerEncounterByIndex(4, () => 1)[0];
  assert.equal(goblin.name, "도깨비");
  assert.equal(goblin.hp, 66);
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

test("three rats are 10-health enemies with fixed 6 damage", () => {
  const rats = createSewerEncounterByIndex(5, () => 0);
  assert.equal(rats.length, 3);
  assert.ok(rats.every((rat) => rat.hp === 9 && rat.actions[0].attacks[0].value === 6));
});

test("warlock attacks immediately while applying delayed physical vulnerability", () => {
  const warlock = createSewerEncounterByIndex(6, () => 0)[0];
  assert.equal(warlock.hp, 49);
  assert.deepEqual(warlock.actions[0].attacks[0], { type: "magic", value: 12 });
  assert.equal(warlock.actions[0].nextTurnPhysicalVulnerabilityGain, 2);
  assert.equal(warlock.actions[0].nextTurnMagicVulnerabilityGain, undefined);
  assert.equal(warlock.actions[1].attacks[0].value, 12);
  assert.equal(warlock.actions[2].attacks[0].value, 12);
});

test("green slime randomly chooses either 10-damage pattern", () => {
  const slime = createSewerEncounterByIndex(7, () => 0)[0];
  assert.equal(slime.hp, 36);
  assert.deepEqual(slime.actions.map((action) => action.attacks), [
    [{ type: "physical", value: 10 }],
    [{ type: "physical", value: 10 }],
  ]);
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
    { type: "magic", value: 7 },
  ]);
  assert.equal(encounter[1].name, "도깨비불");
  assert.equal(encounter[1].actions[0].nextTurnMagicVulnerabilityGain, 1);
});

test("second-region small wizard encounter contains two wizards", () => {
  const encounter = createSewerEncounterByIndex(9, () => 1);
  assert.equal(encounter.length, 2);
  assert.ok(encounter.every((enemy) => enemy.name === "작은 마법사" && enemy.hp === 30));
});

test("third-region mummy encounters have their starting statuses and patterns", () => {
  const priest = createSewerEncounterByIndex(10, () => 1)[0];
  assert.equal(priest.name, "미라 사제");
  assert.equal(priest.hp, 70);
  assert.equal(priest.boon, 5);
  assert.equal(priest.actions[0].boonGain, 2);
  assert.equal(priest.actions[0].nextTurnMagicVulnerabilityGain, 1);
  assert.deepEqual(priest.actions[1].attacks, [{ type: "magic", value: 16 }]);
  assert.deepEqual(priest.actions[2].attacks, [{ type: "physical", value: 20 }]);

  const warrior = createSewerEncounterByIndex(11, () => 1)[0];
  assert.equal(warrior.name, "미라 전사");
  assert.equal(warrior.hp, 100);
  assert.equal(warrior.berserk, 1);
  assert.deepEqual(warrior.actions[0].attacks, [{ type: "physical", value: 4, hits: 3 }]);
  assert.deepEqual(warrior.actions[1].attacks, [{ type: "physical", value: 16 }]);
  assert.deepEqual(warrior.actions[2].attacks, [{ type: "physical", value: 5, hits: 2 }]);
  assert.equal(warrior.actions[2].nextTurnPhysicalVulnerabilityGain, 1);
});

test("boon blocks one hit per stack and berserk grants strength at player turn start", () => {
  const priest = createSewerEncounterByIndex(10, () => 1)[0];
  const afterTwoHits = applyPlayerAttack(priest, 20, 2);
  assert.equal(afterTwoHits.hp, 70);
  assert.equal(afterTwoHits.boon, 3);
  const afterSixHits = applyPlayerAttack(priest, 20, 6);
  assert.equal(afterSixHits.hp, 50);
  assert.equal(afterSixHits.boon, 0);

  const warrior = createSewerEncounterByIndex(11, () => 1)[0];
  assert.equal(applyPlayerTurnStart(warrior).strength, 1);
});

test("third-region wyrm shows soil as its current intent", () => {
  const wyrm = createSewerEncounterByIndex(12, () => 1)[0];
  assert.equal(wyrm.name, "지룡");
  assert.equal(wyrm.hp, 95);
  assert.equal(wyrm.actions[0].soilCount, 1);
  assert.equal(wyrm.actions[0].nextTurnPhysicalVulnerabilityGain, 1);
  assert.deepEqual(wyrm.actions[1].attacks, [{ type: "physical", value: 15 }]);
  assert.deepEqual(wyrm.actions[2].attacks, [{ type: "magic", value: 20 }]);
});

test("boss encounters have fixed health and the requested repeating patterns", () => {
  const blackSlime = createSewerEncounterByIndex(14, () => 0)[0];
  assert.equal(blackSlime.name, "검은 슬라임");
  assert.equal(blackSlime.hp, 70);
  assert.equal(blackSlime.isBoss, true);
  assert.equal(blackSlime.toxicSlimeCount, 2);
  assert.deepEqual(blackSlime.actions.map((action) => action.attacks), [
    [{ type: "physical", value: 10 }],
    [],
  ]);
  assert.equal(blackSlime.actions[1].blockGain, 10);
  assert.equal(blackSlime.actions[1].strengthGain, 2);

  const clown = createSewerEncounterByIndex(15, () => 0)[0];
  assert.equal(clown.name, "광대");
  assert.equal(clown.hp, 110);
  assert.ok(clown.actions.every((action) => action.discardCount === 5));
  assert.deepEqual(clown.actions.map((action) => action.attacks), [
    [{ type: "physical", value: 20 }],
    [{ type: "magic", value: 20 }],
    [],
  ]);
  assert.equal(clown.actions[2].strengthGain, 3);

  const giantWyrm = createSewerEncounterByIndex(16, () => 0)[0];
  assert.equal(giantWyrm.name, "거대 지룡");
  assert.equal(giantWyrm.hp, 150);
  assert.equal(giantWyrm.actions[0].firstActionRockCount, 2);
  assert.equal(giantWyrm.actions[0].rockCount, 1);
  assert.equal(giantWyrm.actions[0].strengthGain, 4);
  assert.deepEqual(giantWyrm.actions[2].attacks, [{ type: "physical", value: 6, hits: 2 }]);
});

test("thorn beetles start with four thorns and choose non-repeating patterns", () => {
  const beetles = createSewerEncounterByIndex(13, () => 1);
  assert.equal(beetles.length, 2);
  assert.ok(beetles.every((beetle) => beetle.name === "가시 딱정벌레" && beetle.hp === 45 && beetle.thorns === 4));
  assert.equal(beetles[0].actions[0].randomNoRepeat, true);
  assert.equal(beetles[0].actions[2].strengthLoss, 2);
  assert.equal(beetles[0].actions[2].agilityLoss, 2);
  assert.equal(chooseNextIntent(beetles[0].actions, 0, () => 0), 1);
  assert.equal(chooseNextIntent(beetles[0].actions, 1, () => 0), 0);
  assert.deepEqual(playerAttackThornHits(beetles[0], 10, 3), [4, 4, 4]);
});

test("enemy health rolls from floor 90 percent through full base health", () => {
  assert.equal(createSewerEncounterByIndex(2, () => 0)[0].hp, 81);
  assert.equal(createSewerEncounterByIndex(2, () => 0.999)[0].hp, 90);
});
