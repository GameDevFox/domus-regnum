// Things bought for their own sake. None of them does anything: they are there because a house
// someone loves has a cat on the stairs and roses by the door.
export type OrnamentDef = { id: string; name: string; glyph: string; cost: number; blurb: string };

export const ORNAMENTS: OrnamentDef[] = [
  { id: "cat", name: "A cat", glyph: "🐈", cost: 12, blurb: "Turns up one morning and stays. Sleeps wherever the fire is." },
  { id: "roses", name: "Rose bushes", glyph: "🌹", cost: 18, blurb: "Along the front of the house, either side of the door." },
  { id: "lanterns", name: "Lanterns by the door", glyph: "🏮", cost: 20, blurb: "Lit at dusk. The house can be seen from the road." },
  { id: "clock", name: "A long-case clock", glyph: "🕰️", cost: 30, blurb: "For the hall. It is four minutes slow and nobody will have it touched." },
  { id: "vane", name: "A weathervane", glyph: "🐓", cost: 24, blurb: "A brass cockerel for the roof. Points mostly at the laboratory." },
  { id: "bench", name: "A garden seat and a birdbath", glyph: "🪑", cost: 26, blurb: "On the lawn under the tree. Somebody is always just about to sit on it." },
  { id: "bunting", name: "Bunting", glyph: "🎏", cost: 16, blurb: "Strung along the eaves whenever guests are expected." },
  { id: "portraits", name: "Family portraits", glyph: "🖼️", cost: 34, blurb: "For the staircase wall. Nobody is quite sure whose family." },
];

export const ORNAMENT_BY_ID: Record<string, OrnamentDef> = Object.fromEntries(ORNAMENTS.map((o) => [o.id, o]));
