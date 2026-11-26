import { MAID_DEFS } from "../sim/content/people";
import type { Game } from "../sim/types";
import { hearthLevel } from "../sim/house";
import { sfxBatch, sfxBell, sfxBird, sfxBurnt, sfxCoin, sfxCricket, sfxFancy, sfxLost, sfxNew, sfxResult, sfxServe } from "./sound";
import { toast } from "./store";

// Watches the game from one frame to the next and makes the noises for what changed. The sim
// knows nothing about sound; this is the only place the two meet.

type Snapshot = {
  game: Game | null;
  phase: string;
  coinEarned: number;
  made: number;
  lost: number;
  comfort: number;
  grace: number;
  burnt: number;
  owned: number;
  maids: number;
  level: number;
  renown: number;
  wings: number;
  fancies: number;
};

const snap: Snapshot = { game: null, phase: "", coinEarned: 0, made: 0, lost: 0, comfort: 0, grace: 0, burnt: 0, owned: 0, maids: 0, level: 1, renown: 0, wings: 0, fancies: 0 };

/** Sounds closer together than this are dropped, so a rush is a patter and not a wall. */
const MIN_GAP_SECONDS = 0.07;
let lastSound = 0;

const gate = (now: number): boolean => {
  if (now - lastSound < MIN_GAP_SECONDS) return false;
  lastSound = now;
  return true;
};

const take = (g: Game): void => {
  const evelyn = g.maids.find((m) => m.id === "evelyn");
  snap.game = g;
  snap.phase = g.phase;
  snap.coinEarned = g.today.coinEarned;
  snap.made = g.today.made;
  snap.lost = g.today.lost;
  snap.comfort = g.occasion?.comfort ?? 0;
  snap.grace = g.occasion?.grace ?? 0;
  snap.burnt = evelyn && MAID_DEFS.evelyn.lines.burnt.includes(evelyn.say) ? evelyn.sayLeft : 0;
  snap.owned = g.ownedDevices.length;
  snap.maids = g.maids.length;
  snap.level = hearthLevel(g.hearth);
  snap.renown = g.renown;
  snap.wings = Number(g.wingsOpen.west) + Number(g.wingsOpen.east);
  snap.fancies = g.occasion?.fancies ?? 0;
};

// The garden by day and by night: a bird or a cricket every few seconds, never on a beat.
const AMBIENCE_MIN_GAP = 3;
const AMBIENCE_SPREAD = 7;
let nextAmbience = 0;

const ambience = (g: Game, now: number): void => {
  if (now < nextAmbience) return;
  nextAmbience = now + AMBIENCE_MIN_GAP + Math.random() * AMBIENCE_SPREAD;
  const dark = g.phase === "occasion" || g.phase === "result" || g.phase === "offers" || g.phase === "sabbath";
  if (dark) sfxCricket();
  else if (g.phase === "day" || g.phase === "morning") sfxBird();
};

export const observe = (g: Game, now: number): void => {
  ambience(g, now);
  if (snap.game !== g) {
    take(g);
    return;
  }
  const evelyn = g.maids.find((m) => m.id === "evelyn");
  const burntNow = evelyn && MAID_DEFS.evelyn.lines.burnt.includes(evelyn.say) ? evelyn.sayLeft : 0;
  // Things worth saying out loud, over the house itself.
  const level = hearthLevel(g.hearth);
  if (level > snap.level) toast(`🔥 The Hearth burns brighter — every occasion ×${level}`);
  if (g.renown > snap.renown) toast(`Renown +${g.renown - snap.renown} — word gets round`);
  if (g.renown < snap.renown) toast("Renown −1 — callers went away unserved");
  if (g.maids.length > snap.maids) toast(`${MAID_DEFS[g.maids[g.maids.length - 1].id].name} has joined the household`);
  if (Number(g.wingsOpen.west) + Number(g.wingsOpen.east) > snap.wings) toast("The dust sheets come off: four more rooms");
  if ((g.occasion?.fancies ?? 0) > snap.fancies) sfxFancy();
  if (g.phase !== snap.phase) {
    if (g.phase === "day") sfxBell();
    else if (g.phase === "result" && g.occasion?.tier) sfxResult(g.occasion.tier);
    else if (g.phase === "occasion") sfxBell();
  } else if (g.ownedDevices.length > snap.owned || g.maids.length > snap.maids) {
    sfxNew();
  } else if (g.occasion && g.occasion.grace > snap.grace) {
    if (gate(now)) sfxServe(g.occasion.grace - snap.grace, true);
  } else if (g.occasion && g.occasion.comfort > snap.comfort) {
    if (gate(now)) sfxServe(g.occasion.comfort - snap.comfort, false);
  } else if (burntNow > snap.burnt) {
    sfxBurnt();
  } else if (g.today.coinEarned > snap.coinEarned && g.phase === "day") {
    if (gate(now)) sfxCoin();
  } else if (g.today.lost > snap.lost) {
    if (gate(now)) sfxLost();
  } else if (g.today.made > snap.made) {
    if (gate(now)) sfxBatch();
  }
  take(g);
};
