export type ReshuffleCard = {
  id: number;
  token?: boolean;
};

export function cardsForNextShuffle<T extends ReshuffleCard>(
  cards: T[],
  removedCardIds: ReadonlySet<number>,
  cardsStillInPlayIds: ReadonlySet<number>,
) {
  return cards.filter((card) =>
    !card.token
    && !removedCardIds.has(card.id)
    && !cardsStillInPlayIds.has(card.id));
}

export function dealCardsToFixedPiles<T>(
  cards: T[],
  pileCount: number,
  cardsPerPile = 5,
): T[][] {
  const count = Math.max(0, Math.floor(pileCount));
  if (count === 0) return [];
  const piles = Array.from({ length: count }, () => [] as T[]);
  cards.forEach((card, cardIndex) => {
    const pileIndex = Math.min(Math.floor(cardIndex / cardsPerPile), count - 1);
    piles[pileIndex].push(card);
  });
  return piles;
}

/** Cards are dealt one at a time from the leftmost pile, then repeated. */
export function dealCardsEvenlyToPiles<T>(cards: T[], pileCount: number): T[][] {
  const count = Math.max(0, Math.floor(pileCount));
  if (count === 0) return [];
  const piles = Array.from({ length: count }, () => [] as T[]);
  cards.forEach((card, cardIndex) => {
    piles[cardIndex % count].push(card);
  });
  return piles;
}
