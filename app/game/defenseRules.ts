import type { CardBlueprint, CardEffect } from "./cards";

export type DefenseGainOptions = {
  agility?: number;
  baseValue?: number;
  defenseMultiplier?: number;
  repetitions?: number;
};

const FIXED_DEFENSE_VALUES: Partial<Record<CardEffect, number>> = {
  ironWave: 5,
  waterWave: 5,
  ironRampage: 8,
  starArk: 10,
  odinSpear: 15,
};

const VALUE_BASED_DEFENSE_EFFECTS = new Set<CardEffect>([
  "defend",
  "deflect",
  "iceShield",
  "starGuard",
  "plateArmorDefense",
]);

/** Ordinary defense effects share one calculation: base value + agility, then multiplier. */
export function getDefenseBaseValue(card: Pick<CardBlueprint, "effect" | "value">) {
  return FIXED_DEFENSE_VALUES[card.effect]
    ?? (VALUE_BASED_DEFENSE_EFFECTS.has(card.effect) ? card.value : 0);
}

export function calculateDefenseGain(
  card: Pick<CardBlueprint, "effect" | "value">,
  {
    agility = 0,
    baseValue: baseValueOverride,
    defenseMultiplier = 1,
    repetitions = 1,
  }: DefenseGainOptions = {},
) {
  const hasBaseValueOverride = baseValueOverride !== undefined;
  const baseValue = hasBaseValueOverride ? baseValueOverride : getDefenseBaseValue(card);
  if (!hasBaseValueOverride && baseValue === 0) return 0;
  return (baseValue + agility) * defenseMultiplier * repetitions;
}
