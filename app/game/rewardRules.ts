export function nextRareCardDropChance(
  currentChance: number,
  cards: ReadonlyArray<{ rarity: string }>,
) {
  const card = cards[0];
  if (!card) return currentChance;
  return card.rarity === "rare" ? 0.05 : Math.min(1, currentChance + 0.02);
}
