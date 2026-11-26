import { useState } from "react";

import { GOODS, ROOM_DEFS } from "../sim/content/house";
import { DEVICES } from "../sim/content/devices";
import { MAID_DEFS, TRAITS } from "../sim/content/people";
import { SITES, SITE_IDS } from "../sim/content/world";
import { isOccasionDay } from "../sim/flow";
import { allStock } from "../sim/house";
import { whyNotTrade } from "../sim/trade";
import { PACK_SLOTS, TRADER_SECONDS } from "../sim/tuning";
import type { Game } from "../sim/types";
import { dispatch, setUi } from "./store";

// Smaller dialogs: an invention to choose, a gift to acknowledge, an expedition to plan, and the
// card that asks — while the day runs on — whether she should press on or turn back.

export const Pending = ({ g }: { g: Game }) => {
  const p = g.pending[0];
  if (!p) return null;
  if (p.kind === "note")
    return (
      <div className="modal night">
        <div className="sheet">
          <div className="tag">Meanwhile</div>
          <h2>{p.title}</h2>
          <p className="lede">{p.text}</p>
          <button className="primary" onClick={() => dispatch({ kind: "choose", index: 0 })}>
            Go on
          </button>
        </div>
      </div>
    );
  if (p.kind === "gift")
    return (
      <div className="modal">
        <div className="sheet">
          <div className="tag">A gift</div>
          <h2>From a grateful guest</h2>
          <p className="lede">{p.text}</p>
          <button className="primary" onClick={() => dispatch({ kind: "choose", index: 0 })}>
            How kind
          </button>
        </div>
      </div>
    );
  return (
    <div className="modal">
      <div className="sheet wide">
        <div className="tag">The laboratory</div>
        <h2>The Master has something to show you</h2>
        <p className="lede">He can finish one of these. Each does one thing, and does it for good.</p>
        <div className="cards">
          {p.options.map((id, i) => {
            const def = DEVICES[id];
            const where = def.fits === "tool" ? "Carried by one maid" : def.fits === "pack" ? "Packed for expeditions" : `Installs in: ${def.fits.map((k) => ROOM_DEFS[k].name.toLowerCase()).join(", ")}`;
            const usable = typeof def.fits === "string" || def.fits.some((k) => g.rooms.some((r) => r.kind === k));
            return (
              <div key={id} className="offer">
                <div className="tag">Invention</div>
                <h3>
                  {def.glyph} {def.name}
                </h3>
                <p className="rule">{def.effect}</p>
                <p className="quiet">
                  {where}
                  {usable ? "" : " — the house has no such room yet"}
                </p>
                <button className="primary" onClick={() => dispatch({ kind: "choose", index: i })}>
                  This one
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const ExpeditionPlanner = ({ g, onClose }: { g: Game; onClose: () => void }) => {
  const scouts = g.maids.filter((m) => !m.isLord && !m.away);
  const [maid, setMaid] = useState(scouts.find((m) => m.id === "hazel")?.id ?? scouts[scouts.length - 1]?.id ?? "");
  const [site, setSite] = useState(SITE_IDS[0]);
  const [pack, setPack] = useState<string[]>([]);
  const stock = allStock(g);
  const rations = Object.keys(GOODS).filter((id) => GOODS[id].pole === "comfort" && (stock[id] ?? 0) > 0);
  const gear = g.spareDevices.filter((id) => DEVICES[id].fits === "pack");
  const toggle = (id: string): void => setPack(pack.includes(id) ? pack.filter((x) => x !== id) : pack.length < PACK_SLOTS ? [...pack, id] : pack);
  const def = SITES[site];
  return (
    <div className="modal">
      <div className="sheet wide">
        <div className="tag">An errand out of doors</div>
        <h2>Send someone out</h2>
        <p className="lede">She is gone from the house while she is out. At each step you choose: press on for more, at a risk you are shown first, or turn back with what she has.</p>
        {isOccasionDay(g) && <p className="warn">The occasion is tonight. Whoever goes will be back by nightfall, but not before.</p>}
        <h4>Who</h4>
        <div className="chips">
          {scouts.map((m) => (
            <button key={m.id} className={maid === m.id ? "chip on" : "chip"} onClick={() => setMaid(m.id)} title={TRAITS[MAID_DEFS[m.id].trait].effect}>
              {MAID_DEFS[m.id].name}
              {m.hurtDays > 0 ? " 🩹" : ""}
            </button>
          ))}
        </div>
        <h4>Where</h4>
        <div className="cards three">
          {SITE_IDS.map((id) => {
            const s = SITES[id];
            const finds = [...new Set(s.depths.flatMap((d) => d.loot.map((l) => l[0])))];
            return (
              <div key={id} className={site === id ? "offer picked" : "offer"} onClick={() => setSite(id)}>
                <h3>
                  {s.glyph} {s.name}
                </h3>
                <p className="rule">{s.blurb}</p>
                <p>Finds: {finds.map((f) => `${GOODS[f].glyph} ${GOODS[f].name.toLowerCase()}`).join(", ")}</p>
                <p className="quiet">
                  {s.depths.length} steps deep
                  {s.key ? ` · ${DEVICES[s.key].name.toLowerCase()} halves the danger` : ""}
                </p>
              </div>
            );
          })}
        </div>
        <h4>
          In her pack ({pack.length}/{PACK_SLOTS})
        </h4>
        <div className="chips">
          {rations.map((id) => (
            <button key={id} className={pack.includes(id) ? "chip on" : "chip"} onClick={() => toggle(id)} title="A ration: eaten to shrug off one mishap.">
              {GOODS[id].glyph} {GOODS[id].name} <span className="needs">ration</span>
            </button>
          ))}
          {gear.map((id) => (
            <button key={id} className={pack.includes(id) ? "chip on" : "chip"} onClick={() => toggle(id)} title={DEVICES[id].effect}>
              {DEVICES[id].glyph} {DEVICES[id].name}
            </button>
          ))}
          {rations.length + gear.length === 0 && <span className="quiet">Nothing to pack. Kept food makes a ration: it is eaten to shrug off one mishap.</span>}
        </div>
        <div className="row">
          <button onClick={onClose}>Not today</button>
          <button
            className="primary"
            disabled={!maid}
            onClick={() => {
              dispatch({ kind: "expedition", maid, site, pack });
              onClose();
            }}
          >
            Send {maid ? MAID_DEFS[maid].name : "someone"} to {def.name.toLowerCase()}
          </button>
        </div>
      </div>
    </div>
  );
};

export const TraderCard = ({ g }: { g: Game }) => {
  const t = g.trader;
  if (!t) return null;
  const why = whyNotTrade(g);
  return (
    <div className="trader">
      <div className="head">
        <span className="face">{t.face}</span> <b>At the door</b>
      </div>
      <p>{t.text}</p>
      <div className="row">
        <button onClick={() => dispatch({ kind: "dismiss" })}>Not today</button>
        <button className="primary" disabled={why !== null} onClick={() => dispatch({ kind: "trade" })} title={why ?? ""}>
          {t.cost >= 0 ? `Buy · 🪙 ${t.cost}` : `Sell · 🪙 +${-t.cost}`}
        </button>
      </div>
      {why && <p className="quiet">{why[0].toUpperCase() + why.slice(1)}.</p>}
      <div className="timer" style={{ width: `${(t.left / TRADER_SECONDS) * 100}%` }} />
    </div>
  );
};

export const ExpeditionCard = ({ g }: { g: Game }) => {
  const exp = g.expedition;
  if (!exp) return null;
  const site = SITES[exp.site];
  const name = MAID_DEFS[exp.maid].name;
  const haul = Object.entries(exp.haul)
    .map(([good, n]) => `${n} ${GOODS[good].glyph}`)
    .join("  ");
  const deciding = exp.state === "deciding";
  const stateText = { travelling: "on her way", deciding: "waiting for word", pressing: "pressing on…", returning: "coming home", home: exp.hurt ? "home, hurt" : "home" }[exp.state];
  return (
    <div className={deciding ? "expedition deciding" : "expedition"}>
      <div className="head">
        {site.glyph} <b>{name}</b> · {site.name} · <i>{stateText}</i>
      </div>
      {exp.log.slice(-2).map((l, i) => (
        <p key={i}>{l}</p>
      ))}
      {haul && <p className="haul">In her basket: {haul}</p>}
      {exp.pack.length > 0 && <p className="quiet">Pack: {exp.pack.map((id) => GOODS[id]?.glyph ?? DEVICES[id]?.glyph).join(" ")}</p>}
      {deciding && (
        <div className="row">
          <button onClick={() => dispatch({ kind: "turnBack" })}>Turn back</button>
          <button className="primary" onClick={() => dispatch({ kind: "press" })}>
            Press on · {Math.round(exp.nextRisk * 100)}% danger
          </button>
        </div>
      )}
      {deciding && <div className="timer" style={{ width: `${(exp.timer / 20) * 100}%` }} />}
      {exp.state === "home" && (
        <button className="link" onClick={() => setUi({ selection: { kind: "maid", id: exp.maid } })}>
          {name} is back in the hall
        </button>
      )}
    </div>
  );
};
