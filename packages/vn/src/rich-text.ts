// Ren'Py-compatible rich-text tags for dialogue (see renpy's sphinx/source/text.rst) — the
// phase-1 STYLE family: {b} {i} {u} {s} {color=#f00} {size=18} {size=+4}, closed LIFO by
// {/tag}, or by our extension {/} — a universal closer that pops the most recent open tag
// (the tag name in a closer is redundant when closing is LIFO anyway). Unclosed tags
// auto-close at end of line (Ren'Py-legal); {{ escapes a literal brace.
//
// Parsing lives in the core (pure, node-testable, renderer-shared — the ActorTracker pattern);
// the SNAPSHOT keeps the raw tagged string and renderers interpret, like textSpeed. Unknown or
// malformed tags are stripped with a console.warn (never thrown, never shown).
//
// Phase 2 — the pacing family — is here too, as CONTROL ITEMS interleaved with the text
// segments: {w} (pause for click), {w=1.5} (timed pause), {p} (pause + paragraph break),
// {cps=8}…{/cps} / {cps=*2}…{/cps} (per-segment reveal rate, absolute or multiplier), {fast}
// (everything before it reveals instantly). The pure RevealWalk (reveal.ts) consumes these;
// renderers just paint its position. Still not here: {nw}/auto-advance (a design decision
// about skips + holds deferred until a script needs it).

export type SegmentStyle = {
  bold?: true;
  italic?: true;
  underline?: true;
  strike?: true;
  color?: string; // passed through to the renderer (CSS accepts Ren'Py's #rgb/#rrggbb/#rrggbbaa)
  sizePx?: number; // absolute {size=18}
  sizeDelta?: number; // relative {size=+4} / {size=-2}
};

export type TextSegment = {
  kind: "text";
  text: string;
  style: SegmentStyle;
  cps?: number; // absolute per-segment rate ({cps=8})
  cpsMul?: number; // multiplier on the base rate ({cps=*2})
};

// Pacing controls, positioned between text segments in the item stream.
export type ControlItem =
  | { kind: "wait"; seconds?: number } // {w} = until click; {w=1.5} = timed
  | { kind: "break" } // the paragraph break half of {p}
  | { kind: "fast" }; // reveal everything before this instantly

export type LineItem = TextSegment | ControlItem;

type OpenTag = { name: string; apply: (s: SegmentStyle) => void };

type StyleAndPace = SegmentStyle & { cps?: number; cpsMul?: number };

const STYLE_TAGS: Record<string, (arg: string | undefined) => ((s: StyleAndPace) => void) | null> = {
  b: () => (s) => void (s.bold = true),
  i: () => (s) => void (s.italic = true),
  u: () => (s) => void (s.underline = true),
  s: () => (s) => void (s.strike = true),
  color: (arg) => (arg ? (s) => void (s.color = arg) : null),
  size: (arg) => {
    if (!arg) return null;
    const n = Number(arg);
    if (!Number.isFinite(n)) return null;
    return arg.startsWith("+") || arg.startsWith("-")
      ? (s) => void (s.sizeDelta = (s.sizeDelta ?? 0) + n)
      : (s) => void (s.sizePx = n);
  },
  // Pace rides the same LIFO stack as style: {cps=8} absolute, {cps=*2} multiplier on the base.
  cps: (arg) => {
    if (!arg) return null;
    if (arg.startsWith("*")) {
      const m = Number(arg.slice(1));
      return Number.isFinite(m) ? (s) => void (s.cpsMul = m) : null;
    }
    const n = Number(arg);
    return Number.isFinite(n) ? (s) => void (s.cps = n) : null;
  },
};

// Self-closing pacing tags → control items in the stream.
const CONTROL_TAGS: Record<string, (arg: string | undefined) => ControlItem[] | null> = {
  w: (arg) => {
    if (arg === undefined) return [{ kind: "wait" }];
    const s = Number(arg);
    return Number.isFinite(s) && s >= 0 ? [{ kind: "wait", seconds: s }] : null;
  },
  // {p} = pause, then a paragraph break once it resumes.
  p: (arg) => {
    const wait = CONTROL_TAGS.w(arg);
    return wait ? [...wait, { kind: "break" }] : null;
  },
  fast: (arg) => (arg === undefined ? [{ kind: "fast" }] : null),
};

const styleOf = (stack: OpenTag[]): StyleAndPace => {
  const style: StyleAndPace = {};
  for (const t of stack) t.apply(style);
  return style;
};

// Parse a tagged line into a flat item stream: text segments with resolved cumulative styles,
// interleaved with pacing controls. Never throws.
export const parseRichText = (raw: string): LineItem[] => {
  const items: LineItem[] = [];
  const stack: OpenTag[] = [];
  let text = "";

  const flush = () => {
    if (text.length === 0) return;
    const { cps, cpsMul, ...style } = styleOf(stack);
    items.push({
      kind: "text",
      text,
      style,
      ...(cps !== undefined ? { cps } : {}),
      ...(cpsMul !== undefined ? { cpsMul } : {}),
    });
    text = "";
  };

  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch !== "{") {
      text += ch;
      i++;
      continue;
    }
    if (raw[i + 1] === "{") {
      text += "{"; // {{ → literal brace
      i += 2;
      continue;
    }
    const end = raw.indexOf("}", i);
    if (end === -1) {
      text += raw.slice(i); // no closing brace — the rest is literal (warn: it's likely a typo)
      console.warn(`vn: unterminated tag in "${raw.slice(i, i + 24)}…" — rendered literally`);
      break;
    }
    const body = raw.slice(i + 1, end);
    i = end + 1;

    if (body === "/") {
      // Universal closer (our extension): pop the most recent open tag.
      if (stack.length === 0) console.warn(`vn: {/} with nothing open — ignored`);
      else {
        flush();
        stack.pop();
      }
      continue;
    }
    if (body.startsWith("/")) {
      const name = body.slice(1);
      const idx = stack.map((t) => t.name).lastIndexOf(name);
      if (idx === -1) {
        console.warn(`vn: {/${name}} with no matching open tag — ignored`);
      } else {
        if (idx !== stack.length - 1)
          console.warn(`vn: {/${name}} closes across ${stack.length - 1 - idx} unclosed tag(s) — closing them too (tags close LIFO)`);
        flush();
        stack.length = idx; // pop through the match, LIFO
      }
      continue;
    }

    const eq = body.indexOf("=");
    const name = eq === -1 ? body : body.slice(0, eq);
    const arg = eq === -1 ? undefined : body.slice(eq + 1);

    const makeControl = CONTROL_TAGS[name];
    if (makeControl) {
      const controls = makeControl(arg);
      if (!controls) {
        console.warn(`vn: malformed tag {${body}} — stripped`);
        continue;
      }
      flush();
      items.push(...controls);
      continue;
    }

    const make = STYLE_TAGS[name];
    const apply = make ? make(arg) : null;
    if (!apply) {
      console.warn(`vn: unknown or malformed tag {${body}} — stripped`);
      continue;
    }
    flush();
    stack.push({ name, apply });
  }
  flush(); // unclosed tags auto-close at end of line (Ren'Py-legal)
  return items;
};

// Just the text segments (choice buttons and other pause-less consumers).
export const textSegments = (items: LineItem[]): TextSegment[] =>
  items.filter((i): i is TextSegment => i.kind === "text");

// The tag-free text — what the typewriter counts and reveals (cps = glyphs/sec, tags are free).
export const plainText = (items: LineItem[]): string => textSegments(items).map((s) => s.text).join("");
