const TELEMETRY_STORAGE_KEY = "down-to-the-stars.telemetry.v2";
const TELEMETRY_SCHEMA_VERSION = 4;

export type TelemetryCardSnapshot = {
  id: number;
  name: string;
  effect: string;
  rarity: string;
  cost: number | null;
  forgeCount: number;
};

export type TelemetryDeckSnapshot = {
  id: string;
  name: string;
  capacity: number;
  editions: string[];
  cards: TelemetryCardSnapshot[];
};

export type TelemetryEnemySnapshot = {
  id: string;
  name: string;
  variant: string;
  maxHp: number;
  hp: number;
  isBoss: boolean;
};

export type TelemetryCardAcquisition = {
  at: string;
  source: "battle-reward" | "shop" | "card-pack" | "floor" | "treasure-chest";
  card: TelemetryCardSnapshot;
};

export type TelemetryAcquisitionSource =
  | "battle-reward"
  | "shop"
  | "card-pack"
  | "floor"
  | "treasure-chest"
  | "blessing"
  | "shrine"
  | "other";

export type TelemetryConsumableSnapshot = {
  id: string;
  type: string;
  name: string;
};

export type TelemetryAcquisition = {
  at: string;
  source: TelemetryAcquisitionSource;
  kind: "gold" | "consumable" | "deck";
  amount?: number;
  consumable?: TelemetryConsumableSnapshot;
  deck?: TelemetryDeckSnapshot;
};

export type TelemetryTurn = {
  turn: number;
  damageDealt: number;
  damageTaken: number;
};

export type TelemetryBattle = {
  id: string;
  startedAt: string;
  endedAt?: string;
  region: number;
  deck: TelemetryDeckSnapshot;
  enemies: TelemetryEnemySnapshot[];
  startingPlayerHp: number;
  endingPlayerHp?: number;
  turns: number;
  damageDealt: number;
  damageTaken: number;
  turnStats: TelemetryTurn[];
  cardsPlayed: TelemetryCardSnapshot[];
  result?: "won" | "lost";
  /** 적별로 실제 플레이어 HP에 들어온 피해만 기록한다. */
  damageByEnemy: Record<string, number>;
};

export type TelemetryRun = {
  id: string;
  startedAt: string;
  endedAt?: string;
  playerName: string;
  mapSeed: string;
  startingDecks: TelemetryDeckSnapshot[];
  activeDeckId: string;
  acquiredCards: TelemetryCardAcquisition[];
  acquisitions: TelemetryAcquisition[];
  battles: TelemetryBattle[];
  result?: "won" | "lost" | "abandoned";
};

export type TelemetryStore = {
  schemaVersion: number;
  game: "Down to the Stars";
  runs: TelemetryRun[];
};

export type TelemetryRecorder = {
  store: TelemetryStore;
  activeRunId: string | null;
  activeBattleId: string | null;
};

type RunStart = {
  playerName: string;
  mapSeed: string;
  startingDecks: TelemetryDeckSnapshot[];
  activeDeckId: string;
};

type BattleStart = {
  region: number;
  deck: TelemetryDeckSnapshot;
  enemies: TelemetryEnemySnapshot[];
  startingPlayerHp: number;
};

function makeId(prefix: string) {
  const randomUuid = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${randomUuid}`;
}

function emptyStore(): TelemetryStore {
  return { schemaVersion: TELEMETRY_SCHEMA_VERSION, game: "Down to the Stars", runs: [] };
}

function loadStore(): TelemetryStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TELEMETRY_STORAGE_KEY) ?? "null") as Partial<TelemetryStore> | null;
    // 이전의 장황한 로그는 새 형식과 섞지 않는다.
    if (!parsed || parsed.schemaVersion !== TELEMETRY_SCHEMA_VERSION || !Array.isArray(parsed.runs)) return emptyStore();
    const runs = parsed.runs.map((run) => ({
      ...run,
      acquiredCards: Array.isArray(run.acquiredCards) ? run.acquiredCards : [],
      acquisitions: Array.isArray(run.acquisitions) ? run.acquisitions : [],
      battles: Array.isArray(run.battles)
        ? run.battles.map((battle) => ({
          ...battle,
          damageByEnemy: battle.damageByEnemy ?? {},
          cardsPlayed: Array.isArray(battle.cardsPlayed) ? battle.cardsPlayed : [],
          // 턴별 기록을 추가하기 전의 로그는 전체 합계를 마지막 턴에 보존한다.
          turnStats: Array.isArray(battle.turnStats)
            ? battle.turnStats
            : [{
              turn: Math.max(1, Number(battle.turns) || 1),
              damageDealt: Math.max(0, Number(battle.damageDealt) || 0),
              damageTaken: Math.max(0, Number(battle.damageTaken) || 0),
            }],
        }))
        : [],
    }));
    return {
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      game: "Down to the Stars",
      runs,
    };
  } catch {
    return emptyStore();
  }
}

function persist(recorder: TelemetryRecorder) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(recorder.store));
  } catch {
    // 로그 저장 실패가 게임 플레이를 막지는 않게 한다.
  }
}

function activeRun(recorder: TelemetryRecorder) {
  return recorder.activeRunId === null
    ? undefined
    : recorder.store.runs.find((run) => run.id === recorder.activeRunId);
}

function activeBattle(recorder: TelemetryRecorder) {
  const run = activeRun(recorder);
  return run && recorder.activeBattleId !== null
    ? run.battles.find((battle) => battle.id === recorder.activeBattleId)
    : undefined;
}

export function createTelemetryRecorder(): TelemetryRecorder {
  const store = loadStore();
  const resumableRun = [...store.runs].reverse().find((run) => !run.endedAt);
  const resumableBattle = resumableRun?.battles
    .slice()
    .reverse()
    .find((battle) => !battle.endedAt);
  return {
    store,
    activeRunId: resumableRun?.id ?? null,
    activeBattleId: resumableBattle?.id ?? null,
  };
}

export function hasActiveTelemetryRun(recorder: TelemetryRecorder) {
  const run = activeRun(recorder);
  return run !== undefined && run.endedAt === undefined;
}

export function beginTelemetryRun(recorder: TelemetryRecorder, input: RunStart) {
  recorder.store = emptyStore();
  const run: TelemetryRun = {
    id: makeId("run"),
    startedAt: new Date().toISOString(),
    playerName: input.playerName,
    mapSeed: input.mapSeed,
    startingDecks: input.startingDecks,
    activeDeckId: input.activeDeckId,
    acquiredCards: [],
    acquisitions: [],
    battles: [],
  };
  recorder.store.runs.push(run);
  recorder.activeRunId = run.id;
  recorder.activeBattleId = null;
  persist(recorder);
}

export function beginTelemetryBattle(recorder: TelemetryRecorder, input: BattleStart) {
  if (!activeRun(recorder)) return;
  const battle: TelemetryBattle = {
    id: makeId("battle"),
    startedAt: new Date().toISOString(),
    region: input.region,
    deck: input.deck,
    enemies: input.enemies,
    startingPlayerHp: input.startingPlayerHp,
    turns: 1,
    damageDealt: 0,
    damageTaken: 0,
    turnStats: [{ turn: 1, damageDealt: 0, damageTaken: 0 }],
    cardsPlayed: [],
    damageByEnemy: {},
  };
  activeRun(recorder)!.battles.push(battle);
  recorder.activeBattleId = battle.id;
  persist(recorder);
}

export function recordTelemetryDamage(recorder: TelemetryRecorder, dealt: number, taken: number, turn = 1) {
  const battle = activeBattle(recorder);
  if (!battle) return;
  const safeDealt = Math.max(0, dealt);
  const safeTaken = Math.max(0, taken);
  const safeTurn = Math.max(1, Math.floor(turn));
  const turnStats = battle.turnStats ?? (battle.turnStats = []);
  const currentTurn = turnStats.find((entry) => entry.turn === safeTurn);
  if (currentTurn) {
    currentTurn.damageDealt += safeDealt;
    currentTurn.damageTaken += safeTaken;
  } else {
    turnStats.push({ turn: safeTurn, damageDealt: safeDealt, damageTaken: safeTaken });
    turnStats.sort((left, right) => left.turn - right.turn);
  }
  battle.damageDealt += safeDealt;
  battle.damageTaken += safeTaken;
  persist(recorder);
}

export function recordTelemetryEnemyDamage(recorder: TelemetryRecorder, enemyId: string, amount: number) {
  const battle = activeBattle(recorder);
  const safeAmount = Math.max(0, Number(amount) || 0);
  if (!battle || safeAmount <= 0) return;
  battle.damageByEnemy[enemyId] = (battle.damageByEnemy[enemyId] ?? 0) + safeAmount;
  persist(recorder);
}

export function recordTelemetryCardPlayed(recorder: TelemetryRecorder, card: TelemetryCardSnapshot) {
  const battle = activeBattle(recorder);
  if (!battle) return;
  battle.cardsPlayed.push(card);
  persist(recorder);
}

export function recordTelemetryCardAcquired(
  recorder: TelemetryRecorder,
  card: TelemetryCardSnapshot,
  source: TelemetryCardAcquisition["source"],
) {
  const run = activeRun(recorder);
  if (!run || run.acquiredCards.some((item) => item.card.id === card.id)) return;
  run.acquiredCards.push({ at: new Date().toISOString(), source, card });
  persist(recorder);
}

export function recordTelemetryGoldAcquired(
  recorder: TelemetryRecorder,
  amount: number,
  source: TelemetryAcquisitionSource,
) {
  const run = activeRun(recorder);
  const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
  if (!run || safeAmount <= 0) return;
  run.acquisitions.push({ at: new Date().toISOString(), source, kind: "gold", amount: safeAmount });
  persist(recorder);
}

export function recordTelemetryConsumableAcquired(
  recorder: TelemetryRecorder,
  consumable: TelemetryConsumableSnapshot,
  source: TelemetryAcquisitionSource,
) {
  const run = activeRun(recorder);
  if (!run || run.acquisitions.some((item) => item.kind === "consumable" && item.consumable?.id === consumable.id)) return;
  run.acquisitions.push({ at: new Date().toISOString(), source, kind: "consumable", consumable });
  persist(recorder);
}

export function recordTelemetryDeckAcquired(
  recorder: TelemetryRecorder,
  deck: TelemetryDeckSnapshot,
  source: TelemetryAcquisitionSource,
) {
  const run = activeRun(recorder);
  if (!run || run.acquisitions.some((item) => item.kind === "deck" && item.deck?.id === deck.id)) return;
  run.acquisitions.push({ at: new Date().toISOString(), source, kind: "deck", deck });
  persist(recorder);
}

export function finishTelemetryBattle(
  recorder: TelemetryRecorder,
  result: "won" | "lost",
  turns: number,
  endingPlayerHp: number,
) {
  const battle = activeBattle(recorder);
  if (!battle || battle.endedAt) return;
  battle.endedAt = new Date().toISOString();
  battle.result = result;
  battle.turns = Math.max(battle.turns, turns);
  battle.endingPlayerHp = endingPlayerHp;
  recorder.activeBattleId = null;
  persist(recorder);
  if (result === "lost") finishTelemetryRun(recorder, "lost");
}

export function finishTelemetryRun(recorder: TelemetryRecorder, result: "won" | "lost" | "abandoned") {
  const run = activeRun(recorder);
  if (!run || run.endedAt) return;
  run.endedAt = new Date().toISOString();
  run.result = result;
  recorder.activeBattleId = null;
  persist(recorder);
}

export function resetTelemetryRecorder(recorder: TelemetryRecorder) {
  recorder.store = emptyStore();
  recorder.activeRunId = null;
  recorder.activeBattleId = null;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(TELEMETRY_STORAGE_KEY);
    } catch {
      // 로그 초기화 실패가 게임 플레이를 막지는 않게 한다.
    }
  }
}

export function exportTelemetryJson(recorder: TelemetryRecorder) {
  return JSON.stringify({ ...recorder.store, exportedAt: new Date().toISOString() }, null, 2);
}

function formatTelemetryAmount(amount: number) {
  return Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function exportTelemetryText(recorder: TelemetryRecorder) {
  const lines = ["Down to the Stars 피해 기록", `저장 시각: ${new Date().toISOString()}`, ""];
  recorder.store.runs.forEach((run, runIndex) => {
    lines.push(`탐험 ${runIndex + 1}`);
    run.acquisitions.forEach((acquisition) => {
      if (acquisition.kind === "gold") lines.push(`골드 +${formatTelemetryAmount(acquisition.amount ?? 0)}`);
      if (acquisition.kind === "consumable") lines.push(`소모품 획득: ${acquisition.consumable?.name ?? "이름 없음"}`);
      if (acquisition.kind === "deck") lines.push(`덱 획득: '${acquisition.deck?.name ?? "이름 없음"}'`);
    });
    run.battles.forEach((battle, battleIndex) => {
      lines.push(`전투 ${battleIndex + 1}`);
      const entries = battle.enemies
        .map((enemy) => ({ enemy, amount: battle.damageByEnemy?.[enemy.id] ?? 0 }))
        .filter(({ amount }) => amount > 0);
      if (entries.length === 0) {
        const enemyNames = battle.enemies.map((enemy) => enemy.name).join(", ") || "적";
        lines.push(`${enemyNames}랑 싸워서 0 피해`);
      }
      else entries.forEach(({ enemy, amount }) => lines.push(`${enemy.name}에게 ${formatTelemetryAmount(amount)} 피해를 받았습니다.`));
    });
    if (run.battles.length === 0) lines.push("전투 기록 없음");
    lines.push("");
  });
  if (recorder.store.runs.length === 0) lines.push("기록 없음");
  return lines.join("\n");
}
