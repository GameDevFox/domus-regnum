// The Deseret alphabet: thirty-eight letters devised in the 1850s for writing English by its
// sounds, one letter to a sound (and two more added later). In the game it is the writing of an
// old tongue: nothing in the game reads it for the player, who learns the letters (from primers
// found in the game, or from the world outside it) and then simply reads.
// (`packages/domus/docs/design/23-intel.md`, "Hidden finds".)
//
// So what is written in it here is English, spelled as it sounds. Each letter is named below by
// the sound it stands for, in the alphabet's own order, which is the order of its capitals in
// Unicode (U+10400 on): so a word is written as its sounds, and can be checked by eye.
//
// How a word is spelled is not this file's to decide: the author's Deseret engine does that,
// from a pronouncing dictionary (~/projects/book-of-adam/src/deseret, the modern American
// profile). Spell there, and set the sounds down here.

/** The letters, by the sounds they stand for, in the alphabet's order: six long vowels, six short, two glides of vowel, and the consonants. */
const SOUNDS = [
  // Long: as in eat, ate, art, aught, oat, ooze.
  "ee", "ay", "ah", "aw", "oh", "oo",
  // Short: as in it, et, at, ot, ut, book.
  "i", "e", "a", "o", "u", "uu",
  // As in ice and owl; then woo, yee and h.
  "eye", "ow", "w", "y", "h",
  "p", "b", "t", "d", "ch", "j", "k", "g", "f", "v",
  // As in thigh and thy.
  "th", "dh",
  "s", "z", "sh", "zh", "r", "l", "m", "n", "ng",
  // The two added later: as in oil and few.
  "oi", "ew",
] as const;

export type Sound = (typeof SOUNDS)[number];

/** Where the alphabet's capitals begin in Unicode. Carved writing is all capitals. */
const FIRST_CAPITAL = 0x10400;

/** The letter for a sound. */
export const letter = (sound: string): string => {
  const at = (SOUNDS as readonly string[]).indexOf(sound);
  if (at === -1) throw new Error(`No Deseret letter for the sound "${sound}"`);
  return String.fromCodePoint(FIRST_CAPITAL + at);
};

/** A line of writing: its words, each given as its sounds with spaces between ("d e v z"), written in the alphabet with a space between words. */
export const write = (...words: string[]): string => words.map((word) => word.split(" ").map(letter).join("")).join(" ");

export const SOUND_COUNT = SOUNDS.length;
