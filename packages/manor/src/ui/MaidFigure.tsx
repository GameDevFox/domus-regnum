import { carryCap } from "../sim/agents";
import { GOODS } from "../sim/content/house";
import { DEVICES } from "../sim/content/devices";
import { MAID_DEFS } from "../sim/content/people";
import type { Maid } from "../sim/types";

// One member of the household, drawn at her feet: a small figure in a dress and apron (or, for
// the Master, a dark coat), with whatever she is carrying, saying or stuck on shown above her.

const SKIN = "#f3d6bd";
const APRON = "#fbf6ec";
const HEAD_R = 8.5;
const HEAD_Y = -41;
const BOB_PX = 1.6;
const BOB_HZ = 9;
const LABEL_Y = 12;
const LABEL_DROP = 9;
/** Rough width of a caption tag: this much per character, plus padding. */
const TAG_CHAR_PX = 4.7;
const TAG_PAD_PX = 14;
const FIGURE_SCALE = 1.22;

type Props = {
  maid: Maid;
  x: number;
  y: number;
  moving: boolean;
  /** Drop the nameplate a line, so neighbours' names do not run together. */
  labelDrop: boolean;
  /** Three or more share the spot: names show only under the cursor or when selected. */
  crowded: boolean;
  selected: boolean;
  dragging: boolean;
  time: number;
  onPointerDown: (e: React.PointerEvent) => void;
};

const Hair = ({ color, lord }: { color: string; lord: boolean }) =>
  lord ? (
    <path d={`M -8.5 ${HEAD_Y - 1} Q -9 ${HEAD_Y - 11} 0 ${HEAD_Y - 10.5} Q 9 ${HEAD_Y - 11} 8.5 ${HEAD_Y - 1} Q 5 ${HEAD_Y - 6} 0 ${HEAD_Y - 5.5} Q -5 ${HEAD_Y - 6} -8.5 ${HEAD_Y - 1} Z`} fill={color} />
  ) : (
    <>
      {/* Hair falls behind the shoulders, with a fringe over the brow. */}
      <path d={`M -9.5 ${HEAD_Y + 9} Q -11.5 ${HEAD_Y - 12} 0 ${HEAD_Y - 11} Q 11.5 ${HEAD_Y - 12} 9.5 ${HEAD_Y + 9} L 6 ${HEAD_Y + 4} L 6.5 ${HEAD_Y - 3} Q 0 ${HEAD_Y - 7} -6.5 ${HEAD_Y - 3} L -6 ${HEAD_Y + 4} Z`} fill={color} />
      <path d={`M -6 ${HEAD_Y - 9.5} Q 0 ${HEAD_Y - 14.5} 6 ${HEAD_Y - 9.5} Q 0 ${HEAD_Y - 11} -6 ${HEAD_Y - 9.5} Z`} fill={APRON} stroke="#d9cfbd" strokeWidth={0.5} />
    </>
  );

export const MaidFigure = ({ maid, x, y, moving, labelDrop, crowded, selected, dragging, time, onPointerDown }: Props) => {
  const def = MAID_DEFS[maid.id];
  // The Master and hired footmen wear a coat; everyone else an apron.
  const lord = maid.isLord || def.livery === true;
  const master = maid.isLord;
  const bob = moving ? Math.sin(time * BOB_HZ) * BOB_PX : 0;
  const step = maid.plan[0];
  const working = step && step.kind === "work" ? 1 - step.seconds / step.total : null;
  const carried = Object.entries(maid.carrying).filter(([, n]) => n > 0);
  const carriedCount = carried.reduce((a, [, n]) => a + n, 0);
  const bubble = maid.sayLeft > 0 ? maid.say : "";
  const stuck = !bubble && /needs|no coin|nothing on the rota|shelf full|nothing to serve|does not play/.test(maid.status);
  const tag = bubble || (stuck ? maid.status : "");
  const tagWidth = tag.length * TAG_CHAR_PX + TAG_PAD_PX;
  return (
    <g transform={`translate(${x} ${y}) scale(${FIGURE_SCALE})`} style={{ cursor: dragging ? "grabbing" : "grab", opacity: dragging ? 0.55 : 1 }} onPointerDown={onPointerDown} data-maid={maid.id}>
      <ellipse cx={0} cy={1} rx={11} ry={3} fill="#000" opacity={0.18} />
      {selected && <ellipse cx={0} cy={1} rx={15} ry={5} fill="none" stroke="#ffe08a" strokeWidth={2} />}
      <g transform={`translate(0 ${bob})`}>
        {lord ? (
          <>
            <path d="M -8 -30 L 8 -30 L 10 -2 L 3 -2 L 0 -14 L -3 -2 L -10 -2 Z" fill={def.dress} />
            <path d="M -2.5 -30 L 2.5 -30 L 0 -22 Z" fill={APRON} />
            <rect x={-10.5} y={-29} width={4} height={15} rx={2} fill={def.dress} />
            <rect x={6.5} y={-29} width={4} height={15} rx={2} fill={def.dress} />
          </>
        ) : (
          <>
            <path d="M -6.5 -31 L 6.5 -31 L 12.5 -2 L -12.5 -2 Z" fill={def.dress} />
            <path d="M -4.5 -27 L 4.5 -27 L 8 -4 L -8 -4 Z" fill={APRON} />
            <rect x={-10} y={-30} width={4} height={13} rx={2} fill={def.dress} />
            <rect x={6} y={-30} width={4} height={13} rx={2} fill={def.dress} />
            <circle cx={-8} cy={-16.5} r={2.2} fill={SKIN} />
            <circle cx={8} cy={-16.5} r={2.2} fill={SKIN} />
          </>
        )}
        <circle cx={0} cy={HEAD_Y} r={HEAD_R} fill={SKIN} />
        <Hair color={def.hair} lord={lord} />
        <circle cx={-3} cy={HEAD_Y + 1} r={0.9} fill="#3a2a22" />
        <circle cx={3} cy={HEAD_Y + 1} r={0.9} fill="#3a2a22" />
        {master && (
          <g stroke="#2a2420" strokeWidth={0.7} fill="none">
            <circle cx={-3} cy={HEAD_Y + 1} r={2.4} />
            <circle cx={3} cy={HEAD_Y + 1} r={2.4} />
          </g>
        )}
        {maid.hurtDays > 0 && (
          <text x={7} y={HEAD_Y - 6} fontSize={10}>
            🩹
          </text>
        )}
        {maid.tool && (
          <text x={-17} y={-6} fontSize={11}>
            {DEVICES[maid.tool].glyph}
          </text>
        )}
        {carriedCount > 0 && (
          <g>
            <rect x={-13} y={-26} width={26} height={5} rx={1.5} fill="#c9c2b5" stroke="#8f8779" strokeWidth={0.6} />
            <text x={0} y={-27} fontSize={12} textAnchor="middle">
              {carried
                .slice(0, 2)
                .map(([good]) => GOODS[good].glyph)
                .join("")}
            </text>
            <text x={15} y={-22} fontSize={8.5} fill="#fff" stroke="#3a2a22" strokeWidth={2.2} paintOrder="stroke" fontWeight={700}>
              {carriedCount}
              {carriedCount >= carryCap(maid) ? "" : ""}
            </text>
          </g>
        )}
      </g>
      {working !== null && (
        <g transform={`translate(0 ${HEAD_Y - 17})`}>
          <rect x={-11} y={0} width={22} height={3.5} rx={1.75} fill="#00000055" />
          <rect x={-11} y={0} width={22 * Math.max(0, Math.min(1, working))} height={3.5} rx={1.75} fill="#ffd66b" />
        </g>
      )}
      {/* Only what the player needs to act on is written out: something said, or something stuck. */}
      {tag && (
        <g transform={`translate(0 ${HEAD_Y - 22})`} pointerEvents="none">
          <rect x={-tagWidth / 2} y={-11} width={tagWidth} height={15} rx={7} fill={stuck ? "#fff0ee" : "#fffaf0"} stroke={stuck ? "#b23a34" : "#b8ab95"} strokeWidth={1.2} />
          <text className={stuck ? "tagtext stuck" : "tagtext"} x={0} y={0} textAnchor="middle">
            {tag}
          </text>
        </g>
      )}
      <text className={`nameplate${selected ? " selected" : ""}${crowded ? " crowded" : ""}`} x={0} y={LABEL_Y + (labelDrop && !crowded ? LABEL_DROP : 0)} textAnchor="middle">
        {master ? "Master" : def.name}
      </text>
      <rect x={-15} y={-56} width={30} height={72} fill="transparent" />
    </g>
  );
};
