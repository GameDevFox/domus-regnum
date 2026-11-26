// Where each letter of a line of carved writing goes, for a given width: the lines are set as
// the page sets a centred paragraph (words wrapped where a space is, each letter followed by the
// letter spacing, a space widened by the word spacing, each row centred, and the letters sat on
// a baseline in the middle of the row's height). Pure: how wide a letter is comes from outside
// (carved-writing.ts measures it on a canvas), so this can be checked without one.

export type CarvedMetrics = {
  /** The height of a row, in CSS pixels. */
  lineHeight: number;
  /** Added after every letter, spaces included. */
  letterSpacing: number;
  /** Added to every space. */
  wordSpacing: number;
  /** How far the lettering reaches above and below its baseline. */
  ascent: number;
  descent: number;
};

export type CarvedGlyph = { char: string; x: number };
export type CarvedRow = { glyphs: CarvedGlyph[]; baseline: number; width: number };
export type CarvedLayout = { rows: CarvedRow[]; height: number };

/** A line's words, each as its letters (a Deseret letter is two UTF-16 units: split by code point). */
const wordsOf = (text: string): string[][] =>
  text
    .split(" ")
    .filter((word) => word.length > 0)
    .map((word) => [...word]);

/** Lays a line out in rows no wider than `width`, as far as whole words allow (a word wider than that has a row of its own, and overruns it). */
export const layoutCarved = (text: string, width: number, metrics: CarvedMetrics, advance: (char: string) => number): CarvedLayout => {
  const step = (char: string): number => advance(char) + metrics.letterSpacing;
  const wordWidth = (word: string[]): number => word.reduce((sum, char) => sum + step(char), 0);
  const space = step(" ") + metrics.wordSpacing;

  const rowsOfWords: string[][][] = [];
  let row: string[][] = [];
  let used = 0;
  for (const word of wordsOf(text)) {
    const more = (row.length > 0 ? space : 0) + wordWidth(word);
    if (row.length > 0 && used + more > width) {
      rowsOfWords.push(row);
      row = [];
      used = 0;
    }
    used += (row.length > 0 ? space : 0) + wordWidth(word);
    row.push(word);
  }
  if (row.length > 0) rowsOfWords.push(row);

  // The baseline sits as the page sets it: half of what the row has over the lettering's own height above it.
  const halfLeading = (metrics.lineHeight - (metrics.ascent + metrics.descent)) / 2;
  const rows = rowsOfWords.map((words, at): CarvedRow => {
    const rowWidth = words.reduce((sum, word, n) => sum + (n > 0 ? space : 0) + wordWidth(word), 0);
    let x = Math.max(0, (width - rowWidth) / 2);
    const glyphs: CarvedGlyph[] = [];
    words.forEach((word, n) => {
      if (n > 0) x += space;
      for (const char of word) {
        glyphs.push({ char, x });
        x += step(char);
      }
    });
    return { glyphs, baseline: at * metrics.lineHeight + halfLeading + metrics.ascent, width: rowWidth };
  });
  return { rows, height: rows.length * metrics.lineHeight };
};
