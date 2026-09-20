import { BASIC_CARD_POOL, RARE_CARD_POOL, SPECIAL_CARD_POOL, type Card } from "./cards";
import {
  SEWER_ENCOUNTER_COUNT,
  getBossEncounterIndex,
  getEncounterRegionNumber,
  getEncounterSpawnPool,
} from "./enemies";
import {
  EIGHT_DIRECTIONS,
  MAP_ENEMY_SAFE_RADIUS,
  MAP_PLAYER_VISION_HORIZONTAL_RADIUS,
  MAP_PLAYER_VISION_VERTICAL_RADIUS,
  chebyshevDistance,
  createMapEnemyWorld,
  type MapEnemyWorld,
} from "./mapEnemies";
import { consumableTypeFromRoll, createConsumable, type Consumable } from "./rewards";

export type MapPosition = { x: number; y: number };
export type RoomType =
  | "void"
  | "rock"
  | "empty"
  | "blessing"
  | "shop"
  | "shrine"
  | "recoveryShrine"
  | "vitalityShrine"
  | "mindEyeShrine"
  | "transformShrine"
  | "combinationShrine"
  | "treasureChest"
  | "boss"
  | "portal"
  | "heal"
  | "safePortal";

export const REGION_COUNT = 7;
export const ROCK_BARRIER_HEIGHT = 5;
export const SPECIAL_NODE_CHANCE = 0.006;
const SPECIAL_NODE_WEIGHTS: ReadonlyArray<{ type: RoomType; weight: number }> = [
  { type: "shop", weight: 0.5 },
  { type: "shrine", weight: 2 },
  { type: "vitalityShrine", weight: 0.5 },
  { type: "mindEyeShrine", weight: 1 },
  { type: "transformShrine", weight: 1 },
  { type: "combinationShrine", weight: 1 },
  { type: "treasureChest", weight: 0.5 },
  { type: "blessing", weight: 0.01 },
];
const SPECIAL_NODE_WEIGHT_TOTAL = SPECIAL_NODE_WEIGHTS.reduce(
  (total, entry) => total + entry.weight,
  0,
);
export const SHOP_NODE_CHANCE = SPECIAL_NODE_CHANCE * 0.5 / SPECIAL_NODE_WEIGHT_TOTAL;
export const SHRINE_NODE_CHANCE = SPECIAL_NODE_CHANCE * 2 / SPECIAL_NODE_WEIGHT_TOTAL;
export const VITALITY_SHRINE_NODE_CHANCE = SPECIAL_NODE_CHANCE * 0.5 / SPECIAL_NODE_WEIGHT_TOTAL;
export const MIND_EYE_SHRINE_NODE_CHANCE = SPECIAL_NODE_CHANCE * 1 / SPECIAL_NODE_WEIGHT_TOTAL;
export const TRANSFORM_SHRINE_NODE_CHANCE = SPECIAL_NODE_CHANCE * 1 / SPECIAL_NODE_WEIGHT_TOTAL;
export const COMBINATION_SHRINE_NODE_CHANCE = SPECIAL_NODE_CHANCE * 1 / SPECIAL_NODE_WEIGHT_TOTAL;
export const TREASURE_CHEST_NODE_CHANCE = SPECIAL_NODE_CHANCE * 0.5 / SPECIAL_NODE_WEIGHT_TOTAL;
export const BLESSING_NODE_CHANCE = SPECIAL_NODE_CHANCE * 0.01 / SPECIAL_NODE_WEIGHT_TOTAL;
export const PORTAL_NODE_CHANCE = 0.05;
export const ROCK_CLUSTER_CHANCE = 0.03;
export const ROCK_CLUSTER_EDGE_CHANCE = 0.05;
export const FLOOR_CARD_DROP_CHANCE = 0.005;
export const FLOOR_CARD_ITEM_CHANCE = 0.8;
export const FLOOR_CARD_RARITY_CHANCES = {
  rare: 0.05,
  basic: 0.3,
  special: 0.65,
} as const;
export const DUNGEON_MIN_X = -160;
export const DUNGEON_MAX_X = 160;
export const BOSS_REGION_COUNT = 3;
const SAFE_AREA_HEAL_OFFSET_X = 0;
const SAFE_AREA_PORTAL_OFFSET_X = 1;
const SAFE_AREA_LEFT_CROSS_CENTER_OFFSET_X = -4;
const SAFE_AREA_CONNECTOR_OFFSET_X = -2;
export const SAFE_AREA_LAYOUT_MIN_OFFSET_X = -6;
export const SAFE_AREA_LAYOUT_MAX_OFFSET_X = 2;
const SAFE_AREA_SPAWN_OFFSET_X = SAFE_AREA_LAYOUT_MIN_OFFSET_X + 1;
export const MAP_COLUMNS = DUNGEON_MAX_X - DUNGEON_MIN_X + 1;
export const REGION_HEIGHT = 15;
export const MAP_ROWS = REGION_COUNT * REGION_HEIGHT + (REGION_COUNT - 1) * ROCK_BARRIER_HEIGHT;
export const MAP_START: MapPosition = { x: 0, y: 0 };

export function mapRoomKey(position: MapPosition) {
  return `${position.x}:${position.y}`;
}

export function parseMapRoomKey(roomKey: string): MapPosition {
  const [x, y] = roomKey.split(":").map(Number);
  return { x, y };
}

export function seededRoll(position: MapPosition, seed: number, salt = 0) {
  let hash = Math.imul(position.x + 17 + salt, 374761393)
    ^ Math.imul(position.y + 29, 668265263)
    ^ Math.imul(seed + 11, 1442695041);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

export function regionStartY(regionIndex: number) {
  return regionIndex * (REGION_HEIGHT + ROCK_BARRIER_HEIGHT);
}

export function regionHeight(_regionIndex: number) {
  void _regionIndex;
  return REGION_HEIGHT;
}

export function getDungeonRegionIndex(position: MapPosition) {
  if (
    position.x < DUNGEON_MIN_X
    || position.x > DUNGEON_MAX_X
    || position.y < 0
  ) return null;
  for (let regionIndex = 0; regionIndex < REGION_COUNT; regionIndex += 1) {
    const startY = regionStartY(regionIndex);
    if (position.y >= startY && position.y < startY + regionHeight(regionIndex)) return regionIndex;
  }
  return null;
}

export function safeAreaCenterX(regionIndex: number, seed: number) {
  const leftSide = seededRoll({ x: regionIndex, y: 0 }, seed, 8201) < 0.5;
  const minX = leftSide ? DUNGEON_MIN_X - SAFE_AREA_LAYOUT_MIN_OFFSET_X : 57;
  const maxX = leftSide ? -53 : DUNGEON_MAX_X - SAFE_AREA_LAYOUT_MAX_OFFSET_X;
  return minX + Math.floor(seededRoll({ x: regionIndex, y: 0 }, seed, 8202) * (maxX - minX + 1));
}

export function safeAreaCenterY(regionIndex: number, seed: number) {
  const baseY = regionStartY(regionIndex) + Math.floor(regionHeight(regionIndex) / 2);
  const offsetY = Math.floor(seededRoll({ x: regionIndex, y: 0 }, seed, 8203) * 5) - 2;
  return baseY + offsetY;
}

export function getSafeAreaRegionIndex(position: MapPosition, seed: number) {
  for (let regionIndex = 0; regionIndex < REGION_COUNT; regionIndex += 1) {
    const centerX = safeAreaCenterX(regionIndex, seed);
    const centerY = safeAreaCenterY(regionIndex, seed);
    const isCenterRow = position.y === centerY
      && position.x >= centerX + SAFE_AREA_LAYOUT_MIN_OFFSET_X + 1
      && position.x <= centerX + SAFE_AREA_PORTAL_OFFSET_X;
    const isVerticalArm = (
      position.x === centerX + SAFE_AREA_LEFT_CROSS_CENTER_OFFSET_X
      || position.x === centerX + SAFE_AREA_HEAL_OFFSET_X
    ) && Math.abs(position.y - centerY) === 1;
    if (isCenterRow || isVerticalArm) return regionIndex;
  }
  return null;
}

export function isSafeAreaPosition(position: MapPosition, seed: number) {
  return getSafeAreaRegionIndex(position, seed) !== null;
}

export function isSafeAreaEditAllowed(
  position: MapPosition,
  seed: number,
  defeatedBossRegions: ReadonlySet<number>,
) {
  const regionIndex = getSafeAreaRegionIndex(position, seed);
  return regionIndex === null
    || regionIndex >= BOSS_REGION_COUNT
    || defeatedBossRegions.has(regionIndex);
}

export function isSafeAreaBoundaryPosition(position: MapPosition, regionIndex: number, seed: number) {
  return isSafeAreaBoundaryGeometryPosition(position, regionIndex, seed)
    && getRoomType(position, seed) === "rock";
}

export function isSafeAreaBoundaryGeometryPosition(position: MapPosition, regionIndex: number, seed: number) {
  if (
    getSafeAreaLayoutRegionIndex(position, seed) !== regionIndex
    || getSafeAreaRegionIndex(position, seed) === regionIndex
  ) return false;
  const offsetX = position.x - safeAreaCenterX(regionIndex, seed);
  const offsetY = position.y - safeAreaCenterY(regionIndex, seed);
  const isOuterCorner = (
    (offsetX === SAFE_AREA_LAYOUT_MIN_OFFSET_X || offsetX === SAFE_AREA_LAYOUT_MAX_OFFSET_X)
    && Math.abs(offsetY) === 2
  );
  const isUnusedCentralWall = offsetX === SAFE_AREA_CONNECTOR_OFFSET_X && Math.abs(offsetY) === 2;
  return !isOuterCorner && !isUnusedCentralWall;
}

function isAdjacentToSafeAreaBoundary(position: MapPosition, seed: number) {
  return EIGHT_DIRECTIONS.some((direction) => {
    const neighbor = { x: position.x + direction.x, y: position.y + direction.y };
    return Array.from({ length: REGION_COUNT }, (_, regionIndex) =>
      isSafeAreaBoundaryGeometryPosition(neighbor, regionIndex, seed)).some(Boolean);
  });
}

export function getSafeAreaLayoutRegionIndex(position: MapPosition, seed: number) {
  for (let regionIndex = 0; regionIndex < REGION_COUNT; regionIndex += 1) {
    const centerX = safeAreaCenterX(regionIndex, seed);
    const centerY = safeAreaCenterY(regionIndex, seed);
    if (
      position.x >= centerX + SAFE_AREA_LAYOUT_MIN_OFFSET_X
      && position.x <= centerX + SAFE_AREA_LAYOUT_MAX_OFFSET_X
      && Math.abs(position.y - centerY) <= 2
    ) return regionIndex;
  }
  return null;
}

export function safeAreaEntry(regionIndex: number, seed: number): MapPosition {
  const centerX = safeAreaCenterX(regionIndex, seed);
  return { x: centerX + SAFE_AREA_SPAWN_OFFSET_X, y: safeAreaCenterY(regionIndex, seed) };
}

export function nextRegionEntry(regionIndex: number): MapPosition {
  return { x: 0, y: regionStartY(Math.min(REGION_COUNT - 1, regionIndex + 1)) };
}

function isPortalColumn(x: number, regionIndex: number, seed: number) {
  const bottomY = regionStartY(regionIndex) + regionHeight(regionIndex) - 1;
  const candidates = Array.from(
    { length: DUNGEON_MAX_X - DUNGEON_MIN_X + 1 },
    (_, index) => DUNGEON_MIN_X + index,
  ).filter((column) =>
    seededRoll({ x: column, y: bottomY }, seed, regionIndex + 101) < PORTAL_NODE_CHANCE);
  if (candidates.length > 0) return candidates.includes(x);
  const fallback = DUNGEON_MIN_X + Math.floor(
    seededRoll({ x: regionIndex, y: bottomY }, seed, 911)
      * (DUNGEON_MAX_X - DUNGEON_MIN_X + 1),
  );
  return x === fallback;
}

function getFixedRoomType(position: MapPosition, seed: number): RoomType | null {
  if (position.x === MAP_START.x && position.y === MAP_START.y) return "empty";
  const safeRegion = getSafeAreaRegionIndex(position, seed);
  if (safeRegion !== null) {
    const centerX = safeAreaCenterX(safeRegion, seed);
    const centerY = safeAreaCenterY(safeRegion, seed);
    if (position.x === centerX + SAFE_AREA_HEAL_OFFSET_X && position.y === centerY - 1) return "blessing";
    if (position.x === centerX + SAFE_AREA_HEAL_OFFSET_X && position.y === centerY) return "heal";
    if (position.x === centerX + SAFE_AREA_HEAL_OFFSET_X && position.y === centerY + 1) return "shop";
    if (position.x === centerX + SAFE_AREA_PORTAL_OFFSET_X && position.y === centerY) return "safePortal";
    if (safeRegion < BOSS_REGION_COUNT
      && position.x === centerX + SAFE_AREA_CONNECTOR_OFFSET_X
      && position.y === centerY) return "boss";
    if (safeRegion < 3 && position.x === centerX + SAFE_AREA_LEFT_CROSS_CENTER_OFFSET_X) {
      if (position.y === centerY) return "recoveryShrine";
      if (Math.abs(position.y - centerY) === 1) return "shrine";
    }
    return "empty";
  }
  const safeLayoutRegion = getSafeAreaLayoutRegionIndex(position, seed);
  if (safeLayoutRegion !== null) {
    if (!isSafeAreaBoundaryGeometryPosition(position, safeLayoutRegion, seed)) return "empty";
    return "rock";
  }
  if (position.x >= DUNGEON_MIN_X && position.x <= DUNGEON_MAX_X) {
    if (position.y >= -ROCK_BARRIER_HEIGHT && position.y < 0) return "rock";
    const regionIndex = getDungeonRegionIndex(position);
    if (regionIndex !== null) {
      const localY = position.y - regionStartY(regionIndex);
      if (localY === 0 && position.x === 0) return "empty";
      if (localY === regionHeight(regionIndex) - 1 && isPortalColumn(position.x, regionIndex, seed)) return "portal";
      return null;
    }
    for (let regionIndex = 0; regionIndex < REGION_COUNT - 1; regionIndex += 1) {
      const barrierStart = regionStartY(regionIndex) + regionHeight(regionIndex);
      if (position.y >= barrierStart && position.y < barrierStart + ROCK_BARRIER_HEIGHT) return "rock";
    }
  }
  return "void";
}

function chooseSoftDistributedPositions(
  candidates: readonly MapPosition[],
  count: number,
  seed: number,
  salt: number,
  repellers: readonly MapPosition[] = [],
) {
  const pool = [...candidates];
  const selected: MapPosition[] = [];
  while (selected.length < count && pool.length > 0) {
    const occupied = [...repellers, ...selected];
    const weighted = pool.map((position) => {
      const influence = occupied.reduce((total, other) => {
        const distance = chebyshevDistance(position, other);
        if (distance <= 0 || distance > 8) return total;
        return total + 2 ** (-(distance - 1));
      }, 0);
      return {
        position,
        weight: 1 / (1 + 1.5 * influence),
      };
    });
    const totalWeight = weighted.reduce((total, entry) => total + entry.weight, 0);
    let cursor = seededRoll({ x: selected.length, y: count }, seed, salt + selected.length) * totalWeight;
    let chosenIndex = weighted.length - 1;
    for (let index = 0; index < weighted.length; index += 1) {
      cursor -= weighted[index].weight;
      if (cursor <= 0) {
        chosenIndex = index;
        break;
      }
    }
    selected.push(pool[chosenIndex]);
    pool.splice(chosenIndex, 1);
  }
  return selected;
}

const specialNodeLayoutCache = new Map<number, Map<string, RoomType>>();

function getSpecialNodeLayout(seed: number) {
  const cached = specialNodeLayoutCache.get(seed);
  if (cached) return cached;

  const eligiblePositions: MapPosition[] = [];
  let baselineSpecialCount = 0;
  for (let y = 0; y < MAP_ROWS; y += 1) {
    for (let x = DUNGEON_MIN_X; x <= DUNGEON_MAX_X; x += 1) {
      const position = { x, y };
      if (getFixedRoomType(position, seed) !== null) continue;
      eligiblePositions.push(position);
      const regionIndex = getDungeonRegionIndex(position)!;
      const localY = position.y - regionStartY(regionIndex);
      const availableChance = localY === regionHeight(regionIndex) - 1
        ? 1 - PORTAL_NODE_CHANCE
        : 1;
      if (seededRoll(position, seed) < SPECIAL_NODE_CHANCE / availableChance) baselineSpecialCount += 1;
    }
  }

  const selected = chooseSoftDistributedPositions(eligiblePositions, baselineSpecialCount, seed, 7300);
  const layout = new Map<string, RoomType>();
  selected.forEach((position) => {
    const roll = seededRoll(position, seed, 7301);
    let cumulative = 0;
    let selectedType = SPECIAL_NODE_WEIGHTS.at(-1)!.type;
    for (const entry of SPECIAL_NODE_WEIGHTS) {
      cumulative += entry.weight / SPECIAL_NODE_WEIGHT_TOTAL;
      if (roll < cumulative) {
        selectedType = entry.type;
        break;
      }
    }
    layout.set(mapRoomKey(position), selectedType);
  });
  specialNodeLayoutCache.set(seed, layout);
  return layout;
}

function isNormalDungeonFloor(position: MapPosition, seed: number) {
  const regionIndex = getDungeonRegionIndex(position);
  if (regionIndex === null || chebyshevDistance(position, MAP_START) <= 1) return false;
  const localY = position.y - regionStartY(regionIndex);
  if (localY === 0 && position.x === 0) return false;
  if (localY === regionHeight(regionIndex) - 1 && isPortalColumn(position.x, regionIndex, seed)) return false;
  return !getSpecialNodeLayout(seed).has(mapRoomKey(position));
}

function isRockClusterCell(position: MapPosition, seed: number) {
  for (let anchorY = position.y - 1; anchorY <= position.y + 1; anchorY += 1) {
    for (let anchorX = position.x - 1; anchorX <= position.x + 1; anchorX += 1) {
      const anchor = { x: anchorX, y: anchorY };
      const regionIndex = getDungeonRegionIndex(anchor);
      if (regionIndex === null) continue;
      const localY = anchor.y - regionStartY(regionIndex);
      const nearRegionEdge = localY < regionHeight(regionIndex) / 3
        || localY >= regionHeight(regionIndex) * 2 / 3;
      const chance = nearRegionEdge ? ROCK_CLUSTER_EDGE_CHANCE : ROCK_CLUSTER_CHANCE;
      if (seededRoll(anchor, seed, 7101) >= chance) continue;

      const neighborOffsets = EIGHT_DIRECTIONS
        .map((offset) => ({ ...offset }))
        .sort((left, right) =>
          seededRoll({ x: anchor.x + left.x, y: anchor.y + left.y }, seed, 7103)
          - seededRoll({ x: anchor.x + right.x, y: anchor.y + right.y }, seed, 7103));
      const clusterSize = 1 + Math.floor(seededRoll(anchor, seed, 7102) * 7);
      const clusterCells = [anchor, ...neighborOffsets.slice(0, clusterSize - 1).map((offset) => ({
        x: anchor.x + offset.x,
        y: anchor.y + offset.y,
      }))];
      const containsPosition = clusterCells.some((cell) =>
        cell.x === position.x && cell.y === position.y);
      if (!containsPosition) continue;
      if (clusterCells.every((cell) => isNormalDungeonFloor(cell, seed))) return true;
    }
  }
  return false;
}

export function getRoomType(position: MapPosition, seed: number): RoomType {
  const fixedType = getFixedRoomType(position, seed);
  if (fixedType !== null) return fixedType;
  const specialType = getSpecialNodeLayout(seed).get(mapRoomKey(position));
  if (specialType) return specialType;
  if (!isAdjacentToSafeAreaBoundary(position, seed) && isRockClusterCell(position, seed)) return "rock";
  return "empty";
}

export function isWalkableRoom(type: RoomType) {
  return type !== "rock" && type !== "void";
}

export function visibleMapRoomKeys(
  center: MapPosition,
  seed: number,
  horizontalRadius = MAP_PLAYER_VISION_HORIZONTAL_RADIUS,
  verticalRadius = MAP_PLAYER_VISION_VERTICAL_RADIUS,
) {
  const candidates = new Map<string, { position: MapPosition; type: RoomType }>();
  for (let offsetY = -verticalRadius; offsetY <= verticalRadius; offsetY += 1) {
    for (let offsetX = -horizontalRadius; offsetX <= horizontalRadius; offsetX += 1) {
      const position = { x: center.x + offsetX, y: center.y + offsetY };
      const type = getRoomType(position, seed);
      if (type !== "void") candidates.set(mapRoomKey(position), { position, type });
    }
  }
  const centerKey = mapRoomKey(center);
  const centerCell = candidates.get(centerKey);
  if (!centerCell) return new Set<string>();

  const visible = new Set<string>([centerKey]);
  const traversed = new Set<string>([centerKey]);
  const distanceByKey = new Map<string, number>([[centerKey, 0]]);
  const maximumDistance = Math.max(horizontalRadius, verticalRadius);
  const queue = [centerCell.position];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const currentKey = mapRoomKey(current);
    const currentDistance = distanceByKey.get(currentKey) ?? 0;
    if (currentDistance >= maximumDistance) continue;
    for (const direction of EIGHT_DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = mapRoomKey(next);
      const nextCell = candidates.get(nextKey);
      if (!nextCell) continue;
      const nextDistance = currentDistance + 1;
      if (
        nextDistance > maximumDistance
        || Math.abs(next.x - center.x) > horizontalRadius
        || Math.abs(next.y - center.y) > verticalRadius
      ) continue;
      visible.add(nextKey);
      if (!isWalkableRoom(nextCell.type) || traversed.has(nextKey)) continue;
      traversed.add(nextKey);
      distanceByKey.set(nextKey, nextDistance);
      queue.push(nextCell.position);
    }
  }
  return visible;
}

export function isMapEnemySpawnCell(position: MapPosition, seed: number) {
  const regionIndex = getDungeonRegionIndex(position);
  return chebyshevDistance(position, MAP_START) > MAP_ENEMY_SAFE_RADIUS
    && regionIndex !== null
    && getEncounterSpawnPool(regionIndex, 1).length > 0
    && !isSafeAreaPosition(position, seed)
    && getRoomType(position, seed) === "empty";
}

export function createPreGeneratedMapEnemyWorld(seed: number): MapEnemyWorld {
  const spawnCells: MapPosition[] = [];
  for (let y = 0; y < MAP_ROWS; y += 1) {
    for (let x = DUNGEON_MIN_X; x <= DUNGEON_MAX_X; x += 1) {
      const position = { x, y };
      if (isMapEnemySpawnCell(position, seed)) spawnCells.push(position);
    }
  }
  const world = createMapEnemyWorld(spawnCells, seed, SEWER_ENCOUNTER_COUNT);
  const bosses = Array.from({ length: BOSS_REGION_COUNT }, (_, regionIndex) => {
    const centerX = safeAreaCenterX(regionIndex, seed);
    const centerY = safeAreaCenterY(regionIndex, seed);
    return {
      id: `map-boss-${regionIndex}`,
      position: { x: centerX + SAFE_AREA_CONNECTOR_OFFSET_X, y: centerY },
      encounterIndex: getBossEncounterIndex(regionIndex)!,
      awareness: "alerted" as const,
      isBoss: true,
    };
  });
  return {
    enemies: [
      ...world.enemies.map((enemy) => {
        const regionIndex = getDungeonRegionIndex(enemy.position) ?? -1;
        const candidates = getEncounterSpawnPool(regionIndex, seededRoll(enemy.position, seed, 4000));
        const roll = seededRoll(enemy.position, seed, 4001);
        return {
          ...enemy,
          encounterIndex: candidates[Math.min(candidates.length - 1, Math.floor(roll * candidates.length))],
        };
      }),
      ...bosses,
    ],
  };
}

export function createPreGeneratedMapFloorDrops(seed: number) {
  const cards: Record<string, Card[]> = {};
  const consumables: Record<string, Consumable[]> = {};
  const specialPositions = Array.from(getSpecialNodeLayout(seed).keys()).map(parseMapRoomKey);
  const emptyPositions: MapPosition[] = [];
  const baselineDropCount = { value: 0 };
  for (let y = 0; y < MAP_ROWS; y += 1) {
    for (let x = DUNGEON_MIN_X; x <= DUNGEON_MAX_X; x += 1) {
      const position = { x, y };
      if (getRoomType(position, seed) !== "empty") continue;
      emptyPositions.push(position);
      if (seededRoll(position, seed, 7201) < FLOOR_CARD_DROP_CHANCE) baselineDropCount.value += 1;
    }
  }
  const dropPositions = chooseSoftDistributedPositions(
    emptyPositions,
    baselineDropCount.value,
    seed,
    7205,
    specialPositions,
  ).sort((left, right) => left.y - right.y || left.x - right.x);
  let cardIndex = 0;
  for (const position of dropPositions) {
    const roomKey = mapRoomKey(position);
    if (seededRoll(position, seed, 7202) < FLOOR_CARD_ITEM_CHANCE) {
      const rarityRoll = seededRoll(position, seed, 7203);
      const pool = rarityRoll < FLOOR_CARD_RARITY_CHANCES.rare
        ? RARE_CARD_POOL
        : rarityRoll < FLOOR_CARD_RARITY_CHANCES.rare + FLOOR_CARD_RARITY_CHANCES.basic
          ? BASIC_CARD_POOL
          : SPECIAL_CARD_POOL.filter((card) => card.rarity === "special");
      const blueprint = pool[Math.floor(seededRoll(position, seed, 7204) * pool.length)];
      cards[roomKey] = [{ ...blueprint, id: 100_000 + cardIndex, revealed: false }];
      cardIndex += 1;
    } else {
      const ticketRoll = seededRoll(position, seed, 7203);
      const type = consumableTypeFromRoll(ticketRoll);
      consumables[roomKey] = [createConsumable(type, `map-ticket-${position.x}-${position.y}`)];
    }
  }
  return { cards, consumables };
}

export function buildKnownRoomRoutes(
  start: MapPosition,
  knownRooms: Set<string>,
  seed: number,
  roomTypeAt: (position: MapPosition) => RoomType = (position) => getRoomType(position, seed),
) {
  const startKey = mapRoomKey(start);
  const previous = new Map<string, string | null>([[startKey, null]]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const direction of EIGHT_DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = mapRoomKey(next);
      if (previous.has(nextKey) || !knownRooms.has(nextKey)) continue;
      if (!isWalkableRoom(roomTypeAt(next))) continue;
      previous.set(nextKey, mapRoomKey(current));
      queue.push(next);
    }
  }
  return previous;
}

export function findKnownRoomRoute(
  start: MapPosition,
  target: MapPosition,
  knownRooms: Set<string>,
  roomTypeAt: (position: MapPosition) => RoomType,
) {
  const startKey = mapRoomKey(start);
  const targetKey = mapRoomKey(target);
  if (startKey === targetKey) return [start];
  if (!knownRooms.has(targetKey) || !isWalkableRoom(roomTypeAt(target))) return null;

  type RouteNode = {
    position: MapPosition;
    key: string;
    steps: number;
    turns: number;
    directionIndex: number | null;
    priority: number;
    order: number;
  };
  const previous = new Map<string, string | null>([[startKey, null]]);
  const bestSteps = new Map<string, number>([[startKey, 0]]);
  const bestTurns = new Map<string, number>([[startKey, 0]]);
  const queue: RouteNode[] = [{
    position: start,
    key: startKey,
    steps: 0,
    turns: 0,
    directionIndex: null,
    priority: chebyshevDistance(start, target),
    order: 0,
  }];
  let order = 1;

  while (queue.length > 0) {
    queue.sort((left, right) =>
      left.priority - right.priority
      || left.turns - right.turns
      || left.steps - right.steps
      || left.order - right.order);
    const current = queue.shift()!;
    if (current.key === targetKey) {
      const reversed: MapPosition[] = [];
      let cursor: string | null = targetKey;
      while (cursor) {
        reversed.push(parseMapRoomKey(cursor));
        cursor = previous.get(cursor) ?? null;
      }
      return reversed.reverse();
    }

    for (let directionIndex = 0; directionIndex < EIGHT_DIRECTIONS.length; directionIndex += 1) {
      const direction = EIGHT_DIRECTIONS[directionIndex];
      const next = { x: current.position.x + direction.x, y: current.position.y + direction.y };
      const nextKey = mapRoomKey(next);
      if (!knownRooms.has(nextKey) || !isWalkableRoom(roomTypeAt(next))) continue;
      const steps = current.steps + 1;
      const turns = current.turns
        + (current.directionIndex === null || current.directionIndex === directionIndex ? 0 : 1);
      const knownSteps = bestSteps.get(nextKey);
      const knownTurns = bestTurns.get(nextKey);
      if (
        knownSteps !== undefined
        && (steps > knownSteps || (steps === knownSteps && turns >= (knownTurns ?? Infinity)))
      ) continue;
      bestSteps.set(nextKey, steps);
      bestTurns.set(nextKey, turns);
      previous.set(nextKey, current.key);
      queue.push({
        position: next,
        key: nextKey,
        steps,
        turns,
        directionIndex,
        priority: steps + chebyshevDistance(next, target),
        order,
      });
      order += 1;
    }
  }
  return null;
}

export function routeToRoom(target: MapPosition, routes: Map<string, string | null>) {
  const targetKey = mapRoomKey(target);
  if (!routes.has(targetKey)) return null;
  const reversed: MapPosition[] = [];
  let cursor: string | null = targetKey;
  while (cursor) {
    reversed.push(parseMapRoomKey(cursor));
    cursor = routes.get(cursor) ?? null;
  }
  return reversed.reverse();
}

export function getRegionNumber(position: MapPosition, seed: number) {
  const dungeonRegion = getDungeonRegionIndex(position);
  if (dungeonRegion !== null) return dungeonRegion + 1;
  const safeRegion = getSafeAreaRegionIndex(position, seed);
  return (safeRegion ?? 0) + 1;
}

export function isHigherRegionMapEnemy(encounterIndex: number, position: MapPosition, seed: number) {
  return getEncounterRegionNumber(encounterIndex) > getRegionNumber(position, seed);
}
