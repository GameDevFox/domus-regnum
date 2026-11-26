import { DAY_SECONDS } from "../sim/tuning";
import type { Game } from "../sim/types";
import { MARGIN_X, MAX_VIEW_W, floorY, px, viewW } from "./geometry";

// Everything outside the walls: the sun or the moon, clouds, trees on the lawn, and smoke from
// the chimney while the kitchen is working. None of it means anything; it is there to be pleasant.

type Props = { g: Game; time: number; night: boolean; cooking: boolean };

const CLOUDS = [
  { y: 30, speed: 5, scale: 1.1, start: 80 },
  { y: 62, speed: 3.2, scale: 0.8, start: 520 },
  { y: 14, speed: 4.1, scale: 0.65, start: 900 },
];
const CLOUD_SPAN = MAX_VIEW_W + 520;

const Cloud = ({ x, y, scale, opacity }: { x: number; y: number; scale: number; opacity: number }) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity} fill="#fff">
    <ellipse cx={0} cy={0} rx={34} ry={13} />
    <ellipse cx={-20} cy={5} rx={22} ry={10} />
    <ellipse cx={24} cy={6} rx={26} ry={10} />
    <ellipse cx={6} cy={-9} rx={18} ry={10} />
  </g>
);

const Tree = ({ x, y, size, night, sway }: { x: number; y: number; size: number; night: boolean; sway: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x={-size * 0.07} y={-size * 0.5} width={size * 0.14} height={size * 0.5} fill="#5c4030" />
    <g transform={`rotate(${sway})`}>
      <ellipse cx={0} cy={-size * 0.78} rx={size * 0.42} ry={size * 0.46} fill={night ? "#243b33" : "#5f9a5a"} />
      <ellipse cx={-size * 0.2} cy={-size * 0.62} rx={size * 0.28} ry={size * 0.3} fill={night ? "#1f352d" : "#538c4f"} />
      <ellipse cx={size * 0.2} cy={-size * 0.66} rx={size * 0.26} ry={size * 0.28} fill={night ? "#2a443a" : "#6aa864"} />
    </g>
  </g>
);

const PUFFS = 5;

export const Scenery = ({ g, time, night, cooking }: Props) => {
  const f = g.phase === "day" ? g.t / DAY_SECONDS : g.phase === "morning" || g.phase === "invite" ? 0 : 1;
  // The sun crosses the sky over the working day; the moon simply hangs.
  const sunX = -40 + f * (viewW() + 80);
  const sunY = 70 - Math.sin(f * Math.PI) * 58;
  const ground = floorY(1);
  const chimney = { x: px(1) + 53, y: 12 };
  return (
    <g pointerEvents="none">
      {night ? (
        <g>
          <circle cx={viewW() - 150} cy={40} r={20} fill="#f4f1de" />
          <circle cx={viewW() - 141} cy={34} r={18} fill="#1a2040" opacity={0.92} />
        </g>
      ) : (
        <g>
          <circle cx={sunX} cy={sunY} r={34} fill="#fff3c4" opacity={0.35} />
          <circle cx={sunX} cy={sunY} r={18} fill="#ffe9a0" />
        </g>
      )}
      {CLOUDS.map((c, i) => (
        <Cloud key={i} x={((c.start + time * c.speed) % CLOUD_SPAN) - 260} y={c.y} scale={c.scale} opacity={night ? 0.12 : 0.85} />
      ))}
      <Tree x={-70} y={ground} size={150} night={night} sway={Math.sin(time * 0.7) * 1.2} />
      <Tree x={MARGIN_X - 30} y={ground} size={70} night={night} sway={Math.sin(time * 0.9 + 1) * 1.6} />
      <Tree x={viewW() + 60} y={ground} size={170} night={night} sway={Math.sin(time * 0.6 + 2) * 1.1} />
      <Tree x={viewW() - MARGIN_X + 34} y={ground} size={64} night={night} sway={Math.sin(time * 1.0 + 3) * 1.7} />
      {cooking &&
        Array.from({ length: PUFFS }, (_, i) => {
          const p = (time * 0.22 + i / PUFFS) % 1;
          return <circle key={i} cx={chimney.x + Math.sin(p * 5 + i) * 6 + p * 16} cy={chimney.y - p * 46} r={5 + p * 9} fill="#fff" opacity={(1 - p) * 0.45} />;
        })}
    </g>
  );
};
