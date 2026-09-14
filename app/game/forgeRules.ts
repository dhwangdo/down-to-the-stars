export function cardCostAfterForgePlacement(
  card: { cost?: number },
  exchangedCost?: number,
) {
  return exchangedCost ?? card.cost;
}
