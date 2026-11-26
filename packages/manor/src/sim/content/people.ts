import type { MaidDef, MaidId, TraitDef, TraitId } from "../types";

// The Master, Evelyn and Violet are canon (docs/writing). Every other name here is PROVISIONAL —
// invented for this prototype and waiting on the author. Victoria & Veronica appear in the old
// design docs as non-canon twins.
export const PROVISIONAL_NAMES: MaidId[] = ["victoria", "veronica", "marigold", "tabitha", "odette", "hazel", "beatrix", "rosalind", "agnes"];

const TRAIT_LIST: TraitDef[] = [
  { id: "master", name: "The Master", effect: "In the laboratory his time becomes inventions. In a reception room he hosts: guests are seated there first, and Grace there counts double — triple with Evelyn at his side." },
  { id: "fiftyFifty", name: "Fifty-fifty", effect: "Whatever she cooks comes out exceptional (three times the batch) or burnt (nothing) — never burnt twice running, and less often as the Hearth grows. And she reads a room: where she is, a guest's fancy shows for twice as long." },
  { id: "toTheLetter", name: "To the letter", effect: "Serves in half the time." },
  { id: "twin", name: "Two of a kind", effect: "Works twice as fast while her sister is in the same or the next room." },
  { id: "greenThumb", name: "Green thumb", effect: "Whatever she grows comes up double." },
  { id: "strong", name: "Strong arms", effect: "Carries three times as much." },
  { id: "songbird", name: "Songbird", effect: "Sings as she works: Grace served in her room counts double." },
  { id: "forager", name: "Knows the woods", effect: "On an expedition, the first thing to go wrong doesn't." },
  { id: "bookish", name: "Bookish", effect: "Posted to the laboratory, she doubles the Master's progress." },
  { id: "charming", name: "Charming", effect: "At the shop counter, anyone she serves pays double." },
  { id: "motherly", name: "Motherly", effect: "Comfort served in her room counts double." },
  { id: "hiredHand", name: "Hired for the evening", effect: "Serves like anyone else, and is gone by morning." },
];

export const TRAITS: Record<TraitId, TraitDef> = Object.fromEntries(TRAIT_LIST.map((t) => [t.id, t]));

const MAID_LIST: MaidDef[] = [
  {
    id: "lord",
    name: "The Master",
    trait: "master",
    hair: "#6b5a4a",
    dress: "#3d3a52",
    blurb: "Lord Ambrose. He would rather be in the laboratory.",
    hireCost: 0,
    lines: {
      lab: ["Nearly.", "Hm.", "Do not touch that."],
      host: ["...Welcome.", "You are comfortable, I trust.", "Quite."],
      work: ["I can carry a tray.", "How hard can it be."],
      idle: ["I shall be upstairs."],
    },
  },
  {
    id: "evelyn",
    name: "Evelyn",
    trait: "fiftyFifty",
    hair: "#8a5a3c",
    dress: "#5d7a5a",
    blurb: "The first maid. Warm, earnest, and either a wonderful cook or a fire hazard.",
    hireCost: 0,
    lines: {
      burnt: ["Oh no. Oh no no no.", "It's... rustic?", "I only looked away for a second!"],
      perfect: ["Look! Look at them!", "I did it!", "They came out right!"],
      serve: ["Here you are!", "Mind, it's hot.", "Is everything all right?"],
      idle: ["What shall I do, sir?"],
    },
  },
  {
    id: "violet",
    name: "Violet",
    trait: "toTheLetter",
    hair: "#2e2a3a",
    dress: "#5b4a7a",
    blurb: "Royal Academy of Hospitality. Exacting, tireless, and let go from every post she has held.",
    hireCost: 16,
    lines: {
      serve: ["Your tea.", "As ordered.", "Adequate."],
      idle: ["I require a task."],
      hired: ["I will begin immediately."],
    },
  },
  {
    id: "victoria",
    name: "Victoria",
    trait: "twin",
    hair: "#c9a063",
    dress: "#7a4a4a",
    blurb: "One of the twins. Finishes her sister's sentences and her sister's chores.",
    hireCost: 40,
    lines: { idle: ["Where's Veronica?"], serve: ["There you go!"] },
  },
  {
    id: "veronica",
    name: "Veronica",
    trait: "twin",
    hair: "#c9a063",
    dress: "#4a5f7a",
    blurb: "The other twin. Hired together or not at all.",
    hireCost: 0,
    lines: { idle: ["Where's Victoria?"], serve: ["Here you go!"] },
  },
  {
    id: "marigold",
    name: "Marigold",
    trait: "greenThumb",
    hair: "#d98a3a",
    dress: "#6a7a3a",
    blurb: "Talks to the seedlings. They seem to listen.",
    hireCost: 24,
    lines: { idle: ["Is there a garden?"], serve: ["Fresh this morning."] },
  },
  {
    id: "tabitha",
    name: "Tabitha",
    trait: "strong",
    hair: "#4a3528",
    dress: "#7a6a4a",
    blurb: "A farmer's daughter. Carries a flour sack under each arm and asks if that's all.",
    hireCost: 22,
    lines: { idle: ["What needs lifting?"], serve: ["Here."] },
  },
  {
    id: "odette",
    name: "Odette",
    trait: "songbird",
    hair: "#e8d9b0",
    dress: "#8a5a7a",
    blurb: "Hums without knowing it. Guests stay to listen.",
    hireCost: 38,
    lines: { idle: ["La la... oh! Yes?"], serve: ["With pleasure."] },
  },
  {
    id: "hazel",
    name: "Hazel",
    trait: "forager",
    hair: "#7a4a2a",
    dress: "#4a6a5a",
    blurb: "A gamekeeper's girl. Knows which mushrooms, which paths, which dogs.",
    hireCost: 24,
    lines: { idle: ["I could be out there, you know."], serve: ["Here you are."] },
  },
  {
    id: "beatrix",
    name: "Beatrix",
    trait: "bookish",
    hair: "#3a2a2a",
    dress: "#4a4a6a",
    blurb: "Reads the Master's notes over his shoulder and corrects the arithmetic.",
    hireCost: 30,
    lines: { idle: ["May I see the laboratory?"], serve: ["One moment."] },
  },
  {
    id: "rosalind",
    name: "Rosalind",
    trait: "charming",
    hair: "#b0503a",
    dress: "#9a4a5a",
    blurb: "Could sell bread to a baker.",
    hireCost: 34,
    lines: { idle: ["Put me where the people are."], serve: ["You look as if you need two."] },
  },
  {
    id: "agnes",
    name: "Agnes",
    trait: "motherly",
    hair: "#8f8a86",
    dress: "#6a5a4a",
    blurb: "Raised nine younger brothers. Nobody leaves her table hungry or cold.",
    hireCost: 36,
    lines: { idle: ["Have you eaten?"], serve: ["Get that inside you."] },
  },
  // Footmen are hired for one evening (see content/hired.ts): two more pairs of hands, no effect of their own.
  { id: "footman1", name: "Footman", trait: "hiredHand", hair: "#3a2a22", dress: "#2f3b52", blurb: "Hired for the evening.", hireCost: 0, livery: true, lines: {} },
  { id: "footman2", name: "Footman", trait: "hiredHand", hair: "#a0703c", dress: "#2f3b52", blurb: "Hired for the evening.", hireCost: 0, livery: true, lines: {} },
];

export const MAID_DEFS: Record<MaidId, MaidDef> = Object.fromEntries(MAID_LIST.map((m) => [m.id, m]));

/** Maids who can turn up as a hire offer (Veronica comes with Victoria). */
export const HIREABLE: MaidId[] = ["violet", "victoria", "marigold", "tabitha", "odette", "hazel", "beatrix", "rosalind", "agnes"];

export const TWIN_OF: Record<MaidId, MaidId> = { victoria: "veronica", veronica: "victoria" };
