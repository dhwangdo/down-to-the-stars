export type EnemyDamageType = "physical" | "magic";

export function reduceEnemyDamageByResistance(
  damage: number,
  damageType: EnemyDamageType,
  physicalResistance = 0,
  magicResistance = 0,
) {
  const resistance = damageType === "physical" ? physicalResistance : magicResistance;
  return resistance > 0 ? Math.floor(damage / 2) : damage;
}

export function enemyDamageBeforeBlock(
  damage: number,
  damageType: EnemyDamageType,
  physicalResistance = 0,
  magicResistance = 0,
  vulnerability = 0,
) {
  return reduceEnemyDamageByResistance(
    damage,
    damageType,
    physicalResistance,
    magicResistance,
  ) * (vulnerability > 0 ? 2 : 1);
}

export function resolveEnemyHitAgainstPlayer({
  damage,
  damageType,
  block,
  physicalResistance = 0,
  magicResistance = 0,
  vulnerability = 0,
  damageTakenMultiplier = 1,
  invulnerable = false,
}: {
  damage: number;
  damageType: EnemyDamageType;
  block: number;
  physicalResistance?: number;
  magicResistance?: number;
  vulnerability?: number;
  damageTakenMultiplier?: number;
  invulnerable?: boolean;
}) {
  const transformedDamage = enemyDamageBeforeBlock(
    damage,
    damageType,
    physicalResistance,
    magicResistance,
    vulnerability,
  );
  const blocked = invulnerable ? 0 : Math.min(transformedDamage, block);
  return {
    transformedDamage,
    blocked,
    damageTaken: invulnerable ? 0 : (transformedDamage - blocked) * damageTakenMultiplier,
    remainingBlock: invulnerable ? block : block - blocked,
  };
}

export function retainBlockAfterEnemyTurn(block: number, preserveDefense: boolean) {
  return preserveDefense ? Math.floor(block / 2) : 0;
}

export type EnemyHit = {
  type: EnemyDamageType;
  value: number;
  hits?: number;
};

export type EnemyAction = {
  name: string;
  attacks: EnemyHit[];
  /** Listed actions advance in order instead of being selected randomly. */
  cycle?: boolean;
  /** Select every action independently, including the action used last turn. */
  randomEachTurn?: boolean;
  /** Select a random action other than the one used last turn. */
  randomNoRepeat?: boolean;
  strengthGain?: number;
  blockGain?: number;
  boonGain?: number;
  strengthLoss?: number;
  agilityLoss?: number;
  soilCount?: number;
  rockCount?: number;
  /** Special first use count for a file-token action. */
  firstActionRockCount?: number;
  nextAttackMagic?: boolean;
  physicalVulnerabilityGain?: number;
  /** Applied after status decay when the player's next turn begins. */
  nextTurnPhysicalVulnerabilityGain?: number;
  /** Applied after status decay when the player's next turn begins. */
  nextTurnMagicVulnerabilityGain?: number;
  discardCount?: number;
  /** After this action, continue from this zero-based action index. */
  loopTo?: number;
};

export type EnemyVariant = "slime" | "golem" | "goblin" | "rat" | "mage" | "warlock" | "beast" | "wisp" | "mummyPriest" | "mummyWarrior" | "wyrm" | "thornBeetle" | "blackSlime" | "clown" | "giantWyrm";

export type EnemyState = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  actions: EnemyAction[];
  intentIndex: number;
  strength: number;
  /** Count-based damage immunity. Each successful hit consumes one stack. */
  boon?: number;
  /** Gains strength by this amount when the player's next turn starts. */
  berserk?: number;
  /** Physical damage dealt back whenever this enemy is attacked. */
  thorns?: number;
  /** 속성이 없는 적 방어도. 레거시 상태 키 이름은 호환을 위해 유지한다. */
  physicalBlock: number;
  variant: EnemyVariant;
  sturdyThreshold: number;
  quicknessReady: boolean;
  nextAttackMagic: boolean;
  /** Adds a toxic slime token to the player's hand at battle start. */
  givesToxicSlime?: boolean;
  /** Number of toxic slime tokens this enemy gives at battle start. */
  toxicSlimeCount?: number;
  /** Bosses are fixed on the map and start in the alerted state. */
  isBoss?: boolean;
  /** Used for first-use-only boss actions. */
  firstActionCompleted?: boolean;
  /** The pile chosen for the next discard action. */
  discardPileIndex?: number;
  trait: string | null;
};

type EnemyBlueprint = Omit<EnemyState, "id" | "intentIndex">;

export type EnemyCodexEntry = {
  encounterIndex: number;
  label: string;
  regions: number[];
  enemies: Array<{
    count: number;
    enemy: EnemyBlueprint;
  }>;
};

const SEWER_ENCOUNTERS: EnemyBlueprint[][] = [
  [
    {
      name: "작은 마법사",
      hp: 30,
      maxHp: 30,
      actions: [{ name: "마법 화살", attacks: [{ type: "magic", value: 8 }] }],
      strength: 0,
      physicalBlock: 0,
      variant: "mage",
      sturdyThreshold: 0,
      quicknessReady: false,
      nextAttackMagic: false,
      trait: null,
    },
  ],
  [
    {
      name: "주황 슬라임",
      hp: 40,
      maxHp: 40,
      actions: [
        { name: "점액 충돌", attacks: [{ type: "physical", value: 9 }], cycle: true },
        { name: "점액 방어", attacks: [{ type: "physical", value: 6 }], blockGain: 10, cycle: true },
      ],
      strength: 0,
      physicalBlock: 0,
      variant: "slime",
      sturdyThreshold: 0,
      quicknessReady: false,
      nextAttackMagic: false,
      givesToxicSlime: true,
      trait: "점액투성이 · 전투 시작 시 유독성 점액을 손패에 넣음",
    },
  ],
  [
    {
      name: "골렘",
      hp: 80,
      maxHp: 80,
      actions: [
        { name: "...", attacks: [], cycle: true },
        { name: "...!", attacks: [], cycle: true },
        { name: "공격", attacks: [{ type: "physical", value: 30 }], cycle: true },
        { name: "...", attacks: [], cycle: true },
        { name: "공격", attacks: [{ type: "physical", value: 30 }], cycle: true, loopTo: 3 },
      ],
      strength: 0,
      physicalBlock: 0,
      variant: "golem",
      sturdyThreshold: 0,
      quicknessReady: false,
      nextAttackMagic: false,
      trait: null,
    },
  ],
  [
    {
      name: "하수구 쥐",
      hp: 40,
      maxHp: 40,
      actions: [
        { name: "물어뜯기", attacks: [{ type: "physical", value: 5, hits: 2 }], discardCount: 1, cycle: true },
        { name: "웅크리기", attacks: [{ type: "physical", value: 10 }], discardCount: 1, cycle: true },
        { name: "광폭 질주", attacks: [], blockGain: 10, strengthGain: 3, discardCount: 1, cycle: true },
      ],
      strength: 0,
      physicalBlock: 0,
      variant: "rat",
      sturdyThreshold: 0,
      quicknessReady: false,
      nextAttackMagic: false,
      trait: "버리기: 지정된 파일의 맨 위 카드 1장을 턴 종료 시 버립니다.",
    },
  ],
  [
    {
      name: "도깨비",
      hp: 66,
      maxHp: 66,
      actions: [
        { name: "강타", attacks: [{ type: "physical", value: 14 }], cycle: true },
        { name: "연타", attacks: [{ type: "physical", value: 8, hits: 2 }], cycle: true },
        { name: "난타", attacks: [{ type: "physical", value: 7, hits: 3 }], cycle: true },
      ],
      strength: 0,
      physicalBlock: 0,
      variant: "goblin",
      sturdyThreshold: 0,
      quicknessReady: false,
      nextAttackMagic: false,
      trait: "전투 시작 시 가장 왼쪽 파일 맨 아래에 앞면 유물을 추가",
    },
  ],
  Array.from({ length: 3 }, () => ({
    name: "쥐",
    hp: 10,
    maxHp: 10,
    actions: [{ name: "물어뜯기", attacks: [{ type: "physical" as const, value: 6 }] }],
    strength: 0,
    physicalBlock: 0,
    variant: "rat" as const,
    sturdyThreshold: 0,
    quicknessReady: false,
    nextAttackMagic: false,
    trait: null,
  })),
  [
    {
      name: "저주술사",
      hp: 55,
      maxHp: 55,
      actions: [
        { name: "쇠약의 저주", attacks: [{ type: "magic", value: 6 }], cycle: true, nextTurnPhysicalVulnerabilityGain: 2 },
        { name: "저주 화살", attacks: [{ type: "physical", value: 12 }], cycle: true },
        { name: "저주 화살", attacks: [{ type: "physical", value: 12 }], cycle: true },
      ],
      strength: 0,
      physicalBlock: 0,
      variant: "warlock",
      sturdyThreshold: 0,
      quicknessReady: false,
      nextAttackMagic: false,
      trait: null,
    },
  ],
  [
    {
      name: "초록 슬라임",
      hp: 40,
      maxHp: 40,
      actions: [
        { name: "점액 충돌", attacks: [{ type: "physical", value: 10 }], randomEachTurn: true },
        { name: "점액 주입", attacks: [{ type: "physical", value: 10 }], nextAttackMagic: true, randomEachTurn: true },
      ],
      strength: 0,
      physicalBlock: 0,
      variant: "slime",
      sturdyThreshold: 0,
      quicknessReady: false,
      nextAttackMagic: false,
      trait: null,
    },
  ],
  [
    {
      name: "마나 야수",
      hp: 55,
      maxHp: 55,
      actions: [{ name: "마력 포식", attacks: [{ type: "physical", value: 7 }, { type: "magic", value: 7 }] }],
      strength: 0,
      physicalBlock: 0,
      variant: "beast",
      sturdyThreshold: 0,
      quicknessReady: false,
      nextAttackMagic: false,
      trait: null,
    },
    {
      name: "도깨비불",
      hp: 20,
      maxHp: 20,
      actions: [{ name: "마력 침식", attacks: [], nextTurnMagicVulnerabilityGain: 1 }],
      strength: 0,
      physicalBlock: 0,
      variant: "wisp",
      sturdyThreshold: 0,
      quicknessReady: false,
      nextAttackMagic: false,
      trait: null,
    },
  ],
  Array.from({ length: 2 }, () => ({
    name: "작은 마법사",
    hp: 30,
    maxHp: 30,
    actions: [{ name: "마법 화살", attacks: [{ type: "magic" as const, value: 8 }] }],
    strength: 0,
    physicalBlock: 0,
    variant: "mage" as const,
    sturdyThreshold: 0,
    quicknessReady: false,
    nextAttackMagic: false,
    trait: null,
  })),
  [
    {
      name: "미라 사제",
      hp: 70,
      maxHp: 70,
      actions: [
        { name: "가호의 의식", attacks: [], boonGain: 2, cycle: true, nextTurnMagicVulnerabilityGain: 1 },
        { name: "마력의 저주", attacks: [{ type: "magic", value: 16 }], cycle: true },
        { name: "붕대 강타", attacks: [{ type: "physical", value: 20 }], cycle: true },
      ],
      strength: 0,
      physicalBlock: 0,
      variant: "mummyPriest",
      sturdyThreshold: 0,
      quicknessReady: false,
      nextAttackMagic: false,
      boon: 5,
      trait: "전투 시작 시 가호 5 · 피해를 5회 무효화",
    },
  ],
  [
    {
      name: "미라 전사",
      hp: 100,
      maxHp: 100,
      actions: [
        { name: "삼연격", attacks: [{ type: "physical", value: 4, hits: 3 }], cycle: true },
        { name: "강타", attacks: [{ type: "physical", value: 16 }], cycle: true },
        { name: "약화 연타", attacks: [{ type: "physical", value: 5, hits: 2 }], cycle: true, nextTurnPhysicalVulnerabilityGain: 1 },
      ],
      strength: 0,
      physicalBlock: 0,
      variant: "mummyWarrior",
      sturdyThreshold: 0,
      quicknessReady: false,
      nextAttackMagic: false,
      berserk: 1,
      trait: "전투 시작 시 광폭화 1 · 턴 시작 시 힘 1 획득",
    },
  ],
  [
    {
      name: "지룡",
      hp: 95,
      maxHp: 95,
      actions: [
        { name: "흙", attacks: [], soilCount: 1, cycle: true, nextTurnPhysicalVulnerabilityGain: 1 },
        { name: "지각 강타", attacks: [{ type: "physical", value: 15 }], cycle: true },
        { name: "대지 마력", attacks: [{ type: "magic", value: 20 }], cycle: true },
      ],
      strength: 0,
      physicalBlock: 0,
      variant: "wyrm",
      sturdyThreshold: 0,
      quicknessReady: false,
      nextAttackMagic: false,
      trait: "흙: 모든 파일 맨 위에 흙을 놓음",
    },
  ],
  Array.from({ length: 2 }, () => ({
    name: "가시 딱정벌레",
    hp: 45,
    maxHp: 45,
    actions: [
      { name: "가시 돋치기", attacks: [], nextTurnPhysicalVulnerabilityGain: 1, randomNoRepeat: true },
      { name: "가시 강타", attacks: [{ type: "physical", value: 10 }], randomNoRepeat: true },
      { name: "약화 독", attacks: [], strengthLoss: 2, agilityLoss: 2, randomNoRepeat: true },
    ],
    strength: 0,
    physicalBlock: 0,
    variant: "thornBeetle" as const,
    sturdyThreshold: 0,
    quicknessReady: false,
    nextAttackMagic: false,
    thorns: 4,
    trait: "전투 시작 시 가시 4 · 공격받을 때마다 물리 피해 4로 반격",
  })),
  [
    {
      name: "검은 슬라임",
      hp: 70,
      maxHp: 70,
      actions: [
        { name: "검은 점액 충돌", attacks: [{ type: "physical", value: 10 }], cycle: true },
        { name: "검은 점액 방어", attacks: [], blockGain: 10, strengthGain: 2, cycle: true },
      ],
      strength: 0,
      physicalBlock: 0,
      variant: "blackSlime",
      sturdyThreshold: 0,
      quicknessReady: false,
      nextAttackMagic: false,
      givesToxicSlime: true,
      toxicSlimeCount: 2,
      isBoss: true,
      trait: "전투 시작 시 유독성 점액 2장",
    },
  ],
  [
    {
      name: "광대",
      hp: 110,
      maxHp: 110,
      actions: [
        { name: "광대의 강타", attacks: [{ type: "physical", value: 20 }], discardCount: 5, cycle: true },
        { name: "광대의 마법", attacks: [{ type: "magic", value: 20 }], discardCount: 5, cycle: true },
        { name: "광대의 강화", attacks: [], strengthGain: 3, discardCount: 5, cycle: true },
      ],
      strength: 0,
      physicalBlock: 0,
      variant: "clown",
      sturdyThreshold: 0,
      quicknessReady: false,
      nextAttackMagic: false,
      isBoss: true,
      trait: "비어 있지 않은 무작위 파일의 카드 5장 버림",
    },
  ],
  [
    {
      name: "거대 지룡",
      hp: 150,
      maxHp: 150,
      actions: [
        { name: "돌 깔기", attacks: [], rockCount: 1, firstActionRockCount: 2, strengthGain: 4, cycle: true },
        { name: "지룡 강타", attacks: [{ type: "physical", value: 12 }], cycle: true },
        { name: "지룡 연타", attacks: [{ type: "physical", value: 6, hits: 2 }], cycle: true },
      ],
      strength: 0,
      physicalBlock: 0,
      variant: "giantWyrm",
      sturdyThreshold: 0,
      quicknessReady: false,
      nextAttackMagic: false,
      isBoss: true,
      firstActionCompleted: false,
      trait: "첫 행동은 모든 파일에 돌 2장, 이후 돌 1장 · 힘 4 획득",
    },
  ],
];

const ENCOUNTER_INDICES_BY_REGION = [
  [0, 1, 3, 5, 7],
  [2, 4, 6, 8, 9],
  [10, 11, 12, 13],
] as const;

const BOSS_ENCOUNTER_INDICES_BY_REGION = [14, 15, 16] as const;

export const NEXT_REGION_ENCOUNTER_CHANCE = 0.03;

export function getBossEncounterIndex(regionIndex: number) {
  return BOSS_ENCOUNTER_INDICES_BY_REGION[regionIndex] ?? null;
}

function randomIndex(length: number, random: () => number) {
  return Math.min(length - 1, Math.floor(random() * length));
}

export function chooseNextIntent(
  actions: EnemyAction[],
  previousIndex: number,
  random: () => number = Math.random,
) {
  if (actions.length <= 1) return 0;
  if (actions[previousIndex]?.loopTo !== undefined) return actions[previousIndex].loopTo;
  if (actions[0]?.cycle) return (previousIndex + 1) % actions.length;
  if (actions[0]?.randomNoRepeat) {
    const candidates = actions
      .map((_, index) => index)
      .filter((index) => index !== previousIndex);
    return candidates[randomIndex(candidates.length, random)];
  }
  if (actions[0]?.randomEachTurn) return randomIndex(actions.length, random);
  const candidates = actions
    .map((_, index) => index)
    .filter((index) => index !== previousIndex);
  return candidates[randomIndex(candidates.length, random)];
}

export function applyPlayerTurnStart(enemy: EnemyState) {
  const berserk = enemy.berserk ?? 0;
  return enemy.hp > 0 && berserk > 0
    ? { ...enemy, strength: enemy.strength + berserk }
    : enemy;
}

export function createSewerEncounter(random: () => number = Math.random): EnemyState[] {
  const normalEncounterCount = BOSS_ENCOUNTER_INDICES_BY_REGION[0];
  return createSewerEncounterByIndex(randomIndex(normalEncounterCount, random), random);
}

export const SEWER_ENCOUNTER_COUNT = SEWER_ENCOUNTERS.length;

export function getEncounterIndicesForRegion(regionIndex: number) {
  return ENCOUNTER_INDICES_BY_REGION[regionIndex] ?? [];
}

export function getEncounterRegionNumber(encounterIndex: number) {
  const bossRegionIndex = BOSS_ENCOUNTER_INDICES_BY_REGION.findIndex((index) => index === encounterIndex);
  if (bossRegionIndex >= 0) return bossRegionIndex + 1;
  const regionIndex = ENCOUNTER_INDICES_BY_REGION.findIndex((indices) =>
    indices.some((index) => index === encounterIndex));
  return regionIndex >= 0 ? regionIndex + 1 : 1;
}

export function getEncounterSpawnPool(regionIndex: number, rareRoll: number) {
  const currentRegionPool = getEncounterIndicesForRegion(regionIndex);
  const nextRegionPool = getEncounterIndicesForRegion(regionIndex + 1);
  return rareRoll < NEXT_REGION_ENCOUNTER_CHANCE && nextRegionPool.length > 0
    ? nextRegionPool
    : currentRegionPool;
}

/**
 * Builds the debug encyclopedia directly from the live encounter and region tables.
 * Adding or removing an encounter therefore updates the encyclopedia without a
 * second hand-maintained enemy list.
 */
export function getEnemyCodexEntries(): EnemyCodexEntry[] {
  return SEWER_ENCOUNTERS.map((encounter, encounterIndex) => {
    const groupedEnemies = new Map<string, EnemyCodexEntry["enemies"][number]>();
    encounter.forEach((enemy) => {
      const signature = JSON.stringify(enemy);
      const existing = groupedEnemies.get(signature);
      if (existing) existing.count += 1;
      else groupedEnemies.set(signature, { count: 1, enemy });
    });

    const regions = ENCOUNTER_INDICES_BY_REGION.flatMap((indices, regionIndex) =>
      (indices.some((index) => index === encounterIndex)
        || BOSS_ENCOUNTER_INDICES_BY_REGION[regionIndex] === encounterIndex)
        ? [regionIndex + 1]
        : []);
    return {
      encounterIndex,
      label: encounter.length > 1 && encounter.every((enemy) => enemy.name === encounter[0].name)
        ? `${encounter[0].name} ${encounter.length}마리`
        : encounter[0].name,
      regions,
      enemies: Array.from(groupedEnemies.values()),
    };
  }).sort((left, right) =>
    (left.regions[0] ?? Number.MAX_SAFE_INTEGER) - (right.regions[0] ?? Number.MAX_SAFE_INTEGER)
    || left.encounterIndex - right.encounterIndex);
}

export function createSewerEncounterByIndex(
  encounterIndex: number,
  random: () => number = Math.random,
): EnemyState[] {
  const safeIndex = Math.max(0, Math.min(SEWER_ENCOUNTERS.length - 1, Math.floor(encounterIndex)));
  const encounter = SEWER_ENCOUNTERS[safeIndex];
  return encounter.map((enemy, index) => {
    const minimumHp = Math.floor(enemy.maxHp * 0.9);
    const rolledMaxHp = Math.min(
      enemy.maxHp,
      enemy.isBoss ? enemy.maxHp : minimumHp + Math.floor(random() * (enemy.maxHp - minimumHp + 1)),
    );
    return {
      ...enemy,
      hp: rolledMaxHp,
      maxHp: rolledMaxHp,
      id: `sewer-enemy-${index}-${Math.random().toString(36).slice(2, 8)}`,
      actions: enemy.actions.map((action) => ({
        ...action,
        attacks: action.attacks.map((attack) => ({ ...attack })),
      })),
      intentIndex: enemy.actions[0]?.cycle ? 0 : randomIndex(enemy.actions.length, random),
      discardPileIndex: undefined,
      firstActionCompleted: enemy.firstActionCompleted ?? false,
    };
  });
}

export function getSewerEncounterLabel(encounterIndex: number) {
  const safeIndex = Math.max(0, Math.min(SEWER_ENCOUNTERS.length - 1, Math.floor(encounterIndex)));
  const encounter = SEWER_ENCOUNTERS[safeIndex];
  return encounter.length > 1 && encounter.every((enemy) => enemy.name === encounter[0].name)
    ? `${encounter[0].name} ${encounter.length}마리`
    : encounter[0].name;
}

export function actionSummary(action: EnemyAction, strength: number, forceMagic = false) {
  const parts = action.attacks.flatMap((attack) => {
    const type = forceMagic ? "magic" : attack.type;
    const label = type === "magic" ? "마법 피해" : "피해";
    const total = attack.value + strength;
    return Array.from({ length: attack.hits ?? 1 }, () => `${label} ${total}`);
  });
  if (action.strengthGain) parts.push(`힘 ${action.strengthGain} 획득`);
  if (action.blockGain) parts.push(`방어 ${action.blockGain} 획득`);
  if (action.boonGain) parts.push(`가호 ${action.boonGain} 획득`);
  if (action.strengthLoss) parts.push(`플레이어 힘 ${action.strengthLoss} 감소`);
  if (action.agilityLoss) parts.push(`플레이어 강인함 ${action.agilityLoss} 감소`);
  if (action.soilCount) parts.push(`모든 파일에 흙 ${action.soilCount}장 놓음`);
  if (action.rockCount) parts.push(`모든 파일에 돌 ${action.rockCount}장 놓음`);
  if (action.nextAttackMagic) parts.push("다음 공격은 마법 속성");
  if (action.physicalVulnerabilityGain) parts.push(`물리 취약 ${action.physicalVulnerabilityGain} 부여`);
  if (action.nextTurnPhysicalVulnerabilityGain) parts.push(`다음 턴 시작 시 물리 취약 ${action.nextTurnPhysicalVulnerabilityGain} 부여`);
  if (action.nextTurnMagicVulnerabilityGain) parts.push(`다음 턴 시작 시 마법 취약 ${action.nextTurnMagicVulnerabilityGain} 부여`);
  if (action.discardCount) parts.push(`버리기 ${action.discardCount}`);
  return parts.join("\n");
}

export function applyPlayerAttack(
  enemy: EnemyState,
  damage: number,
  repetitions: number,
  onThornsHit?: (damage: number) => void,
) {
  let next = enemy;
  for (let hit = 0; hit < repetitions && next.hp > 0; hit += 1) {
    if (next.quicknessReady) {
      next = { ...next, quicknessReady: false };
      continue;
    }
    if (damage > 0 && (next.thorns ?? 0) > 0) onThornsHit?.(next.thorns!);
    if ((next.boon ?? 0) > 0 && damage > 0) {
      next = { ...next, boon: (next.boon ?? 0) - 1 };
      continue;
    }
    if (next.sturdyThreshold > 0 && damage > 0 && damage <= next.sturdyThreshold) {
      next = { ...next, hp: Math.max(0, next.hp - 1) };
      continue;
    }
    // 적 방어는 속성이 없는 단일 방어도다. 플레이어의 모든 공격이 같은 방어를 소모한다.
    const blocked = Math.min(damage, next.physicalBlock);
    next = {
      ...next,
      hp: Math.max(0, next.hp - (damage - blocked)),
      physicalBlock: next.physicalBlock - blocked,
    };
  }
  return next;
}

export function playerAttackThornHits(enemy: EnemyState, damage: number, repetitions: number) {
  const thornHits: number[] = [];
  applyPlayerAttack(enemy, damage, repetitions, (thornDamage) => thornHits.push(thornDamage));
  return thornHits;
}
