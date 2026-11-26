import { isOccasionDay } from "../sim/calendar";
import { STAIR_COL } from "../sim/tuning";
import type { Game } from "../sim/types";
import { CELL_H, CELL_W, FLOORBOARD, MARGIN_X, ROOF_H, floorY, houseW, px, roomRect } from "./geometry";

// Things bought for their own sake, drawn where they live. None of this is read by the game.

type Props = { g: Game; time: number; night: boolean; where: "outside" | "inside" };

const has = (g: Game, id: string): boolean => (g.ornaments ?? []).includes(id);

/** The cat keeps to whichever lit, lived-in room is warmest: the parlour fire, else the kitchen range. */
const catSpot = (g: Game, time: number): { x: number; y: number; asleep: boolean } => {
  const room = g.rooms.find((r) => r.kind === "parlour") ?? g.rooms.find((r) => r.kind === "kitchen") ?? g.rooms[0];
  const rect = roomRect(room);
  // Most of the time asleep by the hearth; now and then a slow patrol along the floor.
  const PERIOD = 46;
  const phase = (time % PERIOD) / PERIOD;
  const WALK_FROM = 0.72;
  const walking = phase > WALK_FROM;
  const t = walking ? (phase - WALK_FROM) / (1 - WALK_FROM) : 0;
  const stroll = Math.sin(t * Math.PI) * (CELL_W - 90);
  return { x: rect.x + 58 + stroll, y: rect.y + CELL_H - FLOORBOARD, asleep: !walking };
};

const Cat = ({ x, y, asleep, time }: { x: number; y: number; asleep: boolean; time: number }) => (
  <g transform={`translate(${x} ${y})`} pointerEvents="none">
    {asleep ? (
      <>
        <ellipse cx={0} cy={-4} rx={9} ry={4.5} fill="#e0a44a" />
        <circle cx={7} cy={-5} r={3.6} fill="#e0a44a" />
        <path d="M 5 -8 L 6 -11 L 8 -8 Z M 8 -8 L 10 -11 L 11 -7 Z" fill="#e0a44a" />
        <path d="M -9 -3 Q -13 -2 -9 0" stroke="#c98a36" strokeWidth={2} fill="none" strokeLinecap="round" />
        <text x={12} y={-13 - ((time * 6) % 8)} fontSize={6} fill="#fff" opacity={0.7}>
          z
        </text>
      </>
    ) : (
      <>
        <ellipse cx={0} cy={-7} rx={8} ry={4} fill="#e0a44a" />
        <circle cx={8} cy={-10} r={3.6} fill="#e0a44a" />
        <path d="M 6 -13 L 7 -16 L 9 -13 Z M 9 -13 L 11 -16 L 12 -12 Z" fill="#e0a44a" />
        <path d={`M -8 -8 Q -13 -14 -11 ${-17 + Math.sin(time * 5) * 1.5}`} stroke="#e0a44a" strokeWidth={2} fill="none" strokeLinecap="round" />
        {[-5, -1, 3, 6].map((lx, i) => (
          <line key={lx} x1={lx} y1={-4} x2={lx + Math.sin(time * 9 + i * 1.6) * 1.6} y2={0} stroke="#c98a36" strokeWidth={1.6} />
        ))}
      </>
    )}
  </g>
);

export const Ornaments = ({ g, time, night, where }: Props) => {
  const ground = floorY(1);
  const left = MARGIN_X;
  const right = MARGIN_X + houseW();
  const doorX = px(STAIR_COL + 0.5);
  if (where === "outside")
    return (
      <g pointerEvents="none">
        {has(g, "vane") && (
          <g transform={`translate(${(left + right) / 2} 28)`}>
            <line x1={0} y1={0} x2={0} y2={-22} stroke="#c79a3e" strokeWidth={2} />
            <g transform={`rotate(${Math.sin(time * 0.5) * 14} 0 -22)`}>
              <line x1={-13} y1={-22} x2={13} y2={-22} stroke="#c79a3e" strokeWidth={1.6} />
              <path d="M 13 -22 L 8 -26 L 8 -18 Z" fill="#c79a3e" />
              <text x={-8} y={-23} fontSize={12}>
                🐓
              </text>
            </g>
          </g>
        )}
        {has(g, "bench") && (
          <g transform={`translate(${left - 96} ${ground})`}>
            <rect x={-16} y={-10} width={32} height={3} fill="#7a5236" />
            <rect x={-16} y={-18} width={32} height={2.5} fill="#7a5236" />
            <rect x={-14} y={-10} width={2.5} height={10} fill="#5c3d28" />
            <rect x={11.5} y={-10} width={2.5} height={10} fill="#5c3d28" />
            <g transform="translate(34 0)">
              <rect x={-2} y={-13} width={4} height={13} fill="#c9c2b5" />
              <ellipse cx={0} cy={-14} rx={9} ry={3} fill="#d9d2c5" />
              <ellipse cx={0} cy={-14.6} rx={6.5} ry={1.6} fill="#8ec5ea" />
            </g>
          </g>
        )}
      </g>
    );
  // Inside, and against the front of the house.
  const cat = has(g, "cat") ? catSpot(g, time) : null;
  const hall = { x: px(STAIR_COL), y: floorY(1) - CELL_H };
  return (
    <g pointerEvents="none">
      {has(g, "bunting") && g.upcoming && isOccasionDay(g) && (
        <g>
          <path d={`M ${left - 8} ${ROOF_H + 6} Q ${(left + right) / 2} ${ROOF_H + 12} ${right + 8} ${ROOF_H + 6}`} stroke="#fbf6ec" strokeWidth={1} fill="none" />
          {Array.from({ length: 17 }, (_, i) => {
            const t = (i + 0.5) / 17;
            const bx = left - 8 + t * (right - left + 16);
            const by = ROOF_H + 6 + Math.sin(t * Math.PI) * 3;
            return <path key={i} d={`M ${bx - 4} ${by} L ${bx + 4} ${by} L ${bx} ${by + 7} Z`} fill={["#8e3140", "#e8c56a", "#4f7d4a", "#5b6b8a"][i % 4]} />;
          })}
        </g>
      )}
      {has(g, "portraits") &&
        [2, 3].map((floor) => (
          <g key={floor} transform={`translate(${px(STAIR_COL) + 24} ${floorY(floor) - CELL_H + 22})`}>
            {[0, 1].map((i) => (
              <g key={i} transform={`translate(${i * 30} ${i * 10})`}>
                <rect x={0} y={0} width={20} height={25} rx={1.5} fill="#c79a3e" />
                <rect x={2.5} y={2.5} width={15} height={20} fill={["#4a5f7a", "#6a4a5a"][(floor + i) % 2]} />
                <circle cx={10} cy={10} r={4} fill="#f3d6bd" />
                <path d="M 4 22 Q 10 12 16 22 Z" fill="#2b1f19" />
              </g>
            ))}
          </g>
        ))}
      {has(g, "clock") && (
        <g transform={`translate(${hall.x + 38} ${hall.y + CELL_H - FLOORBOARD})`}>
          <rect x={-9} y={-70} width={18} height={70} rx={2} fill="#5c3d28" />
          <rect x={-11} y={-74} width={22} height={6} rx={2} fill="#4a2f1f" />
          <circle cx={0} cy={-58} r={6.5} fill="#fbf6ec" stroke="#c79a3e" strokeWidth={1.2} />
          <line x1={0} y1={-58} x2={0} y2={-62.5} stroke="#2b1f19" strokeWidth={1} />
          <line x1={0} y1={-58} x2={3} y2={-56.5} stroke="#2b1f19" strokeWidth={1} />
          <rect x={-5} y={-46} width={10} height={36} rx={1} fill="#3a2418" />
          <g transform={`rotate(${Math.sin(time * 3.1) * 9} 0 -44)`}>
            <line x1={0} y1={-44} x2={0} y2={-20} stroke="#c79a3e" strokeWidth={1} />
            <circle cx={0} cy={-18} r={3.4} fill="#e8c56a" />
          </g>
        </g>
      )}
      {has(g, "roses") &&
        [left - 14, left + 14, right - 14, right + 14].map((x, i) => (
          <g key={x} transform={`translate(${x} ${ground})`}>
            <ellipse cx={0} cy={-7} rx={12} ry={9} fill={night ? "#2c4a34" : "#4f8a4a"} />
            {[
              [-5, -9],
              [4, -12],
              [1, -5],
              [7, -6],
            ].map(([rx, ry], j) => (
              <circle key={j} cx={rx} cy={ry} r={2.3} fill={["#c8324a", "#f0a0b0", "#fbf6ec"][(i + j) % 3]} />
            ))}
          </g>
        ))}
      {has(g, "lanterns") &&
        [doorX - 24, doorX + 24].map((x) => (
          <g key={x} transform={`translate(${x} ${floorY(1) - FLOORBOARD - 46})`}>
            <rect x={-1} y={-8} width={2} height={8} fill="#2b1f19" />
            <rect x={-4} y={0} width={8} height={11} rx={1.5} fill={night ? "#ffd66b" : "#d9cdbb"} stroke="#2b1f19" strokeWidth={1} />
            {night && <circle cx={0} cy={5} r={20} fill="#ffd66b" opacity={0.22 + Math.sin(time * 7 + x) * 0.03} />}
          </g>
        ))}
      {cat && <Cat x={cat.x} y={cat.y} asleep={cat.asleep} time={time} />}
    </g>
  );
};
