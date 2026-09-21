export const RUN_SAVE_KEY = "down-to-the-stars:run-save";
export const RUN_SAVE_VERSION = 1;

export const RUN_SAVE_POLICY = {
  afterEveryMapMove: true,
  mapMoveDelayMs: 50,
  stateChangeDelayMs: 50,
  roamingIntervalMs: 60_000,
} as const;

export type RunSaveEnvelope<T> = {
  version: typeof RUN_SAVE_VERSION;
  savedAt: string;
  state: T;
};

export function readRunSave<T>(): RunSaveEnvelope<T> | null {
  try {
    const raw = window.localStorage.getItem(RUN_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RunSaveEnvelope<T>>;
    if (parsed.version !== RUN_SAVE_VERSION || !parsed.state) return null;
    return parsed as RunSaveEnvelope<T>;
  } catch {
    return null;
  }
}

export function writeRunSave<T>(state: T) {
  const envelope: RunSaveEnvelope<T> = {
    version: RUN_SAVE_VERSION,
    savedAt: new Date().toISOString(),
    state,
  };
  window.localStorage.setItem(RUN_SAVE_KEY, JSON.stringify(envelope));
}

export function clearRunSave() {
  window.localStorage.removeItem(RUN_SAVE_KEY);
}
