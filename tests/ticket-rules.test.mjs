import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeTicketById,
  findTicketById,
  groupConsumables,
  setBombTicketArmed,
} from "../app/game/ticketRules.ts";

const ticket = (id, type) => ({ id, type, name: type, description: type });

test("ticket lookup finds a matching ticket in inventory or on the current floor", () => {
  const areas = {
    inventory: [ticket("inventory-clone", "cloneTicket")],
    floor: [ticket("floor-transform", "transformTicket")],
  };

  assert.equal(findTicketById("inventory-clone", "cloneTicket", areas)?.id, "inventory-clone");
  assert.equal(findTicketById("floor-transform", "transformTicket", areas)?.id, "floor-transform");
});

test("consuming a valid inventory or floor ticket removes exactly that ticket", () => {
  const areas = {
    inventory: [ticket("clone", "cloneTicket"), ticket("other", "transformTicket")],
    floor: [ticket("floor", "cloneTicket")],
  };

  const inventoryResult = consumeTicketById("clone", "cloneTicket", areas);
  assert.deepEqual(inventoryResult?.inventory.map((item) => item.id), ["other"]);
  assert.deepEqual(inventoryResult?.floor.map((item) => item.id), ["floor"]);

  const floorResult = consumeTicketById("floor", "cloneTicket", areas);
  assert.deepEqual(floorResult?.inventory.map((item) => item.id), ["clone", "other"]);
  assert.deepEqual(floorResult?.floor, []);
});

test("missing or wrong-type tickets leave both areas unchanged", () => {
  const areas = {
    inventory: [ticket("clone", "cloneTicket")],
    floor: [ticket("transform", "transformTicket")],
  };

  assert.equal(consumeTicketById("missing", "cloneTicket", areas), null);
  assert.equal(consumeTicketById("transform", "cloneTicket", areas), null);
  assert.deepEqual(areas, {
    inventory: [ticket("clone", "cloneTicket")],
    floor: [ticket("transform", "transformTicket")],
  });
});

test("selecting one ticket does not require splitting an identical ticket stack", () => {
  const tickets = Array.from({ length: 5 }, (_, index) => ticket(`extract-${index}`, "extractTicket"));
  const groups = groupConsumables(tickets);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].consumableIds, tickets.map((item) => item.id));
});

test("consuming a clone ticket before granting a copy keeps the source consumed", () => {
  const areas = {
    inventory: [
      ...Array.from({ length: 4 }, (_, index) => ticket(`clone-${index}`, "cloneTicket")),
      ...Array.from({ length: 4 }, (_, index) => ticket(`extract-${index}`, "extractTicket")),
    ],
    floor: [],
  };
  const consumed = consumeTicketById("clone-3", "cloneTicket", areas);
  assert.ok(consumed);
  const inventory = [...consumed.inventory, ticket("extract-copy", "extractTicket")];

  assert.equal(inventory.filter((item) => item.type === "cloneTicket").length, 3);
  assert.equal(inventory.filter((item) => item.type === "extractTicket").length, 5);
});

test("setBombTicketArmed updates a bomb ticket in either area", () => {
  const areas = {
    inventory: [ticket("inventory-bomb", "bombTicket")],
    floor: [ticket("floor-bomb", "bombTicket")],
  };
  const armed = setBombTicketArmed("floor-bomb", true, areas);
  assert.equal(armed.inventory[0].armedMovesRemaining, undefined);
  assert.equal(armed.floor[0].armedMovesRemaining, 3);
  const disarmed = setBombTicketArmed("floor-bomb", false, armed);
  assert.equal(disarmed.floor[0].armedMovesRemaining, undefined);
});
