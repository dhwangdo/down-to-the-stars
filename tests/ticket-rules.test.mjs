import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeTicketById,
  findTicketById,
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
