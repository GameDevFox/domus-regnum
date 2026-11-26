import type { DeviceDef, DeviceId } from "../types";

// Alchemy. Each device does one thing, and that thing is a step change: it removes a chore
// outright or doubles something. None of them replaces a maid — they take the drudgery off her
// so she can be put where a person is needed.
const DEVICE_LIST: DeviceDef[] = [
  { id: "dumbwaiter", name: "Dumbwaiter", glyph: "🛗", fits: ["kitchen", "shop", "parlour", "dining", "conservatory", "stillroom"], effect: "This room and the pantry share one shelf: no carrying to or from the cellar, ever." },
  { id: "everwarm", name: "Ever-warm range", glyph: "♨️", fits: ["kitchen", "stillroom"], effect: "Never needs stoking: batches here take half the time." },
  { id: "till", name: "Clockwork till", glyph: "⚙️", fits: ["shop"], effect: "Customers serve themselves from the counter. Nobody has to stand at it — though somebody must still carry stock to it." },
  { id: "samovar", name: "Self-pouring samovar", glyph: "🫖", fits: ["parlour", "dining"], effect: "Everyone seated here has tea at once, without stock and without a maid." },
  { id: "hearthstone", name: "Hearthstone", glyph: "🔥", fits: ["parlour", "dining"], effect: "The room is always warm: Comfort served here counts double." },
  { id: "crystal", name: "Singing crystal", glyph: "🔮", fits: ["parlour", "dining"], effect: "Music with no musician: Grace served here counts double (as a music room does for the whole house; the two do not stack)." },
  { id: "sunlamp", name: "Sun-lamp", glyph: "💡", fits: ["conservatory"], effect: "Summer under glass all year: everything here grows in half the time." },
  { id: "boiler", name: "Quickened boiler", glyph: "🚿", fits: ["bath"], effect: "Baths draw and heat themselves — and at an occasion the house has hot water with nobody tending it." },
  { id: "slippers", name: "Seven-league slippers", glyph: "🥿", fits: "tool", effect: "The maid who wears them walks and climbs twice as fast." },
  { id: "tray", name: "Featherweight tray", glyph: "🪶", fits: "tool", effect: "The maid who carries it carries three times as much." },
  { id: "lantern", name: "Cold-light lantern", glyph: "🏮", fits: "pack", effect: "Packed for an expedition: halves the danger in the caves." },
  { id: "firerod", name: "Fire-rod", glyph: "🪄", fits: "pack", effect: "Packed for an expedition: halves the danger in the forest." },
  { id: "oilskin", name: "Never-wet oilskin", glyph: "🧥", fits: "pack", effect: "Packed for an expedition: halves the danger on the lake." },
];

export const DEVICES: Record<DeviceId, DeviceDef> = Object.fromEntries(DEVICE_LIST.map((d) => [d.id, d]));
export const DEVICE_IDS: DeviceId[] = DEVICE_LIST.map((d) => d.id);
