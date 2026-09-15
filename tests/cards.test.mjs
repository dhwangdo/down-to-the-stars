import assert from "node:assert/strict";
import test from "node:test";

import {
  ALL_CARD_BLUEPRINTS,
  BASIC_CARD_POOL,
  LEGENDARY_CARD_POOL,
  RARE_CARD_POOL,
  SPECIAL_CARD_POOL,
  STARTER_CARD_POOL,
  createRadianceCard,
} from "../app/game/cards.ts";

test("card pools preserve the current content counts", () => {
  assert.equal(STARTER_CARD_POOL.length, 3);
  assert.equal(BASIC_CARD_POOL.length, 8);
  assert.equal(SPECIAL_CARD_POOL.length, 27);
  assert.equal(RARE_CARD_POOL.length, 13);
  assert.equal(LEGENDARY_CARD_POOL.length, 6);
  assert.equal(ALL_CARD_BLUEPRINTS.length, 58);
});

test("current card data keeps key balance values and removed systems absent", () => {
  assert.deepEqual(
    STARTER_CARD_POOL.map(({ name, cost, value }) => ({ name, cost, value })),
    [
      { name: "타격", cost: 1, value: 6 },
      { name: "방어", cost: 1, value: 5 },
      { name: "마법 방어", cost: 1, value: 5 },
    ],
  );
  assert.equal(SPECIAL_CARD_POOL.find((card) => card.name === "별의 방주")?.value, 10);
  assert.equal(SPECIAL_CARD_POOL.find((card) => card.name === "소거법")?.cost, 1);
  const quickStep = SPECIAL_CARD_POOL.find((card) => card.name === "퀵스텝");
  assert.deepEqual(
    quickStep && { cost: quickStep.cost, rarity: quickStep.rarity, draw: quickStep.draw },
    { cost: 1, rarity: "special", draw: 2 },
  );
  assert.equal(SPECIAL_CARD_POOL.some((card) => card.name === "흑요석 단검"), false);
  const obsidianDagger = RARE_CARD_POOL.find((card) => card.name === "흑요석 단검");
  assert.deepEqual(
    obsidianDagger && {
      effect: obsidianDagger.effect,
      rarity: obsidianDagger.rarity,
      cost: obsidianDagger.cost,
      value: obsidianDagger.value,
    },
    { effect: "obsidianDagger", rarity: "rare", cost: 0, value: 1 },
  );
  assert.equal(RARE_CARD_POOL.find((card) => card.name === "초신성")?.value, 3);
  const oldCore = SPECIAL_CARD_POOL.find((card) => card.name === "낡은 노심");
  assert.equal(oldCore?.cost, 0);
  assert.equal(oldCore?.exhaust, true);
  assert.deepEqual(
    SPECIAL_CARD_POOL.filter((card) => ["빛무리", "대형 프리즘"].includes(card.name)).map(({ name, cost, value }) => ({ name, cost, value })),
    [
      { name: "빛무리", cost: 1, value: 1 },
      { name: "대형 프리즘", cost: 3, value: 3 },
    ],
  );
  assert.deepEqual(
    RARE_CARD_POOL.filter((card) => ["경제학 연구", "광학 연구"].includes(card.name)).map(({ name, cost, rule }) => ({ name, cost, rule })),
    [
      { name: "경제학 연구", cost: 2, rule: true },
      { name: "광학 연구", cost: 1, rule: true },
    ],
  );
  const radiance = createRadianceCard(99);
  assert.deepEqual(
    { name: radiance.name, cost: radiance.cost, value: radiance.value, token: radiance.token },
    { name: "광채", cost: 0, value: 4, token: true },
  );
  assert.equal(RARE_CARD_POOL.find((card) => card.name === "오딘의 창")?.value, 40);
  assert.equal(ALL_CARD_BLUEPRINTS.some((card) => card.name === "발광"), false);
});
