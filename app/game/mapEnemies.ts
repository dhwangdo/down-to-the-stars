export type GridPosition = { x: number; y: number };

export type MapEnemyAwareness = "sleeping" | "awake" | "alerted";

export type MapEnemy = {
  id: string;
  position: GridPosition;
  encounterIndex: number;
  awareness: MapEnemyAwareness;
  damageTaken?: number;
};

export type MapEnemyWorld = {
  enemies: MapEnemy[];
};

export type MapEnemyCellMemory = Record<string, {
  encounterIndex: number;
  awareness: MapEnemyAwareness;
}>;

export const MAP_ENEMY_ACTIVE_RADIUS = 4;
export const MAP_PLAYER_VISION_HORIZONTAL_RADIUS = 2;
export const MAP_PLAYER_VISION_VERTICAL_RADIUS = 2;
export const MAP_ENEMY_SPAWN_CHANCE = 0.08;

export const EIGHT_DIRECTIONS: GridPosition[] = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

export function positionKey(position: GridPosition) {
  return `${position.x}:${position.y}`;
}

export function chebyshevDistance(left: GridPosition, right: GridPosition) {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

export function isInPlayerVision(
  position: GridPosition,
  playerPosition: GridPosition,
  horizontalRadius = MAP_PLAYER_VISION_HORIZONTAL_RADIUS,
  verticalRadius = MAP_PLAYER_VISION_VERTICAL_RADIUS,
) {
  const offsetX = Math.abs(position.x - playerPosition.x);
  const offsetY = Math.abs(position.y - playerPosition.y);
  return offsetX <= horizontalRadius && offsetY <= verticalRadius;
}

export function updateEnemyCellMemory(
  memory: MapEnemyCellMemory,
  enemies: MapEnemy[],
  visibleCellKeys: ReadonlySet<string>,
  previousEnemies: MapEnemy[] = [],
) {
  const next = { ...memory };
  const previousEnemyById = new Map(previousEnemies.map((enemy) => [enemy.id, enemy]));
  for (const enemy of enemies) {
    const currentCellKey = positionKey(enemy.position);
    if (!visibleCellKeys.has(currentCellKey)) continue;
    const previousEnemy = previousEnemyById.get(enemy.id);
    if (!previousEnemy) continue;
    const previousCellKey = positionKey(previousEnemy.position);
    if (previousCellKey !== currentCellKey && !visibleCellKeys.has(previousCellKey)) {
      delete next[previousCellKey];
    }
  }
  const enemyByCell = new Map(enemies.map((enemy) => [positionKey(enemy.position), enemy]));
  for (const cellKey of visibleCellKeys) {
    const enemy = enemyByCell.get(cellKey);
    if (enemy) {
      next[cellKey] = {
        encounterIndex: enemy.encounterIndex,
        awareness: enemy.awareness,
      };
    } else {
      delete next[cellKey];
    }
  }
  return next;
}

function seededCellRoll(position: GridPosition, seed: number, salt: number) {
  let hash = Math.imul(position.x + 17 + salt, 374761393)
    ^ Math.imul(position.y + 29, 668265263)
    ^ Math.imul(seed + 11, 1442695041);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function randomIndex(length: number, random: () => number) {
  return Math.min(length - 1, Math.floor(random() * length));
}

export function createMapEnemyWorld(
  spawnCells: GridPosition[],
  seed: number,
  encounterCount: number,
  spawnChance = MAP_ENEMY_SPAWN_CHANCE,
): MapEnemyWorld {
  const enemies = spawnCells
    .filter((position) => seededCellRoll(position, seed, 3001) < spawnChance)
    .map((position) => ({
      id: `map-enemy-${positionKey(position)}`,
      position: { ...position },
      encounterIndex: Math.min(
        encounterCount - 1,
        Math.floor(seededCellRoll(position, seed, 4001) * encounterCount),
      ),
      awareness: "sleeping" as const,
    }));
  return { enemies };
}

function awarenessAfterDetection(
  awareness: MapEnemyAwareness,
  distance: number,
  random: () => number,
) {
  if (awareness === "alerted" && distance >= 4) return "awake";
  const detectionChance = distance === 1 ? 0.5 : distance === 2 ? 0.1 : 0;
  if (detectionChance === 0 || random() >= detectionChance) return awareness;
  if (awareness === "sleeping") return "awake";
  if (awareness === "awake") return "alerted";
  return awareness;
}

export function advanceMapEnemies(
  enemies: MapEnemy[],
  activeCenter: GridPosition,
  playerPosition: GridPosition,
  isWalkable: (position: GridPosition) => boolean,
  random: () => number = Math.random,
  frozenEnemyIds: ReadonlySet<string> = new Set(),
  detectionMultiplier = 1,
) {
  const nextEnemies = enemies.map((enemy) => ({
    ...enemy,
    position: { ...enemy.position },
  }));
  const occupied = new Map(
    nextEnemies.map((enemy) => [positionKey(enemy.position), enemy.id]),
  );
  const collisionEnemyIds: string[] = [];

  for (const enemy of nextEnemies) {
    if (frozenEnemyIds.has(enemy.id)) {
      if (positionKey(enemy.position) === positionKey(playerPosition)) {
        collisionEnemyIds.push(enemy.id);
      }
      continue;
    }
    if (chebyshevDistance(enemy.position, activeCenter) > MAP_ENEMY_ACTIVE_RADIUS) continue;

    const distanceAtStart = chebyshevDistance(enemy.position, playerPosition);
    const nextAwareness = awarenessAfterDetection(
      enemy.awareness,
      distanceAtStart,
      () => random() / detectionMultiplier,
    );
    if (nextAwareness !== enemy.awareness) {
      enemy.awareness = nextAwareness;
      continue;
    }
    if (enemy.awareness === "sleeping") continue;

    const shouldMove = enemy.awareness === "awake"
      ? random() >= 0.5
      : random() < 0.9;
    if (!shouldMove) continue;

    occupied.delete(positionKey(enemy.position));
    let candidates = EIGHT_DIRECTIONS
      .map((direction) => ({
        x: enemy.position.x + direction.x,
        y: enemy.position.y + direction.y,
      }))
      .filter((position) => isWalkable(position) && !occupied.has(positionKey(position)));

    if (enemy.awareness === "alerted") {
      candidates = candidates.filter((position) =>
        chebyshevDistance(position, playerPosition) < distanceAtStart);
    }

    if (candidates.length > 0) {
      enemy.position = candidates[randomIndex(candidates.length, random)];
    }
    occupied.set(positionKey(enemy.position), enemy.id);

    if (positionKey(enemy.position) === positionKey(playerPosition)) {
      collisionEnemyIds.push(enemy.id);
    }
  }

  return { enemies: nextEnemies, collisionEnemyIds };
}

export function awarenessSymbol(awareness: MapEnemyAwareness) {
  if (awareness === "sleeping") return "Zzz";
  if (awareness === "awake") return "?";
  return "!";
}
