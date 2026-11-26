import { Value } from "@kitsune/common-web/src/value";

import { deserializeLevel, serializeLevel } from "./edit";
import { manorLevel } from "./sample-level";
import { Level } from "./types";

// The single "level the game is playing" — shared between the editor (writer) and the live scene
// (reader), so a room authored in the Builder tab becomes the room the Tidy House / haul sims run
// in. Persisted to localStorage so it survives a reload. Guarded for the node/jsdom test env where
// localStorage may be absent.

const KEY = "domus.game.level";

const loadSaved = (): Level | null => {
  try {
    if (typeof localStorage === "undefined") return null;
    const s = localStorage.getItem(KEY);
    return s ? deserializeLevel(s) : null;
  } catch {
    return null;
  }
};

export const currentLevel = Value<Level>(loadSaved() ?? manorLevel);

// Send a level to the game: persist it and update the reactive source the live scene reads.
export const saveCurrentLevel = (level: Level): void => {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, serializeLevel(level));
  } catch {
    /* storage unavailable — the in-memory Value still updates */
  }
  currentLevel.set(level);
};
