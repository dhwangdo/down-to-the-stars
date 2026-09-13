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
  | "healthShrine"
  | "boss"
  | "portal"
  | "heal"
  | "safePortal";

export const REGION_COUNT = 7;
export const ROCK_BARRIER_HEIGHT = 5;
export const SHOP_NODE_CHANCE = 0.0025;
export const SHRINE_NODE_CHANCE = 0.0025;
export const PORTAL_NODE_CHANCE = 0.05;
export const ROCK_CLUSTER_CHANCE = 0.03;
export const ROCK_CLUSTER_EDGE_CHANCE = 0.05;
export const FLOOR_CARD_DROP_CHANCE = 0.01;
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

function isNormalDungeonFloor(position: MapPosition, seed: number) {
  const regionIndex = getDungeonRegionIndex(position);
  if (regionIndex === null || chebyshevDistance(position, MAP_START) <= 1) return false;
  const localY = position.y - regionStartY(regionIndex);
  if (localY === 0 && position.x === 0) return false;
  if (localY === regionHeight(regionIndex) - 1 && isPortalColumn(position.x, regionIndex, seed)) return false;
  const portalEligible = localY === regionHeight(regionIndex) - 1;
  const availableChance = portalEligible ? 1 - PORTAL_NODE_CHANCE : 1;
  return seededRoll(position, seed) >= (SHOP_NODE_CHANCE + SHRINE_NODE_CHANCE) / availableChance;
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
      if (position.y === centerY) return "healthShrine";
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
      const portalEligible = localY === regionHeight(regionIndex) - 1;
      const availableChance = portalEligible ? 1 - PORTAL_NODE_CHANCE : 1;
      const roll = seededRoll(position, seed);
      if (roll < SHOP_NODE_CHANCE / availableChance) return "shop";
      if (roll < (SHOP_NODE_CHANCE + SHRINE_NODE_CHANCE) / availableChance) return "shrine";
      if (!isAdjacentToSafeAreaBoundary(position, seed) && isRockClusterCell(position, seed)) return "rock";
      return "empty";
    }
    for (let regionIndex = 0; regionIndex < REGION_COUNT - 1; regionIndex += 1) {
      const barrierStart = regionStartY(regionIndex) + regionHeight(regionIndex);
      if (position.y >= barrierStart && position.y < barrierStart + ROCK_BARRIER_HEIGHT) return "rock";
    }
  }
  return "void";
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
  const queue = [centerCell.position];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const direction of EIGHT_DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const nextKey = mapRoomKey(next);
      const nextCell = candidates.get(nextKey);
      if (!nextCell) continue;
      visible.add(nextKey);
      if (!isWalkableRoom(nextCell.type) || traversed.has(nextKey)) continue;
      traversed.add(nextKey);
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
  let cardIndex = 0;
  for (let y = 0; y < MAP_ROWS; y += 1) {
    for (let x = DUNGEON_MIN_X; x <= DUNGEON_MAX_X; x += 1) {
      const position = { x, y };
      if (getRoomType(position, seed) !== "empty") continue;
      if (seededRoll(position, seed, 7201) >= FLOOR_CARD_DROP_CHANCE) continue;
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
