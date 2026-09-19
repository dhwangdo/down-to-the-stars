import type { Card } from "./cards";

export type BlessingId =
  | "vision" | "lightStep" | "sturdy" | "greed" | "bag" | "deckSize" | "ninja"
  | "swordShield" | "binaryStars" | "healingMileage" | "forbiddenKnowledge" | "gambling"
  | "oneMore" | "bombardier" | "transformer" | "mirror" | "goldRush" | "lightTicket"
  | "archaeologist" | "highlander" | "clairvoyance" | "blacksmith" | "packInsurance"
  | "bioluminescence" | "oneUp" | "vulnerabilityInsurance" | "thornCoat" | "glassCannon";

export type BlessingOfferId = BlessingId | "empty";

export const BLESSING_INFO: Record<BlessingOfferId, { name: string; description: string }> = {
  vision: { name: "시야 확장", description: "시야 거리 +1" },
  lightStep: { name: "가벼운 걸음", description: "적의 인식 확률이 절반이 됩니다." },
  sturdy: { name: "튼튼함", description: "최대 체력이 20 증가합니다." },
  greed: { name: "탐욕스러움", description: "골드 획득량이 2배가 됩니다." },
  bag: { name: "가방 업그레이드", description: "인벤토리 +12칸, 덱 슬롯 +1" },
  deckSize: { name: "덱 크기 +5", description: "모든 덱 최대 장수 +5" },
  ninja: { name: "닌자", description: "잠든 적과 전투 시 아드레날린 1장을 얻습니다." },
  swordShield: { name: "검과 방패", description: "전투 시작 시 힘 +1, 강인함 +1" },
  binaryStars: { name: "쌍성계", description: "전투 시작 시 ★★ 획득" },
  healingMileage: { name: "힐링 마일리지", description: "티켓 사용 시 체력 2 회복" },
  forbiddenKnowledge: { name: "금단의 지식", description: "전투 밖에서 덱을 자유롭게 편집합니다. 최대 체력이 20으로 고정됩니다." },
  gambling: { name: "갬블링", description: "보유하지 않은 무작위 축복 2개를 획득합니다." },
  oneMore: { name: "한 번 더", description: "티켓 사용 시 20% 확률로 티켓이 소모되지 않습니다." },
  bombardier: { name: "폭탄마", description: "폭탄 티켓 8개를 얻고 폭탄 피해에 면역이 됩니다." },
  transformer: { name: "변환가", description: "변환 티켓 4개를 획득합니다." },
  mirror: { name: "거울상", description: "복제 티켓 2개를 획득합니다." },
  goldRush: { name: "골드러쉬", description: "즉시 300$를 획득합니다." },
  lightTicket: { name: "가벼운 티켓", description: "티켓이 인벤토리 용량을 소모하지 않습니다." },
  archaeologist: { name: "고고학자", description: "성소 사용 시 20% 확률로 붕괴하지 않습니다." },
  highlander: { name: "하이랜더", description: "덱에 중복 카드가 없으면 매 턴 시작 시 ★ 획득" },
  clairvoyance: { name: "투시", description: "셔플 시 카드마다 25% 확률로 앞면으로 놓입니다." },
  blacksmith: { name: "대장장이", description: "매 턴 첫 재련 시 ★ 획득" },
  packInsurance: { name: "폭사 방지", description: "카드 팩에서 최소 희귀 카드 1장을 보장합니다." },
  bioluminescence: { name: "생체발광", description: "시야 거리 +2, 인식될 확률 1.5배" },
  oneUp: { name: "1UP", description: "사망 시 최대 체력의 50%로 한 번 부활합니다." },
  vulnerabilityInsurance: { name: "취약 보험", description: "취약 피해가 200% 대신 150%가 됩니다." },
  thornCoat: { name: "가시 코트", description: "전투 시작 시 가시 5 획득" },
  glassCannon: { name: "유리 대포", description: "최대 에너지 +1. 물리·마법 저항을 얻을 수 없습니다." },
  empty: { name: "빈 축복", description: "아무 효과도 없습니다." },
};

export const BLESSING_IDS = Object.keys(BLESSING_INFO).filter((id) => id !== "empty") as BlessingId[];

function shuffled<T>(items: readonly T[], random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function rollBlessingOffers(owned: readonly BlessingId[], count = 3, random = Math.random): BlessingOfferId[] {
  const available = BLESSING_IDS.filter((id) => !owned.includes(id));
  return [...shuffled(available, random).slice(0, count), ...Array(Math.max(0, count - available.length)).fill("empty")];
}

export function rollGamblingBlessings(owned: readonly BlessingId[], random = Math.random): BlessingOfferId[] {
  const available = BLESSING_IDS.filter((id) => id !== "gambling" && !owned.includes(id));
  return [...shuffled(available, random).slice(0, 2), ...Array(Math.max(0, 2 - available.length)).fill("empty")];
}

export function hasUniqueCardEffects(cards: readonly Pick<Card, "effect">[]) {
  return new Set(cards.map((card) => card.effect)).size === cards.length;
}

export function resolveLethalDamage(hp: number, damage: number, maxHp: number, oneUpAvailable: boolean) {
  const remainingHp = Math.max(0, hp - damage);
  return remainingHp === 0 && oneUpAvailable
    ? { hp: Math.floor(maxHp / 2), usedOneUp: true }
    : { hp: remainingHp, usedOneUp: false };
}

export function shouldPreserveTicket(hasOneMore: boolean, random = Math.random) {
  return hasOneMore && random() < 0.2;
}
