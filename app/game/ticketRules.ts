import type { Consumable, ConsumableType } from "./rewards";

export type ConsumableAreas = {
  inventory: readonly Consumable[];
  floor: readonly Consumable[];
};

export type ConsumableGroup = {
  consumable: Consumable;
  consumableIds: string[];
};

export function groupConsumables(consumables: readonly Consumable[]) {
  return Array.from(consumables.reduce((groups, consumable) => {
    const groupKey = [
      consumable.type,
      consumable.name,
      consumable.description,
      consumable.armedMovesRemaining ?? "idle",
    ].join(":");
    const current = groups.get(groupKey);
    if (current) {
      current.consumable = consumable;
      current.consumableIds.push(consumable.id);
    } else {
      groups.set(groupKey, { consumable, consumableIds: [consumable.id] });
    }
    return groups;
  }, new Map<string, ConsumableGroup>()).values());
}

export function findTicketById(
  ticketId: string,
  type: ConsumableType | undefined,
  areas: ConsumableAreas,
) {
  const matches = (item: Consumable) => item.id === ticketId
    && (type === undefined || item.type === type);
  return areas.inventory.find(matches) ?? areas.floor.find(matches);
}

export function consumeTicketById(
  ticketId: string,
  type: ConsumableType,
  areas: ConsumableAreas,
) {
  const ticket = findTicketById(ticketId, type, areas);
  if (!ticket) return null;
  return {
    ticket,
    inventory: areas.inventory.filter((item) => item.id !== ticketId),
    floor: areas.floor.filter((item) => item.id !== ticketId),
  };
}
