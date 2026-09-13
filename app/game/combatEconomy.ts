export function maximumBattleEnergy(rampaging: boolean) {
  return rampaging ? 4 : 3;
}

export function recoverBattleEnergy(currentEnergy: number, maximumEnergy: number) {
  return Math.min(currentEnergy + maximumEnergy, maximumEnergy);
}

export function economicResearchEnergyFloor(activeCopies: number) {
  return activeCopies <= 0 ? 0 : -3 * activeCopies;
}

export function canPayEnergyCost(currentEnergy: number, cost: number, activeEconomicResearchCopies: number) {
  return currentEnergy - cost >= economicResearchEnergyFloor(activeEconomicResearchCopies);
}

export function radianceDamage(otherRadiancesPlayedThisTurn: number) {
  return 4 + Math.max(0, otherRadiancesPlayedThisTurn) * 4;
}

export function calculateCardDamage(
  card: { effect: string; value: number },
  strength = 0,
  combatManualBonus = 0,
  radiancePlayedThisTurn = 0,
) {
  const baseDamage = card.effect === "radiance"
    ? radianceDamage(radiancePlayedThisTurn)
    : card.value;
  return baseDamage + strength + combatManualBonus;
}
