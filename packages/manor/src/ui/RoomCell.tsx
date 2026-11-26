import { GOODS, RECIPES, ROOM_DEFS } from "../sim/content/house";
import { DEVICES } from "../sim/content/devices";
import { FANCY_SECONDS, SHELF_CAP } from "../sim/tuning";
import type { Game, Room, RoomKind, Visitor } from "../sim/types";
import { BATH } from "../sim/visitors";
import { RoomDecor } from "./RoomDecor";
import { VisitorFigure } from "./VisitorFigure";
import { CELL_H, CELL_W, FLOORBOARD, WALL, paletteFor, roomRect } from "./geometry";

// One room of the dollhouse: wallpaper, a window, its furniture, its shelf of goods, and whoever
// is visiting. A wing that is shut up shows its outside wall instead.

type Props = {
  g: Game;
  room: Room;
  visitors: Visitor[];
  sky: string;
  night: boolean;
  time: number;
  selected: boolean;
  dropTarget: "no" | "yes" | "hover";
  placeTarget: boolean;
  lit: boolean;
  onClick: () => void;
};

const WINDOW = { w: 32, h: 42, y: 24 };
const WAINSCOT_H = 34;
/** Where each kind of room has its window; rooms with none are glass already or underground. */
const WINDOW_X: Partial<Record<RoomKind, number>> = { empty: 82, kitchen: 110, shop: 16, parlour: 84, lab: 58, stillroom: 34, dining: 146, music: 82, bath: 60 };

export const seatX = (kind: RoomKind, w: number, spot: number): number => {
  if (kind === "shop") return w - 114 - spot * 17;
  if (kind === "dining") return 46 + spot * 25;
  if (kind === "bath") return w - 70;
  return 106 + spot * 30;
};

/** How far above the boards a visitor's face sits: standing at a counter, or seated. */
export const visitorLift = (kind: RoomKind): number => (kind === "shop" ? 0 : kind === "bath" ? 22 : 6);

/** Bubbles over neighbours in a queue alternate in height so they do not sit on each other. */
const BUBBLE_STEP = 15;

const VisitorFace = ({ v, x, y, seated }: { v: Visitor; x: number; y: number; seated: boolean }) => {
  const leaving = v.leaving >= 0;
  const order = v.kind === "order";
  const wants = v.kind === "guest" ? [] : order ? v.wants.slice(0, 1) : v.wants;
  const worry = v.kind !== "guest" && v.patienceMax > 0 ? 1 - Math.max(0, v.patience) / v.patienceMax : 0;
  const drift = leaving ? v.leaving * 26 : 0;
  const top = seated ? -43 : -49;
  const bubbleY = top - (seated ? 0 : (v.spot % 2) * BUBBLE_STEP);
  const width = 8 + wants.length * 14 + (order ? 18 : 0);
  return (
    <g transform={`translate(${x + drift} ${y})`} opacity={leaving ? Math.max(0, 1 - v.leaving / 1.1) : 1}>
      <VisitorFigure v={v} seated={seated} />
      {leaving && (
        <text x={10} y={top + 6} fontSize={11}>
          {v.happy ? "💛" : "💢"}
        </text>
      )}
      {!leaving && wants.length > 0 && (
        <g transform={`translate(0 ${bubbleY})`}>
          <rect x={-width / 2} y={-14} width={width} height={17} rx={8} fill={order ? "#fff0c2" : "#fffaf0"} stroke={worry > 0.66 ? "#d6453d" : worry > 0.33 ? "#e0a43a" : order ? "#c79a3e" : "#b8ab95"} strokeWidth={order ? 2.2 : 1.5} />
          <text x={0} y={-1} fontSize={11.5} textAnchor="middle">
            {wants.map((w) => (w === BATH ? "🛁" : GOODS[w].glyph)).join("")}
            {order ? `×${v.wants.length}` : ""}
          </text>
          {order && <rect x={-width / 2 + 3} y={4.5} width={(width - 6) * Math.max(0, 1 - worry)} height={2.2} rx={1} fill="#c79a3e" />}
        </g>
      )}
      {v.kind === "guest" && !v.fancy && v.busy > 0 && v.had.length > 0 && (
        <text x={0} y={top - 2} fontSize={12} textAnchor="middle">
          {GOODS[v.had[v.had.length - 1]].glyph}
        </text>
      )}
      {v.kind === "guest" && v.had.length > 0 && (
        <g transform={`translate(10 ${seated ? -12 : -6})`}>
          <circle cx={0} cy={0} r={5.5} fill="#2b1f19" />
          <text x={0} y={2.6} fontSize={7.5} textAnchor="middle" fill="#fff8ea" fontWeight={700}>
            {v.had.length}
          </text>
        </g>
      )}
    </g>
  );
};

const FANCY_RING = 96;
/** Shelf badges drawn before the rest collapse into "+n": few enough to leave the room's name clear. */
const SHELF_SHOWN = 4;

/** A guest's fancy: a thought bubble to click. Drawn over everything, so nobody stands in front of it. */
export const FancyBubble = ({ v, x, y, onFancy }: { v: Visitor; x: number; y: number; onFancy: (id: number) => void }) => {
  if (!v.fancy) return null;
  return (
    <g
      transform={`translate(${x} ${y})`}
      style={{ cursor: v.noted ? "default" : "pointer" }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onFancy(v.id);
      }}
      data-fancy={v.id}
    >
      <circle cx={-8} cy={14} r={2.6} fill={v.noted ? "#ffe08a" : "#fffaf0"} stroke="#5a2f2a" strokeWidth={0.9} />
      <circle cx={-4} cy={19} r={1.6} fill={v.noted ? "#ffe08a" : "#fffaf0"} stroke="#5a2f2a" strokeWidth={0.8} />
      <ellipse cx={0} cy={0} rx={16} ry={13} fill={v.noted ? "#ffe08a" : "#fffaf0"} stroke={v.noted ? "#c79a3e" : "#8e3140"} strokeWidth={2.2} className={v.noted ? "" : "pulse"} />
      <text x={0} y={5.5} fontSize={15} textAnchor="middle">
        {GOODS[v.fancy].glyph}
      </text>
      {/* A ring of the time left. */}
      <ellipse cx={0} cy={0} rx={16} ry={13} fill="none" stroke="#2b1f19" strokeWidth={1.2} strokeDasharray={`${Math.max(0, v.fancyLeft / FANCY_SECONDS) * FANCY_RING} 400`} opacity={0.5} />
      {v.noted && (
        <text x={13} y={-8} fontSize={10}>
          ✓
        </text>
      )}
      <rect x={-20} y={-17} width={40} height={40} fill="transparent" />
    </g>
  );
};

const Shelf = ({ room, ink }: { room: Room; ink: string }) => {
  const goods = Object.entries(room.shelf).filter(([, n]) => n > 0);
  if (goods.length === 0) return null;
  const shown = goods.slice(0, SHELF_SHOWN);
  const makes = room.recipe ? RECIPES[room.recipe].makes : null;
  return (
    <g transform={`translate(${CELL_W - 10} 15)`}>
      {shown.map(([good, n], i) => {
        const full = good === makes && n >= SHELF_CAP;
        return (
          <g key={good} transform={`translate(${-i * 29} 0)`}>
            <rect x={-27} y={-10} width={27} height={19} rx={5} fill={full ? "#d6453d" : "#fffaf0"} opacity={0.92} stroke="#0002" />
            <text x={-25} y={4.5} fontSize={12}>
              {GOODS[good].glyph}
            </text>
            <text x={-2.5} y={4} fontSize={9.5} textAnchor="end" fill={full ? "#fff" : "#4a3a2a"} fontWeight={700}>
              {n}
            </text>
          </g>
        );
      })}
      {goods.length > shown.length && (
        <text x={-shown.length * 29 - 4} y={4} fontSize={9} textAnchor="end" fill={ink}>
          +{goods.length - shown.length}
        </text>
      )}
    </g>
  );
};

const BRICK_ROWS = 9;
const BRICK_W = 36;

/** A wing that is shut up shows its outside wall: brick, a shuttered window, stone below ground. */
const Facade = ({ room, night }: { room: Room; night: boolean }) => {
  const r = roomRect(room);
  const cellar = room.floor === 0;
  const rowH = CELL_H / BRICK_ROWS;
  const line = cellar ? "#4a403a" : "#6d4033";
  const w = r.w;
  const shutter = Math.min(23, (w - 26) / 2);
  return (
    <g transform={`translate(${r.x} ${r.y})`} data-room={room.id}>
      <rect x={0} y={0} width={w} height={CELL_H} fill={cellar ? "#6b5f57" : "#9a6452"} />
      {Array.from({ length: BRICK_ROWS }, (_, i) => (
        <g key={i} opacity={0.35}>
          <line x1={0} y1={i * rowH} x2={w} y2={i * rowH} stroke={line} strokeWidth={1.2} />
          {Array.from({ length: Math.ceil(w / BRICK_W) }, (_, j) => j * BRICK_W + (i % 2 ? BRICK_W / 2 : 0))
            .filter((x) => x > 0 && x < w)
            .map((x) => (
              <line key={x} x1={x} y1={i * rowH} x2={x} y2={(i + 1) * rowH} stroke={line} strokeWidth={1} />
            ))}
        </g>
      ))}
      {!cellar && (
        <g transform={`translate(${w / 2 - shutter - 1} 34)`}>
          <rect x={-5} y={-5} width={shutter * 2 + 12} height={74} rx={2} fill="#e6d8be" />
          <rect x={0} y={0} width={shutter} height={64} fill="#4f6b52" />
          <rect x={shutter + 2} y={0} width={shutter} height={64} fill="#4f6b52" />
          {Array.from({ length: 7 }, (_, i) => (
            <line key={i} x1={2} y1={6 + i * 8.5} x2={shutter * 2} y2={6 + i * 8.5} stroke="#3c5540" strokeWidth={1.4} />
          ))}
          <rect x={-8} y={66} width={shutter * 2 + 18} height={5} fill="#d1c3a8" />
        </g>
      )}
      {night && <rect x={0} y={0} width={w} height={CELL_H} fill="#141a33" opacity={0.45} />}
    </g>
  );
};

export const RoomCell = ({ g, room, visitors, sky, night, time, selected, dropTarget, placeTarget, lit, onClick }: Props) => {
  if (room.kind === "closed") return <Facade room={room} night={night} />;
  const r = roomRect(room);
  const def = ROOM_DEFS[room.kind];
  const pal = paletteFor(room);
  const cellar = room.floor === 0;
  const floor = CELL_H - FLOORBOARD;
  const making = room.recipe ? RECIPES[room.recipe].makes : null;
  const staffed = g.maids.some((m) => m.room === room.id && !m.away);
  const working = g.maids.some((m) => m.room === room.id && !m.away && m.plan[0]?.kind === "work");
  const windowX = cellar ? undefined : WINDOW_X[room.kind];
  const dark = night && room.kind === "empty";
  return (
    <g transform={`translate(${r.x} ${r.y})`} onClick={onClick} data-room={room.id} className="room" style={{ cursor: "pointer" }}>
      <title>{`${def.name}${making && def.role === "produce" ? ` · making ${GOODS[making].name.toLowerCase()}` : ""}${staffed ? "" : def.role === "none" ? "" : " · nobody posted"}`}</title>
      <rect x={0} y={0} width={CELL_W} height={CELL_H} fill={pal.wall} />
      {!cellar && Array.from({ length: 9 }, (_, i) => <rect key={i} x={10 + i * 22} y={0} width={9} height={floor - WAINSCOT_H} fill={pal.wall2} opacity={0.55} />)}
      {cellar && Array.from({ length: 5 }, (_, i) => <rect key={i} x={0} y={i * 26 + 6} width={CELL_W} height={1.5} fill={pal.trim} opacity={0.6} />)}
      {!cellar && <rect x={0} y={floor - WAINSCOT_H} width={CELL_W} height={WAINSCOT_H} fill={pal.wall2} />}
      {!cellar && <rect x={0} y={floor - WAINSCOT_H - 3} width={CELL_W} height={3} fill={pal.trim} />}
      {windowX !== undefined && (
        <g transform={`translate(${windowX} ${WINDOW.y})`}>
          <rect x={-3} y={-3} width={WINDOW.w + 6} height={WINDOW.h + 6} rx={2} fill={pal.trim} />
          <rect x={0} y={0} width={WINDOW.w} height={WINDOW.h} fill={sky} />
          <line x1={WINDOW.w / 2} y1={0} x2={WINDOW.w / 2} y2={WINDOW.h} stroke={pal.trim} strokeWidth={2} />
          <line x1={0} y1={WINDOW.h / 2} x2={WINDOW.w} y2={WINDOW.h / 2} stroke={pal.trim} strokeWidth={2} />
          {room.kind !== "empty" && (
            <>
              <path d={`M -4 -4 L 9 -4 Q 6 ${WINDOW.h * 0.5} -4 ${WINDOW.h + 3} Z`} fill={pal.trim} opacity={0.85} />
              <path d={`M ${WINDOW.w + 4} -4 L ${WINDOW.w - 9} -4 Q ${WINDOW.w - 6} ${WINDOW.h * 0.5} ${WINDOW.w + 4} ${WINDOW.h + 3} Z`} fill={pal.trim} opacity={0.85} />
            </>
          )}
        </g>
      )}
      <RoomDecor kind={room.kind} floor={floor} time={time} active={working} night={night} />
      {def.seats > 0 &&
        room.kind !== "bath" &&
        Array.from({ length: def.seats }, (_, i) => (
          <g key={i} transform={`translate(${seatX(room.kind, CELL_W, i)} ${floor})`}>
            <rect x={-8} y={-13} width={16} height={4} rx={1.5} fill="#6d4a34" />
            <rect x={-8} y={-26} width={3} height={26} rx={1} fill="#6d4a34" />
            <rect x={5} y={-10} width={3} height={10} fill="#6d4a34" />
          </g>
        ))}
      {/* After dark: lamplight where there is life, shadow where there is none. */}
      {night && !dark && <rect x={0} y={0} width={CELL_W} height={CELL_H} fill="#1b1430" opacity={staffed || visitors.length > 0 ? 0.08 : 0.34} />}
      {night && !dark && (staffed || visitors.length > 0) && <rect x={0} y={0} width={CELL_W} height={CELL_H} fill="url(#lampGlow)" />}
      {dark && <rect x={0} y={0} width={CELL_W} height={CELL_H} fill="#1b1430" opacity={0.5} />}
      {lit && (
        <g>
          <rect x={0} y={0} width={CELL_W} height={CELL_H} fill="url(#lampGlow)" />
          {[CELL_W / 2 - 60, CELL_W / 2 + 60].map((x) => (
            <g key={x}>
              <rect x={x - 1.5} y={50} width={3} height={10} fill="#fbf6ec" />
              <ellipse cx={x} cy={46} rx={2.4} ry={4 + Math.sin(time * 10 + x) * 0.8} fill="#ffd66b" />
              <circle cx={x} cy={46} r={12} fill="#ffd66b" opacity={0.18} />
            </g>
          ))}
        </g>
      )}
      <rect x={0} y={floor} width={CELL_W} height={FLOORBOARD} fill={pal.floor} />
      <rect x={0} y={floor} width={CELL_W} height={2} fill="#00000030" />
      {visitors.map((v) => (
        <VisitorFace key={v.id} v={v} x={seatX(room.kind, CELL_W, v.spot)} y={floor - visitorLift(room.kind)} seated={room.kind !== "shop"} />
      ))}
      <Shelf room={room} ink={pal.ink} />
      <text className="roomname" x={9} y={15} fill={pal.ink}>
        {def.name}
      </text>
      {making && def.role === "produce" && (
        <text x={9} y={30} fontSize={11} fill={pal.ink} opacity={staffed ? 1 : 0.55}>
          makes {GOODS[making].glyph}
        </text>
      )}
      {room.device && (
        <g transform={`translate(${CELL_W - 20} ${floor - WAINSCOT_H - 16})`}>
          <rect x={-11} y={-14} width={23} height={21} rx={5} fill="#2b2622" stroke="#e8c56a" strokeWidth={1.5} />
          <text x={0.5} y={2.5} fontSize={13} textAnchor="middle">
            {DEVICES[room.device].glyph}
          </text>
        </g>
      )}
      {room.kind === "empty" && (
        <text x={CELL_W / 2} y={CELL_H - 30} textAnchor="middle" fontSize={11} fill={pal.ink} opacity={0.7} fontStyle="italic">
          an empty room
        </text>
      )}
      <rect x={0} y={0} width={CELL_W} height={WALL / 2} fill="#3a2a22" opacity={0.5} />
      <rect x={-WALL / 2} y={0} width={WALL} height={CELL_H} fill="#4a3a30" />
      <rect x={CELL_W - WALL / 2} y={0} width={WALL} height={CELL_H} fill="#4a3a30" />
      <rect className="roomhover" x={2} y={2} width={CELL_W - 4} height={CELL_H - 4} fill="#fff" stroke="#fff3c4" strokeWidth={2} rx={3} pointerEvents="none" />
      {selected && <rect x={2} y={2} width={CELL_W - 4} height={CELL_H - 4} fill="none" stroke="#ffe08a" strokeWidth={3} rx={3} />}
      {dropTarget !== "no" && (
        <rect x={3} y={3} width={CELL_W - 6} height={CELL_H - 6} rx={4} fill={dropTarget === "hover" ? "#ffe08a44" : "none"} stroke="#ffe08a" strokeWidth={dropTarget === "hover" ? 3 : 1.5} strokeDasharray={dropTarget === "hover" ? "" : "6 5"} pointerEvents="none" />
      )}
      {placeTarget && <rect x={3} y={3} width={CELL_W - 6} height={CELL_H - 6} rx={4} fill="#9be28a33" stroke="#9be28a" strokeWidth={3} className="pulse" />}
    </g>
  );
};
