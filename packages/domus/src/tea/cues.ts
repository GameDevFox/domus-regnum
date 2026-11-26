// Cue-reading pattern matcher (MVP) — see docs/design/cue-reading-system.md.
//
// Guests emit symbol "bubbles" over time; the player reads PATTERNS, not a fixed lookup — a grammar of
// ordered sequences (with order-variants) where an off-pattern symbol BREAKS the chain. The matcher
// reports whether the current buffer COMPLETES a pattern and whether a longer pattern could still
// EXTEND it — which is the timing/patience tension: `spoon → saucer` is a complete *refill*, but a
// trailing `table` makes it *clear*, so acting the instant you see a refill can misread a clear. Pure +
// deterministic.

export type CueSymbol = string;

export type CuePattern = {
  id: string;
  intent: string;
  // Any of these exact sequences is a complete match. Order-variants (clear = saucer-then-table OR
  // table-then-saucer) are listed as separate sequences — declarative, easy to read and extend.
  sequences: CueSymbol[][];
};

const isStrictPrefix = (buf: CueSymbol[], seq: CueSymbol[]): boolean =>
  buf.length < seq.length && buf.every((s, i) => s === seq[i]);
const isEqual = (buf: CueSymbol[], seq: CueSymbol[]): boolean =>
  buf.length === seq.length && buf.every((s, i) => s === seq[i]);

export type CueRead = {
  completed: CuePattern[]; // patterns the buffer exactly matches right now
  extendable: boolean; // a longer pattern still has the buffer as a strict prefix (more could come)
  broken: boolean; // the buffer matches no pattern as prefix-or-equal → an interrupt; reset the buffer
};

export const readCues = (buffer: CueSymbol[], patterns: CuePattern[]): CueRead => {
  if (buffer.length === 0) return { completed: [], extendable: patterns.length > 0, broken: false };
  const completed = patterns.filter((p) => p.sequences.some((seq) => isEqual(buffer, seq)));
  const extendable = patterns.some((p) => p.sequences.some((seq) => isStrictPrefix(buffer, seq)));
  return { completed, extendable, broken: completed.length === 0 && !extendable };
};

// The confident call: exactly one completed intent that nothing longer could extend → safe to act on.
// Returns null while the read is still ambiguous (completed but extendable) or incomplete — i.e. WAIT.
export const confidentIntent = (read: CueRead): string | null =>
  !read.extendable && read.completed.length === 1 ? read.completed[0].intent : null;

// Append a symbol to a buffer, resetting first if the new symbol would break the chain. Returns the new
// buffer + the read for it. (A broken chain starts fresh from the incoming symbol, since it may open a
// new pattern — e.g. an interrupting "spoon" begins a new request.)
export const pushCue = (
  buffer: CueSymbol[],
  symbol: CueSymbol,
  patterns: CuePattern[],
): { buffer: CueSymbol[]; read: CueRead } => {
  const extended = [...buffer, symbol];
  const read = readCues(extended, patterns);
  if (!read.broken) return { buffer: extended, read };
  // Broken — restart from this symbol alone (it might itself open a pattern).
  const fresh = [symbol];
  return { buffer: fresh, read: readCues(fresh, patterns) };
};

// Fold a whole symbol stream into its current buffer, applying the chain-reset on each break (an
// interrupt starts a fresh attempt from that symbol) — pushCue applied repeatedly.
export const foldCues = (symbols: CueSymbol[], patterns: CuePattern[]): CueSymbol[] =>
  symbols.reduce<CueSymbol[]>((buf, sym) => pushCue(buf, sym, patterns).buffer, []);

// The intent a COMPLETE stream resolves to — the single completed pattern of its folded buffer — or
// null if it doesn't cleanly land on one (used to score a cue beat against what she actually wanted).
export const streamIntent = (symbols: CueSymbol[], patterns: CuePattern[]): string | null => {
  const read = readCues(foldCues(symbols, patterns), patterns);
  return read.completed.length === 1 ? read.completed[0].intent : null;
};
