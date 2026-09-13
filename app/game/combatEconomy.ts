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
