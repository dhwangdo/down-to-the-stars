import assert from "node:assert/strict";
import test from "node:test";

import {
  beginTelemetryRun,
  createTelemetryRecorder,
  finishTelemetryRun,
  hasActiveTelemetryRun,
  resetTelemetryRecorder,
} from "../app/game/telemetry.ts";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    has: (key) => values.has(key),
  };
}

test("telemetry resumes an active run after a page reload", () => {
  const previousWindow = globalThis.window;
  const storage = createStorage();
  globalThis.window = { localStorage: storage };

  try {
    const firstRecorder = createTelemetryRecorder();
    beginTelemetryRun(firstRecorder, {
      playerName: "테스트",
      mapSeed: "seed",
      startingDecks: [],
      activeDeckId: "starter",
    });
    const runId = firstRecorder.activeRunId;

    const reloadedRecorder = createTelemetryRecorder();
    assert.equal(reloadedRecorder.activeRunId, runId);
    assert.equal(hasActiveTelemetryRun(reloadedRecorder), true);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("finished telemetry stays until the next run or explicit reset", () => {
  const previousWindow = globalThis.window;
  const storage = createStorage();
  globalThis.window = { localStorage: storage };

  try {
    const recorder = createTelemetryRecorder();
    beginTelemetryRun(recorder, {
      playerName: "테스트",
      mapSeed: "seed",
      startingDecks: [],
      activeDeckId: "starter",
    });
    finishTelemetryRun(recorder, "abandoned");
    assert.equal(storage.has("down-to-the-stars.telemetry.v2"), true);

    const nextRecorder = createTelemetryRecorder();
    beginTelemetryRun(nextRecorder, {
      playerName: "새 런",
      mapSeed: "next-seed",
      startingDecks: [],
      activeDeckId: "starter",
    });
    assert.equal(nextRecorder.store.runs.length, 1);
    resetTelemetryRecorder(nextRecorder);
    assert.equal(storage.has("down-to-the-stars.telemetry.v2"), false);
  } finally {
    globalThis.window = previousWindow;
  }
});
