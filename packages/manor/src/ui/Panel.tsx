import { advice } from "../sim/advice";
import { burnChance } from "../sim/agents";
import { isHired } from "../sim/content/hired";
import { GOODS, RECIPES, ROOM_DEFS, isReception, recipesFor } from "../sim/content/house";
import { DEVICES } from "../sim/content/devices";
import { MAID_DEFS, TRAITS } from "../sim/content/people";
import { TWISTS } from "../sim/content/world";
import { isOccasionDay } from "../sim/flow";
import { household, perGuest, supperForecast, supperTable } from "../sim/larder";
import { forecast } from "../sim/forecast";
import { allStock, hearthLevel } from "../sim/house";
import { researchNeeded } from "../sim/offers";
import { GENEROUS_HEARTH, PAPER_COST, WAGE } from "../sim/tuning";
import type { Game, Maid, Room } from "../sim/types";
import { servingFactors } from "../sim/visitors";
import { PAPERS } from "./geometry";
import { dispatch, setUi, useUi } from "./store";

// The right-hand panel: what the butler would tell you, the thing you have selected, the
// household, and the pantry with its standing orders.

const roomOf = (g: Game, m: Maid): string => {
  if (m.away) return "away";
  const room = g.rooms.find((r) => r.id === m.room);
  return room ? ROOM_DEFS[room.kind].name : "no post";
};

const RecipeButtons = ({ g, room }: { g: Game; room: Room }) => {
  const options = recipesFor(room.kind, g.recipes);
  if (options.length === 0) return null;
  return (
    <div className="chips">
      {options.map((r) => {
        const good = GOODS[r.makes];
        const needs = Object.entries(r.needs);
        return (
          <button key={r.id} className={room.rota.includes(r.id) ? "chip on" : "chip"} onClick={() => dispatch({ kind: "rota", room: room.id, recipe: r.id })} title={good.note}>
            {room.recipe === r.id && room.rota.length > 1 ? "▸ " : ""}
            <span className="glyph">{good.glyph}</span> {good.name}
            {needs.length > 0 && <span className="needs"> needs {needs.map(([id, n]) => `${n > 1 ? n : ""}${GOODS[id].glyph}`).join("")}</span>}
          </button>
        );
      })}
    </div>
  );
};

/** What a serving in this room would be multiplied by tonight, as the household is posted now. */
const Bonuses = ({ g, room }: { g: Game; room: Room }) => {
  const eve = {
    twist: (g.occasion?.def ?? g.upcoming)?.twist ?? "none",
    lit: g.occasion ? g.occasion.lit : (allStock(g).candle ?? 0) > 0 ? [room.id] : [],
    music: g.rooms.some((r) => r.kind === "music" && g.maids.some((m) => !m.isLord && !m.away && m.room === r.id)),
    bath: g.rooms.some((r) => r.kind === "bath" && (r.device === "boiler" || g.maids.some((m) => !m.isLord && !m.away && m.room === r.id))),
    quartet: isHired(g, "quartet"),
    chef: isHired(g, "chef"),
    staff: (r: Room) => g.maids.filter((m) => !m.away && m.room === r.id),
  };
  const list = (good: string): { label: string; factor: number }[] => servingFactors(g, room, false, good, eve);
  const line = (name: string, factors: { label: string; factor: number }[]): string => {
    const total = factors.reduce((a, f) => a * f.factor, 1);
    return `${name} ×${total}${factors.length ? ` (${factors.map((f) => `${f.label} ×${f.factor}`).join(", ")})` : ""}`;
  };
  return (
    <>
      <h4>Served here tonight</h4>
      <p className="quiet">
        <span className="comfort">{line("Comfort", list("pie"))}</span>
        <br />
        <span className="grace">{line("Grace", list("cordial"))}</span>
        <br />
        The guest of honour counts double. A fancy caught counts threefold. Candles are lit automatically, one box a room.
      </p>
    </>
  );
};

const RoomDetails = ({ g, room }: { g: Game; room: Room }) => {
  const def = ROOM_DEFS[room.kind];
  const staff = g.maids.filter((m) => m.room === room.id && !m.away);
  const canStaff = def.role !== "none";
  const canStrip = !["closed", "empty", "pantry", "lab"].includes(room.kind) && g.phase !== "day" && g.phase !== "occasion";
  return (
    <section className="card">
      <h3>
        {def.glyph} {def.name}
      </h3>
      <p className="blurb">{def.blurb}</p>
      {def.role === "produce" && (
        <>
          <h4>On the rota</h4>
          <RecipeButtons g={g} room={room} />
          <p className="quiet">{room.rota.length > 1 ? "It makes whichever of these the house has least of." : room.rota.length === 1 ? "Click more to have it rotate between them by itself." : "Nothing chosen: whoever is posted here stands idle."}</p>
        </>
      )}
      {room.device && (
        <p className="device">
          {DEVICES[room.device].glyph} <b>{DEVICES[room.device].name}.</b> {DEVICES[room.device].effect}{" "}
          <button className="link" onClick={() => dispatch({ kind: "uninstall", room: room.id })}>
            Take it out, to put somewhere else
          </button>
        </p>
      )}
      {isReception(room.kind) && <Bonuses g={g} room={room} />}
      {canStaff && (
        <>
          <h4>Post someone here</h4>
          <div className="chips">
            {g.maids
              .filter((m) => !m.away)
              .map((m) => (
                <button key={m.id} className={m.room === room.id ? "chip on" : "chip"} onClick={() => dispatch({ kind: "assign", maid: m.id, room: m.room === room.id ? null : room.id })}>
                  {MAID_DEFS[m.id].name}
                </button>
              ))}
          </div>
          {staff.length === 0 && <p className="quiet">Nobody is posted here.</p>}
        </>
      )}
      {room.kind !== "closed" && room.floor > 0 && (
        <>
          <h4>Wallpaper · 🪙 {PAPER_COST} · for looks only</h4>
          <div className="swatches">
            {Object.entries(PAPERS).map(([id, paper]) => (
              <button key={id} className={room.paper === id ? "swatch on" : "swatch"} style={{ background: `linear-gradient(90deg, ${paper.wall} 50%, ${paper.wall2} 50%)`, borderColor: paper.trim }} title={paper.name} disabled={g.coin < PAPER_COST} onClick={() => dispatch({ kind: "paper", room: room.id, paper: id })} />
            ))}
          </div>
        </>
      )}
      {canStrip && (
        <button className="link" onClick={() => dispatch({ kind: "demolish", room: room.id })}>
          Strip this room back to bare boards
        </button>
      )}
    </section>
  );
};

const MaidDetails = ({ g, maid }: { g: Game; maid: Maid }) => {
  const def = MAID_DEFS[maid.id];
  const trait = TRAITS[def.trait];
  return (
    <section className="card">
      <h3>{def.name}</h3>
      <p className="blurb">{def.blurb}</p>
      <p className="trait">
        <b>{trait.name}.</b> {trait.effect}
        {maid.id === "evelyn" && ` Right now she burns ${Math.round(burnChance(g) * 100)} in 100.`}
      </p>
      {maid.tool && (
        <p className="device">
          {DEVICES[maid.tool].glyph} <b>{DEVICES[maid.tool].name}.</b> {DEVICES[maid.tool].effect}
        </p>
      )}
      {maid.hurtDays > 0 && <p className="warn">🩹 Cuts and bruises: half speed for {maid.hurtDays} more day{maid.hurtDays > 1 ? "s" : ""}. An elixir would mend her overnight.</p>}
      <p className="quiet">
        {roomOf(g, maid)}
        {maid.status ? ` — ${maid.status}` : ""}
      </p>
      <p className="quiet">Drag {maid.isLord ? "him" : "her"} to a room, or click a room and post {maid.isLord ? "him" : "her"} there.</p>
    </section>
  );
};

const Household = ({ g, selected }: { g: Game; selected: string | null }) => (
  <section className="card">
    <h4>Household</h4>
    <ul className="household">
      {g.maids.map((m, i) => (
        <li key={m.id} className={selected === m.id ? "on" : ""} onClick={() => setUi({ selection: { kind: "maid", id: m.id } })}>
          <span className="dot" style={{ background: MAID_DEFS[m.id].dress }} />
          <span className="who">
            <kbd>{i + 1}</kbd> {MAID_DEFS[m.id].name}
          </span>
          <span className="where">
            {g.lent?.maid === m.id ? "with the rival Master" : roomOf(g, m)}
            {m.hurtDays > 0 ? " 🩹" : ""}
          </span>
        </li>
      ))}
    </ul>
  </section>
);

const Stock = ({ g }: { g: Game }) => {
  const stock = allStock(g);
  const goods = Object.keys(GOODS).filter((id) => (stock[id] ?? 0) > 0 || g.rooms.some((r) => r.recipe && RECIPES[r.recipe].makes === id));
  const table = supperForecast(g);
  const full = supperTable(g);
  const heads = household(g);
  return (
    <section className="card">
      <h4>Larder &amp; standing orders</h4>
      {goods.length === 0 && <p className="quiet">The shelves are bare.</p>}
      <ul className="stock">
        {goods.map((id) => {
          const def = GOODS[id];
          const order = g.orders[id];
          return (
            <li key={id} title={def.note}>
              <span className="glyph">{def.glyph}</span>
              <span className="name">
                {def.name}
                {def.pole && <i className={def.pole}>{def.pole === "comfort" ? "Comfort" : "Grace"} {def.value}</i>}
              </span>
              <span className="count">{stock[id] ?? 0}</span>
              {def.pole ? (
                <button className={g.offMenu.includes(id) ? "menu off" : "menu"} onClick={() => dispatch({ kind: "menu", good: id, on: g.offMenu.includes(id) })} title={g.offMenu.includes(id) ? "Struck off the guests' menu. Click to put it back." : "On the guests' menu. Click to strike it off."}>
                  menu
                </button>
              ) : (
                <span />
              )}
              <button className={order === "sell" ? "order sell" : "order keep"} onClick={() => dispatch({ kind: "order", good: id, order: order === "sell" ? "keep" : "sell" })} title="Sell: the shop sells whatever is left once the guests' share and supper are set aside. Keep: never sold.">
                {order === "sell" ? `sell · ${def.price}` : "keep"}
              </button>
            </li>
          );
        })}
      </ul>
      {g.upcoming && (
        <p className="quiet">
          Of everything on the menu, <b>{g.upcoming.guests * perGuest(g)}</b> of each are the guests': never sold, never eaten.
        </p>
      )}
      <h4>Supper tonight</h4>
      <div className="chips">
        {(["none", "shared", "feast"] as const).map((plan) => (
          <button key={plan} className={g.supperPlan === plan ? "chip on" : "chip"} onClick={() => dispatch({ kind: "supper", plan })}>
            {plan === "none" ? "None" : plan === "shared" ? "One plain dish" : "A full table"}
          </button>
        ))}
      </div>
      <p className="quiet">
        {table.length > 0
          ? `${table.map((d) => GOODS[d].glyph).join(" ")} — one each for all ${heads}: Hearth +${table.length}.`
          : g.supperPlan === "none"
            ? "Nobody eats together. No Hearth."
            : `Nothing in the larder there are ${heads} of. No Hearth.`}
        {g.supperPlan === "shared" && full.length > 1 ? ` (A full table would be +${full.length}.)` : ""} Supper is set aside before the shop sells.
      </p>
      <h4>Wages</h4>
      <div className="chips">
        {(["fair", "generous"] as const).map((plan) => (
          <button key={plan} className={g.wages === plan ? "chip on" : "chip"} onClick={() => dispatch({ kind: "wages", plan })}>
            {plan === "fair" ? `Fair · ${WAGE.fair} a head` : `Generous · ${WAGE.generous} a head, Hearth +${GENEROUS_HEARTH}`}
          </button>
        ))}
      </div>
    </section>
  );
};

/** Every recipe the house knows: what it makes, what that is worth, and what it needs. */
const RecipeBook = ({ g }: { g: Game }) => (
  <details className="card book">
    <summary>Recipe book · {g.recipes.length}</summary>
    <ul>
      {g.recipes.map((id) => {
        const r = RECIPES[id];
        const good = GOODS[r.makes];
        const needs = Object.entries(r.needs);
        const have = g.rooms.some((room) => room.kind === r.room);
        return (
          <li key={id} className={have ? "" : "missing"} title={good.note}>
            <span className="glyph">{good.glyph}</span>
            <span>
              <b>{good.name}</b>
              {good.pole ? <i className={good.pole}> {good.pole === "comfort" ? "Comfort" : "Grace"} {good.value}</i> : <i> ingredient</i>}
              <br />
              <small>
                {ROOM_DEFS[r.room].name}
                {have ? "" : " (none yet)"} · {needs.length ? `needs ${needs.map(([n, c]) => `${c > 1 ? c : ""}${GOODS[n].glyph} ${GOODS[n].name.toLowerCase()}`).join(", ")}` : "provisions only"}
              </small>
            </span>
          </li>
        );
      })}
    </ul>
  </details>
);

const Lab = ({ g, brief }: { g: Game; brief: boolean }) => {
  const need = researchNeeded(g);
  const tools = g.spareDevices;
  return (
    <section className="card">
      <h4>{brief ? "From the laboratory, waiting" : "Laboratory"}</h4>
      {!brief && (
        <>
          <div className="bar">
            <div className="fill lab" style={{ width: `${Math.min(100, (g.research / need) * 100)}%` }} />
          </div>
          <p className="quiet">The Master's time in the laboratory becomes the next invention.</p>
        </>
      )}
      {tools.map((id) => {
        const def = DEVICES[id];
        return (
          <div key={id} className="spare">
            <span>
              {def.glyph} <b>{def.name}.</b> {def.effect}
            </span>
            {def.fits === "pack" ? (
              <i>Pack it when you send someone out.</i>
            ) : def.fits === "tool" ? (
              <div className="chips">
                {g.maids
                  .filter((m) => !m.isLord)
                  .map((m) => (
                    <button key={m.id} className="chip" onClick={() => dispatch({ kind: "install", device: id, maid: m.id })}>
                      Give to {MAID_DEFS[m.id].name}
                    </button>
                  ))}
              </div>
            ) : (
              <button className="chip" onClick={() => setUi({ installing: id })}>
                Install… then click a glowing room
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
};

const fmt = (n: number): string => Math.round(n).toLocaleString("en-US");

/** What the coming occasion would score with the larder and the postings as they are now. */
const Forecast = ({ g }: { g: Game }) => {
  const f = forecast(g, "evening");
  const now = forecast(g, "now");
  if (!f || !now || g.phase === "occasion" || (g.occasion !== null && g.occasion.done)) return null;
  const made = f.score >= f.target;
  return (
    <section className="card forecast" title="If the whole menu were served, with the household posted for the evening: the Master hosting in the biggest reception room (or wherever he already is), Evelyn and any songbird beside him. It does not ask whether there is time to carry it all.">
      <h4>{isOccasionDay(g) ? "Tonight, with the larder as it is" : "The occasion, with the larder as it is"}</h4>
      <div className="sum small">
        <span className="comfort">
          Comfort <b>{fmt(f.comfort)}</b>
        </span>
        <span className="times">×</span>
        <span className="grace">
          Grace <b>{fmt(f.grace)}</b>
        </span>
        <span className="times">×</span>
        <span className="hearthx">
          <b>{f.hearth}</b>
        </span>
      </div>
      <div className={made ? "forecast-score made" : "forecast-score"}>
        {fmt(f.score)} <span>of {fmt(f.target)}</span>
      </div>
      <p className="quiet">
        {f.kinds.length === 0 ? "Nothing on the menu." : `Menu: ${f.kinds.map((k) => GOODS[k].glyph).join(" ")} · ${f.servings} servings`}
        {f.standing > 0 ? ` · ${f.standing} guests left standing` : ""}
        {f.rooms > 0 ? ` · candles for ${f.litRooms} of ${f.rooms} rooms` : " · nowhere to seat anyone"}
      </p>
      <p className="quiet">
        {(g.occasion?.def ?? g.upcoming)?.honourFace} <i>{TWISTS[(g.occasion?.def ?? g.upcoming)?.twist ?? "none"].name}:</i> {TWISTS[(g.occasion?.def ?? g.upcoming)?.twist ?? "none"].rule}
      </p>
      <p className="quiet">
        Reckoned with the Master hosting and Evelyn beside him.{now.score !== f.score ? ` Posted exactly as they are now: ${fmt(now.score)}.` : ""} Fancies caught on the night come on top.
      </p>
    </section>
  );
};

export const Panel = () => {
  const ui = useUi();
  const g = ui.game;
  const sel = ui.selection;
  const room = sel?.kind === "room" ? g.rooms.find((r) => r.id === sel.id) : undefined;
  const maid = sel?.kind === "maid" ? g.maids.find((m) => m.id === sel.id) : undefined;
  const lines = advice(g);
  // An invention with nowhere to live yet is the first thing to deal with.
  const waiting = g.spareDevices.some((id) => DEVICES[id].fits !== "pack");
  return (
    <aside className="panel">
      {lines.length > 0 && (
        <section className="advice">
          {lines.map((a, i) => (
            <p key={i} className={a.urgent ? "urgent" : ""}>
              {a.text}
            </p>
          ))}
        </section>
      )}
      {waiting && <Lab g={g} brief />}
      <Forecast g={g} />
      {room && <RoomDetails g={g} room={room} />}
      {maid && <MaidDetails g={g} maid={maid} />}
      <Household g={g} selected={maid?.id ?? null} />
      <Stock g={g} />
      <RecipeBook g={g} />
      {!waiting && <Lab g={g} brief={false} />}
      <section className="card log">
        <h4>Day book</h4>
        {g.log
          .slice(-5)
          .reverse()
          .map((l, i) => (
            <p key={i} className={l.tone}>
              {l.text}
            </p>
          ))}
        <p className="quiet">Hearth ×{hearthLevel(g.hearth)} multiplies every occasion. It grows when the household eats together.</p>
      </section>
    </aside>
  );
};
