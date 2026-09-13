export const TICKET_TYPES = [
  "paintTicket",
  "mindEyeTicket",
  "bombTicket",
  "extractTicket",
  "transformTicket",
  "mapTicket",
  "cloneTicket",
] as const;

export type TicketType = typeof TICKET_TYPES[number];

export const TICKET_TIERS: Record<TicketType, 1 | 2 | 3> = {
  paintTicket: 1,
  bombTicket: 1,
  extractTicket: 1,
  mapTicket: 1,
  mindEyeTicket: 1,
  transformTicket: 2,
  cloneTicket: 3,
};

export function ticketBasePrice(type: TicketType) {
  return TICKET_TIERS[type] * 30;
}
