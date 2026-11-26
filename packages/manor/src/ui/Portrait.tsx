import type { Game } from "../sim/types";
import { MaidFigure } from "./MaidFigure";

// The household standing together, as for a photograph: for the Sabbath and the season's end.

const SPACING = 44;
const HEIGHT = 96;
const PAD = 30;

export const Portrait = ({ g }: { g: Game }) => {
  const people = g.maids.filter((m) => g.lent?.maid !== m.id);
  // The Master in the middle, the others either side of him in the order they came.
  const lord = people.find((m) => m.isLord);
  const others = people.filter((m) => !m.isLord);
  const half = Math.ceil(others.length / 2);
  const row = [...others.slice(0, half), ...(lord ? [lord] : []), ...others.slice(half)];
  const width = PAD * 2 + Math.max(1, row.length - 1) * SPACING + 30;
  const cat = (g.ornaments ?? []).includes("cat");
  return (
    <svg className="portrait" viewBox={`0 0 ${width} ${HEIGHT}`} width={width * 1.5} height={HEIGHT * 1.5} role="img" aria-label="The household">
      <ellipse cx={width / 2} cy={HEIGHT - 12} rx={width / 2 - 6} ry={9} fill="#8e3140" opacity={0.25} />
      {row.map((m, i) => (
        <MaidFigure key={m.id} maid={{ ...m, status: "", sayLeft: 0, carrying: {}, plan: [] }} x={PAD + 15 + i * SPACING} y={HEIGHT - 20} moving={false} labelDrop={false} crowded={false} selected={false} dragging={false} time={0} onPointerDown={() => undefined} />
      ))}
      {cat && (
        <g transform={`translate(${width - 18} ${HEIGHT - 14})`}>
          <ellipse cx={0} cy={-4} rx={8} ry={4.5} fill="#e0a44a" />
          <circle cx={-7} cy={-7} r={3.6} fill="#e0a44a" />
          <path d="M -10 -10 L -9 -13 L -7 -10 Z M -7 -10 L -5 -13 L -4 -9 Z" fill="#e0a44a" />
        </g>
      )}
    </svg>
  );
};
