import type { OccasionDef, SiteDef, SiteId, TwistId } from "../types";

// Twists: the guest of honour changes one rule for the evening.
export const TWISTS: Record<TwistId, { name: string; rule: string }> = {
  none: { name: "A kind guest", rule: "No special rule. He is here to be pleased." },
  plainFolk: { name: "Plain folk", rule: "Comfort counts double. Nobody here will touch anything that sells for more than a seed cake (6 coin)." },
  gourmet: { name: "The palate", rule: "Bread, tea, scones and posies count for nothing. Only the better things register." },
  brisk: { name: "A brisk inspection", rule: "He stays half the evening. Whatever is not served by then is not served." },
  register: { name: "The register", rule: "More is vulgar: each guest accepts three kinds, no more. They are offered the dearest on the menu first, so strike off what you would not have them take." },
  candlelight: { name: "By candlelight", rule: "Grace counts only in a candle-lit room. (Candles are still-room work, from honey: one box lights one room.)" },
  harvest: { name: "Hearty appetites", rule: "Everyone takes two of everything." },
  visitation: { name: "No alchemy on show", rule: "The Church does not hold with it. Nothing served in a room with a device in it counts at all." },
  precedence: { name: "Precedence", rule: "Only what is served at the Master's own table counts. Guests seated in any other room are ornament." },
  envoy: { name: "The Crown's standard", rule: "Candlelight or no Grace at all (candles are still-room work, from honey), and bread, tea, scones and posies count for nothing." },
};

// Each chapter ends in an occasion, and the house chooses which card to accept. The humble one
// is always on the table. The grand one is sent only to a house whose last occasion went well;
// the royal one only after a triumph. Names without a canon source are roles, not names.
export const OCCASIONS: OccasionDef[] = [
  {
    id: "tea",
    name: "An Afternoon Tea",
    grade: "humble",
    chapter: 1,
    guests: 3,
    target: 1000,
    honourName: "The young priest",
    honourFace: "🧑‍🦱",
    twist: "none",
    intro: "A friend from the parish has asked whether the Master is At Home. It is the first time anyone has asked.",
    gift: { kind: "recipe", ref: "cake" },
  },
  {
    id: "squire",
    name: "The Squire's Lady to Tea",
    grade: "grand",
    chapter: 1,
    guests: 4,
    target: 8000,
    honourName: "The squire's lady",
    honourFace: "👒",
    twist: "none",
    intro: "Or the Master might aim a little higher for his first At Home. The squire's lady has been heard to wonder aloud what goes on in that house.",
    gift: { kind: "recipe", ref: "stew" },
  },
  {
    id: "parish",
    name: "A Parish Supper",
    grade: "humble",
    chapter: 2,
    guests: 6,
    target: 20000,
    honourName: "The churchwarden",
    honourFace: "👴",
    twist: "plainFolk",
    intro: "The parish would like to come to supper. They are easily pleased, and they will tell everyone.",
    gift: { kind: "coin", ref: "coin", amount: 40 },
  },
  {
    id: "dinner",
    name: "A Dinner for the Gourmet",
    grade: "grand",
    chapter: 2,
    guests: 7,
    target: 200000,
    honourName: "The gourmet",
    honourFace: "🧐",
    twist: "gourmet",
    intro: "The tea was talked about. A gentleman who dines out for a living has sent his card.",
    gift: { kind: "recipe", ref: "pie" },
  },
  {
    id: "visitation",
    name: "The Archdeacon's Visitation",
    grade: "royal",
    chapter: 2,
    guests: 8,
    target: 1000000,
    honourName: "The archdeacon",
    honourFace: "🧙‍♂️",
    twist: "visitation",
    intro: "The tea was a triumph, and the Church has noticed. The archdeacon will dine, and he will be looking at the walls.",
    gift: { kind: "device", ref: "hearthstone" },
  },
  {
    id: "rival",
    name: "The Rival Master's Call",
    grade: "humble",
    chapter: 3,
    guests: 8,
    target: 200000,
    honourName: "The rival Master",
    honourFace: "🧔",
    twist: "brisk",
    intro: "A retired Master of Hospitality has heard there is an amateur in the county. He is coming to see for himself, and he has brought a wager.",
    gift: { kind: "tool", ref: "tray" },
  },
  {
    id: "weekend",
    name: "Saturday-to-Monday",
    grade: "grand",
    chapter: 3,
    guests: 10,
    target: 2500000,
    honourName: "The arbiter of taste",
    honourFace: "👸",
    twist: "register",
    intro: "A house party. The lady who decides what is done and what is Not Done has accepted.",
    gift: { kind: "device", ref: "crystal" },
  },
  {
    id: "shooting",
    name: "The Duke's Shooting Party",
    grade: "royal",
    chapter: 3,
    guests: 12,
    target: 12000000,
    honourName: "The duke",
    honourFace: "🤴",
    twist: "precedence",
    intro: "A duke goes where he likes, and this autumn he likes it here. He dines at the host's table or not at all.",
    gift: { kind: "device", ref: "samovar" },
  },
  {
    id: "harvest",
    name: "The Harvest Feast",
    grade: "humble",
    chapter: 4,
    guests: 12,
    target: 2000000,
    honourName: "The whole village",
    honourFace: "🧑‍🌾",
    twist: "harvest",
    intro: "The village would like to hold the harvest feast in the big house, if the Master doesn't mind.",
    gift: { kind: "coin", ref: "coin", amount: 150 },
  },
  {
    id: "gala",
    name: "The Gala",
    grade: "grand",
    chapter: 4,
    guests: 14,
    target: 25000000,
    honourName: "Lady Lucia",
    honourFace: "👩‍🦳",
    twist: "candlelight",
    intro: "The season ends here. Lady Lucia has accepted, and where she goes the county follows.",
    gift: { kind: "coin", ref: "coin", amount: 300 },
  },
  {
    id: "envoy",
    name: "The Crown's Envoy",
    grade: "royal",
    chapter: 4,
    guests: 16,
    target: 100000000,
    honourName: "The Crown's envoy",
    honourFace: "🫅",
    twist: "envoy",
    intro: "The Crown has heard of a house in the county that does things properly. Its envoy will judge whether that is so.",
    gift: { kind: "coin", ref: "coin", amount: 600 },
  },
];

/** Working days before each chapter's occasion (the occasion is the evening of the last). */
export const CHAPTER_DAYS = [3, 3, 3, 3];
export const CHAPTERS = CHAPTER_DAYS.length;

const SITE_LIST: SiteDef[] = [
  {
    id: "forest",
    name: "The forest",
    glyph: "🌲",
    blurb: "Berries at the edge, honey further in. Brambles, wasps and worse the deeper she goes.",
    key: "firerod",
    closedOnSabbath: false,
    depths: [
      { text: "The edge of the wood: bramble thickets heavy with berries.", loot: [["berries", 3, 4], ["herbs", 1, 2]], risk: 0, hazard: "" },
      { text: "A clearing humming with wild bees.", loot: [["honey", 2, 3], ["herbs", 1, 2]], risk: 0.2, hazard: "The bees objected." },
      { text: "Old trees. The combs here have never been cut.", loot: [["honey", 3, 4], ["berries", 2, 3]], risk: 0.38, hazard: "She put her foot in a snare." },
      { text: "The deep wood, where the webs are as thick as curtains.", loot: [["honey", 5, 6], ["herbs", 3, 4]], risk: 0.58, hazard: "Something with too many legs took exception." },
    ],
  },
  {
    id: "lake",
    name: "The lake",
    glyph: "🏞️",
    blurb: "Fish for the table. The weather turns without warning.",
    key: "oilskin",
    closedOnSabbath: false,
    depths: [
      { text: "The near shore, a borrowed rod.", loot: [["fish", 1, 2]], risk: 0, hazard: "" },
      { text: "Out on the jetty where the big ones lie.", loot: [["fish", 2, 3]], risk: 0.22, hazard: "The jetty was rotten." },
      { text: "A rowing boat, the far reeds.", loot: [["fish", 3, 4], ["herbs", 1, 2]], risk: 0.4, hazard: "A squall came over the hill." },
      { text: "The island in the middle, where nobody fishes.", loot: [["fish", 5, 6]], risk: 0.6, hazard: "The boat went over." },
    ],
  },
  {
    id: "caves",
    name: "The caves",
    glyph: "🕳️",
    blurb: "Star salt for the still-room. Dark, and not empty.",
    key: "lantern",
    closedOnSabbath: false,
    depths: [
      { text: "The cave mouth, glittering faintly.", loot: [["salt", 1, 1]], risk: 0.15, hazard: "Loose scree at the entrance." },
      { text: "A gallery where the walls shine.", loot: [["salt", 1, 2]], risk: 0.35, hazard: "Her candle went out." },
      { text: "The lower chamber.", loot: [["salt", 2, 3]], risk: 0.55, hazard: "It was somebody's home." },
    ],
  },
];

// Short scenes. PLACEHOLDER WORDING — written for the prototype so the beats can be felt; every
// line here is the author's to rewrite or strike. The card-challenge beat follows
// docs/writing/scenes/card-challenge.md (the wager, the loss, Violet's obedience "to the letter").
export const SCENES: Record<string, { title: string; text: string }> = {
  violetLost: {
    title: "The wager",
    text: "The rival Master had put a wager on the evening. The Master refused it. Violet, over his head, accepted. She left in the rival's carriage that night with one small bag, and did not look troubled. (Violet is gone for two days.)",
  },
  violetReturned: {
    title: "Returned, with compliments",
    text: "The rival Master brought Violet home himself, before breakfast. She had done everything he asked of her, exactly as he asked it, for two days. He would rather not discuss it. (Violet is back. The county has heard: Renown +1.)",
  },
  endBoth: {
    title: "One heart, one house",
    text: "The county came, and was charmed. But the best evenings were the ones nobody was invited to: supper in the kitchen, all of them, the Master included. He has not asked about the Stone in weeks.",
  },
  endAdmired: {
    title: "The talk of the county",
    text: "Every card on the hall table is from somebody who matters. The house runs like a watch. Upstairs, late, the laboratory lamp is still lit, and the Master is alone with his work.",
  },
  endLoved: {
    title: "A small house, well loved",
    text: "Society never did call. The village did, and the parish, and they still do. The household eats together every night, and nobody at that table would trade it.",
  },
  endBeginning: {
    title: "A beginning",
    text: "It was a hard first season. The house is still standing, the household is still in it, and next year they will know what they are doing.",
  },
};

export const SITES: Record<SiteId, SiteDef> = Object.fromEntries(SITE_LIST.map((s) => [s.id, s]));
export const SITE_IDS: SiteId[] = SITE_LIST.map((s) => s.id);
