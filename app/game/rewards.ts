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
} from "./cards.ts";
import { createDeckName } from "./randomNames.ts";
import { TICKET_TIERS, TICKET_TYPES, type TicketType } from "./shopRules.ts";

export type DeckEdition =
  | "clever"
  | "roomy"
  | "lively"
  | "fantastic"
  | "transparent"
  | "golden"
  | "rampaging"
  | "greedy"
  | "frugal"
  | "drawPlus"
  | "starPlus"
  | "energyPlus"
  | "persistentDraw"
  | "frugalPlus"
  | "defensiveStance"
  | "firepower"
  | "growth"
  | "resistance"
  | "giant"
  | "whiteSpace"
  | "invincible"
  | "hammering"
  | "deckHighlander"
  | "starFive"
  | "energyThree";

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
  | "darkTicket"
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

export const CONSUMABLE_TYPES: TicketType[] = [...TICKET_TYPES];

export function consumableTypeFromRoll(roll: number) {
  const weightedTypes = CONSUMABLE_TYPES.map((type) => ({
    type,
    weight: 0.5 ** (TICKET_TIERS[type] - 1),
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
  clever: { name: "별++", description: "전투 시작 시 ★ 2개를 획득합니다." },
  roomy: { name: "추가 파일", description: "전투 시작 시 빈 파일을 1개 추가합니다." },
  lively: { name: "아드레날린", description: "전투 시작 시 아드레날린 카드를 1장 획득합니다." },
  fantastic: { name: "압축", description: "파일을 4장씩 쌓습니다." },
  transparent: { name: "프리뷰", description: "파일 생성 시 첫 번째 파일의 카드를 모두 앞면으로 배치합니다." },
  golden: { name: "희귀 감지", description: "모든 희귀 카드를 앞면으로 배치합니다." },
  rampaging: { name: "지속 에너지", description: "최대 에너지가 1 증가합니다." },
  greedy: { name: "탐욕", description: "전투 보상으로 얻는 골드가 2배가 됩니다." },
  frugal: { name: "재활용", description: "턴 종료 시 남은 에너지 1당 ★ 1개를 획득합니다." },
  drawPlus: { name: "드로우+", description: "전투 시작 시 무작위 파일에서 카드 1장을 뽑습니다." },
  starPlus: { name: "별+", description: "전투 시작 시 ★ 1개를 획득합니다." },
  energyPlus: { name: "에너지+", description: "전투 시작 시 에너지가 1 증가합니다." },
  persistentDraw: { name: "지속 드로우", description: "매 턴 시작 시 무작위 파일에서 카드 1장을 뽑습니다." },
  frugalPlus: { name: "재활용+", description: "턴 종료 시 남은 에너지 1당 ★ 2개를 획득합니다." },
  defensiveStance: { name: "방호 태세", description: "전투 시작 시 방어도 5를 획득합니다." },
  firepower: { name: "화력", description: "전투 시작 시 힘이 2 증가합니다." },
  growth: { name: "성장", description: "매 턴 시작 시 힘이 1 증가합니다." },
  resistance: { name: "저항", description: "전투 시작 시 물리 저항 1과 마법 저항 1을 획득합니다." },
  giant: { name: "거인", description: "전투 시작 시 힘 3과 강인함 3을 획득합니다." },
  whiteSpace: { name: "여백의 미", description: "현재 빈 파일 하나당 힘 2를 획득합니다." },
  invincible: { name: "무적", description: "전투 시작 시 무적 1을 획득합니다." },
  hammering: { name: "망치질", description: "카드를 재련할 때마다 ★ 1개를 획득합니다." },
  deckHighlander: { name: "하이랜더", description: "전투 시작 시 중복 카드 없이 덱이 가득 차 있으면 최대 에너지가 1 증가합니다." },
  starFive: { name: "별+++++", description: "전투 시작 시 ★ 5개를 획득합니다." },
  energyThree: { name: "에너지+++", description: "전투 시작 시 에너지가 3 증가합니다." },
};

export const DECK_EDITION_SCORES: Record<DeckEdition, number> = {
  clever: 20,
  roomy: 10,
  lively: 50,
  fantastic: 60,
  transparent: 5,
  golden: 5,
  rampaging: 50,
  greedy: 20,
  frugal: 10,
  drawPlus: 10,
  starPlus: 10,
  energyPlus: 20,
  persistentDraw: 40,
  frugalPlus: 40,
  defensiveStance: 5,
  firepower: 20,
  growth: 35,
  resistance: 30,
  giant: 50,
  whiteSpace: 30,
  invincible: 100,
  hammering: 30,
  deckHighlander: 30,
  starFive: 50,
  energyThree: 50,
};

const EDITION_COLORS: Record<DeckEdition, string> = {
  clever: "#ef4444",
  roomy: "#f97316",
  lively: "#eab308",
  fantastic: "#84cc16",
  transparent: "#22c55e",
  golden: "#14b8a6",
  rampaging: "#06b6d4",
  greedy: "#0ea5e9",
  frugal: "#3b82f6",
  drawPlus: "#6366f1",
  starPlus: "#8b5cf6",
  energyPlus: "#a855f7",
  persistentDraw: "#d946ef",
  frugalPlus: "#ec4899",
  defensiveStance: "#f43f5e",
  firepower: "#b91c1c",
  growth: "#f59e0b",
  resistance: "#64748b",
  giant: "#7c3aed",
  whiteSpace: "#115e59",
  invincible: "#be123c",
  hammering: "#c2410c",
  deckHighlander: "#a16207",
  starFive: "#15803d",
  energyThree: "#0f766e",
};

export function getDeckEditionColor(edition: DeckEdition) {
  return EDITION_COLORS[edition];
}

export function getAvailableDeckEditions(selected: readonly DeckEdition[]): DeckEdition[] {
  const selectedSet = new Set(selected);
  const hasRecyclingEdition = selectedSet.has("frugal") || selectedSet.has("frugalPlus");
  return (Object.keys(DECK_EDITION_INFO) as DeckEdition[]).filter((edition) => (
    !selectedSet.has(edition)
      && (!hasRecyclingEdition || (edition !== "frugal" && edition !== "frugalPlus"))
  ));
}

export function createEditionColors(editions: DeckEdition[]) {
  return Object.fromEntries(editions.map((edition) => [
    edition,
    EDITION_COLORS[edition],
  ])) as Partial<Record<DeckEdition, string>>;
}

export function createStarterDeck(): DeckCase {
  return { id: "starter", name: "", capacity: STARTER_DECK_CAPACITY, cards: createDeck(), editions: [], editionColors: {} };
}

export type DeckScoreBreakdown = {
  editionScore: number;
  cardScore: number;
  capacityScore: number;
  total: number;
};

export function calculateDeckCapacityScore(capacity: number) {
  const fiveCardSteps = Math.max(0, Math.floor((capacity - 15) / 5));
  return fiveCardSteps * 13;
}

export function calculateDeckScore(deck: Pick<DeckCase, "capacity" | "cards" | "editions">): DeckScoreBreakdown {
  const editionScore = deck.editions.reduce(
    (total, edition) => total + DECK_EDITION_SCORES[edition],
    0,
  );
  const cardScore = deck.cards.reduce((total, card) => (
    total + (card.rarity === "rare" ? 8 : 0)
  ), 0);
  const capacityScore = calculateDeckCapacityScore(deck.capacity);
  return {
    editionScore,
    cardScore,
    capacityScore,
    total: editionScore + cardScore + capacityScore,
  };
}

const DEBUG_DECK_STARTING_CAPACITY = 15;

function randomItem<T>(pool: T[], random: () => number) {
  const index = Math.min(pool.length - 1, Math.floor(Math.max(0, Math.min(0.999999999, random())) * pool.length));
  return pool[index];
}

function sampleBinomial(trials: number, probability: number, random: () => number) {
  let successes = 0;
  for (let trial = 0; trial < trials; trial += 1) {
    if (random() < probability) successes += 1;
  }
  return successes;
}

function sampleRandomizedBinomialWithMean(mean: number, random: () => number) {
  if (mean <= 0) return 0;
  const expectedTrials = mean * 5;
  const baseTrials = Math.floor(expectedTrials);
  const extraTrialProbability = expectedTrials - baseTrials;
  const trials = baseTrials + (random() < extraTrialProbability ? 1 : 0);
  return sampleBinomial(trials, 1 / 5, random);
}

function sampleGeneralizedPoisson(mean: number, theta: number, random: () => number) {
  if (mean <= 0) return 0;

  // E[X] = lambda / (1 - theta), so choose lambda to preserve the target mean.
  const lambda = mean * (1 - theta);
  const logMasses = [-lambda];
  let logFactorial = 0;
  for (let value = 1; ; value += 1) {
    const shiftedLambda = lambda + theta * value;
    if (shiftedLambda < 0) break;
    if (shiftedLambda === 0 && value > 1) break;
    logFactorial += Math.log(value);
    logMasses.push(
      Math.log(lambda)
      + (value - 1) * Math.log(Math.max(Number.MIN_VALUE, shiftedLambda))
      - shiftedLambda
      - logFactorial,
    );
  }

  const maxLogMass = Math.max(...logMasses);
  const masses = logMasses.map((logMass) => Math.exp(logMass - maxLogMass));
  const totalMass = masses.reduce((total, mass) => total + mass, 0);
  let cursor = Math.max(0, Math.min(0.999999999, random())) * totalMass;
  for (let value = 0; value < masses.length; value += 1) {
    cursor -= masses[value];
    if (cursor < 0) return value;
  }
  return masses.length - 1;
}

type DebugFillerKind = "empty" | "starter" | "basic" | "special";

function createDebugFillerBag(size: number): DebugFillerKind[] {
  return [
    ...Array.from({ length: size * 3 / 8 }, () => "empty" as const),
    ...Array.from({ length: size / 8 }, () => "starter" as const),
    ...Array.from({ length: size / 4 }, () => "basic" as const),
    ...Array.from({ length: size / 4 }, () => "special" as const),
  ];
}

function takeRandomBagItem<T>(bag: T[], random: () => number) {
  const index = Math.min(bag.length - 1, Math.floor(Math.max(0, Math.min(0.999999999, random())) * bag.length));
  return bag.splice(index, 1)[0];
}

function chooseWeightedEdition(editions: DeckEdition[], random: () => number) {
  const totalWeight = editions.reduce((total, edition) => total + DECK_EDITION_SCORES[edition] ** 1.2, 0);
  let cursor = Math.max(0, Math.min(0.999999999, random())) * totalWeight;
  for (const edition of editions) {
    cursor -= DECK_EDITION_SCORES[edition] ** 1.2;
    if (cursor < 0) return edition;
  }
  return editions.at(-1)!;
}

function sampleReducedCardBlueprints(pool: CardBlueprint[], count: number, random: () => number) {
  if (count <= 0 || pool.length === 0) return [] as CardBlueprint[];
  if (pool.length === 1) return Array.from({ length: count }, () => pool[0]);

  const candidateCount = pool.length;
  const uniformExpectedUnique = candidateCount * (1 - (1 - 1 / candidateCount) ** count);
  const targetUnique = uniformExpectedUnique * (2 / 3);
  let reducedCandidateCount = 1;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let candidateSize = 1; candidateSize <= candidateCount; candidateSize += 1) {
    const expectedUnique = candidateSize * (1 - (1 - 1 / candidateSize) ** count);
    const distance = Math.abs(expectedUnique - targetUnique);
    if (distance < closestDistance) {
      closestDistance = distance;
      reducedCandidateCount = candidateSize;
    }
  }

  const shuffledPool = [...pool];
  for (let index = 0; index < reducedCandidateCount; index += 1) {
    const swapIndex = index + Math.floor(
      Math.max(0, Math.min(0.999999999, random())) * (candidateCount - index),
    );
    [shuffledPool[index], shuffledPool[swapIndex]] = [shuffledPool[swapIndex], shuffledPool[index]];
  }
  const reducedPool = shuffledPool.slice(0, reducedCandidateCount);
  return Array.from({ length: count }, () => reducedPool[
    Math.floor(Math.max(0, Math.min(0.999999999, random())) * reducedPool.length)
  ]);
}

function addDebugDeckCard(cards: Card[], blueprint: CardBlueprint, nextCardId: number) {
  cards.push({ ...blueprint, id: nextCardId, revealed: false });
  return nextCardId + 1;
}

type DebugDeckGenerationAttempt = {
  deck: DeckCase | null;
  nextCardId: number;
};

function generateDebugDeckAttempt(
  startScore: number,
  startCardId: number,
  random: () => number,
  capacityBonus = 0,
): DebugDeckGenerationAttempt {
  const rareMean = startScore / 100 * Math.min((100 + startScore) / 130, 2);
  const rareCount = sampleRandomizedBinomialWithMean(rareMean, random);
  const capacityIncreaseCount = sampleGeneralizedPoisson(startScore / 30, -0.5, random);
  const capacity = DEBUG_DECK_STARTING_CAPACITY + capacityIncreaseCount * 5 + capacityBonus;
  const cards: Card[] = [];
  let nextCardId = startCardId;
  if (rareCount > capacity) return { deck: null, nextCardId };
  for (let index = 0; index < rareCount; index += 1) {
    nextCardId = addDebugDeckCard(cards, randomItem(RARE_CARD_POOL, random), nextCardId);
  }

  let remainingScore = startScore
    - rareCount * 8
    - capacityIncreaseCount * 13;
  if (remainingScore < -10) return { deck: null, nextCardId };

  const editions: DeckEdition[] = [];
  while (remainingScore >= 0) {
    const availableEditions = getAvailableDeckEditions(editions)
      .filter((edition) => DECK_EDITION_SCORES[edition] <= remainingScore);
    if (availableEditions.length === 0) break;
    const edition = chooseWeightedEdition(availableEditions, random);
    editions.push(edition);
    remainingScore -= DECK_EDITION_SCORES[edition];
  }

  const remainingSlots = capacity - cards.length;
  const bagSize = Math.max(Math.floor((remainingSlots * 2) / 8) * 8, 8);
  let fillerBag = createDebugFillerBag(bagSize);
  const fillerKinds: DebugFillerKind[] = [];
  for (let slot = 0; slot < remainingSlots; slot += 1) {
    if (fillerBag.length === 0) fillerBag = createDebugFillerBag(bagSize);
    fillerKinds.push(takeRandomBagItem(fillerBag, random));
  }
  const starterCards = sampleReducedCardBlueprints(
    STARTER_CARD_POOL,
    fillerKinds.filter((kind) => kind === "starter").length,
    random,
  );
  const basicCards = sampleReducedCardBlueprints(
    BASIC_CARD_POOL,
    fillerKinds.filter((kind) => kind === "basic").length,
    random,
  );
  let starterIndex = 0;
  let basicIndex = 0;
  for (const fillerKind of fillerKinds) {
    if (fillerKind === "starter") {
      nextCardId = addDebugDeckCard(cards, starterCards[starterIndex], nextCardId);
      starterIndex += 1;
    } else if (fillerKind === "basic") {
      nextCardId = addDebugDeckCard(cards, basicCards[basicIndex], nextCardId);
      basicIndex += 1;
    } else if (fillerKind === "special") {
      nextCardId = addDebugDeckCard(cards, randomItem(SPECIAL_CARD_POOL, random), nextCardId);
    }
  }

  return {
    nextCardId,
    deck: {
      id: `debug-score-${startCardId}`,
      name: createDeckName(),
      capacity,
      cards,
      editions,
      editionColors: createEditionColors(editions),
    },
  };
}

export type DebugDeckGenerationResult = {
  decks: DeckCase[];
  attempted: number;
  discarded: number;
  nextCardId: number;
};

export function generateDebugDecksByScore(
  startScore: number,
  attemptCount: number,
  startCardId: number,
  random: () => number = Math.random,
): DebugDeckGenerationResult {
  const decks: DeckCase[] = [];
  let nextCardId = startCardId;
  let discarded = 0;
  const attempted = Math.max(0, Math.floor(attemptCount));
  const normalizedStartScore = Math.max(0, Math.floor(startScore));
  for (let attempt = 0; attempt < attempted; attempt += 1) {
    const result = generateDebugDeckAttempt(normalizedStartScore, nextCardId, random);
    nextCardId = result.nextCardId;
    if (!result.deck) {
      discarded += 1;
      continue;
    }
    decks.push(result.deck);
  }
  return { decks, attempted, discarded, nextCardId };
}

export function createRegionDeck(
  regionNumber: number,
  startId: number,
  capacityBonus = 0,
  random: () => number = Math.random,
): DeckCase {
  const startScore = Math.max(0, regionNumber * 30 + Math.floor(random() * 11) - 5);
  let nextCardId = startId;
  for (;;) {
    const result = generateDebugDeckAttempt(startScore, nextCardId, random, capacityBonus);
    nextCardId = result.nextCardId;
    if (result.deck) {
      return {
        ...result.deck,
        id: `found-r${regionNumber}-${startId}-${Math.random().toString(36).slice(2, 8)}`,
      };
    }
  }
}

export function createConsumable(type: ConsumableType, id: string): Consumable {
  if (type === "mindEyeTicket") {
    return { id, type, name: "심안 티켓", description: "20번 이동하는 동안 9×9 시야를 얻습니다." };
  }
  if (type === "darkTicket") {
    return { id, type, name: "어둠 티켓", description: "20턴 동안 적의 인식 거리가 1 감소합니다." };
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
    return { id, type, name: "지도 티켓", description: "같은 지역에서 아직 드러나지 않은 특수 지형 2곳을 밝힙니다." };
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
  capacityBonus = 0,
  rareCardChance = 0.05,
  forceDeck = false,
) {
  const regionMultiplier = 1.3 ** Math.max(0, regionNumber - 1);
  const minimumGold = Math.floor(10 * regionMultiplier);
  const maximumGold = Math.floor(15 * regionMultiplier);
  const gold = minimumGold + Math.floor(Math.random() * (maximumGold - minimumGold + 1));
  const decks = forceDeck || Math.random() < deckDropChance
    ? [createRegionDeck(regionNumber, nextCardId, capacityBonus)]
    : [];
  const consumableType = decks.length === 0 && Math.random() < 0.5
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

export function createBossBattleReward(
  nextCardId: number,
  bonusDeckRegion?: number,
  capacityBonus = 0,
) {
  const decks = bonusDeckRegion === undefined
    ? []
    : [createRegionDeck(bonusDeckRegion, nextCardId + 1, capacityBonus)];
  return {
    gold: 80 + Math.floor(Math.random() * 21),
    cards: [createBattleRewardCard(nextCardId, 1)],
    decks,
    consumableType: null,
    consumableTypes: Array.from({ length: 2 }, () => consumableTypeFromRoll(Math.random())),
  };
}
