// User-named room saves, persisted to localStorage as a list shown alongside the read-only built-in
// samples in the Files modal. The Builder doc is stored serialized (serializeDoc); loading round-trips
// through loadAny. Guarded for the node/jsdom test env where localStorage may be absent.

const KEY = "domus.editor.rooms";

export type SavedRoom = { name: string; doc: string };

// URL-safe id for a room name ("Graph Manor" → "graph-manor"), used by the /build/:roomId route.
export const roomSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const listSavedRooms = (): SavedRoom[] => {
  try {
    if (typeof localStorage === "undefined") return [];
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as SavedRoom[];
  } catch {
    return [];
  }
};

const write = (rooms: SavedRoom[]): void => {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(rooms));
  } catch {
    /* storage unavailable — nothing to persist */
  }
};

// Upsert by name: saving over an existing name replaces it, and the newest entry sorts last.
export const saveRoom = (name: string, doc: string): void => {
  write([...listSavedRooms().filter((r) => r.name !== name), { name, doc }]);
};

export const deleteSavedRoom = (name: string): void => {
  write(listSavedRooms().filter((r) => r.name !== name));
};
