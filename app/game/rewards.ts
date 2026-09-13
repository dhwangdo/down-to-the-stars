import {
  BASIC_CARD_POOL,
  DEBUG_ALL_CARD_BLUEPRINTS,
  RARE_CARD_POOL,
  SPECIAL_CARD_POOL,
  STARTER_CARD_POOL,
  createAdrenalineCard,
  createRadianceCard,
  createRelicCard,
  createRockCard,
  createSlimeCard,
  createSoilCard,
  type Card,
  type CardBlueprint,
} from "./cards";
import { createDeckName } from "./randomNames";
import { TICKET_TYPES } from "./shopRules";

export type DeckEdition =
  | "clever"
  | "roomy"
  | "lively"
  | "fantastic"
  | "transparent"
  | "golden"
  | "rampaging"
  | "greedy"
  | "frugal";

export type DeckCase = {
  id: string;
  name: string;
  capacity: number;
  cards: Card[];
  editions: DeckEdition[];
  editionColors: Partial<Record<DeckEdition, string>>;
};

export type ConsumableType =
  | "paintTicket"
  | "mindEyeTicket"
  | "bombTicket"
  | "cloneTicket"
  | "extractTicket"
  | "transformTicket"
  | "mapTicket"
  | "cardPack";

export type Consumable = {
  id: string;
  type: ConsumableType;
  name: string;
  description: string;
  armedMovesRemaining?: number;
};

export type ShopOffer = {
  id: string;
  price: number;
  card?: Card;
  consumable?: Consumable;
  sold: boolean;
};

export const STARTING_DECK_SIZE = 16;
export const STARTER_DECK_CAPACITY = 20;
export const DEBUG_ALL_CARDS_DECK_ID = "debug-all-cards";

export const CONSUMABLE_TYPES: ConsumableType[] = [...TICKET_TYPES];

export function consumableTypeFromRoll(roll: number) {
  const weightedTypes = CONSUMABLE_TYPES.map((type) => ({
    type,
    weight: type === "cloneTicket" ? .25 : 1,
  }));
  const totalWeight = weightedTypes.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.max(0, Math.min(.999999999, roll)) * totalWeight;
  for (const item of weightedTypes) {
    cursor -= item.weight;
    if (cursor < 0) return item.type;
  }
  return weightedTypes.at(-1)!.type;
}

export function createBattleRewardCard(id: number, rareChance: number): Card {
  const roll = Math.random();
  if (roll < rareChance) {
    const selected = RARE_CARD_POOL[Math.floor(Math.random() * RARE_CARD_POOL.length)];
    return { ...selected, id, revealed: false };
  }
  const nonRareRoll = Math.random();
  const pool = nonRareRoll < 0.3 / 0.95 ? BASIC_CARD_POOL : SPECIAL_CARD_POOL;
  const selected = pool[Math.floor(Math.random() * pool.length)];
  return { ...selected, id, revealed: false };
}

export function createDeck(): Card[] {
  const make = (
    count: number,
    blueprint: CardBlueprint,
  ) => Array.from({ length: count }, () => ({ ...blueprint }));
  const starterSpecialNames = ["전투 교본", "자와 컴퍼스", "기회 창출", "별의 장막", "타격"];
  const starterSpecialCards = starterSpecialNames.map((name) => {
    const blueprint = SPECIAL_CARD_POOL.find((card) => card.name === name)
      ?? STARTER_CARD_POOL.find((card) => card.name === name)
      ?? BASIC_CARD_POOL.find((card) => card.name === name);
    if (!blueprint) throw new Error(`Missing starting card: ${name}`);
    return blueprint;
  });
  const blueprints: CardBlueprint[] = [
    ...make(5, STARTER_CARD_POOL[0]),
    ...make(4, STARTER_CARD_POOL[1]),
    ...make(2, STARTER_CARD_POOL[2]),
    ...starterSpecialCards,
  ];
  if (blueprints.length !== STARTING_DECK_SIZE) {
    throw new Error(`Starting deck must contain ${STARTING_DECK_SIZE} cards.`);
  }
  return blueprints.map((card, id) => ({ ...card, id, revealed: false }));
}

export function createDebugAllCardsDeck(startId: number): { deck: DeckCase; nextCardId: number } {
  let nextCardId = startId;
  const cards = [
    ...DEBUG_ALL_CARD_BLUEPRINTS.map((blueprint) => ({ ...blueprint, id: nextCardId++, revealed: false })),
    { ...createAdrenalineCard(), id: nextCardId++, revealed: false },
    createRadianceCard(nextCardId++),
    createSlimeCard(nextCardId++),
    createSoilCard(nextCardId++),
    createRockCard(nextCardId++),
    createRelicCard(nextCardId++),
  ];
  return {
    deck: {
      id: DEBUG_ALL_CARDS_DECK_ID,
      name: "ALL",
      capacity: cards.length,
      cards,
      editions: [],
      editionColors: {},
    },
    nextCardId,
  };
}

export const DECK_EDITION_INFO: Record<DeckEdition, { name: string; description: string }> = {
  clever: { name: "똑똑한", description: "전투 시작 시 ★을 추가로 2개 얻습니다." },
  roomy: { name: "널널한", description: "전투 시작 시 빈 파일을 추가로 하나 가집니다." },
  lively: { name: "활발한", description: "전투 시작 시 아드레날린 카드를 손에 넣습니다." },
  fantastic: { name: "환상적인", description: "파일을 4장씩 쌓고, 덱 최대 장수가 10% 줄어듭니다." },
  transparent: { name: "투명한", description: "파일 생성 시 첫 번째 파일의 카드를 모두 앞면으로 놓습니다." },
  golden: { name: "황금의", description: "모든 희귀 카드를 앞면으로 놓습니다." },
  rampaging: { name: "폭주하는", description: "턴 시작 에너지가 1 증가하고, 덱 최대 장수가 20% 줄어듭니다." },
  greedy: { name: "탐욕스러운", description: "전투 보상으로 얻는 골드가 2배가 됩니다." },
  frugal: { name: "알뜰한", description: "턴 종료 시 남은 에너지를 ★로 전환합니다." },
};

const EDITION_COLORS = ["#c63f3f", "#ba741d", "#4378c7", "#7650ae", "#21825f", "#bd3f7a"];

export function rollDeckEditions(initialChance = 0.5): DeckEdition[] {
  const remaining = Object.keys(DECK_EDITION_INFO) as DeckEdition[];
  const editions: DeckEdition[] = [];
  let chance = initialChance;
  while (remaining.length > 0 && Math.random() < chance) {
    const index = Math.floor(Math.random() * remaining.length);
    editions.push(remaining.splice(index, 1)[0]);
    chance -= 0.2;
  }
  return editions;
}

export function createEditionColors(editions: DeckEdition[]) {
  return Object.fromEntries(editions.map((edition) => [
    edition,
    EDITION_COLORS[Math.floor(Math.random() * EDITION_COLORS.length)],
  ])) as Partial<Record<DeckEdition, string>>;
}

export function createStarterDeck(): DeckCase {
  return { id: "starter", name: "", capacity: STARTER_DECK_CAPACITY, cards: createDeck(), editions: [], editionColors: {} };
}

function rollDeckTier(regionNumber: number) {
  return regionNumber;
}

export function createRandomDeck(regionNumber: number, startId: number, editionBonus = 0, capacityBonus = 0): DeckCase {
  const tier = rollDeckTier(regionNumber);
  const editions = rollDeckEditions(Math.min(1, 0.5 + editionBonus));
  const capacityReduction = (editions.includes("fantastic") ? 0.1 : 0)
    + (editions.includes("rampaging") ? 0.2 : 0);
  const capacity = Math.round((20 + tier * 5) * (1 - capacityReduction)) + capacityBonus;
  const cards: Card[] = [];
  let nextId = startId;
  for (let slot = 0; slot < capacity; slot += 1) {
    const roll = Math.random();
    let pool: CardBlueprint[] | null = null;
    if (roll < 0.35) pool = null;
    else if (roll < 0.5) pool = STARTER_CARD_POOL;
    else if (roll < 0.7) pool = BASIC_CARD_POOL;
    else if (roll < 0.98) pool = SPECIAL_CARD_POOL;
    else pool = RARE_CARD_POOL;
    if (!pool) continue;
    const blueprint = pool[Math.floor(Math.random() * pool.length)];
    cards.push({ ...blueprint, id: nextId, revealed: false });
    nextId += 1;
  }
  return {
    id: `found-r${regionNumber}-${startId}-${Math.random().toString(36).slice(2, 8)}`,
    name: createDeckName(),
    capacity,
    cards,
    editions,
    editionColors: createEditionColors(editions),
  };
}

export function createConsumable(type: ConsumableType, id: string): Consumable {
  if (type === "mindEyeTicket") {
    return { id, type, name: "심안 티켓", description: "20번 이동하는 동안 9×9 시야를 얻습니다." };
  }
  if (type === "bombTicket") {
    return { id, type, name: "폭탄 티켓", description: "점화한 뒤 바닥에 내려놓으면 3번 이동 후 폭발합니다." };
  }
  if (type === "cloneTicket") {
    return { id, type, name: "복제 티켓", description: "카드나 티켓 하나를 복제합니다." };
  }
  if (type === "extractTicket") {
    return { id, type, name: "추출 티켓", description: "장소와 관계없이 덱에서 카드 1장을 추출합니다." };
  }
  if (type === "transformTicket") {
    return { id, type, name: "변환 티켓", description: "카드는 같은 희귀도의 다른 카드로, 티켓은 티어와 관계없이 다른 무작위 티켓으로 바꿉니다." };
  }
  if (type === "mapTicket") {
    return { id, type, name: "지도 티켓", description: "같은 지역에서 가까운 상점·추출의 성소·건강의 성소 2곳을 밝힙니다." };
  }
  if (type === "cardPack") {
    return { id, type, name: "카드 팩", description: "카드 5개를 얻습니다." };
  }
  return {
    id,
    type,
    name: "색칠 티켓",
    description: "카드 앞면은 유지하고 뒷면을 무지개색으로 칠합니다.",
  };
}

export function createBattleReward(
  regionNumber: number,
  nextCardId: number,
  deckDropChance: number,
  ticketBonus = 0,
  editionBonus = 0,
  capacityBonus = 0,
  rareCardChance = 0.05,
) {
  const gold = 15 + Math.floor(Math.random() * 16);
  const decks = Math.random() < deckDropChance
    ? [createRandomDeck(regionNumber, nextCardId, editionBonus, capacityBonus)]
    : [];
  const consumableType = Math.random() < Math.min(1, 0.5 + ticketBonus)
    ? consumableTypeFromRoll(Math.random())
    : null;
  return {
    gold,
    cards: decks.length > 0 ? [] : [createBattleRewardCard(nextCardId, rareCardChance)],
    decks,
    consumableType,
    consumableTypes: consumableType ? [consumableType] : [],
  };
}

export function createBossBattleReward(nextCardId: number) {
  return {
    gold: 80 + Math.floor(Math.random() * 21),
    cards: [createBattleRewardCard(nextCardId, 1)],
    decks: [] as DeckCase[],
    consumableType: null,
    consumableTypes: Array.from({ length: 2 }, () => consumableTypeFromRoll(Math.random())),
  };
}
