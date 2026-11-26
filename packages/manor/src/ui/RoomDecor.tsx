import type { RoomKind } from "../sim/types";
import { CELL_W } from "./geometry";

// What stands in each room. Plain shapes and a few emoji: enough that a room reads as a kitchen
// or a parlour at a glance, and that someone working in it looks as if she has something to work at.

type DecorProps = {
  /** Height of the floorboards within the cell. */
  floor: number;
  time: number;
  /** Someone is posted here and working. */
  active: boolean;
  night: boolean;
};

const WOOD = "#7a5236";
const WOOD_DARK = "#5c3d28";
const BRASS = "#d9b25a";
const W = CELL_W;

const Glyph = ({ x, y, size, children, opacity = 1 }: { x: number; y: number; size: number; children: string; opacity?: number }) => (
  <text x={x} y={y} fontSize={size} textAnchor="middle" opacity={opacity}>
    {children}
  </text>
);

const Table = ({ x, y, w, cloth }: { x: number; y: number; w: number; cloth?: string }) => (
  <g>
    {cloth && <rect x={x - 2} y={y - 22} width={w + 4} height={9} rx={2} fill={cloth} />}
    <rect x={x} y={y - 22} width={w} height={5} rx={2} fill={WOOD_DARK} />
    <rect x={x + 6} y={y - 18} width={4} height={18} fill={WOOD} />
    <rect x={x + w - 10} y={y - 18} width={4} height={18} fill={WOOD} />
  </g>
);

const Fire = ({ x, y, time, lit }: { x: number; y: number; time: number; lit: boolean }) => {
  const flick = lit ? 1 + Math.sin(time * 11) * 0.12 + Math.sin(time * 5.3) * 0.08 : 0;
  return (
    <g>
      <rect x={x - 17} y={y - 34} width={34} height={34} rx={2} fill="#4a4340" />
      <rect x={x - 21} y={y - 39} width={42} height={6} rx={1} fill="#d9cdbb" />
      <rect x={x - 12} y={y - 26} width={24} height={26} rx={10} fill="#1e1a18" />
      {lit && (
        <>
          <ellipse cx={x} cy={y - 6} rx={8 * flick} ry={11 * flick} fill="#ff9d3c" opacity={0.9} />
          <ellipse cx={x} cy={y - 5} rx={4.5 * flick} ry={7 * flick} fill="#ffe08a" />
          <circle cx={x} cy={y - 10} r={34} fill="#ffb14a" opacity={0.1 * flick} />
        </>
      )}
    </g>
  );
};

const Shelves = ({ x, y, w, rows, colors }: { x: number; y: number; w: number; rows: number; colors: string[] }) => (
  <g>
    {Array.from({ length: rows }, (_, r) => (
      <g key={r}>
        <rect x={x} y={y + r * 20 + 14} width={w} height={3} fill={WOOD_DARK} />
        {Array.from({ length: Math.floor(w / 11) }, (_, i) => {
          const h = 8 + ((i * 7 + r * 3) % 5);
          return <rect key={i} x={x + 2 + i * 11} y={y + r * 20 + 14 - h} width={8} height={h} rx={2} fill={colors[(i + r * 2) % colors.length]} opacity={0.9} />;
        })}
      </g>
    ))}
  </g>
);

const Kitchen = ({ floor, time, active }: DecorProps) => (
  <g>
    {/* A rail of copper pans, the range with its fire, and a table to work at. */}
    <rect x={18} y={40} width={64} height={2.5} fill="#5a5653" />
    {[26, 42, 58, 74].map((x, i) => (
      <g key={x}>
        <line x1={x} y1={42} x2={x} y2={48} stroke="#5a5653" strokeWidth={1.2} />
        <circle cx={x} cy={53 + (i % 2) * 2} r={5 + (i % 2)} fill="#c98a4b" />
      </g>
    ))}
    <rect x={14} y={floor - 34} width={54} height={34} rx={2} fill="#3b3836" />
    <rect x={12} y={floor - 37} width={58} height={4} fill="#5a5653" />
    <rect x={20} y={floor - 22} width={18} height={14} rx={1} fill="#ff9d3c" opacity={active ? 0.75 + Math.sin(time * 9) * 0.2 : 0.3} />
    <rect x={22} y={floor - 20} width={14} height={10} rx={1} fill="#ffd66b" opacity={active ? 1 : 0.3} />
    <rect x={56} y={floor - 92} width={8} height={56} fill="#3b3836" />
    <Glyph x={42} y={floor - 38} size={15}>
      🍳
    </Glyph>
    {active && [0, 1, 2].map((i) => <circle key={i} cx={46 + i * 4} cy={floor - 58 - ((time * 14 + i * 9) % 26)} r={2.4} fill="#fff" opacity={0.28} />)}
    <Table x={104} y={floor} w={70} />
    <Glyph x={160} y={floor - 23} size={15}>
      🥣
    </Glyph>
  </g>
);

const Shop = ({ floor }: DecorProps) => (
  <g>
    <Shelves x={62} y={28} w={66} rows={2} colors={["#c98a4b", "#e3c77a", "#a85c5c", "#8ea172"]} />
    <rect x={W - 92} y={floor - 28} width={72} height={28} rx={2} fill={WOOD} />
    <rect x={W - 96} y={floor - 32} width={80} height={5} rx={1} fill={WOOD_DARK} />
    <rect x={W - 84} y={floor - 22} width={56} height={16} rx={1} fill="#00000022" />
    <Glyph x={W - 80} y={floor - 33} size={14}>
      🛎️
    </Glyph>
  </g>
);

const Parlour = ({ floor, time, night, active }: DecorProps) => (
  <g>
    <ellipse cx={126} cy={floor - 1} rx={62} ry={5} fill="#8e3140" opacity={0.55} />
    <Fire x={30} y={floor} time={time} lit={night || active} />
    <rect x={14} y={24} width={30} height={24} rx={2} fill={BRASS} />
    <rect x={17} y={27} width={24} height={18} fill="#6d7f8f" />
    <Glyph x={29} y={42} size={13}>
      🏞️
    </Glyph>
    <Table x={88} y={floor} w={92} cloth="#fbf6ec" />
  </g>
);

const Dining = ({ floor, time, night }: DecorProps) => (
  <g>
    <ellipse cx={W / 2 + 12} cy={floor - 1} rx={84} ry={5} fill="#3a1f1c" opacity={0.4} />
    {/* A chandelier over a long table. */}
    <line x1={W / 2 + 40} y1={0} x2={W / 2 + 40} y2={20} stroke={BRASS} strokeWidth={1.5} />
    <path d={`M ${W / 2 + 22} 24 Q ${W / 2 + 40} 34 ${W / 2 + 58} 24`} stroke={BRASS} strokeWidth={2.2} fill="none" />
    {[22, 40, 58].map((dx, i) => (
      <g key={dx}>
        <rect x={W / 2 + dx - 1} y={17} width={2} height={8} fill="#fbf6ec" />
        <ellipse cx={W / 2 + dx} cy={14} rx={2} ry={3.2 + Math.sin(time * 9 + i) * 0.6} fill="#ffd66b" opacity={night ? 1 : 0.5} />
      </g>
    ))}
    <rect x={10} y={floor - 54} width={22} height={54} rx={2} fill={WOOD_DARK} />
    <rect x={13} y={floor - 50} width={16} height={20} rx={1} fill="#e8d9b0" opacity={0.6} />
    <Table x={30} y={floor} w={150} cloth="#fbf6ec" />
  </g>
);

const Lab = ({ floor, time, active }: DecorProps) => (
  <g>
    <Shelves x={128} y={24} w={54} rows={3} colors={["#8e3140", "#3d6b5a", "#c79a3e", "#4a5f7a", "#6b4a7a"]} />
    <Table x={16} y={floor} w={84} />
    <Glyph x={36} y={floor - 24} size={24}>
      ⚗️
    </Glyph>
    <circle cx={76} cy={floor - 32} r={7} fill="#7fe0d0" opacity={0.8} />
    <rect x={73.5} y={floor - 45} width={5} height={8} fill="#bfeee6" opacity={0.8} />
    <circle cx={76} cy={floor - 32} r={13 + (active ? Math.sin(time * 4) * 2 : 0)} fill="#7fe0d0" opacity={active ? 0.25 : 0.1} />
    {active && [0, 1, 2].map((i) => <circle key={i} cx={74 + i * 2} cy={floor - 46 - ((time * 12 + i * 7) % 22)} r={1.6} fill="#bfeee6" opacity={0.7} />)}
    <circle cx={W / 2 - 34} cy={38} r={13} fill="none" stroke="#cfe3ea" strokeWidth={1} opacity={0.6} />
    <path d={`M ${W / 2 - 47} 38 L ${W / 2 - 21} 38 M ${W / 2 - 34} 25 L ${W / 2 - 34} 51`} stroke="#cfe3ea" strokeWidth={0.8} opacity={0.6} />
  </g>
);

const Pantry = ({ floor }: DecorProps) => (
  <g>
    <Shelves x={92} y={30} w={90} rows={3} colors={["#c98a4b", "#e8d9b0", "#a85c5c", "#8ea172", "#d9b25a"]} />
    <Glyph x={24} y={floor - 2} size={30}>
      🛢️
    </Glyph>
    <Glyph x={56} y={floor - 2} size={24}>
      🧺
    </Glyph>
    <path d={`M 68 ${floor} Q 70 ${floor - 22} 82 ${floor - 22} Q 92 ${floor - 22} 94 ${floor} Z`} fill="#d9cdbb" />
    <path d={`M 76 ${floor - 22} L 80 ${floor - 28} L 86 ${floor - 22}`} fill="#c9bca8" />
  </g>
);

const Conservatory = ({ floor, time }: DecorProps) => (
  <g>
    {/* Glazing bars, then the benches of plants. */}
    {[0, 1, 2, 3, 4].map((i) => (
      <line key={i} x1={i * 49} y1={0} x2={i * 49} y2={floor - 34} stroke="#fff" strokeWidth={1.2} opacity={0.55} />
    ))}
    <path d={`M 0 26 Q ${W / 2} -8 ${W} 26`} stroke="#fff" strokeWidth={1.2} fill="none" opacity={0.55} />
    <rect x={10} y={floor - 16} width={176} height={5} fill={WOOD_DARK} />
    {[24, 56, 88, 120, 152].map((x, i) => (
      <g key={x} transform={`rotate(${Math.sin(time * 1.3 + i) * 2.2} ${x} ${floor - 16})`}>
        <Glyph x={x} y={floor - 16} size={i % 2 ? 20 : 26}>
          {["🪴", "🌷", "🌿", "🌹", "🌱"][i]}
        </Glyph>
      </g>
    ))}
  </g>
);

const Stillroom = ({ floor, time, active }: DecorProps) => (
  <g>
    <Shelves x={90} y={26} w={92} rows={3} colors={["#8e3140", "#b093a6", "#6b4a7a", "#c79a3e", "#4f7d4a"]} />
    <Table x={14} y={floor} w={70} />
    <ellipse cx={38} cy={floor - 34} rx={13} ry={12} fill="#c98a4b" />
    <path d={`M 38 ${floor - 46} Q 60 ${floor - 60} 68 ${floor - 30}`} stroke="#c98a4b" strokeWidth={3} fill="none" />
    <rect x={64} y={floor - 32} width={8} height={10} rx={2} fill="#b8dfe8" opacity={0.85} />
    {active && <circle cx={68} cy={floor - 30 + ((time * 10) % 8)} r={1.4} fill="#8e3140" />}
  </g>
);

const Music = ({ floor, time, active }: DecorProps) => (
  <g>
    <Glyph x={48} y={floor - 2} size={42}>
      🎹
    </Glyph>
    <Glyph x={150} y={floor - 4} size={26}>
      🎻
    </Glyph>
    <rect x={112} y={floor - 40} width={2} height={40} fill={WOOD_DARK} />
    <rect x={102} y={floor - 50} width={22} height={14} rx={1} fill="#fbf6ec" stroke={WOOD_DARK} strokeWidth={1} />
    {active &&
      [0, 1, 2].map((i) => {
        const p = (time * 0.45 + i / 3) % 1;
        return (
          <Glyph key={i} x={70 + i * 26 + Math.sin(time * 2 + i) * 6} y={floor - 52 - p * 40} size={13} opacity={1 - p}>
            {i % 2 ? "🎵" : "🎶"}
          </Glyph>
        );
      })}
  </g>
);

const Bath = ({ floor, time }: DecorProps) => (
  <g>
    {Array.from({ length: 4 }, (_, i) => (
      <line key={i} x1={0} y1={floor - 12 - i * 9} x2={W} y2={floor - 12 - i * 9} stroke="#fff" strokeWidth={0.8} opacity={0.5} />
    ))}
    <Glyph x={126} y={floor - 2} size={46}>
      🛁
    </Glyph>
    {[0, 1, 2].map((i) => (
      <circle key={i} cx={112 + i * 12} cy={floor - 44 - ((time * 9 + i * 11) % 30)} r={4} fill="#fff" opacity={0.3} />
    ))}
    <rect x={18} y={floor - 46} width={30} height={3} fill={BRASS} />
    <rect x={22} y={floor - 43} width={10} height={22} rx={1} fill="#fbf6ec" />
    <rect x={35} y={floor - 43} width={10} height={18} rx={1} fill="#e2b3aa" />
  </g>
);

const Empty = ({ floor }: DecorProps) => (
  <g opacity={0.6}>
    <path d={`M 34 ${floor} L 46 ${floor - 46} L 52 ${floor - 46} L 64 ${floor}`} stroke="#8a7458" strokeWidth={2.5} fill="none" />
    <line x1={39} y1={floor - 18} x2={59} y2={floor - 18} stroke="#8a7458" strokeWidth={2} />
    <line x1={43} y1={floor - 34} x2={55} y2={floor - 34} stroke="#8a7458" strokeWidth={2} />
    <rect x={138} y={floor - 14} width={20} height={14} rx={2} fill="#b8a88e" />
  </g>
);

const DECOR: Partial<Record<RoomKind, (p: DecorProps) => React.ReactNode>> = {
  kitchen: Kitchen,
  shop: Shop,
  parlour: Parlour,
  dining: Dining,
  lab: Lab,
  pantry: Pantry,
  conservatory: Conservatory,
  stillroom: Stillroom,
  music: Music,
  bath: Bath,
  empty: Empty,
};

export const RoomDecor = ({ kind, ...rest }: DecorProps & { kind: RoomKind }) => {
  const Draw = DECOR[kind];
  return Draw ? <>{Draw(rest)}</> : null;
};

/** Where in the room (x within the cell) someone working there stands. */
export const STATION_X: Partial<Record<RoomKind, number>> = {
  kitchen: 92,
  shop: W - 56,
  parlour: 48,
  dining: 20,
  lab: 108,
  pantry: 118,
  conservatory: 100,
  stillroom: 98,
  music: 86,
  bath: 70,
};
