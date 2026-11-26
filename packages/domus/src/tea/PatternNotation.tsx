// Renders a NotatedPattern as a 2-D "emote regex": the emote row, with structural modifiers drawn as
// brackets ("clefs") ABOVE (any / any-order / repeat) or BELOW (optional), wildcard inline. See
// docs/design/cue-reading-system.md.
//
// Optionally INTERACTIVE: pass `onSelect` and every emote column + group bracket becomes clickable and
// carries its tree `path` (matching the editor's ETree paths); `selected` highlights the chosen element
// and tints its column-span. Without `onSelect` it's a pure read-only render (the legend/showcase).

import { CUE_GLYPH } from "./data";
import { layout, type Path, type Span } from "./pattern-layout";
import { type NotatedPattern } from "./pattern-notation";

const eqPath = (a: Path, b: Path) => a.length === b.length && a.every((v, i) => v === b[i]);
const isPrefix = (a: Path, b: Path) => a.length < b.length && a.every((v, i) => v === b[i]); // strict
const inSelection = (sel: Path | null, p: Path) => !!sel && sel.length <= p.length && sel.every((v, i) => v === p[i]);

const Bracket = ({ label, place, selected }: { label: string; place: "above" | "below"; selected: boolean }) => (
  <div
    className={`relative h-3 ${selected ? "border-primary" : "border-primary/40"} ${
      place === "above" ? "mb-1 rounded-t border-x border-t" : "mt-1 rounded-b border-x border-b"
    }`}
  >
    <span
      className={`bg-card absolute left-1/2 -translate-x-1/2 whitespace-nowrap px-1 text-[10px] leading-none ${
        selected ? "text-primary" : "text-muted-foreground"
      } ${place === "above" ? "-top-2" : "-bottom-2"}`}
    >
      {label}
    </span>
  </div>
);

export const PatternNotation = ({
  pattern,
  selected,
  onSelect,
}: {
  pattern: NotatedPattern;
  selected?: Path | null;
  onSelect?: (path: Path) => void;
}) => {
  const { cols, spans } = layout(pattern);
  const above = spans.filter((s) => s.place === "above");
  const below = spans.filter((s) => s.place === "below");
  // A span's lane = how many same-place spans strictly contain it (by path) → deeper nesting → its own row.
  const depthOf = (s: Span, group: Span[]) => group.filter((o) => isPrefix(o.path, s.path)).length;
  const aboveLanes = above.reduce((m, s) => Math.max(m, depthOf(s, above) + 1), 0);
  const belowLanes = below.reduce((m, s) => Math.max(m, depthOf(s, below) + 1), 0);
  const emoteRow = aboveLanes + 1;
  const sel = selected ?? null;
  const interactive = !!onSelect;
  const click = (path: Path) =>
    interactive
      ? (e: React.MouseEvent) => {
          e.stopPropagation();
          onSelect!(path);
        }
      : undefined;

  const renderSpan = (s: Span, key: string, groupLanes: number, group: Span[]) => {
    const d = depthOf(s, group);
    const row = s.place === "above" ? d + 1 : emoteRow + (groupLanes - d);
    return (
      <div
        key={key}
        style={{ gridRow: row, gridColumn: `${s.from + 1} / ${s.to + 2}` }}
        onClick={click(s.path)}
        className={interactive ? "cursor-pointer" : ""}
      >
        <Bracket label={s.label} place={s.place} selected={!!sel && eqPath(sel, s.path)} />
      </div>
    );
  };

  return (
    <div className="flex items-center gap-1.5">
      {pattern.startAnchored && <span className="text-primary/70 text-[10px] uppercase">⟦ start</span>}
      <div
        className="bg-card inline-grid items-center gap-x-1.5 rounded-md px-1"
        style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(1.75rem, auto))` }}
      >
        {above.map((s, i) => renderSpan(s, `a${i}`, aboveLanes, above))}
        {cols.map((c, i) => (
          <div
            key={`c${i}`}
            style={{ gridRow: emoteRow, gridColumn: i + 1 }}
            onClick={click(c.path)}
            className={`flex justify-center rounded py-0.5 text-2xl ${interactive ? "cursor-pointer" : ""} ${
              inSelection(sel, c.path) ? "bg-primary/15" : ""
            } ${sel && eqPath(sel, c.path) ? "ring-primary ring-2" : ""}`}
          >
            {c.wild ? (
              <span
                title="any emote"
                className="border-muted-foreground/50 text-muted-foreground inline-flex h-7 w-7 items-center justify-center rounded border border-dashed text-base"
              >
                ✦
              </span>
            ) : (
              <span>{(c.sym && CUE_GLYPH[c.sym]) || c.sym}</span>
            )}
          </div>
        ))}
        {below.map((s, i) => renderSpan(s, `b${i}`, belowLanes, below))}
      </div>
      {pattern.endAnchored && <span className="text-primary/70 text-[10px] uppercase">end ⟧</span>}
    </div>
  );
};
