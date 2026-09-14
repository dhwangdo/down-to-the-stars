import type { GridPosition, MapEnemy } from "./mapEnemies";

export type MapBomb = {
  id: string;
  ticketId?: string;
  position: GridPosition;
  movesRemaining: number;
};

export function positionsInSquare(center: GridPosition, radius: number) {
  const positions: GridPosition[] = [];
  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      positions.push({ x, y });
    }
  }
  return positions;
}

export function advanceBombs(bombs: MapBomb[]) {
  const advanced = bombs.map((bomb) => ({
    ...bomb,
    movesRemaining: bomb.movesRemaining - 1,
  }));
  return {
    bombs: advanced.filter((bomb) => bomb.movesRemaining > 0),
    explosions: advanced.filter((bomb) => bomb.movesRemaining <= 0),
  };
}

export function applyBombDamage(
  enemies: MapEnemy[],
  explosions: MapBomb[],
  damage = 20,
) {
  if (explosions.length === 0) return enemies;
  return enemies.map((enemy) => {
    const hitCount = explosions.filter((bomb) =>
      Math.max(
        Math.abs(enemy.position.x - bomb.position.x),
        Math.abs(enemy.position.y - bomb.position.y),
      ) <= 1).length;
    return hitCount > 0
      ? { ...enemy, damageTaken: (enemy.damageTaken ?? 0) + damage * hitCount }
      : enemy;
  });
}
