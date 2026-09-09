"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  applyPlayerAttack,
  chooseNextIntent,
  createSewerEncounter,
  createSewerEncounterByIndex,
  getEnemyCodexEntries,
  getEncounterRegionNumber,
  getEncounterSpawnPool,
  getSewerEncounterLabel,
  reduceEnemyDamageByResistance,
  SEWER_ENCOUNTER_COUNT,
  type EnemyAction,
  type EnemyState,
} from "./game/enemies";
import {
  advanceMapEnemies,
  awarenessSymbol,
  chebyshevDistance,
  EIGHT_DIRECTIONS,
  isInPlayerVision,
  MAP_PLAYER_VISION_HORIZONTAL_RADIUS,
  MAP_PLAYER_VISION_VERTICAL_RADIUS,
  createMapEnemyWorld,
  updateEnemyCellMemory,
  type MapEnemyCellMemory,
  type MapEnemyWorld,
} from "./game/mapEnemies";
import {
  advanceBombs,
  applyBombDamage,
  positionsInSquare,
  type MapBomb,
} from "./game/mapEffects";
import { cardsForNextShuffle, dealCardsEvenlyToPiles, dealCardsToFixedPiles } from "./game/cardRules";
import { addResistance, addVulnerability, decayThenAddVulnerability, vulnerabilityMultiplier } from "./game/statuses";

// 카드의 내부 분류는 공격과 비공격(스킬)만 둔다.
// 방어/마법 방어 여부는 kind가 아니라 카드 효과와 damageType으로 판단한다.
type CardKind = "strike" | "skill";
type DamageType = "physical" | "magic";
type CardRarity = "status" | "starter" | "basic" | "special" | "rare" | "legendary";
type SolitaireRule = "top" | "bottom" | "spell";
type CardEffect =
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
  | "suppression"
  | "starArk"
  | "massDeal"
  | "sturdyStance"
  | "obsidianDagger"
  | "astronomyResearch"
  | "necromancyResearch"
  | "metallurgyResearch"
  | "lawResearch"
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
  | "supernova"
  | "combatManual"
  | "grimoire"
  | "horologium"
  | "ophiuchus"
  | "aries"
  | "hydra"
  | "orion"
  | "cassiopeia";

const HAND_PASSIVE_EFFECTS = new Set<CardEffect>(["combatManual", "grimoire"]);
type Phase = "drawing" | "playing" | "discarding" | "enemy-turn" | "resolving";
type Screen = "map" | "battle";
type MapPosition = { x: number; y: number };
type RoomType =
  | "void"
  | "rock"
  | "empty"
  | "blessing"
  | "shop"
  | "shrine"
  | "campfire"
  | "portal"
  | "heal"
  | "safePortal";
type DeckEditorArea = "deck" | "inventory" | "floor" | "pendingRemoval";
type TicketDropArea = "deck" | "inventory" | "floor";
type BlessingId = "vision" | "lightStep" | "sturdy" | "greed" | "bag" | "athlete" | "luck" | "deckSize" | "ninja";
type DeckEdition =
  | "clever"
  | "roomy"
  | "lively"
  | "fantastic"
  | "transparent"
  | "golden"
  | "rampaging"
  | "greedy"
  | "frugal";
type DeckCase = {
  id: string;
  name: string;
  capacity: number;
  cards: Card[];
  editions: DeckEdition[];
  editionColors: Partial<Record<DeckEdition, string>>;
};
type ConsumableType =
  | "paintTicket"
  | "mindEyeTicket"
  | "bombTicket"
  | "cloneTicket"
  | "extractTicket"
  | "transformTicket"
  | "mapTicket"
  | "cardPack";
const CONSUMABLE_TYPES: ConsumableType[] = [
  "paintTicket",
  "mindEyeTicket",
  "bombTicket",
  "extractTicket",
  "transformTicket",
  "mapTicket",
  "cloneTicket",
];

function consumableTypeFromRoll(roll: number) {
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

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
type Consumable = {
  id: string;
  type: ConsumableType;
  name: string;
  description: string;
  armedMovesRemaining?: number;
};
type ConsumableArea = "inventory" | "floor";
type ShopOffer = {
  id: string;
  price: number;
  card?: Card;
  consumable?: Consumable;
  sold: boolean;
};

type ShrineResult = {
  cards: Card[];
};

type Card = {
  id: number;
  kind: CardKind;
  effect: CardEffect;
  rarity: CardRarity;
  name: string;
  cost: number;
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
  /** 흑요석 단검의 누적 재련 비용 기록. */
  forgeCostsCompleted?: number[];
  forgeTargetName?: string;
  forgeAny?: boolean;
  forged?: boolean;
  exhaust?: boolean;
  /** Token cards participate in the current cycle once, then leave on reshuffle. */
  token?: boolean;
  /** Enemy-created tokens use a distinct card face color. */
  enemyToken?: boolean;
  /** Power-like rule card marker shown on the card face. */
  rule?: boolean;
};

type CardKeywordInfo = {
  name: string;
  description: string;
};

type CardKeywordPopoverState = {
  card: Card;
  x: number;
  y: number;
  anchorTop: number;
};

type EnemyIntentTooltipState = {
  text: string;
  x: number;
  y: number;
  maxWidth: number;
};

type DeckEditorSnapshot = {
  roomKey: string;
  decks: DeckCase[];
  activeDeckId: string;
  inventory: Card[];
  consumables: Consumable[];
  floorCards: Card[];
  floorConsumables: Consumable[];
  floorDecks: DeckCase[];
};

type ClearPlan = { pilesBeforeDraw: Card[][]; pilesAfterDraw: Card[][]; hand: Card[] };

type GameState = {
  piles: Card[][];
  hand: Card[];
  discard: Card[];
  /** Canonical cards for rebuilding files; token cards are kept here only until the reshuffle filter runs. */
  initialDeck: Card[];
  /** Used exhaust cards that must not return on the next reshuffle. */
  removedFromReshuffleIds: number[];
  clearPlan: ClearPlan | null;
  energy: number;
  stars: number;
  pendingDraws: number;
  /** A one-time chosen-file draw. */
  pendingPileDrawCount: number;
  /** 질주: 원하는 파일 1장 뒤에 자동으로 뽑을 무작위 파일 수. */
  pendingDashRandomDraws: number;
  /** 연구 룰 카드의 추가 드로우 선택 상태. */
  pendingResearchDraw: "astronomy" | "necromancy" | null;
  astronomyResearchUses: number;
  necromancyResearchUses: number;
  pendingDiscards: number;
  pendingSweep: boolean;
  pendingPileOperation: "discardTop" | "moveTopToBottom" | null;
  turn: number;
  playerHp: number;
  playerPhysicalBlock: number;
  playerMagicBlock: number;
  playerPhysicalResistance: number;
  playerMagicResistance: number;
  playerPhysicalVulnerability: number;
  playerMagicVulnerability: number;
  strength: number;
  temporaryStrength: number;
  agility: number;
  defenseMultiplier: number;
  /** 대분배: 다음 리셔플부터 파일을 라운드 로빈으로 분배한다. */
  evenDealOnReshuffle: boolean;
  /** 견고한 태세: 턴 종료 후 방어를 절반(내림) 보존한다. */
  preserveDefenseOnTurnEnd: boolean;
  /** 현재 전투에서 활성화된 룰 카드. 버프 배지의 호버 미리보기에 사용한다. */
  activeRuleCards: Card[];
  /** 이번 전투에서 발생한 재련 횟수. 오딘의 창 비용에 반영한다. */
  forgeCount: number;
  damageTakenMultiplier: number;
  invulnerable: boolean;
  doubleNextAttack: boolean;
  starsSpent: number;
  reflectDamage: number;
  toxicSlimeAdded: boolean;
  extraTurns: number;
  deckEditions: DeckEdition[];
  enemies: EnemyState[];
  status: "playing" | "won" | "lost";
  message: string;
};

type DragState = {
  card: Card;
  cards: Card[];
  source: { type: "hand" } | { type: "pile"; pileIndex: number; cardIndex: number };
  x: number;
  y: number;
  moved: boolean;
};

type DamagePopup = {
  key: string;
  text: string;
  kind?: "damage" | "buff" | "debuff";
};

type BattleEncounter = {
  encounterIndex: number;
  damageTaken?: number;
  awareness?: "sleeping" | "awake" | "alerted";
};

type PendingBattleStart = {
  encounters: BattleEncounter[];
  playerHp: number;
};

function animateEnemyTokenDelivery(target: HTMLElement, source: DOMRect, delay = 0) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const targetRect = target.getBoundingClientRect();
  const targetStyle = window.getComputedStyle(target);
  const cardWidth = Number.parseFloat(targetStyle.width) || targetRect.width;
  const cardHeight = Number.parseFloat(targetStyle.height) || targetRect.height;
  const targetLeft = targetRect.left + (targetRect.width - cardWidth) / 2;
  const targetTop = targetRect.top + (targetRect.height - cardHeight) / 2;
  const host = target.closest<HTMLElement>(".battlefield") ?? document.body;
  const ghost = target.cloneNode(true) as HTMLElement;
  const previousOpacity = target.style.opacity;
  ghost.classList.add("enemy-token-flight");
  Object.assign(ghost.style, {
    position: "fixed",
    zIndex: "100",
    top: `${targetTop}px`,
    left: `${targetLeft}px`,
    width: `${cardWidth}px`,
    height: `${cardHeight}px`,
    margin: "0",
    pointerEvents: "none",
  });
  ghost.removeAttribute("data-card-id");
  ghost.setAttribute("aria-hidden", "true");
  host.appendChild(ghost);
  target.style.opacity = "0";
  const deltaX = source.left + source.width / 2 - (targetLeft + cardWidth / 2);
  const deltaY = source.top + source.height / 2 - (targetTop + cardHeight / 2);
  const arcHeight = Math.min(130, Math.max(65, Math.abs(deltaY) * .18));
  const animation = ghost.animate(
    [
      {
        transform: `translate(${deltaX}px, ${deltaY}px) rotate(-10deg)`,
        opacity: .92,
        filter: "drop-shadow(0 2px 3px rgba(0,0,0,.2))",
      },
      {
        offset: .18,
        transform: `translate(${deltaX}px, ${deltaY}px) rotate(-10deg)`,
        opacity: .92,
        filter: "drop-shadow(0 2px 3px rgba(0,0,0,.2))",
      },
      {
        offset: .64,
        transform: `translate(${deltaX * .42}px, ${deltaY * .42 - arcHeight}px) rotate(7deg)`,
        opacity: 1,
        filter: "drop-shadow(0 16px 12px rgba(0,0,0,.38))",
      },
      {
        transform: "translate(0, 0) rotate(0deg)",
        opacity: 1,
        filter: "drop-shadow(0 3px 3px rgba(0,0,0,.18))",
      },
    ],
    {
      duration: 820,
      delay,
      easing: "cubic-bezier(.18,.72,.2,1)",
      fill: "backwards",
    },
  );
  const cleanup = () => {
    ghost.remove();
    target.style.opacity = previousOpacity;
  };
  animation.addEventListener("finish", cleanup, { once: true });
  animation.addEventListener("cancel", cleanup, { once: true });
  return animation;
}

function animateCardToPlayer(sourceCard: HTMLElement, source: DOMRect, target: HTMLElement, delay = 0, duration = 820) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const sourceStyle = window.getComputedStyle(sourceCard);
  const cardWidth = Number.parseFloat(sourceStyle.width) || source.width;
  const cardHeight = Number.parseFloat(sourceStyle.height) || source.height;
  const sourceLeft = source.left + (source.width - cardWidth) / 2;
  const sourceTop = source.top + (source.height - cardHeight) / 2;
  const targetRect = target.getBoundingClientRect();
  const targetLeft = targetRect.left + (targetRect.width - cardWidth) / 2;
  const targetTop = targetRect.top + (targetRect.height - cardHeight) / 2;
  const host = target.closest<HTMLElement>(".battlefield") ?? document.body;
  const ghost = sourceCard.cloneNode(true) as HTMLElement;
  ghost.classList.add("enemy-token-flight");
  Object.assign(ghost.style, {
    position: "fixed",
    zIndex: "100",
    top: `${sourceTop}px`,
    left: `${sourceLeft}px`,
    width: `${cardWidth}px`,
    height: `${cardHeight}px`,
    margin: "0",
    pointerEvents: "none",
  });
  ghost.removeAttribute("data-card-id");
  ghost.setAttribute("aria-hidden", "true");
  host.appendChild(ghost);
  const deltaX = targetLeft - sourceLeft;
  const deltaY = targetTop - sourceTop;
  const animation = ghost.animate(
    [
      { transform: "translate(0, 0) rotate(-10deg)", opacity: .92 },
      { transform: `translate(${deltaX}px, ${deltaY}px) rotate(0deg)`, opacity: 1 },
    ],
    { duration, delay, easing: "cubic-bezier(.18,.72,.2,1)", fill: "backwards" },
  );
  const cleanup = () => ghost.remove();
  animation.addEventListener("finish", cleanup, { once: true });
  animation.addEventListener("cancel", cleanup, { once: true });
  return animation;
}

function animatePlayedCardToCenter(sourceCard: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  const source = sourceCard.getBoundingClientRect();
  const sourceStyle = window.getComputedStyle(sourceCard);
  const cardWidth = Number.parseFloat(sourceStyle.width) || source.width;
  const cardHeight = Number.parseFloat(sourceStyle.height) || source.height;
  const sourceLeft = source.left + (source.width - cardWidth) / 2;
  const sourceTop = source.top + (source.height - cardHeight) / 2;
  const host = sourceCard.closest<HTMLElement>(".battlefield") ?? document.body;
  const hostRect = host.getBoundingClientRect();
  const targetLeft = hostRect.left + (hostRect.width - cardWidth) / 2;
  const targetTop = hostRect.top + (hostRect.height - cardHeight) / 2;
  const ghost = sourceCard.cloneNode(true) as HTMLElement;
  const previousOpacity = sourceCard.style.opacity;
  ghost.classList.add("played-card-flight");
  Object.assign(ghost.style, {
    position: "fixed",
    zIndex: "110",
    top: `${sourceTop}px`,
    left: `${sourceLeft}px`,
    width: `${cardWidth}px`,
    height: `${cardHeight}px`,
    margin: "0",
    pointerEvents: "none",
  });
  ghost.setAttribute("aria-hidden", "true");
  host.appendChild(ghost);
  sourceCard.style.opacity = "0";
  const animation = ghost.animate(
    [
      { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1 },
      { transform: `translate(${targetLeft - sourceLeft}px, ${targetTop - sourceTop}px) rotate(-4deg) scale(.78)`, opacity: 0 },
    ],
    { duration: 170, easing: "cubic-bezier(.24,.78,.3,1)", fill: "forwards" },
  );
  const cleanup = () => {
    ghost.remove();
    sourceCard.style.opacity = previousOpacity;
  };
  animation.addEventListener("finish", cleanup, { once: true });
  animation.addEventListener("cancel", cleanup, { once: true });
  return 170;
}

type BattleThemeColors = {
  outer: string;
  board: string;
  card: string;
  cardText: string;
  cardBorder: string;
  cardBack: string;
  cost: string;
  costText: string;
  energy: string;
  energyEmpty: string;
  basicBand: string;
  specialBand: string;
  rareBand: string;
  physical: string;
  magic: string;
};

type StarOrbitStyle = "saturn" | "ring" | "ellipse" | "counter" | "double";
type CardWatermarkStyle = "stars" | "diamonds";
type ConstellationNode = { x: number; y: number; scale: number };
type ConstellationPreset = { nodes: ConstellationNode[]; edges: Array<[number, number]> };

const STAR_ORBIT_OPTIONS: Array<{ value: StarOrbitStyle; label: string }> = [
  { value: "saturn", label: "극좌표 궤도" },
  { value: "ring", label: "느린 원형" },
  { value: "ellipse", label: "완만한 타원" },
  { value: "counter", label: "느린 역회전" },
  { value: "double", label: "이중 궤도" },
];

const CARD_WATERMARK_OPTIONS: Array<{ value: CardWatermarkStyle; label: string }> = [
  { value: "stars", label: "별자리 · 별" },
  { value: "diamonds", label: "별자리 · 다이아" },
];

const CONSTELLATION_STAR_PATH = "M0-10 2.35-3.24 9.51-3.09 3.8 1.24 5.88 8.09 0 4-5.88 8.09-3.8 1.24-9.51-3.09-2.35-3.24Z";
const CONSTELLATION_TEXT_CLEAR_ZONE = { left: 28, right: 172, top: 92, bottom: 210 };

function constellationSegmentsIntersect(
  firstStart: Pick<ConstellationNode, "x" | "y">,
  firstEnd: Pick<ConstellationNode, "x" | "y">,
  secondStart: Pick<ConstellationNode, "x" | "y">,
  secondEnd: Pick<ConstellationNode, "x" | "y">,
) {
  const orientation = (
    start: Pick<ConstellationNode, "x" | "y">,
    end: Pick<ConstellationNode, "x" | "y">,
    point: Pick<ConstellationNode, "x" | "y">,
  ) => (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
  const onSegment = (
    start: Pick<ConstellationNode, "x" | "y">,
    end: Pick<ConstellationNode, "x" | "y">,
    point: Pick<ConstellationNode, "x" | "y">,
  ) => (
    point.x >= Math.min(start.x, end.x) - 1e-6
    && point.x <= Math.max(start.x, end.x) + 1e-6
    && point.y >= Math.min(start.y, end.y) - 1e-6
    && point.y <= Math.max(start.y, end.y) + 1e-6
  );
  const firstSideStart = orientation(firstStart, firstEnd, secondStart);
  const firstSideEnd = orientation(firstStart, firstEnd, secondEnd);
  const secondSideStart = orientation(secondStart, secondEnd, firstStart);
  const secondSideEnd = orientation(secondStart, secondEnd, firstEnd);
  const epsilon = 1e-6;

  if (
    ((firstSideStart > epsilon && firstSideEnd < -epsilon) || (firstSideStart < -epsilon && firstSideEnd > epsilon))
    && ((secondSideStart > epsilon && secondSideEnd < -epsilon) || (secondSideStart < -epsilon && secondSideEnd > epsilon))
  ) return true;
  return (
    (Math.abs(firstSideStart) <= epsilon && onSegment(firstStart, firstEnd, secondStart))
    || (Math.abs(firstSideEnd) <= epsilon && onSegment(firstStart, firstEnd, secondEnd))
    || (Math.abs(secondSideStart) <= epsilon && onSegment(secondStart, secondEnd, firstStart))
    || (Math.abs(secondSideEnd) <= epsilon && onSegment(secondStart, secondEnd, firstEnd))
  );
}

function constellationPointInTextZone(point: Pick<ConstellationNode, "x" | "y">) {
  return (
    point.x >= CONSTELLATION_TEXT_CLEAR_ZONE.left
    && point.x <= CONSTELLATION_TEXT_CLEAR_ZONE.right
    && point.y >= CONSTELLATION_TEXT_CLEAR_ZONE.top
    && point.y <= CONSTELLATION_TEXT_CLEAR_ZONE.bottom
  );
}

function constellationSegmentCrossesTextZone(
  start: Pick<ConstellationNode, "x" | "y">,
  end: Pick<ConstellationNode, "x" | "y">,
) {
  if (constellationPointInTextZone(start) || constellationPointInTextZone(end)) return true;
  const { left, right, top, bottom } = CONSTELLATION_TEXT_CLEAR_ZONE;
  const topLeft = { x: left, y: top };
  const topRight = { x: right, y: top };
  const bottomRight = { x: right, y: bottom };
  const bottomLeft = { x: left, y: bottom };
  return (
    constellationSegmentsIntersect(start, end, topLeft, topRight)
    || constellationSegmentsIntersect(start, end, topRight, bottomRight)
    || constellationSegmentsIntersect(start, end, bottomRight, bottomLeft)
    || constellationSegmentsIntersect(start, end, bottomLeft, topLeft)
  );
}

function createConstellationPresets(
  presetIndexes = Array.from({ length: 40 }, (_, index) => index),
): ConstellationPreset[] {
  return presetIndexes.map((presetIndex) => {
    let state = Math.imul(presetIndex + 17, 2654435761) >>> 0;
    const random = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
    const nodes: ConstellationNode[] = [];
    const edges: Array<[number, number]> = [];
    const componentCount = 5 + (presetIndex % 6 === 0 ? 1 : 0);
    const boundaryCenters = [
      { x: -24, y: 30 + random() * 220, angle: 0 },
      { x: 224, y: 30 + random() * 220, angle: Math.PI },
      { x: 25 + random() * 150, y: -28, angle: Math.PI / 2 },
      { x: 25 + random() * 150, y: 308, angle: -Math.PI / 2 },
    ];

    for (let componentIndex = 0; componentIndex < componentCount; componentIndex += 1) {
      const boundaryCenter = componentIndex < 3
        ? boundaryCenters[(componentIndex + presetIndex) % boundaryCenters.length]
        : undefined;
      let center = boundaryCenter ?? {
        x: 15 + random() * 170,
        y: 15 + random() * 250,
        angle: random() * Math.PI * 2,
      };
      if (!boundaryCenter) {
        let bestCenter = center;
        let bestClearance = -Infinity;
        for (let attempt = 0; attempt < 128; attempt += 1) {
          const candidate = {
            x: -20 + random() * 240,
            y: -30 + random() * 340,
            angle: random() * Math.PI * 2,
          };
          if (constellationPointInTextZone(candidate)) continue;
          const clearance = nodes.length === 0
            ? Infinity
            : Math.min(...nodes.map((node) => Math.hypot(candidate.x - node.x, candidate.y - node.y)));
          if (clearance > bestClearance) {
            bestCenter = candidate;
            bestClearance = clearance;
          }
          if (clearance >= 78) break;
        }
        center = bestCenter;
      } else if (nodes.length > 0) {
        let bestCenter = center;
        let bestClearance = Math.min(...nodes.map((node) => (
          Math.hypot(center.x - node.x, center.y - node.y)
        )));
        for (let attempt = 0; attempt < 32 && bestClearance < 72; attempt += 1) {
          const outwardDistance = 12 + random() * 100;
          const lateralDistance = (random() - .5) * 80;
          const candidate = {
            x: center.x - Math.cos(center.angle) * outwardDistance
              + Math.cos(center.angle + Math.PI / 2) * lateralDistance,
            y: center.y - Math.sin(center.angle) * outwardDistance
              + Math.sin(center.angle + Math.PI / 2) * lateralDistance,
            angle: center.angle,
          };
          const clearance = Math.min(...nodes.map((node) => (
            Math.hypot(candidate.x - node.x, candidate.y - node.y)
          )));
          if (clearance > bestClearance) {
            bestCenter = candidate;
            bestClearance = clearance;
          }
        }
        center = bestCenter;
      }
      const firstNodeIndex = nodes.length;
      const memberRoll = random();
      const memberCount = memberRoll < .3 ? 2 : memberRoll < .82 ? 3 : 4;
      const modeRoll = random();
      const mode = memberCount === 4
        ? modeRoll < .72 ? 1 : modeRoll < .86 ? 0 : 2
        : modeRoll < .34 ? 1 : modeRoll < .67 ? 0 : 2;
      nodes.push({ x: center.x, y: center.y, scale: .72 + random() * .28 });

      for (let memberIndex = 1; memberIndex < memberCount; memberIndex += 1) {
        const parentOffset = mode === 0
          ? memberIndex - 1
          : mode === 1
            ? 0
            : Math.floor(random() * memberIndex);
        const parentIndex = firstNodeIndex + parentOffset;
        const parent = nodes[parentIndex];
        const directionBias = boundaryCenter ? center.angle : random() * Math.PI * 2;
        let x = parent.x;
        let y = parent.y;
        let bestX = x;
        let bestY = y;
        let bestPlacementScore = -Infinity;
        const connectedNeighbors = edges.flatMap(([left, right]) => (
          left === parentIndex ? [nodes[right]] : right === parentIndex ? [nodes[left]] : []
        ));
        for (let attempt = 0; attempt < 128; attempt += 1) {
          const angle = directionBias + (random() - .5) * (boundaryCenter ? 1.7 : Math.PI * 1.5);
          const distance = 60 + random() * 64;
          const candidateX = parent.x + Math.cos(angle) * distance;
          const candidateY = parent.y + Math.sin(angle) * distance;
          const ownComponentClearance = Math.min(...nodes.slice(firstNodeIndex).map((node) => (
            node === parent ? distance : Math.hypot(candidateX - node.x, candidateY - node.y)
          )));
          const otherComponentClearance = firstNodeIndex === 0
            ? Infinity
            : Math.min(...nodes.slice(0, firstNodeIndex).map((node) => (
              Math.hypot(candidateX - node.x, candidateY - node.y)
            )));
          const clearance = Math.min(ownComponentClearance, otherComponentClearance - 18);
          const candidatePoint = { x: candidateX, y: candidateY };
          const crossesTextZone = constellationSegmentCrossesTextZone(parent, candidatePoint);
          const crossesExistingEdge = edges.some(([left, right]) => (
            left !== parentIndex
            && right !== parentIndex
            && constellationSegmentsIntersect(parent, candidatePoint, nodes[left], nodes[right])
          ));
          const angularDegeneracy = connectedNeighbors.reduce((maximum, neighbor) => {
            const neighborAngle = Math.atan2(neighbor.y - parent.y, neighbor.x - parent.x);
            const difference = Math.abs(Math.atan2(
              Math.sin(angle - neighborAngle),
              Math.cos(angle - neighborAngle),
            ));
            const cosine = Math.cos(difference);
            const nearStraight = ((1 - cosine) / 2) ** 4;
            const nearNarrow = .82 * ((1 + cosine) / 2) ** 4;
            return Math.max(maximum, nearStraight, nearNarrow);
          }, 0);
          const angleAcceptanceProbability = 1 - .88 * angularDegeneracy;
          const placementScore = clearance - 80 * angularDegeneracy;
          if (!crossesTextZone && !crossesExistingEdge && placementScore > bestPlacementScore) {
            bestX = candidateX;
            bestY = candidateY;
            bestPlacementScore = placementScore;
          }
          if (!crossesTextZone && !crossesExistingEdge && clearance >= 54 && random() < angleAcceptanceProbability) {
            x = candidateX;
            y = candidateY;
            break;
          }
        }
        if (bestPlacementScore === -Infinity) {
          if (memberIndex === 1) nodes.splice(firstNodeIndex, 1);
          break;
        }
        if (x === parent.x && y === parent.y) {
          x = bestX;
          y = bestY;
        }
        const nodeIndex = nodes.length;
        nodes.push({
          x,
          y,
          scale: .68 + random() * .34,
        });
        edges.push([parentIndex, nodeIndex]);
      }
    }

    return { nodes, edges };
  });
}

const CONSTELLATION_PRESETS = createConstellationPresets();

const CARD_NAME_CONSTELLATION_IMAGES = new Map<string, string>();

function cardNameConstellationImage(cardName: string) {
  const cachedImage = CARD_NAME_CONSTELLATION_IMAGES.get(cardName);
  if (cachedImage) return cachedImage;
  let seed = 2166136261;
  for (const character of cardName) {
    seed ^= character.codePointAt(0) ?? 0;
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  const preset = createConstellationPresets([seed])[0];
  const image = constellationPresetCssImage(preset, "#17234f");
  CARD_NAME_CONSTELLATION_IMAGES.set(cardName, image);
  return image;
}

function constellationPresetCssImage(preset: ConstellationPreset, cardBackground: string) {
  const lines = preset.edges.map(([left, right]) => {
    const start = preset.nodes[left];
    const end = preset.nodes[right];
    return `<line x1="${start.x.toFixed(1)}" y1="${start.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}"/>`;
  }).join("");
  const stars = preset.nodes.map((node) => `<path d="${CONSTELLATION_STAR_PATH}" transform="translate(${node.x.toFixed(1)} ${node.y.toFixed(1)}) scale(${node.scale.toFixed(2)})"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280"><g fill="none" stroke="#c28a00" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="4 7" opacity=".8">${lines}</g><g fill="${cardBackground}" stroke="#c28a00" stroke-width="1.8" stroke-linejoin="round" opacity=".94">${stars}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function ConstellationPreview({ preset }: { preset: ConstellationPreset }) {
  return (
    <svg viewBox="0 0 200 280" aria-hidden="true">
      <g className="constellation-preview-lines">
        {preset.edges.map(([left, right], index) => (
          <line key={index} x1={preset.nodes[left].x} y1={preset.nodes[left].y} x2={preset.nodes[right].x} y2={preset.nodes[right].y} />
        ))}
      </g>
      <g className="constellation-preview-stars">
        {preset.nodes.map((node, index) => (
          <path key={index} d={CONSTELLATION_STAR_PATH} transform={`translate(${node.x} ${node.y}) scale(${node.scale})`} />
        ))}
      </g>
    </svg>
  );
}

const DEFAULT_BATTLE_THEME_COLORS: BattleThemeColors = {
  outer: "#000000",
  board: "#365b46",
  card: "#17234f",
  cardText: "#f8f6ef",
  cardBorder: "#17234f",
  cardBack: "#17234f",
  cost: "#17234f",
  costText: "#ffd166",
  energy: "#126fbd",
  energyEmpty: "#34495e",
  basicBand: "#555B60",
  specialBand: "#3472a2",
  rareBand: "#7e3ab6",
  physical: "#ff9d4d",
  magic: "#67cfff",
};

const BATTLE_THEME_COLOR_FIELDS: Array<{ key: keyof BattleThemeColors; label: string }> = [
  { key: "outer", label: "판 바깥" },
  { key: "board", label: "전투판" },
  { key: "card", label: "카드 바탕" },
  { key: "cardText", label: "카드 글자" },
  { key: "cardBorder", label: "카드 테두리" },
  { key: "cardBack", label: "카드 뒷면" },
  { key: "cost", label: "코스트 칩" },
  { key: "costText", label: "코스트 글자" },
  { key: "energy", label: "에너지 채움" },
  { key: "energyEmpty", label: "에너지 빈칸" },
  { key: "basicBand", label: "일반 띠" },
  { key: "specialBand", label: "특별 띠" },
  { key: "rareBand", label: "희귀 띠" },
  { key: "physical", label: "방어 글자" },
  { key: "magic", label: "마법 방어 글자" },
];

const MAX_PLAYER_HP = 50;
const IRON_WALL_COST = 2;
const IRON_WALL_RESISTANCE = 2;
const UNPLAYABLE_CARD_EFFECTS = new Set<CardEffect>(["slime", "soil", "combatManual", "grimoire"]);
const GAME_VERSION = "v0.1.2";
const STARTING_DECK_SIZE = 16;
const INVENTORY_CAPACITY = 12;
const MAX_OWNED_DECKS = 3;
const BLESSING_INFO: Record<BlessingId, { name: string; description: string }> = {
  vision: { name: "시야 확장", description: "시야가 7×7로 늘어납니다." },
  lightStep: { name: "가벼운 걸음", description: "적의 인식 확률이 절반이 됩니다." },
  sturdy: { name: "튼튼함", description: "최대 체력이 20 증가합니다." },
  greed: { name: "탐욕스러움", description: "골드 획득량이 2배가 됩니다." },
  bag: { name: "가방 업그레이드", description: "인벤토리 +12칸, 덱 슬롯 +1" },
  athlete: { name: "운동선수", description: "30턴마다 이동 1회가 턴을 소모하지 않습니다." },
  luck: { name: "행운", description: "덱·티켓·에디션 확률 +10%p" },
  deckSize: { name: "덱 크기 +5", description: "모든 덱 최대 장수 +5" },
  ninja: { name: "닌자", description: "잠든 적과 전투 시 아드레날린 1장을 얻습니다." },
};
const STARTER_DECK_CAPACITY = 20;
const DEBUG_ALL_CARDS_DECK_ID = "debug-all-cards";
const REGION_COUNT = 7;
const ROCK_BARRIER_HEIGHT = 5;
const SHOP_NODE_CHANCE = 0.0025;
const SHRINE_NODE_CHANCE = 0.0025;
const CAMPFIRE_NODE_CHANCE = SHRINE_NODE_CHANCE;
const PORTAL_NODE_CHANCE = 0.05;
const ROCK_CLUSTER_CHANCE = 0.03;
const ROCK_CLUSTER_EDGE_CHANCE = 0.05;
const FLOOR_CARD_DROP_CHANCE = 0.01;
const DUNGEON_MIN_X = -160;
const DUNGEON_MAX_X = 160;
const SAFE_AREA_START_X = DUNGEON_MAX_X - 20;
const SAFE_AREA_ENTRY_X = SAFE_AREA_START_X + 1;
const SAFE_AREA_HEAL_X = SAFE_AREA_START_X + 2;
const SAFE_AREA_PORTAL_X = SAFE_AREA_START_X + 3;
const SAFE_AREA_REVEAL_RADIUS = 2;
const MAP_COLUMNS = DUNGEON_MAX_X - DUNGEON_MIN_X + 1;
const REGION_HEIGHT = 15;
const MAP_ROWS = REGION_COUNT * REGION_HEIGHT + (REGION_COUNT - 1) * ROCK_BARRIER_HEIGHT;
const MAP_WORLD_MARGIN_X = 5;
const MAP_WORLD_MARGIN_Y = 5;
const MAP_RENDER_COLUMNS = MAP_COLUMNS + MAP_WORLD_MARGIN_X * 2;
const MAP_RENDER_ROWS = MAP_ROWS + MAP_WORLD_MARGIN_Y * 2;
const MAP_ROOM_WIDTH = 136;
const MAP_ROOM_HEIGHT = 136;
const MAP_CELL_GAP = 0;
const MAP_PADDING = 42;
// The former 60% view is the comfortable baseline, so present it as 100%.
const MAP_DEFAULT_ZOOM = 0.625;
const MAP_MIN_ZOOM = 0.1875;
const MAP_MAX_ZOOM = 0.875;
const MAP_ZOOM_STEP = 0.125;
const MAP_TRAVEL_STEP_MS = 140;
const MAP_COLLISION_OVERLAP_MS = 280;
const MAP_BATTLE_FLASH_MS = 600;
const MAP_START: MapPosition = { x: 0, y: 0 };
const CARD_HEIGHT = 170;
const DEFAULT_STACK_OFFSET = 27;

function cardForgeCount(card: Pick<Card, "forged" | "forgeCostsCompleted">) {
  return card.forgeCostsCompleted?.length ?? (card.forged ? 1 : 0);
}

function obsidianDaggerForgeCosts(card: Pick<Card, "effect" | "forged" | "forgeCostsCompleted">) {
  if (card.effect !== "obsidianDagger") return [];
  return [cardForgeCount(card) + 1];
}

function forgeConditionText(card: Pick<Card, "forgeCost" | "forgeCosts" | "forgeTargetName" | "forgeAny">) {
  if (card.forgeTargetName) return `[${card.forgeTargetName}]`;
  if (card.forgeAny) return "[아무거나]";
  const costs = card.forgeCosts ?? (card.forgeCost === undefined ? [] : [card.forgeCost]);
  if (costs.length <= 1) return `[${costs[0]}코스트]`;
  return `[${costs.slice(0, -1).join(", ")} 또는 ${costs[costs.length - 1]}코스트]`;
}

function cardEnergyCost(
  card: Pick<Card, "effect" | "cost" | "rule">,
  lawResearchCount = 0,
  forgeCount = 0,
) {
  const baseCost = card.cost;
  const ruleReduction = card.rule ? lawResearchCount : 0;
  const forgeReduction = card.effect === "odinSpear" ? forgeCount : 0;
  const adjustedCost = baseCost - ruleReduction - forgeReduction;
  // 룰 카드만 법학 연구의 하한(0)을 적용한다. 전설 카드 카시오페이아처럼
  // 기본 비용이 음수인 일반 카드는 음수 비용을 그대로 표시·처리한다.
  return card.rule ? Math.max(0, adjustedCost) : adjustedCost;
}

type ResearchDrawKind = "astronomy" | "necromancy";

function canUseResearchDraw(state: GameState, research: ResearchDrawKind) {
  if (state.pendingResearchDraw !== null) return false;
  const effect = research === "astronomy" ? "astronomyResearch" : "necromancyResearch";
  const uses = research === "astronomy" ? state.astronomyResearchUses : state.necromancyResearchUses;
  const cost = research === "astronomy" ? 2 : 3;
  const hasCards = research === "astronomy"
    ? state.piles.some((pile) => pile.length > 0)
    : state.discard.length > 0;
  return state.activeRuleCards.filter((card) => card.effect === effect).length > uses
    && state.stars >= cost
    && hasCards;
}

function getStackOffset(cardCount: number) {
  return DEFAULT_STACK_OFFSET;
}

const STAR_ORBIT_AMPLITUDE = 50;
const STAR_ORBIT_FREQUENCY = 5 + 1 / Math.E;
const STAR_ORBIT_BASE_SPEED = 132;
const STAR_ORBIT_GAP_SECONDS = 0.17;
const STAR_INDICATOR_RADIUS = 36;
const STAR_ORBIT_CENTER_SPEED_MULTIPLIER = 1.7;
const STAR_ORBIT_EDGE_SPEED_MULTIPLIER = 2 / 3;

function PolarStarOrbit({ count, orbitSpeed, planeSpeed }: {
  count: number;
  orbitSpeed: number;
  planeSpeed: number;
}) {
  const starRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const center = 62;
    const targetSpeed = STAR_ORBIT_BASE_SPEED * orbitSpeed;
    const planeAngularSpeed = Math.PI * 2 / (15 / planeSpeed);
    const historyWindow = 20;
    const integrationStep = 1 / 240;
    type OrbitSample = { time: number; x: number; y: number; front: boolean };

    const thetaRate = (theta: number) => {
      const radius = STAR_ORBIT_AMPLITUDE * Math.cos(STAR_ORBIT_FREQUENCY * theta);
      const radialDerivative = -STAR_ORBIT_AMPLITUDE
        * STAR_ORBIT_FREQUENCY
        * Math.sin(STAR_ORBIT_FREQUENCY * theta);
      const distanceRatio = Math.min(1, Math.abs(radius) / STAR_ORBIT_AMPLITUDE);
      // 외곽에서는 2/3 속도를 오래 유지하고, 중앙으로 들어올 때만 빠르게 가속한다.
      const edgeSpeedCurve = 1 / (1 + Math.exp(-12 * (distanceRatio - .52)));
      const localTargetSpeed = targetSpeed * (
        STAR_ORBIT_EDGE_SPEED_MULTIPLIER
        + (STAR_ORBIT_CENTER_SPEED_MULTIPLIER - STAR_ORBIT_EDGE_SPEED_MULTIPLIER)
          * (1 - edgeSpeedCurve)
      );
      const denominator = radialDerivative ** 2 + radius ** 2;
      const root = Math.sqrt(Math.max(
        0,
        denominator * localTargetSpeed ** 2
          - radialDerivative ** 2 * radius ** 2 * planeAngularSpeed ** 2,
      ));
      return (-(radius ** 2) * planeAngularSpeed + root) / denominator;
    };

    const advanceTheta = (theta: number, delta: number) => {
      const k1 = thetaRate(theta);
      const k2 = thetaRate(theta + k1 * delta / 2);
      const k3 = thetaRate(theta + k2 * delta / 2);
      const k4 = thetaRate(theta + k3 * delta);
      return theta + delta * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
    };

    const isInsideIndicator = (theta: number) => (
      Math.abs(STAR_ORBIT_AMPLITUDE * Math.cos(STAR_ORBIT_FREQUENCY * theta))
        <= STAR_INDICATOR_RADIUS
    );

    const positionAt = (theta: number, time: number, front: boolean): OrbitSample => {
      const planeAngle = planeAngularSpeed * time;
      const radius = STAR_ORBIT_AMPLITUDE * Math.cos(STAR_ORBIT_FREQUENCY * theta);
      const displayAngle = theta + planeAngle;
      return {
        time,
        x: center + radius * Math.cos(displayAngle),
        y: center + radius * Math.sin(displayAngle),
        front,
      };
    };

    let theta = 0;
    let simulatedTime = -historyWindow;
    let insideIndicator = isInsideIndicator(theta);
    let boundaryCrossings = 0;
    let orbitFront = true;
    const advanceSimulation = (delta: number) => {
      theta = advanceTheta(theta, delta);
      const nextInsideIndicator = isInsideIndicator(theta);
      if (nextInsideIndicator !== insideIndicator) {
        boundaryCrossings += 1;
        insideIndicator = nextInsideIndicator;
        if (boundaryCrossings === 2) {
          orbitFront = !orbitFront;
          boundaryCrossings = 0;
        }
      }
    };
    const history: OrbitSample[] = [positionAt(theta, simulatedTime, orbitFront)];
    while (simulatedTime < 0) {
      const delta = Math.min(integrationStep, -simulatedTime);
      advanceSimulation(delta);
      simulatedTime += delta;
      history.push(positionAt(theta, simulatedTime, orbitFront));
    }

    const startedAt = performance.now();
    let frameId = 0;
    const sampleAt = (targetTime: number) => {
      let low = 0;
      let high = history.length - 1;
      while (low + 1 < high) {
        const middle = Math.floor((low + high) / 2);
        if (history[middle].time <= targetTime) low = middle;
        else high = middle;
      }
      const before = history[low];
      const after = history[Math.min(history.length - 1, high)];
      const range = after.time - before.time;
      const ratio = range > 0 ? Math.max(0, Math.min(1, (targetTime - before.time) / range)) : 0;
      return {
        x: before.x + (after.x - before.x) * ratio,
        y: before.y + (after.y - before.y) * ratio,
        front: ratio < .5 ? before.front : after.front,
      };
    };

    const animate = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      while (simulatedTime < elapsed) {
        const delta = Math.min(integrationStep, elapsed - simulatedTime);
        advanceSimulation(delta);
        simulatedTime += delta;
      }
      history.push(positionAt(theta, simulatedTime, orbitFront));
      while (history.length > 2 && history[1].time < elapsed - historyWindow) history.shift();

      starRefs.current.forEach((element, index) => {
        if (!element) return;
        const position = sampleAt(elapsed - index * STAR_ORBIT_GAP_SECONDS);
        element.style.left = `${position.x}px`;
        element.style.top = `${position.y}px`;
        element.style.zIndex = position.front ? "50" : "30";
      });
      frameId = window.requestAnimationFrame(animate);
    };
    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [orbitSpeed, planeSpeed]);

  return (
    <div className="star-orbit-layer polar-star-orbit-layer" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span
          className="orbit-star"
          key={index}
          ref={(element) => { starRefs.current[index] = element; }}
        ><span>★</span></span>
      ))}
    </div>
  );
}

function mapRoomKey(position: MapPosition) {
  return `${position.x}:${position.y}`;
}

function parseMapRoomKey(roomKey: string): MapPosition {
  const [x, y] = roomKey.split(":").map(Number);
  return { x, y };
}

function seededRoll(position: MapPosition, seed: number, salt = 0) {
  let hash = Math.imul(position.x + 17 + salt, 374761393)
    ^ Math.imul(position.y + 29, 668265263)
    ^ Math.imul(seed + 11, 1442695041);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function createRandomMapSeed() {
  const randomValue = new Uint32Array(1);
  globalThis.crypto.getRandomValues(randomValue);
  return (randomValue[0] ^ Date.now()) >>> 0;
}

const PLAYER_NAME_SYLLABLES = [
  "아", "에", "이", "오", "우", "야", "예", "요", "유",
  "라", "레", "리", "로", "루", "르", "란", "렌", "린", "론", "룬",
  "카", "케", "키", "코", "쿠", "크", "칸", "켄", "킨", "콘", "쿤",
  "타", "테", "티", "토", "투", "트", "탄", "텐", "틴", "톤", "툰",
  "파", "페", "피", "포", "푸", "프", "판", "펜", "핀", "폰", "푼",
  "사", "세", "시", "소", "수", "스", "산", "센", "신", "손", "순",
  "자", "제", "지", "조", "주", "즈", "잔", "젠", "진", "존", "준",
  "나", "네", "니", "노", "누", "느", "난", "넨", "닌", "논", "눈",
  "마", "메", "미", "모", "무", "므", "만", "멘", "민", "몬", "문",
  "바", "베", "비", "보", "부", "브", "반", "벤", "빈", "본", "분",
  "다", "데", "디", "도", "두", "드", "단", "덴", "딘", "돈", "둔",
  "하", "헤", "히", "호", "후", "흐", "한", "헨", "힌", "혼", "훈",
  "엘", "알", "일", "올", "울", "벨", "델", "셀", "젤", "첼", "켈", "텔", "펠", "헬",
] as const;

function createRandomPlayerName() {
  let seed = createRandomMapSeed();
  const length = 2 + seed % 3;
  return Array.from({ length }, () => {
    seed = Math.imul(seed ^ (seed >>> 16), 2246822507) >>> 0;
    return PLAYER_NAME_SYLLABLES[seed % PLAYER_NAME_SYLLABLES.length];
  }).join("");
}

function regionStartY(regionIndex: number) {
  return regionIndex * (REGION_HEIGHT + ROCK_BARRIER_HEIGHT);
}

function regionHeight(_regionIndex: number) {
  return REGION_HEIGHT;
}

function getDungeonRegionIndex(position: MapPosition) {
  if (
    position.x < DUNGEON_MIN_X
    || position.x > DUNGEON_MAX_X
    || position.y < 0
  ) return null;
  for (let regionIndex = 0; regionIndex < REGION_COUNT; regionIndex += 1) {
    const startY = regionStartY(regionIndex);
    if (position.y >= startY && position.y < startY + regionHeight(regionIndex)) {
      return regionIndex;
    }
  }
  return null;
}

function safeAreaCenterY(regionIndex: number) {
  return regionStartY(regionIndex) + Math.floor(regionHeight(regionIndex) / 2);
}

function getSafeAreaRegionIndex(position: MapPosition) {
  for (let regionIndex = 0; regionIndex < REGION_COUNT; regionIndex += 1) {
    const centerY = safeAreaCenterY(regionIndex);
    const isCenterRow = position.y === centerY
      && position.x >= SAFE_AREA_ENTRY_X
      && position.x <= SAFE_AREA_PORTAL_X;
    const isVerticalArm = position.x === SAFE_AREA_HEAL_X
      && Math.abs(position.y - centerY) === 1;
    if (isCenterRow || isVerticalArm) return regionIndex;
  }
  return null;
}

function isSafeAreaPosition(position: MapPosition) {
  return getSafeAreaRegionIndex(position) !== null;
}

function getSafeAreaLayoutRegionIndex(position: MapPosition) {
  for (let regionIndex = 0; regionIndex < REGION_COUNT; regionIndex += 1) {
    if (
      Math.abs(position.x - SAFE_AREA_HEAL_X) <= 2
      && Math.abs(position.y - safeAreaCenterY(regionIndex)) <= 2
    ) return regionIndex;
  }
  return null;
}

function distanceToSafeArea(position: MapPosition, regionIndex: number) {
  const centerY = safeAreaCenterY(regionIndex);
  const interior = [
    { x: SAFE_AREA_HEAL_X, y: centerY - 1 },
    { x: SAFE_AREA_ENTRY_X, y: centerY },
    { x: SAFE_AREA_HEAL_X, y: centerY },
    { x: SAFE_AREA_PORTAL_X, y: centerY },
    { x: SAFE_AREA_HEAL_X, y: centerY + 1 },
  ];
  return Math.min(...interior.map((cell) => chebyshevDistance(position, cell)));
}

function safeAreaEntry(regionIndex: number): MapPosition {
  return { x: SAFE_AREA_ENTRY_X, y: safeAreaCenterY(regionIndex) };
}

function nextRegionEntry(regionIndex: number): MapPosition {
  return {
    x: 0,
    y: regionStartY(Math.min(REGION_COUNT - 1, regionIndex + 1)),
  };
}

function isPortalColumn(x: number, regionIndex: number, seed: number) {
  const bottomY = regionStartY(regionIndex) + regionHeight(regionIndex) - 1;
  const candidates = Array.from(
    { length: DUNGEON_MAX_X - DUNGEON_MIN_X + 1 },
    (_, index) => DUNGEON_MIN_X + index,
  )
    .filter((column) =>
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
  if (localY === regionHeight(regionIndex) - 1 && isPortalColumn(position.x, regionIndex, seed)) {
    return false;
  }
  const portalEligible = localY === regionHeight(regionIndex) - 1;
  const availableChance = portalEligible ? 1 - PORTAL_NODE_CHANCE : 1;
  return seededRoll(position, seed) >= (SHOP_NODE_CHANCE + SHRINE_NODE_CHANCE + CAMPFIRE_NODE_CHANCE) / availableChance;
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

function getRoomType(position: MapPosition, seed: number): RoomType {
  if (position.x === MAP_START.x && position.y === MAP_START.y) return "empty";
  const safeRegion = getSafeAreaRegionIndex(position);
  if (safeRegion !== null) {
    if (position.y !== safeAreaCenterY(safeRegion)) return "empty";
    if (position.x === SAFE_AREA_ENTRY_X) return "blessing";
    if (position.x === SAFE_AREA_HEAL_X) return "heal";
    return "safePortal";
  }
  const safeLayoutRegion = getSafeAreaLayoutRegionIndex(position);
  if (safeLayoutRegion !== null) {
    const offsetX = position.x - SAFE_AREA_HEAL_X;
    const offsetY = position.y - safeAreaCenterY(safeLayoutRegion);
    const isOuterCorner = Math.abs(offsetX) === 2 && Math.abs(offsetY) === 2;
    if (isOuterCorner) return "empty";
    return "rock";
  }
  if (
    position.x >= DUNGEON_MIN_X
    && position.x <= DUNGEON_MAX_X
  ) {
    if (position.y >= -ROCK_BARRIER_HEIGHT && position.y < 0) return "rock";
    const regionIndex = getDungeonRegionIndex(position);
    if (regionIndex !== null) {
      const localY = position.y - regionStartY(regionIndex);
      if (localY === 0 && position.x === 0) return "empty";
      if (
        localY === regionHeight(regionIndex) - 1
        && isPortalColumn(position.x, regionIndex, seed)
      ) return "portal";
      const portalEligible = localY === regionHeight(regionIndex) - 1;
      const availableChance = portalEligible ? 1 - PORTAL_NODE_CHANCE : 1;
      const roll = seededRoll(position, seed);
      if (roll < SHOP_NODE_CHANCE / availableChance) return "shop";
      if (roll < (SHOP_NODE_CHANCE + SHRINE_NODE_CHANCE) / availableChance) return "shrine";
      if (roll < (SHOP_NODE_CHANCE + SHRINE_NODE_CHANCE + CAMPFIRE_NODE_CHANCE) / availableChance) return "campfire";
      if (isRockClusterCell(position, seed)) return "rock";
      return "empty";
    }
    for (let regionIndex = 0; regionIndex < REGION_COUNT - 1; regionIndex += 1) {
      const barrierStart = regionStartY(regionIndex) + regionHeight(regionIndex);
      if (
        position.y >= barrierStart
        && position.y < barrierStart + ROCK_BARRIER_HEIGHT
      ) return "rock";
    }
  }
  return "void";
}

function isWalkableRoom(type: RoomType) {
  return type !== "rock" && type !== "void";
}

function visibleMapRoomKeys(
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

function isMapEnemySpawnCell(position: MapPosition, seed: number) {
  const regionIndex = getDungeonRegionIndex(position);
  return chebyshevDistance(position, MAP_START) > 1
    && regionIndex !== null
    && getEncounterSpawnPool(regionIndex, 1).length > 0
    && !isSafeAreaPosition(position)
    && getRoomType(position, seed) === "empty";
}

function createPreGeneratedMapEnemyWorld(seed: number) {
  const spawnCells: MapPosition[] = [];
  for (let y = 0; y < MAP_ROWS; y += 1) {
    for (let x = DUNGEON_MIN_X; x <= DUNGEON_MAX_X; x += 1) {
      const position = { x, y };
      if (isMapEnemySpawnCell(position, seed)) spawnCells.push(position);
    }
  }
  const world = createMapEnemyWorld(spawnCells, seed, SEWER_ENCOUNTER_COUNT);
  return {
    enemies: world.enemies.map((enemy) => {
      const regionIndex = getDungeonRegionIndex(enemy.position) ?? -1;
      const candidates = getEncounterSpawnPool(regionIndex, seededRoll(enemy.position, seed, 4000));
      const roll = seededRoll(enemy.position, seed, 4001);
      return {
        ...enemy,
        encounterIndex: candidates[Math.min(candidates.length - 1, Math.floor(roll * candidates.length))],
      };
    }),
  };
}

function createPreGeneratedMapFloorDrops(seed: number) {
  const cards: Record<string, Card[]> = {};
  const consumables: Record<string, Consumable[]> = {};
  let cardIndex = 0;
  for (let y = 0; y < MAP_ROWS; y += 1) {
    for (let x = DUNGEON_MIN_X; x <= DUNGEON_MAX_X; x += 1) {
      const position = { x, y };
      if (getRoomType(position, seed) !== "empty") continue;
      if (seededRoll(position, seed, 7201) >= FLOOR_CARD_DROP_CHANCE) continue;
      const roomKey = mapRoomKey(position);
      if (seededRoll(position, seed, 7202) < 0.3) {
        const weightedPool = [...SPECIAL_CARD_POOL, ...RARE_CARD_POOL, ...RARE_CARD_POOL];
        const blueprint = weightedPool[Math.floor(seededRoll(position, seed, 7203) * weightedPool.length)];
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

function buildKnownRoomRoutes(
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

function routeToRoom(target: MapPosition, routes: Map<string, string | null>) {
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

function getRegionNumber(position: MapPosition) {
  const dungeonRegion = getDungeonRegionIndex(position);
  if (dungeonRegion !== null) return dungeonRegion + 1;
  const safeRegion = getSafeAreaRegionIndex(position);
  return (safeRegion ?? 0) + 1;
}

function isHigherRegionMapEnemy(encounterIndex: number, position: MapPosition) {
  return getEncounterRegionNumber(encounterIndex) > getRegionNumber(position);
}

const DEFENSE_LABEL: Record<DamageType, string> = {
  physical: "방어",
  magic: "마법 방어",
};

type CardBlueprint = Omit<Card, "id" | "revealed">;

const STARTER_CARD_POOL: CardBlueprint[] = [
  { kind: "strike", effect: "strike", rarity: "starter", name: "타격", cost: 1, value: 6, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "defend", rarity: "starter", name: "방어", cost: 1, value: 5, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "defend", rarity: "starter", name: "마법 방어", cost: 1, value: 5, draw: 0, damageType: "magic" },
];

const BASIC_CARD_POOL: CardBlueprint[] = [
  { kind: "strike", effect: "strike", rarity: "basic", name: "잽", cost: 0, value: 6, draw: 0, damageType: "physical" },
  { kind: "strike", effect: "rulerCompass", rarity: "basic", name: "자와 컴퍼스", cost: 1, value: 9, draw: 0, damageType: "physical" },
  { kind: "strike", effect: "strike", rarity: "basic", name: "기회 포착", cost: 1, value: 6, draw: 1, damageType: "physical" },
  { kind: "skill", effect: "deflect", rarity: "basic", name: "기회 창출", cost: 1, value: 5, draw: 1, damageType: "physical" },
  { kind: "skill", effect: "sweep", rarity: "basic", name: "휩쓸기", cost: 1, value: 9, draw: 0, damageType: "physical" },
  { kind: "strike", effect: "boomerang", rarity: "basic", name: "정리 타격", cost: 1, value: 9, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "waterWave", rarity: "basic", name: "물의 파동", cost: 1, value: 5, draw: 1, damageType: "magic" },
  { kind: "skill", effect: "starGuard", rarity: "basic", name: "별의 장막", cost: 2, value: 12, draw: 0, damageType: "physical" },
];

const LEGACY_SPECIAL_CARD_POOL: CardBlueprint[] = [
  { kind: "strike", effect: "ironRampage", rarity: "special", name: "무쇠 난동", cost: 2, value: 8, draw: 0, damageType: "physical" },
];

// 현재 플레이에 등장하는 추가 카드는 이 목록만 사용합니다.
const SPECIAL_CARD_POOL: CardBlueprint[] = [
  { kind: "strike", effect: "obsidianDagger", rarity: "rare", name: "흑요석 단검", cost: 0, value: 1, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "astronomyResearch", rarity: "special", name: "천문학 연구", cost: 1, value: 3, draw: 0, damageType: "physical", forgeCost: 2, exhaust: true, rule: true },
  { kind: "skill", effect: "necromancyResearch", rarity: "special", name: "강령학 연구", cost: 1, value: 3, draw: 0, damageType: "physical", forgeCost: 2, exhaust: true, rule: true },
  { kind: "skill", effect: "metallurgyResearch", rarity: "special", name: "금속학 연구", cost: 1, value: 1, draw: 0, damageType: "physical", exhaust: true, rule: true },
  { kind: "skill", effect: "warmUp", rarity: "special", name: "준비 운동", cost: 0, value: 4, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "starlight", rarity: "special", name: "별빛", cost: 0, value: 2, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "iceShield", rarity: "special", name: "얼음 방패", cost: 1, value: 11, draw: 0, damageType: "magic" },
  { kind: "strike", effect: "fourHit", rarity: "special", name: "4연격", cost: 1, value: 2, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "battlePlan", rarity: "special", name: "전략가", cost: 1, value: 2, draw: 1, damageType: "physical" },
  { kind: "skill", effect: "plateArmor", rarity: "special", name: "낡은 노심", cost: 1, value: 1, draw: 0, damageType: "physical", forgeCost: 3 },
  { kind: "skill", effect: "weaponSharpen", rarity: "special", name: "무기 연마", cost: 1, value: 2, draw: 0, damageType: "physical", exhaust: true },
  { kind: "skill", effect: "armorSharpen", rarity: "special", name: "방어구 연마", cost: 1, value: 2, draw: 0, damageType: "physical", exhaust: true },
  { kind: "skill", effect: "dash", rarity: "special", name: "질주", cost: 1, value: 0, draw: 0, damageType: "physical", forgeCost: 3 },
  { kind: "strike", effect: "suppression", rarity: "special", name: "진압", cost: 3, value: 15, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "starArk", rarity: "special", name: "별의 방주", cost: 3, value: 12, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "counter", rarity: "special", name: "응수", cost: 0, value: 0, draw: 0, damageType: "physical" },
  { kind: "strike", effect: "strike", rarity: "special", name: "묵직한 한 방", cost: 3, value: 30, draw: 0, damageType: "physical" },
  { kind: "strike", effect: "exchange", rarity: "special", name: "치환 합금", cost: 3, value: 15, draw: 0, damageType: "physical", forgeAny: true },
  { kind: "strike", effect: "doubleHit", rarity: "special", name: "청동 철퇴", cost: 2, value: 15, draw: 0, damageType: "physical", forgeCosts: [2, 3] },
  { kind: "skill", effect: "ironWall", rarity: "special", name: "철벽", cost: 2, value: 2, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "combatManual", rarity: "special", name: "전투 교본", cost: 0, value: 2, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "mirrorImage", rarity: "special", name: "거울상", cost: 0, value: 0, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "blessing", rarity: "special", name: "가호", cost: 1, value: 1, draw: 0, damageType: "magic", forgeCost: 2 },
];

const RARE_CARD_POOL: CardBlueprint[] = [
  { kind: "skill", effect: "steelHeart", rarity: "rare", name: "강철심장", cost: 1, value: 2, draw: 0, damageType: "physical", exhaust: true },
  { kind: "skill", effect: "rapidFire", rarity: "rare", name: "연사", cost: 0, value: 0, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "superStrategist", rarity: "rare", name: "전술가", cost: 1, value: 5, draw: 0, damageType: "physical", exhaust: true },
  { kind: "skill", effect: "grimoire", rarity: "rare", name: "마도서", cost: 0, value: 1, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "supernova", rarity: "rare", name: "초신성", cost: 0, value: 3, draw: 0, damageType: "physical", exhaust: true },
  { kind: "strike", effect: "meteor", rarity: "rare", name: "유성우", cost: 2, value: 7, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "massDeal", rarity: "rare", name: "대분배", cost: 1, value: 0, draw: 0, damageType: "physical", forgeCost: 3, exhaust: true, rule: true },
  { kind: "skill", effect: "sturdyStance", rarity: "rare", name: "견고한 태세", cost: 2, value: 0, draw: 0, damageType: "physical", exhaust: true, rule: true },
  { kind: "skill", effect: "lawResearch", rarity: "rare", name: "법학 연구", cost: 2, value: 1, draw: 0, damageType: "physical", exhaust: true, rule: true },
  { kind: "strike", effect: "odinSpear", rarity: "rare", name: "오딘의 창", cost: 6, value: 40, draw: 0, damageType: "physical" },
];

const LEGENDARY_CARD_POOL: CardBlueprint[] = [
  { kind: "skill", effect: "horologium", rarity: "legendary", name: "호롤로지움", cost: 0, value: 1, draw: 0, damageType: "physical", exhaust: true },
  { kind: "skill", effect: "ophiuchus", rarity: "legendary", name: "오피쿠우스", cost: 1, value: 5, draw: 0, damageType: "physical", exhaust: true },
  { kind: "skill", effect: "aries", rarity: "legendary", name: "아리에스", cost: 0, value: 5, draw: 0, damageType: "physical", exhaust: true },
  { kind: "strike", effect: "hydra", rarity: "legendary", name: "히드라", cost: 2, value: 9, draw: 0, damageType: "physical" },
  { kind: "skill", effect: "orion", rarity: "legendary", name: "오리온", cost: 1, value: 10, draw: 0, damageType: "physical", exhaust: true },
  { kind: "skill", effect: "cassiopeia", rarity: "legendary", name: "카시오페이아", cost: -3, value: 0, draw: 0, damageType: "physical" },
];

// 카드가 어느 현재 풀에 추가되든 디버그 ALL 덱에 자동으로 반영한다.
function uniqueCardBlueprints(pools: CardBlueprint[][]) {
  const seen = new Set<string>();
  return pools.flat().filter((card) => {
    const key = `${card.name}|${card.effect}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const ALL_CARD_BLUEPRINTS = uniqueCardBlueprints([
  STARTER_CARD_POOL,
  BASIC_CARD_POOL,
  LEGACY_SPECIAL_CARD_POOL,
  SPECIAL_CARD_POOL,
  RARE_CARD_POOL,
  LEGENDARY_CARD_POOL,
]);
const DEBUG_ALL_CARD_BLUEPRINTS: CardBlueprint[] = ALL_CARD_BLUEPRINTS;
const DEBUG_CARD_RARITIES: Array<{ rarity: CardRarity; label: string }> = [
  { rarity: "starter", label: "시작 카드" },
  { rarity: "basic", label: "일반 카드" },
  { rarity: "special", label: "특별 카드" },
  { rarity: "rare", label: "희귀 카드" },
  { rarity: "legendary", label: "전설 카드" },
];

const CARD_POOL_DRAW_EFFECTS = new Set<CardEffect>([
  "pommel", "deflect", "prepare", "drawEachPile", "dash", "battlePlan", "fileDraw", "flood", "adrenaline", "astronomyResearch", "necromancyResearch",
]);
const CARD_POOL_ENERGY_EFFECTS = new Set<CardEffect>([
  "focus", "adrenaline", "berserk", "ventilate", "plateArmor", "charge", "flood", "endStart", "supernova", "aries",
]);
const CARD_POOL_DEFENSE_EFFECTS = new Set<CardEffect>([
  "defend", "deflect", "iceShield", "waterWave", "starGuard", "starArk", "ironWall", "ironWave", "ironRampage", "suppression", "odinSpear",
]);
const CARD_POOL_STAR_EFFECTS = new Set<CardEffect>([
  "battlePlan", "rulerCompass", "starlight", "starGuard", "starArk", "superStrategist", "flood", "aries", "astronomyResearch", "necromancyResearch", "metallurgyResearch",
]);
const CARD_POOL_STATUS_EFFECTS = new Set<CardEffect>([
  "steelHeart", "warmUp", "rapidFire", "counter", "weaponSharpen", "armorSharpen", "supernova", "blessing", "mirrorImage",
]);

type DefenseCardLike = Pick<CardBlueprint, "effect" | "damageType">;

function cardGivesPhysicalDefense(card: DefenseCardLike) {
  if (card.effect === "defend") return card.damageType === "physical";
    return ["deflect", "starGuard", "ironWall", "ironWave", "ironRampage", "suppression", "starArk", "odinSpear"].includes(card.effect);
}

function cardGivesMagicDefense(card: DefenseCardLike) {
  if (card.effect === "defend") return card.damageType === "magic";
  return ["iceShield", "waterWave", "starArk"].includes(card.effect);
}

function cardPoolCost(card: CardBlueprint) {
  return UNPLAYABLE_CARD_EFFECTS.has(card.effect)
    ? -1
    : card.effect === "ironWall" ? IRON_WALL_COST : card.cost;
}

function cardPoolShare(count: number, total: number) {
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
  "에너지": "카드를 사용하는 데 필요한 자원입니다. 턴 시작 시 회복됩니다.",
  "힘": "힘 X는 피해를 X만큼 증가시킵니다.",
  "강인함": "강인함 X는 방어와 마법 방어 획득량을 X만큼 증가시킵니다.",
  "물리 저항": "받는 물리 피해가 절반이 됩니다. (소수점은 버립니다.)",
  "마법 저항": "받는 마법 피해가 절반이 됩니다. (소수점은 버립니다.)",
  "물리 취약": "받는 물리 피해가 2배가 됩니다.",
  "마법 취약": "받는 마법 피해가 2배가 됩니다.",
  "면역": "지속 중에는 피해를 받지 않습니다.",
};

function getCardKeywordInfos(card: Card): CardKeywordInfo[] {
  const keywords: string[] = [];
  const add = (keyword: string) => {
    if (!keywords.includes(keyword)) keywords.push(keyword);
  };
  if (card.rule) add("룰");
  if (card.exhaust && !card.rule) add("소멸");
  if (card.token) add("토큰");
  if (card.effect === "obsidianDagger" || card.effect === "odinSpear" || card.forgeCost !== undefined || card.forgeCosts?.length || card.forgeTargetName || card.forgeAny) add("재련");
  if (card.solitaireRule === "spell") add("주문");
  if (UNPLAYABLE_CARD_EFFECTS.has(card.effect)) add("사용 불가");
  if (CARD_POOL_ENERGY_EFFECTS.has(card.effect)) add("에너지");
  if (card.effect === "obsidianDagger") {
    add("소멸");
  }
  if (card.effect === "steelHeart" || card.effect === "ironWall") add("물리 저항");
  if (card.effect === "steelHeart") add("마법 저항");
  if (card.effect === "blessing") add("마법 저항");
  if (card.effect === "berserk") add("물리 취약");
  if (card.effect === "transcend") add("면역");
  if (CARD_POOL_STAR_EFFECTS.has(card.effect) || ["grimoire", "meteor", "supernova"].includes(card.effect)) add("★");
  if (["warmUp", "weaponSharpen", "augment", "orion", "combatManual", "relic", "transcend"].includes(card.effect)) add("힘");
  if (["augment", "armorSharpen", "combatManual"].includes(card.effect)) add("강인함");
  return keywords
    .map((name) => ({ name, description: CARD_KEYWORD_DESCRIPTIONS[name] }))
    .filter((keyword): keyword is CardKeywordInfo => Boolean(keyword.description));
}

function createBattleRewardCard(id: number, rareChance: number): Card {
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

function createDeck(): Card[] {
  const make = (
    count: number,
    blueprint: CardBlueprint,
  ) => Array.from({ length: count }, () => ({ ...blueprint }));
  const starterSpecialNames = ["전투 교본", "자와 컴퍼스", "기회 창출", "별의 장막", "정리 타격"];
  const starterSpecialCards = starterSpecialNames.map((name) => {
    const blueprint = SPECIAL_CARD_POOL.find((card) => card.name === name)
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

function createAdrenalineCard(): Card {
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

function createSlimeCard(id: number): Card {
  return {
    id,
    kind: "skill",
    effect: "slime",
    rarity: "basic",
    name: "유독성 점액",
    cost: 0,
    value: 1,
    draw: 0,
    damageType: "physical",
    revealed: true,
    token: true,
    enemyToken: true,
  };
}

function createSoilCard(id: number): Card {
  return {
    id,
    kind: "skill",
    effect: "soil",
    rarity: "basic",
    name: "흙",
    cost: 0,
    value: 0,
    draw: 0,
    damageType: "physical",
    revealed: false,
    token: true,
    enemyToken: true,
  };
}

function createRelicCard(id: number): Card {
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

function createDebugAllCardsDeck(startId: number): { deck: DeckCase; nextCardId: number } {
  let nextCardId = startId;
  const cards = [
    ...DEBUG_ALL_CARD_BLUEPRINTS.map((blueprint) => ({ ...blueprint, id: nextCardId++, revealed: false })),
    { ...createAdrenalineCard(), id: nextCardId++, revealed: false },
    createSlimeCard(nextCardId++),
    createSoilCard(nextCardId++),
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

function createDeckName() {
  const length = 1 + Math.floor(Math.random() * 6);
  const spaceAfter = length > 2 && Math.random() < .3
    ? 1 + Math.floor(Math.random() * (length - 1))
    : -1;
  return Array.from({ length }, (_, index) => `${PLAYER_NAME_SYLLABLES[Math.floor(Math.random() * PLAYER_NAME_SYLLABLES.length)]}${index + 1 === spaceAfter ? " " : ""}`).join("");
}

const DECK_EDITION_INFO: Record<DeckEdition, { name: string; description: string }> = {
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

function rollDeckEditions(initialChance = 0.5): DeckEdition[] {
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

function createEditionColors(editions: DeckEdition[]) {
  return Object.fromEntries(editions.map((edition) => [
    edition,
    EDITION_COLORS[Math.floor(Math.random() * EDITION_COLORS.length)],
  ])) as Partial<Record<DeckEdition, string>>;
}

function DeckName({ deck, showEditions = true }: { deck: DeckCase; showEditions?: boolean }) {
  return (
    <span className="deck-name-with-editions">
      {showEditions && deck.editions.map((edition) => (
        <span
          className="deck-edition-name"
          key={edition}
          style={{ color: deck.editionColors[edition] }}
        >
          {DECK_EDITION_INFO[edition].name}
          <span className="deck-edition-tooltip" role="tooltip">
            <b>{DECK_EDITION_INFO[edition].name}</b> — {DECK_EDITION_INFO[edition].description}
          </span>{" "}
        </span>
      ))}{`덱 '${deck.name}'`}
    </span>
  );
}

function createStarterDeck(): DeckCase {
  return { id: "starter", name: "", capacity: STARTER_DECK_CAPACITY, cards: createDeck(), editions: [], editionColors: {} };
}

function rollDeckTier(regionNumber: number) {
  return regionNumber;
}

function createRandomDeck(regionNumber: number, startId: number, editionBonus = 0, capacityBonus = 0): DeckCase {
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

function createConsumable(type: ConsumableType, id: string): Consumable {
  if (type === "mindEyeTicket") {
    return {
      id,
      type,
      name: "심안 티켓",
      description: "20번 이동하는 동안 9×9 시야를 얻습니다.",
    };
  }
  if (type === "bombTicket") {
    return {
      id,
      type,
      name: "폭탄 티켓",
      description: "점화한 뒤 바닥에 내려놓으면 3번 이동 후 폭발합니다.",
    };
  }
  if (type === "cloneTicket") {
    return {
      id,
      type,
      name: "복제 티켓",
      description: "카드나 티켓 하나를 복제합니다.",
    };
  }
  if (type === "extractTicket") {
    return { id, type, name: "추출 티켓", description: "장소와 관계없이 덱에서 카드 1장을 추출합니다." };
  }
  if (type === "transformTicket") {
    return { id, type, name: "변환 티켓", description: "카드나 티켓을 같은 희귀도의 다른 무작위 카드나 티켓으로 바꿉니다." };
  }
  if (type === "mapTicket") {
    return { id, type, name: "지도 티켓", description: "같은 지역에서 가까운 상점·추출의 성소·모닥불 2곳을 밝힙니다." };
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

function createBattleReward(
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
  return {
    gold,
    cards: decks.length > 0 ? [] : [createBattleRewardCard(nextCardId, rareCardChance)],
    decks,
    consumableType: Math.random() < Math.min(1, 0.5 + ticketBonus)
      ? consumableTypeFromRoll(Math.random())
      : null,
  };
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function buildPiles(
  cards: Card[],
  cardsPerPile = 5,
  firstPileFaceUp = false,
  extraEmptyPiles = 0,
  rareCardsFaceUp = false,
  fixedPileCount?: number,
  evenDeal = false,
): Card[][] {
  const pileCount = fixedPileCount ?? Math.ceil(cards.length / cardsPerPile) + extraEmptyPiles;
  const dealtPiles = evenDeal
    ? dealCardsEvenlyToPiles(cards, pileCount)
    : dealCardsToFixedPiles(cards, pileCount, cardsPerPile);
  return dealtPiles.map((sourcePile, pileIndex) => {
    const pile = sourcePile.map((card) => ({
      ...card,
      revealed: (firstPileFaceUp && pileIndex === 0) || (rareCardsFaceUp && card.rarity === "rare"),
    }));
    if (pile.length > 0) pile[pile.length - 1].revealed = true;
    return pile;
  });
}

function prepareDeckForPiles(deck: Card[]) {
  return shuffle(deck.map((card) => ({
    ...card,
    revealed: false,
  })));
}

function drawFromPiles(piles: Card[][]) {
  const nextPiles = piles.map((pile) => [...pile]);
  const hand: Card[] = [];
  nextPiles.forEach((pile) => {
    const card = pile.pop();
    if (card) hand.push({ ...card, revealed: true });
    if (pile.length > 0) {
      pile[pile.length - 1] = { ...pile[pile.length - 1], revealed: true };
    }
  });
  return { piles: nextPiles, hand };
}

function drawFromPileIndexes(piles: Card[][], indexes: number[]) {
  const nextPiles = piles.map((pile) => [...pile]);
  const hand: Card[] = [];
  for (const index of indexes) {
    const pile = nextPiles[index];
    if (!pile) continue;
    const card = pile.pop();
    if (card) hand.push({ ...card, revealed: true, drawSlot: index, drawSlotCount: piles.length });
    if (pile.length > 0) pile[pile.length - 1] = { ...pile[pile.length - 1], revealed: true };
  }
  return { piles: nextPiles, hand };
}

function drawFromFirstPile(piles: Card[][]) {
  const nextPiles = piles.map((pile) => [...pile]);
  const pile = nextPiles[0];
  const card = pile?.pop();
  if (!card) return { piles: nextPiles, hand: [] as Card[] };
  if (pile.length > 0) pile[pile.length - 1] = { ...pile[pile.length - 1], revealed: true };
  return { piles: nextPiles, hand: [{ ...card, revealed: true }] };
}

function drawOneFromPiles(piles: Card[][]) {
  const nextPiles = piles.map((pile) => [...pile]);
  const pile = nextPiles.find((candidate) => candidate.length > 0);
  if (!pile) return { piles: nextPiles, hand: [] as Card[] };
  const card = pile.pop();
  if (!card) return { piles: nextPiles, hand: [] as Card[] };
  if (pile.length > 0) pile[pile.length - 1] = { ...pile[pile.length - 1], revealed: true };
  return { piles: nextPiles, hand: [{ ...card, revealed: true }] };
}

function drawRandomFromPiles(piles: Card[][], count: number) {
  const nextPiles = piles.map((pile) => [...pile]);
  const hand: Card[] = [];
  for (let draw = 0; draw < count; draw += 1) {
    const availableIndexes = nextPiles
      .map((pile, index) => pile.length > 0 ? index : -1)
      .filter((index) => index >= 0);
    if (availableIndexes.length === 0) break;
    const pileIndex = availableIndexes[Math.floor(Math.random() * availableIndexes.length)];
    const pile = nextPiles[pileIndex];
    const card = pile.pop();
    if (card) hand.push({ ...card, revealed: true });
    if (pile.length > 0) pile[pile.length - 1] = { ...pile[pile.length - 1], revealed: true };
  }
  return { piles: nextPiles, hand };
}

function waitingState(
  playerHp = MAX_PLAYER_HP,
  enemies: EnemyState[] = createSewerEncounter(),
): GameState {
  return {
    piles: [],
    hand: [],
    discard: [],
    initialDeck: [],
    removedFromReshuffleIds: [],
    clearPlan: null,
    energy: 3,
    stars: 2,
    pendingDraws: 0,
    pendingPileDrawCount: 0,
    pendingDashRandomDraws: 0,
    pendingResearchDraw: null,
    astronomyResearchUses: 0,
    necromancyResearchUses: 0,
    pendingDiscards: 0,
    pendingSweep: false,
    pendingPileOperation: null,
    turn: 1,
    playerHp,
    playerPhysicalBlock: 0,
    playerMagicBlock: 0,
    playerPhysicalResistance: 0,
    playerMagicResistance: 0,
    playerPhysicalVulnerability: 0,
    playerMagicVulnerability: 0,
    strength: 0,
    temporaryStrength: 0,
    agility: 0,
    defenseMultiplier: 1,
    evenDealOnReshuffle: false,
    preserveDefenseOnTurnEnd: false,
    activeRuleCards: [],
    forgeCount: 0,
    damageTakenMultiplier: 1,
    invulnerable: false,
    doubleNextAttack: false,
    starsSpent: 0,
    reflectDamage: 0,
    toxicSlimeAdded: false,
    extraTurns: 0,
    deckEditions: [],
    enemies,
    status: "playing",
    message: "카드를 준비하고 있습니다.",
  };
}

function dealtState(
  playerHp = MAX_PLAYER_HP,
  deck = createDeck(),
  enemies: EnemyState[] = createSewerEncounter(),
  deckEditions: DeckEdition[] = [],
): GameState {
  const preparedDeck = prepareDeckForPiles(deck);
  const initialPiles = buildPiles(
    preparedDeck,
    deckEditions.includes("fantastic") ? 4 : 5,
    deckEditions.includes("transparent"),
    deckEditions.includes("roomy") ? 1 : 0,
    deckEditions.includes("golden"),
  );
  const encounterTokens = enemies.some((enemy) => enemy.variant === "goblin")
    ? [createRelicCard(-10000)]
    : [];
  if (encounterTokens.length > 0) initialPiles[0].unshift(encounterTokens[0]);
  return {
    ...waitingState(playerHp, enemies),
    piles: initialPiles,
    hand: deckEditions.includes("lively") ? [createAdrenalineCard()] : [],
    initialDeck: [...deck, ...encounterTokens].map((card) => ({ ...card, revealed: false })),
    energy: deckEditions.includes("rampaging") ? 4 : 3,
    stars: deckEditions.includes("clever") ? 4 : 2,
    deckEditions,
    evenDealOnReshuffle: false,
    preserveDefenseOnTurnEnd: false,
    activeRuleCards: [],
    message: "파일 배치 완료 — 맨 위 카드를 가져옵니다.",
  };
}

function pickRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function lowestHealthEnemy(enemies: EnemyState[]) {
  return enemies
    .filter((enemy) => enemy.hp > 0)
    .reduce<EnemyState | undefined>((lowest, enemy) => !lowest || enemy.hp < lowest.hp ? enemy : lowest, undefined);
}

function emphasizeEffectNumbers(node: ReactNode): ReactNode {
  if (typeof node === "number") return <span className="effect-number">{node}</span>;
  if (typeof node === "string") {
    return node.split(/(\d+(?:\.\d+)?)/g).map((part, index) =>
      /^\d/.test(part) ? <span className="effect-number" key={`${part}-${index}`}>{part}</span> : part);
  }
  if (Array.isArray(node)) return Children.map(node, emphasizeEffectNumbers);
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children !== undefined) {
    return cloneElement(node, undefined, emphasizeEffectNumbers(node.props.children));
  }
  return node;
}

function starIcons(amount: number) {
  return <span className="effect-star">{"★".repeat(Math.max(0, amount))}</span>;
}

function enemyIntentEffectDescription(action: EnemyAction) {
  const describedEffects = [
    action.strengthGain && `힘 ${action.strengthGain} 획득`,
    action.blockGain && `방어 ${action.blockGain} 획득`,
    action.nextAttackMagic && "다음 공격이 마법 피해",
    action.physicalVulnerabilityGain && `물리 취약 ${action.physicalVulnerabilityGain} 부여`,
    action.nextTurnPhysicalVulnerabilityGain && `다음 턴 시작 시 물리 취약 ${action.nextTurnPhysicalVulnerabilityGain} 부여`,
    action.nextTurnMagicVulnerabilityGain && `다음 턴 시작 시 마법 취약 ${action.nextTurnMagicVulnerabilityGain} 부여`,
    action.discardCount && `파일 맨 위 카드 ${action.discardCount}장 버리기`,
  ].filter(Boolean).join(" · ");
  return describedEffects || (action.attacks.length === 0 ? action.name : "");
}

function EnemyIntentIcons({
  action,
  strength,
  forceMagic,
  physicalResistance,
  magicResistance,
  physicalVulnerability,
  magicVulnerability,
}: {
  action: EnemyAction;
  strength: number;
  forceMagic: boolean;
  physicalResistance: number;
  magicResistance: number;
  physicalVulnerability: number;
  magicVulnerability: number;
}) {
  const effectDescriptions = enemyIntentEffectDescription(action);
  const attackTypes = action.attacks.flatMap((attack) => Array.from(
    { length: attack.hits ?? 1 },
    () => forceMagic ? "magic" : attack.type,
  ));
  const hasRepeatedAttackType = attackTypes.length > 1 && new Set(attackTypes).size === 1;
  const attackIcons = action.attacks.flatMap((attack, attackIndex) => {
    const damageType = forceMagic ? "magic" : attack.type;
    const resistedDamage = reduceEnemyDamageByResistance(
      attack.value + strength,
      damageType,
      physicalResistance,
      magicResistance,
    );
    const damage = resistedDamage * vulnerabilityMultiplier(
      damageType === "physical" ? physicalVulnerability : magicVulnerability,
    );
    return Array.from({ length: attack.hits ?? 1 }, (_, hitIndex) => (
      <span
        className={`intent-icon intent-icon-${damageType}`}
        key={`attack-${attackIndex}-${hitIndex}`}
        aria-label={`${damageType === "magic" ? "마법" : "물리"} 피해 ${damage}`}
      >
        {damageType === "physical" ? (
          <svg viewBox="4 1 56 76" aria-hidden="true">
            <path d="M32 2 53 16 45 51H59V61H39V76H25V61H5V51H19L11 16Z" />
          </svg>
        ) : <strong>{damage}</strong>}
        {damageType === "physical" && <strong>{damage}</strong>}
      </span>
    ));
  });
  const effectIcon = effectDescriptions && <>
    <span
      className={`intent-effect-icon ${attackIcons.length > 0 ? "is-superscript" : ""}`}
      aria-label={effectDescriptions}
    >*</span>
  </>;
  return (
    <span className={`intent-icons ${attackIcons.length === 0 ? "is-effect-only" : ""} ${attackIcons.length > 1 ? "is-multi-attack" : ""} ${hasRepeatedAttackType ? "is-same-type" : ""}`}>
      {attackIcons}
      {effectIcon}
    </span>
  );
}

function changedNumber(value: number, baseValue: number) {
  const change = value - baseValue;
  const direction = change === 0 ? "" : change > 0 ? "is-positive" : "is-negative";
  return <span className={`number-delta ${direction}`}>{value}</span>;
}

const DEFENSE_WATERMARK_EFFECTS = new Set<CardEffect>([
  "defend",
  "deflect",
  "iceShield",
  "waterWave",
  "ironWall",
  "starGuard",
  "starArk",
]);

function cardWatermarkCategory(card: Card) {
  if (card.kind === "strike" || card.effect === "sweep" || card.effect === "doubleHit") return "attack";
  if (DEFENSE_WATERMARK_EFFECTS.has(card.effect)) return "defense";
  return "skill";
}

function CardFace({
  card,
  starsSpent = 0,
  strength = 0,
  agility = 0,
  defenseMultiplier = 1,
  ruleCostReduction = 0,
  forgeCount = 0,
}: {
  card: Card;
  starsSpent?: number;
  strength?: number;
  agility?: number;
  defenseMultiplier?: number;
  ruleCostReduction?: number;
  forgeCount?: number;
}) {
  const cardEffectRef = useRef<HTMLSpanElement | null>(null);
  const displayedCost = UNPLAYABLE_CARD_EFFECTS.has(card.effect)
    ? "-"
    : cardEnergyCost(card, ruleCostReduction, forgeCount);
  const damageValue = card.value + strength;
  const defenseValue = (card.value + agility) * defenseMultiplier;
  const damageNumber = changedNumber(damageValue, card.value);
  const defenseNumber = changedNumber(defenseValue, card.value);
  const waveDefenseNumber = changedNumber(5 * defenseMultiplier, 5);
  const rampageDefenseNumber = changedNumber(8 * defenseMultiplier, 8);
  const costChangeClass = displayedCost !== "-" && typeof displayedCost === "number"
    && displayedCost < card.cost ? "is-positive" : card.baseCost === undefined
      ? ""
      : card.cost < card.baseCost ? "is-positive" : card.cost > card.baseCost ? "is-negative" : "";
  useLayoutEffect(() => {
    const effect = cardEffectRef.current;
    if (!effect) return;
    const updateEffectShift = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(effect).lineHeight);
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;
      const segments = [
        effect.querySelector<HTMLElement>(".card-effect-copy"),
        ...Array.from(effect.querySelectorAll<HTMLElement>(".forge-rule")),
      ].filter((segment): segment is HTMLElement => Boolean(segment));
      const lineCount = segments.reduce((total, segment) => (
        total + Math.max(1, Math.round(segment.getBoundingClientRect().height / lineHeight))
      ), 0);
      const shift = Math.min(8, Math.max(0, lineCount - 1) * 1.2);
      effect.style.setProperty("--card-effect-shift", `${shift}px`);
    };
    updateEffectShift();
    const observer = new ResizeObserver(updateEffectShift);
    observer.observe(effect);
    return () => observer.disconnect();
  }, [card.id, card.effect, card.value, card.forged, card.forgeCostsCompleted?.join(","), starsSpent, strength, agility, defenseMultiplier]);
  const effectText = (() => {
    switch (card.effect) {
      case "strike":
        return <><span><span className="effect-type damage">피해</span>를 {damageNumber} 줍니다.</span>{card.draw > 0 && <span>카드를 {card.draw}장 뽑습니다.</span>}</>;
      case "pommel":
        return <><span><span className="effect-type damage">피해</span>를 {damageNumber} 줍니다.</span><span>첫 번째 파일에서 카드를 1장 뽑습니다.</span></>;
      case "defend":
        return <span><span className={`effect-type ${card.damageType}`}>{DEFENSE_LABEL[card.damageType]}</span>를 {defenseNumber} 얻습니다.</span>;
      case "deflect":
        return <><span><span className="effect-type physical">방어</span>를 {defenseNumber} 얻습니다.</span><span>카드를 1장 뽑습니다.</span></>;
      case "steelHeart":
        return <span><strong className="effect-keyword">물리 저항</strong>과 <strong className="effect-keyword">마법 저항</strong>을 {card.value} 얻습니다.</span>;
      case "battlePlan":
        return <>{card.value > 0 && <span>{starIcons(card.value)}을 얻습니다.</span>}{card.draw > 0 && <span>카드를 {card.draw}장 뽑습니다.</span>}</>;
      case "prepare":
        return <span>카드를 1장 뽑고 1장 버립니다.</span>;
      case "focus":
        return <span><strong className="effect-keyword">에너지</strong>를 1 얻습니다. 카드를 1장 버립니다.</span>;
      case "adrenaline":
        return <span><strong className="effect-keyword">에너지</strong>를 1 얻습니다. 카드를 {card.draw}장 뽑습니다.</span>;
      case "sweep":
        return <span>모든 적에게 <span className="effect-type damage">피해</span>를 {damageNumber} 줍니다.</span>;
      case "drawEachPile":
        return <span>모든 파일에서 카드를 1장씩 뽑습니다.</span>;
      case "dash":
        return <span>카드를 1장 뽑습니다. 무작위 파일에서 카드를 1장씩 {card.forged ? 3 : "1[3]"}번 뽑습니다.</span>;
      case "rulerCompass":
        return <><span><span className="effect-type damage">피해</span>를 {damageNumber} 줍니다.</span><span><span className="effect-star">★</span>을 얻습니다.</span></>;
      case "suppression":
        return <><span><span className="effect-type damage">피해</span>를 {damageNumber} 줍니다.</span><span>막히지 않은 피해만큼 <span className="effect-type physical">방어</span>를 얻습니다.</span></>;
      case "berserk":
        return <span><strong className="effect-keyword">에너지</strong>를 2 얻습니다. <strong className="effect-keyword">물리 취약</strong>을 2 얻습니다.</span>;
      case "transcend":
        return <span>이번 턴 피해에 <strong className="effect-keyword">면역</strong>이 됩니다. <strong className="effect-keyword">힘</strong>을 5 얻습니다.</span>;
      case "rapidFire":
        return <span>이번 턴에 사용하는 다음 공격 카드가 한 번 더 발동합니다.</span>;
      case "iceShield":
        return <span><span className="effect-type magic">마법 방어</span>를 {defenseNumber} 얻습니다.</span>;
      case "magicStrike":
        return <span>체력이 가장 낮은 적에게 <span className="effect-type damage">피해</span>를 {damageNumber} 줍니다.</span>;
      case "shockwave":
        return <span>모든 적에게 <span className="effect-type damage">피해</span>를 {damageNumber} 줍니다.</span>;
      case "ventilate":
        return <span><strong className="effect-keyword">에너지</strong>를 {card.value} 얻습니다.</span>;
      case "plateArmor":
        return <span><strong className="effect-keyword">에너지</strong>를 {card.forged ? 3 : "1[3]"} 얻습니다.</span>;
      case "warmUp":
        return <span><strong className="effect-keyword">힘</strong>을 1 얻습니다. 이번 턴 <strong className="effect-keyword">힘</strong>을 {card.value} 추가로 얻습니다.</span>;
      case "ironWall":
        return <><span><strong className="effect-keyword">물리 저항</strong>을 {IRON_WALL_RESISTANCE} 얻습니다.</span><span><span className="effect-type physical">방어</span>를 5 얻습니다.</span></>;
      case "fourHit":
        return <span><span className="effect-type damage">피해</span>를 {damageNumber}씩 4번 줍니다.</span>;
      case "doubleHit":
        return <span><span className="effect-type damage">피해</span>를 {damageNumber}씩 {card.forged ? 2 : "1[2]"}번 줍니다.</span>;
      case "starlight":
        return <span>{starIcons(card.value)}을 얻습니다.</span>;
      case "augment":
        return <span><strong className="effect-keyword">힘</strong>과 <strong className="effect-keyword">강인함</strong>을 {card.value} 얻습니다.</span>;
      case "fileDraw":
        return <span>{card.forged ? "모든 파일에서 카드를 1장씩 뽑습니다." : "파일 하나를 선택해 위에서부터 카드를 3장 뽑습니다."}</span>;
      case "starGuard":
        return <><span><span className="effect-type physical">방어</span>를 {defenseNumber} 얻습니다.</span><span><span className="effect-star">★</span>을 얻습니다.</span></>;
      case "starArk":
        return <><span><span className="effect-type physical">방어</span>를 12 얻습니다.</span><span><span className="effect-type magic">마법 방어</span>를 12 얻습니다.</span><span><span className="effect-star">★★</span>을 얻습니다.</span></>;
      case "obsidianDagger":
        return <><span><span className="effect-type damage">피해</span>를 {damageNumber} 줍니다.</span><span>[밑패를 <strong className="effect-keyword">소멸</strong>시키고 피해량을 이 카드에 추가합니다.]</span><span>무한히 <strong className="effect-keyword">재련</strong>할 수 있습니다.</span></>;
      case "astronomyResearch":
        return <span>한 턴에 한 번, <span className="effect-star">★★</span>을 지불하고 원하는 파일의 맨 위 카드를 손패로 가져옵니다. {card.forged ? <><span className="effect-star">★★★</span>을 얻습니다.</> : <>[<span className="effect-star">★★★</span>을 얻습니다.]</>}</span>;
      case "necromancyResearch":
        return <span>한 턴에 한 번, <span className="effect-star">★★★</span>을 지불하고 버린 카드 더미에서 원하는 카드 1장을 손패로 가져옵니다. {card.forged ? <><span className="effect-star">★★★</span>을 얻습니다.</> : <>[<span className="effect-star">★★★</span>을 얻습니다.]</>}</span>;
      case "metallurgyResearch":
        return <span>카드를 <strong className="effect-keyword">재련</strong>할 때마다 <strong className="effect-keyword">재련</strong>된 카드를 가져오고 <span className="effect-star">★</span>도 얻습니다.</span>;
      case "lawResearch":
        return <span>내 <strong className="effect-keyword">룰</strong> 카드의 비용이 1 감소합니다. 비용은 0보다 낮아지지 않습니다.</span>;
      case "mirrorImage":
        return <span>내 <span className="effect-type physical">방어</span>와 <span className="effect-type magic">마법 방어</span> 수치를 서로 바꿉니다.</span>;
      case "blessing":
        return <span><strong className="effect-keyword">마법 저항</strong>을 {card.forged ? 2 : "1[2]"} 얻습니다.</span>;
      case "odinSpear":
        return <><span>모든 적에게 <span className="effect-type damage">피해</span>를 {damageNumber} 줍니다.</span><span><span className="effect-type physical">방어</span>를 15 얻습니다.</span><span>이번 전투에서 <strong className="effect-keyword">재련</strong>된 횟수만큼 이 카드의 비용이 1씩 감소합니다.</span></>;
      case "massDeal":
        return <><span>빈 파일을 하나 생성합니다.</span><span>리셔플 시 [그리고 즉시] 파일에 카드를 균등하게 놓습니다.</span></>;
      case "sturdyStance":
        return <span>턴 종료 시 방어와 마법 방어를 절반 보존합니다.</span>;
      case "charge":
        return <span><strong className="effect-keyword">에너지</strong>를 {card.value} 얻습니다.</span>;
      case "weaponSharpen":
        return <span><strong className="effect-keyword">힘</strong>을 {card.value} 얻습니다.</span>;
      case "armorSharpen":
        return <span><strong className="effect-keyword">강인함</strong>을 {card.value} 얻습니다.</span>;
      case "boomerang":
        return card.name === "정리 타격"
          ? <><span><span className="effect-type damage">피해</span>를 {damageNumber} 줍니다.</span><span>파일 하나의 맨 위 카드를 버립니다.</span></>
          : <><span><span className="effect-type damage">피해</span>를 {damageNumber} 줍니다.</span><span>파일 하나의 맨 위 카드를 맨 밑으로 보냅니다.</span></>;
      case "meteor":
        return <span>이번 턴 사용한 <span className="effect-star">★</span>마다 무작위 적에게 <span className="effect-type damage">피해</span>를 {damageNumber} 줍니다. ({starsSpent}번)</span>;
      case "counter":
        return <span>이번 턴 막은 피해를 반사합니다.</span>;
      case "exchange":
        return <span><span className="effect-type damage">피해</span>를 {damageNumber} 줍니다. [밑패와 비용을 교환합니다.]</span>;
      case "flood":
        return <span>피라미드(4-3-2-1). <strong className="effect-keyword">에너지</strong>를 2 얻습니다. 카드를 2장 뽑습니다. <span className="effect-star">★★</span>을 얻습니다.</span>;
      case "endStart":
        return <span>모든 파일이 비어 있어야 사용할 수 있습니다. <strong className="effect-keyword">에너지</strong>를 {card.value} 얻습니다.</span>;
      case "superStrategist":
        return <span><span className="effect-star">★★★★★</span>을 얻습니다.</span>;
      case "slime":
        return <span><strong className="effect-keyword">사용 불가</strong>. 턴 종료 시 손패에 있다면 피해를 12 받습니다.</span>;
      case "relic":
        return <span>도깨비의 <strong className="effect-keyword">힘</strong>을 4 잃게 합니다.</span>;
      case "soil":
        return <span><strong className="effect-keyword">사용 불가</strong>.</span>;
      case "supernova":
        return <span><span className="effect-star">★★★</span>을 잃습니다. <strong className="effect-keyword">에너지</strong>를 3 얻습니다.</span>;
      case "combatManual":
        return <span><strong className="effect-keyword">사용 불가</strong>. 손패에 있는 동안 <strong className="effect-keyword">힘</strong>과 <strong className="effect-keyword">강인함</strong>을 2 얻습니다.</span>;
      case "grimoire":
        return <span><strong className="effect-keyword">사용 불가</strong>. 손패에 있는 동안 카드를 낼 때마다 <span className="effect-star">★</span>을 얻습니다.</span>;
      case "horologium":
        return <span>추가 턴을 얻습니다.</span>;
      case "ophiuchus":
        return <span>체력을 5 회복합니다.</span>;
      case "aries":
        return <span><strong className="effect-keyword">에너지</strong>를 5 얻습니다. <span className="effect-star">★★★★★</span>을 얻습니다.</span>;
      case "hydra":
        return <span>무작위 적에게 <span className="effect-type damage">피해</span>를 9 줍니다. 9번 반복합니다.</span>;
      case "orion":
        return <span><strong className="effect-keyword">힘</strong>을 10 얻습니다.</span>;
      case "cassiopeia":
        return null;
      case "ironWave":
        return <><span><span className="effect-type damage">피해</span>를 {damageNumber} 줍니다.</span><span><span className="effect-type physical">방어</span>를 {waveDefenseNumber} 얻습니다.</span></>;
      case "waterWave":
        return <><span><span className="effect-type magic">마법 방어</span>를 {defenseNumber} 얻습니다.</span><span>카드를 {card.draw}장 뽑습니다.</span></>;
      case "ironRampage":
        return <><span>모든 적에게 <span className="effect-type damage">피해</span>를 {damageNumber} 줍니다.</span><span><span className="effect-type physical">방어</span>를 {rampageDefenseNumber} 얻습니다.</span></>;
    }
  })();
  return (
    <>
      {!card.enemyToken && (
        <span
          className="card-watermark"
          aria-hidden="true"
          style={{ "--card-name-watermark-image": cardNameConstellationImage(card.name) } as CSSProperties}
        />
      )}
      {!UNPLAYABLE_CARD_EFFECTS.has(card.effect) && <span className={`card-cost ${costChangeClass}`}>{displayedCost}</span>}
      <strong className={`card-name rarity-${card.rarity} watermark-category-${cardWatermarkCategory(card)} ${UNPLAYABLE_CARD_EFFECTS.has(card.effect) ? "is-unplayable" : ""} ${card.enemyToken ? "rarity-enemy-token" : ""} ${card.rarity === "legendary" ? "is-painted is-legendary" : ""}`}>
        {card.name}{card.effect === "obsidianDagger" && cardForgeCount(card) > 0 ? ` +${cardForgeCount(card)}` : card.forged ? "+" : ""}
      </strong>
      <span ref={cardEffectRef} className="card-effect">{emphasizeEffectNumbers(<>
        <span className="card-effect-copy">
          {card.rule && <strong className="solitaire-rule effect-keyword rule-keyword">룰.</strong>}
          {card.solitaireRule && <strong className="solitaire-rule solitaire-keyword">{card.solitaireRule === "top" ? "윗패" : card.solitaireRule === "bottom" ? "밑패" : "주문"}</strong>}
          {effectText}
          {card.token && <strong className="solitaire-rule token-rule effect-keyword">토큰.</strong>}
          {card.exhaust && !card.rule && <strong className="solitaire-rule effect-keyword">소멸.</strong>}
        </span>
        {card.effect === "obsidianDagger"
          ? <>
            {cardForgeCount(card) > 0 && <strong className="solitaire-rule forge-rule effect-keyword">재련됨.</strong>}
            {obsidianDaggerForgeCosts(card).map((cost) => (
              <strong className="solitaire-rule forge-rule" key={`obsidian-forge-${card.id}-${cost}`}><span className="effect-keyword">재련</span>: [{cost}코스트 공격]</strong>
            ))}
          </>
          : card.forged
            ? <strong className="solitaire-rule forge-rule effect-keyword">재련됨.</strong>
            : (card.forgeCost !== undefined || card.forgeCosts || card.forgeTargetName || card.forgeAny) && <strong className="solitaire-rule forge-rule"><span className="effect-keyword">재련</span>: {forgeConditionText(card)}</strong>}
      </>)}</span>
    </>
  );
}

type DeckEditorCardIconData = Pick<Card, "effect" | "name" | "cost" | "forged" | "colored" | "forgeCostsCompleted">;

function DeckEditorCardIcon({ card, count = 1, showNewBadge = false }: {
  card: DeckEditorCardIconData;
  count?: number;
  showNewBadge?: boolean;
}) {
  const cost = UNPLAYABLE_CARD_EFFECTS.has(card.effect)
    ? ""
    : card.effect === "ironWall" ? IRON_WALL_COST : card.cost;
  return (
    <>
      {cost !== "" && <span className="editor-card-cost">{cost}</span>}
      <strong className="editor-card-name">{card.name}{card.effect === "obsidianDagger" && cardForgeCount(card) > 0 ? ` +${cardForgeCount(card)}` : card.forged ? "+" : ""}</strong>
      {card.colored && <em className="deck-card-painted">색칠</em>}
      {showNewBadge && <em className="deck-card-new">NEW!</em>}
      {count > 1 && <span className="inventory-card-count">x{count}</span>}
    </>
  );
}

function deckEditorCardStackStyle(count: number) {
  const layers = Math.min(5, Math.max(0, count - 1));
  if (layers === 0) return undefined;
  const shadows = Array.from({ length: layers }, (_, index) => {
    const offset = (index + 1) * -7;
    return `${offset}px 0 0 -4px #f7f4eb, ${offset}px 0 0 0 var(--editor-rarity)`;
  });
  return {
    marginLeft: layers * 7,
    "--editor-stack-shadow": shadows.join(", "),
  } as CSSProperties;
}

function isRuleMatchedPlacement(movingCard: Card, targetCard?: Card) {
  if (movingCard.solitaireRule === "top") return targetCard?.solitaireRule === "bottom";
  if (movingCard.solitaireRule === "spell") {
    return targetCard?.solitaireRule === "spell" && targetCard.cost === movingCard.cost + 1;
  }
  return false;
}

function canPlaceBySolitaireRule(movingCard: Card, targetCard?: Card) {
  if (movingCard.solitaireRule === "top" || movingCard.solitaireRule === "spell") {
    return isRuleMatchedPlacement(movingCard, targetCard);
  }
  return true;
}

function canForgeCardOnto(movingCard: Card, targetCard?: Card, lawResearchCount = 0, forgeCount = 0) {
  if (!targetCard) return false;
  const targetCost = cardEnergyCost(targetCard, lawResearchCount, forgeCount);
  if (movingCard.effect === "obsidianDagger") {
    return targetCard.kind === "strike"
      && obsidianDaggerForgeCosts(movingCard).includes(targetCost);
  }
  if (movingCard.forged) return false;
  return (movingCard.forgeCost !== undefined && movingCard.forgeCost === targetCost)
    || movingCard.forgeCosts?.includes(targetCost)
    || (movingCard.forgeAny === true)
    || (movingCard.forgeTargetName !== undefined && movingCard.forgeTargetName === targetCard.name);
}

// A spell straight is read from the top of a pile: X, X+1, X+2.
// The array is returned in firing order (top card first).
function getSpellStraight(pile: Card[]) {
  if (pile.length < 3) return null;
  const cards = pile.slice(-3).reverse();
  if (!cards.every((card) => card.solitaireRule === "spell")) return null;
  if (cards[1].cost !== cards[0].cost + 1) return null;
  if (cards[2].cost !== cards[1].cost + 1) return null;
  return cards;
}

// 범람(4) 위에 3, 2, 1코스트가 차례로 쌓인 피라미드.
function getFloodPyramid(pile: Card[]) {
  if (pile.length < 4) return null;
  const cards = pile.slice(-4);
  if (cards[0].effect !== "flood" || cards[0].cost !== 4) return null;
  return cards[1].cost === 3 && cards[2].cost === 2 && cards[3].cost === 1 ? cards : null;
}

function debugEnemyActionText(action: EnemyAction) {
  const parts = action.attacks.map((attack) => {
    const damageType = attack.type === "magic" ? "마법 피해" : "물리 피해";
    return `${damageType} ${attack.value}${(attack.hits ?? 1) > 1 ? ` × ${attack.hits}` : ""}`;
  });
  if (action.strengthGain) parts.push(`힘 ${action.strengthGain} 획득`);
  if (action.blockGain) parts.push(`방어 ${action.blockGain} 획득`);
  if (action.nextAttackMagic) parts.push("다음 공격 마법화");
  if (action.physicalVulnerabilityGain) parts.push(`물리 취약 ${action.physicalVulnerabilityGain} 부여`);
  if (action.nextTurnPhysicalVulnerabilityGain) parts.push(`다음 턴 시작 시 물리 취약 ${action.nextTurnPhysicalVulnerabilityGain} 부여`);
  if (action.nextTurnMagicVulnerabilityGain) parts.push(`다음 턴 시작 시 마법 취약 ${action.nextTurnMagicVulnerabilityGain} 부여`);
  if (action.discardCount) parts.push(`파일 맨 위 ${action.discardCount}장 버리기`);
  return parts.length > 0 ? parts.join(" · ") : "대기";
}

function debugEnemyPatternText(actions: EnemyAction[]) {
  if (actions.length <= 1) return "고정 반복";
  const loopActionIndex = actions.findIndex((action) => action.loopTo !== undefined);
  if (loopActionIndex >= 0) return `처음부터 진행 후 ${actions[loopActionIndex].loopTo! + 1}번 행동부터 반복`;
  if (actions.every((action) => action.cycle)) return "순서대로 반복";
  if (actions.every((action) => action.randomEachTurn)) return "매 턴 무작위";
  return "직전 행동을 제외하고 무작위";
}

function DebugEnemyCodex({ battle = false }: { battle?: boolean }) {
  const entries = getEnemyCodexEntries();
  return (
    <details className={`debug-enemy-codex ${battle ? "is-battle" : ""}`}>
      <summary>적 도감 ({entries.length})</summary>
      <div className="debug-enemy-codex-panel">
        {entries.map((entry) => (
          <article key={entry.encounterIndex} className="debug-enemy-codex-entry">
            <header>
              <strong>{entry.label}</strong>
              <span>
                {entry.regions.length > 0 ? `${entry.regions.join(", ")}지역` : "현재 미출현"}
              </span>
            </header>
            {entry.enemies.map(({ enemy, count }) => (
              <div className="debug-enemy-codex-member" key={`${enemy.name}-${JSON.stringify(enemy.actions)}`}>
                {entry.enemies.length > 1 && <strong>{enemy.name}{count > 1 ? ` × ${count}` : ""}</strong>}
                <p>체력 {Math.floor(enemy.maxHp * 0.9)}~{enemy.maxHp} · 힘 {enemy.strength} · 방어 {enemy.physicalBlock}</p>
                {(enemy.sturdyThreshold > 0 || enemy.quicknessReady || enemy.nextAttackMagic) && (
                  <p>
                    {[
                      enemy.sturdyThreshold > 0 ? `단단함 ${enemy.sturdyThreshold}` : "",
                      enemy.quicknessReady ? "재빠름 준비" : "",
                      enemy.nextAttackMagic ? "첫 공격 마법화" : "",
                    ].filter(Boolean).join(" · ")}
                  </p>
                )}
                {enemy.trait && <p className="debug-enemy-trait">특성: {enemy.trait}</p>}
                <p className="debug-enemy-pattern">패턴: {debugEnemyPatternText(enemy.actions)}</p>
                <ol>
                  {enemy.actions.map((action, index) => (
                    <li key={`${action.name}-${index}`}>
                      <strong>{action.name}</strong><span>{debugEnemyActionText(action)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </article>
        ))}
      </div>
    </details>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("map");
  const [playerName, setPlayerName] = useState(createRandomPlayerName);
  const [playerNameSetupOpen, setPlayerNameSetupOpen] = useState(true);
  const [runPlayerHp, setRunPlayerHp] = useState(MAX_PLAYER_HP);
  const runPlayerHpRef = useRef(MAX_PLAYER_HP);
  const [mapSeed, setMapSeed] = useState(1);
  const [mapPosition, setMapPosition] = useState<MapPosition>(MAP_START);
  const [seenRooms, setSeenRooms] = useState<Set<string>>(
    () => new Set([mapRoomKey(MAP_START)]),
  );
  const [mapEnemyWorld, setMapEnemyWorld] = useState<MapEnemyWorld>(() => ({
    enemies: [],
  }));
  const [mapEnemyCellMemory, setMapEnemyCellMemory] = useState<MapEnemyCellMemory>({});
  const [mapBombs, setMapBombs] = useState<MapBomb[]>([]);
  const mapBombsRef = useRef<MapBomb[]>([]);
  const [destroyedShopRooms, setDestroyedShopRooms] = useState<Set<string>>(() => new Set());
  const [collapsedShrineRooms, setCollapsedShrineRooms] = useState<Set<string>>(() => new Set());
  const [collapsedCampfireRooms, setCollapsedCampfireRooms] = useState<Set<string>>(() => new Set());
  const [shrineOpen, setShrineOpen] = useState(false);
  const [shrineDeckId, setShrineDeckId] = useState("");
  const [shrineDraggedCardId, setShrineDraggedCardId] = useState<number | null>(null);
  const [shrinePendingCardIds, setShrinePendingCardIds] = useState<number[]>([]);
  const [shrineDropActive, setShrineDropActive] = useState(false);
  const [shrineResult, setShrineResult] = useState<ShrineResult | null>(null);
  const [usedHealRooms, setUsedHealRooms] = useState<Set<string>>(() => new Set());
  const [usedBlessingRooms, setUsedBlessingRooms] = useState<Set<string>>(() => new Set());
  const [rockBombHits, setRockBombHits] = useState<Record<string, number>>({});
  const [activeMapEnemyIds, setActiveMapEnemyIds] = useState<string[]>([]);
  const [activeBattleRoom, setActiveBattleRoom] = useState<string | null>(null);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const [mapZoom, setMapZoom] = useState(MAP_DEFAULT_ZOOM);
  const [mapViewportSize, setMapViewportSize] = useState({ width: 0, height: 0 });
  const [mapTraveling, setMapTraveling] = useState(false);
  const [mapCameraFocusing, setMapCameraFocusing] = useState(false);
  const [mindEyeMovesRemaining, setMindEyeMovesRemaining] = useState(0);
  const mindEyeMovesRemainingRef = useRef(0);
  const [mapTravelStepMs, setMapTravelStepMs] = useState(MAP_TRAVEL_STEP_MS);
  const [mapCollisionEnemyIds, setMapCollisionEnemyIds] = useState<string[]>([]);
  const [mapBattleFlash, setMapBattleFlash] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [cardPoolStatsOpen, setCardPoolStatsOpen] = useState(false);
  const [cardPoolStatHover, setCardPoolStatHover] = useState<{
    label: string;
    cards: CardBlueprint[];
    x: number;
    y: number;
  } | null>(null);
  const [debugSpawnSelection, setDebugSpawnSelection] = useState("card:basic:0");
  const [battleThemeColors, setBattleThemeColors] = useState<BattleThemeColors>(DEFAULT_BATTLE_THEME_COLORS);
  const [battleThemeDrafts, setBattleThemeDrafts] = useState<BattleThemeColors>(DEFAULT_BATTLE_THEME_COLORS);
  const [starOrbitStyle, setStarOrbitStyle] = useState<StarOrbitStyle>("saturn");
  const [starOrbitSpeed, setStarOrbitSpeed] = useState(1.3);
  const [starPlaneSpeed, setStarPlaneSpeed] = useState(1);
  const [cardWatermarkStyle, setCardWatermarkStyle] = useState<CardWatermarkStyle>("stars");
  const [cardWatermarkOpacity, setCardWatermarkOpacity] = useState(.45);
  const [cardWatermarkSize, setCardWatermarkSize] = useState(100);
  const [cardWatermarkX, setCardWatermarkX] = useState(50);
  const [cardWatermarkY, setCardWatermarkY] = useState(100);
  const [constellationPreviewIndex, setConstellationPreviewIndex] = useState<number | null>(null);
  const [mapMessage, setMapMessage] = useState("");
  const [mapMessageNonce, setMapMessageNonce] = useState(0);
  const [ownedDecks, setOwnedDecks] = useState<DeckCase[]>(() => [createStarterDeck()]);
  const [activeDeckId, setActiveDeckId] = useState("starter");
  const previousBattleDeckIdRef = useRef<string | null>(null);
  const [pendingBattleStart, setPendingBattleStart] = useState<PendingBattleStart | null>(null);
  const [battleDeckPreviewId, setBattleDeckPreviewId] = useState<string | null>(null);
  const [deckSelectorOpen, setDeckSelectorOpen] = useState(false);
  const [deckSelectorClosing, setDeckSelectorClosing] = useState(false);
  const [deckSelectorClosingDeckId, setDeckSelectorClosingDeckId] = useState<string | null>(null);
  const [deckSelectionAttention, setDeckSelectionAttention] = useState(false);
  const [inventoryCards, setInventoryCards] = useState<Card[]>([]);
  const [inventoryConsumables, setInventoryConsumables] = useState<Consumable[]>([]);
  const inventoryConsumablesRef = useRef<Consumable[]>([]);
  const [roomDrops, setRoomDrops] = useState<Record<string, Card[]>>({});
  const [roomConsumableDrops, setRoomConsumableDrops] = useState<Record<string, Consumable[]>>({});
  const [roomDeckDrops, setRoomDeckDrops] = useState<Record<string, DeckCase[]>>({});
  const [roomShops, setRoomShops] = useState<Record<string, ShopOffer[]>>({});

  useEffect(() => {
    if (debugMode && screen === "battle") {
      document.body.style.backgroundColor = battleThemeColors.outer;
    } else {
      document.body.style.removeProperty("background-color");
    }
    return () => {
      document.body.style.removeProperty("background-color");
    };
  }, [battleThemeColors.outer, debugMode, screen]);
  const [shopOpen, setShopOpen] = useState(false);
  const [blessingOpen, setBlessingOpen] = useState(false);
  const [blessingOffers, setBlessingOffers] = useState<BlessingId[]>([]);
  const [blessings, setBlessings] = useState<BlessingId[]>([]);
  const [blessingRerollCost, setBlessingRerollCost] = useState(50);
  const [athleteCooldown, setAthleteCooldown] = useState(0);
  const [athletePrepared, setAthletePrepared] = useState(false);
  const [activeShopRoom, setActiveShopRoom] = useState<string | null>(null);
  const [shopMessage, setShopMessage] = useState("필요한 물건을 골라보세요.");
  const [gold, setGold] = useState(0);
  const [battleRewards, setBattleRewards] = useState<Card[]>([]);
  const [battleRewardDecks, setBattleRewardDecks] = useState<DeckCase[]>([]);
  const [battleRewardConsumables, setBattleRewardConsumables] = useState<Consumable[]>([]);
  const [battleRewardGold, setBattleRewardGold] = useState(0);
  const [deckEditorOpen, setDeckEditorOpen] = useState(false);
  const [deckEditorDeckId, setDeckEditorDeckId] = useState("");
  const [deckViewerOpen, setDeckViewerOpen] = useState(false);
  const [deckViewerDeckId, setDeckViewerDeckId] = useState("");
  const deckViewerGridRef = useRef<HTMLDivElement | null>(null);
  const cardKeywordPopoverRef = useRef<HTMLElement | null>(null);
  const [deckEditorDrag, setDeckEditorDrag] = useState<{ cardId: number; source: DeckEditorArea; deckId?: string } | null>(null);
  const deckEditorDragRef = useRef<{ cardId: number; source: DeckEditorArea; deckId?: string } | null>(null);
  const [deckEditorDropTarget, setDeckEditorDropTarget] = useState<DeckEditorArea | null>(null);
  const [pendingRemovedCards, setPendingRemovedCards] = useState<Card[]>([]);
  const [pendingRemovedCardAreas, setPendingRemovedCardAreas] = useState<Record<number, "inventory" | "floor">>({});
  const [pendingRemovalBlinkDim, setPendingRemovalBlinkDim] = useState(false);
  const [consumableDrag, setConsumableDrag] = useState<{ id: string; source: ConsumableArea } | null>(null);
  const consumableDragRef = useRef<{ id: string; source: ConsumableArea } | null>(null);
  const [ticketDropTarget, setTicketDropTarget] = useState<string | null>(null);
  const [pendingPaintTicketId, setPendingPaintTicketId] = useState<string | null>(null);
  const [pendingCloneTicketId, setPendingCloneTicketId] = useState<string | null>(null);
  const [pendingExtractTicketId, setPendingExtractTicketId] = useState<string | null>(null);
  const [pendingTransformTicketId, setPendingTransformTicketId] = useState<string | null>(null);
  const [armedBombTicketIds, setArmedBombTicketIds] = useState<Set<string>>(() => new Set());
  const [deckCaseDrag, setDeckCaseDrag] = useState<{ deckId: string; source: "floor" | "owned" } | null>(null);
  const deckCaseDragRef = useRef<{ deckId: string; source: "floor" | "owned" } | null>(null);
  const [deckCaseDropSlot, setDeckCaseDropSlot] = useState<number | null>(null);
  const [deckEditorMessage, setDeckEditorMessage] = useState("휴식 구역에서는 카드를 바닥으로 추출하고, 일반 구역에서는 제거 예정 상태로 만듭니다.");
  const [deckEditorSnapshot, setDeckEditorSnapshot] = useState<DeckEditorSnapshot | null>(null);
  const [openedCardPack, setOpenedCardPack] = useState<Card[] | null>(null);
  const [battleCardView, setBattleCardView] = useState<"deck" | "piles" | "discard" | null>(null);
  const [selectedHandCardId, setSelectedHandCardId] = useState<number | null>(null);
  const [dyingEnemyIds, setDyingEnemyIds] = useState<Set<string>>(() => new Set());
  const [transformedCardNewIds, setTransformedCardNewIds] = useState<Set<number>>(() => new Set());
  const [hoveredDeckCard, setHoveredDeckCard] = useState<Card | null>(null);
  const [hoveredCardKeywords, setHoveredCardKeywords] = useState<CardKeywordPopoverState | null>(null);
  const [keywordHoverRequest, setKeywordHoverRequest] = useState<{ card: Card; right: number; top: number } | null>(null);
  const [hoveredEnemyIntentTooltip, setHoveredEnemyIntentTooltip] = useState<EnemyIntentTooltipState | null>(null);
  const [hoveredConsumable, setHoveredConsumable] = useState<Consumable | null>(null);
  const [deckEditorSort, setDeckEditorSort] = useState<"cost" | "rarity">("rarity");
  const [deckViewerSort, setDeckViewerSort] = useState<"cost" | "rarity">("rarity");
  const [deckPreviewPosition, setDeckPreviewPosition] = useState({ x: 0, y: 0 });
  const [game, setGame] = useState<GameState>(waitingState);
  const [phase, setPhase] = useState<Phase>("drawing");
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [attackingEnemyId, setAttackingEnemyId] = useState<string | null>(null);
  const [damagePopup, setDamagePopup] = useState<DamagePopup | null>(null);
  const [enemyPopups, setEnemyPopups] = useState<Record<string, DamagePopup>>({});
  const [animatedEnemyHp, setAnimatedEnemyHp] = useState<Record<string, number>>({});
  const enemyPopupKeyRef = useRef(0);
  const [pileClearNotice, setPileClearNotice] = useState(false);
  const nextCardIdRef = useRef(STARTING_DECK_SIZE);
  const battleRewardRegionRef = useRef(1);
  const debugGoldClicksRef = useRef<number[]>([]);
  const debugPreviousActiveDeckIdRef = useRef<string | null>(null);
  const nextConsumableIdRef = useRef(1);
  const deckSelectorCloseTimerRef = useRef<number | null>(null);
  const deckPreviewReleaseTimerRef = useRef<number | null>(null);
  const [deckPreviewSuppressed, setDeckPreviewSuppressed] = useState(false);
  const deckDropChanceRef = useRef(0.25);
  const rareCardDropChanceRef = useRef(0.05);
  const activeDeck = ownedDecks.find((deck) => deck.id === activeDeckId) ?? ownedDecks[0];
  const shrineDeck = ownedDecks.find((deck) => deck.id === shrineDeckId) ?? activeDeck;
  const deckCards = activeDeck?.cards ?? [];
  const inventoryCapacity = INVENTORY_CAPACITY + (blessings.includes("bag") ? 12 : 0);
  const maxOwnedDecks = MAX_OWNED_DECKS + (blessings.includes("bag") ? 1 : 0);
  const maxPlayerHp = MAX_PLAYER_HP + (blessings.includes("sturdy") ? 20 : 0);
  const visionHorizontalRadius = mindEyeMovesRemaining > 0 ? 4 : blessings.includes("vision") ? 3 : MAP_PLAYER_VISION_HORIZONTAL_RADIUS;
  const visionVerticalRadius = mindEyeMovesRemaining > 0 ? 4 : blessings.includes("vision") ? 3 : MAP_PLAYER_VISION_VERTICAL_RADIUS;
  const editingDeck = ownedDecks.find((deck) => deck.id === deckEditorDeckId) ?? activeDeck;
  useLayoutEffect(() => {
    if (!deckViewerOpen) return;
    deckViewerGridRef.current?.scrollTo({ top: 0, left: 0 });
  }, [deckViewerDeckId, deckViewerOpen, deckViewerSort]);
  useEffect(() => {
    if (!ownedDecks.some((deck) => deck.id === "starter" && deck.name === "")) return;
    const timer = window.setTimeout(() => setOwnedDecks((current) => current.map((deck) => deck.id === "starter" && deck.name === ""
      ? { ...deck, name: createDeckName() }
      : deck)), 0);
    return () => window.clearTimeout(timer);
  }, [ownedDecks]);
  useEffect(() => {
    inventoryConsumablesRef.current = inventoryConsumables;
  }, [inventoryConsumables]);
  useEffect(() => {
    if (!deckEditorOpen) return;
    const blinkTimer = window.setInterval(() => {
      setPendingRemovalBlinkDim((current) => !current);
    }, 525);
    return () => window.clearInterval(blinkTimer);
  }, [deckEditorOpen]);
  useEffect(() => () => {
    if (deckSelectorCloseTimerRef.current !== null) {
      window.clearTimeout(deckSelectorCloseTimerRef.current);
    }
    if (deckPreviewReleaseTimerRef.current !== null) {
      window.clearTimeout(deckPreviewReleaseTimerRef.current);
    }
  }, []);
  const showMapMessage = (message: string) => {
    setMapMessage(message);
    setMapMessageNonce((current) => current + 1);
  };
  const openDeckSelector = () => {
    if (deckSelectorCloseTimerRef.current !== null) {
      window.clearTimeout(deckSelectorCloseTimerRef.current);
      deckSelectorCloseTimerRef.current = null;
    }
    setDeckSelectorClosing(false);
    setDeckSelectorClosingDeckId(null);
    setDeckSelectorOpen(true);
  };
  const closeDeckSelector = (selectedDeckId?: string) => {
    if (!deckSelectorOpen || deckSelectorClosing) return;
    setDeckSelectorClosing(true);
    setDeckSelectorClosingDeckId(selectedDeckId ?? null);
    if (deckSelectorCloseTimerRef.current !== null) {
      window.clearTimeout(deckSelectorCloseTimerRef.current);
    }
    deckSelectorCloseTimerRef.current = window.setTimeout(() => {
      setDeckSelectorOpen(false);
      setDeckSelectorClosing(false);
      setDeckSelectorClosingDeckId(null);
      deckSelectorCloseTimerRef.current = null;
    }, selectedDeckId ? 700 : 360);
  };
  const toggleDeckSelector = () => {
    if (deckSelectorOpen && !deckSelectorClosing) {
      closeDeckSelector();
      return;
    }
    openDeckSelector();
  };
  const setMapBombsSynced = (bombs: MapBomb[]) => {
    mapBombsRef.current = bombs;
    setMapBombs(bombs);
  };
  const effectiveRoomType = (position: MapPosition) => {
    const baseType = getRoomType(position, mapSeed);
    const roomKey = mapRoomKey(position);
    if (baseType === "shop" && destroyedShopRooms.has(roomKey)) return "empty";
    if (baseType === "shrine" && collapsedShrineRooms.has(roomKey)) return "empty";
    if (baseType === "campfire" && collapsedCampfireRooms.has(roomKey)) return "empty";
    if (baseType === "heal" && usedHealRooms.has(roomKey)) return "empty";
    if (baseType === "blessing" && usedBlessingRooms.has(roomKey)) return "empty";
    if (baseType === "rock" && (rockBombHits[roomKey] ?? 0) >= 3) return "empty";
    return baseType;
  };
  const enterDebugMode = () => {
    if (debugMode) return;
    debugPreviousActiveDeckIdRef.current = activeDeck?.id ?? null;
    const { deck, nextCardId } = createDebugAllCardsDeck(nextCardIdRef.current);
    nextCardIdRef.current = nextCardId;
    setOwnedDecks((current) => [
      deck,
      ...current.filter((currentDeck) => currentDeck.id !== DEBUG_ALL_CARDS_DECK_ID),
    ]);
    setActiveDeckId(deck.id);
    setDeckSelectionAttention(true);
    setMapMessage(`디버그 덱 ALL 생성: 모든 카드 ${deck.cards.length}장`);
    setDebugMode(true);
  };
  const exitDebugMode = () => {
    if (!debugMode) return;
    const previousDeckId = debugPreviousActiveDeckIdRef.current;
    const restoredDeck = ownedDecks.find((deck) => deck.id === previousDeckId && deck.id !== DEBUG_ALL_CARDS_DECK_ID)
      ?? ownedDecks.find((deck) => deck.id !== DEBUG_ALL_CARDS_DECK_ID);
    setOwnedDecks((current) => current.filter((deck) => deck.id !== DEBUG_ALL_CARDS_DECK_ID));
    setActiveDeckId(restoredDeck?.id ?? "");
    setDeckSelectionAttention(false);
    setCardPoolStatsOpen(false);
    debugPreviousActiveDeckIdRef.current = null;
    debugGoldClicksRef.current = [];
    setDebugMode(false);
    setMapMessage("디버그 모드를 종료했습니다.");
  };
  const handleGoldDebugClick = () => {
    const now = Date.now();
    const recentClicks = [...debugGoldClicksRef.current, now].filter((time) => now - time <= 1200);
    debugGoldClicksRef.current = recentClicks;
    if (recentClicks.length < 5) return;
    debugGoldClicksRef.current = [];
    if (debugMode) exitDebugMode();
    else enterDebugMode();
  };
  const updateActiveDeckCards = (updater: Card[] | ((cards: Card[]) => Card[])) => {
    setOwnedDecks((current) => current.map((deck) => {
      if (deck.id !== activeDeck?.id) return deck;
      const cards = typeof updater === "function" ? updater(deck.cards) : updater;
      return { ...deck, cards };
    }));
  };
  const inventoryItemCount = inventoryCards.length + inventoryConsumables.length;
  const pendingInventoryCardCount = pendingRemovedCards.filter((card) => pendingRemovedCardAreas[card.id] === "inventory").length;
  const deckEditorInventoryItemCount = inventoryItemCount + pendingInventoryCardCount;
  const deckEditorErrorMessage = /불가능|가득|더 이상|반드시|이하로 줄여야/.test(deckEditorMessage)
    ? deckEditorMessage
    : null;

  const nextConsumable = (type: ConsumableType) => {
    const id = `consumable-${nextConsumableIdRef.current}`;
    nextConsumableIdRef.current += 1;
    return createConsumable(type, id);
  };
  const spawnDebugItemOnFloor = () => {
    if (!debugMode) return;
    const roomKey = mapRoomKey(mapPosition);

    if (debugSpawnSelection === "deck:random") {
      const deck = createRandomDeck(getRegionNumber(mapPosition), nextCardIdRef.current, blessings.includes("luck") ? .1 : 0, blessings.includes("deckSize") ? 5 : 0);
      nextCardIdRef.current += deck.cards.length;
      setRoomDeckDrops((current) => ({
        ...current,
        [roomKey]: [...(current[roomKey] ?? []), deck],
      }));
      return;
    }

    if (debugSpawnSelection.startsWith("consumable:")) {
      const type = debugSpawnSelection.slice("consumable:".length) as ConsumableType;
      if (!CONSUMABLE_TYPES.includes(type)) return;
      const consumable = nextConsumable(type);
      setRoomConsumableDrops((current) => ({
        ...current,
        [roomKey]: [...(current[roomKey] ?? []), consumable],
      }));
      return;
    }

    const [, rarity, rawIndex] = debugSpawnSelection.split(":");
    let blueprint: CardBlueprint | undefined;
    if (DEBUG_CARD_RARITIES.some((group) => group.rarity === rarity)) {
      blueprint = ALL_CARD_BLUEPRINTS.filter((card) => card.rarity === rarity)[Number(rawIndex)];
    }

    const card = rarity === "adrenaline"
      ? { ...createAdrenalineCard(), id: nextCardIdRef.current, revealed: false }
      : blueprint
        ? { ...blueprint, id: nextCardIdRef.current, revealed: false }
        : null;
    if (!card) return;
    nextCardIdRef.current += 1;
    setRoomDrops((current) => ({
      ...current,
      [roomKey]: [...(current[roomKey] ?? []), card],
    }));
  };
  const updateDeckCards = (deckId: string | undefined, updater: Card[] | ((cards: Card[]) => Card[])) => {
    if (!deckId) return;
    setOwnedDecks((current) => current.map((deck) => {
      if (deck.id !== deckId) return deck;
      const cards = typeof updater === "function" ? updater(deck.cards) : updater;
      return { ...deck, cards };
    }));
  };
  const grantBattleReward = (regionNumber: number) => {
    const rewardDeck = ownedDecks.find((deck) => deck.id === previousBattleDeckIdRef.current) ?? activeDeck;
    const reward = createBattleReward(regionNumber, nextCardIdRef.current, Math.min(1, deckDropChanceRef.current + (blessings.includes("luck") ? .1 : 0)), blessings.includes("luck") ? .1 : 0, blessings.includes("luck") ? .1 : 0, blessings.includes("deckSize") ? 5 : 0, rareCardDropChanceRef.current);
    const generatedCardCount = reward.cards.length + reward.decks.reduce((total, deck) => total + deck.cards.length, 0);
    nextCardIdRef.current += generatedCardCount;
    deckDropChanceRef.current = reward.decks.length > 0
      ? 0.25
      : Math.min(1, deckDropChanceRef.current + 0.1);
    if (reward.cards.length > 0) {
      rareCardDropChanceRef.current = reward.cards[0].rarity === "rare"
        ? 0.05
        : Math.min(1, rareCardDropChanceRef.current + 0.02);
    }
    setBattleRewardGold(reward.gold * (rewardDeck?.editions.includes("greedy") ? 2 : 1) * (blessings.includes("greed") ? 2 : 1));
    setBattleRewards(reward.cards);
    setBattleRewardDecks(reward.decks);
    setBattleRewardConsumables(reward.consumableType ? [nextConsumable(reward.consumableType)] : []);
  };

  // 전투 승리 상태가 먼저 반영되는 경로에서도 보상이 비어 있지 않도록 보완한다.
  useEffect(() => {
    if (
      screen === "battle"
      && game.status === "won"
      && battleRewardGold === 0
      && battleRewards.length === 0
      && battleRewardDecks.length === 0
      && battleRewardConsumables.length === 0
    ) {
      grantBattleReward(battleRewardRegionRef.current);
    }
  }, [screen, game.status, battleRewardGold, battleRewards.length, battleRewardDecks.length, battleRewardConsumables.length, mapPosition]);

  const createShopStock = (depth: number): ShopOffer[] => {
    const variedPrice = (basePrice: number) => Math.round(basePrice * (0.8 + Math.random() * 0.4));
    const makeRareCardOffer = (slot: number): ShopOffer => {
      const blueprint = RARE_CARD_POOL[Math.floor(Math.random() * RARE_CARD_POOL.length)];
      const card = { ...blueprint, id: nextCardIdRef.current, revealed: false };
      nextCardIdRef.current += 1;
      return {
        id: `shop-card-${depth}-${slot}-${card.id}`,
        price: variedPrice(150),
        card,
        sold: false,
      };
    };
    const consumables = Array.from({ length: 2 }, (_, slot) => {
      const ticketRoll = Math.random();
      const type = consumableTypeFromRoll(ticketRoll);
      const consumable = nextConsumable(type);
      const basePrice = type === "cloneTicket" ? 100 : 20;
      return {
        id: `shop-item-${depth}-${slot}-${consumable.id}`,
        price: variedPrice(basePrice),
        consumable,
        sold: false,
      };
    });
    const cardPacks = Array.from({ length: 2 }, (_, slot) => {
      const consumable = nextConsumable("cardPack");
      return { id: `shop-pack-${depth}-${slot}-${consumable.id}`, price: variedPrice(160), consumable, sold: false };
    });
    return [
      ...consumables,
      ...cardPacks,
      makeRareCardOffer(4),
    ];
  };

  const openShop = (roomKey: string, depth: number) => {
    if (!roomShops[roomKey]) {
      const stock = createShopStock(depth);
      setRoomShops((current) => ({ ...current, [roomKey]: stock }));
    }
    setActiveShopRoom(roomKey);
    setShopMessage("필요한 물건을 골라보세요.");
    setShopOpen(true);
  };

  const buyShopOffer = (offerId: string) => {
    if (!activeShopRoom) return;
    const offer = (roomShops[activeShopRoom] ?? []).find((item) => item.id === offerId);
    if (!offer || offer.sold) return;
    if (gold < offer.price) {
      setShopMessage(`🪙 ${offer.price - gold}이 부족합니다.`);
      return;
    }
    setGold((current) => current - offer.price);
    const inventoryFull = inventoryItemCount >= inventoryCapacity;
    if (offer.card) {
      if (inventoryFull) setRoomDrops((current) => ({ ...current, [activeShopRoom]: [...(current[activeShopRoom] ?? []), offer.card!] }));
      else setInventoryCards((current) => [...current, offer.card!]);
    }
    if (offer.consumable) {
      if (inventoryFull) setRoomConsumableDrops((current) => ({ ...current, [activeShopRoom]: [...(current[activeShopRoom] ?? []), offer.consumable!] }));
      else setInventoryConsumables((current) => [...current, offer.consumable!]);
    }
    setRoomShops((current) => ({
      ...current,
      [activeShopRoom]: (current[activeShopRoom] ?? []).map((item) =>
        item.id === offerId ? { ...item, sold: true } : item),
    }));
    setShopMessage(`${offer.card?.name ?? offer.consumable?.name}을(를) 구매했습니다.${inventoryFull ? " 인벤토리가 가득 차 바닥에 놓았습니다." : ""}`);
  };

  const openCardPack = (packId: string) => {
    const pack = inventoryConsumables.find((item) => item.id === packId && item.type === "cardPack");
    if (!pack) return;
    let rareChance = rareCardDropChanceRef.current;
    const cards = Array.from({ length: 5 }, () => {
      const card = createBattleRewardCard(nextCardIdRef.current, rareChance);
      nextCardIdRef.current += 1;
      rareChance = card.rarity === "rare"
        ? 0.05
        : Math.min(1, rareChance + 0.02);
      return card;
    });
    rareCardDropChanceRef.current = rareChance;
    const freeSlotsAfterPack = Math.max(0, inventoryCapacity - (inventoryItemCount - 1));
    const inventoryCardsFromPack = cards.slice(0, freeSlotsAfterPack);
    const floorCardsFromPack = cards.slice(freeSlotsAfterPack);
    setInventoryConsumables((current) => current.filter((item) => item.id !== packId));
    setInventoryCards((current) => [...current, ...inventoryCardsFromPack]);
    if (floorCardsFromPack.length > 0) {
      const roomKey = mapRoomKey(mapPosition);
      setRoomDrops((current) => ({
        ...current,
        [roomKey]: [...(current[roomKey] ?? []), ...floorCardsFromPack],
      }));
      setDeckEditorMessage(`인벤토리에 들어가지 못한 카드 ${floorCardsFromPack.length}장을 바닥에 놓았습니다.`);
    }
    setOpenedCardPack(cards);
  };
  const pendingOriginsRef = useRef(new Map<number, DOMRect>());
  const pendingEnemyTokenIdsRef = useRef(new Set<number>());
  const pendingPileTokenSourcesRef = useRef(new Map<number, string>());
  const handCardRefs = useRef(new Map<number, HTMLButtonElement>());
  const dragRef = useRef<DragState & { startX: number; startY: number } | null>(null);
  const timersRef = useRef<number[]>([]);
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const mapTravelTimerRef = useRef<number | null>(null);
  const mapFocusTimerRef = useRef<number | null>(null);
  const mapMovementKeysRef = useRef(new Set<string>());
  const mapMovementTimerRef = useRef<number | null>(null);
  const numpadMovementKeysRef = useRef(new Set<string>());
  const numpadMovementTimerRef = useRef<number | null>(null);
  const pileScrollRef = useRef<HTMLDivElement | null>(null);
  const pilePanRef = useRef<{ startX: number; scrollLeft: number } | null>(null);
  const [pilePanning, setPilePanning] = useState(false);
  const mapDragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const mapWasDraggedRef = useRef(false);

  useLayoutEffect(() => {
    if (screen !== "map") return;
    const viewport = mapViewportRef.current;
    if (!viewport) return;
    const updateSize = () => setMapViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    updateSize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [screen]);

  const later = (callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay);
    timersRef.current.push(timer);
    return timer;
  };

  const captureDrawOrigins = (cards: Card[]) => {
    const drawnIds = new Set(cards.map((card) => card.id));
    const origins = new Map<number, DOMRect>();
    document.querySelectorAll<HTMLElement>("[data-top-card-id]").forEach((element) => {
      const cardId = Number(element.dataset.topCardId);
      if (drawnIds.has(cardId)) origins.set(cardId, element.getBoundingClientRect());
    });
    pendingOriginsRef.current = origins;
    return origins.size;
  };

  const drawCards = () => {
    const origins = new Map<number, DOMRect>();
    document.querySelectorAll<HTMLElement>("[data-top-card-id]").forEach((element) => {
      const cardId = Number(element.dataset.topCardId);
      origins.set(cardId, element.getBoundingClientRect());
    });
    pendingOriginsRef.current = origins;
    setPhase("drawing");
    setGame((current) => {
      const draw = drawFromPiles(current.piles);
      const clearPlan = current.clearPlan;
      const clearedAllPiles = clearPlan !== null;
      const topSlotByCardId = new Map<number, number>();
      current.piles.forEach((pile, index) => {
        const top = pile.at(-1);
        if (top) topSlotByCardId.set(top.id, index);
      });
      const initialDraw = clearedAllPiles
        ? draw.hand.map((card) => ({
          ...card,
          drawSlot: topSlotByCardId.get(card.id),
          drawSlotCount: current.piles.length,
        }))
        : draw.hand;
      if (clearPlan) {
        setPileClearNotice(true);
        later(() => {
          setGame((latest) => {
            if (!latest.clearPlan) return latest;
            return { ...latest, piles: latest.clearPlan.pilesBeforeDraw, discard: [], message: "CLEAR! 새 파일을 배치했습니다." };
          });
          setPileClearNotice(false);
          let missingOriginFrames = 0;
          const drawFromNewPiles = () => {
            const plannedHandIds = new Set(clearPlan.hand.map((card) => card.id));
            const origins = new Map<number, DOMRect>();
            document.querySelectorAll<HTMLElement>("[data-top-card-id]").forEach((element) => {
              const cardId = Number(element.dataset.topCardId);
              if (plannedHandIds.has(cardId)) {
                origins.set(cardId, element.getBoundingClientRect());
              }
            });

            // 렌더가 늦을 때만 잠시 기다린다. 좌표를 끝내 못 찾더라도
            // 애니메이션을 생략하고 진행해야 전투가 drawing 상태에 고정되지 않는다.
            if (origins.size !== plannedHandIds.size && missingOriginFrames < 12) {
              missingOriginFrames += 1;
              window.requestAnimationFrame(drawFromNewPiles);
              return;
            }

            pendingOriginsRef.current = origins;
            setGame((latest) => {
              if (!latest.clearPlan) return latest;
              const planned = latest.clearPlan;
              const existingHandIds = new Set(latest.hand.map((card) => card.id));
              const uniquePlannedHand = planned.hand.filter((card) => !existingHandIds.has(card.id));
              return {
                ...latest,
                piles: planned.pilesAfterDraw,
                hand: [...latest.hand, ...uniquePlannedHand],
                clearPlan: null,
                message: `새 파일에서 ${uniquePlannedHand.length}장을 가져왔습니다.`,
              };
            });
            if (origins.size === 0) {
              window.requestAnimationFrame(() => setPhase("playing"));
            }
          };

          // React가 새 파일을 화면에 그린 뒤 두 프레임을 기다린다.
          // 이후에는 모든 리셔플 드로우가 같은 파일→손패 모션을 사용한다.
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(drawFromNewPiles);
          });
        }, 900);
      }
      const nonEmptyPileIndexes = draw.piles
        .map((pile, index) => pile.length > 0 ? index : -1)
        .filter((index) => index >= 0);
      const enemiesAfterDiscardTargeting = current.enemies.map((enemy) => {
        const intent = enemy.actions[enemy.intentIndex];
        return intent.discardCount
          ? { ...enemy, discardPileIndex: nonEmptyPileIndexes.length > 0 ? pickRandom(nonEmptyPileIndexes) : undefined }
          : { ...enemy, discardPileIndex: undefined };
      });
      const toxicSlimeEnemies = current.enemies.filter((enemy) => enemy.givesToxicSlime);
      const toxicSlimes = current.toxicSlimeAdded
        ? []
        : Array.from({ length: toxicSlimeEnemies.length }, () => createSlimeCard(nextCardIdRef.current++));
      toxicSlimes.forEach((card, index) => {
        const sourceEnemy = toxicSlimeEnemies[index];
        const source = sourceEnemy
          ? document.querySelector<HTMLElement>(`[data-enemy-id="${sourceEnemy.id}"]`)?.getBoundingClientRect()
          : undefined;
        if (!source) return;
        origins.set(card.id, source);
        pendingEnemyTokenIdsRef.current.add(card.id);
      });
      return {
        ...current,
        piles: draw.piles,
        enemies: enemiesAfterDiscardTargeting,
        hand: [...current.hand, ...initialDraw, ...toxicSlimes],
        initialDeck: [...current.initialDeck, ...toxicSlimes.map((card) => ({ ...card, revealed: false }))],
        energy: current.deckEditions.includes("rampaging") ? 4 : 3,
        pendingDraws: 0,
        pendingPileDrawCount: 0,
        pendingDashRandomDraws: 0,
        pendingResearchDraw: null,
        pendingDiscards: 0,
        pendingSweep: false,
        playerPhysicalBlock: current.preserveDefenseOnTurnEnd ? current.playerPhysicalBlock : 0,
        playerMagicBlock: current.preserveDefenseOnTurnEnd ? current.playerMagicBlock : 0,
        defenseMultiplier: 1,
        damageTakenMultiplier: 1,
        invulnerable: false,
        toxicSlimeAdded: current.toxicSlimeAdded || toxicSlimes.length > 0,
        message: clearedAllPiles ? "CLEAR! 새 파일을 배치합니다."
          : toxicSlimes.length > 0
          ? `${draw.hand.length}장을 가져왔습니다. 주황 슬라임이 유독성 점액을 손패에 넣었습니다.`
          : `${draw.hand.length}장을 각 파일에서 가져왔습니다.`,
      };
    });
  };

  const clearBattleTimers = () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  };

  const clearMapTravel = () => {
    if (mapTravelTimerRef.current !== null) {
      window.clearTimeout(mapTravelTimerRef.current);
      mapTravelTimerRef.current = null;
    }
    if (mapFocusTimerRef.current !== null) {
      window.clearTimeout(mapFocusTimerRef.current);
      mapFocusTimerRef.current = null;
    }
    setMapCollisionEnemyIds([]);
    setMapBattleFlash(false);
    setMapTraveling(false);
    setMapCameraFocusing(false);
  };

  const rememberPlayerVision = (
    position: MapPosition,
    seed = mapSeed,
    enemies = mapEnemyWorld.enemies,
    previousEnemies: typeof mapEnemyWorld.enemies = [],
  ) => {
    const mindEyeActive = mindEyeMovesRemainingRef.current > 0;
    const horizontalRadius = mindEyeActive ? 4 : blessings.includes("vision") ? 3 : MAP_PLAYER_VISION_HORIZONTAL_RADIUS;
    const verticalRadius = mindEyeActive ? 4 : blessings.includes("vision") ? 3 : MAP_PLAYER_VISION_VERTICAL_RADIUS;
    const visibleKeys = visibleMapRoomKeys(position, seed, horizontalRadius, verticalRadius);
    setSeenRooms((current) => new Set([...current, ...visibleKeys]));
    setMapEnemyCellMemory((current) => updateEnemyCellMemory(current, enemies, visibleKeys, previousEnemies));
  };

  const showEnemyPopup = (enemyId: string, text: string, kind: "damage" | "buff" = "damage") => {
    enemyPopupKeyRef.current += 1;
    const popup = { key: `${enemyId}-${enemyPopupKeyRef.current}`, text, kind };
    setEnemyPopups((current) => ({ ...current, [enemyId]: popup }));
    later(() => setEnemyPopups((current) => {
      if (current[enemyId]?.key !== popup.key) return current;
      const { [enemyId]: _, ...remaining } = current;
      return remaining;
    }), 1150);
  };

  const startBattleNow = (
    encounters: BattleEncounter[],
    playerHp: number,
    battleDeckId: string,
  ) => {
    const battleDeck = ownedDecks.find((deck) => deck.id === battleDeckId) ?? activeDeck;
    if (!battleDeck) return;
    previousBattleDeckIdRef.current = battleDeck.id;
    setPendingBattleStart(null);
    setBattleDeckPreviewId(null);
    battleRewardRegionRef.current = Math.max(
      1,
      ...encounters.map((encounter) => getEncounterRegionNumber(encounter.encounterIndex)),
    );
    clearBattleTimers();
    clearMapTravel();
    setDeckEditorOpen(false);
    setDeckViewerOpen(false);
    setDeckSelectorOpen(false);
    setDragging(null);
    setBattleCardView(null);
    setSelectedHandCardId(null);
    setDyingEnemyIds(new Set());
    setAnimatedEnemyHp({});
    setHoveredDeckCard(null);
    clearCardKeywordHover();
    setAttackingEnemyId(null);
    setDamagePopup(null);
    setBattleRewards([]);
    setBattleRewardDecks([]);
    setBattleRewardConsumables([]);
    setBattleRewardGold(0);
    pendingEnemyTokenIdsRef.current.clear();
    pendingPileTokenSourcesRef.current.clear();
    const battleEnemies = encounters.flatMap((encounter) =>
      createSewerEncounterByIndex(encounter.encounterIndex).map((enemy) => ({
        ...enemy,
        hp: Math.max(0, enemy.hp - (encounter.damageTaken ?? 0)),
      })));
    const dealtGame = dealtState(
      playerHp,
      battleDeck.cards,
      battleEnemies,
      battleDeck.editions,
    );
    const nextGame = blessings.includes("ninja") && encounters.some((encounter) => encounter.awareness === "sleeping")
      ? { ...dealtGame, hand: [...dealtGame.hand, { ...createAdrenalineCard(), id: nextCardIdRef.current++ }] }
      : dealtGame;
    const goblin = battleEnemies.find((enemy) => enemy.variant === "goblin");
    const goblinRelic = nextGame.piles[0]?.find((card) => card.effect === "relic" && card.enemyToken);
    if (goblin && goblinRelic) pendingPileTokenSourcesRef.current.set(goblinRelic.id, goblin.id);
    const defeatedByBomb = battleEnemies.every((enemy) => enemy.hp === 0);
    setPhase(defeatedByBomb ? "playing" : "drawing");
    setGame(defeatedByBomb
      ? { ...nextGame, status: "won", message: "폭발 피해로 모든 적이 쓰러졌습니다." }
      : nextGame);
    setScreen("battle");
    if (defeatedByBomb) grantBattleReward(battleRewardRegionRef.current);
    else later(drawCards, 360);
  };

  const startBattle = (
    encounters: BattleEncounter[],
    playerHp = runPlayerHp,
  ) => {
    const previousDeckId = previousBattleDeckIdRef.current;
    if (ownedDecks.length > 1 && previousDeckId !== null && activeDeckId !== previousDeckId) {
      setPendingBattleStart({ encounters, playerHp });
      setBattleDeckPreviewId(activeDeckId);
      return;
    }
    startBattleNow(encounters, playerHp, activeDeckId);
  };

  const confirmBattleDeck = (battleDeckId: string) => {
    if (!pendingBattleStart) return;
    const battleDeck = ownedDecks.find((deck) => deck.id === battleDeckId);
    if (!battleDeck) return;
    setActiveDeckId(battleDeckId);
    startBattleNow(pendingBattleStart.encounters, pendingBattleStart.playerHp, battleDeckId);
  };

  useEffect(() => {
    const seedTimer = window.setTimeout(() => {
      const nextSeed = createRandomMapSeed();
      setMapSeed(nextSeed);
      setMapEnemyWorld(createPreGeneratedMapEnemyWorld(nextSeed));
      setMapEnemyCellMemory({});
      const floorDrops = createPreGeneratedMapFloorDrops(nextSeed);
      setRoomDrops(floorDrops.cards);
      setRoomConsumableDrops(floorDrops.consumables);
      setSeenRooms(visibleMapRoomKeys(MAP_START, nextSeed));
    }, 0);
    return () => {
      window.clearTimeout(seedTimer);
      clearBattleTimers();
      if (mapTravelTimerRef.current !== null) window.clearTimeout(mapTravelTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!mapMessage) return;
    const messageTimer = window.setTimeout(() => setMapMessage(""), 1300);
    return () => window.clearTimeout(messageTimer);
  }, [mapMessage, mapMessageNonce]);

  const centerMapOn = (position: MapPosition) => {
    const viewport = mapViewportRef.current;
    if (!viewport) return;
    const roomCenterX = MAP_PADDING
      + (position.x - DUNGEON_MIN_X + MAP_WORLD_MARGIN_X) * (MAP_ROOM_WIDTH + MAP_CELL_GAP)
      + MAP_ROOM_WIDTH / 2;
    const roomCenterY = MAP_PADDING
      + (position.y + MAP_WORLD_MARGIN_Y) * (MAP_ROOM_HEIGHT + MAP_CELL_GAP)
      + MAP_ROOM_HEIGHT / 2;
    setMapPan({
      x: viewport.clientWidth / 2 - roomCenterX * mapZoom,
      y: viewport.clientHeight / 2 - roomCenterY * mapZoom,
    });
  };

  const focusMapOn = (position: MapPosition) => {
    window.requestAnimationFrame(() => centerMapOn(position));
  };

  const startMapTicketCameraTour = (origin: MapPosition, revealed: MapPosition[]) => {
    if (mapFocusTimerRef.current !== null) window.clearTimeout(mapFocusTimerRef.current);
    const route = [origin, ...revealed, origin];
    let stepIndex = 1;
    setMapCameraFocusing(true);
    focusMapOn(origin);
    const advance = () => {
      const destination = route[stepIndex];
      if (!destination) {
        setMapCameraFocusing(false);
        mapFocusTimerRef.current = null;
        return;
      }
      focusMapOn(destination);
      const isRevealedLocation = stepIndex < route.length - 1;
      stepIndex += 1;
      mapFocusTimerRef.current = window.setTimeout(advance, 360 + (isRevealedLocation ? 300 : 0));
    };
    mapFocusTimerRef.current = window.setTimeout(advance, 40);
  };

  const activateRoomFeature = (position: MapPosition) => {
    void position;
  };

  const rollBlessingOffers = (owned = blessings) => {
    const available = (Object.keys(BLESSING_INFO) as BlessingId[]).filter((id) => !owned.includes(id));
    return [...available].sort(() => Math.random() - .5).slice(0, 3);
  };
  const openBlessings = () => {
    setBlessingOffers((current) => current.length > 0 ? current : rollBlessingOffers());
    setBlessingOpen(true);
  };
  const chooseBlessing = (blessing: BlessingId) => {
    if (!blessingOffers.includes(blessing) || blessings.includes(blessing)) return;
    setBlessings((current) => [...current, blessing]);
    if (blessing === "sturdy") {
      runPlayerHpRef.current += 20;
      setRunPlayerHp((current) => current + 20);
    }
    if (blessing === "vision") {
      setSeenRooms((current) => new Set([...current, ...visibleMapRoomKeys(mapPosition, mapSeed, 2, 2)]));
    }
    if (blessing === "deckSize") setOwnedDecks((current) => current.map((deck) => ({ ...deck, capacity: deck.capacity + 5 })));
    setUsedBlessingRooms((current) => new Set(current).add(mapRoomKey(mapPosition)));
    setBlessingOffers([]);
    setBlessingOpen(false);
  };
  const rerollBlessings = () => {
    if (gold < blessingRerollCost) return;
    setGold((current) => current - blessingRerollCost);
    setBlessingRerollCost((current) => current + 10);
    setBlessingOffers(rollBlessingOffers());
  };
  const activateAthlete = () => {
    if (!blessings.includes("athlete") || athleteCooldown > 0) return;
    setAthletePrepared((current) => !current);
  };

  const consumeMindEyeMove = () => {
    setMindEyeMovesRemaining((current) => {
      const next = Math.max(0, current - 1);
      mindEyeMovesRemainingRef.current = next;
      return next;
    });
  };

  const advanceBombsAfterMovement = (
    playerPosition: MapPosition,
    world: MapEnemyWorld,
  ) => {
    const bombStep = advanceBombs(mapBombsRef.current);
    setMapBombsSynced(bombStep.bombs);
    const carriedBombExplosions: MapBomb[] = [];
    const nextInventoryConsumables = inventoryConsumablesRef.current.flatMap((consumable) => {
      if (consumable.type !== "bombTicket" || consumable.armedMovesRemaining === undefined) {
        return [consumable];
      }
      if (consumable.armedMovesRemaining <= 1) {
        carriedBombExplosions.push({
          id: `carried-bomb-${consumable.id}`,
          position: { ...playerPosition },
          movesRemaining: 0,
        });
        return [];
      }
      return [{ ...consumable, armedMovesRemaining: consumable.armedMovesRemaining - 1 }];
    });
    if (carriedBombExplosions.length > 0 || nextInventoryConsumables.some((item, index) =>
      item !== inventoryConsumablesRef.current[index])) {
      inventoryConsumablesRef.current = nextInventoryConsumables;
      setInventoryConsumables(nextInventoryConsumables);
    }
    const explosions = [...bombStep.explosions, ...carriedBombExplosions];
    if (explosions.length === 0) {
      return { world, playerDefeated: false };
    }

    const affectedPositions = explosions.flatMap((bomb) =>
      positionsInSquare(bomb.position, 1));
    setDestroyedShopRooms((current) => {
      const next = new Set(current);
      affectedPositions.forEach((position) => {
        if (getRoomType(position, mapSeed) === "shop") next.add(mapRoomKey(position));
      });
      return next;
    });
    setRockBombHits((current) => {
      const next = { ...current };
      affectedPositions.forEach((position) => {
        if (getRoomType(position, mapSeed) !== "rock") return;
        const roomKey = mapRoomKey(position);
        next[roomKey] = Math.min(3, (next[roomKey] ?? 0) + 1);
      });
      return next;
    });

    const playerHitCount = explosions.filter((bomb) =>
      chebyshevDistance(bomb.position, playerPosition) <= 1).length;
    let playerDefeated = false;
    if (playerHitCount > 0) {
      const nextHp = Math.max(0, runPlayerHpRef.current - 20 * playerHitCount);
      runPlayerHpRef.current = nextHp;
      setRunPlayerHp(nextHp);
      playerDefeated = nextHp === 0;
      if (playerDefeated) {
        clearMapTravel();
        setGame({
          ...waitingState(0, []),
          status: "lost",
          message: "폭탄에 휘말려 쓰러졌습니다.",
        });
        setPhase("playing");
        setScreen("battle");
      }
    }
    return {
      world: {
        ...world,
        enemies: applyBombDamage(world.enemies, explosions),
      },
      playerDefeated,
    };
  };

  const useCurrentPortal = () => {
    const roomType = effectiveRoomType(mapPosition);
    if (roomType === "portal") {
      const regionIndex = getDungeonRegionIndex(mapPosition);
      if (regionIndex === null) return;
      const destination = safeAreaEntry(regionIndex);
      setMapPosition(destination);
      rememberPlayerVision(destination);
      focusMapOn(destination);
      return;
    }
    if (roomType !== "safePortal") return;
    const regionIndex = getSafeAreaRegionIndex(mapPosition);
    if (regionIndex === null) return;
    if (regionIndex >= REGION_COUNT - 1) return;
    const destination = nextRegionEntry(regionIndex);
    setMapPosition(destination);
    rememberPlayerVision(destination);
    focusMapOn(destination);
  };

  const resolveMapStep = (
    currentPosition: MapPosition,
    nextPosition: MapPosition,
    world: MapEnemyWorld,
  ) => {
    if (athleteCooldown > 0) setAthleteCooldown((current) => Math.max(0, current - 1));
    const roomKey = mapRoomKey(nextPosition);
    // 직접 적을 만난 순간 전투로 전환한다. 그 턴에는 다른 적을 움직이지 않는다.
    const playerCollisionIds = new Set(world.enemies
      .filter((enemy) => mapRoomKey(enemy.position) === roomKey)
      .map((enemy) => enemy.id));
    if (playerCollisionIds.size > 0) {
      return {
        world,
        collisionEnemies: world.enemies.filter((enemy) => playerCollisionIds.has(enemy.id)),
      };
    }

    const enemyTurn = advanceMapEnemies(
      world.enemies,
      currentPosition,
      nextPosition,
      (position) => isWalkableRoom(effectiveRoomType(position)) && !isSafeAreaPosition(position),
      Math.random,
      playerCollisionIds,
      blessings.includes("lightStep") ? 0.5 : 1,
    );
    const nextWorld = {
      ...world,
      enemies: enemyTurn.enemies,
    };
    const collisionEnemyIds = new Set([
      ...playerCollisionIds,
      ...enemyTurn.collisionEnemyIds,
    ]);
    const collisionEnemies = enemyTurn.enemies.filter((enemy) =>
      collisionEnemyIds.has(enemy.id));
    return { world: nextWorld, collisionEnemies };
  };

  const beginMapEnemyBattle = (
    enemies: { id: string; encounterIndex: number; damageTaken?: number; awareness?: "sleeping" | "awake" | "alerted" }[],
    roomKey: string,
  ) => {
    setActiveMapEnemyIds(enemies.map((enemy) => enemy.id));
    setActiveBattleRoom(roomKey);
    startBattle(enemies, runPlayerHpRef.current);
  };

  const useCurrentHeal = () => {
    if (effectiveRoomType(mapPosition) !== "heal") return;
    const roomKey = mapRoomKey(mapPosition);
    runPlayerHpRef.current = maxPlayerHp;
    setRunPlayerHp(maxPlayerHp);
    setUsedHealRooms((current) => new Set(current).add(roomKey));
  };

  const useCurrentCampfire = () => {
    if (effectiveRoomType(mapPosition) !== "campfire") return;
    const roomKey = mapRoomKey(mapPosition);
    const healedHp = Math.min(maxPlayerHp, runPlayerHpRef.current + 10);
    const healed = healedHp - runPlayerHpRef.current;
    runPlayerHpRef.current = healedHp;
    setRunPlayerHp(healedHp);
    setCollapsedCampfireRooms((current) => new Set(current).add(roomKey));
    showMapMessage(`체력을 ${healed} 회복했습니다. 모닥불이 붕괴했습니다.`);
  };

  const openShrine = () => {
    if (effectiveRoomType(mapPosition) !== "shrine") return;
    setShrineDeckId(activeDeck?.id ?? "");
    setShrineDraggedCardId(null);
    setShrinePendingCardIds([]);
    setShrineDropActive(false);
    setShrineResult(null);
    setShrineOpen(true);
  };

  const extractCardsAtShrine = () => {
    if (effectiveRoomType(mapPosition) !== "shrine" || !shrineDeck) return;
    const selectedCards = shrineDeck.cards.filter((card) => shrinePendingCardIds.includes(card.id));
    if (selectedCards.length === 0) return;
    if (shrineDeck.cards.length - selectedCards.length < 1) {
      setMapMessage("덱에는 반드시 카드가 1장 이상 있어야 합니다.");
      return;
    }
    const roomKey = mapRoomKey(mapPosition);
    setOwnedDecks((current) => current.map((deck) => deck.id === shrineDeck.id
      ? { ...deck, cards: deck.cards.filter((item) => !shrinePendingCardIds.includes(item.id)) }
      : deck));
    setRoomDrops((current) => ({
      ...current,
      [roomKey]: [...(current[roomKey] ?? []), ...selectedCards],
    }));
    setDeckSelectionAttention(true);
    setCollapsedShrineRooms((current) => new Set(current).add(roomKey));
    setMapMessage(`${selectedCards.map((card) => card.name).join(", ")} 추출 완료. 추출의 성소가 붕괴했습니다.`);
    setShrineDraggedCardId(null);
    setShrinePendingCardIds([]);
    setShrineDropActive(false);
    setShrineResult({ cards: selectedCards });
  };

  const animateMapCollision = (
    enemies: { id: string; encounterIndex: number; damageTaken?: number }[],
    roomKey: string,
  ) => {
    setMapCollisionEnemyIds(enemies.map((enemy) => enemy.id));
    setMapTraveling(true);
    mapTravelTimerRef.current = window.setTimeout(() => {
      setMapBattleFlash(true);
      mapTravelTimerRef.current = window.setTimeout(() => {
        mapTravelTimerRef.current = null;
        setMapBattleFlash(false);
        setMapCollisionEnemyIds([]);
        beginMapEnemyBattle(enemies, roomKey);
      }, MAP_BATTLE_FLASH_MS);
    }, MAP_COLLISION_OVERLAP_MS);
  };

  const moveOnMap = (deltaX: number, deltaY: number) => {
    if (screen !== "map" || mapTraveling) return;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) !== 1) return;
    const nextPosition = {
      x: mapPosition.x + deltaX,
      y: mapPosition.y + deltaY,
    };
    if (!isWalkableRoom(effectiveRoomType(nextPosition))) return;
    if (athletePrepared) {
      const bombResult = advanceBombsAfterMovement(nextPosition, mapEnemyWorld);
      setMapPosition(nextPosition);
      rememberPlayerVision(nextPosition, mapSeed, bombResult.world.enemies);
      consumeMindEyeMove();
      setMapEnemyWorld(bombResult.world);
      setAthleteCooldown(30);
      setAthletePrepared(false);
      if (!bombResult.playerDefeated) activateRoomFeature(nextPosition);
      return;
    }
    const roomKey = mapRoomKey(nextPosition);
    const result = resolveMapStep(mapPosition, nextPosition, mapEnemyWorld);
    const bombResult = advanceBombsAfterMovement(nextPosition, result.world);
    const bombWorld = bombResult.world;
    const collisionIds = new Set(result.collisionEnemies.map((enemy) => enemy.id));
    const collisionEnemies = bombWorld.enemies.filter((enemy) => collisionIds.has(enemy.id));
    setMapPosition(nextPosition);
    rememberPlayerVision(nextPosition, mapSeed, bombWorld.enemies, mapEnemyWorld.enemies);
    consumeMindEyeMove();
    setMapEnemyWorld(bombWorld);
    if (bombResult.playerDefeated) return;
    if (collisionEnemies.length > 0) {
      animateMapCollision(collisionEnemies, roomKey);
      return;
    }
    activateRoomFeature(nextPosition);
  };

  const spendMapTurn = () => {
    if (screen !== "map" || mapTraveling) return;
    const roomKey = mapRoomKey(mapPosition);
    const result = resolveMapStep(mapPosition, mapPosition, mapEnemyWorld);
    const bombResult = advanceBombsAfterMovement(mapPosition, result.world);
    const collisionIds = new Set(result.collisionEnemies.map((enemy) => enemy.id));
    const collisionEnemies = bombResult.world.enemies.filter((enemy) => collisionIds.has(enemy.id));
    rememberPlayerVision(mapPosition, mapSeed, bombResult.world.enemies, mapEnemyWorld.enemies);
    setMapEnemyWorld(bombResult.world);
    if (bombResult.playerDefeated) return;
    if (collisionEnemies.length > 0) {
      animateMapCollision(collisionEnemies, roomKey);
      return;
    }
  };

  const waitOnMap = () => {
    spendMapTurn();
  };

  const travelSafePath = (path: MapPosition[]) => {
    if (screen !== "map" || mapTraveling || path.length < 2) return;
    if (debugMode) {
      const destination = path.at(-1)!;
      clearMapTravel();
      setMapPosition(destination);
      rememberPlayerVision(destination);
      focusMapOn(destination);
      activateRoomFeature(destination);
      return;
    }
    if (mapEnemyWorld.enemies.some((enemy) =>
      isInPlayerVision(enemy.position, mapPosition, visionHorizontalRadius, visionVerticalRadius))) {
      showMapMessage("적이 시야 안에 있습니다! (빠른 이동 불가)");
      return;
    }

    const stepDuration = Math.max(70, Math.round(MAP_TRAVEL_STEP_MS / Math.sqrt(path.length - 1)));
    setMapTravelStepMs(stepDuration);
    setMapTraveling(true);
    let currentPosition = mapPosition;
    let currentWorld = mapEnemyWorld;
    let stepIndex = 1;
    const advance = () => {
      const nextPosition = path[stepIndex];
      const roomKey = mapRoomKey(nextPosition);
      const previousWorld = currentWorld;
      const result = resolveMapStep(currentPosition, nextPosition, currentWorld);
      const bombResult = advanceBombsAfterMovement(nextPosition, result.world);
      const bombWorld = bombResult.world;
      const collisionIds = new Set(result.collisionEnemies.map((enemy) => enemy.id));
      const collisionEnemies = bombWorld.enemies.filter((enemy) => collisionIds.has(enemy.id));
      currentPosition = nextPosition;
      currentWorld = bombWorld;
      setMapPosition(nextPosition);
      rememberPlayerVision(nextPosition, mapSeed, bombWorld.enemies, previousWorld.enemies);
      consumeMindEyeMove();
      setMapEnemyWorld(bombWorld);
      if (bombResult.playerDefeated) {
        mapTravelTimerRef.current = null;
        setMapTraveling(false);
        return;
      }

      if (collisionEnemies.length > 0) {
        mapTravelTimerRef.current = null;
        animateMapCollision(collisionEnemies, roomKey);
        return;
      }
      if (bombWorld.enemies.some((enemy) =>
        isInPlayerVision(enemy.position, nextPosition, visionHorizontalRadius, visionVerticalRadius))) {
        mapTravelTimerRef.current = null;
        setMapTraveling(false);
        showMapMessage("적을 발견해 빠른 이동이 중지 되었습니다.");
        return;
      }

      stepIndex += 1;
      if (stepIndex < path.length) {
        mapTravelTimerRef.current = window.setTimeout(advance, stepDuration);
      } else {
        mapTravelTimerRef.current = null;
        setMapTraveling(false);
        activateRoomFeature(nextPosition);
      }
    };
    advance();
  };

  const returnToMap = () => {
    const battleRoom = activeBattleRoom;
    if (battleRoom) {
      const landingDrops = [...(roomDrops[battleRoom] ?? []), ...battleRewards];
      setRoomDrops((current) => ({
        ...current,
        [battleRoom]: landingDrops,
      }));
      setGold((current) => current + battleRewardGold);
    }
    if (activeMapEnemyIds.length > 0 && battleRoom) {
      const remainingEnemies = mapEnemyWorld.enemies.filter((enemy) => !activeMapEnemyIds.includes(enemy.id));
      setMapEnemyWorld({ ...mapEnemyWorld, enemies: remainingEnemies });
      rememberPlayerVision(mapPosition, mapSeed, remainingEnemies);
      if (battleRewardDecks.length > 0) setRoomDeckDrops((current) => ({
        ...current,
        [battleRoom]: [...(current[battleRoom] ?? []), ...battleRewardDecks],
      }));
      if (battleRewardConsumables.length > 0) setRoomConsumableDrops((current) => ({
        ...current,
        [battleRoom]: [...(current[battleRoom] ?? []), ...battleRewardConsumables],
      }));
    }
    runPlayerHpRef.current = game.playerHp;
    setRunPlayerHp(game.playerHp);
    setBattleRewards([]);
    setBattleRewardDecks([]);
    setBattleRewardConsumables([]);
    setBattleRewardGold(0);
    setActiveMapEnemyIds([]);
    setActiveBattleRoom(null);
    setScreen("map");
  };

  const startNewRun = () => {
    clearBattleTimers();
    clearMapTravel();
    const nextSeed = createRandomMapSeed();
    const starterDeck = createStarterDeck();
    setPlayerName(createRandomPlayerName());
    setPlayerNameSetupOpen(true);
    runPlayerHpRef.current = MAX_PLAYER_HP;
    setRunPlayerHp(MAX_PLAYER_HP);
    setMapSeed(nextSeed);
    setMapPosition(MAP_START);
    setMapMessage("");
    setMindEyeMovesRemaining(0);
    mindEyeMovesRemainingRef.current = 0;
    setSeenRooms(visibleMapRoomKeys(MAP_START, nextSeed));
    setMapEnemyWorld(createPreGeneratedMapEnemyWorld(nextSeed));
    setMapEnemyCellMemory({});
    setMapBombsSynced([]);
    setDestroyedShopRooms(new Set());
    setCollapsedShrineRooms(new Set());
    setCollapsedCampfireRooms(new Set());
    setShrineOpen(false);
    setShrineDraggedCardId(null);
    setShrinePendingCardIds([]);
    setShrineDropActive(false);
    setShrineResult(null);
    setUsedHealRooms(new Set());
    setUsedBlessingRooms(new Set());
    setRockBombHits({});
    setActiveMapEnemyIds([]);
    setActiveBattleRoom(null);
    previousBattleDeckIdRef.current = null;
    setPendingBattleStart(null);
    setBattleDeckPreviewId(null);
    setOwnedDecks([starterDeck]);
    setActiveDeckId(starterDeck.id);
    setDeckSelectionAttention(false);
    setInventoryCards([]);
    setInventoryConsumables([]);
    const floorDrops = createPreGeneratedMapFloorDrops(nextSeed);
    setRoomDrops(floorDrops.cards);
    setRoomConsumableDrops(floorDrops.consumables);
    setRoomDeckDrops({});
    setRoomShops({});
    setShopOpen(false);
    setBlessingOpen(false);
    setBlessingOffers([]);
    setBlessings([]);
    setBlessingRerollCost(50);
    setAthleteCooldown(0);
    setAthletePrepared(false);
    setActiveShopRoom(null);
    setGold(0);
    setBattleRewards([]);
    setBattleRewardDecks([]);
    setBattleRewardConsumables([]);
    setBattleRewardGold(0);
    deckDropChanceRef.current = 0.25;
    rareCardDropChanceRef.current = 0.05;
    setDeckEditorOpen(false);
    setDeckViewerOpen(false);
    setDeckEditorSnapshot(null);
    setHoveredDeckCard(null);
    clearCardKeywordHover();
    setPendingPaintTicketId(null);
    setPendingCloneTicketId(null);
    setPendingExtractTicketId(null);
    setPendingTransformTicketId(null);
    setArmedBombTicketIds(new Set());
    nextCardIdRef.current = STARTING_DECK_SIZE;
    nextConsumableIdRef.current = 1;
    setGame(waitingState());
    setPhase("drawing");
    setScreen("map");
  };

  const originalDeckIdForCard = (cardId: number) => {
    for (const deck of deckEditorSnapshot?.decks ?? []) {
      if (deck.cards.some((card) => card.id === cardId)) return deck.id;
    }
    for (const deck of deckEditorSnapshot?.floorDecks ?? []) {
      if (deck.cards.some((card) => card.id === cardId)) return deck.id;
    }
    return null;
  };

  const clearCardKeywordHover = () => {
    setKeywordHoverRequest(null);
    setHoveredCardKeywords(null);
  };

  useEffect(() => {
    if (!keywordHoverRequest) return;
    const timer = window.setTimeout(() => {
      const margin = 12;
      const width = Math.min(310, Math.max(0, window.innerWidth - margin * 2));
      const offset = 16;
      const left = keywordHoverRequest.right + offset + width <= window.innerWidth - margin
        ? keywordHoverRequest.right + offset
        : Math.max(margin, keywordHoverRequest.right - width - offset);
      const anchorTop = Math.max(margin, keywordHoverRequest.top);
      setHoveredCardKeywords({
        card: keywordHoverRequest.card,
        x: left,
        y: anchorTop,
        anchorTop,
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [keywordHoverRequest]);

  useLayoutEffect(() => {
    if (!hoveredCardKeywords || !cardKeywordPopoverRef.current) return;
    const margin = 12;
    const actualHeight = cardKeywordPopoverRef.current.getBoundingClientRect().height;
    const correctedTop = Math.max(
      margin,
      Math.min(hoveredCardKeywords.anchorTop, window.innerHeight - actualHeight - margin),
    );
    if (Math.abs(correctedTop - hoveredCardKeywords.y) < 0.5) return;
    setHoveredCardKeywords((current) => current && current.card.id === hoveredCardKeywords.card.id
      ? { ...current, y: correctedTop }
      : current);
  }, [hoveredCardKeywords]);

  const scheduleCardKeywordHover = (card: Card, cardRight: number, cardTop: number) => {
    if (getCardKeywordInfos(card).length === 0) {
      clearCardKeywordHover();
      return;
    }
    const requestChanged = keywordHoverRequest?.card.id !== card.id
      || keywordHoverRequest.right !== cardRight
      || keywordHoverRequest.top !== cardTop;
    if (requestChanged) {
      setKeywordHoverRequest({ card, right: cardRight, top: cardTop });
      setHoveredCardKeywords(null);
    }
  };

  const showCardKeywordOnly = (card: Card, cardRight: number, cardTop: number) => {
    if (deckPreviewSuppressed) {
      clearCardKeywordHover();
      return;
    }
    scheduleCardKeywordHover(card, cardRight, cardTop);
    setHoveredDeckCard(null);
    setHoveredConsumable(null);
  };

  const showDeckCardPreview = (
    card: Card,
    anchorRight: number,
    anchorTop: number,
  ) => {
    if (deckPreviewSuppressed) {
      clearCardKeywordHover();
      return;
    }
    const margin = 12;
    const offset = 18;
    const previewWidth = 136;
    const previewHeight = 191;
    const previewLeft = Math.max(margin, Math.min(anchorRight + offset, window.innerWidth - previewWidth - margin));
    const previewTop = Math.max(margin, Math.min(anchorTop + offset, window.innerHeight - previewHeight - margin));
    const previewRight = previewLeft + previewWidth;
    scheduleCardKeywordHover(card, previewRight, previewTop);
    setHoveredDeckCard(card);
    setHoveredConsumable(null);
    setDeckPreviewPosition({
      x: previewLeft,
      y: previewTop,
    });
  };

  const showConsumablePreview = (consumable: Consumable, anchorRight: number, anchorTop: number) => {
    const margin = 12;
    const offset = 18;
    const previewWidth = 190;
    const previewHeight = 118;
    setHoveredDeckCard(null);
    clearCardKeywordHover();
    setHoveredConsumable(consumable);
    setDeckPreviewPosition({
      x: Math.max(margin, Math.min(anchorRight + offset, window.innerWidth - previewWidth - margin)),
      y: Math.max(margin, Math.min(anchorTop + offset, window.innerHeight - previewHeight - margin)),
    });
  };

  const moveDeckCardPreview = (event: ReactMouseEvent<HTMLElement>, card: Card) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    showDeckCardPreview(card, bounds.right, bounds.top);
  };

  const showEnemyIntentTooltip = (event: { currentTarget: HTMLElement }, action: EnemyAction) => {
    const text = enemyIntentEffectDescription(action);
    if (!text) {
      setHoveredEnemyIntentTooltip(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const margin = 12;
    const gap = 12;
    const maxWidth = Math.min(280, Math.max(0, window.innerWidth - margin * 2));
    const x = bounds.right + gap + maxWidth <= window.innerWidth - margin
      ? bounds.right + gap
      : Math.max(margin, bounds.left - maxWidth - gap);
    const estimatedHeight = 56;
    setHoveredEnemyIntentTooltip({
      text,
      x,
      y: Math.max(margin, Math.min(bounds.top, window.innerHeight - estimatedHeight - margin)),
      maxWidth,
    });
  };

  const scrollDeckEditorCardsHorizontally = (event: ReactWheelEvent<HTMLDivElement>) => {
    const row = event.currentTarget;
    if (row.scrollWidth <= row.clientWidth) return;
    const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
    if (delta === 0) return;
    event.preventDefault();
    row.scrollLeft += delta * 1.5;
  };

  const moveDeckCardToInventory = (cardId: number, deckId = editingDeck?.id) => {
    const deck = ownedDecks.find((item) => item.id === deckId);
    const card = deck?.cards.find((item) => item.id === cardId);
    if (!deck || !card) return;
    const isNewCard = !originalDeckIdForCard(cardId);
    if (!isSafeAreaPosition(mapPosition) && !isNewCard) {
      showMapMessage("현재 위치에서는 불가능합니다.");
      return;
    }
    if (deck.cards.length <= 1) {
      setDeckEditorMessage("덱에는 반드시 카드가 1장 이상 있어야 합니다.");
      return;
    }
    if (deckEditorInventoryItemCount >= inventoryCapacity) {
      setDeckEditorMessage("인벤토리가 가득 찼습니다.");
      return;
    }
    updateDeckCards(deck.id, (current) => current.filter((item) => item.id !== cardId));
    setInventoryCards((current) => [...current, card]);
    setDeckEditorMessage(`${card.name}을(를) 인벤토리로 옮겼습니다.`);
  };

  const moveDeckCardToFloor = (cardId: number, deckId = editingDeck?.id) => {
    const deck = ownedDecks.find((item) => item.id === deckId);
    if (!deck) return;
    if (deck.cards.length <= 1) {
      setDeckEditorMessage("덱에는 반드시 카드가 1장 이상 있어야 합니다.");
      return;
    }
    const card = deck.cards.find((item) => item.id === cardId);
    if (!card) return;
    const isNewCard = !originalDeckIdForCard(cardId);
    updateDeckCards(deck.id, (current) => current.filter((item) => item.id !== cardId));
    setHoveredDeckCard(null);
    clearCardKeywordHover();
    if (isSafeAreaPosition(mapPosition) || isNewCard) {
      const roomKey = mapRoomKey(mapPosition);
      setRoomDrops((current) => ({
        ...current,
        [roomKey]: [...(current[roomKey] ?? []), card],
      }));
      setDeckEditorMessage(`${card.name}을(를) 덱에서 바닥으로 옮겼습니다.`);
      return;
    }
    setPendingRemovedCards((current) => [...current, card]);
    setPendingRemovedCardAreas((current) => ({ ...current, [card.id]: "floor" }));
    setDeckEditorMessage(`${card.name}을(를) 제거 예정 상태로 만들었습니다.`);
  };

  const moveInventoryCardToDeck = (cardId: number, deckId = editingDeck?.id) => {
    const deck = ownedDecks.find((item) => item.id === deckId);
    if (!deck || deck.cards.length >= deck.capacity) {
      setDeckEditorMessage(`${deck?.name ?? "현재 덱"}에는 더 이상 카드를 넣을 수 없습니다.`);
      return;
    }
    const card = inventoryCards.find((item) => item.id === cardId);
    if (!card) return;
    setInventoryCards((current) => current.filter((item) => item.id !== cardId));
    updateDeckCards(deck.id, (current) => [...current, card]);
    setDeckEditorMessage(`${card.name}을(를) 덱에 넣었습니다.`);
  };

  const moveInventoryCardToFloor = (cardId: number) => {
    const card = inventoryCards.find((item) => item.id === cardId);
    if (!card) return;
    setInventoryCards((current) => current.filter((item) => item.id !== cardId));
    const roomKey = mapRoomKey(mapPosition);
    setRoomDrops((current) => ({
      ...current,
      [roomKey]: [...(current[roomKey] ?? []), card],
    }));
    setDeckEditorMessage(`${card.name}을(를) 바닥에 놓았습니다.`);
  };

  const moveFloorCardToInventory = (cardId: number) => {
    if (inventoryItemCount >= inventoryCapacity) {
      showMapMessage("인벤토리가 가득찼습니다!");
      return;
    }
    const roomKey = mapRoomKey(mapPosition);
    const card = (roomDrops[roomKey] ?? []).find((item) => item.id === cardId);
    if (!card) return;
    setRoomDrops((current) => ({
      ...current,
      [roomKey]: (current[roomKey] ?? []).filter((item) => item.id !== cardId),
    }));
    setInventoryCards((current) => [...current, card]);
    setDeckEditorMessage(`${card.name}을(를) 인벤토리에 주웠습니다.`);
  };

  const moveFloorCardToDeck = (cardId: number, deckId = editingDeck?.id) => {
    const deck = ownedDecks.find((item) => item.id === deckId);
    if (!deck || deck.cards.length >= deck.capacity) {
      setDeckEditorMessage(`${deck?.name ?? "현재 덱"}에는 더 이상 카드를 넣을 수 없습니다.`);
      return;
    }
    const roomKey = mapRoomKey(mapPosition);
    const card = (roomDrops[roomKey] ?? []).find((item) => item.id === cardId);
    if (!card) return;
    setRoomDrops((current) => ({
      ...current,
      [roomKey]: (current[roomKey] ?? []).filter((item) => item.id !== cardId),
    }));
    updateDeckCards(deck.id, (current) => [...current, card]);
    setDeckEditorMessage(`${card.name}을(를) 바닥에서 덱에 넣었습니다.`);
  };

  const moveFloorConsumableToInventory = (consumableId: string) => {
    if (inventoryItemCount >= inventoryCapacity) {
      showMapMessage("인벤토리가 가득찼습니다!");
      return;
    }
    const roomKey = mapRoomKey(mapPosition);
    const consumable = (roomConsumableDrops[roomKey] ?? []).find((item) => item.id === consumableId);
    if (!consumable) return;
    setRoomConsumableDrops((current) => ({
      ...current,
      [roomKey]: (current[roomKey] ?? []).filter((item) => item.id !== consumableId),
    }));
    setInventoryConsumables((current) => {
      const next = current.some((item) => item.id === consumable.id)
        ? current
        : [...current, consumable];
      inventoryConsumablesRef.current = next;
      return next;
    });
    setDeckEditorMessage(`${consumable.name}을(를) 인벤토리에 주웠습니다.`);
  };

  const moveInventoryConsumableToFloor = (consumableId: string) => {
    const consumable = inventoryConsumablesRef.current.find((item) => item.id === consumableId)
      ?? inventoryConsumables.find((item) => item.id === consumableId);
    if (!consumable) return;
    const roomKey = mapRoomKey(mapPosition);
    setInventoryConsumables((current) => {
      const next = current.filter((item) => item.id !== consumableId);
      inventoryConsumablesRef.current = next;
      return next;
    });
    setRoomConsumableDrops((current) => ({
      ...current,
      [roomKey]: [...(current[roomKey] ?? []), consumable],
    }));
    if (pendingPaintTicketId === consumableId) setPendingPaintTicketId(null);
    if (pendingCloneTicketId === consumableId) setPendingCloneTicketId(null);
    if (pendingExtractTicketId === consumableId) setPendingExtractTicketId(null);
    if (pendingTransformTicketId === consumableId) setPendingTransformTicketId(null);
    setArmedBombTicketIds((current) => {
      const next = new Set(current);
      next.delete(consumableId);
      return next;
    });
    setDeckEditorMessage(`${consumable.name}을(를) 바닥에 놓았습니다.`);
  };

  const beginConsumableDrag = (
    event: ReactDragEvent<HTMLElement>,
    id: string,
    source: ConsumableArea,
  ) => {
    setHoveredConsumable(null);
    setTicketDropTarget(null);
    const drag = { id, source };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `consumable:${source}:${id}`);
    consumableDragRef.current = drag;
    setConsumableDrag(drag);
  };

  const finishConsumableDrag = () => {
    consumableDragRef.current = null;
    setConsumableDrag(null);
    setTicketDropTarget(null);
  };

  const ticketDropKey = (area: TicketDropArea, cardId: number, deckId?: string) =>
    `${area}:${deckId ?? ""}:${cardId}`;

  const findTicketById = (ticketId: string, type?: ConsumableType) => {
    const matches = (item: Consumable) => item.id === ticketId && (
      type === undefined || item.type === type
    );
    const inventoryTicket = inventoryConsumables.find(matches);
    if (inventoryTicket) return inventoryTicket;
    const roomKey = mapRoomKey(mapPosition);
    return (roomConsumableDrops[roomKey] ?? []).find(matches);
  };

  const consumeTicketById = (ticketId: string) => {
    setInventoryConsumables((current) => {
      const next = current.filter((item) => item.id !== ticketId);
      inventoryConsumablesRef.current = next;
      return next;
    });
    const roomKey = mapRoomKey(mapPosition);
    setRoomConsumableDrops((current) => ({
      ...current,
      [roomKey]: (current[roomKey] ?? []).filter((item) => item.id !== ticketId),
    }));
  };

  const getDraggedTicket = () => {
    const drag = consumableDragRef.current ?? consumableDrag;
    if (!drag || (drag.source !== "inventory" && drag.source !== "floor")) return null;
    return findTicketById(drag.id) ?? null;
  };

  const canApplyTicketToCard = (
    ticket: Consumable | null,
    card: Card,
    area: TicketDropArea,
    deck?: DeckCase,
  ) => {
    if (!ticket || !["paintTicket", "cloneTicket", "extractTicket", "transformTicket"].includes(ticket.type)) return false;
    if (ticket.type === "paintTicket") return area === "deck";
    if (ticket.type === "extractTicket") return area === "deck" && Boolean(deck && deck.cards.length > 1);
    return card.rarity !== "legendary";
  };

  const handleTicketDragOverCard = (
    event: ReactDragEvent<HTMLElement>,
    card: Card,
    area: TicketDropArea,
    deck?: DeckCase,
    targetCardId = card.id,
  ) => {
    const ticket = getDraggedTicket();
    if (!canApplyTicketToCard(ticket, card, area, deck)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setTicketDropTarget(ticketDropKey(area, targetCardId, deck?.id));
  };

  const handleTicketDragLeave = (event: ReactDragEvent<HTMLElement>, targetKey: string) => {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
    setTicketDropTarget((current) => current === targetKey ? null : current);
  };

  const handleTicketDropOnCard = (
    event: ReactDragEvent<HTMLElement>,
    card: Card,
    area: TicketDropArea,
    deck?: DeckCase,
    targetCardId = card.id,
  ) => {
    const drag = consumableDragRef.current ?? consumableDrag;
    const ticket = getDraggedTicket();
    if (!drag || !ticket || !canApplyTicketToCard(ticket, card, area, deck)) return;
    event.preventDefault();
    event.stopPropagation();
    const targetCard = card.id === targetCardId ? card : { ...card, id: targetCardId };
    if (ticket.type === "paintTicket" && area === "deck" && deck) {
      paintDeckCard(targetCardId, ticket.id, deck.id);
    } else if (ticket.type === "cloneTicket") {
      cloneCardWithTicket(targetCard, ticket.id);
    } else if (ticket.type === "extractTicket" && area === "deck" && deck) {
      extractDeckCardWithTicket(targetCardId, deck.id, ticket.id);
    } else if (ticket.type === "transformTicket") {
      transformCardWithTicket(targetCard, area, deck?.id, ticket.id);
    }
    finishConsumableDrag();
  };

  const closeDeckEditorAfterMapTicket = () => {
    setDeckEditorSnapshot(null);
    setPendingRemovedCards([]);
    setPendingRemovedCardAreas({});
    setHoveredDeckCard(null);
    clearCardKeywordHover();
    setPendingPaintTicketId(null);
    setPendingCloneTicketId(null);
    setPendingExtractTicketId(null);
    setPendingTransformTicketId(null);
    setArmedBombTicketIds(new Set());
    finishConsumableDrag();
    finishDeckEditorDrag();
    setDeckEditorOpen(false);
  };

  const dropConsumable = (event: ReactDragEvent<HTMLElement>, target: ConsumableArea) => {
    const drag = consumableDragRef.current ?? consumableDrag;
    if (!drag || drag.source === target) return;
    event.preventDefault();
    event.stopPropagation();
    if (drag.source === "floor" && target === "inventory") moveFloorConsumableToInventory(drag.id);
    if (drag.source === "inventory" && target === "floor") moveInventoryConsumableToFloor(drag.id);
    finishConsumableDrag();
  };

  const consumeMindEyeTicket = (consumableId: string) => {
    const ticket = inventoryConsumables.find((item) =>
      item.id === consumableId && item.type === "mindEyeTicket");
    if (!ticket) return;
    setInventoryConsumables((current) => current.filter((item) => item.id !== consumableId));
    closeDeckEditorAfterMapTicket();
    mindEyeMovesRemainingRef.current = 20;
    setMindEyeMovesRemaining(20);
    setSeenRooms((current) => new Set([...current, ...visibleMapRoomKeys(mapPosition, mapSeed, 4, 4)]));
    showMapMessage("심안: 20번 이동 동안 9×9 시야를 얻었습니다.");
  };

  const installArmedFloorBombs = () => {
    const roomKey = mapRoomKey(mapPosition);
    const armedBombs = (roomConsumableDrops[roomKey] ?? []).filter((item) =>
      item.type === "bombTicket" && item.armedMovesRemaining !== undefined);
    if (armedBombs.length === 0) return;
    setRoomConsumableDrops((current) => ({
      ...current,
      [roomKey]: (current[roomKey] ?? []).filter((item) => !armedBombs.some((bomb) => bomb.id === item.id)),
    }));
    setMapBombsSynced([
      ...mapBombsRef.current,
      ...armedBombs.map((bomb) => ({
        id: `bomb-${bomb.id}`,
        position: { ...mapPosition },
        movesRemaining: bomb.armedMovesRemaining!,
      })),
    ]);
  };

  const cloneCardWithTicket = (card: Card, ticketId = pendingCloneTicketId) => {
    if (!ticketId) return;
    if (card.rarity === "legendary") {
      setDeckEditorMessage("전설 카드는 복제할 수 없습니다.");
      return;
    }
    const ticket = findTicketById(ticketId, "cloneTicket");
    if (!ticket) return;
    const clone = { ...card, id: nextCardIdRef.current, revealed: false };
    nextCardIdRef.current += 1;
    consumeTicketById(ticketId);
    setInventoryCards((current) => [...current, clone]);
    setPendingCloneTicketId(null);
    setDeckEditorMessage(`${card.name}을(를) 복제했습니다.`);
  };

  const cloneConsumableWithTicket = (targetId: string) => {
    if (!pendingCloneTicketId) return;
    const sourceTicket = inventoryConsumables.find((item) =>
      item.id === pendingCloneTicketId && item.type === "cloneTicket");
    const target = inventoryConsumables.find((item) => item.id === targetId);
    if (!sourceTicket || !target) return;
    const clone = nextConsumable(target.type);
    setInventoryConsumables((current) => [
      ...current.filter((item) => item.id !== pendingCloneTicketId),
      clone,
    ]);
    setPendingCloneTicketId(null);
    setDeckEditorMessage(`${target.name}을(를) 복제했습니다.`);
  };

  const selectExtractionTicket = (consumable: Consumable) => {
    if (pendingTransformTicketId && consumable.id !== pendingTransformTicketId) {
      transformConsumableWithTicket(consumable.id);
      return;
    }
    if (pendingCloneTicketId && consumable.id !== pendingCloneTicketId) {
      cloneConsumableWithTicket(consumable.id);
      return;
    }
    if (consumable.type === "cardPack") {
      openCardPack(consumable.id);
      return;
    }
    if (consumable.type === "mindEyeTicket") {
      consumeMindEyeTicket(consumable.id);
      return;
    }
    if (consumable.type === "bombTicket") {
      const cancelling = consumable.armedMovesRemaining !== undefined;
      setArmedBombTicketIds((current) => {
        const next = new Set(current);
        if (cancelling) next.delete(consumable.id);
        else next.add(consumable.id);
        return next;
      });
      setInventoryConsumables((current) => {
        const next = current.map((item) => item.id === consumable.id
          ? { ...item, armedMovesRemaining: cancelling ? undefined : 3 }
          : item);
        inventoryConsumablesRef.current = next;
        return next;
      });
      setPendingPaintTicketId(null);
      setPendingCloneTicketId(null);
      setPendingExtractTicketId(null);
      setPendingTransformTicketId(null);
      setDeckEditorMessage(cancelling
        ? "폭탄 점화를 취소했습니다."
        : "폭탄을 점화했습니다. 바닥에 내려놓고 편집을 확인하면 설치됩니다.");
      return;
    }
    if (consumable.type === "cloneTicket") {
      setArmedBombTicketIds(new Set());
      const cancelling = pendingCloneTicketId === consumable.id;
      setPendingCloneTicketId(cancelling ? null : consumable.id);
      setPendingPaintTicketId(null);
      setPendingExtractTicketId(null);
      setPendingTransformTicketId(null);
      setDeckEditorMessage(cancelling ? "복제를 취소했습니다." : "복제할 카드나 티켓을 클릭하세요.");
      return;
    }
    if (consumable.type === "paintTicket") {
      setArmedBombTicketIds(new Set());
      setPendingPaintTicketId((current) => current === consumable.id ? null : consumable.id);
      setPendingCloneTicketId(null);
      setPendingExtractTicketId(null);
      setPendingTransformTicketId(null);
      setDeckEditorMessage(
        pendingPaintTicketId === consumable.id ? "색칠을 취소했습니다." : "색칠할 덱 카드 1장을 클릭하세요.",
      );
      return;
    }
    if (consumable.type === "extractTicket") {
      const cancelling = pendingExtractTicketId === consumable.id;
      setPendingExtractTicketId(cancelling ? null : consumable.id);
      setPendingPaintTicketId(null);
      setPendingCloneTicketId(null);
      setPendingTransformTicketId(null);
      setDeckEditorMessage(cancelling ? "추출을 취소했습니다." : "덱에서 추출할 카드 1장을 클릭하세요.");
      return;
    }
    if (consumable.type === "transformTicket") {
      const cancelling = pendingTransformTicketId === consumable.id;
      setPendingTransformTicketId(cancelling ? null : consumable.id);
      setPendingPaintTicketId(null);
      setPendingCloneTicketId(null);
      setPendingExtractTicketId(null);
      setDeckEditorMessage(cancelling ? "변환을 취소했습니다." : "변환할 카드나 티켓을 클릭하세요.");
      return;
    }
    if (consumable.type === "mapTicket") {
      const regionIndex = getDungeonRegionIndex(mapPosition);
      if (regionIndex === null) {
        setDeckEditorMessage("던전 지역 안에서만 사용할 수 있습니다.");
        return;
      }
      const candidates: MapPosition[] = [];
      for (let y = regionStartY(regionIndex); y < regionStartY(regionIndex) + regionHeight(regionIndex); y += 1) {
        for (let x = DUNGEON_MIN_X; x <= DUNGEON_MAX_X; x += 1) {
          const position = { x, y };
          const type = effectiveRoomType(position);
          if ((type === "shop" || type === "shrine" || type === "campfire") && !seenRooms.has(mapRoomKey(position))) candidates.push(position);
        }
      }
      candidates.sort((left, right) => chebyshevDistance(left, mapPosition) - chebyshevDistance(right, mapPosition));
      const revealed = candidates.slice(0, 2);
      const nearest = revealed[0];
      if (!nearest) {
        setDeckEditorMessage("같은 지역에 아직 밝히지 않은 상점·추출의 성소·모닥불이 없습니다.");
        return;
      }
      closeDeckEditorAfterMapTicket();
      setSeenRooms((current) => new Set([...current, ...revealed.map((position) => mapRoomKey(position))]));
      setInventoryConsumables((current) => current.filter((item) => item.id !== consumable.id));
      startMapTicketCameraTour(mapPosition, revealed);
      const revealedNames = revealed.map((position) => {
        const type = effectiveRoomType(position);
        return type === "shop" ? "상점" : type === "shrine" ? "추출의 성소" : "모닥불";
      });
      setDeckEditorMessage(`${revealedNames.join(", ")} ${revealed.length}곳의 위치를 밝혔습니다.`);
      return;
    }
  };

  const pickUpFloorDeck = (deckId: string) => {
    if (ownedDecks.length >= maxOwnedDecks) {
      setDeckEditorMessage(`덱은 최대 ${MAX_OWNED_DECKS}개까지 보유할 수 있습니다.`);
      return;
    }
    const roomKey = mapRoomKey(mapPosition);
    const deck = (roomDeckDrops[roomKey] ?? []).find((item) => item.id === deckId);
    if (!deck) return;
    setRoomDeckDrops((current) => ({
      ...current,
      [roomKey]: (current[roomKey] ?? []).filter((item) => item.id !== deckId),
    }));
    setOwnedDecks((current) => [...current, deck]);
    setDeckEditorMessage(`덱 '${deck.name}'을(를) 주웠습니다. 보유 덱 ${ownedDecks.length + 1} / ${MAX_OWNED_DECKS}`);
  };

  const paintDeckCard = (cardId: number, ticketId = pendingPaintTicketId, deckId = editingDeck?.id) => {
    if (!ticketId) return;
    const deck = ownedDecks.find((item) => item.id === deckId);
    const card = deck?.cards.find((item) => item.id === cardId);
    if (!card) return;
    const ticket = findTicketById(ticketId, "paintTicket");
    if (!ticket) return;
    consumeTicketById(ticketId);
    updateDeckCards(deck?.id, (current) => current.map((item) => item.id === cardId ? { ...item, colored: true } : item));
    setPendingPaintTicketId(null);
    setDeckEditorMessage(`${card.name}을(를) 색칠했습니다.`);
  };

  const quickPickUpFloorItems = () => {
    const roomKey = mapRoomKey(mapPosition);
    const floorCards = roomDrops[roomKey] ?? [];
    const floorConsumables = roomConsumableDrops[roomKey] ?? [];
    const floorDecks = roomDeckDrops[roomKey] ?? [];
    const freeItemSlots = Math.max(0, inventoryCapacity - inventoryItemCount);
    const pickedCards = floorCards.slice(0, freeItemSlots);
    const pickedConsumables = floorConsumables.slice(0, freeItemSlots - pickedCards.length);
    const pickedDecks = floorDecks.slice(0, Math.max(0, maxOwnedDecks - ownedDecks.length));
    if (pickedCards.length > 0) {
      setRoomDrops((current) => ({
        ...current,
        [roomKey]: (current[roomKey] ?? []).filter((card) => !pickedCards.some((item) => item.id === card.id)),
      }));
      setInventoryCards((current) => [...current, ...pickedCards]);
    }
    if (pickedConsumables.length > 0) {
      setRoomConsumableDrops((current) => ({
        ...current,
        [roomKey]: (current[roomKey] ?? []).filter((item) => !pickedConsumables.some((picked) => picked.id === item.id)),
      }));
      setInventoryConsumables((current) => [...current, ...pickedConsumables]);
    }
    if (pickedDecks.length > 0) {
      setRoomDeckDrops((current) => ({
        ...current,
        [roomKey]: (current[roomKey] ?? []).filter((deck) => !pickedDecks.some((picked) => picked.id === deck.id)),
      }));
      setOwnedDecks((current) => [...current, ...pickedDecks]);
    }
    if (floorCards.length + floorConsumables.length > freeItemSlots) {
      showMapMessage("인벤토리가 가득찼습니다!");
    }
  };

  const dropOwnedDeck = (deckId: string) => {
    if (ownedDecks.length <= 1) {
      setDeckEditorMessage("마지막 덱은 바닥에 놓을 수 없습니다.");
      return;
    }
    const deck = ownedDecks.find((item) => item.id === deckId);
    if (!deck) return;
    const remainingDecks = ownedDecks.filter((item) => item.id !== deckId);
    const roomKey = mapRoomKey(mapPosition);
    setOwnedDecks(remainingDecks);
    setRoomDeckDrops((current) => ({
      ...current,
      [roomKey]: [...(current[roomKey] ?? []), deck],
    }));
    if (activeDeckId === deckId) setActiveDeckId(remainingDecks[0].id);
    setHoveredDeckCard(null);
    setDeckEditorMessage(`${deck.name}을(를) 바닥에 놓았습니다.`);
  };

  const beginDeckEditorDrag = (
    event: ReactDragEvent<HTMLElement>,
    cardId: number,
    source: DeckEditorArea,
    deckId?: string,
  ) => {
    if (deckPreviewReleaseTimerRef.current !== null) window.clearTimeout(deckPreviewReleaseTimerRef.current);
    deckPreviewReleaseTimerRef.current = null;
    setDeckPreviewSuppressed(true);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${source}:${cardId}:${deckId ?? ""}`);
    deckEditorDragRef.current = { cardId, source, deckId };
    setDeckEditorDrag({ cardId, source, deckId });
    setDeckEditorDropTarget(null);
    setHoveredDeckCard(null);
    clearCardKeywordHover();
    setHoveredConsumable(null);
  };

  const extractDeckCardWithTicket = (cardId: number, deckId: string, ticketId = pendingExtractTicketId) => {
    if (!ticketId) return;
    const deck = ownedDecks.find((item) => item.id === deckId);
    const card = deck?.cards.find((item) => item.id === cardId);
    if (!deck || !card) return;
    if (deck.cards.length <= 1) {
      setDeckEditorMessage("덱에는 반드시 카드가 1장 이상 있어야 합니다.");
      return;
    }
    setOwnedDecks((current) => current.map((item) => item.id === deckId
      ? { ...item, cards: item.cards.filter((deckCard) => deckCard.id !== cardId) }
      : item));
    setInventoryCards((current) => [...current, card]);
    consumeTicketById(ticketId);
    setPendingExtractTicketId(null);
    setDeckEditorMessage(`${card.name}을(를) 덱에서 추출했습니다.`);
  };

  const transformedCard = (card: Card) => {
    if (card.rarity === "legendary") return null;
    const pool = card.rarity === "starter"
      ? STARTER_CARD_POOL
      : card.rarity === "basic" ? BASIC_CARD_POOL : card.rarity === "special" ? SPECIAL_CARD_POOL : RARE_CARD_POOL;
    const candidates = pool.filter((blueprint) => blueprint.name !== card.name);
    if (candidates.length === 0) return null;
    const blueprint = randomItem(candidates);
    return { ...blueprint, id: card.id, revealed: card.revealed } as Card;
  };

  const transformCardWithTicket = (card: Card, area: "deck" | "inventory" | "floor", deckId?: string, ticketId = pendingTransformTicketId) => {
    if (!ticketId) return;
    const transformed = transformedCard(card);
    if (!transformed) {
      setDeckEditorMessage(card.rarity === "legendary" ? "전설 카드는 변화시킬 수 없습니다." : "변환할 다른 카드가 없습니다.");
      return;
    }
    if (area === "deck" && deckId) {
      updateDeckCards(deckId, (current) => current.map((item) => item.id === card.id ? transformed : item));
    } else if (area === "inventory") {
      setInventoryCards((current) => current.map((item) => item.id === card.id ? transformed : item));
    } else {
      const roomKey = mapRoomKey(mapPosition);
      setRoomDrops((current) => ({
        ...current,
        [roomKey]: (current[roomKey] ?? []).map((item) => item.id === card.id ? transformed : item),
      }));
    }
    consumeTicketById(ticketId);
    setTransformedCardNewIds((current) => new Set(current).add(card.id));
    setPendingTransformTicketId(null);
    setDeckEditorMessage(`${card.name}을(를) ${transformed.name}(으)로 변환했습니다.`);
  };

  const transformConsumableWithTicket = (targetId: string) => {
    if (!pendingTransformTicketId || targetId === pendingTransformTicketId) return;
    const target = inventoryConsumables.find((item) => item.id === targetId);
    if (!target || target.type === "cardPack") return;
    const candidates = CONSUMABLE_TYPES.filter((type) => type !== target.type);
    const transformed = nextConsumable(randomItem(candidates));
    setInventoryConsumables((current) => current
      .filter((item) => item.id !== pendingTransformTicketId)
      .map((item) => item.id === targetId ? transformed : item));
    setPendingTransformTicketId(null);
    setDeckEditorMessage(`${target.name}을(를) ${transformed.name}(으)로 변환했습니다.`);
  };

  const moveDeckCardBetweenDecks = (cardId: number, sourceDeckId: string, targetDeckId: string) => {
    const sourceDeck = ownedDecks.find((deck) => deck.id === sourceDeckId);
    const targetDeck = ownedDecks.find((deck) => deck.id === targetDeckId);
    const card = sourceDeck?.cards.find((item) => item.id === cardId);
    if (!sourceDeck || !targetDeck || !card || sourceDeck.cards.length <= 1) return;
    if (targetDeck.cards.length >= targetDeck.capacity) {
      setDeckEditorMessage(`${targetDeck.name}에는 더 이상 카드를 넣을 수 없습니다.`);
      return;
    }
    setOwnedDecks((current) => current.map((deck) => {
      if (deck.id === sourceDeckId) return { ...deck, cards: deck.cards.filter((item) => item.id !== cardId) };
      if (deck.id === targetDeckId) return { ...deck, cards: [...deck.cards, card] };
      return deck;
    }));
    setDeckEditorMessage(`${card.name}을(를) ${targetDeck.name}(으)로 옮겼습니다.`);
  };

  const restorePendingRemovedCardToDeck = (cardId: number, deckId = editingDeck?.id) => {
    const targetDeck = ownedDecks.find((deck) => deck.id === deckId);
    const card = pendingRemovedCards.find((item) => item.id === cardId);
    if (!targetDeck || !card) return;
    const originalDeckId = originalDeckIdForCard(cardId);
    if (!isSafeAreaPosition(mapPosition) && originalDeckId && targetDeck.id !== originalDeckId) {
      showMapMessage("현재 위치에서는 원래 덱으로만 되돌릴 수 있습니다.");
      return;
    }
    if (targetDeck.cards.length >= targetDeck.capacity) {
      setDeckEditorMessage(`${targetDeck.name}에는 더 이상 카드를 넣을 수 없습니다.`);
      return;
    }
    updateDeckCards(targetDeck.id, (current) => [...current, card]);
    setPendingRemovedCards((current) => current.filter((item) => item.id !== cardId));
    setPendingRemovedCardAreas((current) => {
      const next = { ...current };
      delete next[cardId];
      return next;
    });
    setDeckEditorDeckId(targetDeck.id);
    setDeckEditorMessage(`${card.name} 제거를 취소하고 ${targetDeck.name}(으)로 되돌렸습니다.`);
  };

  const movePendingRemovedCard = (cardId: number, target: "inventory" | "floor") => {
    const card = pendingRemovedCards.find((item) => item.id === cardId);
    if (!card || pendingRemovedCardAreas[cardId] === target) return;
    if (target === "inventory") {
      showMapMessage("현재 위치에서는 불가능합니다.");
      return;
    }
    setPendingRemovedCardAreas((current) => ({ ...current, [cardId]: target }));
    setDeckEditorMessage(`${card.name}은(는) 계속 제거 예정 상태입니다.`);
  };

  const dropDeckEditorCard = (event: ReactDragEvent<HTMLElement>, target: DeckEditorArea, targetDeckId?: string) => {
    event.preventDefault();
    // 덱 제목·목록과 행 컨테이너가 중첩되어 있다. 전파되면 같은 드롭을 두 번 처리해 카드가 복제된다.
    event.stopPropagation();
    const [payloadSource, payloadId, payloadDeckId] = event.dataTransfer.getData("text/plain").split(":");
    const source = deckEditorDragRef.current?.source ?? deckEditorDrag?.source ?? (payloadSource as DeckEditorArea);
    const cardId = deckEditorDragRef.current?.cardId ?? deckEditorDrag?.cardId ?? Number(payloadId);
    const sourceDeckId = deckEditorDragRef.current?.deckId ?? deckEditorDrag?.deckId ?? (payloadDeckId || undefined);
    if (Number.isInteger(cardId)) {
      if (source === "inventory" && target === "deck") moveInventoryCardToDeck(cardId, targetDeckId);
      else if (source === "inventory" && target === "floor") moveInventoryCardToFloor(cardId);
      else if (source === "floor" && target === "inventory") moveFloorCardToInventory(cardId);
      else if (source === "floor" && target === "deck") moveFloorCardToDeck(cardId, targetDeckId);
      else if (source === "deck" && target === "inventory") moveDeckCardToInventory(cardId, sourceDeckId);
      else if (source === "deck" && target === "floor") moveDeckCardToFloor(cardId, sourceDeckId);
      else if (source === "pendingRemoval" && target === "deck") restorePendingRemovedCardToDeck(cardId, targetDeckId);
      else if (source === "pendingRemoval" && target === "inventory") movePendingRemovedCard(cardId, "inventory");
      else if (source === "pendingRemoval" && target === "floor") movePendingRemovedCard(cardId, "floor");
      else if (source === "deck" && target === "deck" && sourceDeckId && targetDeckId && sourceDeckId !== targetDeckId) {
        if (isSafeAreaPosition(mapPosition)) moveDeckCardBetweenDecks(cardId, sourceDeckId, targetDeckId);
        else showMapMessage("현재 위치에서는 불가능합니다.");
      }
    }
    deckEditorDragRef.current = null;
    setDeckEditorDrag(null);
    setDeckEditorDropTarget(null);
    setDeckPreviewSuppressed(false);
  };

  const finishDeckEditorDrag = () => {
    deckEditorDragRef.current = null;
    setDeckEditorDrag(null);
    setDeckEditorDropTarget(null);
    setHoveredDeckCard(null);
    clearCardKeywordHover();
    if (deckPreviewReleaseTimerRef.current !== null) window.clearTimeout(deckPreviewReleaseTimerRef.current);
    deckPreviewReleaseTimerRef.current = window.setTimeout(() => {
      setDeckPreviewSuppressed(false);
      deckPreviewReleaseTimerRef.current = null;
    }, 140);
  };

  const beginDeckCaseDrag = (
    event: ReactDragEvent<HTMLElement>,
    deckId: string,
    source: "floor" | "owned",
  ) => {
    const drag = { deckId, source };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `deck-case:${source}:${deckId}`);
    deckCaseDragRef.current = drag;
    setDeckCaseDrag(drag);
    setDeckCaseDropSlot(null);
  };

  const finishDeckCaseDrag = () => {
    deckCaseDragRef.current = null;
    setDeckCaseDrag(null);
    setDeckCaseDropSlot(null);
  };

  const swapOwnedDecks = (draggedDeckId: string, targetDeckId: string) => {
    if (draggedDeckId === targetDeckId) return;
    setOwnedDecks((current) => {
      const draggedIndex = current.findIndex((deck) => deck.id === draggedDeckId);
      const targetIndex = current.findIndex((deck) => deck.id === targetDeckId);
      if (draggedIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      [next[draggedIndex], next[targetIndex]] = [next[targetIndex], next[draggedIndex]];
      return next;
    });
    setDeckEditorMessage("덱 순서를 바꿨습니다.");
  };

  const openDeckEditor = (message: string) => {
    const roomKey = mapRoomKey(mapPosition);
    finishDeckEditorDrag();
    finishConsumableDrag();
    setPendingPaintTicketId(null);
    setPendingCloneTicketId(null);
    setPendingExtractTicketId(null);
    setPendingTransformTicketId(null);
    setArmedBombTicketIds(new Set());
    setPendingRemovedCards([]);
    setPendingRemovedCardAreas({});
    setTransformedCardNewIds(new Set());
    setHoveredDeckCard(null);
    clearCardKeywordHover();
    setDeckEditorDeckId(activeDeck?.id ?? "");
    setDeckEditorSnapshot({
      roomKey,
      decks: ownedDecks.map((deck) => ({ ...deck, cards: [...deck.cards] })),
      activeDeckId,
      inventory: [...inventoryCards],
      consumables: [...inventoryConsumables],
      floorCards: [...(roomDrops[roomKey] ?? [])],
      floorConsumables: [...(roomConsumableDrops[roomKey] ?? [])],
      floorDecks: [...(roomDeckDrops[roomKey] ?? [])],
    });
    setDeckEditorMessage(message);
    setDeckEditorOpen(true);
  };

  const confirmDeckEditor = () => {
    if (deckEditorInventoryItemCount > inventoryCapacity) {
      setDeckEditorMessage(`카드와 소모품을 합쳐 ${inventoryCapacity}개 이하로 줄여야 편집을 확인할 수 있습니다.`);
      return;
    }
    const deckWasEdited = deckEditorSnapshot !== null
      && JSON.stringify(deckEditorSnapshot.decks) !== JSON.stringify(ownedDecks);
    const nextActiveDeckId = ownedDecks.some((deck) => deck.id === deckEditorDeckId)
      ? deckEditorDeckId
      : ownedDecks[0]?.id;
    if (nextActiveDeckId) setActiveDeckId(nextActiveDeckId);
    if (deckWasEdited) setDeckSelectionAttention(true);
    installArmedFloorBombs();
    setDeckEditorSnapshot(null);
    setPendingRemovedCards([]);
    setPendingRemovedCardAreas({});
    setTransformedCardNewIds(new Set());
    setHoveredDeckCard(null);
    clearCardKeywordHover();
    setPendingPaintTicketId(null);
    setPendingCloneTicketId(null);
    setPendingExtractTicketId(null);
    setPendingTransformTicketId(null);
    setArmedBombTicketIds(new Set());
    finishConsumableDrag();
    finishDeckEditorDrag();
    setDeckEditorOpen(false);
  };

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

      if (deckEditorOpen && (event.key === "Escape" || event.key.toLowerCase() === "i")) {
        event.preventDefault();
        confirmDeckEditor();
        return;
      }

      if (event.key === "Escape") {
        if (cardPoolStatsOpen) {
          event.preventDefault();
          setCardPoolStatsOpen(false);
        } else if (deckViewerOpen) {
          event.preventDefault();
          setDeckViewerOpen(false);
        } else if (shrineOpen) {
          event.preventDefault();
          setShrineOpen(false);
        } else if (blessingOpen) {
          event.preventDefault();
          setBlessingOpen(false);
        } else if (shopOpen) {
          event.preventDefault();
          setShopOpen(false);
        }
        return;
      }

      if (screen !== "map" || mapTraveling || deckEditorOpen || deckViewerOpen) return;
      if (event.key.toLowerCase() === "i") {
        event.preventDefault();
        openDeckEditor("덱 편집");
        return;
      }
      if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        quickPickUpFloorItems();
        return;
      }
      if (event.key === "5" || event.code === "Numpad5") {
        event.preventDefault();
        waitOnMap();
        return;
      }

      const keyboardMoves: Record<string, [number, number]> = {
        KeyW: [0, -1], ArrowUp: [0, -1],
        KeyA: [-1, 0], ArrowLeft: [-1, 0],
        KeyS: [0, 1], ArrowDown: [0, 1],
        KeyD: [1, 0], ArrowRight: [1, 0],
      };
      const keyboardMove = keyboardMoves[event.code];
      if (keyboardMove) {
        event.preventDefault();
        mapMovementKeysRef.current.add(event.code);
        if (mapMovementTimerRef.current === null) {
          mapMovementTimerRef.current = window.setTimeout(() => {
            mapMovementTimerRef.current = null;
            const heldMove = [...mapMovementKeysRef.current]
              .map((code) => keyboardMoves[code])
              .reduce<[number, number]>((total, move) => [total[0] + move[0], total[1] + move[1]], [0, 0]);
            const deltaX = Math.sign(heldMove[0]);
            const deltaY = Math.sign(heldMove[1]);
            if (deltaX !== 0 || deltaY !== 0) moveOnMap(deltaX, deltaY);
          }, 45);
        }
        return;
      }

      const numpadMoves: Record<string, [number, number]> = {
        Numpad7: [-1, -1], Numpad8: [0, -1], Numpad9: [1, -1],
        Numpad4: [-1, 0], Numpad6: [1, 0],
        Numpad1: [-1, 1], Numpad2: [0, 1], Numpad3: [1, 1],
      };
      const move = numpadMoves[event.code];
      if (!move) return;
      event.preventDefault();
      numpadMovementKeysRef.current.add(event.code);
      if (numpadMovementTimerRef.current === null) {
        numpadMovementTimerRef.current = window.setTimeout(() => {
          numpadMovementTimerRef.current = null;
          const pressedKeys = [...numpadMovementKeysRef.current];
          // The numpad is for one explicit direction at a time: never chain
          // simultaneous presses into two map turns.
          if (pressedKeys.length !== 1) return;
          const pressedMove = numpadMoves[pressedKeys[0]];
          if (pressedMove) moveOnMap(...pressedMove);
        }, 45);
      }
    };

    const releaseKeyboardMove = (event: KeyboardEvent) => {
      mapMovementKeysRef.current.delete(event.code);
      numpadMovementKeysRef.current.delete(event.code);
    };

    window.addEventListener("keydown", handleKeyboard);
    window.addEventListener("keyup", releaseKeyboardMove);
    return () => {
      window.removeEventListener("keydown", handleKeyboard);
      window.removeEventListener("keyup", releaseKeyboardMove);
      if (mapMovementTimerRef.current !== null) {
        window.clearTimeout(mapMovementTimerRef.current);
        mapMovementTimerRef.current = null;
      }
      if (numpadMovementTimerRef.current !== null) {
        window.clearTimeout(numpadMovementTimerRef.current);
        numpadMovementTimerRef.current = null;
      }
      mapMovementKeysRef.current.clear();
      numpadMovementKeysRef.current.clear();
    };
  }, [
    blessingOpen, cardPoolStatsOpen, confirmDeckEditor, deckEditorOpen, deckViewerOpen, mapTraveling,
    moveOnMap, openDeckEditor, quickPickUpFloorItems, screen, shopOpen, shrineOpen, waitOnMap,
  ]);

  const beginMapDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || mapTraveling) return;
    mapWasDraggedRef.current = false;
    mapDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: mapPan.x,
      originY: mapPan.y,
      moved: false,
    };
  };

  const moveMapDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = mapDragRef.current;
    if (!drag) return;
    const offsetX = event.clientX - drag.startX;
    const offsetY = event.clientY - drag.startY;
    const moved = drag.moved || Math.hypot(offsetX, offsetY) > 6;
    mapDragRef.current = { ...drag, moved };
    mapWasDraggedRef.current = moved;
    setMapPan({
      x: drag.originX + offsetX,
      y: drag.originY + offsetY,
    });
  };

  const finishMapDrag = () => {
    mapDragRef.current = null;
  };

  const beginPilePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = pileScrollRef.current;
    if (
      event.button !== 0
      || !viewport
      || viewport.scrollWidth <= viewport.clientWidth
      || (event.target as HTMLElement).closest(".pile-draggable-card")
    ) return;
    pilePanRef.current = { startX: event.clientX, scrollLeft: viewport.scrollLeft };
    viewport.setPointerCapture(event.pointerId);
    setPilePanning(true);
    event.preventDefault();
  };

  const movePilePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = pileScrollRef.current;
    const pan = pilePanRef.current;
    if (!viewport || !pan) return;
    viewport.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
    event.preventDefault();
  };

  const finishPilePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pilePanRef.current = null;
    setPilePanning(false);
  };

  const zoomMap = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (mapTraveling) return;
    const viewport = mapViewportRef.current;
    if (!viewport) return;
    const direction = event.deltaY < 0 ? 1 : -1;
    const nextZoom = Math.min(
      MAP_MAX_ZOOM,
      Math.max(MAP_MIN_ZOOM, Number((mapZoom + direction * MAP_ZOOM_STEP).toFixed(2))),
    );
    if (nextZoom === mapZoom) return;

    const bounds = viewport.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    const mapX = (pointerX - mapPan.x) / mapZoom;
    const mapY = (pointerY - mapPan.y) / mapZoom;
    setMapPan({
      x: pointerX - mapX * nextZoom,
      y: pointerY - mapY * nextZoom,
    });
    setMapZoom(nextZoom);
  };

  useLayoutEffect(() => {
    if (screen !== "map") return;
    const frame = window.requestAnimationFrame(() => centerMapOn(mapPosition));
    return () => window.cancelAnimationFrame(frame);
  }, [screen, mapPosition]);

  useLayoutEffect(() => {
    const origins = pendingOriginsRef.current;
    if (origins.size === 0 || game.hand.length === 0) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      origins.clear();
      const frame = window.requestAnimationFrame(() => {
        if (!game.clearPlan) setPhase("playing");
      });
      return () => window.cancelAnimationFrame(frame);
    }

    const hasEnemyTokenFlight = game.hand.some((card) => pendingEnemyTokenIdsRef.current.has(card.id));
    game.hand.forEach((card, index) => {
      const source = origins.get(card.id);
      const target = handCardRefs.current.get(card.id);
      if (!source || !target) return;
      const targetRect = target.getBoundingClientRect();
      target.style.zIndex = String(20 + index);
      if (pendingEnemyTokenIdsRef.current.has(card.id)) {
        animateEnemyTokenDelivery(target, source, index * 65);
        return;
      }
      target.animate(
        [
          {
            transform: `translate(${source.left - targetRect.left}px, ${source.top - targetRect.top}px) rotate(-3deg) scale(.94)`,
            opacity: .72,
            boxShadow: "0 2px 4px rgba(0,0,0,.28)",
          },
          {
            transform: "translate(0, 0) rotate(0deg) scale(1)",
            opacity: 1,
            boxShadow: "0 7px 14px rgba(0,0,0,.3)",
          },
        ],
        {
          duration: 480,
          delay: index * 65,
          easing: "cubic-bezier(.2,.72,.25,1)",
          fill: "backwards",
        },
      );
    });

    origins.clear();
    pendingEnemyTokenIdsRef.current.clear();
    const finishDelay = (hasEnemyTokenFlight ? 860 : 500) + Math.max(0, game.hand.length - 1) * 65;
    const timer = window.setTimeout(() => {
      handCardRefs.current.forEach((element) => { element.style.zIndex = ""; });
      if (!game.clearPlan) setPhase("playing");
    }, finishDelay);
    return () => window.clearTimeout(timer);
  }, [game.hand, game.clearPlan]);

  useLayoutEffect(() => {
    if (screen !== "battle" || pendingPileTokenSourcesRef.current.size === 0) return;
    pendingPileTokenSourcesRef.current.forEach((enemyId, cardId) => {
      const source = document.querySelector<HTMLElement>(`[data-enemy-id="${enemyId}"]`);
      const target = document.querySelector<HTMLElement>(`[data-card-id="${cardId}"]`);
      if (!source || !target) return;
      target.style.zIndex = "60";
      const animation = animateEnemyTokenDelivery(target, source.getBoundingClientRect());
      if (animation) {
        animation.finished.then(
          () => { target.style.zIndex = ""; },
          () => { target.style.zIndex = ""; },
        );
      } else {
        target.style.zIndex = "";
      }
      pendingPileTokenSourcesRef.current.delete(cardId);
    });
  }, [screen, game.piles]);

  const defeatEnemiesForDebug = () => {
    if (!debugMode || game.status !== "playing") return;
    clearBattleTimers();
    grantBattleReward(battleRewardRegionRef.current);
    setPhase("playing");
    setGame((current) => current.status !== "playing"
      ? current
      : {
          ...current,
          enemies: current.enemies.map((enemy) => ({ ...enemy, hp: 0 })),
          pendingDraws: 0,
          pendingPileDrawCount: 0,
          pendingDashRandomDraws: 0,
          pendingResearchDraw: null,
          astronomyResearchUses: 0,
          necromancyResearchUses: 0,
          pendingDiscards: 0,
          pendingSweep: false,
          status: "won",
          message: "디버그 모드: 적을 즉시 처치했습니다.",
        });
  };

  const resolvePlayedCard = (card: Card, targetEnemyId?: string) => {
    if (UNPLAYABLE_CARD_EFFECTS.has(card.effect)) {
      setGame((current) => ({ ...current, message: `${card.name}은(는) 사용할 수 없습니다. 파일 위로 옮겨 길을 만들어 보세요.` }));
      return;
    }
    const isRewardAttack = card.kind === "strike" || card.effect === "doubleHit" || card.effect === "ironRampage" || card.effect === "magicStrike" || card.effect === "shockwave" || card.effect === "sweep" || card.effect === "meteor" || card.effect === "hydra" || card.effect === "odinSpear";
    const isRewardAttackAll = card.effect === "ironRampage" || card.effect === "shockwave" || card.effect === "sweep" || card.effect === "odinSpear";
    const rewardTarget = card.effect === "magicStrike"
      ? lowestHealthEnemy(game.enemies)
      : card.effect === "meteor" || card.effect === "hydra"
        ? game.enemies.find((enemy) => enemy.hp > 0)
        : game.enemies.find((enemy) => enemy.id === targetEnemyId);
    const randomTargetRolls = Array.from({ length: Math.max(18, game.starsSpent * 2) }, () => Math.random());
    let resolvedEnemiesAfterAttack: EnemyState[] | null = null;
    let waitForLethalHitPopups = false;
    const canResolveRewardAttack = isRewardAttack
      && game.status === "playing"
      && phase === "playing"
      && game.pendingDraws === 0
      && game.pendingPileDrawCount === 0
      && game.pendingDiscards === 0
      && game.pendingResearchDraw === null
      && !game.pendingSweep
      && game.energy >= cardEnergyCost(card, game.activeRuleCards.filter((ruleCard) => ruleCard.effect === "lawResearch").length, game.forgeCount)
      && (isRewardAttackAll || Boolean(rewardTarget && rewardTarget.hp > 0));
    if (canResolveRewardAttack) {
      const repetitions = (
        card.effect === "hydra" ? 9
          : card.effect === "meteor" ? game.starsSpent
            : card.effect === "fourHit" ? 4
              : card.effect === "doubleHit" && card.forged ? 2 : 1
      ) * (game.doubleNextAttack ? 2 : 1);
      const combatManualBonus = game.hand
        .filter((item) => item.effect === "combatManual")
        .reduce((total, item) => total + item.value, 0);
      const damage = card.value + game.strength + combatManualBonus;
      let enemiesAfterAttack = game.enemies;
      const hitPopups: Array<{ enemyId: string; damage: number; remainingHp: number }> = [];
      const hitEnemy = (enemyId: string) => {
        enemiesAfterAttack = enemiesAfterAttack.map((enemy) => {
          if (enemy.id !== enemyId) return enemy;
          // 플레이어 공격은 모두 무속성이다. 적의 중립 방어가 모든 공격을 막는다.
          const nextEnemy = applyPlayerAttack(enemy, damage, 1);
          const dealtDamage = enemy.hp - nextEnemy.hp;
          if (dealtDamage > 0) hitPopups.push({ enemyId, damage: dealtDamage, remainingHp: nextEnemy.hp });
          return nextEnemy;
        });
      };
      if (card.effect === "hydra" || card.effect === "meteor") {
        for (let hit = 0; hit < repetitions; hit += 1) {
          const living = enemiesAfterAttack.filter((enemy) => enemy.hp > 0);
          if (living.length === 0) break;
          const target = living[Math.floor(randomTargetRolls[hit] * living.length)];
          hitEnemy(target.id);
        }
      } else if (isRewardAttackAll) {
        game.enemies.filter((enemy) => enemy.hp > 0).forEach((enemy) => {
          for (let hit = 0; hit < repetitions; hit += 1) hitEnemy(enemy.id);
        });
      } else if (rewardTarget) {
        for (let hit = 0; hit < repetitions; hit += 1) hitEnemy(rewardTarget.id);
      } else {
        enemiesAfterAttack = game.enemies;
      }
      resolvedEnemiesAfterAttack = enemiesAfterAttack;
      if (hitPopups.length > 0) {
        setAnimatedEnemyHp((current) => {
          const next = { ...current };
          hitPopups.forEach(({ enemyId }) => {
            if (next[enemyId] !== undefined) return;
            const enemyBeforeHit = game.enemies.find((enemy) => enemy.id === enemyId);
            if (enemyBeforeHit) next[enemyId] = enemyBeforeHit.hp;
          });
          return next;
        });
      }
      hitPopups.forEach((popup, index) => {
        later(() => {
          showEnemyPopup(popup.enemyId, `-${popup.damage}`);
          setAnimatedEnemyHp((current) => ({ ...current, [popup.enemyId]: popup.remainingHp }));
        }, index * 220);
      });
      const lastPopupIndexByEnemy = new Map<string, number>();
      hitPopups.forEach((popup, index) => lastPopupIndexByEnemy.set(popup.enemyId, index));
      lastPopupIndexByEnemy.forEach((lastPopupIndex, enemyId) => {
        later(() => setAnimatedEnemyHp((current) => {
          const next = { ...current };
          delete next[enemyId];
          return next;
        }), lastPopupIndex * 220 + 240);
      });
      const newlyDefeatedEnemyIds = game.enemies
        .filter((enemy) => enemy.hp > 0 && enemiesAfterAttack.some((nextEnemy) => nextEnemy.id === enemy.id && nextEnemy.hp === 0))
        .map((enemy) => enemy.id);
      if (newlyDefeatedEnemyIds.length > 0) {
        setDyingEnemyIds((current) => new Set([...current, ...newlyDefeatedEnemyIds]));
        newlyDefeatedEnemyIds.forEach((enemyId) => {
          const lastPopupIndex = hitPopups.reduce((last, popup, index) => popup.enemyId === enemyId ? index : last, 0);
          later(() => setDyingEnemyIds((current) => {
            const next = new Set(current);
            next.delete(enemyId);
            return next;
          }), lastPopupIndex * 220 + 500);
        });
      }
      if (enemiesAfterAttack.every((enemy) => enemy.hp === 0)) {
        waitForLethalHitPopups = true;
        setPhase("resolving");
        later(() => {
          setGame((current) => current.status !== "playing" ? current : {
            ...current,
            status: "won",
            message: "승리! 모든 적을 쓰러뜨렸습니다.",
          });
          setPhase("playing");
          grantBattleReward(battleRewardRegionRef.current);
        }, Math.max(500, (hitPopups.length - 1) * 220 + 500));
      }
    }

    setGame((current) => {
      if (
        current.status !== "playing" ||
        current.pendingDraws > 0 ||
        current.pendingPileDrawCount > 0 ||
        current.pendingDiscards > 0 ||
        current.pendingResearchDraw !== null ||
        current.pendingSweep ||
        phase !== "playing"
      ) return current;
      const energyCost = cardEnergyCost(
        card,
        current.activeRuleCards.filter((ruleCard) => ruleCard.effect === "lawResearch").length,
        current.forgeCount,
      );
      if (current.energy < energyCost) {
        return { ...current, message: `${card.name}: 에너지가 ${energyCost} 필요합니다.` };
      }
      if (card.effect === "endStart" && current.piles.some((pile) => pile.length > 0)) {
        return { ...current, message: "끝의 시작은 모든 파일이 비어 있을 때만 사용할 수 있습니다." };
      }
      if (card.effect === "supernova" && current.stars < 3) {
        return { ...current, message: "초신성: ★★★가 필요합니다." };
      }
      const isIronRampage = card.effect === "ironRampage";
      const isShockwave = card.effect === "shockwave";
      const isMagicStrike = card.effect === "magicStrike";
      const isSweepAttack = card.effect === "sweep";
      const isMeteor = card.effect === "meteor";
      const isHydra = card.effect === "hydra";
      const isDoubleHit = card.effect === "doubleHit";
      const isSuppression = card.effect === "suppression";
      const isStarArk = card.effect === "starArk";
      const isOdinSpear = card.effect === "odinSpear";
      const isIronWall = card.effect === "ironWall";
      const isMassDeal = card.effect === "massDeal";
      const isSturdyStance = card.effect === "sturdyStance";
      const isDamageCard = card.kind === "strike" || isDoubleHit || isIronRampage || isShockwave || isMagicStrike || isSweepAttack || isMeteor || isHydra;
      const isAttackAll = isIronRampage || isShockwave || isSweepAttack || isOdinSpear;
      const isWave = card.effect === "ironWave";
      if (isDamageCard && !isAttackAll && !isMagicStrike && !isMeteor && !isHydra && !targetEnemyId) return current;
      const targetEnemy = isMagicStrike
        ? lowestHealthEnemy(current.enemies)
        : isMeteor || isHydra
          ? current.enemies.filter((enemy) => enemy.hp > 0)[Math.floor(Math.random() * current.enemies.filter((enemy) => enemy.hp > 0).length)]
        : current.enemies.find((enemy) => enemy.id === targetEnemyId);
      if (isDamageCard && !isAttackAll && (!targetEnemy || targetEnemy.hp === 0)) return current;
      const repetitions = (isHydra ? 9 : isMeteor ? current.starsSpent : card.effect === "fourHit" ? 4 : isDoubleHit && card.forged ? 2 : 1) * (isDamageCard && current.doubleNextAttack ? 2 : 1);
      const combatManualBonus = current.hand
        .filter((item) => item.effect === "combatManual")
        .reduce((total, item) => total + item.value, 0);
      const grimoireBonus = current.hand.filter((item) => item.effect === "grimoire").length;
      const damagePerHit = isDamageCard ? card.value + current.strength + combatManualBonus : 0;
      const damage = damagePerHit * repetitions;
      const nextEnemies = isDamageCard && resolvedEnemiesAfterAttack
        ? resolvedEnemiesAfterAttack
        : isDamageCard
        ? current.enemies.map((enemy) => isAttackAll || enemy.id === targetEnemy?.id
          ? applyPlayerAttack(enemy, damagePerHit, repetitions)
          : enemy)
        : card.effect === "relic"
          ? current.enemies.map((enemy) => enemy.variant === "goblin"
            ? { ...enemy, strength: enemy.strength - card.value }
            : enemy)
          : current.enemies;
      const isBlockCard = card.effect === "defend"
        || card.effect === "deflect"
        || card.effect === "starGuard";
      const defenseValue = card.value;
      const suppressionDamageDealt = isSuppression && targetEnemy
        ? Math.max(0, targetEnemy.hp - (nextEnemies.find((enemy) => enemy.id === targetEnemy.id)?.hp ?? targetEnemy.hp))
        : 0;
      const blockGained = isStarArk
        ? 12 * current.defenseMultiplier
        : isSuppression
          ? suppressionDamageDealt
          : isBlockCard
        ? (defenseValue + current.agility + combatManualBonus) * current.defenseMultiplier
        : isIronRampage || isWave || isIronWall || isOdinSpear
          ? (isIronRampage ? 8 : isOdinSpear ? 15 : 5) * repetitions * current.defenseMultiplier
          : 0;
      const rawNextPhysicalBlock = (isBlockCard && card.damageType === "physical")
        || isIronRampage
        || isIronWall
        || isSuppression
        || isStarArk
        || isOdinSpear
        || (isWave && card.damageType === "physical")
        ? current.playerPhysicalBlock + blockGained
        : current.playerPhysicalBlock;
      const rawNextMagicBlock = (isBlockCard && card.damageType === "magic")
        || isStarArk
        || (isWave && card.damageType === "magic")
        ? current.playerMagicBlock + blockGained
        : current.playerMagicBlock;
      const nextPhysicalBlock = card.effect === "mirrorImage" ? rawNextMagicBlock : rawNextPhysicalBlock;
      const nextMagicBlock = card.effect === "mirrorImage" ? rawNextPhysicalBlock : rawNextMagicBlock;
      const nextPhysicalStatus = card.effect === "steelHeart"
        ? addResistance({ resistance: current.playerPhysicalResistance, vulnerability: current.playerPhysicalVulnerability }, card.value)
        : card.effect === "berserk"
          ? addVulnerability({ resistance: current.playerPhysicalResistance, vulnerability: current.playerPhysicalVulnerability }, 2)
          : isIronWall
            ? addResistance({ resistance: current.playerPhysicalResistance, vulnerability: current.playerPhysicalVulnerability }, IRON_WALL_RESISTANCE)
            : { resistance: current.playerPhysicalResistance, vulnerability: current.playerPhysicalVulnerability };
      const nextMagicStatus = card.effect === "steelHeart"
        ? addResistance({ resistance: current.playerMagicResistance, vulnerability: current.playerMagicVulnerability }, card.value)
        : card.effect === "blessing"
          ? addResistance({ resistance: current.playerMagicResistance, vulnerability: current.playerMagicVulnerability }, card.forged ? 2 : 1)
        : { resistance: current.playerMagicResistance, vulnerability: current.playerMagicVulnerability };
      const won = nextEnemies.every((enemy) => enemy.hp === 0);
      const canDraw = current.piles.some((pile) => pile.length > 0);
      const drawEachPileResult = card.effect === "drawEachPile" || (card.effect === "fileDraw" && card.forged)
        ? drawFromPiles(current.piles)
        : null;
      const availableCardCount = current.piles.reduce((total, pile) => total + pile.length, 0);
      const pommelDrawResult = card.effect === "pommel"
        ? drawFromFirstPile(current.piles)
        : null;
      const pilesAfterCardDraw = drawEachPileResult?.piles ?? pommelDrawResult?.piles ?? current.piles;
      const massDealPiles = isMassDeal
        ? card.forged
          ? buildPiles(
            prepareDeckForPiles(current.piles.flat()),
            current.deckEditions.includes("fantastic") ? 4 : 5,
            current.deckEditions.includes("transparent"),
            0,
            current.deckEditions.includes("golden"),
            current.piles.length + 1,
            true,
          )
          : [...current.piles.map((pile) => [...pile]), []]
        : pilesAfterCardDraw;
      const automaticDrawnCards = drawEachPileResult?.hand ?? pommelDrawResult?.hand ?? [];
      if (automaticDrawnCards.length > 0 && captureDrawOrigins(automaticDrawnCards) > 0) setPhase("drawing");
      const pendingPileDrawCount = card.effect === "dash" && canDraw
        ? 1
        : card.effect === "fileDraw" && !card.forged && canDraw
          ? Math.min(card.draw, availableCardCount)
          : 0;
      const pendingDashRandomDraws = card.effect === "dash" && canDraw
        ? card.forged ? 3 : 1
        : 0;
      const drawsAdded = !won && availableCardCount > 0 && !drawEachPileResult && pendingPileDrawCount === 0
        ? Math.min(card.draw * repetitions, availableCardCount)
        : 0;
      const remainingHand = current.hand.filter((item) => item.id !== card.id);
      const pendingDiscards = card.effect === "prepare"
        ? (canDraw || remainingHand.length > 0 ? 1 : 0)
        : card.effect === "focus" && remainingHand.length > 0 ? 1 : 0;
      const pendingSweep = card.effect === "boomerang" && canDraw;
      const pendingPileOperation = card.effect === "boomerang"
        ? card.name === "정리 타격" ? "discardTop" as const : "moveTopToBottom" as const
        : null;
      const action = (() => {
        if (isShockwave || isSweepAttack) return `${card.name}: 적 전체 공격`;
        if (isOdinSpear) return `오딘의 창: 적 전체에게 피해 ${damage} · 방어 15`;
        if (isMeteor) return `${card.name}: 사용한 ★ ${current.starsSpent}개만큼 무작위 공격`;
        if (isHydra) return `${card.name}: 무작위 공격 ${repetitions}회`;
        if (isMagicStrike) return "마법 타격 발동";
        if (isIronRampage) return `적 전체에게 피해 ${damage} · 방어 ${blockGained}${repetitions > 1 ? " (2회 발동)" : ""}`;
        if (isWave) return `${targetEnemy?.name}에게 피해 ${damage} · ${DEFENSE_LABEL[card.damageType]} ${blockGained}${repetitions > 1 ? " (2회 발동)" : ""}`;
        if (isSuppression) return `${targetEnemy?.name}에게 피해 ${damage} · 방어 ${blockGained} 획득`;
        if (isStarArk) return "방어 12 · 마법 방어 12 · ★★ 획득";
        if (isMassDeal) return card.forged
          ? "대분배: 파일을 균등하게 재분배하고 빈 파일을 추가"
          : "대분배: 빈 파일을 추가";
        if (isSturdyStance) return "견고한 태세: 턴 종료 시 방어 절반 보존";
        if (card.effect === "astronomyResearch") return "천문학 연구: ★★로 파일 드로우";
        if (card.effect === "necromancyResearch") return "강령학 연구: ★★★로 버린 카드 드로우";
        if (card.effect === "metallurgyResearch") return "금속학 연구: 재련 시 ★ 획득";
        if (card.effect === "lawResearch") return "법학 연구: 룰 카드 비용 감소";
        if (card.effect === "mirrorImage") return "거울상: 방어와 마법 방어 교환";
        if (card.effect === "blessing") return `가호: 마법 저항 ${card.forged ? 2 : 1} 획득`;
        if (card.kind === "strike") return `${targetEnemy?.name}에게 피해 ${damage}${repetitions > 1 ? " (2회 발동)" : ""}`;
        if (isBlockCard) return `${DEFENSE_LABEL[card.damageType]} ${blockGained} 획득`;
        if (card.effect === "ironWall") return `물리 저항 ${IRON_WALL_RESISTANCE} · 방어 5 획득`;
        if (card.effect === "steelHeart") return `물리 저항 · 마법 저항 ${card.value} 획득`;
        if (card.effect === "battlePlan") return `★ ${card.value}개 획득 · 드로우 ${card.draw}`;
        if (card.effect === "prepare") return canDraw ? "드로우할 파일을 선택하세요." : "버릴 카드를 선택하세요.";
        if (card.effect === "focus") return "에너지를 1 얻습니다 · 버릴 카드를 선택하세요.";
        if (card.effect === "adrenaline") return `에너지를 1 얻습니다 · 카드 ${card.draw}장 드로우`;
        if (card.effect === "sweep") return canDraw ? "가져올 파일을 선택하세요." : "가져올 카드가 없습니다.";
        if (card.effect === "drawEachPile") return `모든 파일에서 ${drawEachPileResult?.hand.length ?? 0}장 뽑음`;
        if (card.effect === "dash") return canDraw ? "질주: 원하는 파일을 선택하세요." : "질주: 드로우할 카드가 없습니다.";
        if (card.effect === "berserk") return "에너지를 2 얻습니다 · 물리 취약 2 획득";
        if (card.effect === "transcend") return "이번 턴 피해 면역 · 힘 5 획득";
        if (card.effect === "rapidFire") return "이번 턴 다음 공격 카드가 2회 발동";
        if (card.effect === "ventilate") return "환기: 에너지 획득";
        if (card.effect === "fileDraw") return card.forged ? "모든 파일에서 1장씩 뽑음" : "드로우할 파일을 선택하세요.";
        if (card.effect === "starGuard") return "별의 장막: 방어와 ★ 획득";
        if (card.effect === "charge") return "충전: 에너지 획득";
        if (card.effect === "plateArmor") return `낡은 노심: 에너지 ${card.forged ? 3 : 1} 획득`;
        if (card.effect === "warmUp") return "준비 운동: 이번 턴 힘 획득";
        if (card.effect === "fourHit") return "4연격";
        if (card.effect === "doubleHit") return `청동 철퇴: ${card.forged ? 2 : 1}회 공격`;
        if (card.effect === "starlight") return "별빛: ★ 획득";
        if (card.effect === "augment") return "증강: 힘과 강인함 획득";
        if (card.effect === "relic") return "유물: 도깨비의 힘 -4";
        if (card.effect === "supernova") return "★★★을 잃습니다 · 에너지를 3 얻습니다";
        return card.name;
      })();
      const drawMessage = card.draw > 0
        ? canDraw
          ? " · 드로우할 파일을 선택하세요."
          : " · 드로우할 카드가 없습니다."
        : "";
      return {
        ...current,
        // 질주는 첫 번째 파일 선택을 drawSelectedPile에서 처리한다.
        // 여기서 존재하지 않는 이전 결과 변수를 참조하면 일반 카드 사용 시
        // 브라우저 런타임 오류가 나서 ALL 덱 전투가 멈출 수 있다.
        hand: [...remainingHand, ...(automaticDrawnCards ?? [])],
        // 강화는 사용 후에도 다음 셔플 전까지 유지된다. 셔플 때 prepareDeckForPiles가 해제한다.
        discard: card.exhaust
          ? current.discard
          : [...current.discard, card],
        removedFromReshuffleIds: card.exhaust
          ? [...current.removedFromReshuffleIds, card.id]
          : current.removedFromReshuffleIds,
        energy: current.energy - energyCost + (card.effect === "aries" ? 5 : card.effect === "berserk" ? 2 : card.effect === "plateArmor" ? (card.forged ? 3 : 1) : card.effect === "focus" || card.effect === "adrenaline" || card.effect === "charge" || card.effect === "endStart" || card.effect === "supernova" ? card.value : card.effect === "flood" ? 2 : card.effect === "ventilate" ? card.value : 0),
        stars: current.stars + (
          card.effect === "battlePlan"
              ? card.value
            : card.effect === "rulerCompass"
              ? repetitions
              : card.effect === "starlight"
                ? card.value
            : card.effect === "starGuard"
                ? 1
              : card.effect === "starArk"
                ? 2
                : card.effect === "astronomyResearch" || card.effect === "necromancyResearch"
                  ? card.forged ? 3 : 0
                : card.effect === "superStrategist"
                  ? card.value
                  : card.effect === "aries"
                    ? 5
              : card.effect === "flood"
                    ? 2
              : 0
        ) + grimoireBonus - (card.effect === "supernova" ? 3 : 0),
        pendingDraws: drawsAdded,
        pendingPileDrawCount,
        pendingDashRandomDraws,
        pendingDiscards,
        pendingSweep,
        pendingPileOperation,
        enemies: nextEnemies,
        playerPhysicalBlock: nextPhysicalBlock,
        playerMagicBlock: nextMagicBlock,
        playerPhysicalResistance: nextPhysicalStatus.resistance,
        playerPhysicalVulnerability: nextPhysicalStatus.vulnerability,
        playerMagicResistance: nextMagicStatus.resistance,
        playerMagicVulnerability: nextMagicStatus.vulnerability,
        strength: current.strength + (card.effect === "orion" ? 10 : card.effect === "warmUp" ? card.value + 1 : card.effect === "augment" || card.effect === "weaponSharpen" ? card.value : 0),
        temporaryStrength: current.temporaryStrength + (card.effect === "warmUp" ? card.value : 0),
        agility: current.agility + (card.effect === "augment" || card.effect === "armorSharpen" ? card.value : 0),
        piles: massDealPiles,
        reflectDamage: card.effect === "counter" ? 1 : current.reflectDamage,
        defenseMultiplier: current.defenseMultiplier,
        evenDealOnReshuffle: current.evenDealOnReshuffle || isMassDeal,
        preserveDefenseOnTurnEnd: current.preserveDefenseOnTurnEnd || isSturdyStance,
        activeRuleCards: card.rule
          ? [...current.activeRuleCards, { ...card }]
          : current.activeRuleCards,
        damageTakenMultiplier: current.damageTakenMultiplier,
        invulnerable: current.invulnerable,
        extraTurns: current.extraTurns + (card.effect === "horologium" ? 1 : 0),
        playerHp: card.effect === "ophiuchus" ? Math.min(maxPlayerHp, current.playerHp + 5) : current.playerHp,
        doubleNextAttack: card.effect === "rapidFire"
          ? true
          : isDamageCard
            ? false
            : current.doubleNextAttack,
        status: won && !waitForLethalHitPopups ? "won" : current.status,
        message: won && !waitForLethalHitPopups ? "승리! 모든 적을 쓰러뜨렸습니다." : `${action}${card.effect === "prepare" || card.effect === "focus" ? "" : drawMessage}`,
      };
    });
  };

  const playCard = (card: Card, targetEnemyId?: string) => {
    const sourceCard = handCardRefs.current.get(card.id);
    const energyCost = cardEnergyCost(
      card,
      game.activeRuleCards.filter((ruleCard) => ruleCard.effect === "lawResearch").length,
      game.forgeCount,
    );
    const shouldAnimate = sourceCard
      && screen === "battle"
      && phase === "playing"
      && game.status === "playing"
      && !UNPLAYABLE_CARD_EFFECTS.has(card.effect)
      && game.energy >= energyCost;
    if (!shouldAnimate) {
      resolvePlayedCard(card, targetEnemyId);
      return;
    }
    const flightDuration = animatePlayedCardToCenter(sourceCard);
    if (flightDuration === 0) {
      resolvePlayedCard(card, targetEnemyId);
      return;
    }
    setSelectedHandCardId(null);
    setPhase("resolving");
    later(() => {
      setPhase("playing");
      resolvePlayedCard(card, targetEnemyId);
    }, flightDuration);
  };

  const startResearchDraw = (research: "astronomy" | "necromancy") => {
    if (phase !== "playing" || game.status !== "playing") return;
    const researchEffect = research === "astronomy" ? "astronomyResearch" : "necromancyResearch";
    const researchCost = research === "astronomy" ? 2 : 3;
    const canOpenResearch = game.pendingResearchDraw === null
      && game.activeRuleCards.filter((card) => card.effect === researchEffect).length
        > (research === "astronomy" ? game.astronomyResearchUses : game.necromancyResearchUses)
      && game.stars >= researchCost
      && (research === "astronomy" ? game.piles.some((pile) => pile.length > 0) : game.discard.length > 0);
    setGame((current) => {
      if (current.status !== "playing" || current.pendingResearchDraw !== null) return current;
      const effect = researchEffect;
      const availableUses = current.activeRuleCards.filter((card) => card.effect === effect).length;
      const usedUses = research === "astronomy" ? current.astronomyResearchUses : current.necromancyResearchUses;
      const cost = research === "astronomy" ? 2 : 3;
      const hasCards = research === "astronomy"
        ? current.piles.some((pile) => pile.length > 0)
        : current.discard.length > 0;
      if (availableUses <= usedUses) {
        return { ...current, message: "이 연구 룰은 이번 턴에 더 사용할 수 없습니다." };
      }
      if (current.stars < cost) {
        return { ...current, message: `${research === "astronomy" ? "천문학" : "강령학"} 연구: ★${cost}가 필요합니다.` };
      }
      if (!hasCards) {
        return { ...current, message: research === "astronomy" ? "파일에 뽑을 카드가 없습니다." : "버린 카드가 없습니다." };
      }
      return {
        ...current,
        stars: current.stars - cost,
        pendingResearchDraw: research,
        message: research === "astronomy"
          ? "천문학 연구: 드로우할 파일을 선택하세요."
          : "강령학 연구: 버린 카드에서 카드를 손패로 드래그하세요.",
      };
    });
    if (canOpenResearch) setBattleCardView(research === "necromancy" ? "discard" : null);
  };

  const drawAstronomyResearchCard = (pileIndex: number, allowAutoPay = false) => {
    const canDrawDirectly = allowAutoPay && game.pendingResearchDraw === null;
    if ((game.pendingResearchDraw !== "astronomy" && !canDrawDirectly) || phase !== "playing" || game.status !== "playing") return;
    const expectedCardId = game.piles[pileIndex]?.at(-1)?.id;
    if (expectedCardId === undefined) {
      setGame((current) => ({ ...current, message: "이 파일은 비어 있습니다. 카드가 있는 파일을 선택하세요." }));
      return;
    }
    const expectedCard = game.piles[pileIndex]?.at(-1);
    if (expectedCard && captureDrawOrigins([expectedCard]) > 0) setPhase("drawing");
    setGame((current) => {
      const isPendingResearch = current.pendingResearchDraw === "astronomy";
      const isDirectResearch = allowAutoPay && current.pendingResearchDraw === null;
      if (!isPendingResearch && !isDirectResearch) {
        setPhase("playing");
        return current;
      }
      if (isDirectResearch && !canUseResearchDraw(current, "astronomy")) {
        setPhase("playing");
        return {
          ...current,
          message: current.activeRuleCards.some((card) => card.effect === "astronomyResearch")
            ? current.stars < 2
              ? "천문학 연구: ★★가 필요합니다."
              : current.astronomyResearchUses >= current.activeRuleCards.filter((card) => card.effect === "astronomyResearch").length
                ? "천문학 연구는 이번 턴에 더 사용할 수 없습니다."
                : "파일에 뽑을 카드가 없습니다."
            : "천문학 연구 룰을 먼저 사용하세요.",
        };
      }
      if (current.piles[pileIndex]?.at(-1)?.id !== expectedCardId) {
        setPhase("playing");
        return current;
      }
      const nextPiles = current.piles.map((pile) => [...pile]);
      const card = nextPiles[pileIndex]?.pop();
      if (!card) return current;
      if (nextPiles[pileIndex].length > 0) {
        const topIndex = nextPiles[pileIndex].length - 1;
        nextPiles[pileIndex][topIndex] = { ...nextPiles[pileIndex][topIndex], revealed: true };
      }
      const action = `천문학 연구: ${card.name} 드로우`;
      return {
        ...current,
        piles: nextPiles,
        hand: [...current.hand, { ...card, revealed: true }],
        stars: current.stars - (isDirectResearch ? 2 : 0),
        pendingResearchDraw: null,
        astronomyResearchUses: current.astronomyResearchUses + 1,
        message: action,
      };
    });
  };

  const retrieveNecromancyResearchCard = (cardId: number, allowAutoPay = false) => {
    setGame((current) => {
      const isPendingResearch = current.pendingResearchDraw === "necromancy";
      const isDirectResearch = allowAutoPay && current.pendingResearchDraw === null;
      if ((!isPendingResearch && !isDirectResearch) || phase !== "playing" || current.status !== "playing") return current;
      if (isDirectResearch && !canUseResearchDraw(current, "necromancy")) {
        return {
          ...current,
          message: current.activeRuleCards.some((card) => card.effect === "necromancyResearch")
            ? current.stars < 3
              ? "강령학 연구: ★★★가 필요합니다."
              : current.necromancyResearchUses >= current.activeRuleCards.filter((card) => card.effect === "necromancyResearch").length
                ? "강령학 연구는 이번 턴에 더 사용할 수 없습니다."
                : "버린 카드가 없습니다."
            : "강령학 연구 룰을 먼저 사용하세요.",
        };
      }
      const card = current.discard.find((item) => item.id === cardId);
      if (!card) return current;
      const action = `강령학 연구: ${card.name} 드로우`;
      return {
        ...current,
        stars: current.stars - (isDirectResearch ? 3 : 0),
        discard: current.discard.filter((item) => item.id !== cardId),
        hand: [...current.hand, { ...card, revealed: true }],
        pendingResearchDraw: null,
        necromancyResearchUses: current.necromancyResearchUses + 1,
        message: action,
      };
    });
    setBattleCardView(null);
  };

  const playHandCardOnDoubleClick = (card: Card) => {
    // During a forced discard, the ordinary click is the card-selection input.
    if (game.pendingDiscards > 0) return;
    const targetEnemy = (card.kind === "strike" || card.effect === "doubleHit")
      ? game.enemies.find((enemy) => enemy.hp > 0)
      : undefined;
    playCard(card, targetEnemy?.id);
  };

  const playSelectedHandCardOnEnemy = (enemyId: string) => {
    if (screen !== "battle" || phase !== "playing" || game.status !== "playing" || selectedHandCardId === null) return;
    const card = game.hand.find((item) => item.id === selectedHandCardId);
    if (!card || (card.kind !== "strike" && card.effect !== "doubleHit")) return;
    setSelectedHandCardId(null);
    playCard(card, enemyId);
  };

  useEffect(() => {
    const handleBattleCardKeyboard = (event: KeyboardEvent) => {
      if (screen !== "battle" || phase !== "playing" || game.status !== "playing" || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

      const activateSelectedCard = (card: Card) => {
        setSelectedHandCardId(null);
        playHandCardOnDoubleClick(card);
      };
      if (event.key === "Enter" && selectedHandCardId !== null) {
        const card = game.hand.find((item) => item.id === selectedHandCardId);
        if (!card) return;
        event.preventDefault();
        activateSelectedCard(card);
        return;
      }
      if (!/^\d$/.test(event.key)) return;
      const handIndex = event.key === "0" ? 9 : Number(event.key) - 1;
      const keyboardHand = [
        ...game.hand
          .filter((card) => card.drawSlot !== undefined)
          .sort((left, right) => left.drawSlot! - right.drawSlot!),
        ...game.hand.filter((card) => card.drawSlot === undefined),
      ];
      const card = keyboardHand[handIndex];
      if (!card) return;
      event.preventDefault();
      if (selectedHandCardId === card.id) activateSelectedCard(card);
      else setSelectedHandCardId(card.id);
    };
    window.addEventListener("keydown", handleBattleCardKeyboard);
    return () => window.removeEventListener("keydown", handleBattleCardKeyboard);
  }, [game.hand, game.status, phase, playHandCardOnDoubleClick, screen, selectedHandCardId]);

  const drawSelectedPile = (pileIndex: number) => {
    if ((game.pendingDraws < 1 && game.pendingPileDrawCount < 1) || game.pendingResearchDraw !== null || phase !== "playing" || game.status !== "playing") return;
    if (game.piles.every((pile) => pile.length === 0)) {
      setGame((current) => ({
        ...current,
        pendingDraws: 0,
        pendingPileDrawCount: 0,
        pendingDashRandomDraws: 0,
        message: "드로우할 카드가 없습니다.",
      }));
      return;
    }
    const pile = game.piles[pileIndex];
    const card = pile?.at(-1);
    if (!card) {
      // 빈 파일을 눌러도 드로우 선택 상태를 망가뜨리지 않는다.
      // 다른 파일을 선택할 수 있도록 현재 단계는 유지한다.
      setGame((current) => ({
        ...current,
        message: "이 파일은 비어 있습니다. 카드가 있는 파일을 선택하세요.",
      }));
      return;
    }

    const drawCount = game.pendingPileDrawCount || 1;
    const dashRandomCount = game.pendingDashRandomDraws;
    let dashRandomResult: ReturnType<typeof drawRandomFromPiles> | null = null;
    if (dashRandomCount > 0) {
      const previewPiles = game.piles.map((currentPile) => [...currentPile]);
      for (let index = 0; index < drawCount; index += 1) previewPiles[pileIndex]?.pop();
      dashRandomResult = drawRandomFromPiles(previewPiles, dashRandomCount);
    }
    const originIds = new Set([card.id, ...(dashRandomResult?.hand.map((drawnCard) => drawnCard.id) ?? [])]);
    const origins = new Map<number, DOMRect>();
    document.querySelectorAll<HTMLElement>("[data-top-card-id]").forEach((element) => {
      const cardId = Number(element.dataset.topCardId);
      if (originIds.has(cardId)) origins.set(cardId, element.getBoundingClientRect());
    });
    if (origins.size > 0) {
      pendingOriginsRef.current = origins;
      setPhase("drawing");
    }

    setGame((current) => {
      if (current.pendingDraws < 1 && current.pendingPileDrawCount < 1 || current.pendingResearchDraw !== null) return current;
      if (current.piles[pileIndex]?.at(-1)?.id !== card.id) {
        const hasCards = current.piles.some((currentPile) => currentPile.length > 0);
        // 렌더 사이에 파일이 바뀌었으면 애니메이션 단계에 고정되지 않게 한다.
        setPhase("playing");
        return hasCards
          ? current
          : {
              ...current,
              pendingDraws: 0,
              pendingPileDrawCount: 0,
              pendingDashRandomDraws: 0,
              message: "드로우할 카드가 없습니다.",
            };
      }
      const nextPiles = current.piles.map((currentPile) => [...currentPile]);
      const drawCount = current.pendingPileDrawCount || 1;
      const drawnCards: Card[] = [];
      for (let index = 0; index < drawCount; index += 1) {
        const drawnCard = nextPiles[pileIndex].pop();
        if (!drawnCard) break;
        drawnCards.push({ ...drawnCard, revealed: true });
      }
      if (drawnCards.length === 0) {
        return {
          ...current,
          pendingDraws: 0,
          pendingPileDrawCount: 0,
          pendingDashRandomDraws: 0,
          message: "드로우할 카드를 선택할 수 없습니다.",
        };
      }
      if (nextPiles[pileIndex].length > 0) {
        const nextTopIndex = nextPiles[pileIndex].length - 1;
        nextPiles[pileIndex][nextTopIndex] = {
          ...nextPiles[pileIndex][nextTopIndex],
          revealed: true,
        };
      }
      const isDashDraw = current.pendingDashRandomDraws > 0;
      const randomDrawnCards = isDashDraw ? (dashRandomResult?.hand ?? []) : [];
      const allDrawnCards = [...drawnCards, ...randomDrawnCards];
      // 선택 파일 드로우와 무작위 추가 드로우가 서로 다른 복사본에서
      // 계산되므로, 결과를 합친 뒤 모든 파일의 맨 위 카드가 앞면인지 보장한다.
      const finalPiles = (isDashDraw && dashRandomResult ? dashRandomResult.piles : nextPiles).map((currentPile) => {
        if (currentPile.length === 0) return currentPile;
        const topIndex = currentPile.length - 1;
        const topCard = currentPile[topIndex];
        return topCard.revealed
          ? currentPile
          : [...currentPile.slice(0, topIndex), { ...topCard, revealed: true }];
      });
      const action = isDashDraw
        ? `${pileIndex + 1}번 파일에서 ${drawnCards.length}장 드로우 · 무작위 파일에서 ${randomDrawnCards.length}장 추가 드로우`
        : `${pileIndex + 1}번 파일에서 ${drawnCards.length}장 드로우`;
      const remainingCardCount = finalPiles.reduce((total, currentPile) => total + currentPile.length, 0);
      const nextPendingDraws = isDashDraw
        ? 0
        : current.pendingPileDrawCount > 0
          ? current.pendingDraws
          : Math.min(Math.max(0, current.pendingDraws - 1), remainingCardCount);
      return {
        ...current,
        piles: finalPiles,
        hand: [...current.hand, ...allDrawnCards],
        pendingDraws: nextPendingDraws,
        pendingPileDrawCount: 0,
        pendingDashRandomDraws: 0,
        message: current.pendingPileDrawCount > 0
          ? action
          : nextPendingDraws > 0
          ? "다음 드로우 파일을 선택하세요."
          : current.pendingDiscards > 0
            ? "손에서 버릴 카드 1장을 클릭하세요."
            : action,
      };
    });
  };

  const discardSelectedCard = (cardId: number) => {
    setGame((current) => {
      if (current.pendingDiscards < 1 || current.pendingResearchDraw !== null || phase !== "playing") return current;
      const card = current.hand.find((item) => item.id === cardId);
      if (!card) return current;
      const action = `${card.name} 버림`;
      return {
        ...current,
        hand: current.hand.filter((item) => item.id !== cardId),
        discard: [...current.discard, card],
        pendingDiscards: current.pendingDiscards - 1,
        message: action,
      };
    });
  };

  const takeSelectedPile = (pileIndex: number) => {
    if (!game.pendingSweep || game.pendingResearchDraw !== null || phase !== "playing" || game.status !== "playing") return;
    const pile = game.piles[pileIndex];
    if (!pile?.length) return;
    setGame((current) => {
      if (!current.pendingSweep || current.pendingResearchDraw !== null || !current.piles[pileIndex]?.length) return current;
      const nextPiles = current.piles.map((currentPile) => [...currentPile]);
      const top = nextPiles[pileIndex].pop();
      if (!top) return current;
      const cards = [top];
      if (current.pendingPileOperation !== "discardTop") {
        nextPiles[pileIndex].unshift({ ...top, revealed: true });
      }
      if (nextPiles[pileIndex].length > 0) {
        nextPiles[pileIndex][nextPiles[pileIndex].length - 1] = { ...nextPiles[pileIndex].at(-1)!, revealed: true };
      }
      const action = `${pileIndex + 1}번 파일 ${cards.length}장을 손으로 가져옴`;
      return {
        ...current,
        piles: nextPiles,
        discard: current.pendingPileOperation === "discardTop" ? [...current.discard, top] : current.discard,
        pendingSweep: false,
        pendingPileOperation: null,
        message: action,
      };
    });
  };

  const beginDrag = (
    event: ReactPointerEvent<HTMLElement>,
    card: Card,
    source: DragState["source"] = { type: "hand" },
    cards: Card[] = [card],
  ) => {
    if (
      game.status !== "playing" ||
      game.pendingDraws > 0 ||
      game.pendingPileDrawCount > 0 ||
      game.pendingDiscards > 0 ||
      game.pendingSweep ||
      (game.pendingResearchDraw !== null
        && !(game.pendingResearchDraw === "astronomy" && source.type === "pile")) ||
      phase !== "playing"
    ) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const nextDrag = {
      card,
      cards,
      source,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    dragRef.current = nextDrag;
    setDragging(nextDrag);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const current = dragRef.current;
    if (!current) return;
    const moved = current.moved || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 7;
    const nextDrag = { ...current, x: event.clientX, y: event.clientY, moved };
    dragRef.current = nextDrag;
    setDragging(nextDrag);
  };

  const moveCardToPile = (drag: DragState, targetPileIndex: number) => {
    setGame((current) => {
      if (
        current.status !== "playing" ||
        current.pendingDraws > 0 ||
        current.pendingPileDrawCount > 0 ||
        current.pendingDiscards > 0 ||
        current.pendingSweep ||
        current.pendingResearchDraw !== null ||
        phase !== "playing"
      ) return current;
      if (!current.piles[targetPileIndex]) return current;
      if (drag.source.type === "pile" && drag.source.pileIndex === targetPileIndex) return current;
      const targetCard = current.piles[targetPileIndex].at(-1);
      const lawResearchCount = current.activeRuleCards.filter((card) => card.effect === "lawResearch").length;
      const effectiveMovingCost = cardEnergyCost(drag.card, lawResearchCount, current.forgeCount);
      const effectiveTargetCost = targetCard === undefined
        ? undefined
        : cardEnergyCost(targetCard, lawResearchCount, current.forgeCount);
      if (!canPlaceBySolitaireRule(drag.card, targetCard)) {
        return {
          ...current,
          message: drag.card.solitaireRule === "top"
            ? "윗패는 밑패 위에만 놓을 수 있습니다."
            : "주문은 비용이 1 높은 주문 카드 위에만 놓을 수 있습니다.",
        };
      }
      if (current.stars < 1) {
        return { ...current, message: "솔리테어 행동에 필요한 ★가 없습니다." };
      }
      const isObsidianForge = drag.cards.length === 1
        && drag.card.effect === "obsidianDagger"
        && canForgeCardOnto(drag.card, targetCard, lawResearchCount, current.forgeCount);

      const nextPiles = current.piles.map((pile) => [...pile]);
      if (drag.source.type === "pile") {
        const sourcePile = nextPiles[drag.source.pileIndex];
        const movingCards = sourcePile.slice(drag.source.cardIndex);
        if (
          movingCards.length !== drag.cards.length ||
          movingCards.some((card, index) => card.id !== drag.cards[index].id)
        ) return current;
        sourcePile.splice(drag.source.cardIndex);
        if (sourcePile.length > 0) {
          sourcePile[sourcePile.length - 1] = { ...sourcePile[sourcePile.length - 1], revealed: true };
        }
      } else if (!current.hand.some((card) => card.id === drag.card.id)) {
        return current;
      }

      if (isObsidianForge && targetCard) {
        const consumed = nextPiles[targetPileIndex].pop();
        if (!consumed || consumed.id !== targetCard.id) return current;
        if (nextPiles[targetPileIndex].length > 0) {
          const topIndex = nextPiles[targetPileIndex].length - 1;
          nextPiles[targetPileIndex][topIndex] = { ...nextPiles[targetPileIndex][topIndex], revealed: true };
        }
      }

      const isExchangeForge = drag.cards.length === 1
        && drag.card.effect === "exchange"
        && !drag.card.forged
        && Boolean(targetCard);
      const isRegularForge = !isObsidianForge
        && !drag.card.forged
        && canForgeCardOnto(drag.card, targetCard, lawResearchCount, current.forgeCount);
      const forgeApplied = isObsidianForge || isRegularForge;
      const battleLongCardUpdates = new Map<number, Card>();
      if (isExchangeForge && targetCard) {
        const targetIndex = nextPiles[targetPileIndex].length - 1;
        nextPiles[targetPileIndex][targetIndex] = {
          ...targetCard,
          baseCost: targetCard.baseCost ?? targetCard.cost,
          cost: effectiveMovingCost,
        };
        battleLongCardUpdates.set(targetCard.id, nextPiles[targetPileIndex][targetIndex]);
      }
      const placedCards = drag.cards.map((card, index) => {
        const daggerForgeCost = isObsidianForge && index === 0 ? effectiveTargetCost : undefined;
        const becomesForged = card.effect === "obsidianDagger"
          ? daggerForgeCost !== undefined
          : !card.forged && index === 0 && canForgeCardOnto(card, targetCard, lawResearchCount, current.forgeCount);
        const nextForgeCostsCompleted = daggerForgeCost === undefined
          ? card.forgeCostsCompleted
          : [...new Set([...(card.forgeCostsCompleted ?? []), daggerForgeCost])];
        const baseCost = isExchangeForge && index === 0
          ? (card.baseCost ?? card.cost)
          : card.baseCost;
        const placedCard = {
          ...card,
          baseCost,
          cost: isExchangeForge && index === 0 && targetCard
            ? effectiveTargetCost ?? targetCard.cost
            : card.effect === "plateArmor"
              ? (card.baseCost ?? 1)
              : card.cost,
          value: daggerForgeCost !== undefined ? card.value + targetCard!.value : card.value,
          forgeCostsCompleted: nextForgeCostsCompleted,
          revealed: drag.source.type === "hand" ? true : card.revealed,
          forged: card.forged || becomesForged,
        };
        if (placedCard.forged) battleLongCardUpdates.set(placedCard.id, placedCard);
        return placedCard;
      });
      nextPiles[targetPileIndex].push(...placedCards);
      const metallurgyResearchCount = forgeApplied
        ? current.activeRuleCards.filter((card) => card.effect === "metallurgyResearch").length
        : 0;
      const forgedCardToRetrieve = metallurgyResearchCount > 0 && forgeApplied
        ? placedCards[0]
        : undefined;
      if (forgedCardToRetrieve) {
        const retrievedIndex = nextPiles[targetPileIndex].findIndex((card) => card.id === forgedCardToRetrieve.id);
        if (retrievedIndex >= 0) nextPiles[targetPileIndex].splice(retrievedIndex, 1);
        if (nextPiles[targetPileIndex].length > 0) {
          const topIndex = nextPiles[targetPileIndex].length - 1;
          nextPiles[targetPileIndex][topIndex] = { ...nextPiles[targetPileIndex][topIndex], revealed: true };
        }
      }
      const nextInitialDeck = battleLongCardUpdates.size > 0
        ? current.initialDeck.map((card) => battleLongCardUpdates.get(card.id) ?? card)
        : current.initialDeck;
      const spellStraight = getSpellStraight(nextPiles[targetPileIndex]);
      const floodPyramid = spellStraight ? null : getFloodPyramid(nextPiles[targetPileIndex]);
      let nextEnemies = current.enemies;
      let nextEnergy = current.energy;
      let nextStars = current.stars - 1;
      if (forgeApplied) {
        nextStars += metallurgyResearchCount;
      }
      let autoDiscard: Card[] = [];
      let autoDraws = 0;
      if (spellStraight) {
        nextPiles[targetPileIndex].splice(-3);
        if (nextPiles[targetPileIndex].length > 0) {
          const topIndex = nextPiles[targetPileIndex].length - 1;
          nextPiles[targetPileIndex][topIndex] = { ...nextPiles[targetPileIndex][topIndex], revealed: true };
        }
        autoDiscard = spellStraight;
        for (const spell of spellStraight) {
          if (spell.effect === "magicStrike") {
            const target = lowestHealthEnemy(nextEnemies);
            if (target) {
              nextEnemies = nextEnemies.map((enemy) => enemy.id === target.id
                ? applyPlayerAttack(enemy, spell.value + current.strength, 1)
                : enemy);
            }
          } else if (spell.effect === "shockwave") {
            nextEnemies = nextEnemies.map((enemy) => enemy.hp > 0
              ? applyPlayerAttack(enemy, spell.value + current.strength, 1)
              : enemy);
          } else if (spell.effect === "ventilate") {
            nextEnergy += spell.value;
          } else if (spell.effect === "starlight") {
            nextStars += spell.value;
          }
        }
        if (nextEnemies.every((enemy) => enemy.hp === 0)) {
          grantBattleReward(battleRewardRegionRef.current);
        }
      } else if (floodPyramid) {
        nextPiles[targetPileIndex].splice(-4);
        if (nextPiles[targetPileIndex].length > 0) {
          const topIndex = nextPiles[targetPileIndex].length - 1;
          nextPiles[targetPileIndex][topIndex] = { ...nextPiles[targetPileIndex][topIndex], revealed: true };
        }
        autoDiscard = floodPyramid;
        nextEnergy += 2;
        nextStars += 2;
        autoDraws = Math.min(2, nextPiles.reduce((total, pile) => total + pile.length, 0));
      }
      const cardLabel = drag.cards.length > 1 ? `${drag.cards.length}장` : drag.card.name;
      const action = drag.source.type === "hand"
        ? `${drag.card.name} 카드를 손패에서 ${targetPileIndex + 1}번 파일로 이동`
        : `${drag.source.pileIndex + 1}번 파일의 ${cardLabel}을(를) ${targetPileIndex + 1}번 파일로 이동`;
      const forgeAction = isObsidianForge && targetCard
        ? `${drag.card.name} 재련: ${targetCard.name} 소멸 · 피해 ${targetCard.value} 추가`
        : action;
      const finalAction = forgedCardToRetrieve
        ? `${forgeAction} · 금속학 연구: 재련된 카드 가져옴 · ★ ${metallurgyResearchCount} 획득`
        : forgeAction;

      return {
        ...current,
        piles: nextPiles,
        initialDeck: nextInitialDeck,
        hand: drag.source.type === "hand"
          ? [...current.hand.filter((card) => card.id !== drag.card.id), ...(forgedCardToRetrieve ? [{ ...forgedCardToRetrieve, revealed: true }] : [])]
          : forgedCardToRetrieve
            ? [...current.hand, { ...forgedCardToRetrieve, revealed: true }]
            : current.hand,
        discard: spellStraight || floodPyramid ? [...current.discard, ...autoDiscard] : current.discard,
        enemies: nextEnemies,
        energy: nextEnergy,
        stars: nextStars,
        forgeCount: current.forgeCount + (forgeApplied ? 1 : 0),
        removedFromReshuffleIds: isObsidianForge && targetCard
          ? [...new Set([...current.removedFromReshuffleIds, targetCard.id])]
          : current.removedFromReshuffleIds,
        pendingDraws: floodPyramid ? current.pendingDraws + autoDraws : current.pendingDraws,
        starsSpent: current.starsSpent + 1,
        status: spellStraight && nextEnemies.every((enemy) => enemy.hp === 0) ? "won" : current.status,
        message: spellStraight ? "주문 스트레이트 발동!" : floodPyramid ? "범람 피라미드 발동!" : finalAction,
      };
    });
  };

  const moveSelectedHandCardToPile = (targetPileIndex: number) => {
    if (
      selectedHandCardId === null ||
      game.status !== "playing" ||
      game.pendingDraws > 0 ||
      game.pendingPileDrawCount > 0 ||
      game.pendingDiscards > 0 ||
      game.pendingSweep ||
      game.pendingResearchDraw !== null ||
      phase !== "playing"
    ) return false;
    const card = game.hand.find((item) => item.id === selectedHandCardId);
    if (!card) return false;
    const targetCard = game.piles[targetPileIndex]?.at(-1);
    const canPlace = Boolean(game.piles[targetPileIndex])
      && game.stars >= 1
      && canPlaceBySolitaireRule(card, targetCard);
    const selectedDrag: DragState = {
      card,
      cards: [card],
      source: { type: "hand" },
      x: 0,
      y: 0,
      moved: true,
    };
    moveCardToPile(selectedDrag, targetPileIndex);
    if (canPlace) setSelectedHandCardId(null);
    return true;
  };

  const finishDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const current = dragRef.current;
    if (!current) return;
    if (current.moved) {
      const dropZone = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-drop-target]")
        ?.dataset.dropTarget;
      const targetEnemyId = dropZone?.startsWith("enemy:") ? dropZone.slice(6) : undefined;
      const targetPileIndex = dropZone?.startsWith("pile:") ? Number(dropZone.slice(5)) : undefined;

      if (dropZone === "hand" && current.source.type === "pile") {
        const sourcePile = game.piles[current.source.pileIndex];
        const isTopCard = current.cards.length === 1
          && current.source.cardIndex === (sourcePile?.length ?? 0) - 1;
        if (isTopCard) {
          drawAstronomyResearchCard(current.source.pileIndex, true);
        } else {
          setGame((state) => ({
            ...state,
            message: "연구 드로우는 파일 맨 위 카드만 손패로 가져올 수 있습니다.",
          }));
        }
        dragRef.current = null;
        setDragging(null);
        return;
      }

      if (targetPileIndex !== undefined && Number.isInteger(targetPileIndex)) {
        moveCardToPile(current, targetPileIndex);
        dragRef.current = null;
        setDragging(null);
        return;
      }

      const isTargetedAttack = current.card.kind === "strike" || current.card.effect === "doubleHit";
      const resolvedTargetEnemyId = targetEnemyId
        ?? (isTargetedAttack && dropZone === "defend"
          ? game.enemies.find((enemy) => enemy.hp > 0)?.id
          : undefined);
      const validDrop =
        current.source.type === "hand" && !["slime", "combatManual", "grimoire"].includes(current.card.effect) && (
          (isTargetedAttack && Boolean(resolvedTargetEnemyId)) ||
          (current.card.effect === "ironRampage" && dropZone === "defend") ||
          (current.card.effect === "odinSpear" && dropZone === "defend") ||
          (current.card.kind !== "strike" && dropZone === "defend")
        );
      if (validDrop) {
        playCard(current.card, resolvedTargetEnemyId);
      } else {
        setGame((state) => ({
          ...state,
          message: current.source.type === "pile"
            ? "앞면 카드 묶음은 다른 파일 위에 놓아주세요."
            : isTargetedAttack
              ? "타격 카드는 적이나 파일 위에 놓아주세요."
              : "이 카드는 중앙 영역이나 파일 위에 놓아주세요.",
        }));
      }
    }
    dragRef.current = null;
    setDragging(null);
  };

  const cancelDrag = () => {
    dragRef.current = null;
    setDragging(null);
  };

  const endTurn = () => {
    if (
      game.status !== "playing" ||
      game.pendingDraws > 0 ||
      game.pendingPileDrawCount > 0 ||
      game.pendingDiscards > 0 ||
      game.pendingSweep ||
      game.pendingResearchDraw !== null ||
      phase !== "playing"
    ) return;
    const toxicSlimeFlights = game.hand.flatMap((card) => {
      if (card.effect !== "slime") return [];
      const element = handCardRefs.current.get(card.id);
      return element ? [{ element, rect: element.getBoundingClientRect() }] : [];
    });
    setPhase("discarding");
    setDragging(null);

    const discardDelay = 180 + Math.max(0, game.hand.length - 1) * 25;
    later(() => {
      const enemiesAfterBlockDecay = game.enemies.map((enemy) => ({ ...enemy, physicalBlock: 0 }));
      const livingEnemies = enemiesAfterBlockDecay.filter((enemy) => enemy.hp > 0);
      const toxicSlimeDamage = game.hand.filter((card) => card.effect === "slime").length * 12;
      const discarded = [
        ...game.discard,
        ...game.hand,
      ];
      const pilesAfterSlime = game.piles.map((pile) => [...pile]);
      const defenseRetention = game.preserveDefenseOnTurnEnd ? 0.5 : 0;
      let remainingPhysicalBlock = game.preserveDefenseOnTurnEnd
        ? Math.floor(game.playerPhysicalBlock * defenseRetention)
        : game.playerPhysicalBlock;
      let remainingMagicBlock = game.preserveDefenseOnTurnEnd
        ? Math.floor(game.playerMagicBlock * defenseRetention)
        : game.playerMagicBlock;
      let physicalStatus = {
        resistance: game.playerPhysicalResistance,
        vulnerability: game.playerPhysicalVulnerability,
      };
      const magicStatus = {
        resistance: game.playerMagicResistance,
        vulnerability: game.playerMagicVulnerability,
      };
      let nextTurnPhysicalVulnerabilityGain = 0;
      let nextTurnMagicVulnerabilityGain = 0;
      const toxicSlimeBlocked = game.invulnerable ? 0 : Math.min(toxicSlimeDamage, remainingPhysicalBlock);
      const toxicSlimeDamageTaken = game.invulnerable ? 0 : toxicSlimeDamage - toxicSlimeBlocked;
      remainingPhysicalBlock -= toxicSlimeBlocked;
      let remainingHp = Math.max(0, game.playerHp - toxicSlimeDamageTaken);
      const hpAfterToxicSlime = remainingHp;
      const physicalBlockAfterToxicSlime = remainingPhysicalBlock;
      const magicBlockAfterToxicSlime = remainingMagicBlock;
      const steps: Array<{
        enemy: EnemyState;
        action: EnemyAction;
        attack: EnemyAction["attacks"][number] | null;
        damage: number;
        hpAfter: number;
        physicalBlockAfter: number;
        magicBlockAfter: number;
        message?: string;
      }> = [];
      const actedEnemyIds = new Set<string>();
      const reflectedDamage = new Map<string, number>();

      if (game.extraTurns > 0) {
        setGame({
          ...game,
          piles: pilesAfterSlime,
          hand: [],
          discard: discarded,
          energy: game.deckEditions.includes("rampaging") ? 4 : 3,
          stars: game.stars + (game.deckEditions.includes("frugal") ? game.energy : 0),
          starsSpent: 0,
          reflectDamage: 0,
          extraTurns: game.extraTurns - 1,
          pendingResearchDraw: null,
          astronomyResearchUses: 0,
          necromancyResearchUses: 0,
          turn: game.turn + 1,
          playerHp: remainingHp,
          playerPhysicalBlock: remainingPhysicalBlock,
          playerMagicBlock: remainingMagicBlock,
          strength: Math.max(0, game.strength - game.temporaryStrength),
          temporaryStrength: 0,
          defenseMultiplier: 1,
          damageTakenMultiplier: 1,
          invulnerable: false,
          doubleNextAttack: false,
          enemies: enemiesAfterBlockDecay,
          status: remainingHp === 0 ? "lost" : "playing",
          message: remainingHp === 0 ? "유독성 점액의 피해로 쓰러졌습니다." : "추가 턴을 시작합니다.",
        });
        setPhase(remainingHp === 0 ? "playing" : "drawing");
        if (remainingHp > 0) later(drawCards, 120);
        return;
      }

      for (const enemy of livingEnemies) {
        if (remainingHp === 0) break;
        const action = enemy.actions[enemy.intentIndex];
        actedEnemyIds.add(enemy.id);
        for (const attack of action.attacks) {
          const resolvedAttack = enemy.nextAttackMagic
            ? { ...attack, type: "magic" as const }
            : attack;
          const attackValue = reduceEnemyDamageByResistance(
            attack.value + enemy.strength,
            resolvedAttack.type,
            physicalStatus.resistance,
            magicStatus.resistance,
          );
          for (let hit = 0; hit < (attack.hits ?? 1); hit += 1) {
            if (remainingHp === 0) break;
            const matchingBlock = resolvedAttack.type === "physical" ? remainingPhysicalBlock : remainingMagicBlock;
            const blocked = game.invulnerable ? 0 : Math.min(attackValue, matchingBlock);
            if (game.reflectDamage > 0 && blocked > 0) {
              reflectedDamage.set(enemy.id, (reflectedDamage.get(enemy.id) ?? 0) + blocked * game.reflectDamage);
            }
            const damage = game.invulnerable
              ? 0
              : (attackValue - blocked)
                * game.damageTakenMultiplier
                * vulnerabilityMultiplier(resolvedAttack.type === "physical" ? physicalStatus.vulnerability : magicStatus.vulnerability);
            if (!game.invulnerable && resolvedAttack.type === "physical") remainingPhysicalBlock -= blocked;
            else if (!game.invulnerable) remainingMagicBlock -= blocked;
            remainingHp = Math.max(0, remainingHp - damage);
            steps.push({
              enemy,
              action,
              attack: resolvedAttack,
              damage,
              hpAfter: remainingHp,
              physicalBlockAfter: remainingPhysicalBlock,
              magicBlockAfter: remainingMagicBlock,
            });
          }
        }
        if (action.physicalVulnerabilityGain) {
          physicalStatus = addVulnerability(physicalStatus, action.physicalVulnerabilityGain);
          steps.push({
            enemy,
            action,
            attack: null,
            damage: 0,
            hpAfter: remainingHp,
            physicalBlockAfter: remainingPhysicalBlock,
            magicBlockAfter: remainingMagicBlock,
            message: `물리 취약 ${physicalStatus.vulnerability} 부여`,
          });
        }
        if (action.nextTurnPhysicalVulnerabilityGain) {
          nextTurnPhysicalVulnerabilityGain += action.nextTurnPhysicalVulnerabilityGain;
          steps.push({
            enemy,
            action,
            attack: null,
            damage: 0,
            hpAfter: remainingHp,
            physicalBlockAfter: remainingPhysicalBlock,
            magicBlockAfter: remainingMagicBlock,
            message: `다음 턴 시작 시 물리 취약 ${action.nextTurnPhysicalVulnerabilityGain} 부여`,
          });
        }
        if (action.nextTurnMagicVulnerabilityGain) {
          nextTurnMagicVulnerabilityGain += action.nextTurnMagicVulnerabilityGain;
          steps.push({
            enemy,
            action,
            attack: null,
            damage: 0,
            hpAfter: remainingHp,
            physicalBlockAfter: remainingPhysicalBlock,
            magicBlockAfter: remainingMagicBlock,
            message: `다음 턴 시작 시 마법 취약 ${action.nextTurnMagicVulnerabilityGain} 부여`,
          });
        }
        if (action.discardCount && enemy.discardPileIndex !== undefined) {
          const pileIndex = enemy.discardPileIndex % Math.max(1, pilesAfterSlime.length);
          const pile = pilesAfterSlime[pileIndex];
          const discardedCard = pile?.pop();
          if (discardedCard) {
            discarded.push(discardedCard);
            if (pile.length > 0) pile[pile.length - 1] = { ...pile[pile.length - 1], revealed: true };
          }
          steps.push({
            enemy,
            action,
            attack: null,
            damage: 0,
            hpAfter: remainingHp,
            physicalBlockAfter: remainingPhysicalBlock,
            magicBlockAfter: remainingMagicBlock,
            message: discardedCard ? `${pileIndex + 1}번 파일: ${discardedCard.name} 버림` : `${pileIndex + 1}번 파일은 비어 있음`,
          });
        }
        if (action.strengthGain || action.blockGain) {
          steps.push({
            enemy,
            action,
            attack: null,
            damage: 0,
            hpAfter: remainingHp,
            physicalBlockAfter: remainingPhysicalBlock,
            magicBlockAfter: remainingMagicBlock,
          });
        }
      }

      let nextEnemies = enemiesAfterBlockDecay.map((enemy) => {
        if (enemy.hp === 0 || !actedEnemyIds.has(enemy.id)) return enemy;
        const action = enemy.actions[enemy.intentIndex];
        const nextIntentIndex = chooseNextIntent(enemy.actions, enemy.intentIndex);
        return {
          ...enemy,
          strength: enemy.strength + (action.strengthGain ?? 0),
          physicalBlock: enemy.physicalBlock + (action.blockGain ?? 0),
          intentIndex: nextIntentIndex,
          discardPileIndex: undefined,
          quicknessReady: false,
          nextAttackMagic: action.nextAttackMagic
            ? true
            : enemy.nextAttackMagic && action.attacks.length === 0,
        };
      });
      nextEnemies = nextEnemies.map((enemy) => {
        const reflected = reflectedDamage.get(enemy.id) ?? 0;
        return reflected > 0 ? applyPlayerAttack(enemy, reflected, 1) : enemy;
      });

      setGame({
        ...game,
        piles: pilesAfterSlime,
        hand: [],
        discard: discarded,
        // 적이 행동하는 동안에는 방금 사용 중인 의도를 그대로 보여 준다.
        enemies: enemiesAfterBlockDecay,
      });
      setPhase("enemy-turn");

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const stepDuration = reducedMotion ? 80 : 220;
      const hitAt = reducedMotion ? 20 : 105;
      const clearAt = reducedMotion ? 50 : 195;
      const slimeFlightGap = reducedMotion ? 20 : 50;
      const slimeFlightDuration = toxicSlimeFlights.length > 0
        ? (reducedMotion ? 120 : 460) + Math.max(0, toxicSlimeFlights.length - 1) * slimeFlightGap
        : 0;

      if (toxicSlimeDamage > 0) {
        const playerHealth = document.querySelector<HTMLElement>(".player-health-popup-anchor");
        if (playerHealth) {
          toxicSlimeFlights.forEach((flight, index) => {
            animateCardToPlayer(flight.element, flight.rect, playerHealth, index * slimeFlightGap, 460);
          });
        }
        later(() => {
          setDamagePopup({
            key: `toxic-slime-${Date.now()}`,
            text: toxicSlimeDamageTaken > 0 ? `-${toxicSlimeDamageTaken}` : "막음",
            kind: "damage",
          });
          setGame((current) => ({
            ...current,
            playerHp: hpAfterToxicSlime,
            playerPhysicalBlock: physicalBlockAfterToxicSlime,
            playerMagicBlock: magicBlockAfterToxicSlime,
          }));
        }, toxicSlimeFlights.length > 0 ? (reducedMotion ? 60 : 380) + Math.max(0, toxicSlimeFlights.length - 1) * slimeFlightGap : 0);
      }

      steps.forEach((step, index) => {
        const base = slimeFlightDuration + index * stepDuration;
        later(() => setAttackingEnemyId(step.enemy.id), base);
        later(() => {
          if (step.attack) {
            setDamagePopup({
              key: `${step.enemy.id}-${Date.now()}`,
              text: step.damage > 0 ? `-${step.damage}` : "막음",
              kind: "damage",
            });
          }
          setGame((current) => ({
            ...current,
            playerHp: step.hpAfter,
            playerPhysicalBlock: step.physicalBlockAfter,
            playerMagicBlock: step.magicBlockAfter,
          }));
        }, base + hitAt);
        later(() => setAttackingEnemyId(null), base + clearAt);
      });

      later(() => {
        setDamagePopup(null);
        setAttackingEnemyId(null);
        if (remainingHp === 0) {
          setGame({
            ...game,
            piles: pilesAfterSlime,
            hand: [],
            discard: discarded,
            playerHp: 0,
            playerPhysicalBlock: remainingPhysicalBlock,
            playerMagicBlock: remainingMagicBlock,
            playerPhysicalResistance: physicalStatus.resistance,
            playerPhysicalVulnerability: physicalStatus.vulnerability,
            playerMagicResistance: magicStatus.resistance,
            playerMagicVulnerability: magicStatus.vulnerability,
            enemies: nextEnemies,
            status: "lost",
            message: "적의 공격을 받고 쓰러졌습니다.",
          });
          setPhase("playing");
          return;
        }

        if (nextEnemies.every((enemy) => enemy.hp === 0)) {
          setGame({
            ...game,
            piles: pilesAfterSlime,
            hand: [],
            discard: discarded,
            playerHp: remainingHp,
            playerPhysicalBlock: remainingPhysicalBlock,
            playerMagicBlock: remainingMagicBlock,
            playerPhysicalResistance: physicalStatus.resistance,
            playerPhysicalVulnerability: physicalStatus.vulnerability,
            playerMagicResistance: magicStatus.resistance,
            playerMagicVulnerability: magicStatus.vulnerability,
            enemies: nextEnemies,
            status: "won",
            message: "응수로 모든 적을 쓰러뜨렸습니다.",
          });
          setPhase("playing");
          grantBattleReward(battleRewardRegionRef.current);
          return;
        }

        const willClearAfterNextDraw = pilesAfterSlime.every((pile) => pile.length <= 1);
        const clearPlan = willClearAfterNextDraw
          ? (() => {
            const emptyIndexes = pilesAfterSlime.map((pile, index) => pile.length === 0 ? index : -1).filter((index) => index >= 0);
            const cardsDrawnBeforeClear = new Set(pilesAfterSlime.flatMap((pile) => pile.map((card) => card.id)));
            const cards = cardsForNextShuffle(
              game.initialDeck,
              new Set(game.removedFromReshuffleIds),
              cardsDrawnBeforeClear,
            );
            const rebuilt = buildPiles(
              prepareDeckForPiles(cards),
              game.deckEditions.includes("fantastic") ? 4 : 5,
              game.deckEditions.includes("transparent"),
              0,
              game.deckEditions.includes("golden"),
              pilesAfterSlime.length,
              game.evenDealOnReshuffle,
            );
            const redraw = drawFromPileIndexes(rebuilt, emptyIndexes);
            return { pilesBeforeDraw: rebuilt, pilesAfterDraw: redraw.piles, hand: redraw.hand };
          })()
          : null;
        const nextTurnPhysicalStatus = decayThenAddVulnerability(physicalStatus, nextTurnPhysicalVulnerabilityGain);
        const nextTurnMagicStatus = decayThenAddVulnerability(magicStatus, nextTurnMagicVulnerabilityGain);
        setGame({
          ...game,
          piles: pilesAfterSlime,
          clearPlan,
          hand: [],
          discard: discarded,
          energy: game.deckEditions.includes("rampaging") ? 4 : 3,
          stars: game.stars + (game.deckEditions.includes("frugal") ? game.energy : 0),
          starsSpent: 0,
          reflectDamage: 0,
          pendingResearchDraw: null,
          astronomyResearchUses: 0,
          necromancyResearchUses: 0,
          turn: game.turn + 1,
          playerHp: remainingHp,
          playerPhysicalBlock: remainingPhysicalBlock,
          playerMagicBlock: remainingMagicBlock,
          playerPhysicalResistance: nextTurnPhysicalStatus.resistance,
          playerMagicResistance: nextTurnMagicStatus.resistance,
          playerPhysicalVulnerability: nextTurnPhysicalStatus.vulnerability,
          playerMagicVulnerability: nextTurnMagicStatus.vulnerability,
          strength: Math.max(0, game.strength - game.temporaryStrength),
          temporaryStrength: 0,
          defenseMultiplier: 1,
          damageTakenMultiplier: 1,
          invulnerable: false,
          doubleNextAttack: false,
          enemies: nextEnemies,
          message: "적의 턴이 끝났습니다.",
        });
        setPhase("drawing");
        later(drawCards, 120);
      }, slimeFlightDuration + steps.length * stepDuration + 260);
    }, discardDelay);
  };

  useEffect(() => {
    const endTurnWithKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (screen !== "battle" || event.key.toLowerCase() !== "e") return;
      event.preventDefault();
      endTurn();
    };
    window.addEventListener("keydown", endTurnWithKey);
    return () => window.removeEventListener("keydown", endTurnWithKey);
  }, [endTurn, screen]);

  const controlsLocked =
    phase !== "playing" ||
    game.status !== "playing" ||
    game.pendingDraws > 0 ||
    game.pendingPileDrawCount > 0 ||
    game.pendingDiscards > 0 ||
    game.pendingSweep ||
    game.pendingResearchDraw !== null;
  const cardWatermarkVariables = {
    "--battle-card-color": battleThemeColors.card,
    "--battle-card-text-color": battleThemeColors.cardText,
    "--battle-card-border-color": battleThemeColors.cardBorder,
    "--battle-cost-color": battleThemeColors.cost,
    "--battle-cost-text-color": battleThemeColors.costText,
    "--battle-basic-band-color": battleThemeColors.basicBand,
    "--battle-special-band-color": battleThemeColors.specialBand,
    "--battle-rare-band-color": battleThemeColors.rareBand,
    "--battle-physical-color": battleThemeColors.physical,
    "--battle-magic-color": battleThemeColors.magic,
    "--card-watermark-opacity": cardWatermarkOpacity,
    "--card-watermark-size": `${cardWatermarkSize}%`,
    "--card-watermark-x": `${cardWatermarkX}%`,
    "--card-watermark-y": `${cardWatermarkY}%`,
    ...(constellationPreviewIndex === null ? {} : {
      "--card-watermark-preview-image": constellationPresetCssImage(
        CONSTELLATION_PRESETS[constellationPreviewIndex],
        battleThemeColors.card,
      ),
    }),
  } as CSSProperties;
  const combatManualBonus = game.hand
    .filter((card) => card.effect === "combatManual")
    .reduce((total, card) => total + card.value, 0);
  const lawResearchCount = game.activeRuleCards
    .filter((card) => card.effect === "lawResearch")
    .length;
  const hasClearHandSlots = game.hand.some((card) => card.drawSlot !== undefined);
  const usesClearHandSlots = phase !== "playing" && hasClearHandSlots;
  const clearHandSlotCount = usesClearHandSlots
    ? Math.max(...game.hand.map((card) => card.drawSlotCount ?? 0), game.hand.length)
    : game.hand.length;
  const displayedHand: Array<Card | null> = usesClearHandSlots
    ? [
      ...Array.from({ length: clearHandSlotCount }, (_, slot) =>
        game.hand.find((card) => card.drawSlot === slot) ?? null),
      ...game.hand.filter((card) => card.drawSlot === undefined),
    ]
    : hasClearHandSlots
      ? [
        ...game.hand
          .filter((card) => card.drawSlot !== undefined)
          .sort((left, right) => left.drawSlot! - right.drawSlot!),
        ...game.hand.filter((card) => card.drawSlot === undefined),
      ]
      : game.hand;
  const handCenterIndex = (displayedHand.length - 1) / 2;
  const handFanStyle = (index: number) => {
    const distanceFromCenter = index - handCenterIndex;
    return {
      "--hand-angle": `${distanceFromCenter * 3.5}deg`,
      "--hand-y": `${Math.min(28, Math.pow(Math.abs(distanceFromCenter), 1.55) * 5)}px`,
    } as CSSProperties;
  };
  const discardPileCounts = game.enemies.reduce((counts, enemy) => {
    const intent = enemy.actions[enemy.intentIndex];
    if (enemy.hp > 0 && intent.discardCount && enemy.discardPileIndex !== undefined) {
      counts.set(enemy.discardPileIndex, (counts.get(enemy.discardPileIndex) ?? 0) + intent.discardCount);
    }
    return counts;
  }, new Map<number, number>());

  if (screen === "map") {
    const currentRoomKey = mapRoomKey(mapPosition);
    const currentRoomType = effectiveRoomType(mapPosition);
    const inSafeArea = isSafeAreaPosition(mapPosition);
    const canEditDeck = true;
    const viewedDeck = ownedDecks.find((deck) => deck.id === deckViewerDeckId) ?? activeDeck;
    const currentFloorCards = roomDrops[currentRoomKey] ?? [];
    const currentFloorConsumables = roomConsumableDrops[currentRoomKey] ?? [];
    const currentFloorDecks = roomDeckDrops[currentRoomKey] ?? [];
    const hasRoomActionNotice = Boolean(mapMessage && !deckEditorOpen)
      || ["shop", "shrine", "campfire", "blessing", "portal", "safePortal", "heal"].includes(currentRoomType)
      || currentFloorCards.length > 0
      || currentFloorConsumables.length > 0
      || currentFloorDecks.length > 0;
    const cardPoolStatsCards = ALL_CARD_BLUEPRINTS.filter((card) => !card.enemyToken);
    const cardPoolStatsTotal = cardPoolStatsCards.length;
    const cardPoolRarityStats = DEBUG_CARD_RARITIES.map(({ rarity, label }) => ({
      label,
      cards: cardPoolStatsCards.filter((card) => card.rarity === rarity),
    }));
    const cardPoolKindStats = [
      { label: "공격 카드", match: (card: CardBlueprint) => card.kind === "strike" },
      {
        label: "방어를 주는 카드",
        match: (card: CardBlueprint) => cardGivesPhysicalDefense(card) && !cardGivesMagicDefense(card),
      },
      {
        label: "마법 방어를 주는 카드",
        match: (card: CardBlueprint) => cardGivesMagicDefense(card) && !cardGivesPhysicalDefense(card),
      },
      {
        label: "방어·마법 방어를 모두 주는 카드",
        match: (card: CardBlueprint) => cardGivesPhysicalDefense(card) && cardGivesMagicDefense(card),
      },
    ].map(({ label, match }) => ({
      label,
      cards: cardPoolStatsCards.filter(match),
    }));
    const cardPoolCostStats = Array.from(new Set(cardPoolStatsCards.map(cardPoolCost)))
      .sort((left, right) => left - right)
      .map((cost) => ({
        label: cost === -1 ? "사용 불가" : `${cost} 코스트`,
        cards: cardPoolStatsCards.filter((card) => cardPoolCost(card) === cost),
      }));
    const cardPoolKeywordStats = [
      { label: "드로우", match: (card: CardBlueprint) => card.draw > 0 || CARD_POOL_DRAW_EFFECTS.has(card.effect) },
      { label: "에너지 생성", match: (card: CardBlueprint) => CARD_POOL_ENERGY_EFFECTS.has(card.effect) },
      { label: "방어 효과", match: (card: CardBlueprint) => CARD_POOL_DEFENSE_EFFECTS.has(card.effect) },
      { label: "★ 획득", match: (card: CardBlueprint) => CARD_POOL_STAR_EFFECTS.has(card.effect) },
      { label: "상태 효과", match: (card: CardBlueprint) => CARD_POOL_STATUS_EFFECTS.has(card.effect) },
      { label: "룰", match: (card: CardBlueprint) => Boolean(card.rule) },
      { label: "재련", match: (card: CardBlueprint) => card.effect === "obsidianDagger" || card.effect === "odinSpear" || card.forgeCost !== undefined || Boolean(card.forgeCosts?.length) || Boolean(card.forgeTargetName) || Boolean(card.forgeAny) },
      { label: "소멸", match: (card: CardBlueprint) => Boolean(card.exhaust) },
    ].map(({ label, match }) => ({
      label,
      cards: cardPoolStatsCards.filter(match),
    }));
    const rarityOrder: Record<CardRarity, number> = { status: 0, starter: 1, basic: 2, special: 3, rare: 4, legendary: 5 };
    const cardRarityRank = (card: Pick<Card, "rarity" | "token" | "enemyToken">) =>
      rarityOrder[card.token || card.enemyToken ? "status" : card.rarity];
    const sortCardPoolHoverCards = (cards: CardBlueprint[]) => [...cards].sort((left, right) => (
      cardRarityRank(left) - cardRarityRank(right)
      || cardPoolCost(left) - cardPoolCost(right)
      || left.name.localeCompare(right.name, "ko")
    ));
    const showCardPoolStatHover = (event: ReactMouseEvent<HTMLElement>, label: string, cards: CardBlueprint[]) => {
      const width = Math.min(420, Math.max(240, window.innerWidth - 24));
      const x = Math.min(event.clientX + 16, Math.max(12, window.innerWidth - width - 12));
      const y = Math.min(event.clientY + 12, Math.max(12, window.innerHeight - 300));
      setCardPoolStatHover({ label, cards: sortCardPoolHoverCards(cards), x, y });
    };
    const cardSortCost = (card: Card) => UNPLAYABLE_CARD_EFFECTS.has(card.effect)
      ? -1
      : card.effect === "ironWall" ? IRON_WALL_COST : card.cost;
    const groupAndSortCards = (cards: Card[]) => Array.from(cards.reduce((groups, card) => {
      const groupKey = [card.name, card.effect, card.damageType, card.cost, card.value, card.rarity,
        card.colored ? "painted" : "plain", card.forged ? "forged" : "normal", card.enemyToken ? "token" : "card",
        card.forgeCostsCompleted?.join(",") ?? "",
        transformedCardNewIds.has(card.id) ? "transformed-new" : "regular"].join(":");
      const current = groups.get(groupKey);
      if (current) current.cardIds.push(card.id);
      else groups.set(groupKey, { card, cardIds: [card.id] });
      return groups;
    }, new Map<string, { card: Card; cardIds: number[] }>()).values()).sort((left, right) => {
      const primary = deckEditorSort === "cost"
        ? cardSortCost(left.card) - cardSortCost(right.card)
        : cardRarityRank(left.card) - cardRarityRank(right.card);
      const secondary = deckEditorSort === "cost"
        ? cardRarityRank(left.card) - cardRarityRank(right.card)
        : cardSortCost(left.card) - cardSortCost(right.card);
      return primary || secondary || left.card.name.localeCompare(right.card.name, "ko");
    });
    const inventoryCardGroups = groupAndSortCards(inventoryCards);
    const floorCardGroups = groupAndSortCards(currentFloorCards);
    const removedInventoryCardGroups = groupAndSortCards(
      pendingRemovedCards.filter((card) => pendingRemovedCardAreas[card.id] === "inventory"),
    );
    const removedFloorCardGroups = groupAndSortCards(
      pendingRemovedCards.filter((card) => pendingRemovedCardAreas[card.id] !== "inventory"),
    );
    const deckViewerCards = [...(viewedDeck?.cards ?? [])].sort((left, right) => {
      const primary = deckViewerSort === "cost"
        ? cardSortCost(left) - cardSortCost(right)
        : cardRarityRank(left) - cardRarityRank(right);
      const secondary = deckViewerSort === "cost"
        ? cardRarityRank(left) - cardRarityRank(right)
        : cardSortCost(left) - cardSortCost(right);
      return primary || secondary || left.name.localeCompare(right.name, "ko");
    });
    const floorItemNames = [
      ...currentFloorCards.map((card) => card.name),
      ...currentFloorConsumables.map((consumable) => consumable.name),
      ...currentFloorDecks.map((deck) => `덱 '${deck.name}'`),
    ];
    const quickPickUpFirstCard = currentFloorCards[0];
    const quickPickUpFirstName = floorItemNames[0] ?? "물건";
    const activeShopOffers = activeShopRoom ? roomShops[activeShopRoom] ?? [] : [];
    const shrinePendingCards = shrineDeck?.cards.filter((card) => shrinePendingCardIds.includes(card.id)) ?? [];
    const knownRoomRoutes = buildKnownRoomRoutes(mapPosition, seenRooms, mapSeed, effectiveRoomType);
    const mapWidth = MAP_PADDING * 2
      + MAP_RENDER_COLUMNS * MAP_ROOM_WIDTH
      + (MAP_RENDER_COLUMNS - 1) * MAP_CELL_GAP;
    const mapHeight = MAP_PADDING * 2
      + MAP_RENDER_ROWS * MAP_ROOM_HEIGHT
      + (MAP_RENDER_ROWS - 1) * MAP_CELL_GAP;
    const debugViewportWidth = 1200;
    const debugViewportHeight = 620;
    const mapStrideX = MAP_ROOM_WIDTH + MAP_CELL_GAP;
    const mapStrideY = MAP_ROOM_HEIGHT + MAP_CELL_GAP;
    const debugMinX = Math.max(
      DUNGEON_MIN_X,
      DUNGEON_MIN_X - MAP_WORLD_MARGIN_X
        + Math.floor((-mapPan.x / mapZoom - MAP_PADDING) / mapStrideX) - 2,
    );
    const debugMaxX = Math.min(
      DUNGEON_MAX_X,
      DUNGEON_MIN_X - MAP_WORLD_MARGIN_X
        + Math.ceil(((debugViewportWidth - mapPan.x) / mapZoom - MAP_PADDING) / mapStrideX) + 2,
    );
    const debugMinY = Math.max(
      0,
      Math.floor((-mapPan.y / mapZoom - MAP_PADDING) / mapStrideY) - MAP_WORLD_MARGIN_Y - 2,
    );
    const debugMaxY = Math.min(
      MAP_ROWS - 1,
      Math.ceil(((debugViewportHeight - mapPan.y) / mapZoom - MAP_PADDING) / mapStrideY)
        - MAP_WORLD_MARGIN_Y + 2,
    );
    const mapCellMap = new Map<string, MapPosition>();
    const currentSafeRegion = getSafeAreaRegionIndex(mapPosition);
    const currentVisibleRoomKeys = currentSafeRegion === null
      ? visibleMapRoomKeys(mapPosition, mapSeed, visionHorizontalRadius, visionVerticalRadius)
      : new Set<string>();
    if (currentSafeRegion !== null) {
      const centerY = safeAreaCenterY(currentSafeRegion);
      for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
        for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
          if (Math.abs(offsetX) === 2 && Math.abs(offsetY) === 2) continue;
          const position = { x: SAFE_AREA_HEAL_X + offsetX, y: centerY + offsetY };
          const roomKey = mapRoomKey(position);
          mapCellMap.set(roomKey, position);
          currentVisibleRoomKeys.add(roomKey);
        }
      }
    } else {
      seenRooms.forEach((seenRoomKey) => {
        const position = parseMapRoomKey(seenRoomKey);
        mapCellMap.set(seenRoomKey, position);
      });
      currentVisibleRoomKeys.forEach((roomKey) => {
        mapCellMap.set(roomKey, parseMapRoomKey(roomKey));
      });
      if (debugMode) {
        for (let y = debugMinY; y <= debugMaxY; y += 1) {
          for (let x = debugMinX; x <= debugMaxX; x += 1) {
            const position = { x, y };
            if (getRoomType(position, mapSeed) !== "void") {
              mapCellMap.set(mapRoomKey(position), position);
            }
          }
        }
      }
      for (const [roomKey, position] of mapCellMap) {
        const safeLayoutRegion = getSafeAreaLayoutRegionIndex(position);
        if (
          safeLayoutRegion !== null
          && distanceToSafeArea(mapPosition, safeLayoutRegion) > SAFE_AREA_REVEAL_RADIUS
        ) mapCellMap.delete(roomKey);
      }
    }
    const mapCells = Array.from(mapCellMap.values());
    const renderedMapCellKeys = new Set(mapCells.map(mapRoomKey));
    const visibleMapEnemies = mapEnemyWorld.enemies.filter((enemy) =>
      renderedMapCellKeys.has(mapRoomKey(enemy.position))
      && (debugMode || currentVisibleRoomKeys.has(mapRoomKey(enemy.position))));
    const rememberedEnemyCells = debugMode
      ? []
      : Object.entries(mapEnemyCellMemory)
        .filter(([roomKey]) => {
          if (!renderedMapCellKeys.has(roomKey)) return false;
          return !currentVisibleRoomKeys.has(roomKey);
        })
        .map(([roomKey, memory]) => ({ roomKey, position: parseMapRoomKey(roomKey), ...memory }));
    const playerMapCanvasX = MAP_PADDING
      + (mapPosition.x - DUNGEON_MIN_X + MAP_WORLD_MARGIN_X) * (MAP_ROOM_WIDTH + MAP_CELL_GAP)
      + MAP_ROOM_WIDTH / 2;
    const playerMapCanvasY = MAP_PADDING
      + (mapPosition.y + MAP_WORLD_MARGIN_Y) * (MAP_ROOM_HEIGHT + MAP_CELL_GAP)
      + MAP_ROOM_HEIGHT / 2;
    const playerViewportX = mapPan.x + playerMapCanvasX * mapZoom;
    const playerViewportY = mapPan.y + playerMapCanvasY * mapZoom;
    const playerVisibleInViewport = mapViewportSize.width > 0 && mapViewportSize.height > 0
      && playerViewportX >= 0
      && playerViewportX <= mapViewportSize.width
      && playerViewportY >= 0
      && playerViewportY <= mapViewportSize.height;
    const edgeInset = 20;
    const viewportCenterX = mapViewportSize.width / 2;
    const viewportCenterY = mapViewportSize.height / 2;
    const edgeDx = playerViewportX - viewportCenterX;
    const edgeDy = playerViewportY - viewportCenterY;
    const edgeHalfWidth = Math.max(1, viewportCenterX - edgeInset);
    const edgeHalfHeight = Math.max(1, viewportCenterY - edgeInset);
    const edgeScale = Math.max(1, Math.abs(edgeDx) / edgeHalfWidth, Math.abs(edgeDy) / edgeHalfHeight);
    const edgeIndicatorX = viewportCenterX + edgeDx / edgeScale;
    const edgeIndicatorY = viewportCenterY + edgeDy / edgeScale;
    const edgeIndicatorAngle = Math.atan2(edgeDy, edgeDx) * 180 / Math.PI;
    const battleDeckPreview = ownedDecks.find((deck) => deck.id === battleDeckPreviewId) ?? activeDeck;
    const battleDeckPreviewGroups = battleDeckPreview ? groupAndSortCards(battleDeckPreview.cards) : [];
    const cardKeywordPopover = hoveredCardKeywords && (
      <aside
        className="card-keyword-popover"
        ref={cardKeywordPopoverRef}
        style={{ left: hoveredCardKeywords.x, top: hoveredCardKeywords.y }}
        role="tooltip"
        aria-label={`${hoveredCardKeywords.card.name} 키워드 설명`}
      >
        {getCardKeywordInfos(hoveredCardKeywords.card).map((keyword) => (
          <section key={keyword.name}>
            <strong>{keyword.name}</strong>
            <p>{keyword.description}</p>
          </section>
        ))}
      </aside>
    );

    return (
      <main
        className={`game-shell map-shell card-style-simple watermark-${cardWatermarkStyle} ${constellationPreviewIndex === null ? "" : "is-previewing-constellation"}`}
        style={cardWatermarkVariables}
      >
        <span className="game-version" aria-label={`게임 버전 ${GAME_VERSION}`}>{GAME_VERSION}</span>
        {playerNameSetupOpen && (
          <div className="player-name-overlay" role="dialog" aria-modal="true" aria-labelledby="player-name-title">
            <form
              className="player-name-dialog"
              onSubmit={(event) => {
                event.preventDefault();
                if (!playerName.trim()) return;
                setPlayerName(playerName.trim());
                setOwnedDecks((current) => current.map((deck) => deck.id === "starter" && !deck.name
                  ? { ...deck, name: createDeckName() }
                  : deck));
                setPlayerNameSetupOpen(false);
              }}
            >
              <p>새 탐험</p>
              <h2 id="player-name-title">이름을 정하세요</h2>
              <input
                autoFocus
                value={playerName}
                maxLength={16}
                onChange={(event) => setPlayerName(event.target.value)}
                aria-label="플레이어 이름"
              />
              <button
                type="button"
                className="player-name-reroll"
                onClick={() => setPlayerName(createRandomPlayerName())}
              >
                ↻ 랜덤 이름 리롤
              </button>
              <button type="submit" disabled={!playerName.trim()}>탐험 시작</button>
            </form>
          </div>
        )}
        {pendingBattleStart && (
          <div className="battle-deck-check-overlay" role="dialog" aria-modal="true" aria-labelledby="battle-deck-check-title">
            <section className="battle-deck-check-panel">
              <h2 id="battle-deck-check-title">잠깐! 올바른 덱을 선택하셨나요?</h2>
              <span>이번 전투에서 사용할 덱을 선택하세요.</span>
              <div className="battle-deck-check-options">
                {ownedDecks.map((deck) => (
                  <button
                    type="button"
                    key={`battle-deck-check-${deck.id}`}
                    className={deck.id === battleDeckPreview?.id ? "is-selected" : ""}
                    onClick={() => setBattleDeckPreviewId(deck.id)}
                  >
                    <strong><DeckName deck={deck} /></strong>
                    <small>{deck.cards.length} / {deck.capacity}</small>
                  </button>
                ))}
              </div>
              {battleDeckPreview && (
                <div className="battle-deck-check-composition">
                  <h3><DeckName deck={battleDeckPreview} showEditions={false} /> 구성</h3>
                  <div className="battle-deck-check-cards">
                    {battleDeckPreviewGroups.map(({ card, cardIds }) => (
                      <div
                        className={`deck-editor-card rarity-${card.rarity} ${card.enemyToken ? "rarity-enemy-token" : ""} ${card.rarity === "legendary" ? "is-painted" : ""}`}
                        key={`${card.id}-${card.name}`}
                        style={deckEditorCardStackStyle(cardIds.length)}
                      >
                        <DeckEditorCardIcon card={card} count={cardIds.length} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                className="battle-deck-check-confirm"
                disabled={!battleDeckPreview}
                onClick={() => battleDeckPreview && confirmBattleDeck(battleDeckPreview.id)}
              >
                이 덱으로 전투 시작
              </button>
            </section>
          </div>
        )}
        {cardKeywordPopover}
        <header className="topbar map-topbar">
          <div className="map-top-actions">
            <div className="map-run-stats">
              <div
                className="healthbar map-health"
                aria-label={`체력 ${runPlayerHp} 중 ${maxPlayerHp}`}
                style={{ "--map-health-width": `${165 * Math.min(2, Math.max(1, maxPlayerHp / MAX_PLAYER_HP))}px` } as CSSProperties}
              >
                <i style={{ width: `${(runPlayerHp / maxPlayerHp) * 100}%` }} />
                <span>{runPlayerHp} / {maxPlayerHp}</span>
              </div>
              {mindEyeMovesRemaining > 0 && <div className="map-mind-eye" aria-label={`심안 시야 ${mindEyeMovesRemaining}회 남음`}>심안 9×9 · {mindEyeMovesRemaining}</div>}
              <button
                type="button"
                className="map-gold map-gold-debug-trigger"
                onClick={handleGoldDebugClick}
                aria-label={`골드 ${gold}`}
              >
                <strong>$ {gold}</strong>
              </button>
            </div>
            <button
              type="button"
              className="deck-viewer-trigger"
              onClick={() => {
                setDeckViewerDeckId(activeDeck?.id ?? "");
                setDeckViewerOpen(true);
              }}
              aria-label={`덱 보기, 현재 ${deckCards.length}장`}
            >
              <span className="deck-stack-icon" aria-hidden="true" />
              <span>덱 보기</span>
            </button>
            <button
              type="button"
              className="map-wait-trigger"
              onClick={waitOnMap}
              disabled={mapTraveling}
              aria-label="한 턴 쉬기: 현재 칸에 머물며 적만 행동하게 합니다"
            >
              한 턴 쉼 (5)
            </button>
            {canEditDeck && (
              <button
                type="button"
                className="deck-editor-trigger"
                onClick={() => openDeckEditor(inSafeArea
                  ? "덱 카드를 인벤토리로 회수할 수 있습니다. 희귀도에 따라 골드를 냅니다."
                  : "좌클릭: 바닥 → 인벤토리 → 덱. 덱 카드는 우클릭하거나 인벤토리로 드래그해 골드로 회수합니다.")}
                aria-label={`덱 편집, 현재 ${deckCards.length}장`}
              >
                <span className="deck-stack-icon" aria-hidden="true" />
                <span>덱 편집 (I)</span>
              </button>
            )}
          </div>
        </header>
        {blessings.length > 0 && (
          <aside className="map-blessing-list" aria-label="획득한 축복">
            {blessings.map((blessing) => blessing === "athlete" ? (
              <button type="button" key={blessing} className={athletePrepared ? "is-prepared" : ""} onClick={activateAthlete} disabled={athleteCooldown > 0}>
                <strong>운동선수</strong>
                <small>{athleteCooldown > 0 ? `쿨타임 ${athleteCooldown}턴` : athletePrepared ? "준비됨 · 다음 이동 무료" : "눌러서 다음 이동 무료"}</small>
              </button>
            ) : <span key={blessing}>{BLESSING_INFO[blessing].name}</span>)}
          </aside>
        )}

        <section className="map-board" aria-label="탐험 지도">
          {debugMode && (
            <div className="map-toolbar">
              <div className="debug-spawn-controls">
                <select
                  aria-label="바닥에 생성할 아이템"
                  value={debugSpawnSelection}
                  onChange={(event) => setDebugSpawnSelection(event.target.value)}
                >
                  {DEBUG_CARD_RARITIES.map(({ rarity, label }) => {
                    const cards = ALL_CARD_BLUEPRINTS.filter((card) => card.rarity === rarity);
                    return (
                      <optgroup label={label} key={rarity}>
                        {cards.map((card, index) => (
                          <option key={`${rarity}-${card.effect}-${index}`} value={`card:${rarity}:${index}`}>
                            {card.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                  <optgroup label="기타 카드">
                    <option value="card:adrenaline">{createAdrenalineCard().name}</option>
                  </optgroup>
                  <optgroup label="티켓">
                    {CONSUMABLE_TYPES.map((type) => (
                      <option key={type} value={`consumable:${type}`}>
                        {createConsumable(type, `debug-preview-${type}`).name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="덱">
                    <option value="deck:random">현재 지역 티어 무작위 덱</option>
                  </optgroup>
                </select>
                <button type="button" onClick={spawnDebugItemOnFloor}>
                  바닥에 생성
                </button>
              </div>
              <button type="button" className="debug-card-stats-trigger" onClick={() => setCardPoolStatsOpen(true)}>
                카드 풀 통계
              </button>
              <DebugEnemyCodex />
            </div>
          )}

          <div
            className="map-viewport"
            ref={mapViewportRef}
            onPointerDown={beginMapDrag}
            onPointerMove={moveMapDrag}
            onPointerUp={finishMapDrag}
            onPointerCancel={finishMapDrag}
            onPointerLeave={finishMapDrag}
            onWheel={zoomMap}
          >
            <div
              className={`map-canvas ${mapTraveling ? "is-traveling" : ""} ${mapCameraFocusing ? "is-camera-focusing" : ""}`}
              style={{
                width: mapWidth,
                height: mapHeight,
                padding: MAP_PADDING,
                gap: MAP_CELL_GAP,
                gridTemplateColumns: `repeat(${MAP_RENDER_COLUMNS}, ${MAP_ROOM_WIDTH}px)`,
                gridAutoRows: `${MAP_ROOM_HEIGHT}px`,
                transform: `translate3d(${mapPan.x}px, ${mapPan.y}px, 0) scale(${mapZoom})`,
                transformOrigin: "0 0",
                "--map-travel-step": `${mapTravelStepMs}ms`,
              } as CSSProperties}
            >
              {mapCells.map((position) => {
                const roomKey = mapRoomKey(position);
                const roomType = effectiveRoomType(position);
                const dungeonRegionIndex = getDungeonRegionIndex(position);
                const current = position.x === mapPosition.x && position.y === mapPosition.y;
                const inVision = debugMode || currentVisibleRoomKeys.has(roomKey);
                const distance = chebyshevDistance(position, mapPosition);
                const walkable = isWalkableRoom(roomType);
                const adjacent = distance === 1 && walkable;
                const reachable = !current && (debugMode ? walkable : knownRoomRoutes.has(roomKey));
                const hasItems = (roomDrops[roomKey]?.length ?? 0) > 0
                  || (roomConsumableDrops[roomKey]?.length ?? 0) > 0
                  || (roomDeckDrops[roomKey]?.length ?? 0) > 0;
                const roomState = roomType === "rock" || roomType === "void"
                  ? roomType
                  : roomType;
                const roomLabel = current
                  ? "현재 위치"
                  : roomType === "rock"
                    ? "단단한 바위"
                    : roomType === "void"
                      ? "먼 공간"
                      : roomType === "shop"
                        ? "상점"
                        : roomType === "shrine"
                        ? "추출의 성소"
                        : roomType === "campfire"
                          ? "모닥불"
                        : roomType === "blessing"
                        ? "축복"
                        : roomType === "portal"
                          ? "안전 지역 포탈"
                          : roomType === "heal"
                            ? "회복 노드"
                            : roomType === "safePortal"
                              ? "다음 지역 포탈"
                        : "방";
                return (
                  <button
                    type="button"
                    className={`map-room is-${roomState} ${dungeonRegionIndex === null ? "" : `is-region-${dungeonRegionIndex + 1}`} ${current ? "is-current" : ""} ${inVision ? "is-in-vision" : "is-out-of-vision"} ${adjacent ? "is-adjacent" : ""} ${reachable ? "is-reachable" : ""}`}
                    key={roomKey}
                    style={{
                      gridColumn: position.x - DUNGEON_MIN_X + MAP_WORLD_MARGIN_X + 1,
                      gridRow: position.y + MAP_WORLD_MARGIN_Y + 1,
                    }}
                    tabIndex={adjacent || reachable ? 0 : -1}
                    aria-disabled={!walkable || mapTraveling || (!adjacent && !reachable)}
                    aria-label={`${roomLabel}, 좌표 ${position.x + 1}, 깊이 ${position.y}`}
                    onClick={() => {
                      if (mapWasDraggedRef.current) {
                        mapWasDraggedRef.current = false;
                        return;
                      }
                      if (mapTraveling) return;
                      setMapMessage("");
                      if (debugMode && walkable && !current) {
                        if (adjacent) {
                          moveOnMap(position.x - mapPosition.x, position.y - mapPosition.y);
                          return;
                        }
                        setMapPosition(position);
                        rememberPlayerVision(position);
                        focusMapOn(position);
                        activateRoomFeature(position);
                        return;
                      }
                      if (adjacent) {
                        moveOnMap(position.x - mapPosition.x, position.y - mapPosition.y);
                        return;
                      }
                      const safePath = routeToRoom(position, knownRoomRoutes);
                      if (safePath && safePath.length > 1) {
                        travelSafePath(safePath);
                        return;
                      }
                    }}
                  >
                    {roomType === "shop"
                          ? <span>상점</span>
                          : roomType === "shrine"
                            ? <span>추출의 성소</span>
                          : roomType === "campfire"
                            ? <span>모닥불</span>
                          : roomType === "blessing"
                          ? <span>축복</span>
                          : roomType === "portal"
                            ? <span>포탈</span>
                            : roomType === "heal"
                              ? <span>회복</span>
                              : roomType === "safePortal"
                                ? <span>포탈</span>
                        : null}
                    {roomType === "rock" && <span className="rock-label">단단한 돌</span>}
                    {hasItems && <span className="room-item-indicator" aria-label="아이템 있음" />}
                  </button>
                );
              })}
              {mapBombs.filter((bomb) => renderedMapCellKeys.has(mapRoomKey(bomb.position))).map((bomb) => (
                <span
                  className="map-bomb"
                  key={bomb.id}
                  style={{
                    left: MAP_PADDING + (bomb.position.x - DUNGEON_MIN_X + MAP_WORLD_MARGIN_X) * (MAP_ROOM_WIDTH + MAP_CELL_GAP) + MAP_ROOM_WIDTH / 2,
                    top: MAP_PADDING + (bomb.position.y + MAP_WORLD_MARGIN_Y) * (MAP_ROOM_HEIGHT + MAP_CELL_GAP) + MAP_ROOM_HEIGHT / 2,
                  }}
                  title={`${bomb.movesRemaining}번 이동 후 폭발`}
                  aria-label={`폭탄, ${bomb.movesRemaining}번 이동 후 폭발`}
                >
                  <strong>●</strong>
                  <small>{bomb.movesRemaining}</small>
                </span>
              ))}
              {rememberedEnemyCells.map((memory) => (
                <span
                  className={`map-enemy is-memory ${isHigherRegionMapEnemy(memory.encounterIndex, memory.position) ? "is-overlevel" : ""}`}
                  key={`memory-${memory.roomKey}`}
                  style={{
                    left: MAP_PADDING + (memory.position.x - DUNGEON_MIN_X + MAP_WORLD_MARGIN_X) * (MAP_ROOM_WIDTH + MAP_CELL_GAP) + MAP_ROOM_WIDTH / 2,
                    top: MAP_PADDING + (memory.position.y + MAP_WORLD_MARGIN_Y) * (MAP_ROOM_HEIGHT + MAP_CELL_GAP) + MAP_ROOM_HEIGHT / 2,
                  }}
                  title={`${getSewerEncounterLabel(memory.encounterIndex)} · 마지막 목격 위치`}
                  aria-label={`${getSewerEncounterLabel(memory.encounterIndex)}, 마지막 목격 위치`}
                >
                  <strong>{awarenessSymbol(memory.awareness)}</strong>
                  <small>{getSewerEncounterLabel(memory.encounterIndex)}</small>
                </span>
              ))}
              {visibleMapEnemies.map((enemy) => (
                <span
                  className={`map-enemy is-${enemy.awareness} ${isHigherRegionMapEnemy(enemy.encounterIndex, enemy.position) ? "is-overlevel" : ""} ${mapCollisionEnemyIds.includes(enemy.id) ? "is-colliding" : ""}`}
                  key={enemy.id}
                  style={{
                    left: MAP_PADDING + (enemy.position.x - DUNGEON_MIN_X + MAP_WORLD_MARGIN_X) * (MAP_ROOM_WIDTH + MAP_CELL_GAP) + MAP_ROOM_WIDTH / 2,
                    top: MAP_PADDING + (enemy.position.y + MAP_WORLD_MARGIN_Y) * (MAP_ROOM_HEIGHT + MAP_CELL_GAP) + MAP_ROOM_HEIGHT / 2,
                  }}
                  title={`${getSewerEncounterLabel(enemy.encounterIndex)} · ${awarenessSymbol(enemy.awareness)}`}
                  aria-label={`${getSewerEncounterLabel(enemy.encounterIndex)}, 상태 ${awarenessSymbol(enemy.awareness)}`}
                >
                  <strong>{awarenessSymbol(enemy.awareness)}</strong>
                  <small>{getSewerEncounterLabel(enemy.encounterIndex)}</small>
                </span>
              ))}
              {mapBattleFlash && (
                <span
                  className="map-battle-flash"
                  style={{
                    left: MAP_PADDING + (mapPosition.x - DUNGEON_MIN_X + MAP_WORLD_MARGIN_X) * (MAP_ROOM_WIDTH + MAP_CELL_GAP) + MAP_ROOM_WIDTH / 2,
                    top: MAP_PADDING + (mapPosition.y + MAP_WORLD_MARGIN_Y) * (MAP_ROOM_HEIGHT + MAP_CELL_GAP) + MAP_ROOM_HEIGHT / 2,
                  }}
                  aria-live="assertive"
                >전투!</span>
              )}
              <span
                className="map-player map-player-marker"
                style={{
                  left: MAP_PADDING + (mapPosition.x - DUNGEON_MIN_X + MAP_WORLD_MARGIN_X) * (MAP_ROOM_WIDTH + MAP_CELL_GAP) + MAP_ROOM_WIDTH / 2,
                  top: MAP_PADDING + (mapPosition.y + MAP_WORLD_MARGIN_Y) * (MAP_ROOM_HEIGHT + MAP_CELL_GAP) + MAP_ROOM_HEIGHT / 2,
                }}
                aria-hidden="true"
              >@</span>
            </div>
            <div className="map-depth-fade" aria-hidden="true" />
            {!playerVisibleInViewport && mapViewportSize.width > 0 && mapViewportSize.height > 0 && (
              <span
                className="map-player-edge-indicator"
                style={{
                  left: edgeIndicatorX,
                  top: edgeIndicatorY,
                  transform: `translate(-50%, -50%) rotate(${edgeIndicatorAngle}deg)`,
                }}
                aria-label="현재 위치 방향"
              >➤</span>
            )}
          </div>
          {cardPoolStatsOpen && (
            <div
              className="card-pool-stats-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="card-pool-stats-title"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setCardPoolStatsOpen(false);
                  setCardPoolStatHover(null);
                }
              }}
            >
              <section className="card-pool-stats-panel" onMouseDown={(event) => event.stopPropagation()}>
                <header>
                  <div>
                    <p>DEBUG · CARD POOL</p>
                    <h2 id="card-pool-stats-title">카드 풀 통계</h2>
                    <span>대상 {cardPoolStatsTotal}장 · 적 토큰 제외</span>
                  </div>
                  <button type="button" onClick={() => { setCardPoolStatsOpen(false); setCardPoolStatHover(null); }}>닫기</button>
                </header>
                <div className="card-pool-stats-grid">
                  {[
                    { title: "희귀도", rows: cardPoolRarityStats },
                    { title: "카드 유형", rows: cardPoolKindStats },
                    { title: "코스트", rows: cardPoolCostStats },
                    { title: "키워드·기능", rows: cardPoolKeywordStats },
                  ].map(({ title, rows }) => (
                    <section className="card-pool-stat-group" key={title}>
                      <h3>{title}</h3>
                      <ul>
                        {rows.map(({ label, cards }) => {
                          const count = cards.length;
                          const percent = cardPoolStatsTotal === 0 ? 0 : count / cardPoolStatsTotal * 100;
                          return (
                            <li
                              key={label}
                              tabIndex={0}
                              onMouseEnter={(event) => showCardPoolStatHover(event, label, cards)}
                              onMouseMove={(event) => showCardPoolStatHover(event, label, cards)}
                              onMouseLeave={() => setCardPoolStatHover(null)}
                              onFocus={(event) => {
                                const bounds = event.currentTarget.getBoundingClientRect();
                                setCardPoolStatHover({ label, cards: sortCardPoolHoverCards(cards), x: bounds.right + 16, y: bounds.top });
                              }}
                              onBlur={() => setCardPoolStatHover(null)}
                            >
                              <span>
                                <strong>{label}</strong>
                                <small>{count}장 · {cardPoolShare(count, cardPoolStatsTotal)}</small>
                              </span>
                              <i style={{ width: `${percent}%` }} aria-hidden="true" />
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              </section>
              {cardPoolStatHover && (
                <aside
                  className="card-pool-stat-popover"
                  role="tooltip"
                  aria-label={`${cardPoolStatHover.label} 카드 목록`}
                  style={{ left: cardPoolStatHover.x, top: cardPoolStatHover.y }}
                >
                  <strong>{cardPoolStatHover.label}</strong>
                  <div className="card-pool-stat-popover-cards">
                    {cardPoolStatHover.cards.map((card, index) => (
                      <span
                        className={`deck-editor-card rarity-${card.rarity} ${card.enemyToken ? "rarity-enemy-token" : ""} ${card.rarity === "legendary" ? "is-painted" : ""}`}
                        key={`${card.name}-${card.effect}-${index}`}
                      >
                        <DeckEditorCardIcon card={card} />
                      </span>
                    ))}
                  </div>
                </aside>
              )}
            </div>
          )}
          <div className={`map-deck-selector ${hasRoomActionNotice ? "is-notice-visible" : ""}`}>
            <div onPointerDown={(event) => event.stopPropagation()}>
              {deckSelectorOpen && (
                <div className={`map-deck-selector-menu ${deckSelectorClosing ? "is-closing" : "is-opening"}`} role="menu" aria-label="전투에 사용할 덱">
                  {Array.from({ length: 3 }, (_, index) => {
                    const deck = ownedDecks[index];
                    if (!deck) {
                      return <span className="map-deck-empty-slot" key={`empty-deck-${index}`} style={{ "--deck-offset": index - 1, "--deck-arc-inset": Math.abs(index - 1) } as CSSProperties}>빈 덱 슬롯</span>;
                    }
                    return (
                      <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={deck.id === activeDeck?.id}
                      className={`${deck.id === activeDeck?.id ? "is-selected" : ""} ${deckSelectorClosingDeckId === deck.id ? "is-picked" : ""}`}
                      key={deck.id}
                      style={{ "--deck-offset": index - 1, "--deck-arc-inset": Math.abs(index - 1) } as CSSProperties}
                      onClick={() => {
                        setActiveDeckId(deck.id);
                        closeDeckSelector(deck.id);
                      }}
                    >
                      <strong><DeckName deck={deck} showEditions={false} /></strong>
                      <small>{deck.cards.length} / {deck.capacity}</small>
                    </button>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                className={`map-deck-selector-trigger ${deckSelectorOpen && !deckSelectorClosing ? "is-open" : ""}`}
                onClick={() => {
                  setDeckSelectionAttention(false);
                  toggleDeckSelector();
                }}
                aria-expanded={deckSelectorOpen && !deckSelectorClosing}
                aria-label={`전투 덱 선택. 현재 ${activeDeck?.name ?? "없음"}`}
              >
                <span className="deck-stack-icon" aria-hidden="true" />
                <strong>{activeDeck?.name ? `덱 '${activeDeck.name}'` : "덱 준비 중"}</strong>
                <small>({deckCards.length}/{activeDeck?.capacity ?? 0})</small>
              </button>
              {deckSelectionAttention && <span className="map-deck-selector-attention" aria-label="덱 편집 후 전투 덱을 확인하세요">!</span>}
            </div>
          </div>
          <div className="room-action-notices">
            {mapMessage && !deckEditorOpen && <p key={mapMessageNonce} className="map-message" role="status" aria-live="polite">{mapMessage}</p>}
            {currentRoomType === "shop" && (
              <button
                type="button"
                className="room-floor-notice room-action-notice is-shop simple-room-action-notice"
                onClick={() => openShop(mapRoomKey(mapPosition), (getDungeonRegionIndex(mapPosition) ?? 0) + 1)}
              >
                <strong>상점 들어가기</strong>
              </button>
            )}
            {currentRoomType === "shrine" && (
              <button
                type="button"
                className="room-floor-notice room-action-notice is-shrine simple-room-action-notice"
                onClick={openShrine}
              >
                <strong>추출의 성소 이용하기</strong>
                <small>카드 최대 2장 추출 · 사용 후 붕괴</small>
              </button>
            )}
            {currentRoomType === "campfire" && (
              <button
                type="button"
                className="room-floor-notice room-action-notice is-shrine simple-room-action-notice"
                onClick={useCurrentCampfire}
              >
                <strong>모닥불 이용하기</strong>
                <small>체력 10 회복 · 사용 후 붕괴</small>
              </button>
            )}
            {currentRoomType === "blessing" && (
              <button
                type="button"
                className="room-floor-notice room-action-notice is-shop simple-room-action-notice"
                onClick={openBlessings}
              >
                <strong>축복 받기</strong>
              </button>
            )}
            {(currentRoomType === "portal" || currentRoomType === "safePortal") && (
              <button
                type="button"
                className="room-floor-notice room-action-notice is-portal simple-room-action-notice"
                onClick={useCurrentPortal}
              >
                <strong>포탈 이용하기</strong>
              </button>
            )}
            {currentRoomType === "heal" && (
              <button
                type="button"
                className="room-floor-notice room-action-notice simple-room-action-notice"
                onClick={useCurrentHeal}
              >
                <strong>회복하기</strong>
              </button>
            )}
            {(currentFloorCards.length > 0 || currentFloorConsumables.length > 0 || currentFloorDecks.length > 0) && canEditDeck && (
              <button
                type="button"
                className="room-floor-notice quick-pickup-notice"
                onClick={quickPickUpFloorItems}
              >
                <strong>
                  {quickPickUpFirstCard
                    ? <span className={`quick-pickup-card rarity-${quickPickUpFirstCard.rarity}`}>{quickPickUpFirstName}</span>
                    : quickPickUpFirstName}
                  {floorItemNames.length === 1
                    ? " 줍기"
                    : ` 외 떨어진 물건 ${floorItemNames.length - 1}개 줍기`}
                  {" (G)"}
                </strong>
              </button>
            )}
          </div>
        </section>

        {shrineOpen && (
          <div className="shop-overlay shrine-overlay" role="dialog" aria-modal="true" aria-labelledby="shrine-title">
            <section className="shop-panel shrine-panel">
              <header>
                <div>
                  <p>EXTRACTION SHRINE</p>
                  <h2 id="shrine-title">추출의 성소</h2>
                  <span>선택한 덱에서 카드를 최대 2장 영구적으로 추출합니다. 사용하면 추출의 성소는 붕괴합니다.</span>
                </div>
                <div className="shop-header-status">
                  <button type="button" onClick={() => setShrineOpen(false)}>나가기</button>
                </div>
              </header>
              {shrineResult ? (
                <div className="shrine-result is-collapsed">
                  <span className="shrine-result-symbol" aria-hidden="true">✦</span>
                  <p>추출 완료</p>
                  <h3>추출의 성소가 붕괴했습니다</h3>
                  <div className="shrine-result-cards">
                    {shrineResult.cards.map((card) => (
                      <div className={`shrine-result-card card-face ${card.kind} ${card.damageType}`} key={`shrine-result-${card.id}`}>
                        <CardFace card={card} />
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => setShrineOpen(false)}>확인</button>
                </div>
              ) : (
                <div className="shrine-transfer">
                  <section
                    className="shrine-deck-column"
                    aria-label={`${shrineDeck?.name ?? "선택한 덱"} 카드`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const payload = event.dataTransfer.getData("text/plain");
                      if (payload.startsWith("shrine-pending:")) {
                        const cardId = Number(payload.slice("shrine-pending:".length));
                        setShrinePendingCardIds((current) => current.filter((id) => id !== cardId));
                      }
                    }}
                  >
                    <nav className="shrine-deck-tabs" aria-label="추출할 덱 선택">
                      {ownedDecks.map((deck) => (
                        <button
                          type="button"
                          className={deck.id === shrineDeck?.id ? "is-active" : ""}
                          key={`shrine-deck-${deck.id}`}
                          onClick={() => {
                            setShrineDeckId(deck.id);
                            setShrineDraggedCardId(null);
                            setShrinePendingCardIds([]);
                            setShrineDropActive(false);
                          }}
                        >
                          {`덱 '${deck.name}'`}
                        </button>
                      ))}
                    </nav>
                    <header>
                      <strong>{`덱 '${shrineDeck?.name}'`}</strong>
                      <small>{shrineDeck?.cards.length ?? 0}장</small>
                    </header>
                    <div className="shrine-deck-cards">
                      {(shrineDeck?.cards ?? []).map((card) => (
                        <div
                          className={`shrine-deck-card card-face ${card.kind} ${card.damageType} ${shrineDraggedCardId === card.id ? "is-dragging" : ""} ${shrinePendingCardIds.includes(card.id) ? "is-selected" : ""}`}
                          key={`shrine-${card.id}`}
                          draggable={(shrineDeck?.cards.length ?? 0) > 1}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", String(card.id));
                            setShrineDraggedCardId(card.id);
                          }}
                          onDragEnd={() => {
                            setShrineDraggedCardId(null);
                            setShrineDropActive(false);
                          }}
                          onClick={() => setShrinePendingCardIds((current) => current.includes(card.id)
                            ? current.filter((id) => id !== card.id)
                            : current.length < 2 ? [...current, card.id] : current)}
                        >
                          <CardFace card={card} />
                        </div>
                      ))}
                    </div>
                  </section>
                  <div className="shrine-transfer-arrow">
                    <span className="shrine-arrow-icon" aria-hidden="true" />
                    <div className="shrine-collapse-live" role="status" aria-live="polite">
                      <span>선택</span>
                      <strong>{shrinePendingCards.length} / 2</strong>
                    </div>
                  </div>
                  <div className="shrine-extract-column">
                    <div
                      className={`shrine-extract-slot ${shrineDropActive ? "is-drop-active" : ""} ${shrinePendingCards.length > 0 ? "has-card" : ""}`}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setShrineDropActive(true);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setShrineDropActive(true);
                      }}
                      onDragLeave={() => setShrineDropActive(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        const transferredId = event.dataTransfer.getData("text/plain");
                        const cardId = transferredId ? Number(transferredId) : shrineDraggedCardId;
                        setShrineDropActive(false);
                        if (cardId !== null && Number.isFinite(cardId)) {
                          setShrinePendingCardIds((current) => current.includes(cardId) || current.length >= 2
                            ? current
                            : [...current, cardId]);
                        }
                      }}
                    >
                      {shrinePendingCards.map((card) => (
                        <div
                          className={`shrine-pending-card card-face ${card.kind} ${card.damageType}`}
                          key={`shrine-pending-${card.id}`}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", `shrine-pending:${card.id}`);
                          }}
                          onClick={() => setShrinePendingCardIds((current) => current.filter((id) => id !== card.id))}
                        >
                          <CardFace card={card} />
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="shrine-confirm-extract"
                      disabled={shrinePendingCards.length === 0}
                      onClick={extractCardsAtShrine}
                    >
                      {shrinePendingCards.length > 0 ? `${shrinePendingCards.length}장 추출` : "확정"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {blessingOpen && (
          <div className="shop-overlay blessing-overlay" role="dialog" aria-modal="true" aria-labelledby="blessing-title">
            <section className="shop-panel blessing-panel">
              <header>
                <div><h2 id="blessing-title">축복</h2></div>
                <div className="shop-header-status">
                  <strong>🪙 {gold}</strong>
                  <button type="button" onClick={() => setBlessingOpen(false)}>나가기</button>
                </div>
              </header>
              {blessingOffers.length > 0 ? (
                <div className="blessing-options">
                  {blessingOffers.map((blessing) => (
                    <button type="button" key={blessing} onClick={() => chooseBlessing(blessing)}>
                      <strong>{BLESSING_INFO[blessing].name}</strong>
                      <span>{BLESSING_INFO[blessing].description}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="blessing-empty">받을 수 있는 축복을 모두 얻었습니다.</p>}
              {blessingOffers.length > 0 && (
                <footer><button type="button" className="blessing-reroll" onClick={rerollBlessings} disabled={gold < blessingRerollCost}>🪙 {blessingRerollCost} 리롤</button></footer>
              )}
            </section>
          </div>
        )}

        {shopOpen && (
          <div className="shop-overlay" role="dialog" aria-modal="true" aria-labelledby="shop-title">
            <section className="shop-panel">
              <header>
                <div>
                  <h2 id="shop-title">여행 상점</h2>
                </div>
                <div className="shop-header-status">
                  <strong>🪙 {gold}</strong>
                  <button type="button" onClick={() => setShopOpen(false)}>나가기</button>
                </div>
              </header>
              <div className="shop-stock">
                {activeShopOffers.map((offer) => (
                  <button
                    type="button"
                    className={`shop-offer ${offer.sold ? "is-sold" : ""}`}
                    key={offer.id}
                    onClick={() => buyShopOffer(offer.id)}
                    disabled={offer.sold}
                  >
                    {offer.card ? (
                      <div
                        className={`shop-card card-face ${offer.card.kind} ${offer.card.damageType}`}
                        onMouseEnter={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          showCardKeywordOnly(offer.card!, bounds.right, bounds.top);
                        }}
                        onMouseMove={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          showCardKeywordOnly(offer.card!, bounds.right, bounds.top);
                        }}
                        onMouseLeave={() => { setHoveredDeckCard(null); clearCardKeywordHover(); }}
                      >
                        <CardFace card={offer.card} />
                      </div>
                    ) : offer.consumable ? (
                      <div
                        className={`consumable-ticket ${offer.consumable.type}`}
                        title={offer.consumable.description}
                        onMouseEnter={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          showConsumablePreview(offer.consumable!, bounds.right, bounds.top);
                        }}
                        onMouseMove={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          showConsumablePreview(offer.consumable!, bounds.right, bounds.top);
                        }}
                        onMouseLeave={() => setHoveredConsumable(null)}
                        onFocus={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          showConsumablePreview(offer.consumable!, bounds.right, bounds.top);
                        }}
                        onBlur={() => setHoveredConsumable(null)}
                      >
                        <strong>{offer.consumable.name}</strong>
                        <small>{offer.consumable.description}</small>
                      </div>
                    ) : null}
                    <span className="shop-price">{offer.sold ? "판매 완료" : `🪙 ${offer.price}`}</span>
                  </button>
                ))}
              </div>
            </section>
            {hoveredConsumable && !consumableDrag && (
              <aside
                className={`deck-consumable-preview-floating ${hoveredConsumable.type}`}
                style={{ left: deckPreviewPosition.x, top: deckPreviewPosition.y }}
                aria-live="polite"
              >
                <strong>{hoveredConsumable.name}</strong>
                <p>{hoveredConsumable.description}</p>
              </aside>
            )}
          </div>
        )}

        {deckEditorOpen && (
          <div className="deck-editor-overlay" role="dialog" aria-modal="true" aria-labelledby="deck-editor-title">
            <div className="deck-editor-stage">
              <section className="deck-editor-panel" onClick={(event) => event.stopPropagation()}>
              <header className="deck-editor-header">
                <div>
                  <h2 id="deck-editor-title">덱 편집</h2>
                </div>
                {deckEditorErrorMessage && <p className="deck-editor-message" role="status">{deckEditorErrorMessage}</p>}
                <div className="deck-editor-header-costs">
                  <div className="deck-editor-sort" aria-label="카드 정렬 방식">
                    <button type="button" className={deckEditorSort === "cost" ? "is-active" : ""} onClick={() => setDeckEditorSort("cost")}>코스트 순</button>
                    <button type="button" className={deckEditorSort === "rarity" ? "is-active" : ""} onClick={() => setDeckEditorSort("rarity")}>희귀도 순</button>
                  </div>
                </div>
              </header>

              <div className="deck-editor-columns">
                <section
                  className={`deck-editor-column inventory-column ${deckEditorDropTarget === "inventory" ? "is-drop-target" : ""}`}
                  onDragOver={(event) => {
                    const itemDrag = consumableDragRef.current ?? consumableDrag;
                    if (itemDrag?.source === "floor") {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      return;
                    }
                    const drag = deckEditorDragRef.current ?? deckEditorDrag;
                    const source = drag?.source;
                    if (source !== "floor" && source !== "pendingRemoval" && source !== "deck") return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDeckEditorDropTarget("inventory");
                  }}
                  onDrop={(event) => {
                    if ((consumableDragRef.current ?? consumableDrag)?.source === "floor") {
                      dropConsumable(event, "inventory");
                      return;
                    }
                    dropDeckEditorCard(event, "inventory");
                  }}
                >
                  <div className="deck-editor-column-title">
                    <h3>인벤토리</h3>
                    <strong className={deckEditorInventoryItemCount > inventoryCapacity ? "is-full" : ""}>
                      {deckEditorInventoryItemCount} / {inventoryCapacity}
                    </strong>
                  </div>
                  <div className="deck-editor-card-list" onWheel={scrollDeckEditorCardsHorizontally}>
                    {inventoryConsumables.map((consumable) => (
                      <button
                        type="button"
                        className={`consumable-ticket inventory-ticket ${consumable.type} ${pendingPaintTicketId === consumable.id || pendingCloneTicketId === consumable.id || pendingExtractTicketId === consumable.id || pendingTransformTicketId === consumable.id || consumable.armedMovesRemaining !== undefined ? "is-selected" : ""}`}
                        key={consumable.id}
                        draggable
                        onDragStart={(event) => beginConsumableDrag(event, consumable.id, "inventory")}
                        onDragEnd={finishConsumableDrag}
                        onMouseEnter={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          showConsumablePreview(consumable, bounds.right, bounds.top);
                        }}
                        onMouseMove={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          showConsumablePreview(consumable, bounds.right, bounds.top);
                        }}
                        onMouseLeave={() => setHoveredConsumable(null)}
                        onFocus={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          showConsumablePreview(consumable, bounds.right, bounds.top);
                        }}
                        onBlur={() => setHoveredConsumable(null)}
                        onClick={() => selectExtractionTicket(consumable)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          moveInventoryConsumableToFloor(consumable.id);
                        }}
                      >
                        <strong>{consumable.name}</strong>
                        <small>{consumable.description}</small>
                      </button>
                    ))}
                    {removedInventoryCardGroups.map(({ card, cardIds }) => (
                      <div
className={`deck-editor-card is-pending-removal ${pendingRemovalBlinkDim ? "is-blink-dim" : ""} rarity-${card.rarity} ${card.enemyToken ? "rarity-enemy-token" : ""} ${card.rarity === "legendary" ? "is-painted" : ""} ${deckEditorDrag?.cardId === cardIds.at(-1) ? "is-dragging" : ""}`}
                        key={`pending-removal-inventory-${cardIds.join("-")}`}
                        style={deckEditorCardStackStyle(cardIds.length)}
                        draggable
                        onDragStart={(event) => beginDeckEditorDrag(event, cardIds.at(-1)!, "pendingRemoval")}
                        onDragEnd={finishDeckEditorDrag}
                        onMouseEnter={(event) => moveDeckCardPreview(event, card)}
                        onMouseMove={(event) => moveDeckCardPreview(event, card)}
                        onMouseLeave={() => { setHoveredDeckCard(null); clearCardKeywordHover(); }}
                        aria-label={`${card.name} ${cardIds.length}장, 제거 예정`}
                      >
                        <DeckEditorCardIcon card={card} count={cardIds.length} showNewBadge={cardIds.some((id) => transformedCardNewIds.has(id))} />
                        <span className="pending-removal-icon" aria-label="제거 예정">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 12H8L7 9Zm3 2v8h2v-8h-2Zm4 0v8h-2v-8h2Z" /></svg>
                        </span>
                      </div>
                    ))}
                    {inventoryCardGroups.map(({ card, cardIds }) => (
                      <button
                        type="button"
className={`deck-editor-card rarity-${card.rarity} ${card.enemyToken ? "rarity-enemy-token" : ""} ${card.rarity === "legendary" ? "is-painted" : ""} ${deckEditorDrag?.cardId === cardIds.at(-1) ? "is-dragging" : ""} ${ticketDropTarget === ticketDropKey("inventory", cardIds.at(-1)!) ? "is-ticket-drop-target" : ""}`}
                        key={`inventory-${cardIds.join("-")}`}
                        style={deckEditorCardStackStyle(cardIds.length)}
                        draggable
                        onDragStart={(event) => beginDeckEditorDrag(event, cardIds.at(-1)!, "inventory")}
                        onDragEnd={finishDeckEditorDrag}
                        onDragOver={(event) => handleTicketDragOverCard(event, card, "inventory", undefined, cardIds.at(-1)!)}
                        onDrop={(event) => handleTicketDropOnCard(event, card, "inventory", undefined, cardIds.at(-1)!)}
                        onDragLeave={(event) => handleTicketDragLeave(event, ticketDropKey("inventory", cardIds.at(-1)!))}
                        onMouseEnter={(event) => moveDeckCardPreview(event, card)}
                        onMouseMove={(event) => moveDeckCardPreview(event, card)}
                        onMouseLeave={() => { setHoveredDeckCard(null); clearCardKeywordHover(); }}
                        onFocus={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          showDeckCardPreview(card, bounds.right, bounds.top);
                        }}
                        onBlur={() => { setHoveredDeckCard(null); clearCardKeywordHover(); }}
                        onClick={() => {
                          if (pendingCloneTicketId) cloneCardWithTicket(card);
                          else if (pendingTransformTicketId) transformCardWithTicket(card, "inventory");
                          else moveInventoryCardToDeck(cardIds.at(-1)!);
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          moveInventoryCardToFloor(cardIds.at(-1)!);
                        }}
                        aria-label={`${card.name}, 좌클릭하면 선택한 덱으로 이동, 우클릭하면 바닥으로 이동`}
                      >
                        <DeckEditorCardIcon card={card} count={cardIds.length} showNewBadge={cardIds.some((id) => transformedCardNewIds.has(id))} />
                      </button>
                    ))}
                    {Array.from(
                      { length: Math.max(0, inventoryCapacity - deckEditorInventoryItemCount) },
                      (_, slot) => <span className="deck-editor-empty-card-slot" key={`inventory-slot-${slot}`} />,
                    )}
                  </div>
                </section>

                <div className="deck-editor-decks" aria-label="보유 덱 전체">
                  {Array.from({ length: maxOwnedDecks }, (_, index) => {
                    const deck = ownedDecks[index];
                    if (!deck) {
                      return (
                        <div
                          className={`deck-editor-deck-row empty-deck-row ${deckCaseDrag?.source === "floor" && deckCaseDropSlot === index ? "is-deck-drop-target" : ""}`}
                          key={`empty-deck-${index}`}
                          onDragOver={(event) => {
                            const drag = deckCaseDragRef.current ?? deckCaseDrag;
                            if (drag?.source !== "floor") return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setDeckCaseDropSlot(index);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            const drag = deckCaseDragRef.current ?? deckCaseDrag;
                            if (drag?.source === "floor") pickUpFloorDeck(drag.deckId);
                            finishDeckCaseDrag();
                          }}
                        >
                          <strong>덱 {index + 1}</strong><span>빈 덱 칸</span>
                        </div>
                      );
                    }
                    const isSelected = deck.id === editingDeck?.id;
                    return (
                      <section
                        className={`deck-editor-deck-row ${isSelected ? "is-selected" : ""} ${deck.id === activeDeck?.id ? "is-active-deck" : ""} ${deckEditorDropTarget === "deck" && deckEditorDeckId === deck.id ? "is-drop-target" : ""}`}
                        key={deck.id}
                        onDragOver={(event) => {
                          const drag = deckEditorDragRef.current ?? deckEditorDrag;
                          if (!drag || (drag.source === "deck" && drag.deckId === deck.id)) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setDeckEditorDeckId(deck.id);
                          setDeckEditorDropTarget("deck");
                        }}
                        onDrop={(event) => dropDeckEditorCard(event, "deck", deck.id)}
                      >
                        <button
                          type="button"
                          className={`deck-editor-deck-heading ${deckCaseDropSlot === index ? "is-deck-drop-target" : ""}`}
                          draggable
                          onDragStart={(event) => beginDeckCaseDrag(event, deck.id, "owned")}
                          onDragEnd={finishDeckCaseDrag}
                          onDragOver={(event) => {
                            const drag = deckCaseDragRef.current ?? deckCaseDrag;
                            if (drag?.source === "owned" && drag.deckId !== deck.id) {
                              event.preventDefault();
                              event.stopPropagation();
                              setDeckCaseDropSlot(index);
                              return;
                            }
                            const cardDrag = deckEditorDragRef.current ?? deckEditorDrag;
                            if (!cardDrag || (cardDrag.source === "deck" && cardDrag.deckId === deck.id)) return;
                            event.preventDefault();
                            event.stopPropagation();
                            setDeckEditorDeckId(deck.id);
                            setDeckEditorDropTarget("deck");
                          }}
                          onDrop={(event) => {
                            const drag = deckCaseDragRef.current ?? deckCaseDrag;
                            if (drag?.source === "owned") {
                              event.preventDefault();
                              event.stopPropagation();
                              swapOwnedDecks(drag.deckId, deck.id);
                              finishDeckCaseDrag();
                              return;
                            }
                            const cardDrag = deckEditorDragRef.current ?? deckEditorDrag;
                            if (!cardDrag || (cardDrag.source === "deck" && cardDrag.deckId === deck.id)) return;
                            dropDeckEditorCard(event, "deck", deck.id);
                          }}
                          onClick={() => setDeckEditorDeckId(deck.id)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            dropOwnedDeck(deck.id);
                          }}
                        >
                          <span>덱 {index + 1}{deck.id === activeDeck?.id ? " · 사용 중" : ""}</span>
                          <strong><DeckName deck={deck} /></strong>
                          <small>{deck.cards.length} / {deck.capacity}</small>
                        </button>
                        <div
                          className="deck-editor-deck-list"
                          onWheel={scrollDeckEditorCardsHorizontally}
                          onDragOver={(event) => {
                            const drag = deckEditorDragRef.current ?? deckEditorDrag;
                            if (!drag || (drag.source === "deck" && drag.deckId === deck.id)) return;
                            event.preventDefault();
                            event.stopPropagation();
                            setDeckEditorDeckId(deck.id);
                            setDeckEditorDropTarget("deck");
                          }}
                          onDrop={(event) => {
                            dropDeckEditorCard(event, "deck", deck.id);
                          }}
                        >
                          {groupAndSortCards(deck.cards).map(({ card, cardIds }) => {
                            const cardId = cardIds.at(-1)!;
                            const isTemporary = cardIds.some((id) => !originalDeckIdForCard(id));
                            return (
                              <button
                                type="button"
className={`deck-editor-card deck-list-entry rarity-${card.rarity} ${card.enemyToken ? "rarity-enemy-token" : ""} ${card.rarity === "legendary" ? "is-painted" : ""} ${isTemporary ? `is-temporary ${pendingRemovalBlinkDim ? "is-blink-dim" : ""}` : ""} ${ticketDropTarget === ticketDropKey("deck", cardId, deck.id) ? "is-ticket-drop-target" : ""}`}
                                key={`${deck.id}-${cardIds.join("-")}`}
                                style={deckEditorCardStackStyle(cardIds.length)}
                                draggable
                                onDragStart={(event) => beginDeckEditorDrag(event, cardId, "deck", deck.id)}
                                onDragEnd={finishDeckEditorDrag}
                                onDragOver={(event) => handleTicketDragOverCard(event, card, "deck", deck, cardId)}
                                onDrop={(event) => handleTicketDropOnCard(event, card, "deck", deck, cardId)}
                                onDragLeave={(event) => handleTicketDragLeave(event, ticketDropKey("deck", cardId, deck.id))}
                                onMouseEnter={(event) => moveDeckCardPreview(event, card)}
                                onMouseMove={(event) => moveDeckCardPreview(event, card)}
                                onMouseLeave={() => { setHoveredDeckCard(null); clearCardKeywordHover(); }}
                                onClick={() => {
                                  setDeckEditorDeckId(deck.id);
                                  if (pendingCloneTicketId) cloneCardWithTicket(card);
                                  else if (pendingPaintTicketId) paintDeckCard(cardId, pendingPaintTicketId, deck.id);
                                  else if (pendingExtractTicketId) extractDeckCardWithTicket(cardId, deck.id);
                                  else if (pendingTransformTicketId) transformCardWithTicket(card, "deck", deck.id);
                                }}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  moveDeckCardToInventory(cardId, deck.id);
                                }}
                              >
                                <DeckEditorCardIcon card={card} count={cardIds.length} showNewBadge={cardIds.some((id) => transformedCardNewIds.has(id))} />
                              </button>
                            );
                          })}
                          {Array.from({ length: Math.max(0, deck.capacity - deck.cards.length) }, (_, slot) => (
                            <span className="deck-editor-empty-card-slot" key={`${deck.id}-slot-${slot}`} />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>

              <section className="deck-editor-floor-section">
                <div className="area-flow-arrow floor-inventory-flow" aria-hidden="true">
                  <span />
                  <span />
                </div>
                <div className="deck-editor-floor-heading">
                  <div><strong>바닥</strong></div>
                </div>
                <div className="deck-editor-floor-layout">
                  <div
                    className={`deck-editor-floor-cards ${deckEditorDropTarget === "floor" ? "is-drop-target" : ""} ${deckCaseDrag?.source === "owned" ? "is-deck-drop-target" : ""}`}
                    onWheel={scrollDeckEditorCardsHorizontally}
                    onDragOver={(event) => {
                      const deckDrag = deckCaseDragRef.current ?? deckCaseDrag;
                      if (deckDrag?.source === "owned") {
                        event.preventDefault();
                        event.stopPropagation();
                        event.dataTransfer.dropEffect = "move";
                        return;
                      }
                      const itemDrag = consumableDragRef.current ?? consumableDrag;
                      if (itemDrag?.source === "inventory") {
                        event.preventDefault();
                        event.stopPropagation();
                        event.dataTransfer.dropEffect = "move";
                        return;
                      }
                      const drag = deckEditorDragRef.current ?? deckEditorDrag;
                      const source = drag?.source;
                      if (source !== "inventory" && source !== "deck" && source !== "pendingRemoval") return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDeckEditorDropTarget("floor");
                    }}
                    onDrop={(event) => {
                      const deckDrag = deckCaseDragRef.current ?? deckCaseDrag;
                      if (deckDrag?.source === "owned") {
                        event.preventDefault();
                        event.stopPropagation();
                        dropOwnedDeck(deckDrag.deckId);
                        finishDeckCaseDrag();
                        return;
                      }
                      if ((consumableDragRef.current ?? consumableDrag)?.source === "inventory") {
                        dropConsumable(event, "floor");
                        return;
                      }
                      dropDeckEditorCard(event, "floor");
                    }}
                  >
                    {currentFloorDecks.map((deck) => (
                      <button
                        type="button"
                        className="floor-deck-item"
                        key={deck.id}
                        draggable
                        onDragStart={(event) => beginDeckCaseDrag(event, deck.id, "floor")}
                        onDragEnd={finishDeckCaseDrag}
                        onClick={() => pickUpFloorDeck(deck.id)}
                        aria-label={`${deck.name}, 카드 ${deck.cards.length}장, 용량 ${deck.capacity}. 누르면 줍기`}
                      >
                        <span className="floor-deck-icon" aria-hidden="true" />
                        <strong><DeckName deck={deck} /></strong>
                        <span>{deck.cards.length} / {deck.capacity}</span>
                        <small>눌러서 줍기</small>
                      </button>
                    ))}
                    {currentFloorConsumables.map((consumable) => (
                      <button
                        type="button"
                        className={`consumable-ticket floor-ticket ${consumable.type} ${consumable.armedMovesRemaining !== undefined || pendingPaintTicketId === consumable.id || pendingCloneTicketId === consumable.id || pendingExtractTicketId === consumable.id || pendingTransformTicketId === consumable.id ? "is-selected" : ""}`}
                        key={consumable.id}
                        draggable
                        onDragStart={(event) => beginConsumableDrag(event, consumable.id, "floor")}
                        onDragEnd={finishConsumableDrag}
                        onMouseEnter={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          showConsumablePreview(consumable, bounds.right, bounds.top);
                        }}
                        onMouseMove={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          showConsumablePreview(consumable, bounds.right, bounds.top);
                        }}
                        onMouseLeave={() => setHoveredConsumable(null)}
                        onFocus={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          showConsumablePreview(consumable, bounds.right, bounds.top);
                        }}
                        onBlur={() => setHoveredConsumable(null)}
                        onClick={() => ["paintTicket", "cloneTicket", "extractTicket", "transformTicket"].includes(consumable.type)
                          ? selectExtractionTicket(consumable)
                          : moveFloorConsumableToInventory(consumable.id)}
                      >
                        <strong>{consumable.name}</strong>
                        <small>{consumable.description}</small>
                      </button>
                    ))}
                    {removedFloorCardGroups.map(({ card, cardIds }) => (
                      <div
                        className={`deck-editor-card is-pending-removal ${pendingRemovalBlinkDim ? "is-blink-dim" : ""} rarity-${card.rarity} ${card.enemyToken ? "rarity-enemy-token" : ""} ${card.rarity === "legendary" ? "is-painted" : ""} ${deckEditorDrag?.cardId === cardIds.at(-1) ? "is-dragging" : ""}`}
                        key={`pending-removal-${cardIds.join("-")}`}
                        style={deckEditorCardStackStyle(cardIds.length)}
                        draggable
                        onDragStart={(event) => beginDeckEditorDrag(event, cardIds.at(-1)!, "pendingRemoval")}
                        onDragEnd={finishDeckEditorDrag}
                        onMouseEnter={(event) => moveDeckCardPreview(event, card)}
                        onMouseMove={(event) => moveDeckCardPreview(event, card)}
                        onMouseLeave={() => { setHoveredDeckCard(null); clearCardKeywordHover(); }}
                        aria-label={`${card.name} ${cardIds.length}장, 제거 예정`}
                      >
                        <DeckEditorCardIcon card={card} count={cardIds.length} showNewBadge={cardIds.some((id) => transformedCardNewIds.has(id))} />
                        <span className="pending-removal-icon" aria-label="제거 예정">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 12H8L7 9Zm3 2v8h2v-8h-2Zm4 0v8h-2v-8h2Z" /></svg>
                        </span>
                      </div>
                    ))}
                    {floorCardGroups.map(({ card, cardIds }) => (
                      <button
                        type="button"
                        className={`deck-editor-card rarity-${card.rarity} ${card.enemyToken ? "rarity-enemy-token" : ""} ${card.rarity === "legendary" ? "is-painted" : ""} ${deckEditorDrag?.cardId === cardIds.at(-1) ? "is-dragging" : ""} ${ticketDropTarget === ticketDropKey("floor", cardIds.at(-1)!) ? "is-ticket-drop-target" : ""}`}
                        key={`floor-${cardIds.join("-")}`}
                        style={deckEditorCardStackStyle(cardIds.length)}
                        draggable
                        onDragStart={(event) => beginDeckEditorDrag(event, cardIds.at(-1)!, "floor")}
                        onDragEnd={finishDeckEditorDrag}
                        onDragOver={(event) => handleTicketDragOverCard(event, card, "floor", undefined, cardIds.at(-1)!)}
                        onDrop={(event) => handleTicketDropOnCard(event, card, "floor", undefined, cardIds.at(-1)!)}
                        onDragLeave={(event) => handleTicketDragLeave(event, ticketDropKey("floor", cardIds.at(-1)!))}
                        onMouseEnter={(event) => moveDeckCardPreview(event, card)}
                        onMouseMove={(event) => moveDeckCardPreview(event, card)}
                        onMouseLeave={() => { setHoveredDeckCard(null); clearCardKeywordHover(); }}
                        onFocus={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          showDeckCardPreview(card, bounds.right, bounds.top);
                        }}
                        onBlur={() => { setHoveredDeckCard(null); clearCardKeywordHover(); }}
                        onClick={() => {
                          if (pendingCloneTicketId) cloneCardWithTicket(card);
                          else if (pendingTransformTicketId) transformCardWithTicket(card, "floor");
                          else moveFloorCardToInventory(cardIds.at(-1)!);
                        }}
                        aria-label={`${card.name}, 인벤토리에 줍기`}
                      >
                        <DeckEditorCardIcon card={card} count={cardIds.length} showNewBadge={cardIds.some((id) => transformedCardNewIds.has(id))} />
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <footer className="deck-editor-footer">
                <div className="deck-editor-footer-actions">
                  <button
                    type="button"
                    className="confirm"
                    onClick={confirmDeckEditor}
                    disabled={deckEditorInventoryItemCount > inventoryCapacity}
                  >확인</button>
                </div>
              </footer>
              </section>
              {hoveredDeckCard && !deckEditorDrag && (
                <aside
                  className="deck-card-preview-floating"
                  style={{ left: deckPreviewPosition.x, top: deckPreviewPosition.y }}
                  aria-live="polite"
                >
                  <div className={`card-face ${hoveredDeckCard.kind} ${hoveredDeckCard.damageType}`}>
                    <CardFace card={hoveredDeckCard} />
                  </div>
                </aside>
              )}
              {hoveredConsumable && !consumableDrag && (
                <aside
                  className={`deck-consumable-preview-floating ${hoveredConsumable.type}`}
                  style={{ left: deckPreviewPosition.x, top: deckPreviewPosition.y }}
                  aria-live="polite"
                >
                  <strong>{hoveredConsumable.name}</strong>
                  <p>{hoveredConsumable.description}</p>
                </aside>
              )}
            </div>
            {mapMessage && <p key={mapMessageNonce} className="map-message deck-editor-map-message" role="status" aria-live="polite">{mapMessage}</p>}
          </div>
        )}

        {openedCardPack && (
          <div className="shop-overlay" role="dialog" aria-modal="true" aria-label="카드 팩 개봉">
            <section className="card-pack-result">
              <header><div><p>CARD PACK</p><h2>카드 팩 개봉</h2></div><button type="button" onClick={() => setOpenedCardPack(null)}>확인</button></header>
              <div className="card-pack-cards">
                {openedCardPack.map((card) => (
                  <div
                    className={`card-face ${card.kind} ${card.damageType}`}
                    key={card.id}
                    onMouseEnter={(event) => {
                      const bounds = event.currentTarget.getBoundingClientRect();
                      showCardKeywordOnly(card, bounds.right, bounds.top);
                    }}
                    onMouseMove={(event) => {
                      const bounds = event.currentTarget.getBoundingClientRect();
                      showCardKeywordOnly(card, bounds.right, bounds.top);
                    }}
                    onMouseLeave={() => { setHoveredDeckCard(null); clearCardKeywordHover(); }}
                  >
                    <CardFace card={card} />
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {deckViewerOpen && (
          <div className="deck-viewer-overlay" role="dialog" aria-modal="true" aria-labelledby="deck-viewer-title">
            <section className="deck-viewer-panel">
              <header>
                <div>
                  <p>DECK</p>
                  <h2 id="deck-viewer-title">{viewedDeck?.name ?? "덱 보기"}</h2>
                  <span>{viewedDeck?.cards.length ?? 0} / {viewedDeck?.capacity ?? 0}장</span>
                </div>
                <button type="button" onClick={() => setDeckViewerOpen(false)}>닫기</button>
              </header>
              <nav className="deck-viewer-tabs" aria-label="볼 덱 선택">
                {ownedDecks.map((deck, index) => (
                  <button
                    type="button"
                    className={deck.id === viewedDeck?.id ? "is-active" : ""}
                    key={`viewer-tab-${deck.id}`}
                    onClick={() => setDeckViewerDeckId(deck.id)}
                  >
                    <strong><DeckName deck={deck} /></strong>
                    <span>{deck.cards.length} / {deck.capacity}</span>
                  </button>
                ))}
                {Array.from({ length: maxOwnedDecks - ownedDecks.length }, (_, index) => (
                  <span className="is-empty" key={`viewer-empty-${index}`}>빈 덱 칸</span>
                ))}
              </nav>
              <div className="deck-viewer-sort deck-editor-sort" aria-label="카드 정렬 방식">
                <button type="button" className={deckViewerSort === "cost" ? "is-active" : ""} onClick={() => setDeckViewerSort("cost")}>코스트 순</button>
                <button type="button" className={deckViewerSort === "rarity" ? "is-active" : ""} onClick={() => setDeckViewerSort("rarity")}>희귀도 순</button>
              </div>
              <div className="deck-viewer-grid" ref={deckViewerGridRef}>
                {deckViewerCards.map((card) => (
                  <div
                    className="deck-viewer-card"
                    key={`viewer-${card.id}`}
                    onMouseEnter={(event) => {
                      const bounds = event.currentTarget.getBoundingClientRect();
                      showCardKeywordOnly(card, bounds.right, bounds.top);
                    }}
                    onMouseMove={(event) => {
                      const bounds = event.currentTarget.getBoundingClientRect();
                      showCardKeywordOnly(card, bounds.right, bounds.top);
                    }}
                    onMouseLeave={() => { setHoveredDeckCard(null); clearCardKeywordHover(); }}
                  >
                    <div className={`card-face ${card.kind} ${card.damageType}`}>
                      <CardFace card={card} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    );
  }

  const battleCardCollections = {
    deck: deckCards,
    piles: game.piles.flat(),
    discard: game.discard,
  };
  const battleCardViewCards = battleCardView ? battleCardCollections[battleCardView] : [];
  const battleCardViewGroups = Array.from(battleCardViewCards.reduce((groups, card) => {
    const key = `${card.name}:${card.effect}:${card.value}:${card.forgeCostsCompleted?.join(",") ?? ""}:${card.forged ? "forged" : "normal"}:${card.colored ? "colored" : "plain"}`;
    const current = groups.get(key);
    if (current) {
      current.count += 1;
      current.cardIds.push(card.id);
    } else groups.set(key, { card, count: 1, cardIds: [card.id] });
    return groups;
  }, new Map<string, { card: Card; count: number; cardIds: number[] }>()).values());
  const battleCardKeywordPopover = hoveredCardKeywords && (
    <aside
      className="card-keyword-popover"
      ref={cardKeywordPopoverRef}
      style={{ left: hoveredCardKeywords.x, top: hoveredCardKeywords.y }}
      role="tooltip"
      aria-label={`${hoveredCardKeywords.card.name} 키워드 설명`}
    >
      {getCardKeywordInfos(hoveredCardKeywords.card).map((keyword) => (
        <section key={keyword.name}>
          <strong>{keyword.name}</strong>
          <p>{keyword.description}</p>
        </section>
      ))}
    </aside>
  );

  return (
    <main
      className={`game-shell card-style-simple watermark-${cardWatermarkStyle} ${constellationPreviewIndex === null ? "" : "is-previewing-constellation"}`}
      style={cardWatermarkVariables}
    >
      <span className="game-version" aria-label={`게임 버전 ${GAME_VERSION}`}>{GAME_VERSION}</span>
      <section
        className={`battlefield ${dragging ? `${dragging.source.type === "hand" ? `dragging-${dragging.card.kind}` : "dragging-from-pile"} dragging-solitaire` : ""}`}
        aria-label="전투 화면"
        style={{
          "--battle-board-color": battleThemeColors.board,
          "--battle-card-color": battleThemeColors.card,
          "--battle-card-text-color": battleThemeColors.cardText,
          "--battle-card-border-color": battleThemeColors.cardBorder,
          "--battle-card-back-color": battleThemeColors.cardBack,
          "--battle-cost-color": battleThemeColors.cost,
          "--battle-cost-text-color": battleThemeColors.costText,
          "--battle-energy-color": battleThemeColors.energy,
          "--battle-energy-empty-color": battleThemeColors.energyEmpty,
          "--battle-basic-band-color": battleThemeColors.basicBand,
          "--battle-special-band-color": battleThemeColors.specialBand,
          "--battle-rare-band-color": battleThemeColors.rareBand,
          "--battle-physical-color": battleThemeColors.physical,
          "--battle-magic-color": battleThemeColors.magic,
        } as CSSProperties}
      >
        {debugMode && (
          <details hidden className="debug-theme-panel">
            <summary>색상 조작</summary>
            <div className="debug-theme-controls">
              {BATTLE_THEME_COLOR_FIELDS.map((field) => (
                <label key={field.key}>
                  <span>{field.label}</span>
                  <input
                    type="color"
                    value={battleThemeColors[field.key]}
                    onChange={(event) => {
                      const value = event.target.value;
                      setBattleThemeColors((current) => ({ ...current, [field.key]: value }));
                      setBattleThemeDrafts((current) => ({ ...current, [field.key]: value }));
                    }}
                    aria-label={`${field.label} 색상 선택`}
                  />
                  <input
                    className="debug-theme-hex"
                    type="text"
                    inputMode="text"
                    value={battleThemeDrafts[field.key]}
                    maxLength={7}
                    spellCheck={false}
                    onChange={(event) => {
                      const value = event.target.value;
                      setBattleThemeDrafts((current) => ({ ...current, [field.key]: value }));
                      if (/^#[0-9a-fA-F]{6}$/.test(value)) {
                        setBattleThemeColors((current) => ({ ...current, [field.key]: value.toLowerCase() }));
                      }
                    }}
                    onBlur={() => setBattleThemeDrafts((current) => ({
                      ...current,
                      [field.key]: battleThemeColors[field.key],
                    }))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    aria-label={`${field.label} 색상 코드`}
                  />
                </label>
              ))}
              <label className="debug-orbit-control">
                <span>별 공전</span>
                <select
                  value={starOrbitStyle}
                  onChange={(event) => setStarOrbitStyle(event.target.value as StarOrbitStyle)}
                >
                  {STAR_ORBIT_OPTIONS.map((option) => (
                    <option value={option.value} key={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="debug-orbit-range">
                <span>공전 속도</span>
                <input type="range" min="0.25" max="2.5" step="0.05" value={starOrbitSpeed} onChange={(event) => setStarOrbitSpeed(Number(event.target.value))} />
                <output>{starOrbitSpeed.toFixed(2)}×</output>
              </label>
              <label className="debug-orbit-range">
                <span>타원 회전 속도</span>
                <input type="range" min="0.25" max="4" step="0.05" value={starPlaneSpeed} onChange={(event) => setStarPlaneSpeed(Number(event.target.value))} />
                <output>{starPlaneSpeed.toFixed(2)}×</output>
              </label>
              <label className="debug-orbit-control debug-watermark-control">
                <span>워터마크 종류</span>
                <select
                  value={cardWatermarkStyle}
                  onChange={(event) => setCardWatermarkStyle(event.target.value as CardWatermarkStyle)}
                >
                  {CARD_WATERMARK_OPTIONS.map((option) => (
                    <option value={option.value} key={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="debug-orbit-range">
                <span>워터마크 투명도</span>
                <input type="range" min="0" max="0.65" step="0.01" value={cardWatermarkOpacity} onChange={(event) => setCardWatermarkOpacity(Number(event.target.value))} />
                <output>{Math.round(cardWatermarkOpacity * 100)}%</output>
              </label>
              <label className="debug-orbit-range">
                <span>워터마크 크기</span>
                <input type="range" min="45" max="145" step="1" value={cardWatermarkSize} onChange={(event) => setCardWatermarkSize(Number(event.target.value))} />
                <output>{cardWatermarkSize}%</output>
              </label>
              <label className="debug-orbit-range">
                <span>워터마크 가로</span>
                <input type="range" min="0" max="100" step="1" value={cardWatermarkX} onChange={(event) => setCardWatermarkX(Number(event.target.value))} />
                <output>{cardWatermarkX}%</output>
              </label>
              <label className="debug-orbit-range">
                <span>워터마크 세로</span>
                <input type="range" min="0" max="100" step="1" value={cardWatermarkY} onChange={(event) => setCardWatermarkY(Number(event.target.value))} />
                <output>{cardWatermarkY}%</output>
              </label>
              <fieldset className="debug-constellation-picker">
                <legend>별자리 후보 {constellationPreviewIndex === null ? "" : `#${constellationPreviewIndex + 1}`}</legend>
                <button
                  type="button"
                  className={constellationPreviewIndex === null ? "is-selected" : ""}
                  onClick={() => setConstellationPreviewIndex(null)}
                >원래 9종</button>
                <div>
                  {CONSTELLATION_PRESETS.map((preset, index) => (
                    <button
                      type="button"
                      className={constellationPreviewIndex === index ? "is-selected" : ""}
                      onClick={() => setConstellationPreviewIndex(index)}
                      title={`별자리 후보 ${index + 1}`}
                      aria-label={`별자리 후보 ${index + 1}`}
                      key={index}
                    >
                      <ConstellationPreview preset={preset} />
                      <span>{index + 1}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <button type="button" onClick={() => {
                setBattleThemeColors(DEFAULT_BATTLE_THEME_COLORS);
                setBattleThemeDrafts(DEFAULT_BATTLE_THEME_COLORS);
                setStarOrbitStyle("saturn");
                setStarOrbitSpeed(1.3);
                setStarPlaneSpeed(1);
                setCardWatermarkStyle("stars");
                setCardWatermarkOpacity(.45);
                setCardWatermarkSize(100);
                setCardWatermarkX(50);
                setCardWatermarkY(100);
                setConstellationPreviewIndex(null);
              }}>
                기본값으로 초기화
              </button>
            </div>
          </details>
        )}
        <header className="battle-topbar">
          <div className="turn-badge" aria-label={`현재 ${game.turn}턴`}>
            <span>TURN</span><strong>{game.turn}</strong>
          </div>
          {debugMode && game.status === "playing" && (
            <button type="button" className="debug-defeat-trigger" onClick={defeatEnemiesForDebug}>
              적 즉시 처치
            </button>
          )}
        </header>
        <nav className="battle-card-ledger" aria-label="전투 카드 현황">
          <button type="button" className={battleCardView === "deck" ? "is-active" : ""} onClick={() => setBattleCardView((current) => current === "deck" ? null : "deck")}>
            <strong>{activeDeck ? <DeckName deck={activeDeck} showEditions={false} /> : "현재 덱"}</strong><span>{deckCards.length}장</span>
          </button>
          <button type="button" className={battleCardView === "piles" ? "is-active" : ""} onClick={() => setBattleCardView((current) => current === "piles" ? null : "piles")}>
            <strong>파일</strong><span>{game.piles.flat().length}장</span>
          </button>
          <button type="button" className={battleCardView === "discard" ? "is-active" : ""} onClick={() => setBattleCardView((current) => game.pendingResearchDraw === "necromancy" ? "discard" : current === "discard" ? null : "discard")}>
            <strong>버린 카드</strong><span>{game.discard.length}장</span>
          </button>
        </nav>
        {battleCardView && (
          <aside className="battle-card-ledger-panel" aria-live="polite">
            <header>
              <strong>{battleCardView === "deck" ? "현재 덱" : battleCardView === "piles" ? "파일에 존재하는 카드" : "버린 카드"}</strong>
              <button type="button" onClick={() => setBattleCardView(null)} disabled={game.pendingResearchDraw === "necromancy"}>닫기</button>
            </header>
            <div className="battle-card-ledger-cards">
              {battleCardViewGroups.length > 0
                ? battleCardViewGroups.map(({ card, count, cardIds }) => (
                  <div
                    className={`battle-ledger-card-stack rarity-${card.rarity} ${card.enemyToken ? "rarity-enemy-token" : ""}`}
                    key={`${battleCardView}-${card.id}`}
                    aria-label={`${card.name} ${count}장`}
                    style={{ width: 74 + Math.min(5, count - 1) * 7 }}
                  >
                    {Array.from({ length: Math.min(5, count - 1) }, (_, layer) => (
                      <span className="battle-ledger-stack-layer" key={`${card.id}-layer-${layer}`} style={{ left: layer * 7 }} />
                    ))}
                  <div
                    className={`deck-editor-card battle-ledger-card rarity-${card.rarity} ${card.enemyToken ? "rarity-enemy-token" : ""} ${card.rarity === "legendary" ? "is-painted" : ""}`}
                    style={{ marginLeft: Math.min(5, count - 1) * 7 }}
                    draggable={battleCardView === "discard"
                      && (game.pendingResearchDraw === "necromancy" || canUseResearchDraw(game, "necromancy"))}
                    onDragStart={(event) => {
                      const cardId = cardIds.at(-1);
                      if (cardId === undefined) return;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", `research-discard:${cardId}`);
                    }}
                    onMouseEnter={(event) => moveDeckCardPreview(event, card)}
                    onMouseMove={(event) => moveDeckCardPreview(event, card)}
                    onMouseLeave={() => { setHoveredDeckCard(null); clearCardKeywordHover(); }}
                  >
                    <DeckEditorCardIcon card={card} count={count} />
                  </div>
                  </div>
                ))
                : <em>카드 없음</em>}
            </div>
          </aside>
        )}
        {hoveredDeckCard && (
          <aside
            className="deck-card-preview-floating battle-card-preview-floating"
            style={{ left: deckPreviewPosition.x, top: deckPreviewPosition.y }}
            aria-live="polite"
          >
            <div className={`card-face ${hoveredDeckCard.kind} ${hoveredDeckCard.damageType}`}>
              <CardFace card={hoveredDeckCard} ruleCostReduction={lawResearchCount} forgeCount={game.forgeCount} />
            </div>
          </aside>
        )}
        {battleCardKeywordPopover}
        {hoveredEnemyIntentTooltip && (
          <div
            className="intent-tooltip enemy-intent-tooltip"
            role="tooltip"
            style={{
              left: `${hoveredEnemyIntentTooltip.x}px`,
              top: `${hoveredEnemyIntentTooltip.y}px`,
              maxWidth: `${hoveredEnemyIntentTooltip.maxWidth}px`,
            }}
          >
            {hoveredEnemyIntentTooltip.text}
          </div>
        )}
        <div className="enemy-zone">
          <div className={`enemies-row ${game.enemies.length > 2 ? "is-crowded" : ""}`}>
            {game.enemies.filter((enemy) => enemy.hp > 0 || dyingEnemyIds.has(enemy.id)).map((enemy) => {
              const dying = enemy.hp === 0 && dyingEnemyIds.has(enemy.id);
              const defeated = enemy.hp === 0 && !dying;
              const displayedEnemyHp = animatedEnemyHp[enemy.id] ?? enemy.hp;
              const intent = enemy.actions[enemy.intentIndex];
              const intentType = enemy.nextAttackMagic
                ? "magic"
                : intent.attacks[0]?.type ?? "buff";
              return (
                <button
                  type="button"
                  className={`enemy-unit ${enemy.variant} ${dying ? "is-dying" : ""} ${defeated ? "is-defeated" : ""} ${attackingEnemyId === enemy.id ? "is-attacking" : ""}`}
                  data-enemy-id={enemy.id}
                  data-drop-target={enemy.hp === 0 ? undefined : `enemy:${enemy.id}`}
                  key={enemy.id}
                  disabled={enemy.hp === 0}
                  onClick={() => playSelectedHandCardOnEnemy(enemy.id)}
                  onPointerEnter={(event) => showEnemyIntentTooltip(event, intent)}
                  onPointerMove={(event) => showEnemyIntentTooltip(event, intent)}
                  onPointerLeave={() => setHoveredEnemyIntentTooltip(null)}
                  onFocus={(event) => showEnemyIntentTooltip(event, intent)}
                  onBlur={() => setHoveredEnemyIntentTooltip(null)}
                  aria-label={`${enemy.name}${dying ? ", 쓰러지는 중" : defeated ? ", 격파됨" : ", 공격 대상"}`}
                >
                  {enemy.hp > 0 && <div className="drop-prompt attack-prompt">이 적을 공격</div>}
                  <div className="monster" aria-label={enemy.name}>
                    <div className={`intent intent-card ${defeated ? "is-defeated" : intentType}`}>
                      {defeated ? (
                        <strong>격파</strong>
                      ) : (
                        <EnemyIntentIcons
                          action={intent}
                          strength={enemy.strength}
                          forceMagic={enemy.nextAttackMagic}
                          physicalResistance={game.playerPhysicalResistance}
                          magicResistance={game.playerMagicResistance}
                          physicalVulnerability={game.playerPhysicalVulnerability}
                          magicVulnerability={game.playerMagicVulnerability}
                        />
                      )}
                    </div>
                    <div className="monster-horns"><i /><i /></div>
                    <div className="monster-face"><b /><b /><span /></div>
                  </div>
                  <div className="unit-stats enemy-stats">
                    <strong>{enemy.name}</strong>
                    <div className="enemy-health-row">
                      {enemy.physicalBlock > 0 && (
                        <div className="defense-shield physical enemy-defense-shield" aria-label={`방어 ${enemy.physicalBlock}`}>
                          <strong>{enemy.physicalBlock}</strong>
                        </div>
                      )}
                      <div className="enemy-health-popup-anchor">
                        <div className="healthbar enemy-health">
                          <i style={{ width: `${(displayedEnemyHp / enemy.maxHp) * 100}%` }} />
                          <span>{displayedEnemyHp} / {enemy.maxHp}</span>
                        </div>
                        {enemyPopups[enemy.id] && (
                          <div className={`combat-popup enemy-combat-popup is-${enemyPopups[enemy.id].kind ?? "damage"}`} key={enemyPopups[enemy.id].key}>
                            {enemyPopups[enemy.id].text}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="combat-buffs enemy-effects" aria-label="적 상태 효과">
                      {enemy.strength !== 0 && <span>힘 {enemy.strength}</span>}
                      {enemy.sturdyThreshold > 0 && <span>단단함 ≤{enemy.sturdyThreshold}</span>}
                      {enemy.quicknessReady && <span>재빠름 준비</span>}
                      {enemy.nextAttackMagic && <span>다음 공격 마법</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="pile-zone">
          {pileClearNotice && <div className="pile-clear-notice">CLEAR!</div>}
          {(game.pendingResearchDraw === "astronomy" || game.pendingSweep || game.pendingDraws > 0 || game.pendingPileDrawCount > 0) && (
            <div className="section-label">
              <span>{game.pendingResearchDraw === "astronomy"
                ? "천문학 연구: 드로우할 파일 선택"
                : game.pendingSweep
                ? game.pendingPileOperation === "discardTop" ? "버려질 카드를 선택하세요." : "효과를 적용할 파일 선택"
                : "드로우할 파일 선택"}</span>
              <small>{game.pendingResearchDraw === "astronomy"
                ? "원하는 파일의 맨 위 카드를 가져옵니다"
                : game.pendingSweep
                ? game.pendingPileOperation === "discardTop"
                  ? "원하는 파일을 클릭해 맨 위 카드를 버리세요"
                  : "원하는 파일을 클릭해 맨 위 카드를 맨 아래로 보내세요"
                : "원하는 파일을 클릭해 맨 위 카드를 가져오세요"}</small>
            </div>
          )}
          <div
            className={`piles-scroll ${pilePanning ? "is-panning" : ""}`}
            ref={pileScrollRef}
            onWheel={scrollDeckEditorCardsHorizontally}
            onPointerDown={beginPilePan}
            onPointerMove={movePilePan}
            onPointerUp={finishPilePan}
            onPointerCancel={finishPilePan}
          >
          <div className="piles" aria-label="카드 파일들">
            {game.piles.map((pile, index) => {
              const stackOffset = getStackOffset(pile.length);
              const discardCount = discardPileCounts.get(index) ?? 0;
              const targetCard = pile.at(-1);
              const activeDrag = dragging;
              const isValidSolitaireDrop = activeDrag !== null
                && game.stars >= 1
                && !(activeDrag.source.type === "pile" && activeDrag.source.pileIndex === index)
                && canPlaceBySolitaireRule(activeDrag.card, targetCard);
              const isForgeDrop = activeDrag !== null
                && isValidSolitaireDrop
                && targetCard !== undefined
                && canForgeCardOnto(activeDrag.card, targetCard, lawResearchCount, game.forgeCount)
                && (activeDrag.card.effect !== "obsidianDagger" || activeDrag.cards.length === 1);
              return (
                <div
                  className={`solitaire-pile ${discardCount > 0 ? "is-discard-target" : ""} ${game.pendingDraws > 0 || game.pendingPileDrawCount > 0 || game.pendingSweep || game.pendingResearchDraw === "astronomy" ? pile.length > 0 ? "is-draw-choice" : "is-draw-empty" : ""}`}
                  key={index}
                  style={{
                    "--pile-stack-height": `${CARD_HEIGHT + Math.max(0, pile.length - 1) * stackOffset}px`,
                  } as CSSProperties}
                  data-pile-index={index}
                  data-drop-target={`pile:${index}`}
                  aria-label={`${index + 1}번 파일, ${pile.length}장`}
                  onClick={() => {
                    if (game.pendingResearchDraw === "astronomy") drawAstronomyResearchCard(index);
                    else if (game.pendingSweep) takeSelectedPile(index);
                    else if (game.pendingDraws > 0 || game.pendingPileDrawCount > 0) drawSelectedPile(index);
                    else moveSelectedHandCardToPile(index);
                  }}
                >
                {pile.length === 0 && <div className={`empty-slot ${isValidSolitaireDrop ? isForgeDrop ? "is-forge-drop-target" : "is-solitaire-drop-target" : ""}`} aria-hidden="true" />}
                {discardCount > 0 && <span className="discard-target-label">버리기 {discardCount}</span>}
                {pile.map((card, cardIndex) => {
                  const isTop = cardIndex === pile.length - 1;
                  const faceUp = card.revealed;
                  const isMoving = dragging?.source.type === "pile"
                    && dragging.source.pileIndex === index
                    && cardIndex >= dragging.source.cardIndex;
                  return (
                    <div
                      className={`stacked-card ${faceUp ? `card-face face-up pile-draggable-card ${card.kind} ${card.damageType}` : "face-down"} ${isMoving ? "is-dragging" : ""} ${isTop && isValidSolitaireDrop ? isForgeDrop ? "is-forge-drop-target" : "is-solitaire-drop-target" : ""}`}
                      style={{
                        top: `${cardIndex * stackOffset}px`,
                        "--stack-index": cardIndex,
                        "--stack-exposure": `${stackOffset}px`,
                      } as CSSProperties}
                      key={card.id}
                      data-card-id={card.id}
                      data-top-card-id={isTop ? card.id : undefined}
                      aria-hidden={!faceUp}
                      role={faceUp ? "button" : undefined}
                      tabIndex={faceUp ? 0 : undefined}
                      onPointerDown={faceUp ? (event) => beginDrag(
                        event,
                        card,
                        { type: "pile", pileIndex: index, cardIndex },
                        pile.slice(cardIndex),
                      ) : undefined}
                      onPointerMove={faceUp ? moveDrag : undefined}
                      onPointerUp={faceUp ? finishDrag : undefined}
                      onPointerCancel={faceUp ? cancelDrag : undefined}
                      onMouseEnter={faceUp ? (event) => {
                        const bounds = event.currentTarget.getBoundingClientRect();
                        showCardKeywordOnly(card, bounds.right, bounds.top);
                      } : undefined}
                      onMouseMove={faceUp ? (event) => {
                        const bounds = event.currentTarget.getBoundingClientRect();
                        showCardKeywordOnly(card, bounds.right, bounds.top);
                      } : undefined}
                      onMouseLeave={faceUp ? () => { setHoveredDeckCard(null); clearCardKeywordHover(); } : undefined}
                      onBlur={faceUp ? () => { setHoveredDeckCard(null); clearCardKeywordHover(); } : undefined}
                    >
                      {faceUp ? <CardFace card={card} strength={game.strength + combatManualBonus} agility={game.agility + combatManualBonus} defenseMultiplier={game.defenseMultiplier} ruleCostReduction={lawResearchCount} forgeCount={game.forgeCount} /> : <span className={`card-back-pattern ${card.colored ? "is-painted" : ""}`} />}
                    </div>
                  );
                })}
                </div>
              );
            })}
          </div>
        </div>
        </div>

        <div className="center-drop-zone" data-drop-target="defend">
          <div
            className="energy-star-system center-resource"
            aria-label={`에너지 ${game.energy} 중 ${game.deckEditions.includes("rampaging") ? 4 : 3}, 별 ${game.stars}개`}
            title={`별 ${game.stars}개`}
            style={{
              "--energy-fill": `${Math.min(100, Math.max(0, game.energy / (game.deckEditions.includes("rampaging") ? 4 : 3) * 100))}%`,
            } as CSSProperties}
          >
            <div className="energy-orb">
              <span>{game.energy}</span><small>/ {game.deckEditions.includes("rampaging") ? 4 : 3}</small>
            </div>
            <div className="energy-stars" aria-hidden="true">
              {game.stars > 6 ? (
                <><span>★</span><small>x{game.stars}</small></>
              ) : Array.from({ length: game.stars }, (_, index) => <span key={index}>★</span>)}
            </div>
          </div>
          <div className="drop-prompt defend-prompt">
            {dragging?.card.effect === "ironRampage"
                ? "여기에 놓아 전체 공격"
              : dragging?.card.effect === "defend"
                ? `여기에 놓아 ${DEFENSE_LABEL[dragging.card.damageType]}`
                : dragging?.card.kind === "skill"
                  ? "여기에 놓아 사용"
                  : "여기에 놓아 수비"}
          </div>
          <div className="status-strip" role="status" aria-live="polite">{game.message}</div>
        </div>

        <div className="player-zone">
          <div className="player-status-column">
            <div className="player-panel">
              <div className="player-avatar" aria-hidden="true">@</div>
              {(game.playerPhysicalBlock > 0 || game.playerMagicBlock > 0) && (
                <div className="defense-shields player-defense-shields" aria-label="현재 방어도">
                  {game.playerPhysicalBlock > 0 && (
                    <div className="defense-shield physical" aria-label={`방어 ${game.playerPhysicalBlock}`}>
                      <strong>{game.playerPhysicalBlock}</strong>
                    </div>
                  )}
                  {game.playerMagicBlock > 0 && (
                    <div className="defense-shield magic" aria-label={`마법 방어 ${game.playerMagicBlock}`}>
                      <strong>{game.playerMagicBlock}</strong>
                    </div>
                  )}
                </div>
              )}
              <div className="player-details">
                <strong>{playerName}</strong>
                <div className="player-health-popup-anchor">
                  <div className="healthbar player-health">
                    <i style={{ width: `${(game.playerHp / MAX_PLAYER_HP) * 100}%` }} />
                    <span>{game.playerHp} / {MAX_PLAYER_HP}</span>
                  </div>
                  {damagePopup && (
                    <div className={`combat-popup player-combat-popup ${damagePopup.text === "막음" ? "is-blocked" : ""}`} key={damagePopup.key}>
                      {damagePopup.text}
                    </div>
                  )}
                </div>
                <div className="combat-buffs" aria-label="현재 강화 효과">
                  {game.strength + combatManualBonus > 0 && <span className="is-buff">힘 {game.strength + combatManualBonus}</span>}
                  {game.agility + combatManualBonus > 0 && <span className="is-buff">강인함 {game.agility + combatManualBonus}</span>}
                  {game.defenseMultiplier > 1 && <span className="is-buff">방어 ×{game.defenseMultiplier}</span>}
                  {game.damageTakenMultiplier > 1 && <span className="is-debuff">받는 피해 ×{game.damageTakenMultiplier}</span>}
                  {game.invulnerable && <span className="is-buff">피해 면역</span>}
                  {game.doubleNextAttack && <span className="is-buff">다음 공격 2회</span>}
                  {game.playerPhysicalResistance > 0 && <span className="is-buff">물리 저항 {game.playerPhysicalResistance}</span>}
                  {game.playerPhysicalVulnerability > 0 && <span className="is-debuff">물리 취약 {game.playerPhysicalVulnerability}</span>}
                  {game.playerMagicResistance > 0 && <span className="is-buff">마법 저항 {game.playerMagicResistance}</span>}
                  {game.playerMagicVulnerability > 0 && <span className="is-debuff">마법 취약 {game.playerMagicVulnerability}</span>}
                  {game.activeRuleCards.map((ruleCard) => (
                    <span
                      className="is-buff rule-buff"
                      key={ruleCard.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`룰 : ${ruleCard.name} 카드 설명 보기`}
                      onMouseEnter={(event) => moveDeckCardPreview(event, ruleCard)}
                      onMouseMove={(event) => moveDeckCardPreview(event, ruleCard)}
                      onMouseLeave={() => { setHoveredDeckCard(null); clearCardKeywordHover(); }}
                      onClick={() => {
                        if (ruleCard.effect === "astronomyResearch") startResearchDraw("astronomy");
                        if (ruleCard.effect === "necromancyResearch") startResearchDraw("necromancy");
                      }}
                      onFocus={(event) => {
                        const bounds = event.currentTarget.getBoundingClientRect();
                        showDeckCardPreview(ruleCard, bounds.right, bounds.top);
                      }}
                      onBlur={() => { setHoveredDeckCard(null); clearCardKeywordHover(); }}
                    >
                      룰 : {ruleCard.name}{ruleCard.forged ? "+" : ""}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

            <div
              className={`hand ${phase === "discarding" ? "is-discarding" : ""} ${game.pendingDiscards > 0 ? "is-discard-choice" : ""} ${displayedHand.length >= 5 ? "is-crowded" : ""}`}
              data-drop-target="hand"
              aria-label="손패"
              onDragOver={(event) => {
                if (game.pendingResearchDraw === "necromancy" || canUseResearchDraw(game, "necromancy")) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }
              }}
              onDrop={(event) => {
                const payload = event.dataTransfer.getData("text/plain");
                if (!payload.startsWith("research-discard:")) return;
                event.preventDefault();
                const cardId = Number(payload.slice("research-discard:".length));
                if (Number.isInteger(cardId)) retrieveNecromancyResearchCard(cardId, true);
              }}
            >
            {displayedHand.map((card, index) => card ? (
                <button
                className={`game-card card-face ${card.kind} ${card.damageType} ${HAND_PASSIVE_EFFECTS.has(card.effect) ? "has-hand-aura" : card.effect === "slime" ? "has-danger-aura is-toxic-slime" : ""} ${dragging?.card.id === card.id ? "is-dragging" : ""} ${selectedHandCardId === card.id ? "is-keyboard-selected" : ""}`}
                key={card.id}
                ref={(element) => {
                  if (element) handCardRefs.current.set(card.id, element);
                  else handCardRefs.current.delete(card.id);
                }}
                style={{
                  "--card-index": index,
                  ...handFanStyle(index),
                } as CSSProperties}
                onPointerDown={(event) => {
                  setSelectedHandCardId(null);
                  beginDrag(event, card, { type: "hand" });
                }}
                onPointerMove={moveDrag}
                onPointerUp={finishDrag}
                onPointerCancel={cancelDrag}
                onMouseEnter={(event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  showCardKeywordOnly(card, bounds.right, bounds.top);
                }}
                onMouseMove={(event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  showCardKeywordOnly(card, bounds.right, bounds.top);
                }}
                onMouseLeave={() => { setHoveredDeckCard(null); clearCardKeywordHover(); }}
                onBlur={() => { setHoveredDeckCard(null); clearCardKeywordHover(); }}
                onClick={() => game.pendingDiscards > 0 && discardSelectedCard(card.id)}
                onDoubleClick={() => playHandCardOnDoubleClick(card)}
                disabled={controlsLocked && game.pendingDiscards === 0}
                aria-label={UNPLAYABLE_CARD_EFFECTS.has(card.effect) ? `${card.name}, 비용 -, 사용 불가` : `${card.name}, 에너지 ${cardEnergyCost(card, lawResearchCount, game.forgeCount)}`}
              >
                <CardFace card={card} starsSpent={game.starsSpent} strength={game.strength + combatManualBonus} agility={game.agility + combatManualBonus} defenseMultiplier={game.defenseMultiplier} ruleCostReduction={lawResearchCount} forgeCount={game.forgeCount} />
              </button>
              ) : <div className="hand-card-placeholder" aria-hidden="true" key={`clear-slot-${index}`} style={handFanStyle(index)} />)}
            {game.hand.length === 0 && phase === "playing" && game.status === "playing" && (
              <div className="empty-hand">사용할 카드가 없습니다</div>
            )}
          </div>

          <div className="controls">
            <button className="end-turn" onClick={endTurn} disabled={controlsLocked}>
              턴 종료 (E) <span>→</span>
            </button>
          </div>
        </div>

        {game.status !== "playing" && (
          <div className="result-overlay" role="dialog" aria-modal="true" aria-labelledby="result-title">
            <div className={`result-card ${game.status === "won" ? "has-rewards" : ""}`}>
              <p>{game.status === "won" ? "BATTLE CLEARED" : "RUN ENDED"}</p>
              <h2 id="result-title">{game.status === "won" ? "승리" : "패배"}</h2>
              <span>{game.status === "won"
                ? `${game.playerHp} 체력으로 전투를 마쳤습니다.`
                : `${game.turn}턴에서 탐험이 끝났습니다.`}</span>
              {game.status === "won" && (
                <div className="battle-reward-section">
                  <strong>전투 보상</strong>
              <small>골드는 획득하고, 추가 보상은 이 바닥에 떨어집니다.</small>
                  <div className="battle-gold-reward">골드 +{battleRewardGold}</div>
                  <div className="battle-reward-cards">
                    {battleRewards.map((card) => (
                      <div
                        className={`battle-reward-card card-face ${card.kind} ${card.damageType}`}
                        key={card.id}
                        onMouseEnter={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          showCardKeywordOnly(card, bounds.right, bounds.top);
                        }}
                        onMouseMove={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          showCardKeywordOnly(card, bounds.right, bounds.top);
                        }}
                        onMouseLeave={() => { setHoveredDeckCard(null); clearCardKeywordHover(); }}
                      >
                        <CardFace card={card} />
                      </div>
                    ))}
                    {battleRewardDecks.map((deck) => (
                      <div className="battle-reward-deck" key={deck.id}>
                        <span className="floor-deck-icon" aria-hidden="true" />
                        <strong><DeckName deck={deck} /></strong>
                        <span>{deck.cards.length} / {deck.capacity}</span>
                      </div>
                    ))}
                    {battleRewardConsumables.map((item) => (
                      <div
                        className={`battle-reward-consumable consumable-ticket ${item.type}`}
                        key={item.id}
                        title={item.description}
                        onMouseEnter={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          showConsumablePreview(item, bounds.right, bounds.top);
                        }}
                        onMouseMove={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          showConsumablePreview(item, bounds.right, bounds.top);
                        }}
                        onMouseLeave={() => setHoveredConsumable(null)}
                        onFocus={(event) => {
                          const bounds = event.currentTarget.getBoundingClientRect();
                          showConsumablePreview(item, bounds.right, bounds.top);
                        }}
                        onBlur={() => setHoveredConsumable(null)}
                      >
                        <strong>{item.name}</strong>
                        <small>{item.description}</small>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button
                onClick={game.status === "won" ? returnToMap : startNewRun}
              >
                {game.status === "won" ? "다음" : "새 탐험 시작"}
              </button>
            </div>
          </div>
        )}

        {hoveredConsumable && !consumableDrag && (
          <aside
            className={`deck-consumable-preview-floating ${hoveredConsumable.type}`}
            style={{ left: deckPreviewPosition.x, top: deckPreviewPosition.y }}
            aria-live="polite"
          >
            <strong>{hoveredConsumable.name}</strong>
            <p>{hoveredConsumable.description}</p>
          </aside>
        )}

        {dragging?.moved && (
          <div
            className="drag-stack-preview"
            style={{
              left: dragging.x,
              top: dragging.y,
              height: `${CARD_HEIGHT + Math.max(0, dragging.cards.length - 1) * getStackOffset(dragging.cards.length)}px`,
            }}
            aria-hidden="true"
          >
            {dragging.cards.map((card, index) => (
              <div
                className={`drag-card-preview card-face ${card.kind} ${card.damageType}`}
                style={{ top: `${index * getStackOffset(dragging.cards.length)}px` }}
                key={card.id}
              >
                <CardFace card={card} strength={game.strength + combatManualBonus} agility={game.agility + combatManualBonus} defenseMultiplier={game.defenseMultiplier} ruleCostReduction={lawResearchCount} forgeCount={game.forgeCount} />
              </div>
            ))}
          </div>
        )}
      </section>

    </main>
  );
}
