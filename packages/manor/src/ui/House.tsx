import { useEffect, useRef, useState } from "react";

import { GOODS, ROOM_DEFS } from "../sim/content/house";
import { DEVICES } from "../sim/content/devices";
import { MAID_DEFS } from "../sim/content/people";
import { SITES } from "../sim/content/world";
import { BATH_PRICE, DAY_SECONDS, FLOORS, PATRON_PAY, STAIR_COL } from "../sim/tuning";
import type { Game, Maid, Room } from "../sim/types";
import { BATH, servingValue } from "../sim/visitors";
import { MaidFigure } from "./MaidFigure";
import { Ornaments } from "./Ornaments";
import { FancyBubble, RoomCell, seatX, visitorLift } from "./RoomCell";
import { Scenery } from "./Scenery";
import { VisitorFigure } from "./VisitorFigure";
import { STATION_X } from "./RoomDecor";
import { CELL_H, CELL_W, FLOORBOARD, MARGIN_X, MAX_VIEW_W, ROOF_H, VIEW_H, colAt, figurePoint, floorY, houseW, px, roomRect, setWings, viewW } from "./geometry";
import { dispatch, getUi, setUi, toast, useUi } from "./store";

// The dollhouse: a cutaway of the mansion with the roof on, the household walking about inside,
// and the whole thing draggable — pick anyone up and put them in a room.

type Sky = { top: string; bottom: string; window: string; night: boolean; stars: number };

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix = (a: string, b: string, t: number): string => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(lerp(v, pb[i], t)).toString(16).padStart(2, "0")).join("")}`;
};

const DAWN = { top: "#f2b9a0", bottom: "#fbe3c2" };
const NOON = { top: "#8ec5ea", bottom: "#d7eef7" };
const DUSK = { top: "#5a4a7a", bottom: "#f0a070" };
const NIGHT = { top: "#141a33", bottom: "#2c2f55" };

const skyFor = (g: Game): Sky => {
  if (g.phase === "occasion" || g.phase === "result") return { ...NIGHT, window: "#1b2244", night: true, stars: 1 };
  if (g.phase === "offers" || g.phase === "sabbath" || g.phase === "ended") return { top: "#2a2a52", bottom: "#7a5a7a", window: "#3a3566", night: true, stars: 0.6 };
  if (g.phase !== "day") return { ...DAWN, window: "#fbe3c2", night: false, stars: 0 };
  const f = g.t / DAY_SECONDS;
  const HALF = 0.5;
  const LATE = 0.8;
  if (f < HALF) {
    const t = f / HALF;
    return { top: mix(DAWN.top, NOON.top, t), bottom: mix(DAWN.bottom, NOON.bottom, t), window: mix(DAWN.bottom, NOON.bottom, t), night: false, stars: 0 };
  }
  if (f < LATE) return { ...NOON, window: NOON.bottom, night: false, stars: 0 };
  const t = (f - LATE) / (1 - LATE);
  return { top: mix(NOON.top, DUSK.top, t), bottom: mix(NOON.bottom, DUSK.bottom, t), window: mix(NOON.bottom, DUSK.bottom, t), night: t > 0.6, stars: 0 };
};

const STARS = Array.from({ length: 46 }, (_, i) => ({ x: (i * 197.3) % MAX_VIEW_W, y: (i * 61.7) % (ROOF_H + 60), r: 0.6 + ((i * 7) % 5) * 0.22 }));

const Stair = ({ floor }: { floor: number }) => {
  const x = px(STAIR_COL);
  const top = floorY(floor) - CELL_H;
  const bottom = floorY(floor);
  const up = floor < FLOORS - 1;
  const leftToRight = floor % 2 === 0;
  const STEPS = 9;
  return (
    <g>
      <rect x={x} y={top} width={CELL_W} height={CELL_H} fill={floor === 0 ? "#6f6157" : "#d9c9a8"} />
      <rect x={x} y={bottom - 40} width={CELL_W} height={40 - FLOORBOARD} fill={floor === 0 ? "#63564d" : "#c9b78f"} />
      {up &&
        Array.from({ length: STEPS }, (_, i) => {
          const sx = leftToRight ? x + 24 + i * 16 : x + CELL_W - 24 - (i + 1) * 16;
          const h = ((i + 1) * (CELL_H - FLOORBOARD)) / STEPS;
          return <rect key={i} x={sx} y={bottom - FLOORBOARD - h} width={16} height={h} fill={floor === 0 ? "#57493f" : "#9a7a58"} opacity={0.5 + i * 0.04} />;
        })}
      {floor === 1 && (
        <g>
          <rect x={x + CELL_W / 2 - 15} y={bottom - FLOORBOARD - 56} width={30} height={56} rx={3} fill="#5a2f2a" stroke="#3a1f1c" strokeWidth={2} />
          <circle cx={x + CELL_W / 2 + 9} cy={bottom - FLOORBOARD - 26} r={2} fill="#e8c56a" />
        </g>
      )}
      <rect x={x} y={bottom - FLOORBOARD} width={CELL_W} height={FLOORBOARD} fill={floor === 0 ? "#4f443c" : "#9c7450"} />
    </g>
  );
};

const Roof = () => {
  const left = MARGIN_X - 14;
  const right = MARGIN_X + houseW() + 14;
  const base = ROOF_H;
  return (
    <g>
      <rect x={px(1) + 40} y={18} width={26} height={54} fill="#7a4a3c" />
      <rect x={px(1) + 36} y={12} width={34} height={9} fill="#5c362c" />
      <rect x={px(3) + 120} y={24} width={24} height={46} fill="#7a4a3c" />
      <rect x={px(3) + 116} y={18} width={32} height={9} fill="#5c362c" />
      <path d={`M ${left} ${base} L ${left + 70} 34 L ${right - 70} 34 L ${right} ${base} Z`} fill="#4b5563" />
      <path d={`M ${left + 70} 34 L ${right - 70} 34 L ${right - 76} 28 L ${left + 76} 28 Z`} fill="#3b4451" />
      {Array.from({ length: 5 }, (_, i) => (
        <line key={i} x1={left + 18 + i * 13} y1={base - 14 - i * 10} x2={right - 18 - i * 13} y2={base - 14 - i * 10} stroke="#3b4451" strokeWidth={1.5} opacity={0.6} />
      ))}
      <rect x={left} y={base - 5} width={right - left} height={7} fill="#2f3743" />
    </g>
  );
};

const roomUnder = (g: Game, x: number, y: number): Room | "hall" | null => {
  const col = colAt(x);
  if (col < 0 || y < ROOF_H || y > ROOF_H + FLOORS * CELL_H) return null;
  const floor = FLOORS - 1 - Math.floor((y - ROOF_H) / CELL_H);
  if (col === STAIR_COL) return "hall";
  return g.rooms.find((r) => r.col === col && r.floor === floor) ?? null;
};

const DRAG_THRESHOLD_PX = 5;
/** How far the sky and ground are painted beyond the picture's own edges. */
const BLEED = 1200;
/** Sideways spacing between people standing in the same room. */
const SPREAD_PX = 34;
/** Within this many columns of her room's middle, a figure is drawn toward its work station. */
const STATION_PULL = 0.3;
/** Seconds a floating number lives, and how far it rises. */
const FLOAT_SECONDS = 1.3;
const FLOAT_RISE = 30;

type Floater = { id: number; x: number; y: number; text: string; color: string; born: number };

export const House = () => {
  const ui = useUi();
  const g = ui.game;
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; startX: number; startY: number; moved: boolean } | null>(null);
  const sky = skyFor(g);
  const time = performance.now() / 1000;
  setWings(g.wingsOpen.west, g.wingsOpen.east);

  // Numbers that float up when something is served: Comfort and Grace at an occasion, coin by day.
  const floaters = useRef<Floater[]>([]);
  const seenHad = useRef<Map<number, number>>(new Map());
  const nextFloat = useRef(1);
  for (const v of g.visitors) {
    const before = seenHad.current.get(v.id) ?? 0;
    const now = v.had.length + (v.wants.length === 0 && v.kind === "customer" && v.busy > 0 ? 1 : 0);
    if (now > before && v.room) {
      const room = g.rooms.find((r) => r.id === v.room);
      const good = v.had[v.had.length - 1];
      if (room) {
        const rect = roomRect(room);
        const at = { x: rect.x + seatX(room.kind, CELL_W, v.spot), y: rect.y + CELL_H - FLOORBOARD - visitorLift(room.kind) - 58 };
        if (v.kind === "guest" && good) {
          const value = servingValue(g, room, v, good);
          floaters.current.push({ id: nextFloat.current++, ...at, text: `+${value}`, color: GOODS[good].pole === "comfort" ? "#ffb070" : "#c9a8ff", born: time });
        } else if (good || v.wants.length === 0) {
          const pay = good ? GOODS[good].price * (v.kind === "patron" ? PATRON_PAY : 1) : BATH_PRICE;
          floaters.current.push({ id: nextFloat.current++, ...at, text: `+${pay}`, color: "#ffe08a", born: time });
        }
      }
    }
    seenHad.current.set(v.id, now);
  }
  if (seenHad.current.size > 400) seenHad.current = new Map(g.visitors.map((v) => [v.id, v.had.length]));
  floaters.current = floaters.current.filter((f) => time - f.born < FLOAT_SECONDS);
  void BATH;

  const toSvg = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent): void => {
      const p = toSvg(e.clientX, e.clientY);
      const moved = drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_THRESHOLD_PX;
      setDrag({ ...drag, x: p.x, y: p.y, moved });
      if (moved && getUi().dragging !== drag.id) setUi({ dragging: drag.id });
    };
    const up = (e: PointerEvent): void => {
      const p = toSvg(e.clientX, e.clientY);
      if (!drag.moved) setUi({ selection: { kind: "maid", id: drag.id }, dragging: null });
      else {
        const target = roomUnder(getUi().game, p.x, p.y);
        if (target === "hall") dispatch({ kind: "assign", maid: drag.id, room: null });
        else if (target && ROOM_DEFS[target.kind].role !== "none") dispatch({ kind: "assign", maid: drag.id, room: target.id });
        setUi({ dragging: null });
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  });

  const hover = drag && drag.moved ? roomUnder(g, drag.x, drag.y) : null;
  const held = (g.phase === "day" || g.phase === "occasion") && (ui.paused || ui.dusk);
  const litRooms = g.occasion?.lit ?? [];

  const clickRoom = (room: Room): void => {
    if (ui.placing !== null) {
      if (room.kind === "empty" && dispatch({ kind: "buy", index: ui.placing, room: room.id })) setUi({ placing: null, peek: true, selection: { kind: "room", id: room.id } });
      return;
    }
    if (ui.installing) {
      const displaced = room.device;
      if (dispatch({ kind: "install", device: ui.installing, room: room.id })) {
        if (displaced) toast(`A room holds one device: the ${DEVICES[displaced].name.toLowerCase()} came out`);
        setUi({ installing: null, selection: { kind: "room", id: room.id } });
      }
      return;
    }
    setUi({ selection: { kind: "room", id: room.id } });
  };

  // People standing in the same place fan out so nobody hides behind anybody.
  const here = (m: Maid): Maid[] => g.maids.filter((o) => !o.away && Math.abs(o.pos.x - m.pos.x) < 0.02 && Math.abs(o.pos.y - m.pos.y) < 0.02);
  const figure = (m: Maid): { x: number; y: number } => {
    const base = figurePoint(m.pos);
    const group = here(m);
    const offset = group.length > 1 ? (group.indexOf(m) - (group.length - 1) / 2) * SPREAD_PX : 0;
    // Near the middle of her own room she drifts to where its work is done, so she stands at the
    // range or behind the counter rather than in the middle of the floor.
    const room = m.room ? g.rooms.find((r) => r.id === m.room) : undefined;
    const station = room ? STATION_X[room.kind] : undefined;
    if (!room || station === undefined || Math.abs(m.pos.y - room.floor) > 0.01) return { x: base.x + offset, y: base.y };
    const dist = Math.abs(m.pos.x - (room.col + 0.5));
    const pull = Math.max(0, 1 - dist / STATION_PULL);
    const clampTo = (x: number): number => Math.max(roomRect(room).x + 16, Math.min(roomRect(room).x + CELL_W - 16, x));
    return { x: clampTo(base.x + (station - CELL_W / 2) * pull + offset), y: base.y };
  };

  const standing = g.visitors.filter((v) => v.room === null && v.leaving < 0);
  // Day one, before the house opens, with nobody at the counter: point at the Master and the shop.
  const coach = ((): { from: { x: number; y: number }; to: { x: number; y: number } } | null => {
    if (g.day !== 1 || g.phase !== "morning" || drag) return null;
    const lord = g.maids.find((m) => m.isLord);
    const shop = g.rooms.find((r) => r.kind === "shop");
    if (!lord || !shop || g.maids.some((m) => m.room === shop.id)) return null;
    const rect = roomRect(shop);
    return { from: figure(lord), to: { x: rect.x + CELL_W / 2, y: rect.y + CELL_H - FLOORBOARD } };
  })();
  const exp = g.expedition;
  const fits = ui.installing ? DEVICES[ui.installing].fits : null;

  return (
    <svg ref={svgRef} className="house" viewBox={`0 0 ${viewW()} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky.top} />
          <stop offset="1" stopColor={sky.bottom} />
        </linearGradient>
        <radialGradient id="lampGlow" cx="0.5" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#ffcf7a" stopOpacity="0.34" />
          <stop offset="1" stopColor="#ffb14a" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* The sky and the ground run well past the picture, so any window shape is filled. */}
      <rect x={-BLEED} y={-BLEED} width={viewW() + BLEED * 2} height={BLEED} fill={sky.top} />
      <rect x={-BLEED} y={0} width={viewW() + BLEED * 2} height={VIEW_H} fill="url(#sky)" />
      {sky.stars > 0 && STARS.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={sky.stars * (0.5 + 0.5 * Math.sin(time * 1.3 + i))} />)}
      {/* Hills, then the lawn at ground level and the earth the cellar sits in. */}
      <path d={`M ${-BLEED} ${floorY(1) - 46} L 0 ${floorY(1) - 40} Q ${viewW() * 0.2} ${floorY(1) - 90} ${viewW() * 0.42} ${floorY(1) - 50} T ${viewW()} ${floorY(1) - 60} L ${viewW() + BLEED} ${floorY(1) - 50} L ${viewW() + BLEED} ${floorY(1)} L ${-BLEED} ${floorY(1)} Z`} fill={sky.night ? "#26304a" : "#a9c99a"} opacity={0.8} />
      <rect x={-BLEED} y={floorY(1)} width={viewW() + BLEED * 2} height={VIEW_H - floorY(1) + BLEED} fill="#5a4636" />
      <rect x={-BLEED} y={floorY(1)} width={viewW() + BLEED * 2} height={8} fill={sky.night ? "#33503a" : "#7fae6a"} />
      <Scenery g={g} time={time} night={sky.night} cooking={g.maids.some((m) => !m.away && m.plan[0]?.kind === "work" && m.plan[0].action.kind === "batch")} />
      <Roof />
      <Ornaments g={g} time={time} night={sky.night} where="outside" />
      <rect x={MARGIN_X - 6} y={ROOF_H} width={houseW() + 12} height={FLOORS * CELL_H + 6} fill="#4a3a30" />
      {Array.from({ length: FLOORS }, (_, f) => (
        <Stair key={f} floor={f} />
      ))}
      {g.rooms.map((room) => {
        const visitors = g.visitors.filter((v) => v.room === room.id);
        const canDrop = drag && drag.moved && ROOM_DEFS[room.kind].role !== "none";
        const canInstall = Array.isArray(fits) && fits.includes(room.kind);
        return (
          <RoomCell
            key={room.id}
            g={g}
            room={room}
            visitors={visitors}
            sky={sky.window}
            night={sky.night}
            time={time}
            lit={litRooms.includes(room.id)}
            selected={ui.selection?.kind === "room" && ui.selection.id === room.id}
            dropTarget={canDrop ? (hover === room ? "hover" : "yes") : "no"}
            placeTarget={(ui.placing !== null && room.kind === "empty") || canInstall}
            onClick={() => clickRoom(room)}
          />
        );
      })}
      <Ornaments g={g} time={time} night={sky.night} where="inside" />
      {standing.map((v, i) => (
        <g key={v.id} transform={`translate(${px(STAIR_COL) + 34 + i * 20} ${floorY(1) - FLOORBOARD})`} opacity={0.85}>
          <VisitorFigure v={v} seated={false} />
        </g>
      ))}
      {g.maids
        .filter((m) => !m.away && m.id !== drag?.id)
        .map((m) => {
          const p = figure(m);
          return (
            <MaidFigure
              key={m.id}
              maid={m}
              x={p.x}
              y={p.y}
              moving={m.plan[0]?.kind === "walk"}
              labelDrop={here(m).indexOf(m) % 2 === 1}
              crowded={here(m).length >= 3}
              selected={ui.selection?.kind === "maid" && ui.selection.id === m.id}
              dragging={false}
              time={time}
              onPointerDown={(e) => {
                e.preventDefault();
                const q = toSvg(e.clientX, e.clientY);
                setDrag({ id: m.id, x: q.x, y: q.y, startX: e.clientX, startY: e.clientY, moved: false });
              }}
            />
          );
        })}
      {/* While the clock is held, anyone sent somewhere is shown faintly where she is going. */}
      {held &&
        g.maids
          .filter((m) => !m.away && m.room && m.id !== drag?.id)
          .map((m) => {
            const room = g.rooms.find((r) => r.id === m.room);
            if (!room || (Math.abs(m.pos.x - (room.col + 0.5)) < 0.05 && Math.abs(m.pos.y - room.floor) < 0.05)) return null;
            const rect = roomRect(room);
            const from = figure(m);
            const to = { x: rect.x + (STATION_X[room.kind] ?? CELL_W / 2), y: rect.y + CELL_H - FLOORBOARD };
            return (
              <g key={`ghost-${m.id}`} pointerEvents="none">
                <line x1={from.x} y1={from.y - 24} x2={to.x} y2={to.y - 24} stroke="#ffe08a" strokeWidth={1.6} strokeDasharray="5 5" opacity={0.75} />
                <g opacity={0.45}>
                  <MaidFigure maid={m} x={to.x} y={to.y} moving={false} labelDrop={false} crowded={false} selected={false} dragging={false} time={time} onPointerDown={() => undefined} />
                </g>
              </g>
            );
          })}
      {/* The first morning: show the one move that matters, once. */}
      {coach && (
        <g pointerEvents="none" className="pulse">
          <path d={`M ${coach.from.x} ${coach.from.y - 60} Q ${(coach.from.x + coach.to.x) / 2} ${Math.min(coach.from.y, coach.to.y) - 150} ${coach.to.x} ${coach.to.y - 70}`} fill="none" stroke="#ffe08a" strokeWidth={3} strokeDasharray="2 9" strokeLinecap="round" />
          <path d={`M ${coach.to.x - 8} ${coach.to.y - 82} L ${coach.to.x} ${coach.to.y - 66} L ${coach.to.x + 9} ${coach.to.y - 81}`} fill="none" stroke="#ffe08a" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          <text className="coach" x={(coach.from.x + coach.to.x) / 2} y={Math.min(coach.from.y, coach.to.y) - 96} textAnchor="middle">
            drag the Master to the shop
          </text>
        </g>
      )}
      {drag &&
        (() => {
          const m = g.maids.find((x) => x.id === drag.id);
          if (!m) return null;
          const p = drag.moved ? { x: drag.x, y: drag.y + 24 } : figure(m);
          return <MaidFigure maid={m} x={p.x} y={p.y} moving={drag.moved} labelDrop={false} crowded={false} selected dragging={drag.moved} time={time} onPointerDown={() => undefined} />;
        })()}
      {exp && exp.state !== "home" && (
        <g transform={`translate(${viewW() - 30} ${floorY(1) - 22})`}>
          <text x={0} y={0} fontSize={24} textAnchor="end">
            {SITES[exp.site].glyph}
          </text>
          <text className="status" x={-30} y={-6} textAnchor="end">
            {MAID_DEFS[exp.maid].name} is out
          </text>
        </g>
      )}
      {g.visitors
        .filter((v) => v.fancy && v.room && v.leaving < 0)
        .map((v) => {
          const room = g.rooms.find((r) => r.id === v.room);
          if (!room) return null;
          const rect = roomRect(room);
          return <FancyBubble key={v.id} v={v} x={rect.x + seatX(room.kind, CELL_W, v.spot)} y={rect.y + CELL_H - FLOORBOARD - visitorLift(room.kind) - 62} onFancy={(id) => dispatch({ kind: "note", visitor: id })} />;
        })}
      {floaters.current.map((f) => {
        const age = (time - f.born) / FLOAT_SECONDS;
        return (
          <text key={f.id} className="floater" x={f.x} y={f.y - age * FLOAT_RISE} fill={f.color} opacity={1 - age * age} textAnchor="middle">
            {f.text}
          </text>
        );
      })}
      {/* Roof ridge over the top of the walls, for a finished edge. */}
      <rect x={MARGIN_X - 6} y={ROOF_H - 2} width={houseW() + 12} height={4} fill="#2f3743" />
    </svg>
  );
};
