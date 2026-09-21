import {
  CARD_POOL_ENERGY_EFFECTS,
  CARD_POOL_STAR_EFFECTS,
  UNPLAYABLE_CARD_EFFECTS,
  isAttackCard,
  type Card,
  type CardBlueprint,
} from "./cards";

export const IRON_WALL_COST = 2;
export const IRON_WALL_RESISTANCE = 2;

export type CardKeywordInfo = {
  name: string;
  description?: string;
  preview?: "radiance";
};

export function cardForgeCount(card: Pick<Card, "forged" | "forgeCostsCompleted">) {
  return card.forgeCostsCompleted?.length ?? (card.forged ? 1 : 0);
}

export function forgeConditionText(card: Pick<Card, "forgeCost" | "forgeCosts" | "forgeTargetName" | "forgeAny">) {
  if (card.forgeTargetName) return `[${card.forgeTargetName}]`;
  if (card.forgeAny) return "[아무거나]";
  const costs = card.forgeCosts ?? (card.forgeCost === undefined ? [] : [card.forgeCost]);
  if (costs.length <= 1) return `[${costs[0]}코스트]`;
  return `[${costs.slice(0, -1).join(", ")} 또는 ${costs[costs.length - 1]}코스트]`;
}

export function cardEnergyCost(
  card: Pick<Card, "effect" | "cost" | "rule">,
  lawResearchCount = 0,
  forgeCount = 0,
): number | undefined {
  const baseCost = card.cost;
  if (baseCost === undefined) return undefined;
  const ruleReduction = card.rule ? lawResearchCount : 0;
  const forgeReduction = card.effect === "odinSpear" ? forgeCount : 0;
  const adjustedCost = baseCost - ruleReduction - forgeReduction;
  // 룰 카드만 법학 연구의 하한(0)을 적용한다. 전설 카드 카시오페이아처럼
  // 기본 비용이 음수인 일반 카드는 음수 비용을 그대로 표시·처리한다.
  return card.rule ? Math.max(0, adjustedCost) : adjustedCost;
}

export function cardPoolCost(card: CardBlueprint) {
  return UNPLAYABLE_CARD_EFFECTS.has(card.effect)
    ? -1
    : card.effect === "ironWall" ? IRON_WALL_COST : card.cost ?? -1;
}

export function cardPoolShare(count: number, total: number) {
  return total === 0 ? "0.0%" : `${(count / total * 100).toFixed(1)}%`;
}

const CARD_KEYWORD_DESCRIPTIONS: Record<string, string> = {
  "룰": "전투 동안 지속되는 규칙을 추가합니다. 사용 시 이번 전투 동안 카드가 사라집니다.",
  "소멸": "사용 시 이번 전투 동안 사라집니다.",
  "토큰": "전투 도중 생성된 카드입니다. 사용하면 사라지고, 사용하지 않은 채 버려져도 사라집니다.",
  "재련": "조건을 만족하는 카드 위에 놓으면 강화 효과가 적용됩니다. 강화 효과는 전투 동안 유지됩니다.",
  "주문": "비용이 1 높은 주문 카드 위에 놓을 수 있습니다.",
  "사용 불가": "손패에서 사용할 수 없습니다. 옮길 수는 있습니다.",
  "★": "솔리테어 행동 자원입니다. 사용하여 손패에서 파일로, 혹은 파일에서 다른 파일로 카드를 옮길 수 있습니다. 턴이 끝나도 사라지지 않습니다.",
  "에너지": "카드를 사용하는 데 필요한 자원입니다. 플레이어 턴 시작 시 최대 에너지만큼 회복되며 최대치를 넘지 않습니다.",
  "힘": "힘 X는 피해를 X만큼 증가시킵니다.",
  "강인함": "강인함 X는 방어와 마법 방어 획득량을 X만큼 증가시킵니다.",
  "물리 저항": "받는 물리 피해가 절반이 됩니다. (소수점은 버립니다.)",
  "마법 저항": "받는 마법 피해가 절반이 됩니다. (소수점은 버립니다.)",
  "물리 취약": "받는 물리 피해가 2배가 됩니다.",
  "마법 취약": "받는 마법 피해가 2배가 됩니다.",
  "면역": "지속 중에는 피해를 받지 않습니다.",
};

const CARD_KEYWORD_PREVIEWS: Record<string, CardKeywordInfo["preview"]> = {
  "광채": "radiance",
};

export function getCardKeywordInfos(card: Card): CardKeywordInfo[] {
  const keywords: string[] = [];
  const add = (keyword: string) => {
    if (!keywords.includes(keyword)) keywords.push(keyword);
  };
  if (card.rule) add("룰");
  if (card.exhaust && !card.rule) add("소멸");
  if (card.token) add("토큰");
  if (card.effect === "obsidianDagger" || card.effect === "odinSpear" || (
    !["astronomyResearch", "necromancyResearch"].includes(card.effect)
    && (card.forgeCost !== undefined || card.forgeCosts?.length || card.forgeTargetName || card.forgeAny)
  )) add("재련");
  if (card.solitaireRule === "spell") add("주문");
  if (UNPLAYABLE_CARD_EFFECTS.has(card.effect)) add("사용 불가");
  // 흙은 생성 경로와 무관하게 두 키워드를 항상 노출한다.
  if (card.effect === "soil") {
    add("사용 불가");
    add("토큰");
  }
  if (CARD_POOL_ENERGY_EFFECTS.has(card.effect)) add("에너지");
  if (card.effect === "obsidianDagger") add("소멸");
  if (card.effect === "steelHeart" || card.effect === "ironWall" || card.effect === "plateArmorDefense") add("물리 저항");
  if (card.effect === "steelHeart") add("마법 저항");
  if (card.effect === "blessing") add("마법 저항");
  if (card.effect === "berserk") add("물리 취약");
  if (card.effect === "transcend") add("면역");
  if (CARD_POOL_STAR_EFFECTS.has(card.effect) || ["grimoire", "meteor", "supernova"].includes(card.effect)) add("★");
  if (["warmUp", "weaponSharpen", "augment", "orion", "combatManual", "relic", "transcend"].includes(card.effect)) add("힘");
  if (["augment", "armorSharpen", "combatManual"].includes(card.effect)) add("강인함");
  if (["radiance", "lightCluster", "largePrism", "opticsResearch", "nebula", "lightTravelTime"].includes(card.effect)) add("광채");
  return keywords
    .map((name) => ({
      name,
      description: CARD_KEYWORD_DESCRIPTIONS[name],
      preview: CARD_KEYWORD_PREVIEWS[name],
    }))
    .filter((keyword) => Boolean(keyword.description || keyword.preview));
}

export function isRuleMatchedPlacement(movingCard: Card, targetCard?: Card) {
  if (movingCard.solitaireRule === "top") return targetCard?.solitaireRule === "bottom";
  if (movingCard.solitaireRule === "spell") {
    return movingCard.cost !== undefined
      && targetCard?.solitaireRule === "spell"
      && targetCard.cost === movingCard.cost + 1;
  }
  return false;
}

export function canPlaceBySolitaireRule(movingCard: Card, targetCard?: Card) {
  if (movingCard.solitaireRule === "top" || movingCard.solitaireRule === "spell") {
    return isRuleMatchedPlacement(movingCard, targetCard);
  }
  return true;
}

export function canForgeCardOnto(movingCard: Card, targetCard?: Card, lawResearchCount = 0, forgeCount = 0) {
  if (movingCard.effect === "astronomyResearch" || movingCard.effect === "necromancyResearch") return false;
  if (!targetCard) return false;
  if (movingCard.effect === "obsidianDagger") {
    return isAttackCard(targetCard);
  }
  const targetCost = cardEnergyCost(targetCard, lawResearchCount, forgeCount);
  if (movingCard.forged) return false;
  return (targetCost !== undefined && movingCard.forgeCost !== undefined && movingCard.forgeCost === targetCost)
    || (targetCost !== undefined && movingCard.forgeCosts?.includes(targetCost))
    || movingCard.forgeAny === true
    || (movingCard.forgeTargetName !== undefined && movingCard.forgeTargetName === targetCard.name);
}

// A spell straight is read from the top of a pile: X, X+1, X+2.
// The array is returned in firing order (top card first).
export function getSpellStraight(pile: Card[]) {
  if (pile.length < 3) return null;
  const cards = pile.slice(-3).reverse();
  const [topCard, middleCard, bottomCard] = cards;
  if (!topCard || !middleCard || !bottomCard) return null;
  if (![topCard, middleCard, bottomCard].every((card) => card.solitaireRule === "spell")) return null;
  if (topCard.cost === undefined || middleCard.cost === undefined || bottomCard.cost === undefined) return null;
  if (middleCard.cost !== topCard.cost + 1) return null;
  if (bottomCard.cost !== middleCard.cost + 1) return null;
  return cards;
}

// 범람(4) 위에 3, 2, 1코스트가 차례로 쌓인 피라미드.
export function getFloodPyramid(pile: Card[]) {
  if (pile.length < 4) return null;
  const cards = pile.slice(-4);
  if (cards[0].effect !== "flood" || cards[0].cost !== 4) return null;
  return cards[1].cost === 3 && cards[2].cost === 2 && cards[3].cost === 1 ? cards : null;
}
