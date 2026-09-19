export type GridPosition = { x: number; y: number };

export type MapEnemyAwareness = "sleeping" | "awake" | "alerted";

export type MapEnemy = {
  id: string;
  position: GridPosition;
  encounterIndex: number;
  awareness: MapEnemyAwareness;
  damageTaken?: number;
  isBoss?: boolean;
};

export type MapEnemyWorld = {
  enemies: MapEnemy[];
};

export type GridBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type MapEnemyCellMemory = Record<string, {
  encounterIndex: number;
  awareness: MapEnemyAwareness;
}>;

export const MAP_ENEMY_ACTIVE_RADIUS = 4;
export const MAP_ENEMY_DISTANCE_FIELD_RADIUS = 6;
export const MAP_PLAYER_VISION_HORIZONTAL_RADIUS = 2;
export const MAP_PLAYER_VISION_VERTICAL_RADIUS = 2;
export const MAP_ENEMY_SAFE_RADIUS = 2;
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

function manhattanDistance(left: GridPosition, right: GridPosition) {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
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

function isInsideBounds(position: GridPosition, bounds: GridBounds) {
  return position.x >= bounds.minX
    && position.x <= bounds.maxX
    && position.y >= bounds.minY
    && position.y <= bounds.maxY;
}

function defaultMovementBounds(enemies: MapEnemy[], playerPosition: GridPosition): GridBounds {
  const padding = MAP_ENEMY_ACTIVE_RADIUS * 4 + 4;
  const positions = [playerPosition, ...enemies.map((enemy) => enemy.position)];
  return {
    minX: Math.min(...positions.map((position) => position.x)) - padding,
    maxX: Math.max(...positions.map((position) => position.x)) + padding,
    minY: Math.min(...positions.map((position) => position.y)) - padding,
    maxY: Math.max(...positions.map((position) => position.y)) + padding,
  };
}

export function createEightDirectionDistanceField(
  target: GridPosition,
  isWalkable: (position: GridPosition) => boolean,
  bounds: GridBounds,
  blockedCellKeys: ReadonlySet<string> = new Set(),
) {
  const distances = new Map<string, number>([[positionKey(target), 0]]);
  const queue = [{ ...target }];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const nextDistance = distances.get(positionKey(current))! + 1;
    for (const direction of EIGHT_DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = positionKey(next);
      if (
        !isInsideBounds(next, bounds)
        || distances.has(nextKey)
        || blockedCellKeys.has(nextKey)
        || !isWalkable(next)
      ) continue;
      distances.set(nextKey, nextDistance);
      queue.push(next);
    }
  }
  return distances;
}

type MovementOption = {
  position: GridPosition;
  distanceReduction: number;
  moved: boolean;
  manhattanDistanceToPlayer: number;
};

type FlowEdge = {
  to: number;
  reverseIndex: number;
  capacity: number;
  cost: number;
  option?: MovementOption;
};

function addFlowEdge(
  graph: FlowEdge[][],
  from: number,
  to: number,
  cost: number,
  option?: MovementOption,
  capacity = 1,
) {
  const forward: FlowEdge = { to, reverseIndex: graph[to].length, capacity, cost, option };
  const reverse: FlowEdge = { to: from, reverseIndex: graph[from].length, capacity: 0, cost: -cost };
  graph[from].push(forward);
  graph[to].push(reverse);
}

function assignAlertedDestinations(
  enemies: MapEnemy[],
  optionsByEnemyId: ReadonlyMap<string, MovementOption[]>,
  shareableDestinationKeys: ReadonlySet<string> = new Set(),
) {
  if (enemies.length === 0) return new Map<string, GridPosition>();
  const destinationKeys = Array.from(new Set(enemies.flatMap((enemy) =>
    (optionsByEnemyId.get(enemy.id) ?? []).map((option) => positionKey(option.position)))));
  const destinationIndex = new Map(destinationKeys.map((key, index) => [key, index]));
  const source = 0;
  const enemyOffset = 1;
  const destinationOffset = enemyOffset + enemies.length;
  const sink = destinationOffset + destinationKeys.length;
  const graph: FlowEdge[][] = Array.from({ length: sink + 1 }, () => []);
  const allOptions = Array.from(optionsByEnemyId.values()).flat();
  const maximumReduction = Math.max(1, ...allOptions
    .map((option) => option.distanceReduction));
  const maximumManhattanDistance = Math.max(0, ...allOptions
    .map((option) => option.manhattanDistanceToPlayer));
  const distanceReductionPriority = enemies.length * maximumManhattanDistance + 1;
  const movementPriority = enemies.length * (
    maximumReduction * distanceReductionPriority + maximumManhattanDistance
  ) + 1;

  enemies.forEach((enemy, enemyIndex) => {
    const enemyNode = enemyOffset + enemyIndex;
    addFlowEdge(graph, source, enemyNode, 0);
    for (const option of optionsByEnemyId.get(enemy.id) ?? []) {
      const destinationNode = destinationOffset + destinationIndex.get(positionKey(option.position))!;
      const manhattanBonus = maximumManhattanDistance - option.manhattanDistanceToPlayer;
      const score = (option.moved ? movementPriority : 0)
        + option.distanceReduction * distanceReductionPriority
        + manhattanBonus;
      addFlowEdge(graph, enemyNode, destinationNode, -score, option);
    }
  });
  destinationKeys.forEach((destinationKey, index) => addFlowEdge(
    graph,
    destinationOffset + index,
    sink,
    0,
    undefined,
    shareableDestinationKeys.has(destinationKey) ? enemies.length : 1,
  ));

  for (let flow = 0; flow < enemies.length; flow += 1) {
    const distance = Array(graph.length).fill(Number.POSITIVE_INFINITY);
    const previousNode = Array(graph.length).fill(-1);
    const previousEdge = Array(graph.length).fill(-1);
    distance[source] = 0;
    for (let pass = 0; pass < graph.length - 1; pass += 1) {
      let changed = false;
      for (let node = 0; node < graph.length; node += 1) {
        if (!Number.isFinite(distance[node])) continue;
        graph[node].forEach((edge, edgeIndex) => {
          if (edge.capacity <= 0 || distance[node] + edge.cost >= distance[edge.to]) return;
          distance[edge.to] = distance[node] + edge.cost;
          previousNode[edge.to] = node;
          previousEdge[edge.to] = edgeIndex;
          changed = true;
        });
      }
      if (!changed) break;
    }
    if (!Number.isFinite(distance[sink])) break;
    for (let node = sink; node !== source; node = previousNode[node]) {
      const edge = graph[previousNode[node]][previousEdge[node]];
      edge.capacity -= 1;
      graph[node][edge.reverseIndex].capacity += 1;
    }
  }

  const assignments = new Map<string, GridPosition>();
  enemies.forEach((enemy, enemyIndex) => {
    const selected = graph[enemyOffset + enemyIndex]
      .find((edge) => edge.option && edge.capacity === 0)?.option;
    assignments.set(enemy.id, { ...(selected?.position ?? enemy.position) });
  });
  return assignments;
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

export function clearMapEnemiesNear(
  world: MapEnemyWorld,
  center: GridPosition,
  radius = MAP_ENEMY_SAFE_RADIUS,
) {
  return {
    ...world,
    enemies: world.enemies.filter((enemy) => chebyshevDistance(enemy.position, center) > radius),
  };
}

function awarenessAfterDetection(
  awareness: MapEnemyAwareness,
  distance: number,
  random: () => number,
  detectionMultiplier: number,
  detectionDistanceReduction: number,
) {
  if (awareness === "alerted" && distance >= 4) return "awake";
  if (awareness === "awake" && distance >= 3 && random() < 0.03) return "sleeping";
  const detectionChance = distance === 1
    ? 0.5
    : distance === 2 && detectionDistanceReduction < 1
      ? 0.1
      : 0;
  if (detectionChance === 0 || random() / detectionMultiplier >= detectionChance) return awareness;
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
  movementBounds: GridBounds = defaultMovementBounds(enemies, playerPosition),
  detectionDistanceReduction = 0,
) {
  const nextEnemies = enemies.map((enemy) => ({
    ...enemy,
    position: { ...enemy.position },
  }));
  const playerKey = positionKey(playerPosition);

  const awarenessDistanceField = createEightDirectionDistanceField(
    playerPosition,
    isWalkable,
    movementBounds,
  );
  const alertedMovers: MapEnemy[] = [];
  const awakeMovers: MapEnemy[] = [];
  for (const enemy of nextEnemies) {
    if (
      enemy.isBoss
      || frozenEnemyIds.has(enemy.id)
      || chebyshevDistance(enemy.position, activeCenter) > MAP_ENEMY_ACTIVE_RADIUS
    ) continue;

    const distanceAtStart = awarenessDistanceField.get(positionKey(enemy.position));
    const nextAwareness = distanceAtStart === undefined
      ? enemy.awareness
      : awarenessAfterDetection(
        enemy.awareness,
        distanceAtStart,
        random,
        detectionMultiplier,
        detectionDistanceReduction,
      );
    if (nextAwareness !== enemy.awareness) {
      enemy.awareness = nextAwareness;
      continue;
    }
    if (enemy.awareness === "sleeping") continue;

    const shouldMove = enemy.awareness === "awake"
      ? random() >= 0.5
      : random() < 0.95;
    if (!shouldMove) continue;
    if (enemy.awareness === "alerted") alertedMovers.push(enemy);
    else awakeMovers.push(enemy);
  }

  const alertedMoverIds = new Set(alertedMovers.map((enemy) => enemy.id));
  const blockedCellKeys = new Set(nextEnemies
    .filter((enemy) => !alertedMoverIds.has(enemy.id))
    .map((enemy) => positionKey(enemy.position)));
  blockedCellKeys.delete(playerKey);
  const distanceField = createEightDirectionDistanceField(
    playerPosition,
    isWalkable,
    movementBounds,
    blockedCellKeys,
  );
  const alertedOptions = new Map<string, MovementOption[]>();
  for (const enemy of alertedMovers) {
    const startDistance = distanceField.get(positionKey(enemy.position));
    const options: MovementOption[] = [{
      position: { ...enemy.position },
      distanceReduction: 0,
      moved: false,
      manhattanDistanceToPlayer: manhattanDistance(enemy.position, playerPosition),
    }];
    if (startDistance !== undefined) {
      for (const direction of EIGHT_DIRECTIONS) {
        const candidate = {
          x: enemy.position.x + direction.x,
          y: enemy.position.y + direction.y,
        };
        const candidateKey = positionKey(candidate);
        const candidateDistance = distanceField.get(candidateKey);
        if (
          candidateDistance === undefined
          || candidateDistance >= startDistance
          || blockedCellKeys.has(candidateKey)
          || !isWalkable(candidate)
        ) continue;
        options.push({
          position: candidate,
          distanceReduction: startDistance - candidateDistance,
          moved: true,
          manhattanDistanceToPlayer: manhattanDistance(candidate, playerPosition),
        });
      }
    }
    alertedOptions.set(enemy.id, options);
  }

  const alertedAssignments = assignAlertedDestinations(
    alertedMovers,
    alertedOptions,
    new Set([playerKey]),
  );

  const plannedPositions = new Map(nextEnemies.map((enemy) => [enemy.id, { ...enemy.position }]));
  alertedAssignments.forEach((position, enemyId) => plannedPositions.set(enemyId, { ...position }));
  const occupiedCellKeys = new Set(nextEnemies.map((enemy) =>
    positionKey(plannedPositions.get(enemy.id) ?? enemy.position)));
  occupiedCellKeys.delete(playerKey);

  for (const enemy of awakeMovers) {
    const origin = plannedPositions.get(enemy.id) ?? enemy.position;
    occupiedCellKeys.delete(positionKey(origin));
    const candidates = EIGHT_DIRECTIONS
      .map((direction) => ({ x: origin.x + direction.x, y: origin.y + direction.y }))
      .filter((position) => isWalkable(position) && !occupiedCellKeys.has(positionKey(position)));
    const destination = candidates.length > 0
      ? candidates[randomIndex(candidates.length, random)]
      : origin;
    plannedPositions.set(enemy.id, { ...destination });
    if (positionKey(destination) !== playerKey) occupiedCellKeys.add(positionKey(destination));
  }

  for (const enemy of nextEnemies) {
    enemy.position = plannedPositions.get(enemy.id) ?? enemy.position;
  }
  return {
    enemies: nextEnemies,
    collisionEnemyIds: nextEnemies
      .filter((enemy) => positionKey(enemy.position) === playerKey)
      .map((enemy) => enemy.id),
  };
}

export function awarenessSymbol(awareness: MapEnemyAwareness) {
  if (awareness === "sleeping") return "Zzz";
  if (awareness === "awake") return "?";
  return "!";
}
