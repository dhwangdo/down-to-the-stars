export const TICKET_TYPES = [
  "paintTicket",
  "mindEyeTicket",
  "darkTicket",
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
  mapTicket: 2,
  mindEyeTicket: 1,
  darkTicket: 1,
  transformTicket: 2,
  cloneTicket: 3,
};

export function ticketBasePrice(type: TicketType) {
  return 30 + (TICKET_TIERS[type] - 1) * 50;
}
