import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceMapEnemies,
  chebyshevDistance,
  createMapEnemyWorld,
  isInPlayerVision,
  MAP_ENEMY_SPAWN_CHANCE,
  updateEnemyCellMemory,
} from "../app/game/mapEnemies.ts";

const alwaysWalkable = () => true;

function randomValues(...values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

test("Chebyshev distance uses the larger axis difference", () => {
  assert.equal(chebyshevDistance({ x: 0, y: 0 }, { x: 3, y: -2 }), 3);
});

test("player vision has a 5 by 5 square with 25 cells", () => {
  const center = { x: 0, y: 0 };
  const visible = Array.from({ length: 5 }, (_, y) => y - 2).flatMap((y) =>
    Array.from({ length: 5 }, (_, x) => x - 2).filter((x) =>
      isInPlayerVision({ x, y }, center)));
  assert.equal(visible.length, 25);
  assert.equal(isInPlayerVision({ x: 0, y: 3 }, center), false);
  assert.equal(isInPlayerVision({ x: 1, y: 1 }, center), true);
  assert.equal(isInPlayerVision({ x: 2, y: 1 }, center), true);
});

test("enemy memory follows observed cells instead of enemy identities", () => {
  const enemy = {
    id: "wanderer",
    position: { x: 0, y: 0 },
    encounterIndex: 2,
    awareness: "awake",
  };
  const firstMemory = updateEnemyCellMemory({}, [enemy], new Set(["0:0"]));
  const movedMemory = updateEnemyCellMemory(
    firstMemory,
    [{ ...enemy, position: { x: 1, y: 0 } }],
    new Set(["2:0"]),
    [enemy],
  );

  assert.deepEqual(movedMemory["0:0"], { encounterIndex: 2, awareness: "awake" });

  const revisitedMemory = updateEnemyCellMemory(movedMemory, [], new Set(["0:0"]));
  assert.equal(revisitedMemory["0:0"], undefined);
});

test("an enemy entering vision removes the echo from the cell it just left", () => {
  const enemy = {
    id: "returning-wanderer",
    position: { x: 0, y: 0 },
    encounterIndex: 3,
    awareness: "alerted",
  };
  const firstMemory = updateEnemyCellMemory({}, [enemy], new Set(["0:0"]));
  const enteredVision = updateEnemyCellMemory(
    firstMemory,
    [{ ...enemy, position: { x: 1, y: 0 } }],
    new Set(["1:0"]),
    [enemy],
  );

  assert.equal(enteredVision["0:0"], undefined);
  assert.deepEqual(enteredVision["1:0"], { encounterIndex: 3, awareness: "alerted" });
});

test("pre-generation can reserve the start cell and its eight neighbors from spawning", () => {
  const spawnCells = Array.from({ length: 9 }, (_, y) => y - 4).flatMap((y) =>
    Array.from({ length: 9 }, (_, x) => x - 4)
      .map((x) => ({ x, y }))
      .filter((position) => chebyshevDistance(position, { x: 0, y: 0 }) > 1));
  const world = createMapEnemyWorld(
    spawnCells,
    1,
    5,
    1,
  );
  assert.equal(MAP_ENEMY_SPAWN_CHANCE, 0.08);
  assert.equal(world.enemies.length, 72);
  assert.ok(world.enemies.every((enemy) => enemy.awareness === "sleeping"));
  assert.ok(world.enemies.every((enemy) =>
    chebyshevDistance(enemy.position, { x: 0, y: 0 }) > 1));
});

test("waking up consumes a sleeping enemy's move", () => {
  const enemy = {
    id: "sleeper",
    position: { x: 0, y: 0 },
    encounterIndex: 0,
    awareness: "sleeping",
  };
  const result = advanceMapEnemies(
    [enemy],
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    alwaysWalkable,
    () => 0,
  );
  assert.equal(result.enemies[0].awareness, "awake");
  assert.deepEqual(result.enemies[0].position, { x: 0, y: 0 });
});

test("an alerted enemy moves diagonally when that lowers L infinity distance", () => {
  const enemy = {
    id: "hunter",
    position: { x: 0, y: 0 },
    encounterIndex: 0,
    awareness: "alerted",
  };
  const result = advanceMapEnemies(
    [enemy],
    { x: 0, y: 0 },
    { x: 2, y: 2 },
    alwaysWalkable,
    randomValues(0, 0),
  );
  assert.deepEqual(result.enemies[0].position, { x: 1, y: 1 });
  assert.equal(chebyshevDistance(result.enemies[0].position, { x: 2, y: 2 }), 1);
});

test("an alerted enemy has a 90 percent chance to move closer", () => {
  const enemy = {
    id: "hunter",
    position: { x: 0, y: 0 },
    encounterIndex: 0,
    awareness: "alerted",
  };
  const moving = advanceMapEnemies(
    [enemy],
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    alwaysWalkable,
    randomValues(0.9, 0.89, 0),
  );
  const resting = advanceMapEnemies(
    [enemy],
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    alwaysWalkable,
    randomValues(0.9, 0.9),
  );
  assert.equal(chebyshevDistance(moving.enemies[0].position, { x: 2, y: 0 }), 1);
  assert.deepEqual(resting.enemies[0].position, { x: 0, y: 0 });
});

test("an alerted enemy at distance four becomes awake and does not move", () => {
  const enemy = {
    id: "lost-hunter",
    position: { x: 0, y: 0 },
    encounterIndex: 0,
    awareness: "alerted",
  };
  const result = advanceMapEnemies(
    [enemy],
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    alwaysWalkable,
    () => 0,
  );
  assert.equal(result.enemies[0].awareness, "awake");
  assert.deepEqual(result.enemies[0].position, { x: 0, y: 0 });
});

test("an enemy moving onto the player reports a collision", () => {
  const enemy = {
    id: "hunter",
    position: { x: 0, y: 0 },
    encounterIndex: 0,
    awareness: "alerted",
  };
  const result = advanceMapEnemies(
    [enemy],
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    alwaysWalkable,
    randomValues(0, 0),
  );
  assert.deepEqual(result.collisionEnemyIds, ["hunter"]);
});

test("an enemy already collided with by the player stays in place for this enemy phase", () => {
  const enemy = {
    id: "occupied-room",
    position: { x: 1, y: 1 },
    encounterIndex: 0,
    awareness: "awake",
  };
  const result = advanceMapEnemies(
    [enemy],
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    alwaysWalkable,
    () => 0,
    new Set(["occupied-room"]),
  );
  assert.deepEqual(result.enemies[0].position, { x: 1, y: 1 });
  assert.deepEqual(result.collisionEnemyIds, ["occupied-room"]);
});

test("multiple enemies can move onto the player in the same turn", () => {
  const enemies = [
    { id: "first", position: { x: 0, y: 0 }, encounterIndex: 0, awareness: "alerted" },
    { id: "second", position: { x: 0, y: 2 }, encounterIndex: 1, awareness: "alerted" },
  ];
  const result = advanceMapEnemies(
    enemies,
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    alwaysWalkable,
    randomValues(0.9, 0, 0, 0.9, 0, 0),
  );
  assert.deepEqual(result.collisionEnemyIds, ["first", "second"]);
  assert.deepEqual(result.enemies.map((enemy) => enemy.position), [{ x: 1, y: 1 }, { x: 1, y: 1 }]);
});
