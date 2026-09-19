export type CardKind = "strike" | "skill";
export type DamageType = "physical" | "magic";
export type CardRarity = "status" | "starter" | "basic" | "special" | "rare" | "legendary";
export type SolitaireRule = "top" | "bottom" | "spell";

export type CardEffect =
  | "strike"
  | "pommel"
  | "defend"
  | "deflect"
  | "steelHeart"
  | "battlePlan"
  | "prepare"
  | "sweep"
  | "drawEachPile"
  | "dash"
  | "focus"
  | "adrenaline"
  | "rulerCompass"
  | "quickStep"
  | "suppression"
  | "starArk"
  | "massDeal"
  | "sturdyStance"
  | "obsidianDagger"
  | "astronomyResearch"
  | "necromancyResearch"
  | "metallurgyResearch"
  | "economicsResearch"
  | "opticsResearch"
  | "lawResearch"
  | "radiance"
  | "lightCluster"
  | "largePrism"
  | "mirrorImage"
  | "blessing"
  | "odinSpear"
  | "berserk"
  | "transcend"
  | "rapidFire"
  | "iceShield"
  | "ironWave"
  | "waterWave"
  | "ironRampage"
  | "magicStrike"
  | "shockwave"
  | "ventilate"
  | "plateArmor"
  | "plateArmorDefense"
  | "elimination"
  | "warmUp"
  | "ironWall"
  | "fourHit"
  | "doubleHit"
  | "starlight"
  | "augment"
  | "fileDraw"
  | "starGuard"
  | "charge"
  | "weaponSharpen"
  | "armorSharpen"
  | "boomerang"
  | "meteor"
  | "counter"
  | "exchange"
  | "flood"
  | "endStart"
  | "superStrategist"
  | "slime"
  | "relic"
  | "soil"
  | "rock"
  | "supernova"
  | "combatManual"
  | "grimoire"
  | "horologium"
  | "ophiuchus"
  | "aries"
  | "hydra"
  | "orion"
  | "cassiopeia";

export type Card = {
  id: number;
  kind: CardKind;
  effect: CardEffect;
  rarity: CardRarity;
  name: string;
  /** Energy cost. Undefined means this card has no energy cost and is not a zero-cost card. */
  cost?: number;
  /** The cost before a battle-long forge change. */
  baseCost?: number;
  value: number;
  draw: number;
  /** 방어 카드가 제공하는 방어 종류. 공격 카드에는 전투 속성으로 사용하지 않는다. */
  damageType: DamageType;
  revealed: boolean;
  drawSlot?: number;
  drawSlotCount?: number;
  colored?: boolean;
  solitaireRule?: SolitaireRule;
  forgeCost?: number;
  forgeCosts?: number[];
  /** 흑요석 단검의 누적 재련 단계 기록. */
  forgeCostsCompleted?: number[];
  forgeTargetName?: string;
  forgeAny?: boolean;
  forged?: boolean;
  exhaust?: boolean;
  /** Token cards participate in the current cycle once, then leave on reshuffle. */
  token?: boolean;
  /** Enemy-created cards use enemy-only handling such as pool exclusion. */
  enemyToken?: boolean;
  /** Power-like rule card marker shown on the card face. */
  rule?: boolean;
};

export type CardBlueprint = Omit<Card, "id" | "revealed">;

export const ATTACK_CARD_EFFECTS = new Set<CardEffect>([
  "sweep",
  "doubleHit",
  "ironRampage",
  "magicStrike",
  "shockwave",
  "meteor",
  "hydra",
]);

export function isAttackCard(card: { kind: CardKind; effect: CardEffect }) {
  return card.kind === "strike" || ATTACK_CARD_EFFECTS.has(card.effect);
}

export const HAND_PASSIVE_EFFECTS = new Set<CardEffect>(["combatManual", "grimoire"]);
export const UNPLAYABLE_CARD_EFFECTS = new Set<CardEffect>(["slime", "soil", "rock", "combatManual", "grimoire"]);

export const STARTER_CARD_POOL: CardBlueprint[] = [
  { kind: "strike", effect: "strike", rarity: "starter", name: "타격", cost: 1, value: 6, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "defend", rarity: "starter", name: "방어", cost: 1, value: 5, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "defend", rarity: "starter", name: "마법 방어", cost: 1, value: 5, draw: 0, damageType: "magic" },
];

export const BASIC_CARD_POOL: CardBlueprint[] = [
  { kind: "strike", effect: "strike", rarity: "basic", name: "잽", cost: 0, value: 6, draw: 0, damageType: "physical" },
  { kind: "strike", effect: "rulerCompass", rarity: "basic", name: "자와 컴퍼스", cost: 1, value: 9, draw: 0, damageType: "physical" },
  { kind: "strike", effect: "strike", rarity: "basic", name: "기회 포착", cost: 1, value: 6, draw: 1, damageType: "physical" },
  { kind: "skill", effect: "deflect", rarity: "basic", name: "기회 창출", cost: 1, value: 5, draw: 1, damageType: "physical" },
  { kind: "skill", effect: "sweep", rarity: "basic", name: "휩쓸기", cost: 1, value: 9, draw: 0, damageType: "physical" },
  { kind: "strike", effect: "boomerang", rarity: "basic", name: "정리 타격", cost: 1, value: 9, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "waterWave", rarity: "basic", name: "물의 파동", cost: 1, value: 5, draw: 1, damageType: "magic" },
  { kind: "skill", effect: "starGuard", rarity: "basic", name: "별의 장막", cost: 2, value: 12, draw: 0, damageType: "physical" },
];

export const LEGACY_SPECIAL_CARD_POOL: CardBlueprint[] = [
  { kind: "strike", effect: "ironRampage", rarity: "special", name: "무쇠 난동", cost: 2, value: 8, draw: 0, damageType: "physical" },
];

// 현재 플레이에 등장하는 추가 카드는 이 목록만 사용합니다.
export const SPECIAL_CARD_POOL: CardBlueprint[] = [
  { kind: "skill", effect: "astronomyResearch", rarity: "special", name: "천문학 연구", cost: 1, value: 3, draw: 0, damageType: "physical", forgeCost: 2, exhaust: true, rule: true },
  { kind: "skill", effect: "necromancyResearch", rarity: "special", name: "강령학 연구", cost: 1, value: 3, draw: 0, damageType: "physical", forgeCost: 2, exhaust: true, rule: true },
  { kind: "skill", effect: "metallurgyResearch", rarity: "special", name: "금속학 연구", cost: 1, value: 1, draw: 0, damageType: "physical", exhaust: true, rule: true },
  { kind: "skill", effect: "lightCluster", rarity: "special", name: "빛무리", cost: 1, value: 1, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "largePrism", rarity: "special", name: "대형 프리즘", cost: 3, value: 3, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "warmUp", rarity: "special", name: "준비 운동", cost: 0, value: 4, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "starlight", rarity: "special", name: "별빛", cost: 0, value: 2, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "iceShield", rarity: "special", name: "얼음 방패", cost: 1, value: 11, draw: 0, damageType: "magic" },
  { kind: "strike", effect: "fourHit", rarity: "special", name: "4연격", cost: 1, value: 2, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "battlePlan", rarity: "special", name: "전략가", cost: 1, value: 2, draw: 1, damageType: "physical" },
  { kind: "skill", effect: "plateArmor", rarity: "special", name: "낡은 노심", cost: 0, value: 1, draw: 0, damageType: "physical", forgeCost: 3, exhaust: true },
  { kind: "skill", effect: "plateArmorDefense", rarity: "special", name: "판금 갑옷", cost: 1, value: 8, draw: 0, damageType: "physical", forgeCost: 3 },
  { kind: "skill", effect: "elimination", rarity: "special", name: "소거법", cost: 1, value: 0, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "weaponSharpen", rarity: "special", name: "무기 연마", cost: 1, value: 2, draw: 0, damageType: "physical", exhaust: true },
  { kind: "skill", effect: "armorSharpen", rarity: "special", name: "방어구 연마", cost: 1, value: 2, draw: 0, damageType: "physical", exhaust: true },
  { kind: "skill", effect: "dash", rarity: "special", name: "질주", cost: 1, value: 0, draw: 0, damageType: "physical", forgeCost: 3 },
  { kind: "skill", effect: "quickStep", rarity: "special", name: "퀵스텝", cost: 1, value: 0, draw: 2, damageType: "physical" },
{ kind: "strike", effect: "suppression", rarity: "special", name: "진압", cost: 3, value: 13, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "starArk", rarity: "special", name: "별의 방주", cost: 3, value: 10, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "counter", rarity: "special", name: "응수", cost: 0, value: 0, draw: 0, damageType: "physical" },
  { kind: "strike", effect: "strike", rarity: "special", name: "묵직한 한 방", cost: 3, value: 30, draw: 0, damageType: "physical" },
  { kind: "strike", effect: "exchange", rarity: "special", name: "치환 합금", cost: 3, value: 15, draw: 0, damageType: "physical", forgeAny: true },
  { kind: "strike", effect: "doubleHit", rarity: "special", name: "청동 철퇴", cost: 2, value: 15, draw: 0, damageType: "physical", forgeCosts: [2, 3] },
  { kind: "skill", effect: "ironWall", rarity: "special", name: "철벽", cost: 2, value: 2, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "combatManual", rarity: "special", name: "전투 교본", value: 2, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "mirrorImage", rarity: "special", name: "거울상", cost: 0, value: 0, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "blessing", rarity: "special", name: "가호", cost: 1, value: 1, draw: 0, damageType: "magic", forgeCost: 2 },
];

export const RARE_CARD_POOL: CardBlueprint[] = [
  { kind: "strike", effect: "obsidianDagger", rarity: "rare", name: "흑요석 단검", cost: 0, value: 1, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "steelHeart", rarity: "rare", name: "강철심장", cost: 1, value: 2, draw: 0, damageType: "physical", exhaust: true },
  { kind: "skill", effect: "rapidFire", rarity: "rare", name: "연사", cost: 0, value: 0, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "superStrategist", rarity: "rare", name: "전술가", cost: 1, value: 5, draw: 0, damageType: "physical", exhaust: true },
  { kind: "skill", effect: "grimoire", rarity: "rare", name: "마도서", value: 1, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "supernova", rarity: "rare", name: "초신성", cost: 0, value: 3, draw: 0, damageType: "physical", exhaust: true },
  { kind: "strike", effect: "meteor", rarity: "rare", name: "유성우", cost: 2, value: 7, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "massDeal", rarity: "rare", name: "대분배", cost: 1, value: 0, draw: 0, damageType: "physical", forgeCost: 3, exhaust: true, rule: true },
  { kind: "skill", effect: "sturdyStance", rarity: "rare", name: "견고한 태세", cost: 2, value: 0, draw: 0, damageType: "physical", exhaust: true, rule: true },
  { kind: "skill", effect: "lawResearch", rarity: "rare", name: "법학 연구", cost: 2, value: 1, draw: 0, damageType: "physical", exhaust: true, rule: true },
  { kind: "skill", effect: "economicsResearch", rarity: "rare", name: "경제학 연구", cost: 2, value: 3, draw: 0, damageType: "physical", exhaust: true, rule: true },
  { kind: "skill", effect: "opticsResearch", rarity: "rare", name: "광학 연구", cost: 1, value: 1, draw: 0, damageType: "physical", exhaust: true, rule: true },
  { kind: "strike", effect: "odinSpear", rarity: "rare", name: "오딘의 창", cost: 6, value: 40, draw: 0, damageType: "physical" },
];

export const LEGENDARY_CARD_POOL: CardBlueprint[] = [
  { kind: "skill", effect: "horologium", rarity: "legendary", name: "호롤로지움", cost: 0, value: 1, draw: 0, damageType: "physical", exhaust: true },
  { kind: "skill", effect: "ophiuchus", rarity: "legendary", name: "오피쿠우스", cost: 1, value: 5, draw: 0, damageType: "physical", exhaust: true },
  { kind: "skill", effect: "aries", rarity: "legendary", name: "아리에스", cost: 0, value: 5, draw: 0, damageType: "physical", exhaust: true },
  { kind: "strike", effect: "hydra", rarity: "legendary", name: "히드라", cost: 2, value: 9, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "orion", rarity: "legendary", name: "오리온", cost: 1, value: 10, draw: 0, damageType: "physical", exhaust: true },
  { kind: "skill", effect: "cassiopeia", rarity: "legendary", name: "카시오페이아", cost: -3, value: 0, draw: 0, damageType: "physical" },
];

function uniqueCardBlueprints(pools: CardBlueprint[][]) {
  const seen = new Set<string>();
  return pools.flat().filter((card) => {
    const key = `${card.name}|${card.effect}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const ALL_CARD_BLUEPRINTS = uniqueCardBlueprints([
  STARTER_CARD_POOL,
  BASIC_CARD_POOL,
  LEGACY_SPECIAL_CARD_POOL,
  SPECIAL_CARD_POOL,
  RARE_CARD_POOL,
  LEGENDARY_CARD_POOL,
]);

export const DEBUG_ALL_CARD_BLUEPRINTS: CardBlueprint[] = ALL_CARD_BLUEPRINTS;
export const DEBUG_CARD_RARITIES: Array<{ rarity: CardRarity; label: string }> = [
  { rarity: "starter", label: "시작 카드" },
  { rarity: "basic", label: "일반 카드" },
  { rarity: "special", label: "특별 카드" },
  { rarity: "rare", label: "희귀 카드" },
  { rarity: "legendary", label: "전설 카드" },
];

export const CARD_POOL_DRAW_EFFECTS = new Set<CardEffect>([
  "pommel", "deflect", "prepare", "drawEachPile", "dash", "quickStep", "battlePlan", "fileDraw", "flood", "adrenaline", "astronomyResearch", "necromancyResearch",
]);
export const CARD_POOL_ENERGY_EFFECTS = new Set<CardEffect>([
  "focus", "adrenaline", "berserk", "ventilate", "plateArmor", "charge", "flood", "endStart", "supernova", "aries", "economicsResearch",
]);
export const CARD_POOL_DEFENSE_EFFECTS = new Set<CardEffect>([
  "defend", "deflect", "iceShield", "waterWave", "plateArmorDefense", "starGuard", "starArk", "ironWall", "ironWave", "ironRampage", "suppression", "odinSpear",
]);
export const CARD_POOL_STAR_EFFECTS = new Set<CardEffect>([
  "battlePlan", "rulerCompass", "starlight", "starGuard", "starArk", "superStrategist", "flood", "aries", "astronomyResearch", "necromancyResearch", "elimination",
]);
export const CARD_POOL_STATUS_EFFECTS = new Set<CardEffect>([
  "steelHeart", "warmUp", "rapidFire", "counter", "weaponSharpen", "armorSharpen", "supernova", "blessing", "mirrorImage",
]);

type DefenseCardLike = Pick<CardBlueprint, "effect" | "damageType">;

export function cardGivesPhysicalDefense(card: DefenseCardLike) {
  if (card.effect === "defend") return card.damageType === "physical";
  return ["deflect", "starGuard", "plateArmorDefense", "ironWall", "ironWave", "ironRampage", "suppression", "starArk", "odinSpear"].includes(card.effect);
}

export function cardGivesMagicDefense(card: DefenseCardLike) {
  if (card.effect === "defend") return card.damageType === "magic";
  return ["iceShield", "waterWave", "starArk"].includes(card.effect);
}

export function createAdrenalineCard(): Card {
  return {
    id: -1,
    kind: "skill",
    effect: "adrenaline",
    rarity: "rare",
    name: "아드레날린",
    cost: 0,
    value: 1,
    draw: 2,
    damageType: "physical",
    revealed: true,
    exhaust: true,
  };
}

export function createRadianceCard(id: number): Card {
  return {
    id,
    kind: "strike",
    effect: "radiance",
    rarity: "status",
    name: "광채",
    cost: 0,
    value: 4,
    draw: 0,
    damageType: "physical",
    revealed: true,
    token: true,
  };
}

export function createSlimeCard(id: number): Card {
  return {
    id,
    kind: "skill",
    effect: "slime",
    rarity: "status",
    name: "유독성 점액",
    value: 1,
    draw: 0,
    damageType: "magic",
    revealed: true,
    token: true,
    enemyToken: true,
  };
}

export function createSoilCard(id: number): Card {
  return {
    id,
    kind: "skill",
    effect: "soil",
    rarity: "status",
    name: "흙",
    value: 0,
    draw: 0,
    damageType: "physical",
    revealed: false,
    token: true,
    enemyToken: true,
  };
}

export function createRockCard(id: number): Card {
  return {
    id,
    kind: "skill",
    effect: "rock",
    rarity: "status",
    name: "돌",
    value: 0,
    draw: 0,
    damageType: "physical",
    revealed: false,
    token: true,
    enemyToken: true,
  };
}

export function createRelicCard(id: number): Card {
  return {
    id,
    kind: "skill",
    effect: "relic",
    rarity: "status",
    name: "유물",
    cost: 0,
    value: 4,
    draw: 0,
    damageType: "physical",
    revealed: true,
    token: true,
    enemyToken: true,
  };
}
